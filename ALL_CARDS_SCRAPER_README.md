# All Cards Scraper - Anleitung

## Übersicht

Der All Cards Scraper hat jetzt **3 Modi** für verschiedene Anwendungsfälle:

### 1. 🧪 TEST-Modus (3 Seiten)
**Datei:** `RUN_ALL_CARDS_SCRAPER_TEST.bat`
- Scrapt nur die **ersten 3 Seiten** (~150 Karten)
- Perfekt zum Testen der Funktionalität
- **Dauer:** 2-3 Minuten

### 2. 🎯 CURRENT META-Modus (Standard H-Block)
**Datei:** `RUN_ALL_CARDS_SCRAPER_CURRENT_META.bat`
- Scrapt NUR aktuelle Standard-Sets:
  - **ASC** (Ascended Heroes)
  - **SSP** (Stellar Crown / Surging Sparks)
  - **SCR** (Scarlet ex)
  - **TWM** (Twilight Masquerade)
  - **TEF** (Temporal Forces)
  - **PAR** (Paradox Rift)
  - **MEW** (151)
  - **OBF** (Obsidian Flames)
  - **PAL** (Paldea Evolved)
  - **SVI** (Scarlet & Violet Base)
- **Dauer:** 1-2 Stunden
- **Empfehlung:** Nutze diesen Modus für den Deck Builder!

### 3. 🌐 VOLLSTÄNDIG-Modus (alle Sets)
**Datei:** `RUN_ALL_CARDS_SCRAPER.bat` (im dist/ Ordner)
- Scrapt **ALLE** Sets von allen Epochen
- **Dauer:** 8-12 Stunden
- **Empfehlung:** Über Nacht laufen lassen

---

## Manuelle Anpassung der Settings

Du kannst die Settings auch manuell anpassen:

### Datei: `all_cards_scraper_settings.json`

```json
{
    "start_page": 1,              // Bei welcher Seite starten
    "end_page": null,             // null = bis zum Ende, oder z.B. 10 für Seiten 1-10
    "max_pages": null,            // null = alle, oder z.B. 3 für nur 3 Seiten (ab start_page)
    "set_filter": [],             // [] = alle, oder ["ASC", "SVI"] für nur diese Sets
    "append": true,               // true = anhängen, false = neu schreiben
    "headless": true,             // true = unsichtbar, false = Browser sichtbar
    "skip_detail_scraping": false, // true = nur Liste (schnell), false = mit Details
    "list_page_delay_seconds": 1.0,
    "detail_page_wait_seconds": 2.0,
    "detail_request_delay_seconds": 0.5
}
```

---

## Parameter-Erklärung

### Seiten-Steuerung

**`start_page`** (Integer, Standard: 1)
- Erste Seite die gescrapt wird
- **Beispiel:** `"start_page": 50` beginnt bei Seite 50

**`end_page`** (Integer | null, Standard: null)
- Letzte Seite die gescrapt wird (absoluter Wert)
- **null** = Bis zum Ende scrapen
- **Beispiel:** `"start_page": 1, "end_page": 10` scrapt Seiten 1-10

**`max_pages`** (Integer | null, Standard: null)
- Maximale Anzahl der Seiten (relativ zu start_page)
- **null** = Alle Seiten scrapen
- **Beispiel:** `"start_page": 10, "max_pages": 5` scrapt Seiten 10-14

**Unterschied end_page vs max_pages:**
- `end_page`: Absolute Seitenzahl → "Scrape bis Seite X"
- `max_pages`: Relative Anzahl → "Scrape X Seiten ab start_page"

### Filter

**`set_filter`** (Array, Standard: [])
- Nur bestimmte Sets scrapen
- **[]** = Alle Sets
- **["ASC", "SVI"]** = Nur diese Sets
- **Tipp:** Spart viel Zeit wenn du nur aktuelle Sets brauchst!

**`skip_detail_scraping`** (Boolean, Standard: false)
- **false** = Normale Ausführung (mit Bildern + Rarity)
- **true** = Schneller Modus (OHNE image_url und rarity)
- **Warnung:** Karten haben dann keine Bilder!

### Datenbank

**`append`** (Boolean, Standard: true)
- **true** = Neue Karten anhängen (Incremental Mode)
- **false** = Datenbank neu erstellen (Fresh Start)

### Browser

**`headless`** (Boolean, Standard: true)
- **true** = Browser unsichtbar im Hintergrund
- **false** = Browser-Fenster sichtbar (Debugging)

### Delays (Geschwindigkeit vs. Server-Höflichkeit)

**`list_page_delay_seconds`** (Float, Standard: 1.0)
- Pause zwischen Listenseiten
- **Empfohlen:** 0.5 - 2.0 Sekunden

**`detail_page_wait_seconds`** (Float, Standard: 2.0)
- Wartezeit nach Laden einer Detail-Seite
- **Empfohlen:** 1.0 - 3.0 Sekunden

**`detail_request_delay_seconds`** (Float, Standard: 0.5)
- Kurze Pause zwischen Detail-Requests
- **Empfohlen:** 0.3 - 1.0 Sekunden

---

### Beispiele:

#### Seiten 1-10 scrapen (z.B. zum Testen):
```json
{
    "start_page": 1,
    "end_page": 10
}
```

#### Seiten 50-60 scrapen (z.B. Nacharbeit):
```json
{
    "start_page": 50,
    "end_page": 60,
    "append": true
}
```

#### Nur erste 5 Seiten ab Startseite:
```json
{
    "start_page": 1,
    "max_pages": 5
}
```
**Hinweis:** `max_pages` zählt ab `start_page`. Also `start_page: 10, max_pages: 5` scrapt Seiten 10-14.

#### Nur bestimmte Sets scrapen (z.B. ASC + SVI):
```json
{
    "set_filter": ["ASC", "SVI"]
}
```

#### Schneller Testlauf OHNE Detail-Seiten:
```json
{
    "max_pages": 3,
    "skip_detail_scraping": true
}
```
(Achtung: Karten haben dann keine `image_url` oder `rarity`!)

---

## Output

Alle Modi speichern in:
- `data/all_cards_database.csv` (Haupt-Datenbank)
- `data/all_cards_database.json` (JSON-Backup)

---

## Workflow-Empfehlung

1. **Erstmals:** Starte `RUN_ALL_CARDS_SCRAPER_CURRENT_META.bat`
   - Dauert 1-2 Stunden
   - Alle aktuellen Standard-Karten sind verfügbar
   - Deck Builder funktioniert perfekt

2. **Später (über Nacht):** Starte normalen Scraper
   - Alle historischen Sets werden ergänzt
   - Deck Builder hat dann auch alte Karten

3. **Bei Problemen:** Nutze `RUN_ALL_CARDS_SCRAPER_TEST.bat`
   - Testet Funktionalität schnell
   - Kein langes Warten

---

## Technische Details

### Set-Filter Funktionsweise:
Der Scraper lädt ALLE Seiten, aber **filtert die Karten**:
- ✅ Karte aus "ASC" → wird gespeichert
- ❌ Karte aus "CEC" → wird übersprungen

### Geschwindigkeit:
- **Liste scrapen:** ~50 Karten/Sekunde
- **Details scrapen:** ~2-3 Karten/Sekunde
- **Engpass:** Detail-Seiten (image_url + rarity)

### Append-Modus:
- `append: true` → Neue Karten werden hinzugefügt
- `append: false` → Datenbank wird neu erstellt

---

## Häufige Fragen

**Q: Kann ich während des Scrapens den PC nutzen?**
A: Ja! `headless: true` bedeutet der Browser läuft unsichtbar.

**Q: Was wenn der Scraper abbricht?**
A: Einfach nochmal starten mit `append: true` - bereits gescrapte Karten werden übersprungen.

**Q: Wie finde ich die richtigen Set-Kürzel?**
A: Schau auf limitlesstcg.com/cards - die Set-Codes stehen in der ersten Spalte.

**Q: Warum dauert der Detail-Scrape so lange?**
A: Limitless TCG hat Rate-Limiting. 0.5s Delay zwischen Requests ist höflich und verhindert IP-Blocks.
