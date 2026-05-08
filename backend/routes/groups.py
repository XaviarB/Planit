"""Group CRUD + member CRUD + reasons. The "core" routing layer."""
from typing import Dict

from fastapi import APIRouter, HTTPException

from core import (
    BusyReason,
    CreateGroupReq,
    CreateReasonReq,
    DEFAULT_HEAT_COLORS,
    DEFAULT_REASONS,
    Group,
    JoinGroupReq,
    Member,
    RenameMemberReq,
    UpdateGroupReq,
    UpdateSlotsReq,
    db,
    find_group,
    gen_code,
    random_member_color,
)

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Planit API"}


@router.post("/groups")
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


@router.get("/groups/{code}")
async def get_group(code: str):
    g = await find_group(code)
    # Backfill heat_colors for older docs
    if not g.get("heat_colors"):
        g["heat_colors"] = list(DEFAULT_HEAT_COLORS)
    return g


@router.put("/groups/{code}")
async def update_group(code: str, req: UpdateGroupReq):
    await find_group(code)
    update: Dict = {}
    if req.name is not None:
        update["name"] = req.name.strip() or "Untitled Group"
    if req.location is not None:
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


@router.delete("/groups/{code}")
async def delete_group(code: str):
    """Hard-delete a group and all its data."""
    await find_group(code)
    await db.groups.delete_one({"code": code.upper()})
    return {"ok": True}


@router.delete("/groups/{code}/members/{member_id}")
async def leave_group(code: str, member_id: str):
    """Remove a member from a group. If no members remain, the group is auto-deleted."""
    g = await find_group(code)
    members = [m for m in g.get("members", []) if m.get("id") != member_id]
    if len(members) == len(g.get("members", [])):
        raise HTTPException(status_code=404, detail="Member not found")
    if len(members) == 0:
        await db.groups.delete_one({"code": code.upper()})
        return {"ok": True, "dissolved": True}
    await db.groups.update_one(
        {"code": code.upper()}, {"$set": {"members": members}}
    )
    return {"ok": True, "dissolved": False}


@router.post("/groups/{code}/members")
async def join_group(code: str, req: JoinGroupReq):
    g = await find_group(code)
    idx = len(g.get("members", []))
    member = Member(name=req.name.strip() or f"Friend {idx+1}", color=random_member_color(idx))
    await db.groups.update_one(
        {"code": code.upper()},
        {"$push": {"members": member.model_dump()}}
    )
    return {"member_id": member.id, "member": member.model_dump()}


@router.put("/groups/{code}/members/{member_id}/slots")
async def update_slots(code: str, member_id: str, req: UpdateSlotsReq):
    g = await find_group(code)
    if not any(m["id"] == member_id for m in g["members"]):
        raise HTTPException(status_code=404, detail="Member not found")

    slots = [s.model_dump() for s in req.slots]
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": {"members.$.slots": slots}}
    )
    return {"ok": True, "count": len(slots)}


@router.put("/groups/{code}/members/{member_id}")
async def rename_member(code: str, member_id: str, req: RenameMemberReq):
    await find_group(code)
    set_doc: Dict = {}
    if req.name is not None:
        set_doc["members.$.name"] = req.name.strip() or "Friend"
    if req.location is not None:
        set_doc["members.$.location"] = req.location.strip() or None
    if not set_doc:
        return {"ok": True}
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": set_doc}
    )
    return {"ok": True}


@router.post("/groups/{code}/reasons")
async def add_reason(code: str, req: CreateReasonReq):
    await find_group(code)
    reason = BusyReason(label=req.label.strip() or "Reason", color=req.color)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$push": {"reasons": reason.model_dump()}}
    )
    return reason.model_dump()


@router.delete("/groups/{code}/reasons/{reason_id}")
async def delete_reason(code: str, reason_id: str):
    await find_group(code)
    await db.groups.update_one(
        {"code": code.upper()},
        {"$pull": {"reasons": {"id": reason_id}}}
    )
    return {"ok": True}
