// Budgets and Goals share a screen behind a segmented control - both answer
// "how am I doing against a number I set".

import { el } from '../core/dom.js';
import { fmt, pct, dayName } from '../core/format.js';
import { store } from '../core/store.js';
import { bar, dot } from '../ui/components.js';
import { TODAY } from '../data/seed.js';

const HOME_CURRENCY = 'BDT';

function segment() {
  const item = (id, label) => el('div', {
    class: 'seg__item tappable' + (store.ui.budgetSeg === id ? ' seg__item--on' : ''),
    text: label,
    onClick: () => store.set({ budgetSeg: id })
  });
  return el('div', { class: 'seg' }, [item('budgets', 'Budgets'), item('goals', 'Goals')]);
}

function daysLeft() {
  const d = new Date(TODAY + 'T00:00:00');
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const left = end - d.getDate();
  return left === 0 ? 'Last day' : left + (left === 1 ? ' day left' : ' days left');
}

function budgetList() {
  const spentByCat = store.spentByCat();
  const total = store.db.budgets.reduce((s, b) => s + b.limit, 0);
  const spent = store.db.budgets.reduce((s, b) => s + (spentByCat[b.cat] || 0), 0);
  const p = pct(spent, total);

  const header = el('div', { class: 'panel', style: { marginBottom: '16px' } }, [
    el('div', { class: 'bighead' }, [
      el('div', { class: 'bighead__k', text: 'August 2026' }),
      el('div', { class: 'bighead__v', text: daysLeft() })
    ]),
    el('div', { class: 'bignum' }, [
      el('div', { class: 'bignum__v', text: fmt(spent, HOME_CURRENCY) }),
      el('div', { class: 'bignum__of', text: '/ ' + fmt(total, HOME_CURRENCY) })
    ]),
    bar(p, p > 100 ? 'var(--danger)' : 'var(--accent)')
  ]);

  const rows = store.db.budgets.map(b => {
    const category = store.cat(b.cat);
    const used = spentByCat[b.cat] || 0;
    const p = pct(used, b.limit);
    const over = used > b.limit;

    return el('div', { class: 'card', style: { padding: '14px' } }, [
      el('div', { class: 'budget__top' }, [
        dot(category.color),
        el('div', { class: 'budget__name ellip', text: category.name }),
        over
          ? el('div', { class: 'tag-over', text: 'OVER ' + fmt(used - b.limit, HOME_CURRENCY) })
          : null,
        el('div', { class: 'budget__spent', text: fmt(used, HOME_CURRENCY) })
      ].filter(Boolean)),
      bar(p, over ? 'var(--danger)' : category.color, true),
      el('div', { class: 'budget__foot' }, [
        el('div', { class: 'budget__pct', text: p + '% of ' + fmt(b.limit, HOME_CURRENCY) }),
        el('div', {
          class: 'budget__left' + (over ? ' budget__left--over' : ''),
          text: over ? 'nothing left' : fmt(b.limit - used, HOME_CURRENCY) + ' left'
        })
      ])
    ]);
  });

  return [header, el('div', { style: { display: 'flex', flexDirection: 'column', gap: '9px' } }, rows)];
}

function goalList() {
  const rows = store.db.goals.map(g => {
    const p = pct(g.current, g.target);
    return el('div', { class: 'panel' }, [
      el('div', { class: 'goal__top' }, [
        el('div', { style: { minWidth: '0' } }, [
          el('div', { class: 'goal__name', text: g.name }),
          el('div', {
            class: 'goal__deadline',
            text: 'By ' + dayName(g.deadline) + ' ' + g.deadline.slice(0, 4)
          })
        ]),
        el('div', { class: 'goal__pct', text: p + '%' })
      ]),
      el('div', { class: 'bignum bignum--mid' }, [
        el('div', { class: 'bignum__v', text: fmt(g.current, HOME_CURRENCY) }),
        el('div', { class: 'bignum__of', text: 'of ' + fmt(g.target, HOME_CURRENCY) })
      ]),
      bar(p, 'var(--accent)'),
      el('div', { class: 'goal__foot' }, [
        el('div', {
          class: 'goal__pace',
          text: fmt(Math.max(0, g.target - g.current), HOME_CURRENCY) + ' to go'
        }),
        el('div', { class: 'goal__adds' }, [
          el('div', {
            class: 'addbtn tappable', text: '+1K',
            onClick: () => store.addToGoal(g, 1000)
          }),
          el('div', {
            class: 'addbtn addbtn--lime tappable', text: '+5K',
            onClick: () => store.addToGoal(g, 5000)
          })
        ])
      ])
    ]);
  });

  return [el('div', { style: { display: 'flex', flexDirection: 'column', gap: '11px' } }, rows)];
}

export function renderBudgets() {
  return [
    segment(),
    ...(store.ui.budgetSeg === 'goals' ? goalList() : budgetList())
  ];
}
