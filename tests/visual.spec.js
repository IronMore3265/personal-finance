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
  ['activity', async ({ app }) => app.goto('txns')],
  ['budgets', async ({ app }) => app.goto('budgets')],
  ['goals', async ({ app, page }) => {
    await app.goto('budgets');
    await page.locator('.tab', { hasText: 'Goals' }).click();
  }],
  ['debts', async ({ app, page }) => {
    await app.goto('budgets');
    await page.locator('.tab', { hasText: 'Debts' }).click();
  }],
  ['reports', async ({ app }) => app.goto('reports')],
  ['settings', async ({ app }) => app.goto('settings')],
  ['categories', async ({ app }) => app.goto('categories')],
  ['accounts', async ({ app }) => app.goto('accounts')],
  ['scheduled', async ({ app }) => app.goto('scheduled')],

  ['add-sheet', async ({ app }) => app.openAddSheet()],
  ['add-groups-expanded', async ({ app, page }) => {
    await app.openAddSheet();
    await page.locator('.sheet__body .chiprow').first()
      .locator('.chip', { hasText: 'Mobile wallet' }).click();
  }],
  ['add-calculator', async ({ app }) => {
    await app.openAddSheet();
    await app.keys(['2', '4', '0', '×', '2', '+', '8', '0', '0']);
  }],
  ['add-items', async ({ app, page }) => {
    await app.openAddSheet();
    for (const [label, amount] of [['Biryani', '1200'], ['Borhani', '240'], ['Kacchi', '800']]) {
      await page.locator('.itemadd').click();
      await page.locator('.itemrow__label').last().fill(label);
      await app.keys(amount.split(''));
    }
  }],
  ['add-edit-mode', async ({ app, page }) => {
    await app.goto('txns');
    await page.locator('.row').first().click();
  }],
  ['entity-category', async ({ app, page }) => {
    await app.goto('categories');
    await page.locator('.row', { hasText: 'Groceries' }).first().click();
  }],
  ['entity-account', async ({ app, page }) => {
    await app.goto('accounts');
    await page.locator('.row', { hasText: 'City Bank' }).first().click();
  }],
  ['debt-sheet', async ({ app, page }) => {
    await app.goto('budgets');
    await page.locator('.tab', { hasText: 'Debts' }).click();
    await page.locator('.debtrow', { hasText: 'Rafi' }).click();
  }],
  ['recurring-sheet', async ({ app, page }) => {
    await app.goto('scheduled');
    await page.locator('.row', { hasText: 'Netflix' }).first().click();
  }],
  ['sms-sheet', async ({ app, page }) => {
    await app.goto('txns');
    await page.locator('.smsbtn, .roundbtn').first().click();
  }]
];

for (const [name, reach] of STATES) {
  test(name, async ({ app, page }, testInfo) => {
    await app.open();
    await reach({ app, page });

    // The mock status bar clock is decoration; it must not decide a diff.
    const mask = [page.locator('.statusbar')];

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
