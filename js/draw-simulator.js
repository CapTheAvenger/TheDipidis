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

        for (let i = 0; i < count; i++) {
            _simulatorDeck.push({ name: cardName, imageUrl });
        }
    }

    document.getElementById('drawSimulatorModal').style.display = 'flex';
    _comboTargets = [];
    drawNewHand();
    _populateComboDropdowns();
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
        const badge = document.createElement('span');
        badge.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:#2ecc71;color:#000;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;cursor:pointer;';
        badge.title = t('draw.clickToRemove');
        badge.textContent = name + ' ✕';
        badge.onclick = () => _toggleComboTarget(name);
        container.appendChild(badge);
    });
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

    // Use Web Worker if available to avoid blocking main thread
    if (window.Worker) {
        return new Promise((resolve) => {
            const worker = new Worker('js/combo-worker.js');
            worker.onmessage = function(e) {
                resolve(e.data.chance);
                worker.terminate();
            };
            worker.onerror = function() {
                // Fallback to synchronous calculation
                resolve(_calculateComboChanceSync(deck, targetCardNames));
                worker.terminate();
            };
            worker.postMessage({
                deck: deck.map(c => c.name),
                targetCardNames: targetCardNames,
                iterations: 10000
            });
        });
    }

    // Fallback for browsers without Web Worker support
    return Promise.resolve(_calculateComboChanceSync(deck, targetCardNames));
}

function _calculateComboChanceSync(deck, targetCardNames) {
    const ITERATIONS = 10000;
    let successCount = 0;

    for (let i = 0; i < ITERATIONS; i++) {
        let simDeck = [...deck];
        for (let j = simDeck.length - 1; j > 0; j--) {
            const k = Math.floor(Math.random() * (j + 1));
            [simDeck[j], simDeck[k]] = [simDeck[k], simDeck[j]];
        }

        let simHand = simDeck.slice(0, 7).map(c => c.name);
        if (targetCardNames.every(target => simHand.includes(target))) {
            successCount++;
        }
    }

    return ((successCount / ITERATIONS) * 100).toFixed(1);
}

function runComboCalculation() {
    if (_comboTargets.length === 0) {
        showToast(t('draw.selectAtLeastOne'), 'warning');
        return;
    }

    const display = document.getElementById('comboResultDisplay');
    if (display) display.textContent = `${t('draw.calculating')}`;

    calculateComboChance(_simulatorDeck, _comboTargets).then(chance => {
        if (display) {
            const color = chance >= 50 ? '#2ecc71' : chance >= 25 ? '#f39c12' : '#e74c3c';
            display.style.color = color;
            display.textContent = `${chance}% Chance`;
        }
    });
}
