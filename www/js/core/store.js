// Application state and every derived number the screens read.
//
// One store, one render pass. Screens never compute money themselves - they ask
// the store, so conversion and sign rules live in exactly one place.
//
// A change announces which parts of the shell it can affect, so the shell can
// rebuild only those. See KEY_REGIONS below.

import { repo } from '../data/repo.js';
import { sync } from '../data/sync.js';
import { RATES, TYPE_LABEL } from '../data/seed.js';
import * as calc from './calc.js';

const SCREEN_ORDER = [
  'home', 'txns', 'budgets', 'reports', 'settings',
  'categories', 'accounts', 'scheduled'
];

// Reports range strip. `All` is resolved from the oldest transaction on hand.
const RANGE_DAYS = { '1w': 7, '1m': 30, '3m': 90, '6m': 180, '1y': 365, '2y': 730 };

const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

const asDate = (s) => new Date(s + 'T00:00:00');

// Local calendar date, not UTC. `toISOString` would roll the day over at 06:00
// in Dhaka (UTC+6), so an evening transaction would file itself under tomorrow.
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

const daysBetween = (a, b) => Math.round((asDate(b) - asDate(a)) / DAY);
const shiftDays = (s, n) => iso(new Date(asDate(s).getTime() + n * DAY));

/**
 * Move a date on by one period.
 *
 * `anchorDay` is the day of the month the rule was originally set to, and it
 * is what stops a clamp becoming permanent: rent due on the 31st has to land
 * on the 28th in February and then go back to the 31st in March. Rolling from
 * the clamped date alone would quietly move the rule to the 28th for good.
 */
export function rollDate(date, freq, anchorDay) {
  const d = asDate(date);
  const step = String(freq || 'monthly').toLowerCase();

  if (step === 'weekly') return shiftDays(date, 7);
  if (step === 'daily') return shiftDays(date, 1);

  const months = step === 'yearly' ? 12 : step === 'quarterly' ? 3 : 1;
  const day = anchorDay || d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return iso(target);
}

/* ------------------------------------------------------------------ *
 * Render regions
 * ------------------------------------------------------------------ */

const ALL = ['header', 'body', 'sheet', 'toast', 'nav'];

// Which parts of the shell a given piece of UI state can affect. Anything not
// listed falls back to a full pass, so adding state is safe by default and
// narrowing it is the deliberate act.
const KEY_REGIONS = {
  screen: ALL,
  direction: ALL,
  dark: ALL,

  toast: ['toast'],
  sheet: ['sheet'],

  // The keypad is the hottest control in the app. These three drive only the
  // amount line and the save button, which the shell patches in place.
  entryAmount: ['amount'],
  entryExpr: ['amount'],
  entryValue: ['amount'],

  entryType: ['sheet'],
  entryCat: ['sheet'],
  entryAccount: ['sheet'],
  entryGroup: ['sheet'],
  entryCurrency: ['sheet'],
  entryRate: ['sheet'],
  entryDate: ['sheet'],
  entryNote: ['sheet'],
  entryItems: ['sheet'],
  entryFocusItem: ['sheet'],
  entryId: ['sheet'],
  confirmDelete: ['sheet'],
  editEntity: ['sheet'],
  editDebt: ['sheet'],
  editRecurring: ['sheet'],
  syncMode: ['sheet'],
  syncEmail: ['sheet'],
  syncPassword: ['sheet'],
  syncError: ['sheet'],
  syncBusy: ['sheet'],
  iconQuery: ['sheet'],
  iconGroup: ['sheet'],
  smsText: ['sheet'],
  smsSender: ['sheet'],
  parse: ['sheet'],

  filter: ['body'],
  query: ['body'],
  range: ['body'],
  reportTab: ['body'],
  budgetSeg: ['header', 'body']
};

function regionsFor(patch) {
  const out = new Set();
  for (const key in patch) {
    const r = KEY_REGIONS[key];
    if (!r) return new Set(ALL);          // unknown key: rebuild everything
    r.forEach(x => out.add(x));
  }
  return out;
}

class Store {
  constructor() {
    this.ui = {
      dark: false,
      screen: 'home',
      direction: 1,
      budgetSeg: 'budgets',
      reportTab: 'overview',
      range: 'All',
      filter: 'all',
      query: '',
      sheet: null,

      entryId: null,          // set = editing an existing transaction
      entryType: 'expense',
      entryAmount: '',        // digits being typed
      entryExpr: [],          // completed calculator tokens
      entryValue: 0,          // last good value of the expression
      entryAccount: 'a1',
      entryGroup: null,       // expanded account-type group, null = collapsed
      entryCat: 'c1',
      entryCurrency: 'BDT',
      entryRate: '122',
      entryNote: '',
      entryDate: null,        // filled from `today` on open
      entryItems: [],
      entryFocusItem: null,   // which line item the keypad is driving
      entrySource: 'manual',
      confirmDelete: false,

      editEntity: null,       // category / account editor payload
      editDebt: null,
      editRecurring: null,
      iconQuery: '',
      iconGroup: null,

      syncMode: 'signin',
      syncEmail: '',
      syncPassword: '',
      syncError: null,
      syncBusy: false,

      smsText: '',
      smsSender: null,
      parse: null,
      smsLive: false,
      toast: null
    };
    this.db = {
      accounts: [], categories: [], txns: [], items: {},
      budgets: [], goals: [], bills: [], debts: [], debtPayments: [],
      rules: [], settings: {}
    };
    this.listeners = new Set();

    this.dbRev = 0;
    this._memo = new Map();
    this._worth = null;
  }

  /* ---------------- lifecycle ---------------- */

  async init() {
    this.db = await repo.init();
    const stored = this.db.settings || {};
    if (stored.dark !== undefined) this.ui.dark = stored.dark === 'true';
    else this.ui.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored.smsLive !== undefined) this.ui.smsLive = stored.smsLive === 'true';
    this.ui.entryDate = this.today;
    this.applyTheme();
    await this.catchUpRecurring();
    this.wireSync();
  }

  /**
   * Sync runs beside the app, never in front of it.
   *
   * Nothing here is awaited during boot: the ledger is already on screen from
   * the local database, and a slow or dead connection must not delay that. A
   * completed sync reloads the local copy so pulled rows appear.
   */
  wireSync() {
    sync.onChange(() => {
      // The Settings row and the sync sheet both read this status.
      if (this.ui.screen === 'settings' || this.ui.sheet === 'sync') {
        this.emit(['body', 'sheet']);
      }
    });

    // A write queues an outbox entry; push it shortly after, so a burst of
    // edits becomes one round trip rather than one per keystroke.
    repo.onQueued = () => {
      if (!sync.enabled) return;
      clearTimeout(this._syncTimer);
      this._syncTimer = setTimeout(() => this.syncNow(), 2500);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.syncNow());
    }
    if (sync.enabled) this.syncNow();
  }

  async syncNow() {
    const result = await sync.run();
    // Only a pull that actually changed something is worth a reload.
    if (result && result.pulled) await this.reload();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  emit(regions) {
    const r = regions instanceof Set ? regions : new Set(regions || ALL);
    this.listeners.forEach(fn => fn(this, r));
  }

  /** Merge UI state and re-render. Pass `silent` for input echoes. */
  set(patch, silent = false) {
    const regions = regionsFor(patch);
    Object.assign(this.ui, patch);
    if (!silent) this.emit(regions);
  }

  /**
   * Anything that writes to `db` calls this. Bumping the revision drops every
   * cached balance, because the ledger they were derived from just moved.
   */
  touch() {
    this.dbRev++;
    this._memo.clear();
    this._worth = null;
  }

  async reload() {
    this.db = await repo.load();
    this.touch();
    this.emit(['header', 'body', 'sheet']);
  }

  applyTheme() {
    document.documentElement.dataset.dark = this.ui.dark ? '1' : '0';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', this.ui.dark ? '#0f100e' : '#ffffff');
  }

  /* ---------------- calendar ---------------- */

  /** Today, on the device's own calendar. */
  get today() { return iso(new Date()); }

  daysInMonth() {
    const d = asDate(this.today);
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  }

  /** Days elapsed in the current month, today included. */
  daysElapsed() { return asDate(this.today).getDate(); }

  daysLeft() { return this.daysInMonth() - this.daysElapsed(); }

  /* ---------------- lookups ---------------- */

  acct(id) { return this.db.accounts.find(a => a.id === id); }
  cat(id) { return this.db.categories.find(c => c.id === id); }

  /** Line items of a transaction, or an empty list. */
  itemsFor(id) { return this.db.items[id] || []; }

  /** Transaction amount in the currency of its own account. */
  conv(t) {
    const a = this.acct(t.account);
    if (!a) return t.amount;
    return t.currency === a.currency ? t.amount : t.amount * (t.rate || 1);
  }

  /** Transaction amount in the home currency (BDT). */
  homeVal(t) {
    const a = this.acct(t.account);
    return this.conv(t) * (RATES[a ? a.currency : 'BDT'] || 1);
  }

  balance(id) { return this.balanceAsOf(id, this.today); }

  /**
   * Closing balance on `date`, in the currency of the account.
   *
   * Memoised on the ledger revision: Home draws a sparkline per account, which
   * is nine of these each, and every one is a full scan of the transaction
   * list. Without the cache a single render is around a hundred scans.
   */
  balanceAsOf(id, date) {
    const key = id + '|' + date;
    const hit = this._memo.get(key);
    if (hit !== undefined) return hit;

    const a = this.acct(id);
    const value = !a ? 0 : this.db.txns
      .filter(t => t.account === id && t.date <= date)
      .reduce((s, t) => s + (t.type === 'income' ? this.conv(t) : -this.conv(t)), a.initial);

    this._memo.set(key, value);
    return value;
  }

  netWorth() { return this.worth().net; }

  /** Sum of absolute balances - the denominator for "share of total". */
  grossWorth() { return this.worth().gross; }

  worth() {
    if (this._worth) return this._worth;
    let net = 0, gross = 0;
    for (const a of this.db.accounts) {
      const home = this.balance(a.id) * (RATES[a.currency] || 1);
      net += home;
      gross += Math.abs(home);
    }
    this._worth = { net, gross };
    return this._worth;
  }

  monthTxns(month = this.today.slice(0, 7)) {
    return this.db.txns.filter(t => t.date.slice(0, 7) === month);
  }

  monthTotals(month) {
    const rows = this.monthTxns(month);
    const income = rows.filter(t => t.type === 'income').reduce((s, t) => s + this.homeVal(t), 0);
    const expense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + this.homeVal(t), 0);
    return { income, expense, net: income - expense };
  }

  /**
   * Home-currency spend per category for the current month.
   *
   * Debt movements are skipped. Lending someone 5,000 moves money out of an
   * account but is not spending, and letting it land in a category would
   * quietly blow the budget for that month.
   */
  spentByCat(month) {
    const out = {};
    this.monthTxns(month)
      .filter(t => t.type === 'expense' && t.source !== 'debt')
      .forEach(t => { out[t.cat] = (out[t.cat] || 0) + this.homeVal(t); });
    return out;
  }

  /* ---------------- account history ---------------- */

  /**
   * Balance samples across a trailing window, oldest first. Real history off
   * the ledger: an account with no movement draws a flat line, rather than the
   * invented noise the prototype used to stand in for data it did not have.
   */
  accountHistory(id, days = 30, samples = 9) {
    const out = [];
    for (let i = 0; i < samples; i++) {
      const back = Math.round((days * (samples - 1 - i)) / (samples - 1));
      out.push(this.balanceAsOf(id, shiftDays(this.today, -back)));
    }
    return out;
  }

  /**
   * Trailing change for an account. `up` means the balance moved in favour of
   * the owner - on a credit card that is the debt getting smaller.
   */
  accountDelta(id, days = 30) {
    const now = this.balance(id);
    const then = this.balanceAsOf(id, shiftDays(this.today, -days));
    const change = now - then;
    const base = Math.abs(then);
    const percent = base > 0 ? (change / base) * 100 : (change !== 0 ? 100 : 0);
    return { up: change >= 0, change, percent };
  }

  /* ---------------- reports ---------------- */

  /** Oldest transaction date, or today when the ledger is empty. */
  firstTxnDate() {
    return this.db.txns.reduce((min, t) => (t.date < min ? t.date : min), this.today);
  }

  /**
   * Money out per bucket across the selected range, oldest first. Long ranges
   * are bucketed rather than drawn a day at a time - 730 bars would be a third
   * of a pixel each, which is a texture, not a chart.
   */
  spendSeries(range = this.ui.range) {
    const today = this.today;
    const days = range === 'All'
      ? Math.max(7, daysBetween(this.firstTxnDate(), today) + 1)
      : RANGE_DAYS[range] || 30;
    const count = Math.max(6, Math.min(40, days));
    const per = days / count;

    const buckets = new Array(count).fill(0);
    for (const t of this.db.txns) {
      if (t.type !== 'expense') continue;
      const age = daysBetween(t.date, today);
      if (age < 0 || age >= days) continue;
      const idx = count - 1 - Math.floor(age / per);
      if (idx >= 0 && idx < count) buckets[idx] += this.homeVal(t);
    }
    return buckets;
  }

  accountCards() {
    const gross = this.grossWorth();
    return this.db.accounts.map(a => {
      const b = this.balance(a.id);
      const home = b * (RATES[a.currency] || 1);
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        typeLabel: TYPE_LABEL[a.type] || a.type,
        // The visual identity travels with the projection. Without these,
        // accountChip() falls back to matching the account *name* against the
        // brand regexes - which is the guess this was all meant to replace.
        icon: a.icon,
        color: a.color,
        brand: a.brand,
        balance: b,
        currency: a.currency,
        homeValue: home,
        share: gross > 0 ? (Math.abs(home) / gross) * 100 : 0
      };
    });
  }

  /** Activity list after the filter chips and the search box. */
  filteredTxns() {
    const { filter, query } = this.ui;
    let list = this.db.txns.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    if (filter !== 'all') {
      list = list.filter(t => (filter === 'sms' ? t.source === 'sms' : t.type === filter));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(t => {
        const c = this.cat(t.cat), a = this.acct(t.account);
        const hay = [t.note, c && c.name, a && a.name].filter(Boolean).join(' ').toLowerCase();
        return hay.indexOf(q) >= 0;
      });
    }
    return list;
  }

  /* ---------------- account groups ---------------- */

  /**
   * Accounts bucketed by type, in a fixed order, skipping types with nothing
   * in them. The Add sheet shows one chip per group rather than one per
   * account, so nine accounts do not push the card ones off-screen.
   */
  accountGroups() {
    const order = ['cash', 'bank', 'mfs', 'card'];
    const seen = new Map();
    for (const a of this.db.accounts) {
      if (!seen.has(a.type)) seen.set(a.type, []);
      seen.get(a.type).push(a);
    }
    const rest = [...seen.keys()].filter(t => !order.includes(t)).sort();
    return [...order, ...rest]
      .filter(t => seen.has(t))
      .map(type => ({ type, label: TYPE_LABEL[type] || type, accounts: seen.get(type) }));
  }

  /* ---------------- navigation ---------------- */

  go(screen) {
    if (screen === this.ui.screen) return;
    const from = SCREEN_ORDER.indexOf(this.ui.screen);
    const to = SCREEN_ORDER.indexOf(screen);
    this.set({ screen, direction: to >= from ? 1 : -1 });
  }

  say(msg) {
    clearTimeout(this._toastTimer);
    this.set({ toast: msg });
    this._toastTimer = setTimeout(() => this.set({ toast: null }), 2200);
  }

  /* ---------------- transactions ---------------- */

  async addTxn(t, items) {
    await repo.addTxn(t);
    if (items && items.length) await repo.setTxnItems(t.id, items);
    this.db.txns.unshift(t);
    if (items && items.length) this.db.items[t.id] = items.map((it, i) => ({ ...it, txn: t.id, sort: i }));
    this.touch();
    this.emit(['header', 'body', 'sheet']);
  }

  /** Open the add sheet on an existing transaction. */
  editTxn(t) {
    const items = this.itemsFor(t.id).map(it => ({ ...it }));
    this.set({
      sheet: 'add',
      entryId: t.id,
      entryType: t.type,
      entryAmount: calc.trim(t.amount),
      entryExpr: [],
      entryValue: t.amount,
      entryAccount: t.account,
      entryGroup: null,
      entryCat: t.cat,
      entryCurrency: t.currency,
      entryRate: String(t.rate || 1),
      entryNote: t.note || '',
      entryDate: t.date,
      entrySource: t.source || 'manual',
      entryItems: items,
      entryFocusItem: null,
      confirmDelete: false
    });
  }

  /** Reset the draft back to a blank expense. */
  resetEntry(patch) {
    return {
      entryId: null,
      entryAmount: '',
      entryExpr: [],
      entryValue: 0,
      entryNote: '',
      entryDate: this.today,
      entryItems: [],
      entryFocusItem: null,
      entrySource: 'manual',
      entryGroup: null,
      confirmDelete: false,
      ...patch
    };
  }

  /** Value the sheet would save: the line items if there are any, else the keypad. */
  entryTotal() {
    if (this.ui.entryItems.length) {
      return this.ui.entryItems.reduce((s, it) => s + (Number(it.amount) || 0), 0);
    }
    const v = calc.fold(this.ui.entryExpr, this.ui.entryAmount);
    return v === null ? this.ui.entryValue : v;
  }

  async saveEntry() {
    const amount = this.entryTotal();
    if (!amount) { this.say('Enter an amount first'); return; }

    const account = this.acct(this.ui.entryAccount);
    const needsRate = this.ui.entryCurrency !== account.currency;
    const items = this.ui.entryItems.filter(it => Number(it.amount) > 0);

    const t = {
      id: this.ui.entryId || 'm' + Date.now(),
      account: this.ui.entryAccount,
      type: this.ui.entryType,
      cat: this.ui.entryCat,
      amount,
      currency: this.ui.entryCurrency,
      rate: needsRate ? parseFloat(this.ui.entryRate || '1') : 1,
      date: this.ui.entryDate || this.today,
      note: this.ui.entryNote || this.cat(this.ui.entryCat).name,
      source: this.ui.entrySource || 'manual'
    };

    const editing = !!this.ui.entryId;
    if (editing) await this.updateTxn(t, items);
    else await this.addTxn(t, items);

    const kind = this.ui.entryType === 'income' ? 'Income' : 'Expense';
    const cur = this.ui.entryCurrency;
    this.set(this.resetEntry({ sheet: null }));
    this.say(kind + (editing ? ' updated · ' : ' saved · ')
      + amount.toLocaleString('en-US') + ' ' + cur);
  }

  async updateTxn(t, items) {
    await repo.updateTxn(t);
    await repo.setTxnItems(t.id, items || []);

    const i = this.db.txns.findIndex(x => x.id === t.id);
    if (i >= 0) this.db.txns[i] = t;
    // The date may have moved, and the list is read in date order everywhere.
    this.db.txns.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    if (items && items.length) this.db.items[t.id] = items.map((it, n) => ({ ...it, txn: t.id, sort: n }));
    else delete this.db.items[t.id];

    this.touch();
    this.emit(['header', 'body', 'sheet']);
  }

  async deleteTxn(id) {
    await repo.deleteTxn(id);
    this.db.txns = this.db.txns.filter(t => t.id !== id);
    delete this.db.items[id];
    this.touch();
    this.set(this.resetEntry({ sheet: null }));
    this.say('Transaction deleted');
  }

  /* ---------------- line items ---------------- */

  addItem() {
    const id = 'li' + Date.now() + Math.random().toString(36).slice(2, 6);
    const items = this.ui.entryItems.concat({ id, label: '', qty: 1, amount: 0 });
    this.set({ entryItems: items, entryFocusItem: id, entryAmount: '', entryExpr: [] });
  }

  patchItem(id, patch, silent = false) {
    const items = this.ui.entryItems.map(it => (it.id === id ? { ...it, ...patch } : it));
    this.set({ entryItems: items }, silent);
  }

  removeItem(id) {
    const items = this.ui.entryItems.filter(it => it.id !== id);
    this.set({
      entryItems: items,
      entryFocusItem: this.ui.entryFocusItem === id ? null : this.ui.entryFocusItem,
      entryAmount: '',
      entryExpr: []
    });
  }

  /* ---------------- categories and accounts ---------------- */

  async saveCategory(c) {
    const existing = this.cat(c.id);
    const row = { sort: existing ? existing.sort : this.db.categories.length, ...c };
    await repo.saveCategory(row);
    if (existing) Object.assign(existing, row);
    else this.db.categories.push(row);
    this.touch();
    this.emit(['header', 'body', 'sheet']);
  }

  async deleteCategory(id) {
    // Deleting a category out from under its transactions would leave rows
    // pointing at nothing, and every screen resolves the name through `cat()`.
    const used = this.db.txns.filter(t => t.cat === id).length;
    if (used) { this.say('In use by ' + used + ' transaction' + (used > 1 ? 's' : '')); return false; }
    if (this.db.categories.length <= 1) { this.say('Keep at least one category'); return false; }

    await repo.deleteCategory(id);
    this.db.categories = this.db.categories.filter(c => c.id !== id);
    this.touch();
    this.emit(['header', 'body', 'sheet']);
    this.say('Category deleted');
    return true;
  }

  async saveAccount(a) {
    const existing = this.acct(a.id);
    const row = { sort: existing ? existing.sort : this.db.accounts.length, ...a };
    await repo.saveAccount(row);
    if (existing) Object.assign(existing, row);
    else this.db.accounts.push(row);
    this.touch();
    this.emit(['header', 'body', 'sheet']);
  }

  async deleteAccount(id) {
    const used = this.db.txns.filter(t => t.account === id).length;
    if (used) { this.say('In use by ' + used + ' transaction' + (used > 1 ? 's' : '')); return false; }
    if (this.db.accounts.length <= 1) { this.say('Keep at least one account'); return false; }

    await repo.deleteAccount(id);
    this.db.accounts = this.db.accounts.filter(a => a.id !== id);
    if (this.ui.entryAccount === id) this.ui.entryAccount = this.db.accounts[0].id;
    this.touch();
    this.emit(['header', 'body', 'sheet']);
    this.say('Account deleted');
    return true;
  }

  /* ---------------- debts ---------------- */

  /** What is still outstanding on a debt, in its own currency. */
  debtBalance(d) {
    const paid = this.db.debtPayments
      .filter(p => p.debt === d.id)
      .reduce((s, p) => s + p.amount, 0);
    return Math.max(0, d.principal - paid);
  }

  openDebts() { return this.db.debts.filter(d => !d.settled && this.debtBalance(d) > 0); }

  debtTotals() {
    let owedToMe = 0, iOwe = 0;
    for (const d of this.openDebts()) {
      const home = this.debtBalance(d) * (RATES[d.currency] || 1);
      if (d.direction === 'owed_to_me') owedToMe += home;
      else iOwe += home;
    }
    return { owedToMe, iOwe, net: owedToMe - iOwe };
  }

  async saveDebt(d) {
    const existing = this.db.debts.find(x => x.id === d.id);
    await repo.saveDebt(d);
    if (existing) Object.assign(existing, d);
    else this.db.debts.unshift({ ...d });
    this.touch();
    this.emit(['header', 'body', 'sheet']);
  }

  async deleteDebt(id) {
    await repo.deleteDebt(id);
    this.db.debts = this.db.debts.filter(d => d.id !== id);
    this.db.debtPayments = this.db.debtPayments.filter(p => p.debt !== id);
    this.touch();
    this.emit(['header', 'body', 'sheet']);
    this.say('Debt removed');
  }

  /**
   * Record money moving against a debt, and the transaction that carries it.
   *
   * The sign is the mirror of the direction: money leaves the account when you
   * lend it out or repay what you borrowed, and arrives when you are repaid or
   * when you borrow. Both sides are marked `source: 'debt'` so account
   * balances stay right while the amount stays out of the category reports.
   */
  async settleDebt(debt, amount, accountId) {
    if (!amount || amount <= 0) { this.say('Enter an amount first'); return; }
    const outstanding = this.debtBalance(debt);
    const value = Math.min(amount, outstanding);
    const account = accountId || debt.account || this.db.accounts[0].id;
    const stamp = Date.now();

    const txn = {
      id: 'dt' + stamp,
      account,
      type: debt.direction === 'owed_to_me' ? 'income' : 'expense',
      cat: this.db.categories[0].id,
      amount: value,
      currency: debt.currency || 'BDT',
      rate: 1,
      date: this.today,
      note: (debt.direction === 'owed_to_me' ? 'Repaid by ' : 'Repaid to ') + debt.person,
      source: 'debt'
    };
    await this.addTxn(txn);

    const payment = { id: 'dp' + stamp, debt: debt.id, amount: value, date: this.today, txn: txn.id };
    await repo.addDebtPayment(payment);
    this.db.debtPayments.push(payment);

    if (this.debtBalance(debt) <= 0) {
      const settled = { ...debt, settled: 1 };
      await repo.saveDebt(settled);
      Object.assign(debt, settled);
    }

    this.touch();
    this.emit(['header', 'body', 'sheet']);
    this.say('Recorded · ' + value.toLocaleString('en-US'));
  }

  /* ---------------- recurring ---------------- */

  activeRecurring() { return this.db.bills.filter(b => b.active !== 0); }

  /** Rules worth showing on Home: due within the week, or already overdue. */
  dueSoon(days = 7) {
    const limit = shiftDays(this.today, days);
    return this.activeRecurring()
      .filter(b => (b.nextDue || b.due) <= limit)
      .sort((a, b) => ((a.nextDue || a.due) < (b.nextDue || b.due) ? -1 : 1));
  }

  isOverdue(b) { return (b.nextDue || b.due) <= this.today; }

  /**
   * Post one occurrence of a rule and move it on to the next.
   *
   * Rules are never deleted by paying them - that is what made the old
   * `payBill` a one-shot. `amountOverride` is how a variable rule (electricity,
   * gas) records what the meter actually said.
   */
  async postRecurring(rule, amountOverride) {
    const amount = amountOverride === undefined ? rule.amount : amountOverride;
    const due = rule.nextDue || rule.due;

    await this.addTxn({
      id: 'rb' + Date.now(),
      account: rule.account,
      type: 'expense',
      cat: rule.cat,
      amount,
      currency: 'BDT',
      rate: 1,
      date: due,
      note: rule.name,
      source: 'manual'
    });

    // The anchor is the day the rule was set to, not the day this occurrence
    // happened to land on after a month-end clamp.
    const anchor = Number((rule.due || due).slice(8, 10));
    const next = { ...rule, nextDue: rollDate(due, rule.freq, anchor), lastPosted: due };
    await repo.saveRecurring(next);
    Object.assign(rule, next);
    return next;
  }

  /**
   * Post everything that fell due while the app was closed.
   *
   * Only rules that opted into auto-posting, and never a variable one - the
   * whole point of `variable` is that the amount is not known in advance. The
   * loop walks forward one period at a time so a phone left off for three
   * months files three separate months rather than one lump; the cap is there
   * so a corrupt date cannot spin it forever.
   */
  async catchUpRecurring() {
    let posted = 0;
    for (const rule of this.activeRecurring()) {
      if (!rule.autoPost || rule.variable) continue;
      let guard = 0;
      while (this.isOverdue(rule) && guard++ < 24) {
        await this.postRecurring(rule);
        posted++;
      }
    }
    if (posted) {
      this.say(posted + ' scheduled ' + (posted > 1 ? 'payments' : 'payment') + ' posted');
    }
    return posted;
  }

  async saveRecurring(r) {
    const existing = this.db.bills.find(b => b.id === r.id);
    await repo.saveRecurring(r);
    if (existing) Object.assign(existing, r);
    else this.db.bills.push({ ...r });
    this.touch();
    this.emit(['header', 'body', 'sheet']);
  }

  async deleteRecurring(id) {
    await repo.deleteRecurring(id);
    this.db.bills = this.db.bills.filter(b => b.id !== id);
    this.touch();
    this.emit(['header', 'body', 'sheet']);
    this.say('Subscription removed');
  }

  /* ---------------- goals and settings ---------------- */

  async addToGoal(goal, amount) {
    const next = Math.min(goal.target, goal.current + amount);
    await repo.setGoal(goal.id, next);
    goal.current = next;
    this.say('Added ' + amount.toLocaleString('en-US') + ' to ' + goal.name);
  }

  async toggleDark() {
    this.ui.dark = !this.ui.dark;
    this.applyTheme();
    await repo.setSetting('dark', this.ui.dark);
    this.emit(ALL);
  }

  async toggleSmsLive() {
    this.ui.smsLive = !this.ui.smsLive;
    await repo.setSetting('smsLive', this.ui.smsLive);
    this.emit(['body']);
  }

  /* ---------------- keypad ---------------- */

  /**
   * One keypress. Digits and operators both land here; which number they edit
   * depends on whether a line item has the keypad.
   */
  pressKey(label) {
    const { entryExpr: expr, entryAmount: buf } = this.ui;

    let next;
    if (label === 'del') next = calc.pressDelete(expr, buf);
    else if (label === '=') next = calc.pressEquals(expr, buf);
    else if (label === 'clear') next = calc.clear();
    else if (calc.OPS.includes(label)) next = calc.pressOp(expr, buf, label);
    else next = calc.pressDigit(expr, buf, label);

    const value = calc.fold(next.expr, next.buf);
    const patch = {
      entryExpr: next.expr,
      entryAmount: next.buf,
      // A division by zero holds the last good value rather than painting NaN
      // over a number that is still being typed.
      entryValue: value === null ? this.ui.entryValue : value
    };

    // When a line item has the keypad, the amount belongs to that row and the
    // transaction total is the sum, so both have to move together.
    if (this.ui.entryFocusItem) {
      const total = value === null ? this.ui.entryValue : value;
      this.patchItem(this.ui.entryFocusItem, { amount: total }, true);
      patch.entryItems = this.ui.entryItems;
      this.set(patch);
      return;
    }
    this.set(patch);
  }
}

export const store = new Store();
