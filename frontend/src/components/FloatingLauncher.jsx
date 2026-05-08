import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, X, GripVertical } from "lucide-react";
import AstralDrawer from "./AstralDrawer";
import MyToolsDrawer from "./MyToolsDrawer";
import { getGroup } from "../lib/api";

const POS_KEY = "planit:fab-y";
const SIDE_KEY = "planit:fab-side"; // "left" | "right"

// Floating, draggable launcher that gives the user one-tap access to
// Astral (AI hangout concierge) and My Toolkit (NL parser, templates,
// calendar sync). Renders globally on the group page so it's always
// reachable — tap once to expand, drag to reposition along the edge.
export default function FloatingLauncher({ group, memberId, onGroupRefresh, code }) {
  const [open, setOpen] = useState(false);
  const [astralOpen, setAstralOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return { y: 0.5, side: "right" };
    const y = parseFloat(localStorage.getItem(POS_KEY));
    const side = localStorage.getItem(SIDE_KEY) || "right";
    return {
      y: Number.isFinite(y) ? Math.min(0.95, Math.max(0.05, y)) : 0.55,
      side: side === "left" ? "left" : "right",
    };
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef({ active: false, moved: false, startY: 0, startX: 0, startedAt: 0 });
  const launcherRef = useRef(null);

  // Persist position whenever it changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(POS_KEY, String(pos.y));
    localStorage.setItem(SIDE_KEY, pos.side);
  }, [pos]);

  // Close popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!launcherRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [open]);

  const startDrag = (clientX, clientY) => {
    dragRef.current = {
      active: true,
      moved: false,
      startY: clientY,
      startX: clientX,
      startedAt: Date.now(),
    };
  };

  const moveDrag = (clientX, clientY) => {
    if (!dragRef.current.active) return;
    const dx = clientX - dragRef.current.startX;
    const dy = clientY - dragRef.current.startY;
    if (!dragRef.current.moved && Math.hypot(dx, dy) > 8) {
      dragRef.current.moved = true;
      setDragging(true);
      setOpen(false);
    }
    if (dragRef.current.moved) {
      const winH = window.innerHeight;
      const winW = window.innerWidth;
      const yFrac = Math.min(0.92, Math.max(0.06, clientY / winH));
      const side = clientX < winW / 2 ? "left" : "right";
      setPos({ y: yFrac, side });
    }
  };

  const endDrag = (e) => {
    const wasDragging = dragRef.current.moved;
    dragRef.current.active = false;
    dragRef.current.moved = false;
    setDragging(false);
    // If they didn't drag, treat as a click → toggle popover.
    if (!wasDragging) {
      setOpen((v) => !v);
    }
    e?.stopPropagation?.();
  };

  // Refresh group after drawer actions persist data.
  const refreshGroup = async () => {
    if (!code) return;
    try {
      const fresh = await getGroup(code);
      onGroupRefresh && onGroupRefresh(fresh);
    } catch {}
  };

  const orbStyle = {
    top: `${pos.y * 100}%`,
    [pos.side]: 16,
    transform: "translateY(-50%)",
    cursor: dragging ? "grabbing" : "grab",
  };

  const popoverSide = pos.side === "right" ? { right: 84 } : { left: 84 };

  return (
    <>
      <div
        ref={launcherRef}
        className="fixed z-40 select-none"
        style={orbStyle}
        data-testid="floating-launcher"
      >
        {/* Pop-out menu — only shown when the user taps the orb (and isn't dragging). */}
        {open && !dragging && (
          <div
            className="absolute top-1/2 -translate-y-1/2 flex flex-col gap-2 fab-popover"
            style={popoverSide}
            data-testid="fab-popover"
          >
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAstralOpen(true);
              }}
              className="astral-trigger flex items-center gap-2 whitespace-nowrap"
              style={{ padding: "10px 16px", fontSize: 14 }}
              data-testid="fab-open-astral"
            >
              <Sparkles className="astral-spark w-4 h-4" strokeWidth={2.5} />
              Ask Astral
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setToolsOpen(true);
              }}
              className="astral-trigger flex items-center gap-2 whitespace-nowrap"
              style={{
                padding: "10px 16px",
                fontSize: 14,
                background:
                  "linear-gradient(100deg, var(--pastel-mint) 0%, var(--pastel-lavender) 100%)",
              }}
              data-testid="fab-open-tools"
            >
              <Wand2 className="astral-spark w-4 h-4" strokeWidth={2.5} />
              My Toolkit
            </button>
          </div>
        )}

        {/* The orb itself. Drag to reposition, tap to toggle the menu. */}
        <button
          type="button"
          onMouseDown={(e) => startDrag(e.clientX, e.clientY)}
          onTouchStart={(e) => {
            const t = e.touches[0];
            startDrag(t.clientX, t.clientY);
          }}
          onClick={(e) => {
            // Click is delegated through endDrag for non-drag taps; just block default.
            e.preventDefault();
          }}
          className="fab-orb relative w-14 h-14 rounded-full grid place-items-center border-2 border-slate-900 transition"
          style={{
            background:
              "linear-gradient(135deg, var(--pastel-mint) 0%, var(--pastel-lavender) 50%, var(--pastel-yellow) 100%)",
            boxShadow: "3px 3px 0 0 var(--ink)",
            transform: dragging ? "scale(1.08)" : "scale(1)",
          }}
          data-testid="fab-toggle"
          aria-label={open ? "Close launcher menu" : "Open launcher menu"}
          title="Drag to move · tap to open"
        >
          {open ? (
            <X className="w-5 h-5" strokeWidth={2.5} />
          ) : (
            <Sparkles className="w-5 h-5 astral-spark" strokeWidth={2.5} />
          )}
          {/* Subtle drag handle indicator on hover. */}
          <span
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full grid place-items-center bg-white border-2 border-slate-900 opacity-0 group-hover:opacity-100"
            style={{ pointerEvents: "none" }}
            aria-hidden
          >
            <GripVertical className="w-2.5 h-2.5" strokeWidth={2.5} />
          </span>
        </button>
      </div>

      {/* Drawers live here so the launcher is fully self-contained. */}
      <AstralDrawer
        open={astralOpen}
        onClose={() => setAstralOpen(false)}
        group={group}
        memberId={memberId}
        suggestedWindow=""
        onGroupUpdate={(g) => {
          onGroupRefresh && onGroupRefresh((prev) => ({ ...prev, ...g }));
          if (g?._hangoutsBumped) refreshGroup();
        }}
      />
      <MyToolsDrawer
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        group={group}
        memberId={memberId}
        onMemberUpdate={refreshGroup}
      />

      {/* Bind drag listeners at window-level when the launcher is being held. */}
      <DragBinder
        onMove={(x, y) => moveDrag(x, y)}
        onEnd={(e) => endDrag(e)}
      />
    </>
  );
}

// Small helper that attaches window-level mousemove/up while a drag is active.
// Kept inline so the parent component keeps a clean, declarative read.
function DragBinder({ onMove, onEnd }) {
  useEffect(() => {
    const mm = (e) => onMove(e.clientX, e.clientY);
    const tm = (e) => {
      if (!e.touches[0]) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const up = (e) => onEnd(e);
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
  }, [onMove, onEnd]);
  return null;
}
