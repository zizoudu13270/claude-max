import { world, system } from "@minecraft/server";
import { CONFIG } from "./config.js";

// ============================================================
//  DOUBLE DOORS
//  Opening one door of a pair opens the other: same type, same
//  facing, opposite hinge.
// ============================================================

// Bedrock door "direction": 0 = east, 1 = south, 2 = west, 3 = north.
// A door facing east/west has its twin to the north or south, and
// the other way round.
const NEIGHBOURS = {
    0: [[0, 1], [0, -1]],
    2: [[0, 1], [0, -1]],
    1: [[1, 0], [-1, 0]],
    3: [[1, 0], [-1, 0]]
};

function isDoor(block) {
    return !!block && typeof block.typeId === "string" && block.typeId.endsWith("_door");
}

function state(block, name) {
    try {
        return block.permutation.getState(name);
    } catch {
        return undefined;
    }
}

function setOpen(block, open) {
    try {
        block.setPermutation(block.permutation.withState("open_bit", open));
    } catch { /* door was broken in the meantime */ }

    // Some builds keep the state on the upper half too.
    try {
        const above = block.above(1);
        if (isDoor(above) && state(above, "upper_block_bit")) {
            above.setPermutation(above.permutation.withState("open_bit", open));
        }
    } catch { /* nothing above */ }
}

export function initDoubleDoors() {
    if (!CONFIG.doors.enabled) return;

    world.afterEvents.playerInteractWithBlock.subscribe((event) => {
        if (!isDoor(event.block)) return;
        const clicked = event.block;

        system.run(() => {
            try {
                // Always work from the lower half.
                let door = clicked;
                if (state(door, "upper_block_bit")) {
                    const below = door.below(1);
                    if (!isDoor(below)) return;
                    door = below;
                }

                const facing = state(door, "direction");
                const open = state(door, "open_bit");
                const hinge = state(door, "door_hinge_bit");
                if (facing === undefined || open === undefined) return;

                for (const [dx, dz] of NEIGHBOURS[facing] ?? []) {
                    const other = door.dimension.getBlock({
                        x: door.x + dx,
                        y: door.y,
                        z: door.z + dz
                    });

                    if (!isDoor(other) || other.typeId !== door.typeId) continue;
                    if (state(other, "upper_block_bit")) continue;
                    if (state(other, "direction") !== facing) continue;
                    if (state(other, "door_hinge_bit") === hinge) continue;
                    if (state(other, "open_bit") === open) continue;

                    setOpen(other, open);
                    return;
                }
            } catch { /* door removed between the click and this tick */ }
        });
    });
}
