// ============================================================
//  LIGHT SOURCES - Ultimate Survival Pack
//
//  Per-add-on list consumed by the shared dynamiclight.js module.
//  This add-on also ships the psu:* off-hand twins, so both the
//  vanilla items and their twins have to glow.
// ============================================================

import { TO_CUSTOM } from "./lightmap.js";

const VANILLA = [
    ...Object.keys(TO_CUSTOM),
    "minecraft:lava_bucket",
    "minecraft:glow_berries",
    "minecraft:conduit",
    "minecraft:amethyst_cluster",
    "minecraft:large_amethyst_bud",
    "minecraft:glow_lichen",
    "minecraft:sculk_shrieker",
    "minecraft:froglight"
];

export const LIGHT_SOURCES = new Set([...VANILLA, ...Object.values(TO_CUSTOM)]);

export function isLightSource(stack) {
    if (!stack) return false;
    try {
        return LIGHT_SOURCES.has(stack.typeId);
    } catch {
        return false;
    }
}
