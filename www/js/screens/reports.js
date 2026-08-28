// Reports. A tabbed chart canvas, so it does not read like the other screens:
// a bar field with a range strip, the category donut, account shares, and the
// month trend. Everything animates its data in - bars grow from the baseline.

import { el } from '../core/dom.js';
import { fmt, pct, compact, signed, monthLabel, MINUS } from '../core/format.js';
import { setTarget } from '../core/motion.js';
import { store } from '../core/store.js';
import {
  bar, dot, tab, accountChip
} from '../ui/components.js';
import { TREND_HISTORY } from '../data/seed.js';

const HOME_CURRENCY = 'BDT';

const TABS = [
  ['overview', 'Overview'],
  ['categories', 'Categories'],
  ['accounts', 'Accounts'],
  ['months', 'Months']
];

const RANGES = ['1w', '1m', '3m', '6m', '1y', '2y', 'All'];

// design.md: lime to green for the positive series, grey for the quietest end.
const RAMP = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)',
  'var(--series-4)', 'var(--series-5)'
];

function tabStrip() {
  return el('div', { class: 'tabs tabs--scroll' },
    TABS.map(([id, label]) =>
      tab(label, store.ui.reportTab === id, () => store.set({ reportTab: id }))
    )
  );
}

/* ---------------- overview ---------------- */

/**
 * Money out per bucket across the selected range.
 *
 * Spending is heavy-tailed: one rent payment on a linear axis flattens a whole
 * month of groceries into a grey rule. So height follows the square root of the
 * amount, and colour ranks each bucket against the other days that had any
 * spending at all - which is what makes the ramp a scale the legend can name.
 */
function barCanvas() {
  const series = store.spendSeries();
  const max = Math.max(...series, 1);
  const active = series.filter(v => v > 0).sort((a, b) => a - b);

  return el('div', { class: 'canvas' }, series.map(v => {
    if (v <= 0) {
      // A day with nothing spent is a stub, not a short bar.
      const stub = el('div', { class: 'canvas__bar canvas__bar--empty' });
      setTarget(stub, '4%');
      return stub;
    }
    const rank = active.length < 2 ? 1 : active.indexOf(v) / (active.length - 1);
    const step = Math.min(RAMP.length - 1, Math.floor(rank * RAMP.length));

    const node = el('div', { class: 'canvas__bar', style: { background: RAMP[step] } });
    setTarget(node, Math.max(10, Math.sqrt(v / max) * 100) + '%');
    return node;
  }));
}

function canvasHead() {
  const item = (color, label) => el('div', { class: 'legend__item' }, [
    dot(color),
    el('div', { class: 'legend__name', text: label })
  ]);
  return el('div', { class: 'canvashead' }, [
    el('div', { class: 'canvashead__k', text: 'Money out per day' }),
    el('div', { class: 'legendrow' }, [
      item(RAMP[0], 'Light'),
      item(RAMP[2], 'Steady'),
      item(RAMP[4], 'Heavy')
    ])
  ]);
}

function rangeStrip() {
  return el('div', { class: 'ranges' }, RANGES.map(r => el('div', {
    class: 'range tappable' + (store.ui.range === r ? ' range--on' : ''),
    text: r,
    onClick: () => store.set({ range: r })
  })));
}

function summaryRows() {
  const totals = store.monthTotals();
  const month = monthLabel(store.today);
  const perDay = totals.expense / Math.max(1, store.daysElapsed());

  const rows = [
    ['Total balance', fmt(store.netWorth(), HOME_CURRENCY), ''],
    ['Money in · ' + month, '+' + fmt(totals.income, HOME_CURRENCY), ' kvrow__v--pos'],
    ['Money out · ' + month, MINUS + fmt(totals.expense, HOME_CURRENCY), ''],
    ['Net this month', signed(totals.net, HOME_CURRENCY),
      totals.net >= 0 ? ' kvrow__v--pos' : ' kvrow__v--neg'],
    ['Average daily spend', fmt(perDay, HOME_CURRENCY), '']
  ];

  return rows.map(([k, v, mod]) => el('div', { class: 'kvrow' }, [
    el('div', { class: 'kvrow__k', text: k }),
    el('div', { class: 'kvrow__v' + mod, text: v })
  ]));
}

function overviewTab() {
  return [canvasHead(), barCanvas(), rangeStrip(), ...summaryRows()];
}

/* ---------------- categories ---------------- */

function categoryTotals() {
  const spent = store.spentByCat();
  return Object.keys(spent)
    .map(id => ({ cat: store.cat(id), value: spent[id] }))
    .filter(x => x.cat)
    .sort((a, b) => b.value - a.value);
}

function donut(totals, sum) {
  let acc = 0;
  const stops = totals.map(x => {
    const from = (acc / sum) * 100;
    acc += x.value;
    return `${x.cat.color} ${from.toFixed(2)}% ${((acc / sum) * 100).toFixed(2)}%`;
  });

  const ring = el('div', { class: 'donut__ring' });
  if (sum > 0) ring.style.background = `conic-gradient(${stops.join(',')})`;

  return el('div', { class: 'donut' }, [
    ring,
    el('div', { class: 'donut__hole' }, [
      el('div', { class: 'donut__total', text: compact(sum, HOME_CURRENCY) }),
      el('div', { class: 'donut__cap', text: 'spent' })
    ])
  ]);
}

/* Actual as a filled bar, the limit as a hard tick. Crossing the tick is the
   whole story, so it is a mark rather than a colour change. */
function budgetVsActual() {
  const spent = store.spentByCat();

  return store.db.budgets.map(b => {
    const category = store.cat(b.cat);
    const used = spent[b.cat] || 0;
    const scale = Math.max(b.limit, used) * 1.05 || 1;
    const over = used > b.limit;

    const actual = el('div', {
      class: 'bva__actual',
      style: { background: over ? 'var(--danger)' : category.color }
    });
    setTarget(actual, (used / scale) * 100 + '%');

    return el('div', { class: 'bva' }, [
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
}

function categoriesTab() {
  const totals = categoryTotals();
  const sum = totals.reduce((s, x) => s + x.value, 0);

  return [
    el('div', { class: 'donutwrap' }, [
      donut(totals, sum),
      el('div', { class: 'legend' },
        totals.slice(0, 6).map(x => el('div', { class: 'legend__item' }, [
          dot(x.cat.color),
          el('div', { class: 'legend__name ellip', text: x.cat.name }),
          el('div', { class: 'legend__pct', text: pct(x.value, sum) + '%' })
        ]))
      )
    ]),
    el('div', { class: 'fieldlabel fieldlabel--gap', text: 'Budget vs actual' }),
    ...budgetVsActual()
  ];
}

/* ---------------- accounts ---------------- */

function accountsTab() {
  return store.accountCards().map(a => el('div', { class: 'row' }, [
    accountChip(a),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title ellip', text: a.name }),
      bar(a.share, a.homeValue < 0 ? 'var(--danger)' : 'var(--accent)', true)
    ]),
    el('div', { class: 'row__right' }, [
      el('div', { class: 'row__amt', text: fmt(a.balance, a.currency) }),
      a.currency === HOME_CURRENCY
        ? null
        : el('div', { class: 'row__sub', text: '≈ ' + fmt(a.homeValue, HOME_CURRENCY) }),
      el('div', { class: 'row__sub', text: Math.round(a.share) + '% of total' })
    ].filter(Boolean))
  ]));
}

/* ---------------- months ---------------- */

function monthsTab() {
  const current = store.monthTotals();
  const data = TREND_HISTORY.concat([
    { label: monthLabel(store.today).slice(0, 3), income: current.income, expense: current.expense }
  ]);
  const max = Math.max(...data.map(d => Math.max(d.income, d.expense))) || 1;

  const columns = data.map(d => {
    const inBar = el('div', { class: 'trend__bar trend__bar--in' });
    const outBar = el('div', { class: 'trend__bar trend__bar--out' });
    setTarget(inBar, Math.max(5, (d.income / max) * 100) + '%');
    setTarget(outBar, Math.max(5, (d.expense / max) * 100) + '%');

    return el('div', { class: 'trend__col' }, [
      el('div', { class: 'trend__bars' }, [inBar, outBar]),
      el('div', { class: 'trend__label', text: d.label })
    ]);
  });

  const legend = el('div', { class: 'legendrow' }, [
    el('div', { class: 'legend__item' }, [dot('var(--accent)'), el('div', { class: 'legend__name', text: 'Income' })]),
    el('div', { class: 'legend__item' }, [dot('var(--ink2)'), el('div', { class: 'legend__name', text: 'Expense' })])
  ]);

  const rows = data.slice().reverse().map(d => el('div', { class: 'kvrow' }, [
    el('div', { class: 'kvrow__k kvrow__k--strong', text: d.label + ' ' + store.today.slice(0, 4) }),
    el('div', { class: 'monthpair' }, [
      el('div', { class: 'monthpair__in', text: '+' + fmt(d.income, HOME_CURRENCY) }),
      el('div', { class: 'monthpair__out', text: MINUS + fmt(d.expense, HOME_CURRENCY) })
    ])
  ]));

  return [legend, el('div', { class: 'trend' }, columns), ...rows];
}

/* ---------------- screen ---------------- */

const BODIES = {
  overview: overviewTab,
  categories: categoriesTab,
  accounts: accountsTab,
  months: monthsTab
};

export function renderReports() {
  return [tabStrip(), ...(BODIES[store.ui.reportTab] || overviewTab)()];
}
