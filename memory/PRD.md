# Planit (TimeTogether) — PRD

## Original problem statement
"open up the app with abilities on to improve and modify everything on the website app"
The user iteratively requests UI/UX improvements to a no-account group availability scheduler ("Planit") featuring a React frontend, FastAPI/MongoDB backend, and a floating AI hangout concierge ("Astral") powered by Gemini 2.5 Pro.

## User personas
- Friend groups coordinating hangouts without creating accounts
- Each person drops availability into a shared link

## Core surfaces
- Landing page (group create/join)
- Group page (heatmap, availability editor, members, hangouts, recurring)
- Floating Astral hub (AI concierge) with tiles: Suggest a time · Remix · I'm busy · History · Toolkit
- Drawers anchored to the FAB orb: AstralDrawer (remix/history), MyToolsDrawer (busy/toolkit)

## Implementation log
- **Feb 2026** — Mobile dashboard restructure (Hangouts → My Schedule, Astral full-screen):
  - `BottomTabBar.jsx` — replaced "Hangouts" slot with "Schedule" (Edit3 icon). Action-style tab: tapping it calls `onMyScheduleClick` (toggles edit mode on Plan tab) instead of switching nav. Active visual driven by `editMode` prop.
  - `Group.jsx` (mobile branch) — removed inline "Make my schedule" button above Quick Stats on Plan tab; only "Done editing" CTA shown while editing. Removed `mainTab === "hangouts"` block; HangoutsList + Suggest-a-meeting button relocated to **More** tab. Stale `mainTab === "hangouts"` localStorage values migrate to `"more"`.
  - `AstralHub.jsx` — removed "Suggest a time" tile (kept I'm busy / Remix / Toolkit). On mobile (≤639px) the hub now renders full-screen with no rounded corners/shadow + slide-up animation, replacing the centered popup bubble. Desktop anchored-bubble behavior unchanged.
  - `LayoutToggle.jsx` — temporarily un-gated so all users can flip Auto/Mobile/Desktop. The gate line is preserved as a one-line uncomment marked **"PUBLISH-TIME TOGGLE"** for easy re-enable before launch.
  - `index.css` — added `.hub-block--mobile` rule with safe-area-inset bottom padding + `hub-slide-up` keyframe.

- **Feb 2026** — Astral Hub "Suggest a time" tile: refactored from fullscreen centered modal → free-floating bubble anchored next to the FAB orb (matches Remix / I'm busy drawer pattern).
  - `frontend/src/components/SuggestMeeting.jsx` — accepts new optional `anchor` prop; in controlled+anchored mode renders via `computeAnchorStyle` with transparent scrim (z-40) and bubble (z-50), keeping the FAB orb (z-60) clickable.
  - `frontend/src/components/FloatingLauncher.jsx` — owns the controlled `<SuggestMeeting>` instance so it can pass its own `pos` as anchor; accepts `suggestMeetingProps` (members, columns, mode, hourFrom, hourTo, groupName, groupCode).
  - `frontend/src/pages/Group.jsx` — removed the fullscreen `<SuggestMeeting>` and `suggestMeetingOpen` state; passes data via `suggestMeetingProps` to FloatingLauncher.

## Backlog (P1/P2)
- **PUBLISH-TIME**: re-enable dev-mode gate on `LayoutToggle` (single-line uncomment in `LayoutToggle.jsx`) before launch so end users don't see the layout switcher.
- (P2) Customize.jsx mobile-shell visual review.
- (P2) Entry/exit animations for bottom-tab content swaps.
- (P2) "Today" quick-stats banner on the mobile Plan tab.

## Health
- Backend, frontend, MongoDB all green
- No mocks
- Auth: no-account flow (no credentials needed for testing)
