import { useMemo } from "react";
import {
  buildTimeSlots,
  timeLabel,
  buildSlotMap,
  buildBusyIndex,
  memberStatusAt,
  dateToDayIdx,
} from "../lib/schedule";
import { CalendarHeart, Users2, Hourglass } from "lucide-react";

/**
 * QuickStats — three at-a-glance numbers for the visible heatmap window.
 *
 * 1. "Free day for everyone"   — the column where the crew has the most hours
 *                                of everyone-free overlap. Picks the day to
 *                                actually plan something on.
 * 2. "When the crew clashes"   — the time-of-day with the highest average
 *                                busy count across visible columns. Tells you
 *                                which hour to never pitch a hangout at.
 * 3. "Total free overlap"      — total hours across the visible window when
 *                                every member is simultaneously free. Shows
 *                                whether the week even has room for a plan.
 */
export default function QuickStats({
  members,
  columns,
  mode,
  hourFrom,
  hourTo,
  minuteStep = 60,
}) {
  const stats = useMemo(() => {
    const enriched = members.map((m) => ({
      ...m,
      _map: buildSlotMap(m.slots),
      _idx: buildBusyIndex(m.slots),
    }));
    const total = enriched.length;
    const slotsList = buildTimeSlots(hourFrom, hourTo, minuteStep);

    // grid[col][slotIdx] = freeCount (how many members are free in that cell).
    const grid = columns.map((col) => {
      const row = slotsList.map(({ hour, minute }) => {
        let free = 0;
        for (const m of enriched) {
          let st = memberStatusAt(m, mode, col.key, hour, minute, minuteStep);
          // Weekly recurring busy overlays calendar-mode columns.
          if (st.status === "free" && mode === "date") {
            const dayIdx = dateToDayIdx(col.key);
            const w = memberStatusAt(m, "weekly", `d${dayIdx}`, hour, minute, minuteStep);
            if (w.status === "busy") st = w;
          }
          if (st.status === "free") free++;
        }
        return free;
      });
      return { col, row };
    });

    // ── Stat 1 — best free day for everyone.
    // Count cells where ALL members are free, per column. Pick the column
    // with the most such cells. Convert to minutes for the headline.
    let bestDay = { colLabel: null, minutes: 0 };
    if (total > 0) {
      for (const { col, row } of grid) {
        let cells = 0;
        for (const f of row) {
          if (f === total) cells += 1;
        }
        const minutes = cells * minuteStep;
        if (minutes > bestDay.minutes) {
          bestDay = { colLabel: col.label, minutes };
        }
      }
    }

    // ── Stat 2 — most-clashed time-of-day.
    // For each row index, average the BUSY count across columns. Pick the row
    // with the highest average busy count.
    let clashSlot = { idx: -1, avgBusy: -1 };
    if (columns.length > 0 && total > 0) {
      for (let i = 0; i < slotsList.length; i++) {
        let sumBusy = 0;
        for (const { row } of grid) sumBusy += total - row[i];
        const avgBusy = sumBusy / columns.length;
        if (avgBusy > clashSlot.avgBusy) clashSlot = { idx: i, avgBusy };
      }
    }

    // ── Stat 3 — total free overlap minutes across the visible window.
    let overlapMinutes = 0;
    let overlapDays = 0;
    if (total > 0) {
      for (const { row } of grid) {
        let dayHadOverlap = false;
        for (const f of row) {
          if (f === total) {
            overlapMinutes += minuteStep;
            dayHadOverlap = true;
          }
        }
        if (dayHadOverlap) overlapDays += 1;
      }
    }

    return {
      total,
      bestDay,
      clashSlot,
      overlapMinutes,
      overlapDays,
      slotsList,
    };
  }, [members, columns, mode, hourFrom, hourTo, minuteStep]);

  // ── Formatters ────────────────────────────────────────────────────────
  const fmtMinutes = (m) => {
    if (!m || m <= 0) return "0 hr";
    if (m % 60 === 0) return `${m / 60} hr${m === 60 ? "" : "s"}`;
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} hr ${m % 60} min`;
  };

  const clashEntry =
    stats.clashSlot.idx >= 0 ? stats.slotsList[stats.clashSlot.idx] : null;
  const clashAvg = stats.clashSlot.avgBusy;
  const clashPct =
    stats.total > 0 && clashAvg >= 0
      ? Math.round((clashAvg / stats.total) * 100)
      : 0;

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="neo-card p-5 bg-[var(--pastel-mint)]" data-testid="quick-stats-card">
      <div className="label-caps mb-3 flex items-center gap-2">
        <CalendarHeart className="w-4 h-4" /> Quick stats
      </div>
      <ul className="space-y-3 text-sm">
        {/* 1. The free day for everyone */}
        <StatRow
          icon={<CalendarHeart className="w-3.5 h-3.5" />}
          label="Free day for everyone"
          value={
            stats.total > 0 && stats.bestDay.minutes > 0
              ? stats.bestDay.colLabel
              : "—"
          }
          testId="stat-free-day"
        />

        {/* 2. When the crew clashes */}
        <StatRow
          icon={<Users2 className="w-3.5 h-3.5" />}
          label="When the crew clashes"
          value={
            clashEntry && stats.total > 0
              ? timeLabel(clashEntry.hour, clashEntry.minute)
              : "—"
          }
          testId="stat-crew-clash"
        />

        {/* 3. Total free overlap this week */}
        <StatRow
          icon={<Hourglass className="w-3.5 h-3.5" />}
          label="Total free overlap"
          value={
            stats.total > 0 ? fmtMinutes(stats.overlapMinutes) : "—"
          }
          testId="stat-total-overlap"
        />
      </ul>
    </div>
  );
}

function StatRow({ icon, label, value, sub, testId }) {
  return (
    <li className="flex items-start gap-2" data-testid={testId}>
      <span
        className="w-6 h-6 rounded-full border-2 grid place-items-center shrink-0"
        style={{ borderColor: "var(--ink)", background: "var(--card)" }}
      >
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="label-caps text-[10px]" style={{ color: "var(--ink-soft)" }}>
          {label}
        </div>
        <div className="font-heading font-black text-lg leading-tight">{value}</div>
        {sub && (
          <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {sub}
          </div>
        )}
      </div>
    </li>
  );
}
