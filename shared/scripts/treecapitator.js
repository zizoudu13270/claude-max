import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { damageHeld, gatherAndSpawnItems, heldItem } from "./utils.js";
import { isAxe } from "./itemdata.js";
import { runCmd, isCreative } from "./compat.js";
import { analyseTree, isNaturalTrunk, describe } from "./treevalidator.js";

// ============================================================
//  TREECAPITATOR
//
//  Two phases, and the order matters:
//    1. ANALYSE - read-only. treevalidator.js walks the connected
//       log cluster and decides whether it is a tree or a build.
//       Nothing is broken while this runs.
//    2. FELL - only if the verdict is "ok". The block list comes
//       straight out of phase 1, so the destruction cannot wander
//       off into a wall the way a break-as-you-go flood fill can.
//
//  Any other verdict and the event is left alone: the player breaks
//  one log, exactly like vanilla.
// ============================================================

const C = CONFIG.tree;

export function initTreecapitator() {
    if (!C.enabled) return;

    world.afterEvents.playerBreakBlock.subscribe((event) => {
        const { brokenBlockPermutation, block, player } = event;
        if (!player || !block) return;

        const trunkId = brokenBlockPermutation.type.id;
        if (!isNaturalTrunk(trunkId)) return;

        if (isCreative(player)) return;
        if (C.sneakDisables && player.isSneaking) return;
        if (C.requireAxe && !isAxe(heldItem(player))) return;

        const dimension = player.dimension;
        const origin = { x: block.x, y: block.y, z: block.z };

        // --- phase 1: is this actually a tree? ---
        let result;
        try {
            result = analyseTree(dimension, origin, trunkId, C.validate);
        } catch {
            return;   // never break anything on a failed analysis
        }

        if (!result.isTree) {
            if (C.explainRefusal) {
                try {
                    player.onScreenDisplay.setActionBar("§8" + describe(result));
                } catch { /* action bar unavailable */ }
            }
            return;
        }

        // --- phase 2: fell it ---
        const targets = C.breakLeaves ? [...result.logs, ...result.leaves] : [...result.logs];

        // The origin block is already gone - the player broke it.
        const queue = targets.filter(
            (p) => !(p.x === origin.x && p.y === origin.y && p.z === origin.z)
        );

        const perTick = Math.max(1, C.blocksPerTick);

        function step() {
            let broken = 0;
            while (queue.length > 0 && broken < perTick) {
                const pos = queue.shift();
                runCmd(dimension, `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`);
                broken++;
            }

            if (queue.length > 0) {
                system.run(step);
                return;
            }

            damageHeld(player, result.logs.length - 1);
            if (CONFIG.clump.enabled) {
                gatherAndSpawnItems(dimension, origin, CONFIG.clump.radius);
            }
        }

        system.run(step);
    });
}

/** Probe behind /scriptevent <ns>:tree - analyses the block the player
 *  is looking at and reports the verdict without breaking anything. */
export function probeTree(player) {
    let hit;
    try {
        hit = player.getBlockFromViewDirection({
            maxDistance: 8,
            includeLiquidBlocks: false,
            includePassableBlocks: false
        });
    } catch {
        return "cannot raycast";
    }

    if (!hit || !hit.block) return "not looking at a block";

    const typeId = hit.block.typeId;
    if (!isNaturalTrunk(typeId)) return `${typeId} is not a natural trunk`;

    try {
        const origin = { x: hit.block.x, y: hit.block.y, z: hit.block.z };
        return describe(analyseTree(player.dimension, origin, typeId, C.validate));
    } catch (e) {
        return "analysis failed: " + e;
    }
}
