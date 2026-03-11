/**
 * ============================================================================
 * POKEMON TCG GOLDFISHING PLAYTESTER - 2-PLAYER SANDBOX (v3 Ultimate)
 * ============================================================================
 */

// --- STATE ---
let ptState = { p1: null, p2: null, stadium: [], playZone: [] };
let ptCurrentPlayer = 'p1';
let ptSelectedCardIndex = null;
let _ptMsgTimer = null;
let ptActionLog = [];
let ptLookingAt = [];   // cards currently shown in top-deck control

function getInitialPlayerState() {
    return {
        deck:    [],
        hand:    [],
        discard: [],
        prizes:  [],
        lostzone: [],
        field:   { active: [], bench0: [], bench1: [], bench2: [], bench3: [], bench4: [] },
        damage:  { active: 0,  bench0: 0,  bench1: 0,  bench2: 0,  bench3: 0,  bench4: 0 },
        status:  [],
        vstarUsed: false,
        gxUsed:    false
    };
}

// --- ACTION LOG ---

function ptLog(msg, player) {
    const entry = { msg, player: player || 'neutral', time: new Date().toLocaleTimeString('de', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
    ptActionLog.unshift(entry);
    if (ptActionLog.length > 100) ptActionLog.pop();
    const panel = document.getElementById('ptActionLogPanel');
    if (panel && panel.style.display !== 'none') ptRefreshLog();
}

function ptRefreshLog() {
    const panel = document.getElementById('ptActionLogPanel');
    if (!panel) return;
    panel.innerHTML = ptActionLog.map(e =>
        `<div class="pt-log-entry pt-log-${e.player}"><span style="opacity:0.6;font-size:10px;">${e.time}</span> ${e.msg}</div>`
    ).join('');
}

function ptToggleLog() {
    const panel = document.getElementById('ptActionLogPanel');
    if (!panel) return;
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        ptRefreshLog();
    } else {
        panel.style.display = 'none';
    }
}

// --- INITIALIZATION ---

function openPlaytester(source) {
    const deckObj = source === 'cityLeague'  ? (window.cityLeagueDeck  || {})
                  : source === 'currentMeta' ? (window.currentMetaDeck || {})
                  : source === 'pastMeta'    ? (window.pastMetaDeck    || {})
                  : {};
    const totalCards = Object.values(deckObj).reduce((s, c) => s + c, 0);
    if (totalCards === 0) { alert('Dein Deck ist leer! Fuege erst Karten hinzu.'); return; }
    if (totalCards < 60) {
        if (!confirm(`Dein Deck hat nur ${totalCards}/60 Karten. Trotzdem starten?`)) return;
    }

    const baseCards = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
        if (!count || count <= 0) continue;
        let cardName = deckKey;
        let imageUrl = 'https://images.pokemontcg.io/card-back.png';
        let cardType = '';
        const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        if (m) {
            cardName = m[1];
            const cd = (typeof _simFindCard === 'function') ? _simFindCard(m[2], m[3]) : null;
            if (cd && cd.image_url) imageUrl = cd.image_url;
            if (cd) cardType = cd.type || cd.card_type || '';
        } else {
            const cd = window.allCardsDatabase &&
                       window.allCardsDatabase.find(c => c.name === cardName);
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
    _setupHotkeys();
}

function closePlaytester() {
    if (confirm('Playtester wirklich verlassen? Der Spielfortschritt geht verloren.')) {
        document.getElementById('playtesterModal').style.display = 'none';
        document.getElementById('ptActionLogPanel').style.display = 'none';
    }
}

function ptNewGame() {
    ['p1', 'p2'].forEach(p => {
        let allCards = [...ptState[p].deck, ...ptState[p].hand, ...ptState[p].discard, ...ptState[p].prizes, ...(ptState[p].lostzone || [])];
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

    const board = document.getElementById('playtester-board');
    if (board) board.style.transform = 'rotate(0deg)';
    const ind = document.getElementById('activePlayerIndicator');
    if (ind) ind.innerText = '1';
    const handZone = document.querySelector('.pt-hand-zone');
    if (handZone) handZone.style.borderTopColor = '#3B4CCA';

    ptUpdateMarkerUI();
    ptLog('Neues Spiel gestartet!', 'neutral');
    ptShowMessage('2-Spieler Spiel gestartet!');
    ptRenderAll();
}

// --- HOTKEYS ---

function _setupHotkeys() {
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

// --- COMMAND PARSER ---

function ptRunCommand() {
    const inp = document.getElementById('ptCommandInput');
    if (!inp) return;
    const raw = inp.value.trim();
    inp.value = '';
    if (!raw) return;

    const parts = raw.replace(/^\//, '').split(/\s+/);
    const cmd   = parts[0].toLowerCase();
    const n     = parseInt(parts[1]) || 1;
    const p     = ptCurrentPlayer;

    if (cmd === 'draw') {
        let drawn = 0;
        for (let i = 0; i < n; i++) {
            if (ptState[p].deck.length > 0) { ptState[p].hand.push(ptState[p].deck.pop()); drawn++; }
        }
        ptLog(`${p.toUpperCase()} zieht ${drawn} Karte(n).`, p);
        ptShowMessage(`${drawn} Karte(n) gezogen.`);
        ptRenderAll();
    } else if (cmd === 'mill') {
        let milled = 0;
        for (let i = 0; i < n; i++) {
            if (ptState[p].deck.length > 0) { ptState[p].discard.push(ptState[p].deck.pop()); milled++; }
        }
        ptLog(`${p.toUpperCase()} millt ${milled} Karte(n).`, p);
        ptShowMessage(`${milled} Karte(n) gemillt.`);
        ptRenderAll();
    } else if (cmd === 'top') {
        ptOpenTopCards(n);
    } else if (cmd === 'coin') {
        let results = [];
        for (let i = 0; i < n; i++) results.push(Math.random() >= 0.5 ? 'KOPF' : 'ZAHL');
        const heads = results.filter(r => r === 'KOPF').length;
        const msg = `${n}x Muenze: ${heads}x KOPF, ${n - heads}x ZAHL`;
        ptLog(msg, 'neutral');
        ptShowMessage(msg);
    } else if (cmd === 'dice') {
        const result = Math.floor(Math.random() * 6) + 1;
        const msg = `Wuerfel: ${result}`;
        ptLog(msg, 'neutral');
        ptShowMessage(msg);
    } else {
        ptShowMessage('Unbekannter Befehl.');
    }
}

// --- VSTAR / GX MARKERS ---

function ptToggleMarker(type) {
    const p = ptCurrentPlayer;
    if (type === 'vstar') {
        ptState[p].vstarUsed = !ptState[p].vstarUsed;
        const status = ptState[p].vstarUsed ? 'benutzt' : 'zurueckgesetzt';
        ptLog(`${p.toUpperCase()} VSTAR Power ${status}.`, p);
        ptShowMessage(`VSTAR ${ptState[p].vstarUsed ? 'Benutzt' : 'Zurueckgesetzt'}`);
    } else if (type === 'gx') {
        ptState[p].gxUsed = !ptState[p].gxUsed;
        const status = ptState[p].gxUsed ? 'benutzt' : 'zurueckgesetzt';
        ptLog(`${p.toUpperCase()} GX Attacke ${status}.`, p);
        ptShowMessage(`GX ${ptState[p].gxUsed ? 'Benutzt' : 'Zurueckgesetzt'}`);
    }
    ptUpdateMarkerUI();
}

function ptUpdateMarkerUI() {
    const p = ptCurrentPlayer;
    const vBtn = document.getElementById('ptVstarMarker');
    const gBtn = document.getElementById('ptGxMarker');
    if (vBtn) vBtn.classList.toggle('used', !!(ptState[p] && ptState[p].vstarUsed));
    if (gBtn) gBtn.classList.toggle('used', !!(ptState[p] && ptState[p].gxUsed));
}

// --- BASIC ACTIONS ---

function ptDraw1(playerOverride) {
    const p = playerOverride || ptCurrentPlayer;
    if (ptState[p].deck.length > 0) {
        ptState[p].hand.push(ptState[p].deck.pop());
        ptRenderAll();
        ptLog(`${p.toUpperCase()} zieht 1 Karte.`, p);
        ptShowMessage(`Spieler ${p === 'p1' ? '1' : '2'} zieht eine Karte.`);
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
    ptLog(`${ptCurrentPlayer.toUpperCase()} mischt Deck.`, ptCurrentPlayer);
    ptShowMessage('Deck gemischt!');
    ptRenderAll();
}

function ptFlipCoin() {
    const result = Math.random() >= 0.5 ? 'KOPF!' : 'ZAHL!';
    ptLog(result, 'neutral');
    ptShowMessage(result);
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
        ptLog('Spieler 2 ist dran.', 'neutral');
        ptShowMessage('Spieler 2 ist dran');
    } else {
        board.style.transform = 'rotate(0deg)';
        ptCurrentPlayer = 'p1';
        if (ind)      ind.innerText = '1';
        if (handZone) handZone.style.borderTopColor = '#3B4CCA';
        ptLog('Spieler 1 ist dran.', 'neutral');
        ptShowMessage('Spieler 1 ist dran');
    }
    ptUpdateMarkerUI();
    ptRenderHand();
}

function ptPassTurn() {
    const p = ptCurrentPlayer;
    let dmg = 0;
    if (ptState[p].status.includes('poisoned')) dmg += 10;
    if (ptState[p].status.includes('burned'))   dmg += 20;
    if (dmg > 0) {
        ptState[p].damage.active += dmg;
        ptLog(`${p.toUpperCase()} Status-Schaden: +${dmg} DMG.`, p);
        ptShowMessage(`Status-Schaden: ${dmg} DMG!`);
    }
    ptFlipBoard();
    ptDraw1();
}

// --- CARD ZOOM ---

function ptViewCard(imageUrl, name) {
    const viewer = document.getElementById('ptCardViewer');
    const img    = document.getElementById('ptCardViewerImg');
    const lbl    = document.getElementById('ptCardViewerName');
    if (!viewer || !img) return;
    img.src = imageUrl || 'https://images.pokemontcg.io/card-back.png';
    if (lbl) lbl.textContent = name || '';
    viewer.style.display = 'flex';
}

// --- TOP DECK CONTROL ---

function ptOpenTopCards(n) {
    const p = ptCurrentPlayer;
    const count = Math.min(n || 5, ptState[p].deck.length);
    if (count === 0) { ptShowMessage('Deck ist leer!'); return; }
    // Take top N cards off deck (deck[last] = top)
    ptLookingAt = ptState[p].deck.splice(ptState[p].deck.length - count, count).reverse();
    ptRenderTopCards();
    document.getElementById('ptTopCardsModal').style.display = 'flex';
}

function ptRenderTopCards() {
    const container = document.getElementById('ptTopCardsContent');
    if (!container) return;
    container.innerHTML = '';
    ptLookingAt.forEach((card, idx) => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:10px;background:rgba(255,255,255,0.05);border-radius:8px;padding:8px;';

        const safeImg  = (card.imageUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeName = (card.name     || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

        row.innerHTML = `
            <span style="color:#aaa;font-size:11px;width:16px;text-align:right;">${idx + 1}</span>
            <img src="${card.imageUrl || 'https://images.pokemontcg.io/card-back.png'}"
                 style="width:50px;border-radius:4px;cursor:pointer;"
                 onerror="this.src='https://images.pokemontcg.io/card-back.png'"
                 onclick="ptViewCard('${safeImg}','${safeName}')"
                 title="${card.name || ''}">
            <span style="color:#fff;flex:1;font-size:12px;">${card.name || ''}</span>
            <div style="display:flex;gap:4px;flex-wrap:wrap;">
                <button class="pt-btn" style="font-size:10px;padding:3px 6px;" onclick="ptRouteTopCard(${idx},'hand')">Hand</button>
                <button class="pt-btn" style="font-size:10px;padding:3px 6px;background:#555;" onclick="ptRouteTopCard(${idx},'bottom')">Boden</button>
                <button class="pt-btn pt-danger" style="font-size:10px;padding:3px 6px;" onclick="ptRouteTopCard(${idx},'discard')">Ablage</button>
                <button class="pt-btn" style="font-size:10px;padding:3px 6px;background:#6a0dad;" onclick="ptRouteTopCard(${idx},'lost')">Lost</button>
            </div>`;
        container.appendChild(row);
    });
}

function ptRouteTopCard(idx, destination) {
    const p    = ptCurrentPlayer;
    const card = ptLookingAt.splice(idx, 1)[0];
    if (!card) return;
    if (destination === 'hand')         ptState[p].hand.push(card);
    else if (destination === 'bottom')  ptState[p].deck.unshift(card);
    else if (destination === 'discard') ptState[p].discard.push(card);
    else if (destination === 'lost')    ptState[p].lostzone.push(card);
    ptLog(`${p.toUpperCase()} routet "${card.name}" nach ${destination}.`, p);
    ptRenderTopCards();
    ptRenderAll();
}

function ptConfirmTopOrder() {
    const p = ptCurrentPlayer;
    // Remaining cards go back on top in current order (index 0 = topmost)
    ptLookingAt.reverse().forEach(card => ptState[p].deck.push(card));
    ptLookingAt = [];
    ptLog(`${p.toUpperCase()} bestaetigt Top Order.`, p);
    ptShowMessage('Reihenfolge bestaetigt.');
    ptCloseTopCards();
    ptRenderAll();
}

function ptCloseTopCards() {
    // Put remaining cards back on top
    if (ptLookingAt.length > 0) {
        const p = ptCurrentPlayer;
        ptLookingAt.reverse().forEach(card => ptState[p].deck.push(card));
        ptLookingAt = [];
        ptRenderAll();
    }
    document.getElementById('ptTopCardsModal').style.display = 'none';
}

// --- RETREAT (swap Active <-> Bench) ---

function ptSwapZones(player, benchZone, event) {
    if (event) event.stopPropagation();
    const tmpCards = [...ptState[player].field.active];
    const tmpDmg   = ptState[player].damage.active;
    ptState[player].field.active      = [...ptState[player].field[benchZone]];
    ptState[player].damage.active     = ptState[player].damage[benchZone];
    ptState[player].field[benchZone]  = tmpCards;
    ptState[player].damage[benchZone] = tmpDmg;
    ptState[player].status = [];
    ptLog(`${player.toUpperCase()} Rueckzug.`, player);
    ptShowMessage('Rueckzug!');
    ptRenderAll();
}

// --- DECK SEARCH ---

function ptOpenDeckSearch() {
    const deck = ptState[ptCurrentPlayer].deck;
    const grid = document.getElementById('ptDeckSearchGrid');
    if (!grid) return;
    grid.innerHTML = '';
    [...deck].sort((a, b) => a.name.localeCompare(b.name)).forEach(card => {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;cursor:pointer;';
        wrap.title = card.name;

        const img = document.createElement('img');
        img.src = card.imageUrl || 'https://images.pokemontcg.io/card-back.png';
        img.className = 'pt-field-card';
        img.style.width = '100px';
        img.onerror = function() { this.src = 'https://images.pokemontcg.io/card-back.png'; };
        img.onclick = () => ptTakeFromDeck(card.ptId);
        img.oncontextmenu = (e) => { e.preventDefault(); ptSendToLostFromDeck(card.ptId); };

        const lbl = document.createElement('div');
        lbl.style.cssText = 'position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 4px 4px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;';
        lbl.textContent = card.name;

        wrap.appendChild(img);
        wrap.appendChild(lbl);
        grid.appendChild(wrap);
    });
    document.getElementById('ptDeckSearchModal').style.display = 'flex';
}

function ptTakeFromDeck(cardId) {
    const deck = ptState[ptCurrentPlayer].deck;
    const idx = deck.findIndex(c => c.ptId === cardId);
    if (idx > -1) {
        const card = deck.splice(idx, 1)[0];
        ptState[ptCurrentPlayer].hand.push(card);
        ptShuffle();
        document.getElementById('ptDeckSearchModal').style.display = 'none';
        ptLog(`${ptCurrentPlayer.toUpperCase()} sucht "${card.name}" aus Deck.`, ptCurrentPlayer);
        ptShowMessage('Karte aus Deck gezogen. Deck gemischt!');
    }
}

function ptSendToLostFromDeck(cardId) {
    const p = ptCurrentPlayer;
    const deck = ptState[p].deck;
    const idx = deck.findIndex(c => c.ptId === cardId);
    if (idx > -1) {
        const card = deck.splice(idx, 1)[0];
        ptState[p].lostzone.push(card);
        ptShuffle();
        document.getElementById('ptDeckSearchModal').style.display = 'none';
        ptLog(`${p.toUpperCase()} legt "${card.name}" in Lost Zone.`, p);
        ptShowMessage('Karte in Lost Zone!');
    }
}

// --- ZONE INTERACTION ---

function ptClickZone(player, zoneId) {
    if (ptSelectedCardIndex === null) return;
    const card = ptState[ptCurrentPlayer].hand[ptSelectedCardIndex];
    if (!card) return;

    if (zoneId === 'playzone') {
        ptState.playZone.push(card);
        ptLog(`${ptCurrentPlayer.toUpperCase()} spielt "${card.name}".`, ptCurrentPlayer);
        ptShowMessage('Gespielt! (Fuehre Effekt manuell aus)');
    } else if (zoneId === 'stadium') {
        if (ptState.stadium.length > 0) ptState[ptCurrentPlayer].discard.push(ptState.stadium.pop());
        ptState.stadium.push(card);
        ptLog(`${ptCurrentPlayer.toUpperCase()} spielt Stadion "${card.name}".`, ptCurrentPlayer);
        ptShowMessage('Stadion gespielt!');
    } else {
        ptState[player].field[zoneId].push(card);
        ptLog(`${ptCurrentPlayer.toUpperCase()} legt "${card.name}" auf ${player} ${zoneId}.`, ptCurrentPlayer);
        ptShowMessage(ptState[player].field[zoneId].length > 1 ? 'Karte angelegt!' : 'Karte platziert!');
    }
    ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1);
    ptSelectedCardIndex = null;
    ptRenderAll();
}

function returnToHand(player, zoneId, event) {
    event.stopPropagation();
    const isNeutral = (zoneId === 'playzone' || zoneId === 'stadium');
    const zoneArr = isNeutral
        ? (zoneId === 'stadium' ? ptState.stadium : ptState.playZone)
        : ptState[player].field[zoneId];
    if (zoneArr.length > 0) {
        const card = zoneArr.pop();
        ptState[ptCurrentPlayer].hand.push(card);
        if (!isNeutral && zoneArr.length === 0) {
            ptState[player].damage[zoneId] = 0;
            if (zoneId === 'active') ptState[player].status = [];
        }
        ptRenderAll();
    }
}

function discardTopCard(player, zoneId, event) {
    event.stopPropagation();
    const isNeutral = (zoneId === 'playzone' || zoneId === 'stadium');
    const zoneArr = isNeutral
        ? (zoneId === 'stadium' ? ptState.stadium : ptState.playZone)
        : ptState[player].field[zoneId];
    if (zoneArr.length > 0) {
        const card = zoneArr.pop();
        ptState[ptCurrentPlayer].discard.push(card);
        if (!isNeutral && zoneArr.length === 0) {
            ptState[player].damage[zoneId] = 0;
            if (zoneId === 'active') ptState[player].status = [];
        }
        ptLog(`${ptCurrentPlayer.toUpperCase()} legt "${card.name}" auf Ablage.`, ptCurrentPlayer);
        ptRenderAll();
    }
}

function addDamage(player, zoneId, amount, event) {
    event.stopPropagation();
    ptState[player].damage[zoneId] = Math.max(0, (ptState[player].damage[zoneId] || 0) + amount);
    ptRenderAll();
}

function clearDamage(player, zoneId, event) {
    event.stopPropagation();
    ptState[player].damage[zoneId] = 0;
    ptRenderAll();
}

function toggleStatus(player, statusType, event) {
    event.stopPropagation();
    const idx = ptState[player].status.indexOf(statusType);
    if (idx > -1) ptState[player].status.splice(idx, 1);
    else ptState[player].status.push(statusType);
    ptRenderAll();
}

// --- LOST ZONE ---

function ptOpenLost(player) {
    const grid = document.getElementById('ptLostGrid');
    if (!grid) return;
    const lz = ptState[player].lostzone || [];
    if (lz.length === 0) { ptShowMessage('Lost Zone ist leer.'); return; }
    grid.innerHTML = lz.map((card) => {
        const safeImg  = (card.imageUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeName = (card.name     || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<div style="position:relative;cursor:pointer;" title="${card.name}"
                     onclick="ptViewCard('${safeImg}','${safeName}')">
            <img src="${card.imageUrl || 'https://images.pokemontcg.io/card-back.png'}"
                 style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='https://images.pokemontcg.io/card-back.png'">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.7);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${card.name}</div>
        </div>`;
    }).join('');
    document.getElementById('ptLostModal').style.display = 'flex';
}

function ptCloseLostModal() {
    const m = document.getElementById('ptLostModal');
    if (m) m.style.display = 'none';
}

// --- DRAG & DROP ---

function setupDragAndDrop() {
    if (document._ptDragOver)    document.removeEventListener('dragover',  document._ptDragOver);
    if (document._ptDropHandler) document.removeEventListener('drop',      document._ptDropHandler);

    document._ptDragOver = e => e.preventDefault();
    document._ptDropHandler = function(e) {
        e.preventDefault();
        const handIndex = e.dataTransfer.getData('text/plain');
        if (handIndex === '') return;
        const targetEl = e.target.closest('[id^="ptActiveZone-"],[id^="ptBench"],[id="ptStadiumZone"],[id="ptPlayZone"]');
        if (!targetEl) return;
        const id = targetEl.id;
        ptSelectedCardIndex = parseInt(handIndex);
        if (id === 'ptStadiumZone')         { ptClickZone(ptCurrentPlayer, 'stadium'); }
        else if (id === 'ptPlayZone')       { ptClickZone(ptCurrentPlayer, 'playzone'); }
        else if (id.startsWith('ptActiveZone-')) { ptClickZone(id.endsWith('p1') ? 'p1' : 'p2', 'active'); }
        else if (id.startsWith('ptBench'))  {
            const player = id.endsWith('-p1') ? 'p1' : 'p2';
            const zone   = 'bench' + id.match(/ptBench(\d)/)[1];
            ptClickZone(player, zone);
        }
    };
    document.addEventListener('dragover', document._ptDragOver);
    document.addEventListener('drop',     document._ptDropHandler);
}

function ptDragStartHand(event, index) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    ptSelectedCardIndex = index;
    ptRenderHand();
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

        const pileEl = document.getElementById(`ptDiscardPile-${p}`);
        if (pileEl) {
            if (ptState[p].discard.length > 0) {
                const top = ptState[p].discard[ptState[p].discard.length - 1];
                pileEl.innerHTML = `<img src="${top.imageUrl}" class="pt-field-card"
                    style="width:62px;cursor:pointer;" onclick="ptOpenDiscard('${p}')"
                    onerror="this.src='https://images.pokemontcg.io/card-back.png'"
                    title="Ablage - ${ptState[p].discard.length} Karten">`;
            } else {
                pileEl.innerHTML = `<div class="pt-empty-slot"
                    style="width:62px;height:87px;font-size:10px;cursor:pointer;"
                    onclick="ptOpenDiscard('${p}')">Ablage</div>`;
            }
        }

        const prizeEl = document.getElementById(`ptPrizeZone-${p}`);
        if (prizeEl) {
            prizeEl.innerHTML = ptState[p].prizes.map((c, i) =>
                `<img src="https://images.pokemontcg.io/card-back.png" class="pt-prize-card"
                      title="Preiskarte nehmen" onclick="ptTakePrize('${p}', ${i})">`
            ).join('');
        }

        const activeEl = document.getElementById(`ptActiveZone-${p}`);
        if (activeEl) activeEl.innerHTML = generateZoneHTML(p, 'active', 'Active');
        for (let i = 0; i < 5; i++) {
            const benchEl = document.getElementById(`ptBench${i}-${p}`);
            if (benchEl) benchEl.innerHTML = generateZoneHTML(p, `bench${i}`, `Bank ${i + 1}`);
        }
    });

    const stadiumEl = document.getElementById('ptStadiumZone');
    if (stadiumEl) stadiumEl.innerHTML = generateNeutralZone('stadium', 'Stadion');
    const playEl = document.getElementById('ptPlayZone');
    if (playEl) playEl.innerHTML = generateNeutralZone('playzone', 'Ablage');

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
        img.src       = card.imageUrl || 'https://images.pokemontcg.io/card-back.png';
        img.className = 'pt-hand-card' + (i === ptSelectedCardIndex ? ' pt-card-selected' : '');
        img.title     = card.name;
        img.onerror   = function() { this.src = 'https://images.pokemontcg.io/card-back.png'; };
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
    event.stopPropagation();
    const card = ptState[ptCurrentPlayer].hand.splice(index, 1)[0];
    ptState[ptCurrentPlayer].discard.push(card);
    ptSelectedCardIndex = null;
    ptLog(`${ptCurrentPlayer.toUpperCase()} legt "${card.name}" von Hand auf Ablage.`, ptCurrentPlayer);
    ptRenderAll();
}

function ptTakePrize(player, index) {
    const card = ptState[player].prizes.splice(index, 1)[0];
    ptState[ptCurrentPlayer].hand.push(card);
    ptLog(`${ptCurrentPlayer.toUpperCase()} nimmt Preiskarte.`, ptCurrentPlayer);
    ptShowMessage('Preiskarte gezogen!');
    ptRenderAll();
}

function ptOpenDiscard(player) {
    const grid = document.getElementById('ptDiscardGrid');
    if (!grid) return;
    if (ptState[player].discard.length === 0) { ptShowMessage('Ablage ist leer.'); return; }
    grid.innerHTML = ptState[player].discard.map((card, index) => {
        const safeImg  = (card.imageUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeName = (card.name     || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<div style="position:relative;cursor:pointer;" title="${card.name}">
            <img src="${card.imageUrl}" style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='https://images.pokemontcg.io/card-back.png'"
                 onclick="ptTakeFromDiscard('${player}', ${index})"
                 ondblclick="ptViewCard('${safeImg}','${safeName}')"
                 oncontextmenu="event.preventDefault();ptSendToLostFromDiscard('${player}',${index})">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${card.name}</div>
        </div>`;
    }).join('');
    document.getElementById('ptDiscardModal').style.display = 'flex';
}

function ptTakeFromDiscard(player, index) {
    const card = ptState[player].discard.splice(index, 1)[0];
    ptState[ptCurrentPlayer].hand.push(card);
    ptCloseDiscardModal();
    ptLog(`${ptCurrentPlayer.toUpperCase()} nimmt "${card.name}" von Ablage.`, ptCurrentPlayer);
    ptShowMessage('Karte aus Ablage geholt.');
    ptRenderAll();
}

function ptSendToLostFromDiscard(player, index) {
    const p = ptCurrentPlayer;
    const card = ptState[player].discard.splice(index, 1)[0];
    ptState[p].lostzone.push(card);
    ptCloseDiscardModal();
    ptLog(`${p.toUpperCase()} legt "${card.name}" in Lost Zone.`, p);
    ptShowMessage('In Lost Zone!');
    ptRenderAll();
}

function ptCloseDiscardModal() {
    const m = document.getElementById('ptDiscardModal');
    if (m) m.style.display = 'none';
}

// --- NEUTRAL ZONE RENDER ---

function generateNeutralZone(zoneId, labelText) {
    const cards = zoneId === 'stadium' ? ptState.stadium : ptState.playZone;
    if (cards.length === 0) {
        const isTarget = ptSelectedCardIndex !== null;
        return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                     style="width:82px;height:114px;"
                     onclick="ptClickZone('${ptCurrentPlayer}', '${zoneId}')">${labelText}</div>`;
    }
    const card = cards[cards.length - 1];
    const safeImg  = (card.imageUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const safeName = (card.name     || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return `<div style="position:relative;width:82px;cursor:pointer;"
                 onclick="ptClickZone('${ptCurrentPlayer}', '${zoneId}')">
        <img src="${card.imageUrl}" class="pt-field-card"
             style="width:82px;border-radius:7px;display:block;position:relative;z-index:1;"
             onerror="this.src='https://images.pokemontcg.io/card-back.png'"
             ondblclick="ptViewCard('${safeImg}','${safeName}')"
             title="${card.name}">
        <div class="pt-field-actions" style="z-index:100;bottom:-28px;">
            <button class="pt-action-btn" onclick="returnToHand('${ptCurrentPlayer}','${zoneId}',event)">⬆️</button>
            <button class="pt-action-btn red" onclick="discardTopCard('${ptCurrentPlayer}','${zoneId}',event)">🗑️</button>
        </div>
    </div>`;
}

// --- FIELD ZONE RENDER ---

function generateZoneHTML(player, zoneId, labelText) {
    const cards  = ptState[player].field[zoneId];
    const width  = zoneId === 'active' ? 102 : 82;
    const height = Math.round(width * 1.38);

    if (cards.length === 0) {
        const isTarget = ptSelectedCardIndex !== null;
        return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                     style="width:${width}px;height:${height}px;"
                     onclick="ptClickZone('${player}', '${zoneId}')">${labelText}</div>`;
    }

    let html = `<div style="position:relative;width:${width}px;cursor:pointer;min-height:${height}px;"
                     onclick="ptClickZone('${player}', '${zoneId}')">`;

    let energyCount = 0;
    let toolCount   = 0;

    cards.forEach((card, index) => {
        const safeImg  = (card.imageUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const safeName = (card.name     || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        if (index === 0) {
            html += `<img src="${card.imageUrl || 'https://images.pokemontcg.io/card-back.png'}"
                          class="pt-field-card"
                          style="position:relative;z-index:10;width:${width}px;border-radius:7px;display:block;"
                          onerror="this.src='https://images.pokemontcg.io/card-back.png'"
                          ondblclick="ptViewCard('${safeImg}','${safeName}')"
                          title="${card.name}">`;
        } else {
            const isEnergy = (card.cardType || '').toLowerCase().includes('energy');
            if (isEnergy) {
                html += `<img src="${card.imageUrl || 'https://images.pokemontcg.io/card-back.png'}"
                              class="pt-attachment-energy"
                              style="bottom:${8 + energyCount * 24}px;"
                              onerror="this.src='https://images.pokemontcg.io/card-back.png'"
                              title="${card.name}">`;
                energyCount++;
            } else {
                html += `<img src="${card.imageUrl || 'https://images.pokemontcg.io/card-back.png'}"
                              class="pt-attachment-tool"
                              style="bottom:${30 + toolCount * 10}px;"
                              onerror="this.src='https://images.pokemontcg.io/card-back.png'"
                              title="${card.name}">`;
                toolCount++;
            }
        }
    });

    let statusBtns = '';
    let statusIconsHTML = '';
    if (zoneId === 'active') {
        const stat = ptState[player].status;
        const s = type => stat.includes(type) ? ' red' : '';
        statusBtns = `
            <div style="display:flex;gap:2px;justify-content:center;margin-bottom:2px;flex-wrap:wrap;">
                <button class="pt-action-btn${s('poisoned')}"  onclick="toggleStatus('${player}','poisoned',event)"  title="Vergiftet">☠️</button>
                <button class="pt-action-btn${s('burned')}"    onclick="toggleStatus('${player}','burned',event)"    title="Verbrannt">🔥</button>
                <button class="pt-action-btn${s('asleep')}"    onclick="toggleStatus('${player}','asleep',event)"    title="Schlaf">💤</button>
                <button class="pt-action-btn${s('paralyzed')}" onclick="toggleStatus('${player}','paralyzed',event)" title="Paralyse">⚡</button>
                <button class="pt-action-btn${s('confused')}"  onclick="toggleStatus('${player}','confused',event)"  title="Verwirrt">💫</button>
            </div>`;
        if (stat.length > 0) {
            const icons = stat.join(' ');
            statusIconsHTML = `<div style="position:absolute;bottom:-10px;right:5px;
                background:rgba(0,0,0,0.8);color:#fff;padding:2px 5px;
                border-radius:4px;font-size:11px;z-index:99;">${icons}</div>`;
        }
    }

    const retreatBtn = zoneId !== 'active'
        ? `<button class="pt-action-btn" onclick="ptSwapZones('${player}','${zoneId}',event)" title="Rueckzug">🔄</button>`
        : '';

    html += `
        <div class="pt-field-actions" style="z-index:100;flex-direction:column;">
            ${statusBtns}
            <div style="display:flex;gap:2px;justify-content:center;flex-wrap:wrap;">
                <button class="pt-action-btn" onclick="addDamage('${player}','${zoneId}',10,event)">+10</button>
                <button class="pt-action-btn" onclick="addDamage('${player}','${zoneId}',50,event)">+50</button>
                <button class="pt-action-btn" onclick="clearDamage('${player}','${zoneId}',event)">0</button>
                ${retreatBtn}
                <button class="pt-action-btn" onclick="returnToHand('${player}','${zoneId}',event)" title="Auf Hand">⬆️</button>
                <button class="pt-action-btn red" onclick="discardTopCard('${player}','${zoneId}',event)" title="Ablegen">🗑️</button>
            </div>
        </div>`;

    html += statusIconsHTML;

    const dmg = ptState[player].damage[zoneId];
    if (dmg > 0) html += `<div class="pt-damage-badge">${dmg}</div>`;

    html += '</div>';
    return html;
}
