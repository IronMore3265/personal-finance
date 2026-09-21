// Shared harness for the browser tests.
//
// Three things every spec needs:
//   1. A console trap. The app's only failure surface is boot()'s catch, which
//      paints a message into #boot - a typo in a module is otherwise a silent
//      blank screen. Any pageerror or console.error fails the test.
//   2. A fixed clock, so date behaviour is testable and screenshots are stable.
//   3. Seeded storage, written before load, so the app opens on known data.

import { test as base, expect } from '@playwright/test';

export const CLOCK = '2026-08-28T10:00:00';
export const DB_KEY = 'paisa.db.v1';
/* Marks the sign-in screen as already waved past. See app.open below. */
export const SKIP_KEY = 'paisa.auth.skipped';
/* The offline floor in data/seed.js; the rate the suite pretends to fetch. */
export const SEED_USD_RATE = 122;

export const test = base.extend({
  // Collected console/page errors, asserted empty after every test.
  errors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => {
      if (m.type() === 'error') errors.push('console.error: ' + m.text());
    });
    await use(errors);
  },

  app: async ({ page, errors }, use) => {
    // Patterns a test has declared it expects; applied again at teardown so
    // errors logged after the tolerate() call are covered too.
    const tolerated = [];
    // Opened on first use by touchSwipe, and only there: raw touch input is
    // the one thing Playwright's own API cannot inject.
    let cdp = null;
    // A fixed clock freezes document.timeline, so any CSS animation stops at
    // frame zero and every measurement reads a mid-flight transform - the
    // sheet would appear to sit 800px below the fold. Asking for reduced
    // motion zeroes the app's durations, which is also what a real user with
    // that preference gets, so this tests the same code path they see.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: new Date(CLOCK) });

    /*
     * Pin the exchange rate.
     *
     * data/fx.js fetches USD/BDT at boot, and without this the suite reaches
     * the real service: every total on every screen then moves with the actual
     * market, so a screenshot taken today stops matching one taken last week
     * and a run with no network differs from one with. It is answered with the
     * same rate data/seed.js carries, so the money in a test is exactly the
     * money in the seed.
     *
     * Routes added by a test take precedence over this one, so the specs that
     * are about the rate itself still control it.
     */
    await page.route('**open.er-api.com**', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ rates: { BDT: SEED_USD_RATE } })
    }));

    const app = {
      /**
       * Open the app with optional pre-seeded localStorage.
       *
       * The sign-in screen is marked as already dismissed unless a test asks
       * for it with `openAtGate()`. It is a once-per-device prompt that covers
       * the whole shell, so leaving it up would put a gate in front of every
       * spec in the suite - none of which is about signing in.
       */
      async open(seed) {
        await page.addInitScript(k => window.localStorage.setItem(k, '1'), SKIP_KEY);
        if (seed !== undefined) {
          await page.addInitScript(
            ([key, value]) => {
              if (value === null) window.localStorage.removeItem(key);
              else window.localStorage.setItem(key, value);
            },
            [DB_KEY, seed === null ? null : JSON.stringify(seed)]
          );
        }
        await page.goto('/');
        await page.waitForSelector('#boot[data-gone="1"]', { state: 'attached' });
        // The screen body is built in the same pass as the boot fade.
        await expect(page.locator('#scroll')).not.toBeEmpty();
      },

      /**
       * Open with the sign-in screen up, the way a real first run sees it.
       *
       * Only the gate specs want this; everything else goes through open().
       */
      async openAtGate() {
        // No init script: a fresh context has no storage, so the flag open()
        // would have written is simply never written. Removing it on every
        // navigation instead would undo the click the test just made.
        await page.goto('/');
        await page.waitForSelector('#boot[data-gone="1"]', { state: 'attached' });
        await expect(page.locator('#gate')).not.toBeEmpty();
      },

      /** The persisted database, as the app has it right now. */
      db() {
        return page.evaluate(k => JSON.parse(window.localStorage.getItem(k)), DB_KEY);
      },

      goto(screen) {
        return page.evaluate(s => window.__paisa.go(s), screen);
      },

      /**
       * The FAB opens a menu now, not the add sheet - so reaching a draft is
       * two taps, and every test that used to go straight there goes through
       * here.
       */
      async openAddSheet() {
        await page.locator('[data-testid="fab"]').click();
        await app.fabMenu('Log transaction');
      },

      /** Pick one entry out of the open + menu. */
      fabMenu(label) {
        return page.locator('[data-testid="fab-item"]', { hasText: label }).click();
      },

      /**
       * Drag the screen body sideways.
       *
       * `dir` is the direction of travel through the tabs, not of the finger:
       * 1 moves the finger left to reach the next tab, -1 right for the
       * previous one. Stepped rather than jumped so the gesture passes the
       * axis test the way a real finger does.
       */
      async swipe(dir) {
        const box = await page.locator('#scroll').boundingBox();
        // Below the search box and the chip row, which own their own gestures.
        const y = box.y + Math.min(box.height - 20, 260);
        const x = box.x + box.width / 2;
        await page.mouse.move(x, y);
        await page.mouse.down();
        for (let step = 1; step <= 8; step++) {
          await page.mouse.move(x - dir * 20 * step, y);
        }
        await page.mouse.up();
      },

      /**
       * The same drag, as a finger makes it.
       *
       * Worth its own path rather than trusting `swipe` above. A mouse drag is
       * never arbitrated: the pointer stream runs to pointerup whatever
       * direction it goes. A finger is - Chrome decides on the first move
       * whether the pan belongs to a scroller, and where it claims the gesture
       * it ends the pointer stream in `pointercancel` a pixel in. That is
       * exactly how the swipe came to be dead on the phone while every mouse
       * test above stayed green, so the gesture needs one test that goes
       * through the real input pipeline. Synthetic `TouchEvent`s would not do
       * either - they raise no pointer events at all, and no arbitration.
       */
      async touchSwipe(dir, steps = 8) {
        cdp = cdp || await page.context().newCDPSession(page);
        const box = await page.locator('#scroll').boundingBox();
        // Below the search box and the chip row, which own their own gestures.
        const y = box.y + Math.min(box.height - 20, 260);
        const x = box.x + box.width / 2;
        await app.touchDrag(x, y, -dir * 20 * steps, 0, steps);
      },

      /** A finger, put down at (x, y) and moved by (dx, dy) over `steps`. */
      async touchDrag(x, y, dx, dy, steps = 8) {
        cdp = cdp || await page.context().newCDPSession(page);
        const at = (px, py) => [{ x: px, y: py, radiusX: 5, radiusY: 5, force: 1, id: 1 }];

        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart', touchPoints: at(x, y)
        });
        for (let step = 1; step <= steps; step++) {
          await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove',
            touchPoints: at(x + (dx * step) / steps, y + (dy * step) / steps)
          });
          // A frame between moves: the arbitration this exists to exercise is
          // made on the compositor, not on the event queue.
          await page.waitForTimeout(16);
        }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(50);
      },

      /**
       * Open the add sheet on a draft that is ready to save.
       *
       * Nothing below the account renders until one is chosen, and neither an
       * account nor a category is preselected any more - so every test that
       * touches the category grid, the items, the date, the note or the save
       * button needs this rather than the bare sheet.
       */
      async openFilledSheet(account = 'Cash wallet', category = 'Groceries') {
        await app.openAddSheet();
        await app.pickAccount(account);
        if (category) await page.locator('[data-testid="catchip"]', { hasText: category }).click();
      },

      /** Expand the account row's group and pick one account out of it. */
      async pickAccount(name) {
        const row = () => page.locator('[data-testid="sheet-body"] [data-testid="chiprow"]').first();
        const direct = row().locator('[data-testid="chip"]', { hasText: name });
        if (await direct.count()) { await direct.first().click(); return; }

        // Otherwise it is inside a group; open each until the account shows.
        for (const label of ['Cash', 'Bank account', 'Mobile wallet', 'Credit card']) {
          const group = row().locator('[data-testid="chip"]', { hasText: label });
          if (!await group.count()) continue;
          await group.first().click();
          const hit = row().locator('[data-testid="chip"]', { hasText: name });
          if (await hit.count()) { await hit.first().click(); return; }
          await row().locator('[data-testid="chip"][data-on="1"]').first().click();
        }
        throw new Error('no account chip called ' + name);
      },

      /**
       * Tap a sequence of keypad tokens: '1', '×', 'del'.
       *
       * Keys are addressed by their data-key rather than their face: the
       * operators and delete are drawn as icons and have no text at all.
       * Raises the keypad first, since it is only up while a number is
       * actually being entered.
       */
      async keys(labels) {
        if (!await page.locator('[data-testid="keypad"]').count()) {
          await page.locator('[data-testid="amount-row"]').click();
          await page.locator('[data-testid="keypad"]').waitFor();
        }
        for (const k of labels) {
          await page.locator('[data-testid="keypad-key"][data-key="' + k + '"]').first().click();
        }
      },

      /** Put the keypad away, the way the Done bar does. */
      closeKeys() {
        return page.locator('[data-foot="keys"] [data-testid="panelhead-done"]').click();
      },

      /** Dismiss a sheet by tapping the scrim above it, not through it. */
      dismiss() {
        return page.locator('[data-testid="scrim"]').click({ position: { x: 10, y: 10 } });
      },

      /**
       * Accept console errors matching `re` for this test.
       *
       * Only for tests that deliberately break something - a forced HTTP 500,
       * an aborted request - where the error is the behaviour being checked
       * rather than a regression.
       */
      tolerate(re) {
        for (let i = errors.length - 1; i >= 0; i--) {
          if (re.test(errors[i])) errors.splice(i, 1);
        }
        tolerated.push(re);
      },

      errors
    };

    await use(app);

    // Every test asserts a clean console, so a regression anywhere in the
    // module graph fails the nearest test rather than going unnoticed.
    const unexpected = errors.filter(e => !tolerated.some(re => re.test(e)));
    expect(unexpected, 'console should be clean').toEqual([]);
  }
});

export { expect };
