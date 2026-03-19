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
        showToast('Dein Deck ist leer! Füge erst Karten hinzu.', 'warning');
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

        for (let i = 0; i < count; i++) {
            _simulatorDeck.push({ name: cardName, imageUrl });
        }
    }

    document.getElementById('drawSimulatorModal').style.display = 'flex';
    _comboTargets = [];
    drawNewHand();
    _renderComboCardList();
    _renderComboTargets();
    document.getElementById('comboResultDisplay').textContent = '';
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
        showToast('Keine Karten mehr im Deck!', 'warning');
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
// Combo-Wahrscheinlichkeit (Monte-Carlo)
// -------------------------------------------------------

function _renderComboCardList() {
    const container = document.getElementById('comboCardList');
    if (!container) return;
    container.innerHTML = '';

    // Build unique card names from the deck
    const seen = new Set();
    const uniqueCards = [];
    _simulatorDeck.forEach(c => {
        if (!seen.has(c.name)) {
            seen.add(c.name);
            const count = _simulatorDeck.filter(d => d.name === c.name).length;
            uniqueCards.push({ name: c.name, imageUrl: c.imageUrl, count });
        }
    });
    uniqueCards.sort((a, b) => a.name.localeCompare(b.name));

    uniqueCards.forEach(card => {
        const isSelected = _comboTargets.includes(card.name);
        const row = document.createElement('div');
        row.style.cssText = `display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-bottom:1px solid #222;transition:background 0.15s;${isSelected ? 'background:#1a3a1a;' : ''}`;
        row.onmouseenter = function() { this.style.background = isSelected ? '#1a4a1a' : '#222'; };
        row.onmouseleave = function() { this.style.background = isSelected ? '#1a3a1a' : ''; };
        row.onclick = () => _toggleComboTarget(card.name);

        const img = document.createElement('img');
        img.src = card.imageUrl;
        img.style.cssText = 'width:32px;height:45px;object-fit:cover;border-radius:3px;';
        img.onerror = function() { this.src = 'images/card-back.png'; };

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'flex:1;font-size:12px;color:#ddd;';
        nameSpan.textContent = card.name;

        const countSpan = document.createElement('span');
        countSpan.style.cssText = 'font-size:11px;color:#888;min-width:24px;text-align:right;';
        countSpan.textContent = `×${card.count}`;

        const checkSpan = document.createElement('span');
        checkSpan.style.cssText = `font-size:14px;min-width:20px;text-align:center;color:${isSelected ? '#2ecc71' : '#555'};`;
        checkSpan.textContent = isSelected ? '✅' : '◻️';

        row.appendChild(img);
        row.appendChild(nameSpan);
        row.appendChild(countSpan);
        row.appendChild(checkSpan);
        container.appendChild(row);
    });
}

function _toggleComboTarget(cardName) {
    const idx = _comboTargets.indexOf(cardName);
    if (idx >= 0) {
        _comboTargets.splice(idx, 1);
    } else {
        if (_comboTargets.length >= 4) {
            showToast('Maximal 4 Karten auswählbar!', 'warning');
            return;
        }
        _comboTargets.push(cardName);
    }
    _renderComboTargets();
    _renderComboCardList();
}

function _renderComboTargets() {
    const container = document.getElementById('comboTargetBadges');
    if (!container) return;
    container.innerHTML = '';

    if (_comboTargets.length === 0) {
        container.innerHTML = '<span style="font-size:12px;color:#666;font-style:italic;">Keine Karten ausgewählt — klicke unten, um Ziel-Karten zu wählen</span>';
        return;
    }

    _comboTargets.forEach(name => {
        const badge = document.createElement('span');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:#2ecc71;color:#000;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;';
        badge.title = 'Klick zum Entfernen';
        badge.textContent = name + ' ✕';
        badge.onclick = () => _toggleComboTarget(name);
        container.appendChild(badge);
    });
}

function clearComboTargets() {
    _comboTargets = [];
    _renderComboTargets();
    _renderComboCardList();
    document.getElementById('comboResultDisplay').textContent = '';
}

function calculateComboChance(deck, targetCardNames) {
    if (!targetCardNames || targetCardNames.length === 0) return 0;

    const ITERATIONS = 10000;
    let successCount = 0;

    for (let i = 0; i < ITERATIONS; i++) {
        // 1. Deck kopieren und mischen (Fisher-Yates)
        let simDeck = [...deck];
        for (let j = simDeck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [simDeck[j], simDeck[k]] = [simDeck[k], simDeck[j]];
        }

        // 2. 7 Starthandkarten ziehen
        let simHand = simDeck.slice(0, 7).map(c => c.name);

        // 3. Prüfen, ob ALLE gewählten Ziel-Karten mindestens 1x in der Hand sind
        let hasAllTargets = targetCardNames.every(target => simHand.includes(target));

        if (hasAllTargets) successCount++;
    }

    return ((successCount / ITERATIONS) * 100).toFixed(1);
}

function runComboCalculation() {
    if (_comboTargets.length === 0) {
        showToast('Wähle mindestens eine Ziel-Karte aus!', 'warning');
        return;
    }

    const display = document.getElementById('comboResultDisplay');
    if (display) display.textContent = '⏳ Berechne...';

    // Use setTimeout to let the UI update before heavy computation
    setTimeout(() => {
        const chance = calculateComboChance(_simulatorDeck, _comboTargets);
        if (display) {
            const color = chance >= 50 ? '#2ecc71' : chance >= 25 ? '#f39c12' : '#e74c3c';
            display.style.color = color;
            display.textContent = `${chance}% Chance`;
        }
    }, 50);
}
