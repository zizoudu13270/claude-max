import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { isLightSource } from "./lightmap.js";
import { heldItem, offhandItem } from "./utils.js";
import { vec3, floorVec3, sameBlockPos } from "./compat.js";

// ============================================================
//  DYNAMIC LIGHT (main hand AND off-hand)
//
//  v3.5 bug, kept fixed here: getBlock()/setType() were handed an
//  object shaped { x, y, z, dim }. The extra field makes the native
//  Vector3 conversion throw, the exception was swallowed by the
//  try/catch, and NO light was ever placed. Position and dimension
//  are strictly separated (see compat.vec3).
//
//  Every placement is verified afterwards: if the block did not turn
//  into a light block, the next method is tried instead of failing
//  silently.
// ============================================================

const C = CONFIG.light;

function level() {
    const n = Math.round(C.level ?? 15);
    return Math.min(15, Math.max(1, n));
}

function candidates() {
    return [`minecraft:light_block_${level()}`, "minecraft:light_block"];
}

export const lightStatus = {
    blockId: null,
    method: "no placement attempted",
    lastError: "",
    placed: 0,
    failed: 0
};

// playerId -> { pos: {x,y,z}, dim: string }
const playerLights = new Map();

function isLightBlock(block) {
    return !!block
        && typeof block.typeId === "string"
        && block.typeId.startsWith("minecraft:light_block");
}

function isReplaceable(block) {
    const id = block.typeId;
    return id === "minecraft:air" || id === "minecraft:cave_air" || isLightBlock(block);
}

function confirm(dimension, pos) {
    try {
        return isLightBlock(dimension.getBlock(vec3(pos)));
    } catch {
        return false;
    }
}

/** Try hard to turn `pos` into a light block. Returns true on success. */
export function placeLight(dimension, pos) {
    const v = vec3(pos);

    let block;
    try {
        block = dimension.getBlock(v);
    } catch (e) {
        lightStatus.lastError = "getBlock: " + e;
        lightStatus.failed++;
        return false;
    }
    if (!block) {
        lightStatus.lastError = "getBlock returned undefined (chunk not loaded?)";
        lightStatus.failed++;
        return false;
    }
    if (!isReplaceable(block)) return false;   // normal: something is there

    // Whatever worked last time is tried first.
    const all = candidates();
    const order = lightStatus.blockId
        ? [lightStatus.blockId, ...all.filter((b) => b !== lightStatus.blockId)]
        : all;

    for (const id of order) {
        try {
            block.setType(id);
            if (id === "minecraft:light_block") {
                try {
                    block.setPermutation(
                        block.permutation.withState("block_light_level", level())
                    );
                } catch { /* older builds have no such state */ }
            }
            if (confirm(dimension, v)) {
                lightStatus.blockId = id;
                lightStatus.method = "setType " + id;
                lightStatus.placed++;
                return true;
            }
        } catch (e) {
            lightStatus.lastError = id + ": " + e;
        }
    }

    lightStatus.failed++;
    return false;
}

export function removeLight(dimension, pos) {
    try {
        const block = dimension.getBlock(vec3(pos));
        if (isLightBlock(block)) block.setType("minecraft:air");
    } catch { /* chunk unloaded; the block will be gone with it */ }
}

function clearPlayerLight(playerId) {
    const old = playerLights.get(playerId);
    playerLights.delete(playerId);
    if (!old) return;
    try {
        removeLight(world.getDimension(old.dim), old.pos);
    } catch { /* dimension unavailable */ }
}

export function getHeldLight(player) {
    try {
        const main = heldItem(player);
        if (isLightSource(main)) return main.typeId + " (main hand)";
        if (C.checkOffhand) {
            const off = offhandItem(player);
            if (isLightSource(off)) return off.typeId + " (off hand)";
        }
    } catch { /* equipment unavailable */ }
    return null;
}

function tick() {
    for (const player of world.getPlayers()) {
        let carrying = false;
        try {
            carrying = isLightSource(heldItem(player))
                || (C.checkOffhand && isLightSource(offhandItem(player)));
        } catch {
            continue;
        }

        const playerId = player.id;
        const dimId = player.dimension.id;
        const pos = floorVec3({
            x: player.location.x,
            y: player.location.y + C.headOffset,
            z: player.location.z
        });

        const old = playerLights.get(playerId);
        const moved = !old || old.dim !== dimId || !sameBlockPos(old.pos, pos);

        if (old && (!carrying || moved)) {
            try {
                removeLight(world.getDimension(old.dim), old.pos);
            } catch { /* dimension unavailable */ }
            playerLights.delete(playerId);
        }

        if (carrying && moved) {
            if (placeLight(player.dimension, pos)) {
                playerLights.set(playerId, { pos, dim: dimId });
            }
        }
    }
}

export function initDynamicLight() {
    if (!C.enabled) return;

    system.runInterval(tick, Math.max(1, C.updateTicks));

    try {
        world.afterEvents.playerLeave.subscribe((event) => clearPlayerLight(event.playerId));
    } catch { /* event unavailable on this build */ }

    try {
        world.afterEvents.entityDie.subscribe((event) => {
            const dead = event.deadEntity;
            if (dead && dead.typeId === "minecraft:player") clearPlayerLight(dead.id);
        });
    } catch { /* event unavailable on this build */ }

    try {
        world.afterEvents.playerDimensionChange.subscribe((event) => {
            clearPlayerLight(event.player.id);
        });
    } catch { /* event unavailable on this build */ }
}

/** Manual test: /scriptevent psu:light */
export function testLight(player) {
    const pos = floorVec3({
        x: player.location.x,
        y: player.location.y + C.headOffset,
        z: player.location.z
    });

    let existing;
    try {
        existing = player.dimension.getBlock(pos)?.typeId ?? "undefined";
    } catch (e) {
        existing = "getBlock error: " + e;
    }

    const ok = placeLight(player.dimension, pos);
    return `block here: ${existing} | placed: ${ok ? "OK (" + lightStatus.method + ")" : "FAILED"}`
        + ` | last error: ${lightStatus.lastError || "none"}`;
}

/** Sweep away stray light blocks left behind by a crash:
 *  /scriptevent psu:cleanlight
 *  Deliberately small - this runs in a single tick. */
export function cleanupLights(player, radius = 8, height = 6) {
    const origin = floorVec3(player.location);
    const dimension = player.dimension;
    let removed = 0;

    for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -height; dy <= height; dy++) {
            for (let dz = -radius; dz <= radius; dz++) {
                try {
                    const block = dimension.getBlock({
                        x: origin.x + dx,
                        y: origin.y + dy,
                        z: origin.z + dz
                    });
                    if (isLightBlock(block)) {
                        block.setType("minecraft:air");
                        removed++;
                    }
                } catch { /* out of world or unloaded */ }
            }
        }
    }
    return removed;
}
