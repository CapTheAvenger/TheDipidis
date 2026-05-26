# Phase 3 — Feature-Daten-Mapping

**Datum:** 2026-05-26
**Branch:** `main` @ `f6f38eb`
**Methode:** Static analysis: grep für `fetch('data/...')`, Firestore-Collection-Refs, `window.XXX`-Module-Exports

---

## 3.0 Aufgelöste Phase-2-Klärungen

### F-8 — Was machen die `card_capability_*.json` Files?

Belegt aus den `_doc`-Feldern in den Files:

- **`card_capability_taxonomy.json`** — Definiert die Capability-Tags (z.B. `attack.ignores_effects`, `ability.ko_prevention`). Jedes Tag hat `side` (offensive/defensive), `scope`, `desc`, `summary_en/de` (für Plain-Language-Erklärung im Tech-Lab) und `affects_subset` (z.B. nur Pokémon-ex).
- **`card_capability_patterns.json`** — Regex-Patterns die aus dem Karten-Regeltext (aus `pokemon_card_effects.json`) Tags extrahieren. Confidence-Level: `high` / `medium` / `low`.
- **`card_capability_interactions.json`** — Welche Attacker-Tag + Defender-Tag Kombination ein Tech-Counter-Matchup auslöst. Mit `matchup_value` (Heuristik in pp).

**Pflege:** Manuell + vermutlich initial mit AI-Hilfe erstellt. Der `_doc` ist auf `2026-05-15` datiert. → **Du musst die nicht "regelmäßig editieren"** — neue Karten werden automatisch durch die Patterns klassifiziert. Nur wenn ein Tag oder ein Pattern *neu erfunden* wird (z.B. ein nie dagewesener Effekt), brauchst du manuelle Pflege.

### F-13 — Service Worker existiert und ist aktiv

Belegt aus:
- `service-worker.js` (Root, Version `v202605260716`)
- `index.html:4920` — `navigator.serviceWorker.register('./service-worker.js', {...})`

Strategie laut Header:
- HTML/JS/CSS: **network-first** (immer frisch, Fallback Cache)
- Data files: **network-first** (siehe Comment in `09744be`)
- Images: **cache-first**

Shell-Assets sind in `SHELL_ASSETS = [...]` hartcodiert (~40+ Files). → 🟢 **Pre-Finding 3-A:** Beim Hinzufügen neuer JS-Files muss die `SHELL_ASSETS`-Liste manuell aktualisiert werden, sonst werden sie nicht offline gecached.

---

## 3.1 Feature → Datenquellen Matrix

Aufgelistet sind nur **gelesene** Datenquellen (R). Schreibende Operationen → Firestore-Sektion 3.3.

| Feature | data/*-Files gelesen | Firestore-Reads | Externe APIs |
|---|---|---|---|
| **F-01 Hub** | – | – | – |
| **F-02 City League** | `city_league_archetypes.csv` 🔴, `city_league_archetypes_past.csv`, `city_league_archetypes_comparison.csv`, `_past_comparison.csv`, `city_league_analysis.csv`, `city_league_analysis_past.csv` | – | – |
| **F-03 CL Analysis** | (gleich wie F-02 + `current_meta_card_data.csv`) | – | Limitless CDN (Bilder) |
| **F-04 Current Meta** | `limitless_online_decks.csv`, `limitless_online_decks_comparison.csv` (`csv-cache-interceptor`!) | – | – |
| **F-05 Current Meta Analysis** | `active_threats.json`, `card_capability_taxonomy.json`, `limitless_online_decks.csv`, `limitless_online_decks_comparison.csv`, `limitless_online_decks_matchups.csv`, `online_tournament_dated_cards.csv`, `tournament_cards_data_cards.csv` (per format) | – | Limitless CDN |
| **F-06 Past Meta** | `sets.json`, `tournament_cards_data_cards_<META>.csv`, `tournament_cards_data_overview.csv`, `tournament_cards_manifest.json`, plus `labs_tournament_matchups_<META>.csv` | – | – |
| **F-07 Meta Call** | `format_window.json`, `labs_tournament_decks.csv`, `labs_tournament_matchups.csv`, `limitless_online_decks_comparison.csv`, `limitless_online_decks_matchups.csv`, `online_share_history/manifest.json` + Snapshots, `online_tournament_dated_cards.csv`, `online_tournament_top8_decks.csv`, `pokemon_card_effects.json`, `tournament_cards_manifest.json`, `city_league_archetypes_comparison.csv`, `city_league_archetypes_past_comparison.csv` | `users` (loadSettings) | – |
| **F-08 Tier Meta** | (selbst keine direkten Daten — Helper für City League / Current Meta) | – | – |
| **F-09 Card DB** | `energy_type_map.json`, `pokemon_type_map.json`, `tournament_cards_data_cards.csv`, `current_meta_card_data.csv`, `city_league_analysis.csv`, `tournament_cards_manifest.json`, plus ⚠️ `pokemon_sets_mapping.csv` (REFERENZIERT NICHT EXISTENT!) | `users` (Collection-Counts) | Limitless CDN (Karten-Bilder) |
| **F-10 Proxy Printer** | (nutzt App-Core-Daten — keine eigenen Files) | – | `pokemonproxies.com/images/`, `images.weserv.nl` |
| **F-11 Calculator** | – | – | – |
| **F-12 Tutorial** | – (statisch) | – | – |
| **F-13 Profile/Collection** | `pokemon_card_text.json` (über `firebase-collection.js`) | `users` (R/W), `decks` | – |
| **F-14 My Decks** | (verwendet `app-deck-builder.js` Daten) | `users`, `decks`, `shared_decks` | – |
| **F-15 Wishlist** | (rendered durch `firebase-collection.js`) | `users.wishlist` (Field) | – |
| **F-16 Tradelist** | (rendered durch `firebase-collection.js`) | `users.tradelist` (Field) | – |
| **F-17 Meta Binder** | `city_league_analysis.csv`, `city_league_analysis_past.csv`, `city_league_archetypes_comparison.csv`, `..._past_comparison.csv`, `current_meta_card_data.csv`, `limitless_online_decks_comparison.csv` | `users` (gespeicherte Binder-States) | – |
| **F-18 Custom Binder** | `city_league_archetypes_comparison.csv`, `..._past_comparison.csv`, `limitless_online_decks_comparison.csv` | `users` (gespeicherte States) | – |
| **F-19 Battle Journal** | – (rein User-State) | `users`, `battleJournal` (R/W) | – |
| **F-20 Deck Compare** | – | – | – |
| **F-21 Testing Groups** | `testing_group_bootstrap.json` | `testingGroups`, `testingGroupInvites`, `joinRequests`, `publicProfiles`, `activity` (R/W) | – |
| **F-22 Settings** | – | `users` (R/W) | – |
| **F-23 Playtester** | 🚫 legacy | – | – |
| **F-24 Multiplayer** | 🚫 legacy | `games` (legacy) | – |
| **F-25 TCG Showdown Link** | – | – | `tcg-showdown.com` (Browser-Navigate) |

### Cross-cutting Module (nicht featuregebunden)

| Modul | Datenquellen | Rolle |
|---|---|---|
| **app-core.js** | `ace_specs.json`, `all_cards_merged.json`, `cards_manifest.json`, `current_meta_card_data.csv`, `pokemon_dex_numbers.json`, `sets.json`, `tournament_cards_data_cards.csv` | Karten-DB-Init, Proxy-Queue, Card-Search shared utility |
| **app-deck-builder.js** (500 KB!) | `active_threats.json`, `online_tournament_dated_cards.csv`, `pokemon_card_effects.json`, `tournament_cards_data_cards.csv` | Deck-Builder (innerhalb My Decks + Current Meta Analysis) |
| **app-tech-lab.js** | `card_capability_*.json` (alle 3), `pokemon_card_effects.json` | Tech-Lab innerhalb Deck Builder |
| **app-anti-tech.js** | `active_threats.json` | Anti-Tech innerhalb Deck Builder + Tech Lab |
| **card-capability-engine.js** | `card_capability_*.json` (alle 3), `pokemon_card_effects.json` | Engine für Anti-Tech / Tech-Lab |
| **app-meta-cards.js** | viele CL-Files + `current_meta_card_data.csv` + `limitless_online_decks_comparison.csv` + `tournament_cards_data_overview.csv` | Card-Filtering innerhalb Current Meta Analysis |
| **pokemon-loading-screen.js** | 9 vorab geladene Files (Boot-Cache) | Splash-Screen + Pre-load |
| **csv-cache-interceptor.js** | 9 abgefangene Files (siehe 3.2) | Re-fetch-Limiter |

---

## 3.2 Geteilte Datenquellen (Mehrfach-Nutzer)

Die kritischsten Files — wenn diese kaputt sind, sind viele Features gleichzeitig betroffen:

| Datei | Anzahl Reader | Welche Features |
|---|---|---|
| **`limitless_online_decks_comparison.csv`** | 5 | F-04, F-05, F-07, F-17, F-18 |
| **`city_league_archetypes_comparison.csv`** | 4 | F-02, F-07, F-17, F-18 |
| **`tournament_cards_data_cards.csv`** | 5 | F-05, F-06, F-09, app-core, app-deck-builder |
| **`current_meta_card_data.csv`** | 3 | F-09, F-17, app-core |
| **`active_threats.json`** | 3 | F-05, app-deck-builder, F-anti-tech |
| **`pokemon_card_effects.json`** | 4 | F-07, F-tech-lab, app-deck-builder, card-capability-engine |
| **`city_league_archetypes.csv`** 🔴 | 2 | F-02, csv-cache-interceptor (pre-cache), pokemon-loading-screen (pre-load) |
| **`labs_tournament_matchups.csv`** | 2 | F-07, F-06 |
| **`sets.json`** | 3+ | F-06, app-core, pokemon-loading-screen, csv-cache-interceptor |
| **`format_window.json`** | 1 (aber zentral!) | F-07 |
| **`card_capability_*.json`** | 2 | card-capability-engine, F-tech-lab |

### Pre-loaded by `pokemon-loading-screen.js` (BLOCKING at Boot)

Belegt aus `js/pokemon-loading-screen.js:18-...`:
```
data/city_league_analysis.csv
data/city_league_archetypes.csv           🔴 LEER (73 B)
data/city_league_archetypes_past.csv
data/city_league_archetypes_comparison.csv 🔴 LEER (183 B)
data/city_league_images.json
data/pokemon_dex_numbers.json
data/sets.json
data/ace_specs.json
data/pokemon_sets_mapping.csv             ⚠️ EXISTIERT NICHT!
```

→ **🔴 Pre-Finding 3-B:** `pokemon_sets_mapping.csv` wird beim Boot vorgeladen aber **existiert nicht im Repo**. Loader wirft vermutlich 404. Boot-Screen schluckt das aber stumm (`csv-cache-interceptor` macht hier `try/catch`). Konkret prüfen ob es im Boot-Log Warnings gibt.

→ **🔴 Pre-Finding 3-C:** `pokemon-loading-screen` lädt 2 leere CSVs (`city_league_archetypes.csv`, `..._comparison.csv`) — diese werden vorgecached, der `csv-cache-interceptor` cached den leeren Stand, und dann zeigt das Feature später aus dem Cache leere Daten an, auch wenn das CSV inzwischen voll wäre. **Kombiniert mit Service-Worker `network-first` ist das halb harmlos**, aber wenn der SW im Cache-Fallback-Modus ist (offline), zeigt's leere Daten ohne Hinweis.

---

## 3.3 Firestore — wer schreibt was

| Collection | Schreibt | Liest | Use-Case |
|---|---|---|---|
| `users` | `firebase-collection.js`, `firebase-globals.js`, `battle-journal.js`, `meta-binder.js` | mehrere | User-Profil, Collection-Counts, Settings, Wishlist, Tradelist, Battle Journal Aggregates |
| `decks` | `firebase-collection.js`, `app-current-meta-analysis.js`, `firebase-globals.js` | mehrere | My Decks |
| `shared_decks` | `app-features.js` | `app-features.js` | Geteilte Decks (Public Sharing) |
| `battleJournal` | `battle-journal.js` | `battle-journal.js` | Match-History |
| `testingGroups` | `app-testing-groups.js` | `app-testing-groups.js` | Testing Groups |
| `testingGroupInvites` | `app-testing-groups.js` | `app-testing-groups.js` | Group Invites |
| `joinRequests` | `app-testing-groups.js` | `app-testing-groups.js` | Group Join Requests |
| `publicProfiles` | `app-testing-groups.js` | `app-testing-groups.js` | Öffentliche Profile |
| `activity` | `app-testing-groups.js` | `app-testing-groups.js` | Activity Feed |
| `games` 🚫 | `firebase-multiplayer.js` (LEGACY) | `i18n.js` (false positive) | Multiplayer-Matches |

**Operations-Volumen (statische refs, kein Live):** 58× `.add()`, 49× `.get()`, 27× `.set()`, 19× `.delete()`, 9× `.update()`.

→ **🟡 Pre-Finding 3-D:** `i18n.js` matcht auf `'games'` aus einem i18n-Key (nicht echte Firestore-Operation). False-Positive — in Phase 4 verifizieren ob das wirklich nur ein i18n-String ist.

---

## 3.4 Geteilte Funktionen / Module

### Globale Module (`window.*`)

Belegt durch `grep window\.[A-Z]`:

| Modul | File | Benutzt von |
|---|---|---|
| `window.MetaCall` | `app-meta-call.js` | `app-anti-tech.js`, `app-current-meta-analysis.js`, `app-init.js`, `app-testing-groups.js`, `battle-journal.js`, `firebase-collection.js` |
| `window.TechLab` | `app-tech-lab.js` | (intern + tutorial) |
| `window.CardCapabilityEngine` | `card-capability-engine.js` | `app-anti-tech.js`, `app-tech-lab.js`, `app-current-meta-analysis.js` |
| `window.TestingGroups` | `app-testing-groups.js` | switchProfileTab handler |
| `window.MetaAnalysisHub` | `meta-analysis-hub.js` | switchTab handler |
| `window.ArchetypeIcons` | `archetype-icons.js` | mehrere (für Pokémon-Icons in Listen) |

### Shared Utility Functions

Belegt durch Definition-Suche:

| Funktion | Definiert in | **Doppelt definiert?** |
|---|---|---|
| `normalize(str)` | `app-meta-call.js` UND `archetype-icons.js` | ⚠️ **JA — Code-Duplikation!** |
| `extractMainPokemon(name)` | `app-meta-call.js` only | OK |
| `parseCSV(text, sep)` | `app-core.js` UND `app-meta-call.js` | ⚠️ **JA — Code-Duplikation!** |
| `parseEU(str)` | `app-core.js` UND `app-meta-call.js` | ⚠️ **JA — Code-Duplikation!** |

→ **🟡 Pre-Finding 3-E:** Mindestens 3 wichtige Helper-Funktionen sind in mehreren Files definiert. Risiko: wenn z.B. `normalize()` in `app-meta-call.js` aktualisiert wird (z.B. anderes Apostrophe-Handling), aber `archetype-icons.js` die alte Version behält, sind Lookups inkonsistent. Konkret prüfen in Phase 5.

### Globale Helper aus `app-utils.js`

Ich habe `app-utils.js` (63 KB) noch nicht im Detail gelesen — der wird vor allen anderen geladen (`index.html:4807`) und enthält vermutlich die "echten" globalen Helpers. In Phase 5 systematisch zwischen Helper-Definitionen vergleichen.

---

## 3.5 Kritische Abhängigkeiten

### Single Points of Failure (SPOF)

Wenn diese Files broken oder leer sind, brechen mehrere Features:

| SPOF | Betroffene Features (geschätzt) | Aktueller Status |
|---|---|---|
| `all_cards_database.csv` / `all_cards_merged.json` | F-09 Card DB, app-core, app-deck-builder, alle Karten-Anzeigen | ✅ vorhanden, 5.7 MB |
| `limitless_online_decks_comparison.csv` | F-04, F-05, F-07, F-17, F-18 | ✅ vorhanden, **frisch** (heute) |
| `sets.json` + `sets_metadata.json` | Set-Anzeige überall | ✅ vorhanden |
| `format_window.json` | F-07 Meta Call (Format-Filter) | ✅ vorhanden, 776 Bytes |
| `archetype_icons.json` | Alle Decks-mit-Icons-Anzeigen | ✅ vorhanden, 37 KB |
| `pokemon_card_effects.json` | F-07, F-tech-lab, F-anti-tech, deck-builder | ✅ vorhanden |
| `active_threats.json` | F-05, F-anti-tech | ✅ vorhanden, 12 KB |
| `city_league_archetypes.csv` | **F-02 (city league)** | 🔴 **73 Bytes — Header only!** |
| `pokemon_sets_mapping.csv` | F-09 Card DB, csv-cache-interceptor, pokemon-loading-screen | 🔴 **EXISTIERT NICHT** |
| `card_capability_*.json` (3 Files) | F-tech-lab, F-anti-tech, card-capability-engine | ✅ vorhanden |

### Modulare Abhängigkeiten (wenn Feature A bricht → was passiert?)

```
MetaCall (F-07)
  ↑ benötigt
  ├─ format_window.json     [SPOF]
  ├─ labs_tournament_*.csv  [primary data]
  ├─ pokemon_card_effects.json [shared with Tech Lab]
  └─ Firestore users.*      [user settings]

Card-Capability-Engine
  ↑ benötigt
  ├─ card_capability_*.json (3)
  └─ pokemon_card_effects.json
       ↑ und davon hängen ab:
       Tech Lab (F-tech-lab)
       Anti-Tech (F-anti-tech)
       Current Meta Analysis (F-05)
```

→ Wenn `pokemon_card_effects.json` broken ist, brechen 4 Features gleichzeitig.

---

## 3.6 Profile-Sub-Tab Render-Architektur

Belegt aus `firebase-collection.js:3176` (switchProfileTab) und Container-Inhalt in `index.html`:

| Tab | Render-Strategie |
|---|---|
| Collection | `firebase-collection.js` rendert in `profile-collection` |
| Decks | `firebase-collection.js` rendert in `profile-decks` |
| Wishlist | inline HTML + Funktionen in `firebase-collection.js` (z.B. `toggleWishlist`, `addToWishlist`) — kein separater Render-Pass, sondern direkt-DOM-Manipulation |
| Tradelist | gleich wie Wishlist |
| Meta Binder | `meta-binder.js` (rendert dynamisch in `profile-metabinder`) |
| Custom Binder | `custom-binder.js` |
| Journal | `battle-journal.js` + `openJournalHistoryTab()` (Auto-Trigger im switchProfileTab) |
| Deck Compare | **inline HTML in `index.html:3479`** + Funktion `profileCompareDecklists()` (Definition in ❓ — vermutlich `firebase-collection.js` oder `app-features.js`) |
| Meta Call | `app-meta-call.js` + `MetaCall.init()` (Auto-Trigger) |
| Testing Groups | `app-testing-groups.js` + `TestingGroups.init()` (Auto-Trigger) |
| Settings | ❓ — Container ist `profile-settings` (`index.html:3507`), aber kein dezidiertes Init |

→ **🟢 Pre-Finding 3-F:** Settings-Tab hat keinen Auto-Init im switchProfileTab — vermutlich rein inline-HTML. In Phase 4 verifizieren ob es überhaupt Inhalt zeigt.

---

## 3.7 Bekannte Bugs / Verdächte aus dem Mapping

Konsolidiert mit den Pre-Findings aus Phase 2:

| ID | Befund | Beleg | Risiko |
|---|---|---|---|
| 🔴 PreF 2-B (verstärkt) | `city_league_archetypes.csv` 73 B leer; F-02 lädt es; pre-loaded by boot screen; cached by `csv-cache-interceptor` | mehrere Files | high |
| 🔴 PreF 3-B | `pokemon_sets_mapping.csv` referenziert aber existiert nicht | `csv-cache-interceptor.js`, `pokemon-loading-screen.js`, `app-cards-db.js` | high |
| 🟡 PreF 3-A | Service Worker shell-cache muss manuell mit neuen JS-Files aktualisiert werden | `service-worker.js` SHELL_ASSETS | low |
| 🟡 PreF 3-C | Leere CSVs werden vorgecached → wenn Server-Update später kommt, sieht Browser-Cache weiterhin leer (mit SW network-first nur abgemildert) | csv-cache-interceptor + leere Files | medium |
| 🟡 PreF 3-D | `i18n.js` matcht auf `'games'`-Collection-Name (vermutlich false positive aus i18n-Key) | grep | low |
| 🟡 PreF 3-E | `normalize()`, `parseCSV()`, `parseEU()` doppelt definiert in `app-meta-call.js` und `app-core.js` / `archetype-icons.js` | Code-Duplikation | medium |
| 🟢 PreF 3-F | Profile-Settings-Tab hat keinen klaren Init — Inhalt unklar | grep | low |

---

## 3.8 Was ich NICHT mappen konnte

❌ **Wo wird `profileCompareDecklists()` definiert?** — Inline-onclick verweist auf eine globale Funktion; ich finde sie noch nicht. → Phase 4.

❌ **Was steht im Settings-Tab `profile-settings`?** — Container hat keinen `display-none`-Override im switchProfileTab; vermutlich rein inline HTML. → Phase 4.

❌ **`app-features.js` (75 KB)** — kein klares Top-Level-Feature. Soll vermutlich `shared_decks`-Logik enthalten. → Phase 4 lesen.

❌ **`auth-ui-helpers.js`, `firebase-auth.js`, `firebase-globals.js`** — die Auth-Layer habe ich nur kurz angerissen. Wenn dort Bugs sind, wird Login broken — kritisch. → in Phase 4 prüfen ob Live noch funktioniert.

❌ **`app-utils.js` (63 KB)** — der "echte" globale Helper. Doppelt definierte Funktionen könnten sich daher in Phase 5 als nur scheinbar doppelt herausstellen, wenn `app-utils.js` die kanonische Version enthält.

❌ **`battle-journal.js` (120 KB)** — Datenfluss noch nicht im Detail. Schreibt nach `users` UND `battleJournal` — werden die State-Snapshots konsistent gehalten?

---

## 3.9 Konsolidierte Pre-Findings (Phase 1+2+3)

| ID | Titel | Risiko | Phase entdeckt |
|---|---|---|---|
| 🔴 PreF 2-B | City-League-Default leer, M3-Sibling voll | high | 2, in 3 verstärkt |
| 🔴 PreF 3-B | `pokemon_sets_mapping.csv` referenziert aber nicht existent | high | 3 |
| 🟡 L1 (Phase 1) | Playtester-Tab + Side-Menu-Item haben kaputte onclick-Handlers | medium | 1 |
| 🟡 PreF 2-A | 7 Scraper im Repo, nicht in CI | low | 2 |
| 🟡 PreF 2-C | Cardmarket-Files doppelt (mit/ohne `_6`) | low | 2 |
| 🟡 PreF 2-E | Externer Image-Proxy `images.weserv.nl` | low | 2 |
| 🟡 PreF 2-F | Legacy `games`-Firestore-Collection | low | 2 |
| 🟡 PreF 2-H | `current_meta_scraped_tournaments.json` permanent leer | medium | 2 |
| 🟡 PreF 3-C | Leere CSVs vorgecached → Cache-Drift | medium | 3 |
| 🟡 PreF 3-E | Helper-Funktionen doppelt definiert | medium | 3 |
| 🟢 L2 (Phase 1) | `audit_single_tab.js` 0 bytes (totes Artifact) | low | 1 |
| 🟢 PreF 2-D | Image-CDN-URLs hardcoded | low | 2 |
| 🟢 PreF 2-G | `generated_tooltips.json` ist `{}` (User: "haben wir nicht mehr") | low | 2 |
| 🟢 PreF 2-I | `limitless_meta_stats.json` 64 Bytes (vermutlich erwartet) | low | 2 |
| 🟢 PreF 3-A | SW SHELL_ASSETS muss manuell gepflegt werden | low | 3 |
| 🟢 PreF 3-D | `i18n.js` matcht auf `'games'` (false positive) | low | 3 |
| 🟢 PreF 3-F | Settings-Tab hat unklaren Init-Pfad | low | 3 |

**Bisher: 2 🔴 high, 7 🟡 medium, 7 🟢 low.**

---

## 3.10 Vorschlag für Phase 4 Pipeline-Selection

Die Mapping-Matrix zeigt die Reader-Counts. Ich schlage vor, folgende **6 Pipelines** in Phase 4 End-to-End zu verifizieren (in Priorität):

| # | Pipeline | Warum priorisiert |
|---|---|---|
| **P-1** | City League Archetypes Scraper → CSV → F-02/Hub | **🔴 PreF 2-B** — leere CSV |
| **P-2** | `pokemon_sets_mapping.csv` — wer schreibt, wer liest, warum fehlt | **🔴 PreF 3-B** — fehlende Datei |
| **P-3** | Limitless Online Scraper → `limitless_online_decks_comparison.csv` → 5 Reader | Meiste-Reader-File (zentral) |
| **P-4** | Labs Tournament Scraper → `labs_tournament_decks.csv` + `_matchups.csv` → F-07/F-06 | Predictor-Hauptdaten |
| **P-5** | Cardmarket-Pipeline (3 JSONs → `cardmarket_id_mapping.csv` → `price_data.csv`) | Komplexe Multi-Step, hatte schon Bug |
| **P-6** | Current Meta Analysis Scraper → `current_meta_card_data.csv` + `current_meta_scraped_tournaments.json` | **🟡 PreF 2-H** — Output permanent leer |

Lass mich wissen ob die Auswahl passt, oder ob du andere Pipelines priorisieren willst.

---

**STOP nach Phase 3.** Bitte sichte das Mapping, bestätige die 6 Pipelines für Phase 4 (oder ändere). Dann starte ich Phase 4.
