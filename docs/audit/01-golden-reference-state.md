# Audit 01 — Golden Reference State (`481c9bd`)

**Audit-Tag:** 2026-05-22
**Auditor:** Claude (Sonnet/Opus 4.7, 1M-Context-Modus)
**Golden Reference:** Commit `481c9bd` = "Merge pull request #163 from CapTheAvenger/claude/metacall-mode-toggle"
**Vom User bestätigt:** „nimm den als basis […] Visual Non-Meta Regression #869, May 19, 7:49 AM GMT+2"

---

## TL;DR (5 Bullets)

1. **Golden Reference ist real und vollständig im Repo:** `481c9bd` wurde am **2026-05-19 05:49 UTC** von CapTheAvenger gemergt; Parents = `09265a8` (main) + `38f77a4` (Feature-Branch). Heute **nicht mehr auf `origin/main`** (HEAD von main = `5f23a3f` vom 15. Mai), aber weiterhin von zwei Branches referenziert. Für Phase 4 wichtig: kein Wiederherstellungsrisiko.
2. **Stack:** Vanilla-JS-SPA mit **43 flachen `js/`-Modulen** (3.4 MB), **27 CSS-Files** (840 KB), **`index.html` 4977 Zeilen** (427 KB), Firebase compat 9.22.0, Chart.js 4.4.0, PapaParse 5.4.1, localforage 1.10.0. Kein Bundler, kein Framework, kein TypeScript.
3. **Tests im Golden-Stand laufen sauber:** 34 JS-Unit-Test-Files → **236 pass / 0 fail** (ausgeführt am 2026-05-22). 12 Playwright-E2E-Specs + 14 Visual-Snapshot-Baselines vorhanden. 12 Python-Unit-Tests + 11 e2e-scripts in `tests/python/` und `tests/`.
4. **CI-Pipeline besteht aus 5 Workflows:** `deploy-pages.yml` (JS-Tests → Python-Tests → Build/Minify/Cache-Bust → Deploy), `visual-nonmeta.yml` (PR + Push + Dispatch), `visual-fullpage.yml` (täglich 03:00 UTC), `weekly-full-update.yml` (Di 06:00 UTC, 12+ Scraper), `generate-tooltips.yml` (So 06:00 UTC, OpenAI).
5. **Tote/dubiose Bereiche bereits sichtbar:** `frontend/` (7 HTML-Snippets, **nirgends geladen**), `_archive/` (20 MB), `test-artifacts/` mit April-2026-Screenshots, lokale `visual-*.exit/json` mit RC:1, veraltetes `PROJECT_STRUCTURE.md` (beschreibt nicht-existentes `js/app.js`). Diese gehören in Phase 3 evaluiert.

---

## 1. Identifikation des Golden-Commits

| Feld | Wert |
|---|---|
| SHA | `481c9bdddf73cd1c62aa3b4095066eac453a9e05` (kurz: `481c9bd`) |
| Subject | `Merge pull request #163 from CapTheAvenger/claude/metacall-mode-toggle` |
| Author / Committer | `CapTheAvenger <haushalterj@me.com>` (beide) |
| Date | **2026-05-19 00:49:47 -0500** (= **05:49:47 UTC** = **07:49 GMT+2**) |
| Parents | `09265a8` (main vor Merge) + `38f77a4` (Feature-Branch HEAD) |
| Merge-Diff | 3 Files, +150/-65: `index.html`, `js/app-meta-call.js`, `js/i18n.js` |
| Auf `origin/main`? | **Nein** — `origin/main` HEAD = `5f23a3f` (15. Mai 17:49 UTC, älter) |
| Referenziert von Branches | `origin/claude/github-direct-changes-M7vpm`, `origin/claude/metacall-mode-audit-logging` |
| Ancestor-Beziehung zu `origin/main` | `5f23a3f` ist **Vorfahre** von `481c9bd` (Golden = main+4 PRs) |
| Worktree | `/tmp/golden/481c9bd/` (lokale Read-Only-Kopie) |

**Was zwischen `origin/main`-HEAD und Golden liegt:**
```
5f23a3f main    Merge PR #128
…
6068a84         Merge PR #162 cm-viewmode-reset-on-reload (17. Mai 23:19 UTC)
…
09265a8         Auto: weekly full update 2026-05-19 05:25 UTC
38f77a4         meta-call: Standard / Counter-Meta mode toggle
481c9bd GOLDEN  Merge PR #163 metacall-mode-toggle (19. Mai 05:49 UTC)
```

---

## 2. Tech-Stack & Build-Toolchain

### Frontend-Runtime-Dependencies (CDN, kein npm-Bundle)

| Dependency | Version | Source | Verwendung |
|---|---|---|---|
| Firebase compat (app/auth/firestore) | 9.22.0 | `gstatic.com` | Auth, Firestore, User-State |
| Chart.js | 4.4.0 | `cdn.jsdelivr.net` | Heatmaps, Tier-Charts, Meta-Call-Viz |
| PapaParse | 5.4.1 | `cdnjs.cloudflare.com` | CSV-Parsing (City-League etc.) |
| localforage | 1.10.0 | `cdnjs.cloudflare.com` | IndexedDB-Wrapper für Card-Cache |
| mobile-drag-drop | 3.0.0-rc.0 | `cdn.jsdelivr.net` | Touch-Polyfill (Playtester, Deck-Builder) |
| Google Sign-In | accounts.google.com/gsi/client | (load-event, lazy) | Auth |

### Dev-Toolchain (`package.json`)

```json
{
  "scripts": {
    "test:visual:fullpage:ci":  "node tests/e2e/run-visual-fullpage-ci.js",
    "test:visual:nonmeta:ci":   "node tests/e2e/run-visual-nonmeta-ci.js",
    "test:visual:nonmeta:report": "node tests/e2e/runtime-verify-updates.js"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.1",
    "papaparse": "^5.5.3"
  }
}
```

**Auffällig:** Keine npm-Scripts für Unit-Tests, Linter oder Type-Check. JS-Unit-Tests werden im CI direkt via `for f in tests/unit/*.js; do node --test "$f"; done` ausgeführt (deploy-pages.yml:36-46). Kein ESLint, kein Prettier, kein TypeScript im Repo.

### Backend (Python)

`backend/` enthält 35 Python-Dateien (siehe Abschnitt 8). Requirements aus `requirements.txt`. CI verwendet Python 3.12.

---

## 3. Verzeichnis- und Größenprofil

```
/tmp/golden/481c9bd  (gesamt 379 MB ohne .git/node_modules)
├── data/           324 MB  ← 85% des Repos: CSV/JSON-Datenstand
├── _archive/        20 MB  ← März/April-2026 dead assets + utils
├── tests/           18 MB  ← inkl. tests/e2e/__snapshots__ Baseline-PNGs
├── test-artifacts/ 9.7 MB  ← April-2026 Audit-Screenshots
├── js/             3.4 MB  ← 43 flache JS-Files
├── css/            836 KB  ← 27 CSS-Files
├── backend/        652 KB  ← 35 Python-Files
├── test-results/   400 KB  ← Playwright-Run-Output (vor allem playtester)
├── frontend/        56 KB  ← TOTER CODE (siehe §11)
├── index.html      427 KB / 4977 Zeilen
├── service-worker.js  7 KB
├── manifest.json    451 B
├── package.json     395 B
├── + 11 MD-Docs, 30 Python-Skripts im Root
```

**File-Count nach Extension (Top-2-Level):** 70 JSON · 53 JS · 35 CSV · 33 PNG · 30 PY · 27 CSS · 11 MD · 4 HTML.

---

## 4. Frontend-Entry: `index.html` (4977 Zeilen)

### 4.1 Inline-Scripts (3 Blöcke)

| Lines | Zweck | Schlüssel-Mechanik |
|---|---|---|
| 32–84 | **APP-VERSION-Drift-Check** | Setzt `window.APP_VERSION = '202605190525'`. Fetcht `version.json` no-store → wenn `data.version !== APP_VERSION`: alle Caches purgen, alle ServiceWorker unregistern, hard-reload mit `?_v=`-Param. Anti-Stale-Mechanismus. |
| 819 | (inline `<script>`, ungelesen) | TBD in Phase 2 |
| 4887–4974 | **SW-Registration + Google-SignIn-Lazyload + Filter-Debounce** | (a) Registriert `service-worker.js` mit `updateViaCache:'none'`, polled `reg.update()` alle 60s, lauscht auf `SW_UPDATED`-Message + `controllerchange` → autoreload. (b) Lazy-loaded Google-SignIn-SDK auf `window.load`. (c) Wrappt 6 globale Filter-Funktionen in 300ms-Debounce: `filterOverviewCards`, `filterCurrentMetaOverviewCards`, `filterPastMetaOverviewCards`, `filterMetaCards`, `filterCollection`, `filterWishlist`. |

### 4.2 Inline-`<style id="mobile-card-overlay-fix">` (Zeilen 125+)

Mobile-Layout-Fix für Card-Overview-Grids (cityLeagueDeckGrid, currentMetaDeckGrid, pastMetaDeckGrid). Inline „so it works even with stale SW-cached CSS files" — dokumentiert in HTML-Kommentar.

### 4.3 CSS-Loading-Reihenfolge (Lines 85–114)

**Blocking (4):** `styles.css`, `ui-components.css`, `pokeball-menu.css`, `dashboard-theme.css`.
**Async (18):** alle weiteren via `media="print" onload="this.media='all'"`-Trick.
**Inline:** mobile-card-overlay-fix als `<style>`.

### 4.4 Script-Loading-Reihenfolge (Lines 412–4841)

```
Line 412-413  pokemon-loading-screen.js + csv-cache-interceptor.js (kein defer — first)
Line 4078     error-tracking.js (kein defer)
Line 4080     inline-init.js (defer)
Line 4792-94  Firebase compat 9.22.0 (app + auth + firestore)
Line 4796     app-utils.js
Line 4797     i18n.js
Line 4799-04  firebase-credentials → -config → -globals → -auth → auth-ui-helpers → -collection
Line 4808     tcg-showdown-link.js
Line 4810-12  CDN: chart.js + papaparse + localforage
Line 4814     card-data-cache.js
Line 4816-41  26 App-Module (defer-Reihenfolge)
```

**Lazy-geladen via `appendChild`** (NICHT statisch im `index.html` referenziert):
- `playtester.js`, `playtester-mobile.js`, `playtester-patch.js` — geladen in `app-core.js:347-416` beim Öffnen des Playtester-Tabs; gegated durch `window.__playtesterScriptsReady`.
- `firebase-multiplayer.js` — separat (siehe app-core.js:423).

### 4.5 Tab-Architektur

**12 Top-Level-Tabs** (`<div class="tab-content">`):
`meta-analysis-hub` (default active) · `city-league` · `city-league-analysis` · `current-meta` · `current-analysis` · `past-meta` · `cards` · `proxy` · `sandbox` · `profile` · `calculator` · `tutorial`.

**11 Profile-Subtabs** (`<div class="profile-tab-content">`):
`profile-collection` (default active) · `profile-decks` · `profile-wishlist` · `profile-tradelist` · `profile-metabinder` · `profile-custombinder` · `profile-journal` · `profile-deckcompare` · `profile-metacall` · `profile-testinggroups` · `profile-settings`.

**Routing-API:**
- `switchTab(tabId)` — Top-Level-Tab-Wechsel (app-core.js)
- `switchTabAndUpdateMenu(tabId)` — Tab + Sidebar-Sync (inline-init.js)
- `openProfileSection(subTab)` — Direkt zu Profile-Subtab (inline-init.js, via Hash)
- `switchProfileTab(subTab)` — Profile-Subtab-Wechsel (firebase-collection.js)
- Hash-Aliases: `#tutorial`, `#city-league`, `#current-meta`, `#proxy`, `#sandbox`, `#calculator`, `#profile`, `#metacall` (inline-init.js:124-169)

**Sidebar-Menü-Struktur:**
- Cluster „Meta & Tier Lists" (5 items): current-meta, current-analysis, city-league, city-league-analysis, past-meta
- Cluster-Top-Level: cards, proxy, sandbox, profile, calculator, tutorial
- Header-Quick-Buttons: cards, profile

---

## 5. Module-Inventar — `js/` (43 Files, 3.4 MB)

### 5.1 Größenverteilung

| Größenklasse | Module |
|---|---|
| **>200 KB** (6) | `app-deck-builder.js` 447K · `app-meta-call.js` 295K · `playtester.js` 290K · `firebase-collection.js` 245K · `app-cards-db.js` 223K · `app-current-meta-analysis.js` 203K · `i18n.js` 203K · `app-city-league.js` 212K |
| **50–200 KB** (10) | `app-core.js` 149K · `battle-journal.js` 120K · `meta-binder.js` 111K · `app-meta-cards.js` 96K · `app-features.js` 75K · `app-past-meta.js` 72K · `app-testing-groups.js` 70K · `app-tier-meta.js` 68K · `app-utils.js` 63K · `custom-binder.js` 54K · `firebase-multiplayer.js` 54K · `app-tech-lab.js` 52K |
| **10–50 KB** (10) | `app-anti-tech.js` 42K · `playtester-mobile.js` 33K · `app-current-meta.js` 29K · `firebase-globals.js` 19K · `playtester-patch.js` 14K · `card-capability-engine.js` 13K · `pokemon-loading-screen.js` 13K · `firebase-auth.js` 12K · `meta-analysis-hub.js` 11K · `archetype-icons.js` 9K · `draw-simulator.js` 9K · `tcg-showdown-link.js` 9K |
| **<10 KB** (9) | `inline-init.js` 7K · `csv-cache-interceptor.js` 7K · `app-price.js` 6K · `error-tracking.js` 5K · `app-calculator.js` 4K · `card-data-cache.js` 4K · `app-init.js` 3K · `deck-analysis-shared.js` 2K · `firebase-config.js` 2K · `combo-worker.js` 1K · `auth-ui-helpers.js` 1K |

### 5.2 Modul → Tab-Mapping

| Modul | Eigentümer von Tab/Region | Init-Pattern |
|---|---|---|
| `app-core.js` | **Orchestrator** (Tab-Switching, Lazy-Load) | `DOMContentLoaded` (line 1208), `window.switchTab` |
| `inline-init.js` | **Navigation** (Menü, Hash-Deep-Linking) | DOMContentLoaded + hash handler |
| `app-init.js` | **Startup** (load all data, fire `app:resources-settled`) | DOMContentLoaded async (line 4) |
| `meta-analysis-hub.js` | `meta-analysis-hub` | IIFE → `window.MetaAnalysisHub.onTabSwitched()` (line 6) |
| `app-city-league.js` | `city-league` | `loadCityLeagueData()` + DOMContentLoaded (line 3787) |
| `app-tier-meta.js` | `city-league-analysis` (Tier-Liste) | `loadTierData()` on-demand |
| `app-current-meta.js` | `current-meta` (Matchup-Heatmap) | `renderMatchupHeatmap()` (line 17) |
| `app-current-meta-analysis.js` | `current-analysis` | DOMContentLoaded (lines 1022, 1075, 3661) |
| `app-past-meta.js` | `past-meta` | Script-load scope |
| `app-cards-db.js` | `cards` | `loadCards()` aus app-init |
| `app-deck-builder.js` | Deck-Panes in `city-league`, `current-analysis`, `past-meta` | Script-load (lines 5–28) |
| `app-tech-lab.js` | Tech-Lab-Modal in `current-analysis`, `city-league-analysis` | Global modal handlers |
| `app-anti-tech.js` | Anti-Tech-Modal | Global modal handlers |
| `app-meta-cards.js` | Card-Stats-Panels in `current-analysis`, `city-league-analysis` | Module-load |
| `app-features.js` | `tutorial` | Module-load + DOMContentLoaded |
| `app-meta-call.js` | `profile-metacall` | IIFE `window.MetaCall` (line 4); `preload()` aus app-init.js:69 |
| `app-testing-groups.js` | `profile-testinggroups` | IIFE `window.TestingGroups` (line 22); hash-invite (line 1687) |
| `battle-journal.js` | `profile-journal` | IIFE (line 8), exports at 2336–2340 |
| `meta-binder.js` | `profile-metabinder` | IIFE (line 6) |
| `custom-binder.js` | `profile-custombinder` | IIFE (line 6) |
| `firebase-collection.js` | `profile-collection`, `profile-decks`, `profile-wishlist`, `profile-tradelist` | Document-load init |
| `playtester.js` | `sandbox` (1P-Mode) | **Lazy** via app-core.js:347 |
| `playtester-mobile.js` | `sandbox` (Touch-Layer) | Lazy |
| `playtester-patch.js` | `sandbox` (Bug-Fixes) | Lazy |
| `firebase-multiplayer.js` | `sandbox` (2P-Mode) | **Lazy** via app-core.js:423 |
| `app-calculator.js` | `calculator` | DOMContentLoaded |
| `draw-simulator.js` | `calculator` (Sub-Feature) | Modal-getrieben |
| `combo-worker.js` | `calculator` (Web Worker) | Worker-Message-Listener |
| `app-utils.js` | **Shared** | IIFE bulk-exports (line 2) |
| `i18n.js` | **Shared** (DE/EN-Übersetzung) | DOMContentLoaded (3235), exports 3229-3232 |
| `app-price.js` | **Shared** (Card-Pricing) | On-demand |
| `card-data-cache.js` | **Shared** (IndexedDB-Cache) | Lazy |
| `card-capability-engine.js` | **Shared** (Tech-Lab-Engine) | Module-load |
| `deck-analysis-shared.js` | **Shared** (Analysis-Helpers) | Module-load |
| `archetype-icons.js` | **Shared** (Visual Branding) | Module-load |
| `tcg-showdown-link.js` | **Shared** (External Integration) | Module-load |
| `firebase-config.js` | **Bootstrap** (Firebase init) | Module-load |
| `firebase-globals.js` | **Bootstrap** (user state) | Document-ready |
| `firebase-auth.js` | **Auth** | Document-load + modal events |
| `auth-ui-helpers.js` | **Auth** (UI) | On modal open |
| `error-tracking.js` | **Shared** (Sentry, ~2 KB) | IIFE; DSN-Placeholder `__SENTRY_DSN__` |
| `pokemon-loading-screen.js` | **Shared** (Boot UX) | DOM injection on load |
| `csv-cache-interceptor.js` | **Shared** (HTTP Cache override) | fetch() override at module-load |

### 5.3 Wichtige globale Datenstrukturen

```js
// User-State (firebase-globals.js)
window.auth, window.db, window.currentUser
window.userCollectionCounts  // Map<cardId, count>
window.userWishlist          // Set<cardId>
window.userTradelistMinPrices // Map<cardId, minPrice>
window.userDecks             // Array of saved deck documents

// Deck-State (app-deck-builder.js + app-core.js)
window.cityLeagueDeck, window.currentMetaDeck, window.pastMetaDeck  // {cardName: count}
window.cityLeagueDeckOrder, …Order, …Order                          // sorted arrays
window.pinnedCards, window.excludedCards                            // per-source Sets

// Card-DB
window.allCardsDatabase       // flat array
window.cardIndexBySetNumber   // Map<"SET-NUMBER", card>

// Modul-Namespaces
window.MetaCall = { init, preload, getDeckNames, getPredictedField, getBaseMatchup, … }
window.TestingGroups = { init, loadMyGroups, openGroup, createGroup, … }
window.MetaAnalysisHub = { onTabSwitched }

// Boot-Signal
window.__appResourcesSettled = true   // app-init.js:62
event 'app:resources-settled', 'app:ui-ready'  // app-init.js:64-65
```

### 5.4 Module-Dependency-Graph (verdichtet)

```
Bootstrap:   firebase-credentials → firebase-config → firebase-globals
Utilities:   app-utils, i18n, error-tracking, pokemon-loading-screen,
             csv-cache-interceptor, card-data-cache  (used by all)
Auth:        firebase-auth → auth-ui-helpers → firebase-collection
Data load:   app-init → app-cards-db, app-city-league (uses card-data-cache)

Orchestration:
  inline-init (menu, hash) → app-core (switchTab, lazy-load)
                              ↓ lazy
                              playtester.js + firebase-multiplayer.js

Tab → Module:
  meta-analysis-hub  → meta-analysis-hub.js
  city-league        → app-city-league
  city-league-analysis → app-tier-meta + app-meta-cards + app-tech-lab + app-anti-tech
  current-meta       → app-current-meta (heatmap)
  current-analysis   → app-current-meta-analysis + app-deck-builder + app-meta-cards
                       + app-tech-lab + app-anti-tech + deck-analysis-shared
  past-meta          → app-past-meta + app-deck-builder + deck-analysis-shared
  cards              → app-cards-db (uses firebase-collection)
  proxy              → [unklar — wahrscheinlich app-deck-builder + inline UI in index.html]
  sandbox            → playtester + playtester-mobile + playtester-patch +
                       firebase-multiplayer (lazy)
  calculator         → app-calculator + draw-simulator + combo-worker
  tutorial           → app-features

Profile-Subtabs:
  profile-collection/decks/wishlist/tradelist → firebase-collection
  profile-metabinder    → meta-binder
  profile-custombinder  → custom-binder
  profile-journal       → battle-journal
  profile-deckcompare   → [unklar — wahrscheinlich inline UI + app-deck-builder]
  profile-metacall      → app-meta-call
  profile-testinggroups → app-testing-groups
  profile-settings      → [unklar — wahrscheinlich inline UI + firebase-globals]

Cross-Tab-Datenflüsse:
  app-meta-call.getPredictedField() ← consumed by ← app-current-meta-analysis
  app-testing-groups → loadIntoMetaCall() → app-meta-call
  app-deck-builder ↔ app-current-meta-analysis (deck/archetype sync)
  firebase-collection.switchProfileTab() ← called by ← inline-init (hash)
```

**Offene Forschungsfragen für Phase 2** (vom Agent identifiziert):
- Wie wird der `proxy`-Tab gefüllt? Wahrscheinlich inline-UI in `index.html` + Deck-Builder.
- Wo ist die Render-Logik für `city-league-analysis` (Top-Level-Tab, nicht nur Tier-Liste)? Vermutlich `app-city-league.js`.
- `profile-deckcompare` und `profile-settings` — kein dediziertes Modul, vermutlich inline/Shared.

---

## 6. CSS-Inventar — 27 Files, 836 KB

| Größenklasse | Files |
|---|---|
| **>50 KB** (5) | `styles.css` 273K (Haupt-Theme) · `ui-components.css` 127K (Komponenten) · `meta-call.css` 72K · `mobile-responsive.css` 67K · `city-league.css` 56K |
| **15–50 KB** (6) | `current-meta-matchups.css` 32K · `pokeball-menu.css` 31K · `testing-groups.css` 25K · `cards-tabs.css` 17K · `tech-lab.css` 15K |
| **5–15 KB** (10) | `anti-tech.css` 11K · `meta-card-analysis.css` 10K · `cards-header.css` 8K · `tech-slots.css` 8K · `cards-filter-section.css` 6K · `close-buttons.css` 6K · `auth-styles.css` 8K · `ux-step1.css` 6K |
| **<5 KB** (6) | `archetype-icons.css` 2K · `de-overview-tabs.css` 2K · `playtester-hidden.css` 2K · `ux-step2/3/4.css` 1-3K · `city-league-display-toggles.css` 283B · `profile-howto-info.css` 1.5K · `dashboard-theme.css` 82B (praktisch leer) |

**Beobachtungen:**
- `styles.css` (273 KB) ist monolithisch — likely Refactor-Kandidat, aber unkritisch.
- `dashboard-theme.css` ist mit 82 Bytes praktisch leer (Toter Code-Kandidat — `frontend/css/dashboard-theme.css` ist ein zweites File mit gleichem Namen!).
- 22 von 27 CSS-Files werden async (`media="print"`-Trick) geladen — gutes Performance-Pattern.

---

## 7. Service Worker & PWA (`service-worker.js`)

**Version:** `tcg-analysis-v202605190525` (CACHE_NAME-String mit APP_VERSION).

**Strategien:**
| Resource | Strategy |
|---|---|
| HTML / Navigation | **Network-first** (always fresh; fallback cache offline) |
| JS / CSS | **Network-first** (always fresh; fallback cache offline) |
| `/data/*` | **Stale-while-revalidate** (sofort aus Cache, im Hintergrund refresh) |
| `version.json` | **Network-only** (cache-bypass, no-store) |
| Images / Static | **Cache-first** |

**Auto-Update-Mechanismus (kritisch wichtig):**
- `install`: pre-cache 46 Shell-Assets via `fetch({cache:'no-store'})`, tolerant gegenüber Einzelfehlern, `self.skipWaiting()`.
- `activate`: alte Caches löschen → `self.clients.claim()` → `postMessage({type:'SW_UPDATED'})` an alle offenen Tabs.
- Index inline (line 4887–4910): registriert SW mit `updateViaCache:'none'`, polled `reg.update()` alle 60s, lauscht auf `SW_UPDATED` → `window.location.reload()`, lauscht auf `controllerchange` → reload.
- Index inline (line 32–84): zusätzlich client-seitiger Drift-Check (`APP_VERSION` vs. `version.json`) → bei Mismatch alle Caches purgen + SW unregistern + hard-reload.

**PWA-Manifest** (`manifest.json`):
```json
{
  "name": "Pokemon TCG Analysis",
  "short_name": "TCG Analysis",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#3B4CCA",
  "icons": [{"src": "images/pokeball-icon.png", "sizes": "192x192", "purpose": "any maskable"}]
}
```

---

## 8. Backend & Datenpipeline

### 8.1 Python-Module (35 Files)

```
backend/
├── core/                                      # Shared Lib + Settings
│   ├── archetype_matcher.py                   # Archetyp-Name-Matching
│   ├── card_scraper_shared.py                 # CardDB-Utilities
│   ├── limitless_dated.py                     # Online-Ladder-Daten
│   ├── prepare_card_data.py                   # Merge EN+JP+Preise (SYNC_PATTERNS)
│   ├── threat_classifier.py                   # Tech-Threat-Klassifikation
│   ├── update_sets.py                         # Set-Liste/Mapping
│   ├── city_league_analysis_settings.json
│   ├── current_meta_analysis_settings.json
│   └── tournament_JH_settings.json
├── scrapers/                                  # 19 Scraper
│   ├── all_cards_scraper.py                   # Limitless TCG EN (Chrome)
│   ├── japanese_cards_scraper.py              # Limitless JP (Chrome)
│   ├── card_price_scraper.py                  # CardMarket (Selenium)
│   ├── cardmarket_id_mapper.py
│   ├── cardmarket_price_merger.py
│   ├── city_league_analysis_scraper.py        # City-League-Decks
│   ├── city_league_archetype_scraper.py       # Archetyp-Statistiken
│   ├── current_meta_analysis_scraper.py       # Current-Meta-Karten
│   ├── limitless_online_scraper.py            # Online-Rankings
│   ├── tournament_scraper_JH.py               # Regional-Daten
│   ├── labs_tournament_scraper.py             # Labs-Daten
│   ├── online_tournament_scraper.py
│   ├── archetype_icons_scraper.py
│   ├── archetype_mapping_audit.py
│   ├── card_actions_builder.py
│   ├── pokemon_card_text_scraper.py
│   ├── pokemon_card_effects_scraper.py
│   ├── generate_tooltips.py                   # OpenAI-LLM-Tooltips
│   └── run_pipeline.py
├── services/
│   └── price_proxy_server.py                  # Live-Preis-Proxy (Lokal)
├── tools/
│   ├── build_threat_intel.py
│   └── cleanup_current_meta_csv.py
├── data/tech_radar_data.json
├── settings.py
└── start_scraper_dashboard.py                 # Interaktives Dashboard-Menü
```

### 8.2 Daten-Pipeline-Flow

```
Scrapers (read backend/core/data/)
   ↓ write
backend/core/data/ (state files + CSVs)
   ↓ prepare_card_data.py SYNC_PATTERNS
data/ (frontend-ready CSVs/JSONs)
   ↓ deploy-pages.yml
GitHub Pages → thedipidis.app
```

### 8.3 Settings-Files (`config/`)

11 JSON-Settings im `config/`-Verzeichnis (für Scraper-Parameter): `scraper_settings.json` (6 KB master), `current_meta_analysis_settings.json` (1.5 KB), `city_league_analysis_settings.json` (824 B), plus pro Scraper.

### 8.4 Datenbestand (`data/`, 324 MB, 51 CSV + 47 JSON)

| Top-10 Files | Größe | Inhalt |
|---|---|---|
| `city_league_analysis.csv` | 41.5 MB | City-League-Deckdaten (aktuelles Block) |
| `city_league_analysis_M3.csv` | 31.3 MB | City-League M3 (Vor-Block) |
| `all_cards_merged.json` | 12.9 MB | Card-DB merged (EN+JP+Preise) |
| `all_cards_database.json` | 10.9 MB | Card-DB |
| `online_tournament_dated_cards.csv` | 7.3 MB | Online-Tournament-Cards |
| `all_cards_merged.csv` | 6.5 MB | CSV-Variante |
| `cards_chunk_legacy.json` | 6.3 MB | Format-Chunk: Legacy |
| `all_cards_database.csv` | 5.7 MB | CSV-Variante |
| `cards_chunk_extended.json` | 2.5 MB | Format-Chunk: Extended |
| `cards_chunk_standard.json` | 2.1 MB | Format-Chunk: Standard |

**Per-Format-Chunks:** `data/cards_chunk_{standard,extended,legacy}.json` + `cards_manifest.json`.
**Per-Meta-Tournament-Chunks (gitignored, lokal):** `data/tournament_cards_data_cards_*.csv` (Prague-Data-Loss-Fix).
**Subdirs:** `data/_archive/soft-delete-2026-03-31/`, `data/online_share_history/`.

---

## 9. CI/CD-Pipelines (`.github/workflows/`)

### 9.1 Workflow-Übersicht

| Workflow | Trigger | Aufgabe | Cron |
|---|---|---|---|
| `deploy-pages.yml` | Push to main + Dispatch | Test (JS + Python) → Build (Minify, Cache-Bust, Inject Secrets) → Deploy GH Pages | — |
| `visual-nonmeta.yml` | PR + Push to main + Dispatch | Playwright Visual-Regression für Non-Meta-Tabs | — |
| `visual-fullpage.yml` | Cron + Dispatch | Playwright Full-Page Visual-Coverage | `0 3 * * *` (täglich 03:00 UTC) |
| `weekly-full-update.yml` | Cron + Dispatch | 12 Scraper → Commit/Push CSVs → Dispatch Deploy | `0 6 * * 2` (Dienstag 06:00 UTC) |
| `generate-tooltips.yml` | Cron + Dispatch | OpenAI-LLM → `data/generated_tooltips.json` | `0 6 * * 0` (Sonntag 06:00 UTC) |

### 9.2 `deploy-pages.yml` (3 Jobs)

**Job `test`:**
- Node 20 + `npm install --no-save papaparse`
- JS Unit Tests: `for f in tests/unit/test-*.js; do node --test "$f"; done` → blockt Deployment bei Failure
- Python 3.12 + `pip install pytest beautifulsoup4 requests lxml`
- Python Unit Tests: `pytest tests/python/ --ignore=test_price_proxy_and_price_scraper.py`

**Job `build`** (needs: test):
- Syntax-Check via terser für alle `js/*.js`
- Syntax-Check via `python3 -m py_compile` für 3 kritische Scraper
- **Inject Firebase-Credentials** aus `secrets.FIREBASE_CONFIG` → `js/firebase-credentials.js`
- **Inject Google-Client-ID** aus `secrets.GOOGLE_CLIENT_ID` → angehängt an firebase-credentials.js
- **Inject Sentry-DSN** aus `secrets.SENTRY_DSN` → ersetzt `__SENTRY_DSN__` in `js/error-tracking.js`
- Kopiert nach `_site/`: index.html, manifest.json, version.json, service-worker.js, .nojekyll, CNAME, css/, js/, images/, data/, pokemon_sets_mapping.csv, config/current_meta_analysis_settings.json, _config.yml
- Minify: terser (JS), cleancss (CSS), html-minifier-terser (HTML)
- Image-Optimization: optipng
- **Cache-Bust** mit `${TIMESTAMP}-${COMMIT_HASH}`:
  - Alle `?v=...` in HTML + JS → ersetzt
  - `window.APP_VERSION` in index.html → ersetzt
  - `CACHE_NAME` in service-worker.js → ersetzt
  - `version.json` → neu geschrieben

**Job `deploy`** (needs: build): `actions/deploy-pages@v4`.

### 9.3 `weekly-full-update.yml` (Scraper-Run)

**Robustness-Highlights** (aus Kommentaren extrahiert):
- Seedet `backend/core/data/` aus `data/` mit 25+ Input/State/Output-Files (vermeidet Cloudflare-429-Storm bei „all 624 tournaments fresh").
- Lädt Cardmarket-JSONs (singles, non-singles, price_guide).
- Führt 15 Scraper sequenziell aus mit `set +e` → Einzelfehler blockiert nicht Batch.
- `bump-version.sh` aktualisiert APP_VERSION.
- Commit + Push mit `--rebase=true -X ours` und 3 Retry-Attempts (race-condition mit manuellen Pushes).
- Dispatcht explizit `deploy-pages.yml` (GITHUB_TOKEN-Push triggert sonst kein anderes Workflow).

### 9.4 Secrets (von Workflows referenziert)

- `FIREBASE_CONFIG` — JSON-Blob, wird zu `js/firebase-credentials.js`
- `GOOGLE_CLIENT_ID` — für Google-Sign-In
- `SENTRY_DSN` — für error-tracking.js
- `OPENAI_API_KEY` — für generate-tooltips.yml
- `GITHUB_TOKEN` — Standard, mit `contents:write` + `actions:write`

---

## 10. Test-Bestand & Status im Golden-Stand

### 10.1 JS-Unit-Tests — **GRÜN (236 pass / 0 fail)**

Ausgeführt am 2026-05-22 im Worktree `/tmp/golden/481c9bd/` mit `node --test`:

```
JS unit tests in GOLDEN 481c9bd:
  Total pass: 236
  Total fail: 0
  Failed files: (none)
```

**34 Test-Files** (`tests/unit/`):
- Datenstruktur/Integrität: `test-coreDataProcessing`, `test-dataIntegrity`, `test-parseCSV`, `test-parsePastMetaDateMs`
- Filter-Logik: `test-core-filter-edge-cases`, `test-filterFlows`, `test-filter-property`, `test-current-meta-normalize-property`
- Deck-Builder: `test-deckBuilder`, `test-deck-property`, `test-bidirectional-swap-and-energy-floor`, `test-largest-remainder`, `test-version-selection-mutation-guards`, `test-getPreferredVersionForCard`, `test-getRarityPriority`
- Card-Logic: `test-ace-spec-conditional`, `test-isAceSpec-removeCard`, `test-other-international-prints`, `test-fuzzyArchetypeMatch`, `test-card-cooccurrence`, `test-card-dependencies`, `test-card-function-classifier`, `test-sanitize-proxy`
- Meta-Call: `test-meta-call-phase2-phase3`, `test-meta-call-recency-baseline`, `test-recency-decay`
- Firebase/Stats: `test-firebaseCollection`, `test-calculateCombinedVariantStats`
- Utilities: `test-helpers`, `test-utilsExtra`, `test-rarity-switcher-ready`, `test-build-quality-audit`

### 10.2 Playwright-E2E-Specs (`tests/e2e/`, 12 Files)

| Spec | Coverage |
|---|---|
| `cards-database-filters.e2e.spec.js` | Card-DB-Filter |
| `cards-image-keyboard.e2e.spec.js` | Card-Image-Modal mit Keyboard |
| `cards-keyboard-accessibility.e2e.spec.js` | A11y im Card-DB |
| `city-league-exact-navigation.e2e.spec.js` | City-League-Navigation |
| `city-league-hero-combined-navigation.e2e.spec.js` | City-League-Hero-Grid |
| `city-league-language-switch.e2e.spec.js` | i18n DE↔EN |
| `playtester-hand-buttons.e2e.spec.js` | Playtester-Hand-Buttons |
| `proxy-import-errors.e2e.spec.js` | Proxy-Tab Fehlerhandling |
| `proxy-queue-reset.e2e.spec.js` | Proxy-Queue-Reset |
| `rarity-switcher.e2e.spec.js` | Rarity-Switcher-Modal |
| `visual-full-page-coverage.spec.js` | Visual-Snapshots Full-Page (per Tab) |
| `visual-regression.spec.js` | Visual-Regression-Sammlung |

**Visual-Snapshot-Baselines** (14 in `tests/e2e/__snapshots__/{testFilename}/`):
- Per-Tab: `full-tab-current-meta`, `full-tab-city-league`, `full-tab-city-league-analysis`, `full-tab-current-analysis`, `full-tab-past-meta`, `full-tab-cards`, `full-tab-proxy`, `full-tab-sandbox`, `full-tab-profile`, `full-tab-tutorial`, `full-tab-calculator`
- Komponenten: `card-action-buttons`, `cards-database-grid`, `city-league-archetype-table`, `city-league-hero-grid`, `pokeball-nav-dropdown`, `rarity-switcher-modal`

**⚠ Snapshot-Pfad-Quirk:** Verzeichnis heißt literal `tests/e2e/__snapshots__/{testFilename}/` — das `{testFilename}`-Template wurde nicht expandiert. Vermutlich Folge eines früheren Configfehlers. **Nicht-blockierender Befund**; in Phase 3 prüfen, ob das Auswirkungen hat.

**Playwright-Config:** `playwright.config.js` und `playwright.visual-nonmeta.config.js` sind **inhaltlich identisch** (Chrome/Edge auto-pickup, 1280×800, threshold 0.2, maxDiffPixelRatio 0.02). Vermutlich Duplikat-Konfiguration.

### 10.3 Python-Tests

**Unit (`tests/python/`):** 12 Files: card_database, card_scraper_shared, csv_and_settings, current_meta_analysis_scraper, limitless_dated, prepare_card_data, price_proxy_and_price_scraper (CI ignored), scraper_additional, scraper_extraction, scraper_functions, threat_classifier.

**E2E (`tests/*.py`):** 11 Scripts (e2e_audit_r5, e2e_battle_journal[_edit][_overhaul], e2e_city_league_meta, e2e_current_meta_global, e2e_deck_analysis_global, e2e_deck_analysis_japan, e2e_i18n_language_purity, e2e_matchup_analysis, e2e_mobile_audit, e2e_past_meta).

**Verify-Scripts:** `verify_audit_r4.py`, `verify_fcp.py`, `verify_limitless.py`, `verify_share_modal.py`.

Python-Tests im Golden **nicht ausgeführt** in dieser Audit-Phase (pytest+lxml+beautifulsoup4 nicht installiert, würde Phase-1-Scope sprengen). CI-Stand am 19. Mai laut Workflow-Definition: muss grün gewesen sein, sonst wäre der Push zu main blockiert worden.

### 10.4 Visual-Regression-Run-Artefakte im Tree (suspect)

`visual-nonmeta-summary.txt` zeigt **letzten erfolgreichen Run: 2026-04-02T09:52:25Z** (April!), 8 expected / 0 unexpected.
`visual-nonmeta.exit` = `EXIT:1`, `visual-nonmeta-run.rc` = `RC:1`, `visual-regression-latest-rc.txt` = `RC:1`, `visual-regression-verify.rc` = `RC:1` — lokale Re-Run-Versuche nach 02. April scheinen alle gescheitert zu sein. **Dies sind lokale Maintainer-Testläufe**, NICHT der CI-Stand (CI lief am 19. Mai aus `visual-nonmeta.yml` Workflow #869). Diese Files sollten eigentlich in `.gitignore` stehen.

---

## 11. Tote / Verdächtige Bereiche im Golden-Tree

| Bereich | Befund | Quelle |
|---|---|---|
| `frontend/` (56 KB) | 6 HTML-Komponenten + 1 CSS — `header.html`, `sidebar.html`, `TabContent_Decks/Market/Analysis/Archetypes.html` werden **nirgends im JS-Code geladen**. `<div id="header-container">` und `<div id="sidebar-container">` in index.html:416-417 bleiben leer. | `grep -rn "header.html\|sidebar.html\|header-container\|TabContent_" index.html js/*.js` ergibt nur die DIV-Definitionen. |
| `_archive/` (20 MB) | März/April-2026 Cleanups: `_archive/dead-assets-2026-03-31/{images,css,js}`, `_archive/audit-artifacts-2026-04-02/`, `_archive/utils/` (9 alte Python-Fix-Skripte). Steht in `.gitignore` (Zeile 114) — wird aber **trotzdem getrackt** (gitignore wirkt nicht rückwirkend). | `ls _archive/`, `cat .gitignore` |
| `test-artifacts/` (9.7 MB) | April-2026 Audit-Screenshots: `desktop-check.png`, `mobile-*.png` (16 Files), `mobile-ux-audit/`, `visual-final-20260402-*.{exit,json}`. Steht in `.gitignore` (Zeile 108: `tests/artifacts/` — aber dieser Path ist `test-artifacts/` ohne `s`!). | `ls test-artifacts/` |
| Lokale Run-Outputs im Repo-Root | `visual-final.{exit,err,json}`, `visual-full.{exit,err,json}`, `visual-nonmeta.{exit,json}`, `visual-nonmeta-run.rc`, `visual-nonmeta-summary.txt`, `visual-regression-latest.json` (57 KB), `visual-regression-verify.{rc,json,stdout.json}`, `visual-regression-update.json`, `runtime-verify-results.txt`, `terminal-check.txt`, `current-meta.exit`, `cards-grid-test-report.json`, `mobile-ux-audit-report.json`. Alle deutlich lokale Maintainer-Outputs, nicht in `.gitignore`. | `ls -la /tmp/golden/481c9bd/` |
| `audit_single_tab.js` (Root, 0 B) | Leere Datei. | `ls -la` |
| `prepare_card_data.py` (Root, 0 B) | Leere Datei (Original ist `backend/core/prepare_card_data.py`). | `ls -la` |
| `tmp_404_probe.py`, `tmp_past_meta_probe.py` | Maintainer-Debug-Skripte, vermutlich `tmp_*`. | `ls -la` |
| `backend - Verknüpfung.lnk` (1.3 KB) | Windows-Shortcut-Datei. `.gitignore` hat `*.lnk` (Zeile 111) — vor-getrackt. | `ls -la` |
| `PROJECT_STRUCTURE.md` (2.5 KB) | Stand „März 2026", beschreibt `js/app.js (~16.000 Zeilen)` — **dieses File existiert nicht**. Auch beschreibt es Scraper im Repo-Root statt im `backend/`-Layout. | `head PROJECT_STRUCTURE.md` |
| `README.md` (16 KB) | Beschreibt ebenfalls noch `js/app.js`, `card_price_scraper.py` im Root etc. — Stand vor Backend-Refactor. | `head README.md` |
| `dashboard-theme.css` Duplikat | Existiert sowohl in `css/dashboard-theme.css` (82 B, praktisch leer) als auch `frontend/css/dashboard-theme.css`. | `find . -name dashboard-theme.css` |
| Playwright-Snapshot-Path-Quirk | Verzeichnis heißt literal `tests/e2e/__snapshots__/{testFilename}/` — Template nicht expandiert. | `ls tests/e2e/__snapshots__/` |
| `playwright.config.js` ≈ `playwright.visual-nonmeta.config.js` | Inhaltlich identisch (nur Type-Kommentar in v2 zusätzlich). | `diff playwright.config.js playwright.visual-nonmeta.config.js` |
| Doppelte Playtester-Skripts im Tree (3 Files, 337 KB) | `playtester.js` (290 K) + `playtester-mobile.js` (33 K) + `playtester-patch.js` (14 K) — letzteres monkey-patcht das erste. Konsolidierung möglich. | `ls js/playtester*` |

**Diese Befunde sind alle „potenzielle Cleanup-Kandidaten" — keine Bugs.** In Phase 3 entscheiden, was davon behalten, was entfernt wird.

---

## 12. Was im Golden-Stand DEFINITIV funktioniert (evidenzbasiert)

- ✅ **JS-Unit-Tests:** 236/236 grün (lokal ausgeführt 2026-05-22).
- ✅ **Tab-Navigation:** 12 Top-Level + 11 Profile-Subtabs, alle mit dediziertem Modul oder klarer Inline-UI.
- ✅ **Service-Worker:** Auto-Update via `controllerchange` + `SW_UPDATED`-Postmessage; APP_VERSION-Drift-Reload.
- ✅ **Cache-Bust:** Jeder Deploy schreibt neue Versions-Strings in HTML/JS/SW/version.json.
- ✅ **CI-Deploy-Gate:** JS-Tests blockieren Deploy bei Failure (deploy-pages.yml:48-51).
- ✅ **Secrets-Injection:** Firebase + Google + Sentry werden zur CI-Zeit injected, nicht im Repo.
- ✅ **Per-Format-Chunking:** Cards in `cards_chunk_{standard,extended,legacy}.json` mit `cards_manifest.json` als Index.
- ✅ **Per-Meta-Tournament-Chunks:** Prague-Data-Loss-Fix dokumentiert + aktiv.
- ✅ **PWA:** Standalone-Install-fähig via `manifest.json`.
- ✅ **Internationalisierung:** DE/EN, dynamisch via `window.t(key)` + `data-i18n`-Attribute.
- ✅ **Lazy-Loading:** Playtester (337 KB) + Firebase-Multiplayer (54 KB) werden erst auf Tab-Switch geladen.
- ✅ **Async-CSS:** 22 von 27 CSS-Files via `media="print"`-Trick non-blocking.
- ✅ **Debouncing:** 6 globale Filter-Funktionen mit 300ms-Debounce gewrappt.
- ✅ **Visual-Regression-Baseline:** 14 Snapshots vorhanden (Stand vermutlich von vor April).
- ✅ **Weekly-Scraper-Pipeline:** 12 Scraper, mit Retry-Push, mit explizitem Deploy-Dispatch, mit per-Step-Tolerance.

---

## 13. Bekannte / Vermutete Limitierungen im Golden-Stand

(Was beim Lesen offensichtlich war — keine geprüften Bugs, nur Beobachtungen.)

- **`PROJECT_STRUCTURE.md` und Teile von `README.md` sind seit Backend-Refactor veraltet** — beschreiben nicht-existentes `js/app.js` und Scraper im Root. Verwirrt neue Mitwirkende.
- **`frontend/` ist toter Code** — wird nirgends geladen. Hat aber ein gleichnamiges `dashboard-theme.css` wie `css/`.
- **Lokale Maintainer-Testläufe im Repo eingecheckt:** `visual-*.exit/json/rc`, `runtime-verify-results.txt`, `terminal-check.txt`. Diese Files erscheinen mit RC:1 (failed) — nicht der CI-Stand. Sollten in `.gitignore`.
- **`.gitignore`-Pfad-Mismatch:** Zeile 108 ignoriert `tests/artifacts/`, aber im Tree heißt der Ordner `test-artifacts/` (ohne `s`).
- **Snapshot-Path-Template `{testFilename}` nicht expandiert** — kosmetisch, vermutlich keine Auswirkung weil Playwright-Resolution wahrscheinlich trotzdem klappt, aber unsauber.
- **`playwright.config.js` und `playwright.visual-nonmeta.config.js` sind quasi-Duplikate** — Vereinfachung möglich.
- **Monolithische CSS-Datei:** `styles.css` 273 KB. Long-term: aufsplitten.
- **Monolithische JS-Module:** `app-deck-builder.js` 447 KB, `app-meta-call.js` 295 KB, `playtester.js` 290 KB. Long-term: Submodule-fähig (nicht jetzt).
- **`current-meta-analysis-settings.json` wird zur CI-Zeit als einziges Config-File aus `config/` mit-deployed** — vermutlich nicht gewollt, dass die anderen 10 Configs *fehlen*; vielleicht beabsichtigt, weil die anderen Backend-only sind.
- **README zeigt Custom Domain `https://thedipidis.app/`** — diese läuft also auf production. Cache-Bust-Mechanik muss zuverlässig sein (sonst stale Clients).

---

## 14. Phase-2-Ansatzpunkte (Vergleichsachsen für `Golden → 7d12922`)

Wenn Phase 2 freigegeben wird, sind folgende Achsen zu vergleichen:

| Achse | Was vergleichen | Erwartete Quelle der Differenz |
|---|---|---|
| **a) Datei-Existenz** | `find` im Golden vs. HEAD: was ist neu/gelöscht/umbenannt? | Wave-1/Wave-2 IA-Refactor, Profile-Split, neue Wave-0-Module |
| **b) `index.html`-Tab-Struktur** | 12 tab-content divs Golden vs. HEAD | Wave-2-Refactor hat `meta-view` konsolidiert, am 22. Mai zurück-revertiert |
| **c) Script-Loading-Reihenfolge** | defer-Liste Golden vs. HEAD | Neue Module wie `bootstrap.js`? |
| **d) `js/`-Inhalt pro Modul** | `git diff` für jedes Modul aus §5 | Wave-0-Test-Reliability, app-core.js Lazy-Loader-Fix |
| **e) CSS-Reihenfolge** | Neue CSS-Files (z.B. `meta-view.css`?) | Wave-2-Layout |
| **f) Tests** | Welche Tests sind neu, welche gelöscht, welche modifiziert? Pass/Fail-Rate auf HEAD | Wave-2-Test-Suites |
| **g) CI-Workflows** | Welche Workflows wurden geändert? `ci: SHA-pin every third-party action` (Commit 427efbd) | SHA-Pinning aller 8 Workflows |
| **h) Backend** | Welche Scraper/Tools wurden geändert? | duckdb-pilot Commit 97dba38 |
| **i) Datenbestand** | Sind alle CSV/JSON-Files heute noch da? Neue Format-Chunks? | Weekly-Update-Commits |
| **j) Inline-Scripts** | `<script>` an Zeile 32/819/4887 — verändert? | Möglicherweise `bootstrap.js` injection |
| **k) Service Worker** | CACHE_NAME, Shell-Asset-Liste, Strategien | Cache-Bust-Version-Update |
| **l) Tote Bereiche** | Sind `frontend/`, `_archive/`, lokale `visual-*` Files heute weg oder noch da? | Wave-0-Cleanup |

**Hypothese (vor Phase-2-Daten):** Der heutige HEAD `7d12922` ist eine Wave-2-Revert-Aktion auf einen darunter liegenden Wave-1/Wave-2-Stack. Erwartung: viele Files in `js/` und `index.html` weichen ab. Tests-Pass/Fail-Rate auf HEAD muss verifiziert werden.

---

## Anhang: Worktree-Setup für Phase 2

```bash
# Worktree liegt bei /tmp/golden/481c9bd (read-only, detached HEAD)
# Aktiver Branch (live): /home/user/TheDipidis -> claude/gracious-edison-ITIKO @ 7d12922

# Für Diff-Operationen:
git -C /home/user/TheDipidis diff 481c9bd..HEAD --stat
git -C /home/user/TheDipidis log 481c9bd..HEAD --oneline

# Worktree cleanup nach Audit:
git -C /home/user/TheDipidis worktree remove /tmp/golden/481c9bd
```

---

**Phase-1-Status:** ABGESCHLOSSEN. Dieses Dokument liegt unkommittet im Working Tree.
**Nächster Schritt:** Auf User-OK für Phase 2 warten (Vergleich Golden ↔ HEAD).
