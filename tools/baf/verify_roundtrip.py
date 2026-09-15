#!/usr/bin/env python3
"""Prove the refactor only renamed things.

Takes the original 1.0.2 extraction, applies the inverse of
docs/baf/RENAME_MAP.json to the refactored packs, and requires the result to
equal the original structure exactly. Anything that is not a pure rename -
a dropped keyframe, a reordered transition, a changed condition - shows up
here as a difference.

Run:  python3 tools/baf/verify_roundtrip.py <original extraction dir>
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import BP, DOCS, RP, SYS, load, rel

MAP = load(DOCS / "RENAME_MAP.json")


def inverse_tables() -> tuple[dict, dict]:
    literals: dict[str, str] = {}
    for key in ("item_tags", "block_states", "blocks", "features", "animations",
                "animation_controllers", "render_controllers", "player_geometries",
                "block_geometries", "texture_paths", "terrain_texture_keys",
                "loot_table_paths", "materials", "entity_animation_aliases"):
        for old, new in MAP[key].items():
            literals.setdefault(new, old)
    for table in MAP["entity_short_keys"].values():
        for old, new in table.items():
            literals.setdefault(new, old)
    variables = {new: old for old, new in MAP["molang_variables"].items()}
    return literals, variables


LITERALS, VARIABLES = inverse_tables()
# Word-bounded so a short identifier can never match inside a longer word.
LITERAL_RE = re.compile(r"\b(?:" + "|".join(
    re.escape(k) for k in sorted(LITERALS, key=len, reverse=True)) + r")\b")
VAR_RE = re.compile(rf"\b(v|variable)\.({SYS}_[a-z_0-9]+)")
SHORT_RE = re.compile(r"\b(Geometry|Texture|Material)\.(lbr_[a-z_0-9]+)")
SHORT = {kind: {new: old for old, new in table.items()}
         for kind, table in (("Geometry", MAP["entity_short_keys"]["geometry"]),
                             ("Texture", MAP["entity_short_keys"]["textures"]),
                             ("Material", MAP["entity_short_keys"]["materials"]))}


def unmap(value: str) -> str:
    value = VAR_RE.sub(lambda m: f"{m.group(1)}.{VARIABLES.get(m.group(2), m.group(2))}", value)
    value = SHORT_RE.sub(lambda m: f"{m.group(1)}.{SHORT[m.group(1)].get(m.group(2), m.group(2))}", value)
    return LITERAL_RE.sub(lambda m: LITERALS[m.group(0)], value)


def normalise(node):
    """Strip every renamed identifier back out, from keys and values alike."""
    if isinstance(node, dict):
        return {unmap(k) if isinstance(k, str) else k: normalise(v) for k, v in node.items()}
    if isinstance(node, list):
        return [normalise(v) for v in node]
    if isinstance(node, str):
        return unmap(node)
    if isinstance(node, float) and node == int(node):
        return int(node)
    return node


def canonical(node):
    """Order-insensitive comparison of mappings; lists keep their order."""
    if isinstance(node, dict):
        return {k: canonical(v) for k, v in sorted(node.items())}
    if isinstance(node, list):
        return [canonical(v) for v in node]
    if isinstance(node, float) and node == int(node):
        return int(node)
    return node


PAIRS = [
    ("BetterAnimationFeature_RP/animations/minerplus_player.animation.json",
     RP / "animations" / f"{SYS}_player.animation.json"),
    ("BetterAnimationFeature_RP/animation_controllers/minerplus_player.animation_controllers.json",
     RP / "animation_controllers" / f"{SYS}_player.animation_controllers.json"),
    ("BetterAnimationFeature_RP/render_controllers/minerplus_player.render_controllers.json",
     RP / "render_controllers" / f"{SYS}_player.render_controllers.json"),
    ("BetterAnimationFeature_RP/models/entity/minerplus_player.geo.json",
     RP / "models" / "entity" / f"{SYS}_player.geo.json"),
    ("BetterAnimationFeature_RP/entity/player.entity.json",
     RP / "entity" / "player.entity.json"),
    ("BetterAnimationFeature_RP/textures/terrain_texture.json",
     RP / "textures" / "terrain_texture.json"),
    ("BetterAnimationFeature_RP/blocks.json", RP / "blocks.json"),
    ("BetterAnimationFeature_RP/materials/entity.material", RP / "materials" / "entity.material"),
]
for old, new in (("roche", "rock"), ("roche_charbon", "rock_coal"),
                 ("roche_cuivre", "rock_copper"), ("roche_fer", "rock_iron"),
                 ("roche_or", "rock_gold"), ("roche_emeraude", "rock_emerald"),
                 ("caillou_emeraude", "pebbles_emerald")):
    PAIRS.append((f"BetterAnimationFeature_BP/blocks/{old}.json", BP / "blocks" / f"{new}.json"))
    PAIRS.append((f"BetterAnimationFeature_BP/loot_tables/blocks/{old}.json",
                  BP / "loot_tables" / "blocks" / f"{new}.json"))
    PAIRS.append((f"BetterAnimationFeature_BP/features/{old}_feature.json",
                  BP / "features" / f"{new}_feature.json"))
    PAIRS.append((f"BetterAnimationFeature_BP/feature_rules/{old}_rule.json",
                  BP / "feature_rules" / f"{new}_rule.json"))
PAIRS += [
    ("BetterAnimationFeature_BP/features/caillou_emeraude_forme_0_feature.json",
     BP / "features" / "pebbles_emerald_shape_0_feature.json"),
    ("BetterAnimationFeature_BP/features/caillou_emeraude_forme_1_feature.json",
     BP / "features" / "pebbles_emerald_shape_1_feature.json"),
    ("BetterAnimationFeature_RP/models/blocks/roche.geo.json",
     RP / "models" / "blocks" / "rock.geo.json"),
    ("BetterAnimationFeature_RP/models/blocks/caillou_emeraude.geo.json",
     RP / "models" / "blocks" / "pebbles_emerald.geo.json"),
    ("BetterAnimationFeature_RP/models/blocks/caillou_emeraude_2.geo.json",
     RP / "models" / "blocks" / "pebbles_emerald_alt.geo.json"),
]


def diff_path(a, b, trail=""):
    """First structural difference, as a JSON path."""
    if type(a) is not type(b):
        return f"{trail}: {type(a).__name__} vs {type(b).__name__}"
    if isinstance(a, dict):
        for key in sorted(set(a) | set(b)):
            if key not in a:
                return f"{trail}.{key}: only after"
            if key not in b:
                return f"{trail}.{key}: only before"
            found = diff_path(a[key], b[key], f"{trail}.{key}")
            if found:
                return found
        return None
    if isinstance(a, list):
        if len(a) != len(b):
            return f"{trail}: length {len(a)} vs {len(b)}"
        for index, (x, y) in enumerate(zip(a, b)):
            found = diff_path(x, y, f"{trail}[{index}]")
            if found:
                return found
        return None
    return None if a == b else f"{trail}: {a!r} vs {b!r}"


def invert_controller_states(data):
    """Controller state names live in a per-controller namespace, so they are
    inverted structurally rather than by text substitution."""
    inverse_ctrl = {new: old for old, new in MAP["animation_controllers"].items()}
    out = {}
    for cid, controller in data["animation_controllers"].items():
        old_cid = inverse_ctrl.get(cid, cid)
        table = {new: old for old, new in MAP["controller_states"].get(old_cid, {}).items()}
        controller = dict(controller)
        if "initial_state" in controller:
            controller["initial_state"] = table.get(controller["initial_state"],
                                                    controller["initial_state"])
        states = {}
        for sname, state in controller.get("states", {}).items():
            state = dict(state)
            if "transitions" in state:
                state["transitions"] = [{table.get(k, k): v for k, v in t.items()}
                                        for t in state["transitions"]]
            states[table.get(sname, sname)] = state
        controller["states"] = states
        out[cid] = controller
    data = dict(data)
    data["animation_controllers"] = out
    return data


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("original", type=Path, help="directory holding the 1.0.2 extraction")
    args = parser.parse_args()

    failures = 0
    for old_rel, new_path in PAIRS:
        old_path = args.original / old_rel
        if not old_path.exists():
            print(f"  MISSING  {old_rel}")
            failures += 1
            continue
        before = canonical(load(old_path))
        raw = load(new_path)
        if "animation_controllers" in raw:
            raw = invert_controller_states(raw)
        after = canonical(normalise(raw))
        if before == after:
            print(f"  ok       {rel(new_path)}")
        else:
            failures += 1
            print(f"  DIFFERS  {rel(new_path)}")
            print(f"           {diff_path(after, before)}")
    print()
    if failures:
        print(f"FAILED - {failures} file(s) are not a pure rename of the original")
        return 1
    print(f"OK - all {len(PAIRS)} files round-trip to the original 1.0.2 content")
    return 0


if __name__ == "__main__":
    sys.exit(main())
