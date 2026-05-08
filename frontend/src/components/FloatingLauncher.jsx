import { useEffect, useRef, useState } from "react";
import { Sparkles, Wand2, X } from "lucide-react";
import AstralDrawer from "./AstralDrawer";
import MyToolsDrawer from "./MyToolsDrawer";
import { getGroup } from "../lib/api";

const POS_KEY = "planit:fab-y";
const SIDE_KEY = "planit:fab-side"; // "left" | "right"

// Floating, draggable launcher giving one-tap access to Astral (AI hangout
// concierge) and My Toolkit (NL parser, templates, calendar sync). The orb
// is fixed to whichever vertical-side edge the user dragged it to and
// remembers its position across reloads.
//
// Interaction model:
//   - Press → start a "candidate" drag. If the pointer travels >8px before
//     release we treat it as a drag and reposition the orb.
//   - Release with no movement → toggle the popover (instant, no race).
//   - Window-level mousemove/up listeners are bound ONCE via refs so they
//     never detach mid-tap (this was the bug the testing agent found).
export default function FloatingLauncher({ group, memberId, onGroupRefresh, code }) {
  const [open, setOpen] = useState(false);
  const [astralOpen, setAstralOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [pos, setPos] = useState(() => {
    if (typeof window === "undefined") return { y: 0.55, side: "right" };
    const y = parseFloat(localStorage.getItem(POS_KEY));
    const side = localStorage.getItem(SIDE_KEY) || "right";
    return {
      y: Number.isFinite(y) ? Math.min(0.95, Math.max(0.05, y)) : 0.55,
      side: side === "left" ? "left" : "right",
    };
  });
  const [dragging, setDragging] = useState(false);

  const drag = useRef({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
  });
  const launcherRef = useRef(null);
  // Latest pos, kept in a ref so the once-bound window handlers don't go stale.
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

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

  // Bind window-level move/up listeners ONCE — never detach during a tap.
  useEffect(() => {
    const onMove = (clientX, clientY) => {
      if (!drag.current.active) return;
      const dx = clientX - drag.current.startX;
      const dy = clientY - drag.current.startY;
      if (!drag.current.moved && Math.hypot(dx, dy) > 8) {
        drag.current.moved = true;
        setDragging(true);
        setOpen(false);
      }
      if (drag.current.moved) {
        const winH = window.innerHeight;
        const winW = window.innerWidth;
        const yFrac = Math.min(0.92, Math.max(0.06, clientY / winH));
        const side = clientX < winW / 2 ? "left" : "right";
        setPos({ y: yFrac, side });
      }
    };
    const mm = (e) => onMove(e.clientX, e.clientY);
    const tm = (e) => {
      if (!e.touches[0]) return;
      onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const up = () => {
      // ONLY end the drag here. The popover toggle happens on the button's
      // own onMouseUp/onTouchEnd so it commits synchronously with React 18
      // batching — no race against window listeners.
      if (drag.current.active && drag.current.moved) {
        drag.current.active = false;
        drag.current.moved = false;
        setDragging(false);
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

  const startPress = (clientX, clientY) => {
    drag.current = {
      active: true,
      moved: false,
      startX: clientX,
      startY: clientY,
    };
  };

  // Releasing on the orb itself: if the user didn't drag, toggle the popover.
  // This runs synchronously inside the button's event handler, so React batches
  // it correctly and the first tap always works.
  const endPressOnOrb = () => {
    if (!drag.current.active) return;
    const wasDrag = drag.current.moved;
    drag.current.active = false;
    drag.current.moved = false;
    if (wasDrag) {
      setDragging(false);
    } else {
      setOpen((v) => !v);
    }
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
        {/* Pop-out menu — only shown when the user taps the orb. */}
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
            // Prevent the synthetic click after touchend from firing twice.
            e.preventDefault();
            endPressOnOrb();
          }}
          className="fab-orb relative w-14 h-14 rounded-full grid place-items-center border-2 border-slate-900 transition"
          style={{
            background:
              "linear-gradient(135deg, var(--pastel-mint) 0%, var(--pastel-lavender) 50%, var(--pastel-yellow) 100%)",
            boxShadow: "3px 3px 0 0 var(--ink)",
            transform: dragging ? "scale(1.08)" : "scale(1)",
            cursor: dragging ? "grabbing" : "grab",
            touchAction: "none",
          }}
          data-testid="fab-toggle"
          aria-label={open ? "Close launcher menu" : "Open launcher menu"}
          aria-expanded={open}
          title="Drag to move · tap to open"
        >
          {open ? (
            <X className="w-5 h-5" strokeWidth={2.5} />
          ) : (
            <Sparkles className="w-5 h-5 astral-spark" strokeWidth={2.5} />
          )}
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
    </>
  );
}
