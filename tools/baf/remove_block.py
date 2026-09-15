#!/usr/bin/env python3
"""Remove a block and everything that exists only to serve it.

Deleting a block by hand leaves debris behind - an orphan feature, a texture
key nothing points at, a translation for a block that no longer exists. This
walks the reference graph instead and removes exactly the closure of the
block, refusing to touch anything that something else still uses.

The removal is recorded in docs/baf/REMOVED.json so the round-trip check knows
the difference between "gone on purpose" and "lost".

Run:  python3 tools/baf/remove_block.py lbr:pebbles_emerald --reason "..."
      python3 tools/baf/remove_block.py lbr:pebbles_emerald --dry-run
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import BP, DOCS, RP, dump, load, rel


def block_files() -> dict[str, Path]:
    return {load(p)["minecraft:block"]["description"]["identifier"]: p
            for p in sorted(BP.glob("blocks/*.json"))}


def feature_bodies() -> dict[str, tuple[Path, str, dict]]:
    out = {}
    for path in sorted(BP.glob("features/*.json")):
        for key, body in load(path).items():
            if key != "format_version":
                out[body["description"]["identifier"]] = (path, key, body)
    return out


def rule_bodies() -> dict[str, tuple[Path, dict]]:
    return {load(p)["minecraft:feature_rules"]["description"]["identifier"]: (p, load(p))
            for p in sorted(BP.glob("feature_rules/*.json"))}


def places(body: dict, target: str) -> bool:
    placed = body.get("places_block")
    if isinstance(placed, str):
        return placed == target
    if isinstance(placed, dict):
        return placed.get("name") == target
    return False


def closure(block_id: str) -> dict:
    """Everything that would become dead once `block_id` is gone."""
    blocks = block_files()
    if block_id not in blocks:
        raise SystemExit(f"no such block: {block_id}")

    body = load(blocks[block_id])["minecraft:block"]
    survivors = {b: load(p)["minecraft:block"] for b, p in blocks.items() if b != block_id}

    # Geometries, texture keys, loot table and block states this block declares.
    geometries = {body["components"]["minecraft:geometry"]["identifier"]}
    for perm in body.get("permutations", []):
        geo = perm.get("components", {}).get("minecraft:geometry")
        if geo:
            geometries.add(geo["identifier"])
    texture_keys = {i["texture"] for i in
                    body["components"].get("minecraft:material_instances", {}).values()
                    if "texture" in i}
    states = set(body["description"].get("states", {}))
    loot = body["components"].get("minecraft:loot")

    rp_blocks = load(RP / "blocks.json")
    if block_id in rp_blocks:
        texture_keys.add(rp_blocks[block_id]["textures"])

    # Anything a surviving block also uses stays.
    for other in survivors.values():
        geometries.discard(other["components"]["minecraft:geometry"]["identifier"])
        for perm in other.get("permutations", []):
            geo = perm.get("components", {}).get("minecraft:geometry")
            if geo:
                geometries.discard(geo["identifier"])
        for instance in other["components"].get("minecraft:material_instances", {}).values():
            texture_keys.discard(instance.get("texture"))
        states -= set(other["description"].get("states", {}))
    for other_id, other in rp_blocks.items():
        if other_id not in {"format_version", block_id}:
            texture_keys.discard(other["textures"])

    # Features that place it, then features that only aggregate those, then the
    # rules that place any of them.
    features = feature_bodies()
    dead_features = {fid for fid, (_p, _k, b) in features.items() if places(b, block_id)}
    changed = True
    while changed:
        changed = False
        for fid, (_p, _k, b) in features.items():
            children = [c for c, _w in b.get("features", [])]
            if fid not in dead_features and children and all(c in dead_features for c in children):
                dead_features.add(fid)
                changed = True
    dead_rules = {rid for rid, (_p, b) in rule_bodies().items()
                  if b["minecraft:feature_rules"]["description"]["places_feature"] in dead_features}

    # A surviving feature must not still point at a doomed one.
    for fid, (path, _k, b) in features.items():
        if fid in dead_features:
            continue
        for child, _weight in b.get("features", []):
            if child in dead_features:
                raise SystemExit(f"{rel(path)}: {fid} still references {child}; "
                                 f"remove that reference first")

    terrain = load(RP / "textures" / "terrain_texture.json")["texture_data"]
    texture_paths = set()
    for key in texture_keys:
        entry = terrain.get(key, {}).get("textures")
        if isinstance(entry, str):
            texture_paths.add(entry)
    kept_paths = set()
    for key, entry in terrain.items():
        if key not in texture_keys and isinstance(entry["textures"], str):
            kept_paths.add(entry["textures"])
    texture_paths -= kept_paths

    files = [blocks[block_id]]
    if loot:
        files.append(BP / loot)
    files += [features[f][0] for f in sorted(dead_features)]
    files += [rule_bodies()[r][0] for r in sorted(dead_rules)]
    for path in sorted(RP.glob("models/blocks/*.geo.json")):
        declared = {g["description"]["identifier"] for g in load(path)["minecraft:geometry"]}
        if declared and declared <= geometries:
            files.append(path)
        elif declared & geometries:
            raise SystemExit(f"{rel(path)}: shares a file with geometry that is kept; "
                             f"split it before removing {block_id}")
    files += [RP / f"{p}.png" for p in sorted(texture_paths) if (RP / f"{p}.png").exists()]

    return {
        "block": block_id,
        "features": sorted(dead_features),
        "feature_rules": sorted(dead_rules),
        "geometries": sorted(geometries),
        "texture_keys": sorted(texture_keys),
        "texture_paths": sorted(texture_paths),
        "block_states": sorted(states),
        "files": sorted(dict.fromkeys(files)),
    }


def apply(plan: dict) -> None:
    block_id = plan["block"]

    rp_blocks = load(RP / "blocks.json")
    rp_blocks.pop(block_id, None)
    dump(RP / "blocks.json", rp_blocks)

    terrain = load(RP / "textures" / "terrain_texture.json")
    for key in plan["texture_keys"]:
        terrain["texture_data"].pop(key, None)
    dump(RP / "textures" / "terrain_texture.json", terrain)

    for path in sorted(RP.glob("texts/*.lang")) + sorted(BP.glob("texts/*.lang")):
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        kept = [l for l in lines if not l.startswith(f"tile.{block_id}.")]
        if kept != lines:
            path.write_text("".join(kept), encoding="utf-8")

    for path in sorted(BP.glob("scripts/*.js")):
        lines = path.read_text(encoding="utf-8").splitlines(keepends=True)
        kept, cuts = [], []
        for line in lines:
            if f'"{block_id}"' in line:
                cuts.append(len(kept))      # where the hole opened
            else:
                kept.append(line)
        if not cuts:
            continue
        # Removing the last entry of an object or array literal leaves the
        # previous line holding a now-dangling comma. Only the lines adjacent
        # to a hole are examined, so unrelated code is never reformatted.
        for index in sorted({c - 1 for c in cuts if c > 0}, reverse=True):
            if index >= len(kept) or not kept[index].rstrip().endswith(","):
                continue
            following = next((l.lstrip() for l in kept[index + 1:] if l.strip()), "")
            if following.startswith(("}", ")", "]")):
                kept[index] = kept[index].rstrip()[:-1] + "\n"
        path.write_text("".join(kept), encoding="utf-8")

    for path in plan["files"]:
        Path(path).unlink()

    for folder in sorted((p for p in (BP, RP) for p in p.rglob("*") if p.is_dir()),
                         key=lambda p: len(p.parts), reverse=True):
        if not any(folder.iterdir()):
            folder.rmdir()


def record(plan: dict, reason: str) -> None:
    path = DOCS / "REMOVED.json"
    log = load(path) if path.exists() else []
    log.append({
        "block": plan["block"],
        "reason": reason,
        "removed_on": dt.date.today().isoformat(),
        "features": plan["features"],
        "feature_rules": plan["feature_rules"],
        "geometries": plan["geometries"],
        "block_states": plan["block_states"],
        "texture_keys": plan["texture_keys"],
        "files": [rel(Path(p)) for p in plan["files"]],
    })
    dump(path, log)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("block", help="block identifier, e.g. lbr:pebbles_emerald")
    parser.add_argument("--reason", default="removed from the add-on")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    plan = closure(args.block)
    print(f"removing {plan['block']}")
    for key in ("features", "feature_rules", "geometries", "block_states", "texture_keys"):
        if plan[key]:
            print(f"  {key:14} {', '.join(plan[key])}")
    print(f"  {'files':14} {len(plan['files'])}")
    for path in plan["files"]:
        print(f"                 {rel(Path(path))}")
    if args.dry_run:
        print("\ndry run - nothing was changed")
        return 0

    apply(plan)
    record(plan, args.reason)
    print(f"\nrecorded in {rel(DOCS / 'REMOVED.json')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
