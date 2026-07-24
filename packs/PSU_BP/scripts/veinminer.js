import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { damageHeld, gatherAndSpawnItems, heldItem } from "./utils.js";
import { isPickaxe } from "./itemdata.js";
import { isKnownOre, oreLoot } from "./drops.js";
import { runCmd, isCreative, posKey } from "./compat.js";

// ============================================================
//  VEINMINER
//  Breaking one ore breaks the whole connected vein.
//
//  v4 changes:
//   - a pickaxe is required, and sneaking mines a single block;
//   - Silk Touch and Fortune now apply to the WHOLE vein, not just
//     the first block (see drops.js);
//   - ore experience is granted for the extra blocks;
//   - "quartz_block" and "coal_block" are no longer treated as ore,
//     so decorative walls are safe.
// ============================================================

const C = CONFIG.vein;

const EXTRA = new Set(C.extraBlocks || []);

function isVeinBlock(typeId) {
    if (isKnownOre(typeId)) return true;
    if (EXTRA.has(typeId)) return true;
    return typeId.endsWith("_ore");
}

export function initVeinminer() {
    if (!C.enabled) return;

    world.afterEvents.playerBreakBlock.subscribe((event) => {
        const { brokenBlockPermutation, block, player } = event;
        if (!player || !block) return;

        const typeId = brokenBlockPermutation.type.id;
        if (!isVeinBlock(typeId)) return;

        if (isCreative(player)) return;
        if (C.sneakDisables && player.isSneaking) return;

        const tool = heldItem(player);
        if (C.requirePickaxe && !isPickaxe(tool)) return;

        const dimension = player.dimension;
        const startPos = { x: block.x, y: block.y, z: block.z };
        const queue = [startPos];
        const visited = new Set([posKey(startPos.x, startPos.y, startPos.z)]);

        const lootOptions = {
            silkTouch: C.silkTouch,
            fortune: C.fortune,
            giveXp: C.giveXp
        };

        let mined = 1;
        let xp = 0;

        const perTick = Math.max(1, C.blocksPerTick);
        const maxBlocks = Math.max(1, C.maxBlocks);

        function harvest(pos, target) {
            const loot = oreLoot(target.typeId, tool, lootOptions);

            if (!loot) {
                // Unknown block: let vanilla decide what it drops.
                runCmd(dimension, `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`);
                return;
            }

            try {
                target.setType("minecraft:air");
            } catch {
                runCmd(dimension, `setblock ${pos.x} ${pos.y} ${pos.z} air destroy`);
                return;
            }

            const centre = { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 };
            for (const stack of loot.stacks) {
                try {
                    dimension.spawnItem(stack, centre);
                } catch { /* chunk unloaded */ }
            }
            xp += loot.xp;
        }

        function step() {
            let broken = 0;

            while (queue.length > 0 && broken < perTick && mined < maxBlocks) {
                const current = queue.shift();

                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        for (let dz = -1; dz <= 1; dz++) {
                            if (dx === 0 && dy === 0 && dz === 0) continue;

                            const nx = current.x + dx;
                            const ny = current.y + dy;
                            const nz = current.z + dz;

                            const key = posKey(nx, ny, nz);
                            if (visited.has(key)) continue;
                            visited.add(key);

                            try {
                                const neighbour = dimension.getBlock({ x: nx, y: ny, z: nz });
                                if (!neighbour || neighbour.typeId !== typeId) continue;

                                harvest({ x: nx, y: ny, z: nz }, neighbour);
                                queue.push({ x: nx, y: ny, z: nz });
                                mined++;
                                broken++;
                            } catch { /* unloaded chunk */ }
                        }
                    }
                }
            }

            if (queue.length > 0 && mined < maxBlocks) {
                system.run(step);
                return;
            }

            damageHeld(player, mined - 1);

            if (xp > 0) {
                try {
                    player.runCommand(`xp ${xp}`);
                } catch { /* cheats disabled or player left */ }
            }

            gatherAndSpawnItems(dimension, startPos, C.gatherRadius);
        }

        system.run(step);
    });
}
