# AUDIT_DATA_PIPELINE.md

Data-Engineering-Audit · CapTheAvenger/TheDipidis · Scraper → CSV → Frontend/Firestore

**Audit-Basis:** `main` @ `9bd63de` (2026-06-12), read-only Analyse. Eigene
Python-/Bash-Probes in `/tmp/` (jede Zahl im Report stammt aus einem
ausgeführten Command, nicht aus Schätzung). 22 Production-Scraper, 69
CSVs, 42 JSONs. Quellen: 100 % limitlesstcg.com / labs.limitlesstcg.com /
play.limitlesstcg.com / cardmarket.com.

---

## Executive Summary

Die Pipeline läuft technisch sauber: 0 Schema-Drift in 69 CSVs, 0
Encoding-Probleme, einheitliche ISO-8601-Datumsformate, alle JSONs
parsen, `npm`-/Action-Layer wurde im GitHub-Audit gerade auf Single
Source of Truth gezogen. Die wirklichen Risiken liegen in **drei
Bereichen**: (1) Slug-Kollisionen in `labs_tournament_decks.csv` —
4 Archetype-Namen (Okidogi, Alakazam, Tyranitar, Toxtricity Box)
haben zwei Slug-Varianten, die das Frontend stillschweigend auf einen
Eintrag pro Turnier addiert. (2) `top8_conv_rate` ist in den
aktuellen 236 Window-Rows zu **100 %** leer — der Predictor 4.4b
fällt seit Wochen auf einen synthetischen Day-1→Day-2-Ratio-Fallback
zurück, der für Mini-Stichproben (1–2 Piloten) reine Phantomzahlen
erzeugt hat (siehe AUDIT_GITHUB.md F-D-Series Korrekturen). (3) Das
CI-Weekly committet ohne Sanity-Check, was eine Klasse von
„Scraper-Bug → leere CSV → User sieht nichts"-Vorfällen möglich
macht. **0 hartkodierte Secrets** in tracked Code (auch hier, parallel
zu AUDIT_GITHUB.md). 20 Findings, davon 1 HIGH, 4 MEDIUM, 15 LOW.

---

## Datenqualitäts-Scorecard

| Datei | Rows | Cols | Update | Score | Begründung |
|---|--:|--:|---|:--:|---|
| `all_cards_database.csv` | 20 248 | 12 | 2 d | **A** | aktuell, 0 Dups, 0 NULLs |
| `all_cards_merged.csv` | 20 455 | 12 | 20 d | **B** | OK, Update-Pfad nur über `prepare_card_data.py` |
| `cardmarket_id_mapping.csv` | 17 220 | 5 | 2 d | **A** | täglich frisch |
| `current_meta_card_data.csv` | 4 847 | 17 | 2 d | **A** | Pipeline-Hauptarbeitspferd, alle Felder befüllt |
| `online_tournament_dated_cards.csv` | 26 601 | 21 | 2 d | **B** | `set_name=100 %`, `is_ace_spec=100 %` NULL (F-D12) |
| `online_tournament_top8_decks.csv` | 108 | 10 | 2 d | **A** | klein aber aktuell |
| `online_tournament_winners.csv` | 50 | 6 | 2 d | **A** | klein, sauber |
| `labs_tournament_decks.csv` | 4 585 | 36 | 2 d | **C** | 22 Slug-Kollisionen (F-D07), `top1/4/8_count=88–100 %` NULL (F-D10) |
| `labs_tournament_decks_*.csv` (10 Format-Splits) | 65–665 | 36 | 2 d | **B** | für aktiv blendende Metas frisch; geschlossene frozen by design |
| `labs_tournament_decks__unsorted.csv` | 96 | 36 | 2 d | **D** | Format-Lag-Bucket ohne Cleanup-Pipeline (F-D08) |
| `labs_tournament_matchups.csv` | 44 458 | 16 | 2 d | **A** | Hauptmatchup-Master, sauber |
| `labs_tournament_matchups_*.csv` (12 Format-Splits) | 1.5–8 k | 16 | 14 d | **B** | geschlossene Metas frozen |
| `limitless_online_decks.csv` | 118 | 10 | 2 d | **A** | aktuell |
| `limitless_online_decks_comparison.csv` | 118 | 15 | 2 d | **A** | aktuell |
| `limitless_online_decks_matchups.csv` | 1 128 | 5 | 2 d | **A** | aktuell |
| `player_continuity.csv` | 5 107 | 11 | 2 d | **B** | `country=100 %`, `meta=100 %` NULL — Scraper-Side-Gap, Predictor 5.8 ignoriert beides |
| `price_data.csv` | 20 242 | 7 | 0 d | **A** | täglich, 0.1 % missing prices |
| `tournament_cards_data_cards_*.csv` (16 Format-Splits) | 1 k–74 k | 20 | 20 d | **B** | `set_name=100 %` NULL (F-D11), Past-Meta-Snapshots |
| `tournament_cards_data_overview.csv` | 110 | 9 | 20 d | **A** | aktuell für Past Meta |
| `tournament_decklists_per_player.csv` | 9 800 | 20 | 2 d | **C** | **nur 1 Turnier** (Turin) — kein Backfill-Pfad (F-D09) |
| `city_league_analysis.csv` | 0 | 22 | 20 d | **F** | leer — **JP Sommerpause**, kein Bug (siehe F-D06) |
| `city_league_archetypes.csv` | 0 | 8 | 20 d | **F** | leer — Sommerpause |
| `city_league_archetypes_comparison.csv` | 0 | 14 | 20 d | **F** | leer — Sommerpause |
| `city_league_archetypes_deck_stats.csv` | 0 | 7 | 20 d | **F** | leer — Sommerpause |
| `city_league_analysis_M3.csv` | 133 437 | 22 | 18 d | **B** | Legacy-JP-Periode, von `generate-bot-deck-index.py:344` konsumiert |
| `city_league_analysis_past.csv` | 179 405 | 22 | 18 d | **A** | aktuell für Past Meta |
| `city_league_archetypes_past.csv` | 8 693 | 8 | 14 d | **A** | aktuell |
| `city_league_archetypes_past_comparison.csv` | 344 | 14 | 14 d | **A** | aktuell |
| `city_league_archetypes_M3.csv` | 6 706 | 8 | 20 d | **D** | ungenutzt (F-D16) |
| `city_league_images_M3.json` | 307 | — | 20 d | **D** | ungenutzt (F-D17) |
| `card_actions.json` | 3 cats | — | 20 d | **D** | write-only nach F-01 Playtester-Cleanup (F-D14) |
| `japanese_cards_database.json` | 779 | — | 20 d | **D** | write-only, nur `.csv` konsumiert (F-D15) |
| `_archetype_mapping_gaps.json` | 5 keys | — | — | **C** | Audit-Debug-Output, akzeptabel (F-D18) |
| `format_window.json` | 11 keys | — | 5 d | **A** | manuell + autom., Single Source of Truth für Rotation |
| `cards_chunk_{standard,extended,legacy}.json` | 3 762 / 4 455 / 12 031 | — | 5 d | **A** | sauber, valide |
| `price_guide_6.json`, `products_singles_6.json`, `products_nonsingles_6.json` | — | — | 2 d | **A** | Cardmarket-Dump-Mirror |

**Verteilung:** A = 19 Files, B = 7, C = 3, D = 6, F = 4 (alle F-Files sind die Sommerpause-CL-Quartette).

---

## Findings-Tabelle

| ID | Severity | Bereich | Datei/Scraper | Befund | Beleg | Empfehlung |
|---|---|---|---|---|---|---|
| F-D01 | LOW | Politeness | alle Scraper | Kein einziger Scraper konsultiert `robots.txt`. limitlesstcg.com erlaubt es informell via cloudscraper, aber rechtlich wäre eine Check-Routine sauber. | `grep -lE "robots\.txt\|robotparser" backend/` → 0 | Optional: einmaliger `urllib.robotparser`-Check zu Lauf-Start. |
| ~~F-D02~~ | ~~LOW~~ | ~~Logging~~ | — | **Phase-1-Befund war falsch.** `scraper-logs` werden tatsächlich als CI-Artifact upgeloadet. | `weekly-full-update.yml:454-466` zeigt `actions/upload-artifact@v4` Step mit retention 7 Tage. | — (gestrichen) |
| F-D03 | MEDIUM | Code-Konsistenz | `card_actions_builder.py:222`, `archetype_mapping_audit.py`, `backfill_labs_tournament_id.py`, `clean_past_meta_archetypes.py` | 4 Scraper nutzen NICHT das zentrale Logging/Fetching aus `card_scraper_shared`. `card_actions_builder` ruft `urllib.request.Request` direkt mit minimaler UA `TheDipidis/1.0` — kein cloudflare-bypass, kein retry, kein backoff. | `grep -L "setup_logging" backend/scrapers/*.py` zeigt die 4 Files; `card_actions_builder.py:222` direct urllib | Production-Pfad (`card_actions_builder`) auf `safe_fetch_html` migrieren; Migrations OK. |
| F-D04 | MEDIUM | CI-Resilienz | `weekly-full-update.yml` | `set +e` + `exit 0` an 5 Stellen — Komplett-Ausfall einer Datenquelle wird zu Warnung degradiert, Pipeline pusht trotzdem. | `weekly-full-update.yml:280, 342, 369, 392, 414` (`::warning::Scraper $step exited with $rc (continuing batch)`) | Pro Step bei `rc != 0` UND vorhandenem vorherigem File `git checkout -- <file>` (rollback statt leeren Push). |
| F-D05 | LOW | Reproduzierbarkeit | alle Scraper | `DEFAULT_DELAY` Werte verschieden: 0.3 / 0.5 / 1.0 / 1.5 s zwischen den Scrapern. | `grep -nE "DEFAULT_DELAY\|delay_between"` zeigt 7 verschiedene Defaults | Optional: One-pager mit Werten + Begründung, oder Konsolidierung. |
| F-D06 | ~~HIGH~~ → **INFO** | Daten-Lifecycle | `city_league_analysis.csv`, `city_league_archetypes.csv`, `city_league_archetypes_comparison.csv`, `city_league_archetypes_deck_stats.csv` | **Korrigiert vom Maintainer:** 4 Current-CL-Files sind leer weil **Japan gerade Sommerpause hat** — die Quelle liefert keine neuen Turniere. Kein Bug, expected behaviour. Frontend zeigt entsprechende „no data"-State. | `head -2 data/city_league_*.csv`; Maintainer-Bestätigung 2026-06-12 | Keine Aktion. Wenn die Saison wieder anläuft, sollte F-D19 (Sanity-Check) als Schutz gegen versehentliche Leer-Pushes greifen. |
| F-D07 | MEDIUM | Daten-Integrität | `labs_tournament_decks.csv` | 22 Key-Duplikate auf `(tournament_id, deck_name)` durch 4 Archetype-Namen mit 2 Slug-Varianten: `Okidogi` (`-ex`/`-twm`), `Alakazam` (`-meg`/`-ex`), `Tyranitar` (`-ex`/`-jtg`), `Toxtricity Box` (`-pfl`/`-box`). Predictor in `app-meta-call.js:4780-4782` keyt auf `normalize(deck_name)` → addiert Shares aus zwei Slugs pro Turnier in einen Eintrag. | `/tmp/labs_dup_detail.py` + `/tmp/labs_dup5.py`; `app-meta-call.js:4780-4782` | Predictor: Key auf `(deck_name, deck_slug)` ziehen (oder slug-tag in `name` mergen); ODER Scraper: 4 doppelten `deck_name` durch slug-spezifische Namen ersetzen (`Okidogi ex` / `Okidogi TWM`). Quantitativ klein (Long-Tail, < 0.5 % share/slug), aber Korrektheitsfix. |
| F-D08 | MEDIUM | Daten-Lifecycle | `labs_tournament_decks__unsorted.csv` | 96 Rows mit 100 % NULL `tournament_date`, `meta`, `top*_count`. Scraper warnt explizit „Routing to _unsorted; manual classification needed" (`labs_tournament_scraper.py:497`), aber kein Workflow räumt das auf. Files akkumulieren bis Operator manuell eingreift. | `head data/labs_tournament_decks__unsorted.csv`; `grep -rE "labs_tournament_decks__unsorted"` zeigt 0 Konsumenten | Operator-Issue automatisch öffnen bei `__unsorted` rows > 0 nach weekly run. |
| F-D09 | LOW | Daten-Coverage | `tournament_decklists_per_player.csv` | **Nur 1 Turnier abgedeckt** (Turin, 380 Decks, 9 800 Rows). Per-Decklist-Scraper läuft Di + manuell, hat aber kein Backfill für ältere Events. War schon Auslöser für „Card Replacement Suggester"-Revert. | `/tmp/per_decklist_audit.py` → `distinct tournaments: 1` | Backfill-Job für die wichtigsten 10 Events der laufenden Rotation; oder Feature-Disabling bis Coverage > 5 Turniere. |
| F-D10 | LOW | Daten-Coverage | `labs_tournament_decks*.csv` | `top1_count`, `top4_count`, `top8_count` zu 88–100 % NULL. Predictor 4.4b muss synthetischen Day-1→Day-2-Ratio-Fallback nutzen (was zu den 2-Piloten-„40 % Top-8"-Artefakten in AUDIT_GITHUB führte). | `/tmp/csv_audit.py` Output | Scraper-Quelle prüfen ob das Feld bei Limitless verfügbar ist. Wenn nicht: Synthetic-Path mit Sample-Size-Guard (≥ 3 Piloten) ist die richtige Antwort — bereits in PR #361 implementiert. |
| F-D11 | LOW | Daten-Coverage | `tournament_cards_data_cards_*.csv` (16 Files) | `set_name=100 %` NULL durchgehend. Spalte im Schema, nie befüllt. | `/tmp/csv_audit.py` | Spalte aus Schema droppen oder Scraper anpassen — keine Konsequenz für aktuellen Frontend-Pfad. |
| F-D12 | LOW | Daten-Coverage | `online_tournament_dated_cards.csv` | `set_name=100 %` und `is_ace_spec=100 %` NULL. `is_ace_spec` wird vom Predictor aus `ace_specs.json` gezogen, aber `current-meta-quickref.js` greift teilweise auf das Row-Feld zu. | dito + `current-meta-quickref.js:190` | `is_ace_spec` aus Row entfernen, immer `ace_specs.json` als Truth verwenden. |
| F-D13 | LOW | Daten-Coverage | `price_data.csv` | 28 von 20 242 Rows (0.1 %) haben leeren `eur_price`. Frontend rendert „— €" sauber. | `/tmp/price_format.py` | Akzeptabel als Cardmarket-Gap. |
| F-D14 | LOW | Dead Data | `card_actions.json` (20 KB) + `card_actions_builder.py` | Write-Only Restbestand. In-app Playtester (Konsumer) wurde in AUDIT_GITHUB F-01 entfernt. | `grep -rE "card_actions\.json" --include=*.js --include=*.html` → 0 | Datei + Builder löschen oder in `_archive/` ziehen. |
| F-D15 | LOW | Dead Data | `japanese_cards_database.json` (220 KB) | Vom JP-Scraper geschrieben, nirgends gelesen. Nur `.csv` Version konsumiert. | `grep -rE "japanese_cards_database\.json"` → nur Scraper-Write | JP-Scraper: JSON-Output entfernen, nur CSV schreiben. |
| F-D16 | LOW | Dead Data | `city_league_archetypes_M3.csv` (726 KB) | Wird nirgends gelesen (im Gegensatz zu `_analysis_M3.csv` das vom bot-deck-index konsumiert wird). | `grep -rE "city_league_archetypes_M3"` → 0 | Löschen. |
| F-D17 | LOW | Dead Data | `city_league_images_M3.json` (32 KB) | Analog ungenutzt. | dito | Löschen. |
| F-D18 | LOW | Debug-Artifact | `_archetype_mapping_gaps.json` (4 KB) | Audit-Debug-Output (`archetype_mapping_audit.py`). Akzeptabel falls als Operator-Hilfe behalten. | grep | Behalten als Operator-Lookup, ODER in `_archive/` verschieben falls nicht mehr nötig. |
| F-D19 | **HIGH** | CI-Resilienz | `weekly-full-update.yml` Commit-Schritt | **Kein Sanity-Check zwischen Scrape und Commit.** Ein Scraper der eine leere CSV produziert wird genauso committet wie ein guter Lauf. Genau dieser Mechanismus würde z. B. ein zukünftiges Limitless-Cloudflare-Eskalation auf den labs-Pfad „grünes CI mit leeren Daten" produzieren lassen — User sieht nichts, niemand merkt's bis manuell geprüft. | `weekly-full-update.yml:473-478` (nur `git diff --cached --quiet`-Check); kein `wc -l > N` Gate. F-D06 (Sommerpause) wäre kein Risiko gewesen, aber jeder Cloudflare-Vorfall wäre's. | Pre-Commit-Block: pro Critical-CSV minimum-row-Schwelle prüfen; bei < min `git checkout -- <file>` (rollback statt leeren Push). Schwellenwertdatei in `config/` pflegen. Für Sommerpause-Files: Schwelle = 0 explizit setzen. |
| F-D20 | MEDIUM | CI-Resilienz | `weekly-full-update.yml` Step-Loop | Verwandt zu F-D04 + F-D19: `set +e` + `exit 0` schluckt Scraper-Crashes, die Job-Level-Summary läuft nur in der Console (`rc_summary+=...`), niemand bekommt Notifikation bei Multi-Fail. | `weekly-full-update.yml:280-285, 342-345` | Job-Level-Failure-Summary als auto-Issue oder als Slack/Telegram-Webhook posten wenn >0 FAILs. |

---

## Top 5 Risiken für die Predictor-Qualität

„Garbage in, garbage out" — diese 5 Punkte beeinflussen die Predictor- /
Recommendation-Engine am direktesten:

### 1. F-D07 — Slug-Kollisionen (Okidogi, Alakazam, Tyranitar, Toxtricity Box)

**Was:** Vier Archetype-Namen sammeln zwei verschiedene Slug-Varianten pro
Turnier. Das Frontend keyt nur auf `normalize(deck_name)` und addiert
deren `share_pct` in einen Eintrag.

**Konsequenz:** Im Meta-Call-Predictor erscheinen diese 4 Archetypen
mit ~doppeltem Field-Share pro Turnier. Quantitativ klein (Long-Tail
< 0.5 % share/slug), aber bei genau dieser Sample-Größe ist Toxtricity
Box als Dark-Horse vorgeschlagen worden (siehe AUDIT_GITHUB F-Synthetic-
Conv). Der Bug hat real schon zu falschen Empfehlungen geführt.

**Quick-Fix:** Im Scraper `deck_name` mit slug-tag versehen
(`Toxtricity Box` → `Toxtricity Box (PFL)`), oder im Predictor den
Aggregations-Key auf `(deck_name, deck_slug)` ziehen.

### 2. F-D10 — `top8_conv_rate` = 100 % NULL im aktuellen Format

**Was:** Für alle 236 Rows im aktuellen Format-Window (`TEF-CRI`) ist
`top8_conv_rate = 0.0`. Predictor 4.4b nutzt einen synthetischen
Fallback aus dem Day-1→Day-2-Share-Verhältnis, gedeckelt bei 40 %.

**Konsequenz:** Der dark-horse-Empfehlungspfad hat „40 % Top-8"
Pseudo-Werte für Mini-Stichproben (1–2 Piloten) produziert
(Archaludon, Toxtricity Box bei Turin). Der Sample-Guard ist in PR
#361 eingebaut — der zugrundeliegende Datenmangel bleibt aber.

**Quick-Fix:** Scraper-Source-Check: Liefert Limitless das Feld
überhaupt für die aktuellen Events? Falls nein, im Frontend
`top8_conv_rate` semantisch von „Top-8 conversion" auf „Day-1→Day-2
share gain" umlabeln, um Erwartungs-Mismatch zu vermeiden.

### 3. F-D09 — Per-Decklist nur 1 Turnier abgedeckt

**Was:** `tournament_decklists_per_player.csv` enthält 380 Decks aus
einem einzigen Turnier (Turin Special Event).

**Konsequenz:** Per-Decklist-basierte Features (MostConsistency-Build,
„best successful list", per-pilot weighting) operieren auf einer Mini-
Sample-Größe — exakt das war 2026-06 Auslöser für den „Card
Replacement Suggester"-Revert.

**Quick-Fix:** Backfill-Workflow für die wichtigsten ~10 Events der
aktuellen Rotation; Feature-Gating: Verstecke Per-Decklist-Features
solange < 5 Turniere im Window.

### 4. F-D19 — CI commitet ohne Daten-Sanity-Check

**Was:** Weekly-Run committet, sobald `git add` einen Diff produziert,
ohne zu prüfen ob die Diff-Files realistische Zeilenzahlen haben.

**Konsequenz:** Klasse-A-Risiko für die Zukunft: jeder neue
Cloudflare-/Source-Vorfall → leere CSVs werden committed → SPA zeigt
„keine Daten" — komplette Predictor-Stack arbeitet auf leerer
Eingabe. Niemand bekommt Alarmsignal außer der manuellen Beobachtung.

**Quick-Fix:** Pre-Commit-Block mit Min-Row-Tabelle (`labs_tournament_decks
>= 4 000`, `current_meta_card_data >= 1 000`, etc.). Sommerpause-
Files explizit mit Schwelle 0 vermerken.

### 5. F-D08 — `__unsorted` Bucket ohne Cleanup-Pipeline

**Was:** 96 Decks (Stand 2026-06-10) sitzen in `labs_tournament_decks__
unsorted.csv` weil der Scraper sie in der „in-person-legal-lag"-Window
nicht zuordnen konnte. Wird durch Format-Rotation regelmäßig
nachgefüttert.

**Konsequenz:** Predictor ignoriert diese 96 Rows komplett. Das sind
2 Turniere (San Juan, +1 anderes), inkl. Real-World-Result-Rows wie
„Dragapult Dusknoir 16.27 % share" — Daten die der Predictor für die
Period-Lag-Window-Predictions brauchen würde.

**Quick-Fix:** Operator-Issue automatisch erstellen wenn
`__unsorted` rows > 0 nach weekly run; ODER `previous_format_key` aus
`format_window.json` als Default-Bucket nutzen wenn die in-person-
legal-Window-Logik kein Match liefert.

---

## Was sauber ist (explizit nicht-bemerkenswert)

- **0 Schema-Drift** in allen 69 CSVs
- **0 Encoding-Probleme** (BOM überall mit `utf-8-sig` korrekt gehandhabt, 0 Mojibake)
- **0 gemischte Datumsformate** in einer Spalte — durchgehend `YYYY-MM-DD` und ISO 8601
- **0 echte Duplikat-Rows** außer den 22 unter F-D07 (= 4 Slug-Variants)
- **42/42 JSONs valide** `json.load`-bar
- **Retry-Logik zentral** in `card_scraper_shared.safe_fetch_html` (2 Versuche + curl_cffi-Fallback mit TLS-Fingerprint, `Retry-After`-Header respektiert)
- **19/22 Scraper** nutzen die zentrale Logging-/Fetch-Infrastruktur
- **Scraper-Logs** werden als CI-Artifact upgeloadet (retention 7 Tage)
- **Commit-Push hat 3-Versuche-Retry** mit `pull --rebase -X ours`
- **Mid-Batch-Mirror** für `all_cards_database` (gegen den 2026-05-22 CRI-Release-Bug)
- **Format-Window-Logik** sauber dokumentiert und zentral in `format_window.json`

---

*Erstellt: 2026-06-12 · Audit-Methode: read-only, jeder Befund mit Pfad + Zeile oder Command-Output belegt. Keine Code- oder Datenänderungen vorgenommen.*
