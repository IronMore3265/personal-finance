// Editor for one scheduled expense.
//
// The two switches at the bottom are the whole design. `autoPost` says whether
// an occurrence files itself or waits for a tap on Home; `variable` says the
// amount is not known in advance, which overrides auto-posting - there is
// nothing sensible to post for an electricity bill until the meter is read.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { chip, fieldLabel, toggle } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { datePicker, dateLabel } from '../ui/datepicker.js';
import { accountPicker, categoryPicker } from './pickers.js';
import {
  CHIPROW_FLUSH, TAP, SHEET, SHEET_BODY, SHEET_FOOT, SHEET_TITLE,
  SHEET_ICON, SAVEBTN, DELBTN_WIDE, FIELD, SWITCHROW, SWITCHROW_LABEL, SWITCHROW_HINT
} from '../ui/styles.js';

const FREQS = ['weekly', 'monthly', 'quarterly', 'yearly'];

const patch = (p) => store.set({ editRecurring: { ...store.ui.editRecurring, ...p } });

function switchRow(label, hint, on, onClick, disabled) {
  // Not available, rather than hidden - the reason is in the hint text.
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
    el('input', {
      id: 'rec-amount',
      class: FIELD + ' font-bold text-[20px]',
      inputmode: 'decimal',
      value: String(r.amount || ''),
      placeholder: '0',
      onInput: (e) => { store.ui.editRecurring.amount = parseFloat(e.target.value || '0') || 0; }
    }),

    // The same grouped account row and folding category grid the add sheet
    // uses. This screen had a flat strip of all nine accounts and all thirteen
    // categories, which put the card accounts off the right edge and spent
    // most of the sheet on a choice already made.
    fieldLabel('Account'),
    accountPicker({
      value: r.account,
      group: store.ui.recGroup,
      onPick: (id) => { store.ui.editRecurring.account = id; store.set({ recGroup: null }); },
      onGroup: (type) => store.set({ recGroup: type })
    }),

    fieldLabel('Category'),
    categoryPicker({
      value: r.cat,
      open: store.ui.recCatOpen,
      type: 'expense',
      onPick: (id) => { store.ui.editRecurring.cat = id; store.set({ recCatOpen: false }); },
      onOpen: (open) => store.set({ recCatOpen: open })
    }),

    fieldLabel('Repeats'),
    el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } },
      FREQS.map(f => chip(
        f[0].toUpperCase() + f.slice(1), r.freq === f, () => patch({ freq: f })
      ))
    ),

    fieldLabel('Next due'),
    // A chip that opens the app's own calendar, not <input type="date"> - that
    // opened the platform's Material dialog, in the OS's colours and shape.
    el('div', { class: 'flex', dataset: { testid: 'daterow' } }, [
      chip(
        dateLabel(r.nextDue || r.due || store.today),
        true,
        () => store.set({ recDateOpen: true }),
        icon('calendar', 14)
      )
    ]),

    el('div', { class: 'mt-5' }, [
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

  if (store.ui.recDateOpen) {
    return sheetWith(r, body, el('div', {
      class: SHEET_FOOT,
      dataset: { testid: 'sheet-foot', foot: 'panel' }
    }, [
      panelHead('Next due', () => store.set({ recDateOpen: false })),
      // Silent: the picker owns which month it is showing.
      datePicker(r.nextDue || r.due || store.today, store.today,
        (next) => { patchSilently({ nextDue: next, due: r.due || next }); })
    ]));
  }

  const foot = el('div', { class: SHEET_FOOT }, [
    el('div', {
      class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
      dataset: { testid: 'savebtn', ready: '1' },
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
        class: DELBTN_WIDE + ' ' + TAP
          + (armed ? ' bg-danger text-white' : ' bg-soft text-ink2'),
        dataset: { testid: 'delbtn', armed: armed ? '1' : '0' },
        text: armed ? 'Tap again to delete' : 'Delete',
        onClick: () => {
          if (!armed) { store.set({ confirmDelete: true }); return; }
          store.deleteRecurring(r.id);
          store.set({ sheet: null, editRecurring: null, confirmDelete: false });
        }
      })
  ].filter(Boolean));

  return sheetWith(r, body, foot);
}

/** The sheet shell, shared by the normal footer and the date panel. */
function sheetWith(r, body, foot) {
  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: 'flex-none pt-[18px] px-[22px] pb-1 flex items-start gap-3' }, [
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

/** A Done bar over the date panel, matching the add sheet's. */
function panelHead(label, onDone) {
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

/** Write straight to the draft: a re-render would rebuild the open picker. */
function patchSilently(p) {
  Object.assign(store.ui.editRecurring, p);
}
