// Pieces used by more than one screen.
//
// v4 is de-carded: the sheet is white and rows sit directly on it, separated by
// a single hairline. So the shared unit is no longer a card - it is a row:
// glyph chip, title over meta, right-aligned number.

import { el } from '../core/dom.js';
import { fmt, dayName, MINUS } from '../core/format.js';
import { setTarget } from '../core/motion.js';
import { store } from '../core/store.js';
import { icon, hasIcon } from './icons.js';
import { brandKey, brandChip } from './brands.js';

/** Legend and category marker: a 9px rounded square, never a circle. */
export const dot = (color) => el('div', { class: 'dot', style: { background: color } });

/** A rounded track with a fill that grows from zero on first paint. */
export function bar(percent, color, thin = false) {
  const fill = el('div', { class: 'track__fill', style: { background: color } });
  setTarget(fill, Math.min(100, Math.max(0, percent)) + '%');
  return el('div', { class: 'track' + (thin ? ' track--thin' : '') }, [fill]);
}

/**
 * Rounded-square chip carrying either a type initial or a stroke icon. Tinted
 * by what it stands for - never an emoji, per design.md.
 */
export function glyphChip(glyph, tint) {
  return el('div', { class: 'chipglyph', style: { background: tint }, text: glyph });
}

export function iconChip(name, tint, size = 16) {
  return el('div', { class: 'chipglyph', style: { background: tint } }, [icon(name, size)]);
}

/**
 * The chip for an account row.
 *
 * Resolution order matters. What the user chose in the account editor wins
 * over the name-matching guess, so renaming "bKash" to "bKash personal" keeps
 * its logo, and an account that simply happens to contain the word "visa"
 * stops being branded once someone says otherwise. The regex is now the
 * fallback for accounts nobody has edited, not the mechanism.
 */
export function accountChip(account, size = 36) {
  if (account.icon && hasIcon(account.icon)) {
    return iconChip(account.icon, account.color || accountTint(account.type), Math.round(size * 0.45));
  }
  const key = account.brand || brandKey(account.name);
  if (key) return brandChip(key, size);

  // Last resort is the icon for the account's kind, not its initial. An
  // upgraded database has no icons - the migration adds the column but cannot
  // invent values - and a wallet glyph says more than the letter C.
  const byType = TYPE_ICON[account.type];
  if (byType) {
    return iconChip(byType, account.color || accountTint(account.type), Math.round(size * 0.45));
  }
  return glyphChip(
    account.name.slice(0, 1).toUpperCase(),
    account.color || accountTint(account.type)
  );
}

const TYPE_ICON = {
  cash: 'wallet', bank: 'landmark', mfs: 'smartphone', card: 'credit-card'
};

/**
 * The chip for a category: its icon on its own colour, softened so the stroke
 * still reads. Falls back to the initial for categories with no icon set.
 */
export function categoryChip(category, size = 36) {
  if (!category) return glyphChip('?', 'var(--soft)');
  if (category.icon && hasIcon(category.icon)) {
    return el('div', {
      class: 'chipglyph chipglyph--cat',
      style: { background: category.color, color: 'var(--onCat)' }
    }, [icon(category.icon, Math.round(size * 0.45))]);
  }
  return glyphChip(category.name.slice(0, 1).toUpperCase(), category.color || 'var(--soft)');
}

/** Chip tint for an account, by what kind of account it is. */
export function accountTint(type) {
  if (type === 'card') return 'var(--dangerSoft)';
  if (type === 'mfs') return 'var(--accentSoft)';
  return 'var(--soft)';
}

/** Sparkline points normalised into the 52x20 box the row reserves. */
export function sparkPoints(values, w = 52, h = 20, pad = 2.5) {
  if (!values.length) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;

  return values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    // A flat account has no span to normalise against, so it sits on the axis.
    const y = span === 0 ? h / 2 : h - pad - ((v - min) / span) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
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
  const items = store.itemsFor(t.id);

  const meta = [
    category && category.name,
    account && account.name,
    dayName(t.date),
    items.length ? items.length + ' items' : null
  ].filter(Boolean).join(' · ');

  return el('div', {
    class: 'row tappable',
    onClick: () => store.editTxn(t)
  }, [
    categoryChip(category),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__titlerow' }, [
        el('div', { class: 'row__title ellip', text: t.note }),
        t.source === 'sms'
          ? el('div', { class: 'tag-sms' }, [icon('message', 9, { weight: 2.4 }), 'SMS'])
          : null
      ].filter(Boolean)),
      el('div', { class: 'row__meta ellip', text: meta })
    ]),
    el('div', { class: 'row__right' }, [
      el('div', {
        class: 'row__amt' + (isIncome ? ' row__amt--pos' : ''),
        text: (isIncome ? '+' : MINUS) + fmt(t.amount, t.currency)
      }),
      isFx
        ? el('div', {
            class: 'row__sub',
            text: '= ' + fmt(store.conv(t), account.currency) + ' @ ' + t.rate
          })
        : null
    ].filter(Boolean))
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

/** Pill filter chip. Active is an ink fill, not lime - lime is for actions. */
export function chip(label, active, onClick, lead) {
  if (!lead) {
    return el('div', {
      class: 'chip tappable' + (active ? ' chip--on' : ''),
      text: label,
      onClick
    });
  }
  return el('div', {
    class: 'chip chip--lead tappable' + (active ? ' chip--on' : ''),
    onClick
  }, [lead, el('span', { text: label })]);
}

/** Underlined tab, as used by Budgets/Goals and the Reports strip. */
export function tab(label, active, onClick) {
  return el('div', {
    class: 'tab tappable' + (active ? ' tab--on' : ''),
    text: label,
    onClick
  });
}

export function toggle(on, onClick) {
  return el('div', { class: 'switch' + (on ? ' switch--on' : ''), onClick }, [
    el('div', { class: 'switch__knob' })
  ]);
}

/* ---------------- section headers ---------------- */

// v4 section header: an uppercase label, a hairline filling the gap, and an
// optional count or link on the right. It is what replaced the card border.

export function section(label, trailing) {
  return el('div', { class: 'section' }, [
    el('div', { class: 'section__label', text: label }),
    el('div', { class: 'section__fill' }),
    trailing || null
  ].filter(Boolean));
}

export function sectionMeta(text) {
  return el('div', { class: 'section__meta', text });
}

export function sectionLink(text, onClick) {
  return el('div', { class: 'section__link tappable', onClick }, [
    el('div', { class: 'section__linktext', text }),
    icon('chevronRight', 13, { weight: 2 })
  ]);
}

/** Standalone label with no rule, used where rows follow immediately. */
export function fieldLabel(text) {
  return el('div', { class: 'fieldlabel', text });
}
