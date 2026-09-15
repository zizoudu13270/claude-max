#!/usr/bin/env python3
"""Derive the complete old -> new identifier map for Better Animation & Feature.

The map is written to docs/baf/RENAME_MAP.json and is the single source of
truth for apply_rename.py, the documentation generators and the validator.

Naming policy, in the order each identifier is tried:
  1. an existing human-readable token (animation id, client-entity alias or
     controller state name) - used verbatim;
  2. the single item family or single player state the controlling Molang is
     gated on - used as `<family>_NN`, recorded as a probable function;
  3. stable numbering (`state_NNN`) when nothing can be concluded safely.

Nothing is ever named by guesswork: rule 3 exists so that an unclear
animation keeps a neutral identifier instead of a misleading one.
"""
from __future__ import annotations

import collections
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyse import (dominant_family, dominant_state, evidence, is_meaningful,
                     strip_prefix)
from baf_common import ALIAS, DOCS, SYS, dump, load, rp_paths

ANIM_PREFIX = f"animation.{SYS}.player."
CTRL_PREFIX = f"controller.animation.{SYS}.player."
RC_PREFIX = f"controller.render.{SYS}.player."
GEO_PREFIX = f"geometry.{SYS}.player."

# Hand-verified names for the handful of identifiers whose role is provable
# from the render pipeline rather than from a text token. Each is justified in
# docs/baf/PROJECT_AUDIT.md.
GEOMETRY_NAMES = {
    "geometry.minerplus.player.btumcw": "main",              # 88 bones, full body
    "geometry.minerplus.player.bvznrr": "boat_arms_01",      # arms only, boat render controller
    "geometry.minerplus.player.hyzzjr": "boat_arms_02",      # arms only, boat render controller
    "geometry.minerplus.player.qthzxa": "legs_overlay",      # legs + pants overlay
    "geometry.minerplus.player.pnawgz": "legs_overlay_uv",   # legs overlay driven by uv_anim
}
RENDER_CONTROLLER_NAMES = {
    "controller.render.minerplus.player.tgrzdm": "hidden_base",
    "controller.render.minerplus.player.omixtu": "armor_layers",
    "controller.render.minerplus.player.avgmxq": "legs_overlay",
    "controller.render.minerplus.player.vlwafo": "legs_overlay_uv",
    "controller.render.minerplus.player.vmmipy": "main",
    "controller.render.minerplus.player.vxoiti": "boat_arms",
}
MATERIAL_NAMES = {
    "mp_player_kipfdc": f"{SYS}_player_base",
    "mp_player_ojnhbt": f"{SYS}_player_uv_anim",
    "mp_player_tmamiu": f"{SYS}_player_overlay",
    "mp_player_rkenyc": f"{SYS}_player_overlay_equal",
}
ENTITY_SHORT_KEYS = {
    "materials": {"mp_tmamiu": f"{ALIAS}_overlay", "mp_rkenyc": f"{ALIAS}_overlay_equal"},
    "textures": {"mp_ugyjdo": f"{ALIAS}_boat_arms_01",
                 "mp_mqjlqv": f"{ALIAS}_boat_arms_02",
                 "mp_rpddig": f"{ALIAS}_legs_overlay_uv"},
    "geometry": {"mp_pfsswq": f"{ALIAS}_main",
                 "mp_ugyjdo": f"{ALIAS}_boat_arms_01",
                 "mp_mqjlqv": f"{ALIAS}_boat_arms_02",
                 "mp_zyqqqv": f"{ALIAS}_legs_overlay",
                 "mp_rpddig": f"{ALIAS}_legs_overlay_uv"},
}

# Molang variables whose original name already says what they hold.
DESCRIPTIVE_VARIABLES = {
    "mp_player_animations", "mp_mainhand_custom_pos", "mp_offhand_custom_pos",
    "mp_mainhand_visible", "mp_offhand_visible", "mp_mainhand_hold_up",
    "mp_offhand_hold_up", "mp_helmet_armor_layer_hidden",
    "mp_chestplate_armor_layer_hidden", "mp_leggings_armor_layer_hidden",
    "mp_boots_armor_layer_hidden",
}

# Behaviour-pack content. French source identifiers become English ones so the
# whole project reads in one language.
BLOCK_NAMES = {
    "roche": "rock",
    "roche_charbon": "rock_coal",
    "roche_cuivre": "rock_copper",
    "roche_fer": "rock_iron",
    "roche_or": "rock_gold",
    "roche_emeraude": "rock_emerald",
    "caillou_emeraude": "pebbles_emerald",
}
# Vanilla atlas keys this pack deliberately overrides - never rename these.
VANILLA_TERRAIN_KEYS = {
    "short_grass", "fern", "tall_grass_top", "tall_grass_bottom",
    "large_fern_top", "large_fern_bottom",
}


def _unique(base: str, taken: set[str], numbered: bool = False) -> str:
    if not numbered and base not in taken:
        taken.add(base)
        return base
    index = 1
    while f"{base}_{index:02d}" in taken:
        index += 1
    name = f"{base}_{index:02d}"
    taken.add(name)
    return name


def animation_names(facts: dict) -> tuple[dict, dict]:
    """Return {old id: new id} and {old id: naming rationale}."""
    order = sorted(facts)
    chosen: dict[str, str] = {}
    why: dict[str, dict] = {}
    taken: set[str] = set()

    # Pass 1a - the animation already carries a readable name of its own. These
    # go first so an original `...player.run` keeps `run` and a neighbour that
    # merely happens to sit in a state called `run` gets the suffixed variant.
    for anim_id in order:
        token = anim_id.split(".")[-1]
        if is_meaningful(token):
            chosen[anim_id] = _unique(token, taken)
            why[anim_id] = {"tier": "A", "confidence": "high",
                            "source": "animation id", "token": token}

    # Pass 1b - a readable token exists on the alias or on the calling state.
    for anim_id in order:
        if anim_id in chosen:
            continue
        fact = facts[anim_id]
        candidates = [("client-entity alias", strip_prefix(a)) for a in fact["aliases"]]
        candidates += [("controller state", strip_prefix(c["state"])) for c in fact["contexts"]]
        for source, token in candidates:
            if is_meaningful(token):
                chosen[anim_id] = _unique(token, taken)
                why[anim_id] = {"tier": "A", "confidence": "high",
                                "source": source, "token": token}
                break

    # Pass 2 - one item family, or one player state, guards every caller.
    for anim_id in order:
        if anim_id in chosen:
            continue
        fact = facts[anim_id]
        family = dominant_family(fact)
        state = dominant_state(fact)
        base, source = (family, "item family in guard") if family else (state, "player state in guard")
        if not base:
            continue
        chosen[anim_id] = _unique(base, taken, numbered=True)
        why[anim_id] = {"tier": "B", "confidence": "probable",
                        "source": source, "token": base}

    # Pass 3 - stable numbering, in the original identifier order.
    index = 0
    for anim_id in order:
        if anim_id in chosen:
            continue
        index += 1
        chosen[anim_id] = _unique(f"state_{index:03d}", taken)
        why[anim_id] = {"tier": "C", "confidence": "unknown",
                        "source": "stable numbering", "token": None}

    return {k: ANIM_PREFIX + v for k, v in chosen.items()}, why


def controller_names(sysm: dict, alias: dict) -> dict:
    ctrls = sysm["controllers"]
    reverse = collections.defaultdict(list)
    for name, target in alias.items():
        reverse[target].append(name)

    chosen: dict[str, str] = {}
    taken: set[str] = set()
    for cid in sorted(ctrls):
        tokens = [strip_prefix(a) for a in reverse.get(cid, [])]
        tokens += [strip_prefix(s) for s in ctrls[cid].get("states", {})]
        for token in tokens:
            if is_meaningful(token):
                chosen[cid] = _unique(token, taken)
                break
    index = 0
    for cid in sorted(ctrls):
        if cid in chosen:
            continue
        index += 1
        chosen[cid] = _unique(f"controller_{index:03d}", taken)
    return {k: CTRL_PREFIX + v for k, v in chosen.items()}


def build() -> dict:
    facts, sysm = evidence()
    entity = sysm["entity"]
    alias = sysm["alias"]

    anim_map, rationale = animation_names(facts)
    ctrl_map = controller_names(sysm, alias)

    rc_map = {}
    for rid in sysm["render_controllers"]:
        suffix = rid.split(".")[-1]
        rc_map[rid] = RC_PREFIX + RENDER_CONTROLLER_NAMES.get(rid, suffix)

    geo_map = {g["description"]["identifier"]:
               GEO_PREFIX + GEOMETRY_NAMES[g["description"]["identifier"]]
               for g in sysm["geometry"]}

    # Client-entity animation aliases follow whatever they point at.
    alias_map = {}
    taken_alias: set[str] = set()
    for name, target in alias.items():
        if target in anim_map:
            new = anim_map[target].split(".")[-1]
        elif target in ctrl_map:
            new = ctrl_map[target].split(".")[-1]
        else:
            # A vanilla target (animation.player.sleeping,
            # controller.animation.persona.blink, ...). The old alias name says
            # nothing useful, so name it after what it points at.
            tail = target.split(".player.")[-1] if ".player." in target else target.split(".")[-1]
            new = tail.replace(".", "_")
        alias_map[name] = _unique(f"{ALIAS}_{new}", taken_alias)

    # Controller state names: keep a meaningful one, otherwise follow the first
    # animation the state plays so the controller stays readable. States carry
    # no `lbr_` prefix - that prefix marks client-entity aliases - so a state
    # and the animation it plays stay visibly distinct (`jump_03` plays
    # `lbr_jump_03`).
    state_map: dict[str, dict[str, str]] = {}
    for cid, ctrl in sysm["controllers"].items():
        taken_state = {"default"}
        mapping = {}
        for sname in ctrl.get("states", {}):
            if sname == "default":
                continue
            token = strip_prefix(sname)
            if is_meaningful(token):
                mapping[sname] = _unique(token, taken_state)
        for sname, state in ctrl.get("states", {}).items():
            if sname == "default" or sname in mapping:
                continue
            played = [alias_map[a] for a in
                      (e if isinstance(e, str) else next(iter(e))
                       for e in state.get("animations", []))
                      if a in alias_map]
            base = played[0][len(ALIAS) + 1:] if played else "step"
            mapping[sname] = _unique(base, taken_state, numbered=not played)
        state_map[cid] = mapping

    molang = "\n".join(p.read_text(encoding="utf-8") for p in sysm["paths"].values())
    variables = sorted(set(re.findall(r"\b(?:v|variable)\.(mp_[a-z_0-9]+)", molang)))
    var_map, index = {}, 0
    for name in variables:
        if name in DESCRIPTIVE_VARIABLES:
            var_map[name] = f"{SYS}_{strip_prefix(name)}"
        else:
            index += 1
            var_map[name] = f"{SYS}_v{index:03d}"

    tag_map = {}
    for path in (sysm["paths"] | {}).values():
        for tag in re.findall(r"minerplus:(is_[a-z_0-9]+)", path.read_text(encoding="utf-8")):
            tag_map[f"minerplus:{tag}"] = f"lbr:{tag}"

    block_map = {f"custom:{old}": f"lbr:{new}" for old, new in BLOCK_NAMES.items()}
    feature_map = {}
    for old, new in BLOCK_NAMES.items():
        feature_map[f"minerplus:{old}_feature"] = f"lbr:{new}_feature"
        feature_map[f"minerplus:{old}_rule"] = f"lbr:{new}_rule"
    feature_map["minerplus:caillou_emeraude_forme_0_feature"] = "lbr:pebbles_emerald_shape_0_feature"
    feature_map["minerplus:caillou_emeraude_forme_1_feature"] = "lbr:pebbles_emerald_shape_1_feature"

    block_geo_map = {}
    for old, new in BLOCK_NAMES.items():
        block_geo_map[f"geometry.{old}"] = f"geometry.{SYS}.{new}"
    block_geo_map["geometry.caillou_emeraude_2"] = f"geometry.{SYS}.pebbles_emerald_alt"

    terrain_map = {}
    for old, new in BLOCK_NAMES.items():
        terrain_map[old] = f"{ALIAS}_{new}"
        terrain_map[f"{old}_casse"] = f"{ALIAS}_{new}_broken"

    texture_map = {
        "textures/minerplus/player/cdy": f"textures/{SYS}/player/boat_arms_01",
        "textures/minerplus/player/cdz": f"textures/{SYS}/player/boat_arms_02",
        "textures/minerplus/player/cea": f"textures/{SYS}/player/legs_overlay_uv",
    }
    for old, new in BLOCK_NAMES.items():
        texture_map[f"textures/blocks/{old}"] = f"textures/{SYS}/blocks/{new}"
        texture_map[f"textures/blocks/{old}_casse"] = f"textures/{SYS}/blocks/{new}_broken"
    for stem, count in (("grass", 8), ("fern", 8), ("tallgrass_top", 8),
                        ("tallgrass_bot", 2), ("largefern_top", 8), ("largefern_bot", 4)):
        for n in range(count):
            texture_map[f"textures/blocks/mp_{stem}_{n}"] = f"textures/{SYS}/environment/{stem}_{n}"

    loot_map = {f"loot_tables/blocks/{old}.json": f"loot_tables/blocks/{new}.json"
                for old, new in BLOCK_NAMES.items()}

    return {
        "_about": {
            "project": "Better Animation & Feature",
            "studio": "LBR Studio",
            "generated_by": "tools/baf/build_rename_map.py",
            "policy": "tier A = readable token reused, tier B = single guard "
                      "family/state, tier C = stable numbering",
        },
        "animations": anim_map,
        "animation_rationale": rationale,
        "animation_controllers": ctrl_map,
        "render_controllers": rc_map,
        "player_geometries": geo_map,
        "block_geometries": block_geo_map,
        "materials": MATERIAL_NAMES,
        "entity_animation_aliases": alias_map,
        "controller_states": state_map,
        "entity_short_keys": ENTITY_SHORT_KEYS,
        "molang_variables": var_map,
        "item_tags": dict(sorted(tag_map.items())),
        "blocks": block_map,
        "features": dict(sorted(feature_map.items())),
        "block_states": {"minerplus:forme": "lbr:shape"},
        "terrain_texture_keys": terrain_map,
        "texture_paths": texture_map,
        "loot_table_paths": loot_map,
        "vanilla_terrain_keys_kept": sorted(VANILLA_TERRAIN_KEYS),
    }


if __name__ == "__main__":
    mapping = build()
    dump(DOCS / "RENAME_MAP.json", mapping)
    for key, value in mapping.items():
        if isinstance(value, dict) and key not in {"_about", "animation_rationale"}:
            print(f"{key:28} {len(value)}")
    tiers = collections.Counter(v["tier"] for v in mapping["animation_rationale"].values())
    print("\nanimation naming tiers:", dict(sorted(tiers.items())))
