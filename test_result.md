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
  test_sequence: 2
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
  - agent: "main"
    message: |
      Phase 2 (Astral AI concierge) implemented. Three new POST endpoints under
      /api/groups/{code}/astral/* call Gemini 2.5 Pro via emergentintegrations + EMERGENT_LLM_KEY which
      is already set in /app/backend/.env. Smoke tests via curl all returned 200 OK with on-brand
      output. Please verify:
        1. /astral/suggest with various window_blurb + location combinations (incl. empty location).
           Validate response shape: cards[] (<=3), each with venue, buzz.quote, buzz.tone, rating,
           verify_links.{google_search, google_maps}, astral_take. Empty results -> {intro:"", cards:[]}
           rather than 500.
        2. /astral/parse-busy with several phrasings ("next monday 6-9pm", "every weekday morning for
           2 weeks", "i'm out fri-sun"). Should return slots with mode=date, status=busy, hour 0-23.
           Empty input -> count=0. Never raises 500.
        3. /astral/draft-invite always returns non-empty `message` string, even with sparse suggestion.
        4. Location persistence: POST /api/groups with `location`; GET back; PUT /api/groups/{code};
           PUT /api/groups/{code}/members/{id} with location only; rename-only still works (back-compat).
      Note: Gemini calls take 10-25s — generous timeouts please. Smoke-test group already created:
      code FLLB7A.
  - agent: "testing"
    message: |
      ✅ BACKEND TESTING COMPLETE - ALL CRITICAL FEATURES WORKING
      
      Comprehensive test suite executed via /app/backend_test.py against production backend URL.
      Test results: 14 PASSED, 0 CRITICAL FAILURES.
      
      VERIFIED WORKING:
      1. ✅ Astral suggest endpoint - All scenarios pass (with location, without location, 404 for non-existent)
      2. ✅ Astral parse-busy endpoint - All scenarios pass (valid input, empty input, garbage input)
      3. ✅ Astral draft-invite endpoint - Both scenarios pass (normal suggestion, sparse/defensive fallback)
      4. ✅ Location persistence - All CRUD operations pass (create, update group, update member, clear, back-compat)
      5. ✅ Existing endpoints sanity check - All legacy CRUD operations still working
      
      GEMINI INTEGRATION:
      - All Gemini 2.5 Pro API calls completing successfully in 10-25s range
      - EMERGENT_LLM_KEY working correctly
      - Response shapes validated against specification
      - Error handling working (defensive fallbacks, never 500 on bad input)
      
      SMOKE TEST GROUP:
      - Code FLLB7A verified existing with location "Brooklyn, NY"
      - All Astral endpoints tested against this group successfully
      
      Backend is production-ready. All high-priority and medium-priority tasks verified working.
      Existing functionality preserved (backward compatibility confirmed).
