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
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const SANDBOX = join(tmpdir(), "psu-test-sandbox");

// ------------------------------------------------------------------
//  Sandbox: scripts/ + node_modules/@minecraft/server
// ------------------------------------------------------------------
rmSync(SANDBOX, { recursive: true, force: true });
mkdirSync(join(SANDBOX, "node_modules", "@minecraft", "server"), { recursive: true });
cpSync(join(ROOT, "packs", "PSU_BP", "scripts"), join(SANDBOX, "scripts"), { recursive: true });
cpSync(join(HERE, "mock", "minecraft-server.js"),
    join(SANDBOX, "node_modules", "@minecraft", "server", "index.js"));
writeFileSync(join(SANDBOX, "node_modules", "@minecraft", "server", "package.json"),
    JSON.stringify({ name: "@minecraft/server", version: "1.11.0", type: "module", main: "index.js" }));
writeFileSync(join(SANDBOX, "package.json"), JSON.stringify({ type: "module" }));

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
//  Load
// ------------------------------------------------------------------
const api = await import(join(SANDBOX, "node_modules", "@minecraft", "server", "index.js"));
const { registry, fire, drainRunQueue, ItemStack, Dimension } = api;

await import(join(SANDBOX, "scripts", "main.js"));

const startupLine = registry.warnings.find((w) => w.includes("[PSU]") && w.includes("ready"));

// ------------------------------------------------------------------
//  1. start-up
// ------------------------------------------------------------------
test("every module loads", () => {
    assert(startupLine, "no start-up line was logged");
    const match = startupLine.match(/(\d+)\/(\d+) modules active/);
    assert(match, "start-up line has no module count: " + startupLine);
    assertEqual(match[1], match[2], "some modules did not load");
    assert(startupLine.includes("Failed: none."), "a module failed: " + startupLine);
});

test("no module threw during init", () => {
    const bad = registry.warnings.filter((w) => w.includes("failed to load"));
    assertEqual(bad.length, 0, "modules failed: " + bad.join(" | "));
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
const { sortContainer } = await import(join(SANDBOX, "scripts", "sorter.js"));

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
const { isMergeable, tierScore, isAxe, isPickaxe } = await import(join(SANDBOX, "scripts", "itemdata.js"));

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
const { oreLoot, isKnownOre } = await import(join(SANDBOX, "scripts", "drops.js"));

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
const { vec3, isValid, posKey, isCreative } = await import(join(SANDBOX, "scripts", "compat.js"));

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
const { isLightSource, TO_CUSTOM, TO_VANILLA } = await import(join(SANDBOX, "scripts", "lightmap.js"));

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
//  Double doors
//
//  Regression cover for the two v4.0 bugs that made the module a no-op:
//  the hinge was read off the lower half (where both leaves report the
//  same value), and the twin was only ever looked for along the axis the
//  direction table said to use.
// ------------------------------------------------------------------
function placeDoor(dimension, { x, y, z }, { facing = 0, open = false, hinge = false }) {
    const lower = dimension.getBlock({ x, y, z });
    lower.setPermutation(api.BlockPermutation.resolve("minecraft:oak_door", {
        direction: facing,
        open_bit: open,
        upper_block_bit: false,
        // The trap: on a real door the lower half does not carry a
        // meaningful hinge, so both leaves of a pair look identical here.
        door_hinge_bit: false
    }));

    const upper = dimension.getBlock({ x, y: y + 1, z });
    upper.setPermutation(api.BlockPermutation.resolve("minecraft:oak_door", {
        direction: facing,
        open_bit: open,
        upper_block_bit: true,
        door_hinge_bit: hinge
    }));

    return { lower, upper };
}

function openedState(door) {
    return door.lower.permutation.getState("open_bit");
}

/** Click `block`, let the deferred system.run() fire, return the sound log. */
function interact(player, block) {
    const before = registry.sounds.length;
    fire("after", "playerInteractWithBlock", { player, block });
    drainRunQueue();
    return registry.sounds.slice(before);
}

test("double doors: the twin opens even though both lower halves share a hinge value", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    // Facing east (0): the pair sits along Z.
    const left = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, hinge: false });
    const right = placeDoor(dimension, { x: 0, y: 64, z: 1 }, { facing: 0, hinge: true });

    // The player opened the left leaf; the engine has already flipped it.
    left.lower.setPermutation(left.lower.permutation.withState("open_bit", true));

    interact(player, left.lower);
    assert(openedState(right) === true,
        "the second leaf stayed shut - the hinge is being read off the lower half again");
});

test("double doors: closing one leaf closes the other", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    const left = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, open: true, hinge: false });
    const right = placeDoor(dimension, { x: 0, y: 64, z: 1 }, { facing: 0, open: true, hinge: true });

    left.lower.setPermutation(left.lower.permutation.withState("open_bit", false));

    interact(player, left.lower);
    assert(openedState(right) === false, "the second leaf stayed open");
});

test("double doors: two doors sharing a hinge are not a pair", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    const left = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, hinge: true });
    const right = placeDoor(dimension, { x: 0, y: 64, z: 1 }, { facing: 0, hinge: true });

    left.lower.setPermutation(left.lower.permutation.withState("open_bit", true));

    interact(player, left.lower);
    assert(openedState(right) === false,
        "two same-hinge doors side by side must stay independent");
});

test("double doors: a different door type next door is left alone", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    const left = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, hinge: false });
    const right = placeDoor(dimension, { x: 0, y: 64, z: 1 }, { facing: 0, hinge: true });
    right.lower.setPermutation(
        api.BlockPermutation.resolve("minecraft:spruce_door", right.lower.permutation._states));

    left.lower.setPermutation(left.lower.permutation.withState("open_bit", true));

    interact(player, left.lower);
    assert(openedState(right) === false, "an oak door must not drive a spruce door");
});

test("double doors: clicking the upper half still works", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    const left = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, hinge: false });
    const right = placeDoor(dimension, { x: 0, y: 64, z: 1 }, { facing: 0, hinge: true });

    left.lower.setPermutation(left.lower.permutation.withState("open_bit", true));

    interact(player, left.upper);
    assert(openedState(right) === true, "clicking the top of a door must resolve to its lower half");
});

test("double doors: the twin is found even when the direction table points the wrong way", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    // Facing 0 makes the module try the Z neighbours first; this pair is
    // along X, so it is only found by the all-four-sides fallback.
    const left = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, hinge: false });
    const right = placeDoor(dimension, { x: 1, y: 64, z: 0 }, { facing: 0, hinge: true });

    left.lower.setPermutation(left.lower.permutation.withState("open_bit", true));

    interact(player, left.lower);
    assert(openedState(right) === true,
        "a wrong direction->axis mapping must not be able to break the module");
});

test("double doors: the second leaf plays a door sound", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    const left = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, hinge: false });
    placeDoor(dimension, { x: 0, y: 64, z: 1 }, { facing: 0, hinge: true });

    left.lower.setPermutation(left.lower.permutation.withState("open_bit", true));

    const sounds = interact(player, left.lower);
    assert(sounds.some((s) => s.id === "open.door"), "no sound played for the second leaf");
});

test("double doors: a lone door does not throw", () => {
    const dimension = new Dimension("minecraft:overworld");
    const player = fakePlayer(dimension);

    const only = placeDoor(dimension, { x: 0, y: 64, z: 0 }, { facing: 0, hinge: false });
    only.lower.setPermutation(only.lower.permutation.withState("open_bit", true));

    interact(player, only.lower);   // throwing would fail the test outright
    assert(openedState(only) === true, "the clicked door must keep its own state");
});

// ------------------------------------------------------------------
//  Report
// ------------------------------------------------------------------
rmSync(SANDBOX, { recursive: true, force: true });

console.log();
for (const failure of failures) console.log("  FAIL  " + failure);
console.log();
if (failures.length) {
    console.log(`FAILED - ${failures.length} failing, ${passed} passing`);
    process.exit(1);
}
console.log(`OK - ${passed} tests passed`);
