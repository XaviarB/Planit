import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import {
  Lock, X, Loader2, Calendar, Download, Copy, MapPin, Sparkles,
  Trash2, Check, Minus, HelpCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import {
  createHangout, listHangouts, deleteHangout, rsvpHangout, updateHangout,
  memberFeedUrl, hangoutEventIcsUrl, astralDraftInvite,
} from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";

/**
 * LockInModal — Phase 4 commitment ladder.
 *
 * Opens from an Astral suggestion card. The user picks an exact day + start
 * hour + duration. We POST a Hangout (status=locked), then offer:
 *   • Copy the Astral-drafted invite message
 *   • Download .ics file (one-shot)
 *   • Subscribe URL (recurring sync via the member feed)
 *
 * Status lives on the hangout itself — even tentative hangouts show up in the
 * member feed (calendar apps render TENTATIVE distinctly). The user can flip
 * a hangout from tentative→locked anytime from HangoutsList.
 */
export function LockInModal({
  open, onClose, group, memberId, suggestion, defaultWindow,
  onCreated,
}) {
  const [date, setDate] = useState(() => isoDateInput(defaultDate(defaultWindow)));
  const [startHour, setStartHour] = useState(() => extractStartHour(defaultWindow) ?? 19);
  const [duration, setDuration] = useState(() => extractDurationHours(defaultWindow) ?? 3);
  const [status, setStatus] = useState("locked"); // "tentative" | "locked"
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(null);
  const [draftMsg, setDraftMsg] = useState(null);
  const [drafting, setDrafting] = useState(false);

  const startDt = useMemo(() => {
    const [y, m, d] = (date || "").split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d, startHour, 0, 0));
  }, [date, startHour]);
  const endDt = useMemo(() => {
    if (!startDt) return null;
    return new Date(startDt.getTime() + Math.max(1, duration) * 3600_000);
  }, [startDt, duration]);

  if (!open) return null;

  const onLock = async () => {
    if (!startDt || !endDt) {
      toast.error("pick a valid date and time");
      return;
    }
    setCreating(true);
    try {
      const h = await createHangout(group.code, {
        title: suggestion?.venue ? `${suggestion.venue}` : "Planit hangout",
        start_iso: startDt.toISOString(),
        end_iso: endDt.toISOString(),
        location_name: suggestion?.venue || null,
        address: suggestion?.neighborhood || null,
        astral_take: suggestion?.astral_take || null,
        suggestion_snapshot: suggestion || null,
        status,
        created_by: memberId,
      });
      // Auto-RSVP yes for the creator.
      if (memberId) {
        try {
          await rsvpHangout(group.code, h.id, memberId, "yes");
        } catch {}
      }
      setCreated(h);
      onCreated?.(h);
      toast.success(status === "locked" ? "locked it in 🔒" : "saved as tentative");

      // Auto-draft an invite the user can paste.
      try {
        setDrafting(true);
        const blurb = `${humanDate(startDt)} at ${formatHour(startHour)}`;
        const { message } = await astralDraftInvite(group.code, suggestion || h, blurb);
        setDraftMsg(message);
      } catch {
        /* non-fatal */
      } finally {
        setDrafting(false);
      }
    } catch (err) {
      console.error(err);
      toast.error("could not lock in");
    } finally {
      setCreating(false);
    }
  };

  const onCopyDraft = async () => {
    if (!draftMsg) return;
    const ok = await copyToClipboard(draftMsg);
    toast[ok ? "success" : "error"](ok ? "invite copied" : "copy failed");
  };

  const downloadIcs = () => {
    if (!created) return;
    // Real one-shot single-event .ics — distinct from the recurring feed
    // (which is offered as the "subscribe forever" option below).
    const url = hangoutEventIcsUrl(group.code, created.id);
    window.open(url, "_blank");
  };

  const feedUrl = memberId ? memberFeedUrl(group.code, memberId) : "";

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/60 backdrop-blur-sm"
      data-testid="lockin-modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="neo-card max-w-md w-full max-h-[90vh] overflow-y-auto bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl border-2 border-slate-900 grid place-items-center bg-[var(--pastel-yellow)]">
              <Lock className="w-4 h-4" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-heading font-black text-xl leading-tight">
                Lock it in
              </div>
              <div className="label-caps text-[0.6rem] opacity-70">
                {suggestion?.venue || "planit hangout"}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 grid place-items-center rounded-full border-2 border-slate-900 hover:bg-[var(--pastel-peach)]"
            aria-label="Close"
            data-testid="lockin-close-btn"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!created && (
          <>
            {/* Day + time grid */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label-caps text-[0.6rem] mb-1 block">date</label>
                <input
                  type="date"
                  className="neo-input w-full"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  data-testid="lockin-date-input"
                />
              </div>
              <div>
                <label className="label-caps text-[0.6rem] mb-1 block">start</label>
                <select
                  className="neo-input w-full"
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                  data-testid="lockin-start-input"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{formatHour(h)}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label-caps text-[0.6rem] mb-1 block">duration (hours)</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  className="neo-input w-full"
                  value={duration}
                  onChange={(e) => setDuration(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  data-testid="lockin-duration-input"
                />
              </div>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`flex-1 px-3 py-2 rounded-md border-2 border-slate-900 font-bold uppercase text-xs tracking-wider transition ${
                  status === "tentative" ? "bg-[var(--pastel-mint)]" : "bg-white"
                }`}
                onClick={() => setStatus("tentative")}
                data-testid="lockin-status-tentative"
              >
                tentative
              </button>
              <button
                type="button"
                className={`flex-1 px-3 py-2 rounded-md border-2 border-slate-900 font-bold uppercase text-xs tracking-wider transition ${
                  status === "locked" ? "bg-[var(--pastel-yellow)]" : "bg-white"
                }`}
                onClick={() => setStatus("locked")}
                data-testid="lockin-status-locked"
              >
                locked
              </button>
            </div>

            <button
              type="button"
              className="neo-btn w-full flex items-center justify-center gap-2"
              onClick={onLock}
              disabled={creating}
              data-testid="lockin-submit-btn"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {status === "locked" ? "lock it in" : "save tentative"}
            </button>
          </>
        )}

        {created && (
          <>
            <div className="rounded-xl border-2 border-slate-900 p-4 bg-[var(--pastel-mint)] space-y-2" data-testid="lockin-success">
              <div className="font-heading font-black text-lg">
                {created.title}
              </div>
              <div className="text-sm opacity-80 lowercase">
                {humanDate(startDt)} · {formatHour(startHour)} – {formatHour((startHour + duration) % 24)}
              </div>
              <div className="text-[0.65rem] uppercase tracking-wider font-bold">
                {created.status}
              </div>
            </div>

            {/* Astral-drafted pitch */}
            <div className="space-y-2">
              <div className="label-caps text-[0.6rem]">group-chat pitch</div>
              {drafting && (
                <div className="text-sm opacity-70 italic lowercase">
                  astral is drafting…
                </div>
              )}
              {!drafting && draftMsg && (
                <>
                  <div className="rounded-xl border-2 border-dashed border-slate-900 p-3 bg-[var(--pastel-yellow)] text-sm whitespace-pre-wrap">
                    {draftMsg}
                  </div>
                  <button
                    type="button"
                    className="neo-btn ghost text-sm w-full flex items-center justify-center gap-2"
                    onClick={onCopyDraft}
                    data-testid="lockin-copy-draft-btn"
                  >
                    <Copy className="w-3.5 h-3.5" /> copy invite
                  </button>
                </>
              )}
            </div>

            {/* Calendar export options */}
            <div className="space-y-2">
              <div className="label-caps text-[0.6rem]">add to your calendar</div>
              <button
                type="button"
                className="neo-btn ghost w-full flex items-center justify-center gap-2"
                onClick={downloadIcs}
                data-testid="lockin-ics-download-btn"
              >
                <Download className="w-4 h-4" /> download .ics
              </button>
              {feedUrl && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-bold uppercase tracking-wider opacity-80">
                    or subscribe (auto-syncs forever) →
                  </summary>
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      readOnly
                      className="neo-input flex-1 font-mono text-[0.65rem] !py-1.5"
                      value={feedUrl}
                      onFocus={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      className="neo-btn !py-1.5 !px-2 text-xs"
                      onClick={async () => {
                        const ok = await copyToClipboard(feedUrl);
                        toast[ok ? "success" : "error"](ok ? "copied" : "failed");
                      }}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </details>
              )}
            </div>

            <button
              type="button"
              className="neo-btn w-full"
              onClick={onClose}
              data-testid="lockin-done-btn"
            >
              done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// --- helpers ---

function defaultDate(blurb) {
  // Try "Saturday 7-11pm": pick the next Saturday. Otherwise tomorrow.
  const today = new Date();
  if (!blurb) {
    today.setDate(today.getDate() + 1);
    return today;
  }
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const lc = blurb.toLowerCase();
  for (let i = 0; i < days.length; i++) {
    if (lc.includes(days[i])) {
      const targetIdx = i;
      const todayIdx = today.getDay();
      let delta = (targetIdx - todayIdx + 7) % 7;
      if (delta === 0) delta = 7;
      const d = new Date(today);
      d.setDate(d.getDate() + delta);
      return d;
    }
  }
  today.setDate(today.getDate() + 1);
  return today;
}

function isoDateInput(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function extractStartHour(blurb) {
  if (!blurb) return null;
  // Match "7pm", "19:00", "7-11pm", "7 - 11 pm".
  const m = blurb.match(/(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mer = (m[3] || "").toLowerCase();
  if (mer === "pm" && h < 12) h += 12;
  if (mer === "am" && h === 12) h = 0;
  // If no meridiem and number ≤ 7, assume PM (typical hangout phrasing).
  if (!mer && h >= 1 && h <= 7) h += 12;
  return Math.max(0, Math.min(23, h));
}

function extractDurationHours(blurb) {
  if (!blurb) return null;
  // "7-11pm" or "7 to 11 pm"
  const m = blurb.match(/(\d{1,2})\s*(?::\d{2})?\s*(?:am|pm)?\s*[-–—to]+\s*(\d{1,2})\s*(?::\d{2})?\s*(am|pm)?/i);
  if (!m) return null;
  let s = parseInt(m[1], 10);
  let e = parseInt(m[2], 10);
  const mer = (m[3] || "").toLowerCase();
  if (mer === "pm" && e < 12) e += 12;
  if (mer === "am" && e === 12) e = 0;
  if (!mer && e >= 1 && e <= 7) e += 12;
  // Apply same heuristic to start.
  if (!mer && s >= 1 && s <= 7 && e > s) s += 12;
  let dur = e - s;
  if (dur <= 0) dur += 24;
  return Math.max(1, Math.min(12, dur));
}

function humanDate(d) {
  if (!d) return "";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function formatHour(h) {
  const hr = ((h % 24) + 24) % 24;
  if (hr === 0) return "12 am";
  if (hr === 12) return "12 pm";
  return hr < 12 ? `${hr} am` : `${hr - 12} pm`;
}

// =============================================================================
// HangoutsList — collapsible sidebar showing all locked/tentative hangouts.
// =============================================================================

export function HangoutsList({ group, memberId, onChanged }) {
  const [hangouts, setHangouts] = useState(group?.hangouts || []);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHangouts(group?.hangouts || []);
  }, [group?.hangouts]);

  const refresh = async () => {
    if (!group?.code) return;
    setLoading(true);
    try {
      const { hangouts: h } = await listHangouts(group.code);
      setHangouts(h || []);
      onChanged?.(h || []);
    } finally {
      setLoading(false);
    }
  };

  const upcoming = useMemo(() => {
    const now = Date.now();
    return (hangouts || [])
      .filter((h) => h.start_iso && new Date(h.start_iso).getTime() >= now - 3 * 3600_000)
      .sort((a, b) => a.start_iso.localeCompare(b.start_iso));
  }, [hangouts]);

  if (upcoming.length === 0) return null;

  return (
    <div className="neo-card p-4 bg-[var(--pastel-lavender)]" data-testid="hangouts-list">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2"
        onClick={() => setExpanded((v) => !v)}
        data-testid="hangouts-toggle-btn"
      >
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4" />
          <span className="font-heading font-black text-base">
            Upcoming ({upcoming.length})
          </span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {upcoming.map((h) => (
            <HangoutRow
              key={h.id}
              h={h}
              group={group}
              memberId={memberId}
              onChanged={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HangoutRow({ h, group, memberId, onChanged }) {
  const myRsvp = useMemo(() => {
    return (h.rsvps || []).find((r) => r.member_id === memberId)?.status;
  }, [h, memberId]);

  const onRsvp = async (status) => {
    try {
      await rsvpHangout(group.code, h.id, memberId, status);
      onChanged?.();
    } catch {
      toast.error("rsvp failed");
    }
  };

  const onLock = async () => {
    try {
      await updateHangout(group.code, h.id, { status: "locked" });
      toast.success("locked in 🔒");
      onChanged?.();
    } catch {
      toast.error("could not lock");
    }
  };

  const onDelete = async () => {
    if (!window.confirm("delete this hangout?")) return;
    try {
      await deleteHangout(group.code, h.id);
      toast.success("deleted");
      onChanged?.();
    } catch {
      toast.error("could not delete");
    }
  };

  const start = h.start_iso ? new Date(h.start_iso) : null;
  const end = h.end_iso ? new Date(h.end_iso) : null;

  return (
    <div className="rounded-xl border-2 border-slate-900 bg-white p-3 space-y-2" data-testid={`hangout-row-${h.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-heading font-black text-sm truncate">{h.title}</div>
          {start && (
            <div className="text-[0.7rem] opacity-70 lowercase">
              {start.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              {" · "}
              {start.toLocaleTimeString(undefined, { hour: "numeric" })}
              {end && ` – ${end.toLocaleTimeString(undefined, { hour: "numeric" })}`}
            </div>
          )}
        </div>
        <span
          className={`text-[0.55rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-2 border-slate-900 ${
            h.status === "locked" ? "bg-[var(--pastel-yellow)]" : "bg-white"
          }`}
        >
          {h.status === "locked" ? "🔒 locked" : "tentative"}
        </span>
      </div>

      {h.location_name && (
        <div className="text-[0.7rem] flex items-center gap-1 opacity-80">
          <MapPin className="w-3 h-3" />
          {h.location_name}
        </div>
      )}

      <div className="flex items-center gap-1">
        <RsvpBtn label="yes" icon={Check} active={myRsvp === "yes"} onClick={() => onRsvp("yes")} testid={`hangout-rsvp-yes-${h.id}`} />
        <RsvpBtn label="maybe" icon={HelpCircle} active={myRsvp === "maybe"} onClick={() => onRsvp("maybe")} testid={`hangout-rsvp-maybe-${h.id}`} />
        <RsvpBtn label="no" icon={Minus} active={myRsvp === "no"} onClick={() => onRsvp("no")} testid={`hangout-rsvp-no-${h.id}`} />
        <div className="flex-1" />
        <a
          href={hangoutEventIcsUrl(group.code, h.id)}
          target="_blank"
          rel="noreferrer"
          className="w-7 h-7 grid place-items-center rounded-md border-2 border-slate-900 hover:bg-[var(--pastel-mint)]"
          title="Download .ics — add this single hangout to your calendar"
          data-testid={`hangout-ics-${h.id}`}
        >
          <Download className="w-3 h-3" />
        </a>
        {h.status !== "locked" && (
          <button
            type="button"
            className="text-[0.6rem] font-bold uppercase tracking-wider px-2 py-1 rounded-md border-2 border-slate-900 bg-white hover:bg-[var(--pastel-yellow)]"
            onClick={onLock}
            data-testid={`hangout-lock-${h.id}`}
          >
            lock
          </button>
        )}
        <button
          type="button"
          className="w-7 h-7 grid place-items-center rounded-md border-2 border-slate-900 hover:bg-[var(--pastel-peach)]"
          onClick={onDelete}
          aria-label="Delete"
          data-testid={`hangout-delete-${h.id}`}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function RsvpBtn({ label, icon: Icon, active, onClick, testid }) {
  return (
    <button
      type="button"
      className={`text-[0.6rem] font-bold uppercase tracking-wider px-2 py-1 rounded-md border-2 border-slate-900 flex items-center gap-1 transition ${
        active ? "bg-[var(--pastel-mint)] shadow-[1px_1px_0_0_var(--ink)]" : "bg-white hover:bg-[var(--pastel-mint)]"
      }`}
      onClick={onClick}
      data-testid={testid}
    >
      <Icon className="w-3 h-3" />
      {label}
    </button>
  );
}
