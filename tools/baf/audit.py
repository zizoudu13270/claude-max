#!/usr/bin/env python3
"""Inventory Better Animation & Feature and report every legacy signature.

Run:  python3 tools/baf/audit.py [--json <path>]

Writes nothing unless --json is given; the human-readable report goes to
stdout and is the raw material for docs/baf/PROJECT_AUDIT.md.
"""
from __future__ import annotations

import argparse
import collections
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import (BP, RP, LEGACY_PATTERNS, all_files, load, rel,
                        rp_paths, state_animation_names, text_files)


def scan_legacy() -> dict:
    per_pattern: dict[str, dict[str, int]] = {name: {} for name in LEGACY_PATTERNS}
    for path in text_files(BP, RP):
        body = path.read_text(encoding="utf-8", errors="replace")
        for name, pattern in LEGACY_PATTERNS.items():
            hits = len(re.findall(pattern, body))
            if hits:
                per_pattern[name][rel(path)] = hits
    # File and directory names count too.
    for path in all_files(BP, RP):
        for name, pattern in LEGACY_PATTERNS.items():
            if re.search(pattern, str(path.relative_to(BP.parent))):
                per_pattern[name].setdefault(f"[path] {rel(path)}", 0)
    return per_pattern


def inventory() -> dict:
    paths = rp_paths()
    anims = load(paths["animations"])["animations"]
    ctrls = load(paths["controllers"])["animation_controllers"]
    rcs = load(paths["render_controllers"])["render_controllers"]
    geos = load(paths["geometry"])["minecraft:geometry"]
    entity = load(paths["entity"])["minecraft:client_entity"]["description"]
    mats = load(paths["material"])["materials"]

    block_geo = {}
    for path in sorted(RP.glob("models/blocks/*.geo.json")):
        for geo in load(path).get("minecraft:geometry", []):
            block_geo[geo["description"]["identifier"]] = rel(path)

    counts = {
        "files_total": sum(1 for _ in all_files(BP, RP)),
        "files_bp": sum(1 for _ in all_files(BP)),
        "files_rp": sum(1 for _ in all_files(RP)),
        "animations": len(anims),
        "animation_controllers": len(ctrls),
        "render_controllers": len(rcs),
        "player_geometries": len(geos),
        "block_geometries": len(block_geo),
        "entity_animation_aliases": len(entity["animations"]),
        "entity_initialize_statements": len(entity["scripts"].get("initialize", [])),
        "entity_pre_animation_statements": len(entity["scripts"].get("pre_animation", [])),
        "entity_animate_entries": len(entity["scripts"].get("animate", [])),
        "entity_public_variables": len(entity["scripts"].get("variables", {})),
        "custom_materials": len([k for k in mats if k != "version"]),
        "textures_png": sum(1 for p in RP.rglob("*.png")),
        "bp_blocks": sum(1 for _ in BP.glob("blocks/*.json")),
        "bp_features": sum(1 for _ in BP.glob("features/*.json")),
        "bp_feature_rules": sum(1 for _ in BP.glob("feature_rules/*.json")),
        "bp_loot_tables": sum(1 for _ in BP.glob("loot_tables/**/*.json")),
        "bp_scripts": sum(1 for _ in BP.glob("scripts/*.js")),
    }

    obfuscated = re.compile(r"\.[a-z]{6}$")
    counts["animations_obfuscated"] = sum(1 for k in anims if obfuscated.search(k))
    counts["controllers_obfuscated"] = sum(1 for k in ctrls if obfuscated.search(k))
    counts["render_controllers_obfuscated"] = sum(1 for k in rcs if obfuscated.search(k))

    molang = "\n".join(p.read_text(encoding="utf-8") for p in paths.values())
    counts["molang_mp_variables"] = len(set(re.findall(r"\b(?:v|variable)\.(mp_[a-z_0-9]+)", molang)))

    tags = collections.Counter()
    for path in text_files(BP, RP):
        body = path.read_text(encoding="utf-8", errors="replace")
        for tag in re.findall(r"'((?!minecraft:|slot\.)[a-z_0-9]+:[a-z_0-9]+)'", body):
            tags[tag] += 1
    counts["third_party_style_tags"] = len(tags)
    return counts, dict(tags)


def reference_graph() -> dict:
    """animation -> alias -> controller state -> entity -> render controller."""
    paths = rp_paths()
    anims = load(paths["animations"])["animations"]
    ctrls = load(paths["controllers"])["animation_controllers"]
    rcs = load(paths["render_controllers"])["render_controllers"]
    geos = {g["description"]["identifier"] for g in load(paths["geometry"])["minecraft:geometry"]}
    entity = load(paths["entity"])["minecraft:client_entity"]["description"]
    alias = entity["animations"]

    referenced = set(state_animation_names(entity["scripts"].get("animate", [])))
    for ctrl in ctrls.values():
        for state in ctrl.get("states", {}).values():
            referenced |= set(state_animation_names(state.get("animations", [])))
            for transition in state.get("transitions", []):
                referenced |= {k for k in transition if k in alias}

    targets = {alias[a] for a in referenced if a in alias}
    return {
        "aliases_defined": sorted(alias),
        "aliases_referenced": sorted(referenced),
        "aliases_dangling": sorted(a for a in referenced if a not in alias),
        "aliases_unused": sorted(a for a in alias if a not in referenced),
        "animations_unaliased": sorted(k for k in anims if k not in set(alias.values())),
        "controllers_unaliased": sorted(k for k in ctrls if k not in set(alias.values())),
        "animation_targets_missing": sorted(
            t for t in alias.values()
            if t.startswith("animation.") and "player.minecraft" not in t
            and t not in anims and not t.startswith("animation.player.")),
        "controller_targets_missing": sorted(
            t for t in alias.values()
            if t.startswith("controller.animation.") and t not in ctrls
            and ".persona." not in t),
        "render_controllers_missing": sorted(
            r for r in _entity_render_controllers(entity)
            if r not in rcs and not r.startswith("controller.render.player.")),
        "geometries_missing": sorted(
            g for g in entity["geometry"].values()
            if g.startswith("geometry.") and g not in geos
            and g not in {"geometry.humanoid.custom", "geometry.cape"}),
        "reachable_animation_targets": len(targets),
    }


def _entity_render_controllers(entity) -> list[str]:
    out = []
    for entry in entity.get("render_controllers", []):
        if isinstance(entry, str):
            out.append(entry)
        elif isinstance(entry, dict):
            out.extend(entry.keys())
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--json", type=Path)
    args = parser.parse_args()

    counts, tags = inventory()
    legacy = scan_legacy()
    graph = reference_graph()

    print("=== Better Animation & Feature - inventory ===")
    for key, value in counts.items():
        print(f"  {key:36} {value}")

    print("\n=== legacy signatures ===")
    for name, files in legacy.items():
        total = sum(files.values())
        print(f"  {name:20} {total:6} occurrence(s) in {len(files)} file(s)")
        for path, hits in sorted(files.items(), key=lambda kv: -kv[1]):
            print(f"      {hits:6}  {path}")

    print("\n=== non-vanilla namespaced tags ===")
    for tag, hits in sorted(tags.items(), key=lambda kv: -kv[1]):
        print(f"  {tag:40} {hits}")

    print("\n=== reference graph ===")
    for key, value in graph.items():
        if isinstance(value, list):
            print(f"  {key:32} {len(value)}" + (f"  {value[:8]}" if value and len(value) <= 8 else ""))
        else:
            print(f"  {key:32} {value}")

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(
            {"counts": counts, "tags": tags, "legacy": legacy, "graph": graph},
            indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"\nwrote {rel(args.json)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
