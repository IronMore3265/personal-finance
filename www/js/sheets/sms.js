// SMS parser sheet. Paste, run the rule table, review what it extracted, save.
// The review step is deliberate - a rule that guesses wrong should be visible
// before it becomes a transaction.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import { parseSms } from '../core/sms.js';
import { SAMPLES, TODAY } from '../data/seed.js';

function run() {
  store.set({ parse: parseSms(store.ui.smsText, store.db.rules) });
}

async function confirm() {
  const p = store.ui.parse;
  if (!p || !p.ok) return;

  await store.addTxn({
    id: 'sms' + Date.now(),
    account: p.rule.account,
    type: p.rule.type,
    cat: p.cat,
    amount: p.amount,
    currency: 'BDT',
    rate: 1,
    date: TODAY,
    note: p.merchant ? p.merchant.replace(/\s+/g, ' ').toLowerCase() : p.rule.label,
    source: 'sms'
  });

  store.set({ sheet: null, smsText: '', parse: null, screen: 'txns' });
  store.say('Saved from SMS · ' + fmt(p.amount, 'BDT'));
}

function matchCard(p) {
  const fields = [
    ['Amount', fmt(p.amount, 'BDT')],
    ['Type', p.rule.type],
    ['Account', (store.acct(p.rule.account) || {}).name],
    ['Category', (store.cat(p.cat) || {}).name],
    ['Merchant', p.merchant || '—'],
    ['Date', '28 Aug 2026'],
    ['Source', 'sms']
  ];

  return el('div', { class: 'panel match' }, [
    el('div', { class: 'match__head' }, [
      el('div', { class: 'match__badge', text: 'Matched' }),
      el('div', { class: 'match__rule', text: p.rule.label })
    ]),
    el('div', { class: 'fieldlist' },
      fields.map(([k, v]) => el('div', { class: 'fieldrow' }, [
        el('div', { class: 'fieldrow__k', text: k }),
        el('div', { class: 'fieldrow__v', text: v })
      ]))
    ),
    el('div', { class: 'confirmbtn tappable', text: 'Confirm & save', onClick: confirm })
  ]);
}

export function renderSmsSheet() {
  const p = store.ui.parse;

  const body = el('div', { class: 'sheet__body sheet__body--sms' }, [
    el('textarea', {
      id: 'sms-input',
      class: 'smsbox',
      placeholder: 'Paste message text here',
      onInput: (e) => store.set({ smsText: e.target.value }, true)
    }),

    el('div', { class: 'fieldlabel', text: 'Try a sample' }),
    el('div', { class: 'samples' },
      SAMPLES.map(s => el('div', {
        class: 'sample tappable',
        text: s.label,
        onClick: () => store.set({ smsText: s.text, parse: null })
      }))
    ),

    el('div', { class: 'runbtn tappable', text: 'Run parser', onClick: run }),

    p && p.ok ? matchCard(p) : null,
    p && !p.ok
      ? el('div', { class: 'nomatch' }, [
          el('div', {
            class: 'nomatch__text',
            text: 'No rule matched this text. Add a rule in Settings, or enter it manually.'
          })
        ])
      : null
  ].filter(Boolean));

  // textarea has no value attribute; set the property directly.
  body.querySelector('#sms-input').value = store.ui.smsText;

  return el('div', { class: 'sheet sheet--sms' }, [
    el('div', { class: 'sheet__head sheet__head--sms' }, [
      el('div', { class: 'sheet__title', text: 'Parse an SMS' }),
      el('div', {
        class: 'sheet__lede',
        text: "Paste a bank or mobile-banking alert. It's matched against the rule table — nothing leaves the device."
      })
    ]),
    body,
    el('div', { class: 'sheet__foot' }, [
      el('div', {
        class: 'closebtn tappable',
        text: 'Close',
        onClick: () => store.set({ sheet: null })
      })
    ])
  ]);
}
