import { Calendar, Users, Edit3, MoreHorizontal } from "lucide-react";
import AstralBot from "./AstralBot";

/**
 * BottomTabBar — the iOS/Android-style mobile tab bar that anchors the
 * Group page experience. Five "slots":
 *
 *   [Plan] [Crew]  ✦Astral✦  [My Schedule] [More]
 *
 * The center slot is a slightly elevated, rounded mascot orb (AstralBot)
 * with a subtle pulse-ring — tapping it opens the Astral hub.
 *
 * "My Schedule" is a *button-tab* hybrid: tapping it does NOT switch
 * tab content — it instead toggles the Plan tab into edit mode (or
 * saves and exits if already editing). The visual "active" state is
 * driven by the `editMode` prop, not `activeTab`.
 *
 * Visual language:
 *   - Light mode: cream surface, 2px black border, 4px hard drop shadow.
 *   - Dark  mode: deep navy surface, 1px lavender border, lavender→blue
 *                 glow shadow (driven by the global --stroke* tokens).
 */
const PLAN_TABS = [
  { key: "plan", label: "Plan", Icon: Calendar },
  { key: "crew", label: "Crew", Icon: Users },
];
const TRAILING_TABS = [
  // "My Schedule" is action-style: tap → toggle edit mode (handled via onMyScheduleClick).
  { key: "myschedule", label: "Schedule", Icon: Edit3, action: "myschedule" },
  { key: "more", label: "More", Icon: MoreHorizontal },
];

export default function BottomTabBar({
  activeTab,
  onTabChange,
  onMyScheduleClick,
  editMode = false,
  onAstralOpen,
  astralOpen = false,
}) {
  const handleClick = (tab) => {
    if (tab.action === "myschedule") {
      onMyScheduleClick && onMyScheduleClick();
      return;
    }
    onTabChange(tab.key);
  };

  const isActive = (tab) => {
    if (tab.action === "myschedule") return editMode;
    // While editing, no nav-tab pill should be lit.
    if (editMode) return false;
    return activeTab === tab.key;
  };

  return (
    <div className="mobile-tabbar" data-testid="mobile-tabbar">
      {/* The tab strip — 4 tabs with a hole in the middle for the orb. */}
      <div
        className="rounded-3xl pt-2 pb-2 px-2 grid grid-cols-5 gap-1 relative"
        style={{
          background: "var(--card)",
          border: "var(--stroke-width) solid var(--stroke)",
          boxShadow: "var(--stroke-shadow)",
        }}
      >
        {/* Slot 1, 2 */}
        {PLAN_TABS.map((t) => (
          <TabButton
            key={t.key}
            tab={t}
            active={isActive(t)}
            onClick={() => handleClick(t)}
          />
        ))}

        {/* Center slot — Astral mascot orb.
            Light mode: emerald/mint gradient (matches Style A mockup).
            Dark  mode: lavender → indigo → sky-blue gradient (hybrid neon). */}
        <button
          type="button"
          onClick={onAstralOpen}
          aria-label="Open Astral concierge"
          data-testid="bottom-tabbar-astral-btn"
          className="relative flex flex-col items-center justify-end gap-1 group"
        >
          {/* the orb hovers up — uses negative margin to "lift" above the bar */}
          <div
            className="astral-orb-mascot relative w-14 h-14 -mt-7 rounded-full grid place-items-center transition-transform group-active:scale-95"
            style={{
              border: "var(--stroke-width) solid var(--stroke)",
            }}
          >
            {/* pulse ring (only when closed; we hide while open to reduce noise) */}
            {!astralOpen && <span className="astral-pulse-ring" aria-hidden="true" />}
            <AstralBot
              size={32}
              color="var(--ink)"
              bg="#ffffff"
              eyeColor="var(--astral-eye)"
              waving
              className="relative z-10"
            />
          </div>
          <span
            className="text-[9px] font-extrabold tracking-widest gradient-text"
            style={{
              fontFamily: "Outfit, system-ui, sans-serif",
              marginTop: "-2px",
            }}
          >
            ASTRAL
          </span>
        </button>

        {/* Slot 4, 5 */}
        {TRAILING_TABS.map((t) => (
          <TabButton
            key={t.key}
            tab={t}
            active={isActive(t)}
            onClick={() => handleClick(t)}
          />
        ))}
      </div>
    </div>
  );
}

function TabButton({ tab, active, onClick }) {
  const { label, Icon } = tab;
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`bottom-tab-${tab.key}`}
      className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-2xl transition-all ${
        active ? "bg-slate-900 text-white" : ""
      }`}
      style={!active ? { color: "var(--ink-mute)" } : undefined}
    >
      <Icon className="w-5 h-5" strokeWidth={2.4} />
      <span
        className="text-[10px] font-extrabold tracking-wide"
        style={{ fontFamily: "Outfit, system-ui, sans-serif" }}
      >
        {label}
      </span>
    </button>
  );
}
