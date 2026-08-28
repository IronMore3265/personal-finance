// Add-transaction sheet. Amount first, then account, category, and the two
// small fields. The numpad is pinned to the bottom so the save button never
// moves while you are typing.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import { chip, dot } from '../ui/components.js';
import { SYM } from '../data/seed.js';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

function typeTabs() {
  const tab = (id, label, onClick) => el('div', {
    class: 'seg__item tappable' + (store.ui.entryType === id ? ' seg__item--on' : ''),
    text: label,
    onClick
  });

  return el('div', { class: 'segpill' }, [
    tab('expense', 'Expense', () => store.set({ entryType: 'expense', entryCat: 'c1' })),
    tab('income', 'Income', () => store.set({ entryType: 'income', entryCat: 'i1' })),
    tab('transfer', 'Transfer', () => store.say('Transfers land in the next pass'))
  ]);
}

function amountBlock() {
  const account = store.acct(store.ui.entryAccount);
  const needsRate = store.ui.entryCurrency !== account.currency;
  const amount = parseFloat(store.ui.entryAmount || '0');

  const children = [
    el('div', { class: 'amount__row' }, [
      el('div', { class: 'amount__sym', text: SYM[store.ui.entryCurrency] }),
      el('div', { class: 'amount__val', text: store.ui.entryAmount || '0' })
    ]),
    el('div', { class: 'amount__chips' },
      ['BDT', 'USD'].map(c =>
        chip(c, store.ui.entryCurrency === c, () => store.set({ entryCurrency: c }))
      )
    )
  ];

  // Only shown when the entry currency differs from the account's own.
  if (needsRate) {
    children.push(el('div', { class: 'fxcard' }, [
      el('div', { class: 'fxcard__left' }, [
        el('div', { class: 'fxcard__k', text: 'Rate to ' + account.currency }),
        el('input', {
          id: 'rate-input',
          class: 'fxcard__input',
          inputmode: 'decimal',
          value: store.ui.entryRate,
          onInput: (e) => store.set({ entryRate: e.target.value })
        })
      ]),
      el('div', { class: 'fxcard__right' }, [
        el('div', { class: 'fxcard__k', text: 'Converted' }),
        el('div', {
          class: 'fxcard__out',
          text: fmt(amount * parseFloat(store.ui.entryRate || '1'), account.currency)
        })
      ])
    ]));
  }

  return el('div', { class: 'amount' }, children);
}

function categoryGrid() {
  const wanted = store.ui.entryType === 'income' ? 'income' : 'expense';
  return el('div', { class: 'catgrid' },
    store.db.categories.filter(c => c.type === wanted).map(c =>
      el('div', {
        class: 'catchip tappable' + (store.ui.entryCat === c.id ? ' catchip--on' : ''),
        onClick: () => store.set({ entryCat: c.id })
      }, [
        dot(c.color),
        el('div', { class: 'catchip__name ellip', text: c.name })
      ])
    )
  );
}

export function renderAddSheet() {
  const amount = parseFloat(store.ui.entryAmount || '0');

  const body = el('div', { class: 'sheet__body' }, [
    amountBlock(),

    el('div', { class: 'fieldlabel', text: 'Account' }),
    el('div', { class: 'chiprow', style: { marginBottom: '0' } },
      store.db.accounts.map(a =>
        chip(a.name, store.ui.entryAccount === a.id, () => store.set({ entryAccount: a.id }))
      )
    ),

    el('div', { class: 'fieldlabel', text: 'Category' }),
    categoryGrid(),

    el('div', { class: 'metarow' }, [
      el('div', { class: 'metacard metacard--date' }, [
        el('div', { class: 'metacard__k', text: 'Date' }),
        el('div', { class: 'metacard__v', text: 'Today' })
      ]),
      el('div', { class: 'metacard metacard--note' }, [
        el('div', { class: 'metacard__k', text: 'Note' }),
        el('input', {
          id: 'note-input',
          class: 'metacard__input',
          value: store.ui.entryNote,
          placeholder: 'optional',
          onInput: (e) => store.set({ entryNote: e.target.value }, true)
        })
      ])
    ])
  ]);

  const foot = el('div', { class: 'sheet__foot sheet__foot--keys' }, [
    el('div', { class: 'keypad' },
      KEYS.map(k => el('div', {
        class: 'keypad__key tappable',
        text: k === 'del' ? '⌫' : k,
        onClick: () => store.pressKey(k)
      }))
    ),
    el('div', {
      class: 'savebtn tappable' + (amount ? ' savebtn--ready' : ''),
      text: 'Save ' + (store.ui.entryType === 'income' ? 'income' : 'expense') +
        (amount ? ' · ' + fmt(amount, store.ui.entryCurrency) : ''),
      onClick: () => store.saveEntry()
    })
  ]);

  return el('div', { class: 'sheet sheet--add' }, [
    el('div', { class: 'sheet__head' }, [typeTabs()]),
    body,
    foot
  ]);
}
