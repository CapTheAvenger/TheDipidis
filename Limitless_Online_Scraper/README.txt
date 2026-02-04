# Limitless Online Deck Scraper

Scrapes aktuelle Deck-Statistiken von play.limitlesstcg.com/decks

## Dateien

- **limitless_online_scraper.exe** - Hauptprogramm
- **limitless_online_settings.json** - Einstellungen
- **UPLOAD_TO_GIST.bat** - Upload der HTML-Comparison zu GitHub Gist

## Verwendung

1. **Doppelklick auf `limitless_online_scraper.exe`**
   - Lädt automatisch die aktuellen Deck-Statistiken
   - Erstellt `limitless_online_decks.csv` mit allen Deck-Daten
   - Erstellt `limitless_online_decks_comparison.csv` (ab 2. Lauf)
   - Erstellt `limitless_online_decks_comparison.html` (ab 2. Lauf)

2. **Einstellungen anpassen** (optional)
   - Öffne `limitless_online_settings.json`
   - Mögliche Werte:
     - `game`: "POKEMON", "BANDAI", "LORCANA", "SWU", "RIFTBOUND"
     - `format`: "STANDARD", "EXPANDED", etc. (abhängig vom Spiel)

3. **HTML-Report online teilen**
   - Doppelklick auf `UPLOAD_TO_GIST.bat`
   - Beim ersten Mal: GitHub Token eingeben (siehe Anleitung)
   - Link funktioniert auch am Handy! 📱

## Output

### CSV-Dateien (German Excel Format)
- Delimiter: Semikolon (;)
- Encoding: UTF-8 mit BOM
- Dezimaltrennzeichen: Komma (,)

### Comparison Report
- Zeigt Änderungen zwischen zwei Scraper-Läufen
- Top 10 Bewegungen
- Neue/Verschwundene Decks
- Rank Climbers/Fallers
- Win-Rate Veränderungen

## Features

✅ Keine externe Bibliotheken benötigt
✅ Comparison zwischen verschiedenen Zeitpunkten
✅ HTML-Report mit schönem Design
✅ Upload zu GitHub Gist für mobilen Zugriff
✅ German Excel kompatibel

## Hinweise

- Die Daten werden direkt von play.limitlesstcg.com geladen
- Beim ersten Lauf wird keine Comparison erstellt (keine alten Daten vorhanden)
- Ab dem zweiten Lauf siehst du alle Veränderungen
