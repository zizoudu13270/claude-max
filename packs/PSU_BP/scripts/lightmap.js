// ============================================================
//  SINGLE SOURCE OF TRUTH FOR LIGHT SOURCES
//
//  To add one:
//    1. one line in TO_CUSTOM below,
//    2. one file in PSU_BP/items/,
//    3. one attachable in PSU_RP/attachables/,
//    4. one entry in PSU_RP/textures/item_texture.json,
//    5. one name key in PSU_RP/texts/*.lang.
//  `tools/validate.py` fails the build if any of the five is missing.
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
