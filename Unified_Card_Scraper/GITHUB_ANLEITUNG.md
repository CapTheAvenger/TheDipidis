# Website auf GitHub hochladen - Anleitung

## 📌 Empfehlung: GitHub Pages

**Am einfachsten und vollständig funktionsfähig!**

### Schritt 1: Repository erstellen
1. Gehe zu https://github.com/new
2. Name: `pokemon-deck-viewer` (oder beliebig)
3. Public Repository
4. "Create repository" klicken

### Schritt 2: Dateien hochladen
Lade folgende Dateien hoch:
```
deck_viewer.html
unified_card_data.csv
city_league_archetypes_comparison.csv
limitless_online_decks_comparison.csv
```

**So geht's:**
- "Add file" → "Upload files"
- Alle 4 Dateien gleichzeitig hochziehen
- Commit Message: "Initial upload"
- "Commit changes"

### Schritt 3: GitHub Pages aktivieren
1. Repository Settings (Zahnrad-Symbol)
2. Linkes Menü → "Pages"
3. Source: `main` branch
4. Ordner: `/ (root)`
5. "Save"

### Schritt 4: Fertig! 🎉
Nach ~1 Minute ist die Website erreichbar unter:
```
https://DEIN-USERNAME.github.io/pokemon-deck-viewer/deck_viewer.html
```

**Von überall nutzbar!** Auch auf Handy/Tablet.

---

## 🔄 Daten aktualisieren

### Manuell (einfach)
1. Neue CSVs lokal erstellen (Scraper laufen lassen)
2. GitHub Repository öffnen
3. Auf die Datei klicken (z.B. `unified_card_data.csv`)
4. Stift-Symbol klicken ("Edit this file")
5. Inhalt ersetzen, "Commit changes"

### Automatisch mit Batch-Datei
Ich erstelle dir eine `UPDATE_GITHUB.bat`:

```batch
@echo off
echo Aktualisiere GitHub Repository...

cd /d "%~dp0"

REM Prüfe ob git vorhanden
git --version >nul 2>&1
if errorlevel 1 (
    echo Git ist nicht installiert!
    echo Installiere Git von: https://git-scm.com/download/win
    pause
    exit /b
)

REM Kopiere aktuelle Dateien
copy /Y "unified_card_data.csv" "C:\Path\To\Your\GitHub\Repo\"
copy /Y "..\City_League_Archetype_Scraper\city_league_archetypes_comparison.csv" "C:\Path\To\Your\GitHub\Repo\"
copy /Y "..\Limitless_Online_Scraper\limitless_online_decks_comparison.csv" "C:\Path\To\Your\GitHub\Repo\"

REM Git commit & push
cd "C:\Path\To\Your\GitHub\Repo"
git add *.csv
git commit -m "Update data - %date% %time%"
git push

echo Fertig! Website wird in 1-2 Minuten aktualisiert.
pause
```

**Anpassen:**
- Ersetze `C:\Path\To\Your\GitHub\Repo\` mit deinem lokalen Git-Repository-Pfad

---

## 📱 Zugriff von unterwegs

### Desktop/Laptop
Einfach die GitHub Pages URL öffnen:
```
https://DEIN-USERNAME.github.io/pokemon-deck-viewer/deck_viewer.html
```

### Handy/Tablet
1. Gleiche URL öffnen
2. Als Lesezeichen/Homescreen-Icon speichern
3. Funktioniert wie eine App!

**Tipp:** Website ist responsive und funktioniert auf allen Geräten

---

## ⚙️ Alternative: GitHub Gist

**Nur wenn du GitHub Pages nicht nutzen willst**

### Vorteile
- Schneller Setup (keine Repository-Erstellung)
- Direkt bearbeitbar im Browser

### Nachteile
- CSV-Dateien als separate Gists → komplizierter zu verwalten
- Nicht so schön URL wie GitHub Pages

### Setup
1. Gehe zu https://gist.github.com
2. Dateiname: `deck_viewer.html`
3. Inhalt einfügen
4. "Create public gist"
5. Gleich 3x wiederholen für die CSVs

**Problem:** Du müsstest die Raw-URLs der CSV-Gists in der HTML hart-codieren

**Daher: Nutze lieber GitHub Pages! 👆**

---

## 🔒 Private Website (optional)

Wenn die Daten nicht öffentlich sein sollen:

### Option 1: Private Repository + GitHub Pages
- Repository als "Private" erstellen
- GitHub Pages funktioniert trotzdem
- Nur Personen mit Zugriff können es sehen

### Option 2: Passwortschutz
Ich kann ein Login-System in die HTML einbauen (nur mit richtigem Passwort nutzbar)

---

## 💡 Tipps

### Browser-Cache
Wenn Daten nicht aktualisieren:
- Strg + F5 (Hard Refresh)
- Oder Cache leeren

### Automatische Updates
Mit GitHub Actions kannst du die Scraper automatisch laufen lassen (fortgeschritten)

### Backup
GitHub ist automatisch dein Backup für alle Daten!

---

## ❓ Probleme?

**"404 - Not Found"**
- Warte 1-2 Minuten nach GitHub Pages Aktivierung
- Prüfe, ob der Branch richtig gesetzt ist

**"CSV nicht gefunden"**
- Stelle sicher, dass alle 4 Dateien im Root-Ordner liegen
- Prüfe Groß-/Kleinschreibung der Dateinamen

**"Daten werden nicht aktualisiert"**
- Browser-Cache leeren
- Auf GitHub prüfen, ob die CSV-Dateien wirklich aktualisiert wurden
