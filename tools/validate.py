#!/usr/bin/env python3
"""Structural test suite for the Ultimate Survival Pack.

Minecraft fails silently: a typo in a texture alias gives you a pink
chequerboard, a missing lang key prints the raw key, a mismatched UUID
makes the pack refuse to load with no explanation. This script catches
all of that before the .mcaddon is built.

Run:  python3 tools/validate.py
Exit code 0 = every check passed.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BP = ROOT / "packs" / "PSU_BP"
RP = ROOT / "packs" / "PSU_RP"
TABLE = ROOT / "assets" / "light_sources.json"

errors: list[str] = []
warnings: list[str] = []
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        errors.append(message)
    return bool(condition)


def warn(condition, message):
    global checks
    checks += 1
    if not condition:
        warnings.append(message)


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{path.relative_to(ROOT)}: invalid JSON - {exc}")
        return None


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


# ------------------------------------------------------------------
# 1. every JSON file parses
# ------------------------------------------------------------------
def check_json_parses() -> dict[Path, object]:
    parsed = {}
    for path in sorted((ROOT / "packs").rglob("*.json")):
        data = load_json(path)
        if data is not None:
            parsed[path] = data
        check(data is not None, f"{rel(path)}: does not parse")
    return parsed


# ------------------------------------------------------------------
# 2. manifests
# ------------------------------------------------------------------
def check_manifests():
    bp = load_json(BP / "manifest.json")
    rp = load_json(RP / "manifest.json")
    if not bp or not rp:
        return

    uuids = []
    for name, manifest in (("BP", bp), ("RP", rp)):
        header = manifest.get("header", {})
        uuids.append(header.get("uuid"))
        check(header.get("name") == "pack.name",
              f"{name} manifest: header.name should be the 'pack.name' key so the pack list is translated")
        check(header.get("description") == "pack.description",
              f"{name} manifest: header.description should be the 'pack.description' key")
        check(isinstance(header.get("version"), list) and len(header["version"]) == 3,
              f"{name} manifest: header.version must be [major, minor, patch]")
        # 1.21.50 is the floor for minecraft:block_placer standing in for
        # minecraft:icon, which is how the light twins get a real block icon.
        check(header.get("min_engine_version") == [1, 21, 50],
              f"{name} manifest: min_engine_version must stay [1, 21, 50] - the "
              f"items rely on format_version 1.21.50")

        authors = manifest.get("metadata", {}).get("authors", [])
        check("LBR" in authors,
              f"{name} manifest: metadata.authors must credit LBR")

        for module in manifest.get("modules", []):
            uuids.append(module.get("uuid"))
            check(module.get("version") == header.get("version"),
                  f"{name} manifest: module {module.get('type')} version differs from the header version")

    check(len(set(uuids)) == len(uuids), f"duplicate UUID across the two manifests: {uuids}")

    deps = bp.get("dependencies", [])
    rp_uuid = rp["header"]["uuid"]
    linked = [d for d in deps if d.get("uuid") == rp_uuid]
    check(len(linked) == 1, "BP manifest: it must depend on the resource pack UUID exactly once")
    if linked:
        check(linked[0].get("version") == rp["header"]["version"],
              "BP manifest: the resource-pack dependency version does not match the RP header version")

    api = [d for d in deps if d.get("module_name") == "@minecraft/server"]
    check(len(api) == 1, "BP manifest: exactly one @minecraft/server dependency is required")

    script_modules = [m for m in bp.get("modules", []) if m.get("type") == "script"]
    check(len(script_modules) == 1, "BP manifest: exactly one script module is required")
    if script_modules:
        entry = BP / script_modules[0].get("entry", "")
        check(entry.exists(), f"BP manifest: script entry point {script_modules[0].get('entry')} does not exist")


# ------------------------------------------------------------------
# 3. items <-> textures <-> attachables <-> lang
# ------------------------------------------------------------------
def parse_lang(path: Path) -> dict[str, str]:
    out = {}
    if not path.exists():
        errors.append(f"missing language file {rel(path)}")
        return out
    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            errors.append(f"{rel(path)}:{lineno}: not a key=value line")
            continue
        key, value = line.split("=", 1)
        if key in out:
            errors.append(f"{rel(path)}:{lineno}: duplicate key {key}")
        out[key] = value
    return out


def check_items_and_textures():
    atlas = load_json(RP / "textures" / "item_texture.json") or {}
    texture_data = atlas.get("texture_data", {})

    langs = {code: parse_lang(RP / "texts" / f"{code}.lang") for code in ("en_US", "fr_FR")}

    # v4.1 removed every attachable. They drew a flat quad at one hard-coded
    # pose, which put an off-hand item on the left arm at the main-hand angle.
    # A leftover file would still win over the engine's own renderer, so the
    # bug would come back silently - hence a check rather than a comment.
    stale = sorted((RP / "attachables").glob("*.json")) if (RP / "attachables").is_dir() else []
    check(not stale,
          "attachables must not come back: they override the engine renderer and "
          "reintroduce the off-hand pose bug (" + ", ".join(rel(p) for p in stale) + ")")
    for leftover, why in (
        ("models/entity/psu_item.geo.json", "the flat held-item quad"),
        ("animations/psu_item.animation.json", "the hard-coded hold poses"),
        ("render_controllers/psu_item.render_controllers.json", "the attachable render controller"),
    ):
        check(not (RP / leftover).exists(),
              f"{leftover} is dead weight now ({why} went with the attachables)")

    for path in sorted((BP / "items").glob("*.json")):
        data = load_json(path)
        if not data:
            continue
        item = data.get("minecraft:item", {})
        identifier = item.get("description", {}).get("identifier", "")
        components = item.get("components", {})

        check(identifier.startswith("psu:"), f"{rel(path)}: identifier must live in the psu: namespace")

        icon = components.get("minecraft:icon")
        if icon is not None:
            alias = icon.get("texture")
            check(alias in texture_data,
                  f"{rel(path)}: icon alias '{alias}' is missing from item_texture.json "
                  f"(pink chequerboard)")
        else:
            # No icon is only legal when block_placer can supply one instead.
            check("minecraft:block_placer" in components,
                  f"{rel(path)}: an item with neither minecraft:icon nor "
                  f"minecraft:block_placer has no way to draw itself")
            check(format_at_least(data.get("format_version", ""), (1, 21, 50)),
                  f"{rel(path)}: block_placer only stands in for minecraft:icon from "
                  f"format_version 1.21.50 on, found '{data.get('format_version')}'")

        expected_key = "item." + identifier.replace(":", ".") + ".name"
        actual_key = components.get("minecraft:display_name", {}).get("value")
        check(actual_key == expected_key,
              f"{rel(path)}: display_name should be '{expected_key}', found '{actual_key}'")

        for code, table in langs.items():
            check(expected_key in table,
                  f"{code}.lang: missing translation for {expected_key}")

        placer = components.get("minecraft:block_placer")
        if placer:
            check(components.get("minecraft:allow_off_hand") is True,
                  f"{rel(path)}: a light twin must carry minecraft:allow_off_hand")
            check("minecraft:icon" not in components,
                  f"{rel(path)}: drop minecraft:icon - it flattens the block to a 2D "
                  f"sprite in the inventory; block_placer draws the real block icon")

    # Texture files owned by the pack must actually exist.
    for alias, entry in texture_data.items():
        texture = entry.get("textures", "")
        if not texture.startswith("textures/items/psu_"):
            continue   # vanilla path, resolved by the game
        check((RP / f"{texture}.png").exists(),
              f"item_texture.json: '{alias}' points at {texture}.png which is not in the pack")

    return langs


def format_at_least(value: str, minimum: tuple[int, int, int]) -> bool:
    """True when a "1.21.50"-style format_version is >= minimum."""
    try:
        parts = [int(p) for p in str(value).split(".")]
    except ValueError:
        return False
    parts = (parts + [0, 0, 0])[:3]
    return tuple(parts) >= minimum


# ------------------------------------------------------------------
# 4. the light-source table, the script and the packs agree
# ------------------------------------------------------------------
def check_light_table():
    table = load_json(TABLE)
    if not table:
        return
    twins = table["twins"]

    source = (BP / "scripts" / "lightmap.js").read_text(encoding="utf-8")
    pairs = dict(re.findall(r'"(minecraft:[a-z_]+)"\s*:\s*"(psu:[a-z_]+)"', source))

    check(len(pairs) == len(twins),
          f"lightmap.js declares {len(pairs)} twins, assets/light_sources.json declares {len(twins)}")

    for twin in twins:
        name = twin["name"]
        item_id = f"psu:{name}"
        check(pairs.get(twin["vanilla_item"]) == item_id,
              f"lightmap.js: {twin['vanilla_item']} should map to {item_id}")
        check((BP / "items" / f"psu_{name}.json").exists(),
              f"missing behaviour item for {item_id}")

    # The vanilla flipbooks (sea lantern, magma) must NOT be redeclared any
    # more. v4.0 aliased them onto custom atlas tiles to feed minecraft:icon;
    # now that the twins have no icon, the block's own animated icon is used,
    # and a leftover declaration would only be a second source of truth.
    flipbooks = load_json(RP / "textures" / "flipbook_textures.json") or []
    tiles = {f.get("atlas_tile") for f in flipbooks}
    for twin in twins:
        check(f"psu_{twin['name']}" not in tiles,
              f"flipbook_textures.json: psu_{twin['name']} no longer needs a flipbook - "
              f"the block icon animates by itself now")

    sheet = RP / "textures" / "items" / "psu_axe_anim.png"
    check(sheet.exists(), "the animated axe sheet is missing")
    if sheet.exists():
        header = sheet.read_bytes()[16:24]
        width = int.from_bytes(header[0:4], "big")
        height = int.from_bytes(header[4:8], "big")
        check(width == 16, f"psu_axe_anim.png must be 16 px wide, it is {width}")
        check(height % 16 == 0 and height > 16,
              f"psu_axe_anim.png must be a vertical strip of 16x16 frames, it is {width}x{height}")


# ------------------------------------------------------------------
# 5. recipes point at items that exist
# ------------------------------------------------------------------
def check_recipes():
    known = set()
    for path in (BP / "items").glob("*.json"):
        data = load_json(path)
        if data:
            known.add(data["minecraft:item"]["description"]["identifier"])

    seen_ids = set()
    for path in sorted((BP / "recipes").glob("*.json")):
        data = load_json(path)
        if not data:
            continue
        root = next((k for k in data if k.startswith("minecraft:recipe")), None)
        if not check(root is not None, f"{rel(path)}: no minecraft:recipe_* block"):
            continue

        body = data[root]
        identifier = body.get("description", {}).get("identifier")
        check(identifier is not None, f"{rel(path)}: recipe has no identifier")
        check(identifier not in seen_ids, f"{rel(path)}: duplicate recipe identifier {identifier}")
        seen_ids.add(identifier)

        referenced = []
        if root == "minecraft:recipe_furnace":
            referenced += [body.get("input"), body.get("output")]
        else:
            for entry in (body.get("key") or {}).values():
                referenced.append(entry.get("item") if isinstance(entry, dict) else entry)
            for entry in body.get("ingredients", []):
                referenced.append(entry.get("item") if isinstance(entry, dict) else entry)
            result = body.get("result")
            if isinstance(result, dict):
                referenced.append(result.get("item"))

        for item in referenced:
            if isinstance(item, str) and item.startswith("psu:"):
                check(item in known, f"{rel(path)}: references unknown item {item}")

        if root != "minecraft:recipe_furnace":
            pattern = body.get("pattern", [])
            keys = set(body.get("key", {}))
            for row in pattern:
                for ch in row:
                    if ch != " ":
                        check(ch in keys, f"{rel(path)}: pattern uses '{ch}' but the key does not define it")
            check(len({len(r) for r in pattern}) <= 1,
                  f"{rel(path)}: every pattern row must have the same length")


# ------------------------------------------------------------------
# 6. the two languages stay in sync, and cover the script keys
# ------------------------------------------------------------------
def check_translations(langs):
    en = set(langs.get("en_US", {}))
    fr = set(langs.get("fr_FR", {}))

    for key in sorted(en - fr):
        errors.append(f"fr_FR.lang: missing key {key}")
    for key in sorted(fr - en):
        errors.append(f"en_US.lang: missing key {key}")

    used = set()
    for path in (BP / "scripts").glob("*.js"):
        used |= set(re.findall(r'"(psu\.[a-z0-9_.]+)"', path.read_text(encoding="utf-8")))

    for key in sorted(used):
        check(key in en, f"en_US.lang: script uses '{key}' but it is not translated")
        check(key in fr, f"fr_FR.lang: script uses '{key}' but it is not translated")

    for code, table in langs.items():
        for key, value in table.items():
            if not key.startswith("psu."):
                continue
            other = langs["fr_FR" if code == "en_US" else "en_US"].get(key, "")
            check(value.count("%s") == other.count("%s"),
                  f"{key}: '%s' placeholder count differs between en_US and fr_FR")

    # Every pack needs both languages declared.
    for pack in (BP, RP):
        listing = load_json(pack / "texts" / "languages.json")
        check(listing == ["en_US", "fr_FR"],
              f"{rel(pack)}/texts/languages.json must list exactly en_US and fr_FR")
        for code in ("en_US", "fr_FR"):
            path = pack / "texts" / f"{code}.lang"
            check(path.exists(), f"missing {rel(path)}")
            if path.exists():
                table = parse_lang(path)
                check("pack.name" in table, f"{rel(path)}: pack.name is required")
                check("pack.description" in table, f"{rel(path)}: pack.description is required")


# ------------------------------------------------------------------
# 7. the script module graph resolves
# ------------------------------------------------------------------
def check_script_imports():
    script_dir = BP / "scripts"
    files = {p.name for p in script_dir.glob("*.js")}
    reachable = set()

    def walk(name):
        if name in reachable or name not in files:
            return
        reachable.add(name)
        source = (script_dir / name).read_text(encoding="utf-8")
        for target in re.findall(r'from\s+"\./([A-Za-z0-9_.]+)"', source):
            check(target in files, f"{name}: imports ./{target} which does not exist")
            walk(target)

    check("main.js" in files, "scripts/main.js is missing")
    walk("main.js")

    for name in sorted(files - reachable):
        warnings.append(f"scripts/{name} is never imported from main.js")

    for path in sorted(script_dir.glob("*.js")):
        source = path.read_text(encoding="utf-8")
        for module in re.findall(r'from\s+"(@minecraft/[a-z-]+)"', source):
            check(module == "@minecraft/server",
                  f"{path.name}: imports {module}, which the manifest does not declare")
        check("console.log(" not in source,
              f"{path.name}: use console.warn, console.log is stripped in release builds")


# ------------------------------------------------------------------
# 8. the loot-label entity exists on both sides
# ------------------------------------------------------------------
def check_entities():
    bp_entity = load_json(BP / "entities" / "loot_label.json")
    rp_entity = load_json(RP / "entity" / "loot_label.entity.json")

    bp_id = (bp_entity or {}).get("minecraft:entity", {}).get("description", {}).get("identifier")
    rp_id = (rp_entity or {}).get("minecraft:client_entity", {}).get("description", {}).get("identifier")

    check(bp_id == "psu:loot_label", "behaviour pack: psu:loot_label entity is missing")
    check(rp_id == "psu:loot_label",
          "resource pack: psu:loot_label client entity is missing - without it the client draws nothing")

    if rp_entity:
        desc = rp_entity["minecraft:client_entity"]["description"]
        texture = desc.get("textures", {}).get("default", "")
        check((RP / f"{texture}.png").exists(),
              f"resource pack: loot label texture {texture}.png is missing")
        geometry = desc.get("geometry", {}).get("default")
        models = load_json(RP / "models" / "entity" / "psu_empty.geo.json") or {}
        ids = {g["description"]["identifier"] for g in models.get("minecraft:geometry", [])}
        check(geometry in ids, f"resource pack: geometry {geometry} is not defined")


def main() -> int:
    check_json_parses()
    check_manifests()
    langs = check_items_and_textures()
    check_light_table()
    check_recipes()
    check_translations(langs)
    check_script_imports()
    check_entities()

    for message in warnings:
        print(f"  warning  {message}")
    for message in errors:
        print(f"  ERROR    {message}")

    print()
    if errors:
        print(f"FAILED - {len(errors)} error(s) out of {checks} checks"
              f"{f', {len(warnings)} warning(s)' if warnings else ''}")
        return 1

    print(f"OK - {checks} checks passed"
          f"{f', {len(warnings)} warning(s)' if warnings else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
