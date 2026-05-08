import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import AstralHub from "./AstralHub";

const POS_KEY = "planit:fab-pos-v2"; // JSON: {side, offset}
const LEGACY_Y_KEY = "planit:fab-y";
const LEGACY_SIDE_KEY = "planit:fab-side";

// Floating, draggable launcher — single orb that opens the Astral Hub.
//
// Drag model (Pointer Events + setPointerCapture):
//   - On pointerdown, the orb captures the pointer. From then on, ALL
//     pointermove/up events fire on the orb element, no matter where the
//     pointer travels — even outside the orb's bounding box. This avoids
//     the classic "lost cursor mid-drag" bug AND the cross-element race
//     conditions that plagued the previous mouse-event implementation.
//   - The orb follows the pointer freely (top, right, bottom or middle —
//     anywhere on screen).
//   - On pointerup, the orb snaps to the closest point on the nearest of
//     the 4 walls (top / right / bottom / left) with a smooth animation.
//
// Tap model:
//   - Pointer down + up within 8px of travel = tap → toggle the Astral Hub.
export default function FloatingLauncher({ group, memberId, onGroupRefresh, code }) {
  const [hubOpen, setHubOpen] = useState(false);
  const [pos, setPos] = useState(() => loadInitialPos());
  const [freePos, setFreePos] = useState(null); // {x, y} during drag
  const [dragging, setDragging] = useState(false);
  const [animating, setAnimating] = useState(false);

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

  // ── Pointer handlers (fire on the orb because of setPointerCapture) ──
  const onPointerDown = (e) => {
    // Only react to primary pointer (left mouse / first touch).
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch { /* some pointers can't be captured (e.g. mouse wheel) */ }
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
      // Tap.
      setHubOpen((v) => !v);
    }
  };

  const onPointerCancel = (e) => {
    // Reset cleanly — no snap, no toggle.
    drag.current = { active: false, moved: false, startX: 0, startY: 0, pointerId: null };
    setDragging(false);
    setFreePos(null);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  };

  // Compute style.
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
          // Defensive: ensure the orb sits above any rogue overlay/modal
          // backdrops that may share its z-index. 60 is already high but
          // some host layouts use 50–70 inconsistently.
          pointerEvents: "auto",
        }}
        data-testid="floating-launcher"
      >
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
          title="Drag to move · tap for Astral"
        >
          {hubOpen ? (
            <X className="w-5 h-5" strokeWidth={2.5} style={{ pointerEvents: "none" }} />
          ) : (
            <Sparkles className="w-5 h-5 astral-spark" strokeWidth={2.5} style={{ pointerEvents: "none" }} />
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

// ─── helpers ──────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Given an absolute (x, y) on the viewport, return { side, offset } for the
// closest point on the nearest of the 4 walls.
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

function loadInitialPos() {
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
  return { side: "right", offset: 0.55 };
}
