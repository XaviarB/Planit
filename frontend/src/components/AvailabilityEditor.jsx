import { Fragment, forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { buildTimeSlots, timeLabel } from "../lib/schedule";
import { updateSlots, addReason, deleteReason, astralParseBusy } from "../lib/api";
import { toast } from "sonner";
import { Settings, Plus, X, ChevronDown, Repeat, Sparkles, Loader2, Palette, Type } from "lucide-react";

// ── Personal editor "skin" — per-user theme & font for THIS user's editing
// view only. Stored locally; never sent to the backend, so it can't leak onto
// the shared group schedule. Each preset just tweaks the default busy-cell
// colour + font-family of the grid.
const SKIN_PRESETS = {
  default: { label: "Crimson", busyColor: "#E74C3C", accent: "#E74C3C" },
  coral:   { label: "Coral",   busyColor: "#FF7B6B", accent: "#FF7B6B" },
  plum:    { label: "Plum",    busyColor: "#8B5CF6", accent: "#8B5CF6" },
  forest:  { label: "Forest",  busyColor: "#1E8E5A", accent: "#1E8E5A" },
  slate:   { label: "Slate",   busyColor: "#1f2937", accent: "#1f2937" },
  ocean:   { label: "Ocean",   busyColor: "#2563EB", accent: "#2563EB" },
};
const FONT_PRESETS = {
  default: { label: "Default", family: "" },
  mono:    { label: "Mono",    family: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace' },
  serif:   { label: "Serif",   family: 'ui-serif, Georgia, "Times New Roman", serif' },
  rounded: { label: "Rounded", family: '"Nunito", "Quicksand", system-ui, -apple-system, sans-serif' },
  display: { label: "Display", family: '"Space Grotesk", "Inter", system-ui, sans-serif' },
};

// Editor for a single member. Click/touch a cell to toggle busy/free.
// `minuteStep` is owned LOCALLY by this component (precision only affects
// editing — group-wide grids stay at hour granularity).
const AvailabilityEditor = forwardRef(function AvailabilityEditor({
  code,
  me,
  reasons,
  columns,
  mode,
  hourFrom = 0,
  hourTo = 23,
  minuteStep,
  onMinuteStepChange,
  onReasonsChange,
  onSaved,
}, ref) {
  // Internal precision if parent didn't supply one (defaults to 60).
  const [internalStep, setInternalStep] = useState(minuteStep || 60);
  const step = minuteStep || internalStep;
  const setStep = (s) => {
    setInternalStep(s);
    onMinuteStepChange && onMinuteStepChange(s);
  };

  // Local edit map keyed by `${mode}|${colKey}|${hour}|${minute}` → busy slot.
  // Slots NOT in the visible mode/columns are preserved as-is at save time.
  const buildEditMap = (slots, st) => {
    const m = new Map();
    for (const s of slots || []) {
      if (s.status !== "busy") continue;
      const sStep = s.step || 60;
      const startMin = s.hour * 60 + (s.minute || 0);
      const endMin = startMin + sStep;
      // Explode into `st`-sized child cells aligned to current grid.
      for (let mm = startMin; mm < endMin; mm += st) {
        const hour = Math.floor(mm / 60);
        const minute = mm % 60;
        if (hour > 23) break;
        const k = `${s.mode}|${s.key}|${hour}|${minute}`;
        const existing = m.get(k);
        if (!existing || (!existing.reason_id && s.reason_id)) {
          m.set(k, {
            mode: s.mode,
            key: s.key,
            hour,
            minute,
            step: st,
            status: "busy",
            reason_id: s.reason_id || null,
          });
        }
      }
    }
    return m;
  };

  const [slotMap, setSlotMap] = useState(() => buildEditMap(me.slots, step));
  const [activeReason, setActiveReason] = useState(reasons[0]?.id || null);
  const [drag, setDrag] = useState(null); // {targetStatus}
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [recurringPanelOpen, setRecurringPanelOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#7FB3D5");
  const [reasonBusy, setReasonBusy] = useState(false);

  // ── PERSONAL editor skin (theme + font). Lives in localStorage scoped by
  // (group, member). Pure cosmetic — never persisted to the backend so the
  // group schedule view is unaffected.
  const skinKey = `planit:editor-skin:${code}:${me.id}`;
  const [skin, setSkin] = useState(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(skinKey) : null;
      const parsed = raw ? JSON.parse(raw) : null;
      return {
        themeId: parsed?.themeId || "default",
        fontId: parsed?.fontId || "default",
      };
    } catch {
      return { themeId: "default", fontId: "default" };
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(skinKey, JSON.stringify(skin));
    } catch {
      // localStorage unavailable — silent.
    }
  }, [skin, skinKey]);

  // ── RECURRING events parser state. Lets the user type "working all week
  // 2-6pm" and auto-paint weekly recurring busy slots (mode=weekly, key=d0..d6).
  // These overlay onto every date in the group's heatmap thanks to the
  // weekly-overlay logic already in QuickStats / heatmap.
  const [recurringText, setRecurringText] = useState("");
  const [recurringBusy, setRecurringBusy] = useState(false);

  const applyRecurring = async () => {
    const text = recurringText.trim();
    if (!text) {
      toast.error("type something like 'working all week 2-6pm'");
      return;
    }
    setRecurringBusy(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const res = await astralParseBusy(code, text, today, "weekly");
      const slots = res?.slots || [];
      if (slots.length === 0) {
        toast.error("astral couldn't pin that down — try being more specific");
        return;
      }
      setSlotMap((prev) => {
        const m = new Map(prev);
        for (const s of slots) {
          const sStep = s.step || 60;
          const startMin = (s.hour || 0) * 60 + (s.minute || 0);
          const endMin = startMin + sStep;
          for (let mm = startMin; mm < endMin; mm += step) {
            const hour = Math.floor(mm / 60);
            const minute = mm % 60;
            if (hour > 23) break;
            const k = `${s.mode}|${s.key}|${hour}|${minute}`;
            m.set(k, {
              mode: s.mode,
              key: s.key,
              hour,
              minute,
              step,
              status: "busy",
              reason_id: activeReason || null,
            });
          }
        }
        return m;
      });
      toast.success(`added ${slots.length} recurring slot${slots.length === 1 ? "" : "s"} — hit "Done editing" to save`);
      setRecurringText("");
    } catch (e) {
      toast.error("recurring parse failed");
    } finally {
      setRecurringBusy(false);
    }
  };

  const currentSkin = SKIN_PRESETS[skin.themeId] || SKIN_PRESETS.default;
  const currentFont = FONT_PRESETS[skin.fontId] || FONT_PRESETS.default;

  const timeSlots = useMemo(
    () => buildTimeSlots(hourFrom, hourTo, step),
    [hourFrom, hourTo, step]
  );

  // Re-derive when underlying slots change OR when precision changes.
  useEffect(() => {
    setSlotMap(buildEditMap(me.slots, step));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.id, me.slots, step]);

  const reasonMap = useMemo(() => Object.fromEntries(reasons.map((r) => [r.id, r])), [reasons]);

  const keyFor = (colKey, hour, minute) => `${mode}|${colKey}|${hour}|${minute}`;

  const setSlot = (colKey, hour, minute, nextStatus, reason_id) => {
    const k = keyFor(colKey, hour, minute);
    setSlotMap((prev) => {
      const m = new Map(prev);
      if (nextStatus === "free") {
        m.delete(k);
      } else {
        m.set(k, {
          mode,
          key: colKey,
          hour,
          minute,
          step,
          status: "busy",
          reason_id: reason_id || null,
        });
      }
      return m;
    });
  };

  const currentStatus = (colKey, hour, minute) =>
    slotMap.has(keyFor(colKey, hour, minute)) ? "busy" : "free";
  const currentReason = (colKey, hour, minute) =>
    slotMap.get(keyFor(colKey, hour, minute))?.reason_id;

  const onCellDown = (colKey, hour, minute) => {
    const cur = currentStatus(colKey, hour, minute);
    const next = cur === "free" ? "busy" : "free";
    setDrag({ target: next });
    setSlot(colKey, hour, minute, next, activeReason);
  };
  const onCellEnter = (colKey, hour, minute) => {
    if (!drag) return;
    setSlot(colKey, hour, minute, drag.target, activeReason);
  };
  const onUp = () => setDrag(null);

  // Touch / mobile gesture support — convert touchmove into cell paint events.
  const onTouchStart = (colKey, hour, minute) => (e) => {
    e.preventDefault();
    onCellDown(colKey, hour, minute);
  };
  const onTouchMove = (e) => {
    if (!drag) return;
    // Prevent the native "drag selects text" / scroll-bounce on the editor
    // grid while we're painting cells. Cells already have touch-action:none,
    // but Safari occasionally fires touchmove on the wrapper before we hit a cell.
    if (e.cancelable) e.preventDefault();
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    if (!el) return;
    const tid = el.getAttribute && el.getAttribute("data-cell-coord");
    if (!tid) return;
    const [colKey, h, m] = tid.split("|");
    setSlot(colKey, Number(h), Number(m), drag.target, activeReason);
  };
  const onTouchEnd = () => setDrag(null);

  useEffect(() => {
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
    return () => {
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Imperative save — exposed to parent so the Done editing button can save+exit.
  const performSave = async () => {
    try {
      const visibleColumnKeys = new Set(columns.map((c) => c.key));
      const preserved = (me.slots || []).filter(
        (s) =>
          s.status === "busy" &&
          !(s.mode === mode && visibleColumnKeys.has(s.key))
      );
      const edits = Array.from(slotMap.values());
      const slots = [...preserved, ...edits];
      await updateSlots(code, me.id, slots);
      toast.success("Availability saved!");
      onSaved && onSaved(slots);
      return { ok: true };
    } catch (e) {
      toast.error("Failed to save.");
      return { ok: false, error: e };
    }
  };
  useImperativeHandle(ref, () => ({ save: performSave }), [slotMap, columns, me]);

  const onClear = () => setSlotMap(new Map());

  // ---- Reason customization handlers ----
  const onAddReason = async (e) => {
    e?.preventDefault?.();
    const label = newLabel.trim();
    if (!label) return toast.error("Give your label a name");
    setReasonBusy(true);
    try {
      const created = await addReason(code, label, newColor);
      onReasonsChange && onReasonsChange([...reasons, created]);
      setActiveReason(created.id);
      setNewLabel("");
      toast.success(`Added "${label}"`);
    } catch {
      toast.error("Could not add label");
    } finally {
      setReasonBusy(false);
    }
  };

  const onDeleteReason = async (id) => {
    setReasonBusy(true);
    try {
      await deleteReason(code, id);
      const next = reasons.filter((r) => r.id !== id);
      onReasonsChange && onReasonsChange(next);
      if (activeReason === id) setActiveReason(next[0]?.id || null);
      toast.success("Label removed");
    } catch {
      toast.error("Could not remove label");
    } finally {
      setReasonBusy(false);
    }
  };

  const cellHeight = step === 60 ? 34 : step === 30 ? 24 : 18;

  return (
    <div className="neo-card p-4 sm:p-6" data-testid="availability-editor">
      {/* Toolbar — Precision · Clear view · Customize labels all on a single row.
          Precision sits flush-left, the two action buttons hug the right. On narrow
          viewports it wraps gracefully but the desktop default is one continuous row. */}
      <div className="flex flex-wrap items-center gap-3 mb-4" data-testid="editor-toolbar">
        <div className="label-caps">Precision</div>
        <div
          className="inline-flex rounded-full border-2 border-slate-900 overflow-hidden"
          data-testid="editor-minute-step-toggle"
        >
          {[60, 30, 15].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(s)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
                step === s
                  ? "bg-slate-900 text-white"
                  : "bg-white hover:bg-[var(--pastel-mint)]"
              }`}
              data-testid={`editor-minute-step-${s}`}
            >
              {s === 60 ? "1 hr" : `${s} min`}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <button
          className="neo-btn ghost text-sm"
          onClick={onClear}
          data-testid="editor-clear-btn"
        >
          Clear view
        </button>
        <button
          type="button"
          onClick={() => setCustomizeOpen((v) => !v)}
          className="neo-btn ghost text-sm flex items-center gap-1.5"
          data-testid="customize-labels-btn"
        >
          <Settings className="w-3.5 h-3.5" />
          Customize labels
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${
              customizeOpen ? "rotate-180" : ""
            }`}
          />
        </button>
        <button
          type="button"
          onClick={() => setRecurringPanelOpen((v) => !v)}
          className="neo-btn ghost text-sm flex items-center gap-1.5"
          data-testid="recurring-busy-toggle-btn"
        >
          <Repeat className="w-3.5 h-3.5" />
          Recurring busy
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform ${
              recurringPanelOpen ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Reason selector */}
      <div className="mb-4">
        <div className="label-caps mb-2">Why are you busy?</div>
        <div className="flex flex-wrap gap-2" data-testid="reason-picker">
          <ReasonChip
            selected={activeReason === null}
            onClick={() => setActiveReason(null)}
            color="#ffffff"
            label="No reason"
            border
            testId="reason-chip-none"
          />
          {reasons.map((r) => (
            <ReasonChip
              key={r.id}
              selected={activeReason === r.id}
              onClick={() => setActiveReason(r.id)}
              color={r.color}
              label={r.label}
              testId={`reason-chip-${r.id}`}
            />
          ))}
        </div>
        <div className="mt-2 text-xs text-slate-600">
          Tap & drag cells to mark busy with this reason. Tap again to mark free. Hit <b>Done editing</b> when finished — it saves automatically.
        </div>

        {customizeOpen && (
          <div
            className="mt-3 p-3 rounded-xl border-2 border-slate-900 bg-[var(--pastel-mint)]"
            data-testid="customize-panel"
          >
            <div className="label-caps mb-2">Your labels</div>
            <div className="flex flex-wrap gap-2 mb-3">
              {reasons.length === 0 && (
                <span className="text-xs text-slate-600">
                  No labels yet — add your first below.
                </span>
              )}
              {reasons.map((r) => (
                <span
                  key={r.id}
                  className="px-2 py-1 text-xs font-bold rounded-full border-2 border-slate-900 text-white flex items-center gap-1.5"
                  style={{ background: r.color }}
                >
                  {r.label}
                  <button
                    type="button"
                    onClick={() => onDeleteReason(r.id)}
                    disabled={reasonBusy}
                    className="hover:text-red-200"
                    aria-label={`Remove ${r.label}`}
                    data-testid={`delete-reason-${r.id}`}
                  >
                    <X className="w-3 h-3" strokeWidth={3} />
                  </button>
                </span>
              ))}
            </div>

            <form onSubmit={onAddReason} className="flex flex-wrap items-center gap-2" data-testid="add-reason-form">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="New label (e.g. Travel)"
                maxLength={20}
                className="neo-input flex-1 min-w-[140px] text-sm"
                data-testid="new-reason-label"
              />
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-10 h-10 rounded-lg border-2 border-slate-900 cursor-pointer p-0 bg-white"
                data-testid="new-reason-color"
                title="Pick a color"
              />
              <button
                type="submit"
                disabled={reasonBusy || !newLabel.trim()}
                className="neo-btn pastel text-sm flex items-center gap-1"
                data-testid="add-reason-btn"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Personal-only — recurring events parser + theme/font. Stored locally,
          never affects the shared group schedule view. Hidden by default,
          revealed via the "Recurring busy" toggle in the toolbar above. */}
      {recurringPanelOpen && (
      <div
        className="mb-4 p-3 rounded-xl border-2 border-slate-900 bg-[var(--card-soft,var(--card))] space-y-3"
        data-testid="editor-personal-panel"
        style={{ fontFamily: currentFont.family || undefined }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5" />
            <span className="label-caps">Recurring busy</span>
          </div>
          <span
            className="text-[10px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full border-2 border-slate-900 bg-[var(--pastel-mint)]"
            title="These settings only affect your editing view — the group schedule looks the same to everyone else."
          >
            just for you
          </span>
        </div>

        <div className="flex items-stretch gap-2 flex-wrap">
          <input
            type="text"
            value={recurringText}
            onChange={(e) => setRecurringText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyRecurring();
              }
            }}
            placeholder="e.g. working all week 2pm to 6pm"
            disabled={recurringBusy}
            className="neo-input flex-1 min-w-[200px] text-sm"
            data-testid="editor-recurring-input"
          />
          <button
            type="button"
            onClick={applyRecurring}
            disabled={recurringBusy || !recurringText.trim()}
            className="neo-btn pastel text-sm flex items-center gap-1.5 disabled:opacity-50"
            data-testid="editor-recurring-apply"
            style={{ background: currentSkin.accent, color: "#fff" }}
          >
            {recurringBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            {recurringBusy ? "parsing…" : "apply"}
          </button>
        </div>
        <div className="text-[11px] leading-snug" style={{ color: "var(--ink-mute)" }}>
          Type a recurring rule and astral will paint matching cells across every week.
          e.g. <code className="px-1 bg-white border border-slate-300 rounded">weekdays 9-5</code>,
          <code className="px-1 bg-white border border-slate-300 rounded ml-1">tue & thu 7-9pm</code>,
          <code className="px-1 bg-white border border-slate-300 rounded ml-1">working all week 2pm to 6pm</code>.
        </div>

        {/* Personal theme + font row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t-2 border-slate-900/15">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Palette className="w-3 h-3" />
              <span className="label-caps text-[10px]">My theme</span>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="editor-theme-picker">
              {Object.entries(SKIN_PRESETS).map(([id, p]) => {
                const active = skin.themeId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSkin({ ...skin, themeId: id })}
                    className={`flex items-center gap-1.5 px-2 py-1 text-[11px] font-bold rounded-full border-2 transition ${
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-900/40 bg-white hover:border-slate-900"
                    }`}
                    data-testid={`editor-theme-${id}`}
                    title={p.label}
                  >
                    <span
                      className="inline-block w-3 h-3 rounded-full border border-slate-900"
                      style={{ background: p.busyColor }}
                    />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Type className="w-3 h-3" />
              <span className="label-caps text-[10px]">My font</span>
            </div>
            <div className="flex flex-wrap gap-1.5" data-testid="editor-font-picker">
              {Object.entries(FONT_PRESETS).map(([id, f]) => {
                const active = skin.fontId === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSkin({ ...skin, fontId: id })}
                    className={`px-2 py-1 text-[11px] font-bold rounded-full border-2 transition ${
                      active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-900/40 bg-white hover:border-slate-900"
                    }`}
                    style={{ fontFamily: f.family || undefined }}
                    data-testid={`editor-font-${id}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Editable grid */}
      <div
        className="scroll-x"
        onMouseLeave={() => setDrag(null)}
        onTouchMove={onTouchMove}
        style={{ fontFamily: currentFont.family || undefined }}
      >
        <div
          className="grid gap-1 min-w-fit select-none"
          style={{
            gridTemplateColumns: `64px repeat(${columns.length}, minmax(48px, 1fr))`,
          }}
        >
          <div />
          {columns.map((c) => (
            <div key={c.key} className="label-caps text-center py-1">
              {c.label}
            </div>
          ))}

          {timeSlots.map(({ hour, minute }) => (
            <Fragment key={`edit-${hour}-${minute}`}>
              <div
                className={`text-[11px] font-semibold flex items-center justify-end pr-2 ${
                  minute === 0 ? "text-slate-700" : "text-slate-400"
                }`}
              >
                {minute === 0 ? timeLabel(hour, 0) : `:${String(minute).padStart(2, "0")}`}
              </div>
              {columns.map((c) => {
                const status = currentStatus(c.key, hour, minute);
                const reason = currentReason(c.key, hour, minute);
                const r = reason ? reasonMap[reason] : null;
                const bg = status === "busy"
                  ? (r ? r.color : currentSkin.busyColor)
                  : "var(--card-soft, var(--card))";
                const borderStyle = status === "busy" ? "transparent" : "var(--ink)";
                const textColor = status === "busy" ? "#fff" : "transparent";
                return (
                  <div
                    key={`${c.key}-${hour}-${minute}`}
                    className="heat-cell rounded-md flex items-center justify-center border-2"
                    style={{
                      background: bg,
                      minHeight: cellHeight,
                      borderColor: borderStyle,
                      opacity: status === "busy" ? 1 : 0.55,
                      touchAction: "none",
                    }}
                    onMouseDown={() => onCellDown(c.key, hour, minute)}
                    onMouseEnter={() => onCellEnter(c.key, hour, minute)}
                    onTouchStart={onTouchStart(c.key, hour, minute)}
                    data-cell-coord={`${c.key}|${hour}|${minute}`}
                    data-testid={`edit-cell-${c.key}-${hour}-${minute}`}
                    title={status === "busy" ? `Busy${r ? " · " + r.label : ""}` : "Free"}
                  >
                    {r && status === "busy" && step >= 30 && (
                      <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: textColor }}>
                        {r.label.slice(0, 4)}
                      </span>
                    )}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      <div className="mt-4 text-xs text-slate-600 flex items-center gap-3 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded border-2 border-slate-900 opacity-55" style={{ background: "var(--card-soft, var(--card))" }} /> Free
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-4 h-4 rounded border-2 border-slate-900" style={{ background: currentSkin.busyColor }} /> Busy (no reason)
        </span>
      </div>
    </div>
  );
});

function ReasonChip({ selected, onClick, color, label, border, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`px-3 py-1.5 rounded-full text-sm font-bold border-2 transition ${
        selected ? "border-slate-900 ring-2 ring-slate-900/20 scale-105" : "border-slate-900/40 hover:border-slate-900"
      }`}
      style={{
        background: color,
        color: border ? "#0f172a" : "#fff",
      }}
    >
      {label}
    </button>
  );
}

export default AvailabilityEditor;
