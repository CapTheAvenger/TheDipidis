# Cluster A — Card-DB-Lücke (CRI fehlt)

**Findings:** F-001, F-002, F-003, F-004, F-005
**Status:** Detail-Audit (Phase 7), noch kein Fix angewandt
**Risiko:** 🔴 HIGH — alle 5 Findings betreffen User-sichtbare Karten-Daten

---

## TL;DR

Ein einziges strukturelles Loch (`all_cards_scraper.py` nicht im CI) und ein veralteter Workflow-Comment kaskadieren zu 5 sichtbaren Symptomen. Nach dem **3-Schritt-Fix** sind alle 5 Findings geschlossen.

### Die 5 Findings im Cluster

| ID | Symptom | Ursache | Fix-Anker |
|---|---|---|---|
| F-001 | `all_cards_scraper.py` nicht im wöchentlichen CI-Lauf | Workflow-Comment behauptet "Chrome-dependent" — ist aber **falsch** (Scraper nutzt cloudscraper) | **A1** |
| F-002 | `pokemon_sets_mapping.csv` kennt CRI nicht | Manuell gepflegt, wurde nach CRI-Release vergessen | **A2** |
| F-003 | 0 CRI-Preise in `price_data.csv` | Folge von F-001 (kein Card-Mapping → kein Preis-Merge) | wird **automatisch** durch A1 behoben |
| F-004 | `format_window.json` sagt CRI, aber `sets.json`/`sets_metadata.json` zeigen POR als newest | `FALLBACK_SET_ORDER` in `update_sets.py` ist auf M4/POR hartkodiert; bei Live-Scrape-Fail greift der veraltete Fallback | **A3** |
| F-005 | Alle Karten-Daten-Files (effects, text, chunks) haben 0 CRI | Folge von F-001 (alle Folge-Scraper bauen auf `all_cards_database.csv` auf) | wird **automatisch** durch A1 behoben |

---

## Root-Cause-Beweis

### Beweis 1 — Der Workflow-Comment ist faktisch falsch

`.github/workflows/weekly-full-update.yml` enthält den Kommentar:
```yaml
# Chrome-dependent scrapers — those are scheduled separately when a
# new set drops:
#   - all_cards_scraper
#   - japanese_cards_scraper
#   - card_price_scraper
```

**Aber:** `all_cards_scraper.py` Zeile 5 sagt:
```
- HTTP requests + BeautifulSoup instead of Selenium -> massive speed boost
```

Und der Code importiert KEINE Selenium/Chrome-Module — nur `BeautifulSoup` + `card_scraper_shared.safe_fetch_html`, das **cloudscraper** + **curl_cffi** als Fallback nutzt (`backend/core/card_scraper_shared.py:29-341`).

→ Der Scraper hat irgendwann von Selenium auf cloudscraper migriert, aber der Workflow-Comment wurde nicht aktualisiert. Die Annahme "Chrome-dependent" ist seitdem nicht mehr richtig.

### Beweis 2 — `pokemon_sets_mapping.csv` wird von keinem Scraper geschrieben

`grep -rn "pokemon_sets_mapping" backend/` → keine Treffer in `backend/`. Die Datei ist eine manuell gepflegte Liste.

```
$ head -3 pokemon_sets_mapping.csv
set_code,set_name
POR,Perfect Order
ASC,Ascended Heroes
```

→ Eintrag für CRI muss manuell ergänzt werden, oder die Datei muss vom Scraper produziert werden.

### Beweis 3 — `update_sets.py` Fallback ist veraltet

`backend/core/update_sets.py:96-100`:
```python
FALLBACK_SET_ORDER = {
    # Mega (2026)
    'M4': 152, 'POR': 151, 'ASC': 150, 'PFL': 149, 'MEG': 148, 'MEE': 147, 'MEP': 146,
    ...
```

`FALLBACK_RELEASE_DATES` (`backend/core/update_sets.py:78-86`):
```python
FALLBACK_RELEASE_DATES = {
    'POR': '2026-03-27',  # Perfect Order — current rotation anchor
    'BLK': '2026-01-17',
    ...
```

Weder CRI noch M5 sind im Fallback. Bei Live-Scrape-Fail wird also POR/M4 als "newest" geschrieben.

**Self-aware Comment im Code (Zeile 88-94)** sagt genau das voraus:
> "update_sets.py on a CI runner that fails to scrape (Cloudflare, DNS hiccup, table re-skinned) silently writes a sets.json missing the newest sets → prepare_card_data.py's chunker reads order 0 for those sets → cards land in legacy chunk → Deck Builder can't find them. That's how POR/M4 cards disappeared from the standard chunk on the 2026-05-03 auto-runs. **Bump these whenever a new English-set rotation happens.**"

Diese Warnung wurde geschrieben, aber bei CRI-Release am 22.05.2026 nicht befolgt.

### Beweis 4 — Auto-Update-Lauf hat sets.json nicht aktualisiert

```
$ stat -c "%y %n" data/format_window.json data/sets.json
2026-05-25 02:15:42  data/format_window.json
2026-05-15 17:53:39  data/sets.json
```

Letzter Auto-Lauf war 2026-05-26 07:16 UTC, hat aber nur `format_window.json` neu geschrieben (`current_set: "CRI"` über separaten Code-Pfad `_pick_current_set()` der `scrape_release_dates()` nutzt). `write_sets()` wurde im selben Lauf entweder nicht ausgeführt oder schrieb identischen Inhalt → keine Mod-Time-Änderung.

Vermutlich: `scrape_live_sets()` (Zeile 143) lieferte < 10 Sets → fiel in FALLBACK → schrieb POR-stand → identisch zum vorigen Stand → keine Änderung.

---

## Fix-Plan

Drei koordinierte Schritte (**A1, A2, A3**). Reihenfolge irrelevant, aber **A1 (Scraper ins CI) hat die größte Auswirkung** — er behebt F-001, F-003, F-005 in einem Rutsch.

### Fix A1 — `all_cards_scraper.py` ins CI aufnehmen

**Aufwand:** ~30 min

**Änderung:** `.github/workflows/weekly-full-update.yml`, Step "Run scrapers". Die Scraper-Liste um `scrapers/all_cards_scraper.py` ergänzen.

**Optionen:**

| Variante | Pro | Contra |
|---|---|---|
| **A1a — In den existing Loop einfügen** | minimaler Code-Change, einheitliches Logging | Scraper läuft jede Woche → ~30min mehr CI-Zeit |
| A1b — Separater Step mit eigenem `set +e` | feinere Kontrolle bei Timeouts | mehr Workflow-Komplexität |
| A1c — Eigener Workflow `on-set-release.yml` mit manual dispatch | nur bei Bedarf | erfordert User-Interaktion bei jedem neuen Set — genau das Problem das wir lösen wollen |

**Empfehlung: A1a** — einfach in den Loop einfügen. Der Scraper macht skip-if-already-scraped intern (laut Code), also keine doppelte Arbeit. Workflow-Comment ebenfalls korrigieren.

**Konkrete Änderung:**
```diff
 for step in \
     "core/update_sets.py" \
     "scrapers/cardmarket_id_mapper.py" \
+    "scrapers/all_cards_scraper.py" \
     "scrapers/current_meta_analysis_scraper.py" \
     ...
```
Plus den Comment-Block bereinigen:
```diff
-# Chrome-dependent scrapers — those are scheduled separately when a
-# new set drops:
-#   - all_cards_scraper
-#   - japanese_cards_scraper
-#   - card_price_scraper
+# all_cards_scraper and japanese_cards_scraper are now part of this
+# batch (both use cloudscraper, not Chrome). card_price_scraper is
+# legacy (replaced by cardmarket_price_merger).
```

**Test-Strategie:**
1. Workflow lokal nicht ausführbar (CI-only) — der nächste Auto-Lauf am Dienstag verifiziert
2. Manuelle Validierung: `python3 backend/scrapers/all_cards_scraper.py` lokal laufen, prüfen ob CRI-Karten im `all_cards_database.csv` landen
3. Sanity-Check post-CI:
   ```bash
   awk -F',' '$3=="CRI"' data/all_cards_database.csv | wc -l
   # > 0  → success
   ```

**Side-Effects:**
- CI-Lauf wird länger (geschätzt 20-40 min Aufschlag — bei 20.000+ Karten mit `list_page_delay: 1.0s` und `detail_request_delay: 0.5s` mit 8 Workern)
- Cardmarket-ID-Mapper läuft VOR `all_cards_scraper`, müsste danach. **Reihenfolge wichtig:**
  - Aktuell: `cardmarket_id_mapper.py` läuft als Schritt 2
  - Soll: `all_cards_scraper.py` davor, weil `cardmarket_id_mapper` `all_cards_database.csv` als INPUT braucht
  - Wenn `all_cards_database.csv` noch alt ist, fehlen die Mappings für neue Karten

**Korrekte Reihenfolge:**
```
1. core/update_sets.py
2. scrapers/all_cards_scraper.py     ← NEU
3. scrapers/cardmarket_id_mapper.py
4. scrapers/current_meta_analysis_scraper.py
...
```

**Rollback:** Step wieder aus dem Loop entfernen, Comment zurück. Eine Zeile.

### Fix A2 — CRI in `pokemon_sets_mapping.csv` ergänzen

**Aufwand:** ~5 min (manuell), ~2h (automatisiert)

**Optionen:**

| Variante | Pro | Contra |
|---|---|---|
| **A2a — Manuell CRI-Zeile ergänzen** | Sofort wirksam, kein Code-Change | nicht sustainable (nächstes Set braucht wieder Handarbeit) |
| A2b — Datei vom `update_sets.py` mitschreiben lassen | Automatisiert, sustainable | Code-Änderung, neue Schreib-Funktion in update_sets.py |
| A2c — Datei komplett ablösen, `sets_metadata.json` als alleinige Truth | Reduziert Redundanz | Mehrere Reader müssen umgestellt werden — 4 Files |

**Empfehlung: A2a sofort + A2b mittelfristig.**

**Konkrete Änderung A2a:** In `pokemon_sets_mapping.csv` als 2. Zeile (nach Header) einfügen:
```
set_code,set_name
CRI,Chaos Rising
POR,Perfect Order
ASC,Ascended Heroes
...
```

Reihenfolge ist *newest first* — siehe `app-cards-db.js:998`. CRI als oberster Eintrag.

**Test-Strategie:**
1. Card DB Tab öffnen → Set-Filter-Dropdown soll CRI als ersten Eintrag zeigen (sobald CRI-Karten in `all_cards_database.csv` sind, was nach A1 der Fall ist)
2. Vorher: ohne A1 sieht CRI im Dropdown nicht, weil `app-cards-db.js:1018` filtert `setsToShow = orderedSets.filter(set => availableSets.has(set))` — und `availableSets` kommt aus `cards`

**Side-Effects:**
- Keine. Reine Daten-Datei-Änderung.

**Rollback:** Zeile löschen.

### Fix A3 — `FALLBACK_SET_ORDER` + `FALLBACK_RELEASE_DATES` in `update_sets.py` aktualisieren

**Aufwand:** ~10 min (manuell), ~3h (Live-Scraper robuster machen)

**Optionen:**

| Variante | Pro | Contra |
|---|---|---|
| **A3a — Fallback-Werte manuell ergänzen** | Sofort wirksam | Nicht sustainable; jedes neue Set braucht wieder Handarbeit |
| A3b — `scrape_live_sets()` robuster machen | Automatisch | Limitless-Site-Layout-Änderung könnte trotzdem Fail erzwingen |
| A3c — Bei Fallback-Treffer eine **Warning ausgeben** und CI-Lauf failen | sichtbar | Pre-Existing-Daten mit Fallback würden brechen |

**Empfehlung: A3a + A3c.** Fallback ergänzen UND CI-Warnung wenn Fallback greift, damit beim nächsten Set niemand mehr vergisst.

**Konkrete Änderung A3a:**

In `backend/core/update_sets.py:96-100`:
```python
FALLBACK_SET_ORDER = {
    # Mega (2026)
    'CRI': 153,                                          # ← NEU
    'M5':  153,                                          # ← NEU (JP)
    'M4':  152, 'POR': 151, 'ASC': 150, 'PFL': 149, ...
```

In `backend/core/update_sets.py:78-86`:
```python
FALLBACK_RELEASE_DATES = {
    'CRI': '2026-05-22',  # Chaos Rising — current rotation anchor   ← NEU
    'POR': '2026-03-27',  # Perfect Order
    'BLK': '2026-01-17',
    ...
```

In `backend/core/update_sets.py:65-72`:
```python
FALLBACK_JP_RELEASE_DATES = {
    'M5':  '2026-05-22',  # current JP rotation anchor              ← NEU
    'M4':  '2026-03-13',  # Ninja Spinner
    'M3':  '2025-12-26',  # Nihil Zero
}
```

**Test-Strategie:**
1. `python3 backend/core/update_sets.py` lokal ausführen
2. `cat data/sets.json | jq .CRI` → soll `153` zurückgeben
3. `cat data/sets_metadata.json | jq .CRI` → soll `{"order": 153, "release_date": "2026-05-22"}` zurückgeben
4. `cat data/format_window.json | jq .current_set` → soll `"CRI"` zurückgeben (war schon vorher OK)

**Side-Effects:**
- Wenn das **Live-Scraping erfolgreich** ist, würden die FALLBACK-Werte überschrieben — Update der FALLBACKS ist nur safety-net
- `merged[code] = max(merged[code], live_scaled)` (Zeile 897) sichert dass Live-Daten Priorität haben

**Rollback:** Edit rückgängig machen.

---

## Test-Plan vor Push (alle Fixes)

| Schritt | Erwartetes Ergebnis |
|---|---|
| Lokales Run `python3 backend/core/update_sets.py` | `sets.json`, `sets_metadata.json`, `format_window.json` updated, alle drei enthalten CRI mit order=153 |
| Lokales Run `python3 backend/scrapers/all_cards_scraper.py` (mit Settings `start_page: 1`, `max_pages: 5` für Sanity) | CRI-Karten in `all_cards_database.csv` |
| Manueller Check `pokemon_sets_mapping.csv` | CRI als 2. Zeile (nach Header) |
| Workflow-File-Check | `all_cards_scraper.py` ist Step 2 (vor `cardmarket_id_mapper`) |

**Erst nach lokalem grünem Test → Push → nächster Di-CI-Lauf verifiziert vollständig.**

---

## Risiko-Einschätzung

| Risiko | Wahrscheinlichkeit | Auswirkung | Mitigation |
|---|---|---|---|
| `all_cards_scraper` läuft im CI länger als 1h, blockt Workflow | medium | medium | `set +e` ist schon im Loop; Scraper timeoutet einzeln nicht den Workflow |
| Cloudflare blockt häufige Runs | low (cloudscraper + curl_cffi) | high (kein CRI-Update) | `weekly` Cadenz ist konservativ; Probe-Step im Workflow detektiert Cloudflare-Block bereits |
| Scraper findet CRI-Set-URL nicht (Limitless-Layout-Wechsel) | low | medium | Fallback-Dict in update_sets.py greift; Logging zeigt es |
| Reihenfolge `all_cards_scraper` vor `cardmarket_id_mapper` falsch | low (klar dokumentiert) | high (mapping bleibt stale) | Test-Plan checkt explizit |

---

## Bei welchem Schritt brauchst du mich noch?

Mein nächster Schritt wäre Phase 8 (echte Fix-Implementierung). Ich kann das in **drei separaten Commits** machen (A1, A2, A3) — atomar und einzeln revertierbar.

**Vorschlag:**
1. Erst A2 (Daten-Datei, kleinster Blast-Radius) — sofort sichtbarer Effekt im UI nach Reload
2. Dann A3 (Code-Datei mit Fallback-Update) — sicher selbst ohne Live-Run
3. Dann A1 (Workflow-Change) — größter Effekt nach nächstem CI-Lauf am Dienstag

Wenn du **"GO FIX"** sagst, mache ich die drei Commits in dieser Reihenfolge.

Oder du willst nur Teilmenge — z.B. nur A2+A3 (minimal-invasiv) und A1 abwarten bis nach dem nächsten manuellen Test.

---

**STOP nach Phase 7.** Warte auf "GO FIX" (entweder für alle 3 oder für eine Teilmenge).
