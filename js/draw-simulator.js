// =============================================================
// STARTHAND SIMULATOR (Draw Tester)
// =============================================================

let _simulatorDeck = [];   // flattened + shuffled deck
let _simulatorHand = [];   // cards currently on hand
let _comboTargets  = [];   // selected target card names for combo calc

// -------------------------------------------------------
// Public entry point – called by onclick buttons in HTML
// -------------------------------------------------------
function openDrawSimulator(source) {
    const deckObj = source === 'cityLeague'  ? (window.cityLeagueDeck  || {})
                  : source === 'currentMeta' ? (window.currentMetaDeck || {})
                  : source === 'pastMeta'    ? (window.pastMetaDeck    || {})
                  : {};

    const totalCards = Object.values(deckObj).reduce((s, c) => s + c, 0);
    if (totalCards === 0) {
        showToast(t('pt.deckEmpty'), 'warning');
        return;
    }

    // Flatten {deckKey: count} → [{name, imageUrl}, ...] (one entry per copy)
    _simulatorDeck = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
        if (!count || count <= 0) continue;

        let cardName = deckKey;
        let imageUrl = 'images/card-back.png';

        // Parse "CardName (SET NUM)" format
        const setMatch = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        if (setMatch) {
            cardName = setMatch[1];
            const cardData = _simFindCard(setMatch[2], setMatch[3]);
            if (cardData && cardData.image_url) imageUrl = cardData.image_url;
        } else {
            // Legacy name-only key
            const cardData = window.allCardsDatabase &&
                             window.allCardsDatabase.find(c => c.name === cardName);
            if (cardData && cardData.image_url) imageUrl = cardData.image_url;
        }

        // Ist das ein Basis-Pokemon? Ohne diese Angabe kann der
        // Kombo-Rechner die Mulligan-Regel nicht anwenden — siehe die
        // lange Notiz bei _calculateComboChanceSync().
        //
        // null heisst "unbekannt", nicht "nein": wenn die Kartendatenbank
        // noch nicht geladen ist, darf die Regel nicht auf einer
        // geratenen Null stehen.
        const istBasis = _simIstBasis(deckKey, cardName);

        for (let i = 0; i < count; i++) {
            _simulatorDeck.push({ name: cardName, imageUrl, basis: istBasis });
        }
    }

    document.getElementById('drawSimulatorModal').style.display = 'flex';
    _comboTargets = [];
    drawNewHand();
    _populateComboDropdowns();
    _renderComboTargets();
    document.getElementById('comboResultDisplay').textContent = '';
}

/**
 * Basis-Pokemon oder nicht — aus derselben Quelle und mit demselben
 * Weg wie updateOpeningHandStats() in js/app-features.js: type === 'Basic'
 * in window.allCardsDatabase, erst ueber (Set, Nummer), dann ueber den
 * Namen.
 *
 * Rueckgabe true / false / null. null heisst ausdruecklich "unbekannt":
 * ohne geladene Kartendatenbank waere jedes false geraten, und auf einer
 * geratenen Null darf keine Mulligan-Regel stehen.
 */
function _simIstBasis(deckKey, cardName) {
    const db = window.allCardsDatabase;
    if (!Array.isArray(db) || !db.length) return null;
    const setMatch = String(deckKey).match(/\(([A-Z0-9-]+)\s+([^)]+)\)$/);
    if (setMatch) {
        const hit = (window.cardsBySetNumberMap
            && window.cardsBySetNumberMap[`${setMatch[1]}-${setMatch[2]}`])
            || db.find(c => c.set === setMatch[1] && c.number === setMatch[2]);
        if (hit) return hit.type === 'Basic';
    }
    const name = String(cardName || '').trim();
    const hit = db.find(c => c.name === name);
    if (hit) return hit.type === 'Basic';
    return null;
}

function closeDrawSimulator() {
    document.getElementById('drawSimulatorModal').style.display = 'none';
}

// -------------------------------------------------------
// Card-image lookup helper
// -------------------------------------------------------
function _simFindCard(setCode, setNumber) {
    if (window.cardsBySetNumberMap) {
        const hit = window.cardsBySetNumberMap[`${setCode}-${setNumber}`];
        if (hit) return hit;
    }
    if (window.allCardsDatabase) {
        return window.allCardsDatabase.find(c => c.set === setCode && c.number === setNumber) || null;
    }
    return null;
}

// -------------------------------------------------------
// Core simulator actions
// -------------------------------------------------------
function drawNewHand() {
    _shuffleFisherYates(_simulatorDeck);
    _simulatorHand = _simulatorDeck.slice(0, 7);
    _renderSimulatorHand();
}

function drawExtraCard() {
    if (_simulatorHand.length >= _simulatorDeck.length) {
        showToast(t('draw.noCardsLeft'), 'warning');
        return;
    }
    _simulatorHand.push(_simulatorDeck[_simulatorHand.length]);
    _renderSimulatorHand();
}

// Fisher-Yates shuffle (in-place)
function _shuffleFisherYates(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// -------------------------------------------------------
// Render
// -------------------------------------------------------
function _renderSimulatorHand() {
    const grid = document.getElementById('simulatorHandGrid');
    if (!grid) return;
    grid.innerHTML = '';

    _simulatorHand.forEach((card, index) => {
        const img = document.createElement('img');
        img.src       = card.imageUrl;
        img.alt       = card.name;
        img.title     = card.name;
        img.className = 'simulator-card';
        img.style.animationDelay = `${index * 0.08}s`;
        img.onerror   = function () { this.src = 'images/card-back.png'; };
        grid.appendChild(img);
    });

    const remaining = _simulatorDeck.length - _simulatorHand.length;
    const el = document.getElementById('simulatorDeckCount');
    if (el) el.innerText = remaining;
}

// -------------------------------------------------------
// Combo probability (Monte Carlo)
// -------------------------------------------------------

function _getUniqueDeckCardNames() {
    const unique = [...new Set(_simulatorDeck.map(c => c.name))];
    unique.sort((a, b) => a.localeCompare(b));
    return unique;
}

function _populateComboDropdowns() {
    const cardNames = _getUniqueDeckCardNames();
    for (let i = 1; i <= 4; i++) {
        const select = document.getElementById(`comboTarget${i}`);
        if (!select) continue;

        const currentValue = select.value;
        select.innerHTML = `<option value="">-- ${t('draw.selectTarget')} --</option>`;
        cardNames.forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });

        if (currentValue && cardNames.includes(currentValue)) {
            select.value = currentValue;
        } else {
            select.value = '';
        }
    }
}

function onComboDropdownChange() {
    const selected = [];
    for (let i = 1; i <= 4; i++) {
        const value = document.getElementById(`comboTarget${i}`)?.value || '';
        if (value && !selected.includes(value)) selected.push(value);
    }

    if (selected.length > 4) {
        showToast(t('draw.max4Cards'), 'warning');
        return;
    }

    _comboTargets = selected;
    _renderComboTargets();
}

function _renderComboTargets() {
    const container = document.getElementById('comboTargetBadges');
    if (!container) return;
    container.innerHTML = '';

    if (_comboTargets.length === 0) {
        container.innerHTML = `<span style="font-size:12px;color:#666;font-style:italic;">${t('draw.noCardsSelected')}</span>`;
        return;
    }

    _comboTargets.forEach(name => {
        // Ein Knopf, kein span: die Marke ist anklickbar, also muss sie
        // mit der Tastatur erreichbar sein und sich als Bedienelement
        // ansagen. Das Aussehen liegt in .draw-sim-combo-badge
        // (ui-components.css) statt in einer Stil-Zeichenkette hier.
        const badge = document.createElement('button');
        badge.type = 'button';
        badge.className = 'draw-sim-combo-badge';
        badge.title = t('draw.clickToRemove');
        badge.setAttribute('aria-label', name + ' — ' + t('draw.clickToRemove'));
        badge.textContent = name + ' ✕';
        badge.addEventListener('click', () => _removeComboTarget(name));
        container.appendChild(badge);
    });
}

// Die Marken versprachen seit jeher "zum Entfernen klicken" und riefen
// dabei _toggleComboTarget() auf - eine Funktion, die es in dieser
// Datei nie gab. Jeder Klick war ein ReferenceError in der Konsole und
// sonst nichts. Entfernen heisst zweierlei: aus der Liste raus UND das
// Auswahlfeld leeren, das den Namen gesetzt hat. Sonst holt der
// naechste onComboDropdownChange() ihn sofort zurueck.
function _removeComboTarget(name) {
    _comboTargets = _comboTargets.filter(n => n !== name);
    for (let i = 1; i <= 4; i++) {
        const select = document.getElementById(`comboTarget${i}`);
        if (select && select.value === name) select.value = '';
    }
    _renderComboTargets();
    const result = document.getElementById('comboResultDisplay');
    if (result && _comboTargets.length === 0) result.textContent = '';
}

function clearComboTargets() {
    _comboTargets = [];
    for (let i = 1; i <= 4; i++) {
        const select = document.getElementById(`comboTarget${i}`);
        if (select) select.value = '';
    }
    _renderComboTargets();
    document.getElementById('comboResultDisplay').textContent = '';
}

function calculateComboChance(deck, targetCardNames) {
    if (!targetCardNames || targetCardNames.length === 0) return Promise.resolve(0);

    const namen = deck.map(c => c.name);
    const basis = deck.map(c => (c && typeof c.basis === 'boolean') ? c.basis : null);
    const synchron = () => {
        const e = _komboSimulation(namen, basis, targetCardNames, KOMBO_ITERATIONEN);
        return e;
    };

    // Use Web Worker if available to avoid blocking main thread
    if (window.Worker) {
        return new Promise((resolve) => {
            // Mit Versionsstempel: der Worker haengt an keinem
            // <script>-Tag und bekaeme sonst nie einen Cache-Bruch.
            const worker = new Worker('js/combo-worker.js'
                + (window.APP_VERSION ? '?v=' + window.APP_VERSION : ''));
            worker.onmessage = function(e) {
                resolve(e.data);
                worker.terminate();
            };
            worker.onerror = function() {
                // Fallback to synchronous calculation
                resolve(synchron());
                worker.terminate();
            };
            worker.postMessage({
                deck: namen,
                basis: basis,
                targetCardNames: targetCardNames,
                iterations: KOMBO_ITERATIONEN
            });
        });
    }

    // Fallback for browsers without Web Worker support
    return Promise.resolve(synchron());
}

/**
 * Kombo-Wahrscheinlichkeit — jetzt mit der Mulligan-Regel (20.08.2026).
 *
 * Der Simulator mischte, zog sieben Karten und zaehlte den Treffer. Eine
 * Starthand ohne Basis-Pokemon zaehlte dabei als Fehlschlag — im Spiel
 * gibt es sie aber gar nicht: sie wird zurueckgemischt und neu gezogen.
 * Die gezeigte Wahrscheinlichkeit war deshalb keine Wahrscheinlichkeit
 * fuer eine Starthand, sondern fuer sieben zufaellige Karten.
 *
 * Die Richtung ueberrascht: die Regel macht die Zahl KLEINER, nicht
 * groesser. Eine Hand, die ein Basis-Pokemon enthalten muss, hat einen
 * Platz weniger fuer die Zielkarte. Gemessen ueber je 400.000 Ziehungen
 * bei 60 Karten:
 *
 *     9 Basics, 4 Zielkopien   40,0 %  ->  37,5 %   (-2,5 pp)
 *     9 Basics, 2 Zielkopien   22,2 %  ->  20,5 %   (-1,7 pp)
 *     6 Basics, 4 Zielkopien   39,9 %  ->  36,9 %   (-3,0 pp)
 *    14 Basics, 4 Zielkopien   39,9 %  ->  38,5 %   (-1,4 pp)
 *
 * Je weniger Basics, desto groesser der Abstand — genau umgekehrt zur
 * Intuition, die eine schlechte Mulligan-Rate fuer folgenlos haelt.
 *
 * Zwei Faelle, in denen die Regel NICHT angewendet wird, und beide
 * werden zurueckgemeldet statt still behandelt:
 *   * Die Kartendatenbank ist nicht geladen — dann ist bei jeder Karte
 *     unbekannt, ob sie ein Basis-Pokemon ist. Auf einer geratenen Null
 *     darf keine Regel stehen.
 *   * Das Deck enthaelt gar kein Basis-Pokemon. Dann gibt es keine
 *     haltbare Starthand, und die Schleife liefe endlos.
 */
const KOMBO_ITERATIONEN = 10000;
const MULLIGAN_MAX = 100;   // Sicherheitsnetz gegen eine Endlosschleife

function _calculateComboChanceSync(deck, targetCardNames) {
    const namen = deck.map(c => c.name);
    const basis = deck.map(c => (c && typeof c.basis === 'boolean') ? c.basis : null);
    const erg = _komboSimulation(namen, basis, targetCardNames, KOMBO_ITERATIONEN);
    return erg.chance;
}

/**
 * Der eigentliche Lauf. Getrennt von der Aufrufseite, damit der Test und
 * der Web Worker denselben Weg gehen koennen wie die Seite.
 * Liefert { chance, mulliganAngewendet, grund, mulliganRate }.
 */
function _komboSimulation(namen, basis, ziele, iterationen) {
    const n = namen.length;
    const unbekannt = basis.some(b => b === null);
    const hatBasis = basis.some(b => b === true);
    const mulligan = !unbekannt && hatBasis;
    const grund = unbekannt ? 'kartendaten-fehlen' : (hatBasis ? '' : 'keine-basis');

    let treffer = 0, verworfen = 0, gezogen = 0;
    const idx = Array.from({ length: n }, (_, i) => i);

    for (let i = 0; i < iterationen; i++) {
        let hand = null;
        for (let versuch = 0; versuch < (mulligan ? MULLIGAN_MAX : 1); versuch++) {
            // Teil-Fisher-Yates: nur die ersten sieben Plaetze muessen
            // stimmen, das spart bei 60 Karten den grossen Rest.
            for (let j = 0; j < 7 && j < n; j++) {
                const k = j + Math.floor(Math.random() * (n - j));
                const t = idx[j]; idx[j] = idx[k]; idx[k] = t;
            }
            const zieh = idx.slice(0, Math.min(7, n));
            gezogen++;
            if (!mulligan || zieh.some(x => basis[x] === true)) { hand = zieh; break; }
            verworfen++;
        }
        if (!hand) continue;   // sollte nie eintreten, siehe MULLIGAN_MAX
        const inHand = hand.map(x => namen[x]);
        if (ziele.every(z => inHand.includes(z))) treffer++;
    }

    return {
        chance: ((treffer / iterationen) * 100).toFixed(1),
        mulliganAngewendet: mulligan,
        grund,
        mulliganRate: gezogen > 0 ? (verworfen / gezogen) * 100 : 0,
    };
}

if (typeof window !== 'undefined') {
    window._komboSimulation = _komboSimulation;
    window.KOMBO_ITERATIONEN = KOMBO_ITERATIONEN;
}

function runComboCalculation() {
    if (_comboTargets.length === 0) {
        showToast(t('draw.selectAtLeastOne'), 'warning');
        return;
    }

    const display = document.getElementById('comboResultDisplay');
    if (display) display.textContent = `${t('draw.calculating')}`;

    calculateComboChance(_simulatorDeck, _comboTargets).then(erg => {
        if (!display) return;
        const chance = (erg && erg.chance != null) ? erg.chance : erg;
        const wert = parseFloat(chance);
        const color = wert >= 50 ? '#2ecc71' : wert >= 25 ? '#f39c12' : '#e74c3c';
        display.style.color = color;
        // Wonach gerechnet wurde, gehoert an die Zahl. Ohne den Zusatz
        // sieht eine Rechnung mit Mulligan-Regel genauso aus wie eine
        // ohne — und die beiden weichen um bis zu drei Prozentpunkte ab.
        const de = (typeof getLang === 'function' ? getLang() : 'de') === 'de';
        let zusatz = '';
        if (erg && erg.mulliganAngewendet) {
            zusatz = de
                ? ` · mit Mulligan-Regel (${window.formatPercent(erg.mulliganRate || 0, 0)} neu gezogen)`
                : ` · mulligan rule applied (${window.formatPercent(erg.mulliganRate || 0, 0)} redrawn)`;
        } else if (erg && erg.grund === 'keine-basis') {
            zusatz = de
                ? ' · ohne Mulligan-Regel — im Deck steht kein Basis-Pokémon'
                : ' · without the mulligan rule — no Basic Pokémon in this deck';
        } else if (erg && erg.grund === 'kartendaten-fehlen') {
            zusatz = de
                ? ' · ohne Mulligan-Regel — Kartendaten nicht geladen'
                : ' · without the mulligan rule — card data not loaded';
        }
        /* formatPercent, nicht String-Verkettung: die Zahl kommt als
           "47.1" aus dem Worker und stand dadurch als "47.1% Chance"
           neben "0,66€" in derselben Ansicht. Gefunden bei der
           Live-Pruefung am 06.09.2026. */
        display.textContent = `${window.formatPercent(wert, 1)} ${de ? 'Chance' : 'chance'}`;
        const hinweisId = 'comboResultHinweis';
        let hinweis = document.getElementById(hinweisId);
        if (!hinweis) {
            hinweis = document.createElement('div');
            hinweis.id = hinweisId;
            hinweis.className = 'combo-result-hinweis';
            display.parentNode && display.parentNode.insertBefore(hinweis, display.nextSibling);
        }
        hinweis.textContent = zusatz ? zusatz.replace(/^ · /, '') : '';
    });
}
