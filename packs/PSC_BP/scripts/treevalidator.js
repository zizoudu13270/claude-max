// ============================================================
//  TREE VALIDATOR
//
//  The whole point of this module: tell a TREE apart from a
//  BUILDING made of logs, before a single block is broken.
//
//  A naive tree feller flood-fills every connected log. Break one
//  log of a log cabin and the cabin comes down. This one scans the
//  connected log cluster first, in read-only mode, scores it against
//  six independent signals, and only then hands the list of blocks
//  over to be destroyed.
//
//  Signals, from cheapest to most expensive:
//
//   1. TRUNK TYPE      vanilla trees are made of "<species>_log" or
//                      "<species>_stem" only. "oak_wood" (bark on all
//                      six sides) and every "stripped_*" variant are
//                      player-made by definition, so they are refused
//                      outright.
//   2. HEIGHT          a tree is at least `minHeight` blocks tall.
//                      A log floor is one block tall.
//   3. BASE FOOTPRINT  a trunk is 1x1, or 2x2 for a giant. A wall or
//                      a floor covers many columns on its lowest
//                      layer.
//   4. LEAVES          a tree carries leaves - counted in absolute
//                      terms AND as a ratio to the number of logs, so
//                      a big log cabin brushing against a forest
//                      canopy still fails.
//   5. BUILD CONTACT   logs touching planks, stairs, glass, a door, a
//                      torch... belong to a build. Natural neighbours
//                      (moss, vines, cocoa, bee nests, mangrove
//                      roots, snow) are whitelisted first.
//   6. NATURAL GROUND  the base of the trunk sits on dirt, grass,
//                      podzol, mud, nylium... not on planks or stone.
//
//  Every threshold is exposed in config.js, and
//  /scriptevent <ns>:tree prints the full verdict for the block you
//  are looking at, so the numbers can be tuned in game.
// ============================================================

import { posKey } from "./compat.js";

// ------------------------------------------------------------
//  Block classification
// ------------------------------------------------------------

/** Trunks a naturally generated tree can be made of. */
export function isNaturalTrunk(typeId) {
    if (typeof typeId !== "string") return false;
    if (typeId.includes("stripped_")) return false;   // always player-made
    if (typeId.endsWith("_wood") || typeId.endsWith("_hyphae")) return false;
    return typeId.endsWith("_log")
        || typeId.endsWith("_stem")
        || typeId === "minecraft:log"      // pre-flattening ids
        || typeId === "minecraft:log2";
}

export function isLeaf(typeId) {
    if (typeof typeId !== "string") return false;
    return typeId.endsWith("_leaves")
        || typeId === "minecraft:leaves"
        || typeId === "minecraft:leaves2"
        || typeId === "minecraft:nether_wart_block"      // crimson canopy
        || typeId === "minecraft:warped_wart_block"      // warped canopy
        || typeId === "minecraft:shroomlight";           // nether tree canopy
}

/** Leaves that belong to the same species as the trunk, where known.
 *  An unknown species falls back to "any leaf". */
const SPECIES_LEAVES = {
    "minecraft:oak_log": ["minecraft:oak_leaves", "minecraft:azalea_leaves", "minecraft:azalea_leaves_flowered", "minecraft:flowering_azalea_leaves"],
    "minecraft:spruce_log": ["minecraft:spruce_leaves"],
    "minecraft:birch_log": ["minecraft:birch_leaves"],
    "minecraft:jungle_log": ["minecraft:jungle_leaves"],
    "minecraft:acacia_log": ["minecraft:acacia_leaves"],
    "minecraft:dark_oak_log": ["minecraft:dark_oak_leaves"],
    "minecraft:mangrove_log": ["minecraft:mangrove_leaves"],
    "minecraft:cherry_log": ["minecraft:cherry_leaves"],
    "minecraft:pale_oak_log": ["minecraft:pale_oak_leaves"],
    "minecraft:crimson_stem": ["minecraft:nether_wart_block", "minecraft:shroomlight"],
    "minecraft:warped_stem": ["minecraft:warped_wart_block", "minecraft:shroomlight"]
};

/** Blocks that mean "somebody built this".
 *
 *  Matched as substrings, so the list has to be checked against natural
 *  blocks - "stairs" contains "air", which is exactly the kind of trap
 *  this pack keeps running into. The rule: only add a fragment here that
 *  cannot appear inside a naturally generated id, and put the handful of
 *  genuine collisions in NATURAL_EXCEPTIONS below. */
const BUILD_NEIGHBOURS = [
    "planks", "stairs", "slab", "fence", "door", "trapdoor", "glass", "pane",
    "wool", "carpet", "concrete", "terracotta", "brick", "wall", "ladder",
    "sign", "bed", "chest", "barrel", "crafting_table", "furnace", "bookshelf",
    "torch", "lantern", "campfire", "banner", "scaffolding", "beehive",
    "stripped_", "_wood", "_hyphae", "bamboo_block", "bamboo_mosaic",
    "polished", "chiseled", "cut_", "smooth_", "tiles", "glazed",
    "iron_block", "gold_block", "diamond_block", "emerald_block",
    "netherite_block", "copper_block", "redstone_block", "redstone_lamp",
    "shulker_box", "hopper", "dispenser", "dropper", "observer", "piston",
    "rail", "lever", "button", "pressure_plate", "note_block", "jukebox",
    "composter", "cauldron", "anvil", "grindstone", "smithing", "loom",
    "cartography", "fletching", "stonecutter", "lectern", "bell", "candle",
    "frame", "quartz_block", "purpur", "prismarine", "sea_lantern", "sponge",
    "tnt", "glowstone", "end_rod"
];

/** Natural blocks whose id collides with a fragment above. */
const NATURAL_EXCEPTIONS = new Set([
    "minecraft:moss_carpet",
    "minecraft:pale_moss_carpet"
]);

/** Ground a tree can actually grow out of. Exact ids: "stone" as a
 *  substring would happily accept stone bricks and a cobblestone wall. */
const NATURAL_GROUND = new Set([
    "minecraft:dirt", "minecraft:coarse_dirt", "minecraft:rooted_dirt",
    "minecraft:dirt_with_roots", "minecraft:grass_block", "minecraft:grass",
    "minecraft:grass_path", "minecraft:dirt_path", "minecraft:podzol",
    "minecraft:mycelium", "minecraft:farmland",
    "minecraft:moss_block", "minecraft:pale_moss_block",
    "minecraft:mud", "minecraft:muddy_mangrove_roots", "minecraft:mangrove_roots",
    "minecraft:clay", "minecraft:sand", "minecraft:red_sand", "minecraft:gravel",
    "minecraft:snow", "minecraft:snow_layer", "minecraft:water",
    "minecraft:crimson_nylium", "minecraft:warped_nylium", "minecraft:netherrack",
    "minecraft:soul_soil", "minecraft:soul_sand",
    // a trunk can also sit on the trunk of the tree below it on a slope
    "minecraft:moss_carpet", "minecraft:pale_moss_carpet"
]);

function matches(typeId, list) {
    return list.some((k) => typeId.includes(k));
}

export function isBuildBlock(typeId) {
    if (typeof typeId !== "string") return false;
    if (NATURAL_EXCEPTIONS.has(typeId)) return false;
    if (isLeaf(typeId) || isNaturalTrunk(typeId)) return false;
    return matches(typeId, BUILD_NEIGHBOURS);
}

export function isNaturalGround(typeId) {
    return typeof typeId === "string" && NATURAL_GROUND.has(typeId);
}

// ------------------------------------------------------------
//  Scan + verdict
// ------------------------------------------------------------

const NEIGHBOUR_OFFSETS = [];
for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
            if (dx || dy || dz) NEIGHBOUR_OFFSETS.push([dx, dy, dz]);
        }
    }
}

export const DEFAULT_LIMITS = {
    maxLogs: 600,
    maxRadius: 10,
    maxUp: 40,
    maxDown: 4,
    minHeight: 4,
    maxBaseColumns: 4,
    minLeaves: 5,
    leafRatio: 0.35,
    maxBuildContacts: 4,
    requireNaturalGround: true,
    matchSpecies: true
};

/**
 * Walk the connected log cluster and judge it.
 *
 * Read-only: it never modifies a block. Every position is fetched at
 * most once and classified on the spot, so counting leaves and build
 * contacts costs no extra getBlock calls.
 *
 * @returns {{
 *   isTree: boolean, reason: string,
 *   logs: {x:number,y:number,z:number}[],
 *   leaves: {x:number,y:number,z:number}[],
 *   stats: object
 * }}
 */
export function analyseTree(dimension, origin, trunkId, options = {}) {
    const limits = { ...DEFAULT_LIMITS, ...options };

    if (!isNaturalTrunk(trunkId)) {
        return refuse("not_a_natural_trunk", { trunkId });
    }

    const speciesLeaves = limits.matchSpecies ? SPECIES_LEAVES[trunkId] : undefined;

    const logs = [];
    const leaves = [];
    const visited = new Set([posKey(origin.x, origin.y, origin.z)]);
    const queue = [origin];

    let leafCount = 0;
    let speciesLeafCount = 0;
    let buildContacts = 0;
    let truncated = false;

    let minY = origin.y;
    let maxY = origin.y;

    while (queue.length > 0) {
        if (logs.length >= limits.maxLogs) {
            truncated = true;
            break;
        }

        const current = queue.shift();
        logs.push(current);
        if (current.y < minY) minY = current.y;
        if (current.y > maxY) maxY = current.y;

        for (const [dx, dy, dz] of NEIGHBOUR_OFFSETS) {
            const x = current.x + dx;
            const y = current.y + dy;
            const z = current.z + dz;

            if (Math.abs(x - origin.x) > limits.maxRadius) continue;
            if (Math.abs(z - origin.z) > limits.maxRadius) continue;
            if (y - origin.y > limits.maxUp || origin.y - y > limits.maxDown) continue;

            const key = posKey(x, y, z);
            if (visited.has(key)) continue;
            visited.add(key);

            let typeId;
            try {
                typeId = dimension.getBlock({ x, y, z })?.typeId;
            } catch {
                continue;   // unloaded chunk: treat as nothing
            }
            if (!typeId) continue;

            if (typeId === trunkId) {
                queue.push({ x, y, z });
                continue;
            }

            if (isLeaf(typeId)) {
                leafCount++;
                leaves.push({ x, y, z });
                if (speciesLeaves && speciesLeaves.includes(typeId)) speciesLeafCount++;
                continue;
            }

            if (isBuildBlock(typeId)) buildContacts++;
        }
    }

    const height = maxY - minY + 1;

    const baseColumns = new Set();
    for (const log of logs) {
        if (log.y === minY) baseColumns.add(`${log.x},${log.z}`);
    }

    let groundOk = !limits.requireNaturalGround;
    if (!groundOk) {
        for (const column of baseColumns) {
            const [x, z] = column.split(",").map(Number);
            try {
                const below = dimension.getBlock({ x, y: minY - 1, z })?.typeId;
                if (isNaturalGround(below)) {
                    groundOk = true;
                    break;
                }
            } catch { /* unloaded: cannot confirm */ }
        }
    }

    const effectiveLeaves = speciesLeaves ? speciesLeafCount : leafCount;

    const stats = {
        trunkId,
        logs: logs.length,
        leaves: leafCount,
        speciesLeaves: speciesLeaves ? speciesLeafCount : null,
        buildContacts,
        height,
        baseColumns: baseColumns.size,
        groundOk,
        truncated
    };

    const verdict =
        height < limits.minHeight ? "too_short"
            : baseColumns.size > limits.maxBaseColumns ? "base_too_wide"
                : effectiveLeaves < limits.minLeaves ? "not_enough_leaves"
                    : effectiveLeaves < logs.length * limits.leafRatio ? "leaf_ratio_too_low"
                        : buildContacts > limits.maxBuildContacts ? "touches_a_build"
                            : !groundOk ? "not_on_natural_ground"
                                : "ok";

    return { isTree: verdict === "ok", reason: verdict, logs, leaves, stats };
}

function refuse(reason, stats) {
    return { isTree: false, reason, logs: [], leaves: [], stats };
}

/** One-line human-readable summary, used by the /scriptevent probe. */
export function describe(result) {
    const s = result.stats || {};
    return `${result.reason} | logs=${s.logs ?? 0} leaves=${s.leaves ?? 0}`
        + `${s.speciesLeaves !== null && s.speciesLeaves !== undefined ? "(" + s.speciesLeaves + " same species)" : ""}`
        + ` height=${s.height ?? 0} base=${s.baseColumns ?? 0}`
        + ` build=${s.buildContacts ?? 0} ground=${s.groundOk ? "natural" : "artificial"}`
        + `${s.truncated ? " [truncated]" : ""}`;
}
