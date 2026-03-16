# Pokemon TCG Analysis - Clean Structure

## 📁 Projekt-Struktur (Aufgeräumt - Februar 2026)

### 🐍 Python Scraper
- `all_cards_scraper.py` - Komplette Kartendatenbank von Limitless TCG
- `japanese_cards_scraper.py` - Japanische Karten
- `city_league_archetype_scraper.py` - Deck-Archetypen
- `city_league_analysis_scraper.py` - City League Turnier-Analyse
- `current_meta_analysis_scraper.py` - Aktuelles Meta-Analyse
- `limitless_online_scraper.py` - Online-Turnier-Decks

### ⚙️ Settings (eine pro Scraper)
- `all_cards_scraper_settings.json`
- `japanese_cards_scraper_settings.json`
- `city_league_analysis_settings.json`
- `current_meta_analysis_settings.json`
- `tournament_JH_settings.json`
- `formats.json` - Format-Definitionen

### ▶️ Run Scripts (Python-basiert, KEINE .exe mehr)
- `RUN_ALL_CARDS.bat` - Startet All Cards Scraper
- `RUN_JAPANESE_CARDS.bat` - Startet Japanese Cards Scraper  
- `RUN_CITY_LEAGUE_ARCHETYPES.bat` - Startet Archetype Scraper
- `RUN_CITY_LEAGUE_ANALYSIS.bat` - Startet City League Analysis
- `RUN_CURRENT_META.bat` - Startet Current Meta Analysis
- `RUN_LIMITLESS_ONLINE.bat` - Startet Online Tournament Scraper
- `RUN_TOURNAMENT_SCRAPER_JH.bat` - Startet Tournament JH Scraper
- `RUN_ALL_SCRAPERS.bat` - Startet alle Scraper sequenziell

### 🗑️ Reset Scripts
- `RESET_ALL_CARDS.bat` - Setzt All Cards Datenbank zurück
- `RESET_CITY_LEAGUE.bat` - Setzt City League Daten zurück
- `RESET_CURRENT_META.bat` - Setzt Current Meta zurück
- `RESET_TOURNAMENT_JH.bat` - Setzt Tournament Daten zurück

### 📂 Data Ordner
- `data/` - Enthält alle CSV/JSON Datenbank-Dateien

## 🚀 Quick Start

1. **Einzelnen Scraper starten:**
   - Doppelklick auf `RUN_ALL_CARDS.bat` (oder anderen Scraper)
   - Terminal zeigt Fortschritt live an
   
2. **Alle Scraper nacheinander:**
   - Doppelklick auf `RUN_ALL_SCRAPERS.bat`
   
3. **Nach Scraper-Completion:**
   ```bash
   python prepare_card_data.py  # JSON für Frontend generieren
   ```

4. **Browser aktualisieren:**
   - Doppelklick auf `OPEN_VIEWER.bat` oder öffne `landing.html`
   - Hard Refresh: `Ctrl+Shift+R`

## ⚡ Wichtige Änderungen (Februar 2026)

### ✅ **NUTZE Python-Scripts statt .exe:**
- **Warum**: Python-Scripts sind stabiler, Settings-Loading funktioniert perfekt
- **Keine .exe mehr**: dist/ und build/ Ordner gelöscht, *.spec Dateien entfernt
- **Settings im Root**: Alle JSON-Settings bleiben im Hauptordner

### 🧹 **Aufgeräumt:**
- ❌ Gelöscht: ~80 MB (.exe, dist/, build/)
- ❌ Gelöscht: ~40 Test/Fast/Debug Batch-Dateien
- ❌ Gelöscht: Test-HTML, alte Backups, Build-Scripts
- ✅ Behalten: Nur aktive Scraper + eine Settings-Datei pro Scraper

### 🎯 **Finale Struktur:**
- **6 Python Scraper** (.py)
- **6 Settings Dateien** (.json)
- **8 Run Scripts** (.bat - Python-basiert)
- **4 Reset Scripts** (.bat)
- **1 Data Ordner** (CSV/JSON)

## 📝 Nächste Schritte

**Für Daily/Weekly Automation:**
Später können spezielle Batch-Dateien erstellt werden:
- `RUN_DAILY_UPDATE.bat` - Tägliche Updates (All Cards + Current Meta)
- `RUN_WEEKLY_FULL.bat` - Wöchentlicher Full-Scrape aller Datenquellen

**Aktuell läuft:** All Cards Scraper im Terminal-Fenster
**Nach Completion:** `python prepare_card_data.py` + Browser hard refresh

---
**Stand:** Februar 2026 - Clean Python-basierte Struktur
