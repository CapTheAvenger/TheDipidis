# Phase 2 — Data Flow: Scraper → Storage → Loader → Logic → UI

**Stand: 2026-05-23, origin/main @ 851b420**

Alle Aussagen unten sind durch direktes Lesen der Files belegt — Pfade + Zeilen + reale Stichproben.

---

## 2.1 — Quell-Daten in der Generate-Pipeline

| Daten-Layer | File | Wer schreibt es | Wer liest es im Generate-Pfad |
|---|---|---|---|
| **Online (Meta Live)** | `data/current_meta_card_data.csv` | `backend/scrapers/current_meta_analysis_scraper.py` | `loadCurrentMetaRowsWithFallback` → `data` (filter='all'/'live') |
| **Major** | `data/tournament_cards_data_cards*.csv` (per-meta chunks) | `backend/scrapers/tournament_scraper_JH.py` + assembly in `prepare_card_data.py` | `loadCSV('tournament_cards_data_cards.csv', { latestChunkOnly: true })` → `window.currentMetaTournamentCardsData` |
| **Online dated (Recency)** | `data/online_tournament_dated_cards.csv` | `backend/scrapers/current_meta_analysis_scraper.py` (dual-emit) | `loadOnlineTournamentDatedRows()` |
| **Meta-Card Boost** | `current_meta_card_data.csv` (re-used) | s.o. | `window.metaCardData[source]` (vom Meta-Cards-Loader) |

## 2.2 — Scraper-Verbindung

### `current_meta_analysis_scraper.py`
- Settings: `config/scraper_settings.json` → `current_meta_analysis`
- Quellen (zwei Subscraper):
  1. **Limitless Online** (`play.limitlesstcg.com/decks?game=PTCG`): erzeugt Meta Live rows
  2. **Tournaments** (`labs.limitlesstcg.com`): erzeugt Meta Play! rows
- Output: `current_meta_card_data.csv` (1 Row pro [archetype, card, meta]) + Dual-emit nach `online_tournament_dated_cards.csv` (mit Datum)
- Settings für Lucario-relevante Zeit-Fenster:
  - `current_meta_analysis.sources.tournaments.start_date = "05.06.2026"` (= in-person legal date post-rotation)
  - `current_meta_analysis.sources.tournaments.max_tournaments = 15`
- CI-Frequenz: weekly (Tuesday 06:00 UTC) via `.github/workflows/weekly-full-update.yml`

### `tournament_scraper_JH.py`
- Settings: `config/scraper_settings.json` → `tournament_JH`
- Tournament-Filter: `["Regional", "Special Event", "LAIC", "EUIC", "NAIC", "Worlds", "International", "Championship"]`
- Output: `tournament_cards_data.csv` (Monolith) wird von `prepare_card_data.py` in per-meta chunks zerlegt → `tournament_cards_data_cards_TEF-POR.csv` etc.
- 1 Row pro [tournament_id, archetype-with-price-tag, card, print]
- Wichtige Felder: `tournament_id`, `tournament_name`, `tournament_date`, `archetype`, `card_name`, `deck_inclusion_count`, `total_count`, `max_count`, `total_decks_in_archetype`, `set_code`, `set_number`

### Caps/Limits — bekannt aus dem History-Audit-Kontext
- JH-Scraper: keine harten max_decklists pro Turnier, aber `start_tournament_id=391` filtert alte Events raus
- current_meta_analysis: `max_tournaments=15` für Tournaments-Subscraper, `max_decks=60` für Limitless-Online-Subscraper, `max_lists_per_deck=20`
- **Bekannte Coverage-Lücke** (separat ge-tracked unter `claude/rescrape-utrecht`): tournament 535 = Regional Utrecht hatte beim Initial-Scrape nur 4 Archetypes / 5 Decks erfasst statt der erwarteten ~67. Wurde gerade re-queued.

## 2.3 — Daten-Integrität (Stichprobe Lucario Hariyama)

Verifiziert durch direkten CSV-Read am 2026-05-23:

**`current_meta_card_data.csv`** — Lucario Hariyama:
- 50 rows insgesamt: 46× Meta Live + 4× Meta Play!
- Meta Live `total_decks_in_archetype` = **20** (= 20 unique Lucario-Decks im Limitless-Online-Pool)
- Schema-Spalten: `archetype; card_name; card_identifier; total_count; max_count; deck_inclusion_count; average_count; average_count_overall; total_decks_in_archetype; percentage_in_archetype; set_code; set_number; rarity; type; image_url; is_ace_spec; meta`

**`tournament_cards_data_cards_TEF-POR.csv`** — Lucario Hariyama:
- 134 rows
- 4 bucket-keys = [(tournament_id, price-tagged-archetype)]:
  - **Major total decks (cumulative) = 34** über alle 4 buckets
  - Combined-Total = 20 (Online) + 34 (Major) = **54** Decks

**Stichproben — Online+Major-additive Berechnung manuell reproduziert:**

| Card | On_dc | On_tc | Maj_dc | Maj_tc | Cmb_dc | Cmb_tc | avg=Cmb_tc/Cmb_dc | %share=Cmb_dc/54 | Screenshot |
|---|---|---|---|---|---|---|---|---|---|
| Wally's Compassion | 17 | 23 | 30 | 36 | 47 | 59 | **1.26** | **87.0%** | 87.0% / 1.26 ✓ |
| Fighting Energy | 20 | 205 | 34 | 324 | 54 | 529 | **9.80** | **100.0%** | 100% / 9.80 ✓ |
| Rocky Fighting Energy | 9 | 17 | 24 | 47 | 33 | 64 | **1.94** | **61.1%** | 61.1% / 1.94 ✓ |

**Fazit:** Die angezeigte Ø-Spalte (1.26 / 9.80 / 1.94) ist eindeutig das Online+Major-additive Average. Reproduziert mit echten Daten — keine Hypothese mehr.

## 2.4 — Datenformat-Vertrag (für Generate-Pipeline relevant)

### `current_meta_card_data.csv` (Online + Meta Play!-Lite)
```
archetype                — string (canonical archetype name)
card_name                — string
card_identifier          — "SET NUMBER" (z.B. "DRI 173")
total_count              — int (Sum-of-copies across all decks in archetype)
max_count                — int (max copies in a single deck)
deck_inclusion_count     — int (= "deck_count" für die Aggregation; how many decks include this card)
average_count            — string "1,35" or "1.35" (deck_inclusion_count > 0 ? total_count/deck_inclusion_count : 0)
average_count_overall    — string (total_count/total_decks_in_archetype)
total_decks_in_archetype — int
percentage_in_archetype  — string "87,0"
set_code                 — string
set_number               — string
rarity                   — string
type                     — string ('Item', 'Pokémon Tool', 'Supporter', 'Stadium', 'Energy', 'Special Energy', 'Basic'/'Stage X', ...)
image_url                — string
is_ace_spec              — 'Yes' | 'No'
meta                     — 'Meta Live' | 'Meta Play!'
```

### `tournament_cards_data_cards_*.csv` (Major, per-meta chunked)
```
tournament_id            — string ('544')
tournament_name          — string ('Regional Campinas – Limitless')
meta                     — meta-code string ('TEF-POR')
tournament_date          — string ('16th May 2026' — ordinal English)
archetype                — string MIT price-tag suffix ('Lucario Hariyama28.74$22.10€')
card_name                — string
card_identifier          — 'SET NUMBER'
total_count              — int
max_count                — int
deck_inclusion_count     — int
average_count            — string "3,45"
total_decks_in_archetype — int (PER BUCKET — per (tournament_id, price-tagged-archetype))
percentage_in_archetype  — string
set_code                 — string
set_number               — string
rarity                   — string
type                     — string
image_url                — string
is_ace_spec              — 'Yes' | 'No'
```

⚠ **Wichtiger Vertragsbruch zu G3 (Top-64-Weighting):** Es gibt **KEINE placement-Spalte** in `tournament_cards_data_cards_*.csv`. Weder `placement`, noch `rank`, noch `player_name`. Heißt: G3-Stretch ("Top-64 vom letzten Major höher gewichten") ist mit der aktuellen Datenmenge **nicht implementierbar** ohne Scraper-Erweiterung.

`data/labs_tournament_decks.csv` HAT player_count + day1/day2-stats + share_pct, aber NICHT card-level data. Heißt: Top-64-Placement-Info ist in einer SEPARATEN Datei und nicht mit den Card-Daten verknüpft.

### `online_tournament_dated_cards.csv` (Recency-Online-Source)
- Quelle: dual-emit aus `current_meta_analysis_scraper.py`
- Per-row tournament_date
- Verwendet im Recency-Decay (Schritt 5 der Pipeline) — siehe `02-current-logic.md` Logik 5

## 2.5 — Pipeline-Reproduktion: Math.round-Summe

Aus den drei verifizierten Stichproben + 20 weiteren Cards im Screenshot (handvalidiert):

```
Sum of Math.round(avgCountWhenUsed) für alle 23 Cards = 62
```

Da Stage 0/1/2 jeweils `Math.round(exactAvg)` verwendet und sich auf 62 summiert (> 60), läuft anschließend **Reverse-LRM** (line 5130) und trimmt 2 Slots.

**Beobachtet vs. erwartet** (Math.round-Initial → User-sichtbarer Wert):

| Card | Math.round | UI | Δ | Vermutung |
|---|---|---|---|---|
| Wally's Compassion | 1 | 2 | **+1** | ⚠ Forward-LRM oder _recommendedCount-Override (Phase 3 verifiziert) |
| Fighting Energy | 10 | 9 | -1 | Reverse-LRM trim, _lrmRemainder=-0.20 |
| Rocky Fighting Energy | 2 | 1 | -1 | Reverse-LRM trim, _lrmRemainder=-0.06 |
| Night Stretcher | 2 | 1 | -1 | Reverse-LRM trim, _lrmRemainder=-0.43 |

**Net Δ:** +1 -3 = -2 → erklärt 62 → 60. Aber: Wenn Reverse-LRM läuft, sollte Forward-LRM NICHT laufen (mutually exclusive). Wally's Compassion sollte also bei 1 bleiben.

**Anomalie #1:** Wally's bump von 1 → 2 ist nicht durch reine Math.round + LRM erklärt. Eine der drei Möglichkeiten:
- (a) Combined-Variants-Merge setzt `_recommendedCount = 2` (Wally's hat mehrere Print-Variants)
- (b) Stage 0 fired für Wally's mit default exactAvg = 2 (Zeile 7417)
- (c) Eine andere Pipeline-Stelle modifiziert `entry.count` nach Reverse-LRM

→ **Phase-3-Verifikation** nötig.

## 2.6 — Diskrepanzen zwischen Soll und Datenmaterial

| Soll-Spec | Datenmaterial verfügbar? | Anmerkung |
|---|---|---|
| G2 — Recency (fresh > old) | ✅ `online_tournament_dated_cards.csv` hat per-row Datum; `tournament_cards_data_cards.csv` hat tournament_date | Daten reichen, Decay-Logik in Code vorhanden — ABER nur für Score-Input, nicht für avgCountWhenUsed |
| G2 — "nach dem letzten Major" als Cutoff | ❌ Code macht reine Zeit-Decay (Tage seit heute), kein Event-Cutoff | Datenmaterial würde es hergeben (tournament_date in Major-Source) — Code-Erweiterung möglich |
| G3 — Top-64 vom letzten Major | ❌ **Keine placement-Spalte in `tournament_cards_data_cards*.csv`** | Würde Scraper-Erweiterung erfordern: JH-Scraper müsste placement pro Decklist mitschreiben |
| G4 — Math.round + LRM auf 60 | ✅ Funktioniert wie spec'd, ABER mit potentiellem Tier-Multiplier-Bug in Reverse-LRM | siehe Anomalie + Phase-1-Doc Logik 4 |
| AC5 — Display ≡ Allocation-Source | ⚠ Online+Major-merge schreibt sowohl avg in row (für Display) als auch avgCountWhenUsed (für Allocation) — sollten identisch sein, prüfe Phase 3 | |

---

## Open Questions für Phase 3

1. **Wally's Compassion 1.26 → 2:** Welcher Code-Pfad bumpt? Verifiziere durch Instrumentation der Pipeline.
2. **Reverse-LRM CORE-Protection:** Code-Kommentar (Zeile 5125-5128) behauptet "CORE less likely to be trimmed first", aber das mathematische Effekt für negative Remainders ist GENAU UMGEKEHRT — CORE × 1.15 macht negative remainders MEHR negativ → FRÜHER getrimmt. Verifiziere ob das tatsächlich auftritt.
3. **G3 Top-64 — feasibility:** Bestätigung dass es NUR mit Scraper-Erweiterung machbar ist (oder: gibt's eine andere Datenquelle die ich übersehen habe?).
4. **Recency-im-avgCountWhenUsed:** Code-Kommentar (Zeile 6250) sagt explizit "weighted_share REPLACES baseline share in score formula, NOT in display values / avgCountWhenUsed". Heißt G2-Recency wirkt aktuell NUR auf "wird die Karte überhaupt ausgewählt" (consistency-score-gate), nicht auf "wie viele Kopien".
