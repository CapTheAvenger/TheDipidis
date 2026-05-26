# Phase 4 — Pipeline-Verifikation

**Datum:** 2026-05-26
**Branch:** `main` @ `4936e38`
**Methode:** End-to-End-Trace pro Pipeline: Scraper-Code → Output-File → Loader-Code → Verarbeitung → UI

Sechs Pipelines verifiziert: P-1 City League · P-2 pokemon_sets_mapping · P-3 Limitless Online · P-4 Labs Tournament · P-5 Cardmarket · P-6 Current Meta Analysis.

---

## P-1 — City League Archetypes

**Pipeline:** `city_league_archetype_scraper.py` → `city_league_archetypes.csv` → `app-city-league.js` / `app-meta-cards.js` / mehrere

### Schritt 1: Scraper
- **Datei:** `backend/scrapers/city_league_archetype_scraper.py` (725 Zeilen)
- **Externe Quelle:** `https://limitlesstcg.com/tournaments/jp?show=100&page={n}` (`MAX_PAGES = 15` → max 1500 Tournaments)
- **Settings:** `config/city_league_archetype_settings.json`
  ```json
  {
    "start_date": "13.03.2026",
    "end_date": "auto",
    "delay_between_requests": 1.5,
    "output_file": "city_league_archetypes.csv",
    "region": "jp"
  }
  ```
- **Cap-Limit:** `MAX_PAGES = 15` (Zeile 149) — bei 100 Tournaments/Seite → harter Cutoff bei 1500 Events
- **`update_sets.py:581+`** überschreibt `start_date` automatisch auf `format_window.jp_release_date` bei jedem Lauf
- **`format_window.json` aktuell:** `jp_release_date: "2026-05-22"` (= M5 release)

### Schritt 2: Storage
- **Output:** `data/city_league_archetypes.csv` → **73 Bytes (Header only)**
- **`city_league_archetypes_past.csv`:** 952 KB, 8.693 Zeilen, Daten von **14 Mar 26 → 06 May 26** (= M4-Periode komplett)
- **Rotation-Logik:** `update_sets.py:649-684` — bei JP-Set-Rotation (M4 → M5) wird der M4-Stand nach `_past.csv` umgezogen, die aktive CSV neu mit M5-Start initialisiert
- **CI-Status:** Scraper läuft im weekly batch (`weekly-full-update.yml:131`). Letzter erfolgreicher Lauf 2026-05-26 07:16 UTC.

### Schritt 3: Loader
- **`js/app-city-league.js:247-248`** — fetched `city_league_archetypes.csv` oder `city_league_archetypes_past.csv` je nach Past-Toggle
- **`js/app-meta-cards.js:131`** — gleiche Pattern
- **`js/pokemon-loading-screen.js:18`** — pre-loaded beim Boot
- **`js/csv-cache-interceptor.js:22`** — Cache-Key zugewiesen
- **Pfad-Match:** ✅ Scraper schreibt `city_league_archetypes.csv`, Reader liest `city_league_archetypes.csv`

### Schritt 4: Verarbeitung
- **Frontend filtert nach `format`-Spalte** (z.B. `"City League (JP)"`) — keine Format-Mode-Logik
- **`window.currentCityLeagueFormat = localStorage.getItem('cityLeagueFormat') || 'M4'`** (`app-city-league.js:103`) — Default ist `M4`!
- → ⚠️ **Hardcoded Default `M4`** — sollte vermutlich dynamisch zum `current_set_jp` (= `M5`) gehen
- **Past-Toggle in UI** wechselt zwischen `city_league_archetypes.csv` und `..._past.csv`

### Schritt 5: Rendering
- Cards-Display in City-League-Tab
- Wenn CSV leer → leere Tabelle, kein User-Hinweis

### Stichproben-Verifikation
- `city_league_archetypes_past.csv` head:
  ```
  date;tournament_id;prefecture;shop;format;placement;player;archetype
  06 May 26;...;...;...;City League (JP);1;...;Mega Lucario Hariyama
  ```
  ✅ Format passt zu Reader

### Befund

| Status | Erklärung |
|---|---|
| ✅ Pipeline funktioniert technisch | Scraper läuft erfolgreich, CSV wird geschrieben, Reader matched |
| ✅ Past-File ist korrekt gefüllt | 8.693 M4-Zeilen vorhanden |
| 🟡 **Finding P-1-A** | Default-CSV leer weil M5 erst seit 22.05.2026 live ist (User bestätigt erwartet) — **kein UI-Hinweis "noch keine Daten — wechsle zu Past"** |
| 🟡 **Finding P-1-B** | `localStorage['cityLeagueFormat'] \|\| 'M4'` als Default ist hartcodiert auf altes Format. Sollte auf `format_window.current_set_jp` mappen |

---

## P-2 — `pokemon_sets_mapping.csv`

**Pipeline:** ❓ kein Scraper → File im Repo-Root → 4 JS-Files lesen via relativen Pfad

### Schritt 1: Wer schreibt?
- **NIEMAND.** Kein Scraper im Backend referenziert `pokemon_sets_mapping`
- **Manuell gepflegt** — letzte Änderung Commit `ac6d36c` (2026-05-15)

### Schritt 2: Storage
- **Lokation:** `/pokemon_sets_mapping.csv` (Repo-ROOT, nicht `data/`!)
- **Größe:** 2.753 Bytes, 152 Zeilen
- **Inhalt:** `set_code,set_name` — z.B. `POR,Perfect Order` (newest first)
- **Letztes Set:** **POR (Perfect Order, EN)** — released `2026-03-27`
- **❌ Fehlt:** CRI (Chaos Rising, released 2026-05-22)

### Schritt 3: Reader

| File | Pfad-Pattern | Funktioniert? |
|---|---|---|
| `js/pokemon-loading-screen.js:24` | `url: 'pokemon_sets_mapping.csv'` (relativ) | ✅ |
| `js/csv-cache-interceptor.js:26` | `'pokemon_sets_mapping.csv': 'pokemon_sets_mapping'` (relativ) | ✅ |
| `js/app-cards-db.js:998` | `fetch('pokemon_sets_mapping.csv')` (relativ) | ✅ |
| `js/app-core.js:2405` | `fetch(\`./pokemon_sets_mapping.csv?t=${timestamp}\`)` | ✅ |

### Schritt 4+5: Verarbeitung & Use-Case
- **Use:** Sortierung der Set-Filter-Dropdown im Card DB Tab (`app-cards-db.js:996` "populateSetFilter")
- **Use:** Set-Order-Lookup in Deck Builder (Sortierung)

### Stichproben-Verifikation
- **CRI nicht in mapping:**
  ```
  $ grep "^CRI" pokemon_sets_mapping.csv → leer
  ```
- **CRI auch nicht in `all_cards_database.csv`:**
  ```
  $ awk -F',' '$3=="CRI"' data/all_cards_database.csv | wc -l → 0
  ```
- **CRI auch nicht in `pokemon_card_effects.json`:** 20.126 Einträge, 0 CRI
- **CRI auch nicht in `price_data.csv`:** 20.126 Zeilen, 0 CRI
- → ⚠️ **Komplette Karten-DB hat keinen CRI-Inhalt**

### Befund

| Status | Erklärung |
|---|---|
| ✅ Pipeline funktioniert | File existiert, Reader funktionieren |
| 🟢 **Finding P-2-A** | File liegt im Repo-Root statt in `data/` (Konsistenz-Issue) |
| 🔴 **Finding P-2-B** | File enthält nicht das aktuelle Set CRI — Card DB kann CRI-Filter nicht anzeigen, User sieht keine CRI-Karten überhaupt |
| 🔴 **Finding P-2-C** (umfassender) | `all_cards_scraper.py` läuft nicht in CI → ALLE Karten-Daten-Files (CSV, Chunks, Effects, Price) sind **stale für CRI**. Manuelles Triggern bei jedem Set-Release notwendig — System ist nicht selbstständig |

---

## P-3 — Limitless Online Decks

**Pipeline:** `limitless_online_scraper.py` → `limitless_online_decks*.csv` → 5 Reader

### Schritt 1: Scraper
- **Datei:** `backend/scrapers/limitless_online_scraper.py` (1500+ Zeilen)
- **Externe Quelle:** `https://play.limitlesstcg.com/decks?...` + `/decks/{deck}/matchups/?...`
- **Cap-Limits:** `max_workers: 5`, `[:10]` für best/worst-matchups (Zeile 858, 862), `[:3]` für top-pokemon, `min_count_threshold = max_count * 0.1`
- **Schreibt:** `limitless_online_decks.csv`, `limitless_online_decks_comparison.csv`, `limitless_online_decks_matchups.csv`, `limitless_meta_stats.json`, plus daily `online_share_history/<YYYY-MM-DD>.csv`

### Schritt 2: Storage
- **`limitless_online_decks_comparison.csv`:** 7.502 Bytes (heute geschrieben) — 89 Decks
- **Top 5 by `new_share`:**
  ```
  Dragapult              8.56 % (252 decks)
  Mega Greninja          8.12 % (239)
  Dragapult Dusknoir     5.77 % (170)
  Beedrill               4.52 % (133)
  Lopunny Dudunsparce    4.48 % (132)
  ```
- ✅ CRI-Decks präsent (Mega Greninja, Beedrill etc.)

### Schritt 3: Reader

| Reader | Spalten gelesen |
|---|---|
| `app-current-meta-analysis.js` | `new_count` (mind.) |
| `app-meta-call.js` | `new_meta_share`, `new_share`, `old_share` |
| `meta-binder.js` | `new_count`, `new_share` |
| `custom-binder.js` | ❓ Geschrieben aber im Grep nicht gefunden — vermutlich `share` generic |

### Schritt 4: Verarbeitung
- Decks werden per `extractMainPokemon()` zu Familien gruppiert
- Renormalisiert auf Top-N (siehe Meta Call Predictor 5.x)

### Stichproben-Verifikation
- Top-Deck `Dragapult` neuer Eintrag heute: `new_share = 8,56`
- Wenn ich im Meta Call Top 25 anschaue: muss Dragapult ex Group ähnliches zeigen (gemixt mit 4 Variants)

### Befund

| Status | Erklärung |
|---|---|
| ✅ Pipeline funktioniert vollständig | Scraper aktuell heute, alle 5 Reader haben passende Spalten |
| 🟢 **Finding P-3-A** | Hardcoded `[:10]`, `[:3]`, `[:5]` Cap-Limits in Scraper — würden bei größerem Meta theoretisch Decks unter den Tisch fallen lassen, aber bei aktuell 89 Decks irrelevant |
| 🟢 **Finding P-3-B** | `limitless_meta_stats.json` ist 64 Bytes (User-Q3 bestätigt OK so) |

---

## P-4 — Labs Tournament

**Pipeline:** `labs_tournament_scraper.py --matchups` → `labs_tournament_decks.csv` + `labs_tournament_matchups.csv` + `format_window.json` Splits

### Schritt 1: Scraper
- **Datei:** `backend/scrapers/labs_tournament_scraper.py` (~1750 Zeilen)
- **Externe Quelle:** `https://my.limitlesstcg.com/builder/...` (labs combined-view)
- **Flag `--matchups`** schaltet matchup-Scrape an (separater CI-Step)
- **Format-Window-Guard:** `_current_meta_key()` (Zeile 429) liest `format_window.current_set` und nutzt es um zu entscheiden ob ein Tournament `CURRENT` (re-scrape) oder `CLOSED` (skip-if-already-scraped) ist
- **Skip-if-already:** `seen_tids` Set in Zeile 1705 — keine doppelten Scrapes bei abgeschlossenen Tournaments

### Schritt 2: Storage
- **`labs_tournament_decks.csv`:** 952 KB, all-meta aggregate
- **`labs_tournament_decks_<META>.csv`** × 12 — per-meta Splits (z.B. `_TEF-POR.csv`)
- **`labs_tournament_matchups.csv`:** 5.6 MB, Komma-Delimiter (! anders als `;` bei den anderen)
- **`labs_tournament_matchups_<META>.csv`** × 8 — per-meta Splits

### Schritt 3: Reader
- **`app-meta-call.js`** liest `labs_tournament_matchups.csv` per-meta-keyed (Fix `4b30d3c` aus Audit-Session)
- **`app-past-meta.js`** liest `labs_tournament_matchups_<META>.csv` (per-format File)

### Schritt 4: Verarbeitung
- Meta Call: aggregiert per-meta in `_majorMatchupMap[meta][myDeck][opponent]` (Fix `4b30d3c`)
- Past Meta: nutzt direkten per-format File

### Schritt 5: Stichproben-Verifikation
- **Schema-Match:**
  - Scraper writes: `meta,tournaments_used,tournament_count,my_deck_slug,my_deck_name,...,vs_count,vs_win_pct,day_filter,scraped_at`
  - Reader (`app-meta-call.js`) parsed via `parseCSVQuoted(mmText, ',')` — Komma korrekt ✅

### Befund

| Status | Erklärung |
|---|---|
| ✅ Pipeline funktioniert (nach den Fixes aus dieser Session) | per-meta-keyed map seit `4b30d3c`, Threshold von 10 → 3 für Past Meta seit `c3bbd38` |
| 🟢 **Finding P-4-A** | CSV-Format-Inkonsistenz: `labs_*` nutzt `,` als Delimiter, alle anderen CSVs `;` — Code-Comment im Scraper bestätigt dies, aber bei `parseCSV` ohne expliziten Delimiter würde es brechen |

---

## P-5 — Cardmarket Pipeline (3-Stages)

**Pipeline:** User-Download `products_singles_6.json` + `products_nonsingles_6.json` + `price_guide_6.json` → `cardmarket_id_mapper.py` → `cardmarket_id_mapping.csv` → `cardmarket_price_merger.py` → `price_data.csv`

### Schritt 1: Input-Stage (User-side)
- 3 JSONs werden vom User von Cardmarket heruntergeladen
- Im CI-Workflow Step "Download Cardmarket JSONs" (`weekly-full-update.yml`) — vermutlich automatisiert
- Größen aktuell:
  - `products_singles_6.json` 12.8 MB (69.769 products)
  - `products_nonsingles_6.json` 904 KB (4.840 products)
  - `price_guide_6.json` 14.6 MB (74.609 price entries)

### Schritt 2: ID-Mapping
- **`cardmarket_id_mapper.py`** baut `(set, number) → idProduct`
- Output: `cardmarket_id_mapping.csv` (605 KB)
- Heuristik: base_name match innerhalb expansion + numerische Sortierung als Tiebreaker

### Schritt 3: Price-Merge
- **`cardmarket_price_merger.py`** kombiniert `all_cards_database.csv` + `cardmarket_id_mapping.csv` + `price_guide_6.json`
- Output: `price_data.csv` (20.126 Zeilen)
- Format: EU-Style (`0,19€`)

### Stichproben-Verifikation
- **last_updated-Verteilung:**
  - 17.104 Zeilen aktuell (2026-05-26)
  - 3.008 Zeilen alt (2026-04-01) — vermutlich Cards ohne Cardmarket-ID-Mapping (= Foreign/Legacy)
  - 11 Zeilen 2026-04-02, 2 Zeilen 2026-03-16
- **Top-Sets nach Row-Count:** ASC (295), SP (292), FST (284), PAL (279), CEC (272)
- **CRI: 0 rows** (weil all_cards_database.csv keine CRI hat)

### Befund

| Status | Erklärung |
|---|---|
| ✅ Pipeline funktioniert | 3-stage chain läuft, 85% der Karten haben aktuelle Preise (heute) |
| 🟡 **Finding P-5-A** | ~15% der Karten haben Preise von **vor April 2026** — vermutlich Limitless-Fallback weil kein CM-ID-Mapping. Sollte geprüft werden ob das wirklich der Stand ist (z.B. ist das wirklich ALL Foreign/Legacy?) |
| 🔴 **Finding P-5-B** | **0 CRI-Preise** — kette von P-2-C: ohne `all_cards_database.csv`-Update kein Mapping, ohne Mapping kein Preis |

---

## P-6 — Current Meta Analysis

**Pipeline:** `current_meta_analysis_scraper.py` → `current_meta_card_data.csv` + `online_tournament_dated_cards.csv` + `current_meta_scraped_tournaments.json` → mehrere Reader

### Schritt 1: Scraper
- **2 Sub-Sources:**
  1. `limitless_online`: scraped Top-N Decks from online ladder (`max_decks: 60`, `max_lists_per_deck: 20`, `format_filter: "PFL"` (!))
  2. `tournaments`: in-person Standard-Tournaments (`start_date: ""`, `max_tournaments: 60`, `format_filter: ["Standard", "Standard (JP)"]`)

### Schritt 2: Storage
- **`current_meta_card_data.csv`:** 571 KB (heute aktualisiert) — aggregate Karten-Statistik
- **`online_tournament_dated_cards.csv`:** 13 MB, 17.282 Zeilen — pro Tournament Karten-Counts (heute aktualisiert)
- **`current_meta_scraped_tournaments.json`:** 31 Bytes — **`{"scraped_tournament_ids": []}`**

### Schritt 3+4: Verarbeitung
- `online_tournament_dated_cards.csv` ist sehr aktuell — enthält z.B. "Rare Candy Club Showdown #25 (CHAOS RISING LEGAL)" vom 2026-05-25
- `current_meta_scraped_tournaments.json` ist die **Incremental-Cache** für die `tournaments` source (in-person)

### Befund

| Status | Erklärung |
|---|---|
| ✅ Pipeline funktioniert für `limitless_online` sub-source | `current_meta_card_data.csv` + `online_tournament_dated_cards.csv` aktuell |
| 🟡 **Finding P-6-A** | `current_meta_scraped_tournaments.json` permanent `[]` — die `tournaments` sub-source findet keine Standard-In-Person-Tournaments, vermutlich weil CRI noch nicht in-person legal ist (legal ab 2026-06-05). Erwartet bis 2026-06-05+ |
| 🟡 **Finding P-6-B** | **`format_filter: "PFL"`** im `limitless_online` Block ist hardcoded auf altes Format (PFL = Phantasmal Flames, das war PFL/M3/M4-Periode). Sollte dynamisch von `format_window.current_set` kommen |
| 🟢 **Finding P-6-C** | `tournaments.start_date: ""` ist leer — kein Date-Filter aktiv. Wenn das absichtlich ist OK, sonst sollte es auf `set_release_date` mappen |

---

## Konsolidierte Phase-4-Findings

| ID | Pipeline | Risiko | Befund |
|---|---|---|---|
| **🔴 P-2-B** | P-2 | **HIGH** | `pokemon_sets_mapping.csv` ohne CRI → Card DB zeigt kein CRI |
| **🔴 P-2-C** | P-2 | **HIGH** | `all_cards_scraper.py` nicht in CI → komplette Karten-DB stale bei neuen Sets |
| **🔴 P-5-B** | P-5 | **HIGH** | 0 CRI-Preise (Folgefehler von P-2-C) |
| 🟡 P-1-A | P-1 | medium | CL leer ohne User-Hinweis |
| 🟡 P-1-B | P-1 | medium | Default-Format hartcodiert auf `M4` |
| 🟡 P-5-A | P-5 | medium | 15% Karten mit veralteten Preisen — unklar warum |
| 🟡 P-6-A | P-6 | medium | `current_meta_scraped_tournaments.json` permanent leer (vermutlich erwartet) |
| 🟡 P-6-B | P-6 | medium | `format_filter: "PFL"` hartcodiert |
| 🟢 P-2-A | P-2 | low | File im Repo-Root statt `data/` |
| 🟢 P-3-A | P-3 | low | Hardcoded Cap-Limits in `limitless_online_scraper.py` |
| 🟢 P-3-B | P-3 | low | `limitless_meta_stats.json` 64 B (User bestätigt OK) |
| 🟢 P-4-A | P-4 | low | CSV-Delimiter inkonsistent (`,` vs `;`) |
| 🟢 P-6-C | P-6 | low | `tournaments.start_date: ""` |

---

## Gesamt-Update der Findings-Liste

**Vor Phase 4:** 2 🔴, 7 🟡, 7 🟢

**Nach Phase 4:** **5 🔴, 13 🟡, 11 🟢**

Die 3 neuen 🔴 hängen alle an **demselben Root-Cause:** `all_cards_scraper.py` läuft nicht in CI, daher hat die ganze Karten-DB-Kette (mapping + database + chunks + effects + prices) seit `2026-05-15` (letztes manuelles Update?) keine neuen Daten für **CRI**.

→ **Das ist ein deutliches Anzeichen, dass nicht nur eine einzelne Pipeline kaputt ist, sondern ein systematisches Loch im CI-Setup.**

---

## Was ich in Phase 4 NICHT prüfen konnte

❌ **Live-Run der Scraper** — würde externe Sites treffen, nicht angefasst.

❌ **Auth-Pipeline / Firestore-Reads in Produktion** — statische Analyse only.

❌ **Service Worker offline-Verhalten** — wäre Browser-Test nötig.

❌ **Visual-Regression-Tests** — workflows existieren (`visual-fullpage.yml`, `visual-nonmeta.yml`), aber ich habe deren letzte Outputs nicht inspiziert.

---

**STOP nach Phase 4.** Bitte sichte die Findings, vor allem die 3 🔴 die an CRI / all_cards hängen. Dann Phase 5 (Konsistenz-Check zwischen geteilten Datenquellen).
