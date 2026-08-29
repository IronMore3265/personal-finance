// Shell: header, screen swapping, sheets, toast, FAB, nav bar.
//
// A render pass touches only the regions the store says a change can affect,
// and inside a region it patches rather than rebuilds - see core/dom.js. A tap
// that changes one number rewrites that number and nothing else, so scroll
// offsets, sideways chip scroll, focus, caret and any animation already
// running are simply never disturbed.
//
// The two places that do rebuild are the two that are meant to be seen
// arriving: moving to a different screen, and opening a different sheet. Those
// are transitions, not re-renders, and they own the only entrance animations
// left in the shell.

import { el, clear, patch } from './core/dom.js';
import { pushIn, stagger } from './core/motion.js';
import { store } from './core/store.js';
import * as calc from './core/calc.js';
import { icon } from './ui/icons.js';
import { TAP, PRESS } from './ui/styles.js';
import { bindSheetDrag } from './ui/dragsheet.js';
import { dateDialog } from './ui/datepicker.js';

/* Shell recipes. The nav and the header are the only chrome the app draws. */
const STATUSBAR = 'flex-none h-9 flex items-center justify-between px-6 '
  + 'font-ui font-bold text-[11.5px] text-ink tracking-[.02em] normal-nums';
const HEADER = 'flex-none flex items-center justify-between gap-2.5 pt-1.5 px-[22px] pb-2.5';
/*
 * The icons are 26px rather than 22px, but the bar is only as tall as the row
 * it holds: 12 + 26 + 8 + 6 leaves a 20px foot under the dot and nothing more.
 * The three offsets that clear it - the scroll padding, the FAB and the toast
 * - are keyed to this height and move with it.
 */
const NAV_BAR = 'h-[calc(72px+var(--safe-b))] pt-[12px] pb-[var(--safe-b)] bg-surface '
  + 'border-t border-line flex items-start';
const NAV_ITEM = 'flex-1 flex flex-col items-center gap-2';
const NAV_ICON = 26;
/*
 * The pill at the top of a sheet: what says it can be pulled down.
 *
 * The pill is 38px wide but the grab target is the full width of the sheet -
 * a thumb aims at the top edge, not at a 38x4 rectangle. `touch-action: none`
 * is what actually makes the pull work on a device: without it the browser
 * claims the vertical swipe for scrolling and cancels the gesture before it
 * has moved a pixel.
 */
const GRAB_ZONE = 'flex-none w-full pt-2.5 pb-1 flex justify-center [touch-action:none]';
const GRABBER = 'w-[38px] h-1 rounded-pill bg-line';

import { renderHome } from './screens/home.js';
import { renderActivity } from './screens/activity.js';
import { renderBudgets } from './screens/budgets.js';
import { renderReports } from './screens/reports.js';
import { renderSettings } from './screens/settings.js';
import { renderCategories } from './screens/categories.js';
import { renderAccounts } from './screens/accounts.js';
import { renderScheduled } from './screens/scheduled.js';
import { renderAddSheet, saveButtonLabel, addDateSpec } from './sheets/add.js';
import { renderSmsSheet } from './sheets/sms.js';
import { renderEntitySheet } from './sheets/entity.js';
import { renderDebtSheet, debtDateSpec } from './sheets/debt.js';
import { renderRecurringSheet, recurringDateSpec } from './sheets/recurring.js';
import { renderSyncSheet } from './sheets/sync.js';

const TITLES = {
  home: 'Dashboard',
  txns: 'Activity',
  budgets: null, // depends on the Budgets/Goals/Debts segment
  reports: 'Account analytics',
  settings: 'Settings',
  categories: 'Categories',
  accounts: 'Accounts',
  scheduled: 'Scheduled'
};

const SCREENS = {
  home: renderHome,
  txns: renderActivity,
  budgets: renderBudgets,
  reports: renderReports,
  settings: renderSettings,
  categories: renderCategories,
  accounts: renderAccounts,
  scheduled: renderScheduled
};

const SHEETS = {
  add: renderAddSheet,
  sms: renderSmsSheet,
  entity: renderEntitySheet,
  debt: renderDebtSheet,
  recurring: renderRecurringSheet,
  sync: renderSyncSheet
};

/*
 * The three sheets that ask for a date, and what each wants in the dialog.
 *
 * The dialog floats in the overlay layer rather than inside a sheet - a card
 * in the sheet's tree would be clipped by the body's own scroll, and would
 * scroll away with it. The shell owns the position; each sheet still owns what
 * the dialog is for.
 */
const SHEET_DATES = {
  add: addDateSpec,
  debt: debtDateSpec,
  recurring: recurringDateSpec
};

// Screens reached from Settings rather than from the bar; they light the same
// nav item, so the bar never shows nothing selected.
const UNDER_SETTINGS = ['settings', 'reports', 'categories', 'accounts', 'scheduled'];

const NAV = [
  ['home', 'pie', (s) => s === 'home'],
  ['txns', 'transfer', (s) => s === 'txns'],
  ['budgets', 'target', (s) => s === 'budgets'],
  ['settings', 'person', (s) => UNDER_SETTINGS.includes(s)]
];

const dom = {};
let lastScreen = null;
let lastSheet = null;
// Whether the keypad was up on the previous pass, so its slide-in animation
// runs when it opens and not on every key thereafter.
let lastKeypad = false;
// The same, for the date dialog: it pops in when it opens, and then stays put
// while you page through months inside it.
let lastDate = false;

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

const isNative = () =>
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform();

/**
 * The "9:41" bar in the prototype is a mockup convention. On a device the real
 * status bar already sits there, so this is only drawn in a browser, where it
 * completes the artboard.
 */
function statusBar() {
  return el('div', { class: STATUSBAR, dataset: { testid: 'statusbar' } }, [
    el('span', { text: '9:41' }),
    el('div', { class: 'flex gap-1.5 items-center' }, [
      icon('wifi', 15, { weight: 1.8 }),
      el('div', {
        class: 'relative w-5 h-2.5 border-[1.6px] border-ink rounded-[3px]'
      }, [el('i', { class: 'absolute inset-0.5 right-1.5 bg-ink rounded-[1px]' })])
    ])
  ]);
}

/**
 * The title, and nothing else.
 *
 * The bar used to carry a back arrow on the left and an export arrow on the
 * right. Neither earned its place. Every screen the app has is one tap away on
 * the nav bar, and the three under Settings are reached from a list you can
 * get back to the same way - so the arrow was a second route to somewhere you
 * were never more than one tap from, and it sat next to a title that already
 * said where you were. The export arrow duplicated the Export row in Settings,
 * where you go when you are looking for it, and read as "share this screen",
 * which is not what it did.
 *
 * Losing both leaves the title centred by the bar rather than by two buttons,
 * which is where it always looked centred anyway - Home has been drawing a
 * spacer to fake exactly this.
 */
function header() {
  const screen = store.ui.screen;

  const SEG_TITLE = { goals: 'Goals', debts: 'Debts', budgets: 'Budgets' };
  const title = TITLES[screen] || SEG_TITLE[store.ui.budgetSeg] || 'Budgets';

  return el('div', { class: HEADER }, [
    el('div', {
      // Line-height 1.4, not 1. At /[1] the box is exactly 17px tall and the
      // ellipsis needs overflow:hidden, so the descender of the g in Settings
      // and Budgets was sliced off by the header's own bottom edge. Titles
      // without a descender - Paisa, Activity, Accounts - never showed it.
      //
      // The min-height is what the buttons used to hold open. Without it the
      // bar would lose 21px now that the row is a line of text, moving every
      // screen up by that much.
      class: 'flex-1 min-h-[38px] flex items-center justify-center text-center '
        + 'font-ui font-bold text-[17px]/[1.4] text-ink tracking-[-.02em] normal-nums '
        + 'whitespace-nowrap overflow-hidden text-ellipsis',
      text: title
    })
  ]);
}

function nav() {
  return el('div', { class: NAV_BAR }, NAV.map(([id, glyph, isOn]) => {
    const on = isOn(store.ui.screen);
    return el('div', {
      class: NAV_ITEM + ' ' + TAP + (on ? ' text-ink' : ' text-ink3'),
      onClick: () => store.go(id)
    }, [
      icon(glyph, NAV_ICON),
      // Active state is an ink icon over a lime dot - no fill, no pill, no label.
      el('div', {
        class: 'w-1.5 h-1.5 rounded-full ' + (on ? 'bg-accent' : 'bg-transparent')
      })
    ]);
  }));
}

/** Lime FAB, floating clear of the bar rather than notched into it. */
function fab() {
  return el('div', {
    class: 'absolute right-[22px] bottom-[calc(90px+var(--safe-b))] w-14 h-14 '
      + 'rounded-full bg-accent text-accent-ink flex items-center justify-center '
      + 'shadow-[var(--sh-fab)] z-[4] ' + PRESS,
    dataset: { testid: 'fab' },
    // Always a blank draft: the sheet doubles as the editor, so without this
    // the FAB would reopen whatever transaction was last edited.
    onClick: () => store.set(store.resetEntry({ sheet: 'add' }))
  }, [icon('plus', 24, { weight: 2.4 })]);
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

/**
 * Remember where the caret was, in case a rebuild drops the keyboard.
 *
 * Patching leaves the field itself alone, so on an ordinary pass there is
 * nothing to restore. This is for the two passes that do replace nodes - a
 * screen swap and a sheet opening - where the field the caret was in may not
 * survive.
 */
function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.id || !('selectionStart' in a)) return null;
  return { id: a.id, start: a.selectionStart, end: a.selectionEnd };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const node = document.getElementById(snapshot.id);
  if (!node || node === document.activeElement) return;
  node.focus({ preventScroll: true });
  try { node.setSelectionRange(snapshot.start, snapshot.end); } catch { /* not a text input */ }
}

/**
 * Repaint just the amount line and the save button.
 *
 * The keypad is the hottest control in the app, and these are the only nodes a
 * keystroke can reach, so they are written directly rather than through a
 * patch pass. If any of them is missing the caller falls back to a full sheet
 * render.
 */
function patchAmount() {
  const val = document.querySelector('[data-testid="amount-val"]');
  const expr = document.querySelector('[data-testid="amount-expr"]');
  const save = document.querySelector('[data-testid="savebtn"]');
  if (!val || !expr || !save) return false;

  const { entryExpr, entryAmount, entryValue } = store.ui;
  const items = store.ui.entryItems;

  val.textContent = items.length
    ? Math.round(store.entryTotal()).toLocaleString('en-US')
    : calc.displayText(entryExpr, entryAmount, entryValue);
  expr.textContent = items.length ? '' : calc.exprText(entryExpr, entryAmount);

  const total = store.entryTotal();
  save.textContent = saveButtonLabel(total);
  // The ready state is utility classes now, not a modifier class, so it has to
  // be swapped rather than toggled: a `.savebtn--ready` rule in the components
  // layer would lose to the `bg-soft` utility already on the node.
  save.classList.toggle('bg-accent', !!total);
  save.classList.toggle('text-accent-ink', !!total);
  save.classList.toggle('bg-soft', !total);
  save.classList.toggle('text-ink3', !total);
  save.dataset.ready = total ? '1' : '0';

  // A line item being edited shows its own running amount in the row.
  if (store.ui.entryFocusItem) {
    const row = document.getElementById('item-amt-' + store.ui.entryFocusItem);
    if (row) row.textContent = calc.displayText(entryExpr, entryAmount, entryValue);
  }
  return true;
}

/**
 * Bring the selected chip of each horizontal row into view.
 *
 * A `.chiprow` scrolls sideways, and the selection is frequently past the
 * right edge - the Netflix rule is charged to the sixth account, so the sheet
 * opened showing three chips, none of them the one in use.
 *
 * On arrival only. The rows survive an ordinary pass now, keeping whatever
 * scroll the user left them at, and nudging them again on every render would
 * drag a row that had just been scrolled by hand back under the selection.
 */
function revealSelectedChips(scope) {
  for (const row of scope.querySelectorAll('[data-testid="chiprow"]')) {
    const on = row.querySelector('[data-testid="chip"][data-on="1"]');
    if (!on) continue;
    const rowBox = row.getBoundingClientRect();
    const chipBox = on.getBoundingClientRect();
    if (chipBox.left >= rowBox.left && chipBox.right <= rowBox.right) continue;
    row.scrollLeft = Math.max(0, on.offsetLeft - 12);
  }
}

function renderSheet() {
  // A different sheet - or none at all - is an entrance, and the only case
  // that builds from scratch. The same sheet redrawn after a tap inside it is
  // patched, so it neither replays the slide-up nor loses where it was
  // scrolled to.
  const entering = store.ui.sheet !== lastSheet;
  const keysEntering = store.ui.keypadOpen && !lastKeypad;

  lastSheet = store.ui.sheet;
  lastKeypad = !!store.ui.keypadOpen;

  if (!store.ui.sheet) { clear(dom.overlay); lastDate = false; return; }

  const scrim = el('div', {
    class: 'absolute inset-0 bg-black/50 z-10'
      + (entering ? ' [animation:fadeIn_var(--dur-micro)_ease]' : ''),
    dataset: { testid: 'scrim' },
    onClick: () => store.set({ sheet: null })
  });

  const build = SHEETS[store.ui.sheet] || renderAddSheet;
  const sheet = build();
  // Identity for the tests, set here rather than in six sheet files - and
  // keyed off which sheet is open, so it stays right when several of them
  // share a size class.
  sheet.dataset.testid = 'sheet';
  sheet.dataset.sheet = store.ui.sheet;

  // A grabber, and the gesture it advertises. Added here rather than in the
  // six sheet builders so every sheet gets both without knowing about either.
  sheet.insertBefore(
    el('div', { class: GRAB_ZONE, dataset: { testid: 'sheet-grab' } },
      [el('div', { class: GRABBER })]),
    sheet.firstChild);

  // The date dialog, when the open sheet is asking for one. It goes in the
  // overlay beside the sheet rather than inside it, so the sheet's scroll and
  // its rounded clip have nothing to do with where the card sits - and so a
  // tap beside the card reaches a scrim of its own, which puts the dialog away
  // and leaves the sheet open underneath.
  const spec = (SHEET_DATES[store.ui.sheet] || (() => null))();
  const dateEntering = !!spec && !lastDate;
  lastDate = !!spec;

  const dialog = spec ? dateDialog({ ...spec, today: store.today }) : null;
  if (dialog && dateEntering) {
    dialog.querySelector('[data-testid="datedialog-card"]').classList.add('dialog--enter');
  }

  if (entering) {
    sheet.classList.add('sheet--enter');
    clear(dom.overlay);
    dom.overlay.appendChild(scrim);
    dom.overlay.appendChild(sheet);
    if (dialog) dom.overlay.appendChild(dialog);
  } else {
    patch(dom.overlay, [scrim, sheet, dialog].filter(Boolean));
  }

  // The node actually on screen, which after a patch is the one that was
  // already there rather than the one just built. Found by its testid rather
  // than as the last child, which is the dialog whenever one is open.
  const live = dom.overlay.querySelector('[data-testid="sheet"]');
  // Idempotent: re-binding a sheet that is already bound only re-claims the
  // touch handles that the patch pass cleared off its children.
  bindSheetDrag(live, () => store.set({ sheet: null }));

  if (keysEntering) {
    const foot = live.querySelector('[data-foot="keys"]');
    if (foot) foot.classList.add('sheet__foot--enter');
  }

  if (entering) revealSelectedChips(dom.overlay);
}

function render(_store, regions) {
  const r = regions || new Set(['header', 'body', 'sheet', 'toast', 'nav']);
  const screen = store.ui.screen;
  const changed = screen !== lastScreen;
  // Only the two rebuilding paths can lose the caret. On a patched pass the
  // field is never replaced, so there is nothing to snapshot.
  const focus = ((changed && r.has('body')) || r.has('sheet')) ? captureFocus() : null;

  // The amount region is a direct write, not even a patch. When the nodes are
  // not there (the sheet was just opened) it upgrades itself to a sheet render.
  if (r.has('amount') && !r.has('sheet')) {
    if (patchAmount()) { restoreFocus(focus); return; }
    r.add('sheet');
  }

  if (r.has('header')) {
    const bar = header();
    patch(dom.header, bar ? [bar] : []);
  }

  if (r.has('body')) {
    const content = SCREENS[screen]();

    if (changed) {
      // A different screen is a transition, not a re-render: the outgoing
      // content has nothing in common with the incoming one, and the push and
      // the stagger are the whole point of the moment.
      clear(dom.scroll);
      content.forEach(node => dom.scroll.appendChild(node));
      pushIn(dom.scroll, store.ui.direction);
      stagger(dom.scroll);
      dom.scroll.scrollTop = 0;
      lastScreen = screen;
      revealSelectedChips(dom.scroll);
    } else {
      // Same screen: write the differences into what is already on it. Scroll
      // position, sideways chip scroll, focus and caret are preserved by never
      // being disturbed, so none of them need saving and restoring around it.
      patch(dom.scroll, content);
    }
  }

  if (r.has('sheet') || r.has('amount')) renderSheet();

  if (r.has('toast')) {
    patch(dom.toast, store.ui.toast ? [el('div', {
      class: 'absolute left-[22px] right-[22px] bottom-[calc(92px+var(--safe-b))] '
        + 'bg-ink text-bg rounded-box py-[14px] px-4 font-ui font-semibold '
        + 'text-[12px]/[1.4] text-center z-[15] normal-nums '
        + '[animation:popIn_var(--dur-micro)_ease]',
      dataset: { testid: 'toast' },
      text: store.ui.toast
    })] : []);
  }

  if (r.has('nav')) patch(dom.nav, [fab(), nav()]);

  restoreFocus(focus);
}

/* ------------------------------------------------------------------ *
 * Native integration
 * ------------------------------------------------------------------ */

async function wireNative() {
  if (!isNative()) return;
  const { App, StatusBar } = window.Capacitor.Plugins || {};

  if (StatusBar) {
    const paint = () => StatusBar.setStyle({ style: store.ui.dark ? 'DARK' : 'LIGHT' })
      .catch(() => { /* older Android returns unimplemented for some styles */ });
    paint();
    store.subscribe(paint);
  }

  if (App) {
    // Back closes the date dialog first, then the sheet under it, then walks
    // back to Home, then exits - innermost thing on the screen first. This is
    // the only back affordance now that the header has none, so it has to
    // unwind the whole stack rather than just the sheet.
    App.addListener('backButton', () => {
      const spec = (SHEET_DATES[store.ui.sheet] || (() => null))();
      if (spec) { spec.onClose(); return; }
      if (store.ui.sheet) { store.set({ sheet: null }); return; }
      if (store.ui.screen !== 'home') { store.go('home'); return; }
      App.exitApp();
    });
  }
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

async function boot() {
  dom.root = document.getElementById('app');
  dom.header = document.getElementById('header');
  dom.scroll = document.getElementById('scroll');
  dom.overlay = document.getElementById('overlay');
  dom.toast = document.getElementById('toast');
  dom.nav = document.getElementById('nav');

  if (isNative()) {
    // Real status bar above us; keep clear of it instead of drawing a fake one.
    dom.root.classList.add('native');
  } else {
    dom.root.insertBefore(statusBar(), dom.header);
  }

  await store.init();
  store.subscribe(render);
  render();
  await wireNative();

  // The store, reachable from a console. There is no devtools panel for a
  // vanilla app, so this is how you inspect state over chrome://inspect on a
  // device - and how the browser tests assert things the DOM cannot show.
  window.__paisa = store;

  const boot = document.getElementById('boot');
  boot.classList.add('boot--gone');
  boot.dataset.gone = '1';
  boot.addEventListener('transitionend', () => boot.remove(), { once: true });
}

boot().catch(err => {
  console.error('[paisa] boot failed', err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Could not start: ' + (err.message || err);
});
