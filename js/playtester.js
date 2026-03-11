/**
 * ============================================================================
 * GOLDFISHING PLAYTESTER (SANDBOX) - FINAL
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

// Speichert Schaden fuer jede Zone (z.B. ptDamage['active'] = 30)
let ptDamage = { active: 0, bench0: 0, bench1: 0, bench2: 0, bench3: 0, bench4: 0 };

// Speichert Status-Effekte (nur fuer 'active' relevant)
let ptStatus = { active: [] };

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
        alert('Dein Deck ist leer! Fuege erst Karten hinzu.');
        return;
    }
    if (totalCards < 60) {
        if (!confirm(`Dein Deck hat nur ${totalCards}/60 Karten. Trotzdem starten?`)) return;
    }

    // Flatten {deckKey: count} to [{name, imageUrl, ptId}, ...]
    ptDeck = [];
    for (const [deckKey, count] of Object.entries(deckObj)) {
        if (!count || count <= 0) continue;
        let cardName = deckKey;
        let imageUrl = 'images/card-back.png';
        const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        if (m) {
            cardName = m[1];
            const cd = (typeof _simFindCard === 'function') ? _simFindCard(m[2], m[3]) : null;
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
    setupDragAndDrop();
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
    ptStatus  = { active: [] };
    ptSelectedCardIndex = null;
    isBoardFlipped = false;

    const board   = document.getElementById('playtester-board');
    const flipBtn = document.getElementById('flip-board-btn');
    if (board)   board.style.transform = 'rotate(0deg)';
    if (flipBtn) flipBtn.innerText = '🔄 Flip Board';

    ptShuffle();

    for (let i = 0; i < 7; i++) { if (ptDeck.length > 0) ptHand.push(ptDeck.pop()); }
    for (let i = 0; i < 6; i++) { if (ptDeck.length > 0) ptPrizes.push(ptDeck.pop()); }

    ptShowMessage('Spiel gestartet! Klicke oder ziehe Karten aufs Feld.');
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
    ptShowMessage('Muenzwurf: ' + result);
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

function ptPassTurn() {
    const messages = [];
    if (ptStatus.active && ptStatus.active.includes('poisoned')) {
        ptDamage.active += 10;
        messages.push('☠️ Gift: +10');
    }
    if (ptStatus.active && ptStatus.active.includes('burned')) {
        ptDamage.active += 20;
        messages.push('🔥 Verbrennung: +20');
    }
    ptRenderField();
    ptDraw1();
    if (messages.length > 0) {
        ptShowMessage(messages.join(' | ') + ' — Zug vorbei!');
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

// --- SCHADEN & STATUS ---

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

function toggleStatus(statusType, event) {
    event.stopPropagation();
    if (!ptStatus.active) ptStatus.active = [];
    const idx = ptStatus.active.indexOf(statusType);
    if (idx > -1) {
        ptStatus.active.splice(idx, 1);
    } else {
        ptStatus.active.push(statusType);
    }
    ptRenderField();
}

function returnToHand(zoneId, event) {
    event.stopPropagation();
    if (ptField[zoneId].length === 0) return;
    const card = ptField[zoneId].pop();
    ptHand.push(card);
    if (ptField[zoneId].length === 0) {
        ptDamage[zoneId] = 0;
        if (zoneId === 'active') ptStatus.active = [];
    }
    ptRenderField();
    ptRenderHand();
    ptShowMessage('Karte auf die Hand genommen.');
}

function discardTopCard(zoneId, event) {
    event.stopPropagation();
    if (ptField[zoneId].length === 0) return;
    const discardedCard = ptField[zoneId].pop();
    ptDiscard.push(discardedCard);
    if (ptField[zoneId].length === 0) {
        ptDamage[zoneId] = 0;
        if (zoneId === 'active') ptStatus.active = [];
    }
    ptRenderField();
    ptRenderDiscard();
    ptShowMessage('Karte abgelegt.');
}

// --- DRAG & DROP ---

function setupDragAndDrop() {
    const zones = ['ptActiveZone', 'ptBench0', 'ptBench1', 'ptBench2', 'ptBench3', 'ptBench4'];
    zones.forEach(zoneId => {
        const element = document.getElementById(zoneId);
        if (!element) return;
        element.addEventListener('dragover', (e) => {
            e.preventDefault();
            element.querySelector('.pt-empty-slot')?.classList.add('pt-drop-target');
        });
        element.addEventListener('dragleave', () => {
            element.querySelector('.pt-empty-slot')?.classList.remove('pt-drop-target');
        });
        element.addEventListener('drop', (e) => {
            e.preventDefault();
            element.querySelector('.pt-empty-slot')?.classList.remove('pt-drop-target');
            const data = e.dataTransfer.getData('text/plain');
            if (data !== '') {
                ptSelectedCardIndex = parseInt(data);
                // 'ptActiveZone' -> 'active', 'ptBench0' -> 'bench0'
                const targetZone = zoneId.replace('pt', '').replace('Zone', '').toLowerCase();
                ptClickZone(targetZone);
            }
        });
    });
}

function ptDragStart(event, index) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
    ptSelectedCardIndex = index;
    ptRenderHand();
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
    if (ptDiscard.length === 0) { ptShowMessage('Ablage ist leer.'); return; }
    grid.innerHTML = ptDiscard.map((c, i) => `
        <div style="position:relative;cursor:pointer;" title="${c.name}">
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
        wrapper.ondragstart = e => ptDragStart(e, i);

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

    // Drop target at end of hand row (return field card to hand via drag)
    const dropEnd = document.createElement('div');
    dropEnd.className     = 'pt-empty-slot';
    dropEnd.style.cssText = 'min-width:68px;height:98px;flex-shrink:0;font-size:10px;';
    dropEnd.textContent   = '+ Hand';
    dropEnd.ondragover    = e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
    dropEnd.ondrop        = e => { e.preventDefault(); ptSelectedCardIndex = null; ptRenderHand(); ptRenderField(); };
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

// --- FIELD RENDER LOGIK ---

function ptRenderField() {
    document.getElementById('ptActiveZone').innerHTML = generateZoneHTML('active', 'Active');
    for (let i = 0; i < 5; i++) {
        document.getElementById('ptBench' + i).innerHTML = generateZoneHTML('bench' + i, 'Bank ' + (i + 1));
    }
}

function generateZoneHTML(zoneId, labelText) {
    const cards    = ptField[zoneId];
    const isTarget = ptSelectedCardIndex !== null;
    const width    = zoneId === 'active' ? 102 : 82;
    const height   = Math.round(width * 1.38);

    // Empty zone
    if (cards.length === 0) {
        return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                     style="width:${width}px;height:${height}px;"
                     ondragover="event.preventDefault();event.dataTransfer.dropEffect='move';"
                     ondrop="event.preventDefault();ptClickZone('${zoneId}')"
                     onclick="ptClickZone('${zoneId}')">${labelText}</div>`;
    }

    // Zone with cards
    let html = `<div style="position:relative;width:${width}px;cursor:pointer;min-height:${height}px;"
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

    // Status buttons — only for active zone
    let statusButtons = '';
    if (zoneId === 'active') {
        const isPoisoned = ptStatus.active && ptStatus.active.includes('poisoned') ? ' red' : '';
        const isBurned   = ptStatus.active && ptStatus.active.includes('burned')   ? ' red' : '';
        statusButtons = `
            <button class="pt-action-btn${isPoisoned}" onclick="toggleStatus('poisoned',event)" title="Vergiftet">☠️</button>
            <button class="pt-action-btn${isBurned}"   onclick="toggleStatus('burned',event)"   title="Verbrannt">🔥</button>`;
    }

    html += `
        <div class="pt-field-actions" style="z-index:100;">
            <button class="pt-action-btn" onclick="addDamage('${zoneId}',10,event)">+10</button>
            <button class="pt-action-btn" onclick="addDamage('${zoneId}',50,event)">+50</button>
            <button class="pt-action-btn" onclick="clearDamage('${zoneId}',event)">0</button>
            ${statusButtons}
            <button class="pt-action-btn" onclick="returnToHand('${zoneId}',event)" title="Auf Hand">↩</button>
            <button class="pt-action-btn red" onclick="discardTopCard('${zoneId}',event)" title="Ablegen">🗑</button>
        </div>`;

    // Damage badge
    if (ptDamage[zoneId] > 0) {
        html += `<div class="pt-damage-badge">${ptDamage[zoneId]}</div>`;
    }

    // Status badge (active zone)
    if (zoneId === 'active' && ptStatus.active && ptStatus.active.length > 0) {
        const icons = ptStatus.active.map(s => s === 'poisoned' ? '☠️' : '🔥').join('');
        html += `<div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,0.75);
                             color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;
                             border:1px solid rgba(255,255,255,0.3);z-index:50;">${icons}</div>`;
    }

    html += '</div>';
    return html;
}
