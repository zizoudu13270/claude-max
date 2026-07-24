import { world, system, BlockPermutation } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { damageHeld, heldItem } from "./utils.js";
import { isHoe } from "./itemdata.js";
import { isValid, runCmd } from "./compat.js";

// ============================================================
//  HARVEST + AUTOMATIC REPLANT
//  Interacting with a ripe crop harvests and replants it. One seed
//  is taken out of the harvest to pay for the sowing.
//
//  v4: the tool is only damaged when it really is a hoe. v3.5 chewed
//  through whatever happened to be in hand - a sword, a pickaxe...
// ============================================================

const C = CONFIG.replant;

const CROPS = {
    "minecraft:wheat": { state: "growth", ripe: 7, seed: "minecraft:wheat_seeds" },
    "minecraft:carrots": { state: "growth", ripe: 7, seed: "minecraft:carrot" },
    "minecraft:potatoes": { state: "growth", ripe: 7, seed: "minecraft:potato" },
    "minecraft:beetroot": { state: "growth", ripe: 7, seed: "minecraft:beetroot_seeds" },
    "minecraft:nether_wart": { state: "age", ripe: 3, seed: "minecraft:nether_wart" }
};

/** Take one seed out of the fresh drops to pay for the replant. */
function consumeSeed(dimension, pos, seedId) {
    try {
        const items = dimension.getEntities({
            location: pos,
            maxDistance: 3,
            type: "minecraft:item"
        });
        for (const entity of items) {
            if (!isValid(entity)) continue;
            const stack = entity.getComponent("item")?.itemStack;
            if (!stack || stack.typeId !== seedId) continue;

            if (stack.amount <= 1) {
                entity.remove();
            } else {
                // itemStack is a copy: rebuild the entity with one less.
                stack.amount -= 1;
                entity.remove();
                dimension.spawnItem(stack, pos);
            }
            return true;
        }
    } catch { /* drops not on the ground yet */ }
    return false;
}

export function initAutoReplant() {
    if (!C.enabled) return;

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;
        if (!block || !player) return;

        const crop = CROPS[block.typeId];
        if (!crop) return;

        let age;
        try {
            age = block.permutation.getState(crop.state);
        } catch {
            return;
        }
        if (age !== crop.ripe) return;

        event.cancel = true;

        const typeId = block.typeId;
        const pos = { x: block.x, y: block.y, z: block.z };
        const dimension = block.dimension;
        const usedHoe = C.damageHoe && isHoe(heldItem(player));

        system.run(() => {
            if (!runCmd(dimension, `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`)) return;

            system.runTimeout(() => {
                try {
                    const fresh = BlockPermutation.resolve(typeId).withState(crop.state, 0);
                    dimension.getBlock(pos)?.setPermutation(fresh);
                    consumeSeed(dimension, pos, crop.seed);
                    if (usedHoe) damageHeld(player, 1);
                    player.playSound("step.grass");
                } catch { /* the player walked away / chunk unloaded */ }
            }, 2);
        });
    });
}
