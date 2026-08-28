// One editor for both categories and accounts.
//
// They differ in three fields and share everything else - a name, a colour, an
// icon and a live preview of the chip the rest of the app will draw - so this
// is one sheet with two shapes rather than two nearly identical files.
//
// Driven by ui.editEntity: { kind: 'category' | 'account', ...the row }.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { chip, fieldLabel, accountChip, categoryChip } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import { LUCIDE, ICON_GROUPS } from '../ui/lucide-paths.js';
import { SWATCHES } from '../ui/palette.js';
import { BRAND_KEYS, brandChip } from '../ui/brands.js';
import { TYPE_LABEL } from '../data/seed.js';

const patch = (p) => store.set({ editEntity: { ...store.ui.editEntity, ...p } });

/** The chip the rest of the app will draw, updating as you edit. */
function preview(e) {
  return el('div', { class: 'entity__preview' }, [
    e.kind === 'account' ? accountChip(e, 44) : categoryChip(e, 44),
    el('input', {
      id: 'entity-name',
      class: 'entity__name',
      value: e.name,
      placeholder: e.kind === 'account' ? 'Account name' : 'Category name',
      // Silent: the preview chip does not depend on the name, so re-rendering
      // the sheet mid-word would only risk the caret.
      onInput: (ev) => {
        store.ui.editEntity.name = ev.target.value;
      }
    })
  ]);
}

function typeSeg(e) {
  const options = e.kind === 'account'
    ? Object.keys(TYPE_LABEL).map(k => [k, TYPE_LABEL[k]])
    : [['expense', 'Expense'], ['income', 'Income']];

  return el('div', { class: 'segpill segpill--wrap' },
    options.map(([id, label]) => el('div', {
      class: 'seg tappable' + (e.type === id ? ' seg--on' : ''),
      text: label,
      onClick: () => patch({ type: id })
    }))
  );
}

function swatches(e) {
  return el('div', { class: 'swatches' },
    SWATCHES.map(c => el('div', {
      class: 'swatch tappable' + (e.color === c ? ' swatch--on' : ''),
      style: { background: c },
      onClick: () => patch({ color: c })
    }, [e.color === c ? icon('check', 13, { weight: 2.6 }) : null].filter(Boolean)))
  );
}

/**
 * Icon picker: a search box over every name in the set, plus group tabs for
 * browsing. Only the curated ~130 are here; the search exists so swapping in
 * the full Lucide pack later needs no UI change.
 */
function iconPicker(e) {
  const q = (store.ui.iconQuery || '').trim().toLowerCase();
  const group = store.ui.iconGroup;

  // Open on the group the current icon belongs to, so an existing choice is
  // visible and adjustable rather than hidden three tabs away.
  const home = (ICON_GROUPS.find(g => g.names.includes(e.icon)) || ICON_GROUPS[0]).label;
  const active = group || home;

  let names;
  if (q) names = Object.keys(LUCIDE).filter(n => n.includes(q));
  else names = (ICON_GROUPS.find(g => g.label === active) || ICON_GROUPS[0]).names;

  return el('div', { class: 'iconpick' }, [
    el('input', {
      id: 'icon-search',
      class: 'iconpick__search',
      value: store.ui.iconQuery || '',
      placeholder: 'Search icons',
      onInput: (ev) => store.set({ iconQuery: ev.target.value })
    }),
    el('div', { class: 'chiprow chiprow--flush' },
      ICON_GROUPS.map(g => chip(
        g.label,
        !q && active === g.label,
        () => store.set({ iconGroup: g.label, iconQuery: '' })
      ))
    ),
    names.length
      ? el('div', { class: 'icongrid' },
        names.map(n => el('div', {
          class: 'icongrid__cell tappable' + (e.icon === n ? ' icongrid__cell--on' : ''),
          onClick: () => patch({ icon: n })
        }, [icon(n, 19)]))
      )
      : el('div', { class: 'iconpick__empty', text: 'No icon called “' + q + '”' })
  ]);
}

/** Accounts only: attach a payment-network logo, or none. */
function brandRow(e) {
  return el('div', { class: 'chiprow chiprow--flush' }, [
    chip('No logo', !e.brand, () => patch({ brand: null })),
    ...BRAND_KEYS.map(k => chip(
      k === 'mastercard' ? 'MC' : k[0].toUpperCase() + k.slice(1),
      e.brand === k,
      // A logo replaces the icon; showing both would be two marks in one chip.
      () => patch({ brand: k, icon: null }),
      brandChip(k, 18)
    ))
  ]);
}

function accountFields(e) {
  return [
    fieldLabel('Currency'),
    el('div', { class: 'chiprow chiprow--flush' },
      ['BDT', 'USD'].map(c => chip(c, e.currency === c, () => patch({ currency: c })))
    ),

    fieldLabel('Opening balance'),
    el('input', {
      id: 'entity-initial',
      class: 'entity__field',
      inputmode: 'decimal',
      value: String(e.initial === undefined ? 0 : e.initial),
      onInput: (ev) => { store.ui.editEntity.initial = parseFloat(ev.target.value || '0') || 0; }
    }),

    fieldLabel('Logo'),
    brandRow(e)
  ];
}

export function renderEntitySheet() {
  const e = store.ui.editEntity;
  if (!e) return el('div', { class: 'sheet' });

  const isAccount = e.kind === 'account';
  const armed = store.ui.confirmDelete;

  const body = el('div', { class: 'sheet__body' }, [
    preview(e),

    fieldLabel('Type'),
    typeSeg(e),

    ...(isAccount ? accountFields(e) : []),

    fieldLabel('Colour'),
    swatches(e),

    fieldLabel('Icon'),
    iconPicker(e)
  ]);

  const foot = el('div', { class: 'sheet__foot' }, [
    el('div', {
      class: 'savebtn savebtn--ready tappable',
      text: (e.isNew ? 'Add ' : 'Save ') + (isAccount ? 'account' : 'category'),
      onClick: async () => {
        const name = (store.ui.editEntity.name || '').trim();
        if (!name) { store.say('Give it a name first'); return; }

        const row = { ...store.ui.editEntity, name };
        delete row.kind;
        delete row.isNew;

        if (isAccount) await store.saveAccount(row);
        else await store.saveCategory(row);

        store.set({ sheet: null, editEntity: null, confirmDelete: false });
        store.say(name + ' saved');
      }
    }),
    e.isNew
      ? null
      : el('div', {
        class: 'delbtn delbtn--wide tappable' + (armed ? ' delbtn--armed' : ''),
        text: armed ? 'Tap again to delete' : 'Delete',
        onClick: async () => {
          if (!armed) { store.set({ confirmDelete: true }); return; }
          const gone = isAccount
            ? await store.deleteAccount(e.id)
            : await store.deleteCategory(e.id);
          // A refusal (the row is still in use) leaves the sheet open with the
          // reason in a toast, so nothing is lost.
          if (gone) store.set({ sheet: null, editEntity: null, confirmDelete: false });
          else store.set({ confirmDelete: false });
        }
      })
  ].filter(Boolean));

  return el('div', { class: 'sheet sheet--entity' }, [
    el('div', { class: 'sheet__head' }, [
      el('div', {
        class: 'sheet__title',
        text: (e.isNew ? 'New ' : 'Edit ') + (isAccount ? 'account' : 'category')
      })
    ]),
    body,
    foot
  ]);
}
