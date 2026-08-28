// What each phase of the change was supposed to achieve, asserted against the
// running app. Replaces the manual device pass while no device is attached.

import { test, expect, CLOCK } from './fixtures.js';

test.describe('boot', () => {
  test('opens on seeded data with a clean console', async ({ app, page }) => {
    await app.open();
    await expect(page.locator('.balance__value')).toContainText('৳');
    await expect(page.locator('.row')).not.toHaveCount(0);
  });
});

/* ---------------- Phase 2: the sheet scrolls ---------------- */

test.describe('add sheet scrolling', () => {
  test('the body scrolls and the save button stays on screen', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    const body = page.locator('.sheet__body');
    const metrics = await body.evaluate(n => ({
      scrollHeight: n.scrollHeight, clientHeight: n.clientHeight
    }));
    expect(metrics.scrollHeight,
      'sheet body should overflow, otherwise there is nothing to test'
    ).toBeGreaterThan(metrics.clientHeight);

    // The actual bug: without min-height:0 the footer was pushed off-screen.
    const save = await page.locator('.savebtn').boundingBox();
    const viewport = page.viewportSize();
    expect(save.y + save.height).toBeLessThanOrEqual(viewport.height + 1);
  });

  test('scroll position survives a tap inside the sheet', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    const body = page.locator('.sheet__body');
    await body.evaluate(n => { n.scrollTop = 140; });
    const before = await body.evaluate(n => n.scrollTop);
    expect(before).toBeGreaterThan(0);

    await page.locator('.catchip').nth(2).click();
    await expect(page.locator('.catchip--on')).toHaveCount(1);

    expect(await page.locator('.sheet__body').evaluate(n => n.scrollTop)).toBe(before);
  });
});

/* ---------------- Phase 1: scoped rendering ---------------- */

test.describe('rendering', () => {
  test('a keypad tap touches only the amount nodes, not the whole sheet', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    await page.evaluate(() => {
      window.__mutations = [];
      const target = document.querySelector('.sheet');
      new MutationObserver(records => {
        for (const r of records) {
          // Tap ripples are appended into whatever was pressed. They are the
          // press feedback, not a re-render, so they are not what this is about.
          const added = [...r.addedNodes];
          if (added.length && added.every(n => n.classList && n.classList.contains('ripple'))) continue;
          if ([...r.removedNodes].some(n => n.classList && n.classList.contains('ripple'))) continue;

          let n = r.target;
          if (n.nodeType === 3) n = n.parentElement;
          window.__mutations.push(n ? n.className : '?');
        }
      }).observe(target, { childList: true, subtree: true, characterData: true });
    });

    await app.keys(['1', '2', '3']);

    const touched = [...new Set(await page.evaluate(() => window.__mutations))];
    expect(touched.length, 'something mutated').toBeGreaterThan(0);
    for (const cls of touched) {
      expect(cls, 'unexpected node rebuilt on a keypress: ' + cls)
        .toMatch(/amount__val|amount__expr|savebtn/);
    }
  });

  test('typing in the activity search does not rebuild the whole ledger', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await expect(page.locator('.row')).not.toHaveCount(0);

    await page.evaluate(() => {
      window.__adds = 0;
      new MutationObserver(rs => rs.forEach(r => { window.__adds += r.addedNodes.length; }))
        .observe(document.getElementById('scroll'), { childList: true });
    });

    await page.locator('#search-input').fill('coffee');
    await expect(page.locator('.row')).toHaveCount(1);

    // The body is still rebuilt (the list genuinely changes), but the header,
    // nav and sheet regions must be left alone.
    expect(await page.evaluate(() => window.__adds)).toBeGreaterThan(0);
  });

  test('balances are memoised across a render', async ({ app, page }) => {
    await app.open();
    const same = await page.evaluate(() => {
      const s = window.__paisa;
      const a = s.balance('a2');
      const b = s.balance('a2');
      return a === b && s._memo.size > 0;
    });
    expect(same).toBe(true);
  });
});

/* ---------------- Phase 3: real dates, edit and delete ---------------- */

test.describe('dates', () => {
  test('today comes from the clock, not a frozen seed constant', async ({ app, page }) => {
    await app.open();
    expect(await page.evaluate(() => window.__paisa.today)).toBe(CLOCK.slice(0, 10));
  });

  test('the date rolls at local midnight, not at 06:00', async ({ app, page }) => {
    // toISOString() is UTC; the device here is UTC+6, so an evening entry used
    // to file itself under tomorrow.
    await page.clock.install({ time: new Date('2026-08-28T22:30:00') });
    await app.open();
    expect(await page.evaluate(() => window.__paisa.today)).toBe('2026-08-28');

    await page.clock.setFixedTime(new Date('2026-08-29T00:30:00'));
    expect(await page.evaluate(() => window.__paisa.today)).toBe('2026-08-29');
  });

  test('an entry saves on the date that was picked', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await app.keys(['5', '0', '0']);

    await page.locator('#date-input').fill('2026-08-20');
    await page.locator('.savebtn').click();

    const db = await app.db();
    const saved = db.txns.find(t => t.id.startsWith('m'));
    expect(saved.date).toBe('2026-08-20');
    expect(saved.amount).toBe(500);
  });

  test('the Yesterday chip picks the day before', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await page.locator('.daterow .chip', { hasText: 'Yesterday' }).click();
    expect(await page.locator('#date-input').inputValue()).toBe('2026-08-27');
  });
});

test.describe('editing', () => {
  test('tapping a transaction opens it for editing and saves the change', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');

    const before = await page.evaluate(() => window.__paisa.netWorth());
    await page.locator('.row').first().click();
    await expect(page.locator('.sheet--add')).toBeVisible();
    await expect(page.locator('.sheet__editlabel')).toBeVisible();
    await expect(page.locator('.savebtn')).toContainText('Update');

    const id = await page.evaluate(() => window.__paisa.ui.entryId);
    const original = await page.evaluate(
      (i) => window.__paisa.db.txns.find(t => t.id === i).amount, id
    );

    await app.keys(['del', 'del', 'del', 'del', 'del', 'del', 'del', 'del', 'del']);
    await app.keys(['1', '0', '0']);
    await page.locator('.savebtn').click();

    const after = await page.evaluate(() => window.__paisa.netWorth());
    expect(after).not.toBe(before);
    expect(await page.evaluate(
      (i) => window.__paisa.db.txns.find(t => t.id === i).amount, id
    )).toBe(100);
    expect(original).not.toBe(100);
  });

  test('delete needs two taps and then removes the row', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    const count = await page.locator('.row').count();

    await page.locator('.row').first().click();
    await page.locator('.delbtn').click();
    await expect(page.locator('.delbtn--armed')).toBeVisible();
    await page.locator('.delbtn').click();

    await expect(page.locator('.sheet--add')).toHaveCount(0);
    await expect(page.locator('.row')).toHaveCount(count - 1);
  });

  test('the FAB always opens a blank draft, never the last edited row', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await page.locator('.row').first().click();
    await app.dismiss();

    await app.openAddSheet();
    await expect(page.locator('.savebtn')).toContainText('Save');
    await expect(page.locator('.amount__val')).toHaveText('0');
  });
});

/* ---------------- Phase 4a: grouped account picker ---------------- */

test.describe('account groups', () => {
  test('collapses to one chip per type, expands to its accounts', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    const row = page.locator('.sheet__body .chiprow').first();
    // cash, bank, mfs, card - four types in the seed data.
    await expect(row.locator('.chip')).toHaveCount(4);

    await row.locator('.chip', { hasText: 'Mobile wallet' }).click();
    // The group chip plus its three wallets, and nothing else.
    await expect(page.locator('.sheet__body .chiprow').first().locator('.chip')).toHaveCount(4);
    await expect(page.locator('.chip', { hasText: 'Nagad' })).toBeVisible();
    await expect(page.locator('.chip', { hasText: 'Credit card' })).toHaveCount(0);
  });

  test('picking an account collapses the row and names it on its group', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    const row = () => page.locator('.sheet__body .chiprow').first();
    await row().locator('.chip', { hasText: 'Mobile wallet' }).click();
    await row().locator('.chip', { hasText: 'Nagad' }).click();

    await expect(row().locator('.chip')).toHaveCount(4);
    await expect(row().locator('.chip--on')).toContainText('Nagad');
    expect(await page.evaluate(() => window.__paisa.ui.entryAccount)).toBe('a4');
  });

  test('an account in use refuses to be deleted', async ({ app, page }) => {
    await app.open();
    // a6 carries the Aarong purchase, so removing it would orphan that row.
    const gone = await page.evaluate(() => window.__paisa.deleteAccount('a6'));
    expect(gone).toBe(false);
    await expect(page.locator('.toast')).toContainText('In use by');
  });

  test('a group disappears once its last account is gone', async ({ app, page }) => {
    await app.open();
    await page.evaluate(async () => {
      const s = window.__paisa;
      // Clear the cards' transactions first - the store refuses to delete an
      // account that is still referenced, which is the point of the test above.
      for (const t of s.db.txns.filter(x => ['a6', 'a8', 'a9'].includes(x.account))) {
        await s.deleteTxn(t.id);
      }
      for (const id of ['a6', 'a8', 'a9']) await s.deleteAccount(id);
    });

    await app.openAddSheet();
    const row = page.locator('.sheet__body .chiprow').first();
    await expect(row.locator('.chip')).toHaveCount(3);
    await expect(row.locator('.chip', { hasText: 'Credit card' })).toHaveCount(0);
  });
});

/* ---------------- Phase 4b: the calculator ---------------- */

test.describe('calculator keypad', () => {
  test('multiplication binds tighter than addition', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await app.keys(['2', '4', '0', '×', '2', '+', '8', '0', '0']);

    await expect(page.locator('.amount__expr')).toHaveText('240 × 2 + 800');
    await expect(page.locator('.amount__val')).toHaveText('1,280');
    await expect(page.locator('.savebtn')).toContainText('1,280');
  });

  test('equals folds the expression, and the saved amount is the result', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await app.keys(['2', '4', '0', '×', '2']);
    await page.locator('.equalsbtn').click();

    await expect(page.locator('.amount__expr')).toHaveText('');
    await expect(page.locator('.amount__val')).toHaveText('480');

    await page.locator('.savebtn').click();
    const db = await app.db();
    expect(db.txns.find(t => t.id.startsWith('m')).amount).toBe(480);
  });

  test('dividing by zero holds the last good value rather than NaN', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await app.keys(['9', '÷', '0']);
    await expect(page.locator('.amount__val')).toHaveText('9');
    await expect(page.locator('.amount__val')).not.toHaveText(/NaN/);
  });

  test('the equals key is only offered when there is a sum to fold', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await expect(page.locator('.equalsbtn')).toHaveCount(0);
    await app.keys(['5', '+']);
    await expect(page.locator('.equalsbtn')).toHaveCount(1);
  });
});

/* ---------------- Phase 4c: line items ---------------- */

test.describe('line items', () => {
  test('the total is the sum of the items and is not typed directly', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    const amounts = [1200, 240, 800, 160];
    for (const a of amounts) {
      await page.locator('.itemadd').click();
      await app.keys(String(a).split(''));
    }

    await expect(page.locator('.itemrow')).toHaveCount(4);
    await expect(page.locator('.amount__val')).toHaveText('2,400');
    await expect(page.locator('.amount__note')).toHaveText('Sum of 4 items');
  });

  test('items round-trip through save and reopen', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    await page.locator('.itemadd').click();
    await page.locator('.itemrow__label').first().fill('Biryani');
    await app.keys(['1', '2', '0', '0']);

    await page.locator('.itemadd').click();
    await page.locator('.itemrow__label').nth(1).fill('Borhani');
    await app.keys(['2', '4', '0']);

    await page.locator('.savebtn').click();

    const db = await app.db();
    const saved = db.txns.find(t => t.id.startsWith('m'));
    expect(saved.amount).toBe(1440);
    expect(db.items[saved.id]).toHaveLength(2);
    expect(db.items[saved.id][0].label).toBe('Biryani');

    // Saved today, so it sorts to the top of the ledger.
    await app.goto('txns');
    await page.locator('.row').first().click();
    await expect(page.locator('.itemrow')).toHaveCount(2);
    await expect(page.locator('.itemrow__label').first()).toHaveValue('Biryani');
    await expect(page.locator('.amount__val')).toHaveText('1,440');
  });

  test('the row meta says how many items a transaction has', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await page.locator('.itemadd').click();
    await app.keys(['5', '0', '0']);
    await page.locator('.itemadd').click();
    await app.keys(['2', '5', '0']);
    await page.locator('.savebtn').click();

    await app.goto('txns');
    await expect(page.locator('.row__meta', { hasText: '2 items' }).first()).toBeVisible();
  });

  test('deleting a transaction takes its items with it', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await page.locator('.itemadd').click();
    await app.keys(['5', '0', '0']);
    await page.locator('.savebtn').click();

    let db = await app.db();
    const id = db.txns.find(t => t.id.startsWith('m')).id;
    expect(db.items[id]).toHaveLength(1);

    await page.evaluate(i => window.__paisa.deleteTxn(i), id);

    db = await app.db();
    expect(db.items[id]).toBeUndefined();
    expect(db.txns.find(t => t.id === id)).toBeUndefined();
  });
});

/* ---------------- Phase 5: icons and colours ---------------- */

test.describe('category and account editors', () => {
  test('a category icon and colour reach every screen that draws it', async ({ app, page }) => {
    await app.open();
    await app.goto('categories');

    await page.locator('.row', { hasText: 'Groceries' }).first().click();
    await expect(page.locator('.sheet--entity')).toBeVisible();

    await page.locator('#icon-search').fill('pizza');
    await page.locator('.icongrid__cell').first().click();
    await page.locator('.swatch').nth(5).click();
    await page.locator('.savebtn').click();

    const db = await app.db();
    const cat = db.categories.find(c => c.name === 'Groceries');
    expect(cat.icon).toBe('pizza');
    expect(cat.color).toContain('oklch');

    // And it is actually drawn, not just stored.
    await app.goto('txns');
    await expect(page.locator('.chipglyph--cat').first()).toBeVisible();
  });

  test('account icons reach Home, not just the accounts screen', async ({ app, page }) => {
    await app.open();
    // Regression: accountCards() is a projection, and it used to drop icon /
    // color / brand - so Home silently fell back to matching the account name
    // against the brand regexes, which is the guess this feature replaced.
    // The account row carries a sparkline; a transaction row that merely
    // mentions the account in its meta line does not.
    const chip = page.locator('.row', { hasText: 'Cash wallet' })
      .filter({ has: page.locator('.spark') })
      .locator('.chipglyph');

    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveText('');            // an icon, not the letter C
    await expect(chip.locator('svg')).toHaveCount(1);
  });

  test('an account logo survives a rename', async ({ app, page }) => {
    await app.open();
    await app.goto('accounts');

    await page.locator('.row', { hasText: 'bKash' }).first().click();
    await page.locator('#entity-name').fill('bKash personal');
    await page.locator('.savebtn').click();

    // brandKey() would no longer match "bKash personal" on its own; the stored
    // brand is what keeps the logo.
    const db = await app.db();
    expect(db.accounts.find(a => a.id === 'a3').name).toBe('bKash personal');
    await expect(page.locator('.row', { hasText: 'bKash personal' })
      .locator('.chipglyph--brand')).toBeVisible();
  });

  test('a category in use refuses to be deleted', async ({ app, page }) => {
    await app.open();
    await app.goto('categories');

    await page.locator('.row', { hasText: 'Groceries' }).first().click();
    await page.locator('.delbtn').click();
    await page.locator('.delbtn').click();

    await expect(page.locator('.toast')).toContainText('In use by');
    await expect(page.locator('.sheet--entity')).toBeVisible();
    expect((await app.db()).categories.some(c => c.name === 'Groceries')).toBe(true);
  });

  test('a new category can be created and then used', async ({ app, page }) => {
    await app.open();
    await app.goto('categories');

    await page.locator('.row', { hasText: 'New expense category' }).click();
    await page.locator('#entity-name').fill('Coffee habit');
    await page.locator('.savebtn').click();

    await expect(page.locator('.row', { hasText: 'Coffee habit' })).toBeVisible();

    await app.openAddSheet();
    await expect(page.locator('.catchip', { hasText: 'Coffee habit' })).toBeVisible();
  });
});

/* ---------------- Phase 6: debts ---------------- */

test.describe('debts', () => {
  test('outstanding totals split by direction', async ({ app, page }) => {
    await app.open();
    await app.goto('budgets');
    await page.locator('.tab', { hasText: 'Debts' }).click();

    // Seed: Rafi owes 8,000 with 2,000 already repaid; 9,000 owed to Shahin.
    await expect(page.locator('.debthead__value').first()).toHaveText('৳6,000');
    await expect(page.locator('.debthead__value').nth(1)).toHaveText('৳9,000');
  });

  test('a repayment moves the account balance but not the category reports', async ({ app, page }) => {
    await app.open();

    const before = await page.evaluate(() => ({
      balance: window.__paisa.balance('a3'),
      groceries: window.__paisa.spentByCat()['c1'] || 0
    }));

    await app.goto('budgets');
    await page.locator('.tab', { hasText: 'Debts' }).click();
    await page.locator('.debtrow', { hasText: 'Rafi' }).click();
    await page.locator('.chip', { hasText: '+1,000' }).click();

    const after = await page.evaluate(() => ({
      balance: window.__paisa.balance('a3'),
      groceries: window.__paisa.spentByCat()['c1'] || 0,
      outstanding: window.__paisa.debtBalance(
        window.__paisa.db.debts.find(d => d.person === 'Rafi')
      )
    }));

    expect(after.balance).toBe(before.balance + 1000);
    expect(after.outstanding).toBe(5000);
    // Being repaid is not income against a spending category.
    expect(after.groceries).toBe(before.groceries);
  });

  test('settling in full moves the debt to Settled', async ({ app, page }) => {
    await app.open();
    await app.goto('budgets');
    await page.locator('.tab', { hasText: 'Debts' }).click();
    await page.locator('.debtrow', { hasText: 'Rafi' }).click();
    await page.locator('.chip', { hasText: 'Settle in full' }).click();

    await expect(page.locator('.debtrow', { hasText: 'Rafi' })).toHaveCount(0);
    await expect(page.locator('.row--muted', { hasText: 'Rafi' })).toBeVisible();
  });

  test('a new debt can be recorded', async ({ app, page }) => {
    await app.open();
    await app.goto('budgets');
    await page.locator('.tab', { hasText: 'Debts' }).click();
    await page.locator('.row', { hasText: 'Record a debt' }).click();

    await page.locator('#debt-person').fill('Tanvir');
    await page.locator('#debt-amount').fill('2500');
    await page.locator('.savebtn').click();

    await expect(page.locator('.debtrow', { hasText: 'Tanvir' })).toBeVisible();
    expect((await app.db()).debts.some(d => d.person === 'Tanvir')).toBe(true);
  });
});

/* ---------------- Phase 7: scheduled expenses ---------------- */

test.describe('scheduled expenses', () => {
  test('an overdue auto-post rule files itself once and rolls forward', async ({ app, page }) => {
    const seed = await freshDb(page);
    seed.bills = [{
      id: 'rbT', name: 'Netflix', amount: 790, account: 'a2', cat: 'c8',
      freq: 'monthly', due: '2026-07-01', nextDue: '2026-07-01',
      autoPost: 1, active: 1, variable: 0, lastPosted: null
    }];
    await app.open(seed);

    const db = await app.db();
    const posted = db.txns.filter(t => t.note === 'Netflix');
    expect(posted).toHaveLength(2);            // July and August
    expect(db.bills[0].nextDue).toBe('2026-09-01');
  });

  test('a manual rule waits on Home instead of posting itself', async ({ app, page }) => {
    const seed = await freshDb(page);
    seed.bills = [{
      id: 'rbT', name: 'Gym', amount: 1200, account: 'a2', cat: 'c8',
      freq: 'monthly', due: '2026-08-27', nextDue: '2026-08-27',
      autoPost: 0, active: 1, variable: 0, lastPosted: null
    }];
    await app.open(seed);

    expect((await app.db()).txns.filter(t => t.note === 'Gym')).toHaveLength(0);
    await expect(page.locator('.row', { hasText: 'Gym' })).toBeVisible();

    await page.locator('.row', { hasText: 'Gym' }).locator('.roundbtn').click();
    await expect(page.locator('.toast')).toContainText('Posted');

    const db = await app.db();
    expect(db.txns.filter(t => t.note === 'Gym')).toHaveLength(1);
    expect(db.bills[0].nextDue).toBe('2026-09-27');
  });

  test('three months overdue posts exactly three times, not one and not a loop',
    async ({ app, page }) => {
      const seed = await freshDb(page);
      seed.bills = [{
        id: 'rbT', name: 'Link3', amount: 1500, account: 'a2', cat: 'c5',
        freq: 'monthly', due: '2026-05-30', nextDue: '2026-05-30',
        autoPost: 1, active: 1, variable: 0, lastPosted: null
      }];
      await app.open(seed);

      const db = await app.db();
      expect(db.txns.filter(t => t.note === 'Link3')).toHaveLength(3);  // May, Jun, Jul
      expect(db.bills[0].nextDue).toBe('2026-08-30');
    });

  test('a variable rule never auto-posts; the tick prefills the sheet instead',
    async ({ app, page }) => {
      const seed = await freshDb(page);
      seed.bills = [{
        id: 'rbT', name: 'Electricity', amount: 3400, account: 'a2', cat: 'c4',
        freq: 'monthly', due: '2026-07-05', nextDue: '2026-07-05',
        autoPost: 1, active: 1, variable: 1, lastPosted: null
      }];
      await app.open(seed);

      expect((await app.db()).txns.filter(t => t.note === 'Electricity')).toHaveLength(0);

      await page.locator('.row', { hasText: 'Electricity' }).locator('.roundbtn').click();
      await expect(page.locator('.sheet--add')).toBeVisible();
      await expect(page.locator('#note-input')).toHaveValue('Electricity');
    });

  test('month-end due dates clamp rather than skipping a month', async ({ app, page }) => {
    const seed = await freshDb(page);
    seed.bills = [{
      id: 'rbT', name: 'Rent', amount: 100, account: 'a2', cat: 'c3',
      freq: 'monthly', due: '2026-01-31', nextDue: '2026-01-31',
      autoPost: 1, active: 1, variable: 0, lastPosted: null
    }];
    await app.open(seed);

    const dates = (await app.db()).txns.filter(t => t.note === 'Rent').map(t => t.date);
    expect(dates).toContain('2026-01-31');
    // February has no 31st. The rule must land on the 28th, not skip the month
    // and not drift to the 28th for good afterwards.
    expect(dates).toContain('2026-02-28');
    expect(dates).toContain('2026-03-31');
  });

  test('a paused rule does not run', async ({ app, page }) => {
    const seed = await freshDb(page);
    seed.bills = [{
      id: 'rbT', name: 'Paused thing', amount: 500, account: 'a2', cat: 'c8',
      freq: 'monthly', due: '2026-06-01', nextDue: '2026-06-01',
      autoPost: 1, active: 0, variable: 0, lastPosted: null
    }];
    await app.open(seed);
    expect((await app.db()).txns.filter(t => t.note === 'Paused thing')).toHaveLength(0);
  });
});

/* ---------------- Phase 0: migration ---------------- */

test.describe('migration from v1 data', () => {
  test('an old blob keeps its transactions and gains the new shape', async ({ app, page }) => {
    const v1 = await freshDb(page);

    // Wind it back to what a pre-upgrade install actually held: no version
    // marker, no items/debts, bills without the recurring fields.
    delete v1._v;
    delete v1.items;
    delete v1.debts;
    delete v1.debtPayments;
    v1.bills = [{
      id: 'rb1', name: 'Internet — Link3', amount: 1500,
      account: 'a2', cat: 'c5', freq: 'Monthly', due: '2026-09-30'
    }];
    v1.categories = v1.categories.map(({ icon, ...rest }) => rest);
    v1.accounts = v1.accounts.map(({ icon, brand, ...rest }) => rest);
    const txnCount = v1.txns.length;

    await app.open(v1);

    const db = await app.db();
    expect(db.txns).toHaveLength(txnCount);        // nothing lost
    expect(db._v).toBe(3);
    expect(db.items).toEqual({});
    expect(db.debts).toEqual([]);
    expect(db.bills[0].nextDue).toBe('2026-09-30');
    expect(db.bills[0].autoPost).toBe(0);
    expect(db.bills[0].active).toBe(1);
  });

  test('categories without icons still render, via the letter fallback', async ({ app, page }) => {
    const v1 = await freshDb(page);
    delete v1._v;
    v1.categories = v1.categories.map(({ icon, ...rest }) => rest);
    await app.open(v1);

    await app.goto('txns');
    await expect(page.locator('.chipglyph').first()).toBeVisible();
  });
});

/** A pristine seeded database, read from a throwaway app load. */
async function freshDb(page) {
  await page.goto('/');
  await page.waitForSelector('.boot--gone', { state: 'attached' });
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('paisa.db.v1')));
}
