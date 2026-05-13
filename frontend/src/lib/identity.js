// Mock identity persistence for the "Save your account" flow.
//
// The app currently has no real auth. Identity is purely client-side:
// guests get a name only (tracked per group through member ids), while
// "signed-in" users have additionally provided an email+password which
// we store in localStorage as a stand-in until real auth is wired.
//
// Keys:
//   planit:identity           → JSON  { kind, email, ts }
//   planit:save_acct_prompted → "1"   (we've shown the after-group popup at least once)
//   planit:pending_save_acct  → group code (set right after Create/Join; consumed on the Group page)
//
// Nothing here calls the backend — swap these helpers when real auth lands.

const KEY_IDENTITY = "planit:identity";
const KEY_PROMPTED = "planit:save_acct_prompted";
const KEY_PENDING = "planit:pending_save_acct";

const safeStorage = () => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch (_) {
    return null;
  }
};

export function getIdentity() {
  const ls = safeStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(KEY_IDENTITY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setIdentity(obj) {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_IDENTITY, JSON.stringify(obj));
  } catch (_) {
    /* ignore quota / disabled storage */
  }
}

export function clearIdentity() {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.removeItem(KEY_IDENTITY);
  } catch (_) {}
}

export function hasBeenPrompted() {
  const ls = safeStorage();
  if (!ls) return false;
  try {
    return ls.getItem(KEY_PROMPTED) === "1";
  } catch (_) {
    return false;
  }
}

export function markPrompted() {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_PROMPTED, "1");
  } catch (_) {}
}

/** Called from Landing right after a successful Create/Join. The
 * GroupPage consumes it on first mount and triggers the modal. */
export function setPendingSavePrompt(groupCode) {
  const ls = safeStorage();
  if (!ls) return;
  try {
    ls.setItem(KEY_PENDING, String(groupCode || ""));
  } catch (_) {}
}

export function hasPendingSavePrompt(currentCode) {
  const ls = safeStorage();
  if (!ls) return false;
  try {
    const v = ls.getItem(KEY_PENDING);
    if (!v) return false;
    // Only return true if the pending code matches the page we're on
    if (currentCode && v.toUpperCase() !== String(currentCode).toUpperCase()) {
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

export function consumePendingSavePrompt(currentCode) {
  const ls = safeStorage();
  if (!ls) return false;
  try {
    const v = ls.getItem(KEY_PENDING);
    if (!v) return false;
    // Only consume if the pending code matches the page we're on, to
    // avoid showing the prompt on an unrelated group later.
    if (currentCode && v.toUpperCase() !== String(currentCode).toUpperCase()) {
      return false;
    }
    ls.removeItem(KEY_PENDING);
    return true;
  } catch (_) {
    return false;
  }
}
