import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { placeLight, removeLight } from "./dynamiclight.js";
import { posKey } from "./compat.js";

// ============================================================
//  GLOWING ARROWS
//  An arrow stuck in a wall lights the area up for a while.
//
//  v4: the active lights are tracked, so two arrows landing on the
//  same block no longer put each other out early, and a hard cap
//  keeps an arrow-spamming player from flooding the world with
//  light blocks.
// ============================================================

const C = CONFIG.arrows;

const FACE_OFFSETS = {
    Up: [0, 1, 0],
    Down: [0, -1, 0],
    North: [0, 0, -1],
    South: [0, 0, 1],
    East: [1, 0, 0],
    West: [-1, 0, 0]
};

// key -> { dimension, pos, expires }
const active = new Map();

function schedule(dimension, pos) {
    const key = dimension.id + "|" + posKey(pos.x, pos.y, pos.z);
    const existing = active.get(key);

    if (existing) {
        // Refresh instead of stacking a second timer on the same block.
        existing.expires = system.currentTick + C.durationTicks;
        return;
    }

    if (active.size >= C.maxActive) return;

    active.set(key, {
        dimension,
        pos,
        expires: system.currentTick + C.durationTicks
    });
}

function expireTick() {
    if (active.size === 0) return;
    const now = system.currentTick;
    for (const [key, entry] of [...active.entries()]) {
        if (entry.expires > now) continue;
        active.delete(key);
        removeLight(entry.dimension, entry.pos);
    }
}

export function initGlowArrows() {
    if (!C.enabled) return;

    world.afterEvents.projectileHitBlock.subscribe((event) => {
        const projectile = event.projectile;
        if (!projectile || !C.projectiles.includes(projectile.typeId)) return;

        if (C.playersOnly) {
            let shooter;
            try {
                shooter = event.source;
            } catch { /* unknown shooter */ }
            if (!shooter || shooter.typeId !== "minecraft:player") return;
        }

        let dimension, pos;
        try {
            dimension = event.dimension;
            const hit = event.getBlockHit();
            const block = hit.block;
            // Light the cell on the struck face, which is air.
            const [dx, dy, dz] = FACE_OFFSETS[hit.face] ?? [0, 1, 0];
            pos = { x: block.x + dx, y: block.y + dy, z: block.z + dz };
        } catch {
            return;
        }

        system.run(() => {
            if (!placeLight(dimension, pos)) return;
            schedule(dimension, pos);
        });
    });

    system.runInterval(expireTick, 20);
}
