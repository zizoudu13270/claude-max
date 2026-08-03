import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";

// ============================================================
//  DOUBLE DOORS
//  Opening one door of a pair opens the other: same type, same
//  facing, opposite hinge.
//
//  v4.1 - why this module did nothing before
//  -----------------------------------------
//  Two assumptions in the v4.0 version were wrong, and either one
//  on its own was enough to make every pair fail silently:
//
//  1. The hinge was read off the *lower* half. On a Bedrock door the
//     lower half carries `direction` and `open_bit`; `door_hinge_bit`
//     is the upper half's. Reading it low returns the same value for
//     both leaves, so the "opposite hinge" test rejected every pair.
//  2. The `direction` -> neighbour-axis table has to be exactly right
//     or the twin is looked for along the wrong axis and never found.
//
//  Both are now avoided rather than corrected: the hinge is read from
//  the upper half with the lower half as a fallback, and all four
//  neighbours are examined - the perpendicular pair first, because
//  that is the real geometry, then the other two as a safety net.
//  A neighbour still has to be the same door type, at the same
//  facing, with the opposite hinge, so widening the search does not
//  make the match looser.
// ============================================================

// Bedrock door "direction": 0 = east, 1 = south, 2 = west, 3 = north.
// A door facing east/west has its twin to the north or south, and the
// other way round. This only decides which pair is *tried first*.
const PERPENDICULAR = {
    0: [[0, 1], [0, -1]],
    2: [[0, 1], [0, -1]],
    1: [[1, 0], [-1, 0]],
    3: [[1, 0], [-1, 0]]
};

const ALL_SIDES = [[0, 1], [0, -1], [1, 0], [-1, 0]];

function isDoor(block) {
    return !!block && typeof block.typeId === "string" && block.typeId.endsWith("_door");
}

function state(block, name) {
    try {
        return block.permutation.getState(name);
    } catch {
        return undefined;   // state absent on this block, or block unloaded
    }
}

// The hinge lives on the upper half. Fall back to the lower half so a
// door whose top was removed still gives an answer instead of undefined.
function hingeOf(lower) {
    try {
        const above = lower.above(1);
        if (isDoor(above)) {
            const upper = state(above, "door_hinge_bit");
            if (upper !== undefined) return upper;
        }
    } catch { /* nothing above, or chunk not loaded */ }
    return state(lower, "door_hinge_bit");
}

// Search order: the geometrically correct pair first, then the two
// remaining sides, so a wrong direction table cannot break the module.
function candidates(facing) {
    const first = PERPENDICULAR[facing] ?? [];
    const rest = ALL_SIDES.filter(
        ([dx, dz]) => !first.some(([fx, fz]) => fx === dx && fz === dz)
    );
    return [...first, ...rest];
}

function setOpen(block, open) {
    try {
        block.setPermutation(block.permutation.withState("open_bit", open));
    } catch {
        return false;   // door was broken between the click and this tick
    }

    // Keep the upper half consistent; harmless where it is not authoritative.
    try {
        const above = block.above(1);
        if (isDoor(above) && state(above, "upper_block_bit")) {
            above.setPermutation(above.permutation.withState("open_bit", open));
        }
    } catch { /* nothing above */ }

    return true;
}

export function initDoubleDoors() {
    if (!CONFIG.doors.enabled) return;

    world.afterEvents.playerInteractWithBlock.subscribe((event) => {
        if (!isDoor(event.block)) return;
        const clicked = event.block;

        system.run(() => {
            try {
                // Always work from the lower half: that is where the
                // facing and the open state are authoritative.
                let door = clicked;
                if (state(door, "upper_block_bit")) {
                    const below = door.below(1);
                    if (!isDoor(below)) return;
                    door = below;
                }

                const facing = state(door, "direction");
                const open = state(door, "open_bit");
                const hinge = hingeOf(door);
                if (facing === undefined || open === undefined) return;

                for (const [dx, dz] of candidates(facing)) {
                    const other = door.dimension.getBlock({
                        x: door.x + dx,
                        y: door.y,
                        z: door.z + dz
                    });

                    if (!isDoor(other) || other.typeId !== door.typeId) continue;
                    if (state(other, "upper_block_bit")) continue;
                    if (state(other, "direction") !== facing) continue;
                    if (state(other, "open_bit") === open) continue;

                    // Opposite hinges is what makes two doors a pair rather
                    // than two doors that merely stand side by side. Skip the
                    // test only when neither leaf reports a hinge at all.
                    const otherHinge = hingeOf(other);
                    if (hinge !== undefined && otherHinge !== undefined
                        && otherHinge === hinge) continue;

                    if (!setOpen(other, open)) continue;

                    try {
                        other.dimension.playSound(
                            open ? "open.door" : "close.door",
                            { x: other.x + 0.5, y: other.y + 0.5, z: other.z + 0.5 }
                        );
                    } catch { /* sound id unavailable on this build */ }

                    return;
                }
            } catch { /* door removed between the click and this tick */ }
        });
    });
}
