#!/usr/bin/env python3
"""Package the two packs into a single installable .mcaddon.

Runs tools/validate.py first and refuses to build if anything fails, so a
broken pack never reaches a player's device.

Run:  python3 tools/build.py [--skip-checks]
Output: dist/Pack_Survie_Ultime_v<version>.mcaddon
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


def version_string() -> str:
    manifest = json.loads((PACKS / "PSU_BP" / "manifest.json").read_text(encoding="utf-8"))
    return ".".join(str(n) for n in manifest["header"]["version"])


def should_skip(path: Path) -> bool:
    if any(part in EXCLUDE_NAMES for part in path.parts):
        return True
    return path.suffix.lower() in EXCLUDE_SUFFIXES


def run_checks() -> bool:
    ok = True
    for command in (
        [sys.executable, str(ROOT / "tools" / "validate.py")],
        ["node", str(ROOT / "tools" / "test_scripts.mjs")]
    ):
        print(f"$ {' '.join(Path(c).name if '/' in c else c for c in command)}")
        result = subprocess.run(command, cwd=ROOT)
        if result.returncode != 0:
            ok = False
    return ok


def main() -> int:
    skip = "--skip-checks" in sys.argv

    if not skip and not run_checks():
        print("\nbuild aborted: fix the failures above (or pass --skip-checks)")
        return 1

    version = version_string()
    DIST.mkdir(exist_ok=True)
    target = DIST / f"Pack_Survie_Ultime_v{version}.mcaddon"

    files = 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for pack in sorted(p for p in PACKS.iterdir() if p.is_dir()):
            for path in sorted(pack.rglob("*")):
                if not path.is_file():
                    continue
                arcname = path.relative_to(PACKS)
                if should_skip(arcname):
                    continue
                archive.write(path, str(arcname))
                files += 1

    size_kb = target.stat().st_size / 1024
    print(f"\nbuilt {target.relative_to(ROOT)}  ({files} files, {size_kb:.0f} KiB)")
    print("install: open the file on the device, or drop it into "
          "com.mojang/behavior_packs + resource_packs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
