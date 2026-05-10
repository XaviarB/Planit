import { Fragment, useMemo, useState } from "react";
import { buildTimeSlots, timeLabel, heatColor, withSlotMap, memberStatusAt, dateToDayIdx } from "../lib/schedule";

/**
 * HeatmapGrid — group availability heatmap.
 *
 * Two orientations supported:
 *   - "hours-rows"  (default, desktop)  →  Rows = hours, Columns = days
 *   - "days-rows"   (mobile)            →  Rows = days,  Columns = hours
 *
 * The transposed mode is for the mobile dashboard so the heatmap reads as a
 * familiar weekly calendar strip: each day is a horizontal lane and time
 * scrolls left-to-right. Labels are auto-thinned (every 3rd hour) so we don't
 * try to fit 24 wide labels on a phone.
 */
export default function HeatmapGrid({
  members,
  reasons,
  columns,
  mode,
  hourFrom = 0,
  hourTo = 23,
  minuteStep = 60,
  heatColors,
  focusMode = false,
  compareCount = 0,
  orientation = "hours-rows",
}) {
  const enriched = useMemo(() => members.map(withSlotMap), [members]);
  const reasonMap = useMemo(() => {
    const m = {};
    for (const r of reasons) m[r.id] = r;
    return m;
  }, [reasons]);
  const [hover, setHover] = useState(null); // {ci, hi}

  const timeSlots = useMemo(
    () => buildTimeSlots(hourFrom, hourTo, minuteStep),
    [hourFrom, hourTo, minuteStep]
  );

  // Compute free count per (col, slot). Index as grid[hourIdx][colIdx].
  const grid = useMemo(() => {
    const rows = timeSlots.map(({ hour, minute }) =>
      columns.map((col) => {
        const freeMembers = [];
        const busyMembers = [];
        for (const m of enriched) {
          let st = memberStatusAt(m, mode, col.key, hour, minute, minuteStep);
          if (st.status === "free" && mode === "date") {
            const dayIdx = dateToDayIdx(col.key);
            const weeklyStatus = memberStatusAt(m, "weekly", `d${dayIdx}`, hour, minute, minuteStep);
            if (weeklyStatus.status === "busy") st = weeklyStatus;
          }
          if (st.status === "free") freeMembers.push(m);
          else busyMembers.push({ member: m, reason_id: st.reason_id });
        }
        return { free: freeMembers, busy: busyMembers };
      })
    );
    return rows;
  }, [enriched, columns, mode, timeSlots, minuteStep]);

  const transposed = orientation === "days-rows";

  // Row label visibility — only show the hour label on the :00 row when sub-hour.
  const rowLabel = (hour, minute) => {
    if (minute === 0) return timeLabel(hour, 0);
    return `:${String(minute).padStart(2, "0")}`;
  };

  // Compact hour label for the transposed (mobile) header strip.
  // Shows "12a", "3a"… every 3rd hour to keep the strip readable on a phone.
  const compactHourLabel = (hour, minute, idx) => {
    if (minute !== 0) return "";
    // Always show first/last; otherwise every 3rd hour at minute 0.
    const isEdge = idx === 0 || idx === timeSlots.length - 1;
    if (!isEdge && hour % 3 !== 0) return "";
    const isPM = hour >= 12;
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}${isPM ? "p" : "a"}`;
  };

  const renderTooltip = (cell, c, hour, minute, anchorClass) => {
    const total = enriched.length;
    return (
      <div
        className={`absolute ${anchorClass} z-30 w-72 neo-card p-4 text-xs pointer-events-none`}
        style={{ background: "var(--card)", color: "var(--ink)" }}
        data-testid={`heatmap-tooltip-${c.key}-${hour}-${minute}`}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="font-heading font-black text-base leading-tight">
              {c.label}
            </div>
            <div className="label-caps text-[10px]" style={{ color: "var(--ink-soft)" }}>
              {timeLabel(hour, minute)}
              {minuteStep < 60 && (
                <> · {minuteStep} min</>
              )}
            </div>
          </div>
          <div
            className="px-2.5 py-1 rounded-full border-2 font-heading font-black text-sm"
            style={{
              borderColor: "var(--ink)",
              background:
                cell.free.length === total && total > 0
                  ? "var(--heat-all)"
                  : "var(--pastel-mint)",
            }}
          >
            {cell.free.length}/{total}
          </div>
        </div>

        <div
          className="h-1.5 rounded-full overflow-hidden mb-3 border"
          style={{ borderColor: "var(--ink)", background: "var(--card-soft, var(--card))" }}
        >
          <div
            className="h-full"
            style={{
              width: total > 0 ? `${(cell.free.length / total) * 100}%` : "0%",
              background:
                cell.free.length === total && total > 0
                  ? "var(--heat-all)"
                  : "var(--heat-3)",
              transition: "width 0.2s ease",
            }}
          />
        </div>

        {cell.free.length > 0 && (
          <div className="mb-3">
            <div className="label-caps text-[9px] mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Free
            </div>
            <div className="flex flex-wrap gap-1.5">
              {cell.free.map((m) => (
                <span
                  key={m.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border-2"
                  style={{
                    borderColor: "var(--ink)",
                    background: m.color,
                    color: "#fff",
                  }}
                >
                  {m.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {cell.busy.length > 0 && (
          <div>
            <div className="label-caps text-[9px] mb-1.5" style={{ color: "var(--ink-soft)" }}>
              Busy
            </div>
            <ul className="space-y-1">
              {cell.busy.map(({ member, reason_id }) => {
                const r = reason_id ? reasonMap[reason_id] : null;
                return (
                  <li key={member.id} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full border-2 shrink-0"
                      style={{ borderColor: "var(--ink)", background: member.color }}
                    />
                    <span className="font-medium">{member.name}</span>
                    {r && (
                      <span
                        className="ml-auto px-2 py-0.5 text-[10px] rounded-full font-bold border-2"
                        style={{
                          background: r.color,
                          color: "#fff",
                          borderColor: "var(--ink)",
                        }}
                      >
                        {r.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {cell.free.length === 0 && cell.busy.length === 0 && (
          <div style={{ color: "var(--ink-mute)" }}>
            No data yet.
          </div>
        )}
      </div>
    );
  };

  // Cell color resolver — shared between orientations.
  const cellBg = (cell) => {
    const total = enriched.length;
    if (focusMode && total === 1) {
      if (cell.busy.length === 1) {
        const rid = cell.busy[0].reason_id;
        const r = rid ? reasonMap[rid] : null;
        return r ? r.color : "#E74C3C";
      }
      return "var(--heat-1)";
    }
    return heatColor(cell.free.length, total, heatColors);
  };

  return (
    <div className="neo-card p-4 sm:p-6" data-testid="heatmap" data-orientation={orientation}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="label-caps shrink-0">
          {compareCount >= 2
            ? `Comparison view · ${compareCount} members`
            : focusMode
            ? "Member schedule"
            : "Group availability heatmap"}
        </div>
        {transposed ? (
          /* Mobile: 5-cell gradient inline with the heading — only thing
             above the heatmap, no separate legend card. Cells are sized
             tightly so the row never clips on narrow phones (≤375px). */
          <div
            className="flex items-center gap-1 shrink-0"
            aria-hidden="true"
            data-testid="heatmap-legend-strip"
          >
            {["var(--heat-all)", "var(--heat-3)", "var(--heat-2)", "var(--heat-1)", "var(--heat-0)"].map(
              (stop, i) => (
                <span
                  key={i}
                  data-testid={`legend-strip-${i}`}
                  className="w-4 h-4 rounded-md border-2 shrink-0"
                  style={{ borderColor: "var(--ink)", background: stop }}
                />
              )
            )}
          </div>
        ) : (
          <div className="text-xs" style={{ color: "var(--ink-soft)" }}>
            Hover a cell for details
          </div>
        )}
      </div>

      {transposed ? (
        // ── Transposed: days on rows, hours on columns ──────────────────
        <div className="scroll-x">
          <div
            className="grid gap-1 min-w-fit"
            style={{
              // Slim hour columns so 24 fit on a phone with horizontal scroll.
              gridTemplateColumns: `52px repeat(${timeSlots.length}, minmax(22px, 1fr))`,
            }}
          >
            {/* Top-left blank */}
            <div />
            {/* Hour-strip header */}
            {timeSlots.map(({ hour, minute }, hi) => (
              <div
                key={`h-${hour}-${minute}`}
                className="text-[10px] font-semibold text-center py-1 leading-none"
                style={{
                  color:
                    minute === 0 && hour % 3 === 0
                      ? "var(--ink)"
                      : "var(--ink-mute)",
                }}
                data-testid={`heatmap-hour-${hour}-${minute}`}
              >
                {compactHourLabel(hour, minute, hi)}
              </div>
            ))}

            {/* One row per day */}
            {columns.map((c, ci) => (
              <Fragment key={`drow-${c.key}`}>
                <div
                  className="text-[11px] font-bold flex items-center justify-end pr-2 leading-tight"
                  style={{ color: "var(--ink)" }}
                  data-testid={`heatmap-row-${c.key}`}
                >
                  {c.label}
                </div>
                {timeSlots.map(({ hour, minute }, hi) => {
                  const cell = grid[hi][ci];
                  const bg = cellBg(cell);
                  const isHover = hover && hover.ci === ci && hover.hi === hi;
                  const total = timeSlots.length;
                  const anchorRight = total > 4 && hi >= total - 3;
                  const anchorLeft = total > 4 && hi <= 2;
                  const tipPos = anchorRight
                    ? "right-0 top-full mt-2"
                    : anchorLeft
                    ? "left-0 top-full mt-2"
                    : "left-1/2 -translate-x-1/2 top-full mt-2";
                  return (
                    <div
                      key={`${c.key}-${hour}-${minute}`}
                      className="heat-cell rounded-md relative"
                      style={{
                        background: bg,
                        minHeight: 28,
                      }}
                      onMouseEnter={() => setHover({ ci, hi })}
                      onMouseLeave={() => setHover(null)}
                      onClick={() =>
                        setHover((h) =>
                          h && h.ci === ci && h.hi === hi ? null : { ci, hi }
                        )
                      }
                      data-testid={`heatmap-cell-${c.key}-${hour}-${minute}`}
                      title={`${cell.free.length}/${enriched.length} free`}
                    >
                      {isHover && renderTooltip(cell, c, hour, minute, tipPos)}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      ) : (
        // ── Default: hours on rows, days on columns ─────────────────────
        <div className="scroll-x">
          <div
            className="grid gap-1 min-w-fit"
            style={{
              gridTemplateColumns: `64px repeat(${columns.length}, minmax(48px, 1fr))`,
            }}
          >
            {/* Top-left blank */}
            <div />
            {/* Column headers */}
            {columns.map((c) => (
              <div
                key={c.key}
                className="label-caps text-center py-1"
                data-testid={`heatmap-col-${c.key}`}
              >
                {c.label}
              </div>
            ))}

            {/* Rows */}
            {timeSlots.map(({ hour, minute }, hi) => (
              <Fragment key={`row-${hour}-${minute}`}>
                <div
                  className={`text-[11px] font-semibold flex items-center justify-end pr-2 ${
                    minute === 0 ? "text-slate-700" : "text-slate-400"
                  }`}
                >
                  {rowLabel(hour, minute)}
                </div>
                {columns.map((c, ci) => {
                  const cell = grid[hi][ci];
                  const bg = cellBg(cell);
                  const isHover = hover && hover.ci === ci && hover.hi === hi;
                  const colCount = columns.length;
                  const anchorRight = colCount > 2 && ci >= colCount - 2;
                  const anchorLeft = colCount > 2 && ci <= 1;
                  const tipPos = anchorRight
                    ? "right-0 top-full mt-2"
                    : anchorLeft
                    ? "left-0 top-full mt-2"
                    : "left-1/2 -translate-x-1/2 top-full mt-2";
                  return (
                    <div
                      key={`${c.key}-${hour}-${minute}`}
                      className="heat-cell rounded-md relative"
                      style={{ background: bg, minHeight: minuteStep === 60 ? 32 : minuteStep === 30 ? 22 : 18 }}
                      onMouseEnter={() => setHover({ ci, hi })}
                      onMouseLeave={() => setHover(null)}
                      data-testid={`heatmap-cell-${c.key}-${hour}-${minute}`}
                      title={`${cell.free.length}/${enriched.length} free`}
                    >
                      {isHover && renderTooltip(cell, c, hour, minute, tipPos)}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
