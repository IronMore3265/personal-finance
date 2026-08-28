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
  return el('div', { class: 'tile' + (lime ? ' tile--lime' : '') }, [icon(name, 16)]);
}

function settingRow({ glyph, lime, title, sub, trailing, onClick }) {
  return el('div', { class: 'setrow' + (onClick ? ' tappable' : ''), onClick }, [
    glyph ? tile(glyph, lime) : null,
    el('div', { class: 'setrow__body' }, [
      el('div', { class: 'setrow__title', text: title }),
      sub ? el('div', { class: 'setrow__sub', text: sub }) : null
    ].filter(Boolean)),
    trailing || null
  ].filter(Boolean));
}

const chevron = () => icon('chevronRight', 15, { weight: 2, class: 'chev' });

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
      trailing: el('div', { class: 'setrow__val', text: 'BDT · ৳' })
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
  const live = el('div', { class: 'setrow setrow--stack' }, [
    el('div', { class: 'setrow__line' }, [
      tile('robot'),
      el('div', { class: 'setrow__body' }, [
        el('div', { class: 'setrow__title', text: 'Live SMS listener' }),
        el('div', {
          class: 'setrow__sub',
          text: 'Drafts transactions from incoming messages'
        })
      ]),
      toggle(store.ui.smsLive, () => store.toggleSmsLive())
    ]),
    el('div', { class: 'warn' + (store.ui.smsLive ? ' warn--live' : '') }, [
      el('div', {
        class: 'warn__text',
        text: 'Requires READ_SMS. Play Store restricts it — a build with the ' +
          'listener on is likely to be rejected. Intended for sideloaded personal use.'
      })
    ])
  ]);

  const rules = el('div', { class: 'ruleblock' }, [
    el('div', { class: 'ruleblock__head' }, [
      el('div', { class: 'setrow__title', text: 'Parse rules' }),
      el('div', { class: 'section__meta', text: store.db.rules.length + ' active' })
    ]),
    ...store.db.rules.map(r => el('div', { class: 'rule' }, [
      el('div', { class: 'rule__head' }, [
        el('div', { class: 'rule__sender', text: r.sender }),
        el('div', {
          class: 'rule__map',
          text: (store.acct(r.account) || {}).name + ' · ' + r.type
        })
      ]),
      el('div', { class: 'rule__pattern', text: '/' + r.pattern + '/i' })
    ])),
    el('div', {
      class: 'addrule tappable',
      onClick: () => store.say('Rule editor lands in the next pass')
    }, [
      el('div', { class: 'roundbtn roundbtn--lime roundbtn--small' }, [
        icon('plus', 13, { weight: 2.6 })
      ]),
      el('div', { class: 'addrule__label', text: 'Add rule' })
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
      onClick: () => store.set({ sheet: 'sms', parse: null })
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
      class: 'footnote',
      text: 'Paisa v1.0 · ' + repo.backend + ' · ' + store.db.txns.length + ' transactions stored'
    })
  ];
}

export function renderSettings() {
  return [...appearance(), ...library(), ...smsCapture(), ...data()];
}
