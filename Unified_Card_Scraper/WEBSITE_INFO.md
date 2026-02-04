# Deck Viewer Website - Anleitung

## Benötigte Dateien

Die Website (`deck_viewer.html`) benötigt folgende CSV-Dateien:

### 1. Kartendaten (Pflicht)
- **unified_card_data.csv** - Wird vom Unified Card Scraper erstellt
- Enthält alle Karten mit ihren Prozentsätzen pro Archetype

### 2. Comparison-Daten (Optional, für erweiterte Stats)

#### City League Daten
- **city_league_archetypes_comparison.csv**
- Pfad: `../City_League_Archetype_Scraper/city_league_archetypes_comparison.csv`
- Wird vom City League Archetype Scraper erstellt
- Zeigt: Trends, Status, Platzierungsänderungen für japanische Turniere

#### Limitless Online Daten
- **limitless_online_decks_comparison.csv**
- Pfad: `../Limitless_Online_Scraper/limitless_online_decks_comparison.csv`
- Wird vom Limitless Online Scraper erstellt
- Zeigt: Win Rate, Matchups, Rankings für Online-Turniere

## Datenquellen-Logik

Die Website entscheidet automatisch, welche Stats angezeigt werden:

1. **City League Decks** (z.B. japanische Turniere):
   - Sucht zuerst in `city_league_archetypes_comparison.csv`
   - Zeigt: Trend-Indikatoren (📈 STEIGEND, 📉 FALLEND, ➡️ STABIL)
   - Zeigt: Status (🆕 NEU, ✓ BESTEHEND, ❌ VERSCHWUNDEN)
   - Zeigt: Platzierungsveränderungen

2. **Andere Decks** (z.B. Online-Turniere):
   - Sucht in `limitless_online_decks_comparison.csv`
   - Zeigt: Win Rate, Match-Balance, Rankings

## Workflow für aktuelle Daten

### 1. Unified Card Scraper ausführen
```
Unified_Card_Scraper.exe
```
- Settings in `unified_card_settings.json` anpassen
- Erstellt `unified_card_data.csv` mit allen Kartendaten

### 2. City League Comparison aktualisieren (separat)
```
cd City_League_Archetype_Scraper
City_League_Archetype_Scraper.exe
```
- Aktualisiert `city_league_archetypes_comparison.csv`
- Vergleicht alte und neue Daten

### 3. Limitless Online Comparison aktualisieren (separat)
```
cd Limitless_Online_Scraper
limitless_online_scraper.exe
```
- Aktualisiert `limitless_online_decks_comparison.csv`
- Zeigt aktuelle Meta-Rankings

### 4. Website öffnen
```
Unified_Card_Scraper/deck_viewer.html
```
- Öffnet im Browser
- Lädt automatisch alle verfügbaren Daten

## Vorteile dieser Struktur

✅ **Unabhängigkeit**: Jeder Scraper läuft separat und kann individuell aktualisiert werden
✅ **Geschwindigkeit**: Website lädt nur statische CSVs, kein Live-Scraping
✅ **Flexibilität**: Comparison-Daten sind optional - Website funktioniert auch ohne
✅ **Spezialisierung**: Jeder Scraper ist für seine Datenquelle optimiert

## Fehlerbehebung

### "Kartendaten nicht gefunden"
- Stelle sicher, dass `unified_card_data.csv` im selben Ordner wie `deck_viewer.html` liegt
- Führe zuerst `Unified_Card_Scraper.exe` aus

### "Keine Stats verfügbar"
- Comparison-Dateien sind optional
- Website zeigt nur Kartenliste an, wenn keine Comparison-Daten vorhanden sind
- Führe City League oder Limitless Online Scraper aus, um Stats zu erhalten

### "Deck nicht gefunden"
- Stelle sicher, dass der Archetypname in `unified_card_data.csv` enthalten ist
- Überprüfe Settings: Sind alle gewünschten Sources aktiviert?
