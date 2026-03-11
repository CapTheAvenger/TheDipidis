// =============================================================
// GOLDFISHING PLAYTESTER — js/playtester.js
// Single-player "sandbox" table to test your deck's opening
// turns without needing an opponent.
// =============================================================

'use strict';

// ── State ────────────────────────────────────────────────────
let _ptDeck     = [];
let _ptHand     = [];
let _ptActive   = null;                           // {card, damage, attached:[]}
let _ptBench    = [null, null, null, null, null]; // [{card, damage, attached[]} | null]
let _ptDiscard  = [];
let _ptPrizes   = [];                             // [{card, revealed}]
let _ptSelected = null;                           // {source:'hand'|'active'|'bench', index}
let _ptDragSrc  = null;                           // same shape, for HTML5 drag

// ── Open / Close ─────────────────────────────────────────────
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

    // Flatten deck  (_simFindCard is defined in draw-simulator.js)
    _ptDeck = [];
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
        for (let i = 0; i < count; i++) _ptDeck.push({ name: cardName, imageUrl });
    }

    const modal = document.getElementById('playtesterModal');
    if (modal) modal.style.display = 'flex';
    _ptSetup();
}

function closePlaytester() {
    const modal = document.getElementById('playtesterModal');
    if (modal) modal.style.display = 'none';
    _ptSelected = null;
    _ptDragSrc  = null;
}

// ── Setup (new game) ─────────────────────────────────────────
function _ptSetup() {
    _ptActive   = null;
    _ptBench    = [null, null, null, null, null];
    _ptHand     = [];
    _ptDiscard  = [];
    _ptSelected = null;
    _ptDragSrc  = null;

    _shuffleFisherYates(_ptDeck);              // reuses helper from draw-simulator.js
    _ptPrizes = _ptDeck.splice(0, 6).map(c => ({ card: c, revealed: false }));
    _ptHand   = _ptDeck.splice(0, 7);

    _ptShowMsg('🃏 Spiel gestartet! Klicke eine Handkarte an, dann eine Zone zum Platzieren.');
    _ptRender();
}

// ── Actions ───────────────────────────────────────────────────
function ptNewGame() {
    if (!confirm('Neues Spiel starten? Der aktuelle Spielstand geht verloren.')) return;
    const all = [
        ..._ptDeck,
        ..._ptHand,
        ...(_ptActive ? [_ptActive.card, ..._ptActive.attached] : []),
        ..._ptBench.flatMap(s => s ? [s.card, ...s.attached] : []),
        ..._ptDiscard,
        ..._ptPrizes.map(p => p.card),
    ];
    _ptDeck = all;
    _ptSetup();
}

function ptDraw1() {
    if (_ptDeck.length === 0) { _ptShowMsg('⚠️ Deck ist leer!'); return; }
    _ptHand.push(_ptDeck.shift());
    _ptRender();
}

function ptShuffle() {
    _shuffleFisherYates(_ptDeck);
    _ptShowMsg('🔀 Deck gemischt!');
    _ptRender();
}

function ptFlipCoin() {
    _ptShowMsg(Math.random() < 0.5 ? '🌟 KOPF!' : '💀 ZAHL!');
}

let _ptMsgTimer = null;
function _ptShowMsg(txt) {
    const el = document.getElementById('ptMessage');
    if (!el) return;
    el.textContent = txt;
    clearTimeout(_ptMsgTimer);
    _ptMsgTimer = setTimeout(() => { if (el) el.textContent = ''; }, 2800);
}

// ── Selection & Click-to-Place ────────────────────────────────
function ptSelectHand(index) {
    if (_ptSelected && _ptSelected.source === 'hand' && _ptSelected.index === index) {
        _ptSelected = null;   // deselect on second click
    } else {
        _ptSelected = { source: 'hand', index };
    }
    _ptRender();
}

/** Unified zone click handler:
 *  - If something is selected → place/attach it here
 *  - If nothing selected + zone has card → select that card (to move it) */
function ptClickZone(zone, idx) {
    if (_ptSelected) {
        ptPlaceSelected(zone, idx);
    } else {
        const hasCard = (zone === 'active' && _ptActive) ||
                        (zone === 'bench'  && _ptBench[idx]);
        if (hasCard) {
            _ptSelected = { source: zone, index: idx };
            _ptRender();
        }
    }
}

function ptPlaceSelected(targetZone, targetIdx) {
    if (!_ptSelected) return;
    const { source, index } = _ptSelected;
    _ptSelected = null;

    // Extract card from its current location
    let card = null;
    if (source === 'hand') {
        if (index < 0 || index >= _ptHand.length) { _ptRender(); return; }
        card = _ptHand.splice(index, 1)[0];
    } else if (source === 'active') {
        if (!_ptActive) { _ptRender(); return; }
        card = _ptActive.card;
        _ptActive = null;
    } else if (source === 'bench') {
        if (!_ptBench[index]) { _ptRender(); return; }
        card = _ptBench[index].card;
        _ptBench[index] = null;
    }
    if (!card) { _ptRender(); return; }

    // Place into target
    if (targetZone === 'active') {
        if (_ptActive) _ptActive.attached.push(card);          // occupied → attach
        else           _ptActive = { card, damage: 0, attached: [] };
    } else if (targetZone === 'bench') {
        if (_ptBench[targetIdx]) _ptBench[targetIdx].attached.push(card);  // attach
        else                     _ptBench[targetIdx] = { card, damage: 0, attached: [] };
    } else if (targetZone === 'discard') {
        _ptDiscard.push(card);
    } else {   // 'hand' / fallback
        _ptHand.push(card);
    }
    _ptRender();
}

// ── Field card quick-actions ──────────────────────────────────
function ptReturnToHand(zone, idx, e) {
    e && e.stopPropagation();
    if (zone === 'active' && _ptActive)  { _ptHand.push(_ptActive.card); _ptActive = null; }
    else if (zone === 'bench' && _ptBench[idx]) { _ptHand.push(_ptBench[idx].card); _ptBench[idx] = null; }
    _ptSelected = null;
    _ptRender();
}

function ptSendToDiscard(zone, idx, e) {
    e && e.stopPropagation();
    if (zone === 'active' && _ptActive)  { _ptDiscard.push(_ptActive.card); _ptActive = null; }
    else if (zone === 'bench' && _ptBench[idx]) { _ptDiscard.push(_ptBench[idx].card); _ptBench[idx] = null; }
    else if (zone === 'hand') { const c = _ptHand.splice(idx, 1)[0]; if (c) _ptDiscard.push(c); }
    _ptSelected = null;
    _ptRender();
}

function ptAddDamage(zone, idx, amount, e) {
    e && e.stopPropagation();
    if (zone === 'active' && _ptActive)
        _ptActive.damage = Math.max(0, (_ptActive.damage || 0) + amount);
    else if (zone === 'bench' && _ptBench[idx])
        _ptBench[idx].damage = Math.max(0, (_ptBench[idx].damage || 0) + amount);
    _ptRender();
}

function ptRemoveAttached(zone, pokIdx, enIdx, e) {
    e && e.stopPropagation();
    let arr;
    if (zone === 'active' && _ptActive)            arr = _ptActive.attached;
    else if (zone === 'bench' && _ptBench[pokIdx]) arr = _ptBench[pokIdx].attached;
    if (arr) _ptHand.push(arr.splice(enIdx, 1)[0]);
    _ptRender();
}

function ptDiscardHandCard(idx, e) {
    e && e.stopPropagation();
    const c = _ptHand.splice(idx, 1)[0];
    if (c) _ptDiscard.push(c);
    if (_ptSelected && _ptSelected.source === 'hand') _ptSelected = null;
    _ptRender();
}

// ── Prize cards ───────────────────────────────────────────────
function ptFlipPrize(idx) {
    _ptPrizes[idx].revealed = !_ptPrizes[idx].revealed;
    _ptRenderPrizes();
}

function ptTakePrize(idx) {
    const p = _ptPrizes.splice(idx, 1)[0];
    if (p) _ptHand.push(p.card);
    _ptRender();
}

// ── Discard viewer ────────────────────────────────────────────
function ptShowDiscard() {
    if (_ptDiscard.length === 0) return;
    const modal = document.getElementById('ptDiscardModal');
    const grid  = document.getElementById('ptDiscardGrid');
    if (!modal || !grid) return;
    grid.innerHTML = _ptDiscard.map((c, i) => `
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
    const c = _ptDiscard.splice(idx, 1)[0];
    if (c) _ptHand.push(c);
    _ptRender();
    ptCloseDiscardModal();
}

// ── HTML5 Drag & Drop ─────────────────────────────────────────
function ptDragStart(e, source, idx) {
    _ptDragSrc = { source, index: idx };
    e.dataTransfer.effectAllowed = 'move';
}

function ptDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function ptDrop(e, zone, idx) {
    e.preventDefault();
    if (!_ptDragSrc) return;
    _ptSelected = _ptDragSrc;
    _ptDragSrc  = null;
    ptPlaceSelected(zone, idx);
}

// ── Render helpers ────────────────────────────────────────────
function _ptRender() {
    _ptRenderTopBar();
    _ptRenderPrizes();
    _ptRenderActive();
    _ptRenderBench();
    _ptRenderDiscard();
    _ptRenderHand();
}

function _ptRenderTopBar() {
    const dc = document.getElementById('ptDeckCount');
    if (dc) dc.textContent = _ptDeck.length;
}

function _ptRenderPrizes() {
    const z = document.getElementById('ptPrizeZone');
    if (!z) return;
    z.innerHTML = _ptPrizes.map((p, i) => `
        <div style="position:relative;display:inline-block;">
            <img src="${p.revealed ? p.card.imageUrl : 'images/card-back.png'}"
                 class="pt-prize-card"
                 alt="${p.revealed ? p.card.name : 'Preis ' + (i + 1)}"
                 onerror="this.src='images/card-back.png'"
                 onclick="ptFlipPrize(${i})"
                 title="${p.revealed ? p.card.name : 'Klicken zum Aufdecken'}">
            <button class="pt-prize-take-btn" onclick="ptTakePrize(${i})" title="Auf Hand nehmen">↩</button>
        </div>`
    ).join('');
}

function _ptRenderDiscard() {
    const cnt  = document.getElementById('ptDiscardCount');
    if (cnt) cnt.textContent = _ptDiscard.length;
    const pile = document.getElementById('ptDiscardPile');
    if (!pile) return;
    if (_ptDiscard.length > 0) {
        const top = _ptDiscard[_ptDiscard.length - 1];
        pile.innerHTML = `<img src="${top.imageUrl}" alt="Ablage"
            style="width:62px;border-radius:7px;cursor:pointer;display:block;
                   transition:transform 0.15s;border:2px solid rgba(255,255,255,0.25);"
            onmouseover="this.style.transform='scale(1.07)'"
            onmouseout="this.style.transform=''"
            onclick="ptShowDiscard()"
            onerror="this.src='images/card-back.png'"
            title="Ablage ansehen (${_ptDiscard.length} Karten)">`;
    } else {
        pile.innerHTML = '<div class="pt-empty-slot" style="width:62px;height:87px;font-size:10px;">Ablage</div>';
    }
}

function _ptFieldSlotHTML(slot, zone, idx) {
    const sel       = _ptSelected && _ptSelected.source === zone && _ptSelected.index === idx;
    const dmgBadge  = slot.damage > 0
        ? `<div class="pt-damage-badge">${slot.damage}</div>` : '';
    const hasEnergy = slot.attached.length > 0;
    const energyRow = hasEnergy
        ? `<div style="display:flex;flex-wrap:wrap;gap:2px;padding:3px 4px;
                       background:rgba(0,0,0,0.4);border-radius:0 0 7px 7px;">
            ${slot.attached.map((a, ei) => `
                <img src="${a.imageUrl}" alt="${a.name}"
                     title="${a.name} (klicken zum Entfernen)"
                     style="width:22px;height:22px;border-radius:50%;
                            object-fit:cover;cursor:pointer;border:1px solid rgba(255,255,255,0.4);"
                     onclick="ptRemoveAttached('${zone}',${idx},${ei},event)"
                     onerror="this.src='images/card-back.png'">`
            ).join('')}
           </div>` : '';

    const imgRadius = hasEnergy ? '7px 7px 0 0' : '7px';

    return `
        <div class="pt-field-card${sel ? ' pt-card-selected' : ''}"
             draggable="true"
             ondragstart="ptDragStart(event,'${zone}',${idx})"
             onclick="ptClickZone('${zone}',${idx})"
             ondragover="ptDragOver(event)"
             ondrop="ptDrop(event,'${zone}',${idx})">
            <img src="${slot.card.imageUrl}" alt="${slot.card.name}"
                 style="width:100%;border-radius:${imgRadius};display:block;"
                 onerror="this.src='images/card-back.png'">
            ${dmgBadge}
            ${energyRow}
            <div class="pt-field-actions">
                <button class="pt-action-btn" onclick="ptAddDamage('${zone}',${idx},10,event)">+10</button>
                <button class="pt-action-btn" onclick="ptAddDamage('${zone}',${idx},-10,event)">-10</button>
                <button class="pt-action-btn" onclick="ptReturnToHand('${zone}',${idx},event)" title="Auf Hand">↩</button>
                <button class="pt-action-btn red" onclick="ptSendToDiscard('${zone}',${idx},event)" title="Ablegen">🗑</button>
            </div>
        </div>`;
}

function _ptEmptySlotHTML(zone, idx, label) {
    const isTarget = _ptSelected !== null;
    return `<div class="pt-empty-slot${isTarget ? ' pt-drop-target' : ''}"
                 onclick="ptClickZone('${zone}',${idx})"
                 ondragover="ptDragOver(event)"
                 ondrop="ptDrop(event,'${zone}',${idx})">${label}</div>`;
}

function _ptRenderActive() {
    const z = document.getElementById('ptActiveZone');
    if (!z) return;
    z.innerHTML = _ptActive
        ? _ptFieldSlotHTML(_ptActive, 'active', 0)
        : _ptEmptySlotHTML('active', 0, 'Aktiv');
}

function _ptRenderBench() {
    for (let i = 0; i < 5; i++) {
        const z = document.getElementById(`ptBench${i}`);
        if (!z) continue;
        z.innerHTML = _ptBench[i]
            ? _ptFieldSlotHTML(_ptBench[i], 'bench', i)
            : _ptEmptySlotHTML('bench', i, `Bank ${i + 1}`);
    }
}

function _ptRenderHand() {
    const zone = document.getElementById('ptHandZone');
    const cnt  = document.getElementById('ptHandCount');
    if (!zone) return;
    if (cnt) cnt.textContent = _ptHand.length;

    zone.innerHTML = '';

    _ptHand.forEach((card, i) => {
        const sel = _ptSelected && _ptSelected.source === 'hand' && _ptSelected.index === i;

        const wrapper = document.createElement('div');
        wrapper.className = 'pt-hand-wrapper';
        wrapper.draggable = true;
        wrapper.ondragstart = e => ptDragStart(e, 'hand', i);

        const img = document.createElement('img');
        img.src       = card.imageUrl;
        img.alt       = card.name;
        img.title     = card.name;
        img.className = 'pt-hand-card' + (sel ? ' pt-card-selected' : '');
        img.onerror   = function () { this.src = 'images/card-back.png'; };
        img.onclick   = () => ptSelectHand(i);

        const discBtn = document.createElement('button');
        discBtn.className = 'pt-hand-disc-btn';
        discBtn.title     = 'Ablegen';
        discBtn.innerHTML = '🗑';
        discBtn.onclick   = e => ptDiscardHandCard(i, e);

        wrapper.appendChild(img);
        wrapper.appendChild(discBtn);
        zone.appendChild(wrapper);
    });

    // Return-to-hand drop target at end of hand row
    const dropEnd = document.createElement('div');
    dropEnd.className   = 'pt-empty-slot';
    dropEnd.style.cssText = 'min-width:68px;height:98px;flex-shrink:0;font-size:10px;';
    dropEnd.textContent = '+ Hand';
    dropEnd.ondragover  = ptDragOver;
    dropEnd.ondrop      = e => ptDrop(e, 'hand', -1);
    dropEnd.onclick     = () => ptPlaceSelected('hand', -1);
    zone.appendChild(dropEnd);
}
