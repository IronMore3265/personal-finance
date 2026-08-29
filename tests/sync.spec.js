// Cloud sync, exercised without touching the real Supabase project.
//
// Two halves:
//   - the outbox, which is pure local behaviour and is what makes the app
//     local-first: a write must complete, and be queued, with no network at all
//   - the push/pull cycle, run against a stubbed fetch so the request shapes
//     and the conflict rule can be asserted deterministically
//
// The live project is checked separately - see the round trip at the bottom,
// which is skipped unless PAISA_TEST_EMAIL is set.

import { test, expect } from './fixtures.js';

/* ---------------- offline behaviour ---------------- */

test.describe('the outbox', () => {
  test('a write completes and queues while signed out', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await app.keys(['5', '0', '0']);
    await page.locator('[data-testid="savebtn"]').click();

    const db = await app.db();
    expect(db.txns.some(t => t.amount === 500)).toBe(true);

    const queued = db.outbox.filter(e => e.tbl === 'transactions');
    expect(queued).toHaveLength(1);
    expect(queued[0].op).toBe('upsert');
    expect(queued[0].payload.amount).toBe(500);
  });

  test('deleting queues tombstones for the row and its items', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await page.locator('[data-testid="itemadd"]').click();
    await app.keys(['3', '0', '0']);
    await page.locator('[data-testid="savebtn"]').click();

    const id = (await app.db()).txns.find(t => t.id.startsWith('m')).id;
    await page.evaluate(i => window.__paisa.deleteTxn(i), id);

    const outbox = (await app.db()).outbox;
    expect(outbox.some(e => e.tbl === 'transactions' && e.op === 'delete' && e.key === id))
      .toBe(true);
    // A hard delete would vanish; the other device has to be told.
    expect(outbox.some(e => e.tbl === 'txn_items' && e.op === 'delete')).toBe(true);
  });

  test('per-device sync bookkeeping is never queued', async ({ app, page }) => {
    await app.open();
    await page.evaluate(async () => {
      await window.__paisa.constructor.name; // no-op, keeps the eval typed
    });
    await page.evaluate(() => window.__paisa.toggleDark());

    const outbox = (await app.db()).outbox;
    expect(outbox.some(e => e.tbl === 'settings' && e.key === 'dark')).toBe(true);
    expect(outbox.some(e => String(e.key).startsWith('sync.'))).toBe(false);
  });

  test('an offline write is indistinguishable from an online one', async ({ app, page }) => {
    // Every network call fails; the ledger must not notice.
    await page.route('**://*.supabase.co/**', route => route.abort());
    await app.open();

    await app.openFilledSheet();
    await app.keys(['1', '2', '3']);
    await page.locator('[data-testid="savebtn"]').click();

    await expect(page.locator('[data-testid="toast"]')).toContainText('saved');
    expect((await app.db()).txns.some(t => t.amount === 123)).toBe(true);
  });
});

/* ---------------- push and pull ---------------- */

/**
 * Sign the app in against a stubbed Supabase and capture every request.
 *
 * The stub answers auth and PostgREST with the shapes the real service uses,
 * so the client's headers, upsert keys and cursor handling are all exercised.
 */
async function stubSupabase(page, { rows = {} } = {}) {
  const calls = [];
  await page.exposeFunction('__record', (entry) => { calls.push(entry); });

  await page.route('**://*.supabase.co/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const body = req.postData();

    await page.evaluate(
      (e) => window.__record(e),
      { method: req.method(), path: url.pathname, search: url.search, body }
    );

    if (url.pathname.startsWith('/auth/v1/token')
      || url.pathname.startsWith('/auth/v1/signup')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'stub-access', refresh_token: 'stub-refresh', expires_in: 3600,
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'a@b.co' }
        })
      });
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      const table = url.pathname.split('/rest/v1/')[1];
      if (req.method() === 'GET') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(rows[table] || [])
        });
      }
      return route.fulfill({ status: 201, body: '' });
    }
    return route.fulfill({ status: 200, body: '{}' });
  });

  return calls;
}

const signIn = (page) => page.evaluate(async () => {
  const { supabase } = await import('/js/data/supabase.js');
  await supabase.signIn('a@b.co', 'password');
});

const runSync = (page) => page.evaluate(() => window.__paisa.syncNow());

test.describe('push', () => {
  test('the first sync uploads the whole existing ledger', async ({ app, page }) => {
    const calls = await stubSupabase(page);
    await app.open();
    await signIn(page);
    await runSync(page);

    const posts = calls.filter(c => c.method === 'POST' && c.path.includes('/rest/v1/'));
    const txnPost = posts.find(c => c.path.endsWith('/transactions'));
    expect(txnPost, 'the seeded ledger should be pushed').toBeTruthy();

    // The composite key is what makes two users able to hold the same local id.
    expect(txnPost.search).toContain('on_conflict=user_id,id');

    const sent = JSON.parse(txnPost.body);
    expect(sent.length).toBeGreaterThanOrEqual(16);
    expect(sent[0].user_id).toBe('00000000-0000-4000-8000-000000000001');
  });

  test('the bootstrap does not repeat on the next sync', async ({ app, page }) => {
    const calls = await stubSupabase(page);
    await app.open();
    await signIn(page);
    await runSync(page);

    const first = calls.filter(c => c.method === 'POST' && c.path.endsWith('/transactions')).length;
    calls.length = 0;
    await runSync(page);
    const second = calls.filter(c => c.method === 'POST' && c.path.endsWith('/transactions')).length;

    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  test('repeated edits to one row collapse into a single upsert', async ({ app, page }) => {
    const calls = await stubSupabase(page);
    await app.open();
    await signIn(page);
    await runSync(page);          // clear the bootstrap
    calls.length = 0;

    await page.evaluate(async () => {
      const s = window.__paisa;
      const t = s.db.txns[0];
      for (const amount of [10, 20, 30]) await s.updateTxn({ ...t, amount }, []);
    });
    await runSync(page);

    const post = calls.find(c => c.method === 'POST' && c.path.endsWith('/transactions'));
    const sent = JSON.parse(post.body);
    expect(sent).toHaveLength(1);
    expect(sent[0].amount).toBe(30);          // the last one wins
  });

  test('server-owned columns are never pushed back', async ({ app, page }) => {
    const calls = await stubSupabase(page);
    await app.open();
    await signIn(page);
    await runSync(page);

    const post = calls.find(c => c.method === 'POST' && c.path.endsWith('/accounts'));
    const sent = JSON.parse(post.body);
    expect(sent[0]).not.toHaveProperty('updated_at');
    expect(sent[0].deleted).toBe(false);
  });
});

test.describe('pull', () => {
  test('a remote row lands in the local ledger', async ({ app, page }) => {
    await stubSupabase(page, {
      rows: {
        transactions: [{
          user_id: '00000000-0000-4000-8000-000000000001',
          id: 'remote1', account: 'a2', type: 'expense', cat: 'c1',
          amount: 4242, currency: 'BDT', rate: 1, date: '2026-08-20',
          note: 'From the other phone', source: 'manual',
          updated_at: '2026-08-28T09:00:00Z', deleted: false
        }]
      }
    });
    await app.open();
    await signIn(page);
    await runSync(page);

    expect((await app.db()).txns.some(t => t.id === 'remote1')).toBe(true);

    // And it is actually on screen, not just in storage.
    await app.goto('txns');
    await expect(page.locator('[data-testid="row"]', { hasText: 'From the other phone' }).first())
      .toBeVisible();
  });

  test('a remote tombstone removes the local row', async ({ app, page }) => {
    await stubSupabase(page, {
      rows: {
        transactions: [{
          user_id: '00000000-0000-4000-8000-000000000001',
          id: 't1', updated_at: '2026-08-28T09:00:00Z', deleted: true
        }]
      }
    });
    await app.open();
    expect((await app.db()).txns.some(t => t.id === 't1')).toBe(true);

    await signIn(page);
    await runSync(page);
    expect((await app.db()).txns.some(t => t.id === 't1')).toBe(false);
  });

  test('an unsent local edit is not overwritten by a stale server copy',
    async ({ app, page }) => {
      // The row is queued locally and also present remotely. The local one is
      // newer by definition - it has not been pushed yet - so it must survive.
      await stubSupabase(page, {
        rows: {
          transactions: [{
            user_id: '00000000-0000-4000-8000-000000000001',
            id: 't1', account: 'a2', type: 'expense', cat: 'c1',
            amount: 999999, currency: 'BDT', rate: 1, date: '2026-08-01',
            note: 'stale', source: 'manual',
            updated_at: '2026-08-28T09:00:00Z', deleted: false
          }]
        }
      });
      await app.open();

      // Queue an edit, then make the push fail so it stays queued.
      await page.evaluate(async () => {
        const s = window.__paisa;
        const t = s.db.txns.find(x => x.id === 't1');
        await s.updateTxn({ ...t, amount: 777 }, []);
      });
      await signIn(page);
      await page.route('**://*.supabase.co/rest/v1/transactions?on_conflict**',
        route => route.fulfill({ status: 500, body: 'nope' }));
      await runSync(page);
      app.tolerate(/supabase 500|sync failed|Failed to load resource/);

      const t1 = (await app.db()).txns.find(t => t.id === 't1');
      expect(t1.amount).toBe(777);
      expect(t1.amount).not.toBe(999999);
    });

  test('the cursor advances so the next pull asks only for new rows',
    async ({ app, page }) => {
      const calls = await stubSupabase(page, {
        rows: {
          transactions: [{
            user_id: '00000000-0000-4000-8000-000000000001',
            id: 'remote1', account: 'a2', type: 'expense', cat: 'c1',
            amount: 5, currency: 'BDT', rate: 1, date: '2026-08-20',
            note: 'x', source: 'manual',
            updated_at: '2026-08-28T09:00:00Z', deleted: false
          }]
        }
      });
      await app.open();
      await signIn(page);
      await runSync(page);

      expect((await app.db()).settings['sync.cursor']).toBe('2026-08-28T09:00:00Z');

      calls.length = 0;
      await runSync(page);
      const get = calls.find(c => c.method === 'GET' && c.path.endsWith('/transactions'));
      expect(decodeURIComponent(get.search)).toContain('updated_at=gt.2026-08-28T09:00:00Z');
    });
});

test.describe('signing out', () => {
  test('keeps the ledger and clears the sync state', async ({ app, page }) => {
    await stubSupabase(page);
    await app.open();
    await signIn(page);
    await runSync(page);

    const before = (await app.db()).txns.length;

    await page.evaluate(async () => {
      const { supabase } = await import('/js/data/supabase.js');
      const { sync } = await import('/js/data/sync.js');
      await supabase.signOut();
      await sync.reset();
    });

    const db = await app.db();
    expect(db.txns).toHaveLength(before);
    expect(db.settings['sync.bootstrapped']).toBe('false');
  });
});
