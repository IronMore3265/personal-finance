// Home. A centred total, then the one dark card the design allows per screen,
// then flat rows on the white sheet: accounts, what is due, what just happened.

import { el } from '../core/dom.js';
import { fmt, signed, dueLabel, dayBefore, monthStart, MINUS } from '../core/format.js';
import { store } from '../core/store.js';
import { icon, sparkline } from '../ui/icons.js';
import {
  txnRow, iconChip, accountChip, sparkPoints, toggleLabel,
  section, sectionMeta, sectionLink
} from '../ui/components.js';
import {
  ROW, ROW_BODY, ROW_TITLE, ROW_META, ROW_RIGHT, ROW_AMT, ROW_AMT_BARE, ROW_SUB_BARE,
  ELLIP, TAP
} from '../ui/styles.js';


const HOME_CURRENCY = 'BDT';
const PRIMARY_ACCOUNT = 'a2';

/* One dot of the card's overflow menu. These were `.acctcard__dots i` - a
   descendant rule with no ancestor class left to hang off. */
const dotmark = () => el('i', { class: 'w-[3.5px] h-[3.5px] rounded-full bg-white/55' });

/* The one dark card. Everything else on this screen is a flat row. */
function primaryCard() {
  const account = store.acct(PRIMARY_ACCOUNT);
  const balance = store.balance(PRIMARY_ACCOUNT);

  // Month to date, measured against the closing balance of the previous month.
  const opening = store.balanceAsOf(PRIMARY_ACCOUNT, dayBefore(monthStart(store.today)));
  const change = balance - opening;
  const percent = opening !== 0 ? (change / Math.abs(opening)) * 100 : 0;

  const action = (glyph, label, onClick) => el('div', {
    class: 'flex items-center gap-2 bg-white/11 rounded-pill py-2.5 pr-[15px] '
      + 'pl-[11px] font-ui font-semibold text-[12.5px]/[1] text-white normal-nums '
      + TAP,
    onClick
  }, [icon(glyph, 16), label]);

  return el('div', {
    class: 'bg-[var(--cardBg)] rounded-card pt-[18px] px-[19px] pb-[19px] mt-5'
  }, [
    el('div', { class: 'flex items-center justify-between gap-2.5' }, [
      el('div', { class: 'flex items-center gap-[9px] min-w-0' }, [
        el('div', {
          class: 'flex-none w-[26px] h-[26px] rounded-[9px] bg-white/12 flex '
            + 'items-center justify-center text-white'
        }, [icon('card', 14)]),
        el('div', {
          class: 'font-ui font-medium text-[13px]/[1] text-white/66 normal-nums',
          text: account.name + ' · primary'
        })
      ]),
      el('div', {
        class: 'flex gap-[3px] items-center flex-none p-1.5 -m-1.5 ' + TAP,
        onClick: () => {
          store.set({ reportTab: 'accounts' }, true);
          store.go('reports');
        }
      }, [dotmark(), dotmark(), dotmark()])
    ]),
    el('div', { class: 'flex items-baseline gap-2.5 mt-4 whitespace-nowrap' }, [
      el('div', {
        class: 'font-ui font-extrabold text-[28px]/[1] text-white tracking-[-.04em] normal-nums',
        text: fmt(balance, account.currency)
      }),
      el('div', {
        // Flat is not a gain, and a loss is not one either: the card's own
        // white for no movement, lime for up, red for down.
        class: 'font-ui font-bold text-[12px]/[1] normal-nums '
          + (change === 0 ? 'text-white/66' : change > 0 ? 'text-[#c6ee6a]' : 'text-[#f08080]'),
        text: (change === 0 ? '' : change > 0 ? '+' : MINUS)
          + Math.abs(percent).toFixed(2) + '% · ' + signed(change, account.currency)
      })
    ]),
    el('div', { class: 'flex gap-[9px] mt-[18px]' }, [
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

    // An account that has not moved is neither a gain nor a loss, so it gets
    // neither colour - green on a flat 0.0% was reading as good news.
    const tone = delta.flat ? 'text-ink' : delta.up ? 'text-pos' : 'text-danger';
    const stroke = delta.flat ? 'var(--ink3)' : delta.up ? 'var(--pos)' : 'var(--danger)';
    const sign = delta.flat ? '' : delta.up ? '+' : MINUS;

    return el('div', { class: ROW, dataset: { testid: 'row' } }, [
      accountChip(a),
      el('div', { class: ROW_BODY }, [
        el('div', { class: ROW_TITLE + ' ' + ELLIP, text: a.name }),
        el('div', {
          class: ROW_META,
          text: a.typeLabel + (a.currency === HOME_CURRENCY ? '' : ' · ' + a.currency)
        })
      ]),
      sparkline(sparkPoints(history), stroke),
      el('div', { class: ROW_RIGHT + ' min-w-[74px]' }, [
        el('div', { class: ROW_AMT, text: fmt(a.balance, a.currency) }),
        el('div', {
          // Bolder and a shade larger than a plain sub-line, which is what the
          // --pos / --neg modifiers used to add on top of the colour. Built from
          // ROW_SUB_BARE rather than ROW_SUB: see the note there - a text-danger
          // added on top of ROW_SUB's text-ink3 loses and the drop renders grey.
          class: ROW_SUB_BARE + ' font-semibold text-[11px] ' + tone,
          text: sign + Math.abs(delta.percent).toFixed(1) + '%'
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

    return el('div', { class: ROW, dataset: { testid: 'row' } }, [
      iconChip('bell', store.isOverdue(b) ? 'var(--accentSoft)' : 'var(--soft)'),
      el('div', { class: ROW_BODY }, [
        el('div', { class: ROW_TITLE + ' ' + ELLIP, text: b.name }),
        el('div', { class: ROW_META, text: meta })
      ]),
      el('div', {
        class: ROW_AMT_BARE + ' flex-none text-danger',
        text: fmt(b.amount, HOME_CURRENCY)
      }),
      // Paying is a single lime tick, not the words "Mark paid".
      el('div', {
        class: 'flex-none w-[34px] h-[34px] rounded-full bg-accent text-accent-ink '
          + 'flex items-center justify-center ' + TAP,
        dataset: { testid: 'roundbtn' },
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

/**
 * Money lent and money owed, as one line each.
 *
 * Both totals come from the caller, which has already worked out whether there
 * is any lending to show at all - the same test gates the toggle above it.
 */
function debtSummary(owedToMe, iOwe) {
  // The two sides are mirrored, the way the Debts tab heads its own totals:
  // what is coming to you reads in from the left edge, what is going out reads
  // in from the right. Left-aligning both left the second column floating in
  // the middle of the strip with dead space after it.
  const cell = (label, value, tone, align) => el('div', {
    class: 'flex-1 min-w-0 ' + align + ' ' + TAP,
    onClick: () => store.set({ budgetSeg: 'debts', screen: 'budgets' })
  }, [
    el('div', {
      class: 'font-ui font-semibold text-[10px]/[1] text-ink3 uppercase '
        + 'tracking-[.12em] normal-nums',
      text: label
    }),
    el('div', {
      class: 'font-ui font-extrabold text-[19px]/[1] mt-[7px] tracking-[-.03em] '
        + 'normal-nums ' + tone,
      text: fmt(value, HOME_CURRENCY)
    })
  ]);

  return el('div', {
    class: 'flex gap-2.5 py-[14px] border-t border-b border-line mt-[15px]'
  }, [
    // Zero on one side is not a positive or a negative, it is nothing owed -
    // so it stays plain ink and lets the side that does have a number carry
    // the colour.
    cell('Owed to you', owedToMe, owedToMe ? 'text-pos' : 'text-ink', 'text-left'),
    cell('You owe', iOwe, iOwe ? 'text-danger' : 'text-ink', 'text-right')
  ]);
}

export function renderHome() {
  const totals = store.monthTotals();
  const up = totals.net >= 0;

  // No lending either way means the toggle has nothing to say - and the strip
  // below it is hidden on the same test.
  const { owedToMe, iOwe } = store.debtTotals();
  const hasDebt = !!(owedToMe || iOwe);

  return [
    el('div', { class: 'text-center pt-[14px] pb-1' }, [
      el('div', {
        class: 'font-ui font-bold text-[10px]/[1] tracking-[.2em] uppercase '
          + 'text-ink3 normal-nums',
        text: 'Total balance'
      }),
      el('div', {
        class: 'font-ui font-extrabold text-[44px]/[1] text-ink tracking-[-.045em] '
          + 'mt-[14px] whitespace-nowrap normal-nums',
        dataset: { testid: 'balance-value' },
        text: fmt(store.homeBalance(), HOME_CURRENCY)
      }),
      el('div', {
        class: 'flex items-center justify-center gap-1.5 mt-[11px] font-ui '
          + 'font-bold text-[12.5px]/[1] whitespace-nowrap normal-nums '
          + (up ? 'text-pos' : 'text-danger')
      }, [
        icon(up ? 'chevronUp' : 'chevronDown', 13, { weight: 2 }),
        el('div', {
          text: signed(totals.net, HOME_CURRENCY) + ' this month'
        })
      ]),
      // A switch, not a filter pill. It does not narrow a list the way the
      // chips on Activity do - it changes what the number above it counts - and
      // at pill size it read as the loudest control on the screen. Scaled to
      // the micro-label it sits under instead.
      hasDebt ? el('div', { class: 'flex justify-center mt-[15px]' }, [
        toggleLabel('Include debt', store.ui.includeDebt, () => store.toggleIncludeDebt())
      ]) : null
    ]),

    // Directly under the number it qualifies, not buried below the accounts.
    hasDebt ? debtSummary(owedToMe, iOwe) : null,

    primaryCard(),

    section('Accounts', sectionMeta(store.db.accounts.length + ' accounts')),
    ...accountRows(),

    store.dueSoon().length ? section('Due soon') : null,
    ...recurringRows(),

    section('Recent', sectionLink('All', () => store.go('txns'))),
    ...store.db.txns.slice(0, 5).map(txnRow)
  ].filter(Boolean);
}
