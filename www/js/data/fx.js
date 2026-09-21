// The USD/BDT exchange rate, when there is signal for one.
//
// Like sync, this runs beside the app and never in front of it: the ledger is
// already on screen from the local database, every amount is already correct
// in its own account's currency, and a rate that never arrives costs nothing
// but a slightly stale conversion. So nothing here is ever awaited during
// boot, and a failure is silent - data/seed.js holds an offline floor, the
// last fetched rate is persisted, and Settings offers a rate typed by hand.

/**
 * open.er-api.com: no key, no signup, CORS open, quotes BDT, updates daily.
 *
 * Frankfurter would be the obvious alternative and cannot be used - it is ECB
 * data, and the ECB does not publish a BDT reference rate.
 */
const ENDPOINT = 'https://open.er-api.com/v6/latest/USD';

/** Ask again after this long. Daily data does not reward polling. */
const MAX_AGE = 12 * 60 * 60 * 1000;

/** A sanity band. A parse that lands outside it is a bad response, not a rate. */
const FLOOR = 30;
const CEILING = 500;

const stale = (at) => !at || (Date.now() - Date.parse(at)) > MAX_AGE;

/**
 * Fetch the rate and hand it to the store, unless the stored one is fresh.
 *
 * @param {object} store
 * @param {boolean} [force] ignore the age check, for the Refresh button
 * @returns {Promise<number|null>} the rate, or null if nothing was learned
 */
export async function refreshRate(store, force = false) {
  if (!force && !stale(store.ui.fxAt)) return null;
  // A rate the user typed stands until they ask for a new one. This is the
  // only guard on that rule; store.setRate records whatever it is handed.
  if (store.ui.fxManual && !force) return null;

  try {
    const res = await fetch(ENDPOINT, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    const json = await res.json();
    const rate = json && json.rates && Number(json.rates.BDT);
    if (!(rate > FLOOR && rate < CEILING)) return null;

    await store.setRate(rate, false);
    return rate;
  } catch {
    // Offline, blocked, or the host having a bad day. The stored rate stands.
    return null;
  }
}
