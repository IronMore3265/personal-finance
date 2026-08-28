// Application state and every derived number the screens read.
//
// One store, one render pass. Screens never compute money themselves - they ask
// the store, so conversion and sign rules live in exactly one place.

import { repo } from '../data/repo.js';
import { RATES, TODAY, TYPE_LABEL } from '../data/seed.js';

const SCREEN_ORDER = ['home', 'txns', 'budgets', 'reports', 'settings'];

class Store {
  constructor() {
    this.ui = {
      dark: false,
      screen: 'home',
      direction: 1,
      budgetSeg: 'budgets',
      filter: 'all',
      query: '',
      sheet: null,
      entryType: 'expense',
      entryAmount: '',
      entryAccount: 'a1',
      entryCat: 'c1',
      entryCurrency: 'BDT',
      entryRate: '122',
      entryNote: '',
      smsText: '',
      parse: null,
      smsLive: false,
      toast: null
    };
    this.db = {
      accounts: [], categories: [], txns: [],
      budgets: [], goals: [], bills: [], rules: [], settings: {}
    };
    this.listeners = new Set();
  }

  /* ---------------- lifecycle ---------------- */

  async init() {
    this.db = await repo.init();
    const stored = this.db.settings || {};
    if (stored.dark !== undefined) this.ui.dark = stored.dark === 'true';
    else this.ui.dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (stored.smsLive !== undefined) this.ui.smsLive = stored.smsLive === 'true';
    this.applyTheme();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.listeners.forEach(fn => fn(this)); }

  /** Merge UI state and re-render. Pass `silent` for input echoes. */
  set(patch, silent = false) {
    Object.assign(this.ui, patch);
    if (!silent) this.emit();
  }

  async reload() {
    this.db = await repo.load();
    this.emit();
  }

  applyTheme() {
    document.documentElement.dataset.dark = this.ui.dark ? '1' : '0';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', this.ui.dark ? '#0e0f0d' : '#f4f4f2');
  }

  /* ---------------- lookups ---------------- */

  acct(id) { return this.db.accounts.find(a => a.id === id); }
  cat(id) { return this.db.categories.find(c => c.id === id); }

  /** Transaction amount in its account's own currency. */
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

  balance(id) {
    const a = this.acct(id);
    if (!a) return 0;
    return this.db.txns
      .filter(t => t.account === id)
      .reduce((s, t) => s + (t.type === 'income' ? this.conv(t) : -this.conv(t)), a.initial);
  }

  netWorth() {
    return this.db.accounts.reduce(
      (s, a) => s + this.balance(a.id) * (RATES[a.currency] || 1), 0
    );
  }

  monthTxns(month = TODAY.slice(0, 7)) {
    return this.db.txns.filter(t => t.date.slice(0, 7) === month);
  }

  monthTotals(month) {
    const rows = this.monthTxns(month);
    const income = rows.filter(t => t.type === 'income').reduce((s, t) => s + this.homeVal(t), 0);
    const expense = rows.filter(t => t.type === 'expense').reduce((s, t) => s + this.homeVal(t), 0);
    return { income, expense, net: income - expense };
  }

  /** Home-currency spend per category for the current month. */
  spentByCat(month) {
    const out = {};
    this.monthTxns(month)
      .filter(t => t.type === 'expense')
      .forEach(t => { out[t.cat] = (out[t.cat] || 0) + this.homeVal(t); });
    return out;
  }

  accountCards() {
    return this.db.accounts.map(a => {
      const b = this.balance(a.id);
      return {
        id: a.id,
        name: a.name,
        typeLabel: TYPE_LABEL[a.type] || a.type.toUpperCase(),
        balanceText: b,
        currency: a.currency,
        homeValue: b * (RATES[a.currency] || 1)
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

  /* ---------------- mutations ---------------- */

  async addTxn(t) {
    await repo.addTxn(t);
    this.db.txns.unshift(t);
    this.emit();
  }

  async saveEntry() {
    const amount = parseFloat(this.ui.entryAmount || '0');
    if (!amount) { this.say('Enter an amount first'); return; }

    const account = this.acct(this.ui.entryAccount);
    const needsRate = this.ui.entryCurrency !== account.currency;

    await this.addTxn({
      id: 'm' + Date.now(),
      account: this.ui.entryAccount,
      type: this.ui.entryType,
      cat: this.ui.entryCat,
      amount,
      currency: this.ui.entryCurrency,
      rate: needsRate ? parseFloat(this.ui.entryRate || '1') : 1,
      date: TODAY,
      note: this.ui.entryNote || this.cat(this.ui.entryCat).name,
      source: 'manual'
    });

    const kind = this.ui.entryType === 'income' ? 'Income' : 'Expense';
    const cur = this.ui.entryCurrency;
    this.set({ sheet: null, entryAmount: '', entryNote: '' });
    this.say(kind + ' saved · ' + amount.toLocaleString('en-US') + ' ' + cur);
  }

  /** Marking a bill paid drafts the transaction and confirms it in one step. */
  async payBill(bill) {
    await this.addTxn({
      id: 'rb' + Date.now(),
      account: bill.account,
      type: 'expense',
      cat: bill.cat,
      amount: bill.amount,
      currency: 'BDT',
      rate: 1,
      date: TODAY,
      note: bill.name,
      source: 'manual'
    });
    await repo.payBill(bill.id);
    this.db.bills = this.db.bills.filter(b => b.id !== bill.id);
    this.say('Drafted & confirmed · ' + bill.name);
  }

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
    this.emit();
  }

  async toggleSmsLive() {
    this.ui.smsLive = !this.ui.smsLive;
    await repo.setSetting('smsLive', this.ui.smsLive);
    this.emit();
  }

  /* ---------------- numpad ---------------- */

  pressKey(label) {
    const cur = this.ui.entryAmount;
    if (label === 'del') { this.set({ entryAmount: cur.slice(0, -1) }); return; }
    if (label === '.' && cur.indexOf('.') >= 0) return;
    if (cur.replace('.', '').length > 8) return;
    this.set({ entryAmount: cur + label });
  }
}

export const store = new Store();
