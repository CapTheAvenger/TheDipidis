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

    // Prozent locale-abhaengig, 2 Nachkommastellen. Nutzt app-utils.formatPercent
    // (de: "11,67 %", en: "11.67%"); faellt bei fehlendem Helfer sprachbewusst
    // zurueck, damit die deutsche UI nie einen Punkt-Dezimaltrenner zeigt
    // (Audit 2, F10).
    function _calcPct(prob) {
        if (typeof formatPercent === 'function') return formatPercent(prob, 2);
        const de = (typeof getLang === 'function' && getLang() === 'de');
        const s = Number(prob).toFixed(2);
        return de ? s.replace('.', ',') + ' %' : s + '%';
    }

    /**
     * Klemmen und es sagen (20.08.2026).
     *
     * Bisher wurde jede Eingabe still in den gueltigen Bereich gezogen,
     * ohne das Feld anzufassen. Auf dem Bildschirm stand dann eine Zahl,
     * mit der NICHT gerechnet wurde:
     *
     *     Kopien 0   ->  gerechnet mit 1  ->  Anzeige "11,67 %"
     *     Deck 0     ->  gerechnet mit 1  ->  Anzeige "100,00 %"
     *
     * Beides sieht aus wie ein Ergebnis fuer die eingegebene Zahl. Jetzt
     * wird der geklemmte Wert ins Feld zurueckgeschrieben und das Feld
     * kurz markiert — die Rechnung und das, was dasteht, sagen wieder
     * dasselbe.
     */
    function leseUndKlemme(id, fallback, min, max) {
        const el = document.getElementById(id);
        const roh = getInputNumber(id, fallback);
        const wert = clamp(roh, min, max);
        if (el && roh !== wert && String(el.value).trim() !== '') {
            el.value = String(wert);
            el.classList.add('calc-input-geklemmt');
            el.setAttribute('title', (typeof getLang === 'function' && getLang() === 'de')
                ? `Wert auf den gültigen Bereich ${min}–${max} gesetzt — gerechnet wird mit ${wert}.`
                : `Value set to the valid range ${min}–${max} — the calculation uses ${wert}.`);
            clearTimeout(el._klemmTimer);
            el._klemmTimer = setTimeout(() => {
                el.classList.remove('calc-input-geklemmt');
            }, 1600);
        } else if (el && roh === wert) {
            el.classList.remove('calc-input-geklemmt');
            el.removeAttribute('title');
        }
        return wert;
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

        const deckSize = leseUndKlemme('calc-deck-size', 60, 1, 99);
        const copies = leseUndKlemme('calc-copies', 1, 1, deckSize);
        const drawn = leseUndKlemme('calc-drawn', 7, 1, deckSize);
        const inHand = leseUndKlemme('calc-in-hand', 0, 0, copies);

        // Verbleibende Karten im Deck nach Hand und Preisen
        const remaining = Math.max(deckSize - drawn - 6, 0);
        const remainingEl = document.getElementById('calc-remaining-deck');
        if (remainingEl) remainingEl.textContent = remaining;

        // 1. Wahrscheinlichkeit mindestens 1 beim Ziehen (z.B. Starthand)
        const drawProb = probabilityAtLeastOne(deckSize, copies, drawn);
        const drawResEl = document.getElementById('res-draw');
        // Locale-abhaengig formatieren (de: "11,67 %", en: "11.67%") —
        // konsistent mit app-utils.formatPercent statt rohem toFix(2)+'%',
        // das in der deutschen UI einen Punkt-Dezimaltrenner zeigte
        // (Audit 2, F10, gemessen 21.08.2026).
        if (drawResEl) drawResEl.textContent = _calcPct(drawProb);

        // 2. Preiskarten-Wahrscheinlichkeit (mindestens 1 in den 6 Preiskarten)
        const copiesLeft = copies - inHand;
        const prizePool = deckSize - drawn; // Karten nach Starthand
        let prizeProb = 0;
        if (copiesLeft > 0 && prizePool >= 6) {
            prizeProb = probabilityAtLeastOne(prizePool, copiesLeft, 6);
        }
        const prizeResEl = document.getElementById('res-prize');
        if (prizeResEl) prizeResEl.textContent = _calcPct(prizeProb);

        // 3. Topdeck-Wahrscheinlichkeit (nächste Karte nach Hand + Preise)
        //
        // The denominator is the UNSEEN pool (deck + prizes), not the deck
        // alone. After the opening hand, deckSize - drawn cards are unseen;
        // six of them become prizes, but which six is unknown, so every unseen
        // card is equally likely to be sitting on top of the deck. Dividing by
        // deckSize - drawn - 6 while still counting every not-in-hand copy in
        // the numerator overstated the chance on every input, and could exceed
        // 100 % outright: deck 10, drawn 1, copies 4 gave 4/3 = 133 %.
        const unseen = Math.max(deckSize - drawn, 0);
        let topdeckProb = 0;
        if (remaining > 0 && copiesLeft > 0 && unseen > 0) {
            topdeckProb = Math.min(100, (copiesLeft / unseen) * 100);
        }
        const topdeckResEl = document.getElementById('res-topdeck');
        if (topdeckResEl) topdeckResEl.textContent = _calcPct(topdeckProb);

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

    /* Sprachwechsel: die drei Ergebniszahlen mitziehen.
     *
     * URSACHE (gemessen 30.08.2026): dieses Modul hatte keinen
     * languageChanged-Listener. Die Beschriftungen daneben haengen an
     * data-i18n und werden von i18n.js selbst umgeschrieben, die Zahlen
     * dagegen entstehen nur in updateCalculations() — und das lief
     * zuletzt beim Laden bzw. beim letzten Tastendruck im Eingabefeld.
     * FOLGE: nach dem Umschalten von Deutsch auf Englisch standen
     * "11,67 %", "11,32 %", "1,89 %" unter englischen Beschriftungen
     * (umgekehrt "11.67%", "11.32%", "1.89%" unter deutschen), also drei
     * Zahlen im Trennzeichen der abgewaehlten Sprache. Ein Punkt statt
     * eines Kommas ist in einer Prozentzahl kein Schoenheitsfehler: 11.67
     * und 11,67 sind in beiden Lesarten verschiedene Zahlen.
     *
     * Neu rechnen statt nur neu formatieren: updateCalculations() ist
     * reine Arithmetik auf den vier Eingabefeldern, kostet kein Netz und
     * keine Daten, und _calcPct() fragt getLang() beim Formatieren ab.
     * Der Wert bleibt derselbe, nur die Schreibweise folgt.
     *
     * Ohne Sichtbarkeitspruefung, aber nicht ohne Bedingung: das Modul
     * baut nichts auf, es beschreibt vier feste Felder aus index.html.
     * Fehlen die Felder, kehrt updateCalculations() von selbst zurueck —
     * ein Sprachwechsel kann hier also keinen ungeoeffneten Reiter
     * befuellen. Genau die Sichtbarkeitspruefung waere hier falsch: der
     * Rechner liegt in einem eigenen Reiter, und wer woanders umschaltet,
     * traefe sonst denselben Fehler wie die Heatmap (siehe
     * js/app-current-meta.js, 30.08.2026).
     */
    document.addEventListener('languageChanged', updateCalculations);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
