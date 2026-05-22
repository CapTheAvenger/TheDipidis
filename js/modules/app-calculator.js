// @ts-check
// Wave-1 L2.4 — first real ES-module conversion.
//
// The deck-probability calculator: hypergeometric "at least one" odds for the
// starting hand, the prize zone, and the next topdeck. Pure DOM-driven; reads
// four inputs (deck-size / copies / drawn / in-hand) and updates four result
// nodes whenever any input fires.
//
// Previously: js/app-calculator.js, an IIFE that exposed `updateCalculations`
// onto `window` so HTML inline event handlers could call it. The hybrid
// bundle's modules-side footer copies every named export onto `window`, so
// that compatibility is preserved without manual aliasing here.

function combinations(/** @type {number} */ n, /** @type {number} */ k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let c = 1;
    for (let i = 1; i <= k; i++) {
        c = (c * (n - i + 1)) / i;
    }
    return c;
}

function hypergeom(
    /** @type {number} */ deckSize,
    /** @type {number} */ copiesInDeck,
    /** @type {number} */ cardsDrawn,
    /** @type {number} */ targetCopies
) {
    const successCombos = combinations(copiesInDeck, targetCopies);
    const failCombos = combinations(deckSize - copiesInDeck, cardsDrawn - targetCopies);
    const totalCombos = combinations(deckSize, cardsDrawn);
    if (totalCombos === 0) return 0;
    return (successCombos * failCombos) / totalCombos;
}

function probabilityAtLeastOne(
    /** @type {number} */ deckSize,
    /** @type {number} */ copiesInDeck,
    /** @type {number} */ cardsDrawn
) {
    if (copiesInDeck <= 0 || cardsDrawn <= 0) return 0;
    return (1 - hypergeom(deckSize, copiesInDeck, cardsDrawn, 0)) * 100;
}

function clamp(/** @type {number} */ val, /** @type {number} */ min, /** @type {number} */ max) {
    return Math.max(min, Math.min(max, val));
}

function getInputNumber(/** @type {string} */ id, /** @type {number} */ fallback) {
    const el = /** @type {HTMLInputElement | null} */ (document.getElementById(id));
    if (!el) return fallback;
    const parsed = parseInt(el.value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

export function updateCalculations() {
    try {
        const deckSizeEl = document.getElementById('calc-deck-size');
        const copiesEl = document.getElementById('calc-copies');
        const drawnEl = document.getElementById('calc-drawn');
        const inHandEl = document.getElementById('calc-in-hand');
        if (!deckSizeEl || !copiesEl || !drawnEl || !inHandEl) return;

        const deckSize = clamp(getInputNumber('calc-deck-size', 60), 1, 99);
        const copies = clamp(getInputNumber('calc-copies', 1), 1, deckSize);
        const drawn = clamp(getInputNumber('calc-drawn', 7), 1, deckSize);
        const inHand = clamp(getInputNumber('calc-in-hand', 0), 0, copies);

        const remaining = Math.max(deckSize - drawn - 6, 0);
        const remainingEl = document.getElementById('calc-remaining-deck');
        if (remainingEl) remainingEl.textContent = String(remaining);

        const drawProb = probabilityAtLeastOne(deckSize, copies, drawn);
        const drawResEl = document.getElementById('res-draw');
        if (drawResEl) drawResEl.textContent = drawProb.toFixed(2) + '%';

        const copiesLeft = copies - inHand;
        const prizePool = deckSize - drawn;
        let prizeProb = 0;
        if (copiesLeft > 0 && prizePool >= 6) {
            prizeProb = probabilityAtLeastOne(prizePool, copiesLeft, 6);
        }
        const prizeResEl = document.getElementById('res-prize');
        if (prizeResEl) prizeResEl.textContent = prizeProb.toFixed(2) + '%';

        let topdeckProb = 0;
        if (remaining > 0 && copiesLeft > 0) {
            topdeckProb = (copiesLeft / remaining) * 100;
        }
        const topdeckResEl = document.getElementById('res-topdeck');
        if (topdeckResEl) topdeckResEl.textContent = topdeckProb.toFixed(2) + '%';

        const drawEl = document.getElementById('res-draw');
        if (drawEl) {
            drawEl.className = 'calc-result-value';
            if (drawProb >= 70) drawEl.classList.add('calc-prob-high');
            else if (drawProb >= 40) drawEl.classList.add('calc-prob-mid');
            else drawEl.classList.add('calc-prob-low');
        }
    } catch (err) {
        // Don't break app startup if the calculator UI isn't mounted yet.
        console.warn('[Calculator] updateCalculations failed:', err);
    }
}

function init() {
    try {
        const calculatorRoot = document.getElementById('calculator');
        const inputs = calculatorRoot
            ? calculatorRoot.querySelectorAll('.calc-input')
            : document.querySelectorAll('#calculator .calc-input');
        inputs.forEach((input) => {
            input.addEventListener('input', updateCalculations);
        });
        updateCalculations();
    } catch (err) {
        console.warn('[Calculator] init failed:', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
