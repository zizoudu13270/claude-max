import { ItemStack } from "@minecraft/server";
import { hasSilkTouch, fortuneLevel, makeStack } from "./utils.js";

// ============================================================
//  ORE DROPS
//
//  `/setblock <pos> air destroy` drops a block's loot with NO tool
//  context: Silk Touch and Fortune were therefore lost on every
//  block VeinMiner broke except the first one. Silk-touching a
//  diamond vein handed out diamonds instead of ore blocks.
//
//  This table reproduces the vanilla ore loot so the whole vein
//  behaves like the block the player actually swung at.
//
//  fortune: "ore"     - vanilla ore multiplier
//                       n = base * max(1, randInt(0, level + 1))
//           "uniform" - vanilla uniform bonus: n = base + randInt(0, level)
//           "none"    - Fortune does nothing
// ============================================================

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

const ORES = {
    "minecraft:coal_ore": { drop: "minecraft:coal", min: 1, max: 1, fortune: "ore", xp: [0, 2] },
    "minecraft:deepslate_coal_ore": { drop: "minecraft:coal", min: 1, max: 1, fortune: "ore", xp: [0, 2] },

    "minecraft:iron_ore": { drop: "minecraft:raw_iron", min: 1, max: 1, fortune: "ore", xp: [0, 0] },
    "minecraft:deepslate_iron_ore": { drop: "minecraft:raw_iron", min: 1, max: 1, fortune: "ore", xp: [0, 0] },

    "minecraft:copper_ore": { drop: "minecraft:raw_copper", min: 2, max: 5, fortune: "ore", xp: [0, 0] },
    "minecraft:deepslate_copper_ore": { drop: "minecraft:raw_copper", min: 2, max: 5, fortune: "ore", xp: [0, 0] },

    "minecraft:gold_ore": { drop: "minecraft:raw_gold", min: 1, max: 1, fortune: "ore", xp: [0, 0] },
    "minecraft:deepslate_gold_ore": { drop: "minecraft:raw_gold", min: 1, max: 1, fortune: "ore", xp: [0, 0] },
    "minecraft:nether_gold_ore": { drop: "minecraft:gold_nugget", min: 2, max: 6, fortune: "ore", xp: [0, 1] },

    "minecraft:diamond_ore": { drop: "minecraft:diamond", min: 1, max: 1, fortune: "ore", xp: [3, 7] },
    "minecraft:deepslate_diamond_ore": { drop: "minecraft:diamond", min: 1, max: 1, fortune: "ore", xp: [3, 7] },

    "minecraft:emerald_ore": { drop: "minecraft:emerald", min: 1, max: 1, fortune: "ore", xp: [3, 7] },
    "minecraft:deepslate_emerald_ore": { drop: "minecraft:emerald", min: 1, max: 1, fortune: "ore", xp: [3, 7] },

    "minecraft:lapis_ore": { drop: "minecraft:lapis_lazuli", min: 4, max: 9, fortune: "ore", xp: [2, 5] },
    "minecraft:deepslate_lapis_ore": { drop: "minecraft:lapis_lazuli", min: 4, max: 9, fortune: "ore", xp: [2, 5] },

    "minecraft:redstone_ore": { drop: "minecraft:redstone", min: 4, max: 5, fortune: "uniform", xp: [1, 5] },
    "minecraft:lit_redstone_ore": { drop: "minecraft:redstone", min: 4, max: 5, fortune: "uniform", xp: [1, 5] },
    "minecraft:deepslate_redstone_ore": { drop: "minecraft:redstone", min: 4, max: 5, fortune: "uniform", xp: [1, 5] },
    "minecraft:lit_deepslate_redstone_ore": { drop: "minecraft:redstone", min: 4, max: 5, fortune: "uniform", xp: [1, 5] },

    "minecraft:quartz_ore": { drop: "minecraft:quartz", min: 1, max: 1, fortune: "ore", xp: [2, 5] },

    "minecraft:ancient_debris": { drop: "minecraft:ancient_debris", min: 1, max: 1, fortune: "none", xp: [0, 0] }
};

// Blocks whose item form differs from the block id (lit variants).
const SILK_OVERRIDES = {
    "minecraft:lit_redstone_ore": "minecraft:redstone_ore",
    "minecraft:lit_deepslate_redstone_ore": "minecraft:deepslate_redstone_ore"
};

/** Ore blocks VeinMiner recognises out of the box. */
export function isKnownOre(typeId) {
    return Object.prototype.hasOwnProperty.call(ORES, typeId);
}

export function oreXpRange(typeId) {
    const entry = ORES[typeId];
    return entry ? entry.xp : undefined;
}

function applyFortune(entry, level) {
    const base = randInt(entry.min, entry.max);
    if (level <= 0 || entry.fortune === "none") return base;
    if (entry.fortune === "uniform") return base + randInt(0, level);
    // "ore": vanilla ApplyBonusCount / oreDrops
    const bonus = Math.max(0, randInt(0, level + 1) - 1);
    return base * (bonus + 1);
}

/**
 * Loot for one extra block broken by VeinMiner.
 *
 * @returns {{ stacks: ItemStack[], xp: number } | undefined}
 *          `undefined` means "no table for this block" - the caller
 *          should fall back to `/setblock ... air destroy`.
 */
export function oreLoot(typeId, tool, options) {
    const useSilk = options.silkTouch && hasSilkTouch(tool);

    if (useSilk) {
        const silkId = SILK_OVERRIDES[typeId] || typeId;
        const stack = makeStack(silkId, 1);
        return stack ? { stacks: [stack], xp: 0 } : undefined;
    }

    const entry = ORES[typeId];
    if (!entry) return undefined;

    const level = options.fortune ? fortuneLevel(tool) : 0;
    let count = applyFortune(entry, level);
    if (count <= 0) return { stacks: [], xp: 0 };

    const stacks = [];
    let max = 64;
    try {
        max = new ItemStack(entry.drop, 1).maxAmount || 64;
    } catch { /* keep 64 */ }
    while (count > 0) {
        const size = Math.min(count, max);
        const stack = makeStack(entry.drop, size);
        if (!stack) break;
        stacks.push(stack);
        count -= size;
    }

    const xp = options.giveXp ? randInt(entry.xp[0], entry.xp[1]) : 0;
    return { stacks, xp };
}
