// Cloud sync: sign in, or see where sync has got to.
//
// Two shapes in one sheet, because they are the same thing at two moments.
// Signed out it is an email and a password; signed in it is a status line, a
// "sync now" and a way out.
//
// Sync is deliberately optional. The app is local-first and works perfectly
// with no account at all - this is for backup and for a second device - so
// nothing here blocks the ledger.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { fieldLabel } from '../ui/components.js';
import { icon } from '../ui/icons.js';
import {
  TAP, SHEET, SHEET_BODY, SHEET_FOOT, SHEET_TITLE, SHEET_LEDE, SHEET_ICON,
  SAVEBTN, DELBTN_WIDE, FIELD
} from '../ui/styles.js';

/* Recipes used by both the signed-in and signed-out halves. */
const SYNC_META = 'font-ui font-medium text-[11.5px]/[1.5] text-ink3 mt-2 ml-12 normal-nums';
// Errors are quoted back verbatim, so they wrap rather than clip.
const SYNC_ERR = 'mt-3 py-[11px] px-[13px] rounded-box bg-danger-soft text-danger '
  + 'font-ui font-medium text-[11.5px]/[1.55] [overflow-wrap:anywhere] normal-nums';
const SYNC_NOTE = 'mt-5 font-ui font-normal text-[11.5px]/[1.6] text-ink2 normal-nums';
import { supabase } from '../data/supabase.js';
import { sync } from '../data/sync.js';

const STATUS = {
  idle: ['check', 'Everything is synced'],
  syncing: ['repeat', 'Syncing…'],
  offline: ['alert', 'Offline — your changes are safe and queued'],
  error: ['alert', 'Last sync did not finish'],
  off: ['upload', 'Not signed in']
};

function statusBlock() {
  const [glyph, label] = STATUS[sync.status] || STATUS.off;

  const lines = [
    el('div', { class: 'flex items-center gap-3' }, [
      el('div', {
        class: 'flex-none w-9 h-9 rounded-chip flex items-center justify-center '
          + 'font-ui font-bold text-[13px] text-ink normal-nums',
        dataset: { testid: 'chipglyph' }
      }, [icon(glyph, 16)]),
      el('div', {
        class: 'font-ui font-semibold text-[14.5px]/[1.2] text-ink normal-nums',
        text: label
      })
    ])
  ];

  if (sync.pending) {
    lines.push(el('div', {
      class: SYNC_META,
      text: sync.pending + ' change' + (sync.pending > 1 ? 's' : '') + ' waiting to upload'
    }));
  }
  if (sync.lastSyncedAt) {
    lines.push(el('div', {
      class: SYNC_META,
      text: 'Last synced ' + new Date(sync.lastSyncedAt).toLocaleString()
    }));
  }
  if (sync.status === 'error' && sync.lastError) {
    lines.push(el('div', { class: SYNC_ERR, text: sync.lastError }));
  }

  return el('div', { class: 'pt-4 pb-1 border-b border-line' }, lines);
}

/** Signed in: status, a manual sync, and sign out. */
function signedIn() {
  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    statusBlock(),

    fieldLabel('Account'),
    el('div', { class: FIELD, text: supabase.email || '' }),

    el('div', {
      class: SYNC_NOTE,
      text: 'Your ledger lives on this device and is copied to Supabase. '
        + 'Sign in with the same address on another phone to see it there.'
    }),

    /*
     * Worth saying before they tap it. "Forgot password" is answered by the
     * app lock rather than by an email, and that only works while this phone
     * still holds a session - signing out is what throws that away.
     */
    el('div', {
      class: SYNC_NOTE,
      text: 'Signing out needs your password to undo. While you stay signed in, '
        + 'your fingerprint is enough to set a new one.'
    })
  ]);

  const foot = el('div', { class: SHEET_FOOT }, [
    el('div', {
      class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
      dataset: { testid: 'savebtn', ready: '1' },
      text: sync.status === 'syncing' ? 'Syncing…' : 'Sync now',
      onClick: async () => {
        await sync.run();
        await store.reload();
      }
    }),
    el('div', {
      class: DELBTN_WIDE + ' ' + TAP
        + (store.ui.confirmDelete ? ' bg-danger text-white' : ' bg-soft text-ink2'),
      dataset: { testid: 'delbtn', armed: store.ui.confirmDelete ? '1' : '0' },
      text: store.ui.confirmDelete
        ? 'Tap again — you will need your password'
        : 'Sign out',
      onClick: async () => {
        if (!store.ui.confirmDelete) { store.set({ confirmDelete: true }); return; }
        await supabase.signOut();
        // The ledger stays. Only the link to the account goes.
        await sync.reset();
        store.set({ sheet: null, confirmDelete: false });
        store.say('Signed out · your data is still on this device');
      }
    })
  ]);

  return [body, foot];
}

/**
 * Signed out: a word about what an account is for, and the way to the form.
 *
 * The form itself lives on the sign-in screen (screens/signin.js), which is
 * the same one a first run meets. Keeping a second copy here meant two places
 * to change the validation, the error handling and the Remember me tick, and
 * two chances for them to drift apart.
 */
function signedOut() {
  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    statusBlock(),

    el('div', {
      class: SYNC_NOTE,
      text: 'With an account your ledger is copied to Supabase as you go, and '
        + 'signing in on another phone brings it with you. Nothing is uploaded '
        + 'until you do — everything you have entered so far stays on this device '
        + 'either way.'
    })
  ]);

  const foot = el('div', { class: SHEET_FOOT }, [
    el('div', {
      class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
      dataset: { testid: 'savebtn', ready: '1' },
      text: 'Sign in or create an account',
      onClick: () => store.set({ sheet: null, authGate: true, authStep: 'signin' })
    })
  ]);

  return [body, foot];
}

export function renderSyncSheet() {
  const [body, foot] = supabase.signedIn ? signedIn() : signedOut();

  return el('div', { class: SHEET + ' max-h-[92%]' }, [
    el('div', { class: 'flex-none pt-[18px] px-[22px] pb-1 flex items-start gap-3' }, [
      el('div', { class: SHEET_ICON }, [icon('upload', 18)]),
      el('div', {}, [
        el('div', { class: SHEET_TITLE, text: 'Cloud sync' }),
        el('div', {
          class: SHEET_LEDE,
          text: 'Optional. Paisa works offline either way — this is for backup '
            + 'and for a second device.'
        })
      ])
    ]),
    body,
    foot
  ]);
}
