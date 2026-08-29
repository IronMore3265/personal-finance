// Account list. Same shape as the category list: tap to edit, plus to add.
//
// Editing an account is also how a bank logo gets attached deliberately rather
// than by the name happening to match a regex - see accountChip in
// ui/components.js for the resolution order.
//
// TRIAL: this one screen is written in Tailwind utilities instead of the
// app's semantic classes, as the specimen for whether the other 35 files
// should follow. The rules it replaces (.row, .row__title, ...) are still in
// app.css because every other screen uses them.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { accountChip, section, sectionMeta } from '../ui/components.js';
import { TYPE_LABEL } from '../data/seed.js';

// .row, .tappable - and, like ROW_TAP in ui/styles.js, no `overflow-hidden`:
// it clipped the account chip's outset colour ring against the row's edge.
const ROW = 'flex items-center gap-3 py-[13px] border-b border-line relative '
  + 'cursor-pointer transition-transform duration-[180ms] '
  + 'ease-move active:scale-[.985]';

function row(a) {
  const used = store.db.txns.filter(t => t.account === a.id).length;
  return el('div', {
    class: ROW,
    dataset: { testid: 'row' },
    onClick: () => store.set({ sheet: 'entity', editEntity: { kind: 'account', ...a } })
  }, [
    accountChip(a),
    el('div', { class: 'flex-1 min-w-0' }, [
      el('div', {
        class: 'font-ui font-semibold text-[14.5px]/[1.2] text-ink min-w-0 normal-nums '
          + 'whitespace-nowrap overflow-hidden text-ellipsis',
        text: a.name
      }),
      el('div', {
        class: 'font-ui font-medium text-[11px]/[1] text-ink3 mt-1.5 tracking-[.01em] normal-nums',
        dataset: { testid: 'row-meta' },
        text: (TYPE_LABEL[a.type] || a.type) + ' · ' + a.currency
          + ' · ' + (used ? used + ' txns' : 'unused')
      })
    ]),
    el('div', { class: 'text-right flex-none' }, [
      el('div', {
        class: 'font-ui font-bold text-[14.5px]/[1] text-ink whitespace-nowrap normal-nums '
          + 'tracking-[-.01em]',
        text: fmt(store.balance(a.id), a.currency)
      })
    ])
  ]);
}

export function renderAccounts() {
  const groups = store.accountGroups();

  const out = [];
  for (const g of groups) {
    out.push(section(g.label, sectionMeta(g.accounts.length + '')));
    g.accounts.forEach(a => out.push(row(a)));
  }

  out.push(el('div', {
    class: ROW,
    dataset: { testid: 'row' },
    onClick: () => store.set({
      sheet: 'entity',
      editEntity: {
        kind: 'account',
        id: 'a' + Date.now(),
        name: '',
        type: 'bank',
        currency: 'BDT',
        initial: 0,
        icon: 'landmark',
        brand: null,
        isNew: true
      }
    })
  }, [
    el('div', {
      class: 'flex-none w-9 h-9 rounded-chip flex items-center justify-center '
        + 'font-ui font-bold text-[13px] bg-transparent shadow-[inset_0_0_0_1px_var(--line)] text-ink3'
    }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: 'flex-1 min-w-0' }, [
      el('div', {
        class: 'font-ui font-semibold text-[14.5px]/[1.2] text-ink min-w-0 normal-nums',
        text: 'New account'
      })
    ])
  ]));

  return out;
}
