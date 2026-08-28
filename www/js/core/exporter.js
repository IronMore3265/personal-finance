// Getting your data back out. "Local-first" is only true if the data can leave
// on your terms, so both of these write a real file you can open elsewhere.
//
// On device: written to Documents, then handed to the Android share sheet.
// In a browser: downloaded straight from the page.

import { repo } from '../data/repo.js';
import { DB_NAME } from '../data/schema.js';

const plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};
const isNative = () =>
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform();

/** RFC 4180: double the quotes, wrap anything containing a delimiter. */
function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCsv(store) {
  const header = [
    'date', 'type', 'account', 'account_currency', 'category',
    'amount', 'currency', 'rate', 'amount_in_account_currency', 'note', 'source'
  ];

  const rows = store.db.txns
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map(t => {
      const account = store.acct(t.account) || {};
      const category = store.cat(t.cat) || {};
      return [
        t.date, t.type, account.name, account.currency, category.name,
        t.amount, t.currency, t.rate, store.conv(t), t.note, t.source
      ].map(csvCell).join(',');
    });

  return [header.join(','), ...rows].join('\r\n');
}

async function deliver(filename, contents, mimeType) {
  if (!isNative()) {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'Downloaded ' + filename;
  }

  const { Filesystem, Share } = plugins();
  if (!Filesystem) throw new Error('Filesystem plugin unavailable');

  const written = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: 'DOCUMENTS',
    encoding: 'utf8',
    recursive: true
  });

  if (Share) {
    try {
      await Share.share({ title: filename, url: written.uri, dialogTitle: 'Save or send' });
    } catch {
      // The user dismissing the share sheet is not a failure; the file is written.
    }
  }
  return 'Saved to Documents · ' + filename;
}

export async function exportCsv(store) {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    const message = await deliver(`paisa-transactions-${stamp}.csv`, toCsv(store), 'text/csv');
    store.say(message);
  } catch (err) {
    console.error('[paisa] CSV export failed', err);
    store.say('Export failed · ' + (err.message || 'unknown error'));
  }
}

/**
 * A portable snapshot of the whole database. On device this uses the plugin's
 * own `exportToJson`, which is the supported way to lift a SQLite database out
 * of app-private storage; it can be re-imported by the same plugin.
 */
export async function backupDatabase(store) {
  try {
    const stamp = new Date().toISOString().slice(0, 10);
    let payload;

    if (isNative() && plugins().CapacitorSQLite) {
      const result = await plugins().CapacitorSQLite.exportToJson({
        database: DB_NAME,
        jsonexportmode: 'full',
        readonly: false
      });
      payload = JSON.stringify(result.export, null, 2);
    } else {
      payload = JSON.stringify(await repo.load(), null, 2);
    }

    const message = await deliver(`paisa-backup-${stamp}.json`, payload, 'application/json');
    store.say(message);
  } catch (err) {
    console.error('[paisa] Backup failed', err);
    store.say('Backup failed · ' + (err.message || 'unknown error'));
  }
}
