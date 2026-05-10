/**
 * HeatmapLegendStrip — compact 5-box gradient legend.
 *
 * Renders a single horizontal strip of the heatmap palette, with "Free"
 * on the left and "Not free" on the right. Replaces the verbose stacked
 * `LegendEditor` block + helper text on mobile so the user gets the full
 * meaning of the heat colours in a glance.
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
      className={`neo-card p-3 flex items-center gap-3 ${className}`}
      data-testid="heatmap-legend-strip"
    >
      <span
        className="text-[10px] font-extrabold uppercase tracking-widest shrink-0"
        style={{ color: "var(--ink)" }}
      >
        Free
      </span>
      <div
        className="flex-1 grid grid-cols-5 h-8 rounded-md overflow-hidden border-2"
        style={{ borderColor: "var(--ink)" }}
        aria-hidden="true"
      >
        {STOPS.map((stop, i) => (
          <span
            key={i}
            data-testid={`legend-strip-${i}`}
            style={{ background: stop }}
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
