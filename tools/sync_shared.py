#!/usr/bin/env python3
"""Copy shared/scripts into every behaviour pack that uses them.

The add-ons in this repository run the same TreeCapitator, VeinMiner,
loot-label and dynamic-light code. Rather than maintaining two copies,
the modules live once in shared/scripts and are copied into each pack at
sync time. tools/validate.py fails the build if a copy has drifted, so a
stale duplicate cannot ship.

Each pack keeps its own config.js, main.js and lightsources.js - that is
where the two add-ons genuinely differ.

Run:  python3 tools/sync_shared.py [--check]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHARED = ROOT / "shared" / "scripts"
PACKS = ROOT / "packs"


def addons() -> list[dict]:
    data = json.loads((ROOT / "addons.json").read_text(encoding="utf-8"))
    return [a for a in data["addons"] if a.get("sharedScripts")]


def shared_files() -> list[Path]:
    files = sorted(SHARED.glob("*.js"))
    if not files:
        sys.exit(f"no shared modules in {SHARED}")
    return files


def main() -> int:
    check_only = "--check" in sys.argv
    drifted: list[str] = []
    copied = 0

    for addon in addons():
        target_dir = PACKS / addon["behaviour"] / "scripts"
        target_dir.mkdir(parents=True, exist_ok=True)

        for source in shared_files():
            target = target_dir / source.name
            payload = source.read_bytes()

            if target.exists() and target.read_bytes() == payload:
                continue

            if check_only:
                drifted.append(f"{addon['id']}: scripts/{source.name} differs from shared/")
                continue

            target.write_bytes(payload)
            copied += 1

    if check_only:
        for message in drifted:
            print("  ERROR    " + message)
        if drifted:
            print(f"\nFAILED - {len(drifted)} stale copy/copies. Run: python3 tools/sync_shared.py")
            return 1
        print(f"OK - shared modules in sync across {len(addons())} add-on(s)")
        return 0

    print(f"synced {len(shared_files())} shared module(s) into "
          f"{len(addons())} add-on(s) ({copied} file(s) updated)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
