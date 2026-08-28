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
    el('div', { class: 'syncstat__row' }, [
      el('div', { class: 'chipglyph' }, [icon(glyph, 16)]),
      el('div', { class: 'syncstat__label', text: label })
    ])
  ];

  if (sync.pending) {
    lines.push(el('div', {
      class: 'syncstat__meta',
      text: sync.pending + ' change' + (sync.pending > 1 ? 's' : '') + ' waiting to upload'
    }));
  }
  if (sync.lastSyncedAt) {
    lines.push(el('div', {
      class: 'syncstat__meta',
      text: 'Last synced ' + new Date(sync.lastSyncedAt).toLocaleString()
    }));
  }
  if (sync.status === 'error' && sync.lastError) {
    lines.push(el('div', { class: 'syncstat__err', text: sync.lastError }));
  }

  return el('div', { class: 'syncstat' }, lines);
}

/** Signed in: status, a manual sync, and sign out. */
function signedIn() {
  const body = el('div', { class: 'sheet__body' }, [
    statusBlock(),

    fieldLabel('Account'),
    el('div', { class: 'entity__field', text: supabase.email || '' }),

    el('div', {
      class: 'syncnote',
      text: 'Your ledger lives on this device and is copied to Supabase. '
        + 'Sign in with the same address on another phone to see it there.'
    })
  ]);

  const foot = el('div', { class: 'sheet__foot' }, [
    el('div', {
      class: 'savebtn savebtn--ready tappable',
      text: sync.status === 'syncing' ? 'Syncing…' : 'Sync now',
      onClick: async () => {
        await sync.run();
        await store.reload();
      }
    }),
    el('div', {
      class: 'delbtn delbtn--wide tappable' + (store.ui.confirmDelete ? ' delbtn--armed' : ''),
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

  const body = el('div', { class: 'sheet__body' }, [
    el('div', { class: 'segpill' }, [
      el('div', {
        class: 'seg tappable' + (!creating ? ' seg--on' : ''),
        text: 'Sign in',
        onClick: () => store.set({ syncMode: 'signin', syncError: null })
      }),
      el('div', {
        class: 'seg tappable' + (creating ? ' seg--on' : ''),
        text: 'Create account',
        onClick: () => store.set({ syncMode: 'signup', syncError: null })
      })
    ]),

    fieldLabel('Email'),
    el('input', {
      id: 'sync-email',
      class: 'entity__field',
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
      class: 'entity__field',
      type: 'password',
      autocomplete: creating ? 'new-password' : 'current-password',
      value: store.ui.syncPassword || '',
      placeholder: creating ? 'at least 6 characters' : '',
      onInput: (e) => store.set({ syncPassword: e.target.value }, true)
    }),

    store.ui.syncError
      ? el('div', { class: 'syncstat__err', text: store.ui.syncError })
      : null,

    el('div', {
      class: 'syncnote',
      text: creating
        ? 'Everything already on this phone is uploaded to the new account — '
          + 'nothing is replaced or lost.'
        : 'Signing in merges this phone’s ledger with the account. '
          + 'Existing transactions are kept.'
    })
  ].filter(Boolean));

  const foot = el('div', { class: 'sheet__foot' }, [
    el('div', {
      class: 'savebtn tappable' + (busy ? '' : ' savebtn--ready'),
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

  return el('div', { class: 'sheet sheet--entity' }, [
    el('div', { class: 'sheet__head sheet__head--sms' }, [
      el('div', { class: 'sheet__icon' }, [icon('upload', 18)]),
      el('div', {}, [
        el('div', { class: 'sheet__title', text: 'Cloud sync' }),
        el('div', {
          class: 'sheet__lede',
          text: 'Optional. Paisa works offline either way — this is for backup '
            + 'and for a second device.'
        })
      ])
    ]),
    body,
    foot
  ]);
}
