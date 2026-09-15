# Third-party review — Better Animation & Feature

**Status: needs your decision before publication.**

The brief for this refactor was explicit: if material turns up that does not
look like it originates with LBR Studio, do not hide it and do not rename it
away quietly — write it down so you can decide what to do. This file is that
record.

Nothing listed here was deleted, and nothing was disguised. The identifiers
were renamed along with the rest of the project, exactly as instructed, and
every rename is reversible through `RENAME_MAP.json`.

> **A rename is not authorship.** Moving `animation.minerplus.player.aeqzkw` to
> `animation.lbr_baf.player.shield_04` changes a string. It does not change who
> animated the keyframes underneath it, and it does not create a right to
> distribute them. If the findings below describe content you did not make and
> do not have permission to ship, the correct fix is to obtain that permission,
> credit the author, or remove the content — not to publish it under a new
> namespace.

---

## Finding 1 — the player-animation system arrived machine-obfuscated

**Severity: high. This is the one to resolve first.**

| | |
|---|---|
| Files | `animations/lbr_baf_player.animation.json`, `animation_controllers/lbr_baf_player.animation_controllers.json`, `entity/player.entity.json`, `models/entity/lbr_baf_player.geo.json`, `render_controllers/lbr_baf_player.render_controllers.json`, `materials/entity.material` |
| Original identifiers | `animation.minerplus.player.<6 random letters>`, `controller.animation.minerplus.player.<6 random letters>`, `geometry.minerplus.player.<6 random letters>`, `mp_player_<6 random letters>`, `v.mp_<6 random letters>` |

### What was observed

In version 1.0.2, essentially every identifier in this system was six random
lowercase letters:

| kind | obfuscated | total |
|------|-----------|-------|
| animations | 435 | 457 |
| animation controllers | 55 | 55 |
| controller states | 283 | 315 |
| render controllers | 6 | 9 |
| player geometries | 5 | 5 |
| materials | 4 | 4 |
| Molang variables | 417 | 429 |
| client-entity aliases | 484 | 516 |

Geometry **bone names** are obfuscated in the same style (`hmhadkja89l_1p1`,
`d67lkg4c`, `4ghq`, `3gllge`). String constants compared inside Molang are too
— `v.mp_evlypi=='jhotdc'`, `q.any(v.mp_ofdozq,'bkmptz','anmlzt')`.

The handful of identifiers that were *not* obfuscated are the ones an
obfuscator normally has to leave alone, because Minecraft or a convention
requires the name: `walk`, `run`, `jump`, `fall`, `swim`, `eat`, `hurt`,
`throw`, `attack`, `bob`, `brush`, `cape`, `fly`, `holding`, `goat_horn`,
`look_at_target`, `humanoid_base_pose`, `first_person_base_pose`,
`first_person_empty_hand`, `vanilla_move_arms`, `vanilla_move_legs`.

### Why it matters

Obfuscation of this kind is applied on the way *out* of a project, to a build
being distributed — not to source a studio is working on. Nobody animates 457
sequences while calling them `aeqzkw` and `btumcw`. The overwhelmingly likely
reading is that this system entered the add-on as a finished, protected
third-party build rather than as LBR Studio source.

### What you need to confirm

- Do you hold the unobfuscated source for these 457 animations?
- If this came from a pack called **MinerPlus** (the namespace it shipped
  under), do you have written permission from its author to redistribute and
  modify it?
- If it was licensed or commissioned, keep that evidence with the project —
  CurseForge asks for it when authorship is questioned.

If you authored this system and obfuscated it yourself before release, this
finding closes immediately: say so, and keep the unobfuscated source as proof.

---

## Finding 2 — item tags from a project that ships items this pack does not

| | |
|---|---|
| File | `animation_controllers/lbr_baf_player.animation_controllers.json` (and a few in the animation file) |
| Original | `minerplus:is_sword`, `minerplus:is_axe`, `minerplus:is_pickaxe`, `minerplus:is_shovel`, `minerplus:is_hoe`, `minerplus:is_bow`, `minerplus:is_crossbow`, `minerplus:is_trident`, `minerplus:is_spear`, `minerplus:is_shield`, `minerplus:is_mace`, `minerplus:is_shears`, `minerplus:is_brush`, `minerplus:is_spyglass`, `minerplus:is_horn`, `minerplus:is_fishing_rod`, `minerplus:is_rod`, `minerplus:is_on_a_stick`, `minerplus:is_flint_and_steel`, `minerplus:is_torch`, `minerplus:is_seeds`, `minerplus:is_petals`, `minerplus:is_potion`, `minerplus:is_drink`, `minerplus:is_milk`, `minerplus:is_soup`, `minerplus:is_readable`, `minerplus:is_throwable`, `minerplus:is_upturned`, `minerplus:is_golden_dandelion` |
| Now | the same 30 tags under `lbr:` |

**No item anywhere in this add-on defines any of these tags.** The behaviour
pack ships six blocks and no items at all. The controllers test them so that
*modded* items can drive the player animations — which means they were written
against a larger project that also ships the tagged items.

Two consequences:

1. They stay `UNRESOLVED_REFERENCE` inside this add-on. That is not a bug: each
   tag is OR-ed with a vanilla test in the same condition, so vanilla items
   animate correctly while the tag is absent. Full list with fallbacks in
   `PROJECT_AUDIT.md` §6.1.
2. The rename is a **compatibility break for third parties**. Any item pack
   that tags its items `minerplus:is_sword` stopped matching. Companion items
   must now use `lbr:is_sword`.

---

## Finding 3 — identifiers that do not exist in vanilla Minecraft

| | |
|---|---|
| File | `animation_controllers/lbr_baf_player.animation_controllers.json` |
| JSON path | inside `q.is_riding_any_entity_of_type(...)` and `q.is_item_name_any(...)` guards |

Four identifiers are written in the `minecraft:` namespace but are not part of
vanilla Minecraft:

| identifier | where | contexts |
|------------|-------|----------|
| `minecraft:nautilus` | `q.is_riding_any_entity_of_type` — a rideable mount with its own riding pose | 20 |
| `minecraft:zombie_nautilus` | same guard as above | 6 |
| `minecraft:camel_husk` | `q.is_riding_any_entity_of_type`, alongside `minecraft:camel` | 3 |
| `minecraft:golden_dandelion` | `q.is_item_name_any`, paired with the `is_golden_dandelion` tag | 84 |

A mount called a nautilus, a zombie variant of it, a husk variant of the camel
and an item called a golden dandelion are **content from another add-on**,
written under the `minecraft:` namespace rather than their own. They are inert
in vanilla — the query simply never matches — so they are harmless to ship, and
they were left in place rather than deleted, because deleting them is exactly
the kind of trace-removal the brief rules out.

They are, however, strong corroboration of Finding 1: this animation system was
built to support a specific larger project's mobs and items.

---

## Finding 4 — the terrain content looks like a different hand

Recorded for completeness, as the one part of the add-on that does *not* raise
a question.

The blocks, features, feature rules, loot tables, block models, block textures
and `scripts/main.js` are unobfuscated, hand-written, consistently structured,
and were named in French (`roche`, `caillou_emeraude`, `forme`) under a plain
`custom:` namespace. That is the profile of ordinary authored source, and it is
stylistically unrelated to the animation system it shipped beside. If any part
of this add-on is straightforwardly LBR Studio's own work, it is this part.

---

## What the refactor did *not* do

The brief ruled out anything meant to disguise origin, and none of it was done:

- no third-party credit was removed — there were none in the pack to remove:
  no URL, no author string, no copyright notice, no PNG text chunk, no ZIP
  comment;
- no metadata was falsified — `metadata.authors` is `["LBR Studio"]`, which is
  the studio publishing the pack, and no licence or URL was invented;
- no extra obfuscation was added, and no file was altered merely to change its
  hash;
- no identifier was given a fake descriptive name: 149 animations whose role
  could not be established keep neutral `state_NNN` identifiers rather than a
  plausible-sounding guess;
- the original `.mcaddon` was never modified — everything was done on a copy,
  and `verify_roundtrip.py` proves the result inverts back to it exactly.

---

## Suggested next step

Settle Finding 1 first; Findings 2 and 3 resolve with it. If you have the
rights, record how — a licence, a commission, a written permission — next to
this file, and this project is ready to publish. If you do not, the animation
system needs to be replaced or removed before release, and this refactor has
made that far easier: `RENAME_MAP.json` and `ANIMATION_INDEX.md` tell you
exactly which 457 animations are involved and what each one is wired to.
