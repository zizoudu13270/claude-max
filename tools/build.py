#!/usr/bin/env python3
"""Package every add-on declared in addons.json into a .mcaddon.

Syncs shared/scripts, then runs the validator and the script tests, and
refuses to build if anything fails - a broken pack never reaches a
player's device.

Run:  python3 tools/build.py [--skip-checks] [<addon-id> ...]
Output: dist/<artifact>_v<version>.mcaddon
"""
from __future__ import annotations

import json
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKS = ROOT / "packs"
DIST = ROOT / "dist"

# Never ship these, whatever ends up in the working tree.
EXCLUDE_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini", "node_modules", "__pycache__"}
EXCLUDE_SUFFIXES = {".md", ".bak", ".orig", ".rej", ".pyc", ".log"}


def registry() -> list[dict]:
    data = json.loads((ROOT / "addons.json").read_text(encoding="utf-8"))
    # Add-ons that declare their own pipeline are built by it, not here.
    return [a for a in data["addons"] if not a.get("pipeline")]


def version_string(behaviour: str) -> str:
    manifest = json.loads((PACKS / behaviour / "manifest.json").read_text(encoding="utf-8"))
    return ".".join(str(n) for n in manifest["header"]["version"])


def should_skip(path: Path) -> bool:
    if any(part in EXCLUDE_NAMES for part in path.parts):
        return True
    return path.suffix.lower() in EXCLUDE_SUFFIXES


def run_checks() -> bool:
    ok = True
    for command in (
        [sys.executable, str(ROOT / "tools" / "sync_shared.py")],
        [sys.executable, str(ROOT / "tools" / "validate.py")],
        ["node", str(ROOT / "tools" / "test_scripts.mjs")]
    ):
        print(f"$ {' '.join(Path(c).name if '/' in c else c for c in command)}")
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode != 0:
            ok = False
    return ok


def package(addon: dict) -> Path:
    version = version_string(addon["behaviour"])
    target = DIST / f"{addon['artifact']}_v{version}.mcaddon"

    files = 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for pack in (addon["behaviour"], addon["resources"]):
            root = PACKS / pack
            for path in sorted(root.rglob("*")):
                if not path.is_file():
                    continue
                arcname = path.relative_to(PACKS)
                if should_skip(arcname):
                    continue
                archive.write(path, str(arcname))
                files += 1

    size_kb = target.stat().st_size / 1024
    print(f"  {addon['id']:<20} -> {target.relative_to(ROOT)}  ({files} files, {size_kb:.0f} KiB)")
    return target


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    skip = "--skip-checks" in sys.argv

    addons = registry()
    if args:
        wanted = set(args)
        addons = [a for a in addons if a["id"] in wanted]
        missing = wanted - {a["id"] for a in addons}
        if missing:
            print(f"unknown add-on(s): {', '.join(sorted(missing))}")
            return 1

    if not skip and not run_checks():
        print("\nbuild aborted: fix the failures above (or pass --skip-checks)")
        return 1

    DIST.mkdir(exist_ok=True)
    print()
    for addon in addons:
        package(addon)

    print("\ninstall: open the file on the device, or drop the two folders into "
          "com.mojang/behavior_packs + resource_packs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
