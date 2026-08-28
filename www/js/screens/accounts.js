// Account list. Same shape as the category list: tap to edit, plus to add.
//
// Editing an account is also how a bank logo gets attached deliberately rather
// than by the name happening to match a regex - see accountChip in
// ui/components.js for the resolution order.

import { el } from '../core/dom.js';
import { fmt } from '../core/format.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { accountChip, section, sectionMeta } from '../ui/components.js';
import { TYPE_LABEL } from '../data/seed.js';

function row(a) {
  const used = store.db.txns.filter(t => t.account === a.id).length;
  return el('div', {
    class: 'row tappable',
    onClick: () => store.set({ sheet: 'entity', editEntity: { kind: 'account', ...a } })
  }, [
    accountChip(a),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title ellip', text: a.name }),
      el('div', {
        class: 'row__meta',
        text: (TYPE_LABEL[a.type] || a.type) + ' · ' + a.currency
          + ' · ' + (used ? used + ' txns' : 'unused')
      })
    ]),
    el('div', { class: 'row__right' }, [
      el('div', { class: 'row__amt', text: fmt(store.balance(a.id), a.currency) })
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
    class: 'row tappable',
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
    el('div', { class: 'chipglyph chipglyph--ghost' }, [icon('plus', 16, { weight: 2.2 })]),
    el('div', { class: 'row__body' }, [
      el('div', { class: 'row__title', text: 'New account' })
    ])
  ]));

  return out;
}
