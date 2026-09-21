// Shared numeric keypad with arithmetic operators.

import { el } from '../core/dom.js';
import * as calc from '../core/calc.js';
import { icon } from './icons.js';
import { TAP } from './styles.js';

const KEY = 'flex items-center justify-center text-center py-[14px] rounded-key '
  + 'font-ui font-bold text-[20px] select-none normal-nums';

const KEY_ROWS = [
  ['1', '2', '3', calc.DIV],
  ['4', '5', '6', calc.MUL],
  ['7', '8', '9', calc.SUB],
  ['.', '0', 'del', calc.ADD]
];

const KEY_ICON = {
  [calc.DIV]: 'divide',
  [calc.MUL]: 'x',
  [calc.SUB]: 'minus',
  [calc.ADD]: 'plus',
  del: 'delete'
};

export function keypad(onKey) {
  return el('div', {
    class: 'grid grid-cols-[repeat(3,1fr)_0.72fr] gap-1.5',
    dataset: { testid: 'keypad' }
  },
    KEY_ROWS.flat().map(k => {
      const glyph = KEY_ICON[k];
      return el('div', {
        class: KEY + ' ' + TAP + (calc.OPS.includes(k)
          ? ' bg-transparent shadow-[inset_0_0_0_1px_var(--line)] text-ink'
          : k === 'del'
            ? ' bg-danger-soft text-danger'
            : ' bg-soft text-ink'),
        dataset: { key: k, testid: 'keypad-key' },
        text: glyph ? undefined : k,
        onClick: () => onKey(k),
        onContextMenu: k === 'del'
          ? (e) => { e.preventDefault(); onKey('clear'); }
          : undefined
      }, glyph ? [icon(glyph, 20, { weight: 2.2 })] : []);
    })
  );
}

/**
 * The tappable amount, for a sheet that borrows the keypad.
 *
 * Field-sized rather than the add sheet's 50px hero: on those sheets the amount
 * is one row among several under its own fieldLabel, and this stands in the
 * slot an <input> used to occupy, so the rest of the layout is undisturbed. It
 * keeps the add sheet's two testids and its lime under-edge, so `patchAmount()`
 * in the shell reaches it without knowing which sheet it is in.
 *
 * @param {string} text  the figure to show, already formatted
 * @param {string} expr  the running expression, '' when there is nothing to show
 * @param {boolean} live whether the keys are up and driving this field
 * @param {() => void} onTap
 */
export function amountField(text, expr, live, onTap) {
  return el('div', {
    class: 'w-full bg-soft rounded-box py-3 px-[13px] '
      + 'transition-shadow duration-[180ms] ease-linear '
      + (live
        ? 'shadow-[inset_0_0_0_1.5px_var(--accent)]'
        : 'shadow-[inset_0_0_0_1.5px_transparent]')
      + ' ' + TAP,
    dataset: { testid: 'amount-row', pad: 'open' },
    onClick: onTap
  }, [
    // Reserves its line box whether or not there is anything in it, so the
    // figure below does not jump the moment an operator is pressed.
    el('div', {
      class: 'min-h-4 font-ui font-medium text-[11.5px]/[16px] text-ink3 '
        + 'tracking-[.01em] normal-nums',
      dataset: { testid: 'amount-expr' },
      text: expr
    }),
    el('div', {
      class: 'font-ui font-bold text-[20px]/[1.2] text-ink normal-nums',
      dataset: { testid: 'amount-val' },
      text
    })
  ]);
}

export function panelHead(label, onDone) {
  return el('div', { class: 'flex items-center justify-between pt-0 px-0.5 pb-2.5' }, [
    el('div', {
      class: 'font-ui font-semibold text-[10px] tracking-[.12em] uppercase '
        + 'text-ink3 normal-nums',
      text: label
    }),
    el('div', {
      class: 'py-[7px] px-[15px] rounded-pill bg-soft text-ink font-ui font-bold '
        + 'text-[11.5px] tracking-[.04em] normal-nums ' + TAP,
      dataset: { testid: 'panelhead-done' },
      text: 'Done',
      onClick: onDone
    })
  ]);
}
