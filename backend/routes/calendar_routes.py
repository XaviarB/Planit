"""Calendar sync — IN (external → Planit busy) and OUT (per-member iCal feed)."""
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from calendar_sync import (
    build_member_feed,
    fetch_ics,
    merge_slot_lists,
    parse_ics_to_slots,
)
from core import (
    AddCalendarReq,
    MemberCalendar,
    PreviewIcsReq,
    db,
    find_group,
    member_or_404,
)

router = APIRouter()


async def _ingest_ics(kind: str, url: Optional[str], ics_text: Optional[str]) -> List[Dict]:
    """Resolve `url` or `ics_text` to a parsed list of busy slots. Raises 400."""
    if kind == "url":
        if not url:
            raise HTTPException(status_code=400, detail="url required for kind=url")
        try:
            txt = await fetch_ics(url)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=400, detail=f"could not fetch calendar: {e}")
        except Exception as e:  # noqa: BLE001
            raise HTTPException(status_code=400, detail=f"bad calendar url: {e}")
    elif kind == "raw":
        if not ics_text:
            raise HTTPException(status_code=400, detail="ics_text required for kind=raw")
        txt = ics_text
    else:
        raise HTTPException(status_code=400, detail="kind must be 'url' or 'raw'")
    return parse_ics_to_slots(txt)


def _scrub_calendar(c: Dict) -> Dict:
    """Mask the secret URL/blob before sending to the client."""
    out = dict(c)
    val = out.get("value", "") or ""
    if val:
        if val.startswith("http"):
            out["value_masked"] = val[:24] + ("…" if len(val) > 24 else "")
        else:
            out["value_masked"] = "(uploaded .ics)"
    out.pop("value", None)
    return out


@router.post("/groups/{code}/astral/preview-ics")
async def preview_ics(code: str, req: PreviewIcsReq):
    """Pre-flight an iCal source and return the slots we'd merge — without
    persisting anything. Used for the 'connect calendar' UX so users see what
    they're about to import."""
    await find_group(code)
    slots = await _ingest_ics(req.kind, req.url, req.ics_text)
    return {"count": len(slots), "slots": slots}


@router.get("/groups/{code}/members/{member_id}/calendars")
async def list_calendars(code: str, member_id: str):
    g = await find_group(code)
    m = member_or_404(g, member_id)
    return {"calendars": [_scrub_calendar(c) for c in (m.get("calendars") or [])]}


@router.post("/groups/{code}/members/{member_id}/calendars")
async def add_calendar(code: str, member_id: str, req: AddCalendarReq):
    """Attach a calendar to a member AND immediately sync it. Returns the new
    calendar (with masked secret) plus the list of slots that were merged."""
    g = await find_group(code)
    member_or_404(g, member_id)

    slots = await _ingest_ics(req.kind, req.url, req.ics_text)
    cal = MemberCalendar(
        label=(req.label or "External calendar").strip() or "External calendar",
        kind=req.kind,
        value=(req.url or "").strip() if req.kind == "url" else "raw://uploaded",
        last_synced_at=datetime.now(timezone.utc).isoformat(),
        last_event_count=len(slots),
        last_added=0,
    )

    m = next(x for x in g["members"] if x["id"] == member_id)
    merged, added = merge_slot_lists(m.get("slots") or [], slots)
    cal.last_added = added

    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {
            "$set": {"members.$.slots": merged},
            "$push": {"members.$.calendars": cal.model_dump()},
        },
    )
    return {
        "calendar": _scrub_calendar(cal.model_dump()),
        "added": added,
        "total_events": len(slots),
    }


@router.post("/groups/{code}/members/{member_id}/calendars/{cal_id}/sync")
async def sync_calendar(code: str, member_id: str, cal_id: str):
    g = await find_group(code)
    m = member_or_404(g, member_id)
    cal = next((c for c in (m.get("calendars") or []) if c.get("id") == cal_id), None)
    if not cal:
        raise HTTPException(status_code=404, detail="calendar not found")
    if cal.get("kind") != "url":
        raise HTTPException(status_code=400, detail="raw .ics uploads cannot be re-synced")

    slots = await _ingest_ics("url", cal.get("value"), None)
    merged, added = merge_slot_lists(m.get("slots") or [], slots)

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": {"members.$.slots": merged}},
    )
    await db.groups.update_one(
        {"code": code.upper()},
        {
            "$set": {
                "members.$[m].calendars.$[c].last_synced_at": now_iso,
                "members.$[m].calendars.$[c].last_event_count": len(slots),
                "members.$[m].calendars.$[c].last_added": added,
            }
        },
        array_filters=[{"m.id": member_id}, {"c.id": cal_id}],
    )
    return {"added": added, "total_events": len(slots), "last_synced_at": now_iso}


@router.delete("/groups/{code}/members/{member_id}/calendars/{cal_id}")
async def delete_calendar(code: str, member_id: str, cal_id: str):
    g = await find_group(code)
    member_or_404(g, member_id)
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$pull": {"members.$.calendars": {"id": cal_id}}},
    )
    return {"ok": True}


@router.get("/groups/{code}/members/{member_id}/feed.ics")
async def member_feed(code: str, member_id: str):
    """Public subscribable iCal feed of every locked/tentative hangout the
    member hasn't declined. Subscribe via Google/Apple/Outlook to auto-mirror
    Planit hangouts into your calendar app — no OAuth needed."""
    g = await find_group(code)
    member_or_404(g, member_id)
    body = build_member_feed(
        feed_uid_prefix=f"{code.upper()}-{member_id[:8]}",
        feed_name=f"Planit · {g.get('name', 'Group')}",
        hangouts=[{**h, "group_code": code.upper()} for h in (g.get("hangouts") or [])],
        member_id=member_id,
    )
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="planit-{code.upper()}.ics"'},
    )
