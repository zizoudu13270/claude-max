// ============================================================
//  ITEM SAFETY DATA
//
//  The script API exposes an item's type id, count, name tag, lore
//  and enchantments - but NOT its aux/NBT payload. Rebuilding such
//  an item with `new ItemStack(typeId, amount)` therefore silently
//  destroys what makes it unique: a Potion of Strength becomes a
//  plain water bottle, a full shulker box comes back empty, a
//  written book loses its pages.
//
//  Anything listed here is treated as UNIQUE: it is moved around,
//  never merged and never rebuilt. This is what keeps the sorter
//  and the loot gatherer from eating player inventories.
// ============================================================

const NEVER_MERGE_IDS = new Set([
    "minecraft:potion",
    "minecraft:splash_potion",
    "minecraft:lingering_potion",
    "minecraft:tipped_arrow",
    "minecraft:firework_rocket",
    "minecraft:fireworks",
    "minecraft:firework_star",
    "minecraft:fireworkscharge",
    "minecraft:written_book",
    "minecraft:writable_book",
    "minecraft:enchanted_book",
    "minecraft:filled_map",
    "minecraft:map",
    "minecraft:emptymap",
    "minecraft:suspicious_stew",
    "minecraft:goat_horn",
    "minecraft:ominous_bottle",
    "minecraft:bundle",
    "minecraft:banner",
    "minecraft:banner_pattern",
    "minecraft:shield",
    "minecraft:skull",
    "minecraft:player_head",
    "minecraft:compass",
    "minecraft:lodestone_compass",
    "minecraft:recovery_compass",
    "minecraft:axolotl_bucket",
    "minecraft:tropical_fish_bucket",
    "minecraft:cod_bucket",
    "minecraft:salmon_bucket",
    "minecraft:pufferfish_bucket",
    "minecraft:tadpole_bucket"
]);

const NEVER_MERGE_SUFFIXES = [
    "_shulker_box",   // carries its whole inventory
    "_banner",
    "_bucket",        // mob buckets carry a variant
    "_head",
    "_skull",
    "_spawn_egg",     // some builds carry the mob id as aux data
    "_pottery_sherd"
];

/** True when the stack may safely be counted and rebuilt. */
export function isMergeable(stack) {
    if (!stack) return false;
    try {
        if (stack.nameTag) return false;
        if (stack.hasComponent("durability")) return false;

        const lore = typeof stack.getLore === "function" ? stack.getLore() : undefined;
        if (lore && lore.length > 0) return false;

        if (stack.hasComponent("enchantable")) {
            const ench = stack.getComponent("enchantable");
            const list = ench && typeof ench.getEnchantments === "function"
                ? ench.getEnchantments()
                : undefined;
            if (list && list.length > 0) return false;
        }

        const id = stack.typeId;
        if (NEVER_MERGE_IDS.has(id)) return false;
        if (NEVER_MERGE_SUFFIXES.some((s) => id.endsWith(s))) return false;

        // Non-stackable items are unique by definition.
        if (typeof stack.maxAmount === "number" && stack.maxAmount <= 1) return false;
    } catch {
        return false;   // when in doubt, treat it as unique
    }
    return true;
}

// ------------------------------------------------------------
//  Tool families, used by AutoTool, TreeCapitator and VeinMiner.
// ------------------------------------------------------------

/**
 * Material tiers, best first - ordered by HARVEST level, not by mining
 * speed. Gold digs fastest but harvests at wood level, so ranking it
 * above stone (as v3.5 did) made AutoTool pick a golden pickaxe for
 * diamond ore, which breaks the block without dropping anything.
 */
export const TIERS = ["netherite", "diamond", "iron", "copper", "stone", "golden", "gold", "wooden", "wood"];

export function isTool(stack, suffix) {
    return !!stack && typeof stack.typeId === "string" && stack.typeId.endsWith(suffix);
}

export const isAxe = (stack) => isTool(stack, "_axe");
export const isPickaxe = (stack) => isTool(stack, "_pickaxe");
export const isHoe = (stack) => isTool(stack, "_hoe");
export const isShovel = (stack) => isTool(stack, "_shovel");

/** Higher is better; 0 means "not this kind of tool at all". */
export function tierScore(typeId, suffix) {
    if (suffix === "shears") return typeId === "minecraft:shears" ? 1 : 0;
    if (!typeId.endsWith(suffix)) return 0;
    const idx = TIERS.findIndex((t) => typeId.includes(t));
    return idx === -1 ? 1 : TIERS.length - idx + 1;
}
