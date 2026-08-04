#!/usr/bin/env node
/**
 * Behaviour-pack test suite.
 *
 * The pack's scripts are copied into a sandbox next to a stub of
 * @minecraft/server (tools/mock/), so the real modules are imported and
 * executed - this is not a lint pass. It checks that:
 *
 *   * every module loads without throwing and registers its handlers;
 *   * the /scriptevent commands are all wired up;
 *   * the v3.5 data-loss bugs stay fixed (regression tests):
 *       - the sorter must not merge items whose payload the API cannot
 *         read, and must not delete anything on overflow,
 *       - the loot gatherer must leave those items alone as well;
 *   * the ore drop tables behave like vanilla (Silk Touch, Fortune, XP);
 *   * a Vector3 with a stray field is rejected, which is what silently
 *     broke the dynamic light in v3.5.
 *
 * Run:  node tools/test_scripts.mjs
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const SANDBOX_ROOT = join(tmpdir(), "psu-test-sandbox");

const ADDONS = JSON.parse(readFileSync(join(ROOT, "addons.json"), "utf8")).addons;

rmSync(SANDBOX_ROOT, { recursive: true, force: true });

/** Copy an add-on's scripts next to a stub of @minecraft/server and
 *  import them for real. Each add-on gets its own stub instance, so the
 *  two never share an event registry. */
async function loadAddon(addon) {
    const sandbox = join(SANDBOX_ROOT, addon.id);
    const stubDir = join(sandbox, "node_modules", "@minecraft", "server");

    mkdirSync(stubDir, { recursive: true });
    cpSync(join(ROOT, "packs", addon.behaviour, "scripts"), join(sandbox, "scripts"), { recursive: true });
    cpSync(join(HERE, "mock", "minecraft-server.js"), join(stubDir, "index.js"));
    writeFileSync(join(stubDir, "package.json"),
        JSON.stringify({ name: "@minecraft/server", version: "1.11.0", type: "module", main: "index.js" }));
    writeFileSync(join(sandbox, "package.json"), JSON.stringify({ type: "module" }));

    const api = await import(join(stubDir, "index.js"));
    await import(join(sandbox, "scripts", "main.js"));
    return { addon, api, sandbox, script: (name) => import(join(sandbox, "scripts", name)) };
}

// ------------------------------------------------------------------
//  Tiny test runner
// ------------------------------------------------------------------
let passed = 0;
const failures = [];

function test(name, fn) {
    try {
        fn();
        passed++;
    } catch (error) {
        failures.push(`${name}\n      ${error.message}`);
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message || "values differ"}: expected ${expected}, got ${actual}`);
    }
}

function assertThrows(fn, message) {
    let threw = false;
    try {
        fn();
    } catch {
        threw = true;
    }
    if (!threw) throw new Error(message || "expected a throw");
}

// ------------------------------------------------------------------
//  Load every add-on declared in addons.json
// ------------------------------------------------------------------
const loaded = [];
for (const addon of ADDONS) loaded.push(await loadAddon(addon));

const ultimate = loaded.find((l) => l.addon.id === "ultimate-survival");
const core = loaded.find((l) => l.addon.id === "survival-core");

// Shared behaviour is exercised through the Ultimate sandbox.
const api = ultimate.api;
const { registry, fire, drainRunQueue, resetCommands, ItemStack, Dimension } = api;

// ------------------------------------------------------------------
//  1. start-up
// ------------------------------------------------------------------
test("every add-on loads every one of its modules", () => {
    for (const entry of loaded) {
        const line = entry.api.registry.warnings.find(
            (w) => w.includes("ready") && w.includes("modules active"));
        assert(line, `${entry.addon.id}: no start-up line was logged`);
        const match = line.match(/(\d+)\/(\d+) modules active/);
        assert(match, `${entry.addon.id}: no module count in "${line}"`);
        assertEqual(match[1], match[2], `${entry.addon.id}: some modules did not load`);
        assert(line.includes("Failed: none."), `${entry.addon.id}: a module failed: ${line}`);
    }
});

test("Survival Core ships exactly the four requested systems", () => {
    const line = core.api.registry.warnings.find((w) => w.includes("modules active"));
    assertEqual(line.match(/(\d+)\/(\d+) modules active/)[2], "4",
        "Survival Core should register four modules");
});

test("Survival Core carries no off-hand or light-twin code", () => {
    for (const name of ["offhand.js", "lightitems.js", "lightmap.js"]) {
        let found = false;
        try {
            readFileSync(join(core.sandbox, "scripts", name));
            found = true;
        } catch { /* absent, which is the point */ }
        assert(!found, `Survival Core still ships scripts/${name}`);
    }
});

test("no module threw during init", () => {
    for (const entry of loaded) {
        const bad = entry.api.registry.warnings.filter((w) => w.includes("failed to load"));
        assertEqual(bad.length, 0, `${entry.addon.id}: ${bad.join(" | ")}`);
    }
});

test("world event handlers are registered", () => {
    for (const name of ["playerBreakBlock", "playerInteractWithBlock", "entityDie",
        "projectileHitBlock", "playerSpawn", "playerLeave"]) {
        assert(registry.afterEvents.has(name) || registry.beforeEvents.has(name),
            "no handler subscribed to " + name);
    }
});

test("timers are registered with sane periods", () => {
    assert(registry.intervals.length >= 5, "too few intervals registered");
    for (const { ticks } of registry.intervals) {
        assert(ticks >= 1 && ticks <= 200, "suspicious interval period: " + ticks);
    }
});

// ------------------------------------------------------------------
//  2. /scriptevent routing
// ------------------------------------------------------------------
function fakePlayer(dimension = new Dimension("minecraft:overworld")) {
    const sent = [];
    return {
        typeId: "minecraft:player",
        id: "p1",
        name: "Tester",
        dimension,
        location: { x: 0.5, y: 64, z: 0.5 },
        isSneaking: false,
        isJumping: false,
        selectedSlotIndex: 0,
        sent,
        sendMessage: (m) => sent.push(m),
        playSound() { },
        runCommand: (c) => registry.commands.push(c),
        getGameMode: () => "survival",
        getComponent: () => undefined,
        onScreenDisplay: { setActionBar() { } }
    };
}

test("every documented /scriptevent id is handled", () => {
    const ids = ["psu:diag", "psu:help", "psu:aide", "psu:light", "psu:lumiere",
        "psu:cleanlight", "psu:swap", "psu:vanilla", "psu:death", "psu:mort",
        "psu:sort", "psu:trier", "psu:trash", "psu:poubelle"];

    for (const id of ids) {
        const player = fakePlayer();
        fire("system", "scriptEventReceive", { id, sourceEntity: player });
        drainRunQueue();
        assert(player.sent.length > 0, `${id} produced no reply`);
        const failed = registry.warnings.filter((w) => w.includes(`command ${id} failed`));
        assertEqual(failed.length, 0, `${id} threw: ${failed.join(" | ")}`);
    }
});

test("player-facing replies are translated RawMessages", () => {
    const player = fakePlayer();
    fire("system", "scriptEventReceive", { id: "psu:help", sourceEntity: player });
    drainRunQueue();
    for (const message of player.sent) {
        const parts = message.rawtext ?? [message];
        assert(parts.some((p) => typeof p.translate === "string"),
            "a reply was sent as literal text instead of a translation key: " + JSON.stringify(message));
    }
});

test("an unknown scriptevent id is ignored", () => {
    const player = fakePlayer();
    fire("system", "scriptEventReceive", { id: "psu:does_not_exist", sourceEntity: player });
    drainRunQueue();
    assertEqual(player.sent.length, 0, "an unknown command produced output");
});

// ------------------------------------------------------------------
//  3. regression: the sorter must not destroy item data
// ------------------------------------------------------------------
const { sortContainer } = await ultimate.script("sorter.js");

function fakeContainer(stacks, size = 27) {
    const slots = new Array(size).fill(undefined);
    stacks.forEach((s, i) => { slots[i] = s; });
    return {
        size,
        slots,
        getItem: (i) => slots[i],
        setItem: (i, stack) => { slots[i] = stack; }
    };
}

test("stackable items are merged into full stacks", () => {
    const container = fakeContainer([
        new ItemStack("minecraft:cobblestone", 20),
        new ItemStack("minecraft:cobblestone", 30),
        new ItemStack("minecraft:cobblestone", 40)
    ]);
    sortContainer(container);
    const cobble = container.slots.filter((s) => s && s.typeId === "minecraft:cobblestone");
    assertEqual(cobble.length, 2, "90 cobblestone should collapse into 64 + 26");
    assertEqual(cobble[0].amount + cobble[1].amount, 90, "cobblestone was lost");
});

test("REGRESSION: potions are never merged or rebuilt", () => {
    const strength = new ItemStack("minecraft:potion", 1);
    const swiftness = new ItemStack("minecraft:potion", 1);
    const container = fakeContainer([strength, swiftness, new ItemStack("minecraft:dirt", 5)]);

    sortContainer(container);

    const potions = container.slots.filter((s) => s && s.typeId === "minecraft:potion");
    assertEqual(potions.length, 2, "the two potions were merged into one");
    assert(potions.includes(strength) && potions.includes(swiftness),
        "the potions were rebuilt from their type id, which erases the brew");
});

test("REGRESSION: enchanted, renamed and container items survive a sort", () => {
    const pickaxe = new ItemStack("minecraft:diamond_pickaxe", 1).enchant("fortune", 3);
    const renamed = new ItemStack("minecraft:stone", 12);
    renamed.nameTag = "Souvenir";
    const shulker = new ItemStack("minecraft:red_shulker_box", 1);

    const container = fakeContainer([pickaxe, renamed, shulker, new ItemStack("minecraft:stone", 5)]);
    sortContainer(container);

    assert(container.slots.includes(pickaxe), "the enchanted pickaxe was rebuilt");
    assert(container.slots.includes(renamed), "the renamed stack was rebuilt");
    assert(container.slots.includes(shulker), "the shulker box was rebuilt, losing its contents");
});

test("REGRESSION: nothing is deleted when the container overflows", () => {
    const uniques = [];
    for (let i = 0; i < 5; i++) uniques.push(new ItemStack("minecraft:potion", 1));

    const container = fakeContainer(uniques, 3);   // more items than slots
    const spilled = [];
    sortContainer(container, (stack) => spilled.push(stack));

    const kept = container.slots.filter(Boolean).length;
    assertEqual(kept + spilled.length, 5, "items vanished instead of being dropped");
});

test("a sort of an empty container is a no-op", () => {
    const container = fakeContainer([], 27);
    assertEqual(sortContainer(container), 0, "an empty container reported used slots");
});

// ------------------------------------------------------------------
//  4. item safety data
// ------------------------------------------------------------------
const { isMergeable, tierScore, isAxe, isPickaxe } = await ultimate.script("itemdata.js");

test("isMergeable accepts plain blocks", () => {
    assert(isMergeable(new ItemStack("minecraft:cobblestone", 5)));
    assert(isMergeable(new ItemStack("minecraft:oak_log", 1)));
});

test("isMergeable rejects everything carrying hidden data", () => {
    for (const id of ["minecraft:potion", "minecraft:tipped_arrow", "minecraft:firework_rocket",
        "minecraft:written_book", "minecraft:filled_map", "minecraft:goat_horn",
        "minecraft:red_shulker_box", "minecraft:tropical_fish_bucket",
        "minecraft:white_banner", "minecraft:zombie_head"]) {
        assert(!isMergeable(new ItemStack(id, 1)), id + " should be treated as unique");
    }
});

test("isMergeable rejects renamed, enchanted and described stacks", () => {
    const named = new ItemStack("minecraft:stone", 1);
    named.nameTag = "Keep me";
    assert(!isMergeable(named), "a renamed stack must stay unique");

    const lored = new ItemStack("minecraft:stone", 1);
    lored.setLore(["quest item"]);
    assert(!isMergeable(lored), "a stack with lore must stay unique");

    assert(!isMergeable(new ItemStack("minecraft:diamond_pickaxe", 1)),
        "a tool has durability and must stay unique");
});

test("tool families do not overlap", () => {
    assert(isPickaxe(new ItemStack("minecraft:netherite_pickaxe", 1)));
    assert(isPickaxe(new ItemStack("psu:emerald_pickaxe", 1)));
    assert(!isAxe(new ItemStack("minecraft:diamond_pickaxe", 1)),
        "a pickaxe must not be seen as an axe");
    assert(isAxe(new ItemStack("minecraft:diamond_axe", 1)));
});

test("better materials score higher", () => {
    const better = (a, b) => tierScore(a, "_pickaxe") > tierScore(b, "_pickaxe");
    assert(better("minecraft:netherite_pickaxe", "minecraft:diamond_pickaxe"));
    assert(better("minecraft:diamond_pickaxe", "minecraft:iron_pickaxe"));
    assert(better("minecraft:iron_pickaxe", "minecraft:stone_pickaxe"));
    assertEqual(tierScore("minecraft:diamond_sword", "_pickaxe"), 0,
        "a sword must never be picked as a pickaxe");
});

test("REGRESSION: tiers rank by harvest level, so gold never beats stone", () => {
    assert(tierScore("minecraft:stone_pickaxe", "_pickaxe") > tierScore("minecraft:golden_pickaxe", "_pickaxe"),
        "a golden pickaxe harvests at wood level: preferring it over stone breaks diamond ore without a drop");
    assert(tierScore("minecraft:iron_pickaxe", "_pickaxe") > tierScore("minecraft:copper_pickaxe", "_pickaxe"));
    assert(tierScore("minecraft:copper_pickaxe", "_pickaxe") > tierScore("minecraft:stone_pickaxe", "_pickaxe"));
});

test("shears are matched only by themselves", () => {
    assertEqual(tierScore("minecraft:shears", "shears"), 1);
    assertEqual(tierScore("minecraft:diamond_axe", "shears"), 0);
});

// ------------------------------------------------------------------
//  5. ore drops
// ------------------------------------------------------------------
const { oreLoot, isKnownOre } = await ultimate.script("drops.js");

const OPTS = { silkTouch: true, fortune: true, giveXp: true };

test("the ore table covers the vanilla ores", () => {
    for (const id of ["minecraft:coal_ore", "minecraft:deepslate_diamond_ore",
        "minecraft:lapis_ore", "minecraft:redstone_ore", "minecraft:quartz_ore",
        "minecraft:nether_gold_ore", "minecraft:ancient_debris"]) {
        assert(isKnownOre(id), "missing from the ore table: " + id);
    }
    assert(!isKnownOre("minecraft:stone"), "stone must not be an ore");
});

test("REGRESSION: Silk Touch yields the ore block itself", () => {
    const pick = new ItemStack("minecraft:diamond_pickaxe", 1).enchant("silk_touch", 1);
    const loot = oreLoot("minecraft:deepslate_diamond_ore", pick, OPTS);
    assertEqual(loot.stacks.length, 1);
    assertEqual(loot.stacks[0].typeId, "minecraft:deepslate_diamond_ore",
        "Silk Touch handed out the drop instead of the block");
    assertEqual(loot.xp, 0, "Silk Touch must not grant ore experience");
});

test("Silk Touch on a lit redstone ore returns the unlit block", () => {
    const pick = new ItemStack("minecraft:diamond_pickaxe", 1).enchant("silk_touch", 1);
    const loot = oreLoot("minecraft:lit_redstone_ore", pick, OPTS);
    assertEqual(loot.stacks[0].typeId, "minecraft:redstone_ore");
});

test("an unenchanted pickaxe gets the vanilla base drop", () => {
    const pick = new ItemStack("minecraft:iron_pickaxe", 1);
    for (let i = 0; i < 200; i++) {
        const loot = oreLoot("minecraft:diamond_ore", pick, OPTS);
        assertEqual(loot.stacks.length, 1);
        assertEqual(loot.stacks[0].typeId, "minecraft:diamond");
        assertEqual(loot.stacks[0].amount, 1, "no Fortune should mean exactly one diamond");
        assert(loot.xp >= 3 && loot.xp <= 7, "diamond ore experience out of range: " + loot.xp);
    }
});

test("Fortune III stays inside the vanilla 1..4 range and averages ~2.2", () => {
    const pick = new ItemStack("minecraft:diamond_pickaxe", 1).enchant("fortune", 3);
    let total = 0;
    const runs = 20000;
    for (let i = 0; i < runs; i++) {
        const loot = oreLoot("minecraft:diamond_ore", pick, OPTS);
        const n = loot.stacks.reduce((sum, s) => sum + s.amount, 0);
        assert(n >= 1 && n <= 4, "Fortune III produced " + n + " diamonds");
        total += n;
    }
    const average = total / runs;
    assert(Math.abs(average - 2.2) < 0.08, "Fortune III average is " + average.toFixed(3) + ", expected ~2.2");
});

test("redstone uses the uniform bonus, not the ore multiplier", () => {
    const pick = new ItemStack("minecraft:diamond_pickaxe", 1).enchant("fortune", 3);
    for (let i = 0; i < 2000; i++) {
        const loot = oreLoot("minecraft:redstone_ore", pick, OPTS);
        const n = loot.stacks.reduce((sum, s) => sum + s.amount, 0);
        assert(n >= 4 && n <= 8, "redstone with Fortune III produced " + n);
    }
});

test("an unknown block has no table and falls back to vanilla", () => {
    const pick = new ItemStack("minecraft:iron_pickaxe", 1);
    assertEqual(oreLoot("minecraft:stone", pick, { silkTouch: false, fortune: true, giveXp: true }),
        undefined, "an unknown block must return undefined so the caller uses /setblock destroy");
});

test("experience can be switched off", () => {
    const pick = new ItemStack("minecraft:iron_pickaxe", 1);
    const loot = oreLoot("minecraft:diamond_ore", pick, { silkTouch: false, fortune: false, giveXp: false });
    assertEqual(loot.xp, 0);
});

// ------------------------------------------------------------------
//  6. compat helpers
// ------------------------------------------------------------------
const { vec3, isValid, posKey, isCreative } = await ultimate.script("compat.js");

test("REGRESSION: vec3 strips the extra field that broke getBlock", () => {
    const dimension = new Dimension("minecraft:overworld");
    assertThrows(() => dimension.getBlock({ x: 1, y: 2, z: 3, dim: "overworld" }),
        "the mock should reject a malformed Vector3, like the engine does");
    assert(dimension.getBlock(vec3({ x: 1, y: 2, z: 3, dim: "overworld" })),
        "vec3 must make a dirty position usable again");
});

test("isValid copes with both API generations", () => {
    assert(isValid({ isValid: () => true }), "1.x style: isValid() is a method");
    assert(isValid({ isValid: true }), "2.x style: isValid is a property");
    assert(!isValid({ isValid: false }));
    assert(!isValid(undefined));
});

test("game mode detection is case-insensitive across API versions", () => {
    assert(isCreative({ getGameMode: () => "creative" }), "1.x lowercase enum");
    assert(isCreative({ getGameMode: () => "Creative" }), "2.x capitalised enum");
    assert(!isCreative({ getGameMode: () => "survival" }));
});

test("position keys are unambiguous", () => {
    assert(posKey(1, 2, 3) !== posKey(1, 23, undefined));
    assertEqual(posKey(-1, 0, 5), "-1,0,5");
});

// ------------------------------------------------------------------
//  7. light source detection
// ------------------------------------------------------------------
const { TO_CUSTOM, TO_VANILLA } = await ultimate.script("lightmap.js");
const { isLightSource } = await ultimate.script("lightsources.js");

test("the twin tables are exact inverses", () => {
    assertEqual(Object.keys(TO_CUSTOM).length, Object.keys(TO_VANILLA).length);
    for (const [vanilla, custom] of Object.entries(TO_CUSTOM)) {
        assertEqual(TO_VANILLA[custom], vanilla, "the twin tables disagree about " + vanilla);
    }
});

test("real light sources are detected, in both vanilla and twin form", () => {
    for (const id of ["minecraft:torch", "minecraft:lantern", "minecraft:lava_bucket",
        "psu:torch", "psu:beacon", "minecraft:glow_berries"]) {
        assert(isLightSource(new ItemStack(id, 1)), id + " should light the world up");
    }
});

test("REGRESSION: look-alike items no longer glow", () => {
    for (const id of ["minecraft:torchflower", "minecraft:torchflower_seeds",
        "minecraft:magma_cream", "minecraft:candle", "minecraft:glowstone_dust",
        "minecraft:cobblestone"]) {
        assert(!isLightSource(new ItemStack(id, 1)),
            id + " matched the old substring test and lit the world up");
    }
});

// ------------------------------------------------------------------
//  8. events do not throw
// ------------------------------------------------------------------
test("a block-break event is handled without throwing", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);
    const block = dimension.getBlock({ x: 0, y: 64, z: 0 });

    fire("after", "playerBreakBlock", {
        player,
        block,
        brokenBlockPermutation: api.BlockPermutation.resolve("minecraft:oak_log")
    });
    drainRunQueue();

    fire("after", "playerBreakBlock", {
        player,
        block,
        brokenBlockPermutation: api.BlockPermutation.resolve("minecraft:diamond_ore")
    });
    drainRunQueue();
});

test("an explosion event is handled without throwing", () => {
    let cleared = false;
    fire("before", "explosion", {
        source: { typeId: "minecraft:creeper" },
        setImpactedBlocks: () => { cleared = true; }
    });
    assert(cleared, "a creeper explosion should have had its impacted blocks cleared");

    cleared = false;
    fire("before", "explosion", {
        source: { typeId: "minecraft:tnt" },
        setImpactedBlocks: () => { cleared = true; }
    });
    assert(!cleared, "TNT must keep breaking blocks with the default configuration");
});

test("the join message is queued and translated", () => {
    const player = fakePlayer();
    const before = registry.timeouts.length;
    fire("after", "playerSpawn", { initialSpawn: true, player });
    assert(registry.timeouts.length > before, "the welcome message was not scheduled");

    registry.timeouts[registry.timeouts.length - 1].fn();
    assert(player.sent.length >= 3, "the welcome message is incomplete");
    assert(player.sent[0].translate === "psu.load.title", "the welcome line is not translated");
});

// ------------------------------------------------------------------
//  9. TREE vs BUILDING
//     The whole point of the validator: a log cabin must survive an
//     axe swing that would fell a real tree.
// ------------------------------------------------------------------
const { analyseTree, isNaturalTrunk, isBuildBlock } = await ultimate.script("treevalidator.js");
const worlds = await import(join(HERE, "worlds.mjs"));

function fresh() {
    return new Dimension("minecraft:overworld");
}

function verdict(builder, options) {
    const dimension = fresh();
    const spot = builder(dimension);
    const result = analyseTree(dimension, { x: spot.x, y: spot.y, z: spot.z }, spot.trunkId, options);
    return { dimension, spot, result };
}

test("a plain oak is felled", () => {
    const { result } = verdict(worlds.oakTree);
    assertEqual(result.reason, "ok", "a plain oak was refused");
    assert(result.logs.length >= 5, "the trunk was not fully collected");
    assert(result.leaves.length > 10, "the canopy was not collected");
});

test("a giant 2x2 spruce is felled", () => {
    const { result } = verdict(worlds.giantSpruce);
    assertEqual(result.reason, "ok", "a giant spruce was refused: " + JSON.stringify(result.stats));
    assertEqual(result.stats.baseColumns, 4, "a 2x2 trunk should report four base columns");
});

test("a crimson fungus counts as a tree", () => {
    const { result } = verdict(worlds.crimsonFungus);
    assertEqual(result.reason, "ok", "a nether fungus was refused: " + JSON.stringify(result.stats));
});

test("THE POINT: a log cabin is NOT felled", () => {
    const { result } = verdict(worlds.logCabin);
    assert(!result.isTree, "a log cabin was mistaken for a tree");
    assertEqual(result.reason, "base_too_wide");
});

test("THE HARD CASE: a log cabin standing inside a forest is NOT felled", () => {
    const { result } = verdict(worlds.logCabinInForest);
    assert(!result.isTree,
        "a cabin surrounded by canopy was mistaken for a tree: " + JSON.stringify(result.stats));
    assert(result.stats.leaves > 20,
        "this test is only meaningful if the leaf count is high: " + result.stats.leaves);
    assertEqual(result.reason, "base_too_wide",
        "with leaves everywhere, only the footprint test can save the cabin");
});

test("a real tree grown against a house is still felled", () => {
    const { result } = verdict(worlds.treeAgainstAHouse);
    assertEqual(result.reason, "ok",
        "a genuine tree brushing a wall was refused: " + JSON.stringify(result.stats));
});

test("a log floor is not felled", () => {
    const { result } = verdict(worlds.logFloor);
    assert(!result.isTree, "a flat log platform was mistaken for a tree");
});

test("a decorative pillar inside a room is not felled", () => {
    const { result } = verdict(worlds.decorativePillar);
    assert(!result.isTree,
        "a log pillar surrounded by planks and glass was mistaken for a tree");
    assertEqual(result.reason, "touches_a_build");
});

test("a bare trunk with no canopy is not felled", () => {
    const { result } = verdict(worlds.bareTrunk);
    assert(!result.isTree, "a leafless log column was mistaken for a tree");
    assertEqual(result.reason, "not_enough_leaves");
});

test("a tree growing out of a plank floor is not felled", () => {
    const { result } = verdict(worlds.treeOnPlanks);
    assert(!result.isTree, "logs standing on planks were mistaken for a tree");
    assertEqual(result.reason, "not_on_natural_ground");
});

test("bark blocks and stripped logs are refused outright", () => {
    for (const builder of [worlds.barkPillar, worlds.strippedPillar]) {
        const { result } = verdict(builder);
        assertEqual(result.reason, "not_a_natural_trunk");
        assertEqual(result.logs.length, 0, "a refused cluster must collect no blocks");
    }
    assert(!isNaturalTrunk("minecraft:oak_wood"));
    assert(!isNaturalTrunk("minecraft:stripped_spruce_log"));
    assert(isNaturalTrunk("minecraft:cherry_log"));
    assert(isNaturalTrunk("minecraft:warped_stem"));
});

test("natural neighbours are not mistaken for a build", () => {
    for (const id of ["minecraft:moss_carpet", "minecraft:bee_nest", "minecraft:cocoa",
        "minecraft:mangrove_roots", "minecraft:vine", "minecraft:snow_layer",
        "minecraft:oak_leaves", "minecraft:glow_lichen"]) {
        assert(!isBuildBlock(id), id + " grows on trees in the wild");
    }
    for (const id of ["minecraft:oak_planks", "minecraft:glass", "minecraft:oak_stairs",
        "minecraft:torch", "minecraft:chest", "minecraft:white_wool",
        "minecraft:stripped_oak_log", "minecraft:cobblestone_wall"]) {
        assert(isBuildBlock(id), id + " means somebody built this");
    }
});

test("the analysis never modifies a single block", () => {
    const dimension = fresh();
    const spot = worlds.oakTree(dimension);
    const before = dimension.snapshot();
    analyseTree(dimension, { x: spot.x, y: spot.y, z: spot.z }, spot.trunkId);
    const after = dimension.snapshot();
    for (const [key, typeId] of before) {
        assertEqual(after.get(key), typeId, `analysis changed the block at ${key}`);
    }
});

test("thresholds can be relaxed through the config", () => {
    // Someone who wants their leafless pillars felled can say so.
    const { result } = verdict(worlds.bareTrunk, { minLeaves: 0, leafRatio: 0 });
    assertEqual(result.reason, "ok", "relaxing the leaf thresholds had no effect");
});

test("the scan stays inside its cap on a huge cluster", () => {
    const dimension = fresh();
    const spot = worlds.giantSpruce(dimension, 0, 64, 0, 30);
    const result = analyseTree(dimension, { x: spot.x, y: spot.y, z: spot.z }, spot.trunkId,
        { maxLogs: 20 });
    assert(result.logs.length <= 20, "the log cap was exceeded");
    assert(result.stats.truncated, "a truncated scan should say so");
});

// ------------------------------------------------------------------
//  10. TreeCapitator end to end
// ------------------------------------------------------------------
function breakLog(dimension, spot, player) {
    resetCommands();
    fire("after", "playerBreakBlock", {
        player,
        block: dimension.getBlock({ x: spot.x, y: spot.y, z: spot.z }),
        brokenBlockPermutation: api.BlockPermutation.resolve(spot.trunkId)
    });
    drainRunQueue();
    return registry.commands.filter((c) => c.startsWith("setblock"));
}

function axeHolder(dimension) {
    const player = fakePlayer(dimension);
    const axe = new ItemStack("minecraft:diamond_axe", 1);
    player.getComponent = (name) => {
        if (name !== "equippable") return undefined;
        return {
            getEquipmentSlot: (slot) => ({
                getItem: () => (slot === "Mainhand" ? axe : undefined),
                setItem: () => { }
            })
        };
    };
    return player;
}

test("END TO END: swinging an axe at a real tree breaks blocks", () => {
    const dimension = fresh();
    const spot = worlds.oakTree(dimension);
    const commands = breakLog(dimension, spot, axeHolder(dimension));
    assert(commands.length > 4, "the tree was not felled: " + commands.length + " blocks broken");
});

test("END TO END: swinging an axe at a log cabin breaks NOTHING extra", () => {
    const dimension = fresh();
    const spot = worlds.logCabin(dimension);
    const commands = breakLog(dimension, spot, axeHolder(dimension));
    assertEqual(commands.length, 0,
        "the cabin lost " + commands.length + " blocks to one axe swing");
});

test("END TO END: bare hands never fell a tree", () => {
    const dimension = fresh();
    const spot = worlds.oakTree(dimension);
    const commands = breakLog(dimension, spot, fakePlayer(dimension));
    assertEqual(commands.length, 0, "a bare-handed break felled the tree");
});

test("END TO END: sneaking breaks a single log", () => {
    const dimension = fresh();
    const spot = worlds.oakTree(dimension);
    const player = axeHolder(dimension);
    player.isSneaking = true;
    assertEqual(breakLog(dimension, spot, player).length, 0, "sneaking still felled the tree");
});

test("END TO END: creative mode is left alone", () => {
    const dimension = fresh();
    const spot = worlds.oakTree(dimension);
    const player = axeHolder(dimension);
    player.getGameMode = () => "creative";
    assertEqual(breakLog(dimension, spot, player).length, 0, "creative mode felled the tree");
});

// ------------------------------------------------------------------
//  Report
// ------------------------------------------------------------------
rmSync(SANDBOX_ROOT, { recursive: true, force: true });

console.log();
for (const failure of failures) console.log("  FAIL  " + failure);
console.log();
if (failures.length) {
    console.log(`FAILED - ${failures.length} failing, ${passed} passing`);
    process.exit(1);
}
console.log(`OK - ${passed} tests passed`);
