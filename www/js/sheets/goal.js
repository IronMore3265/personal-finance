// Put an arbitrary amount into a goal.
//
// The two pills on the goal row cover the amounts you save most often; this is
// the rest of them. It moves the goal's counter and nothing else - a goal is a
// number you are aiming at, not an account, so contributing to one does not
// post a transaction or move a balance.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { fieldLabel } from '../ui/components.js';
import { keypad, panelHead, amountField } from '../ui/keypad.js';
import * as calc from '../core/calc.js';
import {
  TAP, SHEET, SHEET_BODY, SHEET_FOOT, SHEET_TITLE, SHEET_ICON, SHEET_LEDE, SAVEBTN
} from '../ui/styles.js';


export function renderGoalSheet() {
  const g = store.ui.goalAdd;
  if (!g) return el('div', { class: SHEET });

  const goal = store.db.goals.find(x => x.id === g.id);
  const live = store.ui.keypadOpen && store.ui.padTarget === 'goal';
  const left = goal ? Math.max(0, goal.target - goal.current) : 0;

  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    fieldLabel('Amount'),
    amountField(
      live ? calc.displayText(store.ui.entryExpr, store.ui.entryAmount, store.ui.entryValue)
        : (g.amount ? calc.trim(g.amount) : '0'),
      live ? calc.exprText(store.ui.entryExpr, store.ui.entryAmount) : '',
      live,
      () => store.openPad('goal', g.amount)
    ),
    el('div', {
      class: 'mt-2.5 font-ui font-normal text-[11px] text-ink3 normal-nums',
      dataset: { testid: 'goal-left' },
      // Saying what is left is the one number that makes this amount mean
      // something, and it is also the ceiling - the contribution is clamped
      // there, the same way the pills on the row are.
      text: fmt(left, store.homeCurrency) + ' still to go'
    })
  ]);

  const savebtn = el('div', {
    class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
    dataset: { testid: 'savebtn', ready: '1' },
    text: 'Add to goal',
    onClick: async () => {
      const amount = Number(store.ui.goalAdd.amount) || 0;
      if (!amount) { store.say('Enter an amount first'); return; }
      if (!goal) { store.set({ sheet: null, goalAdd: null }); return; }
      await store.addToGoal(goal, amount);
      store.set({ sheet: null, goalAdd: null, keypadOpen: false, padTarget: null });
    }
  });

  // Only the footer on screen is built: `savebtn` is a node, and appending it
  // to a second parent would move it out of the first.
  const foot = live
    ? el('div', {
      class: SHEET_FOOT + ' bg-surface border-t border-line',
      dataset: { testid: 'sheet-foot', foot: 'keys' }
    }, [
      panelHead('Amount', () => store.closePad()),
      keypad((k) => store.pressKey(k)),
      savebtn
    ])
    : el('div', { class: SHEET_FOOT }, [savebtn]);

  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: 'flex-none pt-[18px] px-[22px] pb-1 flex items-start gap-3' }, [
      el('div', { class: SHEET_ICON }, [icon('target', 18)]),
      el('div', {}, [
        el('div', { class: SHEET_TITLE, text: g.name }),
        el('div', { class: SHEET_LEDE, text: 'Moves the goal only - no account is touched.' })
      ])
    ]),
    body,
    foot
  ]);
}
