# Data Directory - Einheitliche Struktur

## Problem (vorher)
Datenbanken wurden an **zwei Orten** erstellt:
- ✅ `data/` (Haupt-Ordner, von HTML geladen)
- ❌ `dist/data/` (Duplikat, wenn EXE aus dist/ gestartet)

## Lösung (jetzt)

### Einheitlicher Speicherort: `data/`

**Alle Scraper schreiben in:** `data/`  
**Alle HTML-Dateien laden von:** `data/`  
**Keine Duplikate mehr!**

---

## Wie funktioniert es?

### 1. Python-Skripte (aus Root)
Wenn du BAT-Dateien im Root startest:
- `RUN_ALL_CARDS_SCRAPER_CURRENT_META.bat`
- `RUN_ALL_CARDS_SCRAPER_TEST.bat`

→ Working Directory = Root  
→ Scraper speichert in `data/` ✓

### 2. EXE-Dateien (aus dist/)
Wenn du die EXE aus `dist/` startest:
- `dist/RUN_ALL_CARDS_SCRAPER.bat`

→ BAT macht `cd ..` (wechselt zu Root)  
→ Working Directory = Root  
→ Scraper speichert in `data/` ✓

---

## Cleanup durchführen

Falls du bereits Duplikate in `dist/data/` hast:

```batch
CLEANUP_DATA_DUPLICATES.bat
```

Das Skript:
1. Löscht `dist/data/` komplett
2. Behält `data/` (Haupt-Datenbank)

---

## Verzeichnis-Struktur

```
Hausi´s Pokemon TCG Analysis/
├── data/                          ← EINZIGER Datenbank-Ordner
│   ├── all_cards_database.csv
│   ├── japanese_cards_database.csv
│   ├── city_league_analysis.csv
│   └── ...
├── dist/                          ← Nur EXE-Dateien
│   ├── all_cards_scraper.exe
│   ├── japanese_cards_scraper.exe
│   ├── *_settings.json            ← Settings für EXEs
│   ├── logs/                      ← Log-Dateien
│   └── RUN_ALL_CARDS_SCRAPER.bat  ← Startet EXE (läuft aus Root!)
├── landing.html                   ← Lädt von ./data/
├── RUN_ALL_CARDS_SCRAPER_CURRENT_META.bat
├── RUN_ALL_CARDS_SCRAPER_TEST.bat
└── ...
```

---

## Was wurde geändert?

### 1. dist/RUN_ALL_CARDS_SCRAPER.bat
```batch
REM Change to parent directory (project root)
cd /d "%~dp0.."
```
→ EXE läuft jetzt aus Root-Kontext

### 2. Alle Root BAT-Dateien
Haben bereits `pause` am Ende → Terminal schließt nicht automatisch

### 3. Cleanup-Skript
Neues Skript: `CLEANUP_DATA_DUPLICATES.bat`  
→ Entfernt `dist/data/` Duplikate

---

## Empfehlung

### Für normale Nutzung (Entwicklung):
Nutze BAT-Dateien im **Root**:
- `RUN_ALL_CARDS_SCRAPER_CURRENT_META.bat` (Python)
- `RUN_ALL_CARDS_SCRAPER_TEST.bat` (Python)

### Für Deployment/Testing (EXE):
Nutze BAT-Dateien in **dist/**:
- `dist/RUN_ALL_CARDS_SCRAPER.bat` (EXE)

**Beide** schreiben jetzt in den gleichen Ordner: `data/` ✓

---

## Häufige Fragen

**Q: Warum gibt es dist/ überhaupt?**  
A: Für GitHub Actions, Deployment und EXE-Verteilung. Die EXEs sind portabel.

**Q: Wohin gehen die Logs?**  
A: `dist/logs/` (unabhängig davon ob EXE oder Python)

**Q: Was ist mit Settings-Dateien?**  
A: 
- Root: `all_cards_scraper_settings.json` (für Python)
- dist/: `all_cards_scraper_settings.json` (für EXE)
- Beide können unterschiedlich sein!

**Q: Muss ich dist/data/ manuell löschen?**  
A: Nein, nutze `CLEANUP_DATA_DUPLICATES.bat`

---

## Zusammenfassung

✅ **Ein Ort für Daten:** `data/`  
✅ **HTML lädt korrekt:** `./data/`  
✅ **Keine Duplikate mehr**  
✅ **Terminal bleibt offen:** `pause` am Ende aller BATs  
✅ **Cleanup-Tool vorhanden:** `CLEANUP_DATA_DUPLICATES.bat`
