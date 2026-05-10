import { useEffect, useState } from "react";
import { Smartphone, Monitor, Wand2 } from "lucide-react";

/**
 * Layout preview override.
 *
 * The Group page auto-switches between the desktop horizontal layout and the
 * mobile native-app stack at the 1024px breakpoint. This component lets the
 * user *force* a layout (overriding the breakpoint) so they can preview the
 * mobile experience on a desktop monitor without resizing the window — and
 * vice-versa.
 *
 * State is persisted to localStorage under `planit:layout-mode` and can be
 * one of: `auto` | `mobile` | `desktop`. The Group page's `useIsDesktop()`
 * hook reads the same key on every storage event, so flipping the toggle
 * reflows the page instantly.
 */
const STORAGE_KEY = "planit:layout-mode";

export function getLayoutMode() {
  if (typeof window === "undefined") return "auto";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "mobile" || v === "desktop" || v === "auto") return v;
  } catch (_) {
    /* ignore */
  }
  return "auto";
}

export function setLayoutMode(mode) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    // Notify same-tab listeners (storage event only fires across tabs).
    window.dispatchEvent(new CustomEvent("planit:layout-mode-change", { detail: mode }));
  } catch (_) {
    /* ignore */
  }
}

const OPTIONS = [
  { key: "auto",    label: "Auto",    Icon: Wand2,      hint: "Match window size" },
  { key: "mobile",  label: "Mobile",  Icon: Smartphone, hint: "Force mobile layout" },
  { key: "desktop", label: "Desktop", Icon: Monitor,    hint: "Force desktop layout" },
];

/**
 * LayoutToggle — segmented 3-button control.
 *
 *   [ 🪄 Auto ] [ 📱 Mobile ] [ 🖥️ Desktop ]
 *
 * @param {object} props
 * @param {"compact"|"full"} props.variant — "compact" hides the labels;
 *   "full" shows them. Defaults to "full".
 */
export default function LayoutToggle({ variant = "full", className = "" }) {
  const [mode, setMode] = useState(getLayoutMode);

  // Stay in sync if another component (or another tab) flips the mode.
  useEffect(() => {
    const onChange = () => setMode(getLayoutMode());
    window.addEventListener("storage", onChange);
    window.addEventListener("planit:layout-mode-change", onChange);
    return () => {
      window.removeEventListener("storage", onChange);
      window.removeEventListener("planit:layout-mode-change", onChange);
    };
  }, []);

  const choose = (k) => {
    setMode(k);
    setLayoutMode(k);
  };

  return (
    <div
      role="radiogroup"
      aria-label="Layout preview"
      data-testid="layout-toggle"
      className={`inline-flex items-center gap-1 p-1 rounded-full ${className}`}
      style={{
        background: "var(--card)",
        border: "var(--stroke-width) solid var(--stroke)",
        boxShadow: "var(--stroke-shadow-sm)",
      }}
    >
      {OPTIONS.map(({ key, label, Icon, hint }) => {
        const active = mode === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            title={hint}
            data-testid={`layout-toggle-${key}`}
            onClick={() => choose(key)}
            className={`flex items-center gap-1.5 ${
              variant === "full" ? "px-3" : "px-2"
            } py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wider transition ${
              active ? "bg-slate-900 text-white" : ""
            }`}
            style={
              !active ? { color: "var(--ink-mute)" } : undefined
            }
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
            {variant === "full" && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
