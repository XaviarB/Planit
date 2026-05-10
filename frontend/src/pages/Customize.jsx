import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Palette,
  Clock,
  User,
  Save,
  RefreshCw,
} from "lucide-react";
import {
  getGroup,
  getLocalMemberId,
  updateBranding,
  updateLocale,
  updateMemberPrefs,
} from "../lib/api";
import AstralBot from "../components/AstralBot";

/* -------------------------------------------------------------------------- */
/* Tiny atoms — kept inline to keep this page self-contained.                  */
/* -------------------------------------------------------------------------- */

const FIELD_LABEL =
  "label-caps text-[11px] tracking-widest mb-1.5 flex items-center gap-1.5";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <div className={FIELD_LABEL}>{label}</div>
      {children}
      {hint && (
        <div className="text-[11px] mt-1" style={{ color: "var(--ink-mute)" }}>
          {hint}
        </div>
      )}
    </label>
  );
}

function ColorInput({ value, onChange, ...rest }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value || "#0f172a"}
        onChange={(e) => onChange(e.target.value)}
        className="w-12 h-10 rounded-md border-2 border-slate-900 cursor-pointer bg-white"
        {...rest}
      />
      <input
        type="text"
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="neo-input flex-1 font-mono text-sm uppercase"
        placeholder="#0f172a"
      />
    </div>
  );
}

function Segmented({ value, onChange, options, testId }) {
  return (
    <div
      className="inline-flex rounded-full border-2 border-slate-900 overflow-hidden bg-white"
      data-testid={testId}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition ${
              isActive
                ? "bg-slate-900 text-white"
                : "bg-white hover:bg-[var(--pastel-mint)]"
            }`}
            data-testid={`${testId}-${opt.value}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({ label, hint, value, onChange, testId }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <div className="text-sm font-bold">{label}</div>
        {hint && (
          <div className="text-[11px]" style={{ color: "var(--ink-mute)" }}>
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full border-2 border-slate-900 transition ${
          value ? "bg-slate-900" : "bg-white"
        }`}
        data-testid={testId}
        aria-pressed={value}
      >
        <span
          className={`absolute top-0.5 ${value ? "left-[18px]" : "left-0.5"} w-4 h-4 rounded-full transition ${
            value ? "bg-white" : "bg-slate-900"
          }`}
        />
      </button>
    </div>
  );
}

function Section({ icon: Icon, title, subtitle, children, onSave, saving, testId }) {
  return (
    <section
      className="neo-card p-5 sm:p-6 mb-5 pop-in"
      data-testid={testId}
    >
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--pastel-mint)] border-2 border-slate-900 grid place-items-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-heading font-black text-xl leading-tight">{title}</h2>
            {subtitle && (
              <p className="text-sm leading-snug" style={{ color: "var(--ink-soft)" }}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {onSave && (
          <button
            onClick={onSave}
            disabled={!!saving}
            className="neo-btn flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto shrink-0"
            data-testid={`${testId}-save`}
          >
            {saving ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        )}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Theme variant presets — quick "click to apply" cards.                       */
/* -------------------------------------------------------------------------- */

const THEME_PRESETS = [
  {
    key: "default",
    label: "Default",
    accent_hex: "#0f172a",
    gradient_from: "#fef9e7",
    gradient_to: "#d1f2eb",
    swatch: ["#fef9e7", "#d1f2eb", "#0f172a"],
  },
  {
    key: "noir",
    label: "Noir",
    accent_hex: "#111827",
    gradient_from: "#1f2937",
    gradient_to: "#0f172a",
    swatch: ["#0f172a", "#1f2937", "#fbbf24"],
  },
  {
    key: "candy",
    label: "Candy",
    accent_hex: "#be185d",
    gradient_from: "#fce7f3",
    gradient_to: "#fbcfe8",
    swatch: ["#fce7f3", "#fbcfe8", "#be185d"],
  },
  {
    key: "forest",
    label: "Forest",
    accent_hex: "#14532d",
    gradient_from: "#dcfce7",
    gradient_to: "#bbf7d0",
    swatch: ["#dcfce7", "#bbf7d0", "#14532d"],
  },
  {
    key: "ocean",
    label: "Ocean",
    accent_hex: "#0c4a6e",
    gradient_from: "#e0f2fe",
    gradient_to: "#bae6fd",
    swatch: ["#e0f2fe", "#bae6fd", "#0c4a6e"],
  },
];

/* -------------------------------------------------------------------------- */
/* Main page                                                                   */
/* -------------------------------------------------------------------------- */

export default function CustomizePage() {
  const { code } = useParams();
  const nav = useNavigate();
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("branding"); // branding | schedule | personal

  const memberId = getLocalMemberId(code);

  /* Editable state — initialised from server payload, mutated locally, saved
     on demand per section. */
  const [branding, setBranding] = useState(null);
  const [locale, setLocale] = useState(null);
  const [prefs, setPrefs] = useState(null);

  const [savingBranding, setSavingBranding] = useState(false);
  const [savingLocale, setSavingLocale] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);

  /* Initial load */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const g = await getGroup(code);
        if (cancelled) return;
        setGroup(g);
        setBranding({ ...(g.branding || {}) });
        setLocale({ ...(g.locale || {}) });
        const me = (g.members || []).find((m) => m.id === memberId);
        setPrefs({ ...((me && me.prefs) || {}) });
      } catch (e) {
        toast.error("couldn't load group settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, memberId]);

  /* Save handlers */
  const onSaveBranding = async () => {
    setSavingBranding(true);
    try {
      const r = await updateBranding(code, branding);
      setBranding(r.branding);
      toast.success("branding saved");
    } catch (e) {
      toast.error("save failed");
    } finally {
      setSavingBranding(false);
    }
  };
  const onSaveLocale = async () => {
    setSavingLocale(true);
    try {
      const r = await updateLocale(code, locale);
      setLocale(r.locale);
      toast.success("schedule defaults saved");
    } catch (e) {
      toast.error("save failed");
    } finally {
      setSavingLocale(false);
    }
  };
  const onSavePrefs = async () => {
    if (!memberId) {
      toast.error("you need to join the group first");
      return;
    }
    setSavingPrefs(true);
    try {
      const r = await updateMemberPrefs(code, memberId, prefs);
      setPrefs(r.prefs);
      toast.success("personal prefs saved");
    } catch (e) {
      toast.error("save failed");
    } finally {
      setSavingPrefs(false);
    }
  };

  /* Theme variables for the live preview pane (mirrors what the Group page
     will render once branding is saved). */
  const previewStyle = useMemo(() => {
    if (!branding) return {};
    return {
      "--planit-accent": branding.accent_hex || "#0f172a",
      "--planit-grad-from": branding.gradient_from || "#fef9e7",
      "--planit-grad-to": branding.gradient_to || "#d1f2eb",
      background: `linear-gradient(135deg, ${branding.gradient_from} 0%, ${branding.gradient_to} 100%)`,
    };
  }, [branding]);

  if (loading || !group || !branding || !locale) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div
          className="text-sm font-bold tracking-widest uppercase animate-pulse"
          style={{ color: "var(--ink-soft)" }}
        >
          loading customization…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" data-testid="customize-page">
      {/* Topbar */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[var(--bg)]/80 border-b-2 border-slate-900/10">
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-3">
          <button
            onClick={() => nav(`/g/${code}`)}
            className="neo-btn ghost flex items-center gap-1.5"
            data-testid="customize-back"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">back to group</span>
          </button>
          <div className="flex-1 min-w-0">
            <div className="label-caps text-[10px] tracking-widest">
              customize
            </div>
            <div className="font-heading font-black text-lg sm:text-xl truncate">
              {group.name}
            </div>
          </div>
          <span
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-slate-900 text-[11px] font-bold uppercase tracking-wider"
            style={{ background: "var(--pastel-mint)" }}
          >
            anyone in group can edit
          </span>
        </div>

        {/* Tab pill — keeps every section reachable in one tap */}
        <div className="max-w-6xl mx-auto px-5 pb-3 flex justify-center">
          <div
            className="inline-flex rounded-full border-2 border-slate-900 overflow-hidden bg-white"
            data-testid="customize-tabs"
          >
            {[
              { value: "branding", label: "Branding", icon: Palette },
              { value: "schedule", label: "Schedule", icon: Clock },
              { value: "personal", label: "Personal", icon: User },
            ].map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTab(t.value)}
                  className={`px-3 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider transition flex items-center gap-1.5 ${
                    isActive
                      ? "bg-slate-900 text-white"
                      : "bg-white hover:bg-[var(--pastel-mint)]"
                  }`}
                  data-testid={`customize-tab-${t.value}`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      {/* Two-column layout: form (left) + live preview (right, sticky on desktop) */}
      <div className="max-w-6xl mx-auto px-5 mt-6 grid lg:grid-cols-12 gap-6">
        <main className="lg:col-span-8" data-testid="customize-main">
          {/* -------- BRANDING -------- */}
          {tab === "branding" && (
            <Section
              icon={Palette}
              title="Branding"
              subtitle="The accent, gradient, emoji and theme variant that re-skin the Group page for everyone."
              onSave={onSaveBranding}
              saving={savingBranding}
              testId="branding-section"
            >
              <Field label="Theme presets" hint="One-tap palette swap.">
                <div className="flex flex-wrap gap-2">
                  {THEME_PRESETS.map((p) => {
                    const active = branding.theme_variant === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() =>
                          setBranding({
                            ...branding,
                            theme_variant: p.key,
                            accent_hex: p.accent_hex,
                            gradient_from: p.gradient_from,
                            gradient_to: p.gradient_to,
                          })
                        }
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-slate-900 transition ${
                          active ? "ring-2 ring-amber-300" : "hover:scale-[1.02]"
                        }`}
                        data-testid={`branding-preset-${p.key}`}
                        title={p.label}
                      >
                        <div className="flex">
                          {p.swatch.map((c, i) => (
                            <span
                              key={i}
                              className="w-4 h-6 border border-slate-900 -ml-[1px] first:ml-0"
                              style={{ background: c }}
                            />
                          ))}
                        </div>
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {p.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Accent color">
                  <ColorInput
                    value={branding.accent_hex}
                    onChange={(v) =>
                      setBranding({ ...branding, accent_hex: v })
                    }
                    data-testid="branding-accent-input"
                  />
                </Field>
                <Field label="Group emoji" hint="Shown in the topbar.">
                  <input
                    type="text"
                    value={branding.emoji || ""}
                    onChange={(e) =>
                      setBranding({ ...branding, emoji: e.target.value })
                    }
                    className="neo-input w-full text-2xl text-center"
                    maxLength={4}
                    data-testid="branding-emoji-input"
                  />
                </Field>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Gradient · from">
                  <ColorInput
                    value={branding.gradient_from}
                    onChange={(v) =>
                      setBranding({ ...branding, gradient_from: v })
                    }
                    data-testid="branding-grad-from-input"
                  />
                </Field>
                <Field label="Gradient · to">
                  <ColorInput
                    value={branding.gradient_to}
                    onChange={(v) =>
                      setBranding({ ...branding, gradient_to: v })
                    }
                    data-testid="branding-grad-to-input"
                  />
                </Field>
              </div>

              <Field
                label="Default landing tab"
                hint="Which tab the group lands on when the page loads."
              >
                <Segmented
                  value={branding.default_view}
                  onChange={(v) =>
                    setBranding({ ...branding, default_view: v })
                  }
                  options={[
                    { value: "dates", label: "Sync Our Orbits" },
                    { value: "members", label: "Members" },
                  ]}
                  testId="branding-default-view"
                />
              </Field>
            </Section>
          )}

          {/* -------- SCHEDULE -------- */}
          {tab === "schedule" && (
            <Section
              icon={Clock}
              title="Schedule defaults"
              subtitle="Day window, slot precision, time format. These set the new-member defaults — every member can still scrub their own range."
              onSave={onSaveLocale}
              saving={savingLocale}
              testId="schedule-section"
            >
              <Field label="Time format">
                <Segmented
                  value={locale.time_format}
                  onChange={(v) =>
                    setLocale({ ...locale, time_format: v })
                  }
                  options={[
                    { value: "12h", label: "12h" },
                    { value: "24h", label: "24h" },
                  ]}
                  testId="schedule-time-format"
                />
              </Field>
              <Field label="Week starts on">
                <Segmented
                  value={locale.week_start}
                  onChange={(v) =>
                    setLocale({ ...locale, week_start: v })
                  }
                  options={[
                    { value: "mon", label: "Mon" },
                    { value: "sun", label: "Sun" },
                  ]}
                  testId="schedule-week-start"
                />
              </Field>
              <Field label="Slot precision (default)">
                <Segmented
                  value={locale.slot_minutes}
                  onChange={(v) =>
                    setLocale({ ...locale, slot_minutes: v })
                  }
                  options={[
                    { value: 60, label: "1 hr" },
                    { value: 30, label: "30 min" },
                    { value: 15, label: "15 min" },
                  ]}
                  testId="schedule-slot-minutes"
                />
              </Field>

              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Day starts (hour)" hint="0–23">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={locale.day_start_hour}
                    onChange={(e) =>
                      setLocale({
                        ...locale,
                        day_start_hour: Number(e.target.value),
                      })
                    }
                    className="neo-input w-full"
                    data-testid="schedule-day-start"
                  />
                </Field>
                <Field label="Day ends (hour)" hint="1–24">
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={locale.day_end_hour}
                    onChange={(e) =>
                      setLocale({
                        ...locale,
                        day_end_hour: Number(e.target.value),
                      })
                    }
                    className="neo-input w-full"
                    data-testid="schedule-day-end"
                  />
                </Field>
              </div>

              <Field
                label="Timezone"
                hint='IANA name, e.g. "America/New_York" or "Europe/London".'
              >
                <input
                  type="text"
                  value={locale.timezone}
                  onChange={(e) =>
                    setLocale({ ...locale, timezone: e.target.value })
                  }
                  className="neo-input w-full font-mono text-sm"
                  placeholder="UTC"
                  data-testid="schedule-timezone"
                />
              </Field>
            </Section>
          )}

          {/* -------- PERSONAL -------- */}
          {tab === "personal" && (
            <Section
              icon={User}
              title="Personal preferences"
              subtitle="Just for you on this device + member id. Saved to the server so they follow you across browsers."
              onSave={onSavePrefs}
              saving={savingPrefs}
              testId="personal-section"
            >
              {!memberId && (
                <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-xs">
                  Join the group first to save personal prefs to the server. Your
                  changes here will work locally but not sync across devices.
                </div>
              )}
              <Field label="Avatar color override (optional)">
                <ColorInput
                  value={prefs?.color_hex || ""}
                  onChange={(v) =>
                    setPrefs({ ...(prefs || {}), color_hex: v })
                  }
                  data-testid="personal-color"
                />
              </Field>
              <Field
                label="Floating Astral orb · default side"
                hint="Where the orb starts when the page loads. You can still drag it anywhere."
              >
                <Segmented
                  value={prefs?.fab_side || "right"}
                  onChange={(v) =>
                    setPrefs({ ...(prefs || {}), fab_side: v })
                  }
                  options={[
                    { value: "left", label: "Left" },
                    { value: "right", label: "Right" },
                    { value: "top", label: "Top" },
                    { value: "bottom", label: "Bottom" },
                  ]}
                  testId="personal-fab-side"
                />
              </Field>
              <Field label="Theme">
                <Segmented
                  value={prefs?.theme || "auto"}
                  onChange={(v) =>
                    setPrefs({ ...(prefs || {}), theme: v })
                  }
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                    { value: "auto", label: "Auto" },
                  ]}
                  testId="personal-theme"
                />
              </Field>
              <ToggleRow
                label="Compact layout"
                hint="Tighter spacing, smaller avatars."
                value={!!prefs?.compact}
                onChange={(v) =>
                  setPrefs({ ...(prefs || {}), compact: v })
                }
                testId="personal-compact"
              />
              <Field label="Hide panels">
                <div className="flex flex-wrap gap-2">
                  {[
                    { key: "stats", label: "Quick stats" },
                    { key: "hangouts", label: "Hangouts" },
                    { key: "share", label: "Invite friends" },
                  ].map((p) => {
                    const hidden = (prefs?.hidden_panels || []).includes(p.key);
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => {
                          const cur = new Set(prefs?.hidden_panels || []);
                          if (cur.has(p.key)) cur.delete(p.key);
                          else cur.add(p.key);
                          setPrefs({
                            ...(prefs || {}),
                            hidden_panels: Array.from(cur),
                          });
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider border-2 border-slate-900 transition ${
                          hidden
                            ? "bg-slate-900 text-white"
                            : "bg-white hover:bg-[var(--pastel-mint)]"
                        }`}
                        data-testid={`personal-hide-${p.key}`}
                      >
                        {hidden ? "✕ " : ""}
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </Section>
          )}
        </main>

        {/* Live preview rail — sticky on desktop */}
        <aside
          className="lg:col-span-4 lg:sticky lg:top-32 self-start"
          data-testid="customize-preview"
        >
          <div
            className="rounded-3xl border-2 border-slate-900 p-5 shadow-[6px_6px_0_0_rgba(15,23,42,1)]"
            style={previewStyle}
          >
            <div className="text-[10px] font-bold uppercase tracking-widest mb-3 opacity-70">
              live preview
            </div>

            {/* Mock topbar */}
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-12 h-12 rounded-xl border-2 border-slate-900 grid place-items-center text-2xl bg-white/70"
                style={{ background: branding.gradient_from }}
              >
                {branding.emoji || "🪐"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-widest opacity-70">
                  group
                </div>
                <div
                  className="font-heading font-black text-lg truncate"
                  style={{ color: branding.accent_hex }}
                >
                  {group.name}
                </div>
              </div>
            </div>

            {/* Sample card */}
            <div className="rounded-2xl border-2 border-slate-900 bg-white p-4 mb-3">
              <div
                className="text-[11px] font-bold uppercase tracking-widest mb-1"
                style={{ color: branding.accent_hex }}
              >
                astral's take
              </div>
              <div
                className="text-sm leading-relaxed"
                style={{ color: "#0f172a" }}
              >
                the place is buzzy, lights are low, everyone's pretending it's the weekend already.
              </div>
              <div className="flex items-center gap-1.5 mt-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <span
                    key={i}
                    className={`text-xs ${i <= 4 ? "" : "opacity-30"}`}
                    style={{ color: branding.accent_hex }}
                  >
                    ★
                  </span>
                ))}
              </div>
            </div>

            {/* Sample FAB */}
            <div className="flex items-center justify-end">
              <div
                className="w-14 h-14 rounded-full border-2 border-slate-900 grid place-items-center shadow-[3px_3px_0_0_rgba(15,23,42,1)]"
                style={{ background: branding.accent_hex }}
              >
                <AstralBot size={32} color="#fff" />
              </div>
            </div>
          </div>

          <p
            className="text-[11px] mt-3 px-2 leading-relaxed"
            style={{ color: "var(--ink-mute)" }}
          >
            Preview reflects unsaved changes. Hit <b>Save</b> on each section to
            apply for everyone.
          </p>
        </aside>
      </div>
    </div>
  );
}
