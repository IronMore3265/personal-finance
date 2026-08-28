// Home. A centred total, then the one dark card the design allows per screen,
// then flat rows on the white sheet: accounts, what is due, what just happened.

import { el } from '../core/dom.js';
import { fmt, signed, dueLabel, dayBefore, monthStart, MINUS } from '../core/format.js';
import { store } from '../core/store.js';
import { icon, sparkline } from '../ui/icons.js';
import {
  txnRow, iconChip, accountChip, sparkPoints,
  section, sectionMeta, sectionLink
} from '../ui/components.js';


const HOME_CURRENCY = 'BDT';
const PRIMARY_ACCOUNT = 'a2';

/* The one dark card. Everything else on this screen is a flat row. */
function primaryCard() {
  const account = store.acct(PRIMARY_ACCOUNT);
  const balance = store.balance(PRIMARY_ACCOUNT);

  // Month to date, measured against the closing balance of the previous month.
  const opening = store.balanceAsOf(PRIMARY_ACCOUNT, dayBefore(monthStart(store.today)));
  const change = balance - opening;
  const percent = opening !== 0 ? (change / Math.abs(opening)) * 100 : 0;

  const action = (glyph, label, onClick) => el('div', {
    class: 'cardbtn tappable', onClick
  }, [icon(glyph, 16), label]);

  return el('div', { class: 'acctcard' }, [
    el('div', { class: 'acctcard__top' }, [
      el('div', { class: 'acctcard__id' }, [
        el('div', { class: 'acctcard__chip' }, [icon('card', 14)]),
        el('div', { class: 'acctcard__name', text: account.name + ' · primary' })
      ]),
      el('div', {
        class: 'acctcard__dots tappable',
        onClick: () => {
          store.set({ reportTab: 'accounts' }, true);
          store.go('reports');
        }
      }, [el('i'), el('i'), el('i')])
    ]),
    el('div', { class: 'acctcard__row' }, [
      el('div', { class: 'acctcard__bal', text: fmt(balance, account.currency) }),
      el('div', {
        class: 'acctcard__delta',
        text: (change >= 0 ? '+' : MINUS) + Math.abs(percent).toFixed(2) + '% · ' +
          signed(change, account.currency)
      })
    ]),
    el('div', { class: 'acctcard__actions' }, [
      action('pie', 'analytics', () => store.go('reports')),
      // A blank draft aimed at this card's account, not whatever the sheet
      // was last left holding.
      action('plusCircle', 'replenish', () => store.set(store.resetEntry({
        sheet: 'add',
        entryType: 'income',
        entryCat: 'i1',
        entryAccount: PRIMARY_ACCOUNT
      })))
    ])
  ]);
}

function accountRows() {
  return store.accountCards().map(a => {
    const delta = store.accountDelta(a.id);
    const history = store.accountHistory(a.id);

    return el('div', { class: 'row' }, [
      accountChip(a),
      el('div', { class: 'row__body' }, [
        el('div', { class: 'row__title ellip', text: a.name }),
        el('div', {
          class: 'row__meta',
          text: a.typeLabel + (a.currency === HOME_CURRENCY ? '' : ' · ' + a.currency)
        })
      ]),
      sparkline(sparkPoints(history), delta.up ? 'var(--pos)' : 'var(--danger)'),
      el('div', { class: 'row__right row__right--wide' }, [
        el('div', { class: 'row__amt', text: fmt(a.balance, a.currency) }),
        el('div', {
          class: 'row__sub' + (delta.up ? ' row__sub--pos' : ' row__sub--neg'),
          text: (delta.up ? '+' : MINUS) + Math.abs(delta.percent).toFixed(1) + '%'
        })
      ])
    ]);
  });
}

/**
 * Recurring rules that are due within the week, or already overdue.
 *
 * Auto-posting rules have normally taken themselves off this list at boot, so
 * what is left is the ones that wanted a look first. A variable rule opens the
 * add sheet prefilled instead of posting, because its amount is the one thing
 * the rule does not know.
 */
function recurringRows() {
  return store.dueSoon().map(b => {
    const due = b.nextDue || b.due;
    const meta = dueLabel(due, store.today) + ' · ' + b.freq
      + (b.variable ? ' · amount varies' : '');

    return el('div', { class: 'row' }, [
      iconChip('bell', store.isOverdue(b) ? 'var(--accentSoft)' : 'var(--soft)'),
      el('div', { class: 'row__body' }, [
        el('div', { class: 'row__title ellip', text: b.name }),
        el('div', { class: 'row__meta', text: meta })
      ]),
      el('div', { class: 'row__amt row__amt--flush', text: fmt(b.amount, HOME_CURRENCY) }),
      // Paying is a single lime tick, not the words "Mark paid".
      el('div', {
        class: 'roundbtn roundbtn--lime tappable',
        onClick: () => (b.variable
          ? store.set(store.resetEntry({
            sheet: 'add',
            entryAccount: b.account,
            entryCat: b.cat,
            entryNote: b.name,
            entryDate: due,
            entryAmount: String(b.amount),
            entryValue: b.amount
          }))
          : store.postRecurring(b).then(() => store.say('Posted · ' + b.name)))
      }, [icon('check', 16, { weight: 2.2 })])
    ]);
  });
}

/** Money lent and money owed, as one line each. Only shown when there is any. */
function debtSummary() {
  const { owedToMe, iOwe } = store.debtTotals();
  if (!owedToMe && !iOwe) return null;

  const cell = (label, value, cls) => el('div', {
    class: 'debtsum__cell tappable',
    onClick: () => store.set({ budgetSeg: 'debts', screen: 'budgets' })
  }, [
    el('div', { class: 'debtsum__label', text: label }),
    el('div', { class: 'debtsum__value ' + cls, text: fmt(value, HOME_CURRENCY) })
  ]);

  return el('div', { class: 'debtsum' }, [
    cell('Owed to you', owedToMe, 'debtsum__value--pos'),
    cell('You owe', iOwe, 'debtsum__value--neg')
  ]);
}

export function renderHome() {
  const totals = store.monthTotals();
  const up = totals.net >= 0;

  return [
    el('div', { class: 'balance' }, [
      el('div', { class: 'balance__label', text: 'Total balance' }),
      el('div', { class: 'balance__value', text: fmt(store.netWorth(), HOME_CURRENCY) }),
      el('div', { class: 'balance__delta' + (up ? '' : ' balance__delta--neg') }, [
        icon(up ? 'chevronUp' : 'chevronDown', 13, { weight: 2 }),
        el('div', {
          text: signed(totals.net, HOME_CURRENCY) + ' this month'
        })
      ])
    ]),

    primaryCard(),

    section('Accounts', sectionMeta(store.db.accounts.length + ' accounts')),
    ...accountRows(),

    debtSummary(),

    store.dueSoon().length ? section('Due soon') : null,
    ...recurringRows(),

    section('Recent', sectionLink('All', () => store.go('txns'))),
    ...store.db.txns.slice(0, 5).map(txnRow)
  ].filter(Boolean);
}
