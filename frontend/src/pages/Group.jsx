import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
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
  claimMembership,
  listMyMemberships,
} from "../lib/api";
import { dateRange, formatDateShort, currentWeekBounds } from "../lib/schedule";
import { copyToClipboard } from "../lib/clipboard";
import HeatmapGrid from "../components/HeatmapGrid";
import AvailabilityEditor from "../components/AvailabilityEditor";
import QuickStats from "../components/QuickStats";
import LegendEditor from "../components/LegendEditor";
import GroupMenu from "../components/GroupMenu";
import MembersSchedule from "../components/MembersSchedule";
import ShareMenu from "../components/ShareMenu";
import { HangoutsList } from "../components/Hangouts";
import { Copy, Share2, Users, ArrowLeft, Plus, Edit3, Check, X, ChevronLeft, ChevronRight, Settings, Sparkles, MapPin, Smartphone, MessageSquare, UserPlus } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import BottomTabBar from "../components/BottomTabBar";
import AstralHub from "../components/AstralHub";
import SuggestMeeting from "../components/SuggestMeeting";
import FloatingLauncher from "../components/FloatingLauncher";
import LayoutToggle, { getLayoutMode } from "../components/LayoutToggle";
import FeedbackModal from "../components/FeedbackModal";

/**
 * useIsDesktop — viewport breakpoint hook with manual-override support.
 * The Group page renders TWO completely different layouts:
 *   - desktop (>=1024px): the original 12-col grid + sidebar + FAB launcher
 *   - mobile  (<1024px) : the new native-app stack with bottom tab bar
 *
 * We watch matchMedia so the UI re-flows live as the user resizes, *and* we
 * watch the LayoutToggle override (localStorage `planit:layout-mode`) so the
 * user can force "Mobile" or "Desktop" while keeping the actual window size.
 * "Auto" mode (the default) falls back to the matchMedia breakpoint.
 *
 * Defaults to `true` server/SSR so first paint on desktop avoids a flash
 * of the mobile shell.
 */
function useIsDesktop(query = "(min-width: 1024px)") {
  const getAuto = () => {
    if (typeof window === "undefined" || !window.matchMedia) return true;
    return window.matchMedia(query).matches;
  };
  const resolve = (autoVal, mode) => {
    if (mode === "mobile") return false;
    if (mode === "desktop") return true;
    return autoVal;
  };
  const [isDesktop, setIsDesktop] = useState(() => resolve(getAuto(), getLayoutMode()));

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const recompute = () => setIsDesktop(resolve(mq.matches, getLayoutMode()));
    const onMq = () => recompute();
    if (mq.addEventListener) mq.addEventListener("change", onMq);
    else mq.addListener(onMq);
    // Listen for manual overrides (same tab + cross tab).
    window.addEventListener("planit:layout-mode-change", recompute);
    window.addEventListener("storage", recompute);
    recompute();
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onMq);
      else mq.removeListener(onMq);
      window.removeEventListener("planit:layout-mode-change", recompute);
      window.removeEventListener("storage", recompute);
    };
  }, [query]);
  return isDesktop;
}

export default function GroupPage() {
  const { code } = useParams();
  const nav = useNavigate();
  const [group, setGroup] = useState(null);
  const [memberId, setMemberId] = useState(getLocalMemberId(code));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initial view state hydrated from localStorage (per-group).
  const persisted = getGroupViewState(code) || {};
  // mainTab = which mobile bottom-tab is active (plan / crew / settings)
  // Migrate stale persisted values:
  //   - "hangouts" → "settings" (tab merged into Settings)
  //   - "more"     → "settings" (tab renamed)
  const [mainTab, setMainTab] = useState(() => {
    const v = persisted.mainTab;
    if (v === "hangouts" || v === "more") return "settings";
    return v || "plan";
  });
  const [tab, setTab] = useState(persisted.tab || "dates"); // dates | members (sub-tab inside Plan)
  const [editMode, setEditMode] = useState(false);
  const [astralOpen, setAstralOpen] = useState(false); // controls AstralHub on mobile
  const [suggestOpen, setSuggestOpen] = useState(false); // controls SuggestMeeting modal on mobile
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const isDesktop = useIsDesktop(); // ≥1024px → render the original horizontal layout
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
      mainTab,
      tab,
      rangeStart,
      rangeEnd,
      hourFrom,
      hourTo,
      minuteStep,
      focusMemberIds,
    });
  }, [code, mainTab, tab, rangeStart, rangeEnd, hourFrom, hourTo, minuteStep, focusMemberIds]);

  // Global keyboard shortcuts — Cmd/Ctrl+K and "/" open Astral from anywhere.
  // Esc closes the hub if open. Ignored while typing in inputs.
  // Mobile-only: on desktop the FloatingLauncher hosts its own identical handler,
  // so we register here exclusively when the bottom tab bar is active.
  useEffect(() => {
    if (isDesktop) return undefined;
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setAstralOpen((v) => !v);
        return;
      }
      if (e.key === "/" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setAstralOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop]);

  // Phase-5: when the group payload arrives, fold its customization into the
  // page state — but ONLY if the user has no per-group persisted preference
  // for that key yet (so once a member scrubs to a custom range / precision
  // / tab, we never overwrite their choice on a re-fetch).
  const appliedDefaultsRef = useRef(false);
  useEffect(() => {
    if (!group || appliedDefaultsRef.current) return;
    appliedDefaultsRef.current = true;
    const p = getGroupViewState(code) || {};
    if (!p.tab && group.branding?.default_view) {
      setTab(group.branding.default_view);
    }
    if (typeof p.minuteStep !== "number" && group.locale?.slot_minutes) {
      setMinuteStep(group.locale.slot_minutes);
    }
    if (
      typeof p.hourFrom !== "number" &&
      typeof group.locale?.day_start_hour === "number"
    ) {
      setHourFrom(group.locale.day_start_hour);
    }
    if (
      typeof p.hourTo !== "number" &&
      typeof group.locale?.day_end_hour === "number"
    ) {
      setHourTo(group.locale.day_end_hour);
    }
  }, [group, code]);

  // Wrapper style — applies the group's branded gradient + accent as CSS
  // variables scoped to just this page (Group page only re-skins; Landing
  // intentionally stays canonical Planit).
  const groupBrandingStyle = (() => {
    const b = group?.branding;
    if (!b) return undefined;
    return {
      "--planit-accent": b.accent_hex || "#0f172a",
      "--planit-grad-from": b.gradient_from || "#fef9e7",
      "--planit-grad-to": b.gradient_to || "#d1f2eb",
      backgroundImage: `linear-gradient(180deg, ${b.gradient_from || "#fef9e7"}33 0%, ${b.gradient_to || "#d1f2eb"}33 320px, transparent 600px)`,
    };
  })();

  // Phase-5 personal prefs — drives hidden_panels gating below.
  const myPrefs = (() => {
    const me = (group?.members || []).find((m) => m.id === memberId);
    return me?.prefs || {};
  })();
  const hiddenPanels = new Set(myPrefs.hidden_panels || []);

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

  // ---------- Cross-group schedule sync ----------
  // Two members across two different groups sharing the same browser
  // `user_token` are treated as the same person server-side, so their
  // slots are kept in lock-step. On every group page load we:
  //   1. Stamp the local token onto `me` if it isn't already (handles
  //      pre-existing members that joined before sync existed).
  //   2. Refresh how many crews this user appears in, so the editor can
  //      surface a "Synced across N groups" badge.
  const [memberships, setMemberships] = useState({ count: 0, list: [] });
  useEffect(() => {
    let cancelled = false;
    async function syncIdentity() {
      if (!group?.code || !me) return;
      try {
        if (!me.user_token) {
          await claimMembership(group.code, me.id);
        }
        const res = await listMyMemberships();
        if (!cancelled) {
          setMemberships({
            count: res?.count || 0,
            list: res?.memberships || [],
          });
        }
      } catch {
        // Non-fatal — sync is a nice-to-have, never block UI.
      }
    }
    syncIdentity();
    return () => {
      cancelled = true;
    };
  }, [group?.code, me?.id, me?.user_token]);

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

  // When the group is set to a recurring schedule, we drop calendar dates
  // entirely and use generic weekday columns (Mon..Sun). Slots are stored
  // against keys "d0".."d6" with mode "weekly" — handled natively by the
  // editor + heatmap components and by the schedule.js helpers.
  const isRecurring = !!group?.recurrence_kind && group.recurrence_kind !== "none";
  const gridMode = isRecurring ? "weekly" : "date";
  const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklyColumns = WEEKDAY_LABELS.map((label, i) => ({
    key: `d${i}`,
    label,
  }));

  const columns = isRecurring
    ? weeklyColumns
    : dateRange(rangeStart, rangeEnd).map((iso) => ({
        key: iso,
        label: formatDateShort(iso),
      }));

  // Mobile editor variant — rotate the columns so Monday is first. Date-mode
  // ranges that begin mid-week (e.g. "Sun → Sat") would otherwise read as a
  // Sun-first calendar in the editor; this nudges them to the European
  // Mon-first convention without changing the underlying date set.
  // Weekly mode already starts on d0 = Monday so it's a no-op.
  const editorColumnsMobile = (() => {
    if (!columns.length) return columns;
    if (isRecurring) return columns; // already Mon-first
    const idx = columns.findIndex((c) => {
      const d = new Date(c.key + "T00:00:00");
      return !Number.isNaN(d.getTime()) && d.getDay() === 1; // 1 = Mon
    });
    if (idx <= 0) return columns;
    return [...columns.slice(idx), ...columns.slice(0, idx)];
  })();

  // Sync Our Orbits (heatmap, non-edit) is locked to a Mon→Sun week, full
  // 24-hour day, hourly precision. The user can scrub through past/future
  // weeks via the week navigator — that's the only thing that changes here.
  // For recurring groups the heatmap also renders weekday columns directly.
  const week = currentWeekBounds(now, weekOffset);
  const heatmapColumns = isRecurring
    ? weeklyColumns
    : dateRange(week.monday, week.sunday).map((iso) => ({
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

  if (isDesktop) return (
    <div
      className="min-h-screen grain pb-24"
      data-testid="group-page"
      style={groupBrandingStyle}
    >
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
              {group.branding?.emoji && (
                <span
                  className="w-9 h-9 rounded-xl border-2 border-slate-900 grid place-items-center text-xl shrink-0"
                  style={{
                    background:
                      group.branding?.gradient_from || "var(--pastel-mint)",
                  }}
                  data-testid="group-emoji-chip"
                  title="group emoji"
                >
                  {group.branding.emoji}
                </span>
              )}
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
              {/* Feedback button — sits inline with GroupMenu + recurrence
                  badge so it's always accessible from the page chrome,
                  regardless of layout (desktop vs mobile vs sub-tab). */}
              <button
                type="button"
                onClick={() => setFeedbackOpen(true)}
                title="Send feedback"
                aria-label="Send feedback"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 border-slate-900 bg-[var(--pastel-mint)] text-xs font-bold font-heading uppercase tracking-wider hover:translate-y-[-1px] active:translate-y-0 active:shadow-none shadow-[2px_2px_0_0_rgba(15,23,42,1)] transition shrink-0"
                data-testid="feedback-open-btn"
                style={{ color: "var(--ink)" }}
              >
                <MessageSquare className="w-3.5 h-3.5" strokeWidth={2.5} />
                <span className="hidden sm:inline">Feedback</span>
              </button>
            </div>
          </div>

          {/* Spacer pushes the right cluster to the opposite edge. */}
          <div className="flex-1 min-w-[16px]" />

          {/* Right cluster — Layout preview toggle + (optional) Editing badge + theme toggle. */}
          <div className="flex items-center gap-2 sm:gap-3">
            <LayoutToggle variant="compact" className="hidden md:inline-flex" />
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

        {/* Row 2 (action tabs) was moved into the main column so it spans
            only the heatmap width, not the entire page (Quick Stats stays
            uncovered on the left). See the action-row block below. */}
      </header>

      <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-12 gap-6">
        {/* Sidebar — order: Quick stats → Hangouts → Members → Heatmap legend → Invite friends.
            Members lifted above the legend, then "Invite friends" moved all the way to the
            bottom so the rail terminates with the share/code action.
            Each card pops in 80ms after the previous one for a premium entrance. */}
        <aside className="lg:col-span-3 space-y-6">
          {!hiddenPanels.has("stats") && (
            <div className="pop-in" style={{ animationDelay: "0ms" }}>
              <QuickStats
                members={visibleMembers}
                columns={heatmapColumns}
                mode={gridMode}
                hourFrom={0}
                hourTo={23}
                minuteStep={60}
                meId={memberId}
              />
            </div>
          )}

          {/* Phase 4 — locked / tentative hangouts. Quietly hides itself when
              the group has nothing on the calendar. */}
          {!hiddenPanels.has("hangouts") && (
            <div className="pop-in" style={{ animationDelay: "60ms" }}>
              <HangoutsList
                group={group}
                memberId={memberId}
                onChanged={(h) =>
                  setGroup((prev) => (prev ? { ...prev, hangouts: h } : prev))
                }
              />
            </div>
          )}

          <div className="pop-in" style={{ animationDelay: "120ms" }} data-testid="members-card-wrap">
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
          </div>

          <div className="pop-in" style={{ animationDelay: "180ms" }}>
            <LegendEditor />
          </div>

          {/* Invite friends — anchored at the bottom of the sidebar so the rail
              terminates with a clear "share this group" action. The relative
              z-index keeps the ShareMenu popover above heatmap cells. */}
          {!hiddenPanels.has("share") && (
            <div className="neo-card p-4 pop-in relative z-30" style={{ animationDelay: "240ms" }} data-testid="share-card">
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
          )}
        </aside>

        {/* Main */}
        <main className="lg:col-span-9 space-y-6">
          {/* Action-row tabs sit inside the main column so they only span
              the heatmap width — Quick Stats on the left stays clean. */}
          <div
            className="grid grid-cols-3 sm:flex sm:items-stretch gap-2 sm:gap-3"
            data-testid="action-row"
          >
            <button
              onClick={() => { setTab("dates"); setEditMode(false); }}
              data-testid="tab-dates"
              className={`neo-btn flex-1 justify-center font-heading font-extrabold px-3 py-3 sm:px-5 sm:py-3.5 text-sm sm:text-base ${
                tab === "dates" && !editMode ? "" : "ghost"
              }`}
            >
              <span className="sm:hidden">Orbits</span>
              <span className="hidden sm:inline">Sync Our Orbits</span>
            </button>
            <button
              className={`neo-btn flex-1 justify-center px-3 py-3 sm:px-5 sm:py-3.5 text-sm sm:text-base ${editMode ? "" : "ghost"}`}
              onClick={onDoneEditing}
              disabled={savingExit}
              data-testid="toggle-edit-btn"
            >
              <span className="sm:hidden">{editMode ? (savingExit ? "Saving..." : "Done") : "Schedule"}</span>
              <span className="hidden sm:inline">{editMode ? (savingExit ? "Saving..." : "Done editing") : "Make My Schedule"}</span>
            </button>
            <button
              onClick={() => { setTab("members"); setEditMode(false); }}
              data-testid="tab-members"
              className={`neo-btn flex-1 justify-center font-heading font-extrabold px-3 py-3 sm:px-5 sm:py-3.5 text-sm sm:text-base ${
                tab === "members" ? "" : "ghost"
              }`}
            >
              <span className="sm:hidden">Members</span>
              <span className="hidden sm:inline">Members' schedule</span>
            </button>
          </div>

          {/* Range controls — minimalist chip presets. Custom inputs only
              appear when the user picks "Custom…" so the default state has
              just two compact rows of pills. Hidden on Sync Our Orbits.
              Also hidden in recurring mode — there are no calendar dates to range over. */}
          {!(tab === "dates" && !editMode) && !isRecurring && (
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

          {/* Sync Our Orbits — week-snapshot navigator (only meaningful for
              date-bound groups; recurring groups always show a weekday grid). */}
          {tab === "dates" && !editMode && !isRecurring && (
            <div
              className="neo-card p-4 sm:p-5 flex items-center justify-between gap-3 flex-nowrap"
              style={{ background: "var(--pastel-mint)" }}
              data-testid="weekly-snapshot-banner"
            >
              <span className="label-caps text-sm sm:text-base shrink-0">
                Week snapshot
              </span>

              {/* Arrows hug the week label tightly on both sides. */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  className="w-11 h-11 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition shrink-0"
                  onClick={() => setWeekOffset((o) => o - 1)}
                  data-testid="week-prev-btn"
                  aria-label="Previous week"
                  title="Previous week"
                >
                  <ChevronLeft className="w-5 h-5" strokeWidth={2.5} />
                </button>
                <span
                  className="font-heading font-black text-lg sm:text-2xl whitespace-nowrap text-center tracking-tight px-2"
                  data-testid="week-snapshot-label"
                >
                  {formatDateShort(week.monday)} → {formatDateShort(week.sunday)}
                </span>
                <button
                  type="button"
                  className="w-11 h-11 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition shrink-0"
                  onClick={() => setWeekOffset((o) => o + 1)}
                  data-testid="week-next-btn"
                  aria-label="Next week"
                  title="Next week"
                >
                  <ChevronRight className="w-5 h-5" strokeWidth={2.5} />
                </button>
              </div>

              {/* "This week" reset lives at the far end so the arrows stay
                  glued to the week label. Placeholder keeps the layout
                  balanced when the user is already on the current week. */}
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
            <div className="space-y-4">
              {/* Solo-member nudge — when you're the only one in the group,
                  the Members' schedule view is otherwise pretty empty. Drop
                  in a Bring Your Crew card with share controls so onboarding
                  doesn't dead-end on a single bare row. Disappears the moment
                  anyone else joins. */}
              {group.members.length === 1 && (
                <div
                  className="neo-card p-5"
                  style={{ background: "var(--pastel-peach)" }}
                  data-testid="members-invite-card"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl border-2 border-slate-900 grid place-items-center shrink-0"
                      style={{ background: "var(--pastel-mint)" }}
                      aria-hidden="true"
                    >
                      <UserPlus className="w-5 h-5" strokeWidth={2.5} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-heading font-black text-base leading-tight">
                        Bring your crew
                      </div>
                      <div
                        className="text-xs mt-0.5"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        Planit shines once at least 2 people log busy times.
                        Share your group code or link below to get started.
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1 min-w-0">
                      <ShareMenu
                        url={`${window.location.origin}/g/${code}`}
                        groupName={group.name}
                      />
                    </div>
                    <button
                      className="neo-btn ghost flex items-center justify-between gap-2 text-sm sm:w-auto w-full"
                      onClick={onCopyCode}
                      data-testid="members-invite-copy-code-btn"
                    >
                      <span className="label-caps">Code</span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono tracking-widest font-bold">
                          {group.code}
                        </span>
                        <Copy className="w-4 h-4" />
                      </span>
                    </button>
                  </div>
                </div>
              )}
              <MembersSchedule
                members={visibleMembers}
                reasons={group.reasons}
                columns={columns}
              />
            </div>
          ) : editMode && me ? (
            <AvailabilityEditor
              ref={editorRef}
              code={code}
              me={me}
              reasons={group.reasons}
              columns={columns}
              mode={gridMode}
              hourFrom={isRecurring ? 0 : hourFrom}
              hourTo={isRecurring ? 23 : hourTo}
              minuteStep={minuteStep}
              onMinuteStepChange={setMinuteStep}
              syncedGroupCount={memberships.count}
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
              mode={gridMode}
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

      {/* Astral + Toolkit live in a draggable floating launcher reachable
          from any scroll position on the page. */}
      <FloatingLauncher
        group={group}
        memberId={memberId}
        code={code}
        defaultSide={
          (group.members || []).find((m) => m.id === memberId)?.prefs
            ?.fab_side
        }
        onGroupRefresh={(updater) => {
          if (typeof updater === "function") {
            setGroup((prev) => updater(prev));
          } else if (updater) {
            setGroup(updater);
          }
        }}
        suggestMeetingProps={{
          members: visibleMembers,
          columns,
          mode: gridMode,
          hourFrom,
          hourTo,
          minuteStep: 60,
          groupName: group.name,
          groupCode: group.code,
        }}
      />
    </div>
  );

  return (
    <div
      className="grain"
      data-testid="group-page"
      style={groupBrandingStyle}
    >
      <div className="app-shell with-tabbar-pad">
        {/* Mobile App Bar — sticky, glassy, hosts back / title / theme. */}
        <header
          className="mobile-appbar px-3 pt-3 pb-3 flex items-center gap-2"
          data-testid="topbar"
        >
          <button
            className="w-10 h-10 rounded-2xl border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-mint)] shrink-0 transition"
            onClick={() => {
              toast.dismiss();
              nav("/");
            }}
            data-testid="back-home-btn"
            aria-label="Back"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={2.5} />
          </button>

          <div className="flex-1 min-w-0 px-1 text-center">
            <button
              type="button"
              onClick={onCopyCode}
              title="Tap to copy group code"
              aria-label={`Group code ${group.code}, tap to copy`}
              className="text-[9px] uppercase tracking-widest font-extrabold gradient-text leading-none inline-flex items-center gap-1 mx-auto hover:opacity-80 transition cursor-pointer"
              style={{ fontFamily: "Outfit, system-ui, sans-serif" }}
              data-testid="mobile-code-copy-btn"
            >
              <span>Code · {group.code}</span>
              <Copy className="w-2.5 h-2.5" strokeWidth={2.5} />
            </button>
            <div
              className="font-heading font-black text-base leading-tight truncate flex items-center gap-1.5 justify-center mt-0.5"
              data-testid="group-title"
            >
              {group.branding?.emoji && (
                <span className="text-lg shrink-0" aria-hidden="true">
                  {group.branding.emoji}
                </span>
              )}
              <span className="truncate">{group.name}</span>
            </div>
            {group.recurrence_kind && group.recurrence_kind !== "none" && (
              <div className="mt-1">
                <span
                  className="px-2 py-0.5 rounded-full border-2 border-slate-900 text-[0.55rem] uppercase tracking-wider font-bold font-heading bg-[var(--pastel-lavender)]"
                  data-testid="recurrence-badge"
                  title={`This is a ${group.recurrence_kind} recurring crew.`}
                >
                  ↻ {group.recurrence_kind}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {editMode && (
              <span
                className="px-2 py-1 rounded-full border-2 border-slate-900 text-[10px] font-bold font-heading bg-slate-900 text-white"
                data-testid="tab-editing"
              >
                Editing
              </span>
            )}
            <button
              type="button"
              onClick={() => setFeedbackOpen(true)}
              title="Send feedback"
              aria-label="Send feedback"
              className="w-10 h-10 rounded-2xl border-2 border-slate-900 grid place-items-center hover:translate-y-[-1px] active:translate-y-0 active:shadow-none shadow-[2px_2px_0_0_rgba(15,23,42,1)] transition shrink-0"
              style={{ background: "var(--pastel-mint)", color: "var(--ink)" }}
              data-testid="feedback-open-btn-mobile"
            >
              <MessageSquare className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <ThemeToggle />
          </div>
        </header>

        {/* ─── TAB CONTENT ───
            Re-keyed by `mainTab` AND `editMode` so React remounts the subtree
            on each tab swap (slide-from-right) and on edit-mode entrance
            (slide-from-below — feels like an editing layer over Plan). */}
        <main
          className={`px-4 py-4 space-y-4 flex-1 min-h-0 flex flex-col ${editMode ? "tab-content-anim--up" : "tab-content-anim"}`}
          key={`tab-${mainTab}-${editMode ? "edit" : "view"}`}
        >
          {/* PLAN TAB — heatmap, edit availability, sub-tab segmented */}
          {mainTab === "plan" && (
            <div className="space-y-4 flex-1 min-h-0 flex flex-col">
              {/* Sub-tab segmented (Sync orbits | Crew schedule) — only when not editing */}
              {!editMode && (
                <div
                  className="grid grid-cols-2 gap-2"
                  data-testid="action-row"
                >
                  <button
                    onClick={() => { setTab("dates"); setEditMode(false); }}
                    data-testid="tab-dates"
                    className={`neo-btn justify-center text-sm py-3 ${
                      tab === "dates" ? "" : "ghost"
                    }`}
                  >
                    Sync orbits
                  </button>
                  <button
                    onClick={() => { setTab("members"); setEditMode(false); }}
                    data-testid="tab-members"
                    className={`neo-btn justify-center text-sm py-3 ${
                      tab === "members" ? "" : "ghost"
                    }`}
                  >
                    Crew schedule
                  </button>
                </div>
              )}

              {/* "Make my schedule" lives in the bottom tab bar now (Schedule tab),
                  so it isn't repeated here. While editing we still surface a
                  Done editing CTA so the user can save without hunting for it. */}
              {editMode && (
                <button
                  className="neo-btn w-full flex items-center justify-center gap-2 py-3.5 text-base"
                  onClick={onDoneEditing}
                  disabled={savingExit}
                  data-testid="toggle-edit-btn"
                >
                  <Edit3 className="w-4 h-4" />
                  {savingExit ? "Saving..." : "Done editing"}
                </button>
              )}

              {/* Range / hour controls — appear in members or edit modes (not in Sync Orbits / not in recurring) */}
              {!(tab === "dates" && !editMode) && !isRecurring && (
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

              {/* Sync Our Orbits — week navigator (only in date-bound dates view, not editing) */}
              {tab === "dates" && !editMode && !isRecurring && (
                <div
                  className="neo-card p-3 flex items-center justify-between gap-2 flex-nowrap"
                  style={{ background: "var(--pastel-mint)" }}
                  data-testid="weekly-snapshot-banner"
                >
                  <button
                    type="button"
                    className="w-9 h-9 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition shrink-0"
                    onClick={() => setWeekOffset((o) => o - 1)}
                    data-testid="week-prev-btn"
                    aria-label="Previous week"
                    title="Previous week"
                  >
                    <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
                  </button>

                  <div className="flex-1 min-w-0 text-center">
                    <div className="label-caps text-[9px]" style={{ color: "var(--ink-mute)" }}>
                      Week snapshot
                    </div>
                    <div
                      className="font-heading font-black text-sm whitespace-nowrap tracking-tight"
                      data-testid="week-snapshot-label"
                    >
                      {formatDateShort(week.monday)} → {formatDateShort(week.sunday)}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="w-9 h-9 rounded-full border-2 border-slate-900 bg-white grid place-items-center hover:bg-[var(--pastel-yellow)] transition shrink-0"
                    onClick={() => setWeekOffset((o) => o + 1)}
                    data-testid="week-next-btn"
                    aria-label="Next week"
                    title="Next week"
                  >
                    <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
                  </button>
                </div>
              )}

              {weekOffset !== 0 && tab === "dates" && !editMode && !isRecurring && (
                <button
                  className="neo-btn ghost text-xs w-full"
                  onClick={() => setWeekOffset(0)}
                  data-testid="week-reset-btn"
                  title="Jump back to this week"
                >
                  Jump to this week
                </button>
              )}

              {/* Quick stats — compact hero */}
              {!hiddenPanels.has("stats") && (
                <div className="pop-in" style={{ animationDelay: "0ms" }}>
                  <QuickStats
                    members={visibleMembers}
                    columns={heatmapColumns}
                    mode={gridMode}
                    hourFrom={0}
                    hourTo={23}
                    minuteStep={60}
                    meId={memberId}
                  />
                </div>
              )}

              {/* Focus banner */}
              {focusedMembers.length > 0 && (
                <div
                  className="neo-card p-3 flex items-center gap-2 flex-wrap text-xs"
                  style={{ background: "var(--pastel-yellow)" }}
                  data-testid="focus-banner"
                >
                  <div className="flex -space-x-2 shrink-0">
                    {focusedMembers.slice(0, 4).map((fm) => (
                      <span
                        key={fm.id}
                        className="w-5 h-5 rounded-full border-2 shrink-0 relative"
                        data-avatar-tint
                        style={{ borderColor: "var(--stroke)", background: fm.color }}
                        title={fm.name}
                      />
                    ))}
                  </div>
                  <span className="flex-1 min-w-0">
                    {focusedMembers.length === 1 ? (
                      <>
                        Showing only{" "}
                        <span className="font-heading font-black">{focusedMembers[0].name}</span>
                      </>
                    ) : (
                      <>
                        Comparing{" "}
                        <span className="font-heading font-black">
                          {focusedMembers.map((fm) => fm.name).join(", ")}
                        </span>
                      </>
                    )}
                  </span>
                  <button
                    onClick={() => setFocusMemberIds([])}
                    className="neo-btn ghost text-[10px] py-1.5 px-2.5"
                    data-testid="focus-banner-clear"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Main content — heatmap / editor / members schedule */}
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
                  columns={editorColumnsMobile}
                  mode={gridMode}
                  hourFrom={isRecurring ? 0 : hourFrom}
                  hourTo={isRecurring ? 23 : hourTo}
                  minuteStep={minuteStep}
                  onMinuteStepChange={setMinuteStep}
                  syncedGroupCount={memberships.count}
                  onReasonsChange={(next) =>
                    setGroup((g) => ({ ...g, reasons: next }))
                  }
                  onSaved={(slots) => {
                    setGroup((g) => ({
                      ...g,
                      members: g.members.map((m) => (m.id === me.id ? { ...m, slots } : m)),
                    }));
                  }}
                  orientation="days-rows"
                />
              ) : (
                <HeatmapGrid
                  members={visibleMembers}
                  reasons={group.reasons}
                  columns={heatmapColumns}
                  mode={gridMode}
                  hourFrom={0}
                  hourTo={23}
                  minuteStep={60}
                  heatColors={undefined}
                  focusMode={focusedMembers.length > 0}
                  compareCount={focusedMembers.length}
                  orientation="days-rows"
                />
              )}
              {/* Mobile: legend lives inline at the top of the heatmap (gradient
                  strip), so the verbose stacked LegendEditor card is omitted here. */}
            </div>
          )}

          {/* CREW TAB — members + focus filter */}
          {mainTab === "crew" && (
            <div className="space-y-4">
              <div
                className="pop-in"
                style={{ animationDelay: "0ms" }}
                data-testid="members-card-wrap"
              >
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
                    <p
                      className="mt-2 text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      Tap another member's bubble to compare.
                    </p>
                  )}
                </div>
              </div>

              {/* Solo-member nudge — when you're the only one in the group,
                  surface an Invite friends card right inside the Crew tab so
                  you don't have to dig into Settings. Disappears once anyone
                  else joins. */}
              {group.members.length === 1 && (
                <div className="pop-in" style={{ animationDelay: "60ms" }}>
                  <div
                    className="neo-card p-5"
                    style={{ background: "var(--pastel-peach)" }}
                    data-testid="crew-invite-card"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className="w-10 h-10 rounded-xl border-2 border-slate-900 grid place-items-center shrink-0"
                        style={{ background: "var(--pastel-mint)" }}
                        aria-hidden="true"
                      >
                        <UserPlus className="w-5 h-5" strokeWidth={2.5} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-heading font-black text-base leading-tight">
                          Bring your crew
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--ink-soft)" }}>
                          Planit shines once at least 2 people log busy times. Share
                          your group code or link below to get started.
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <ShareMenu
                        url={`${window.location.origin}/g/${code}`}
                        groupName={group.name}
                      />
                      <button
                        className="neo-btn ghost flex items-center justify-between gap-2 text-sm w-full"
                        onClick={onCopyCode}
                        data-testid="crew-copy-code-btn"
                      >
                        <span className="label-caps">Code</span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono tracking-widest font-bold">{group.code}</span>
                          <Copy className="w-4 h-4" />
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tip card — points to Plan for heatmap context */}
              <button
                className="neo-card p-4 w-full text-left flex items-center gap-3 hover:scale-[1.01] transition"
                style={{ background: "var(--pastel-mint)" }}
                onClick={() => setMainTab("plan")}
                data-testid="crew-to-plan-cta"
              >
                <span className="text-2xl shrink-0">🗓️</span>
                <span className="flex-1 min-w-0">
                  <span className="font-heading font-black text-sm block">View the heatmap</span>
                  <span className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    See when the crew overlaps in the Plan tab.
                  </span>
                </span>
                <ChevronRight className="w-5 h-5 shrink-0" />
              </button>
            </div>
          )}

          {/* HANGOUTS — relocated into the More tab (the "Hangouts" bottom-tab
              slot is now "My Schedule"). The hangouts list + Suggest a meeting
              button live in the More tab below. */}

          {/* SETTINGS TAB — hangouts list, share, group settings, customize.
              "Suggest a meeting" lives in the Astral hub now. */}
          {mainTab === "settings" && (
            <div className="space-y-4">
              {/* Locked / tentative hangouts — same component as desktop sidebar. */}
              {!hiddenPanels.has("hangouts") ? (
                <div className="pop-in" style={{ animationDelay: "0ms" }}>
                  <HangoutsList
                    group={group}
                    memberId={memberId}
                    onChanged={(h) =>
                      setGroup((prev) => (prev ? { ...prev, hangouts: h } : prev))
                    }
                  />
                </div>
              ) : (
                <div
                  className="neo-card p-4 text-center"
                  style={{ background: "var(--pastel-lavender)" }}
                >
                  <MapPin className="w-6 h-6 mx-auto mb-2 opacity-60" />
                  <p className="text-xs" style={{ color: "var(--ink-soft)" }}>
                    Hangouts panel hidden — turn it on in Customize → Personal.
                  </p>
                </div>
              )}

              {!hiddenPanels.has("share") && (
                <div
                  className="neo-card p-4 pop-in relative z-30"
                  style={{ animationDelay: "60ms" }}
                  data-testid="share-card"
                >
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
                        <span className="font-mono tracking-widest font-bold">
                          {group.code}
                        </span>
                        <Copy className="w-4 h-4" />
                      </span>
                    </button>
                  </div>
                </div>
              )}

              <div
                className="neo-card p-4 pop-in"
                style={{ animationDelay: "120ms" }}
                data-testid="group-settings-card"
              >
                <div className="label-caps mb-3 flex items-center gap-2">
                  <Settings className="w-4 h-4" /> Group settings
                </div>
                <GroupMenu
                  group={group}
                  onRenamed={(name) => setGroup((g) => ({ ...g, name }))}
                  onRecurrenceChange={(kind) =>
                    setGroup((g) => ({ ...g, recurrence_kind: kind }))
                  }
                />
              </div>

              <Link
                to={`/g/${code}/customize`}
                className="neo-btn ghost w-full flex items-center justify-between gap-2 text-sm"
                data-testid="customize-link"
              >
                <span className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Customize this group
                </span>
                <ChevronRight className="w-4 h-4" />
              </Link>

              {/* Layout preview override — lets the user flip between the
                  mobile-app and desktop layouts without resizing the window.
                  "Auto" (default) re-flows at the 1024px breakpoint. */}
              <div
                className="neo-card p-4"
                style={{ background: "var(--pastel-lavender)" }}
                data-testid="layout-toggle-card"
              >
                <div className="label-caps mb-2 flex items-center gap-2">
                  <Smartphone className="w-4 h-4" /> Layout preview
                </div>
                <p className="text-[11px] mb-3" style={{ color: "var(--ink-soft)" }}>
                  Force the mobile or desktop layout, or let it pick automatically based on window size.
                </p>
                <LayoutToggle variant="full" />
              </div>
            </div>
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
            <p className="text-sm text-slate-600 mb-4">
              Pick a display name to show in the heatmap.
            </p>
            <input
              autoFocus
              className="neo-input w-full mb-4"
              placeholder="Your name"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              data-testid="join-modal-name-input"
            />
            <button
              type="submit"
              className="neo-btn w-full flex items-center justify-center gap-2"
              data-testid="join-modal-submit-btn"
            >
              <Plus className="w-4 h-4" /> Join
            </button>
          </form>
        </div>
      )}

      {/* Bottom mobile tab bar — fixed, hosts Plan / Crew / Astral / My Schedule / More.
          Tapping "My Schedule" toggles edit mode on the Plan tab (via onDoneEditing). */}
      <BottomTabBar
        activeTab={mainTab}
        editMode={editMode}
        onTabChange={(k) => {
          // Switching to a nav tab while editing implicitly drops edit mode.
          if (editMode) setEditMode(false);
          setMainTab(k);
        }}
        onMyScheduleClick={() => {
          // Force Plan tab → dates sub-tab, then enter (or exit + save) edit mode.
          if (mainTab !== "plan") setMainTab("plan");
          onDoneEditing();
        }}
        onAstralOpen={() => setAstralOpen(true)}
        astralOpen={astralOpen}
      />

      {/* Astral concierge — anchored above the tab bar (bottom). Mobile auto-centers. */}
      <AstralHub
        open={astralOpen}
        onClose={() => setAstralOpen(false)}
        onReopen={() => setAstralOpen(true)}
        anchor={{ side: "bottom", offset: 0.5 }}
        group={group}
        memberId={memberId}
        code={code}
        onGroupRefresh={(updater) => {
          if (typeof updater === "function") {
            setGroup((prev) => updater(prev));
          } else if (updater) {
            setGroup(updater);
          }
        }}
        onSuggestMeeting={() => {
          setAstralOpen(false);
          setSuggestOpen(true);
        }}
      />

      {/* Suggest a meeting — controlled modal, opened from Hangouts tab or Astral. */}
      <SuggestMeeting
        members={visibleMembers}
        columns={columns}
        mode={gridMode}
        hourFrom={hourFrom}
        hourTo={hourTo}
        minuteStep={60}
        groupName={group.name}
        groupCode={group.code}
        controlledOpen={suggestOpen}
        onOpenChange={setSuggestOpen}
        anchor={{ side: "bottom", offset: 0.5 }}
        hideTrigger
        onBack={() => {
          setSuggestOpen(false);
          setAstralOpen(true);
        }}
      />
      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        groupCode={group?.code}
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
          className="w-4 h-4 rounded-full border-2 border-slate-900 shrink-0 relative"
          style={{ background: m.color }}
          data-avatar-tint
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
          className="w-4 h-4 rounded-full border-2 border-slate-900 shrink-0 relative"
          style={{ background: m.color }}
          data-avatar-tint
        />
        {isMe && (
          <span className="label-caps text-[10px] bg-[var(--pastel-yellow)] px-2 py-0.5 rounded-full border border-slate-900 shrink-0">
            You
          </span>
        )}
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
      data-active={active ? "true" : "false"}
      className={`text-xs sm:text-sm rounded-full border-2 transition inline-flex items-center gap-1.5 px-3 py-1.5 ${
        active ? "scale-[1.04]" : "hover:bg-[var(--pastel-mint)]/40"
      }`}
      style={{
        background: active ? "var(--pastel-mint)" : "var(--card)",
        color: active ? "var(--ink)" : "var(--ink-soft)",
        borderColor: "var(--ink)",
        boxShadow: active ? "3px 3px 0 0 var(--ink)" : "none",
        fontWeight: active ? 800 : 600,
      }}
    >
      {active && (
        <span
          aria-hidden="true"
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: "var(--ink)" }}
        />
      )}
      <span>{children}</span>
    </button>
  );
}
