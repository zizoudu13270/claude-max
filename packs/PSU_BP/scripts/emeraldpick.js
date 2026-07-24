import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { heldItem, damageHeld } from "./utils.js";
import { runCmd, isCreative } from "./compat.js";

// ============================================================
//  EMERALD PICKAXE - AREA MINING
//  The mined plane is perpendicular to the player's line of sight.
//
//  v4: the "skip" list is matched on whole id segments. v3.5 used
//  raw substrings, so "water" also matched minecraft:waterlily and
//  "air" matched anything containing those three letters.
// ============================================================

const C = CONFIG.emeraldPick;
const PICK_ID = "psu:emerald_pickaxe";

// Blocks the area effect must never touch: unbreakables, liquids and
// anything that would spill a container.
const SKIP_EXACT = new Set([
    "minecraft:air", "minecraft:cave_air", "minecraft:void_air",
    "minecraft:water", "minecraft:flowing_water",
    "minecraft:lava", "minecraft:flowing_lava",
    "minecraft:bedrock", "minecraft:obsidian", "minecraft:crying_obsidian",
    "minecraft:mob_spawner", "minecraft:trial_spawner", "minecraft:vault",
    "minecraft:end_portal", "minecraft:end_portal_frame", "minecraft:end_gateway",
    "minecraft:nether_portal", "minecraft:command_block", "minecraft:structure_block",
    "minecraft:jigsaw", "minecraft:barrier", "minecraft:light_block",
    "minecraft:reinforced_deepslate", "minecraft:budding_amethyst"
]);

const SKIP_SUFFIX = [
    "chest", "barrel", "_shulker_box", "command_block", "spawner", "furnace",
    "hopper", "dispenser", "dropper", "_bed", "_sign", "_banner",
    "beehive", "bee_nest", "brewing_stand", "lectern", "campfire"
];

function shouldSkip(typeId) {
    if (SKIP_EXACT.has(typeId)) return true;
    if (typeId.startsWith("minecraft:light_block")) return true;
    return SKIP_SUFFIX.some((s) => typeId.endsWith(s));
}

function dominantAxis(vector) {
    const ax = Math.abs(vector.x);
    const ay = Math.abs(vector.y);
    const az = Math.abs(vector.z);
    if (ay >= ax && ay >= az) return "y";
    return ax >= az ? "x" : "z";
}

function offsetFor(axis, centre, a, b) {
    if (axis === "y") return { x: centre.x + a, y: centre.y, z: centre.z + b };
    if (axis === "x") return { x: centre.x, y: centre.y + a, z: centre.z + b };
    return { x: centre.x + a, y: centre.y + b, z: centre.z };
}

export function initEmeraldPickaxe() {
    if (!C.enabled) return;

    world.afterEvents.playerBreakBlock.subscribe((event) => {
        const { player, block } = event;
        if (!player || !block) return;

        const tool = heldItem(player);
        if (!tool || tool.typeId !== PICK_ID) return;

        let axis = "y";
        try {
            axis = dominantAxis(player.getViewDirection());
        } catch { /* keep the default */ }

        const dimension = player.dimension;
        const centre = { x: block.x, y: block.y, z: block.z };
        const radius = Math.max(1, Math.min(3, C.radius | 0));
        const survival = !isCreative(player);

        system.run(() => {
            let broken = 0;

            for (let a = -radius; a <= radius; a++) {
                for (let b = -radius; b <= radius; b++) {
                    if (a === 0 && b === 0) continue;
                    const pos = offsetFor(axis, centre, a, b);
                    try {
                        const target = dimension.getBlock(pos);
                        if (!target || shouldSkip(target.typeId)) continue;
                        runCmd(dimension, `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`);
                        broken++;
                    } catch { /* unloaded chunk */ }
                }
            }

            if (broken > 0 && survival) damageHeld(player, Math.ceil(broken / 3));
        });
    });
}
