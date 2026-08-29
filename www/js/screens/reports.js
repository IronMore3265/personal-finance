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
import { ROW, ROW_BODY, ROW_TITLE, ROW_RIGHT, ROW_AMT, ROW_SUB, ELLIP, TAP, MICROLABEL } from '../ui/styles.js';

/* Recipes used more than once on this screen. */
const LEGEND_ITEM = 'flex items-center gap-2 min-w-0';
// In a legend ROW the name does not flex and is a shade smaller: that was
// `.legendrow .legend__name`, a descendant rule with no ancestor left.
const LEGEND_NAME = 'font-ui font-medium text-[12px]/[1] text-ink2 min-w-0';
const LEGEND_NAME_ROW = 'font-ui font-medium text-[11px]/[1] text-ink2 min-w-0 flex-none';
// No margin in the recipe: `.canvashead .legendrow { margin-bottom: 0 }` used
// to zero it inside the chart head, and an `mb-0` utility cannot beat
// `mb-[14px]` the way that descendant rule beat `.legendrow`. The callers that
// want the gap ask for it.
const LEGENDROW = 'flex gap-4';
const KVROW = 'flex items-center justify-between gap-3 py-[15px] border-b border-line';
const KVROW_K = 'font-ui font-medium text-[14px]/[1] text-ink2 normal-nums';
const KVROW_V = 'font-ui font-bold text-[14.5px]/[1] whitespace-nowrap normal-nums';
const CANVAS_BAR = 'flex-1 min-w-[3px] rounded-pill h-[var(--target,0)] '
  + '[animation:growHeight_var(--dur-short)_var(--ease-enter)_both]';
const TREND_BAR = 'w-[13px] rounded-pill h-[var(--target,0)] '
  + '[animation:growHeight_var(--dur-short)_var(--ease-enter)_both]';

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
  return el('div', { class: 'flex gap-5 border-b border-line mb-4 overflow-x-auto noscrollbar' },
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

  return el('div', {
    class: 'flex items-end gap-[3px] h-[190px] mb-4'
  }, series.map(v => {
    if (v <= 0) {
      // A day with nothing spent is a stub in the track tint, not a short bar -
      // it must not read as a small amount of money.
      const stub = el('div', { class: CANVAS_BAR + ' bg-soft' });
      setTarget(stub, '4%');
      return stub;
    }
    const rank = active.length < 2 ? 1 : active.indexOf(v) / (active.length - 1);
    const step = Math.min(RAMP.length - 1, Math.floor(rank * RAMP.length));

    const node = el('div', { class: CANVAS_BAR, style: { background: RAMP[step] } });
    setTarget(node, Math.max(10, Math.sqrt(v / max) * 100) + '%');
    return node;
  }));
}

function canvasHead() {
  const item = (color, label) => el('div', { class: LEGEND_ITEM }, [
    dot(color),
    el('div', { class: LEGEND_NAME_ROW, text: label })
  ]);
  return el('div', {
    class: 'flex items-center justify-between flex-wrap gap-y-2.5 gap-x-4 mb-[14px]'
  }, [
    el('div', { class: MICROLABEL, text: 'Money out per day' }),
    // mb-0: this legend sits inside the head, which owns the spacing.
    el('div', { class: LEGENDROW }, [
      item(RAMP[0], 'Light'),
      item(RAMP[2], 'Steady'),
      item(RAMP[4], 'Heavy')
    ])
  ]);
}

function rangeStrip() {
  return el('div', { class: 'flex gap-1.5 mb-1.5' }, RANGES.map(r => el('div', {
    class: 'flex-1 text-center py-[9px] rounded-pill font-ui font-semibold '
      + 'text-[11.5px] normal-nums ' + TAP
      + (store.ui.range === r ? ' bg-soft text-ink' : ' bg-transparent text-ink3'),
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
    ['Money in · ' + month, '+' + fmt(totals.income, HOME_CURRENCY), ' text-pos'],
    ['Money out · ' + month, MINUS + fmt(totals.expense, HOME_CURRENCY), ' text-danger'],
    ['Net this month', signed(totals.net, HOME_CURRENCY),
      totals.net >= 0 ? ' text-pos' : ' text-danger'],
    ['Average daily spend', fmt(perDay, HOME_CURRENCY), '']
  ];

  return rows.map(([k, v, mod]) => el('div', { class: KVROW }, [
    el('div', { class: KVROW_K, text: k }),
    el('div', { class: KVROW_V + (mod || ' text-ink'), text: v })
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

  const ring = el('div', { class: 'absolute inset-0 rounded-full' });
  if (sum > 0) ring.style.background = `conic-gradient(${stops.join(',')})`;

  return el('div', { class: 'relative flex-none w-[126px] h-[126px] rounded-full' }, [
    ring,
    el('div', {
      class: 'absolute inset-[26px] bg-surface rounded-full flex flex-col '
        + 'items-center justify-center'
    }, [
      el('div', {
        class: 'font-ui font-bold text-[15px]/[1] text-ink tracking-[-.02em] normal-nums',
        text: compact(sum, HOME_CURRENCY)
      }),
      el('div', {
        class: 'font-ui font-bold text-[8.5px]/[1] text-ink3 mt-1.5 uppercase '
          + 'tracking-[.14em] normal-nums',
        text: 'spent'
      })
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
      class: 'absolute left-0 top-0 bottom-0 w-[var(--target,0)] '
        + '[animation:growWidth_var(--dur-short)_var(--ease-enter)_both]',
      style: { background: over ? 'var(--danger)' : category.color }
    });
    setTarget(actual, (used / scale) * 100 + '%');

    return el('div', { class: 'py-[13px] border-b border-line' }, [
      el('div', { class: 'flex justify-between gap-2 mb-2.5' }, [
        el('div', {
          class: 'font-ui font-semibold text-[13.5px]/[1] text-ink min-w-0 '
            + 'normal-nums ' + ELLIP,
          text: category.name
        }),
        el('div', {
          class: 'font-ui font-medium text-[11px]/[1] text-ink3 whitespace-nowrap normal-nums',
          text: fmt(used, HOME_CURRENCY) + ' / ' + fmt(b.limit, HOME_CURRENCY)
        })
      ]),
      el('div', {
        class: 'relative h-[5px] rounded-pill overflow-hidden bg-soft'
      }, [
        actual,
        el('div', {
          class: 'absolute top-0 bottom-0 w-[3px] bg-ink',
          style: { left: (b.limit / scale) * 100 + '%' }
        })
      ])
    ]);
  });
}

function categoriesTab() {
  const totals = categoryTotals();
  const sum = totals.reduce((s, x) => s + x.value, 0);

  return [
    el('div', { class: 'flex items-center gap-5 mb-1.5' }, [
      donut(totals, sum),
      el('div', { class: 'flex-1 flex flex-col gap-2.5 min-w-0' },
        totals.slice(0, 6).map(x => el('div', { class: LEGEND_ITEM }, [
          dot(x.cat.color),
          el('div', { class: LEGEND_NAME + ' flex-1 ' + ELLIP, text: x.cat.name }),
          el('div', {
            class: 'font-ui font-bold text-[11.5px]/[1] text-ink flex-none normal-nums',
            text: pct(x.value, sum) + '%'
          })
        ]))
      )
    ]),
    el('div', { class: MICROLABEL + ' mt-[26px] mb-2', text: 'Budget vs actual' }),
    ...budgetVsActual()
  ];
}

/* ---------------- accounts ---------------- */

function accountsTab() {
  return store.accountCards().map(a => el('div', { class: ROW, dataset: { testid: 'row' } }, [
    accountChip(a),
    el('div', { class: ROW_BODY }, [
      el('div', { class: ROW_TITLE + ' ' + ELLIP, text: a.name }),
      bar(a.share, a.homeValue < 0 ? 'var(--danger)' : 'var(--accent)', true)
    ]),
    el('div', { class: ROW_RIGHT }, [
      el('div', { class: ROW_AMT + ' text-ink', text: fmt(a.balance, a.currency) }),
      a.currency === HOME_CURRENCY
        ? null
        : el('div', { class: ROW_SUB + ' text-ink3', text: '≈ ' + fmt(a.homeValue, HOME_CURRENCY) }),
      el('div', { class: ROW_SUB + ' text-ink3', text: Math.round(a.share) + '% of total' })
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
    const inBar = el('div', { class: TREND_BAR + ' bg-accent' });
    const outBar = el('div', { class: TREND_BAR + ' bg-danger' });
    setTarget(inBar, Math.max(5, (d.income / max) * 100) + '%');
    setTarget(outBar, Math.max(5, (d.expense / max) * 100) + '%');

    return el('div', {
      class: 'flex-1 flex flex-col items-center gap-[9px] h-full justify-end'
    }, [
      el('div', {
        class: 'flex gap-[3px] items-end h-full w-full justify-center'
      }, [inBar, outBar]),
      el('div', {
        class: 'font-ui font-semibold text-[10px]/[1] text-ink3 normal-nums',
        text: d.label
      })
    ]);
  });

  const legend = el('div', { class: LEGENDROW + ' mb-[14px]' }, [
    el('div', { class: LEGEND_ITEM }, [
      dot('var(--accent)'), el('div', { class: LEGEND_NAME_ROW, text: 'Income' })
    ]),
    el('div', { class: LEGEND_ITEM }, [
      dot('var(--danger)'), el('div', { class: LEGEND_NAME_ROW, text: 'Expense' })
    ])
  ]);

  const rows = data.slice().reverse().map(d => el('div', { class: KVROW }, [
    el('div', {
      class: 'font-ui font-semibold text-[13.5px]/[1] text-ink normal-nums',
      text: d.label + ' ' + store.today.slice(0, 4)
    }),
    el('div', { class: 'flex gap-[14px]' }, [
      el('div', {
        class: 'font-ui font-semibold text-[12.5px]/[1] text-pos normal-nums',
        text: '+' + fmt(d.income, HOME_CURRENCY)
      }),
      el('div', {
        class: 'font-ui font-semibold text-[12.5px]/[1] text-danger normal-nums',
        text: MINUS + fmt(d.expense, HOME_CURRENCY)
      })
    ])
  ]));

  return [
    legend,
    el('div', { class: 'flex items-end gap-3 h-[172px] mb-[18px]' }, columns),
    ...rows
  ];
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
