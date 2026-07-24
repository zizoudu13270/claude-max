import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { mainhand, inventoryOf, itemDisplayName } from "./utils.js";

// ============================================================
//  TRASH CAN
//   - /scriptevent psu:trash : destroys the stack in your hand
//   - "junk" list: those blocks are destroyed on sight as soon as
//     they reach the inventory (off by default)
// ============================================================

const C = CONFIG.trash;

/** @returns {{ amount:number, name:string } | undefined} */
export function trashHeld(player) {
    try {
        const slot = mainhand(player);
        const item = slot?.getItem();
        if (!item) return undefined;
        slot.setItem(undefined);
        player.playSound("random.fizz");
        return { amount: item.amount, name: itemDisplayName(item) };
    } catch {
        return undefined;
    }
}

function sweepJunk() {
    for (const player of world.getPlayers()) {
        const container = inventoryOf(player);
        if (!container) continue;
        for (let i = 0; i < container.size; i++) {
            try {
                const item = container.getItem(i);
                if (item && C.junk.includes(item.typeId)) container.setItem(i, undefined);
            } catch { /* slot changed under us */ }
        }
    }
}

export function initTrash() {
    if (!C.enabled) return;
    // The /scriptevent command works either way; only the automatic
    // sweep needs a timer.
    if (!C.autoJunk) return;
    system.runInterval(sweepJunk, 40);
}
