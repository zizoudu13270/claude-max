// ============================================================
//  LIGHT SOURCES - Survival Core
//
//  Per-add-on list consumed by the shared dynamiclight.js module.
//
//  This add-on adds NO custom items: it lights the world from the
//  plain vanilla item you are already holding. That is the whole
//  difference with the Ultimate pack, which also ships psu:* twins
//  so light sources can be carried in the off-hand.
//
//  The list is explicit on purpose. Matching substrings ("torch",
//  "magma", "candle") also catches a TORCHFLOWER, MAGMA CREAM and an
//  unlit CANDLE, none of which emit light.
// ============================================================

export const LIGHT_SOURCES = new Set([
    // torches and lanterns
    "minecraft:torch",
    "minecraft:soul_torch",
    "minecraft:redstone_torch",
    "minecraft:lantern",
    "minecraft:soul_lantern",

    // glowing blocks
    "minecraft:glowstone",
    "minecraft:sea_lantern",
    "minecraft:shroomlight",
    "minecraft:end_rod",
    "minecraft:magma",
    "minecraft:crying_obsidian",
    "minecraft:ochre_froglight",
    "minecraft:verdant_froglight",
    "minecraft:pearlescent_froglight",
    "minecraft:froglight",
    "minecraft:beacon",
    "minecraft:conduit",
    "minecraft:lit_pumpkin",

    // fires
    "minecraft:campfire",
    "minecraft:soul_campfire",

    // odds and ends that really do glow
    "minecraft:lava_bucket",
    "minecraft:glow_berries",
    "minecraft:amethyst_cluster",
    "minecraft:large_amethyst_bud",
    "minecraft:glow_lichen",
    "minecraft:sculk_shrieker"
]);

export function isLightSource(stack) {
    if (!stack) return false;
    try {
        return LIGHT_SOURCES.has(stack.typeId);
    } catch {
        return false;
    }
}
