import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { inventoryOf } from "./utils.js";
import { tierScore } from "./itemdata.js";
import { selectedSlot, setSelectedSlot, isSpectator } from "./compat.js";

// ============================================================
//  AUTOMATIC TOOL SWITCHING
//  Picks the right tool from the hotbar for the block being aimed
//  at, choosing the best material available.
//
//  v4:
//   - never steals the slot while a weapon, a bow, a bucket, a
//     spawn egg... is held: v3.5 swapped your sword for a pickaxe
//     the moment you looked at a stone wall mid-fight;
//   - puts the original slot back once you look away (restoreSlot);
//   - skipped in spectator mode.
// ============================================================

const C = CONFIG.autotool;

const RULES = [
    {
        tool: "_pickaxe",
        blocks: ["stone", "cobble", "deepslate", "ore", "granite", "diorite", "andesite",
            "obsidian", "netherrack", "blackstone", "basalt", "brick", "concrete",
            "terracotta", "quartz", "sandstone", "amethyst", "anvil", "furnace", "rail",
            "iron_block", "gold_block", "diamond_block", "copper", "tuff", "calcite",
            "dripstone", "glazed", "purpur", "end_stone", "prismarine", "magma",
            "spawner", "shulker_box"]
    },
    {
        tool: "_axe",
        blocks: ["log", "wood", "planks", "stem", "hyphae", "fence", "door", "chest",
            "barrel", "bookshelf", "crafting_table", "stripped", "sign", "ladder",
            "bamboo", "mangrove", "pumpkin", "melon", "beehive", "campfire"]
    },
    {
        tool: "_shovel",
        blocks: ["dirt", "grass", "sand", "gravel", "clay", "soul_soil", "soul_sand",
            "snow", "podzol", "mycelium", "mud", "farmland", "path", "powder"]
    },
    {
        tool: "_hoe",
        blocks: ["leaves", "hay", "sponge", "moss", "nether_wart_block", "shroomlight", "target"]
    },
    {
        tool: "shears",
        blocks: ["wool", "cobweb", "vine", "glow_lichen"]
    }
];

const KEEP_HELD = new Set(C.keepHeld || []);
const KEEP_SUFFIX = C.keepHeldSuffix || [];

// playerId -> { from: slot to go back to, to: slot we switched them to }
const restore = new Map();

function toolFor(blockId) {
    for (const rule of RULES) {
        if (rule.blocks.some((k) => blockId.includes(k))) return rule.tool;
    }
    return undefined;
}

function mustKeep(stack) {
    if (!stack) return false;
    const id = stack.typeId;
    if (KEEP_HELD.has(id)) return true;
    return KEEP_SUFFIX.some((s) => id.endsWith(s));
}

function goBack(player) {
    const entry = restore.get(player.id);
    if (!entry) return;
    restore.delete(player.id);
    if (!C.restoreSlot) return;
    // Only take the slot back if the player has not chosen another one
    // in the meantime - otherwise we would fight them for the hotbar.
    if (selectedSlot(player) !== entry.to) return;
    setSelectedSlot(player, entry.from);
}

function tick() {
    for (const player of world.getPlayers()) {
        try {
            if (isSpectator(player)) continue;

            const hit = player.getBlockFromViewDirection({
                maxDistance: C.reach,
                includeLiquidBlocks: false,
                includePassableBlocks: false
            });

            if (!hit || !hit.block) {
                goBack(player);
                continue;
            }

            const suffix = toolFor(hit.block.typeId);
            if (!suffix) {
                goBack(player);
                continue;
            }

            const container = inventoryOf(player);
            if (!container) continue;

            const current = selectedSlot(player);
            if (current < 0) continue;

            const held = container.getItem(current);
            if (mustKeep(held)) continue;                    // hands off
            if (held && tierScore(held.typeId, suffix) > 0) continue;  // already right

            let best = -1;
            let bestScore = 0;
            for (let i = 0; i < 9; i++) {
                const item = container.getItem(i);
                if (!item) continue;
                const score = tierScore(item.typeId, suffix);
                if (score > bestScore) {
                    bestScore = score;
                    best = i;
                }
            }

            if (best < 0 || best === current) continue;

            const previous = restore.get(player.id);
            const from = previous ? previous.from : current;
            if (setSelectedSlot(player, best)) restore.set(player.id, { from, to: best });
        } catch { /* player left mid-scan */ }
    }
}

export function initAutoTool() {
    if (!C.enabled) return;
    system.runInterval(tick, Math.max(2, C.updateTicks));

    try {
        world.afterEvents.playerLeave.subscribe((event) => restore.delete(event.playerId));
    } catch { /* event unavailable on this build */ }
}
