# Planit (formerly TimeTogether) — Product Requirements Document

## Original Problem Statement
Build a website that can group you and your friends schedules with time slots and days your available to reference with your group of friends availability and it visually shows all the times that every friend is free every hour in the same place.

## User Choices (Feb 2026)
- Authentication: **None** — shareable group links + display names
- Group joining: **Invite link / 6-char code**
- Availability modes: started Weekly + Date-range, **simplified to Specific dates only** in iteration 4
- Time granularity: **1-hour blocks**
- Design: Soft friendly pastel, color wheel + gradient picker for busy-reason colors, visible labels on chart

## Architecture
- **Frontend**: React 19 (CRA) + React Router 7 + Tailwind 3 + sonner + lucide-react + Radix/shadcn (local copies)
- **Backend**: FastAPI + Motor (MongoDB) with `/api` prefix, single-file `server.py`
- **Storage**: Single `groups` collection; each group holds `members[]`, `reasons[]`, `heat_colors[5]`
- **Identity**: localStorage `tt:{CODE}:member_id` per group (no auth)
- **Theme**: CSS custom properties on `:root` and `html.dark` overrides, persisted in `tt:theme`
- **Visited groups**: localStorage `tt:groups` (deduped, capped at 20)

## Core Requirements (Static)
1. Create a group with a display name → receive 6-char code
2. Join via code or `/g/{CODE}` link
3. Mark availability per 1-hour slot for specific dates
4. Tag busy hours with a reason + custom color (HSL hue/sat/light sliders)
5. Group heatmap: cell color = count of members free, customizable 5-color palette per group
6. Hover tooltip: who is free / who is busy + reason tag

## User Personas
- **Organizer**: creates group, invites friends, monitors heatmap, picks meeting times
- **Member**: joins via link, marks busy hours, views overlap, can compare with others

## Iteration Log

### Iteration 1 — MVP (Feb 2026)
- Landing (Create/Join), Group dashboard with weekly + date-range tabs
- HeatmapGrid + AvailabilityEditor + BusyReasons
- Backend pytest 9/9, frontend e2e all passing

### Iteration 2 — Theme + power features
- Dark mode toggle (localStorage `tt:theme`, respects `prefers-color-scheme`)
- Hour-range From/To dropdowns with "All day" reset
- Quick Stats card
- Editable group-wide legend colors (`PUT /api/groups/{code}` with `heat_colors`)
- GroupMenu dropdown: rename current group, create new, switch to another visited group
- Tested: 16/16 backend + 12/12 frontend

### Iteration 3 — Suggest a time
- Top-3 ranked time slots in a popover, one-click copy + invite link
- "EVERYONE" badge for 100% overlap slots
- Tested: 11/11 frontend

### Iteration 4 — Tabs + tooltip + rename
- Removed "Weekly recurring" tab (Specific dates is now the only schedule view)
- New "Members' schedule" tab listing each member's busy hours grouped by date
- Heatmap tooltip redesigned (neo-card with date header, X/Y pill, progress bar, free/busy lists, smart edge-anchoring)
- Inline rename of own member with pencil icon (Enter/Escape support)
- Tested: 28/29 frontend (1 cosmetic test-id nit)

### Iteration 5 — Member focus
- Tap a member to filter the entire view to their schedule
- In single-member focus, busy cells colored by reason directly
- Banner + sidebar "Show all members" + clear filter
- Tested: 13/13 frontend

### Iteration 6 — Layout polish + new stats
- Tab title "Members' schedule" (apostrophe)
- Members' schedule pills: horizontal `date · range · reason` rows
- Quick Stats now exactly: Best overlap, Longest free streak, Top free hour of day
- Tested: 13/13 frontend

### Iteration 7 — Compare mode + live status (May 2026)
- `focusMemberIds: string[]` (multi-select)
- Live "Free / Busy · Reason" bubble next to each member's name (refreshes every 60 s)
- Clicking the bubble toggles focus; 2+ selected = compare mode (gold cell = "all selected free")
- Banner adapts: "Showing only X" → "Comparing X, Y — gold cells = all of them are free"

### Export package — May 2026
- `HANDOFF.md`, `README.md`, `EXPORT_MANIFEST.txt` (SHA-256 of every file), `verify.sh`, `scripts/build_manifest.sh`, `screenshots/take_shots.py`
- 83-file deterministic manifest

### Iteration 8 — Planit rebrand + minute-level scheduling (Feb 2026)
- Rebranded to **Planit** with space/orbit-themed terminology (landing copy, "Sync Our Orbits", rocket icon, 3D spinning planet logo, twinkling stars)
- Landing page interactive drag-to-paint heatmap preview
- Heatmap default palette switched to a cosmic dark→light gradient (`#0F1640` → `#E8E5FF`)
- **Minute-level scheduling**: AvailabilitySlot model gained `step: int = 60`. Precision toggle (1 HR / 30 MIN / 15 MIN) hoisted to Group.jsx and threaded through HeatmapGrid, AvailabilityEditor, MembersSchedule, QuickStats, SuggestMeeting via `minuteStep` prop
- **Auto-split on precision change**: existing 60-min busy slots visually explode into child cells when viewing at finer precision; saving persists at the active step
- New helpers in `lib/schedule.js`: `buildTimeSlots(hourFrom,hourTo,step)`, `timeLabel(h,m)`, `buildBusyIndex` (overlap-based status lookup)
- **Leave this group** flow: `DELETE /api/groups/{code}/members/{member_id}` returns `{ok, dissolved}`; the group is hard-deleted when the last member leaves. UI lives in GroupMenu 3-dot dropdown with red confirm
- Static action buttons: Suggest a time, Edit my availability, Theme toggle, Date range, Hour range, Precision controls all remain visible across both Sync Our Orbits and Members' schedule tabs
- Tested: 23/23 backend pytest + 9/9 frontend acceptance criteria

### Iteration 9 — UX restructure + meeting confirmation (Feb 2026)
- **Done editing now saves & exits**: AvailabilityEditor exposes `save()` via `forwardRef`/`useImperativeHandle`; internal Save button removed, "Editing: {name}" label removed. Clear view + Customize labels collapsed onto the same row as the editor's inline Precision toggle.
- **Precision toggle scope**: moved INTO the editor only. Heatmap, Members' schedule, QuickStats, SuggestMeeting all run at fixed 60-min hour blocks.
- **Sync Our Orbits = static weekly snapshot**: locked to Mon→Sun of the current week, full 24h, 1-hour blocks. Date-range / Hour-range pickers hidden on this tab; replaced by "This week's snapshot" banner. Members' schedule tab and Editor still expose Date-range + Hour-range.
- **Topbar restructure**: back-button + Group label/name now sit on the same flex row as `Sync Our Orbits | Members' schedule | (Editing pill) | Suggest a time | Edit / Done | Theme`. Members card top aligns with the heatmap card top.
- **Heat-color palette**: switched to lighter neon blue/purple gradient `#1E2A78 / #3D4DC7 / #6E5FF0 / #A9A0FF / #EDE7FF` across `index.css :root`, `LegendEditor.DEFAULTS`, and `server.py` defaults+backfill.
- **One-click Confirm meeting**: each suggestion in the SuggestMeeting popover now has a yellow "Confirm" button → opens a modal asking for an optional join link (Google Meet / Zoom / etc.); copies a "Meeting confirmed for {Day} at {time} (free count). Join link: {url}" message.
- **Touch / mobile gestures**: editor cells handle `touchstart`/`touchmove`/`touchend` via `elementFromPoint` + `data-cell-coord` for drag-paint on phones/tablets.
- **View-state persistence**: per-group `tab / rangeStart / rangeEnd / hourFrom / hourTo / minuteStep / focusMemberIds` saved to `localStorage[tt:{CODE}:view_state]` and rehydrated on reload.
- **Toast hygiene**: `toast.dismiss()` called before navigation away (Leave-this-group, Back-home) so transient toasts don't stack on landing.
- Tested: 23/23 backend pytest + 11/11 frontend acceptance criteria.

## P0 Backlog
- Touch/mobile gesture support for availability editor (currently mouse-drag only)
- Persist `tab` / `hourFrom` / `hourTo` / `focusMemberIds` across reloads
- Auto-clear focus when a focused member is removed by another client

## P1 Backlog
- Member remove/leave endpoint
- Timezone selector per member
- Friendlier "All day" label when streak === 24

## P2 Backlog
- Recurring event overlay (e.g., "classes every Tue 9–11")
- Calendar import (.ics / Google Calendar)
- Group chat / comments per day
- FastAPI lifespan migration (drop deprecated `on_event`)
- Pro tier for >10 members

## Next Tasks (post-export)
- Capture binary screenshot set in `/app/screenshots/` once Playwright is available locally
- Wire up GitHub push and confirm `verify.sh` returns clean diff on a fresh clone

---

## Iteration — 7 May 2026 (cloned from `Xodeius/Natty`)

### What was added
- **Auto-copy invite link on group creation** — clipboard write happens in `Landing.onCreate` *and* in `Group.jsx` when navigated with `state.justCreated`, so a single click creates+shares.
- **Enlarged Planet logo + brand name** on Landing nav (`w-16/72` box, `text-3xl/4xl` brand) — uses the previously-empty top-left space.
- **Week-snapshot navigator** replaces the old static "Adjust dates / hours…" hint banner. Prev/next arrow buttons + a `<input type="range" min=-12 max=12>` slider styled with the heat gradient + a "This week" reset chip. New `weekOffset` state in `Group.jsx` re-derives `week = currentWeekBounds(now, weekOffset)` and the heatmap columns.
- **`schedule.currentWeekBounds(now, weekOffset)`** — accepts a +/- weeks shift.
- **Quick stats always read the week snapshot** — regardless of `tab` / `editMode`. `columns=heatmapColumns`, `hourFrom=0`, `hourTo=23`, `minuteStep=60`.
- **Heatmap palettes are theme-aware** — `--heat-*` CSS variables: light = neon purple gradient (`#0f0224 → #fae8ff`), dark = neon blue gradient (`#020617 → #cffafe`). `Group.jsx` watches `html.dark` via `MutationObserver` and forces a `NEON_BLUE_PALETTE` for `HeatmapGrid` in dark mode (so dark mode is *always* neon blue, even if a user customised colours via `LegendEditor` in light mode). New backend defaults + `LegendEditor` defaults updated to the neon-purple set.
- **Editor toolbar reordered** — `Clear view` + `Customize labels` on the top row (right-aligned), `Precision` toggle on the row below (left-aligned). Two evenly-balanced rows.

### Files touched
- `frontend/src/lib/schedule.js` — `currentWeekBounds(now, weekOffset)`
- `frontend/src/pages/Landing.jsx` — bigger logo/brand, auto-copy on create
- `frontend/src/pages/Group.jsx` — week navigator, `weekOffset` state, theme-aware palette, auto-copy from `state.justCreated`, QuickStats locked to week snapshot
- `frontend/src/components/AvailabilityEditor.jsx` — toolbar reorder
- `frontend/src/components/LegendEditor.jsx` — neon-purple `DEFAULTS`
- `frontend/src/index.css` — neon `--heat-*` light + dark sets, `.week-slider` styling
- `backend/server.py` — neon-purple `heat_colors` defaults + backfill

### Verified
- Light + dark visually confirmed via screenshots (heatmap, legend, slider, editor, landing)
- Backend create returns `heat_colors=['#0f0224','#7b1fe3','#c026d3','#e879f9','#fae8ff']`
- ESLint + Ruff clean

---

## Iteration — 7 May 2026 · part 2 (share menu + logo polish)

### Changes
- **Removed** the auto-copy invite link on group creation (in `Landing.onCreate` and the `justCreated` effect in `Group.jsx`). `useLocation` import + the unused `onCopyLink` helper were also removed.
- **New `ShareMenu` component** (`/frontend/src/components/ShareMenu.jsx`) — replaces the old single-purpose "Share link" button in the group-page sidebar.
  - 31 share targets (URL share intents + copy-only fallbacks):
    WhatsApp, iMessage/SMS, Telegram, Email (Gmail), X / Twitter, Facebook, Messenger, LinkedIn, Reddit, Discord*, Slack*, Microsoft Teams, Skype, Viber, LINE, KakaoTalk*, WeChat*, QQ, Snapchat, Instagram DM*, TikTok DM*, Threads, Bluesky, Mastodon, Tumblr, Pinterest, Pocket, Hacker News, VK, Weibo, Google Chat*.
    *(* = copy-only with a context-aware toast, since those platforms have no public URL share intent.)
  - Pre-filled invite text: `Drop your busy hours into "{groupName}" on Planit so we can find a time that works:` followed by the link.
  - Brand icons pulled lazily from `cdn.simpleicons.org/{slug}/{color}` so we don't bundle 30+ SVGs.
  - Web Share API "Open device share sheet" button shown only if `navigator.share` exists (mobile/PWA).
  - Search filter input ("Search 30+ apps…") for fast lookup.
- **Logo redesign** (`PlanetIcon` + `index.css`):
  - Globe is static at rest; on `:hover .planet-globe` runs `globe-spin-y 4s linear infinite` (rotateY 0 → 360°).
  - Ring of orbital dots is now a STATIC halo (`ring-spin` keyframes deleted, only the rotateZ/rotateX tilt remains).
  - Stars repositioned tightly around the globe (band ~7-12 from center) and dimmed to `opacity: 0.18` at rest. They only twinkle while the logo is hovered.

### Files touched
- `frontend/src/components/ShareMenu.jsx` (new)
- `frontend/src/pages/Group.jsx` — wire up ShareMenu, drop unused `useLocation` + `onCopyLink`
- `frontend/src/pages/Landing.jsx` — revert auto-copy, repositioned `stars` array
- `frontend/src/index.css` — globe-spin-y keyframes, hover-only animations, dim-by-default stars

### Verified
- ESLint clean across all 4 files
- Share menu opens, lists 31 tiles, search filter works ("what" → 1 result)
- Logo hover triggers globe rotation; idle shows static halo + dim stars
