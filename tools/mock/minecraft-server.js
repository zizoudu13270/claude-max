// ============================================================
//  Minimal stand-in for @minecraft/server.
//
//  It is not an emulator: it is just enough of the surface for the
//  behaviour pack to load, register its handlers and have its pure
//  logic exercised by tools/test_scripts.mjs.
// ============================================================

export const EquipmentSlot = {
    Mainhand: "Mainhand",
    Offhand: "Offhand",
    Head: "Head",
    Chest: "Chest",
    Legs: "Legs",
    Feet: "Feet"
};

export const GameMode = {
    survival: "survival",
    creative: "creative",
    adventure: "adventure",
    spectator: "spectator"
};

// Stack limits for the handful of items the tests use.
const MAX_AMOUNT = {
    "minecraft:potion": 1,
    "minecraft:splash_potion": 1,
    "minecraft:diamond_pickaxe": 1,
    "minecraft:psu_unknown": 64
};

const DURABLE = /(_pickaxe|_axe|_shovel|_hoe|_sword|_helmet|_chestplate|_leggings|_boots|bow|shield|shears|trident|elytra)$/;

export class ItemStack {
    constructor(typeId, amount = 1) {
        if (typeof typeId !== "string" || !typeId.includes(":")) {
            throw new Error("invalid item id: " + typeId);
        }
        this.typeId = typeId;
        this.amount = amount;
        this.nameTag = undefined;
        this.maxAmount = MAX_AMOUNT[typeId] ?? 64;
        this._lore = [];
        this._enchantments = [];
    }

    getLore() {
        return this._lore;
    }

    setLore(lore) {
        this._lore = lore;
    }

    hasComponent(name) {
        if (name === "durability") return DURABLE.test(this.typeId);
        if (name === "enchantable") return DURABLE.test(this.typeId);
        return false;
    }

    getComponent(name) {
        if (name === "enchantable" && this.hasComponent("enchantable")) {
            const list = this._enchantments;
            return {
                getEnchantments: () => list,
                getEnchantment: (id) => list.find((e) => e.type === id)
            };
        }
        if (name === "durability" && this.hasComponent("durability")) {
            return { damage: 0, maxDurability: 1561 };
        }
        return undefined;
    }

    enchant(type, level) {
        this._enchantments.push({ type, level });
        return this;
    }

    clone() {
        const copy = new ItemStack(this.typeId, this.amount);
        copy.nameTag = this.nameTag;
        copy._lore = [...this._lore];
        copy._enchantments = [...this._enchantments];
        return copy;
    }
}

export class BlockPermutation {
    constructor(typeId, states = {}) {
        this.type = { id: typeId };
        this._states = states;
    }

    static resolve(typeId, states = {}) {
        return new BlockPermutation(typeId, states);
    }

    getState(name) {
        return this._states[name];
    }

    withState(name, value) {
        return new BlockPermutation(this.type.id, { ...this._states, [name]: value });
    }
}

// ------------------------------------------------------------
//  Event plumbing: every subscribe() call is recorded so the test
//  can fire the handler by name.
// ------------------------------------------------------------
export const registry = {
    afterEvents: new Map(),
    beforeEvents: new Map(),
    systemAfterEvents: new Map(),
    intervals: [],
    timeouts: [],
    commands: [],
    warnings: []
};

function eventBus(store) {
    return new Proxy({}, {
        get(_target, name) {
            if (typeof name !== "string") return undefined;
            return {
                subscribe(handler) {
                    if (!store.has(name)) store.set(name, []);
                    store.get(name).push(handler);
                    return handler;
                },
                unsubscribe() { }
            };
        }
    });
}

export function fire(kind, name, event) {
    const store = kind === "before" ? registry.beforeEvents
        : kind === "system" ? registry.systemAfterEvents
            : registry.afterEvents;
    for (const handler of store.get(name) ?? []) handler(event);
}

/** Run every queued system.run() callback until the queue drains. */
export function drainRunQueue(limit = 10000) {
    let count = 0;
    while (pendingRuns.length > 0 && count < limit) {
        const fn = pendingRuns.shift();
        count++;
        fn();
    }
    return count;
}

const pendingRuns = [];

export class Dimension {
    constructor(id) {
        this.id = id;
        this.blocks = new Map();
        this.spawned = [];
    }

    getBlock(pos) {
        if (!pos || typeof pos.x !== "number" || typeof pos.y !== "number" || typeof pos.z !== "number") {
            throw new Error("invalid Vector3");
        }
        // Mirrors the engine: a stray extra field is a hard error. This is
        // exactly the v3.5 dynamic-light bug the pack had to fix.
        for (const key of Object.keys(pos)) {
            if (!["x", "y", "z"].includes(key)) throw new Error("invalid Vector3 field: " + key);
        }
        const key = `${pos.x},${pos.y},${pos.z}`;
        if (!this.blocks.has(key)) {
            this.blocks.set(key, makeBlock(this, pos, "minecraft:air"));
        }
        return this.blocks.get(key);
    }

    getEntities() {
        return [];
    }

    spawnItem(stack, location) {
        this.spawned.push({ stack, location });
        return { typeId: "minecraft:item" };
    }

    spawnEntity(typeId, location) {
        const entity = { typeId, location, id: "e" + this.spawned.length, isValid: () => true, remove() { } };
        this.spawned.push({ entity, location });
        return entity;
    }

    runCommand(command) {
        registry.commands.push(command);
        return { successCount: 1 };
    }
}

function makeBlock(dimension, pos, typeId) {
    return {
        dimension,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        typeId,
        permutation: BlockPermutation.resolve(typeId),
        setType(id) {
            this.typeId = id;
            this.permutation = BlockPermutation.resolve(id);
        },
        setPermutation(permutation) {
            this.permutation = permutation;
            this.typeId = permutation.type.id;
        },
        getComponent() {
            return undefined;
        },
        above(n = 1) {
            return dimension.getBlock({ x: this.x, y: this.y + n, z: this.z });
        },
        below(n = 1) {
            return dimension.getBlock({ x: this.x, y: this.y - n, z: this.z });
        }
    };
}

const dimensions = new Map([
    ["minecraft:overworld", new Dimension("minecraft:overworld")],
    ["minecraft:nether", new Dimension("minecraft:nether")],
    ["minecraft:the_end", new Dimension("minecraft:the_end")]
]);

export const world = {
    afterEvents: eventBus(registry.afterEvents),
    beforeEvents: eventBus(registry.beforeEvents),
    getPlayers: () => [],
    getEntity: () => undefined,
    getDimension: (id) => {
        const dimension = dimensions.get(id);
        if (!dimension) throw new Error("unknown dimension " + id);
        return dimension;
    }
};

export const system = {
    currentTick: 0,
    afterEvents: eventBus(registry.systemAfterEvents),
    run(fn) {
        pendingRuns.push(fn);
        return pendingRuns.length;
    },
    runTimeout(fn, ticks) {
        registry.timeouts.push({ fn, ticks });
        return registry.timeouts.length;
    },
    runInterval(fn, ticks) {
        registry.intervals.push({ fn, ticks });
        return registry.intervals.length;
    },
    clearRun() { }
};

const nativeWarn = console.warn;
console.warn = (...args) => {
    registry.warnings.push(args.join(" "));
    if (process.env.PSU_TEST_VERBOSE) nativeWarn(...args);
};
