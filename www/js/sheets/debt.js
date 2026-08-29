// Record a debt, or take a payment against one.
//
// Two jobs in one sheet because they are the same object at two moments: the
// top half is the debt itself, and the bottom half - only there once the debt
// exists - is "some of it just came back".

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import { chip, fieldLabel, accountChip } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { openDatePicker, dateLabel } from '../ui/datepicker.js';
import {
  CHIPROW_FLUSH, TAP, SHEET, SHEET_BODY, SHEET_FOOT, SHEET_TITLE,
  SHEET_ICON, SHEET_LEDE, SAVEBTN, DELBTN_WIDE, FIELD, MINILABEL
} from '../ui/styles.js';

const patch = (p) => store.set({ editDebt: { ...store.ui.editDebt, ...p } });

function directionSeg(d) {
  const seg = (id, label) => el('div', {
    class: 'flex-1 text-center py-[11px] px-1 rounded-pill font-ui font-semibold '
          + 'text-[12.5px] normal-nums ' + TAP
        + (d.direction === id ? ' bg-ink text-bg' : ' bg-transparent text-ink3'),
    text: label,
    onClick: () => patch({ direction: id })
  });
  return el('div', { class: 'flex bg-soft rounded-pill p-1' }, [
    seg('owed_to_me', 'They owe me'),
    seg('i_owe', 'I owe them')
  ]);
}

/** Part-payment controls, once there is a debt to pay against. */
function settleBlock(d) {
  const outstanding = store.debtBalance(d);
  if (d.isNew || outstanding <= 0) return null;

  const quick = [500, 1000, 5000].filter(v => v <= outstanding);

  return el('div', { class: 'mt-[22px] pt-[14px] pb-1 border-t border-line' }, [
    el('div', { class: 'flex items-baseline justify-between mb-2.5' }, [
      el('div', { class: MINILABEL, text: 'Record a repayment' }),
      el('div', {
        class: 'font-ui font-bold text-[13px] text-ink normal-nums',
        text: fmt(outstanding, d.currency) + ' left'
      })
    ]),
    el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } }, [
      ...quick.map(v => chip('+' + v.toLocaleString('en-US'), false,
        () => store.settleDebt(d, v, d.account))),
      chip('Settle in full', false, () => store.settleDebt(d, outstanding, d.account))
    ]),
    el('div', {
      class: 'mt-2.5 font-ui font-normal text-[11px] text-ink3 normal-nums',
      text: 'Posts a transaction on ' + (store.acct(d.account) || {}).name
    })
  ]);
}

export function renderDebtSheet() {
  const d = store.ui.editDebt;
  if (!d) return el('div', { class: SHEET });
  const armed = store.ui.confirmDelete;

  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    directionSeg(d),

    fieldLabel('Person'),
    el('input', {
      id: 'debt-person',
      class: FIELD,
      value: d.person,
      placeholder: 'Who?',
      onInput: (e) => { store.ui.editDebt.person = e.target.value; }
    }),

    fieldLabel('Amount'),
    el('input', {
      id: 'debt-amount',
      class: FIELD + ' font-bold text-[20px]',
      inputmode: 'decimal',
      value: String(d.principal || ''),
      placeholder: '0',
      onInput: (e) => { store.ui.editDebt.principal = parseFloat(e.target.value || '0') || 0; }
    }),

    fieldLabel('Account'),
    el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } },
      store.db.accounts.map(a => chip(
        a.name, d.account === a.id, () => patch({ account: a.id }), accountChip(a, 18)
      ))
    ),

    fieldLabel('Due date'),
    // The app's own calendar rather than <input type="date">, which opened the
    // platform's Material dialog in the OS's colours instead of this app's.
    el('div', { class: 'flex gap-1.5 flex-wrap', dataset: { testid: 'daterow' } }, [
      chip(
        d.due ? dateLabel(d.due) : 'No due date',
        !!d.due,
        () => openDatePicker(
          d.due || store.today, store.today,
          (next) => patch({ due: next })
        ),
        icon('calendar', 14)
      ),
      d.due ? chip('Clear', false, () => patch({ due: '' })) : null
    ].filter(Boolean)),

    fieldLabel('Note'),
    el('input', {
      id: 'debt-note',
      class: FIELD,
      value: d.note || '',
      placeholder: 'optional',
      onInput: (e) => { store.ui.editDebt.note = e.target.value; }
    }),

    settleBlock(d)
  ].filter(Boolean));

  const foot = el('div', { class: SHEET_FOOT }, [
    el('div', {
      class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
      dataset: { testid: 'savebtn', ready: '1' },
      text: d.isNew ? 'Record debt' : 'Save',
      onClick: async () => {
        const row = { ...store.ui.editDebt };
        if (!(row.person || '').trim()) { store.say('Who is it with?'); return; }
        if (!row.principal) { store.say('Enter an amount first'); return; }
        delete row.isNew;
        await store.saveDebt(row);
        store.set({ sheet: null, editDebt: null, confirmDelete: false });
        store.say('Debt saved');
      }
    }),
    d.isNew
      ? null
      : el('div', {
        class: DELBTN_WIDE + ' ' + TAP
          + (armed ? ' bg-danger text-white' : ' bg-soft text-ink2'),
        dataset: { testid: 'delbtn', armed: armed ? '1' : '0' },
        text: armed ? 'Tap again to delete' : 'Delete',
        onClick: () => {
          if (!armed) { store.set({ confirmDelete: true }); return; }
          store.deleteDebt(d.id);
          store.set({ sheet: null, editDebt: null, confirmDelete: false });
        }
      })
  ].filter(Boolean));

  return sheetShell(d, body, foot);
}

function sheetShell(d, body, foot) {
  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: 'flex-none pt-[18px] px-[18px] pb-1 flex items-start gap-3' }, [
      el('div', { class: SHEET_ICON }, [icon('hand-coins', 18)]),
      el('div', {}, [
        el('div', { class: SHEET_TITLE, text: d.isNew ? 'New debt' : d.person || 'Debt' }),
        el('div', {
          class: SHEET_LEDE,
          text: 'Stays out of your category reports - lending is not spending.'
        })
      ])
    ]),
    body,
    foot
  ]);
}
