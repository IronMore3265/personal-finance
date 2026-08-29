// One editor for both categories and accounts.
//
// They differ in three fields and share everything else - a name, a colour, an
// icon and a live preview of the chip the rest of the app will draw - so this
// is one sheet with two shapes rather than two nearly identical files.
//
// Driven by ui.editEntity: { kind: 'category' | 'account', ...the row }.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { chip, fieldLabel, accountChip, categoryChip, TYPE_ICON } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import {
  CHIPROW_FLUSH, TAP, SHEET, SHEET_HEAD, SHEET_BODY, SHEET_FOOT, SHEET_TITLE,
  SAVEBTN, DELBTN_WIDE, FIELD, ELLIP
} from '../ui/styles.js';
import { LUCIDE, ICON_GROUPS } from '../ui/lucide-paths.js';
import { SWATCHES } from '../ui/palette.js';
import { BRAND_KEYS, brandChip } from '../ui/brands.js';
import { TYPE_LABEL } from '../data/seed.js';

const patch = (p) => store.set({ editEntity: { ...store.ui.editEntity, ...p } });

/** The chip the rest of the app will draw, updating as you edit. */
function preview(e) {
  return el('div', { class: 'flex items-center gap-[14px] pt-4 pb-1' }, [
    e.kind === 'account' ? accountChip(e, 44) : categoryChip(e, 44),
    el('input', {
      id: 'entity-name',
      class: 'flex-1 min-w-0 bg-transparent border-none outline-none font-ui '
        + 'font-extrabold text-[22px] text-ink tracking-[-.03em] p-0 normal-nums '
        + 'placeholder:text-ink3',
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

// The two sides of the ledger, for the category shape of this sheet.
const KIND_ICON = { expense: 'arrow-up-right', income: 'arrow-down-left' };

/**
 * The type picker.
 *
 * Four account types do not fit one row at 360px, and wrapping them inside a
 * pill left the selected segment's square corner poking out past the outer
 * pill's curve. So it is a plain grid of rounded squares instead - no outer
 * radius for anything to escape - and each carries the icon the rest of the
 * app draws for that type, which is quicker to read than the label alone.
 */
function typeSeg(e) {
  const options = e.kind === 'account'
    ? Object.keys(TYPE_LABEL).map(k => [k, TYPE_LABEL[k]])
    : [['expense', 'Expense'], ['income', 'Income']];

  return el('div', { class: 'grid grid-cols-2 gap-1.5' },
    options.map(([id, label]) => el('div', {
      class: 'flex items-center gap-[9px] min-w-0 py-[13px] px-3 rounded-key '
        + 'font-ui font-semibold text-[12.5px] normal-nums ' + TAP
        + (e.type === id ? ' bg-ink text-bg' : ' bg-soft text-ink2'),
      onClick: () => patch({ type: id })
    }, [
      icon(TYPE_ICON[id] || KIND_ICON[id] || 'wallet', 17),
      el('span', { class: ELLIP, text: label })
    ]))
  );
}

function swatches(e) {
  return el('div', { class: 'grid grid-cols-8 gap-[7px]' },
    SWATCHES.map(c => el('div', {
      class: 'aspect-square rounded-[9px] grid place-items-center '
        + 'text-[var(--onCat)] ' + TAP
        + (e.color === c ? ' shadow-[0_0_0_2px_var(--bg),0_0_0_4px_var(--ink)]' : ''),
      dataset: { testid: 'swatch' },
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

  return el('div', {}, [
    el('input', {
      id: 'icon-search',
      class: 'w-full bg-soft border-none outline-none rounded-box py-[11px] '
        + 'px-[13px] font-ui font-medium text-[13px] text-ink mb-2.5 normal-nums '
        + 'placeholder:text-ink3',
      value: store.ui.iconQuery || '',
      placeholder: 'Search icons',
      onInput: (ev) => store.set({ iconQuery: ev.target.value })
    }),
    el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } },
      ICON_GROUPS.map(g => chip(
        g.label,
        !q && active === g.label,
        () => store.set({ iconGroup: g.label, iconQuery: '' })
      ))
    ),
    names.length
      ? el('div', { class: 'grid grid-cols-6 gap-1.5 mt-2.5' },
        names.map(n => el('div', {
          class: 'aspect-square grid place-items-center rounded-chip ' + TAP
            + (e.icon === n ? ' bg-ink text-bg' : ' bg-soft text-ink2'),
          dataset: { testid: 'icongrid-cell' },
          onClick: () => patch({ icon: n })
        }, [icon(n, 19)]))
      )
      : el('div', {
        class: 'py-5 text-center font-ui font-medium text-[12px] text-ink3 normal-nums',
        text: 'No icon called “' + q + '”'
      })
  ]);
}

/** Accounts only: attach a payment-network logo, or none. */
function brandRow(e) {
  return el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } }, [
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
    el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } },
      ['BDT', 'USD'].map(c => chip(c, e.currency === c, () => patch({ currency: c })))
    ),

    fieldLabel('Opening balance'),
    el('input', {
      id: 'entity-initial',
      class: FIELD,
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

  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    preview(e),

    fieldLabel('Type'),
    typeSeg(e),

    ...(isAccount ? accountFields(e) : []),

    fieldLabel('Colour'),
    swatches(e),

    fieldLabel('Icon'),
    iconPicker(e)
  ]);

  const foot = el('div', { class: SHEET_FOOT }, [
    el('div', {
      class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
      dataset: { testid: 'savebtn', ready: '1' },
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
        class: DELBTN_WIDE + ' ' + TAP
          + (armed ? ' bg-danger text-white' : ' bg-soft text-ink2'),
        dataset: { testid: 'delbtn', armed: armed ? '1' : '0' },
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

  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: SHEET_HEAD }, [
      el('div', {
        class: SHEET_TITLE,
        text: (e.isNew ? 'New ' : 'Edit ') + (isAccount ? 'account' : 'category')
      })
    ]),
    body,
    foot
  ]);
}
