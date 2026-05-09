import { useMemo, useState, useEffect, useRef } from "react";
import { Sparkles, Copy, Check, X, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { buildTimeSlots, timeLabel, buildSlotMap, buildBusyIndex, memberStatusAt, dateToDayIdx } from "../lib/schedule";
import { computeAnchorStyle } from "../lib/anchorStyle";

/**
 * Computes top N time slots where the most members are free, at the active
 * `minuteStep` precision.
 */
export default function SuggestMeeting({
  members,
  columns,
  mode,
  hourFrom,
  hourTo,
  minuteStep = 60,
  groupName,
  groupCode,
  triggerClassName,
  wrapperClassName,
  // Controlled-open mode — when these are passed, the parent owns the
  // open/close state and we render the popover as a free-floating bubble
  // next to the FAB orb (matching AstralDrawer / MyToolsDrawer). Used by
  // the Astral hub which fires "Suggest a time" from a tile.
  controlledOpen,
  onOpenChange,
  hideTrigger = false,
  // FAB anchor (side + offset). When provided in controlled mode, the
  // popover renders as a floating bubble next to the orb instead of a
  // centered modal. Falls back to centered modal if absent.
  anchor,
  // Optional callback — when provided, a back-arrow button appears in
  // the header that closes this bubble and reopens the Astral hub.
  onBack,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof controlledOpen === "boolean";
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next) => {
    const value = typeof next === "function" ? next(open) : next;
    if (isControlled) {
      onOpenChange && onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [confirmFor, setConfirmFor] = useState(null); // suggestion to confirm
  const [joinLink, setJoinLink] = useState("");
  const popRef = useRef(null);

  const suggestions = useMemo(() => {
    const enriched = members.map((m) => ({
      ...m,
      _map: buildSlotMap(m.slots),
      _idx: buildBusyIndex(m.slots),
    }));
    const total = enriched.length;
    const slotsList = buildTimeSlots(hourFrom, hourTo, minuteStep);
    const slots = [];
    for (const col of columns) {
      for (const { hour, minute } of slotsList) {
        let free = 0;
        const freeNames = [];
        for (const m of enriched) {
          let st = memberStatusAt(m, mode, col.key, hour, minute, minuteStep);
          if (st.status === "free" && mode === "date") {
            const dayIdx = dateToDayIdx(col.key);
            const w = memberStatusAt(m, "weekly", `d${dayIdx}`, hour, minute, minuteStep);
            if (w.status === "busy") st = w;
          }
          if (st.status === "free") {
            free++;
            freeNames.push(m.name);
          }
        }
        if (total > 0 && free > 0) {
          slots.push({
            colKey: col.key,
            colLabel: col.label,
            hour,
            minute,
            timeText: timeLabel(hour, minute),
            free,
            total,
            freeNames,
            ratio: free / total,
          });
        }
      }
    }
    // Sort by free count desc, then earliest start for ties
    slots.sort((a, b) =>
      b.free - a.free ||
      (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)
    );
    // Pick up to 3 distinct day/col entries (avoid showing 3 hours on same day)
    const seen = new Set();
    const picks = [];
    for (const s of slots) {
      if (seen.has(s.colKey)) continue;
      picks.push(s);
      seen.add(s.colKey);
      if (picks.length === 3) break;
    }
    if (picks.length < 3) {
      for (const s of slots) {
        if (picks.includes(s)) continue;
        picks.push(s);
        if (picks.length === 3) break;
      }
    }
    return picks;
  }, [members, columns, mode, hourFrom, hourTo, minuteStep]);

  // Click outside to close (only in uncontrolled / popover mode — in
  // controlled mode the modal overlay handles dismissal directly).
  useEffect(() => {
    if (!open || isControlled) return;
    const onDoc = (e) => {
      if (popRef.current && !popRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const messageFor = (s) =>
    `How about ${s.colLabel} ${s.timeText}? ${s.free}/${s.total} of ${groupName} free.`;

  const confirmMessageFor = (s, link) => {
    const linkLine = link ? `\nJoin link: ${link}` : "";
    return `Meeting confirmed for ${s.colLabel} at ${s.timeText} (${s.free}/${s.total} of ${groupName} free).${linkLine}`;
  };

  const onOpenConfirm = (s) => {
    setConfirmFor(s);
    setJoinLink("");
  };

  const onCopyConfirmation = async () => {
    if (!confirmFor) return;
    try {
      await navigator.clipboard.writeText(confirmMessageFor(confirmFor, joinLink.trim()));
      toast.success("Confirmation copied!");
      setConfirmFor(null);
      setJoinLink("");
      setOpen(false);
    } catch {
      toast.error("Could not copy");
    }
  };

  const onCopyOne = async (idx, s) => {
    try {
      await navigator.clipboard.writeText(messageFor(s));
      setCopiedIdx(idx);
      toast.success("Message copied!");
      setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1800);
    } catch {
      toast.error("Could not copy");
    }
  };

  const onCopyAll = async () => {
    const text =
      `Top ${suggestions.length} times for ${groupName}:\n` +
      suggestions
        .map((s, i) => `${i + 1}. ${s.colLabel} ${s.timeText} — ${s.free}/${s.total} free`)
        .join("\n") +
      `\n\nJoin: ${window.location.origin}/g/${groupCode}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("All suggestions copied!");
    } catch {
      toast.error("Could not copy");
    }
  };

  const disabled = members.length === 0 || suggestions.length === 0;

  return (
    <div className={wrapperClassName || "relative"} ref={popRef}>
      {!hideTrigger && (
        <button
          onClick={() => setOpen((v) => !v)}
          className={triggerClassName || "neo-btn pastel text-sm flex items-center gap-2"}
          data-testid="suggest-meeting-btn"
          title="Suggest a meeting time"
        >
          <Sparkles className="w-4 h-4" />
          Suggest a time
        </button>
      )}

      {open && !confirmFor && (
        <>
          {/* Tap-out scrim (controlled-open mode only). Transparent when
              anchored next to the FAB so the surrounding UI stays visible
              — matches AstralDrawer's bubble pattern. Falls back to a
              soft dim when no anchor is supplied (legacy centered modal). */}
          {isControlled && (
            <div
              className={
                anchor
                  ? "fixed inset-0 z-40"
                  : "fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm"
              }
              onClick={() => setOpen(false)}
              data-testid="suggest-meeting-overlay"
            />
          )}
          <div
            className={
              isControlled
                ? (anchor
                    ? "fixed z-50 neo-card p-4 overflow-y-auto rounded-2xl border-2 border-slate-900"
                    : "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(92vw,360px)] z-[61] neo-card p-4 max-h-[80vh] overflow-y-auto")
                : "absolute right-0 top-full mt-3 w-[340px] z-40 neo-card p-4"
            }
            style={
              isControlled && anchor
                ? {
                    background: "var(--card)",
                    ...computeAnchorStyle({ anchor, width: 360, height: 480 }),
                  }
                : { background: "var(--card)" }
            }
            data-testid="suggest-meeting-popover"
            role="dialog"
            onClick={(e) => e.stopPropagation()}
          >
          <div className="flex items-center justify-between mb-3">
            <div className="label-caps flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Top free times
            </div>
            <div className="flex items-center gap-1.5">
              {onBack && (
                <button
                  onClick={onBack}
                  className="w-7 h-7 rounded-full border-2 border-slate-900 grid place-items-center hover:bg-[var(--pastel-mint)] transition"
                  aria-label="Back to Astral hub"
                  title="Back to Astral hub"
                  data-testid="suggest-back-btn"
                >
                  <ArrowLeft className="w-3.5 h-3.5" strokeWidth={2.5} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-full border-2 border-slate-900 grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
                aria-label="Close"
                data-testid="suggest-close-btn"
              >
                <X className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {disabled ? (
            <p className="text-sm py-4 text-center" style={{ color: "var(--ink-soft)" }}>
              Add members and availability to see suggestions.
            </p>
          ) : (
            <>
              <ol className="space-y-2 mb-3">
                {suggestions.map((s, i) => (
                  <li
                    key={`${s.colKey}-${s.hour}-${s.minute}`}
                    className="rounded-xl p-3 border-2 flex items-center gap-3"
                    style={{
                      borderColor: "var(--ink)",
                      background:
                        s.ratio === 1 ? "var(--pastel-yellow)" : "var(--pastel-mint)",
                    }}
                    data-testid={`suggestion-${i}`}
                  >
                    <span
                      className="w-7 h-7 rounded-full grid place-items-center font-heading font-black text-xs border-2"
                      style={{ borderColor: "var(--ink)", background: "var(--card)" }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-black text-base leading-tight">
                        {s.colLabel} · {s.timeText}
                      </div>
                      <div className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
                        {s.free}/{s.total} free · {minuteStep}-min block
                        {s.ratio === 1 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider"
                            style={{ background: "var(--ink)", color: "var(--btn-fg)" }}>
                            Everyone
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => onOpenConfirm(s)}
                      className="px-2 h-9 rounded-full border-2 grid place-items-center hover:scale-105 transition text-[10px] font-bold uppercase tracking-wider"
                      style={{ borderColor: "var(--ink)", background: "var(--pastel-yellow)" }}
                      aria-label="Confirm meeting"
                      data-testid={`suggestion-confirm-${i}`}
                      title="Confirm this time and copy a confirmation message"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => onCopyOne(i, s)}
                      className="w-9 h-9 rounded-full border-2 grid place-items-center hover:scale-105 transition"
                      style={{ borderColor: "var(--ink)", background: "var(--card)" }}
                      aria-label="Copy suggestion"
                      data-testid={`suggestion-copy-${i}`}
                    >
                      {copiedIdx === i ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ol>
              <button
                onClick={onCopyAll}
                className="neo-btn w-full text-sm flex items-center justify-center gap-2"
                data-testid="suggest-copy-all-btn"
              >
                <Copy className="w-4 h-4" /> Copy all + invite link
              </button>
              <p className="mt-3 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                Based on the current view ({mode === "weekly" ? "weekly" : "date range"}, {timeLabel(hourFrom, 0)}–{timeLabel(hourTo, 0)}, {minuteStep}-min precision).
              </p>
            </>
          )}
        </div>
        </>
      )}

      {confirmFor && (
        <div
          className="fixed inset-0 bg-slate-900/60 grid place-items-center p-4 z-[70]"
          data-testid="confirm-meeting-modal"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setConfirmFor(null);
              setJoinLink("");
            }
          }}
        >
          <div
            className="neo-card p-5 max-w-md w-full"
            style={{ background: "var(--card)" }}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="label-caps" style={{ color: "var(--ink-soft)" }}>
                  Confirm meeting
                </div>
                <div className="font-heading font-black text-xl leading-tight mt-1">
                  {confirmFor.colLabel} · {confirmFor.timeText}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "var(--ink-soft)" }}>
                  {confirmFor.free}/{confirmFor.total} of {groupName} free
                </div>
              </div>
              <button
                onClick={() => {
                  setConfirmFor(null);
                  setJoinLink("");
                }}
                aria-label="Close confirmation"
                className="opacity-60 hover:opacity-100"
                data-testid="confirm-close-btn"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="label-caps mb-2" style={{ color: "var(--ink-soft)" }}>
              Join link (optional)
            </div>
            <input
              autoFocus
              type="url"
              className="neo-input w-full mb-2"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={joinLink}
              onChange={(e) => setJoinLink(e.target.value)}
              data-testid="confirm-join-link-input"
            />
            <p className="text-[11px] mb-4" style={{ color: "var(--ink-soft)" }}>
              Paste a Google Meet, Zoom, or any URL — it'll be appended to the
              confirmation message. Leave blank to skip.
            </p>

            <div
              className="rounded-xl border-2 p-3 mb-4 text-xs whitespace-pre-line font-mono"
              style={{ borderColor: "var(--ink)", background: "var(--pastel-mint)" }}
              data-testid="confirm-preview"
            >
              {confirmMessageFor(confirmFor, joinLink.trim())}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmFor(null);
                  setJoinLink("");
                }}
                className="neo-btn ghost text-sm flex-1"
                data-testid="confirm-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onCopyConfirmation}
                className="neo-btn pastel text-sm flex-1 flex items-center justify-center gap-2"
                data-testid="confirm-copy-btn"
              >
                <Copy className="w-4 h-4" /> Copy confirmation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
