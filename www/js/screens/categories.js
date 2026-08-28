// Category list. Tap a row to edit its name, colour and icon; the plus at the
// top adds one. Categories were seed-only until now - there was no write path
// for them at all - so this is also where the new repo methods get exercised.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { categoryChip, section, sectionMeta } from '../ui/components.js';
import { DEFAULT_COLOR } from '../ui/palette.js';

function row(c) {
  const used = store.db.txns.filter(t => t.cat === c.id).length;
  return el('div', {
    class: 'row tappable',
    onClick: () => store.set({ sheet: 'entity', editEntity: { kind: 'category', ...c } })
  }, [
    categoryChip(c),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title ellip', text: c.name }),
      el('div', {
        class: 'row__meta',
        text: (c.type === 'income' ? 'Income' : 'Expense')
          + ' · ' + (used ? used + (used === 1 ? ' transaction' : ' transactions') : 'unused')
      })
    ]),
    el('div', { class: 'row__right' }, [icon('chevron-right', 16)])
  ]);
}

function addRow(type) {
  return el('div', {
    class: 'row tappable',
    onClick: () => store.set({
      sheet: 'entity',
      editEntity: {
        kind: 'category',
        id: 'c' + Date.now(),
        name: '',
        type,
        color: DEFAULT_COLOR,
        icon: 'tag',
        isNew: true
      }
    })
  }, [
    el('div', { class: 'chipglyph chipglyph--ghost' }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title', text: 'New ' + type + ' category' })
    ])
  ]);
}

export function renderCategories() {
  const expense = store.db.categories.filter(c => c.type === 'expense');
  const income = store.db.categories.filter(c => c.type === 'income');

  return [
    section('Expense', sectionMeta(expense.length + '')),
    ...expense.map(row),
    addRow('expense'),

    section('Income', sectionMeta(income.length + '')),
    ...income.map(row),
    addRow('income')
  ];
}
