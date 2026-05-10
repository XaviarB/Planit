"""Shared backend core — DB connection, Pydantic models, helpers.

Imported by every routes/* module. Keeps server.py thin (just app wiring +
router mounts) and lets each thematic group of endpoints live in its own
file under routes/.
"""
from __future__ import annotations

import os
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, ConfigDict, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


# --------------------------------------------------------------------------- #
# MongoDB                                                                     #
# --------------------------------------------------------------------------- #

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]


# --------------------------------------------------------------------------- #
# Constants                                                                   #
# --------------------------------------------------------------------------- #

DEFAULT_REASONS = [
    {"label": "Work",  "color": "#7FB3D5"},
    {"label": "Class", "color": "#C39BD3"},
    {"label": "Gym",   "color": "#F1948A"},
]

DEFAULT_HEAT_COLORS = [
    "#1f0500",  # 0 free  — ember black (darkest)
    "#dc2626",  # 1 (a few) — deep neon red
    "#fb923c",  # 2 (half) — neon orange
    "#fcd34d",  # 3 (most) — bright amber
    "#fffbeb",  # 4 (everyone) — cream glow (lightest)
]


# --------------------------------------------------------------------------- #
# Domain models (persisted)                                                   #
# --------------------------------------------------------------------------- #


class BusyReason(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str
    color: str  # hex e.g. #aabbcc


class AvailabilitySlot(BaseModel):
    """status: 'free' | 'busy'  mode: 'weekly' | 'date'"""
    model_config = ConfigDict(extra="ignore")
    mode: str            # "weekly" or "date"
    key: str             # "d{0-6}" for weekly or ISO date "YYYY-MM-DD" for date
    hour: int            # 0-23
    minute: int = 0      # 0-59 — start minute of the block
    step: int = 60       # block length in minutes (60 | 30 | 15) — sub-hour scheduling
    status: str          # "free" | "busy"
    reason_id: Optional[str] = None


class MemberCalendar(BaseModel):
    """An external calendar subscription registered by a member.

    `kind`:
      - "url" — periodically (or on demand) fetch `value` and merge resulting
                busy slots.
      - "raw" — `value` is a one-time .ics blob the user uploaded; parsed once
                and persisted as metadata only. We keep URL/blob OFF the wire
                on read endpoints.
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
    # Stored as weekly-mode slots so the template is week-agnostic.
    slots: List[AvailabilitySlot] = []
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class Member(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str = "#1ABC9C"
    slots: List[AvailabilitySlot] = []
    location: Optional[str] = None
    calendars: List[MemberCalendar] = []
    templates: List[BusyTemplate] = []
    joined_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    # Cross-group sync identity. Stamped from a browser-stable UUID stored in
    # localStorage so the same human shows up as the same "you" across every
    # group they belong to. When two members share a user_token, their slots
    # (busy/free state) are kept in lock-step server-side so a person only
    # has to maintain ONE schedule for every crew they're in.
    user_token: Optional[str] = None


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
    start_iso: str = ""
    end_iso: str = ""
    location_name: Optional[str] = None
    address: Optional[str] = None
    astral_take: Optional[str] = None
    invite_message: Optional[str] = None
    suggestion_snapshot: Optional[Dict] = None
    rsvps: List[HangoutRSVP] = []
    created_by: Optional[str] = None
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class AstralRound(BaseModel):
    """A single round of Astral suggestions persisted to the group's history.
    Auto-saved at the end of every /astral/suggest call so the group can scroll
    back through prior rounds and reopen them."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    member_id: Optional[str] = None
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
    presets: List[str] = []
    hint: Optional[str] = None


class Group(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    name: str
    location: Optional[str] = None
    members: List[Member] = []
    reasons: List[BusyReason] = []
    hangouts: List[Hangout] = []
    astral_history: List[AstralRound] = []
    remix_defaults: RemixDefaults = Field(default_factory=RemixDefaults)
    recurrence_kind: str = "none"  # "none" | "weekly" | "biweekly"
    heat_colors: List[str] = Field(default_factory=lambda: list(DEFAULT_HEAT_COLORS))
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


# --------------------------------------------------------------------------- #
# Request models                                                              #
# --------------------------------------------------------------------------- #


class CreateGroupReq(BaseModel):
    group_name: str
    creator_name: str
    location: Optional[str] = None
    user_token: Optional[str] = None  # cross-group sync identity (see Member)


class JoinGroupReq(BaseModel):
    name: str
    user_token: Optional[str] = None  # cross-group sync identity (see Member)


class UpdateSlotsReq(BaseModel):
    slots: List[AvailabilitySlot]


class CreateReasonReq(BaseModel):
    label: str
    color: str


class RenameMemberReq(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None


class UpdateGroupReq(BaseModel):
    name: Optional[str] = None
    location: Optional[str] = None
    heat_colors: Optional[List[str]] = None


class AstralParseBusyReq(BaseModel):
    text: str
    anchor_iso: Optional[str] = None  # defaults to today UTC


class AstralSuggestReq(BaseModel):
    window_blurb: str
    participant_ids: Optional[List[str]] = None
    location_override: Optional[str] = None
    history_blurb: Optional[str] = None
    previous_cards: Optional[List[Dict]] = None
    remix_presets: Optional[List[str]] = None
    remix_hint: Optional[str] = None
    member_id: Optional[str] = None
    skip_history: bool = False


class AstralDraftInviteReq(BaseModel):
    suggestion: Dict
    window_blurb: str


class UpdateRemixDefaultsReq(BaseModel):
    # List[Any] so non-string entries pass Pydantic and get filtered at
    # runtime via the isinstance check (spec: "silently dropped").
    presets: Optional[List[Any]] = None
    hint: Optional[str] = None


class UpdateRecurrenceReq(BaseModel):
    kind: str  # "none" | "weekly" | "biweekly"


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
    slots: List[AvailabilitySlot]


class ApplyTemplateReq(BaseModel):
    weeks_ahead: int = 4
    start_iso: Optional[str] = None
    overwrite: bool = False


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


# --------------------------------------------------------------------------- #
# Helpers                                                                     #
# --------------------------------------------------------------------------- #


def gen_code(n: int = 6) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return "".join(random.choice(alphabet) for _ in range(n))


def random_member_color(idx: int) -> str:
    palette = [
        "#1ABC9C", "#48C9B0", "#F39C12", "#E67E22",
        "#E74C3C", "#9B59B6", "#3498DB", "#2ECC71",
        "#F1C40F", "#E91E63", "#00BCD4", "#8E44AD",
    ]
    return palette[idx % len(palette)]


async def find_group(code: str) -> dict:
    g = await db.groups.find_one({"code": code.upper()}, {"_id": 0})
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return g


def member_or_404(g: dict, member_id: str) -> dict:
    m = next((x for x in (g.get("members") or []) if x.get("id") == member_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    return m
