import { useMemo } from "react";
import {
  buildTimeSlots,
  timeLabel,
  buildSlotMap,
  buildBusyIndex,
  memberStatusAt,
  dateToDayIdx,
} from "../lib/schedule";
import { TrendingUp, Flame, Clock } from "lucide-react";

/**
 * QuickStats: 3 highlights for the current view, computed at the active
 * `minuteStep` precision.
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

    let bestCount = -1;
    let bestLabel = null;

    // grid[col][slotIdx] = freeCount
    const grid = columns.map((col) => {
      const row = slotsList.map(({ hour, minute }) => {
        let free = 0;
        for (const m of enriched) {
          let st = memberStatusAt(m, mode, col.key, hour, minute, minuteStep);
          if (st.status === "free" && mode === "date") {
            const dayIdx = dateToDayIdx(col.key);
            const w = memberStatusAt(m, "weekly", `d${dayIdx}`, hour, minute, minuteStep);
            if (w.status === "busy") st = w;
          }
          if (st.status === "free") free++;
        }
        if (free > bestCount) {
          bestCount = free;
          bestLabel = `${col.label} · ${timeLabel(hour, minute)}`;
        }
        return free;
      });
      return { col, row };
    });

    // Longest streak of everyone-free consecutive slots in a single day.
    // Streak is reported in minutes for clarity.
    let streak = { minutes: 0, colLabel: null, startSlot: null, endSlot: null };
    if (total > 0) {
      for (const { col, row } of grid) {
        let cur = 0;
        let curStartIdx = null;
        for (let i = 0; i < row.length; i++) {
          if (row[i] === total) {
            if (cur === 0) curStartIdx = i;
            cur++;
            const lengthMins = cur * minuteStep;
            if (lengthMins > streak.minutes) {
              streak = {
                minutes: lengthMins,
                colLabel: col.label,
                startSlot: slotsList[curStartIdx],
                endSlot: slotsList[i],
              };
            }
          } else {
            cur = 0;
            curStartIdx = null;
          }
        }
      }
    }

    // Top free time-of-day (by start-of-block label) averaged across visible columns.
    let topSlot = { idx: -1, avg: -1 };
    if (columns.length > 0 && total > 0) {
      for (let i = 0; i < slotsList.length; i++) {
        let sum = 0;
        for (const { row } of grid) sum += row[i];
        const avg = sum / columns.length;
        if (avg > topSlot.avg) topSlot = { idx: i, avg };
      }
    }

    return {
      total,
      bestCount: Math.max(bestCount, 0),
      bestLabel,
      streak,
      topSlot,
      slotsList,
    };
  }, [members, columns, mode, hourFrom, hourTo, minuteStep]);

  // Format helpers
  const fmtStreak = () => {
    if (stats.streak.minutes <= 0) return "—";
    const m = stats.streak.minutes;
    if (m % 60 === 0) return `${m / 60} hr${m === 60 ? "" : "s"}`;
    if (m < 60) return `${m} min`;
    return `${Math.floor(m / 60)} hr ${m % 60} min`;
  };

  const fmtStreakRange = () => {
    if (!stats.streak.startSlot) return "No everyone-free streak";
    const a = stats.streak.startSlot;
    const b = stats.streak.endSlot;
    // end label = end of last cell
    const endTotal = b.hour * 60 + b.minute + minuteStep;
    const endH = Math.min(23, Math.floor(endTotal / 60));
    const endM = endTotal % 60;
    return `${stats.streak.colLabel} · ${timeLabel(a.hour, a.minute)}–${timeLabel(endH, endM)}`;
  };

  const topSlotEntry = stats.topSlot.idx >= 0 ? stats.slotsList[stats.topSlot.idx] : null;

  return (
    <div className="neo-card p-5 bg-[var(--pastel-mint)]" data-testid="quick-stats-card">
      <div className="label-caps mb-3 flex items-center gap-2">
        <TrendingUp className="w-4 h-4" /> Quick stats
      </div>
      <ul className="space-y-3 text-sm">
        <StatRow
          icon={<TrendingUp className="w-3.5 h-3.5" />}
          label="Best overlap"
          value={stats.bestLabel ? `${stats.bestCount}/${stats.total}` : "—"}
          sub={stats.bestLabel || "No data"}
          testId="stat-best-overlap"
        />
        <StatRow
          icon={<Flame className="w-3.5 h-3.5" />}
          label="Longest free streak"
          value={fmtStreak()}
          sub={fmtStreakRange()}
          testId="stat-longest-streak"
        />
        <StatRow
          icon={<Clock className="w-3.5 h-3.5" />}
          label="Top free time slot"
          value={topSlotEntry && stats.total > 0 ? timeLabel(topSlotEntry.hour, topSlotEntry.minute) : "—"}
          sub={
            topSlotEntry && stats.total > 0
              ? `${stats.topSlot.avg.toFixed(1)} avg free / day`
              : "No data"
          }
          testId="stat-top-hour"
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
          <div className="text-[11px] truncate" style={{ color: "var(--ink-soft)" }}>
            {sub}
          </div>
        )}
      </div>
    </li>
  );
}
