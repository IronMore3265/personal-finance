// First-run contents of the database. Mirrors the dataset in the
// `Paisa v4.dc.html` prototype so the built app opens on the same numbers.

export const TODAY = '2026-08-28';

export const RATES = { BDT: 1, USD: 122 };
export const SYM = { BDT: '৳', USD: '$' };

// Sentence case: v4 sets these beneath the account name as a quiet caption,
// not as an all-caps badge.
export const TYPE_LABEL = { cash: 'Cash', bank: 'Bank account', mfs: 'Mobile wallet', card: 'Credit card' };

export const ACCOUNTS = [
  { id: 'a1', name: 'Cash wallet', type: 'cash', currency: 'BDT', initial: 6200, icon: 'wallet' },
  { id: 'a2', name: 'City Bank', type: 'bank', currency: 'BDT', initial: 148900, icon: 'landmark' },
  { id: 'a3', name: 'bKash', type: 'mfs', currency: 'BDT', initial: 9400, brand: 'bkash' },
  { id: 'a4', name: 'Nagad', type: 'mfs', currency: 'BDT', initial: 2650, brand: 'nagad' },
  { id: 'a5', name: 'Rocket', type: 'mfs', currency: 'BDT', initial: 1180, brand: 'rocket' },
  { id: 'a6', name: 'Visa credit', type: 'card', currency: 'BDT', initial: -14300, brand: 'visa' },
  { id: 'a7', name: 'Payoneer', type: 'bank', currency: 'USD', initial: 1840, icon: 'globe' },
  { id: 'a8', name: 'Mastercard', type: 'card', currency: 'BDT', initial: -5200, brand: 'mastercard' },
  { id: 'a9', name: 'Amex', type: 'card', currency: 'USD', initial: -320, brand: 'amex' }
];

export const CATS = [
  { id: 'c1', name: 'Groceries', type: 'expense', color: 'oklch(0.68 0.15 95)', icon: 'shopping-basket' },
  { id: 'c2', name: 'Transport', type: 'expense', color: 'oklch(0.60 0.13 250)', icon: 'bus' },
  { id: 'c3', name: 'Rent', type: 'expense', color: 'oklch(0.55 0.14 300)', icon: 'house' },
  { id: 'c4', name: 'Utilities', type: 'expense', color: 'oklch(0.70 0.16 65)', icon: 'zap' },
  { id: 'c5', name: 'Mobile & net', type: 'expense', color: 'oklch(0.65 0.13 195)', icon: 'wifi' },
  { id: 'c6', name: 'Eating out', type: 'expense', color: 'oklch(0.60 0.17 30)', icon: 'utensils' },
  { id: 'c7', name: 'Health', type: 'expense', color: 'oklch(0.62 0.15 340)', icon: 'heart-pulse' },
  { id: 'c8', name: 'Shopping', type: 'expense', color: 'oklch(0.64 0.14 145)', icon: 'shopping-bag' },
  { id: 'c9', name: 'Fees & charges', type: 'expense', color: 'oklch(0.52 0.03 260)', icon: 'receipt' },
  { id: 'c10', name: 'Uncategorised', type: 'expense', color: 'oklch(0.62 0.02 260)', icon: 'circle-help' },
  { id: 'i1', name: 'Salary', type: 'income', color: 'oklch(0.66 0.14 160)', icon: 'briefcase' },
  { id: 'i2', name: 'Freelance', type: 'income', color: 'oklch(0.64 0.13 210)', icon: 'laptop' },
  { id: 'i3', name: 'Received', type: 'income', color: 'oklch(0.68 0.15 130)', icon: 'hand-coins' }
];

export const TXNS = [
  { id: 't1', account: 'a2', type: 'income', cat: 'i1', amount: 92000, currency: 'BDT', rate: 1, date: '2026-08-01', note: 'August salary', source: 'manual' },
  { id: 't2', account: 'a2', type: 'expense', cat: 'c3', amount: 32000, currency: 'BDT', rate: 1, date: '2026-08-02', note: 'Flat rent', source: 'manual' },
  { id: 't3', account: 'a7', type: 'income', cat: 'i2', amount: 620, currency: 'USD', rate: 122, date: '2026-08-05', note: 'Upwork milestone', source: 'manual' },
  { id: 't4', account: 'a3', type: 'expense', cat: 'c1', amount: 3450, currency: 'BDT', rate: 1, date: '2026-08-07', note: 'Shwapno Gulshan', source: 'sms' },
  { id: 't5', account: 'a1', type: 'expense', cat: 'c2', amount: 260, currency: 'BDT', rate: 1, date: '2026-08-09', note: 'Pathao ride', source: 'manual' },
  { id: 't6', account: 'a4', type: 'expense', cat: 'c5', amount: 849, currency: 'BDT', rate: 1, date: '2026-08-11', note: 'GP recharge', source: 'sms' },
  { id: 't7', account: 'a2', type: 'expense', cat: 'c4', amount: 3180, currency: 'BDT', rate: 1, date: '2026-08-13', note: 'DPDC electricity', source: 'manual' },
  { id: 't8', account: 'a6', type: 'expense', cat: 'c8', amount: 6900, currency: 'BDT', rate: 1, date: '2026-08-15', note: 'Aarong', source: 'manual' },
  { id: 't9', account: 'a1', type: 'expense', cat: 'c6', amount: 1240, currency: 'BDT', rate: 1, date: '2026-08-17', note: 'Dinner, Dhanmondi', source: 'manual' },
  { id: 't10', account: 'a3', type: 'expense', cat: 'c1', amount: 2870, currency: 'BDT', rate: 1, date: '2026-08-19', note: 'Agora weekly', source: 'sms' },
  { id: 't11', account: 'a1', type: 'expense', cat: 'c2', amount: 420, currency: 'BDT', rate: 1, date: '2026-08-21', note: 'CNG fare', source: 'manual' },
  { id: 't12', account: 'a2', type: 'expense', cat: 'c7', amount: 2600, currency: 'BDT', rate: 1, date: '2026-08-22', note: 'Pharmacy + tests', source: 'manual' },
  { id: 't13', account: 'a3', type: 'income', cat: 'i3', amount: 2500, currency: 'BDT', rate: 1, date: '2026-08-24', note: 'From Rifat', source: 'sms' },
  { id: 't14', account: 'a1', type: 'expense', cat: 'c6', amount: 680, currency: 'BDT', rate: 1, date: '2026-08-26', note: 'Coffee run', source: 'manual' },
  { id: 't15', account: 'a4', type: 'expense', cat: 'c9', amount: 18.5, currency: 'BDT', rate: 1, date: '2026-08-26', note: 'Cash out fee', source: 'sms' },
  { id: 't16', account: 'a2', type: 'expense', cat: 'c1', amount: 1980, currency: 'BDT', rate: 1, date: '2026-08-27', note: 'Meena Bazar', source: 'manual' }
];

export const BUDGETS = [
  { id: 'b1', cat: 'c1', limit: 12000 },
  { id: 'b2', cat: 'c2', limit: 2500 },
  { id: 'b3', cat: 'c6', limit: 4000 },
  { id: 'b4', cat: 'c4', limit: 6000 },
  { id: 'b5', cat: 'c8', limit: 5000 },
  { id: 'b6', cat: 'c5', limit: 1500 }
];

export const GOALS = [
  { id: 'g1', name: 'Emergency fund', target: 300000, current: 118000, deadline: '2027-06-30' },
  { id: 'g2', name: 'MacBook Air', target: 165000, current: 62000, deadline: '2026-12-15' },
  { id: 'g3', name: "Mum's cataract surgery", target: 90000, current: 84000, deadline: '2026-10-01' }
];

export const BILLS = [
  { id: 'rb1', name: 'Internet — Link3', amount: 1500, account: 'a2', cat: 'c5', freq: 'monthly', due: '2026-08-30', nextDue: '2026-08-30', autoPost: 1, active: 1, variable: 0 },
  { id: 'rb2', name: 'Netflix', amount: 790, account: 'a6', cat: 'c8', freq: 'monthly', due: '2026-09-01', nextDue: '2026-09-01', autoPost: 1, active: 1, variable: 0 },
  { id: 'rb3', name: 'Electricity — DPDC', amount: 3400, account: 'a2', cat: 'c4', freq: 'monthly', due: '2026-09-05', nextDue: '2026-09-05', autoPost: 0, active: 1, variable: 1 }
];

export const DEBTS = [
  { id: 'd1', person: 'Rafi', direction: 'owed_to_me', principal: 8000, currency: 'BDT', account: 'a3', opened: '2026-08-12', due: '2026-09-03', note: 'Lent for laptop repair', settled: 0 },
  { id: 'd2', person: 'Shahin bhai', direction: 'i_owe', principal: 9000, currency: 'BDT', account: 'a2', opened: '2026-08-05', due: '2026-09-12', note: 'Borrowed for deposit', settled: 0 }
];

export const DEBT_PAYMENTS = [
  { id: 'dp1', debt: 'd1', amount: 2000, date: '2026-08-25', txn: null }
];

// Sender + regex pairs run against pasted message text, top to bottom.
export const RULES = [
  { id: 'r1', sender: 'bKash', pattern: 'received Tk ([\\d,]+\\.?\\d*)', type: 'income', account: 'a3', cat: 'i3', label: 'bKash · money in' },
  { id: 'r2', sender: 'bKash', pattern: '(?:Payment|Send Money|Cash Out) Tk ([\\d,]+\\.?\\d*)', type: 'expense', account: 'a3', cat: 'c10', label: 'bKash · money out' },
  // Nagad leads with the verb ("Cash Out Tk 1,200.00"), same shape as r2.
  { id: 'r3', sender: 'NAGAD', pattern: '(?:Cash Out|Send Money|Payment) Tk ([\\d,]+\\.?\\d*)', type: 'expense', account: 'a4', cat: 'c10', label: 'Nagad · money out' },
  // Merchant tokens are 2+ uppercase letters, so the capture stops before the
  // lone "A" of a trailing "from A/C ...".
  { id: 'r4', sender: 'Rocket', pattern: 'Tk ([\\d,]+\\.?\\d*) paid to ([A-Z]{2,}(?: [A-Z]{2,})*)', type: 'expense', account: 'a5', cat: 'c10', label: 'Rocket · bill pay' },
  { id: 'r5', sender: 'CityBank', pattern: 'debited by BDT ([\\d,]+\\.?\\d*)', type: 'expense', account: 'a2', cat: 'c10', label: 'City Bank · card debit' },
  { id: 'r6', sender: 'CityBank', pattern: 'credited by BDT ([\\d,]+\\.?\\d*)', type: 'income', account: 'a2', cat: 'i1', label: 'City Bank · credit' }
];

export const SAMPLES = [
  { label: 'bKash in', sender: 'bKash', text: 'You have received Tk 2,500.00 from 01712345678. Ref: Rifat. Fee Tk 0.00. Balance Tk 11,900.00. TrxID BJ25X7QW at 28/08/2026 09:14' },
  { label: 'Nagad out', sender: 'NAGAD', text: 'Cash Out Tk 1,200.00 successful to Agent 016XXXXXXXX. Nagad Balance: Tk 1,431.50. TxnID N8812QP. 28/08/2026' },
  { label: 'Rocket bill', sender: 'Rocket', text: 'Tk 849.00 paid to GRAMEENPHONE from A/C 017XXXXXXX. Fee Tk 4.25. Balance Tk 327.00. TxnId 8871003' },
  { label: 'Bank card', sender: 'CityBank', text: 'Dear Customer, your A/C **4471 is debited by BDT 3,450.00 on 28-AUG-26 at SHWAPNO GULSHAN. Available Balance BDT 145,450.00' }
];

// Merchant keywords beat the rule's default category when they hit.
export const MERCHANT_MAP = [
  { k: ['SHWAPNO', 'AGORA', 'MEENA', 'UNIMART', 'DAILY'], cat: 'c1' },
  { k: ['GRAMEENPHONE', 'ROBI', 'BANGLALINK', 'AIRTEL', 'LINK3', 'AMBERIT'], cat: 'c5' },
  { k: ['PATHAO', 'UBER', 'CNG'], cat: 'c2' },
  { k: ['DPDC', 'DESCO', 'WASA', 'TITAS'], cat: 'c4' }
];

export const TREND_HISTORY = [
  { label: 'Mar', income: 88000, expense: 61000 },
  { label: 'Apr', income: 91000, expense: 74000 },
  { label: 'May', income: 96000, expense: 68000 },
  { label: 'Jun', income: 89000, expense: 82000 },
  { label: 'Jul', income: 103000, expense: 71000 }
];
