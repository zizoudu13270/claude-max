// ============================================================
//  SINGLE SOURCE OF TRUTH FOR LIGHT SOURCES
//
//  To add one:
//    1. one line in TO_CUSTOM below,
//    2. one entry in assets/light_sources.json, then run
//       `python3 tools/generate_items.py` to write PSU_BP/items/,
//    3. one name key in PSU_RP/texts/*.lang (both languages).
//  `tools/validate.py` fails the build if any of the three is missing.
//
//  No icon and no attachable: the twins are drawn by the engine's own
//  item renderer, which is the only thing that gets a block right both
//  in the inventory and in the off-hand. See tools/generate_items.py.
// ============================================================

// vanilla -> custom twin (the twins are the only items Bedrock lets
// a script place in the off-hand slot)
export const TO_CUSTOM = {
    "minecraft:torch": "psu:torch",
    "minecraft:soul_torch": "psu:soul_torch",
    "minecraft:redstone_torch": "psu:redstone_torch",
    "minecraft:lantern": "psu:lantern",
    "minecraft:soul_lantern": "psu:soul_lantern",
    "minecraft:glowstone": "psu:glowstone",
    "minecraft:sea_lantern": "psu:sea_lantern",
    "minecraft:shroomlight": "psu:shroomlight",
    "minecraft:end_rod": "psu:end_rod",
    "minecraft:magma": "psu:magma",
    "minecraft:crying_obsidian": "psu:crying_obsidian",
    "minecraft:ochre_froglight": "psu:ochre_froglight",
    "minecraft:verdant_froglight": "psu:verdant_froglight",
    "minecraft:pearlescent_froglight": "psu:pearlescent_froglight",
    "minecraft:campfire": "psu:campfire",
    "minecraft:soul_campfire": "psu:soul_campfire",
    "minecraft:beacon": "psu:beacon",
    "minecraft:lit_pumpkin": "psu:jack_o_lantern"
};

// custom twin -> vanilla
export const TO_VANILLA = {};
for (const [vanilla, custom] of Object.entries(TO_CUSTOM)) TO_VANILLA[custom] = vanilla;

// ------------------------------------------------------------
//  Items that light the world up when held.
//
//  v3.5 matched substrings ("torch", "magma", "candle"), so a
//  TORCHFLOWER, a MAGMA CREAM and an unlit CANDLE all glowed.
//  The list is explicit now.
// ------------------------------------------------------------
const VANILLA_LIGHT_SOURCES = [
    ...Object.keys(TO_CUSTOM),
    "minecraft:lava_bucket",
    "minecraft:glow_berries",
    "minecraft:conduit",
    "minecraft:amethyst_cluster",
    "minecraft:large_amethyst_bud",
    "minecraft:glow_lichen",
    "minecraft:sculk_shrieker",
    "minecraft:froglight"       // safety net for unexpected variants
];

export const LIGHT_SOURCES = new Set([
    ...VANILLA_LIGHT_SOURCES,
    ...Object.values(TO_CUSTOM)
]);

export function isLightSource(stack) {
    if (!stack) return false;
    try {
        return LIGHT_SOURCES.has(stack.typeId);
    } catch {
        return false;
    }
}
