// Add / edit transaction sheet. Amount first, then account, category, the line
// items if a bill needs breaking up, and the two small fields. The keypad is
// pinned to the bottom so the save button never moves while you are typing.
//
// The same sheet edits an existing transaction: `ui.entryId` set means edit
// mode, which adds a title row with a delete affordance and changes the verb
// on the save button.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import * as calc from '../core/calc.js';
import { chip, dot, fieldLabel, accountChip, categoryChip } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { SYM } from '../data/seed.js';

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

// Digits in three columns with the operators down a fourth, so arithmetic is
// one reach away rather than a trip to another app.
const KEY_ROWS = [
  ['1', '2', '3', calc.DIV],
  ['4', '5', '6', calc.MUL],
  ['7', '8', '9', calc.SUB],
  ['.', '0', 'del', calc.ADD]
];

const GROUP_ICON = { cash: 'wallet', bank: 'landmark', mfs: 'smartphone', card: 'credit-card' };

function typeTabs() {
  const seg = (id, label, onClick) => el('div', {
    class: 'seg tappable' + (store.ui.entryType === id ? ' seg--on' : ''),
    text: label,
    onClick
  });

  return el('div', { class: 'segpill' }, [
    seg('expense', 'Expense', () => store.set({ entryType: 'expense', entryCat: 'c1' })),
    seg('income', 'Income', () => store.set({ entryType: 'income', entryCat: 'i1' })),
    seg('transfer', 'Transfer', () => store.say('Transfers land in the next pass'))
  ]);
}

/** Edit mode gets a title and a delete button; a new entry needs neither. */
function editHead() {
  if (!store.ui.entryId) return null;
  const armed = store.ui.confirmDelete;

  return el('div', { class: 'sheet__editrow' }, [
    el('div', { class: 'sheet__editlabel', text: 'Editing transaction' }),
    el('div', {
      // No dialog primitive exists, and the app parses no HTML strings, so
      // the confirm is the button itself: one tap arms it, the second deletes.
      class: 'delbtn tappable' + (armed ? ' delbtn--armed' : ''),
      onClick: () => {
        if (armed) store.deleteTxn(store.ui.entryId);
        else store.set({ confirmDelete: true });
      }
    }, [icon('trash-2', 15), armed ? el('span', { text: 'Confirm' }) : null].filter(Boolean))
  ]);
}

function amountBlock() {
  const account = store.acct(store.ui.entryAccount);
  const needsRate = store.ui.entryCurrency !== account.currency;
  const { entryExpr, entryAmount, entryValue, entryItems } = store.ui;
  const derived = entryItems.length > 0;
  const total = store.entryTotal();

  const children = [
    // The running expression, above the number it produces. Empty while a
    // single figure is being typed - there is no sum to show yet.
    el('div', {
      class: 'amount__expr',
      text: derived ? '' : calc.exprText(entryExpr, entryAmount)
    }),
    el('div', { class: 'amount__row' }, [
      el('div', { class: 'amount__sym', text: SYM[store.ui.entryCurrency] }),
      el('div', {
        class: 'amount__val',
        text: derived
          ? total.toLocaleString('en-US')
          : calc.displayText(entryExpr, entryAmount, entryValue)
      })
    ]),
    derived
      ? el('div', { class: 'amount__note', text: 'Sum of ' + entryItems.length + ' items' })
      : el('div', { class: 'amount__chips' },
        ['BDT', 'USD'].map(c =>
          chip(c, store.ui.entryCurrency === c, () => store.set({ entryCurrency: c }))
        ))
  ];

  // Only shown when the entry currency differs from that of the account.
  if (needsRate) {
    children.push(el('div', { class: 'fxrow' }, [
      el('div', { class: 'fxrow__left' }, [
        el('div', { class: 'minilabel', text: 'Rate to ' + account.currency }),
        el('input', {
          id: 'rate-input',
          class: 'fxrow__input',
          inputmode: 'decimal',
          value: store.ui.entryRate,
          onInput: (e) => store.set({ entryRate: e.target.value }, true)
        })
      ]),
      el('div', { class: 'fxrow__right' }, [
        el('div', { class: 'minilabel', text: 'Converted' }),
        el('div', {
          class: 'fxrow__out',
          text: fmt(total * parseFloat(store.ui.entryRate || '1'), account.currency)
        })
      ])
    ]));
  }

  return el('div', { class: 'amount' }, children);
}

/**
 * Accounts, grouped by kind.
 *
 * Nine accounts in one strip meant the card ones lived off the right edge.
 * Collapsed, this is one chip per group; tapping a group replaces the row with
 * that group's accounts, and picking one collapses it again - with the chosen
 * account's name and chip left showing on its group, so the selection is
 * readable without expanding anything.
 */
function accountRow() {
  const groups = store.accountGroups();
  const openType = store.ui.entryGroup;
  const selected = store.ui.entryAccount;

  if (openType) {
    const group = groups.find(g => g.type === openType);
    if (group) {
      return el('div', { class: 'chiprow chiprow--flush' }, [
        chip(
          group.label,
          true,
          () => store.set({ entryGroup: null }),
          icon(GROUP_ICON[group.type] || 'wallet', 15)
        ),
        ...group.accounts.map(a => chip(
          a.name,
          selected === a.id,
          () => store.set({ entryAccount: a.id, entryGroup: null }),
          accountChip(a, 18)
        ))
      ]);
    }
  }

  return el('div', { class: 'chiprow chiprow--flush' },
    groups.map(g => {
      const mine = g.accounts.find(a => a.id === selected);
      return chip(
        mine ? mine.name : g.label,
        !!mine,
        () => store.set({ entryGroup: g.type }),
        mine ? accountChip(mine, 18) : icon(GROUP_ICON[g.type] || 'wallet', 15)
      );
    })
  );
}

function categoryGrid() {
  const wanted = store.ui.entryType === 'income' ? 'income' : 'expense';
  return el('div', { class: 'catgrid' },
    store.db.categories.filter(c => c.type === wanted).map(c =>
      el('div', {
        class: 'catchip tappable' + (store.ui.entryCat === c.id ? ' catchip--on' : ''),
        onClick: () => store.set({ entryCat: c.id })
      }, [
        c.icon ? categoryChip(c, 22) : dot(c.color),
        el('div', { class: 'catchip__name ellip', text: c.name })
      ])
    )
  );
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

  const head = el('div', { class: 'itemhead' }, [
    el('div', { class: 'minilabel', text: 'Items' }),
    el('div', {
      class: 'itemadd tappable',
      onClick: () => store.addItem()
    }, [icon('plus', 13, { weight: 2.2 }), el('span', { text: 'Add item' })])
  ]);

  if (!items.length) return el('div', { class: 'itemlist' }, [head]);

  const rows = items.map(it => el('div', {
    class: 'itemrow' + (focus === it.id ? ' itemrow--on' : '')
  }, [
    el('input', {
      id: 'item-label-' + it.id,
      class: 'itemrow__label',
      value: it.label,
      placeholder: 'Item',
      onInput: (e) => store.patchItem(it.id, { label: e.target.value }, true)
    }),
    el('div', {
      class: 'itemrow__qty tappable',
      text: '×' + it.qty,
      // Quantity is a tap-to-step counter rather than a text field: it is
      // nearly always a small number, and a stepper keeps the keyboard away.
      onClick: () => store.patchItem(it.id, { qty: it.qty >= 9 ? 1 : it.qty + 1 })
    }),
    el('div', {
      id: 'item-amt-' + it.id,
      class: 'itemrow__amt tappable',
      text: (Number(it.amount) || 0).toLocaleString('en-US'),
      onClick: () => store.set({
        entryFocusItem: it.id,
        entryAmount: it.amount ? calc.trim(it.amount) : '',
        entryExpr: [],
        entryValue: Number(it.amount) || 0
      })
    }),
    el('div', {
      class: 'itemrow__del tappable',
      onClick: () => store.removeItem(it.id)
    }, [icon('x', 13, { weight: 2.2 })])
  ]));

  return el('div', { class: 'itemlist' }, [head, ...rows]);
}

/** Date: two quick chips, plus the platform's own picker for anything else. */
function dateRow() {
  const value = store.ui.entryDate || store.today;
  const today = store.today;
  const yesterday = (() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
  })();

  return el('div', { class: 'daterow' }, [
    el('div', { class: 'minilabel', text: 'Date' }),
    el('div', { class: 'daterow__controls' }, [
      chip('Today', value === today, () => store.set({ entryDate: today })),
      chip('Yesterday', value === yesterday, () => store.set({ entryDate: yesterday })),
      el('input', {
        id: 'date-input',
        class: 'daterow__input',
        type: 'date',
        value,
        onChange: (e) => store.set({ entryDate: e.target.value || today })
      })
    ])
  ]);
}

export function renderAddSheet() {
  const total = store.entryTotal();
  const editing = !!store.ui.entryId;
  const hasExpr = store.ui.entryExpr.length > 0;

  const body = el('div', { class: 'sheet__body' }, [
    amountBlock(),

    fieldLabel('Account'),
    accountRow(),

    fieldLabel('Category'),
    categoryGrid(),

    itemList(),

    dateRow(),

    el('div', { class: 'metarow' }, [
      el('div', { class: 'metarow__note' }, [
        el('div', { class: 'minilabel', text: 'Note' }),
        el('input', {
          id: 'note-input',
          class: 'metarow__input',
          value: store.ui.entryNote,
          placeholder: 'optional',
          onInput: (e) => store.set({ entryNote: e.target.value }, true)
        })
      ])
    ])
  ]);

  const keypad = el('div', { class: 'keypad' },
    KEY_ROWS.flat().map(k => el('div', {
      class: 'keypad__key tappable'
        + (calc.OPS.includes(k) ? ' keypad__key--op' : '')
        + (k === 'del' ? ' keypad__key--del' : ''),
      text: k === 'del' ? '⌫' : k,
      onClick: () => store.pressKey(k),
      // Holding delete clears the whole expression rather than tapping it
      // away one character at a time.
      onContextMenu: k === 'del'
        ? (e) => { e.preventDefault(); store.pressKey('clear'); }
        : undefined
    }))
  );

  const foot = el('div', { class: 'sheet__foot sheet__foot--keys' }, [
    keypad,
    // Only offered when there is actually a sum to fold; the amount line
    // already shows the running result, so an always-on "=" would be noise.
    hasExpr
      ? el('div', {
        class: 'equalsbtn tappable',
        text: '=',
        onClick: () => store.pressKey('=')
      })
      : null,
    el('div', {
      class: 'savebtn tappable' + (total ? ' savebtn--ready' : ''),
      text: saveButtonLabel(total),
      onClick: () => store.saveEntry()
    })
  ].filter(Boolean));

  return el('div', { class: 'sheet sheet--add' }, [
    el('div', { class: 'sheet__head' }, [editHead(), typeTabs()].filter(Boolean)),
    body,
    foot
  ]);
}
