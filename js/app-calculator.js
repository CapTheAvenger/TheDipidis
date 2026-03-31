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

    function updateCalculations() {
        const deckSize = clamp(parseInt(document.getElementById('calc-deck-size').value) || 60, 1, 99);
        const copies = clamp(parseInt(document.getElementById('calc-copies').value) || 1, 1, deckSize);
        const drawn = clamp(parseInt(document.getElementById('calc-drawn').value) || 7, 1, deckSize);
        const inHand = clamp(parseInt(document.getElementById('calc-in-hand').value) || 0, 0, copies);

        // Verbleibende Karten im Deck nach Hand und Preisen
        const remaining = Math.max(deckSize - drawn - 6, 0);
        const remainingEl = document.getElementById('calc-remaining-deck');
        if (remainingEl) remainingEl.textContent = remaining;

        // 1. Wahrscheinlichkeit mindestens 1 beim Ziehen (z.B. Starthand)
        const drawProb = probabilityAtLeastOne(deckSize, copies, drawn);
        document.getElementById('res-draw').textContent = drawProb.toFixed(2) + '%';

        // 2. Preiskarten-Wahrscheinlichkeit (mindestens 1 in den 6 Preiskarten)
        const copiesLeft = copies - inHand;
        const prizePool = deckSize - drawn; // Karten nach Starthand
        let prizeProb = 0;
        if (copiesLeft > 0 && prizePool >= 6) {
            prizeProb = probabilityAtLeastOne(prizePool, copiesLeft, 6);
        }
        document.getElementById('res-prize').textContent = prizeProb.toFixed(2) + '%';

        // 3. Topdeck-Wahrscheinlichkeit (nächste Karte nach Hand + Preise)
        let topdeckProb = 0;
        if (remaining > 0 && copiesLeft > 0) {
            topdeckProb = (copiesLeft / remaining) * 100;
        }
        document.getElementById('res-topdeck').textContent = topdeckProb.toFixed(2) + '%';

        // Farbe der Hauptanzeige
        const drawEl = document.getElementById('res-draw');
        drawEl.className = 'calc-result-value';
        if (drawProb >= 70) drawEl.classList.add('calc-prob-high');
        else if (drawProb >= 40) drawEl.classList.add('calc-prob-mid');
        else drawEl.classList.add('calc-prob-low');
    }

    function init() {
        const inputs = document.querySelectorAll('.calc-input');
        inputs.forEach(function (input) {
            input.addEventListener('input', updateCalculations);
        });
        updateCalculations();
    }

    window.updateCalculations = updateCalculations;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
