// Scheduled expenses: subscriptions, rent, utility bills.
//
// These live in the `bills` table, which used to be one-shot - paying deleted
// the row. Now a rule carries its own next due date and rolls forward as each
// occurrence posts, so Netflix stays on the list month after month.

import { el } from '../core/dom.js';
import { fmt, dueLabel } from '../core/format.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { categoryChip, section, sectionMeta } from '../ui/components.js';
import {
  ROW_TAP, ROW_BODY, ROW_TITLE, ROW_META, ROW_RIGHT, ROW_AMT_BARE, ROW_SUB, ELLIP
} from '../ui/styles.js';

function row(b) {
  const due = b.nextDue || b.due;
  const mode = b.variable ? 'asks for the amount' : (b.autoPost ? 'posts itself' : 'waits for you');

  return el('div', {
    class: ROW_TAP,
    dataset: { testid: 'row' },
    onClick: () => store.set({ sheet: 'recurring', editRecurring: { ...b } })
  }, [
    categoryChip(store.cat(b.cat)),
    el('div', { class: ROW_BODY }, [
      el('div', { class: ROW_TITLE + ' ' + ELLIP, text: b.name }),
      el('div', {
        class: ROW_META + ' ' + ELLIP,
        text: b.active === 0
          ? 'Paused'
          : b.freq + ' · ' + dueLabel(due, store.today).toLowerCase() + ' · ' + mode
      })
    ]),
    el('div', { class: ROW_RIGHT }, [
      el('div', { class: ROW_AMT_BARE + ' text-danger', text: fmt(b.amount, 'BDT') }),
      el('div', { class: ROW_SUB, text: (store.acct(b.account) || {}).name || '' })
    ])
  ]);
}

export function renderScheduled() {
  const active = store.db.bills.filter(b => b.active !== 0);
  const paused = store.db.bills.filter(b => b.active === 0);

  const out = [
    section('Active', sectionMeta(active.length + '')),
    ...active.map(row)
  ];

  if (paused.length) {
    out.push(section('Paused', sectionMeta(paused.length + '')));
    paused.forEach(b => out.push(row(b)));
  }

  out.push(el('div', {
    class: ROW_TAP,
    dataset: { testid: 'row' },
    onClick: () => store.set({ sheet: 'recurring', editRecurring: store.newRecurring() })
  }, [
    el('div', {
      class: 'flex-none w-9 h-9 rounded-chip flex items-center justify-center font-ui '
        + 'font-bold text-[13px] normal-nums bg-transparent text-ink3 '
        + 'shadow-[inset_0_0_0_1px_var(--line)]',
      dataset: { testid: 'chipglyph', chip: 'ghost' }
    }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: ROW_BODY }, [
      el('div', { class: ROW_TITLE, text: 'New scheduled expense' })
    ])
  ]));

  return out;
}
