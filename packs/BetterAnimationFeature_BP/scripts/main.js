import { world, GameMode } from "@minecraft/server";

// Native components handle mining speed. This event only denies invalid breaks.
const ROCK_TIERS = Object.freeze({
    "lbr:rock": 0,
    "lbr:rock_coal": 0,
    "lbr:rock_copper": 1,
    "lbr:rock_iron": 1,
    "lbr:rock_gold": 2,
    "lbr:rock_emerald": 2
});
const ALLOWED_TIERS = Object.freeze({
    "0": [
        "minecraft:wooden_tier",
        "minecraft:golden_tier",
        "minecraft:stone_tier",
        "minecraft:copper_tier",
        "minecraft:iron_tier",
        "minecraft:diamond_tier",
        "minecraft:netherite_tier"
    ],
    "1": [
        "minecraft:stone_tier",
        "minecraft:copper_tier",
        "minecraft:iron_tier",
        "minecraft:diamond_tier",
        "minecraft:netherite_tier"
    ],
    "2": [
        "minecraft:iron_tier",
        "minecraft:diamond_tier",
        "minecraft:netherite_tier"
    ]
});

function canHarvestRock(blockId, item) {
    const required = ROCK_TIERS[blockId];
    if (required === undefined) return true;
    return !!item && item.hasTag("minecraft:is_pickaxe")
        && ALLOWED_TIERS[required].some((tag) => item.hasTag(tag));
}

world.beforeEvents.playerBreakBlock.subscribe((event) => {
    if (ROCK_TIERS[event.block.typeId] === undefined) return;
    if (event.player.getGameMode() === GameMode.Creative) return;
    if (!canHarvestRock(event.block.typeId, event.itemStack)) event.cancel = true;
});
