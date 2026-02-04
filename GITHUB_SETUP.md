# 🚀 GitHub Setup Anleitung

Dieses Projekt ist vollständig vorbereitet für automatische tägliche Updates auf GitHub!

## 📋 Was wurde eingerichtet:

✅ **Settings-Dateien** (alle konfiguriert):
- `City_League_Archetype_Scraper/city_league_archetype_settings.json`
- `Limitless_Online_Scraper/limitless_online_settings.json`
- `Unified_Card_Scraper/unified_card_settings.json`

✅ **.gitignore** (erstellt):
- Ignoriert alte Build-Dateien
- Behält wichtige CSV-Outputs: 
  - `city_league_archetypes_comparison.csv`
  - `limitless_online_decks_comparison.csv`
  - `limitless_online_decks_comparison.html`

✅ **GitHub Actions Workflows** (.github/workflows/):
- `daily-scrape.yml` - Läuft täglich um **6:00 UTC**
- `deploy-pages.yml` - Deployed zu GitHub Pages automatisch

## 🔧 Lokale Git-Einrichtung (auf Windows):

### Option 1: GitHub Desktop verwenden
1. Lade GitHub Desktop herunter: https://desktop.github.com/
2. Öffne GitHub Desktop
3. Gehe zu "File" → "Clone Repository"
4. Wähle: `captheavenger/HausiTCG`
5. Wähle als Pfad: `C:\Users\haush\OneDrive\Desktop\Hausi Scrapen`
6. Klick "Clone"

### Option 2: Git Bash (mit Git installieren)
1. Installiere Git: https://git-scm.com/download/win
2. Öffne Git Bash
3. Navigiere zum Ordner: `cd /c/Users/haush/OneDrive/Desktop/"Hausi Scrapen"`
4. Klone das Repository:
```bash
git clone https://github.com/captheavenger/HausiTCG.git .
```

### Option 3: Manuell hochladen über GitHub Web
1. Gehe zu: https://github.com/captheavenger/HausiTCG
2. Klick "Add file" → "Upload files"
3. Lade folgende Ordner/Dateien hoch:
   - Alle Scraper-Ordner (`City_League_Scraper/`, etc.)
   - `.github/` Ordner
   - `.gitignore`
   - Alle `.json` Settings-Dateien
   - Alle `.py` Python-Dateien

## ✅ Was passiert automatisch auf GitHub:

### Täglich um 6:00 UTC:
1. **City_League_Archetype_Scraper** läuft
   - Aktualisiert: `city_league_archetypes_comparison.csv`
2. **Limitless_Online_Scraper** läuft
   - Aktualisiert: `limitless_online_decks_comparison.csv`
3. **Unified_Card_Scraper** läuft
   - Aktualisiert: `unified_card_data.csv` mit neuen Karten & URLs
4. **Commit & Push** - Alle Änderungen werden automatisch committed und gepusht
5. **GitHub Pages** wird aktualisiert mit neuem `deck_viewer.html`

## 📊 Output-Dateien die aktualisiert werden:

```
City_League_Archetype_Scraper/
├── city_league_archetypes_comparison.csv  ← WIRD AKTUALISIERT
├── city_league_archetypes_comparison.html

Limitless_Online_Scraper/
├── limitless_online_decks_comparison.csv  ← WIRD AKTUALISIERT
├── limitless_online_decks_comparison.html

Unified_Card_Scraper/
├── unified_card_data.csv                  ← WIRD AKTUALISIERT (mit Limitless CDN URLs!)
├── deck_viewer.html                       ← WIRD ZU GITHUB PAGES DEPLOYED
```

## 🌐 GitHub Pages URL:
https://captheavenger.github.io/HausiTCG/deck_viewer.html

## ⚠️ Wichtig:

- Das `.gitignore` verhindert, dass alte Build-Dateien und temporäre CSVs hochgeladen werden
- Nur die **wichtigen Outputs** (comparison CSVs) werden tracked
- Die **EXE-Dateien sollten NICHT auf GitHub sein** (zu große Binärdateien)
  - Wenn doch nötig: Nutze GitHub Releases statt Git LFS

## 🐛 Falls etwas nicht funktioniert:

1. Überprüfe GitHub Actions: https://github.com/captheavenger/HausiTCG/actions
2. Schau nach Fehlern im Workflow Log
3. Stelle sicher dass `github_token.txt` vorhanden ist (wenn nötig für API-Zugriff)

## 📝 Manueller Test lokal:

```bash
cd "C:\Users\haush\OneDrive\Desktop\Hausi Scrapen\Unified_Card_Scraper"
python unified_card_scraper.py
```

Viel Erfolg! 🎉
