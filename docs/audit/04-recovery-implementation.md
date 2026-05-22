# Audit 04 — Phase-4 Recovery Implementation (Option B)

**Audit-Tag:** 2026-05-22
**Auditor:** Claude (Opus 4.7, 1M-Context-Modus)
**Branch:** `claude/gracious-edison-ITIKO`
**Eingabe:** Phase-3-Klassifikation (`03-classification-and-recovery-plan.md`)
**Auftrag:** Option B („Vollständige Recovery", ~10-15 h geschätzt)

---

## Zusammenfassung

| Batch | Inhalt                                                         | Commits | Vorher → Nachher                                                          |
| ----- | -------------------------------------------------------------- | ------- | ------------------------------------------------------------------------- |
| **1** | Wave-2-Cleanup + `frontend/`-Cleanup                           | 1       | meta-view default-active → current-meta default-active; 1475 LOC entfernt |
| **2** | P0-Bugs: Sandbox-Stubs + profile-split-Rollback + Sidebar-Menu | 1       | 3 user-facing Bugs behoben; +75 / −24 LOC                                 |
| **3** | Test-Restauration: 15 JS-Unit + 8 Playwright + 7 Python        | 1       | Test-Files 21 → 36 (+71%); Tests 273 → 288 pass (+15); Python 38 pass     |
| **4** | Doku-Updates: README + PROJECT_STRUCTURE                       | 1       | Tree, Tabs, Doc-Liste, Quickstart aktualisiert                            |

**Effort tatsächlich:** ~2 h (deutlich unter den 10-15 h Schätzung — wenig Adapter-Code-Arbeit nötig, weil restaurierte Tests gleich gegen HEAD durchliefen und Firebase v11 ↔ v9 kompatibel ist auf der `firebase-collection.js`-Test-Surface).

**Status aller Checks am Phase-4-Ende:**

| Check                                                                              | Ergebnis                                                       |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `npm test`                                                                         | **288 pass / 0 fail / 36 files** ✓                             |
| `npm run typecheck`                                                                | **PASS (silent)** ✓                                            |
| `npm run test:coverage:modules`                                                    | **96.05% / 90.82% / 88% / 96.05%** ✓ (über 85/80/70 Threshold) |
| `npm run lint`                                                                     | **0 errors / 1926 warnings** (alle `'_' unused`, kosmetisch)   |
| `npm run build:bundle`                                                             | **PASS — 21 files → 2.37 MB + 109 KB in ~110 ms** ✓            |
| `python -m pytest tests/python/ -q --ignore=test_price_proxy_and_price_scraper.py` | **38 pass / 0 fail** ✓                                         |

---

## Batch 1 — Wave-2 IA-Refactor + `frontend/`-Cleanup

**Commit:** [phase-4: Wave-2 IA-Refactor + frontend/ cleanup (Batch 1/4)]

### Was getan wurde

1. **`<div id="meta-view">`** (51 LOC) aus `index.html` entfernt — Wave-2-Scaffolding mit „Deck-list rendering arrives in step 3"-Placeholder.
2. **`<div id="current-meta">`** als neue default-active Tab gesetzt (statt `meta-view`).
3. **`css/meta-view.css`** gelöscht + Reference aus `index.html`.
4. **`<div id="header-container">`** + **`<div id="sidebar-container">`** aus `index.html` entfernt (waren leer; `frontend/components/*.html` wurden nie eingebunden).
5. **`js/modules/meta-view/{store,controller,url-router,bootstrap}.js`** (458 LOC) gelöscht.
6. **`js/modules/index.js`**: 5 meta-view-Exports + side-effect-Import entfernt.
7. **`js/app-core.js`**:
   - `metaViewStore.subscribe(...)`-Block entfernt (Lazy-Load für Segmented-Control)
   - `case 'meta-view':` aus `switchTab()` entfernt
   - `metaSubTabs`-Lookup zur Active-Button-Highlight-Logik aufgelöst
8. **`js/inline-init.js`**:
   - `'meta-view'` aus `metaTabs` Set entfernt
   - `applyHash()` meta-view URL-Router-Escape entfernt
9. **Tests gelöscht:** `test-meta-view-store.js` + `test-meta-view-url-router.js`.
10. **`frontend/`** komplett gelöscht (6 HTML + 1 CSS).

### Begründung

Phase 2 + 3 zeigten, dass nach dem Wave-2-Revert (`7d12922`) der `#meta-view`-Container weiterhin als `tab-content active` im HTML stand und beim Page-Load kurzzeitig den Wave-2-Placeholder zeigte, bevor `bootstrap.js init()` zu `current-meta` switchte. Diese Hybrid-Konstruktion war Konzept-Inkonsistenz: die JS-Routing-Logik baute auf einem 5-Tab-Modell, das HTML-Default-State auf einem 1-Tab-Modell.

`frontend/components/*.html` und `frontend/css/dashboard-theme.css` wurden nirgends im Codepfad geladen (verifiziert in Phase 3 via grep). Reines Dead-Code-Residuum.

### Outcome

- `index.html` Z. 562-612 (Wave-2-Scaffold) komplett weg.
- Bundle-Größe: 117 KB → **109 KB** (`_dist/app.modules.bundle.js`).
- Tests: 273 pass / 0 fail / 21 files (vorher 298/23, da 2 meta-view-Tests gelöscht wurden — Pass-Count entsprechend 25 weniger).
- Typecheck + Build sauber.

---

## Batch 2 — P0 User-Facing-Bug-Fixes

**Commit:** [phase-4: fix P0 user-facing bugs (Batch 2/4)]

### P0-1: Sandbox-Buttons-ReferenceError

**Problem:** Sandbox-Modal-HTML rief ~40 `pt*` / `mp*` / `*Playtester*` / `*Multiplayer*`-Funktionen via `onclick=` auf. Die Stub-Liste in `app-core.js` deckte nur 7 ab — Rest crashte mit `ReferenceError`.

**Fix:** Stub-Liste auf alle 40 in `index.html` per `grep -oE 'onclick="[a-zA-Z_]+'` gefundenen Namen erweitert. Inkl. der zwei wichtigsten Bug-Sources:

- `startPlaytesterSetup` (≠ existing `openPlaytesterSetup`!) — Sidebar-Start-Button
- `openMultiplayerMenu` — Multi-Button

Alle Stubs leiten via `_redirectToShowdown()` zu `openShowdownExternal()` weiter (öffnet tcg-showdown.com in neuem Tab).

### P0-2 (Variante B): profile-split-Routing zurücknehmen

**Problem:** Commit `977d366` änderte `HASH_ALIASES` so, dass `#metacall` / `#journal` / `#testinggroups` zu Top-Level-Tabs `meta-call` / `battle-journal` / `testing-groups` routeten — diese `<div>`s wurden aber nie im HTML erstellt. Result: blanke Seite.

**Fix:**

1. **`js/inline-init.js`:** Neue `PROFILE_SECTION_ALIASES`-Map, die 6 Aliases (kurz + lang) zu Profile-Subtab-Namen mappt. `applyHash()` ruft `openProfileSection()` statt `switchTabAndUpdateMenu()`.
2. **`js/firebase-collection.js`:** 3 Auto-Init-Blöcke in `switchProfileTab()` restauriert (waren in Golden, von profile-split entfernt):
   ```js
   if (tabName === 'journal' && typeof openJournalHistoryTab === 'function')
     openJournalHistoryTab();
   if (tabName === 'metacall' && typeof MetaCall !== 'undefined') MetaCall.init();
   if (tabName === 'testinggroups' && typeof TestingGroups !== 'undefined') TestingGroups.init();
   ```
3. **`js/app-testing-groups.js:789`:** `switchTabAndUpdateMenu('testing-groups')` → `openProfileSection('testinggroups')`.
4. **`js/app-testing-groups.js:1018`:** `switchTabAndUpdateMenu('meta-call')` → `openProfileSection('metacall')`.
5. **`js/app-core.js`:** 3 dead Switch-Cases entfernt (`battle-journal` / `meta-call` / `testing-groups`).

### P0-3: Sidebar-Menu für 2 Analysis-Tabs

**Problem:** Golden hatte 5 Meta-Menu-Items, HEAD nur 3. `city-league-analysis` + `current-analysis` waren aus dem Sidebar verschwunden — nur per internem tile-click erreichbar.

**Fix:**

1. **`js/i18n.js` + `js/i18n-de.js`:** Neue i18n-Keys `tab.currentMetaAnalysis` (EN: "Current Meta Deck Analysis" / DE: "Aktuelle Meta Deck-Analyse"). `tab.cityLeagueAnalysis` existierte bereits.
2. **`index.html`:** 2 neue `<button class="menu-item menu-subitem">` im Meta-Cluster, mit data-i18n-Keys + Tab-Reihenfolge:
   ```
   current-meta → current-analysis → city-league →
   city-league-analysis → past-meta
   ```

### Outcome

- 3 hart broken Bugs aus Phase 3 §1 alle behoben.
- Tests + Typecheck + Build sauber.

---

## Batch 3 — Test-Restauration

**Commit:** [phase-4: restore 30 tests deleted by wave-1/wave-2 (Batch 3/4)]

### Was restauriert wurde (30 Files)

**JS-Unit-Tests (15 Files, alle pass auf HEAD):**

- Top-5 (Phase 3 P1-1): `test-firebaseCollection`, `test-deckBuilder`, `test-parseCSV`, `test-dataIntegrity`, `test-coreDataProcessing`
- Card-Logic (P1-2): `test-isAceSpec-removeCard`, `test-getPreferredVersionForCard`, `test-getRarityPriority`, `test-other-international-prints`, `test-calculateCombinedVariantStats`, `test-fuzzyArchetypeMatch`
- Utilities (P1-3): `test-rarity-switcher-ready`, `test-sanitize-proxy`, `test-utilsExtra`, `test-parsePastMetaDateMs`

**Playwright-E2E-Specs (8 Files, syntax-valid):**

- `visual-full-page-coverage.spec.js` (P1-4)
- `cards-keyboard-accessibility`, `cards-image-keyboard`, `city-league-language-switch`, `city-league-hero-combined-navigation`, `rarity-switcher`, `proxy-import-errors`, `proxy-queue-reset` (P1-5)

**Python-Unit-Tests (7 Files, 38 pass auf HEAD):**

- `test_card_database`, `test_card_scraper_shared`, `test_csv_and_settings`, `test_prepare_card_data`, `test_scraper_additional`, `test_scraper_extraction`, `test_scraper_functions` (P1-6)

### Methodik

Verbatim-Kopie via `git show 481c9bd:tests/<path> > tests/<path>` für jede Datei. Anschließend:

1. **JS Unit Tests:** `npm test` → alle 15 grün ohne Anpassung. Firebase-v11-Kompatibilität auf Test-Surface war kein Problem (Tests mocken die Firestore-API nicht voll, sondern testen reines `firebase-collection.js`-Logic).
2. **Playwright Specs:** `node --check <file>` → alle 8 syntax-valid. Echte Ausführung benötigt Browser-Install + Live-HTTP-Server, im Scope von Batch 3 nicht verifiziert. CI wird das prüfen.
3. **Python Tests:** `pip install pytest beautifulsoup4 requests lxml` → `python -m pytest tests/python/ -q --ignore=test_price_proxy_and_price_scraper.py` → **38 pass / 0 fail** (HEAD 4 + neu 7 = 11 Files, plus existing tests).

### Caveats

- **Visual Snapshots:** `visual-full-page-coverage.spec.js` asserted gegen die 14 PNG-Baselines in `tests/e2e/__snapshots__/{testFilename}/`. Diese sind identisch zu Golden (selbe Path-Quirk vererbt). Layout-Änderungen in Batch 1+2 (Sidebar +2 Items, meta-view-Container weg, current-meta default-active) werden zu **Snapshot-Mismatches** führen, wenn CI die Specs ausführt. Re-Baselining via `npm run test:visual:fullpage:ci -- --update-snapshots` empfohlen, sobald die neue Layout-Variante als final akzeptiert ist.
- **Python E2E + verify-scripts:** Nicht restauriert (Phase 3 P1-Liste war auf die 7 Python-Unit-Tests beschränkt). Die 5 deleted Python-E2E-Skripte (`e2e_battle_journal`, `e2e_city_league_meta`, `e2e_current_meta_global`, `e2e_deck_analysis_japan`, `e2e_past_meta`) brauchen einen Live-HTTP-Server zum Assert und sind out-of-scope für Test-Recovery.

### Outcome

| Vorher                 | Nachher                                                   |
| ---------------------- | --------------------------------------------------------- |
| 21 unit-test files     | **36 unit-test files (+71%)**                             |
| 273 pass / 0 fail      | **288 pass / 0 fail (+15)**                               |
| 4 Playwright specs     | **12 Playwright specs (+8)**                              |
| 4 Python pytest files  | **11 Python pytest files (+7), 38 pass**                  |
| Module-Coverage 91.72% | **96.05%** (Bundle wurde durch meta-view-Removal kleiner) |

---

## Batch 4 — Doku-Updates

**Commit:** [phase-4: README + PROJECT_STRUCTURE updates (Batch 4/4)]

### `PROJECT_STRUCTURE.md` — komplett neu geschrieben

Vorher: Stand „März 2026", beschrieb Scraper im Repo-Root, `js/app.js (~16.000 Zeilen)` (existierte nie auf HEAD), 8 Settings-Files am Root.

Nachher: Stand „Mai 2026 (post wave-0/1 + IA-Refactor revert)" — beschreibt:

- 26 IIFE-Files in `js/` + 22 ES-Module in `js/modules/`
- 27 CSS-Files in `css/`
- Backend in `backend/{core,scrapers,services,tools}/`
- `scripts/` mit build-bundle/build-modules/run-unit-tests/build_parquet/upload_to_r2/generate-sri
- 9 CI-Workflows mit SHA-Pinning
- Tests-Aufschlüsselung: 36 JS-Unit + 12 Playwright + 12 Python-Unit + 7 Python-E2E
- `_dist/` Build-Output (gitignored)
- 12-Tab-Layout mit `current-meta` als default-active
- 11 Profile-Subtabs
- Playtester-Retirement zu TCG Showdown
- Vollständiger Boot-Order (Inline-Script + Loading-Screen + Firebase compat + Module-Bundle + 15 Legacy-Scripts + Lazy-Loader)
- Daten-Pipeline-Flow mit R2-Optionaler

### `README.md` — Targeted-Edits

1. **Projekt-Struktur-Tree (Z. 11-69):** Komplett neu — beschreibt die heutige Struktur mit js/modules/, scripts/, \_dist/, ESLint/Prettier/TypeScript.
2. **Schnellstart (Z. 73-87):** `npm ci` ergänzt; Linux/macOS-aktivierungs-Befehl ergänzt; pyarrow+boto3 in Dependencies.
3. **„Web-Interface öffnen" (Z. 119-135):** `npm run build:bundle` als nötiger Schritt hervorgehoben; Lint/Typecheck/Test als Pre-Commit-Checks ergänzt.
4. **Tab-List (Z. 137):** „11 Top-Level-Tabs + Profile-Subtabs" statt „10 Tabs"; korrekte Tab-Reihenfolge mit Showdown-Handoff.
5. **Playtester-Sandbox-Sektion (#8):** Auf 4 Zeilen reduziert mit Hinweis auf Showdown-Handoff.
6. **Doku-Liste am Ende (Z. 359-374):** Tote MD-Refs entfernt (`MULTIPLAYER_INTEGRATION_GUIDE.md`, `DATA_DIRECTORY_STRUCTURE.md`, `CARD_DATA_SYSTEM.md`, `LIVE_PRICE_SYSTEM.md`, `TOURNAMENT_META_IMPLEMENTATION.md`, `CITY_LEAGUE_ADDITIONAL_TOURNAMENTS.md`, `CARDMARKET_UI_CHANGELOG.md`). `R2_SETUP.md` + `FIRESTORE_RULES.md` + `docs/audit/` ergänzt.

---

## Was Phase 4 NICHT geändert hat (bewusst)

| Aus Phase-3 §3 (KEEP-Liste)                                                                                       | Status         |
| ----------------------------------------------------------------------------------------------------------------- | -------------- |
| Wave-1 ES-Module-System (`js/modules/`, esbuild, ESLint, Prettier, TypeScript, c8, 14 npm-Scripts)                | ✓ unangetastet |
| CI-Pipeline-Erweiterungen (9 Workflows, SHA-Pinning, codeql, dependabot, preview-build, verify-decklist)          | ✓ unangetastet |
| R2/DuckDB-Pilot                                                                                                   | ✓ unangetastet |
| Wave-0 Cleanup (was gelandet ist)                                                                                 | ✓ unangetastet |
| Andere Detailfixes (city-league date picker, top-256 count, CSP blob, TDZ crash, INCL/EXCL row, i18n-Split, etc.) | ✓ unangetastet |

| Aus Phase-3 §4 (P2/P3-Pflichtoptionen)    | Status                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P2-1A: Wave-2 entfernen**               | ✓ in Batch 1 erledigt                                                                                                                                       |
| **P2-2: `frontend/` entfernen**           | ✓ in Batch 1 erledigt                                                                                                                                       |
| **P2-4: Firebase v11 Smoke-Test**         | ⏸ NICHT durchgeführt (braucht Live-Browser + Auth-Setup, out of scope). **Empfehlung:** in Phase 5 oder direkt am Live-Deployment validieren.               |
| **P3-1: README/PROJECT_STRUCTURE-Update** | ✓ in Batch 4 erledigt                                                                                                                                       |
| **P3-2: ESLint Warnings auf 0 bringen**   | ⏸ NICHT durchgeführt (1926 `'_' unused` warnings sind kosmetisch und CI ist warn-only). Optional in Phase 5: `argsIgnorePattern: '^_'` in eslint.config.js. |
| **P3-3: Prettier-format auf alle Files**  | ⏸ NICHT durchgeführt (3 files mit Format-Warnings, keine errors). Optional in Phase 5: `npm run format:fix`.                                                |
| **P3-4: Snapshot-Path-Quirk fixen**       | ⏸ NICHT durchgeführt (Quirk vererbt aus Golden, beeinflusst nicht die Funktionalität).                                                                      |

---

## Empfohlene Phase-5-Items (falls weiter gewünscht)

1. **Firebase v11 Smoke-Test (P2-4):** Lokal/Deploy ausführen — Sign-In + Firestore-Write + Read sample.
2. **Visual-Snapshot Re-Baselining:** Nach Layout-Änderungen aus Batch 1+2.
3. **5 Python-E2E-Skripte restaurieren:** `e2e_battle_journal`, `e2e_city_league_meta`, `e2e_current_meta_global`, `e2e_deck_analysis_japan`, `e2e_past_meta` — brauchen Live-Server, eventuell Anpassung an HEAD-Tab-IDs.
4. **ESLint Warnings auf 0 (P3-2):** `argsIgnorePattern: '^_'` Config-Anpassung.
5. **Prettier-Format auf 3 Files (P3-3):** `npm run format:fix` + Commit.
6. **`origin/main` mit Branch syncronisieren:** Da `main` HEAD heute auf `5f23a3f` (15. Mai, Vor-Golden) zeigt, ist die heute lebende Wave-1/2-Arbeit nicht auf main. Wenn dieser Branch (`claude/gracious-edison-ITIKO`) der gewünschte Stand ist, sollte main entsprechend gesyncht werden (per merge oder fast-forward), oder eine andere Strategie gewählt werden.

---

**Phase-4-Status:** ABGESCHLOSSEN.

**Empfohlene nächste Schritte:**

- (a) Manuelle Verifikation der drei P0-Fixes im Browser (Sandbox-Buttons / `#metacall` Hash-Deep-Link / Sidebar-Navigation).
- (b) PR aus diesem Branch eröffnen, CI-Pipeline auf vollständigen Run prüfen (`deploy-pages.yml` lint + typecheck + tests + coverage + bundle-build, `visual-nonmeta.yml` + `visual-fullpage.yml` → erwarteter Snapshot-Mismatch).
- (c) Visual-Snapshots gegen die neue Layout-Variante neu baseline.

Phase-1-bis-Phase-4-Audit-Dokumente liegen im Repo unter `docs/audit/`.
