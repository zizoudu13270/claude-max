// ============================================================
//  Survival Core - configuration
//  Pack Survie Essentiel - configuration
//
//  Four systems, nothing else:
//    TreeCapitator, VeinMiner, drop clumping with floating labels,
//    and dynamic light.
//
//  There is deliberately NO off-hand module and no custom light
//  items: dynamic light reads whatever you are already holding.
//
//  Quatre systemes, rien d'autre : abattage, filons, regroupement
//  des drops avec etiquettes flottantes, et lumiere dynamique.
//  Il n'y a volontairement AUCUN module de main gauche ni objet
//  lumineux personnalise : la lumiere lit ce que tu tiens deja.
// ============================================================

export const CONFIG = {
    // Translation-key namespace. Keeps this add-on's .lang entries
    // from colliding with another pack built on the same modules.
    namespace: "psc",

    // Welcome message on join. Set to false once everything works.
    showLoadMessage: true,

    // Per-module report in the content log at start-up.
    verboseLog: false,

    // ============================================================
    //  1. TREECAPITATOR
    // ============================================================
    tree: {
        enabled: true,
        requireAxe: true,       // bare-handed breaking stays vanilla
        sneakDisables: true,    // sneak to fell a single log
        breakLeaves: true,      // also clear the canopy
        blocksPerTick: 12,
        explainRefusal: false,  // print why a cluster was not felled

        // How a TREE is told apart from a BUILDING made of logs.
        // The cluster is scanned read-only first and has to pass all
        // six tests before a single block is broken.
        // /scriptevent psc:tree prints these numbers for whatever you
        // are looking at, which is the easy way to tune them.
        validate: {
            maxLogs: 600,           // scan cap, also the felling cap
            maxRadius: 10,          // horizontal half-width of the scan box
            maxUp: 40,
            maxDown: 4,
            minHeight: 4,           // a log floor is one block tall
            maxBaseColumns: 4,      // 1x1 trunk, or 2x2 for a giant
            minLeaves: 5,           // absolute leaf count
            leafRatio: 0.35,        // leaves per log: a cabin scores far lower
            maxBuildContacts: 4,    // planks/stairs/glass/doors touching the logs
            requireNaturalGround: true,   // the trunk must stand on dirt, not planks
            matchSpecies: true      // oak logs want oak (or azalea) leaves
        }
    },

    // ============================================================
    //  2. VEINMINER
    // ============================================================
    vein: {
        enabled: true,
        maxBlocks: 150,
        requirePickaxe: true,
        sneakDisables: true,
        blocksPerTick: 8,
        silkTouch: true,        // Silk Touch yields the ore block itself
        fortune: true,          // apply the vanilla Fortune multiplier
        giveXp: true,           // award the ore's vanilla experience
        // Every *_ore block and ancient debris is always included.
        // Decorative blocks such as quartz_block or coal_block are
        // deliberately NOT matched: a quartz wall is a build.
        extraBlocks: [
            "minecraft:raw_iron_block",
            "minecraft:raw_gold_block",
            "minecraft:raw_copper_block"
        ]
    },

    // ============================================================
    //  3. CLUMPING + DYNAMIC DISPLAY
    // ============================================================

    // Merge the loose drops of a felled tree or a mined vein into
    // full stacks. Items whose payload the script API cannot read
    // (potions, filled shulker boxes, enchanted gear...) are never
    // touched - rebuilding them would destroy them.
    clump: {
        enabled: true,
        radius: 20
    },

    // Floating "12x Oak Log" tag over every item on the ground,
    // following the real stack size as it changes.
    labels: {
        enabled: true,
        entityId: "psc:loot_label",
        scanRadius: 20,        // detection radius around each player
        strayRadius: 16,       // orphan clean-up radius (must be < scanRadius)
        maxLabels: 48,         // anti-lag cap
        updateTicks: 4,        // refresh rate (4 ticks = 5x/second)
        heightOffset: 0.55,    // text height above the item
        hideSingle: false      // true = do not print the "1x"
    },

    // ============================================================
    //  4. DYNAMIC LIGHT
    // ============================================================
    light: {
        enabled: true,
        updateTicks: 4,
        headOffset: 1,         // light height relative to the feet
        level: 15,             // 1..15
        // Bedrock only lets a handful of vanilla items into the
        // off-hand, and this add-on does not add any. Reading the
        // slot anyway costs nothing and covers those few cases.
        checkOffhand: true
    }
};
