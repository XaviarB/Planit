import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  getGroup,
  joinGroup,
  getLocalMemberId,
  setLocalMemberId,
  addVisitedGroup,
  renameMember,
  getGroupViewState,
  setGroupViewState,
} from "../lib/api";
import { dateRange, formatDateShort, currentWeekBounds } from "../lib/schedule";
import HeatmapGrid from "../components/HeatmapGrid";
import AvailabilityEditor from "../components/AvailabilityEditor";
import QuickStats from "../components/QuickStats";
import LegendEditor from "../components/LegendEditor";
import GroupMenu from "../components/GroupMenu";
import SuggestMeeting from "../components/SuggestMeeting";
import MembersSchedule from "../components/MembersSchedule";
import ShareMenu from "../components/ShareMenu";
import { Copy, Share2, Users, ArrowLeft, Plus, Edit3, Check, X, ChevronLeft, ChevronRight } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";

export default function GroupPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const [group, setGroup] = useState(null);
  const [memberId, setMemberId] = useState(getLocalMemberId(code));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial view state hydrated from localStorage (per-group).
  const persisted = getGroupViewState(code) || {};
  const [tab, setTab] = useState(persisted.tab || "dates"); // dates | members
  const [editMode, setEditMode] = useState(false);
  const [rangeStart, setRangeStart] = useState(persisted.rangeStart || isoToday());
  const [rangeEnd, setRangeEnd] = useState(persisted.rangeEnd || isoPlus(isoToday(), 6));
  const [hourFrom, setHourFrom] = useState(typeof persisted.hourFrom === "number" ? persisted.hourFrom : 0);
  const [hourTo, setHourTo] = useState(typeof persisted.hourTo === "number" ? persisted.hourTo : 23);
  const [minuteStep, setMinuteStep] = useState(persisted.minuteStep || 60); // 60 | 30 | 15
  const [focusMemberIds, setFocusMemberIds] = useState(persisted.focusMemberIds || []);
  // Week-offset for the Sync Our Orbits snapshot. 0 = this week, -1 = last, +1 = next.
  // Always starts at 0 on mount (does not persist — feels weird to land in a different week).
  const [weekOffset, setWeekOffset] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [joinOpen, setJoinOpen] = useState(false);
  const editorRef = useRef(null);
  const [savingExit, setSavingExit] = useState(false);

  // Persist view state changes to localStorage.
  useEffect(() => {
    setGroupViewState(code, {
      tab,
      rangeStart,
      rangeEnd,
      hourFrom,
      hourTo,
      minuteStep,
      focusMemberIds,
    });
  }, [code, tab, rangeStart, rangeEnd, hourFrom, hourTo, minuteStep, focusMemberIds]);

  // Refresh "now" once a minute so live-status bubbles stay accurate.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Track current theme so we can swap the heatmap palette.
  // Light mode → neon purple gradient (stored heat_colors, default = purple).
  // Dark  mode → neon blue gradient (always, even if user customized in light).
  const [isDark, setIsDark] = useState(() =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const target = document.documentElement;
    const obs = new MutationObserver(() => {
      setIsDark(target.classList.contains("dark"));
    });
    obs.observe(target, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  // Neon blue gradient — used for the dark-mode heatmap regardless of stored colors.
  const NEON_BLUE_PALETTE = ["#020617", "#1e40af", "#0ea5e9", "#22d3ee", "#cffafe"];
  const [joinName, setJoinName] = useState("");

  const refresh = useCallback(async () => {
    try {
      const g = await getGroup(code);
      setGroup(g);
      addVisitedGroup({ code: g.code, name: g.name });
      setError(null);
    } catch (e) {
      setError("Group not found");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // If no local member id, prompt to join
  useEffect(() => {
    if (!loading && group && !memberId) setJoinOpen(true);
  }, [loading, group, memberId]);

  const me = group?.members.find((m) => m.id === memberId);

  const onJoin = async (e) => {
    e.preventDefault();
    if (!joinName.trim()) return toast.error("Enter your name.");
    try {
      const res = await joinGroup(code, joinName.trim());
      setLocalMemberId(code, res.member_id);
      setMemberId(res.member_id);
      setJoinOpen(false);
      toast.success("You're in!");
      await refresh();
    } catch (err) {
      toast.error("Could not join.");
    }
  };

  const onCopyCode = () => {
    navigator.clipboard.writeText(code).then(() => toast.success("Code copied!"));
  };

  if (loading) return <div className="p-10 text-center" data-testid="group-loading">Loading group…</div>;
  if (error)
    return (
      <div className="p-10 text-center" data-testid="group-error">
        <div className="font-heading text-3xl font-black mb-3">Group not found</div>
        <button className="neo-btn" onClick={() => nav("/")}>Back home</button>
      </div>
    );

  const columns = dateRange(rangeStart, rangeEnd).map((iso) => ({
    key: iso,
    label: formatDateShort(iso),
  }));

  // Sync Our Orbits (heatmap, non-edit) is locked to a Mon→Sun week, full
  // 24-hour day, hourly precision. The user can scrub through past/future
  // weeks via the week navigator — that's the only thing that changes here.
  const week = currentWeekBounds(now, weekOffset);
  const heatmapColumns = dateRange(week.monday, week.sunday).map((iso) => ({
    key: iso,
    label: formatDateShort(iso),
  }));

  // Multi-select focus: 1 = single-member view, 2+ = compare-mode view.
  const focusedMembers = (group?.members || []).filter((m) =>
    focusMemberIds.includes(m.id)
  );
  const visibleMembers =
    focusedMembers.length > 0 ? focusedMembers : (group?.members || []);

  // Live "right now" status per member, based on real-time hour.
  const nowDateKey = (() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const nowTotalMin = nowHour * 60 + nowMinute;
  const liveStatus = {};
  for (const m of group?.members || []) {
    let entry = { status: "free", reason_id: null };
    for (const s of m.slots || []) {
      if (s.mode !== "date" || s.key !== nowDateKey || s.status !== "busy") continue;
      const sStart = s.hour * 60 + (s.minute || 0);
      const sEnd = sStart + (s.step || 60);
      if (nowTotalMin >= sStart && nowTotalMin < sEnd) {
        entry = { status: "busy", reason_id: s.reason_id || null };
        break;
      }
    }
    liveStatus[m.id] = entry;
  }
  const reasonMap = {};
  for (const r of group?.reasons || []) reasonMap[r.id] = r;

  const toggleFocus = (id) =>
    setFocusMemberIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    );

  // Done editing — saves the editor's current state then exits edit mode.
  const onDoneEditing = async () => {
    if (!editMode) {
      // Entering edit mode
      if (!memberId) return setJoinOpen(true);
      if (tab !== "dates") setTab("dates");
      setEditMode(true);
      return;
    }
    // Exiting — save first
    setSavingExit(true);
    try {
      if (editorRef.current && editorRef.current.save) {
        const res = await editorRef.current.save();
        if (!res || res.ok === false) return; // stay in edit mode on failure
      }
      setEditMode(false);
    } finally {
      setSavingExit(false);
    }
  };

  return (
    <div className="min-h-screen grain pb-24" data-testid="group-page">
      {/* Unified top bar — group name + back button line up with the tabs and action buttons. */}
      <header
        className="max-w-7xl mx-auto px-6 py-6 flex flex-wrap items-center gap-3"
        data-testid="topbar"
      >
        <button
          className="w-10 h-10 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-mint)] shrink-0"
          onClick={() => {
            toast.dismiss();
            nav("/");
          }}
          data-testid="back-home-btn"
          aria-label="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="shrink-0">
          <div className="label-caps" style={{ color: "var(--ink-mute)" }}>Group</div>
          <GroupMenu
            group={group}
            onRenamed={(name) => setGroup((g) => ({ ...g, name }))}
          />
        </div>

        {/* Spacer pushes tabs + action buttons to the right of the group name. */}
        <div className="flex-1 min-w-[16px]" />

        {/* Tabs + action buttons inline with the group title. */}
        <div className="flex items-center flex-wrap gap-2 ml-auto" data-testid="view-tabs">
          <TabBtn active={tab === "dates" && !editMode} onClick={() => { setTab("dates"); setEditMode(false); }} testId="tab-dates">
            Sync Our Orbits
          </TabBtn>
          <TabBtn active={tab === "members"} onClick={() => { setTab("members"); setEditMode(false); }} testId="tab-members">
            Members' schedule
          </TabBtn>
          {editMode && (
            <span
              className="px-3 py-2 rounded-full border-2 border-slate-900 text-sm font-bold font-heading bg-slate-900 text-white"
              data-testid="tab-editing"
            >
              Editing
            </span>
          )}
          <SuggestMeeting
            members={visibleMembers}
            columns={columns}
            mode="date"
            hourFrom={hourFrom}
            hourTo={hourTo}
            minuteStep={60}
            groupName={group.name}
            groupCode={group.code}
          />
          <button
            className={`neo-btn text-sm ${editMode ? "" : "ghost"}`}
            onClick={onDoneEditing}
            disabled={savingExit}
            data-testid="toggle-edit-btn"
          >
            {editMode ? (savingExit ? "Saving..." : "Done editing") : "Edit my availability"}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-6">
        {/* Sidebar — top of Members card aligns with top of the main scheduling grid. */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="neo-card p-5" data-testid="members-card">
            <div className="label-caps mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> Members ({group.members.length})
            </div>
            <ul className="space-y-2">
              {group.members.map((m) => (
                <MemberRow
                  key={m.id}
                  m={m}
                  isMe={m.id === memberId}
                  code={code}
                  isFocused={focusMemberIds.includes(m.id)}
                  liveStatus={liveStatus[m.id]}
                  reasonMap={reasonMap}
                  onToggleFocus={() => toggleFocus(m.id)}
                  onRenamed={(name) =>
                    setGroup((g) => ({
                      ...g,
                      members: g.members.map((x) => (x.id === m.id ? { ...x, name } : x)),
                    }))
                  }
                />
              ))}
            </ul>
            {focusMemberIds.length > 0 && (
              <button
                onClick={() => setFocusMemberIds([])}
                className="mt-3 w-full text-xs neo-btn ghost py-2"
                data-testid="focus-clear-btn"
              >
                Show all members
              </button>
            )}
            {focusMemberIds.length === 1 && group.members.length > 1 && (
              <p className="mt-2 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                Tap another member's bubble to compare.
              </p>
            )}
          </div>

          <QuickStats
            members={visibleMembers}
            columns={heatmapColumns}
            mode="date"
            hourFrom={0}
            hourTo={23}
            minuteStep={60}
            meId={memberId}
          />

          <LegendEditor
            code={code}
            colors={group.heat_colors || ["#0f0224", "#7b1fe3", "#c026d3", "#e879f9", "#fae8ff"]}
            onUpdated={(next) => setGroup((g) => ({ ...g, heat_colors: next }))}
          />

          <div className="neo-card p-4" data-testid="share-card">
            <div className="label-caps mb-3 flex items-center gap-2">
              <Share2 className="w-4 h-4" /> Invite friends
            </div>
            <div className="flex flex-col gap-2">
              <ShareMenu
                url={`${window.location.origin}/g/${code}`}
                groupName={group.name}
              />
              <button
                className="neo-btn ghost flex items-center justify-between gap-2 text-sm w-full"
                onClick={onCopyCode}
                data-testid="copy-code-btn"
              >
                <span className="label-caps">Code</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tracking-widest font-bold">{group.code}</span>
                  <Copy className="w-4 h-4" />
                </span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="lg:col-span-9 space-y-6">
          {/* Range controls — hidden on Sync Our Orbits (heatmap is a static
              7-day Mon→Sun snapshot).  Visible on Members' schedule + Editor. */}
          {!(tab === "dates" && !editMode) && (
            <div className="neo-card p-4 flex flex-wrap items-center gap-3" data-testid="range-controls">
              <div className="label-caps">Date range</div>
              <input
                type="date"
                className="neo-input"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                data-testid="range-start-input"
              />
              <span style={{ color: "var(--ink-mute)" }}>→</span>
              <input
                type="date"
                className="neo-input"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                data-testid="range-end-input"
              />
              <span className="text-sm" style={{ color: "var(--ink-mute)" }}>{columns.length} days</span>
              <span className="hidden md:inline-block w-px h-6 mx-1" style={{ background: "var(--ink)", opacity: 0.2 }} />
              <div className="label-caps">Hours</div>
              <select
                className="neo-input"
                value={hourFrom}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setHourFrom(v);
                  if (v > hourTo) setHourTo(v);
                }}
                data-testid="hour-from-select"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                ))}
              </select>
              <span style={{ color: "var(--ink-mute)" }}>→</span>
              <select
                className="neo-input"
                value={hourTo}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setHourTo(v);
                  if (v < hourFrom) setHourFrom(v);
                }}
                data-testid="hour-to-select"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
                ))}
              </select>
              <button
                className="neo-btn ghost text-xs"
                onClick={() => {
                  setHourFrom(0);
                  setHourTo(23);
                }}
                data-testid="hour-reset-btn"
              >
                All day
              </button>
            </div>
          )}

          {/* Sync Our Orbits — week-snapshot navigator with prev/next + slider. */}
          {tab === "dates" && !editMode && (
            <div
              className="neo-card p-3 sm:p-4 flex flex-wrap items-center gap-3"
              style={{ background: "var(--pastel-mint)" }}
              data-testid="weekly-snapshot-banner"
            >
              <span className="label-caps shrink-0">Week snapshot</span>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="w-8 h-8 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  data-testid="week-prev-btn"
                  aria-label="Previous week"
                  title="Previous week"
                >
                  <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                </button>
                <span
                  className="font-heading font-black text-sm sm:text-base whitespace-nowrap min-w-[140px] text-center"
                  data-testid="week-snapshot-label"
                >
                  {formatDateShort(week.monday)} → {formatDateShort(week.sunday)}
                </span>
                <button
                  type="button"
                  className="w-8 h-8 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  data-testid="week-next-btn"
                  aria-label="Next week"
                  title="Next week"
                >
                  <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
              </div>

              <input
                type="range"
                min={-12}
                max={12}
                step={1}
                value={weekOffset}
                onChange={(e) => setWeekOffset(Number(e.target.value))}
                className="week-slider flex-1 min-w-[120px]"
                data-testid="week-slider"
                aria-label="Scrub weeks"
                title={
                  weekOffset === 0
                    ? "This week"
                    : weekOffset < 0
                    ? `${-weekOffset} week${weekOffset === -1 ? "" : "s"} ago`
                    : `${weekOffset} week${weekOffset === 1 ? "" : "s"} ahead`
                }
              />

              <span
                className="text-[11px] font-bold uppercase tracking-wider shrink-0"
                style={{ color: "var(--ink-soft)" }}
                data-testid="week-offset-label"
              >
                {weekOffset === 0
                  ? "This week"
                  : weekOffset < 0
                  ? `${-weekOffset}w ago`
                  : `+${weekOffset}w`}
              </span>

              {weekOffset !== 0 && (
                <button
                  type="button"
                  className="neo-btn ghost text-xs"
                  onClick={() => setWeekOffset(0)}
                  data-testid="week-reset-btn"
                >
                  This week
                </button>
              )}
            </div>
          )}

          {/* Focus banner */}
          {focusedMembers.length > 0 && (
            <div
              className="neo-card p-3 flex items-center gap-3 flex-wrap"
              style={{ background: "var(--pastel-yellow)" }}
              data-testid="focus-banner"
            >
              <div className="flex -space-x-2 shrink-0">
                {focusedMembers.slice(0, 4).map((fm) => (
                  <span
                    key={fm.id}
                    className="w-5 h-5 rounded-full border-2 shrink-0"
                    style={{ borderColor: "var(--ink)", background: fm.color }}
                    title={fm.name}
                  />
                ))}
              </div>
              <span className="text-sm">
                {focusedMembers.length === 1 ? (
                  <>
                    Showing only{" "}
                    <span className="font-heading font-black">{focusedMembers[0].name}</span>'s schedule
                  </>
                ) : (
                  <>
                    Comparing{" "}
                    <span className="font-heading font-black">
                      {focusedMembers.map((fm) => fm.name).join(", ")}
                    </span>{" "}
                    — gold cells = all of them are free
                  </>
                )}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setFocusMemberIds([])}
                className="neo-btn ghost text-xs"
                data-testid="focus-banner-clear"
              >
                Clear filter
              </button>
            </div>
          )}

          {/* Content */}
          {tab === "members" ? (
            <MembersSchedule
              members={visibleMembers}
              reasons={group.reasons}
              columns={columns}
            />
          ) : editMode && me ? (
            <AvailabilityEditor
              ref={editorRef}
              code={code}
              me={me}
              reasons={group.reasons}
              columns={columns}
              mode="date"
              hourFrom={hourFrom}
              hourTo={hourTo}
              minuteStep={minuteStep}
              onMinuteStepChange={setMinuteStep}
              onReasonsChange={(next) =>
                setGroup((g) => ({ ...g, reasons: next }))
              }
              onSaved={(slots) => {
                setGroup((g) => ({
                  ...g,
                  members: g.members.map((m) => (m.id === me.id ? { ...m, slots } : m)),
                }));
              }}
            />
          ) : (
            <HeatmapGrid
              members={visibleMembers}
              reasons={group.reasons}
              columns={heatmapColumns}
              mode="date"
              hourFrom={0}
              hourTo={23}
              minuteStep={60}
              heatColors={isDark ? NEON_BLUE_PALETTE : group.heat_colors}
              focusMode={focusedMembers.length > 0}
              compareCount={focusedMembers.length}
            />
          )}
        </main>
      </div>

      {/* Join modal */}
      {joinOpen && (
        <div
          className="fixed inset-0 bg-slate-900/50 grid place-items-center p-4 z-50"
          data-testid="join-modal"
        >
          <form onSubmit={onJoin} className="neo-card p-6 max-w-sm w-full bg-white">
            <div className="label-caps mb-2">Join group</div>
            <h3 className="font-heading font-black text-2xl mb-1">{group.name}</h3>
            <p className="text-sm text-slate-600 mb-4">Pick a display name to show in the heatmap.</p>
            <input
              autoFocus
              className="neo-input w-full mb-4"
              placeholder="Your name"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              data-testid="join-modal-name-input"
            />
            <button type="submit" className="neo-btn w-full flex items-center justify-center gap-2" data-testid="join-modal-submit-btn">
              <Plus className="w-4 h-4" /> Join
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, children, onClick, testId }) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      className={`px-4 py-2 rounded-full border-2 border-slate-900 text-sm font-bold font-heading transition ${
        active ? "bg-slate-900 text-white" : "bg-white hover:bg-[var(--pastel-mint)]"
      }`}
    >
      {children}
    </button>
  );
}

function isoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function MemberRow({ m, isMe, code, isFocused, liveStatus, reasonMap, onToggleFocus, onRenamed }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(m.name);
  const [saving, setSaving] = useState(false);

  // Sync external name updates
  useEffect(() => setVal(m.name), [m.name]);

  const submit = async (e) => {
    e?.preventDefault?.();
    const next = val.trim();
    if (!next || next === m.name) {
      setEditing(false);
      setVal(m.name);
      return;
    }
    setSaving(true);
    try {
      await renameMember(code, m.id, next);
      onRenamed && onRenamed(next);
      toast.success("Name updated");
      setEditing(false);
    } catch {
      toast.error("Could not rename");
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <li
        className="flex items-center gap-2 text-sm"
        data-testid={`member-row-${m.id}`}
      >
        <span
          className="w-4 h-4 rounded-full border-2 border-slate-900 shrink-0"
          style={{ background: m.color }}
        />
        <form onSubmit={submit} className="flex-1 flex items-center gap-1">
          <input
            autoFocus
            className="neo-input flex-1 py-1 text-sm"
            value={val}
            maxLength={32}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                setVal(m.name);
              }
            }}
            data-testid={`member-rename-input-${m.id}`}
          />
          <button
            type="submit"
            disabled={saving}
            className="w-7 h-7 rounded-full border-2 grid place-items-center hover:scale-105"
            style={{ borderColor: "var(--ink)", background: "var(--pastel-mint)" }}
            data-testid={`member-rename-save-${m.id}`}
            aria-label="Save name"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setVal(m.name);
            }}
            className="w-7 h-7 rounded-full border-2 grid place-items-center hover:scale-105"
            style={{ borderColor: "var(--ink)", background: "var(--card)" }}
            data-testid={`member-rename-cancel-${m.id}`}
            aria-label="Cancel rename"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </form>
      </li>
    );
  }

  return (
    <li
      className="group/member"
      data-testid={`member-row-${m.id}`}
    >
      <button
        type="button"
        onClick={onToggleFocus}
        className="w-full flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 -mx-2 transition border-2"
        style={{
          background: isFocused ? "var(--pastel-mint)" : "transparent",
          borderColor: isFocused ? "var(--ink)" : "transparent",
        }}
        data-testid={`member-focus-${m.id}`}
        aria-pressed={isFocused}
        title={isFocused ? "Click to remove from filter" : `Filter to ${m.name}`}
      >
        <span
          className="w-4 h-4 rounded-full border-2 border-slate-900 shrink-0"
          style={{ background: m.color }}
        />
        <span className="font-medium flex-1 min-w-0 truncate text-left" data-testid={`member-name-${m.id}`}>
          {m.name}
        </span>

        {/* Live "right now" status bubble. Doubles as the focus toggle. */}
        <LiveStatusBubble
          memberId={m.id}
          liveStatus={liveStatus}
          reasonMap={reasonMap}
          isFocused={isFocused}
        />

        {isMe && (
          <>
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  setEditing(true);
                }
              }}
              className="opacity-0 group-hover/member:opacity-100 transition w-6 h-6 rounded-full grid place-items-center cursor-pointer"
              style={{ color: "var(--ink-soft)" }}
              data-testid={`member-rename-btn-${m.id}`}
              aria-label="Edit your name"
              title="Edit your name"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </span>
            <span className="label-caps text-[10px] bg-[var(--pastel-yellow)] px-2 py-0.5 rounded-full border border-slate-900">
              you
            </span>
          </>
        )}
      </button>
    </li>
  );
}

function LiveStatusBubble({ memberId, liveStatus, reasonMap, isFocused }) {
  const status = liveStatus || { status: "free", reason_id: null };
  const isBusy = status.status === "busy";
  const r = isBusy && status.reason_id ? reasonMap[status.reason_id] : null;
  const bg = isBusy ? (r ? r.color : "#E74C3C") : "var(--pastel-mint)";
  const fg = isBusy ? "#fff" : "var(--ink)";
  const label = isBusy ? (r ? r.label : "Busy") : "Free";
  return (
    <span
      className="inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full border-2 text-[10px] font-bold uppercase tracking-wider min-w-[88px]"
      style={{
        background: bg,
        color: fg,
        borderColor: "var(--ink)",
        boxShadow: isFocused ? "inset 0 0 0 2px var(--ink)" : "none",
      }}
      data-testid={`live-bubble-${memberId}`}
      title={isBusy ? `Currently busy${r ? " · " + r.label : ""}` : "Currently free"}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{
          background: isBusy ? "#fff" : "#16a34a",
          boxShadow: isBusy ? "none" : "0 0 0 2px rgba(22,163,74,0.25)",
        }}
      />
      <span className="truncate">{label}</span>
    </span>
  );
}
function isoPlus(iso, n) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
