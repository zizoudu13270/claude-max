#!/usr/bin/env python3
"""Validate Better Animation & Feature end to end.

Walks the whole reference graph

    animation -> client entity alias -> animation controller
              -> player.entity.json -> render controller
              -> geometry -> material -> texture

and fails on any edge that points at something which does not exist, on any
unparseable JSON, on any malformed identifier, and on any surviving legacy
namespace that is not listed as a documented exception.

Run:  python3 tools/baf/validate_baf.py
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import (BP, DOCS, RP, SYS, all_files, load, rel, rp_paths,
                        state_animation_names, text_files)

errors: list[str] = []
warnings: list[str] = []
checks = 0

# Identifiers Minecraft itself provides; a reference to one is not a dangling
# edge even though this pack does not define it.
VANILLA_ANIMATIONS = re.compile(r"^animation\.player\.|^animation\.humanoid\.")
VANILLA_CONTROLLERS = re.compile(r"^controller\.animation\.(player|persona|humanoid)\.")
VANILLA_RENDER = re.compile(r"^controller\.render\.player\.")
VANILLA_GEOMETRY = {"geometry.humanoid.custom", "geometry.humanoid.customSlim", "geometry.cape"}
VANILLA_MATERIALS = {"entity_alphatest", "player_animated", "player_spectator",
                     "entity_alphablend", "entity_alphatest_change_color"}
VANILLA_TEXTURES = re.compile(r"^textures/entity/")

# Every legacy signature must be gone. Anything that has to stay is listed
# here with the reason, and the reason is repeated in PROJECT_AUDIT.md.
LEGACY = {
    "minerplus": r"minerplus",
    "MinerPlus": r"MinerPlus",
    "MINERPLUS": r"MINERPLUS",
    "mp_ prefix": r"\bmp_[a-z_0-9]+",
    "mp: namespace": r"\bmp:",
    "custom: namespace": r"\bcustom:",
    "actions_and_stuff": r"actions[_&]?and[_&]?stuff|actionstuff|actions&stuff",
    "oreville": r"(?i)oreville",
}
DOCUMENTED_EXCEPTIONS: dict[str, str] = {}


def check(condition, message) -> bool:
    global checks
    checks += 1
    if not condition:
        errors.append(message)
    return bool(condition)


def warn(condition, message) -> None:
    if not condition:
        warnings.append(message)


def check_json_parses() -> dict[Path, object]:
    parsed = {}
    for path in sorted(list(BP.rglob("*.json")) + list(RP.rglob("*.json"))
                       + list(RP.rglob("*.material"))):
        try:
            parsed[path] = load(path)
        except json.JSONDecodeError as exc:
            errors.append(f"{rel(path)}: does not parse - {exc}")
    return parsed


def check_identifier_shape(sysm) -> None:
    legal = re.compile(r"^[a-z][a-z_0-9]*(\.[a-z_0-9]+)*$")
    for label, ids in (
        ("animation", sysm["animations"]),
        ("animation controller", sysm["controllers"]),
        ("render controller", sysm["render_controllers"]),
    ):
        for ident in ids:
            check(legal.match(ident), f"{label} identifier is malformed: {ident}")
    for geo in sysm["geometry"]:
        ident = geo["description"]["identifier"]
        check(legal.match(ident), f"geometry identifier is malformed: {ident}")


def check_animation_graph(sysm) -> None:
    anims, ctrls, entity = sysm["animations"], sysm["controllers"], sysm["entity"]
    alias = entity["animations"]

    for name, target in alias.items():
        if target.startswith("animation."):
            check(target in anims or VANILLA_ANIMATIONS.match(target),
                  f"client entity alias '{name}' points at missing animation {target}")
        elif target.startswith("controller.animation."):
            check(target in ctrls or VANILLA_CONTROLLERS.match(target),
                  f"client entity alias '{name}' points at missing controller {target}")
        else:
            errors.append(f"client entity alias '{name}' has an unrecognised target {target}")

    referenced = set(state_animation_names(entity["scripts"].get("animate", [])))
    for cid, ctrl in ctrls.items():
        states = ctrl.get("states", {})
        check(states, f"{cid}: has no states")
        if "initial_state" in ctrl:
            check(ctrl["initial_state"] in states,
                  f"{cid}: initial_state '{ctrl['initial_state']}' is not a state")
        else:
            check("default" in states, f"{cid}: has neither 'default' nor initial_state")
        for sname, state in states.items():
            played = state_animation_names(state.get("animations", []))
            referenced |= set(played)
            for played_name in played:
                check(played_name in alias,
                      f"{cid}/{sname}: plays '{played_name}', which the client entity "
                      f"does not declare")
            for transition in state.get("transitions", []):
                for target in transition:
                    check(target in states,
                          f"{cid}/{sname}: transitions to '{target}', which is not a state "
                          f"of this controller")

    for anim_id in anims:
        check(anim_id in set(alias.values()),
              f"animation {anim_id} is defined but nothing can play it")
    for cid in ctrls:
        check(cid in set(alias.values()),
              f"animation controller {cid} is defined but never attached")
    for name in alias:
        warn(name in referenced,
             f"client entity alias '{name}' is declared but never used")


def check_render_graph(sysm) -> None:
    entity = sysm["entity"]
    rcs = sysm["render_controllers"]
    geometries = {g["description"]["identifier"] for g in sysm["geometry"]}
    materials = set(sysm["materials"]["materials"]) - {"version"}
    material_names = {key.split(":", 1)[0] for key in materials}

    declared = []
    for entry in entity.get("render_controllers", []):
        declared.extend([entry] if isinstance(entry, str) else list(entry))
    for name in declared:
        check(name in rcs or VANILLA_RENDER.match(name),
              f"player.entity.json uses render controller {name}, which is not defined")

    for target in entity["geometry"].values():
        check(target in geometries or target in VANILLA_GEOMETRY,
              f"player.entity.json geometry '{target}' is not defined")
    for target in entity["materials"].values():
        check(target in material_names or target in VANILLA_MATERIALS,
              f"player.entity.json material '{target}' is not defined")
    for target in entity["textures"].values():
        if VANILLA_TEXTURES.match(target):
            continue
        check((RP / f"{target}.png").exists() or (RP / f"{target}.tga").exists(),
              f"player.entity.json texture '{target}' has no file")

    key_ref = re.compile(r"\b(Geometry|Texture|Material)\.([a-z_0-9]+)", re.IGNORECASE)
    buckets = {"geometry": set(entity["geometry"]),
               "texture": set(entity["textures"]),
               "material": set(entity["materials"])}
    for rid, controller in rcs.items():
        for kind, key in key_ref.findall(json.dumps(controller)):
            check(key in buckets[kind.lower()],
                  f"{rid}: {kind}.{key} is not declared in player.entity.json")


def check_molang_variables(sysm) -> None:
    """Every custom variable must be written somewhere before it is read."""
    blob = "\n".join(p.read_text(encoding="utf-8") for p in sysm["paths"].values())
    used = set(re.findall(rf"\b(?:v|variable)\.({SYS}_[a-z_0-9]+)", blob))
    assigned = set(re.findall(rf"\b(?:v|variable)\.({SYS}_[a-z_0-9]+)\s*=", blob))
    for name in sorted(used - assigned):
        warn(False, f"Molang variable v.{name} is read but never assigned")
    check(not re.search(r"\bv\.mp_", blob), "a v.mp_* variable survived the rename")


def check_blocks(parsed) -> None:
    rp_blocks = load(RP / "blocks.json")
    terrain = load(RP / "textures" / "terrain_texture.json")["texture_data"]
    bp_ids = set()

    for path in sorted(BP.glob("blocks/*.json")):
        body = load(path)["minecraft:block"]
        ident = body["description"]["identifier"]
        bp_ids.add(ident)
        check(ident.startswith("lbr:"), f"{rel(path)}: identifier {ident} is not in the lbr namespace")
        check(ident in rp_blocks, f"{rel(path)}: {ident} has no entry in blocks.json")

        geo_ids = set()
        for geo_path in sorted(RP.glob("models/blocks/*.geo.json")):
            geo_ids |= {g["description"]["identifier"] for g in load(geo_path)["minecraft:geometry"]}
        wanted = [body["components"]["minecraft:geometry"]["identifier"]]
        for perm in body.get("permutations", []):
            geo = perm.get("components", {}).get("minecraft:geometry")
            if geo:
                wanted.append(geo["identifier"])
        for geo in wanted:
            check(geo in geo_ids, f"{rel(path)}: geometry {geo} is not defined")

        for instance in body["components"].get("minecraft:material_instances", {}).values():
            texture = instance.get("texture")
            check(texture in terrain, f"{rel(path)}: texture key '{texture}' is not in terrain_texture.json")

        loot = body["components"].get("minecraft:loot")
        if loot:
            check((BP / loot).exists(), f"{rel(path)}: loot table {loot} is missing")

        for state in body["description"].get("states", {}):
            check(state.startswith("lbr:"), f"{rel(path)}: block state {state} is not in the lbr namespace")

    for ident, body in rp_blocks.items():
        if ident == "format_version":
            continue
        check(ident in bp_ids, f"blocks.json declares {ident}, which no behaviour block defines")
        check(body["textures"] in terrain,
              f"blocks.json: {ident} break texture '{body['textures']}' is not in terrain_texture.json")


def check_features(parsed) -> None:
    features, rules, blocks = {}, {}, set()
    for path in sorted(BP.glob("blocks/*.json")):
        blocks.add(load(path)["minecraft:block"]["description"]["identifier"])
    for path in sorted(BP.glob("features/*.json")):
        body = next(iter(load(path).values() - {"format_version"})) if False else None
    for path in sorted(BP.glob("features/*.json")):
        data = load(path)
        for key, body in data.items():
            if key == "format_version":
                continue
            features[body["description"]["identifier"]] = (path, key, body)
    for path in sorted(BP.glob("feature_rules/*.json")):
        body = load(path)["minecraft:feature_rules"]
        rules[body["description"]["identifier"]] = (path, body)

    for ident, (path, key, body) in features.items():
        check(ident.startswith("lbr:"), f"{rel(path)}: feature {ident} is not in the lbr namespace")
        placed = body.get("places_block")
        if isinstance(placed, dict):
            check(placed["name"] in blocks, f"{rel(path)}: places unknown block {placed['name']}")
            for state in placed.get("states", {}):
                check(state.startswith("lbr:"), f"{rel(path)}: uses legacy block state {state}")
        elif isinstance(placed, str):
            check(placed in blocks, f"{rel(path)}: places unknown block {placed}")
        for child, _weight in body.get("features", []):
            check(child in features, f"{rel(path)}: references unknown feature {child}")

    for ident, (path, body) in rules.items():
        check(ident.startswith("lbr:"), f"{rel(path)}: rule {ident} is not in the lbr namespace")
        target = body["description"]["places_feature"]
        check(target in features, f"{rel(path)}: places unknown feature {target}")


def check_textures(parsed) -> None:
    terrain = load(RP / "textures" / "terrain_texture.json")["texture_data"]
    used: set[str] = set()

    def collect(value):
        if isinstance(value, str):
            used.add(value)
        elif isinstance(value, list):
            for item in value:
                collect(item)
        elif isinstance(value, dict):
            for key, item in value.items():
                collect(item) if key != "weight" else None

    for body in terrain.values():
        collect(body["textures"])
    for path in used:
        check((RP / f"{path}.png").exists() or (RP / f"{path}.tga").exists(),
              f"terrain_texture.json references {path}, which has no file")

    referenced = set(used) | {t for t in load(RP / "entity" / "player.entity.json")
                              ["minecraft:client_entity"]["description"]["textures"].values()}
    # Files sitting on a vanilla path replace a vanilla texture on purpose.
    vanilla_override = {"textures/blocks/fern", "textures/blocks/tallgrass"}
    for path in sorted(RP.rglob("*.png")):
        stem = str(path.relative_to(RP).with_suffix("")).replace("\\", "/")
        if stem in {"pack_icon"} or stem in vanilla_override:
            continue
        warn(stem in referenced, f"{rel(path)} is never referenced")


def check_scripts() -> None:
    blocks = {load(p)["minecraft:block"]["description"]["identifier"]
              for p in sorted(BP.glob("blocks/*.json"))}
    for path in sorted(BP.glob("scripts/*.js")):
        body = path.read_text(encoding="utf-8")
        for ident in re.findall(r'"(lbr:[a-z_0-9]+)"', body):
            check(ident in blocks, f"{rel(path)}: references unknown block {ident}")
        check(not re.search(r"\bcustom:", body), f"{rel(path)}: still uses the custom: namespace")


def check_lang() -> None:
    blocks = {load(p)["minecraft:block"]["description"]["identifier"]
              for p in sorted(BP.glob("blocks/*.json"))}
    for path in sorted(RP.glob("texts/*.lang")):
        keys = {line.split("=", 1)[0] for line in path.read_text(encoding="utf-8").splitlines()
                if "=" in line and not line.startswith("#")}
        for ident in blocks:
            check(f"tile.{ident}.name" in keys, f"{rel(path)}: no name for {ident}")
        for key in keys:
            if key.startswith("tile."):
                ident = key[len("tile."):-len(".name")]
                check(ident in blocks, f"{rel(path)}: translates unknown block {ident}")


def check_manifests() -> None:
    bp, rp = load(BP / "manifest.json"), load(RP / "manifest.json")
    uuids = set()
    for name, manifest in (("BP", bp), ("RP", rp)):
        header = manifest["header"]
        for uuid in [header["uuid"]] + [m["uuid"] for m in manifest["modules"]]:
            check(uuid not in uuids, f"{name}: UUID {uuid} is used twice")
            uuids.add(uuid)
        check(manifest.get("metadata", {}).get("authors") == ["LBR Studio"],
              f"{name} manifest: metadata.authors must be ['LBR Studio']")
        check(header["name"] == "pack.name" and header["description"] == "pack.description",
              f"{name} manifest: name/description must resolve through texts/*.lang")
        for module in manifest["modules"]:
            check(module["version"] == header["version"],
                  f"{name} manifest: module version differs from the header version")

    deps = [d for d in bp.get("dependencies", []) if d.get("uuid")]
    check(len(deps) == 1 and deps[0]["uuid"] == rp["header"]["uuid"],
          "BP manifest: must depend on the resource pack exactly once")
    check(deps and deps[0]["version"] == rp["header"]["version"],
          "BP manifest: the resource-pack dependency version does not match the RP header")
    entry = next((m["entry"] for m in bp["modules"] if m["type"] == "script"), None)
    check(entry and (BP / entry).exists(), f"BP manifest: script entry {entry} is missing")


def check_no_legacy() -> None:
    for path in text_files(BP, RP):
        body = path.read_text(encoding="utf-8", errors="replace")
        for label, pattern in LEGACY.items():
            for match in re.finditer(pattern, body):
                token = match.group(0)
                if DOCUMENTED_EXCEPTIONS.get(token):
                    continue
                line = body[:match.start()].count("\n") + 1
                errors.append(f"{rel(path)}:{line}: legacy {label} -> {token!r}")
    for path in all_files(BP, RP):
        name = str(path.relative_to(BP.parent))
        for label, pattern in LEGACY.items():
            if re.search(pattern, name):
                errors.append(f"{rel(path)}: legacy {label} in the file path")


def main() -> int:
    parsed = check_json_parses()
    if errors:
        for message in errors:
            print(f"  ERROR    {message}")
        return 1

    paths = rp_paths()
    entity = load(paths["entity"])["minecraft:client_entity"]["description"]
    sysm = {
        "paths": paths,
        "animations": load(paths["animations"])["animations"],
        "controllers": load(paths["controllers"])["animation_controllers"],
        "render_controllers": load(paths["render_controllers"])["render_controllers"],
        "geometry": load(paths["geometry"])["minecraft:geometry"],
        "materials": load(paths["material"]),
        "entity": entity,
    }

    check_identifier_shape(sysm)
    check_animation_graph(sysm)
    check_render_graph(sysm)
    check_molang_variables(sysm)
    check_blocks(parsed)
    check_features(parsed)
    check_textures(parsed)
    check_scripts()
    check_lang()
    check_manifests()
    check_no_legacy()

    for message in warnings:
        print(f"  warning  {message}")
    for message in errors:
        print(f"  ERROR    {message}")
    print()
    if errors:
        print(f"FAILED - {len(errors)} error(s) out of {checks} checks, {len(warnings)} warning(s)")
        return 1
    print(f"OK - {checks} checks passed, {len(warnings)} warning(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
