// Shared time + heatmap helpers

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const HOURS = Array.from({ length: 24 }, (_, i) => i);

export const hourLabel = (h) => {
  const ampm = h < 12 ? "AM" : "PM";
  const x = h % 12 === 0 ? 12 : h % 12;
  return `${x} ${ampm}`;
};

// Label for an arbitrary (hour, minute) tuple. Examples: "9 AM", "9:15 AM".
export const timeLabel = (h, m = 0) => {
  const ampm = h < 12 ? "AM" : "PM";
  const x = h % 12 === 0 ? 12 : h % 12;
  if (!m) return `${x} ${ampm}`;
  return `${x}:${String(m).padStart(2, "0")} ${ampm}`;
};

// Build a list of time-slot tuples [{hour, minute}] between hourFrom..hourTo
// at `step` minute precision (60, 30, or 15).
export const buildTimeSlots = (hourFrom, hourTo, step = 60) => {
  const out = [];
  const s = Math.max(1, Math.min(60, step | 0));
  for (let h = hourFrom; h <= hourTo; h++) {
    for (let m = 0; m < 60; m += s) {
      out.push({ hour: h, minute: m });
    }
  }
  return out;
};

// Weekly key for a given day-index (0=Mon)
export const weeklyKey = (dayIdx) => `d${dayIdx}`;

// Given an ISO date string, get weekday index (0=Mon..6=Sun)
export const dateToDayIdx = (isoDate) => {
  const d = new Date(isoDate + "T00:00:00");
  const js = d.getDay(); // 0=Sun
  return (js + 6) % 7; // 0=Mon
};

// Slots lookup map: keyed by "mode|key|hour|minute" → slot.
// Each slot also carries `step` describing the block length.
export const buildSlotMap = (slots) => {
  const map = new Map();
  for (const s of slots || []) {
    const minute = s.minute || 0;
    map.set(`${s.mode}|${s.key}|${s.hour}|${minute}`, s);
  }
  return map;
};

// Cache busy intervals per (mode|key) for fast overlap checks.
export const buildBusyIndex = (slots) => {
  const idx = new Map(); // "mode|key" → [{start, end, reason_id}]
  for (const s of slots || []) {
    if (s.status !== "busy") continue;
    const k = `${s.mode}|${s.key}`;
    const start = s.hour * 60 + (s.minute || 0);
    const end = start + (s.step || 60);
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push({ start, end, reason_id: s.reason_id || null });
  }
  return idx;
};

// Determine if a member is FREE or BUSY at a given mode+key over the
// [hour:minute, hour:minute + step) window.  Default-free model.
export const memberStatusAt = (member, mode, key, hour, minute = 0, step = 60) => {
  const idx = member._idx || buildBusyIndex(member.slots);
  const list = idx.get(`${mode}|${key}`);
  if (!list || list.length === 0) return { status: "free" };
  const winStart = hour * 60 + minute;
  const winEnd = winStart + step;
  for (const iv of list) {
    if (iv.start < winEnd && iv.end > winStart) {
      return { status: "busy", reason_id: iv.reason_id };
    }
  }
  return { status: "free" };
};

// Enrich member with cached slot map + busy index
export const withSlotMap = (member) => ({
  ...member,
  _map: buildSlotMap(member.slots),
  _idx: buildBusyIndex(member.slots),
});

// Generate ISO dates between startDate and endDate inclusive
export const dateRange = (startDate, endDate) => {
  const out = [];
  if (!startDate || !endDate) return out;
  const s = new Date(startDate + "T00:00:00");
  const e = new Date(endDate + "T00:00:00");
  if (s > e) return out;
  const cur = new Date(s);
  while (cur <= e) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    out.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  return out;
};

// Returns the ISO Monday and Sunday bounding the week of `now` (defaults to today).
export const currentWeekBounds = (now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const mondayOffset = (jsDay + 6) % 7; // days back to Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (x) => {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  return { monday: fmt(monday), sunday: fmt(sunday) };
};

// Format ISO date → "Mon 3"
export const formatDateShort = (iso) => {
  const d = new Date(iso + "T00:00:00");
  const day = DAYS[(d.getDay() + 6) % 7];
  return `${day} ${d.getDate()}`;
};

// Get heat color given free count. Optionally pass custom 5-color palette.
export const heatColor = (freeCount, totalMembers, palette) => {
  const p = (palette && palette.length === 5) ? palette : [
    "var(--heat-0)",
    "var(--heat-1)",
    "var(--heat-2)",
    "var(--heat-3)",
    "var(--heat-all)",
  ];
  if (totalMembers === 0) return p[0];
  if (freeCount === 0) return p[0];
  if (freeCount === totalMembers) return p[4];
  const ratio = freeCount / totalMembers;
  if (ratio <= 0.33) return p[1];
  if (ratio <= 0.66) return p[2];
  return p[3];
};
