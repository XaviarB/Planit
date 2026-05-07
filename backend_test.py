#!/usr/bin/env python3
"""
Backend test suite for Planit Phase 2 - NEW features only:
1. Astral remix mode (POST /api/groups/{code}/astral/suggest with remix fields)
2. Single-event .ics export (GET /api/groups/{code}/hangouts/{hid}/event.ics)
"""
import asyncio
import os
import sys
import httpx
from datetime import datetime, timezone, timedelta

# Read backend URL from frontend/.env
BACKEND_URL = None
try:
    with open('/app/frontend/.env', 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                BACKEND_URL = line.split('=', 1)[1].strip()
                break
except Exception as e:
    print(f"❌ Failed to read BACKEND_URL from /app/frontend/.env: {e}")
    sys.exit(1)

if not BACKEND_URL:
    print("❌ REACT_APP_BACKEND_URL not found in /app/frontend/.env")
    sys.exit(1)

API_BASE = f"{BACKEND_URL}/api"
print(f"🔗 Testing against: {API_BASE}\n")

# Test group - can use existing or create new
SMOKE_TEST_GROUP = "N7UVGL"  # Weekend Warriors, Brooklyn, NY


class TestResults:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append((test_name, details))
        print(f"✅ {test_name}")
        if details:
            print(f"   {details}")
    
    def add_fail(self, test_name: str, reason: str):
        self.failed.append((test_name, reason))
        print(f"❌ {test_name}")
        print(f"   REASON: {reason}")
    
    def add_warning(self, test_name: str, message: str):
        self.warnings.append((test_name, message))
        print(f"⚠️  {test_name}")
        print(f"   {message}")
    
    def summary(self):
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"✅ Passed: {len(self.passed)}")
        print(f"❌ Failed: {len(self.failed)}")
        print(f"⚠️  Warnings: {len(self.warnings)}")
        
        if self.failed:
            print("\n❌ FAILED TESTS:")
            for name, reason in self.failed:
                print(f"  - {name}")
                print(f"    {reason}")
        
        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for name, msg in self.warnings:
                print(f"  - {name}: {msg}")
        
        return len(self.failed) == 0


results = TestResults()


async def test_astral_remix_mode():
    """Test suite for Astral remix mode functionality"""
    print("\n" + "="*80)
    print("TEST SUITE 1: ASTRAL REMIX MODE")
    print("="*80 + "\n")
    
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Verify group exists
        try:
            resp = await client.get(f"{API_BASE}/groups/{SMOKE_TEST_GROUP}")
            if resp.status_code != 200:
                results.add_fail(
                    "Remix: Group verification",
                    f"Group {SMOKE_TEST_GROUP} not found (status {resp.status_code})"
                )
                return
            group = resp.json()
            results.add_pass("Remix: Group verification", f"Group '{group.get('name')}' found")
        except Exception as e:
            results.add_fail("Remix: Group verification", f"Exception: {e}")
            return
        
        # Test 1a: Plain suggest call (no remix fields) - baseline
        print("\n📋 Test 1a: Plain suggest (no remix fields)")
        try:
            payload = {
                "window_blurb": "Saturday 7-11pm"
            }
            resp = await client.post(
                f"{API_BASE}/groups/{SMOKE_TEST_GROUP}/astral/suggest",
                json=payload,
                timeout=45.0
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "Remix 1a: Plain suggest",
                    f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
                )
                return
            
            data = resp.json()
            
            # Verify response structure
            if "cards" not in data:
                results.add_fail("Remix 1a: Plain suggest", "Missing 'cards' in response")
                return
            
            if "was_remix" not in data:
                results.add_fail("Remix 1a: Plain suggest", "Missing 'was_remix' in response")
                return
            
            if data["was_remix"] != False:
                results.add_fail(
                    "Remix 1a: Plain suggest",
                    f"Expected was_remix=false, got {data['was_remix']}"
                )
                return
            
            cards = data["cards"]
            if not isinstance(cards, list) or len(cards) > 3:
                results.add_fail(
                    "Remix 1a: Plain suggest",
                    f"Expected cards list with ≤3 items, got {len(cards) if isinstance(cards, list) else 'not a list'}"
                )
                return
            
            if len(cards) == 0:
                results.add_warning(
                    "Remix 1a: Plain suggest",
                    "Gemini returned 0 cards (may be API issue, not code bug)"
                )
            
            # Verify card structure
            for i, card in enumerate(cards):
                required_fields = ["venue", "category", "neighborhood", "vibe_tags", "buzz", 
                                 "rating", "review_count_approx", "price_level", "what_to_order",
                                 "astral_take", "warnings", "good_for", "verify_links"]
                missing = [f for f in required_fields if f not in card]
                if missing:
                    results.add_fail(
                        "Remix 1a: Plain suggest",
                        f"Card {i} missing fields: {missing}"
                    )
                    return
            
            # Store cards for next test
            baseline_cards = cards
            baseline_venues = [c["venue"] for c in cards]
            
            results.add_pass(
                "Remix 1a: Plain suggest",
                f"was_remix=false, {len(cards)} cards returned, all fields present"
            )
            
        except httpx.TimeoutException:
            results.add_fail("Remix 1a: Plain suggest", "Request timeout (>45s)")
            return
        except Exception as e:
            results.add_fail("Remix 1a: Plain suggest", f"Exception: {e}")
            return
        
        # Test 1b: Remix with previous_cards + remix_presets
        print("\n📋 Test 1b: Remix with previous_cards + remix_presets")
        try:
            payload = {
                "window_blurb": "Saturday 7-11pm",
                "previous_cards": baseline_cards,
                "remix_presets": ["cheaper", "different_neighborhood"]
            }
            resp = await client.post(
                f"{API_BASE}/groups/{SMOKE_TEST_GROUP}/astral/suggest",
                json=payload,
                timeout=45.0
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "Remix 1b: With presets",
                    f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
                )
                return
            
            data = resp.json()
            
            if data.get("was_remix") != True:
                results.add_fail(
                    "Remix 1b: With presets",
                    f"Expected was_remix=true, got {data.get('was_remix')}"
                )
                return
            
            remix_cards = data.get("cards", [])
            remix_venues = [c["venue"] for c in remix_cards]
            
            # Verify no venue names from baseline appear in remix
            repeated = [v for v in remix_venues if v in baseline_venues]
            if repeated:
                results.add_fail(
                    "Remix 1b: With presets",
                    f"Venues repeated from previous cards: {repeated}"
                )
                return
            
            results.add_pass(
                "Remix 1b: With presets",
                f"was_remix=true, {len(remix_cards)} new cards, no repeated venues"
            )
            
        except httpx.TimeoutException:
            results.add_fail("Remix 1b: With presets", "Request timeout (>45s)")
            return
        except Exception as e:
            results.add_fail("Remix 1b: With presets", f"Exception: {e}")
            return
        
        # Test 1c: Remix with only remix_hint (food-focused)
        print("\n📋 Test 1c: Remix with remix_hint only (food focus)")
        try:
            payload = {
                "window_blurb": "Saturday 7-11pm",
                "previous_cards": baseline_cards,
                "remix_hint": "we want tacos no bars"
            }
            resp = await client.post(
                f"{API_BASE}/groups/{SMOKE_TEST_GROUP}/astral/suggest",
                json=payload,
                timeout=45.0
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "Remix 1c: With hint",
                    f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
                )
                return
            
            data = resp.json()
            
            if data.get("was_remix") != True:
                results.add_fail(
                    "Remix 1c: With hint",
                    f"Expected was_remix=true, got {data.get('was_remix')}"
                )
                return
            
            hint_cards = data.get("cards", [])
            
            # Check if at least 1 card is food-related
            food_categories = ["restaurant", "cafe", "other"]
            food_cards = [c for c in hint_cards if c.get("category", "").lower() in food_categories]
            
            if len(food_cards) == 0:
                results.add_warning(
                    "Remix 1c: With hint",
                    "No food-related cards found (expected at least 1 for 'tacos' hint)"
                )
            else:
                results.add_pass(
                    "Remix 1c: With hint",
                    f"was_remix=true, {len(food_cards)}/{len(hint_cards)} cards are food-related"
                )
            
        except httpx.TimeoutException:
            results.add_fail("Remix 1c: With hint", "Request timeout (>45s)")
            return
        except Exception as e:
            results.add_fail("Remix 1c: With hint", f"Exception: {e}")
            return
        
        # Test 1d: Garbage in remix_presets (should be filtered)
        print("\n📋 Test 1d: Garbage remix_presets (should filter)")
        try:
            payload = {
                "window_blurb": "Saturday 7-11pm",
                "remix_presets": ["bogus_preset", "cheaper", "invalid_chip"]
            }
            resp = await client.post(
                f"{API_BASE}/groups/{SMOKE_TEST_GROUP}/astral/suggest",
                json=payload,
                timeout=45.0
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "Remix 1d: Garbage presets",
                    f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
                )
                return
            
            data = resp.json()
            
            # Should still return was_remix=true because "cheaper" is valid
            if data.get("was_remix") != True:
                results.add_fail(
                    "Remix 1d: Garbage presets",
                    f"Expected was_remix=true (valid preset 'cheaper' present), got {data.get('was_remix')}"
                )
                return
            
            results.add_pass(
                "Remix 1d: Garbage presets",
                "Invalid presets silently filtered, valid preset applied, was_remix=true"
            )
            
        except httpx.TimeoutException:
            results.add_fail("Remix 1d: Garbage presets", "Request timeout (>45s)")
            return
        except Exception as e:
            results.add_fail("Remix 1d: Garbage presets", f"Exception: {e}")
            return
        
        # Test 1e: Empty remix fields (should be non-remix)
        print("\n📋 Test 1e: Empty remix fields (should be non-remix)")
        try:
            payload = {
                "window_blurb": "Saturday 7-11pm",
                "previous_cards": [],
                "remix_presets": [],
                "remix_hint": ""
            }
            resp = await client.post(
                f"{API_BASE}/groups/{SMOKE_TEST_GROUP}/astral/suggest",
                json=payload,
                timeout=45.0
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "Remix 1e: Empty fields",
                    f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
                )
                return
            
            data = resp.json()
            
            if data.get("was_remix") != False:
                results.add_fail(
                    "Remix 1e: Empty fields",
                    f"Expected was_remix=false (all remix fields empty), got {data.get('was_remix')}"
                )
                return
            
            results.add_pass(
                "Remix 1e: Empty fields",
                "Empty remix fields treated as non-remix, was_remix=false"
            )
            
        except httpx.TimeoutException:
            results.add_fail("Remix 1e: Empty fields", "Request timeout (>45s)")
            return
        except Exception as e:
            results.add_fail("Remix 1e: Empty fields", f"Exception: {e}")
            return


async def test_single_event_ics():
    """Test suite for single-event .ics export functionality"""
    print("\n" + "="*80)
    print("TEST SUITE 2: SINGLE-EVENT .ICS EXPORT")
    print("="*80 + "\n")
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        # Create a test group for hangout testing
        print("📋 Setup: Creating test group")
        try:
            resp = await client.post(
                f"{API_BASE}/groups",
                json={
                    "group_name": "ICS Test Group",
                    "creator_name": "Test User",
                    "location": "Brooklyn, NY"
                }
            )
            if resp.status_code != 200:
                results.add_fail(
                    "ICS Setup: Create group",
                    f"Failed to create test group: {resp.status_code}"
                )
                return
            
            group_data = resp.json()
            test_group_code = group_data["group"]["code"]
            results.add_pass("ICS Setup: Create group", f"Test group {test_group_code} created")
            
        except Exception as e:
            results.add_fail("ICS Setup: Create group", f"Exception: {e}")
            return
        
        # Create a tentative hangout
        print("\n📋 Setup: Creating tentative hangout")
        try:
            start_time = datetime.now(timezone.utc) + timedelta(days=7)
            end_time = start_time + timedelta(hours=3)
            
            resp = await client.post(
                f"{API_BASE}/groups/{test_group_code}/hangouts",
                json={
                    "title": "Test Hangout - Tentative",
                    "start_iso": start_time.isoformat(),
                    "end_iso": end_time.isoformat(),
                    "status": "tentative",
                    "location_name": "Test Venue",
                    "address": "123 Test St, Brooklyn, NY"
                }
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "ICS Setup: Create hangout",
                    f"Failed to create hangout: {resp.status_code}"
                )
                return
            
            hangout_data = resp.json()
            tentative_hangout_id = hangout_data["id"]
            results.add_pass("ICS Setup: Create hangout", f"Tentative hangout {tentative_hangout_id} created")
            
        except Exception as e:
            results.add_fail("ICS Setup: Create hangout", f"Exception: {e}")
            return
        
        # Test 2a: GET .ics returns 200 with correct headers
        print("\n📋 Test 2a: GET .ics returns 200 with correct headers")
        try:
            resp = await client.get(
                f"{API_BASE}/groups/{test_group_code}/hangouts/{tentative_hangout_id}/event.ics"
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "ICS 2a: Basic GET",
                    f"Expected 200, got {resp.status_code}"
                )
                return
            
            # Check Content-Type
            content_type = resp.headers.get("content-type", "")
            if not content_type.startswith("text/calendar"):
                results.add_fail(
                    "ICS 2a: Basic GET",
                    f"Expected Content-Type 'text/calendar', got '{content_type}'"
                )
                return
            
            # Check Content-Disposition
            content_disp = resp.headers.get("content-disposition", "")
            if not content_disp.startswith("attachment"):
                results.add_fail(
                    "ICS 2a: Basic GET",
                    f"Expected Content-Disposition 'attachment', got '{content_disp}'"
                )
                return
            
            if ".ics" not in content_disp:
                results.add_fail(
                    "ICS 2a: Basic GET",
                    f"Expected .ics filename in Content-Disposition, got '{content_disp}'"
                )
                return
            
            # Store body for further tests
            ics_body = resp.text
            
            results.add_pass(
                "ICS 2a: Basic GET",
                f"200 OK, Content-Type: {content_type}, Content-Disposition: attachment with .ics"
            )
            
        except Exception as e:
            results.add_fail("ICS 2a: Basic GET", f"Exception: {e}")
            return
        
        # Test 2b: Validate iCalendar structure
        print("\n📋 Test 2b: Validate iCalendar structure")
        try:
            if "BEGIN:VCALENDAR" not in ics_body:
                results.add_fail("ICS 2b: Structure", "Missing 'BEGIN:VCALENDAR'")
                return
            
            if "END:VCALENDAR" not in ics_body:
                results.add_fail("ICS 2b: Structure", "Missing 'END:VCALENDAR'")
                return
            
            if "BEGIN:VEVENT" not in ics_body:
                results.add_fail("ICS 2b: Structure", "Missing 'BEGIN:VEVENT'")
                return
            
            if "END:VEVENT" not in ics_body:
                results.add_fail("ICS 2b: Structure", "Missing 'END:VEVENT'")
                return
            
            # Count VEVENTs (should be exactly 1)
            vevent_count = ics_body.count("BEGIN:VEVENT")
            if vevent_count != 1:
                results.add_fail(
                    "ICS 2b: Structure",
                    f"Expected exactly 1 VEVENT, found {vevent_count}"
                )
                return
            
            # Check required VEVENT fields
            required_fields = ["DTSTART", "DTEND", "SUMMARY", "UID"]
            missing_fields = [f for f in required_fields if f not in ics_body]
            if missing_fields:
                results.add_fail(
                    "ICS 2b: Structure",
                    f"Missing required VEVENT fields: {missing_fields}"
                )
                return
            
            results.add_pass(
                "ICS 2b: Structure",
                "Valid iCalendar with 1 VEVENT containing all required fields"
            )
            
        except Exception as e:
            results.add_fail("ICS 2b: Structure", f"Exception: {e}")
            return
        
        # Test 2c: Verify tentative status
        print("\n📋 Test 2c: Verify tentative status")
        try:
            if "[tentative]" not in ics_body.lower():
                results.add_fail(
                    "ICS 2c: Tentative status",
                    "SUMMARY should contain '[tentative]' prefix for tentative hangout"
                )
                return
            
            if "STATUS:TENTATIVE" not in ics_body:
                results.add_fail(
                    "ICS 2c: Tentative status",
                    "Missing 'STATUS:TENTATIVE' for tentative hangout"
                )
                return
            
            if "Test Hangout - Tentative" not in ics_body:
                results.add_warning(
                    "ICS 2c: Tentative status",
                    "Hangout title not found in SUMMARY (may be formatted differently)"
                )
            
            results.add_pass(
                "ICS 2c: Tentative status",
                "SUMMARY has '[tentative]' prefix and STATUS:TENTATIVE present"
            )
            
        except Exception as e:
            results.add_fail("ICS 2c: Tentative status", f"Exception: {e}")
            return
        
        # Test 2d: Lock hangout and verify confirmed status
        print("\n📋 Test 2d: Lock hangout and verify confirmed status")
        try:
            # Update hangout to locked
            resp = await client.put(
                f"{API_BASE}/groups/{test_group_code}/hangouts/{tentative_hangout_id}",
                json={"status": "locked"}
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "ICS 2d: Lock hangout",
                    f"Failed to lock hangout: {resp.status_code}"
                )
                return
            
            # Fetch .ics again
            resp = await client.get(
                f"{API_BASE}/groups/{test_group_code}/hangouts/{tentative_hangout_id}/event.ics"
            )
            
            if resp.status_code != 200:
                results.add_fail(
                    "ICS 2d: Lock hangout",
                    f"Failed to fetch .ics after lock: {resp.status_code}"
                )
                return
            
            locked_ics_body = resp.text
            
            # Should NOT have [tentative] prefix
            if "[tentative]" in locked_ics_body.lower():
                results.add_fail(
                    "ICS 2d: Lock hangout",
                    "SUMMARY should NOT contain '[tentative]' prefix for locked hangout"
                )
                return
            
            # Should have STATUS:CONFIRMED
            if "STATUS:CONFIRMED" not in locked_ics_body:
                results.add_fail(
                    "ICS 2d: Lock hangout",
                    "Missing 'STATUS:CONFIRMED' for locked hangout"
                )
                return
            
            results.add_pass(
                "ICS 2d: Lock hangout",
                "Locked hangout: no '[tentative]' prefix, STATUS:CONFIRMED present"
            )
            
        except Exception as e:
            results.add_fail("ICS 2d: Lock hangout", f"Exception: {e}")
            return
        
        # Test 2e: 404 for non-existent group
        print("\n📋 Test 2e: 404 for non-existent group")
        try:
            resp = await client.get(
                f"{API_BASE}/groups/XXXXXX/hangouts/{tentative_hangout_id}/event.ics"
            )
            
            if resp.status_code != 404:
                results.add_fail(
                    "ICS 2e: Non-existent group",
                    f"Expected 404, got {resp.status_code}"
                )
                return
            
            results.add_pass("ICS 2e: Non-existent group", "Correctly returns 404")
            
        except Exception as e:
            results.add_fail("ICS 2e: Non-existent group", f"Exception: {e}")
            return
        
        # Test 2f: 404 for non-existent hangout
        print("\n📋 Test 2f: 404 for non-existent hangout")
        try:
            resp = await client.get(
                f"{API_BASE}/groups/{test_group_code}/hangouts/nonexistent-id/event.ics"
            )
            
            if resp.status_code != 404:
                results.add_fail(
                    "ICS 2f: Non-existent hangout",
                    f"Expected 404, got {resp.status_code}"
                )
                return
            
            results.add_pass("ICS 2f: Non-existent hangout", "Correctly returns 404")
            
        except Exception as e:
            results.add_fail("ICS 2f: Non-existent hangout", f"Exception: {e}")
            return
        
        # Cleanup: Delete test group
        print("\n📋 Cleanup: Deleting test group")
        try:
            await client.delete(f"{API_BASE}/groups/{test_group_code}")
            print(f"   Test group {test_group_code} deleted")
        except Exception as e:
            print(f"   Warning: Failed to cleanup test group: {e}")


async def main():
    print("="*80)
    print("PLANIT PHASE 2 - NEW FEATURES BACKEND TEST SUITE")
    print("="*80)
    
    # Run test suites
    await test_astral_remix_mode()
    await test_single_event_ics()
    
    # Print summary
    success = results.summary()
    
    print("\n" + "="*80)
    if success:
        print("🎉 ALL TESTS PASSED")
    else:
        print("⚠️  SOME TESTS FAILED - See details above")
    print("="*80)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    asyncio.run(main())
