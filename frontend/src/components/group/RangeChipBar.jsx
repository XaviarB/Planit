import { useState } from "react";
import { currentWeekBounds } from "../../lib/schedule";
import { isoPlus } from "./dateUtils";

// Hour presets used by the range chip bar.
const HOUR_PRESETS = [
  { id: "all",       label: "All day",   from: 0,  to: 23 },
  { id: "morning",   label: "Morning",   from: 6,  to: 11 },
  { id: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { id: "evening",   label: "Evening",   from: 18, to: 23 },
];

// Compact "When/Hours" preset chip bar for editing-mode and the members tab.
// Hidden by Group.jsx in recurring mode and in the Sync-Our-Orbits view.
export default function RangeChipBar({
  rangeStart,
  rangeEnd,
  setRangeStart,
  setRangeEnd,
  hourFrom,
  hourTo,
  setHourFrom,
  setHourTo,
  now,
  dayCount,
}) {
  const today = (() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const week = currentWeekBounds(now);
  const datePresets = [
    { id: "this-week", label: "This week",     start: week.monday,    end: week.sunday },
    { id: "next-7",    label: "Next 7 days",   start: today,          end: isoPlus(today, 6) },
    { id: "next-14",   label: "Next 14 days",  start: today,          end: isoPlus(today, 13) },
  ];
  const activeDate = datePresets.find((p) => p.start === rangeStart && p.end === rangeEnd);
  const activeHour = HOUR_PRESETS.find((p) => p.from === hourFrom && p.to === hourTo);

  const [showCustomDate, setShowCustomDate] = useState(!activeDate);
  const [showCustomHours, setShowCustomHours] = useState(!activeHour);

  const applyDate = (p) => {
    setRangeStart(p.start);
    setRangeEnd(p.end);
    setShowCustomDate(false);
  };
  const applyHour = (p) => {
    setHourFrom(p.from);
    setHourTo(p.to);
    setShowCustomHours(false);
  };

  return (
    <div className="neo-card p-4 sm:p-5" data-testid="range-controls">
      {/* Date presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps shrink-0 mr-1">When</span>
        {datePresets.map((p) => (
          <Chip
            key={p.id}
            active={!showCustomDate && activeDate?.id === p.id}
            onClick={() => applyDate(p)}
            testId={`date-preset-${p.id}`}
          >
            {p.label}
          </Chip>
        ))}
        <Chip
          active={showCustomDate || !activeDate}
          onClick={() => setShowCustomDate((v) => !v)}
          testId="date-preset-custom"
        >
          Custom…
        </Chip>
      </div>

      {/* Hour presets */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="label-caps shrink-0 mr-1">Hours</span>
        {HOUR_PRESETS.map((p) => (
          <Chip
            key={p.id}
            active={!showCustomHours && activeHour?.id === p.id}
            onClick={() => applyHour(p)}
            testId={`hour-preset-${p.id}`}
          >
            {p.label}
          </Chip>
        ))}
        <Chip
          active={showCustomHours || !activeHour}
          onClick={() => setShowCustomHours((v) => !v)}
          testId="hour-preset-custom"
        >
          Custom…
        </Chip>
      </div>

      {/* Custom date picker — only when the user explicitly toggles it. */}
      {showCustomDate && (
        <div
          className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t-2 border-dashed"
          style={{ borderColor: "var(--ink)", borderTopStyle: "dashed", opacity: 1 }}
        >
          <input
            type="date"
            className="neo-input text-sm"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            data-testid="range-start-input"
          />
          <span style={{ color: "var(--ink-mute)" }}>→</span>
          <input
            type="date"
            className="neo-input text-sm"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            data-testid="range-end-input"
          />
          <span className="text-xs" style={{ color: "var(--ink-mute)" }}>
            {dayCount} day{dayCount === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Custom hour picker. */}
      {showCustomHours && (
        <div
          className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t-2 border-dashed"
          style={{ borderColor: "var(--ink)", borderTopStyle: "dashed" }}
        >
          <select
            className="neo-input text-sm"
            value={hourFrom}
            onChange={(e) => {
              const v = Number(e.target.value);
              setHourFrom(v);
              if (v > hourTo) setHourTo(v);
            }}
            data-testid="hour-from-select"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
            ))}
          </select>
          <span style={{ color: "var(--ink-mute)" }}>→</span>
          <select
            className="neo-input text-sm"
            value={hourTo}
            onChange={(e) => {
              const v = Number(e.target.value);
              setHourTo(v);
              if (v < hourFrom) setHourFrom(v);
            }}
            data-testid="hour-to-select"
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="text-xs sm:text-sm font-bold rounded-full px-3 py-1.5 border-2 transition"
      style={{
        background: active ? "var(--ink)" : "var(--card)",
        color: active ? "var(--btn-fg)" : "var(--ink)",
        borderColor: "var(--ink)",
        boxShadow: active ? "2px 2px 0 0 var(--ink)" : "none",
      }}
    >
      {children}
    </button>
  );
}
