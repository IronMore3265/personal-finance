// Pieces used by more than one screen.
//
// v4 is de-carded: the sheet is white and rows sit directly on it, separated by
// a single hairline. So the shared unit is no longer a card - it is a row:
// glyph chip, title over meta, right-aligned number.

import { el } from '../core/dom.js';
import {
  ROW_TAP, ROW_BODY, ROW_TITLE, ROW_META, ROW_RIGHT, ROW_AMT, ROW_SUB, ELLIP, TAP, PRESS,
  MICROLABEL
} from './styles.js';
import { fmt, dayName, MINUS } from '../core/format.js';
import { setTarget } from '../core/motion.js';
import { store } from '../core/store.js';
import { icon, hasIcon } from './icons.js';
import { brandKey, brandChip } from './brands.js';

/* Recipes used only inside this module. */
// No colour here on purpose: two utilities setting the same property resolve
// by their order in the generated stylesheet, not by their order in the class
// string, so a variant cannot reliably override a base colour. Each variant
// states its own instead.
const CHIPGLYPH = 'flex-none w-9 h-9 rounded-chip flex items-center justify-center '
  + 'font-ui font-bold text-[13px] normal-nums';
const CHIP = 'flex-none py-2.5 px-[15px] rounded-pill font-ui font-semibold '
  + 'text-[12px] whitespace-nowrap normal-nums';
// No pl-7 here, deliberately. `.chip--lead { padding-left: 7px }` sat at
// app.css:303, ahead of `.chip { padding: 10px 15px }` at :475 - equal
// specificity, later rule wins - so the 7px never applied to anything. Adding
// it as a utility would win where the stylesheet lost, and quietly narrow every
// account and category chip by 8px.
const CHIP_LEAD = 'inline-flex items-center gap-2';
const TAB = 'flex-none pb-3 font-ui font-bold text-[11.5px] tracking-[.08em] '
  + 'uppercase border-b-2 normal-nums';
const TAG_SMS = 'flex items-center gap-[3px] flex-none font-ui font-bold '
  + 'text-[8.5px]/[1] tracking-[.08em] text-accent-ink bg-accent rounded-md py-1 px-[5px] normal-nums';

/** Legend and category marker: a 9px rounded square, never a circle. */
export const dot = (color) =>
  el('div', { class: 'flex-none w-[9px] h-[9px] rounded-[3px]', style: { background: color } });

/**
 * A rounded track with a fill that grows from zero on first paint.
 *
 * `extra` is how a caller adjusts the track for its context - the goal row
 * needs it to flex and lose its margins, the debt row needs a different one.
 * Those used to be descendant rules in the stylesheet (`.goal__foot .track`);
 * with the styling inline there is no ancestor left to hang them off, so the
 * context has to be passed in.
 */
export function bar(percent, color, thin = false, extra = '') {
  const fill = el('div', { class: 'trackfill', style: { background: color } });
  setTarget(fill, Math.min(100, Math.max(0, percent)) + '%');
  // A caller that supplies its own margin gets only that: `m-0` cannot beat
  // `mt-3` in the utility layer the way the old descendant rule beat
  // `.track--thin`, so the default has to not be emitted at all.
  const ownMargin = /(^|\s)-?m[trblxye]?-/.test(extra);
  return el('div', {
    class: 'rounded-pill overflow-hidden bg-soft '
      + (thin ? 'h-[5px]' : 'h-1.5')
      + (ownMargin ? '' : (thin ? ' mt-3 mb-0' : ' mt-4 mb-1'))
      + (extra ? ' ' + extra : '')
  }, [fill]);
}

/**
 * Rounded-square chip carrying either a type initial or a stroke icon. Tinted
 * by what it stands for - never an emoji, per design.md.
 */
export function glyphChip(glyph, tint, size = 36) {
  return el('div', {
    class: CHIPGLYPH + ' text-ink',
    dataset: { testid: 'chipglyph', chip: 'glyph' },
    style: { ...chipBox(size), background: tint },
    text: glyph
  });
}

/**
 * A stroke icon in a chip.
 *
 * The chip itself is monochrome - ink box, page-coloured glyph - so it inverts
 * with the theme on its own: black box and white stroke in light, the reverse
 * in dark. What the thing *is* shows as a ring in its own colour.
 *
 * The ring scales with the chip rather than sitting at a fixed 1.5px. At that
 * width it was close to invisible in dark mode, where the surrounding surface
 * is nearly as dark as the chip it was meant to separate - so a category was
 * only identifiable by its glyph.
 *
 * `size` is the box, not the glyph. It used to be the glyph while the box
 * stayed pinned at 36px in CSS, so `accountChip(a, 18)` drew an 8px mark
 * floating in a full-size chip.
 */
export function iconChip(name, tint, size = 36) {
  return el('div', {
    class: CHIPGLYPH + ' bg-ink text-bg',
    dataset: { testid: 'chipglyph', chip: 'mono' },
    style: { ...chipBox(size), boxShadow: '0 0 0 ' + ringWidth(size) + 'px ' + tint }
  }, [icon(name, glyphSize(size), { weight: 1.9 })]);
}

/** Ring thickness for a chip of `size`: 3px on a row chip, 2px on a pill. */
const ringWidth = (size) => Math.max(2, Math.round(size * 0.075));

/** Box geometry for a chip of `size`, so the corner stays proportional. */
function chipBox(size) {
  return {
    width: size + 'px',
    height: size + 'px',
    borderRadius: Math.round(size * 0.32) + 'px'
  };
}

const glyphSize = (size) => Math.round(size * 0.56);

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
    return iconChip(account.icon, account.color || accountTint(account.type), size);
  }
  const key = account.brand || brandKey(account.name);
  if (key) return brandChip(key, size);

  // Last resort is the icon for the account's kind, not its initial. An
  // upgraded database has no icons - the migration adds the column but cannot
  // invent values - and a wallet glyph says more than the letter C.
  const byType = TYPE_ICON[account.type];
  if (byType) {
    return iconChip(byType, account.color || accountTint(account.type), size);
  }
  return glyphChip(
    account.name.slice(0, 1).toUpperCase(),
    account.color || accountTint(account.type),
    size
  );
}

export const TYPE_ICON = {
  cash: 'wallet', bank: 'landmark', mfs: 'smartphone', card: 'credit-card'
};

/**
 * The chip for a category: monochrome like every other icon chip, ringed in
 * the category's own colour. Falls back to the initial when no icon is set.
 */
export function categoryChip(category, size = 36) {
  if (!category) return glyphChip('?', 'var(--soft)', size);
  if (category.icon && hasIcon(category.icon)) {
    return iconChip(category.icon, category.color || 'var(--soft)', size);
  }
  return glyphChip(category.name.slice(0, 1).toUpperCase(), category.color || 'var(--soft)', size);
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
 * One transaction.
 *
 * Direction is carried by the sign, not by colour: the amount is plain ink, so
 * it reads black in light and white in dark like every other number in a row.
 * Colouring each line green or red turned a day's list into a stripe of alarm
 * and made the one figure that is actually a verdict - the day's net, and the
 * period total above it - impossible to pick out. Those two keep the colour;
 * the lines that feed them no longer compete with it.
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
    class: ROW_TAP,
    dataset: { testid: 'row' },
    onClick: () => store.editTxn(t)
  }, [
    categoryChip(category),
    el('div', { class: ROW_BODY }, [
      el('div', { class: 'flex items-center gap-1.5 min-w-0' }, [
        el('div', { class: ROW_TITLE + ' ' + ELLIP, text: t.note }),
        t.source === 'sms'
          ? el('div', { class: TAG_SMS }, [icon('message', 9, { weight: 2.4 }), 'SMS'])
          : null
      ].filter(Boolean)),
      el('div', {
        class: ROW_META + ' ' + ELLIP,
        dataset: { testid: 'row-meta' },
        text: meta
      })
    ]),
    el('div', { class: ROW_RIGHT }, [
      el('div', {
        class: ROW_AMT,
        text: (isIncome ? '+' : MINUS) + fmt(t.amount, t.currency)
      }),
      isFx
        ? el('div', {
            class: ROW_SUB,
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
      class: CHIP + ' ' + TAP + (active ? ' bg-ink text-bg' : ' bg-soft text-ink2'),
      dataset: { testid: 'chip', on: active ? '1' : '0' },
      text: label,
      onClick
    });
  }
  return el('div', {
    class: CHIP + ' ' + CHIP_LEAD + ' ' + TAP
      + (active ? ' bg-ink text-bg' : ' bg-soft text-ink2'),
    dataset: { testid: 'chip', on: active ? '1' : '0' },
    onClick
  }, [lead, el('span', { text: label })]);
}

/** Underlined tab, as used by Budgets/Goals and the Reports strip. */
export function tab(label, active, onClick) {
  return el('div', {
    class: TAB + ' ' + TAP
      + (active ? ' text-ink border-b-ink' : ' text-ink3 border-b-transparent'),
    dataset: { testid: 'tab', on: active ? '1' : '0' },
    text: label,
    onClick
  });
}

/**
 * A switch.
 *
 * `small` is the inline variant: a 34x20 track sized to sit beside a 10px
 * micro-label rather than to anchor a settings row. It is the same control,
 * not a different one - both tracks keep the 2:1 ratio and the same colours.
 */
export function toggle(on, onClick, small = false) {
  const track = small
    ? 'w-[34px] h-5 p-0.5'
    : 'w-[50px] h-[30px] p-[3px]';
  const knob = small
    ? 'w-4 h-4' + (on ? ' translate-x-3.5' : ' translate-x-0')
    : 'w-6 h-6' + (on ? ' translate-x-5' : ' translate-x-0');

  return el('div', {
    class: 'flex-none rounded-pill flex items-center cursor-pointer '
      + track + ' ' + (on ? 'bg-accent' : 'bg-soft'),
    onClick
  }, [
    el('div', {
      // On the lime track the knob is accent-ink, not ink. Lime is the one
      // colour that does not flip between themes, so a knob painted in --ink
      // turns near-white on it in dark mode and all but disappears. Off the
      // lime, --ink is right and inverts with the track as it should.
      class: 'rounded-full transition-transform duration-[180ms] ease-move '
        + knob + ' ' + (on ? 'bg-accent-ink' : 'bg-ink')
    })
  ]);
}

/**
 * A micro-label with a small switch beside it, as one tappable unit.
 *
 * Wears the chip testid and data-on because it replaced a filter pill and is
 * still the same thing to a caller: a labelled on/off.
 */
export function toggleLabel(label, on, onClick) {
  return el('div', {
    class: 'inline-flex items-center gap-[9px] ' + PRESS,
    dataset: { testid: 'chip', on: on ? '1' : '0' },
    onClick
  }, [
    el('div', {
      class: 'font-ui font-bold text-[10px]/[1] tracking-[.14em] uppercase '
        + 'text-ink3 normal-nums',
      text: label
    }),
    toggle(on, null, true)
  ]);
}

/* ---------------- section headers ---------------- */

// v4 section header: an uppercase label, a hairline filling the gap, and an
// optional count or link on the right. It is what replaced the card border.

export function section(label, trailing) {
  return el('div', { class: 'flex items-center gap-2.5 mt-[26px] mb-1' }, [
    el('div', { class: MICROLABEL, text: label }),
    el('div', { class: 'flex-1 h-px bg-line' }),
    trailing || null
  ].filter(Boolean));
}

export function sectionMeta(text) {
  return el('div', {
    class: 'font-ui font-semibold text-[10px]/[1] text-ink3 uppercase '
      + 'tracking-[.1em] whitespace-nowrap normal-nums',
    text
  });
}

export function sectionLink(text, onClick) {
  return el('div', {
    class: 'flex items-center gap-[5px] text-ink flex-none ' + TAP,
    onClick
  }, [
    el('div', {
      class: 'font-ui font-bold text-[10px]/[1] uppercase tracking-[.1em] normal-nums',
      text
    }),
    icon('chevronRight', 13, { weight: 2 })
  ]);
}

/** Standalone label with no rule, used where rows follow immediately. */
export function fieldLabel(text) {
  return el('div', { class: MICROLABEL + ' mt-[22px] mb-2', text });
}
