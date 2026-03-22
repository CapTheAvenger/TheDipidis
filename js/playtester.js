/**
 * ============================================================================
 * POKÉMON TCG GOLDFISHING PLAYTESTER - ULTIMATE SANDBOX (v4)
 * ============================================================================
 */

// XSS-safe escaping helpers (use global escapeHtml/escapeJsStr from app-utils if available)
const _ptEscHtml = (v) => typeof escapeHtml === 'function' ? escapeHtml(v) : String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const _ptEscJs = (v) => typeof escapeJsStr === 'function' ? escapeJsStr(v) : String(v||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"');

const CARD_BACK_URL = "https://images.pokemontcg.io/card-back.png";

let ptState = { p1: null, p2: null, stadium: [], stadiumPlayedBy: null, playZone: [] };
let ptCurrentPlayer = 'p1';
let ptSelectedCardIndex = null;
let ptActionLog = [];
let ptLookingAt = [];
let ptLookingAtIsBottom = false;
let ptLookingAtPlayer = 'p1';
let _ptMsgTimer = null;
let ptActiveBuffs = { p1: 0, p2: 0 };
window.pendingAttachAction = false;

// ── Game-start phase state ──────────────────────────────────────────────
let ptStartPhase = false;   // true while coin-flip / active-selection is running
let ptStartChoices = { p1: { active: null, bench: [] }, p2: { active: null, bench: [] } };  // selected active/bench card indices per player

// ── Card Zoom / Search panel state ─────────────────────────────────────
let ptZoomPanelOpen = false;

// --- STATE HISTORY (UNDO) ---
let ptStateHistory = [];
const PT_MAX_HISTORY = 20;

function ptSaveState() {
    try {
        ptStateHistory.push(structuredClone(ptState));
        if (ptStateHistory.length > PT_MAX_HISTORY) ptStateHistory.shift();
    } catch(e) { /* ignore serialisation errors for non-critical state */ }
}

function ptUndo() {
    if (ptStateHistory.length === 0) { ptShowMessage('Nothing to undo.'); return; }
    ptState = ptStateHistory.pop();
    ptRenderAll();
    ptLog('↩️ Undone.');
}

// Globale Speicher für importierte Sandbox-Decks
let standaloneDecks = { p1: [], p2: [] };
let currentPlaytestSource = '';

function getInitialPlayerState() {
    return {
        deck: [], hand: [], discard: [], lostzone: [], prizes: [],
        field: { active: [], bench0: [], bench1: [], bench2: [], bench3: [], bench4: [] },
        damage: { active: 0, bench0: 0, bench1: 0, bench2: 0, bench3: 0, bench4: 0 },
        status: [],
        abilityUsed: { active: false, bench0: false, bench1: false, bench2: false, bench3: false, bench4: false },
        itemLock: false,
        toolLock: false,
        vstarUsed: false,
        gxUsed: false
    };
}

// --- ACTION LOG ---

function ptLog(msg) {
    const pName = ptCurrentPlayer === 'p1' ? 'P1' : 'P2';
    const colorClass = ptCurrentPlayer === 'p1' ? 'pt-log-p1' : 'pt-log-p2';
    const time = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const entry = `<div class="pt-log-entry ${colorClass}">[${time}] ${pName}: ${_ptEscHtml(msg)}</div>`;
    ptActionLog.push(entry);
    const logEl = document.getElementById('ptActionLogContent');
    if (logEl) {
        logEl.innerHTML = ptActionLog.join('');
        logEl.parentElement.scrollTop = logEl.parentElement.scrollHeight;
    }
    ptShowMessage(msg);
}

function ptToggleLog() {
    const panel = document.getElementById('ptActionLogPanel');
    if (!panel) return;
    panel.style.display = (panel.style.display === 'none' || panel.style.display === '') ? 'block' : 'none';
}

// --- INITIALIZATION ---

function openPlaytester(source) {
    const deckObj = source === 'cityLeague'  ? (window.cityLeagueDeck  || {})
                  : source === 'currentMeta' ? (window.currentMetaDeck || {})
                  : source === 'pastMeta'    ? (window.pastMetaDeck    || {})
                  : {};
    const totalCards = Object.values(deckObj).reduce((s, c) => s + c, 0);
    if (totalCards === 0) {
        if (typeof showNotification === 'function') {
            showNotification('Your deck is empty. Add some cards first.', 'error');
        } else {
            showToast('Your deck is empty! Add some cards first.', 'warning');
        }
        return;
    }
    if (totalCards < 60) {
        if (typeof showNotification === 'function') {
            showNotification(`⚠️ Deck has only ${totalCards}/60 cards. You can still play!`, 'warning');
        } else if (typeof showToast === 'function') {
            showToast(`Deck has only ${totalCards}/60 cards.`, 'warning');
        }
    }

    const baseCards = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
        if (!count || count <= 0) continue;
        let cardName = deckKey;
        let imageUrl = CARD_BACK_URL;
        let cardType = '';
        let cardSetCode = '';
        let cardNumber = '';
        const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        if (m) {
            cardName = m[1];
            const setCode = m[2], number = m[3];
            // Try fast set+number lookup first
            let cd = (window.cardsBySetNumberMap || {})[`${setCode}-${number}`] || null;
            // Fallback: _simFindCard (if available)
            if (!cd && typeof _simFindCard === 'function') cd = _simFindCard(setCode, number);
            // Fallback: name lookup
            if (!cd) cd = window.allCardsDatabase && window.allCardsDatabase.find(c => c.name === cardName);
            if (cd && cd.image_url) imageUrl = cd.image_url;
            if (cd) cardType = cd.type || cd.card_type || cd.supertype || '';
            cardSetCode = setCode;
            cardNumber = number;
        } else {
            const cd = window.allCardsDatabase && window.allCardsDatabase.find(c => c.name === cardName);
            if (cd && cd.image_url) imageUrl = cd.image_url;
            if (cd) cardType = cd.type || cd.card_type || cd.supertype || '';
        }
        for (let i = 0; i < count; i++) {
            baseCards.push({ name: cardName, imageUrl, cardType, setCode: cardSetCode, number: cardNumber });
        }
    }

    ptState.p1 = getInitialPlayerState();
    ptState.p2 = getInitialPlayerState();
    ptState.stadium  = [];
    ptState.stadiumPlayedBy = null;
    ptState.playZone = [];
    ptCurrentPlayer  = 'p1';
    ptActionLog      = [];

    baseCards.forEach(card => {
        ptState.p1.deck.push({ ...card, ptId: 'p1_' + Math.random().toString(36).substr(2, 9) });
        ptState.p2.deck.push({ ...card, ptId: 'p2_' + Math.random().toString(36).substr(2, 9) });
    });

    document.getElementById('playtesterModal').style.display = 'flex';
    ptNewGame();
    setupDragAndDrop();
    setupHotkeys();
}

function closePlaytester() {
    if (confirm('Really quit the playtester? All progress will be lost.')) {
        document.getElementById('playtesterModal').style.display = 'none';
    }
}

// ============================================================================
// SANDBOX: DECK IMPORT AUS TCG LIVE FORMAT
// ============================================================================

// High-fidelity import: exact set+number lookup first, name fallback second.
// Guarantees the right art/print ends up in the simulator.
function parseSandboxDeckToExactPrints(textInput, player) {
    const statusEl = document.getElementById(player === 'p1' ? 'sandboxStatusP1' : 'sandboxStatusP2');
    if (!textInput || !textInput.trim()) {
        if (statusEl) { statusEl.innerText = 'Please paste a deck code first!'; statusEl.style.color = 'red'; }
        return;
    }
    if (statusEl) { statusEl.innerText = 'Loading...'; statusEl.style.color = '#007bff'; }

    const lineRegex = /^(\d+)\s+(.+?)\s+([A-Za-z0-9-]+)\s+(\d+[A-Za-z]?)(?:\s+.*)?$/;
    let newDeck = [];
    let notFound = [];

    textInput.split('\n').forEach(rawLine => {
        const line = rawLine.trim();
        const match = line.match(lineRegex);
        if (!match) {
            // Fallback: PTCGL basic energy lines like "10 Basic {R} Energy Energy"
            const energyMatch = line.match(/^(\d+)\s+Basic\s+\{([RGWLPFDM])\}\s+Energy/i);
            if (energyMatch) {
                const energyMap = { G:'1', R:'2', W:'3', L:'4', P:'5', F:'6', D:'7', M:'8' };
                const energyNames = { G:'Basic Grass Energy', R:'Basic Fire Energy', W:'Basic Water Energy', L:'Basic Lightning Energy', P:'Basic Psychic Energy', F:'Basic Fighting Energy', D:'Basic Darkness Energy', M:'Basic Metal Energy' };
                const code = energyMatch[2].toUpperCase();
                const count = parseInt(energyMatch[1]);
                const name = energyNames[code] || 'Basic Energy';
                const setCode = 'SVE';
                const number = energyMap[code] || '1';
                let imageUrl = CARD_BACK_URL;
                let cardType = '';
                const db = window.cardsBySetNumberMap || {};
                const found = db[`${setCode}-${number}`] || null;
                if (found) {
                    imageUrl = found.image_url || CARD_BACK_URL;
                    cardType = found.card_type || found.supertype || found.type || '';
                }
                for (let i = 0; i < count; i++) {
                    newDeck.push({ name, imageUrl, cardType, setCode, number,
                                   ptId: player + '_' + Math.random().toString(36).substr(2, 9) });
                }
            }
            return;
        }

        const count    = parseInt(match[1]);
        const name     = match[2].trim();
        const setCode  = match[3].toUpperCase();
        const number   = match[4].toUpperCase();

        let imageUrl = CARD_BACK_URL;
        let cardType = '';
        let found    = null;

        // 1st priority: exact set+number via the pre-built lookup map (O(1))
        const db    = window.cardsBySetNumberMap || {};
        const key   = `${setCode}-${number}`;
        found = db[key] || null;

        // 2nd priority: fallback to the name map (drops parentheticals like "(Ghetsis)")
        if (!found) {
            const byName     = window.cardsByNameMap || {};
            const cleanName  = name.split('(')[0].trim();
            const versions   = byName[cleanName] || byName[name] || [];
            found = versions.find(v => v.image_url) || versions[0] || null;
        }

        // 3rd priority: scan full allCardsDatabase by name substring
        if (!found && window.allCardsDatabase) {
            const q = name.split('(')[0].trim().toLowerCase();
            found = window.allCardsDatabase.find(c =>
                (c.name || '').toLowerCase() === q &&
                (c.set_code || c.set || '').toUpperCase() === setCode
            ) || window.allCardsDatabase.find(c => (c.name || '').toLowerCase() === q) || null;
        }

        if (found) {
            imageUrl = found.image_url || CARD_BACK_URL;
            cardType = found.card_type || found.supertype || found.type || '';
        } else {
            notFound.push(`${name} ${setCode} ${number}`);
        }

        for (let i = 0; i < count; i++) {
            newDeck.push({ name, imageUrl, cardType, setCode, number,
                           ptId: player + '_' + Math.random().toString(36).substr(2, 9) });
        }
    });

    standaloneDecks[player] = newDeck.map(c => ({ ...c, count: 1 }));

    // Also push directly into ptState if the modal is already open
    if (ptState[player]) {
        ptState[player].deck = newDeck.map(c => ({ ...c }));
    }

    const total = newDeck.length;
    if (statusEl) {
        if (total > 0) {
            statusEl.innerText = `${total}/60 cards loaded ✅` + (notFound.length ? ` (${notFound.length} missing)` : '');
            statusEl.style.color = notFound.length ? '#e67e22' : 'green';
        } else {
            statusEl.innerText = 'No valid cards found.';
            statusEl.style.color = 'red';
        }
    }
    if (notFound.length) console.warn('[Playtester] Missing cards:', notFound);
}

function parseSandboxDeck(player) {
    const inputEl  = document.getElementById(player === 'p1' ? 'sandboxImportP1' : 'sandboxImportP2');
    const statusEl = document.getElementById(player === 'p1' ? 'sandboxStatusP1' : 'sandboxStatusP2');
    const rawText  = inputEl.value;

    if (!rawText.trim()) {
        statusEl.innerText = 'Please paste a deck code first!';
        statusEl.style.color = 'red';
        return;
    }

    statusEl.innerText = 'Loading card data...';
    statusEl.style.color = '#007bff';

    // TCG Live format: "4 Pikachu SVI 001" or "4 Pikachu SVI 001 PH"
    const lineRegex = /^(\d+)\s+(.+?)\s+([A-Za-z0-9-]+)\s+(\d+[A-Za-z]?)(?:\s+.*)?$/;
    const lines = rawText.split('\n');

    // Collect all valid lines first
    const entries = [];
    for (let line of lines) {
        line = line.trim();
        const match = line.match(lineRegex);
        if (!match) {
            // Fallback: PTCGL basic energy lines like "10 Basic {R} Energy Energy"
            const energyMatch = line.match(/^(\d+)\s+Basic\s+\{([RGWLPFDM])\}\s+Energy/i);
            if (energyMatch) {
                const energyMap = { G:'1', R:'2', W:'3', L:'4', P:'5', F:'6', D:'7', M:'8' };
                const energyNames = { G:'Basic Grass Energy', R:'Basic Fire Energy', W:'Basic Water Energy', L:'Basic Lightning Energy', P:'Basic Psychic Energy', F:'Basic Fighting Energy', D:'Basic Darkness Energy', M:'Basic Metal Energy' };
                const code = energyMatch[2].toUpperCase();
                entries.push({
                    count: parseInt(energyMatch[1]),
                    name: energyNames[code] || 'Basic Energy',
                    ptcgoCode: 'SVE',
                    number: energyMap[code] || '1'
                });
            }
            continue;
        }
        entries.push({
            count:     parseInt(match[1]),
            name:      match[2],
            ptcgoCode: match[3],
            number:    match[4]
        });
    }

    if (entries.length === 0) {
        statusEl.innerText = 'No valid deck format detected.';
        statusEl.style.color = 'red';
        return;
    }

    // Look up all cards from local database (no external API = no CORS issues)
    const results = entries.map(({ count, name, ptcgoCode, number }) => {
        let imageUrl = CARD_BACK_URL;
        let cardType = '';

        // Try exact set+number lookup first
        const db = window.cardsBySetNumberMap || {};
        const key = `${ptcgoCode}-${number}`;
        let found = db[key];

        // Fallback: name lookup from cardsByNameMap
        if (!found) {
            const byName = window.cardsByNameMap || {};
            const versions = byName[name] || [];
            found = versions.find(v => v.image_url) || versions[0] || null;
        }

        if (found) {
            imageUrl = found.image_url || CARD_BACK_URL;
            cardType = found.type || found.card_type || found.supertype || '';
        } else {
            console.warn(`[Sandbox] No local data for ${name} (${ptcgoCode} ${number})`);
        }

        return { name, count, imageUrl, cardType, setCode: ptcgoCode, number };
    });

    standaloneDecks[player] = results;
    const totalCards = results.reduce((s, c) => s + c.count, 0);

    if (totalCards > 0) {
        statusEl.innerText = `${totalCards} / 60 cards loaded ✅`;
        statusEl.style.color = 'green';
    } else {
        statusEl.innerText = 'No valid cards found.';
        statusEl.style.color = 'red';
    }
}

function startStandalonePlaytester() {
    const p1Count = standaloneDecks.p1.reduce((s, c) => s + c.count, 0);
    const p2Count = standaloneDecks.p2.reduce((s, c) => s + c.count, 0);

    if (p1Count === 0 && p2Count === 0) {
        showToast('Please import at least one deck for Player 1!', 'warning');
        return;
    }

    ptState.p1   = getInitialPlayerState();
    ptState.p2   = getInitialPlayerState();
    ptState.stadium  = [];
    ptState.stadiumPlayedBy = null;
    ptState.playZone = [];
    ptActionLog      = [];
    ptCurrentPlayer  = 'p1';

    // Deck P1 befüllen
    standaloneDecks.p1.forEach(card => {
        for (let i = 0; i < card.count; i++)
            ptState.p1.deck.push({ ...card, ptId: 'p1_' + Math.random().toString(36).substr(2, 9) });
    });

    // Deck P2: eigenes Deck oder Mirror von P1
    const p2Source = p2Count > 0 ? standaloneDecks.p2 : standaloneDecks.p1;
    p2Source.forEach(card => {
        for (let i = 0; i < card.count; i++)
            ptState.p2.deck.push({ ...card, ptId: 'p2_' + Math.random().toString(36).substr(2, 9) });
    });

    document.getElementById('playtesterModal').style.display = 'flex';
    ptNewGame();
    setupDragAndDrop();
    setupHotkeys();
}

// --- Playtester Setup Modal ---
function openPlaytesterSetup(source) {
    currentPlaytestSource = source;
    document.getElementById('playtesterOpponentDeck').value = '';
    document.getElementById('playtesterSetupModal').style.display = 'flex';
}

function closePlaytesterSetup() {
    document.getElementById('playtesterSetupModal').style.display = 'none';
}

function startPlaytesterWithMirror() {
    closePlaytesterSetup();
    openPlaytester(currentPlaytestSource);
}

function startPlaytesterWithOpponent() {
    const opponentString = document.getElementById('playtesterOpponentDeck').value.trim();
    if (!opponentString) {
        if (typeof showNotification === 'function') {
            showNotification('Bitte füge ein Deck für den Gegner ein oder wähle Mirror Match.', 'error');
        } else {
            showToast('Bitte füge ein Deck für den Gegner ein oder wähle Mirror Match.', 'warning');
        }
        return;
    }
    closePlaytesterSetup();
    const deckStringP1 = getExportStringFromBuilder(currentPlaytestSource);
    document.getElementById('sandboxImportP1').value = deckStringP1;
    document.getElementById('sandboxImportP2').value = opponentString;
    parseSandboxDeckToExactPrints(deckStringP1, 'p1');
    parseSandboxDeckToExactPrints(opponentString, 'p2');
    startStandalonePlaytester();
}

function getExportStringFromBuilder(type) {
    const deckObj = type === 'cityLeague'  ? (window.cityLeagueDeck  || {})
                  : type === 'currentMeta' ? (window.currentMetaDeck || {})
                  : type === 'pastMeta'    ? (window.pastMetaDeck    || {})
                  : {};
    const lines = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
        if (!count || count <= 0) continue;
        const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        lines.push(m ? `${count} ${m[1]} ${m[2]} ${m[3]}` : `${count} ${deckKey}`);
    }
    return lines.join('\n');
}
// --- End Playtester Setup Modal ---

function ptNewGame() {
    _ptLoadCardActions();   // ensure ability + trainer registries are populated
    ['p1', 'p2'].forEach(p => {
        let allCards = [...ptState[p].deck, ...ptState[p].hand, ...ptState[p].discard,
                        ...(ptState[p].lostzone || []), ...ptState[p].prizes];
        Object.keys(ptState[p].field).forEach(z => allCards.push(...ptState[p].field[z]));
        ptState[p] = getInitialPlayerState();
        ptState[p].deck = allCards;
        // Shuffle
        for (let i = ptState[p].deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ptState[p].deck[i], ptState[p].deck[j]] = [ptState[p].deck[j], ptState[p].deck[i]];
        }
        // Deal 7-card start hand (NO prizes yet — dealt after active is chosen)
        for (let i = 0; i < 7; i++) if (ptState[p].deck.length > 0) ptState[p].hand.push(ptState[p].deck.pop());
    });

    ptState.stadium  = [];
    ptState.stadiumPlayedBy = null;
    ptState.playZone = [];
    ptCurrentPlayer  = 'p1';
    ptActionLog      = [];
    ptStartPhase     = true;
    ptStartChoices   = { p1: { active: null, bench: [] }, p2: { active: null, bench: [] } };

    const logContent = document.getElementById('ptActionLogContent');
    if (logContent) logContent.innerHTML = '';
    const board    = document.getElementById('playtester-board');
    if (board) board.classList.remove('flipped');
    const ind = document.getElementById('activePlayerIndicator');
    if (ind) ind.innerText = '1';
    const handZone = document.querySelector('.pt-hand-zone');
    if (handZone) handZone.style.borderTopColor = '#3B4CCA';
    ptUpdateAreaPointerEvents();

    ptRenderAll();
    ptOpenStartPhase();
    ptInitMobileDeckTriggers();
}

// ── Start Phase: coin flip → hand display → active selection ─────────────

// Helpers to detect Basic Pokémon (not Energy, not Trainer subtype)
function _ptIsPokemon(card) {
    const t = (card.cardType || card.supertype || '').toLowerCase();
    if (t === 'supporter' || t === 'item' || t === 'tool' || t === 'stadium') return false;
    if (t.includes('energy')) return false;
    if (t.includes('basic') || t.includes('stage') || t.includes('pokémon') || t.includes('pokemon')) return true;
    if (t.includes('v') || t.includes('ex') || t.includes('gx') || t.includes('vmax') || t.includes('vstar')) return true;
    // Fallback: if no type info, check name for known non-Pokémon patterns
    if (!t) {
        const name = (card.name || '').toLowerCase();
        if (/\benergy\b/i.test(name)) return false;
        if (/^(professor|boss|arven|iono|judge|penny|cynthia|marnie|roxanne|irida|colress|n |research|nest ball|ultra ball|rare candy|switch|escape rope|battle vip|trekking shoes|pal pad|super rod|energy recycler|pokégear|exp\. share|forest seal|choice belt|tool scrapper|lost vacuum|counter catcher|crushing hammer|enhanced hammer|field blower|gust|lysandre|acerola|guzma|boss.s orders|temple|artazon|beach court|collapsed|mesagoza|jamming tower|path to the peak|tower of darkness|magma basin|chaotic swell|training court)/i.test(name)) return false;
        return true; // unknown card with no type → allow as Pokémon (benefit of doubt)
    }
    return false;
}

function _ptIsEnergy(card) {
    const t = (card.cardType || card.supertype || '').toLowerCase();
    if (t.includes('energy')) return true;
    return /\benergy\b/i.test(card.name || '');
}

function _ptIsTool(card) {
    const t = (card.cardType || card.supertype || '').toLowerCase();
    if (t === 'tool' || t.includes('tool')) return true;
    return /\btool\b/i.test(card.name || '');
}

function ptIsAttachSelection(player = ptCurrentPlayer) {
    if (ptSelectedCardIndex === null || !ptState[player]) return false;
    const card = ptState[player].hand[ptSelectedCardIndex];
    if (!card) return false;
    return _ptIsEnergy(card) || _ptIsTool(card);
}

function ptSetAttachMode(active) {
    const isActive = !!active;
    window.pendingAttachAction = isActive;
    if (document && document.body) {
        document.body.classList.toggle('attach-mode-active', isActive);
    }
}

function ptUpdateAttachModeFromSelection(player = ptCurrentPlayer) {
    ptSetAttachMode(ptIsAttachSelection(player));
}

function _ptIsBasic(card) {
    const t = (card.cardType || card.supertype || '').toLowerCase();
    // Explicit non-Pokémon types
    if (t === 'supporter' || t === 'item' || t === 'tool' || t === 'stadium') return false;
    if (t.includes('energy')) return false;
    // Check for "Basic" in the type string (e.g. "GBasic", "WBasic", "Basic")
    if (t.includes('basic')) return true;
    // Fallback: Wenn cardType leer ist, prüfe Kartenname gegen bekannte Basic-Muster
    // (Rettung für den Fall, dass card data nicht geladen wurde)
    if (!t) {
        const name = (card.name || '').toLowerCase();
        // Nicht-Pokémon erkennen und ausschließen
        if (/\benergy\b/i.test(name)) return false;
        if (/^(professor|boss|arven|iono|judge|penny|cynthia|marnie|roxanne|irida|colress|n |research|nest ball|ultra ball|rare candy|switch|escape rope|battle vip|trekking shoes|pal pad|super rod|energy recycler|pokégear|exp\. share|forest seal|choice belt|tool scrapper|lost vacuum|counter catcher|crushing hammer|enhanced hammer|field blower|gust|lysandre|acerola|guzma|boss.s orders|temple|artazon|beach court|collapsed|mesagoza|jamming tower|path to the peak|tower of darkness|magma basin|chaotic swell|training court)/i.test(name)) return false;
        // Pokémon-typische Namensmuster (Ex, V, ex, GX, VSTAR, etc.)
        if (/\bex\b|\bv\b|\bvmax\b|\bvstar\b|\bgx\b|\btag team\b/i.test(name)) return true;
        // Einsilbige Pokémon-Namen ohne Trainer-Indikatoren: wahrscheinlich ein Basic
        // Aber wir können hier nicht sicher sein, also false
    }
    return false;
}
function _ptHasBasic(player) {
    return ptState[player].hand.some(_ptIsBasic);
}

function ptOpenStartPhase() {
    // P1 always goes first — skip coin flip, go straight to hand selection
    const modal = document.getElementById('ptStartPhaseModal');
    if (modal) { delete modal.dataset.coinDone; delete modal.dataset.firstPlayer; }
    ptCurrentPlayer = 'p1';
    const ind = document.getElementById('activePlayerIndicator');
    if (ind) ind.innerText = '1';
    const handZone = document.querySelector('.pt-hand-zone');
    if (handZone) handZone.style.borderTopColor = '#3B4CCA';
    ptRenderStartPhaseModal();
    if (modal) modal.style.display = 'flex';
}

function ptRenderStartPhaseModal() {
    const modal = document.getElementById('ptStartPhaseModal');
    if (!modal) return;

    let html = `<div style="background:#1a1a2e;border:2px solid #3B4CCA;border-radius:14px;padding:24px;width:min(98vw,720px);max-height:92vh;overflow-y:auto;color:#fff;">`;
    const isMP = ptState.isMultiplayer;
    const localRole = ptState.localRole;
    const mpHeaderText = isMP
        ? `🌐 <strong>Multiplayer Setup</strong> — Du bist <strong>${localRole === 'p1' ? '🔵 Player 1' : '🔴 Player 2'}</strong>. Wähle dein Aktives &amp; Bank-Pokémon, dann klicke <strong>Bereit!</strong>`
        : `🔵 <strong>P1</strong> geht zuerst. Wähle dein Aktives &amp; Bank-Pokémon, dann auf <strong>Let's Battle!</strong>`;
    const mpBtnText = isMP ? '✅ Bereit!' : '👊 Let\'s Battle!';
    const mpHintText = isMP ? 'Wähle dein Aktives Pokémon' : 'Beide Spieler müssen ein Aktives Pokémon wählen';

    html += `
        <h2 style="color:#FFCB05;text-align:center;margin-top:0;">🃏 Setup Phase</h2>
        <p style="text-align:center;color:#ccc;margin-bottom:8px;">${mpHeaderText}</p>
        <div class="pt-setup-players" style="display:flex;flex-direction:column;gap:20px;margin-bottom:20px;">
            ${ptRenderStartHandHTML('p1')}
            ${ptRenderStartHandHTML('p2')}
        </div>
        <div style="text-align:center;margin-bottom:10px;">
            <button onclick="ptConfirmStartActives()" id="ptStartBtn"
                style="font-size:1.1em;padding:13px 44px;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 14px rgba(39,174,96,0.4);">
                ${mpBtnText}
            </button>
            <p id="ptStartHint" style="color:#f1c40f;font-size:12px;margin-top:6px;">${mpHintText}</p>
        </div>`;
    html += `</div>`;
    modal.innerHTML = html;
    ptUpdateStartBtn();
}

function ptRenderStartHandHTML(player) {
    const label = player === 'p1' ? '🔵 Player 1' : '🔴 Player 2';
    const borderColor = player === 'p1' ? '#3B4CCA' : '#E3350D';

    // === MULTIPLAYER: Gegnerhand verdeckt ===
    const isMP = ptState.isMultiplayer;
    const isOpponent = isMP && player !== ptState.localRole;
    if (isOpponent) {
        const cardCount = (ptState[player] && ptState[player].hand) ? ptState[player].hand.length : 7;
        let cardsHTML = '';
        for (let i = 0; i < cardCount; i++) {
            cardsHTML += `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;">
                <img src="${CARD_BACK_URL}" title="Verdeckte Karte" style="width:70px;border-radius:6px;opacity:0.7;">
                <span style="font-size:8px;color:#666;">???</span>
            </div>`;
        }
        const oppReady = ptState.mpSetupReady && ptState.mpSetupReady[player];
        const readyBanner = oppReady
            ? `<div style="background:#27ae60;color:#fff;padding:7px 12px;border-radius:7px;font-size:11px;font-weight:700;text-align:center;margin-bottom:8px;">✅ Bereit!</div>`
            : `<div style="background:#e67e22;color:#fff;padding:7px 12px;border-radius:7px;font-size:11px;font-weight:700;text-align:center;margin-bottom:8px;">⏳ Wählt Karten...</div>`;
        return `<div style="border:2px solid ${borderColor};border-radius:10px;padding:14px;">
            <div style="font-weight:900;margin-bottom:8px;font-size:1em;color:${borderColor};">
                <span>${label} (Gegner)</span>
            </div>
            ${readyBanner}
            <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;min-height:90px;margin-bottom:8px;">${cardsHTML}</div>
            <div style="margin-top:7px;text-align:center;font-size:11px;color:#aaa;">Gegnerhand ist verdeckt</div>
        </div>`;
    }

    // === SOLO / LOKALER SPIELER: Normale Darstellung ===
    const activeIdx  = ptStartChoices[player]?.active ?? null;
    const benchIdxs  = ptStartChoices[player]?.bench ?? [];
    const hasBasic   = _ptHasBasic(player);

    let cardsHTML = ptState[player].hand.map((card, i) => {
        const isActive   = activeIdx === i;
        const isBenched  = benchIdxs.includes(i);
        const isBasic    = _ptIsBasic(card);
        let outline = '';
        let badge   = '';
        if (isActive)  { outline = 'outline:3px solid #FFCB05;box-shadow:0 0 12px #FFCB05;'; badge = `<div style="position:absolute;top:-4px;left:-4px;background:#FFCB05;color:#000;font-size:8px;font-weight:900;padding:1px 4px;border-radius:3px;">ACTIVE</div>`; }
        if (isBenched) { outline = 'outline:3px solid #27ae60;box-shadow:0 0 10px #27ae60;'; badge = `<div style="position:absolute;top:-4px;left:-4px;background:#27ae60;color:#fff;font-size:8px;font-weight:900;padding:1px 4px;border-radius:3px;">BENCH</div>`; }
        const dimmed = !isBasic ? 'opacity:0.45;' : '';
        const title = isBasic ? card.name : card.name + ' (not a Basic)';
        return `<div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;">
            ${badge}
            <img src="${card.imageUrl || CARD_BACK_URL}" title="${title}"
                style="width:70px;border-radius:6px;${outline}${dimmed}cursor:${isBasic?'pointer':'not-allowed'};transition:transform .12s;"
                onerror="this.src='${CARD_BACK_URL}'"
                onclick="${isBasic ? `ptStartCardClick('${player}',${i})` : ''}"
                ondblclick="ptStartZoomCard('${(card.imageUrl||CARD_BACK_URL).replace(/'/g,"\\'")}','${card.name.replace(/'/g,"\\'")}')"
            >
            <span style="font-size:8px;max-width:72px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:${isBasic?'#ddd':'#666'};">${_ptEscHtml(card.name)}</span>
        </div>`;
    }).join('');

    const noBasicWarn = !hasBasic
        ? `<div style="background:#e74c3c;color:#fff;padding:7px 12px;border-radius:7px;font-size:11px;font-weight:700;margin-bottom:8px;text-align:center;">⚠️ No Basic Pokémon! Do a Mulligan.</div>` : '';

    const statusMsg = activeIdx !== null
        ? `✅ Active: <strong>${_ptEscHtml(ptState[player].hand[activeIdx]?.name||'?')}</strong>${benchIdxs.length ? ` &nbsp;|&nbsp; Bench: ${benchIdxs.length}` : ''}`
        : `<span style="color:#f1c40f;">⬆️ Click a Basic to set as Active</span>`;

    const mulBtnStyle = `padding:5px 14px;background:#8e44ad;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;`;
    const clrBtnStyle = `padding:5px 14px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:11px;`;

    return `<div style="border:2px solid ${borderColor};border-radius:10px;padding:14px;">
        <div style="font-weight:900;margin-bottom:8px;font-size:1em;color:${borderColor};display:flex;justify-content:space-between;align-items:center;">
            <span>${label}</span>
            <span style="font-size:10px;font-weight:400;color:#aaa;">Dbl-click any card to zoom</span>
        </div>
        ${noBasicWarn}
        <div class="pt-setup-hand-row" style="display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;justify-content:flex-start;min-height:90px;margin-bottom:8px;padding-bottom:4px;-webkit-overflow-scrolling:touch;">${cardsHTML}</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button onclick="ptStartMulligan('${player}')" style="${mulBtnStyle}">🃏 Mulligan</button>
            <button onclick="ptStartClearBench('${player}')" style="${clrBtnStyle}">Clear Bench</button>
        </div>
        <div style="margin-top:7px;text-align:center;font-size:11px;color:#a8e6cf;">${statusMsg}</div>
    </div>`;
}

function ptStartCardClick(player, index) {
    // Block opponent clicks in MP mode
    if (ptState.isMultiplayer && player !== ptState.localRole) return;
    if (ptState.isMultiplayer && ptState.mpSetupReady && ptState.mpSetupReady[ptState.localRole]) return;
    // Setup: only Basic Pokémon allowed
    const setupCard = ptState[player].hand[index];
    if (!setupCard || !_ptIsBasic(setupCard)) {
        ptShowMessage('⛔ Im Setup nur Basic Pokémon erlaubt!');
        return;
    }
    const choices = ptStartChoices[player] || { active: null, bench: [] };
    if (choices.active === null) {
        // First basic clicked → set as Active
        choices.active = index;
    } else if (choices.active === index) {
        // Click active again → deselect
        choices.active = null;
    } else if (choices.bench.includes(index)) {
        // Click benched card → remove from bench
        choices.bench = choices.bench.filter(i => i !== index);
    } else if (choices.bench.length < 5) {
        // Bench this card (max 5)
        choices.bench.push(index);
    } else {
        ptShowMessage('Bench full (max 5)!');
        return;
    }
    ptStartChoices[player] = choices;
    ptUpdateStartBtn();
    ptRenderStartPhaseModal();
}

function ptStartClearBench(player) {
    if (ptStartChoices[player]) ptStartChoices[player].bench = [];
    ptRenderStartPhaseModal();
}

function ptStartZoomCard(url, name) {
    // Open the zoom panel with this card loaded
    if (!ptZoomPanelOpen) {
        ptZoomPanelOpen = true;
        const panel = document.getElementById('ptZoomPanel');
        if (panel) panel.style.transform = 'translateX(0)';
        ptRenderZoomPanel();
    }
    ptZoomViewCard(url, name);
}

function ptUpdateStartBtn() {
    const btn  = document.getElementById('ptStartBtn');
    const hint = document.getElementById('ptStartHint');
    if (!btn) return;

    // === MULTIPLAYER MODE ===
    if (ptState.isMultiplayer && ptState.localRole) {
        const localRole = ptState.localRole;
        const localOk = ptStartChoices[localRole]?.active !== null && ptStartChoices[localRole]?.active !== undefined;
        const alreadyReady = ptState.mpSetupReady && ptState.mpSetupReady[localRole];
        btn.disabled = !localOk || !!alreadyReady;
        btn.style.opacity = (localOk && !alreadyReady) ? '1' : '0.45';
        if (hint) {
            if (alreadyReady) { hint.textContent = '⏳ Warte auf Gegner...'; hint.style.display = 'block'; }
            else if (!localOk) { hint.textContent = 'Wähle dein Aktives Pokémon'; hint.style.display = 'block'; }
            else hint.style.display = 'none';
        }
        return;
    }

    // === SOLO MODE ===
    const p1ok = ptStartChoices.p1?.active !== null && ptStartChoices.p1?.active !== undefined;
    const p2ok = ptStartChoices.p2?.active !== null && ptStartChoices.p2?.active !== undefined;
    const ready = p1ok && p2ok;
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '0.45';
    if (hint) hint.style.display = ready ? 'none' : 'block';
}

function ptStartMulligan(player) {
    // Block opponent mulligan in MP mode
    if (ptState.isMultiplayer && player !== ptState.localRole) return;
    if (ptState.isMultiplayer && ptState.mpSetupReady && ptState.mpSetupReady[ptState.localRole]) return;

    // Reset ALL setup selections before reshuffling
    ptStartChoices[player] = { active: null, bench: [] };
    ptState[player].field.active = [];
    ptState[player].field.bench0 = [];
    ptState[player].field.bench1 = [];
    ptState[player].field.bench2 = [];
    ptState[player].field.bench3 = [];
    ptState[player].field.bench4 = [];

    ptState[player].deck.push(...ptState[player].hand);
    ptState[player].hand = [];
    const deck = ptState[player].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    for (let i = 0; i < 7; i++) if (deck.length > 0) ptState[player].hand.push(deck.pop());
    ptLog(`🃏 ${player.toUpperCase()} mulligan — new 7-card hand.`);
    ptRenderStartPhaseModal();
}

function ptDoStartCoinFlip() {
    const result = Math.random() >= 0.5 ? 'p1' : 'p2';
    const modal = document.getElementById('ptStartPhaseModal');
    if (!modal) return;
    modal.dataset.coinDone = '1';
    modal.dataset.firstPlayer = result;
    ptCurrentPlayer = result;
    const ind = document.getElementById('activePlayerIndicator');
    if (ind) ind.innerText = result === 'p1' ? '1' : '2';
    const handZone = document.querySelector('.pt-hand-zone');
    if (handZone) handZone.style.borderTopColor = result === 'p1' ? '#3B4CCA' : '#E3350D';
    ptLog(`🪙 Coin flip: ${result.toUpperCase()} goes first!`);
    ptRenderStartPhaseModal();
}

function ptConfirmStartActives() {
    // === MULTIPLAYER MODE: Nur lokalen Spieler verarbeiten ===
    if (ptState.isMultiplayer && ptState.localRole) {
        const localRole = ptState.localRole;
        const choices = ptStartChoices[localRole] || {};
        if (choices.active === null || choices.active === undefined) return;
        // Already confirmed?
        if (ptState.mpSetupReady && ptState.mpSetupReady[localRole]) return;

        // Move active + bench cards from hand to field
        const allIdxs = [choices.active, ...(choices.bench || [])].sort((a, b) => b - a);
        const cards = {};
        allIdxs.forEach(i => { cards[i] = ptState[localRole].hand.splice(i, 1)[0]; });
        ptState[localRole].field.active.push(cards[choices.active]);
        (choices.bench || []).forEach((origIdx, slot) => {
            ptState[localRole].field['bench' + slot].push(cards[origIdx]);
        });

        // Mark local player as ready
        if (!ptState.mpSetupReady) ptState.mpSetupReady = {};
        ptState.mpSetupReady[localRole] = true;

        // Sync to Firebase (field-level update — no race condition)
        if (typeof mpSyncSetupReady === 'function') mpSyncSetupReady();

        ptLog(`✅ ${localRole.toUpperCase()} ist bereit!`);

        // Re-render setup modal (shows 'Warte auf Gegner...')
        ptRenderStartPhaseModal();
        return;
    }

    // === SOLO MODE: Beide Spieler verarbeiten (Original-Logik) ===
    const p1choices = ptStartChoices.p1 || {};
    const p2choices = ptStartChoices.p2 || {};
    if (p1choices.active === null || p1choices.active === undefined) return;
    if (p2choices.active === null || p2choices.active === undefined) return;

    ['p1', 'p2'].forEach(p => {
        const choices = ptStartChoices[p];
        // All selected indices (active first, then bench) sorted descending so splice doesn't shift
        const allIdxs = [choices.active, ...(choices.bench || [])].sort((a, b) => b - a);
        const cards   = {};
        allIdxs.forEach(i => { cards[i] = ptState[p].hand.splice(i, 1)[0]; });
        // Place active
        ptState[p].field.active.push(cards[choices.active]);
        // Place bench cards
        (choices.bench || []).forEach((origIdx, slot) => {
            ptState[p].field['bench' + slot].push(cards[origIdx]);
        });
    });

    // NOW deal 6 prize cards for each player
    ['p1', 'p2'].forEach(p => {
        for (let i = 0; i < 6; i++) {
            if (ptState[p].deck.length > 0) ptState[p].prizes.push(ptState[p].deck.pop());
        }
    });

    ptStartPhase   = false;
    ptStartChoices = { p1: { active: null, bench: [] }, p2: { active: null, bench: [] } };
    const fpModal = document.getElementById('ptStartPhaseModal');
    if (fpModal) fpModal.style.display = 'none';
    ptLog(`✅ Spiel gestartet! P1 geht zuerst. Preiskarten verteilt. Viel Spaß!`);
    ptRenderAll();
    // P1 draws first card at game start
    ptDraw1('p1');
}

// ── Card Zoom / Search Side Panel ──────────────────────────────────────────

function ptToggleZoomPanel() {
    ptZoomPanelOpen = !ptZoomPanelOpen;
    const panel = document.getElementById('ptZoomPanel');
    if (!panel) return;
    panel.style.transform = ptZoomPanelOpen ? 'translateX(0)' : 'translateX(100%)';
    if (ptZoomPanelOpen) ptRenderZoomPanel();
}

function ptZoomBoard() {
    ptToggleZoomPanel();
}

function ptRenderZoomPanel(filter) {
    const grid = document.getElementById('ptZoomPanelGrid');
    if (!grid) return;
    filter = (filter !== undefined ? filter : (document.getElementById('ptZoomSearch')?.value || '')).toLowerCase().trim();
    const all = [];
    ['p1', 'p2'].forEach(p => {
        const st = ptState[p];
        if (!st) return;
        [...st.hand, ...st.deck, ...st.discard, ...(st.lostzone||[]), ...st.prizes].forEach(c => {
            if (!filter || (c.name||'').toLowerCase().includes(filter)) all.push(c);
        });
        Object.values(st.field || {}).forEach(zone => zone.forEach(c => {
            if (!filter || (c.name||'').toLowerCase().includes(filter)) all.push(c);
        }));
    });
    // De-dupe by name
    const seen = new Set();
    const unique = all.filter(c => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
    grid.innerHTML = unique.map(c => {
        const safeImg  = (c.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
        const safeName = _ptEscJs(c.name);
        const htmlName = _ptEscHtml(c.name);
        return `<div style="cursor:pointer;text-align:center;" onclick="ptZoomViewCard('${safeImg}','${safeName}')" title="${htmlName}">
            <img src="${c.imageUrl||CARD_BACK_URL}" loading="lazy" style="width:86px;border-radius:6px;display:block;transition:transform .12s;" onerror="this.src='${CARD_BACK_URL}'" onmouseover="this.style.transform='scale(1.06)'" onmouseout="this.style.transform='scale(1)'">
            <div style="color:#ccc;font-size:8px;margin-top:2px;max-width:86px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${htmlName}</div>
        </div>`;
    }).join('');
}

function ptZoomViewCard(url, name) {
    // If panel is closed, open it first
    if (!ptZoomPanelOpen) {
        ptZoomPanelOpen = true;
        const panel = document.getElementById('ptZoomPanel');
        if (panel) panel.style.transform = 'translateX(0)';
        ptRenderZoomPanel();
    }
    const img = document.getElementById('ptZoomBigImg');
    const lbl = document.getElementById('ptZoomBigName');
    if (img) { img.src = url; img.style.display = 'block'; }
    if (lbl) lbl.textContent = name;
    // Scroll the panel to top so big card is visible
    const panel = document.getElementById('ptZoomPanel');
    if (panel) panel.querySelector('[style*="overflow-y:auto"]')?.scrollTo(0, 0);
}

function ptZoomClose() {
    ptZoomPanelOpen = false;
    const panel = document.getElementById('ptZoomPanel');
    if (panel) panel.style.transform = 'translateX(100%)';
}

// --- STEPPER HELPER ---
function updateStepper(id, change) {
    const el = document.getElementById(id);
    if (!el) return;
    let val = parseInt(el.innerText) + change;
    if (val < 1) val = 1;
    if (val > 60) val = 60;
    el.innerText = val;
}

// --- HOTKEYS ---
function setupHotkeys() {
    if (document._ptHotkeyListener) document.removeEventListener('keydown', document._ptHotkeyListener);
    document._ptHotkeyListener = function(e) {
        const modal = document.getElementById('playtesterModal');
        if (!modal || modal.style.display === 'none') return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch(e.key.toLowerCase()) {
            case 'd': ptDraw1(); break;
            case 's': ptShuffle(); break;
            case 'c': ptFlipCoin(); break;
            case 'p': ptPassTurn(); break;
            case 'f': ptFlipBoard(); break;
            case '`': ptToggleLog(); break;
            case '/':
                e.preventDefault();
                let input = document.getElementById('ptCommandInput-' + ptCurrentPlayer)
                         || document.getElementById('ptCommandInput-p1');
                if(input) input.focus();
                break;
        }
    };
    document.addEventListener('keydown', document._ptHotkeyListener);
}

// --- VSTAR & GX MARKERS ---

function ptToggleMarker(type) {
    let p = ptCurrentPlayer;
    if(type === 'vstar') {
        ptState[p].vstarUsed = !ptState[p].vstarUsed;
        ptLog(`VSTAR Power ${ptState[p].vstarUsed ? 'used' : 'reset'}.`);
    } else {
        ptState[p].gxUsed = !ptState[p].gxUsed;
        ptLog(`GX Attack ${ptState[p].gxUsed ? 'used' : 'reset'}.`);
    }
    ptRenderAll();
}

// --- CARD ZOOM ---

// Supports both ptViewCard(url, name) and ptViewCard(event, url) calling conventions
function ptViewCard(arg1, arg2) {
    const viewer = document.getElementById('ptCardViewer');
    const img    = document.getElementById('ptCardViewerImg');
    const lbl    = document.getElementById('ptCardViewerName');
    if (!viewer || !img) return;
    let imageUrl, name;
    if (arg1 && typeof arg1 === 'object' && typeof arg1.preventDefault === 'function') {
        arg1.preventDefault();
        imageUrl = arg2 || CARD_BACK_URL;
        name = '';
    } else {
        imageUrl = arg1 || CARD_BACK_URL;
        name = arg2 || '';
    }
    img.src = imageUrl;
    if (lbl) lbl.textContent = name;
    viewer.style.display = 'flex';
}
// --- COMMAND INPUT (Spielerspezifisch) ---

function ptRunCommand(playerOverride) {
    let p = playerOverride || ptCurrentPlayer;
    let input = document.getElementById('ptCommandInput-' + p)
             || document.getElementById('ptCommandInput-p1');
    if(!input) return;

    let cmd = input.value.trim().toLowerCase();
    input.value = '';
    input.blur();
    if(!cmd) return;

    const parts = cmd.replace(/^\//, '').split(/\s+/);
    const action = parts[0];
    const n = parseInt(parts[1]) || 1;

    if (action === 'draw' || action === 'd') {
        let drawn = 0;
        for (let i = 0; i < n; i++) if (ptState[p].deck.length > 0) { ptState[p].hand.push(ptState[p].deck.pop()); drawn++; }
        ptLog(`Drew ${drawn} card(s).`);
        ptRenderAll();
    } else if (action === 'mill' || action === 'm') {
        let milled = 0;
        for (let i = 0; i < n; i++) if (ptState[p].deck.length > 0) { ptState[p].discard.push(ptState[p].deck.pop()); milled++; }
        ptLog(`Milled ${milled} card(s) to discard.`);
        ptRenderAll();
    } else if (action === 'top' || action === 't') {
        ptOpenTopCards(n);
    } else if (action === 'coin') {
        let heads = 0;
        for (let i = 0; i < n; i++) if (Math.random() >= 0.5) heads++;
        ptLog(`🪙 ${n} coin(s): ${heads}x HEADS.`);
    } else if (action === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        ptLog(`🎲 Dice roll: ${roll}`);
    } else if (action === 'iono' || action === 'judge') {
        ['p1', 'p2'].forEach(pp => {
            ptState[pp].deck.push(...ptState[pp].hand);
            ptState[pp].hand = [];
            const deck = ptState[pp].deck;
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
            for (let i = 0; i < n; i++) if (deck.length > 0) ptState[pp].hand.push(deck.pop());
        });
        ptLog(`🔄 Iono/Judge: Both players drew ${n} card(s).`);
        ptRenderAll();
    } else if (action === 'roxanne' || action === 'marnie') {
        ['p1', 'p2'].forEach(pp => {
            ptState[pp].deck.unshift(...ptState[pp].hand);
            ptState[pp].hand = [];
            for (let i = 0; i < n; i++) if (ptState[pp].deck.length > 0) ptState[pp].hand.push(ptState[pp].deck.pop());
        });
        ptLog(`⬇️ Marnie/Roxanne: Both players drew ${n} card(s).`);
        ptRenderAll();
    } else if (action === 'shuffle' || action === 'sh') {
        ptShuffleDeck(p);
    } else if (action === 'attach') {
        // /attach [active|bench0-4]  — attach first energy from hand to a field slot
        const slotArg   = parts[1] || 'active';
        const validZones = ['active', 'bench0', 'bench1', 'bench2', 'bench3', 'bench4'];
        const zone       = validZones.includes(slotArg) ? slotArg : 'active';
        if (ptState[p].field[zone].length === 0) {
            ptShowMessage(`No Pokémon in ${zone}!`);
            return;
        }
        const energyIdx = ptState[p].hand.findIndex(c =>
            (c.cardType || '').toLowerCase().includes('energy') ||
            (c.supertype || '').toLowerCase() === 'energy'
        );
        if (energyIdx === -1) {
            ptShowMessage('No Energy card in hand!');
            return;
        }
        const [energyCard] = ptState[p].hand.splice(energyIdx, 1);
        ptState[p].field[zone].push(energyCard);
        ptLog(`⚡ Attached "${energyCard.name}" to ${p} ${zone}.`);
        ptRenderAll();
    } else {
        ptShowMessage('Unknown! Try: /draw 3  /iono 6  /roxanne 2  /top 5  /mill 2  /attach active');
    }
}

// --- TOP DECK CONTROL ---

function ptOpenTopCards(num) {
    const p    = ptCurrentPlayer;
    ptLookingAtPlayer     = p;
    ptLookingAtIsBottom   = false;
    const take = Math.min(num || 5, ptState[p].deck.length);
    if (take === 0) { ptShowMessage('Deck is empty!'); return; }
    ptLookingAt = ptState[p].deck.splice(ptState[p].deck.length - take, take).reverse();
    ptLog(`Looking at the top ${take} card(s).`);
    ptRenderTopCards();
    document.getElementById('ptTopCardsModal').style.display = 'flex';
}

function ptRenderTopCards() {
    const grid = document.getElementById('ptTopCardsGrid');
    if (!grid) return;
    grid.innerHTML = ptLookingAt.map((c, i) => {
        const safeImg = (c.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `
        <div style="display:flex;flex-direction:column;gap:5px;background:rgba(255,255,255,0.1);padding:10px;border-radius:8px;">
            <img src="${c.imageUrl || CARD_BACK_URL}" class="pt-field-card"
                 style="width:100px;height:auto;margin:0 auto;"
                 onerror="this.src='${CARD_BACK_URL}'"
                 ondblclick="ptViewCard(event,'${safeImg}')" title="${_ptEscHtml(c.name)}">
            <div style="color:#fff;font-size:10px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_ptEscHtml(c.name)}</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;">
                <button class="pt-action-btn" onclick="ptRouteTopCard(${i},'hand')">⬆️ Hand</button>
                <button class="pt-action-btn" onclick="ptRouteTopCard(${i},'lost')">🌌 Lost</button>
                <button class="pt-action-btn" onclick="ptRouteTopCard(${i},'bottom')">⏬ Bottom</button>
                <button class="pt-action-btn red" onclick="ptRouteTopCard(${i},'discard')">🗑️ Discard</button>
            </div>
        </div>`;
    }).join('');
}

function ptRouteTopCard(index, destination) {
    const p    = ptLookingAtPlayer || ptCurrentPlayer;
    const card = ptLookingAt.splice(index, 1)[0];
    if (!card) return;
    if (destination === 'hand')         { ptState[p].hand.push(card);     ptLog(`Took "${card.name}" to hand.`); }
    else if (destination === 'bottom')  { ptState[p].deck.unshift(card);  ptLog(`Put "${card.name}" on the bottom of the deck.`); }
    else if (destination === 'discard') { ptState[p].discard.push(card);  ptLog(`Discarded "${card.name}".`); }
    else if (destination === 'lost')    { ptState[p].lostzone.push(card); ptLog(`Sent "${card.name}" to the Lost Zone.`); }
    if (ptLookingAt.length === 0) {
        ptCloseTopCards();
    } else {
        ptRenderTopCards();
        ptRenderAll();
    }
}

function ptCloseTopCards() {
    const p = ptLookingAtPlayer || ptCurrentPlayer;
    if (ptLookingAtIsBottom) {
        ptState[p].deck.splice(0, 0, ...ptLookingAt);
    } else {
        while (ptLookingAt.length > 0) ptState[p].deck.push(ptLookingAt.pop());
    }
    ptLookingAt = [];
    document.getElementById('ptTopCardsModal').style.display = 'none';
    ptRenderAll();
}

function ptShuffleRemainingLookedCardsIntoDeck() {
    const p = ptLookingAtPlayer || ptCurrentPlayer;
    if (!ptLookingAt || ptLookingAt.length === 0) {
        ptCloseTopCards();
        return;
    }

    ptState[p].deck.push(...ptLookingAt);
    ptLookingAt = [];

    const deck = ptState[p].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    ptLog(`Shuffled the remaining looked-at cards back into ${p.toUpperCase()}'s deck.`);
    document.getElementById('ptTopCardsModal').style.display = 'none';
    ptRenderAll();
}

// --- BASIC ACTIONS & BOARD FLIP ---

// Ensure only the ACTIVE player's area captures pointer events.
// P1-area is later in the DOM (higher z-order) and would otherwise swallow all
// clicks/drops that belong to P2's zones when it's P2's turn.
function ptUpdateAreaPointerEvents() {
    const p1Inner = document.querySelector('#p1-area > div');
    const p2Inner = document.querySelector('#p2-area > div');
    if (p1Inner) p1Inner.style.pointerEvents = ptCurrentPlayer === 'p1' ? 'auto' : 'none';
    if (p2Inner) p2Inner.style.pointerEvents = ptCurrentPlayer === 'p2' ? 'auto' : 'none';
}

function ptDraw1(playerOverride = null) {
    let p = playerOverride || ptCurrentPlayer;
    // MP safety: only draw for local player
    if (ptState.isMultiplayer && p !== ptState.localRole) return;
    if (ptState[p].deck.length > 0) {
        ptState[p].hand.push(ptState[p].deck.pop());
        ptRenderAll();
        ptLog('Drew a card.');
        if (typeof syncStateToFirebase === 'function' && ptState.isMultiplayer) syncStateToFirebase('Drew a card');
    } else {
        ptShowMessage('Deck is empty!');
    }
}

function ptShuffle() {
    const deck = ptState[ptCurrentPlayer].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    ptLog('Deck shuffled!');
    ptRenderAll();
}

// --- PRIZE REDRAW ---

function ptRedrawPrizes(player) {
    const p = player || ptCurrentPlayer;
    const count = ptState[p].prizes.length;
    if (count === 0) { ptShowMessage('No prize cards to redraw!'); return; }
    if (!confirm(`Shuffle ${count} prize card(s) back into ${p.toUpperCase()}'s deck and re-deal?`)) return;
    // Return prizes to deck
    ptState[p].deck.push(...ptState[p].prizes);
    ptState[p].prizes = [];
    // Shuffle
    const deck = ptState[p].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // Re-deal same number of prizes
    for (let i = 0; i < count; i++) {
        if (deck.length > 0) ptState[p].prizes.push(deck.pop());
    }
    ptLog(`${p.toUpperCase()} redealt ${count} prize card(s).`);
    ptRenderAll();
}

// --- NEW HELPER FUNCTIONS ---

function ptDrawCards(player, amount) {
    // Compatibility: ptDrawCards(amount)
    if (amount === undefined && !isNaN(parseInt(player))) {
        amount = parseInt(player);
        player = ptCurrentPlayer;
    }
    const p = player || ptCurrentPlayer;
    amount = parseInt(amount) || 1;
    let drawn = 0;
    for (let i = 0; i < amount; i++) {
        if (ptState[p].deck.length > 0) { ptState[p].hand.push(ptState[p].deck.pop()); drawn++; }
    }
    if (drawn > 0) { ptLog(`Drew ${drawn} card(s) [${p}].`); ptRenderAll(); }
    else ptShowMessage('Deck is empty!');
}

function ptShuffleDeck(player) {
    const p    = player || ptCurrentPlayer;
    const deck = ptState[p].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    ptLog(`Deck shuffled [${p}]!`);
    ptRenderAll();
}

function ptLookCards(player, position, amount) {
    // Compatibility: ptLookCards(amount)
    if (position === undefined && amount === undefined && !isNaN(parseInt(player))) {
        amount = parseInt(player);
        position = 'top';
        player = ptCurrentPlayer;
    }
    const p = player || ptCurrentPlayer;
    position = position || 'top';
    amount = parseInt(amount) || 5;
    ptLookingAtPlayer   = p;
    ptLookingAtIsBottom = (position === 'bottom');
    const deck = ptState[p].deck;
    const take = Math.min(amount, deck.length);
    if (take === 0) { ptShowMessage('Deck is empty!'); return; }
    if (ptLookingAtIsBottom) {
        ptLookingAt = deck.splice(0, take);
    } else {
        ptLookingAt = deck.splice(deck.length - take, take).reverse();
    }
    ptLog(`Looking at the ${position} ${take} card(s) [${p}].`);
    ptRenderTopCards();
    document.getElementById('ptTopCardsModal').style.display = 'flex';
}

function ptHandAction(type) {
    ptSaveState();
    const p   = ptCurrentPlayer;
    const amt = parseInt(document.getElementById('ptHandDrawAmt')?.value || 1);
    const _shuffle = deck => { for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; } };
    const _draw = (n) => { let d = 0; for (let i = 0; i < n; i++) if (ptState[p].deck.length > 0) { ptState[p].hand.push(ptState[p].deck.pop()); d++; } return d; };
    if (type === 'shuffle_deck') {
        ptState[p].deck.push(...ptState[p].hand);
        ptState[p].hand = [];
        _shuffle(ptState[p].deck);
        const drew = _draw(amt);
        ptLog(`Shuffled hand into deck, drew ${drew} card(s).`);
    } else if (type === 'shuffle_bottom') {
        ptState[p].deck.unshift(...ptState[p].hand);
        ptState[p].hand = [];
        const drew = _draw(amt);
        ptLog(`Moved hand to bottom of deck, drew ${drew} card(s).`);
    }
    ptRenderAll();
}

// --- GLOBAL TWO-PLAYER ACTIONS ---

// JUDGE: beide mischen ihre Hand INS Deck, shufflen das ganze Deck, ziehen exakt 4 (TCG-Regel)
function ptGlobalJudge() {
    ptSaveState();
    const JUDGE_DRAW = 4; // TCG Rule: Judge always draws exactly 4
    ['p1', 'p2'].forEach(p => {
        ptState[p].deck.push(...ptState[p].hand);
        ptState[p].hand = [];
        const deck = ptState[p].deck;
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        for (let i = 0; i < JUDGE_DRAW; i++) if (deck.length > 0) ptState[p].hand.push(deck.pop());
    });
    ptLog(`⚖️ Judge: Beide mischen Hand ins Deck, shufflen, ziehen je ${JUDGE_DRAW}.`);
    ptRenderAll();
}

// IONO: Hand in zufälliger Reihenfolge UNTER das Deck, ziehen = Anzahl verbleibender Prizes (TCG-Regel)
function ptGlobalIono() {
    ptSaveState();
    const draws = {};
    ['p1', 'p2'].forEach(p => {
        const amt = ptState[p].prizes.length; // TCG Rule: draw = remaining prize cards
        draws[p] = amt;
        if (ptState[p].hand.length > 0) {
            // Handkarten in zufälliger Reihenfolge UNTER das Deck legen (nicht ins Deck mischen)
            const handCards = [...ptState[p].hand];
            for (let i = handCards.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [handCards[i], handCards[j]] = [handCards[j], handCards[i]];
            }
            // Unter das Deck legen (Anfang des Arrays = unterste Karte)
            ptState[p].deck.unshift(...handCards);
            ptState[p].hand = [];
        }
        for (let i = 0; i < amt; i++) if (ptState[p].deck.length > 0) ptState[p].hand.push(ptState[p].deck.pop());
    });
    ptLog(`⚡ Iono: Hände unter das Deck gelegt. P1 zieht ${draws.p1} (Prizes), P2 zieht ${draws.p2} (Prizes).`);
    ptRenderAll();
}

// --- DMG BUFF COUNTER (Muscle Band, Choice Belt, etc.) ---
// Works directly on the DOM element; accumulates +amount per L-click, resets on R-click.
function ptToggleDmgMod(element, amount) {
    if (element.classList.contains('active') && amount > 0) {
        amount += parseInt(element.innerText.replace('+', '')) || 0;
    }
    if (amount === 0) {
        element.classList.remove('active');
        element.innerText = '+0';
        ptLog('DMG Buff zurückgesetzt.');
    } else {
        element.classList.add('active');
        element.innerText = '+' + amount;
        ptLog(`💪 DMG Buff: +${amount} gesamt.`);
    }
}

// --- MULLIGAN ---
function ptMulligan(player) {
    ptSaveState();
    ptState[player].deck.push(...ptState[player].hand);
    ptState[player].hand = [];
    const deck = ptState[player].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    for (let i = 0; i < 7; i++) if (deck.length > 0) ptState[player].hand.push(deck.pop());
    ptLog(`🃏 ${player} nimmt einen Mulligan — 7 neue Karten.`);
    ptRenderAll();
}

function ptFlipCoin() {
    // In MP mode, use synchronized coin flip via Firebase
    if (ptState.isMultiplayer && typeof mpFlipCoin === 'function') {
        mpFlipCoin();
        return;
    }
    const result = Math.random() >= 0.5 ? 'HEADS!' : 'TAILS!';
    ptLog(`🪙 Coin flip: ${result}`);
}

function ptFlipBoard() {
    const board    = document.getElementById('playtester-board');
    const handZone = document.querySelector('.pt-hand-zone');
    const ind      = document.getElementById('activePlayerIndicator');
    if (!board) return;
    const flipping = ptCurrentPlayer === 'p1';
    // In MP mode, only flip if it's your turn (you are the current player)
    if (ptState.isMultiplayer && ptCurrentPlayer !== ptState.localRole) {
        ptShowMessage('Nicht dein Zug!');
        return;
    }
    board.classList.toggle('flipped', flipping);
    ptCurrentPlayer = flipping ? 'p2' : 'p1';
    // Reset ability markers for the newly active player at the start of their turn
    if (ptState[ptCurrentPlayer] && ptState[ptCurrentPlayer].abilityUsed) {
        Object.keys(ptState[ptCurrentPlayer].abilityUsed).forEach(k => { ptState[ptCurrentPlayer].abilityUsed[k] = false; });
    }
    ptUpdateAreaPointerEvents();
    if (ind)      ind.innerText     = flipping ? '2' : '1';
    if (handZone) handZone.style.borderTopColor = flipping ? '#E3350D' : '#3B4CCA';
    ptLog(flipping ? 'Turn passed to Player 2.' : 'Turn passed to Player 1.');
    const vBtn = document.getElementById('ptVstarMarker');
    const gBtn = document.getElementById('ptGxMarker');
    if (vBtn) vBtn.classList.toggle('used', !!(ptState[ptCurrentPlayer] && ptState[ptCurrentPlayer].vstarUsed));
    if (gBtn) gBtn.classList.toggle('used', !!(ptState[ptCurrentPlayer] && ptState[ptCurrentPlayer].gxUsed));
    ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && ptState.isMultiplayer) syncStateToFirebase('Turn passed to ' + ptCurrentPlayer.toUpperCase());
}

function ptPassTurn() {
    const p = ptCurrentPlayer;

    const activeModEl = document.getElementById(`ptActiveModifier-${p}`);
    if (activeModEl) {
        activeModEl.classList.remove('active');
        activeModEl.innerText = '+0';
    }

    let dmg = 0;
    if (ptState[p].status.includes('poisoned')) dmg += 10;
    if (ptState[p].status.includes('burned'))   dmg += 20;
    if (dmg > 0) {
        ptState[p].damage.active += dmg;
        ptLog(`Status damage: +${dmg} DMG.`);
    }
    ptLog('Turn ended.');
    ptFlipBoard();
    // After turn flip: if new active player has no active Pokémon but has bench,
    // they must promote one BEFORE drawing.
    const newP = ptCurrentPlayer;
    const noActive = ptState[newP].field.active.length === 0;
    const hasBench  = ['bench0','bench1','bench2','bench3','bench4'].some(b => ptState[newP].field[b].length > 0);
    if (noActive && hasBench) {
        ptOpenPromoteModal(newP); // ptDraw1 is deferred to ptPromoteBench
    } else {
        ptDraw1();
    }
}

function ptOpenPromoteModal(player) {
    const benchZones = ['bench0','bench1','bench2','bench3','bench4'];
    const occupied   = benchZones.filter(b => ptState[player].field[b].length > 0);
    if (occupied.length === 0) { ptDraw1(player); return; }
    const _tp = (cards) => [...cards].reverse().find(c => { const ct = (c.cardType||'').toLowerCase(); return !ct.includes('energy') && ct !== 'tool' && !ct.includes('trainer'); }) || cards[0];
    let html = `<div style="background:#1a1a2e;border:2px solid #E3350D;border-radius:14px;padding:20px;text-align:center;color:#fff;max-width:520px;">
        <h3 style="color:#E3350D;margin-top:0;">⭐ Neues Aktives Pokémon wählen</h3>
        <p style="color:#ccc;font-size:12px;margin-bottom:4px;">Dein Aktives Pokémon wurde besiegt! Wähle ein Bankpokémon.</p>
        <p style="color:#f1c40f;font-size:11px;margin-bottom:16px;"><em>Du ziehst erst NACH der Wahl eine Karte.</em></p>
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:18px;">`;
    occupied.forEach(zoneId => {
        const cards   = ptState[player].field[zoneId];
        const topPoke = _tp(cards);
        html += `<div style="cursor:pointer;text-align:center;transition:transform .15s;"
                      onclick="ptPromoteBench('${player}','${zoneId}')"
                      onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${topPoke.imageUrl||CARD_BACK_URL}" style="width:82px;border-radius:8px;border:3px solid #E3350D;box-shadow:0 0 12px rgba(227,53,13,0.5);" onerror="this.src='${CARD_BACK_URL}'" title="${_ptEscHtml(topPoke.name)}">
            <div style="color:#fff;font-size:9px;margin-top:4px;max-width:82px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(topPoke.name)}</div>
        </div>`;
    });
    html += `</div></div>`;
    let modal = document.getElementById('ptPromoteModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ptPromoteModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99998;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
    ptLog(`⭐ ${player.toUpperCase()} muss neues Aktives Pokémon wählen!`);
}

function ptPromoteBench(player, benchZone) {
    ptState[player].field.active      = [...ptState[player].field[benchZone]];
    ptState[player].damage.active     = ptState[player].damage[benchZone] || 0;
    ptState[player].field[benchZone]  = [];
    ptState[player].damage[benchZone] = 0;
    ptState[player].status = [];
    const _tp = (cards) => [...cards].reverse().find(c => { const ct = (c.cardType||'').toLowerCase(); return !ct.includes('energy') && ct !== 'tool'; }) || cards[0];
    const topCard = _tp(ptState[player].field.active);
    ptLog(`⭐ ${player.toUpperCase()}: ${topCard ? topCard.name : '?'} → Aktives Pokémon!`);
    const modal = document.getElementById('ptPromoteModal');
    if (modal) modal.style.display = 'none';
    ptRenderAll();
    ptDraw1(player); // Draw AFTER promotion
}

function ptOpenAttackView() {
    const myActive = ptState[ptCurrentPlayer].field.active;
    const opp      = ptCurrentPlayer === 'p1' ? 'p2' : 'p1';
    const _topPoke = cards => {
        if (!cards || cards.length === 0) return null;
        return [...cards].reverse().find(c => {
            const ct = (c.cardType || '').toLowerCase();
            return !ct.includes('energy') && !ct.includes('trainer') && ct !== 'tool';
        }) || cards[0];
    };
    const myCard = _topPoke(myActive);
    const myImg  = document.getElementById('ptAttackMyImg');
    const myName = document.getElementById('ptAttackMyName');
    if (myImg)  myImg.src           = myCard ? (myCard.imageUrl || CARD_BACK_URL) : CARD_BACK_URL;
    if (myName) myName.textContent  = myCard ? (myCard.name || '') : '(leer)';
    // Render opp field into the attack modal's dedicated container
    ptRenderOpponentPanel(opp, 'field', 'ptAttackOppContent');
    const modal = document.getElementById('ptAttackModal');
    if (modal) modal.style.display = 'flex';
}

function ptCloseAttackView() {
    const modal = document.getElementById('ptAttackModal');
    if (modal) modal.style.display = 'none';
    ptPassTurn();
}

// --- DECK SEARCH ---

let _ptDeckSearchPlayer = null;
let _ptDeckSearchSort   = 'deck'; // 'deck' | 'type'
let _ptDiscardSort      = 'order'; // 'order' | 'type' — for own discard modal

function _ptDeckCardSortOrder(card) {
    // Actual DB type values: 'G Basic', 'N Stage 1', 'Supporter', 'Item', 'Tool', 'Stadium', 'Special Energy', 'Basic Energy'
    const t = (card.cardType || card.supertype || '').toLowerCase();
    if (t === 'supporter')                              return 1;
    if (t === 'item')                                   return 2;
    if (t === 'tool')                                   return 3;
    if (t === 'stadium')                                return 4;
    if (t === 'special energy')                         return 5;
    if (t === 'basic energy' || t.includes('energy'))   return 6;
    // Pokémon: 'X Basic', 'X Stage 1', 'X Stage 2', or empty = treat as Pokémon
    return 0;
}

function _ptSetDeckSort(sort) {
    _ptDeckSearchSort = sort;
    const btnDeck = document.getElementById('ptDSortDeck');
    const btnType = document.getElementById('ptDSortType');
    if (btnDeck) { btnDeck.style.background = sort === 'deck' ? '#2a52be' : '#333'; btnDeck.style.color = sort === 'deck' ? '#fff' : '#ccc'; btnDeck.style.borderColor = sort === 'deck' ? '#3B4CCA' : '#555'; }
    if (btnType) { btnType.style.background = sort === 'type' ? '#2a52be' : '#333'; btnType.style.color = sort === 'type' ? '#fff' : '#ccc'; btnType.style.borderColor = sort === 'type' ? '#3B4CCA' : '#555'; }
    _ptRefreshDeckSearchGrid();
}

function _ptGetSortedDeckCards(p) {
    const deck = ptState[p].deck;
    if (_ptDeckSearchSort === 'deck') {
        // deck array: index 0 = bottom, last = top → reverse so top card is first in display
        return [...deck].reverse();
    }
    // TCG type sort
    return [...deck].sort((a, b) => {
        const diff = _ptDeckCardSortOrder(a) - _ptDeckCardSortOrder(b);
        return diff !== 0 ? diff : (a.name || '').localeCompare(b.name || '');
    });
}

function _ptRefreshDeckSearchGrid() {
    const grid = document.getElementById('ptDeckSearchGrid');
    if (!grid) return;
    const p = _ptDeckSearchPlayer || ptCurrentPlayer;
    const cards = _ptGetSortedDeckCards(p);
    grid.innerHTML = '';

    // Group header label for type-sort
    let lastGroup = -1;

    cards.forEach(card => {
        if (_ptDeckSearchSort === 'type') {
            const group = _ptDeckCardSortOrder(card);
            if (group !== lastGroup) {
                lastGroup = group;
                const groupLabel = ['🐾 Pokémon', '🧑‍⚕️ Supporter', '🧰 Item', '🔧 Tool', '🏟️ Stadion', '✨ Special Energy', '⚡ Basic Energy', '🃏 Trainer'][group] || '';
                const sep = document.createElement('div');
                sep.style.cssText = 'width:100%;text-align:left;color:#FFCB05;font-size:10px;font-weight:900;padding:4px 0 2px 2px;letter-spacing:.5px;';
                sep.textContent = groupLabel;
                grid.appendChild(sep);
            }
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;cursor:pointer;';
        wrap.title = card.name;

        const img = document.createElement('img');
        img.src = card.imageUrl || CARD_BACK_URL;
        img.alt = card.name || 'Card';
        img.className = 'pt-field-card';
        img.style.width = '100px';
        img.loading = 'lazy';
        img.onerror = function() { this.src = CARD_BACK_URL; };
        img.onclick       = () => ptRouteFromDeck(card.ptId, 'hand');
        img.oncontextmenu = e  => { e.preventDefault(); ptRouteFromDeck(card.ptId, 'lost'); };
        img.ondblclick    = e  => ptViewCard(img.src, card.name);

        const lbl = document.createElement('div');
        lbl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 4px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
        lbl.textContent = card.name;

        wrap.appendChild(img);
        wrap.appendChild(lbl);
        grid.appendChild(wrap);
    });

    if (cards.length === 0) {
        grid.innerHTML = '<div style="color:#aaa;padding:20px;text-align:center;">Deck ist leer.</div>';
    }
}

function ptOpenDeckSearch(player) {
    _ptDeckSearchPlayer = player || ptCurrentPlayer;
    _ptDeckSearchSort   = 'deck'; // always open in deck order
    // Reset sort button visuals
    const btnDeck = document.getElementById('ptDSortDeck');
    const btnType = document.getElementById('ptDSortType');
    if (btnDeck) { btnDeck.style.background = '#2a52be'; btnDeck.style.color = '#fff'; btnDeck.style.borderColor = '#3B4CCA'; }
    if (btnType) { btnType.style.background = '#333';    btnType.style.color = '#ccc'; btnType.style.borderColor = '#555'; }
    _ptRefreshDeckSearchGrid();
    document.getElementById('ptDeckSearchModal').style.display = 'flex';
}

function ptRouteFromDeck(cardId, destination) {
    const p   = _ptDeckSearchPlayer || ptCurrentPlayer;
    const idx = ptState[p].deck.findIndex(c => c.ptId === cardId);
    if (idx > -1) {
        const card = ptState[p].deck.splice(idx, 1)[0];
        if (destination === 'hand') {
            ptState[p].hand.push(card);
            ptLog(`Searched "${card.name}" to hand.`);
        } else {
            ptState[p].lostzone.push(card);
            ptLog(`Sent "${card.name}" from deck to Lost Zone.`);
        }
        // Refresh the grid so the taken card disappears — modal stays open
        _ptRefreshDeckSearchGrid();
        ptRenderAll();
    }
}

function ptCloseDeckSearch() {
    document.getElementById('ptDeckSearchModal').style.display = 'none';
    ptShuffleDeck(_ptDeckSearchPlayer || ptCurrentPlayer); // Shuffle deck after player finishes searching
    _ptDeckSearchPlayer = null;
}

// --- ZONE INTERACTION ---

function ptClickZone(player, zoneId) {
    const opp = ptCurrentPlayer === 'p1' ? 'p2' : 'p1';
    const wasAttachAction = (window.pendingAttachAction === true) || ptIsAttachSelection(ptCurrentPlayer);

    // Helper: show last Pokémon in a zone stack (skip energy/tools)
    const _topCard = (cards) =>
        [...cards].reverse().find(c => {
            const ct = (c.cardType || '').toLowerCase();
            return !ct.includes('energy') && ct !== 'tool' && !ct.includes('trainer');
        }) || cards[cards.length - 1];

    // MP safety: block playing cards as the opponent
    if (ptState.isMultiplayer && ptCurrentPlayer !== ptState.localRole && ptSelectedCardIndex !== null) return;

    // Clicking on opponent's zone
    if (player === opp) {
        const cards = ptState[player].field[zoneId];
        if (cards && cards.length > 0) {
            // Zoom the top Pokémon card (not energy/tool)
            const c = _topCard(cards);
            ptViewCard(c.imageUrl || CARD_BACK_URL, c.name || '');
            // Open opponent panel focused on field/this zone
            ptOpenOpponentPanel('field', zoneId);
        }
        return;
    }

    // No hand card selected → zoom the top card of this zone
    if (ptSelectedCardIndex === null) {
        const cards = (zoneId === 'stadium') ? ptState.stadium
                    : (zoneId === 'playzone') ? ptState.playZone
                    : ptState[player].field[zoneId];
        if (cards && cards.length > 0) {
            const c = (zoneId === 'active' || zoneId.startsWith('bench'))
                ? _topCard(cards)
                : cards[cards.length - 1];
            ptViewCard(c.imageUrl || CARD_BACK_URL, c.name || '');
        }
        return;
    }

    // Hand card selected → place it on the target zone
    const card = ptState[ptCurrentPlayer].hand[ptSelectedCardIndex];
    if (!card) {
        ptSetAttachMode(false);
        return;
    }

    // Active/Bench handling:
    // - Pokémon can be played as usual
    // - Energy/Tool can only be attached to an occupied Pokémon zone
    // - Other card types are blocked
    if (zoneId === 'active' || zoneId.startsWith('bench')) {
        const targetStack = ptState[player].field[zoneId];
        const isPokemon = _ptIsPokemon(card);
        const isAttach = _ptIsEnergy(card) || _ptIsTool(card);

        if (!isPokemon && !isAttach) {
            ptShowMessage('⛔ Nur Pokémon, Energy oder Tools dürfen auf Active/Bench!');
            ptSelectedCardIndex = null;
            ptSetAttachMode(false);
            ptRenderHand();
            return;
        }

        if (isAttach && (!targetStack || targetStack.length === 0)) {
            ptShowMessage('⛔ Energy/Tool kann nur an ein vorhandenes Pokémon angelegt werden!');
            ptSelectedCardIndex = null;
            ptSetAttachMode(false);
            ptRenderHand();
            return;
        }
    }

    ptSaveState();

    if (zoneId === 'playzone') {
        ptState.playZone.push(card);
        ptLog(`Played Item/Supporter: "${card.name}".`);
        // Check trainer registry for automated effects
        const _tKey = _ptGetAbilityKey(card);
        const _tFn = _tKey && PT_TRAINER_REGISTRY[_tKey];
        if (_tFn) {
            setTimeout(() => _tFn(ptCurrentPlayer, card), 50);
        }
    } else if (zoneId === 'stadium') {
        if (ptState.stadium.length > 0) {
            const stadiumOwner = ptState.stadiumPlayedBy || ptCurrentPlayer;
            ptState[stadiumOwner].discard.push(ptState.stadium.pop());
        }
        ptState.stadium.push(card);
        ptState.stadiumPlayedBy = ptCurrentPlayer;
        ptLog(`Played Stadium: "${card.name}" (${ptCurrentPlayer.toUpperCase()}).`);
    } else {
        ptState[player].field[zoneId].push(card);
        ptLog(`Placed "${card.name}" on ${player} ${zoneId}.`);
    }
    ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1);
    ptSelectedCardIndex = null;
    if (wasAttachAction) {
        setTimeout(() => ptSetAttachMode(false), 0);
    } else {
        ptSetAttachMode(false);
    }
    ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && ptState.isMultiplayer) syncStateToFirebase('Played ' + card.name);
}

// --- FIELD-TO-FIELD DRAG DROP ---

function moveZoneToZone(sourceId, targetId) {
    if (sourceId === targetId) return;
    const parseId = id => {
        const m = id.match(/^pt(ActiveZone|Bench\d)-(p1|p2)$/i);
        if (!m) return null;
        const zone = m[1].toLowerCase().replace('activezone', 'active');
        return { player: m[2], zone };
    };
    const src = parseId(sourceId);
    const tgt = parseId(targetId);
    if (!src || !tgt) return;

    if (ptState[tgt.player].field[tgt.zone].length > 0) {
        const tCards = [...ptState[tgt.player].field[tgt.zone]];
        const tDmg   = ptState[tgt.player].damage[tgt.zone];
        ptState[tgt.player].field[tgt.zone]  = [...ptState[src.player].field[src.zone]];
        ptState[tgt.player].damage[tgt.zone] = ptState[src.player].damage[src.zone];
        ptState[src.player].field[src.zone]  = tCards;
        ptState[src.player].damage[src.zone] = tDmg;
        ptLog(`Swapped positions: ${src.zone} ↔ ${tgt.zone}`);
    } else {
        ptState[tgt.player].field[tgt.zone]  = [...ptState[src.player].field[src.zone]];
        ptState[tgt.player].damage[tgt.zone] = ptState[src.player].damage[src.zone];
        ptState[src.player].field[src.zone]  = [];
        ptState[src.player].damage[src.zone] = 0;
        ptLog(`Moved Pokémon to ${tgt.zone}.`);
    }
    if (src.zone === 'active') ptState[src.player].status = [];
    if (tgt.zone === 'active') ptState[tgt.player].status = [];
    ptRenderAll();
}

// --- DRAG & DROP ---

function setupDragAndDrop() {
    // Highlight drop zones on dragover
    if (document._ptDragEnterHandler) document.removeEventListener('dragenter', document._ptDragEnterHandler);
    if (document._ptDragLeaveHandler) document.removeEventListener('dragleave',  document._ptDragLeaveHandler);
    document._ptDragEnterHandler = e => {
        const zone = e.target.closest('.pt-dropzone');
        if (zone) zone.classList.add('drag-over');
    };
    document._ptDragLeaveHandler = e => {
        const zone = e.target.closest('.pt-dropzone');
        if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    };
    document.addEventListener('dragenter', document._ptDragEnterHandler);
    document.addEventListener('dragleave',  document._ptDragLeaveHandler);
}

// Named event handler functions used in HTML ondragover/ondragleave attributes.
// Using named functions instead of inlining event.preventDefault() gives us a
// single place to extend logic (e.g. visual feedback) without touching the HTML.
function ptHandleDragOver(event) {
    event.preventDefault();
    const zone = event.currentTarget;
    if (zone) zone.classList.add('drag-over');
}

function ptHandleDragLeave(event) {
    const zone = event.currentTarget;
    if (zone && !zone.contains(event.relatedTarget)) zone.classList.remove('drag-over');
}

function ptHandleDrop(event, targetZone) {
    event.preventDefault();
    event.stopPropagation();
    ptSaveState();
    const dropEl = event.target.closest('.pt-dropzone');
    if (dropEl) dropEl.classList.remove('drag-over');

    const sourceZone = event.dataTransfer.getData('sourceZone');
    const handIndex  = event.dataTransfer.getData('text/plain');

    if (sourceZone) {
        // Field-to-field drag
        const idMap = {
            'p1-active':  'ptActiveZone-p1', 'p2-active':  'ptActiveZone-p2',
            'p1-bench0':  'ptBench0-p1',     'p2-bench0':  'ptBench0-p2',
            'p1-bench1':  'ptBench1-p1',     'p2-bench1':  'ptBench1-p2',
            'p1-bench2':  'ptBench2-p1',     'p2-bench2':  'ptBench2-p2',
            'p1-bench3':  'ptBench3-p1',     'p2-bench3':  'ptBench3-p2',
            'p1-bench4':  'ptBench4-p1',     'p2-bench4':  'ptBench4-p2',
        };
        let targetId = idMap[targetZone];
        if (!targetId && (targetZone === 'p1-bench' || targetZone === 'p2-bench')) {
            const bp   = targetZone === 'p1-bench' ? 'p1' : 'p2';
            const slot = _ptFirstFreeBench(bp);
            targetId   = 'ptBench' + slot.slice(-1) + '-' + bp;
        }
        if (targetId) moveZoneToZone(sourceZone, targetId);
        else if (targetZone === 'hand') {
            // sourceZone is an element ID like "ptActiveZone-p1" or "ptBench2-p1"
            const m = sourceZone.match(/^pt(ActiveZone|Bench\d)-(p\d)$/i);
            if (m) {
                const zoneId = m[1].toLowerCase().replace('activezone', 'active');
                returnToHand(m[2], zoneId);
            }
        }
        return;
    }

    if (handIndex !== '') {
        ptSelectedCardIndex = parseInt(handIndex);
        if (targetZone === 'stadium')           ptClickZone(ptCurrentPlayer, 'stadium');
        else if (targetZone === 'playzone')     ptClickZone(ptCurrentPlayer, 'playzone');
        else if (targetZone === 'p1-active')    ptClickZone('p1', 'active');
        else if (targetZone === 'p2-active')    ptClickZone('p2', 'active');
        else if (targetZone === 'p1-bench')     ptClickZone('p1', _ptFirstFreeBench('p1'));
        else if (targetZone === 'p2-bench')     ptClickZone('p2', _ptFirstFreeBench('p2'));
        else if (targetZone === 'p1-bench0') ptClickZone('p1', 'bench0');
        else if (targetZone === 'p1-bench1') ptClickZone('p1', 'bench1');
        else if (targetZone === 'p1-bench2') ptClickZone('p1', 'bench2');
        else if (targetZone === 'p1-bench3') ptClickZone('p1', 'bench3');
        else if (targetZone === 'p1-bench4') ptClickZone('p1', 'bench4');
        else if (targetZone === 'p2-bench0') ptClickZone('p2', 'bench0');
        else if (targetZone === 'p2-bench1') ptClickZone('p2', 'bench1');
        else if (targetZone === 'p2-bench2') ptClickZone('p2', 'bench2');
        else if (targetZone === 'p2-bench3') ptClickZone('p2', 'bench3');
        else if (targetZone === 'p2-bench4') ptClickZone('p2', 'bench4');
        else if (targetZone === 'p1-discard') {
            const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
            if (c) { ptState['p1'].discard.push(c); ptLog(`Discarded "${c.name}".`); }
            ptSelectedCardIndex = null; ptRenderAll();
        } else if (targetZone === 'p2-discard') {
            const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
            if (c) { ptState['p2'].discard.push(c); ptLog(`Discarded "${c.name}".`); }
            ptSelectedCardIndex = null; ptRenderAll();
        } else if (targetZone === 'p1-lost') {
            const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
            if (c) { ptState['p1'].lostzone.push(c); ptLog(`Sent "${c.name}" to Lost Zone.`); }
            ptSelectedCardIndex = null; ptRenderAll();
        } else if (targetZone === 'p2-lost') {
            const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
            if (c) { ptState['p2'].lostzone.push(c); ptLog(`Sent "${c.name}" to Lost Zone.`); }
            ptSelectedCardIndex = null; ptRenderAll();
        } else if (targetZone === 'hand') {
            // Hand-to-hand reorder: move card to the position indicated by mouse X
            const srcIdx = parseInt(handIndex);
            if (!isNaN(srcIdx)) {
                const hand      = ptState[ptCurrentPlayer].hand;
                const handEl    = document.getElementById('ptHandZone');
                const afterEl   = handEl ? getDragAfterElement(handEl, event.clientX) : null;
                const wrappers  = handEl ? [...handEl.querySelectorAll('.pt-hand-wrapper')] : [];
                let targetIdx   = afterEl ? wrappers.indexOf(afterEl) : hand.length;
                if (targetIdx === -1) targetIdx = hand.length;
                if (targetIdx !== srcIdx) {
                    const [card] = hand.splice(srcIdx, 1);
                    const insertAt = targetIdx > srcIdx ? targetIdx - 1 : targetIdx;
                    hand.splice(insertAt, 0, card);
                }
                ptSelectedCardIndex = null;
                ptRenderAll();
            }
        }
    }
}

function _ptFirstFreeBench(player) {
    for (let i = 0; i < 5; i++) {
        if (ptState[player].field['bench' + i].length === 0) return 'bench' + i;
    }
    return 'bench0'; // fallback: slot 0
}

function ptDragStartHand(event, index) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.setData('sourceZone', '');
    ptSelectedCardIndex = index;
    const wrapper = event.target.closest('.pt-hand-wrapper');
    if (wrapper) {
        setTimeout(() => wrapper.classList.add('dragging'), 0);
        wrapper.addEventListener('dragend', () => wrapper.classList.remove('dragging'), { once: true });
    }
    // NOTE: do NOT call ptRenderHand() here — it destroys the dragged element
    // mid-flight and immediately cancels the drag in all browsers.
}

function ptDragStartField(event, elementId) {
    event.dataTransfer.setData('sourceZone', elementId);
    event.dataTransfer.setData('text/plain', '');
    const card = event.target.closest('.pt-field-card');
    if (card) {
        setTimeout(() => card.classList.add('dragging'), 0);
        card.addEventListener('dragend', () => card.classList.remove('dragging'), { once: true });
    }
}

// Returns the .pt-hand-wrapper element that the dragged card should be inserted BEFORE,
// based on the mouse X position. Returns null if the card should go at the very end.
function getDragAfterElement(container, x) {
    const draggables = [...container.querySelectorAll('.pt-hand-wrapper:not(.dragging)')];
    return draggables.reduce((closest, child) => {
        const box    = child.getBoundingClientRect();
        const offset = x - box.left - box.width / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// --- RETREAT ---

function ptSwapZones(player, benchZone, event) {
    if (event) event.stopPropagation();
    const tmpCards = [...ptState[player].field.active];
    const tmpDmg   = ptState[player].damage.active;
    ptState[player].field.active      = [...ptState[player].field[benchZone]];
    ptState[player].damage.active     = ptState[player].damage[benchZone];
    ptState[player].field[benchZone]  = tmpCards;
    ptState[player].damage[benchZone] = tmpDmg;
    ptState[player].status = [];
    ptLog('Retreat!');
    ptRenderAll();
}

function ptEnergyDiscard(player, zoneId) {
    const cards = ptState[player].field[zoneId];
    if (!cards || cards.length === 0) return;
    const energies = cards.map((c, i) => ({ card: c, idx: i }))
        .filter(e => (e.card.cardType || '').toLowerCase().includes('energy'));
    if (energies.length === 0) {
        ptShowMessage('Keine Energy auf diesem Pokémon!');
        return;
    }
    if (energies.length === 1) {
        const removed = cards.splice(energies[0].idx, 1)[0];
        ptState[player].discard.push(removed);
        ptLog(`⚡🗑️ ${_ptEscHtml(removed.name)} → Discard`);
        ptSaveState(); ptRenderAll();
        return;
    }
    // Multiple energies – show pick modal
    let html = `<div style="background:#1a1a2e;border:2px solid #f39c12;border-radius:14px;padding:20px;text-align:center;color:#fff;max-width:520px;">
        <h3 style="color:#f39c12;margin-top:0;">⚡🗑️ Energy ablegen</h3>
        <p style="color:#ccc;font-size:12px;margin-bottom:16px;">Wähle eine Energy-Karte zum Ablegen.</p>
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:18px;">`;
    energies.forEach(e => {
        const safeImg = (e.card.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        html += `<div style="cursor:pointer;text-align:center;transition:transform .15s;"
                      onclick="ptFinishEnergyDiscard('${player}','${zoneId}',${e.idx})"
                      onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${e.card.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:8px;border:3px solid #f39c12;box-shadow:0 0 12px rgba(243,156,18,0.5);" onerror="this.src='${CARD_BACK_URL}'" title="${_ptEscHtml(e.card.name)}">
            <div style="color:#fff;font-size:9px;margin-top:4px;max-width:82px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(e.card.name)}</div>
        </div>`;
    });
    html += `</div>
        <button onclick="document.getElementById('ptEnergyDiscardModal').style.display='none'" style="background:#555;color:#fff;border:none;padding:6px 18px;border-radius:8px;cursor:pointer;">Abbrechen</button>
    </div>`;
    let modal = document.getElementById('ptEnergyDiscardModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ptEnergyDiscardModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99998;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
}

function ptFinishEnergyDiscard(player, zoneId, idx) {
    const modal = document.getElementById('ptEnergyDiscardModal');
    if (modal) modal.style.display = 'none';
    const cards = ptState[player].field[zoneId];
    if (!cards || idx >= cards.length) return;
    const removed = cards.splice(idx, 1)[0];
    ptState[player].discard.push(removed);
    ptLog(`⚡🗑️ ${_ptEscHtml(removed.name)} → Discard`);
    ptSaveState(); ptRenderAll();
}

function ptRetreat(player, zoneId) {
    if (zoneId !== 'active') {
        // Bench → swap directly with active
        ptSwapZones(player, zoneId, null);
        return;
    }
    // Active → show modal to pick bench Pokémon
    const benchZones = ['bench0','bench1','bench2','bench3','bench4'];
    const occupied = benchZones.filter(b => ptState[player].field[b].length > 0);
    if (occupied.length === 0) {
        ptShowMessage('Keine Pokémon auf der Bank!');
        return;
    }
    if (occupied.length === 1) {
        ptSwapZones(player, occupied[0], null);
        return;
    }
    const _tp = (cards) => [...cards].reverse().find(c => { const ct = (c.cardType||'').toLowerCase(); return !ct.includes('energy') && ct !== 'tool' && !ct.includes('trainer'); }) || cards[0];
    let html = `<div style="background:#1a1a2e;border:2px solid #3498db;border-radius:14px;padding:20px;text-align:center;color:#fff;max-width:520px;">
        <h3 style="color:#3498db;margin-top:0;">↩️ Retreat – Bankpokémon wählen</h3>
        <p style="color:#ccc;font-size:12px;margin-bottom:16px;">Wähle ein Bankpokémon als neues Aktives.</p>
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:18px;">`;
    occupied.forEach(bz => {
        const topPoke = _tp(ptState[player].field[bz]);
        html += `<div style="cursor:pointer;text-align:center;transition:transform .15s;"
                      onclick="ptFinishRetreat('${player}','${bz}')"
                      onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${topPoke.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:8px;border:3px solid #3498db;box-shadow:0 0 12px rgba(52,152,219,0.5);" onerror="this.src='${CARD_BACK_URL}'" title="${_ptEscHtml(topPoke.name)}">
            <div style="color:#fff;font-size:9px;margin-top:4px;max-width:82px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(topPoke.name)}</div>
        </div>`;
    });
    html += `</div>
        <button onclick="document.getElementById('ptRetreatModal').style.display='none'" style="background:#555;color:#fff;border:none;padding:6px 18px;border-radius:8px;cursor:pointer;">Abbrechen</button>
    </div>`;
    let modal = document.getElementById('ptRetreatModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ptRetreatModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99998;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
    ptLog(`↩️ ${player.toUpperCase()} wählt Retreat-Ziel…`);
}

function ptFinishRetreat(player, benchZone) {
    const modal = document.getElementById('ptRetreatModal');
    if (modal) modal.style.display = 'none';
    ptSwapZones(player, benchZone, null);
}

// --- ACTION COMMANDS ---

function returnToHand(player, zoneId, event) {
    if (event) event.stopPropagation();
    const isNeutral = (zoneId === 'playzone' || zoneId === 'stadium');
    const zoneArr = isNeutral ? (zoneId === 'stadium' ? ptState.stadium : ptState.playZone) : ptState[player].field[zoneId];
    if (zoneArr.length > 0) {
        const c = zoneArr.pop();
        const neutralOwner = (zoneId === 'stadium') ? (ptState.stadiumPlayedBy || ptCurrentPlayer) : ptCurrentPlayer;
        ptState[neutralOwner].hand.push(c);
        ptLog(`Took "${c.name}" to hand.`);
        if (zoneId === 'stadium' && zoneArr.length === 0) ptState.stadiumPlayedBy = null;
        if (!isNeutral && zoneArr.length === 0) {
            ptState[player].damage[zoneId] = 0;
            if (zoneId === 'active') ptState[player].status = [];
        }
        ptRenderAll();
    }
}

function discardTopCard(player, zoneId, event) {
    if (event) event.stopPropagation();
    const isNeutral = (zoneId === 'playzone' || zoneId === 'stadium');
    const zoneArr = isNeutral ? (zoneId === 'stadium' ? ptState.stadium : ptState.playZone) : ptState[player].field[zoneId];
    if (zoneArr.length > 0) {
        const c = zoneArr.pop();
        const neutralOwner = (zoneId === 'stadium') ? (ptState.stadiumPlayedBy || ptCurrentPlayer) : ptCurrentPlayer;
        ptState[neutralOwner].discard.push(c);
        ptLog(`Discarded "${c.name}".`);
        if (zoneId === 'stadium' && zoneArr.length === 0) ptState.stadiumPlayedBy = null;
        if (!isNeutral && zoneArr.length === 0) {
            ptState[player].damage[zoneId] = 0;
            if (zoneId === 'active') ptState[player].status = [];
        }
        ptRenderAll();
    }
}

function moveToLostZone(player, zoneId, event) {
    if (event) event.stopPropagation();
    const isNeutral = (zoneId === 'playzone' || zoneId === 'stadium');
    const zoneArr = isNeutral ? (zoneId === 'stadium' ? ptState.stadium : ptState.playZone) : ptState[player].field[zoneId];
    if (zoneArr.length > 0) {
        const c = zoneArr.pop();
        const neutralOwner = (zoneId === 'stadium') ? (ptState.stadiumPlayedBy || ptCurrentPlayer) : ptCurrentPlayer;
        ptState[neutralOwner].lostzone.push(c);
        ptLog(`Sent "${c.name}" to the Lost Zone.`);
        if (zoneId === 'stadium' && zoneArr.length === 0) ptState.stadiumPlayedBy = null;
        if (!isNeutral && zoneArr.length === 0) {
            ptState[player].damage[zoneId] = 0;
            if (zoneId === 'active') ptState[player].status = [];
        }
        ptRenderAll();
    }
}

function addDamage(player, zoneId, amount, event) {
    if (event) event.stopPropagation();
    ptState[player].damage[zoneId] = Math.max(0, (ptState[player].damage[zoneId] || 0) + amount);
    ptLog(`+${amount} damage on ${zoneId}.`);
    ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && ptState.isMultiplayer) syncStateToFirebase(`Damage ${amount > 0 ? '+' : ''}${amount} on ${zoneId}`);
}

// ── Damage Swipe Gesture ────────────────────────────────────────────────
let _ptDmgSwipeStartX = 0;
let _ptDmgSwipeAccum  = 0;

function ptDmgSwipeStart(event, player, zoneId) {
    event.stopPropagation();
    if (event.touches && event.touches.length === 1) {
        _ptDmgSwipeStartX = event.touches[0].clientX;
        _ptDmgSwipeAccum  = 0;
    }
}

function ptDmgSwipeMove(event, player, zoneId) {
    event.stopPropagation();
    event.preventDefault();
    if (!event.touches || event.touches.length !== 1) return;
    const dx = event.touches[0].clientX - _ptDmgSwipeStartX;
    // Every 25px of horizontal movement = 10 damage increment
    const steps = Math.floor(dx / 25) - _ptDmgSwipeAccum;
    if (steps !== 0) {
        _ptDmgSwipeAccum += steps;
        ptState[player].damage[zoneId] = Math.max(0, (ptState[player].damage[zoneId] || 0) + steps * 10);
        // Update value display without full re-render
        const overlay = event.currentTarget;
        const valEl = overlay && overlay.querySelector('.pt-dmg-value');
        if (valEl) valEl.textContent = ptState[player].damage[zoneId];
    }
}

function ptDmgSwipeEnd(event) {
    event.stopPropagation();
    _ptDmgSwipeStartX = 0;
    _ptDmgSwipeAccum = 0;
    ptRenderAll();
}

function clearDamage(player, zoneId, event) {
    if (event) event.stopPropagation();
    ptState[player].damage[zoneId] = 0;
    ptLog(`Pokémon on ${zoneId} healed.`);
    ptRenderAll();
}

function ptGetKnockedOutPokemonFromCards(cards) {
    return [...(cards || [])].reverse().find(c => {
        const ct = (c.cardType || c.supertype || '').toLowerCase();
        return !ct.includes('energy') && ct !== 'tool' && !ct.includes('trainer');
    }) || cards?.[0] || null;
}

function ptGetOpponentPlayer(player) {
    return player === 'p1' ? 'p2' : 'p1';
}

function ptKnockOutZone(player, zoneId, prizeTakerOverride) {
    const cards = ptState[player]?.field?.[zoneId];
    if (!cards || cards.length === 0) return;

    const prizeTaker = prizeTakerOverride || ptGetOpponentPlayer(player);
    const count = cards.length;
    const knockedOutPokemon = ptGetKnockedOutPokemonFromCards(cards);

    while (cards.length > 0) {
        ptState[player].discard.push(cards.shift());
    }

    ptState[player].damage[zoneId] = 0;
    if (zoneId === 'active') ptState[player].status = [];

    ptLog(`☠️ ${zoneId} (${player}) K.O. → Discard (${count} Karten).`);
    ptRenderAll();

    if (player !== ptCurrentPlayer) {
        ptRefreshOpponentField(player);
    }

    if (zoneId === 'active' && player === ptCurrentPlayer) {
        const hasBench = ['bench0', 'bench1', 'bench2', 'bench3', 'bench4']
            .some(benchZone => ptState[player].field[benchZone].length > 0);
        if (hasBench) {
            setTimeout(() => ptOpenPromoteModal(player), 120);
        }
    }

    if (ptState[prizeTaker].prizes.length > 0) {
        const prizeCount = ptGetPrizeCountForKnockout(knockedOutPokemon);
        setTimeout(() => ptOpenPrizePicker(prizeTaker, prizeCount, prizeTaker), 200);
    }
}

function ptOppKnockOutZone(opp, zoneId) {
    ptKnockOutZone(opp, zoneId, ptCurrentPlayer);
}

function toggleStatus(player, statusType, event) {
    if (event) event.stopPropagation();
    const idx = ptState[player].status.indexOf(statusType);
    if (idx > -1) ptState[player].status.splice(idx, 1);
    else ptState[player].status.push(statusType);
    ptLog(`Status "${statusType}" updated.`);
    ptRenderAll();
}

function ptToggleLock(player, type) {
    ptState[player][type] = !ptState[player][type];
    const label = type === 'itemLock' ? 'Item-Lock' : 'Tool-Lock';
    const state = ptState[player][type] ? 'AN 🔴' : 'AUS 🟢';
    ptLog(`${label} für ${player.toUpperCase()}: ${state}`);
    ptRenderAll();
    // Refresh opponent panel if open
    const panel = document.getElementById('ptOppPanel');
    if (panel && panel.style.display !== 'none') ptOppSwitchTab('field');
}

// --- OPPONENT DAMAGE PANEL (accessible regardless of active player) ---

// --- OPPONENT FULL VIEW PANEL ---

let _ptOppTab = 'field';
let _ptOppFocusZone = null;
let _ptOppLastContainer = 'ptOppPanelContent';

function ptOpenOpponentPanel(tab, focusZone) {
    const opp = ptCurrentPlayer === 'p1' ? 'p2' : 'p1';
    _ptOppTab = tab || 'field';
    _ptOppFocusZone = focusZone || null;
    const title = document.getElementById('ptOppPanelTitle');
    if (title) title.textContent = `⚔️ Gegner (${opp.toUpperCase()})`;
    ptOppSwitchTab(_ptOppTab);
    document.getElementById('ptOppPanel').style.display = 'flex';
}

function ptOppSwitchTab(tab) {
    _ptOppTab = tab;
    const opp = ptCurrentPlayer === 'p1' ? 'p2' : 'p1';
    // Update tab button styles
    ['field','discard','lostzone'].forEach(t => {
        const btn = document.getElementById('ptOppTab-' + t);
        if (btn) { btn.style.background = t === tab ? '#e74c3c' : '#333'; btn.style.color = t === tab ? '#fff' : '#aaa'; }
    });
    ptRenderOpponentPanel(opp, tab);
}

function ptRenderOpponentPanel(opp, tab, containerId) {
    _ptOppLastContainer = containerId || 'ptOppPanelContent';
    const el = document.getElementById(_ptOppLastContainer);
    if (!el) return;
    tab = tab || _ptOppTab || 'field';

    if (tab === 'field') {
        // ─ Field: all Pokémon with damage + status + zoom
        const iLock = !!ptState[opp].itemLock;
        const tLock = !!ptState[opp].toolLock;
        const lkBase = 'border:none;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:all .15s;';
        const lkOn  = lkBase + 'background:#c0392b;color:#fff;box-shadow:0 0 8px rgba(231,76,60,0.7);';
        const lkOff = lkBase + 'background:#2c3e50;color:#aaa;';
        const lockBar = `<div style="display:flex;gap:8px;margin-bottom:14px;padding:10px;background:rgba(255,255,255,0.04);border-radius:8px;align-items:center;">
            <span style="font-size:11px;color:#aaa;margin-right:4px;">Locks:</span>
            <button onclick="ptToggleLock('${opp}','itemLock')" style="${iLock ? lkOn : lkOff}" title="Item-Lock: Gegner kann keine Items spielen">
                🚫 ${iLock ? '✅ Item-Lock AN' : 'Item-Lock'}
            </button>
            <button onclick="ptToggleLock('${opp}','toolLock')" style="${tLock ? lkOn : lkOff}" title="Tool-Lock: Gegner kann keine Tools spielen">
                🔧 ${tLock ? '✅ Tool-Lock AN' : 'Tool-Lock'}
            </button>
        </div>`;
        const zones = ['active', 'bench0', 'bench1', 'bench2', 'bench3', 'bench4'];
        let html = lockBar;
        zones.forEach(zoneId => {
            const cards = ptState[opp].field[zoneId];
            if (cards.length === 0) return;
            // Show highest evolution (last non-energy/non-tool card in stack)
            const topPokemon = [...cards].reverse().find(c => {
                const ct = (c.cardType || '').toLowerCase();
                return !ct.includes('energy') && !ct.includes('trainer') && ct !== 'tool';
            }) || cards[0];
            const card  = topPokemon;
            const dmg   = ptState[opp].damage[zoneId] || 0;
            const stat  = ptState[opp].status;
            const label = zoneId === 'active' ? '⭐ Active' : ('Bank ' + (parseInt(zoneId.slice(-1)) + 1));
            const safeImg = (card.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
            const isFocus = _ptOppFocusZone === zoneId;
            const sSel = t => stat.includes(t) ? 'background:#e74c3c;color:#fff;' : 'background:rgba(255,255,255,0.1);color:#fff;';
            const statusBtns = zoneId === 'active' ? `
                <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px;">
                    <button onclick="toggleStatus('${opp}','poisoned');ptRefreshOpponentField('${opp}')" style="${sSel('poisoned')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Vergiftet">☠️</button>
                    <button onclick="toggleStatus('${opp}','burned');ptRefreshOpponentField('${opp}')" style="${sSel('burned')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Verbrannt">🔥</button>
                    <button onclick="toggleStatus('${opp}','asleep');ptRefreshOpponentField('${opp}')" style="${sSel('asleep')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Schlaf">💤</button>
                    <button onclick="toggleStatus('${opp}','paralyzed');ptRefreshOpponentField('${opp}')" style="${sSel('paralyzed')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Paralyse">⚡</button>
                    <button onclick="toggleStatus('${opp}','confused');ptRefreshOpponentField('${opp}')" style="${sSel('confused')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Verwirrt">💫</button>
                </div>` : '';
            // Also show all attached cards (energy/tools)
            const attachedHTML = cards.slice(1).map(ac => {
                const ai = (ac.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
                return `<img src="${ai}" style="width:38px;border-radius:4px;cursor:pointer;" onerror="this.src='${CARD_BACK_URL}'" onclick="ptViewCard('${ai}','${_ptEscJs(ac.name)}')" title="${_ptEscHtml(ac.name)}">`;
            }).join(''); // legacy — superseded below
            // Energy & tool cards with ×-remove buttons
            const attachedWithIdx = cards
                .map((ac, idx) => ({ ac, idx }))
                .filter(({ ac }) => { const ct = (ac.cardType||'').toLowerCase(); return ct.includes('energy') || ct === 'tool' || (ct.includes('trainer') && ct !== 'supporter' && ct !== 'item' && ct !== 'stadium'); });
            const attachedRemovableHTML = attachedWithIdx.map(({ ac, idx }) => {
                const ai = (ac.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
                return `<div style="position:relative;display:inline-block;" title="${_ptEscHtml(ac.name)}">
                    <img src="${ai}" style="width:38px;border-radius:4px;cursor:pointer;" onerror="this.src='${CARD_BACK_URL}'" onclick="ptViewCard('${ai}','${_ptEscJs(ac.name)}')">
                    <button onclick="ptOppRemoveAttached('${opp}','${zoneId}',${idx})" style="position:absolute;top:-5px;right:-5px;width:15px;height:15px;border-radius:50%;background:#e74c3c;color:#fff;font-size:10px;line-height:15px;text-align:center;border:none;cursor:pointer;padding:0;z-index:10;" title="Entfernen">×</button>
                </div>`;
            }).join('');
            html += `<div style="background:${isFocus ? 'rgba(231,76,60,0.18)' : 'rgba(255,255,255,0.05)'};border:${isFocus ? '2px solid #e74c3c' : '1px solid rgba(255,255,255,0.08)'};border-radius:10px;padding:12px;margin-bottom:10px;">
                <div style="font-weight:700;font-size:11px;color:#FFCB05;margin-bottom:8px;">${label}</div>
                <div style="display:flex;gap:10px;align-items:flex-start;">
                    <img src="${safeImg}" style="width:80px;border-radius:7px;cursor:pointer;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.5);"
                         onerror="this.src='${CARD_BACK_URL}'" onclick="ptViewCard('${safeImg}','${_ptEscJs(card.name)}')" title="Klick zum Vergrößern">
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:12px;margin-bottom:4px;">${_ptEscHtml(card.name)}</div>
                        <div style="font-size:16px;font-weight:900;color:#ff6b6b;margin-bottom:6px;">💥 ${dmg} Schaden</div>
                        ${statusBtns}
                        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;">
                            <button onclick="addDamage('${opp}','${zoneId}',10);ptRefreshOpponentField('${opp}')"  style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">+10</button>
                            <button onclick="addDamage('${opp}','${zoneId}',20);ptRefreshOpponentField('${opp}')"  style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">+20</button>
                            <button onclick="addDamage('${opp}','${zoneId}',30);ptRefreshOpponentField('${opp}')"  style="background:#e67e22;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">+30</button>
                            <button onclick="addDamage('${opp}','${zoneId}',50);ptRefreshOpponentField('${opp}')"  style="background:#c0392b;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:12px;font-weight:700;cursor:pointer;">+50</button>
                            <button onclick="addDamage('${opp}','${zoneId}',100);ptRefreshOpponentField('${opp}')" style="background:#922b21;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:12px;font-weight:700;cursor:pointer;">+100</button>
                            <button onclick="addDamage('${opp}','${zoneId}',-10);ptRefreshOpponentField('${opp}')" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">-10</button>
                            <button onclick="clearDamage('${opp}','${zoneId}');ptRefreshOpponentField('${opp}')"   style="background:#1a9e5b;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">💚 Heal</button>
                        </div>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.08);">
                            <button onclick="ptOppKnockOutZone('${opp}','${zoneId}')" style="background:#922b21;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:700;cursor:pointer;" title="Pokémon K.O. setzen und Prize triggern">☠️ K.O.</button>
                            <button onclick="ptOppDiscardZone('${opp}','${zoneId}')" style="background:#7d3c98;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:11px;cursor:pointer;" title="Zone ohne Prize in den Discard legen">🗑️ Discard</button>
                            ${zoneId !== 'active' ? `<button onclick="ptOppSetActive('${opp}','${zoneId}')" style="background:#1a5276;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:11px;cursor:pointer;" title="Als Active setzen">⭐ Active setzen</button>` : ''}
                        </div>
                        ${attachedRemovableHTML ? `<div style="display:flex;gap:4px;flex-wrap:wrap;align-items:center;margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.06);"><span style="font-size:9px;color:#aaa;margin-right:2px;">⚡🔧</span>${attachedRemovableHTML}</div>` : ''}
                    </div>
                </div>
            </div>`;
        });
        if (!html) html = '<div style="color:#aaa;text-align:center;padding:20px;">Keine Pokémon im Spiel.</div>';
        el.innerHTML = html;

    } else if (tab === 'discard') {
        // ─ Discard pile (view-only, click to zoom)
        const discard = ptState[opp].discard;
        if (discard.length === 0) { el.innerHTML = '<div style="color:#aaa;text-align:center;padding:30px;">🗑️ Ablagestapel ist leer.</div>'; return; }
        el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">` +
            discard.map((c, i) => {
                const si = (c.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
                return `<div style="position:relative;cursor:pointer;" title="${_ptEscHtml(c.name)}" onclick="ptViewCard('${si}','${_ptEscJs(c.name)}')">
                    <img src="${c.imageUrl || CARD_BACK_URL}" style="width:80px;border-radius:6px;display:block;" onerror="this.src='${CARD_BACK_URL}'">
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;font-size:8px;padding:2px 3px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(c.name)}</div>
                </div>`;
            }).join('') + '</div>';

    } else if (tab === 'lostzone') {
        // ─ Lost zone (view-only, click to zoom)
        const lz = ptState[opp].lostzone || [];
        if (lz.length === 0) { el.innerHTML = '<div style="color:#aaa;text-align:center;padding:30px;">🌌 Lost Zone ist leer.</div>'; return; }
        el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">` +
            lz.map((c, i) => {
                const si = (c.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
                return `<div style="position:relative;cursor:pointer;" title="${_ptEscHtml(c.name)}" onclick="ptViewCard('${si}','${_ptEscJs(c.name)}')">
                    <img src="${c.imageUrl || CARD_BACK_URL}" style="width:80px;border-radius:6px;display:block;filter:grayscale(0.5);" onerror="this.src='${CARD_BACK_URL}'">
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(80,0,80,0.8);color:#fff;font-size:8px;padding:2px 3px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(c.name)}</div>
                </div>`;
            }).join('') + '</div>';
    }
}

function ptRefreshOpponentField(opp) {
    ptRenderOpponentPanel(opp, 'field', _ptOppLastContainer || 'ptOppPanelContent');
}

// --- DISCARD / LOST ZONE MODALS ---

function _ptDiscardCardSortOrder(card) {
    const t = (card.cardType || card.supertype || '').toLowerCase();
    if (t === 'supporter')                              return 1;
    if (t === 'item')                                   return 2;
    if (t === 'tool')                                   return 3;
    if (t === 'stadium')                                return 4;
    if (t === 'special energy')                         return 5;
    if (t === 'basic energy' || t.includes('energy'))   return 6;
    return 0;
}

function _ptGetSortedDiscard(player) {
    const cards = ptState[player].discard;
    if (_ptDiscardSort === 'order') return cards.map((c, i) => ({ card: c, origIdx: i }));
    return [...cards]
        .map((c, i) => ({ card: c, origIdx: i }))
        .sort((a, b) => {
            const diff = _ptDiscardCardSortOrder(a.card) - _ptDiscardCardSortOrder(b.card);
            return diff !== 0 ? diff : (a.card.name || '').localeCompare(b.card.name || '');
        });
}

function ptSetDiscardSort(sort) {
    _ptDiscardSort = sort;
    const player = document.getElementById('ptDiscardModal')._ptPlayer;
    if (player) _ptRefreshDiscardGrid(player);
    const btnOrder = document.getElementById('ptDscSortOrder');
    const btnType  = document.getElementById('ptDscSortType');
    const on  = 'background:#2a52be;color:#fff;border-color:#3B4CCA;';
    const off = 'background:#333;color:#ccc;border-color:#555;';
    if (btnOrder) btnOrder.style.cssText += sort === 'order' ? on : off;
    if (btnType)  btnType.style.cssText  += sort === 'type'  ? on : off;
}

function _ptRefreshDiscardGrid(player) {
    const grid = document.getElementById('ptDiscardGrid');
    if (!grid) return;
    const sorted = _ptGetSortedDiscard(player);
    const groupLabels = ['🐾 Pokémon','🧑‍⚕️ Supporter','🧰 Item','🔧 Tool','🏟️ Stadion','✨ Special Energy','⚡ Basic Energy'];
    let lastGroup = -1;
    let html = '';
    sorted.forEach(({ card: c, origIdx: i }) => {
        const safeImg = (c.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        if (_ptDiscardSort === 'type') {
            const g = _ptDiscardCardSortOrder(c);
            if (g !== lastGroup) {
                lastGroup = g;
                html += `<div style="width:100%;font-size:10px;font-weight:900;color:#FFCB05;padding:4px 0 2px 2px;">${groupLabels[g] || '🃏 Andere'}</div>`;
            }
        }
        html += `<div style="position:relative;cursor:pointer;" title="${_ptEscHtml(c.name)}">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='${CARD_BACK_URL}'"
                 onclick="ptRouteFromDiscard('${player}',${i},'hand')"
                 ondblclick="ptViewCard(event,'${safeImg}')"
                 oncontextmenu="event.preventDefault();ptRouteFromDiscard('${player}',${i},'lost')">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(c.name)}</div>
        </div>`;
    });
    grid.innerHTML = html;
}

function ptOpenDiscard(player) {
    const title = document.getElementById('ptDiscardModalTitle');
    if (title) title.textContent = `🗑️ Discard (${player.toUpperCase()}) – Klick=Hand | Rechtsklick=Lost Zone`;
    if (!ptState[player] || ptState[player].discard.length === 0) { ptShowMessage('Discard pile is empty.'); return; }
    // Inject sort toolbar
    const sortBar = document.getElementById('ptDiscardSortBar');
    if (sortBar) {
        sortBar.style.display = 'flex';
        const on  = ';background:#2a52be;color:#fff;border-color:#3B4CCA;';
        const off = ';background:#333;color:#ccc;border-color:#555;';
        const btnOrder = document.getElementById('ptDscSortOrder');
        const btnType  = document.getElementById('ptDscSortType');
        if (btnOrder) btnOrder.setAttribute('style', 'border:1px solid;border-radius:5px;padding:3px 9px;font-size:11px;cursor:pointer;' + (_ptDiscardSort === 'order' ? on : off));
        if (btnType)  btnType.setAttribute('style',  'border:1px solid;border-radius:5px;padding:3px 9px;font-size:11px;cursor:pointer;' + (_ptDiscardSort === 'type'  ? on : off));
    }
    const modal = document.getElementById('ptDiscardModal');
    modal._ptPlayer = player;
    _ptRefreshDiscardGrid(player);
    modal.style.display = 'flex';
}

function ptOpenLostZone(player) {
    const lz = ptState[player].lostzone || [];
    if (lz.length === 0) { ptShowMessage('Lost Zone is empty.'); return; }
    const title = document.getElementById('ptDiscardModalTitle');
    if (title) title.textContent = `🌌 Lost Zone (${player.toUpperCase()}) – Click = Return to hand`;
    const sortBar = document.getElementById('ptDiscardSortBar');
    if (sortBar) sortBar.style.display = 'none';
    const grid = document.getElementById('ptDiscardGrid');
    if (!grid) return;
    grid.innerHTML = lz.map((c, i) => {
        const safeImg  = (c.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<div style="position:relative;cursor:pointer;" title="${_ptEscHtml(c.name)}">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:6px;display:block;filter:grayscale(0.6);"
                 onerror="this.src='${CARD_BACK_URL}'"
                 onclick="ptTakeFromLostZone('${player}',${i})"
                 ondblclick="ptViewCard(event,'${safeImg}')">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(80,0,80,0.8);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(c.name)}</div>
        </div>`;
    }).join('');
    document.getElementById('ptDiscardModal').style.display = 'flex';
}

// --- OPP PANEL ACTIONS ---

function ptOppDiscardZone(opp, zoneId) {
    const cards = ptState[opp].field[zoneId];
    if (!cards || cards.length === 0) return;
    const count = cards.length;
    while (cards.length > 0) {
        ptState[opp].discard.push(cards.shift());
    }
    ptState[opp].damage[zoneId] = 0;
    if (zoneId === 'active') ptState[opp].status = [];
    ptLog(`🗑️ ${zoneId} (${opp}) → Discard (${count} Karten).`);
    ptRenderAll();
    ptRefreshOpponentField(opp);
}

function ptOppSetActive(opp, zoneId) {
    if (zoneId === 'active') return;
    const activeCards = ptState[opp].field.active;
    const benchCards  = ptState[opp].field[zoneId];
    if (benchCards.length === 0) return;
    // Swap: active ↔ bench
    ptState[opp].field.active = benchCards;
    ptState[opp].field[zoneId] = activeCards;
    const dmgActive = ptState[opp].damage.active || 0;
    const dmgBench  = ptState[opp].damage[zoneId] || 0;
    ptState[opp].damage.active  = dmgBench;
    ptState[opp].damage[zoneId] = dmgActive;
    ptLog(`🔄 ${opp}: ${zoneId} wird neues Active-Pokémon.`);
    ptRenderAll();
    ptRenderOpponentPanel(opp, 'field');
}

function ptOppRemoveAttached(opp, zoneId, cardIndex) {
    const cards = ptState[opp].field[zoneId];
    if (!cards || cardIndex < 0 || cardIndex >= cards.length) return;
    const removed = cards.splice(cardIndex, 1)[0];
    ptState[opp].discard.push(removed);
    ptLog(`🗑️ ${removed.name} von ${opp.toUpperCase()} ${zoneId} entfernt → Discard.`);
    ptRenderAll();
    ptRefreshOpponentField(opp);
}

function ptRouteFromDiscard(player, index, destination) {
    const c = ptState[player].discard.splice(index, 1)[0];
    if (destination === 'hand') {
        ptState[ptCurrentPlayer].hand.push(c);
        ptLog(`Returned "${c.name}" from discard to hand.`);
    } else {
        ptState[ptCurrentPlayer].lostzone.push(c);
        ptLog(`Sent "${c.name}" from discard to Lost Zone.`);
    }
    ptCloseDiscardModal();
    ptRenderAll();
}

function ptTakeFromLostZone(player, index) {
    const c = ptState[player].lostzone.splice(index, 1)[0];
    ptState[ptCurrentPlayer].hand.push(c);
    ptCloseDiscardModal();
    ptLog(`Retrieved "${c.name}" from Lost Zone to hand.`);
    ptRenderAll();
}

function ptCloseDiscardModal() {
    const m = document.getElementById('ptDiscardModal');
    if (m) m.style.display = 'none';
}

// --- MESSAGES ---

function ptShowMessage(msg) {
    const el = document.getElementById('ptMessage');
    if (!el) return;
    el.textContent = msg;
    clearTimeout(_ptMsgTimer);
    _ptMsgTimer = setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}

// --- RENDER ---

function ptRenderAll() {
    ['p1', 'p2'].forEach(p => {
        const deckEl = document.getElementById(`ptDeckCount-${p}`);
        if (deckEl) deckEl.innerText = ptState[p].deck.length;
        const discEl = document.getElementById(`ptDiscardCount-${p}`);
        if (discEl) discEl.innerText = ptState[p].discard.length;
        const lostEl = document.getElementById(`ptLostCount-${p}`);
        if (lostEl) lostEl.innerText = (ptState[p].lostzone || []).length;

        if (p === ptCurrentPlayer) {
            const vBtn = document.getElementById('ptVstarMarker');
            const gBtn = document.getElementById('ptGxMarker');
            if (vBtn) vBtn.classList.toggle('used', !!ptState[p].vstarUsed);
            if (gBtn) gBtn.classList.toggle('used', !!ptState[p].gxUsed);
        }
        // Sync Item/Tool-Lock button visual state
        const iLockBtn = document.getElementById(`ptItemLock-${p}`);
        if (iLockBtn) iLockBtn.classList.toggle('active', !!ptState[p].itemLock);
        const tLockBtn = document.getElementById(`ptToolLock-${p}`);
        if (tLockBtn) tLockBtn.classList.toggle('active', !!ptState[p].toolLock);

        const pileEl = document.getElementById(`ptDiscardPile-${p}`);
        if (pileEl) {
            const isOpp = p !== ptCurrentPlayer;
            const discardClick = isOpp ? `ptOpenOpponentPanel('discard');event.stopPropagation()` : `ptOpenDiscard('${p}');event.stopPropagation()`;
            if (ptState[p].discard.length > 0) {
                const top = ptState[p].discard[ptState[p].discard.length - 1];
                pileEl.innerHTML = `<img src="${top.imageUrl || CARD_BACK_URL}" class="pt-field-card"
                    style="cursor:pointer;" onerror="this.src='${CARD_BACK_URL}'"
                    onclick="${discardClick}" title="Discard – ${ptState[p].discard.length} Karten (klicken zum Öffnen)">`;
            } else {
                pileEl.innerHTML = `<div class="pt-empty-slot" style="font-size:10px;cursor:pointer;"
                    onclick="${discardClick}">Discard</div>`;
            }
        }

        const lostPileEl = document.getElementById(`ptLostPile-${p}`);
        if (lostPileEl) {
            const isOpp = p !== ptCurrentPlayer;
            const lostClick = isOpp ? `ptOpenOpponentPanel('lostzone');event.stopPropagation()` : `ptOpenLostZone('${p}');event.stopPropagation()`;
            if (ptState[p].lostzone.length > 0) {
                const top = ptState[p].lostzone[ptState[p].lostzone.length - 1];
                lostPileEl.innerHTML = `<img src="${top.imageUrl || CARD_BACK_URL}" class="pt-field-card"
                    style="width:40px;cursor:pointer;filter:grayscale(0.6);"
                    onerror="this.src='${CARD_BACK_URL}'"
                    onclick="${lostClick}" title="Lost Zone – ${ptState[p].lostzone.length} Karten (klicken zum Öffnen)">`;
            } else {
                lostPileEl.innerHTML = `<div class="pt-empty-slot" style="font-size:16px;cursor:pointer;" onclick="${lostClick}">🌀</div>`;
            }
        }

        const prizeEl = document.getElementById(`ptPrizeZone-${p}`);
        if (prizeEl) {
            prizeEl.innerHTML = ptState[p].prizes.map((c, i) =>
                `<img src="${CARD_BACK_URL}" class="pt-prize-card"
                      title="Take prize card" onclick="ptTakePrize('${p}', ${i})">`
            ).join('');
        }

        const activeEl = document.getElementById(`ptActiveZone-${p}`);
        if (activeEl) activeEl.innerHTML = generateZoneHTML(p, 'active', 'Active', `ptActiveZone-${p}`);
        for (let i = 0; i < 5; i++) {
            const benchEl = document.getElementById(`ptBench${i}-${p}`);
            if (benchEl) benchEl.innerHTML = generateZoneHTML(p, `bench${i}`, `Bench ${i + 1}`, `ptBench${i}-${p}`);
        }
    });

    const stadiumEl = document.getElementById('ptStadiumZone');
    if (stadiumEl) stadiumEl.innerHTML = generateNeutralZone('stadium', 'Stadium');
    const playEl = document.getElementById('ptPlayZone');
    if (playEl) playEl.innerHTML = generateNeutralZone('playzone', 'Drop', 136);

    ptRenderHand();

    // Board perspective: in MP, P2 sees their own board at the bottom
    if (ptState.isMultiplayer && ptState.localRole) {
        const p1Area = document.getElementById('p1-area');
        const p2Area = document.getElementById('p2-area');
        if (p1Area && p2Area) {
            const p2Inner = p2Area.querySelector('div'); // The child div with rotate(180deg)
            if (ptState.localRole === 'p2') {
                // P2 perspective: P2 area normal (bottom), P1 area rotated (top)
                if (p2Inner) p2Inner.style.transform = 'rotate(0deg)';
                p1Area.style.transform = 'rotate(180deg)';
            } else {
                // P1 perspective (default): P1 normal, P2 rotated
                if (p2Inner) p2Inner.style.transform = 'rotate(180deg)';
                p1Area.style.transform = '';
            }
        }
    }
}

function ptRenderHand() {
    const zone = document.getElementById('ptHandZone');
    const cnt  = document.getElementById('ptHandCount');
    if (!zone) return;
    const handCount = ptState[ptCurrentPlayer].hand.length;
    if (cnt) cnt.innerText = handCount;
    zone.dataset.handCount = String(handCount);
    zone.dataset.activePlayer = (ptCurrentPlayer === 'p1') ? '1' : '2';
    zone.innerHTML = '';

    // In MP mode, check if we're rendering our own hand or the opponent's
    const isMP = ptState.isMultiplayer;
    const localRole = ptState.localRole;
    const isOpponentHand = isMP && ptCurrentPlayer !== localRole;

    ptState[ptCurrentPlayer].hand.forEach((card, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'pt-hand-wrapper';

        if (isOpponentHand) {
            // Opponent hand in MP → show card backs, no interaction
            const img = document.createElement('img');
            img.src = CARD_BACK_URL;
            img.className = 'pt-hand-card';
            img.title = 'Verdeckte Karte';
            img.draggable = false;
            img.style.opacity = '0.7';
            wrapper.appendChild(img);
            zone.appendChild(wrapper);
            return;
        }

        wrapper.draggable = true;
        wrapper.ondragstart = e => ptDragStartHand(e, i);
        // Mobile: tap to expand overlapping card and optionally start touch-drag.
        wrapper.addEventListener('touchstart', function(e) {
            zone.querySelectorAll('.pt-hand-expanded').forEach(el => el.classList.remove('pt-hand-expanded'));
            this.classList.add('pt-hand-expanded');
            if (typeof ptMobileHandTouchStart === 'function') ptMobileHandTouchStart(e, i, this);
        }, { passive: false });
        wrapper.addEventListener('touchmove', function(e) {
            if (typeof ptMobileHandTouchMove === 'function') ptMobileHandTouchMove(e);
        }, { passive: false });
        wrapper.addEventListener('touchend', function(e) {
            if (typeof ptMobileHandTouchEnd === 'function') ptMobileHandTouchEnd(e);
        }, { passive: false });
        wrapper.addEventListener('touchcancel', function(e) {
            if (typeof ptMobileHandTouchEnd === 'function') ptMobileHandTouchEnd(e);
        }, { passive: false });

        const img = document.createElement('img');
        img.src       = card.imageUrl || CARD_BACK_URL;
        img.alt       = card.name || 'Card';
        img.className = 'pt-hand-card' + (i === ptSelectedCardIndex ? ' pt-card-selected' : '');
        img.title     = card.name;
        img.draggable = false; // prevent native img drag — wrapper handles drag
        img.onerror   = function() { this.src = CARD_BACK_URL; };
        img.onclick   = () => {
            ptSelectHandCard(i);
            if (typeof ptMobileCardTap === 'function') {
                ptMobileCardTap(ptCurrentPlayer, 'hand', i);
            }
        };
        img.ondblclick = () => ptViewCard(card.imageUrl, card.name);

        wrapper.appendChild(img);
        const isMobileViewport = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
        if (!isMobileViewport) {
            // Play button (trainers: Supporter, Item, Tool, Stadium)
            const ct = (card.cardType || '').toLowerCase();
            const isTrainer = ct === 'supporter' || ct === 'item' || ct === 'tool' || ct === 'stadium'
                || ct.includes('trainer') || ct.includes('supporter') || ct.includes('item');
            if (isTrainer) {
                const playBtn = document.createElement('button');
                playBtn.className = 'pt-hand-play-btn';
                playBtn.innerHTML = '▶';
                playBtn.title     = 'Play Card';
                playBtn.onclick   = e => ptPlayFromHand(i, e);
                wrapper.appendChild(playBtn);
            }
            const discBtn = document.createElement('button');
            discBtn.className = 'pt-hand-disc-btn';
            discBtn.innerHTML = '🗑️';
            discBtn.title     = 'Discard';
            discBtn.onclick   = e => ptDiscardFromHand(i, e);
            wrapper.appendChild(discBtn);
        }
        zone.appendChild(wrapper);
    });

    ptBindHandScroller();
    ptUpdateHandScrollButtons();
}

function ptUpdateHandScrollButtons() {
    const zone = document.getElementById('ptHandZone');
    const leftBtn = document.getElementById('ptHandScrollLeft');
    const rightBtn = document.getElementById('ptHandScrollRight');
    if (!zone || !leftBtn || !rightBtn) return;

    const maxScroll = Math.max(0, zone.scrollWidth - zone.clientWidth);
    const canScroll = maxScroll > 4;
    leftBtn.style.visibility = canScroll ? 'visible' : 'hidden';
    rightBtn.style.visibility = canScroll ? 'visible' : 'hidden';
    leftBtn.disabled = !canScroll || zone.scrollLeft <= 4;
    rightBtn.disabled = !canScroll || zone.scrollLeft >= maxScroll - 4;
}

function ptBindHandScroller() {
    const zone = document.getElementById('ptHandZone');
    if (!zone) return;

    if (zone.dataset.scrollBound !== '1') {
        zone.dataset.scrollBound = '1';
        zone.addEventListener('scroll', ptUpdateHandScrollButtons, { passive: true });
        zone.addEventListener('wheel', function(event) {
            if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
            if (zone.scrollWidth <= zone.clientWidth + 4) return;
            event.preventDefault();
            zone.scrollLeft += event.deltaY;
        }, { passive: false });
        window.addEventListener('resize', ptUpdateHandScrollButtons);
    }

    ptUpdateHandScrollButtons();
}

function ptScrollHand(direction) {
    const zone = document.getElementById('ptHandZone');
    if (!zone) return;
    const firstCard = zone.querySelector('.pt-hand-wrapper');
    const step = firstCard ? Math.max(90, firstCard.getBoundingClientRect().width * 2.4) : 180;
    zone.scrollBy({ left: direction * step, behavior: 'smooth' });
    setTimeout(ptUpdateHandScrollButtons, 220);
}
window.ptScrollHand = ptScrollHand;

function ptSelectHandCard(index) {
    // Block opponent card selection in MP
    if (ptState.isMultiplayer && ptCurrentPlayer !== ptState.localRole) return;
    ptSelectedCardIndex = (ptSelectedCardIndex === index) ? null : index;
    ptUpdateAttachModeFromSelection(ptCurrentPlayer);
    ptRenderHand();
}

function ptDiscardFromHand(index, event) {
    if (event) event.stopPropagation();
    // Block opponent actions in MP
    if (ptState.isMultiplayer && ptCurrentPlayer !== ptState.localRole) return;
    const card = ptState[ptCurrentPlayer].hand.splice(index, 1)[0];
    ptState[ptCurrentPlayer].discard.push(card);
    ptSelectedCardIndex = null;
    ptSetAttachMode(false);
    ptLog(`Discarded "${card.name}" from hand.`);
    ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && ptState.isMultiplayer) syncStateToFirebase('Discarded ' + card.name);
}

function ptPlayFromHand(index, event) {
    if (event) event.stopPropagation();
    if (ptState.isMultiplayer && ptCurrentPlayer !== ptState.localRole) return;
    const player = ptCurrentPlayer;
    const card = ptState[player].hand[index];
    if (!card) return;
    ptSaveState();
    // Determine target zone: stadium cards go to stadium, rest to playzone
    const ct = (card.cardType || '').toLowerCase();
    ptState[player].hand.splice(index, 1);
    if (ct === 'stadium') {
        if (ptState.stadium.length > 0) {
            const stadiumOwner = ptState.stadiumPlayedBy || player;
            ptState[stadiumOwner].discard.push(ptState.stadium.pop());
        }
        ptState.stadium.push(card);
        ptState.stadiumPlayedBy = player;
        ptLog(`Played Stadium: "${card.name}".`);
    } else {
        ptState.playZone.push(card);
        ptLog(`Played: "${card.name}".`);
    }
    ptSelectedCardIndex = null;
    ptSetAttachMode(false);
    ptRenderAll();
    // Check trainer registry for automated effects
    const _tKey = _ptGetAbilityKey(card);
    const _tFn = _tKey && PT_TRAINER_REGISTRY[_tKey];
    if (_tFn) {
        setTimeout(() => _tFn(player, card), 50);
    } else if (ct !== 'stadium') {
        // No registered effect → move from playzone to discard
        const pzIdx = ptState.playZone.indexOf(card);
        if (pzIdx >= 0) ptState.playZone.splice(pzIdx, 1);
        ptState[player].discard.push(card);
        ptRenderAll();
    }
    if (typeof syncStateToFirebase === 'function' && ptState.isMultiplayer) syncStateToFirebase('Played ' + card.name);
}

function ptTakePrize(player, index) {
    // Open the prize picker modal for a proper face-down selection
    ptOpenPrizePicker(player, 1);
}

function ptGetPrizeCountForKnockout(card) {
    const name = (card?.name || '').toLowerCase();
    const type = (card?.cardType || card?.supertype || '').toLowerCase();
    const haystack = `${name} ${type}`;
    if (haystack.includes('tag team')) return 3;
    if (haystack.includes('vmax') || haystack.includes('v-star') || haystack.includes('vstar')) return 3;
    if (/\bex\b/.test(haystack) || /\bv\b/.test(haystack) || /\bgx\b/.test(haystack)) return 2;
    return 1;
}

function ptOpenPrizePicker(player, remainingPicks = 1, taker = ptCurrentPlayer) {
    const prizes = ptState[player].prizes;
    if (!prizes || prizes.length === 0) { ptShowMessage('Keine Preiskarten mehr!'); return; }
    remainingPicks = Math.max(1, Math.min(remainingPicks, prizes.length));
    let html = `<div style="background:#1a1a2e;border:2px solid #FFCB05;border-radius:14px;padding:20px;text-align:center;color:#fff;max-width:440px;">
        <h3 style="color:#FFCB05;margin-top:0;">🏆 Preiskarte nehmen</h3>
        <p style="color:#ccc;font-size:12px;margin-bottom:16px;">Wähle ${remainingPicks} Preiskarte${remainingPicks === 1 ? '' : 'n'} (${prizes.length} verbleiben)</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-bottom:18px;">`;
    prizes.forEach((_, i) => {
        html += `<div style="cursor:pointer;transition:transform .15s;" onclick="ptPickPrizeCard('${player}',${i})"
                      onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${CARD_BACK_URL}" style="width:72px;border-radius:8px;border:2px solid #FFCB05;box-shadow:0 0 10px rgba(255,203,5,0.4);" title="Preiskarte ${i+1} nehmen">
        </div>`;
    });
    html += `</div>
        <button onclick="document.getElementById('ptPrizePickerModal').style.display='none'"
                style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid #555;border-radius:6px;padding:6px 18px;cursor:pointer;font-size:12px;">✕ Schließen</button>
    </div>`;
    let modal = document.getElementById('ptPrizePickerModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ptPrizePickerModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:99999;';
        document.body.appendChild(modal);
    }
    modal.dataset.player = player;
    modal.dataset.taker = taker;
    modal.dataset.remainingPicks = String(remainingPicks);
    modal.innerHTML = html;
    modal.style.display = 'flex';
}

function ptPickPrizeCard(player, index) {
    const card = ptState[player].prizes.splice(index, 1)[0];
    if (!card) return;
    const modal = document.getElementById('ptPrizePickerModal');
    const taker = modal?.dataset.taker || ptCurrentPlayer;
    ptState[taker].hand.push(card);
    const remainingPicks = Math.max(0, (parseInt(modal?.dataset.remainingPicks || '1', 10) || 1) - 1);
    ptLog(`🏆 ${taker.toUpperCase()} nimmt eine Preiskarte: "${card.name}". Noch ${ptState[player].prizes.length} übrig.`);
    if (modal) {
        if (remainingPicks > 0 && ptState[player].prizes.length > 0) {
            ptOpenPrizePicker(player, remainingPicks, taker);
        } else {
            modal.style.display = 'none';
        }
    }
    ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && ptState.isMultiplayer) syncStateToFirebase('Took prize: ' + card.name);
}

// --- NEUTRAL ZONE RENDER ---

function generateNeutralZone(zoneId, labelText, width = 82) {
    const height = Math.round(width * 1.38);
    const cards = zoneId === 'stadium' ? ptState.stadium : ptState.playZone;
    if (cards.length === 0) {
        const isTarget = ptSelectedCardIndex !== null;
        return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                     style="width:${width}px;height:${height}px;"
                     onclick="ptClickZone('${ptCurrentPlayer}','${zoneId}')">${labelText}</div>`;
    }
    const card = cards[cards.length - 1];
    const safeImg  = (card.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeName = (card.name || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div style="position:relative;width:${width}px;cursor:pointer;"
                 onclick="ptClickZone('${ptCurrentPlayer}','${zoneId}')">
        <img src="${card.imageUrl || CARD_BACK_URL}" class="pt-field-card"
             style="width:${width}px;border-radius:7px;display:block;"
             onerror="this.src='${CARD_BACK_URL}'"
             ondblclick="ptViewCard(event,'${safeImg}')"
             oncontextmenu="event.preventDefault();event.stopPropagation();ptZoomViewCard('${safeImg}','${safeName}')"
             title="${_ptEscHtml(card.name)} (right-click to zoom)">
        ${zoneId === 'stadium' && ptState.stadiumPlayedBy ? `<div style="position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:${ptState.stadiumPlayedBy==='p1'?'#3B4CCA':'#E3350D'};color:#fff;font-size:9px;font-weight:900;padding:2px 7px;border-radius:4px;white-space:nowrap;z-index:50;">${ptState.stadiumPlayedBy==='p1'?'🔵 P1':'🔴 P2'}</div>` : ''}
        <div class="pt-field-actions" style="z-index:100;bottom:-28px;">
            <button class="pt-action-btn" onclick="returnToHand('${ptCurrentPlayer}','${zoneId}',event)">⬆️</button>
            <button class="pt-action-btn" onclick="moveToLostZone('${ptCurrentPlayer}','${zoneId}',event)">🌌</button>
            <button class="pt-action-btn red" onclick="discardTopCard('${ptCurrentPlayer}','${zoneId}',event)">🗑️</button>
        </div>
    </div>`;
}

// --- FIELD ZONE RENDER ---

function generateZoneHTML(player, zoneId, labelText, elementId) {
    const cards  = ptState[player].field[zoneId];
    const width  = zoneId === 'active' ? 102 : 82;
    const height = Math.round(width * 1.38);

    if (cards.length === 0) {
        const isTarget = ptSelectedCardIndex !== null;
        return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                     style="width:${width}px;height:${height}px;"
                     onclick="ptClickZone('${player}','${zoneId}'); if(typeof ptMobileCardTap==='function') ptMobileCardTap('${player}','${zoneId}',0);">${labelText}</div>`;
    }

    let html = `<div style="position:relative;width:${width}px;cursor:pointer;min-height:${height}px;"
                     onclick="ptClickZone('${player}','${zoneId}'); if(typeof ptMobileCardTap==='function') ptMobileCardTap('${player}','${zoneId}',0);"
                     onmouseenter="ptOpenCardMenu(event,'${player}','${zoneId}')"
                     onmouseleave="ptScheduleMenuClose()"
                     ontouchstart="if(typeof ptFieldTouchStart==='function') ptFieldTouchStart(event,'${player}','${zoneId}')"
                     ontouchend="if(typeof ptFieldTouchEnd==='function') ptFieldTouchEnd()"
                     ontouchmove="if(typeof ptFieldTouchMove==='function') ptFieldTouchMove()"
                     draggable="true" ondragstart="ptDragStartField(event,'${elementId}')">` ;

    let energyCards  = [];
    let toolCards    = [];
    let pokemonCards = [];

    // Sort cards into categories
    cards.forEach(card => {
        const ct = (card.cardType || card.supertype || '').toLowerCase();
        if (ct.includes('energy')) {
            energyCards.push(card);
        } else if (ct.includes('trainer') || ct === 'tool') {
            toolCards.push(card);
        } else {
            pokemonCards.push(card);
        }
    });

    // 1. Render Pokémon — evolutions stacked exactly on top of each other
    const abilityMarkerId = `ptAbility_${elementId}`;
    pokemonCards.forEach((card, index) => {
        const safeImg = (card.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        html += `<img src="${card.imageUrl || CARD_BACK_URL}" class="pt-field-card"
                      style="position:absolute;top:0;left:0;z-index:${10 + index};width:${width}px;border-radius:7px;display:block;"
                      onerror="this.src='${CARD_BACK_URL}'"
                      ondblclick="ptViewCard(event,'${safeImg}')"
                      title="${_ptEscHtml(card.name)} (Doppelklick = Zoom)">`;
        // Ability marker only on the top-most (last) Pokémon
        if (index === pokemonCards.length - 1) {
            const isUsed = !!(ptState[player].abilityUsed && ptState[player].abilityUsed[zoneId]);
            html += `<div id="${abilityMarkerId}" class="pt-ability-marker${isUsed ? ' used' : ''}" title="Ability benutzt (bis Ende des Zuges)"
                          style="z-index:${11 + index};position:absolute;bottom:-6px;right:-6px;"
                          onclick="ptToggleAbilityUsed('${player}','${zoneId}',event);">A</div>`;
        }
    });

    // 2. Render Tools — stacked at left edge
    toolCards.forEach((card, index) => {
        const safeImg = (card.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const zoomCtx = `event.preventDefault();event.stopPropagation();ptZoomViewCard('${safeImg}','${card.name.replace(/'/g, "\\'")}')`;
        html += `<img src="${card.imageUrl || CARD_BACK_URL}" class="pt-attachment-tool"
                      style="position:absolute;left:-12px;bottom:${30 + index * 10}px;z-index:20;width:22px;height:28px;border-radius:4px;border:2px solid #fff;object-fit:cover;object-position:center 10%;"
                      onerror="this.src='${CARD_BACK_URL}'"
                      ondblclick="ptViewCard(event,'${safeImg}')"
                      oncontextmenu="${zoomCtx}"
                      title="${_ptEscHtml(card.name)} (right-click to zoom)">`;
    });

    // 3. Render Energies — horizontal fan near bottom of the Pokémon card (inside)
    if (energyCards.length > 0) {
        html += `<div style="position:absolute;bottom:14px;left:0;width:100%;display:flex;justify-content:center;gap:2px;z-index:30;">`;
        energyCards.forEach(card => {
            const safeImg = (card.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            const zoomCtx = `event.preventDefault();event.stopPropagation();ptZoomViewCard('${safeImg}','${card.name.replace(/'/g, "\\'")}')`;
            html += `<img src="${card.imageUrl || CARD_BACK_URL}" class="pt-attachment-energy"
                          style="position:relative;left:auto;width:20px;height:20px;border-radius:50%;border:2px solid #fff;object-fit:cover;object-position:center 25%;"
                          onerror="this.src='${CARD_BACK_URL}'"
                          ondblclick="ptViewCard(event,'${safeImg}')"
                          oncontextmenu="${zoomCtx}"
                          title="${_ptEscHtml(card.name)} (right-click to zoom)">`;
        });
        html += `</div>`;
    }

    // Status icon display for active zone
    if (zoneId === 'active') {
        const stat = ptState[player].status;
        if (stat.length > 0) {
            html += `<div style="position:absolute;bottom:-10px;right:5px;
                background:rgba(0,0,0,0.8);color:#fff;padding:2px 5px;
                border-radius:4px;font-size:11px;z-index:99;">${stat.join(' ')}</div>`;
        }
    }

    // Damage badge — centered at top (no slider/swipe controls)
    const dmg = ptState[player].damage[zoneId];
    if (dmg > 0) {
        html += `<div class="pt-damage-badge" style="left:50%;right:auto;transform:translateX(-50%);top:-10px;pointer-events:none;z-index:40;">
            ${dmg}
        </div>`;
    }

    // Stack badge — shown when zone has more than one card (evolutions/attachments)
    if (cards.length > 1) {
        html += `<div onclick="event.stopPropagation();ptOpenZoneStack('${player}','${zoneId}')"
                     title="Alle ${cards.length} Karten ansehen"
                     style="position:absolute;bottom:38px;left:2px;z-index:50;background:rgba(0,0,0,0.78);color:#fff;font-size:9px;font-weight:900;border-radius:4px;padding:2px 5px;cursor:pointer;pointer-events:auto;line-height:1;">🃏 ${cards.length}</div>`;
    }

    html += '</div>';
    return html;
}

// ─── ABILITY & TRAINER REGISTRIES ───────────────────────────────────
// Built at runtime from data/card_actions.json.
// Ability functions receive (player, zoneId) and return true if executed.
// Trainer functions receive (player, card) and return true if a modal was shown.
const PT_ABILITY_REGISTRY = {};   // populated by _ptLoadCardActions
const PT_TRAINER_REGISTRY = {};   // populated by _ptLoadCardActions

// Map action-id → JS implementation
const _PT_ABILITY_ACTIONS = {
    'lunatone':     ptAbilityLunatone,
    'drakloak':     ptAbilityDrakloak,
    'fezandipiti':  ptAbilityFezandipiti,
};
const _PT_TRAINER_ACTIONS = {
    'boss-orders':      ptTrainerBossOrders,
    'deck-search':      ptTrainerDeckSearch,
    'lillie':           ptTrainerLillie,
    'ultra-ball':       ptTrainerUltraBall,
    'discard-retrieve': ptTrainerDiscardRetrieve,
};

let _ptCardActionsLoaded = false;

function _ptLoadCardActions() {
    if (_ptCardActionsLoaded) return Promise.resolve();
    const ts = Date.now();
    return fetch(`data/card_actions.json?_=${ts}`)
        .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(data => {
            (data.abilities || []).forEach(a => {
                const fn = _PT_ABILITY_ACTIONS[a.action];
                if (!fn) return;
                (a.prints || []).forEach(p => { PT_ABILITY_REGISTRY[p] = fn; });
            });
            (data.trainers || []).forEach(t => {
                const fn = _PT_TRAINER_ACTIONS[t.action];
                if (!fn) return;
                (t.prints || []).forEach(p => { PT_TRAINER_REGISTRY[p] = fn; });
            });
            _ptCardActionsLoaded = true;
            console.log('[Playtester] Card actions loaded:',
                Object.keys(PT_ABILITY_REGISTRY).length, 'abilities,',
                Object.keys(PT_TRAINER_REGISTRY).length, 'trainers');
        })
        .catch(e => {
            console.warn('[Playtester] card_actions.json not loaded, using empty registries:', e);
            _ptCardActionsLoaded = true;
        });
}

function _ptGetTopPokemon(player, zoneId) {
    const cards = ptState[player].field[zoneId];
    if (!cards || cards.length === 0) return null;
    return [...cards].reverse().find(c => {
        const ct = (c.cardType || '').toLowerCase();
        return !ct.includes('energy') && ct !== 'tool' && !ct.includes('trainer');
    }) || cards[0];
}

function _ptGetAbilityKey(card) {
    if (card.setCode && card.number) return `${card.setCode}-${card.number}`;
    return null;
}

// Lunatone — Sol Calc: discard a Basic Energy from hand, draw 3 cards
function ptAbilityLunatone(player, zoneId) {
    const hand = ptState[player].hand;
    const energyIdx = hand.findIndex(c => (c.cardType || '').toLowerCase() === 'basic energy');
    if (energyIdx === -1) {
        ptShowMessage('⛔ Keine Basic Energy auf der Hand zum Ablegen!');
        return false;
    }
    const discarded = hand.splice(energyIdx, 1)[0];
    ptState[player].discard.push(discarded);
    ptLog(`✨ Lunatone Ability: "${discarded.name}" → Discard.`);
    // Draw 3
    for (let i = 0; i < 3; i++) {
        if (ptState[player].deck.length === 0) break;
        ptState[player].hand.push(ptState[player].deck.pop());
    }
    ptLog(`✨ Lunatone Ability: 3 Karten gezogen.`);
    return true;
}

// Drakloak — Trickster: look at top 2 cards, take 1 to hand, put other on bottom
function ptAbilityDrakloak(player, zoneId) {
    if (ptState[player].deck.length === 0) {
        ptShowMessage('⛔ Deck ist leer!');
        return false;
    }
    const topCards = [];
    for (let i = 0; i < Math.min(2, ptState[player].deck.length); i++) {
        topCards.push(ptState[player].deck.pop());
    }
    ptLog(`✨ Drakloak Ability: Top ${topCards.length} Karten anschauen...`);
    // Show pick modal
    _ptShowAbilityPickModal(player, topCards, 1, 'hand', 'bottom',
        'Drakloak — Wähle 1 Karte für die Hand (die andere geht unter das Deck)');
    return true;
}

// ── TRAINER ACTIONS ─────────────────────────────────────────────────

// Boss's Orders: pick one of opponent's bench Pokémon → force it into active
function ptTrainerBossOrders(player, card) {
    const opp = player === 'p1' ? 'p2' : 'p1';
    const benchZones = ['bench0','bench1','bench2','bench3','bench4'];
    const occupied = benchZones.filter(b => ptState[opp].field[b].length > 0);
    if (occupied.length === 0) {
        ptShowMessage('⛔ Gegner hat keine Pokémon auf der Bank!');
        return false;
    }
    if (occupied.length === 1) {
        ptSwapZones(opp, occupied[0], null);
        ptLog(`📋 Boss's Orders: ${opp.toUpperCase()} ${_ptEscHtml(_ptGetTopPokemon(opp, 'active')?.name || '?')} → Aktiv erzwungen!`);
        return true;
    }
    const _tp = (cards) => [...cards].reverse().find(c => { const ct = (c.cardType||'').toLowerCase(); return !ct.includes('energy') && ct !== 'tool' && !ct.includes('trainer'); }) || cards[0];
    let html = `<div style="background:#1a1a2e;border:2px solid #E3350D;border-radius:14px;padding:20px;text-align:center;color:#fff;max-width:520px;">
        <h3 style="color:#E3350D;margin-top:0;">📋 Boss's Orders</h3>
        <p style="color:#ccc;font-size:12px;margin-bottom:16px;">Wähle ein gegnerisches Bankpokémon das in die Aktive Position gezwungen wird.</p>
        <div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:18px;">`;
    occupied.forEach(bz => {
        const topPoke = _tp(ptState[opp].field[bz]);
        html += `<div style="cursor:pointer;text-align:center;transition:transform .15s;"
                      onclick="ptFinishBossOrders('${opp}','${bz}')"
                      onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${topPoke.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:8px;border:3px solid #E3350D;box-shadow:0 0 12px rgba(227,53,13,0.5);" onerror="this.src='${CARD_BACK_URL}'" title="${_ptEscHtml(topPoke.name)}">
            <div style="color:#fff;font-size:9px;margin-top:4px;max-width:82px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(topPoke.name)}</div>
        </div>`;
    });
    html += `</div>
        <button onclick="document.getElementById('ptBossModal').style.display='none'" style="background:#555;color:#fff;border:none;padding:6px 18px;border-radius:8px;cursor:pointer;">Abbrechen</button>
    </div>`;
    let modal = document.getElementById('ptBossModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ptBossModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99998;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
    ptLog(`📋 Boss's Orders: Wähle gegnerisches Bankpokémon…`);
    return true;
}

function ptFinishBossOrders(oppPlayer, benchZone) {
    const modal = document.getElementById('ptBossModal');
    if (modal) modal.style.display = 'none';
    ptSwapZones(oppPlayer, benchZone, null);
    const newActive = _ptGetTopPokemon(oppPlayer, 'active');
    ptLog(`📋 Boss's Orders: ${oppPlayer.toUpperCase()} ${_ptEscHtml(newActive?.name || '?')} → Aktiv erzwungen!`);
}

// Fezandipiti ex — Adrenaline Flush: draw 3 cards
function ptAbilityFezandipiti(player, zoneId) {
    let drawn = 0;
    for (let i = 0; i < 3; i++) {
        if (ptState[player].deck.length === 0) break;
        ptState[player].hand.push(ptState[player].deck.pop());
        drawn++;
    }
    if (drawn === 0) {
        ptShowMessage('⛔ Deck ist leer!');
        return false;
    }
    ptLog(`✨ Fezandipiti ex Ability: ${drawn} Karten gezogen.`);
    return true;
}

// Trainer: open deck search (Dawn, Hilda, Poké Pad, Crispin, Buddy-Buddy Poffin)
function ptTrainerDeckSearch(player, card) {
    ptLog(`🔍 ${_ptEscHtml(card.name)}: Deck Search…`);
    ptOpenDeckSearch(player);
    return true;
}

// Lillie's Determination: shuffle hand into deck, draw 6 (or 8 if 6 prizes)
function ptTrainerLillie(player, card) {
    const hand = ptState[player].hand;
    while (hand.length > 0) {
        ptState[player].deck.push(hand.pop());
    }
    // Shuffle deck
    const deck = ptState[player].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const prizesLeft = ptState[player].prizes.length;
    const drawCount = prizesLeft === 6 ? 8 : 6;
    let drawn = 0;
    for (let i = 0; i < drawCount; i++) {
        if (deck.length === 0) break;
        ptState[player].hand.push(deck.pop());
        drawn++;
    }
    ptLog(`📖 Lillie's Determination: Hand ins Deck gemischt, ${drawn} Karten gezogen${prizesLeft === 6 ? ' (6 Prizes → 8!)' : ''}.`);
    ptSaveState(); ptRenderAll();
    return true;
}

// Ultra Ball: discard 2 cards from hand, then open deck search
function ptTrainerUltraBall(player, card) {
    const hand = ptState[player].hand;
    if (hand.length < 2) {
        ptShowMessage('⛔ Nicht genug Karten auf der Hand zum Ablegen!');
        return false;
    }
    // Show modal to pick 2 cards to discard
    let html = `<div style="background:#1a1a2e;border:2px solid #f39c12;border-radius:14px;padding:20px;text-align:center;color:#fff;max-width:90vw;">
        <h3 style="color:#f39c12;margin-top:0;">🔴 Ultra Ball — 2 Karten ablegen</h3>
        <p style="color:#ccc;font-size:12px;margin-bottom:16px;">Wähle 2 Karten aus deiner Hand zum Ablegen.</p>
        <div id="ptUBCards" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-bottom:18px;">`;
    hand.forEach((c, i) => {
        html += `<div class="pt-ub-card" data-idx="${i}" style="cursor:pointer;text-align:center;transition:transform .15s;border:3px solid transparent;border-radius:8px;padding:2px;"
                      onclick="ptUBToggle(this,${i})">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:62px;border-radius:6px;display:block;" onerror="this.src='${CARD_BACK_URL}'">
            <div style="color:#fff;font-size:8px;margin-top:2px;max-width:62px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(c.name)}</div>
        </div>`;
    });
    html += `</div>
        <button id="ptUBConfirm" onclick="ptUBFinish('${player}')" disabled style="background:#f39c12;color:#fff;border:none;padding:8px 24px;border-radius:8px;cursor:pointer;font-weight:700;opacity:0.4;">Ablegen & Suchen (0/2)</button>
        <button onclick="document.getElementById('ptUBModal').style.display='none'" style="background:#555;color:#fff;border:none;padding:6px 18px;border-radius:8px;cursor:pointer;margin-left:8px;">Abbrechen</button>
    </div>`;
    let modal = document.getElementById('ptUBModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ptUBModal';
        modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:99998;';
        document.body.appendChild(modal);
    }
    modal.innerHTML = html;
    modal.style.display = 'flex';
    window._ptUBSelected = [];
    ptLog(`🔴 Ultra Ball: Wähle 2 Karten zum Ablegen…`);
    return true;
}

function ptUBToggle(el, idx) {
    const sel = window._ptUBSelected;
    const pos = sel.indexOf(idx);
    if (pos >= 0) {
        sel.splice(pos, 1);
        el.style.borderColor = 'transparent';
    } else if (sel.length < 2) {
        sel.push(idx);
        el.style.borderColor = '#f39c12';
    }
    const btn = document.getElementById('ptUBConfirm');
    if (btn) {
        btn.disabled = sel.length !== 2;
        btn.style.opacity = sel.length === 2 ? '1' : '0.4';
        btn.textContent = `Ablegen & Suchen (${sel.length}/2)`;
    }
}

function ptUBFinish(player) {
    const modal = document.getElementById('ptUBModal');
    if (modal) modal.style.display = 'none';
    const sel = (window._ptUBSelected || []).sort((a, b) => b - a);
    sel.forEach(idx => {
        const removed = ptState[player].hand.splice(idx, 1)[0];
        if (removed) {
            ptState[player].discard.push(removed);
            ptLog(`🔴 Ultra Ball: ${_ptEscHtml(removed.name)} → Discard`);
        }
    });
    delete window._ptUBSelected;
    ptSaveState(); ptRenderAll();
    setTimeout(() => ptOpenDeckSearch(player), 100);
}

// Night Stretcher: open discard pile to retrieve a card
function ptTrainerDiscardRetrieve(player, card) {
    ptLog(`♻️ ${_ptEscHtml(card.name)}: Discard durchsuchen…`);
    ptOpenDiscard(player);
    return true;
}

function _ptShowAbilityPickModal(player, cards, pickCount, pickDest, restDest, title) {
    let existing = document.getElementById('ptAbilityPickModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'ptAbilityPickModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:99999;';
    const safeTitle = _ptEscHtml(title);
    let html = `<div style="background:#1a1a2e;border:2px solid #FFCB05;border-radius:14px;padding:24px;max-width:90vw;color:#fff;text-align:center;">
        <h3 style="color:#FFCB05;margin-top:0;">${safeTitle}</h3>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin:16px 0;">`;
    cards.forEach((c, i) => {
        html += `<div style="cursor:pointer;transition:transform .15s;" onclick="window._ptAbilityPick(${i})"
                      onmouseover="this.style.transform='scale(1.08)'" onmouseout="this.style.transform='scale(1)'">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:100px;border-radius:8px;" onerror="this.src='${CARD_BACK_URL}'">
            <div style="font-size:10px;margin-top:4px;">${_ptEscHtml(c.name)}</div>
        </div>`;
    });
    html += `</div></div>`;
    modal.innerHTML = html;
    document.body.appendChild(modal);

    window._ptAbilityPick = function(idx) {
        const picked = cards.splice(idx, 1)[0];
        if (pickDest === 'hand') ptState[player].hand.push(picked);
        ptLog(`✨ "${picked.name}" → Hand genommen.`);
        // Remaining cards go to restDest
        cards.forEach(c => {
            if (restDest === 'bottom') ptState[player].deck.unshift(c);
            else if (restDest === 'discard') ptState[player].discard.push(c);
            ptLog(`✨ "${c.name}" → ${restDest === 'bottom' ? 'Unter das Deck' : 'Discard'}.`);
        });
        modal.remove();
        delete window._ptAbilityPick;
        ptSaveState();
        ptRenderAll();
    };
}

function ptToggleAbilityUsed(player, zoneId, event) {
    if (event) event.stopPropagation();
    if (!ptState[player].abilityUsed) ptState[player].abilityUsed = {};

    // If marking as USED, check for registered ability automation
    if (!ptState[player].abilityUsed[zoneId]) {
        const topPoke = _ptGetTopPokemon(player, zoneId);
        if (topPoke) {
            const key = _ptGetAbilityKey(topPoke);
            const abilityFn = key && PT_ABILITY_REGISTRY[key];
            if (abilityFn) {
                const executed = abilityFn(player, zoneId);
                if (executed) {
                    ptState[player].abilityUsed[zoneId] = true;
                    ptSaveState();
                    ptRenderAll();
                    return;
                }
                // If ability couldn't execute (e.g. no energy), don't mark as used
                return;
            }
        }
    }

    // Fallback: simple toggle for unregistered abilities
    ptState[player].abilityUsed[zoneId] = !ptState[player].abilityUsed[zoneId];
    const state = ptState[player].abilityUsed[zoneId];
    ptLog(`✨ Ability auf ${zoneId} ${state ? 'benutzt (✅)' : 'zurückgesetzt'}`);
    ptRenderAll();
}

// --- CARD CONTEXT MENU ---

let ptActiveMenuPlayer = null;
let ptActiveMenuZoneId = null;

let _ptMenuHideTimer = null;

function ptScheduleMenuClose() {
    clearTimeout(_ptMenuHideTimer);
    _ptMenuHideTimer = setTimeout(() => {
        const menu = document.getElementById('ptCardContextMenu');
        if (menu) menu.style.display = 'none';
        _ptMenuHideTimer = null;
    }, 200);
}

function ptCancelMenuClose() {
    clearTimeout(_ptMenuHideTimer);
    _ptMenuHideTimer = null;
}

function ptOpenCardMenu(event, player, zoneId, forceOpen = false) {
    const isMobileViewport = window.matchMedia && window.matchMedia('(max-width: 768px)').matches;
    if (isMobileViewport && !forceOpen) return;

    ptCancelMenuClose();
    ptActiveMenuPlayer = player;
    ptActiveMenuZoneId = zoneId;
    const menu = document.getElementById('ptCardContextMenu');
    if (!menu) return;

    // Position menu centered above the hovered zone
    const rect      = event.currentTarget.getBoundingClientRect();
    const menuWidth = 178;
    const menuHeight = 150;
    let posX = rect.left + rect.width / 2;
    let posY = rect.top - menuHeight - 8;

    // Not enough space above → show below
    if (posY < 6) posY = rect.bottom + 8;
    // Horizontal bounds
    if (posX + menuWidth / 2 > window.innerWidth) posX = window.innerWidth - menuWidth / 2 - 6;
    if (posX - menuWidth / 2 < 6)                 posX = menuWidth / 2 + 6;

    menu.style.display   = 'flex';
    menu.style.position  = 'fixed';
    menu.style.left      = posX + 'px';
    menu.style.top       = posY + 'px';
    menu.style.transform = 'translateX(-50%)';
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('ptCardContextMenu');
    if (menu && menu.style.display === 'flex' && !menu.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function ptMenuAction(type, value) {
    const menu = document.getElementById('ptCardContextMenu');
    if (menu) menu.style.display = 'none';
    if (!ptActiveMenuPlayer || !ptActiveMenuZoneId) return;
    const player = ptActiveMenuPlayer;
    const zoneId = ptActiveMenuZoneId;
    if (type === 'damage') {
        if (value === 0) clearDamage(player, zoneId, null);
        else             addDamage(player, zoneId, value, null);
    } else if (type === 'status') {
        const map = { poison:'poisoned', burn:'burned', asleep:'asleep', paralyzed:'paralyzed', confused:'confused' };
        toggleStatus(player, map[value] || value, null);
    } else if (type === 'utility') {
        if      (value === 'hand')    returnToHand(player, zoneId, null);
        else if (value === 'deck')    ptShuffleIntoDeck(player, zoneId);
        else if (value === 'discard') discardTopCard(player, zoneId, null);
        else if (value === 'ko')      ptKnockOutZone(player, zoneId);
        else if (value === 'energy-discard') ptEnergyDiscard(player, zoneId);
        else if (value === 'retreat') ptRetreat(player, zoneId);
    }
}

function ptOpenZoneStack(player, zoneId) {
    const cards = ptState[player].field[zoneId];
    if (!cards || cards.length === 0) return;
    const zoneLabel = zoneId.charAt(0).toUpperCase() + zoneId.slice(1);
    const title = document.getElementById('ptDiscardModalTitle');
    if (title) title.textContent = `🃏 ${zoneLabel} (${player.toUpperCase()}) – ${cards.length} Karten`;
    const sortBar = document.getElementById('ptDiscardSortBar');
    if (sortBar) sortBar.style.display = 'none';
    const grid = document.getElementById('ptDiscardGrid');
    if (!grid) return;
    grid.innerHTML = cards.map((c, i) => {
        const safeImg  = (c.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const isEnergy  = (c.cardType || '').toLowerCase().includes('energy');
        const isTool    = (c.cardType || '').toLowerCase().includes('trainer') || (c.cardType || '') === 'tool';
        const badge     = isEnergy ? '⚡' : isTool ? '🔧' : i === 0 ? '🐾 Basis' : `🔼 Stufe ${i}`;
        return `<div style="position:relative;cursor:pointer;text-align:center;" title="${_ptEscHtml(c.name)}">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='${CARD_BACK_URL}'"
                 onclick="ptViewCard(event,'${safeImg}')">
            <div style="position:absolute;top:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#FFCB05;font-size:8px;font-weight:700;padding:2px 3px;border-radius:6px 6px 0 0;">${badge}</div>
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${_ptEscHtml(c.name)}</div>
        </div>`;
    }).join('');
    document.getElementById('ptDiscardModal').style.display = 'flex';
}

function ptShuffleIntoDeck(player, zoneId) {
    const isNeutral = (zoneId === 'playzone' || zoneId === 'stadium');
    const zoneArr = isNeutral ? (zoneId === 'stadium' ? ptState.stadium : ptState.playZone) : ptState[player].field[zoneId];
    if (zoneArr.length > 0) {
        // Move ALL cards from zone into deck
        while (zoneArr.length > 0) {
            ptState[player].deck.push(zoneArr.pop());
        }
        // Shuffle the deck
        const deck = ptState[player].deck;
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        ptLog(`Shuffled cards from ${zoneId} into ${player.toUpperCase()}'s deck.`);
        if (!isNeutral) {
            ptState[player].damage[zoneId] = 0;
            if (zoneId === 'active') ptState[player].status = [];
        }
        ptRenderAll();
    }
}

// ── ZIEL 3: Mobile toggle for extended hand actions ──────────────────────
function ptToggleMobileActions() {
    const ext = document.getElementById('ptExtendedActions');
    if (!ext) return;
    ext.classList.toggle('pt-expanded');
    const btn = document.querySelector('.pt-mobile-toggle');
    if (btn) btn.textContent = ext.classList.contains('pt-expanded') ? '✕' : '⚙️';
}

// ── ZIEL 4: Mobile deck popup menu ──────────────────────────────────────
function ptShowDeckPopup(player, deckEl) {
    ptCloseDeckPopup();
    const popup = document.createElement('div');
    popup.id = 'ptDeckPopup';
    popup.className = 'pt-deck-popup';
    popup.innerHTML =
        '<div class="pt-deck-popup-title">\u{1F4E6} Deck (' + player.toUpperCase() + ')</div>' +
        '<button class="pt-btn-small" style="width:100%;background:#2a52be;border-color:#3B4CCA;margin-bottom:2px;" onclick="ptDrawCards(\'' + player + '\',1);ptCloseDeckPopup()">\u2B06\uFE0F Draw 1</button>' +
        '<button class="pt-btn-small" style="width:100%;background:#2a52be;border-color:#3B4CCA;margin-bottom:2px;" onclick="ptOpenDeckSearch(\'' + player + '\');ptCloseDeckPopup()">\u{1F50D} Search</button>' +
        '<button class="pt-btn-small" style="width:100%;margin-bottom:2px;" onclick="ptShuffleDeck(\'' + player + '\');ptCloseDeckPopup()">\u{1F500} Shuffle</button>' +
        '<div class="pt-stepper-group">' +
            '<button class="pt-stepper-btn" onclick="updateStepper(\'' + player + '-pop-draw\',-1)">-</button>' +
            '<span id="' + player + '-pop-draw" class="pt-stepper-val">2</span>' +
            '<button class="pt-stepper-btn" onclick="updateStepper(\'' + player + '-pop-draw\',1)">+</button>' +
            '<button class="pt-stepper-action" onclick="ptDrawCards(\'' + player + '\',parseInt(document.getElementById(\'' + player + '-pop-draw\').innerText));ptCloseDeckPopup()">DRAW</button>' +
        '</div>' +
        '<div class="pt-stepper-group">' +
            '<button class="pt-stepper-btn" onclick="updateStepper(\'' + player + '-pop-top\',-1)">-</button>' +
            '<span id="' + player + '-pop-top" class="pt-stepper-val">5</span>' +
            '<button class="pt-stepper-btn" onclick="updateStepper(\'' + player + '-pop-top\',1)">+</button>' +
            '<button class="pt-stepper-action" onclick="ptLookCards(\'' + player + '\',\'top\',parseInt(document.getElementById(\'' + player + '-pop-top\').innerText));ptCloseDeckPopup()">TOP</button>' +
        '</div>' +
        '<div class="pt-stepper-group">' +
            '<button class="pt-stepper-btn" onclick="updateStepper(\'' + player + '-pop-bot\',-1)">-</button>' +
            '<span id="' + player + '-pop-bot" class="pt-stepper-val">1</span>' +
            '<button class="pt-stepper-btn" onclick="updateStepper(\'' + player + '-pop-bot\',1)">+</button>' +
            '<button class="pt-stepper-action" onclick="ptLookCards(\'' + player + '\',\'bottom\',parseInt(document.getElementById(\'' + player + '-pop-bot\').innerText));ptCloseDeckPopup()">BOT</button>' +
        '</div>' +
        '<button class="pt-btn-small pt-deck-popup-close" onclick="ptCloseDeckPopup()">\u2715 Close</button>';
    const rect = deckEl.getBoundingClientRect();
    popup.style.left = Math.min(Math.max(rect.left - 60, 8), window.innerWidth - 190) + 'px';
    popup.style.top = Math.max(rect.top - 280, 10) + 'px';
    document.body.appendChild(popup);
}

function ptCloseDeckPopup() {
    const popup = document.getElementById('ptDeckPopup');
    if (popup) popup.remove();
}

function ptInitMobileDeckTriggers() {
    if (window.innerWidth > 768) return;
    document.querySelectorAll('.pt-deck-pile').forEach(function(pile) {
        if (pile.dataset.mobileInit) return;
        pile.dataset.mobileInit = '1';
        const player = pile.closest('#p1-area') ? 'p1' : 'p2';
        const trigger = document.createElement('button');
        trigger.className = 'pt-btn-small pt-deck-popup-trigger';
        trigger.textContent = '\u22EE Deck Menu';
        trigger.onclick = function() { ptShowDeckPopup(player, pile); };
        pile.parentElement.appendChild(trigger);
    });
}

// ── Deck Menu (Mobile Tap) ──────────────────────────────────────────────
async function ptDeckMenu(player) {
    const action = await showInputModal({ title: 'Deck Menu', message: '1 = Karte ziehen\n2 = Deck durchsuchen (Search)\n3 = Oberste Karten ansehen\n4 = Gegner mischt & zieht X', defaultValue: '1', placeholder: '1-4' });
    if (action === '1') ptDrawCards(player, 1);
    else if (action === '2') ptOpenDeckSearch(player);
    else if (action === '3') ptLookCards(player, 'top', 5);
    else if (action === '4') ptOpponentShuffleAndDraw();
}
window.ptDeckMenu = ptDeckMenu;

// ── Quick Actions Menu (Mobile Shortcut) ─────────────────────────────────
async function ptQuickActionsMenu() {
    const player = ptCurrentPlayer || 'p1';
    const action = await showInputModal({ title: 'Quick Actions', message: '1 = Iono (Enigmara)\n2 = Karte ziehen (Draw)\n3 = Deck durchsuchen (Search)\n4 = Oberste Karten ansehen (Look)\n5 = Gegner mischt & zieht X\n6 = Mulligan (7 neue Karten)\n7 = Hand mischen (Shuffle into Deck)\n8 = Setup Phase (Neustart)', defaultValue: '1', placeholder: '1-8' });
    if (action === '1') ptGlobalIono();
    else if (action === '2') ptDrawCards(player, 1);
    else if (action === '3') ptOpenDeckSearch(player);
    else if (action === '4') ptLookCards(player, 'top', 5);
    else if (action === '5') ptOpponentShuffleAndDraw();
    else if (action === '6') ptMulligan(player);
    else if (action === '7') ptHandAction('shuffle_deck');
    else if (action === '8') ptOpenStartPhase();
}
window.ptQuickActionsMenu = ptQuickActionsMenu;

// ── Opponent Shuffle & Draw X ───────────────────────────────────────────
async function ptOpponentShuffleAndDraw() {
    const input = await showInputModal({ title: 'Gegner zieht Karten', message: 'Wie viele Karten soll der Gegner ziehen?', defaultValue: '4', inputType: 'number' });
    if (!input || isNaN(parseInt(input))) return;
    const num = Math.max(0, parseInt(input));

    ptSaveState();
    const opp = ptCurrentPlayer === 'p1' ? 'p2' : 'p1';

    // Hand ins Deck mischen
    ptState[opp].deck.push.apply(ptState[opp].deck, ptState[opp].hand);
    ptState[opp].hand = [];

    // Fisher-Yates shuffle
    const deck = ptState[opp].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }

    // Draw X
    const drawn = Math.min(num, deck.length);
    for (let k = 0; k < drawn; k++) {
        ptState[opp].hand.push(deck.pop());
    }

    ptLog('\uD83D\uDD04 Opponent Shuffle & Draw: ' + opp.toUpperCase() + ' mischt Hand ins Deck und zieht ' + drawn + '.');
    ptRenderAll();
}

window.executeCustomJudge = function() {
    const p1 = parseInt(document.getElementById('inpJudgeP1')?.value) || 4;
    const p2 = parseInt(document.getElementById('inpJudgeP2')?.value) || 4;

    ptSaveState();

    // P1 Shuffle & Draw
    ptState.p1.deck.push.apply(ptState.p1.deck, ptState.p1.hand);
    ptState.p1.hand = [];
    ptShuffleDeck('p1');
    ptDrawCards('p1', p1);

    // P2 Shuffle & Draw
    ptState.p2.deck.push.apply(ptState.p2.deck, ptState.p2.hand);
    ptState.p2.hand = [];
    ptShuffleDeck('p2');
    ptDrawCards('p2', p2);

    if (typeof showToast === 'function') showToast('Judge gespielt! P1 zieht ' + p1 + ', P2 zieht ' + p2);
    else ptShowMessage('Judge gespielt! P1 zieht ' + p1 + ', P2 zieht ' + p2);

    const modal = document.getElementById('ptDirectActionModal');
    if (modal) modal.style.display = 'none';
    ptRenderAll();
    ptSaveState();
};

window.executeCustomIono = function() {
    const p1 = parseInt(document.getElementById('inpIonoP1')?.value) || 6;
    const p2 = parseInt(document.getElementById('inpIonoP2')?.value) || 6;

    ptSaveState();

    // Iono: hands go to bottom of deck (Fisher-Yates shuffle)
    for (let i = ptState.p1.hand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ptState.p1.hand[i], ptState.p1.hand[j]] = [ptState.p1.hand[j], ptState.p1.hand[i]]; }
    ptState.p1.deck.unshift.apply(ptState.p1.deck, ptState.p1.hand);
    ptState.p1.hand = [];
    ptDrawCards('p1', p1);

    for (let i = ptState.p2.hand.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ptState.p2.hand[i], ptState.p2.hand[j]] = [ptState.p2.hand[j], ptState.p2.hand[i]]; }
    ptState.p2.deck.unshift.apply(ptState.p2.deck, ptState.p2.hand);
    ptState.p2.hand = [];
    ptDrawCards('p2', p2);

    if (typeof showToast === 'function') showToast('Iono gespielt! P1 zieht ' + p1 + ', P2 zieht ' + p2);
    else ptShowMessage('Iono gespielt! P1 zieht ' + p1 + ', P2 zieht ' + p2);

    const modal = document.getElementById('ptDirectActionModal');
    if (modal) modal.style.display = 'none';
    ptRenderAll();
    ptSaveState();
};

window.executeOwnShuffleDraw = function() {
    const count = parseInt(document.getElementById('inpOwnSD')?.value) || 6;
    const p = ptCurrentPlayer || 'p1';

    ptSaveState();
    ptState[p].deck.push.apply(ptState[p].deck, ptState[p].hand);
    ptState[p].hand = [];
    ptShuffleDeck(p);
    ptDrawCards(p, count);

    const modal = document.getElementById('ptDirectActionModal');
    if (modal) modal.style.display = 'none';
    ptRenderAll();
    ptSaveState();
};

window.executeOppShuffleDraw = function() {
    const count = parseInt(document.getElementById('inpOppSD')?.value) || 4;
    const opp = ptCurrentPlayer === 'p1' ? 'p2' : 'p1';

    ptSaveState();
    ptState[opp].deck.push.apply(ptState[opp].deck, ptState[opp].hand);
    ptState[opp].hand = [];
    ptShuffleDeck(opp);
    ptDrawCards(opp, count);

    const modal = document.getElementById('ptDirectActionModal');
    if (modal) modal.style.display = 'none';
    ptRenderAll();
    ptSaveState();
};

window.openMultiplayerMenu = function() {
    if (typeof toggleMultiplayerMenu === 'function') toggleMultiplayerMenu();
};

window.startPlaytesterSetup = function() {
    if (typeof ptNewGame === 'function') ptNewGame();
};

window.renderPlaytester = window.renderPlaytester || ptRenderAll;
window.savePtState = window.savePtState || ptSaveState;

window.ptOpponentShuffleAndDraw = ptOpponentShuffleAndDraw;
window.startStandalonePlaytester = startStandalonePlaytester;
window.parseSandboxDeckToExactPrints = parseSandboxDeckToExactPrints;
