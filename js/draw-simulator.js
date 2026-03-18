// =============================================================
// STARTHAND SIMULATOR (Draw Tester)
// =============================================================

let _simulatorDeck = [];   // flattened + shuffled deck
let _simulatorHand = [];   // cards currently on hand

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

    document.getElementById('drawSimulatorModal').style.display = 'block';
    drawNewHand();
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
