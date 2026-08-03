#!/usr/bin/env python3
"""Regenerate everything that is derived from assets/light_sources.json.

Written files:
  packs/PSU_BP/items/psu_<name>.json                  (behaviour: the item)
  packs/PSU_RP/textures/item_texture.json             (icon atlas)
  packs/PSU_RP/textures/flipbook_textures.json        (animated atlas tiles)

The hand-written items (psu:emerald_pickaxe, psu:icone_animee) and the
scripts are left untouched; tools/validate.py checks that they and
scripts/lightmap.js still agree with this table.

Why there are no attachables and no icons here
----------------------------------------------
Up to v4.0 every twin shipped a `minecraft:icon` alias plus an attachable
that drew a flat 16x16 quad in the hand. Both were wrong:

  * the icon alias made a *block* (glowstone, froglight, beacon...) show up
    in the inventory as a flat square instead of the vanilla 3D cube, and
    squashed the two flipbook textures (sea lantern, magma) into one frame;
  * the flat quad was drawn with a single hard-coded pose, so an item in the
    off-hand sat at the main-hand angle on the left arm - the wrong place,
    the wrong rotation, and mirrored.

`minecraft:block_placer` renders the placed block's own icon when no
`minecraft:icon` is present (documented behaviour, needs item format
version 1.21.50), and with no attachable the engine falls back to its own
item renderer, which already knows how to hold a block in either hand.
So the fix for both bugs is to delete our overrides and let vanilla draw.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / "assets" / "light_sources.json"
BP = ROOT / "packs" / "PSU_BP"
RP = ROOT / "packs" / "PSU_RP"

# 1.21.50 is the version that lets minecraft:block_placer stand in for
# minecraft:icon. Below it the twins fall back to a missing-texture icon.
ITEM_FORMAT = "1.21.50"


def item_json(twin: dict) -> dict:
    name = twin["name"]
    return {
        "format_version": ITEM_FORMAT,
        "minecraft:item": {
            "description": {
                # No menu_category on purpose: these twins are created by the
                # script when an item moves to the off-hand, so listing 18
                # duplicate torches in the creative menu would be noise.
                "identifier": f"psu:{name}"
            },
            "components": {
                # No minecraft:icon: block_placer draws the real block icon,
                # in 3D for a cube and animated for a flipbook texture.
                "minecraft:display_name": {"value": f"item.psu.{name}.name"},
                "minecraft:max_stack_size": 64,
                "minecraft:allow_off_hand": True,
                "minecraft:block_placer": {"block": twin["vanilla_block"]}
            }
        }
    }


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    table = json.loads(TABLE.read_text(encoding="utf-8"))
    twins = table["twins"]

    for twin in twins:
        write(BP / "items" / f"psu_{twin['name']}.json", item_json(twin))

    # Stale attachables from v4.0 would still win over the default renderer,
    # so a leftover file would silently bring the off-hand bug back.
    removed = 0
    attach_dir = RP / "attachables"
    if attach_dir.is_dir():
        for path in sorted(attach_dir.glob("*.attachable.json")):
            path.unlink()
            removed += 1
        if not any(attach_dir.iterdir()):
            attach_dir.rmdir()

    # Only the two textures the pack actually owns need an atlas entry now.
    texture_data = {alias: {"textures": path}
                    for alias, path in table["standalone_textures"].items()}

    write(RP / "textures" / "item_texture.json", {
        "resource_pack_name": "psu",
        "texture_name": "atlas.items",
        "texture_data": texture_data
    })

    # The frame count is deliberately left out: Minecraft derives it from
    # height / width, so the pack keeps working if the sheet gains a frame.
    # The vanilla flipbooks (sea lantern, magma) are no longer redeclared -
    # the block icon animates on its own now that we do not override it.
    flipbooks = [
        {
            "flipbook_texture": "textures/items/psu_axe_anim",
            "atlas_tile": "psu_axe_anim",
            "ticks_per_frame": 6,
            "blend_frames": False
        }
    ]
    write(RP / "textures" / "flipbook_textures.json", flipbooks)

    print(f"generated {len(twins)} items, removed {removed} obsolete attachables, "
          f"{len(texture_data)} texture aliases and {len(flipbooks)} flipbooks")


if __name__ == "__main__":
    main()
