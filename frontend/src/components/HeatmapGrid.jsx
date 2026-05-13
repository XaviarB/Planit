import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  // ── Horizontal scroll slider (pill/bubble shaped) ────────────────
  // Tracks the heatmap's horizontal scroll position so users can drag a
  // pill-shaped thumb across the bottom to see the rest of the heatmap
  // that's hidden off-screen (common on mobile where 24 hour columns
  // overflow, or on wide week views).
  const scrollRef = useRef(null);
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const [scrollState, setScrollState] = useState({
    hasOverflow: false,
    ratio: 1, // visible / total
    progress: 0, // 0..1 of scrollLeft / maxScroll
  });

  const measureScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollWidth, clientWidth, scrollLeft } = el;
    const hasOverflow = scrollWidth > clientWidth + 1;
    const ratio = hasOverflow ? clientWidth / scrollWidth : 1;
    const maxScroll = scrollWidth - clientWidth;
    const progress = maxScroll > 0 ? scrollLeft / maxScroll : 0;
    setScrollState((prev) => {
      if (
        prev.hasOverflow === hasOverflow &&
        Math.abs(prev.ratio - ratio) < 0.001 &&
        Math.abs(prev.progress - progress) < 0.001
      ) {
        return prev;
      }
      return { hasOverflow, ratio, progress };
    });
  }, []);

  useEffect(() => {
    measureScroll();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", measureScroll, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measureScroll) : null;
    if (ro) {
      ro.observe(el);
      if (el.firstElementChild) ro.observe(el.firstElementChild);
    }
    window.addEventListener("resize", measureScroll);
    return () => {
      el.removeEventListener("scroll", measureScroll);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", measureScroll);
    };
  }, [measureScroll, orientation, columns.length, timeSlots.length, minuteStep]);

  // Min thumb width so the bubble stays grabbable on huge overflows.
  const MIN_THUMB_PCT = 14;
  const thumbPct = Math.max(scrollState.ratio * 100, MIN_THUMB_PCT);
  const thumbLeftPct = scrollState.progress * (100 - thumbPct);

  const applyPointerToScroll = (clientX) => {
    const track = trackRef.current;
    const el = scrollRef.current;
    if (!track || !el) return;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.min(1, el.clientWidth / Math.max(1, el.scrollWidth));
    const tPct = Math.max(ratio * 100, MIN_THUMB_PCT);
    const thumbWidth = (tPct / 100) * rect.width;
    const usable = Math.max(1, rect.width - thumbWidth);
    let x = clientX - rect.left - thumbWidth / 2;
    x = Math.max(0, Math.min(usable, x));
    const progress = x / usable;
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollLeft = progress * maxScroll;
  };

  const onTrackPointerDown = (e) => {
    draggingRef.current = true;
    try {
      trackRef.current?.setPointerCapture?.(e.pointerId);
    } catch (_) {}
    applyPointerToScroll(e.clientX);
  };
  const onTrackPointerMove = (e) => {
    if (!draggingRef.current) return;
    applyPointerToScroll(e.clientX);
  };
  const onTrackPointerUp = (e) => {
    draggingRef.current = false;
    try {
      trackRef.current?.releasePointerCapture?.(e.pointerId);
    } catch (_) {}
  };

  const renderScrollSlider = () => {
    if (!scrollState.hasOverflow) return null;
    return (
      <div className="mt-3 sm:mt-4 px-0.5" data-testid="heatmap-scroll-slider">
        <div
          ref={trackRef}
          role="slider"
          aria-label="Scroll heatmap horizontally"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(scrollState.progress * 100)}
          tabIndex={0}
          className="relative h-6 rounded-full border-2 cursor-pointer select-none touch-none"
          style={{
            borderColor: "var(--ink)",
            background: "var(--pastel-mint)",
            boxShadow: "2px 2px 0 0 var(--ink)",
          }}
          onPointerDown={onTrackPointerDown}
          onPointerMove={onTrackPointerMove}
          onPointerUp={onTrackPointerUp}
          onPointerCancel={onTrackPointerUp}
          onKeyDown={(e) => {
            const el = scrollRef.current;
            if (!el) return;
            const step = Math.max(40, el.clientWidth * 0.2);
            if (e.key === "ArrowLeft") {
              el.scrollLeft = Math.max(0, el.scrollLeft - step);
              e.preventDefault();
            } else if (e.key === "ArrowRight") {
              el.scrollLeft = Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + step);
              e.preventDefault();
            } else if (e.key === "Home") {
              el.scrollLeft = 0;
              e.preventDefault();
            } else if (e.key === "End") {
              el.scrollLeft = el.scrollWidth - el.clientWidth;
              e.preventDefault();
            }
          }}
          data-testid="heatmap-scroll-slider-track"
        >
          <div
            className="absolute top-1/2 -translate-y-1/2 h-4 rounded-full border-2 flex items-center justify-center"
            style={{
              borderColor: "var(--ink)",
              background: "var(--ink)",
              width: `${thumbPct}%`,
              left: `${thumbLeftPct}%`,
              boxShadow: "1px 1px 0 0 var(--ink)",
              transition: draggingRef.current ? "none" : "left 80ms linear",
            }}
            data-testid="heatmap-scroll-slider-thumb"
          >
            {/* Grip dots — three little circles, same vocabulary as the
                rest of the brutalist UI bubbles. */}
            <span className="flex items-center gap-1">
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--pastel-mint)" }} />
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--pastel-mint)" }} />
              <span className="w-1 h-1 rounded-full" style={{ background: "var(--pastel-mint)" }} />
            </span>
          </div>
        </div>
      </div>
    );
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
             tightly so the row never clips on narrow phones (≤375px).
             Order: NOT FREE (darkest, heat-0) on the left → FREE (lightest,
             heat-all) on the right, mirroring how people read severity. */
          <div
            className="flex items-center gap-1 shrink-0"
            aria-hidden="true"
            data-testid="heatmap-legend-strip"
          >
            {["var(--heat-0)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-all)"].map(
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
        <>
        <div className="scroll-x" ref={scrollRef}>
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
        {renderScrollSlider()}
        </>
      ) : (
        // ── Default: hours on rows, days on columns ─────────────────────
        <>
        <div className="scroll-x" ref={scrollRef}>
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
        {renderScrollSlider()}
        </>
      )}
    </div>
  );
}
