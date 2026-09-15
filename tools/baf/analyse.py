#!/usr/bin/env python3
"""Evidence gathering for the player-animation system.

For every animation this collects the facts a name can honestly be built
from: the aliases that point at it, the controller states that play it, the
Molang that guards those states, and the shape of the animation itself.

Nothing here writes files - build_rename_map.py and the documentation
generators consume `evidence()`.
"""
from __future__ import annotations

import collections
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from baf_common import load, rp_paths, state_animation_names

# Tokens that carry real meaning. Everything else that is six lowercase
# letters is treated as one of the original pack's obfuscated identifiers.
OBFUSCATED = re.compile(r"^[a-z]{6}$")
REAL_SIX_LETTER_WORDS = {
    "attack", "shield", "sprint", "crouch", "paddle", "riding", "damage",
    "elytra", "ladder", "shears", "trident", "spear", "sleeps", "camel",
}

# Vanilla queries that describe a player state well enough to name from.
QUERY_MEANING = {
    "is_sneaking": "sneak",
    "is_sprinting": "sprint",
    "is_swimming": "swim",
    "is_gliding": "glide",
    "is_sleeping": "sleep",
    "is_crawling": "crawl",
    "is_jumping": "jump",
    "is_emoting": "emote",
    "is_in_water": "water",
    "is_riding": "riding",
    "blocking": "blocking",
    "is_spectator": "spectator",
    "is_on_ground": None,       # too common to name from
    "is_in_ui": None,
    "state_time": None,
}

# Item-family tokens, ordered so the most specific wins when several appear.
FAMILY_ORDER = [
    "mace", "crossbow", "trident", "spear", "shield", "bow", "brush",
    "spyglass", "fishing_rod", "flint_and_steel", "shears", "goat_horn",
    "horn", "golden_dandelion", "on_a_stick", "throwable", "readable",
    "petals", "seeds", "torch", "potion", "drink", "milk", "soup",
    "upturned", "sword", "axe", "pickaxe", "shovel", "hoe", "rod", "map",
]


def is_meaningful(token: str) -> bool:
    """True when a token reads as a word rather than as an obfuscated handle.

    Dotted tokens are rejected outright: the original pack uses them for
    sub-states (`mp_dxdudb.a`), and a dot inside an identifier suffix would
    also read as a namespace separator.
    """
    if not token or token == "default" or "." in token:
        return False
    if "_" in token:
        return not any(OBFUSCATED.match(part) and part not in REAL_SIX_LETTER_WORDS
                       for part in token.split("_"))
    if OBFUSCATED.match(token):
        return token in REAL_SIX_LETTER_WORDS
    return len(token) >= 2


def strip_prefix(name: str) -> str:
    return re.sub(r"^mp_", "", name)


def load_system() -> dict:
    paths = rp_paths()
    entity = load(paths["entity"])["minecraft:client_entity"]["description"]
    return {
        "paths": paths,
        "animations": load(paths["animations"])["animations"],
        "controllers": load(paths["controllers"])["animation_controllers"],
        "render_controllers": load(paths["render_controllers"])["render_controllers"],
        "geometry": load(paths["geometry"])["minecraft:geometry"],
        "entity": entity,
        "alias": entity["animations"],
    }


def _condition_text(state: dict, incoming: list[str]) -> str:
    parts = list(incoming)
    parts += [str(v) for t in state.get("transitions", []) for v in t.values()]
    parts += [str(e) for e in state.get("on_entry", [])]
    for entry in state.get("animations", []):
        if isinstance(entry, dict):
            parts += [str(v) for v in entry.values()]
    return " ".join(parts)


def evidence() -> dict:
    """animation id -> every fact we know about it."""
    sysm = load_system()
    anims, ctrls, alias = sysm["animations"], sysm["controllers"], sysm["alias"]

    reverse = collections.defaultdict(list)
    for name, target in alias.items():
        reverse[target].append(name)

    # alias -> [(controller, state, incoming conditions)]
    plays = collections.defaultdict(list)
    for cid, ctrl in ctrls.items():
        states = ctrl.get("states", {})
        incoming = collections.defaultdict(list)
        for sname, state in states.items():
            for transition in state.get("transitions", []):
                for target, cond in transition.items():
                    incoming[target].append(str(cond))
        for sname, state in states.items():
            for played in state_animation_names(state.get("animations", [])):
                plays[played].append((cid, sname, incoming.get(sname, [])))

    driven_directly = set(state_animation_names(sysm["entity"]["scripts"].get("animate", [])))

    out = {}
    for anim_id, body in anims.items():
        aliases = reverse.get(anim_id, [])
        contexts = [ctx for a in aliases for ctx in plays.get(a, [])]
        bones = list(body.get("bones", {})) if isinstance(body, dict) else []
        conditions = " ".join(_condition_text({}, ctx[2]) for ctx in contexts)
        for cid, sname, inc in contexts:
            state = ctrls[cid]["states"][sname]
            conditions += " " + _condition_text(state, inc)

        out[anim_id] = {
            "aliases": aliases,
            "contexts": [{"controller": c, "state": s} for c, s, _ in contexts],
            "top_level": bool(set(aliases) & driven_directly),
            "loop": body.get("loop", False) if isinstance(body, dict) else False,
            "length": body.get("animation_length") if isinstance(body, dict) else None,
            "bones": bones,
            "bone_count": len(bones),
            "conditions": conditions,
            "items": sorted(set(re.findall(r"minecraft:([a-z_0-9]+)", conditions))),
            "tags": sorted(set(re.findall(r"[a-z_0-9]*:is_([a-z_0-9]+)", conditions))),
            "queries": sorted(set(re.findall(r"\bq(?:uery)?\.([a-z_0-9]+)", conditions))),
        }
    return out, sysm


def dominant_family(fact: dict) -> str | None:
    """The single item family a state is gated on, when there is exactly one."""
    found = [f for f in FAMILY_ORDER if f in fact["tags"]]
    if not found:
        found = [f for f in FAMILY_ORDER if f in fact["items"]]
    # `spear` and `trident` always travel together in this pack; `horn` is the
    # short form of `goat_horn`. Collapse the known synonyms before deciding.
    collapsed = []
    for family in found:
        if family == "spear" and "trident" in found:
            continue
        if family == "horn" and "goat_horn" in found:
            continue
        if family == "rod" and ("fishing_rod" in found or "on_a_stick" in found):
            continue
        collapsed.append(family)
    return collapsed[0] if len(collapsed) == 1 else None


def dominant_state(fact: dict) -> str | None:
    states = {q for q in fact["queries"] if QUERY_MEANING.get(q)}
    if len(states) == 1:
        return QUERY_MEANING[next(iter(states))]
    return None


if __name__ == "__main__":
    facts, _ = evidence()
    tier = collections.Counter()
    for anim_id, fact in facts.items():
        suffix = anim_id.split(".")[-1]
        names = [suffix] + [strip_prefix(a) for a in fact["aliases"]]
        names += [strip_prefix(c["state"]) for c in fact["contexts"]]
        if any(is_meaningful(n) for n in names):
            tier["A descriptive token"] += 1
        elif dominant_family(fact):
            tier["B single item family"] += 1
        elif dominant_state(fact):
            tier["B single player state"] += 1
        else:
            tier["C stable numbering"] += 1
    for key, value in sorted(tier.items()):
        print(f"{key:28} {value}")
