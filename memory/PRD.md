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
- **Feb 2026** — Astral Hub "Suggest a time" tile: refactored from fullscreen centered modal → free-floating bubble anchored next to the FAB orb (matches Remix / I'm busy drawer pattern).
  - `frontend/src/components/SuggestMeeting.jsx` — accepts new optional `anchor` prop; in controlled+anchored mode renders via `computeAnchorStyle` with transparent scrim (z-40) and bubble (z-50), keeping the FAB orb (z-60) clickable.
  - `frontend/src/components/FloatingLauncher.jsx` — owns the controlled `<SuggestMeeting>` instance so it can pass its own `pos` as anchor; accepts `suggestMeetingProps` (members, columns, mode, hourFrom, hourTo, groupName, groupCode).
  - `frontend/src/pages/Group.jsx` — removed the fullscreen `<SuggestMeeting>` and `suggestMeetingOpen` state; passes data via `suggestMeetingProps` to FloatingLauncher.

## Backlog (P1/P2)
- (none currently queued — user provides iterative feedback per change)

## Health
- Backend, frontend, MongoDB all green
- No mocks
- Auth: no-account flow (no credentials needed for testing)
