// Home currency, and the rate the other one converts at.
//
// Two settings that only make sense together: picking USD is meaningless
// without saying what a dollar is worth, and the rate is meaningless unless
// something is being converted. So they share a sheet rather than sitting as
// two unrelated rows.
//
// Nothing in the ledger moves when the currency changes. Every transaction
// keeps its own amount in its own currency; this only decides what they are
// added up into. See store.homeVal.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { chip, fieldLabel } from '../ui/components.js';
import { refreshRate } from '../data/fx.js';
import { CURRENCIES, SYM } from '../data/seed.js';
import {
  TAP, SHEET, SHEET_BODY, SHEET_FOOT, SHEET_TITLE, SHEET_LEDE, SHEET_ICON,
  SAVEBTN, FIELD, CHIPROW_FLUSH
} from '../ui/styles.js';

const NOTE = 'mt-5 font-ui font-normal text-[11.5px]/[1.6] text-ink2 normal-nums';
const RATE_LINE = 'font-ui font-bold text-[15px]/[1.2] text-ink normal-nums';
const RATE_META = 'font-ui font-medium text-[11px]/[1.5] text-ink3 mt-1.5 normal-nums';

/** How old the rate is, in words. */
function age(at) {
  if (!at) return 'never fetched';
  const mins = Math.round((Date.now() - Date.parse(at)) / 60000);
  if (!Number.isFinite(mins)) return 'never fetched';
  if (mins < 2) return 'just now';
  if (mins < 60) return mins + ' minutes ago';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
  const days = Math.round(hours / 24);
  return days + ' day' + (days === 1 ? '' : 's') + ' ago';
}

/** Where the rate in force came from, said plainly. */
function provenance() {
  if (store.ui.fxManual) return 'Set by hand · ' + age(store.ui.fxAt);
  if (store.ui.fxRate > 0) return 'Fetched ' + age(store.ui.fxAt);
  return 'Built-in estimate · no rate fetched yet';
}

export function renderCurrencySheet() {
  const rate = store.rates.USD;

  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    fieldLabel('Show every total in'),
    el('div', { class: CHIPROW_FLUSH, dataset: { testid: 'chiprow' } },
      CURRENCIES.map(c => chip(
        c + ' · ' + SYM[c],
        store.ui.homeCurrency === c,
        () => store.setHomeCurrency(c)
      ))
    ),

    fieldLabel('Exchange rate'),
    el('div', { class: 'py-1', dataset: { testid: 'rate-line' } }, [
      el('div', { class: RATE_LINE, text: '1 USD = ' + rate.toLocaleString('en-US') + ' BDT' }),
      el('div', { class: RATE_META, text: provenance() })
    ]),

    el('div', {
      class: 'mt-3 flex items-center justify-center gap-2 py-3 rounded-pill bg-soft '
        + 'font-ui font-semibold text-[12px] text-ink normal-nums ' + TAP,
      dataset: { testid: 'rate-refresh' },
      onClick: async () => {
        const got = await refreshRate(store, true);
        store.say(got
          ? 'Rate updated · 1 USD = ' + got.toLocaleString('en-US') + ' BDT'
          : 'Could not reach the rate service · keeping the last one');
      }
    }, [icon('repeat', 15), el('span', { text: 'Fetch the current rate' })]),

    fieldLabel('Or set it yourself'),
    el('input', {
      id: 'rate-input',
      class: FIELD,
      type: 'text',
      inputmode: 'decimal',
      value: store.ui.fxRateDraft === undefined ? '' : store.ui.fxRateDraft,
      placeholder: String(rate),
      onInput: (e) => store.set({ fxRateDraft: e.target.value }, true)
    }),

    el('div', {
      class: NOTE,
      text: 'A rate you set by hand is kept until you fetch a new one, so it '
        + 'survives being offline. Your transactions are not changed either '
        + 'way — each one keeps the amount and currency you entered.'
    })
  ]);

  const typed = Number(store.ui.fxRateDraft);
  const ready = typed > 0;

  const foot = el('div', { class: SHEET_FOOT }, [
    el('div', {
      class: SAVEBTN + ' ' + TAP
        + (ready ? ' bg-accent text-accent-ink' : ' bg-soft text-ink3'),
      dataset: { testid: 'savebtn', ready: ready ? '1' : '0' },
      text: 'Use this rate',
      onClick: async () => {
        if (!ready) return;
        await store.setRate(typed, true);
        store.set({ fxRateDraft: '', sheet: null });
        store.say('Rate set · 1 USD = ' + typed.toLocaleString('en-US') + ' BDT');
      }
    })
  ]);

  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: 'flex-none pt-[18px] px-[22px] pb-1 flex items-start gap-3' }, [
      el('div', { class: SHEET_ICON }, [icon('coin', 18)]),
      el('div', {}, [
        el('div', { class: SHEET_TITLE, text: 'Home currency' }),
        el('div', {
          class: SHEET_LEDE,
          text: 'Which currency your totals are added up in, and what the other '
            + 'one is worth.'
        })
      ])
    ]),
    body,
    foot
  ]);
}
