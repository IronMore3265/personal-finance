// Shell: header, screen swapping, sheets, toast, nav bar.
//
// One render pass rebuilds the screen body from store state. Scroll position,
// focus and caret are carried across so typing and scrolling survive a render.

import { el, clear } from './core/dom.js';
import { bindRipples, pushIn, stagger } from './core/motion.js';
import { store } from './core/store.js';

import { renderHome } from './screens/home.js';
import { renderActivity } from './screens/activity.js';
import { renderBudgets } from './screens/budgets.js';
import { renderReports } from './screens/reports.js';
import { renderSettings } from './screens/settings.js';
import { renderAddSheet } from './sheets/add.js';
import { renderSmsSheet } from './sheets/sms.js';

const TITLES = {
  home: ['28 August 2026', 'Overview'],
  txns: ['All accounts', 'Activity'],
  budgets: ['August 2026', null],
  reports: ['August 2026', 'Reports'],
  settings: ['Local · on device', 'Settings']
};

const SCREENS = {
  home: renderHome,
  txns: renderActivity,
  budgets: renderBudgets,
  reports: renderReports,
  settings: renderSettings
};

const dom = {};
let lastScreen = null;
const scrollMemory = {};

/* ------------------------------------------------------------------ *
 * Chrome
 * ------------------------------------------------------------------ */

function statusBar() {
  return el('div', { class: 'statusbar' }, [
    el('span', { text: '9:41' }),
    el('div', { class: 'statusbar__icons' }, [
      el('div', { class: 'statusbar__batt' }),
      el('div', { class: 'statusbar__dot' })
    ])
  ]);
}

function header() {
  const [kicker, fixedTitle] = TITLES[store.ui.screen];
  const title = fixedTitle
    || (store.ui.budgetSeg === 'goals' ? 'Goals' : 'Budgets');

  return el('div', { class: 'header' }, [
    el('div', { style: { minWidth: '0' } }, [
      el('div', { class: 'header__kicker', text: kicker }),
      el('div', { class: 'header__title', text: title })
    ]),
    el('div', { class: 'header__actions' }, [
      el('div', {
        class: 'iconbtn tappable',
        onClick: () => store.toggleDark()
      }, [el('div', { class: 'iconbtn__half' })]),
      el('div', {
        class: 'iconbtn tappable',
        onClick: () => store.go('settings')
      }, [
        el('div', { class: 'iconbtn__line' }),
        el('div', { class: 'iconbtn__line' }),
        el('div', { class: 'iconbtn__line iconbtn__line--short' })
      ])
    ])
  ]);
}

function navItem(id, label) {
  return el('div', {
    class: 'nav__item tappable' + (store.ui.screen === id ? ' nav__item--on' : ''),
    onClick: () => store.go(id)
  }, [
    el('div', { class: 'nav__pip' }),
    el('div', { class: 'nav__label', text: label })
  ]);
}

function nav() {
  return el('div', { class: 'nav' }, [
    navItem('home', 'Home'),
    navItem('txns', 'Activity'),
    el('div', { class: 'nav__fabwrap' }, [
      el('div', {
        class: 'fab tappable',
        onClick: () => store.set({ sheet: 'add' })
      }, [el('div', { class: 'fab__plus' })])
    ]),
    navItem('budgets', 'Budgets'),
    navItem('reports', 'Reports')
  ]);
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

function render() {
  const focus = captureFocus();
  const screen = store.ui.screen;
  const changed = screen !== lastScreen;

  if (!changed && dom.scroll) scrollMemory[screen] = dom.scroll.scrollTop;

  // Header
  clear(dom.header);
  dom.header.appendChild(header());

  // Body
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

  // Sheets
  clear(dom.overlay);
  if (store.ui.sheet) {
    dom.overlay.appendChild(el('div', {
      class: 'scrim',
      onClick: () => store.set({ sheet: null })
    }));
    dom.overlay.appendChild(
      store.ui.sheet === 'add' ? renderAddSheet() : renderSmsSheet()
    );
  }

  // Toast
  clear(dom.toast);
  if (store.ui.toast) {
    dom.toast.appendChild(el('div', { class: 'toast', text: store.ui.toast }));
  }

  // Nav
  clear(dom.nav);
  dom.nav.appendChild(nav());

  restoreFocus(focus);
}

/* ------------------------------------------------------------------ *
 * Native integration
 * ------------------------------------------------------------------ */

async function wireNative() {
  const cap = window.Capacitor;
  if (!cap || !cap.isNativePlatform || !cap.isNativePlatform()) return;
  const { App, StatusBar } = cap.Plugins || {};

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

  dom.root.insertBefore(statusBar(), dom.header);
  bindRipples(dom.root);

  await store.init();
  store.subscribe(render);
  render();
  await wireNative();

  const boot = document.getElementById('boot');
  boot.classList.add('boot--gone');
  boot.addEventListener('transitionend', () => boot.remove(), { once: true });
}

boot().catch(err => {
  console.error('[paisa] boot failed', err);
  const boot = document.getElementById('boot');
  if (boot) boot.textContent = 'Could not start: ' + (err.message || err);
});
