import { useState } from "react";
import { Palette, Plus, X } from "lucide-react";

// Color wheel / hue gradient picker (HSL-based) + label → "busy reason"
export default function BusyReasons({ reasons, onAdd, onDelete }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [hue, setHue] = useState(180);
  const [sat, setSat] = useState(55);
  const [light, setLight] = useState(60);

  const color = hslToHex(hue, sat, light);

  const submit = async () => {
    if (!label.trim()) return;
    await onAdd(label.trim(), color);
    setLabel("");
    setOpen(false);
  };

  return (
    <div className="neo-card p-5" data-testid="busy-reasons-card">
      <div className="flex items-center justify-between mb-3">
        <div className="label-caps flex items-center gap-2">
          <Palette className="w-4 h-4" /> Busy reasons
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-7 h-7 rounded-full border-2 border-slate-900 bg-[var(--pastel-mint)] grid place-items-center hover:bg-[var(--pastel-yellow)]"
          data-testid="add-reason-toggle-btn"
          aria-label="Add reason"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <ul className="space-y-2 mb-3">
        {reasons.map((r) => (
          <li key={r.id} className="flex items-center gap-2 text-sm" data-testid={`reason-row-${r.id}`}>
            <span
              className="w-6 h-6 rounded-full border-2 border-slate-900 shrink-0"
              style={{ background: r.color }}
            />
            <span className="font-medium flex-1">{r.label}</span>
            <button
              onClick={() => onDelete(r.id)}
              className="opacity-60 hover:opacity-100"
              data-testid={`delete-reason-${r.id}`}
              aria-label={`Delete ${r.label}`}
            >
              <X className="w-4 h-4" />
            </button>
          </li>
        ))}
        {reasons.length === 0 && (
          <li className="text-xs text-slate-500">No reasons yet. Add your first!</li>
        )}
      </ul>

      {open && (
        <div className="border-t-2 border-slate-900 pt-4 mt-3 space-y-3" data-testid="reason-builder">
          <input
            className="neo-input w-full"
            placeholder="Label (e.g. Commute)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            data-testid="reason-label-input"
          />

          {/* Color preview + swatch */}
          <div className="flex items-center gap-3">
            <div
              className="w-14 h-14 rounded-xl border-2 border-slate-900"
              style={{ background: color }}
              data-testid="reason-color-preview"
            />
            <div className="text-xs font-mono">{color.toUpperCase()}</div>
          </div>

          {/* Hue slider (color wheel strip) */}
          <div>
            <div className="label-caps text-[10px] mb-1">Hue</div>
            <input
              type="range"
              min={0}
              max={360}
              value={hue}
              onChange={(e) => setHue(Number(e.target.value))}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{
                background:
                  "linear-gradient(to right, hsl(0 70% 60%), hsl(60 70% 60%), hsl(120 70% 60%), hsl(180 70% 60%), hsl(240 70% 60%), hsl(300 70% 60%), hsl(360 70% 60%))",
              }}
              data-testid="reason-hue-slider"
            />
          </div>
          <div>
            <div className="label-caps text-[10px] mb-1">Saturation</div>
            <input
              type="range"
              min={10}
              max={100}
              value={sat}
              onChange={(e) => setSat(Number(e.target.value))}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(${hue} 10% ${light}%), hsl(${hue} 100% ${light}%))`,
              }}
              data-testid="reason-sat-slider"
            />
          </div>
          <div>
            <div className="label-caps text-[10px] mb-1">Lightness</div>
            <input
              type="range"
              min={25}
              max={80}
              value={light}
              onChange={(e) => setLight(Number(e.target.value))}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, hsl(${hue} ${sat}% 25%), hsl(${hue} ${sat}% 55%), hsl(${hue} ${sat}% 80%))`,
              }}
              data-testid="reason-light-slider"
            />
          </div>

          <button onClick={submit} className="neo-btn w-full text-sm" data-testid="reason-submit-btn">
            Add reason
          </button>
        </div>
      )}
    </div>
  );
}

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const to = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}
