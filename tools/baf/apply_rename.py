#!/usr/bin/env python3
"""Apply docs/baf/RENAME_MAP.json to the two packs, in place.

Every rewrite is structural: JSON is parsed, the keys and values that are
known to hold identifiers are substituted, and the result is written back.
Animation payloads (bones, keyframes, timings, interpolation) are moved
across untouched - only the identifier they live under changes.

Run:  python3 tools/baf/apply_rename.py
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import (ALIAS, BP, DOCS, PROJECT_NAME, RP, STUDIO, SYS, dump,
                        load, rel)

MAP = load(DOCS / "RENAME_MAP.json")


# ------------------------------------------------------------------
#  Molang
# ------------------------------------------------------------------
def _molang_substitutions() -> list[tuple[re.Pattern, object]]:
    subs: list[tuple[re.Pattern, object]] = []

    variables = MAP["molang_variables"]
    subs.append((re.compile(r"\b(v|variable)\.(mp_[a-z_0-9]+)"),
                 lambda m: f"{m.group(1)}.{variables.get(m.group(2), m.group(2))}"))

    # Longest first so `custom:roche_charbon` never matches as `custom:roche`.
    literals: dict[str, str] = {}
    literals.update(MAP["item_tags"])
    literals.update(MAP["block_states"])
    literals.update(MAP["blocks"])
    literals.update(MAP["features"])
    literals.update(MAP["animations"])
    literals.update(MAP["animation_controllers"])
    literals.update(MAP["render_controllers"])
    literals.update(MAP["player_geometries"])
    literals.update(MAP["block_geometries"])
    literals.update(MAP["texture_paths"])
    if literals:
        pattern = re.compile("|".join(re.escape(k) for k in
                                      sorted(literals, key=len, reverse=True)))
        subs.append((pattern, lambda m: literals[m.group(0)]))

    short = MAP["entity_short_keys"]
    for kind, table in (("Geometry", short["geometry"]),
                        ("Texture", short["textures"]),
                        ("Material", short["materials"])):
        mapping = dict(table)
        subs.append((re.compile(rf"\b{kind}\.(mp_[a-z_0-9]+)"),
                     lambda m, k=kind, t=mapping: f"{k}.{t.get(m.group(1), m.group(1))}"))
    return subs


SUBS = _molang_substitutions()


def molang(value):
    """Rewrite identifiers inside a Molang expression (or any string)."""
    if not isinstance(value, str):
        return value
    for pattern, repl in SUBS:
        value = pattern.sub(repl, value)
    return value


def walk(node):
    """Rewrite every string in a structure, leaving keys alone."""
    if isinstance(node, dict):
        return {k: walk(v) for k, v in node.items()}
    if isinstance(node, list):
        return [walk(v) for v in node]
    return molang(node)


def rename_entries(entries, table):
    """`animations` / `animate` arrays: bare name or {name: condition}."""
    out = []
    for entry in entries or []:
        if isinstance(entry, str):
            out.append(table.get(entry, entry))
        elif isinstance(entry, dict):
            out.append({table.get(k, k): molang(v) for k, v in entry.items()})
        else:
            out.append(entry)
    return out


# ------------------------------------------------------------------
#  Resource pack
# ------------------------------------------------------------------
def convert_animations(src: Path, dst: Path) -> int:
    data = load(src)
    table = MAP["animations"]
    data["animations"] = {table.get(k, k): walk(v) for k, v in data["animations"].items()}
    dump(dst, data)
    return len(data["animations"])


def convert_controllers(src: Path, dst: Path) -> int:
    data = load(src)
    alias = MAP["entity_animation_aliases"]
    ctrl_map = MAP["animation_controllers"]
    states_map = MAP["controller_states"]

    out = {}
    for cid, ctrl in data["animation_controllers"].items():
        smap = {"default": "default", **states_map.get(cid, {})}
        new_states = {}
        for sname, state in ctrl.get("states", {}).items():
            body = dict(state)
            if "animations" in body:
                body["animations"] = rename_entries(body["animations"], alias)
            if "transitions" in body:
                body["transitions"] = [
                    {smap.get(k, k): molang(v) for k, v in t.items()}
                    for t in body["transitions"]
                ]
            for key in ("on_entry", "on_exit"):
                if key in body:
                    body[key] = [molang(s) for s in body[key]]
            for key in ("particle_effects", "sound_effects", "variables"):
                if key in body:
                    body[key] = walk(body[key])
            new_states[smap.get(sname, sname)] = body
        ctrl = dict(ctrl)
        ctrl["states"] = new_states
        if "initial_state" in ctrl:
            ctrl["initial_state"] = smap.get(ctrl["initial_state"], ctrl["initial_state"])
        out[ctrl_map.get(cid, cid)] = ctrl

    data["animation_controllers"] = out
    dump(dst, data)
    return len(out)


def convert_render_controllers(src: Path, dst: Path) -> int:
    data = load(src)
    table = MAP["render_controllers"]
    data["render_controllers"] = {table.get(k, k): walk(v)
                                  for k, v in data["render_controllers"].items()}
    dump(dst, data)
    return len(data["render_controllers"])


def convert_geometry(src: Path, dst: Path, table: dict) -> int:
    data = load(src)
    for geo in data.get("minecraft:geometry", []):
        ident = geo["description"]["identifier"]
        geo["description"]["identifier"] = table.get(ident, ident)
    dump(dst, data)
    return len(data.get("minecraft:geometry", []))


def convert_entity(path: Path) -> None:
    data = load(path)
    desc = data["minecraft:client_entity"]["description"]
    alias = MAP["entity_animation_aliases"]
    short = MAP["entity_short_keys"]
    targets = {**MAP["animations"], **MAP["animation_controllers"]}

    desc["animations"] = {alias.get(k, k): targets.get(v, v)
                          for k, v in desc["animations"].items()}

    desc["materials"] = {short["materials"].get(k, k): MAP["materials"].get(v, v)
                         for k, v in desc["materials"].items()}
    desc["textures"] = {short["textures"].get(k, k): MAP["texture_paths"].get(v, v)
                        for k, v in desc["textures"].items()}
    desc["geometry"] = {short["geometry"].get(k, k): MAP["player_geometries"].get(v, v)
                        for k, v in desc["geometry"].items()}

    rcs = []
    for entry in desc.get("render_controllers", []):
        if isinstance(entry, str):
            rcs.append(MAP["render_controllers"].get(entry, entry))
        else:
            rcs.append({MAP["render_controllers"].get(k, k): molang(v)
                        for k, v in entry.items()})
    desc["render_controllers"] = rcs

    scripts = desc["scripts"]
    for key in ("initialize", "pre_animation"):
        if key in scripts:
            scripts[key] = [molang(s) for s in scripts[key]]
    if "animate" in scripts:
        scripts["animate"] = rename_entries(scripts["animate"], alias)
    if "scale" in scripts:
        scripts["scale"] = molang(scripts["scale"])
    if "variables" in scripts:
        variables = MAP["molang_variables"]
        scripts["variables"] = {
            f"variable.{variables[k.split('.', 1)[1]]}"
            if k.startswith("variable.") and k.split(".", 1)[1] in variables else k: v
            for k, v in scripts["variables"].items()
        }

    # Order the description so the file reads top-down: identity, look, then
    # behaviour. Bedrock ignores key order; humans do not.
    order = ["identifier", "min_engine_version", "materials", "textures",
             "geometry", "queryable_geometry", "render_controllers",
             "enable_attachables", "spawn_egg", "animations", "scripts"]
    data["minecraft:client_entity"]["description"] = {
        **{k: desc[k] for k in order if k in desc},
        **{k: v for k, v in desc.items() if k not in order},
    }
    dump(path, data)


def convert_material(path: Path) -> None:
    data = load(path)
    table = MAP["materials"]
    out = {}
    for key, body in data["materials"].items():
        if ":" in key:
            child, parent = key.split(":", 1)
            key = f"{table.get(child, child)}:{table.get(parent, parent)}"
        out[key] = body
    data["materials"] = out
    dump(path, data)


def convert_terrain_texture(path: Path) -> None:
    data = load(path)
    keys = MAP["terrain_texture_keys"]
    paths = MAP["texture_paths"]

    def repath(value):
        if isinstance(value, str):
            return paths.get(value, value)
        if isinstance(value, list):
            return [repath(v) for v in value]
        if isinstance(value, dict):
            return {k: repath(v) for k, v in value.items()}
        return value

    data["texture_data"] = {keys.get(k, k): repath(v)
                            for k, v in data["texture_data"].items()}
    dump(path, data)


def convert_rp_blocks(path: Path) -> None:
    data = load(path)
    blocks = MAP["blocks"]
    keys = MAP["terrain_texture_keys"]
    out = {}
    for key, body in data.items():
        if key == "format_version":
            out[key] = body
            continue
        if isinstance(body, dict) and isinstance(body.get("textures"), str):
            body = dict(body)
            body["textures"] = keys.get(body["textures"], body["textures"])
        out[blocks.get(key, key)] = body
    dump(path, data.__class__(out))


# ------------------------------------------------------------------
#  Behaviour pack + shared text
# ------------------------------------------------------------------
def convert_generic_json(path: Path) -> None:
    """Behaviour-pack JSON: blocks, features, feature rules and loot tables.

    A few fields hold names from a different namespace than the surrounding
    identifiers - `texture` names a terrain_texture.json key and
    `minecraft:loot` names a file - so the rewrite is driven by the key the
    value sits under, not by the value alone.
    """
    data = load(path)
    blocks = MAP["blocks"]
    features = MAP["features"]
    states = MAP["block_states"]
    geo = MAP["block_geometries"]
    terrain = MAP["terrain_texture_keys"]
    loot = MAP["loot_table_paths"]

    def convert(node, key=None):
        if isinstance(node, dict):
            out = {}
            for child_key, value in node.items():
                new_key = states.get(child_key, blocks.get(child_key, child_key))
                out[new_key] = convert(value, child_key)
            return out
        if isinstance(node, list):
            return [convert(v, key) for v in node]
        if isinstance(node, str):
            if key == "texture" and node in terrain:
                return terrain[node]
            if key == "minecraft:loot" and node in loot:
                return loot[node]
            for table in (features, blocks, geo, states):
                if node in table:
                    return table[node]
            return molang(node)
        return node

    dump(path, convert(data))


def convert_lang(path: Path) -> None:
    body = path.read_text(encoding="utf-8")
    for old, new in sorted(MAP["blocks"].items(), key=lambda kv: -len(kv[0])):
        body = body.replace(old, new)
    path.write_text(body, encoding="utf-8")


def convert_script(path: Path) -> None:
    body = path.read_text(encoding="utf-8")
    for old, new in sorted(MAP["blocks"].items(), key=lambda kv: -len(kv[0])):
        body = body.replace(old, new)
    path.write_text(body, encoding="utf-8")


# ------------------------------------------------------------------
#  File layout
# ------------------------------------------------------------------
PACK_VERSION = [1, 2, 0]


def convert_manifests() -> None:
    """Re-state the identity of both packs.

    UUIDs are deliberately left alone: they are what Minecraft uses to match an
    installed pack to a world, and changing them would orphan every world that
    already has 1.0.2 applied.

    PACK_VERSION is the version of the pack as it currently ships. 1.1.0 was the
    rename (the block identifiers changed namespace, breaking existing worlds);
    1.2.0 drops lbr:pebbles_emerald - see docs/baf/REMOVED.json.
    """
    bp = load(BP / "manifest.json")
    rp = load(RP / "manifest.json")
    for manifest in (bp, rp):
        manifest["header"]["version"] = PACK_VERSION
        manifest["header"]["name"] = "pack.name"
        manifest["header"]["description"] = "pack.description"
        for module in manifest.get("modules", []):
            module["version"] = PACK_VERSION
        # Only metadata that is actually known. No licence and no URL are
        # invented for this project.
        manifest["metadata"] = {
            "authors": [STUDIO],
            "generated_with": {"lbr_baf_tools": ["1.0.0"]},
        }
    for dependency in bp.get("dependencies", []):
        if dependency.get("uuid") == rp["header"]["uuid"]:
            dependency["version"] = PACK_VERSION

    order = ["format_version", "header", "modules", "dependencies", "metadata"]
    for pack, manifest in ((BP, bp), (RP, rp)):
        dump(pack / "manifest.json",
             {**{k: manifest[k] for k in order if k in manifest},
              **{k: v for k, v in manifest.items() if k not in order}})


def move(src: Path, dst: Path) -> None:
    if src == dst or not src.exists():
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src), str(dst))


def relayout() -> list[tuple[str, str]]:
    moves = []
    names = {
        RP / "animations" / "minerplus_player.animation.json":
            RP / "animations" / f"{SYS}_player.animation.json",
        RP / "animation_controllers" / "minerplus_player.animation_controllers.json":
            RP / "animation_controllers" / f"{SYS}_player.animation_controllers.json",
        RP / "render_controllers" / "minerplus_player.render_controllers.json":
            RP / "render_controllers" / f"{SYS}_player.render_controllers.json",
        RP / "models" / "entity" / "minerplus_player.geo.json":
            RP / "models" / "entity" / f"{SYS}_player.geo.json",
    }
    block_files = {
        "roche": "rock", "roche_charbon": "rock_coal", "roche_cuivre": "rock_copper",
        "roche_fer": "rock_iron", "roche_or": "rock_gold",
        "roche_emeraude": "rock_emerald", "caillou_emeraude": "pebbles_emerald",
    }
    for old, new in block_files.items():
        names[BP / "blocks" / f"{old}.json"] = BP / "blocks" / f"{new}.json"
        names[BP / "loot_tables" / "blocks" / f"{old}.json"] = BP / "loot_tables" / "blocks" / f"{new}.json"
        names[BP / "features" / f"{old}_feature.json"] = BP / "features" / f"{new}_feature.json"
        names[BP / "feature_rules" / f"{old}_rule.json"] = BP / "feature_rules" / f"{new}_rule.json"
    names[BP / "features" / "caillou_emeraude_forme_0_feature.json"] = BP / "features" / "pebbles_emerald_shape_0_feature.json"
    names[BP / "features" / "caillou_emeraude_forme_1_feature.json"] = BP / "features" / "pebbles_emerald_shape_1_feature.json"
    names[RP / "models" / "blocks" / "roche.geo.json"] = RP / "models" / "blocks" / "rock.geo.json"
    names[RP / "models" / "blocks" / "caillou_emeraude.geo.json"] = RP / "models" / "blocks" / "pebbles_emerald.geo.json"
    names[RP / "models" / "blocks" / "caillou_emeraude_2.geo.json"] = RP / "models" / "blocks" / "pebbles_emerald_alt.geo.json"

    for old_path, new_path in MAP["texture_paths"].items():
        names[RP / f"{old_path}.png"] = RP / f"{new_path}.png"

    for src, dst in names.items():
        if src.exists():
            moves.append((rel(src), rel(dst)))
            move(src, dst)

    # Drop directories the moves emptied, deepest first.
    for folder in sorted((p for p in RP.rglob("*") if p.is_dir()),
                         key=lambda p: len(p.parts), reverse=True):
        if not any(folder.iterdir()):
            folder.rmdir()
    return moves


def main() -> int:
    anim_src = RP / "animations" / "minerplus_player.animation.json"
    ctrl_src = RP / "animation_controllers" / "minerplus_player.animation_controllers.json"
    rc_src = RP / "render_controllers" / "minerplus_player.render_controllers.json"
    geo_src = RP / "models" / "entity" / "minerplus_player.geo.json"

    print(f"animations          {convert_animations(anim_src, anim_src)}")
    print(f"controllers         {convert_controllers(ctrl_src, ctrl_src)}")
    print(f"render controllers  {convert_render_controllers(rc_src, rc_src)}")
    print(f"player geometries   {convert_geometry(geo_src, geo_src, MAP['player_geometries'])}")
    for path in sorted(RP.glob("models/blocks/*.geo.json")):
        convert_geometry(path, path, MAP["block_geometries"])
    convert_entity(RP / "entity" / "player.entity.json")
    convert_material(RP / "materials" / "entity.material")
    convert_terrain_texture(RP / "textures" / "terrain_texture.json")
    convert_rp_blocks(RP / "blocks.json")

    for folder in ("blocks", "features", "feature_rules"):
        for path in sorted(BP.glob(f"{folder}/*.json")):
            convert_generic_json(path)
    for path in sorted(BP.glob("loot_tables/**/*.json")):
        convert_generic_json(path)
    for path in sorted(BP.glob("scripts/*.js")):
        convert_script(path)
    for pack in (BP, RP):
        for path in sorted(pack.glob("texts/*.lang")):
            convert_lang(path)

    convert_manifests()
    moves = relayout()
    print(f"files moved         {len(moves)}")
    dump(DOCS / "FILE_MOVES.json", moves)
    return 0


if __name__ == "__main__":
    sys.exit(main())
