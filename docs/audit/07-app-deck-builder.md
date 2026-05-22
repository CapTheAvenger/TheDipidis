# Audit 07 — `js/app-deck-builder.js` Deep-Dive

**Audit-Tag:** 2026-05-22 (post PR #168 merge)
**Auditor:** Claude (Opus 4.7, 1M-Context-Modus + Explore-Subagent)
**Branch:** `claude/post-merge-cleanup`
**Target:** `js/app-deck-builder.js` — 447 KB, ~10 000 LOC, größtes Einzelmodul im Repo
**Methodik:** Read-only static analysis via Subagent + Cross-File-Grep. Keine Code-Änderungen, keine Test-Ausführung.

---

## TL;DR (6 Befunde)

1. **Public Surface ist riesig:** 42 explizite `window.X =` Assignments + ~9 weitere top-level `function`-Hoists, die von HTML-`onclick`-Handlers oder anderen JS-Dateien konsumiert werden.
2. **24 Cross-File-Dependencies** — defensiv via `typeof X === 'function'`-Guards geschützt (gutes Pattern).
3. **Kein toter Code gefunden** — alle definierten Funktionen sind nachweislich konsumiert (in-file oder cross-file).
4. **Schwere Source-Prefix-Duplikation** als Haupt-Refactor-Kandidat: `cityLeague` / `currentMeta` / `pastMeta`-Branching wird ~8-12× wortgleich wiederholt (~30+ LOC Boilerplate könnten via 3 Helper-Funktionen eliminiert werden).
5. **4 niedrig-Risiko Bug-Smells** — alle defensiv geschützt durch umgebende Guards oder durch die single-threaded Browser-Ausführung; keine Showstopper.
6. **Architektonische Debt** — zentralloser `window.*`-State-Graph (jede Mutation muss 5-6 Buckets synchron halten via manueller `saveX()`-Calls), monolithische `autoCompleteConsistency()`-Funktion (~4000 LOC, eine einzige Sequenz von ~10 Stages, kein Stage einzeln testbar), Legacy-Concat-Bundle-Pattern (verhindert Tree-Shaking).

---

## 1. High-Level-Struktur

**Wrapper:** keiner. Top-Level-Code läuft direkt beim Script-Load, keine IIFE.

**Execution Flow on Load:**

| Lines | Was passiert |
|---|---|
| 5–28 | IIFE für Autosave-Bootstrap: liest `localStorage.autosave_deck`, validiert, parkt das Ergebnis in `window._pendingAutosave` (nicht angewendet — konsumiert von app-features.js o.ä.) |
| 31–68 | Direkte top-level Assignments: `cityLeagueDeck`, `currentMetaDeck`, `pastMetaDeck`, `pinnedCards`, `excludedCards`, Rarity-Maps, Tech-Slots |
| 570 | `setTimeout(() => importDeckFromUrl(), 100)` — non-blocking nach 100ms |
| 2547, 2897, 3496, 3665 | `document.addEventListener('keydown', …)` — Escape-Key-Handlers für Modals, eager attached |

**Keine `DOMContentLoaded`-Hooks** — alles Init ist top-level oder via Event-Handler-Attachment.

### Sektions-Map (approximiert)

| Sektion | Lines | Zweck |
|---|---|---|
| Autosave-Bootstrap + State-Init | 4–568 | Pending-Autosave restoren, Deck-Objekte/Pinned/Excluded/Tech-Slots initialisieren |
| Batch-Add-Funktion | 572–690 | `addCardToDeckBatch()` — perf-optimized Multi-Card-Insertion |
| Deck-Utilities | 692–937 | `getDeckRefBySource`, `removeCardFromDeck`, `clearDeck`, Autocomplete |
| Deck-Display + Rendering | 938–2102 | `updateDeckDisplay`, `renderMyDeckGrid`, `filterDeckGrid`, virtual-grid Mount/Unmount |
| Image-Export (Canvas) | 2230–2990 | `_buildDeckCanvas`, `exportDeckAsImage`, Share-Modals |
| Single-Card-Viewer | 3001–3710 | `showSingleCard`, Modal-Show/Hide, Image-URL-Resolution, Rarity-Switcher-UI |
| Rarity-Swap-Engine | 3740–3992 | `_swapDeckRarity` mit Ace-Spec/Radiant/Energy-Caps |
| **Auto-Complete-Consistency** | **3994–8067** | **Core-Algorithmus, ~4 000 LOC** (siehe §4.4) |
| Meta-Card-Analysis-Stub | 8069–8071 | Leerer Section-Header |

---

## 2. Public Surface

### 2.1 Explizite `window.X =`-Assignments (42)

**State-Objekte:**

| Symbol | Line | Typ |
|---|---|---|
| `cityLeagueDeck` | 35 | `{ cardKey: count }` |
| `cityLeagueDeckOrder` | 36 | `string[]` (insertion order) |
| `currentCityLeagueArchetype` | 37 | `string \| null` |
| `currentMetaDeck` | 38 | `{ cardKey: count }` |
| `currentMetaDeckOrder` | 39 | `string[]` |
| `currentMetaArchetype` | 40 | `string \| null` |
| `pastMetaDeck` | 41 | `{ cardKey: count }` |
| `pastMetaDeckOrder` | 42 | `string[]` |
| `pastMetaCurrentArchetype` | 43 | `string \| null` |
| `pinnedCards` | 52 | `{ source: Set<cardName> }` |
| `excludedCards` | 64 | `{ source: Set<cardName> }` |
| `TECH_SLOTS_MAX` | 203 | `10` (const) |
| `techSlots` | 204 | `{ source: cardName[] }` |

**Exclude-API (10 Funktionen):**

| Symbol | Line |
|---|---|
| `isExcludedCard(source, cardName)` | 75 |
| `getExcludedCardNames(source)` | 82 |
| `toggleExcludeCard(source, cardName)` | 114 |
| `excludedCardsToArray` / `excludedCardsFromArray` | 116, 120 |

**Pin-API (5 Funktionen):**

| Symbol | Line |
|---|---|
| `isPinnedCard` | 136 |
| `getPinnedCardNames` | 143 |
| `togglePinCard` | 178 |
| `pinnedCardsToArray` / `pinnedCardsFromArray` | 183, 187 |

**Tech-Slot-API (10 Funktionen):**

| Symbol | Line |
|---|---|
| `getTechSlotNames` | 214 |
| `hasTechSlot` | 222 |
| `addTechSlot` / `removeTechSlot` / `clearTechSlots` | 253, 271, 286 |
| `techSlotsToArray` / `techSlotsFromArray` | 288, 292 |
| `renderTechSlotsUI` | 352 |
| `showTechSlotPicker` / `hideTechSlotPicker` / `techSlotSearch` | 371, 377, 419 |
| `renderTechVsNormalPanel` / `refreshTechVsNormalPanel` | 555, 566 |

**Image-Share-Modal-API (4):**

| Symbol | Line |
|---|---|
| `openShareImageModal` / `closeShareImageModal` | 2982, 2983 |
| `shareImageDownload` / `shareImageNative` | 2984, 2985 |

**Rarity-Swap-API (4):**

| Symbol | Line |
|---|---|
| `upgradeDeckToMaxRarity` / `downgradeDeckToLowRarity` | 3989, 3990 |
| `toggleDeckRarity(source, buttonEl)` | 3991 |
| `resetDeckRarityToggle(source)` | 3992 |

### 2.2 Top-Level-`function`-Hoists, die via Bundle-Concat als globale `window.X` exportiert werden

(Konsumiert von index.html `onclick` oder anderen `js/*.js`-Dateien — verifiziert via Cross-File-Grep.)

| Funktion | Line | Konsumiert von |
|---|---|---|
| `autoCompleteConsistency(source, rarityMode, options?)` | 6049 | `index.html:685` (onclick), `app-current-meta-analysis.js`, `app-features.js`, mehrere weitere |
| `deckBuilderShowAutocomplete` | 939 | `index.html` (inline card-search) |
| `updateDeckDisplay` | 1176 | `app-current-meta-analysis.js`, `app-cards-db.js`, `app-features.js` |
| `copyDeck` | 3215 | (intern, plus optional `copyDeckOverview` aus city-league) |
| `showConsistencyBuildInfo` | 3241 | Modal-Open-Handler |
| `showSingleCard` / `hideSingleCard` / `closeSingleCard` | 3508, 3668, 3710 | Modal-Open/Close-Handler |
| `removeCardFromDeck` | 1020 | (intern + HTML-Quantity-Steppers) |

### 2.3 Weitere implizite Globals

- `window.lastConsistencyBuild` (~ Line 8000): cached Last-Generated-Deck-Metadata
- `window.lastTechDeck` (~ Line 1307): Vanilla-Tech-Build-Snapshot
- `window.lastVanillaDeck` (~ Line 1310): Vanilla-Build-Snapshot
- `window._singleCardEscHandler` (Line 3665): Keydown-Listener-Ref
- `window._onlineTournamentDatedPromise` (Line 4395): lazy-loaded CSV-Cache

---

## 3. Cross-File-Dependencies

Identifiers, die nicht hier definiert werden und aus anderen Files erwartet werden:

| Identifier | Source | Calls |
|---|---|---|
| `saveCityLeagueDeck()` | `app-city-league.js:2065` | ~15 |
| `saveCurrentMetaDeck()` | `app-current-meta.js:450` | ~10 |
| `savePastMetaDeck()` | `app-current-meta.js:508` | ~8 |
| `normalizeCardName(name)` | `app-utils.js:533` | ~20 |
| `devLog(...)` | `app-core.js:10` | ~50+ |
| `showToast(msg, type, dur)` | `app-core.js:112` | ~40 |
| `t(key)` | `i18n.js` | ~100+ |
| `escapeHtml(s)` | `app-utils.js` | (implicit) |
| `getLegalMaxCopies(cardName, card)` | `app-utils.js:619` | ~8 |
| `getStrictBaseCardName(name)` | `app-utils.js:729` | ~5 |
| `calculateCombinedVariantStats(variants, totalDecks)` | `app-utils.js:766` | ~3 |
| `fixCardNameEncoding(name)` | `app-core.js:1546` | ~2 |
| `getRarityRank(cardName)` | `app-cards-db.js` | ~1 (mit Fallback) |
| `normalizeDeckEntries(source)` | `app-utils.js:452` | ~2 |
| `getMyDeckRenderDbCache()` | `app-core.js:2291` | ~2 |
| `loadCSV(filename, options)` | (global, `app-core` o.ä.) | ~5 |
| `importDeckFromUrl()` | `app-features.js` | 1 (im setTimeout) |
| `renderCityLeagueDeckGrid()` | `app-city-league.js:2850` | bei clearDeck |
| `renderCurrentMetaDeckGrid()` | `app-current-meta-analysis.js:2935` | bei clearDeck |
| `showDeckShareToast()` | `app-features.js:1001` | optional |
| `refreshUserVsVanillaPanel()` | (current-meta-Kontext) | optional |
| `openDrawSimulator(source)` | (feature-Kontext) | onclick |
| `openCardmarket(cardName)` | (implicit) | onclick |
| `window.currentCityLeagueDeckCards` | gesetzt von `app-city-league` | gelesen |
| `window.currentCurrentMetaDeckCards` | gesetzt von `app-current-meta` | gelesen |
| `window.pastMetaCurrentCards` / `pastMetaFilteredCards` | `app-past-meta.js:13,14` | gelesen |
| `window.allCardsDatabase` | `app-cards-db.js` | gelesen (~4 000+ Karten) |
| `window.userWishlist` | (user-Kontext) | gelesen |
| `window.cardsBySetNumberMap` | `app-cards-db.js` | gelesen |

**Defensive Pattern:** Fast alle Cross-File-Calls werden in `typeof X === 'function'`-Guards gewickelt, z.B.:
```js
if (typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
```
Robust gegen Load-Reihenfolge-Issues, hat aber als Nebeneffekt eine Menge Boilerplate (siehe §4.2).

---

## 4. Befunde

### 4.1 Toter Code

**Keiner gefunden.** Alle top-level `function`-Definitions sind nachweislich konsumiert — entweder durch in-file-Calls (`addCardToDeckBatch` aus `autoCompleteConsistency`), explizite `window.X =` Exports (~42), oder Cross-File-Calls verifiziert via grep (`autoCompleteConsistency`, `updateDeckDisplay`, `copyDeck`).

Funktionen wie `hideSingleCard` (Line 3668) sind intern hoisted UND dienen als globale Exports für HTML-`onclick`-Handler — typisches Bundle-Concat-Pattern, **kein toter Code**.

### 4.2 Duplikation: Source-Prefix-Branching

**Größter Refactor-Kandidat.** Das `if source === 'X'`-Pattern wird systematisch repliziert. Top-Hits:

| Pattern | Vorkommen | Beispiel-Lines | Δ-Potential |
|---|---|---|---|
| **Save-to-localStorage-Trio** | 12+× | 99-101, 163-165, 246-248, 264-266, 277-279, 925-930, 1065-1067, 8037-8039 | Ein `getSaveFunction(source)`-Helper reduziert ~36 → ~3 LOC |
| **Deck-State-Reset** | 3× | 1134-1155 (`clearDeck`) | Schleife über Sources |
| **Archetype-Getter** | 3× | 6108-6113 | `getArchetypeForSource()` |
| **Deck-Reference-Lookup** | 4+× | 1309-1324, 3743-3755, 4003-4016 | `getDeckRefs(source)` |
| **Cards-Data-Source** | 3+× | 6072-6080 (in `autoComplete`) | `getCardsForSource(source)` |

**Konkretes Beispiel** (Z. 99-101, repräsentativ für 8+ weitere Stellen):
```js
if (source === 'cityLeague' && typeof saveCityLeagueDeck === 'function') saveCityLeagueDeck();
else if (source === 'currentMeta' && typeof saveCurrentMetaDeck === 'function') saveCurrentMetaDeck();
else if (source === 'pastMeta'    && typeof savePastMetaDeck    === 'function') savePastMetaDeck();
```

**Vorschlag** für eine künftige Refactor-Phase (nicht hier umgesetzt):
```js
const SAVERS = {
    cityLeague:  () => typeof saveCityLeagueDeck  === 'function' && saveCityLeagueDeck(),
    currentMeta: () => typeof saveCurrentMetaDeck === 'function' && saveCurrentMetaDeck(),
    pastMeta:    () => typeof savePastMetaDeck    === 'function' && savePastMetaDeck(),
};
function persistDeck(source) { SAVERS[source]?.(); }
```
**Effekt:** ~30 LOC weniger Boilerplate, Single-Source-of-Truth für Source-Mapping.

### 4.3 Bug-Smells (alle niedrig-Risiko)

1. **Lines 8048: `techAuditCategoryBudget.entries()`** — Variable wird in einem `if`-Block deklariert; der Call ist innerhalb dieses Blocks, also **safe**. Fragiles Pattern, falls Code später aus dem `if` herausgereicht wird.

2. **Lines 4095-4109: `getLegalMaxCopies(cardName, card)`** — kein `typeof`-Guard für diese Cross-File-Funktion, obwohl andere Cross-File-Calls geguardet sind (z.B. Z. 3767 für `getRarityRank`). **Inkonsistenz**, niedrig-Risiko (Dep ist mandatory).

3. **`autoCompleteConsistency` async error handling (Lines 6049+)** — multiple `await loadCSV(…)`-Calls. Outer `try/catch` (Z. 6287) schluckt alles; einzelne `await`s haben kein eigenes Catch. Funktional safe, aber verbose.

4. **Race-Condition-Risiko in `loadOnlineTournamentDatedRows()` (Z. 4395-4408):**
   ```js
   if (window._onlineTournamentDatedPromise) return await ...;
   window._onlineTournamentDatedPromise = (async () => { ... })();
   ```
   Sync-JS-Garantie macht das praktisch sicher (Single-Threaded), aber idiomatischer wäre:
   ```js
   window._onlineTournamentDatedPromise ||= (async () => { ... })();
   ```

**Keine dieser Findings ist ein User-Facing-Bug.** Alles defensive-coding Vorschläge.

### 4.4 Architektonische Debt

**(a) State-Management-Krise:** Der gesamte Deck-State (pinned, excluded, tech slots, rarity prefs, order, archetype) ist über top-level `window.*`-Objekte verteilt. Jede User-Interaktion (Karte hinzufügen, Pin setzen) muss 5-6 verschiedene State-Buckets synchron halten via manueller `saveX()`-Calls. Eine vergessene Save → silently corrupt state. Es gibt keinen zentralen Dispatcher oder Reactive Store (`js/modules/stores/store.js` aus Wave-1 wäre der natürliche Kandidat).

**(b) `autoCompleteConsistency`-Monolith (~4 000 LOC, Lines 6049-8067):** Sequenzielle Stages — Aggregate Cards → Merged Variants → Exclusions → Meta-Boost → Recency-Decay → Ace-Spec-Conditional → Quality-Audit → Deck-Allocation → Tech-Audit → Rarity-Swap → Save. **Keine Stage ist einzeln unit-testbar.** Bug-Lokalisierung erfordert step-through. Neue Weighting-Faktoren hinzuzufügen heißt mitten im 4k-LOC-Block zu editieren.

**(c) Legacy Concat-Bundle-Pattern:** Kein `export`, kein `import`. Alle State und APIs müssen global sein. Tree-Shaking unmöglich → 447 KB werden bei jedem Page-Load geladen, auch wenn der User nur die Cards-DB ansieht und nie einen Deck-Builder öffnet.

---

## 5. Modul-Decomposition-Skizze (für eine künftige Phase)

Wenn dieses File in 5-6 ES-Module zerlegt würde:

| Modul | Lines (approx) | Inhalt |
|---|---|---|
| `js/modules/deck/state.js` | 35-68, 1309-1324 | Zentrales Deck-State-Object mit Getter/Setter-API (`getDeck(source)`, `addCard(source, cardKey, count)`, `clearDeck(source)`) |
| `js/modules/deck/pin-exclude.js` | 70-202 | `togglePin/toggleExclude/getPinned`, Serialization. Importiert state.js |
| `js/modules/deck/tech-slots.js` | 203-566 | Tech-Slot-Management + Picker-Modal |
| `js/modules/deck/consistency-engine.js` | 6049-8067 (+ Helpers) | Pure Function `generateConsistencyDeck(source, rarityMode, options) → {deck, metadata}`. Aufgeteilt in Stages: `_aggregateCards()`, `_mergeVariants()`, `_applyMeta()`, `_computeRecency()`, etc. Unit-testbar |
| `js/modules/deck/renderer.js` | 938-2230 | `updateDeckDisplay`, `renderMyDeckGrid`, `generateDeckGrid` — pure Funktionen mit State + DOM-Selectors als Input |
| `js/modules/deck/export.js` | 2230-2990 | Image-Export, Canvas-Utilities, Share-Modals |

**Erwartete Reduktion:** ~500 LOC Boilerplate eliminiert, Main-File wird zu Thin-Orchestrator (Init + Wire-Up).

**Aufwand-Schätzung:** 8-16 Stunden (vollständige Migration inkl. Tests + Anpassung aller cross-file Callers). **Empfehlung:** NICHT jetzt. Erst nach Wave-1 Layer B (komplette ES-Module-Migration) als natürlicher nächster Schritt.

---

## 6. Empfehlungen

| # | Item | Aufwand | Priorität | Begründung |
|---|---|---|---|---|
| 1 | `persistDeck(source)` + `getDeckRefs(source)` Helpers extrahieren | 30-60 Min | **P1** | Eliminiert ~30 LOC Boilerplate, sofort lesbar, no behavior change. Hoher ROI. |
| 2 | Inkonsistente `typeof`-Guards vereinheitlichen (z.B. `getLegalMaxCopies`) | 15 Min | **P3** | Stilistisch sauber, niedriger Impact |
| 3 | `_onlineTournamentDatedPromise` zu `||=` idiomatisieren | 5 Min | **P3** | Stilistisch, keine funktionale Änderung |
| 4 | `autoCompleteConsistency` in Stage-Funktionen aufteilen | 2-4 h | **P2** | Macht Algorithmus testbar, ist aber große Code-Bewegung |
| 5 | Komplette Modul-Decomposition (siehe §5) | 8-16 h | **P3** | Erst nach Wave-1 Layer B sinnvoll |
| 6 | Reactive Store für Deck-State (via `js/modules/stores/store.js`) | 4-8 h | **P2** | Eliminiert manuelle `saveX()`-Calls, weniger State-Corruption-Risiko |

**Sofort umsetzbar (P1):** Nur #1.

**Mittelfristig (P2):** #4 und #6 — beide wären eigene Audit-/Recovery-Phasen.

**Langfristig (P3):** #2, #3, #5 — Polish-Items.

---

## 7. Status

`app-deck-builder.js` ist **funktional gesund** trotz seiner Größe:
- Kein toter Code
- Kein User-Facing-Bug-Risiko erkennbar
- Defensive Guards um die meisten Cross-File-Calls
- Hohe Test-Abdeckung indirekt durch die in Phase-4 restaurierten Unit-Tests (`test-deckBuilder.js`, `test-isAceSpec-removeCard.js`, `test-getPreferredVersionForCard.js`, `test-calculateCombinedVariantStats.js`, etc. testen Funktionen, die hier zu Hause sind)

**Refactor-Potential ist real, aber nicht dringend.** Die identifizierte Duplikation (`if source === 'X'`-Pattern ~10×) ist die natürlichste Greifbarkeit, falls jemand 30-60 Min Zeit hat. Alles andere wartet auf einen größeren Modul-Migration-Push.

---

**Audit-Status:** ABGESCHLOSSEN. Read-only, keine Code-Änderungen.
