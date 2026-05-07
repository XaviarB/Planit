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
    joined_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    name: str
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


class JoinGroupReq(BaseModel):
    name: str


class UpdateSlotsReq(BaseModel):
    slots: List[AvailabilitySlot]


class CreateReasonReq(BaseModel):
    label: str
    color: str


class RenameMemberReq(BaseModel):
    name: str


class UpdateGroupReq(BaseModel):
    name: Optional[str] = None
    heat_colors: Optional[List[str]] = None


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

    creator = Member(name=req.creator_name.strip() or "Anon", color=random_member_color(0))
    reasons = [BusyReason(**r) for r in DEFAULT_REASONS]
    group = Group(
        code=code,
        name=req.group_name.strip() or "Untitled Group",
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
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": {"members.$.name": req.name.strip() or "Friend"}}
    )
    return {"ok": True}


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
