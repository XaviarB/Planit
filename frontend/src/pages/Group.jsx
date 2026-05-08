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
import { copyToClipboard } from "../lib/clipboard";
import HeatmapGrid from "../components/HeatmapGrid";
import AvailabilityEditor from "../components/AvailabilityEditor";
import QuickStats from "../components/QuickStats";
import LegendEditor from "../components/LegendEditor";
import GroupMenu from "../components/GroupMenu";
import SuggestMeeting from "../components/SuggestMeeting";
import MembersSchedule from "../components/MembersSchedule";
import ShareMenu from "../components/ShareMenu";
import AstralDrawer from "../components/AstralDrawer";
import MyToolsDrawer from "../components/MyToolsDrawer";
import { HangoutsList } from "../components/Hangouts";
import { Copy, Share2, Users, ArrowLeft, Plus, Edit3, Check, X, ChevronLeft, ChevronRight, Sparkles, Wand2 } from "lucide-react";
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
  // Astral concierge drawer
  const [astralOpen, setAstralOpen] = useState(false);
  const [astralWindow, setAstralWindow] = useState("");
  // Schedule toolkit drawer (NL parser, templates, calendars)
  const [toolsOpen, setToolsOpen] = useState(false);

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

  // Inject per-group Open Graph meta tags into the document head so when
  // someone pastes the /g/{code} link in iMessage / Slack / Discord they
  // get a personalized unfurl card (group name + member count + invite code).
  // We replace the default sitewide og:image / og:title from public/index.html
  // and restore them when the page unmounts.
  useEffect(() => {
    if (!group?.code) return;
    const back = (import.meta.env.REACT_APP_BACKEND_URL || process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
    const ogImage = `${back}/api/og/${group.code}.png`;
    const ogTitle = `${group.name || "Planit"} — Planit`;
    const memberCount = (group.members || []).length;
    const ogDesc = `${memberCount} ${memberCount === 1 ? "person" : "people"} synced. Tap to drop your free time and see when the crew overlaps.`;
    const apply = (sel, attr, val) => {
      const tag = document.querySelector(sel);
      if (tag) tag.setAttribute(attr, val);
    };
    apply('meta[property="og:image"]', "content", ogImage);
    apply('meta[name="twitter:image"]', "content", ogImage);
    apply('meta[property="og:title"]', "content", ogTitle);
    apply('meta[name="twitter:title"]', "content", ogTitle);
    apply('meta[property="og:description"]', "content", ogDesc);
    apply('meta[name="twitter:description"]', "content", ogDesc);
    apply('meta[property="og:url"]', "content", typeof window !== "undefined" ? window.location.href : "");
    document.title = `${group.name || "Planit"} · Planit`;
    return () => {
      // Restore default sitewide meta when leaving the group page.
      apply('meta[property="og:image"]', "content", `${back}/api/og.png`);
      apply('meta[name="twitter:image"]', "content", `${back}/api/og.png`);
      apply('meta[property="og:title"]', "content", "Planit — sync the crew's free time");
      apply('meta[name="twitter:title"]', "content", "Planit — sync the crew's free time");
      document.title = "Planit";
    };
  }, [group?.code, group?.name, group?.members]);

  // Refresh "now" once a minute so live-status bubbles stay accurate.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
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

  const onCopyCode = async () => {
    const ok = await copyToClipboard(code);
    toast[ok ? "success" : "error"](
      ok ? "Code copied!" : "Couldn't copy — please copy the code manually."
    );
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
      {/* Two-row topbar.
          Row 1 — group identity on the left, the segmented view-tabs + theme toggle on the right.
          Row 2 — the four big action buttons stretched edge-to-edge across the page width. */}
      <header
        className="max-w-7xl mx-auto px-6 pt-6 pb-3"
        data-testid="topbar"
      >
        {/* Row 1 */}
        <div className="flex items-center gap-3 flex-wrap">
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
            <div className="flex items-center gap-2 flex-wrap">
              <GroupMenu
                group={group}
                onRenamed={(name) => setGroup((g) => ({ ...g, name }))}
                onRecurrenceChange={(kind) =>
                  setGroup((g) => ({ ...g, recurrence_kind: kind }))
                }
              />
              {group.recurrence_kind && group.recurrence_kind !== "none" && (
                <span
                  className="px-2 py-0.5 rounded-full border-2 border-slate-900 text-[0.55rem] uppercase tracking-wider font-bold font-heading bg-[var(--pastel-lavender)]"
                  data-testid="recurrence-badge"
                  title={`This is a ${group.recurrence_kind} recurring crew.`}
                >
                  ↻ {group.recurrence_kind}
                </span>
              )}
            </div>
          </div>

          {/* Spacer pushes the right cluster to the opposite edge. */}
          <div className="flex-1 min-w-[16px]" />

          {/* Right cluster — segmented view-tabs + (optional) Editing badge + theme toggle. */}
          <div className="flex items-center gap-2 sm:gap-3" data-testid="view-tabs">
            <div
              className="inline-flex border-2 border-slate-900 rounded-full overflow-hidden"
              style={{ boxShadow: "2px 2px 0 0 var(--ink)" }}
            >
              <button
                onClick={() => { setTab("dates"); setEditMode(false); }}
                data-testid="tab-dates"
                className={`px-3 py-1 text-[11px] font-bold font-heading transition leading-tight ${
                  tab === "dates" && !editMode
                    ? "bg-slate-900 text-white"
                    : "bg-white hover:bg-[var(--pastel-mint)]"
                }`}
              >
                {/* Shorter label on mobile, full on desktop. */}
                <span className="sm:hidden">Orbits</span>
                <span className="hidden sm:inline">Sync Our Orbits</span>
              </button>
              <button
                onClick={() => { setTab("members"); setEditMode(false); }}
                data-testid="tab-members"
                className={`px-3 py-1 text-[11px] font-bold font-heading transition leading-tight border-l-2 border-slate-900 ${
                  tab === "members"
                    ? "bg-slate-900 text-white"
                    : "bg-white hover:bg-[var(--pastel-mint)]"
                }`}
              >
                <span className="sm:hidden">Members</span>
                <span className="hidden sm:inline">Members' schedule</span>
              </button>
            </div>
            {editMode && (
              <span
                className="px-3 py-2 rounded-full border-2 border-slate-900 text-sm font-bold font-heading bg-slate-900 text-white"
                data-testid="tab-editing"
              >
                Editing
              </span>
            )}
            <ThemeToggle />
          </div>
        </div>

        {/* Row 2 — action buttons. On mobile (<sm) this becomes a 2x2 grid so
            the buttons stay tappable; on >= sm they stretch single-row. */}
        <div
          className="mt-4 grid grid-cols-2 sm:flex sm:items-stretch gap-2 sm:gap-3"
          data-testid="action-row"
        >
          <SuggestMeeting
            members={visibleMembers}
            columns={columns}
            mode="date"
            hourFrom={hourFrom}
            hourTo={hourTo}
            minuteStep={60}
            groupName={group.name}
            groupCode={group.code}
            wrapperClassName="relative flex-1"
            triggerClassName="neo-btn pastel w-full justify-center flex items-center gap-2 text-base font-heading font-extrabold"
          />
          <button
            type="button"
            className="astral-trigger flex-1 justify-center text-base"
            style={{ padding: "14px 22px" }}
            onClick={() => {
              setAstralWindow("");
              setAstralOpen(true);
            }}
            data-testid="open-astral-btn"
            title="Ask Astral — Planit's hangout concierge"
          >
            <Sparkles className="astral-spark" strokeWidth={2.5} />
            Ask Astral
          </button>
          <button
            type="button"
            className="astral-trigger flex-1 justify-center text-base"
            onClick={() => setToolsOpen(true)}
            data-testid="open-tools-btn"
            title="My toolkit — natural-language busy entry, templates, calendar sync"
            style={{
              padding: "14px 22px",
              background:
                "linear-gradient(100deg, var(--pastel-mint) 0%, var(--pastel-lavender) 100%)",
            }}
          >
            <Wand2 className="astral-spark" strokeWidth={2.5} />
            My Toolkit
          </button>
          <button
            className={`neo-btn flex-1 justify-center text-base ${editMode ? "" : "ghost"}`}
            style={{ padding: "14px 22px" }}
            onClick={onDoneEditing}
            disabled={savingExit}
            data-testid="toggle-edit-btn"
          >
            {editMode ? (savingExit ? "Saving..." : "Done editing") : "Edit my availability"}
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-6">
        {/* Sidebar — order: Quick stats → Invite friends → Heatmap legend → Members.
            Each card pops in 80ms after the previous one for a premium entrance. */}
        <aside className="lg:col-span-3 space-y-6">
          <div className="pop-in" style={{ animationDelay: "0ms" }}>
            <QuickStats
              members={visibleMembers}
              columns={heatmapColumns}
              mode="date"
              hourFrom={0}
              hourTo={23}
              minuteStep={60}
              meId={memberId}
            />
          </div>

          {/* Phase 4 — locked / tentative hangouts. Quietly hides itself when
              the group has nothing on the calendar. */}
          <div className="pop-in" style={{ animationDelay: "60ms" }}>
            <HangoutsList
              group={group}
              memberId={memberId}
              onChanged={(h) =>
                setGroup((prev) => (prev ? { ...prev, hangouts: h } : prev))
              }
            />
          </div>

          <div className="neo-card p-4 pop-in relative z-30" style={{ animationDelay: "80ms" }} data-testid="share-card">
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

          <div className="pop-in" style={{ animationDelay: "160ms" }}>
            <LegendEditor />
          </div>

          <div className="neo-card p-5 pop-in" style={{ animationDelay: "240ms" }} data-testid="members-card">
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
        </aside>

        {/* Main */}
        <main className="lg:col-span-9 space-y-6">
          {/* Range controls — minimalist chip presets. Custom inputs only
              appear when the user picks "Custom…" so the default state has
              just two compact rows of pills. Hidden on Sync Our Orbits. */}
          {!(tab === "dates" && !editMode) && (
            <RangeChipBar
              rangeStart={rangeStart}
              rangeEnd={rangeEnd}
              setRangeStart={setRangeStart}
              setRangeEnd={setRangeEnd}
              hourFrom={hourFrom}
              hourTo={hourTo}
              setHourFrom={setHourFrom}
              setHourTo={setHourTo}
              now={now}
              dayCount={columns.length}
            />
          )}

          {/* Sync Our Orbits — week-snapshot navigator with prev/next arrows.
              Layout (post-cleanup): label on the left, navigator + inline
              "This week" reset button on the right. The standalone
              weeks-ahead counter is gone — the date range itself is enough
              context. The reset button is rendered with visibility:hidden
              when offset === 0 so the layout doesn't reflow as users
              click around. */}
          {tab === "dates" && !editMode && (
            <div
              className="neo-card p-4 sm:p-5 flex flex-wrap items-center justify-center sm:justify-between gap-4"
              style={{ background: "var(--pastel-mint)" }}
              data-testid="weekly-snapshot-banner"
            >
              <span className="label-caps text-sm sm:text-base shrink-0">
                Week snapshot
              </span>

              <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                <button
                  type="button"
                  className="w-11 h-11 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  data-testid="week-prev-btn"
                  aria-label="Previous week"
                  title="Previous week"
                >
                  <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
                </button>
                <span
                  className="font-heading font-black text-xl sm:text-2xl whitespace-nowrap w-[220px] sm:w-[260px] text-center tracking-tight"
                  data-testid="week-snapshot-label"
                >
                  {formatDateShort(week.monday)} → {formatDateShort(week.sunday)}
                </span>
                <button
                  type="button"
                  className="neo-btn ghost text-sm whitespace-nowrap shrink-0"
                  onClick={() => setWeekOffset(0)}
                  data-testid="week-reset-btn"
                  aria-hidden={weekOffset === 0}
                  tabIndex={weekOffset === 0 ? -1 : 0}
                  style={{
                    visibility: weekOffset === 0 ? "hidden" : "visible",
                  }}
                  title="Jump back to this week"
                >
                  This week
                </button>
                <button
                  type="button"
                  className="w-11 h-11 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  data-testid="week-next-btn"
                  aria-label="Next week"
                  title="Next week"
                >
                  <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>
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
              heatColors={undefined}
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

      {/* Astral concierge drawer */}
      <AstralDrawer
        open={astralOpen}
        onClose={() => setAstralOpen(false)}
        group={group}
        memberId={memberId}
        suggestedWindow={astralWindow}
        onGroupUpdate={(g) => {
          setGroup((prev) => ({ ...prev, ...g }));
          // If a hangout was just created, refresh the group to pick it up.
          if (g?._hangoutsBumped) {
            (async () => {
              try {
                const fresh = await getGroup(code);
                setGroup(fresh);
              } catch {}
            })();
          }
        }}
      />

      {/* Schedule toolkit drawer (Astral NL parser, life templates, calendars) */}
      <MyToolsDrawer
        open={toolsOpen}
        onClose={() => setToolsOpen(false)}
        group={group}
        memberId={memberId}
        onMemberUpdate={async () => {
          // Pull fresh group state after any merge — slots / templates /
          // calendars may have changed server-side.
          try {
            const fresh = await getGroup(code);
            setGroup(fresh);
          } catch {}
        }}
      />
    </div>
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

// Hour presets used by the range chip bar.
const HOUR_PRESETS = [
  { id: "all",       label: "All day",   from: 0,  to: 23 },
  { id: "morning",   label: "Morning",   from: 6,  to: 11 },
  { id: "afternoon", label: "Afternoon", from: 12, to: 17 },
  { id: "evening",   label: "Evening",   from: 18, to: 23 },
];

function RangeChipBar({
  rangeStart,
  rangeEnd,
  setRangeStart,
  setRangeEnd,
  hourFrom,
  hourTo,
  setHourFrom,
  setHourTo,
  now,
  dayCount,
}) {
  // Compute date presets from the current `now` so they refresh daily.
  const today = (() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  })();
  const week = currentWeekBounds(now);
  const datePresets = [
    { id: "this-week", label: "This week",     start: week.monday,    end: week.sunday },
    { id: "next-7",    label: "Next 7 days",   start: today,          end: isoPlus(today, 6) },
    { id: "next-14",   label: "Next 14 days",  start: today,          end: isoPlus(today, 13) },
  ];
  const activeDate = datePresets.find((p) => p.start === rangeStart && p.end === rangeEnd);
  const activeHour = HOUR_PRESETS.find((p) => p.from === hourFrom && p.to === hourTo);

  const [showCustomDate, setShowCustomDate] = useState(!activeDate);
  const [showCustomHours, setShowCustomHours] = useState(!activeHour);

  const applyDate = (p) => {
    setRangeStart(p.start);
    setRangeEnd(p.end);
    setShowCustomDate(false);
  };
  const applyHour = (p) => {
    setHourFrom(p.from);
    setHourTo(p.to);
    setShowCustomHours(false);
  };

  return (
    <div className="neo-card p-4 sm:p-5" data-testid="range-controls">
      {/* Date presets */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="label-caps shrink-0 mr-1">When</span>
        {datePresets.map((p) => (
          <Chip
            key={p.id}
            active={!showCustomDate && activeDate?.id === p.id}
            onClick={() => applyDate(p)}
            testId={`date-preset-${p.id}`}
          >
            {p.label}
          </Chip>
        ))}
        <Chip
          active={showCustomDate || !activeDate}
          onClick={() => setShowCustomDate((v) => !v)}
          testId="date-preset-custom"
        >
          Custom…
        </Chip>
      </div>

      {/* Hour presets */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        <span className="label-caps shrink-0 mr-1">Hours</span>
        {HOUR_PRESETS.map((p) => (
          <Chip
            key={p.id}
            active={!showCustomHours && activeHour?.id === p.id}
            onClick={() => applyHour(p)}
            testId={`hour-preset-${p.id}`}
          >
            {p.label}
          </Chip>
        ))}
        <Chip
          active={showCustomHours || !activeHour}
          onClick={() => setShowCustomHours((v) => !v)}
          testId="hour-preset-custom"
        >
          Custom…
        </Chip>
      </div>

      {/* Custom date picker — only when the user explicitly toggles it. */}
      {showCustomDate && (
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t-2 border-dashed" style={{ borderColor: "var(--ink)", borderTopStyle: "dashed", opacity: 1 }}>
          <input
            type="date"
            className="neo-input text-sm"
            value={rangeStart}
            onChange={(e) => setRangeStart(e.target.value)}
            data-testid="range-start-input"
          />
          <span style={{ color: "var(--ink-mute)" }}>→</span>
          <input
            type="date"
            className="neo-input text-sm"
            value={rangeEnd}
            onChange={(e) => setRangeEnd(e.target.value)}
            data-testid="range-end-input"
          />
          <span className="text-xs" style={{ color: "var(--ink-mute)" }}>
            {dayCount} day{dayCount === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Custom hour picker. */}
      {showCustomHours && (
        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t-2 border-dashed" style={{ borderColor: "var(--ink)", borderTopStyle: "dashed" }}>
          <select
            className="neo-input text-sm"
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
            className="neo-input text-sm"
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
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="text-xs sm:text-sm font-bold rounded-full px-3 py-1.5 border-2 transition"
      style={{
        background: active ? "var(--ink)" : "var(--card)",
        color: active ? "var(--btn-fg)" : "var(--ink)",
        borderColor: "var(--ink)",
        boxShadow: active ? "2px 2px 0 0 var(--ink)" : "none",
      }}
    >
      {children}
    </button>
  );
}
