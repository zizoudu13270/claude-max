# Authorship — Better Animation & Feature

**Project:** Better Animation & Feature
**Developer:** LBR Studio
**Version:** 1.1.0 (refactored from 1.0.2)
**Namespaces:** `lbr:` for content, `lbr_baf` for the player-animation system

This document records what the add-on is made of and where each part came
from. It is a description of the project, not a claim of ownership over
anything listed in `THIRD_PARTY_REVIEW.md`. **Read that file before publishing
this add-on anywhere.**

---

## Systems in this project

### 1. Player animation system — resource pack

The largest system. It replaces the vanilla player rig with a custom one and
drives it from Molang.

| part | file | size |
|------|------|------|
| Animations | `animations/lbr_baf_player.animation.json` | 457 animations |
| Animation controllers | `animation_controllers/lbr_baf_player.animation_controllers.json` | 55 controllers, 315 states |
| Render controllers | `render_controllers/lbr_baf_player.render_controllers.json` | 9 controllers |
| Player geometry | `models/entity/lbr_baf_player.geo.json` | 5 geometries (88-bone main rig + 4 overlays) |
| Materials | `materials/entity.material` | 4 materials |
| Client entity | `entity/player.entity.json` | 516 aliases, 499 `initialize` statements, 50 `pre_animation` statements, 429 Molang variables |
| Player textures | `textures/lbr_baf/player/` | 3 overlay textures |

What it does, from the reference graph:

- a full custom player rig (`geometry.lbr_baf.player.main`) shown by
  `controller.render.lbr_baf.player.main` whenever the player is not in first
  person, not a map icon, alive, and either not using a persona skin or in the
  pack's higher-detail mode;
- per-item hold, use and swing poses, selected by item tag and item name —
  sword, axe, pickaxe, shovel, hoe, bow, crossbow, trident/spear, mace, shield,
  shears, brush, spyglass, fishing rod, goat horn, torches, seeds, petals,
  potions, food, drinks, books and maps;
- locomotion: walk, run, sprint, jump, fall, swim, glide, sneak, crawl;
- riding poses per vehicle: boat, horse family, llama, camel, pig, strider,
  minecart, happy ghast;
- first-person arm animations, a separate first-person rig path, and a
  paperdoll/UI path;
- leg and pants overlays, one of them driven by a scrolling UV animation;
- armour-layer visibility handling and a hurt/on-fire colour path.

### 2. Terrain content — behaviour pack + resource pack

Hand-written, unobfuscated, and structurally separate from the animation
system.

| part | identifiers |
|------|-------------|
| Blocks | `lbr:rock`, `lbr:rock_coal`, `lbr:rock_copper`, `lbr:rock_iron`, `lbr:rock_gold`, `lbr:rock_emerald`, `lbr:pebbles_emerald` |
| Block state | `lbr:shape` (two shapes for `lbr:pebbles_emerald`) |
| Features | 9, including a weighted-random feature that picks between the two pebble shapes |
| Feature rules | 7, all surface-pass, overworld-biome gated |
| Loot tables | 7, tier-gated by pickaxe material |
| Block models | `geometry.lbr_baf.rock` and 4 ore variants, `geometry.lbr_baf.pebbles_emerald` + `_alt` |
| Block textures | `textures/lbr_baf/blocks/` |

### 3. Grass and fern variation — resource pack

`textures/terrain_texture.json` overrides six **vanilla** atlas entries
(`short_grass`, `fern`, `tall_grass_top`, `tall_grass_bottom`,
`large_fern_top`, `large_fern_bottom`) with weighted variation lists, backed by
38 textures in `textures/lbr_baf/environment/`. Two further files
(`textures/blocks/fern.png`, `textures/blocks/tallgrass.png`) replace vanilla
textures by occupying the vanilla path.

### 4. Mining rules — behaviour pack script

`scripts/main.js`, a single module against `@minecraft/server` 2.0.0. It
cancels `playerBreakBlock` when the tool tier is below the block's tier, for
the seven `lbr:` blocks. Mining *speed* is handled by native block components,
not by the script.

---

## Identity

| field | value |
|-------|-------|
| Pack name | `pack.name` → "Better Animation & Feature [BP] / [RP]" via `texts/*.lang` |
| `metadata.authors` | `["LBR Studio"]` in both manifests |
| Languages | en_GB, en_US, es_ES, es_MX, fr_CA, fr_FR |
| BP header UUID | `5865dbd5-311a-4070-8a9b-e733726f6943` |
| RP header UUID | `db3ae419-b153-4ace-ac2f-3178ca8a3ca5` |

UUIDs are unchanged from 1.0.2 on purpose — they are how Minecraft matches an
installed pack to a world, and no part of the refactor needs new ones. No
licence and no URL are declared, because no real value for either is known;
inventing one would be a false metadata claim.

---

## Companion documents

| file | contents |
|------|----------|
| `PROJECT_AUDIT.md` | what was analysed, what changed, what stayed, what is unresolved |
| `RENAME_MAP.json` | every old → new identifier, machine-readable |
| `ANIMATION_INDEX.md` | one row per animation: old id, new id, probable function, controller, guard, loop, length, bones |
| `RESOURCE_USAGE.md` | USED / UNRESOLVED / UNUSED_CONFIRMED for every asset |
| `THIRD_PARTY_REVIEW.md` | **material that does not appear to originate with LBR Studio** |
