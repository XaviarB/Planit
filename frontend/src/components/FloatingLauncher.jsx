import { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
import AstralHub from "./AstralHub";

const POS_KEY = "planit:fab-pos-v2"; // JSON: {side, offset, x, y}
const LEGACY_Y_KEY = "planit:fab-y";
const LEGACY_SIDE_KEY = "planit:fab-side";

// Floating, draggable launcher — single orb that opens the Astral Hub
// (a sleek one-block menu surfacing every Astral function).
//
// Drag model:
//   - You can drag the orb anywhere on the viewport — including the middle.
//     The orb follows the pointer in real time.
//   - On release, the orb snaps to the closest point on the nearest of all
//     four walls (top / right / bottom / left) with a smooth animation.
//   - Position persists across reloads.
//
// Tap model:
//   - Press → start a drag candidate. Release without travelling >8px =
//     a tap → toggle the Astral Hub.
//   - Window-level pointer listeners are bound ONCE so they never detach
//     mid-tap.
export default function FloatingLauncher({ group, memberId, onGroupRefresh, code }) {
  const [hubOpen, setHubOpen] = useState(false);

  // Snapped (resting) position. side ∈ {top,right,bottom,left}; offset ∈ [0,1].
  const [pos, setPos] = useState(() => loadInitialPos());

  // While dragging, freePos is { x, y } absolute (px). null otherwise.
  const [freePos, setFreePos] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [animating, setAnimating] = useState(false); // for the snap animation

  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
  });
  const launcherRef = useRef(null);
  // Mirror freePos into a ref so the once-bound `up` handler always sees
  // the latest value.
  const freePosRef = useRef(null);

  // Persist position whenever the snapped position changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch {}
  }, [pos]);

  // Bind window-level move/up listeners ONCE — never detach during a tap.
  useEffect(() => {
    const onMove = (clientX, clientY) => {
      if (!drag.current.active) return;
      const dx = clientX - drag.current.startX;
      const dy = clientY - drag.current.startY;
      if (!drag.current.moved && Math.hypot(dx, dy) > 8) {
        drag.current.moved = true;
        setDragging(true);
        setHubOpen(false);
      }
      if (drag.current.moved) {
        // Free movement — orb follows pointer with no axis constraint.
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const ORB_HALF = 28;
        const x = Math.max(ORB_HALF, Math.min(winW - ORB_HALF, clientX));
        const y = Math.max(ORB_HALF, Math.min(winH - ORB_HALF, clientY));
        setFreePos({ x, y });
      }
    };
    const mm = (e) => onMove(e.clientX, e.clientY);
    const tm = (e) => {
      if (!e.touches[0]) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const up = () => {
      if (drag.current.active && drag.current.moved) {
        // Snap to nearest wall based on free position.
        if (freePosRef.current) {
          const snapped = snapToNearestWall(
            freePosRef.current.x,
            freePosRef.current.y
          );
          setPos(snapped);
          // Briefly enable a CSS transition for the snap animation.
          setAnimating(true);
          setTimeout(() => setAnimating(false), 260);
        }
        drag.current.active = false;
        drag.current.moved = false;
        setDragging(false);
        setFreePos(null);
      } else if (drag.current.active) {
        drag.current.active = false;
      }
    };
    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", tm, { passive: true });
    window.addEventListener("touchend", up);
    window.addEventListener("touchcancel", up);
    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", up);
      window.removeEventListener("touchcancel", up);
    };
  }, []); // bind once

  // Mirror freePos into a ref so the once-bound `up` handler always sees the
  // latest value (it's defined inside the bind-once useEffect).
  useEffect(() => {
    freePosRef.current = freePos;
  }, [freePos]);

  // Re-snap if the viewport resizes drastically (so the orb doesn't end up
  // off-screen). We just keep the same side/offset — the geometry helper
  // re-clamps on render via orbStyle.
  useEffect(() => {
    const onResize = () => setPos((p) => ({ ...p }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const startPress = (clientX, clientY) => {
    drag.current = {
      active: true,
      moved: false,
      startX: clientX,
      startY: clientY,
    };
  };

  // Releasing on the orb itself: if the user didn't drag, toggle the Hub.
  const endPressOnOrb = () => {
    if (!drag.current.active) return;
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    drag.current.moved = false;
    if (wasDrag) {
      // The window-level `up` already handled snapping; nothing to do here.
      setDragging(false);
    } else {
      setHubOpen((v) => !v);
    }
  };

  // Compute the absolute position style. While dragging → use freePos.
  // Otherwise → derive from snapped pos.side + offset.
  const orbStyle = (() => {
    const ORB_HALF = 28;
    if (freePos) {
      return {
        left: freePos.x - ORB_HALF,
        top: freePos.y - ORB_HALF,
      };
    }
    // Derive from snapped pos.
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
    // right (default)
    const top = clamp(pos.offset * winH - ORB / 2, safeYRange[0], safeYRange[1]);
    return { right: PAD, top };
  })();

  return (
    <>
      <div
        ref={launcherRef}
        className="fixed z-[60] select-none"
        style={{
          ...orbStyle,
          transition: animating
            ? "left 220ms cubic-bezier(.2,.8,.2,1), right 220ms cubic-bezier(.2,.8,.2,1), top 220ms cubic-bezier(.2,.8,.2,1), bottom 220ms cubic-bezier(.2,.8,.2,1)"
            : dragging
            ? "none"
            : "left 180ms ease, right 180ms ease, top 180ms ease, bottom 180ms ease",
        }}
        data-testid="floating-launcher"
      >
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            startPress(e.clientX, e.clientY);
          }}
          onMouseUp={(e) => {
            e.preventDefault();
            endPressOnOrb();
          }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (!t) return;
            startPress(t.clientX, t.clientY);
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            endPressOnOrb();
          }}
          className="fab-orb relative w-14 h-14 rounded-full grid place-items-center border-2 border-slate-900 transition"
          style={{
            background:
              "linear-gradient(135deg, var(--pastel-mint) 0%, var(--pastel-lavender) 50%, var(--pastel-yellow) 100%)",
            boxShadow: dragging
              ? "5px 5px 0 0 var(--ink)"
              : "3px 3px 0 0 var(--ink)",
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
            <X className="w-5 h-5" strokeWidth={2.5} />
          ) : (
            <Sparkles className="w-5 h-5 astral-spark" strokeWidth={2.5} />
          )}
        </button>
      </div>

      {/* The new sleek one-block Astral Hub. */}
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

// Given an absolute (x, y) on the viewport, return { side, offset } describing
// the closest point on the nearest of the 4 walls (top/right/bottom/left).
// Offset is normalized [0..1] along the chosen wall.
function snapToNearestWall(x, y) {
  if (typeof window === "undefined") {
    return { side: "right", offset: 0.5 };
  }
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
  // Try v2 (4-wall) first.
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
  // Migrate legacy left/right + y-fraction.
  const legacyY = parseFloat(localStorage.getItem(LEGACY_Y_KEY));
  const legacySide = localStorage.getItem(LEGACY_SIDE_KEY);
  if (Number.isFinite(legacyY) && (legacySide === "left" || legacySide === "right")) {
    return {
      side: legacySide,
      offset: Math.max(0.04, Math.min(0.96, legacyY)),
    };
  }
  return { side: "right", offset: 0.55 };
}
