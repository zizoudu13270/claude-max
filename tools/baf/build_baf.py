#!/usr/bin/env python3
"""Package Better Animation & Feature into a .mcaddon.

Refuses to build unless the validator passes and the round-trip check (when an
original extraction is available) confirms the refactor is a pure rename - a
pack that fails either of those has no business reaching a player's device.

Run:  python3 tools/baf/build_baf.py [--original <1.0.2 extraction dir>] [--skip-checks]
Output: dist/Better_Animation_Feature_Clean.mcaddon
        dist/Better_Animation_Feature_v<version>.mcaddon
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import BP, PACKS, ROOT, RP, load, rel

DIST = ROOT / "dist"
HERE = Path(__file__).resolve().parent

# Development-only files never ship inside the add-on.
EXCLUDE_NAMES = {".DS_Store", "Thumbs.db", "desktop.ini", "__pycache__", "node_modules"}
EXCLUDE_SUFFIXES = {".md", ".bak", ".orig", ".rej", ".pyc", ".log"}


def skip(path: Path) -> bool:
    return (any(part in EXCLUDE_NAMES for part in path.parts)
            or path.suffix.lower() in EXCLUDE_SUFFIXES)


def run_checks(original: Path | None) -> bool:
    commands = [[sys.executable, str(HERE / "validate_baf.py")]]
    if original:
        commands.append([sys.executable, str(HERE / "verify_roundtrip.py"), str(original)])
    ok = True
    for command in commands:
        print(f"$ {Path(command[1]).name} {' '.join(command[2:])}")
        if subprocess.run(command, cwd=ROOT).returncode != 0:
            ok = False
    return ok


def package(target: Path, minify: bool) -> tuple[int, int]:
    """Zip both packs.

    With `minify`, JSON is re-serialised without indentation on the way into
    the archive. The parsed document is identical either way - the working tree
    keeps the readable copy, the release carries the compact one. Nothing else
    is transformed: `scripts/main.js` ships as written, so the shipped code
    stays inspectable.
    """
    DIST.mkdir(parents=True, exist_ok=True)
    files = 0
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for pack in (BP, RP):
            for path in sorted(pack.rglob("*")):
                if not path.is_file():
                    continue
                arcname = path.relative_to(PACKS)
                if skip(arcname):
                    continue
                if minify and path.suffix.lower() in {".json", ".material"}:
                    compact = json.dumps(json.loads(path.read_text(encoding="utf-8")),
                                         separators=(",", ":"), ensure_ascii=False)
                    archive.writestr(str(arcname), compact.encode("utf-8"))
                else:
                    archive.write(path, str(arcname))
                files += 1
    return files, target.stat().st_size


def verify_archive(target: Path) -> bool:
    """A .mcaddon that will not open is not a deliverable."""
    with zipfile.ZipFile(target) as archive:
        broken = archive.testzip()
        if broken:
            print(f"  ERROR    corrupt entry in the archive: {broken}")
            return False
        names = set(archive.namelist())
        for required in (f"{BP.name}/manifest.json", f"{RP.name}/manifest.json"):
            if required not in names:
                print(f"  ERROR    {required} is missing from the archive")
                return False
        for name in names:
            if name.startswith("/") or ".." in Path(name).parts:
                print(f"  ERROR    unsafe path in the archive: {name}")
                return False
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--original", type=Path,
                        help="directory holding the extracted 1.0.2 add-on")
    parser.add_argument("--skip-checks", action="store_true")
    parser.add_argument("--no-minify", action="store_true",
                        help="ship the indented JSON instead of the compact form")
    args = parser.parse_args()

    if not args.skip_checks and not run_checks(args.original):
        print("\nrefusing to build: checks failed")
        return 1

    version = ".".join(str(n) for n in load(BP / "manifest.json")["header"]["version"])
    targets = [DIST / "Better_Animation_Feature_Clean.mcaddon",
               DIST / f"Better_Animation_Feature_v{version}.mcaddon"]

    print()
    for target in targets:
        files, size = package(target, minify=not args.no_minify)
        if not verify_archive(target):
            return 1
        print(f"  {rel(target)}  ({files} files, {size / 1024:.0f} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
