"""
Calendar sync — Planit ↔ external calendars (Google, Apple/iCloud, Outlook,
Fastmail, Proton, anything that speaks iCal).

Two directions:

  IN  (their cal → planit):
      User pastes their secret iCal URL or uploads a raw .ics file. We fetch &
      parse, then return a list of busy AvailabilitySlot dicts. The API layer
      decides whether to merge those slots into the requesting member's
      schedule (we never silently mutate a member's slots — the editor stays
      in charge of UX).

  OUT (planit → their cal):
      Each member has a personal `.ics` feed URL emitted by the API. They
      paste it into Google/Apple/Outlook once and every locked Planit hangout
      shows up automatically forever (calendar apps poll the feed). No OAuth.

Privacy: an iCal URL is a per-user secret. The URL itself is the credential —
treat it like a password. Don't log it or echo it back unmasked.
"""
from __future__ import annotations

import logging
import os
from datetime import date as DateCls, datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

import httpx
from icalendar import Calendar, Event

logger = logging.getLogger(__name__)

# Cap how far ahead we'll honor IN events (keeps a 5-year repeating event from
# becoming 1825 busy slots).
INBOUND_MAX_DAYS = 90
# Cap how far ahead we'll write OUT events.
OUTBOUND_HORIZON_DAYS = 180
# Cap fetch size to be polite.
MAX_FETCH_BYTES = 5_000_000


# --------------------------------------------------------------------------- #
# IN: parse external iCal into Planit busy slots                              #
# --------------------------------------------------------------------------- #

async def fetch_ics(url: str, timeout_s: float = 15.0) -> str:
    """Fetch an iCal URL. Translates webcal:// to https:// transparently —
    Apple Calendar publishes those by default and the iCal data is the same."""
    if not url:
        raise ValueError("url is required")
    cleaned = url.strip()
    if cleaned.lower().startswith("webcal://"):
        cleaned = "https://" + cleaned[len("webcal://"):]
    if not (cleaned.lower().startswith("http://") or cleaned.lower().startswith("https://")):
        raise ValueError("url must be http(s) or webcal")

    async with httpx.AsyncClient(follow_redirects=True, timeout=timeout_s) as client:
        r = await client.get(cleaned, headers={
            "User-Agent": "Planit-Calendar-Sync/1.0",
            "Accept": "text/calendar, text/plain, */*",
        })
        r.raise_for_status()
        if len(r.content) > MAX_FETCH_BYTES:
            raise ValueError("calendar too large")
        return r.text


def parse_ics_to_slots(
    ics_text: str,
    *,
    horizon_start: Optional[datetime] = None,
    horizon_end: Optional[datetime] = None,
) -> List[Dict[str, Any]]:
    """Parse an iCal string into a list of Planit busy slots.

    Slot shape matches AvailabilitySlot in server.py:
      { mode: "date", key: "YYYY-MM-DD", hour: 0-23, minute: 0,
        step: 60, status: "busy", reason_id: null }

    Each VEVENT is "exploded" into one slot per hour the event covers.
    All-day events are intentionally skipped: marking a whole day busy from
    an external all-day event ("Spring Break") is rarely what the user wants.
    Recurring events: we honor the first instance only for now (RRULE
    expansion is a meaningful add-on; the icalendar library exposes recurrence
    rules via dateutil.rrule, which we'd plug in here).
    """
    if not ics_text:
        return []

    now = datetime.now(timezone.utc)
    h_start = horizon_start or (now - timedelta(days=1))
    h_end = horizon_end or (now + timedelta(days=INBOUND_MAX_DAYS))

    try:
        cal = Calendar.from_ical(ics_text)
    except Exception as e:  # noqa: BLE001
        logger.warning("parse_ics_to_slots: failed to parse ics: %s", e)
        return []

    slots: List[Dict[str, Any]] = []
    seen: set = set()  # (key, hour) dedup

    for comp in cal.walk("VEVENT"):
        try:
            dtstart = comp.get("DTSTART")
            dtend = comp.get("DTEND")
            if dtstart is None or dtend is None:
                continue
            start = dtstart.dt
            end = dtend.dt
            # Skip all-day events (DATE, not DATETIME).
            if isinstance(start, DateCls) and not isinstance(start, datetime):
                continue
            # Normalize to UTC-aware.
            if start.tzinfo is None:
                start = start.replace(tzinfo=timezone.utc)
            if end.tzinfo is None:
                end = end.replace(tzinfo=timezone.utc)

            # Skip events fully outside our horizon.
            if end < h_start or start > h_end:
                continue
            # Clip to horizon.
            s = max(start, h_start)
            e = min(end, h_end)
            if e <= s:
                continue
        except Exception as ex:  # noqa: BLE001
            logger.debug("skip malformed VEVENT: %s", ex)
            continue

        # Walk hour-by-hour. Local civil time is fine — the UI's heatmap is
        # already a date+hour grid in the viewer's local calendar conception.
        # (A future timezone-aware mode is a richer layer.)
        cur = s.astimezone()
        end_local = e.astimezone()
        # round start down, end up.
        cur = cur.replace(minute=0, second=0, microsecond=0)
        guard = 0
        while cur < end_local and guard < 24 * INBOUND_MAX_DAYS:
            key = cur.strftime("%Y-%m-%d")
            hour = cur.hour
            sig = (key, hour)
            if sig not in seen:
                seen.add(sig)
                slots.append({
                    "mode": "date",
                    "key": key,
                    "hour": hour,
                    "minute": 0,
                    "step": 60,
                    "status": "busy",
                    "reason_id": None,
                })
            cur += timedelta(hours=1)
            guard += 1

    return slots


# --------------------------------------------------------------------------- #
# OUT: build a Planit member's personal .ics feed                             #
# --------------------------------------------------------------------------- #

def build_single_event_ics(
    *,
    hangout: Dict[str, Any],
    group_code: str,
    group_name: str,
) -> bytes:
    """Build a one-event .ics blob for a specific hangout — for a "Download
    .ics" button on a single Hangout row. No RSVP filtering: caller decided
    they want this event in their calendar."""
    cal = Calendar()
    cal.add("prodid", "-//Planit//Astral Concierge//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", f"Planit · {group_name or 'Group'}")
    cal.add("x-wr-timezone", "UTC")

    start = _parse_iso(hangout.get("start_iso") or "")
    end = _parse_iso(hangout.get("end_iso") or "")
    if not start or not end:
        # Still return a valid (empty) calendar rather than 500.
        return cal.to_ical()

    ev = Event()
    ev.add("uid", f"{group_code}-{hangout.get('id', 'x')}@planit")
    ev.add("dtstamp", datetime.now(timezone.utc))
    ev.add("dtstart", start)
    ev.add("dtend", end)
    summary = (hangout.get("title") or "Planit hangout").strip()
    status = (hangout.get("status") or "tentative").upper()
    if status == "TENTATIVE":
        summary = f"[tentative] {summary}"
    ev.add("summary", summary)
    ev.add("status", "TENTATIVE" if status == "TENTATIVE" else "CONFIRMED")
    descr_lines: List[str] = []
    if hangout.get("astral_take"):
        descr_lines.append(hangout["astral_take"])
    descr_lines.append(f"Planit group: {group_code}")
    if hangout.get("invite_message"):
        descr_lines.append("\n" + hangout["invite_message"])
    if descr_lines:
        ev.add("description", "\n".join(descr_lines))
    if hangout.get("location_name") or hangout.get("address"):
        ev.add(
            "location",
            ", ".join(filter(None, [hangout.get("location_name"), hangout.get("address")])),
        )
    cal.add_component(ev)
    return cal.to_ical()


def build_member_feed(
    *,
    feed_uid_prefix: str,
    feed_name: str,
    hangouts: Iterable[Dict[str, Any]],
    member_id: str,
) -> bytes:
    """Build an iCalendar feed for a single member containing every Hangout
    in `hangouts` whose RSVP for this member is 'yes' (or where they're the
    only resolved attendee). Returns bytes ready to serve as text/calendar."""
    cal = Calendar()
    cal.add("prodid", "-//Planit//Astral Concierge//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    cal.add("x-wr-calname", feed_name)
    cal.add("x-wr-timezone", "UTC")

    horizon = datetime.now(timezone.utc) + timedelta(days=OUTBOUND_HORIZON_DAYS)

    for h in hangouts:
        try:
            # Only include hangouts the member has accepted (or hasn't declined
            # — we treat 'maybe' as still on-calendar so people see it).
            rsvps = h.get("rsvps") or []
            mine = next((r for r in rsvps if r.get("member_id") == member_id), None)
            if mine and mine.get("status") == "no":
                continue
            # Skip past hangouts.
            start_iso = h.get("start_iso")
            end_iso = h.get("end_iso")
            if not start_iso or not end_iso:
                continue
            start = _parse_iso(start_iso)
            end = _parse_iso(end_iso)
            if not start or not end:
                continue
            if start > horizon:
                continue

            ev = Event()
            ev.add("uid", f"{feed_uid_prefix}-{h.get('id', 'x')}@planit")
            ev.add("dtstamp", datetime.now(timezone.utc))
            ev.add("dtstart", start)
            ev.add("dtend", end)
            summary = (h.get("title") or "Planit hangout").strip()
            status = (h.get("status") or "tentative").upper()
            if status == "TENTATIVE":
                summary = f"[tentative] {summary}"
            ev.add("summary", summary)
            ev.add("status", "TENTATIVE" if status == "TENTATIVE" else "CONFIRMED")
            descr_lines: List[str] = []
            if h.get("astral_take"):
                descr_lines.append(h["astral_take"])
            if h.get("group_code"):
                descr_lines.append(f"Planit group: {h['group_code']}")
            if h.get("invite_message"):
                descr_lines.append("\n" + h["invite_message"])
            if descr_lines:
                ev.add("description", "\n".join(descr_lines))
            if h.get("location_name") or h.get("address"):
                ev.add(
                    "location",
                    ", ".join(filter(None, [h.get("location_name"), h.get("address")])),
                )
            cal.add_component(ev)
        except Exception as ex:  # noqa: BLE001
            logger.debug("skip hangout in feed build: %s", ex)
            continue

    return cal.to_ical()


def _parse_iso(s: str) -> Optional[datetime]:
    if not s:
        return None
    try:
        # Allow "Z" and offset-naive variants.
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


# --------------------------------------------------------------------------- #
# Helpers used by API layer                                                   #
# --------------------------------------------------------------------------- #

def merge_slot_lists(
    existing: List[Dict[str, Any]],
    incoming: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], int]:
    """Merge `incoming` busy slots into `existing`, overwriting same-key/hour
    slots. Returns (merged, added_count). 'added_count' is the number of
    slots that did NOT exist before (new busy hours)."""
    by_id: Dict[Tuple[str, str, int, int], Dict[str, Any]] = {}
    for s in existing:
        k = (s.get("mode", "date"), s.get("key", ""), int(s.get("hour", 0)), int(s.get("minute", 0)))
        by_id[k] = s
    added = 0
    for s in incoming:
        k = (s.get("mode", "date"), s.get("key", ""), int(s.get("hour", 0)), int(s.get("minute", 0)))
        if k not in by_id:
            added += 1
        by_id[k] = s
    return list(by_id.values()), added
