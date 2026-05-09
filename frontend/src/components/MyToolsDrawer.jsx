import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import {
  Sparkles, X, Loader2, Check, Trash2, Plus, RefreshCcw, Copy,
  Calendar as CalIcon, Wand2, MessageCircle, Repeat, Link as LinkIcon,
  Download, ExternalLink, AlertTriangle, Save, ArrowLeft,
} from "lucide-react";
import {
  astralParseBusy,
  previewIcs,
  listCalendars, addCalendar, syncCalendar, deleteCalendar, memberFeedUrl,
  listTemplates, createTemplate, deleteTemplate, applyTemplate,
  updateSlots,
} from "../lib/api";
import { copyToClipboard } from "../lib/clipboard";
import { computeAnchorStyle } from "../lib/anchorStyle";

/**
 * MyToolsDrawer — the "your toolkit" right-side drawer.
 *
 * Three tabs collapse into one mental model: how do I get my busy hours into
 * Planit without painting them by hand?
 *
 *   ✨  Tell Astral   — natural-language → busy slots (preview → confirm-merge)
 *   🔁 Templates     — save current pattern, apply it across N future weeks
 *   📅 Calendars     — IN: paste secret iCal URL / .ics; OUT: copy a feed URL
 *                       to subscribe in Google/Apple/Outlook
 *
 * Slots are merged client-side via PUT /api/.../slots so the editor's
 * existing optimistic UX stays intact. We never silently mutate without
 * showing the user the diff.
 */
export default function MyToolsDrawer({
  open,
  onClose,
  onBack,
  group,
  memberId,
  onMemberUpdate, // ({slots?, templates?, calendars?}) => void
  focusSection,   // "busy" → start on "tell astral" tab (which is also default)
  anchor,
}) {
  const [tab, setTab] = useState("astral");

  // Honor focusSection when launched from the Astral Hub.
  useEffect(() => {
    if (!open) return;
    if (focusSection === "busy") setTab("astral");
  }, [open, focusSection]);

  if (!open) return null;

  const me = (group?.members || []).find((m) => m.id === memberId);

  const tabs = [
    { id: "astral",    label: "tell astral", icon: Sparkles },
    { id: "templates", label: "templates",   icon: Repeat },
    { id: "calendars", label: "calendars",   icon: CalIcon },
  ];

  // Floating bubble — anchored to the FAB orb instead of full-height drawer.
  const bubbleStyle = computeAnchorStyle({ anchor, width: 460, height: 620 });

  return (
    <>
      {/* Tap-out scrim */}
      <div
        className="fixed inset-0 z-40"
        data-testid="tools-drawer-scrim"
        onMouseDown={() => onClose?.()}
      />
      <div
        className="fixed z-50 astral-panel rounded-2xl border-2 border-slate-900 shadow-2xl overflow-y-auto"
        style={bubbleStyle}
        data-testid="tools-drawer"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 astral-header px-5 py-4 border-b-2 border-slate-900 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="astral-avatar w-11 h-11 rounded-2xl border-2 border-slate-900 grid place-items-center shrink-0">
              <Wand2 className="w-5 h-5" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-heading font-black text-xl leading-tight">
                Your toolkit
              </div>
              <div className="label-caps text-[0.62rem] opacity-80">
                fill your schedule without painting
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="w-9 h-9 rounded-full border-2 border-slate-900 grid place-items-center hover:bg-[var(--pastel-mint)] transition"
                aria-label="Back to Astral hub"
                title="Back to Astral hub"
                data-testid="tools-back-btn"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full border-2 border-slate-900 grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
              aria-label="Close"
              data-testid="tools-close-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="px-5 pt-4 flex gap-2 sticky top-[68px] z-[5]" style={{ background: "var(--card)" }}>
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex-1 px-3 py-2 rounded-full border-2 border-slate-900 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition ${
                  active
                    ? "bg-[var(--pastel-yellow)] shadow-[2px_2px_0_0_var(--ink)]"
                    : "bg-white hover:bg-[var(--pastel-mint)]"
                }`}
                data-testid={`tools-tab-${t.id}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-5 space-y-5">
          {!me && (
            <div className="neo-card p-4 bg-[var(--pastel-peach)] flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
              <div className="text-sm lowercase">
                join the group first to use these tools.
              </div>
            </div>
          )}

          {me && tab === "astral" && (
            <AstralBusyTab
              group={group}
              me={me}
              onMerged={(slots) => onMemberUpdate?.({ slots })}
            />
          )}
          {me && tab === "templates" && (
            <TemplatesTab
              group={group}
              me={me}
              onMerged={(slots) => onMemberUpdate?.({ slots })}
              onTemplatesChange={(templates) => onMemberUpdate?.({ templates })}
            />
          )}
          {me && tab === "calendars" && (
            <CalendarsTab
              group={group}
              me={me}
              onMerged={(slots) => onMemberUpdate?.({ slots })}
              onCalendarsChange={(calendars) => onMemberUpdate?.({ calendars })}
            />
          )}
        </div>
      </div>
    </>
  );
}

// =============================================================================
// TAB 1 — Tell Astral (natural-language busy parser)
// =============================================================================

function AstralBusyTab({ group, me, onMerged }) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null); // [slot]
  const [merging, setMerging] = useState(false);

  const onParse = async (e) => {
    e?.preventDefault?.();
    if (!text.trim()) {
      toast.error("type when you're busy first");
      return;
    }
    setLoading(true);
    setPreview(null);
    try {
      const out = await astralParseBusy(group.code, text.trim());
      setPreview(out.slots || []);
      if ((out.slots || []).length === 0) {
        toast.message("astral couldn't pull any slots from that — rephrase?");
      }
    } catch (err) {
      console.error(err);
      toast.error("astral fumbled the parse. try again?");
    } finally {
      setLoading(false);
    }
  };

  const onMerge = async () => {
    if (!preview || preview.length === 0) return;
    setMerging(true);
    try {
      // Merge into existing slots — "set busy" wins.
      const existing = me.slots || [];
      const seen = new Set(
        existing.map((s) => `${s.mode}|${s.key}|${s.hour}|${s.minute || 0}`)
      );
      const additions = preview.filter(
        (s) => !seen.has(`${s.mode}|${s.key}|${s.hour}|${s.minute || 0}`)
      );
      const next = [...existing, ...additions];
      await updateSlots(group.code, me.id, next);
      onMerged?.(next);
      toast.success(`painted ${additions.length} new busy hour${additions.length === 1 ? "" : "s"}`);
      setPreview(null);
      setText("");
    } catch (err) {
      console.error(err);
      toast.error("could not save merged slots");
    } finally {
      setMerging(false);
    }
  };

  const previewByDay = useMemo(() => {
    const m = new Map();
    (preview || []).forEach((s) => {
      const arr = m.get(s.key) || [];
      arr.push(s.hour);
      m.set(s.key, arr);
    });
    return Array.from(m.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, hrs]) => [k, hrs.sort((a, b) => a - b)]);
  }, [preview]);

  return (
    <form onSubmit={onParse} className="space-y-4" data-testid="tab-astral">
      <div className="astral-quote-block">
        <p className="font-heading text-base lowercase leading-snug">
          tell astral when you're busy in plain english — no painting, no calendar grids.
        </p>
        <p className="text-xs opacity-70 mt-1 lowercase">
          tip: you can drop multi-week patterns ("for the next 3 weeks i'm out tue-thu evenings").
        </p>
      </div>

      <textarea
        className="neo-input w-full h-28 resize-none"
        placeholder="e.g. slammed mon-wed 6-9pm next week, and out fri-sun"
        value={text}
        onChange={(e) => setText(e.target.value)}
        data-testid="nl-busy-input"
        autoFocus
      />

      <button
        type="submit"
        className="neo-btn w-full flex items-center justify-center gap-2"
        disabled={loading}
        data-testid="nl-busy-parse-btn"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            astral is reading…
          </>
        ) : (
          <>
            <MessageCircle className="w-4 h-4" />
            preview slots
          </>
        )}
      </button>

      {preview && (
        <div className="space-y-3" data-testid="nl-busy-preview">
          <div className="label-caps text-[0.65rem]">
            preview · {preview.length} hour{preview.length === 1 ? "" : "s"}
          </div>
          {preview.length === 0 ? (
            <div className="text-sm opacity-70 italic lowercase">
              nothing parsed. try being more specific.
            </div>
          ) : (
            <ul className="space-y-1.5 max-h-60 overflow-y-auto pr-1 text-sm">
              {previewByDay.map(([day, hours]) => (
                <li
                  key={day}
                  className="flex items-baseline gap-3 px-3 py-2 rounded-md border-2 border-slate-900 bg-[var(--pastel-mint)]"
                >
                  <span className="font-heading font-black w-32 shrink-0 text-[0.95rem]">
                    {formatPreviewDate(day)}
                  </span>
                  <span className="text-xs opacity-80 lowercase">
                    {compactHours(hours)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {preview.length > 0 && (
            <button
              type="button"
              className="neo-btn w-full flex items-center justify-center gap-2"
              onClick={onMerge}
              disabled={merging}
              data-testid="nl-busy-merge-btn"
            >
              {merging ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              merge into my schedule
            </button>
          )}
        </div>
      )}
    </form>
  );
}

function formatPreviewDate(iso) {
  try {
    const d = new Date(iso + "T00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function compactHours(hours) {
  // Group consecutive hours into ranges: [9,10,11,18] -> "9–11, 18"
  if (!hours.length) return "";
  const ranges = [];
  let start = hours[0], prev = hours[0];
  for (let i = 1; i < hours.length; i++) {
    if (hours[i] === prev + 1) {
      prev = hours[i];
    } else {
      ranges.push(start === prev ? `${fmtHour(start)}` : `${fmtHour(start)}–${fmtHour(prev + 1)}`);
      start = hours[i];
      prev = hours[i];
    }
  }
  ranges.push(start === prev ? `${fmtHour(start)}` : `${fmtHour(start)}–${fmtHour(prev + 1)}`);
  return ranges.join(", ");
}
function fmtHour(h) {
  const hr = ((h % 24) + 24) % 24;
  if (hr === 0) return "12am";
  if (hr === 12) return "12pm";
  return hr < 12 ? `${hr}am` : `${hr - 12}pm`;
}

// =============================================================================
// TAB 2 — Life Templates
// =============================================================================

function TemplatesTab({ group, me, onMerged, onTemplatesChange }) {
  const [templates, setTemplates] = useState(me.templates || []);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [applyingId, setApplyingId] = useState(null);
  const [weeksAhead, setWeeksAhead] = useState(4);

  // Refresh on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { templates: t } = await listTemplates(group.code, me.id);
        if (!cancelled) {
          setTemplates(t || []);
          onTemplatesChange?.(t || []);
        }
      } catch (err) {
        // non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.code, me.id]);

  const myWeeklySlots = useMemo(() => {
    // Convert me.slots to weekly representation for "save current pattern".
    // Date-mode slots are folded by day-of-week. Free slots ignored.
    const seen = new Set();
    const out = [];
    for (const s of me.slots || []) {
      if (s.status !== "busy") continue;
      let key;
      if (s.mode === "weekly") key = s.key;
      else {
        try {
          const d = new Date(s.key + "T00:00");
          key = `d${(d.getDay() + 6) % 7}`; // JS Sunday=0 → Mon=0
        } catch {
          continue;
        }
      }
      const sig = `${key}|${s.hour}|${s.minute || 0}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      out.push({
        mode: "weekly",
        key,
        hour: s.hour,
        minute: s.minute || 0,
        step: s.step || 60,
        status: "busy",
        reason_id: s.reason_id || null,
      });
    }
    return out;
  }, [me.slots]);

  const onCreate = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) {
      toast.error("give the template a name");
      return;
    }
    if (myWeeklySlots.length === 0) {
      toast.error("paint some busy hours first, then save");
      return;
    }
    setCreating(true);
    try {
      const tpl = await createTemplate(group.code, me.id, {
        name: name.trim(),
        slots: myWeeklySlots,
      });
      const next = [...templates, tpl];
      setTemplates(next);
      onTemplatesChange?.(next);
      setName("");
      toast.success(`saved "${tpl.name}" (${tpl.slots.length} hour${tpl.slots.length === 1 ? "" : "s"})`);
    } catch (err) {
      console.error(err);
      toast.error("couldn't save template");
    } finally {
      setCreating(false);
    }
  };

  const onApply = async (tpl) => {
    setApplyingId(tpl.id);
    try {
      const out = await applyTemplate(group.code, me.id, tpl.id, {
        weeks_ahead: weeksAhead,
      });
      // Re-fetch member's slots — easier than re-deriving locally.
      // We rely on Group.jsx's refresh, but we can hint by sending the new
      // slot-count via toast and pinging the parent to refresh.
      toast.success(`painted ${out.added} new busy hour${out.added === 1 ? "" : "s"} across ${out.weeks} week${out.weeks === 1 ? "" : "s"}`);
      // Trigger a client-side refresh by dispatching a synthetic merge —
      // parent has the freshest slots and re-renders the editor.
      onMerged?.(undefined);
    } catch (err) {
      console.error(err);
      toast.error("couldn't apply template");
    } finally {
      setApplyingId(null);
    }
  };

  const onDelete = async (tpl) => {
    if (!window.confirm(`delete "${tpl.name}"?`)) return;
    try {
      await deleteTemplate(group.code, me.id, tpl.id);
      const next = templates.filter((t) => t.id !== tpl.id);
      setTemplates(next);
      onTemplatesChange?.(next);
      toast.success("template deleted");
    } catch {
      toast.error("could not delete");
    }
  };

  return (
    <div className="space-y-4" data-testid="tab-templates">
      <div className="astral-quote-block">
        <p className="font-heading text-base lowercase leading-snug">
          paint your "work week" or "class schedule" once. apply across the
          next N weeks with a tap. no more re-painting every monday.
        </p>
      </div>

      {/* Save current pattern */}
      <form onSubmit={onCreate} className="neo-card p-4 space-y-3 bg-[var(--pastel-mint)]">
        <div className="label-caps text-[0.65rem] flex items-center gap-2">
          <Save className="w-3.5 h-3.5" />
          save current pattern as a template
        </div>
        <input
          className="neo-input w-full"
          placeholder="e.g. work week"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="template-name-input"
          maxLength={40}
        />
        <div className="text-xs opacity-70 lowercase">
          will save {myWeeklySlots.length} weekly busy hour{myWeeklySlots.length === 1 ? "" : "s"} from your current schedule.
        </div>
        <button
          type="submit"
          className="neo-btn w-full flex items-center justify-center gap-2"
          disabled={creating || myWeeklySlots.length === 0}
          data-testid="template-save-btn"
        >
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          save template
        </button>
      </form>

      {/* Apply controls */}
      <div className="rounded-xl border-2 border-slate-900 px-3 py-2.5 flex items-center justify-between gap-3 bg-white">
        <div className="label-caps text-[0.6rem]">apply for the next</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="12"
            value={weeksAhead}
            onChange={(e) => setWeeksAhead(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
            className="neo-input w-16 text-center !py-1.5"
            data-testid="template-weeks-input"
          />
          <span className="text-sm font-bold lowercase">week{weeksAhead === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {loading && <div className="text-sm opacity-70 lowercase">loading…</div>}
        {!loading && templates.length === 0 && (
          <div className="text-sm opacity-70 italic lowercase">
            no templates yet. paint your weekly pattern, name it above, and save.
          </div>
        )}
        {templates.map((tpl) => (
          <div
            key={tpl.id}
            className="neo-card p-3 flex items-center gap-3"
            data-testid={`template-row-${tpl.id}`}
          >
            <div className="flex-1 min-w-0">
              <div className="font-heading font-black text-base truncate">
                {tpl.name}
              </div>
              <div className="text-xs opacity-70 lowercase">
                {(tpl.slots || []).length} hour{(tpl.slots || []).length === 1 ? "" : "s"} · weekly
              </div>
            </div>
            <button
              type="button"
              className="neo-btn text-xs !py-1.5 !px-3 flex items-center gap-1"
              onClick={() => onApply(tpl)}
              disabled={applyingId === tpl.id}
              data-testid={`template-apply-${tpl.id}`}
            >
              {applyingId === tpl.id ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Repeat className="w-3 h-3" />
              )}
              apply
            </button>
            <button
              type="button"
              className="w-8 h-8 grid place-items-center rounded-md border-2 border-slate-900 hover:bg-[var(--pastel-peach)]"
              onClick={() => onDelete(tpl)}
              aria-label="Delete template"
              data-testid={`template-delete-${tpl.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// TAB 3 — Calendars (IN + OUT)
// =============================================================================

function CalendarsTab({ group, me, onMerged, onCalendarsChange }) {
  const [calendars, setCalendars] = useState(me.calendars || []);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [syncingId, setSyncingId] = useState(null);

  const [formMode, setFormMode] = useState("url"); // "url" | "raw"
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [icsText, setIcsText] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewSlots, setPreviewSlots] = useState(null);

  // OUT feed URL — derived per-member.
  const feedUrl = memberFeedUrl(group.code, me.id);

  const refresh = async () => {
    setLoading(true);
    try {
      const { calendars: c } = await listCalendars(group.code, me.id);
      setCalendars(c || []);
      onCalendarsChange?.(c || []);
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.code, me.id]);

  const onPreview = async () => {
    setPreviewing(true);
    setPreviewSlots(null);
    try {
      const payload =
        formMode === "url" ? { kind: "url", url: url.trim() } : { kind: "raw", ics_text: icsText };
      const out = await previewIcs(group.code, payload);
      setPreviewSlots(out.slots || []);
      toast.message(`found ${out.count} busy hour${out.count === 1 ? "" : "s"} in the next 90 days`);
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.detail || "couldn't read that calendar";
      toast.error(typeof msg === "string" ? msg : "couldn't read that calendar");
    } finally {
      setPreviewing(false);
    }
  };

  const onAdd = async () => {
    setAdding(true);
    try {
      const payload =
        formMode === "url"
          ? { kind: "url", url: url.trim(), label: label.trim() || "External calendar" }
          : { kind: "raw", ics_text: icsText, label: label.trim() || "Uploaded .ics" };
      const out = await addCalendar(group.code, me.id, payload);
      // Optimistically push the new calendar into local state.
      const next = [...calendars, out.calendar];
      setCalendars(next);
      onCalendarsChange?.(next);
      onMerged?.(undefined); // tells parent to refetch group → fresh slots
      toast.success(`merged ${out.added} new busy hour${out.added === 1 ? "" : "s"}`);
      // Reset form.
      setUrl("");
      setLabel("");
      setIcsText("");
      setPreviewSlots(null);
    } catch (err) {
      console.error(err);
      const msg =
        err?.response?.data?.detail || "couldn't add that calendar";
      toast.error(typeof msg === "string" ? msg : "couldn't add that calendar");
    } finally {
      setAdding(false);
    }
  };

  const onSync = async (cal) => {
    setSyncingId(cal.id);
    try {
      const out = await syncCalendar(group.code, me.id, cal.id);
      onMerged?.(undefined);
      toast.success(`synced — ${out.added} new busy hour${out.added === 1 ? "" : "s"}`);
      refresh();
    } catch (err) {
      const msg =
        err?.response?.data?.detail || "sync failed";
      toast.error(typeof msg === "string" ? msg : "sync failed");
    } finally {
      setSyncingId(null);
    }
  };

  const onDelete = async (cal) => {
    if (!window.confirm(`remove "${cal.label}"? (your busy slots stay)`)) return;
    try {
      await deleteCalendar(group.code, me.id, cal.id);
      const next = calendars.filter((c) => c.id !== cal.id);
      setCalendars(next);
      onCalendarsChange?.(next);
      toast.success("removed");
    } catch {
      toast.error("couldn't remove");
    }
  };

  const onCopyFeed = async () => {
    const ok = await copyToClipboard(feedUrl);
    toast[ok ? "success" : "error"](
      ok ? "feed url copied — paste into google/apple/outlook" : "copy failed"
    );
  };

  return (
    <div className="space-y-5" data-testid="tab-calendars">
      {/* OUT — Subscribe to your Planit hangouts */}
      <div className="neo-card p-4 space-y-3 bg-[var(--pastel-lavender)]">
        <div className="flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span className="label-caps text-[0.65rem]">your planit feed (out)</span>
        </div>
        <p className="text-sm lowercase">
          paste this URL into google calendar / apple calendar / outlook → every
          locked planit hangout appears in your calendar automatically.
        </p>
        <div className="flex items-center gap-2">
          <input
            readOnly
            className="neo-input flex-1 font-mono text-xs !py-2"
            value={feedUrl}
            data-testid="feed-url-input"
            onFocus={(e) => e.target.select()}
          />
          <button
            type="button"
            onClick={onCopyFeed}
            className="neo-btn !px-3 !py-2 flex items-center gap-1"
            data-testid="feed-url-copy-btn"
          >
            <Copy className="w-3.5 h-3.5" />
            copy
          </button>
        </div>
        <details className="text-xs opacity-80">
          <summary className="cursor-pointer font-bold uppercase tracking-wider">
            how to subscribe →
          </summary>
          <ul className="mt-2 space-y-1 list-disc pl-5 lowercase">
            <li><b>google calendar:</b> settings → add calendar → "from URL" → paste.</li>
            <li><b>apple calendar:</b> file → new calendar subscription → paste.</li>
            <li><b>outlook:</b> add calendar → subscribe from web → paste.</li>
          </ul>
        </details>
      </div>

      {/* IN — Add an external calendar */}
      <div className="neo-card p-4 space-y-3 bg-[var(--pastel-mint)]">
        <div className="flex items-center gap-2">
          <LinkIcon className="w-4 h-4" />
          <span className="label-caps text-[0.65rem]">connect a calendar (in)</span>
        </div>
        <p className="text-sm lowercase">
          paste your secret iCal URL or upload a .ics file — events become busy
          hours in your planit schedule.
        </p>

        {/* Mode tabs */}
        <div className="flex gap-1.5">
          <button
            type="button"
            className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md border-2 border-slate-900 transition ${
              formMode === "url" ? "bg-[var(--pastel-yellow)]" : "bg-white"
            }`}
            onClick={() => setFormMode("url")}
            data-testid="cal-form-mode-url"
          >
            ical url
          </button>
          <button
            type="button"
            className={`text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-md border-2 border-slate-900 transition ${
              formMode === "raw" ? "bg-[var(--pastel-yellow)]" : "bg-white"
            }`}
            onClick={() => setFormMode("raw")}
            data-testid="cal-form-mode-raw"
          >
            paste .ics
          </button>
        </div>

        <input
          className="neo-input w-full"
          placeholder="label (e.g. work google cal)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          data-testid="cal-label-input"
          maxLength={40}
        />

        {formMode === "url" ? (
          <input
            className="neo-input w-full font-mono text-xs"
            placeholder="https://calendar.google.com/calendar/ical/.../private-...//basic.ics"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            data-testid="cal-url-input"
          />
        ) : (
          <textarea
            className="neo-input w-full h-32 font-mono text-xs resize-none"
            placeholder="paste raw .ics text here"
            value={icsText}
            onChange={(e) => setIcsText(e.target.value)}
            data-testid="cal-raw-input"
          />
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className="neo-btn ghost text-sm flex items-center justify-center gap-1.5"
            onClick={onPreview}
            disabled={previewing || (formMode === "url" ? !url.trim() : !icsText.trim())}
            data-testid="cal-preview-btn"
          >
            {previewing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            preview
          </button>
          <button
            type="button"
            className="neo-btn text-sm flex items-center justify-center gap-1.5"
            onClick={onAdd}
            disabled={adding || (formMode === "url" ? !url.trim() : !icsText.trim())}
            data-testid="cal-add-btn"
          >
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            connect & merge
          </button>
        </div>

        {previewSlots !== null && (
          <div className="text-xs lowercase opacity-80 pt-1" data-testid="cal-preview-result">
            {previewSlots.length === 0
              ? "no busy hours found in the next 90 days. recurring events that don't have explicit instances aren't expanded yet."
              : `${previewSlots.length} busy hour${previewSlots.length === 1 ? "" : "s"} ready to merge.`}
          </div>
        )}

        <details className="text-xs opacity-80 pt-1">
          <summary className="cursor-pointer font-bold uppercase tracking-wider">
            where do i find my secret ical url? →
          </summary>
          <ul className="mt-2 space-y-1 list-disc pl-5 lowercase">
            <li><b>google calendar:</b> settings → integrate calendar → "secret address in iCal format".</li>
            <li><b>apple/icloud:</b> calendar settings → public calendar (or share read-only).</li>
            <li><b>outlook.com:</b> calendar settings → share → "publish calendar" → ICS link.</li>
          </ul>
          <p className="mt-2 lowercase">treat the url like a password — anyone with it can read your busy hours.</p>
        </details>
      </div>

      {/* List */}
      <div className="space-y-2">
        <div className="label-caps text-[0.65rem] px-1">connected calendars</div>
        {loading && <div className="text-sm opacity-70 lowercase px-1">loading…</div>}
        {!loading && calendars.length === 0 && (
          <div className="text-sm opacity-70 italic lowercase px-1">
            no calendars connected yet.
          </div>
        )}
        {calendars.map((cal) => (
          <div
            key={cal.id}
            className="neo-card p-3 flex items-center gap-3"
            data-testid={`cal-row-${cal.id}`}
          >
            <CalIcon className="w-4 h-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-heading font-black text-sm truncate">
                {cal.label}
              </div>
              <div className="text-[0.65rem] opacity-60 truncate font-mono">
                {cal.value_masked || "(uploaded .ics)"}
                {cal.last_synced_at && (
                  <span className="ml-2 lowercase">
                    · synced {timeAgo(cal.last_synced_at)} · {cal.last_event_count} ev
                  </span>
                )}
              </div>
            </div>
            {cal.kind === "url" && (
              <button
                type="button"
                className="w-8 h-8 grid place-items-center rounded-md border-2 border-slate-900 hover:bg-[var(--pastel-yellow)]"
                onClick={() => onSync(cal)}
                disabled={syncingId === cal.id}
                aria-label="Sync now"
                data-testid={`cal-sync-${cal.id}`}
                title="Re-fetch and merge"
              >
                {syncingId === cal.id ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCcw className="w-3.5 h-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              className="w-8 h-8 grid place-items-center rounded-md border-2 border-slate-900 hover:bg-[var(--pastel-peach)]"
              onClick={() => onDelete(cal)}
              aria-label="Remove"
              data-testid={`cal-delete-${cal.id}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function timeAgo(iso) {
  try {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return "—";
  }
}
