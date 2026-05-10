/**
 * HeatmapLegendStrip — compact 5-cell gradient legend.
 *
 * Five separate, individually-bordered cells (free → not free) flanked by
 * "FREE" and "NOT FREE" labels. Sized small enough to fit on a single row
 * across the mobile heatmap card without horizontal scroll.
 *
 * Colour stops (left → right):
 *   --heat-all → --heat-3 → --heat-2 → --heat-1 → --heat-0
 *   (everyone free → nobody free)
 *
 * Backed by the same CSS variables as HeatmapGrid so it auto-flips for
 * light/dark theme.
 */
export default function HeatmapLegendStrip({ className = "" }) {
  const STOPS = [
    "var(--heat-all)",
    "var(--heat-3)",
    "var(--heat-2)",
    "var(--heat-1)",
    "var(--heat-0)",
  ];
  return (
    <div
      className={`neo-card p-3 flex items-center justify-between gap-2 ${className}`}
      data-testid="heatmap-legend-strip"
    >
      <span
        className="text-[10px] font-extrabold uppercase tracking-widest shrink-0"
        style={{ color: "var(--ink)" }}
      >
        Free
      </span>
      <div className="flex items-center gap-1.5" aria-hidden="true">
        {STOPS.map((stop, i) => (
          <span
            key={i}
            data-testid={`legend-strip-${i}`}
            className="w-6 h-6 rounded-md border-2 shrink-0"
            style={{
              borderColor: "var(--ink)",
              background: stop,
            }}
          />
        ))}
      </div>
      <span
        className="text-[10px] font-extrabold uppercase tracking-widest shrink-0"
        style={{ color: "var(--ink)" }}
      >
        Not free
      </span>
    </div>
  );
}
