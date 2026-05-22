# Audit 08 — `js/app-meta-call.js` Deep-Dive

**Audit-Tag:** 2026-05-22 (post PR #169 merge)
**Auditor:** Claude (Opus 4.7 + Explore-Subagent)
**Branch:** `claude/bcd-pass`
**Target:** `js/app-meta-call.js` — 295 KB, ~6 429 LOC, second-largest JS-Modul
**Methodik:** Read-only Static Analysis + Cross-File-Grep. Keine Code-Änderungen außer separat dokumentiertem Dead-Code-Removal.

---

## TL;DR

1. **Sauberes IIFE-Modul** — `window.MetaCall = (function () { ... })()`, kein Namespace-Pollution. 44 dokumentierte API-Methoden auf der Public-Surface.
2. **Mode-Toggle (Standard ↔ Counter-Meta) ist sauber integriert** — Session-scoped (`_metaCallMode` in-memory only, kein localStorage); zwei Predictor-Phasen (4.6 Field-Suppression + 4.7 Counter-Adoption-Boost) sind via Early-Return gegated. Mode-agnostic Phasen (4.0a/4.1/4.2/4.4/4.5/5.5) laufen immer.
3. **2 Dead-Code-Funktionen identifiziert:** `calcRecommendations()` (Z. 3206, 63 LOC) ist superseded by `calcRecommendationsSplit()` — keine Aufrufstellen. `renderPredictorBanner()` (Z. 4440, 233 LOC) ist explizit in `renderAll()` als „suppressed" deaktiviert. **Beide sicher entfernbar.**
4. **Architektonische Beobachtung:** `_runPredictor()` (Z. 1754-2238, 484 LOC) orchestriert 10 Predictor-Phasen sequenziell. Komplex aber notwendig (Phasen haben Abhängigkeiten). Dokumentation pro Phase ist exzellent.
5. **Keine Bug-Smells gefunden.** Defensive Coding durchgängig: `typeof X === 'function'`-Guards, async/await-Korrektheit, try/catch um localStorage, nullish-Checks intentional.

---

## 1. High-Level-Struktur

**Format:** IIFE-Wrapper Z. 4-6429. `window.MetaCall = (function () { … })()`. Keine Top-Level-`window.*`-Assignments außer einem (Z. 6351, `window.metaCallApplyDateFilter`).

**Execution-Modell:**
- Script-Load: `window.MetaCall` wird sofort populated (IIFE läuft)
- Echte Initialisierung: on-demand via `MetaCall.init()` wenn die UI ready ist
- `init()` lädt Tournament-Daten async via `loadData()` vor Render

**Sektions-Map:**

| Section | Lines | Zweck |
|---|---|---|
| Internal State (Predictor-Vars) | 7-220 | `_matchupMap`, `_shareList`, `_trendMap`, `_tournamentStats`, Format-Windows, Mode-Flags |
| CSV + Data-Parsing-Helpers | 352-474 | `parseCSV()`, `parseCSVQuoted()`, `parseEU()`, `normalize()` |
| History + Snapshot-Loading | 449-597 | `_loadHistoryManifest()`, `_loadAllHistorySnapshots()`, `_computeWeightedBaseline()` |
| Dated Cards + Doctrine | 606-904 | `_loadDatedCardsRows()`, `_loadAceSpecVariants()`, `_computeArchetypeDoctrine()` |
| Predictor 3.0–5.5 Engines | 1019-1686 | `_computeMetaDynamics()` (4.0a), `_computeConcentrationCounters()` (4.5), `_computeFieldSuppression()` (4.6), `_computeCounterAdoptionBoost()` (4.7), `_computeOnlinePresenceFloor()` (5.5) |
| Predictor 2.0 Main Engine | 1754-2240 | `_runPredictor()` — orchestriert alle Phasen + Mode-Gating |
| Data-Loading | 2463-2901 | `loadData()` — fetcht alle CSVs, populated initial state |
| Matchup-Lookup | 2919-3032 | `getBaseMatchup()`, `getMatchup()`, `_computeMatchupAdjustments()` (Pred 5.3) |
| Field-Composition + Recommendations | 3032-3488 | `buildField()`, `buildGroups()`, `calcDay2()`, `calcRecommendations()` **(dead)**, `calcRecommendationsSplit()` |
| Rendering-Helpers + HTML | 3496-4201 | `esc()`, `escJs()`, `_mcIconHtml()`, `renderSettingsPanel()`, `renderMetaCallModePanel()` (Z. 3678), `renderFieldPanel()` |
| Full-Render-Orchestration | 4202-4673 | `renderAll()` — top-level Render, invokes alle Sub-Panels |
| Image-Export | 4675-5496 | PNG-Share-Image-Generation für Field/Recs/Day2 |
| Event-Handlers | 5497-5704 | `_onSetting()`, `_setTournamentType()`, `_setMetaCallMode()` (Z. 5622), Deck-Input |
| Custom-Decks + Overrides | 5703-5898 | `_addCustomDeck()`, `_removeCustomDeck()`, `_onWrOverride()` |
| Saved-Scenarios | 5900-6160 | `_saveScenario()`, `_loadScenarios()`, `_refreshScenario()` — JSON in localStorage |
| Public Init + Date-Filter | 6196-6349 | `init()`, `_applyDateFilter()`, `_bucketCountsFromDatedRows()` |
| Public-API-Return | 6373-6429 | 44 exportierte Funktionen/Properties |

---

## 2. Public Surface — `window.MetaCall.*`

**44 dokumentierte API-Methoden.** Die wichtigsten:

| Symbol | Line | Zweck |
|---|---|---|
| `init` | 6197 | Bootstrap: lädt CSVs, rendered UI |
| `preload` | 6375 (alias to `loadData`) | Pre-fetch ohne Render |
| `getDeckNames()` | (3×) | Liste der aktuellen Decks für Autocomplete |
| `getPredictedField()` | (3×) | Export Field-Composition (name, finalShare, onlineShare) |
| `getBaseMatchup(deckA, deckB)` | 2946 | Lookup Head-to-Head-WR (used by Deck-Analysis-Tab) |
| `_onSetting(key, val)` | 5568 | Setting persist (tournamentType, myDeck, …) in localStorage |
| `_setTournamentType(type)` | 5610 | Switch Tournament-Format; Re-Render |
| **`_setMetaCallMode(mode)`** | **5622** | **Mode-Toggle (standard ↔ counter); Re-Run Predictor** |
| `_onMyDeck(val)` | 5630 | Setze User-Deck; fetched Battle-Journal-WR wenn vorhanden |
| `_onPersonalShare(share)` | 5710 | User-Share-% |
| `_onWrOverride(oppName, wr)` | 5720 | Manual Matchup-WR-Override |
| `_addCustomDeck()` / `_removeCustomDeck(idx)` | 5844 / 5859 | Custom-Deck CRUD (max 10) |
| `_testingGroupLoad(data)` | 5741 | Lädt Testing-Group-Snapshot ins Field |
| `_jumpToDeckAnalysis(name)` | 6228 | Navigation zu Deck-Analysis-Tab |
| `_saveScenario()` / `_loadScenarios()` / `_deleteScenario()` / `_refreshScenario()` | 5991 / … | Scenario-Snapshots in localStorage |
| `exportFieldShareImage()` | 4812 | PNG-Export (WhatsApp-safe) |
| `exportFieldAndRecsShareImage()` | 5199 | PNG: Field + Top-Recs side-by-side |
| `exportDay2ShareImage()` | 5307 | PNG: Day-2-Odds für User-Deck |

**Globaler Hook außerhalb des Namespaces:**
- Z. 6351: `window.metaCallApplyDateFilter = _applyDateFilter` — wird von Card-Analysis aufgerufen wenn Date-Window wechselt

---

## 3. Cross-File-Dependencies

| Identifier | Source | Usage |
|---|---|---|
| `window.currentMetaDateFrom` | `app-current-meta-analysis.js` | Z. 513, 527, 4212 — Date-Filter-Cutoff |
| `window.filterRowsByDateFrom(rows, cutoff)` | `app-current-meta-analysis.js` | Z. 625 — Filter Dated-Tournament-Rows |
| `window.ArchetypeIcons` | `app-tier-meta.js` o.ä. | Z. 3508, 4270, 4332 — Deck-Icons |
| `window.getBattleJournalWinRates(deck, format, opts)` | `app-battle-journal.js` | Z. 5635 — User-Battle-Log-WR |
| `window.navigateToCurrentMetaWithDeck(deckName)` | `app-core.js` | Z. 6230 — Tab-Context-Switch |
| `switchTabAndUpdateMenu(tabName)` | `app-core.js` (global) | Z. 6232 — Fallback Tab-Nav |
| `window.showNotification(msg, type)` | `app-core.js` o. utils | Z. 6108 — Toast |
| `t(key)` | `i18n.js` | hunderte Lines |
| `dataUrl(path)` | (global utility) | Z. 434, 751, 2466 — Base-URL-Prefix für Data-Paths |

Alle Cross-File-Calls sind `typeof`-guarded. Keine Hard-Failures bei fehlenden Dependencies.

---

## 4. Befunde

### 4.1 Dead Code (sicher entfernbar)

**(a) `calcRecommendations(field, topN = 5)` Z. 3206** — 63-LOC-Funktion, definiert Top-N-Recommendations. Vollständig ersetzt durch `calcRecommendationsSplit()` (Z. 3273, aufgerufen Z. 4264, 5213), die Recs in `day2` + `geheimtipps` Arrays splittet. **Keine Aufrufstellen** (verifiziert per grep). Sicher entfernbar.

**(b) `renderPredictorBanner()` Z. 4440** — 233-LOC-Funktion, rendered Accuracy-Chip + Trend-Indicators. **Explicit deaktiviert** in `renderAll()` Z. 4239 mit Kommentar „Predictor banner suppressed". Funktion ist preserved für „future UI slimming" aber aktuell totes Gewicht. Sicher entfernbar.

**Effekt der Entfernung:** ~300 LOC weniger; keine Verhaltens-Änderung. Wird in Doc 11 (Phase-„BCD"-Implementation) tatsächlich umgesetzt.

### 4.2 Duplikate Logik

**Standard vs Counter Mode** (Z. 1454, 1525): Beide Predictor 4.6 und 4.7 haben identische Early-Return-Pattern:
```js
if (_metaCallMode !== 'counter') return;
```
Könnte in einen Mode-Check-Wrapper extrahiert werden, aber aktueller Code ist klar und maintainable. **Lassen.**

**Mode-agnostische Predictors** (4.0a, 4.5, 5.5) laufen unconditional. Korrektes Design.

### 4.3 Bug-Smells

**Keine identifiziert.** Code ist durchgängig defensiv:
- Nullish-Checks: `== null` intentional für undefined/null (Z. 1731, 1936, 5922)
- Async-Funktionen properly awaited (Z. 6285, 6343)
- External API-Calls guarded mit `typeof` (Z. 624, 3508, 6230)
- try/catch swallow für non-critical Errors (Z. 1510, 2591, 3391)
- localStorage-Access wrapped in try/catch (Z. 279, 5893, 5940, 5943)

### 4.4 Architektonische Debt

**`_runPredictor()` Monolith** (Z. 1754-2238, 484 LOC) orchestriert 10 Predictor-Phasen:

1. Predictor 2.0 (Labs-Anchor + Damper + Concentration-aware Counter-Boost)
2. Predictor 3.0 (Trend-Signal)
3. Predictor 4.0a (Surge-Detection)
4. Predictor 4.1 (Format-Window + Recency-Weight)
5. Predictor 4.2 (Ladder-Bias-Damper)
6. Predictor 4.4 (Variant-Family-Anchor)
7. Predictor 4.5 (Concentration-Counter-Boost)
8. Predictor 4.6 (Field-Suppression) ← mode-gated
9. Predictor 4.7 (Adoption-Boost) ← mode-gated
10. Predictor 5.5 (Online-Presence-Floor)
11. Renormalisation + Sorting

Jeder Predictor ist logisch separat (gut für Verständnis) aber sie sind alle in einer Funktion in Reihe. **Justified** weil sie auf gemeinsamem `_shareList` operieren und in Order laufen müssen für Dependency-Resolution. Refactor in Stage-Funktionen wäre möglich (analog zu der Audit-07 §5 Modul-Sketch) aber nicht dringend.

**State-Consolidation** (Z. 7-220): 55 Modul-Level `let`-Declarations + 13 `const`-Thresholds. Good Separation by Concern. IIFE-Encapsulation ist bereits da. Ein zukünftiges `state`-Object könnte Globals reduzieren, aber nicht dringend.

---

## 5. Mode-Toggle (Standard ↔ Counter-Meta) — Special-Section

### 5.1 Storage

| Aspekt | Wert |
|---|---|
| Variable | `_metaCallMode` (Z. 35) |
| Type | `'standard' \| 'counter'` |
| Init | `'standard'` |
| Persistenz | **KEINE** (session-scoped, kein localStorage) |
| Side-Channel | `_metaCallModeLastLogKey` (Z. 36) — tracked `${majorId}:${mode}` für dev-log dedup |

Fresh Page-Load startet immer in `'standard'`. Bewusste Design-Wahl (Mode ist „diese Sitzung counter-analysieren", nicht „dauerhaft").

### 5.2 UI-Komponente

`renderMetaCallModePanel()` (Z. 3678-3698):
- 2 Toggle-Buttons: „Standard" und „Counter"
- Active-Button via Class `mc-tt-tab-active`
- Hint-Text wechselt nach Mode (Z. 3685-3696)
- Each onclick: `MetaCall._setMetaCallMode('standard'|'counter')`

### 5.3 Toggle-Handler

`_setMetaCallMode()` (Z. 5622-5628):
```js
function _setMetaCallMode(mode) {
  const next = mode === 'counter' ? 'counter' : 'standard';
  if (_metaCallMode === next) return;  // idempotent
  _metaCallMode = next;
  _runPredictor();   // re-run with new mode
  renderAll();       // re-paint UI
}
```

### 5.4 Impact auf Prediction Engine

**(a) Predictor 4.6 (Counter-Field-Suppression)** Z. 1450-1511:
- Standard-Mode: Early-Return (Z. 1454) → keine Suppression
- Counter-Mode: Suppress Dominant-Family-Share, Redistribute via Renormalisation

**(b) Predictor 4.7 (Counter-Adoption-Boost)** Z. 1520-1589:
- Standard-Mode: Early-Return (Z. 1525) → kein Boost
- Counter-Mode: Brought-Share-Boost für Counter-Decks die Ladder-Share übersteigen

**(c) Alle anderen Predictors** (4.0a, 4.5, 5.5, etc.): **Mode-agnostic**, laufen immer

### 5.5 Dev-Logging

Console-Log einmal pro unique (majorId, mode)-Paar (Z. 2197-2203):
```
[Meta Call Mode] counter — 4.6 family suppression + 4.7 adoption boost ACTIVE
```

### 5.6 Scenario-Integration

Beim `_saveScenario()` (Z. 6090) wird `metaCallMode` in History-Snapshot captured. Mode ist NICHT Teil des Scenario-State (Scenarios werden immer fresh berechnet).

**Resümee:** Mode-Toggle ist sauber integriert. Zwei klare Gating-Points, keine State-Leaks zwischen Modes. Design ist sound.

---

## 6. Code-Quality-Übersicht

| Dimension | Rating | Bemerkung |
|---|---|---|
| Null-Safety | ✓ Gut | Defensive `typeof`-Guards |
| Async-Handling | ✓ Gut | Alle async-Funktionen properly awaited |
| Error-Recovery | ✓ Gut | try/catch um alle external API-Calls |
| Encapsulation | ✓ Exzellent | IIFE + Namespace; kein Global-Pollution |
| Mode-Integration | ✓ Solid | Clean Early-Return-Gates |
| Dead-Code | ⚠ Minor | 2 Funktionen (siehe §4.1) |
| Complexity | ⚠ Moderate | `_runPredictor()` 484 LOC, dense aber maintainable |
| Persistenz | ✓ Gut | Session-scoped Mode; Scenario-History capped @ 25 |
| Documentation | ✓ Exzellent | Inline-Comments für jede Predictor-Phase mit Retune-Dates |

---

## 7. Empfehlungen

| # | Item | Aufwand | Priorität |
|---|---|---|---|
| 1 | **Dead-Code entfernen** (`calcRecommendations` + `renderPredictorBanner`, ~300 LOC) | 10 Min | **P1** — wird in Phase-BCD umgesetzt |
| 2 | `_runPredictor()` in Stage-Funktionen extrahieren | 4-8 h | **P3** — analog zu Audit-07 §5 |
| 3 | State-Object für Modul-Globals | 2-3 h | **P3** — kosmetisch |
| 4 | Mode in localStorage persistieren (optional) | 30 Min | **P3** — Design-Entscheidung |

**Status:** `app-meta-call.js` ist **production-ready und gut gepflegt**. Hat die wenigsten Bug-Smells aller bisher auditierten großen Module. Tech-Debt ist die `_runPredictor()`-Komplexität, aber durch exzellente Inline-Dokumentation gut handhabbar.
