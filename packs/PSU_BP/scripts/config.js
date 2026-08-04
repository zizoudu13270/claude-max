// ============================================================
//  Ultimate Survival Pack - configuration
//  Pack Survie Ultime - configuration
//
//  Every module can be switched off independently with its
//  `enabled` flag. Nothing else in the code needs to be touched.
//
//  Chaque module s'active/desactive independamment avec son
//  drapeau `enabled`. Rien d'autre n'est a modifier.
// ============================================================

export const CONFIG = {
    // Translation-key namespace. Every key the scripts ask for is
    // prefixed with this, so two add-ons built on the same shared
    // modules never fight over the same .lang entries.
    namespace: "psu",

    // Welcome message on join. Set to false once everything works.
    // Message d'accueil a la connexion.
    showLoadMessage: true,

    // Print a per-module report to the content log on start-up.
    // Rapport par module dans le journal au demarrage.
    verboseLog: false,

    // --- Floating name tags over dropped items -----------------
    labels: {
        enabled: true,
        entityId: "psu:loot_label",
        scanRadius: 20,        // detection radius around each player
        strayRadius: 16,       // orphan clean-up radius (must be < scanRadius)
        maxLabels: 48,         // anti-lag cap
        updateTicks: 4,        // refresh rate (4 ticks = 5x/second)
        heightOffset: 0.55,    // text height above the item
        hideSingle: false      // true = do not print the "1x"
    },

    // --- Dynamic light ----------------------------------------
    light: {
        enabled: true,
        updateTicks: 4,
        checkOffhand: true,    // also look at the off-hand slot
        headOffset: 1,         // light height relative to the feet
        level: 15              // 1..15
    },

    // --- Off-hand swap ----------------------------------------
    offhand: {
        enabled: true,
        sneakUseTrigger: true,  // sneak + tap while aiming at empty air
        sneakJumpTrigger: true, // sneak + jump
        cooldownTicks: 6,
        showActionBar: true,
        sound: "armor.equip_generic"
    },

    // --- Custom twins of the vanilla light sources ------------
    lightItems: {
        enabled: true,
        sweepTicks: 20,
        // false = the psu:* twins only ever exist in the off-hand
        //         slot; everything else stays vanilla, so nothing
        //         can be lost if the pack is removed. RECOMMENDED.
        // true  = full replacement: every light source in the
        //         inventory becomes its custom version.
        replaceVanilla: false
    },

    // --- Drop clumping ----------------------------------------
    // After a tree or a vein, the loose drops are merged into full
    // stacks so 300 separate entities do not sit there lagging the
    // area. Items whose payload the API cannot read are left alone.
    clump: {
        enabled: true,
        radius: 20
    },

    // ============================================================
    //  COMFORT MODULES
    // ============================================================

    // Death marker + grave chest
    death: {
        enabled: true,
        grave: true,
        gatherRadius: 8,
        delayTicks: 20
    },

    // Harvest + automatic replant
    replant: {
        enabled: true,
        damageHoe: true         // only ever damages an actual hoe
    },

    // Double doors
    doors: { enabled: true },

    // Anvil repair with an iron ingot
    anvil: {
        enabled: true,
        repairItem: "minecraft:iron_ingot"
    },

    // Explosion anti-griefing. An empty `sources` list means
    // "every explosion", including TNT and beds.
    nogrief: {
        enabled: true,
        sources: ["minecraft:creeper"]
    },

    // Glowing arrows (600 ticks = 30 s)
    arrows: {
        enabled: true,
        durationTicks: 600,
        projectiles: ["minecraft:arrow"],
        maxActive: 32,          // hard cap on simultaneous arrow lights
        playersOnly: true       // ignore arrows fired by mobs
    },

    // Silk-touch spawner harvesting
    spawner: { enabled: true },

    // Container sorting (sneak + tap on a container)
    sorter: { enabled: true },

    // Automatic tool switching
    autotool: {
        enabled: true,
        updateTicks: 4,
        reach: 6,
        restoreSlot: true,      // go back to the previous slot afterwards
        // Never steal the slot while one of these is held.
        keepHeld: [
            "minecraft:bow", "minecraft:crossbow", "minecraft:trident",
            "minecraft:shield", "minecraft:fishing_rod", "minecraft:spyglass",
            "minecraft:flint_and_steel", "minecraft:ender_pearl",
            "minecraft:bone_meal"
        ],
        keepHeldSuffix: ["_sword", "_bucket", "_spawn_egg"]
    },

    // Trash can
    trash: {
        enabled: true,
        autoJunk: false,        // auto-destroy the blocks listed below
        junk: [
            "minecraft:diorite", "minecraft:granite", "minecraft:andesite",
            "minecraft:gravel", "minecraft:netherrack"
        ]
    },

    // Emerald pickaxe (3x3 mining)
    emeraldPick: {
        enabled: true,
        radius: 1               // 1 = 3x3, 2 = 5x5
    },

    // --- Mining ------------------------------------------------
    tree: {
        enabled: true,
        requireAxe: true,       // bare-handed breaking stays vanilla
        sneakDisables: true,    // sneak to fell a single log
        breakLeaves: true,      // also clear the canopy
        blocksPerTick: 12,
        explainRefusal: false,  // print why a cluster was not felled

        // How a TREE is told apart from a BUILDING made of logs.
        // /scriptevent psu:tree prints these numbers for whatever you
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
        // v3.5 also matched "quartz_block" and "coal_block", which
        // vein-mined decorative walls by accident; only the raw
        // storage blocks are kept here. Add your own ids freely.
        extraBlocks: [
            "minecraft:raw_iron_block",
            "minecraft:raw_gold_block",
            "minecraft:raw_copper_block"
        ]
    }
};
