# Ultimate Survival Pack — v4.1.0

*[Version française](README.fr.md)*

A Minecraft **Bedrock** add-on that bundles seventeen quality-of-life modules
behind one switchable configuration file. Tree felling, vein mining, a real
off-hand slot, dynamic light, floating loot labels, a grave chest — all of it
in English and French, chosen automatically per player.

| | |
|---|---|
| **Creator** | LBR |
| **Version** | 4.1.0 |
| **Minimum Minecraft** | Bedrock 1.21.50 |
| **Script API** | `@minecraft/server` 1.11.0 |
| **Languages** | English (`en_US`), French (`fr_FR`) |
| **Download** | [`dist/Pack_Survie_Ultime_v4.1.0.mcaddon`](dist/Pack_Survie_Ultime_v4.1.0.mcaddon) |

---

## Install

1. Download the `.mcaddon` from `dist/`.
2. Open it — Minecraft imports both packs on its own.
3. In the world settings, enable **Ultimate Survival Pack** under Behaviour
   Packs. The resource pack is pulled in automatically as a dependency.
4. Turn **Beta APIs** on in the world's experiments. The scripting API needs it.

> Both packs must be active. The behaviour pack defines the entities and items;
> the resource pack draws them and holds the translations. With only one of the
> two, loot labels are invisible and item names show up as raw keys.

---

## Modules

Every module has an `enabled` flag in `packs/PSU_BP/scripts/config.js`.
Turning one off costs nothing at run time — its handlers are never registered.

| Module | What it does | Config key |
|---|---|---|
| **TreeCapitator** | Breaking a trunk with an axe fells the whole tree. Sneak to break a single log. | `tree` |
| **VeinMiner** | Breaking an ore with a pickaxe mines the connected vein, **with Silk Touch, Fortune and ore experience**. Sneak for a single block. | `vein` |
| **Loot labels** | A floating `12x Oak Log` tag follows every item on the ground and tracks its real stack size. | `labels` |
| **Dynamic light** | Holding a light source lights the world around you, in either hand. | `light` |
| **Light twins** | Every vanilla light source gets a `psu:` twin that Bedrock accepts in the off-hand and that places the real vanilla block. | `lightItems` |
| **Off-hand** | Sneak + jump, or sneak + tap on empty air, to swap your hands. | `offhand` |
| **Death marker** | Exact coordinates and dimension in chat; the gear on the ground is gathered into a chest on the spot. | `death` |
| **Auto replant** | Tapping a ripe crop harvests and replants it; one seed is taken from the harvest to pay for it. | `replant` |
| **Double doors** | Opening one door of a pair opens the other. | `doors` |
| **Anvil repair** | Tapping a damaged anvil with an iron ingot brings it up one step. | `anvil` |
| **Anti-griefing** | Creepers still hurt, but no longer break blocks. Configurable per source. | `nogrief` |
| **Glowing arrows** | An arrow stuck in a wall lights the area for 30 seconds. | `arrows` |
| **Silk spawner** | A Silk Touch pickaxe collects a spawner as an item. | `spawner` |
| **Sorter** | Sneak + tap a container to sort and restack it; `/scriptevent psu:sort` does your inventory. | `sorter` |
| **AutoTool** | Picks the right tool from the hotbar for the block you are looking at, and puts your old slot back afterwards. | `autotool` |
| **Trash** | `/scriptevent psu:trash` destroys the held stack; an optional junk list clears itself automatically. | `trash` |
| **Emerald pickaxe** | 3 emeralds + 2 sticks. Diamond tier and durability, repairable with emeralds, mines a 3×3 plane. | `emeraldPick` |

Recycling recipes come with the pack: diamond gear smelts back into a diamond,
leather gear into leather, the emerald pickaxe into an emerald. The yield is
deliberately low — anything higher turns durability into an infinite ore farm.

---

## Commands

Cheats must be enabled. Both the English and the French command names work.

| Command | Alias | Effect |
|---|---|---|
| `/scriptevent psu:help` | `psu:aide` | Command and shortcut reminder |
| `/scriptevent psu:diag` | — | Full status of all seventeen modules |
| `/scriptevent psu:death` | `psu:mort` | Coordinates of your last death |
| `/scriptevent psu:sort` | `psu:trier` | Sort your own inventory |
| `/scriptevent psu:trash` | `psu:poubelle` | Destroy the held stack |
| `/scriptevent psu:light` | `psu:lumiere` | Force a light-placement test and report what failed |
| `/scriptevent psu:cleanlight` | — | Remove stray light blocks left by a crash |
| `/scriptevent psu:swap` | — | Force a hand swap |
| `/scriptevent psu:vanilla` | — | Turn every `psu:` twin in your inventory back into vanilla |

---

## Configuration

Everything lives in **`packs/PSU_BP/scripts/config.js`**, commented in both
languages. A few settings worth knowing:

```js
lightItems.replaceVanilla: false
```
`false` (recommended) keeps the `psu:` twins in the off-hand slot only —
everything else in your inventory stays vanilla, so nothing is lost if you
remove the pack. `true` converts every light source in your inventory. In that
mode the pack ships compatibility recipes for the lantern, the soul lantern,
the soul torch, the jack o'lantern, the repeater, the comparator and the
redstone lamp; any *other* vanilla recipe that consumes a torch or glowstone
will not accept a twin.

```js
vein.silkTouch / vein.fortune / vein.giveXp: true
```
Reproduces the vanilla ore loot for the whole vein. Set them to `false` to fall
back on plain `/setblock destroy` drops.

```js
autotool.keepHeld / autotool.keepHeldSuffix
```
Items the tool switcher must never take out of your hand — swords, bows,
buckets, spawn eggs. Add your own ids here.

```js
nogrief.sources: ["minecraft:creeper"]
```
An **empty** list means every explosion, TNT and beds included.

---

## About the animated icon

Minecraft Bedrock does not read GIFs, and **`pack_icon.png` cannot be
animated** — the game only ever draws a single still frame there, no JSON hook
changes that. What *can* be animated is any texture that goes through the item
atlas, using the official **flipbook** technique:

* all frames stacked **vertically** in one PNG, 16 px wide,
* one entry in `textures/flipbook_textures.json` giving the playback speed.

This pack ships `psu_axe_anim.png` — a 16×112 strip of the seven axe tiers
(wood → stone → copper → iron → gold → diamond → netherite), rebuilt from the
source renders in `assets/frames/`. The demo item `psu:icone_animee` wears it.

To animate any other item, one line in its file under `packs/PSU_BP/items/`:

```json
"minecraft:icon": { "texture": "psu_axe_anim" }
```

Playback speed is `ticks_per_frame` in `flipbook_textures.json` (20 ticks =
1 second). To use your own frames, drop 16×16 PNGs into `assets/frames/`
(they play in filename order) and run `python3 tools/make_assets.py`.

### If you need a moving icon for a store page

`tools/make_assets.py` also writes **`dist/pack_icon_animated.gif`** — the same
seven frames as a looping GIF. The game will not read it, but a Marketplace
listing, a thumbnail or a trailer will, which is the one place a moving icon
can actually be shown. `packs/*/pack_icon.png` stays a static 256×256 render
because that is all the pack list will ever draw.

---

## Development

```
assets/            source frames + the light-source table
packs/PSU_BP/      behaviour pack: items, recipes, entities, scripts
packs/PSU_RP/      resource pack: textures, translations, loot-label entity
tools/             generators, validator and test suite
dist/              the built .mcaddon
```

```bash
python3 tools/generate_items.py   # regenerate items + texture atlas
python3 tools/make_assets.py      # rebuild the flipbook sheet and pack icons
python3 tools/validate.py         # 753 structural checks
node    tools/test_scripts.mjs    # 45 unit and regression tests
python3 tools/build.py            # validate + test + package the .mcaddon
```

`tools/validate.py` catches what Minecraft fails silently on: a texture alias
with no entry in the atlas, a `display_name` key missing from a `.lang` file,
a recipe pointing at an item that does not exist, a UUID collision, a manifest
version that drifted from its dependency, a translation key present in English
but not in French.

`tools/test_scripts.mjs` copies the scripts next to a stub of
`@minecraft/server` and actually **runs** them: every module has to load, every
`/scriptevent` has to answer, and the data-loss bugs listed in the changelog
each have a regression test that fails if the fix is reverted.

---

## Known limits

These are engine limits, not bugs — they are listed so nobody spends an evening
chasing them.

* **A harvested spawner loses its mob type.** Bedrock's stable script API
  cannot read the mob id from a spawner. Place it and use a spawn egg on it.
* **`pack_icon.png` cannot be animated.** See the section above.
* **Shulker box contents cannot be previewed in a tooltip.** The API gives no
  access to a shulker box's contents while it is an *item*, and vanilla tooltip
  text is not modifiable by an add-on.
* **The 3×3 emerald pickaxe does not apply Silk Touch or Fortune to the extra
  blocks.** They break with vanilla hand drops. Containers, spawners,
  obsidian and bedrock are skipped entirely.
* **Fortune on vein-mined ore is reproduced from the vanilla formula**, not
  read from the engine. If Mojang retunes an ore, `packs/PSU_BP/scripts/drops.js`
  has to follow.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for the full list of fixes in 4.1.0.
