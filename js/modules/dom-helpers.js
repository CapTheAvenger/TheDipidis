// @ts-check
/**
 * dom-helpers.js — typed DOM-element getters.
 *
 * Wave-1 L2.2d: legacy modules call document.getElementById('foo').value
 * everywhere. TypeScript only knows the result is HTMLElement, so .value /
 * .disabled / .checked / .options / .dataset all fail to type-check
 * mechanically across hundreds of call sites.
 *
 * Per-callsite JSDoc casts work but are tedious. This helper centralises
 * the narrowing: callers write `dom.input('id').value` and the type system
 * knows the result is HTMLInputElement (or null, if not found).
 *
 * No runtime cost — they're thin wrappers over getElementById that
 * happen to ALSO be typed. Existing callsites can migrate
 * incrementally; nothing forces them.
 *
 * Wave-1 L2.13 — converted from legacy IIFE to a proper ES module. The
 * modules-bundle footer also mirrors the export onto window.dom so
 * the 100+ existing dom.X(...) call-sites keep working unchanged.
 */

/**
 * Untyped getter that returns the element or null. Same as
 * document.getElementById but exposed under the dom.* namespace so
 * caller code reads as a unit.
 * @param {string} id
 * @returns {HTMLElement | null}
 */
function el(id) {
    return document.getElementById(id);
}

/**
 * Typed getter for <input>. Returns null when missing OR present-but-not-an-input.
 * @param {string} id
 * @returns {HTMLInputElement | null}
 */
function input(id) {
    const e = document.getElementById(id);
    return e instanceof HTMLInputElement ? e : null;
}

/**
 * Typed getter for <select>. Returns null when missing OR present-but-not-a-select.
 * @param {string} id
 * @returns {HTMLSelectElement | null}
 */
function select(id) {
    const e = document.getElementById(id);
    return e instanceof HTMLSelectElement ? e : null;
}

/**
 * Typed getter for <textarea>. Returns null when missing OR present-but-not-a-textarea.
 * @param {string} id
 * @returns {HTMLTextAreaElement | null}
 */
function textarea(id) {
    const e = document.getElementById(id);
    return e instanceof HTMLTextAreaElement ? e : null;
}

/**
 * Typed getter for <button>. Returns null when missing OR not a button.
 * @param {string} id
 * @returns {HTMLButtonElement | null}
 */
function button(id) {
    const e = document.getElementById(id);
    return e instanceof HTMLButtonElement ? e : null;
}

/**
 * Typed query for the first descendant that matches a selector AND
 * is the given subtype. Returns null otherwise.
 * @template {HTMLElement} T
 * @param {ParentNode} root
 * @param {string} selector
 * @param {new () => T} [Ctor]
 * @returns {T | null}
 */
function queryAs(root, selector, Ctor) {
    const found = root.querySelector(selector);
    if (!found) return null;
    if (Ctor && !(found instanceof Ctor)) return null;
    return /** @type {T} */ (found);
}

/** Same as queryAs but for <input>. */
function queryInput(root, selector) {
    const found = root.querySelector(selector);
    return found instanceof HTMLInputElement ? found : null;
}

/** Same as queryAs but for <select>. */
function querySelect(root, selector) {
    const found = root.querySelector(selector);
    return found instanceof HTMLSelectElement ? found : null;
}

/**
 * Cast a known-non-null Element to HTMLElement. Use when you're sure the
 * target is a normal HTML element (not SVG, not generic Element) but the
 * type system can't see it (e.g. inside querySelectorAll().forEach()
 * callbacks).
 * @param {Element} e
 * @returns {HTMLElement}
 */
function asHTML(e) {
    return /** @type {HTMLElement} */ (e);
}

export const dom = {
    el,
    input,
    select,
    textarea,
    button,
    queryAs,
    queryInput,
    querySelect,
    asHTML,
};
// Legacy compat: also expose under window.dom for non-module callers.
/** @type {any} */ (window).dom = dom;
