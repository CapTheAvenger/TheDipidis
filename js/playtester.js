/**
 * ============================================================================
 * POKEMON TCG GOLDFISHING PLAYTESTER - 2-PLAYER SANDBOX
 * ============================================================================
 */

// --- STATE ---
let ptState = { p1: null, p2: null, stadium: [], playZone: [] };
let ptCurrentPlayer = 'p1';
let ptSelectedCardIndex = null;
let _ptMsgTimer = null;

function getInitialPlayerState() {
    return {
        deck: [], hand: [], discard: [], prizes: [],
        field:  { active: [], bench0: [], bench1: [], bench2: [], bench3: [], bench4: [] },
        damage: { active: 0,  bench0: 0,  bench1: 0,  bench2: 0,  bench3: 0,  bench4: 0 },
        status: []
    };
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

    baseCards.forEach(card => {
        ptState.p1.deck.push({ ...card, ptId: 'p1_' + Math.random().toString(36).substr(2, 9) });
        ptState.p2.deck.push({ ...card, ptId: 'p2_' + Math.random().toString(36).substr(2, 9) });
    });

    document.getElementById('playtesterModal').style.display = 'flex';
    ptNewGame();
    setupDragAndDrop();
}

function closePlaytester() {
    if (confirm('Playtester wirklich verlassen? Der Spielfortschritt geht verloren.')) {
        document.getElementById('playtesterModal').style.display = 'none';
    }
}

function ptNewGame() {
    ['p1', 'p2'].forEach(p => {
        let allCards = [...ptState[p].deck, ...ptState[p].hand, ...ptState[p].discard, ...ptState[p].prizes];
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

    ptShowMessage('2-Spieler Spiel gestartet!');
    ptRenderAll();
}

// --- BASIC ACTIONS ---

function ptDraw1(playerOverride) {
    const p = playerOverride || ptCurrentPlayer;
    if (ptState[p].deck.length > 0) {
        ptState[p].hand.push(ptState[p].deck.pop());
        ptRenderAll();
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
    ptShowMessage('Deck gemischt!');
    ptRenderAll();
}

function ptFlipCoin() {
    ptShowMessage(Math.random() >= 0.5 ? '🪙 KOPF!' : '🪙 ZAHL!');
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
        ptShowMessage('Spieler 2 ist dran');
    } else {
        board.style.transform = 'rotate(0deg)';
        ptCurrentPlayer = 'p1';
        if (ind)      ind.innerText = '1';
        if (handZone) handZone.style.borderTopColor = '#3B4CCA';
        ptShowMessage('Spieler 1 ist dran');
    }
    ptRenderHand();
}

function ptPassTurn() {
    const p = ptCurrentPlayer;
    let dmg = 0;
    if (ptState[p].status.includes('poisoned')) dmg += 10;
    if (ptState[p].status.includes('burned'))   dmg += 20;
    if (dmg > 0) {
        ptState[p].damage.active += dmg;
        ptShowMessage(`Status-Schaden: ${dmg} DMG!`);
    }
    ptFlipBoard();
    ptDraw1();
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
        const img = document.createElement('img');
        img.src = card.imageUrl || 'https://images.pokemontcg.io/card-back.png';
        img.className = 'pt-field-card';
        img.style.width = '100px';
        img.title = card.name;
        img.onerror = function() { this.src = 'https://images.pokemontcg.io/card-back.png'; };
        img.onclick = () => ptTakeFromDeck(card.ptId);
        grid.appendChild(img);
    });
    document.getElementById('ptDeckSearchModal').style.display = 'flex';
}

function ptTakeFromDeck(cardId) {
    const deck = ptState[ptCurrentPlayer].deck;
    const idx = deck.findIndex(c => c.ptId === cardId);
    if (idx > -1) {
        ptState[ptCurrentPlayer].hand.push(deck.splice(idx, 1)[0]);
        ptShuffle();
        document.getElementById('ptDeckSearchModal').style.display = 'none';
        ptShowMessage('Karte aus Deck gezogen. Deck gemischt!');
    }
}

// --- ZONE INTERACTION ---

function ptClickZone(player, zoneId) {
    if (ptSelectedCardIndex === null) return;
    const card = ptState[ptCurrentPlayer].hand[ptSelectedCardIndex];
    if (!card) return;

    if (zoneId === 'playzone') {
        ptState.playZone.push(card);
        ptShowMessage('Gespielt! (Fuehre Effekt manuell aus)');
    } else if (zoneId === 'stadium') {
        if (ptState.stadium.length > 0) ptState[ptCurrentPlayer].discard.push(ptState.stadium.pop());
        ptState.stadium.push(card);
        ptShowMessage('Stadion gespielt!');
    } else {
        ptState[player].field[zoneId].push(card);
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
        ptState[ptCurrentPlayer].hand.push(zoneArr.pop());
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
        ptState[ptCurrentPlayer].discard.push(zoneArr.pop());
        if (!isNeutral && zoneArr.length === 0) {
            ptState[player].damage[zoneId] = 0;
            if (zoneId === 'active') ptState[player].status = [];
        }
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
    ptState[ptCurrentPlayer].discard.push(ptState[ptCurrentPlayer].hand.splice(index, 1)[0]);
    ptSelectedCardIndex = null;
    ptRenderAll();
}

function ptTakePrize(player, index) {
    ptState[ptCurrentPlayer].hand.push(ptState[player].prizes.splice(index, 1)[0]);
    ptShowMessage('Preiskarte gezogen!');
    ptRenderAll();
}

function ptOpenDiscard(player) {
    const grid = document.getElementById('ptDiscardGrid');
    if (!grid) return;
    if (ptState[player].discard.length === 0) { ptShowMessage('Ablage ist leer.'); return; }
    grid.innerHTML = ptState[player].discard.map((card, index) => `
        <div style="position:relative;cursor:pointer;" title="${card.name}">
            <img src="${card.imageUrl}" style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='https://images.pokemontcg.io/card-back.png'"
                 onclick="ptTakeFromDiscard('${player}', ${index})">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${card.name}</div>
        </div>`
    ).join('');
    document.getElementById('ptDiscardModal').style.display = 'flex';
}

function ptTakeFromDiscard(player, index) {
    ptState[ptCurrentPlayer].hand.push(ptState[player].discard.splice(index, 1)[0]);
    ptCloseDiscardModal();
    ptShowMessage('Karte aus Ablage geholt.');
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
    return `<div style="position:relative;width:82px;cursor:pointer;"
                 onclick="ptClickZone('${ptCurrentPlayer}', '${zoneId}')">
        <img src="${card.imageUrl}" class="pt-field-card"
             style="width:82px;border-radius:7px;display:block;position:relative;z-index:1;"
             onerror="this.src='https://images.pokemontcg.io/card-back.png'"
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
        if (index === 0) {
            html += `<img src="${card.imageUrl || 'https://images.pokemontcg.io/card-back.png'}"
                          class="pt-field-card"
                          style="position:relative;z-index:10;width:${width}px;border-radius:7px;display:block;"
                          onerror="this.src='https://images.pokemontcg.io/card-back.png'"
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