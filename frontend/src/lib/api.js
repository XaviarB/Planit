import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

// ---------- Groups ----------

export const createGroup = (group_name, creator_name, location) =>
  api
    .post("/groups", { group_name, creator_name, location: location || null })
    .then((r) => r.data);

export const getGroup = (code) =>
  api.get(`/groups/${code}`).then((r) => r.data);

export const joinGroup = (code, name) =>
  api.post(`/groups/${code}/members`, { name }).then((r) => r.data);

export const updateSlots = (code, member_id, slots) =>
  api
    .put(`/groups/${code}/members/${member_id}/slots`, { slots })
    .then((r) => r.data);

// rename + per-member location are both POSTed via the same endpoint;
// pass `name` and/or `location` and only the provided keys are updated.
export const updateMember = (code, member_id, payload) =>
  api.put(`/groups/${code}/members/${member_id}`, payload).then((r) => r.data);

// Back-compat alias — existing components call renameMember(name).
export const renameMember = (code, member_id, name) =>
  updateMember(code, member_id, { name });

export const addReason = (code, label, color) =>
  api.post(`/groups/${code}/reasons`, { label, color }).then((r) => r.data);

export const deleteReason = (code, reason_id) =>
  api.delete(`/groups/${code}/reasons/${reason_id}`).then((r) => r.data);

export const updateGroup = (code, payload) =>
  api.put(`/groups/${code}`, payload).then((r) => r.data);

export const deleteGroup = (code) =>
  api.delete(`/groups/${code}`).then((r) => r.data);

export const leaveGroup = (code, member_id) =>
  api.delete(`/groups/${code}/members/${member_id}`).then((r) => r.data);

// ---------- Astral concierge ----------

export const astralSuggest = (code, payload) =>
  api.post(`/groups/${code}/astral/suggest`, payload).then((r) => r.data);

export const astralParseBusy = (code, text, anchor_iso) =>
  api
    .post(`/groups/${code}/astral/parse-busy`, { text, anchor_iso })
    .then((r) => r.data);

export const astralDraftInvite = (code, suggestion, window_blurb) =>
  api
    .post(`/groups/${code}/astral/draft-invite`, { suggestion, window_blurb })
    .then((r) => r.data);

// ---------- LocalStorage helpers (Planit-branded) ----------
//
// Keys were originally prefixed `tt:` (TimeTogether). When the app rebranded
// to Planit we migrate transparently on first load — no data loss for users
// returning from the old name. Migration is idempotent (skipped if already done).

const MIGRATION_FLAG = "planit:_migrated_from_tt";

function migrateLegacyKeys() {
  try {
    if (localStorage.getItem(MIGRATION_FLAG) === "1") return;
    const moved = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("tt:")) moved.push(k);
    }
    for (const k of moved) {
      const v = localStorage.getItem(k);
      const newKey = "planit:" + k.slice(3);
      // Only set if a planit:* version doesn't already exist.
      if (v != null && localStorage.getItem(newKey) == null) {
        localStorage.setItem(newKey, v);
      }
    }
    localStorage.setItem(MIGRATION_FLAG, "1");
  } catch {
    /* localStorage unavailable — no-op */
  }
}

// Run once on module load.
migrateLegacyKeys();

// Identity per-group
export const memberKey = (code) => `planit:${code}:member_id`;
export const getLocalMemberId = (code) => {
  // Fallback to legacy key if migration somehow missed it.
  return (
    localStorage.getItem(memberKey(code)) ||
    localStorage.getItem(`tt:${code}:member_id`)
  );
};
export const setLocalMemberId = (code, id) =>
  localStorage.setItem(memberKey(code), id);
export const clearLocalMemberId = (code) =>
  localStorage.removeItem(memberKey(code));

// Per-group view-state
const viewStateKey = (code) => `planit:${code}:view_state`;
export const getGroupViewState = (code) => {
  try {
    const raw =
      localStorage.getItem(viewStateKey(code)) ||
      localStorage.getItem(`tt:${code}:view_state`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
export const setGroupViewState = (code, patch) => {
  const prev = getGroupViewState(code) || {};
  const next = { ...prev, ...patch };
  localStorage.setItem(viewStateKey(code), JSON.stringify(next));
};

// Visited groups
const GROUPS_KEY = "planit:groups";
export const getVisitedGroups = () => {
  try {
    const raw =
      localStorage.getItem(GROUPS_KEY) || localStorage.getItem("tt:groups");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
export const addVisitedGroup = (entry) => {
  const list = getVisitedGroups().filter((g) => g.code !== entry.code);
  list.unshift({ code: entry.code, name: entry.name });
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list.slice(0, 20)));
};
export const removeVisitedGroup = (code) => {
  const list = getVisitedGroups().filter((g) => g.code !== code);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list));
};
