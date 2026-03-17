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

// ══════════════════════════════════════════════════════════════════════════
// MOBILE ACTIONS
// ══════════════════════════════════════════════════════════════════════════

function _ptMobilePlayToActive(player, handIndex) {
    if (typeof ptClickZone !== 'undefined') {
        ptSelectedCardIndex = handIndex;
        ptClickZone(player, 'active');
    }
    ptHideContextMenu();
}

function _ptMobilePlayToBench(player, handIndex) {
    if (typeof ptClickZone !== 'undefined') {
        ptSelectedCardIndex = handIndex;
        // Finde freien Bench-Slot
        for (let i = 0; i < 5; i++) {
            const slot = 'bench' + i;
            if (ptState[player].field[slot].length === 0) {
                ptClickZone(player, slot);
                ptHideContextMenu();
                return;
            }
        }
        alert('Bank ist voll!');
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
    ptHideContextMenu();
}

function _ptMobileKnockout(player, zone) {
    const cards = ptState[player].field[zone];
    if (cards && cards.length > 0) {
        cards.forEach(card => ptState[player].discard.push(card));
        ptState[player].field[zone] = [];
        ptState[player].damage[zone] = 0;
        if (typeof ptLog !== 'undefined') ptLog(`${zone} K.O.!`);
        if (typeof ptRenderAll !== 'undefined') ptRenderAll();
    }
    ptHideContextMenu();
}

// ══════════════════════════════════════════════════════════════════════════
// TOUCH EVENT HANDLERS
// ══════════════════════════════════════════════════════════════════════════

function ptMobileCardTap(player, zone, index) {
    // Event-Handler für Karten-Tap auf Mobil-Geräten
    ptShowContextMenu({ player, zone, index });
}

// Initialisierung
if (typeof window !== 'undefined') {
    window.ptMobileCardTap = ptMobileCardTap;
    window.ptHideContextMenu = ptHideContextMenu;
}
