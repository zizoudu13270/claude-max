import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { collectGroundItems } from "./utils.js";
import { floorVec3 } from "./compat.js";
import { tell, tellRaw, raw, t } from "./i18n.js";

// ============================================================
//  DEATH MARKER / GRAVE
//  Prints the exact coordinates and gathers everything that fell on
//  the ground into a chest placed on the spot. If no chest can be
//  placed the items are put straight back: NOTHING is ever deleted.
// ============================================================

const C = CONFIG.death;
const lastDeath = new Map();   // playerId -> { x, y, z, dim }

function dimensionKey(id) {
    if (id.includes("nether")) return "psu.dim.nether";
    if (id.includes("the_end")) return "psu.dim.end";
    return "psu.dim.overworld";
}

function findSpot(dimension, pos) {
    for (let dy = 0; dy <= 6; dy++) {
        for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const p = { x: pos.x + dx, y: pos.y + dy, z: pos.z + dz };
            try {
                const block = dimension.getBlock(p);
                if (!block) continue;
                const id = block.typeId;
                if (id === "minecraft:air" || id === "minecraft:cave_air" || id === "minecraft:water") {
                    return p;
                }
            } catch { /* unloaded */ }
        }
    }
    return undefined;
}

function returnToGround(dimension, stacks, pos) {
    for (const stack of stacks) {
        try {
            dimension.spawnItem(stack, pos);
        } catch { /* nothing else we can do */ }
    }
}

function buildGrave(dimension, pos) {
    const items = collectGroundItems(dimension, pos, C.gatherRadius, 27);
    if (items.length === 0) return 0;

    const spot = findSpot(dimension, pos);
    if (!spot) {
        returnToGround(dimension, items, pos);
        return 0;
    }

    let block;
    try {
        block = dimension.getBlock(spot);
        block.setType("minecraft:chest");
    } catch {
        returnToGround(dimension, items, pos);
        return 0;
    }

    let container;
    try {
        container = block.getComponent("inventory")?.container;
    } catch { /* handled below */ }

    if (!container) {
        returnToGround(dimension, items, pos);
        return 0;
    }

    let stored = 0;
    for (const stack of items) {
        if (stored >= container.size) {
            try {
                dimension.spawnItem(stack, spot);
            } catch { /* nothing else we can do */ }
            continue;
        }
        try {
            container.setItem(stored, stack);
            stored++;
        } catch {
            try {
                dimension.spawnItem(stack, spot);
            } catch { /* nothing else we can do */ }
        }
    }
    return stored;
}

function announce(player, pos, dimId, stored) {
    tell(player, "psu.death.title");
    tellRaw(player, raw(
        t("psu.death.coords", pos.x, pos.y, pos.z),
        " ",
        t(dimensionKey(dimId))
    ));
    if (stored > 0) tell(player, "psu.death.grave", stored);
    tell(player, "psu.death.reminder");
}

export function initDeathMarker() {
    if (!C.enabled) return;

    world.afterEvents.entityDie.subscribe((event) => {
        const player = event.deadEntity;
        if (!player || player.typeId !== "minecraft:player") return;

        const dimension = player.dimension;
        const pos = floorVec3(player.location);
        lastDeath.set(player.id, { ...pos, dim: dimension.id });

        // Give the drops a moment to hit the ground.
        system.runTimeout(() => {
            const stored = C.grave ? buildGrave(dimension, pos) : 0;
            announce(player, pos, dimension.id, stored);
        }, Math.max(1, C.delayTicks));
    });

    try {
        world.afterEvents.playerLeave.subscribe((event) => lastDeath.delete(event.playerId));
    } catch { /* event unavailable on this build */ }
}

/** /scriptevent psu:death */
export function lastDeathMessage(player) {
    const d = lastDeath.get(player.id);
    if (!d) return t("psu.death.none");
    return raw(
        t("psu.death.coords", d.x, d.y, d.z),
        " ",
        t(dimensionKey(d.dim))
    );
}
