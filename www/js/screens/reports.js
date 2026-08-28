// Reports. Four panels, each answering one question, and every one of them
// animates its data in - bars grow from the baseline, the donut sweeps.

import { el } from '../core/dom.js';
import { fmt, pct, compact } from '../core/format.js';
import { grow } from '../core/motion.js';
import { store } from '../core/store.js';
import { dot } from '../ui/components.js';
import { TREND_HISTORY } from '../data/seed.js';

const HOME_CURRENCY = 'BDT';

function categoryTotals() {
  const spent = store.spentByCat();
  return Object.keys(spent)
    .map(id => ({ cat: store.cat(id), value: spent[id] }))
    .filter(x => x.cat)
    .sort((a, b) => b.value - a.value);
}

function donutPanel() {
  const totals = categoryTotals();
  const sum = totals.reduce((s, x) => s + x.value, 0);

  let acc = 0;
  const stops = totals.map(x => {
    const from = (acc / sum) * 100;
    acc += x.value;
    return `${x.cat.color} ${from.toFixed(2)}% ${((acc / sum) * 100).toFixed(2)}%`;
  });

  const ring = el('div', { class: 'donut__ring' });
  if (sum > 0) ring.style.background = `conic-gradient(${stops.join(',')})`;

  return el('div', { class: 'panel', style: { marginBottom: '13px' } }, [
    el('div', { class: 'panel__title', text: 'Expense by category · Aug' }),
    el('div', { class: 'donutwrap' }, [
      el('div', { class: 'donut' }, [
        ring,
        el('div', { class: 'donut__hole' }, [
          el('div', { class: 'donut__total', text: compact(sum, HOME_CURRENCY) }),
          el('div', { class: 'donut__cap', text: 'spent' })
        ])
      ]),
      el('div', { class: 'legend' },
        totals.slice(0, 6).map(x => el('div', { class: 'legend__item' }, [
          dot(x.cat.color),
          el('div', { class: 'legend__name ellip', text: x.cat.name }),
          el('div', { class: 'legend__pct', text: pct(x.value, sum) + '%' })
        ]))
      )
    ])
  ]);
}

function trendPanel() {
  const current = store.monthTotals();
  const data = TREND_HISTORY.concat([
    { label: 'Aug', income: current.income, expense: current.expense }
  ]);
  const max = Math.max(...data.map(d => Math.max(d.income, d.expense))) || 1;

  const columns = data.map(d => {
    const inBar = el('div', { class: 'trend__bar trend__bar--in' });
    const outBar = el('div', { class: 'trend__bar trend__bar--out' });
    grow(inBar, 'height', Math.max(5, (d.income / max) * 100) + '%');
    grow(outBar, 'height', Math.max(5, (d.expense / max) * 100) + '%');

    return el('div', { class: 'trend__col' }, [
      el('div', { class: 'trend__bars' }, [inBar, outBar]),
      el('div', { class: 'trend__label', text: d.label })
    ]);
  });

  return el('div', { class: 'panel', style: { marginBottom: '13px' } }, [
    el('div', { class: 'panel__title', text: 'Income vs expense · 6 months' }),
    el('div', { class: 'trend' }, columns),
    el('div', { class: 'keyrow' }, [
      el('div', { class: 'key' }, [
        el('div', { class: 'key__swatch key__swatch--in' }),
        el('div', { class: 'key__label', text: 'Income' })
      ]),
      el('div', { class: 'key' }, [
        el('div', { class: 'key__swatch key__swatch--out' }),
        el('div', { class: 'key__label', text: 'Expense' })
      ])
    ])
  ]);
}

/* Actual as a filled bar, the limit as a hard tick. Crossing the tick is the
   whole story, so it is a mark rather than a colour change. */
function budgetVsActualPanel() {
  const spent = store.spentByCat();

  const rows = store.db.budgets.map(b => {
    const category = store.cat(b.cat);
    const used = spent[b.cat] || 0;
    const scale = Math.max(b.limit, used) * 1.05 || 1;
    const over = used > b.limit;

    const actual = el('div', {
      class: 'bva__actual',
      style: { background: over ? 'var(--danger)' : category.color }
    });
    grow(actual, 'width', (used / scale) * 100 + '%');

    return el('div', {}, [
      el('div', { class: 'bva__head' }, [
        el('div', { class: 'bva__name ellip', text: category.name }),
        el('div', {
          class: 'bva__text',
          text: fmt(used, HOME_CURRENCY) + ' / ' + fmt(b.limit, HOME_CURRENCY)
        })
      ]),
      el('div', { class: 'bva__track' }, [
        actual,
        el('div', { class: 'bva__mark', style: { left: (b.limit / scale) * 100 + '%' } })
      ])
    ]);
  });

  return el('div', { class: 'panel', style: { marginBottom: '13px' } }, [
    el('div', { class: 'panel__title', style: { marginBottom: '16px' }, text: 'Budget vs actual' }),
    el('div', { class: 'bva' }, rows)
  ]);
}

function balancesPanel() {
  return el('div', { class: 'panel' }, [
    el('div', { class: 'panel__title', style: { marginBottom: '4px' }, text: 'Account balances' }),
    ...store.accountCards().map(a => el('div', { class: 'acctline' }, [
      el('div', { class: 'acctline__type', text: a.typeLabel }),
      el('div', { class: 'acctline__name ellip', text: a.name }),
      el('div', { class: 'acctline__bal', text: fmt(a.balanceText, a.currency) })
    ]))
  ]);
}

export function renderReports() {
  return [donutPanel(), trendPanel(), budgetVsActualPanel(), balancesPanel()];
}
