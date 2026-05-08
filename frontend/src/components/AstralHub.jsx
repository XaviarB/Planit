import { useEffect, useRef, useState } from "react";
import {
  Sparkles, X, Send, Shuffle, Clock, History, Wand2,
  ArrowRight, Loader2,
} from "lucide-react";
import AstralDrawer from "./AstralDrawer";
import MyToolsDrawer from "./MyToolsDrawer";

/**
 * AstralHub
 * ---------
 * A single sleek "one-block" menu that replaces the previous two-pill popover.
 * Surfaces every Astral function in one compact, visually consistent panel:
 *
 *   ┌─ ✨ astral ────────────────── × ─┐
 *   │  what's the vibe? (input)         │
 *   │  ───────────────────────────────  │
 *   │  ┌─────────┐  ┌─────────┐         │
 *   │  │ 🔀 remix│  │ 🕒 busy │         │
 *   │  └─────────┘  └─────────┘         │
 *   │  ┌─────────┐  ┌─────────┐         │
 *   │  │ 📜 hist │  │ 🪄 tools│         │
 *   │  └─────────┘  └─────────┘         │
 *   └───────────────────────────────────┘
 *
 * The block opens the full AstralDrawer / MyToolsDrawer for heavy-lift flows,
 * but always with state pre-filled & the relevant section auto-focused.
 *
 * Props:
 *   open, onClose       — visibility control
 *   anchor              — { side, offset } from FloatingLauncher (so the block
 *                         opens beside the orb, mirroring orb side)
 *   group, memberId, code, onGroupRefresh — passthroughs for the drawers
 */
export default function AstralHub({
  open,
  onClose,
  anchor,
  group,
  memberId,
  code,
  onGroupRefresh,
}) {
  const [windowBlurb, setWindowBlurb] = useState("");
  const [astralOpen, setAstralOpen] = useState(false);
  const [astralIntent, setAstralIntent] = useState(null); // "suggest" | "history" | "remix" | null
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsIntent, setToolsIntent] = useState(null); // "busy" | null
  const inputRef = useRef(null);
  const blockRef = useRef(null);

  // Reset transient state when the hub closes
  useEffect(() => {
    if (!open) {
      setAstralIntent(null);
      setToolsIntent(null);
    } else {
      // Auto-focus the input when the hub opens
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  // Close on outside click (ignore clicks within the drawers it spawns)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (blockRef.current?.contains(e.target)) return;
      // Don't auto-close while a drawer is open — drawers handle their own close.
      if (astralOpen || toolsOpen) return;
      // Don't close on FAB itself (it has its own toggle)
      const fab = document.querySelector('[data-testid="fab-toggle"]');
      if (fab && fab.contains(e.target)) return;
      onClose && onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open, onClose, astralOpen, toolsOpen]);

  // ESC closes the hub
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !astralOpen && !toolsOpen) onClose && onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, astralOpen, toolsOpen]);

  // Anchor the block intelligently relative to the FAB position.
  // Side mirrors the orb side, with safe-area padding on small screens.
  const blockStyle = (() => {
    const a = anchor || { side: "right", offset: 0.5 };
    const PAD = 16;
    const ORB = 64; // 56px orb + 8px gap
    const W = 320;
    const H = 360; // approximate; actual height varies
    if (typeof window === "undefined") {
      return { right: ORB + PAD, top: "50%", transform: "translateY(-50%)" };
    }
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    // Mobile: always center the block — much friendlier than edge-anchoring.
    if (winW < 640) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: `min(${W}px, calc(100vw - 24px))`,
      };
    }
    // Desktop / tablet: place beside the orb, mirroring its side.
    if (a.side === "right") {
      const top = Math.max(PAD, Math.min(winH - H - PAD, a.offset * winH - H / 2));
      return { right: ORB + PAD, top, width: W };
    }
    if (a.side === "left") {
      const top = Math.max(PAD, Math.min(winH - H - PAD, a.offset * winH - H / 2));
      return { left: ORB + PAD, top, width: W };
    }
    if (a.side === "top") {
      const left = Math.max(PAD, Math.min(winW - W - PAD, a.offset * winW - W / 2));
      return { top: ORB + PAD, left, width: W };
    }
    // bottom
    const left = Math.max(PAD, Math.min(winW - W - PAD, a.offset * winW - W / 2));
    return { bottom: ORB + PAD, left, width: W };
  })();

  if (!open && !astralOpen && !toolsOpen) return null;

  const submitAsk = () => {
    setAstralIntent("suggest");
    setAstralOpen(true);
    onClose && onClose();
  };

  const tile = ({ icon: Icon, title, hint, onClick, accent, testId }) => (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="hub-tile group/tile relative overflow-hidden text-left rounded-2xl border-2 border-slate-900 px-3 py-3 transition transform hover:-translate-y-0.5 active:translate-y-0"
      style={{
        background: accent || "var(--card)",
        boxShadow: "3px 3px 0 0 var(--ink)",
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-full grid place-items-center border-2 border-slate-900 shrink-0"
          style={{ background: "var(--card)" }}
        >
          <Icon className="w-3.5 h-3.5" strokeWidth={2.5} />
        </span>
        <span className="font-heading font-black text-sm leading-none">{title}</span>
      </div>
      <div
        className="text-[11px] mt-1.5 leading-snug"
        style={{ color: "var(--ink-soft)" }}
      >
        {hint}
      </div>
    </button>
  );

  return (
    <>
      {/* Backdrop only on mobile (centered modal); on desktop the hub is
          anchored beside the orb and stays click-passthrough for the rest of
          the page. */}
      {open && (
        <div
          className="fixed inset-0 z-[55] sm:bg-transparent bg-slate-900/40"
          aria-hidden="true"
          style={{ pointerEvents: "auto" }}
          onClick={onClose}
        />
      )}

      {open && (
        <div
          ref={blockRef}
          className="fixed z-[60] hub-block"
          style={blockStyle}
          data-testid="astral-hub"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="rounded-3xl border-2 border-slate-900 overflow-hidden"
            style={{
              background:
                "linear-gradient(160deg, var(--card) 0%, var(--card-soft) 100%)",
              boxShadow: "6px 6px 0 0 var(--ink)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3 border-b-2 border-slate-900"
              style={{
                background:
                  "linear-gradient(100deg, var(--pastel-lavender) 0%, var(--pastel-mint) 100%)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-7 h-7 rounded-full grid place-items-center border-2 border-slate-900"
                  style={{ background: "var(--card)" }}
                >
                  <Sparkles className="w-3.5 h-3.5 astral-spark" strokeWidth={2.5} />
                </span>
                <span className="font-heading font-black text-base lowercase tracking-tight">
                  astral
                </span>
                <span
                  className="hidden sm:inline text-[10px] uppercase tracking-wider font-bold ml-1"
                  style={{ color: "var(--ink-mute)" }}
                >
                  hangout concierge
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-7 h-7 rounded-full border-2 border-slate-900 grid place-items-center bg-white hover:bg-[var(--pastel-yellow)] transition"
                aria-label="Close"
                data-testid="hub-close"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>

            {/* Primary ask input */}
            <div className="px-4 pt-4 pb-3">
              <label
                className="label-caps text-[10px] block mb-1.5"
                style={{ color: "var(--ink-mute)" }}
              >
                what's the vibe?
              </label>
              <div className="flex items-stretch gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={windowBlurb}
                  onChange={(e) => setWindowBlurb(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && windowBlurb.trim()) submitAsk();
                  }}
                  placeholder="sat night 7-11pm…"
                  className="neo-input flex-1 text-sm"
                  data-testid="hub-window-input"
                />
                <button
                  type="button"
                  onClick={submitAsk}
                  disabled={!windowBlurb.trim()}
                  className="neo-btn pastel flex items-center gap-1.5 px-3 text-sm font-heading font-extrabold disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="hub-ask-btn"
                  title="Ask Astral"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ask</span>
                </button>
              </div>
              <div
                className="text-[10px] mt-1.5 leading-snug"
                style={{ color: "var(--ink-mute)" }}
              >
                free-form — astral handles "tonight", "this fri after 8", etc.
              </div>
            </div>

            {/* Tile grid — 4 quick actions */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                {tile({
                  icon: Shuffle,
                  title: "remix",
                  hint: "redirect picks: cheaper, fancier, diff. vibe…",
                  accent: "var(--pastel-lavender)",
                  testId: "hub-tile-remix",
                  onClick: () => {
                    setAstralIntent("remix");
                    setAstralOpen(true);
                    onClose && onClose();
                  },
                })}
                {tile({
                  icon: Clock,
                  title: "i'm busy…",
                  hint: "natural-language → busy slots auto-merged",
                  accent: "var(--pastel-peach)",
                  testId: "hub-tile-busy",
                  onClick: () => {
                    setToolsIntent("busy");
                    setToolsOpen(true);
                    onClose && onClose();
                  },
                })}
                {tile({
                  icon: History,
                  title: "history",
                  hint: "every round astral picked for the crew",
                  accent: "var(--pastel-mint)",
                  testId: "hub-tile-history",
                  onClick: () => {
                    setAstralIntent("history");
                    setAstralOpen(true);
                    onClose && onClose();
                  },
                })}
                {tile({
                  icon: Wand2,
                  title: "toolkit",
                  hint: "location, calendar sync, group prefs",
                  accent: "var(--pastel-yellow)",
                  testId: "hub-tile-tools",
                  onClick: () => {
                    setToolsIntent(null);
                    setToolsOpen(true);
                    onClose && onClose();
                  },
                })}
              </div>

              {/* Footer hint */}
              <div
                className="mt-3 flex items-center justify-center gap-1 text-[10px] font-medium"
                style={{ color: "var(--ink-mute)" }}
              >
                <span>powered by gemini 2.5 pro</span>
                <ArrowRight className="w-2.5 h-2.5" />
                <span>real venues only</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Heavy-lift drawers — full feature surfaces. */}
      <AstralDrawer
        open={astralOpen}
        onClose={() => {
          setAstralOpen(false);
          setAstralIntent(null);
        }}
        group={group}
        memberId={memberId}
        suggestedWindow={astralIntent === "suggest" ? windowBlurb : ""}
        autoSubmit={astralIntent === "suggest"}
        focusSection={astralIntent === "history" ? "history" : astralIntent === "remix" ? "remix" : null}
        onGroupUpdate={(g) => {
          if (!onGroupRefresh) return;
          onGroupRefresh((prev) => ({ ...(prev || {}), ...(g || {}) }));
        }}
      />
      <MyToolsDrawer
        open={toolsOpen}
        onClose={() => {
          setToolsOpen(false);
          setToolsIntent(null);
        }}
        group={group}
        memberId={memberId}
        focusSection={toolsIntent}
        onMemberUpdate={() => onGroupRefresh && onGroupRefresh((p) => p)}
      />
    </>
  );
}
