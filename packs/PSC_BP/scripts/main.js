import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";
import { tell } from "./i18n.js";

import { initTreecapitator, probeTree } from "./treecapitator.js";
import { initVeinminer } from "./veinminer.js";
import { initLootLabels, labelStatus, testLabelSpawn } from "./lootlabels.js";
import { initDynamicLight, lightStatus, getHeldLight, testLight, cleanupLights } from "./dynamiclight.js";

const VERSION = "1.0.0";

// ------------------------------------------------------------
//  Module registry. Each module is isolated: one failing module
//  never stops the others from loading.
// ------------------------------------------------------------
const MODULES = [
    { name: "TreeCapitator", init: initTreecapitator, on: () => CONFIG.tree.enabled },
    { name: "VeinMiner", init: initVeinminer, on: () => CONFIG.vein.enabled },
    { name: "LootLabels", init: initLootLabels, on: () => CONFIG.labels.enabled },
    { name: "DynamicLight", init: initDynamicLight, on: () => CONFIG.light.enabled }
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
        console.warn(`[PSC] module ${module.name} failed to load -> ${e}`);
    }
}

console.warn(
    `[PSC] v${VERSION} ready. ${loaded.length}/${MODULES.length} modules active.`
    + ` Off: ${disabled.length ? disabled.join(", ") : "none"}.`
    + ` Failed: ${failed.length ? failed.join(" | ") : "none"}.`
);

if (CONFIG.verboseLog) {
    for (const name of loaded) console.warn(`[PSC]   + ${name}`);
    for (const name of disabled) console.warn(`[PSC]   - ${name} (disabled in config.js)`);
}

// ------------------------------------------------------------
//  Join message
// ------------------------------------------------------------
try {
    world.afterEvents.playerSpawn.subscribe((event) => {
        if (!event.initialSpawn || !CONFIG.showLoadMessage) return;
        system.runTimeout(() => {
            const player = event.player;
            tell(player, "load.title", VERSION, loaded.length, MODULES.length);
            if (failed.length) tell(player, "load.failed", failed.join(" | "));
            tell(player, "load.hint.help");
        }, 40);
    });
} catch (e) {
    console.warn("[PSC] playerSpawn unavailable: " + e);
}

// ------------------------------------------------------------
//  /scriptevent commands
// ------------------------------------------------------------
function showDiagnostics(player) {
    const labelState = labelStatus.spawnOk === null
        ? "untested"
        : (labelStatus.spawnOk ? "OK" : "SPAWN FAILED -> " + labelStatus.lastError);

    tell(player, "diag.header", VERSION);
    tell(player, "diag.modules", loaded.join(", ") || "-");
    tell(player, "diag.disabled", disabled.join(", ") || "-");
    tell(player, "diag.failed", failed.join(" | ") || "-");
    tell(player, "diag.labels", labelState, labelStatus.count);
    tell(player, "diag.labeltest", testLabelSpawn(player));
    tell(player, "diag.light", lightStatus.method, lightStatus.placed, lightStatus.failed);
    tell(player, "diag.lighttest", testLight(player));
    tell(player, "diag.held", getHeldLight(player) ?? "-");
    tell(player, "diag.tree", probeTree(player));
}

function showHelp(player) {
    for (const key of [
        "help.header",
        "help.tree",
        "help.vein",
        "help.clump",
        "help.light",
        "help.commands"
    ]) {
        tell(player, key);
    }
}

// French aliases alongside the English names.
const COMMANDS = {
    "psc:diag": showDiagnostics,

    "psc:help": showHelp,
    "psc:aide": showHelp,

    "psc:tree": (player) => tell(player, "cmd.tree", probeTree(player)),
    "psc:arbre": (player) => tell(player, "cmd.tree", probeTree(player)),

    "psc:light": (player) => tell(player, "cmd.light", testLight(player)),
    "psc:lumiere": (player) => tell(player, "cmd.light", testLight(player)),

    "psc:cleanlight": (player) => tell(player, "cmd.cleanlight", cleanupLights(player))
};

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
                console.warn(`[PSC] command ${event.id} failed: ${e}`);
            }
        });
    });
} catch (e) {
    console.warn("[PSC] scriptEventReceive unavailable: " + e);
}
