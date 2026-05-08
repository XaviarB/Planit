"""Astral concierge endpoints — suggest, parse-busy, draft-invite, history,
remix-defaults, recurrence-toggle."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from astral import draft_invite, parse_busy_text, suggest_hangouts
from core import (
    AstralDraftInviteReq,
    AstralParseBusyReq,
    AstralRound,
    AstralSuggestReq,
    RemixDefaults,
    UpdateRecurrenceReq,
    UpdateRemixDefaultsReq,
    db,
    find_group,
)

router = APIRouter()


@router.post("/groups/{code}/astral/parse-busy")
async def astral_parse_busy(code: str, req: AstralParseBusyReq):
    """Natural-language → list of busy slots. The frontend is responsible for
    merging into the editor (UX stays in charge of the editor)."""
    await find_group(code)
    anchor = (req.anchor_iso or datetime.now(timezone.utc).isoformat())[:10]
    slots = await parse_busy_text(req.text or "", anchor)
    return {"slots": slots, "count": len(slots)}


@router.post("/groups/{code}/astral/suggest")
async def astral_suggest(code: str, req: AstralSuggestReq):
    """Generate up to 3 hangout suggestion cards with buzz quotes."""
    g = await find_group(code)

    members = g.get("members", []) or []
    participant_ids = req.participant_ids or [m["id"] for m in members]
    participants = [m for m in members if m["id"] in participant_ids]
    member_count = len(participants) or len(members)

    # Build a short members blurb so Astral can lightly tailor (names + areas).
    parts = []
    for m in participants[:8]:
        bit = m.get("name") or "friend"
        loc = m.get("location") or ""
        if loc:
            bit += f" ({loc})"
        parts.append(bit)
    members_blurb = ", ".join(parts) if parts else None

    location = (req.location_override or g.get("location") or "").strip() or None

    out = await suggest_hangouts(
        window_blurb=req.window_blurb or "open window",
        member_count=member_count,
        location=location,
        group_name=g.get("name") or "the group",
        history_blurb=req.history_blurb,
        member_summaries=members_blurb,
        previous_cards=req.previous_cards,
        remix_presets=req.remix_presets,
        remix_hint=req.remix_hint,
    )
    out["used_location"] = location
    out["participant_count"] = member_count
    out["was_remix"] = bool(req.previous_cards or req.remix_presets or req.remix_hint)

    # Persist this round to the group's astral_history (FIFO cap at 30 rounds).
    if not req.skip_history and (out.get("cards") or []):
        round_doc = AstralRound(
            member_id=req.member_id,
            window_blurb=req.window_blurb or "",
            used_location=location,
            history_blurb=req.history_blurb,
            intro=out.get("intro") or "",
            cards=out.get("cards") or [],
            was_remix=out["was_remix"],
            remix_presets=req.remix_presets or [],
            remix_hint=req.remix_hint,
        ).model_dump()
        await db.groups.update_one(
            {"code": code.upper()},
            {
                "$push": {
                    "astral_history": {
                        "$each": [round_doc],
                        "$slice": -30,
                    }
                }
            },
        )
        out["round_id"] = round_doc["id"]
    return out


# --------------------------------------------------------------------------- #
# Astral history — list, fetch one, clear all                                 #
# --------------------------------------------------------------------------- #


@router.get("/groups/{code}/astral/history")
async def astral_history_list(code: str, limit: int = 20):
    g = await find_group(code)
    rounds = list(g.get("astral_history") or [])
    rounds.reverse()  # newest-first
    return {"rounds": rounds[: max(1, min(limit, 50))]}


@router.delete("/groups/{code}/astral/history")
async def astral_history_clear(code: str):
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$set": {"astral_history": []}},
    )
    return {"ok": True}


@router.delete("/groups/{code}/astral/history/{round_id}")
async def astral_history_delete_one(code: str, round_id: str):
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$pull": {"astral_history": {"id": round_id}}},
    )
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Group-level remix preferences (sticky chips per group)                      #
# --------------------------------------------------------------------------- #


@router.put("/groups/{code}/remix-defaults")
async def update_remix_defaults(code: str, req: UpdateRemixDefaultsReq):
    """Save the chip presets + free-text hint that should be pre-selected
    whenever any member opens Ask Astral for this group. Empty list / empty
    string clears them."""
    await find_group(code)
    payload = RemixDefaults(
        presets=[p for p in (req.presets or []) if isinstance(p, str)][:12],
        hint=(req.hint or "").strip()[:240] or None,
    ).model_dump()
    await db.groups.update_one(
        {"code": code.upper()},
        {"$set": {"remix_defaults": payload}},
    )
    return {"ok": True, "remix_defaults": payload}


# --------------------------------------------------------------------------- #
# Recurring schedule mode                                                     #
# --------------------------------------------------------------------------- #


@router.put("/groups/{code}/recurrence")
async def update_recurrence(code: str, req: UpdateRecurrenceReq):
    """Toggle recurring schedule mode for the group. When set to "weekly" or
    "biweekly", the heatmap UI switches from calendar dates to weekday columns."""
    if req.kind not in ("none", "weekly", "biweekly"):
        raise HTTPException(status_code=400, detail="kind must be 'none' | 'weekly' | 'biweekly'")
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$set": {"recurrence_kind": req.kind}},
    )
    return {"ok": True, "recurrence_kind": req.kind}


# --------------------------------------------------------------------------- #
# Draft invite                                                                #
# --------------------------------------------------------------------------- #


@router.post("/groups/{code}/astral/draft-invite")
async def astral_draft_invite(code: str, req: AstralDraftInviteReq):
    g = await find_group(code)
    msg = await draft_invite(
        suggestion=req.suggestion or {},
        group_name=g.get("name") or "the group",
        window_blurb=req.window_blurb or "later",
    )
    return {"message": msg}
