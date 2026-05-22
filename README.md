# 🎴 TheDipidis - Pokemon TCG Analysis System

Komplettes Pokemon TCG Scraping & Analysis System mit interaktiver Web-Oberfläche, Deck Builder, Proxy Printer, externem Playtester-Handoff und Firebase-User-Profilen.

## 🌐 Live Demo
**Website:** https://thedipidis.app/
**GitHub Pages backend:** https://captheavenger.github.io/TheDipidis/ (redirects to the custom domain)

## 📁 Projekt-Struktur

Eine vollständige Struktur-Übersicht steht in `PROJECT_STRUCTURE.md`.
Kurzform:

```
TheDipidis/
├── 🌐 Web Interface
│   ├── index.html                       # Single-Page-App, ~4900 LOC
│   ├── service-worker.js                # PWA-Caching (network-first)
│   ├── manifest.json, version.json
│   ├── js/                              # Legacy IIFE-Scripts (26 Files)
│   │   ├── app-core.js, app-deck-builder.js, app-meta-call.js, …
│   │   ├── i18n.js + i18n-de.js         # i18n EN/DE getrennt
│   │   ├── lazy-loader.js               # Wave-1 L2.5 Lazy-Loading
│   │   └── …
│   ├── js/modules/                      # Wave-1 ES-Module (22 Files)
│   │   ├── index.js (Bundle-Entry)
│   │   ├── card-key.js, metrics.js, stores/, firebase/, data/, …
│   └── css/                             # 27 Stylesheets
│
├── 🐍 Backend (backend/)
│   ├── core/                            # Shared Lib + Settings
│   ├── scrapers/                        # 19 Scraper
│   ├── services/price_proxy_server.py
│   ├── tools/                           # Build/Verify/Cleanup-Skripte
│   └── start_scraper_dashboard.py       # Interaktives Dashboard-Menü
│
├── 📊 Daten (data/)
│   ├── all_cards_database.{csv,json}    # Alle englischen Karten
│   ├── all_cards_merged.{csv,json}      # EN + JP + Preise (merged)
│   ├── city_league_analysis{,_M3}.csv   # City-League-Deck-Daten
│   ├── current_meta_card_data.csv       # Current-Meta-Daten
│   ├── cards_chunk_{standard,extended,legacy}.json
│   ├── online_share_history/            # Tagesschnappschüsse
│   └── … (~50 CSVs, ~45 JSONs)
│
├── 🛠️ Build & Tooling
│   ├── package.json                     # 14 npm-Scripts
│   ├── scripts/                         # build-bundle, build-modules,
│   │                                    # run-unit-tests, build_parquet,
│   │                                    # upload_to_r2, generate-sri
│   ├── eslint.config.js                 # Flat-Config ESLint
│   ├── .prettierrc.json                 # Prettier
│   ├── tsconfig.json + types/globals.d.ts  # TypeScript checkJs
│   └── playwright.config.js             # Playwright-Visual-Regression
│
├── 🧪 Tests (tests/)
│   ├── unit/                            # 36 Node-Test-Files
│   ├── e2e/                             # 12 Playwright-Specs
│   │   └── __snapshots__/               # 14 Visual-Baselines
│   ├── python/                          # 12 pytest-Unit-Tests
│   ├── e2e_*.py                         # 7 Python-E2E-Skripte
│   └── verify_*.py                      # Verifikations-Skripte
│
├── ⚙️ CI/CD (.github/workflows/)
│   ├── deploy-pages.yml                 # Test → Lint → Build → Deploy
│   ├── visual-{nonmeta,fullpage}.yml    # Visual-Regression
│   ├── weekly-full-update.yml           # Di 06:00 UTC Scraper-Batch
│   ├── generate-tooltips.yml            # So 06:00 UTC OpenAI-Tooltips
│   ├── codeql.yml                       # Mo 06:27 UTC Security-Scan
│   ├── preview-build.yml                # Wave-3 PR-Preview-Artifacts
│   └── verify-decklist-counts.yml       # Manual Cross-Check
│
└── 📖 Dokumentation
    ├── README.md                        # Diese Datei
    ├── PROJECT_STRUCTURE.md             # Detaillierte Struktur
    ├── R2_SETUP.md                      # Cloudflare-R2-Pilot
    ├── FIREBASE_SETUP_GUIDE.md
    ├── PRICE_SCRAPER_README.md
    ├── ALL_CARDS_SCRAPER_README.md
    ├── JAPANESE_CARDS_SCRAPER_README.md
    ├── GITHUB_ACTIONS_SCHEDULE.md
    └── docs/audit/                      # Audit-Phasen 1-4
```

## 🚀 Schnellstart

### 1️⃣ Einmalige Einrichtung
```bash
# Repository klonen
git clone https://github.com/CapTheAvenger/TheDipidis.git
cd TheDipidis

# Python Virtual Environment erstellen
python -m venv .venv
source .venv/bin/activate            # Linux/macOS
# .venv\Scripts\Activate.ps1         # Windows

# Backend-Dependencies installieren
pip install -r requirements.txt

# Frontend-Build-Dependencies installieren
npm ci
```

**Backend-Dependencies** (siehe `requirements.txt`):
- `cloudscraper` + `beautifulsoup4` + `lxml` — für die meisten Scraper
- `selenium` + `selenium-stealth` — für Card Price Scraper (CardMarket)
- `pandas` — Datenverarbeitung
- `pyarrow` + `boto3` — Cloudflare-R2-Pilot

**Frontend-Build-Dependencies** (siehe `package.json`):
- `@playwright/test`, `papaparse`, `esbuild`, `eslint`, `prettier`,
  `typescript`, `c8` (coverage)

### 2️⃣ Scraper ausführen
Doppelklick auf: **`START_DASHBOARD.bat`** (oder direkt
`python backend/start_scraper_dashboard.py`)

Das interaktive Dashboard-Menü bietet:
```
  --- BASE DATA (Fundament) ---
  [1]  Update Sets (sets.json)
  [2]  All Cards Scraper (EN/DE)
  [3]  Japanese Cards Scraper
  [4]  Card Price Scraper
  --- META & TOURNAMENTS ---
  [5]  Current Meta Analysis (Play! & Live)
  [6]  Limitless Online Scraper (Trends)
  [7]  City League Analysis (Deep Dive JP)
  [8]  City League Archetypes (Trends JP)
  [9]  Historical Meta Scraper (JH)
  --- FRONTEND ---
  [10] Prepare Frontend Data (Merge)
  --- BATCH SHORTCUTS ---
  [B]  Base Data Update (1-4 + 10)
  [M]  Meta Update / Dienstags-Update (5-10)
  [F]  Full System Update (1-10)
```

### 3️⃣ Frontend bauen + lokal öffnen
```bash
# Wave-1 Bundle bauen (esbuild)
npm run build:bundle

# Lokaler Server starten
python -m http.server 8000

# Dann öffnen: http://localhost:8000/index.html
```

**Wichtig:** Ohne `npm run build:bundle` fehlt `_dist/app.modules.bundle.js`
und Wave-1-Exports (`parseCardKey`, `userStore`, `ArchetypeIcons`,
`TechLab`, `openAntiTechModal`, …) sind nicht verfügbar.

### 4️⃣ Vor jedem Commit
```bash
npm run lint        # ESLint (warn-only)
npm run typecheck   # tsc --noEmit
npm test            # 36 Node-Unit-Tests
npm run test:coverage:modules  # Coverage-Gate (lines 85, fns 80, br 70)
```

### 5️⃣ Zu GitHub pushen
Doppelklick auf: **`PUSH_TO_GITHUB.bat`** (oder regulär via `git push`)

## 📊 Web-Interface — 11 Top-Level-Tabs + Profile-Subtabs

Tab-Reihenfolge in der Sidebar: **Meta & Tier Lists** (Current Meta /
Current Meta Deck Analysis / City League / City League Deck Analysis /
Past Meta) — Cards — Proxy Printer — Playtester (handoff zu
[tcg-showdown.com](https://tcg-showdown.com/)) — TCG Showdown (extern) —
My Profile — Calculator — How to Use.

Profile-Subtabs: My Collection, My Decks, Wishlist, Trade List,
Meta Binder, Custom Binder, Battle Journal, Deck Compare, Meta Call,
Testing Groups, Settings.

### 1. 🇯🇵 City League Meta
- Übersicht aller Japan City League Turniere
- Archetype-Entwicklung und Trends über Zeit
- Vergleich alter vs. neuer Daten (HTML Comparison Reports)
- Sortierbare Tabellen mit Statistiken

### 2. 📊 City League Deck Analysis
- Detaillierte Deck-Analysen mit interaktiven Filtern
- **Datum-Filter**: Turniere nach Zeitraum filtern
- **Deck-Auswahl**: 30+ Archetypen mit Autocomplete-Suche
- **Karten-Filter**: Pokémon, Trainer, Energie separat
- **Card Overview**: Alle Karten mit Usage%, Rarity-Optionen
- **Deck Builder**: +/− Buttons, Auto-Generate (Max Consistency), Copy to Clipboard
- **Rarity-Switcher (★)**: Verschiedene Karten-Versionen wählen
- **Deck Compare**: Zwei Decklisten visuell vergleichen (farbcodiert)
- **CardMarket Integration**: EUR-Preise & Links
- **Combined Variants**: Karten aus verschiedenen Sets automatisch zusammengefasst

### 3. 🎮 Current Meta
- Aktuelle Meta-Übersicht (Limitless Online + Play! Pokémon)
- Top-Decks und Winrates
- Meta-Share Analysen
- Matchup-Tabellen mit Win/Loss Records

### 4. 📈 Current Meta Deck Analysis
- **Format-Filter**: All / Limitless only / Tournament only
- **Win Rate Stats**: Online-Turnier-Winrates
- **Matchup-Analyse**: Beste/schlechteste Matchups mit Records
- **Meta Card Analysis**: Meistgespielte Karten über Top-10-Decks
- **Max Consistency Mode**: Auto-Generate basierend auf Turnierdaten
- **Deck Builder** mit allen Features (Save, Copy, Compare, Playtest)
- **Rarity-Switcher (★)**: Click auf jede Karte für alternative Prints

### 5. 🏆 Past Meta
- Historische Tournament-Daten (Regionals, LAICs, EUICs, NAICs, Worlds)
- **Format-Filter**: Nach Meta-Perioden filtern (SVI-ASC, SVI-PFL, BRS-PRE, etc.)
- Archetype-Performance über Zeit
- Deck Builder mit denselben Features wie andere Tabs

### 6. 🧰 Cards (Karten-Datenbank)
- Vollständige Karten-Datenbank (21.000+ Karten)
- **Multi-Select Filter**:
  - Meta/Format (Total, All Playables, City League, aktuelle Formate)
  - Set (sortiert neueste → älteste, nur englische Sets)
  - Rarity (SAR, IR, SIR, UR, etc.)
  - Category (Pokémon nach Typ, Trainer, Energy, Ace Spec)
- **Autocomplete-Suche** mit Thumbnails
- **CardMarket Preis-Display**
- **Lightbox**: Click auf Karte für Full-Size-Preview
- **Collection ✓ / Wishlist ❤️ Buttons** auf jeder Karte

### 7. 🖨️ Proxy Printer
- Decklisten importieren (Pokémon TCG Live Format)
- Einzelne Karten manuell hinzufügen (Name, Set, Nummer)
- Decks direkt aus City League / Current Meta / Past Meta übernehmen
- **Print Queue**: Alle Karten in druckbarem Layout ausgeben
- Unique Count + Copies Counter

### 8. ⚔️ Playtester Sandbox (extern)
Der in-app Playtester ist deprecated. Die Sandbox-Buttons (Start,
Multi, Flip Board, Undo, Log, Zoom) leiten via Redirect-Stubs in
`js/app-core.js` zu [tcg-showdown.com](https://tcg-showdown.com/)
weiter. Decklisten werden vom Deck-Builder direkt an TCG Showdown
übergeben (siehe `js/modules/tcg-showdown-link.js`).

### 9. 👤 My Profile
- **My Collection**: Eigene Karten verwalten, durchsuchbar
- **My Decks**: Gespeicherte Decks mit Card Previews, ⚔️ Playtest Button
- **Wishlist**: Karten-Wunschliste
- **Settings**: Account-Verwaltung
- Firebase-Sync über alle Geräte

### 10. 📖 How to Use
- Komplette Dokumentation aller Features
- Tab-Erklärungen, Deck Building Guide, Playtester Guide
- FAQ zu häufigen Fragen

## 🐍 Scraper-System

### All Cards Scraper (`all_cards_scraper.py`)
- Scraped alle englischen Karten von Limitless TCG
- Automatische Set-Erkennung und Incremental Updates
- 21.000+ Karten mit Bildern, Rarity, Type

### Japanese Cards Scraper (`japanese_cards_scraper.py`)
- Neueste japanische Sets (vor internationalem Release)
- Unified mit English Cards über `prepare_card_data.py`

### Card Price Scraper (`card_price_scraper.py`)
- CardMarket EUR-Preise via Selenium
- Automatische Produkt-ID Suche
- Rarity-Version-Auswahl (Low/High)

### City League Scrapers
- **Archetype Scraper** (`city_league_archetype_scraper.py`): Trends & Meta-Share
- **Analysis Scraper** (`city_league_analysis_scraper.py`): Detaillierte Deck-Daten

### Tournament Scraper JH (`tournament_scraper_JH.py`)
- Scraped individuelle Deck-Listen von Limitless TCG
- Extrahiert Archetyp-Namen aus HTML (z.B. "Mega Absol Box")
- Regionals, LAICs, EUICs, NAICs, Worlds, Special Events
- **Competitive Metriken**: deck_inclusion_count, average_count pro Karte
- Intelligente Format-Erkennung (SVI-ASC, BRS-PRE, etc.)
- Incremental Scraping (überspringt bereits gescrapte Turniere)
- Japanische & Expanded Turniere werden automatisch übersprungen

### Current Meta Scraper (`current_meta_analysis_scraper.py`)
- Meta Live (Limitless Online) + Meta Play! (Play! Pokémon Events)
- Karten-Usage pro Archetyp
- Automatische Format-Zuordnung

### Limitless Online Scraper (`limitless_online_scraper.py`)
- Online Ladder Rankings und Trends
- Matchup-Daten (Win/Loss Records)

### Update Sets (`update_sets.py`)
- Aktualisiert `sets.json` mit Set-Reihenfolge
- Basis für Format-Erkennung in allen Scrapern

### Prepare Card Data (`prepare_card_data.py`)
- Merged EN + JP + Preise → `all_cards_merged.json`
- Frontend-ready Output für das Web-Interface

## ⚙️ Konfiguration

### Scraper Settings
Alle Settings-Dateien im Root-Verzeichnis (JSON):
- `all_cards_scraper_settings.json`
- `japanese_cards_scraper_settings.json`
- `card_price_scraper_settings.json`
- `city_league_archetype_settings.json`
- `city_league_analysis_settings.json`
- `current_meta_analysis_settings.json`
- `limitless_online_settings.json`
- `tournament_JH_settings.json`

**Beispiel** (`tournament_JH_settings.json`):
```json
{
    "max_tournaments": 150,
    "delay_between_tournaments": 1.0,
    "max_workers": 5,
    "start_tournament_id": 391,
    "output_file": "tournament_cards_data.csv",
    "format_filter": ["Standard"],
    "tournament_types": [
        "Regional", "Special Event", "LAIC",
        "EUIC", "NAIC", "Worlds", "International", "Championship"
    ],
    "append_mode": true
}
```

## 📝 Entwicklung

### Anforderungen
- Python 3.9+
- Dependencies: `pip install -r requirements.txt`
- Chrome + ChromeDriver (nur für Card Price Scraper)
- Git für GitHub-Integration

### Projekt klonen
```bash
git clone https://github.com/CapTheAvenger/TheDipidis.git
cd TheDipidis
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## 🔄 Workflow

1. **Dashboard starten** → `START_DASHBOARD.bat`
2. **Scraper wählen** → Einzeln oder Batch (Base / Meta / Full)
3. **Daten prüfen** → CSV/JSON-Dateien in `data/`
4. **Web-Interface testen** → `python -m http.server 8000` → `http://localhost:8000`
5. **Zu GitHub pushen** → `PUSH_TO_GITHUB.bat`

## 🧹 Cleanup-Checkliste (sicheres Entfernen)

Wenn Skripte als ungenutzt markiert sind, bitte nicht sofort endgueltig loeschen.

1. Datei zuerst nach `_archive/` oder `archive/` verschieben.
2. Lokalen Lauf pruefen (Dashboard starten, Seite lokal oeffnen, relevante Tests ausfuehren).
3. Auf dynamische Dateinamen achten (z. B. String-Verkettungen bei Dateipfaden).
4. Wenn alles stabil bleibt, Datei im Archiv belassen und erst spaeter final loeschen.

Hinweis:
- Die aktuelle Utility-Archivierung ist in `archive/utils/` dokumentiert.
- Aktive manuelle Utilities sind in `utils/README.md` beschrieben.

### PR-Loesch-Freigabevorlage (Copy/Paste)

Nutze diese Vorlage in PR-Beschreibungen, wenn Dateien entfernt oder archiviert werden:

```md
## Loesch-/Archivierungs-Freigabe

### Kandidaten
- [ ] Datei(en) in `_archive/` oder `archive/` verschoben (nicht hart geloescht)
- [ ] Grund pro Datei kurz dokumentiert

### Sicherheitspruefung
- [ ] Nach statischen Referenzen gesucht (Imports, Dateipfade, Workflow-Aufrufe)
- [ ] Auf dynamische Pfadbildung geprueft (z. B. `"data/cards_" + year + ".json"`)
- [ ] GitHub Actions/Workflows geprueft (`.github/workflows/`)

### Laufzeit-Check
- [ ] Lokalen Server gestartet und Hauptseiten geoeffnet
- [ ] Relevante Skripte/Tests ausgefuehrt
- [ ] Keine Regression sichtbar

### Entscheidung
- [ ] Datei bleibt vorerst im Archiv (empfohlen)
- [ ] Finales Loeschen erst nach Beobachtungszeitraum (z. B. 2-4 Wochen)
```

## 📚 Dokumentation

Detaillierte Dokumentation in separaten Dateien:
- `PROJECT_STRUCTURE.md` — Vollständige Projektstruktur
- `ALL_CARDS_SCRAPER_README.md` — All Cards Scraper
- `JAPANESE_CARDS_SCRAPER_README.md` — Japanese Cards
- `PRICE_SCRAPER_README.md` — Price Scraper (Selenium + CardMarket)
- `FIREBASE_SETUP_GUIDE.md` — Firebase Auth & Firestore Setup
- `FIRESTORE_RULES.md` — Firestore Security Rules
- `R2_SETUP.md` — Cloudflare R2 Pilot
- `GITHUB_ACTIONS_SCHEDULE.md` — Automatisiertes Scraping
- `docs/audit/` — Audit-Phasen 1–4 (Stand des Repos vs. Golden Reference)
- `PERFORMANCE_OPTIMIZATION_PLAN.md` — Performance Plan

## 🐛 Bekannte Issues (alle gelöst)

- ~~Tournament Scraper stoppt nach 16 statt 87 Turnieren~~ ✅ FIXED
- ~~Tournament Scraper extrahiert "unknown" als Archetype~~ ✅ FIXED
- ~~M3 (Japanese set) erscheint in Set-Auswahl~~ ✅ FIXED
- ~~Data Mismatch: Globale Card Counts / Format-gefilterte Deck Counts~~ ✅ FIXED
- ~~GROUP Archetypes: Nur ein Sub-Archetyp Deck Count statt Summe~~ ✅ FIXED
- ~~Energy Sort: Special Energy erschien nach Basic Energy~~ ✅ FIXED

## 📜 Lizenz

Dieses Projekt ist für den privaten Gebrauch. Alle Daten werden von öffentlich zugänglichen Quellen gescraped (Limitless TCG, CardMarket).

## 🙏 Credits

- **Limitless TCG** — Card Database & Tournament Data
- **CardMarket** — EUR Preise
- **Play! Pokémon** — Official Tournament Data
- **Firebase** — Authentication & Cloud Firestore

---

**Version:** 3.0  
**Letztes Update:** März 2026  
**Repository:** https://github.com/CapTheAvenger/TheDipidis
