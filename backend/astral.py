"""
Astral — Planit's AI hangout concierge.

Voice & rules: edgy, mature, lowercase-by-default, dryly observant. Astral talks
like the friend who knows every dive bar, every rooftop, every taco truck —
and isn't afraid to suggest drinks, late-night spots, or 18+ activities. Astral
references real public buzz/reviews about places, not invented hype.

This module wraps Gemini 2.5 Pro (via the Emergent LLM key + emergentintegrations)
behind three async helpers:

    parse_busy_text(text, anchor_date)   -> list[slot dicts]
    suggest_hangouts(window, members,    -> dict { "intro", "cards": [card,...] }
                     location, group_name, history_blurb)
    draft_invite(suggestion, group_name, -> str (group-chat-ready message)
                 window)

Every helper returns plain Python data the FastAPI layer can ship as JSON.
We never trust the model to return raw JSON — we strip ```json fences and use
json.loads with a defensive fallback.
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------- #
# Persona system prompts                                                      #
# --------------------------------------------------------------------------- #

ASTRAL_PERSONA = """you are astral. you're planit's hangout concierge — equal
parts older-sibling and that one friend who knows every bar in a 10-block radius.

voice rules (these are non-negotiable):
- lowercase by default. you're too cool for shift-key.
- dry, mature, observant. you've been around. you've seen things.
- you can suggest bars, dives, rooftops, drinks, late-night food, shows,
  speakeasies, 18+ activities — the group is grown. don't be precious.
- short sentences. occasional cheek. never cringe, never cheerleading.
- you remember group history when you're given it. reference it sparingly,
  like an inside joke ("we are not repeating october").
- when you give advice, you're decisive. "skip tuesday" not "tuesday could work".

content rules:
- only suggest real places that actually exist in the requested area. if you
  don't know the area well, default to broadly-known venues and say so.
- "buzz" means a *gist of public sentiment* — the kind of one-liner that
  captures what reviewers consistently say about a place. it should NOT
  fabricate a specific quote attributed to a specific publication.
- if you make a venue up, you've failed. better to suggest fewer real places.
"""


# --------------------------------------------------------------------------- #
# Persona overlay — folds the group's customized AstralPersona on top of the   #
# canonical persona. Lets each crew rename astral, swap tone, force/relax     #
# the lowercase rule, and toggle emojis.                                      #
# --------------------------------------------------------------------------- #

_TONE_DESCRIPTIONS = {
    "edgy":    "stay edgy, dry, observant — older-sibling energy.",
    "warm":    "warmer voice — kind, encouraging, still concise. dial back the dryness.",
    "minimal": "stripped down — short factual sentences, no flourish, no jokes.",
    "hype":    "amped, enthusiastic — short bursts, light slang, slightly more emojis. still real venues only.",
}


def _persona_overlay(persona: Optional[Dict[str, Any]]) -> str:
    """Return a small block of overrides to append to ASTRAL_PERSONA based
    on the group's saved AstralPersona settings. No-op if `persona` is empty
    or all-defaults — in that case we want to keep the canonical voice."""
    if not persona or not isinstance(persona, dict):
        return ""
    name = (persona.get("display_name") or "").strip()
    tone = (persona.get("tone") or "").strip().lower()
    lowercase = persona.get("lowercase")
    emoji_on = persona.get("emoji_on")
    lines: List[str] = []
    if name and name != "astral":
        lines.append(
            f"- you go by '{name}' in this group, not 'astral'. when you sign or self-reference, use '{name}'."
        )
    if tone in _TONE_DESCRIPTIONS and tone != "edgy":
        lines.append(f"- tone for this crew: {_TONE_DESCRIPTIONS[tone]}")
    if lowercase is False:
        lines.append("- USE NORMAL CAPITALIZATION for this group (sentence case). drop the all-lowercase rule.")
    if emoji_on is False:
        lines.append("- NO emojis at all in your output for this group.")
    elif emoji_on is True and tone == "hype":
        lines.append("- a couple of emojis are welcome but don't overdo it (max 2 per response).")
    if not lines:
        return ""
    return (
        "\n\n---\n\nthis group has customized your voice — the rules below "
        "OVERRIDE the defaults above:\n" + "\n".join(lines)
    )

# --------------------------------------------------------------------------- #
# Internal: build a fresh LlmChat                                             #
# --------------------------------------------------------------------------- #

def _api_key() -> str:
    """Return the LLM key Astral should authenticate with.

    We prefer a direct Google Gemini API key (`GEMINI_API_KEY` from
    aistudio.google.com) when present — that lets the user bypass the
    Emergent universal-key budget cap and pay Google directly. If it's
    missing we fall back to the Emergent universal key, which still
    routes Gemini through emergentintegrations.
    """
    direct = os.environ.get("GEMINI_API_KEY")
    if direct:
        return direct
    fallback = os.environ.get("EMERGENT_LLM_KEY")
    if fallback:
        return fallback
    raise RuntimeError(
        "no LLM key found — set GEMINI_API_KEY or EMERGENT_LLM_KEY in backend .env"
    )


def _new_chat(system_message: str, session_suffix: str) -> LlmChat:
    """One LlmChat per request — Astral is stateless across calls. We only use
    history within a single helper call (single user message). gemini-2.5-flash
    is the free-tier model from Google AI Studio — fast, JSON-reliable, and
    covers our creative-concierge needs without the paid Pro quota.
    """
    return LlmChat(
        api_key=_api_key(),
        session_id=f"astral-{session_suffix}-{uuid.uuid4().hex[:8]}",
        system_message=system_message,
    ).with_model("gemini", "gemini-2.5-flash")


def _strip_code_fences(s: str) -> str:
    s = s.strip()
    # strip ```json ... ``` / ``` ... ``` if present
    fenced = re.match(r"^```(?:json)?\s*(.*?)\s*```$", s, re.DOTALL | re.IGNORECASE)
    if fenced:
        return fenced.group(1).strip()
    return s


def _safe_json_loads(s: str) -> Any:
    s = _strip_code_fences(s)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # Gemini sometimes adds prose around JSON. Try to extract the first
        # top-level {...} or [...] block.
        m = re.search(r"(\{.*\}|\[.*\])", s, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                pass
        raise


# --------------------------------------------------------------------------- #
# 1. parse_busy_text                                                          #
# --------------------------------------------------------------------------- #

PARSE_BUSY_INSTRUCTIONS_DATE = """convert a person's free-form description of
when they're busy into a list of structured slots that planit understands.

slot shape (this is exact):
  {{
    "mode": "date",
    "key":  "YYYY-MM-DD",
    "hour": 0..23,
    "minute": 0,
    "step": 60,
    "status": "busy",
    "reason_id": null
  }}

rules:
- output ONLY a single JSON array of slot objects. no prose. no markdown fence.
- one slot per (date, hour). do not collapse into ranges. so 6pm-9pm on a
  single day = 3 separate slots: hour 18, 19, 20.
- "this week" / "next week" / "weekday" / "weekend" / etc. resolve relative to
  today: {today_iso} (a {today_weekday}).
- if the user says "for the next N weeks" — emit slots for all those weeks.
  cap output at 200 slots — drop the tail and that's fine.
- if input is ambiguous or empty, return [].
- ignore mood/reason words ("for finals", "because work") — reason_id stays null.
"""

PARSE_BUSY_INSTRUCTIONS_WEEKLY = """convert a person's free-form RECURRING busy
description into weekly recurring slots planit can paint onto every week.

slot shape (this is exact):
  {{
    "mode": "weekly",
    "key":  "d0" | "d1" | "d2" | "d3" | "d4" | "d5" | "d6",
    "hour": 0..23,
    "minute": 0,
    "step": 60,
    "status": "busy",
    "reason_id": null
  }}

day-key cheat sheet:
  d0 = monday, d1 = tuesday, d2 = wednesday, d3 = thursday,
  d4 = friday,  d5 = saturday, d6 = sunday.

rules:
- output ONLY a single JSON array of slot objects. no prose. no markdown fence.
- one slot per (day, hour). do not collapse into ranges. so 2pm-6pm on a
  single day = 4 separate slots: hour 14, 15, 16, 17.
- "all week" / "every day" → d0..d6.
- "weekdays" / "mon-fri" → d0..d4.
- "weekends" → d5, d6.
- ranges like "mon to thu" → d0, d1, d2, d3.
- if no day is specified but a time is, assume "all weekdays" (d0..d4).
- if input is ambiguous or empty, return [].
- ignore mood/reason words ("for school", "because work") — reason_id stays null.
- cap output at 200 slots.
"""


async def parse_busy_text(
    text: str,
    anchor_iso: str,
    mode: str = "date",
) -> List[Dict[str, Any]]:
    """Natural-language busy entry. Returns list of slot dicts. Empty list on
    failure — never raises.

    mode="date"   → produces date-anchored slots (one-off "I'm busy this Tuesday")
    mode="weekly" → produces weekly-recurring slots ("working all week 2-6pm")
    """
    if not text or not text.strip():
        return []

    is_weekly = mode == "weekly"

    try:
        anchor = datetime.fromisoformat(anchor_iso[:10])
    except Exception:
        anchor = datetime.utcnow()
    weekday = anchor.strftime("%A").lower()

    if is_weekly:
        body = PARSE_BUSY_INSTRUCTIONS_WEEKLY
    else:
        body = PARSE_BUSY_INSTRUCTIONS_DATE.format(
            today_iso=anchor.date().isoformat(),
            today_weekday=weekday,
        )

    sys = (
        ASTRAL_PERSONA
        + "\n\n---\n\nright now you're parsing busy text — switch off the persona "
        + "and act as a strict json formatter. the user's voice goes in, slots come out.\n\n"
        + body
    )
    chat = _new_chat(sys, "parse-busy")

    try:
        resp = await chat.send_message(UserMessage(text=text.strip()))
        data = _safe_json_loads(resp)
    except Exception as e:  # noqa: BLE001
        logger.warning("astral.parse_busy_text failed: %s", e)
        return []

    if not isinstance(data, list):
        return []

    out: List[Dict[str, Any]] = []
    valid_weekly_keys = {f"d{i}" for i in range(7)}
    for raw in data[:200]:
        try:
            raw_mode = str(raw.get("mode", "weekly" if is_weekly else "date"))
            # Defensive: if caller asked for weekly but model emitted "date",
            # try to coerce; otherwise drop.
            if is_weekly and raw_mode != "weekly":
                continue
            if not is_weekly and raw_mode != "date":
                continue

            key = str(raw.get("key", ""))
            if is_weekly:
                if key not in valid_weekly_keys:
                    continue
            else:
                key = key[:10]
                datetime.fromisoformat(key)  # bounds check — raises on bad date

            slot = {
                "mode": raw_mode,
                "key": key,
                "hour": int(raw.get("hour", 0)),
                "minute": int(raw.get("minute", 0) or 0),
                "step": int(raw.get("step", 60) or 60),
                "status": "busy",
                "reason_id": raw.get("reason_id") or None,
            }
            if not (0 <= slot["hour"] <= 23):
                continue
            if slot["minute"] not in (0, 15, 30, 45):
                slot["minute"] = 0
            if slot["step"] not in (15, 30, 60):
                slot["step"] = 60
            out.append(slot)
        except Exception:
            continue
    return out


# --------------------------------------------------------------------------- #
# 2. suggest_hangouts                                                         #
# --------------------------------------------------------------------------- #

SUGGEST_INSTRUCTIONS = """generate 3 hangout suggestions as a JSON object.

output shape (exact):
{{
  "intro": "<one short astral line in lowercase summarizing the window>",
  "cards": [
    {{
      "id": "<slug-no-spaces>",
      "venue": "<real place name in {area}>",
      "category": "<bar | restaurant | cafe | live music | activity | rooftop | cocktail | dive | speakeasy | comedy | other>",
      "neighborhood": "<neighborhood/area>",
      "vibe_tags": ["short", "tags", "max 4"],
      "buzz": {{
        "quote": "<the gist of what people say about this place — one sentence, lowercase, no fake attribution>",
        "tone": "<love | mixed | hype | cult-favorite | underrated | controversial>"
      }},
      "rating": <number 3.5-5.0, one decimal>,
      "review_count_approx": <int, realistic ballpark>,
      "price_level": "<$ | $$ | $$$ | $$$$>",
      "what_to_order": "<one specific thing — drink, dish, show, etc>",
      "astral_take": "<2-3 lowercase sentences in astral's voice. dry, decisive, edgy. can reference the group's history blurb if given.>",
      "warnings": ["short edge cases like 'cash only', 'gets loud after 10', '21+' — empty array if none"],
      "good_for": "<who this works best for — single line>",
      "verify_query": "<a 2-5 word google search that uniquely finds this place — used to build a verify-on-google link>"
    }},
    ...
  ]
}}

rules:
- area: {area}. only suggest real places there. if area is empty/unknown,
  pick widely-known venues anyone could find and lower confidence in astral_take.
- the group has {member_count} people, and the time window is {window_blurb}.
  factor in the duration: 2hrs = 1 spot, 3-4hrs = 1 spot + maybe a chaser, 5+hrs = full evening.
- don't suggest 3 of the same category. mix it up.
- buzz.quote should sound like a synthesis of consistent reviewer sentiment, NOT a fake quote
  attributed to a specific publication. examples of GOOD buzz quotes:
  * "regulars swear by the carajillo, tourists rarely find it"
  * "loud, packed, worth it"
  * "good first-date energy if first dates still exist"
- astral can suggest drinks freely. the group is grown.
- output ONLY the JSON object. no prose. no fence.
"""


# Built-in remix presets — chip-friendly hints that get appended to remix
# instructions verbatim. Free-form `remix_hint` from the UI is appended too.
REMIX_PRESETS = {
    "cheaper":               "make these noticeably cheaper. shift to $ or $$ tier. dive bars, food trucks, BYOB are fair game.",
    "fancier":               "go a tier up. cocktail bars, tasting menus, rooftops, anything where you'd feel weird in shorts.",
    "different_neighborhood":"do not reuse any neighborhood from the previous picks. surprise us.",
    "different_vibe":        "completely different energy than the last cards — if last was loud, go chill. if last was a sit-down, go interactive.",
    "more_chill":            "lower the energy. quieter rooms, conversation-friendly, soft lighting, no thumping bass.",
    "more_lit":              "crank the energy. live music, packed houses, dance floors, places where you'd lose your voice by midnight.",
    "with_food":             "every card needs to actually feed people. bar snacks don't count — real food.",
    "no_drinks":             "pivot away from alcohol-led venues. cafes, dessert spots, late-night diners, comedy, activities.",
    "earlier":               "tilt the picks toward early evening — golden hour spots, places that peak before 9pm.",
    "later":                 "tilt the picks late — places that wake up after 10pm, after-hours moves.",
    "outdoorsy":             "outdoor seating, rooftops, parks-with-vendors, anything al-fresco-friendly.",
    "indoorsy":              "weather-proof picks. solid indoor settings.",
}

REMIX_INSTRUCTIONS = """you're remixing — the group already saw your last 3
picks and asked for a different cut. produce 3 NEW cards that:

- DO NOT repeat any venue name (or close variant) from the previous list.
- honor the remix request below as a hard constraint.
- keep the schema identical to your normal suggest output. JSON only.

previous picks (do not repeat):
{prev_blurb}

remix request:
{remix_blurb}
"""


async def suggest_hangouts(
    *,
    window_blurb: str,
    member_count: int,
    location: Optional[str],
    group_name: Optional[str],
    history_blurb: Optional[str] = None,
    member_summaries: Optional[str] = None,
    previous_cards: Optional[List[Dict[str, Any]]] = None,
    remix_presets: Optional[List[str]] = None,
    remix_hint: Optional[str] = None,
    astral_persona: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Returns {"intro": str, "cards": [card,...]}. Up to 3 cards.

    Falls back to a polite empty object if Gemini misbehaves (UI handles it).

    When `previous_cards` and/or `remix_presets`/`remix_hint` are passed, Astral
    enters "remix" mode — the prompt forbids repeating the prior venues and
    folds in the user's redirection (chip presets like 'cheaper', 'different
    vibe' + free-form hint like 'we want tacos this time').
    """
    area = (location or "").strip() or "the group's general area (no specific location set)"
    history = (history_blurb or "").strip()
    members_blurb = (member_summaries or "").strip()
    prev = previous_cards or []
    presets = [p for p in (remix_presets or []) if p in REMIX_PRESETS]
    hint = (remix_hint or "").strip()
    is_remix = bool(prev or presets or hint)

    # Base instructions, then remix tail when applicable.
    base = SUGGEST_INSTRUCTIONS.format(
        area=area,
        member_count=member_count,
        window_blurb=window_blurb,
    )
    if is_remix:
        prev_lines = []
        for c in prev[:9]:
            v = (c.get("venue") or "").strip()
            n = (c.get("neighborhood") or "").strip()
            cat = (c.get("category") or "").strip()
            if v:
                prev_lines.append(f"- {v}" + (f" ({cat} · {n})" if cat or n else ""))
        prev_blurb = "\n".join(prev_lines) if prev_lines else "(none)"
        remix_lines: List[str] = []
        for p in presets:
            remix_lines.append(f"- preset [{p}]: {REMIX_PRESETS[p]}")
        if hint:
            remix_lines.append(f"- free-form note from user: {hint}")
        remix_blurb = "\n".join(remix_lines) if remix_lines else "(no specific request — just give us a fresh angle)"
        base = base + "\n\n" + REMIX_INSTRUCTIONS.format(
            prev_blurb=prev_blurb,
            remix_blurb=remix_blurb,
        )

    sys = ASTRAL_PERSONA + _persona_overlay(astral_persona) + "\n\n---\n\n" + base

    user_parts = [
        f"group name: {group_name or 'untitled'}",
        f"area: {area}",
        f"window: {window_blurb}",
        f"member count: {member_count}",
    ]
    if members_blurb:
        user_parts.append(f"members context: {members_blurb}")
    if history:
        user_parts.append(f"group history blurb: {history}")
    if is_remix:
        user_parts.append("now produce the JSON remix — fresh venues only.")
    else:
        user_parts.append("now produce the JSON object exactly per the schema above.")

    chat = _new_chat(sys, "remix" if is_remix else "suggest")
    try:
        resp = await chat.send_message(UserMessage(text="\n".join(user_parts)))
        data = _safe_json_loads(resp)
    except Exception as e:  # noqa: BLE001
        logger.warning("astral.suggest_hangouts failed: %s", e)
        return {"intro": "", "cards": []}

    if not isinstance(data, dict):
        return {"intro": "", "cards": []}

    cards = data.get("cards") or []
    if not isinstance(cards, list):
        cards = []

    cleaned: List[Dict[str, Any]] = []
    for c in cards[:3]:
        if not isinstance(c, dict):
            continue
        # Defensive shape — supply defaults so the UI never crashes.
        buzz = c.get("buzz") or {}
        if not isinstance(buzz, dict):
            buzz = {}
        verify_q = (c.get("verify_query") or c.get("venue") or "").strip()
        verify_q_url = re.sub(r"\s+", "+", verify_q)
        cleaned.append({
            "id": str(c.get("id") or uuid.uuid4().hex[:8]),
            "venue": str(c.get("venue") or "").strip() or "Unknown spot",
            "category": str(c.get("category") or "other").strip().lower(),
            "neighborhood": str(c.get("neighborhood") or "").strip(),
            "vibe_tags": [str(t).strip() for t in (c.get("vibe_tags") or [])][:4],
            "buzz": {
                "quote": str(buzz.get("quote") or "").strip(),
                "tone": str(buzz.get("tone") or "mixed").strip().lower(),
            },
            "rating": _coerce_float(c.get("rating"), 4.3),
            "review_count_approx": _coerce_int(c.get("review_count_approx"), 0),
            "price_level": str(c.get("price_level") or "$$").strip(),
            "what_to_order": str(c.get("what_to_order") or "").strip(),
            "astral_take": str(c.get("astral_take") or "").strip(),
            "warnings": [str(w).strip() for w in (c.get("warnings") or []) if str(w).strip()][:3],
            "good_for": str(c.get("good_for") or "").strip(),
            "verify_query": verify_q,
            "verify_links": {
                "google_search": f"https://www.google.com/search?q={verify_q_url}",
                "google_maps":   f"https://www.google.com/maps/search/?api=1&query={verify_q_url}",
            },
        })

    return {
        "intro": str(data.get("intro") or "").strip(),
        "cards": cleaned,
    }


def _coerce_float(v: Any, default: float) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _coerce_int(v: Any, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


# --------------------------------------------------------------------------- #
# 3. draft_invite                                                             #
# --------------------------------------------------------------------------- #

DRAFT_INVITE_INSTRUCTIONS = """write a short group-chat invite message that
the user can paste into imessage/whatsapp/discord. the message should:

- open in astral's voice (lowercase, dry, edgy)
- name the picked spot, day, and start time clearly
- mention one detail from the buzz/why this spot
- end with a clear ask ("yay/nay" / "react if in" / "lock it?")
- be 2-4 short sentences, no bullet points, no emoji-spam (max 1 emoji)
- output ONLY the message text. no quotes around it. no prose before/after."""


async def draft_invite(
    *,
    suggestion: Dict[str, Any],
    group_name: str,
    window_blurb: str,
    astral_persona: Optional[Dict[str, Any]] = None,
) -> str:
    sys = ASTRAL_PERSONA + _persona_overlay(astral_persona) + "\n\n---\n\n" + DRAFT_INVITE_INSTRUCTIONS
    user = (
        f"group: {group_name}\n"
        f"window: {window_blurb}\n"
        f"picked spot: {json.dumps(suggestion, ensure_ascii=False)}\n\n"
        f"now write the message."
    )
    chat = _new_chat(sys, "invite")
    try:
        resp = await chat.send_message(UserMessage(text=user))
        return _strip_code_fences(resp).strip().strip('"')
    except Exception as e:  # noqa: BLE001
        logger.warning("astral.draft_invite failed: %s", e)
        venue = suggestion.get("venue", "the spot")
        return f"down for {venue} {window_blurb}? lmk."
