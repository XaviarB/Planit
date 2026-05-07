from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import string
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import httpx


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Astral concierge — imported AFTER load_dotenv so the LLM key is visible.
from astral import parse_busy_text, suggest_hangouts, draft_invite  # noqa: E402
from calendar_sync import (  # noqa: E402
    fetch_ics, parse_ics_to_slots, build_member_feed, merge_slot_lists,
)

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------- Models ----------

DEFAULT_REASONS = [
    {"label": "Work",   "color": "#7FB3D5"},
    {"label": "Class",  "color": "#C39BD3"},
    {"label": "Gym",    "color": "#F1948A"},
    {"label": "Sleep",  "color": "#5D6D7E"},
]


class BusyReason(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    color: str  # hex e.g. #aabbcc


class AvailabilitySlot(BaseModel):
    """status: 'free' | 'busy'  mode: 'weekly' | 'date'"""
    model_config = ConfigDict(extra="ignore")
    mode: str  # "weekly" or "date"
    key: str   # "d{0-6}" for weekly or ISO date "YYYY-MM-DD" for date
    hour: int  # 0-23
    minute: int = 0  # 0-59 — start minute of the block
    step: int = 60   # block length in minutes (60 | 30 | 15) — for sub-hour scheduling
    status: str  # "free" | "busy"
    reason_id: Optional[str] = None


class MemberCalendar(BaseModel):
    """An external calendar subscription registered by a member.

    `kind`:
      - "url"   — we will periodically (or on demand) fetch `value` and merge
                  the resulting busy slots.
      - "raw"   — `value` is a one-time .ics blob the user uploaded; we parsed
                  it once and persisted nothing more than the metadata. We
                  keep the URL/blob OFF the wire on read endpoints.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str = "External calendar"
    kind: str = "url"            # "url" | "raw"
    value: str = ""              # iCal URL (kind=url) or hash placeholder (raw)
    last_synced_at: Optional[str] = None
    last_event_count: int = 0
    last_added: int = 0
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class BusyTemplate(BaseModel):
    """A reusable busy pattern, e.g. "work week" or "class schedule"."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str = "Untitled template"
    color: str = "#7FB3D5"
    # Stored as weekly-mode slots so the template is week-agnostic. Apply
    # paints them onto a target date range.
    slots: List[AvailabilitySlot] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Member(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str = "#1ABC9C"
    slots: List[AvailabilitySlot] = []
    # Optional per-member location override (e.g. "Bushwick, NY"). Falls back
    # to the group's base location when absent. Astral uses this to better
    # tune suggestions to whoever's actually showing up.
    location: Optional[str] = None
    # Calendar subscriptions and saved busy patterns. Always default-empty so
    # older documents continue to load.
    calendars: List[MemberCalendar] = []
    templates: List[BusyTemplate] = []
    joined_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class HangoutRSVP(BaseModel):
    member_id: str
    status: str = "yes"   # "yes" | "maybe" | "no"
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Hangout(BaseModel):
    """A concrete planned hangout — the "commitment ladder" output. Created
    when someone Locks-In an Astral suggestion (or manually). Drives the
    per-member .ics feed."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str = "Planit hangout"
    status: str = "tentative"   # "tentative" | "locked"
    start_iso: str = ""         # full ISO datetime in UTC
    end_iso: str = ""
    location_name: Optional[str] = None
    address: Optional[str] = None
    astral_take: Optional[str] = None
    invite_message: Optional[str] = None
    suggestion_snapshot: Optional[Dict] = None  # raw Astral card for traceability
    rsvps: List[HangoutRSVP] = []
    created_by: Optional[str] = None  # member_id
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    name: str
    # Optional group "home base" location (e.g. "Brooklyn, NY"). Used by
    # Astral to ground hangout suggestions in real venues nearby.
    location: Optional[str] = None
    members: List[Member] = []
    reasons: List[BusyReason] = []
    hangouts: List[Hangout] = []
    heat_colors: List[str] = Field(default_factory=lambda: [
        "#1f0500",  # 0 free  — ember black (darkest)
        "#dc2626",  # 1 (a few) — deep neon red
        "#fb923c",  # 2 (half) — neon orange
        "#fcd34d",  # 3 (most) — bright amber
        "#fffbeb",  # 4 (everyone) — cream glow (lightest)
    ])
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# Request models
class CreateGroupReq(BaseModel):
    group_name: str
    creator_name: str
    location: Optional[str] = None  # optional group home base


class JoinGroupReq(BaseModel):
    name: str


class UpdateSlotsReq(BaseModel):
    slots: List[AvailabilitySlot]


class CreateReasonReq(BaseModel):
    label: str
    color: str


class RenameMemberReq(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None  # also used to update per-member location


class UpdateGroupReq(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    heat_colors: Optional[List[str]] = None


# ---------- Astral request models ----------

class AstralParseBusyReq(BaseModel):
    text: str
    anchor_iso: Optional[str] = None  # defaults to today UTC


class AstralSuggestReq(BaseModel):
    # Time window the user wants suggestions for (free-form, e.g. "Sat 7-11pm").
    window_blurb: str
    # Optional: which member ids are participating in this window. If empty,
    # all members are assumed in.
    participant_ids: Optional[List[str]] = None
    # Optional override of the location to ground suggestions in. Falls back
    # to the group's base location.
    location_override: Optional[str] = None
    # Optional inside-joke history blurb the UI may pass ("we tried tuesday
    # last time and 2 of you flaked").
    history_blurb: Optional[str] = None


class AstralDraftInviteReq(BaseModel):
    suggestion: Dict
    window_blurb: str


# ---------- Calendar / Template / Hangout request models ----------

class AddCalendarReq(BaseModel):
    label: Optional[str] = "External calendar"
    kind: str = "url"            # "url" | "raw"
    url: Optional[str] = None    # required when kind=url
    ics_text: Optional[str] = None  # required when kind=raw


class PreviewIcsReq(BaseModel):
    """Parse-only preview — returns slots without persisting anything."""
    kind: str = "url"
    url: Optional[str] = None
    ics_text: Optional[str] = None


class MergeSlotsReq(BaseModel):
    """Merge a list of incoming slots into a member's existing slot list."""
    slots: List[AvailabilitySlot]


class CreateTemplateReq(BaseModel):
    name: str
    color: Optional[str] = "#7FB3D5"
    # Slots may be either weekly-mode (preferred) or date-mode (we'll fold into
    # weekly day-of-week buckets so it can be re-applied later).
    slots: List[AvailabilitySlot]


class ApplyTemplateReq(BaseModel):
    """Project a saved template's weekly slots onto N concrete weeks ahead.
    `weeks_ahead` must be 1-12; `start_iso` is the Monday of week 0 — defaults
    to the current week's Monday in UTC."""
    weeks_ahead: int = 4
    start_iso: Optional[str] = None
    overwrite: bool = False  # if False we add busy slots; if True we overwrite same-key/hour


class CreateHangoutReq(BaseModel):
    title: Optional[str] = None
    start_iso: str
    end_iso: str
    location_name: Optional[str] = None
    address: Optional[str] = None
    astral_take: Optional[str] = None
    invite_message: Optional[str] = None
    status: str = "tentative"  # "tentative" | "locked"
    suggestion_snapshot: Optional[Dict] = None
    created_by: Optional[str] = None


class UpdateHangoutReq(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None
    start_iso: Optional[str] = None
    end_iso: Optional[str] = None
    location_name: Optional[str] = None
    address: Optional[str] = None
    astral_take: Optional[str] = None
    invite_message: Optional[str] = None


class RsvpReq(BaseModel):
    status: str  # "yes" | "maybe" | "no"


# ---------- Helpers ----------

def gen_code(n: int = 6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(n))


async def find_group(code: str) -> dict:
    g = await db.groups.find_one({"code": code.upper()}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g


# ---------- Routes ----------

@api_router.get("/")
async def root():
    return {"message": "Planit API"}


@api_router.post("/groups")
async def create_group(req: CreateGroupReq):
    # Generate unique code
    for _ in range(10):
        code = gen_code()
        if not await db.groups.find_one({"code": code}):
            break

    creator = Member(
        name=req.creator_name.strip() or "Anon",
        color=random_member_color(0),
        location=(req.location or "").strip() or None,
    )
    reasons = [BusyReason(**r) for r in DEFAULT_REASONS]
    group = Group(
        code=code,
        name=req.group_name.strip() or "Untitled Group",
        location=(req.location or "").strip() or None,
        members=[creator],
        reasons=reasons,
    )
    await db.groups.insert_one(group.model_dump())
    return {"group": group.model_dump(), "member_id": creator.id}


@api_router.get("/groups/{code}")
async def get_group(code: str):
    g = await find_group(code)
    # Backfill heat_colors for older docs
    if not g.get("heat_colors"):
        g["heat_colors"] = [
            "#1f0500", "#dc2626", "#fb923c", "#fcd34d", "#fffbeb",
        ]
    return g


@api_router.put("/groups/{code}")
async def update_group(code: str, req: UpdateGroupReq):
    await find_group(code)
    update: Dict = {}
    if req.name is not None:
        update["name"] = req.name.strip() or "Untitled Group"
    if req.location is not None:
        # Empty string clears the location.
        update["location"] = req.location.strip() or None
    if req.heat_colors is not None:
        if len(req.heat_colors) != 5:
            raise HTTPException(status_code=400, detail="heat_colors must have 5 entries")
        update["heat_colors"] = req.heat_colors
    if not update:
        return {"ok": True}
    await db.groups.update_one({"code": code.upper()}, {"$set": update})
    g = await find_group(code)
    return g


@api_router.delete("/groups/{code}")
async def delete_group(code: str):
    """Hard-delete a group and all its data."""
    await find_group(code)
    await db.groups.delete_one({"code": code.upper()})
    return {"ok": True}


@api_router.delete("/groups/{code}/members/{member_id}")
async def leave_group(code: str, member_id: str):
    """Remove a member from a group. If no members remain, the whole group is auto-deleted."""
    g = await find_group(code)
    members = [m for m in g.get("members", []) if m.get("id") != member_id]
    if len(members) == len(g.get("members", [])):
        raise HTTPException(status_code=404, detail="Member not found")
    if len(members) == 0:
        # Last member left — dissolve the entire group
        await db.groups.delete_one({"code": code.upper()})
        return {"ok": True, "dissolved": True}
    await db.groups.update_one(
        {"code": code.upper()}, {"$set": {"members": members}}
    )
    return {"ok": True, "dissolved": False}


@api_router.post("/groups/{code}/members")
async def join_group(code: str, req: JoinGroupReq):
    g = await find_group(code)
    idx = len(g.get("members", []))
    member = Member(name=req.name.strip() or f"Friend {idx+1}", color=random_member_color(idx))
    await db.groups.update_one(
        {"code": code.upper()},
        {"$push": {"members": member.model_dump()}}
    )
    return {"member_id": member.id, "member": member.model_dump()}


@api_router.put("/groups/{code}/members/{member_id}/slots")
async def update_slots(code: str, member_id: str, req: UpdateSlotsReq):
    g = await find_group(code)
    found = False
    for m in g["members"]:
        if m["id"] == member_id:
            found = True
            break
    if not found:
        raise HTTPException(status_code=404, detail="Member not found")

    slots = [s.model_dump() for s in req.slots]
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": {"members.$.slots": slots}}
    )
    return {"ok": True, "count": len(slots)}


@api_router.put("/groups/{code}/members/{member_id}")
async def rename_member(code: str, member_id: str, req: RenameMemberReq):
    await find_group(code)
    set_doc: Dict = {}
    if req.name is not None:
        set_doc["members.$.name"] = req.name.strip() or "Friend"
    if req.location is not None:
        # Empty string clears the per-member location.
        set_doc["members.$.location"] = req.location.strip() or None
    if not set_doc:
        return {"ok": True}
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": set_doc}
    )
    return {"ok": True}


# ---------- Astral concierge endpoints ----------

@api_router.post("/groups/{code}/astral/parse-busy")
async def astral_parse_busy(code: str, req: AstralParseBusyReq):
    """Natural-language → list of busy slots. Member is responsible for merging
    into their existing slot list (frontend keeps the editor's UX in charge)."""
    await find_group(code)
    anchor = (req.anchor_iso or datetime.now(timezone.utc).isoformat())[:10]
    slots = await parse_busy_text(req.text or "", anchor)
    return {"slots": slots, "count": len(slots)}


@api_router.post("/groups/{code}/astral/suggest")
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
    )
    out["used_location"] = location
    out["participant_count"] = member_count
    return out


@api_router.post("/groups/{code}/astral/draft-invite")
async def astral_draft_invite(code: str, req: AstralDraftInviteReq):
    g = await find_group(code)
    msg = await draft_invite(
        suggestion=req.suggestion or {},
        group_name=g.get("name") or "the group",
        window_blurb=req.window_blurb or "later",
    )
    return {"message": msg}


# =============================================================================
# Calendar sync — IN (external → planit busy) and OUT (planit → external feed)
# =============================================================================

def _member_or_404(g: dict, member_id: str) -> dict:
    m = next((x for x in (g.get("members") or []) if x.get("id") == member_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    return m


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
            # Show prefix + ellipsis; never the secret token at the end.
            out["value_masked"] = val[:24] + ("…" if len(val) > 24 else "")
        else:
            out["value_masked"] = "(uploaded .ics)"
    out.pop("value", None)
    return out


@api_router.post("/groups/{code}/astral/preview-ics")
async def preview_ics(code: str, req: PreviewIcsReq):
    """Pre-flight an iCal source and return the slots we'd merge — without
    persisting anything. Used for the 'connect calendar' UX so users see what
    they're about to import."""
    await find_group(code)
    slots = await _ingest_ics(req.kind, req.url, req.ics_text)
    return {"count": len(slots), "slots": slots}


@api_router.get("/groups/{code}/members/{member_id}/calendars")
async def list_calendars(code: str, member_id: str):
    g = await find_group(code)
    m = _member_or_404(g, member_id)
    return {"calendars": [_scrub_calendar(c) for c in (m.get("calendars") or [])]}


@api_router.post("/groups/{code}/members/{member_id}/calendars")
async def add_calendar(code: str, member_id: str, req: AddCalendarReq):
    """Attach a calendar to a member AND immediately sync it. Returns the new
    calendar (with masked secret) plus the list of slots that were merged."""
    g = await find_group(code)
    _member_or_404(g, member_id)

    slots = await _ingest_ics(req.kind, req.url, req.ics_text)
    cal = MemberCalendar(
        label=(req.label or "External calendar").strip() or "External calendar",
        kind=req.kind,
        value=(req.url or "").strip() if req.kind == "url" else "raw://uploaded",
        last_synced_at=datetime.now(timezone.utc).isoformat(),
        last_event_count=len(slots),
        last_added=0,
    )

    # Merge slots into member's existing schedule.
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
    return {"calendar": _scrub_calendar(cal.model_dump()), "added": added, "total_events": len(slots)}


@api_router.post("/groups/{code}/members/{member_id}/calendars/{cal_id}/sync")
async def sync_calendar(code: str, member_id: str, cal_id: str):
    g = await find_group(code)
    m = _member_or_404(g, member_id)
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
    # Update calendar metadata. We use a 2-step update because Mongo doesn't
    # support nested-array $set in one go without arrayFilters.
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


@api_router.delete("/groups/{code}/members/{member_id}/calendars/{cal_id}")
async def delete_calendar(code: str, member_id: str, cal_id: str):
    g = await find_group(code)
    _member_or_404(g, member_id)
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$pull": {"members.$.calendars": {"id": cal_id}}},
    )
    return {"ok": True}


# ----- OUT: per-member iCal feed -----

@api_router.get("/groups/{code}/members/{member_id}/feed.ics")
async def member_feed(code: str, member_id: str):
    """Public subscribable iCal feed of every locked/tentative hangout the
    member hasn't declined. Subscribe via Google/Apple/Outlook to auto-mirror
    Planit hangouts into your calendar app — no OAuth needed."""
    from fastapi.responses import Response

    g = await find_group(code)
    _member_or_404(g, member_id)
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


# =============================================================================
# Templates — save & re-apply busy patterns
# =============================================================================

def _normalize_template_slots(slots: List[Dict]) -> List[Dict]:
    """Templates are weekly-mode by definition. Fold any date-mode slots into
    weekly via day-of-week. Drops `key` for date inputs."""
    out: List[Dict] = []
    seen = set()
    for s in slots:
        try:
            mode = s.get("mode") or "weekly"
            if mode == "weekly":
                key = s.get("key", "d0")
            else:
                # Convert ISO date → "d{0..6}" (Monday=0, Sunday=6)
                d = datetime.fromisoformat(s["key"]).date()
                key = f"d{d.weekday()}"
            sig = (key, int(s.get("hour", 0)), int(s.get("minute", 0)))
            if sig in seen:
                continue
            seen.add(sig)
            out.append({
                "mode": "weekly",
                "key": key,
                "hour": int(s.get("hour", 0)),
                "minute": int(s.get("minute", 0)),
                "step": int(s.get("step", 60)),
                "status": "busy",
                "reason_id": s.get("reason_id"),
            })
        except Exception:
            continue
    return out


@api_router.get("/groups/{code}/members/{member_id}/templates")
async def list_templates(code: str, member_id: str):
    g = await find_group(code)
    m = _member_or_404(g, member_id)
    return {"templates": m.get("templates") or []}


@api_router.post("/groups/{code}/members/{member_id}/templates")
async def create_template(code: str, member_id: str, req: CreateTemplateReq):
    g = await find_group(code)
    _member_or_404(g, member_id)
    template = BusyTemplate(
        name=(req.name or "Template").strip() or "Template",
        color=req.color or "#7FB3D5",
        slots=[AvailabilitySlot(**s) for s in _normalize_template_slots([s.model_dump() for s in req.slots])],
    )
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$push": {"members.$.templates": template.model_dump()}},
    )
    return template.model_dump()


@api_router.delete("/groups/{code}/members/{member_id}/templates/{tpl_id}")
async def delete_template(code: str, member_id: str, tpl_id: str):
    g = await find_group(code)
    _member_or_404(g, member_id)
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$pull": {"members.$.templates": {"id": tpl_id}}},
    )
    return {"ok": True}


@api_router.post("/groups/{code}/members/{member_id}/templates/{tpl_id}/apply")
async def apply_template(code: str, member_id: str, tpl_id: str, req: ApplyTemplateReq):
    g = await find_group(code)
    m = _member_or_404(g, member_id)
    tpl = next((t for t in (m.get("templates") or []) if t.get("id") == tpl_id), None)
    if not tpl:
        raise HTTPException(status_code=404, detail="template not found")

    weeks = max(1, min(int(req.weeks_ahead or 1), 12))
    if req.start_iso:
        try:
            base = datetime.fromisoformat(req.start_iso[:10]).date()
        except Exception:
            base = datetime.now(timezone.utc).date()
    else:
        base = datetime.now(timezone.utc).date()
    # Round to that week's Monday.
    base = base - timedelta(days=base.weekday())

    incoming: List[Dict] = []
    for week in range(weeks):
        week_start = base + timedelta(days=7 * week)
        for s in (tpl.get("slots") or []):
            try:
                d_idx = int(str(s.get("key", "d0")).lstrip("d"))
            except Exception:
                d_idx = 0
            target = week_start + timedelta(days=d_idx)
            incoming.append({
                "mode": "date",
                "key": target.isoformat(),
                "hour": int(s.get("hour", 0)),
                "minute": int(s.get("minute", 0)),
                "step": int(s.get("step", 60)),
                "status": "busy",
                "reason_id": s.get("reason_id"),
            })

    existing = m.get("slots") or []
    if req.overwrite:
        merged, added = merge_slot_lists(existing, incoming)
    else:
        # Skip slots that already have a busy entry — additive only.
        existing_keys = {(s.get("mode"), s.get("key"), s.get("hour"), s.get("minute")) for s in existing}
        non_clash = [s for s in incoming if (s["mode"], s["key"], s["hour"], s["minute"]) not in existing_keys]
        merged = existing + non_clash
        added = len(non_clash)

    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": {"members.$.slots": merged}},
    )
    return {"added": added, "weeks": weeks, "total_painted": len(incoming)}


# =============================================================================
# Hangouts — Phase 4 commitment ladder
# =============================================================================

@api_router.get("/groups/{code}/hangouts")
async def list_hangouts(code: str):
    g = await find_group(code)
    return {"hangouts": g.get("hangouts") or []}


@api_router.post("/groups/{code}/hangouts")
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


@api_router.put("/groups/{code}/hangouts/{hid}")
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


@api_router.put("/groups/{code}/hangouts/{hid}/rsvp/{member_id}")
async def rsvp_hangout(code: str, hid: str, member_id: str, req: RsvpReq):
    g = await find_group(code)
    _member_or_404(g, member_id)
    status = (req.status or "").lower()
    if status not in ("yes", "maybe", "no"):
        raise HTTPException(status_code=400, detail="status must be yes|maybe|no")

    # Try to update an existing RSVP first; if none, push a new one.
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


@api_router.delete("/groups/{code}/hangouts/{hid}")
async def delete_hangout(code: str, hid: str):
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$pull": {"hangouts": {"id": hid}}},
    )
    return {"ok": True}


# =============================================================================
# Misc reasons (existing)
# =============================================================================


@api_router.post("/groups/{code}/reasons")
async def add_reason(code: str, req: CreateReasonReq):
    await find_group(code)
    reason = BusyReason(label=req.label.strip() or "Reason", color=req.color)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$push": {"reasons": reason.model_dump()}}
    )
    return reason.model_dump()


@api_router.delete("/groups/{code}/reasons/{reason_id}")
async def delete_reason(code: str, reason_id: str):
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$pull": {"reasons": {"id": reason_id}}}
    )
    return {"ok": True}


def random_member_color(idx: int) -> str:
    palette = [
        "#1ABC9C", "#48C9B0", "#F39C12", "#E67E22",
        "#E74C3C", "#9B59B6", "#3498DB", "#2ECC71",
        "#F1C40F", "#E91E63", "#00BCD4", "#8E44AD",
    ]
    return palette[idx % len(palette)]


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
