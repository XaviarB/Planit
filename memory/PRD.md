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

---

## Iteration — 7 May 2026 · part 3 (layout polish)

### Changes
- **Sidebar reorder** (`Group.jsx`): Quick stats → Invite friends → Heatmap legend → Members.
  Members card is now at the bottom; the page leads with stats + share so brand-new visitors are pushed toward the next action.
- **Week-snapshot navigator** simplified: dropped the `<input type="range">` slider, kept only the prev/next chevron buttons (now `w-11 h-11`). Date label upsized to `text-xl sm:text-2xl font-black`, "WEEK SNAPSHOT" caption to `text-sm/base`, "This week"/offset readout to `text-sm`. Removed the now-unused `.week-slider` CSS rule.
- **Share menu** redesigned (`ShareMenu.jsx`): the 4-column grid was replaced with a single **horizontal scroller** (`.share-scroller` snap-x, hidden bulk scrollbar). Same 31 brand tiles + the search input — easier to interpret because the user sees just 4 tiles at a time and either scrolls or searches.
- **Landing bottom** (`Landing.jsx`): rebuilt with bigger spacing — `pt-12 pb-32` on the closing section, `mt-20` between feature cards and the closing kicker, `gap-8` between cards. Each feature card now uses `p-7` with `text-2xl` titles and bigger icons. The mid-page slogan was removed in favour of a giant **"Plan less. Planit."** orbit-font kicker (`text-7xl`) at the very bottom that doubles as the page's final beat.

### Verified
- ESLint clean across all touched files
- Side-by-side screenshots: sidebar order correct (QuickStats top, Members bottom); week banner has bigger fonts + only arrow buttons; share menu scroller shows 4 tiles + scroll hint; closing slogan is the visual anchor of the page

---

## Iteration — 7 May 2026 · part 4 (share menu pivot, stagger, range chips)

### Changes
- **ShareMenu** is now a **vertical list** anchored to the LEFT of the trigger button (`left-0 right-auto w-[240–260px]`). Each brand tile is a horizontal `icon + label` row, clicked to launch the share intent. Search input still filters across all 31 platforms.
- **Sidebar stagger** — added staggered `pop-in` entrance animation across the four cards (Quick stats / Invite / Legend / Members) at delays `0ms → 80ms → 160ms → 240ms`. Updated `.pop-in` fill mode from `both` to `backwards` so the card's `:hover` transform still works after the entrance animation finishes.
- **Date-range bar redesigned** as minimalist chip presets (`RangeChipBar` + `Chip` helpers in `Group.jsx`).
  - Date presets: `This week`, `Next 7 days`, `Next 14 days`, `Custom…`
  - Hour presets: `All day`, `Morning`, `Afternoon`, `Evening`, `Custom…`
  - Custom inputs (date pickers / hour selects) only appear when the user explicitly clicks `Custom…` — keeps the default state to two clean rows of pills.

### Verified
- ESLint clean
- Members' schedule view shows the new chip bar
- Share dropdown anchors left, vertical list scrolls inside `max-h-[420px]`
- Sidebar cards animate in sequence on mount

---

## Iteration — 7 May 2026 · part 5 (spacing, logo wind-down, share z-index)

### Changes
- **Homepage spacing** tightened: hero `pt-10 pb-20` → `pt-6 pb-10`; closing section `pt-12 pb-32` → `pt-2 pb-24`; closing slogan margin `mt-20` → `mt-14`. "Built for spontaneous plans" + the feature cards now follow directly after the create/join row.
- **Logo wind-down**: rewrote `PlanetIcon` to track `spinning` state in React. On mouse leave we set a `stopAfterIterRef` flag instead of stopping the animation; the SVG `<g.planet-globe>`'s `onAnimationIteration` handler reads that flag and removes the `is-spinning` class only at the end of a complete 4 s revolution → globe always returns to 0° seamlessly. Stars continue to twinkle while the wind-down cycle plays.
  - CSS: removed the hover-only animation rule; added `.planet-globe.is-spinning { animation: globe-spin-y … }` and an extra selector to keep stars twinkling when the globe is winding down.
- **Share dropdown stacking**: added `relative z-30` to the share-card. Now the entire share-card is its own stacking context above sibling sidebar cards (which compete with implicit `z-index: 0` when their `:hover` transform fires), so the dropdown reliably renders above the legend and members cards.

### Verified
- ESLint clean
- Homepage screenshot shows hero immediately followed by the bottom section (no white desert between them)
- Group page screenshot shows the share dropdown cleanly painted over everything below it
- Logo: hover → spin starts; mouse leave mid-spin → globe completes its current revolution and stops at 0°

---

## Iteration — 7 May 2026 · part 6 (palette swap, static legend, clipboard fix)

### Changes
- **Light-mode heatmap palette swapped to neon orange/red gradient**:
  `#1f0500 → #dc2626 → #fb923c → #fcd34d → #fffbeb`. Backend defaults + backfill updated to the same set.
  Dark mode remains the existing neon-blue gradient.
- **Heatmap palette is now driven entirely by CSS variables** — `Group.jsx` no longer overrides the palette per theme. Removed the `MutationObserver`, `isDark` state, and `NEON_BLUE_PALETTE` array. `HeatmapGrid` is passed `heatColors={undefined}` so it falls back to `var(--heat-*)` which auto-flips with the theme.
- **`LegendEditor` is now a static `LegendDisplay`** — overwritten with a read-only component (5 swatches + labels driven by CSS vars). No more customize/reset/apply buttons. The component still exports default and is imported with the same name so call sites didn't move.
- **Clipboard fix** — added `/lib/clipboard.js` with `copyToClipboard(text)` that:
  1. Tries `navigator.clipboard.writeText` (modern API, secure context),
  2. Falls back to a hidden `<textarea>` + `document.execCommand("copy")` — works inside the Emergent preview iframe where the modern API is blocked by Permissions-Policy.
  All three call sites switched to it: `ShareMenu.copyLink`, `ShareMenu.onTargetClick` (copy-only platforms), `Group.onCopyCode`.
- **Native share-sheet error handling** — `ShareMenu.onNativeShare` now distinguishes `AbortError` (user cancelled) from real failures. On real failure (iframe-blocked, etc.) it falls back to clipboard copy and tells the user via a toast.

### Verified
- ESLint + Ruff clean
- Backend health OK; new groups receive the new orange/red defaults
- Light/dark screenshots show the new palettes + static legend
- Functional clipboard test: clicking "Copy" inside the share menu shows `"Invite link copied!"` toast even though `navigator.clipboard.readText` is blocked in the iframe (proving the fallback works)

---

## Iteration — 7 May 2026 · part 7 (recents + stable week bar)

### Changes
- **Week snapshot — rock-stable layout** when navigating:
  - Center date label switched from `min-w-[200px]` to a fixed `w-[220px] sm:w-[260px]`. Wide enough for the longest possible Mon-Sun string.
  - Right-side group switched to fixed `w-[230px]` with `whitespace-nowrap` on both the offset label (`w-[120px]`) and the "This week" reset button.
  - Reset button is now ALWAYS rendered with `style={{ visibility: weekOffset === 0 ? "hidden" : "visible" }}` so its space is reserved even on the home week. Layout no longer reflows.
  - Functional check: arrow x-coordinates change by ≤ 2 px (sub-pixel rounding only) across 6 weeks of navigation.
- **ShareMenu — Recently shared** memory:
  - Persists last 3 platforms picked in `localStorage["tt:share:recent"]` (deduped, FIFO, capped at 3).
  - Renders a "Recent" section at the top of the menu (vertical list of 3) followed by a dashed divider and an "All apps" section with the rest.
  - When the user is searching (non-empty query), the Recent section is hidden so the filter operates over every platform.
  - `recordShareUse(t.id)` is called inside `onTargetClick` after both the URL-share path AND the copy-only path so every share gets remembered.

### Verified
- ESLint clean
- Numerical layout test: max label-x delta across 7 weeks = 2 px
- Screenshot at week +6 shows no wrapping anywhere; full text visible
- Pre-seeded localStorage shows the Recent section rendering above All apps

---

## Iteration — Feb 2026 · part 8 (floating launcher + weekday recurrence + last-batch verification)

### Changes
- **Floating Astral + Toolkit launcher (FAB)** — `frontend/src/components/FloatingLauncher.jsx`
  - Removed "Ask Astral" and "My Toolkit" pills from the Group topbar Row 2.
  - Added a draggable circular orb fixed to the page edge. Tap → small popover with `[fab-open-astral]` and `[fab-open-tools]` buttons. Drag (>8px move) → orb relocates; localStorage `planit:fab-y` / `planit:fab-side` persist position.
  - Both `AstralDrawer` and `MyToolsDrawer` rendering now lives inside the launcher (Group.jsx no longer references them directly).
  - Topbar Row 2 is now just two buttons (Suggest a time + Edit my availability) for a cleaner look on every device.
- **Weekday-mode recurrence grid** — `frontend/src/pages/Group.jsx`
  - When `group.recurrence_kind !== "none"`, columns become `[{key:"d0",label:"Mon"}…{key:"d6",label:"Sun"}]` and `mode="weekly"` is passed to `HeatmapGrid`, `AvailabilityEditor`, `QuickStats`, `MembersSchedule`, `SuggestMeeting`.
  - The week-snapshot navigator and the date-range chip bar are hidden in recurring mode (no calendar dates to scrub).
  - Slot persistence to `weekly` + `d{idx}` was already supported by `lib/schedule.js`; the change was purely in the Group page column generators.
- **Backend bug fix** — `UpdateRemixDefaultsReq.presets` typed as `Optional[List[Any]]` instead of `Optional[List[str]]` so non-string entries are silently dropped at the runtime `isinstance` filter (per the spec) instead of getting rejected with HTTP 422.

### Verified
- Backend pytest suite: 16/16 (after the `List[Any]` fix). Endpoints covered: `astral/history` GET/DELETE, `remix-defaults` PUT, `recurrence` PUT, `og.png` + `og/{code}.png`. Iteration_1.json.
- Frontend e2e: 11/11. FAB tap (mouse + touch), drag-to-reposition with localStorage persistence, popover toggle, Astral drawer launch, Tools drawer launch, recurrence weekly switch (heatmap + editor render weekday columns + recurrence badge + suggestion banner suppression), back-to-none reverts cleanly. Iteration_3.json.
- ESLint clean on FloatingLauncher.jsx + Group.jsx; Ruff clean on server.py.
