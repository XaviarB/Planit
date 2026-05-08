"""Member templates — save & re-apply busy patterns."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from fastapi import APIRouter, HTTPException

from calendar_sync import merge_slot_lists
from core import (
    ApplyTemplateReq,
    AvailabilitySlot,
    BusyTemplate,
    CreateTemplateReq,
    db,
    find_group,
    member_or_404,
)

router = APIRouter()


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


@router.get("/groups/{code}/members/{member_id}/templates")
async def list_templates(code: str, member_id: str):
    g = await find_group(code)
    m = member_or_404(g, member_id)
    return {"templates": m.get("templates") or []}


@router.post("/groups/{code}/members/{member_id}/templates")
async def create_template(code: str, member_id: str, req: CreateTemplateReq):
    g = await find_group(code)
    member_or_404(g, member_id)
    template = BusyTemplate(
        name=(req.name or "Template").strip() or "Template",
        color=req.color or "#7FB3D5",
        slots=[
            AvailabilitySlot(**s)
            for s in _normalize_template_slots([s.model_dump() for s in req.slots])
        ],
    )
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$push": {"members.$.templates": template.model_dump()}},
    )
    return template.model_dump()


@router.delete("/groups/{code}/members/{member_id}/templates/{tpl_id}")
async def delete_template(code: str, member_id: str, tpl_id: str):
    g = await find_group(code)
    member_or_404(g, member_id)
    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$pull": {"members.$.templates": {"id": tpl_id}}},
    )
    return {"ok": True}


@router.post("/groups/{code}/members/{member_id}/templates/{tpl_id}/apply")
async def apply_template(code: str, member_id: str, tpl_id: str, req: ApplyTemplateReq):
    g = await find_group(code)
    m = member_or_404(g, member_id)
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
    base = base - timedelta(days=base.weekday())  # round to that week's Monday

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
        existing_keys = {(s.get("mode"), s.get("key"), s.get("hour"), s.get("minute")) for s in existing}
        non_clash = [s for s in incoming if (s["mode"], s["key"], s["hour"], s["minute"]) not in existing_keys]
        merged = existing + non_clash
        added = len(non_clash)

    await db.groups.update_one(
        {"code": code.upper(), "members.id": member_id},
        {"$set": {"members.$.slots": merged}},
    )
    return {"added": added, "weeks": weeks, "total_painted": len(incoming)}
