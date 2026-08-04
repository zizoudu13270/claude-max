import { CONFIG } from "./config.js";

// ============================================================
//  LOCALISATION
//
//  Every player-facing string is sent as a RawMessage carrying a
//  translation KEY instead of literal text. Minecraft resolves the
//  key on each client with the resource pack's .lang files, so a
//  French player reads French and an English player reads English
//  on the very same server.
//
//  Keys live in:
//      PSU_RP/texts/en_US.lang
//      PSU_RP/texts/fr_FR.lang
//
//  Add a language by dropping another <locale>.lang next to them and
//  listing it in PSU_RP/texts/languages.json. No code change needed.
//
//  Keys are written WITHOUT their namespace in the code - t("load.title")
//  resolves to "<CONFIG.namespace>.load.title". That is what lets the
//  shared modules be dropped into two different add-ons without their
//  translation keys colliding when both are installed at once.
// ============================================================

const NAMESPACE = CONFIG.namespace ?? "psu";

/** Fully qualified key for a bare one. */
export function key(name) {
    return name.startsWith(NAMESPACE + ".") ? name : NAMESPACE + "." + name;
}

/** Build a RawMessage from a translation key. `%s` placeholders are
 *  filled, in order, with the extra arguments. */
export function t(name, ...args) {
    const translate = key(name);
    if (args.length === 0) return { translate };
    return { translate, with: args.map((a) => String(a)) };
}

/** Concatenate raw message parts; plain strings are passed through
 *  untranslated (used for values such as coordinates or item ids). */
export function raw(...parts) {
    return {
        rawtext: parts.map((p) => (typeof p === "string" ? { text: p } : p))
    };
}

/** Send a translated chat line. Never throws. */
export function tell(player, key, ...args) {
    try {
        player.sendMessage(t(key, ...args));
    } catch { /* player left, or chat unavailable */ }
}

/** Send an already-built RawMessage. Never throws. */
export function tellRaw(player, message) {
    try {
        player.sendMessage(message);
    } catch { /* player left, or chat unavailable */ }
}

/** Show a translated action-bar line. Never throws. */
export function bar(player, key, ...args) {
    try {
        player.onScreenDisplay.setActionBar(t(key, ...args));
    } catch { /* action bar unavailable */ }
}
