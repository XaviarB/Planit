import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({ baseURL: API });

export const createGroup = (group_name, creator_name) =>
  api.post("/groups", { group_name, creator_name }).then((r) => r.data);

export const getGroup = (code) =>
  api.get(`/groups/${code}`).then((r) => r.data);

export const joinGroup = (code, name) =>
  api.post(`/groups/${code}/members`, { name }).then((r) => r.data);

export const updateSlots = (code, member_id, slots) =>
  api.put(`/groups/${code}/members/${member_id}/slots`, { slots }).then((r) => r.data);

export const renameMember = (code, member_id, name) =>
  api.put(`/groups/${code}/members/${member_id}`, { name }).then((r) => r.data);

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

// LocalStorage helper for identity per-group
export const memberKey = (code) => `tt:${code}:member_id`;
export const getLocalMemberId = (code) => localStorage.getItem(memberKey(code));
export const setLocalMemberId = (code, id) => localStorage.setItem(memberKey(code), id);
export const clearLocalMemberId = (code) => localStorage.removeItem(memberKey(code));

// Per-group view-state persistence (tab, hour range, minute step, focus list, range dates)
const viewStateKey = (code) => `tt:${code}:view_state`;
export const getGroupViewState = (code) => {
  try {
    const raw = localStorage.getItem(viewStateKey(code));
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

// Visited groups list (for the group switcher dropdown)
const GROUPS_KEY = "tt:groups";
export const getVisitedGroups = () => {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};
export const addVisitedGroup = (entry) => {
  // entry: { code, name }
  const list = getVisitedGroups().filter((g) => g.code !== entry.code);
  list.unshift({ code: entry.code, name: entry.name });
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list.slice(0, 20)));
};
export const removeVisitedGroup = (code) => {
  const list = getVisitedGroups().filter((g) => g.code !== code);
  localStorage.setItem(GROUPS_KEY, JSON.stringify(list));
};
