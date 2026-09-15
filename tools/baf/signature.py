#!/usr/bin/env python3
"""Structural fingerprints for the animation payloads.

Two digests are taken per animation:

  shape   every value except strings - lengths, loops, bone names, channel
          names, timestamps, positions, rotations, scales, interpolation.
          Renaming an identifier must never change this.
  full    the same walk with Molang strings included. This one is expected
          to change exactly where the rename map says a variable or a tag
          inside an expression was renamed.

Run:  python3 tools/baf/signature.py <animation file> --out <json>
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import load

STRING = "\x00<string>"


def canonical(node, keep_strings: bool):
    if isinstance(node, dict):
        return [[k, canonical(v, keep_strings)] for k, v in node.items()]
    if isinstance(node, list):
        return [canonical(v, keep_strings) for v in node]
    if isinstance(node, str):
        return node if keep_strings else STRING
    if isinstance(node, float) and node == int(node):
        return int(node)          # 1.0 and 1 describe the same keyframe
    return node


def digest(node, keep_strings: bool) -> str:
    blob = json.dumps(canonical(node, keep_strings), sort_keys=False,
                      separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:16]


def signatures(path: Path) -> dict:
    anims = load(path)["animations"]
    out = {}
    for name, body in anims.items():
        bones = body.get("bones", {}) if isinstance(body, dict) else {}
        out[name] = {
            "shape": digest(body, keep_strings=False),
            "full": digest(body, keep_strings=True),
            "length": body.get("animation_length") if isinstance(body, dict) else None,
            "loop": body.get("loop", False) if isinstance(body, dict) else False,
            "bones": sorted(bones),
            "bone_count": len(bones),
            "channels": sorted({c for b in bones.values() if isinstance(b, dict) for c in b}),
        }
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("animation_file", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    sigs = signatures(args.animation_file)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(sigs, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"{len(sigs)} animation signatures -> {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
