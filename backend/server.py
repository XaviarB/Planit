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
from datetime import datetime, timezone


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Astral concierge — imported AFTER load_dotenv so the LLM key is visible.
from astral import parse_busy_text, suggest_hangouts, draft_invite  # noqa: E402

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


class Member(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str = "#1ABC9C"
    slots: List[AvailabilitySlot] = []
    # Optional per-member location override (e.g. "Bushwick, NY"). Falls back
    # to the group's base location when absent. Astral uses this to better
    # tune suggestions to whoever's actually showing up.
    location: Optional[str] = None
    joined_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    name: str
    # Optional group "home base" location (e.g. "Brooklyn, NY"). Used by
    # Astral to ground hangout suggestions in real venues nearby.
    location: Optional[str] = None
    members: List[Member] = []
    reasons: List[BusyReason] = []
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
