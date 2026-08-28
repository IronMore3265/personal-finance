// Home. One giant number, then the primary account as a black card, then the
// supporting rhythm: accounts, budget, what is due, what just happened.

import { el, section, sectionMeta, sectionLink } from '../core/dom.js';
import { fmt, signed, pct, dueLabel } from '../core/format.js';
import { store } from '../core/store.js';
import { bar, txnRow } from '../ui/components.js';

const HOME_CURRENCY = 'BDT';
const PRIMARY_ACCOUNT = 'a2';

function monthStrip(totals) {
  const cell = (k, v, cls, mod) => el('div', { class: 'tri__cell' + (mod || '') }, [
    el('div', { class: 'tri__k', text: k }),
    el('div', { class: 'tri__v' + (cls || ''), text: v })
  ]);
  return el('div', { class: 'tri' }, [
    cell('In · Aug', '+' + fmt(totals.income, HOME_CURRENCY), ' tri__v--pos'),
    el('div', { class: 'tri__sep' }),
    cell('Out · Aug', signed(-totals.expense, HOME_CURRENCY), '', ' tri__cell--mid'),
    el('div', { class: 'tri__sep' }),
    cell('Net', signed(totals.net, HOME_CURRENCY), '', ' tri__cell--end')
  ]);
}

/* The signature object: black card for the account you own, with its two
   live actions. */
function primaryCard(totals) {
  const account = store.acct(PRIMARY_ACCOUNT);
  return el('div', { class: 'acctcard' }, [
    el('div', { class: 'acctcard__top' }, [
      el('div', { class: 'acctcard__name', text: account.name + ' · primary' }),
      el('div', { class: 'acctcard__dots' }, [el('i'), el('i'), el('i')])
    ]),
    el('div', { class: 'acctcard__row' }, [
      el('div', {
        class: 'acctcard__bal',
        text: fmt(store.balance(PRIMARY_ACCOUNT), account.currency)
      }),
      el('div', {
        class: 'acctcard__delta',
        text: signed(totals.net, HOME_CURRENCY) + ' this month'
      })
    ]),
    el('div', { class: 'acctcard__actions' }, [
      el('div', {
        class: 'pillbtn tappable',
        onClick: () => store.go('reports')
      }, [el('div', { class: 'pillbtn__glyph' }), 'insights']),
      el('div', {
        class: 'pillbtn tappable',
        onClick: () => store.set({ sheet: 'add' })
      }, [el('div', { class: 'pillbtn__glyph', text: '+' }), 'add money'])
    ])
  ]);
}

function accountStrip() {
  const cards = store.accountCards().map(a => el('div', { class: 'minicard' }, [
    el('div', { class: 'minicard__top' }, [
      el('div', { class: 'minicard__type', text: a.typeLabel }),
      el('div', { class: 'minicard__flag' })
    ]),
    el('div', { class: 'minicard__name ellip', text: a.name }),
    el('div', { class: 'minicard__bal', text: fmt(a.balanceText, a.currency) }),
    el('div', {
      class: 'minicard__sub ellip',
      text: a.currency === HOME_CURRENCY
        ? a.currency
        : a.currency + ' · ' + fmt(a.homeValue, HOME_CURRENCY)
    })
  ]));
  return el('div', { class: 'hstrip' }, cards);
}

function budgetSummary(spentByCat) {
  const total = store.db.budgets.reduce((s, b) => s + b.limit, 0);
  const spent = store.db.budgets.reduce((s, b) => s + (spentByCat[b.cat] || 0), 0);
  const p = pct(spent, total);

  return el('div', { class: 'panel' }, [
    el('div', { class: 'bighead' }, [
      el('div', { class: 'bignum__v', style: { fontSize: '26px', letterSpacing: '-.04em' }, text: fmt(spent, HOME_CURRENCY) }),
      el('div', { class: 'bignum__of', text: 'of ' + fmt(total, HOME_CURRENCY) })
    ]),
    bar(p, p > 100 ? 'var(--danger)' : 'var(--accent)'),
    el('div', { class: 'trackfoot' }, [
      el('div', { class: 'trackfoot__k', text: p + '% used' }),
      el('div', {
        class: 'trackfoot__k',
        text: fmt(Math.max(0, total - spent), HOME_CURRENCY) + ' left'
      })
    ])
  ]);
}

function billList() {
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
    store.db.bills.map(b => el('div', { class: 'card' }, [
      el('div', { class: 'bill' }, [
        el('div', { class: 'bill__pip' + (b.due <= '2026-08-30' ? ' bill__pip--due' : '') }),
        el('div', { class: 'bill__body' }, [
          el('div', { class: 'bill__name ellip', text: b.name }),
          el('div', { class: 'bill__meta', text: dueLabel(b.due) + ' · ' + b.freq })
        ]),
        el('div', { class: 'bill__right' }, [
          el('div', { class: 'bill__amt', text: fmt(b.amount, HOME_CURRENCY) }),
          el('div', {
            class: 'limebtn tappable',
            text: 'Mark paid',
            onClick: () => store.payBill(b)
          })
        ])
      ])
    ]))
  );
}

export function renderHome() {
  const totals = store.monthTotals();
  const spentByCat = store.spentByCat();

  return [
    el('div', { class: 'hero' }, [
      el('div', { class: 'hero__label', text: 'Total balance' }),
      el('div', { class: 'hero__row' }, [
        el('div', { class: 'hero__value', text: fmt(store.netWorth(), HOME_CURRENCY) }),
        el('div', { class: 'hero__cur', text: HOME_CURRENCY })
      ]),
      monthStrip(totals)
    ]),

    primaryCard(totals),

    section('Accounts', sectionMeta(store.db.accounts.length + ' accounts')),
    accountStrip(),

    section('August budget', sectionLink('Details', () => store.go('budgets'))),
    budgetSummary(spentByCat),

    store.db.bills.length ? section('Due soon') : null,
    store.db.bills.length ? billList() : null,

    section('Recent', sectionLink('All', () => store.go('txns'))),
    el('div', { class: 'panel panel--flush' },
      store.db.txns.slice(0, 5).map(txnRow)
    )
  ].filter(Boolean);
}


