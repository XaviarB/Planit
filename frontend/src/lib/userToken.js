// Lightweight browser-stable user identity for cross-group schedule sync.
// No accounts — we just generate a UUID once, persist it in localStorage,
// and stamp it on every member we create/join. Two members across two
// different groups sharing the same token are treated as the same human
// server-side, so editing one schedule reflects in all crews.

const KEY = "planit:user-token";

/**
 * Returns the persistent user token for this browser, creating one on
 * first call. Safe to call repeatedly; idempotent.
 */
export function getOrCreateUserToken() {
  try {
    let t = localStorage.getItem(KEY);
    if (!t) {
      t =
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `u_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
      localStorage.setItem(KEY, t);
    }
    return t;
  } catch {
    // Private mode / blocked storage — fall back to a per-session id.
    if (!globalThis.__planit_runtime_token) {
      globalThis.__planit_runtime_token = `u_${Math.random()
        .toString(36)
        .slice(2)}${Date.now().toString(36)}`;
    }
    return globalThis.__planit_runtime_token;
  }
}

/**
 * Reads the user token without creating one. Returns null if missing.
 * Useful for read-only checks (e.g. avoid claim calls before the user
 * has actually engaged with the app).
 */
export function peekUserToken() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return globalThis.__planit_runtime_token || null;
  }
}
