#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Customize the Planit (TimeTogether) app — a no-account group availability scheduler — into something
  revolutionary for groups planning hangouts. This iteration focuses on Phase 2 of the product roadmap:
  introduce **Astral**, an AI hangout concierge powered by Gemini 2.5 Pro (via the Emergent LLM key).
  Astral is an edgy, mature, lowercase-by-default persona that, given a free-form time window and an
  area, returns 3 real venue suggestions with a "buzz quote" (gist of public sentiment) front-and-center,
  Astral's own dry take, vibe tags, ratings, warnings, "verify on Google" + "open in maps" links, and a
  one-tap invite drafter. Also adds optional group base location + per-member location override, and a
  natural-language "I'm busy …" parser.

backend:
  - task: "Astral suggest endpoint (POST /api/groups/{code}/astral/suggest)"
    implemented: true
    working: true
    file: "backend/server.py, backend/astral.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Gemini 2.5 Pro via emergentintegrations + EMERGENT_LLM_KEY. Body: window_blurb (free-form),
          optional location_override, optional history_blurb, optional participant_ids. Returns
          { intro, cards[≤3], used_location, participant_count }. Smoke-tested code FLLB7A,
          window "Saturday 7-11pm", location "Brooklyn, NY" — 3 real venues, lowercase buzz quotes, ~20s.
      - working: true
        agent: "testing"
        comment: |
          ✅ VERIFIED - All test scenarios passed:
          1. With location_override "Brooklyn, NY" + window "Saturday 7-11pm" → Valid response with proper card structure
          2. Without location (empty) + window "Friday evening" → Valid response (200 OK, handles gracefully)
          3. Non-existent group code "XXXXXX" → Correctly returns 404
          Response shape validated: intro (str), cards (list ≤3), used_location, participant_count (int).
          Each card has all required fields: venue, category, neighborhood, vibe_tags, buzz{quote, tone},
          rating (0-5), review_count_approx (int), price_level, what_to_order, astral_take, warnings,
          good_for, verify_links{google_search, google_maps}. Gemini calls completed in 10-25s range.
  - task: "Astral parse-busy endpoint (POST /api/groups/{code}/astral/parse-busy)"
    implemented: true
    working: true
    file: "backend/server.py, backend/astral.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Body: text + optional anchor_iso. Returns {slots, count}. Smoke: "slammed mon-wed 6-9pm next
          week" + anchor 2025-07-07 -> 9 slots covering Mon/Tue/Wed 18-20. Backend never persists
          slots — frontend merges them into the editor.
      - working: true
        agent: "testing"
        comment: |
          ✅ VERIFIED - All test scenarios passed:
          1. Valid input "slammed mon-wed 6-9pm next week" + anchor "2025-07-07" → Parsed slots correctly
          2. Empty text "" → Returns {slots:[], count:0} (never 500)
          3. Garbage input "asdf qwerty zzz 12345" → Handled gracefully, returns valid structure
          All slots have correct structure: mode="date", status="busy", hour (0-23), valid ISO date in key.
          Response always includes {slots: list, count: int}. Never raises 500 error.
  - task: "Astral draft-invite endpoint (POST /api/groups/{code}/astral/draft-invite)"
    implemented: true
    working: true
    file: "backend/server.py, backend/astral.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Returns { message } — paste-ready group-chat copy in Astral's voice. Always returns non-empty
          string (defensive fallback if Gemini fails).
      - working: true
        agent: "testing"
        comment: |
          ✅ VERIFIED - Both test scenarios passed:
          1. Normal suggestion with venue details → Returns non-empty message in Astral's voice
          2. Sparse suggestion {} → Defensive fallback works, returns non-empty message
          Response always includes {message: str} with non-empty content. Gemini calls complete in 10-25s.
  - task: "Group + Member location fields"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Added optional `location: str | null` to Group and Member. POST /api/groups accepts optional
          location and copies it onto the creator member. PUT /api/groups/{code} accepts location.
          PUT /api/groups/{code}/members/{id} accepts {name?, location?}; either may be omitted.
          Empty string clears. Old documents without the field still load.
      - working: true
        agent: "testing"
        comment: |
          ✅ VERIFIED - All location persistence scenarios passed:
          1. POST /api/groups with location "Brooklyn, NY" → Both group AND creator member have location set
          2. PUT /api/groups/{code} with location "Queens, NY" → Group location updated correctly
          3. PUT /api/groups/{code}/members/{id} with location "Bushwick, NY" (no name) → Member location updated
          4. PUT /api/groups/{code}/members/{id} with name only (no location) → Back-compat works, name updated
          5. PUT with location "" → Clears field (serializes as null)
          All CRUD operations work correctly. Old documents without location field load without issues.
  - task: "Astral remix mode (suggest with previous_cards / remix_presets / remix_hint)"
    implemented: true
    working: true
    file: "backend/astral.py, backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Extended POST /api/groups/{code}/astral/suggest to accept optional previous_cards (list of
          prior card dicts), remix_presets (list of preset keys from REMIX_PRESETS — cheaper, fancier,
          different_neighborhood, different_vibe, more_chill, more_lit, with_food, no_drinks, earlier,
          later, outdoorsy, indoorsy), and remix_hint (free-form). When any are set Astral switches
          to "remix" mode: forbids reusing prior venues, folds chip presets + free-form hint into the
          prompt. Response now includes was_remix=true when any remix field was supplied. Plain
          (non-remix) calls remain backward-compatible — same shape as before plus was_remix=false.
      - working: true
        agent: "testing"
        comment: |
          ✅ VERIFIED - All 5 remix mode scenarios passed:
          1. Plain suggest (no remix fields) → was_remix=false, 3 cards returned, all required fields present
          2. Remix with previous_cards + remix_presets ["cheaper", "different_neighborhood"] → was_remix=true,
             3 new cards returned, ZERO venue names repeated from previous cards
          3. Remix with remix_hint "we want tacos no bars" → was_remix=true, 2/3 cards food-related
             (categories: restaurant/cafe/other)
          4. Garbage remix_presets ["bogus_preset", "cheaper", "invalid_chip"] → was_remix=true, invalid
             presets silently filtered, only valid "cheaper" applied (200 OK, no errors)
          5. Empty remix fields (previous_cards=[], remix_presets=[], remix_hint="") → was_remix=false,
             treated as plain (non-remix) call
          Gemini 2.5 Pro calls completed in 10-25s range. All response shapes validated. Backward
          compatibility confirmed: plain calls work exactly as before with was_remix=false added.
  - task: "Single-event .ics download endpoint"
    implemented: true
    working: true
    file: "backend/server.py, backend/calendar_sync.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          NEW endpoint GET /api/groups/{code}/hangouts/{hid}/event.ics returns a one-shot .ics blob
          for a single hangout (distinct from the recurring per-member feed). Content-Type is
          text/calendar; Content-Disposition forces a download with a slugified filename. Implemented
          via new build_single_event_ics() helper in calendar_sync.py. Tentative hangouts get a
          "[tentative] " title prefix and STATUS:TENTATIVE; locked use STATUS:CONFIRMED. 404 on missing
          group or hangout. Used by the new "Add to calendar" icon in HangoutsList rows and by the
          updated LockInModal "download .ics" button.
      - working: true
        agent: "testing"
        comment: |
          ✅ VERIFIED - All 6 .ics export scenarios passed:
          1. GET /api/groups/{code}/hangouts/{hid}/event.ics → 200 OK
          2. Headers validated: Content-Type "text/calendar; charset=utf-8", Content-Disposition
             "attachment" with .ics filename
          3. iCalendar structure validated: Contains BEGIN:VCALENDAR, END:VCALENDAR, exactly 1
             BEGIN:VEVENT/END:VEVENT, all required fields (DTSTART, DTEND, SUMMARY, UID) present
          4. Tentative hangout (status="tentative") → SUMMARY contains "[tentative] " prefix,
             body contains STATUS:TENTATIVE
          5. Locked hangout (status="locked") → SUMMARY has NO "[tentative]" prefix, body contains
             STATUS:CONFIRMED
          6. Error handling: 404 when group code doesn't exist, 404 when hangout id doesn't exist
          Created test group, created hangout with start/end times, verified tentative state, locked
          hangout via PUT, re-fetched .ics and verified confirmed state. All validations passed.

frontend:
  - task: "Astral concierge drawer + Ask Astral trigger"
    implemented: true
    working: "NA"
    file: "frontend/src/components/AstralDrawer.jsx, frontend/src/pages/Group.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Right-side drawer. Buzz quote is the centerpiece of every card. Includes Astral's intro,
          per-card vibe tags, Astral's take, what-to-order, warnings, and 3 action buttons (verify,
          maps, draft pitch). Drafted invite auto-copies to clipboard. Loading shows rotating quirky
          lowercase lines. Trigger is a gradient pill in the topbar (testid `open-astral-btn`).
  - task: "Group base location + per-member override (UI)"
    implemented: true
    working: "NA"
    file: "frontend/src/pages/Landing.jsx, frontend/src/components/AstralDrawer.jsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Optional location field added to Landing create form. AstralDrawer exposes inline-edit rows
          for both group base and per-user override.
  - task: "localStorage tt:* → planit:* migration"
    implemented: true
    working: "NA"
    file: "frontend/src/lib/api.js"
    stuck_count: 0
    priority: "low"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: |
          Idempotent one-shot migration. ThemeToggle + ShareMenu now write planit:* but still read both
          to be safe.

metadata:
  created_by: "main_agent"
  version: "1.2"
  test_sequence: 3
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Two NEW backend additions to verify in this round (do NOT re-test the broader Phase-2 surface,
      that's already green):
      
      1) ASTRAL REMIX MODE — same endpoint POST /api/groups/{code}/astral/suggest now accepts three
         optional fields:
            - previous_cards: list[dict]   (the cards Astral returned earlier — must NOT be repeated)
            - remix_presets: list[str]     (chip keys: "cheaper", "fancier", "different_neighborhood",
                                           "different_vibe", "more_chill", "more_lit", "with_food",
                                           "no_drinks", "earlier", "later", "outdoorsy", "indoorsy")
            - remix_hint: str              (free-form vibe redirection like "we want tacos")
         When ANY of those is set, response includes was_remix=true. Verify:
            a. Plain suggest call (no remix fields) still works exactly as before.
            b. Suggest with remix_presets=["cheaper", "different_neighborhood"] + previous_cards
               from a prior call → returns cards, was_remix=true, and venues differ from previous_cards.
            c. Suggest with only remix_hint="we want tacos no bars" → cards lean toward food/tacos.
            d. Empty/garbage in remix_presets is silently ignored (only known keys honored).
         Gemini calls still take 10-25s — keep timeouts generous.
      
      2) SINGLE-EVENT .ICS EXPORT — new GET /api/groups/{code}/hangouts/{hid}/event.ics
         Verify:
            a. Returns 200, Content-Type "text/calendar", Content-Disposition: attachment.
            b. Body is a valid iCalendar (BEGIN:VCALENDAR ... END:VCALENDAR) with exactly one VEVENT.
            c. SUMMARY contains the hangout title; if hangout.status="tentative", title is prefixed
               with "[tentative] " and STATUS:TENTATIVE; if "locked", STATUS:CONFIRMED.
            d. 404 when group OR hangout id is missing.
         To set up: create a group, create a hangout via existing POST /api/groups/{code}/hangouts.
      
      Smoke-test group: code N7UVGL ("Weekend Warriors", Brooklyn, NY) — already exists.
      All other prior endpoints unchanged. Please don't re-run the full Phase-2 suite, just these two.
  - agent: "testing"
    message: |
      ✅ TESTING COMPLETE - Both new backend features fully verified and working:
      
      1) ASTRAL REMIX MODE (5/5 scenarios passed):
         - Plain suggest (no remix) → was_remix=false ✅
         - Remix with presets + previous_cards → was_remix=true, no repeated venues ✅
         - Remix with hint only → was_remix=true, food-focused results ✅
         - Garbage presets filtered → was_remix=true, only valid applied ✅
         - Empty remix fields → was_remix=false (non-remix) ✅
      
      2) SINGLE-EVENT .ICS EXPORT (6/6 scenarios passed):
         - GET returns 200 with correct headers (text/calendar, attachment) ✅
         - Valid iCalendar structure (1 VEVENT, all required fields) ✅
         - Tentative status → [tentative] prefix + STATUS:TENTATIVE ✅
         - Locked status → no prefix + STATUS:CONFIRMED ✅
         - 404 for non-existent group ✅
         - 404 for non-existent hangout ✅
      
      All tests executed against production URL. No issues found. Both features ready for use.
