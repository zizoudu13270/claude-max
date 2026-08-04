# Minecraft Bedrock add-ons

*[Version française](README.fr.md)*

Two Minecraft **Bedrock** add-ons built from one shared code base, both fully
bilingual (English / French, picked per player).

| Add-on | What you get | Download |
|---|---|---|
| **Survival Core** — v1.0.0 | Four systems, nothing else: TreeCapitator, VeinMiner, drop clumping with floating labels, dynamic light. **No off-hand module, no custom items.** | [`dist/Survival_Core_v1.0.0.mcaddon`](dist/Survival_Core_v1.0.0.mcaddon) |
| **Ultimate Survival Pack** — v4.1.0 | Everything above plus thirteen more comfort modules: real off-hand slot, grave chest, sorter, auto-replant, anti-griefing, emerald pickaxe… | [`dist/Pack_Survie_Ultime_v4.1.0.mcaddon`](dist/Pack_Survie_Ultime_v4.1.0.mcaddon) |

Pick **one**. They overlap heavily — running both at once means two
TreeCapitators fighting over the same tree.

| | |
|---|---|
| **Minimum Minecraft** | Bedrock 1.21.0 |
| **Script API** | `@minecraft/server` 1.11.0 |
| **Languages** | English (`en_US`), French (`fr_FR`) |

---

## Install

1. Download one `.mcaddon` from `dist/`.
2. Open it — Minecraft imports both packs on its own.
3. In the world settings, enable the behaviour pack. The resource pack is
   pulled in automatically as a dependency.
4. Turn **Beta APIs** on in the world's experiments. The scripting API needs it.

> Both packs must be active. The behaviour pack defines the entities and items;
> the resource pack draws them and holds the translations. With only one of the
> two, loot labels are invisible and item names show up as raw keys.

---

# Survival Core

Four systems, each switchable in `packs/PSC_BP/scripts/config.js`.

### 1. TreeCapitator — it knows a tree from a house

Break a log with an axe and the whole tree comes down. Break a log of your
**log cabin** and nothing happens — that is the point of this module.

Naive tree fellers flood-fill every connected log, which is why they eat
buildings. This one runs in two phases:

1. **Analyse** (read-only, nothing is broken). The connected log cluster is
   walked once and scored against six independent signals.
2. **Fell** — only if the verdict is `ok`, and only the blocks phase 1 listed.
   The destruction cannot wander off into a wall.

| Signal | A tree | A build |
|---|---|---|
| **Trunk type** | `oak_log`, `crimson_stem`… | `oak_wood` (bark on six sides) and every `stripped_*` are player-made, refused outright |
| **Height** | ≥ 4 blocks | a log floor is 1 |
| **Base footprint** | 1 column, or 4 for a 2×2 giant | a wall or a floor covers many |
| **Leaves** | plenty, both in absolute count and per log | a cabin brushing a canopy still scores far too low |
| **Build contact** | nothing man-made touching the logs | planks, stairs, glass, a door, a torch… |
| **Ground** | dirt, grass, podzol, mud, nylium… | planks, stone bricks |

Natural neighbours are whitelisted first, so moss carpet, bee nests, cocoa,
mangrove roots, vines and snow never read as "somebody built this".

Anything refused just behaves like vanilla: you break one log.

**Tuning:** `/scriptevent psc:tree` prints the full verdict for whatever you are
looking at, without breaking it:

```
ok | logs=7 leaves=44(44 same species) height=5 base=1 build=0 ground=natural
base_too_wide | logs=72 leaves=0 height=5 base=24 build=61 ground=artificial
```

Every threshold is in `config.js` under `tree.validate`. Set
`tree.explainRefusal: true` to have the reason printed to your action bar on
every refusal.

### 2. VeinMiner

Break an ore with a pickaxe and the connected vein goes with it — **including
Silk Touch, Fortune and the ore's experience**, which most vein miners lose
because `/setblock destroy` drops loot with no tool context.

Decorative blocks are deliberately not ore: `quartz_block` and `coal_block` are
building materials, and vein-mining a quartz wall is not a feature. Extra ids
go in `vein.extraBlocks`.

Sneak to mine a single block.

### 3. Clumping + dynamic display

After a felled tree or a mined vein, the loose drops are merged into full
stacks instead of leaving 300 entities lagging the area (`clump`), and every
item on the ground carries a floating `12x Oak Log` tag that follows its real
stack size as it changes (`labels`).

Items whose payload the script API cannot read — potions, filled shulker boxes,
enchanted gear, written books, mob buckets — are never merged. Rebuilding them
from their type id alone would destroy them.

### 4. Dynamic light

Hold a torch, a lantern, a lava bucket, glow berries… and the world lights up
around you.

**There is no off-hand module and no custom light items.** The list of what
glows is explicit in `packs/PSC_BP/scripts/lightsources.js` — substring matching
would also catch a torchflower, magma cream and an unlit candle, none of which
emit light.

### Commands

Cheats must be enabled. French and English names both work.

| Command | Alias | Effect |
|---|---|---|
| `/scriptevent psc:help` | `psc:aide` | Reminder of what does what |
| `/scriptevent psc:diag` | — | Status of all four modules |
| `/scriptevent psc:tree` | `psc:arbre` | Analyse the log you are looking at |
| `/scriptevent psc:light` | `psc:lumiere` | Force a light-placement test |
| `/scriptevent psc:cleanlight` | — | Remove stray light blocks left by a crash |

---

# Ultimate Survival Pack

Everything Survival Core does — including the new tree validation — plus
thirteen modules. Each has an `enabled` flag in
`packs/PSU_BP/scripts/config.js`; turning one off costs nothing at run time,
its handlers are never registered.

| Module | What it does | Config key |
|---|---|---|
| **TreeCapitator** | As above: fells trees, leaves buildings alone. | `tree` |
| **VeinMiner** | As above: Silk Touch, Fortune, ore experience. | `vein` |
| **Clumping** | Merges the drops of a tree or a vein into full stacks. | `clump` |
| **Loot labels** | Floating `12x Oak Log` over every item on the ground. | `labels` |
| **Dynamic light** | Holding a light source lights the world, in either hand. | `light` |
| **Light twins** | Every vanilla light source gets a `psu:` twin Bedrock accepts in the off-hand, placing the real vanilla block. | `lightItems` |
| **Off-hand** | Sneak + jump, or sneak + tap on empty air, to swap your hands. | `offhand` |
| **Death marker** | Coordinates and dimension in chat; the gear on the ground is gathered into a chest on the spot. | `death` |
| **Auto replant** | Tapping a ripe crop harvests and replants it. | `replant` |
| **Double doors** | Opening one door of a pair opens the other. | `doors` |
| **Anvil repair** | An iron ingot brings a damaged anvil up one step. | `anvil` |
| **Anti-griefing** | Creepers still hurt, but no longer break blocks. | `nogrief` |
| **Glowing arrows** | An arrow stuck in a wall lights the area for 30 s. | `arrows` |
| **Silk spawner** | A Silk Touch pickaxe collects a spawner as an item. | `spawner` |
| **Sorter** | Sneak + tap a container to sort and restack it. | `sorter` |
| **AutoTool** | Picks the right tool for the block you are aiming at, and puts your old slot back. | `autotool` |
| **Trash** | Destroys the held stack; optional auto-clearing junk list. | `trash` |
| **Emerald pickaxe** | 3 emeralds + 2 sticks. Diamond tier, repairable with emeralds, mines a 3×3 plane. | `emeraldPick` |

Recycling recipes are included: diamond gear smelts back into a diamond,
leather gear into leather, the emerald pickaxe into an emerald. The yield is
deliberately low — anything higher turns durability into an infinite ore farm.

### Commands

| Command | Alias | Effect |
|---|---|---|
| `/scriptevent psu:help` | `psu:aide` | Command and shortcut reminder |
| `/scriptevent psu:diag` | — | Full status of all seventeen modules |
| `/scriptevent psu:tree` | `psu:arbre` | Analyse the log you are looking at |
| `/scriptevent psu:death` | `psu:mort` | Coordinates of your last death |
| `/scriptevent psu:sort` | `psu:trier` | Sort your own inventory |
| `/scriptevent psu:trash` | `psu:poubelle` | Destroy the held stack |
| `/scriptevent psu:light` | `psu:lumiere` | Force a light-placement test |
| `/scriptevent psu:cleanlight` | — | Remove stray light blocks |
| `/scriptevent psu:swap` | — | Force a hand swap |
| `/scriptevent psu:vanilla` | — | Turn every `psu:` twin back into vanilla |

### `lightItems.replaceVanilla`

`false` (recommended) keeps the `psu:` twins in the off-hand slot only —
everything else stays vanilla, so nothing is lost if you remove the pack.
`true` converts every light source in your inventory. In that mode the pack
ships compatibility recipes for the lantern, soul lantern, soul torch,
jack o'lantern, repeater, comparator and redstone lamp; any *other* vanilla
recipe consuming a torch or glowstone will not accept a twin.

### About the animated icon

Minecraft Bedrock does not read GIFs, and **`pack_icon.png` cannot be
animated** — the game only ever draws a single still frame there, no JSON hook
changes that. What *can* be animated is any texture going through the item
atlas, using the official **flipbook** technique:

* all frames stacked **vertically** in one PNG, 16 px wide,
* one entry in `textures/flipbook_textures.json` giving the playback speed.

The pack ships `psu_axe_anim.png` — a 16×112 strip of the seven axe tiers
(wood → stone → copper → iron → gold → diamond → netherite), rebuilt from the
source renders in `assets/frames/`. The demo item `psu:icone_animee` wears it.

To animate any other item, one line in its file under `packs/PSU_BP/items/`:

```json
"minecraft:icon": { "texture": "psu_axe_anim" }
```

Playback speed is `ticks_per_frame` in `flipbook_textures.json` (20 ticks =
1 second). To use your own frames, drop 16×16 PNGs into `assets/frames/` (they
play in filename order) and run `python3 tools/make_assets.py`.

---

## Development

```
addons.json        which add-ons exist and which checks apply to each
assets/            source frames + the light-source table
shared/scripts/    modules both add-ons run, synced into each pack
packs/PSC_BP,PSC_RP   Survival Core
packs/PSU_BP,PSU_RP   Ultimate Survival Pack
tools/             generators, validator and test suite
dist/              the built .mcaddon files
```

```bash
python3 tools/sync_shared.py      # copy shared/scripts into every pack
python3 tools/generate_items.py   # regenerate items/attachables/textures
python3 tools/make_assets.py      # rebuild the flipbook sheet and pack icons
python3 tools/validate.py         # 920+ structural checks across both add-ons
node    tools/test_scripts.mjs    # 59 unit, integration and regression tests
python3 tools/build.py            # sync + validate + test + package
```

The shared modules live once in `shared/scripts/` and are copied into each
behaviour pack. `validate.py` fails the build if a copy has drifted, so a stale
duplicate cannot ship. Each pack keeps its own `config.js`, `main.js` and
`lightsources.js` — that is where the two add-ons genuinely differ.

`tools/validate.py` catches what Minecraft fails silently on: a texture alias
with no entry in the atlas, a `display_name` key missing from a `.lang` file, a
recipe pointing at an item that does not exist, a UUID collision between the
two add-ons, a manifest version that drifted from its dependency, a translation
key present in English but not in French.

`tools/test_scripts.mjs` copies each add-on's scripts next to a stub of
`@minecraft/server` and actually **runs** them. Beyond loading every module, it
builds synthetic worlds (`tools/worlds.mjs`) — an oak, a giant spruce, a
crimson fungus, a log cabin, a log cabin *inside a forest*, a decorative pillar
in a room, a tree growing against a house — and checks the verdict for each,
end to end through the real break event.

---

## Known limits

Engine limits, not bugs — listed so nobody spends an evening chasing them.

* **A harvested spawner loses its mob type.** Bedrock's stable script API
  cannot read the mob id from a spawner. Place it and use a spawn egg on it.
* **`pack_icon.png` cannot be animated.** See above.
* **Shulker box contents cannot be previewed in a tooltip.** The API gives no
  access to a shulker box's contents while it is an *item*.
* **Tree detection is heuristic.** A 1×1 log pillar standing on grass, under
  leaves, with nothing man-made touching it is indistinguishable from a trunk.
  Every threshold is configurable and `/scriptevent <ns>:tree` shows exactly
  which test decided.
* **The 3×3 emerald pickaxe does not apply Silk Touch or Fortune to the extra
  blocks.** Containers, spawners, obsidian and bedrock are skipped entirely.
* **Fortune on vein-mined ore is reproduced from the vanilla formula**, not read
  from the engine. If Mojang retunes an ore, `shared/scripts/drops.js` follows.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).
