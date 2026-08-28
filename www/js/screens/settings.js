// Settings. Appearance, the SMS capture story (including the honest Play Store
// warning), and the data controls that make "local-first" mean something.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { toggle } from '../ui/components.js';
import { repo } from '../data/repo.js';
import { exportCsv, backupDatabase } from '../core/exporter.js';

function appearance() {
  return [
    el('div', { class: 'setlabel', text: 'Appearance' }),
    el('div', { class: 'setgroup' }, [
      el('div', { class: 'setrow' }, [
        el('div', {}, [
          el('div', { class: 'setrow__title', text: 'Dark mode' }),
          el('div', { class: 'setrow__sub', text: 'Follows system by default' })
        ]),
        toggle(store.ui.dark, () => store.toggleDark())
      ]),
      el('div', { class: 'setrow' }, [
        el('div', { class: 'setrow__title', text: 'Home currency' }),
        el('div', { class: 'setrow__val', text: 'BDT · ৳' })
      ])
    ])
  ];
}

function smsCapture() {
  return [
    el('div', { class: 'setlabel', style: { margin: '0 0 9px' }, text: 'SMS capture' }),

    el('div', { class: 'setcard' }, [
      el('div', { class: 'setcard__title', text: 'Paste an SMS' }),
      el('div', {
        class: 'setcard__body',
        text: 'Runs the rule table on text you paste. No permissions needed — this is the shipping path.'
      }),
      el('div', {
        class: 'setcard__cta tappable',
        text: 'Open parser',
        onClick: () => store.set({ sheet: 'sms', parse: null })
      })
    ]),

    el('div', { class: 'setcard' }, [
      el('div', { class: 'setcard__row' }, [
        el('div', { style: { flex: '1' } }, [
          el('div', { class: 'setcard__title', text: 'Live SMS listener' }),
          el('div', {
            class: 'setcard__body',
            text: 'Reads incoming messages automatically and drafts transactions.'
          })
        ]),
        toggle(store.ui.smsLive, () => store.toggleSmsLive())
      ]),
      el('div', { class: 'warn' + (store.ui.smsLive ? ' warn--live' : '') }, [
        el('div', {
          class: 'warn__text',
          text: 'Requires the READ_SMS permission. Google Play restricts this — a build with the listener on is likely to be rejected for public distribution. Intended for sideloaded personal use.'
        })
      ])
    ]),

    el('div', { class: 'setcard setcard--last' }, [
      el('div', { class: 'setcard__head' }, [
        el('div', { class: 'setcard__title', text: 'Parse rules' }),
        el('div', {
          class: 'bighead__v',
          text: store.db.rules.length + ' active'
        })
      ]),
      el('div', { class: 'rulelist' },
        store.db.rules.map(r => el('div', { class: 'rule' }, [
          el('div', { class: 'rule__head' }, [
            el('div', { class: 'rule__sender', text: r.sender }),
            el('div', {
              class: 'rule__map',
              text: (store.acct(r.account) || {}).name + ' · ' + r.type
            })
          ]),
          el('div', { class: 'rule__pattern', text: '/' + r.pattern + '/i' })
        ]))
      ),
      el('div', {
        class: 'linkline tappable',
        text: '+ Add rule',
        onClick: () => store.say('Rule editor lands in the next pass')
      })
    ])
  ];
}

function data() {
  const row = (title, sub, trailing, onClick) => el('div', {
    class: 'setrow' + (onClick ? ' tappable' : ''),
    onClick
  }, [
    el('div', {}, [
      el('div', { class: 'setrow__title', text: title }),
      sub ? el('div', { class: 'setrow__sub', text: sub }) : null
    ].filter(Boolean)),
    trailing
  ]);

  return [
    el('div', { class: 'setlabel', style: { margin: '0 0 9px' }, text: 'Data' }),
    el('div', { class: 'setgroup' }, [
      row('Export to CSV', null, el('div', { class: 'setrow__chev', text: '›' }), () => exportCsv(store)),
      row('Backup database file', null, el('div', { class: 'setrow__chev', text: '›' }), () => backupDatabase(store)),
      row('Cloud sync', 'Not in v1 — repository layer is ready', el('div', { class: 'tag-soon', text: 'SOON' }))
    ]),
    el('div', {
      class: 'footnote',
      text: 'Paisa v1.0 · ' + repo.backend + ' · ' + store.db.txns.length + ' transactions stored'
    })
  ];
}

export function renderSettings() {
  return [...appearance(), ...smsCapture(), ...data()];
}
