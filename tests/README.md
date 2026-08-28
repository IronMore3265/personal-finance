# Tests

```
npm test              check + unit + browser
npm run check         module graph: every import path and named export resolves
npm run test:unit     the keypad evaluator, in node
npm run test:browser  the app, in Chromium
npm run shots         browser tests plus readable PNGs in docs/screens/verify/
```

First run needs the browser binary once: `npx playwright install chromium`.

## Why the browser is a fair test here

The app has **no build step** — `www/` ships as authored — so Chromium runs
byte-identical source to the APK. Every screen, every store selector and every
repo method is the same code on both.

## Sync tests

`sync.spec.js` runs against a **stubbed** Supabase (`page.route`), so it never
touches the real project and needs no credentials. It covers the outbox, the
push/pull cycle, the request shapes, and the conflict rule.

The live project — schema, RLS policies, the `updated_at` trigger, the upsert
key — was verified separately with a scripted round trip using two throwaway
accounts, both since deleted. The checks that mattered:

- push → pull returns the row, with `updated_at` set
- an update moves `updated_at` (the trigger fires)
- a pull with `updated_at=gt.<cursor>` returns nothing new
- **a second signed-in user sees 0 rows**
- **the publishable key with no session sees 0 rows**

Re-run that any time the schema changes. Note that Supabase rejects
`@example.com` at signup, and the built-in SMTP rate-limits to a few messages
an hour, so a confirmed test user is easiest to create with SQL — it needs an
`auth.identities` row and empty-string (not NULL) token columns, or GoTrue
answers "Database error querying schema".

## What the browser cannot reach

Four things, and they are the ones to check on a device:

1. **The SQLite driver.** The browser takes the `WebDriver` localStorage path
   (`www/js/data/repo.js`). The migration tests cover the JS migration, not the
   `PRAGMA user_version` / `ALTER TABLE` path — the only change here that can
   destroy existing data. There is no `sqlite3` binary on a stock device, so
   pull the file and read it with node instead:

       adb exec-out run-as com.paisa.tracker cat databases/paisaSQLite.db > before.db
       # install over the top, WITHOUT uninstalling, then pull it again
       node -e "const{DatabaseSync}=require('node:sqlite');
         const d=new DatabaseSync('after.db',{readOnly:true});
         console.log(d.prepare('PRAGMA user_version').get(),
                     d.prepare('SELECT COUNT(*) n FROM transactions').get())"

   Row counts must be unchanged and the version must read the current
   `DB_VERSION`. Done for v1 → v3 on a Motorola Edge 50 Fusion: 17
   transactions and 7 accounts, intact.
2. **The native date picker.** `<input type="date">` presents differently in an
   Android WebView than in desktop Chromium.
3. **StatusBar theming and the Android back button** (`www/js/app.js`).
4. **Touch scroll momentum** inside `.sheet__body`, and the on-screen keyboard
   resizing the sheet.

## Notes on the harness

- `fixtures.js` fails any test that logs a `pageerror` or `console.error`. In a
  codebase with no compiler, a typo in an import is otherwise a blank screen
  with no failing assertion anywhere.
- The clock is pinned to `2026-08-28T10:00:00`. A fixed clock also freezes
  `document.timeline`, so the fixture asks for reduced motion — otherwise every
  CSS animation stops at frame zero and measurements read a mid-flight
  transform.
- Snapshot baselines live in `visual.spec.js-snapshots/` and are committed. The
  PNGs in `docs/screens/verify/` are not; they are there to look at.
- Run with `--workers=2` if the static server starts timing out; it is a plain
  `http.createServer` and six workers loading 30 ES modules each can starve it.
