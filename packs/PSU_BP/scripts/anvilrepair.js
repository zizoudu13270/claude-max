import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { heldItem, mainhand } from "./utils.js";
import { bar } from "./i18n.js";

// ============================================================
//  ANVIL REPAIR
//  Tapping a damaged anvil with an iron ingot brings it up one step.
//
//  Bedrock has used three different encodings over the years, and
//  all three are handled:
//    * separate block ids (damaged_anvil / chipped_anvil / anvil),
//    * a numeric "damage" state (2 -> 1 -> 0),
//    * a string "damage" state ("very_damaged" -> ... -> "undamaged").
//  v3.5 only handled the first two, so on older worlds the module
//  simply did nothing.
// ============================================================

const C = CONFIG.anvil;

const NEXT_ID = {
    "minecraft:damaged_anvil": "minecraft:chipped_anvil",
    "minecraft:chipped_anvil": "minecraft:anvil"
};

const NEXT_NUMERIC = { 2: 1, 1: 0 };

const NEXT_STRING = {
    broken: "very_damaged",
    very_damaged: "slightly_damaged",
    slightly_damaged: "undamaged"
};

function nextDamageState(block) {
    let damage;
    try {
        damage = block.permutation.getState("damage");
    } catch {
        return undefined;
    }
    if (typeof damage === "number") return NEXT_NUMERIC[damage];
    if (typeof damage === "string") return NEXT_STRING[damage];
    return undefined;
}

export function initAnvilRepair() {
    if (!C.enabled) return;

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;
        if (!block || !player) return;
        if (!block.typeId.includes("anvil")) return;

        const item = heldItem(player);
        if (!item || item.typeId !== C.repairItem) return;

        const nextId = NEXT_ID[block.typeId];
        const nextState = nextDamageState(block);
        if (nextId === undefined && nextState === undefined) return;   // already pristine

        event.cancel = true;

        system.run(() => {
            try {
                if (nextId) block.setType(nextId);
                else block.setPermutation(block.permutation.withState("damage", nextState));

                const slot = mainhand(player);
                const held = slot?.getItem();
                if (!held) return;
                if (held.amount > 1) {
                    held.amount -= 1;
                    slot.setItem(held);
                } else {
                    slot.setItem(undefined);
                }

                player.playSound("random.anvil_use");
                bar(player, "psu.anvil.repaired");
            } catch { /* anvil or player gone */ }
        });
    });
}
