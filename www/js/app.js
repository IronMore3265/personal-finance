// Shell: header, screen swapping, sheets, toast, FAB, nav bar.
//
// A render pass rebuilds only the regions the store says a change can affect.
// Scroll position, focus and caret are carried across so typing and scrolling
// survive a render.

import { el, clear } from './core/dom.js';
import { pushIn, stagger } from './core/motion.js';
import { store, FILTERS } from './core/store.js';
import { exportCsv } from './core/exporter.js';
import * as calc from './core/calc.js';
import { icon } from './ui/icons.js';
import { TAP, PRESS } from './ui/styles.js';
import { bindSheetDrag } from './ui/dragsheet.js';
import { bindSwipe } from './core/swipe.js';

/* Shell recipes. The nav and the header are the only chrome the app draws. */
const STATUSBAR = 'flex-none h-9 flex items-center justify-between px-6 '
  + 'font-ui font-bold text-[11.5px] text-ink tracking-[.02em] normal-nums';
const ICONBTN = 'flex-none w-[38px] h-[38px] rounded-full bg-soft flex '
  + 'items-center justify-center text-ink';
const HEADER = 'flex-none flex items-center justify-between gap-2.5 pt-1.5 px-[22px] pb-2.5';
/*
 * The bar is 92px rather than 78px and its icons 26px rather than 22px, with
 * less padding above them so the row sits lower in the taller bar. The three
 * offsets that clear it - the scroll padding, the FAB and the toast - are
 * keyed to this height and move with it.
 */
const NAV_BAR = 'h-[calc(92px+var(--safe-b))] pt-[14px] pb-[var(--safe-b)] bg-surface '
  + 'border-t border-line flex items-start';
const NAV_ITEM = 'flex-1 flex flex-col items-center gap-2';
const NAV_ICON = 26;
/* The pill at the top of a sheet: what says it can be pulled down. */
const GRABBER = 'flex-none w-[38px] h-1 rounded-pill bg-line mx-auto mt-2.5 mb-1 '
  + '[touch-action:none]';

import { renderHome } from './screens/home.js';
import { renderActivity } from './screens/activity.js';
import { renderBudgets } from './screens/budgets.js';
import { renderReports } from './screens/reports.js';
import { renderSettings } from './screens/settings.js';
import { renderCategories } from './screens/categories.js';
import { renderAccounts } from './screens/accounts.js';
import { renderScheduled } from './screens/scheduled.js';
import { renderAddSheet, saveButtonLabel } from './sheets/add.js';
import { renderSmsSheet } from './sheets/sms.js';
import { renderEntitySheet } from './sheets/entity.js';
import { renderDebtSheet } from './sheets/debt.js';
import { renderRecurringSheet } from './sheets/recurring.js';
import { renderSyncSheet } from './sheets/sync.js';

// Home carries the wordmark instead of a title, so it has no entry here.
const TITLES = {
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

// Screens reached from Settings rather than from the bar; they light the same
// nav item, so the bar never shows nothing selected.
const UNDER_SETTINGS = ['settings', 'reports', 'categories', 'accounts', 'scheduled'];

const NAV = [
  ['home', 'pie', (s) => s === 'home'],
  ['txns', 'transfer', (s) => s === 'txns'],
  ['budgets', 'target', (s) => s === 'budgets'],
  ['settings', 'person', (s) => UNDER_SETTINGS.includes(s)]
];

/*
 * What a sideways swipe walks.
 *
 * The four tabs in bar order, and - before the swipe leaves a screen at all -
 * whatever tabs that screen has of its own. Activity's filter chips are its
 * sub-tabs, so a swipe there steps All -> Expense -> Income -> From SMS and
 * only then crosses to Budgets. The screens reached from Settings are not on
 * the list: they sit a level down and have no left/right relation to anything.
 */
const SWIPE_TABS = NAV.map(([id]) => id);

const SUB_TABS = {
  txns: { key: 'filter', order: FILTERS, set: (id, dir) => store.setFilter(id, dir) }
};

/** @param {number} dir 1 for the next tab (finger left), -1 for the previous. */
function swipeTarget(dir) {
  const screen = store.ui.screen;

  const sub = SUB_TABS[screen];
  if (sub) {
    const next = sub.order.indexOf(store.ui[sub.key]) + dir;
    if (next >= 0 && next < sub.order.length) return { sub, id: sub.order[next] };
  }

  const here = SWIPE_TABS.indexOf(screen);
  if (here < 0) return null;
  const screenNext = SWIPE_TABS[here + dir];
  return screenNext ? { screen: screenNext } : null;
}

function swipe(dir) {
  const target = swipeTarget(dir);
  if (!target) return;
  if (target.sub) { target.sub.set(target.id, dir); return; }

  // Arriving at a screen by swipe lands on the sub-tab nearest the edge it was
  // entered from, so the next swipe the same way has somewhere to go rather
  // than appearing to skip the screen entirely.
  const sub = SUB_TABS[target.screen];
  const edge = sub
    ? { [sub.key]: dir > 0 ? sub.order[0] : sub.order[sub.order.length - 1] }
    : null;
  store.go(target.screen, edge);
}

const dom = {};
let lastScreen = null;
let lastFilter = null;
let lastSheet = null;
const scrollMemory = {};
// Sheets are rebuilt like everything else, so their body needs the same
// scroll-position carry the screen body has had all along - without it, every
// tap inside the add sheet snapped it back to the top.
let sheetScroll = 0;
// Whether the keypad was up on the previous pass, so its slide-in animation
// runs when it opens and not on every key thereafter.
let lastKeypad = false;

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

function iconBtn(name, onClick, size = 17) {
  return el('div', { class: ICONBTN + ' ' + TAP, onClick }, [icon(name, size)]);
}

/** Home shows the wordmark; every other screen shows back / title / action. */
function header() {
  const screen = store.ui.screen;

  if (screen === 'home') {
    return el('div', { class: HEADER }, [
      // The wordmark carries the only lime on the header: a blob behind the P.
      el('div', { class: 'relative inline-block' }, [
        el('div', {
          class: 'absolute -right-[7px] -top-px w-5 h-5 rounded-full bg-[var(--accentBlob)]'
        }),
        el('div', {
          class: 'relative font-ui font-bold text-[19px]/[1] text-ink '
            + 'tracking-[-.02em] normal-nums',
          text: 'Paisa'
        })
      ]),
      // Only the theme toggle here. Settings is reached from the nav bar's
      // person tab, which is also what lights up on its sub-screens - two
      // doors to one room was the redundancy.
      el('div', { class: 'flex gap-2 flex-none' }, [
        iconBtn('moon', () => store.toggleDark())
      ])
    ]);
  }

  const SEG_TITLE = { goals: 'Goals', debts: 'Debts', budgets: 'Budgets' };
  const title = TITLES[screen] || SEG_TITLE[store.ui.budgetSeg] || 'Budgets';

  // The settings sub-screens are reached from Settings, so back goes there
  // rather than all the way home.
  const back = ['categories', 'accounts', 'scheduled'].includes(screen) ? 'settings' : 'home';

  return el('div', { class: HEADER }, [
    iconBtn('arrowLeft', () => store.go(back), 18),
    el('div', {
      // Line-height 1.4, not 1. At /[1] the box is exactly 17px tall and the
      // ellipsis needs overflow:hidden, so the descender of the g in Settings
      // and Budgets was sliced off by the header's own bottom edge. Titles
      // without a descender - Paisa, Activity, Accounts - never showed it.
      class: 'flex-1 text-center font-ui font-bold text-[17px]/[1.4] text-ink '
        + 'tracking-[-.02em] normal-nums whitespace-nowrap overflow-hidden text-ellipsis',
      text: title
    }),
    // "Export this view" in the prototype was a stub; here it runs the real
    // CSV export the app already ships.
    iconBtn('upload', () => exportCsv(store))
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
    class: 'absolute right-[22px] bottom-[calc(110px+var(--safe-b))] w-14 h-14 '
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

/** Remember where the caret was so a re-render does not drop the keyboard. */
function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.id || !('selectionStart' in a)) return null;
  return { id: a.id, start: a.selectionStart, end: a.selectionEnd };
}

function restoreFocus(snapshot) {
  if (!snapshot) return;
  const node = document.getElementById(snapshot.id);
  if (!node) return;
  node.focus({ preventScroll: true });
  try { node.setSelectionRange(snapshot.start, snapshot.end); } catch { /* not a text input */ }
}

/**
 * Repaint just the amount line and the save button.
 *
 * Every keypad tap used to rebuild the whole sheet - nine account chips, the
 * category grid, the item list - to change one number. These are the only
 * nodes that actually depend on the amount, so they are patched in place. If
 * any of them is missing the caller falls back to a full sheet render.
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
 * Only nudges rows where the selection is actually out of view, so a row the
 * user has scrolled by hand is left where they put it.
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

/**
 * Carry the sideways scroll of every `.chiprow` across a rebuild.
 *
 * The rows are recreated from scratch on each render, so a row the user had
 * scrolled - the icon picker's group tabs, the Reports range strip - snapped
 * back to the left on every tap. Matched by position, which is stable because
 * the rebuild draws the same rows in the same order.
 */
function readChipScroll(scope) {
  return [...scope.querySelectorAll('[data-testid="chiprow"]')].map(n => n.scrollLeft);
}

function writeChipScroll(scope, saved) {
  const rows = scope.querySelectorAll('[data-testid="chiprow"]');
  saved.forEach((left, i) => { if (rows[i] && left) rows[i].scrollLeft = left; });
}

function renderSheet() {
  // A different sheet - or none at all - is an entrance. The same sheet being
  // redrawn after a tap inside it is not, and must not replay the slide-up.
  const entering = store.ui.sheet !== lastSheet;
  const keysEntering = store.ui.keypadOpen && !lastKeypad;

  if (dom.overlay.firstChild) {
    const body = dom.overlay.querySelector('[data-testid="sheet-body"]');
    if (body) sheetScroll = body.scrollTop;
  }
  if (entering) sheetScroll = 0;
  const chipScroll = readChipScroll(dom.overlay);

  lastSheet = store.ui.sheet;
  lastKeypad = !!store.ui.keypadOpen;

  clear(dom.overlay);
  if (!store.ui.sheet) return;

  dom.overlay.appendChild(el('div', {
    class: 'absolute inset-0 bg-black/50 z-10'
      + (entering ? ' [animation:fadeIn_var(--dur-micro)_ease]' : ''),
    dataset: { testid: 'scrim' },
    onClick: () => store.set({ sheet: null })
  }));

  const build = SHEETS[store.ui.sheet] || renderAddSheet;
  const sheet = build();
  // Identity for the tests, set here rather than in six sheet files - and
  // keyed off which sheet is open, so it stays right when several of them
  // share a size class.
  sheet.dataset.testid = 'sheet';
  sheet.dataset.sheet = store.ui.sheet;
  if (entering) sheet.classList.add('sheet--enter');

  // A grabber, and the gesture it advertises. Added here rather than in the
  // six sheet builders so every sheet gets both without knowing about either.
  sheet.insertBefore(el('div', { class: GRABBER, dataset: { testid: 'sheet-grab' } }),
    sheet.firstChild);
  bindSheetDrag(sheet, () => store.set({ sheet: null }));

  dom.overlay.appendChild(sheet);

  if (keysEntering) {
    const foot = sheet.querySelector('[data-foot="keys"]');
    if (foot) foot.classList.add('sheet__foot--enter');
  }

  const body = dom.overlay.querySelector('[data-testid="sheet-body"]');
  if (body && sheetScroll) body.scrollTop = sheetScroll;
  if (!entering) writeChipScroll(dom.overlay, chipScroll);
  revealSelectedChips(dom.overlay);
}

function render(_store, regions) {
  const r = regions || new Set(['header', 'body', 'sheet', 'toast', 'nav']);
  const focus = captureFocus();
  const screen = store.ui.screen;
  const changed = screen !== lastScreen;

  // The amount region is a patch, not a rebuild. When the nodes are not there
  // (the sheet was just opened) it upgrades itself to a sheet render.
  if (r.has('amount') && !r.has('sheet')) {
    if (patchAmount()) { restoreFocus(focus); return; }
    r.add('sheet');
  }

  if (r.has('header')) {
    clear(dom.header);
    dom.header.appendChild(header());
  }

  if (r.has('body')) {
    // Crossing a sub-tab is a move with a direction, like crossing a tab - but
    // only the region below the chips travels, not the chips themselves.
    const sub = SUB_TABS[screen];
    const subChanged = !changed && !!sub && store.ui[sub.key] !== lastFilter;

    if (!changed && dom.scroll) scrollMemory[screen] = dom.scroll.scrollTop;
    const chipScroll = changed ? [] : readChipScroll(dom.scroll);

    clear(dom.scroll);
    const content = SCREENS[screen]();
    content.forEach(node => dom.scroll.appendChild(node));

    if (changed) {
      pushIn(dom.scroll, store.ui.direction);
      stagger(dom.scroll);
      dom.scroll.scrollTop = 0;
    } else if (subChanged) {
      const page = dom.scroll.querySelector('[data-testid="activity-list"]') || dom.scroll;
      pushIn(page, store.ui.filterDir);
      stagger(page);
      dom.scroll.scrollTop = 0;
      writeChipScroll(dom.scroll, chipScroll);
    } else {
      dom.scroll.scrollTop = scrollMemory[screen] || 0;
      writeChipScroll(dom.scroll, chipScroll);
    }
    lastScreen = screen;
    lastFilter = sub ? store.ui[sub.key] : null;
    revealSelectedChips(dom.scroll);
  }

  if (r.has('sheet') || r.has('amount')) renderSheet();

  if (r.has('toast')) {
    clear(dom.toast);
    if (store.ui.toast) {
      dom.toast.appendChild(el('div', {
        class: 'absolute left-[22px] right-[22px] bottom-[calc(112px+var(--safe-b))] '
          + 'bg-ink text-bg rounded-box py-[14px] px-4 font-ui font-semibold '
          + 'text-[12px]/[1.4] text-center z-[15] normal-nums '
          + '[animation:popIn_var(--dur-micro)_ease]',
        dataset: { testid: 'toast' },
        text: store.ui.toast
      }));
    }
  }

  if (r.has('nav')) {
    clear(dom.nav);
    dom.nav.appendChild(fab());
    dom.nav.appendChild(nav());
  }

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
    // Back closes a sheet first, then walks back to Home, then exits.
    App.addListener('backButton', () => {
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

  // The scroll region outlives every render, so the gesture is bound once and
  // never rebound. It stands down while a sheet is up: the sheet has its own
  // drag, and the scrim behind it is not part of this node anyway.
  bindSwipe(dom.scroll, {
    onSwipe: swipe,
    canSwipe: (dir) => !!swipeTarget(dir),
    enabled: () => !store.ui.sheet
  });

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
