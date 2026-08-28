// SQLite schema. Kept as plain DDL so the same statements run on device
// (@capacitor-community/sqlite) and are readable when you pull the .db file off
// the phone with the Backup action in Settings.

export const DB_NAME = 'paisa';
export const DB_VERSION = 1;

export const DDL = [
  `CREATE TABLE IF NOT EXISTS accounts (
     id       TEXT PRIMARY KEY NOT NULL,
     name     TEXT NOT NULL,
     type     TEXT NOT NULL,
     currency TEXT NOT NULL,
     initial  REAL NOT NULL DEFAULT 0,
     sort     INTEGER NOT NULL DEFAULT 0
   );`,

  `CREATE TABLE IF NOT EXISTS categories (
     id    TEXT PRIMARY KEY NOT NULL,
     name  TEXT NOT NULL,
     type  TEXT NOT NULL,
     color TEXT NOT NULL,
     sort  INTEGER NOT NULL DEFAULT 0
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

  `CREATE TABLE IF NOT EXISTS bills (
     id      TEXT PRIMARY KEY NOT NULL,
     name    TEXT NOT NULL,
     amount  REAL NOT NULL,
     account TEXT NOT NULL,
     cat     TEXT NOT NULL,
     freq    TEXT NOT NULL,
     due     TEXT NOT NULL,
     paid    INTEGER NOT NULL DEFAULT 0
   );`,

  `CREATE TABLE IF NOT EXISTS rules (
     id      TEXT PRIMARY KEY NOT NULL,
     sender  TEXT NOT NULL,
     pattern TEXT NOT NULL,
     type    TEXT NOT NULL,
     account TEXT NOT NULL,
     cat     TEXT NOT NULL,
     label   TEXT NOT NULL,
     sort    INTEGER NOT NULL DEFAULT 0
   );`,

  `CREATE TABLE IF NOT EXISTS settings (
     key   TEXT PRIMARY KEY NOT NULL,
     value TEXT
   );`
];
