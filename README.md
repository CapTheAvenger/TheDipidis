# 🎴 HausiTCG - Pokemon TCG Analysis System

Komplettes Pokemon TCG Scraping & Analysis System mit interaktiver Web-Oberfläche

## 🌐 Live Demo
**GitHub Pages:** https://captheavenger.github.io/HausiTCG/

## 📁 Projekt-Struktur

```
HausiTCG/
├── 🐍 Python Scraper (21 Scripts)
│   ├── all_cards_scraper.py           # Alle Karten (Limitless TCG)
│   ├── japanese_cards_scraper.py      # Japanische Karten
│   ├── card_price_scraper.py          # CardMarket Preise
│   ├── city_league_archetype_scraper.py  # City League Archetypen
│   ├── city_league_analysis_scraper.py   # City League Deck-Analyse
│   ├── current_meta_analysis_scraper.py  # Current Meta Karten
│   ├── limitless_online_scraper.py    # Limitless Online Rankings
│   ├── tournament_scraper_JH.py       # Tournament Data (Regionals/LAICs/etc.)
│   ├── set_list_scraper.py            # Set-Liste & Mapping
│   └── ... (Utility Scripts)
│
├── 📊 Data Output (data/)
│   ├── all_cards_database.json        # Alle englischen Karten
│   ├── all_cards_merged.json          # English + Japanese + Preise
│   ├── japanese_cards_database.json   # Japanische Karten
│   ├── city_league_analysis.csv       # City League Deck-Daten
│   ├── city_league_archetypes.csv     # Archetyp-Statistiken
│   ├── current_meta_card_data.csv     # Meta Karten-Usage
│   ├── limitless_online_decks.csv     # Online Rankings
│   ├── tournament_cards_data_*.csv    # Tournament Daten
│   └── ... (HTML Reports & Comparison Files)
│
├── 🚀 Quick-Start Scripts (20 BAT-Dateien)
│   ├── RUN_ALL_SCRAPERS.bat          # Alle 9 Scraper parallel
│   ├── RUN_ALL_CARDS.bat             # Nur Karten-Scraper
│   ├── RUN_TOURNAMENT_SCRAPER_JH.bat # Nur Tournament Scraper
│   ├── PUSH_TO_GITHUB.bat            # Commit & Push zu GitHub
│   └── ... (Individual Scraper Launchers)
│
├── 🌐 Web Interface
│   └── index.html                     # Hauptseite mit 6 Tabs:
│       ├── City League Meta           # Archetyp-Entwicklung
│       ├── City League Analysis       # Detaillierte Deck-Analyse
│       ├── Current Meta               # Online Meta Rankings
│       ├── Current Meta Analysis      # Meta Karten-Usage
│       ├── Past Meta                  # Tournament Daten
│       └── Cards                      # Karten-Datenbank Browser
│
└── 📖 Dokumentation (12 MD-Dateien)
    ├── README.md                      # Diese Datei
    ├── PROJECT_STRUCTURE.md           # Detaillierte Struktur
    ├── DATA_DIRECTORY_STRUCTURE.md    # Daten-Übersicht
    └── ... (Scraper-spezifische READMEs)
```

## 🚀 Schnellstart

### 1️⃣ Einmalige Einrichtung
```powershell
# Python Virtual Environment erstellen (falls noch nicht vorhanden)
python -m venv .venv

# Aktivieren
.venv\Scripts\Activate.ps1

# Dependencies installieren (keine externe Abhängigkeiten! Nur Python Standard Library)
# Scraper nutzen nur: urllib, csv, json, re, time
```

### 2️⃣ Alle Scraper ausführen
Doppelklick auf: **`RUN_ALL_SCRAPERS.bat`**
- Startet 9 Scraper parallel in separaten Fenstern
- Dauert ca. 30-60 Minuten (abhängig von Datenmenge)
- Alle Scraper laufen unabhängig - keine Wartezeit!

**Scraper:**
1. All Cards Database (Limitless TCG)
2. Japanese Cards (4 neueste Sets)
3. Card Prices (CardMarket API)
4. City League Archetypes
5. Limitless Online Rankings
6. Tournament Scraper (Regionals/LAICs/etc.)
7. City League Analysis
8. Current Meta Analysis
9. Set List Scraper

### 3️⃣ Web-Interface öffnen
```powershell
# Lokaler Server (wenn benötigt)
python -m http.server 8000

# Dann öffnen: http://localhost:8000/index.html
```

**Oder direkt mit VSCode Tasks:**
- `Start Local HTTP Server` (Port 8000, data-Ordner)
- `Start HTTP Server Root` (Port 8000, Root)

### 4️⃣ Zu GitHub pushen
Doppelklick auf: **`PUSH_TO_GITHUB.bat`**
- Zeigt Git Status
- Fügt alle wichtigen Dateien hinzu
- Fragt nach Commit-Message
- Pusht zu GitHub Repository

## 📊 Features

### 🌐 Web-Interface (index.html)
**6 interaktive Tabs mit Live-Daten:**

#### 1. City League Meta 🇯🇵
- Übersicht aller Japan City League Turniere
- Archetype-Entwicklung und Trends
- Vergleich alter vs. neuer Daten
- Sortierbare Tabellen mit Statistiken

#### 2. City League Analysis 📊
- Detaillierte Deck-Analysen mit interaktiven Filtern
- **Datum-Filter**: Turniere nach Zeitraum filtern
- **Deck-Auswahl**: 30+ Archetypen analysieren
- **Karten-Filter**: Pokemon, Trainer, Energie separat
- **Rarity-Switcher**: Verschiedene Karten-Versionen
- **Image View**: Alle Deck-Karten visuell anzeigen
- **CardMarket Integration**: EUR-Preise & Links

#### 3. Current Meta 🎮
- Aktuelle Meta-Übersicht (Limitless Online)
- Top-Decks und Winrates
- Meta-Share Analysen
- Matchup-Tabellen

#### 4. Current Meta Analysis 📈
- Deck-Builder mit Drag & Drop
- Karten-Usage Statistiken
- Auto-Counter für Deck-Zusammenstellung
- Rarity-Switcher mit internationalen Prints

#### 5. Past Meta 🏆
- Tournament Daten (Regionals, LAICs, EUICs, NAICs, Worlds)
- Archetype-Performance über Zeit
- Deck-Listen von Top-Platzierungen

#### 6. Cards 🎴
- **NEUE FEATURES:**
- ✨ Vollständige Karten-Datenbank (21,111 Karten)
- ✨ Multi-Select Filter:
  - Meta/Format (Total, All Playables, City League, SVI-PFL)
  - Set (sortiert neueste→älteste, nur englische Sets)
  - Rarity (17 Arten: SAR, IR, SIR, UR, etc.)
  - Category (Pokemon nach Typ, Trainer-Karten)
- ✨ Autocomplete-Suche mit Thumbnails
- ✨ CardMarket Preis-Display
- ✨ English-Only Filtering

### 🐍 Scraper-System

#### All Cards Scraper
- Scraped alle englischen Karten von Limitless TCG
- Automatische Set-Erkennung
- Incremental Updates (nur neue Karten)
- 21,000+ Karten mit Bildern

#### Japanese Cards Scraper
- Neueste 4 japanische Sets
- Unified mit English Cards
- 1,115+ japanische Karten

#### Card Price Scraper
- CardMarket EUR-Preise
- Automatische Produkt-ID Suche
- Price History Tracking

#### City League Scraper
- Japan City League Turniere
- Archetype Statistiken
- Performance Tracking
- HTML Comparison Reports

#### Tournament Scraper JH
- **NEU: Deck Name Extraction!**
- Scraped individuelle Deck-Listen
- Extrahiert Archetyp aus HTML (z.B. "Mega Absol Box")
- Regionals, LAICs, EUICs, NAICs, Worlds
- Gruppierung nach Deck-Archetyp
- **Intelligente Turnier-Filterung:**
  - Sammelt ALLE Turniere bis ID 391
  - Filtert nach Type (Regional, Special Event, etc.)
  - Wendet max_tournaments NACH Filterung an
  - Jetzt korrekte Anzahl (87 Turniere statt 16)

#### Current Meta Scraper
- Meta Live (Limitless Online)
- Meta Play! (Play! Pokemon Events)
- Karten-Usage pro Archetyp
- Automatische Format-Zuordnung

#### Set List Scraper
- Aktualisiert pokemon_sets_mapping.csv
- Set-Reihenfolge (neueste zuerst)
- English-only Sets

## ⚙️ Konfiguration

### Scraper Settings
Alle Settings-Dateien im Root-Verzeichnis:
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
    "max_tournaments": 100,
    "start_tournament_id": 391,
    "tournament_types": [
        "Regional", "Special Event", "LAIC", 
        "EUIC", "NAIC", "Worlds", "International"
    ],
    "append_mode": false
}
```

## 🔧 Utility Scripts

### Maintenance
- `FIX_CITY_LEAGUE_DUPLICATES.bat` - Entfernt Duplikate
- `PREPARE_CARD_DATA.bat` - Bereitet Karten-Daten vor
- `REGENERATE_CITY_LEAGUE_COMPARISON.bat` - Neu-generiert Vergleich
- `REGENERATE_CITY_LEAGUE_STATS.bat` - Neu-generiert Statistiken

### Reset Scripts
- `RESET_ALL_CARDS.bat` - Reset Karten-Datenbank
- `RESET_CITY_LEAGUE.bat` - Reset City League Daten
- `RESET_CURRENT_META.bat` - Reset Current Meta
- `RESET_TOURNAMENT_JH.bat` - Reset Tournament Daten

## 📝 Entwicklung

### Anforderungen
- Python 3.9+ (nur Standard Library!)
- Keine externen Dependencies benötigt
- Git für GitHub-Integration

### Projekt klonen
```bash
git clone https://github.com/CapTheAvenger/HausiTCG.git
cd HausiTCG
```

### Virtual Environment
```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

## 🔄 Workflow

1. **Scraper ausführen** → `RUN_ALL_SCRAPERS.bat`
2. **Daten prüfen** → CSV/JSON-Dateien in `data/`
3. **Web-Interface testen** → `index.html` im Browser
4. **Zu GitHub pushen** → `PUSH_TO_GITHUB.bat`

## 📚 Dokumentation

Detaillierte Dokumentation in separaten Dateien:
- `PROJECT_STRUCTURE.md` - Vollständige Projektstruktur
- `DATA_DIRECTORY_STRUCTURE.md` - Daten-Übersicht
- `ALL_CARDS_SCRAPER_README.md` - All Cards Scraper
- `JAPANESE_CARDS_SCRAPER_README.md` - Japanese Cards
- `PRICE_SCRAPER_README.md` - Price Scraper
- `SET_LIST_SCRAPER_README.md` - Set List Scraper
- `CARD_DATA_SYSTEM.md` - Card Data Manager System
- `CITY_LEAGUE_ADDITIONAL_TOURNAMENTS.md` - City League Info
- `CARDMARKET_UI_CHANGELOG.md` - UI Changelog
- `TOURNAMENT_META_IMPLEMENTATION.md` - Tournament Meta

## 🐛 Bekannte Issues

- ~~Tournament Scraper stoppt nach 16 statt 87 Turnieren~~ ✅ **FIXED!**
- ~~Tournament Scraper extrahiert "unknown" als Archetype~~ ✅ **FIXED!**
- ~~M3 (Japanese set) erscheint in Set-Auswahl~~ ✅ **FIXED!**

## 📜 Lizenz

Dieses Projekt ist für den privaten Gebrauch. Alle Daten werden von öffentlich zugänglichen Quellen gescraped (Limitless TCG, CardMarket).

## 🙏 Credits

- **Limitless TCG** - Card Database & Tournament Data
- **CardMarket** - EUR Preise
- **Play! Pokemon** - Official Tournament Data

---

**Version:** 2.0  
**Letztes Update:** Februar 2026  
**Repository:** https://github.com/CapTheAvenger/HausiTCG
