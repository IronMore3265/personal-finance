// Add / edit transaction sheet. Amount first, then account, category, the line
// items if a bill needs breaking up, and the two small fields.
//
// The sheet reveals itself as it is filled in: no account is preselected, the
// category grid only appears once one is, and it folds back to the single
// chosen chip afterwards. The keypad is up only while a number is being
// entered, and the date opens the app's own wheel rather than the platform
// dialog - both are panels over the sheet, dismissed by a Done bar.
//
// The same sheet edits an existing transaction: `ui.entryId` set means edit
// mode, which adds a title row with a delete affordance and changes the verb
// on the save button.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import * as calc from '../core/calc.js';
import { chip, fieldLabel } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { openDatePicker, dateLabel } from '../ui/datepicker.js';
import { keypad, panelHead } from '../ui/keypad.js';
import { accountPicker, categoryPicker } from './pickers.js';
import { SYM } from '../data/seed.js';
import {
  CHIPROW_FLUSH, TAP, MINILABEL, SHEET, SHEET_HEAD, SHEET_BODY, SHEET_FOOT, SAVEBTN
} from '../ui/styles.js';

const ITEMHEAD = 'flex items-center justify-between mb-2';
const ITEMADD = 'flex items-center gap-[5px] py-[7px] px-[11px] rounded-pill '
  + 'bg-soft text-ink font-ui font-semibold text-[11px] normal-nums';
const ITEMROW = 'flex items-center gap-2.5 py-[9px] border-t border-line';
// The row the keypad is driving carries a lime edge and shifts in to meet it.
const ITEMROW_ON = 'shadow-[inset_3px_0_0_-1px_var(--accent)] pl-2';
const ITEMROW_AMT = 'flex-none min-w-[62px] text-right font-ui font-bold '
  + 'text-[13.5px] text-ink normal-nums';

/**
 * Text on the save button. Exported because the shell patches this node
 * directly on every keypress rather than rebuilding the sheet, and the two
 * have to agree - otherwise a keypad tap would quietly restyle the button.
 */
export function saveButtonLabel(total) {
  return (store.ui.entryId ? 'Update ' : 'Save ')
    + (store.ui.entryType === 'income' ? 'income' : 'expense')
    + (total ? ' · ' + fmt(total, store.ui.entryCurrency) : '');
}

/**
 * Put the panels away alongside whatever else a tap changes.
 *
 * Touching an account, a category or the date means the user has moved on
 * from the number, so the keys go down with the same set() rather than
 * needing a second one.
 */
const closePanels = (patch) => ({
  keypadOpen: false,
  entryFocusItem: null,
  ...patch
});

function typeTabs() {
  const seg = (id, label, onClick) => el('div', {
    class: 'flex-1 text-center py-[11px] px-1 rounded-pill font-ui font-semibold '
      + 'text-[12.5px] normal-nums ' + TAP
      + (store.ui.entryType === id ? ' bg-ink text-bg' : ' bg-transparent text-ink3'),
    text: label,
    onClick
  });

  // Switching type drops the category rather than guessing a new one: the
  // previous choice is the wrong side of the ledger, and the grid below is
  // about to re-offer the right ones anyway.
  return el('div', { class: 'flex bg-soft rounded-pill p-1' }, [
    seg('expense', 'Expense', () => store.set(closePanels({ entryType: 'expense', entryCat: null }))),
    seg('income', 'Income', () => store.set(closePanels({ entryType: 'income', entryCat: null }))),
    seg('transfer', 'Transfer', () => store.say('Transfers land in the next pass'))
  ]);
}

/** Edit mode gets a title and a delete button; a new entry needs neither. */
function editHead() {
  if (!store.ui.entryId) return null;
  const armed = store.ui.confirmDelete;

  return el('div', { class: 'flex items-center justify-between gap-3 mb-3' }, [
    el('div', {
      class: 'font-ui font-semibold text-[10px]/[1] text-ink3 uppercase '
        + 'tracking-[.12em] normal-nums',
      dataset: { testid: 'sheet-editlabel' },
      text: 'Editing transaction'
    }),
    el('div', {
      // No dialog primitive exists, and the app parses no HTML strings, so
      // the confirm is the button itself: one tap arms it, the second deletes.
      // Fixed width and a label in both states. Arming used to append the
      // word Confirm to a bare icon, so the button grew and the second tap
      // landed somewhere the first one had not been. Only the colour moves now.
      class: 'flex items-center justify-center gap-1.5 py-2 px-3 min-w-[104px] '
        + 'rounded-pill font-ui font-semibold text-[11.5px] normal-nums ' + TAP
        + (armed ? ' bg-danger text-white' : ' bg-soft text-ink2'),
      dataset: { testid: 'delbtn', armed: armed ? '1' : '0' },
      onClick: () => {
        if (armed) store.deleteTxn(store.ui.entryId);
        else store.set({ confirmDelete: true });
      }
    }, [icon('trash-2', 15), el('span', { text: armed ? 'Confirm' : 'Delete' })])
  ]);
}

function amountBlock() {
  // No account is picked when the sheet opens, so this is genuinely absent
  // until one is - and with no account there is no currency to convert to.
  const account = store.acct(store.ui.entryAccount);
  const needsRate = !!account && store.ui.entryCurrency !== account.currency;
  const { entryExpr, entryAmount, entryValue, entryItems } = store.ui;
  const derived = entryItems.length > 0;
  const total = store.entryTotal();
  const live = store.ui.keypadOpen && !store.ui.entryFocusItem;

  const children = [
    // The running expression, above the number it produces. Empty while a
    // single figure is being typed - there is no sum to show yet.
    el('div', {
      // Reserves its line box whether or not there is anything in it, so the
      // big figure does not jump the moment an operator is pressed.
      class: 'min-h-4 mb-1 font-ui font-medium text-[12.5px]/[16px] text-ink3 '
        + 'tracking-[.01em] normal-nums',
      dataset: { testid: 'amount-expr' },
      text: derived ? '' : calc.exprText(entryExpr, entryAmount)
    }),
    // Tapping the figure is what raises the keys. Line items own the number
    // once they exist, so it stops being directly typeable then.
    el('div', {
      class: 'flex items-baseline justify-center gap-2 pt-0.5 px-3 pb-1.5 '
        + 'rounded-box transition-shadow duration-[180ms] ease-linear '
        + (live
          ? 'shadow-[inset_0_-2px_0_0_var(--accent)]'
          : 'shadow-[inset_0_0_0_1.5px_transparent]')
        + (derived ? '' : ' ' + TAP),
      dataset: { testid: 'amount-row' },
      onClick: derived ? undefined : () => store.set({ keypadOpen: true, entryFocusItem: null })
    }, [
      el('div', {
        class: 'font-ui font-medium text-[17px]/[1] text-ink3 normal-nums',
        text: SYM[store.ui.entryCurrency]
      }),
      el('div', {
        class: 'font-ui font-extrabold text-[50px]/[1] text-ink tracking-[-.055em] normal-nums',
        dataset: { testid: 'amount-val' },
        text: derived
          ? total.toLocaleString('en-US')
          : calc.displayText(entryExpr, entryAmount, entryValue)
      })
    ]),
    derived
      ? el('div', {
        class: 'mt-3 font-ui font-medium text-[11px]/[1] text-ink3 normal-nums',
        dataset: { testid: 'amount-note' },
        text: 'Sum of ' + entryItems.length + ' items'
      })
      : el('div', { class: 'flex gap-1.5 justify-center mt-[14px]' },
        ['BDT', 'USD'].map(c =>
          chip(c, store.ui.entryCurrency === c, () => store.set({ entryCurrency: c }))
        ))
  ];

  // Only shown when the entry currency differs from that of the account.
  if (needsRate) {
    children.push(el('div', {
      class: 'flex items-center gap-3 text-left mt-4 py-3 border-t border-b border-line'
    }, [
      el('div', { class: 'flex-1 min-w-0' }, [
        el('div', { class: MINILABEL, text: 'Rate to ' + account.currency }),
        el('input', {
          id: 'rate-input',
          class: 'w-full bg-transparent border-none outline-none font-ui font-bold '
            + 'text-[17px] text-ink mt-2 p-0 normal-nums',
          inputmode: 'decimal',
          value: store.ui.entryRate,
          onInput: (e) => store.set({ entryRate: e.target.value }, true)
        })
      ]),
      el('div', { class: 'text-right flex-none' }, [
        el('div', { class: MINILABEL, text: 'Converted' }),
        el('div', {
          class: 'font-ui font-bold text-[16px]/[1] mt-2 normal-nums '
            + (store.ui.entryType === 'income' ? 'text-pos' : 'text-danger'),
          text: fmt(total * parseFloat(store.ui.entryRate || '1'), account.currency)
        })
      ])
    ]));
  }

  return el('div', { class: 'text-center pt-[14px] pb-1' }, children);
}

/**
 * Line items.
 *
 * A restaurant bill is four things, not one number. While any item exists the
 * transaction amount is their sum and is no longer typed directly - the keypad
 * drives whichever row is selected instead, which is why the amount block goes
 * read-only above.
 */
function itemList() {
  const items = store.ui.entryItems;
  const focus = store.ui.entryFocusItem;

  const head = el('div', { class: ITEMHEAD }, [
    el('div', { class: MINILABEL, text: 'Items' }),
    el('div', {
      class: ITEMADD + ' ' + TAP,
      dataset: { testid: 'itemadd' },
      onClick: () => store.addItem()
    }, [icon('plus', 13, { weight: 2.2 }), el('span', { text: 'Add item' })])
  ]);

  if (!items.length) return el('div', { class: 'mt-[18px]' }, [head]);

  const rows = items.map(it => el('div', {
    class: ITEMROW + (focus === it.id ? ' ' + ITEMROW_ON : ''),
    dataset: { testid: 'itemrow', on: focus === it.id ? '1' : '0' }
  }, [
    el('input', {
      id: 'item-label-' + it.id,
      class: 'flex-1 min-w-0 bg-transparent border-none outline-none font-ui '
        + 'font-medium text-[13px] text-ink p-0 normal-nums placeholder:text-ink3',
      dataset: { testid: 'itemrow-label' },
      value: it.label,
      placeholder: 'Item',
      onInput: (e) => store.patchItem(it.id, { label: e.target.value }, true)
    }),
    el('div', {
      class: 'flex-none min-w-[30px] text-center py-1 px-[7px] rounded-pill '
        + 'bg-soft font-ui font-semibold text-[11px] text-ink2 normal-nums ' + TAP,
      text: '×' + it.qty,
      // Quantity is a tap-to-step counter rather than a text field: it is
      // nearly always a small number, and a stepper keeps the keyboard away.
      onClick: () => store.patchItem(it.id, { qty: it.qty >= 9 ? 1 : it.qty + 1 })
    }),
    el('div', {
      id: 'item-amt-' + it.id,
      class: ITEMROW_AMT + ' ' + TAP,
      text: (Number(it.amount) || 0).toLocaleString('en-US'),
      onClick: () => store.set({
        entryFocusItem: it.id,
        keypadOpen: true,
        dateOpen: false,
        entryAmount: it.amount ? calc.trim(it.amount) : '',
        entryExpr: [],
        entryValue: Number(it.amount) || 0
      })
    }),
    el('div', {
      class: 'flex-none text-ink3 flex items-center ' + TAP,
      onClick: () => store.removeItem(it.id)
    }, [icon('x', 13, { weight: 2.2 })])
  ]));

  return el('div', { class: 'mt-[18px]' }, [head, ...rows]);
}

/** Date: two quick chips, plus the app's own wheel for anything else. */
function dateRow() {
  const value = store.ui.entryDate || store.today;
  const today = store.today;
  const yesterday = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  })();

  return el('div', {
    class: 'mt-[18px] pt-3 border-t border-line',
    dataset: { testid: 'daterow' }
  }, [
    el('div', { class: MINILABEL, text: 'Date' }),
    el('div', { class: 'flex items-center gap-[7px] mt-[9px] flex-wrap' }, [
      chip('Today', value === today, () => store.set(closePanels({ entryDate: today }))),
      chip('Yesterday', value === yesterday, () => store.set(closePanels({ entryDate: yesterday }))),
      chip(
        dateLabel(value),
        value !== today && value !== yesterday,
        () => {
          store.set({ keypadOpen: false, entryFocusItem: null });
          openDatePicker(value, today, (next) => store.set({ entryDate: next }));
        },
        icon('calendar', 14)
      )
    ])
  ]);
}


export function renderAddSheet() {
  const total = store.entryTotal();
  const hasAccount = !!store.acct(store.ui.entryAccount);

  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    amountBlock(),

    fieldLabel('Account'),
    accountPicker({
      value: store.ui.entryAccount,
      group: store.ui.entryGroup,
      onPick: (id) => store.set(closePanels({ entryAccount: id, entryGroup: null })),
      onGroup: (type) => store.set(closePanels({ entryGroup: type }))
    }),

    // Nothing below the account exists until one is chosen. Thirteen category
    // chips on an empty draft is most of a screen spent on a decision that
    // cannot be made yet.
    hasAccount ? fieldLabel('Category') : null,
    hasAccount
      ? categoryPicker({
        value: store.ui.entryCat,
        open: store.ui.entryCatOpen,
        type: store.ui.entryType,
        onPick: (id) => store.set(closePanels({ entryCat: id, entryCatOpen: false })),
        onOpen: (open) => store.set(closePanels({ entryCatOpen: open }))
      })
      : null,

    hasAccount ? itemList() : null,

    hasAccount ? dateRow() : null,

    hasAccount
      ? el('div', {
        class: 'flex gap-5 mt-[18px] mb-1 py-3 border-t border-line'
      }, [
        el('div', { class: 'flex-1 min-w-0' }, [
          el('div', { class: MINILABEL, text: 'Note' }),
          el('input', {
            id: 'note-input',
            class: 'w-full bg-transparent border-none outline-none font-ui '
              + 'font-medium text-[13.5px] text-ink mt-[7px] p-0 normal-nums '
              + 'placeholder:text-ink3',
            value: store.ui.entryNote,
            placeholder: 'optional',
            onFocus: () => store.set({ keypadOpen: false, dateOpen: false, entryFocusItem: null }),
            onInput: (e) => store.set({ entryNote: e.target.value }, true)
          })
        ])
      ])
      : null
  ].filter(Boolean));

  const savebtn = el('div', {
    class: SAVEBTN + ' ' + TAP
      + (total ? ' bg-accent text-accent-ink' : ' bg-soft text-ink3'),
    dataset: { testid: 'savebtn', ready: total ? '1' : '0' },
    text: saveButtonLabel(total),
    onClick: () => store.saveEntry()
  });

  let foot;
  if (store.ui.keypadOpen) {
    foot = el('div', {
      class: SHEET_FOOT + ' bg-surface border-t border-line',
      dataset: { testid: 'sheet-foot', foot: 'keys' }
    }, [
      panelHead(store.ui.entryFocusItem ? 'Item amount' : 'Amount',
        () => store.set({ keypadOpen: false, entryFocusItem: null })),
      keypad((k) => store.pressKey(k)),
      savebtn
    ]);
  } else {
    foot = el('div', { class: SHEET_FOOT }, [savebtn]);
  }

  return el('div', { class: SHEET + ' max-h-[96%]' }, [
    el('div', { class: SHEET_HEAD }, [editHead(), typeTabs()].filter(Boolean)),
    body,
    foot
  ]);
}
