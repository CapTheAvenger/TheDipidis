# Phase 2 — Data Sources Inventory

**Datum:** 2026-05-26
**Branch:** `main` @ `11ba78d`
**Methode:** Static analysis of `backend/scrapers/`, `data/`, `.github/workflows/`, `js/` fetch/Firebase patterns

---

## 2.1 Übersicht

| Kategorie | Anzahl | Aktualität |
|---|---|---|
| Scraper-erzeugte Daten | 81 CSVs + 17 JSONs (Repo) | täglich via CI + Auto-Commit |
| Statische / Manuelle Daten | ~10 Konfig-Dateien | bei Bedarf gepflegt |
| Externe APIs (zur Laufzeit) | 4 (Limitless CDN, Pokémon API, TCG-Showdown, Cardmarket-Link) | live |
| Firebase Collections | 10 | live (multiplayer-Coll legacy) |
| Browser-State | LocalStorage (16 refs `app-meta-call.js`, 12 `battle-journal.js`), localforage (1 file) | per-session |

**Wichtigster CI-Workflow:** `.github/workflows/weekly-full-update.yml` — läuft `cron: '0 6 * * 2'` (Di 6 UTC).
Während Phase 1 lief das Auto-Update parallel durch (`76b00d1 Auto: weekly full update`).

---

## 2.2 Kategorie A — Scraper-erzeugte Daten

### 2.2.1 Welche Scraper laufen im CI?

Belegt aus `.github/workflows/weekly-full-update.yml:124-141` (Step "Run scrapers"):

```
1)  core/update_sets.py
2)  scrapers/cardmarket_id_mapper.py
3)  scrapers/current_meta_analysis_scraper.py
4)  scrapers/limitless_online_scraper.py
5)  scrapers/city_league_analysis_scraper.py
6)  scrapers/city_league_archetype_scraper.py
7)  scrapers/city_league_past_analysis_scraper.py
8)  scrapers/city_league_past_archetype_scraper.py
9)  scrapers/tournament_scraper_JH.py
10) scrapers/online_tournament_scraper.py
11) scrapers/cardmarket_price_merger.py
12) core/prepare_card_data.py
13) scrapers/archetype_icons_scraper.py
14) scrapers/pokemon_card_text_scraper.py
15) scrapers/pokemon_card_effects_scraper.py
16) tools/build_threat_intel.py
```

+ separat in Step "Run labs tournament scraper":
```
17) scrapers/labs_tournament_scraper.py --matchups
```

**= 17 Scripts laufen wöchentlich.** Set +e → ein Fail blockt nicht die Batch.

### 2.2.2 Scraper-Outputs (statische Analyse)

Belegt aus `grep` nach `.csv`/`.json`-Strings in jeder Scraper-Datei:

| # | Scraper | Im CI? | Geschriebene Outputs |
|---|---|---|---|
| S-01 | `all_cards_scraper.py` | ❌ **NICHT in CI** | `all_cards_database.csv`, `all_cards_database.json`, `permanently_incomplete_cards.json` |
| S-02 | `archetype_icons_scraper.py` | ✅ | `archetype_icons.json` |
| S-03 | `archetype_mapping_audit.py` | ❌ (Tool) | `_archetype_mapping_gaps.json` |
| S-04 | `backfill_labs_tournament_id.py` | ❌ (Wartung) | `labs_tournament_id_overrides.json` |
| S-05 | `card_actions_builder.py` | ❌ **NICHT in CI** | `card_actions.json` |
| S-06 | `card_price_scraper.py` | ❌ **NICHT in CI** (Legacy?) | `price_data.csv` (Limitless-basiert) |
| S-07 | `cardmarket_id_mapper.py` | ✅ | `cardmarket_id_mapping.csv` |
| S-08 | `cardmarket_price_merger.py` | ✅ | `price_data.csv` (Cardmarket-basiert — ersetzt S-06!) |
| S-09 | `city_league_analysis_scraper.py` | ✅ | `city_league_analysis.csv`, `city_league_analysis_scraped.json` |
| S-10 | `city_league_archetype_scraper.py` | ✅ | `city_league_archetypes.csv`, `city_league_archetypes_comparison.csv` |
| S-11 | `city_league_past_analysis_scraper.py` | ✅ | `city_league_analysis_past.csv`, `city_league_analysis_past_scraped.json` |
| S-12 | `city_league_past_archetype_scraper.py` | ✅ | `city_league_archetypes_past.csv`, `..._past_comparison.csv` |
| S-13 | `clean_past_meta_archetypes.py` | ❌ (Wartung) | überarbeitet `tournament_cards_data_cards_*.csv` |
| S-14 | `current_meta_analysis_scraper.py` | ✅ | `current_meta_card_data.csv`, `online_tournament_dated_cards.csv`, `current_meta_scraped_tournaments.json` |
| S-15 | `generate_tooltips.py` | ⚠️ separat (`generate-tooltips.yml`, Sonntag 6 UTC) | `generated_tooltips.json` |
| S-16 | `japanese_cards_scraper.py` | ❌ **NICHT in CI** | `japanese_cards_database.csv/json` |
| S-17 | `labs_tournament_scraper.py` | ✅ (separat) | `labs_tournament_decks.csv`, `labs_tournament_matchups.csv`, `format_window.json`, plus `_<META>.csv` Splits |
| S-18 | `limitless_online_scraper.py` | ✅ | `limitless_online_decks.csv`, `limitless_meta_stats.json`, `online_share_history/YYYY-MM-DD.csv` |
| S-19 | `online_tournament_scraper.py` | ✅ | `online_tournament_top8_decks.csv` |
| S-20 | `pokemon_card_effects_scraper.py` | ✅ | `pokemon_card_effects.json` |
| S-21 | `pokemon_card_text_scraper.py` | ✅ | `pokemon_card_text.json` |
| S-22 | `run_pipeline.py` | ❌ (Orchestrator, Legacy?) | benutzt andere Outputs |
| S-23 | `tournament_scraper_JH.py` | ✅ | `tournament_cards_data_cards_*.csv`, `_overview.csv`, `formats_catalog.json` |

**Zusatz aus `core/`:**
| `update_sets.py` | ✅ | `format_window.json`, `sets_metadata.json` (?) |
| `prepare_card_data.py` | ✅ | `cards_chunk_*.json`, `cards_manifest.json`, `tournament_cards_manifest.json` |
| `tools/build_threat_intel.py` | ✅ | `active_threats.json` |

### 2.2.3 ⚠️ Scraper im Repo, aber nicht im CI

**Diese 7 Scraper sind im Code, laufen aber NICHT automatisch:**

| Scraper | Vermutung |
|---|---|
| `all_cards_scraper.py` | manuell ausgeführt oder durch `cardmarket_price_merger` ersetzt? |
| `card_actions_builder.py` | manuell für DB-Erweiterung |
| `card_price_scraper.py` | **legacy** — wurde durch `cardmarket_price_merger.py` ersetzt |
| `japanese_cards_scraper.py` | manuell |
| `run_pipeline.py` | Legacy-Orchestrator? Wird im CI durch die explicite Schleife ersetzt |
| `archetype_mapping_audit.py` | manuelles Audit-Tool |
| `backfill_labs_tournament_id.py` | manuelles Wartungs-Skript |
| `clean_past_meta_archetypes.py` | manuelles Wartungs-Skript |

→ **🟢 Pre-Finding 2-A:** `card_price_scraper.py` und `run_pipeline.py` sind verdächtig: Legacy-Code, der ggf. entfernt werden kann (nach Verifikation in Phase 4).

---

## 2.3 Output-Dateien im `data/`-Verzeichnis

**81 CSVs + 17 JSONs + 19 daily online-share snapshots.**

### 2.3.1 Kategorisiert

**Karten-Stammdaten:**
- `all_cards_database.csv` (5.7 MB) — Master DB
- `all_cards_database.json` (10.9 MB)
- `all_cards_merged.csv` (6.5 MB) — `all_cards_database.csv` + zusätzliche Felder
- `all_cards_merged.json` (12.9 MB)
- `cards_chunk_extended.json` (2.5 MB), `cards_chunk_standard.json` (2.1 MB), `cards_chunk_legacy.json` (6.3 MB) — per-Format Subset
- `cards_manifest.json` (501 bytes)
- `sets.json`, `sets_metadata.json`, `formats_catalog.json`, `format_window.json`
- `japanese_cards_database.csv/json`

**Preise:**
- `price_data.csv` — aktive Preise (UTF-8 BOM + EU-Format)
- `price_guide_6.json` (~14 MB) — Cardmarket-Snapshot
- `price_guide.json` — ❓ älter? legacy?
- `products_singles_6.json` + `products_nonsingles_6.json` — Cardmarket-Katalog
- `products_singles.json` + `products_nonsingles.json` — ❓ Legacy (ohne `_6`-Suffix)?
- `cardmarket_id_mapping.csv` (605 KB)

**Card-Effects:**
- `pokemon_card_effects.json`
- `pokemon_card_text.json`
- `card_actions.json` (20 KB)
- `card_capability_taxonomy.json`, `card_capability_patterns.json`, `card_capability_interactions.json`
- `ace_specs.json`
- `active_threats.json`

**Tournament-Daten (per Meta):**
- `labs_tournament_decks.csv` (952 KB, all-meta)
- `labs_tournament_decks_<META>.csv` × 12 — per-meta Splits
- `labs_tournament_matchups.csv` (5.6 MB, all-meta)
- `labs_tournament_matchups_<META>.csv` × 8 — per-meta Splits
- `labs_tournaments.json`, `labs_tournament_id_overrides.json`
- `tournament_cards_data_cards_<META>.csv` × 15
- `tournament_cards_data_overview.csv`
- `tournament_cards_manifest.json`

**Online-Tracking:**
- `limitless_online_decks.csv`
- `limitless_online_decks_comparison.csv`
- `limitless_online_decks_matchups.csv`
- `limitless_meta_stats.json` (64 bytes — sehr klein!)
- `online_tournament_dated_cards.csv` (~13 MB)
- `online_tournament_top8_decks.csv`
- `online_share_history/YYYY-MM-DD.csv` × 19 Snapshots

**City League:**
- `city_league_analysis.csv` (304 bytes — fast leer)
- `city_league_analysis_M3.csv` (31 MB!)
- `city_league_analysis_past.csv` (41 MB)
- `city_league_archetypes.csv` (73 bytes — Header only!)
- `city_league_archetypes_M3.csv` (726 KB)
- `city_league_archetypes_comparison.csv` (183 bytes — Header only!)
- `city_league_archetypes_comparison_M3.csv` (22 KB)
- `city_league_archetypes_deck_stats.csv` (100 bytes — Header only!)
- `city_league_archetypes_past.csv` (952 KB)
- `city_league_archetypes_past_comparison.csv` (26 KB)
- `city_league_archetypes_past_deck_stats.csv` (416 KB)
- `city_league_images.json`, `city_league_images_M3.json`

**Sonstiges:**
- `archetype_icons.json` (37 KB)
- `_archetype_mapping_gaps.json` — Audit-Output
- `current_meta_card_data.csv` (571 KB)
- `current_meta_scraped_tournaments.json` (31 bytes — `{"scraped_tournament_ids": []}`)
- `energy_type_map.json`, `pokemon_dex_numbers.json`, `pokemon_type_map.json`
- `testing_group_bootstrap.json`
- `tournament_jh_scraped.json`
- `generated_tooltips.json` (2 bytes — `{}`)

### 2.3.2 🔴 **Pre-Finding 2-B: Leere/Header-only Files mit aktivem Daten-Zwilling**

| Leeres File | Volles File | Größen-Verhältnis |
|---|---|---|
| `city_league_archetypes.csv` | `city_league_archetypes_M3.csv` | 73 B vs 726 KB |
| `city_league_archetypes_comparison.csv` | `city_league_archetypes_comparison_M3.csv` | 183 B vs 22 KB |
| `city_league_archetypes_deck_stats.csv` | (kein _M3-Pendant) | 100 B (nur Header) |
| `city_league_analysis.csv` | `city_league_analysis_M3.csv` | 304 B vs 31 MB |
| `current_meta_scraped_tournaments.json` | — | 31 B (leeres Array) |
| `limitless_meta_stats.json` | — | 64 B (winziges Aggregat) |
| `generated_tooltips.json` | — | 2 B (`{}`) |

**Befund — wahrscheinlich Pfad-Drift:**

- `js/app-tier-meta.js:396` zeigt: `formatSuffix = window.currentCityLeagueFormat === 'M3' ? '_M3' : ''`
  → Wenn User-Setting "M3" wählt, lädt UI die `_M3.csv` files.
- Default (kein `_M3`) → lädt die LEEREN files.

**Hypothese (in Phase 4 zu verifizieren):** Der `city_league_archetype_scraper.py` schreibt aktuell nach den nicht-suffixed Files (Default-Pfad in `city_league_archetype_settings.json:97 → "output_file": "city_league_archetypes.csv"`), produziert aber **leeren Output** (z.B. weil die externe Quelle für Default-Format keine Daten hat / verzieht). Die `_M3`-Versionen sind alt — von einem früheren Lauf mit anderem Format, der NICHT überschrieben wird.

**User-sichtbarer Effekt:** Wenn User in der City-League-UI das Default-Format auswählt → leere Tabelle. M3 wählt → volle Daten. Das ist konfusing-but-not-broken, hängt davon ab wie die UI das defaultet.

→ **In Phase 4 verifizieren:** welcher Filter ist im UI-Default aktiv?

### 2.3.3 🟡 **Pre-Finding 2-C: Legacy-Files ohne `_6`-Suffix**

`products_singles.json`, `products_nonsingles.json`, `price_guide.json` existieren parallel zu den `_6`-Versionen. Cardmarket nummeriert Game IDs (6 = Pokémon). Die nicht-suffixed Versionen sind vermutlich **Legacy** aus einem früheren Setup.

→ In Phase 3 prüfen: lesen Loader noch die nicht-suffixed Versionen?

### 2.3.4 `_archive/` — soft-deletes

`data/_archive/soft-delete-2026-03-31/` enthält bewusst archivierte Files (z.B. alte `all_cards_database.csv`, `price_data.csv`). Mit `MOVED_FILES.txt` als Manifest. → ignoriert für den Audit, hier wurde sauber archiviert.

---

## 2.4 Kategorie B — Statische / Manuelle Daten

Im Repo geprüft (nicht-Scraper-erzeugt):

| Datei | Inhalt | Pflege |
|---|---|---|
| `data/sets.json` | Set-Metadaten (Codes → Namen) | manuell? |
| `data/sets_metadata.json` | Erweiterte Set-Daten | manuell |
| `data/formats_catalog.json` | Format-Definitionen | manuell |
| `data/ace_specs.json` | ACE-SPEC-Karten-Liste | manuell |
| `data/energy_type_map.json` | Energy-Type-Mapping | manuell |
| `data/pokemon_dex_numbers.json` | Pokédex-Nummern | manuell |
| `data/pokemon_type_map.json` | Pokémon-Typ-Mapping | manuell |
| `data/card_capability_taxonomy.json` | Card-Capability-Definitionen | manuell |
| `data/card_capability_patterns.json` | Card-Capability-Patterns | manuell |
| `data/card_capability_interactions.json` | Card-Capability-Interactions | manuell |
| `data/testing_group_bootstrap.json` | Initial-Bootstrap-Daten für Testing Groups | manuell |
| `config/` (Top-Level-Ordner) | ❓ in Phase 3 prüfen | ? |

→ **Klärungsfrage 8 (neu):** Welche der `card_capability_*.json` Files pflegst du manuell und wie? (z.B. ediert in einem Tool, oder direkt im JSON?)

---

## 2.5 Kategorie C — Externe APIs (Laufzeit-Fetches)

Belegt aus `grep` nach `https?://` in `js/*.js`:

| URL | Wofür | Welcher Code | Hinweis |
|---|---|---|---|
| `https://r2.limitlesstcg.net/pokemon/gen9/...` | Pokémon-Sprites | `app-meta-call.js`, `app-meta-cards.js` etc. | CDN-Read |
| `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/...` | Karten-Bilder | mehrere | CDN-Read |
| `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/...` | ältere Karten-Bilder | mehrere | CDN-Read |
| `https://limitlesstcg.com/cards/...` | Karten-Detail-Seite (Deep-Link) | mehrere | Browser-Navigate |
| `https://my.limitlesstcg.com/builder` | Deck-Builder-Deep-Link | `app-deck-builder.js` | Browser-Navigate |
| `https://limitlesstcg.com/tools/swisscalc` | Swiss-Calculator-Link | `app-meta-call.js` | Browser-Navigate |
| `https://pokeapi.co/api/v2/pokemon/...` | PokéAPI-Sprite-Backup | ❓ in Phase 3 finden | API-Read |
| `https://images.pokemontcg.io/card-back.png` | Karten-Rückseite | mehrere | CDN-Read |
| `https://images.weserv.nl/?url=...` | Image-Proxy/Resize | mehrere | Proxy-Service |
| `https://pokemonproxies.com/images/...` | Proxy-Karten-Bilder | `pdf/proxy`-Code | CDN-Read |
| `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=...` | Preis-Quelle-Deep-Link | `app-price.js`? | Browser-Navigate |
| `https://tcg-showdown.com/` | Externer Playtester | `tcg-showdown-link.js` | Browser-Navigate (ersetzt F-23) |
| `https://thedipidis.app/` | Eigene URL (intern) | mehrere | self-reference |
| `https://via.placeholder.com/...` | Fallback-Placeholder | `card-data-cache.js`? | wenn Bild fehlt |
| `http://www.w3.org/2000/svg` | XML-Namespace | mehrere | nicht fetched, nur Namespace |

→ **🟢 Pre-Finding 2-D:** Mehrere Image-CDN-URLs (`limitlesstcg.nyc3.cdn.digitaloceanspaces.com`) sind hardcoded — falls Limitless den Bucket wechselt, brechen alle Bilder. Niedriges Risiko, nur wenn Limitless was ändert.

→ **🟡 Pre-Finding 2-E:** `images.weserv.nl` ist ein **externer Image-Proxy** — Datenschutz? Falls die Site EU-Nutzer hat, wandern Image-URLs durch einen Dritt-Dienst. In Phase 4 prüfen wo das genutzt wird.

---

## 2.6 Kategorie D — Firebase / Firestore

### 2.6.1 Collections referenziert

Belegt aus `grep` nach Collection-Namen in JS:

| Collection | Schreibt | Liest |
|---|---|---|
| `activity` | `app-testing-groups.js` | `app-testing-groups.js` |
| `battleJournal` | `battle-journal.js` | `battle-journal.js` |
| `decks` | `app-current-meta-analysis.js`, `firebase-globals.js`, `firebase-collection.js` | mehrere |
| `games` | `firebase-multiplayer.js` (LEGACY!), `i18n.js` | — |
| `joinRequests` | `app-testing-groups.js` | `app-testing-groups.js` |
| `publicProfiles` | `app-testing-groups.js` | `app-testing-groups.js` |
| `shared_decks` | `app-features.js` | `app-features.js` |
| `testingGroupInvites` | `app-testing-groups.js` | `app-testing-groups.js` |
| `testingGroups` | `app-testing-groups.js` | `app-testing-groups.js` |
| `users` | `battle-journal.js`, `meta-binder.js`, `firebase-globals.js`, `firebase-collection.js` | mehrere |

### 2.6.2 Firestore-API-Operationen (Anzahl-Indikator)

Aus `firebase-*.js` + `battle-journal.js` + `app-testing-groups.js`:

- `.add(...)` — 58 references
- `.get(...)` — 49 references
- `.set(...)` — 27 references
- `.delete(...)` — 19 references
- `.update(...)` — 9 references

→ Firestore wird intensiv genutzt — gerade für Profile-Sub-Tabs (Collection, Wishlist, Tradelist, Decks, Journal, Testing Groups).

### 2.6.3 🟡 **Pre-Finding 2-F: Legacy-Collection `games`**

`games` wird in `firebase-multiplayer.js` referenziert (Legacy laut User-Aussage in Q6). Und in `i18n.js` (was komisch ist — vermutlich nur ein i18n-Key der das Wort enthält, keine echte Operation; in Phase 3 verifizieren).

→ **Cleanup-Kandidat:** Wenn Multiplayer komplett tot ist, kann die `games`-Collection auch in Firestore weg (FS-Rules + Storage-Cost).

---

## 2.7 Kategorie E — Browser-State

### 2.7.1 LocalStorage

Files mit `localStorage.` Referenzen (Top-Heavy):

- `app-meta-call.js`: 16 refs — Scenarios, Settings, Date-Window-Override, Group-Toggles
- `battle-journal.js`: 12 refs — Match-Log-Drafts?
- Weitere Files mit 1-6 refs

→ **Klärungsfrage 9:** Sollte LocalStorage-Schlüssel-Inventory in Phase 3 detailliert werden? Z.B. `ScenariosStorageKey`, `JunkPctKey`, etc. — falls keys umbenannt wurden, könnten User Daten verlieren.

### 2.7.2 localforage / IndexedDB

`js/card-data-cache.js` — vermutlich Karten-DB-Cache. Geladen aus `index.html:4823` (`localforage.min.js`).
`js/firebase-auth.js` — Firebase nutzt IndexedDB intern für Auth-Token-Persistenz.
`js/pokemon-loading-screen.js` — Boot-Cache für Splash.

### 2.7.3 SessionStorage / SW-Cache

Service Worker:
- ❓ Gibt's einen Service Worker? In Phase 3 prüfen — der Commit-Comment in `09744be` erwähnt "SW network-first for /data/". → In `service-worker.js`-File suchen.

```
$ find / -name "service-worker.js" o.ä. → in Phase 3
```

### 2.7.4 `csv-cache-interceptor.js`

Lädt früh in `index.html:413` — `cache-interceptor`-Pattern. Was macht der? In Phase 3 verifizieren.

---

## 2.8 CI-Workflows Übersicht

| Workflow | Trigger | Was passiert |
|---|---|---|
| `weekly-full-update.yml` | `cron: 0 6 * * 2` (Di 6 UTC) + manuell | 17 Scraper laufen, Outputs werden in `data/` committed, GitHub Pages re-deployt |
| `deploy-pages.yml` | on push to `main` | Tests (JS + Python) → Deploy zu Pages |
| `generate-tooltips.yml` | `cron: 0 6 * * 0` (So 6 UTC) | Tooltip-Generator läuft → `generated_tooltips.json` |
| `visual-fullpage.yml` | `cron: 0 3 * * *` (täglich 3 UTC) | Playwright Visual-Regression-Tests |
| `visual-nonmeta.yml` | on push | Playwright Visual-Regression-Tests (Non-Meta-Tabs) |

→ **🟢 Pre-Finding 2-G:** `generated_tooltips.json` ist nur **2 Bytes** (`{}`). Der Sonntags-Tooltip-Generator produziert nichts (oder das Script ist kaputt). In Phase 4 prüfen.

→ **🟡 Pre-Finding 2-H:** `current_meta_scraped_tournaments.json` ist nur **31 Bytes** (`{"scraped_tournament_ids": []}`). Das deutet auf einen Scraper hin, der **noch nie etwas gescraped hat** oder regelmäßig leer überschrieben wird. In Phase 4 prüfen.

→ **🟢 Pre-Finding 2-I:** `limitless_meta_stats.json` ist nur **64 Bytes** (`{"tournaments":199,"players":14026,"matches":31411}`). Das ist ein aggregiertes Statistik-File, aber statisch winzig — ist das der vollständige Output von `limitless_online_scraper.py` für `limitless_meta_stats.json`?

---

## 2.9 Schema-Stichprobe pro Datenquelle (Top 10)

(Belege durch `head -2`)

### `limitless_online_decks_comparison.csv`
```
deck_name;old_share;new_share;old_count;new_count;change;trend;trend_share;...
"Dragapult ex";8.45;8.40;1023;1015;-0.05;down;-0.05;...
```

### `labs_tournament_decks.csv`
```
meta,tournament_id,tournament_name,tournament_date,scraped_at,player_count,deck_slug,deck_name,share_pct,win_pct,...
```

### `labs_tournament_matchups.csv`
```
meta,tournaments_used,tournament_count,my_deck_slug,my_deck_name,my_deck_player_count,my_deck_total_wins,my_deck_total_losses,my_deck_total_ties,my_deck_overall_win_pct,opponent_deck_slug,opponent_deck_name,vs_count,vs_win_pct,day_filter,scraped_at
```

### `online_tournament_dated_cards.csv`
```
tournament_id;tournament_name;meta;tournament_date;archetype;card_name;card_identifier;total_count;max_count;deck_inclusion_count;average_count;total_decks_in_archetype;percentage_in_archetype;set_code;set_name;set_number;rarity;type;image_url;is_ace_spec;total_players
```

### `online_tournament_top8_decks.csv`
```
deck_name;tournaments_seen;total_brought_weighted;top8_count_weighted;top16_count_weighted;top8_conv_rate;top16_conv_rate;avg_winrate_in_top8;last_seen_date;source_format
```

### `cardmarket_id_mapping.csv`
```
set,number,cardmarket_product_id,base_name,match_method
```

### `price_data.csv`
(EU-Format, Komma-Dezimal, €-Suffix)
```
set,number,eur_price,eur_low,...
```

### `price_guide_6.json`
```json
{
  "version": 1,
  "createdAt": "2026-05-26T...",
  "priceGuides": [
    {"idProduct": 271439, "idCategory": 52, "avg": 240, "low": 85, "trend": 241.26, ...}
  ]
}
```

### `format_window.json`
```json
{
  "current_set": "CRI",
  "set_release_date": "2026-05-22",
  "in_person_legal_date": "2026-06-05",
  ...
}
```

### `online_share_history/manifest.json` + `<date>.csv`-Snapshots
```
deck_name;share
Pure Dragapult;8.40
...
```

---

## 2.10 Bekannte Risiko-Muster — was ich aktiv gefunden habe

| Risiko | Befund | Status |
|---|---|---|
| **Pfad-Drift** | _M3 vs Default city_league files (PreF 2-B) | 🔴 — UI zeigt vermutlich leere Daten im Default |
| **Schema-Drift** | CSV-Separatoren mixed: meiste Files `;`, aber `labs_tournament_matchups.csv` ist `,` | 🟡 — Code-Comments deuten an dass dies bewusst ist, aber inkonsistent |
| **Cap-Limits** | In Scrapern? **Noch nicht systematisch geprüft** — Phase 4 |
| **Leere/Stale Files** | 7 Header-only-Files (2.3.2) | 🟡 — manche bewusst (leerer State), manche broken |
| **Cardmarket-Files doppelt** | `products_singles.json` + `_6.json` parallel (PreF 2-C) | 🟡 — vermutlich Legacy ohne `_6` |
| **Externer Image-Proxy** | `images.weserv.nl` (PreF 2-E) | 🟢 — Datenschutz-Punkt |
| **Legacy-Firebase-Collection** | `games` (PreF 2-F) | 🟢 — Cleanup-Kandidat |

---

## 2.11 Was ich NICHT in Phase 2 prüfen konnte

❌ **Service Worker:** Existiert vermutlich, aber `js/`-Ordner hat keine `service-worker.js`. → In Phase 3 systematisch suchen (Root, `frontend/`).

❌ **Welcher Scraper schreibt was — Detail:** Mein `grep` findet `.csv`-/.`json`-Strings in jedem Scraper, aber nicht alle davon sind Output-Pfade. Manche sind nur error-messages. → In Phase 4 pro Pipeline tief verifizieren.

❌ **Cap-Limits:** Ich habe nicht systematisch nach `MAX_*`, `LIMIT_*`, `slice()`, `head()`, `[:n]`-Pattern in Scrapern gesucht. → In Phase 4 pro Pipeline.

❌ **Firestore Rules:** `firestore.rules` existiert (6.4 KB im Root) — nicht analysiert. Wenn Rules zu permissiv sind, ist das ein Sicherheits-Finding. → In Phase 4 oder Phase 6 anschauen.

❌ **`config/`-Top-Level-Ordner:** Nicht inventarisiert. → In Phase 3.

❌ **Wo werden `card_capability_*.json` editiert?** Manuell durch User? Tooling fehlt? → Klärungsfrage 8.

---

## 2.12 Konsolidierte Pre-Findings aus Phase 2

| ID | Titel | Risiko | Belege |
|---|---|---|---|
| **🔴 PreF 2-B** | City-League-Default-CSVs leer; `_M3`-Versionen voll. User sieht im Default-Format vermutlich keine Daten. | high | `city_league_archetypes.csv` 73 B vs `_M3` 726 KB |
| **🟡 PreF 2-A** | 7 Scraper im Repo aber nicht in CI — vermutlich Legacy | low | `weekly-full-update.yml` Liste fehlt diese |
| **🟡 PreF 2-C** | Cardmarket-Files doppelt (mit/ohne `_6`-Suffix) | low | `products_singles.json` + `_6.json` parallel |
| **🟡 PreF 2-E** | Externer Image-Proxy `images.weserv.nl` | low/med | Datenschutz-Punkt |
| **🟡 PreF 2-F** | Legacy `games`-Collection in Firestore | low | nur in `firebase-multiplayer.js` |
| **🟡 PreF 2-H** | `current_meta_scraped_tournaments.json` permanent leer (31 B) | medium | leeres Array — Scraper läuft aber tut nichts? |
| **🟢 PreF 2-D** | Image-CDN-URLs hardcoded | low | Robustheit |
| **🟢 PreF 2-G** | Tooltip-Generator produziert nichts (`{}`) | low | Sonntags-CI, broken? |
| **🟢 PreF 2-I** | `limitless_meta_stats.json` winzig (64 B) | low | evtl. erwartet, prüfen |

---

## 2.13 Offene Fragen an den User

1. **F-8 (neu): Card Capability JSONs** — `card_capability_taxonomy.json`, `_patterns.json`, `_interactions.json` werden manuell gepflegt. Wie editierst du sie? (Texteditor / Tool / Script?) Falls manuell: ist das ein Pflege-Aufwand der dich nervt?

2. **F-9 (neu): City-League-Default vs M3** — Welches Format wählst du normalerweise in der City-League-Tab? Wenn "M3", dann ist PreF 2-B kein User-sichtbares Problem (du siehst die `_M3`-Daten). Wenn Default → leere Tabelle.

3. **F-10 (neu): `limitless_meta_stats.json`** — 64 bytes, nur 3 aggregate counts. Erwartest du dort mehr Daten? Oder ist das absichtlich kompakt?

4. **F-11 (neu): `current_meta_scraped_tournaments.json`** — Wird das jemals gefüllt? Wenn nicht, ist der Scraper kaputt — wenn ja, was triggert das Füllen?

5. **F-12 (neu): Tooltip-Generator** — `generated_tooltips.json` ist `{}`. Sollte das Daten enthalten?

6. **F-13 (neu): Service Worker** — Hast du einen Service Worker im Einsatz für offline-fähiges Browsen, oder hat das in der Vergangenheit Probleme gemacht und ist deaktiviert?

---

**STOP nach Phase 2.** Bitte sichte die Liste, beantworte die 6 neuen Fragen, dann Phase 3.
