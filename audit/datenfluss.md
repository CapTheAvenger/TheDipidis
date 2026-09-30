# Datenfluss — Quelle → Scraper → Datei → Berechnung → Anzeige

**Stand:** `main` = `5d9ab9a8` · erstellt 07.09.2026 · rein aus Quelltext und
Datendateien gelesen; alle Zahlen unter „Zeilen heute" sind an den Dateien im
Arbeitsbaum nachgezählt, nicht abgeschrieben.

**Zweck:** Arbeitsmittel für Prüfagenten. Zu jeder angezeigten Information der
vollständige Weg, mit Datei:Zeile für jede Formel.

## Lesehilfe

* **Win %** ist die Limitless-Bezeichnung. Das Haus kennt **drei** Konventionen
  (§3.1); „Win %" gehört laut `js/win-rate-konvention.js:113–114` allein der
  Konvention MATCHPUNKTE. Wo eine Anzeige das Wort für eine andere Formel
  benutzt, steht das in §4.
* **NICHT GEPRÜFT** heißt: aus dem Quelltext nicht belegbar. Es steht nie eine
  gerundete Vermutung an dieser Stelle.
* Zeilenzahlen sind **Datenzeilen** (ohne Kopfzeile).
* Alle Cron-Angaben sind aus der jeweiligen YAML gelesen und stehen in **UTC**.

---

## 1. Quellen und Scraper

### 1.1 Die Arbeitsabläufe und ihr Takt

| Arbeitsablauf | Takt (UTC, aus der YAML) | Datei:Zeile |
|---|---|---|
| `weekly-full-update.yml` | `0 6 * * 2,5` — Di + Fr 06:00 | `.github/workflows/weekly-full-update.yml:31` |
| `daily-price-refresh.yml` | `0 8 * * *` | `daily-price-refresh.yml:36` |
| `data-guardian.yml` | `30 9 * * *` | `data-guardian.yml:15` |
| `champions-replica-scrape.yml` | `0 4 * * *` | `champions-replica-scrape.yml:31` |
| `champions-usage-refresh.yml` | `0 5 * * *` | `champions-usage-refresh.yml:18` |
| `per-decklist-scrape.yml` | `0 12 * * 2` — Di 12:00 | `per-decklist-scrape.yml:48` |
| `cardmarket-card-images.yml` | `30 7 * * 0` — So | `cardmarket-card-images.yml:18` |
| `prizepack-official-images.yml` | `45 7 * * 0` — So | `prizepack-official-images.yml:15` |
| `verify-cardmarket-mapping.yml` | `20 4 * * 3` — Mi | `verify-cardmarket-mapping.yml:21` |
| `bot-keepalive.yml` | `*/5 * * * *` | `bot-keepalive.yml:41` |
| `online-decklists.yml` | **kein Zeitplan**, nur `workflow_dispatch` — Begründung im Kopf der Datei | `online-decklists.yml:30–44` |
| `pocket-tierlist.yml` | **kein Zeitplan** (entfernt: Game8 antwortet dem GitHub-Läufer mit HTTP 202) | `pocket-tierlist.yml:24–48` |
| `player-continuity-scrape.yml` | nur `workflow_dispatch`; läuft faktisch im Wochenlauf mit | `player-continuity-scrape.yml:12`, `weekly-full-update.yml:495` |
| `champions-sprites`, `pokepricelab-*`, `probe-*`, `ace-spec-reparatur` | nur `workflow_dispatch` | jeweils `on:`-Block |
| `deploy-pages`, `data-consistency`, `sprachreinheit`, `visual-nonmeta` | `push` auf `main` / `pull_request` | jeweils `on:`-Block |

`weekly-full-update.yml:269–286` nennt die Scraper-Reihenfolge des Wochenlaufs;
`:422` (Online-Fenster), `:461` (Labs), `:495` (Spielerkontinuität), `:522`
(Einzellisten), `:784` (Deckempfehlung), `:787` (Datenstände) sind die
nachgelagerten Schritte.

### 1.2 Datei · Scraper · Quelle · Takt · Umfang

| Datei (`data/`) | Scraper / Skript | Quelle | Arbeitsablauf | Takt | Zeilen heute | Zeitraum (Feld) |
|---|---|---|---|---|---|---|
| `limitless_online_decks.csv` | `backend/scrapers/limitless_online_scraper.py:39` | `play.limitlesstcg.com/decks` | weekly-full-update | Di+Fr 06:00 | **136** | **kein Datumsfeld** — Kumulativstand seit Formatbeginn |
| `limitless_online_decks_comparison.csv` | dto. `:653` | dto. | weekly-full-update | Di+Fr | 136 | kein Datumsfeld (alt/neu-Vergleich zweier Läufe) |
| `limitless_online_decks_matchups.csv` | dto. `:720` | dto. (Top 100, `config/scraper_settings.json` `top_decks_for_matchup`) | weekly-full-update | Di+Fr | **1.716** | kein Datumsfeld |
| `limitless_meta_stats.json` | dto. `:147` | Kopfzeile der Limitless-Tabelle | weekly-full-update | Di+Fr | — | `generated_at` = 2026-09-06T16:28:50Z; 569 Turniere / 41.193 Spieler / 93.297 Partien |
| `online_share_history/YYYY-MM-DD.csv` | dto. `:580–617` | dto. | weekly-full-update | Di+Fr | **67 Stände** ab 2026-04-29 (Manifest: 2026-04-29 … 2026-09-06) | Dateiname = Standdatum |
| `limitless_online_fenster.csv` + `_meta.json` | `scripts/build_online_fenster.py:113` | Differenz zweier Tagesstände | weekly-full-update `:422` | Di+Fr | **137** | `fenster_von` 2026-08-22 → `fenster_bis` 2026-09-06, 15 Tage, 10.330 Decks |
| `online_tournament_top8_decks.csv` | `backend/scrapers/online_tournament_scraper.py:94` | `play.limitlesstcg.com` Turnierliste, `min_players: 100` | weekly-full-update | Di+Fr | **121** | nur `last_seen_date` je Deck: 2026-08-10 … 2026-09-06 |
| `online_tournament_winners.csv` | dto. `:570` | dto. | weekly-full-update | Di+Fr | **97** | `tournament_date` 2026-06-30 … 2026-09-06 |
| `current_meta_card_data.csv` | `backend/scrapers/current_meta_analysis_scraper.py:245` | `play.limitlesstcg.com/decks` + `labs.limitlesstcg.com` | weekly-full-update | Di+Fr | **4.484** (3.330 „Meta Live", 1.154 „Meta Play!") | **kein Datumsfeld** |
| `online_tournament_dated_cards.csv` | dto. `:931` | dto., je Turnier | weekly-full-update | Di+Fr | **28.756** | `tournament_date` 2026-07-17 … 2026-09-06 |
| `online_best_decklists.json` | dto. `:942` | dto. | weekly-full-update | Di+Fr | 45 Archetypen | NICHT GEPRÜFT (kein Datumsfeld gelesen) |
| `tournament_cards_data_overview.csv` | `backend/scrapers/tournament_scraper_JH.py:422` | `limitlesstcg.com/tournaments` | weekly-full-update | Di+Fr | **111** | `tournament_date` als Klartext („28th August 2026"); 16 Formate, davon TEF-PBL = **1 Turnier** |
| `tournament_cards_data_cards_<META>.csv` (16 Stück) | dto. `:843`, aufgeteilt von `backend/core/prepare_card_data.py:1266` | dto. | weekly-full-update | Di+Fr | TEF-PBL **879**, TEF-POR 7.464, TEF-CRI 2.737 | `tournament_date` je Zeile |
| `labs_tournament_decks.csv` (+ 13 `_<META>.csv`) | `backend/scrapers/labs_tournament_scraper.py:83` | `labs.limitlesstcg.com` | weekly-full-update `:461` | Di+Fr | **4.713** gesamt, **46** für TEF-PBL | `tournament_date` 2024-09-14 … 2026-08-28; **96 Zeilen ohne Datum** |
| `labs_tournament_matchups.csv` (+ 13 `_<META>.csv`) | dto. `:84` | dto. | weekly-full-update | Di+Fr | **47.986** gesamt, **1.866** für TEF-PBL | `tournaments_used` / `scraped_at`; `day_filter` ∈ {overall, day1, day2} |
| `labs_tournaments.json` | dto. | dto. | weekly-full-update | Di+Fr | Liste; 0071 = Worlds SF, 797 Spieler, 2026-08-28 | `tournament_date` |
| `labs_tournament_decks_verzeichnis.json`, `labs_tournament_matchups_verzeichnis.json` | `scripts/schreibe_labs_verzeichnis.py:19` | die Dateien in `data/` | weekly-full-update `:696` | Di+Fr | 13 `meta_keys` | `stand` = 2026-09-01T19:04:56Z |
| `player_continuity.csv` | `backend/scrapers/player_continuity_scraper.py:8` | `labs.limitlesstcg.com` | weekly-full-update `:495` (+ eigener Dispatch) | Di+Fr | **21.299** | `tournament_date` 2026-04-03 … 2026-08-28 |
| `tournament_decklists_per_player.csv` | `backend/scrapers/per_decklist_scraper.py:27` | `limitlesstcg.com` Einzellisten | per-decklist-scrape + weekly `:522` | Di 12:00 / Di+Fr | **30.459** Zeilen = **1.201 Listen aus 3 Turnieren** (NAIC 0070 16.960 / Turin 0069 9.800 / Worlds 0071 3.699) | `tournament_date` 2026-06-06 … 2026-08-28; im laufenden Format (≥ 31.07.) **143 Listen, 27 Archetypen** |
| `city_league_archetypes.csv` | `backend/scrapers/city_league_archetype_scraper.py:97` | `limitlesstcg.com/tournaments` (JP) | weekly-full-update | Di+Fr | **0** | `date`; Fenster ab 31.07.2026 (`config/scraper_settings.json` `city_league_archetype.start_date`) |
| `city_league_analysis.csv` | `backend/scrapers/city_league_analysis_scraper.py:106` | dto. | weekly-full-update | Di+Fr | **0** | `period`; Fenster ab 31.07.2026 |
| `city_league_archetypes_comparison.csv`, `_deck_stats.csv` | `city_league_archetype_scraper.py:456/417` | abgeleitet | weekly-full-update | Di+Fr | **0** / **0** | — |
| `city_league_archetypes_past.csv` | `city_league_past_archetype_scraper.py:12` | dto. | weekly-full-update | Di+Fr | **26** | 22.05. – 30.07.2026 |
| `city_league_analysis_past.csv` | `city_league_past_analysis_scraper.py:12` | dto. | weekly-full-update | Di+Fr | **315** | dto. |
| `all_cards_database.csv/.json` | `backend/scrapers/all_cards_scraper.py:707` | `limitlesstcg.com/cards` | weekly-full-update | Di+Fr | **20.419** | kein Datum |
| `japanese_cards_database.csv` | `backend/scrapers/japanese_cards_scraper.py:104` | `limitlesstcg.com/cards` (JP) | weekly-full-update | Di+Fr | NICHT GEPRÜFT | — |
| `price_data.csv` | `backend/scrapers/cardmarket_price_merger.py:5` | Cardmarket-JSON-Dumps + `cardmarket_id_mapping.csv` | daily-price-refresh `:141` | täglich 08:00 | **20.419** | `last_updated` je Zeile |
| `cardmarket_id_mapping.csv` | `backend/scrapers/cardmarket_id_mapper.py:17` | Cardmarket-Dumps + `cardmarket_mapping_verified.csv` | daily-price-refresh `:134` | täglich | NICHT GEPRÜFT | — |
| `cardmarket_mapping_verified.csv` | `scripts/verify_cardmarket_mapping.py:34` | Limitless-Preisabdruck als Fingerabdruck | verify-cardmarket-mapping | Mi 04:20 | NICHT GEPRÜFT | `checked_at` |
| `all_cards_merged.json/.csv`, `cards_chunk_*.json`, `cards_manifest.json` | `backend/core/prepare_card_data.py:628/801/827` | `all_cards_database` + `price_data` | daily-price-refresh `:153` | täglich | — | — |
| `active_threats.json` | `backend/tools/build_threat_intel.py:76` | `pokemon_card_effects.json` + `current_meta_card_data.csv` + `limitless_online_decks.csv` | weekly-full-update `:286` | Di+Fr | 7 Schlüssel; `format_label` TEF-PBL | `generated_at` 2026-09-06T16:33:33Z |
| `pokemon_card_effects.json` / `pokemon_card_text.json` | `backend/scrapers/pokemon_card_effects_scraper.py:15` / `pokemon_card_text_scraper.py:6` | `limitlesstcg.com/cards` | weekly-full-update | Di+Fr | — | — |
| `card_capability_interactions.json` | **handgepflegt** (kein Scraper) | — | — | — | **5 Paarungen**, `version` 0.1, `generated_at` 2026-05-15 | — |
| `archetype_icons.json` | `backend/scrapers/archetype_icons_scraper.py:7` | `play.limitlesstcg.com/decks`, `r2.limitlesstcg.net` | weekly-full-update | Di+Fr | — | — |
| `ace_specs.json` | `scripts/repariere_ace_spec.py:7`, geprüft in `weekly-full-update.yml:753` | `all_cards_database` | weekly-full-update | Di+Fr | — | `timestamp` |
| `format_window.json` | `backend/core/update_sets.py` (Aufruf im Wochenlauf) | `limitlesstcg.com/cards` EN + JP | weekly-full-update | Di+Fr | — | `current_set` PBL, `set_release_date` 2026-07-17, `in_person_legal_date` 2026-07-31, `current_set_jp` M6, `jp_release_date` 2026-07-31 |
| `deckempfehlung.json` | `scripts/build_deckempfehlung.py:2` | `labs_tournament_decks*.csv` + `limitless_online_decks.csv` | weekly-full-update `:784` | Di+Fr | 1 Empfehlung | `erzeugt` 2026-09-06; Anker = Worlds SF, 797 Spieler |
| `data_stand.json` | `scripts/build_data_stand.py:2` | Git-Verlauf | weekly-full-update `:787` | Di+Fr | 15 Dateien + `leer`-Liste | `erzeugt_am` 2026-09-06T16:39:09Z |
| `datenluecken.json` | `scripts/datenluecken.py:11` | Champions-Dateien | champions-* | täglich | **0 Lücken**, `erzeugt` 2026-08-31 | — |
| `champions_usage.json` | `scripts/scrape_champions_usage.py:3` | `championsbattledata.com` | champions-usage-refresh (+ replica) | täglich 05:00 | 238 Pokémon | `scraped_at` 2026-09-07T05:10:52Z |
| `champions_replica_teams.json` | `backend/scrapers/champions_replica_scraper.py:8` | `docs.google.com` + `pokepast.es` | champions-replica-scrape | täglich 04:00 | — | `_meta` |
| `champions_pokedex.json`, `_resources.json`, `_names_de.json`, `_roster_extra.json`, `_available_items.json`, `_team_strategies.json`, `_sprites.json` | `scripts/build_champions_*.py`, `scrape_champions_*.py`, `generate_team_strategies.py` | dto. | champions-replica-scrape | täglich 04:00 | — | Herzschläge in `data/_job_heartbeats.json` |
| `pocket_tierlist.json` (+ Zwischenstand `pocket_limitless_turniere.json`) | `scripts/scrape_pocket_limitless.py` (seit 29.09.2026; vorher Game8 von Hand) | `play.limitlesstcg.com/api` | pocket-tierlist | täglich 05:20 | — | `_meta.quelle_url`, `_meta.abgerufen` |
| `pokemonproxies_url_map.json` / `pokemonproxies_index.json` | `backend/scrapers/scrape_pokemonproxies_urls.py:15` / `scripts/scrape_pokemonproxies.py:2` | `pokemonproxies.com` | weekly-full-update / champions | Di+Fr | — | — |
| `prizepack_official_images.csv/.json` | `scripts/build_prizepack_official_images.py:2` | offizielle Play!-Galerie (PDF) | prizepack-official-images | So 07:45 | — | — |
| `cardmarket_card_images.csv`, `cm_expansions.csv` | `scripts/build_cardmarket_card_images.py:2`, `build_cm_expansions.py:2` | Cardmarket-Dumps | cardmarket-card-images | So 07:30 | — | — |
| `testing_group_bootstrap.json` | **einmalig von Hand** (2026-04-22) | Tabellenblatt des Betreibers | — | — | 21 Decks | `_meta.lastUpdated` 2026-04-22 |
| `deck_families.json`, `archetype_aliases.json`, `de_name_overrides.json`, `labs_tournament_id_overrides.json` | handgepflegte Überschreibungen | — | — | — | — | — |

---

## 2. Ladewege — welche `js/`-Datei liest welche `data/`-Datei

### 2.1 Feste Pfade

| Datei (`data/`) | gelesen von (Datei:Zeile) |
|---|---|
| `limitless_online_decks.csv` | `js/app-meta-call.js:8324`, `js/app-archetype-card.js:23` (via `load()` `:387`), `js/ds-post-quellen.js:331`, `js/win-rate-konvention.js:167` |
| `limitless_online_decks_matchups.csv` | `js/app-current-meta-analysis.js:4044`, `js/app-meta-call.js:7486`, `js/tech-ideen.js:186`, `js/ds-post-quellen.js:418`, `js/win-rate-konvention.js:199` |
| `limitless_online_decks_comparison.csv` | `js/app-meta-call.js:5921` |
| `limitless_online_fenster.csv` | `js/app-meta-call.js:6051` |
| `limitless_online_fenster_meta.json` | `js/app-meta-call.js:191` (Konstante `FENSTER_META_DATEI`) |
| `limitless_meta_stats.json` | `js/ds-post-quellen.js:332` |
| `online_tournament_top8_decks.csv` | `js/meta-analysis-hub.js:93`, `js/app-tier-meta.js:1722`, `js/app-meta-call.js:6208`, `js/app-archetype-card.js:24`, `js/ds-post-quellen.js:777` |
| `online_tournament_winners.csv` | `js/app-meta-call.js:8030` |
| `online_tournament_dated_cards.csv` | `js/app-meta-call.js:2008`, `js/current-meta-quickref.js:48/754`, `js/app-current-meta-analysis.js:1641` (via `loadCSV`) |
| `current_meta_card_data.csv` | `js/tech-ideen.js:185`, `js/ds-post-quellen.js:879`, `js/app-cards-db.js:750` |
| `labs_tournament_decks.csv` | `js/app-meta-call.js:6453`, `js/deck-builder-consistency.js:408`, `js/win-rate-konvention.js:120` |
| `labs_tournament_matchups.csv` | `js/app-meta-call.js:7658` |
| `player_continuity.csv` | `js/app-meta-call.js:6370` |
| `tournament_decklists_per_player.csv` | `js/deck-builder-consistency.js:64` |
| `tournament_cards_data_overview.csv` | `js/deck-builder-consistency.js:440` (nur Brücke `tournament_id` → `labs_tournament_id`) |
| `format_window.json` | `js/app-meta-call.js:6053/6272`, `js/app-current-meta-analysis.js:61/1074`, `js/app-city-league.js:30`, `js/app-deck-builder.js:8535`, `js/app-profile-deck-builder.js:722`, `js/current-meta-quickref.js:171` |
| `active_threats.json` | `js/app-anti-tech.js:218`, `js/app-current-meta-analysis.js:2704`, `js/app-deck-builder.js:9473` |
| `card_capability_taxonomy/_patterns/_interactions.json` | `js/card-capability-engine.js:69–71`, `js/app-tech-lab.js:52/110/444`, `js/tech-ideen.js:75/191/500`, `js/app-anti-tech.js:98`, `js/app-deck-builder.js:4112` |
| `ace_specs.json` | `js/app-core.js:3240`, `js/deck-builder-consistency.js:365`, `js/pokemon-loading-screen.js:25` |
| `city_league_analysis.csv` | `js/app-city-league.js:574`, `js/app-cards-db.js:544/749`, `js/pokemon-loading-screen.js:17` |
| `city_league_archetypes.csv` / `_comparison.csv` | `js/app-city-league.js:575/576`, `js/app-meta-call.js:7296`, `js/pokemon-loading-screen.js:18/20` |
| `city_league_*_past*.csv` | `js/app-city-league.js:574–576/614`, `js/app-meta-call.js:7297` |
| `data_stand.json` | `js/ds-datenstand.js:62` |
| `deckempfehlung.json` | `js/ds-post-quellen.js:1110`, `js/app-deckempfehlung.js:49` (Basis) |
| `datenluecken.json` | `js/app-admin.js:49/100/128` |
| `pocket_tierlist.json` | `js/ds-pocket.js`, `js/ds-post-quellen.js` (Rezept `pocket`) |
| `champions_*.json` | `js/app-side-quest*.js`, `js/champions-namen.js:40` |
| `all_cards_merged.json`, `cards_chunk_*.json`, `cards_manifest.json` | `js/app-core.js:3107/2990/3034/3047/3080`, `js/app-profile-deck-builder.js:687/705` |
| `online_share_history/manifest.json` + `<datum>.csv` | `js/app-meta-call.js:1831/2421/6324/6336` |
| `offline-manifest.json`, `offline-images-manifest.json` | `js/offline-prefetch.js:61–63` |

### 2.2 Ladeschlüssel, die erst zur Laufzeit auf eine Formatdatei aufgelöst werden

Drei Familien. In allen dreien steht im Quelltext **ein Schlüssel**, geladen wird
eine **andere, formatabhängige Datei**. Wer nur nach dem Dateinamen greppt,
findet den echten Leser nicht.

| Schlüssel im Code | aufgelöst durch | tatsächlich geladen (heute) | Datei:Zeile |
|---|---|---|---|
| `tournament_cards_data_cards.csv` | `data/tournament_cards_manifest.json` + `format_window.current_set`, Auswahl in `waehleAktuellenChunk()` | `data/tournament_cards_data_cards_TEF-PBL.csv` (879 Zeilen) | `js/app-core.js:2538–2564`, `:2665`, `js/app-cards-db.js:466–500`, `js/app-meta-call.js:1492` |
| `labs_tournament_decks_<META>.csv` | `labs_tournament_decks_verzeichnis.json` + `oldest_legal_set`-`current_set` | `labs_tournament_decks_TEF-PBL.csv` (46 Zeilen) | `js/app-archetype-card.js:307–330`, `js/app-meta-call.js:1627`, `js/app-past-meta.js:1860` |
| `labs_tournament_matchups_<META>.csv` | `labs_tournament_matchups_verzeichnis.json`, gleiche Schlüsselbildung | `labs_tournament_matchups_TEF-PBL.csv` (1.866 Zeilen) | `js/app-current-meta.js:53–75`, `js/app-meta-call.js:156` |

**Leer ist eine gültige Antwort.** Passt kein Chunk auf `current_set`, gibt
`waehleAktuellenChunk` `[]` zurück (`js/app-core.js:2549`) und die Turnierebene
bleibt leer statt auf den nächstälteren — rotierten — Chunk zu fallen.

**Zwei Trennzeichen.** Die Labs-Auszüge sind **kommagetrennt**, die
Haus-Exporte **semikolongetrennt** (`js/app-archetype-card.js:300–306`,
`js/app-current-meta.js:74–77`). Mit dem falschen Trenner zerfällt die Datei
still zu Einfeldzeilen und alles fällt auf „kein Major" zurück.

---

## 3. Kennzahlen mit Formel

### 3.1 Win % — drei Konventionen, eine Bezeichnung

Alle drei sind echt und in `js/win-rate-konvention.js` samt Belegdatei hinterlegt;
`tests/unit/test-win-rate-konventionen-belegt.js` rechnet sie gegen die Dateien nach.

| Konvention | Formel (Zitat) | Datei:Zeile | Quelldatei/Spalte | Nenner | Stichprobe heute | Zeitraum |
|---|---|---|---|---|---|---|
| **MATCHPUNKTE** = „Win %" | `return p > 0 ? ((3 * (s \|\| 0) + (u \|\| 0)) / (3 * p)) * 100 : NaN;` | `js/win-rate-konvention.js:139` | `labs_tournament_decks.csv` Spalte `win_pct`; ebenso `labs_tournament_matchups.csv` `my_deck_overall_win_pct` | `3 · (S+N+U)` | 4.713 Zeilen, Toleranz 0,0051, 4.713 Treffer (`:126–131`) | Turnierdaten 2024-09-14 … 2026-08-28 |
| **MIT_UNENTSCHIEDEN** | `return p > 0 ? ((s \|\| 0) / p) * 100 : NaN;` | `js/win-rate-konvention.js:183` | `limitless_online_decks.csv` Spalte `win_rate_numeric` | `S+N+U` | 136 Zeilen, 135 Treffer, Ausnahme Wailord (`:170–179`) | Kumulativ, **kein Datum** |
| **OHNE_UNENTSCHIEDEN** | `return e > 0 ? ((s \|\| 0) / e) * 100 : NaN;` | `js/win-rate-konvention.js:211` | `limitless_online_decks_matchups.csv` Spalte `win_rate` | `S+N` | 1.716 Zeilen, 1.716 Treffer (`:203–207`) | Kumulativ, **kein Datum** |

**Nicht vergleichbar ohne Umrechnung.** Nachgezählt an den Dateien:
online enden **2.322 von 180.414** Partien unentschieden (**1,29 %**,
`limitless_online_decks.csv`), am Major **684 von 6.192** (**11,05 %**,
`labs_tournament_matchups_TEF-PBL.csv`, `day_filter='overall'`). Nur
OHNE_UNENTSCHIEDEN kürzt diesen Anteil heraus; `differenz()` in
`js/win-rate-konvention.js` verweigert die Subtraktion über Konventionsgrenzen.
Dieselben zwei Zahlen stehen maschinenlesbar in
`js/app-meta-call.js:153–171` (`BELEGTE_FELDQUOTEN`) — beide stimmen mit der
Nachzählung überein.

**Angezeigt wird Win % an:**

| Anzeige | Formel/Quelle | Datei:Zeile | Nenner | Datenfenster |
|---|---|---|---|---|
| Kachel „Total Win Rate Limitless Online Tournaments" (Deck Analysis Global) | Spalte `win_rate_numeric` unverändert | `js/app-current-meta-analysis.js:2216–2223`, Fußnote `:1739–1745` | `wins+losses+ties` derselben Zeile | **wirkt nicht** (Datei hat kein Datum) |
| Kachel „Win Rate" der Archetyp-Karte, Online-Seite | `winRate: num(r.win_rate_numeric)` | `js/app-archetype-card.js:395` | dto. | **wirkt nicht** (`:904–935`) |
| Kachel „Win Rate", Major-Seite | `e.winRate = e.partien > 0 ? (e.siege / e.partien) * 100 : null;` — **neu gerechnet**, ausdrücklich **nicht** `win_pct` | `js/app-archetype-card.js:359–362` | Σ wins+losses+ties aller Zeilen des Decks im Meta-Auszug | **wirkt nicht** |
| Paarungsdetail „Win %" (Matchup-Ansicht) | Spalte `win_rate` (OHNE_UNENTSCHIEDEN) | `js/app-current-meta-analysis.js:4345` | `record` = S+N | wirkt nicht |
| Past Meta, Kachel „Cumulative Win %" | Konvention MATCHPUNKTE, Hinweis aus `WK.hinweis('matchpunkte')` | `js/app-past-meta.js:2028–2029`, Bilanz `:1986–1995` | `3·(S+N+U)` über alle Zeilen des Decks | eigener Formatschlüssel, kein „Daten ab" |
| Heatmap-Zelle / Archetyp-Karte-Paarung | geglättet: `return ((w + kk / 2) / nenner) * 100;` mit `nenner = w + l + kk`, `K = 20` | `js/matchup-glaettung.js:84–87`, `K` `:57` | `S+N+20` | wirkt nicht |

### 3.2 Meta-Anteil

**Zwei verschiedene Größen tragen fast denselben Namen.**

| Anzeige | Formel (Zitat) | Datei:Zeile | Zähler | Nenner | Wert Dragapult heute |
|---|---|---|---|---|---|
| Tier-Liste / Deck-Analyse / Archetyp-Karte „Anteil" | `share: num(r.share_numeric)` | `js/app-archetype-card.js:394`; ebenso `js/app-current-meta-analysis.js:610` | Listen des Decks im Onlinefeld (`count`) | Feldgröße, die Limitless zugrunde legt — **steht nicht in der Datei**; Σ `share_numeric` = **96,19 %** (Rest = „Other", vom Scraper verworfen) | **7,62 %** (`count` 39.694 gesamt gelistet) |
| Startseite „Meta-Anteil" (Kachel „Erfolgreichstes Deck") | `sharePct: (brought / totalBrought) * 100,` | `js/meta-analysis-hub.js:164`; Wortwahl `:520–523` | `total_brought` des Decks | **Σ `total_brought` über alle 121 Zeilen = 12.287 Antritte** | **9,77 %** |
| Meta Call, Spalte „Online" | dto. aus derselben Datei | `js/app-meta-call.js:6238–6241` | `total_brought_weighted` | Σ `total_brought_weighted` = 7.501,5 | — |
| Meta Call, Spalte „Final" | `finalShare : alloc[deck.name],` — Vorhersage + persönliche Überschreibungen + Junk-Regler | `js/app-meta-call.js:8944` | — | Summe = 100 % über Feld inkl. `_junk` (`:8963–8967`) | — |
| Fenster-Anteil (14/15 Tage) | `zaehler_fenster = count(heute) - count(vor N Tagen)` | `scripts/build_online_fenster.py:52` (Kopf), `FENSTER_TAGE = 14` `:88` | Differenz zweier Kumulativstände | Decks im Fenster = **10.330** | — |

Die Feldgröße hinter `share_numeric` wird bei Bedarf aus den Anteilen selbst
eingegrenzt: `N ∈ [count/(s+0,005) , count/(s−0,005)]`, Mehrheitsschnitt über
alle Zeilen, Rückgabe 0 bei mehr als einem Fünftel Widerspruch —
`js/app-utils.js:1629–1673` (`feldGroesseAusAnteilen`).

Fensterübernahme im Meta Call ist an fünf Wächter gebunden:
`FENSTER_MAX_ALTER_TAGE = 10`, `FENSTER_MIN_DECKUNG = 0.8`,
`FENSTER_MIN_DECKS = 1500`, `FENSTER_MAX_TAGE = 21`, `FENSTER_MIN_TAGE = 3`
(`js/app-meta-call.js:192–201`). Schlägt einer an, rechnet die Seite mit dem
Kumulativstand.

### 3.3 Kartenabdeckung (Kartendatenbank, Plakette „x % Coverage")

```
prozent: (zaehler / nenner) * 100
```
`js/app-cards-db.js:3925`

* **Zähler** `zaehler` — Σ `deck_count` (ersatzweise `deck_inclusion_count`) über
  die gefilterten Archetypen, **je Archetyp gedeckelt auf die Archetypgröße**
  (`js/app-cards-db.js:3907–3913`); wird gedeckelt, trägt die Plakette „≤".
* **Nenner** `nenner` — Σ `total_decks_in_archetype` **einer einzigen Erhebung**
  (`js/app-cards-db.js:3877–3879`).
* **Erhebung** = Quelle + rohes Meta-Label (`js/app-cards-db.js:841`). Heute
  fallen drei auf denselben Formatschlüssel TEF-PBL, nachgezählt:

  | Erhebung | Archetypen | Decks |
  |---|---|---|
  | `Tournament / TEF-PBL` (`tournament_cards_data_cards_TEF-PBL.csv`) | 27 | **143** |
  | `Current Meta / Meta Live` (`current_meta_card_data.csv`) | 60 | **1.187** |
  | `Current Meta / Meta Play!` (dto.) | 34 | **253** |
  | `City League / …` (`city_league_analysis.csv`) | **0** | **0** — Datei leer |

* Gewählt wird die Erhebung mit dem **größten Nenner**
  (`js/app-cards-db.js:3938–3941`); abweichende weitere Erhebungen werden im
  `title` beim Namen genannt (`:3948–3956`).
* **Zeitraum:** was in der gewählten Erhebung steht. `current_meta_card_data.csv`
  führt kein Datum; Turnierzeilen werden gegen das Set-Erscheinungsdatum
  gefiltert (`js/app-cards-db.js:3888–3893`).
* **Filter, die wirken:** Meta, Archetyp, Haupt-Pokémon
  (`js/app-cards-db.js:3792–3844`). **Wirkt nicht:** das Datenfenster
  „Daten ab" der Deck-Analyse (es lebt in `app-current-meta-analysis.js`).

### 3.4 Usage Share (Karte innerhalb eines Archetyps)

```
: (totalDecksInArchetype > 0 && decksWithCard > 0 ? (decksWithCard / totalDecksInArchetype) * 100 : …
```
`js/app-current-meta-analysis.js:5191–5193`

* Bevorzugt gelesen wird die fertige Spalte `percentage_in_archetype`; nur wenn
  die fehlt, wird selbst gerechnet — beide Wege ergeben denselben Bruch.
* **Zähler** `deck_count` / `deck_inclusion_count`, **Nenner**
  `total_decks_in_archetype` — beide stehen sichtbar in Klammern hinter der
  Quote (`js/app-current-meta-analysis.js:5245`).
* **Quelle** `data/current_meta_card_data.csv`; bei Filter „Major" stattdessen
  der aufgelöste Turnier-Chunk (`js/app-current-meta-analysis.js:1912–1932`).
* **Zeitraum:** Fußnote `js/app-current-meta-analysis.js:5222–5227` — „die
  Turnierzeilen, die der aktive Turnierfilter und das Datenfenster ‚Daten ab'
  übrig lassen". Das gilt für den Major-Pfad und für den datierten
  Ersatzaggregat-Pfad; für den unveränderten `current_meta_card_data.csv`-Pfad
  wirkt das Fenster **nicht** (siehe §6).
* Dieselbe Größe im Japan-Reiter: `js/app-city-league.js:3783` — gleiche Formel,
  **ohne** Quellen- und Nennerfußnote, auf einer **leeren** Datei.

### 3.5 Max Consistency (Deck-Bau aus Turnierlisten)

Quelle: `data/tournament_decklists_per_player.csv` (`DATA_URL`,
`js/deck-builder-consistency.js:64`), Feldgrößen aus
`data/labs_tournament_decks.csv` Spalte `total_players`
(`:408–419`), Brücke `tournament_id` → `labs_tournament_id` aus
`data/tournament_cards_data_overview.csv` (`:440–457`).

**Listengewicht**

```
return pl * sz;
```
`js/deck-builder-consistency.js:324`, mit

```
const pl = _placementWeight(list.place, feld);
const sz = _sizeWeight(feld);
```
`:322–323`

**Platzgewicht** — Maximum aus absoluter und feldrelativer Skala:

```
return Math.max(absolut, relativ);
```
`js/deck-builder-consistency.js:308`

* absolute Bänder: Platz ≤ 4 → 1,0 · ≤ 8 → 0,7 · ≤ 16 → 0,5 · ≤ 32 → 0,3 ·
  sonst 0,1 (`:84–90`)
* Perzentilbänder: q ≤ 0,01 → 1,0 · ≤ 0,02 → 0,8 · ≤ 0,05 → 0,6 · ≤ 0,10 → 0,4 ·
  ≤ 0,25 → 0,2 · sonst 0,1 (`:179–186`), mit `const q = p / feld;` (`:303`)
* Ohne Feldgröße **oder** ohne gültigen Platz gilt nur das absolute Band
  (`:302`) — kein geratenes Quantil.

**Größengewicht**

```
return Math.min(1.0, Math.log(n) / Math.log(SIZE_WEIGHT_REFERENCE));
```
`js/deck-builder-consistency.js:314`, `SIZE_WEIGHT_REFERENCE = 2000` (`:207`),
`SIZE_WEIGHT_FLOOR = 0.5` bei `n <= 1` (`:208`, `:313`).

**Kartenkennzahlen**

```
const weightedShare = totalW > 0 ? a.shareNumerator / totalW : 0;
const weightedAvgCount = a.shareNumerator > 0 ? a.countNumerator / a.shareNumerator : 0;
const topCutFreq = topCutWeight > 0 ? a.topCutWeight / topCutWeight : 0;
```
`js/deck-builder-consistency.js:750–756`

* **Nenner** `weightedShare`: Summe **aller** Listengewichte des Archetyps.
* **Nenner** `weightedAvgCount`: Gewichtssumme nur der Listen **mit** der Karte.
* **Nenner** `topCutFreq`: Gewichtssumme der Listen mit `place ≤ 8` —
  ausdrücklich **innerhalb** des Tag-2-Cut, nicht „wie oft die Karte den Cut
  erreicht" (`:631–636`).
* Mehrfachdrucke werden **je Liste** zusammengefasst, bevor über Listen
  aggregiert wird (`:660–668`) — sonst zählte eine Liste doppelt.

**Zeitraum / Stichprobe.** `opts.minDate` = `format_window.in_person_legal_date`
= **2026-07-31** (`js/app-deck-builder.js:7940`), Filter
`js/deck-builder-consistency.js:1512–1519`. Damit bleiben von 1.201 Listen
**143** übrig (nur Worlds SF), verteilt auf 27 Archetypen; Mega Excadrill = 8.
Unter `MIN_WEIGHTED_LISTS = 3` (`:227`) verweigert der Bau.

### 3.6 Tech-Cut-Empfehlung

Drei Bausteine, drei Quellen.

**A · Bedrohungslage** (`data/active_threats.json`)

```
weighted_share += share * ms
```
`backend/tools/build_threat_intel.py:492`, mit `share` = **Maximum** der
`share_in_archetype` je Archetyp (`:411–415`, kein Doppelzählen) und `ms` =
Meta-Anteil dieses Archetyps aus `limitless_online_decks.csv`
Spalte `share_numeric` (`:297–314`, Spalte gelesen `:309`).

* Schwellen: `META_SHARE_FLOOR = 0.005` (`:114`), `INCLUSION_FLOOR = 0.25`
  (`:119`), `CATEGORY_FLOOR = 0.02` (`:123`); Kategorien unter dem
  Kategorie-Boden fallen raus (`:494`).
* Nur Zeilen mit `meta == "Meta Live"` gehen ein (`:326`) — 3.330 von 4.484.
* Konter werden auf formatlegale Sets beschränkt (`:422–426`).
* **Zeitraum:** `generated_at` 2026-09-06T16:33:33Z, `format_label` TEF-PBL.

**B · Tech-Audit im Bauer** — liest `active_threats.json` und stellt Konterkarten
in die Tech-Slots (`js/app-deck-builder.js:9473–9566`).

**C · Tech-Ideen** — Ableitung aus Kartentext:
Quelle `data/card_capability_interactions.json` (`js/tech-ideen.js:75`),
**Version 0.1 vom 15.05.2026 mit genau 5 Paarungen**. Kandidatenkreis nur die im
Format gespielten Karten aus `current_meta_card_data.csv` (`:185`).
Schwellen: `SCHLECHT_AB = 47.0` (`js/tech-ideen.js:84`), `MIN_PARTIEN = 30`
(`:90`), `PRO_GEGNER = 3` (`:79`). Vorschläge tragen **bewusst keine** Anteils-,
Platzierungs- oder Siegquote (`:33–36`).

### 3.7 Tier-Einordnung (Current Meta)

```
score: shareComp + wrComp + labsComp,
```
`js/app-tier-meta.js:134`, zusammengesetzt aus

```
const adjWR = games > 0 ? (wins + TIER_SCORE.PRIOR_GAMES * 0.5) / (games + TIER_SCORE.PRIOR_GAMES) * 100 : 50;
const shareComp = Math.min(share, TIER_SCORE.ANTEIL_DECKEL) * TIER_SCORE.ANTEIL_GEWICHT;
const wrComp = Math.max(0, Math.min(adjWR - 50, TIER_SCORE.WR_DECKEL)) * TIER_SCORE.WR_GEWICHT;
```
`js/app-tier-meta.js:108–113` und, sobald eine Labs-Datei geladen ist,

```
const labsWRComp = Math.max(0, Math.min((ent.winPct || 0) - 50, TIER_SCORE.LABS_WR_DECKEL)) * TIER_SCORE.LABS_WR_GEWICHT;
const day2Comp = Math.max(0, Math.min(ent.day2Conv || 0, TIER_SCORE.TAG2_DECKEL)) * TIER_SCORE.TAG2_GEWICHT;
```
`js/app-tier-meta.js:124–132`

Alle Stellschrauben stehen **einmal**, in `Object.freeze(TIER_SCORE)`
(`js/app-tier-meta.js:87–100`): `PRIOR_GAMES 50`, `ANTEIL_DECKEL 15`/
`ANTEIL_GEWICHT 0.6`, `WR_DECKEL 10`/`WR_GEWICHT 0.8`, `LABS_MIN_PARTIEN 15`,
`LABS_WR_DECKEL 12`/`LABS_WR_GEWICHT 1.5`, `TAG2_DECKEL 0.4`/`TAG2_GEWICHT 8`.

* **Zähler/Nenner** `adjWR`: `wins = games · rawWR/100` mit `games = new_count`
  (Listen), `rawWR = deck.winrate` (= `win_rate_numeric`, Konvention
  MIT_UNENTSCHIEDEN) — der Nenner ist also **Listen**, nicht Partien
  (`js/app-tier-meta.js:103–109`). Das ist eine Näherung: die Bayes-Glättung
  zieht mit 50 Pseudo-**Listen**, nicht mit 50 Pseudo-Partien.
* **Einteilung** in Tier 1/2/3: Rangfolge nach `score` (`:1617–1618`), dann
  Mengendeckel + Qualitätstor `T1_MIN_WR = 49.0` auf `sc.adjWR` **oder**
  `labsWR` (`:1640`, `:1662–1666`).
* **Zeitraum:** Onlineteil kumulativ ohne Datum; Labsteil = der
  aufgelöste Meta-Auszug (heute TEF-PBL, 46 Zeilen, 1 Turnier vom 28.08.2026).
* Die **City-League-Tier-Liste** wird anders gebildet: rein nach Rangplatz,
  `idx <= 2` → Tier 1, `<= 9` → Tier 2, `<= 19` → Tier 3
  (`js/app-tier-meta.js:962–967`) — heute auf **0 Zeilen**.

### 3.8 Day-2-Chance (Meta Call, Markow-Kette)

```
let day2Prob = 0;
for (let pt = day2Points; pt <= maxPts; pt++) day2Prob += dp[pt];
```
`js/app-meta-call.js:9128–9129`

* **Zustandsraum:** Punkte 0 … `rounds·3`; je Runde wird über das ganze Feld
  gefaltet: `newDp[pts+3] += p·share·m.pWin`, `newDp[pts+1] += p·share·m.pTie`,
  `newDp[pts] += p·share·m.pLoss` (`:9121–9124`).
* **Nenner:** `share = deck.finalShare / 100` (`:9112`) — die Summe der
  `finalShare` über das Feld inkl. `_junk` ist 100 %.
* **Schwelle:** `day2Points` je Turniertyp — Regional/IC/Worlds 16 Punkte bei
  8 Runden, Challenge 13 bei 5, Cup 12 bei 5 (`js/app-meta-call.js:1070–1074`).
* **Unentschieden:** jede Paarung wird vor der Kette auf die **gemessene
  Präsenzquote** umgestellt (`:9095–9100`, Umrechnung `:9067–9074`) — aber nur,
  wenn `uq.gemessen` wahr ist; sonst bleibt sie unverändert.
* **Spiegel:** fest `{ pWin: 0.45, pTie: 0.10, pLoss: 0.45 }` (`:9118`).
* **Stichprobe:** Präsenz-Remisquote heute 684/6.192 = 11,05 % aus
  `labs_tournament_matchups_TEF-PBL.csv`.
* Für die Empfehlungsliste wird `day2Prob` zusätzlich mit der gemessenen
  Day-2-Quote verblendet (`:9368–9388`) und mit einem d2WR-Faktor skaliert
  (`:9314`); Anzeigewert ist dann `_rang` (`:9454`), der Simulationswert steht
  daneben als `simDay2Prob` (`:9456`).

### 3.9 Matchup gegen Top 20

```
const _wr = siege / partien * 100;
```
`js/app-current-meta-analysis.js:1806`, gefüllt aus

```
partien += games;
siege += (games * winRate / 100);
```
`js/app-current-meta-analysis.js:1793–1794`

* **Zähler** Σ `total_games · win_rate/100` der Paarungen gegen die Ränge 1–20.
* **Nenner** Σ `total_games` derselben Paarungen — steht als Zahl in der Fußnote
  (`:1848`).
* **Auswahl der Top 20:** `d.rank <= 20` aus `limitless_online_decks.csv`
  (`js/app-current-meta-analysis.js:1773–1775`).
* **Der Spiegel zählt mit** und wird in der Fußnote beziffert (`:1803`,
  `:1847–1851`).
* **Roh, nicht geglättet.** Hier wird `m.win_rate` direkt gewichtet; die Zellen
  darunter zeigen den mit `K = 20` geglätteten Wert (§4.5).
* **Zeitraum:** Gesamtstand des letzten Scraper-Laufs, „nicht nach Datum
  eingegrenzt" (`:1861`). Datenfenster wirkt nicht.

### 3.10 Top-8-Quote

Ein Tor, eine Funktion, fünf Ansichten.

```
const brauchbar = (r) => ganzeZahl(r.total_brought) && ganzeZahl(r.top8_count)
    && num(r.total_brought) > 0
    && num(r.top8_count) <= num(r.total_brought);
const hatRoh = !!rows && rows.length > 0 && rows.every(brauchbar);
```
`js/app-utils.js:1533–1537` — alles oder nichts, **je Zeile**.

```
const expected = totalBrought > 0 ? totalTop8 / totalBrought : 0;
const smoothed = (top8 + CONV_PRIOR * expected) / (brought + CONV_PRIOR);
rawPct: ((top8 / brought) / expected - 1) * 100,
perfPct: (smoothed / expected - 1) * 100,
```
`js/app-utils.js:1558`, `:1566`, `:1570–1571`; `CONV_PRIOR = 50`,
`CONV_THIN_N = 50`, `CONV_MIN_N = 20` (`:1498–1500`).

* **Feldschnitt `expected`** heute: gezählt **754 / 12.287 = 6,14 %**,
  gewichtet **464,5 / 7.501,5 = 6,19 %**.
* **Angezeigte Quote je Deck** = `top8 / brought` derselben Zeile:
  `js/meta-analysis-hub.js:178`, `js/app-tier-meta.js:1763–1767` (`quoteAus`),
  `js/app-archetype-card.js:805`, `js/app-meta-call.js:6246–6247`.
* **Gewichtung in der Datei:** `recent_days_high_weight: 7`,
  `recent_weight: 1.0`, `older_weight: 0.5`
  (`config/scraper_settings.json`, Abschnitt `online_tournament_scraper`).
* **Zeitraum:** kumulativ über alle erfassten Onlineturniere; nur
  `last_seen_date` je Deck (2026-08-10 … 2026-09-06). Datenfenster wirkt nicht.

### 3.11 Day-2-Quote (Präsenz)

```
e.day2Quote = e.day1 > 0 ? (e.day2 / e.day1) * 100 : null;
```
`js/app-archetype-card.js:364`

* **Zähler** Σ `day2_players`, **Nenner** Σ `day1_players` über alle Zeilen des
  Decks im Meta-Auszug `labs_tournament_decks_TEF-PBL.csv`.
* **Schwelle:** unter `DAY2_MIN_ANTRITTE = 5` Tag-1-Antritten wird keine Quote
  gezeigt (`js/app-archetype-card.js:131`, Prüfung `:868`).
* **Feldvergleich:** `day2Quote: day1 > 0 ? (day2 / day1) * 100 : null` über
  alle Decks (`js/app-archetype-card.js:602`).
* **Zeitraum:** ausgewiesen aus den geladenen Zeilen selbst
  (`js/app-archetype-card.js:936–962`) — heute 1 Turnier vom 28.08.2026.
* **Zweiter Rechenweg** im Tier-Panel: `const day2Conv = e.day1 > 0 ? e.day2 / e.day1 : 0;`
  (`js/app-tier-meta.js:370`) — dieselbe Formel, eigener Aggregationslauf.
* **Dritter Weg** im Prognosemotor: die **fertige Spalte** `day1_to_day2_conv`,
  aktualitätsgewichtet gemittelt und erst ab `day1_players >= 10`
  (`js/app-meta-call.js:7145–7160`); ebenso `scripts/build_deckempfehlung.py:196`.

### 3.12 EV-Rechner: Abdeckung des Metas

```
abdeckung: feldSumme > 0 ? (abgedeckt / feldSumme) * 100 : 0,
gerechnet: feldSumme > 0 ? (gerechnet / feldSumme) * 100 : 0,
```
`js/ds-ev-rechner.js:233–234`

* **Nenner** `feldSumme` = Summe **aller** Feldanteile, auch bei den Modi
  „gleich" und „top8" (`:208–211`) — sonst behauptete die Zahl eine
  Vollständigkeit, die nur aus der eigenen Auswahl stammt.
* Beide Zahlen stehen nebeneinander, sobald sie um ≥ 1 pp auseinanderliegen
  (`:280`).
* Vorbehaltsmarke bei `EV_MIN_PARTIEN = 30` oder `EV_MIN_ABDECKUNG = 25`
  (`:293–299`).

### 3.13 Weitere gezeigte Größen (Kurzform)

| Kennzahl | Formel | Datei:Zeile | Nenner |
|---|---|---|---|
| Matchup-Glättung (Heatmap, Karte) | `((w + kk / 2) / nenner) * 100` mit `nenner = w + l + kk` | `js/matchup-glaettung.js:85–87`, `K = 20` `:57` | S+N+20 |
| Feldgröße aus Anteilen | Mehrheitsschnitt der Intervalle `count/(s±0,005)` | `js/app-utils.js:1629–1673` | — |
| Spieler-Klebrigkeit (Predictor 5.8) | `sticky_pct: u > 0 ? (r / u) * 100 : 0` | `js/app-meta-call.js:6420` | Spieler mit ≥ 1 Antritt je Archetyp |
| Deckempfehlung „Day-2-Anteil" | `out[k] = zahl(r.get("day1_to_day2_conv")) * 100.0` | `scripts/build_deckempfehlung.py:196` | **Spieler** des Decks, gemittelt über 44 Turniere — ausdrücklich **nicht** Turniere (`js/app-deckempfehlung.js:150–166`) |
| Deckempfehlung „Schrumpfung" | `schrumpfung_k: 30`, `feldkonversion_anker: 17.94` | `data/deckempfehlung.json` | — |
| **Kartenpreis** (Kartendatenbank, Proxy, Wunschliste) | `const price = parseLocaleNumber(card.eur_price, 0);` — `js/app-cards-db.js:3379`, `:3481` | Feld `eur_price` aus `all_cards_merged.json` / `cards_chunk_*.json`, dorthin gemischt von `backend/core/prepare_card_data.py:344–366` aus `data/price_data.csv` | Vertrauensmarken `price_status` und `mapping_status` sind zwei getrennte Achsen (siehe `data/_consumers.md`); Takt täglich 08:00 UTC |
| **Archetyp-Zuordnung** | zwei unabhängige Normalisierungen: Python `signature(slugs)` = sortierte Icon-Slugs (`backend/core/archetype_matcher.py:59`) · JavaScript `normalizeArchetypeForMatch` (`js/app-meta-cards.js:8–22`) | Brücke `data/archetype_aliases.json` | **4** Paare in `turnier_zu_ladder`, **3** ausdrücklich nicht verbundene; `data/archetype_icons.json` führt **542** Archetypen |

---

## 4. Wo dieselbe Zahl zweimal vorkommt

| # | Größe | Weg A | Weg B | Auseinander? |
|---|---|---|---|---|
| 4.1 | **„Meta-Anteil" Dragapult** | `share_numeric` aus `limitless_online_decks.csv` → **7,62 %** (`js/app-archetype-card.js:394`) | `total_brought / Σ total_brought` aus `online_tournament_top8_decks.csv` → **9,77 %** (`js/meta-analysis-hub.js:164`) | **Ja, 2,15 pp.** Zwei Grundgesamtheiten (39.694 Listen gegen 12.287 Antritte), fast derselbe Name. Auf der Startseite steht ausdrücklich „Meta-Anteil" (`js/meta-analysis-hub.js:522`). |
| 4.2 | **Top-8-Quote** | gezählt `top8_count / total_brought` in vier Anzeigen (`js/meta-analysis-hub.js:178`, `js/app-tier-meta.js:1763`, `js/app-archetype-card.js:805`, `js/app-meta-call.js:6246`) | gewichtete Spalte `top8_conv_rate` im **Prognosemotor** (`js/app-meta-call.js:6244`) | **Ja, bewusst.** Dragapult 9,24 % (gezählt) gegen 8,9 % (Spalte). Die Trennung ist an Ort und Stelle begründet (`js/app-meta-call.js:6228–6231`), aber es bleiben zwei Zahlen für eine Größe im selben Reiter. |
| 4.3 | **Day-2-Quote** | selbst aggregiert `Σday2/Σday1` — zweimal unabhängig: `js/app-archetype-card.js:364` und `js/app-tier-meta.js:370` | fertige Spalte `day1_to_day2_conv`, gewichtet gemittelt: `js/app-meta-call.js:7145`, `js/app-meta-call.js:6778`, `scripts/build_deckempfehlung.py:196` | **Zwei Schreiber, drei Leser.** Die Spalte existiert in der Datei (`labs_tournament_decks.csv` Feld 32) und wird von zwei Anzeigen ignoriert; die Motorwege legen zusätzlich `day1_players >= 10` an, die Kacheln `>= 5`. |
| 4.4 | **Major-Win-Rate aus derselben Datei** | `S/(S+N+U)`, neu gerechnet: `js/app-archetype-card.js:361` | MATCHPUNKTE `(3S+U)/3n` aus Spalte `win_pct`: `js/app-past-meta.js:2028` (Kachel „Cumulative Win %") | **Ja.** Dieselbe Quelldatei, zwei Skalen, in zwei Reitern, beide beschriftet mit „Win %". Differenz systematisch, bei 11 % Remis rund 1,8 pp. |
| 4.5 | **Paarungsquote** | roh gewichtet in der Kachel „Matchup gegen Top 20": `js/app-current-meta-analysis.js:1794/1806` | geglättet (`K=20`) in den Zellen direkt darunter: `js/matchup-glaettung.js:87` via `js/app-meta-cards.js:1354` | **Ja.** Der Kachelschnitt ist ein rohes, partiengewichtetes Mittel; die Einzelwerte darunter sind geglättet. Bei dünnen Paarungen laufen Kachel und Zellen sichtbar auseinander. |
| 4.6 | **Feldgröße Worlds SF** | `total_players` aus `labs_tournaments.json` / `labs_tournament_decks.csv` = **797** | `players` aus `tournament_cards_data_overview.csv` = **797** (heute gleich), aber die Spalte „zählt anders" — ausdrücklich vermerkt in `js/deck-builder-consistency.js:104–107` | Heute gleich, Regel aber verschieden. Der Kommentar in `js/deck-builder-consistency.js:108–121` nennt **797**, `tests/unit/test-platzgewicht-feldrelativ.js:76` rechnet weiter mit **774** (als gesetzter Wert deklariert, `:14–22`). |
| 4.7 | **Tier-Einteilung** | Punktwert + Deckel + Qualitätstor: `js/app-tier-meta.js:1617–1676` | Reine Anteilsschwellen 8 / 4 / 1,5 %: `getDeckTier()`, `js/app-tier-meta.js:382–405` | **`getDeckTier` ist toter Code** — repoweit keine Aufrufstelle (`grep getDeckTier js/ index.html` findet nur die Definition). Zwei Regeln im selben Modul, eine davon nicht angeschlossen. |
| 4.8 | **Konvention hinter „Win %"** | `js/win-rate-konvention.js:113–114`: „Win %" = `(3S+U)/(3·Partien)` | `js/app-current-meta-analysis.js:1740`: „Win % = Siege ÷ alle Matches" (= `S/(S+N+U)`) · `js/app-current-meta-analysis.js:4345`: „Win % = Siege ÷ entschiedene Partien" (= `S/(S+N)`) | **Ja.** Drei Formeln, ein angezeigter Name — genau der Zustand, gegen den `win-rate-konvention.js` geschrieben wurde. Die Kachelbeschriftung selbst lautet „Total Win Rate Limitless Online Tournaments" (`index.html:1225`), die Fußnote darunter „Win %". |
| 4.9 | **Usage Share / Playrate** | Global: hart verdrahtet `"Usage Share:"` in beiden Sprachen (`js/app-current-meta-analysis.js:5245`) | Japan: i18n-Schlüssel `cl.usageShare` — EN „Usage Share:", **DE „Playrate:"** (`js/i18n.js:612` / `:3223`) | **Ja.** Gleiche Formel, drei Beschriftungen; im deutschen Global-Reiter steht ein hart verdrahteter englischer Begriff. |
| 4.10 | **Feldschnitt der Top-8-Quote** | `conv.expected` aus `computeConversionPerformance` (`js/app-utils.js:1558`) | Kachelvergleich rechnet `d.convPct / (conv.expected*100)` (`js/meta-analysis-hub.js:509–511`) — geglätteter Wert `perfPct` bleibt der Tabelle vorbehalten | Konsistent, aber **zwei Vielfache** derselben Größe im Umlauf (roh auf der Kachel, geglättet in der Rangliste); die Kachel sagt es dazu (`:503–508`). |
| 4.11 | **`consistency_score` im „Warum?"-Kasten** | Neuer Bauer: `consistency_score: Math.round((c.weightedShare \|\| 0) * 100)` — Skala 0–100 (`js/app-deck-builder.js:8228`, ebenso `:8145`) | Alt-Pfad: `card.consistencyScore = scoreShare * (1 + metaBoost);` dann `Math.min(120, …)`, plus `+18` für gewählte und `−20` für redundante Konter (`js/app-deck-builder.js:9762–9763`, `:9788`, `:9796`) | **Ja, gleiches Feld, gleicher Kasten, zwei Skalen (0–100 gegen 0–120).** Welche gilt, entscheidet allein, ob der Archetyp nach `minDate` ≥ 3 Listen hat; der Umschaltpunkt ist nur in der Konsole sichtbar (`js/app-deck-builder.js:8943`). Heute betrifft das **15 von 27** Archetypen. |
| 4.12 | **Der Deckbau selbst** | `MostConsistencyBuilder` (`js/deck-builder-consistency.js`), gewichtete Häufigkeit über Einzellisten | Alt-Pfad-Stufen in `js/app-deck-builder.js:8894 ff.`, gespeist aus aggregierten Archetypstatistiken | **Zwei vollständige Algorithmen hinter einem Knopf.** Der Rückfall ist begründet (`js/app-deck-builder.js:7955–7960`), aber für den Leser nicht unterscheidbar. |
| 4.13 | **Glättungsstärke** | Deck-Ebene `PRIOR_GAMES = 50` (`js/app-tier-meta.js:89`) und `CONV_PRIOR = 50` (`js/app-utils.js:1498`) | Paarungs-Ebene `K = 20` (`js/matchup-glaettung.js:57`) | Zwei Prioren, beide begründet (`js/matchup-glaettung.js:52–57`), auf einem Bildschirm nebeneinander — die Kacheln nennen den Unterschied nicht. |
| 4.14 | **Nenner der Deck-Glättung** | `computeTierScore` nimmt `deck.new_count` als `games` und rechnet `wins = games · rawWR/100` (`js/app-tier-meta.js:105–109`) | `new_count` kommt aus `limitless_online_decks_comparison.csv` (`js/app-tier-meta.js:1373`, übernommen `:1416`) und zählt **Decklisten**, `win_rate_numeric` ist über **Partien** gebildet | **Widerspruch, nachgezählt.** Dragapult führt `count` = **3.138** Listen und **14.861** Partien (7.943-6.642-276). Der Prior von 50 wirkt damit gegen 3.138 statt gegen 14.861 — rund **4,7-mal stärker**, als der Variablenname `games` behauptet. Der Tooltip schreibt korrekt „aus N **Listen**" (`js/app-tier-meta.js:2592`) — die Formel darüber heißt weiter `games`. |
| 4.15 | **Formattor des Deckbaus** | `currentMeta` und `cityLeague`: `minDate = in_person_legal_date` (`js/app-deck-builder.js:7936–7941`) | `past-meta`: **kein Tor** — absichtlich (`js/app-deck-builder.js:7912–7934`) | Dieselbe Schaltfläche baut in zwei Reitern aus verschiedenen Grundmengen. Der dortige Kommentar beziffert es: Alakazam Dudunsparce im Past Meta zog 61 von 75 Listen (81 %) aus dem Vorformat. |

---

## 5. Blinde Stellen

### 5.1 Gezogen, aber nirgends angezeigt

| Datei / Feld | Erzeuger | Status |
|---|---|---|
| `labs_tournament_decks.csv` Spalten `day1_win_pct`, `day2_win_pct` | Labs-Scraper | **Kein Leser in `js/`** — nur in Kommentaren erwähnt (`js/app-meta-call.js:1249`). `day1_share_pct`/`day2_share_pct` gehen dagegen in den Prognosemotor ein (`js/app-meta-call.js:376`, `:7031`), erscheinen aber in keiner Anzeige. |
| `labs_tournament_decks.csv` Spalten `top8_conv_rate`, `top16_conv_rate`, `top32_conv_rate` | Labs-Scraper | **Strukturell null.** Nachgezählt: in **allen 4.713 Zeilen = 0**, keine leer. `js/app-meta-call.js:4180–4187` fängt das ab (`t8ConvAvg > 0`) und weicht auf `d2/d1` aus; der Term `_clip(t8ConvAvg / 0.25, 0.5, 2.0)` (`:4184`) läuft damit nie. |
| `labs_tournament_decks.csv` Spalten `top1_count`, `top4_count`, `top8_count` | Labs-Scraper | **4.072 von 4.713 Zeilen leer (86 %).** Werte > 0 gibt es in 10 / 36 / 62 Zeilen. Gelesen wird nur `top1_count` (`js/app-meta-call.js:7049/7116`) für die 🏆-Marke. |
| `labs_tournament_decks.csv` Spalte `day1_to_day2_conv` | Labs-Scraper | Von den **Anzeigen** ignoriert (die rechnen `Σday2/Σday1` selbst, §4.3); gelesen nur vom Prognosemotor (`js/app-meta-call.js:7145`) und `scripts/build_deckempfehlung.py:196`. In **2.704 von 4.713 Zeilen = 0** (genau so viele wie `day2_players = 0`); der Motor filtert zusätzlich auf `day1_players >= 10` (`js/app-meta-call.js:7146–7147`). |
| `data/ace_specs.json` | `scripts/repariere_ace_spec.py` | `timestamp` = **2026-02-18**, 39 Namen — **fast sieben Monate alt**, obwohl der Wochenlauf `repariere_ace_spec.py --melden` fährt (`weekly-full-update.yml:753`): der Lauf **meldet nur**, er schreibt nicht. Ohne die Datei baut der Bauer jedes Deck ohne ACE SPEC. |
| `data/datenluecken.json` | `scripts/datenluecken.py` | **Kein Arbeitsablauf ruft das Skript auf** (`grep datenluecken .github/`: 0 Treffer). Die Datei steht auf `anzahl: 0`, `erzeugt` 2026-08-31 — der Admin-Bereich (`js/app-admin.js:49`) zeigt „keine Lücken", weil seither niemand nachgesehen hat. |
| `labs_tournament_matchups*.csv` Spalten `ist_spiegel`, `tagesfilter_quelle` | `labs_tournament_scraper.py:1652–1653` | **Kein Leser in `js/`.** Die Datei markiert selbst, dass in `labs_tournament_matchups_TEF-PBL.csv` **811 von 1.866 Zeilen** `tagesfilter_quelle = kopie_overall` tragen — die „Tag 1"-Sicht ist dort eine Kopie der Gesamtsicht. Die Oberfläche prüft das nicht; sie filtert nur `day_filter === 'overall'` (`js/app-current-meta.js:83`, `js/app-past-meta.js:2098`). |
| `online_tournament_top8_decks.csv` Spalten `top16_count_weighted`, `top16_conv_rate`, `avg_winrate_in_top8`, `source_format` | Onlineturnier-Scraper | Werden in `js/app-meta-call.js:6256–6261` in `_tournamentStats` gelegt; **keine Anzeige** liest `top16Conv` oder `avgWrTop8`. |
| `tournament_cards_data_overview.csv` | JH-Scraper | Wird ausschließlich als **Brücke** `tournament_id → labs_tournament_id` gelesen (`js/deck-builder-consistency.js:440`). Die 111 Zeilen mit Turniernamen, Spielerzahlen und Formaten erscheinen nirgends. |
| `player_continuity.csv` (21.299 Zeilen, 18 Spalten) | Kontinuitäts-Scraper | Nur `player_name`, `deck_archetype`, `tournament_id`, `meta` werden gelesen (`js/app-meta-call.js:6384–6389`). `place`, `points`, `day2`, `topcut`, `dropped`, `drop_round`, `dqed`, `country`, `wins/losses/ties`: **kein Leser**. |
| `cardmarket_card_images.csv`, `cm_expansions.csv`, `cardmarket_id_mapping.csv`, `cardmarket_mapping_verified.csv`, `pokepricelab_*.csv`, `price_guide_6.json`, `products_*_6.json` | Preis-Kette | Zwischenstufen; erreichen die Seite nur über `all_cards_merged.json` / `cards_chunk_*.json` (`backend/core/prepare_card_data.py:628/801`). Kein direkter Leser in `js/` — korrekt so. |
| `city_league_archetypes_deck_stats.csv`, `city_league_archetypes_past_deck_stats.csv` | CL-Scraper | **Kein Leser in `js/`.** Beide 0 bzw. 11 Zeilen. |
| `city_league_analysis_M3.csv` (133.437 Zeilen), `city_league_archetypes_comparison_M3.csv` | Altbestand | **Kein Leser in `js/`.** Der größte Datenblock des Repos hängt an nichts. |
| `labs_tournament_decks__unsorted.csv` | `schreibe_labs_verzeichnis.py` | Auffangdatei ohne Meta-Schlüssel; nicht im Verzeichnis, also nie geladen. |
| `testing_group_bootstrap.json` | einmalig 2026-04-22 | Wird geladen (`js/app-testing-groups.js:192`), Inhalt ist aber seit **fünf Monaten** unverändert und stammt aus einem Tabellenblatt. |

### 5.2 Anzeigen, die auf leeren oder fast leeren Dateien rechnen

`data/data_stand.json` führt die vier leeren Dateien selbst auf
(`"leer": [city_league_analysis.csv, city_league_archetypes.csv,
city_league_archetypes_comparison.csv, city_league_archetypes_deck_stats.csv]`),
und `js/ds-datenstand.js:133–172` schreibt an den betroffenen Chips „leer" statt
eines Datums. Die rechnenden Ansichten darüber bleiben trotzdem stehen:

| Anzeige | Rechnet auf | Zeilen | Folge |
|---|---|---|---|
| Reiter **City League Meta** (Tier-Liste, Climbers/Fallers, Gruppierung) | `city_league_archetypes.csv` + `_comparison.csv` | **0 / 0** | Tier-Einteilung nach Rangplatz (`js/app-tier-meta.js:962–967`) über eine leere Liste; `clGesamtListen` = 0. |
| Reiter **Deck Analysis (Japan)**, Karten-Usage-Share | `city_league_analysis.csv` | **0** | `js/app-city-league.js:3763` rechnet auf einer leeren Menge. |
| **Kartendatenbank**, Abdeckungsplakette | u. a. `city_league_analysis.csv` als eine von drei Erhebungen (`js/app-cards-db.js:749`) | **0** | Die Erhebung „City League" liefert nie einen Kandidaten (`rechne()` gibt bei `nenner <= 0` null zurück, `js/app-cards-db.js:3917`). Kein Fehler, aber eine der drei beworbenen Quellen ist tot. |
| Meta Call, Schalter **„Current City League einbeziehen"** | `city_league_archetypes_comparison.csv` (`js/app-meta-call.js:7296`) | **0** | Der Schalter ist bedienbar und bewirkt nichts. |
| **Past Meta / Japan-Vergangenheit** | `city_league_archetypes_past.csv` **26**, `_past_comparison.csv` **11**, `city_league_analysis_past.csv` **315** | fast leer | Eine Tier-Liste aus 11 verglichenen Archetypen; `js/app-city-league.js:14–15` beziffert es selbst als „ein einziges Turnier, 23 Listen". |
| **Tech-Ideen** | `card_capability_interactions.json` | **5 Paarungen**, Version 0.1 vom 15.05.2026 | Wird in der Oberfläche angeschrieben (`js/i18n.js:2794`), rechnet aber effektiv auf einer Regelbasis, die 0,02 % des Formats abdeckt. |
| **Max Consistency** | `tournament_decklists_per_player.csv` nach `minDate` 2026-07-31 | **143 Listen** von 1.201 | 27 Archetypen; **21 davon unter 10 Listen, 15 unter 3**. Unter 3 Listen verweigert der Bau (`MIN_WEIGHTED_LISTS = 3`, `js/deck-builder-consistency.js:227`) — für 15 der 27 Archetypen gibt es im laufenden Format also gar keinen Bau. |
| **Archetyp-Karte, Major-Seite** | `labs_tournament_decks_TEF-PBL.csv` | **46 Zeilen, 1 Turnier** | Anteil, Win Rate und Day-2-Quote der ganzen Präsenzspalte hängen an einem Turnier vom 28.08.2026. |
| **Präsenz-Matchups** | `labs_tournament_matchups_TEF-PBL.csv` | 1.866, davon 811 `overall` | 40 der 1.866 Zeilen sind Spiegelpaarungen; die day1-Sicht ist zu 100 % Kopie (§5.1). |

### 5.3 Ganze Quellen, die derzeit nichts liefern

* **Japanische City League.** `data/city_league_analysis_scraped.json` steht auf
  `last_updated: 2026-07-07`; das Scrape-Fenster ist auf `start_date: 31.07.2026`
  gesetzt (`config/scraper_settings.json`, `city_league_analysis` und
  `city_league_archetype`), synchron zum JP-Rotationsdatum
  `jp_release_date: 2026-07-31` in `data/format_window.json`. Seit der Rotation
  ist **keine einzige Zeile** dazugekommen, obwohl der Wochenlauf zweimal pro
  Woche läuft. Der Waechter meldet die Dateien als „leer", nicht als „veraltet".
* **TCG Pocket.** Bis 29.09.2026 ohne Zeitplan (Game8 sperrt den
  GitHub-Läufer); seitdem täglich aus Limitless (`pocket-tierlist.yml`,
  `scripts/scrape_pocket_limitless.py`).
* **Online-Einzellisten.** `online-decklists.yml` hat keinen Zeitplan
  (`:30–44`), Ziel `data/tournament_decklists_per_player.csv` wird faktisch nur
  über `per-decklist-scrape.yml` (Di 12:00) und den Wochenlauf gefüllt.

---

## 6. Was das Datenfenster „Daten ab" erreicht — und was nicht

Bedienelement: `#currentMetaDateFrom` (Reiter *Deck Analysis (Global)*).
Zustand: `currentMetaDateFrom` / `window.currentMetaDateFrom`
(`js/app-current-meta-analysis.js:19–20`, gesetzt `:1400–1401`).
Filter:

```
function filterRowsByDateFrom(rows, cutoffISO) { … return rows.filter(r => { const raw = r && (r.tournament_date || r.date || ''); if (!raw) return false; … }); }
```
`js/app-current-meta-analysis.js:1504–1521`. **Zeilen ohne Datum fallen heraus**
(`return false`), nicht durch.

| Anzeige | Wirkt? | Beleg (Datei:Zeile) |
|---|---|---|
| Kartenübersicht, Filter **„Major"** | **ja** — `filterRowsByDateFrom` auf den Turnier-Chunk | `js/app-current-meta-analysis.js:1926–1931` |
| Kartenübersicht, Filter **„All" / „Limitless"** | **ja, aber über eine andere Datei**: bei gesetztem Fenster wird auf das Laufzeit-Aggregat aus `online_tournament_dated_cards.csv` umgeschaltet, weil `current_meta_card_data.csv` kein Datum führt | `js/app-current-meta-analysis.js:1941–1953`, Aggregat `:1630–1657` |
| Kartenübersicht, Filter „All/Limitless" **ohne** verfügbares Aggregat | **nein** — stiller Rückfall auf den ungefilterten Aggregatstand | `js/app-current-meta-analysis.js:1949–1951` |
| Kachel **„Total Win Rate …"** | **nein** — die Fußnote sagt es ausdrücklich | `js/app-current-meta-analysis.js:1741–1742` |
| Kachel **„Matchup gegen Top 20"** | **nein** — „nicht nach Datum eingegrenzt" | `js/app-current-meta-analysis.js:1861` |
| Kachel **„Karten"** (`currentMetaStatCards`) | folgt der Kartenübersicht, also wie oben | `js/app-current-meta-analysis.js:2239` |
| Liste **„Used in Top 256"** | **nein** — ausdrücklich vermerkt | `js/app-current-meta-analysis.js:2390`, `:2415` |
| **Archetyp-Karte**, alle vier Kacheln (Anteil, Win %, Top-8, Day 2) | **nein** — `grep currentMetaDateFrom js/app-archetype-card.js`: 0 Treffer; Begründung je Datei im Quelltext, Satz erscheint in der eingebetteten Fassung | `js/app-archetype-card.js:901–935`, Text `:962–966` |
| **Deck Builder**, Consistency-Bau | **ja**, aber zusätzlich zum harten Formattor `minDate` | `js/app-deck-builder.js:9170–9172`, `:7940` |
| **Kartendatenbank**, Abdeckungsplakette | **nein** — eigener Filtersatz (Meta / Archetyp / Haupt-Pokémon) | `js/app-cards-db.js:3792–3844` |
| **Tier-Liste (Current Meta)** | **nein** — kein Bezug auf `currentMetaDateFrom` in `js/app-tier-meta.js` | — |
| **Meta Call** | **nein** — eigenes 14-Tage-Fenster über `limitless_online_fenster.csv` | `js/app-meta-call.js:6051`, `:192–201` |
| **City League** | **eigener** Datumsfilter `cityLeagueDateFrom` / `cityLeagueDateTo`, unabhängig | `js/app-city-league.js:2544–2551`, `:3088–3132` |
| **Startseite (Meta-Hub)** | **nein** — lädt `online_tournament_top8_decks.csv` ohne Datumsbezug | `js/meta-analysis-hub.js:93` |

**Merksatz für Prüfagenten:** Das Fenster wirkt auf **Kartenzeilen**, nie auf
**Deckbilanzen**. Jede Datei mit `tournament_date` je Zeile ist erreichbar
(`online_tournament_dated_cards.csv`, `tournament_cards_data_cards_*.csv`,
`tournament_decklists_per_player.csv`); jede aufsummierte Datei ohne Datum ist es
nicht (`limitless_online_decks.csv`, `limitless_online_decks_matchups.csv`,
`current_meta_card_data.csv`, `online_tournament_top8_decks.csv` — dort steht nur
`last_seen_date`).

---

## 7. Anhang — nachgezählte Kennzahlen des Bestands (07.09.2026)

| Größe | Wert | Woraus |
|---|---|---|
| Gelistete Onlinedecks | 136 Zeilen, Σ `count` = **39.694** Listen | `limitless_online_decks.csv` |
| Σ `share_numeric` | **96,19 %** (Rest „Other", vom Scraper verworfen) | dto. |
| Σ Partien online | **180.414**, davon **2.322** unentschieden (1,29 %) | dto. |
| Onlineturnier-Antritte | Σ `total_brought` = **12.287**, Σ `top8_count` = **754** (6,14 %) | `online_tournament_top8_decks.csv` |
| dto. gewichtet | **7.501,5** / **464,5** (6,19 %) | dto. |
| Präsenzpartien im laufenden Format | **6.192** (2.754-2.754-684), Remis **11,05 %** | `labs_tournament_matchups_TEF-PBL.csv`, `day_filter='overall'` |
| Präsenzlisten im laufenden Format | **143** aus 1 Turnier (Worlds SF, 797 Spieler, 28.08.2026) | `tournament_decklists_per_player.csv`, `labs_tournaments.json` |
| Kartenzeilen laufendes Format | Turnier **879** · Meta Live **3.330** · Meta Play! **1.154** | `tournament_cards_data_cards_TEF-PBL.csv`, `current_meta_card_data.csv` |
| Deckzahlen je Erhebung | 143 · 1.187 · 253 | dto. |
| Japan, laufendes Format | **0** Zeilen in allen vier Current-Dateien | `city_league_*` |
| Online-Fenster | 2026-08-22 – 2026-09-06, 15 Tage, **10.330** Decks, 67 Stände vorhanden | `limitless_online_fenster_meta.json` |
| Kartendatenbank | **20.419** Karten, **20.419** Preiszeilen | `all_cards_database.csv`, `price_data.csv` |
