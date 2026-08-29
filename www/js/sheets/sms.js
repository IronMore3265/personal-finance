// SMS parser sheet. Paste, run the rule table, review what it extracted, save.
// The review step is deliberate - a rule that guesses wrong should be visible
// before it becomes a transaction.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import { parseSms } from '../core/sms.js';
import { icon } from '../ui/icons.js';
import { fieldLabel } from '../ui/components.js';
import { SAMPLES } from '../data/seed.js';
import {
  TAP, SHEET, SHEET_FOOT, SHEET_TITLE, SHEET_LEDE, SHEET_ICON
} from '../ui/styles.js';

function run() {
  store.set({
    parse: parseSms(store.ui.smsText, store.db.rules, store.ui.smsSender)
  });
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
    date: store.today,
    note: p.merchant ? p.merchant.replace(/\s+/g, ' ').toLowerCase() : p.rule.label,
    source: 'sms'
  });

  store.set({ sheet: null, smsText: '', smsSender: null, parse: null, screen: 'txns' });
  store.say('Saved from SMS · ' + fmt(p.amount, 'BDT'));
}

function matchBlock(p) {
  const fields = [
    ['Amount', fmt(p.amount, 'BDT')],
    ['Type', p.rule.type],
    ['Account', (store.acct(p.rule.account) || {}).name],
    ['Category', (store.cat(p.cat) || {}).name],
    ['Merchant', p.merchant || '—'],
    ['Date', '28 Aug 2026']
  ];

  return el('div', { class: 'mt-[18px] [animation:popIn_var(--dur-pop)_ease]' }, [
    el('div', { class: 'flex justify-between items-center gap-2' }, [
      el('div', {
        class: 'flex items-center gap-1.5 font-ui font-bold text-[10px]/[1] '
          + 'tracking-[.12em] uppercase text-accent-ink bg-accent rounded-pill '
          + 'py-[7px] px-[11px] normal-nums'
      }, [
        icon('check', 11, { weight: 2.6 }),
        'Matched'
      ]),
      el('div', {
        class: 'font-ui font-medium text-[10.5px]/[1] text-ink3 normal-nums',
        text: p.rule.label
      })
    ]),
    ...fields.map(([k, v]) => el('div', {
      class: 'flex justify-between gap-2 py-3 border-b border-line'
    }, [
      el('div', {
        class: 'font-ui font-medium text-[11.5px]/[1] text-ink3 normal-nums',
        text: k
      }),
      el('div', {
        class: 'font-ui font-bold text-[12px]/[1] text-ink whitespace-nowrap normal-nums',
        text: v
      })
    ])),
    el('div', {
      class: 'mt-4 text-center p-[15px] bg-accent rounded-pill text-accent-ink '
        + 'font-ui font-bold text-[11.5px] tracking-[.14em] uppercase normal-nums ' + TAP,
      text: 'Confirm & save',
      onClick: confirm
    })
  ]);
}

export function renderSmsSheet() {
  const p = store.ui.parse;

  const body = el('div', {
    // Spelled out rather than SHEET_BODY plus overrides: two padding utilities
    // for the same edge resolve by stylesheet order, not by string order.
    class: 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-[18px] pt-[14px] pb-0',
    dataset: { testid: 'sheet-body' }
  }, [
    el('textarea', {
      id: 'sms-input',
      class: 'w-full h-[104px] resize-none bg-soft border-none rounded-box p-[13px] '
        + 'font-ui font-normal text-[12px]/[1.6] text-ink outline-none normal-nums '
        + 'placeholder:text-ink3',
      placeholder: 'Paste message text here',
      // Hand-edited text is no longer attributable to the sender of the sample.
      onInput: (e) => store.set({ smsText: e.target.value, smsSender: null }, true)
    }),

    store.ui.smsSender ? fieldLabel('From · ' + store.ui.smsSender) : null,

    fieldLabel('Try a sample'),
    el('div', { class: 'flex gap-1.5 flex-wrap' },
      SAMPLES.map(s => el('div', {
        class: 'font-ui font-semibold text-[11px]/[1] text-ink bg-soft rounded-pill '
          + 'py-2.5 px-[13px] normal-nums ' + TAP,
        text: s.label,
        onClick: () => store.set({ smsText: s.text, smsSender: s.sender, parse: null })
      }))
    ),

    el('div', {
      class: 'mt-4 flex items-center justify-center gap-2 p-[15px] rounded-pill '
        + 'bg-ink text-bg font-ui font-bold text-[11.5px] tracking-[.14em] '
        + 'uppercase normal-nums ' + TAP,
      onClick: run
    }, [
      icon('checkLong', 15, { weight: 2 }),
      'Run parser'
    ]),

    p && p.ok ? matchBlock(p) : null,
    p && !p.ok
      ? el('div', { class: 'rounded-box bg-danger-soft p-[14px] mt-4' }, [
          el('div', {
            class: 'font-ui font-medium text-[12px]/[1.5] text-danger normal-nums',
            text: 'No rule matched this text. Add a rule in Settings, or enter it manually.'
          })
        ])
      : null
  ].filter(Boolean));

  // textarea has no value attribute; set the property directly.
  body.querySelector('#sms-input').value = store.ui.smsText;

  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: 'flex-none pt-[18px] px-[18px] pb-1 flex items-start gap-3' }, [
      el('div', { class: SHEET_ICON }, [icon('message', 18, { weight: 1.8 })]),
      el('div', { style: { flex: '1' } }, [
        el('div', { class: SHEET_TITLE, text: 'Parse an SMS' }),
        el('div', {
          class: SHEET_LEDE,
          text: 'Paste a bank or mobile-banking alert. Matched against the rule ' +
            'table — nothing leaves the device.'
        })
      ])
    ]),
    body,
    el('div', { class: SHEET_FOOT }, [
      el('div', {
        class: 'text-center p-[13px] font-ui font-bold text-[11.5px] '
          + 'tracking-[.14em] uppercase text-ink3 normal-nums ' + TAP,
        dataset: { testid: 'closebtn' },
        text: 'Close',
        onClick: () => store.set({ sheet: null })
      })
    ])
  ]);
}
