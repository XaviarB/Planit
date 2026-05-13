"""
Phase-6 Backend Testing Suite
Tests for:
1. POST /api/groups/{code}/astral/parse-busy with mode parameter
2. POST /api/groups/{code}/astral/suggest with astral_persona_override
"""
import httpx
import asyncio
import json
from datetime import datetime, timezone

# Backend URL from environment
BACKEND_URL = "https://slider-preview-2.preview.emergentagent.com/api"

class Colors:
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    END = '\033[0m'

def log_test(name, passed, details=""):
    status = f"{Colors.GREEN}✓ PASS{Colors.END}" if passed else f"{Colors.RED}✗ FAIL{Colors.END}"
    print(f"{status} | {name}")
    if details:
        print(f"      {details}")

def log_section(title):
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}{title}{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")

async def create_test_group():
    """Create a fresh test group for testing"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups",
            json={
                "group_name": "Phase-6 Test Group",
                "creator_name": "Test User",
                "location": "Brooklyn, NY"
            }
        )
        if resp.status_code != 200:
            raise Exception(f"Failed to create group: {resp.status_code} {resp.text}")
        data = resp.json()
        return data["group"]["code"], data["member_id"]

async def add_member_with_slots(code, member_name, slots):
    """Add a member to the group and set their availability slots"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Join group
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/members",
            json={"name": member_name}
        )
        if resp.status_code != 200:
            raise Exception(f"Failed to add member: {resp.status_code}")
        member_id = resp.json()["member_id"]
        
        # Set slots
        resp = await client.put(
            f"{BACKEND_URL}/groups/{code}/members/{member_id}/slots",
            json={"slots": slots}
        )
        if resp.status_code != 200:
            raise Exception(f"Failed to set slots: {resp.status_code}")
        
        return member_id

# =============================================================================
# ENDPOINT 1: POST /api/groups/{code}/astral/parse-busy with mode parameter
# =============================================================================

async def test_parse_busy_mode_weekly_all_week():
    """Test A: mode=weekly with 'working all week 2pm to 6pm'"""
    log_section("TEST A: parse-busy mode=weekly - all week 2pm to 6pm")
    
    code, _ = await create_test_group()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/parse-busy",
            json={
                "text": "working all week 2pm to 6pm",
                "mode": "weekly"
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Check response shape
        has_slots = "slots" in data
        has_count = "count" in data
        has_mode = "mode" in data
        log_test("Response has slots, count, mode", has_slots and has_count and has_mode)
        
        # Check mode
        mode_correct = data.get("mode") == "weekly"
        log_test("mode='weekly'", mode_correct, f"Got: {data.get('mode')}")
        
        # Check slot count (expect ~20-28 slots: 7 days × 4 hours = 28)
        slots = data.get("slots", [])
        count = len(slots)
        count_ok = 20 <= count <= 28
        log_test(f"Slot count in range [20, 28]", count_ok, f"Got: {count} slots")
        
        # Check all slots have mode=weekly
        all_weekly = all(s.get("mode") == "weekly" for s in slots)
        log_test("All slots have mode='weekly'", all_weekly)
        
        # Check all slots have key in {d0..d6}
        valid_keys = {f"d{i}" for i in range(7)}
        all_valid_keys = all(s.get("key") in valid_keys for s in slots)
        log_test("All slots have key in {d0..d6}", all_valid_keys)
        
        # Check hours are in [14, 17] (2pm-6pm = hours 14, 15, 16, 17)
        all_hours_ok = all(14 <= s.get("hour", -1) <= 17 for s in slots)
        log_test("All slots have hour in [14, 17]", all_hours_ok)
        
        # Check all slots have status=busy
        all_busy = all(s.get("status") == "busy" for s in slots)
        log_test("All slots have status='busy'", all_busy)
        
        # Print sample slots
        print(f"\n      Sample slots (first 3):")
        for s in slots[:3]:
            print(f"        {s}")
        
        return all([passed, has_slots, has_count, has_mode, mode_correct, 
                   count_ok, all_weekly, all_valid_keys, all_hours_ok, all_busy])

async def test_parse_busy_mode_weekly_weekdays():
    """Test B: mode=weekly with 'weekdays 9 to 5'"""
    log_section("TEST B: parse-busy mode=weekly - weekdays 9 to 5")
    
    code, _ = await create_test_group()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/parse-busy",
            json={
                "text": "weekdays 9 to 5",
                "mode": "weekly"
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        slots = data.get("slots", [])
        
        # Check all slots are weekdays only (d0-d4, no d5/d6)
        weekday_keys = {f"d{i}" for i in range(5)}  # d0-d4
        all_weekdays = all(s.get("key") in weekday_keys for s in slots)
        log_test("All slots are weekdays only (d0-d4)", all_weekdays)
        
        # Check no weekend slots
        no_weekend = not any(s.get("key") in {"d5", "d6"} for s in slots)
        log_test("No weekend slots (d5, d6)", no_weekend)
        
        # Check hours are in [9, 16] (9am-5pm = hours 9-16)
        all_hours_ok = all(9 <= s.get("hour", -1) <= 16 for s in slots)
        log_test("All slots have hour in [9, 16]", all_hours_ok)
        
        # Print sample slots
        print(f"\n      Sample slots (first 3):")
        for s in slots[:3]:
            print(f"        {s}")
        
        return all([passed, all_weekdays, no_weekend, all_hours_ok])

async def test_parse_busy_mode_date():
    """Test C: mode=date with 'I'm busy this Saturday from 6pm to 9pm'"""
    log_section("TEST C: parse-busy mode=date - this Saturday 6pm to 9pm")
    
    code, _ = await create_test_group()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/parse-busy",
            json={
                "text": "I'm busy this Saturday from 6pm to 9pm",
                "mode": "date"
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Check mode
        mode_correct = data.get("mode") == "date"
        log_test("mode='date'", mode_correct, f"Got: {data.get('mode')}")
        
        slots = data.get("slots", [])
        
        # Check all slots have mode=date
        all_date = all(s.get("mode") == "date" for s in slots)
        log_test("All slots have mode='date'", all_date)
        
        # Check all slots have key like YYYY-MM-DD
        all_iso_dates = all(
            len(s.get("key", "")) == 10 and s.get("key", "")[4] == "-" and s.get("key", "")[7] == "-"
            for s in slots
        )
        log_test("All slots have key like YYYY-MM-DD", all_iso_dates)
        
        # Check hours are in [18, 20] (6pm-9pm = hours 18, 19, 20)
        all_hours_ok = all(18 <= s.get("hour", -1) <= 20 for s in slots)
        log_test("All slots have hour in [18, 20]", all_hours_ok)
        
        # Print sample slots
        print(f"\n      Sample slots:")
        for s in slots:
            print(f"        {s}")
        
        return all([passed, mode_correct, all_date, all_iso_dates, all_hours_ok])

async def test_parse_busy_mode_weekly_empty():
    """Test D: mode=weekly with empty text"""
    log_section("TEST D: parse-busy mode=weekly - empty text")
    
    code, _ = await create_test_group()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/parse-busy",
            json={
                "text": "",
                "mode": "weekly"
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Check empty response
        slots = data.get("slots", [])
        count = data.get("count", -1)
        mode = data.get("mode", "")
        
        empty_slots = len(slots) == 0
        zero_count = count == 0
        mode_weekly = mode == "weekly"
        
        log_test("slots=[]", empty_slots, f"Got: {len(slots)} slots")
        log_test("count=0", zero_count, f"Got: {count}")
        log_test("mode='weekly'", mode_weekly, f"Got: {mode}")
        
        return all([passed, empty_slots, zero_count, mode_weekly])

async def test_parse_busy_mode_invalid():
    """Test E: mode=invalid (should default to 'date')"""
    log_section("TEST E: parse-busy mode=invalid - should default to date")
    
    code, _ = await create_test_group()
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/parse-busy",
            json={
                "text": "busy tomorrow 3pm to 5pm",
                "mode": "garbage"
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200 (no 500)", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Should default to "date" mode
        mode_date = data.get("mode") == "date"
        log_test("Defaults to mode='date'", mode_date, f"Got: {data.get('mode')}")
        
        return all([passed, mode_date])

# =============================================================================
# ENDPOINT 2: POST /api/groups/{code}/astral/suggest with astral_persona_override
# =============================================================================

async def test_suggest_basic_no_override():
    """Test F: Basic suggest without override"""
    log_section("TEST F: suggest - basic call without override")
    
    code, member_id = await create_test_group()
    
    # Add some availability slots so suggest has context
    slots = [
        {"mode": "date", "key": "2025-07-12", "hour": 19, "minute": 0, "step": 60, "status": "free"},
        {"mode": "date", "key": "2025-07-12", "hour": 20, "minute": 0, "step": 60, "status": "free"},
    ]
    await add_member_with_slots(code, "Alice", slots)
    await add_member_with_slots(code, "Bob", slots)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/suggest",
            json={
                "window_blurb": "Saturday 7-11pm",
                "location_override": "Brooklyn, NY"
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Check response shape
        has_intro = "intro" in data
        has_cards = "cards" in data
        has_options = isinstance(data.get("cards"), list)
        
        log_test("Response has intro", has_intro)
        log_test("Response has cards (list)", has_cards and has_options)
        
        cards = data.get("cards", [])
        cards_ok = len(cards) > 0
        log_test(f"Cards returned", cards_ok, f"Got: {len(cards)} cards")
        
        # Print sample
        if cards:
            print(f"\n      Sample card:")
            print(f"        venue: {cards[0].get('venue')}")
            print(f"        category: {cards[0].get('category')}")
            print(f"        buzz: {cards[0].get('buzz', {}).get('quote', '')[:60]}...")
        
        return all([passed, has_intro, has_cards, has_options, cards_ok])

async def test_suggest_with_tone_override():
    """Test G: suggest with astral_persona_override tone=warm"""
    log_section("TEST G: suggest - with astral_persona_override tone=warm")
    
    code, member_id = await create_test_group()
    
    # Add some availability
    slots = [
        {"mode": "date", "key": "2025-07-12", "hour": 19, "minute": 0, "step": 60, "status": "free"},
    ]
    await add_member_with_slots(code, "Charlie", slots)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/suggest",
            json={
                "window_blurb": "Friday evening",
                "location_override": "Manhattan, NY",
                "astral_persona_override": {
                    "tone": "warm"
                }
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Check response shape (should not fail)
        has_cards = isinstance(data.get("cards"), list)
        log_test("Response has cards (list)", has_cards)
        
        cards_ok = len(data.get("cards", [])) > 0
        log_test("Cards returned", cards_ok, f"Got: {len(data.get('cards', []))} cards")
        
        return all([passed, has_cards, cards_ok])

async def test_suggest_with_location_override():
    """Test H: suggest with astral_persona_override default_location"""
    log_section("TEST H: suggest - with astral_persona_override default_location")
    
    # Create group WITHOUT location
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups",
            json={
                "group_name": "No Location Group",
                "creator_name": "Test User"
                # No location field
            }
        )
        data = resp.json()
        code = data["group"]["code"]
    
    # Add some availability
    slots = [
        {"mode": "date", "key": "2025-07-12", "hour": 19, "minute": 0, "step": 60, "status": "free"},
    ]
    await add_member_with_slots(code, "Dave", slots)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/suggest",
            json={
                "window_blurb": "Saturday night",
                "astral_persona_override": {
                    "default_location": "Brooklyn, NY"
                }
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Check response works
        has_cards = isinstance(data.get("cards"), list)
        log_test("Response has cards (list)", has_cards)
        
        # Check location chain wiring (used_location should reflect override)
        used_location = data.get("used_location", "")
        location_ok = "Brooklyn" in used_location or used_location == "Brooklyn, NY"
        log_test("Location chain wiring works", location_ok, f"used_location: {used_location}")
        
        return all([passed, has_cards, location_ok])

async def test_suggest_with_empty_override():
    """Test I: suggest with astral_persona_override = {}"""
    log_section("TEST I: suggest - with astral_persona_override = {}")
    
    code, member_id = await create_test_group()
    
    slots = [
        {"mode": "date", "key": "2025-07-12", "hour": 19, "minute": 0, "step": 60, "status": "free"},
    ]
    await add_member_with_slots(code, "Eve", slots)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/suggest",
            json={
                "window_blurb": "Sunday brunch",
                "location_override": "Brooklyn, NY",
                "astral_persona_override": {}
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Should work same as no override
        has_cards = isinstance(data.get("cards"), list)
        log_test("Response has cards (same as no override)", has_cards)
        
        return all([passed, has_cards])

async def test_suggest_with_null_override():
    """Test J: suggest with astral_persona_override = null"""
    log_section("TEST J: suggest - with astral_persona_override = null")
    
    code, member_id = await create_test_group()
    
    slots = [
        {"mode": "date", "key": "2025-07-12", "hour": 19, "minute": 0, "step": 60, "status": "free"},
    ]
    await add_member_with_slots(code, "Frank", slots)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/suggest",
            json={
                "window_blurb": "Monday evening",
                "location_override": "Brooklyn, NY",
                "astral_persona_override": None
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Should work same as no override
        has_cards = isinstance(data.get("cards"), list)
        log_test("Response has cards (same as no override)", has_cards)
        
        return all([passed, has_cards])

async def test_suggest_with_unknown_key():
    """Test K: suggest with unknown key in override"""
    log_section("TEST K: suggest - with unknown key in override")
    
    code, member_id = await create_test_group()
    
    slots = [
        {"mode": "date", "key": "2025-07-12", "hour": 19, "minute": 0, "step": 60, "status": "free"},
    ]
    await add_member_with_slots(code, "Grace", slots)
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{BACKEND_URL}/groups/{code}/astral/suggest",
            json={
                "window_blurb": "Tuesday night",
                "location_override": "Brooklyn, NY",
                "astral_persona_override": {
                    "foo": "bar",
                    "unknown_field": "should be ignored"
                }
            }
        )
        
        passed = resp.status_code == 200
        log_test("Status code 200 (no 500)", passed)
        
        if not passed:
            print(f"Response: {resp.status_code} {resp.text}")
            return False
        
        data = resp.json()
        
        # Should work (unknown keys silently ignored)
        has_cards = isinstance(data.get("cards"), list)
        log_test("Response has cards (unknown keys ignored)", has_cards)
        
        return all([passed, has_cards])

# =============================================================================
# Main test runner
# =============================================================================

async def main():
    print(f"\n{Colors.BLUE}{'='*80}{Colors.END}")
    print(f"{Colors.BLUE}Phase-6 Backend Testing Suite{Colors.END}")
    print(f"{Colors.BLUE}Backend URL: {BACKEND_URL}{Colors.END}")
    print(f"{Colors.BLUE}{'='*80}{Colors.END}")
    
    results = {}
    
    # ENDPOINT 1: parse-busy tests
    try:
        results["A_weekly_all_week"] = await test_parse_busy_mode_weekly_all_week()
    except Exception as e:
        print(f"{Colors.RED}Test A failed with exception: {e}{Colors.END}")
        results["A_weekly_all_week"] = False
    
    try:
        results["B_weekly_weekdays"] = await test_parse_busy_mode_weekly_weekdays()
    except Exception as e:
        print(f"{Colors.RED}Test B failed with exception: {e}{Colors.END}")
        results["B_weekly_weekdays"] = False
    
    try:
        results["C_date_mode"] = await test_parse_busy_mode_date()
    except Exception as e:
        print(f"{Colors.RED}Test C failed with exception: {e}{Colors.END}")
        results["C_date_mode"] = False
    
    try:
        results["D_weekly_empty"] = await test_parse_busy_mode_weekly_empty()
    except Exception as e:
        print(f"{Colors.RED}Test D failed with exception: {e}{Colors.END}")
        results["D_weekly_empty"] = False
    
    try:
        results["E_invalid_mode"] = await test_parse_busy_mode_invalid()
    except Exception as e:
        print(f"{Colors.RED}Test E failed with exception: {e}{Colors.END}")
        results["E_invalid_mode"] = False
    
    # ENDPOINT 2: suggest with persona override tests
    try:
        results["F_suggest_basic"] = await test_suggest_basic_no_override()
    except Exception as e:
        print(f"{Colors.RED}Test F failed with exception: {e}{Colors.END}")
        results["F_suggest_basic"] = False
    
    try:
        results["G_suggest_tone"] = await test_suggest_with_tone_override()
    except Exception as e:
        print(f"{Colors.RED}Test G failed with exception: {e}{Colors.END}")
        results["G_suggest_tone"] = False
    
    try:
        results["H_suggest_location"] = await test_suggest_with_location_override()
    except Exception as e:
        print(f"{Colors.RED}Test H failed with exception: {e}{Colors.END}")
        results["H_suggest_location"] = False
    
    try:
        results["I_suggest_empty"] = await test_suggest_with_empty_override()
    except Exception as e:
        print(f"{Colors.RED}Test I failed with exception: {e}{Colors.END}")
        results["I_suggest_empty"] = False
    
    try:
        results["J_suggest_null"] = await test_suggest_with_null_override()
    except Exception as e:
        print(f"{Colors.RED}Test J failed with exception: {e}{Colors.END}")
        results["J_suggest_null"] = False
    
    try:
        results["K_suggest_unknown"] = await test_suggest_with_unknown_key()
    except Exception as e:
        print(f"{Colors.RED}Test K failed with exception: {e}{Colors.END}")
        results["K_suggest_unknown"] = False
    
    # Summary
    log_section("TEST SUMMARY")
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    print(f"\nResults: {passed}/{total} tests passed\n")
    
    for test_name, result in results.items():
        status = f"{Colors.GREEN}✓{Colors.END}" if result else f"{Colors.RED}✗{Colors.END}"
        print(f"  {status} {test_name}")
    
    if passed == total:
        print(f"\n{Colors.GREEN}{'='*80}{Colors.END}")
        print(f"{Colors.GREEN}ALL TESTS PASSED ✓{Colors.END}")
        print(f"{Colors.GREEN}{'='*80}{Colors.END}\n")
    else:
        print(f"\n{Colors.RED}{'='*80}{Colors.END}")
        print(f"{Colors.RED}SOME TESTS FAILED ✗{Colors.END}")
        print(f"{Colors.RED}{'='*80}{Colors.END}\n")
    
    return passed == total

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)
