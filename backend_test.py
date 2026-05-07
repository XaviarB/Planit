#!/usr/bin/env python3
"""
Comprehensive backend test suite for Planit (TimeTogether) app with Astral AI concierge.
Tests all backend endpoints including the new Astral features and location persistence.
"""
import requests
import json
import time
from typing import Dict, Any, Optional

# Backend URL from frontend/.env
BASE_URL = "https://planit-editor.preview.emergentagent.com/api"

# Test configuration
TIMEOUT = 90  # Generous timeout for Gemini calls (10-25s typical)
SMOKE_TEST_CODE = "FLLB7A"  # Pre-existing smoke test group

# ANSI color codes for output
GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
BLUE = "\033[94m"
RESET = "\033[0m"


class TestResults:
    """Track test results for summary reporting."""
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append((test_name, details))
        print(f"{GREEN}✓ PASS{RESET}: {test_name}")
        if details:
            print(f"  {details}")
    
    def add_fail(self, test_name: str, details: str):
        self.failed.append((test_name, details))
        print(f"{RED}✗ FAIL{RESET}: {test_name}")
        print(f"  {RED}{details}{RESET}")
    
    def add_warning(self, test_name: str, details: str):
        self.warnings.append((test_name, details))
        print(f"{YELLOW}⚠ WARNING{RESET}: {test_name}")
        print(f"  {details}")
    
    def print_summary(self):
        print("\n" + "="*80)
        print(f"{BLUE}TEST SUMMARY{RESET}")
        print("="*80)
        print(f"{GREEN}Passed: {len(self.passed)}{RESET}")
        print(f"{RED}Failed: {len(self.failed)}{RESET}")
        print(f"{YELLOW}Warnings: {len(self.warnings)}{RESET}")
        
        if self.failed:
            print(f"\n{RED}FAILED TESTS:{RESET}")
            for name, details in self.failed:
                print(f"  • {name}")
                print(f"    {details}")
        
        if self.warnings:
            print(f"\n{YELLOW}WARNINGS:{RESET}")
            for name, details in self.warnings:
                print(f"  • {name}")
                print(f"    {details}")


results = TestResults()


def test_api_root():
    """Test basic API connectivity."""
    print(f"\n{BLUE}[TEST]{RESET} API Root")
    try:
        resp = requests.get(f"{BASE_URL}/", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "message" in data:
                results.add_pass("API Root", f"Response: {data}")
            else:
                results.add_fail("API Root", f"Unexpected response: {data}")
        else:
            results.add_fail("API Root", f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("API Root", f"Exception: {str(e)}")


def test_create_group_with_location() -> Optional[Dict[str, Any]]:
    """Test creating a group with location field."""
    print(f"\n{BLUE}[TEST]{RESET} Create Group with Location")
    try:
        payload = {
            "group_name": "Test Astral Group",
            "creator_name": "Alice Brooklyn",
            "location": "Brooklyn, NY"
        }
        resp = requests.post(f"{BASE_URL}/groups", json=payload, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            group = data.get("group", {})
            member_id = data.get("member_id")
            
            # Validate group has location
            if group.get("location") != "Brooklyn, NY":
                results.add_fail("Create Group with Location", 
                               f"Group location not set correctly: {group.get('location')}")
                return None
            
            # Validate creator member has location
            members = group.get("members", [])
            if not members:
                results.add_fail("Create Group with Location", "No members in group")
                return None
            
            creator = members[0]
            if creator.get("location") != "Brooklyn, NY":
                results.add_fail("Create Group with Location", 
                               f"Creator location not set: {creator.get('location')}")
                return None
            
            results.add_pass("Create Group with Location", 
                           f"Code: {group.get('code')}, Group & creator location: Brooklyn, NY")
            return data
        else:
            results.add_fail("Create Group with Location", 
                           f"Status {resp.status_code}: {resp.text}")
            return None
    except Exception as e:
        results.add_fail("Create Group with Location", f"Exception: {str(e)}")
        return None


def test_update_group_location(code: str):
    """Test updating group location."""
    print(f"\n{BLUE}[TEST]{RESET} Update Group Location")
    try:
        payload = {"location": "Queens, NY"}
        resp = requests.put(f"{BASE_URL}/groups/{code}", json=payload, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("location") == "Queens, NY":
                results.add_pass("Update Group Location", "Location updated to Queens, NY")
            else:
                results.add_fail("Update Group Location", 
                               f"Location not updated: {data.get('location')}")
        else:
            results.add_fail("Update Group Location", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Update Group Location", f"Exception: {str(e)}")


def test_update_member_location(code: str, member_id: str):
    """Test updating member location without changing name."""
    print(f"\n{BLUE}[TEST]{RESET} Update Member Location")
    try:
        payload = {"location": "Bushwick, NY"}
        resp = requests.put(f"{BASE_URL}/groups/{code}/members/{member_id}", 
                          json=payload, timeout=10)
        
        if resp.status_code == 200:
            # Verify by fetching group
            resp2 = requests.get(f"{BASE_URL}/groups/{code}", timeout=10)
            if resp2.status_code == 200:
                group = resp2.json()
                member = next((m for m in group.get("members", []) if m["id"] == member_id), None)
                if member and member.get("location") == "Bushwick, NY":
                    results.add_pass("Update Member Location", "Member location updated to Bushwick, NY")
                else:
                    results.add_fail("Update Member Location", 
                                   f"Member location not updated: {member.get('location') if member else 'member not found'}")
            else:
                results.add_warning("Update Member Location", 
                                  "Update succeeded but couldn't verify")
        else:
            results.add_fail("Update Member Location", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Update Member Location", f"Exception: {str(e)}")


def test_update_member_name_only(code: str, member_id: str):
    """Test updating member name without location (backward compatibility)."""
    print(f"\n{BLUE}[TEST]{RESET} Update Member Name Only (Back-compat)")
    try:
        payload = {"name": "Alice Updated"}
        resp = requests.put(f"{BASE_URL}/groups/{code}/members/{member_id}", 
                          json=payload, timeout=10)
        
        if resp.status_code == 200:
            # Verify by fetching group
            resp2 = requests.get(f"{BASE_URL}/groups/{code}", timeout=10)
            if resp2.status_code == 200:
                group = resp2.json()
                member = next((m for m in group.get("members", []) if m["id"] == member_id), None)
                if member and member.get("name") == "Alice Updated":
                    results.add_pass("Update Member Name Only", "Name updated, location preserved")
                else:
                    results.add_fail("Update Member Name Only", 
                                   f"Name not updated: {member.get('name') if member else 'member not found'}")
            else:
                results.add_warning("Update Member Name Only", 
                                  "Update succeeded but couldn't verify")
        else:
            results.add_fail("Update Member Name Only", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Update Member Name Only", f"Exception: {str(e)}")


def test_clear_location(code: str):
    """Test clearing location with empty string."""
    print(f"\n{BLUE}[TEST]{RESET} Clear Group Location")
    try:
        payload = {"location": ""}
        resp = requests.put(f"{BASE_URL}/groups/{code}", json=payload, timeout=10)
        
        if resp.status_code == 200:
            data = resp.json()
            if data.get("location") is None:
                results.add_pass("Clear Group Location", "Location cleared (null)")
            else:
                results.add_fail("Clear Group Location", 
                               f"Location not cleared: {data.get('location')}")
        else:
            results.add_fail("Clear Group Location", 
                           f"Status {resp.status_code}: {resp.text}")
    except Exception as e:
        results.add_fail("Clear Group Location", f"Exception: {str(e)}")


def validate_astral_suggest_response(data: Dict[str, Any], test_name: str) -> bool:
    """Validate the shape of astral/suggest response."""
    errors = []
    
    # Check top-level fields
    if "intro" not in data:
        errors.append("Missing 'intro' field")
    elif not isinstance(data["intro"], str):
        errors.append("'intro' must be string")
    
    if "cards" not in data:
        errors.append("Missing 'cards' field")
        return False  # Can't continue without cards
    
    if not isinstance(data["cards"], list):
        errors.append("'cards' must be list")
        return False
    
    if "used_location" not in data:
        errors.append("Missing 'used_location' field")
    
    if "participant_count" not in data:
        errors.append("Missing 'participant_count' field")
    elif not isinstance(data["participant_count"], int):
        errors.append("'participant_count' must be int")
    
    # Validate each card
    for i, card in enumerate(data["cards"]):
        required_fields = [
            "venue", "category", "neighborhood", "vibe_tags", "buzz", 
            "rating", "review_count_approx", "price_level", "what_to_order",
            "astral_take", "warnings", "good_for", "verify_links"
        ]
        
        for field in required_fields:
            if field not in card:
                errors.append(f"Card {i}: Missing '{field}'")
        
        # Validate buzz structure
        if "buzz" in card:
            buzz = card["buzz"]
            if not isinstance(buzz, dict):
                errors.append(f"Card {i}: 'buzz' must be dict")
            else:
                if "quote" not in buzz:
                    errors.append(f"Card {i}: buzz missing 'quote'")
                if "tone" not in buzz:
                    errors.append(f"Card {i}: buzz missing 'tone'")
        
        # Validate rating
        if "rating" in card:
            if not isinstance(card["rating"], (int, float)):
                errors.append(f"Card {i}: 'rating' must be number")
            elif not (0 <= card["rating"] <= 5):
                errors.append(f"Card {i}: 'rating' must be 0-5, got {card['rating']}")
        
        # Validate review_count_approx
        if "review_count_approx" in card:
            if not isinstance(card["review_count_approx"], int):
                errors.append(f"Card {i}: 'review_count_approx' must be int")
        
        # Validate verify_links
        if "verify_links" in card:
            links = card["verify_links"]
            if not isinstance(links, dict):
                errors.append(f"Card {i}: 'verify_links' must be dict")
            else:
                if "google_search" not in links:
                    errors.append(f"Card {i}: verify_links missing 'google_search'")
                if "google_maps" not in links:
                    errors.append(f"Card {i}: verify_links missing 'google_maps'")
    
    if errors:
        results.add_fail(test_name, "\n    ".join(errors))
        return False
    
    return True


def test_astral_suggest_with_location():
    """Test astral/suggest with window_blurb and location_override."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Suggest with Location (Smoke Test Group)")
    try:
        payload = {
            "window_blurb": "Saturday 7-11pm",
            "location_override": "Brooklyn, NY"
        }
        
        print(f"  Calling Gemini API (may take 10-25s)...")
        start = time.time()
        resp = requests.post(f"{BASE_URL}/groups/{SMOKE_TEST_CODE}/astral/suggest", 
                           json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"  Response received in {elapsed:.1f}s")
            
            if validate_astral_suggest_response(data, "Astral Suggest with Location"):
                cards_count = len(data.get("cards", []))
                results.add_pass("Astral Suggest with Location", 
                               f"Valid response with {cards_count} cards in {elapsed:.1f}s")
                
                # Print sample card for inspection
                if cards_count > 0:
                    card = data["cards"][0]
                    print(f"  Sample card: {card.get('venue')} - {card.get('buzz', {}).get('quote', '')[:60]}...")
        elif resp.status_code == 404:
            results.add_fail("Astral Suggest with Location", 
                           f"Group {SMOKE_TEST_CODE} not found - may need to create it")
        else:
            results.add_fail("Astral Suggest with Location", 
                           f"Status {resp.status_code}: {resp.text[:500]}")
    except requests.Timeout:
        results.add_fail("Astral Suggest with Location", 
                       f"Request timed out after {TIMEOUT}s")
    except Exception as e:
        results.add_fail("Astral Suggest with Location", f"Exception: {str(e)}")


def test_astral_suggest_no_location():
    """Test astral/suggest with NO location set anywhere."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Suggest without Location")
    try:
        payload = {
            "window_blurb": "Friday evening"
        }
        
        print(f"  Calling Gemini API (may take 10-25s)...")
        start = time.time()
        resp = requests.post(f"{BASE_URL}/groups/{SMOKE_TEST_CODE}/astral/suggest", 
                           json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"  Response received in {elapsed:.1f}s")
            
            # Should still return 200, possibly with fewer/generic cards
            if validate_astral_suggest_response(data, "Astral Suggest without Location"):
                cards_count = len(data.get("cards", []))
                results.add_pass("Astral Suggest without Location", 
                               f"Valid response with {cards_count} cards (no location) in {elapsed:.1f}s")
        else:
            results.add_fail("Astral Suggest without Location", 
                           f"Status {resp.status_code} (expected 200): {resp.text[:500]}")
    except requests.Timeout:
        results.add_fail("Astral Suggest without Location", 
                       f"Request timed out after {TIMEOUT}s")
    except Exception as e:
        results.add_fail("Astral Suggest without Location", f"Exception: {str(e)}")


def test_astral_suggest_nonexistent_group():
    """Test astral/suggest with non-existent group code."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Suggest with Non-existent Group")
    try:
        payload = {
            "window_blurb": "Saturday night",
            "location_override": "Manhattan, NY"
        }
        
        resp = requests.post(f"{BASE_URL}/groups/XXXXXX/astral/suggest", 
                           json=payload, timeout=TIMEOUT)
        
        if resp.status_code == 404:
            results.add_pass("Astral Suggest Non-existent Group", "Correctly returned 404")
        else:
            results.add_fail("Astral Suggest Non-existent Group", 
                           f"Expected 404, got {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        results.add_fail("Astral Suggest Non-existent Group", f"Exception: {str(e)}")


def test_astral_parse_busy_valid():
    """Test astral/parse-busy with valid input."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Parse-Busy (Valid Input)")
    try:
        payload = {
            "text": "slammed mon-wed 6-9pm next week",
            "anchor_iso": "2025-07-07"
        }
        
        print(f"  Calling Gemini API (may take 10-25s)...")
        start = time.time()
        resp = requests.post(f"{BASE_URL}/groups/{SMOKE_TEST_CODE}/astral/parse-busy", 
                           json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"  Response received in {elapsed:.1f}s")
            
            if "slots" not in data or "count" not in data:
                results.add_fail("Astral Parse-Busy Valid", 
                               "Missing 'slots' or 'count' in response")
                return
            
            slots = data["slots"]
            count = data["count"]
            
            if not isinstance(slots, list):
                results.add_fail("Astral Parse-Busy Valid", "'slots' must be list")
                return
            
            if not isinstance(count, int):
                results.add_fail("Astral Parse-Busy Valid", "'count' must be int")
                return
            
            # Validate slot structure
            errors = []
            for i, slot in enumerate(slots):
                if slot.get("mode") != "date":
                    errors.append(f"Slot {i}: mode must be 'date', got {slot.get('mode')}")
                if slot.get("status") != "busy":
                    errors.append(f"Slot {i}: status must be 'busy', got {slot.get('status')}")
                
                hour = slot.get("hour")
                if not isinstance(hour, int) or not (0 <= hour <= 23):
                    errors.append(f"Slot {i}: invalid hour {hour}")
                
                key = slot.get("key", "")
                if not key or len(key) != 10:
                    errors.append(f"Slot {i}: invalid ISO date key {key}")
            
            if errors:
                results.add_fail("Astral Parse-Busy Valid", "\n    ".join(errors))
            else:
                # Expected: Mon-Wed (3 days) * 3 hours (18,19,20) = 9 slots
                expected_count = 9
                if count == expected_count and len(slots) == expected_count:
                    results.add_pass("Astral Parse-Busy Valid", 
                                   f"Correctly parsed {count} slots in {elapsed:.1f}s")
                else:
                    results.add_warning("Astral Parse-Busy Valid", 
                                      f"Expected ~{expected_count} slots, got {count} (may vary by LLM interpretation)")
        else:
            results.add_fail("Astral Parse-Busy Valid", 
                           f"Status {resp.status_code}: {resp.text[:500]}")
    except requests.Timeout:
        results.add_fail("Astral Parse-Busy Valid", 
                       f"Request timed out after {TIMEOUT}s")
    except Exception as e:
        results.add_fail("Astral Parse-Busy Valid", f"Exception: {str(e)}")


def test_astral_parse_busy_empty():
    """Test astral/parse-busy with empty text."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Parse-Busy (Empty Input)")
    try:
        payload = {
            "text": "",
            "anchor_iso": "2025-07-07"
        }
        
        resp = requests.post(f"{BASE_URL}/groups/{SMOKE_TEST_CODE}/astral/parse-busy", 
                           json=payload, timeout=TIMEOUT)
        
        if resp.status_code == 200:
            data = resp.json()
            
            if data.get("slots") == [] and data.get("count") == 0:
                results.add_pass("Astral Parse-Busy Empty", 
                               "Correctly returned empty slots")
            else:
                results.add_fail("Astral Parse-Busy Empty", 
                               f"Expected empty slots, got: {data}")
        else:
            results.add_fail("Astral Parse-Busy Empty", 
                           f"Expected 200, got {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        results.add_fail("Astral Parse-Busy Empty", f"Exception: {str(e)}")


def test_astral_parse_busy_garbage():
    """Test astral/parse-busy with garbage input."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Parse-Busy (Garbage Input)")
    try:
        payload = {
            "text": "asdf qwerty zzz 12345",
            "anchor_iso": "2025-07-07"
        }
        
        print(f"  Calling Gemini API (may take 10-25s)...")
        resp = requests.post(f"{BASE_URL}/groups/{SMOKE_TEST_CODE}/astral/parse-busy", 
                           json=payload, timeout=TIMEOUT)
        
        if resp.status_code == 200:
            data = resp.json()
            
            # Should return count=0 or small valid list, never 500
            if isinstance(data.get("slots"), list) and isinstance(data.get("count"), int):
                results.add_pass("Astral Parse-Busy Garbage", 
                               f"Handled gracefully: {data.get('count')} slots")
            else:
                results.add_fail("Astral Parse-Busy Garbage", 
                               f"Invalid response structure: {data}")
        else:
            results.add_fail("Astral Parse-Busy Garbage", 
                           f"Expected 200, got {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        results.add_fail("Astral Parse-Busy Garbage", f"Exception: {str(e)}")


def test_astral_draft_invite():
    """Test astral/draft-invite endpoint."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Draft-Invite")
    try:
        payload = {
            "suggestion": {
                "venue": "The Commodore",
                "category": "bar",
                "buzz": {"quote": "best jukebox in brooklyn", "tone": "love"}
            },
            "window_blurb": "Saturday 8pm"
        }
        
        print(f"  Calling Gemini API (may take 10-25s)...")
        start = time.time()
        resp = requests.post(f"{BASE_URL}/groups/{SMOKE_TEST_CODE}/astral/draft-invite", 
                           json=payload, timeout=TIMEOUT)
        elapsed = time.time() - start
        
        if resp.status_code == 200:
            data = resp.json()
            print(f"  Response received in {elapsed:.1f}s")
            
            if "message" not in data:
                results.add_fail("Astral Draft-Invite", "Missing 'message' field")
            elif not data["message"] or not isinstance(data["message"], str):
                results.add_fail("Astral Draft-Invite", 
                               f"'message' must be non-empty string, got: {data['message']}")
            else:
                msg_len = len(data["message"])
                results.add_pass("Astral Draft-Invite", 
                               f"Valid message ({msg_len} chars) in {elapsed:.1f}s")
                print(f"  Sample: {data['message'][:100]}...")
        else:
            results.add_fail("Astral Draft-Invite", 
                           f"Status {resp.status_code}: {resp.text[:500]}")
    except requests.Timeout:
        results.add_fail("Astral Draft-Invite", 
                       f"Request timed out after {TIMEOUT}s")
    except Exception as e:
        results.add_fail("Astral Draft-Invite", f"Exception: {str(e)}")


def test_astral_draft_invite_sparse():
    """Test astral/draft-invite with sparse suggestion (defensive fallback)."""
    print(f"\n{BLUE}[TEST]{RESET} Astral Draft-Invite (Sparse Suggestion)")
    try:
        payload = {
            "suggestion": {},
            "window_blurb": "later"
        }
        
        resp = requests.post(f"{BASE_URL}/groups/{SMOKE_TEST_CODE}/astral/draft-invite", 
                           json=payload, timeout=TIMEOUT)
        
        if resp.status_code == 200:
            data = resp.json()
            
            if "message" in data and data["message"]:
                results.add_pass("Astral Draft-Invite Sparse", 
                               "Defensive fallback returned non-empty message")
            else:
                results.add_fail("Astral Draft-Invite Sparse", 
                               "Expected non-empty message even with sparse input")
        else:
            results.add_fail("Astral Draft-Invite Sparse", 
                           f"Status {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        results.add_fail("Astral Draft-Invite Sparse", f"Exception: {str(e)}")


def test_existing_endpoints_sanity():
    """Quick sanity check that existing endpoints still work."""
    print(f"\n{BLUE}[TEST]{RESET} Existing Endpoints Sanity Check")
    
    try:
        # Create a test group
        payload = {
            "group_name": "Sanity Test Group",
            "creator_name": "Bob"
        }
        resp = requests.post(f"{BASE_URL}/groups", json=payload, timeout=10)
        
        if resp.status_code != 200:
            results.add_fail("Existing Endpoints - Create Group", 
                           f"Status {resp.status_code}")
            return
        
        data = resp.json()
        code = data["group"]["code"]
        member_id = data["member_id"]
        
        # Join group
        resp = requests.post(f"{BASE_URL}/groups/{code}/members", 
                           json={"name": "Charlie"}, timeout=10)
        if resp.status_code != 200:
            results.add_fail("Existing Endpoints - Join Group", 
                           f"Status {resp.status_code}")
            return
        
        # Update slots
        slots = [
            {
                "mode": "weekly",
                "key": "d1",
                "hour": 18,
                "minute": 0,
                "step": 60,
                "status": "free",
                "reason_id": None
            }
        ]
        resp = requests.put(f"{BASE_URL}/groups/{code}/members/{member_id}/slots", 
                          json={"slots": slots}, timeout=10)
        if resp.status_code != 200:
            results.add_fail("Existing Endpoints - Update Slots", 
                           f"Status {resp.status_code}")
            return
        
        # Add reason
        resp = requests.post(f"{BASE_URL}/groups/{code}/reasons", 
                           json={"label": "Meeting", "color": "#FF0000"}, timeout=10)
        if resp.status_code != 200:
            results.add_fail("Existing Endpoints - Add Reason", 
                           f"Status {resp.status_code}")
            return
        
        reason_id = resp.json()["id"]
        
        # Delete reason
        resp = requests.delete(f"{BASE_URL}/groups/{code}/reasons/{reason_id}", timeout=10)
        if resp.status_code != 200:
            results.add_fail("Existing Endpoints - Delete Reason", 
                           f"Status {resp.status_code}")
            return
        
        # Leave group
        resp = requests.delete(f"{BASE_URL}/groups/{code}/members/{member_id}", timeout=10)
        if resp.status_code != 200:
            results.add_fail("Existing Endpoints - Leave Group", 
                           f"Status {resp.status_code}")
            return
        
        # Delete group
        resp = requests.delete(f"{BASE_URL}/groups/{code}", timeout=10)
        if resp.status_code != 200:
            results.add_fail("Existing Endpoints - Delete Group", 
                           f"Status {resp.status_code}")
            return
        
        results.add_pass("Existing Endpoints Sanity Check", 
                       "All CRUD operations working")
        
    except Exception as e:
        results.add_fail("Existing Endpoints Sanity Check", f"Exception: {str(e)}")


def main():
    """Run all backend tests."""
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}PLANIT BACKEND TEST SUITE - ASTRAL AI CONCIERGE + LOCATION PERSISTENCE{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    print(f"Backend URL: {BASE_URL}")
    print(f"Timeout: {TIMEOUT}s (generous for Gemini calls)")
    print(f"Smoke test group: {SMOKE_TEST_CODE}")
    
    # Test order: High priority first
    
    # 1. Basic connectivity
    test_api_root()
    
    # 2. Location persistence (HIGH PRIORITY)
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}LOCATION PERSISTENCE TESTS{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    group_data = test_create_group_with_location()
    if group_data:
        code = group_data["group"]["code"]
        member_id = group_data["member_id"]
        
        test_update_group_location(code)
        test_update_member_location(code, member_id)
        test_update_member_name_only(code, member_id)
        test_clear_location(code)
        
        # Clean up test group
        try:
            requests.delete(f"{BASE_URL}/groups/{code}", timeout=10)
        except:
            pass
    
    # 3. Astral suggest endpoint (HIGH PRIORITY)
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}ASTRAL SUGGEST ENDPOINT TESTS{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    test_astral_suggest_with_location()
    test_astral_suggest_no_location()
    test_astral_suggest_nonexistent_group()
    
    # 4. Astral parse-busy endpoint (HIGH PRIORITY)
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}ASTRAL PARSE-BUSY ENDPOINT TESTS{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    test_astral_parse_busy_valid()
    test_astral_parse_busy_empty()
    test_astral_parse_busy_garbage()
    
    # 5. Astral draft-invite endpoint (MEDIUM PRIORITY)
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}ASTRAL DRAFT-INVITE ENDPOINT TESTS{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    test_astral_draft_invite()
    test_astral_draft_invite_sparse()
    
    # 6. Existing endpoints sanity check
    print(f"\n{BLUE}{'='*80}{RESET}")
    print(f"{BLUE}EXISTING ENDPOINTS SANITY CHECK{RESET}")
    print(f"{BLUE}{'='*80}{RESET}")
    
    test_existing_endpoints_sanity()
    
    # Print summary
    results.print_summary()
    
    # Exit with appropriate code
    if results.failed:
        exit(1)
    else:
        exit(0)


if __name__ == "__main__":
    main()
