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
let _ptMsgTimer = null;

// Globale Speicher für importierte Sandbox-Decks
let standaloneDecks = { p1: [], p2: [] };

function getInitialPlayerState() {
    return {
        deck: [], hand: [], discard: [], lostzone: [], prizes: [],
        field: { active: [], bench0: [], bench1: [], bench2: [], bench3: [], bench4: [] },
        damage: { active: 0, bench0: 0, bench1: 0, bench2: 0, bench3: 0, bench4: 0 },
        status: [],
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
    if (totalCards === 0) { alert('Dein Deck ist leer! Füge erst Karten hinzu.'); return; }
    if (totalCards < 60) {
        if (!confirm(`Dein Deck hat nur ${totalCards}/60 Karten. Trotzdem starten?`)) return;
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
            const cd = (typeof _simFindCard === 'function') ? _simFindCard(m[2], m[3]) : null;
            if (cd && cd.image_url) imageUrl = cd.image_url;
            if (cd) cardType = cd.type || cd.card_type || '';
        } else {
            const cd = window.allCardsDatabase && window.allCardsDatabase.find(c => c.name === cardName);
            if (cd && cd.image_url) imageUrl = cd.image_url;
            if (cd) cardType = cd.type || cd.card_type || '';
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
    if (confirm('Playtester wirklich verlassen? Der Spielfortschritt geht verloren.')) {
        document.getElementById('playtesterModal').style.display = 'none';
    }
}

// ============================================================================
// SANDBOX: DECK IMPORT AUS TCG LIVE FORMAT
// ============================================================================

async function parseSandboxDeck(player) {
    const inputEl  = document.getElementById(player === 'p1' ? 'sandboxImportP1' : 'sandboxImportP2');
    const statusEl = document.getElementById(player === 'p1' ? 'sandboxStatusP1' : 'sandboxStatusP2');
    const rawText  = inputEl.value;

    if (!rawText.trim()) {
        statusEl.innerText = 'Bitte Deck-Code einfügen!';
        statusEl.style.color = 'red';
        return;
    }

    statusEl.innerText = 'Lade Karten-Daten...';
    statusEl.style.color = '#007bff';

    // TCG Live Format: "4 Pikachu SVI 001" oder "4 Pikachu SVI 001 PH"
    const lineRegex = /^(\d+)\s+(.+?)\s+([A-Za-z0-9-]+)\s+(\d+[A-Za-z]?)(?:\s+.*)?$/;
    const lines = rawText.split('\n');
    const parsedDeck = [];
    let totalCards = 0;

    for (let line of lines) {
        line = line.trim();
        const match = line.match(lineRegex);
        if (!match) continue;

        const count      = parseInt(match[1]);
        const name       = match[2];
        const ptcgoCode  = match[3];
        const number     = match[4];

        // Basis-Energien haben keine stabilen Set-Codes in der API – nach Name suchen
        const q = name.includes('Energy') && !name.includes('Special')
            ? `name:"${name}"`
            : `set.ptcgoCode:"${ptcgoCode}" number:"${number}"`;

        let imageUrl = CARD_BACK_URL;
        let cardType = '';

        try {
            const response = await fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(q)}&select=id,name,supertype,images`);
            const data = await response.json();
            if (data.data && data.data.length > 0) {
                imageUrl = data.data[0].images.small;
                cardType = data.data[0].supertype || '';
            }
        } catch (e) {
            console.warn(`[Sandbox] Konnte ${name} nicht laden:`, e);
        }

        parsedDeck.push({ name, count, imageUrl, cardType });
        totalCards += count;
    }

    standaloneDecks[player] = parsedDeck;

    if (totalCards > 0) {
        statusEl.innerText = `${totalCards} / 60 Karten geladen ✅`;
        statusEl.style.color = 'green';
    } else {
        statusEl.innerText = 'Kein gültiges Format erkannt.';
        statusEl.style.color = 'red';
    }
}

function startStandalonePlaytester() {
    const p1Count = standaloneDecks.p1.reduce((s, c) => s + c.count, 0);
    const p2Count = standaloneDecks.p2.reduce((s, c) => s + c.count, 0);

    if (p1Count === 0 && p2Count === 0) {
        alert('Bitte importiere mindestens ein Deck für Spieler 1!');
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

function ptNewGame() {
    ['p1', 'p2'].forEach(p => {
        let allCards = [...ptState[p].deck, ...ptState[p].hand, ...ptState[p].discard,
                        ...(ptState[p].lostzone || []), ...ptState[p].prizes];
        Object.keys(ptState[p].field).forEach(z => allCards.push(...ptState[p].field[z]));
        ptState[p] = getInitialPlayerState();
        ptState[p].deck = allCards;
        for (let i = ptState[p].deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ptState[p].deck[i], ptState[p].deck[j]] = [ptState[p].deck[j], ptState[p].deck[i]];
        }
        for (let i = 0; i < 7; i++) if (ptState[p].deck.length > 0) ptState[p].hand.push(ptState[p].deck.pop());
        for (let i = 0; i < 6; i++) if (ptState[p].deck.length > 0) ptState[p].prizes.push(ptState[p].deck.pop());
    });

    ptState.stadium  = [];
    ptState.playZone = [];
    ptCurrentPlayer  = 'p1';
    ptActionLog      = [];

    const logContent = document.getElementById('ptActionLogContent');
    if (logContent) logContent.innerHTML = '';
    const board    = document.getElementById('playtester-board');
    if (board) board.style.transform = 'rotate(0deg)';
    const ind = document.getElementById('activePlayerIndicator');
    if (ind) ind.innerText = '1';
    const handZone = document.querySelector('.pt-hand-zone');
    if (handZone) handZone.style.borderTopColor = '#3B4CCA';

    ptLog('Neues Spiel gestartet! Nutze ⌨️ für Hotkeys.');
    ptRenderAll();
}

// --- HOTKEYS ---

function setupHotkeys() {
    if (document._ptHotkeyListener) document.removeEventListener('keydown', document._ptHotkeyListener);
    document._ptHotkeyListener = function(e) {
        const modal = document.getElementById('playtesterModal');
        if (!modal || modal.style.display === 'none') return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        switch (e.key.toLowerCase()) {
            case 'd': ptDraw1(); break;
            case 's': ptShuffle(); break;
            case 'c': ptFlipCoin(); break;
            case 'p': ptPassTurn(); break;
            case 'f': ptFlipBoard(); break;
            case '`': ptToggleLog(); break;
            case '/':
                e.preventDefault();
                const inp = document.getElementById('ptCommandInput');
                if (inp) inp.focus();
                break;
        }
    };
    document.addEventListener('keydown', document._ptHotkeyListener);
}

// --- VSTAR & GX MARKERS ---

function ptToggleMarker(type) {
    const p = ptCurrentPlayer;
    if (type === 'vstar') {
        ptState[p].vstarUsed = !ptState[p].vstarUsed;
        ptLog(`VSTAR Power ${ptState[p].vstarUsed ? 'eingesetzt' : 'zurückgesetzt'}.`);
    } else {
        ptState[p].gxUsed = !ptState[p].gxUsed;
        ptLog(`GX Attacke ${ptState[p].gxUsed ? 'eingesetzt' : 'zurückgesetzt'}.`);
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

// --- COMMAND INPUT ---

function ptRunCommand() {
    const inp = document.getElementById('ptCommandInput');
    if (!inp) return;
    const raw = inp.value.trim();
    inp.value = '';
    inp.blur();
    if (!raw) return;

    const parts = raw.replace(/^\//, '').split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const n   = parseInt(parts[1]) || 1;
    const p   = ptCurrentPlayer;

    if (cmd === 'draw' || cmd === 'd') {
        let drawn = 0;
        for (let i = 0; i < n; i++) if (ptState[p].deck.length > 0) { ptState[p].hand.push(ptState[p].deck.pop()); drawn++; }
        ptLog(`${drawn} Karte(n) gezogen.`);
        ptRenderAll();
    } else if (cmd === 'mill' || cmd === 'm') {
        let milled = 0;
        for (let i = 0; i < n; i++) if (ptState[p].deck.length > 0) { ptState[p].discard.push(ptState[p].deck.pop()); milled++; }
        ptLog(`${milled} Karte(n) gemillt.`);
        ptRenderAll();
    } else if (cmd === 'top' || cmd === 't') {
        ptOpenTopCards(n);
    } else if (cmd === 'coin') {
        let results = [];
        for (let i = 0; i < n; i++) results.push(Math.random() >= 0.5 ? 'KOPF' : 'ZAHL');
        const heads = results.filter(r => r === 'KOPF').length;
        ptLog(`🪙 ${n}x Münze: ${heads}x KOPF.`);
    } else if (cmd === 'dice') {
        const roll = Math.floor(Math.random() * 6) + 1;
        ptLog(`🎲 Würfelwurf: ${roll}`);
    } else {
        ptShowMessage('Unbekannt! Teste: /draw 3, /top 5, /mill 2');
    }
}

// --- TOP DECK CONTROL ---

function ptOpenTopCards(num) {
    const p    = ptCurrentPlayer;
    const take = Math.min(num || 5, ptState[p].deck.length);
    if (take === 0) { ptShowMessage('Deck ist leer!'); return; }
    ptLookingAt = ptState[p].deck.splice(ptState[p].deck.length - take, take).reverse();
    ptLog(`Schaut sich die obersten ${take} Karten an.`);
    ptRenderTopCards();
    document.getElementById('ptTopCardsModal').style.display = 'flex';
}

function ptRenderTopCards() {
    const grid = document.getElementById('ptTopCardsGrid');
    if (!grid) return;
    grid.innerHTML = ptLookingAt.map((c, i) => {
        const safeImg = (c.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, \"\\'\");
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
                <button class="pt-action-btn" onclick="ptRouteTopCard(${i},'bottom')">⏬ Unten</button>
                <button class="pt-action-btn red" onclick="ptRouteTopCard(${i},'discard')">🗑️ Ablage</button>
            </div>
        </div>`;
    }).join('');
}

function ptRouteTopCard(index, destination) {
    const p    = ptCurrentPlayer;
    const card = ptLookingAt.splice(index, 1)[0];
    if (!card) return;
    if (destination === 'hand')         { ptState[p].hand.push(card);     ptLog(`Nimmt "${card.name}" auf die Hand.`); }
    else if (destination === 'bottom')  { ptState[p].deck.unshift(card);  ptLog(`Legt "${card.name}" unters Deck.`); }
    else if (destination === 'discard') { ptState[p].discard.push(card);  ptLog(`Wirft "${card.name}" in die Ablage.`); }
    else if (destination === 'lost')    { ptState[p].lostzone.push(card); ptLog(`Schickt "${card.name}" in die Lost Zone.`); }
    if (ptLookingAt.length === 0) {
        ptCloseTopCards();
    } else {
        ptRenderTopCards();
        ptRenderAll();
    }
}

function ptCloseTopCards() {
    while (ptLookingAt.length > 0) ptState[ptCurrentPlayer].deck.push(ptLookingAt.pop());
    document.getElementById('ptTopCardsModal').style.display = 'none';
    ptRenderAll();
}

// --- BASIC ACTIONS ---

function ptDraw1(playerOverride) {
    const p = playerOverride || ptCurrentPlayer;
    if (ptState[p].deck.length > 0) {
        ptState[p].hand.push(ptState[p].deck.pop());
        ptRenderAll();
        ptLog('Zieht eine Karte.');
    } else {
        ptShowMessage('Deck ist leer!');
    }
}

function ptShuffle() {
    const deck = ptState[ptCurrentPlayer].deck;
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    ptLog('Deck gemischt!');
    ptRenderAll();
}

function ptFlipCoin() {
    const result = Math.random() >= 0.5 ? 'KOPF!' : 'ZAHL!';
    ptLog(`🪙 Münzwurf: ${result}`);
}

function ptFlipBoard() {
    const board    = document.getElementById('playtester-board');
    const handZone = document.querySelector('.pt-hand-zone');
    const ind      = document.getElementById('activePlayerIndicator');
    if (!board) return;
    if (ptCurrentPlayer === 'p1') {
        board.style.transform = 'rotate(180deg)';
        ptCurrentPlayer = 'p2';
        if (ind)      ind.innerText = '2';
        if (handZone) handZone.style.borderTopColor = '#E3350D';
        ptLog('Board gedreht. P2 ist dran.');
    } else {
        board.style.transform = 'rotate(0deg)';
        ptCurrentPlayer = 'p1';
        if (ind)      ind.innerText = '1';
        if (handZone) handZone.style.borderTopColor = '#3B4CCA';
        ptLog('Board gedreht. P1 ist dran.');
    }
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
        ptLog(`Status-Schaden: +${dmg} DMG.`);
    }
    ptLog('Beendet den Zug.');
    ptFlipBoard();
    ptDraw1();
}

// --- DECK SEARCH ---

function _ptRefreshDeckSearchGrid() {
    const grid = document.getElementById('ptDeckSearchGrid');
    if (!grid) return;
    grid.innerHTML = '';
    [...ptState[ptCurrentPlayer].deck].sort((a, b) => a.name.localeCompare(b.name)).forEach(card => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;cursor:pointer;';
        wrap.title = card.name;

        const img = document.createElement('img');
        img.src = card.imageUrl || CARD_BACK_URL;
        img.className = 'pt-field-card';
        img.style.width = '100px';
        img.onerror = function() { this.src = CARD_BACK_URL; };
        img.onclick = () => ptRouteFromDeck(card.ptId, 'hand');
        img.oncontextmenu = e => { e.preventDefault(); ptRouteFromDeck(card.ptId, 'lost'); };

        const lbl = document.createElement('div');
        lbl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 4px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
        lbl.textContent = card.name;

        wrap.appendChild(img);
        wrap.appendChild(lbl);
        grid.appendChild(wrap);
    });
}

function ptOpenDeckSearch() {
    _ptRefreshDeckSearchGrid();
    document.getElementById('ptDeckSearchModal').style.display = 'flex';
}

function ptRouteFromDeck(cardId, destination) {
    const p   = ptCurrentPlayer;
    const idx = ptState[p].deck.findIndex(c => c.ptId === cardId);
    if (idx > -1) {
        const card = ptState[p].deck.splice(idx, 1)[0];
        if (destination === 'hand') {
            ptState[p].hand.push(card);
            ptLog(`Sucht "${card.name}" auf die Hand.`);
        } else {
            ptState[p].lostzone.push(card);
            ptLog(`Schickt "${card.name}" aus dem Deck in die Lost Zone.`);
        }
        // Refresh the grid so the taken card disappears — modal stays open
        _ptRefreshDeckSearchGrid();
        ptRenderAll();
    }
}

function ptCloseDeckSearch() {
    document.getElementById('ptDeckSearchModal').style.display = 'none';
    ptShuffle(); // Deck mischen erst wenn der Spieler fertig gesucht hat
}

// --- ZONE INTERACTION ---

function ptClickZone(player, zoneId) {
    if (ptSelectedCardIndex === null) return;
    const card = ptState[ptCurrentPlayer].hand[ptSelectedCardIndex];
    if (!card) return;

    if (zoneId === 'playzone') {
        ptState.playZone.push(card);
        ptLog(`Spielt Item/Supporter: "${card.name}".`);
    } else if (zoneId === 'stadium') {
        if (ptState.stadium.length > 0) ptState[ptCurrentPlayer].discard.push(ptState.stadium.pop());
        ptState.stadium.push(card);
        ptLog(`Spielt Stadion: "${card.name}".`);
    } else {
        ptState[player].field[zoneId].push(card);
        ptLog(`Legt "${card.name}" auf ${player} ${zoneId}.`);
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
        ptLog(`Tauscht Positionen: ${src.zone} ↔ ${tgt.zone}`);
    } else {
        ptState[tgt.player].field[tgt.zone]  = [...ptState[src.player].field[src.zone]];
        ptState[tgt.player].damage[tgt.zone] = ptState[src.player].damage[src.zone];
        ptState[src.player].field[src.zone]  = [];
        ptState[src.player].damage[src.zone] = 0;
        ptLog(`Verschiebt Pokémon nach ${tgt.zone}.`);
    }
    if (src.zone === 'active') ptState[src.player].status = [];
    if (tgt.zone === 'active') ptState[tgt.player].status = [];
    ptRenderAll();
}

// --- DRAG & DROP ---

function setupDragAndDrop() {
    if (document._ptDragOver)    document.removeEventListener('dragover',  document._ptDragOver);
    if (document._ptDropHandler) document.removeEventListener('drop',      document._ptDropHandler);

    document._ptDragOver = e => e.preventDefault();
    document._ptDropHandler = function(e) {
        e.preventDefault();
        const sourceZone = e.dataTransfer.getData('sourceZone');
        const handIndex  = e.dataTransfer.getData('text/plain');
        const targetEl   = e.target.closest('[id^="ptActiveZone-"],[id^="ptBench"],[id="ptStadiumZone"],[id="ptPlayZone"]');
        if (!targetEl) return;
        const targetId = targetEl.id;

        if (sourceZone) { moveZoneToZone(sourceZone, targetId); return; }

        if (handIndex !== '') {
            ptSelectedCardIndex = parseInt(handIndex);
            if (targetId === 'ptStadiumZone')           ptClickZone(ptCurrentPlayer, 'stadium');
            else if (targetId === 'ptPlayZone')         ptClickZone(ptCurrentPlayer, 'playzone');
            else if (targetId.startsWith('ptActiveZone-')) ptClickZone(targetId.endsWith('p1') ? 'p1' : 'p2', 'active');
            else if (targetId.startsWith('ptBench')) {
                const player = targetId.endsWith('-p1') ? 'p1' : 'p2';
                const zone   = 'bench' + targetId.match(/ptBench(\d)/)[1];
                ptClickZone(player, zone);
            }
        }
    };
    document.addEventListener('dragover', document._ptDragOver);
    document.addEventListener('drop',     document._ptDropHandler);
}

function ptDragStartHand(event, index) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    event.dataTransfer.setData('sourceZone', '');
    ptSelectedCardIndex = index;
    ptRenderHand();
}

function ptDragStartField(event, elementId) {
    event.dataTransfer.setData('sourceZone', elementId);
    event.dataTransfer.setData('text/plain', '');
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
    ptLog('Rückzug!');
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
        ptLog(`Nimmt "${c.name}" auf die Hand.`);
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
        ptLog(`Wirft "${c.name}" in die Ablage.`);
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
        ptLog(`Schickt "${c.name}" in die Lost Zone.`);
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
    ptLog(`+${amount} Schaden auf ${zoneId}.`);
    ptRenderAll();
}

function clearDamage(player, zoneId, event) {
    if (event) event.stopPropagation();
    ptState[player].damage[zoneId] = 0;
    ptLog(`Pokémon auf ${zoneId} geheilt.`);
    ptRenderAll();
}

function toggleStatus(player, statusType, event) {
    if (event) event.stopPropagation();
    const idx = ptState[player].status.indexOf(statusType);
    if (idx > -1) ptState[player].status.splice(idx, 1);
    else ptState[player].status.push(statusType);
    ptLog(`Status "${statusType}" aktualisiert.`);
    ptRenderAll();
}

// --- DISCARD / LOST ZONE MODALS ---

function ptOpenDiscard(player) {
    const title = document.getElementById('ptDiscardModalTitle');
    if (title) title.textContent = `🗑️ Ablage (${player.toUpperCase()}) – Klick=Hand | Rechtsklick=Lost Zone`;
    const grid = document.getElementById('ptDiscardGrid');
    if (!grid) return;
    if (ptState[player].discard.length === 0) { ptShowMessage('Ablage ist leer.'); return; }
    grid.innerHTML = ptState[player].discard.map((c, i) => {
        const safeImg  = (c.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, \"\\'\");
        const safeName = (c.name     || '').replace(/\\/g, '\\\\').replace(/'/g, \"\\'\");
        return `<div style="position:relative;cursor:pointer;" title="${c.name}">
            <img src="${c.imageUrl || CARD_BACK_URL}" style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='${CARD_BACK_URL}'"
                 onclick="ptRouteFromDiscard('${player}',${i},'hand')"
                 ondblclick="ptViewCard(event,'${safeImg}')"
                 oncontextmenu="event.preventDefault();ptRouteFromDiscard('${player}',${i},'lost')">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
        </div>`;
    }).join('');
    document.getElementById('ptDiscardModal').style.display = 'flex';
}

function ptOpenLostZone(player) {
    const lz = ptState[player].lostzone || [];
    if (lz.length === 0) { ptShowMessage('Lost Zone ist leer.'); return; }
    const title = document.getElementById('ptDiscardModalTitle');
    if (title) title.textContent = `🌌 Lost Zone (${player.toUpperCase()}) – Klick = Hand zurückholen`;
    const grid = document.getElementById('ptDiscardGrid');
    if (!grid) return;
    grid.innerHTML = lz.map((c, i) => {
        const safeImg  = (c.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, \"\\'\");
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

function ptRouteFromDiscard(player, index, destination) {
    const c = ptState[player].discard.splice(index, 1)[0];
    if (destination === 'hand') {
        ptState[ptCurrentPlayer].hand.push(c);
        ptLog(`Holt "${c.name}" aus der Ablage auf die Hand.`);
    } else {
        ptState[ptCurrentPlayer].lostzone.push(c);
        ptLog(`Schickt "${c.name}" aus der Ablage in die Lost Zone.`);
    }
    ptCloseDiscardModal();
    ptRenderAll();
}

function ptTakeFromLostZone(player, index) {
    const c = ptState[player].lostzone.splice(index, 1)[0];
    ptState[ptCurrentPlayer].hand.push(c);
    ptCloseDiscardModal();
    ptLog(`Holt "${c.name}" aus der Lost Zone zurück.`);
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

        const pileEl = document.getElementById(`ptDiscardPile-${p}`);
        if (pileEl) {
            if (ptState[p].discard.length > 0) {
                const top = ptState[p].discard[ptState[p].discard.length - 1];
                pileEl.innerHTML = `<img src="${top.imageUrl || CARD_BACK_URL}" class="pt-field-card"
                    style="width:62px;cursor:pointer;" onerror="this.src='${CARD_BACK_URL}'"
                    onclick="ptOpenDiscard('${p}')" title="Ablage – ${ptState[p].discard.length} Karten">`;
            } else {
                pileEl.innerHTML = `<div class="pt-empty-slot" style="width:62px;height:87px;font-size:10px;cursor:pointer;"
                    onclick="ptOpenDiscard('${p}')">Ablage</div>`;
            }
        }

        const lostPileEl = document.getElementById(`ptLostPile-${p}`);
        if (lostPileEl) {
            if (ptState[p].lostzone.length > 0) {
                const top = ptState[p].lostzone[ptState[p].lostzone.length - 1];
                lostPileEl.innerHTML = `<img src="${top.imageUrl || CARD_BACK_URL}" class="pt-field-card"
                    style="width:40px;cursor:pointer;filter:grayscale(0.6);"
                    onerror="this.src='${CARD_BACK_URL}'"
                    onclick="ptOpenLostZone('${p}')" title="Lost Zone – ${ptState[p].lostzone.length} Karten">`;
            } else {
                lostPileEl.innerHTML = `<div class="pt-empty-slot" style="font-size:16px;" onclick="ptOpenLostZone('${p}')">🌀</div>`;
            }
        }

        const prizeEl = document.getElementById(`ptPrizeZone-${p}`);
        if (prizeEl) {
            prizeEl.innerHTML = ptState[p].prizes.map((c, i) =>
                `<img src="${CARD_BACK_URL}" class="pt-prize-card"
                      title="Preiskarte nehmen" onclick="ptTakePrize('${p}', ${i})">`
            ).join('');
        }

        const activeEl = document.getElementById(`ptActiveZone-${p}`);
        if (activeEl) activeEl.innerHTML = generateZoneHTML(p, 'active', 'Active', `ptActiveZone-${p}`);
        for (let i = 0; i < 5; i++) {
            const benchEl = document.getElementById(`ptBench${i}-${p}`);
            if (benchEl) benchEl.innerHTML = generateZoneHTML(p, `bench${i}`, `Bank ${i + 1}`, `ptBench${i}-${p}`);
        }
    });

    const stadiumEl = document.getElementById('ptStadiumZone');
    if (stadiumEl) stadiumEl.innerHTML = generateNeutralZone('stadium', 'Stadion');
    const playEl = document.getElementById('ptPlayZone');
    if (playEl) playEl.innerHTML = generateNeutralZone('playzone', 'Drop');

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
        img.onerror   = function() { this.src = CARD_BACK_URL; };
        img.onclick   = () => ptSelectHandCard(i);
        img.ondblclick = () => ptViewCard(card.imageUrl, card.name);

        const discBtn = document.createElement('button');
        discBtn.className = 'pt-hand-disc-btn';
        discBtn.innerHTML = '🗑️';
        discBtn.title     = 'Ablegen';
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
    ptLog(`Legt "${card.name}" von Hand auf Ablage.`);
    ptRenderAll();
}

function ptTakePrize(player, index) {
    const card = ptState[player].prizes.splice(index, 1)[0];
    ptState[ptCurrentPlayer].hand.push(card);
    ptLog('Nimmt Preiskarte.');
    ptRenderAll();
}

// --- NEUTRAL ZONE RENDER ---

function generateNeutralZone(zoneId, labelText) {
    const cards = zoneId === 'stadium' ? ptState.stadium : ptState.playZone;
    if (cards.length === 0) {
        const isTarget = ptSelectedCardIndex !== null;
        return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                     style="width:82px;height:114px;"
                     onclick="ptClickZone('${ptCurrentPlayer}','${zoneId}')">${labelText}</div>`;
    }
    const card = cards[cards.length - 1];
    const safeImg = (card.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, \"\\'\");
    return `<div style="position:relative;width:82px;cursor:pointer;"
                 onclick="ptClickZone('${ptCurrentPlayer}','${zoneId}')">
        <img src="${card.imageUrl || CARD_BACK_URL}" class="pt-field-card"
             style="width:82px;border-radius:7px;display:block;"
             onerror="this.src='${CARD_BACK_URL}'"
             ondblclick="ptViewCard(event,'${safeImg}')" title="${card.name}">
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
                     onclick="ptClickZone('${player}','${zoneId}')">${labelText}</div>`;
    }

    let html = `<div style="position:relative;width:${width}px;cursor:pointer;min-height:${height}px;"
                     onclick="ptClickZone('${player}','${zoneId}')"
                     draggable="true" ondragstart="ptDragStartField(event,'${elementId}')">`;
    let energyCount = 0;
    let toolCount   = 0;

    cards.forEach((card, index) => {
        const safeImg = (card.imageUrl || CARD_BACK_URL).replace(/\\/g, '\\\\').replace(/'/g, \"\\'\");
        if (index === 0) {
            html += `<img src="${card.imageUrl || CARD_BACK_URL}" class="pt-field-card"
                          style="position:relative;z-index:10;width:${width}px;border-radius:7px;display:block;"
                          onerror="this.src='${CARD_BACK_URL}'"
                          ondblclick="ptViewCard(event,'${safeImg}')" title="${card.name}">`;
        } else {
            const isEnergy = (card.cardType || '').toLowerCase().includes('energy') || (card.supertype || '') === 'Energy';
            if (!isEnergy) {
                html += `<img src="${card.imageUrl || CARD_BACK_URL}" class="pt-attachment-tool"
                              style="bottom:${30 + toolCount * 10}px;"
                              onerror="this.src='${CARD_BACK_URL}'"
                              ondblclick="ptViewCard(event,'${safeImg}')" title="${card.name}">`;
                toolCount++;
            } else {
                html += `<img src="${card.imageUrl || CARD_BACK_URL}" class="pt-attachment-energy"
                              style="bottom:${8 + energyCount * 24}px;"
                              onerror="this.src='${CARD_BACK_URL}'"
                              ondblclick="ptViewCard(event,'${safeImg}')" title="${card.name}">`;
                energyCount++;
            }
        }
    });

    let statusBtns = '';
    let statusIconsHTML = '';
    if (zoneId === 'active') {
        const stat = ptState[player].status;
        const s = t => stat.includes(t) ? ' red' : '';
        statusBtns = `
            <div style="display:flex;gap:2px;justify-content:center;margin-bottom:2px;flex-wrap:wrap;">
                <button class="pt-action-btn${s('poisoned')}"  onclick="toggleStatus('${player}','poisoned',event)"  title="Vergiftet">☠️</button>
                <button class="pt-action-btn${s('burned')}"    onclick="toggleStatus('${player}','burned',event)"    title="Verbrannt">🔥</button>
                <button class="pt-action-btn${s('asleep')}"    onclick="toggleStatus('${player}','asleep',event)"    title="Schlaf">💤</button>
                <button class="pt-action-btn${s('paralyzed')}" onclick="toggleStatus('${player}','paralyzed',event)" title="Paralyse">⚡</button>
                <button class="pt-action-btn${s('confused')}"  onclick="toggleStatus('${player}','confused',event)"  title="Verwirrt">💫</button>
            </div>`;
        if (stat.length > 0) {
            statusIconsHTML = `<div style="position:absolute;bottom:-10px;right:5px;
                background:rgba(0,0,0,0.8);color:#fff;padding:2px 5px;
                border-radius:4px;font-size:11px;z-index:99;">${stat.join(' ')}</div>`;
        }
    }

    const retreatBtn = (zoneId !== 'active')
        ? `<button class="pt-action-btn" onclick="ptSwapZones('${player}','${zoneId}',event)" title="Rückzug">🔄</button>`
        : '';

    html += `
        <div class="pt-field-actions" style="z-index:100;flex-direction:column;">
            ${statusBtns}
            <div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;">
                <button class="pt-action-btn" onclick="addDamage('${player}','${zoneId}',10,event)">+10</button>
                <button class="pt-action-btn" onclick="addDamage('${player}','${zoneId}',50,event)">+50</button>
                <button class="pt-action-btn" onclick="clearDamage('${player}','${zoneId}',event)">0</button>
                ${retreatBtn}
                <button class="pt-action-btn" onclick="moveToLostZone('${player}','${zoneId}',event)">🌌</button>
                <button class="pt-action-btn" onclick="returnToHand('${player}','${zoneId}',event)">⬆️</button>
                <button class="pt-action-btn red" onclick="discardTopCard('${player}','${zoneId}',event)">🗑️</button>
            </div>
        </div>`;

    html += statusIconsHTML;
    const dmg = ptState[player].damage[zoneId];
    if (dmg > 0) html += `<div class="pt-damage-badge">${dmg}</div>`;
    html += '</div>';
    return html;
}
