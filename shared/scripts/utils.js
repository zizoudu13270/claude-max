import { system, ItemStack, EquipmentSlot } from "@minecraft/server";
import { isValid } from "./compat.js";
import { isMergeable } from "./itemdata.js";

// ============================================================
//  SHARED HELPERS
//  (v3.5 had two near-identical copies of the durability code in
//   utils.js and qolutils.js; they are unified here.)
// ============================================================

/** "minecraft:oak_log" -> "Oak Log" (diagnostics only; player-facing
 *  text goes through i18n.js). */
export function formatName(id) {
    return String(id)
        .replace(/^[a-z0-9_.-]+:/i, "")
        .split("_")
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

/** Display name of an item stack, honouring anvil renames. */
export function itemDisplayName(stack) {
    try {
        if (stack.nameTag && stack.nameTag.length > 0) return stack.nameTag;
    } catch { /* fall through */ }
    return formatName(stack.typeId);
}

// ------------------------------------------------------------
//  Equipment access
// ------------------------------------------------------------

export function equipment(player) {
    try {
        return player.getComponent("equippable");
    } catch {
        return undefined;
    }
}

export function slotOf(player, which) {
    try {
        return equipment(player)?.getEquipmentSlot(which);
    } catch {
        return undefined;
    }
}

export const mainhand = (player) => slotOf(player, EquipmentSlot.Mainhand);
export const offhand = (player) => slotOf(player, EquipmentSlot.Offhand);

export function heldItem(player) {
    try {
        return mainhand(player)?.getItem();
    } catch {
        return undefined;
    }
}

export function offhandItem(player) {
    try {
        return offhand(player)?.getItem();
    } catch {
        return undefined;
    }
}

export function inventoryOf(player) {
    try {
        return player.getComponent("inventory")?.container;
    } catch {
        return undefined;
    }
}

// ------------------------------------------------------------
//  Enchantments
// ------------------------------------------------------------

export function enchantLevel(stack, id) {
    if (!stack) return 0;
    try {
        const comp = stack.getComponent("enchantable");
        if (!comp) return 0;
        const ench = comp.getEnchantment(id);
        return ench ? ench.level : 0;
    } catch {
        return 0;
    }
}

export const hasEnchant = (stack, id) => enchantLevel(stack, id) > 0;
export const hasSilkTouch = (stack) => hasEnchant(stack, "silk_touch");
export const fortuneLevel = (stack) => enchantLevel(stack, "fortune");

// ------------------------------------------------------------
//  Durability
// ------------------------------------------------------------

/** Apply `hits` points of wear to the held tool, honouring Unbreaking
 *  and breaking the tool when it runs out - exactly like vanilla. */
export function damageHeld(player, hits = 1) {
    if (hits <= 0) return;
    try {
        const slot = mainhand(player);
        const tool = slot?.getItem();
        if (!tool || !tool.hasComponent("durability")) return;

        const durability = tool.getComponent("durability");
        const unbreaking = enchantLevel(tool, "unbreaking");

        let real = 0;
        for (let i = 0; i < hits; i++) {
            if (Math.random() > unbreaking / (unbreaking + 1)) real++;
        }
        if (real <= 0) return;

        if (durability.damage + real >= durability.maxDurability) {
            slot.setItem(undefined);
            try {
                player.playSound("random.break");
            } catch { /* sound is cosmetic */ }
        } else {
            durability.damage += real;
            slot.setItem(tool);
        }
    } catch { /* tool vanished mid-swing */ }
}

// ------------------------------------------------------------
//  Item movement
// ------------------------------------------------------------

/** Put a stack in the player's inventory, dropping the remainder. */
export function giveOrDrop(player, stack, location) {
    try {
        const container = inventoryOf(player);
        const left = container ? container.addItem(stack) : stack;
        if (left) player.dimension.spawnItem(left, location ?? player.location);
    } catch {
        try {
            player.dimension.spawnItem(stack, location ?? player.location);
        } catch { /* the drop itself failed; nothing else to try */ }
    }
}

/** Vacuum up ground items around a point and return their stacks. */
export function collectGroundItems(dimension, location, radius, max = 27) {
    const out = [];
    try {
        const entities = dimension.getEntities({
            location,
            maxDistance: radius,
            type: "minecraft:item"
        });
        for (const entity of entities) {
            if (out.length >= max) break;
            if (!isValid(entity)) continue;
            try {
                const stack = entity.getComponent("item")?.itemStack;
                if (!stack) continue;
                out.push(stack);
                entity.remove();
            } catch { /* entity despawned between the two calls */ }
        }
    } catch { /* chunk unloaded */ }
    return out;
}

export function blockPos(block) {
    return { x: block.x, y: block.y, z: block.z };
}

export function makeStack(typeId, amount = 1) {
    try {
        return new ItemStack(typeId, amount);
    } catch {
        return undefined;
    }
}

// ------------------------------------------------------------
//  Drop tidying after a mass break
// ------------------------------------------------------------

/**
 * Merge the loose drops around a mining point into full stacks so a
 * felled tree does not leave 300 separate entities behind.
 *
 * Items carrying data the API cannot read (potions, shulker boxes,
 * enchanted gear, renamed items...) are LEFT UNTOUCHED - merging them
 * would rebuild them from their type id alone and destroy them.
 */
export function gatherAndSpawnItems(dimension, startPos, radius = 20) {
    system.runTimeout(() => {
        try {
            const entities = dimension.getEntities({
                location: startPos,
                maxDistance: radius,
                type: "minecraft:item"
            });

            const totals = new Map();

            for (const entity of entities) {
                if (!isValid(entity)) continue;
                try {
                    const stack = entity.getComponent("item")?.itemStack;
                    if (!stack) continue;
                    if (!isMergeable(stack)) continue;   // leave it alone
                    totals.set(stack.typeId, (totals.get(stack.typeId) || 0) + stack.amount);
                    entity.remove();
                } catch { /* entity despawned */ }
            }

            if (totals.size === 0) return;

            for (const [typeId, amount] of totals.entries()) {
                const max = maxStackSize(typeId);
                let remaining = amount;
                while (remaining > 0) {
                    const size = Math.min(remaining, max);
                    remaining -= size;
                    try {
                        // Small jitter so the name tags do not overlap.
                        dimension.spawnItem(new ItemStack(typeId, size), {
                            x: startPos.x + 0.5 + (Math.random() - 0.5) * 0.6,
                            y: startPos.y + 0.3,
                            z: startPos.z + 0.5 + (Math.random() - 0.5) * 0.6
                        });
                    } catch { /* chunk unloaded mid-spawn */ }
                }
            }
        } catch { /* chunk unloaded */ }
    }, 20);
}

/** Real stack limit of an item type (16 for snowballs, 1 for tools...). */
export function maxStackSize(typeId) {
    try {
        const probe = new ItemStack(typeId, 1);
        return probe.maxAmount || 64;
    } catch {
        return 64;
    }
}
