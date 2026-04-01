// js/app-calculator.js

(function () {
    function combinations(n, k) {
        if (k < 0 || k > n) return 0;
        if (k === 0 || k === n) return 1;
        let c = 1;
        for (let i = 1; i <= k; i++) {
            c = c * (n - i + 1) / i;
        }
        return c;
    }

    function hypergeom(deckSize, copiesInDeck, cardsDrawn, targetCopies) {
        const successCombos = combinations(copiesInDeck, targetCopies);
        const failCombos = combinations(deckSize - copiesInDeck, cardsDrawn - targetCopies);
        const totalCombos = combinations(deckSize, cardsDrawn);
        if (totalCombos === 0) return 0;
        return (successCombos * failCombos) / totalCombos;
    }

    function probabilityAtLeastOne(deckSize, copiesInDeck, cardsDrawn) {
        if (copiesInDeck <= 0 || cardsDrawn <= 0) return 0;
        return (1 - hypergeom(deckSize, copiesInDeck, cardsDrawn, 0)) * 100;
    }

    function clamp(val, min, max) {
        return Math.max(min, Math.min(max, val));
    }

    function getInputNumber(id, fallback) {
        const el = document.getElementById(id);
        if (!el) return fallback;
        const parsed = parseInt(el.value, 10);
        return Number.isNaN(parsed) ? fallback : parsed;
    }

    function updateCalculations() {
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

        // Verbleibende Karten im Deck nach Hand und Preisen
        const remaining = Math.max(deckSize - drawn - 6, 0);
        const remainingEl = document.getElementById('calc-remaining-deck');
        if (remainingEl) remainingEl.textContent = remaining;

        // 1. Wahrscheinlichkeit mindestens 1 beim Ziehen (z.B. Starthand)
        const drawProb = probabilityAtLeastOne(deckSize, copies, drawn);
        const drawResEl = document.getElementById('res-draw');
        if (drawResEl) drawResEl.textContent = drawProb.toFixed(2) + '%';

        // 2. Preiskarten-Wahrscheinlichkeit (mindestens 1 in den 6 Preiskarten)
        const copiesLeft = copies - inHand;
        const prizePool = deckSize - drawn; // Karten nach Starthand
        let prizeProb = 0;
        if (copiesLeft > 0 && prizePool >= 6) {
            prizeProb = probabilityAtLeastOne(prizePool, copiesLeft, 6);
        }
        const prizeResEl = document.getElementById('res-prize');
        if (prizeResEl) prizeResEl.textContent = prizeProb.toFixed(2) + '%';

        // 3. Topdeck-Wahrscheinlichkeit (nächste Karte nach Hand + Preise)
        let topdeckProb = 0;
        if (remaining > 0 && copiesLeft > 0) {
            topdeckProb = (copiesLeft / remaining) * 100;
        }
        const topdeckResEl = document.getElementById('res-topdeck');
        if (topdeckResEl) topdeckResEl.textContent = topdeckProb.toFixed(2) + '%';

        // Farbe der Hauptanzeige
            const drawEl = document.getElementById('res-draw');
            if (drawEl) {
                drawEl.className = 'calc-result-value';
                if (drawProb >= 70) drawEl.classList.add('calc-prob-high');
                else if (drawProb >= 40) drawEl.classList.add('calc-prob-mid');
                else drawEl.classList.add('calc-prob-low');
            }
        } catch (err) {
            // Do not break app startup if calculator UI is not mounted yet.
            console.warn('[Calculator] updateCalculations failed:', err);
        }
    }

    function init() {
        try {
            const calculatorRoot = document.getElementById('calculator');
            const inputs = calculatorRoot
                ? calculatorRoot.querySelectorAll('.calc-input')
                : document.querySelectorAll('#calculator .calc-input');
            inputs.forEach(function (input) {
                input.addEventListener('input', updateCalculations);
            });
            updateCalculations();
        } catch (err) {
            console.warn('[Calculator] init failed:', err);
        }
    }

    window.updateCalculations = updateCalculations;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
