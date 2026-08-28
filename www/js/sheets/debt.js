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

const patch = (p) => store.set({ editDebt: { ...store.ui.editDebt, ...p } });

function directionSeg(d) {
  const seg = (id, label) => el('div', {
    class: 'seg tappable' + (d.direction === id ? ' seg--on' : ''),
    text: label,
    onClick: () => patch({ direction: id })
  });
  return el('div', { class: 'segpill' }, [
    seg('owed_to_me', 'They owe me'),
    seg('i_owe', 'I owe them')
  ]);
}

/** Part-payment controls, once there is a debt to pay against. */
function settleBlock(d) {
  const outstanding = store.debtBalance(d);
  if (d.isNew || outstanding <= 0) return null;

  const quick = [500, 1000, 5000].filter(v => v <= outstanding);

  return el('div', { class: 'settle' }, [
    el('div', { class: 'settle__head' }, [
      el('div', { class: 'minilabel', text: 'Record a repayment' }),
      el('div', { class: 'settle__out', text: fmt(outstanding, d.currency) + ' left' })
    ]),
    el('div', { class: 'chiprow chiprow--flush' }, [
      ...quick.map(v => chip('+' + v.toLocaleString('en-US'), false,
        () => store.settleDebt(d, v, d.account))),
      chip('Settle in full', false, () => store.settleDebt(d, outstanding, d.account))
    ]),
    el('div', { class: 'settle__note', text: 'Posts a transaction on ' + (store.acct(d.account) || {}).name })
  ]);
}

export function renderDebtSheet() {
  const d = store.ui.editDebt;
  if (!d) return el('div', { class: 'sheet' });
  const armed = store.ui.confirmDelete;

  const body = el('div', { class: 'sheet__body' }, [
    directionSeg(d),

    fieldLabel('Person'),
    el('input', {
      id: 'debt-person',
      class: 'entity__field',
      value: d.person,
      placeholder: 'Who?',
      onInput: (e) => { store.ui.editDebt.person = e.target.value; }
    }),

    fieldLabel('Amount'),
    el('input', {
      id: 'debt-amount',
      class: 'entity__field entity__field--big',
      inputmode: 'decimal',
      value: String(d.principal || ''),
      placeholder: '0',
      onInput: (e) => { store.ui.editDebt.principal = parseFloat(e.target.value || '0') || 0; }
    }),

    fieldLabel('Account'),
    el('div', { class: 'chiprow chiprow--flush' },
      store.db.accounts.map(a => chip(
        a.name, d.account === a.id, () => patch({ account: a.id }), accountChip(a, 18)
      ))
    ),

    fieldLabel('Due date'),
    el('input', {
      id: 'debt-due',
      class: 'daterow__input',
      type: 'date',
      value: d.due || '',
      onChange: (e) => patch({ due: e.target.value })
    }),

    fieldLabel('Note'),
    el('input', {
      id: 'debt-note',
      class: 'entity__field',
      value: d.note || '',
      placeholder: 'optional',
      onInput: (e) => { store.ui.editDebt.note = e.target.value; }
    }),

    settleBlock(d)
  ].filter(Boolean));

  const foot = el('div', { class: 'sheet__foot' }, [
    el('div', {
      class: 'savebtn savebtn--ready tappable',
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
        class: 'delbtn delbtn--wide tappable' + (armed ? ' delbtn--armed' : ''),
        text: armed ? 'Tap again to delete' : 'Delete',
        onClick: () => {
          if (!armed) { store.set({ confirmDelete: true }); return; }
          store.deleteDebt(d.id);
          store.set({ sheet: null, editDebt: null, confirmDelete: false });
        }
      })
  ].filter(Boolean));

  return el('div', { class: 'sheet sheet--entity' }, [
    el('div', { class: 'sheet__head sheet__head--sms' }, [
      el('div', { class: 'sheet__icon' }, [icon('hand-coins', 18)]),
      el('div', {}, [
        el('div', { class: 'sheet__title', text: d.isNew ? 'New debt' : d.person || 'Debt' }),
        el('div', {
          class: 'sheet__lede',
          text: 'Stays out of your category reports - lending is not spending.'
        })
      ])
    ]),
    body,
    foot
  ]);
}
