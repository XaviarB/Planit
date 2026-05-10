import axios from "axios";
import { getOrCreateUserToken } from "./userToken";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

// ---------- Groups ----------

export const createGroup = (group_name, creator_name, location) =>
  api
    .post("/groups", {
      group_name,
      creator_name,
      location: location || null,
      user_token: getOrCreateUserToken(),
    })
    .then((r) => r.data);

export const getGroup = (code) =>
  api.get(`/groups/${code}`).then((r) => r.data);

export const joinGroup = (code, name) =>
  api
    .post(`/groups/${code}/members`, {
      name,
      user_token: getOrCreateUserToken(),
    })
    .then((r) => r.data);

// ---------- Cross-group schedule sync ----------
// Stamp the local user_token onto an existing member so future slot
// edits fan out to every group you belong to. Idempotent + safe to call
// on every page load.
export const claimMembership = (code, member_id) =>
  api
    .post(`/groups/${code}/members/${member_id}/claim`, {
      user_token: getOrCreateUserToken(),
    })
    .then((r) => r.data);

// Lightweight list of every group attached to this browser's user_token,
// used by the schedule editor to show "Synced across N groups".
export const listMyMemberships = () =>
  api
    .get(`/members`, { params: { user_token: getOrCreateUserToken() } })
    .then((r) => r.data);

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

// ---------- Feedback ----------
// Lightweight user feedback collector. All fields optional; backend requires
// at least one of liked / disliked / wished to be non-empty.
export const submitFeedback = (payload) =>
  api.post(`/feedback`, payload).then((r) => r.data);

// ---------- Customization (Phase 5) ----------

// Group-wide visual identity. Anyone in the group can edit. Returns
// { ok, branding } from the server.
export const updateBranding = (code, payload) =>
  api.put(`/groups/${code}/branding`, payload).then((r) => r.data);

// Group-wide locale (timezone, week-start, time-format, day window, slot precision).
export const updateLocale = (code, payload) =>
  api.put(`/groups/${code}/locale`, payload).then((r) => r.data);

// Astral persona — display name, tone, lowercase rule, emoji on/off, default location.
export const updateAstralPersona = (code, payload) =>
  api.put(`/groups/${code}/astral-persona`, payload).then((r) => r.data);

// Per-member personal preferences (FAB side, theme, compact, hidden panels, color override).
export const updateMemberPrefs = (code, member_id, payload) =>
  api.put(`/groups/${code}/members/${member_id}/prefs`, payload).then((r) => r.data);

// ---------- Astral concierge ----------

export const astralSuggest = (code, payload) =>
  api.post(`/groups/${code}/astral/suggest`, payload).then((r) => r.data);

export const astralParseBusy = (code, text, anchor_iso, mode = "date") =>
  api
    .post(`/groups/${code}/astral/parse-busy`, { text, anchor_iso, mode })
    .then((r) => r.data);

export const astralDraftInvite = (code, suggestion, window_blurb) =>
  api
    .post(`/groups/${code}/astral/draft-invite`, { suggestion, window_blurb })
    .then((r) => r.data);

// ---------- Calendar sync (iCal URL or raw .ics) ----------

export const previewIcs = (code, payload) =>
  api.post(`/groups/${code}/astral/preview-ics`, payload).then((r) => r.data);

export const listCalendars = (code, member_id) =>
  api
    .get(`/groups/${code}/members/${member_id}/calendars`)
    .then((r) => r.data);

export const addCalendar = (code, member_id, payload) =>
  api
    .post(`/groups/${code}/members/${member_id}/calendars`, payload)
    .then((r) => r.data);

export const syncCalendar = (code, member_id, cal_id) =>
  api
    .post(`/groups/${code}/members/${member_id}/calendars/${cal_id}/sync`)
    .then((r) => r.data);

export const deleteCalendar = (code, member_id, cal_id) =>
  api
    .delete(`/groups/${code}/members/${member_id}/calendars/${cal_id}`)
    .then((r) => r.data);

// Build the public .ics feed URL for a member — paste into Google/Apple/Outlook.
export const memberFeedUrl = (code, member_id) =>
  `${API}/groups/${code}/members/${member_id}/feed.ics`;

// One-shot single-event .ics download URL — used by the "Add to calendar"
// button on a single Hangout row.
export const hangoutEventIcsUrl = (code, hid) =>
  `${API}/groups/${code}/hangouts/${hid}/event.ics`;

// ---- Astral history (per-group memory of suggestion rounds) -------------- //

export const listAstralHistory = (code, limit = 20) =>
  api.get(`/groups/${code}/astral/history`, { params: { limit } }).then((r) => r.data);

export const clearAstralHistory = (code) =>
  api.delete(`/groups/${code}/astral/history`).then((r) => r.data);

export const deleteAstralRound = (code, round_id) =>
  api.delete(`/groups/${code}/astral/history/${round_id}`).then((r) => r.data);

// ---- Group-level remix preferences --------------------------------------- //

export const updateRemixDefaults = (code, payload) =>
  api.put(`/groups/${code}/remix-defaults`, payload).then((r) => r.data);

// ---- Recurrence ---------------------------------------------------------- //

export const updateRecurrence = (code, kind) =>
  api.put(`/groups/${code}/recurrence`, { kind }).then((r) => r.data);

// ---------- Life Templates ----------

export const listTemplates = (code, member_id) =>
  api
    .get(`/groups/${code}/members/${member_id}/templates`)
    .then((r) => r.data);

export const createTemplate = (code, member_id, payload) =>
  api
    .post(`/groups/${code}/members/${member_id}/templates`, payload)
    .then((r) => r.data);

export const deleteTemplate = (code, member_id, tpl_id) =>
  api
    .delete(`/groups/${code}/members/${member_id}/templates/${tpl_id}`)
    .then((r) => r.data);

export const applyTemplate = (code, member_id, tpl_id, payload) =>
  api
    .post(
      `/groups/${code}/members/${member_id}/templates/${tpl_id}/apply`,
      payload
    )
    .then((r) => r.data);

// ---------- Hangouts (Phase 4 commitment ladder) ----------

export const listHangouts = (code) =>
  api.get(`/groups/${code}/hangouts`).then((r) => r.data);

export const createHangout = (code, payload) =>
  api.post(`/groups/${code}/hangouts`, payload).then((r) => r.data);

export const updateHangout = (code, hid, payload) =>
  api.put(`/groups/${code}/hangouts/${hid}`, payload).then((r) => r.data);

export const rsvpHangout = (code, hid, member_id, status) =>
  api
    .put(`/groups/${code}/hangouts/${hid}/rsvp/${member_id}`, { status })
    .then((r) => r.data);

export const deleteHangout = (code, hid) =>
  api.delete(`/groups/${code}/hangouts/${hid}`).then((r) => r.data);

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
