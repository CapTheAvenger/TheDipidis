# 🎴 TheDipidis · Pokémon TCG Analysis System

Pokémon TCG scraping & analysis platform — Limitless TCG, Cardmarket
and Play! Pokémon data, processed nightly, rendered as an interactive
web frontend with deck builder, proxy printer, card database, Firebase
user profiles and a Telegram bot companion.

## 🌐 Live

- **Website:** https://thedipidis.app/
- **GitHub Pages backend:** https://captheavenger.github.io/TheDipidis/
  (redirects to the custom domain)
- **Telegram bot:** [@TheDipidisBot](https://t.me/TheDipidisBot)
  — `/metacall`, `/deck <archetype>`, /-style commands
- **External Playtester handoff:** TCG Showdown
  (`js/tcg-showdown-link.js` opens decks in a new tab)

## 📁 High-level structure

```
TheDipidis/
├── index.html                # Single-page app entry
├── js/                       # Frontend modules (44 files, plain ES5/ES2015 + IIFEs)
│   ├── app-core.js           # Tab routing, tab-help map, shared helpers
│   ├── app-cards-db.js       # Card Database tab
│   ├── app-city-league.js    # City League Meta + Deck Analysis (JP)
│   ├── app-current-meta-analysis.js  # Current Meta · Deck Analysis (Global)
│   ├── app-deck-builder.js   # Deck Builder + MostConsistency engine
│   ├── app-meta-call.js      # Meta Call predictor
│   ├── app-past-meta.js      # Past Meta tab
│   ├── battle-journal.js     # IRL match log
│   ├── firebase-*.js         # Auth, Firestore sync, collection + decks
│   ├── i18n.js               # EN ↔ DE localisation
│   ├── tcg-showdown-link.js  # External playtester handoff
│   └── …                     # See `ls js/` for the full list
├── css/                      # Stylesheets — load order in index.html
├── data/                     # CSV/JSON outputs from the scrapers
├── backend/
│   ├── core/                 # Shared scraper utilities (card DB, fetchers)
│   ├── scrapers/             # 20+ Python scrapers
│   ├── services/             # Price proxy + helpers
│   └── tools/                # One-off CLIs
├── bot/                      # Telegram bot (Node + Telegraf, deploys to Render)
├── prerender/                # Puppeteer renderer for the bot snapshot PNG
├── config/                   # Per-scraper settings JSONs
├── tests/
│   ├── unit/                 # node:test JS unit suite (run via scripts/run-js-unit-tests.sh)
│   ├── python/               # pytest, including cross-surface consistency
│   └── e2e/                  # Playwright visual + interaction specs
├── scripts/                  # CI helpers (manifest generation, deck-index, etc.)
├── .github/workflows/        # 10 GitHub Actions workflows
└── docs/audit/               # Investigation write-ups per feature
```

## 🚀 Quickstart

### Run the frontend locally

```bash
python3 -m http.server 8000
# open http://localhost:8000/index.html
```

That's enough to develop the JS — the data files in `data/` ship with
the repo so the SPA loads against committed scraper output.

### Run a scraper

```bash
python3 -m venv .venv && source .venv/bin/activate   # or .venv\Scripts\Activate.ps1 on Windows
pip install -r requirements.txt
python3 backend/scrapers/limitless_online_scraper.py
```

Interactive dashboard for the full batch:

```bash
START_DASHBOARD.bat        # Windows
python3 backend/start_scraper_dashboard.py
```

### Run the test suites

```bash
npm run test:unit       # JS unit tests (node:test)
npm run test:py         # Python (scraper logic + cross-surface consistency)
npm run test:all        # Both
```

Visual regression (Playwright):

```bash
npm run test:visual:fullpage:ci
npm run test:visual:nonmeta:ci
```

## 📊 Web interface — current tabs

| # | Tab | Purpose |
|---|---|---|
| 1 | **Meta & Deck Analysis Hub** | Landing hub linking the five meta tabs |
| 2 | **City League Meta** | Japan City League archetypes & trends |
| 3 | **City League Deck Analysis** | Per-archetype deck breakdown for JP CL |
| 4 | **Current Meta (Global)** | Limitless Online ladder + Major aggregation |
| 5 | **Deck Analysis (Global)** | Per-archetype card-share for current meta, with Quick Reference panels (Latest Major, Latest Online) and 3-way Compare |
| 6 | **Past Meta** | Historical regional/special-event archive |
| 7 | **Card Database** | 21 000+ card index with multi-select filters, lightbox, Cardmarket prices, collection & wishlist hooks |
| 8 | **Proxy Printer** | Import decks → printable A4 sheets |
| 9 | **Meta Call** | Predictive field-composition + Day-2 odds engine |
| 10 | **My Profile** | Collection, Wishlist, Trade List, Saved Decks, Battle Journal, Settings, Firebase sync |
| 11 | **How to Use** | In-app tutorial |
| 12 | **Side Quest: Champions** | Pokémon Champions top-doubles teams + replica codes |

Standalone tools accessible from the menu: **Probability Calculator**,
**Proxy Printer** (also linked from each deck card), **TCG Showdown**
(external Playtester handoff).

## 🐍 Scraper system (backend/scrapers/)

All scrapers live under `backend/scrapers/`. The main ones:

| Scraper | Output | Schedule |
|---|---|---|
| `all_cards_scraper.py` | `data/all_cards_database.json` | Weekly Full Update (Tue + Fri) |
| `japanese_cards_scraper.py` | `data/japanese_cards_database.json` | Manual |
| `limitless_online_scraper.py` | `data/limitless_online_decks*.csv` | Weekly Full Update |
| `current_meta_analysis_scraper.py` | `data/current_meta_card_data.csv` | Weekly Full Update |
| `city_league_analysis_scraper.py` | `data/city_league_analysis.csv` | Weekly Full Update |
| `city_league_archetype_scraper.py` | `data/city_league_archetypes.csv` | Weekly Full Update |
| `online_tournament_scraper.py` | `data/online_tournament_dated_cards.csv` | Weekly Full Update |
| `labs_tournament_scraper.py` | `data/labs_tournament_decks.csv` | Weekly Full Update |
| `per_decklist_scraper.py` | `data/tournament_decklists_per_player.csv` | Tuesdays |
| `cardmarket_id_mapper.py` + `cardmarket_price_merger.py` | `data/price_data.csv` | Daily 08:00 UTC |
| `champions_replica_scraper.py` | Side-quest doubles teams | Daily 10:00 UTC |
| `player_continuity_scraper.py` | `data/player_continuity.csv` | Manual |

Each scraper reads its config from `config/<name>_settings.json`.

## ⚙️ Configuration

Per-scraper settings live in `config/*_settings.json`. CI secrets:

- `FIREBASE_CONFIG` — Web SDK config (injected into `js/firebase-credentials.js` at deploy time)
- `GOOGLE_CLIENT_ID` — Google Sign-In Client ID (also injected at deploy)
- `SENTRY_DSN` — error tracking endpoint (token-substituted in `js/error-tracking.js`)
- `BOT_TOKEN` — Telegram bot token (Render env + price-alert workflow)
- `FIREBASE_SERVICE_ACCOUNT` — server-side Firestore write access (price-alert workflow)

Repository-local Firestore rules: `firestore.rules` (synced with
`FIRESTORE_RULES.md` — see the audit note below).

## 📦 GitHub Actions

| Workflow | Trigger | What it does |
|---|---|---|
| Deploy to GitHub Pages | push to `main` | Build + minify + cache-bust + cross-surface tests + deploy |
| Weekly Full Update | Tue + Fri 06:00 UTC | Full scraper batch + commit + dispatch deploy |
| Daily Price Refresh + Alerts | 08:00 UTC daily | Cardmarket refresh + Telegram price alerts |
| Champions Replica Scrape | 10:00 UTC daily | Side Quest tab data |
| Per-Decklist Scrape | Tuesdays 12:00 UTC + manual | Per-player tournament decklists |
| Player Continuity Scrape | manual | Player-thread continuity audit |
| Tutorial Screenshots | manual | Regenerate `images/tutorials/` |
| Bot Keepalive | every 5 min | Pings the Render-hosted bot to avoid cold-starts |
| Visual Fullpage Coverage | 03:00 UTC daily + manual | Playwright fullpage regression |
| Visual Non-Meta Regression | PR + push to `main` | Playwright PR-gate |

## 📚 Other docs in this repo

- [`AUDIT_GITHUB.md`](AUDIT_GITHUB.md) — repository audit (24 findings, scored, with fix list)
- [`FIREBASE_SETUP_GUIDE.md`](FIREBASE_SETUP_GUIDE.md) — Firebase project setup
- [`FIRESTORE_RULES.md`](FIRESTORE_RULES.md) — current Firestore security rules (also lives in `firestore.rules`)
- [`GITHUB_ACTIONS_SCHEDULE.md`](GITHUB_ACTIONS_SCHEDULE.md) — schedule + secret reference
- [`ALL_CARDS_SCRAPER_README.md`](ALL_CARDS_SCRAPER_README.md) — all-cards-scraper specifics
- [`JAPANESE_CARDS_SCRAPER_README.md`](JAPANESE_CARDS_SCRAPER_README.md) — JP cards scraper
- [`PRICE_SCRAPER_README.md`](PRICE_SCRAPER_README.md) — Cardmarket pipeline
- `bot/README.md` — Telegram bot setup
- `docs/audit/` — per-feature investigations

## 📜 License

See [`LICENSE`](LICENSE) — proprietary, all rights reserved. Public
for portfolio purposes only; third-party trademarks belong to their
respective owners (The Pokémon Company, Nintendo, Creatures Inc.,
GAME FREAK Inc., partner publishers).

## 🙏 Credits

- **Limitless TCG** — card database, ladder & tournament data
- **Cardmarket** — EUR pricing
- **Play! Pokémon** — official tournament data
- **Firebase** — auth + Firestore sync
- **Telegraf**, **Telegram** — bot framework + delivery

---

**Last refreshed:** 2026-06-12
