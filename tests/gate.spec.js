// The two things that can stand in front of the ledger, and the money setting
// that changes every number behind them.
//
// The biometric plugin does not exist in a browser, so core/lock.js answers
// "unavailable" here and the app lock cannot be driven end to end from this
// suite - that part is checked on a device. What is testable, and what this
// file covers, is everything around it: that the gate is drawn and dismissed
// correctly, that Remember me keeps the address and never the password, and
// that the reset pane is honest about what it cannot do without a session.

import { test, expect } from './fixtures.js';

const EMAIL_KEY = 'paisa.auth.email';
const SKIP_KEY = 'paisa.auth.skipped';

const ls = (page, key) => page.evaluate(k => window.localStorage.getItem(k), key);

/** Answer Supabase's auth endpoints without touching the real project. */
async function stubAuth(page, { fail = false } = {}) {
  await page.route('**://*.supabase.co/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/auth/v1/')) {
      if (fail) {
        return route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({ error_description: 'Invalid login credentials' })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'stub-access', refresh_token: 'stub-refresh', expires_in: 3600,
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'a@b.co' }
        })
      });
    }
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return route.fulfill({ status: 201, body: '' });
  });
}

test.describe('the sign-in gate', () => {
  test('a first run is met by it, and it covers the whole shell', async ({ app, page }) => {
    await app.openAtGate();

    await expect(page.locator('[data-testid="auth-skip"]')).toBeVisible();

    // The point of a gate: the nav bar and the header behind it are not
    // reachable, so it cannot say which tab you were on or what you are worth.
    const gate = await page.locator('#gate').boundingBox();
    const shell = await page.locator('#app').boundingBox();
    expect(gate.width).toBeCloseTo(shell.width, 0);
    expect(gate.height).toBeCloseTo(shell.height, 0);
  });

  test('continuing without an account is remembered', async ({ app, page }) => {
    await app.openAtGate();
    await page.locator('[data-testid="auth-skip"]').click();

    await expect(page.locator('#gate')).toBeEmpty();
    await expect(page.locator('#scroll')).not.toBeEmpty();
    expect(await ls(page, SKIP_KEY)).toBe('1');

    // And it does not ask again.
    await page.reload();
    await page.waitForSelector('#boot[data-gone="1"]', { state: 'attached' });
    await expect(page.locator('#gate')).toBeEmpty();
  });

  test('nothing behind the gate can be touched', async ({ app, page }) => {
    await app.openAtGate();

    // The shell is built behind it - that is deliberate, so dismissing the
    // gate reveals a finished screen rather than a blank one. What matters is
    // that the gate is what any tap actually lands on.
    const onTop = await page.evaluate(() => {
      const r = document.getElementById('app').getBoundingClientRect();
      const probes = [
        [r.left + r.width / 2, r.top + r.height * 0.5],   // the ledger
        [r.left + r.width / 2, r.bottom - 30],            // the nav bar
        [r.left + r.width / 2, r.top + 30]                // the header
      ];
      const gate = document.getElementById('gate');
      return probes.map(([x, y]) => gate.contains(document.elementFromPoint(x, y)));
    });
    expect(onTop).toEqual([true, true, true]);
  });

  test('a failed sign-in says so and leaves the gate up', async ({ app, page }) => {
    await stubAuth(page, { fail: true });
    // The 400 is the point of the test; the browser logs it either way.
    app.tolerate(/status of 400/);
    await app.openAtGate();

    await page.locator('#auth-email').fill('a@b.co');
    await page.locator('#auth-password').fill('wrongpassword');
    await page.locator('[data-testid="savebtn"]').click();

    await expect(page.locator('#gate')).toContainText('Invalid login credentials');
    await expect(page.locator('[data-testid="auth-skip"]')).toBeVisible();
  });

  /**
   * The first upload must not sit behind the app-lock prompt.
   *
   * Ordering these the other way round looked harmless and was not. The
   * biometric prompt is a blocking system dialog, so on a device the account
   * was created with every table still empty, and the rows only appeared once
   * the prompt was dismissed - walk away from it and the ledger stays
   * unbacked-up until the next launch.
   *
   * There is no sensor in a browser, so the prompt never appears here and the
   * ordering cannot be reproduced directly. What is checkable is the promise
   * shape that makes it safe: the push is in flight before submit() awaits
   * anything that could block.
   */
  test('the first upload does not wait on the app-lock prompt',
    async ({ app, page }) => {
      await stubAuth(page);
      await app.openAtGate();

      // Hold the lock prompt open for as long as a distracted user would.
      await page.evaluate(() => {
        window.__lockHeld = true;
        window.Capacitor = window.Capacitor || {};
        window.Capacitor.Plugins = window.Capacitor.Plugins || {};
        window.Capacitor.Plugins.NativeBiometric = {
          isAvailable: async () => ({ isAvailable: true }),
          verifyIdentity: () => new Promise(res => { window.__releaseLock = res; })
        };
        window.__paisa.ui.lockAvailable = true;
      });

      await page.locator('#auth-email').fill('a@b.co');
      await page.locator('#auth-password').fill('hunter2hunter2');
      await page.locator('[data-testid="savebtn"]').click();

      // The prompt is still open, and the ledger has already gone up: the
      // bootstrap queued every local row and the push has drained them.
      await expect.poll(
        async () => ((await app.db()).outbox || []).length,
        { timeout: 8000 }
      ).toBe(0);
      await expect.poll(
        async () => (await app.db()).settings['sync.bootstrapped']
      ).toBe('true');

      await page.evaluate(() => window.__releaseLock && window.__releaseLock());
    });
});

test.describe('remember me', () => {
  test('keeps the email and never the password', async ({ app, page }) => {
    await stubAuth(page);
    await app.openAtGate();

    await page.locator('#auth-email').fill('keep@example.com');
    await page.locator('#auth-password').fill('hunter2hunter2');
    await page.locator('[data-testid="savebtn"]').click();
    await expect(page.locator('#gate')).toBeEmpty();

    expect(await ls(page, EMAIL_KEY)).toBe('keep@example.com');

    // The whole of the promise on the tick: the password is nowhere in
    // storage, under any key, in any form.
    const everything = await page.evaluate(() => {
      let out = '';
      for (let i = 0; i < localStorage.length; i++) {
        out += localStorage.key(i) + '=' + localStorage.getItem(localStorage.key(i)) + '\n';
      }
      return out;
    });
    expect(everything).not.toContain('hunter2hunter2');
  });

  test('unticked, it forgets the address', async ({ app, page }) => {
    await stubAuth(page);
    await app.openAtGate();

    await page.locator('[data-testid="remember"]').click();
    await page.locator('#auth-email').fill('forget@example.com');
    await page.locator('#auth-password').fill('hunter2hunter2');
    await page.locator('[data-testid="savebtn"]').click();
    await expect(page.locator('#gate')).toBeEmpty();

    expect(await ls(page, EMAIL_KEY)).toBeNull();
  });

  test('a remembered address is filled in next time, the password is not',
    async ({ app, page }) => {
      await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v),
        [EMAIL_KEY, 'back@example.com']);
      await app.openAtGate();

      await expect(page.locator('#auth-email')).toHaveValue('back@example.com');
      await expect(page.locator('#auth-password')).toHaveValue('');
    });
});

test.describe('forgotten password', () => {
  /**
   * The honest half of the biometric reset.
   *
   * A fingerprint proves who is holding the phone, not who owns the account,
   * so it can only re-authorise a session the device already has. Signed out -
   * or in a browser, where there is no sensor at all - there is nothing to
   * re-authorise, and the screen has to say so rather than offer a button that
   * cannot work.
   */
  test('with no session it explains itself instead of offering a dead button',
    async ({ app, page }) => {
      await app.openAtGate();
      await page.locator('[data-testid="auth-forgot"]').click();

      await expect(page.locator('#gate')).toContainText('still signed in');
      await expect(page.locator('#gate [data-testid="savebtn"]')).toHaveCount(0);

      await page.locator('[data-testid="auth-back"]').click();
      await expect(page.locator('[data-testid="auth-signin"]')).toBeVisible();
    });
});

test.describe('home currency', () => {
  const totals = (page) => page.evaluate(() => ({
    worth: window.__paisa.netWorth(),
    home: window.__paisa.homeCurrency,
    rate: window.__paisa.rates.USD
  }));

  test('switching to USD divides every total by the rate', async ({ app, page }) => {
    await app.open();
    const before = await totals(page);
    expect(before.home).toBe('BDT');

    await page.evaluate(() => window.__paisa.setHomeCurrency('USD'));
    const after = await totals(page);

    expect(after.home).toBe('USD');
    // Same money, read in a different unit.
    expect(after.worth).toBeCloseTo(before.worth / before.rate, 4);
  });

  test('the symbol on screen follows it', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await expect(page.locator('[data-testid="activity-list"]')).toContainText('৳');

    await page.evaluate(() => window.__paisa.setHomeCurrency('USD'));
    await expect(page.locator('[data-testid="activity-list"]')).toContainText('$');
  });

  test('it survives a restart', async ({ app, page }) => {
    await app.open();
    await page.evaluate(() => window.__paisa.setHomeCurrency('USD'));
    await expect.poll(() => app.db().then(d => d.settings.homeCurrency)).toBe('USD');

    await page.reload();
    await page.waitForSelector('#boot[data-gone="1"]', { state: 'attached' });
    expect((await totals(page)).home).toBe('USD');
  });

  test('a rate set by hand is kept, and a background fetch does not displace it',
    async ({ app, page }) => {
      await app.open();
      await page.evaluate(() => window.__paisa.setRate(150, true));
      expect((await totals(page)).rate).toBe(150);

      // A background refresh defers to it; only an explicit one wins.
      await page.route('**open.er-api.com**', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ rates: { BDT: 111 } })
      }));
      await page.evaluate(async () => {
        const { refreshRate } = await import('/js/data/fx.js');
        await refreshRate(window.__paisa, false);
      });
      expect((await totals(page)).rate).toBe(150);

      await page.evaluate(async () => {
        const { refreshRate } = await import('/js/data/fx.js');
        await refreshRate(window.__paisa, true);
      });
      expect((await totals(page)).rate).toBe(111);
    });

  test('a junk rate is refused rather than applied', async ({ app, page }) => {
    await app.open();
    const before = (await totals(page)).rate;

    for (const body of ['{}', '{"rates":{"BDT":0}}', '{"rates":{"BDT":99999}}', 'not json']) {
      await page.route('**open.er-api.com**', route =>
        route.fulfill({ status: 200, contentType: 'application/json', body }));
      await page.evaluate(async () => {
        const { refreshRate } = await import('/js/data/fx.js');
        await refreshRate(window.__paisa, true);
      });
      await page.unroute('**open.er-api.com**');
    }

    expect((await totals(page)).rate).toBe(before);
  });

  test('being offline leaves the last known rate in force', async ({ app, page }) => {
    // Aborting the request is the point of the test; the browser logs it.
    app.tolerate(/ERR_FAILED/);
    await app.open();
    await page.evaluate(() => window.__paisa.setRate(140, false));

    await page.route('**open.er-api.com**', route => route.abort());
    const got = await page.evaluate(async () => {
      const { refreshRate } = await import('/js/data/fx.js');
      return refreshRate(window.__paisa, true);
    });

    expect(got).toBeNull();
    expect((await totals(page)).rate).toBe(140);
  });
});
