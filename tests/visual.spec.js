// Screen captures of every screen and sheet, in both themes.
//
// Two outputs from one pass. The comparison against the committed baselines in
// tests/visual.spec.js-snapshots/ is what fails a run; the plain PNGs written
// to docs/screens/verify/ are what you actually open to look at a change, side
// by side with the design captures in docs/screens/device/. Those are
// gitignored, so writing them every time costs nothing.
//
//   npm run shots                              capture and compare
//   npx playwright test visual -u              accept a deliberate change
//   npx playwright test visual --project=light one theme only

import { test, expect } from './fixtures.js';

/** Every state worth looking at, as a name and the taps that reach it. */
const STATES = [
  ['home', async () => {}],
  ['home-debt', async ({ page }) => {
    await page.locator('[data-testid="chip"]', { hasText: 'Include debt' }).click();
  }],
  ['activity', async ({ app }) => app.goto('txns')],
  ['budgets', async ({ app }) => app.goto('budgets')],
  ['goals', async ({ app, page }) => {
    await app.goto('budgets');
    await page.locator('[data-testid="tab"]', { hasText: 'Goals' }).click();
  }],
  ['debts', async ({ app, page }) => {
    await app.goto('budgets');
    await page.locator('[data-testid="tab"]', { hasText: 'Debts' }).click();
  }],
  ['reports', async ({ app }) => app.goto('reports')],
  ['settings', async ({ app }) => app.goto('settings')],
  ['categories', async ({ app }) => app.goto('categories')],
  ['accounts', async ({ app }) => app.goto('accounts')],
  ['scheduled', async ({ app }) => app.goto('scheduled')],

  ['add-sheet', async ({ app }) => app.openAddSheet()],
  ['add-groups-expanded', async ({ app, page }) => {
    await app.openAddSheet();
    await page.locator('[data-testid="sheet-body"] [data-testid="chiprow"]').first()
      .locator('[data-testid="chip"]', { hasText: 'Mobile wallet' }).click();
  }],
  // The bare sheet above is the empty draft; this is the same sheet once an
  // account and a category have been chosen and the grid has folded.
  ['add-filled', async ({ app }) => {
    await app.openFilledSheet();
  }],
  ['add-calculator', async ({ app }) => {
    await app.openFilledSheet();
    await app.keys(['2', '4', '0', '×', '2', '+', '8', '0', '0']);
  }],
  ['add-calendar', async ({ app, page }) => {
    await app.openFilledSheet();
    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
  }],
  // The two coarser panes. They are the same card at a different grain, and
  // nothing else in the app draws a twelve-cell grid, so they are worth a
  // capture of their own.
  ['add-calendar-months', async ({ app, page }) => {
    await app.openFilledSheet();
    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
    await page.locator('[data-testid="cal-month"]').click();
  }],
  ['add-calendar-years', async ({ app, page }) => {
    await app.openFilledSheet();
    await page.locator('[data-testid="daterow"] [data-testid="chip"]').last().click();
    await page.locator('[data-testid="cal-month"]').click();
    await page.locator('[data-testid="cal-month"]').click();
  }],
  ['add-items', async ({ app, page }) => {
    await app.openFilledSheet();
    for (const [label, amount] of [['Biryani', '1200'], ['Borhani', '240'], ['Kacchi', '800']]) {
      await page.locator('[data-testid="itemadd"]').click();
      await page.locator('[data-testid="itemrow-label"]').last().fill(label);
      await app.keys(amount.split(''));
    }
  }],
  ['add-edit-mode', async ({ app, page }) => {
    await app.goto('txns');
    await page.locator('[data-testid="row"]').first().click();
  }],
  ['entity-category', async ({ app, page }) => {
    await app.goto('categories');
    await page.locator('[data-testid="row"]', { hasText: 'Groceries' }).first().click();
  }],
  ['entity-account', async ({ app, page }) => {
    await app.goto('accounts');
    await page.locator('[data-testid="row"]', { hasText: 'City Bank' }).first().click();
  }],
  ['debt-sheet', async ({ app, page }) => {
    await app.goto('budgets');
    await page.locator('[data-testid="tab"]', { hasText: 'Debts' }).click();
    await page.locator('[data-testid="debtrow"]', { hasText: 'Rafi' }).click();
  }],
  // The calendar in a second sheet, to catch a picker that only the add sheet
  // was ever styled for.
  ['debt-calendar', async ({ app, page }) => {
    await app.goto('budgets');
    await page.locator('[data-testid="tab"]', { hasText: 'Debts' }).click();
    await page.locator('[data-testid="debtrow"]', { hasText: 'Rafi' }).click();
    await page.locator('[data-testid="daterow"] [data-testid="chip"]').first().click();
  }],
  ['recurring-sheet', async ({ app, page }) => {
    await app.goto('scheduled');
    await page.locator('[data-testid="row"]', { hasText: 'Netflix' }).first().click();
  }],
  ['sms-sheet', async ({ app, page }) => {
    await app.goto('txns');
    await page.locator('[data-testid="roundbtn"]').first().click();
  }]
];

for (const [name, reach] of STATES) {
  test(name, async ({ app, page }, testInfo) => {
    await app.open();
    await reach({ app, page });

    // The mock status bar clock is decoration; it must not decide a diff.
    const mask = [page.locator('[data-testid="statusbar"]')];

    await page.screenshot({
      path: 'docs/screens/verify/' + testInfo.project.name + '-' + name + '.png'
    });
    await expect(page).toHaveScreenshot(name + '.png', {
      mask,
      maxDiffPixelRatio: 0.01,
      animations: 'disabled'
    });
  });
}
