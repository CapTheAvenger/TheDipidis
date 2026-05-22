# Pokemon TCG Analysis — Projektstruktur

Stand: Mai 2026 (post wave-0/1 + IA-Refactor revert).

Dieses Dokument beschreibt die aktuelle Repository-Struktur. Bei
größeren Umstrukturierungen bitte direkt mit aktualisieren.

## 1. Root-Dateien

### Frontend-Eintrittspunkt

- `index.html` — Single-Page-App (4900 LOC, alle Tabs)
- `service-worker.js` — PWA-Caching (network-first für HTML/JS/CSS,
  stale-while-revalidate für `/data/`)
- `manifest.json`, `version.json`, `_config.yml`, `.nojekyll`, `CNAME`

### Build- und Tooling-Konfiguration

- `package.json`, `package-lock.json` — npm-Scripts + devDeps
- `eslint.config.js`, `.prettierrc.json`, `.prettierignore`
- `tsconfig.json`, `types/globals.d.ts` — TypeScript checkJs für die
  ganze JS-Codebase
- `playwright.config.js`, `playwright.visual-nonmeta.config.js`
- `requirements.txt` — Python-Backend-Deps

### Doku

- `README.md`, `PROJECT_STRUCTURE.md`
- `R2_SETUP.md` — Cloudflare-R2-Pilot-Setup
- `FIREBASE_SETUP_GUIDE.md`, `FIRESTORE_RULES.md`
- `PRICE_SCRAPER_README.md`, `ALL_CARDS_SCRAPER_README.md`,
  `JAPANESE_CARDS_SCRAPER_README.md`
- `GITHUB_ACTIONS_SCHEDULE.md`
- `docs/audit/*.md` — Audit-Phasen 1–4 (golden-vs-HEAD-Vergleich)

### Bequemlichkeits-Skripte (Windows)

- `START_DASHBOARD.bat`, `PUSH_TO_GITHUB.bat`
- `bump-version.sh`, `bump-version.ps1`
- `pokemon_sets_mapping.csv`, `firestore.rules`
- `prepare_city_league_chunks.py` — Hilfsskript für per-Format-Chunks

## 2. Verzeichnisse

### `js/` — Frontend (Legacy-Layer)

26 IIFE-Scripts, eager über `<script defer>` in `index.html` geladen.
Bündeln cross-file globals (`window.foo = …`); Wave-1 Layer 2 migriert
diese schrittweise nach `js/modules/`.

Größte Module:

- `app-deck-builder.js` (447 K) — Deck-Builder
- `app-meta-call.js` (295 K) — Tournament-Predictor
- `firebase-collection.js` (245 K) — Collection/Wishlist/Decks
- `app-cards-db.js` (223 K) — Card-Browser
- `app-city-league.js` (213 K) — City-League-Daten
- `app-current-meta-analysis.js` (203 K) — Current Meta Analysis
- `i18n.js` (102 K) — Englisch
- `i18n-de.js` (100 K) — Deutsch
- `app-core.js` (149 K) — Tab-Switching + Boot

Lazy-geladen via `js/lazy-loader.js` (Wave-1 L2.5):

- `js/battle-journal.js` (120 K)
- `js/meta-binder.js` (110 K) + `js/custom-binder.js` (54 K)
- `js/draw-simulator.js` (10 K)

### `js/modules/` — Frontend (ES-Module-Layer)

Wave-1 Layer 2: echte ES-Module mit `import`/`export`. Werden von
`scripts/build-modules.js` zu `_dist/app.modules.bundle.js` gebündelt
(IIFE-Format mit `globalName:'AppModules'`, Footer kopiert Exports
nach `window` für Legacy-Aufrufer).

- Root: `index.js` (Bundle-Entry), `app-anti-tech.js`,
  `app-calculator.js`, `app-tech-lab.js`, `archetype-icons.js`,
  `auth-ui-helpers.js`, `card-capability-engine.js`,
  `card-data-cache.js`, `card-key.js`, `deck-analysis-shared.js`,
  `dom-helpers.js`, `metrics.js`, `tcg-showdown-link.js`
- `firebase/init.js` — Firebase Modular SDK Lazy-Loader
- `stores/{store,user-store}.js` — Reactive Store-Primitiv
- `data/{duckdb-loader,city-league-pilot}.js` — DuckDB-WASM-Pilot
  (gated by `?duckdb=1`)

### `css/` — Styles (27 Files, ~830 KB)

Größte: `styles.css` (273 K), `ui-components.css` (127 K),
`meta-call.css` (72 K), `mobile-responsive.css` (67 K),
`city-league.css` (56 K), `current-meta-matchups.css` (32 K),
`pokeball-menu.css` (31 K).

22 von 27 Files werden async geladen via `media="print"
onload="this.media='all'"`-Trick.

### `backend/` — Python-Backend

- `core/` — Shared Lib + Settings (archetype_matcher, card_scraper_shared,
  limitless_dated, prepare_card_data, threat_classifier, update_sets)
- `scrapers/` — 19 Scraper für Card-DBs, Tournament-Daten, Cardmarket-Preise
- `services/price_proxy_server.py` — Live-Preis-Proxy (lokal)
- `tools/` — Daten-Cleanup + Verify-Scripts (build_threat_intel,
  cleanup_current_meta_csv, cleanup_set_number_fragments,
  verify_card_decklist_counts)
- `data/tech_radar_data.json`
- `settings.py`, `start_scraper_dashboard.py`

### `scripts/` — Build- und Pipeline-Skripte

- `build-bundle.js` — Legacy-Concat-Bundle (artifact-only, nicht
  shipped)
- `build-modules.js` — ES-Module-Bundle (shipped als
  `_dist/app.modules.bundle.js`)
- `run-unit-tests.js` — Single-runner für alle JS-Unit-Tests
- `swap-html-to-bundle.js` — Production-HTML-Patcher
- `generate-sri.sh` — Subresource-Integrity-Hashes für CDN-Assets
- `build_parquet.py` — R2-Pilot: CSV → Parquet (pyarrow)
- `upload_to_r2.py` — R2-Pilot: boto3-Upload zu Cloudflare R2

### `data/` — Frontend-Daten (~324 MB)

Persistente CSV/JSON-Outputs der Scraper. Wird im weekly-full-update-
Workflow regeneriert. Top-Files:

- `city_league_analysis.csv` (41 MB), `..._M3.csv` (31 MB)
- `all_cards_merged.json` (13 MB), `all_cards_database.json` (11 MB)
- `online_tournament_dated_cards.csv` (7 MB)
- `cards_chunk_{standard,extended,legacy}.json` (per-Format-Chunks)
- `current_meta_card_data.csv` (1.5 MB)
- `online_share_history/` — Tagesschnappschüsse

### `config/` — Scraper-Settings (11 JSON-Dateien)

Master: `scraper_settings.json` (6 KB) + pro Scraper.

### `images/` — Statische Assets

Pokeball-Icons, Loading-Screens, Escape-Rope-Buttons.

### `tests/` — Test-Suite

- `tests/unit/test-*.js` — 36 Node-Test-Files (`node --test`):
  Datenverarbeitung, Deck-Builder, Filter, Card-Logik, Meta-Call,
  Firebase-Collection, Utility-Funktionen
- `tests/e2e/*.spec.js` — 12 Playwright-Specs:
  cards-database-filters, city-league-{exact,hero,language},
  playtester-hand-buttons (gegen Stubs), proxy-{import,queue},
  rarity-switcher, visual-{regression,full-page-coverage},
  cards-keyboard-accessibility, cards-image-keyboard
- `tests/e2e/__snapshots__/` — 14 Visual-Snapshot-Baselines
- `tests/python/` — 12 Python-Unit-Tests (pytest); CI ignoriert
  `test_price_proxy_and_price_scraper.py` (braucht lokalen Server)
- `tests/e2e_*.py` — Python-E2E-Skripte (Battle Journal,
  Deck-Analysis, Matchup, Mobile-Audit, i18n)
- `tests/verify_*.py` — Verifikations-Skripte

### `.github/workflows/` — CI-Pipeline (9 Workflows)

- `deploy-pages.yml` — Test → Lint → Typecheck → Coverage-Gate →
  Build → Minify → Cache-Bust → GH-Pages-Deploy
- `visual-nonmeta.yml` — Visual-Regression auf PR + Push
- `visual-fullpage.yml` — Täglich Visual-Coverage
- `weekly-full-update.yml` — Di 06:00 UTC: 15 Scraper + R2-Upload
- `generate-tooltips.yml` — So 06:00 UTC: OpenAI-LLM-Tooltips
- `codeql.yml` — Mo 06:27 UTC: Security-Scanning
- `preview-build.yml` — Wave-3: PR-Preview-Artifacts
- `verify-decklist-counts.yml` — Manual: CSV↔Limitless-Cross-Check
- `.github/dependabot.yml` — Weekly npm + GH-Actions Updates

Alle Third-Party-Actions sind SHA-pinned (Supply-Chain-Hardening).

### `utils/` — Aktive Maintenance-Skripte

Kleine Python-Helper für Datenpflege. Siehe `utils/README.md`.

### `_dist/` — Build-Output (gitignored)

- `app.bundle.js` — Legacy-Concat-Bundle (artifact-only)
- `app.modules.bundle.js` — ES-Module-Bundle (shipped)
- `*.map` — Source-Maps

Wird vom `npm run build:bundle` Skript erzeugt. Im CI durch
`deploy-pages.yml` automatisch gebaut.

### `node_modules/` — npm-Deps (gitignored)

Frontend-Runtime-Deps laden weiterhin von CDN (Firebase compat 11.10.0,
Chart.js 4.4.0, PapaParse 5.4.1, localforage 1.10.0, mobile-drag-drop).

## 3. Empfohlener Workflow

### Lokale Entwicklung

```bash
# Deps installieren
npm ci
pip install -r requirements.txt

# Bundle bauen
npm run build:bundle

# Lokalen HTTP-Server starten
python -m http.server 8000
# Dann: http://localhost:8000/index.html
```

### Vor jedem Commit

```bash
npm run lint        # ESLint (warn-only)
npm run typecheck   # tsc --noEmit
npm test            # Node unit tests
```

### Backend (Scraper)

```bash
# Interaktives Dashboard
python backend/start_scraper_dashboard.py
# Oder direkt einen Scraper
PYTHONPATH=backend/core python backend/scrapers/city_league_analysis_scraper.py
```

## 4. Architektur-Notizen

### Tab-Layout (12 Top-Level-Tabs)

`city-league`, `city-league-analysis`, **`current-meta`** (default
active), `current-analysis`, `past-meta`, `cards`, `proxy`, `sandbox`,
`tutorial`, `calculator`, `profile`.

Profile hat 11 Sub-Tabs (`profile-collection`, `profile-decks`,
`profile-wishlist`, `profile-tradelist`, `profile-metabinder`,
`profile-custombinder`, `profile-journal`, `profile-deckcompare`,
`profile-metacall`, `profile-testinggroups`, `profile-settings`).

### Playtester

Der in-app Playtester (`js/playtester.js`, `playtester-mobile.js`,
`playtester-patch.js`, `firebase-multiplayer.js`) wurde retired.
Sandbox-Buttons leiten via Stubs in `app-core.js` zu
[tcg-showdown.com](https://tcg-showdown.com/) weiter.

### Boot-Reihenfolge

1. Inline `<script>` (Z. 32): `APP_VERSION` + Version-Drift-Check
2. `pokemon-loading-screen.js` + `csv-cache-interceptor.js`
3. `error-tracking.js`, `inline-init.js`
4. Firebase compat (app + auth + firestore) 11.10.0
5. `_dist/app.modules.bundle.js` (ES-Module-Bundle, Wave-1)
6. App-Utils + i18n + Firebase-{credentials,config,globals,auth,collection}
7. Chart.js + PapaParse + localforage (CDN)
8. ~15 Legacy-IIFE-Scripts (`app-core`, `app-deck-builder`, …)
9. `lazy-loader.js` + `combo-worker.js`
10. Inline `<script>` (am Ende): SW-Registration + Filter-Debounce

### Daten-Pipeline

```
Scrapers (write to backend/core/data/)
  ↓ prepare_card_data.py SYNC_PATTERNS
data/ (frontend-ready CSV/JSON)
  ↓ deploy-pages.yml
GitHub Pages → thedipidis.app
```

Optional: R2-Pilot wandelt CSVs nach Parquet und uploaded zu Cloudflare
R2 (siehe `R2_SETUP.md`). Frontend kann via DuckDB-WASM-Loader
(`js/modules/data/duckdb-loader.js`) Parquet-Queries gegen R2
ausführen; gated by `?duckdb=1`.
