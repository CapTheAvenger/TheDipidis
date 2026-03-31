# 🎴 TheDipidis - Pokemon TCG Analysis System

Komplettes Pokemon TCG Scraping & Analysis System mit interaktiver Web-Oberfläche, Deck Builder, Proxy Printer, Playtester und Firebase-User-Profilen.

## 🌐 Live Demo
**GitHub Pages:** https://captheavenger.github.io/TheDipidis/

## 📁 Projekt-Struktur

```
TheDipidis/
├── 🐍 Python Scraper & Utilities (13 Scripts)
│   ├── all_cards_scraper.py              # Alle EN Karten (Limitless TCG)
│   ├── japanese_cards_scraper.py         # Japanische Karten
│   ├── card_price_scraper.py             # CardMarket Preise (Selenium)
│   ├── city_league_archetype_scraper.py  # City League Archetypen (JP)
│   ├── city_league_analysis_scraper.py   # City League Deck-Analyse (JP)
│   ├── current_meta_analysis_scraper.py  # Current Meta Karten
│   ├── limitless_online_scraper.py       # Limitless Online Rankings
│   ├── tournament_scraper_JH.py          # Tournament Data (Regionals etc.)
│   ├── update_sets.py                    # Set-Liste & Mapping
│   ├── prepare_card_data.py              # Merge EN+JP+Preise → merged JSON
│   ├── card_scraper_shared.py            # Shared Utilities (CardDB etc.)
│   ├── price_proxy_server.py             # Live-Preis-Proxy (optional)
│   └── start_scraper_dashboard.py        # Interaktives Dashboard-Menü
│
├── 📊 Data Output (data/)
│   ├── all_cards_database.json           # Alle englischen Karten
│   ├── all_cards_merged.json             # EN + JP + Preise (merged)
│   ├── japanese_cards_database.json      # Japanische Karten
│   ├── city_league_analysis.csv          # City League Deck-Daten
│   ├── city_league_archetypes.csv        # Archetyp-Statistiken
│   ├── limitless_online_decks.csv        # Online Rankings + Matchups
│   ├── tournament_cards_data_cards.csv   # Tournament Karten-Daten
│   ├── tournament_cards_data_overview.csv# Tournament Übersicht
│   ├── price_data.csv                    # CardMarket Preise
│   ├── sets.json                         # Set-Reihenfolge
│   ├── formats_catalog.json              # Bekannte Formate
│   └── ... (Logs, HTML Reports, Comparison Files)
│
├── 🌐 Web Interface
│   ├── index.html                        # Hauptseite mit 10 Tabs
│   ├── js/
│   │   ├── app.js                        # Haupt-App (~16.000 Zeilen)
│   │   ├── playtester.js                 # Playtester Simulator
│   │   ├── playtester-mobile.js          # Playtester Mobile Support
│   │   ├── draw-simulator.js             # Draw Simulator
│   │   ├── firebase-auth.js              # Firebase Authentication
│   │   ├── firebase-collection.js        # Collection/Decks/Wishlist
│   │   ├── firebase-config.js            # Firebase Config
│   │   ├── firebase-credentials.js       # Firebase Credentials
│   │   ├── firebase-globals.js           # Firebase Globals
│   │   ├── firebase-multiplayer.js       # Multiplayer Playtester
│   │   └── auth-ui-helpers.js            # Auth UI Helpers
│   └── css/
│       ├── styles.css                    # Haupt-Styles
│       └── auth-styles.css               # Auth Modal Styles
│
├── 🚀 Quick-Start
│   ├── START_DASHBOARD.bat               # Interaktives Scraper-Menü
│   └── PUSH_TO_GITHUB.bat               # Commit & Push zu GitHub
│
└── 📖 Dokumentation (16 MD-Dateien)
    ├── README.md                         # Diese Datei
    ├── PROJECT_STRUCTURE.md              # Detaillierte Struktur
    ├── DATA_DIRECTORY_STRUCTURE.md       # Daten-Übersicht
    └── ... (Scraper-spezifische READMEs)
```

## 🚀 Schnellstart

### 1️⃣ Einmalige Einrichtung
```powershell
# Repository klonen
git clone https://github.com/CapTheAvenger/TheDipidis.git
cd TheDipidis

# Python Virtual Environment erstellen
python -m venv .venv

# Aktivieren
.venv\Scripts\Activate.ps1

# Dependencies installieren
pip install -r requirements.txt
```

**Dependencies** (siehe `requirements.txt`):
- `cloudscraper` + `beautifulsoup4` — für die meisten Scraper
- `selenium` + `selenium-stealth` — für Card Price Scraper (CardMarket)
- `lxml` — HTML Parser
- `pandas` — Datenverarbeitung

### 2️⃣ Scraper ausführen
Doppelklick auf: **`START_DASHBOARD.bat`**

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

### 3️⃣ Web-Interface öffnen
```powershell
# Lokaler Server starten
python -m http.server 8000

# Dann öffnen: http://localhost:8000/index.html
```

**Oder direkt mit VSCode Tasks:**
- `Start HTTP Server Root` (Port 8000)

### 4️⃣ Zu GitHub pushen
Doppelklick auf: **`PUSH_TO_GITHUB.bat`**
- Zeigt Git Status
- Fügt alle wichtigen Dateien hinzu
- Fragt nach Commit-Message
- Pusht zu GitHub Repository

## 📊 Web-Interface — 10 Tabs

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

### 8. ⚔️ Playtester Sandbox
- Vollständiger 2-Spieler Pokémon TCG Simulator im Browser
- **Deck laden**: Paste & Load, aus Deck Builder, oder aus My Decks
- **Board Zones**: Active, Bench (5 Slots), Discard, Prize Cards, Stadium, Hand
- **Controls**: Draw, Shuffle, New Game, Judge/Iono, Undo, Coin Flip
- **Stepper ＋/－**: Damage Counter, Energy, Prize Count
- **Damage Modifier**: Buff Counter (z.B. +30 von Choice Belt)
- **/attach Command**: Energy aus Hand an Feld-Zone attachen
- **Drag & Drop**: Karten zwischen allen Zonen verschieben

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
- `DATA_DIRECTORY_STRUCTURE.md` — Daten-Übersicht
- `ALL_CARDS_SCRAPER_README.md` — All Cards Scraper
- `JAPANESE_CARDS_SCRAPER_README.md` — Japanese Cards
- `PRICE_SCRAPER_README.md` — Price Scraper (Selenium + CardMarket)
- `CARD_DATA_SYSTEM.md` — Card Data Manager System
- `TOURNAMENT_META_IMPLEMENTATION.md` — Tournament Meta Perioden
- `CITY_LEAGUE_ADDITIONAL_TOURNAMENTS.md` — City League Turnier-IDs
- `FIREBASE_SETUP_GUIDE.md` — Firebase Auth & Firestore Setup
- `MULTIPLAYER_INTEGRATION_GUIDE.md` — Multiplayer Playtester
- `LIVE_PRICE_SYSTEM.md` — Live-Preis-Proxy
- `GITHUB_ACTIONS_SCHEDULE.md` — Automatisiertes Scraping
- `CARDMARKET_UI_CHANGELOG.md` — UI Changelog
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
