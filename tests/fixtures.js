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
    // A fixed clock freezes document.timeline, so any CSS animation stops at
    // frame zero and every measurement reads a mid-flight transform - the
    // sheet would appear to sit 800px below the fold. Asking for reduced
    // motion zeroes the app's durations, which is also what a real user with
    // that preference gets, so this tests the same code path they see.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install({ time: new Date(CLOCK) });

    const app = {
      /** Open the app with optional pre-seeded localStorage. */
      async open(seed) {
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
        await page.waitForSelector('.boot--gone', { state: 'attached' });
        // The screen body is built in the same pass as the boot fade.
        await expect(page.locator('#scroll')).not.toBeEmpty();
      },

      /** The persisted database, as the app has it right now. */
      db() {
        return page.evaluate(k => JSON.parse(window.localStorage.getItem(k)), DB_KEY);
      },

      goto(screen) {
        return page.evaluate(s => window.__paisa.go(s), screen);
      },

      openAddSheet() {
        return page.locator('.fab').click();
      },

      /** Tap a sequence of keypad labels: '1', '×', 'del', '='. */
      async keys(labels) {
        for (const k of labels) {
          // The delete key is drawn as the backspace glyph.
          const label = k === 'del' ? '⌫' : k;
          await page.locator('.keypad__key', { hasText: new RegExp('^' + escape(label) + '$') })
            .first().click();
        }
      },

      /** Dismiss a sheet by tapping the scrim above it, not through it. */
      dismiss() {
        return page.locator('.scrim').click({ position: { x: 10, y: 10 } });
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

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export { expect };
