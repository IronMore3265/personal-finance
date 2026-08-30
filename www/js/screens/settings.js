// Settings. Appearance, the SMS capture story (including the honest Play Store
// warning), and the data controls that make "local-first" mean something.
//
// v4 gives every row an icon tile, and drops the card wrappers - the groups are
// held together by their label and the hairlines between rows.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { toggle, fieldLabel } from '../ui/components.js';
import { repo } from '../data/repo.js';
import { supabase } from '../data/supabase.js';
import { sync } from '../data/sync.js';
import { exportCsv, backupDatabase } from '../core/exporter.js';
import { TAP } from '../ui/styles.js';

/* Recipes used by more than one row on this screen. */
const SETROW = 'flex items-center gap-3 py-[15px] border-b border-line';
const SETROW_BODY = 'flex-1 min-w-0';
const SETROW_TITLE = 'font-ui font-semibold text-[14px]/[1] text-ink normal-nums';
const SETROW_SUB = 'font-ui font-medium text-[11px]/[1.5] text-ink3 mt-[7px] normal-nums';

/** One line describing where sync has got to, for the Settings row. */
function syncSummary() {
  if (!supabase.signedIn) return 'Off — sign in to back up and sync devices';
  if (sync.status === 'syncing') return 'Syncing…';
  if (sync.status === 'offline') {
    return sync.pending
      ? 'Offline · ' + sync.pending + ' change' + (sync.pending > 1 ? 's' : '') + ' waiting'
      : 'Offline · will sync when there is signal';
  }
  if (sync.status === 'error') return 'Last sync failed · tap for details';
  if (sync.pending) {
    return sync.pending + ' change' + (sync.pending > 1 ? 's' : '') + ' waiting · ' + supabase.email;
  }
  return 'On · ' + supabase.email;
}

/** Rounded-square tile carrying the row icon. Lime marks the shipping path. */
function tile(name, lime) {
  return el('div', {
    class: 'flex-none w-[34px] h-[34px] rounded-[11px] flex items-center '
      + 'justify-center ' + (lime ? 'bg-accent text-accent-ink' : 'bg-soft text-ink')
  }, [icon(name, 16)]);
}

function settingRow({ glyph, lime, title, sub, trailing, onClick }) {
  return el('div', { class: SETROW + (onClick ? ' ' + TAP : ''), onClick }, [
    glyph ? tile(glyph, lime) : null,
    el('div', { class: SETROW_BODY }, [
      el('div', { class: SETROW_TITLE, text: title }),
      sub ? el('div', { class: SETROW_SUB, text: sub }) : null
    ].filter(Boolean)),
    trailing || null
  ].filter(Boolean));
}

const chevron = () => icon('chevronRight', 15, { weight: 2, class: 'text-ink3 flex-none' });

function appearance() {
  return [
    fieldLabel('Appearance'),
    settingRow({
      glyph: 'moon',
      title: 'Dark mode',
      sub: 'Follows system by default',
      trailing: toggle(store.ui.dark, () => store.toggleDark())
    }),
    settingRow({
      glyph: 'coin',
      title: 'Home currency',
      trailing: el('div', {
        class: 'font-ui font-bold text-[12.5px]/[1] text-ink2 whitespace-nowrap '
          + 'flex-none normal-nums',
        text: 'BDT · ৳'
      })
    })
  ];
}

/** The three things that were seed-only until they got an editor. */
function library() {
  return [
    fieldLabel('Library'),
    settingRow({
      glyph: 'tag',
      title: 'Categories',
      sub: store.db.categories.length + ' categories · icons and colours',
      trailing: chevron(),
      onClick: () => store.go('categories')
    }),
    settingRow({
      glyph: 'wallet',
      title: 'Accounts',
      sub: store.db.accounts.length + ' accounts · logos and balances',
      trailing: chevron(),
      onClick: () => store.go('accounts')
    }),
    settingRow({
      glyph: 'repeat',
      title: 'Scheduled expenses',
      sub: store.activeRecurring().length + ' active subscriptions and bills',
      trailing: chevron(),
      onClick: () => store.go('scheduled')
    })
  ];
}

function smsCapture() {
  const live = el('div', { class: 'block py-[15px] border-b border-line' }, [
    el('div', { class: 'flex items-center gap-3' }, [
      tile('robot'),
      el('div', { class: SETROW_BODY }, [
        el('div', { class: SETROW_TITLE, text: 'Live SMS listener' }),
        el('div', {
          class: SETROW_SUB,
          text: 'Drafts transactions from incoming messages'
        })
      ]),
      toggle(store.ui.smsLive, () => store.toggleSmsLive())
    ]),
    el('div', {
      class: 'mt-[13px] p-[13px] rounded-2xl '
        + (store.ui.smsLive ? 'bg-accent-soft' : 'bg-soft')
    }, [
      el('div', {
        class: 'font-ui font-medium text-[11.5px]/[1.5] text-ink normal-nums',
        text: 'Requires READ_SMS. Play Store restricts it — a build with the ' +
          'listener on is likely to be rejected. Intended for sideloaded personal use.'
      })
    ])
  ]);

  const rules = el('div', { class: 'pt-[15px] pb-1' }, [
    el('div', { class: 'flex justify-between items-center gap-2' }, [
      el('div', { class: SETROW_TITLE, text: 'Parse rules' }),
      el('div', {
        class: 'font-ui font-semibold text-[10px]/[1] text-ink3 uppercase '
          + 'tracking-[.1em] whitespace-nowrap normal-nums',
        text: store.db.rules.length + ' active'
      })
    ]),
    ...store.db.rules.map(r => el('div', { class: 'py-3 border-b border-line' }, [
      el('div', { class: 'flex justify-between gap-2' }, [
        el('div', {
          class: 'font-ui font-bold text-[12px]/[1] text-ink normal-nums',
          text: r.sender
        }),
        el('div', {
          class: 'font-ui font-medium text-[10.5px]/[1] text-ink3 whitespace-nowrap normal-nums',
          text: (store.acct(r.account) || {}).name + ' · ' + r.type
        })
      ]),
      // --code, not --ui: this is the one place a regex is shown verbatim.
      el('div', {
        class: 'font-code font-normal text-[10.5px]/[1.5] text-ink2 mt-2 '
          + 'break-all normal-nums',
        text: '/' + r.pattern + '/i'
      })
    ])),
    el('div', {
      class: 'flex items-center gap-[7px] mt-[14px] text-ink ' + TAP,
      onClick: () => store.say('Rule editor lands in the next pass')
    }, [
      el('div', {
        class: 'flex-none w-[26px] h-[26px] rounded-full bg-accent text-accent-ink '
          + 'flex items-center justify-center'
      }, [
        icon('plus', 13, { weight: 2.6 })
      ]),
      el('div', {
        class: 'font-ui font-bold text-[11px]/[1] tracking-[.1em] uppercase normal-nums',
        text: 'Add rule'
      })
    ])
  ]);

  return [
    fieldLabel('SMS capture'),
    settingRow({
      glyph: 'message',
      lime: true,
      title: 'Paste an SMS',
      sub: 'Runs the rule table locally — no permission needed',
      trailing: chevron(),
      onClick: () => store.set({ sheet: 'sms', smsReturn: null, parse: null })
    }),
    live,
    rules
  ];
}

function data() {
  return [
    fieldLabel('Data'),
    settingRow({
      title: 'Export to CSV',
      trailing: chevron(),
      onClick: () => exportCsv(store)
    }),
    settingRow({
      title: 'Backup database file',
      trailing: chevron(),
      onClick: () => backupDatabase(store)
    }),
    settingRow({
      glyph: supabase.signedIn ? 'check' : 'upload',
      lime: supabase.signedIn && sync.status === 'idle',
      title: 'Cloud sync',
      sub: syncSummary(),
      trailing: chevron(),
      onClick: () => store.set({ sheet: 'sync' })
    }),
    el('div', {
      class: 'font-ui font-medium text-[11px]/[1.6] text-ink3 text-center pt-[22px] '
        + 'pb-2.5 normal-nums',
      text: 'Paisa v1.0 · ' + repo.backend + ' · ' + store.db.txns.length + ' transactions stored'
    })
  ];
}

export function renderSettings() {
  return [...appearance(), ...library(), ...smsCapture(), ...data()];
}
