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
