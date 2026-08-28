// SQLite schema. Kept as plain DDL so the same statements run on device
// (@capacitor-community/sqlite) and are readable when you pull the .db file off
// the phone with the Backup action in Settings.

export const DB_NAME = 'paisa';
export const DB_VERSION = 3;

export const DDL = [
  `CREATE TABLE IF NOT EXISTS accounts (
     id       TEXT PRIMARY KEY NOT NULL,
     name     TEXT NOT NULL,
     type     TEXT NOT NULL,
     currency TEXT NOT NULL,
     initial  REAL NOT NULL DEFAULT 0,
     sort     INTEGER NOT NULL DEFAULT 0,
     icon     TEXT,
     color    TEXT,
     brand    TEXT
   );`,

  `CREATE TABLE IF NOT EXISTS categories (
     id    TEXT PRIMARY KEY NOT NULL,
     name  TEXT NOT NULL,
     type  TEXT NOT NULL,
     color TEXT NOT NULL,
     sort  INTEGER NOT NULL DEFAULT 0,
     icon  TEXT
   );`,

  `CREATE TABLE IF NOT EXISTS transactions (
     id       TEXT PRIMARY KEY NOT NULL,
     account  TEXT NOT NULL,
     type     TEXT NOT NULL,
     cat      TEXT NOT NULL,
     amount   REAL NOT NULL,
     currency TEXT NOT NULL,
     rate     REAL NOT NULL DEFAULT 1,
     date     TEXT NOT NULL,
     note     TEXT,
     source   TEXT NOT NULL DEFAULT 'manual',
     FOREIGN KEY (account) REFERENCES accounts (id),
     FOREIGN KEY (cat)     REFERENCES categories (id)
   );`,

  `CREATE INDEX IF NOT EXISTS idx_txn_date    ON transactions (date DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_txn_account ON transactions (account);`,
  `CREATE INDEX IF NOT EXISTS idx_txn_cat     ON transactions (cat);`,

  // Line items of one transaction. `amount` is the line total (qty x unit
  // already applied), so the parent amount is a plain SUM and no rounding
  // drift creeps in between what you typed and what you saved.
  `CREATE TABLE IF NOT EXISTS txn_items (
     id     TEXT PRIMARY KEY NOT NULL,
     txn    TEXT NOT NULL,
     label  TEXT,
     qty    REAL NOT NULL DEFAULT 1,
     amount REAL NOT NULL,
     sort   INTEGER NOT NULL DEFAULT 0,
     FOREIGN KEY (txn) REFERENCES transactions (id)
   );`,

  `CREATE INDEX IF NOT EXISTS idx_item_txn ON txn_items (txn);`,

  `CREATE TABLE IF NOT EXISTS budgets (
     id     TEXT PRIMARY KEY NOT NULL,
     cat    TEXT NOT NULL,
     "limit" REAL NOT NULL,
     FOREIGN KEY (cat) REFERENCES categories (id)
   );`,

  `CREATE TABLE IF NOT EXISTS goals (
     id       TEXT PRIMARY KEY NOT NULL,
     name     TEXT NOT NULL,
     target   REAL NOT NULL,
     current  REAL NOT NULL DEFAULT 0,
     deadline TEXT
   );`,

  // Recurring rules. `due` is the original seed date and is left alone;
  // `nextDue` is what actually moves as each occurrence posts.
  `CREATE TABLE IF NOT EXISTS bills (
     id         TEXT PRIMARY KEY NOT NULL,
     name       TEXT NOT NULL,
     amount     REAL NOT NULL,
     account    TEXT NOT NULL,
     cat        TEXT NOT NULL,
     freq       TEXT NOT NULL,
     due        TEXT NOT NULL,
     paid       INTEGER NOT NULL DEFAULT 0,
     nextDue    TEXT,
     autoPost   INTEGER NOT NULL DEFAULT 0,
     active     INTEGER NOT NULL DEFAULT 1,
     variable   INTEGER NOT NULL DEFAULT 0,
     lastPosted TEXT
   );`,

  // Money lent and money owed. Kept out of `accounts` so a person and a due
  // date are first-class, and so a loan does not move net worth until it is
  // actually settled.
  `CREATE TABLE IF NOT EXISTS debts (
     id        TEXT PRIMARY KEY NOT NULL,
     person    TEXT NOT NULL,
     direction TEXT NOT NULL,
     principal REAL NOT NULL,
     currency  TEXT NOT NULL DEFAULT 'BDT',
     account   TEXT,
     opened    TEXT NOT NULL,
     due       TEXT,
     note      TEXT,
     settled   INTEGER NOT NULL DEFAULT 0
   );`,

  `CREATE TABLE IF NOT EXISTS debt_payments (
     id     TEXT PRIMARY KEY NOT NULL,
     debt   TEXT NOT NULL,
     amount REAL NOT NULL,
     date   TEXT NOT NULL,
     txn    TEXT,
     FOREIGN KEY (debt) REFERENCES debts (id)
   );`,

  `CREATE INDEX IF NOT EXISTS idx_pay_debt ON debt_payments (debt);`,

  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY NOT NULL,
     value TEXT
   );`,

  // Writes waiting to reach Supabase.
  //
  // The app never blocks on the network: a write lands locally, an entry lands
  // here, and the sync engine drains this in order whenever there is signal.
  // If the phone is offline for a week, the queue simply gets longer.
  `CREATE TABLE IF NOT EXISTS outbox (
     seq     INTEGER PRIMARY KEY AUTOINCREMENT,
     tbl     TEXT NOT NULL,
     key     TEXT NOT NULL,
     op      TEXT NOT NULL,
     payload TEXT,
     at      TEXT NOT NULL
   );`
];

// Additive steps for databases seeded before this version. The DDL above is
// CREATE TABLE IF NOT EXISTS only, so an existing install never sees the new
// columns without these. Keyed by the version they upgrade *to*.
//
// Every statement has to be safe to re-run: a half-applied migration (app
// killed mid-upgrade) replays from the start, and ALTER TABLE on a column that
// already exists throws "duplicate column name", which the driver swallows.
export const MIGRATIONS = {
  2: [
    `ALTER TABLE accounts   ADD COLUMN icon  TEXT;`,
    `ALTER TABLE accounts   ADD COLUMN color TEXT;`,
    `ALTER TABLE accounts   ADD COLUMN brand TEXT;`,
    `ALTER TABLE categories ADD COLUMN icon  TEXT;`,

    `ALTER TABLE bills ADD COLUMN nextDue    TEXT;`,
    `ALTER TABLE bills ADD COLUMN autoPost   INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE bills ADD COLUMN active     INTEGER NOT NULL DEFAULT 1;`,
    `ALTER TABLE bills ADD COLUMN variable   INTEGER NOT NULL DEFAULT 0;`,
    `ALTER TABLE bills ADD COLUMN lastPosted TEXT;`,
    `UPDATE bills SET nextDue = due WHERE nextDue IS NULL;`,

    `CREATE TABLE IF NOT EXISTS txn_items (
       id     TEXT PRIMARY KEY NOT NULL,
       txn    TEXT NOT NULL,
       label  TEXT,
       qty    REAL NOT NULL DEFAULT 1,
       amount REAL NOT NULL,
       sort   INTEGER NOT NULL DEFAULT 0
     );`,
    `CREATE INDEX IF NOT EXISTS idx_item_txn ON txn_items (txn);`,

    `CREATE TABLE IF NOT EXISTS debts (
       id        TEXT PRIMARY KEY NOT NULL,
       person    TEXT NOT NULL,
       direction TEXT NOT NULL,
       principal REAL NOT NULL,
       currency  TEXT NOT NULL DEFAULT 'BDT',
       account   TEXT,
       opened    TEXT NOT NULL,
       due       TEXT,
       note      TEXT,
       settled   INTEGER NOT NULL DEFAULT 0
     );`,
    `CREATE TABLE IF NOT EXISTS debt_payments (
       id     TEXT PRIMARY KEY NOT NULL,
       debt   TEXT NOT NULL,
       amount REAL NOT NULL,
       date   TEXT NOT NULL,
       txn    TEXT
     );`,
    `CREATE INDEX IF NOT EXISTS idx_pay_debt ON debt_payments (debt);`
  ],

  3: [
    `CREATE TABLE IF NOT EXISTS outbox (
       seq     INTEGER PRIMARY KEY AUTOINCREMENT,
       tbl     TEXT NOT NULL,
       key     TEXT NOT NULL,
       op      TEXT NOT NULL,
       payload TEXT,
       at      TEXT NOT NULL
     );`
  ]
};

/**
 * Local table name -> the Supabase table it syncs to, in dependency order.
 *
 * Order matters on the first push: a transaction referencing an account that
 * has not arrived yet is only a soft problem here (there are no cross-table
 * foreign keys on the server, deliberately, because rows arrive out of order
 * during a bootstrap) but the ordering keeps a partially-synced database
 * readable if a push is interrupted half way.
 */
export const SYNC_TABLES = [
  'accounts', 'categories', 'transactions', 'txn_items',
  'budgets', 'goals', 'bills', 'debts', 'debt_payments', 'rules', 'settings'
];

/** The column that identifies a row within a user. `settings` is keyed by name. */
export const SYNC_KEY = (table) => (table === 'settings' ? 'key' : 'id');
