// Activity. Search, filter chips, a count/total strip, then the ledger grouped
// by day. Each day carries its own net so you can scan the month.

import { el } from '../core/dom.js';
import { signed } from '../core/format.js';
import { store, FILTERS } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { chip, txnRow, groupByDay } from '../ui/components.js';
import { CHIPROW, TAP } from '../ui/styles.js';


const HOME_CURRENCY = 'BDT';

// The order lives in the store, beside SCREEN_ORDER: it is what a sideways
// swipe walks, so the shell reads it too. Only the faces are the screen's.
const FILTER_LABEL = {
  all: 'All',
  expense: 'Expense',
  income: 'Income',
  sms: 'From SMS'
};

function searchRow() {
  // Typing re-renders the list. The shell restores focus and caret afterwards
  // by matching on this id, so the field does not drop the keyboard.
  const input = el('input', {
    id: 'search-input',
    class: 'flex-1 bg-transparent border-none outline-none py-[13px] font-ui '
      + 'font-medium text-[13px] text-ink min-w-0 normal-nums placeholder:text-ink3',
    value: store.ui.query,
    placeholder: 'Search notes, categories',
    onInput: (e) => store.set({ query: e.target.value })
  });

  return el('div', { class: 'flex gap-[9px] mt-1 mb-[14px]' }, [
    el('div', {
      class: 'flex-1 flex items-center gap-[9px] bg-soft rounded-pill px-[15px] '
        + 'min-w-0 text-ink3'
    }, [icon('search', 16, { weight: 1.8 }), input]),
    el('div', {
      class: 'flex-none w-[46px] h-[46px] rounded-full bg-accent text-accent-ink '
        + 'flex items-center justify-center ' + TAP,
      dataset: { testid: 'roundbtn' },
      onClick: () => store.set({ sheet: 'sms', parse: null })
    }, [icon('message', 19)])
  ]);
}

export function renderActivity() {
  const list = store.filteredTxns();
  const sum = list.reduce(
    (s, t) => s + (t.type === 'income' ? store.homeVal(t) : -store.homeVal(t)), 0
  );
  const groups = groupByDay(list, store.today);

  // Everything below the chips is one region, so the shell can push it across
  // on a filter change without dragging the search box - and the chip that was
  // just tapped - along with it. A tab strip stays put above its pages.
  const ledger = el('div', { dataset: { testid: 'activity-list' } }, [
    el('div', {
      class: 'flex justify-between items-center gap-2 py-3 border-t border-b '
        + 'border-line mb-1.5'
    }, [
      el('div', {
        class: 'font-ui font-semibold text-[11px]/[1] text-ink3 uppercase '
          + 'tracking-[.12em] normal-nums',
        text: list.length + ' transaction' + (list.length === 1 ? '' : 's')
      }),
      el('div', {
        class: 'font-ui font-bold text-[13px]/[1] whitespace-nowrap normal-nums '
          + (sum >= 0 ? 'text-pos' : 'text-danger'),
        text: signed(sum, HOME_CURRENCY)
      })
    ]),

    ...groups.map(g => el('div', { class: 'mt-4' }, [
      el('div', { class: 'flex justify-between items-center gap-2.5 mb-0.5' }, [
        el('div', {
          class: 'font-ui font-bold text-[10px]/[1] tracking-[.14em] uppercase '
            + 'text-ink3 normal-nums',
          text: g.label
        }),
        el('div', {
          class: 'font-ui font-semibold text-[10.5px]/[1] whitespace-nowrap '
            + 'normal-nums ' + (g.sum >= 0 ? 'text-pos' : 'text-danger'),
          text: signed(g.sum, HOME_CURRENCY)
        })
      ]),
      ...g.items.map(txnRow)
    ])),

    list.length === 0
      ? el('div', {
        class: 'text-center py-[52px] px-5 font-ui font-medium text-[12.5px]/[1.6] '
          + 'text-ink3 normal-nums',
        text: 'Nothing matches that filter'
      })
      : null
  ].filter(Boolean));

  return [
    searchRow(),

    el('div', { class: CHIPROW, dataset: { testid: 'chiprow' } },
      FILTERS.map(id =>
        chip(FILTER_LABEL[id], store.ui.filter === id, () => store.setFilter(id))
      )
    ),

    ledger
  ];
}
