import { world } from "@minecraft/server";
import { CONFIG } from "./config.js";

// ============================================================
//  EXPLOSION ANTI-GRIEFING
//  Damage to players and mobs is untouched; only the block
//  destruction is cancelled.
//
//  An empty `sources` list means EVERY explosion - TNT and beds
//  included. The default only protects against creepers.
// ============================================================

export function initNoGrief() {
    const C = CONFIG.nogrief;
    if (!C.enabled) return;

    world.beforeEvents.explosion.subscribe((event) => {
        let sourceId = "";
        try {
            sourceId = event.source ? event.source.typeId : "";
        } catch { /* source already removed by the blast */ }

        if (C.sources.length > 0 && !C.sources.includes(sourceId)) return;

        try {
            event.setImpactedBlocks([]);
        } catch { /* not supported on this build */ }
    });
}
