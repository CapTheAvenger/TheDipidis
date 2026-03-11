/**
 * ============================================================================
 * GOLDFISHING PLAYTESTER (SANDBOX) - VOLLSTÄNDIGE LOGIK
 * ============================================================================
 */

// --- STATE VARIABLES ---
let ptDeck = [];
let ptHand = [];
let ptDiscard = [];
let ptPrizes = [];

// Zonen: 'active', 'bench0' bis 'bench4'
let ptField = {
    active: [], bench0: [], bench1: [], bench2: [], bench3: [], bench4: []
};

// Speichert Schaden pro Zone
let ptDamage = { active: 0, bench0: 0, bench1: 0, bench2: 0, bench3: 0, bench4: 0 };

let ptSelectedCardIndex = null;
let isBoardFlipped = false;
let _ptMsgTimer = null;

// --- INITIALIZATION ---

function openPlaytester(source) {
    const deckObj = source === 'cityLeague'  ? (window.cityLeagueDeck  || {})
                  : source === 'currentMeta' ? (window.currentMetaDeck || {})
                  : source === 'pastMeta'    ? (window.pastMetaDeck    || {})
                  : {};

    const totalCards = Object.values(deckObj).reduce((s, c) => s + c, 0);
    if (totalCards === 0) {
        alert('Dein Deck ist leer! Füge erst Karten hinzu.');
        return;
    }
    if (totalCards < 60) {
        if (!confirm(`Dein Deck hat nur ${totalCards}/60 Karten. Trotzdem starten?`)) return;
    }

    // Flatten {deckKey: count} → [{name, imageUrl, ptId}, ...]
    // Reuses _simFindCard() from draw-simulator.js
    ptDeck = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
        if (!count || count <= 0) continue;
        let cardName = deckKey;
        let imageUrl = 'images/card-back.png';
        const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        if (m) {
            cardName = m[1];
            const cd = _simFindCard(m[2], m[3]);
            if (cd && cd.image_url) imageUrl = cd.image_url;
        } else {
            const cd = window.allCardsDatabase &&
                       window.allCardsDatabase.find(c => c.name === cardName);
            if (cd && cd.image_url) imageUrl = cd.image_url;
        }
        for (let i = 0; i < count; i++) {
            ptDeck.push({
                name: cardName,
                imageUrl,
                ptId: 'card_' + Math.random().toString(36).substr(2, 9)
            });
        }
    }

    document.getElementById('playtesterModal').style.display = 'flex';
    ptNewGame();
}

function closePlaytester() {
    if (confirm('Playtester wirklich verlassen? Der Spielfortschritt geht verloren.')) {
        document.getElementById('playtesterModal').style.display = 'none';
    }
}

function ptNewGame() {
    ptHand    = [];
    ptDiscard = [];
    ptPrizes  = [];
    ptField   = { active: [], bench0: [], bench1: [], bench2: [], bench3: [], bench4: [] };
    ptDamage  = { active: 0, bench0: 0, bench1: 0, bench2: 0, bench3: 0, bench4: 0 };
    ptSelectedCardIndex = null;
    isBoardFlipped = false;

    const board   = document.getElementById('playtester-board');
    const flipBtn = document.getElementById('flip-board-btn');
    if (board)   board.style.transform = 'rotate(0deg)';
    if (flipBtn) flipBtn.innerText = '🔄 Flip Board';

    ptShuffle();

    for (let i = 0; i < 7; i++) { if (ptDeck.length > 0) ptHand.push(ptDeck.pop()); }
    for (let i = 0; i < 6; i++) { if (ptDeck.length > 0) ptPrizes.push(ptDeck.pop()); }

    ptShowMessage('Spiel gestartet! Klicke auf eine Handkarte und dann auf das Feld.');
    ptRenderAll();
}

// --- ACTIONS ---

function ptShuffle() {
    for (let i = ptDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ptDeck[i], ptDeck[j]] = [ptDeck[j], ptDeck[i]];
    }
    ptShowMessage('Deck gemischt!');
    ptRenderDeck();
}

function ptDraw1() {
    if (ptDeck.length > 0) {
        ptHand.push(ptDeck.pop());
        ptRenderHand();
        ptRenderDeck();
        ptShowMessage('Karte gezogen.');
    } else {
        ptShowMessage('Deck ist leer!');
    }
}

function ptFlipCoin() {
    const result = Math.random() >= 0.5 ? '🌟 KOPF!' : '💀 ZAHL!';
    ptShowMessage('Münzwurf: ' + result);
}

function ptFlipBoard(btnElement) {
    const board = document.getElementById('playtester-board');
    if (!board) return;
    if (isBoardFlipped) {
        board.style.transform = 'rotate(0deg)';
        btnElement.innerText = '🔄 Flip Board';
        isBoardFlipped = false;
        ptShowMessage('Deine Perspektive');
    } else {
        board.style.transform = 'rotate(180deg)';
        btnElement.innerText = '🔄 Reset Board';
        isBoardFlipped = true;
        ptShowMessage('Gegnerische Perspektive');
    }
}

// --- SPIELFELD INTERAKTION ---

function ptClickZone(zoneId) {
    if (ptSelectedCardIndex === null) return;

    const selectedCard = ptHand[ptSelectedCardIndex];
    ptField[zoneId].push(selectedCard);
    ptHand.splice(ptSelectedCardIndex, 1);
    ptSelectedCardIndex = null;

    ptShowMessage(ptField[zoneId].length > 1 ? 'Karte angelegt!' : 'Karte platziert!');
    ptRenderHand();
    ptRenderField();
}

// --- SCHADEN & KARTEN ENTFERNEN ---

function addDamage(zoneId, amount, event) {
    event.stopPropagation();
    ptDamage[zoneId] = Math.max(0, (ptDamage[zoneId] || 0) + amount);
    ptRenderField();
}

function clearDamage(zoneId, event) {
    event.stopPropagation();
    ptDamage[zoneId] = 0;
    ptRenderField();
}

function discardTopCard(zoneId, event) {
    event.stopPropagation();
    if (ptField[zoneId].length === 0) return;
    const discardedCard = ptField[zoneId].pop();
    ptDiscard.push(discardedCard);
    if (ptField[zoneId].length === 0) ptDamage[zoneId] = 0;
    ptRenderField();
    ptRenderDiscard();
    ptShowMessage('Karte abgelegt.');
}

function returnToHand(zoneId, event) {
    event.stopPropagation();
    if (ptField[zoneId].length === 0) return;
    const card = ptField[zoneId].pop();
    ptHand.push(card);
    if (ptField[zoneId].length === 0) ptDamage[zoneId] = 0;
    ptRenderField();
    ptRenderHand();
    ptShowMessage('Karte auf die Hand genommen.');
}

// --- RENDER FUNKTIONEN ---

function ptRenderAll() {
    ptRenderDeck();
    ptRenderHand();
    ptRenderPrizes();
    ptRenderDiscard();
    ptRenderField();
}

function ptRenderDeck() {
    const el = document.getElementById('ptDeckCount');
    if (el) el.innerText = ptDeck.length;
}

function ptRenderPrizes() {
    const zone = document.getElementById('ptPrizeZone');
    if (!zone) return;
    zone.innerHTML = ptPrizes.map((card, i) => `
        <div style="position:relative;display:inline-block;">
            <img src="images/card-back.png" class="pt-prize-card"
                 title="Preiskarte nehmen (${i + 1})"
                 onclick="ptTakePrize(${i})"
                 onerror="this.src='images/card-back.png'">
            <button class="pt-prize-take-btn" onclick="ptTakePrize(${i})">↩</button>
        </div>`
    ).join('');
}

function ptTakePrize(index) {
    const card = ptPrizes.splice(index, 1)[0];
    ptHand.push(card);
    ptShowMessage('Preiskarte gezogen!');
    ptRenderPrizes();
    ptRenderHand();
}

function ptRenderDiscard() {
    const el = document.getElementById('ptDiscardCount');
    if (el) el.innerText = ptDiscard.length;

    const pile = document.getElementById('ptDiscardPile');
    if (!pile) return;

    if (ptDiscard.length > 0) {
        const top = ptDiscard[ptDiscard.length - 1];
        pile.innerHTML = `<img src="${top.imageUrl}" alt="${top.name}"
            style="width:62px;border-radius:7px;cursor:pointer;display:block;
                   transition:transform 0.15s;border:2px solid rgba(255,255,255,0.25);"
            onmouseover="this.style.transform='scale(1.07)'"
            onmouseout="this.style.transform=''"
            onclick="ptShowDiscard()"
            onerror="this.src='images/card-back.png'"
            title="Ablage ansehen (${ptDiscard.length} Karten)">`;
    } else {
        pile.innerHTML = `<div class="pt-empty-slot"
            style="width:62px;height:87px;font-size:10px;cursor:pointer;"
            onclick="ptShowDiscard()">Ablage</div>`;
    }
}

function ptShowDiscard() {
    const modal = document.getElementById('ptDiscardModal');
    const grid  = document.getElementById('ptDiscardGrid');
    if (!modal || !grid) return;
    if (ptDiscard.length === 0) return;
    grid.innerHTML = ptDiscard.map((c, i) => `
        <div style="position:relative;cursor:pointer;" title="${c.name} — Klicken für Hand">
            <img src="${c.imageUrl}" alt="${c.name}"
                 style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='images/card-back.png'"
                 onclick="ptTakeFromDiscard(${i})">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
        </div>`
    ).join('');
    modal.style.display = 'flex';
}

function ptCloseDiscardModal() {
    const m = document.getElementById('ptDiscardModal');
    if (m) m.style.display = 'none';
}

function ptTakeFromDiscard(index) {
    const card = ptDiscard.splice(index, 1)[0];
    ptHand.push(card);
    ptShowMessage('Karte aus Ablage geholt.');
    ptCloseDiscardModal();
    ptRenderDiscard();
    ptRenderHand();
}

function ptRenderHand() {
    const zone = document.getElementById('ptHandZone');
    const cnt  = document.getElementById('ptHandCount');
    if (!zone) return;
    if (cnt) cnt.textContent = ptHand.length;
    zone.innerHTML = '';

    ptHand.forEach((card, i) => {
        const sel = i === ptSelectedCardIndex;

        const wrapper = document.createElement('div');
        wrapper.className = 'pt-hand-wrapper';
        wrapper.draggable = true;
        wrapper.ondragstart = e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'hand_' + i);
            ptSelectedCardIndex = i;
        };

        const img = document.createElement('img');
        img.src       = card.imageUrl || 'images/card-back.png';
        img.alt       = card.name;
        img.title     = card.name;
        img.className = 'pt-hand-card' + (sel ? ' pt-card-selected' : '');
        img.onerror   = function () { this.src = 'images/card-back.png'; };
        img.onclick   = () => ptSelectHandCard(i);

        const discBtn = document.createElement('button');
        discBtn.className = 'pt-hand-disc-btn';
        discBtn.title     = 'Ablegen';
        discBtn.innerHTML = '🗑️';
        discBtn.onclick   = e => ptDiscardFromHand(i, e);

        wrapper.appendChild(img);
        wrapper.appendChild(discBtn);
        zone.appendChild(wrapper);
    });

    // Return-to-hand drop target at end of row
    const dropEnd = document.createElement('div');
    dropEnd.className     = 'pt-empty-slot';
    dropEnd.style.cssText = 'min-width:68px;height:98px;flex-shrink:0;font-size:10px;';
    dropEnd.textContent   = '+ Hand';
    dropEnd.ondragover    = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    dropEnd.ondrop        = e => {
        e.preventDefault();
        ptSelectedCardIndex = null;
        ptRenderHand();
        ptRenderField();
    };
    zone.appendChild(dropEnd);
}

function ptSelectHandCard(index) {
    ptSelectedCardIndex = (ptSelectedCardIndex === index) ? null : index;
    ptRenderHand();
    ptRenderField();
}

function ptDiscardFromHand(index, event) {
    event.stopPropagation();
    const card = ptHand.splice(index, 1)[0];
    ptDiscard.push(card);
    ptSelectedCardIndex = null;
    ptRenderHand();
    ptRenderDiscard();
}

// --- FIELD RENDER LOGIK ---

function ptRenderField() {
    document.getElementById('ptActiveZone').innerHTML = generateZoneHTML('active', 'Active');
    for (let i = 0; i < 5; i++) {
        document.getElementById('ptBench' + i).innerHTML = generateZoneHTML('bench' + i, 'Bank ' + (i + 1));
    }
}

function generateZoneHTML(zoneId, labelText) {
    const cards     = ptField[zoneId];
    const isTarget  = ptSelectedCardIndex !== null;
    const width     = zoneId === 'active' ? 102 : 82;
    const height    = Math.round(width * 1.38);

    // Empty zone
    if (cards.length === 0) {
        return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                     style="width:${width}px;height:${height}px;"
                     ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';"
                     ondrop="event.preventDefault();ptClickZone('${zoneId}')"
                     onclick="ptClickZone('${zoneId}')">${labelText}</div>`;
    }

    // Zone with cards — stack them with slight offset
    let html = `<div style="position:relative;width:${width}px;cursor:pointer;
                             min-height:${height}px;"
                     ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';"
                     ondrop="event.preventDefault();ptClickZone('${zoneId}')"
                     onclick="ptClickZone('${zoneId}')">`;

    cards.forEach((card, index) => {
        const offsetTop = index * 18;
        html += `<img src="${card.imageUrl || 'images/card-back.png'}"
                      class="pt-field-card"
                      style="position:${index === 0 ? 'relative' : 'absolute'};
                             top:${offsetTop}px;left:0;z-index:${index};
                             width:${width}px;border-radius:7px;display:block;"
                      onerror="this.src='images/card-back.png'"
                      title="${card.name}">`;
    });

    // Action buttons (visible on hover via CSS)
    html += `
        <div class="pt-field-actions" style="z-index:100;">
            <button class="pt-action-btn" onclick="addDamage('${zoneId}',10,event)">+10</button>
            <button class="pt-action-btn" onclick="addDamage('${zoneId}',-10,event)">-10</button>
            <button class="pt-action-btn" onclick="clearDamage('${zoneId}',event)">0</button>
            <button class="pt-action-btn" onclick="returnToHand('${zoneId}',event)" title="Auf Hand">↩</button>
            <button class="pt-action-btn red" onclick="discardTopCard('${zoneId}',event)" title="Ablegen">🗑</button>
        </div>`;

    // Damage badge
    if (ptDamage[zoneId] > 0) {
        html += `<div class="pt-damage-badge">${ptDamage[zoneId]}</div>`;
    }

    html += '</div>';
    return html;
}

// --- MESSAGES ---

function ptShowMessage(msg) {
    const el = document.getElementById('ptMessage');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '0';
    setTimeout(() => { if (el) el.style.opacity = '1'; }, 50);
    clearTimeout(_ptMsgTimer);
    _ptMsgTimer = setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}
let ptHand    = [];
let ptDiscard = [];
let ptPrizes  = [];

// Each zone is an array: [pokémon, attached1, attached2, ...]
let ptField = {
    active: [],
    bench0: [], bench1: [], bench2: [], bench3: [], bench4: []
};

let ptDamage = {};   // ptId → number
let ptStatus = {};   // ptId → 'poison'|'burn'|'asleep'|'paralyzed'|'confused'

let ptSelectedCardIndex = null;  // index into ptHand, or null
let _ptMsgTimer = null;

// --- INITIALIZATION ---

function openPlaytester(source) {
    const deckObj = source === 'cityLeague'  ? (window.cityLeagueDeck  || {})
                  : source === 'currentMeta' ? (window.currentMetaDeck || {})
                  : source === 'pastMeta'    ? (window.pastMetaDeck    || {})
                  : {};

    const totalCards = Object.values(deckObj).reduce((s, c) => s + c, 0);
    if (totalCards === 0) {
        alert('Dein Deck ist leer! Füge erst Karten hinzu.');
        return;
    }
    if (totalCards < 60) {
        if (!confirm(`Dein Deck hat nur ${totalCards}/60 Karten. Trotzdem starten?`)) return;
    }

    // Flatten {deckKey: count} → [{name, imageUrl, ptId}, ...]
    // Reuses _simFindCard() from draw-simulator.js
    ptDeck = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
        if (!count || count <= 0) continue;
        let cardName = deckKey;
        let imageUrl = 'images/card-back.png';
        const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        if (m) {
            cardName = m[1];
            const cd = _simFindCard(m[2], m[3]);
            if (cd && cd.image_url) imageUrl = cd.image_url;
        } else {
            const cd = window.allCardsDatabase &&
                       window.allCardsDatabase.find(c => c.name === cardName);
            if (cd && cd.image_url) imageUrl = cd.image_url;
        }
        for (let i = 0; i < count; i++) {
            ptDeck.push({
                name: cardName,
                imageUrl,
                ptId: 'card_' + Math.random().toString(36).substr(2, 9)
            });
        }
    }

    document.getElementById('playtesterModal').style.display = 'flex';
    ptNewGame();
}

function closePlaytester() {
    if (confirm('Playtester wirklich verlassen?')) {
        document.getElementById('playtesterModal').style.display = 'none';
    }
}

function ptNewGame() {
    ptHand    = [];
    ptDiscard = [];
    ptPrizes  = [];
    ptField   = { active: [], bench0: [], bench1: [], bench2: [], bench3: [], bench4: [] };
    ptDamage  = {};
    ptStatus  = {};
    ptSelectedCardIndex = null;

    ptShuffle();

    for (let i = 0; i < 7; i++) { if (ptDeck.length > 0) ptHand.push(ptDeck.pop()); }
    for (let i = 0; i < 6; i++) { if (ptDeck.length > 0) ptPrizes.push(ptDeck.pop()); }

    ptShowMessage('Neues Spiel gestartet. Lege dein aktives Pokémon!');
    ptRenderAll();
}

// --- ACTIONS ---

function ptShuffle() {
    for (let i = ptDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ptDeck[i], ptDeck[j]] = [ptDeck[j], ptDeck[i]];
    }
    ptShowMessage('Deck gemischt!');
    ptRenderDeck();
}

function ptDraw1() {
    if (ptDeck.length > 0) {
        ptHand.push(ptDeck.pop());
        ptRenderHand();
        ptRenderDeck();
    } else {
        ptShowMessage('Keine Karten mehr im Deck!');
    }
}

function ptFlipCoin() {
    const result = Math.random() >= 0.5 ? '🌟 KOPF!' : '💀 ZAHL!';
    ptShowMessage('Münzwurf: ' + result);
}

// --- RENDER ---

function ptRenderAll() {
    ptRenderDeck();
    ptRenderHand();
    ptRenderPrizes();
    ptRenderDiscard();
    ptRenderField();
}

function ptRenderDeck() {
    const el = document.getElementById('ptDeckCount');
    if (el) el.innerText = ptDeck.length;
}

function ptRenderDiscard() {
    const el = document.getElementById('ptDiscardCount');
    if (el) el.innerText = ptDiscard.length;
    const pile = document.getElementById('ptDiscardPile');
    if (!pile) return;
    if (ptDiscard.length > 0) {
        const top = ptDiscard[ptDiscard.length - 1];
        pile.innerHTML = `<img src="${top.imageUrl}" alt="${top.name}"
            style="width:62px;border-radius:7px;cursor:pointer;display:block;
                   transition:transform 0.15s;border:2px solid rgba(255,255,255,0.25);"
            onmouseover="this.style.transform='scale(1.07)'"
            onmouseout="this.style.transform=''"
            onclick="ptShowDiscard()"
            onerror="this.src='images/card-back.png'"
            title="Ablage ansehen (${ptDiscard.length} Karten)">`;
    } else {
        pile.innerHTML = `<div class="pt-empty-slot"
            style="width:62px;height:87px;font-size:10px;cursor:pointer;"
            onclick="ptShowDiscard()">Ablage</div>`;
    }
}

function ptRenderPrizes() {
    const zone = document.getElementById('ptPrizeZone');
    if (!zone) return;
    zone.innerHTML = ptPrizes.map((card, i) => `
        <div style="position:relative;display:inline-block;">
            <img src="images/card-back.png" class="pt-prize-card"
                 title="Preiskarte nehmen (${i + 1})"
                 onclick="ptTakePrize(${i})"
                 onerror="this.src='images/card-back.png'">
            <button class="pt-prize-take-btn" onclick="ptTakePrize(${i})" title="Auf Hand nehmen">↩</button>
        </div>`
    ).join('');
}

function ptTakePrize(index) {
    const card = ptPrizes.splice(index, 1)[0];
    ptHand.push(card);
    ptShowMessage('Preiskarte gezogen!');
    ptRenderPrizes();
    ptRenderHand();
}

function ptRenderHand() {
    const zone = document.getElementById('ptHandZone');
    const cnt  = document.getElementById('ptHandCount');
    if (!zone) return;
    if (cnt) cnt.textContent = ptHand.length;
    zone.innerHTML = '';

    ptHand.forEach((card, i) => {
        const sel = i === ptSelectedCardIndex;

        const wrapper = document.createElement('div');
        wrapper.className = 'pt-hand-wrapper';
        wrapper.draggable = true;
        wrapper.ondragstart = e => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'hand_' + i);
            ptSelectedCardIndex = i;
        };

        const img = document.createElement('img');
        img.src       = card.imageUrl;
        img.alt       = card.name;
        img.title     = card.name;
        img.className = 'pt-hand-card' + (sel ? ' pt-card-selected' : '');
        img.onerror   = function () { this.src = 'images/card-back.png'; };
        img.onclick   = () => ptSelectHandCard(i);

        const discBtn = document.createElement('button');
        discBtn.className = 'pt-hand-disc-btn';
        discBtn.title     = 'Ablegen';
        discBtn.innerHTML = '🗑️';
        discBtn.onclick   = e => ptDiscardFromHand(i, e);

        wrapper.appendChild(img);
        wrapper.appendChild(discBtn);
        zone.appendChild(wrapper);
    });

    // Return-to-hand drop target at end of row
    const dropEnd = document.createElement('div');
    dropEnd.className     = 'pt-empty-slot';
    dropEnd.style.cssText = 'min-width:68px;height:98px;flex-shrink:0;font-size:10px;';
    dropEnd.textContent   = '+ Hand';
    dropEnd.ondragover    = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    dropEnd.ondrop        = e => { e.preventDefault(); _ptReturnSelectedToHand(); };
    dropEnd.onclick       = () => { if (ptSelectedCardIndex !== null) _ptReturnSelectedToHand(); };
    zone.appendChild(dropEnd);
}

function ptSelectHandCard(index) {
    ptSelectedCardIndex = (ptSelectedCardIndex === index) ? null : index;
    ptRenderHand();
    ptRenderField();   // refresh drop-target highlights on zones
}

function ptDiscardFromHand(index, event) {
    event.stopPropagation();
    const card = ptHand.splice(index, 1)[0];
    ptDiscard.push(card);
    ptSelectedCardIndex = null;
    ptRenderHand();
    ptRenderDiscard();
}

function _ptReturnSelectedToHand() {
    ptSelectedCardIndex = null;
    ptRenderHand();
    ptRenderField();
}

// --- FIELD RENDERING ---

function ptRenderField() {
    const activeZone = document.getElementById('ptActiveZone');
    if (activeZone) {
        activeZone.innerHTML = ptField.active.length > 0
            ? _ptFieldStackHTML(ptField.active, 'active')
            : _ptEmptySlotHTML('active', 'Aktiv', 102);
    }
    for (let i = 0; i < 5; i++) {
        const el  = document.getElementById('ptBench' + i);
        const key = 'bench' + i;
        if (!el) continue;
        el.innerHTML = ptField[key].length > 0
            ? _ptFieldStackHTML(ptField[key], key)
            : _ptEmptySlotHTML(key, 'Bank ' + (i + 1), 82);
    }
}

function _ptFieldStackHTML(stack, zone) {
    const pokemon  = stack[0];
    const attached = stack.slice(1);
    const dmg      = ptDamage[pokemon.ptId] || 0;
    const status   = ptStatus[pokemon.ptId]  || null;
    const width    = zone === 'active' ? 102 : 82;

    const dmgBadge = dmg > 0
        ? `<div class="pt-damage-badge">${dmg}</div>` : '';
    const statusBadge = status
        ? `<div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,0.75);
                       color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;
                       border:1px solid rgba(255,255,255,0.3);">${status.toUpperCase()}</div>` : '';

    const energyRow = attached.length > 0 ? `
        <div style="display:flex;flex-wrap:wrap;gap:2px;padding:3px 4px;
                    background:rgba(0,0,0,0.4);border-radius:0 0 7px 7px;">
            ${attached.map((a, ei) => `
                <img src="${a.imageUrl}" alt="${a.name}"
                     title="${a.name} — klicken zum Entfernen"
                     style="width:22px;height:22px;border-radius:50%;object-fit:cover;
                            cursor:pointer;border:1px solid rgba(255,255,255,0.4);"
                     onclick="ptRemoveAttached('${zone}',${ei + 1},event)"
                     onerror="this.src='images/card-back.png'">
            `).join('')}
        </div>` : '';

    const imgRadius = attached.length > 0 ? '7px 7px 0 0' : '7px';

    return `
        <div class="pt-field-card" style="width:${width}px;"
             draggable="true"
             ondragstart="event.dataTransfer.effectAllowed='move';
                          event.dataTransfer.setData('text/plain','field_${zone}');"
             ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';"
             ondrop="ptDropToField('${zone}',event)"
             onclick="ptClickField('${zone}')">
            <img src="${pokemon.imageUrl}" alt="${pokemon.name}"
                 style="width:100%;border-radius:${imgRadius};display:block;"
                 onerror="this.src='images/card-back.png'">
            ${dmgBadge}
            ${statusBadge}
            ${energyRow}
            <div class="pt-field-actions">
                <button class="pt-action-btn" onclick="ptAddDmg('${zone}',10,event)">+10</button>
                <button class="pt-action-btn" onclick="ptAddDmg('${zone}',-10,event)">-10</button>
                <button class="pt-action-btn" onclick="ptSetStatus('${zone}',event)">💤</button>
                <button class="pt-action-btn" onclick="ptReturnToHand('${zone}',event)" title="Auf Hand">↩</button>
                <button class="pt-action-btn red" onclick="ptSendToDiscard('${zone}',event)" title="Ablegen">🗑</button>
            </div>
        </div>`;
}

function _ptEmptySlotHTML(zone, label, width) {
    const isTarget = ptSelectedCardIndex !== null;
    return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                 style="width:${width}px;height:${Math.round(width * 1.38)}px;"
                 ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';"
                 ondrop="ptDropToField('${zone}',event)"
                 onclick="ptClickField('${zone}')">${label}</div>`;
}

function ptClickField(zone) {
    if (ptSelectedCardIndex === null) return;
    const card = ptHand.splice(ptSelectedCardIndex, 1)[0];
    ptSelectedCardIndex = null;
    ptField[zone].push(card);
    ptRenderHand();
    ptRenderField();
}

function ptDropToField(zone, event) {
    event.preventDefault();
    const data = event.dataTransfer.getData('text/plain');
    if (data.startsWith('hand_')) {
        const idx = parseInt(data.split('_')[1], 10);
        if (!isNaN(idx) && idx >= 0 && idx < ptHand.length) {
            ptSelectedCardIndex = idx;
            ptClickField(zone);
        }
    }
}

// --- FIELD CARD ACTIONS ---

function ptAddDmg(zone, amount, event) {
    event.stopPropagation();
    if (ptField[zone].length === 0) return;
    const id = ptField[zone][0].ptId;
    ptDamage[id] = Math.max(0, (ptDamage[id] || 0) + amount);
    ptRenderField();
}

const _ptStatusCycle = ['', 'poison', 'burn', 'asleep', 'paralyzed', 'confused'];
function ptSetStatus(zone, event) {
    event.stopPropagation();
    if (ptField[zone].length === 0) return;
    const id  = ptField[zone][0].ptId;
    const cur = ptStatus[id] || '';
    const idx = _ptStatusCycle.indexOf(cur);
    ptStatus[id] = _ptStatusCycle[(idx + 1) % _ptStatusCycle.length];
    ptShowMessage(ptStatus[id]
        ? zone.toUpperCase() + ' ist jetzt: ' + ptStatus[id].toUpperCase()
        : 'Status entfernt');
    ptRenderField();
}

function ptReturnToHand(zone, event) {
    event.stopPropagation();
    if (ptField[zone].length === 0) return;
    ptHand.push(...ptField[zone].splice(0));
    ptSelectedCardIndex = null;
    ptRenderHand();
    ptRenderField();
}

function ptSendToDiscard(zone, event) {
    event.stopPropagation();
    if (ptField[zone].length === 0) return;
    ptDiscard.push(...ptField[zone].splice(0));
    ptSelectedCardIndex = null;
    ptRenderField();
    ptRenderDiscard();
}

function ptRemoveAttached(zone, stackIdx, event) {
    event.stopPropagation();
    const card = ptField[zone].splice(stackIdx, 1)[0];
    if (card) ptHand.push(card);
    ptRenderHand();
    ptRenderField();
}

// --- DISCARD VIEWER ---

function ptShowDiscard() {
    const modal = document.getElementById('ptDiscardModal');
    const grid  = document.getElementById('ptDiscardGrid');
    if (!modal || !grid) return;
    if (ptDiscard.length === 0) return;
    grid.innerHTML = ptDiscard.map((c, i) => `
        <div style="position:relative;cursor:pointer;" title="${c.name} — Klicken für Hand">
            <img src="${c.imageUrl}" alt="${c.name}"
                 style="width:82px;border-radius:6px;display:block;"
                 onerror="this.src='images/card-back.png'"
                 onclick="ptRecoverDiscard(${i})">
            <div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.65);
                        color:#fff;font-size:9px;padding:2px 4px;border-radius:0 0 6px 6px;
                        overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${c.name}</div>
        </div>`
    ).join('');
    modal.style.display = 'flex';
}

function ptCloseDiscardModal() {
    const m = document.getElementById('ptDiscardModal');
    if (m) m.style.display = 'none';
}

function ptRecoverDiscard(idx) {
    const c = ptDiscard.splice(idx, 1)[0];
    if (c) ptHand.push(c);
    ptRenderHand();
    ptRenderDiscard();
    ptCloseDiscardModal();
}

// --- BOARD FLIP ---

let isBoardFlipped = false;

function ptFlipBoard(btn) {
    const board = document.getElementById('playtester-board');
    if (!board) return;
    isBoardFlipped = !isBoardFlipped;
    board.style.transform = isBoardFlipped ? 'rotate(180deg)' : 'rotate(0deg)';
    btn.innerText = isBoardFlipped ? '🔄 Reset Board' : '🔄 Flip Board';
    ptShowMessage(isBoardFlipped ? 'Spieler 2 Perspektive!' : 'Spielfeld zurückgesetzt');
}

// Alias so that hand-crafted HTML can call ptClickZone() too
function ptClickZone(zoneId) { ptClickField(zoneId); }

// --- MESSAGES ---

function ptShowMessage(msg) {
    const el = document.getElementById('ptMessage');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '0';
    setTimeout(() => { if (el) el.style.opacity = '1'; }, 50);
    clearTimeout(_ptMsgTimer);
    _ptMsgTimer = setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}