// The two gates that can stand in front of the ledger: the app lock, and the
// sign-in screen.
//
// Both are drawn into #gate, which covers the whole shell - see app.css. They
// live in one file because they are the same moment from two directions: one
// asks who is holding the phone, the other asks whose ledger this is.
//
// Neither is compulsory. The app is local-first and works with no account at
// all, so the sign-in screen carries a way past it and remembers that you took
// it. The lock is off until it is turned on in Settings.

import { el } from '../core/dom.js';
import { store } from '../core/store.js';
import { icon } from '../ui/icons.js';
import { toggle } from '../ui/components.js';
import { supabase } from '../data/supabase.js';
import { sync } from '../data/sync.js';
import * as lock from '../core/lock.js';
import { TAP, SAVEBTN, FIELD, SHEET_TITLE, SHEET_LEDE } from '../ui/styles.js';

const MARK = 'font-ui font-extrabold text-[30px]/[1] text-ink tracking-[-.04em]';
const GATE_ERR = 'mt-3 py-[11px] px-[13px] rounded-box bg-danger-soft text-danger '
  + 'font-ui font-medium text-[11.5px]/[1.55] [overflow-wrap:anywhere] normal-nums';
const GATE_LABEL = 'font-ui font-semibold text-[10px]/[1] text-ink3 uppercase '
  + 'tracking-[.12em] mt-5 mb-2 normal-nums';
const QUIET = 'text-center font-ui font-semibold text-[12.5px] text-ink3 py-3 normal-nums';

const label = (text) => el('div', { class: GATE_LABEL, text });

/* ------------------------------------------------------------------ *
 * Remembered email
 *
 * The tick remembers the address and nothing else - never the password, which
 * is not stored anywhere at any point. It lives in localStorage beside the
 * session rather than in the settings table, because it has to be readable
 * before anyone is signed in, which is the one moment the database's own
 * account-scoped rows are no use.
 * ------------------------------------------------------------------ */

const EMAIL_KEY = 'paisa.auth.email';
const REMEMBER_KEY = 'paisa.auth.remember';
/*
 * That the sign-in screen has been waved past once.
 *
 * Here rather than in the settings table for two reasons: it has to be
 * readable before anyone is signed in, and it is a fact about this device
 * rather than about the account - skipping the screen on your phone should
 * not skip it on a second one you later sign in on.
 */
const SKIPPED_KEY = 'paisa.auth.skipped';

export function gateSkipped() {
  try { return localStorage.getItem(SKIPPED_KEY) === '1'; } catch { return false; }
}

function keepSkipped() {
  try { localStorage.setItem(SKIPPED_KEY, '1'); } catch { /* nothing to do */ }
}

export function rememberedEmail() {
  try { return localStorage.getItem(EMAIL_KEY) || ''; } catch { return ''; }
}

export function rememberedChoice() {
  try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; }
}

function keepEmail(email, remember) {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    if (remember) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch { /* private mode; the tick just will not survive a restart */ }
}

/* ------------------------------------------------------------------ *
 * The lock screen
 * ------------------------------------------------------------------ */

/**
 * Ask for the fingerprint, and drop the gate if it is given.
 *
 * `prompting` is not belt and braces. On many Android builds raising
 * BiometricPrompt moves the WebView to the background, which fires the very
 * appStateChange the resume gate listens on - so without this the prompt
 * re-triggers itself for as long as it is open.
 */
let prompting = false;

export async function askToUnlock() {
  if (prompting) return false;
  prompting = true;
  try {
    const ok = await lock.verify('Unlock Paisa');
    if (ok) store.set({ locked: false });
    return ok;
  } finally {
    prompting = false;
  }
}

export function isPrompting() { return prompting; }

function lockScreen() {
  return [
    el('div', { class: 'flex-1 flex flex-col items-center justify-center gap-5' }, [
      el('div', {
        class: 'w-[68px] h-[68px] rounded-full bg-soft text-ink flex items-center '
          + 'justify-center'
      }, [icon('fingerprint', 30, { weight: 1.7 })]),
      el('div', { class: MARK, text: 'Paisa' }),
      el('div', {
        class: 'font-ui font-medium text-[12.5px]/[1.6] text-ink3 text-center normal-nums',
        text: 'Locked. Unlock with your fingerprint or face to carry on.'
      })
    ]),
    el('div', {
      class: SAVEBTN + ' bg-accent text-accent-ink ' + TAP,
      dataset: { testid: 'unlockbtn' },
      text: 'Unlock',
      onClick: () => askToUnlock()
    })
  ];
}

/* ------------------------------------------------------------------ *
 * The sign-in screen
 * ------------------------------------------------------------------ */

/** Dismiss the gate for good, whichever way it was dealt with. */
function passGate(skipped) {
  if (skipped) keepSkipped();
  store.set({ authGate: false, authError: null, authPassword: '' });
}

async function submit() {
  const creating = store.ui.authStep === 'signup';
  const email = (store.ui.authEmail || '').trim();
  const password = store.ui.authPassword || '';

  if (!email || !password) { store.set({ authError: 'Email and password, please' }); return; }
  if (creating && password.length < 6) {
    store.set({ authError: 'Passwords need at least 6 characters' });
    return;
  }

  store.set({ authBusy: true, authError: null });
  try {
    if (creating) await supabase.signUp(email, password);
    else await supabase.signIn(email, password);

    keepEmail(email, store.ui.authRemember);
    // The password is spent the moment it is accepted; it is never kept.
    store.set({ authBusy: false, authPassword: '', authError: null });
    passGate(false);
    store.say('Signed in · syncing');

    /*
     * The upload starts now and is not waited on before the lock is offered.
     *
     * Ordering these the other way round looked harmless and was not: the
     * biometric prompt is a blocking system dialog, so the first push sat
     * behind it for as long as the sheet was on screen - and if the user
     * walked away from the prompt, until the next launch. Observed on a
     * device: the account existed with every table empty, and the rows only
     * appeared once the prompt was dismissed. Sync runs beside the app, never
     * behind a dialog.
     */
    const syncing = sync.run().then(() => store.reload());

    // Offered here rather than left in Settings, so the lock is armed before
    // it is needed rather than after the first time it was wanted.
    if (store.ui.lockAvailable && !store.ui.appLock) await offerLock();

    await syncing;
  } catch (err) {
    store.set({ authBusy: false, authError: String((err && err.message) || err) });
  }
}

async function offerLock() {
  const ok = await lock.verify('Turn on the app lock');
  if (!ok) return;
  await store.setAppLock(true);
  store.say('App lock on · Paisa will ask when it opens');
}

/**
 * Change the password without an email round trip.
 *
 * Supabase sets a password on an authenticated session, and the device already
 * holds one - so a fingerprint is enough to authorise the change. No recovery
 * mail, no code, no link back into the app.
 *
 * It follows that this can only help someone whose session is still on the
 * phone. Biometrics prove who is holding the device, not who owns the account;
 * with no session there is nothing to re-authorise, and the screen says so
 * rather than pretending otherwise.
 */
async function resetPassword() {
  const password = store.ui.authPassword || '';
  if (password.length < 6) {
    store.set({ authError: 'Passwords need at least 6 characters' });
    return;
  }

  store.set({ authBusy: true, authError: null });
  const ok = await lock.verify('Confirm it is you');
  if (!ok) {
    store.set({ authBusy: false, authError: 'That did not pass. Nothing was changed.' });
    return;
  }

  try {
    await supabase.updatePassword(password);
    store.set({ authBusy: false, authPassword: '', authError: null, authStep: 'signin' });
    passGate(false);
    store.say('Password changed');
  } catch (err) {
    store.set({ authBusy: false, authError: String((err && err.message) || err) });
  }
}

function resetPane() {
  const canReset = supabase.signedIn && store.ui.lockAvailable;

  return [
    el('div', { class: SHEET_TITLE, text: 'Set a new password' }),
    el('div', {
      class: SHEET_LEDE,
      text: canReset
        ? 'This phone is still signed in as ' + (supabase.email || 'you')
          + ', so your fingerprint is enough to set a new password. No email needed.'
        : 'A new password can only be set from a phone that is still signed in. '
          + 'Your fingerprint proves it is you, but it cannot prove whose account '
          + 'this is. Reset it from the Supabase dashboard, then sign in below.'
    }),

    canReset ? label('New password') : null,
    canReset ? el('input', {
      id: 'auth-password',
      class: FIELD,
      type: 'password',
      autocomplete: 'new-password',
      value: store.ui.authPassword || '',
      placeholder: 'at least 6 characters',
      onInput: (e) => store.set({ authPassword: e.target.value }, true)
    }) : null,

    store.ui.authError ? el('div', { class: GATE_ERR, text: store.ui.authError }) : null,

    el('div', { class: 'flex-1 min-h-[18px]' }),

    canReset ? el('div', {
      class: SAVEBTN + ' ' + TAP
        + (store.ui.authBusy ? ' bg-soft text-ink3' : ' bg-accent text-accent-ink'),
      dataset: { testid: 'savebtn', ready: store.ui.authBusy ? '0' : '1' },
      text: store.ui.authBusy ? 'Working…' : 'Confirm with fingerprint',
      onClick: resetPassword
    }) : null,

    el('div', {
      class: QUIET + ' ' + TAP,
      dataset: { testid: 'auth-back' },
      text: 'Back to sign in',
      onClick: () => store.set({ authStep: 'signin', authError: null, authPassword: '' })
    })
  ].filter(Boolean);
}

function credentialsPane() {
  const creating = store.ui.authStep === 'signup';
  const busy = store.ui.authBusy;

  return [
    el('div', { class: MARK, text: 'Paisa' }),
    el('div', {
      class: SHEET_LEDE,
      text: 'Sign in to back your ledger up and keep a second device in step. '
        + 'Everything works without an account too.'
    }),

    el('div', { class: 'flex bg-soft rounded-pill p-1 mt-6' }, [
      el('div', {
        class: 'flex-1 text-center py-[11px] px-1 rounded-pill font-ui font-semibold '
          + 'text-[12.5px] normal-nums ' + TAP
          + (!creating ? ' bg-ink text-bg' : ' bg-transparent text-ink3'),
        dataset: { testid: 'auth-signin' },
        text: 'Sign in',
        onClick: () => store.set({ authStep: 'signin', authError: null })
      }),
      el('div', {
        class: 'flex-1 text-center py-[11px] px-1 rounded-pill font-ui font-semibold '
          + 'text-[12.5px] normal-nums ' + TAP
          + (creating ? ' bg-ink text-bg' : ' bg-transparent text-ink3'),
        dataset: { testid: 'auth-signup' },
        text: 'Create account',
        onClick: () => store.set({ authStep: 'signup', authError: null })
      })
    ]),

    label('Email'),
    el('input', {
      id: 'auth-email',
      class: FIELD,
      type: 'email',
      inputmode: 'email',
      autocapitalize: 'none',
      autocomplete: 'email',
      value: store.ui.authEmail || '',
      placeholder: 'you@example.com',
      onInput: (e) => store.set({ authEmail: e.target.value }, true)
    }),

    label('Password'),
    el('input', {
      id: 'auth-password',
      class: FIELD,
      type: 'password',
      autocomplete: creating ? 'new-password' : 'current-password',
      value: store.ui.authPassword || '',
      placeholder: creating ? 'at least 6 characters' : '',
      onInput: (e) => store.set({ authPassword: e.target.value }, true)
    }),

    el('div', { class: 'flex items-center gap-3 mt-4' }, [
      el('div', { class: 'flex-1' }, [
        el('div', {
          class: 'font-ui font-semibold text-[13px] text-ink normal-nums',
          text: 'Remember me'
        }),
        el('div', {
          class: 'font-ui font-medium text-[11px]/[1.45] text-ink3 mt-[3px] normal-nums',
          text: 'Fills in your email next time. Your password is never stored.'
        })
      ]),
      el('div', { dataset: { testid: 'remember' } }, [
        toggle(store.ui.authRemember, () => {
          store.set({ authRemember: !store.ui.authRemember });
        }, true)
      ])
    ]),

    store.ui.authError ? el('div', { class: GATE_ERR, text: store.ui.authError }) : null,

    el('div', { class: 'flex-1 min-h-[18px]' }),

    el('div', {
      class: SAVEBTN + ' ' + TAP
        + (busy ? ' bg-soft text-ink3' : ' bg-accent text-accent-ink'),
      dataset: { testid: 'savebtn', ready: busy ? '0' : '1' },
      text: busy ? 'Working…' : (creating ? 'Create account' : 'Sign in'),
      onClick: submit
    }),

    creating ? null : el('div', {
      class: QUIET + ' ' + TAP,
      dataset: { testid: 'auth-forgot' },
      text: 'Forgot password?',
      onClick: () => store.set({ authStep: 'reset', authError: null, authPassword: '' })
    }),

    el('div', {
      class: QUIET + ' ' + TAP,
      dataset: { testid: 'auth-skip' },
      text: 'Continue without an account',
      onClick: () => passGate(true)
    })
  ].filter(Boolean);
}

/** What #gate should hold, or null when neither gate is up. */
export function renderGate() {
  if (store.ui.locked) return lockScreen();
  if (!store.ui.authGate) return null;
  return store.ui.authStep === 'reset' ? resetPane() : credentialsPane();
}
