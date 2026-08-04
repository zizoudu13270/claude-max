// ============================================================
//  API COMPATIBILITY SHIMS
//
//  @minecraft/server changed a handful of signatures between
//  1.11 (Minecraft 1.21.0) and the current releases. Everything
//  that differs is isolated here so the modules stay readable.
// ============================================================

// `isValid` is a METHOD in @minecraft/server 1.x and a PROPERTY
// in 2.x. This helper handles both.
export function isValid(entity) {
    if (!entity) return false;
    try {
        const v = entity.isValid;
        return typeof v === "function" ? entity.isValid() : !!v;
    } catch {
        return false;
    }
}

// `Dimension.runCommand` is synchronous and cheaper; older builds
// only expose `runCommandAsync`. Never call this from a
// before-event handler: the engine is in read-only mode there.
export function runCmd(dimension, command) {
    if (typeof dimension.runCommand === "function") {
        try {
            dimension.runCommand(command);
            return true;
        } catch { /* fall back to the async form below */ }
    }
    try {
        dimension.runCommandAsync(command);
        return true;
    } catch {
        return false;
    }
}

// `Player.selectedSlotIndex` replaced `Player.selectedSlot`.
export function selectedSlot(player) {
    try {
        if (typeof player.selectedSlotIndex === "number") return player.selectedSlotIndex;
    } catch { /* fall through */ }
    try {
        if (typeof player.selectedSlot === "number") return player.selectedSlot;
    } catch { /* fall through */ }
    return -1;
}

export function setSelectedSlot(player, index) {
    try {
        player.selectedSlotIndex = index;
        return true;
    } catch { /* fall through */ }
    try {
        player.selectedSlot = index;
        return true;
    } catch { /* fall through */ }
    return false;
}

// The GameMode enum is `creative` in 1.x and `Creative` in 2.x, so the
// value is compared as a lower-cased string instead of being imported.
export function gameModeOf(player) {
    let mode;
    try {
        if (typeof player.getGameMode === "function") mode = player.getGameMode();
    } catch { /* fall through */ }
    if (mode === undefined) {
        try {
            mode = player.gameMode;
        } catch { /* fall through */ }
    }
    return typeof mode === "string" ? mode.toLowerCase() : undefined;
}

export function isCreative(player) {
    return gameModeOf(player) === "creative";
}

export function isSpectator(player) {
    return gameModeOf(player) === "spectator";
}

// Strict Vector3: a stray extra field (`dim`, `dimension`, ...) makes
// the native Vector3 conversion throw, which used to silently break
// every getBlock()/setType() call it was passed to.
export function vec3(pos) {
    return { x: pos.x, y: pos.y, z: pos.z };
}

export function floorVec3(pos) {
    return { x: Math.floor(pos.x), y: Math.floor(pos.y), z: Math.floor(pos.z) };
}

export function sameBlockPos(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
}

export function posKey(x, y, z) {
    return `${x},${y},${z}`;
}
