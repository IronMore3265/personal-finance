// Editor for one scheduled expense.
//
// Progressive reveal: Name, Amount, and Account are always visible. Category,
// frequency, due date, and toggles appear only after an account is picked,
// mirroring the add-transaction sheet.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import * as calc from '../core/calc.js';
import { chip, fieldLabel, toggle } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { openDatePicker, dateLabel } from '../ui/datepicker.js';
import { keypad, panelHead } from '../ui/keypad.js';
import { accountPicker, categoryPicker } from './pickers.js';
import {
  CHIPROW_FLUSH, TAP, SHEET, SHEET_BODY, SHEET_FOOT, SHEET_TITLE,
  SHEET_ICON, SAVEBTN, DELBTN_WIDE, FIELD, SWITCHROW, SWITCHROW_LABEL, SWITCHROW_HINT
} from '../ui/styles.js';

const FREQS = ['weekly', 'monthly', 'quarterly', 'yearly'];

const patch = (p) => store.set({ editRecurring: { ...store.ui.editRecurring, ...p } });

function switchRow(label, hint, on, onClick, disabled) {
  return el('div', { class: SWITCHROW + (disabled ? ' opacity-45' : '') }, [
    el('div', { class: 'flex-1 min-w-0' }, [
      el('div', { class: SWITCHROW_LABEL, text: label }),
      el('div', { class: SWITCHROW_HINT, text: hint })
    ]),
    toggle(on, disabled ? () => {} : onClick)
  ]);
}

export function renderRecurringSheet() {
  const r = store.ui.editRecurring;
  if (!r) return el('div', { class: SHEET });
  const armed = store.ui.confirmDelete;
  const hasAccount = !!store.acct(r.account);
  const keypadUp = store.ui.recKeypadOpen;

  const recAmount = r.amount || 0;
  const amountText = recAmount ? recAmount.toLocaleString('en-US') : '0';

  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    fieldLabel('Name'),
    el('input', {
      id: 'rec-name',
      class: FIELD,
      value: r.name,
      placeholder: 'Netflix, rent, gas…',
      onInput: (e) => { store.ui.editRecurring.name = e.target.value; }
    }),

    fieldLabel('Amount'),
    el('div', {
      class: 'flex items-center gap-2.5 py-3 px-[13px] rounded-box bg-soft '
        + 'cursor-pointer transition-shadow duration-[180ms] ease-linear '
        + (keypadUp
          ? 'shadow-[inset_0_-2px_0_0_var(--accent)]'
          : 'shadow-[inset_0_0_0_1.5px_transparent]'),
      dataset: { testid: 'rec-amount-row' },
      onClick: () => store.set({ recKeypadOpen: true })
    }, [
      el('div', {
        class: 'font-ui font-medium text-[15px]/[1] text-ink3 normal-nums',
        text: '৳'
      }),
      el('div', {
        class: 'font-ui font-extrabold text-[28px]/[1] text-ink tracking-[-.04em] normal-nums',
        dataset: { testid: 'rec-amount-val' },
        text: amountText
      })
    ]),

    fieldLabel('Account'),
    accountPicker({
      value: r.account,
      group: store.ui.recGroup,
      onPick: (id) => {
        store.ui.editRecurring.account = id;
        store.set({ recGroup: null, recKeypadOpen: false });
      },
      onGroup: (type) => store.set({ recGroup: type })
    }),

    hasAccount ? fieldLabel('Category') : null,
    hasAccount
      ? categoryPicker({
        value: r.cat,
        open: store.ui.recCatOpen,
        type: 'expense',
        onPick: (id) => { store.ui.editRecurring.cat = id; store.set({ recCatOpen: false }); },
        onOpen: (open) => store.set({ recCatOpen: open })
      })
      : null,

    hasAccount ? fieldLabel('Repeats') : null,
    hasAccount
      ? el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } },
        FREQS.map(f => chip(
          f[0].toUpperCase() + f.slice(1), r.freq === f, () => patch({ freq: f })
        )))
      : null,

    hasAccount ? fieldLabel('Next due') : null,
    hasAccount
      ? el('div', { class: 'flex', dataset: { testid: 'daterow' } }, [
        chip(
          dateLabel(r.nextDue || r.due || store.today),
          true,
          () => {
            store.set({ recKeypadOpen: false });
            openDatePicker(
              r.nextDue || r.due || store.today,
              store.today,
              (next) => patch({ nextDue: next, due: r.due || next })
            );
          },
          icon('calendar', 14)
        )
      ])
      : null,

    hasAccount
      ? el('div', { class: 'mt-5' }, [
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
      : null
  ].filter(Boolean));

  const save = el('div', {
    class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
    dataset: { testid: 'savebtn', ready: '1' },
    text: r.isNew ? 'Add scheduled expense' : 'Save',
    onClick: async () => {
      const row = { ...store.ui.editRecurring };
      if (!(row.name || '').trim()) { store.say('Give it a name first'); return; }
      if (!row.amount && !row.variable) { store.say('Enter an amount first'); return; }
      delete row.isNew;
      await store.saveRecurring(row);
      store.set({ sheet: null, editRecurring: null, confirmDelete: false, recKeypadOpen: false });
      store.say(row.name + ' saved');
    }
  });

  const del = r.isNew
    ? null
    : el('div', {
      class: DELBTN_WIDE + ' ' + TAP
        + (armed ? ' bg-danger text-white' : ' bg-soft text-ink2'),
      dataset: { testid: 'delbtn', armed: armed ? '1' : '0' },
      text: armed ? 'Tap again to delete' : 'Delete',
      onClick: () => {
        if (!armed) { store.set({ confirmDelete: true }); return; }
        store.deleteRecurring(r.id);
        store.set({ sheet: null, editRecurring: null, confirmDelete: false, recKeypadOpen: false });
      }
    });

  let foot;
  if (keypadUp) {
    foot = el('div', {
      class: SHEET_FOOT + ' bg-surface border-t border-line',
      dataset: { testid: 'sheet-foot', foot: 'keys' }
    }, [
      panelHead('Amount', () => store.set({ recKeypadOpen: false })),
      keypad((k) => {
        if (k === 'clear') { patch({ amount: 0 }); return; }
        if (k === 'del') {
          const s = String(r.amount || '');
          patch({ amount: parseFloat(s.slice(0, -1)) || 0 });
          return;
        }
        if (calc.OPS.includes(k)) return;
        const cur = r.amount ? String(r.amount) : '';
        patch({ amount: parseFloat(cur + k) || 0 });
      }),
      save, del
    ].filter(Boolean));
  } else {
    foot = el('div', { class: SHEET_FOOT }, [save, del].filter(Boolean));
  }

  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: 'flex-none pt-[18px] px-[18px] pb-1 flex items-start gap-3' }, [
      el('div', { class: SHEET_ICON }, [icon('repeat', 18)]),
      el('div', {}, [
        el('div', {
          class: SHEET_TITLE,
          text: r.isNew ? 'New scheduled expense' : r.name || 'Scheduled'
        })
      ])
    ]),
    body,
    foot
  ]);
}
