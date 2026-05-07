// Static heatmap legend — read-only display.
// The heatmap palette is now driven entirely by CSS variables (--heat-0 … --heat-all)
// so it auto-switches between the light and dark themes. No customization.
const ROWS = [
  { v: "var(--heat-0)",   label: "Nobody free" },
  { v: "var(--heat-1)",   label: "A few free" },
  { v: "var(--heat-2)",   label: "Half free" },
  { v: "var(--heat-3)",   label: "Most free" },
  { v: "var(--heat-all)", label: "Everyone free" },
];

export default function LegendEditor() {
  return (
    <div className="neo-card p-4" data-testid="legend-display">
      <div className="label-caps mb-3">Heatmap legend</div>
      <ul className="space-y-2">
        {ROWS.map((row, i) => (
          <li key={i} className="flex items-center gap-3" data-testid={`legend-row-${i}`}>
            <span
              className="w-7 h-7 rounded-md border-2 shrink-0"
              style={{
                background: row.v,
                borderColor: "var(--ink)",
              }}
              aria-hidden="true"
            />
            <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
              {row.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
