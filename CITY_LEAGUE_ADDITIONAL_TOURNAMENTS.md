# City League Scraper - Zusätzliche Turniere

## Übersicht

Beide City League Scraper können jetzt spezielle Turniere von der Hauptseite https://limitlesstcg.com/tournaments scrapen, die nicht in der japanischen City League Liste https://limitlesstcg.com/tournaments/jp enthalten sind (z.B. Champions League Turniere).

**Betrifft:**
- ✅ `city_league_archetype_scraper.py` - Scraped Deck-Archetypen
- ✅ `city_league_analysis_scraper.py` - Scraped vollständige Kartenlisten

## Konfiguration

### 1. Archetype Scraper: `city_league_archetype_settings.json`

```json
{
  "start_date": "24.01.2026",
  "end_date": "auto",
  "delay_between_requests": 1.5,
  "output_file": "city_league_archetypes.csv",
  "region": "jp",
  "additional_tournament_ids": [547, 550, 555]
}
```

### 2. Analysis Scraper: `city_league_analysis_settings.json`

```json
{
    "sources": {
        "city_league": {
            "enabled": true,
            "start_date": "24.01.2026",
            "end_date": "auto",
            "max_decklists_per_league": 16,
            "additional_tournament_ids": [547, 550, 555]
        }
    },
    "output_file": "city_league_analysis.csv",
    "delay_between_requests": 1.5,
    "append_mode": true
}
```

## Turnier-IDs finden

Die Turnier-ID findest du in der URL des Turniers:
- **Beispiel**: https://limitlesstcg.com/tournaments/547
- **Turnier-ID**: `547`

## Wie es funktioniert

1. Der Scraper lädt zunächst alle Turniere aus der japanischen City League Liste im angegebenen Datumsbereich
2. Dann lädt er zusätzlich die Turniere, die in `additional_tournament_ids` angegeben sind
3. Für jedes zusätzliche Turnier:
   - Extrahiert das Datum aus der HTML (`<div class="infobox-line">`)
   - Extrahiert die Spieleranzahl
   - Scraped alle Deck-Archetypen bzw. vollständige Decks
4. Alle Daten werden in die gleiche CSV-Datei geschrieben

## Extrahierte Daten

Für zusätzliche Turniere werden folgende Informationen extrahiert:

- **Datum**: Aus dem Format "21st February 2026" → "21 Feb 26"
- **Spieleranzahl**: z.B. "7000*" (mit Stern für ungenaue Angaben)
- **Prefecture**: Wird auf "Special Event" gesetzt
- **Shop/Name**: Turniername aus dem `<h1>` Tag

### Archetype Scraper Output:
- **Placement**: Platzierung des Spielers
- **Player**: Spielername
- **Archetype**: Deck-Archetyp (z.B. "Charizard Pidgeot")

### Analysis Scraper Output:
- **Vollständige Kartenlisten** mit Anzahl, Set-Code, Set-Nummer
- **Aggregiert nach Archetyp**

## Beispiel

### Turnier hinzufügen:
```json
"additional_tournament_ids": [547]
```

### Console-Ausgabe (Archetype Scraper):
```
============================================================
Fetching 1 additional tournament(s) by ID...
============================================================

Fetching tournament from: https://limitlesstcg.com/tournaments/547
  ✓ Found: 21 Feb 26 - Champions League Yokohama (7000 players)
  ✓ Added tournament 547 to scraping queue

[1/1] Processing tournament 547
Scraping tournament: https://limitlesstcg.com/tournaments/547
  Found 156 deck entries
```

### Console-Ausgabe (Analysis Scraper):
```
============================================================
SCRAPING CITY LEAGUE DATA
============================================================
Date range: 24.01.2026 to 22.02.2026
Max decklists per league: 16
Additional tournaments: 547

Fetching 1 additional tournament(s) by ID...
  ✓ Added tournament 547

[1/15] Processing Champions League Yokohama (ID: 547)
  Tournament page size: 125340 chars
  Extracted 16 decklists
```

## Vorteile

- **Vollständige Daten**: Erfasst auch Champions League und andere spezielle Events
- **Gleiche CSV**: Alle Daten in einer Datei für einfache Auswertung
- **Inkrementell**: Bereits gescrapte Turniere werden übersprungen
- **Flexibel**: Beliebig viele Turniere hinzufügen
- **Beide Scraper**: Funktioniert für Archetype- und Analysis-Scraper

## Wichtig

- Die Turnier-IDs werden **zusätzlich** zu den normalen City League Turnieren gescraped
- Bereits gescrapte Turniere werden automatisch übersprungen (via Tournament ID)
- Das Datum wird automatisch aus der HTML extrahiert - kein manuelles Eintragen nötig
- Beide Scraper nutzen die gleiche `get_tournament_by_id()` Funktion aus dem `city_league_archetype_scraper`-Modul
