# Audit 02 — Vergleich Golden (`481c9bd`) ↔ HEAD (`7d12922`)

**Audit-Tag:** 2026-05-22
**Auditor:** Claude (Opus 4.7, 1M-Context-Modus)
**Range:** `481c9bd..7d12922` = **60 Commits, 266 Files, +219 287 / −523 178 Zeilen**

---

## TL;DR (7 Bullets)

1. **60 Commits in 3 Tagen** (19.–22. Mai). Klassifikation: **Wave-0** Cleanup (laufend), **Wave-1** ES-Module-Migration (18 Commits), **Wave-2** IA-Refactor (14 Commits inkl. Revert), **Wave-3** Preview-Build (1 Commit), R2/DuckDB-Pilot (8 Commits), profile-split (1), CI-Hardening (3), diverse Fixes (~10), Auto-Weekly-Updates (8), PR-Merges (2).
2. **Netto-Zeilen-Bilanz −303 891 Zeilen** ist 95 % Daten-Churn (`data/_archive/*` und `data/*_M3.csv` Updates) plus Wave-0-Cleanup, nicht Code-Verlust.
3. **Architektur-Sprung: Vanilla → Build-Pipeline-Hybrid.** HEAD hat **`_dist/app.modules.bundle.js`** (esbuild-Bundle aus `js/modules/`), **lazy-loader.js**, **package.json mit 14 npm-Scripts** (vs 3 in Golden), Dev-Deps: esbuild + eslint + prettier + typescript + c8. `js/modules/` hat 22 Files in 4 Subdirs (firebase/, stores/, data/, meta-view/).
4. **Firebase compat 9.22.0 → 11.10.0** (Major-Upgrade). 4 neue Workflows: `codeql.yml`, `dependabot.yml`, `preview-build.yml`, `verify-decklist-counts.yml`. **CI-Steps mit SHA-pinning** für alle Third-Party-Actions (Commit 427efbd).
5. **Playtester intentional retired**, redirected zu tcg-showdown.com via Stubs in `app-core.js`. 4 Dateien gelöscht: `playtester.js` (5580 LOC), `playtester-mobile.js` (702 LOC), `playtester-patch.js`, `firebase-multiplayer.js` (1179 LOC). Sandbox-Tab-HTML bleibt, Stubs leiten weiter.
6. **Wave-2 IA-Refactor wurde NICHT vollständig revertiert** — die 6 `meta-view/`-Module + `meta-view.css` + Import in `modules/index.js` bleiben; nur Reparenting + switchTab-Intercept wurden zurückgenommen. **HEAD ist Hybrid-Zustand**: 5-Tab-Layout funktioniert wieder, segmented control bleibt als „Nav-Aid".
7. **⚠ TEST-COVERAGE-REGRESSION:** 16 von 34 JS-Unit-Tests gelöscht (−47 %), 8 von 12 Playwright-Specs (−67 %), 7 von 12 Python-Unit-Tests (−58 %), 5 von 11 Python-E2E (−45 %). 6 neue Unit-Tests für Wave-1/2-Module hinzu. **Netto-Test-Files: 34 → 24 = −29 %**, aber **Pass-Count steigt 236 → 298** (+62) — d.h. Coverage hat sich vom Legacy-Code zur Modul-Surface verlagert. **Gelöschte Tests testeten Code, der weiterhin existiert** (`test-firebaseCollection.js`, `test-deckBuilder.js`, `test-parseCSV.js`, etc.) — definitive Coverage-Reduktion auf existierender Code-Basis.

---

## 1. Commit-Range-Inventur

### 1.1 Klassifikation der 60 Commits (Quelle: `git log 481c9bd..7d12922`)

| Welle | Commits | Was passiert |
|---|---|---|
| **Wave-1 (ES-Module-Migration)** | 18 | `wave-1 firebase modular: lazy-loader pilot` + Layer 2.11–2.18 (archetype-icons, tcg-showdown-link, dom-helpers, deck-analysis-shared, auth-ui-helpers, card-data-cache, meta-analysis-hub, card-capability-engine, app-anti-tech, app-tech-lab) + `wave-2: complete parseCardKey migration` |
| **Wave-2 (IA-Refactor: 5→1 Meta-Tabs)** | 8 | Steps 1–5 + 3 Fixes (`ia-v2`, TDZ-crash, localStorage drop) |
| **Wave-2 (ia-refactor B + C Cleanup)** | 2 | `ia-refactor phase B: flip default to v2` (f962bc0), `phase C: delete legacy meta hub + v1 menu items` (6ca173c) |
| **Wave-2 REVERT** | 3 | `fix: trigger lazy-loaders` (6fa52fa), `test: cover controller backToList` (88c7aa9), **`revert: restore 5-tab meta navigation`** (7d12922 = HEAD) |
| **Wave-3 (Staging Pipeline)** | 1 | `wave-3 staging: PR preview build artifacts` (17c451b) |
| **R2/DuckDB Pilot** | 8 | `feat(r2)` (7 commits): build_parquet, upload_to_r2, duckdb-pilot.js (3 commits), Build Parquet step im weekly workflow, pyarrow+boto3, R2_SETUP.md + `duckdb pilot: consolidate parallel impls` (97dba38) |
| **profile-split** | 1 | `profile-split (A): Battle Journal / Meta Call / Testing Groups → top-level` (977d366) |
| **CI-Hardening** | 3 | `ci: SHA-pin every third-party action across all 8 workflows` (427efbd), `feat(tools): verify_card_decklist_counts` (272984f), `ci(verify): workflow_dispatch` (b15e73a) |
| **Fixes (Feature-Wave)** | ~10 | deck-analysis INCL/EXCL row, city-league date picker error/Decks Used tile/463-vs-398 gap, top-256 count, current-meta Top-256 quick-overview, CSV worker:true URL, CSP blob: workers, testing-groups dead refresh call, cache-bust version bump |
| **Auto-Updates (Scraper)** | 8 | `Auto: weekly full update` commits + 1 manuelle Re-Scrape (Utrecht Regional 535) + 1 settings update |
| **PR-Merges** | 2 | Merge PR #166 + #167 (claude/enterprise-audit-optimization-picai) |

### 1.2 Kommentar zum „Revert" (HEAD-Commit `7d12922`)

Subject: **„revert: restore 5-tab meta navigation (drop reparenting + intercept)"** — explizit dokumentiert in der Commit-Message:

> Wave-2 IA-Refactor consolidated 5 meta tabs into one `#meta-view` with a segmented control + reparenting. In practice this broke data loading because the lazy-loader switch in app-core.js never fired for 'meta-view'.

**Was genau revertiert wurde:**
- `bootstrap.js`: Reparenting + Intercept entfernt; `metaViewSwitchFormat` ruft jetzt `switchTabAndUpdateMenu(legacyTabId)`; init() landet auf `current-meta`; `metaViewBackToList` ist no-op.
- `inline-init.js`: `META_ALIASES` zeigt jetzt auf Legacy-Tab-IDs.
- `index.html`: Sidebar „Meta & Tier Lists" hat wieder 3 separate Buttons (Current Meta / City League / Past Meta) statt einem einzigen „Meta Analysis"-Button. Cache-Version `202605220508`.

**Was NICHT revertiert wurde** (siehe §3.3):
- `js/modules/meta-view/{store,controller,url-router,bootstrap}.js` existieren weiter
- `css/meta-view.css` (neu) existiert weiter
- `_archive/utils/`, `_archive/audit-artifacts-*/` Löschungen aus Wave-0
- profile-split, R2-Pilot, Wave-1-ES-Module, CI-Hardening
- 16 gelöschte Unit-Tests bleiben gelöscht

---

## 2. Dateibestand-Diff

### 2.1 Gesamt-Bilanz

| Status | Anzahl | Top-Treiber |
|---|---|---|
| **Added (A)** | 53 | `js/modules/*` (22), `scripts/*` (7), Wave-3 + CI workflows (4), tooling configs (5), Wave-1-Hilfs (`i18n-de.js`, `lazy-loader.js`), 6 neue Tests, 2 neue Backend-Tools, 3 Daten-Tagesschnappschüsse, 1 CSS, 1 Doku |
| **Deleted (D)** | 131 | `_archive/` komplett (37), `_archive/audit-artifacts-2026-04-02/` komplett (24), `data/_archive/soft-delete-2026-03-31/` (12), 12 lokale `visual-*.{exit,err,json,rc}` am Root, 4 Playtester-Files + Multiplayer, 14 IIFE-Files (durch ES-Module ersetzt), 16 Unit-Tests, 8 Playwright-Specs, 5 Python-E2E, 7 Python-Unit-Tests, 6 stray 0-Byte/temp Files |
| **Modified (M)** | ~82 | Daten-CSVs (10+, gewichtigster Anteil), Code-Files (siehe §3) |

### 2.2 Hinzugefügt — Vollständige Liste (53 Files)

**ES-Module-Struktur (`js/modules/`, 21 Files):**
- Root: `app-anti-tech.js`, `app-calculator.js`, `app-tech-lab.js`, `archetype-icons.js`, `auth-ui-helpers.js`, `card-capability-engine.js`, `card-data-cache.js`, `card-key.js`, `deck-analysis-shared.js`, `dom-helpers.js`, `index.js`, `metrics.js`, `tcg-showdown-link.js`
- `js/modules/firebase/`: `init.js`
- `js/modules/stores/`: `store.js`, `user-store.js`
- `js/modules/data/`: `city-league-pilot.js`, `duckdb-loader.js`
- `js/modules/meta-view/`: `bootstrap.js`, `controller.js`, `store.js`, `url-router.js`

**Build-Pipeline (`scripts/`, 7 Files):**
- `build-bundle.js` — esbuild concat-bundle für Legacy-IIFE-Files (für minified `_dist/`?)
- `build-modules.js` — esbuild ES-Module-Bundle (für `_dist/app.modules.bundle.js`)
- `build_parquet.py` — R2: CSV → Parquet-Konvertierung
- `generate-sri.sh` — Subresource-Integrity-Hashes für CDN-Assets
- `run-unit-tests.js` — Single unit-test runner (ersetzt for-Loop im CI)
- `swap-html-to-bundle.js` — Production-HTML-Patcher
- `upload_to_r2.py` — R2: boto3-Upload

**CI-Workflows (4 neu):**
- `.github/workflows/codeql.yml` — GitHub Security Lab CodeQL (Push + PR + Mo 06:27 UTC)
- `.github/workflows/preview-build.yml` — Wave-3 Staging: PR-Artifact-Build (kein 2. Hosting nötig)
- `.github/workflows/verify-decklist-counts.yml` — Manual dispatch: CSV ↔ Limitless Cross-Check
- `.github/dependabot.yml` — Weekly npm + GH-Actions Updates

**Tooling-Configs (5 Files):**
- `.prettierrc.json`, `.prettierignore`
- `eslint.config.js`
- `tsconfig.json`
- `types/globals.d.ts`

**Neue Unit-Tests (6 Files):**
- `test-card-key.js` — `parseCardKey`/`formatCardKey` Modul-Tests
- `test-firebase-init.js` — Firebase-Lazy-Loader-Tests
- `test-meta-view-store.js` — Wave-2 store.js
- `test-meta-view-url-router.js` — Wave-2 url-router.js
- `test-metrics.js` — parsePercent/formatPercent/weightedAverage
- `test-store.js` — Generic store-Tests

**Sonstiges:**
- `css/meta-view.css` — Wave-2 segmented control + meta-view styles
- `js/i18n-de.js` — Deutsche i18n-Strings (ausgegliedert aus `i18n.js` von 1695 → 102K Zeilen)
- `js/lazy-loader.js` — Lazy-Loading-Stubs für draw-simulator, battle-journal, meta-binder, custom-binder
- `R2_SETUP.md` — Cloudflare-R2-Setup-Doku
- `backend/tools/cleanup_set_number_fragments.py` — Daten-Cleanup-Tool
- `backend/tools/verify_card_decklist_counts.py` — CSV-vs-Limitless-Cross-Check
- `data/online_share_history/2026-05-{20,21,22}.csv` — 3 neue Tagesschnappschüsse

### 2.3 Gelöscht — Gruppiert (131 Files)

**Wave-0 Cleanup (97 Files):**
| Kategorie | Anzahl | Beispiele |
|---|---|---|
| `_archive/audit-artifacts-2026-04-02/` | 24 | `audit_single_tab.js`, `fullpage-report.json`, 22 PNGs |
| `_archive/dead-assets-2026-03-31/` | 3 | `app-tech-radar.js` (toter Code), CSS, PNG |
| `_archive/utils/` | 10 | 9 Python-Fix-Skripte + README |
| `data/_archive/soft-delete-2026-03-31/` | 12 | Soft-Delete-Daten beider Wellen |
| Lokale `visual-*` am Root | 12 | `visual-{final,full,nonmeta,regression-*}.{exit,err,json,rc,stdout.json}` |
| Stray 0-Byte / temp Files | 8 | `audit_single_tab.js`, `prepare_card_data.py`, `cards-grid-test-report.json`, `mobile-ux-audit-report.json`, `current-meta.exit`, `runtime-verify-results.txt`, `terminal-check.txt`, `tmp_404_probe.py`, `tmp_past_meta_probe.py`, `backend - Verknüpfung.lnk`, `old`-Verzeichnis-Files (2 Einträge) |
| MD-Docs | 1 | `MULTIPLAYER_INTEGRATION_GUIDE.md` (Playtester-Multiplayer-Dokumentation) |
| Tests-Test-Outputs | 2 | `tests/e2e-playtester-results.txt`, `tests/e2e-playtester-smoke.js` |

**IIFE → ES-Module-Migration (14 Files):**
| Alt (`js/*.js`) | Neu (`js/modules/*.js`) |
|---|---|
| `app-anti-tech.js` (42 K) | `modules/app-anti-tech.js` (40 K) |
| `app-calculator.js` (4 K) | `modules/app-calculator.js` (5 K) |
| `app-tech-lab.js` (52 K) | `modules/app-tech-lab.js` (50 K) |
| `archetype-icons.js` (9 K) | `modules/archetype-icons.js` (9 K) |
| `auth-ui-helpers.js` (1 K) | `modules/auth-ui-helpers.js` (2 K) |
| `card-capability-engine.js` (13 K) | `modules/card-capability-engine.js` (12 K) |
| `card-data-cache.js` (4 K) | `modules/card-data-cache.js` (4 K) |
| `deck-analysis-shared.js` (2 K) | `modules/deck-analysis-shared.js` (2 K) |
| `meta-analysis-hub.js` (11 K) | **(entfernt, kein Ersatz)** — Wave-2 Phase C |
| `tcg-showdown-link.js` (9 K) | `modules/tcg-showdown-link.js` (8 K) |

**Playtester-Retirement (4 Files):**
- `js/playtester.js` (5580 LOC)
- `js/playtester-mobile.js` (702 LOC)
- `js/playtester-patch.js`
- `js/firebase-multiplayer.js` (1179 LOC)

**Test-Suite-Reduktion (36 Files):**
- JS Unit Tests (16): `test-calculateCombinedVariantStats.js`, `test-coreDataProcessing.js`, `test-dataIntegrity.js`, `test-deckBuilder.js`, `test-firebaseCollection.js`, `test-fuzzyArchetypeMatch.js`, `test-getPreferredVersionForCard.js`, `test-getRarityPriority.js`, `test-isAceSpec-removeCard.js`, `test-other-international-prints.js`, `test-parseCSV.js`, `test-parsePastMetaDateMs.js`, `test-rarity-switcher-ready.js`, `test-sanitize-proxy.js`, `test-utilsExtra.js`, `test-helpers.js`
- Playwright E2E (8): `cards-image-keyboard`, `cards-keyboard-accessibility`, `city-league-hero-combined-navigation`, `city-league-language-switch`, `proxy-import-errors`, `proxy-queue-reset`, `rarity-switcher`, `visual-full-page-coverage`
- Python Unit (7): `test_card_database`, `test_card_scraper_shared`, `test_csv_and_settings`, `test_prepare_card_data`, `test_scraper_additional`, `test_scraper_extraction`, `test_scraper_functions`
- Python E2E (5): `e2e_battle_journal`, `e2e_city_league_meta`, `e2e_current_meta_global`, `e2e_deck_analysis_japan`, `e2e_past_meta`

### 2.4 Modifiziert — Code-Files mit signifikantem Diff

| File | +/− Lines | Was passiert |
|---|---|---|
| `js/i18n.js` | +77 / −1618 | DE-Strings ausgegliedert nach `js/i18n-de.js` (1535 neue Zeilen) |
| `js/app-city-league.js` | +116 / −48 | Date-Picker-Error-Handling + Decks-Used-Tile + Orphan-Archetype-Dedup |
| `js/firebase-globals.js` | +135 / −6 | Audit-Logging + neue Subscriber-Pattern |
| `js/firebase-collection.js` | +89 / −141 | Refactor (net −52) |
| `js/app-core.js` | +79 / −105 | Playtester-Stubs ersetzen Lazy-Load (net −26) |
| `js/app-meta-call.js` | +70 / −28 | Mode-Toggle + Standard/Counter (audit-logging) |
| `js/app-cards-db.js` | +59 / −10 | Klein |
| `js/app-current-meta-analysis.js` | (kleiner Diff) | Top-256 Quick-Overview |
| `js/inline-init.js` | +13 / −20 (siehe Detail) | profile-split: Tabs in metaTabs-Set; hub-overview-badge-Logik entfernt; @ts-check |
| `package-lock.json` | +2476 / −38 | Neue Dev-Deps |
| `index.html` | +151 / −96 | siehe §3.6 |
| `service-worker.js` | (klein) | CACHE_NAME bump |

---

## 3. Architektur-Wandel im Detail

### 3.1 Wave-1: ES-Module-Bundle (`_dist/app.modules.bundle.js`)

**Neue Build-Toolchain:** esbuild + @ts-check + eslint + prettier.

**Bundle-Entry: `js/modules/index.js`** (125 Zeilen) — exportiert:
| Symbol | Quelle | Wave |
|---|---|---|
| `updateCalculations` | `app-calculator.js` | L2.4 |
| `parseCardKey`, `formatCardKey`, `getCardName`, `hasPrintInfo`, `printId` | `card-key.js` | L2.9 |
| `createStore`, `userStore` | `stores/{store,user-store}.js` | L2.10 |
| `parsePercent`, `parsePercentOrNaN`, `formatPercent`, `weightedAverageWinRate` | `metrics.js` | Wave-2 |
| `getFirebase` | `firebase/init.js` | Wave-1 Firebase modular |
| `ArchetypeIcons` | `archetype-icons.js` | L2.11 |
| `openInShowdownFromBuilder`, `copyDeckAndOpenShowdown`, `openShowdownExternal` | `tcg-showdown-link.js` | L2.12 |
| `dom` | `dom-helpers.js` | L2.13 |
| `updateDeckStatsByIds`, `showDeckSections`, `hideDeckSections`, `resetDeckOverviewCounts`, `renderNoDeckSelectedState` | `deck-analysis-shared.js` | L2.14 |
| `showAuthModal`, `closeAuthModal` | `auth-ui-helpers.js` | L2.14 |
| `cardDataCache` | `card-data-cache.js` | L2.15 |
| `CardCapabilityEngine` | `card-capability-engine.js` | L2.16 |
| `openAntiTechModal`, `closeAntiTechModal`, `advanceAntiTechModal`, `backToAntiTechStep1`, `confirmAntiTechBuild` | `app-anti-tech.js` | L2.17 |
| `TechLab` | `app-tech-lab.js` | L2.18 |
| `metaViewStore`, `isValidFormat` | `meta-view/store.js` | Wave-2 |
| `switchFormat`, `selectDeck`, `backToList`, `setSearchFilter` | `meta-view/controller.js` | Wave-2 |
| `getDuckDB`, `ddQuery`, `getDataBaseUrl`, `isDuckDbPilotEnabled` | `data/duckdb-loader.js` | R2-Pilot |
| **(side-effect imports)** | `meta-view/bootstrap.js`, `data/city-league-pilot.js` | |

**Bundle-Strategie:** esbuild produziert `_dist/app.modules.bundle.js` mit `format:'iife'` + `globalName:'AppModules'`. Footer kopiert jeden Export auf `window`. → Legacy-IIFE-Files (immer noch der Großteil) können Module-Funktionen weiterhin als globale Identifier aufrufen.

**Verfügbarkeitsrisiko:** Das Bundle ist **gitignored** (`_dist/` in `.gitignore:14+86`). Lokal serviert (z.B. `python -m http.server`) → **404 für `_dist/app.modules.bundle.js`** → 14+ Wave-1-Symbole undefined. In CI baut `deploy-pages.yml` das Bundle vor dem Deploy.

### 3.2 Wave-1.5: `lazy-loader.js` (213 Zeilen)

Neue Lazy-Loading-Mechanik für **drei tab-leaf-Features**, die aus dem Main-Bundle ausgegliedert wurden:

| Feature | Source | Trigger-Funktionen | Bundle-Save |
|---|---|---|---|
| Draw Simulator | `js/draw-simulator.js` | `openDrawSimulator` | ~10 KB |
| Battle Journal | `js/battle-journal.js` | `openBattleJournalSheet`, `flushBattleJournalOutbox`, `renderJournalHistory`, `getBattleJournalWinRates` | ~120 KB |
| Meta Binder + Custom Binder | `js/meta-binder.js` + `js/custom-binder.js` | 12 + 14 Lazy-Stubs (geladen zusammen wegen `_mbShared`) | ~140 KB |

**Pattern:** `installLazyStub(fnName, src, label)` registriert eine Stub-Funktion auf `window`. Beim 1. Aufruf: `loadScript()` lädt das File, schreibt echte Funktion auf `window`, ersetzt Stub, proxied Args. **Idempotent** via Promise-Cache, **fehlertolerant** (Retry beim nächsten Aufruf), **User-Feedback** via `window.showToast`.

**Konsequenz:** Diese 4 Files sind weiterhin in `js/` (nicht in `js/modules/`), werden aber NICHT mehr eager via `<script>`-Tag in `index.html` geladen.

### 3.3 Wave-2 IA-Refactor: **Hybrid-Zustand** (NICHT vollständig revertiert)

Was die Wave-2-Refactor-Serie aufbaute (Steps 1–5 + Phase B/C):
- `js/modules/meta-view/store.js` — Reactive store für aktive Format-Auswahl
- `js/modules/meta-view/controller.js` — switchFormat/selectDeck/backToList/setSearchFilter
- `js/modules/meta-view/url-router.js` — `#meta?format=current` deep-link-Parsing
- `js/modules/meta-view/bootstrap.js` — initial: reparented 5 Legacy-Tab-Divs in `#meta-view`-Container; interceptete switchTab() für Legacy-IDs
- `css/meta-view.css` — segmented-control + meta-view styles
- `index.html`: `<div id="meta-view">`-Container + segmented control
- Phase C: Löschte `meta-analysis-hub` Modul + Tile-Grid-Default-Landing

**Der HEAD-Revert (`7d12922`) entfernte ausschließlich:**
- `reparentLegacyTabsIntoMetaView` + `reparentAnalysisTabsIntoMetaView` aus bootstrap.js
- `interceptSwitchTab` aus bootstrap.js
- `metaViewSwitchFormat` ruft jetzt `switchTabAndUpdateMenu(legacyTabId)` statt Store-Mutation
- `metaViewBackToList` = no-op
- Sidebar zurück zu 3 separaten Buttons (Current/CityLeague/Past) statt 1 „Meta Analysis"-Button
- index.html-Tab-Bar-Buttons: Aufgesplittet

**Was NICHT revertiert ist:**
- `meta-view/{store,controller,url-router}.js` (~700 LOC) bleiben + werden weiter importiert
- `bootstrap.js` bleibt + ist von `modules/index.js:117` weiterhin importiert
- `css/meta-view.css` bleibt + wird wahrscheinlich weiter geladen
- URL-Routing via `#meta?format=...` funktioniert weiter (siehe bootstrap.js:48-60)
- `meta-analysis-hub.js` bleibt **gelöscht** — Tile-Grid-Hub kommt nicht zurück

**HEAD ist also Hybrid-Zustand:** 5 separate Tab-Content-Divs (wie Golden) + `meta-view`-Container als „segmented control nav-aid". Pragmatischer Mittelweg.

### 3.4 Playtester-Retirement

Golden hatte ein **internes Playtester-System** (4 Files, 7.4K LOC, 337 KB) mit lazy-load via `app-core.js:347–446` (`ensurePlaytesterScriptsLoaded()`).

HEAD hat das ersetzt durch **Redirect-Stubs zu tcg-showdown.com**:

```js
// js/app-core.js:386-406 (HEAD)
function _redirectToShowdown() {
    if (typeof window.openShowdownExternal === 'function') {
        window.openShowdownExternal();
    } else if (typeof showNotification === 'function') {
        showNotification('Playtester moved to tcg-showdown.com', 'info', 2400);
    }
}
['openPlaytester', 'openPlaytesterSetup', 'startPlaytesterWithMirror',
 'startPlaytesterWithOpponent', 'startStandalonePlaytester',
 'parseSandboxDeckToExactPrints', 'openMultiplayerFromSandbox']
.forEach(functionName => { /* set redirect-stub */ });
```

`openShowdownExternal()` wird aus dem Bundle exportiert (`modules/tcg-showdown-link.js`).

**Sandbox-Tab-HTML (`<div id="sandbox">` ab Zeile 1912)** bleibt erhalten, aber `Start`-Button (`ptStartGame()` in Golden) — **ist nicht in der Stub-Liste!** Mögliche Latenz-Bug: Klick auf „Start" feuert `ReferenceError: ptStartGame is not defined` an Browser-Konsole. (Verifizieren in Phase 3 mit echter Page-Interaction.)

**Was komplett gelöscht ist:**
- `js/playtester.js` (5580 LOC) — Core-Game-Engine
- `js/playtester-mobile.js` (702 LOC) — Touch-UI
- `js/playtester-patch.js` — Monkey-Patches
- `js/firebase-multiplayer.js` (1179 LOC) — Online-2P-Modus
- `MULTIPLAYER_INTEGRATION_GUIDE.md`
- `tests/e2e/playtester-hand-buttons.e2e.spec.js` **GEBLIEBEN** (gegen Stubs? wahrscheinlich Wrap-Test)
- `tests/e2e-playtester-smoke.js` gelöscht
- `tests/e2e-playtester-results.txt` gelöscht

### 3.5 profile-split (Commit `977d366`)

**Zielsetzung (aus Commit-Message):** Battle Journal / Meta Call / Testing Groups aus den Profile-Subtabs zu Top-Level-Tabs befördern.

**Beobachtbar in `inline-init.js`:** Die `metaTabs`-Set in `syncMenuClustersForTab()` enthält jetzt `meta-call`, `battle-journal`, `testing-groups` (vorher nur in `profile-*`-Subtabs).

**Beobachtbar in `index.html`:** Wahrscheinlich neue Top-Level-Tabs für diese 3 Features. Konkrete Tab-IDs in Phase 3 verifizieren.

### 3.6 `index.html`-Wandel im Überblick (+151 / −96 Zeilen)

| Bereich | Wandel |
|---|---|
| Inline-Script Zeile 32 (Version-Check) | Wahrscheinlich Cache-Version bump nur (+/− 1 Zeile) |
| Inline-Script Zeile 871 (vorher 819) | Verschoben durch +52 vorhergehende Zeilen |
| CSS-Loading | +1: `meta-view.css` |
| Script-Loading | **Firebase compat 9.22.0 → 11.10.0** (3 Zeilen) <br> **+1: `_dist/app.modules.bundle.js`** (Wave-1 Bundle) <br> **+1: `js/lazy-loader.js`** <br> **−6: `js/{auth-ui-helpers,tcg-showdown-link,card-data-cache,deck-analysis-shared,app-tech-lab,app-anti-tech,archetype-icons,app-calculator,card-capability-engine}.js`** (in Bundle) <br> **−1: `js/meta-analysis-hub.js`** (Wave-2 Phase C) <br> **−1: `js/battle-journal.js`** (lazy) <br> **−1: `js/meta-binder.js`** (lazy) <br> **−1: `js/custom-binder.js`** (lazy) <br> **−1: `js/draw-simulator.js`** (lazy) <br> **−4: `js/{playtester,playtester-mobile,playtester-patch,firebase-multiplayer}.js`** (retired) — diese waren in Golden zwar nicht im static-load-Pfad, sind aber aus `app-core.js` lazy-loader entfernt |
| Tab-Struktur | profile-split: 3 neue Top-Level-Tabs (TBD verifizieren), `meta-analysis-hub` gelöscht (Wave-2 Phase C). Sidebar wieder mit 3 Meta-Buttons statt 1 (Revert) |
| Cache-Version | `202605191800` (Golden) → `202605220508` (HEAD) |

---

## 4. CI-Pipeline-Wandel

### 4.1 Workflow-Inventar

| Workflow | Golden | HEAD | Δ |
|---|---|---|---|
| `deploy-pages.yml` | 227 LOC | ~488 LOC | **+261** (siehe §4.2) |
| `visual-nonmeta.yml` | 47 LOC | ~53 LOC | +6 (SHA-pinning) |
| `visual-fullpage.yml` | 38 LOC | ~44 LOC | +6 (SHA-pinning) |
| `weekly-full-update.yml` | 284 LOC | ~351 LOC | +67 (siehe §4.3) |
| `generate-tooltips.yml` | 38 LOC | ~42 LOC | +4 (SHA-pinning) |
| **`codeql.yml`** | — | 54 LOC | **NEU** |
| **`preview-build.yml`** | — | 107 LOC | **NEU** (Wave-3) |
| **`verify-decklist-counts.yml`** | — | 113 LOC | **NEU** |
| **`.github/dependabot.yml`** | — | 55 LOC | **NEU** |

### 4.2 `deploy-pages.yml` — `+261 / −45` (signifikanter Rewrite)

In Phase 3 müssen wir den Diff im Detail lesen. Erwartete Erweiterungen:
- npm-Install (vorher: `npm install --no-save papaparse`, jetzt: `npm ci` für `eslint`+`prettier`+`esbuild`+`c8`+`typescript`)
- `npm run lint` Step (eslint blockt Deploy?)
- `npm run typecheck` Step (tsc --noEmit)
- `npm run build:bundle` (esbuild → `_dist/app.modules.bundle.js`)
- `npm run build:legacy` und/oder `swap-html-to-bundle.js` (Production-HTML-Patcher)
- `npm test` (statt for-Loop) → `node scripts/run-unit-tests.js`
- Coverage-Report via c8 (vermutlich nicht blocking)
- `generate-sri.sh` für CDN-SRI-Hashes
- SHA-pinning aller Third-Party-Actions

### 4.3 `weekly-full-update.yml` — Two-Phase Split (Prague-Bug-Prevention, +67 Zeilen)

Aus dem Diff-Kommentar:

> The previous shape ran every scraper under `set +e` and treated failures as warnings — by design, so a single Cloudflare 429 in limitless_online didn't lose six other successful scrapes. But `core/prepare_card_data.py` is NOT a scraper — it's the finalizer that builds the monolith CSVs the frontend ships. If it fails silently in the same loop, the commit-and-push that follows uploads stale data; that's exactly how the 2026-05-12 Prague row-loss happened.

**Neue Struktur:**
- **Phase A (best-effort, `set +e`):** alle echten Scraper
- **Phase B (fail-hard, `set -e`):** `core/prepare_card_data.py` + `tools/build_threat_intel.py`
- Workflow-Abort vor Commit/Push, wenn Phase B fehlschlägt

**Außerdem im weekly:** R2-Pilot-Step (`feat(r2): add Build Parquet + Upload to R2 step`, Commit `ef0161a`):
- Phase B-2: `scripts/build_parquet.py` (CSV → Parquet)
- Phase B-3: `scripts/upload_to_r2.py` (boto3-Upload zu Cloudflare-R2)

### 4.4 SHA-Pinning aller Third-Party-Actions

Commit `427efbd`: `ci: SHA-pin every third-party action across all 8 workflows`

Beispiel:
```diff
-        uses: actions/checkout@v6
+        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd  # v6
-        uses: actions/setup-python@v6
+        uses: actions/setup-python@a309ff8b426b58ec0e2a45f0f869d46889d02405  # v6
```

**Begründung (CodeQL-Workflow-Kommentar):** Supply-Chain-Hardening — verhindert, dass ein kompromittiertes Action-Tag schädlichen Code injiziert.

---

## 5. Test-Coverage-Bilanz

### 5.1 Quantitative Bilanz

| Test-Kategorie | Golden Files | HEAD Files | Golden Passes | HEAD Passes |
|---|---|---|---|---|
| JS Unit (`tests/unit/`) | 34 | 23 | **236 pass / 0 fail** | **298 pass / 0 fail** |
| Playwright E2E (`tests/e2e/*.spec.js`) | 12 | 4 | (nicht lokal ausgeführt) | — |
| Python Unit (`tests/python/`) | 12 | 5 | (nicht lokal ausgeführt) | — |
| Python E2E (`tests/e2e_*.py`) | 11 | 6 | — | — |
| Verify (`tests/verify_*.py`) | 4 | 4 | — | — |

**Tests-Pass-Count steigt** (236 → 298, **+62**) trotz weniger Test-Files — d.h. die neuen Tests (für ES-Module-Surface) testen denser. Aber:

### 5.2 Qualitative Bewertung — gelöschte Tests vs. Code-Vorhandenheit

| Gelöschter Test | Getestete Funktion | Code an HEAD vorhanden? | Coverage-Verlust |
|---|---|---|---|
| `test-parseCSV.js` | `parseCSV()` aus app-utils.js | ✓ vorhanden | ✗ Verlust |
| `test-deckBuilder.js` | app-deck-builder Internals | ✓ vorhanden (447 KB!) | ✗ Verlust |
| `test-firebaseCollection.js` | firebase-collection Funktionen | ✓ vorhanden (245 KB) | ✗ Verlust |
| `test-isAceSpec-removeCard.js` | Ace-Spec-Logik | ✓ vorhanden | ✗ Verlust |
| `test-rarity-switcher-ready.js` | Rarity-Switcher | ✓ vorhanden | ✗ Verlust |
| `test-sanitize-proxy.js` | Proxy-Print-Sanitisation | ✓ vorhanden | ✗ Verlust |
| `test-calculateCombinedVariantStats.js` | Variant-Stats | ✓ vorhanden | ✗ Verlust |
| `test-coreDataProcessing.js` | Datenverarbeitung | ✓ vorhanden | ✗ Verlust |
| `test-dataIntegrity.js` | Datenintegrität-Checks | ✓ vorhanden | ✗ Verlust |
| `test-fuzzyArchetypeMatch.js` | Fuzzy-Matching | ✓ vorhanden | ✗ Verlust |
| `test-getPreferredVersionForCard.js` | Version-Selection | ✓ vorhanden | ✗ Verlust |
| `test-getRarityPriority.js` | Rarity-Priorität | ✓ vorhanden | ✗ Verlust |
| `test-other-international-prints.js` | International-Prints | ✓ vorhanden | ✗ Verlust |
| `test-parsePastMetaDateMs.js` | Date-Parsing | ✓ vorhanden | ✗ Verlust |
| `test-utilsExtra.js` | Utils | ✓ vorhanden | ✗ Verlust |
| `test-helpers.js` | Allg. Helpers | ✓ vorhanden | ✗ Verlust |

**Befund:** Alle 16 gelöschten JS-Unit-Tests testen Code, der auf HEAD weiterhin existiert. Das ist **definitiver Coverage-Verlust für Legacy-Code**, nicht „der getestete Code wurde mitgelöscht".

| Gelöschte Playwright-Spec | Getestetes Feature | Feature auf HEAD vorhanden? |
|---|---|---|
| `cards-image-keyboard.e2e.spec.js` | Card-Image-Modal Keyboard | ✓ vorhanden |
| `cards-keyboard-accessibility.e2e.spec.js` | A11y Card-DB | ✓ vorhanden |
| `city-league-hero-combined-navigation.e2e.spec.js` | Hero-Grid-Navigation | ✓ vorhanden |
| `city-league-language-switch.e2e.spec.js` | DE↔EN-Switch | ✓ vorhanden (sogar i18n-de.js separat!) |
| `proxy-import-errors.e2e.spec.js` | Proxy-Tab-Errorhandling | ✓ vorhanden |
| `proxy-queue-reset.e2e.spec.js` | Proxy-Queue-Reset | ✓ vorhanden |
| `rarity-switcher.e2e.spec.js` | Rarity-Switcher-Modal | ✓ vorhanden |
| `visual-full-page-coverage.spec.js` | Visual-Snapshots aller Tabs | ✓ vorhanden |

**Befund:** Auch hier — 8/8 Playwright-Specs testen Features, die auf HEAD existieren. Definitiver Coverage-Verlust.

### 5.3 Hinzugefügte Tests (6 JS-Unit-Tests)

| Neu | Was getestet wird | Modul vorhanden? |
|---|---|---|
| `test-card-key.js` | `parseCardKey`/`formatCardKey` (L2.9) | ✓ `modules/card-key.js` |
| `test-firebase-init.js` | Firebase-Lazy-Loader | ✓ `modules/firebase/init.js` |
| `test-meta-view-store.js` | Wave-2 store | ✓ `modules/meta-view/store.js` |
| `test-meta-view-url-router.js` | Wave-2 URL-Router | ✓ `modules/meta-view/url-router.js` |
| `test-metrics.js` | parsePercent etc. (Wave-2) | ✓ `modules/metrics.js` |
| `test-store.js` | Generic store | ✓ `modules/stores/store.js` |

Diese decken die neue ES-Module-Surface ab. Sinnvolle Ergänzungen — aber sie ersetzen NICHT die gelöschten Legacy-Tests.

### 5.4 Empfehlung für Phase 3

**Die 30 gelöschten Tests (16 JS-Unit + 8 Playwright + 7 Python-Unit) sollten erwogen werden zur Wiederherstellung**, weil sie alle existierende Funktionalität testen. Phase 3 muss eine Entscheidung treffen:
- (a) Zurückholen aus Golden — eventuell Anpassung an HEAD-Code nötig
- (b) Bewusst aufgeben (mit Begründung dokumentiert)
- (c) Zurückholen ABER nur die noch reparablen
- (d) Durch neue, dichter testende Module-Tests ersetzen

---

## 6. Dependency-Drift

### 6.1 Frontend-Runtime-Deps

| Dep | Golden | HEAD | Wechsel |
|---|---|---|---|
| Firebase compat (app/auth/firestore) | 9.22.0 | **11.10.0** | **Major** |
| Chart.js | 4.4.0 | 4.4.0 | — |
| PapaParse | 5.4.1 | 5.4.1 | — |
| localforage | 1.10.0 | 1.10.0 | — |
| mobile-drag-drop | 3.0.0-rc.0 | 3.0.0-rc.0 | — |
| Google Sign-In | gsi/client | gsi/client | — |

**Firebase 9.22.0 → 11.10.0** ist 2 Major-Versionen Sprung. Risikofaktor: API-Breaking-Changes in v10 (modular SDK push), v11 (compat-Layer-Verhalten). In Phase 3 prüfen, ob `firebase-compat`-API-Surface stabil geblieben ist.

### 6.2 Dev-Dependencies

| `package.json` | Golden | HEAD |
|---|---|---|
| `@playwright/test` | ^1.59.1 | ^1.59.1 |
| `papaparse` | ^5.5.3 | ^5.5.3 |
| `c8` (coverage) | — | ^10.1.3 |
| `esbuild` | — | ^0.28.0 |
| `eslint` | — | ^9.18.0 |
| `globals` | — | ^15.14.0 |
| `prettier` | — | ^3.4.2 |
| `typescript` | — | ^6.0.3 |

**`package-lock.json`: +2476 / −38 Zeilen** entsprechend.

### 6.3 npm-Scripts

| Script | Golden | HEAD |
|---|---|---|
| `test` | — | `node scripts/run-unit-tests.js` |
| `test:coverage` | — | `c8 ... node scripts/run-unit-tests.js` |
| `test:coverage:modules` | — | `c8 --check-coverage --lines 85 --functions 80 --branches 70 ...` |
| `build:bundle` | — | `node scripts/build-bundle.js && node scripts/build-modules.js` |
| `build:legacy` | — | `node scripts/build-bundle.js` |
| `build:modules` | — | `node scripts/build-modules.js` |
| `test:visual:*` (3) | ✓ | ✓ |
| `lint` | — | `eslint 'js/**/*.js' 'tests/unit/**/*.js'` |
| `lint:fix` | — | `--fix` |
| `typecheck` | — | `tsc --noEmit` |
| `format` | — | `prettier --check` |
| `format:fix` | — | `prettier --write` |

**Coverage-Threshold:** Module-Bundle hat **lines 85 / functions 80 / branches 70**. Legacy-Code (in `js/`) hat keinen Coverage-Threshold (kein `--check-coverage` ohne Modul-Filter).

---

## 7. Tote / Hybride / Verdächtige Bereiche auf HEAD

| Bereich | Befund | Härte |
|---|---|---|
| **`frontend/`** (56 KB) | **STILL THERE** trotz Wave-0-Cleanup. 6 unused HTML-Snippets + 1 unused CSS. Wurde nicht entfernt. | Hart — Dead Code |
| **`meta-view/`-Modules + `meta-view.css`** | Wave-2-Reste nach Revert. Funktionieren als „Nav-Aid", aber Konzept-Inkonsistenz mit 5-Tab-Layout. | Mittel — Hybrid |
| **`_dist/`** | Gitignored Build-Artifact. Wird in CI gebaut, fehlt lokal/manual deploy. Risiko: lokales Testing ohne `npm run build:bundle` zeigt nicht-funktionalen Stand. | Niedrig — Dokumentiert |
| **Sandbox-Tab HTML mit `ptStartGame()`-Reference** | Playtester-Stubs in app-core.js decken 7 Function-Names ab, aber NICHT `ptStartGame`, `ptUndo`, `ptLog`, `ptShowManual`, `ptToggleLog`. Latente ReferenceError-Bombe. | Mittel — Latent-Bug |
| **`tests/e2e-playtester-results.txt`** GELÖSCHT, aber **`tests/e2e/playtester-hand-buttons.e2e.spec.js`** BLEIBT | Inkonsistente Bereinigung. Spec testet Playtester-Hand-Buttons — testet sie gegen Stubs? | Niedrig |
| **`PROJECT_STRUCTURE.md` / `README.md`** | Beide **immer noch veraltet** (siehe Phase 1) | Niedrig — Dokumentation |
| **`dashboard-theme.css` Duplikat** | `css/dashboard-theme.css` (82 B) + `frontend/css/dashboard-theme.css` — beide bleiben | Niedrig |
| **Playwright-Snapshot-Path-Quirk** | `{testFilename}` Verzeichnis ist GELÖSCHT auf HEAD wahrscheinlich | TBD prüfen |
| **`playwright.config.js` ≈ `playwright.visual-nonmeta.config.js`** | Beide noch da, beide noch identisch | Niedrig |
| **`old Data for Claude/`-Verzeichnis** | War in Golden 6 KB, vermutlich auf HEAD weg (siehe `D` in Filenames mit `old`) | TBD verifizieren |
| **16 deleted Unit-Tests / 8 deleted Playwright / 7+5 deleted Python-Tests** | Coverage-Verlust für existierenden Code | **Hart — Coverage-Regression** |

---

## 8. Wellen-Klassifikation: Bewahren vs. Hinterfragen für Phase 3

| Welle | Verdienst | Empfehlung |
|---|---|---|
| **Wave-0 Cleanup** | Löscht `_archive/*`, lokale `visual-*` files, stray 0-Byte files, `MULTIPLAYER_INTEGRATION_GUIDE.md`. Massive Reduktion von Repo-Klutter. | ✓ **KEEP** — produktiv |
| **Wave-1 ES-Module-Migration** | Etabliert `js/modules/` Struktur, esbuild-Bundle, ESLint, Prettier, TypeScript-@ts-check, c8-Coverage, single-test-runner. Echte Investition in Code-Qualität. | ✓ **KEEP** — strategisch wertvoll |
| **Wave-1 Firebase modular pilot** | `getFirebase()` lazy-loader für modular SDK. Vorbereitung für Firebase v11. | ✓ **KEEP** |
| **Wave-1.5 lazy-loader.js** | Lazy-Load von 4 schweren tab-leaf-Features (battle-journal, meta-binder, custom-binder, draw-simulator). Spart ~280 KB Initial-Bundle. | ✓ **KEEP** — Performance-Win |
| **Wave-2 IA-Refactor (Steps 1–5 + B + C)** | Konsolidierte 5 Meta-Tabs in `#meta-view`. **War gebrochen wegen Lazy-Loader-Mismatch.** | ✗ **ÜBERPRÜFEN** — Reste konsequent entfernen oder Konzept neu denken |
| **Wave-2 Revert (HEAD)** | Restored 5-Tab-Layout, ließ aber `meta-view/`-Module + CSS + Import in `modules/index.js` zurück | ⚠ **AUFRÄUMEN** — entweder Wave-2 zu Ende führen oder komplett zurücknehmen |
| **Wave-3 PR-Preview-Build** | Artifact-basierte Preview ohne 2. Hosting-Setup. Pragmatisch. | ✓ **KEEP** |
| **R2/DuckDB-Pilot** | Cloudflare-R2-Upload + Parquet-Konvertierung + DuckDB-WASM-Pilot. Vorausschauend für CSV-Wachstum. | ✓ **KEEP** (Pilot-Stadium, nicht-blocking) |
| **profile-split** | Battle Journal / Meta Call / Testing Groups → Top-Level-Tabs. UX-Verbesserung. | ✓ **KEEP** (vorbehaltlich Phase-3 Verifikation der Tab-IDs) |
| **CI-Hardening (SHA-Pinning, CodeQL, Dependabot)** | Supply-Chain-Security. Best-Practice. | ✓ **KEEP** |
| **Playtester-Retirement** | Internes Playtester → TCG-Showdown.com-Redirect. **Latent-Bug bei `ptStartGame`-Klick** (siehe §7). | ⚠ **VERIFIZIEREN** — entweder vollständige UI-Entfernung oder zusätzliche Stubs |
| **Test-Suite-Reduktion** | 30 Tests gelöscht, von denen alle nachweislich noch-existierenden Code testeten | **✗ ZURÜCKHOLEN** (selektiv) |
| **i18n.js-Split** | `i18n.js` `1695 → 102K Zeilen` + neue `i18n-de.js` `1535 Zeilen`. Lader sollten beide laden. | ✓ **KEEP** (verifizieren in Phase 3, dass beide geladen werden) |
| **Firebase compat 9.22.0 → 11.10.0** | Major-Sprung. Riskant ohne Smoke-Test. | ⚠ **SMOKE-TEST** — Auth-Flow + Firestore-Query verifizieren |

---

## 9. Konkrete Fragen für Phase 3

1. **Wo sind die 3 neuen Top-Level-Tabs aus profile-split** (`battle-journal`, `meta-call`, `testing-groups`)? Tab-IDs + Reihenfolge in Sidebar + Header verifizieren.
2. **Sandbox-Start-Button:** Was passiert beim Klick auf „Start" im Playtester-Modal? `ptStartGame()` ist nicht in den Stubs in `app-core.js`. ReferenceError oder Stub-Fallback?
3. **`_dist/` Build:** Reproduziert `npm run build:bundle` lokal das `_dist/app.modules.bundle.js`? Wie viele LOC im Bundle? Welche Globals werden via Footer auf `window` gesetzt?
4. **`meta-view/`-Module nach Revert:** Wird die `bootstrap.js:init()` noch aufgerufen? Wenn ja, was passiert in der Praxis bei segmented-control-Klick — fließt das URL-Routing noch?
5. **Welche Tests sollten zurückgeholt werden?** Liste nach Priorität:
   a. `test-deckBuilder.js` (Deck-Builder 447 KB ohne Tests = riesiges Risiko)
   b. `test-firebaseCollection.js` (245 KB Code)
   c. `test-parseCSV.js`, `test-dataIntegrity.js`, `test-coreDataProcessing.js` (Datenverarbeitung)
   d. `test-isAceSpec-removeCard.js`, `test-getPreferredVersionForCard.js` (Deck-Bau-Regeln)
   e. Visual-Coverage-Specs (visual-full-page-coverage.spec.js)
6. **Frontend/-Cleanup nachholen:** Wirklich Dead Code? `index.html:416-417` referenziert `<div id="header-container">`/`<div id="sidebar-container">` — wird das von irgendwo aus angesteuert?
7. **Wave-2-Hybrid-Resolution:** Bewahren als „Nav-Aid" oder komplett zurücknehmen?
8. **Firebase v11 Smoke-Test:** Anmelden, Decks speichern, Battle-Journal-Eintrag schreiben — funktioniert alles?
9. **Doku-Update:** `README.md` + `PROJECT_STRUCTURE.md` an HEAD-Realität anpassen.
10. **Visual-Snapshot-Baselines:** Sind die Baselines noch in `tests/e2e/__snapshots__/` aktuell? Was wurde bei `visual-full-page-coverage.spec.js`-Löschung mit den Snapshot-PNGs gemacht?

---

## 10. Wellen-Zeitleiste (kompakter Überblick)

```
19. Mai 05:49 UTC ─┬─ 481c9bd  GOLDEN: PR #163 metacall-mode-toggle
                  │
20. Mai (Wave-1)  ├─ Wave-1 Firebase modular pilot
                  ├─ wave-1 layer 2.11 archetype-icons → ES module
                  ├─ wave-1 layer 2.12 tcg-showdown-link
                  ├─ wave-1 layer 2.13 dom-helpers
                  ├─ wave-1 layer 2.14 deck-analysis-shared + auth-ui-helpers
                  ├─ wave-1 layer 2.15 card-data-cache
                  ├─ wave-1 layer 2.16 meta-analysis-hub + card-capability-engine
                  ├─ wave-1 layer 2.17 app-anti-tech
                  ├─ wave-1 layer 2.18 app-tech-lab
                  ├─ wave-2 step 1 meta-view store + controller + flag
                  ├─ wave-2 step 2 HTML scaffold + segmented control
                  ├─ wave-2 step 3 reparent legacy tabs
                  ├─ wave-2 step 4 detail drilldown
                  ├─ wave-2 step 5 URL routing
                  ├─ fix(critical) TDZ crash in firebase-config
                  ├─ fix(csp) blob: workers + CSV worker URL
                  ├─ a37f0bd / a2c072e fix top-256 breakdown
                  ├─ 4a69167 force re-scrape Utrecht
                  ├─ 8dd27c4 weekly auto-update
                  └─ e86407c ia-v2 hub coexistence
                  │
21. Mai           ├─ d00f1f3 merge main into branch
                  ├─ cb88735 fix(city-league) 463-vs-398 gap
                  ├─ 272984f feat verify_card_decklist_counts
                  ├─ b15e73a ci(verify) workflow_dispatch
                  ├─ 513e4a1 fix(city-league) date filter Decks Used
                  ├─ 6a56513 chore: bump cache-bust 202605210130
                  ├─ a8f9dd7 fix(city-league) date picker error
                  ├─ 0401f4a merge main
                  ├─ c69ffb3 merge PR #166
                  ├─ e04966d scraper_settings.json update
                  ├─ 23b54e4 weekly auto-update
                  ├─ cd107d8 feat(deck-analysis) INCL/EXCL row
                  ├─ 134c289 merge main into branch
                  ├─ 0880ac0 merge PR #167
                  ├─ R2-Pilot 8 commits (build_parquet, upload_to_r2, duckdb-pilot, R2_SETUP)
                  ├─ 977d366 profile-split (A) BJ/MC/TG → top-level
                  ├─ 6ca173c ia-refactor phase B (default to v2)
                  ├─ f962bc0 ia-refactor phase C (delete legacy meta hub)
                  └─ 427efbd ci: SHA-pin every third-party action
                  │
22. Mai           ├─ 8a84027 weekly auto-update
                  ├─ 97dba38 duckdb pilot consolidate
                  ├─ 17c451b wave-3 staging PR preview build
                  ├─ 7bcf3aa weekly auto-update
                  ├─ 6fa52fa fix: trigger lazy-loaders for meta-view
                  ├─ 88c7aa9 test: controller backToList/setSearchFilter
                  └─ 7d12922 revert: restore 5-tab meta navigation ← HEAD
```

---

**Phase-2-Status:** ABGESCHLOSSEN. Audit-Doc liegt unkommittet im Working Tree.
**Nächster Schritt:** Auf User-OK für Phase 3 warten (Klassifikation + Recovery-Strategie für die identifizierten Kategorien).
