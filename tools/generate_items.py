#!/usr/bin/env python3
"""Regenerate everything that is derived from assets/light_sources.json.

Written files:
  packs/PSU_BP/items/psu_<name>.json                  (behaviour: the item)
  packs/PSU_RP/attachables/psu_<name>.attachable.json (client: how it is held)
  packs/PSU_RP/textures/item_texture.json             (icon atlas)
  packs/PSU_RP/textures/flipbook_textures.json        (animated atlas tiles)

The hand-written items (psu:emerald_pickaxe, psu:icone_animee) and the
scripts are left untouched; tools/validate.py checks that they and
scripts/lightmap.js still agree with this table.

Run:  python3 tools/generate_items.py
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE = ROOT / "assets" / "light_sources.json"
BP = ROOT / "packs" / "PSU_BP"
RP = ROOT / "packs" / "PSU_RP"

ITEM_FORMAT = "1.20.80"
ATTACHABLE_FORMAT = "1.10.0"


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
                "minecraft:icon": {"texture": f"psu_{name}"},
                "minecraft:display_name": {"value": f"item.psu.{name}.name"},
                "minecraft:max_stack_size": 64,
                "minecraft:allow_off_hand": True,
                "minecraft:block_placer": {"block": twin["vanilla_block"]}
            }
        }
    }


def attachable_json(twin: dict) -> dict:
    name = twin["name"]
    return {
        "format_version": ATTACHABLE_FORMAT,
        "minecraft:attachable": {
            "description": {
                "identifier": f"psu:{name}",
                "materials": {
                    "default": "entity_alphatest",
                    "enchanted": "entity_alphatest_glint"
                },
                "textures": {
                    # Full path, not a short atlas alias: an alias here is the
                    # other classic cause of a wrong texture in hand.
                    "default": twin["texture"],
                    "enchanted": "textures/misc/enchanted_item_glint"
                },
                "geometry": {"default": "geometry.psu_item"},
                "animations": {
                    "hold_first_person": "animation.psu.item.hold_first_person",
                    "hold_third_person": "animation.psu.item.hold_third_person"
                },
                "scripts": {
                    "animate": [
                        {"hold_first_person": "c.is_first_person"},
                        {"hold_third_person": "!c.is_first_person"}
                    ]
                },
                "render_controllers": ["controller.render.psu_item"]
            }
        }
    }


def write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=4, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> None:
    table = json.loads(TABLE.read_text(encoding="utf-8"))
    twins = table["twins"]

    attachables = 0
    for twin in twins:
        name = twin["name"]
        write(BP / "items" / f"psu_{name}.json", item_json(twin))

        target = RP / "attachables" / f"psu_{name}.attachable.json"
        if twin.get("animated"):
            # A flat attachable quad cannot play a flipbook: it would stretch
            # the whole strip over the model. Falling back to the default item
            # sprite renderer keeps the animation and the vanilla look.
            target.unlink(missing_ok=True)
        else:
            write(target, attachable_json(twin))
            attachables += 1

    texture_data = {f"psu_{t['name']}": {"textures": t["texture"]} for t in twins}
    for alias, path in table["standalone_textures"].items():
        texture_data[alias] = {"textures": path}

    write(RP / "textures" / "item_texture.json", {
        "resource_pack_name": "psu",
        "texture_name": "atlas.items",
        "texture_data": texture_data
    })

    # The frame count is deliberately left out: Minecraft derives it from
    # height / width, so the pack keeps working if Mojang re-times a texture.
    flipbooks = [
        {
            "flipbook_texture": "textures/items/psu_axe_anim",
            "atlas_tile": "psu_axe_anim",
            "ticks_per_frame": 6,
            "blend_frames": False
        }
    ]
    for twin in twins:
        if not twin.get("animated"):
            continue
        flipbooks.append({
            "flipbook_texture": twin["texture"],
            "atlas_tile": f"psu_{twin['name']}",
            "ticks_per_frame": 4,
            "blend_frames": False
        })

    write(RP / "textures" / "flipbook_textures.json", flipbooks)

    print(f"generated {len(twins)} items, {attachables} attachables, "
          f"{len(texture_data)} texture aliases and {len(flipbooks)} flipbooks")


if __name__ == "__main__":
    main()
