"""
Phase 2 regression — only the NEW endpoints added in latest batch.
Scope:
  - Astral history (list / clear all / clear one / skip_history flag)
  - Group remix defaults (PUT /remix-defaults + GET reflects)
  - Recurrence toggle (PUT /recurrence with weekly/biweekly/none/bad)
  - OG card image (/api/og.png and /api/og/{code}.png)

Per request: do NOT re-run prior phases. Group code N7UVGL ('Weekend Warriors')
is used if it already exists; otherwise we create one.
"""
import os
import time
import pytest
import requests
from pathlib import Path


def _load_backend_url():
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    env_file = Path("/app/frontend/.env")
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not configured")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

SMOKE_CODE = "N7UVGL"
GEMINI_TIMEOUT = 90  # Gemini calls take 10–25s


# --------------------------------------------------------------------------- #
# Fixtures                                                                    #
# --------------------------------------------------------------------------- #
@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def group_code(client):
    """Reuse N7UVGL if present; else create a fresh group."""
    r = client.get(f"{API}/groups/{SMOKE_CODE}", timeout=15)
    if r.status_code == 200:
        return SMOKE_CODE
    # Create new
    body = {
        "group_name": "Weekend Warriors",
        "creator_name": "Tester",
        "location": "Brooklyn, NY",
    }
    r = client.post(f"{API}/groups", json=body, timeout=15)
    assert r.status_code == 200, f"create group failed: {r.status_code} {r.text}"
    code = r.json()["group"]["code"]
    return code


@pytest.fixture(scope="session")
def member_id(client, group_code):
    g = client.get(f"{API}/groups/{group_code}", timeout=15).json()
    return (g.get("members") or [{}])[0].get("id")


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #
def _suggest(client, code, member_id, skip_history=False, window="this Saturday afternoon"):
    body = {
        "member_id": member_id,
        "window_blurb": window,
        "skip_history": skip_history,
    }
    return client.post(
        f"{API}/groups/{code}/astral/suggest",
        json=body,
        timeout=GEMINI_TIMEOUT,
    )


def _history(client, code, limit=20):
    return client.get(f"{API}/groups/{code}/astral/history?limit={limit}", timeout=15)


# =========================================================================== #
# ASTRAL HISTORY                                                              #
# =========================================================================== #
class TestAstralHistory:
    def test_suggest_then_history_round_id_matches(self, client, group_code, member_id):
        # Clear first to make assertions deterministic.
        client.delete(f"{API}/groups/{group_code}/astral/history", timeout=10)

        r = _suggest(client, group_code, member_id, skip_history=False)
        assert r.status_code == 200, f"suggest: {r.status_code} {r.text[:200]}"
        body = r.json()
        cards = body.get("cards") or []
        if not cards:
            pytest.skip("Gemini returned no cards — skipping history assertion")
        round_id = body.get("round_id")
        assert isinstance(round_id, str) and len(round_id) > 0, \
            f"expected round_id in suggest response, got: {body.keys()}"

        # Now hit history.
        h = _history(client, group_code)
        assert h.status_code == 200
        rounds = h.json().get("rounds")
        assert isinstance(rounds, list) and len(rounds) >= 1
        # Newest first
        assert rounds[0].get("id") == round_id, \
            f"first round id {rounds[0].get('id')} != suggest round_id {round_id}"

    def test_skip_history_does_not_persist(self, client, group_code, member_id):
        before = _history(client, group_code).json().get("rounds") or []
        before_len = len(before)

        r = _suggest(client, group_code, member_id, skip_history=True,
                     window="next Friday night")
        assert r.status_code == 200, r.text[:200]
        body = r.json()
        # When skip_history=True, server should NOT include round_id (no save)
        assert "round_id" not in body or body.get("round_id") is None, \
            f"skip_history=true but round_id present: {body.get('round_id')}"

        after = _history(client, group_code).json().get("rounds") or []
        assert len(after) == before_len, \
            f"history grew despite skip_history=true: {before_len} -> {len(after)}"

    def test_delete_one_round(self, client, group_code, member_id):
        # Make sure there's at least one round to delete.
        client.delete(f"{API}/groups/{group_code}/astral/history", timeout=10)
        r = _suggest(client, group_code, member_id, skip_history=False,
                     window="Sunday brunch")
        assert r.status_code == 200, r.text[:200]
        if not (r.json().get("cards") or []):
            pytest.skip("Gemini returned no cards")
        rid = r.json().get("round_id")
        assert rid

        # Add a second one
        r2 = _suggest(client, group_code, member_id, skip_history=False,
                      window="Tuesday evening")
        assert r2.status_code == 200
        rid2 = r2.json().get("round_id")

        # Delete only the first.
        d = client.delete(f"{API}/groups/{group_code}/astral/history/{rid}", timeout=10)
        assert d.status_code == 200
        assert d.json().get("ok") is True

        rounds = _history(client, group_code).json().get("rounds") or []
        ids = [x.get("id") for x in rounds]
        assert rid not in ids, f"deleted id {rid} still present: {ids}"
        if rid2:
            assert rid2 in ids, f"unrelated id {rid2} got removed: {ids}"

    def test_clear_all_history(self, client, group_code, member_id):
        # Ensure at least one item exists
        r = _suggest(client, group_code, member_id, skip_history=False,
                     window="next weekend")
        if not (r.json().get("cards") or []):
            pytest.skip("Gemini returned no cards")

        d = client.delete(f"{API}/groups/{group_code}/astral/history", timeout=10)
        assert d.status_code == 200
        assert d.json().get("ok") is True

        rounds = _history(client, group_code).json().get("rounds")
        assert rounds == []


# =========================================================================== #
# GROUP REMIX DEFAULTS                                                        #
# =========================================================================== #
class TestRemixDefaults:
    def test_set_and_get(self, client, group_code):
        body = {"presets": ["cheaper", "outdoorsy"], "hint": "we hate bars"}
        r = client.put(f"{API}/groups/{group_code}/remix-defaults", json=body, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        rd = j.get("remix_defaults")
        assert rd.get("presets") == ["cheaper", "outdoorsy"]
        assert rd.get("hint") == "we hate bars"

        g = client.get(f"{API}/groups/{group_code}", timeout=15).json()
        assert g.get("remix_defaults", {}).get("presets") == ["cheaper", "outdoorsy"]
        assert g.get("remix_defaults", {}).get("hint") == "we hate bars"

    def test_clear_with_empty(self, client, group_code):
        body = {"presets": [], "hint": ""}
        r = client.put(f"{API}/groups/{group_code}/remix-defaults", json=body, timeout=15)
        assert r.status_code == 200
        rd = r.json().get("remix_defaults")
        assert rd.get("presets") == []
        # Empty hint should clear → None
        assert rd.get("hint") in (None, ""), f"expected None/'', got {rd.get('hint')!r}"

    def test_hint_truncated_to_240(self, client, group_code):
        long_hint = "x" * 500
        r = client.put(
            f"{API}/groups/{group_code}/remix-defaults",
            json={"presets": ["a"], "hint": long_hint},
            timeout=15,
        )
        assert r.status_code == 200
        h = r.json().get("remix_defaults", {}).get("hint") or ""
        assert len(h) == 240, f"hint length {len(h)} (expected 240)"

    def test_presets_capped_at_12(self, client, group_code):
        many = [f"p{i}" for i in range(20)]
        r = client.put(
            f"{API}/groups/{group_code}/remix-defaults",
            json={"presets": many, "hint": "ok"},
            timeout=15,
        )
        assert r.status_code == 200
        ps = r.json().get("remix_defaults", {}).get("presets") or []
        assert len(ps) == 12, f"presets length {len(ps)} (expected 12)"
        assert ps == many[:12]

    def test_non_string_presets_dropped(self, client, group_code):
        # Mix strings + ints + None + dicts
        mixed = ["cheaper", 42, None, {"x": 1}, "outdoorsy", True]
        r = client.put(
            f"{API}/groups/{group_code}/remix-defaults",
            json={"presets": mixed, "hint": "mix"},
            timeout=15,
        )
        # Pydantic may 422 on type mismatch; if so flag, else verify filtering.
        assert r.status_code == 200, f"status {r.status_code}: {r.text[:200]}"
        ps = r.json().get("remix_defaults", {}).get("presets") or []
        assert all(isinstance(p, str) for p in ps), f"non-strings present: {ps}"
        assert "cheaper" in ps and "outdoorsy" in ps

    def test_cleanup_remix_defaults(self, client, group_code):
        # Reset to empty so other tests aren't polluted.
        client.put(f"{API}/groups/{group_code}/remix-defaults",
                   json={"presets": [], "hint": ""}, timeout=15)


# =========================================================================== #
# RECURRENCE TOGGLE                                                           #
# =========================================================================== #
class TestRecurrence:
    @pytest.mark.parametrize("kind", ["weekly", "biweekly", "none"])
    def test_valid_kinds(self, client, group_code, kind):
        r = client.put(f"{API}/groups/{group_code}/recurrence",
                       json={"kind": kind}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("recurrence_kind") == kind

        g = client.get(f"{API}/groups/{group_code}", timeout=15).json()
        assert g.get("recurrence_kind") == kind

    def test_invalid_kind_rejected(self, client, group_code):
        r = client.put(f"{API}/groups/{group_code}/recurrence",
                       json={"kind": "monthly"}, timeout=15)
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"

    def test_default_recurrence_for_old_group(self, client):
        """A freshly created group should default to 'none' (or omit field)."""
        body = {"group_name": "TEST_Recur", "creator_name": "T"}
        r = client.post(f"{API}/groups", json=body, timeout=15)
        assert r.status_code == 200
        code = r.json()["group"]["code"]
        g = client.get(f"{API}/groups/{code}", timeout=15).json()
        rk = g.get("recurrence_kind", "none")
        assert rk == "none", f"expected default 'none', got {rk!r}"


# =========================================================================== #
# OG CARD IMAGE                                                               #
# =========================================================================== #
class TestOgCard:
    def test_generic_og_png(self, client):
        r = client.get(f"{API}/og.png", timeout=20)
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").lower().startswith("image/png"), \
            f"content-type: {r.headers.get('content-type')}"
        assert r.content[:4] == b"\x89PNG", \
            f"PNG magic bytes missing: {r.content[:8]!r}"
        cc = r.headers.get("cache-control", "")
        assert cc == "public, max-age=3600, s-maxage=3600", f"cache-control: {cc!r}"

    def test_personalized_og_png(self, client, group_code):
        r = client.get(f"{API}/og/{group_code}.png", timeout=20)
        assert r.status_code == 200
        assert r.headers.get("content-type", "").lower().startswith("image/png")
        assert r.content[:4] == b"\x89PNG"
        cc = r.headers.get("cache-control", "")
        assert cc == "public, max-age=3600, s-maxage=3600"

    def test_bogus_code_falls_back(self, client):
        r = client.get(f"{API}/og/ZZZZZZ.png", timeout=20)
        assert r.status_code == 200, f"expected 200 fallback, got {r.status_code}"
        assert r.content[:4] == b"\x89PNG"
