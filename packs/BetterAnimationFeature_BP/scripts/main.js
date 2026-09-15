import { world, GameMode } from "@minecraft/server";

// Native components handle mining speed. This event only denies invalid breaks.
const ROCK_TIERS = Object.freeze({
    "custom:roche": 0,
    "custom:roche_charbon": 0,
    "custom:roche_cuivre": 1,
    "custom:roche_fer": 1,
    "custom:roche_or": 2,
    "custom:roche_emeraude": 2,
    "custom:caillou_emeraude": 2
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
