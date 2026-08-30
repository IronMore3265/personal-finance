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
      text: store.ui.confirmDelete ? 'Tap again to sign out' : 'Sign out',
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

/** Signed out: email, password, and a mode switch. */
function signedOut() {
  const creating = store.ui.syncMode === 'signup';
  const busy = store.ui.syncBusy;

  const body = el('div', { class: SHEET_BODY, dataset: { testid: 'sheet-body' } }, [
    el('div', { class: 'flex bg-soft rounded-pill p-1' }, [
      el('div', {
        class: 'flex-1 text-center py-[11px] px-1 rounded-pill font-ui font-semibold '
          + 'text-[12.5px] normal-nums ' + TAP
          + (!creating ? ' bg-ink text-bg' : ' bg-transparent text-ink3'),
        text: 'Sign in',
        onClick: () => store.set({ syncMode: 'signin', syncError: null })
      }),
      el('div', {
        class: 'flex-1 text-center py-[11px] px-1 rounded-pill font-ui font-semibold '
          + 'text-[12.5px] normal-nums ' + TAP
          + (creating ? ' bg-ink text-bg' : ' bg-transparent text-ink3'),
        text: 'Create account',
        onClick: () => store.set({ syncMode: 'signup', syncError: null })
      })
    ]),

    fieldLabel('Email'),
    el('input', {
      id: 'sync-email',
      class: FIELD,
      type: 'email',
      inputmode: 'email',
      autocapitalize: 'none',
      autocomplete: 'email',
      value: store.ui.syncEmail || '',
      placeholder: 'you@example.com',
      onInput: (e) => store.set({ syncEmail: e.target.value }, true)
    }),

    fieldLabel('Password'),
    el('input', {
      id: 'sync-password',
      class: FIELD,
      type: 'password',
      autocomplete: creating ? 'new-password' : 'current-password',
      value: store.ui.syncPassword || '',
      placeholder: creating ? 'at least 6 characters' : '',
      onInput: (e) => store.set({ syncPassword: e.target.value }, true)
    }),

    store.ui.syncError
      ? el('div', { class: SYNC_ERR, text: store.ui.syncError })
      : null,

    el('div', {
      class: SYNC_NOTE,
      text: creating
        ? 'Everything already on this phone is uploaded to the new account — '
          + 'nothing is replaced or lost.'
        : 'Signing in merges this phone’s ledger with the account. '
          + 'Existing transactions are kept.'
    })
  ].filter(Boolean));

  const foot = el('div', { class: SHEET_FOOT }, [
    el('div', {
      class: SAVEBTN + ' ' + TAP
        + (busy ? ' bg-soft text-ink3' : ' bg-accent text-accent-ink'),
      dataset: { testid: 'savebtn', ready: busy ? '0' : '1' },
      text: busy ? 'Working…' : (creating ? 'Create account' : 'Sign in'),
      onClick: () => submit(creating)
    })
  ]);

  return [body, foot];
}

async function submit(creating) {
  const email = (store.ui.syncEmail || '').trim();
  const password = store.ui.syncPassword || '';

  if (!email || !password) { store.set({ syncError: 'Email and password, please' }); return; }
  if (creating && password.length < 6) {
    store.set({ syncError: 'Passwords need at least 6 characters' });
    return;
  }

  store.set({ syncBusy: true, syncError: null });
  try {
    if (creating) {
      const { confirmationRequired } = await supabase.signUp(email, password);
      if (confirmationRequired) {
        store.set({
          syncBusy: false,
          syncError: 'Check your email to confirm the address, then sign in.',
          syncMode: 'signin'
        });
        return;
      }
    } else {
      await supabase.signIn(email, password);
    }

    // Clear the password out of memory as soon as it is spent.
    store.set({ syncBusy: false, syncPassword: '', syncError: null });
    store.say('Signed in · syncing');

    await sync.run();
    await store.reload();
  } catch (err) {
    store.set({
      syncBusy: false,
      syncError: String((err && err.message) || err)
    });
  }
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
