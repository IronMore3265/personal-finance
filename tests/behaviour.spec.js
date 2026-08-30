// What each phase of the change was supposed to achieve, asserted against the
// running app. Replaces the manual device pass while no device is attached.

import { test, expect, CLOCK } from './fixtures.js';

test.describe('boot', () => {
  test('opens on seeded data with a clean console', async ({ app, page }) => {
    await app.open();
    await expect(page.locator('[data-testid="balance-value"]')).toContainText('৳');
    await expect(page.locator('[data-testid="row"]')).not.toHaveCount(0);
  });
});

/* ---------------- Phase 2: the sheet scrolls ---------------- */

test.describe('the header', () => {
  test('every screen is titled, Home included', async ({ app, page }) => {
    await app.open();
    await expect(page.locator('#header')).toContainText('Dashboard');
    // No arrow on Home - there is nowhere to go back to - but the row keeps
    // its height, so moving between screens does not shunt the content.
    const heights = {};
    heights.home = await page.locator('#header').boundingBox();
    await app.goto('txns');
    await expect(page.locator('#header')).toContainText('Activity');
    heights.txns = await page.locator('#header').boundingBox();
    expect(heights.home.height).toBe(heights.txns.height);

    await app.goto('home');
    await expect(page.locator('#header')).toContainText('Dashboard');
  });
});

test.describe('add sheet scrolling', () => {
  test('the body scrolls and the save button stays on screen', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await app.keys(['5', '0', '0']);

    const body = page.locator('[data-testid="sheet-body"]');
    const metrics = await body.evaluate(n => ({
      scrollHeight: n.scrollHeight, clientHeight: n.clientHeight
    }));
    expect(metrics.scrollHeight,
      'sheet body should overflow, otherwise there is nothing to test'
    ).toBeGreaterThan(metrics.clientHeight);

    // The actual bug: without min-height:0 the footer was pushed off-screen.
    const save = await page.locator('[data-testid="savebtn"]').boundingBox();
    const viewport = page.viewportSize();
    expect(save.y + save.height).toBeLessThanOrEqual(viewport.height + 1);
  });

  test('scroll position survives a tap inside the sheet', async ({ app, page }) => {
    await app.open();
    // No category, so the grid stays open and the body has something to
    // scroll - folded to a single chip it now fits without scrolling at all.
    await app.openFilledSheet('Cash wallet', null);

    const body = page.locator('[data-testid="sheet-body"]');
    await body.evaluate(n => { n.scrollTop = 140; });
    const before = await body.evaluate(n => n.scrollTop);
    expect(before).toBeGreaterThan(0);

    // A tap that changes state without changing the body's height, so the
    // scroll position has somewhere to survive to.
    await page.locator('[data-testid="daterow"] [data-testid="chip"]', { hasText: 'Yesterday' }).click();
    await expect(page.locator('[data-testid="daterow"] [data-testid="chip"][data-on="1"]')).toContainText('Yesterday');

    expect(await page.locator('[data-testid="sheet-body"]').evaluate(n => n.scrollTop)).toBe(before);
  });
});

/* ---------------- Phase 1: scoped rendering ---------------- */

test.describe('rendering', () => {
  test('a keypad tap touches only the amount nodes, not the whole sheet', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    // Raise the keys before observing: opening them is a real render, and it
    // is the taps afterwards that must stay off the slow path.
    await page.locator('[data-testid="amount-row"]').click();

    await page.evaluate(() => {
      window.__mutations = [];
      const target = document.querySelector('[data-testid="sheet"]');
      new MutationObserver(records => {
        for (const r of records) {
          let n = r.target;
          if (n.nodeType === 3) n = n.parentElement;
          // Identified by test id rather than class: styling is utilities now,
          // so a class name says nothing about which node this is.
          const named = n && n.closest ? n.closest('[data-testid]') : null;
          window.__mutations.push(named ? named.dataset.testid : '?');
        }
      }).observe(target, { childList: true, subtree: true, characterData: true });
    });

    await app.keys(['1', '2', '3']);

    const touched = [...new Set(await page.evaluate(() => window.__mutations))];
    expect(touched.length, 'something mutated').toBeGreaterThan(0);
    for (const cls of touched) {
      expect(cls, 'unexpected node rebuilt on a keypress: ' + cls)
        .toMatch(/^(amount-val|amount-expr|savebtn)$/);
    }
  });

  test('typing in the activity search patches the ledger rather than rebuilding it', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await expect(page.locator('[data-testid="row"]')).not.toHaveCount(0);

    // Stamp everything on the screen. Whatever survives the keystroke still
    // carries its mark; anything torn down and rebuilt comes back without one.
    await page.evaluate(() => {
      window.__adds = 0;
      document.querySelectorAll('#scroll, #scroll *').forEach(n => { n.__stamp = 1; });
      new MutationObserver(rs => rs.forEach(r => { window.__adds += r.addedNodes.length; }))
        .observe(document.getElementById('scroll'), { childList: true });
    });

    await page.locator('#search-input').fill('coffee');
    await expect(page.locator('[data-testid="row"]')).toHaveCount(1);

    const after = await page.evaluate(() => ({
      input: !!document.querySelector('#search-input').__stamp,
      row: !!document.querySelector('[data-testid="row"]').__stamp,
      adds: window.__adds
    }));

    // The field being typed into is the same node it was, which is why the
    // caret and the keyboard survive without having to be put back. So is the
    // row that outlived the filter: the pass writes the differences into what
    // is already there. Narrowing a list only removes, so nothing is appended.
    expect(after.input, 'the search field was replaced').toBe(true);
    expect(after.row, 'a surviving row was rebuilt').toBe(true);
    expect(after.adds, 'nodes were appended to a list that only shrank').toBe(0);
  });

  test('a re-render leaves the scroll position and the caret where they were', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await expect(page.locator('[data-testid="row"]')).not.toHaveCount(0);

    // Driven from the store rather than by clicking a chip: a click scrolls
    // its target into view first, which would move the very thing under test.
    //
    // The key written is deliberately not `filter`. Crossing a sub-tab is a
    // transition now - it pushes the ledger sideways and takes it back to the
    // top on purpose - so it is the one body change that is meant to move the
    // scroller. `filterDir` redraws exactly the same rows without being a
    // crossing, which is the plain re-render this test is about.
    const before = await page.evaluate(() => {
      const box = document.getElementById('scroll');
      // Focus first: focusing a field at the top of a scroller pulls it back
      // into view, which would undo the scroll this test is about to check.
      document.getElementById('search-input').focus();
      box.scrollTop = Math.min(140, box.scrollHeight - box.clientHeight);
      window.__paisa.set({ filterDir: -window.__paisa.ui.filterDir });
      return box.scrollTop;
    });
    expect(before, 'the ledger is too short for this test').toBeGreaterThan(0);
    await expect(page.locator('[data-testid="row"]')).not.toHaveCount(0);

    const after = await page.evaluate(() => ({
      top: document.getElementById('scroll').scrollTop,
      focused: document.activeElement && document.activeElement.id
    }));
    // Nothing carries these across a pass any more, because nothing disturbs
    // them: the scroller and the field are the same nodes they were.
    expect(after.top, 'the list jumped').toBe(before);
    expect(after.focused, 'the keyboard was dropped').toBe('search-input');
  });

  test('a sheet is patched, not rebuilt, by a tap inside it', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="sheet"], [data-testid="sheet"] *')
        .forEach(n => { n.__stamp = 1; });
    });

    await page.locator('#note-input').fill('dinner');

    const after = await page.evaluate(() => ({
      sheet: !!document.querySelector('[data-testid="sheet"]').__stamp,
      body: !!document.querySelector('[data-testid="sheet-body"]').__stamp,
      note: !!document.querySelector('#note-input').__stamp,
      entering: document.querySelector('[data-testid="sheet"]').classList.contains('sheet--enter')
    }));
    // The same sheet after a tap inside it is not an entrance: it keeps its
    // nodes and the slide-up it already played. Where it was scrolled to is
    // covered by 'scroll position survives a tap inside the sheet' above.
    expect(after.sheet, 'the sheet was rebuilt').toBe(true);
    expect(after.body, 'the sheet body was rebuilt').toBe(true);
    expect(after.note, 'the field being typed into was replaced').toBe(true);
    expect(after.entering, 'the slide-up was queued to replay').toBe(false);
  });

  test('the date picker holds the month you paged to', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
    await expect(page.locator('[data-testid="cal-month"]')).toHaveText('August 2026');

    await page.locator('[data-testid="cal-next"]').click();
    await expect(page.locator('[data-testid="cal-month"]')).toHaveText('September 2026');

    // The month on show lives in the picker, not in the store, so a pass that
    // is about something else must leave the whole widget alone - and must not
    // leave the live grid wired to a copy that is not in the document.
    await page.evaluate(() => window.__paisa.set({ entryNote: 'x' }));
    await expect(page.locator('[data-testid="cal-month"]')).toHaveText('September 2026');

    await page.locator('[data-testid="cal-next"]').click();
    await expect(page.locator('[data-testid="cal-month"]')).toHaveText('October 2026');
    await page.locator('[data-testid="cal-day"][data-day="9"]').click();
    expect(await page.evaluate(() => window.__paisa.ui.entryDate)).toBe('2026-10-09');
  });

  test('the theme flips without disturbing the screen under it', async ({ app, page }) => {
    await app.open();
    await app.goto('settings');
    const before = await page.evaluate(() => {
      const box = document.getElementById('scroll');
      box.scrollTop = Math.min(120, box.scrollHeight - box.clientHeight);
      return box.scrollTop;
    });
    expect(before).toBeGreaterThan(0);

    await page.evaluate(() => window.__paisa.toggleDark());

    const after = await page.evaluate(() => ({
      top: document.getElementById('scroll').scrollTop,
      dark: document.documentElement.dataset.dark,
      ui: window.__paisa.ui.dark
    }));
    // Repainting is CSS's job: the theme is a data attribute and a table of
    // custom properties, so the tree has nothing to do but the switch itself.
    expect(after.dark).toBe(after.ui ? '1' : '0');
    expect(after.top, 'the settings list jumped').toBe(before);
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
    await app.openFilledSheet();
    await app.keys(['5', '0', '0']);

    await page.evaluate(() => window.__paisa.set({ entryDate: '2026-08-20' }));
    await page.locator('[data-testid="savebtn"]').click();

    const db = await app.db();
    const saved = db.txns.find(t => t.id.startsWith('m'));
    expect(saved.date).toBe('2026-08-20');
    expect(saved.amount).toBe(500);
  });

  test('the Yesterday chip picks the day before', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await page.locator('[data-testid="daterow"] [data-testid="chip"]', { hasText: 'Yesterday' }).click();
    expect(await page.evaluate(() => window.__paisa.ui.entryDate)).toBe('2026-08-27');
  });

  test('the day you tap is written and the dialog closes on that tap', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
    await expect(page.locator('[data-testid="datepicker"]')).toBeVisible();
    await expect(page.locator('[data-testid="cal-month"]')).toHaveText('August 2026');

    // One tap is the whole interaction. There is no Done bar to find, and the
    // sheet under the dialog is reachable again the moment the date is chosen.
    await page.locator('[data-testid="cal-day"][data-day="1"]').click();

    await expect(page.locator('[data-testid="datedialog"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__paisa.ui.entryDate)).toBe('2026-08-01');
    expect(await page.evaluate(() => window.__paisa.ui.dateOpen)).toBe(false);
    await expect(page.locator('[data-testid="sheet"]')).toBeVisible();
  });

  test('tapping beside the card puts the dialog away and leaves the sheet', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
    await expect(page.locator('[data-testid="datedialog"]')).toBeVisible();

    // The scrim, not the card: a tap outside is how a dialog is dismissed, and
    // until it was the sheet behind it could not be touched at all.
    await page.locator('[data-testid="date-scrim"]').click({ position: { x: 8, y: 8 } });

    await expect(page.locator('[data-testid="datedialog"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="sheet"]')).toBeVisible();
    // Dismissing is not cancelling: the date on show is the one it opened with.
    expect(await page.evaluate(() => window.__paisa.ui.entryDate)).toBe('2026-08-28');

    // And the sheet is live again, which is the point of getting the panel out
    // of the footer.
    await page.locator('[data-testid="daterow"] [data-testid="chip"]', { hasText: 'Yesterday' }).click();
    expect(await page.evaluate(() => window.__paisa.ui.entryDate)).toBe('2026-08-27');
  });

  test('the head climbs to months and years and back down to a day', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
    const head = page.locator('[data-testid="cal-month"]');

    // Up two grains: the month grid, then the page of years around it.
    await head.click();
    await expect(head).toHaveText('2026');
    await head.click();
    await expect(head).toHaveText('2016 – 2027');

    // Chevrons step whichever grain is on show - a page of twelve years here.
    await page.locator('[data-testid="cal-prev"]').click();
    await expect(head).toHaveText('2004 – 2015');
    await page.locator('[data-testid="cal-next"]').click();

    // And picking a cell walks back down, one grain per tap.
    await page.locator('[data-testid="cal-yearcell"][data-year="2024"]').click();
    await expect(head).toHaveText('2024');
    await page.locator('[data-testid="cal-monthcell"][data-month="3"]').click();
    await expect(head).toHaveText('March 2024');

    await page.locator('[data-testid="cal-day"][data-day="12"]').click();
    expect(await page.evaluate(() => window.__paisa.ui.entryDate)).toBe('2024-03-12');
  });

  test('the calendar steps between months', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
    await page.locator('[data-testid="cal-prev"]').click();
    await expect(page.locator('[data-testid="cal-month"]')).toHaveText('July 2026');

    await page.locator('[data-testid="cal-day"][data-day="4"]').click();
    expect(await page.evaluate(() => window.__paisa.ui.entryDate)).toBe('2026-07-04');
  });

  test('no sheet falls back to the platform date dialog', async ({ app, page }) => {
    await app.open();

    await app.goto('scheduled');
    await page.locator('[data-testid="row"]', { hasText: 'Netflix' }).first().click();
    await expect(page.locator('input[type="date"]')).toHaveCount(0);
    await page.locator('[data-testid="daterow"] [data-testid="chip"]').first().click();
    await expect(page.locator('[data-testid="datepicker"]')).toBeVisible();

    // The recurring sheet writes two fields from one tap, and neither of them
    // is in the store's ui root - they are on the draft the sheet is editing.
    await page.locator('[data-testid="cal-day"][data-day="3"]').click();
    const draft = await page.evaluate(() => window.__paisa.ui.editRecurring);
    expect(draft.nextDue).toBe('2026-09-03');
  });
});

test.describe('editing', () => {
  test('tapping a transaction opens it for editing and saves the change', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');

    const before = await page.evaluate(() => window.__paisa.netWorth());
    await page.locator('[data-testid="row"]').first().click();
    await expect(page.locator('[data-sheet="add"]')).toBeVisible();
    await expect(page.locator('[data-testid="sheet-editlabel"]')).toBeVisible();
    await expect(page.locator('[data-testid="savebtn"]')).toContainText('Update');

    const id = await page.evaluate(() => window.__paisa.ui.entryId);
    const original = await page.evaluate(
      (i) => window.__paisa.db.txns.find(t => t.id === i).amount, id
    );

    await app.keys(['del', 'del', 'del', 'del', 'del', 'del', 'del', 'del', 'del']);
    await app.keys(['1', '0', '0']);
    await page.locator('[data-testid="savebtn"]').click();

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
    const count = await page.locator('[data-testid="row"]').count();

    await page.locator('[data-testid="row"]').first().click();
    await page.locator('[data-testid="delbtn"]').click();
    await expect(page.locator('[data-testid="delbtn"][data-armed="1"]')).toBeVisible();
    await page.locator('[data-testid="delbtn"]').click();

    await expect(page.locator('[data-sheet="add"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="row"]')).toHaveCount(count - 1);
  });

  test('the FAB always opens a blank draft, never the last edited row', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await page.locator('[data-testid="row"]').first().click();
    await app.dismiss();

    await app.openAddSheet();
    await expect(page.locator('[data-testid="savebtn"]')).toContainText('Save');
    await expect(page.locator('[data-testid="amount-val"]')).toHaveText('0');
  });
});

/* ---------------- Phase 4a: grouped account picker ---------------- */

test.describe('account groups', () => {
  test('collapses to one chip per type, expands to its accounts', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    const row = page.locator('[data-testid="sheet-body"] [data-testid="chiprow"]').first();
    // cash, bank, mfs, card - four types in the seed data.
    await expect(row.locator('[data-testid="chip"]')).toHaveCount(4);

    await row.locator('[data-testid="chip"]', { hasText: 'Mobile wallet' }).click();
    // The group chip plus its three wallets, and nothing else.
    await expect(page.locator('[data-testid="sheet-body"] [data-testid="chiprow"]').first().locator('[data-testid="chip"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="chip"]', { hasText: 'Nagad' })).toBeVisible();
    await expect(page.locator('[data-testid="chip"]', { hasText: 'Credit card' })).toHaveCount(0);
  });

  test('picking an account collapses the row and names it on its group', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    const row = () => page.locator('[data-testid="sheet-body"] [data-testid="chiprow"]').first();
    await row().locator('[data-testid="chip"]', { hasText: 'Mobile wallet' }).click();
    await row().locator('[data-testid="chip"]', { hasText: 'Nagad' }).click();

    await expect(row().locator('[data-testid="chip"]')).toHaveCount(4);
    await expect(row().locator('[data-testid="chip"][data-on="1"]')).toContainText('Nagad');
    expect(await page.evaluate(() => window.__paisa.ui.entryAccount)).toBe('a4');
  });

  test('an account in use refuses to be deleted', async ({ app, page }) => {
    await app.open();
    // a6 carries the Aarong purchase, so removing it would orphan that row.
    const gone = await page.evaluate(() => window.__paisa.deleteAccount('a6'));
    expect(gone).toBe(false);
    await expect(page.locator('[data-testid="toast"]')).toContainText('In use by');
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
    const row = page.locator('[data-testid="sheet-body"] [data-testid="chiprow"]').first();
    await expect(row.locator('[data-testid="chip"]')).toHaveCount(3);
    await expect(row.locator('[data-testid="chip"]', { hasText: 'Credit card' })).toHaveCount(0);
  });
});

/* ---------------- Phase 4b: the calculator ---------------- */

test.describe('calculator keypad', () => {
  test('multiplication binds tighter than addition', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await app.keys(['2', '4', '0', '×', '2', '+', '8', '0', '0']);

    await expect(page.locator('[data-testid="amount-expr"]')).toHaveText('240 × 2 + 800');
    await expect(page.locator('[data-testid="amount-val"]')).toHaveText('1,280');
    await expect(page.locator('[data-testid="savebtn"]')).toContainText('1,280');
  });

  // There is no equals key: the expression line and the running figure already
  // show both halves of the sum, so folding was a step with nothing to reveal.
  test('an unfolded expression saves as its result', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await app.keys(['2', '4', '0', '×', '2']);

    await expect(page.locator('[data-testid="amount-expr"]')).toHaveText('240 × 2');
    await expect(page.locator('[data-testid="amount-val"]')).toHaveText('480');
    await expect(page.locator('[data-testid="keypad-key"][data-key="="]')).toHaveCount(0);

    await page.locator('[data-testid="savebtn"]').click();
    const db = await app.db();
    expect(db.txns.find(t => t.id.startsWith('m')).amount).toBe(480);
  });

  test('dividing by zero holds the last good value rather than NaN', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await app.keys(['9', '÷', '0']);
    await expect(page.locator('[data-testid="amount-val"]')).toHaveText('9');
    await expect(page.locator('[data-testid="amount-val"]')).not.toHaveText(/NaN/);
  });

  test('the keypad is only up while a number is being entered', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    // Nothing raised it yet: the sheet opens on the fields, not on the keys.
    await expect(page.locator('[data-testid="keypad"]')).toHaveCount(0);

    await page.locator('[data-testid="amount-row"]').click();
    await expect(page.locator('[data-testid="keypad"]')).toBeVisible();

    await app.closeKeys();
    await expect(page.locator('[data-testid="keypad"]')).toHaveCount(0);

    // Touching another field puts them away without a trip to Done.
    await page.locator('[data-testid="amount-row"]').click();
    await expect(page.locator('[data-testid="keypad"]')).toBeVisible();
    await page.locator('[data-testid="daterow"] [data-testid="chip"]', { hasText: 'Yesterday' }).click();
    await expect(page.locator('[data-testid="keypad"]')).toHaveCount(0);
  });
});

/* ---------------- Phase 4c: line items ---------------- */

test.describe('line items', () => {
  test('the total is the sum of the items and is not typed directly', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    const amounts = [1200, 240, 800, 160];
    for (const a of amounts) {
      await page.locator('[data-testid="itemadd"]').click();
      await app.keys(String(a).split(''));
    }

    await expect(page.locator('[data-testid="itemrow"]')).toHaveCount(4);
    await expect(page.locator('[data-testid="amount-val"]')).toHaveText('2,400');
    await expect(page.locator('[data-testid="amount-note"]')).toHaveText('Sum of 4 items');
  });

  test('items round-trip through save and reopen', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();

    await page.locator('[data-testid="itemadd"]').click();
    await page.locator('[data-testid="itemrow-label"]').first().fill('Biryani');
    await app.keys(['1', '2', '0', '0']);

    await page.locator('[data-testid="itemadd"]').click();
    await page.locator('[data-testid="itemrow-label"]').nth(1).fill('Borhani');
    await app.keys(['2', '4', '0']);

    await page.locator('[data-testid="savebtn"]').click();

    const db = await app.db();
    const saved = db.txns.find(t => t.id.startsWith('m'));
    expect(saved.amount).toBe(1440);
    expect(db.items[saved.id]).toHaveLength(2);
    expect(db.items[saved.id][0].label).toBe('Biryani');

    // Saved today, so it sorts to the top of the ledger.
    await app.goto('txns');
    await page.locator('[data-testid="row"]').first().click();
    await expect(page.locator('[data-testid="itemrow"]')).toHaveCount(2);
    await expect(page.locator('[data-testid="itemrow-label"]').first()).toHaveValue('Biryani');
    await expect(page.locator('[data-testid="amount-val"]')).toHaveText('1,440');
  });

  test('the row meta says how many items a transaction has', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await page.locator('[data-testid="itemadd"]').click();
    await app.keys(['5', '0', '0']);
    await page.locator('[data-testid="itemadd"]').click();
    await app.keys(['2', '5', '0']);
    await page.locator('[data-testid="savebtn"]').click();

    await app.goto('txns');
    await expect(page.locator('[data-testid="row-meta"]', { hasText: '2 items' }).first()).toBeVisible();
  });

  test('deleting a transaction takes its items with it', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await page.locator('[data-testid="itemadd"]').click();
    await app.keys(['5', '0', '0']);
    await page.locator('[data-testid="savebtn"]').click();

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

    await page.locator('[data-testid="row"]', { hasText: 'Groceries' }).first().click();
    await expect(page.locator('[data-sheet="entity"]')).toBeVisible();

    await page.locator('#icon-search').fill('pizza');
    await page.locator('[data-testid="icongrid-cell"]').first().click();
    await page.locator('[data-testid="swatch"]').nth(5).click();
    await page.locator('[data-testid="savebtn"]').click();

    const db = await app.db();
    const cat = db.categories.find(c => c.name === 'Groceries');
    expect(cat.icon).toBe('pizza');
    expect(cat.color).toContain('oklch');

    // And it is actually drawn, not just stored. Icon chips are monochrome and
    // carry the category's colour as a ring, so the colour is on the box
    // shadow rather than the background.
    await app.goto('txns');
    const glyph = page.locator('[data-testid="chipglyph"][data-chip="mono"]').first();
    await expect(glyph).toBeVisible();
    expect(await glyph.evaluate(n => n.style.boxShadow)).toContain('oklch');
  });

  test('account icons reach Home, not just the accounts screen', async ({ app, page }) => {
    await app.open();
    // Regression: accountCards() is a projection, and it used to drop icon /
    // color / brand - so Home silently fell back to matching the account name
    // against the brand regexes, which is the guess this feature replaced.
    // The account row carries a sparkline; a transaction row that merely
    // mentions the account in its meta line does not.
    const chip = page.locator('[data-testid="row"]', { hasText: 'Cash wallet' })
      .filter({ has: page.locator('[data-testid="spark"]') })
      .locator('[data-testid="chipglyph"]');

    await expect(chip).toHaveCount(1);
    await expect(chip).toHaveText('');            // an icon, not the letter C
    await expect(chip.locator('svg')).toHaveCount(1);
  });

  test('an account logo survives a rename', async ({ app, page }) => {
    await app.open();
    await app.goto('accounts');

    await page.locator('[data-testid="row"]', { hasText: 'bKash' }).first().click();
    await page.locator('#entity-name').fill('bKash personal');
    await page.locator('[data-testid="savebtn"]').click();

    // brandKey() would no longer match "bKash personal" on its own; the stored
    // brand is what keeps the logo.
    const db = await app.db();
    expect(db.accounts.find(a => a.id === 'a3').name).toBe('bKash personal');
    await expect(page.locator('[data-testid="row"]', { hasText: 'bKash personal' })
      .locator('[data-testid="chipglyph"][data-chip="brand"]')).toBeVisible();
  });

  test('a category in use refuses to be deleted', async ({ app, page }) => {
    await app.open();
    await app.goto('categories');

    await page.locator('[data-testid="row"]', { hasText: 'Groceries' }).first().click();
    await page.locator('[data-testid="delbtn"]').click();
    await page.locator('[data-testid="delbtn"]').click();

    await expect(page.locator('[data-testid="toast"]')).toContainText('In use by');
    await expect(page.locator('[data-sheet="entity"]')).toBeVisible();
    expect((await app.db()).categories.some(c => c.name === 'Groceries')).toBe(true);
  });

  test('a new category can be created and then used', async ({ app, page }) => {
    await app.open();
    await app.goto('categories');

    await page.locator('[data-testid="row"]', { hasText: 'New expense category' }).click();
    await page.locator('#entity-name').fill('Coffee habit');
    await page.locator('[data-testid="savebtn"]').click();

    await expect(page.locator('[data-testid="row"]', { hasText: 'Coffee habit' })).toBeVisible();

    await app.openFilledSheet('Cash wallet', null);
    await expect(page.locator('[data-testid="catchip"]', { hasText: 'Coffee habit' })).toBeVisible();
  });
});

/* ---------------- Phase 6: debts ---------------- */

test.describe('debts', () => {
  test('outstanding totals split by direction', async ({ app, page }) => {
    await app.open();
    await app.goto('budgets');
    await page.locator('[data-testid="tab"]', { hasText: 'Debts' }).click();

    // Seed: Rafi owes 8,000 with 2,000 already repaid; 9,000 owed to Shahin.
    await expect(page.locator('[data-testid="debthead-value"]').first()).toHaveText('৳6,000');
    await expect(page.locator('[data-testid="debthead-value"]').nth(1)).toHaveText('৳9,000');
  });

  test('a repayment moves the account balance but not the category reports', async ({ app, page }) => {
    await app.open();

    const before = await page.evaluate(() => ({
      balance: window.__paisa.balance('a3'),
      groceries: window.__paisa.spentByCat()['c1'] || 0
    }));

    await app.goto('budgets');
    await page.locator('[data-testid="tab"]', { hasText: 'Debts' }).click();
    await page.locator('[data-testid="debtrow"]', { hasText: 'Rafi' }).click();
    await page.locator('[data-testid="chip"]', { hasText: '+1,000' }).click();

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
    await page.locator('[data-testid="tab"]', { hasText: 'Debts' }).click();
    await page.locator('[data-testid="debtrow"]', { hasText: 'Rafi' }).click();
    await page.locator('[data-testid="chip"]', { hasText: 'Settle in full' }).click();

    await expect(page.locator('[data-testid="debtrow"]', { hasText: 'Rafi' })).toHaveCount(0);
    await expect(page.locator('[data-testid="row"][data-muted="1"]', { hasText: 'Rafi' })).toBeVisible();
  });

  test('a new debt can be recorded', async ({ app, page }) => {
    await app.open();
    await app.goto('budgets');
    await page.locator('[data-testid="tab"]', { hasText: 'Debts' }).click();
    await page.locator('[data-testid="row"]', { hasText: 'Record a debt' }).click();

    await page.locator('#debt-person').fill('Tanvir');
    await page.locator('#debt-amount').fill('2500');
    await page.locator('[data-testid="savebtn"]').click();

    await expect(page.locator('[data-testid="debtrow"]', { hasText: 'Tanvir' })).toBeVisible();
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
    await expect(page.locator('[data-testid="row"]', { hasText: 'Gym' })).toBeVisible();

    await page.locator('[data-testid="row"]', { hasText: 'Gym' }).locator('[data-testid="roundbtn"]').click();
    await expect(page.locator('[data-testid="toast"]')).toContainText('Posted');

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

      await page.locator('[data-testid="row"]', { hasText: 'Electricity' }).locator('[data-testid="roundbtn"]').click();
      await expect(page.locator('[data-sheet="add"]')).toBeVisible();
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
    await expect(page.locator('[data-testid="chipglyph"]').first()).toBeVisible();
  });
});

test.describe('pulling a sheet down', () => {
  /** Drag from the middle of `handle` down by `distance`, in a few steps. */
  async function pull(page, handle, distance, steps = 8) {
    const box = await page.locator(handle).boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(x, y + (distance * i) / steps);
    }
    await page.mouse.up();
  }

  test('a pull on the grabber closes the sheet', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await expect(page.locator('[data-sheet="add"]')).toBeVisible();

    await pull(page, '[data-testid="sheet-grab"]', 220);

    await expect(page.locator('[data-sheet="add"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__paisa.ui.sheet)).toBe(null);
  });

  test('a short pull springs back and the sheet stays open', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    await pull(page, '[data-testid="sheet-grab"]', 40);

    await expect(page.locator('[data-sheet="add"]')).toBeVisible();
    expect(await page.evaluate(() => window.__paisa.ui.sheet)).toBe('add');
  });

  test('the top of the body is a drag handle too', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    await pull(page, '[data-testid="amount-row"]', 220);

    await expect(page.locator('[data-sheet="add"]')).toHaveCount(0);
  });

  test('a drag that starts on a control does not also fire it', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    // Expense is the selected type; dragging off Income must not select it.
    const income = page.locator('[data-testid="sheet"]').getByText('Income', { exact: true });
    const box = await income.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + i * 30);
    }
    await page.mouse.up();

    expect(await page.evaluate(() => window.__paisa.ui.entryType)).toBe('expense');
  });

  /**
   * The same pull as a finger makes it.
   *
   * Worth its own test rather than trusting the mouse one: the mouse path runs
   * on pointer events, and on a device those are cancelled the moment Chrome
   * decides the swipe belongs to a scroller - which is exactly how this
   * gesture came to be broken on the phone while every mouse test was green.
   */
  async function pullByTouch(page, handle, distance, steps = 8) {
    await page.locator(handle).evaluate((node, { distance, steps }) => {
      const box = node.getBoundingClientRect();
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;

      const send = (type, clientY) => {
        const touch = new Touch({ identifier: 1, target: node, clientX: x, clientY });
        const list = type === 'touchend' ? [] : [touch];
        node.dispatchEvent(new TouchEvent(type, {
          bubbles: true, cancelable: true, touches: list,
          targetTouches: list, changedTouches: [touch]
        }));
      };

      send('touchstart', y);
      for (let i = 1; i <= steps; i++) send('touchmove', y + (distance * i) / steps);
      send('touchend', y + distance);
    }, { distance, steps });
  }

  test('a finger pull on the grabber closes the sheet', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    await pullByTouch(page, '[data-testid="sheet-grab"]', 220);

    await expect(page.locator('[data-sheet="add"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__paisa.ui.sheet)).toBe(null);
  });

  test('a short finger pull springs back', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    await pullByTouch(page, '[data-testid="sheet-grab"]', 40);

    await expect(page.locator('[data-sheet="add"]')).toBeVisible();
  });

  test('the sms sheet answers a finger too', async ({ app, page }) => {
    await app.open();
    await app.goto('settings');
    await page.getByText('Paste an SMS', { exact: true }).click();
    await expect(page.locator('[data-sheet="sms"]')).toBeVisible();

    await pullByTouch(page, '[data-testid="sheet-grab"]', 220);

    await expect(page.locator('[data-sheet="sms"]')).toHaveCount(0);
  });

  /*
   * The gesture only survives on a device because the handles opt out of the
   * browser's own panning. Asserted directly: nothing else in the suite would
   * notice this going missing, and without it the drag is dead on a phone
   * while every other test here still passes.
   */
  test('the grabber and the head are exempt from browser panning',
    async ({ app, page }) => {
      await app.open();
      await app.openAddSheet();

      const touchAction = (sel) => page.locator(sel)
        .evaluate(n => getComputedStyle(n).touchAction);

      expect(await touchAction('[data-testid="sheet-grab"]')).toBe('none');
      // The head is the sheet's second child - grabber, head, body, foot.
      expect(await page.locator('[data-testid="sheet"] > *').nth(1)
        .evaluate(n => getComputedStyle(n).touchAction)).toBe('none');
      // The body keeps its scrolling.
      expect(await touchAction('[data-testid="sheet-body"]')).not.toBe('none');
    });

  test('the keypad is not a drag handle', async ({ app, page }) => {
    await app.open();
    await app.openFilledSheet();
    await page.locator('[data-testid="amount-row"]').click();
    await expect(page.locator('[data-testid="keypad"]')).toBeVisible();

    await pull(page, '[data-testid="keypad"]', 220);

    await expect(page.locator('[data-sheet="add"]')).toBeVisible();
  });
});

/* ---------------- swiping between tabs ---------------- */

test.describe('swipe navigation', () => {
  const screen = (page) => page.evaluate(() => window.__paisa.ui.screen);
  const filter = (page) => page.evaluate(() => window.__paisa.ui.filter);

  test('a swipe left moves to the next tab and right moves back', async ({ app, page }) => {
    await app.open();
    expect(await screen(page)).toBe('home');

    await app.swipe(1);
    expect(await screen(page)).toBe('txns');

    await app.swipe(-1);
    expect(await screen(page)).toBe('home');
  });

  test('there is nothing either side of the first and last tabs', async ({ app, page }) => {
    await app.open();
    await app.swipe(-1);
    expect(await screen(page)).toBe('home');

    await app.goto('settings');
    await app.swipe(1);
    expect(await screen(page)).toBe('settings');
  });

  test('a vertical drag scrolls the list rather than changing tab', async ({ app, page }) => {
    await app.open();
    const box = await page.locator('#scroll').boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + 260;

    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x, y - i * 20);
    await page.mouse.up();

    expect(await screen(page)).toBe('home');
  });

  test('a swipe that started on a row does not also open that row', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await app.swipe(1);

    expect(await filter(page)).toBe('expense');
    await expect(page.locator('[data-testid="sheet"]')).toHaveCount(0);
  });

  test('a sheet owns the gesture while it is up', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();

    // The drag lands on the scrim, which dismisses the sheet the way a tap
    // does. What must not happen is the tab moving underneath it as well.
    await app.swipe(1);

    expect(await screen(page)).toBe('home');
  });
});

/* ---------------- Activity's filter chips as sub-tabs ---------------- */

test.describe('activity filters', () => {
  const filter = (page) => page.evaluate(() => window.__paisa.ui.filter);
  const screen = (page) => page.evaluate(() => window.__paisa.ui.screen);

  test('a swipe walks the chips before it leaves the screen', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    expect(await filter(page)).toBe('all');

    for (const expected of ['expense', 'income', 'sms']) {
      await app.swipe(1);
      expect(await filter(page)).toBe(expected);
      expect(await screen(page)).toBe('txns');
      await expect(page.locator('[data-testid="chip"][data-on="1"]').first())
        .toHaveAttribute('data-on', '1');
    }

    // Past the last chip the same gesture crosses to the next tab.
    await app.swipe(1);
    expect(await screen(page)).toBe('budgets');
  });

  test('the swiped chip is the one the ledger is filtered by', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    await app.swipe(1);

    await expect(page.locator('[data-testid="chiprow"] [data-testid="chip"][data-on="1"]'))
      .toHaveText('Expense');
    const rows = await page.locator('[data-testid="activity-list"] [data-testid="row"]').count();
    const expenses = await page.evaluate(
      () => window.__paisa.db.txns.filter(t => t.type === 'expense').length
    );
    expect(rows).toBe(expenses);
  });

  test('swiping into Activity lands on the chip nearest the edge it came from', async ({ app, page }) => {
    await app.open();

    // Forward from Home: the first chip, so the next swipe has three to walk.
    await app.swipe(1);
    expect(await screen(page)).toBe('txns');
    expect(await filter(page)).toBe('all');

    await app.goto('budgets');
    // Backward from Budgets: the last chip, for the same reason.
    await app.swipe(-1);
    expect(await screen(page)).toBe('txns');
    expect(await filter(page)).toBe('sms');
  });

  test('tapping a chip moves the ledger in the direction the chips run', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');

    await page.locator('[data-testid="chiprow"] [data-testid="chip"]', { hasText: 'Income' }).click();
    expect(await filter(page)).toBe('income');
    expect(await page.evaluate(() => window.__paisa.ui.filterDir)).toBe(1);

    await page.locator('[data-testid="chiprow"] [data-testid="chip"]', { hasText: 'Expense' }).click();
    expect(await filter(page)).toBe('expense');
    expect(await page.evaluate(() => window.__paisa.ui.filterDir)).toBe(-1);
  });

  test('the search box and the chips stay put while the ledger crosses', async ({ app, page }) => {
    await app.open();
    await app.goto('txns');
    const before = await page.locator('#search-input').boundingBox();

    await app.swipe(1);

    const after = await page.locator('#search-input').boundingBox();
    expect(after.y).toBeCloseTo(before.y, 0);
    await expect(page.locator('[data-testid="activity-list"]')).toBeVisible();
  });
});

/* ---------------- the + menu ---------------- */

test.describe('the + menu', () => {
  test('the FAB fans out into the three things that get logged', async ({ app, page }) => {
    await app.open();
    await expect(page.locator('[data-testid="fab-menu"]')).toHaveCount(0);

    await page.locator('[data-testid="fab"]').click();
    await expect(page.locator('[data-testid="fab-item"]')).toHaveText([
      'Log transaction', 'Scheduled expense', 'Debt / receivable'
    ]);
  });

  test('each entry opens its own editor', async ({ app, page }) => {
    await app.open();

    for (const [label, sheet] of [
      ['Log transaction', 'add'],
      ['Scheduled expense', 'recurring'],
      ['Debt / receivable', 'debt']
    ]) {
      await page.locator('[data-testid="fab"]').click();
      await app.fabMenu(label);
      await expect(page.locator('[data-sheet="' + sheet + '"]')).toBeVisible();
      await app.dismiss();
    }
  });

  test('a tap outside puts the menu away without opening anything', async ({ app, page }) => {
    await app.open();
    await page.locator('[data-testid="fab"]').click();
    await page.locator('[data-testid="fab-scrim"]').click({ position: { x: 20, y: 20 } });

    await expect(page.locator('[data-testid="fab-menu"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="sheet"]')).toHaveCount(0);
  });

  test('the scheduled and debt editors open blank, not on the last row', async ({ app, page }) => {
    await app.open();
    await app.goto('scheduled');
    await page.locator('[data-testid="row"]', { hasText: 'Netflix' }).first().click();
    await app.dismiss();

    await page.locator('[data-testid="fab"]').click();
    await app.fabMenu('Scheduled expense');
    expect(await page.evaluate(() => window.__paisa.ui.editRecurring.name)).toBe('');
  });
});

/* ---------------- SMS into a draft ---------------- */

test.describe('filling an entry from an SMS', () => {
  test('the parse lands in the add sheet rather than saving itself',
    async ({ app, page }) => {
      await app.open();
      const before = await page.locator('[data-testid="row"]').count();

      await app.openAddSheet();
      await page.locator('[data-testid="smsbtn"]').click();
      await expect(page.locator('[data-sheet="sms"]')).toBeVisible();

      // "Tk 849.00 paid to GRAMEENPHONE" - Rocket's bill-pay rule, and a
      // merchant keyword that beats the rule's own default category.
      await page.locator('[data-testid="sheet-body"]').getByText('Rocket bill').click();
      await page.locator('[data-testid="sheet-body"]').getByText('Run parser').click();
      await page.locator('[data-testid="sms-confirm"]').click();

      // Back on the draft, filled in - and nothing written yet.
      await expect(page.locator('[data-sheet="add"]')).toBeVisible();
      await expect(page.locator('[data-testid="amount-val"]')).toHaveText('849');
      await expect(page.locator('[data-testid="savebtn"]')).toContainText('849');

      const ui = await page.evaluate(() => window.__paisa.ui);
      expect(ui.entryAccount).toBe('a5');
      expect(ui.entryCat).toBe('c5');
      expect(ui.entrySource).toBe('sms');
      expect(ui.entryNote).toBe('grameenphone');

      await app.goto('txns');
      expect(await page.locator('[data-testid="row"]').count()).toBe(before);
    });

  test('the filled draft saves as a normal transaction', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await page.locator('[data-testid="smsbtn"]').click();
    await page.locator('[data-testid="sheet-body"]').getByText('Rocket bill').click();
    await page.locator('[data-testid="sheet-body"]').getByText('Run parser').click();
    await page.locator('[data-testid="sms-confirm"]').click();
    await page.locator('[data-testid="savebtn"]').click();

    const db = await app.db();
    const saved = db.txns.find(t => t.source === 'sms');
    expect(saved.amount).toBe(849);
    expect(saved.account).toBe('a5');
    expect(saved.date).toBe(CLOCK.slice(0, 10));
  });

  test('backing out returns to the draft, not to nothing', async ({ app, page }) => {
    await app.open();
    await app.openAddSheet();
    await app.pickAccount('Cash wallet');
    await page.locator('[data-testid="catchip"]', { hasText: 'Groceries' }).click();
    await app.keys(['4', '2', '0']);

    await page.locator('[data-testid="smsbtn"]').click();
    await page.locator('[data-testid="closebtn"]').click();

    await expect(page.locator('[data-sheet="add"]')).toBeVisible();
    await expect(page.locator('[data-testid="amount-val"]')).toHaveText('420');
  });

  test('reached on its own the parser still writes the transaction itself',
    async ({ app, page }) => {
      await app.open();
      await app.goto('txns');
      await page.locator('[data-testid="roundbtn"]').first().click();

      await page.locator('[data-testid="sheet-body"]').getByText('Rocket bill').click();
      await page.locator('[data-testid="sheet-body"]').getByText('Run parser').click();
      await expect(page.locator('[data-testid="sms-confirm"]')).toHaveText('Confirm & save');
      await page.locator('[data-testid="sms-confirm"]').click();

      await expect(page.locator('[data-testid="sheet"]')).toHaveCount(0);
      const db = await app.db();
      expect(db.txns.find(t => t.source === 'sms').amount).toBe(849);
    });
});

/* ---------------- Home: the debt toggle ---------------- */

/** The headline, as a number. `fmt` groups thousands and prefixes the symbol. */
async function headline(page) {
  const text = await page.locator('[data-testid="balance-value"]').innerText();
  return Number(text.replace(/[^0-9.-]/g, ''));
}

const debtChip = (page) =>
  page.locator('[data-testid="chip"]', { hasText: 'Include debt' });

test.describe('home debt toggle', () => {
  test('the headline nets in lent and owed money, and remembers the choice',
    async ({ app, page }) => {
      await app.open();

      const sums = await page.evaluate(() => ({
        net: window.__paisa.netWorth(),
        debt: window.__paisa.debtTotals().net
      }));
      expect(sums.debt,
        'the seed needs open debts, otherwise the toggle is hidden and this proves nothing'
      ).not.toBe(0);

      // Off by default: the headline is net worth alone.
      await expect(debtChip(page)).toHaveAttribute('data-on', '0');
      expect(await headline(page)).toBe(Math.round(sums.net));

      await debtChip(page).click();

      await expect(debtChip(page)).toHaveAttribute('data-on', '1');
      expect(await headline(page)).toBe(Math.round(sums.net + sums.debt));

      // The preference is written to the settings table, so it survives a boot.
      await page.reload();
      await page.waitForSelector('#boot[data-gone="1"]', { state: 'attached' });
      await expect(debtChip(page)).toHaveAttribute('data-on', '1');
      expect(await headline(page)).toBe(Math.round(sums.net + sums.debt));
    });

  test('the owing strip sits above the primary card, not below the accounts',
    async ({ app, page }) => {
      await app.open();

      const y = async (locator) => (await locator.first().boundingBox()).y;

      const owing = await y(page.getByText('Owed to you'));
      expect(owing).toBeGreaterThan(await y(page.locator('[data-testid="balance-value"]')));
      expect(owing).toBeLessThan(await y(page.getByText('· primary')));
      expect(owing).toBeLessThan(await y(page.locator('[data-testid="row"]')));
    });

  test('no open debts means no toggle and no strip', async ({ app, page }) => {
    const db = await freshDb(page);
    db.debts = [];
    db.debtPayments = [];
    await app.open(db);

    await expect(debtChip(page)).toHaveCount(0);
    await expect(page.getByText('Owed to you')).toHaveCount(0);
  });
});

/** A pristine seeded database, read from a throwaway app load. */
async function freshDb(page) {
  await page.goto('/');
  await page.waitForSelector('#boot[data-gone="1"]', { state: 'attached' });
  return page.evaluate(() => JSON.parse(window.localStorage.getItem('paisa.db.v1')));
}
