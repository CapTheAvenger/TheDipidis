/**
 * ============================================================================
 * POKÉMON TCG PLAYTESTER - FIREBASE MULTIPLAYER
 * ============================================================================
 * Online 2-Player Mode mit Realtime Sync über Firestore
 */

// ══════════════════════════════════════════════════════════════════════════
// MULTIPLAYER STATE
// ══════════════════════════════════════════════════════════════════════════

let mpGameId = null;           // Aktuelle Spiel-ID (Firestore Document ID)
let mpRoomCode = null;         // 5-stelliger Join-Code
let mpRole = null;             // 'host' oder 'guest'
let mpUnsubscribe = null;      // onSnapshot Listener zum Cleanup
let mpIsHost = false;          // Shortcut für Rolle
let mpSyncEnabled = false;     // Flag: Synchronisation aktiv/inaktiv
let mpLastSyncTime = 0;        // Verhindert Sync-Loops
let _mpLastSeenFlip = '';      // De-dup coin flip notifications
const MP_SYNC_DEBOUNCE = 100;  // Min. 100ms zwischen Syncs

// ══════════════════════════════════════════════════════════════════════════
// 1. LOBBY SYSTEM
// ══════════════════════════════════════════════════════════════════════════

/**
 * Erstellt ein neues Multiplayer-Spiel als Host
 * @param {Object} deckObject - Das Deck des Hosts
 * @returns {Promise<string>} Room-Code
 */
async function createMultiplayerGame(deckObject) {
    try {
        // Firebase Auth Check
        const user = firebase.auth().currentUser;
        if (!user) {
            showToast('Bitte zuerst einloggen!', 'warning');
            throw new Error('Not authenticated');
        }

        // Generiere 5-stelligen Room-Code
        mpRoomCode = generateRoomCode();
        
        // Bereite Initial-State vor
        const initialState = {
            p1: getInitialPlayerState(),
            p2: getInitialPlayerState(),
            stadium: [],
            playZone: [],
            currentPlayer: 'p1',
            activeBuffs: { p1: 0, p2: 0 }
        };

        // Host-Deck laden
        const baseCards = convertDeckObjectToCards(deckObject);
        baseCards.forEach(card => {
            initialState.p1.deck.push({ ...card, ptId: 'p1_' + Math.random().toString(36).substr(2, 9) });
        });

        // Firestore Dokument erstellen
        const db = firebase.firestore();
        const gameRef = await db.collection('games').add({
            roomCode: mpRoomCode,
            host: user.uid,
            hostName: user.displayName || user.email || 'Player 1',
            guest: null,
            guestName: null,
            state: initialState,
            status: 'waiting',  // 'waiting', 'playing', 'finished'
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastAction: firebase.firestore.FieldValue.serverTimestamp()
        });

        mpGameId = gameRef.id;
        mpRole = 'host';
        mpIsHost = true;

        console.log(`[Multiplayer] Game created: ${mpRoomCode} (ID: ${mpGameId})`);
        
        // UI Update
        showMultiplayerLobby(mpRoomCode, 'waiting');
        
        // Starte Listener für Gegner-Beitritt
        listenToGameState(mpGameId);

        return mpRoomCode;

    } catch (error) {
        console.error('[Multiplayer] Create game error:', error);
        showToast('Fehler beim Erstellen des Spiels: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Tritt einem existierenden Multiplayer-Spiel bei
 * @param {string} roomCode - 5-stelliger Room-Code
 * @param {Object} deckObject - Das Deck des Gastes
 * @returns {Promise<void>}
 */
async function joinMultiplayerGame(roomCode, deckObject) {
    try {
        const user = firebase.auth().currentUser;
        if (!user) {
            showToast('Bitte zuerst einloggen!', 'warning');
            throw new Error('Not authenticated');
        }

        // Finde Spiel per Room-Code
        const db = firebase.firestore();
        const gamesSnapshot = await db.collection('games')
            .where('roomCode', '==', roomCode.toUpperCase())
            .where('status', '==', 'waiting')
            .limit(1)
            .get();

        if (gamesSnapshot.empty) {
            showToast('Spiel nicht gefunden oder bereits gestartet!', 'warning');
            throw new Error('Game not found');
        }

        const gameDoc = gamesSnapshot.docs[0];
        mpGameId = gameDoc.id;
        const gameData = gameDoc.data();

        // Check: Nicht dem eigenen Spiel beitreten
        if (gameData.host === user.uid) {
            showToast('Du kannst nicht deinem eigenen Spiel beitreten!', 'warning');
            throw new Error('Cannot join own game');
        }

        // Guest-Deck laden
        const baseCards = convertDeckObjectToCards(deckObject);
        // Deep-copy state to avoid reference issues
        const updatedState = JSON.parse(JSON.stringify(gameData.state));
        
        baseCards.forEach(card => {
            updatedState.p2.deck.push({ ...card, ptId: 'p2_' + Math.random().toString(36).substr(2, 9) });
        });

        // ── Shuffle both decks & deal 7-card starting hands ──
        ['p1', 'p2'].forEach(p => {
            const deck = updatedState[p].deck;
            for (let i = deck.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [deck[i], deck[j]] = [deck[j], deck[i]];
            }
            updatedState[p].hand = [];
            for (let i = 0; i < 7; i++) {
                if (deck.length > 0) updatedState[p].hand.push(deck.pop());
            }
        });

        // Mark as multiplayer game with setup tracking
        updatedState.isMultiplayer = true;
        updatedState.mpSetupReady = { p1: false, p2: false };

        // Update Firestore: Guest beigetreten, Status = playing
        await db.collection('games').doc(mpGameId).update({
            guest: user.uid,
            guestName: user.displayName || user.email || 'Player 2',
            state: updatedState,
            status: 'playing',
            lastAction: firebase.firestore.FieldValue.serverTimestamp()
        });

        mpRoomCode = roomCode.toUpperCase();
        mpRole = 'guest';
        mpIsHost = false;

        console.log(`[Multiplayer] Joined game: ${mpRoomCode} (ID: ${mpGameId})`);

        // UI Update
        showMultiplayerLobby(mpRoomCode, 'playing');

        // Starte Realtime Sync
        listenToGameState(mpGameId);

    } catch (error) {
        console.error('[Multiplayer] Join game error:', error);
        showToast('Fehler beim Beitreten: ' + error.message, 'error');
        throw error;
    }
}

/**
 * Verlässt das aktuelle Multiplayer-Spiel
 */
async function leaveMultiplayerGame() {
    try {
        if (!mpGameId) return;

        // Stoppe Listener
        if (mpUnsubscribe) {
            mpUnsubscribe();
            mpUnsubscribe = null;
        }

        // Optional: Spiel in Firestore als beendet markieren
        const db = firebase.firestore();
        await db.collection('games').doc(mpGameId).update({
            status: 'finished',
            endedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Reset State
        mpGameId = null;
        mpRoomCode = null;
        mpRole = null;
        mpIsHost = false;
        mpSyncEnabled = false;

        console.log('[Multiplayer] Left game');

    } catch (error) {
        console.error('[Multiplayer] Leave game error:', error);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// 2. REALTIME SYNC (onSnapshot)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Hört auf Änderungen im Firestore-Dokument und synchronisiert lokal
 * @param {string} gameId - Firestore Document ID
 */
function listenToGameState(gameId) {
    if (mpUnsubscribe) mpUnsubscribe(); // Cleanup alter Listener

    const db = firebase.firestore();
    
    mpUnsubscribe = db.collection('games').doc(gameId).onSnapshot((doc) => {
        if (!doc.exists) {
            console.warn('[Multiplayer] Game document deleted');
            leaveMultiplayerGame();
            showToast('Das Spiel wurde beendet.', 'info');
            return;
        }

        const data = doc.data();
        
        // Status-Änderungen
        if (data.status === 'playing' && !mpSyncEnabled) {
            // Spiel hat gestartet
            mpSyncEnabled = true;
            console.log('[Multiplayer] Game started - Sync enabled');
            
            // Verstecke Lobby, zeige Spielfeld
            hideMultiplayerLobby();
            
            // State laden (bereits geschuffelt + 7 Karten gezogen)
            if (typeof ptState !== 'undefined') {
                Object.assign(ptState, data.state);
            }

            // Lokale Rolle setzen (Host = p1, Guest = p2)
            ptState.localRole = mpIsHost ? 'p1' : 'p2';
            ptState.isMultiplayer = true;
            if (!ptState.mpSetupReady) ptState.mpSetupReady = { p1: false, p2: false };

            // 🔍 DIAGNOSE: State-Validierung
            const lr = ptState.localRole;
            const localHand = ptState[lr] && ptState[lr].hand ? ptState[lr].hand : [];
            const localDeck = ptState[lr] && ptState[lr].deck ? ptState[lr].deck : [];
            console.log(`[MP-DIAG] Role: ${lr}, Hand: ${localHand.length}, Deck: ${localDeck.length}`);
            if (localHand.length > 0) {
                const sample = localHand[0];
                console.log(`[MP-DIAG] Sample card: name="${sample.name}", imageUrl="${(sample.imageUrl||'').substring(0,60)}...", cardType="${sample.cardType}"`);
            } else {
                console.warn('[MP-DIAG] ⚠️ Hand ist LEER! Firebase-State p1.hand:', data.state.p1?.hand?.length, 'p2.hand:', data.state.p2?.hand?.length);
                // Safety: If hand is empty but deck has cards, redraw 7
                if (localDeck.length > 0) {
                    console.log('[MP-DIAG] Safety redraw: shuffling deck and drawing 7 cards');
                    const deck = ptState[lr].deck;
                    for (let i = deck.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [deck[i], deck[j]] = [deck[j], deck[i]];
                    }
                    for (let i = 0; i < 7 && deck.length > 0; i++) {
                        ptState[lr].hand.push(deck.pop());
                    }
                }
            }

            // Playtester-Modal anzeigen
            const ptModal = document.getElementById('playtesterModal');
            if (ptModal) ptModal.style.display = 'flex';

            // Setup-Phase Variablen initialisieren
            if (typeof ptStartPhase !== 'undefined') ptStartPhase = true;
            if (typeof ptStartChoices !== 'undefined') {
                ptStartChoices = { p1: { active: null, bench: [] }, p2: { active: null, bench: [] } };
            }
            if (typeof ptCurrentPlayer !== 'undefined') ptCurrentPlayer = 'p1';
            if (typeof ptActionLog !== 'undefined') ptActionLog = [];

            // Render Board + Setup-Modal öffnen (KEIN ptNewGame — Hände sind bereits gezogen)
            if (typeof ptRenderAll === 'function') ptRenderAll();
            if (typeof ptOpenStartPhase === 'function') ptOpenStartPhase();
            if (typeof setupDragAndDrop === 'function') setupDragAndDrop();
            if (typeof setupHotkeys === 'function') setupHotkeys();

            console.log(`[Multiplayer] Setup phase started. Local role: ${ptState.localRole}, Hand: ${ptState[ptState.localRole].hand.length} cards`);
        }

        if (data.status === 'finished') {
            mpSyncEnabled = false;
            leaveMultiplayerGame();
            showToast('Das Spiel wurde beendet.', 'info');
            return;
        }

        // State Sync (nur wenn Sync aktiv und nicht eigene Änderung)
        if (mpSyncEnabled && data.state) {
            const now = Date.now();
            // Verhindere Sync-Loop: Nur externe Updates verarbeiten
            if (now - mpLastSyncTime > MP_SYNC_DEBOUNCE) {
                console.log('[Multiplayer] Syncing remote state...');
                
                if (typeof ptState !== 'undefined') {
                    // Bewahre lokale Rolle
                    const savedLocalRole = ptState.localRole;
                    // Deep merge: Überschreibe lokalen State
                    Object.assign(ptState, data.state);
                    // Stelle lokale Rolle wieder her
                    if (savedLocalRole) ptState.localRole = savedLocalRole;
                }

                // Prüfe ob beide Spieler Setup abgeschlossen haben
                const setupReady = data.state.mpSetupReady;
                if (setupReady && setupReady.p1 && setupReady.p2 && typeof ptStartPhase !== 'undefined' && ptStartPhase) {
                    console.log('[Multiplayer] Both players ready — finalizing setup');
                    // Beide bereit: Preiskarten verteilen & Spiel starten
                    ['p1', 'p2'].forEach(p => {
                        if (ptState[p].prizes.length === 0) {
                            for (let i = 0; i < 6; i++) {
                                if (ptState[p].deck.length > 0) ptState[p].prizes.push(ptState[p].deck.pop());
                            }
                        }
                    });
                    ptStartPhase = false;
                    if (typeof ptStartChoices !== 'undefined') {
                        ptStartChoices = { p1: { active: null, bench: [] }, p2: { active: null, bench: [] } };
                    }
                    const fpModal = document.getElementById('ptStartPhaseModal');
                    if (fpModal) fpModal.style.display = 'none';
                    if (typeof ptLog === 'function') ptLog('✅ Beide Spieler bereit! Preiskarten verteilt. Viel Spaß!');
                    // Sync final state
                    syncStateToFirebase('Game started — both players ready');
                }
                
                // Re-render UI
                if (typeof ptRenderAll === 'function') {
                    ptRenderAll();
                }
                
                // Update Message
                if (typeof ptShowMessage === 'function') {
                    const action = data.lastActionDescription || 'Gegner hat gezogen';
                    ptShowMessage(`🌐 ${action}`);
                }
            }
        }

        // Coin flip detection: show opponent's flip result
        if (data.lastCoinFlip && data.lastCoinFlip.player !== mpRole) {
            const flipKey = `${data.lastCoinFlip.result}_${data.lastCoinFlip.player}_${data.lastCoinFlip.timestamp?.seconds || 0}`;
            if (flipKey !== _mpLastSeenFlip) {
                _mpLastSeenFlip = flipKey;
                _mpShowCoinResult(data.lastCoinFlip.result, data.lastCoinFlip.player);
            }
        }

    }, (error) => {
        console.error('[Multiplayer] Snapshot error:', error);
        showToast('Verbindungsfehler: ' + error.message, 'error');
    });
}

// ══════════════════════════════════════════════════════════════════════════
// 3. STATE UPDATES
// ══════════════════════════════════════════════════════════════════════════

function compressStateForFirebase(state) {
    if (!state) return state;

    // Tiefe Kopie erstellen, um den lokalen State nicht zu zerstören
    const compressed = JSON.parse(JSON.stringify(state));

    // Rekursive Funktion, um alle Arrays und Objekte im State zu durchkämmen
    function stripHeavyCardData(obj) {
        if (Array.isArray(obj)) {
            obj.forEach(stripHeavyCardData);
        } else if (obj !== null && typeof obj === 'object') {
            // Wenn es sich um eine Karte handelt (hat name und id/set_code)
            if (obj.name && (obj.id || obj.set_code || obj.setCode)) {
                // Lösche die extrem speicherfressenden Attribute
                delete obj.prices;
                delete obj.tcgplayer;
                delete obj.cardmarket;
                delete obj.legalities;
                delete obj.flavorText;
                // Optional: delete obj.rules;
            }

            // Gehe tiefer (für attachedCards etc.)
            for (const key in obj) {
                stripHeavyCardData(obj[key]);
            }
        }
    }

    stripHeavyCardData(compressed);
    return compressed;
}

/**
 * Synchronisiert lokalen State zu Firestore
 * @param {string} actionDescription - Beschreibung der Aktion (optional)
 */
async function syncStateToFirebase(actionDescription = '') {
    if (!mpSyncEnabled || !mpGameId) return;

    try {
        const now = Date.now();
        if (now - mpLastSyncTime < MP_SYNC_DEBOUNCE) {
            // Zu schnell, überspringe
            return;
        }

        mpLastSyncTime = now;

        const db = firebase.firestore();
        
        const shrunkenState = compressStateForFirebase(ptState);

        // Update Firestore mit komprimiertem State
        await db.collection('games').doc(mpGameId).update({
            state: shrunkenState,
            lastAction: firebase.firestore.FieldValue.serverTimestamp(),
            lastActionDescription: actionDescription,
            lastActionBy: mpRole
        });

        console.log(`[Multiplayer] State synced: ${actionDescription}`);

    } catch (error) {
        console.error('[Multiplayer] Sync error:', error);
        // Silent fail - kein Alert, um Spielfluss nicht zu unterbrechen
    }
}

/**
 * Wrapper-Funktion: Führt Aktion aus und synct dann
 * @param {Function} action - Die auszuführende Funktion
 * @param {string} description - Beschreibung für Log
 */
async function mpAction(action, description) {
    if (typeof action === 'function') {
        action();
    }
    await syncStateToFirebase(description);
}

/**
 * Sync Setup-Ready-Status: Schreibt NUR die lokale Spielerseite + Ready-Flag
 * Verwendet Firestore Field-Level-Update um Race-Conditions zu vermeiden
 */
async function mpSyncSetupReady() {
    if (!mpGameId) return;
    const localRole = ptState.localRole || (mpIsHost ? 'p1' : 'p2');
    try {
        const db = firebase.firestore();
        mpLastSyncTime = Date.now();
        const shrunkenLocalState = compressStateForFirebase(ptState[localRole]);
        await db.collection('games').doc(mpGameId).update({
            [`state.${localRole}`]: shrunkenLocalState,
            [`state.mpSetupReady.${localRole}`]: true,
            lastAction: firebase.firestore.FieldValue.serverTimestamp(),
            lastActionDescription: `${localRole} setup complete`,
            lastActionBy: mpRole
        });
        console.log(`[Multiplayer] Setup synced for ${localRole}`);
    } catch (error) {
        console.error('[Multiplayer] Setup sync error:', error);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ══════════════════════════════════════════════════════════════════════════

/**
 * Generiert einen 5-stelligen Room-Code (A-Z0-9, ohne verwechselbare Zeichen)
 * @returns {string}
 */
function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Ohne O, I, 0, 1
    let code = '';
    for (let i = 0; i < 5; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

/**
 * Konvertiert Deck-Objekt zu Card-Array
 * @param {Object} deckObject - { "CardName (SET NUM)": count, ... }
 * @returns {Array} Array von Card-Objekten
 */
function convertDeckObjectToCards(deckObject) {
    const cards = [];
    
    for (const [deckKey, count] of Object.entries(deckObject)) {
        if (!count || count <= 0) continue;
        
        let cardName = deckKey;
        let imageUrl = 'https://images.pokemontcg.io/card-back.png';
        let cardType = '';
        
        // Parse Set+Number aus Key
        const m = deckKey.match(/^(.+?)\s+\(([A-Z0-9-]+)\s+([A-Z0-9-]+)\)$/);
        if (m) {
            cardName = m[1];
            const setCode = m[2];
            const number = m[3];
            
            // 3-Tier Lookup (identisch mit openPlaytester)
            let cd = (window.cardsBySetNumberMap || {})[`${setCode}-${number}`] || null;
            // Fallback: _simFindCard
            if (!cd && typeof _simFindCard === 'function') cd = _simFindCard(setCode, number);
            // Fallback: allCardsDatabase Name-Suche
            if (!cd && window.allCardsDatabase) cd = window.allCardsDatabase.find(c => c.name === cardName || c.name_en === cardName) || null;
            
            if (cd) {
                imageUrl = cd.image_url || imageUrl;
                cardType = cd.type || cd.card_type || cd.supertype || '';
            }
        } else {
            // Kein Set/Number — Name-Suche
            if (window.allCardsDatabase) {
                const cd = window.allCardsDatabase.find(c => c.name === cardName || c.name_en === cardName);
                if (cd) {
                    imageUrl = cd.image_url || imageUrl;
                    cardType = cd.type || cd.card_type || cd.supertype || '';
                }
            }
        }
        
        for (let i = 0; i < count; i++) {
            cards.push({ name: cardName, imageUrl, cardType });
        }
    }
    
    console.log(`[Multiplayer] convertDeckObjectToCards: ${cards.length} Karten, davon ${cards.filter(c => c.imageUrl !== 'https://images.pokemontcg.io/card-back.png').length} mit Bild, ${cards.filter(c => c.cardType).length} mit Typ`);
    return cards;
}

/**
 * Zeigt Multiplayer Lobby UI
 * @param {string} roomCode - Der Room-Code
 * @param {string} status - 'waiting' oder 'playing'
 */
function showMultiplayerLobby(roomCode, status) {
    // Erstelle oder zeige Lobby-Overlay
    let lobby = document.getElementById('mpLobby');
    
    if (!lobby) {
        lobby = document.createElement('div');
        lobby.id = 'mpLobby';
        lobby.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0, 0, 0, 0.95);
            z-index: 25000;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-family: 'Nunito', sans-serif;
        `;
        document.body.appendChild(lobby);
    }
    
    const safeRoomCode = String(roomCode)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

    if (status === 'waiting') {
        lobby.innerHTML = `
            <div style="text-align: center; max-width: 500px; padding: 40px; background: #1a1a1a; border-radius: 20px; border: 3px solid #FFCB05;">
                <h2 style="color: #FFCB05; font-size: 2.5rem; margin-bottom: 20px;">🎮 Multiplayer Lobby</h2>
                <p style="font-size: 1.2rem; margin-bottom: 30px;">Warte auf Gegner...</p>
                <div style="background: #2a2a2a; padding: 20px; border-radius: 10px; margin-bottom: 20px;">
                    <p style="color: #aaa; margin-bottom: 10px;">Room Code:</p>
                    <p style="font-size: 3rem; font-weight: 900; letter-spacing: 8px; color: #FFCB05;">${safeRoomCode}</p>
                </div>
                <p style="color: #aaa; font-size: 0.9rem; margin-bottom: 20px;">Teile diesen Code mit deinem Gegner</p>
                <button id="mpCancelBtn" style="background: #c0392b; color: white; border: none; padding: 12px 30px; border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer;">Abbrechen</button>
            </div>
        `;

        const cancelBtn = lobby.querySelector('#mpCancelBtn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                leaveMultiplayerGame();
                hideMultiplayerLobby();
            });
        }
    } else if (status === 'playing') {
        lobby.innerHTML = `
            <div style="text-align: center; max-width: 500px; padding: 40px; background: #1a1a1a; border-radius: 20px; border: 3px solid #27ae60;">
                <h2 style="color: #27ae60; font-size: 2.5rem; margin-bottom: 20px;">✅ Spiel startet...</h2>
                <p style="font-size: 1.2rem;">Gegner gefunden!</p>
            </div>
        `;
        
        // Verstecke nach 2 Sekunden
        setTimeout(() => hideMultiplayerLobby(), 2000);
    }
    
    lobby.style.display = 'flex';
}

/**
 * Versteckt Multiplayer Lobby
 */
function hideMultiplayerLobby() {
    const lobby = document.getElementById('mpLobby');
    if (lobby) lobby.style.display = 'none';
}

/**
 * Toggle Multiplayer Menu in Playtester
 */
function toggleMultiplayerMenu() {
    const menu = document.getElementById('mpMenu');
    if (!menu) return;
    
    if (menu.style.display === 'none' || !menu.style.display) {
        menu.style.display = 'block';
        mpPopulateDeckSelect();
    } else {
        menu.style.display = 'none';
    }
}

/** Opens the playtester modal (if hidden) and shows the multiplayer menu */
function openMultiplayerFromSandbox() {
    const modal = document.getElementById('playtesterModal');
    if (modal) modal.style.display = 'flex';
    const menu = document.getElementById('mpMenu');
    if (menu) {
        menu.style.display = 'block';
        mpPopulateDeckSelect();
    }
}

/** Populate the deck dropdown from window.userDecks */
function mpPopulateDeckSelect() {
    const sel = document.getElementById('mpDeckSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Wähle ein Deck für das Match --</option>';
    const decks = window.userDecks || [];
    decks.forEach((d, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = d.name || ('Deck ' + (i + 1));
        sel.appendChild(opt);
    });
}

/**
 * Parse PTCGL text into { "Name (SET NUM)": count } format for multiplayer
 */
function mpParsePTCGLText(text) {
    const lineRegex = /^(\d+)\s+(.+?)\s+([A-Za-z0-9-]+)\s+(\d+[A-Za-z]?)(?:\s+.*)?$/;
    const energyRegex = /^(\d+)\s+Basic\s+\{([RGWLPFDM])\}\s+Energy/i;
    const energyNames = { G:'Basic Grass Energy', R:'Basic Fire Energy', W:'Basic Water Energy', L:'Basic Lightning Energy', P:'Basic Psychic Energy', F:'Basic Fighting Energy', D:'Basic Darkness Energy', M:'Basic Metal Energy' };
    const energyMap = { G:'1', R:'2', W:'3', L:'4', P:'5', F:'6', D:'7', M:'8' };
    const deck = {};
    text.split('\n').forEach(raw => {
        const line = raw.trim();
        const m = line.match(lineRegex);
        if (m) {
            const key = m[2].trim() + ' (' + m[3].toUpperCase() + ' ' + m[4].toUpperCase() + ')';
            deck[key] = (deck[key] || 0) + parseInt(m[1]);
            return;
        }
        const em = line.match(energyRegex);
        if (em) {
            const code = em[2].toUpperCase();
            const key = (energyNames[code] || 'Basic Energy') + ' (SVE ' + (energyMap[code] || '1') + ')';
            deck[key] = (deck[key] || 0) + parseInt(em[1]);
        }
    });
    return deck;
}

/** Get deck object from MP menu (dropdown OR text input) */
function mpGetSelectedDeck() {
    const textInput = (document.getElementById('mpDeckInput') || {}).value || '';
    if (textInput.trim()) {
        const parsed = mpParsePTCGLText(textInput);
        if (Object.keys(parsed).length === 0) {
            showToast('Deckliste konnte nicht geparst werden!', 'error');
            return null;
        }
        return parsed;
    }
    const sel = document.getElementById('mpDeckSelect');
    const idx = sel ? sel.value : '';
    if (idx !== '' && window.userDecks && window.userDecks[Number(idx)]) {
        return window.userDecks[Number(idx)].cards;
    }
    showToast('Bitte w\u00e4hle ein Deck oder f\u00fcge eine Liste ein!', 'warning');
    return null;
}

/**
 * Create Game Handler (UI Wrapper)
 */
async function mpCreateGame() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) { showToast('Bitte zuerst einloggen!', 'warning'); return; }

        const deckObj = mpGetSelectedDeck();
        if (!deckObj) return;

        toggleMultiplayerMenu();
        const roomCode = await createMultiplayerGame(deckObj);
        console.log(`[UI] Game created with code: ${roomCode}`);
    } catch (error) {
        console.error('[UI] Create game failed:', error);
    }
}

/**
 * Join Game Handler (UI Wrapper)
 */
async function mpJoinGame() {
    try {
        const user = firebase.auth().currentUser;
        if (!user) { showToast('Bitte zuerst einloggen!', 'warning'); return; }

        const deckObj = mpGetSelectedDeck();
        if (!deckObj) return;

        const roomCode = prompt('🔑 Room-Code eingeben (5 Zeichen):');
        if (!roomCode || roomCode.length !== 5) {
            showToast('Ungültiger Room-Code!', 'error');
            return;
        }

        toggleMultiplayerMenu();
        await joinMultiplayerGame(roomCode, deckObj);
    } catch (error) {
        console.error('[UI] Join game failed:', error);
    }
}

// ══════════════════════════════════════════════════════════════════════════
// MULTIPLAYER COIN FLIP (synchronized via Firebase)
// ══════════════════════════════════════════════════════════════════════════

async function mpFlipCoin() {
    if (!mpSyncEnabled || !mpGameId) {
        // Offline-Modus: einfacher lokaler Flip
        const result = Math.random() >= 0.5 ? 'heads' : 'tails';
        _mpShowCoinResult(result, mpRole || 'p1');
        return;
    }

    const result = Math.random() >= 0.5 ? 'heads' : 'tails';
    const flipper = mpRole || 'p1';

    try {
        const db = firebase.firestore();
        await db.collection('games').doc(mpGameId).update({
            lastCoinFlip: {
                result: result,
                player: flipper,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            },
            lastActionDescription: `🪙 Coin flip: ${result === 'heads' ? 'Kopf' : 'Zahl'}`,
            lastActionBy: flipper
        });
    } catch (error) {
        console.error('[Multiplayer] Coin flip sync error:', error);
    }

    _mpShowCoinResult(result, flipper);
}

/**
 * Shows a big animated coin flip result overlay
 */
function _mpShowCoinResult(result, flipper) {
    const isHeads = result === 'heads';
    const emoji = isHeads ? '🟡' : '⚫';
    const label = isHeads ? 'KOPF (Heads)' : 'ZAHL (Tails)';
    const bgColor = isHeads ? 'rgba(241,196,15,0.95)' : 'rgba(52,73,94,0.95)';
    const textColor = isHeads ? '#000' : '#fff';

    const overlay = document.createElement('div');
    overlay.id = 'mpCoinFlipOverlay';
    overlay.style.cssText = `position:fixed;inset:0;z-index:30000;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;`;
    overlay.innerHTML = `
        <div style="background:${bgColor};color:${textColor};border-radius:24px;padding:40px 60px;text-align:center;
            box-shadow:0 8px 40px rgba(0,0,0,0.6);animation:ptCoinPop 0.4s ease-out;">
            <div style="font-size:80px;margin-bottom:12px;">${emoji}</div>
            <div style="font-size:28px;font-weight:900;margin-bottom:8px;">🪙 ${label}</div>
            <div style="font-size:14px;opacity:0.8;">Geworfen von ${flipper.toUpperCase()}</div>
        </div>`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);

    // Auto-dismiss after 3 seconds
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 3000);

    if (typeof ptLog === 'function') ptLog(`🪙 Münzwurf: ${label} (von ${flipper.toUpperCase()})`);
}

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC API EXPORT
// ══════════════════════════════════════════════════════════════════════════

if (typeof window !== 'undefined') {
    window.createMultiplayerGame = createMultiplayerGame;
    window.joinMultiplayerGame = joinMultiplayerGame;
    window.leaveMultiplayerGame = leaveMultiplayerGame;
    window.syncStateToFirebase = syncStateToFirebase;
    window.mpAction = mpAction;
    window.mpIsMultiplayer = () => mpSyncEnabled;
    window.mpSyncSetupReady = mpSyncSetupReady;
    window.toggleMultiplayerMenu = toggleMultiplayerMenu;
    window.openMultiplayerFromSandbox = openMultiplayerFromSandbox;
    window.mpCreateGame = mpCreateGame;
    window.mpJoinGame = mpJoinGame;
    window.mpFlipCoin = mpFlipCoin;
}

console.log('[Multiplayer] Module loaded');
