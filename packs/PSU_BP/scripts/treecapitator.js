import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { damageHeld, gatherAndSpawnItems, heldItem } from "./utils.js";
import { isAxe } from "./itemdata.js";
import { runCmd, isCreative, posKey } from "./compat.js";

// ============================================================
//  TREECAPITATOR
//  Breaking the trunk of a tree fells the whole thing.
//
//  v4 changes:
//   - an axe is required (v3.5 felled a tree punched bare-handed);
//   - sneaking breaks a single log, as in every other tree mod;
//   - creative mode is skipped;
//   - the search is capped per tick AND per tree, so a jungle giant
//     can no longer stall the tick loop.
// ============================================================

const C = CONFIG.tree;

const LOG_KEYWORDS = ["log", "wood", "stem", "hyphae"];
const LEAF_KEYWORDS = ["leaves", "wart_block", "shroomlight"];
// Crafted blocks that contain a log keyword but are not part of a tree.
const NOT_A_TREE = ["planks", "stairs", "slab", "fence", "door", "trapdoor",
    "sign", "button", "pressure_plate", "table", "bookshelf", "chest", "barrel"];

const MAX_HORIZONTAL = 10;   // half-width of the search box, in blocks
const MAX_UP = 35;
const MAX_DOWN = 3;

function classify(id) {
    if (NOT_A_TREE.some((k) => id.includes(k))) return "none";
    if (LOG_KEYWORDS.some((k) => id.includes(k))) return "log";
    if (LEAF_KEYWORDS.some((k) => id.includes(k))) return "leaf";
    return "none";
}

export function initTreecapitator() {
    if (!C.enabled) return;

    world.afterEvents.playerBreakBlock.subscribe((event) => {
        const { brokenBlockPermutation, block, player } = event;
        if (!player || !block) return;

        const typeId = brokenBlockPermutation.type.id;
        if (classify(typeId) !== "log") return;

        if (isCreative(player)) return;
        if (C.sneakDisables && player.isSneaking) return;
        if (C.requireAxe && !isAxe(heldItem(player))) return;

        const dimension = player.dimension;
        const startPos = { x: block.x, y: block.y, z: block.z };
        const queue = [startPos];
        const visited = new Set([posKey(startPos.x, startPos.y, startPos.z)]);

        let logs = 1;
        let leaves = 0;

        const perTick = Math.max(1, C.blocksPerTick);
        const maxBlocks = Math.max(1, C.maxBlocks);

        function step() {
            let broken = 0;

            while (queue.length > 0 && broken < perTick && logs + leaves < maxBlocks) {
                const current = queue.shift();

                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dz = -1; dz <= 1; dz++) {
                            if (dx === 0 && dy === 0 && dz === 0) continue;

                            const nx = current.x + dx;
                            const ny = current.y + dy;
                            const nz = current.z + dz;

                            if (Math.abs(nx - startPos.x) > MAX_HORIZONTAL) continue;
                            if (Math.abs(nz - startPos.z) > MAX_HORIZONTAL) continue;
                            if (ny - startPos.y > MAX_UP || ny - startPos.y < -MAX_DOWN) continue;

                            const key = posKey(nx, ny, nz);
                            if (visited.has(key)) continue;
                            visited.add(key);

                            try {
                                const neighbour = dimension.getBlock({ x: nx, y: ny, z: nz });
                                if (!neighbour) continue;
                                const kind = classify(neighbour.typeId);
                                if (kind === "none") continue;

                                runCmd(dimension, `setblock ${nx} ${ny} ${nz} air destroy`);
                                queue.push({ x: nx, y: ny, z: nz });
                                if (kind === "log") logs++;
                                else leaves++;
                                broken++;
                            } catch { /* unloaded chunk */ }
                        }
                    }
                }
            }

            if (queue.length > 0 && logs + leaves < maxBlocks) {
                system.run(step);
                return;
            }

            damageHeld(player, logs - 1);
            gatherAndSpawnItems(dimension, startPos, C.gatherRadius);
        }

        system.run(step);
    });
}
