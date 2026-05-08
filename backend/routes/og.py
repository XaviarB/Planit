"""Open Graph preview image — for rich link unfurls in iMessage / Slack /
Discord. Generates a 1200×630 PNG; both the font lookup and the rendered
PNG are LRU-cached so a popular link doesn't hammer Pillow on every fetch."""
from __future__ import annotations

import functools
from io import BytesIO
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from core import find_group

router = APIRouter()


@router.get("/og.png")
@router.get("/og/{code}.png")
async def og_card(code: Optional[str] = None):
    """Generate a 1200x630 OG card PNG. If `code` is provided, the card is
    personalized with the group's name + member count + invite code; otherwise
    it's the generic Planit landing card. Cached aggressively at the edge."""
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
            pass  # fall back to generic card

    png_bytes = _render_og_png(title, subtitle, chip_text, invite)
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
    )


@functools.lru_cache(maxsize=8)
def _og_font(size: int):
    """Cached font lookup — the underlying TTF only needs to be loaded once
    per size variant for the lifetime of the process."""
    from PIL import ImageFont
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


@functools.lru_cache(maxsize=256)
def _render_og_png(title: str, subtitle: str, chip_text: str, invite: str) -> bytes:
    """Pure renderer — same inputs always yield the same PNG bytes, so we
    cache the rendered bytes too. Capacity 256 covers ~all active groups
    while staying well under a few MB of memory."""
    from PIL import Image, ImageDraw

    W, H = 1200, 630
    BG = (250, 250, 247)        # #fafaf7 — base
    INK = (15, 23, 42)          # #0f172a — slate-900
    MINT = (209, 242, 235)      # #d1f2eb
    YELLOW = (254, 249, 231)    # #fef9e7
    LAVENDER = (244, 236, 247)  # #f4ecf7

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
    d.text((84, 92), "PLANIT", fill=INK, font=_og_font(64))
    if invite:
        chip = f"  invite · {invite}  "
        cw, ch = d.textlength(chip, font=_og_font(28)), 40
        d.rectangle((84, 180, 84 + cw, 180 + ch), fill=MINT, outline=INK, width=3)
        d.text((84, 184), chip, fill=INK, font=_og_font(28))

    # Big group title.
    title_font = _og_font(96 if len(title) <= 18 else 78 if len(title) <= 28 else 60)
    d.text((84, 260), title, fill=INK, font=title_font)

    # Subtitle.
    d.text((84, 400), subtitle, fill=INK, font=_og_font(36))

    # Footer chip-callout.
    chip_font = _og_font(28)
    chip_pad_x, chip_pad_y = 24, 14
    chip_w = int(d.textlength(chip_text, font=chip_font)) + chip_pad_x * 2
    chip_h = 56
    d.rectangle((84, H - 110, 84 + chip_w, H - 110 + chip_h), fill=YELLOW, outline=INK, width=3)
    d.text((84 + chip_pad_x, H - 110 + chip_pad_y), chip_text, fill=INK, font=chip_font)

    buf = BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
