# Japanese Cards Scraper - Settings Anleitung

## Übersicht

Der Japanese Cards Scraper lädt die neuesten japanischen Karten von Limitless TCG und speichert sie in `data/japanese_cards_database.csv`.

**Standard-Verhalten:** Scrapt die 4 neuesten japanischen Sets und überschreibt die Datenbank komplett (kein Append-Modus).

---

## Settings-Datei: `japanese_cards_scraper_settings.json`

```json
{
    "headless": true,
    "max_pages": null,
    "list_page_delay_seconds": 2.0,
    "detail_page_wait_seconds": 2.0,
    "detail_request_delay_seconds": 0.5,
    "keep_latest_sets": 4,
    "skip_detail_scraping": false
}
```

---

## Parameter-Erklärung

### `headless` (boolean)
- **Default:** `true`
- **Beschreibung:** Chrome-Browser unsichtbar im Hintergrund laufen lassen
- **Werte:**
  - `true` = Kein Browser-Fenster (schneller, weniger Ressourcen)
  - `false` = Browser-Fenster sichtbar (nützlich für Debugging)

### `max_pages` (integer | null)
- **Default:** `null` (alle Seiten)
- **Beschreibung:** Maximale Anzahl der zu scrapenden Seiten
- **Werte:**
  - `null` = Alle Seiten scrapen
  - `3` = Nur erste 3 Seiten (ca. 150 Karten) - gut für Tests
  - `10` = Erste 10 Seiten

### `list_page_delay_seconds` (float)
- **Default:** `2.0`
- **Beschreibung:** Wartezeit zwischen Listenseiten
- **Empfohlen:** 1.0 - 3.0 Sekunden

### `detail_page_wait_seconds` (float)
- **Default:** `2.0`
- **Beschreibung:** Wartezeit nach Laden einer Detail-Seite (damit Bilder geladen werden)
- **Empfohlen:** 1.0 - 3.0 Sekunden

### `detail_request_delay_seconds` (float)
- **Default:** `0.5`
- **Beschreibung:** Kurze Pause zwischen Detail-Requests (höflich zum Server)
- **Empfohlen:** 0.3 - 1.0 Sekunden

### `keep_latest_sets` (integer)
- **Default:** `4`
- **Beschreibung:** Anzahl der neuesten japanischen Sets die behalten werden
- **Werte:**
  - `4` = Standard (4 neueste Sets)
  - `6` = Mehr Sets behalten
  - `2` = Nur die 2 allerneuesten

**Hinweis:** Japanische Sets rotieren schneller als englische - 4 Sets ist ein guter Standard für City League Turniere.

### `skip_detail_scraping` (boolean)
- **Default:** `false`
- **Beschreibung:** Detail-Seiten überspringen (nur Basis-Infos scrapen)
- **Werte:**
  - `false` = Normale Ausführung (mit Bildern und Rarity)
  - `true` = Schneller Modus (OHNE image_url und rarity)

**Warnung:** Wenn `true`, haben Karten **keine Bilder** und **keine Rarity-Information**!

---

## Anwendungsbeispiele

### Test-Modus (schnell):
```json
{
    "headless": true,
    "max_pages": 3,
    "skip_detail_scraping": true,
    "keep_latest_sets": 4
}
```
**Dauer:** ~1-2 Minuten  
**Nutzen:** Schneller Test ob Scraper funktioniert

### Standard-Modus (empfohlen):
```json
{
    "headless": true,
    "max_pages": null,
    "keep_latest_sets": 4,
    "skip_detail_scraping": false
}
```
**Dauer:** ~15-30 Minuten  
**Nutzen:** Alle 4 neuesten Sets mit vollständigen Daten

### Erweitert (mehr Sets):
```json
{
    "headless": true,
    "max_pages": null,
    "keep_latest_sets": 6,
    "skip_detail_scraping": false
}
```
**Dauer:** ~20-40 Minuten  
**Nutzen:** 6 neueste Sets (z.B. für umfangreichere Analysen)

---

## Output

### CSV: `data/japanese_cards_database.csv`
```csv
name,set,number,type,rarity,image_url
Pikachu ex,SV8a,001,Lightning,Double Rare,https://...
```

### JSON: `data/japanese_cards_database.json`
```json
{
  "timestamp": "2026-02-17T10:30:45",
  "source": "https://limitlesstcg.com/cards?q=lang%3Aen.t",
  "total_count": 1115,
  "sets": ["SV8a", "SV8", "SV7a", "SV7"],
  "cards": [...]
}
```

---

## Wichtige Hinweise

### Überschreib-Modus
⚠️ Der Japanese Cards Scraper überschreibt die Datenbank **immer komplett** (kein Append-Modus)!

**Grund:** Japanische Sets rotieren aus, alte Daten werden irrelevant.

### Warum japanische Karten?
City League Turniere verwenden manchmal japanische Karten **vor** dem internationalen Release.  
Beispiel: Ein neues japanisches Set erscheint im Januar, das englische Set erst im März.

### Geschwindigkeit
- **Nur Liste:** ~2-3 Minuten (skip_detail_scraping = true)
- **Mit Details:** ~15-30 Minuten (für 4 Sets mit ~1000 Karten)

Detail-Scraping ist langsam, weil jede Karte eine eigene Seite ist (rate limiting notwendig).

---

## Fehlerbehebung

**Problem:** Scraper findet keine Karten  
**Lösung:** Limitless TCG eventuell offline oder Seitenstruktur geändert → In Browser prüfen

**Problem:** Browser startet nicht (headless mode)  
**Lösung:** `"headless": false` setzen und visuell debuggen

**Problem:** Zu langsam  
**Lösung:** `skip_detail_scraping: true` oder `max_pages: 5` zum Testen

**Problem:** Rate Limit / IP Block  
**Lösung:** Delays erhöhen (`detail_request_delay_seconds: 1.0`)
