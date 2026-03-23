/**
 * ============================================================================
 * POKÉMON TCG PLAYTESTER - MOBILE TOUCH SUPPORT
 * ============================================================================
 * Ergänzt playtester.js um Touch-freundliche Tap-to-Action Steuerung
 */

// ══════════════════════════════════════════════════════════════════════════
// MOBILE STATE
// ══════════════════════════════════════════════════════════════════════════

let ptMobileSelected = null; // { player: 'p1', zone: 'active'|'bench0'|'hand', index: 0 }
let _ptTouchDragState = null;
let _ptTouchDragHoverZone = null;

// ══════════════════════════════════════════════════════════════════════════
// CONTEXT ACTION MENU (Bottom Sheet)
// ══════════════════════════════════════════════════════════════════════════

function ptShowContextMenu(cardInfo) {
    ptMobileSelected = cardInfo;
    const menu = document.getElementById('ptContextMenu');
    const actionsContainer = document.getElementById('ptContextActions');
    
    if (!menu || !actionsContainer) return;
    
    // Lösche alte Buttons
    actionsContainer.innerHTML = '';
    
    const { player, zone, index } = cardInfo;
    const card = _ptGetCardFromSelection(cardInfo);
    
    if (!card) {
        ptHideContextMenu();
        return;
    }
    
    // Zeige Karten-Info
    const cardNameEl = document.getElementById('ptContextCardName');
    if (cardNameEl) cardNameEl.textContent = card.name || 'Karte';
    
    // Erstelle dynamische Buttons basierend auf Zone
    const buttons = [];
    
    if (zone === 'hand') {
        // Karte auf der Hand
        // Play-Button für Trainer-Karten (Supporter, Item, Tool, Stadium)
        const ct = (card.cardType || card.supertype || '').toLowerCase();
        const isTrainer = ct === 'supporter' || ct === 'item' || ct === 'tool' || ct === 'stadium'
            || ct.includes('trainer') || ct.includes('supporter') || ct.includes('item');
        if (isTrainer) {
            buttons.push({ text: '▶ Karte spielen', action: () => { if (typeof ptPlayFromHand === 'function') ptPlayFromHand(index, null); } });
        }
        buttons.push({ text: '🎯 Als Aktives spielen', action: () => _ptMobilePlayToActive(player, index) });
        buttons.push({ text: '🪑 Auf die Bank', action: () => _ptMobilePlayToBench(player, index) });
        buttons.push({ text: '🗑️ Ablegen', action: () => _ptMobileDiscard(player, index) });
        buttons.push({ text: '🔀 Ins Deck mischen', action: () => _ptMobileShuffleIntoDeck(player, index) });
    } else if (zone === 'active') {
        // Aktives Pokémon
        buttons.push({ text: '🤚 Zurück auf die Hand', action: () => _ptMobileReturnToHand(player, 'active') });
        buttons.push({ text: '🗑️ Ablegen', action: () => _ptMobileDiscardFromField(player, 'active') });
        buttons.push({ text: '➕ Schaden +10', action: () => _ptMobileAdjustDamage(player, 'active', 10) });
        buttons.push({ text: '➖ Schaden -10', action: () => _ptMobileAdjustDamage(player, 'active', -10) });
        buttons.push({ text: '💥 K.O.', action: () => _ptMobileKnockout(player, 'active') });
    } else if (zone.startsWith('bench')) {
        // Bank-Pokémon
        buttons.push({ text: '🔄 Tausch zu Aktiv', action: () => _ptMobileSwitchToActive(player, zone) });
        buttons.push({ text: '🤚 Zurück auf die Hand', action: () => _ptMobileReturnToHand(player, zone) });
        buttons.push({ text: '🗑️ Ablegen', action: () => _ptMobileDiscardFromField(player, zone) });
        buttons.push({ text: '➕ Schaden +10', action: () => _ptMobileAdjustDamage(player, zone, 10) });
        buttons.push({ text: '➖ Schaden -10', action: () => _ptMobileAdjustDamage(player, zone, -10) });
        buttons.push({ text: '💥 K.O.', action: () => _ptMobileKnockout(player, zone) });
    }
    
    // Erstelle Button-Elemente
    buttons.forEach(btn => {
        const buttonEl = document.createElement('button');
        buttonEl.className = 'pt-context-btn';
        buttonEl.textContent = btn.text;
        buttonEl.onclick = () => {
            btn.action();
            ptHideContextMenu();
        };
        actionsContainer.appendChild(buttonEl);
    });

    // Limitless TCG Link via DOM API erstellen (vermeidet stringbasiertes onclick HTML)
    const setCodeRaw = card.set_code || card.set;
    const setNumberRaw = card.set_number || card.number;
    if (setCodeRaw && setNumberRaw) {
        const setCode = String(setCodeRaw).toUpperCase().trim();
        const setNumber = String(setNumberRaw).trim();
        const limitlessUrl = `https://limitlesstcg.com/cards/${setCode}/${setNumber}`;

        const limitlessBtn = document.createElement('button');
        limitlessBtn.className = 'context-menu-btn limitless-btn';
        limitlessBtn.style.display = 'flex';
        limitlessBtn.style.alignItems = 'center';
        limitlessBtn.style.justifyContent = 'space-between';
        limitlessBtn.style.width = '100%';
        limitlessBtn.style.padding = '10px';
        limitlessBtn.style.background = '#2c3e50';
        limitlessBtn.style.color = 'white';
        limitlessBtn.style.border = 'none';
        limitlessBtn.style.borderRadius = '6px';
        limitlessBtn.style.marginTop = '8px';
        limitlessBtn.style.fontWeight = 'bold';
        limitlessBtn.style.cursor = 'pointer';
        limitlessBtn.style.transition = 'background 0.2s';

        const label = document.createElement('span');
        label.textContent = '📊 Auf Limitless ansehen';
        const arrow = document.createElement('span');
        arrow.style.fontSize = '1.2em';
        arrow.textContent = '↗';

        limitlessBtn.appendChild(label);
        limitlessBtn.appendChild(arrow);
        limitlessBtn.addEventListener('click', () => {
            window.open(limitlessUrl, '_blank');
            ptHideContextMenu();
        });

        actionsContainer.appendChild(limitlessBtn);
    }
    
    // Zeige Menu
    menu.classList.add('active');
    
    // Visuelles Feedback: Markiere die ausgewählte Karte
    _ptHighlightSelectedCard(cardInfo);
}

function ptHideContextMenu() {
    const menu = document.getElementById('ptContextMenu');
    if (menu) menu.classList.remove('active');
    _ptClearHighlights();
    ptMobileSelected = null;
}

// ══════════════════════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════════════════════

function _ptGetCardFromSelection({ player, zone, index }) {
    if (!ptState[player]) return null;
    
    if (zone === 'hand') {
        return ptState[player].hand[index];
    } else if (zone === 'active' || zone.startsWith('bench')) {
        return ptState[player].field[zone]?.[0];
    }
    return null;
}

function _ptHighlightSelectedCard({ player, zone, index }) {
    // Entferne alte Highlights
    _ptClearHighlights();
    
    // Finde und markiere die Karte
    let selector = '';
    if (zone === 'hand') {
        selector = `#ptHandZone .pt-hand-wrapper:nth-child(${index + 1})`;
    } else if (zone === 'active') {
        selector = `#ptActiveZone-${player}`;
    } else if (zone.startsWith('bench')) {
        const benchNum = zone.replace('bench', '');
        selector = `#ptBench${benchNum}-${player}`;
    }
    
    const el = document.querySelector(selector);
    if (el) el.classList.add('pt-selected');
}

function _ptClearHighlights() {
    document.querySelectorAll('.pt-selected').forEach(el => el.classList.remove('pt-selected'));
}

function _ptTouchTargetZoneFromElement(el) {
    if (!el) return null;
    const zoneEl = el.closest('.pt-dropzone');
    if (!zoneEl || !zoneEl.id) return null;

    const id = zoneEl.id;
    if (id === 'ptStadiumZone') return 'stadium';
    if (id === 'ptPlayZone') return 'playzone';
    if (id === 'ptHandZone') return 'hand';
    if (id === 'ptPlayDrop-p1') return 'p1-play';
    if (id === 'ptPlayDrop-p2') return 'p2-play';
    if (id === 'ptDiscardPile-p1') return 'p1-discard';
    if (id === 'ptDiscardPile-p2') return 'p2-discard';
    if (id === 'ptLostPile-p1') return 'p1-lost';
    if (id === 'ptLostPile-p2') return 'p2-lost';
    if (id === 'ptActiveZone-p1') return 'p1-active';
    if (id === 'ptActiveZone-p2') return 'p2-active';

    const benchMatch = id.match(/^ptBench(\d)-(p1|p2)$/i);
    if (benchMatch) return `${benchMatch[2]}-bench${benchMatch[1]}`;

    return null;
}

function _ptTouchDragClearUI() {
    if (_ptTouchDragHoverZone) {
        _ptTouchDragHoverZone.classList.remove('drag-over');
        _ptTouchDragHoverZone = null;
    }
    if (_ptTouchDragState && _ptTouchDragState.ghostEl) {
        _ptTouchDragState.ghostEl.remove();
    }
}

function _ptTouchDragCreateGhost(sourceWrapper) {
    const img = sourceWrapper ? sourceWrapper.querySelector('.pt-hand-card') : null;
    if (!img) return null;
    const ghost = img.cloneNode(true);
    ghost.style.position = 'fixed';
    ghost.style.zIndex = '30002';
    ghost.style.pointerEvents = 'none';
    ghost.style.width = Math.max(44, Math.round(img.getBoundingClientRect().width)) + 'px';
    ghost.style.height = 'auto';
    ghost.style.borderRadius = '8px';
    ghost.style.opacity = '0.92';
    ghost.style.boxShadow = '0 8px 22px rgba(0,0,0,0.55)';
    ghost.style.transform = 'translate(-50%, -50%)';
    document.body.appendChild(ghost);
    return ghost;
}

function _ptMobileDropHandCard(handIndex, targetZone, clientX) {
    if (typeof ptClickZone !== 'function') return;
    if (!ptState[ptCurrentPlayer] || handIndex < 0 || handIndex >= ptState[ptCurrentPlayer].hand.length) return;

    ptSelectedCardIndex = handIndex;

    if (targetZone === 'stadium') ptClickZone(ptCurrentPlayer, 'stadium');
    else if (targetZone === 'playzone') ptClickZone(ptCurrentPlayer, 'playzone');
    else if (targetZone === 'p1-active') ptClickZone('p1', 'active');
    else if (targetZone === 'p2-active') ptClickZone('p2', 'active');
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
    else if (targetZone === 'p1-play' || targetZone === 'p2-play') {
        if (typeof ptPlayFromHand === 'function') ptPlayFromHand(handIndex, null);
    } else if (targetZone === 'p1-discard') {
        const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
        if (c) { ptState.p1.discard.push(c); if (typeof ptLog === 'function') ptLog(`Discarded "${c.name}".`); }
        ptSelectedCardIndex = null;
        if (typeof ptRenderAll === 'function') ptRenderAll();
    } else if (targetZone === 'p2-discard') {
        const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
        if (c) { ptState.p2.discard.push(c); if (typeof ptLog === 'function') ptLog(`Discarded "${c.name}".`); }
        ptSelectedCardIndex = null;
        if (typeof ptRenderAll === 'function') ptRenderAll();
    } else if (targetZone === 'p1-lost') {
        const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
        if (c) { ptState.p1.lostzone.push(c); if (typeof ptLog === 'function') ptLog(`Sent "${c.name}" to Lost Zone.`); }
        ptSelectedCardIndex = null;
        if (typeof ptRenderAll === 'function') ptRenderAll();
    } else if (targetZone === 'p2-lost') {
        const c = ptState[ptCurrentPlayer].hand.splice(ptSelectedCardIndex, 1)[0];
        if (c) { ptState.p2.lostzone.push(c); if (typeof ptLog === 'function') ptLog(`Sent "${c.name}" to Lost Zone.`); }
        ptSelectedCardIndex = null;
        if (typeof ptRenderAll === 'function') ptRenderAll();
    } else if (targetZone === 'hand') {
        const hand = ptState[ptCurrentPlayer].hand;
        const handEl = document.getElementById('ptHandZone');
        const wrappers = handEl ? [...handEl.querySelectorAll('.pt-hand-wrapper')] : [];
        const afterEl = (typeof getDragAfterElement === 'function' && handEl)
            ? getDragAfterElement(handEl, clientX)
            : null;
        let targetIdx = afterEl ? wrappers.indexOf(afterEl) : hand.length;
        if (targetIdx === -1) targetIdx = hand.length;
        if (targetIdx !== handIndex) {
            const [card] = hand.splice(handIndex, 1);
            const insertAt = targetIdx > handIndex ? targetIdx - 1 : targetIdx;
            hand.splice(insertAt, 0, card);
        }
        ptSelectedCardIndex = null;
        if (typeof ptRenderAll === 'function') ptRenderAll();
    }
}

function ptMobileHandTouchStart(event, handIndex, wrapperEl) {
    if (!event.touches || event.touches.length !== 1) return;
    const t = event.touches[0];
    _ptTouchDragState = {
        handIndex,
        wrapperEl,
        startX: t.clientX,
        startY: t.clientY,
        dragging: false,
        ghostEl: null
    };
}

function ptMobileHandTouchMove(event) {
    if (!_ptTouchDragState || !event.touches || event.touches.length !== 1) return;
    const t = event.touches[0];
    const dx = t.clientX - _ptTouchDragState.startX;
    const dy = t.clientY - _ptTouchDragState.startY;
    const dist = Math.hypot(dx, dy);

    if (!_ptTouchDragState.dragging && dist > 10) {
        _ptTouchDragState.dragging = true;
        _ptTouchDragState.ghostEl = _ptTouchDragCreateGhost(_ptTouchDragState.wrapperEl);
    }
    if (!_ptTouchDragState.dragging) return;

    event.preventDefault();

    if (_ptTouchDragState.ghostEl) {
        _ptTouchDragState.ghostEl.style.left = t.clientX + 'px';
        _ptTouchDragState.ghostEl.style.top = t.clientY + 'px';
    }

    const under = document.elementFromPoint(t.clientX, t.clientY);
    const zoneEl = under ? under.closest('.pt-dropzone') : null;
    if (_ptTouchDragHoverZone !== zoneEl) {
        if (_ptTouchDragHoverZone) _ptTouchDragHoverZone.classList.remove('drag-over');
        _ptTouchDragHoverZone = zoneEl;
        if (_ptTouchDragHoverZone) _ptTouchDragHoverZone.classList.add('drag-over');
    }
}

function ptMobileHandTouchEnd(event) {
    if (!_ptTouchDragState) return;
    const wasDragging = _ptTouchDragState.dragging;

    if (wasDragging) {
        event.preventDefault();
        const t = (event.changedTouches && event.changedTouches[0]) ? event.changedTouches[0] : null;
        const clientX = t ? t.clientX : _ptTouchDragState.startX;
        const clientY = t ? t.clientY : _ptTouchDragState.startY;
        const under = document.elementFromPoint(clientX, clientY);
        const targetZone = _ptTouchTargetZoneFromElement(under);
        if (targetZone) {
            _ptMobileDropHandCard(_ptTouchDragState.handIndex, targetZone, clientX);
        }
    }

    _ptTouchDragClearUI();
    _ptTouchDragState = null;
}

// ══════════════════════════════════════════════════════════════════════════
// MOBILE ACTIONS
// ══════════════════════════════════════════════════════════════════════════

function _ptMobilePlayToActive(player, handIndex) {
    if (typeof ptClickZone !== 'undefined') {
        ptSelectedCardIndex = handIndex;
        if (typeof ptUpdateAttachModeFromSelection === 'function') ptUpdateAttachModeFromSelection(player);
        ptClickZone(player, 'active');
    }
    ptHideContextMenu();
}

function _ptMobilePlayToBench(player, handIndex) {
    // Keep card selected so player can tap the exact bench slot/Pokemon.
    ptSelectedCardIndex = handIndex;
    if (typeof ptUpdateAttachModeFromSelection === 'function') ptUpdateAttachModeFromSelection(player);
    if (typeof ptRenderHand === 'function') ptRenderHand();
    if (typeof ptShowMessage === 'function') {
        ptShowMessage('Wähle jetzt dein gewünschtes Bank-Pokémon oder einen freien Bank-Slot.');
    } else if (typeof showToast === 'function') {
        showToast('Wähle jetzt dein gewünschtes Bank-Pokémon oder einen freien Bank-Slot.', 'info');
    }
    ptHideContextMenu();
}

function _ptMobileDiscard(player, handIndex) {
    const card = ptState[player].hand.splice(handIndex, 1)[0];
    if (card) {
        ptState[player].discard.push(card);
        if (typeof ptLog !== 'undefined') ptLog(`"${card.name}" abgelegt.`);
        if (typeof ptRenderAll !== 'undefined') ptRenderAll();
    }
    ptHideContextMenu();
}

function _ptMobileShuffleIntoDeck(player, handIndex) {
    const card = ptState[player].hand.splice(handIndex, 1)[0];
    if (card) {
        ptState[player].deck.push(card);
        if (typeof ptShuffleDeck !== 'undefined') ptShuffleDeck(player);
        if (typeof ptLog !== 'undefined') ptLog(`"${card.name}" zurück ins Deck gemischt.`);
        if (typeof ptRenderAll !== 'undefined') ptRenderAll();
    }
    ptHideContextMenu();
}

function _ptMobileReturnToHand(player, zone) {
    if (typeof returnToHand !== 'undefined') {
        returnToHand(player, zone);
    }
    ptHideContextMenu();
}

function _ptMobileDiscardFromField(player, zone) {
    const cards = ptState[player].field[zone];
    if (cards && cards.length > 0) {
        const card = cards.pop();
        ptState[player].discard.push(card);
        if (typeof ptLog !== 'undefined') ptLog(`"${card.name}" vom Feld abgelegt.`);
        if (typeof ptRenderAll !== 'undefined') ptRenderAll();
    }
    ptHideContextMenu();
}

function _ptMobileAdjustDamage(player, zone, amount) {
    if (ptState[player].damage[zone] !== undefined) {
        ptState[player].damage[zone] = Math.max(0, ptState[player].damage[zone] + amount);
        if (typeof ptRenderAll !== 'undefined') ptRenderAll();
    }
    ptHideContextMenu();
}

function _ptMobileSwitchToActive(player, benchZone) {
    // Tausche Bank-Pokemon mit Aktivem
    const active = ptState[player].field.active;
    const bench = ptState[player].field[benchZone];
    
    if (bench.length === 0) {
        ptHideContextMenu();
        return;
    }
    
    ptState[player].field.active = bench;
    ptState[player].field[benchZone] = active;
    
    // Tausche auch Damage
    const tempDmg = ptState[player].damage.active;
    ptState[player].damage.active = ptState[player].damage[benchZone];
    ptState[player].damage[benchZone] = tempDmg;
    
    if (typeof ptLog !== 'undefined') ptLog(`Aktives getauscht mit ${benchZone}.`);
    if (typeof ptRenderAll !== 'undefined') ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && typeof ptState !== 'undefined' && ptState.isMultiplayer) syncStateToFirebase('Switch to Active');
    ptHideContextMenu();
}

function _ptMobileKnockout(player, zone) {
    if (typeof ptKnockOutZone === 'function') {
        ptKnockOutZone(player, zone);
    }
    ptHideContextMenu();
}

// ══════════════════════════════════════════════════════════════════════════
// TOUCH EVENT HANDLERS
// ══════════════════════════════════════════════════════════════════════════

function ptMobileCardTap(player, zone, index) {
    if (zone === 'hand') {
        ptShowContextMenu({ player, zone, index });
        return;
    }

    // Guard: while attach mode is active, do not open context/damage modal on target tap.
    if (window.pendingAttachAction || (typeof ptIsAttachSelection === 'function' && ptIsAttachSelection(player))) {
        console.log('Attach-Modus aktiv: Blockiere Schadens-Modal.');
        return;
    }

    const zoneEl = _ptGetZoneElement(player, zone);
    if (!zoneEl) return;
    const rect = zoneEl.getBoundingClientRect();
    const touch = {
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
    };
    ptShowRadialMenu(touch, player, zone);
}

// ══════════════════════════════════════════════════════════════════════════
// LONG-PRESS RADIAL MENU (Field Cards)
// ══════════════════════════════════════════════════════════════════════════

let _ptLongPressTimer = null;
let _ptLongPressFired = false;

function ptFieldTouchStart(event, player, zone) {
    // Long-press opening is intentionally disabled.
    _ptLongPressFired = false;
    clearTimeout(_ptLongPressTimer);
    _ptLongPressTimer = null;
}

function ptFieldTouchEnd() {
    clearTimeout(_ptLongPressTimer);
    _ptLongPressTimer = null;
}

function ptFieldTouchMove() {
    clearTimeout(_ptLongPressTimer);
    _ptLongPressTimer = null;
}

function ptShowRadialMenu(touch, player, zone) {
    ptHideRadialMenu();
    const cx = touch.clientX;
    const cy = touch.clientY;

    const overlay = document.createElement('div');
    overlay.id = 'ptRadialOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:25000;background:rgba(0,0,0,0.4);';
    overlay.addEventListener('click', ptHideRadialMenu);

    const menu = document.createElement('div');
    menu.id = 'ptRadialMenu';
    menu.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;z-index:25001;transform:translate(-50%,-50%);`;

    // Determine which actions make sense for this zone
    const actions = [];
    const hasCards = ptState[player] && ptState[player].field[zone] && ptState[player].field[zone].length > 0;
    if (!hasCards) { return; }

    // Check if hand has energy cards
    const hasEnergy = ptState[player].hand.some(c => {
        const ct = (c.cardType || c.supertype || '').toLowerCase();
        return ct.includes('energy');
    });
    // Check if hand has tool cards
    const hasTool = ptState[player].hand.some(c => {
        const ct = (c.cardType || c.supertype || '').toLowerCase();
        return ct === 'tool' || ct.includes('tool');
    });
    // Check if zone has energy cards (for energy discard)
    const zoneHasEnergy = ptState[player].field[zone].some(c => {
        const ct = (c.cardType || c.supertype || '').toLowerCase();
        return ct.includes('energy');
    });

    if (hasEnergy) actions.push({ icon: '⚡', label: 'Energy', action: () => _ptRadialAttachEnergy(player, zone) });
    if (hasTool) actions.push({ icon: '🔧', label: 'Tool', action: () => _ptRadialAttachTool(player, zone) });
    if (zoneHasEnergy) actions.push({ icon: '⚡🗑️', label: 'E.Disc', action: () => { if (typeof ptEnergyDiscard === 'function') ptEnergyDiscard(player, zone); } });
    actions.push({ icon: '💥', label: 'Dmg+', action: () => { addDamage(player, zone, 10, null); } });
    if (zone === 'active') {
        actions.push({ icon: '↩️', label: 'Retreat', action: () => { if (typeof ptRetreat === 'function') ptRetreat(player, zone); } });
    } else {
        actions.push({ icon: '🔄', label: 'Aktiv', action: () => { _ptMobileSwitchToActive(player, zone); } });
    }
    actions.push({ icon: '✋', label: 'Hand', action: () => { returnToHand(player, zone, null); } });
    actions.push({ icon: '🗑️', label: 'Ablegen', action: () => { discardTopCard(player, zone, null); } });
    actions.push({ icon: '⚙️', label: 'Menü', action: () => _ptRadialOpenContextMenu(player, zone) });

    // Arrange in a circle
    const radius = 65;
    const startAngle = -Math.PI / 2; // top
    const angleStep = (2 * Math.PI) / actions.length;

    actions.forEach((act, i) => {
        const angle = startAngle + i * angleStep;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const btn = document.createElement('button');
        btn.className = 'pt-radial-btn';
        btn.style.cssText = `position:absolute;left:${x}px;top:${y}px;transform:translate(-50%,-50%);`;
        btn.innerHTML = `<span class="pt-radial-icon">${act.icon}</span><span class="pt-radial-label">${act.label}</span>`;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            ptHideRadialMenu();
            act.action();
        });
        menu.appendChild(btn);
    });

    // Center dot
    const dot = document.createElement('div');
    dot.style.cssText = 'width:10px;height:10px;border-radius:50%;background:#FFCB05;position:absolute;left:0;top:0;transform:translate(-50%,-50%);';
    menu.appendChild(dot);

    document.body.appendChild(overlay);
    document.body.appendChild(menu);

    // Clamp menu position to viewport
    const rect = menu.getBoundingClientRect();
    let adjX = cx, adjY = cy;
    if (rect.left < 10) adjX = cx + (10 - rect.left);
    if (rect.right > window.innerWidth - 10) adjX = cx - (rect.right - window.innerWidth + 10);
    if (rect.top < 10) adjY = cy + (10 - rect.top);
    if (rect.bottom > window.innerHeight - 10) adjY = cy - (rect.bottom - window.innerHeight + 10);
    if (adjX !== cx || adjY !== cy) {
        menu.style.left = adjX + 'px';
        menu.style.top = adjY + 'px';
    }
}

function ptHideRadialMenu() {
    const overlay = document.getElementById('ptRadialOverlay');
    const menu = document.getElementById('ptRadialMenu');
    if (overlay) overlay.remove();
    if (menu) menu.remove();
}

function _ptGetZoneElement(player, zone) {
    if (zone === 'active') return document.getElementById(`ptActiveZone-${player}`);
    if (zone && zone.startsWith('bench')) {
        const benchNum = zone.replace('bench', '');
        return document.getElementById(`ptBench${benchNum}-${player}`);
    }
    return null;
}

function _ptRadialOpenContextMenu(player, zone) {
    if (typeof ptOpenCardMenu !== 'function') return;
    const targetEl = _ptGetZoneElement(player, zone);
    if (!targetEl) return;
    ptOpenCardMenu({ currentTarget: targetEl }, player, zone, true);
}

function _ptRadialAttachEnergy(player, zone) {
    // Attach first energy card from hand to this zone
    const energyIdx = ptState[player].hand.findIndex(c => {
        const ct = (c.cardType || c.supertype || '').toLowerCase();
        return ct.includes('energy');
    });
    if (energyIdx === -1) return;
    const [energyCard] = ptState[player].hand.splice(energyIdx, 1);
    ptState[player].field[zone].push(energyCard);
    if (typeof ptLog === 'function') ptLog(`⚡ Attached "${energyCard.name}" to ${zone}.`);
    if (typeof ptRenderAll === 'function') ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && typeof ptState !== 'undefined' && ptState.isMultiplayer) syncStateToFirebase('Attach Energy');
}

function _ptRadialAttachTool(player, zone) {
    const toolIdx = ptState[player].hand.findIndex(c => {
        const ct = (c.cardType || c.supertype || '').toLowerCase();
        return ct === 'tool' || ct.includes('tool');
    });
    if (toolIdx === -1) return;
    const [toolCard] = ptState[player].hand.splice(toolIdx, 1);
    ptState[player].field[zone].push(toolCard);
    if (typeof ptLog === 'function') ptLog(`🔧 Attached "${toolCard.name}" to ${zone}.`);
    if (typeof ptRenderAll === 'function') ptRenderAll();
    if (typeof syncStateToFirebase === 'function' && typeof ptState !== 'undefined' && ptState.isMultiplayer) syncStateToFirebase('Attach Tool');
}

function _ptRadialEvolve(player, zone) {
    // Find first evolution card in hand and place on zone
    const evolveIdx = ptState[player].hand.findIndex(c => {
        const ct = (c.cardType || c.supertype || '').toLowerCase();
        return ct.includes('stage') || ct.includes('evolution') || ct.includes('break') || ct.includes('mega') || ct.includes('level');
    });
    if (evolveIdx === -1) return;
    const [evoCard] = ptState[player].hand.splice(evolveIdx, 1);
    ptState[player].field[zone].push(evoCard);
    if (typeof ptLog === 'function') ptLog(`🔼 Evolved ${zone} with "${evoCard.name}".`);
    if (typeof ptRenderAll === 'function') ptRenderAll();
}

// Initialisierung
if (typeof window !== 'undefined') {
    window.ptMobileCardTap = ptMobileCardTap;
    window.ptHideContextMenu = ptHideContextMenu;
    window.ptFieldTouchStart = ptFieldTouchStart;
    window.ptFieldTouchEnd = ptFieldTouchEnd;
    window.ptFieldTouchMove = ptFieldTouchMove;
    window.ptHideRadialMenu = ptHideRadialMenu;
    window.ptMobileHandTouchStart = ptMobileHandTouchStart;
    window.ptMobileHandTouchMove = ptMobileHandTouchMove;
    window.ptMobileHandTouchEnd = ptMobileHandTouchEnd;
}
