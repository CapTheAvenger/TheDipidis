// @ts-check
/**
 * card-key.js — canonical card-key utility.
 *
 * The codebase historically used "CardName (SET NUMBER)" as the unique
 * identifier for a specific print of a card: e.g. "Boss's Orders (RCL 189)".
 * Parsing this string is currently done via ad-hoc regexes scattered across
 * 9+ files with subtly different patterns (some only accept digits as
 * number, some allow dashes in set codes, some allow alphanumerics, some
 * don't). This module centralises the parse + format helpers so future
 * call-sites can deduplicate.
 *
 * Wave-2 Card-PK foundation: by funnelling all parsing through this
 * module we make it cheap to later switch to a structured
 * `{ name, setCode, number }` representation everywhere; the parse and
 * format helpers below are the migration boundary.
 *
 * Tolerant regex: accepts ASCII letters, digits, and dashes for both the
 * set code (e.g. "RCL", "SVI", "PR-SV") and the number (e.g. "189",
 * "TG14", "12a", "SV001"). Whitespace inside the card name is preserved.
 */

const KEY_REGEX = /^(.+?)\s+\(([A-Za-z0-9-]+)\s+([A-Za-z0-9-]+)\)\s*$/;

/**
 * Parse a deck-key string into its components. Returns null when the
 * string is a bare card name (no `(SET NUMBER)` suffix) or otherwise
 * unparseable.
 *
 * @param {string} key
 * @returns {{ name: string, setCode: string, number: string } | null}
 */
export function parseCardKey(key) {
    if (!key || typeof key !== 'string') return null;
    const m = key.match(KEY_REGEX);
    if (!m) return null;
    return { name: m[1].trim(), setCode: m[2], number: m[3] };
}

/**
 * Format a (name, set, number) tuple into the canonical deck-key string.
 * When set or number is missing/empty, returns just the trimmed name —
 * used for "name-only" keys when the print info isn't known.
 *
 * @param {string} name
 * @param {string} [setCode]
 * @param {string} [number]
 * @returns {string}
 */
export function formatCardKey(name, setCode, number) {
    const n = (name || '').toString().trim();
    if (!setCode || !number) return n;
    return `${n} (${setCode} ${number})`;
}

/**
 * Return just the card name from a deck-key, or the input itself if
 * there's no print-suffix.
 *
 * @param {string} key
 * @returns {string}
 */
export function getCardName(key) {
    const parsed = parseCardKey(key);
    return parsed ? parsed.name : (key || '').toString().trim();
}

/**
 * Predicate: does this key carry print info (set + number), or is it
 * just a bare card name?
 *
 * @param {string} key
 * @returns {boolean}
 */
export function hasPrintInfo(key) {
    return parseCardKey(key) !== null;
}

/**
 * Build a print-id "SET-NUMBER" from a deck-key or parsed object.
 * Used as a Set/Map key for deduplicating prints across formats.
 *
 * @param {string | { setCode: string, number: string }} keyOrParsed
 * @returns {string | null}  null when the input has no print info
 */
export function printId(keyOrParsed) {
    if (!keyOrParsed) return null;
    let setCode, number;
    if (typeof keyOrParsed === 'string') {
        const p = parseCardKey(keyOrParsed);
        if (!p) return null;
        setCode = p.setCode;
        number = p.number;
    } else {
        setCode = keyOrParsed.setCode;
        number = keyOrParsed.number;
    }
    if (!setCode || !number) return null;
    return `${setCode}-${number}`;
}
