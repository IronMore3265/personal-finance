// Budgets and Goals share a screen behind an underlined tab pair - both answer
// "how am I doing against a number I set".

import { el } from '../core/dom.js';
import { fmt, pct, dayName, monthLabel } from '../core/format.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { bar, dot, tab } from '../ui/components.js';
import { renderDebts } from './debts.js';
import { ROW_BODY, ROW_SUB, ELLIP, TAP } from '../ui/styles.js';


const HOME_CURRENCY = 'BDT';

/* Recipes used more than once inside this screen. */
const PCTTAG = 'flex-none font-ui font-bold text-[11px]/[1] text-accent-ink '
  + 'bg-accent rounded-pill py-2 px-[11px] normal-nums';
const TRACKFOOT = 'flex justify-between gap-2 mb-3 font-ui font-medium '
  + 'text-[11px]/[1] text-ink3 normal-nums';
const ADDBTN = 'flex items-center gap-1 flex-none font-ui font-bold '
  + 'text-[10.5px]/[1] rounded-pill py-2 px-[11px] normal-nums';
/*
 * 58/44 rather than 48/38: a 5px sweep read as a hairline, and the unfilled
 * half of it is --soft on --surface, which is nearly no contrast at all on a
 * white sheet. Seven pixels is enough to see the proportion at a glance.
 */
const RING = 'flex-none w-[58px] h-[58px] rounded-full flex items-center justify-center';
const RING_HOLE = 'w-11 h-11 rounded-full bg-surface flex items-center '
  + 'justify-center font-ui font-bold text-[12px] text-ink normal-nums';

function tabs() {
  return el('div', { class: 'flex gap-[22px] border-b border-line mb-[18px]' }, [
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

  const head = el('div', { class: 'flex items-end justify-between gap-3' }, [
    el('div', {}, [
      el('div', {
        class: 'font-ui font-bold text-[10px]/[1] tracking-[.18em] uppercase '
          + 'text-ink3 normal-nums',
        text: 'Spent in ' + monthLabel(store.today)
      }),
      el('div', { class: 'flex items-baseline gap-2 mt-[13px] whitespace-nowrap' }, [
        el('div', {
          class: 'font-ui font-extrabold text-[34px]/[1] text-ink tracking-[-.045em] normal-nums',
          text: fmt(spent, HOME_CURRENCY)
        }),
        el('div', {
          class: 'font-ui font-medium text-[12px]/[1] text-ink3 normal-nums',
          text: 'of ' + fmt(total, HOME_CURRENCY)
        })
      ])
    ]),
    el('div', { class: PCTTAG, text: p + '%' })
  ]);

  const foot = el('div', { class: TRACKFOOT }, [
    el('div', { text: daysLeftText() }),
    el('div', { text: fmt(Math.max(0, total - spent), HOME_CURRENCY) + ' left' })
  ]);

  const rows = store.db.budgets.map(b => {
    const category = store.cat(b.cat);
    const used = spentByCat[b.cat] || 0;
    const p = pct(used, b.limit);
    const over = used > b.limit;

    return el('div', { class: 'py-[14px] border-b border-line' }, [
      el('div', { class: 'flex items-center gap-2.5' }, [
        dot(category.color),
        el('div', {
          class: 'flex-1 font-ui font-semibold text-[14px]/[1.2] text-ink min-w-0 '
            + 'normal-nums ' + ELLIP,
          text: category.name
        }),
        over
          ? el('div', {
            class: 'flex items-center gap-1 flex-none whitespace-nowrap font-ui '
              + 'font-bold text-[9px]/[1] tracking-[.06em] text-white bg-danger '
              + 'rounded-pill py-1 px-2 normal-nums'
          }, [
            icon('alert', 10, { weight: 2.4 }),
            'Over by ' + fmt(used - b.limit, HOME_CURRENCY)
          ])
          : null,
        el('div', {
          class: 'font-ui font-bold text-[14px]/[1] text-ink flex-none normal-nums',
          text: fmt(used, HOME_CURRENCY)
        })
      ].filter(Boolean)),
      bar(p, over ? 'var(--danger)' : category.color, true),
      el('div', {
        class: 'flex justify-between gap-2 mt-[9px] font-ui font-medium '
          + 'text-[10.5px]/[1] text-ink3 whitespace-nowrap normal-nums'
      }, [
        el('div', { text: p + '% of ' + fmt(b.limit, HOME_CURRENCY) }),
        el('div', {
          class: over ? 'text-danger font-semibold' : '',
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
      class: RING,
      style: { background: `conic-gradient(var(--accent) ${p}%, var(--soft) 0)` }
    }, [el('div', { class: RING_HOLE, text: p + '%' })]);

    const add = (label, amount, lime) => el('div', {
      class: ADDBTN + ' ' + TAP
        + (lime ? ' bg-accent text-accent-ink' : ' bg-soft text-ink'),
      onClick: () => store.addToGoal(g, amount)
    }, [icon('plus', 11, { weight: 2.6 }), label]);

    return el('div', { class: 'py-4 border-b border-line' }, [
      el('div', { class: 'flex items-center gap-3' }, [
        ring,
        el('div', { class: ROW_BODY }, [
          el('div', {
            class: 'font-ui font-semibold text-[15px]/[1.2] text-ink normal-nums ' + ELLIP,
            text: g.name
          }),
          el('div', {
            class: 'font-ui font-medium text-[11px]/[1] text-ink3 mt-1.5 '
              + 'tracking-[.01em] normal-nums',
            text: 'By ' + dayName(g.deadline) + ' ' + g.deadline.slice(0, 4) + ' · ' +
              fmt(Math.max(0, g.target - g.current), HOME_CURRENCY) + ' to go'
          })
        ]),
        el('div', { class: 'text-right flex-none' }, [
          el('div', {
            class: 'font-ui font-bold text-[15px]/[1] text-ink whitespace-nowrap normal-nums',
            text: fmt(g.current, HOME_CURRENCY)
          }),
          el('div', { class: ROW_SUB, text: 'of ' + fmt(g.target, HOME_CURRENCY) })
        ])
      ]),
      el('div', { class: 'flex items-center gap-[9px] mt-[13px]' }, [
        bar(p, 'var(--accent)', true, 'flex-1 m-0'),
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
