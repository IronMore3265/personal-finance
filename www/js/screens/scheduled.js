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

function row(b) {
  const due = b.nextDue || b.due;
  const mode = b.variable ? 'asks for the amount' : (b.autoPost ? 'posts itself' : 'waits for you');

  return el('div', {
    class: 'row tappable',
    onClick: () => store.set({ sheet: 'recurring', editRecurring: { ...b } })
  }, [
    categoryChip(store.cat(b.cat)),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title ellip', text: b.name }),
      el('div', {
        class: 'row__meta ellip',
        text: b.active === 0
          ? 'Paused'
          : b.freq + ' · ' + dueLabel(due, store.today).toLowerCase() + ' · ' + mode
      })
    ]),
    el('div', { class: 'row__right' }, [
      el('div', { class: 'row__amt', text: fmt(b.amount, 'BDT') }),
      el('div', { class: 'row__sub', text: (store.acct(b.account) || {}).name || '' })
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
    class: 'row tappable',
    onClick: () => store.set({
      sheet: 'recurring',
      editRecurring: {
        id: 'rb' + Date.now(),
        name: '',
        amount: 0,
        account: store.db.accounts[0].id,
        cat: (store.db.categories.find(c => c.type === 'expense') || store.db.categories[0]).id,
        freq: 'monthly',
        due: store.today,
        nextDue: store.today,
        autoPost: 0,
        active: 1,
        variable: 0,
        isNew: true
      }
    })
  }, [
    el('div', { class: 'chipglyph chipglyph--ghost' }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title', text: 'New scheduled expense' })
    ])
  ]));

  return out;
}
