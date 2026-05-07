import { useEffect, useRef, useState } from "react";
import { updateGroup } from "../lib/api";
import { toast } from "sonner";
import { Palette, RotateCcw } from "lucide-react";

const LABELS = [
  "Nobody free",
  "A few free",
  "Half free",
  "Most free",
  "Everyone free",
];
const DEFAULTS = ["#0f0224", "#7b1fe3", "#c026d3", "#e879f9", "#fae8ff"];

export default function LegendEditor({ code, colors, onUpdated }) {
  const [draft, setDraft] = useState(colors);
  const [openIdx, setOpenIdx] = useState(null);
  const [saving, setSaving] = useState(false);
  const popRef = useRef(null);

  useEffect(() => setDraft(colors), [colors]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target)) setOpenIdx(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const save = async (next) => {
    setSaving(true);
    try {
      const g = await updateGroup(code, { heat_colors: next });
      onUpdated && onUpdated(g.heat_colors);
      toast.success("Legend updated for the group");
    } catch {
      toast.error("Could not save legend");
      setDraft(colors); // revert
    } finally {
      setSaving(false);
    }
  };

  const onPick = (idx, hex) => {
    const next = [...draft];
    next[idx] = hex;
    setDraft(next);
  };
  const onCommit = (idx) => {
    setOpenIdx(null);
    if (draft[idx] !== colors[idx]) save(draft);
  };

  const onReset = () => {
    setDraft(DEFAULTS);
    save(DEFAULTS);
  };

  const effective = (draft && draft.length === 5) ? draft : DEFAULTS;

  return (
    <div className="neo-card p-5 bg-[var(--pastel-yellow)]" data-testid="legend-editor">
      <div className="flex items-center justify-between mb-3">
        <div className="label-caps flex items-center gap-2">
          <Palette className="w-4 h-4" /> Heatmap legend
        </div>
        <button
          onClick={onReset}
          className="text-[11px] font-bold flex items-center gap-1 hover:underline"
          style={{ color: "var(--ink-soft)" }}
          title="Reset colors"
          data-testid="legend-reset-btn"
        >
          <RotateCcw className="w-3 h-3" /> Reset
        </button>
      </div>

      <div className="space-y-2 text-sm relative" ref={popRef}>
        {LABELS.map((label, idx) => (
          <div key={idx} className="flex items-center gap-2" data-testid={`legend-row-${idx}`}>
            <button
              onClick={() => setOpenIdx(openIdx === idx ? null : idx)}
              className="w-6 h-6 rounded border-2 hover:scale-110 transition"
              style={{
                borderColor: "var(--ink)",
                background: effective[idx],
                boxShadow: idx === 4 ? "0 0 0 2px rgba(15,23,42,0.15)" : undefined,
              }}
              aria-label={`Edit color for ${label}`}
              data-testid={`legend-swatch-${idx}`}
            />
            <span className="flex-1">{label}</span>
            <span
              className="text-[10px] font-mono"
              style={{ color: "var(--ink-mute)" }}
            >
              {effective[idx].toUpperCase()}
            </span>
            {openIdx === idx && (
              <div
                className="absolute left-0 right-0 z-30 neo-card p-3 mt-1"
                style={{ top: `${(idx + 1) * 32}px`, background: "var(--card)" }}
                data-testid={`legend-picker-${idx}`}
              >
                <div className="label-caps mb-2 text-[10px]">{label} color</div>
                <input
                  type="color"
                  value={effective[idx]}
                  onChange={(e) => onPick(idx, e.target.value)}
                  onBlur={() => onCommit(idx)}
                  className="w-full h-10 border-2 rounded cursor-pointer"
                  style={{ borderColor: "var(--ink)" }}
                  data-testid={`legend-color-input-${idx}`}
                />
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      onPick(idx, colors[idx]); // revert
                      setOpenIdx(null);
                    }}
                    className="neo-btn ghost text-xs flex-1"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onCommit(idx)}
                    disabled={saving}
                    className="neo-btn pastel text-xs flex-1"
                    data-testid={`legend-apply-${idx}`}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px]" style={{ color: "var(--ink-soft)" }}>
        Colors are shared with the whole group.
      </p>
    </div>
  );
}
