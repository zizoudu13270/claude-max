#!/usr/bin/env python3
"""Shared helpers for the Better Animation & Feature (LBR Studio) tooling.

Every script under tools/baf/ works on the two packs listed here and never
touches the other add-ons in this repository.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
PACKS = ROOT / "packs"
DOCS = ROOT / "docs" / "baf"

BP = PACKS / "BetterAnimationFeature_BP"
RP = PACKS / "BetterAnimationFeature_RP"

# Identity of the project after the refactor.
PROJECT_NAME = "Better Animation & Feature"
STUDIO = "LBR Studio"
NS = "lbr"            # content namespace (blocks, features, item tags)
SYS = "lbr_baf"       # animation-system namespace (animations, geometry, materials)
ALIAS = "lbr"         # prefix for client-entity short keys and Molang variables

# Legacy signatures this refactor removes. Order matters for reporting only.
LEGACY_PATTERNS = {
    "minerplus": r"minerplus",
    "MinerPlus": r"MinerPlus",
    "MINERPLUS": r"MINERPLUS",
    "mp_": r"\bmp_",
    "mp:": r"\bmp:",
    "custom:": r"\bcustom:",
    "actions_and_stuff": r"actions_and_stuff",
    "actions&stuff": r"actions&stuff",
    "actionstuff": r"actionstuff",
    "oreville": r"(?i)oreville",
    "A&S": r"A&S",
}

TEXT_SUFFIXES = {".json", ".js", ".mjs", ".material", ".lang", ".md", ".txt", ".jsonc"}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def dump(path: Path, data, indent: int = 2) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=indent, ensure_ascii=False) + "\n", encoding="utf-8")


def text_files(*roots: Path):
    for root in roots:
        for path in sorted(root.rglob("*")):
            if path.is_file() and path.suffix.lower() in TEXT_SUFFIXES:
                yield path


def all_files(*roots: Path):
    for root in roots:
        for path in sorted(root.rglob("*")):
            if path.is_file():
                yield path


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def rp_paths() -> dict[str, Path]:
    """The five files that carry the player-animation system."""
    return {
        "animations": next(RP.glob("animations/*.animation.json")),
        "controllers": next(RP.glob("animation_controllers/*.animation_controllers.json")),
        "render_controllers": next(RP.glob("render_controllers/*.render_controllers.json")),
        "geometry": next(RP.glob("models/entity/*player*.geo.json")),
        "entity": RP / "entity" / "player.entity.json",
        "material": RP / "materials" / "entity.material",
    }


def state_animation_names(entries) -> list[str]:
    """`animations` / `animate` arrays hold bare names or {name: condition}."""
    out = []
    for entry in entries or []:
        if isinstance(entry, str):
            out.append(entry)
        elif isinstance(entry, dict):
            out.extend(entry.keys())
    return out


def molang_tokens(text: str) -> dict[str, list[str]]:
    """Pull the human-readable vocabulary out of a Molang expression."""
    items = sorted({m for m in re.findall(r"minecraft:([a-z_0-9]+)", text)})
    tags = sorted({m for m in re.findall(r"[a-z_0-9]*:is_([a-z_0-9]+)", text)})
    queries = sorted({m for m in re.findall(r"\bq(?:uery)?\.([a-z_0-9]+)", text)})
    return {"items": items, "tags": tags, "queries": queries}
