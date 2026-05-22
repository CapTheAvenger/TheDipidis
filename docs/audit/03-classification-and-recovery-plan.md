# Audit 03 — Klassifikation + Recovery-Strategie

**Audit-Tag:** 2026-05-22
**Auditor:** Claude (Opus 4.7, 1M-Context-Modus)
**Inputs:** Phase 1 (Golden Reference 481c9bd) + Phase 2 (Diff Golden↔HEAD 7d12922) + Live-Verifikation am HEAD

---

## TL;DR (8 Bullets)

1. **HEAD ist NICHT stable production.** Drei harte Bugs lassen sich direkt aus dem Code beweisen:
   (a) **`profile-split` bricht Hash-Routing** — `inline-init.js:HASH_ALIASES` mappt `#metacall`/`#journal`/`#testinggroups` auf Top-Level-Tab-IDs (`meta-call`, `battle-journal`, `testing-groups`), die im `index.html` **nicht existieren**. Diese Tab-IDs sind weiter nur als Profile-Subtabs vorhanden (`#profile-metacall` etc.). Auch `app-testing-groups.js:789/1018` ruft `switchTabAndUpdateMenu('testing-groups'/'meta-call')` → No-Op.
   (b) **Sandbox-Buttons feuern `ReferenceError`** — `index.html:4144-4151` ruft `openMultiplayerMenu`, `startPlaytesterSetup`, `ptFlipBoard`, `ptToggleLog`, `ptZoomBoard`, `ptUndo` auf. **Keine** dieser 6 Funktionen ist in der Stub-Liste in `app-core.js`. Stubs decken nur `openPlaytester`, `openPlaytesterSetup` (≠ `startPlaytesterSetup`!), `startPlaytester{WithMirror,WithOpponent,Standalone}`, `parseSandboxDeckToExactPrints`, `openMultiplayerFromSandbox`.
   (c) **`city-league-analysis` und `current-analysis` sind aus dem Sidebar-Menü verschwunden** — Golden hatte 5 Meta-Buttons, HEAD hat 3 (current-meta / city-league / past-meta). Diese Tabs sind nur noch erreichbar über deck-tile-Clicks innerhalb von City-League/Current-Meta (`app-core.js:1354/1373/1432/1487`).
2. **TypeScript typecheck PASSES** (`npm run typecheck` grün, kein Output). **JS-Unit-Tests 298/0 passing** (verifiziert). **Module-Coverage 91.72%/87.15%/84.09%/91.72%** — über Threshold. **Lint: 1942 warnings, 0 errors** (alle `'_' unused`, kosmetisch).
3. **Wave-1 ES-Modul-Bundle baut sauber** (`npm run build:bundle` → 21 Files zu `_dist/app.bundle.js` 2.4 MB + `_dist/app.modules.bundle.js` 118 KB in 139 ms). **`app.bundle.js` ist artifact-only — NICHT in `index.html` shipped.** Produktion lädt weiterhin 15 einzelne `<script>`-Tags.
4. **`meta-view`-Container ist `tab-content active` im HTML** und enthält noch das volle Wave-2-Scaffolding mit Placeholder „Wave-2 IA-Refactor — scaffold ready. Deck-list rendering arrives in step 3." Bei jedem Page-Load gibt es ein **kurzes FOUC** auf diesen Placeholder, bis `bootstrap.js init()` `switchTab('current-meta')` aufruft.
5. **Test-Coverage-Verlust auf existierendem Code:** 16 JS-Unit + 8 Playwright + 7 Python-Unit + 5 Python-E2E = **36 gelöschte Tests**, von denen **alle nachweislich Code testen, der weiterhin im HEAD existiert** (`test-firebaseCollection.js` ↔ `firebase-collection.js` 245 KB; `test-deckBuilder.js` ↔ `app-deck-builder.js` 447 KB, usw.).
6. **`frontend/` ist tot** — Grep nach `frontend/components/` ergibt nur die leeren Container-`<div>`s in `index.html`. 48 KB an HTML/CSS, die nirgends geladen werden. Wave-0-Cleanup hat das übersehen.
7. **Empfehlung Recovery-Strategie:** **„Selektive Restauration"** — Wave-0/Wave-1/Wave-3/CI-Hardening/R2 vollständig erhalten (echter Fortschritt), Wave-2 zurücknehmen (Hybrid-Zustand auflösen), profile-split fertigstellen oder zurücknehmen (entscheiden), Sandbox-Stubs vervollständigen oder Tab vollständig entfernen, gelöschte Tests selektiv zurückholen (Prio P0 → Deck-Builder + Firebase-Collection + CSV-Parsing).
8. **8 konkrete Fix-Steps** (siehe §4) mit Effort-Schätzung: 4 × P0 (~2-4h gesamt), 4 × P1 (~3-5h), plus Doku-Updates (~1h). Insgesamt 6-10h für vollständige Wiederherstellung der Golden-Funktionalität auf der heutigen Wave-1-Plattform.

---

## 1. Was im HEAD nachweislich BROKEN ist (hart)

### 1.1 ❌ `profile-split`-Routing zerschossen

**Symptom:** URLs wie `https://thedipidis.app/#metacall` oder `#journal` oder `#testinggroups` navigieren in den Nichts. Auch Cross-Links aus `app-testing-groups.js` (z.B. „zu Meta Call wechseln" Button-Click) wirken nicht.

**Evidenz:**
- `js/inline-init.js:144-150` definiert:
  ```js
  const HASH_ALIASES = {
      ...
      // Promoted to top-level tabs in the IA-refactor follow-up.
      'metacall':          'meta-call',
      'meta-call':         'meta-call',
      'journal':           'battle-journal',
      'battle-journal':    'battle-journal',
      'testinggroups':     'testing-groups',
      'testing-groups':    'testing-groups',
  };
  ```
- `js/inline-init.js:21-27` definiert `metaTabs` Set inkl. `meta-call`, `battle-journal`, `testing-groups` für Sidebar-Cluster-Sync.
- `js/app-testing-groups.js:789`: `if (typeof switchTabAndUpdateMenu === 'function') switchTabAndUpdateMenu('testing-groups');`
- `js/app-testing-groups.js:1018`: `switchTabAndUpdateMenu('meta-call');`
- ABER: `index.html` enthält **kein** `<div id="meta-call" class="tab-content">`, kein `<div id="battle-journal">`, kein `<div id="testing-groups">`.
- Stattdessen existieren weiterhin: `<div id="profile-metacall">` (Z. 3544), `<div id="profile-testinggroups">` (Z. 3549), `<div id="profile-journal">` (Z. 3489) — alle als `profile-tab-content`.

**Ursache:** Commit `977d366` „profile-split (A): Battle Journal / Meta Call / Testing Groups → top-level" hat die JS-Routing-Layer vorbereitet, aber die HTML-Restrukturierung blieb aus (oder wurde danach revertiert).

**Schweregrad:** **HART** — User-Facing-Bug. Direkter Funktionsverlust gegenüber Golden (Profile-Subtab-Routing funktionierte dort sauber).

### 1.2 ❌ Sandbox-Buttons → `ReferenceError`

**Symptom:** Beim Klick auf irgendeinen Button im Sandbox/Playtester-Modal feuern `ReferenceError: ptXxx is not defined` an die Browser-Konsole. Toast-Notification mit Showdown-Hinweis kommt NICHT, weil die Stub-Funktion gar nicht aufgerufen wird.

**Evidenz:**
- `js/app-core.js:386-406` registriert Redirect-Stubs für genau 7 Function-Names:
  ```js
  ['openPlaytester', 'openPlaytesterSetup', 'startPlaytesterWithMirror',
   'startPlaytesterWithOpponent', 'startStandalonePlaytester',
   'parseSandboxDeckToExactPrints', 'openMultiplayerFromSandbox']
  .forEach(...);
  ```
- `index.html:4144`: `onclick="openMultiplayerMenu()"` — **nicht** in Stub-Liste.
- `index.html:4145`: `onclick="startPlaytesterSetup()"` — Stub heißt `openPlaytesterSetup`, ≠ `startPlaytesterSetup`. **Namens-Mismatch!**
- `index.html:4146`: `onclick="ptFlipBoard()"` — nicht in Stub-Liste.
- `index.html:4147`: `onclick="ptToggleLog()"` — nicht in Stub-Liste.
- `index.html:4148`: `onclick="mpFlipCoin ? mpFlipCoin() : showToast('Nur im Multiplayer')"` — defensiv, kein Bug.
- `index.html:4149`: `onclick="ptZoomBoard()"` — nicht in Stub-Liste.
- `index.html:4151`: `onclick="ptUndo()"` — nicht in Stub-Liste.

**Ursache:** Playtester-Retirement (Wave-0 oder im Zuge von Wave-1) hat die Stub-Liste in `app-core.js` an einer **älteren** Funktions-Liste orientiert (vermutlich an Multiplayer-Setup-Funktionen aus `js/firebase-multiplayer.js`), nicht an den tatsächlich in HTML gerufenen Funktionsnamen.

**Schweregrad:** **HART** — User-Facing-Bug. Sandbox-Tab ist im Sidebar verfügbar, lädt scheinbar, aber jeder Button-Klick ist tot.

### 1.3 ❌ `city-league-analysis` + `current-analysis` aus Sidebar verschwunden

**Symptom:** User kann nicht direkt zu „City League Deck Analysis" oder „Current Meta Deck Analysis" navigieren — nur über Umweg via tile-click auf dem `city-league`- oder `current-meta`-Tab.

**Evidenz:**
- Golden `index.html` Sidebar hatte 5 Meta-Subitems: current-meta / current-analysis / city-league / city-league-analysis / past-meta.
- HEAD `index.html` Sidebar hat nur 3: current-meta / city-league / past-meta (Z. 455-461).
- Die `<div id="city-league-analysis">` (Z. 636) und `<div id="current-analysis">` (Z. 1049) existieren noch im HTML als Top-Level-Tabs, sind aber nicht über Sidebar erreichbar.
- Hash-Aliases (`HASH_ALIASES` in `inline-init.js`) listen die 2 Tabs nicht — kein `#current-analysis`, kein `#city-league-analysis`.
- Erreichbar nur über `switchTab('city-league-analysis')`-Aufrufe in `app-core.js:1354/1373` (von `analyzeCombinedArchetype()` und `navigateToAnalysisWithDeck()` — beides tile-click-Handler).

**Ursache:** Wave-2 IA-Refactor B/C („delete legacy meta hub + v1 menu items") hat die Sidebar-Menu-Items entfernt. Der nachfolgende Revert (`7d12922`) hat 3 zurückgeholt, die 2 Analysis-Items aber vergessen.

**Schweregrad:** **HART** — UX-Regression. Funktion existiert, aber UI-Pfad zu ihr ist gebrochen.

### 1.4 ⚠ Wave-2-Placeholder beim Page-Load (FOUC)

**Symptom:** Nach `<html>`-Render aber vor `DOMContentLoaded` ist `<div id="meta-view" class="tab-content active">` sichtbar. Diese enthält den Text „Meta Analysis (Wave-2 IA-Refactor) — scaffold ready. Deck-list rendering arrives in step 3." Auf langsamen Connections / großen Bundles → **mehrere hundert ms Flash dieses Placeholder-Texts**.

**Evidenz:**
- `index.html:570`: `<div id="meta-view" class="tab-content active">`
- `index.html:597-600`: Placeholder-Text mit i18n-Key `metaView.scaffoldPlaceholder`.
- `js/modules/meta-view/bootstrap.js:36-61`: `init()` ruft `switchTab('current-meta')` **erst** wenn `DOMContentLoaded` feuert. Vorher: `meta-view` ist active.

**Ursache:** Wave-2-Scaffold wurde im HTML belassen (Z. 570-612), nach dem Revert.

**Schweregrad:** **MITTEL** — User-Facing-Cosmetic. Erste Eindruck-Verschlechterung, kein Funktionsverlust.

### 1.5 ❌ Test-Coverage-Regression auf existierendem Code

**Symptom:** Coverage-Verlust auf Legacy-Bereichen, die im HEAD weiterhin produktiv sind.

**Evidenz (aus Phase 2 §5.2):** Alle 16 gelöschten JS-Unit-Tests + 8 Playwright-Specs + 7 Python-Unit-Tests testen Funktionalität, die im HEAD weiter existiert. Die 6 neuen Unit-Tests (für `card-key`, `metrics`, `store`, `meta-view/*`) decken nur die **neue** ES-Module-Surface ab — sie ersetzen die alten Legacy-Tests nicht.

**Quantifizierung:**
- Vorher: 34 JS-Unit-Test-Files, 236 passes
- Nachher: 23 JS-Unit-Test-Files, 298 passes
- Aber: **22 JS-Unit-Test-Files testen Legacy-Code (ohne Coverage-Ersatz)**, davon **16 ersatzlos gelöscht**.
- Coverage-Tool zeigt nur `js/modules/*` Threshold; das große Legacy-Inventar in `js/*.js` ist coverage-blind.

**Schweregrad:** **HART** — Regression-Risiko. Bei jedem zukünftigen Refactor von z.B. `app-deck-builder.js` (447 KB!) fehlt das Test-Safety-Net.

---

## 2. Was im HEAD verdächtig / hybrid ist

### 2.1 ⚠ `meta-view`-Container default-active

Siehe §1.4. Konzept-Inkonsistenz: Wave-2 wurde revertiert, aber der Container bleibt im aktiv-Modus.

### 2.2 ⚠ Wave-2 Reste

- `js/modules/meta-view/store.js` (144 LOC) — Reactive store nicht mehr genutzt im 5-Tab-Layout
- `js/modules/meta-view/controller.js` (124 LOC) — `switchFormat`/`selectDeck`/`backToList`/`setSearchFilter` nicht mehr in HTML-onclick
- `js/modules/meta-view/url-router.js` (119 LOC) — `#meta?format=...` deep-link-Parsing
- `js/modules/meta-view/bootstrap.js` (71 LOC) — registriert DOMContentLoaded, ruft `switchTab('current-meta')`
- `css/meta-view.css` — Segmented-Control-Styles, weiterhin geladen
- `tests/unit/test-meta-view-store.js` + `test-meta-view-url-router.js` — Tests für nicht mehr aktiven Code
- `index.html:570-612` — Segmented-Control + List/Detail-Container

**Funktional in HEAD:** Nur das Segmented-Control im `meta-view`-Container ruft `metaViewSwitchFormat()`, das in `bootstrap.js:29-37` überschrieben ist auf `switchTabAndUpdateMenu(legacyTabId)`. Theoretisch noch eine „Nav-Aid", aber:
- Der Container wird beim Page-Load aktiviert, dann sofort ge-switcht — das Segmented-Control wird nie sichtbar in der Praxis.
- URL-Routing via `#meta?format=...` funktioniert noch — aber kein User-Pfad führt dazu.

**Entscheidung nötig (siehe §5 Optionen):**
- **A) Wave-2 final entfernen:** Lösche `js/modules/meta-view/*`, `css/meta-view.css`, Tests, HTML-Container, Import-Zeile in `modules/index.js`. → Saubere 5-Tab-Architektur wie Golden.
- **B) Wave-2 zu Ende führen:** Setze `meta-view` als echten Konsolidierungs-Tab fort, integriere Deck-Listen-Rendering, mache Wave-2 die Default-UX. → Mutiger Architektur-Schritt.
- **C) Status quo akzeptieren:** Belasse Hybrid für später. → Tech-Debt-Acumulation.

### 2.3 ⚠ `frontend/` Dead Code (Wave-0-Lücke)

**Befund:** 48 KB an HTML-Komponenten (`header.html`, `sidebar.html`, `TabContent_*.html`) + 1 CSS (`dashboard-theme.css`), die nirgends geladen werden.

**Bestätigung:** `grep -rln 'frontend/components/' js/ scripts/ index.html` ergibt **nur** den leeren `<div id="header-container">` in index.html (Z. 416-417).

**Entscheidung:** Risikolos zu löschen. Größenordnung: 48 KB Repo-Reduktion.

### 2.4 ⚠ `_archive/`-Cleanup partiell

**Was gelöscht wurde (`git log`):** `_archive/audit-artifacts-2026-04-02/` komplett (24 Files), `_archive/dead-assets-2026-03-31/` komplett (3 Files), `_archive/utils/` komplett (10 Files), `data/_archive/soft-delete-2026-03-31/` komplett (12 Files).

**Was übersehen wurde:**
- `frontend/` (Wave-0 hätte das mit einsammeln können)
- `dashboard-theme.css`-Duplikat in `css/` (82 B leer)
- Veraltete MD-Docs: `PROJECT_STRUCTURE.md`, `README.md` (siehe §2.5)
- `audit_single_tab.js` am Repo-Root (0 B, **war** in Phase-1 erwähnt — bestätigt gelöscht in HEAD ✓)

### 2.5 ⚠ `README.md` / `PROJECT_STRUCTURE.md` veraltet

Phase 1 § 11 hatte das bereits identifiziert. HEAD-Stand unverändert.

Beide Dokumente beschreiben:
- Single-File `js/app.js` (~16.000 Zeilen) — existiert nicht
- Scraper im Repo-Root — sind in `backend/scrapers/`
- Veraltete Liste der Tabs / Module

Bei jedem neuen Mitwirkenden ist das ein Verwirrungs-Risiko.

---

## 3. Was bewahrt werden MUSS (echter Fortschritt)

### 3.1 ✅ Wave-1 ES-Module-System

**Wert:** Endlich eine echte Module-Struktur (`js/modules/` mit 4 Subdirs). esbuild produziert sauber, TypeScript checkt, ESLint läuft, Prettier konfiguriert, Coverage-Threshold (85/80/70) wird eingehalten. **Strategisches Fundament** für alle weiteren Refactorings.

**Konkrete Module (verifiziert lauffähig):**
- `card-key.js` — kanonische Card-Key-Utilities (verbreitet eingesetzt)
- `metrics.js` — `parsePercent`/`formatPercent`/`weightedAverageWinRate`
- `stores/store.js` + `user-store.js` — Reactive Store-Primitiv
- `firebase/init.js` — Firebase Modular SDK Lazy-Loader (vorbereitend für v11)
- `archetype-icons.js`, `tcg-showdown-link.js`, `dom-helpers.js`, `deck-analysis-shared.js`, `auth-ui-helpers.js`, `card-data-cache.js`, `card-capability-engine.js`, `app-anti-tech.js`, `app-tech-lab.js`, `app-calculator.js` — alle ehemals IIFE, jetzt ES-Modul mit explicit exports

### 3.2 ✅ CI-Pipeline-Erweiterungen

- **deploy-pages.yml** mit 11 Steps (war 5):
  - Lint (warn-only) → Typecheck (blockierend) → Unit-Tests → Coverage (advisory) → Module-Coverage-Gate (blockierend) → Build Wave-1 Bundle (artifact) → Bundle-Size-Budget → NPM-Audit (prod blocks, devDeps advisory) → Python-Tests → Build/Deploy
- **codeql.yml** — Security-Scanning weekly
- **dependabot.yml** — Auto-Update PRs für npm + GH-Actions
- **preview-build.yml** (Wave-3) — PR-Preview-Artifacts ohne 2. Hosting
- **verify-decklist-counts.yml** — Manual dispatch CSV-vs-Limitless-Cross-Check
- **SHA-Pinning aller Third-Party-Actions** (Supply-Chain-Hardening)
- **Two-Phase weekly-full-update** — Prague-Bug-Prevention für `prepare_card_data.py`

### 3.3 ✅ Test-Infrastruktur

- **`scripts/run-unit-tests.js`** — single runner statt for-Loop in CI
- **c8 Coverage** mit HTML + JSON-Summary + Threshold-Gating
- **ESLint Flat-Config** (eslint.config.js)
- **Prettier** (.prettierrc.json + .prettierignore)
- **TypeScript** (`@ts-check` Pragma, tsconfig.json mit allowJs/checkJs, types/globals.d.ts für Window-Globals)
- **14 npm scripts** statt 3

### 3.4 ✅ R2/DuckDB-Pilot

Vorausschauend für CSV-Wachstum:
- `scripts/build_parquet.py` — CSV → Parquet (kompakter Spaltenformat)
- `scripts/upload_to_r2.py` — boto3-Upload zu Cloudflare R2
- `js/modules/data/duckdb-loader.js` + `city-league-pilot.js` — DuckDB-WASM-Query-Layer
- Activation gated by `?duckdb=1` URL-Param — kein Risiko für Produktion
- `R2_SETUP.md` — Setup-Doku

### 3.5 ✅ Wave-0-Cleanup (was funktioniert hat)

- `_archive/audit-artifacts-2026-04-02/` (24 Files), `_archive/dead-assets-*` (3), `_archive/utils/` (10), `data/_archive/soft-delete-*` (12) — alle korrekt entfernt
- 12 lokale `visual-*.{exit,err,json,rc}` am Root — entfernt
- Stray 0-Byte-Files (`audit_single_tab.js`, `prepare_card_data.py`, `current-meta.exit`, `terminal-check.txt`, `runtime-verify-results.txt`, `tmp_*.py`, `backend - Verknüpfung.lnk`) — entfernt
- `MULTIPLAYER_INTEGRATION_GUIDE.md` (toter Doku) — entfernt
- Lokale Test-Outputs in tests/ — entfernt

Repo-Größenordnung wurde laut Phase-2 um ~304K Zeilen netto reduziert (Wave-0 + Daten-Churn).

### 3.6 ✅ Andere wertvolle Detailfixes

- `fix(city-league)`: explicit error when date picker out of range
- `fix(city-league)`: respect date filter in Decks Used tile
- `fix(city-league)`: close 463-vs-398 gap by deduping orphan archetype names
- `fix(top-256)`: count tournament decks via `total_decks_in_archetype` (was always 1×)
- `fix(current-meta-analysis)`: show Top-256 breakdown in Quick-overview
- `fix(csv)`: absolute URL for PapaParse worker:true mode
- `fix(csp)`: allow blob: workers for PapaParse off-main-thread parsing
- `fix(critical)`: TDZ crash in firebase-config (Wave-1 sub-fix)
- `fix(testing-groups)`: remove dead `_refreshCurrentGroup()` + typecheck
- `feat(deck-analysis)`: explicit INCL/EXCL row for algorithm controls
- `feat(tools)`: `verify_card_decklist_counts` cross-check tool
- `i18n`-Split: `i18n.js` → `i18n.js` + `i18n-de.js` (DE-Strings ausgelagert)

---

## 4. Recovery-Priorisierung — konkrete Action-Items

### P0 — Hart broken, sollte zeitnah behoben werden

| # | Fix | Effort | Risiko |
|---|---|---|---|
| **P0-1** | **Sandbox-Stubs in `app-core.js` vervollständigen.** Ergänze in der Stub-Liste: `ptStartGame`, `ptUndo`, `ptLog`, `ptShowManual`, `ptToggleLog`, `ptFlipBoard`, `ptZoomBoard`, `openMultiplayerMenu`, `startPlaytesterSetup` (≠ `openPlaytesterSetup`!), `closePlaytesterSetup`. **Alternative:** Sandbox-Tab + Modal aus `index.html` entfernen (komplett verstecken) — vollständige Konsequenz aus Playtester-Retirement. | 15 Min (Stubs) ODER 1-2 h (HTML-Cleanup) | Niedrig |
| **P0-2** | **profile-split fertigstellen ODER zurücknehmen.** Variante A (zu Ende führen): Drei Top-Level-`<div id="meta-call|battle-journal|testing-groups" class="tab-content">` in `index.html` anlegen, Inhalt aus den `profile-*`-Subtabs migrieren, Sidebar-Menu-Items hinzufügen. Variante B (zurücknehmen): HASH_ALIASES + metaTabs-Set + `app-testing-groups.js:789/1018` auf `profile-metacall|profile-journal|profile-testinggroups` zurücksetzen, Profile-Detour wieder herstellen. | A: 2-3 h <br> B: 30 Min | A: Mittel <br> B: Niedrig |
| **P0-3** | **`city-league-analysis` + `current-analysis` zurück ins Sidebar-Menü.** Zwei `<button id="menu-btn-current-analysis"/...-city-league-analysis">` in `index.html` Sidebar einsetzen, im Meta-Cluster nach den jeweiligen Eltern-Tabs. Optional HASH_ALIASES für `#current-analysis`/`#city-league-analysis` ergänzen. | 15 Min | Niedrig |
| **P0-4** | **`meta-view`-Placeholder-FOUC eliminieren.** Optionen: (a) `class="tab-content active"` → `class="tab-content"` und `current-meta` als default-active setzen. Bootstrap.js init() kann dann den Placeholder-DIV ggf. unangetastet lassen. (b) Wave-2-Container vollständig aus HTML entfernen (gehört zu Wave-2-Cleanup, §4.P2). | 5 Min (a) <br> 30 Min (b) | Niedrig |

**P0-Subtotal:** ~3-6 h falls beide Variante-A-Pfade, ~1-2 h falls minimal-Recovery.

### P1 — Signifikanter Coverage-Verlust, dringend empfohlen

| # | Fix | Effort | Risiko |
|---|---|---|---|
| **P1-1** | **Zurückholen kritischer JS-Unit-Tests (Top 5):** `test-firebaseCollection.js`, `test-deckBuilder.js`, `test-parseCSV.js`, `test-dataIntegrity.js`, `test-coreDataProcessing.js`. Diese decken die zwei größten Module (`firebase-collection.js` 245 KB + `app-deck-builder.js` 447 KB) plus die zentrale Datenverarbeitungs-Pipeline ab. **Quelle:** `git show 481c9bd:tests/unit/test-X.js > tests/unit/test-X.js` pro File. ggf. Anpassung an HEAD-Änderungen (test-firebaseCollection muss evtl. mit Firebase v11-Mocks neu schreiben). | 1-2 h (copy) <br> +1-2 h (Adapter-Layer-Anpassung) | Niedrig-Mittel |
| **P1-2** | **Zurückholen Card-Logic-Tests:** `test-isAceSpec-removeCard.js`, `test-getPreferredVersionForCard.js`, `test-getRarityPriority.js`, `test-other-international-prints.js`, `test-calculateCombinedVariantStats.js`, `test-fuzzyArchetypeMatch.js`. Diese sind unabhängig vom Wave-1-Refactor — sollten direkt grün laufen. | 30 Min | Niedrig |
| **P1-3** | **Zurückholen rest Utility-Tests:** `test-rarity-switcher-ready.js`, `test-sanitize-proxy.js`, `test-utilsExtra.js`, `test-helpers.js`, `test-parsePastMetaDateMs.js`. | 30 Min | Niedrig |
| **P1-4** | **Zurückholen Visual-Coverage-Spec:** `tests/e2e/visual-full-page-coverage.spec.js`. Visual-Snapshots für alle Tabs schützen das Layout vor unbeabsichtigten Regressions (z.B. wie der `meta-view`-Placeholder oder Sidebar-Menu-Verlust hier!). | 30 Min | Niedrig — Snapshots in `tests/e2e/__snapshots__/` müssen ggf. neu generiert werden |
| **P1-5** | **Zurückholen anderer Playwright-Specs:** `cards-keyboard-accessibility`, `city-league-language-switch`, `rarity-switcher`, `proxy-import-errors`, `proxy-queue-reset`. Alle testen weiter-existierende Features. | 30 Min - 1 h | Niedrig |
| **P1-6** | **Zurückholen Python-Unit-Tests:** `test_card_database.py`, `test_csv_and_settings.py`, `test_prepare_card_data.py`, `test_card_scraper_shared.py`, `test_scraper_extraction.py`, `test_scraper_functions.py`, `test_scraper_additional.py`. Diese testen Backend-Code, der unverändert weiter läuft. | 30 Min | Niedrig |

**P1-Subtotal:** ~3-5 h.

### P2 — Konzept-Konsistenz, diskussionsbedürftig

| # | Fix | Effort | Entscheidung nötig |
|---|---|---|---|
| **P2-1** | **Wave-2 endgültige Entscheidung** (siehe §5). Variante A (vollständig zurücknehmen): Lösche `js/modules/meta-view/{store,controller,url-router,bootstrap}.js`, `css/meta-view.css`, Tests `test-meta-view-{store,url-router}.js`, Import-Zeile in `modules/index.js`, `<div id="meta-view">` aus index.html. Variante B (fortsetzen): Implement Wave-2 Step 3+4 Deck-Listen-Rendering richtig. | A: 1 h <br> B: 8-16 h | **JA** |
| **P2-2** | **`frontend/` entfernen.** Lösche `frontend/` komplett aus dem Tree. Lösche die leeren `<div id="header-container">` + `<div id="sidebar-container">` aus `index.html` (Z. 416-417). | 10 Min | Nein |
| **P2-3** | **`dashboard-theme.css`-Duplikat** beseitigen. (`css/dashboard-theme.css` ist 82 B leer, `frontend/css/dashboard-theme.css` 2.3 KB — beides ungenutzt. Mit P2-2 erledigt.) | inkludiert in P2-2 | Nein |
| **P2-4** | **Firebase v11 Smoke-Test:** Manuell Auth (Google Sign-In) + Firestore-Write (z.B. Battle-Journal-Eintrag) + Firestore-Read (Wishlist-Load) testen. Falls Issues → Rollback auf v9.22.0 oder targeted Fix. | 30 Min - 2 h | Bei Issue: JA |

**P2-Subtotal:** ~2-19 h je nach Wave-2-Entscheidung.

### P3 — Doku & Cosmetics

| # | Fix | Effort | Risiko |
|---|---|---|---|
| **P3-1** | **README.md / PROJECT_STRUCTURE.md aktualisieren** an HEAD-Realität (js/modules/, scripts/, _dist/, neue Tabs, Wave-1-Architecture). | 1 h | Niedrig |
| **P3-2** | **ESLint Warnings auf 0 bringen** (`'_' unused`). Entweder Vars explizit als `_unused` benennen oder ESLint-Config anpassen (`argsIgnorePattern: '^_'`). | 30 Min - 1 h | Niedrig |
| **P3-3** | **Prettier-Format auf alle Files anwenden** (`npm run format:fix`). | 5 Min | Niedrig — sollte CI-Test grün lassen |
| **P3-4** | **`tests/e2e/__snapshots__/{testFilename}/` Path-Quirk fixen** — entweder löschen falls leer, oder Snapshot-Template-Resolution debuggen. | 30 Min | Niedrig |

**P3-Subtotal:** ~2-3 h.

---

## 5. Drei Strategie-Optionen für den User

### Option A — „Minimal Recovery" (~3-4 h)

**Fokus:** Nur P0-Items, nichts weiter.

- ✓ Sandbox-Stubs vervollständigen (P0-1, Stubs-Variante)
- ✓ profile-split zurücknehmen (P0-2, Variante B)
- ✓ Sidebar-Menu wiederherstellen für 2 Analysis-Tabs (P0-3)
- ✓ meta-view-Container default-Tab-Switch (P0-4, Variante a)

**Outcome:** HEAD ist wieder funktionsfähig wie Golden, Wave-1-Plattform bleibt erhalten. Test-Coverage-Lücke bleibt. Wave-2-Reste bleiben.

**Risiko:** Test-Coverage-Lücke schmerzt beim nächsten Refactor; Wave-2-Reste sind Tech-Debt.

### Option B — „Vollständige Recovery" (~10-15 h) ⭐ EMPFEHLUNG

**Fokus:** P0 + P1 + Wave-2-Aufräumen (P2-1 Variante A) + frontend-Cleanup (P2-2).

- ✓ Alle P0-Items (3-4 h)
- ✓ Alle P1-Items: Tests zurückholen (3-5 h)
- ✓ Wave-2 final entfernen (P2-1 Variante A, 1 h)
- ✓ frontend/-Cleanup (P2-2, 10 Min)
- ✓ Firebase v11 Smoke-Test (P2-4, 30 Min)
- ✓ Doku-Updates (P3-1, 1 h)

**Outcome:** HEAD entspricht dem Golden-Funktions-Standard mit Wave-1-Vorteilen (ES-Module, CI-Pipeline, Tests-Runner, R2-Pilot). Saubere Konzept-Konsistenz (5-Tab-Layout, kein Hybrid). Wieder volle Coverage auf existierendem Code.

**Risiko:** Mittel — bei P1-Tests-Restauration kann Firebase v11 vs v9-API in `test-firebaseCollection.js` Anpassungen erzwingen. Bei P2-Wave-2-Removal könnten subtile Side-Effects (z.B. URL-Routing für ältere geteilte Links auf `#meta?format=...`) verloren gehen.

### Option C — „Forward Push" (~15-30 h)

**Fokus:** Wave-2 zu Ende führen statt zurücknehmen.

- ✓ Alle P0 + P1
- ✓ Wave-2 Steps 3+4 fertig implementieren (Deck-Listen-Rendering in `#meta-view`, Drilldown-View-Rendering, URL-Routing-Vollendung)
- ✓ profile-split fertigstellen (P0-2 Variante A, 2-3 h)
- ✓ Sidebar reduziert auf Wave-2-Layout (1 Meta-Button statt 3)
- ✓ Visual-Snapshots neu generieren

**Outcome:** Wave-2 wird die Default-UX, konsolidiertes Meta-View. Mutiger Architektur-Schritt nach vorne.

**Risiko:** Hoch — Wave-2 wurde explizit revertiert wegen Lazy-Loader-Mismatch (Commit-Message). Die Ursache muss zuerst verstanden und behoben werden. Außerdem: Visual-Snapshot-Aktualisierung erfordert sorgfältiges Review aller Tabs.

---

## 6. Risiko-Matrix der konkreten Fixes

| Fix | Tech-Risiko | UX-Risiko | Test-Risiko | Empfehlung |
|---|---|---|---|---|
| P0-1 (Sandbox-Stubs) | Niedrig | Niedrig | Niedrig (Buttons funktionieren wieder via Toast) | ✓ DO |
| P0-2A (profile-split fertigstellen) | Mittel (HTML-Struktur-Änderung) | Niedrig (Folge der Wave-2-Vision) | Niedrig | Diskutieren |
| P0-2B (profile-split zurücknehmen) | Niedrig | Niedrig (zurück zu Golden-Layout) | Niedrig | ✓ Default-Pfad |
| P0-3 (Sidebar wiederherstellen) | Niedrig | ✓ Klare UX-Verbesserung | Niedrig | ✓ DO |
| P0-4a (meta-view default-Tab-Switch) | Niedrig | ✓ FOUC weg | Niedrig | ✓ DO |
| P1-1 (Top-5-Tests zurück) | Mittel (Firebase-Mocks) | Niedrig | ✓ Coverage zurück | ✓ DO |
| P1-2/3 (Card-Logic + Utils Tests) | Niedrig | Niedrig | ✓ Coverage zurück | ✓ DO |
| P1-4 (Visual-Coverage-Spec) | Niedrig | Niedrig | ✓ Regression-Schutz | ✓ DO |
| P1-5 (Playwright Specs) | Niedrig | Niedrig | ✓ E2E-Coverage | ✓ DO |
| P1-6 (Python-Tests) | Niedrig | — | ✓ Backend-Coverage | ✓ DO |
| P2-1A (Wave-2 entfernen) | Mittel (URL-Routing-Verlust) | Niedrig | Niedrig | Diskutieren |
| P2-1B (Wave-2 fortsetzen) | Hoch (komplexer Refactor) | Hoch (UX-Wechsel) | Hoch | Nicht jetzt |
| P2-2 (frontend/-Cleanup) | Niedrig | Niedrig | Niedrig | ✓ DO |
| P2-4 (Firebase v11 Smoke-Test) | Niedrig (read-only) | — | — | ✓ DO (Bestätigung) |
| P3-1 (Doku-Update) | Niedrig | Niedrig | Niedrig | ✓ DO |

---

## 7. Phase-3-Verifikations-Daten

### 7.1 Auf HEAD bestätigt (lokal ausgeführt)

| Check | Tool / Command | Result |
|---|---|---|
| JS Unit Tests | `node scripts/run-unit-tests.js` | **298 pass / 0 fail, 23 files** |
| Module Coverage | `npm run test:coverage:modules` | **91.72%/87.15%/84.09%/91.72%** — über Threshold (85/80/70) |
| TypeScript | `npm run typecheck` | **PASS (kein Output)** |
| ESLint | `npm run lint` | **0 errors / 1942 warnings (alle `'_' unused`)** |
| Prettier | `npm run format` | **PASS mit warns auf 3+ Files (kosmetisch)** |
| Bundle-Build | `npm run build:bundle` | **PASS — 21 files → 2.4 MB legacy bundle + 118 KB module bundle in ~139 ms** |

### 7.2 Auf HEAD NICHT geprüft (würden Phase-3-Scope sprengen)

| Check | Warum nicht |
|---|---|
| Playwright Visual-Snapshots | Browser-Install (`npx playwright install`) braucht 200+ MB Download, plus Live-Server-Setup nötig. Verifizieren in Phase 4 falls erwünscht. |
| Python pytest | pytest + lxml + beautifulsoup4 nicht installiert; CI-Job in deploy-pages.yml zeigt: in CI grün am letzten Auto-Update. |
| Live-Smoke-Test im Browser | Lokaler Web-Server müsste laufen + Firebase-Credentials simuliert werden. Empfohlen in P2-4. |
| `_dist/`-Bundle-Inhalt | Habe ich gebaut, aber nicht den minified content inspiziert. Bei Bedarf: `head -c 500 _dist/app.bundle.js` für Sanity-Check. |

---

## 8. Nächste Schritte — Phase 4 (falls vom User freigegeben)

**Phase 4 würde sein:** Implementierung der gewählten Strategie (Option A / B / C).

**Vorgehensweise:**
1. **Branch-Wahl klären** (siehe Phase 0): Soll Phase 4 auf `claude/gracious-edison-ITIKO` weiterarbeiten oder einen neuen Recovery-Branch eröffnen (z.B. `claude/golden-recovery-phase-4`)?
2. **Fix-Reihenfolge:** P0 zuerst (binnen 1 Commit-Batch), dann P1 (selektiv pro Test-Kategorie), dann P2 (mit User-Approval pro Schritt).
3. **Commit-Granularität:** Ein Commit pro logischer Recovery-Einheit, klare Commit-Messages mit Audit-Phase-Referenz.
4. **Verifikation pro Commit:** `npm run lint:fix && npm run typecheck && npm test && npm run test:coverage:modules` muss grün bleiben.
5. **Push-Strategie:** Nach jedem Batch push auf Branch, User-Review möglich.

**Erwartetes Liefer-Format:** Pro Fix ein dokumentierter Commit, am Ende ein **Phase-4-Abschluss-Dokument** `docs/audit/04-recovery-implementation.md` mit Vorher/Nachher-Diff der konkreten Fixes.

---

**Phase-3-Status:** ABGESCHLOSSEN. Audit-Doc bereit zum Commit.
**Decision-Point für Phase 4:** Welche der drei Optionen (A / B / C)? Branch-Strategie?
