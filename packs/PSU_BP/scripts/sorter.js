import { world, system, ItemStack } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { inventoryOf, maxStackSize } from "./utils.js";
import { isMergeable } from "./itemdata.js";
import { bar } from "./i18n.js";

// ============================================================
//  CONTAINER SORTING
//   - sneak + tap a chest / barrel / shulker: sort its contents
//   - /scriptevent psu:sort : sort your own inventory
//
//  v4 - two data-loss bugs fixed:
//   1. items whose payload the API cannot read (potions, fireworks,
//      full shulker boxes, written books, mob buckets...) used to be
//      counted by type id and REBUILT, which turned three different
//      potions into three of the same. They are now carried over
//      untouched, exactly as they were (see itemdata.isMergeable).
//   2. if the rewrite ever ran out of slots the surplus was simply
//      dropped from existence; it is now spat out on the floor.
// ============================================================

const SORTABLE = ["chest", "barrel", "shulker_box", "hopper", "dispenser", "dropper"];

function isSortable(block) {
    return !!block
        && typeof block.typeId === "string"
        && SORTABLE.some((k) => block.typeId.includes(k));
}

/**
 * Sort a container in place.
 * @param overflow called with every stack that did not fit back in.
 * @returns the number of slots used afterwards.
 */
export function sortContainer(container, overflow) {
    if (!container) return 0;

    const totals = new Map();   // typeId -> count
    const uniques = [];         // stacks that must be preserved as-is

    for (let i = 0; i < container.size; i++) {
        let stack;
        try {
            stack = container.getItem(i);
        } catch {
            continue;
        }
        if (!stack) continue;

        if (isMergeable(stack)) {
            totals.set(stack.typeId, (totals.get(stack.typeId) || 0) + stack.amount);
        } else {
            uniques.push(stack);
        }
    }

    for (let i = 0; i < container.size; i++) {
        try {
            container.setItem(i, undefined);
        } catch { /* slot locked */ }
    }

    let slot = 0;
    const spill = (stack) => {
        if (overflow) overflow(stack);
    };

    // Full stacks first, ordered by id, then the unique items.
    const ordered = [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]));

    for (const [typeId, total] of ordered) {
        const max = maxStackSize(typeId);
        let remaining = total;
        while (remaining > 0) {
            const amount = Math.min(remaining, max);
            remaining -= amount;
            let stack;
            try {
                stack = new ItemStack(typeId, amount);
            } catch {
                break;
            }
            if (slot >= container.size) {
                spill(stack);
                continue;
            }
            try {
                container.setItem(slot, stack);
                slot++;
            } catch {
                spill(stack);
            }
        }
    }

    for (const stack of uniques) {
        if (slot >= container.size) {
            spill(stack);
            continue;
        }
        try {
            container.setItem(slot, stack);
            slot++;
        } catch {
            spill(stack);
        }
    }

    return slot;
}

function spillAt(dimension, location) {
    return (stack) => {
        try {
            dimension.spawnItem(stack, location);
        } catch { /* nothing else we can do */ }
    };
}

/** /scriptevent psu:sort */
export function sortPlayerInventory(player) {
    const container = inventoryOf(player);
    if (!container) return -1;
    try {
        const used = sortContainer(container, spillAt(player.dimension, player.location));
        player.playSound("random.orb");
        return used;
    } catch {
        return -1;
    }
}

export function initSorter() {
    if (!CONFIG.sorter.enabled) return;

    world.beforeEvents.playerInteractWithBlock.subscribe((event) => {
        const { block, player } = event;
        if (!block || !player || !player.isSneaking) return;
        if (!isSortable(block)) return;

        let container;
        try {
            container = block.getComponent("inventory")?.container;
        } catch {
            return;
        }
        if (!container) return;

        // Only swallow the click when there really is something to sort.
        event.cancel = true;

        const dimension = block.dimension;
        const spillPos = { x: block.x + 0.5, y: block.y + 1, z: block.z + 0.5 };

        system.run(() => {
            try {
                const used = sortContainer(container, spillAt(dimension, spillPos));
                player.playSound("random.orb");
                bar(player, "sorter.done", used);
            } catch { /* container gone */ }
        });
    });
}
