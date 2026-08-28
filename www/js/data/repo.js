// Storage layer.
//
// Two drivers behind one async API:
//   SqliteDriver - real on-device SQLite through @capacitor-community/sqlite.
//   WebDriver    - localStorage, so the same build opens in a desktop browser
//                  for design review without an emulator.
//
// The app never talks to either directly; it goes through `repo`.

import { DB_NAME, DB_VERSION, DDL } from './schema.js';
import * as seed from './seed.js';

const isNative = () =>
  typeof window !== 'undefined' &&
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform();

/* ------------------------------------------------------------------ *
 * SQLite (Android)
 * ------------------------------------------------------------------ */

class SqliteDriver {
  constructor() {
    this.plugin = window.Capacitor.Plugins.CapacitorSQLite;
    this.db = DB_NAME;
  }

  async open() {
    await this.plugin.createConnection({
      database: this.db,
      encrypted: false,
      mode: 'no-encryption',
      version: DB_VERSION,
      readonly: false
    });
    await this.plugin.open({ database: this.db, readonly: false });
    await this.exec(DDL.join('\n'));

    const { values } = await this.plugin.query({
      database: this.db,
      statement: 'SELECT COUNT(*) AS n FROM accounts;',
      values: [],
      readonly: true
    });
    if (!values.length || Number(values[0].n) === 0) await this.seed();
  }

  exec(statements) {
    return this.plugin.execute({
      database: this.db,
      statements,
      transaction: true,
      readonly: false
    });
  }

  run(statement, values) {
    return this.plugin.run({
      database: this.db,
      statement,
      values,
      transaction: true,
      readonly: false
    });
  }

  async all(statement, values = []) {
    const res = await this.plugin.query({
      database: this.db,
      statement,
      values,
      readonly: true
    });
    return res.values || [];
  }

  async seed() {
    for (const [i, a] of seed.ACCOUNTS.entries()) {
      await this.run(
        'INSERT INTO accounts (id, name, type, currency, initial, sort) VALUES (?,?,?,?,?,?);',
        [a.id, a.name, a.type, a.currency, a.initial, i]
      );
    }
    for (const [i, c] of seed.CATS.entries()) {
      await this.run(
        'INSERT INTO categories (id, name, type, color, sort) VALUES (?,?,?,?,?);',
        [c.id, c.name, c.type, c.color, i]
      );
    }
    for (const t of seed.TXNS) await this.insertTxn(t);
    for (const b of seed.BUDGETS) {
      await this.run('INSERT INTO budgets (id, cat, "limit") VALUES (?,?,?);', [b.id, b.cat, b.limit]);
    }
    for (const g of seed.GOALS) {
      await this.run(
        'INSERT INTO goals (id, name, target, current, deadline) VALUES (?,?,?,?,?);',
        [g.id, g.name, g.target, g.current, g.deadline]
      );
    }
    for (const b of seed.BILLS) {
      await this.run(
        'INSERT INTO bills (id, name, amount, account, cat, freq, due, paid) VALUES (?,?,?,?,?,?,?,0);',
        [b.id, b.name, b.amount, b.account, b.cat, b.freq, b.due]
      );
    }
    for (const [i, r] of seed.RULES.entries()) {
      await this.run(
        'INSERT INTO rules (id, sender, pattern, type, account, cat, label, sort) VALUES (?,?,?,?,?,?,?,?);',
        [r.id, r.sender, r.pattern, r.type, r.account, r.cat, r.label, i]
      );
    }
  }

  insertTxn(t) {
    return this.run(
      `INSERT INTO transactions (id, account, type, cat, amount, currency, rate, date, note, source)
       VALUES (?,?,?,?,?,?,?,?,?,?);`,
      [t.id, t.account, t.type, t.cat, t.amount, t.currency, t.rate, t.date, t.note, t.source]
    );
  }

  async load() {
    const [accounts, categories, txns, budgets, goals, bills, rules, settings] = await Promise.all([
      this.all('SELECT * FROM accounts ORDER BY sort;'),
      this.all('SELECT * FROM categories ORDER BY sort;'),
      this.all('SELECT * FROM transactions ORDER BY date DESC, rowid DESC;'),
      this.all('SELECT id, cat, "limit" AS "limit" FROM budgets;'),
      this.all('SELECT * FROM goals;'),
      this.all('SELECT * FROM bills WHERE paid = 0 ORDER BY due;'),
      this.all('SELECT * FROM rules ORDER BY sort;'),
      this.all('SELECT * FROM settings;')
    ]);
    const prefs = {};
    settings.forEach(s => { prefs[s.key] = s.value; });
    return { accounts, categories, txns, budgets, goals, bills, rules, settings: prefs };
  }

  addTxn(t) { return this.insertTxn(t); }

  deleteTxn(id) {
    return this.run('DELETE FROM transactions WHERE id = ?;', [id]);
  }

  setGoal(id, current) {
    return this.run('UPDATE goals SET current = ? WHERE id = ?;', [current, id]);
  }

  payBill(id) {
    return this.run('UPDATE bills SET paid = 1 WHERE id = ?;', [id]);
  }

  setSetting(key, value) {
    return this.run(
      'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
      [key, String(value)]
    );
  }
}

/* ------------------------------------------------------------------ *
 * localStorage (browser preview)
 * ------------------------------------------------------------------ */

const KEY = 'paisa.db.v1';

class WebDriver {
  async open() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch { /* private mode */ }
    if (raw) {
      try { this.data = JSON.parse(raw); return; } catch { /* corrupt, reseed */ }
    }
    this.data = {
      accounts: seed.ACCOUNTS.map(a => ({ ...a })),
      categories: seed.CATS.map(c => ({ ...c })),
      txns: seed.TXNS.map(t => ({ ...t })),
      budgets: seed.BUDGETS.map(b => ({ ...b })),
      goals: seed.GOALS.map(g => ({ ...g })),
      bills: seed.BILLS.map(b => ({ ...b })),
      rules: seed.RULES.map(r => ({ ...r })),
      settings: {}
    };
    this.flush();
  }

  flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* quota / private mode */ }
  }

  async load() {
    const d = this.data;
    return {
      accounts: d.accounts,
      categories: d.categories,
      txns: d.txns.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
      budgets: d.budgets,
      goals: d.goals,
      bills: d.bills,
      rules: d.rules,
      settings: d.settings
    };
  }

  async addTxn(t) { this.data.txns.unshift({ ...t }); this.flush(); }

  async deleteTxn(id) {
    this.data.txns = this.data.txns.filter(t => t.id !== id);
    this.flush();
  }

  async setGoal(id, current) {
    const g = this.data.goals.find(x => x.id === id);
    if (g) g.current = current;
    this.flush();
  }

  async payBill(id) {
    this.data.bills = this.data.bills.filter(b => b.id !== id);
    this.flush();
  }

  async setSetting(key, value) {
    this.data.settings[key] = String(value);
    this.flush();
  }
}

/* ------------------------------------------------------------------ */

class Repo {
  async init() {
    this.native = isNative();
    this.driver = this.native ? new SqliteDriver() : new WebDriver();
    try {
      await this.driver.open();
    } catch (err) {
      // A device failure here would otherwise leave a blank screen. Fall back to
      // the in-browser driver so the app still opens, and surface it in Settings.
      console.error('[paisa] SQLite unavailable, falling back to local storage', err);
      this.native = false;
      this.failure = String(err && err.message ? err.message : err);
      this.driver = new WebDriver();
      await this.driver.open();
    }
    return this.driver.load();
  }

  get backend() {
    if (this.failure) return 'fallback · localStorage';
    return this.native ? 'sqlite · on device' : 'localStorage · browser';
  }

  load() { return this.driver.load(); }
  addTxn(t) { return this.driver.addTxn(t); }
  deleteTxn(id) { return this.driver.deleteTxn(id); }
  setGoal(id, current) { return this.driver.setGoal(id, current); }
  payBill(id) { return this.driver.payBill(id); }
  setSetting(k, v) { return this.driver.setSetting(k, v); }
}

export const repo = new Repo();
