# Phase 1 — Feature Inventory

**Datum:** 2026-05-26
**Branch:** `main` @ `c3bbd38`
**Methode:** Statische Analyse von `index.html`, `js/*.js`, `backend/**`

Quellen-Belege sind als `file:line` angegeben. Was nicht belegt ist, ist als ❓ markiert oder fehlt.

---

## 1.1 Entry Points

| Entry | Pfad | Hinweis |
|---|---|---|
| Haupt-App | `index.html` (428 KB, 1 Datei) | Alle Tabs gerendert, sichtbare nur über `.active`-Klasse |
| Scraper-Output (HTML-Reports) | `data/limitless_online_decks.html`, `data/limitless_online_decks_comparison.html`, `data/city_league_archetypes_comparison.html` | Diagnostische Snapshots, nicht ans UI angebunden |
| Frontend-Komponenten | `frontend/components/*.html` | header/sidebar/TabContent_* — **❓ in Phase 2 prüfen ob aktiv eingebunden** (in `index.html` werden die Tabs inline definiert, nicht aus Components geladen) |

---

## 1.2 Top-Level Navigation

Belegt aus `index.html:541-549`:

| Tab-Button | Tab-ID | Tab-Container | Quelle |
|---|---|---|---|
| "Meta & Deck Analysis" | `meta-analysis-hub` | `index.html:553` | Hub-Tile-Grid mit 6 Sub-Tabs |
| "Cards" | `cards` | `index.html:1721` | Card Database |
| "Proxy Printer" | `proxy` | `index.html:1805` | Proxy-Generierung |
| "Playtester" | `sandbox` | `index.html:1865` | **❌ versteckt via `css/playtester-hidden.css`** (User-Aussage: nicht mehr aktiv) |
| "Profile" | `profile` | `index.html:3039` | Account-Hub mit 11 Sub-Tabs |
| "How to Use" | `tutorial` | `index.html:1913` | Tutorial |
| (versteckt) | `calculator` | `index.html:2988` | Damage Calculator (über Side-Menu, nicht über Top-Nav) |

Side-Menu zusätzlich: `index.html:439-478` enthält `city-league`, `city-league-analysis`, `current-meta`, `current-analysis`, `past-meta`, `cards`, `proxy`, `sandbox`, `profile`, `calculator`, `tutorial`. Die Side-Menu-Items sind ein direkter Weg zu denselben Tabs (kein doppeltes Routing).

---

## 1.3 Meta-Analysis-Hub Tiles

Belegt aus `js/meta-analysis-hub.js:12-21`:

```javascript
const SUB_TABS = [
    { id: 'city-league',          tileKey: 'cityLeague' },
    { id: 'city-league-analysis', tileKey: 'cityLeagueAnalysis' },
    { id: 'current-meta',         tileKey: 'currentMeta' },
    { id: 'current-analysis',     tileKey: 'currentMetaAnalysis' },
    { id: 'past-meta',            tileKey: 'pastMeta' },
    { id: 'meta-call',            tileKey: 'metaCall', topTab: 'profile', profileSubTab: 'metacall' }
];
```

Hub hat 6 Tiles. **Meta Call** ist in der Hub-Liste, hat aber eine Sonderbehandlung — Hub-Tile-Klick navigiert in den Profile-Tab und schaltet `profile-metacall` sichtbar.

---

## 1.4 Profile Sub-Tabs

Belegt aus `index.html:3114-3162` + `js/firebase-collection.js:3176` (Handler-Definition):

| Profile Sub-Tab | Container ID | Haupt-Datei | Auto-Init |
|---|---|---|---|
| Collection | `profile-collection` | `js/firebase-collection.js` | beim Tab-Switch |
| My Decks | `profile-decks` | `js/firebase-collection.js` | ❓ |
| Wishlist | `profile-wishlist` | `js/firebase-collection.js` (vermutlich) | ❓ |
| Tradelist | `profile-tradelist` | `js/firebase-collection.js` (vermutlich) | ❓ |
| Meta Binder | `profile-metabinder` | `js/meta-binder.js` (Größe 111 KB) | ❓ |
| Custom Binder | `profile-custombinder` | `js/custom-binder.js` (Größe 54 KB) | ❓ |
| Journal | `profile-journal` | `js/battle-journal.js` (Größe 120 KB) | `openJournalHistoryTab()` |
| Deck Compare | `profile-deckcompare` | ❓ keine eigene JS-Datei gefunden | ❓ |
| Meta Call | `profile-metacall` | `js/app-meta-call.js` (349 KB) | `MetaCall.init()` |
| Testing Groups | `profile-testinggroups` | `js/app-testing-groups.js` (70 KB) | `TestingGroups.init()` |
| Settings | `profile-settings` | ❓ inline in `firebase-collection.js`? | ❓ |

**❓ Klärungsbedarf:**
- Welches JS-Modul rendert tatsächlich Wishlist / Tradelist / Deck Compare / Settings? Mein erster Grep findet nur das Container-Element in `firebase-collection.js`, kein dezidiertes Render-Modul.
- → **Wird in Phase 3 mit Render-Aufrufverfolgung geklärt.**

---

## 1.5 Feature-Liste (konsolidiert)

| # | Feature | UI-Eintritt | Haupt-Datei(en) | Größe (KB) | Beschreibung | Status |
|---|---|---|---|---|---|---|
| F-01 | **Meta-Analysis-Hub** | Top-Nav „Meta & Deck Analysis" | `js/meta-analysis-hub.js` | 10 | Tile-Grid + Side-Menu-Sync für 6 Sub-Features | aktiv |
| F-02 | **City League Meta** | Hub-Tile / Side-Menu | `js/app-city-league.js` | 212 | Japan-Side Regionals Aggregation | aktiv |
| F-03 | **City League Analysis** | Hub-Tile / Side-Menu | ❓ (`app-city-league.js`?) | — | Per-Deck-Analyse von CL | ❓ in Phase 3 klären |
| F-04 | **Current Meta (Global)** | Hub-Tile / Side-Menu | `js/app-current-meta.js` | 29 | Live-Online-Decks-Tabelle | aktiv |
| F-05 | **Current Meta Analysis** | Hub-Tile / Side-Menu | `js/app-current-meta-analysis.js` | 207 | Per-Deck Analyse mit Cards-Aufschlüsselung | aktiv |
| F-06 | **Past Meta** | Hub-Tile / Side-Menu | `js/app-past-meta.js` | 87 | Historische Major-Turniere | aktiv |
| F-07 | **Meta Call** | Hub-Tile → Profile-Sub | `js/app-meta-call.js` | 349 | Tournament-Vorbereitung + Day-2-Predictor | aktiv |
| F-08 | **Tier Meta** | ❓ kein direkter Tab gefunden | `js/app-tier-meta.js` | 68 | Tier-List-Rendering | ❓ — wo wird es gerendert? |
| F-09 | **Card Database** | Top-Nav „Cards" / Header-Icon | `js/app-cards-db.js` | 223 | Karten-Suche + Filter | aktiv |
| F-10 | **Proxy Printer** | Top-Nav „Proxy Printer" | ❓ keine `app-proxy.js`. Logik vermutlich in `app-cards-db.js` oder `app-features.js` | — | Proxy-PDF-Generierung | ❓ in Phase 3 klären |
| F-11 | **Damage Calculator** | Side-Menu „Calculator" | `js/app-calculator.js` | 4.7 | Schadens-Rechner | aktiv |
| F-12 | **How to Use Tutorial** | Top-Nav „How to Use" | inline HTML in `index.html` | — | Hilfeseite | aktiv (statisch) |
| F-13 | **Profile / Collection** | Top-Nav „Profile" | `js/firebase-collection.js` | 245 | User-Collection in Firestore | aktiv |
| F-14 | **My Decks** | Profile-Sub | `js/firebase-collection.js` + `js/app-deck-builder.js` (500 KB!) | — | Eigene Decks verwalten | aktiv |
| F-15 | **Wishlist** | Profile-Sub | `js/firebase-collection.js` (vermutlich) | — | Wishlist | ❓ Render-Modul |
| F-16 | **Tradelist** | Profile-Sub | `js/firebase-collection.js` (vermutlich) | — | Tausch-Liste | ❓ Render-Modul |
| F-17 | **Meta Binder** | Profile-Sub | `js/meta-binder.js` | 111 | Meta-Binder | aktiv |
| F-18 | **Custom Binder** | Profile-Sub | `js/custom-binder.js` | 54 | Eigene Binder | aktiv |
| F-19 | **Battle Journal** | Profile-Sub | `js/battle-journal.js` | 120 | Match-Log + Auswertung | aktiv |
| F-20 | **Deck Compare** | Profile-Sub | ❓ kein eigenes JS gefunden | — | Vergleich zweier Decks | ❓ in Phase 3 klären |
| F-21 | **Testing Groups** | Profile-Sub | `js/app-testing-groups.js` | 70 | Test-Gruppen (Meta-Share-Override) | aktiv |
| F-22 | **Settings** | Profile-Sub | ❓ vermutlich inline | — | User-Settings | ❓ Render-Modul |
| F-23 | **Playtester / Sandbox** | Top-Nav „Playtester" | `js/playtester.js`, `playtester-mobile.js`, `playtester-patch.js` | 290+33+14 = 337 | In-App-Playtester | **🚫 legacy** — siehe 1.6 |
| F-24 | **Multiplayer** | Sandbox-Button „MULTIPLAYER" | `js/firebase-multiplayer.js` | 54 | Live-Match via Firestore | **🚫 legacy** — siehe 1.6 |
| F-25 | **TCG Showdown Link** | Side-Menu / Header | `js/tcg-showdown-link.js` | 8.5 | Externer Playtester-Link | aktiv (ersetzt F-23/24) |

**Anti-Tech / Tech-Lab** sind keine eigenständigen Tabs, sondern Sub-Module die innerhalb anderer Features rendern:

| Sub-Modul | Haupt-Datei | Wo eingebettet | Status |
|---|---|---|---|
| Anti-Tech | `js/app-anti-tech.js` | innerhalb Deck Builder / Tech-Lab | aktiv |
| Tech-Lab | `js/app-tech-lab.js` | innerhalb Deck Builder | aktiv |
| Card Capability Engine | `js/card-capability-engine.js` | Helper für Anti-Tech | aktiv |
| Deck Builder | `js/app-deck-builder.js` (500 KB) | rendert innerhalb von "My Decks" + Current Meta Analysis | aktiv |
| Meta-Cards Filter | `js/app-meta-cards.js` | innerhalb Current Meta Analysis | aktiv |
| Draw Simulator | `js/draw-simulator.js` + `js/combo-worker.js` | innerhalb Deck Builder | aktiv |

---

## 1.6 Legacy-Klassifikation (User-Bestätigt)

User-Aussage: „alles zum Thema Playtester (zumindest mein eigener) und damit verbunden Multiplayer brauchen wir aktuell nicht".

Belege:
- `index.html:106` lädt `css/playtester-hidden.css` (versteckt das Sandbox-Tab via CSS)
- `index.html:466` Side-Menu-Item für "Playtester" hat einen erklärenden Kommentar im Code, dass das Tab versteckt ist
- `index.html:543-545` Top-Nav-Button für Playtester existiert noch
- **`index.html:1885-1902`** der Playtester-Container hat `onclick="startStandalonePlaytester()"` + `onclick="openMultiplayerFromSandbox()"`
- **In `index.html` werden `playtester.js`, `playtester-mobile.js`, `playtester-patch.js`, `firebase-multiplayer.js` NICHT geladen** (`grep` von Zeile 4800+ → keine Einträge)
- → **Die onclick-Handler `startStandalonePlaytester()` und `openMultiplayerFromSandbox()` sind ungefiltert und würden zur Laufzeit ReferenceError werfen.**

**Klassifikation:**
- F-23 (Playtester) und F-24 (Multiplayer): **legacy — Code im Repo, nicht geladen, UI-Reste sichtbar**
- `js/playtester-mobile.js`, `js/playtester.js`, `js/playtester-patch.js`, `js/firebase-multiplayer.js` → legacy
- **🟡 Pre-Finding L1:** Tab "Playtester" steht noch in Top-Nav und Side-Menu mit kaputten onclick-Handlern. CSS versteckt nur den Inhalt, nicht das Tab. Findings-Kandidat für Phase 6.

---

## 1.7 Backend / Scraper Inventory (vorab)

Detail kommt in Phase 2, aber für vollständige Sicht hier die Liste was im Repo liegt:

**Scraper (`backend/scrapers/`):**

| # | Datei | Größe-Indikator | Zweck (aus Datei-Header zu prüfen in Phase 2) |
|---|---|---|---|
| S-01 | `all_cards_scraper.py` | — | All-Cards-DB-Sync |
| S-02 | `archetype_icons_scraper.py` | — | Icon-Mapping |
| S-03 | `archetype_mapping_audit.py` | — | Mapping-Audit-Tool |
| S-04 | `backfill_labs_tournament_id.py` | — | Wartungs-Skript |
| S-05 | `card_actions_builder.py` | — | Card-Effects-Builder |
| S-06 | `card_price_scraper.py` | — | Limitless-Preis-Scraper |
| S-07 | `cardmarket_id_mapper.py` | — | Cardmarket-ID-Mapping (gerade neu für Freund analysiert) |
| S-08 | `cardmarket_price_merger.py` | — | Cardmarket-Preise mergen |
| S-09 | `city_league_analysis_scraper.py` | — | CL pro Deck |
| S-10 | `city_league_archetype_scraper.py` | — | CL Archetypes |
| S-11 | `city_league_past_analysis_scraper.py` | — | CL Past Analysis |
| S-12 | `city_league_past_archetype_scraper.py` | — | CL Past Archetypes |
| S-13 | `clean_past_meta_archetypes.py` | — | Wartungs-Skript |
| S-14 | `current_meta_analysis_scraper.py` | — | Current Meta Analysis |
| S-15 | `generate_tooltips.py` | — | Tooltip-Generator |
| S-16 | `japanese_cards_scraper.py` | — | Japanese-Cards-DB |
| S-17 | `labs_tournament_scraper.py` | — | Labs (Major Tournaments) |
| S-18 | `limitless_online_scraper.py` | — | Online Ladder Snapshot |
| S-19 | `online_tournament_scraper.py` | — | Online Tournaments |
| S-20 | `pokemon_card_effects_scraper.py` | — | Card Effects DB |
| S-21 | `pokemon_card_text_scraper.py` | — | Card Text DB |
| S-22 | `run_pipeline.py` | — | Pipeline-Orchestrator |
| S-23 | `tournament_scraper_JH.py` | — | ❓ TournamentScraperJH (Sonder-Scraper) |

**24 Scraper insgesamt** — User schätzte „~10", tatsächlich sind es 24 (inkl. Wartungs-Skripte). Details + Output-Verifikation in Phase 2.

**Backend-Helper (`backend/core/`):**

- `archetype_matcher.py`
- `card_scraper_shared.py`
- `limitless_dated.py`
- `prepare_card_data.py`
- `threat_classifier.py`
- `update_sets.py`

**Services:** `backend/services/price_proxy_server.py` — ❓ Live-Server? Wird er deployed? In Phase 2 klären.

---

## 1.8 Was ich NICHT inventarisieren konnte

❌ **Init-Reihenfolge:** Welche Module rufen `init()` in welcher Reihenfolge auf? `app-init.js` (3.8 KB) ist klein, aber ich habe es noch nicht gelesen. In Phase 3 nachgeholt.

❌ **Sub-Tabs in „Deck Builder":** `app-deck-builder.js` ist 500 KB groß und vermutlich der größte Feature-Komplex. Er hat Sub-Module wie Anti-Tech, Tech-Lab, Doctrine-Audit, Fusion-Mode etc. — die liste ich erst in Phase 3 systematisch auf.

❌ **CSS-versteckte vs. flag-versteckte Features:** Außer Playtester habe ich noch nicht systematisch geprüft, ob andere Features per CSS oder Feature-Flag versteckt sind.

❌ **`audit_single_tab.js`** (0 bytes leer im Root) — alter Audit-Helper? Vermutlich totes Artifact, in Phase 2 nochmal anschauen.

---

## 1.9 Offene Fragen an den User

1. **F-03 City League Analysis** — gleiches JS-Modul wie F-02, oder eigenes? Falls dieselbe Datei, möchte ich das als zwei UI-Eintritte einer Datenquelle dokumentieren.

2. **F-08 Tier Meta** — `app-tier-meta.js` (68 KB) wird geladen, aber ich finde keinen direkten Tab. Wo ist es im UI sichtbar?
   - Vermutung: Sub-Modul von City League / Current Meta — kannst du das bestätigen?

3. **F-10 Proxy Printer** — Gibt es ein dezidiertes JS-Modul oder ist die Logik in `app-cards-db.js` / `app-features.js` versteckt? In Phase 3 finde ich es selbst, aber wenn du die Datei kennst, sparen wir Zeit.

4. **F-15/F-16/F-20/F-22** — Wishlist, Tradelist, Deck Compare, Settings haben kein dezidiertes JS-Modul. Sind das wirklich Sub-Funktionen von `firebase-collection.js` (245 KB!), oder fehlt mir was?

5. **`audit_single_tab.js`** (0 bytes leer) — kann ich das als totes Artifact markieren?

6. **Tab "Playtester" mit kaputten Handlers (🟡 L1)** — soll ich das schon jetzt fixen (CSS-versteckt reicht nicht, onclick=Funktion-nicht-vorhanden) oder erst nach Phase 6?

7. **`backend/services/price_proxy_server.py`** — läuft das irgendwo (z.B. Cloud Run) oder ist es nur lokal in der Dev-Env?

---

**STOP nach Phase 1.** Bitte sichte die Liste, beantworte die offenen Fragen, dann fahre ich mit Phase 2 (Datenquellen-Inventory) fort.
