// Category list. Tap a row to edit its name, colour and icon; the plus at the
// top adds one. Categories were seed-only until now - there was no write path
// for them at all - so this is also where the new repo methods get exercised.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { categoryChip, section, sectionMeta } from '../ui/components.js';
import { DEFAULT_COLOR } from '../ui/palette.js';
import { ROW_TAP, ROW_BODY, ROW_TITLE, ROW_META, ROW_RIGHT, ELLIP } from '../ui/styles.js';

function row(c) {
  const used = store.db.txns.filter(t => t.cat === c.id).length;
  return el('div', {
    class: ROW_TAP,
    dataset: { testid: 'row' },
    onClick: () => store.set({ sheet: 'entity', editEntity: { kind: 'category', ...c } })
  }, [
    categoryChip(c),
    el('div', { class: ROW_BODY }, [
      el('div', { class: ROW_TITLE + ' ' + ELLIP, text: c.name }),
      el('div', {
        class: ROW_META,
        text: (c.type === 'income' ? 'Income' : 'Expense')
          + ' · ' + (used ? used + (used === 1 ? ' transaction' : ' transactions') : 'unused')
      })
    ]),
    el('div', { class: ROW_RIGHT }, [icon('chevron-right', 16)])
  ]);
}

function addRow(type) {
  return el('div', {
    class: ROW_TAP,
    dataset: { testid: 'row' },
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
    el('div', {
      class: 'flex-none w-9 h-9 rounded-chip flex items-center justify-center font-ui '
        + 'font-bold text-[13px] normal-nums bg-transparent text-ink3 '
        + 'shadow-[inset_0_0_0_1px_var(--line)]',
      dataset: { testid: 'chipglyph', chip: 'ghost' }
    }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: ROW_BODY }, [
      el('div', { class: ROW_TITLE, text: 'New ' + type + ' category' })
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
