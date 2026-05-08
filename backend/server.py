from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import random
import re
import string
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
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
    fetch_ics, parse_ics_to_slots, build_member_feed, build_single_event_ics, merge_slot_lists,
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


class MemberPrefs(BaseModel):
    """Per-member personal preferences. Persists to the member doc so they
    follow the user across devices (and roundtrip cleanly through the
    /members/{id}/prefs endpoint)."""
    color_hex: Optional[str] = None    # user-chosen avatar override
    fab_side: str = "right"            # "left" | "right" | "top" | "bottom"
    theme: str = "auto"                # "light" | "dark" | "auto"
    compact: bool = False              # tighter layout
    hidden_panels: List[str] = []      # subset of: "hangouts" | "share" | "stats"


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
    # Personal customization (FAB position, theme, hidden panels, etc.).
    # Defaults to the canonical Planit defaults so legacy members render
    # identically.
    prefs: MemberPrefs = Field(default_factory=MemberPrefs)
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


class AstralRound(BaseModel):
    """A single round of Astral suggestions persisted to the group's history.
    Auto-saved at the end of every /astral/suggest call so the group can scroll
    back through prior rounds and reopen them. Also drives the "never repeat
    a venue we've ever shown this group" guarantee on remix."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: Optional[str] = None  # who asked (for attribution)
    window_blurb: str = ""
    used_location: Optional[str] = None
    history_blurb: Optional[str] = None
    intro: str = ""
    cards: List[Dict] = []
    was_remix: bool = False
    remix_presets: List[str] = []
    remix_hint: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class RemixDefaults(BaseModel):
    """Group-level sticky remix preferences — pre-select these chips and seed
    the hint whenever any member opens Astral for this group."""
    presets: List[str] = []
    hint: Optional[str] = None


# ---------- Customization sub-models (Phase 5) ---------- #

class Branding(BaseModel):
    """Group-wide visual identity. Re-skins the Group page only — the Landing
    page intentionally stays on the global Planit palette so newcomers always
    see the canonical brand."""
    accent_hex: str = "#0f172a"        # main ink/accent color
    gradient_from: str = "#fef9e7"     # pastel yellow
    gradient_to: str = "#d1f2eb"       # pastel mint
    emoji: str = "🪐"                   # group sigil shown in the topbar
    theme_variant: str = "default"     # "default" | "noir" | "candy" | "forest" | "ocean"
    default_view: str = "dates"        # "dates" | "members"


class Locale(BaseModel):
    """Group-wide time + locale conventions. The frontend reads these to
    drive the editor / heatmap defaults."""
    timezone: str = "UTC"              # IANA, e.g. "America/New_York"
    week_start: str = "mon"            # "mon" | "sun"
    time_format: str = "12h"           # "12h" | "24h"
    day_start_hour: int = 0            # 0-23 — first hour shown in the editor
    day_end_hour: int = 23             # 1-24 — last hour shown
    slot_minutes: int = 60             # 15 | 30 | 60 — default precision


class AstralPersona(BaseModel):
    """Tunes how Astral talks to this crew. Folded into the suggest /
    draft-invite prompts on the server side."""
    display_name: str = "astral"       # rename the bot for this group
    tone: str = "edgy"                 # "edgy" | "warm" | "minimal" | "hype"
    lowercase: bool = True             # keep lowercase persona on (default)
    emoji_on: bool = True              # allow emojis in output
    default_location: Optional[str] = None  # falls back to group.location


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
    # Astral memory — last N rounds of suggestions so members can scroll
    # back, resume, and so the engine never repeats a previously-shown venue.
    astral_history: List[AstralRound] = []
    # Sticky remix preferences for this crew — the chips/hint that get
    # pre-selected whenever any member opens the Ask Astral drawer.
    remix_defaults: RemixDefaults = Field(default_factory=RemixDefaults)
    # Recurring schedule mode — "none" (default, calendar-week) or "weekly"
    # / "biweekly" (treats the heatmap as a recurring weekday cycle).
    recurrence_kind: str = "none"
    # Phase-5 customization — branding (accent, gradient, emoji, theme),
    # locale (timezone, week-start, slot-precision), and Astral's persona
    # (display name, tone, emoji on/off). Defaults reproduce the original
    # Planit look so old groups continue to render unchanged.
    branding: Branding = Field(default_factory=Branding)
    locale: Locale = Field(default_factory=Locale)
    astral_persona: AstralPersona = Field(default_factory=AstralPersona)
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
    # "date"   → one-off slots like "I'm busy this Tuesday"
    # "weekly" → recurring slots like "working all week 2-6pm"
    mode: Optional[str] = "date"


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
    # Remix mode — pass the prior cards Astral already returned and a chip
    # preset list and/or free-text hint to redirect the next round. When any
    # of these are set, Astral switches into remix mode (won't repeat venues).
    previous_cards: Optional[List[Dict]] = None
    remix_presets: Optional[List[str]] = None  # e.g. ["cheaper", "different_neighborhood"]
    remix_hint: Optional[str] = None           # e.g. "we want tacos, no bars"
    # Who's asking — used purely for history attribution when this round gets
    # auto-saved into the group's astral_history. Optional, falls back to None.
    member_id: Optional[str] = None
    # When true, do NOT persist this round to the group's astral_history.
    # Default: persist. UI uses skip_history=true if it's just exploring.
    skip_history: bool = False
    # Phase-6 — per-user persona override. Lets each member tune Astral's voice
    # in their own Astral Hub settings without touching the group-level
    # astral_persona. Shape mirrors AstralPersona (display_name, tone,
    # lowercase, emoji_on, default_location). Anything missing falls back to
    # the group persona; anything present wins. None / empty dict = ignore.
    astral_persona_override: Optional[Dict] = None


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
    # Phase-5 customization backfills — guarantee old groups have these
    # objects on the wire so the frontend can read defaults safely.
    if not g.get("branding"):
        g["branding"] = Branding().model_dump()
    if not g.get("locale"):
        g["locale"] = Locale().model_dump()
    if not g.get("astral_persona"):
        g["astral_persona"] = AstralPersona().model_dump()
    for m in (g.get("members") or []):
        if not m.get("prefs"):
            m["prefs"] = MemberPrefs().model_dump()
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
    into their existing slot list (frontend keeps the editor's UX in charge).

    `mode` is "date" (one-off slots, default) or "weekly" (recurring slots
    keyed d0..d6). Used by the in-editor "recurring events" parser.
    """
    await find_group(code)
    anchor = (req.anchor_iso or datetime.now(timezone.utc).isoformat())[:10]
    mode = req.mode if req.mode in ("date", "weekly") else "date"
    slots = await parse_busy_text(req.text or "", anchor, mode=mode)
    return {"slots": slots, "count": len(slots), "mode": mode}


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
    # Phase-5 — fold the group's customised AstralPersona into the prompt so
    # the bot's tone, name, lowercase rule and emoji preference all carry
    # through to suggest_hangouts. Falls back to default persona for old groups.
    persona = g.get("astral_persona") or AstralPersona().model_dump()
    # Phase-6 — per-user persona override (from each member's Astral Hub
    # settings). Shallow-merged onto the group persona so users only override
    # the fields they care about. Dict only — anything else is ignored.
    if isinstance(req.astral_persona_override, dict) and req.astral_persona_override:
        allowed = {"display_name", "tone", "lowercase", "emoji_on", "default_location"}
        for k, v in req.astral_persona_override.items():
            if k not in allowed:
                continue
            # Empty strings / None never override (keeps the group default).
            if v is None:
                continue
            if isinstance(v, str) and v.strip() == "" and k != "default_location":
                continue
            persona[k] = v
    # If the persona has a default_location and the request didn't override,
    # prefer that over the group base — lets the customise tab steer area.
    if not location:
        loc_override = (persona.get("default_location") or "").strip()
        if loc_override:
            location = loc_override

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
        astral_persona=persona,
    )
    out["used_location"] = location
    out["participant_count"] = member_count
    out["was_remix"] = bool(req.previous_cards or req.remix_presets or req.remix_hint)

    # Persist this round to the group's astral_history (FIFO cap at 30 rounds).
    # The drawer reads this on open to (a) show "Recent rounds" and (b) seed
    # shownCards so remix never repeats anything we've EVER shown this group.
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
                # Push then trim — keep only the last 30 rounds.
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

@api_router.get("/groups/{code}/astral/history")
async def astral_history_list(code: str, limit: int = 20):
    g = await find_group(code)
    rounds = list(g.get("astral_history") or [])
    # Newest first, capped to `limit`.
    rounds.reverse()
    return {"rounds": rounds[: max(1, min(limit, 50))]}


@api_router.delete("/groups/{code}/astral/history")
async def astral_history_clear(code: str):
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$set": {"astral_history": []}},
    )
    return {"ok": True}


@api_router.delete("/groups/{code}/astral/history/{round_id}")
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

class UpdateRemixDefaultsReq(BaseModel):
    # Use List[Any] so non-string entries pass Pydantic and get filtered at
    # runtime via the isinstance check below (spec: "silently dropped").
    presets: Optional[List[Any]] = None
    hint: Optional[str] = None


@api_router.put("/groups/{code}/remix-defaults")
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

class UpdateRecurrenceReq(BaseModel):
    kind: str  # "none" | "weekly" | "biweekly"


@api_router.put("/groups/{code}/recurrence")
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
# Customization (Phase 5) — branding · locale · astral persona · member prefs #
# Anyone in the group can edit the group-wide settings; permission is         #
# enforced as "membership" (the frontend only surfaces these when the user    #
# has joined). Per-member prefs are scoped by member_id in the URL.           #
# --------------------------------------------------------------------------- #

# ---- request models ----

class UpdateBrandingReq(BaseModel):
    accent_hex: Optional[str] = None
    gradient_from: Optional[str] = None
    gradient_to: Optional[str] = None
    emoji: Optional[str] = None
    theme_variant: Optional[str] = None
    default_view: Optional[str] = None


class UpdateLocaleReq(BaseModel):
    timezone: Optional[str] = None
    week_start: Optional[str] = None
    time_format: Optional[str] = None
    day_start_hour: Optional[int] = None
    day_end_hour: Optional[int] = None
    slot_minutes: Optional[int] = None


class UpdateAstralPersonaReq(BaseModel):
    display_name: Optional[str] = None
    tone: Optional[str] = None
    lowercase: Optional[bool] = None
    emoji_on: Optional[bool] = None
    default_location: Optional[str] = None


class UpdateMemberPrefsReq(BaseModel):
    color_hex: Optional[str] = None
    fab_side: Optional[str] = None
    theme: Optional[str] = None
    compact: Optional[bool] = None
    hidden_panels: Optional[List[str]] = None


# ---- helpers ----

_HEX_RE = re.compile(r"^#?[0-9a-fA-F]{6}$")
ALLOWED_THEME_VARIANTS = {"default", "noir", "candy", "forest", "ocean"}
ALLOWED_DEFAULT_VIEWS = {"dates", "members"}
ALLOWED_WEEK_STARTS = {"mon", "sun"}
ALLOWED_TIME_FORMATS = {"12h", "24h"}
ALLOWED_TONES = {"edgy", "warm", "minimal", "hype"}
ALLOWED_FAB_SIDES = {"left", "right", "top", "bottom"}
ALLOWED_THEMES = {"light", "dark", "auto"}
ALLOWED_HIDDEN_PANELS = {"hangouts", "share", "stats"}


def _norm_hex(s: Optional[str], default: str) -> str:
    """Coerce '#abc123' / 'abc123' to '#abc123'. Returns default on bad input."""
    if not s:
        return default
    s = s.strip()
    if not _HEX_RE.match(s):
        return default
    return s if s.startswith("#") else "#" + s


# ---- branding ----

@api_router.put("/groups/{code}/branding")
async def update_branding(code: str, req: UpdateBrandingReq):
    """Update the group's visual identity. Only fields supplied are touched —
    omitting a field leaves it unchanged. Invalid colors / variants are
    silently coerced to safe defaults."""
    g = await find_group(code)
    current = Branding(**(g.get("branding") or {}))
    update: Dict[str, str] = {}

    if req.accent_hex is not None:
        update["branding.accent_hex"] = _norm_hex(req.accent_hex, current.accent_hex)
    if req.gradient_from is not None:
        update["branding.gradient_from"] = _norm_hex(req.gradient_from, current.gradient_from)
    if req.gradient_to is not None:
        update["branding.gradient_to"] = _norm_hex(req.gradient_to, current.gradient_to)
    if req.emoji is not None:
        # Just trim and cap to a reasonable length so the topbar never blows up.
        update["branding.emoji"] = (req.emoji or "").strip()[:8] or current.emoji
    if req.theme_variant is not None:
        v = (req.theme_variant or "").strip().lower()
        update["branding.theme_variant"] = v if v in ALLOWED_THEME_VARIANTS else current.theme_variant
    if req.default_view is not None:
        v = (req.default_view or "").strip().lower()
        update["branding.default_view"] = v if v in ALLOWED_DEFAULT_VIEWS else current.default_view

    if update:
        await db.groups.update_one({"code": code.upper()}, {"$set": update})

    g2 = await find_group(code)
    return {"ok": True, "branding": g2.get("branding") or current.model_dump()}


# ---- locale ----

@api_router.put("/groups/{code}/locale")
async def update_locale(code: str, req: UpdateLocaleReq):
    """Update group-wide locale settings (timezone, week-start, time-format,
    day window, slot precision)."""
    g = await find_group(code)
    current = Locale(**(g.get("locale") or {}))
    update: Dict = {}

    if req.timezone is not None:
        # Lightly validate — accept anything that looks like an IANA-ish tz
        # so we don't ship pytz/zoneinfo lookups across cold starts.
        tz = (req.timezone or "").strip()[:64] or current.timezone
        update["locale.timezone"] = tz
    if req.week_start is not None:
        v = (req.week_start or "").strip().lower()
        update["locale.week_start"] = v if v in ALLOWED_WEEK_STARTS else current.week_start
    if req.time_format is not None:
        v = (req.time_format or "").strip().lower()
        update["locale.time_format"] = v if v in ALLOWED_TIME_FORMATS else current.time_format
    if req.day_start_hour is not None:
        h = req.day_start_hour
        update["locale.day_start_hour"] = h if isinstance(h, int) and 0 <= h <= 23 else current.day_start_hour
    if req.day_end_hour is not None:
        h = req.day_end_hour
        update["locale.day_end_hour"] = h if isinstance(h, int) and 1 <= h <= 24 else current.day_end_hour
    if req.slot_minutes is not None:
        m = req.slot_minutes
        update["locale.slot_minutes"] = m if m in (15, 30, 60) else current.slot_minutes

    # Cross-field sanity: end must be > start.
    new_start = update.get("locale.day_start_hour", current.day_start_hour)
    new_end = update.get("locale.day_end_hour", current.day_end_hour)
    if new_end <= new_start:
        # Reject silently — keep previous values to avoid wedging the heatmap.
        update.pop("locale.day_start_hour", None)
        update.pop("locale.day_end_hour", None)

    if update:
        await db.groups.update_one({"code": code.upper()}, {"$set": update})

    g2 = await find_group(code)
    return {"ok": True, "locale": g2.get("locale") or current.model_dump()}


# ---- astral persona ----

@api_router.put("/groups/{code}/astral-persona")
async def update_astral_persona(code: str, req: UpdateAstralPersonaReq):
    """Tune Astral's voice for this crew. Folded into the suggest/draft-invite
    prompts at runtime."""
    g = await find_group(code)
    current = AstralPersona(**(g.get("astral_persona") or {}))
    update: Dict = {}

    if req.display_name is not None:
        name = (req.display_name or "").strip()[:32] or current.display_name
        update["astral_persona.display_name"] = name
    if req.tone is not None:
        v = (req.tone or "").strip().lower()
        update["astral_persona.tone"] = v if v in ALLOWED_TONES else current.tone
    if req.lowercase is not None:
        update["astral_persona.lowercase"] = bool(req.lowercase)
    if req.emoji_on is not None:
        update["astral_persona.emoji_on"] = bool(req.emoji_on)
    if req.default_location is not None:
        loc = (req.default_location or "").strip()
        update["astral_persona.default_location"] = loc or None

    if update:
        await db.groups.update_one({"code": code.upper()}, {"$set": update})

    g2 = await find_group(code)
    return {"ok": True, "astral_persona": g2.get("astral_persona") or current.model_dump()}


# ---- member prefs ----

@api_router.put("/groups/{code}/members/{member_id}/prefs")
async def update_member_prefs(code: str, member_id: str, req: UpdateMemberPrefsReq):
    """Personal preferences — FAB side, theme, compact mode, hidden panels.
    Stored on the member doc so they survive across devices."""
    g = await find_group(code)
    m = next((x for x in (g.get("members") or []) if x.get("id") == member_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    current = MemberPrefs(**(m.get("prefs") or {}))
    update: Dict = {}

    if req.color_hex is not None:
        # Empty string clears the override.
        if not req.color_hex.strip():
            update["members.$.prefs.color_hex"] = None
        else:
            update["members.$.prefs.color_hex"] = _norm_hex(req.color_hex, current.color_hex or "#1ABC9C")
    if req.fab_side is not None:
        v = (req.fab_side or "").strip().lower()
        update["members.$.prefs.fab_side"] = v if v in ALLOWED_FAB_SIDES else current.fab_side
    if req.theme is not None:
        v = (req.theme or "").strip().lower()
        update["members.$.prefs.theme"] = v if v in ALLOWED_THEMES else current.theme
    if req.compact is not None:
        update["members.$.prefs.compact"] = bool(req.compact)
    if req.hidden_panels is not None:
        cleaned = [p for p in (req.hidden_panels or []) if isinstance(p, str) and p in ALLOWED_HIDDEN_PANELS]
        update["members.$.prefs.hidden_panels"] = cleaned

    if update:
        await db.groups.update_one(
            {"code": code.upper(), "members.id": member_id},
            {"$set": update},
        )

    g2 = await find_group(code)
    m2 = next((x for x in (g2.get("members") or []) if x.get("id") == member_id), None)
    return {"ok": True, "prefs": (m2 or {}).get("prefs") or current.model_dump()}


# --------------------------------------------------------------------------- #
# Open Graph preview image — for rich link unfurls in iMessage/Slack/Discord  #
# --------------------------------------------------------------------------- #

@api_router.get("/og.png")
@api_router.get("/og/{code}.png")
async def og_card(code: Optional[str] = None):
    """Generate a 1200x630 OG card PNG. If `code` is provided, the card is
    personalized with the group's name + member count + invite code; otherwise
    it's the generic Planit landing card. Cached aggressively at the edge."""
    from io import BytesIO
    from fastapi.responses import Response
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1200, 630
    BG = (250, 250, 247)        # #fafaf7 — base
    INK = (15, 23, 42)          # #0f172a — slate-900
    MINT = (209, 242, 235)      # #d1f2eb — pastel mint
    YELLOW = (254, 249, 231)    # #fef9e7 — pastel yellow
    LAVENDER = (244, 236, 247)  # #f4ecf7 — pastel lavender

    # Try to load Outfit (the heading font we use in the app); fall back to
    # PIL default if the file isn't available — the card still looks fine.
    def _font(size):
        for path in (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        ):
            try:
                return ImageFont.truetype(path, size)
            except (OSError, IOError):
                continue
        return ImageFont.load_default()

    # Personalize if a group code was given.
    title = "Planit"
    subtitle = "no accounts. no installs. just plans."
    chip_text = "tap heatmap → ask astral → lock it in"
    invite = ""
    if code:
        try:
            g = await find_group(code)
            title = (g.get("name") or "Planit").strip()[:40]
            mc = len(g.get("members") or [])
            subtitle = f"{mc} {'person' if mc == 1 else 'people'} synced. join the crew."
            chip_text = "drop your free time. astral picks the spot."
            invite = (g.get("code") or code).upper()
        except HTTPException:
            pass

    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Decorative pastel "constellation" blobs in the corners.
    for cx, cy, r, color in (
        (110, 130, 80, MINT),
        (1080, 110, 60, YELLOW),
        (1100, 540, 90, LAVENDER),
        (170, 540, 50, YELLOW),
    ):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=color, outline=INK, width=4)

    # Bold "neo-brutalist" frame.
    d.rectangle((40, 40, W - 40, H - 40), outline=INK, width=8)

    # Wordmark + invite chip top-left.
    d.text((84, 92), "PLANIT", fill=INK, font=_font(64))
    if invite:
        chip = f"  invite · {invite}  "
        cw, ch = d.textlength(chip, font=_font(28)), 40
        d.rectangle((84, 180, 84 + cw, 180 + ch), fill=MINT, outline=INK, width=3)
        d.text((84, 184), chip, fill=INK, font=_font(28))

    # Big group title.
    title_font = _font(96 if len(title) <= 18 else 78 if len(title) <= 28 else 60)
    d.text((84, 260), title, fill=INK, font=title_font)

    # Subtitle.
    d.text((84, 400), subtitle, fill=INK, font=_font(36))

    # Footer chip-callout.
    chip_font = _font(28)
    chip_pad_x, chip_pad_y = 24, 14
    chip_w = int(d.textlength(chip_text, font=chip_font)) + chip_pad_x * 2
    chip_h = 56
    d.rectangle((84, H - 110, 84 + chip_w, H - 110 + chip_h), fill=YELLOW, outline=INK, width=3)
    d.text((84 + chip_pad_x, H - 110 + chip_pad_y), chip_text, fill=INK, font=chip_font)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={
            # Cache for an hour — names/member counts don't change that often
            # and re-rendering on every link unfurl is overkill.
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
    )


@api_router.post("/groups/{code}/astral/draft-invite")
async def astral_draft_invite(code: str, req: AstralDraftInviteReq):
    g = await find_group(code)
    msg = await draft_invite(
        suggestion=req.suggestion or {},
        group_name=g.get("name") or "the group",
        window_blurb=req.window_blurb or "later",
        astral_persona=g.get("astral_persona") or AstralPersona().model_dump(),
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


@api_router.get("/groups/{code}/hangouts/{hid}/event.ics")
async def hangout_single_event_ics(code: str, hid: str):
    """One-shot .ics download for a single Hangout — distinct from the
    member feed (which is a recurring subscription URL)."""
    from fastapi.responses import Response

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
