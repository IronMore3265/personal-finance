// Debts and receivables: who owes you, and what you owe.
//
// Kept out of `accounts` on purpose. A loan has a person and a due date, and
// it should not move an account balance until the money actually moves - which
// is what settleDebt does, posting a real transaction alongside the payment.
//
// Rendered inside the Budgets screen as its third segment, so it needs no
// fifth slot in the nav bar.

import { el } from '../core/dom.js';
import { fmt, dayName } from '../core/format.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { bar, section, sectionMeta } from '../ui/components.js';

import {
  ROW_TAP, ROW_BODY, ROW_TITLE, ROW_META, ROW_RIGHT, ROW_AMT, ROW_SUB, ELLIP, TAP
} from '../ui/styles.js';

/* Used by both cells of the totals header. */
const DEBTHEAD_LABEL = 'font-ui font-semibold text-[10px]/[1] text-ink3 uppercase '
  + 'tracking-[.12em] normal-nums';
const DEBTHEAD_VALUE = 'font-ui font-extrabold text-[26px]/[1] text-ink mt-[9px] '
  + 'tracking-[-.04em] normal-nums';

function row(d) {
  const outstanding = store.debtBalance(d);
  const paid = d.principal - outstanding;
  const mine = d.direction === 'owed_to_me';

  const meta = [
    // "due 3 Sep", not "due 03/09" - day/month is ambiguous to half the world.
    d.due ? 'due ' + dayName(d.due) : null,
    paid > 0 ? fmt(paid, d.currency) + ' repaid' : null,
    d.note
  ].filter(Boolean).join(' · ');

  return el('div', {
    class: 'py-3 border-t border-line ' + TAP,
    dataset: { testid: 'debtrow' },
    onClick: () => store.set({ sheet: 'debt', editDebt: { ...d } })
  }, [
    el('div', { class: 'flex items-center gap-3' }, [
      el('div', {
        class: 'flex-none w-9 h-9 rounded-chip flex items-center justify-center font-ui font-bold text-[13px] text-ink normal-nums',
        dataset: { testid: 'chipglyph' },
        style: { background: mine ? 'var(--accentSoft)' : 'var(--dangerSoft)' }
      }, [icon(mine ? 'arrow-down-left' : 'arrow-up-right', 16)]),
      el('div', { class: ROW_BODY }, [
        el('div', { class: ROW_TITLE + ' ' + ELLIP, text: d.person }),
        el('div', { class: ROW_META + ' ' + ELLIP, text: meta || 'no due date' })
      ]),
      el('div', { class: ROW_RIGHT }, [
        el('div', { class: ROW_AMT, text: fmt(outstanding, d.currency) }),
        paid > 0
          ? el('div', { class: ROW_SUB, text: 'of ' + fmt(d.principal, d.currency) })
          : null
      ].filter(Boolean))
    ]),
    // Only drawn once something has been repaid - a full bar at zero progress
    // is just a grey line taking up space.
    paid > 0
      ? bar((paid / d.principal) * 100, mine ? 'var(--pos)' : 'var(--danger)', true, 'mt-2.5')
      : null
  ].filter(Boolean));
}

function addRow() {
  return el('div', {
    class: ROW_TAP,
    dataset: { testid: 'row' },
    onClick: () => store.set({
      sheet: 'debt',
      editDebt: {
        id: 'd' + Date.now(),
        person: '',
        direction: 'owed_to_me',
        principal: 0,
        currency: 'BDT',
        account: store.db.accounts[0].id,
        opened: store.today,
        due: '',
        note: '',
        settled: 0,
        isNew: true
      }
    })
  }, [
    el('div', {
      class: 'flex-none w-9 h-9 rounded-chip flex items-center justify-center font-ui '
        + 'font-bold text-[13px] normal-nums bg-transparent text-ink3 '
        + 'shadow-[inset_0_0_0_1px_var(--line)]',
      dataset: { testid: 'chipglyph', chip: 'ghost' }
    }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: ROW_BODY }, [
      el('div', { class: ROW_TITLE, text: 'Record a debt' })
    ])
  ]);
}

export function renderDebts() {
  const open = store.openDebts();
  const mine = open.filter(d => d.direction === 'owed_to_me');
  const theirs = open.filter(d => d.direction === 'i_owe');
  const totals = store.debtTotals();
  const settled = store.db.debts.filter(d => d.settled || store.debtBalance(d) <= 0);

  const out = [
    el('div', { class: 'flex gap-3 pt-[18px] pb-4' }, [
      el('div', { class: 'flex-1 min-w-0' }, [
        el('div', { class: DEBTHEAD_LABEL, text: 'Owed to you' }),
        el('div', {
          class: DEBTHEAD_VALUE,
          dataset: { testid: 'debthead-value' },
          text: fmt(totals.owedToMe, 'BDT')
        })
      ]),
      el('div', { class: 'flex-1 min-w-0 text-right' }, [
        el('div', { class: DEBTHEAD_LABEL, text: 'You owe' }),
        el('div', {
          class: DEBTHEAD_VALUE,
          dataset: { testid: 'debthead-value' },
          text: fmt(totals.iOwe, 'BDT')
        })
      ])
    ]),

    section('Owed to you', sectionMeta(mine.length + '')),
    ...mine.map(row),

    section('You owe', sectionMeta(theirs.length + '')),
    ...theirs.map(row),

    addRow()
  ];

  if (settled.length) {
    out.push(section('Settled', sectionMeta(settled.length + '')));
    settled.forEach(d => out.push(el('div', {
      class: ROW_TAP + ' opacity-55',
      dataset: { testid: 'row', muted: '1' },
      onClick: () => store.set({ sheet: 'debt', editDebt: { ...d } })
    }, [
      el('div', {
        class: 'flex-none w-9 h-9 rounded-chip flex items-center justify-center font-ui font-bold text-[13px] text-ink normal-nums',
        dataset: { testid: 'chipglyph' }
      }, [icon('check', 15, { weight: 2.2 })]),
      el('div', { class: ROW_BODY }, [
        el('div', { class: ROW_TITLE + ' ' + ELLIP, text: d.person }),
        el('div', { class: ROW_META, text: 'settled' })
      ]),
      el('div', { class: ROW_AMT, text: fmt(d.principal, d.currency) })
    ])));
  }

  return out;
}
