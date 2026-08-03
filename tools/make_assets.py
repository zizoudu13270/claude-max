#!/usr/bin/env python3
"""Generate the pack's binary assets from the sources in assets/.

  * packs/PSU_RP/textures/items/psu_axe_anim.png  - 16x112 flipbook sheet
    (the seven tier frames stacked vertically, in the order the animation
    plays them: wood -> stone -> copper -> iron -> gold -> diamond ->
    netherite).
  * packs/PSU_BP/pack_icon.png / packs/PSU_RP/pack_icon.png - 256x256.
  * dist/pack_icon_animated.gif - the seven frames as a looping GIF, for the
    store listing. Bedrock itself cannot animate pack_icon.png; see README.
  * packs/PSU_RP/textures/items/psu_emerald_pickaxe.png - 16x16 sprite drawn
    in the same four-tone style as the tier frames.

Run:  python3 tools/make_assets.py
Requires: Pillow.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required:  pip install Pillow")

ROOT = Path(__file__).resolve().parent.parent
FRAMES_DIR = ROOT / "assets" / "frames"
RP = ROOT / "packs" / "PSU_RP"
BP = ROOT / "packs" / "PSU_BP"

ICON_SIZE = 256
ICON_BG_TOP = (38, 44, 56, 255)
ICON_BG_BOTTOM = (18, 21, 27, 255)


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


GLOW = (86, 230, 140)        # the emerald tone, echoed behind the art
GLOW_STRENGTH = 0.30


def build_icon(frame: Image.Image) -> Image.Image:
    icon = Image.new("RGBA", (ICON_SIZE, ICON_SIZE))
    centre = (ICON_SIZE - 1) / 2
    radius = ICON_SIZE * 0.62

    for y in range(ICON_SIZE):
        t = y / (ICON_SIZE - 1)
        base = [round(a + (b - a) * t) for a, b in zip(ICON_BG_TOP, ICON_BG_BOTTOM)]
        for x in range(ICON_SIZE):
            # Radial glow: brightest at the centre, gone by `radius`.
            d = ((x - centre) ** 2 + (y - centre) ** 2) ** 0.5
            k = max(0.0, 1.0 - d / radius) ** 2 * GLOW_STRENGTH
            icon.putpixel((x, y), (
                round(base[0] + (GLOW[0] - base[0]) * k),
                round(base[1] + (GLOW[1] - base[1]) * k),
                round(base[2] + (GLOW[2] - base[2]) * k),
                255,
            ))

    scale = 13  # 16 * 13 = 208, leaves a 24px margin for the frame
    art = frame.resize((16 * scale, 16 * scale), Image.NEAREST)
    icon.alpha_composite(art, ((ICON_SIZE - art.width) // 2, (ICON_SIZE - art.height) // 2))

    # A thin inset border so the tile reads as deliberate in the pack list.
    border, inset = (86, 230, 140, 90), 6
    for i in range(2):
        box = [inset + i, inset + i, ICON_SIZE - 1 - inset - i, ICON_SIZE - 1 - inset - i]
        for x in range(box[0], box[2] + 1):
            icon.alpha_composite(Image.new("RGBA", (1, 1), border), (x, box[1]))
            icon.alpha_composite(Image.new("RGBA", (1, 1), border), (x, box[3]))
        for y in range(box[1], box[3] + 1):
            icon.alpha_composite(Image.new("RGBA", (1, 1), border), (box[0], y))
            icon.alpha_composite(Image.new("RGBA", (1, 1), border), (box[2], y))
    return icon


# ----------------------------------------------------------------------
# The emerald pickaxe sprite
#
# v4.0 shipped a placeholder that read as an archway on a stick: a flat
# lintel with two legs and a detached diagonal. It was not a pickaxe.
# This draws the real silhouette - a curved head whose tips curl down,
# on a handle running to the bottom-left corner - using the same wood
# tones and the same three-band shading as assets/frames/*.png, so it
# sits next to the other tiers as one set. Only the head colours change,
# which is what "a diamond pickaxe in emerald" means.
# ----------------------------------------------------------------------
EMERALD = {
    "H": (86, 230, 140, 255),    # lit top edge
    "M": (40, 175, 92, 255),     # body
    "D": (12, 84, 44, 255),      # underside / tips
}
WOOD = {
    "W": (80, 59, 22, 255),      # lit side of the handle
    "w": (40, 30, 11, 255),      # shadow side
}

# x -> y of the top-most pixel of the head. Symmetric around x=9.
HEAD_TOP = {4: 5, 5: 4, 6: 3, 7: 2, 8: 1, 9: 1, 10: 1, 11: 2, 12: 3, 13: 4, 14: 5}
HEAD_THICKNESS = 3
HANDLE_STEPS = 11
HANDLE_START = (11, 4)


def build_emerald_pickaxe() -> Path:
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))

    def put(x, y, colour):
        if 0 <= x < 16 and 0 <= y < 16:
            im.putpixel((x, y), colour)

    # Handle first: the head is drawn over it, so the shaft disappears
    # behind the arc exactly like it does on the vanilla tools.
    # The tier frames light the shaft on its left edge (WWw), so the lit
    # column goes on the left here too - and it is the one that survives
    # where the head overlaps, which keeps the joint from reading as a notch.
    hx, hy = HANDLE_START
    for step in range(HANDLE_STEPS):
        put(hx - step, hy + step, WOOD["w"])
        put(hx - step - 1, hy + step, WOOD["W"])

    for x, top in HEAD_TOP.items():
        for row in range(HEAD_THICKNESS):
            put(x, top + row, EMERALD["HMD"[row]])

    out = RP / "textures" / "items" / "psu_emerald_pickaxe.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    im.save(out)
    return out


def build_animated_gif(frames: list[Image.Image]) -> Path:
    """A looping GIF of the tier frames for the store listing.

    Bedrock has no animated pack_icon.png - the flipbook system only feeds
    the block and item atlases - so this is listing artwork, not something
    the game reads.
    """
    scale = 16
    big = [f.resize((16 * scale, 16 * scale), Image.NEAREST) for f in frames]
    flat = []
    for f in big:
        bg = Image.new("RGBA", f.size, ICON_BG_BOTTOM)
        bg.alpha_composite(f)
        flat.append(bg.convert("P", palette=Image.ADAPTIVE))

    out = ROOT / "dist" / "pack_icon_animated.gif"
    out.parent.mkdir(parents=True, exist_ok=True)
    flat[0].save(out, save_all=True, append_images=flat[1:], duration=300, loop=0)
    return out


def main() -> None:
    frames = load_frames()

    pick = build_emerald_pickaxe()
    print(f"pickaxe   -> {pick.relative_to(ROOT)}  (16x16)")

    sheet = build_flipbook(frames)
    print(f"flipbook  -> {sheet.relative_to(ROOT)}  (16x{16 * len(frames)}, {len(frames)} frames)")

    icon = build_icon(frames[-2] if len(frames) >= 2 else frames[-1])  # diamond tier
    for pack in (BP, RP):
        target = pack / "pack_icon.png"
        icon.save(target)
        print(f"pack icon -> {target.relative_to(ROOT)}  ({ICON_SIZE}x{ICON_SIZE})")

    gif = build_animated_gif(frames)
    print(f"listing   -> {gif.relative_to(ROOT)}  ({len(frames)} frames, looping)")


if __name__ == "__main__":
    main()
