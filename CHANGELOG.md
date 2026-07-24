# Changelog

All notable changes to the Ultimate Survival Pack / Pack Survie Ultime.
Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
the project follows [Semantic Versioning](https://semver.org/).

---

## [4.0.0] — Correctness, localisation and tooling pass

Every UUID is unchanged, so existing worlds keep their packs. The behaviour
changes below are the ones a player will notice.

### Fixed — data loss

* **The sorter destroyed item data.** Contents were counted by type id and
  rebuilt with `new ItemStack(typeId, amount)`. Anything whose payload the
  script API cannot read came back generic: three different potions became
  three identical ones, a full shulker box came back empty, a written book lost
  its pages, a tropical fish bucket lost its fish. Those items are now carried
  over untouched (`scripts/itemdata.js`, `isMergeable`).
* **The sorter deleted the surplus.** If the rewrite ran out of slots the
  remaining stacks were silently dropped from existence. They are now spat out
  on the floor.
* **The loot gatherer had the same flaw.** `gatherAndSpawnItems` merged *every*
  item entity within 20 blocks after a tree or a vein, so a potion lying on the
  ground near a felled tree was rebuilt and ruined. It now skips anything that
  is not safely mergeable.

### Fixed — modules that did nothing, or the wrong thing

* **Silk Touch and Fortune were lost on vein mining.** Extra blocks were broken
  with `/setblock … air destroy`, which drops loot with no tool context —
  silk-touching a diamond vein handed out diamonds instead of ore blocks. The
  vanilla ore loot is now reproduced for the whole vein, ore experience
  included (`scripts/drops.js`).
* **Anvil repair did nothing on older worlds.** Bedrock has encoded anvil damage
  three different ways; only two were handled. The string form
  (`very_damaged` → `slightly_damaged` → `undamaged`) is now handled too.
* **Auto-replant chewed through the wrong tool.** It damaged whatever was in
  hand — a sword, a pickaxe, a stack of wheat. It only damages an actual hoe now.
* **AutoTool stole your weapon.** Looking at a stone wall mid-fight swapped your
  sword for a pickaxe. Swords, bows, crossbows, tridents, shields, buckets,
  spawn eggs and anything else listed in `autotool.keepHeld` are now left alone,
  and the previous slot is restored when you look away — unless you changed
  slots yourself in the meantime, in which case the pack backs off.
* **AutoTool preferred gold over stone.** The material ranking was ordered by
  mining *speed*, but gold harvests at wood level: aiming at diamond ore made
  the pack hand you a golden pickaxe, which breaks the block and drops nothing.
  Tiers are ranked by harvest level now (netherite → diamond → iron → copper →
  stone → gold → wood).
* **Dynamic light lit up things that do not glow.** Detection matched
  substrings, so a torchflower, torchflower seeds, magma cream and an unlit
  candle all counted as light sources. The list is explicit now.
* **VeinMiner treated decorative blocks as ore.** `quartz_block` and
  `coal_block` were in the keyword list, so mining a quartz wall vein-mined the
  build. Only real ores, ancient debris and the raw storage blocks are matched;
  the list is configurable (`vein.extraBlocks`).
* **TreeCapitator fired bare-handed.** Punching a single log felled a whole
  jungle giant. An axe is now required (`tree.requireAxe`), sneaking breaks a
  single log, and creative mode is skipped.
* **The emerald pickaxe skipped the wrong blocks.** The skip list matched raw
  substrings: `water` also caught `waterlily`. Matching is now done on whole id
  segments, and the list covers every container, spawner and unbreakable block.
* **Glowing arrows put each other out.** Two arrows landing on the same block
  shared one timer, so the first to expire removed the light both were using.
  Active lights are tracked and capped (`arrows.maxActive`), and arrows fired by
  mobs are ignored by default.

### Added

* **Full English/French localisation.** Every player-facing string is sent as a
  `RawMessage` translation key resolved on each client, so a French player and
  an English player on the same server each read their own language.
  `PSU_RP/texts/{en_US,fr_FR}.lang`, plus `pack.name` / `pack.description` for
  both packs so the pack list itself is translated. Adding a language is one
  `.lang` file and one line in `languages.json` — no code change.
* **Item names are translation keys** instead of hard-coded French strings.
* **`/scriptevent psu:cleanlight`** removes stray light blocks left behind by a
  crash.
* **English command aliases** next to the French ones: `psu:help`, `psu:death`,
  `psu:sort`, `psu:trash`, `psu:light`. The old names still work.
* **Ore experience on vein mining** (`vein.giveXp`).
* **Compatibility recipes** for `replaceVanilla` mode: repeater, comparator and
  redstone lamp, on top of the lantern / soul lantern / soul torch /
  jack o'lantern ones already present.
* **A recycling recipe for the emerald pickaxe** (→ 1 emerald), which was the
  only piece of gear without one.
* **`tools/validate.py`** — 780+ structural checks over the whole add-on.
* **`tools/test_scripts.mjs`** — 37 tests that load and run the real scripts
  against a stub of `@minecraft/server`, including a regression test for every
  data-loss bug above.
* **`tools/generate_items.py`** — the 18 light twins, their attachables and the
  texture atlas are generated from one table (`assets/light_sources.json`), so
  the five files that had to agree can no longer drift apart.
* **`tools/build.py`** — validates, tests, then packages the `.mcaddon`.
* **`tools/make_assets.py`** — rebuilds the flipbook sheet and the pack icons.

### Changed

* **The animated axe icon was rebuilt** from the seven supplied tier renders
  (wood → stone → copper → iron → gold → diamond → netherite) into a clean
  16×112 flipbook strip. The frames are kept in `assets/frames/`.
* **The pack icon is a new 256×256 render** (was 128×128), used by both packs.
* **`sea_lantern` and `magma` now animate correctly.** Their vanilla textures
  are flipbook strips; used as a plain atlas alias they showed the whole strip
  squashed into one icon. They get their own flipbook declaration, and no
  attachable — a flat attachable quad cannot play a flipbook, so the default
  item sprite renderer is used in hand instead.
* **The 18 light twins no longer appear in the creative menu.** They are created
  by the script when an item moves to the off-hand; listing 18 duplicate torches
  under Construction was noise. Re-add `menu_category` in
  `tools/generate_items.py` to bring them back.
* **Leather recycling is furnace-only.** A blast furnace is for metals.
* **`utils.js` and `qolutils.js` are merged.** They carried two near-identical
  copies of the durability code.
* **API compatibility is isolated** in `scripts/compat.js`: `isValid` as method
  vs property, `selectedSlot` vs `selectedSlotIndex`, `runCommand` vs
  `runCommandAsync`, lower-case vs capitalised `GameMode` values.
* **The module list is a registry.** The v3.5 hard-coded `TOTAL = 17` could
  drift from the real count; the count and the diagnostics now come from the
  registry, which also reports modules that are *off* separately from modules
  that *failed*.
* **Empty `catch {}` blocks carry a comment** saying what is being swallowed.
* **`README.txt` became `README.md` / `README.fr.md`** with an install guide,
  a module table, the configuration reference and the known engine limits.

### Kept from 3.4 / 3.5

Both headline fixes from the previous releases are preserved and now covered by
tests:

* the off-hand swap writes to the off-hand **first**, reads the slot back, and
  only touches the main hand once the item was accepted — so a refused item is
  never destroyed;
* `getBlock()` / `setType()` are given a strict `Vector3`. The old
  `{ x, y, z, dim }` object made the native conversion throw, the exception was
  swallowed, and no light block was ever placed. `compat.vec3()` enforces it,
  and the mock in the test suite rejects a malformed vector exactly like the
  engine does.

---

## [3.5] — Previous release

Twelve comfort modules: death marker, auto replant, double doors, anvil repair,
anti-griefing, glowing arrows, silk spawner, sorter, autotool, trash, recycling
recipes, emerald pickaxe.

## [3.4]

Attachables so an item renders identically in both hands; flipbook animated
icon; off-hand item-loss fix; dynamic light `Vector3` fix.
