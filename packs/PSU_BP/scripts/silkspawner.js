import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { heldItem, hasSilkTouch, damageHeld, giveOrDrop, makeStack } from "./utils.js";
import { isPickaxe } from "./itemdata.js";
import { bar } from "./i18n.js";

// ============================================================
//  SILK-TOUCH SPAWNER HARVESTING
//
//  KNOWN LIMIT: the mob type is NOT preserved. Bedrock's stable
//  script API cannot read a spawner's mob id, so the block comes
//  back empty. Place it and use a spawn egg on it to pick the mob,
//  exactly like vanilla.
// ============================================================

export function initSilkSpawner() {
    if (!CONFIG.spawner.enabled) return;

    world.beforeEvents.playerBreakBlock.subscribe((event) => {
        const { block, player } = event;
        if (!block || !player) return;
        if (block.typeId !== "minecraft:mob_spawner") return;

        const tool = heldItem(player);
        if (!isPickaxe(tool) || !hasSilkTouch(tool)) return;

        event.cancel = true;

        const dimension = block.dimension;
        const pos = { x: block.x, y: block.y, z: block.z };

        system.run(() => {
            try {
                const stack = makeStack("minecraft:mob_spawner", 1);
                if (!stack) return;

                const target = dimension.getBlock(pos);
                if (!target || target.typeId !== "minecraft:mob_spawner") return;
                target.setType("minecraft:air");

                giveOrDrop(player, stack, { x: pos.x + 0.5, y: pos.y + 0.5, z: pos.z + 0.5 });
                damageHeld(player, 1);
                player.playSound("random.pop");
                bar(player, "psu.spawner.recovered");
            } catch { /* block or player gone */ }
        });
    });
}
