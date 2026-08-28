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
    class: 'debtrow tappable',
    onClick: () => store.set({ sheet: 'debt', editDebt: { ...d } })
  }, [
    el('div', { class: 'debtrow__top' }, [
      el('div', {
        class: 'chipglyph',
        style: { background: mine ? 'var(--accentSoft)' : 'var(--dangerSoft)' }
      }, [icon(mine ? 'arrow-down-left' : 'arrow-up-right', 16)]),
      el('div', { class: 'row__body' }, [
        el('div', { class: 'row__title ellip', text: d.person }),
        el('div', { class: 'row__meta ellip', text: meta || 'no due date' })
      ]),
      el('div', { class: 'row__right' }, [
        el('div', { class: 'row__amt', text: fmt(outstanding, d.currency) }),
        paid > 0
          ? el('div', { class: 'row__sub', text: 'of ' + fmt(d.principal, d.currency) })
          : null
      ].filter(Boolean))
    ]),
    // Only drawn once something has been repaid - a full bar at zero progress
    // is just a grey line taking up space.
    paid > 0
      ? bar((paid / d.principal) * 100, mine ? 'var(--pos)' : 'var(--danger)', true)
      : null
  ].filter(Boolean));
}

function addRow() {
  return el('div', {
    class: 'row tappable',
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
    el('div', { class: 'chipglyph chipglyph--ghost' }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title', text: 'Record a debt' })
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
    el('div', { class: 'debthead' }, [
      el('div', { class: 'debthead__cell' }, [
        el('div', { class: 'debthead__label', text: 'Owed to you' }),
        el('div', { class: 'debthead__value', text: fmt(totals.owedToMe, 'BDT') })
      ]),
      el('div', { class: 'debthead__cell debthead__cell--end' }, [
        el('div', { class: 'debthead__label', text: 'You owe' }),
        el('div', { class: 'debthead__value', text: fmt(totals.iOwe, 'BDT') })
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
      class: 'row row--muted tappable',
      onClick: () => store.set({ sheet: 'debt', editDebt: { ...d } })
    }, [
      el('div', { class: 'chipglyph' }, [icon('check', 15, { weight: 2.2 })]),
      el('div', { class: 'row__body' }, [
        el('div', { class: 'row__title ellip', text: d.person }),
        el('div', { class: 'row__meta', text: 'settled' })
      ]),
      el('div', { class: 'row__amt', text: fmt(d.principal, d.currency) })
    ])));
  }

  return out;
}
