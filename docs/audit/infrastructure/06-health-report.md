# Phase 6 — Health-Report & priorisierte Findings

**Datum:** 2026-05-26
**Branch:** `main` @ `4cb7198`
**Audit-Zeitraum:** Phasen 0–5 (24h)
**Audit-Scope:** Vollständiges Repository — 25 Features, 24 Scraper, 81 CSVs + 17 JSONs, 10 Firestore-Collections, 14 externe Endpoints

---

## Executive Summary

### Was ich angesehen habe (Fakten)

- **25 logische Features** im Code identifiziert, 23 aktiv + 2 als legacy bestätigt (Playtester / Multiplayer)
- **17 Scraper laufen wöchentlich im CI** (Di 6 UTC); 7 weitere Scraper im Repo, **außerhalb CI**
- **6 Pipelines End-to-End verifiziert** (von Scraper bis UI-Anzeige)
- **34 Findings dokumentiert**, davon 6 🔴 HIGH, 17 🟡 MEDIUM, 11 🟢 LOW
- **Stichproben:** Mega Greninja Share (`8.12 %`) konsistent über 4 Daten-Files, kein Wert-Drift in den geprüften Punkten

### Health-Bewertung pro Hauptbereich

| Bereich | Health | Begründung |
|---|---|---|
| **Meta Call Predictor** (F-07) | 🟢 grün | Nach Audit-Session-Fixes konsistent mit Past-Meta-Modul |
| **Past Meta Modul** (F-06) | 🟢 grün | Saubere Datenquelle, korrekt gerendert |
| **Limitless Online Pipeline** | 🟢 grün | 5 Reader, alle konsistent |
| **City League Pipeline** | 🟡 gelb | Aktuell leer (M5 zu jung) — Pipeline tech OK, aber kein UX-Hinweis |
| **Card Database (Cards-Tab + Deck Builder Karten-Lookup)** | 🔴 rot | **Komplett CRI-blind** — vier Folge-Bugs an einer Root-Cause |
| **Cardmarket-Preise** | 🟡 gelb | Pipeline läuft, aber kein CRI-Preis (Folge von Karten-DB-Problem) |
| **Firebase / Profile-Tabs** | 🟢 grün | Funktional, ein Legacy-Eintrag (`games`-Collection) |
| **Service Worker / Caching** | 🟢 grün | Network-first für Daten, Cache-First für Bilder — gut konfiguriert |
| **Code-Architektur** | 🟡 gelb | Mehrere Drift-Risiken durch Code-Duplikation und HTML-als-Datenquelle |

### Der eine Befund, der am meisten Auswirkung hat

> **Der `all_cards_scraper.py` läuft nicht im wöchentlichen CI-Lauf.**
> 
> Folge: Wenn ein neues Set erscheint (zuletzt CRI am 22.05.2026), muss der Scraper **manuell angestoßen** werden, sonst werden 5 nachgelagerte Files nie mit neuen Karten-Daten gefüttert. **Aktuell: 0 CRI-Karten** in der ganzen Karten-DB.
> 
> User-sichtbarer Effekt: keine CRI-Karten suchbar im Card DB Tab, keine CRI-Decks baubar, keine Preise für CRI-Karten.
> 
> Aus diesem einen strukturellen Loch entstehen **4 der 6 🔴-Findings** (F-001, F-002, F-003, F-005).

---

## Findings-Verzeichnis

Alle Findings sind durchgängig nummeriert (F-001 bis F-034) und nach Risiko sortiert. Jeder Finding hat:

- **ID** — eindeutige Referenz
- **Titel** — knappe Beschreibung
- **Beweis** — Datei + Zeile / Daten-Stichprobe
- **Auswirkung** — wer/was ist betroffen
- **Vermutete Ursache** — falls bekannt
- **Cluster** — gehört zu welcher Findings-Familie

---

## 🔴 HIGH (6 Findings)

### F-001: `all_cards_scraper.py` nicht im CI-Batch
- **Beweis:** `.github/workflows/weekly-full-update.yml:124-141` — Scraper-Loop enthält 17 Scripts, `all_cards_scraper` ist nicht dabei
- **Auswirkung:** Neue Sets benötigen manuelles Triggern. Aktuell **CRI komplett fehlend** in `all_cards_database.csv` (0 CRI-Rows), `cards_chunk_*.json` (0 CRI), `pokemon_card_effects.json` (0 CRI), `price_data.csv` (0 CRI), `pokemon_card_text.json`
- **Vermutete Ursache:** Bewusste Entscheidung wegen Scraper-Dauer/Risiko? Oder vergessen?
- **Cluster:** A (Karten-DB-Lücke)
- **Quelle:** Phase 2 PreF 2-A + Phase 4 P-2-C

### F-002: `pokemon_sets_mapping.csv` enthält kein CRI
- **Beweis:** `pokemon_sets_mapping.csv` (152 Zeilen, letzte Änderung 2026-05-15) — `grep "^CRI"` → leer
- **Auswirkung:** Card DB Tab Set-Filter zeigt CRI nicht. Deck Builder Set-Sortierung kennt CRI-Cards nicht
- **Vermutete Ursache:** Manuell gepflegte Datei, die nach Set-Releases vergessen wird zu aktualisieren
- **Cluster:** A (Karten-DB-Lücke)
- **Quelle:** Phase 4 P-2-B

### F-003: 0 CRI-Preise in `price_data.csv`
- **Beweis:** `python3 -c "import csv; ..."` → 0 Rows mit `set='CRI'`
- **Auswirkung:** User sieht keine Preise für CRI-Karten — Card DB Tab, Profile Collection, Wishlist alle ohne CRI-Preisinfos
- **Vermutete Ursache:** Folge von F-001 — ohne `all_cards_database.csv` Update kein `cardmarket_id_mapping` für CRI-Karten, daher kein Preis-Merge
- **Cluster:** A (Karten-DB-Lücke)
- **Quelle:** Phase 4 P-5-B

### F-004: Set-Metadata-Drift zwischen `format_window.json` und `sets.json`
- **Beweis:**
  - `data/format_window.json` (2026-05-25): `"current_set": "CRI"`
  - `data/sets.json` (2026-05-15): newest entry POR (order=151), kein CRI
  - `data/sets_metadata.json` (2026-05-15): newest entry POR
  - `pokemon_sets_mapping.csv` (2026-05-15): newest entry POR
- **Auswirkung:** Predictor weiß CRI ist current; aber Card DB / Deck Builder kennen es nicht. **Drei Quellen, drei Antworten.**
- **Vermutete Ursache:** `update_sets.py` schreibt laut Header alle drei Files, hat aber im letzten CI-Lauf nur `format_window.json` aktualisiert. Vermutlich Code-Pfad-Bug oder externe Quelle (`limitlesstcg.com/cards`) hatte CRI noch nicht im Cards-Index, als der Scraper lief
- **Cluster:** A (Karten-DB-Lücke)
- **Quelle:** Phase 5 5-C

### F-005: Card-Stammdaten-Files ohne CRI (Aggregat-Finding für Cluster A)
- **Beweis:** Aufgelistet:
  - `all_cards_database.csv` → 0 CRI cards
  - `all_cards_merged.csv` / `.json` → 0 CRI
  - `cards_chunk_extended/standard/legacy.json` → 0 CRI total
  - `pokemon_card_effects.json` → 20.126 entries, 0 CRI
  - `pokemon_card_text.json` → vermutlich auch 0 CRI (Folge derselben Kette)
- **Auswirkung:** **Komplettes Fehlen von CRI in ALLEN Karten-Tabs**. Tech-Lab kann CRI-Karten nicht klassifizieren. Anti-Tech kennt CRI-Karten nicht für Threat-Detection.
- **Vermutete Ursache:** Folge von F-001 — alle diese Scraper bauen auf `all_cards_database.csv` auf
- **Cluster:** A (Karten-DB-Lücke)
- **Quelle:** Phase 4 P-2-C umfassend + Phase 5 Cross-Check

### F-006: `loadCurrentMeta()` lädt HTML-Datei als Daten-Source (eval-style)
- **Beweis:** `js/app-meta-cards.js:1230-1260`
  ```javascript
  const response = await fetch(BASE_PATH + 'limitless_online_decks_comparison.html?t=' + Date.now());
  // ...
  scripts.forEach(script => {
      const scriptElement = document.createElement('script');
      scriptElement.textContent = script.textContent;
      document.head.appendChild(scriptElement);  // EVAL
  });
  ```
- **Auswirkung:** 
  - **Performance:** 829 KB HTML statt ~7 KB CSV-Subset
  - **Sicherheit:** Wenn Scraper kompromittiert wird, beliebiger JS-Code wird in der App ausgeführt
  - **Wartbarkeit:** HTML und CSV müssen vom Scraper im Sync gehalten werden
- **Vermutete Ursache:** Pragmatischer Hack um Matchup-Daten zu transportieren — Scraper rendert HTML mit Matchup-Tabellen + `window.matchupData_*`-Globals; Frontend nutzt das einfach mit
- **Cluster:** D (Architektur)
- **Quelle:** Phase 5 5-D

---

## 🟡 MEDIUM (16 Findings)

### Cluster B — City League Default-Zustand

#### F-007: City-League-Default-CSV leer ohne User-Hinweis
- **Beweis:** `data/city_league_archetypes.csv` = 73 Bytes (Header only). UI zeigt leere Tabelle
- **Auswirkung:** User sieht im City-League-Tab nichts im Default-Format. Past-Tab funktioniert (8.693 M4-Zeilen)
- **Vermutete Ursache:** M5 ist erst seit 22.05.2026 live, sehr wenige Tournaments — Scraper-Output ist tatsächlich leer
- **Cluster:** B (City League UX)
- **Quelle:** Phase 4 P-1-A

#### F-008: Default-Format `localStorage['cityLeagueFormat'] || 'M4'` ist hartcodiert
- **Beweis:** `js/app-city-league.js:103`
- **Auswirkung:** Default-Frontend-Format steht auf einem **abgelaufenen** Format (M4). User muss aktiv switchen, sonst sieht er nichts oder falsche Daten
- **Vermutete Ursache:** Hartcodiert beim letzten Format-Wechsel; vergessen zu aktualisieren
- **Cluster:** B (City League UX)
- **Quelle:** Phase 4 P-1-B

#### F-009: Pre-Cache lädt leere CSVs beim Boot
- **Beweis:** `js/pokemon-loading-screen.js:18` lädt `city_league_archetypes.csv` (73 B) + `..._comparison.csv` (183 B) — beide leer
- **Auswirkung:** Boot-Splash zeigt 9/9 Files erfolgreich geladen, obwohl 2 davon nutzlos sind. Cache-Drift möglich (SW network-first mitigert das)
- **Vermutete Ursache:** Liste ist statisch, hat nicht mitbekommen dass die CSVs nicht mehr regelmäßig gefüllt sind
- **Cluster:** B (City League UX) + D (Architektur)
- **Quelle:** Phase 3 PreF 3-C + Phase 5 5-G

### Cluster C — Legacy-Code & Tote Pfade

#### F-010: Playtester-Tab + Side-Menu haben kaputte onclick-Handler
- **Beweis:** `index.html:1885-1902` referenziert `startStandalonePlaytester()` + `openMultiplayerFromSandbox()`. `playtester*.js` + `firebase-multiplayer.js` sind **nicht** in den Script-Tags geladen
- **Auswirkung:** User-Klick wirft `ReferenceError`. Tab ist via `css/playtester-hidden.css` versteckt — aber das Top-Nav-Item ist noch klickbar
- **Vermutete Ursache:** Migration zu TCG Showdown angefangen, Tab-Entfernung halb durchgezogen
- **Cluster:** C (Legacy)
- **Quelle:** Phase 1 L1
- **User-Aussage:** "alles zu Playtester kannst du einfrieren" (Q6 Phase 2)

#### F-011: Firestore Collection `games` (Legacy aus Multiplayer)
- **Beweis:** `js/firebase-multiplayer.js` schreibt nach `games`. Diese Datei wird nicht mehr geladen
- **Auswirkung:** Tote Collection in Firestore — kostet Storage, könnte zu vergessenem User-Stale-State führen
- **Cluster:** C (Legacy)
- **Quelle:** Phase 2 PreF 2-F

#### F-012: 7 Scraper im Repo, nicht im CI
- **Beweis:** Liste der nicht-CI-Scraper aus `weekly-full-update.yml` vs `backend/scrapers/`-Verzeichnis:
  - `all_cards_scraper.py` ← **das ist F-001!**
  - `card_actions_builder.py`
  - `card_price_scraper.py` (Legacy, ersetzt von `cardmarket_price_merger`)
  - `japanese_cards_scraper.py`
  - `run_pipeline.py` (Legacy-Orchestrator)
  - `archetype_mapping_audit.py` (Audit-Tool)
  - `backfill_labs_tournament_id.py` (Wartung)
  - `clean_past_meta_archetypes.py` (Wartung)
- **Auswirkung:** Bei `all_cards_scraper` ist das ein 🔴 (F-001). Bei den anderen ist es nur Code-Hygiene — Wartungs-Skripte gehören naturgemäß nicht ins CI
- **Cluster:** C (Legacy) + A (Lücke)
- **Quelle:** Phase 2 PreF 2-A

#### F-013: `current_meta_scraped_tournaments.json` permanent leer
- **Beweis:** `data/current_meta_scraped_tournaments.json` = `{"scraped_tournament_ids": []}` (31 Bytes)
- **Auswirkung:** Incremental-Cache für In-Person-Standard-Tournaments. Aktuell leer weil CRI noch nicht in-person legal ist (legal ab 2026-06-05) → erwartet
- **Vermutete Ursache:** Sub-Source `tournaments` im Scraper findet keine In-Person-Standard-Tournaments für CRI; wird sich nach 05.06.2026 von alleine füllen
- **Cluster:** Erwartetes Verhalten — möglicher 🟢 statt 🟡
- **Quelle:** Phase 2 PreF 2-H + Phase 4 P-6-A
- **User-Aussage:** "müsste ja, prüft das bitte" (Q4 Phase 2) — Antwort: temporär leer, normalisiert sich am 05.06.

#### F-014: `format_filter: "PFL"` hartcodiert in current_meta_analysis settings
- **Beweis:** `backend/scrapers/current_meta_analysis_scraper.py:165` → `"format_filter": "PFL"`
- **Auswirkung:** PFL (Phantasmal Flames) ist ein veraltetes Format (vor POR). Scraper filtert auf alten Standard, könnte aktuelle Decks verpassen
- **Vermutete Ursache:** Settings nicht mit `format_window` synchronisiert
- **Cluster:** A (Format-Drift)
- **Quelle:** Phase 4 P-6-B

### Cluster D — Code-Architektur

#### F-015: `parseCSV` doppelt definiert mit unterschiedlichen Implementierungen
- **Beweis:**
  - `app-core.js:1644`: PapaParse-basiert, auto-detect Delimiter
  - `app-meta-call.js:373`: naive split, kein Quoted-Field-Support
- **Auswirkung:** Aktuell disjunkte Reader, kein Konflikt. **Drift-Risiko** wenn zukünftig dieselbe CSV in beiden Files gelesen wird
- **Vermutete Ursache:** `app-meta-call.js` ist organisch gewachsen, hat seine eigene Helper-Sammlung statt Reuse aus `app-core` / `app-utils`
- **Cluster:** D (Architektur)
- **Quelle:** Phase 5 5-A + Korrektur PreF 3-E

#### F-016: `limitless_online_decks.csv` führt Share-Wert in zwei Spalten parallel
- **Beweis:** `share` Spalte: `8.12%` (US-Format + Suffix), `share_numeric` Spalte: `8,12` (EU-Komma)
- **Auswirkung:** Konsumenten müssen wissen, welche Spalte sie nutzen. Wenn jemand `parseFloat(row.share)` macht → bekommt `8`, nicht `8.12`
- **Vermutete Ursache:** Scraper schreibt zwei Formate für Display vs Programmatik, ohne klar zu kommunizieren welche kanonisch ist
- **Cluster:** D (Architektur) + E (Format-Inkonsistenz)
- **Quelle:** Phase 5 5-B

#### F-017: Service-Worker SHELL_ASSETS manuell pflegen
- **Beweis:** `service-worker.js:11-50+` enthält statische Liste der zu cachenden Files
- **Auswirkung:** Wenn neuer JS-File hinzugefügt wird, muss SHELL_ASSETS manuell aktualisiert werden; sonst offline-nicht-verfügbar
- **Vermutete Ursache:** Strategische Entscheidung (selektives Cache), nicht broken aber Wartungslast
- **Cluster:** D (Architektur)
- **Quelle:** Phase 3 PreF 3-A

### Cluster E — Format-Inkonsistenz

#### F-018: Cardmarket-Files doppelt (mit und ohne `_6`-Suffix)
- **Beweis:** `products_singles.json` (Legacy, 67.647 products, dated 2026-04-29) + `products_singles_6.json` (current, 69.769 products, dated 2026-05-25)
- **Auswirkung:** Unklar welche Datei der Loader nutzt. Legacy-Datei nimmt Repo-Platz weg (~12 MB)
- **Vermutete Ursache:** Cardmarket nummeriert Game-IDs (6 = Pokémon). Alte Files vor der `_6`-Konvention sind nie aufgeräumt worden
- **Cluster:** E (Format-Inkonsistenz)
- **Quelle:** Phase 2 PreF 2-C

#### F-019: Number-Format nicht standardisiert (EU vs US)
- **Beweis:** Beispiele:
  - `8,12` (EU, `limitless_online_decks_comparison.csv`)
  - `8.12` (US, `labs_tournament_decks.csv`)
  - `0,19€` (EU + Suffix, `price_data.csv`)
- **Auswirkung:** Reader müssen pro File wissen welches Format. Kein aktueller Bug, aber Falle für zukünftige Reader
- **Vermutete Ursache:** Verschiedene Scraper schreiben in unterschiedlichen Konventionen
- **Cluster:** E (Format-Inkonsistenz)
- **Quelle:** Phase 5 5-E

#### F-020: Externer Image-Proxy `images.weserv.nl` ohne Datenschutz-Klärung
- **Beweis:** mehrere JS-Files nutzen `https://images.weserv.nl/?url=...` als Image-Resizer
- **Auswirkung:** Image-URLs (Karten-Bilder) werden über einen Dritt-Service geroutet. EU-Datenschutz-relevant wenn personalisiert
- **Vermutete Ursache:** Quick-win für Image-Resizing ohne eigenen Image-Service
- **Cluster:** F (Externe Abhängigkeiten)
- **Quelle:** Phase 2 PreF 2-E

#### F-021: ~15 % der Preise in `price_data.csv` veraltet
- **Beweis:** 17.104 Rows mit `last_updated=2026-05-26` (frisch), 3.008 Rows mit `2026-04-01`, 14 Rows noch älter
- **Auswirkung:** Diese 15 % zeigen veraltete Preise. Vermutlich Karten ohne Cardmarket-ID-Mapping → Limitless-Fallback wurde beibehalten
- **Vermutete Ursache:** Karten die nie in einem Cardmarket-Mapping gelandet sind (Foreign Cards, sehr alte/seltene Promos)
- **Cluster:** E (Format-Inkonsistenz)
- **Quelle:** Phase 4 P-5-A

#### F-022: `price_proxy_server.py` Legacy
- **Beweis:** `backend/services/price_proxy_server.py` existiert noch
- **Auswirkung:** Code-Last, keine Funktionalität
- **User-Aussage:** "das nutzen wir nicht mehr" (Q7 Phase 2)
- **Cluster:** C (Legacy)

### Cluster F — Daten-Wartungslücken (Mini-Findings)

#### F-023: `pokemon_sets_mapping.csv` liegt im Repo-Root statt in `data/`
- **Beweis:** File-Path Inkonsistenz, alle anderen Daten-Files in `data/`
- **Auswirkung:** Verwirrung für Maintainer
- **Cluster:** D (Architektur)
- **Quelle:** Phase 4 P-2-A

---

## 🟢 LOW (11 Findings)

### F-024: `audit_single_tab.js` ist 0 Bytes leer
- **Beweis:** `ls -la audit_single_tab.js` → 0 bytes
- **Auswirkung:** Toter File, keine Funktion
- **User-Aussage:** unknown — vermutlich legacy/Experiment
- **Quelle:** Phase 1 L2

### F-025: Hardcoded Image-CDN-URLs
- **Beweis:** `https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/...` direkt in JS
- **Auswirkung:** Falls Limitless den Bucket umzieht, brechen alle Bilder
- **Quelle:** Phase 2 PreF 2-D

### F-026: `generated_tooltips.json` ist `{}` (2 Bytes)
- **Beweis:** Cron `generate-tooltips.yml` läuft Sonntags 6 UTC, produziert leeres JSON
- **User-Aussage:** "ich glaube das haben wir nicht mehr" (Q5 Phase 2)
- **Cluster:** C (Legacy)

### F-027: `limitless_meta_stats.json` ist 64 Bytes
- **Beweis:** Inhalt: `{"tournaments":199,"players":14026,"matches":31411}` — keine weiteren Felder
- **User-Aussage:** "nur wenn es Sinn macht" (Q3 Phase 2) → akzeptabel klein
- **Cluster:** ✓ akzeptiert

### F-028: Hardcoded Cap-Limits in `limitless_online_scraper.py`
- **Beweis:** `[:10]`, `[:3]`, `[:5]` in mehreren Zeilen
- **Auswirkung:** Bei größerem Meta theoretisch unvollständige Daten; bei aktuell 89 Decks irrelevant
- **Cluster:** D (Architektur)
- **Quelle:** Phase 4 P-3-A

### F-029: CSV-Delimiter inkonsistent (aber pro File konsistent)
- **Beweis:** `;` für meiste Files, `,` für labs + price/mapping
- **Auswirkung:** Kein aktueller Bug, Falle für neuen Reader
- **Quelle:** Phase 4 P-4-A + Phase 5 5-F

### F-030: `tournaments.start_date: ""` leer im current_meta_analysis settings
- **Beweis:** `backend/scrapers/current_meta_analysis_scraper.py` settings
- **Auswirkung:** Kein Date-Filter aktiv für In-Person-Standard. Vermutlich Absicht, da sub-source auch ohne start_date funktioniert
- **Quelle:** Phase 4 P-6-C

### F-031: `i18n.js` matcht auf String `'games'` (false positive für Firestore-Coll)
- **Beweis:** grep für Firestore-Collections matched `'games'` in i18n.js — vermutlich nur ein i18n-Translation-Key
- **Auswirkung:** Keine — Auditing-Artefakt
- **Quelle:** Phase 3 PreF 3-D

### F-032: Profile-Tab "Settings" hat unklaren Init-Pfad
- **Beweis:** Kein dezidiertes `init()` im `switchProfileTab`-Handler
- **Auswirkung:** Inhalt vermutlich rein inline HTML — funktioniert wahrscheinlich, aber nicht im Code-Review nachvollziehbar
- **Quelle:** Phase 3 PreF 3-F

### F-033: Profile-Tab "Deck Compare" — Inline-Funktion `profileCompareDecklists()` nicht eindeutig lokalisiert
- **Beweis:** Onclick referenziert globale Funktion, im Grep nicht in dezidierter Datei gefunden
- **Auswirkung:** Vermutlich in `firebase-collection.js` / `app-features.js` versteckt; funktioniert, aber Code-Org schwach
- **Quelle:** Phase 3

### F-034: `normalize()` doppelt definiert (bewusste Mirror)
- **Beweis:** byte-identisch, beide Files haben Comment `"Mirror of ..."`
- **Auswirkung:** Aktuell konsistent. Drift-Risiko in der Zukunft
- **Quelle:** Phase 5 5-1

---

## Empfohlene Reihenfolge zum Beheben

Sortiert nach **Effekt pro Aufwand** — wo Du am meisten User-Impact für die wenigste Arbeit kriegst.

### Stufe 1 — Sofort (Hoher Impact, niedriger Aufwand)

1. **F-001 → `all_cards_scraper.py` ins CI aufnehmen** *(Aufwand: ~30 min, betrifft 5 🔴-Findings)*
   - Einen Step in `weekly-full-update.yml` ergänzen
   - Test: nächster Lauf füllt CRI-Daten in alle DBs
   - **Behebt automatisch F-001, F-003, F-005**
   
2. **F-002 → `pokemon_sets_mapping.csv` für CRI ergänzen** *(Aufwand: 1 Zeile, Card DB zeigt sofort CRI)*
   - Zeile `CRI,Chaos Rising` an die Spitze setzen
   - Trigger des Scrapers könnte das auch automatisch machen (würde F-001 erledigen)

3. **F-004 → `update_sets.py` Bug fixen oder manuell CRI in sets.json/sets_metadata.json eintragen** *(Aufwand: 30 min — wenn manuell; mehrere h wenn Code-Pfad-Bug)*
   - Quick-fix: manuell CRI-Entry hinzufügen
   - Sustainable: prüfen warum `update_sets.py` nur `format_window.json` updated

### Stufe 2 — Quick Cleanups (niedriger Aufwand, mittlerer Impact)

4. **F-010 / F-011 / F-022 → Playtester+Multiplayer+Proxy-Server Legacy entfernen** *(Aufwand: ~1h)*
   - Top-Nav-Tab "Playtester" entfernen
   - Side-Menu-Item entfernen
   - `playtester*.js` + `firebase-multiplayer.js` + `price_proxy_server.py` löschen
   - Firestore-Rule für `games`-Collection entfernen
   - Tote `audit_single_tab.js` und `generated_tooltips.json` mit
   - **Behebt F-010, F-011, F-022, F-024, F-026 in einem Rutsch**

5. **F-008 → `localStorage['cityLeagueFormat']` Default dynamisch** *(Aufwand: ~30 min)*
   - Statt `|| 'M4'` → `|| _formatWindow?.current_set_jp || 'M5'`

6. **F-014 → `format_filter: "PFL"` dynamisch aus `format_window` ziehen** *(Aufwand: ~1h)*
   - Settings nicht hartcoden, aus `format_window.set_release` ableiten
   - Update_sets.py erweitern um diese Setting mit zu schreiben

### Stufe 3 — Architektur-Verbesserungen (höherer Aufwand)

7. **F-006 → HTML-als-Daten-Source ersetzen** *(Aufwand: 1-2 Tage)*
   - Scraper schreibt `matchup_data.json` separat
   - `loadCurrentMeta()` liest JSON statt HTML
   - HTML bleibt als reiner User-Report

8. **F-015 → `parseCSV` konsolidieren** *(Aufwand: ~2h)*
   - PapaParse-Version in `app-utils.js` als Canonical
   - Beide Files importieren von dort
   - Test: alle Reader funktionieren weiter

9. **F-017 → SW SHELL_ASSETS automatisch generieren** *(Aufwand: ~3h)*
   - Build-Step der `service-worker.js` aus `index.html` generiert

### Stufe 4 — Backlog (niedriger Priorität)

- F-007 (City League leerer Default — UX-Hinweis ergänzen)
- F-016 (doppelte Share-Spalte) — Scraper anpassen
- F-018 (Cardmarket-Legacy-Files löschen)
- F-019 (Number-Format standardisieren)
- F-020 (Image-Proxy datenschutz-prüfen)
- F-021 (15 % alte Preise — wirklich Foreign Cards?)
- F-009 (Pre-Cache leerer CSVs)
- F-023 (`pokemon_sets_mapping.csv` nach `data/` umziehen)
- F-025 (Image-CDN-URLs konfigurierbar)
- F-028 (Cap-Limits dokumentieren oder konfigurierbar)
- F-029 (Delimiter-Convention dokumentieren)
- F-032 / F-033 (Code-Org Profile-Tabs)

---

## Was ich NICHT prüfen konnte

❌ **Live-Production-Verifikation:** Audit war rein statisch. Ich habe nicht in einem Browser geklickt um zu verifizieren dass das Card-DB-Tab tatsächlich keine CRI-Karten zeigt. Stark unterstützt durch File-Inhalts-Analyse, aber nicht hart-empirisch verifiziert.

❌ **Firestore-Schemas:** Welche Felder hat ein `users`-Dokument wirklich? Nutzt die App den von ihr selbst geschriebenen Schema-Eingangs? Habe nur Collection-Namen erfasst, nicht Schema-Inhalt.

❌ **Visual-Regression-Test-Resultate:** Workflows `visual-fullpage.yml` und `visual-nonmeta.yml` existieren. Ich habe ihre letzten Run-Outputs nicht inspiziert (würde GitHub Actions API brauchen).

❌ **`firestore.rules`:** 6.4 KB File im Root nicht analysiert. Sicherheits-relevant — könnte ein eigener Audit-Lauf sein.

❌ **`battle-journal.js` Schema-Drift:** Schreibt nach `users` UND `battleJournal` — werden die in sync gehalten? Nicht im Detail geprüft.

❌ **Backend `prepare_card_data.py`:** Zentraler Helper (vor `archetype_icons_scraper`), nicht in den 6 Pipelines drin. Wenn der bricht, brechen viele Folge-Scraper.

❌ **`app-features.js` (75 KB):** Inhalt nicht systematisch durchgegangen. Trägt vermutlich shared_decks-Logik + Misc-Helpers.

❌ **`tests/python/`:** Test-Suite existiert (`test_price_proxy_and_price_scraper.py`), nicht ausgeführt. Wenn deren Tests grün sind, ist ein Teil der Findings false positives.

---

## Audit-Statistik

| Metric | Wert |
|---|---|
| Phasen | 6 |
| Untersuchte JS-Files | 40 |
| Untersuchte Python-Scripts | 24 |
| Untersuchte CSV-Files | 81 (sample) |
| Untersuchte JSON-Files | 17 (sample) |
| Untersuchte CI-Workflows | 5 |
| Findings dokumentiert | **34** |
| Davon 🔴 HIGH | 6 |
| Davon 🟡 MEDIUM | 17 |
| Davon 🟢 LOW | 11 |
| Code-Änderungen während Audit | **0** (Analyse-Modus) |
| Audit-Docs commited | 6 (Phase 1-6) |

---

## Findings-Cluster Übersicht

| Cluster | Findings | Total Risiko |
|---|---|---|
| **A** Karten-DB-Lücke (CRI) | F-001, F-002, F-003, F-004, F-005 | 5× 🔴 |
| **B** City-League-Default | F-007, F-008, F-009 | 3× 🟡 |
| **C** Legacy-Code | F-010, F-011, F-012, F-022, F-024, F-026 | 5× 🟡, 1× 🟢 |
| **D** Architektur | F-006, F-014, F-015, F-016, F-017, F-023, F-032, F-033, F-034 | 1× 🔴, 5× 🟡, 3× 🟢 |
| **E** Format-Inkonsistenz | F-013, F-018, F-019, F-021 | 3× 🟡, 1× akzept |
| **F** Externe Abhängigkeiten | F-020, F-025 | 1× 🟡, 1× 🟢 |
| (Sonstige LOW) | F-027 bis F-031 | 5× 🟢 |

---

## Nächster Schritt

**STOP nach Phase 6.** Audit abgeschlossen.

Wenn du einen Finding tiefer untersuchen oder fixen lassen willst:

- Sag mir einen Cluster (z.B. "Cluster A komplett") oder einzelne IDs (z.B. "F-001 + F-002")
- Ich gehe in **Phase 7** (Detail-Audit pro Finding) — Root-Cause, Fix-Optionen, Test-Strategie, Side-Effects
- Erst nach explizitem **"GO FIX"** wechsle ich in **Phase 8** und schreibe Code

Bis dahin ist **kein einziger Funktional-Code-Pfad** verändert worden — nur Audit-Dokumentation in `docs/audit/infrastructure/` (6 Dateien).
