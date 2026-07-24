import { world, system, ItemStack } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { TO_CUSTOM, TO_VANILLA } from "./lightmap.js";
import { inventoryOf, offhand } from "./utils.js";

// ============================================================
//  CUSTOM TWINS OF THE VANILLA LIGHT SOURCES
//
//  Bedrock rejects any item that does not carry
//  minecraft:allow_off_hand in the off-hand slot - even from a
//  script: setItem() refuses it and the item used to vanish.
//
//  Every vanilla light source therefore has a psu:* twin which
//  places the REAL vanilla block (minecraft:block_placer), so the
//  model, texture, light level, redstone behaviour and sound stay
//  100% vanilla once placed.
//
//  Default mode: the twin only ever exists in the off-hand. The
//  moment it lands anywhere else it turns back into vanilla, so
//  nothing can be lost if the pack is removed.
// ============================================================

const C = CONFIG.lightItems;

export function isCustomLight(stack) {
    return !!stack && !!TO_VANILLA[stack.typeId];
}

export function isVanillaLight(stack) {
    return !!stack && !!TO_CUSTOM[stack.typeId];
}

function convert(stack, table) {
    if (!stack) return undefined;
    const target = table[stack.typeId];
    if (!target) return undefined;
    try {
        const out = new ItemStack(target, stack.amount);
        // Keep a player's anvil rename across the conversion.
        if (stack.nameTag) out.nameTag = stack.nameTag;
        return out;
    } catch {
        return undefined;
    }
}

export const toCustom = (stack) => convert(stack, TO_CUSTOM);
export const toVanilla = (stack) => convert(stack, TO_VANILLA);

// ------------------------------------------------------------
//  Housekeeping sweep: no psu:* twin should sit anywhere except
//  the off-hand slot (unless replaceVanilla is on).
// ------------------------------------------------------------
function sweep() {
    for (const player of world.getPlayers()) {
        const container = inventoryOf(player);
        if (!container) continue;

        for (let i = 0; i < container.size; i++) {
            let stack;
            try {
                stack = container.getItem(i);
            } catch {
                continue;
            }
            if (!stack) continue;

            try {
                const replacement = C.replaceVanilla ? toCustom(stack) : toVanilla(stack);
                if (replacement) container.setItem(i, replacement);
            } catch { /* slot changed under us; next sweep will catch it */ }
        }
    }
}

export function initLightItems() {
    if (!C.enabled) return;
    system.runInterval(sweep, Math.max(10, C.sweepTicks));
}

/** Manual conversion of a whole inventory: /scriptevent psu:vanilla */
export function convertAllToVanilla(player) {
    let converted = 0;
    try {
        const container = inventoryOf(player);
        if (!container) return "no inventory";

        for (let i = 0; i < container.size; i++) {
            const vanilla = toVanilla(container.getItem(i));
            if (vanilla) {
                container.setItem(i, vanilla);
                converted++;
            }
        }

        const slot = offhand(player);
        const vanilla = slot ? toVanilla(slot.getItem()) : undefined;
        if (vanilla && slot) {
            slot.setItem(undefined);
            const left = container.addItem(vanilla);
            if (left) player.dimension.spawnItem(left, player.location);
            converted++;
        }
    } catch (e) {
        return "error: " + e;
    }
    return String(converted);
}
