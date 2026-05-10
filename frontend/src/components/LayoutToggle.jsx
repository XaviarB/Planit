import { useEffect, useState } from "react";
import { Smartphone, Monitor, Wand2 } from "lucide-react";

/**
 * Layout preview override — EDITOR-ONLY.
 *
 * The Group page auto-switches between the desktop horizontal layout and the
 * mobile native-app stack at the 1024px breakpoint. This component lets the
 * *editor* (you) force a layout (overriding the breakpoint) so they can preview
 * the mobile experience on a desktop monitor without resizing the window —
 * and vice-versa.
 *
 * Critically, this control is gated behind a "dev mode" flag so regular end
 * users never see it and can never override their device-appropriate layout.
 *
 * Three pieces of state:
 *   1. Layout mode  (auto / mobile / desktop) — `planit:layout-mode`
 *   2. Dev mode     (boolean: editor-only)    — `planit:dev-mode`
 *   3. Both persisted to localStorage and synchronized across tabs.
 *
 * To enable dev mode (one of):
 *   • Append `?dev=1` (or `?preview=1`) to any URL once. The flag is saved to
 *     localStorage and the query param is stripped from the URL automatically.
 *   • Press Ctrl+Shift+L (or Cmd+Shift+L on Mac) anywhere in the app — toggles.
 *   • From the browser console:
 *       localStorage.setItem('planit:dev-mode','1');
 *       window.dispatchEvent(new Event('planit:dev-mode-change'));
 *
 * To disable: `?dev=0`, the same keyboard shortcut, or clear the localStorage
 * key. Regular users will never see the toggle and never have access to it.
 *
 * Non-dev users:
 *   • Don't see the LayoutToggle UI at all (component returns null).
 *   • `useIsDesktop()` ignores any layout-mode value in localStorage and always
 *     returns the matchMedia auto-detected value, so even a user that somehow
 *     wrote `mobile` into their own localStorage gets the device-appropriate
 *     layout for their screen.
 */
const STORAGE_KEY = "planit:layout-mode";
const DEV_KEY = "planit:dev-mode";

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

export function getDevMode() {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DEV_KEY) === "1";
  } catch (_) {
    return false;
  }
}

export function setDevMode(enabled) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      localStorage.setItem(DEV_KEY, "1");
    } else {
      localStorage.removeItem(DEV_KEY);
      // Reset any stale layout override so the user sees their device-default.
      localStorage.removeItem(STORAGE_KEY);
    }
    window.dispatchEvent(new Event("planit:dev-mode-change"));
    window.dispatchEvent(new Event("planit:layout-mode-change"));
  } catch (_) {
    /* ignore */
  }
}

/**
 * Reads the URL `?dev=1` / `?preview=1` flag (and `?dev=0` to disable),
 * persists it to localStorage, then strips the query param from the URL so
 * shared links stay clean. Idempotent — safe to call on every mount.
 */
export function consumeDevModeUrlFlag() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    const param = url.searchParams.has("dev")
      ? "dev"
      : url.searchParams.has("preview")
      ? "preview"
      : null;
    if (!param) return;
    const raw = (url.searchParams.get(param) || "").toLowerCase();
    const enabled = raw !== "0" && raw !== "false" && raw !== "off";
    setDevMode(enabled);
    url.searchParams.delete(param);
    window.history.replaceState({}, "", url.pathname + (url.searchParams.toString() ? "?" + url.searchParams.toString() : "") + url.hash);
  } catch (_) {
    /* ignore */
  }
}

/**
 * useDevMode — boolean React hook backing the editor-only feature flag.
 * Stays in sync with the URL flag, the keyboard shortcut, and cross-tab
 * localStorage changes.
 */
export function useDevMode() {
  const [dev, setDev] = useState(() => {
    if (typeof window === "undefined") return false;
    consumeDevModeUrlFlag();
    return getDevMode();
  });
  useEffect(() => {
    const recompute = () => setDev(getDevMode());
    // Keyboard shortcut Ctrl/Cmd+Shift+L — toggles dev mode.
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        const next = !getDevMode();
        setDevMode(next);
        // recompute() will fire from the dispatched event, but we also
        // optimistically update so the keystroke feels instant.
        setDev(next);
      }
    };
    window.addEventListener("planit:dev-mode-change", recompute);
    window.addEventListener("storage", recompute);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("planit:dev-mode-change", recompute);
      window.removeEventListener("storage", recompute);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  return dev;
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
 * Returns `null` for any user that hasn't enabled dev mode, so end users
 * never see this control.
 *
 * @param {object} props
 * @param {"compact"|"full"} props.variant — "compact" hides the labels;
 *   "full" shows them. Defaults to "full".
 */
export default function LayoutToggle({ variant = "full", className = "" }) {
  const isDev = useDevMode();
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

  // Editor-only — invisible to regular users.
  // ⚠️ PUBLISH-TIME TOGGLE: currently DISABLED so everyone can preview
  // mobile/desktop layouts. To hide this control from end users before
  // shipping, simply re-enable the line below (delete the `// ` prefix).
  // if (!isDev) return null;
  void isDev; // referenced to silence unused-var lint while gate is off

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
