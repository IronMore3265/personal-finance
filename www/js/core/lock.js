// The app lock: a biometric check in front of the ledger.
//
// Reached through window.Capacitor.Plugins rather than a bare import, like
// every other native capability in the app (see data/repo.js and the status
// bar wiring in app.js). That keeps the browser build, the dev server and the
// whole Playwright suite working with no plugin present at all - `available()`
// simply answers false there, and nothing else in the app has to know why.

/** Android's BiometryType enum, for the one value we name. */
const DEVICE_CREDENTIAL = 7;

const plugin = () =>
  (typeof window !== 'undefined' && window.Capacitor
    && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeBiometric) || null;

/**
 * Whether this device can actually ask for a fingerprint or a face.
 *
 * `useFallback` here means "count a PIN or pattern as good enough", which is
 * what decides whether the lock is worth offering at all: a phone with a
 * secure lock screen and no enrolled biometric can still be asked to
 * authenticate, just not with a finger.
 *
 * Never throws. A plugin that is missing, unimplemented on this platform, or
 * simply in a bad mood is the same answer as a phone with no sensor: no.
 */
export async function available() {
  const p = plugin();
  if (!p) return false;
  try {
    const res = await p.isAvailable({ useFallback: true });
    return !!(res && res.isAvailable);
  } catch {
    return false;
  }
}

/**
 * Ask for the user, and say whether they answered.
 *
 * On Android `useFallback` is an iOS-only option: BiometricPrompt cannot offer
 * both a device-credential fallback and a cancel button, so asking for the PIN
 * as a fallback would take the cancel button away. A lock you cannot back out
 * of is the wrong trade for a local ledger - if the finger is not recognised
 * the user needs a way to reach the Unlock button and try again - so this
 * prompts for biometrics with a cancel, and `allowPin` is there for the one
 * caller that wants the stricter form.
 *
 * Never throws: a cancel, a timeout and a hardware failure are all just false.
 *
 * @param {string} reason shown in the system prompt
 * @param {boolean} [allowPin] accept the device PIN too, losing the cancel button
 */
export async function verify(reason, allowPin = false) {
  const p = plugin();
  if (!p) return false;
  try {
    await p.verifyIdentity({
      reason,
      title: 'Paisa',
      subtitle: reason,
      negativeButtonText: 'Cancel',
      maxAttempts: 3,
      ...(allowPin ? { allowedBiometryTypes: [DEVICE_CREDENTIAL] } : {})
    });
    return true;
  } catch {
    return false;
  }
}
