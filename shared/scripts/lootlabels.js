import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { itemDisplayName } from "./utils.js";
import { isValid } from "./compat.js";

// ============================================================
//  FLOATING NAME TAGS OVER DROPPED ITEMS
//
//  psu:loot_label must exist in BOTH packs: the behaviour pack
//  defines the entity, the resource pack tells the client how to
//  draw it. With only one of the two the client renders nothing at
//  all - that was the original "the name tags never show up" bug.
// ============================================================

const C = CONFIG.labels;

// itemEntityId -> { label: Entity, text: string }
const labels = new Map();

export const labelStatus = {
    spawnOk: null,      // true / false / null (not tested yet)
    lastError: "",
    count: 0
};

function labelPosition(itemEntity) {
    const l = itemEntity.location;
    return { x: l.x, y: l.y + C.heightOffset, z: l.z };
}

function buildText(stack) {
    const name = itemDisplayName(stack);
    if (stack.amount <= 1 && C.hideSingle) return `§f${name}`;
    return `§e${stack.amount}x §f${name}`;
}

function tick() {
    const players = world.getPlayers();
    if (players.length === 0) return;

    const liveLabelIds = new Set();

    // --- 1. create / refresh ---
    for (const player of players) {
        let dimension, items;
        try {
            dimension = player.dimension;
            items = dimension.getEntities({
                location: player.location,
                maxDistance: C.scanRadius,
                type: "minecraft:item"
            });
        } catch {
            continue;
        }

        for (const itemEntity of items) {
            if (!isValid(itemEntity)) continue;

            let stack;
            try {
                stack = itemEntity.getComponent("item")?.itemStack;
            } catch { /* entity despawned */ }
            if (!stack) continue;

            let entry = labels.get(itemEntity.id);

            if (!entry || !isValid(entry.label)) {
                if (entry) labels.delete(itemEntity.id);
                if (labels.size >= C.maxLabels) continue;
                try {
                    const label = dimension.spawnEntity(C.entityId, labelPosition(itemEntity));
                    entry = { label, text: "" };
                    labels.set(itemEntity.id, entry);
                    labelStatus.spawnOk = true;
                } catch (e) {
                    labelStatus.spawnOk = false;
                    labelStatus.lastError = String(e);
                    continue;
                }
            }

            // Dynamic text: follows the real stack size.
            const text = buildText(stack);
            if (text !== entry.text) {
                try {
                    entry.label.nameTag = text;
                    entry.text = text;
                } catch { /* label despawned */ }
            }

            try {
                entry.label.teleport(labelPosition(itemEntity));
            } catch { /* label despawned */ }

            liveLabelIds.add(entry.label.id);
        }
    }

    // --- 2. drop labels whose item is gone ---
    for (const [itemId, entry] of [...labels.entries()]) {
        let itemEntity;
        try {
            itemEntity = world.getEntity(itemId);
        } catch { /* treated as gone */ }
        if (isValid(itemEntity)) continue;

        try {
            if (isValid(entry.label)) entry.label.remove();
        } catch { /* already gone */ }
        labels.delete(itemId);
    }

    // --- 3. sweep orphans left by a crash or a chunk reload ---
    for (const player of players) {
        let strays;
        try {
            strays = player.dimension.getEntities({
                location: player.location,
                maxDistance: C.strayRadius,
                type: C.entityId
            });
        } catch {
            continue;
        }
        for (const stray of strays) {
            if (liveLabelIds.has(stray.id)) continue;
            try {
                stray.remove();
            } catch { /* already gone */ }
        }
    }

    labelStatus.count = labels.size;
}

export function initLootLabels() {
    if (!C.enabled) return;
    system.runInterval(tick, Math.max(1, C.updateTicks));
}

/** Spawn probe used by /scriptevent psu:diag */
export function testLabelSpawn(player) {
    try {
        const probe = player.dimension.spawnEntity(C.entityId, player.location);
        probe.nameTag = "§aTest OK";
        system.runTimeout(() => {
            try {
                if (isValid(probe)) probe.remove();
            } catch { /* already gone */ }
        }, 60);
        return "OK (visible at your feet for 3 s)";
    } catch (e) {
        return "FAILED -> " + e;
    }
}
