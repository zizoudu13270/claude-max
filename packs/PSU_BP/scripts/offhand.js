import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { itemDisplayName, mainhand, offhand } from "./utils.js";
import { toCustom, toVanilla } from "./lightitems.js";
import { bar } from "./i18n.js";

// ============================================================
//  OFF-HAND SWAP
//
//  v3.5 bug, kept fixed here: the main hand was emptied BEFORE the
//  off-hand was written to. Bedrock refuses most items in that slot,
//  setItem() failed silently, and the item was destroyed.
//
//  Safe order:
//    1. write to the off-hand,
//    2. read the slot back to confirm it was accepted,
//    3. only then touch the main hand,
//    4. otherwise put the off-hand back exactly as it was and warn.
//
//  Vanilla light sources are swapped for their psu:* twin on the way
//  in (the only items Bedrock accepts in that slot) and back to
//  vanilla on the way out.
// ============================================================

const C = CONFIG.offhand;
const cooldown = new Map();   // playerId -> tick

function onCooldown(player) {
    const last = cooldown.get(player.id) ?? -99999;
    if (system.currentTick - last < C.cooldownTicks) return true;
    cooldown.set(player.id, system.currentTick);
    return false;
}

function sameItem(a, b) {
    return !!a && !!b && a.typeId === b.typeId && a.amount === b.amount;
}

/** @returns {"ok"|"empty"|"rejected"|string} a status code for diagnostics */
export function swapHands(player) {
    const mainSlot = mainhand(player);
    const offSlot = offhand(player);
    if (!mainSlot || !offSlot) return "no equippable component";

    let mainItem, offItem;
    try {
        mainItem = mainSlot.getItem();
        offItem = offSlot.getItem();
    } catch (e) {
        return "cannot read hands: " + e;
    }

    if (!mainItem && !offItem) return "empty";

    const toOffhand = mainItem ? (toCustom(mainItem) ?? mainItem) : undefined;
    const toMainhand = offItem ? (toVanilla(offItem) ?? offItem) : undefined;

    // --- 1. off-hand first ---
    try {
        offSlot.setItem(toOffhand);
    } catch (e) {
        return "off-hand refused: " + e;
    }

    // --- 2. verify ---
    let check;
    try {
        check = offSlot.getItem();
    } catch { /* treated as a failure below */ }

    const accepted = toOffhand ? sameItem(check, toOffhand) : !check;

    if (!accepted) {
        // --- 4. restore, main hand untouched, nothing lost ---
        try {
            offSlot.setItem(offItem);
        } catch { /* already back to its previous state */ }

        if (C.showActionBar) {
            bar(player, "psu.offhand.rejected", mainItem ? itemDisplayName(mainItem) : "?");
        }
        try {
            player.playSound("note.bass");
        } catch { /* sound is cosmetic */ }

        return "rejected";
    }

    // --- 3. accepted: the main hand can be changed ---
    try {
        mainSlot.setItem(toMainhand);
    } catch (e) {
        return "main hand: " + e;
    }

    try {
        if (C.sound) player.playSound(C.sound);
    } catch { /* sound is cosmetic */ }

    if (C.showActionBar) {
        if (toOffhand) bar(player, "psu.offhand.set", itemDisplayName(toOffhand));
        else bar(player, "psu.offhand.cleared");
    }

    return "ok";
}

export function initOffhand() {
    if (!C.enabled) return;

    // 1) sneak + tap while aiming at empty air
    if (C.sneakUseTrigger) {
        world.beforeEvents.itemUse.subscribe((event) => {
            const player = event.source;
            if (!player || !player.isSneaking) return;

            // Aiming at a block? Leave it alone - sneak-placing blocks
            // has to keep working.
            try {
                const hit = player.getBlockFromViewDirection({
                    maxDistance: 7,
                    includeLiquidBlocks: false,
                    includePassableBlocks: false
                });
                if (hit) return;
            } catch {
                return;
            }

            if (onCooldown(player)) return;

            event.cancel = true;
            system.run(() => swapHands(player));
        });
    }

    // 2) sneak + jump
    if (C.sneakJumpTrigger) {
        system.runInterval(() => {
            for (const player of world.getPlayers()) {
                try {
                    if (!player.isSneaking || !player.isJumping) continue;
                } catch {
                    continue;
                }
                if (onCooldown(player)) continue;
                swapHands(player);
            }
        }, 2);
    }

    // Keep the cooldown map from growing forever on busy servers.
    try {
        world.afterEvents.playerLeave.subscribe((event) => cooldown.delete(event.playerId));
    } catch { /* event unavailable on this build */ }
}
