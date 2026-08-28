// Budgets and Goals share a screen behind an underlined tab pair - both answer
// "how am I doing against a number I set".

import { el } from '../core/dom.js';
import { fmt, pct, dayName, monthLabel } from '../core/format.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { bar, dot, tab } from '../ui/components.js';
import { renderDebts } from './debts.js';


const HOME_CURRENCY = 'BDT';

function tabs() {
  return el('div', { class: 'tabs' }, [
    tab('Budgets', store.ui.budgetSeg === 'budgets', () => store.set({ budgetSeg: 'budgets' })),
    tab('Goals', store.ui.budgetSeg === 'goals', () => store.set({ budgetSeg: 'goals' })),
    // Debts answer the same question as the other two - how am I doing against
    // a number - so they share the screen rather than claiming a nav slot.
    tab('Debts', store.ui.budgetSeg === 'debts', () => store.set({ budgetSeg: 'debts' }))
  ]);
}

function daysLeftText() {
  const left = store.daysLeft();
  if (left <= 0) return 'Last day of ' + monthLabel(store.today);
  return left + (left === 1 ? ' day' : ' days') + ' left in ' + monthLabel(store.today);
}

function budgetList() {
  const spentByCat = store.spentByCat();
  const total = store.db.budgets.reduce((s, b) => s + b.limit, 0);
  const spent = store.db.budgets.reduce((s, b) => s + (spentByCat[b.cat] || 0), 0);
  const p = pct(spent, total);

  const head = el('div', { class: 'budgethead' }, [
    el('div', {}, [
      el('div', { class: 'budgethead__label', text: 'Spent in ' + monthLabel(store.today) }),
      el('div', { class: 'budgethead__row' }, [
        el('div', { class: 'budgethead__v', text: fmt(spent, HOME_CURRENCY) }),
        el('div', { class: 'budgethead__of', text: 'of ' + fmt(total, HOME_CURRENCY) })
      ])
    ]),
    el('div', { class: 'pcttag', text: p + '%' })
  ]);

  const foot = el('div', { class: 'trackfoot' }, [
    el('div', { text: daysLeftText() }),
    el('div', { text: fmt(Math.max(0, total - spent), HOME_CURRENCY) + ' left' })
  ]);

  const rows = store.db.budgets.map(b => {
    const category = store.cat(b.cat);
    const used = spentByCat[b.cat] || 0;
    const p = pct(used, b.limit);
    const over = used > b.limit;

    return el('div', { class: 'budget' }, [
      el('div', { class: 'budget__top' }, [
        dot(category.color),
        el('div', { class: 'budget__name ellip', text: category.name }),
        over
          ? el('div', { class: 'tag-over' }, [
              icon('alert', 10, { weight: 2.4 }),
              'Over by ' + fmt(used - b.limit, HOME_CURRENCY)
            ])
          : null,
        el('div', { class: 'budget__spent', text: fmt(used, HOME_CURRENCY) })
      ].filter(Boolean)),
      bar(p, over ? 'var(--danger)' : category.color, true),
      el('div', { class: 'budget__foot' }, [
        el('div', { text: p + '% of ' + fmt(b.limit, HOME_CURRENCY) }),
        el('div', {
          class: over ? 'budget__left--over' : '',
          text: over ? 'nothing left' : fmt(b.limit - used, HOME_CURRENCY) + ' left'
        })
      ])
    ]);
  });

  return [head, bar(p, p > 100 ? 'var(--danger)' : 'var(--accent)'), foot, ...rows];
}

function goalList() {
  return store.db.goals.map(g => {
    const p = pct(g.current, g.target);

    // The ring is the progress: a conic sweep with the surface punched out.
    const ring = el('div', {
      class: 'ring',
      style: { background: `conic-gradient(var(--accent) ${p}%, var(--soft) 0)` }
    }, [el('div', { class: 'ring__hole', text: p + '%' })]);

    const add = (label, amount, lime) => el('div', {
      class: 'addbtn tappable' + (lime ? ' addbtn--lime' : ''),
      onClick: () => store.addToGoal(g, amount)
    }, [icon('plus', 11, { weight: 2.6 }), label]);

    return el('div', { class: 'goal' }, [
      el('div', { class: 'goal__top' }, [
        ring,
        el('div', { class: 'row__body' }, [
          el('div', { class: 'goal__name ellip', text: g.name }),
          el('div', {
            class: 'row__meta',
            text: 'By ' + dayName(g.deadline) + ' ' + g.deadline.slice(0, 4) + ' · ' +
              fmt(Math.max(0, g.target - g.current), HOME_CURRENCY) + ' to go'
          })
        ]),
        el('div', { class: 'row__right' }, [
          el('div', { class: 'goal__current', text: fmt(g.current, HOME_CURRENCY) }),
          el('div', { class: 'row__sub', text: 'of ' + fmt(g.target, HOME_CURRENCY) })
        ])
      ]),
      el('div', { class: 'goal__foot' }, [
        bar(p, 'var(--accent)', true),
        add('1K', 1000, false),
        add('5K', 5000, true)
      ])
    ]);
  });
}

const SEGMENTS = { goals: goalList, debts: renderDebts };

export function renderBudgets() {
  const seg = SEGMENTS[store.ui.budgetSeg] || budgetList;
  return [tabs(), ...seg()];
}
