import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { t, raw, tell, tellRaw } from "./i18n.js";
import { offhandItem } from "./utils.js";

import { initTreecapitator } from "./treecapitator.js";
import { initVeinminer } from "./veinminer.js";
import { initLootLabels, labelStatus, testLabelSpawn } from "./lootlabels.js";
import { initDynamicLight, lightStatus, getHeldLight, testLight, cleanupLights } from "./dynamiclight.js";
import { initOffhand, swapHands } from "./offhand.js";
import { initLightItems, convertAllToVanilla } from "./lightitems.js";
import { TO_CUSTOM } from "./lightmap.js";
import { initDeathMarker, lastDeathMessage } from "./deathmarker.js";
import { initAutoReplant } from "./autoreplant.js";
import { initDoubleDoors } from "./doubledoors.js";
import { initAnvilRepair } from "./anvilrepair.js";
import { initNoGrief } from "./nogrief.js";
import { initGlowArrows } from "./glowarrows.js";
import { initSilkSpawner } from "./silkspawner.js";
import { initSorter, sortPlayerInventory } from "./sorter.js";
import { initAutoTool } from "./autotool.js";
import { initTrash, trashHeld } from "./trash.js";
import { initEmeraldPickaxe } from "./emeraldpick.js";

const VERSION = "4.0.0";

// ------------------------------------------------------------
//  Module registry. Each module is isolated: one failing module
//  never stops the others from loading.
// ------------------------------------------------------------
const MODULES = [
    { name: "TreeCapitator", init: initTreecapitator, on: () => CONFIG.tree.enabled },
    { name: "VeinMiner", init: initVeinminer, on: () => CONFIG.vein.enabled },
    { name: "LootLabels", init: initLootLabels, on: () => CONFIG.labels.enabled },
    { name: "DynamicLight", init: initDynamicLight, on: () => CONFIG.light.enabled },
    { name: "LightTwins", init: initLightItems, on: () => CONFIG.lightItems.enabled },
    { name: "OffHand", init: initOffhand, on: () => CONFIG.offhand.enabled },
    { name: "DeathMarker", init: initDeathMarker, on: () => CONFIG.death.enabled },
    { name: "AutoReplant", init: initAutoReplant, on: () => CONFIG.replant.enabled },
    { name: "DoubleDoors", init: initDoubleDoors, on: () => CONFIG.doors.enabled },
    { name: "AnvilRepair", init: initAnvilRepair, on: () => CONFIG.anvil.enabled },
    { name: "NoGrief", init: initNoGrief, on: () => CONFIG.nogrief.enabled },
    { name: "GlowArrows", init: initGlowArrows, on: () => CONFIG.arrows.enabled },
    { name: "SilkSpawner", init: initSilkSpawner, on: () => CONFIG.spawner.enabled },
    { name: "Sorter", init: initSorter, on: () => CONFIG.sorter.enabled },
    { name: "AutoTool", init: initAutoTool, on: () => CONFIG.autotool.enabled },
    { name: "Trash", init: initTrash, on: () => CONFIG.trash.enabled },
    { name: "EmeraldPickaxe", init: initEmeraldPickaxe, on: () => CONFIG.emeraldPick.enabled }
];

const loaded = [];
const disabled = [];
const failed = [];

for (const module of MODULES) {
    let enabled = true;
    try {
        enabled = module.on();
    } catch { /* a malformed config counts as enabled */ }

    if (!enabled) {
        disabled.push(module.name);
        continue;
    }

    try {
        module.init();
        loaded.push(module.name);
    } catch (e) {
        failed.push(`${module.name}: ${e}`);
        console.warn(`[PSU] module ${module.name} failed to load -> ${e}`);
    }
}

console.warn(
    `[PSU] v${VERSION} ready. ${loaded.length}/${MODULES.length} modules active.`
    + ` Off: ${disabled.length ? disabled.join(", ") : "none"}.`
    + ` Failed: ${failed.length ? failed.join(" | ") : "none"}.`
);

if (CONFIG.verboseLog) {
    for (const name of loaded) console.warn(`[PSU]   + ${name}`);
    for (const name of disabled) console.warn(`[PSU]   - ${name} (disabled in config.js)`);
}

// ------------------------------------------------------------
//  Join message
// ------------------------------------------------------------
try {
    world.afterEvents.playerSpawn.subscribe((event) => {
        if (!event.initialSpawn || !CONFIG.showLoadMessage) return;
        system.runTimeout(() => {
            const player = event.player;
            tell(player, "psu.load.title", VERSION, loaded.length, MODULES.length);
            if (failed.length) tell(player, "psu.load.failed", failed.join(" | "));
            tell(player, "psu.load.hint.offhand");
            tell(player, "psu.load.hint.help");
        }, 40);
    });
} catch (e) {
    console.warn("[PSU] playerSpawn unavailable: " + e);
}

// ------------------------------------------------------------
//  /scriptevent commands
// ------------------------------------------------------------
function showDiagnostics(player) {
    let offhandText = "-";
    try {
        const stack = offhandItem(player);
        if (stack) offhandText = `${stack.typeId} x${stack.amount}`;
    } catch (e) {
        offhandText = "error: " + e;
    }

    const labelState = labelStatus.spawnOk === null
        ? "untested"
        : (labelStatus.spawnOk ? "OK" : "SPAWN FAILED -> " + labelStatus.lastError);

    tell(player, "psu.diag.header", VERSION);
    tell(player, "psu.diag.modules", loaded.join(", ") || "-");
    tell(player, "psu.diag.disabled", disabled.join(", ") || "-");
    tell(player, "psu.diag.failed", failed.join(" | ") || "-");
    tell(player, "psu.diag.labels", labelState, labelStatus.count);
    tell(player, "psu.diag.labeltest", testLabelSpawn(player));
    tell(player, "psu.diag.light", lightStatus.method, lightStatus.placed, lightStatus.failed);
    tell(player, "psu.diag.lighttest", testLight(player));
    tell(player, "psu.diag.held", getHeldLight(player) ?? "-");
    tell(player, "psu.diag.offhand", offhandText);
    tell(player, "psu.diag.twins", Object.keys(TO_CUSTOM).length, String(CONFIG.lightItems.replaceVanilla));
}

function showHelp(player) {
    for (const key of [
        "psu.help.header",
        "psu.help.offhand",
        "psu.help.sort",
        "psu.help.replant",
        "psu.help.anvil",
        "psu.help.spawner",
        "psu.help.tree",
        "psu.help.vein",
        "psu.help.commands"
    ]) {
        tell(player, key);
    }
}

// Aliases keep the French commands from v3.5 working.
const COMMANDS = {
    "psu:diag": showDiagnostics,

    "psu:help": showHelp,
    "psu:aide": showHelp,

    "psu:light": (player) => tell(player, "psu.cmd.light", testLight(player)),
    "psu:lumiere": (player) => tell(player, "psu.cmd.light", testLight(player)),

    "psu:cleanlight": (player) => tell(player, "psu.cmd.cleanlight", cleanupLights(player)),

    "psu:swap": (player) => tell(player, "psu.cmd.swap", swapHands(player)),

    "psu:vanilla": (player) => tell(player, "psu.cmd.vanilla", convertAllToVanilla(player)),

    "psu:death": (player) => tellRaw(player, raw(t("psu.cmd.death"), " ", lastDeathMessage(player))),
    "psu:mort": (player) => tellRaw(player, raw(t("psu.cmd.death"), " ", lastDeathMessage(player))),

    "psu:sort": sortInventory,
    "psu:trier": sortInventory,

    "psu:trash": emptyHand,
    "psu:poubelle": emptyHand
};

function sortInventory(player) {
    const used = sortPlayerInventory(player);
    if (used < 0) tell(player, "psu.sorter.error");
    else tell(player, "psu.cmd.sort", used);
}

function emptyHand(player) {
    const result = trashHeld(player);
    if (!result) tell(player, "psu.trash.empty");
    else tell(player, "psu.trash.done", result.amount, result.name);
}

try {
    system.afterEvents.scriptEventReceive.subscribe((event) => {
        const player = event.sourceEntity;
        if (!player || player.typeId !== "minecraft:player") return;

        const handler = COMMANDS[event.id];
        if (!handler) return;

        system.run(() => {
            try {
                handler(player);
            } catch (e) {
                console.warn(`[PSU] command ${event.id} failed: ${e}`);
            }
        });
    });
} catch (e) {
    console.warn("[PSU] scriptEventReceive unavailable: " + e);
}
