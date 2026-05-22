# 🌐 Multiplayer Integration Guide

## ✅ Was wurde implementiert?

### 1. **Neue Datei**: `js/firebase-multiplayer.js`
Komplettes Multiplayer-System mit:
- ✅ Lobby-Erstellung (`createMultiplayerGame()`)
- ✅ Spiel-Beitritt (`joinMultiplayerGame()`)
- ✅ Realtime-Sync mit Firestore (`listenToGameState()`)
- ✅ State-Upload (`syncStateToFirebase()`)
- ✅ Room-Code-System (5-stellig: z.B. "AB3K7")
- ✅ Lobby-UI mit Wartebildschirm

### 2. **HTML Updates**: `index.html`
- ✅ Script-Tag für `firebase-multiplayer.js` hinzugefügt
- ✅ "🌐 Multiplayer" Button in Playtester-Toolbar
- ✅ Multiplayer-Menü mit "Create Game" / "Join Game"

### 3. **Firestore Schema**
Collection: `games`
```javascript
{
  roomCode: "AB3K7",           // 5-stelliger Code
  host: "user123",             // Host UID
  hostName: "Player 1",        // Host Display Name
  guest: "user456",            // Guest UID (null bis Beitritt)
  guestName: "Player 2",       // Guest Display Name
  state: { ... },              // Komplettes ptState Objekt
  status: "waiting",           // "waiting" | "playing" | "finished"
  createdAt: Timestamp,        
  lastAction: Timestamp,       
  lastActionDescription: "Karte gezogen",
  lastActionBy: "host"         // "host" | "guest"
}
```

---

## 🔧 Integration in `playtester.js`

### **Option A: Automatische Sync (Empfohlen)**

Füge am Ende JEDER Funktion, die `ptState` ändert, diese Zeile ein:

```javascript
// Beispiel: Karte ziehen
function ptDrawCard(player) {
    if (ptState[player].deck.length === 0) return;
    
    const card = ptState[player].deck.pop();
    ptState[player].hand.push(card);
    
    ptRenderAll();
    ptLog(`${player} drew a card`);
    
    // 🌐 MULTIPLAYER SYNC
    if (window.mpIsMultiplayer && window.mpIsMultiplayer()) {
        syncStateToFirebase(`${player} drew a card`);
    }
}
```

### **Option B: Wrapper-Funktion (Eleganter)**

Nutze die `mpAction()` Wrapper-Funktion:

```javascript
// Beispiel: Karte auf Bank legen
function ptPlayToBench(cardIndex, slot) {
    mpAction(() => {
        const card = ptState.p1.hand.splice(cardIndex, 1)[0];
        ptState.p1.bench[slot] = [card];
        ptRenderAll();
    }, 'P1 played to Bench');
}
```

### **Wichtige Funktionen zum Wrappen:**

**Hand-Aktionen:**
- `ptDrawCard(player)` → Karte ziehen
- `ptMulligan(player)` → Mulligan
- `ptClickZone(player, zone, index)` → Karten bewegen

**Feld-Aktionen:**
- `ptPlayToBench(cardIndex, slot)` → Auf Bank legen
- `ptPlayToActive(cardIndex)` → Auf Aktiv legen
- `ptSwitchPokemon(player)` → Switch
- `ptRetreat(player)` → Retreat

**Damage & KO:**
- `ptAddDamage(player, zone, amount)` → Schaden hinzufügen
- `ptKnockOut(player, zone)` → K.O.

**Deck-Aktionen:**
- `ptShuffle(player)` → Shuffle
- `ptAttachEnergy(player, energyIndex, targetZone)` → Energy anlegen

---

## 🎮 Nutzung (User Flow)

### **Host erstellt Spiel:**
1. Öffne Playtester mit einem Deck
2. Klicke auf "🌐 Multiplayer"
3. Klicke auf "🎮 Create Game (Host)"
4. Teile den angezeigten Room-Code (z.B. "AB3K7")
5. Warte, bis Gegner beitritt

### **Guest tritt bei:**
1. Öffne Playtester mit einem Deck
2. Klicke auf "🌐 Multiplayer"
3. Klicke auf "🚀 Join Game (Guest)"
4. Gib den Room-Code ein
5. Spiel startet automatisch!

### **Während des Spiels:**
- **Jede Aktion wird automatisch synchronisiert**
- Gegner sieht alle Änderungen in Echtzeit
- Bei Änderungen erscheint: "🌐 Gegner hat gezogen"

---

## 🔥 Firebase Setup Check

### **Erforderlich:**
- ✅ Firebase Authentication aktiv (`firebase.auth().currentUser`)
- ✅ Firestore aktiviert (`firebase.firestore()`)
- ✅ Firestore Rules für `games` Collection:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /games/{gameId} {
      // Host darf erstellen und updaten
      allow create: if request.auth != null;
      
      // Nur Host/Guest dürfen lesen/schreiben
      allow read, update: if request.auth != null && 
        (request.auth.uid == resource.data.host || 
         request.auth.uid == resource.data.guest);
      
      // Nur Creator darf löschen
      allow delete: if request.auth != null && 
        request.auth.uid == resource.data.host;
    }
  }
}
```

---

## 🐛 Troubleshooting

### **"Bitte zuerst einloggen!"**
→ Firebase Auth ist nicht aktiv. Klicke auf "Login/Register" Button.

### **"Spiel nicht gefunden!"**
→ Room-Code ist falsch oder Spiel bereits gestartet.

### **Sync funktioniert nicht**
→ Check Browser Console (`F12`) für Firestore-Fehler.
→ Firestore Rules prüfen (siehe oben).

### **Gegner-Aktionen werden nicht angezeigt**
→ `ptRenderAll()` muss in `listenToGameState()` aufgerufen werden (✅ bereits implementiert).

---

## 📊 State-Management

### **Lokaler State (ptState):**
```javascript
{
  p1: {
    deck: [...],
    hand: [...],
    active: {...},
    bench: {...},
    discard: [...],
    prizes: [...]
  },
  p2: { ... },
  stadium: [...],
  playZone: [...],
  currentPlayer: 'p1'
}
```

### **Sync-Logik:**
1. **Host erstellt Spiel** → P1 bekommt Host-Deck
2. **Guest tritt bei** → P2 bekommt Guest-Deck
3. **Jede Aktion** → `syncStateToFirebase()` pusht ptState
4. **Firestore Update** → `onSnapshot()` empfängt neuen State
5. **Render** → `ptRenderAll()` zeigt Änderungen

---

## 🚀 Next Steps

### **Minimal-Integration (5 Minuten):**
Füge in `playtester.js` am Ende von `ptDrawCard()` hinzu:
```javascript
if (window.mpIsMultiplayer && window.mpIsMultiplayer()) {
    syncStateToFirebase('Card drawn');
}
```

### **Vollständige Integration (30 Minuten):**
- Alle Hand-Aktionen wrappen
- Alle Feld-Aktionen wrappen  
- Alle Damage-Funktionen wrappen
- Turn-Wechsel synchronisieren

### **Advanced Features (Optional):**
- Chat-System über Firestore
- Spectator Mode (ReadOnly-Zugriff)
- Match History speichern
- Rematch-Funktion

---

## ✨ Features Ready to Use

✅ **Room-Code-System** (5-stellig, keine Verwechslungen)  
✅ **Realtime Sync** (onSnapshot Firestore)  
✅ **Lobby-UI** (Wartebildschirm mit Code-Anzeige)  
✅ **Auto-Start** (Spiel startet sobald Guest beitritt)  
✅ **Auth-Check** (Login-Pflicht für Security)  
✅ **Deck-Check** (Warnung wenn kein Deck ausgewählt)  
✅ **Leave-Game** (Cleanup & Status-Update)  
✅ **Action-Logging** ("Gegner hat gezogen")  
✅ **Debouncing** (Verhindert Sync-Loops)  

---

**Viel Erfolg beim Testen! 🎉**
