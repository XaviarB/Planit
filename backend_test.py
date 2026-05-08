#!/usr/bin/env python3
"""
Phase 5 Customization Backend Tests
Tests the 5 new customization endpoints added in Phase 5.
"""

import requests
import json
import sys

# Backend URL from frontend/.env
BASE_URL = "https://flex-app-builder.preview.emergentagent.com/api"

def log(msg):
    print(f"[TEST] {msg}")

def test_phase5_customization():
    """Test all Phase 5 customization endpoints"""
    
    log("=" * 80)
    log("PHASE 5 CUSTOMIZATION BACKEND TESTS")
    log("=" * 80)
    
    # Create a fresh test group
    log("\n[SETUP] Creating fresh test group...")
    create_resp = requests.post(
        f"{BASE_URL}/groups",
        json={
            "group_name": "Phase5Test",
            "creator_name": "Alex",
            "location": "NYC"
        },
        timeout=30
    )
    assert create_resp.status_code == 200, f"Failed to create group: {create_resp.status_code}"
    response_data = create_resp.json()
    group_data = response_data.get("group", response_data)  # Handle both nested and flat response
    code = group_data["code"]
    creator_id = group_data["members"][0]["id"]
    log(f"✓ Created group {code} with creator {creator_id}")
    
    # ========================================================================
    # TEST 1: PUT /api/groups/{code}/branding
    # ========================================================================
    log("\n" + "=" * 80)
    log("TEST 1: PUT /api/groups/{code}/branding")
    log("=" * 80)
    
    # 1a. Send all fields
    log("\n[1a] Testing full branding payload...")
    branding_resp = requests.put(
        f"{BASE_URL}/groups/{code}/branding",
        json={
            "accent_hex": "#ff5500",
            "gradient_from": "#ffeedd",
            "gradient_to": "#ccddee",
            "emoji": "🎨",
            "theme_variant": "noir",
            "default_view": "members"
        },
        timeout=30
    )
    assert branding_resp.status_code == 200, f"Branding update failed: {branding_resp.status_code}"
    branding_data = branding_resp.json()
    assert branding_data["ok"] == True
    assert branding_data["branding"]["accent_hex"] == "#ff5500"
    assert branding_data["branding"]["gradient_from"] == "#ffeedd"
    assert branding_data["branding"]["gradient_to"] == "#ccddee"
    assert branding_data["branding"]["emoji"] == "🎨"
    assert branding_data["branding"]["theme_variant"] == "noir"
    assert branding_data["branding"]["default_view"] == "members"
    log("✓ Full branding payload accepted and returned correctly")
    
    # 1b. Partial update (only accent_hex)
    log("\n[1b] Testing partial branding update (only accent_hex)...")
    partial_resp = requests.put(
        f"{BASE_URL}/groups/{code}/branding",
        json={"accent_hex": "#00ff00"},
        timeout=30
    )
    assert partial_resp.status_code == 200
    partial_data = partial_resp.json()
    assert partial_data["branding"]["accent_hex"] == "#00ff00"
    # Other fields should remain unchanged from 1a
    assert partial_data["branding"]["emoji"] == "🎨"
    assert partial_data["branding"]["theme_variant"] == "noir"
    log("✓ Partial update preserved other fields")
    
    # 1c. Hex without leading # gets normalized
    log("\n[1c] Testing hex normalization (no leading #)...")
    hex_resp = requests.put(
        f"{BASE_URL}/groups/{code}/branding",
        json={"accent_hex": "aabbcc"},
        timeout=30
    )
    assert hex_resp.status_code == 200
    hex_data = hex_resp.json()
    assert hex_data["branding"]["accent_hex"] == "#aabbcc"
    log("✓ Hex normalized to #aabbcc")
    
    # 1d. Bad theme_variant falls back to current value
    log("\n[1d] Testing invalid theme_variant fallback...")
    bad_theme_resp = requests.put(
        f"{BASE_URL}/groups/{code}/branding",
        json={"theme_variant": "rainbow"},
        timeout=30
    )
    assert bad_theme_resp.status_code == 200
    bad_theme_data = bad_theme_resp.json()
    # Should keep "noir" from 1a
    assert bad_theme_data["branding"]["theme_variant"] == "noir"
    log("✓ Invalid theme_variant 'rainbow' fell back to 'noir'")
    
    # 1e. Bad default_view falls back to current value
    log("\n[1e] Testing invalid default_view fallback...")
    bad_view_resp = requests.put(
        f"{BASE_URL}/groups/{code}/branding",
        json={"default_view": "calendar"},
        timeout=30
    )
    assert bad_view_resp.status_code == 200
    bad_view_data = bad_view_resp.json()
    # Should keep "members" from 1a
    assert bad_view_data["branding"]["default_view"] == "members"
    log("✓ Invalid default_view 'calendar' fell back to 'members'")
    
    # 1f. 404 for unknown group code
    log("\n[1f] Testing 404 for unknown group code...")
    unknown_resp = requests.put(
        f"{BASE_URL}/groups/XXXXXX/branding",
        json={"accent_hex": "#ff0000"},
        timeout=30
    )
    assert unknown_resp.status_code == 404
    log("✓ Unknown group code returned 404")
    
    # ========================================================================
    # TEST 2: PUT /api/groups/{code}/locale
    # ========================================================================
    log("\n" + "=" * 80)
    log("TEST 2: PUT /api/groups/{code}/locale")
    log("=" * 80)
    
    # 2a. Full payload
    log("\n[2a] Testing full locale payload...")
    locale_resp = requests.put(
        f"{BASE_URL}/groups/{code}/locale",
        json={
            "timezone": "America/New_York",
            "week_start": "sun",
            "time_format": "24h",
            "day_start_hour": 8,
            "day_end_hour": 22,
            "slot_minutes": 30
        },
        timeout=30
    )
    assert locale_resp.status_code == 200
    locale_data = locale_resp.json()
    assert locale_data["ok"] == True
    assert locale_data["locale"]["timezone"] == "America/New_York"
    assert locale_data["locale"]["week_start"] == "sun"
    assert locale_data["locale"]["time_format"] == "24h"
    assert locale_data["locale"]["day_start_hour"] == 8
    assert locale_data["locale"]["day_end_hour"] == 22
    assert locale_data["locale"]["slot_minutes"] == 30
    log("✓ Full locale payload accepted and returned correctly")
    
    # 2b. Cross-field guard: end <= start should silently reject both hours
    log("\n[2b] Testing cross-field guard (end <= start)...")
    guard_resp = requests.put(
        f"{BASE_URL}/groups/{code}/locale",
        json={
            "day_start_hour": 18,
            "day_end_hour": 9,
            "time_format": "12h"
        },
        timeout=30
    )
    assert guard_resp.status_code == 200
    guard_data = guard_resp.json()
    # time_format should be applied
    assert guard_data["locale"]["time_format"] == "12h"
    # But hours should remain at previous values (8 and 22 from 2a)
    assert guard_data["locale"]["day_start_hour"] == 8
    assert guard_data["locale"]["day_end_hour"] == 22
    log("✓ Cross-field guard rejected invalid hours, applied time_format")
    
    # 2c. Invalid slot_minutes fallback
    log("\n[2c] Testing invalid slot_minutes fallback...")
    slot_resp = requests.put(
        f"{BASE_URL}/groups/{code}/locale",
        json={"slot_minutes": 45},
        timeout=30
    )
    assert slot_resp.status_code == 200
    slot_data = slot_resp.json()
    # Should keep 30 from 2a
    assert slot_data["locale"]["slot_minutes"] == 30
    log("✓ Invalid slot_minutes 45 fell back to 30")
    
    # 2d. Invalid week_start fallback
    log("\n[2d] Testing invalid week_start fallback...")
    week_resp = requests.put(
        f"{BASE_URL}/groups/{code}/locale",
        json={"week_start": "monday"},
        timeout=30
    )
    assert week_resp.status_code == 200
    week_data = week_resp.json()
    # Should keep "sun" from 2a
    assert week_data["locale"]["week_start"] == "sun"
    log("✓ Invalid week_start 'monday' fell back to 'sun'")
    
    # ========================================================================
    # TEST 3: PUT /api/groups/{code}/astral-persona
    # ========================================================================
    log("\n" + "=" * 80)
    log("TEST 3: PUT /api/groups/{code}/astral-persona")
    log("=" * 80)
    
    # 3a. Full payload
    log("\n[3a] Testing full astral-persona payload...")
    persona_resp = requests.put(
        f"{BASE_URL}/groups/{code}/astral-persona",
        json={
            "display_name": "nova",
            "tone": "warm",
            "lowercase": False,
            "emoji_on": False,
            "default_location": "Brooklyn, NY"
        },
        timeout=30
    )
    assert persona_resp.status_code == 200
    persona_data = persona_resp.json()
    assert persona_data["ok"] == True
    assert persona_data["astral_persona"]["display_name"] == "nova"
    assert persona_data["astral_persona"]["tone"] == "warm"
    assert persona_data["astral_persona"]["lowercase"] == False
    assert persona_data["astral_persona"]["emoji_on"] == False
    assert persona_data["astral_persona"]["default_location"] == "Brooklyn, NY"
    log("✓ Full astral-persona payload accepted and returned correctly")
    
    # 3b. Empty display_name preserves previous value
    log("\n[3b] Testing empty display_name preservation...")
    empty_name_resp = requests.put(
        f"{BASE_URL}/groups/{code}/astral-persona",
        json={"display_name": ""},
        timeout=30
    )
    assert empty_name_resp.status_code == 200
    empty_name_data = empty_name_resp.json()
    # Should keep "nova" from 3a
    assert empty_name_data["astral_persona"]["display_name"] == "nova"
    log("✓ Empty display_name preserved 'nova'")
    
    # 3c. Invalid tone fallback
    log("\n[3c] Testing invalid tone fallback...")
    tone_resp = requests.put(
        f"{BASE_URL}/groups/{code}/astral-persona",
        json={"tone": "loud"},
        timeout=30
    )
    assert tone_resp.status_code == 200
    tone_data = tone_resp.json()
    # Should keep "warm" from 3a
    assert tone_data["astral_persona"]["tone"] == "warm"
    log("✓ Invalid tone 'loud' fell back to 'warm'")
    
    # 3d. default_location="" clears to null
    log("\n[3d] Testing default_location clear to null...")
    clear_loc_resp = requests.put(
        f"{BASE_URL}/groups/{code}/astral-persona",
        json={"default_location": ""},
        timeout=30
    )
    assert clear_loc_resp.status_code == 200
    clear_loc_data = clear_loc_resp.json()
    assert clear_loc_data["astral_persona"]["default_location"] is None
    log("✓ Empty default_location cleared to null")
    
    # 3e. Smoke check: POST /api/groups/{code}/astral/suggest still works
    log("\n[3e] Smoke check: Astral suggest still works after persona update...")
    suggest_resp = requests.post(
        f"{BASE_URL}/groups/{code}/astral/suggest",
        json={
            "window_blurb": "Saturday 7-11pm",
            "location_override": "Brooklyn, NY"
        },
        timeout=60  # Gemini calls take 10-25s
    )
    assert suggest_resp.status_code == 200
    suggest_data = suggest_resp.json()
    assert "intro" in suggest_data
    assert "cards" in suggest_data
    assert len(suggest_data["cards"]) <= 3
    log("✓ Astral suggest returned 200 with cards after persona update")
    
    # ========================================================================
    # TEST 4: PUT /api/groups/{code}/members/{member_id}/prefs
    # ========================================================================
    log("\n" + "=" * 80)
    log("TEST 4: PUT /api/groups/{code}/members/{member_id}/prefs")
    log("=" * 80)
    
    # 4a. Full payload on real member
    log("\n[4a] Testing full member prefs payload...")
    prefs_resp = requests.put(
        f"{BASE_URL}/groups/{code}/members/{creator_id}/prefs",
        json={
            "color_hex": "#ff00ff",
            "fab_side": "left",
            "theme": "dark",
            "compact": True,
            "hidden_panels": ["stats", "hangouts"]
        },
        timeout=30
    )
    assert prefs_resp.status_code == 200
    prefs_data = prefs_resp.json()
    assert prefs_data["ok"] == True
    assert prefs_data["prefs"]["color_hex"] == "#ff00ff"
    assert prefs_data["prefs"]["fab_side"] == "left"
    assert prefs_data["prefs"]["theme"] == "dark"
    assert prefs_data["prefs"]["compact"] == True
    assert set(prefs_data["prefs"]["hidden_panels"]) == {"stats", "hangouts"}
    log("✓ Full member prefs payload accepted and returned correctly")
    
    # 4b. Unknown member_id returns 404
    log("\n[4b] Testing 404 for unknown member_id...")
    unknown_member_resp = requests.put(
        f"{BASE_URL}/groups/{code}/members/unknown-member-id/prefs",
        json={"theme": "light"},
        timeout=30
    )
    assert unknown_member_resp.status_code == 404
    log("✓ Unknown member_id returned 404")
    
    # 4c. color_hex="" sets to null
    log("\n[4c] Testing color_hex clear to null...")
    clear_color_resp = requests.put(
        f"{BASE_URL}/groups/{code}/members/{creator_id}/prefs",
        json={"color_hex": ""},
        timeout=30
    )
    assert clear_color_resp.status_code == 200
    clear_color_data = clear_color_resp.json()
    assert clear_color_data["prefs"]["color_hex"] is None
    log("✓ Empty color_hex cleared to null")
    
    # 4d. hidden_panels filters unknown values
    log("\n[4d] Testing hidden_panels filtering...")
    filter_resp = requests.put(
        f"{BASE_URL}/groups/{code}/members/{creator_id}/prefs",
        json={"hidden_panels": ["stats", "unknown", "hangouts"]},
        timeout=30
    )
    assert filter_resp.status_code == 200
    filter_data = filter_resp.json()
    # Should only keep "stats" and "hangouts"
    assert set(filter_data["prefs"]["hidden_panels"]) == {"stats", "hangouts"}
    log("✓ hidden_panels filtered out 'unknown', kept ['stats', 'hangouts']")
    
    # 4e. Invalid fab_side fallback
    log("\n[4e] Testing invalid fab_side fallback...")
    fab_resp = requests.put(
        f"{BASE_URL}/groups/{code}/members/{creator_id}/prefs",
        json={"fab_side": "middle"},
        timeout=30
    )
    assert fab_resp.status_code == 200
    fab_data = fab_resp.json()
    # Should keep "left" from 4a
    assert fab_data["prefs"]["fab_side"] == "left"
    log("✓ Invalid fab_side 'middle' fell back to 'left'")
    
    # ========================================================================
    # TEST 5: GET /api/groups/{code} backfill
    # ========================================================================
    log("\n" + "=" * 80)
    log("TEST 5: GET /api/groups/{code} backfill for new fields")
    log("=" * 80)
    
    # Create a fresh group to test defaults
    log("\n[5] Creating fresh group to test default backfill...")
    fresh_resp = requests.post(
        f"{BASE_URL}/groups",
        json={
            "group_name": "DefaultsTest",
            "creator_name": "Bob",
            "location": "SF"
        },
        timeout=30
    )
    assert fresh_resp.status_code == 200
    fresh_response_data = fresh_resp.json()
    fresh_data = fresh_response_data.get("group", fresh_response_data)  # Handle both nested and flat response
    fresh_code = fresh_data["code"]
    
    # GET the group to verify backfill
    get_resp = requests.get(f"{BASE_URL}/groups/{fresh_code}", timeout=30)
    assert get_resp.status_code == 200
    get_data = get_resp.json()
    
    # Verify branding defaults
    assert "branding" in get_data
    assert get_data["branding"]["accent_hex"] == "#0f172a"
    assert get_data["branding"]["emoji"] == "🪐"
    assert get_data["branding"]["theme_variant"] == "default"
    assert get_data["branding"]["default_view"] == "dates"
    log("✓ Branding defaults present and correct")
    
    # Verify locale defaults
    assert "locale" in get_data
    assert get_data["locale"]["week_start"] == "mon"
    assert get_data["locale"]["time_format"] == "12h"
    assert get_data["locale"]["day_start_hour"] == 0
    assert get_data["locale"]["day_end_hour"] == 23
    assert get_data["locale"]["slot_minutes"] == 60
    log("✓ Locale defaults present and correct")
    
    # Verify astral_persona defaults
    assert "astral_persona" in get_data
    assert get_data["astral_persona"]["display_name"] == "astral"
    assert get_data["astral_persona"]["tone"] == "edgy"
    assert get_data["astral_persona"]["lowercase"] == True
    assert get_data["astral_persona"]["emoji_on"] == True
    log("✓ Astral persona defaults present and correct")
    
    # Verify member prefs defaults
    assert len(get_data["members"]) > 0
    member = get_data["members"][0]
    assert "prefs" in member
    assert member["prefs"]["fab_side"] == "right"
    assert member["prefs"]["theme"] == "auto"
    assert member["prefs"]["compact"] == False
    assert member["prefs"]["hidden_panels"] == []
    log("✓ Member prefs defaults present and correct")
    
    # ========================================================================
    # ALL TESTS PASSED
    # ========================================================================
    log("\n" + "=" * 80)
    log("✅ ALL PHASE 5 CUSTOMIZATION TESTS PASSED")
    log("=" * 80)
    log(f"\nTest groups created: {code}, {fresh_code}")
    log("All 5 Phase 5 backend tasks verified successfully:")
    log("  1. PUT /api/groups/{code}/branding - ✅")
    log("  2. PUT /api/groups/{code}/locale - ✅")
    log("  3. PUT /api/groups/{code}/astral-persona - ✅")
    log("  4. PUT /api/groups/{code}/members/{member_id}/prefs - ✅")
    log("  5. GET /api/groups/{code} backfill - ✅")
    
    return True

if __name__ == "__main__":
    try:
        test_phase5_customization()
        sys.exit(0)
    except AssertionError as e:
        log(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    except Exception as e:
        log(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
