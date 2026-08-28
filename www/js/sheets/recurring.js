// Editor for one scheduled expense.
//
// The two switches at the bottom are the whole design. `autoPost` says whether
// an occurrence files itself or waits for a tap on Home; `variable` says the
// amount is not known in advance, which overrides auto-posting - there is
// nothing sensible to post for an electricity bill until the meter is read.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { chip, fieldLabel, toggle, accountChip, categoryChip } from '../ui/components.js';
import { icon } from '../ui/icons.js';

const FREQS = ['weekly', 'monthly', 'quarterly', 'yearly'];

const patch = (p) => store.set({ editRecurring: { ...store.ui.editRecurring, ...p } });

function switchRow(label, hint, on, onClick, disabled) {
  return el('div', { class: 'switchrow' + (disabled ? ' switchrow--off' : '') }, [
    el('div', { class: 'switchrow__body' }, [
      el('div', { class: 'switchrow__label', text: label }),
      el('div', { class: 'switchrow__hint', text: hint })
    ]),
    toggle(on, disabled ? () => {} : onClick)
  ]);
}

export function renderRecurringSheet() {
  const r = store.ui.editRecurring;
  if (!r) return el('div', { class: 'sheet' });
  const armed = store.ui.confirmDelete;
  const expense = store.db.categories.filter(c => c.type === 'expense');

  const body = el('div', { class: 'sheet__body' }, [
    fieldLabel('Name'),
    el('input', {
      id: 'rec-name',
      class: 'entity__field',
      value: r.name,
      placeholder: 'Netflix, rent, gas…',
      onInput: (e) => { store.ui.editRecurring.name = e.target.value; }
    }),

    fieldLabel('Amount'),
    el('input', {
      id: 'rec-amount',
      class: 'entity__field entity__field--big',
      inputmode: 'decimal',
      value: String(r.amount || ''),
      placeholder: '0',
      onInput: (e) => { store.ui.editRecurring.amount = parseFloat(e.target.value || '0') || 0; }
    }),

    fieldLabel('Account'),
    el('div', { class: 'chiprow chiprow--flush' },
      store.db.accounts.map(a => chip(
        a.name, r.account === a.id, () => patch({ account: a.id }), accountChip(a, 18)
      ))
    ),

    fieldLabel('Category'),
    el('div', { class: 'chiprow chiprow--flush' },
      expense.map(c => chip(
        c.name, r.cat === c.id, () => patch({ cat: c.id }), categoryChip(c, 18)
      ))
    ),

    fieldLabel('Repeats'),
    el('div', { class: 'chiprow chiprow--flush' },
      FREQS.map(f => chip(
        f[0].toUpperCase() + f.slice(1), r.freq === f, () => patch({ freq: f })
      ))
    ),

    fieldLabel('Next due'),
    el('input', {
      id: 'rec-due',
      class: 'daterow__input',
      type: 'date',
      value: r.nextDue || r.due || store.today,
      onChange: (e) => patch({ nextDue: e.target.value, due: r.due || e.target.value })
    }),

    el('div', { class: 'switchlist' }, [
      switchRow(
        'Amount varies',
        'Asks you for the figure instead of using the one above',
        !!r.variable,
        () => patch({ variable: r.variable ? 0 : 1 })
      ),
      switchRow(
        'Post automatically',
        r.variable
          ? 'Not available while the amount varies'
          : 'Files itself when it falls due, even if the app was closed',
        !!r.autoPost && !r.variable,
        () => patch({ autoPost: r.autoPost ? 0 : 1 }),
        !!r.variable
      ),
      switchRow(
        'Active',
        'Turn off to keep the rule but stop it running',
        r.active !== 0,
        () => patch({ active: r.active === 0 ? 1 : 0 })
      )
    ])
  ]);

  const foot = el('div', { class: 'sheet__foot' }, [
    el('div', {
      class: 'savebtn savebtn--ready tappable',
      text: r.isNew ? 'Add scheduled expense' : 'Save',
      onClick: async () => {
        const row = { ...store.ui.editRecurring };
        if (!(row.name || '').trim()) { store.say('Give it a name first'); return; }
        if (!row.amount && !row.variable) { store.say('Enter an amount first'); return; }
        delete row.isNew;
        await store.saveRecurring(row);
        store.set({ sheet: null, editRecurring: null, confirmDelete: false });
        store.say(row.name + ' saved');
      }
    }),
    r.isNew
      ? null
      : el('div', {
        class: 'delbtn delbtn--wide tappable' + (armed ? ' delbtn--armed' : ''),
        text: armed ? 'Tap again to delete' : 'Delete',
        onClick: () => {
          if (!armed) { store.set({ confirmDelete: true }); return; }
          store.deleteRecurring(r.id);
          store.set({ sheet: null, editRecurring: null, confirmDelete: false });
        }
      })
  ].filter(Boolean));

  return el('div', { class: 'sheet sheet--entity' }, [
    el('div', { class: 'sheet__head sheet__head--sms' }, [
      el('div', { class: 'sheet__icon' }, [icon('repeat', 18)]),
      el('div', {}, [
        el('div', { class: 'sheet__title', text: r.isNew ? 'New scheduled expense' : r.name || 'Scheduled' })
      ])
    ]),
    body,
    foot
  ]);
}
