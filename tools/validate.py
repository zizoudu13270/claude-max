#!/usr/bin/env python3
"""Structural test suite for every add-on in this repository.

Minecraft fails silently: a typo in a texture alias gives you a pink
chequerboard, a missing lang key prints the raw key, a mismatched UUID
makes the pack refuse to load with no explanation at all. This script
catches that before a .mcaddon is built.

Add-ons and the checks that apply to them are declared in addons.json.

Run:  python3 tools/validate.py
Exit code 0 = every check passed.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "packs"
SHARED = ROOT / "shared" / "scripts"
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


def load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        errors.append(f"{path.relative_to(ROOT)}: invalid JSON - {exc}")
        return None


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def parse_lang(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
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


# ==================================================================
#  Repository-wide checks
# ==================================================================
def check_json_parses():
    for path in sorted(PACKS.rglob("*.json")):
        check(load_json(path) is not None, f"{rel(path)}: does not parse")


def check_shared_in_sync(addons):
    """A behaviour pack must carry a byte-identical copy of shared/scripts."""
    shared = sorted(SHARED.glob("*.js"))
    check(len(shared) > 0, "shared/scripts is empty")

    for addon in addons:
        if not addon.get("sharedScripts"):
            continue
        scripts = PACKS / addon["behaviour"] / "scripts"
        for source in shared:
            target = scripts / source.name
            if not check(target.exists(),
                         f"{addon['id']}: shared module {source.name} was never synced"):
                continue
            check(target.read_bytes() == source.read_bytes(),
                  f"{addon['id']}: scripts/{source.name} has drifted from shared/ "
                  f"- run python3 tools/sync_shared.py")


def check_uuids_globally(addons):
    seen: dict[str, str] = {}
    for addon in addons:
        for pack in (addon["behaviour"], addon["resources"]):
            manifest = load_json(PACKS / pack / "manifest.json")
            if not manifest:
                continue
            ids = [manifest["header"]["uuid"]] + [m["uuid"] for m in manifest.get("modules", [])]
            for uuid in ids:
                check(uuid not in seen,
                      f"UUID {uuid} is used by both {seen.get(uuid)} and {pack}")
                seen[uuid] = pack


# ==================================================================
#  Per-add-on checks
# ==================================================================
def check_manifests(addon):
    bp_dir = PACKS / addon["behaviour"]
    rp_dir = PACKS / addon["resources"]
    bp = load_json(bp_dir / "manifest.json")
    rp = load_json(rp_dir / "manifest.json")
    if not bp or not rp:
        return

    for name, manifest in ((addon["behaviour"], bp), (addon["resources"], rp)):
        header = manifest.get("header", {})
        check(header.get("name") == "pack.name",
              f"{name}: header.name must be the 'pack.name' key so the pack list is translated")
        check(header.get("description") == "pack.description",
              f"{name}: header.description must be the 'pack.description' key")
        check(isinstance(header.get("version"), list) and len(header["version"]) == 3,
              f"{name}: header.version must be [major, minor, patch]")
        check(header.get("min_engine_version") == [1, 21, 0],
              f"{name}: min_engine_version must stay [1, 21, 0]")
        for module in manifest.get("modules", []):
            check(module.get("version") == header.get("version"),
                  f"{name}: module {module.get('type')} version differs from the header version")

    # Every pack needs an icon: a pack with none shows up blank in the
    # pack list, and nothing in the game says why.
    for pack in (addon["behaviour"], addon["resources"]):
        icon = PACKS / pack / "pack_icon.png"
        if check(icon.exists(), f"{pack}: pack_icon.png is missing"):
            header = icon.read_bytes()[:24]
            check(header[1:4] == b"PNG", f"{pack}: pack_icon.png is not a PNG")
            width = int.from_bytes(header[16:20], "big")
            height = int.from_bytes(header[20:24], "big")
            check(width == height, f"{pack}: pack_icon.png must be square, it is {width}x{height}")
            check(width >= 64, f"{pack}: pack_icon.png is only {width}px, use at least 64")

    deps = bp.get("dependencies", [])
    linked = [d for d in deps if d.get("uuid") == rp["header"]["uuid"]]
    check(len(linked) == 1,
          f"{addon['id']}: the behaviour pack must depend on its resource pack exactly once")
    if linked:
        check(linked[0].get("version") == rp["header"]["version"],
              f"{addon['id']}: the resource-pack dependency version does not match the RP header")

    api = [d for d in deps if d.get("module_name") == "@minecraft/server"]
    check(len(api) == 1, f"{addon['id']}: exactly one @minecraft/server dependency is required")

    scripts = [m for m in bp.get("modules", []) if m.get("type") == "script"]
    check(len(scripts) == 1, f"{addon['id']}: exactly one script module is required")
    if scripts:
        check((bp_dir / scripts[0].get("entry", "")).exists(),
              f"{addon['id']}: script entry {scripts[0].get('entry')} does not exist")


def check_namespace(addon):
    """config.js must declare the namespace addons.json says it has."""
    config = (PACKS / addon["behaviour"] / "scripts" / "config.js").read_text(encoding="utf-8")
    match = re.search(r'namespace:\s*"([a-z0-9_]+)"', config)
    if not check(match, f"{addon['id']}: config.js declares no namespace"):
        return
    check(match.group(1) == addon["namespace"],
          f"{addon['id']}: config.js says namespace '{match.group(1)}', "
          f"addons.json says '{addon['namespace']}'")


def check_translations(addon, langs):
    ns = addon["namespace"]
    en = set(langs["en_US"])
    fr = set(langs["fr_FR"])

    for key in sorted(en - fr):
        errors.append(f"{addon['id']} fr_FR.lang: missing key {key}")
    for key in sorted(fr - en):
        errors.append(f"{addon['id']} en_US.lang: missing key {key}")

    # Keys are written without their namespace in the code: t("load.title").
    used = set()
    for path in (PACKS / addon["behaviour"] / "scripts").glob("*.js"):
        source = path.read_text(encoding="utf-8")
        used |= set(re.findall(r'\bt\(\s*"([a-z][a-z0-9_.]*)"', source))
        used |= set(re.findall(r'\b(?:tell|bar)\([^,]+,\s*"([a-z][a-z0-9_.]*)"', source))

    for key in sorted(used):
        full = f"{ns}.{key}"
        check(full in en, f"{addon['id']} en_US.lang: script uses '{full}' but it is not translated")
        check(full in fr, f"{addon['id']} fr_FR.lang: script uses '{full}' but it is not translated")

    for key, value in langs["en_US"].items():
        if not key.startswith(ns + "."):
            continue
        check(value.count("%s") == langs["fr_FR"].get(key, "").count("%s"),
              f"{addon['id']} {key}: '%s' placeholder count differs between en_US and fr_FR")

    for pack in (addon["behaviour"], addon["resources"]):
        listing = load_json(PACKS / pack / "texts" / "languages.json")
        check(listing == ["en_US", "fr_FR"],
              f"{pack}/texts/languages.json must list exactly en_US and fr_FR")
        for code in ("en_US", "fr_FR"):
            table = parse_lang(PACKS / pack / "texts" / f"{code}.lang")
            check("pack.name" in table, f"{pack}/texts/{code}.lang: pack.name is required")
            check("pack.description" in table,
                  f"{pack}/texts/{code}.lang: pack.description is required")


def check_script_imports(addon):
    script_dir = PACKS / addon["behaviour"] / "scripts"
    files = {p.name for p in script_dir.glob("*.js")}
    reachable: set[str] = set()

    def walk(name):
        if name in reachable or name not in files:
            return
        reachable.add(name)
        source = (script_dir / name).read_text(encoding="utf-8")
        for target in re.findall(r'from\s+"\./([A-Za-z0-9_.]+)"', source):
            check(target in files, f"{addon['id']}/{name}: imports ./{target} which does not exist")
            walk(target)

    check("main.js" in files, f"{addon['id']}: scripts/main.js is missing")
    walk("main.js")

    for name in sorted(files - reachable):
        warnings.append(f"{addon['id']}: scripts/{name} is never imported from main.js")

    for path in sorted(script_dir.glob("*.js")):
        source = path.read_text(encoding="utf-8")
        for module in re.findall(r'from\s+"(@minecraft/[a-z-]+)"', source):
            check(module == "@minecraft/server",
                  f"{addon['id']}/{path.name}: imports {module}, which the manifest does not declare")
        check("console.log(" not in source,
              f"{addon['id']}/{path.name}: use console.warn, console.log is stripped in release builds")


def check_entities(addon):
    ns = addon["namespace"]
    bp_entity = load_json(PACKS / addon["behaviour"] / "entities" / "loot_label.json")
    rp_entity = load_json(PACKS / addon["resources"] / "entity" / "loot_label.entity.json")

    bp_id = (bp_entity or {}).get("minecraft:entity", {}).get("description", {}).get("identifier")
    client = (rp_entity or {}).get("minecraft:client_entity", {}).get("description", {})

    check(bp_id == f"{ns}:loot_label", f"{addon['id']}: behaviour entity {ns}:loot_label is missing")
    check(client.get("identifier") == f"{ns}:loot_label",
          f"{addon['id']}: client entity {ns}:loot_label is missing - "
          f"without it the client draws nothing at all")

    if not client:
        return

    rp_dir = PACKS / addon["resources"]
    texture = client.get("textures", {}).get("default", "")
    check((rp_dir / f"{texture}.png").exists(),
          f"{addon['id']}: loot label texture {texture}.png is missing")

    geometry = client.get("geometry", {}).get("default")
    declared = set()
    for path in (rp_dir / "models" / "entity").glob("*.geo.json"):
        model = load_json(path) or {}
        declared |= {g["description"]["identifier"] for g in model.get("minecraft:geometry", [])}
    check(geometry in declared, f"{addon['id']}: geometry {geometry} is not defined")

    controllers = client.get("render_controllers", [])
    available = set()
    for path in (rp_dir / "render_controllers").glob("*.json"):
        available |= set((load_json(path) or {}).get("render_controllers", {}))
    for controller in controllers:
        check(controller in available,
              f"{addon['id']}: render controller {controller} is not defined")

    # The entity id the scripts spawn has to be the one that exists.
    config = (PACKS / addon["behaviour"] / "scripts" / "config.js").read_text(encoding="utf-8")
    match = re.search(r'entityId:\s*"([^"]+)"', config)
    if match:
        check(match.group(1) == f"{ns}:loot_label",
              f"{addon['id']}: config.labels.entityId is {match.group(1)}, expected {ns}:loot_label")


def check_items(addon, langs):
    bp_dir = PACKS / addon["behaviour"]
    rp_dir = PACKS / addon["resources"]
    atlas = load_json(rp_dir / "textures" / "item_texture.json") or {}
    texture_data = atlas.get("texture_data", {})
    attachable_ids = set()

    for path in sorted((rp_dir / "attachables").glob("*.json")):
        data = load_json(path)
        if not data:
            continue
        desc = data.get("minecraft:attachable", {}).get("description", {})
        attachable_ids.add(desc.get("identifier"))
        check(desc.get("geometry", {}).get("default") == "geometry.psu_item",
              f"{rel(path)}: geometry must be geometry.psu_item")
        check(desc.get("render_controllers") == ["controller.render.psu_item"],
              f"{rel(path)}: unexpected render controller")
        check(desc.get("textures", {}).get("default", "").startswith("textures/"),
              f"{rel(path)}: the default texture must be a full path, not an atlas alias")

    for path in sorted((bp_dir / "items").glob("*.json")):
        data = load_json(path)
        if not data:
            continue
        item = data.get("minecraft:item", {})
        identifier = item.get("description", {}).get("identifier", "")
        components = item.get("components", {})

        check(identifier.startswith(addon["namespace"] + ":"),
              f"{rel(path)}: identifier must live in the {addon['namespace']}: namespace")

        alias = components.get("minecraft:icon", {}).get("texture")
        check(alias in texture_data,
              f"{rel(path)}: icon alias '{alias}' is missing from item_texture.json (pink chequerboard)")

        expected = "item." + identifier.replace(":", ".") + ".name"
        check(components.get("minecraft:display_name", {}).get("value") == expected,
              f"{rel(path)}: display_name should be '{expected}'")
        for code, table in langs.items():
            check(expected in table, f"{addon['id']} {code}.lang: missing translation for {expected}")

        if components.get("minecraft:block_placer"):
            check(components.get("minecraft:allow_off_hand") is True,
                  f"{rel(path)}: a light twin must carry minecraft:allow_off_hand")

    for alias, entry in texture_data.items():
        texture = entry.get("textures", "")
        if not texture.startswith("textures/items/psu_"):
            continue
        check((rp_dir / f"{texture}.png").exists(),
              f"item_texture.json: '{alias}' points at {texture}.png which is not in the pack")

    return attachable_ids


def check_light_twins(addon, attachable_ids):
    bp_dir = PACKS / addon["behaviour"]
    rp_dir = PACKS / addon["resources"]
    table = load_json(TABLE)
    if not table:
        return
    twins = table["twins"]

    source = (bp_dir / "scripts" / "lightmap.js").read_text(encoding="utf-8")
    pairs = dict(re.findall(r'"(minecraft:[a-z_]+)"\s*:\s*"(psu:[a-z_]+)"', source))
    check(len(pairs) == len(twins),
          f"lightmap.js declares {len(pairs)} twins, assets/light_sources.json declares {len(twins)}")

    for twin in twins:
        name = twin["name"]
        item_id = f"psu:{name}"
        check(pairs.get(twin["vanilla_item"]) == item_id,
              f"lightmap.js: {twin['vanilla_item']} should map to {item_id}")
        check((bp_dir / "items" / f"psu_{name}.json").exists(),
              f"missing behaviour item for {item_id}")

        attachable = rp_dir / "attachables" / f"psu_{name}.attachable.json"
        if twin.get("animated"):
            check(not attachable.exists(),
                  f"{name} uses an animated vanilla texture: it must NOT have an attachable "
                  f"(a flat quad cannot play a flipbook)")
        else:
            check(item_id in attachable_ids, f"missing attachable for {item_id}")

    flipbooks = load_json(rp_dir / "textures" / "flipbook_textures.json") or []
    tiles = {f.get("atlas_tile") for f in flipbooks}
    for twin in twins:
        if twin.get("animated"):
            check(f"psu_{twin['name']}" in tiles,
                  f"flipbook_textures.json: psu_{twin['name']} needs a flipbook declaration")

    # The dynamic-light list must cover every twin, or a torch in the
    # off-hand would stop glowing.
    lights = (bp_dir / "scripts" / "lightsources.js").read_text(encoding="utf-8")
    check("TO_CUSTOM" in lights,
          "lightsources.js should derive the twin ids from lightmap.js, not repeat them")


def check_flipbook(addon):
    rp_dir = PACKS / addon["resources"]
    sheet = rp_dir / "textures" / "items" / "psu_axe_anim.png"
    if not check(sheet.exists(), "the animated axe sheet is missing"):
        return
    header = sheet.read_bytes()[16:24]
    width = int.from_bytes(header[0:4], "big")
    height = int.from_bytes(header[4:8], "big")
    check(width == 16, f"psu_axe_anim.png must be 16 px wide, it is {width}")
    check(height % 16 == 0 and height > 16,
          f"psu_axe_anim.png must be a vertical strip of 16x16 frames, it is {width}x{height}")


def check_recipes(addon):
    bp_dir = PACKS / addon["behaviour"]
    ns = addon["namespace"]

    known = set()
    for path in (bp_dir / "items").glob("*.json"):
        data = load_json(path)
        if data:
            known.add(data["minecraft:item"]["description"]["identifier"])

    seen = set()
    for path in sorted((bp_dir / "recipes").glob("*.json")):
        data = load_json(path)
        if not data:
            continue
        root = next((k for k in data if k.startswith("minecraft:recipe")), None)
        if not check(root is not None, f"{rel(path)}: no minecraft:recipe_* block"):
            continue

        body = data[root]
        identifier = body.get("description", {}).get("identifier")
        check(identifier is not None, f"{rel(path)}: recipe has no identifier")
        check(identifier not in seen, f"{rel(path)}: duplicate recipe identifier {identifier}")
        seen.add(identifier)

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
            if isinstance(item, str) and item.startswith(ns + ":"):
                check(item in known, f"{rel(path)}: references unknown item {item}")

        if root != "minecraft:recipe_furnace":
            pattern = body.get("pattern", [])
            keys = set(body.get("key", {}))
            for row in pattern:
                for ch in row:
                    if ch != " ":
                        check(ch in keys,
                              f"{rel(path)}: pattern uses '{ch}' but the key does not define it")
            check(len({len(r) for r in pattern}) <= 1,
                  f"{rel(path)}: every pattern row must have the same length")


def main() -> int:
    registry = load_json(ROOT / "addons.json")
    if not registry:
        return 1
    # Add-ons that declare their own pipeline are validated by it, not here.
    addons = [a for a in registry["addons"] if not a.get("pipeline")]

    check_json_parses()
    check_shared_in_sync(addons)
    check_uuids_globally(addons)

    for addon in addons:
        features = set(addon.get("features", []))
        langs = {
            code: parse_lang(PACKS / addon["resources"] / "texts" / f"{code}.lang")
            for code in ("en_US", "fr_FR")
        }

        check_manifests(addon)
        check_namespace(addon)
        check_translations(addon, langs)
        check_script_imports(addon)
        check_entities(addon)

        attachable_ids = check_items(addon, langs) if "items" in features else set()
        if "lightTwins" in features:
            check_light_twins(addon, attachable_ids)
        if "flipbook" in features:
            check_flipbook(addon)
        if "recipes" in features:
            check_recipes(addon)

    for message in warnings:
        print(f"  warning  {message}")
    for message in errors:
        print(f"  ERROR    {message}")

    print()
    if errors:
        print(f"FAILED - {len(errors)} error(s) out of {checks} checks"
              f"{f', {len(warnings)} warning(s)' if warnings else ''}")
        return 1

    print(f"OK - {checks} checks passed across {len(addons)} add-on(s)"
          f"{f', {len(warnings)} warning(s)' if warnings else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
