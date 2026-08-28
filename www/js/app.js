// Shell: header, screen swapping, sheets, toast, FAB, nav bar.
//
// A render pass rebuilds only the regions the store says a change can affect.
// Scroll position, focus and caret are carried across so typing and scrolling
// survive a render.

import { el, clear } from './core/dom.js';
import { bindRipples, pushIn, stagger } from './core/motion.js';
import { store } from './core/store.js';
import { exportCsv } from './core/exporter.js';
import * as calc from './core/calc.js';
import { icon } from './ui/icons.js';

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

const dom = {};
let lastScreen = null;
let lastSheet = null;
const scrollMemory = {};
// Sheets are rebuilt like everything else, so their body needs the same
// scroll-position carry the screen body has had all along - without it, every
// tap inside the add sheet snapped it back to the top.
let sheetScroll = 0;

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
  return el('div', { class: 'statusbar' }, [
    el('span', { text: '9:41' }),
    el('div', { class: 'statusbar__icons' }, [
      icon('wifi', 15, { weight: 1.8 }),
      el('div', { class: 'statusbar__batt' }, [el('i')])
    ])
  ]);
}

function iconBtn(name, onClick, size = 17) {
  return el('div', { class: 'iconbtn tappable', onClick }, [icon(name, size)]);
}

/** Home shows the wordmark; every other screen shows back / title / action. */
function header() {
  const screen = store.ui.screen;

  if (screen === 'home') {
    return el('div', { class: 'header' }, [
      el('div', { class: 'wordmark' }, [
        el('div', { class: 'wordmark__blob' }),
        el('div', { class: 'wordmark__text', text: 'Paisa' })
      ]),
      el('div', { class: 'header__actions' }, [
        iconBtn('moon', () => store.toggleDark()),
        iconBtn('gear', () => store.go('settings'))
      ])
    ]);
  }

  const SEG_TITLE = { goals: 'Goals', debts: 'Debts', budgets: 'Budgets' };
  const title = TITLES[screen] || SEG_TITLE[store.ui.budgetSeg] || 'Budgets';

  // The settings sub-screens are reached from Settings, so back goes there
  // rather than all the way home.
  const back = ['categories', 'accounts', 'scheduled'].includes(screen) ? 'settings' : 'home';

  return el('div', { class: 'header' }, [
    iconBtn('arrowLeft', () => store.go(back), 18),
    el('div', { class: 'header__title ellip', text: title }),
    // "Export this view" in the prototype was a stub; here it runs the real
    // CSV export the app already ships.
    iconBtn('upload', () => exportCsv(store))
  ]);
}

function nav() {
  return el('div', { class: 'nav' }, NAV.map(([id, glyph, isOn]) => {
    const on = isOn(store.ui.screen);
    return el('div', {
      class: 'nav__item tappable' + (on ? ' nav__item--on' : ''),
      onClick: () => store.go(id)
    }, [
      icon(glyph, 22),
      el('div', { class: 'nav__dot' })
    ]);
  }));
}

/** Lime FAB, floating clear of the bar rather than notched into it. */
function fab() {
  return el('div', {
    class: 'fab tappable',
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
  const val = document.querySelector('.amount__val');
  const expr = document.querySelector('.amount__expr');
  const save = document.querySelector('.savebtn');
  if (!val || !expr || !save) return false;

  // Pressing the first operator adds the equals key to the footer, and folding
  // the last one takes it away. That is a change of structure, not of text, so
  // it needs a real render - the fast path only moves numbers around.
  const wantsEquals = store.ui.entryExpr.length > 0;
  if (wantsEquals !== !!document.querySelector('.equalsbtn')) return false;

  const { entryExpr, entryAmount, entryValue } = store.ui;
  const items = store.ui.entryItems;

  val.textContent = items.length
    ? Math.round(store.entryTotal()).toLocaleString('en-US')
    : calc.displayText(entryExpr, entryAmount, entryValue);
  expr.textContent = items.length ? '' : calc.exprText(entryExpr, entryAmount);

  const total = store.entryTotal();
  save.textContent = saveButtonLabel(total);
  save.classList.toggle('savebtn--ready', !!total);

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
  for (const row of scope.querySelectorAll('.chiprow')) {
    const on = row.querySelector('.chip--on');
    if (!on) continue;
    const rowBox = row.getBoundingClientRect();
    const chipBox = on.getBoundingClientRect();
    if (chipBox.left >= rowBox.left && chipBox.right <= rowBox.right) continue;
    row.scrollLeft = Math.max(0, on.offsetLeft - 12);
  }
}

function renderSheet() {
  if (dom.overlay.firstChild) {
    const body = dom.overlay.querySelector('.sheet__body');
    if (body) sheetScroll = body.scrollTop;
  }
  if (store.ui.sheet !== lastSheet) sheetScroll = 0;
  lastSheet = store.ui.sheet;

  clear(dom.overlay);
  if (!store.ui.sheet) return;

  dom.overlay.appendChild(el('div', {
    class: 'scrim',
    onClick: () => store.set({ sheet: null })
  }));

  const build = SHEETS[store.ui.sheet] || renderAddSheet;
  dom.overlay.appendChild(build());

  const body = dom.overlay.querySelector('.sheet__body');
  if (body && sheetScroll) body.scrollTop = sheetScroll;
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
    if (!changed && dom.scroll) scrollMemory[screen] = dom.scroll.scrollTop;

    clear(dom.scroll);
    const content = SCREENS[screen]();
    content.forEach(node => dom.scroll.appendChild(node));

    if (changed) {
      pushIn(dom.scroll, store.ui.direction);
      stagger(dom.scroll);
      dom.scroll.scrollTop = 0;
    } else {
      dom.scroll.scrollTop = scrollMemory[screen] || 0;
    }
    lastScreen = screen;
    revealSelectedChips(dom.scroll);
  }

  if (r.has('sheet') || r.has('amount')) renderSheet();

  if (r.has('toast')) {
    clear(dom.toast);
    if (store.ui.toast) {
      dom.toast.appendChild(el('div', { class: 'toast', text: store.ui.toast }));
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
  bindRipples(dom.root);

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
  boot.addEventListener('transitionend', () => boot.remove(), { once: true });
}

boot().catch(err => {
  console.error('[paisa] boot failed', err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Could not start: ' + (err.message || err);
});
