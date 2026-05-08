"""Hangouts — Phase 4 commitment ladder."""
from datetime import datetime, timezone
from typing import Dict

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from calendar_sync import build_single_event_ics
from core import (
    CreateHangoutReq,
    Hangout,
    HangoutRSVP,
    RsvpReq,
    UpdateHangoutReq,
    db,
    find_group,
    member_or_404,
)

router = APIRouter()


@router.get("/groups/{code}/hangouts")
async def list_hangouts(code: str):
    g = await find_group(code)
    return {"hangouts": g.get("hangouts") or []}


@router.post("/groups/{code}/hangouts")
async def create_hangout(code: str, req: CreateHangoutReq):
    await find_group(code)
    h = Hangout(
        title=(req.title or "Planit hangout").strip() or "Planit hangout",
        status=("locked" if (req.status or "").lower() == "locked" else "tentative"),
        start_iso=req.start_iso,
        end_iso=req.end_iso,
        location_name=req.location_name,
        address=req.address,
        astral_take=req.astral_take,
        invite_message=req.invite_message,
        suggestion_snapshot=req.suggestion_snapshot,
        created_by=req.created_by,
        rsvps=[],
    )
    await db.groups.update_one(
        {"code": code.upper()},
        {"$push": {"hangouts": h.model_dump()}},
    )
    return h.model_dump()


@router.put("/groups/{code}/hangouts/{hid}")
async def update_hangout(code: str, hid: str, req: UpdateHangoutReq):
    await find_group(code)
    set_doc: Dict = {}
    for f in (
        "title", "status", "start_iso", "end_iso",
        "location_name", "address", "astral_take", "invite_message",
    ):
        v = getattr(req, f)
        if v is not None:
            set_doc[f"hangouts.$.{f}"] = v
    if not set_doc:
        return {"ok": True}
    await db.groups.update_one(
        {"code": code.upper(), "hangouts.id": hid},
        {"$set": set_doc},
    )
    return {"ok": True}


@router.put("/groups/{code}/hangouts/{hid}/rsvp/{member_id}")
async def rsvp_hangout(code: str, hid: str, member_id: str, req: RsvpReq):
    g = await find_group(code)
    member_or_404(g, member_id)
    status = (req.status or "").lower()
    if status not in ("yes", "maybe", "no"):
        raise HTTPException(status_code=400, detail="status must be yes|maybe|no")

    res = await db.groups.update_one(
        {"code": code.upper(), "hangouts.id": hid, "hangouts.rsvps.member_id": member_id},
        {
            "$set": {
                "hangouts.$[h].rsvps.$[r].status": status,
                "hangouts.$[h].rsvps.$[r].updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        array_filters=[{"h.id": hid}, {"r.member_id": member_id}],
    )
    if res.matched_count == 0:
        new = HangoutRSVP(member_id=member_id, status=status).model_dump()
        await db.groups.update_one(
            {"code": code.upper(), "hangouts.id": hid},
            {"$push": {"hangouts.$.rsvps": new}},
        )
    return {"ok": True, "status": status}


@router.delete("/groups/{code}/hangouts/{hid}")
async def delete_hangout(code: str, hid: str):
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$pull": {"hangouts": {"id": hid}}},
    )
    return {"ok": True}


@router.get("/groups/{code}/hangouts/{hid}/event.ics")
async def hangout_single_event_ics(code: str, hid: str):
    """One-shot .ics download for a single Hangout — distinct from the
    member feed (which is a recurring subscription URL)."""
    g = await find_group(code)
    h = next((x for x in (g.get("hangouts") or []) if x.get("id") == hid), None)
    if not h:
        raise HTTPException(status_code=404, detail="Hangout not found")
    body = build_single_event_ics(
        hangout=h,
        group_code=code.upper(),
        group_name=g.get("name") or "Group",
    )
    fname = (h.get("title") or "planit-hangout").strip().lower().replace(" ", "-")[:48] or "planit-hangout"
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{fname}.ics"'},
    )
