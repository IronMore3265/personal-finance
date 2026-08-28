// A small Supabase client: email auth plus PostgREST reads and writes.
//
// Hand-written rather than @supabase/supabase-js on purpose. The app has no
// bundler and ships www/ exactly as authored, so a dependency would have to be
// vendored in as a ~100KB minified blob - which is both more code than this
// file and code that cannot be read in the repo. What the app actually needs
// is four auth calls and three table calls.
//
// Security note: PUBLISHABLE_KEY is meant to be public. It identifies the
// project, not the user, and grants nothing on its own - every table is behind
// row-level security keyed on auth.uid(). Extracting it from the APK gets you
// the ability to create your own account, and nothing else.

const URL_BASE = 'https://lkavdkvtujlciouuobor.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_3LSkmPcsiJD12OIiKalxkQ_w233TYbf';

const SESSION_KEY = 'paisa.auth.v1';

/** Refresh this long before the token actually expires. */
const REFRESH_MARGIN = 60_000;

class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

class Supabase {
  constructor() {
    this.session = null;
    this.listeners = new Set();
    this.load();
  }

  /* ---------------- session ---------------- */

  load() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) this.session = JSON.parse(raw);
    } catch { /* private mode, or a corrupt blob - start signed out */ }
  }

  save(session) {
    this.session = session;
    try {
      if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      else localStorage.removeItem(SESSION_KEY);
    } catch { /* nothing we can do; the session is still live in memory */ }
    this.listeners.forEach(fn => fn(session));
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  get signedIn() { return !!(this.session && this.session.refresh_token); }
  get email() { return this.session && this.session.email; }
  get userId() { return this.session && this.session.user_id; }

  /** Shape the token endpoint's reply into what we actually keep. */
  static toSession(json) {
    return {
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: Date.now() + (json.expires_in || 3600) * 1000,
      user_id: json.user && json.user.id,
      email: json.user && json.user.email
    };
  }

  async auth(path, body) {
    const res = await fetch(URL_BASE + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new AuthError(
        json.error_description || json.msg || json.message || 'Sign-in failed',
        res.status
      );
    }
    return json;
  }

  async signIn(email, password) {
    const json = await this.auth('token?grant_type=password', { email, password });
    this.save(Supabase.toSession(json));
    return this.session;
  }

  /**
   * Create an account.
   *
   * When the project has email confirmation switched on, the reply carries a
   * user but no access token - there is nothing to sign in with yet, and the
   * caller has to say so rather than silently appearing to succeed.
   */
  async signUp(email, password) {
    const json = await this.auth('signup', { email, password });
    if (!json.access_token) return { confirmationRequired: true };
    this.save(Supabase.toSession(json));
    return { confirmationRequired: false };
  }

  async signOut() {
    const token = this.session && this.session.access_token;
    this.save(null);
    if (!token) return;
    // Best effort: the local session is already gone either way.
    await fetch(URL_BASE + '/auth/v1/logout', {
      method: 'POST',
      headers: { apikey: PUBLISHABLE_KEY, Authorization: 'Bearer ' + token }
    }).catch(() => {});
  }

  /**
   * A valid access token, refreshing first if it is close to expiring.
   *
   * A refresh that fails with 4xx means the refresh token itself is dead - the
   * user signed out elsewhere, or it was revoked - so the session is cleared
   * and the app falls back to local-only. A network failure is left alone: the
   * token may still be good once there is signal again.
   */
  async token() {
    if (!this.session) return null;
    if (Date.now() < this.session.expires_at - REFRESH_MARGIN) {
      return this.session.access_token;
    }
    try {
      const json = await this.auth(
        'token?grant_type=refresh_token',
        { refresh_token: this.session.refresh_token }
      );
      this.save(Supabase.toSession(json));
      return this.session.access_token;
    } catch (err) {
      if (err instanceof AuthError && err.status >= 400 && err.status < 500) {
        this.save(null);
        return null;
      }
      throw err;
    }
  }

  /* ---------------- PostgREST ---------------- */

  async rest(path, options = {}) {
    const token = await this.token();
    if (!token) throw new AuthError('Not signed in', 401);

    const res = await fetch(URL_BASE + '/rest/v1/' + path, {
      ...options,
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error('supabase ' + res.status + ' on ' + path + ': ' + text.slice(0, 200));
    }
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  /** Rows in `table` changed strictly after `since` (an ISO timestamp). */
  select(table, since) {
    const query = 'select=*&order=updated_at.asc'
      + (since ? '&updated_at=gt.' + encodeURIComponent(since) : '');
    return this.rest(table + '?' + query);
  }

  /**
   * Insert or update rows, keyed on the composite primary key.
   *
   * `on_conflict` has to name both columns: every install seeds its own rows
   * with the same local ids, so (user_id, id) is what makes them unique.
   */
  upsert(table, rows, conflictKey = 'user_id,id') {
    if (!rows.length) return Promise.resolve(null);
    return this.rest(table + '?on_conflict=' + conflictKey, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    });
  }
}

export const supabase = new Supabase();
export { URL_BASE as SUPABASE_URL, AuthError };
