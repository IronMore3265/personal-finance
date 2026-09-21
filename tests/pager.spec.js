// The two things that only exist when the app is allowed to move.
//
// Every other spec runs under the fixture's reduced-motion default, which is
// deliberate - a frozen clock freezes document.timeline, so a running CSS
// animation would leave every measurement reading a mid-flight transform. But
// reduced motion is also the branch that skips the pager and paints the filter
// change in one go, so the whole of core/swipe.js's paging path and all of
// flipThrough() would otherwise never be executed by a test at all.
//
// So these tests undo both, per test, after open(): motion back on, clock
// resumed so setTimeout runs. Nothing here asserts a screenshot; what is
// checked is where the panes are while the finger is down, and that the ledger
// holds still while its contents change.

import { test, expect } from './fixtures.js';

async function withMotion(page) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.resume();
}

/** What the two panes are doing, read straight off the DOM. */
const panes = () => ({
  kids: document.getElementById('peek').children.length,
  vis: getComputedStyle(document.getElementById('peek')).visibility,
  tx: document.getElementById('peek').style.transform,
  sx: document.getElementById('scroll').style.transform
});

const screen = (page) => page.evaluate(() => window.__paisa.ui.screen);

/** A drag held open: the pointer is still down when this returns. */
async function dragTo(page, dx, steps = 6) {
  const box = await page.locator('#scroll').boundingBox();
  const y = box.y + 260;
  const x = box.x + box.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) await page.mouse.move(x + (dx * i) / steps, y);
  return { x, y };
}

test.describe('paging between tabs', () => {
  test('the next screen is drawn and tracks the finger one to one', async ({ app, page }) => {
    await app.open();
    await withMotion(page);

    expect(await page.evaluate(panes)).toMatchObject({ kids: 0, vis: 'hidden' });

    await dragTo(page, -120);

    const mid = await page.evaluate(panes);
    expect(mid.kids).toBeGreaterThan(0);
    expect(mid.vis).toBe('visible');
    // The whole point: 120px of finger is 120px of travel. The old gesture
    // damped this to 30% and never drew the neighbour at all.
    expect(mid.sx).toBe('translateX(-120px)');
    // And the neighbour sits exactly one pane to the right of where it lands.
    expect(mid.tx).not.toBe('');

    await page.mouse.up();
    await page.waitForTimeout(600);

    expect(await screen(page)).toBe('txns');
    // The preview is put away again; it is never the live screen.
    expect(await page.evaluate(panes)).toMatchObject({ kids: 0, vis: 'hidden', tx: '', sx: '' });
  });

  /**
   * The two panes must tile exactly, with no gap to show #pager through.
   *
   * They are parked with a percentage rather than `clientWidth` pixels on
   * purpose: clientWidth is an integer, and on a display whose CSS width is
   * fractional an integer park leaves a sliver of the shell's own background
   * between the panes.
   */
  test('the panes tile exactly, leaving no gap between them', async ({ app, page }) => {
    await app.open();
    await withMotion(page);

    await dragTo(page, -160);

    const gap = await page.evaluate(() => {
      const a = document.getElementById('scroll').getBoundingClientRect();
      const b = document.getElementById('peek').getBoundingClientRect();
      return b.left - a.right; // #peek is to the right on a leftward drag
    });
    expect(Math.abs(gap)).toBeLessThan(0.5);

    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await screen(page)).toBe('txns');
  });

  test('a short slow drag springs back and changes nothing', async ({ app, page }) => {
    await app.open();
    await withMotion(page);

    const box = await page.locator('#scroll').boundingBox();
    const y = box.y + 260, x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Past the slop, under the 56px commit, and slow enough to miss the
    // velocity shortcut that would otherwise carry it over anyway.
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(x - i * 6, y);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    await page.waitForTimeout(600);

    expect(await screen(page)).toBe('home');
    expect(await page.evaluate(panes)).toMatchObject({ kids: 0, vis: 'hidden', sx: '' });
  });

  test('the end of the bar resists instead of opening onto nothing', async ({ app, page }) => {
    await app.open();
    await withMotion(page);

    await dragTo(page, 120);

    const mid = await page.evaluate(panes);
    // Nothing is drawn, because there is nothing to the left of Home - and the
    // travel is damped to 8% so the edge is felt rather than merely refused.
    expect(mid.kids).toBe(0);
    expect(mid.sx).toBe('translateX(9.6px)');

    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await screen(page)).toBe('home');
  });

  test('reversing mid-drag redraws the neighbour on the new side', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');

    const shown = () => page.evaluate(() => document.getElementById('peek').textContent.slice(0, 40));

    const { x, y } = await dragTo(page, -80, 4);
    const forward = await shown();

    // Back across zero: the pane it was previewing is now parked on the wrong
    // edge, so the other neighbour has to take its place.
    for (let i = 1; i <= 8; i++) await page.mouse.move(x + i * 20, y);
    const backward = await shown();

    expect(forward).not.toBe('');
    expect(backward).not.toBe('');
    expect(backward).not.toBe(forward);

    await page.mouse.up();
    await page.waitForTimeout(600);
    expect(await screen(page)).toBe('home');
  });

  test('the pane that travelled is the one that lands, not a rebuild of it', async ({ app, page }) => {
    await app.open();
    await withMotion(page);

    // Stamp the nodes #peek built during the drag. If the landing rebuilds the
    // screen instead of adopting them, the stamp is gone - and with it goes the
    // reason the arrival is silent: a fresh tree replays the entrance stagger
    // over a pane the user has already watched arrive.
    await dragTo(page, -140, 6);
    const painted = await page.evaluate(() => {
      const kids = document.getElementById('peek').children;
      for (const k of kids) k.dataset.stamped = '1';
      return kids.length;
    });
    expect(painted).toBeGreaterThan(0);

    await page.mouse.up();
    await page.waitForTimeout(600);

    expect(await screen(page)).toBe('txns');
    const landed = await page.evaluate(() => ({
      stamped: document.querySelectorAll('#scroll > [data-stamped="1"]').length,
      total: document.getElementById('scroll').children.length,
      peek: document.getElementById('peek').children.length,
      // The stagger host class is swept off by a timeout, so what is checked is
      // that it was never applied: a staggered child carries an inline delay.
      delayed: [...document.querySelectorAll('#scroll > *')]
        .filter(n => n.style.animationDelay).length
    }));

    expect(landed.stamped).toBe(landed.total);
    expect(landed.peek).toBe(0);
    expect(landed.delayed).toBe(0);
  });
});

test.describe('the bar tracks the drag', () => {
  const chrome = () => ({
    title: document.querySelector('[data-role="title"]').textContent.trim(),
    fade: Math.round(parseFloat(getComputedStyle(
      document.querySelector('[data-role="title"]')).opacity) * 100),
    dot: Math.round(parseFloat(document.querySelector('[data-role="navdot"]').style.left) || 0)
  });

  /**
   * The pager put the next screen under the finger but left the bar behind, so
   * mid-drag the title named the screen sliding out while the one sliding in
   * was most of the way on. The title fades through and the dot travels.
   */
  test('the title and the dot move with the finger, not after it', async ({ app, page }) => {
    await app.open();
    await withMotion(page);

    const width = await page.evaluate(() => document.getElementById('pager').clientWidth);
    const rest = await page.evaluate(chrome);
    expect(rest.title).toBe('Dashboard');
    expect(rest.fade).toBe(100);

    // A fifth of the way: still the screen we are on, but visibly fading.
    const { x, y } = await dragTo(page, -Math.round(width * 0.2), 4);
    const early = await page.evaluate(chrome);
    expect(early.title).toBe('Dashboard');
    expect(early.fade).toBeLessThan(80);
    expect(early.dot).toBeGreaterThan(rest.dot);

    // Past halfway the name of the screen arriving has taken over, and it
    // sharpens up again as it lands rather than staying half faded.
    for (let i = 1; i <= 6; i++) {
      await page.mouse.move(x - (width * 0.2) - (width * 0.5 * i) / 6, y);
    }
    const late = await page.evaluate(chrome);
    expect(late.title).toBe('Activity');
    expect(late.dot).toBeGreaterThan(early.dot);

    await page.mouse.up();
    await page.waitForTimeout(700);

    const landed = await page.evaluate(chrome);
    expect(landed.title).toBe('Activity');
    expect(landed.fade).toBe(100);
    // And the dot has ended up under the tab it belongs to, not part way.
    const second = await page.evaluate(() => {
      const slots = document.querySelectorAll('[data-navslot]');
      const box = document.querySelector('[data-role="navdot"]').offsetParent.getBoundingClientRect();
      return Math.round(slots[1].getBoundingClientRect().left - box.left);
    });
    expect(landed.dot).toBe(second);
  });

  test('a drag that springs back leaves the bar where it was', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    const rest = await page.evaluate(chrome);

    const box = await page.locator('#scroll').boundingBox();
    const y = box.y + 260, x = box.x + box.width / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(x - i * 6, y);
      await page.waitForTimeout(40);
    }
    await page.mouse.up();
    await page.waitForTimeout(700);

    expect(await page.evaluate(chrome)).toEqual(rest);
  });

  /** Nothing to reveal at the end of the bar, so nothing to promise either. */
  test('the bar does not move where the panes cannot', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    const rest = await page.evaluate(chrome);

    await dragTo(page, 140);
    expect(await page.evaluate(chrome)).toEqual(rest);

    await page.mouse.up();
    await page.waitForTimeout(700);
    expect(await page.evaluate(chrome)).toEqual(rest);
  });
});

test.describe('sliding through the filters', () => {
  /** Every frame of the slide, sampled inside the page so none are missed. */
  const watch = () => {
    window.__seen = [];
    window.__seenStop = false;
    const tick = () => {
      if (window.__seenStop) return;
      const view = document.querySelector('[data-testid="activity-list"]');
      if (view) {
        window.__seen.push({
          panes: [...view.querySelectorAll('[data-role="ledger"]')].map(n => ({
            rows: n.querySelectorAll('[data-testid="row"]').length,
            tx: n.style.transform || ''
          })),
          cls: view.className,
          y: Math.round(view.getBoundingClientRect().y)
        });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  const counts = (page) => page.evaluate(() => ({
    all: window.__paisa.db.txns.length,
    expense: window.__paisa.db.txns.filter(t => t.type === 'expense').length,
    income: window.__paisa.db.txns.filter(t => t.type === 'income').length,
    sms: window.__paisa.db.txns.filter(t => t.source === 'sms').length
  }));

  const tapChip = (page, name) =>
    page.locator('[data-testid="chiprow"] [data-testid="chip"]', { hasText: name }).click();

  async function run(page, name) {
    await page.evaluate(watch);
    await tapChip(page, name);
    await page.waitForTimeout(1400);
    return page.evaluate(() => { window.__seenStop = true; return window.__seen; });
  }

  /**
   * The whole point of building the panes first. An arriving list must never
   * be seen filling up: by the time it has moved a pixel it is already
   * complete. The first cut patched the rows in place, so you watched the list
   * rewrite itself instead of watching it arrive.
   */
  test('the arriving list is complete before it moves', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');
    await page.waitForTimeout(1000);

    const n = await counts(page);
    const seen = await run(page, 'From SMS');

    const real = [n.all, n.expense, n.income, n.sms];
    const twoUp = seen.filter(f => f.panes.length === 2);
    expect(twoUp.length).toBeGreaterThan(3);

    // Every pane, on every frame it is on screen, holds a complete filter's
    // worth of rows - never a partial list being assembled.
    for (const frame of seen) {
      for (const pane of frame.panes) expect(real).toContain(pane.rows);
    }

    // And a pane still parked off to the side is already full.
    const offstage = twoUp.flatMap(f => f.panes.filter(pn => /-?100%/.test(pn.tx)));
    expect(offstage.length).toBeGreaterThan(0);
    for (const pane of offstage) expect(real).toContain(pane.rows);
  });

  /**
   * A jump of three chips is one slide, not three.
   *
   * The strip used to step through every filter in between, 130ms each, so that
   * how far you had jumped was something you watched. It reads as lag: half a
   * second to reach a list you already asked for. Direction still says which way
   * you went - the filters in between are simply never drawn.
   */
  test('a jump across the strip goes straight there', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');
    await page.waitForTimeout(1000);

    const n = await counts(page);
    const seen = await run(page, 'From SMS');

    const shown = new Set(seen.flatMap(f => f.panes.map(pn => pn.rows)));
    // Only the list left behind and the one asked for are ever on screen.
    expect(shown).toContain(n.sms);
    for (const rows of shown) expect([n.all, n.sms]).toContain(rows);

    expect(await page.locator('[data-testid="activity-list"] [data-testid="row"]').count())
      .toBe(n.sms);
  });

  /**
   * The frame must not cut the chips it slides.
   *
   * A category chip wears its colour as a 3px outset ring (iconChip), which
   * sits outside the row's box - so a frame that clips flush slices that ring
   * flat against its left edge for as long as the slide runs. On a device that
   * read as a white vertical line down the left of the list, appearing on every
   * filter change and vanishing when it landed. Measured on a Motorola Edge 50
   * at dpr 2.5, the chip's left edge sat at x=55 while sliding and x=48 once
   * settled: exactly the ring, cut off.
   *
   * ui/styles.js records the same bug being fixed once already, on ROW_TAP.
   */
  test('the frame gives the chip rings room rather than slicing them', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');
    await page.waitForTimeout(1000);

    await tapChip(page, 'Income');
    await page.waitForTimeout(60); // mid-slide, while .slide-view is on

    const clip = await page.evaluate(() => {
      const view = document.querySelector('[data-testid="activity-list"]');
      const cs = getComputedStyle(view);
      return {
        sliding: view.classList.contains('slide-view'),
        overflow: cs.overflowX,
        margin: parseFloat(cs.overflowClipMargin) || 0
      };
    });

    expect(clip.sliding).toBe(true);
    expect(clip.overflow).toBe('clip');
    // Wide enough for the 3px ring; 'hidden' (margin 0) is the regression.
    expect(clip.margin).toBeGreaterThanOrEqual(3);
  });

  /** The list moves. Nothing above it does. */
  test('the search box and the chips stay put while the ledger slides', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');
    await page.waitForTimeout(1000);

    const search = await page.locator('#search-input').boundingBox();
    const chips = await page.locator('[data-testid="chiprow"]').boundingBox();
    const seen = await run(page, 'Income');

    // The frame the panes move in never shifts on its own.
    expect(new Set(seen.map(f => f.y)).size).toBe(1);
    expect((await page.locator('#search-input').boundingBox()).y).toBeCloseTo(search.y, 0);
    expect((await page.locator('[data-testid="chiprow"]').boundingBox()).y).toBeCloseTo(chips.y, 0);
    // The tapped chip lights up at once, without the ledger being patched.
    await expect(page.locator('[data-testid="chiprow"] [data-testid="chip"][data-on="1"]'))
      .toHaveText('Income');
  });

  test('the slide sweeps up after itself', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');

    await tapChip(page, 'From SMS');
    await page.waitForTimeout(1400);

    // One pane, back in the flow, and the frame no longer holding a height -
    // left set, it would go stale the next time anything changed the list.
    expect(await page.evaluate(() => {
      const view = document.querySelector('[data-testid="activity-list"]');
      const panes = view.querySelectorAll('[data-role="ledger"]');
      return {
        panes: panes.length,
        cls: view.className,
        h: view.style.height,
        paneStyle: panes[0].getAttribute('style') || ''
      };
    })).toMatchObject({ panes: 1, cls: '', h: '', paneStyle: '' });
  });

  test('a second tap part way through takes over rather than racing', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');

    await tapChip(page, 'From SMS');
    await page.waitForTimeout(100);      // mid-slide
    await tapChip(page, 'Expense');
    await page.waitForTimeout(1400);

    const n = await counts(page);
    expect(await page.evaluate(() => window.__paisa.ui.filter)).toBe('expense');
    expect(await page.locator('[data-testid="activity-list"] [data-testid="row"]').count())
      .toBe(n.expense);
    expect(await page.evaluate(() => {
      const view = document.querySelector('[data-testid="activity-list"]');
      return { panes: view.querySelectorAll('[data-role="ledger"]').length, h: view.style.height };
    })).toMatchObject({ panes: 1, h: '' });
  });

  /** The list is still a list afterwards: searching it works as before. */
  test('a search after a slide still filters the list', async ({ app, page }) => {
    await app.open();
    await withMotion(page);
    await app.goto('txns');

    await tapChip(page, 'Expense');
    await page.waitForTimeout(1400);
    await page.locator('#search-input').fill('Aarong');
    await page.waitForTimeout(200);

    const rows = page.locator('[data-testid="activity-list"] [data-testid="row"]');
    expect(await rows.count()).toBeGreaterThan(0);
    for (const t of await rows.allTextContents()) expect(t).toContain('Aarong');
  });
});
