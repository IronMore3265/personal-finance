// Activity. Search, filter chips, a black running-total bar, then the ledger
// grouped by day. Each day carries its own net so you can scan the month.

import { el } from '../core/dom.js';
import { fmt, signed } from '../core/format.js';
import { store } from '../core/store.js';
import { chip, txnRow, groupByDay } from '../ui/components.js';
import { TODAY } from '../data/seed.js';

const HOME_CURRENCY = 'BDT';

const FILTERS = [
  ['all', 'All'],
  ['expense', 'Expense'],
  ['income', 'Income'],
  ['sms', 'From SMS']
];

function searchRow() {
  // Typing re-renders the list. The shell restores focus and caret afterwards
  // by matching on this id, so the field does not drop the keyboard.
  const input = el('input', {
    id: 'search-input',
    class: 'search',
    value: store.ui.query,
    placeholder: 'SEARCH NOTE / CATEGORY / ACCOUNT',
    onInput: (e) => store.set({ query: e.target.value })
  });

  return el('div', { class: 'searchrow' }, [
    input,
    el('div', {
      class: 'smsbtn tappable',
      text: 'Paste SMS',
      onClick: () => store.set({ sheet: 'sms', parse: null })
    })
  ]);
}

export function renderActivity() {
  const list = store.filteredTxns();
  const sum = list.reduce(
    (s, t) => s + (t.type === 'income' ? store.homeVal(t) : -store.homeVal(t)), 0
  );
  const groups = groupByDay(list, TODAY);

  return [
    searchRow(),

    el('div', { class: 'chiprow' },
      FILTERS.map(([id, label]) =>
        chip(label, store.ui.filter === id, () => store.set({ filter: id }))
      )
    ),

    el('div', { class: 'summary' }, [
      el('div', {
        class: 'summary__k',
        text: list.length + ' transaction' + (list.length === 1 ? '' : 's')
      }),
      el('div', { class: 'summary__v', text: signed(sum, HOME_CURRENCY) })
    ]),

    ...groups.map(g => el('div', { class: 'daygroup' }, [
      el('div', { class: 'daygroup__head' }, [
        el('div', { class: 'daygroup__label', text: g.label }),
        el('div', { class: 'daygroup__fill' }),
        el('div', { class: 'daygroup__total', text: signed(g.sum, HOME_CURRENCY) })
      ]),
      el('div', { class: 'panel panel--flush' }, g.items.map(txnRow))
    ])),

    list.length === 0
      ? el('div', { class: 'empty', text: 'Nothing matches that filter' })
      : null
  ].filter(Boolean);
}


