#!/usr/bin/env python3
"""Generate the pack's binary assets from the sources in assets/.

  * packs/PSU_RP/textures/items/psu_axe_anim.png  - 16x112 flipbook sheet
    (the seven tier frames stacked vertically, in the order the animation
    plays them: wood -> stone -> copper -> iron -> gold -> diamond ->
    netherite).
  * a 256x256 pack_icon.png for every pack of every add-on in
    addons.json - the diamond tier for the Ultimate pack, the netherite
    tier on a green ground for Survival Core, so the two are easy to
    tell apart in the pack list.

Run:  python3 tools/make_assets.py
Requires: Pillow.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required:  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
FRAMES_DIR = ROOT / "assets" / "frames"
PACKS = ROOT / "packs"
RP = PACKS / "PSU_RP"

ICON_SIZE = 256

# addon id -> (frame index, gradient top, gradient bottom)
ICON_STYLE = {
    "ultimate-survival": (-2, (38, 44, 56, 255), (18, 21, 27, 255)),
    "survival-core": (-1, (30, 52, 40, 255), (14, 24, 19, 255))
}
DEFAULT_STYLE = (-1, (38, 44, 56, 255), (18, 21, 27, 255))


def load_frames() -> list[Image.Image]:
    files = sorted(FRAMES_DIR.glob("*.png"))
    if not files:
        sys.exit(f"no frames found in {FRAMES_DIR}")
    frames = []
    for f in files:
        im = Image.open(f).convert("RGBA")
        if im.size != (16, 16):
            sys.exit(f"{f.name}: frames must be 16x16, got {im.size}")
        frames.append(im)
    return frames


def build_flipbook(frames: list[Image.Image]) -> Path:
    sheet = Image.new("RGBA", (16, 16 * len(frames)), (0, 0, 0, 0))
    for i, im in enumerate(frames):
        sheet.paste(im, (0, i * 16))
    out = RP / "textures" / "items" / "psu_axe_anim.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    return out


def build_icon(frame: Image.Image, top, bottom) -> Image.Image:
    icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE))
    for y in range(ICON_SIZE):
        t = y / (ICON_SIZE - 1)
        row = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        for x in range(ICON_SIZE):
            icon.putpixel((x, y), row)

    scale = 14  # 16 * 14 = 224, leaves a 16px margin on every side
    art = frame.resize((16 * scale, 16 * scale), Image.NEAREST)
    icon.alpha_composite(art, ((ICON_SIZE - art.width) // 2, (ICON_SIZE - art.height) // 2))
    return icon


def main() -> None:
    frames = load_frames()
    sheet = build_flipbook(frames)
    print(f"flipbook  -> {sheet.relative_to(ROOT)}  (16x{16 * len(frames)}, {len(frames)} frames)")

    addons = json.loads((ROOT / "addons.json").read_text(encoding="utf-8"))["addons"]
    for addon in addons:
        index, top, bottom = ICON_STYLE.get(addon["id"], DEFAULT_STYLE)
        icon = build_icon(frames[index], top, bottom)
        for pack in (addon["behaviour"], addon["resources"]):
            target = PACKS / pack / "pack_icon.png"
            icon.save(target)
            print(f"pack icon -> {target.relative_to(ROOT)}  ({ICON_SIZE}x{ICON_SIZE})")


if __name__ == "__main__":
    main()
