// Pieces used by more than one screen.
//
// The atomic unit of this design is a two-line pair: a value over a muted
// caption. `txnRow` and `miniCard` are both that shape.

import { el } from '../core/dom.js';
import { fmt, dayName, MINUS } from '../core/format.js';
import { grow } from '../core/motion.js';
import { store } from '../core/store.js';

export const dot = (color) => el('div', { class: 'dot', style: { background: color } });

/** A rounded track with a fill that grows from zero on first paint. */
export function bar(percent, color, thin = false) {
  const fill = el('div', { class: 'track__fill', style: { background: color } });
  grow(fill, 'width', Math.min(100, percent) + '%');
  return el('div', { class: 'track' + (thin ? ' track--thin' : '') }, [fill]);
}

/**
 * One transaction. Income reads in green, expense in ink - lime is never used
 * for data. A foreign-currency row shows its converted value beneath.
 */
export function txnRow(t) {
  const category = store.cat(t.cat);
  const account = store.acct(t.account);
  const isIncome = t.type === 'income';
  const isFx = account && t.currency !== account.currency;

  const meta = [category && category.name, account && account.name, dayName(t.date)]
    .filter(Boolean).join(' · ');

  return el('div', { class: 'txn' }, [
    dot(category ? category.color : 'var(--ink3)'),
    el('div', { class: 'txn__body' }, [
      el('div', { class: 'txn__titlerow' }, [
        el('div', { class: 'txn__title ellip', text: t.note }),
        t.source === 'sms' ? el('div', { class: 'tag-sms', text: 'SMS' }) : null
      ]),
      el('div', { class: 'txn__meta ellip', text: meta })
    ]),
    el('div', { class: 'txn__right' }, [
      el('div', {
        class: 'txn__amt' + (isIncome ? ' txn__amt--pos' : ''),
        text: (isIncome ? '+' : MINUS) + fmt(t.amount, t.currency)
      }),
      isFx
        ? el('div', {
            class: 'txn__fx',
            text: '= ' + fmt(store.conv(t), account.currency) + ' @ ' + t.rate
          })
        : null
    ])
  ]);
}

/** Groups the activity list into days, each with its own net total. */
export function groupByDay(list, today) {
  const groups = [];
  for (const t of list) {
    let g = groups.find(x => x.date === t.date);
    if (!g) { g = { date: t.date, items: [], sum: 0 }; groups.push(g); }
    g.items.push(t);
    g.sum += t.type === 'income' ? store.homeVal(t) : -store.homeVal(t);
  }
  return groups.map(g => ({
    ...g,
    label: g.date === today ? 'Today · ' + dayName(g.date) : dayName(g.date)
  }));
}

export function chip(label, active, onClick) {
  return el('div', {
    class: 'chip tappable' + (active ? ' chip--on' : ''),
    text: label,
    onClick
  });
}

export function toggle(on, onClick) {
  return el('div', { class: 'switch' + (on ? ' switch--on' : ''), onClick }, [
    el('div', { class: 'switch__knob' })
  ]);
}
