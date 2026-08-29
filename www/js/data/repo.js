// Storage layer.
//
// Two drivers behind one async API:
//   SqliteDriver - real on-device SQLite through @capacitor-community/sqlite.
//   WebDriver    - localStorage, so the same build opens in a desktop browser
//                  for design review without an emulator.
//
// The app never talks to either directly; it goes through `repo`.

import { DB_NAME, DB_VERSION, DDL, MIGRATIONS } from './schema.js';
import * as seed from './seed.js';

const isNative = () =>
  typeof window !== 'undefined' &&
  window.Capacitor &&
  typeof window.Capacitor.isNativePlatform === 'function' &&
  window.Capacitor.isNativePlatform();

/** Items arrive as a flat table but are read per transaction; index them once. */
function indexItems(rows) {
  const out = {};
  for (const r of rows) (out[r.txn] || (out[r.txn] = [])).push(r);
  for (const k in out) out[k].sort((a, b) => a.sort - b.sort);
  return out;
}

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

    const fresh = !(await this.hasTable('accounts'));
    await this.exec(DDL.join('\n'));

    // A fresh file is already at the current shape; only an existing one needs
    // the additive steps. Either way the version is stamped at the end.
    if (!fresh) await this.migrate();
    await this.exec('PRAGMA user_version = ' + DB_VERSION + ';');

    const { values } = await this.plugin.query({
      database: this.db,
      statement: 'SELECT COUNT(*) AS n FROM accounts;',
      values: [],
      readonly: false
    });
    if (!values.length || Number(values[0].n) === 0) {
      await this.seed();
      return;
    }

    // A database created before `rules` existed gets the table from the DDL
    // above, but empty - seed() never runs again once there are accounts, so
    // the parser would match nothing until the user wrote a rule by hand.
    const ruleRows = await this.all('SELECT COUNT(*) AS n FROM rules;');
    if (!ruleRows.length || Number(ruleRows[0].n) === 0) await this.seedRules();
  }

  async hasTable(name) {
    const rows = await this.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?;", [name]
    );
    return rows.length > 0;
  }

  async userVersion() {
    const rows = await this.all('PRAGMA user_version;');
    return rows.length ? Number(rows[0].user_version || 0) : 0;
  }

  /**
   * Replay every migration newer than the file's own version.
   *
   * Each statement runs on its own rather than as one batch, because a step
   * that has already been applied has to be skippable without losing the rest.
   * `ALTER TABLE ... ADD COLUMN` on an existing column is the expected case
   * here - a database upgraded once, then upgraded again after a crash - so
   * that specific error is swallowed and anything else is re-thrown.
   */
  async migrate() {
    const from = await this.userVersion();
    for (let v = from + 1; v <= DB_VERSION; v++) {
      const steps = MIGRATIONS[v];
      if (!steps) continue;
      for (const sql of steps) {
        try {
          await this.exec(sql);
        } catch (err) {
          const msg = String((err && err.message) || err).toLowerCase();
          if (msg.includes('duplicate column')) continue;
          throw err;
        }
      }
    }
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

  // `readonly` selects which connection the plugin looks up (it keys them
  // "RW_<db>" / "RO_<db>"), not whether the statement mutates. We hold the
  // read-write connection, so every call has to say readonly: false or the
  // plugin reports "No available connection".
  async all(statement, values = []) {
    const res = await this.plugin.query({
      database: this.db,
      statement,
      values,
      readonly: false
    });
    return res.values || [];
  }

  async seed() {
    for (const [i, a] of seed.ACCOUNTS.entries()) {
      await this.saveAccount({ ...a, sort: i });
    }
    for (const [i, c] of seed.CATS.entries()) {
      await this.saveCategory({ ...c, sort: i });
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
    for (const b of seed.BILLS) await this.saveRecurring(b);
    for (const d of seed.DEBTS) await this.saveDebt(d);
    for (const p of seed.DEBT_PAYMENTS) await this.addDebtPayment(p);
    await this.seedRules();
  }

  async seedRules() {
    for (const [i, r] of seed.RULES.entries()) {
      await this.run(
        'INSERT INTO rules (id, sender, pattern, type, account, cat, label, sort) VALUES (?,?,?,?,?,?,?,?);',
        [r.id, r.sender, r.pattern, r.type, r.account, r.cat, r.label, i]
      );
    }
  }

  insertTxn(t) {
    return this.run(
      'INSERT INTO transactions (id, account, type, cat, amount, currency, rate, date, note, source)'
      + ' VALUES (?,?,?,?,?,?,?,?,?,?);',
      [t.id, t.account, t.type, t.cat, t.amount, t.currency, t.rate, t.date, t.note, t.source]
    );
  }

  async load() {
    const [accounts, categories, txns, items, budgets, goals, bills, debts, debtPayments, rules, settings] =
      await Promise.all([
        this.all('SELECT * FROM accounts ORDER BY sort;'),
        this.all('SELECT * FROM categories ORDER BY sort;'),
        this.all('SELECT * FROM transactions ORDER BY date DESC, rowid DESC;'),
        this.all('SELECT * FROM txn_items ORDER BY sort;'),
        this.all('SELECT id, cat, "limit" AS "limit" FROM budgets;'),
        this.all('SELECT * FROM goals;'),
        this.all('SELECT * FROM bills ORDER BY nextDue;'),
        this.all('SELECT * FROM debts ORDER BY opened DESC;'),
        this.all('SELECT * FROM debt_payments ORDER BY date;'),
        this.all('SELECT * FROM rules ORDER BY sort;'),
        this.all('SELECT * FROM settings;')
      ]);
    const prefs = {};
    settings.forEach(s => { prefs[s.key] = s.value; });
    return {
      accounts, categories, txns, items: indexItems(items),
      budgets, goals, bills, debts, debtPayments, rules, settings: prefs
    };
  }

  addTxn(t) { return this.insertTxn(t); }

  updateTxn(t) {
    return this.run(
      'UPDATE transactions SET account=?, type=?, cat=?, amount=?, currency=?,'
      + ' rate=?, date=?, note=?, source=? WHERE id = ?;',
      [t.account, t.type, t.cat, t.amount, t.currency, t.rate, t.date, t.note, t.source, t.id]
    );
  }

  // Items are cleared explicitly rather than by cascade: the plugin does not
  // turn on PRAGMA foreign_keys, so ON DELETE would silently do nothing and
  // leave orphaned rows behind every deleted transaction.
  async deleteTxn(id) {
    await this.run('DELETE FROM txn_items WHERE txn = ?;', [id]);
    await this.run('DELETE FROM transactions WHERE id = ?;', [id]);
  }

  async setTxnItems(txnId, items) {
    await this.run('DELETE FROM txn_items WHERE txn = ?;', [txnId]);
    for (const [i, it] of (items || []).entries()) {
      await this.run(
        'INSERT INTO txn_items (id, txn, label, qty, amount, sort) VALUES (?,?,?,?,?,?);',
        [it.id, txnId, it.label || null, it.qty || 1, it.amount, i]
      );
    }
  }

  saveCategory(c) {
    return this.run(
      'INSERT INTO categories (id, name, type, color, sort, icon) VALUES (?,?,?,?,?,?)'
      + ' ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type,'
      + ' color=excluded.color, sort=excluded.sort, icon=excluded.icon;',
      [c.id, c.name, c.type, c.color, c.sort || 0, c.icon || null]
    );
  }

  deleteCategory(id) { return this.run('DELETE FROM categories WHERE id = ?;', [id]); }

  saveAccount(a) {
    return this.run(
      'INSERT INTO accounts (id, name, type, currency, initial, sort, icon, color, brand)'
      + ' VALUES (?,?,?,?,?,?,?,?,?)'
      + ' ON CONFLICT(id) DO UPDATE SET name=excluded.name, type=excluded.type,'
      + ' currency=excluded.currency, initial=excluded.initial, sort=excluded.sort,'
      + ' icon=excluded.icon, color=excluded.color, brand=excluded.brand;',
      [a.id, a.name, a.type, a.currency, a.initial || 0, a.sort || 0,
        a.icon || null, a.color || null, a.brand || null]
    );
  }

  deleteAccount(id) { return this.run('DELETE FROM accounts WHERE id = ?;', [id]); }

  saveDebt(d) {
    return this.run(
      'INSERT INTO debts (id, person, direction, principal, currency, account, opened, due, note, settled)'
      + ' VALUES (?,?,?,?,?,?,?,?,?,?)'
      + ' ON CONFLICT(id) DO UPDATE SET person=excluded.person, direction=excluded.direction,'
      + ' principal=excluded.principal, currency=excluded.currency, account=excluded.account,'
      + ' opened=excluded.opened, due=excluded.due, note=excluded.note, settled=excluded.settled;',
      [d.id, d.person, d.direction, d.principal, d.currency || 'BDT', d.account || null,
        d.opened, d.due || null, d.note || null, d.settled ? 1 : 0]
    );
  }

  async deleteDebt(id) {
    await this.run('DELETE FROM debt_payments WHERE debt = ?;', [id]);
    await this.run('DELETE FROM debts WHERE id = ?;', [id]);
  }

  addDebtPayment(p) {
    return this.run(
      'INSERT INTO debt_payments (id, debt, amount, date, txn) VALUES (?,?,?,?,?);',
      [p.id, p.debt, p.amount, p.date, p.txn || null]
    );
  }

  saveRecurring(r) {
    return this.run(
      'INSERT INTO bills (id, name, amount, account, cat, freq, due, paid, nextDue, autoPost, active, variable, lastPosted)'
      + ' VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?)'
      + ' ON CONFLICT(id) DO UPDATE SET name=excluded.name, amount=excluded.amount,'
      + ' account=excluded.account, cat=excluded.cat, freq=excluded.freq, due=excluded.due,'
      + ' nextDue=excluded.nextDue, autoPost=excluded.autoPost, active=excluded.active,'
      + ' variable=excluded.variable, lastPosted=excluded.lastPosted;',
      [r.id, r.name, r.amount, r.account, r.cat, r.freq, r.due,
        r.nextDue || r.due, r.autoPost ? 1 : 0, r.active === 0 ? 0 : 1,
        r.variable ? 1 : 0, r.lastPosted || null]
    );
  }

  deleteRecurring(id) { return this.run('DELETE FROM bills WHERE id = ?;', [id]); }

  setGoal(id, current) {
    return this.run('UPDATE goals SET current = ? WHERE id = ?;', [current, id]);
  }

  setSetting(key, value) {
    return this.run(
      'INSERT INTO settings (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value;',
      [key, String(value)]
    );
  }

  /* ---------------- outbox ---------------- */

  queue(entry) {
    return this.run(
      'INSERT INTO outbox (tbl, key, op, payload, at) VALUES (?,?,?,?,?);',
      [entry.tbl, entry.key, entry.op, JSON.stringify(entry.payload || null), entry.at]
    );
  }

  async outbox(limit = 500) {
    const rows = await this.all('SELECT * FROM outbox ORDER BY seq LIMIT ?;', [limit]);
    return rows.map(r => ({ ...r, payload: r.payload ? JSON.parse(r.payload) : null }));
  }

  async dequeue(upToSeq) {
    await this.run('DELETE FROM outbox WHERE seq <= ?;', [upToSeq]);
  }

  async outboxSize() {
    const rows = await this.all('SELECT COUNT(*) AS n FROM outbox;');
    return rows.length ? Number(rows[0].n) : 0;
  }

  async getSetting(key) {
    const rows = await this.all('SELECT value FROM settings WHERE key = ?;', [key]);
    return rows.length ? rows[0].value : null;
  }

  /** Apply a row pulled from the server. Never re-queues - this came from there. */
  async applyRemote(table, key, row, deleted) {
    if (deleted) return this.deleteLocal(table, key);
    const cols = Object.keys(row);
    const marks = cols.map(() => '?').join(',');
    const sets = cols.map(c => '"' + c + '"=excluded."' + c + '"').join(', ');
    const keyCol = table === 'settings' ? 'key' : 'id';
    await this.run(
      'INSERT INTO "' + table + '" (' + cols.map(c => '"' + c + '"').join(',') + ')'
      + ' VALUES (' + marks + ') ON CONFLICT(' + keyCol + ') DO UPDATE SET ' + sets + ';',
      cols.map(c => row[c])
    );
  }

  deleteLocal(table, key) {
    const keyCol = table === 'settings' ? 'key' : 'id';
    return this.run('DELETE FROM "' + table + '" WHERE ' + keyCol + ' = ?;', [key]);
  }

  /** Every local row, for the first push after signing in. */
  allRows(table) {
    return this.all('SELECT * FROM "' + table + '";');
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
      try {
        this.data = JSON.parse(raw);
        this.migrate();
        return;
      } catch { /* corrupt, reseed */ }
    }
    this.data = {
      _v: DB_VERSION,
      accounts: seed.ACCOUNTS.map(a => ({ ...a })),
      categories: seed.CATS.map(c => ({ ...c })),
      txns: seed.TXNS.map(t => ({ ...t })),
      items: {},
      budgets: seed.BUDGETS.map(b => ({ ...b })),
      goals: seed.GOALS.map(g => ({ ...g })),
      bills: seed.BILLS.map(b => ({ ...b })),
      debts: seed.DEBTS.map(d => ({ ...d })),
      debtPayments: seed.DEBT_PAYMENTS.map(p => ({ ...p })),
      rules: seed.RULES.map(r => ({ ...r })),
      settings: {}
    };
    this.flush();
  }

  /**
   * The JS mirror of MIGRATIONS. Blobs written before versioning have no `_v`
   * at all, so a missing one means 1. Existing rows are filled in rather than
   * replaced - reseeding here would throw away real transactions.
   */
  migrate() {
    const d = this.data;
    const from = d._v || 1;
    if (from >= DB_VERSION) return;

    d.items = d.items || {};
    d.debts = d.debts || [];
    d.debtPayments = d.debtPayments || [];
    d.rules = d.rules || seed.RULES.map(r => ({ ...r }));
    (d.bills || []).forEach(b => {
      if (b.nextDue === undefined) b.nextDue = b.due;
      if (b.autoPost === undefined) b.autoPost = 0;
      if (b.active === undefined) b.active = 1;
      if (b.variable === undefined) b.variable = 0;
      if (b.lastPosted === undefined) b.lastPosted = null;
    });
    // icon / color / brand are left unset where absent; every read path already
    // falls back to a letter or a tint, so there is nothing to backfill.
    d._v = DB_VERSION;
    this.flush();
  }

  flush() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* quota / private mode */ }
  }

  /**
   * Hand the store its own arrays.
   *
   * These used to be returned by reference, which aliased `store.db.accounts`
   * to the driver's own list - so a write that appended in both places (the
   * repo call, then the in-memory patch that avoids a full reload) inserted
   * the row twice. The SQLite driver re-queries and never had this, so the
   * copies are what make the two drivers actually behave the same.
   */
  async load() {
    const d = this.data;
    const copy = (list) => (list || []).map(row => ({ ...row }));
    return {
      accounts: copy(d.accounts),
      categories: copy(d.categories),
      txns: copy(d.txns).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
      items: Object.fromEntries(
        Object.entries(d.items || {}).map(([k, v]) => [k, copy(v)])
      ),
      budgets: copy(d.budgets),
      goals: copy(d.goals),
      bills: copy(d.bills),
      debts: copy(d.debts),
      debtPayments: copy(d.debtPayments),
      rules: copy(d.rules),
      settings: { ...d.settings }
    };
  }

  async addTxn(t) { this.data.txns.unshift({ ...t }); this.flush(); }

  async updateTxn(t) {
    const i = this.data.txns.findIndex(x => x.id === t.id);
    if (i >= 0) this.data.txns[i] = { ...t };
    this.flush();
  }

  async deleteTxn(id) {
    this.data.txns = this.data.txns.filter(t => t.id !== id);
    delete this.data.items[id];
    this.flush();
  }

  async setTxnItems(txnId, items) {
    if (!items || !items.length) delete this.data.items[txnId];
    else this.data.items[txnId] = items.map((it, i) => ({ ...it, txn: txnId, sort: i }));
    this.flush();
  }

  upsert(list, row) {
    const i = list.findIndex(x => x.id === row.id);
    if (i >= 0) list[i] = { ...list[i], ...row };
    else list.push({ ...row });
    this.flush();
  }

  async saveCategory(c) { this.upsert(this.data.categories, c); }
  async deleteCategory(id) {
    this.data.categories = this.data.categories.filter(c => c.id !== id);
    this.flush();
  }

  async saveAccount(a) { this.upsert(this.data.accounts, a); }
  async deleteAccount(id) {
    this.data.accounts = this.data.accounts.filter(a => a.id !== id);
    this.flush();
  }

  async saveDebt(d) { this.upsert(this.data.debts, d); }
  async deleteDebt(id) {
    this.data.debts = this.data.debts.filter(d => d.id !== id);
    this.data.debtPayments = this.data.debtPayments.filter(p => p.debt !== id);
    this.flush();
  }
  async addDebtPayment(p) { this.data.debtPayments.push({ ...p }); this.flush(); }

  async saveRecurring(r) { this.upsert(this.data.bills, r); }
  async deleteRecurring(id) {
    this.data.bills = this.data.bills.filter(b => b.id !== id);
    this.flush();
  }

  async setGoal(id, current) {
    const g = this.data.goals.find(x => x.id === id);
    if (g) g.current = current;
    this.flush();
  }

  async setSetting(key, value) {
    this.data.settings[key] = String(value);
    this.flush();
  }

  /* ---------------- outbox ---------------- */

  async queue(entry) {
    this.data.outbox = this.data.outbox || [];
    this.data._seq = (this.data._seq || 0) + 1;
    this.data.outbox.push({ ...entry, seq: this.data._seq });
    this.flush();
  }

  async outbox(limit = 500) {
    return (this.data.outbox || []).slice(0, limit).map(e => ({ ...e }));
  }

  async dequeue(upToSeq) {
    this.data.outbox = (this.data.outbox || []).filter(e => e.seq > upToSeq);
    this.flush();
  }

  async outboxSize() { return (this.data.outbox || []).length; }

  async getSetting(key) {
    const v = (this.data.settings || {})[key];
    return v === undefined ? null : v;
  }

  async applyRemote(table, key, row, deleted) {
    // Two tables are not plain arrays in this driver: settings is an object,
    // and items is a map keyed by transaction so the ledger can read a row's
    // items without scanning. Both need their own hand here.
    if (table === 'settings') {
      if (deleted) delete this.data.settings[key];
      else this.data.settings[key] = row.value;
      this.flush();
      return;
    }
    if (table === 'txn_items') {
      const items = this.data.items = this.data.items || {};
      for (const txnId of Object.keys(items)) {
        items[txnId] = items[txnId].filter(it => it.id !== key);
        if (!items[txnId].length) delete items[txnId];
      }
      if (!deleted && row.txn) {
        (items[row.txn] = items[row.txn] || []).push({ ...row });
        items[row.txn].sort((a, b) => (a.sort || 0) - (b.sort || 0));
      }
      this.flush();
      return;
    }

    const list = this.listFor(table);
    if (!list) return;
    const i = list.findIndex(r => r.id === key);
    if (deleted) {
      if (i >= 0) list.splice(i, 1);
    } else if (i >= 0) list[i] = { ...list[i], ...row };
    else list.push({ ...row });
    this.flush();
  }

  async deleteLocal(table, key) { return this.applyRemote(table, key, null, true); }

  async allRows(table) {
    if (table === 'settings') {
      return Object.entries(this.data.settings || {}).map(([key, value]) => ({ key, value }));
    }
    if (table === 'txn_items') {
      return Object.values(this.data.items || {}).flat().map(r => ({ ...r }));
    }
    return (this.listFor(table) || []).map(r => ({ ...r }));
  }

  /** Local table name -> the array that holds it. */
  listFor(table) {
    const map = {
      accounts: 'accounts', categories: 'categories', transactions: 'txns',
      budgets: 'budgets', goals: 'goals', bills: 'bills',
      debts: 'debts', debt_payments: 'debtPayments', rules: 'rules'
    };
    const field = map[table];
    return field ? (this.data[field] = this.data[field] || []) : null;
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

  /**
   * Record a write for the sync engine to push later.
   *
   * Every mutation below writes locally first and queues second, so the UI
   * never waits on a network call and an offline write is indistinguishable
   * from an online one. Queuing is best-effort: a failure here costs a row's
   * place in the sync, not the row itself.
   */
  async queue(tbl, op, key, payload) {
    try {
      await this.driver.queue({ tbl, op, key, payload, at: new Date().toISOString() });
      if (this.onQueued) this.onQueued();
    } catch (err) {
      console.error('[paisa] could not queue ' + op + ' on ' + tbl, err);
    }
  }

  outbox(limit) { return this.driver.outbox(limit); }
  dequeue(seq) { return this.driver.dequeue(seq); }
  outboxSize() { return this.driver.outboxSize(); }
  getSetting(key) { return this.driver.getSetting(key); }
  applyRemote(t, k, row, deleted) { return this.driver.applyRemote(t, k, row, deleted); }
  allRows(t) { return this.driver.allRows(t); }

  async addTxn(t) {
    await this.driver.addTxn(t);
    await this.queue('transactions', 'upsert', t.id, t);
  }

  async updateTxn(t) {
    await this.driver.updateTxn(t);
    await this.queue('transactions', 'upsert', t.id, t);
  }

  async deleteTxn(id) {
    // The items go with it, and both deletions have to reach other devices -
    // otherwise the next pull would simply hand the rows back.
    const items = (await this.driver.allRows('txn_items')).filter(i => i.txn === id);
    await this.driver.deleteTxn(id);
    for (const it of items) await this.queue('txn_items', 'delete', it.id, null);
    await this.queue('transactions', 'delete', id, null);
  }

  async setTxnItems(id, items) {
    const before = (await this.driver.allRows('txn_items')).filter(i => i.txn === id);
    await this.driver.setTxnItems(id, items);

    const kept = new Set((items || []).map(i => i.id));
    for (const old of before) {
      if (!kept.has(old.id)) await this.queue('txn_items', 'delete', old.id, null);
    }
    for (const [i, it] of (items || []).entries()) {
      await this.queue('txn_items', 'upsert', it.id, { ...it, txn: id, sort: i });
    }
  }

  async saveCategory(c) {
    await this.driver.saveCategory(c);
    await this.queue('categories', 'upsert', c.id, c);
  }

  async deleteCategory(id) {
    await this.driver.deleteCategory(id);
    await this.queue('categories', 'delete', id, null);
  }

  async saveAccount(a) {
    await this.driver.saveAccount(a);
    await this.queue('accounts', 'upsert', a.id, a);
  }

  async deleteAccount(id) {
    await this.driver.deleteAccount(id);
    await this.queue('accounts', 'delete', id, null);
  }

  async saveDebt(d) {
    await this.driver.saveDebt(d);
    await this.queue('debts', 'upsert', d.id, d);
  }

  async deleteDebt(id) {
    const pays = (await this.driver.allRows('debt_payments')).filter(p => p.debt === id);
    await this.driver.deleteDebt(id);
    for (const p of pays) await this.queue('debt_payments', 'delete', p.id, null);
    await this.queue('debts', 'delete', id, null);
  }

  async addDebtPayment(p) {
    await this.driver.addDebtPayment(p);
    await this.queue('debt_payments', 'upsert', p.id, p);
  }

  async saveRecurring(r) {
    await this.driver.saveRecurring(r);
    await this.queue('bills', 'upsert', r.id, r);
  }

  async deleteRecurring(id) {
    await this.driver.deleteRecurring(id);
    await this.queue('bills', 'delete', id, null);
  }

  async setGoal(id, current) {
    await this.driver.setGoal(id, current);
    const goal = (await this.driver.allRows('goals')).find(g => g.id === id);
    if (goal) await this.queue('goals', 'upsert', id, goal);
  }

  async setSetting(k, v) {
    await this.driver.setSetting(k, v);
    // Sync bookkeeping is per-device and must never round-trip.
    if (!String(k).startsWith('sync.')) {
      await this.queue('settings', 'upsert', k, { key: k, value: String(v) });
    }
  }
}

export const repo = new Repo();
