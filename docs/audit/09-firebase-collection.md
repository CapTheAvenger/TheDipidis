# Audit 09 — `js/firebase-collection.js` Deep-Dive

**Audit-Tag:** 2026-05-22 (post PR #169 merge)
**Auditor:** Claude (Opus 4.7 + Explore-Subagent)
**Branch:** `claude/bcd-pass`
**Target:** `js/firebase-collection.js` — 245 KB, **5 457 LOC**, third-largest JS-Modul
**Methodik:** Read-only Static Analysis + Cross-File-Grep + Firebase-v9-vs-v11-Compat-Check.

---

## TL;DR

1. **Bare-Top-Level (kein IIFE)**, 72 explizite `window.X =`-Exports. Owns die komplette User-Data-Schicht: Collection / Wishlist / Trade-List / Decks-CRUD / Profile-Tab-Navigation.
2. **Kein Dead-Code** — alle 72 Top-Level-Funktionen sind nachweislich konsumiert (HTML onclick / Cross-File-Calls).
3. **Hauptbefund: schwere Duplikation zwischen Collection / Wishlist / Tradelist.** Drei strukturell identische CRUD-Pipelines (Add/Remove/Toggle/UpdateUI/Clear/Filter). Hoher Refactor-ROI durch shared `CardListManager`-Pattern, aber großer Scope (~700 LOC).
4. **Async-Error-Handling überall gleich** — alle catch-Blöcke loggen+toasten, **nie re-throwen**. Callers (HTML onclick) sind `async`-unaware → silent Failures bei Firestore-Errors möglich. Niedrig-Risiko, aber dokumentationswürdig.
5. **Firestore-Writes nicht batched** in mehreren Sequential-Operations (z.B. `addToCollection` Z. 125-141: write → local-update → nested-removeFromWishlist). Race-Risiko gering durch Single-Threaded JS, aber Pattern ist non-atomic.
6. **Firebase compat v9 → v11 Migration ist VOLLSTÄNDIG kompatibel.** Alle 13 verwendeten Firebase-APIs sind in beiden Versionen identisch. Keine deprecated Calls.
7. **Keine Memory-Leaks** — keine `onSnapshot()`-Listeners hier; Cleanup beim Sign-Out passiert in `firebase-globals.js`.

---

## 1. High-Level-Struktur

**Format:** Bare-Top-Level, kein IIFE-Wrapper. Code läuft synchron beim `<script defer>` Parsing in `index.html:4816`.

**Dependency-Chain:**
```
firebase-credentials.js (sets window.FIREBASE_CREDS)
  ↓
firebase-config.js (initFirebaseRuntime, sets __firebaseRuntimeInitialized)
  ↓
firebase-globals.js (exposes window.auth, window.db, init user* globals)
  ↓
firebase-collection.js (this file — calls auth.currentUser, db.collection())
  ↓
firebase-auth.js (auth helper functions)
```

**Init-Guard:** Z. 1-3 prüft `window.__firebaseRuntimeInitialized` (gesetzt von `firebase-config.js`). Depends on `firebase-globals.js` für `window.auth` + `window.db` setup.

**Sektions-Map:**

| Section | Lines | Zweck |
|---|---|---|
| Init + Guards | 1-108 | Firebase-Check, Escape-Helpers, Card-Lookup-Util |
| Collection-CRUD | 110-216 | `addToCollection`, `removeFromCollection`, `toggleCollection` |
| Wishlist-CRUD | 219-341 | `addToWishlist(WithCount)`, `removeFromWishlist`, `toggleWishlist` |
| Deck Save/Load | 345-570 | `saveCurrentDeckToProfile`, `saveDeck`, `deleteDeck`, `loadSavedDeckForComparison` |
| DisplayName + XSS-Hardening | 446-495 | `saveDisplayName` (B-2 Sanitization) |
| Collection-UI + Stats | 573-1153 | `getCollectionStats`, `updateCardUI`, Sort/Filter, `clearCollection` |
| Wishlist-UI + Export | 1194-1593 | `updateWishlistUI`, `exportWishlistAsImage`, Price-Tracking, Copy-to-Clipboard |
| Deck-Mgmt + Folders | 1715-4390 | `updateDecksUI`, Deck-Overflow-Menus, Folder-CRUD, `switchProfileTab`, Deck-Comparison |
| Dex-Import | 4507-5020 | CSV-Import aus Pokédex-Spreadsheets |
| Tradelist-CRUD + UI | 5060-5457 | `addToTradelist(WithCount)`, `removeFromTradelist`, `updateTradelistUI`, Price-Tracking, Export |

---

## 2. Public Surface — 72 `window.X`-Exports

**Collection-Mgmt** (Z. 58-59, 5021-5024):
- `toggleDeckOverflow(menuId)`, `closeDeckOverflow(menuId)` — Menu-Interaktion
- `setCollectionSort(mode)` — Sort (set-newest, dex-num, …)
- `setCollectionFilter(mode)` — Filter
- `clearCollection()`, `clearWishlist()` — Wipe-All

**Wishlist** (Z. 5052-5053):
- `getWishlistBadgeHtml(cardName, setCode, setNumber)`, `toggleWishlistBadge(btn)`

**Deck-Operations** (Z. 4379-4391):
- `toggleDeckCollapse(deckId)`, `createDeckFolder()`, `deleteDeckFolder(name)`, `moveDeckToFolder(idx)`
- `renderFolderNav()`, `filterDecksByFolder(folder)`, `renderFolderSummary(folder)`
- `duplicateDeck(idx)`, `openCompareSavedDeck(idx)`, `showDeckComparison(a, b, mode)`
- `addCompareNewCardsToProxy()`, `filterMyDecks()`
- `saveCurrentDeckToProfile(source)` — Save Deck aus City-League / Current-Meta / Past-Meta

**Deck-Proxies** (Z. 4500-4501):
- `printSavedDeckProxies(idx)`, `printSavedDeckMissingProxies(idx)`

**CSV-Import** (Z. 5018-5020):
- `dexImportOpenFilePicker()`, `dexImportHandleFile(input)`, `dexImportExecute(mode)`

**Tradelist** (Z. 5445-5457):
- `clearTradelist()`, `addToTradelist(cardId)`, `addToTradelistWithCount(cardId, count)`
- `removeFromTradelist(cardId)`, `toggleTradelist(cardId)`
- `updateTradelistUI(searchFilter, setFilter)`, `filterTradelist()`
- `openTradelistGridModal()`, `closeTradelistGridModal()`, `exportTradelistAsImage()`
- `saveTradelistMinPrice(cardId, rawValue)`, `copyTradelistToClipboard()`
- `toggleTradelistFromCardDbButton(buttonEl)`

**Profile-Tabs** (Z. 3137):
- `switchProfileTab(tabName)` — Wechsel zwischen 11 Profile-Sub-Tabs (collection / wishlist / tradelist / metabinder / custombinder / decks / deckcompare / journal / testinggroups / metacall / settings)

**Total: 72 dokumentierte exports.**

---

## 3. Cross-File-Dependencies

### Direkte Bare-Identifiers (ohne `typeof`-Check, hard-fail wenn fehlend)

| Identifier | Source | Calls |
|---|---|---|
| `auth.currentUser` | `firebase-globals.js:16` | 37× |
| `db.collection(...)` | `firebase-globals.js:17` | 90+ |
| `firebase.firestore.FieldValue` | Firebase compat SDK | 50+ |
| `showNotification(msg, type)` | `firebase-auth.js:230` | 100+ |
| `escapeHtml()` | `app-utils.js:60` | (lokaler Fallback wenn nicht auf window) |
| `t()` (i18n) | `i18n.js` | hunderte |
| `getLang()` | `firebase-auth.js` o. i18n | mehrere |
| `confirm()` | Browser | Z. 540, 1131, 1167, 1193 |

### Soft-Dependencies (typeof-guarded)

`filterCollection`, `filterWishlist`, `filterTradelist`, `renderCardDatabase`, `refreshMetaBinderOwnership`, `refreshCustomBinderOwnership`, `updateDecksUI`, `window._syncUserStoreFromGlobals` (Wave-1 userStore), `getEmptyStateBoxHtml`, `updateProfileUI` (von firebase-globals), `openJournalHistoryTab`, `MetaCall`, `TestingGroups`, `switchTab`, `switchTabAndUpdateMenu`, `showToast`, `addCardToProxyInternal`, `saveProxyQueue`, `showAuthModal`.

### Global-State (Read/Write)

| Symbol | Description |
|---|---|
| `window.userCollection` | Set<cardId> |
| `window.userCollectionCounts` | Map<cardId, count> |
| `window.userWishlist` | Set<cardId> |
| `window.userWishlistCounts` | Map<cardId, count> |
| `window.userWishlistMaxPrices` | Map (Z. 1425) |
| `window.userTradelist` | Set<cardId> |
| `window.userTradelistCounts` | Map |
| `window.userTradelistMinPrices` | Map (Z. 5364) |
| `window.userDecks` | Array<Deck> |
| `window.userProfile` | Profile-Object mit `displayName` |
| `window.deckFolders` | Array<Folder-Name> |
| `window._pendingDeckSaveSource` | String/null (Z. 353) für deferred Save |
| `window._filterBuiltOnly` | Boolean (Z. 3219) für Filter |
| `window.collectionSortMode`, `window.collectionFilterMode` | Sort/Filter-Preferences |
| `window._pendingPokemonTypeFetches` | Set (Z. 636) für Loading-Indicator |

---

## 4. Befunde

### 4.1 Dead Code

**KEINER.** Jede Top-Level-Funktion ist entweder via `window.*` exportiert UND aus HTML onclick / anderen JS aufgerufen, oder intern verwendet. Helpers wie `_lookupCardBySetNumber`, `_normCardSearch` haben definierten Zweck.

### 4.2 ⚠ HAUPTBEFUND — Duplikation zwischen Collection / Wishlist / Tradelist

Drei strukturell **identische CRUD-Pipelines:**

| Pattern | Collection | Wishlist | Tradelist |
|---|---|---|---|
| Add with count | Z. 110-162 | Z. 219-248 | Z. 5060-5084 |
| Remove | Z. 165-210 | Z. 294-330 | Z. 5110-5138 |
| Toggle | Z. 213-216 | Z. 332-341 | Z. 5139-5147 |
| Update UI | Z. 916-1107 | Z. 1194-1348 | Z. 5178-5314 |
| Clear all | Z. 1119-1153 | Z. 1155-1192 | Z. 5149-5177 |
| Filter | Z. 3196-3207 | Z. 3208-3222 | Z. 5430-5436 |

**Shared Logic (verbatim parallel in jeder Pipeline):**
1. Auth-Validation: `auth.currentUser` check + Error-Toast wenn missing
2. Count-Bounds: max 4 Copies/Card
3. Firestore-`.update()` mit `firebase.firestore.FieldValue.arrayUnion/arrayRemove`
4. Parallel-Mutation: `window.user{X}` Set + `window.user{X}Counts` Map
5. UserStore-Sync: `window._syncUserStoreFromGlobals()` (Wave-1)
6. UI-Refresh: `filter{X}()` mit Fallback zu `update{X}UI()`
7. Re-Render Card-Database-Buttons

**Refactor-Kandidat** (NICHT in dieser Phase umgesetzt — eigener Scope):
```js
function createCardListManager(listName /* 'collection' | 'wishlist' | 'tradelist' */) {
    return {
        add(cardId, maxCount = 4) { … },
        remove(cardId) { … },
        update(cardId, count) { … },
        clear() { … },
        getCounts() { … }
    };
}
```
**Geschätzte Reduktion:** ~700 LOC weniger Boilerplate. Aufwand: 4-8 h inkl. Tests. Empfehlung: **P2, eigene Phase.**

### 4.3 Firestore-Write-Patterns — Sequenzielle Non-Atomare Updates

**Mittel-Risiko-Pattern** in `addToCollection()` (Z. 125-141):
```js
await db.collection('users').doc(user.uid).update({
    collection: firebase.firestore.FieldValue.arrayUnion(cardId),
    [`collectionCounts.${cardId}`]: newCount
});

window.userCollection.add(cardId);  // ← local state AFTER Firestore write

if (window.userWishlist && window.userWishlist.has(cardId)) {
    await removeFromWishlist(cardId);  // ← nested async call
}
```

**Risiko:** Bei Offline-Mode oder Quota-Exceeded nach dem ersten `.update()` läuft `removeFromWishlist()` auf stale Assumptions. In-Memory `window.userCollection` ist nach Write geupdated, falls Write fehlschlägt silently → UI zeigt „owned", Firestore zeigt's nicht.

**Pattern wiederholt sich:** Z. 165-210 (`removeFromCollection`), Z. 219-248 (`addToWishlist`), Z. 251-291, Z. 294-330 (`removeFromWishlist`), Z. 5060-5084 (`addToTradelist`), Z. 5110-5138 (`removeFromTradelist`).

**Batch-Writes nur einmal verwendet:** Z. 3429-3439 in `deleteDeckFolder()`. Anderswo könnten batches genutzt werden (z.B. clearCollection könnte ein Batch sein statt write+nested-ops).

**Niedrig-Risiko in der Praxis** weil Single-Threaded JS + Firestore-Offline-Persistence. Aber Pattern ist non-atomar.

### 4.4 Error-Handling — Silent-Swallows

**Weitverbreitetes Pattern:** Alle catch-Blöcke loggen+toasten, **nie re-throwen**:
```js
// Z. 158-161
} catch (error) {
    console.error('Error adding to collection:', error);
    showNotification('Error updating collection', 'error');
}
// Function returns undefined, caller has no way to detect failure
```

**Impact:** Async-Funktionen wie `addToCollection()` sind `async` aber Callers (HTML-onclick, andere Funktionen) `await`en sie nicht. Failures sind silent to caller. Beispiel: Z. 140 `await removeFromWishlist(cardId)` schluckt Firestore-Permission-Denied stillschweigend.

**Best Practice wäre:**
```js
} catch (error) {
    console.error('...', error);
    showNotification('...', 'error');
    throw error;  // allow caller to chain .catch() or surface as unhandled rejection
}
```

**Niedrig-Risiko** weil Firestore-Failures meist nur in Edge-Cases (Offline, Quota). Aber Audit-Item.

### 4.5 Memory-Leaks

**KEINE in diesem File.** Keine persistenten `onSnapshot()`-Listener. Alle Data-Loads sind one-time `.get()`-Calls in `firebase-globals.js` (Z. 250 `loadUserData()`, Z. 459 `loadUserDecks()`).

Cleanup beim Sign-Out passiert in `firebase-globals.js` Z. 123-126:
```js
if (typeof leaveMultiplayerGame === 'function') {
    try { leaveMultiplayerGame(); } catch (_) { /* ignore */ }
}
```

### 4.6 Firestore-Error-Codes nicht differenziert

**Generic Error-Toasting:**
```js
} catch (error) {
    console.error('Error adding to collection:', error);
    showNotification('Error updating collection', 'error');  // ← generisch
}
```

Kein Check für `error.code === 'permission-denied'`, `'resource-exhausted'`, `'unavailable'`. User sehen immer dieselbe „Error"-Toast — können nicht unterscheiden „du hast keine Permission" vs „Service ist down".

### 4.7 Architektonische Debt

**(a) Monolithische State-Graph** (Z. 1-4390): Collection/Wishlist/Decks/Deck-Folders/Display-Name/CSV-Import — alles in einer 5 457-LOC-Datei. Keine Trennung von Concerns zwischen UI / Firestore-CRUD / Local-State / Business-Logic.

**(b) Window-Global-Mutation** (40+ Stellen): Hard für Newcomers zu verstehen welche Globals read-only-Config sind vs aktiv-mutated.

**(c) UI-Callback-Hell:** Heavy use of `typeof X === 'function'`-Guards um Renderer cross-file aufzurufen. Wenn ein Renderer nicht geladen ist, silent-fallback. Kein klarer Vertrag.

**(d) Deck-Patch-Pattern** (`firebase-globals.js:503` `patchUserDecksLocal()`): Vermeidet teure Full-Refetches durch lokale Deck-Updates, divergiert aber temporär von Server-State auf `updatedAt`-Field. Kommentar (Z. 499-502) dokumentiert das, aber stale-read-Risiko ist nicht mitigated.

**(e) Mixed Concerns in `switchProfileTab()`** (Z. 3137): DOM-Tab-Switching + External-Module-Init (`MetaCall.init()`, `TestingGroups.init()`) + Soft-Dependency-Checks alles in einer Funktion.

### 4.8 State-vs-Storage-Split

Lokaler State (`window.user*` Sets/Maps) und Firestore sind **nicht via Single-Source-of-Truth synchronisiert.** Z. 131-133 updaten `window.userCollection` **nach** Firestore-Write:
```js
await db.collection('users').doc(user.uid).update({...});
window.userCollection.add(cardId);  // ← local AFTER server
```

Mitigation: `firebase-globals.js` resettet alle `window.user*` Globals zu empty beim Sign-In (Z. 54-62) und lädt fresh aus Firestore. Eventual consistency.

---

## 5. Firebase v9 → v11 Kompatibilität

**ALLE 13 verwendeten APIs sind v9 ↔ v11 kompatibel.** Keine deprecated-Calls.

| API | v9 | v11 | Usage |
|---|---|---|---|
| `firebase.initializeApp()` | ✓ | ✓ | `firebase-config.js:18` |
| `firebase.auth()` | ✓ | ✓ | `firebase-globals.js:16` |
| `firebase.firestore()` | ✓ | ✓ | `firebase-globals.js:17` |
| `auth.currentUser` | ✓ | ✓ | Z. 111, 166, 220, … |
| `db.collection().doc().get()` | ✓ | ✓ | `firebase-globals.js:252` |
| `db.collection().doc().update()` | ✓ | ✓ | Z. 126, 174, 182, … |
| `db.collection().doc().set({merge:true})` | ✓ | ✓ | Z. 1135, 473, 3460 |
| `db.collection().doc().delete()` | ✓ | ✓ | Z. 543-544 |
| `db.batch()` | ✓ | ✓ | Z. 3429 |
| `firebase.firestore.FieldValue.arrayUnion()` | ✓ | ✓ | Z. 127, 228, 268 |
| `firebase.firestore.FieldValue.arrayRemove()` | ✓ | ✓ | Z. 175, 304, 5118 |
| `firebase.firestore.FieldValue.delete()` | ✓ | ✓ | Z. 176, 305, 1435 |
| `firebase.firestore.FieldValue.serverTimestamp()` | ✓ | ✓ | Z. 416, 420, 511 |
| `firebase.auth.Auth.Persistence.LOCAL` | ✓ | ✓ | `firebase-auth.js:17` |

**Wave-1 Firebase compat 9.22.0 → 11.10.0 Migration ist VOLLSTÄNDIG kompatibel.** Kein User-Facing-Risk durch das Major-Version-Upgrade auf der Surface dieses Files.

---

## 6. Module-Decomposition-Skizze (P2/P3)

Falls 4-Modul-Split (nicht hier umgesetzt):

| Modul | LOC | Inhalt |
|---|---|---|
| `firebase-collection-crud.js` | ~750 | Collection / Wishlist / Tradelist Add/Remove/Clear CRUD. Plus shared `CardListManager` (§4.2) |
| `firebase-collection-ui.js` | ~2 200 | Rendering (`updateCollectionUI`, `updateWishlistUI`, `updateDecksUI`), Filter/Sort, Export/Copy |
| `firebase-decks.js` | ~1 800 | Deck-CRUD, Folders, Comparison, Proxies |
| `firebase-collection-import.js` | ~400 | CSV-Import-Parser + Execution |

**Aufwand:** 8-16 h inkl. Tests. Empfehlung: erst nach Wave-1-Layer-B.

---

## 7. Empfehlungen

| # | Item | Aufwand | Priorität |
|---|---|---|---|
| 1 | `CardListManager`-Refactor für Collection/Wishlist/Tradelist (~700 LOC weniger) | 4-8 h | **P2** — eigener Scope |
| 2 | Async-Catch re-throw Pattern + Firestore-Error-Code-Differenzierung | 2-3 h | **P3** |
| 3 | Batched-Writes wo Sequential-Updates aktuell stehen | 1-2 h | **P3** |
| 4 | Modul-Split (siehe §6) | 8-16 h | **P3** — erst nach Wave-1-Layer-B |
| 5 | `switchProfileTab()` Concerns trennen (Tab-Switch vs Module-Init) | 1 h | **P3** — kosmetisch |

**Status:** `firebase-collection.js` ist **production-ready mit solidem Error-Handling und ohne kritische Bugs**. Hauptpotential ist die DRY-Refactor von Collection/Wishlist/Tradelist (P2, eigene Phase). Firebase-v11-Migration ist sauber.
