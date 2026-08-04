/**
 * Synthetic worlds for the TreeCapitator tests.
 *
 * Each builder writes blocks into a mock Dimension so the validator can
 * be pointed at a real oak, a real log cabin, a decorative pillar and so
 * on, and the verdict checked. They are deliberately built the way the
 * game and players actually build them - a floor under the cabin, planks
 * around the pillar, grass under the tree.
 */

export function ground(dimension, cx, cz, y, radius = 8, blockId = "minecraft:grass_block") {
    for (let x = cx - radius; x <= cx + radius; x++) {
        for (let z = cz - radius; z <= cz + radius; z++) {
            dimension.setBlockId({ x, y, z }, blockId);
        }
    }
}

/** A plain oak: 1x1 trunk, a blob of leaves on top, standing on grass. */
export function oakTree(dimension, cx = 0, cy = 64, cz = 0, height = 5) {
    ground(dimension, cx, cz, cy - 1);

    for (let i = 0; i < height; i++) {
        dimension.setBlockId({ x: cx, y: cy + i, z: cz }, "minecraft:oak_log");
    }

    const top = cy + height - 1;
    for (let dy = -1; dy <= 1; dy++) {
        const spread = dy === 1 ? 1 : 2;
        for (let dx = -spread; dx <= spread; dx++) {
            for (let dz = -spread; dz <= spread; dz++) {
                if (dx === 0 && dz === 0 && dy <= 0) continue;   // keep the trunk
                dimension.setBlockId({ x: cx + dx, y: top + dy, z: cz + dz }, "minecraft:oak_leaves");
            }
        }
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:oak_log" };
}

/** A giant spruce: 2x2 trunk, tall, leaves down the sides. */
export function giantSpruce(dimension, cx = 0, cy = 64, cz = 0, height = 14) {
    ground(dimension, cx, cz, cy - 1, 10, "minecraft:podzol");

    for (let i = 0; i < height; i++) {
        for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
            dimension.setBlockId({ x: cx + dx, y: cy + i, z: cz + dz }, "minecraft:spruce_log");
        }
    }

    for (let i = 4; i < height + 2; i++) {
        const spread = i > height - 2 ? 1 : 3;
        for (let dx = -spread; dx <= spread + 1; dx++) {
            for (let dz = -spread; dz <= spread + 1; dz++) {
                const onTrunk = dx >= 0 && dx <= 1 && dz >= 0 && dz <= 1 && i < height;
                if (onTrunk) continue;
                dimension.setBlockId({ x: cx + dx, y: cy + i, z: cz + dz }, "minecraft:spruce_leaves");
            }
        }
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:spruce_log" };
}

/** A log cabin: a 7x7 ring of oak logs, 5 blocks high, on a plank floor. */
export function logCabin(dimension, cx = 0, cy = 64, cz = 0, size = 3, height = 5) {
    ground(dimension, cx, cz, cy - 1, size + 2, "minecraft:oak_planks");

    for (let y = cy; y < cy + height; y++) {
        for (let x = cx - size; x <= cx + size; x++) {
            for (let z = cz - size; z <= cz + size; z++) {
                const onWall = Math.abs(x - cx) === size || Math.abs(z - cz) === size;
                if (onWall) dimension.setBlockId({ x, y, z }, "minecraft:oak_log");
            }
        }
    }

    // A roof, because people build roofs.
    for (let x = cx - size; x <= cx + size; x++) {
        for (let z = cz - size; z <= cz + size; z++) {
            dimension.setBlockId({ x, y: cy + height, z }, "minecraft:oak_planks");
        }
    }
    return { x: cx - size, y: cy, z: cz, trunkId: "minecraft:oak_log" };
}

/** A flat 5x5 platform of logs - a floor, not a tree. */
export function logFloor(dimension, cx = 0, cy = 64, cz = 0, size = 2) {
    ground(dimension, cx, cz, cy - 1);
    for (let x = cx - size; x <= cx + size; x++) {
        for (let z = cz - size; z <= cz + size; z++) {
            dimension.setBlockId({ x, y: cy, z }, "minecraft:oak_log");
        }
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:oak_log" };
}

/** A decorative 1x1 log pillar inside a house, on grass, under a canopy.
 *  This is the hardest case: the shape alone is identical to a trunk, so
 *  only the surrounding build gives it away. */
export function decorativePillar(dimension, cx = 0, cy = 64, cz = 0, height = 6) {
    ground(dimension, cx, cz, cy - 1);

    for (let i = 0; i < height; i++) {
        dimension.setBlockId({ x: cx, y: cy + i, z: cz }, "minecraft:oak_log");
    }

    // planks, glass and stairs all around it, the way a room is built
    for (let i = 0; i < height; i++) {
        dimension.setBlockId({ x: cx + 1, y: cy + i, z: cz }, "minecraft:oak_planks");
        dimension.setBlockId({ x: cx - 1, y: cy + i, z: cz }, "minecraft:glass");
        dimension.setBlockId({ x: cx, y: cy + i, z: cz + 1 }, "minecraft:oak_stairs");
    }

    // and a few leaves overhead from the garden outside
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            dimension.setBlockId({ x: cx + dx, y: cy + height, z: cz + dz }, "minecraft:oak_leaves");
        }
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:oak_log" };
}

/** A bare trunk with no leaves at all - a stripped-down build. */
export function bareTrunk(dimension, cx = 0, cy = 64, cz = 0, height = 6) {
    ground(dimension, cx, cz, cy - 1);
    for (let i = 0; i < height; i++) {
        dimension.setBlockId({ x: cx, y: cy + i, z: cz }, "minecraft:oak_log");
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:oak_log" };
}

/** A proper-looking tree, but rooted in a single plank block.
 *  Only one plank, so the "touches a build" test stays under its
 *  threshold and the GROUND test is the one being exercised. */
export function treeOnPlanks(dimension, cx = 0, cy = 64, cz = 0) {
    const tree = oakTree(dimension, cx, cy, cz);
    dimension.setBlockId({ x: cx, y: cy - 1, z: cz }, "minecraft:oak_planks");
    return tree;
}

/** A pillar of bark blocks (oak_wood) - only players make these. */
export function barkPillar(dimension, cx = 0, cy = 64, cz = 0, height = 6) {
    ground(dimension, cx, cz, cy - 1);
    for (let i = 0; i < height; i++) {
        dimension.setBlockId({ x: cx, y: cy + i, z: cz }, "minecraft:oak_wood");
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:oak_wood" };
}

/** A pillar of stripped logs. */
export function strippedPillar(dimension, cx = 0, cy = 64, cz = 0, height = 6) {
    ground(dimension, cx, cz, cy - 1);
    for (let i = 0; i < height; i++) {
        dimension.setBlockId({ x: cx, y: cy + i, z: cz }, "minecraft:stripped_oak_log");
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:stripped_oak_log" };
}

/** A crimson fungus: stems, wart block canopy, on nylium. */
export function crimsonFungus(dimension, cx = 0, cy = 64, cz = 0, height = 6) {
    ground(dimension, cx, cz, cy - 1, 6, "minecraft:crimson_nylium");
    for (let i = 0; i < height; i++) {
        dimension.setBlockId({ x: cx, y: cy + i, z: cz }, "minecraft:crimson_stem");
    }
    const top = cy + height - 1;
    for (let dx = -2; dx <= 2; dx++) {
        for (let dz = -2; dz <= 2; dz++) {
            for (let dy = 0; dy <= 1; dy++) {
                if (dx === 0 && dz === 0 && dy === 0) continue;
                dimension.setBlockId({ x: cx + dx, y: top + dy, z: cz + dz },
                    "minecraft:nether_wart_block");
            }
        }
    }
    return { x: cx, y: cy, z: cz, trunkId: "minecraft:crimson_stem" };
}

/** The nightmare case: a log cabin standing in the middle of a forest,
 *  with the canopy pressed right up against its walls. Leaves are
 *  everywhere, so only the SHAPE of the cluster gives it away. */
export function logCabinInForest(dimension, cx = 0, cy = 64, cz = 0, size = 3, height = 5) {
    const spot = logCabin(dimension, cx, cy, cz, size, height);
    for (let y = cy; y < cy + height; y++) {
        for (let x = cx - size - 1; x <= cx + size + 1; x++) {
            for (let z = cz - size - 1; z <= cz + size + 1; z++) {
                const outside = Math.abs(x - cx) === size + 1 || Math.abs(z - cz) === size + 1;
                if (outside) dimension.setBlockId({ x, y, z }, "minecraft:oak_leaves");
            }
        }
    }
    return spot;
}

/** The opposite mistake: a genuine tree grown right against a house.
 *  It brushes a few planks, and must still be felled. */
export function treeAgainstAHouse(dimension, cx = 0, cy = 64, cz = 0) {
    const tree = oakTree(dimension, cx, cy, cz);
    // one wall of the house, two blocks away from the trunk
    for (let y = cy; y < cy + 4; y++) {
        for (let dz = -2; dz <= 2; dz++) {
            dimension.setBlockId({ x: cx + 2, y, z: cz + dz }, "minecraft:oak_planks");
        }
    }
    return tree;
}
