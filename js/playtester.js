/**
 * ============================================================================
 * POKÉMON TCG GOLDFISHING PLAYTESTER - ULTIMATE SANDBOX (v4)
 * ============================================================================
 */

const CARD_BACK_URL = "https://images.pokemontcg.io/card-back.png";

let ptState = { p1: null, p2: null, stadium: [], playZone: [] };
let ptCurrentPlayer = 'p1';
let ptSelectedCardIndex = null;
let ptActionLog = [];
let ptLookingAt = [];
let ptLookingAtIsBottom = false;
let ptLookingAtPlayer = 'p1';
let _ptMsgTimer = null;
let ptActiveBuffs = { p1: 0, p2: 0 };

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
        ptStateHistory.push(JSON.parse(JSON.stringify(ptState)));
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
    const entry = `<div class="pt-log-entry ${colorClass}">[${time}] ${pName}: ${msg}</div>`;
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
        } else {
            const cd = window.allCardsDatabase && window.allCardsDatabase.find(c => c.name === cardName);
            if (cd && cd.image_url) imageUrl = cd.image_url;
            if (cd) cardType = cd.type || cd.card_type || cd.supertype || '';
        }
        for (let i = 0; i < count; i++) {
            baseCards.push({ name: cardName, imageUrl, cardType });
        }
    }

    ptState.p1 = getInitialPlayerState();
    ptState.p2 = getInitialPlayerState();
    ptState.stadium  = [];
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

        return { name, count, imageUrl, cardType };
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
function _ptIsBasic(card) {
    const t = (card.cardType || card.supertype || '').toLowerCase();
    // Explicit non-Pokémon types
    if (t === 'supporter' || t === 'item' || t === 'tool' || t === 'stadium') return false;
    if (t.includes('energy')) return false;
    // Check for "Basic" in the type string (e.g. "GBasic", "WBasic", "Basic")
    return t.includes('basic');
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

    let html = `<div style="background:#1a1a2e;border:2px solid #3B4CCA;border-radius:14px;padding:24px;width:min(98vw,960px);max-height:92vh;overflow-y:auto;color:#fff;">`;
    html += `
        <h2 style="color:#FFCB05;text-align:center;margin-top:0;">🃏 Setup Phase</h2>
        <p style="text-align:center;color:#ccc;margin-bottom:8px;">🔵 <strong>P1</strong> geht zuerst. Wähle dein Aktives &amp; Bank-Pokémon, dann auf <strong>Let's Battle!</strong></p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
            ${ptRenderStartHandHTML('p1')}
            ${ptRenderStartHandHTML('p2')}
        </div>
        <div style="text-align:center;margin-bottom:10px;">
            <button onclick="ptConfirmStartActives()" id="ptStartBtn"
                style="font-size:1.1em;padding:13px 44px;background:linear-gradient(135deg,#27ae60,#1e8449);color:#fff;border:none;border-radius:10px;cursor:pointer;box-shadow:0 4px 14px rgba(39,174,96,0.4);">
                👊 Let's Battle!
            </button>
            <p id="ptStartHint" style="color:#f1c40f;font-size:12px;margin-top:6px;">Beide Spieler müssen ein Aktives Pokémon wählen</p>
        </div>`;
    html += `</div>`;
    modal.innerHTML = html;
    ptUpdateStartBtn();
}

function ptRenderStartHandHTML(player) {
    const label = player === 'p1' ? '🔵 Player 1' : '🔴 Player 2';
    const borderColor = player === 'p1' ? '#3B4CCA' : '#E3350D';
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
            <span style="font-size:8px;max-width:72px;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:${isBasic?'#ddd':'#666'};">${card.name}</span>
        </div>`;
    }).join('');

    const noBasicWarn = !hasBasic
        ? `<div style="background:#e74c3c;color:#fff;padding:7px 12px;border-radius:7px;font-size:11px;font-weight:700;margin-bottom:8px;text-align:center;">⚠️ No Basic Pokémon! Do a Mulligan.</div>` : '';

    const statusMsg = activeIdx !== null
        ? `✅ Active: <strong>${ptState[player].hand[activeIdx]?.name||'?'}</strong>${benchIdxs.length ? ` &nbsp;|&nbsp; Bench: ${benchIdxs.length}` : ''}`
        : `<span style="color:#f1c40f;">⬆️ Click a Basic to set as Active</span>`;

    const mulBtnStyle = `padding:5px 14px;background:#8e44ad;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px;`;
    const clrBtnStyle = `padding:5px 14px;background:rgba(255,255,255,0.1);color:#fff;border:1px solid #555;border-radius:6px;cursor:pointer;font-size:11px;`;

    return `<div style="border:2px solid ${borderColor};border-radius:10px;padding:14px;">
        <div style="font-weight:900;margin-bottom:8px;font-size:1em;color:${borderColor};display:flex;justify-content:space-between;align-items:center;">
            <span>${label}</span>
            <span style="font-size:10px;font-weight:400;color:#aaa;">Dbl-click any card to zoom</span>
        </div>
        ${noBasicWarn}
        <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;min-height:90px;margin-bottom:8px;">${cardsHTML}</div>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
            <button onclick="ptStartMulligan('${player}')" style="${mulBtnStyle}">🃏 Mulligan</button>
            <button onclick="ptStartClearBench('${player}')" style="${clrBtnStyle}">Clear Bench</button>
        </div>
        <div style="margin-top:7px;text-align:center;font-size:11px;color:#a8e6cf;">${statusMsg}</div>
    </div>`;
}

function ptStartCardClick(player, index) {
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
    const p1ok = ptStartChoices.p1?.active !== null && ptStartChoices.p1?.active !== undefined;
    const p2ok = ptStartChoices.p2?.active !== null && ptStartChoices.p2?.active !== undefined;
    const ready = p1ok && p2ok;
    btn.disabled = !ready;
    btn.style.opacity = ready ? '1' : '0.45';
    if (hint) hint.style.display = ready ? 'none' : 'block';
}

function ptStartMulligan(player) {
    ptState[player].deck.push(...ptState[player].hand);
    ptState[player].hand = [];
    const deck = ptState[player].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    for (let i = 0; i < 7; i++) if (deck.length > 0) ptState[player].hand.push(deck.pop());
    ptStartChoices[player] = { active: null, bench: [] };
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
        const safeName = (c.name || '').replace(/'/g, "\\'");
        return `<div style="cursor:pointer;text-align:center;" onclick="ptZoomViewCard('${safeImg}','${safeName}')" title="${c.name}">
            <img src="${c.imageUrl||CARD_BACK_URL}" style="width:86px;border-radius:6px;display:block;transition:transform .12s;" onerror="this.src='${CARD_BACK_URL}'" onmouseover="this.style.transform='scale(1.06)'" onmouseout="this.style.transform='scale(1)'">
            <div style="color:#ccc;font-size:8px;margin-top:2px;max-width:86px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name||''}</div>
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
                 ondblclick="ptViewCard(event,'${safeImg}')" title="${c.name || ''}">
            <div style="color:#fff;font-size:10px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.name || ''}</div>
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
    if (ptState[p].deck.length > 0) {
        ptState[p].hand.push(ptState[p].deck.pop());
        ptRenderAll();
        ptLog('Drew a card.');
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
    const p = player || ptCurrentPlayer;
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
    const p = player || ptCurrentPlayer;
    ptLookingAtPlayer   = p;
    ptLookingAtIsBottom = (position === 'bottom');
    const deck = ptState[p].deck;
    const take = Math.min(amount || 5, deck.length);
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
    const result = Math.random() >= 0.5 ? 'HEADS!' : 'TAILS!';
    ptLog(`🪙 Coin flip: ${result}`);
}

function ptFlipBoard() {
    const board    = document.getElementById('playtester-board');
    const handZone = document.querySelector('.pt-hand-zone');
    const ind      = document.getElementById('activePlayerIndicator');
    if (!board) return;
    const flipping = ptCurrentPlayer === 'p1';
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
}

function ptPassTurn() {
    const p = ptCurrentPlayer;
    let dmg = 0;
    if (ptState[p].status.includes('poisoned')) dmg += 10;
    if (ptState[p].status.includes('burned'))   dmg += 20;
    if (dmg > 0) {
        ptState[p].damage.active += dmg;
        ptLog(`Status damage: +${dmg} DMG.`);
    }
    ptLog('Turn ended.');
    ptFlipBoard();
    ptDraw1();
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
        img.className = 'pt-field-card';
        img.style.width = '100px';
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

    // Clicking on opponent's zone
    if (player === opp) {
        const cards = ptState[player].field[zoneId];
        if (cards && cards.length > 0) {
            // Zoom the top card first
            const c = cards[cards.length - 1];
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
            const c = cards[cards.length - 1];
            ptViewCard(c.imageUrl || CARD_BACK_URL, c.name || '');
        }
        return;
    }

    // Hand card selected → place it on the target zone
    const card = ptState[ptCurrentPlayer].hand[ptSelectedCardIndex];
    if (!card) return;
    ptSaveState();

    if (zoneId === 'playzone') {
        ptState.playZone.push(card);
        ptLog(`Played Item/Supporter: "${card.name}".`);
    } else if (zoneId === 'stadium') {
        if (ptState.stadium.length > 0) ptState[ptCurrentPlayer].discard.push(ptState.stadium.pop());
        ptState.stadium.push(card);
        ptLog(`Played Stadium: "${card.name}".`);
    } else {
        ptState[player].field[zoneId].push(card);
        ptLog(`Placed "${card.name}" on ${player} ${zoneId}.`);
    }
    ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1);
    ptSelectedCardIndex = null;
    ptRenderAll();
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

// --- ACTION COMMANDS ---

function returnToHand(player, zoneId, event) {
    if (event) event.stopPropagation();
    const isNeutral = (zoneId === 'playzone' || zoneId === 'stadium');
    const zoneArr = isNeutral ? (zoneId === 'stadium' ? ptState.stadium : ptState.playZone) : ptState[player].field[zoneId];
    if (zoneArr.length > 0) {
        const c = zoneArr.pop();
        ptState[ptCurrentPlayer].hand.push(c);
        ptLog(`Took "${c.name}" to hand.`);
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
        ptState[ptCurrentPlayer].discard.push(c);
        ptLog(`Discarded "${c.name}".`);
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
        ptState[ptCurrentPlayer].lostzone.push(c);
        ptLog(`Sent "${c.name}" to the Lost Zone.`);
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
}

function clearDamage(player, zoneId, event) {
    if (event) event.stopPropagation();
    ptState[player].damage[zoneId] = 0;
    ptLog(`Pokémon on ${zoneId} healed.`);
    ptRenderAll();
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
    const el = document.getElementById(containerId || 'ptOppPanelContent');
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
                    <button onclick="toggleStatus('${opp}','poisoned');ptRenderOpponentPanel('${opp}','field')" style="${sSel('poisoned')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Vergiftet">☠️</button>
                    <button onclick="toggleStatus('${opp}','burned');ptRenderOpponentPanel('${opp}','field')" style="${sSel('burned')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Verbrannt">🔥</button>
                    <button onclick="toggleStatus('${opp}','asleep');ptRenderOpponentPanel('${opp}','field')" style="${sSel('asleep')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Schlaf">💤</button>
                    <button onclick="toggleStatus('${opp}','paralyzed');ptRenderOpponentPanel('${opp}','field')" style="${sSel('paralyzed')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Paralyse">⚡</button>
                    <button onclick="toggleStatus('${opp}','confused');ptRenderOpponentPanel('${opp}','field')" style="${sSel('confused')}border:none;border-radius:4px;padding:2px 6px;font-size:12px;cursor:pointer;" title="Verwirrt">💫</button>
                </div>` : '';
            // Also show all attached cards (energy/tools)
            const attachedHTML = cards.slice(1).map(ac => {
                const ai = (ac.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
                return `<img src="${ai}" style="width:38px;border-radius:4px;cursor:pointer;" onerror="this.src='${CARD_BACK_URL}'" onclick="ptViewCard('${ai}','${ac.name}')" title="${ac.name}">`;
            }).join('');
            html += `<div style="background:${isFocus ? 'rgba(231,76,60,0.18)' : 'rgba(255,255,255,0.05)'};border:${isFocus ? '2px solid #e74c3c' : '1px solid rgba(255,255,255,0.08)'};border-radius:10px;padding:12px;margin-bottom:10px;">
                <div style="font-weight:700;font-size:11px;color:#FFCB05;margin-bottom:8px;">${label}</div>
                <div style="display:flex;gap:10px;align-items:flex-start;">
                    <img src="${safeImg}" style="width:80px;border-radius:7px;cursor:pointer;flex-shrink:0;box-shadow:0 2px 8px rgba(0,0,0,0.5);"
                         onerror="this.src='${CARD_BACK_URL}'" onclick="ptViewCard('${safeImg}','${card.name}')" title="Klick zum Vergrößern">
                    <div style="flex:1;">
                        <div style="font-weight:700;font-size:12px;margin-bottom:4px;">${card.name}</div>
                        <div style="font-size:16px;font-weight:900;color:#ff6b6b;margin-bottom:6px;">💥 ${dmg} Schaden</div>
                        ${statusBtns}
                        <div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;">
                            <button onclick="addDamage('${opp}','${zoneId}',10);ptRenderOpponentPanel('${opp}','field')"  style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">+10</button>
                            <button onclick="addDamage('${opp}','${zoneId}',20);ptRenderOpponentPanel('${opp}','field')"  style="background:#e74c3c;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">+20</button>
                            <button onclick="addDamage('${opp}','${zoneId}',30);ptRenderOpponentPanel('${opp}','field')"  style="background:#e67e22;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">+30</button>
                            <button onclick="addDamage('${opp}','${zoneId}',50);ptRenderOpponentPanel('${opp}','field')"  style="background:#c0392b;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:12px;font-weight:700;cursor:pointer;">+50</button>
                            <button onclick="addDamage('${opp}','${zoneId}',100);ptRenderOpponentPanel('${opp}','field')" style="background:#922b21;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:12px;font-weight:700;cursor:pointer;">+100</button>
                            <button onclick="addDamage('${opp}','${zoneId}',-10);ptRenderOpponentPanel('${opp}','field')" style="background:#27ae60;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">-10</button>
                            <button onclick="clearDamage('${opp}','${zoneId}');ptRenderOpponentPanel('${opp}','field')"   style="background:#1a9e5b;color:#fff;border:none;border-radius:4px;padding:3px 8px;font-size:11px;cursor:pointer;">💚 Heal</button>
                        </div>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.08);">
                            <button onclick="ptOppDiscardZone('${opp}','${zoneId}')" style="background:#7d3c98;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:11px;cursor:pointer;" title="Zone → Discard">🗑️ KO / Discard</button>
                            ${zoneId !== 'active' ? `<button onclick="ptOppSetActive('${opp}','${zoneId}')" style="background:#1a5276;color:#fff;border:none;border-radius:4px;padding:3px 9px;font-size:11px;cursor:pointer;" title="Als Active setzen">⭐ Active setzen</button>` : ''}
                        </div>
                        ${attachedHTML ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-top:3px;">${attachedHTML}</div>` : ''}
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
                return `<div style="position:relative;cursor:pointer;" title="${c.name}" onclick="ptViewCard('${si}','${c.name}')">
                    <img src="${c.imageUrl || CARD_BACK_URL}" style="width:80px;border-radius:6px;display:block;" onerror="this.src='${CARD_BACK_URL}'">
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;font-size:8px;padding:2px 3px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
                </div>`;
            }).join('') + '</div>';

    } else if (tab === 'lostzone') {
        // ─ Lost zone (view-only, click to zoom)
        const lz = ptState[opp].lostzone || [];
        if (lz.length === 0) { el.innerHTML = '<div style="color:#aaa;text-align:center;padding:30px;">🌌 Lost Zone ist leer.</div>'; return; }
        el.innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">` +
            lz.map((c, i) => {
                const si = (c.imageUrl || CARD_BACK_URL).replace(/'/g, "\\'");
                return `<div style="position:relative;cursor:pointer;" title="${c.name}" onclick="ptViewCard('${si}','${c.name}')">
                    <img src="${c.imageUrl || CARD_BACK_URL}" style="width:80px;border-radius:6px;display:block;filter:grayscale(0.5);" onerror="this.src='${CARD_BACK_URL}'">
                    <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(80,0,80,0.8);color:#fff;font-size:8px;padding:2px 3px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
                </div>`;
            }).join('') + '</div>';
    }
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
        html += `<div style="position:relative;cursor:pointer;" title="${c.name}">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='${CARD_BACK_URL}'"
                 onclick="ptRouteFromDiscard('${player}',${i},'hand')"
                 ondblclick="ptViewCard(event,'${safeImg}')"
                 oncontextmenu="event.preventDefault();ptRouteFromDiscard('${player}',${i},'lost')">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
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
        return `<div style="position:relative;cursor:pointer;" title="${c.name}">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:6px;display:block;filter:grayscale(0.6);"
                 onerror="this.src='${CARD_BACK_URL}'"
                 onclick="ptTakeFromLostZone('${player}',${i})"
                 ondblclick="ptViewCard(event,'${safeImg}')">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(80,0,80,0.8);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
        </div>`;
    }).join('');
    document.getElementById('ptDiscardModal').style.display = 'flex';
}

// --- OPP PANEL ACTIONS ---

function ptOppDiscardZone(opp, zoneId) {
    const cards = ptState[opp].field[zoneId];
    if (!cards || cards.length === 0) return;
    const count = cards.length;
    // Move all cards in zone to opp discard
    while (cards.length > 0) {
        const c = cards.shift();
        ptState[opp].discard.push(c);
    }
    ptState[opp].damage[zoneId] = 0;
    ptLog(`🗑️ ${zoneId} (${opp}) → Discard (${count} Karten).`);
    ptRenderAll();
    ptRenderOpponentPanel(opp, 'field');
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
}

function ptRenderHand() {
    const zone = document.getElementById('ptHandZone');
    const cnt  = document.getElementById('ptHandCount');
    if (!zone) return;
    if (cnt) cnt.innerText = ptState[ptCurrentPlayer].hand.length;
    zone.innerHTML = '';

    ptState[ptCurrentPlayer].hand.forEach((card, i) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'pt-hand-wrapper';
        wrapper.draggable = true;
        wrapper.ondragstart = e => ptDragStartHand(e, i);

        const img = document.createElement('img');
        img.src       = card.imageUrl || CARD_BACK_URL;
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

        const discBtn = document.createElement('button');
        discBtn.className = 'pt-hand-disc-btn';
        discBtn.innerHTML = '🗑️';
        discBtn.title     = 'Discard';
        discBtn.onclick   = e => ptDiscardFromHand(i, e);

        wrapper.appendChild(img);
        wrapper.appendChild(discBtn);
        zone.appendChild(wrapper);
    });
}

function ptSelectHandCard(index) {
    ptSelectedCardIndex = (ptSelectedCardIndex === index) ? null : index;
    ptRenderHand();
}

function ptDiscardFromHand(index, event) {
    if (event) event.stopPropagation();
    const card = ptState[ptCurrentPlayer].hand.splice(index, 1)[0];
    ptState[ptCurrentPlayer].discard.push(card);
    ptSelectedCardIndex = null;
    ptLog(`Discarded "${card.name}" from hand.`);
    ptRenderAll();
}

function ptTakePrize(player, index) {
    const card = ptState[player].prizes.splice(index, 1)[0];
    ptState[ptCurrentPlayer].hand.push(card);
    ptLog('Took a prize card.');
    ptRenderAll();
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
             title="${card.name} (right-click to zoom)">
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
                      title="${card.name} (Doppelklick = Zoom)">`;
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
                      title="${card.name} (right-click to zoom)">`;
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
                          title="${card.name} (right-click to zoom)">`;
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

    // Damage badge — click +10 / shift+click −10
    const dmg = ptState[player].damage[zoneId];
    if (dmg > 0) {
        html += `<div class="pt-damage-badge"
            onclick="addDamage('${player}','${zoneId}',event.shiftKey?-10:10,event)"
            title="Klick +10 | Shift+Klick −10"
            style="z-index:40;cursor:pointer;pointer-events:auto;">${dmg}</div>`;
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

function ptToggleAbilityUsed(player, zoneId, event) {
    if (event) event.stopPropagation();
    if (!ptState[player].abilityUsed) ptState[player].abilityUsed = {};
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

function ptOpenCardMenu(event, player, zoneId) {
    ptCancelMenuClose();
    ptActiveMenuPlayer = player;
    ptActiveMenuZoneId = zoneId;
    const menu = document.getElementById('ptCardContextMenu');
    if (!menu) return;

    // Position menu centered above the hovered zone
    const rect      = event.currentTarget.getBoundingClientRect();
    const menuWidth = 178;
    const menuHeight = 112;
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
        return `<div style="position:relative;cursor:pointer;text-align:center;" title="${c.name}">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='${CARD_BACK_URL}'"
                 onclick="ptViewCard(event,'${safeImg}')">
            <div style="position:absolute;top:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#FFCB05;font-size:8px;font-weight:700;padding:2px 3px;border-radius:6px 6px 0 0;">${badge}</div>
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
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
    var rect = deckEl.getBoundingClientRect();
    popup.style.left = Math.min(Math.max(rect.left - 60, 8), window.innerWidth - 190) + 'px';
    popup.style.top = Math.max(rect.top - 280, 10) + 'px';
    document.body.appendChild(popup);
}

function ptCloseDeckPopup() {
    var popup = document.getElementById('ptDeckPopup');
    if (popup) popup.remove();
}

function ptInitMobileDeckTriggers() {
    if (window.innerWidth > 768) return;
    document.querySelectorAll('.pt-deck-pile').forEach(function(pile) {
        if (pile.dataset.mobileInit) return;
        pile.dataset.mobileInit = '1';
        var player = pile.closest('#p1-area') ? 'p1' : 'p2';
        var trigger = document.createElement('button');
        trigger.className = 'pt-btn-small pt-deck-popup-trigger';
        trigger.textContent = '\u22EE Deck Menu';
        trigger.onclick = function() { ptShowDeckPopup(player, pile); };
        pile.parentElement.appendChild(trigger);
    });
}
