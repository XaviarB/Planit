import { useMemo } from "react";
import { timeLabel, formatDateShort } from "../lib/schedule";

/**
 * Horizontal-pill layout: each member card shows a row of pills representing
 * a contiguous busy block (same date + same reason).  Each block stitches
 * adjacent slots regardless of their `step` granularity.
 */
export default function MembersSchedule({ members, reasons, columns }) {
  const reasonMap = useMemo(() => {
    const m = {};
    for (const r of reasons) m[r.id] = r;
    return m;
  }, [reasons]);

  const visibleKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);

  return (
    <div className="space-y-4" data-testid="members-schedule">
      {members.map((m) => {
        const pills = buildPills(m.slots, visibleKeys);
        return (
          <div key={m.id} className="neo-card p-5" data-testid={`schedule-member-${m.id}`}>
            <div className="flex items-center gap-3 mb-3">
              <span
                className="w-8 h-8 rounded-full border-2 grid place-items-center font-heading font-black text-sm shrink-0"
                style={{
                  borderColor: "var(--ink)",
                  background: m.color,
                  color: "#fff",
                }}
              >
                {(m.name || "?").slice(0, 1).toUpperCase()}
              </span>
              <div className="font-heading font-black text-lg leading-tight truncate">
                {m.name}
              </div>
            </div>

            {pills.length === 0 ? (
              <div
                className="text-sm rounded-lg p-3 border-2 border-dashed"
                style={{
                  borderColor: "var(--ink)",
                  opacity: 0.55,
                  background: "var(--card-soft, var(--card))",
                }}
              >
                Looks fully free in this range.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pills.map((p, i) => {
                  const r = p.reason_id ? reasonMap[p.reason_id] : null;
                  const startH = Math.floor(p.startMin / 60);
                  const startM = p.startMin % 60;
                  const endTotal = p.endMin;
                  const endH = Math.min(23, Math.floor(endTotal / 60));
                  const endMmod = endTotal % 60;
                  const range = `${timeLabel(startH, startM)}–${timeLabel(endH, endMmod)}`;
                  return (
                    <span
                      key={`${p.dateKey}-${p.startMin}-${i}`}
                      className="inline-flex items-center gap-2 rounded-full border-2 pl-1 pr-3 py-1 text-xs"
                      style={{
                        borderColor: "var(--ink)",
                        background: "var(--card)",
                      }}
                      data-testid={`schedule-pill-${m.id}-${p.dateKey}-${p.startMin}`}
                    >
                      <span
                        className="font-heading font-black px-2 py-0.5 rounded-full text-[10px]"
                        style={{ background: "var(--pastel-mint)", color: "var(--ink)" }}
                      >
                        {formatDateShort(p.dateKey)}
                      </span>
                      <span className="font-mono font-semibold">{range}</span>
                      {r ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold border-2"
                          style={{
                            background: r.color,
                            color: "#fff",
                            borderColor: "var(--ink)",
                          }}
                        >
                          {r.label}
                        </span>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-bold border-2"
                          style={{
                            borderColor: "var(--ink)",
                            background: "var(--card-soft, var(--card))",
                            color: "var(--ink-soft)",
                          }}
                        >
                          Busy
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {members.length === 0 && (
        <div className="neo-card p-6 text-center" data-testid="schedule-empty">
          <p style={{ color: "var(--ink-soft)" }}>No members yet.</p>
        </div>
      )}
    </div>
  );
}

/**
 * Flatten a member's busy slots into pills (one per consecutive same-reason
 * run), sorted by date then start-minute.  Works at any minute precision.
 */
function buildPills(slots, visibleKeys) {
  const byDate = {};
  for (const s of slots || []) {
    if (s.status !== "busy") continue;
    if (s.mode !== "date") continue;
    if (visibleKeys && !visibleKeys.has(s.key)) continue;
    const startMin = s.hour * 60 + (s.minute || 0);
    const endMin = startMin + (s.step || 60);
    if (!byDate[s.key]) byDate[s.key] = [];
    byDate[s.key].push({ startMin, endMin, reason_id: s.reason_id || null });
  }
  const out = [];
  for (const dateKey of Object.keys(byDate).sort()) {
    const arr = byDate[dateKey].sort((a, b) => a.startMin - b.startMin);
    let cur = null;
    for (const s of arr) {
      if (
        cur &&
        s.startMin <= cur.endMin && // contiguous or overlapping
        (s.reason_id || null) === (cur.reason_id || null)
      ) {
        cur.endMin = Math.max(cur.endMin, s.endMin);
      } else {
        if (cur) out.push(cur);
        cur = {
          dateKey,
          startMin: s.startMin,
          endMin: s.endMin,
          reason_id: s.reason_id,
        };
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}
