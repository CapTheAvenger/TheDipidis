# HAUSI SCRAPEN - PROJEKT ÜBERSICHT

## Aktive Scraper (4 Stück)

### 1. City League Archetype Scraper
**Zweck:** Scrapt City League Daten mit Archetype-Zuordnung (Japan Region)
**Ordner:** `City_League_Archetype_Scraper/`
**EXE:** `city_league_archetype_scraper.exe`
**Settings:** `city_league_archetype_settings.json`
**Output:** `city_league_archetypes.csv`

### 2. City League Scraper  
**Zweck:** Scrapt allgemeine City League Daten und Deck-Listen
**Ordner:** `City_League_Scraper/`
**EXE:** `city_league_scraper.exe`
**Settings:** `city_league_settings.json`
**Output:** `city_league_data_overview.csv`, `city_league_data_deck_stats.csv`

### 3. Limitless Scraper
**Zweck:** Scrapt Deck-Daten von play.limitlesstcg.com
**Ordner:** `Limitless_Scraper/`
**EXE:** `limitless_scraper.exe`
**Settings:** `limitless_settings.json`
**Output:** `limitless_deck_data_overview.csv`

### 4. Tournament Scraper JH
**Zweck:** Scrapt Tournament Daten mit Karten-Details und Format/Meta
**Ordner:** `Tournament_Scraper_JH/`
**EXE:** `tournament_scraper_JH.exe`
**Settings:** `tournament_JH_settings.json`
**Output:** `tournament_cards_data_overview.csv`

## Karten-Datenbank Update

### Manuelles Update (alle 3-4 Monate)
1. Download von Limitless TCG:
   - **English:** `Alle Karten.txt` speichern in `source/`
   - **Japanese:** `Japanische extra Karten.txt` speichern in `source/`
   
2. Konvertierung ausführen:
   - Doppelklick auf `source/CONVERT_KARTEN.bat`
   - Erstellt: `source/all_cards_database.csv` (8788+ Karten)
   
3. CSV wird automatisch von allen Scrapern verwendet via `card_type_lookup.py`

## Source Files

**Aktive Python Scripts:**
- `city_league_archetype_scraper.py`
- `city_league_scraper.py`
- `limitless_scraper.py`
- `tournament_scraper_JH.py`
- `card_type_lookup.py` (Shared Library)
- `convert_alle_karten.py` (Karten-Konverter)

**Daten-Dateien:**
- `Alle Karten.txt` (English Cards - manuell updaten)
- `Japanische extra Karten.txt` (Japanese Cards - manuell updaten)
- `all_cards_database.csv` (Generiert von convert_alle_karten.py)
- `trainer_check.txt` (Trainer/Energy Karten Liste)

**Settings:**
- `city_league_archetype_settings.json`
- `city_league_settings.json`
- `limitless_settings.json`
- `tournament_JH_settings.json`

**Spec Files für PyInstaller:**
- `city_league_archetype_scraper.spec`
- `City_League_Scraper.spec`
- `limitless_scraper.spec`
- `tournament_scraper_JH.spec`

## Workflow

### Regelmäßige Nutzung (wöchentlich/täglich)
1. EXE in jeweiligem Ordner doppelklicken
2. Settings ggf. anpassen (Datum, Filter, etc.)
3. Warten bis Scraper fertig ist
4. CSV-Datei verwenden

### Karten-Update (alle 3-4 Monate bei neuen Sets)
1. Neue `Alle Karten.txt` und `Japanische extra Karten.txt` von Limitless laden
2. In `source/` Ordner speichern (alte überschreiben)
3. `CONVERT_KARTEN.bat` ausführen
4. Fertig - alle Scraper nutzen automatisch neue Daten

## Build-Prozess (für Updates)

```bash
cd source
pyinstaller city_league_archetype_scraper.spec
pyinstaller City_League_Scraper.spec
pyinstaller limitless_scraper.spec
pyinstaller tournament_scraper_JH.spec
```

EXEs landen in:
- `build/city_league_archetype_scraper/`
- `build/City_League_Scraper/`
- `build/limitless_scraper/`
- `build/tournament_scraper_JH/`

Dann jeweils kopieren in Zielordner.

## Technische Details

- **Python Version:** 3.14.2
- **Virtual Environment:** `.venv` im Root
- **Encoding:** UTF-8-sig für CSV (Excel-kompatibel)
- **CSV Delimiter:** Semikolon (;)
- **Dependencies:** urllib (built-in), csv, json, re, os, sys, time

## Hinweise

- Alle Scraper nutzen `card_type_lookup.py` zur Karten-Validierung
- CSV wird bevorzugt gelesen, Fallback sind .txt Dateien
- Settings-Dateien müssen im selben Ordner wie EXE liegen
- Output-CSV wird im selben Ordner erstellt
