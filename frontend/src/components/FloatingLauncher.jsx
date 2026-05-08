import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import AstralHub from "./AstralHub";
import AstralBot from "./AstralBot";

const POS_KEY = "planit:fab-pos-v2"; // JSON: {side, offset}
const HINT_KEY = "planit:fab-hint-seen-v1"; // "1" once dismissed
const LEGACY_Y_KEY = "planit:fab-y";
const LEGACY_SIDE_KEY = "planit:fab-side";

// Floating, draggable launcher — single orb that opens the Astral Hub.
//
// Drag model (Pointer Events + setPointerCapture):
//   - On pointerdown the orb captures the pointer. From then on every
//     pointermove/up event fires on the orb, regardless of where the
//     pointer travels.
//   - Released anywhere → orb snaps to the closest point on the nearest
//     wall (top / right / bottom / left).
//
// First-load hint:
//   - A small speech bubble pops out from the orb on first visit ("psst!
//     drag me anywhere ✨ tap for astral · ⌘K"). Dismisses on first
//     interaction OR after 12s, and persists in localStorage.
//
// Keyboard shortcut:
//   - Cmd/Ctrl + K   → toggle the Astral Hub from anywhere on the page
//   - "/"            → open the hub (same behaviour as Slack/Discord/etc.),
//                      ignored while typing in inputs/textareas
//   - Esc            → close (handled inside the Hub)
export default function FloatingLauncher({ group, memberId, onGroupRefresh, code, defaultSide }) {
  const [hubOpen, setHubOpen] = useState(false);
  const [pos, setPos] = useState(() => loadInitialPos(defaultSide));
  const [freePos, setFreePos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [hintVisible, setHintVisible] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(HINT_KEY) !== "1";
  });

  const drag = useRef({ active: false, moved: false, startX: 0, startY: 0, pointerId: null });

  // Persist snapped position.
  useEffect(() => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch {}
  }, [pos]);

  // Re-render on resize so the snapped offset re-clamps.
  useEffect(() => {
    const onResize = () => setPos((p) => ({ ...p }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ── First-load hint auto-dismiss after 12s ──
  useEffect(() => {
    if (!hintVisible) return;
    const t = setTimeout(() => dismissHint(), 12_000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hintVisible]);

  // ── Global keyboard shortcuts (Cmd/Ctrl+K and "/") ──
  useEffect(() => {
    const onKey = (e) => {
      // Cmd/Ctrl+K → toggle hub from anywhere.
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setHubOpen((v) => !v);
        dismissHint();
        return;
      }
      // "/" → open hub, but only when the user is NOT typing in an input.
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setHubOpen(true);
        dismissHint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dismissHint = () => {
    setHintVisible(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch {}
  };

  // ── Pointer handlers ──
  const onPointerDown = (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e) => {
    if (!drag.current.active) return;
    if (drag.current.pointerId != null && e.pointerId !== drag.current.pointerId) return;
    const dx = e.clientX - drag.current.startX;
    const dy = e.clientY - drag.current.startY;
    if (!drag.current.moved && Math.hypot(dx, dy) > 8) {
      drag.current.moved = true;
      setDragging(true);
      setHubOpen(false);
      dismissHint();
    }
    if (drag.current.moved) {
      const winW = window.innerWidth;
      const winH = window.innerHeight;
      const ORB_HALF = 28;
      const x = Math.max(ORB_HALF, Math.min(winW - ORB_HALF, e.clientX));
      const y = Math.max(ORB_HALF, Math.min(winH - ORB_HALF, e.clientY));
      setFreePos({ x, y });
    }
  };

  const onPointerUp = (e) => {
    if (!drag.current.active) return;
    if (drag.current.pointerId != null && e.pointerId !== drag.current.pointerId) return;
    const wasDrag = drag.current.moved;
    const fp = wasDrag
      ? {
          x: Math.max(28, Math.min(window.innerWidth - 28, e.clientX)),
          y: Math.max(28, Math.min(window.innerHeight - 28, e.clientY)),
        }
      : null;
    drag.current = { active: false, moved: false, startX: 0, startY: 0, pointerId: null };
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (wasDrag && fp) {
      const snapped = snapToNearestWall(fp.x, fp.y);
      setPos(snapped);
      setAnimating(true);
      setTimeout(() => setAnimating(false), 280);
      setDragging(false);
      setFreePos(null);
    } else {
      // Tap → toggle the hub.
      setHubOpen((v) => !v);
      dismissHint();
    }
  };

  const onPointerCancel = (e) => {
    drag.current = { active: false, moved: false, startX: 0, startY: 0, pointerId: null };
    setDragging(false);
    setFreePos(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  // ── Compute orb style ──
  const orbStyle = (() => {
    const ORB_HALF = 28;
    if (freePos) {
      return { left: freePos.x - ORB_HALF, top: freePos.y - ORB_HALF };
    }
    if (typeof window === "undefined") {
      return { right: 16, top: "50%", transform: "translateY(-50%)" };
    }
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    const PAD = 16;
    const ORB = 56;
    const safeYRange = [PAD, winH - ORB - PAD];
    const safeXRange = [PAD, winW - ORB - PAD];
    if (pos.side === "top") {
      const left = clamp(pos.offset * winW - ORB / 2, safeXRange[0], safeXRange[1]);
      return { top: PAD, left };
    }
    if (pos.side === "bottom") {
      const left = clamp(pos.offset * winW - ORB / 2, safeXRange[0], safeXRange[1]);
      return { bottom: PAD, left };
    }
    if (pos.side === "left") {
      const top = clamp(pos.offset * winH - ORB / 2, safeYRange[0], safeYRange[1]);
      return { left: PAD, top };
    }
    const top = clamp(pos.offset * winH - ORB / 2, safeYRange[0], safeYRange[1]);
    return { right: PAD, top };
  })();

  // Speech bubble placement — point AWAY from the wall the orb is docked
  // to, so the tail comes from the orb side.
  const bubblePlacement = (() => {
    const W = 240; // bubble width — readable, short hint copy
    if (freePos) return { className: "fab-speech--right", style: { left: 64, top: 4, width: W } };
    if (pos.side === "right") return { className: "fab-speech--left",   style: { right: 64, top: "50%", transform: "translateY(-50%)", width: W } };
    if (pos.side === "left")  return { className: "fab-speech--right",  style: { left:  64, top: "50%", transform: "translateY(-50%)", width: W } };
    if (pos.side === "top")   return { className: "fab-speech--top",    style: { top:   64, left: "50%", transform: "translateX(-50%)", width: W } };
    return { className: "fab-speech--bottom", style: { bottom: 64, left: "50%", transform: "translateX(-50%)", width: W } };
  })();

  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <>
      <div
        className="fixed z-[60] select-none"
        style={{
          ...orbStyle,
          transition: animating
            ? "left 240ms cubic-bezier(.2,.8,.2,1), right 240ms cubic-bezier(.2,.8,.2,1), top 240ms cubic-bezier(.2,.8,.2,1), bottom 240ms cubic-bezier(.2,.8,.2,1)"
            : dragging
            ? "none"
            : "left 180ms ease, right 180ms ease, top 180ms ease, bottom 180ms ease",
          pointerEvents: "auto",
        }}
        data-testid="floating-launcher"
      >
        {/* First-load drag-me speech bubble. */}
        {hintVisible && !hubOpen && !dragging && (
          <div
            className={`fab-speech ${bubblePlacement.className}`}
            style={bubblePlacement.style}
            data-testid="fab-hint"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div
                  className="font-heading font-black text-[11px] uppercase tracking-wider mb-0.5"
                  style={{ color: "var(--ink-mute)" }}
                >
                  hi, i'm astral ✨
                </div>
                <div className="text-[12px] leading-snug">
                  drag me to any edge of your screen.{" "}
                  <span className="font-bold">tap me</span> or hit{" "}
                  <span className="hub-kbd">{isMac ? "⌘" : "Ctrl"}K</span> to plot your next hangout.
                </div>
              </div>
              <button
                type="button"
                onClick={dismissHint}
                aria-label="Dismiss tip"
                className="fab-speech-close shrink-0"
                data-testid="fab-hint-dismiss"
                title="Got it"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          className="fab-orb relative w-14 h-14 rounded-full grid place-items-center border-2 border-slate-900 transition"
          style={{
            background:
              "linear-gradient(135deg, var(--pastel-mint) 0%, var(--pastel-lavender) 50%, var(--pastel-yellow) 100%)",
            boxShadow: dragging ? "5px 5px 0 0 var(--ink)" : "3px 3px 0 0 var(--ink)",
            transform: dragging ? "scale(1.1)" : "scale(1)",
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
          data-testid="fab-toggle"
          aria-label={hubOpen ? "Close Astral hub" : "Open Astral hub"}
          aria-expanded={hubOpen}
          title="Drag to move · Tap or ⌘K for Astral"
        >
          {hubOpen ? (
            <X className="w-5 h-5" strokeWidth={2.5} style={{ pointerEvents: "none" }} />
          ) : (
            <AstralBot
              size={36}
              waving={!dragging}
              style={{ pointerEvents: "none" }}
            />
          )}
        </button>
      </div>

      <AstralHub
        open={hubOpen}
        onClose={() => setHubOpen(false)}
        anchor={pos}
        group={group}
        memberId={memberId}
        code={code}
        onGroupRefresh={onGroupRefresh}
      />
    </>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if (el.isContentEditable) return true;
  return false;
}

function snapToNearestWall(x, y) {
  if (typeof window === "undefined") return { side: "right", offset: 0.5 };
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const distances = [
    { side: "top",    d: y },
    { side: "right",  d: winW - x },
    { side: "bottom", d: winH - y },
    { side: "left",   d: x },
  ];
  distances.sort((a, b) => a.d - b.d);
  const winner = distances[0].side;
  let offset;
  if (winner === "top" || winner === "bottom") {
    offset = winW > 0 ? x / winW : 0.5;
  } else {
    offset = winH > 0 ? y / winH : 0.5;
  }
  offset = Math.max(0.04, Math.min(0.96, offset));
  return { side: winner, offset };
}

function loadInitialPos(defaultSide) {
  if (typeof window === "undefined") return { side: "right", offset: 0.55 };
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validSides = ["top", "right", "bottom", "left"];
      if (parsed && validSides.includes(parsed.side) && Number.isFinite(parsed.offset)) {
        return {
          side: parsed.side,
          offset: Math.max(0.04, Math.min(0.96, parsed.offset)),
        };
      }
    }
  } catch {}
  const legacyY = parseFloat(localStorage.getItem(LEGACY_Y_KEY));
  const legacySide = localStorage.getItem(LEGACY_SIDE_KEY);
  if (Number.isFinite(legacyY) && (legacySide === "left" || legacySide === "right")) {
    return { side: legacySide, offset: Math.max(0.04, Math.min(0.96, legacyY)) };
  }
  // No stored position yet — honour the per-member default if supplied
  // (set on the Customize → Personal tab).
  const validSides = ["top", "right", "bottom", "left"];
  if (defaultSide && validSides.includes(defaultSide)) {
    return { side: defaultSide, offset: 0.55 };
  }
  return { side: "right", offset: 0.55 };
}
