# Testmatrix — Feature-Inventar thedipidis.app

**Stand der Erhebung:** 2026-09-06 · Phase 1 (Kartierung, kein Browser)
**Grundlage:** `index.html` (3.971 Zeilen), `js/app-*.js`, `js/i18n.js` (deutscher Block, Zeilen 2611–5182), Messungen an `data/` mit `python3`/`csv`.

## Wie diese Datei zu lesen ist

* **Nr** — feste Kennung. Wird nie neu vergeben, auch wenn eine Zeile wegfällt.
* **Ansicht/Route** — die Hash-Route. Die kanonischen Routen stehen in `js/inline-init.js:389–482` (`HASH_ALIASES`); geschrieben wird nur, was dort auf sich selbst zeigt (`js/inline-init.js:646–650`).
* **Element** — der sichtbare deutsche Text. Quelle: `js/i18n.js`, deutscher Block. Wo kein `data-i18n` und kein `t()` dahintersteht, ist das vermerkt — **das ist selbst ein Befund**.
* **Art** — Knopf / Reiter / Filter / Auswahlfeld / Sucheingabe / Tabellenspalte / Sortierung / Kachel / Berechnung / Klickpfad / Deep-Link.
* **Team** — QA (Bedienung, Zustände, Fehlerfälle) · Spieler (fachliche Plausibilität) · Daten (Zahl gegen Datei prüfen).
* **Status** — alle Zeilen stehen auf `offen`.

## Vorbemerkung: was „Startseite" heißt

`index.html:1103` trägt `<div id="current-meta" class="tab-content active">`. **Ohne Hash startet die Anwendung auf `#current-meta`**, nicht auf `#meta-analysis-hub`. Die Kachelseite (`#meta-analysis-hub`) heißt im Menü „Meta & Deck-Analyse" und ist über den Deep-Link `#hub` / `#uebersicht` / `#overview` zusätzlich erreichbar (`js/inline-init.js:478–481`). Alle „← Startseite"-Knöpfe rufen `switchTabAndUpdateMenu('current-meta')`.
Damit sind „Startseite" und `#current-meta` **dieselbe Ansicht**; die Zeilen F001–F022 gelten für beide Einstiege, F023–F026 prüfen ausdrücklich den Unterschied zwischen dem Aufruf ohne Hash und dem Aufruf mit `#current-meta`.

---

## 1. Startseite (ohne Hash) und `#current-meta`

Gerüst: `index.html:1103–1131`. Inhalt gezeichnet von `js/app-tier-meta.js` (Tierliste, Kacheln, Staples), `js/app-current-meta.js` (Heatmap), `js/app-archetype-card.js` (Archetyp-Karte), `js/ds-nav.js` (Format-Kürzel im Kopf).

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F001 | Startseite | „Aktuelles Meta" (`cm.limitlessHeading`) | Kachel | Seite ohne Hash öffnen. Erwartet: Überschrift „Aktuelles Meta", danach das Formatkürzel aus `window._formatWindow` (`#cmFormatLabel`, gefüllt von `js/ds-nav.js`). Erwartet heute: `PBL` (`data/format_window.json` → `current_set`). | QA | offen |
| F002 | Startseite | „Daten:" + Datumschip (`data.updated`) | Kachel | Chip mit `data-quelle="limitless_online_decks.csv"` lesen (`index.html:1107`). Gegen die Datei-mtime von `data/limitless_online_decks.csv` halten. Erwartet: gleiches Datum, kein „…" nach 5 s. | Daten | offen |
| F003 | Startseite | Hilfe-Knopf (`btn.helpTitle` = „Hilfe") | Knopf | `openTabHelp('current-meta')` klicken. Erwartet: Hilfe-Overlay öffnet, `Esc` schließt es, Fokus kehrt auf den Knopf zurück. | QA | offen |
| F004 | Startseite | „Beherrschen das Meta" (`tier.sub1`) | Kachel | Tier-1-Block zählen. Jede Zeile muss `new_count ≥` der Mindestschwelle tragen (`js/app-tier-meta.js:1475`) und `adjWR ≥ T1_MIN_WR` **oder** `labsWR ≥ T1_MIN_WR` (`js/app-tier-meta.js:1493`). Erwartet: kein Deck mit weniger Listen als der Schwelle in Tier 1. | Spieler | offen |
| F005 | Startseite | „Starke Herausforderer" (`tier.sub2`) | Kachel | Wie F004 für Tier 2. Zusätzlich: Score jeder Tier-2-Zeile muss ≤ dem kleinsten Tier-1-Score sein. | Spieler | offen |
| F006 | Startseite | „Spielbare Optionen" (`tier.sub3`) | Kachel | Wie F004 für Tier 3. | Spieler | offen |
| F007 | Startseite | „Aufkommende Archetypen" (`tier.subRogue`) / „Unter den Tier-Schwellen — die dünnsten Stichproben der Seite" (`tier.cmSubRogue`) | Kachel | Jede Rogue-Zeile muss < `ROGUE_MIN_LISTEN` (= `CONV_MIN_N`, Rückfall 20, `js/app-tier-meta.js:2395`) Listen haben. Zeilenzahl notieren. | Daten | offen |
| F008 | Startseite | Win-Rate-Wert auf der Deck-Kachel | Berechnung | Tooltip lesen: „geglättet (k = 50) — roh X % aus N Listen" (`js/app-tier-meta.js:2397–2399`). Angezeigt wird `adjWR`, nicht `winRate` (`js/app-tier-meta.js:2380`). Roh und geglättet gegen `data/limitless_online_decks_comparison.csv` (`new_winrate`, `new_count`) nachrechnen: `(w + 25) / (n + 50) · 100`. | Daten | offen |
| F009 | Startseite | Konventionszusatz an der Win Rate | Tabellenspalte | Tooltip muss zusätzlich `S / (S + N + U) · Unentschieden zählen mit` tragen (`js/app-tier-meta.js:2395–2396` → `WinRateKonvention.kurzHinweis('mitUnentschieden')`). Erwartet: sichtbar; fehlt er, ist die Zahl ohne Konvention. | Daten | offen |
| F010 | Startseite | Share-Wert auf der Deck-Kachel | Berechnung | Wert gegen `data/limitless_online_decks_comparison.csv` `new_share` prüfen. Kursive Werte kennzeichnen Decks ohne eigene Zeile (Tooltip `tier.share`). Erwartet: Summe aller Shares ≈ 96,4 % (gemessen), nicht 100 %. | Daten | offen |
| F011 | Startseite | „dünn" (`tier.clThinSample`) / Tooltip `tier.rogueThinTip` | Kachel | Bei jeder Zeile mit < n Listen muss das Kennzeichen stehen. Erwartet: Kennzeichen und kursive Darstellung fallen zusammen. | QA | offen |
| F012 | Startseite | Trend-Pfeil / „Trend über die letzten 7 Tage (vorheriger Stand: {vorher})" (`tier.rogueTrendTip`) | Kachel | Tooltip muss den Vorwert nennen. Gegen `old_share` in `limitless_online_decks_comparison.csv` halten. | Daten | offen |
| F013 | Startseite | „🔎 Archetyp suchen…" (`tier.searchPlaceholder`) | Sucheingabe | „drag" eintippen. Erwartet: nur Zeilen mit „Drag…" bleiben; Zeilenzahl vorher/nachher notieren, nachher < vorher. Feld leeren → alte Zeilenzahl exakt wieder da. | QA | offen |
| F014 | Startseite | „Filter zurücksetzen" (`tier.clearFilter`) | Knopf | Nach F013 klicken. Erwartet: Suchfeld leer, Zeilenzahl wieder auf dem Ausgangswert. | QA | offen |
| F015 | Startseite | „Meistgespielte Karten (Format-Staples)" (`tier.mostUsedCards`) | Kachel | Liste gegen `data/current_meta_card_data.csv` prüfen: Karte mit dem höchsten `deck_inclusion_count` über alle 62 Archetypen muss oben stehen. | Daten | offen |
| F016 | Startseite | „Matchup-Heatmap" (`heatmap.title`) | Kachel | Heatmap muss erscheinen. Erwartet: Diagonale als „Mirror" (`heatmap.mirror`), keine Zelle ohne Tooltip. | Spieler | offen |
| F017 | Startseite | „Y-Achse (Dein Deck)" (`heatmap.yLabel`), Platzhalter „z.B. N's Zoroark" | Sucheingabe | „Dragapult" eintippen. Erwartet: Y-Achse auf die Treffer reduziert; bei keinem Treffer erscheint `heatmap.noDecksY` („Keine Decks auf der Y-Achse gefunden für"). | QA | offen |
| F018 | Startseite | „X-Achse (Gegner, optional)" (`heatmap.xLabel`), Platzhalter „z.B. Dragapult" | Sucheingabe | Wie F017 für die X-Achse, Leerfall `heatmap.noDecksX`. | QA | offen |
| F019 | Startseite | „Nur Top 10 zeigen" / „Alle Decks zeigen" (`heatmap.showTop10` / `heatmap.showAll`) | Knopf | Umschalten. Erwartet: Spalten-/Zeilenzahl springt von 10 auf die volle Deckzahl (gemessen: 100 Decks in `data/limitless_online_decks_matchups.csv`) und zurück. | QA | offen |
| F020 | Startseite | Heatmap-Zelle, Zeile „online" (`heatmap.onlineLabel`) | Berechnung | Zelle mit Tooltip öffnen. Erwartet laut `heatmap.majorTip`: „Siege ÷ entschiedene Partien" = `S/(S+N)`. Wert gegen `data/limitless_online_decks_matchups.csv` `record` nachrechnen — dort stimmt `win_rate` in **allen 1.702 Zeilen** exakt mit `S/(S+N)` überein (gemessen). | Daten | offen |
| F021 | Startseite | Heatmap-Zelle, Zeile „Major" (`heatmap.majorLabel`) | Berechnung | Erwartet für Paarungen ohne Präsenzdaten: `heatmap.majorFehlt` („keine Major-Matches für diese Paarung"). Gemessen: nur `meta = TEF-PBL` trägt in `data/labs_tournament_matchups.csv` überhaupt eine Bilanz (`vs_wins/losses/ties`); alle zwölf anderen Metas haben dort 0 Partien. Erwartet also: außerhalb TEF-PBL steht überall der Fehlt-Hinweis. | Daten | offen |
| F022 | Startseite | „kursiv" / „unter 10 Matches" (`heatmap.legendeKursiv`, `heatmap.legendeKursivKurz`) | Tabellenspalte | Jede Zelle mit `total_games < 10` muss kursiv sein. Gemessen: 563 von 1.702 Paarungen liegen darunter (33 %). Erwartet: ungefähr ein Drittel der belegten Zellen kursiv. | Daten | offen |
| F023 | Startseite | Adresszeile beim Erststart | Deep-Link | Seite ohne Hash laden. Erwartet: `stempleStartansicht()` (`js/inline-init.js:686–691`) schreibt `#current-meta` per `replaceState`. Nach dem Laden muss `#current-meta` in der Adresszeile stehen. | QA | offen |
| F024 | Startseite | Browser-Zurück nach Tabwechsel | Klickpfad | Startseite → `#cards` → Zurück. Erwartet: wieder Startseite; `popstate`-Zuhörer (`js/inline-init.js:698–701`) greift, keine leere Seite. | QA | offen |
| F025 | Startseite | Browser-Vorwärts | Klickpfad | Nach F024 einmal vorwärts. Erwartet: `#cards` wieder aktiv. | QA | offen |
| F026 | Startseite | Kein doppelter Verlaufseintrag | Klickpfad | Zweimal denselben Menüpunkt anklicken. Erwartet: nur ein zusätzlicher Verlaufseintrag (`schreibeHash` steigt bei gleichem Hash aus, `js/inline-init.js:660`). | QA | offen |

---

## 2. `#meta-analysis-hub` (Menü: „Meta & Deck-Analyse")

Gerüst `index.html:636–676`, Inhalt `js/meta-analysis-hub.js`.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F027 | `#meta-analysis-hub` | „Meta & Deck-Analyse" (`metaHub.title`) | Kachel | Route direkt aufrufen. Erwartet: Überschrift plus Untertitel „Japan, Global, Vergangen — je Meta und Deck. Dazu die Prognose." (`metaHub.subtitle`). | QA | offen |
| F028 | `#meta-analysis-hub` | Kachel „City League Meta" (`metaHub.tile.cityLeague.title`) | Kachel | Klicken. Erwartet: Wechsel nach `#city-league`, Adresszeile folgt. | QA | offen |
| F029 | `#meta-analysis-hub` | Kachel „Deck-Analyse (Japan)" (`metaHub.tile.cityLeagueAnalysis.title`) | Kachel | Klicken → `#city-league-analysis`. | QA | offen |
| F030 | `#meta-analysis-hub` | Kachel „Aktuelles Meta (Global)" (`metaHub.tile.currentMeta.title`) | Kachel | Klicken → `#current-meta`. | QA | offen |
| F031 | `#meta-analysis-hub` | Kachel „Deck-Analyse (Global)" (`metaHub.tile.currentMetaAnalysis.title`) | Kachel | Klicken → `#current-analysis`. | QA | offen |
| F032 | `#meta-analysis-hub` | Kachel „Vergangenes Meta" (`metaHub.tile.pastMeta.title`) | Kachel | Klicken → `#past-meta`. | QA | offen |
| F033 | `#meta-analysis-hub` | Kachel „Meta Call" (`metaHub.tile.metaCall.title`) | Kachel | Klicken → `#meta-call`. Erwartet: **keine** Anmeldewand (der Tab ist seit „Block 7" eigenständig, `js/inline-init.js:401–412`). | QA | offen |
| F034 | `#meta-analysis-hub` | Block „Was gerade läuft" (`#metaHubAnswer`, `js/meta-analysis-hub.js`) | Kachel | Erwartet: Block wird gezeichnet. Er stand bis 01.09.2026 auch auf der Startseite und wurde dort entfernt (`index.html:1108–1125`) — hier muss er noch da sein. | Spieler | offen |
| F035 | `#meta-analysis-hub` | Hilfe-Knopf | Knopf | `openTabHelp` — wie F003. | QA | offen |
| F036 | `#meta-analysis-hub` | Deep-Links `#hub`, `#uebersicht`, `#overview` | Deep-Link | Alle drei aufrufen. Erwartet: alle landen auf `#meta-analysis-hub`; die Adresszeile wird **nicht** umgeschrieben, weil nur kanonische Kennungen zurückgeschrieben werden (`js/inline-init.js:646–650`). | QA | offen |
| F037 | `#meta-analysis-hub` | Deep-Links `#playtester`, `#sandbox` | Deep-Link | Aufrufen. Erwartet: Landung auf `#meta-analysis-hub` **plus** Hinweis nach ~600 ms: „Der Playtester läuft jetzt extern über TCG Showdown — im Menü unter ‚Werkzeuge'." (`js/inline-init.js:513–520`). | QA | offen |

---

## 3. `#city-league`

Gerüst `index.html:677–703`, Inhalt `js/app-city-league.js`.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F038 | `#city-league` | „City League Entwicklung" (`cl.cityLeagueDev`) | Kachel | Route aufrufen. Erwartet: Überschrift steht. | QA | offen |
| F039 | `#city-league` | „📅 Saison-Pause:" (`cl.seasonClosedTitle`) + `cl.seasonClosed` + `cl.seasonClosedHint` | Kachel | Erwartet: der Saison-Pause-Kasten ist sichtbar. **Belegt:** `data/city_league_analysis.csv`, `data/city_league_archetypes.csv`, `…_deck_stats.csv` und `…_comparison.csv` enthalten heute **nur die Kopfzeile, null Datenzeilen** (gemessen). | Daten | offen |
| F040 | `#city-league` | Formatwahl `#cityLeagueFormatSelect`: „Aktuelles Meta" (`format.m4current`) | Auswahlfeld | Auf „Aktuelles Meta" stellen. Erwartet: leere Tabelle bzw. Leerzustand, **keine** Ladeanzeige, die nie endet — die Quelldateien haben 0 Zeilen. | Daten | offen |
| F041 | `#city-league` | Formatwahl: „Vergangenes Meta" (`format.m3archive`) | Auswahlfeld | Umstellen. Erwartet: Tabelle füllt sich aus `data/city_league_analysis_M3.csv` (gemessen: **133.437 Zeilen**) bzw. `…_comparison_M3.csv` (304 Zeilen). Zeilenzahl vorher/nachher notieren, nachher deutlich > 0. | Daten | offen |
| F042 | `#city-league` | „Daten:"-Chip | Kachel | Chip gegen die mtime der geladenen CSV halten. | Daten | offen |
| F043 | `#city-league` | „Laden…" (`misc.loading`) | Kachel | Route bei gedrosseltem Netz öffnen. Erwartet: Ladezustand verschwindet, wenn die Datei da ist; er darf nicht als Endzustand stehenbleiben. | QA | offen |
| F044 | `#city-league` | Hilfe-Knopf | Knopf | Wie F003 mit `openTabHelp('city-league')`. | QA | offen |
| F045 | `#city-league` | Tabellenspalte „Archetyp" (`cl.thArchetype`) | Tabellenspalte | Kopf gegen `js/app-city-league.js` prüfen; jede Zeile muss einen Wert tragen. | QA | offen |
| F046 | `#city-league` | Spalte „Anzahl" (`cl.thCount`) / „Alt"/„Neu" (`cl.thOldCount`, `cl.thNewCount`) | Tabellenspalte | Summe der `new_count` gegen `data/city_league_archetypes_comparison_M3.csv` prüfen. | Daten | offen |
| F047 | `#city-league` | Spalte „Veränderung" (`cl.thChange`) | Berechnung | Stichprobe: `count_change == new_count − old_count` je Zeile. | Daten | offen |
| F048 | `#city-league` | Spalte „Ø Platzierung" (`cl.thAvgPlacement` / `cl.thAvgPlacementShort`) | Tabellenspalte | Gegen `new_avg_placement` prüfen. | Daten | offen |
| F049 | `#city-league` | Spalte „Varianten" (`cl.thVariants`) / „Haupt-Pokémon" (`cl.thMainPokemon`) | Tabellenspalte | Werte müssen gefüllt sein; leere Zelle ist ein Befund. | QA | offen |
| F050 | `#city-league` | Deep-Link `#city-league?deck=<Name>` | Deep-Link | `#city-league?deck=Charizard%20ex` aufrufen. Erwartet: `window.pendingCityLeagueDeckSelection` wird vorbelegt (`js/inline-init.js:545–550`) — auf dieser Route ohne Dropdown darf das folgenlos bleiben, nicht abstürzen. | QA | offen |

---

## 4. `#city-league-analysis`

Gerüst `index.html:704–1102` — 94 `data-i18n`, 44 Knöpfe, 3 Auswahlfelder, 5 Eingabefelder.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F051 | `#city-league-analysis` | „City League Deck-Analyse" (`tab.cityLeagueAnalysis`) | Kachel | Route aufrufen, Überschrift prüfen. | QA | offen |
| F052 | `#city-league-analysis` | Formatwahl `#cityLeagueFormatSelectAnalysis` | Auswahlfeld | Zwischen „Aktuelles Meta" und „Vergangenes Meta" wechseln. Erwartet: Deck-Dropdown lädt neu; bei „Aktuelles Meta" bleibt es leer (0 Datenzeilen, siehe F039). | Daten | offen |
| F053 | `#city-league-analysis` | Deckwahl `#cityLeagueDeckSelect`, „-- Deck auswählen --" (`cl.selectDeckOption`) | Auswahlfeld | Ein Deck wählen. Erwartet: alle Bereiche darunter füllen sich; Zeilenzahl der Kartenübersicht > 0. | QA | offen |
| F054 | `#city-league-analysis` | „Bitte Deck auswählen" (`cl.pleaseSelectDeck`) | Kachel | Ohne Deckwahl. Erwartet: Hinweistext statt leerer Fläche. | QA | offen |
| F055 | `#city-league-analysis` | Kartenfilter `#cityLeagueFilterSelect`: „Alle Karten" (`filter.allCards`) | Filter | Zeilenzahl notieren. | QA | offen |
| F056 | `#city-league-analysis` | „Karten in >50% der Decks" (`filter.cards50`) | Filter | Umstellen. Erwartet: Zeilenzahl **kleiner** als bei „Alle Karten". Gegenprobe an `percentage_in_archetype` in `data/city_league_analysis_M3.csv`: nur Karten > 50. | Daten | offen |
| F057 | `#city-league-analysis` | „Karten in >70% der Decks" (`filter.cards70`) | Filter | Umstellen. Erwartet: Zeilenzahl ≤ der von F056. | Daten | offen |
| F058 | `#city-league-analysis` | „Karten in >90% der Decks (Kern)" (`filter.cards90core`) | Filter | Umstellen. Erwartet: Zeilenzahl ≤ der von F057, und jede verbliebene Karte hat `percentage_in_archetype > 90`. | Daten | offen |
| F059 | `#city-league-analysis` | „Von:" / „Bis:" (`filter.from`, `filter.to`) — `#cityLeagueDateFrom`, `#cityLeagueDateTo` | Filter | Von = ältestes Datum, Bis = ältestes Datum setzen. Erwartet: Zeilenzahl sinkt gegenüber unbeschränkt. Datumsformat-Hinweis `filter.dateFormatHint` muss sichtbar sein. | Daten | offen |
| F060 | `#city-league-analysis` | Suchfeld `#cityLeagueOverviewSearch` (`filter.searchCardPlaceholder`) | Sucheingabe | „Boss" eintippen. Erwartet: nur Treffer bleiben; Suche muss auch auf deutschen Namen und `Set+Nr.` greifen (Platzhaltertext verspricht beides). | QA | offen |
| F061 | `#city-league-analysis` | Typfilter „Alle"/„Pokémon"/„Supporter"/„Item"/„Tool"/„Stadion"/„Energie"/„Spez. Energie"/„Ace Spec" (`filter.type*`, `setOverviewCardTypeFilter`) | Filter | Jeden Typ einzeln. Erwartet: Summe der neun Einzelzeilenzahlen = Zeilenzahl bei „Alle". | Daten | offen |
| F062 | `#city-league-analysis` | Seltenheit: „Alle Drucke"/„Niedrige Seltenheit"/„Max. Seltenheit" (`filter.allPrints`, `filter.lowRarity`, `filter.maxRarity`, `setOverviewRarityMode`) | Filter | Umschalten. Erwartet: Kartenzahl bleibt gleich, nur die Drucke/Preise ändern sich. | Spieler | offen |
| F063 | `#city-league-analysis` | „Kartenübersicht" (`section.cardOverview`) | Kachel | Bereich vorhanden, Zeilen tragen Bild, Name, Set+Nr. | QA | offen |
| F064 | `#city-league-analysis` | Sortierung „Nach Share% sortieren" (`meta.sortByShare`, `sortMetaCards`) | Sortierung | Klicken. Erwartet: erste Zeile hat den höchsten `percentage_in_archetype`, monoton fallend. Zweiter Klick kehrt um. | Daten | offen |
| F065 | `#city-league-analysis` | Sortierung „Nach Ø Anzahl sortieren" (`meta.sortByAvgCount`) | Sortierung | Wie F064 gegen `average_count`. | Daten | offen |
| F066 | `#city-league-analysis` | Sortierung „Nach Typ sortieren" (`meta.sortByType`) | Sortierung | Erwartet: Gruppen in fester Reihenfolge, keine Vermischung. | QA | offen |
| F067 | `#city-league-analysis` | „Meta-Karten-Analyse (Top 10 Archetypen)" (`section.metaCards`) + `#cityLeagueMetaSearch` | Sucheingabe | Archetyp suchen. Erwartet: Trefferliste schrumpft; Bereich zeigt maximal 10 Archetypen. | QA | offen |
| F068 | `#city-league-analysis` | Meta-Filter „Alle"/„>50%"/„>70%"/„>90%" (`meta.filterAll/50/70/90`, `setMetaShareFilter`) | Filter | Wie F056–F058 im Meta-Karten-Block. | Daten | offen |
| F069 | `#city-league-analysis` | „Deckbau" (`section.deckBuilder`) / „Dein Deck" (`section.yourDeck`) | Kachel | Karte anklicken → landet im Deck. Erwartet: Zähler „Karten im Deck" steigt. | QA | offen |
| F070 | `#city-league-analysis` | „Generieren: Max Consistency" (`deck.generateLabel` + `cl.genConsistency`, `autoCompleteConsistency`) | Berechnung | Deck wählen, Knopf drücken. Erwartet: genau 60 Karten (`DECK_SIZE`, `js/deck-builder-consistency.js:186`), höchstens 1 ACE SPEC, kein Nicht-Basis-Karte über 4 Kopien. **Achtung:** die City-League-Quelle ist eine andere als die des Builders — siehe `audit/datenfluss.md`, Kennzahl 3. | Spieler | offen |
| F071 | `#city-league-analysis` | „So baut der Consistency-Algorithmus" (`deck.algoHintTitle` / `deck.algoHintBody`) | Kachel | Hinweistext lesen. Er behauptet „Top-4 voll gewichtet, Day-2 ≈ 30 %, Day-1 ≈ 10 %" und „Karten ab 80–90 % Inklusion werden Core-Slots". Gegen `PLACEMENT_WEIGHT_BANDS` (`js/deck-builder-consistency.js:62–68`) und `CORE_THRESHOLDS` (`:151`) halten. **Befund erwartet:** der Text erwähnt die seit 05.09.2026 zusätzlich wirkende feldrelative Skala `PLACEMENT_PERCENTILE_BANDS` (`:135–142`) nicht. | Daten | offen |
| F072 | `#city-league-analysis` | „Warum?" (`btn.buildInfo`, `showConsistencyBuildInfo`) | Knopf | Nach dem Generate klicken. Erwartet: Dialog mit Karten-Detail, Zahl der ausgewerteten Listen, Turnier-Herkunft (`_assessDataQuality`, `js/deck-builder-consistency.js:1260ff`). | Spieler | offen |
| F073 | `#city-league-analysis` | „Leeren" (`cl.clear`, `clearDeck`) | Knopf | Erwartet: Deck auf 0, Bestätigung oder direkte Leerung — Verhalten festhalten. | QA | offen |
| F074 | `#city-league-analysis` | „Testhand" (`cl.testDraw`, `openDrawSimulator`) | Knopf | Bei leerem Deck und bei 60 Karten. Erwartet: bei leerem Deck Hinweis `deck.emptyTestDraw`, sonst 7 Karten. | QA | offen |
| F075 | `#city-league-analysis` | „Deck kopieren" (`cl.btnCopy`, `copyDeck`) | Knopf | Klicken, Zwischenablage prüfen. Erwartet: PTCGL-Format, Summe = 60. | QA | offen |
| F076 | `#city-league-analysis` | „PTCGL Export" (`btn.exportPTCGL`, `exportToPTCGL`) | Knopf | Erwartet: Datei/Text im PTCGL-Format. | QA | offen |
| F077 | `#city-league-analysis` | „PTCGL Import" (`btn.importPTCGL`, `importFromPTCGL`) | Klickpfad | Eine gültige Liste einfügen. Erwartet: 60 Karten im Deck. Danach eine kaputte Liste (Tippfehler im Set-Kürzel): Erwartet eine benannte Fehlermeldung, kein stiller Verlust. | QA | offen |
| F078 | `#city-league-analysis` | „Teilen" (`cl.btnShare`, `shareDeck`) | Knopf | Erwartet: Link oder Bild; `js/ds-share.js` zeichnet. | QA | offen |
| F079 | `#city-league-analysis` | „Speichern" (`cl.btnSave`, `saveCurrentDeckToProfile`) | Klickpfad | Abgemeldet und angemeldet testen. Erwartet abgemeldet: Aufforderung zur Anmeldung, kein stiller Verlust. | QA | offen |
| F080 | `#city-league-analysis` | „Vergleichen" (`cl.btnCompare`, `openDeckCompare`) | Knopf | Erwartet: Vergleichsdialog öffnet. | QA | offen |
| F081 | `#city-league-analysis` | „Raster" (`cl.btnGrid`, `toggleDeckGridView` / `generateDeckGrid`) | Knopf | Umschalten Liste ↔ Raster. Erwartet: gleiche Kartenzahl in beiden Ansichten. | QA | offen |
| F082 | `#city-league-analysis` | „Proxy" (`cl.btnProxy`, `sendCurrentDeckToProxyPrinter`) | Klickpfad | Klicken → `#proxy`. Erwartet: 60 Karten in der Warteschlange. | QA | offen |
| F083 | `#city-league-analysis` | „📋 TCG Showdown ↗" (`showdown.buttonLabel`, `openInShowdownFromBuilder`) | Knopf | Erwartet: neuer Tab, Deck übergeben. | QA | offen |
| F084 | `#city-league-analysis` | „↑ Max Seltenheit" (`deck.upgradeRarity`, `toggleDeckRarity`) | Knopf | Erwartet: Bilder wechseln, Kartenzahl bleibt 60. | Spieler | offen |
| F085 | `#city-league-analysis` | „Deck-Statistiken" (`section.deckStats`) — „Karten im Deck (verschiedene / Ø-Liste)" (`stats.cardsInDeck`) | Berechnung | Zwei Zahlen prüfen: verschiedene Kartennamen im Deck und Ø-Listengröße. Erwartet: zweite Zahl ≈ 60. | Daten | offen |
| F086 | `#city-league-analysis` | „Ø Platzierung" (`stats.avgPlacement`) | Berechnung | Gegen `average_placement` in `data/city_league_archetypes_deck_stats.csv` — **die Datei hat 0 Datenzeilen**, also gegen `…_past_deck_stats.csv` prüfen. | Daten | offen |
| F087 | `#city-league-analysis` | „Verwendete Decks" (`stats.decksUsed`) | Berechnung | Gegen `total_decks_in_archetype` in der geladenen Analyse-CSV. | Daten | offen |
| F088 | `#city-league-analysis` | „Tech vs Normal" (`techVsNormal.title` / `.subtitle`) | Kachel | Einmal ohne Tech und einmal mit Tech generieren. Erwartet: Block vergleicht die beiden letzten Builds; ohne zweiten Build muss ein Leerzustand stehen. | Spieler | offen |
| F089 | `#city-league-analysis` | „Meta-Analyse laden" (`btn.loadMetaAnalysis`, `loadMetaCardAnalysis`) | Knopf | Erwartet: Meta-Karten-Block füllt sich, `meta.loadHint` verschwindet. | QA | offen |
| F090 | `#city-league-analysis` | Raster-Suche `#cityLeagueDeckGridSearch` | Sucheingabe | Kartennamen eintippen. Erwartet: Raster filtert, Zähler passt sich an. | QA | offen |
| F091 | `#city-league-analysis` | Leerzustände `emptyState.deckEmpty`, `emptyState.metaNotLoaded` | Kachel | Route frisch öffnen. Erwartet: beide Leerzustände sichtbar, nicht leere Kästen. | QA | offen |

---

## 5. `#current-analysis`

Gerüst `index.html:1132–1786` — 169 `data-i18n`, 65 Knöpfe, 3 Auswahlfelder, 9 Eingabefelder, 14 `<th>`.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F092 | `#current-analysis` | „Deck-Analyse: aktuelles Meta" (`cm.analysisHeading`) + `cm.analyzeAndBuild` | Kachel | Route aufrufen. Überschrift und Untertitel prüfen. | QA | offen |
| F093 | `#current-analysis` | „Wähle einen Archetyp, um die Analyse zu starten" (`cm.emptyTitle`, `cm.emptyHint`) | Kachel | Ohne Deckwahl. Erwartet: Leerzustand statt leerer Fläche. | QA | offen |
| F094 | `#current-analysis` | Deckwahl `#currentMetaDeckSelect` (`cl.selectArchetype`) | Auswahlfeld | Deck wählen. Erwartet: Kartenübersicht, Matchups und Statistik füllen sich in einem Durchgang. | QA | offen |
| F095 | `#current-analysis` | Zweitdeck `#currentMetaDeckSelectSecondary` — „+ Mit Archetyp fusionieren (Cooking)" (`cm.fuseWithLabel`, Leerwert `cm.fuseNone` = „-- Kein zweites Deck --") | Auswahlfeld | Zweites Deck wählen. Erwartet: Kartenübersicht vereinigt beide Archetypen; Zeilenzahl steigt. | Spieler | offen |
| F096 | `#current-analysis` | „Schnellüberblick" / „Cooking" (`cm.viewModeVanilla`, `cm.viewModeDeepDive`, `setCurrentMetaViewMode`) | Reiter | Umschalten. Erwartet: „Cooking" zeigt zusätzliche Blöcke (Fusion, Tech Lab); „Schnellüberblick" blendet sie aus. | QA | offen |
| F097 | `#current-analysis` | „Turnierformat-Filter:" (`cm.formatFilter`) mit „Alle"/„Limitless Decks"/„Major-Decks" (`cm.filterAll`, `cm.filterLive`, `cm.filterPlay`, `setCurrentMetaFormatFilter`) | Filter | Alle drei Stufen. Gegenprobe an `data/current_meta_card_data.csv`, Spalte `meta`: gemessen **3.248 Zeilen „Meta Live"** und **1.154 Zeilen „Meta Play!"**. Erwartet: „Alle" = Summe beider, „Limitless Decks" ≈ Live, „Major-Decks" ≈ Play!. | Daten | offen |
| F098 | `#current-analysis` | „Datenfenster ab" `#currentMetaDateFrom` (`ui.dataWindowFrom`, `filter.dateFormatHint`) | Filter | Datum in der Mitte des Bestands setzen. Erwartet: Zeilenzahl sinkt. | Daten | offen |
| F099 | `#current-analysis` | Datum zurücksetzen (`clearCurrentMetaDateFrom`) | Knopf | Erwartet: Feld leer, alte Zeilenzahl exakt wieder da. | QA | offen |
| F100 | `#current-analysis` | „Referenz-Listen auf einen Blick" (`cm.quickRefTitle`, `cm.quickRefHint`) | Kachel | Erwartet: zwei Kacheln nebeneinander. | Spieler | offen |
| F101 | `#current-analysis` | „Aktuelles Online · Typischer Build" (`cm.quickRefOnline`) | Kachel | Bilanz + Quote prüfen. **Muss** Matchpunkte `(3S+U)/(3·Partien)` zeigen (`js/current-meta-quickref.js:634–643`) und den Konventionshinweis im `title` tragen. Gegen `data/online_best_decklists.json` nachrechnen. **Befund erwartet, falls dort noch `win_pct` steht:** das ist die vierte, verworfene Formel `(S+0,5·U)/Partien`. | Daten | offen |
| F102 | `#current-analysis` | „Aktuelles Major · Beste Platzierung" (`cm.quickRefMajor`) | Kachel | Wie F101 (`js/current-meta-quickref.js:591–600`). Beide Kacheln müssen **dieselbe** Formel zeigen. | Daten | offen |
| F103 | `#current-analysis` | „3-Wege-Vergleich (Builder · Major · Online)" (`cm.quickRef3way`, `openThreeWayCompare`) | Knopf | Öffnen. Erwartet: Spalten „Card" / „Your Build" / „Latest Major" / „Latest Online" (`cm.threeWayCardCol`, `cm.threeWayColBuilder`, `cm.threeWayColMajor`, `cm.threeWayColOnline`). Ohne Builder-Liste: Leerzustand statt leerer Spalte. | Spieler | offen |
| F104 | `#current-analysis` | 3-Wege schließen (`closeThreeWayCompare`) | Knopf | `Esc` und Knopf. Erwartet: beides schließt. | QA | offen |
| F105 | `#current-analysis` | „Deck-Matchups" (`matchup.title`) — Spalten „Gegner"/„Win Rate"/„Record" (`matchup.opponent`, `matchup.winRate`, `matchup.record`; `index.html:1253–1255`) | Tabellenspalte | Eine Zeile gegen `data/limitless_online_decks_matchups.csv` nachrechnen. Erwartete Konvention: `S/(S+N)`. **Befund:** die Spalte heißt „Win Rate" ohne Konventionsangabe, während `stats.totalWinrate` auf derselben Seite ebenfalls „Win Rate" heißt und `S/(S+N+U)` rechnet. Prüfen, ob mindestens ein `title` die Konvention nennt. | Daten | offen |
| F106 | `#current-analysis` | „Beste Matchups" (`matchup.best`) | Tabellenspalte | Erwartet: absteigend nach Win Rate, Top-N. Gegenprobe an der CSV. | Daten | offen |
| F107 | `#current-analysis` | „Schlechteste Matchups" (`matchup.worst`) | Tabellenspalte | Erwartet: aufsteigend. **Prüfen, ob 0-%-Zeilen erscheinen:** gemessen 59 Zeilen mit `win_rate = 0` auf 32 Decks. Ein Deck mit einer 0-%-Paarung muss diese in „Schlechteste Matchups" zeigen. | Daten | offen |
| F108 | `#current-analysis` | „Keine Daten verfügbar" (`matchup.noData`) | Kachel | Deck ohne Matchup-Zeilen wählen (35 der 135 Decks in `limitless_online_decks.csv` haben keine Zeile in der Matchup-Datei — 135 vs. 100). Erwartet: Hinweistext. | Daten | offen |
| F109 | `#current-analysis` | „Matchups gegen Meta Call (Erwartetes Meta)" (`matchup.vsMetaCallTitle`) — Spalten „Gegner"/„Meta %"/„Win Rate" (`index.html:1461–1463`) | Tabellenspalte | Erwartet: „Meta %" stammt aus dem Meta-Call-Feld (`finalShare`), nicht aus dem Online-Share. Summe der „Meta %" über alle Zeilen + „Sonstige" = 100. | Daten | offen |
| F110 | `#current-analysis` | „Dein Build vs Vanilla (Meta-Call-gewichtet)" (`matchup.userVsVanillaTitle`) — Spalten „Gegner"/„Meta %"/„Vanilla"/„Dein Build"/„Delta" | Tabellenspalte | Erwartet: `Delta = Dein Build − Vanilla` je Zeile; Vorzeichen und Farbe müssen zusammenpassen. | Daten | offen |
| F111 | `#current-analysis` | Matchup-Legende (`matchup.legendStrongPos`, `.legendPos`, `.legendNeutral`, `.legendNeg`, `.legendStrongNeg`) | Kachel | Gegen die Schwellen in `js/app-anti-tech.js:84–89` prüfen: ≥60 stark positiv, ≥53 positiv, ≥47 neutral, ≥40 negativ, darunter stark negativ. Erwartet: Legende nennt dieselben Grenzen. | Daten | offen |
| F112 | `#current-analysis` | Gegnersuche `#currentMetaOpponentSearch` (`matchup.searchOpponent`, `matchup.searchPlaceholder`) | Sucheingabe | Gegnernamen eintippen. Erwartet: Vorschlagsliste, Auswahl füllt `#currentMetaOpponentSelected`. | QA | offen |
| F113 | `#current-analysis` | „Gesamte Win Rate — Limitless Online Turniere" (`stats.totalWinrate`) | Berechnung | Wert gegen `data/limitless_online_decks.csv` `win_rate_numeric` prüfen. Gemessen: die Spalte entspricht in **134 von 135 Zeilen** exakt `S/(S+N+U)`; **eine Zeile weicht ab** — welche, gehört in den Befundbericht. | Daten | offen |
| F114 | `#current-analysis` | „Matchup gegen Top 20" (`stats.matchupTop20`) | Berechnung | Erwartet: anteilsgewichteter Schnitt über die 20 Decks mit dem höchsten Share. Gegen die Matchup-CSV nachrechnen. | Daten | offen |
| F115 | `#current-analysis` | „Karten im Deck (verschiedene / Ø-Liste)" (`stats.cardsInDeck`) | Berechnung | Wie F085. | Daten | offen |
| F116 | `#current-analysis` | „Tech Lab — finde Techs für jede Meta-Karte" (`techLab.heading`, `techLab.subtitle`) | Kachel | Bereich muss im Modus „Cooking" erscheinen. | Spieler | offen |
| F117 | `#current-analysis` | Tech-Lab-Zielsuche `#techLabTargetSearch` (`techLab.targetLabel`, `techLab.startHint`) | Sucheingabe | Karte wählen. Erwartet: „Gewählt: <Karte>" (`techLab.selectedLabel`), vorher „keine" (`techLab.noneSelected`). | QA | offen |
| F118 | `#current-analysis` | „Stark gegen — Karten die diese hier besiegt" (`techLab.beatsTitle`, `techLab.beatsHint`) | Kachel | Erwartet: Liste oder ein benannter Leerzustand. **Grenze:** die Regelbasis `data/card_capability_interactions.json` trägt Version `0.1` vom `2026-05-15` und genau **5 Paarungen** (gemessen). Ein leeres Ergebnis ist der Normalfall und muss als solcher dastehen. | Daten | offen |
| F119 | `#current-analysis` | „Wird besiegt von" (`techLab.beatenByTitle`, `techLab.beatenByHint`) | Kachel | Wie F118 in der Gegenrichtung. | Daten | offen |
| F120 | `#current-analysis` | „Konkrete Meta-Matchups" (`techLab.specificMatchupsTitle`) | Kachel | Erwartet: nur Gegner mit echter Matchup-Zeile. | Daten | offen |
| F121 | `#current-analysis` | „Karten, die den Kartentext umgehen" (`techLab.cardTextBypassersTitle`) | Kachel | Erwartet: Treffer aus `attack.ignores_effects` (3 der 5 Regeln). | Daten | offen |
| F122 | `#current-analysis` | „+ Fehlende Tech hinzufügen" (`techLab.addMissingBtn`) + `#techLabAddSearch` | Klickpfad | Karte hinzufügen, Seite neu laden. Erwartet: Eintrag überlebt (localStorage `techLab.overrides.v1`, `techLab.dataNote`). | QA | offen |
| F123 | `#current-analysis` | „Overrides zurücksetzen" (`techLab.resetBtn`) | Knopf | Erwartet: eigene Einträge weg, Standardliste wieder da. | QA | offen |
| F124 | `#current-analysis` | „Vorschläge kommen aus der Kartentext-Capability-Engine …" (`techLab.dataNote`) | Kachel | Der Hinweis muss Version und Datum der Regelbasis nennen (`TechIdeen.datenstand()`, `js/tech-ideen.js:463–477`). **Erwartet: `0.1` / `2026-05-15` / 5 Paarungen.** Fehlen sie, ist ein leeres Ergebnis nicht einzuordnen. | Daten | offen |
| F125 | `#current-analysis` | „Build vs …" (`antiTech.buildVsBtn`, `openAntiTechModal`) | Knopf | Öffnen. Erwartet: Dialog Schritt 1 „Bauen gegen spezifische Decks" (`antiTech.modalTitle`). | QA | offen |
| F126 | `#current-analysis` | Anti-Tech Schnellauswahl (`antiTech.quickPicksLabel` = „Schnellauswahl (aus dem Meta Call)") | Filter | Erwartet: höchstens 12 Vorschläge (`QUICK_PICK_LIMIT`, `js/app-anti-tech.js:41`). | Daten | offen |
| F127 | `#current-analysis` | Anti-Tech WR-Pillen | Tabellenspalte | Farbe je Gegner gegen `_wrClass` (`js/app-anti-tech.js:83–90`) prüfen. | Daten | offen |
| F128 | `#current-analysis` | Anti-Tech Aggressivität „Mild"/„Standard"/„Schwer" (`antiTech.mildName`, `.standardName`, `.heavyName`) | Filter | Alle drei. Erwartet: Zahl der vorgeschlagenen Tech-Karten steigt monoton von Mild zu Schwer. | Spieler | offen |
| F129 | `#current-analysis` | „Weiter → Tech-Karten wählen" (`antiTech.continueBtn`, `advanceAntiTechModal`) | Knopf | Ohne Zielauswahl klicken. Erwartet: Hinweis statt Schritt 2. | QA | offen |
| F130 | `#current-analysis` | „← Zurück" (`antiTech.backBtn`, `backToAntiTechStep1`) | Knopf | Erwartet: Auswahl aus Schritt 1 bleibt erhalten. | QA | offen |
| F131 | `#current-analysis` | „Build mit N Karten" (`antiTech.buildBtn`, `confirmAntiTechBuild`) | Berechnung | Bestätigen. Erwartet: die gewählten Karten stehen fest im Deck (`techSlots`), höchstens 10 (`TECH_SLOTS_HARD_CAP`, `js/app-anti-tech.js:42`), danach läuft `autoCompleteConsistency` und das Deck hat wieder 60 Karten. | Spieler | offen |
| F132 | `#current-analysis` | „Tech-Karten" (`techSlots.label`, `techSlots.hint`) + `#currentMetaTechSlotInput` | Sucheingabe | Karte von Hand eintragen. Erwartet: sie überlebt das nächste Generate. | Spieler | offen |
| F133 | `#current-analysis` | „Leeren" (`techSlots.clearBtn`, `clearTechSlots`) | Knopf | Erwartet: alle festen Tech-Karten weg. | QA | offen |
| F134 | `#current-analysis` | „Max Consistency" (`cl.genConsistency`, `autoCompleteConsistency`) | Berechnung | Wie F070. **Zusatz:** Datenfenster prüfen — die Quelle `data/tournament_decklists_per_player.csv` hat gemessen **1.201 Listen aus 3 Turnieren**; mit dem Formattor `minDate = 2026-07-31` (`data/format_window.json` → `in_person_legal_date`) bleiben davon **143 Listen aus genau einem Turnier** (Worlds 2026, 2026-08-28). Erwartet: der Warum-Dialog sagt das. | Daten | offen |
| F135 | `#current-analysis` | Legende (`legend.title`, `legend.cardName`, `legend.setAndInclusion`, `legend.avgInDeck`, `legend.maxInDeck`, `legend.deckCoverage`, `legend.inYourDeck`, `legend.otherPrintsOwned`, `legend.lpPrice`, `legend.wishlist`, `legend.pinExclude`, `legend.plusMinus`, `legend.summary`) | Kachel | Jeden Legendeneintrag gegen ein echtes Element der Kartenzeile zuordnen. Erwartet: kein Legendeneintrag ohne Gegenstück und umgekehrt. | QA | offen |
| F136 | `#current-analysis` | Restliche Deckbau-Knöpfe (`copyDeck`, `shareDeck`, `saveCurrentDeckToProfile`, `openDeckCompare`, `toggleCurrentMetaDeckGridView`, `sendCurrentDeckToProxyPrinter`, `exportToPTCGL`, `importFromPTCGL`, `openInShowdownFromBuilder`, `toggleDeckRarity`, `openDrawSimulator`, `clearDeck`) | Knopf | Je einmal wie F073–F084 auf dieser Route. | QA | offen |
| F137 | `#current-analysis` | Übersichtssuche `#currentMetaOverviewSearch`, Raster-Suche `#currentMetaDeckGridSearch`, Metasuche `#currentMetaMetaSearch` | Sucheingabe | Alle drei mit demselben Begriff. Erwartet: jede filtert nur ihren eigenen Block. | QA | offen |
| F138 | `#current-analysis` | Deep-Link `#current-analysis?deck=<Name>` | Deep-Link | `#current-analysis?deck=Dragapult%20Dusknoir` aufrufen. Erwartet: Deck vorbelegt (`js/inline-init.js:545–548`), Analyse läuft ohne weiteren Klick. | QA | offen |
| F139 | `#current-analysis` | Deep-Link `#current-meta?deck=<Name>` | Deep-Link | Erwartet: derselbe Vorbelegungspfad greift (`tabId === 'current-meta'` ist mit abgedeckt), landet aber auf `#current-meta` — prüfen, ob die Vorbelegung dort wirkungslos bleibt. | QA | offen |
| F140 | `#current-analysis` | Leerzustände `emptyState.deckEmpty`, `emptyState.metaLoading`, `cm.noCardsForFilter` | Kachel | Filter so eng stellen, dass nichts übrig bleibt. Erwartet: „Kein Treffer für diesen Filter" mit Beschreibung, nicht leerer Kasten. | QA | offen |

---

## 6. `#past-meta`

Gerüst `index.html:1787–2063` — 79 `data-i18n`, 33 Knöpfe, 4 Auswahlfelder.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F141 | `#past-meta` | „Deck-Analyse: vergangene Turniere" (`pm.analysisHeading`, `pm.analyzeAndBuild`) | Kachel | Route aufrufen. | QA | offen |
| F142 | `#past-meta` | „Meta/Format-Filter:" `#pastMetaFormatFilter` (`pm.formatFilter`, `pm.allFormats`) | Filter | Alle Formate durchgehen. Erwartet: die Liste enthält genau die Metas aus `data/labs_tournament_matchups.csv` — gemessen 13: BRS-PRE, BRS-SCR, BRS-SFA, BRS-SSP, SVI-ASC, SVI-BLK, SVI-DRI, SVI-JTG, SVI-MEG, SVI-PFL, TEF-CRI, TEF-PBL, TEF-POR. | Daten | offen |
| F143 | `#past-meta` | „Turnier-Filter:" `#pastMetaTournamentFilter` (`pm.tournamentFilter`, `pm.allTournaments`) | Filter | Ein Turnier pinnen. Erwartet: Zeilenzahl sinkt; „Erfolgreichste Decklist" folgt dem gepinnten Turnier statt dem jüngsten (`pm.mostSuccessfulHint`). | Daten | offen |
| F144 | `#past-meta` | Deckwahl `#pastMetaDeckSelect` | Auswahlfeld | Deck wählen. Erwartet: alle Blöcke füllen sich. | QA | offen |
| F145 | `#past-meta` | Kartenfilter `#pastMetaFilterSelect` (`cl.allCards`/`cl.cards50`/`cl.cards70`/`cl.cards90`) | Filter | Wie F056–F058. | Daten | offen |
| F146 | `#past-meta` | „Erfolgreichste Decklist" (`pm.mostSuccessfulTitle`, `pm.mostSuccessfulHint`) | Kachel | Bilanz + Quote prüfen. **Muss** Matchpunkte zeigen (`js/app-past-meta.js:2282–2291`) und den Hinweis `WinRateKonvention.hinweis('matchpunkte')` im `title` tragen. | Daten | offen |
| F147 | `#past-meta` | Sortierung hinter „Erfolgreichste Decklist" | Sortierung | **Befund prüfen:** die Sortierung greift weiter auf `_pmListWinRate` zurück (`js/app-past-meta.js:2160`, benutzt in `:2267`) — das ist die vierte, im Haus verworfene Formel `(S+0,5·U)/Partien`. Angezeigt wird Matchpunkte. Prüfen, ob eine Liste ganz oben steht, die nach Matchpunkten nicht die beste ist. | Daten | offen |
| F148 | `#past-meta` | „Turnier-Performance" (`pm.tournamentPerformance`, `pm.tournamentPerformanceHint`) | Berechnung | Win % gegen `data/labs_tournament_decks.csv` prüfen. Erwartet: Matchpunkte `(3S+U)/(3·Partien)` (`js/app-past-meta.js:1900–1903`). **Gegenmessung liegt vor:** über alle 4.711 Zeilen weicht `win_pct` maximal 0,005 pp von dieser Formel ab. | Daten | offen |
| F149 | `#past-meta` | Day-1→Day-2-Konversion in der Performance-Sektion | Berechnung | `day2Conv = day2/day1 · 100`. **Prüfen, ob der Nenner sichtbar ist:** der Quelltext nennt 74 Zeilen mit exakt 100 % Konversion, davon 65 auf einem einzigen Spieler (`js/app-past-meta.js:1904–1916`). Erwartet: Spielerzahl steht daneben. | Daten | offen |
| F150 | `#past-meta` | Matchup-Tabelle — Spalten `headerOpp` / `headerWr` / `headerGames` | Tabellenspalte | Kopf-`title` muss `WinRateKonvention.hinweis('matchpunkte')` tragen (`js/app-past-meta.js:2069–2070`). Erwartet: der Hinweis sagt, dass ein Spiegel-Matchup unter 50 % der Normalfall ist. | Daten | offen |
| F151 | `#past-meta` | Matchup-Tabelle, dünne Paarungen | Tabellenspalte | Zeilen unter `MU_MIN_GAMES` müssen gedämpft (`is-muted`) dastehen. Zeilenzahl unter der Schwelle notieren. | Daten | offen |
| F152 | `#past-meta` | Spalten „Card Name" / „Count" / „ACE SPEC" / „Action" | Tabellenspalte | **Befund:** diese vier `<th>` sind in `js/app-past-meta.js` **fest englisch verdrahtet, ohne `t()`** — auf einer deutschen Seite. | QA | offen |
| F153 | `#past-meta` | „Karten im Deck (verschiedene / Ø-Liste)" (`pm.cardsInDeck`, `pm.cardsInDeckTitle`) | Berechnung | Wie F085. | Daten | offen |
| F154 | `#past-meta` | „Format" / „Turnier" (`stats.format`, `stats.tournament`) | Tabellenspalte | Müssen das aktive Format bzw. Turnier nennen. | QA | offen |
| F155 | `#past-meta` | „Max Consistency" auf dieser Route (`autoCompleteConsistency`) | Berechnung | Ein vergangenes Format wählen und generieren. Erwartet: `opts.minDate` darf hier **nicht** auf `in_person_legal_date` stehen, sonst käme kein einziges Deck heraus. Prüfen, welcher Wert wirklich übergeben wird. | Daten | offen |
| F156 | `#past-meta` | Anti-Tech auf dieser Route (`openAntiTechModal`) | Klickpfad | Wie F125–F131. **Zusatz:** die WR-Quelle ist hier `_majorMatchupMap[<Format>]` mit einer Mindestzahl von 3 Partien (`MAJOR_MATCHUP_MIN_GAMES_PAST`, `js/app-meta-call.js:108`). | Daten | offen |
| F157 | `#past-meta` | Restliche Deckbau-Knöpfe (`copyDeck`, `copyPastMetaDeckOverview`, `shareDeck`, `saveCurrentDeckToProfile`, `openDeckCompare`, `togglePastMetaDeckGridView`, `sendCurrentDeckToProxyPrinter`, `exportToPTCGL`, `importFromPTCGL`, `openInShowdownFromBuilder`, `setPastMetaOverviewCardTypeFilter`, `setPastMetaRarityMode`, `toggleDeckRarity`, `openDrawSimulator`, `clearDeck`, `clearTechSlots`, `showConsistencyBuildInfo`, `generateDeckGrid`) | Knopf | Je einmal wie auf `#city-league-analysis`. | QA | offen |
| F158 | `#past-meta` | Deep-Link `#past-meta?deck=<Name>&format=<Meta>` | Deep-Link | `#past-meta?deck=Dragapult&format=TEF-POR` aufrufen. Erwartet: `navigateToPastMetaWithDeck` greift (`js/inline-init.js:527–530`) — erst Format, dann Deck nach dem Nachladen. | QA | offen |
| F159 | `#past-meta` | Deep-Link mit unbekanntem Format | Deep-Link | `#past-meta?deck=X&format=ZZZ-ZZZ`. Erwartet: benannter Leerzustand, kein Absturz. | QA | offen |

---

## 7. `#meta-call`

Gerüst `index.html:2064–2072` — die Ansicht besteht aus **einem leeren `<div id="metaCallHost">`**; alles zeichnet `js/app-meta-call.js` (13.788 Zeilen). Sichtbare Texte: 254 Schlüssel `mc.*` in `js/i18n.js`.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F160 | `#meta-call` | „Meta Call" (`mc.title`, `mc.subtitle`) | Kachel | Route direkt aufrufen. Erwartet: Ansicht zeichnet ohne Anmeldung. | QA | offen |
| F161 | `#meta-call` | „← Startseite" (`metaHub.backToOverview`) | Knopf | Klicken → `#current-meta`. | QA | offen |
| F162 | `#meta-call` | „Quelle" (`mc.panelSource`) mit „Aktuelles Meta"/„Vergangenes Meta"/„Aktuelle City League"/„Vergangene City League" (`mc.sourcePastMeta`, `mc.sourceCurrentCityLeague`, `mc.sourcePastCityLeague`; `MetaCall._setMetaSource`, `_onToggleSource`) | Reiter | Jede Quelle einmal. Erwartet: Prognose rechnet neu; bei fehlender Quelle steht „keine Daten" (`mc.sourceNoData`). | Daten | offen |
| F163 | `#meta-call` | „Meta Call Modus" (`mc.panelMode`) — „Standard" / „Counter-Meta" (`mc.modeStandard`, `mc.modeCounter`, `MetaCall._setMetaCallMode`) | Reiter | Beide Modi. Erwartet: die Top-Familie wird im Counter-Modus gedrückt, adoptierte Counter angehoben (`mc.modeCounterHint`); Summe der Anteile bleibt 100. | Spieler | offen |
| F164 | `#meta-call` | „Turniereinstellungen" (`mc.panelSettings`) — Turniertyp „Worlds"/„Regional/SPE"/„International"/„Lokaler Cup"/„Lokale Challenge" (`mc.tournamentType*`, `MetaCall._setTournamentType`) | Reiter | Jeden Typ. Erwartet exakt die Voreinstellungen aus `js/app-meta-call.js:999–1003`: Worlds 800/8/16, Regional 2000/8/16, International 3000/8/16, Challenge 24/5/13 (kein Top Cut), Cup 32/5/12 (Top 8). | Daten | offen |
| F165 | `#meta-call` | „Spieler" (`mc.labelPlayers`) | Auswahlfeld | Zahl ändern. Erwartet: die Spielerzahl je Deck (`totalCount`) folgt `runde(Spieler · Anteil/100)` (`js/app-meta-call.js:8613`). | Daten | offen |
| F166 | `#meta-call` | „Runden" (`mc.labelRounds`, `mc.rounds8`, `mc.rounds9`) | Auswahlfeld | 8 → 9 Runden. Erwartet: „Erwartete Begegnungen" skaliert linear (`mc.encounters`), Day-2-Chance ändert sich. | Daten | offen |
| F167 | `#meta-call` | „Punkte für Day 2" `#mc-day2pts` (`mc.labelDay2Points`) | Auswahlfeld | Von 16 auf 15 senken. Erwartet: Day-2-Chance steigt (die Summe läuft über `dp[pt]` ab `day2Points`, `js/app-meta-call.js:8737`). Grenzen 1…45 prüfen. | Daten | offen |
| F168 | `#meta-call` | „Zielpunkte (Top Cut)" / „Zielpunkte (1./2. Platz)" (`mc.labelTargetCutPoints`, `mc.labelTargetTopPoints`) | Auswahlfeld | Bei Cup und Challenge. Erwartet: Beschriftung des Ergebnisses folgt (`mc.predictTitleTopCut`, `mc.predictTitleTopFinish`). | QA | offen |
| F169 | `#meta-call` | „Turnier" (`mc.labelTournamentName`, Platzhalter „z. B. Worlds 2026") | Sucheingabe | Namen eintragen. Erwartet: erscheint im Teilen-Bild. | QA | offen |
| F170 | `#meta-call` | „Mein Deck" (`mc.panelMyDeck`, `mc.selectDeckPlaceholder` = „— Deck wählen —") | Auswahlfeld | Ohne Deck. Erwartet: „Wähle dein Deck oben aus, um die Day-2-Chance zu berechnen." (`mc.noDeckMsg`). | QA | offen |
| F171 | `#meta-call` | „Day-2-Chance" (`mc.day2Chance`, `mc.day2Sub`) | Berechnung | Deck wählen. Erwartet: Prozentwert plus Unterzeile „{pts} Pkt. in {r} R. · {n} Spieler". Nachrechnen: Markow-Kette in `calcDay2` (`js/app-meta-call.js:8685–8748`) — siehe `audit/datenfluss.md`, Kennzahl 5. | Daten | offen |
| F172 | `#meta-call` | „Unentschieden {q} — gemessen an {n} Partien ({meta})" (`mc.day2Unentschieden`) | Berechnung | Erwartet: die Quote stammt aus der Präsenzmessung, nicht aus der Online-Matrix. **Gegenmessung:** `data/labs_tournament_matchups.csv`, `meta = TEF-PBL`, 1.776 Zeilen, 12.242 gezählte Partien (jede Paarung doppelt) → 6.121 Partien, **Unentschieden-Quote 10,95 %**. | Daten | offen |
| F173 | `#meta-call` | „Unentschieden {q} (Rückfall — für dieses Format ist keine Bilanz gemessen)" (`mc.day2UnentschiedenLeer`) | Berechnung | Ein Format ohne Bilanz wählen (alle außer TEF-PBL). Erwartet: Rückfalltext plus `MAJOR_MATCHUP_TIE_RATE = 0,02` (`js/app-meta-call.js:109`), und die Paarungen gehen **unverändert** in die Kette (`js/app-meta-call.js:8703–8706`). | Daten | offen |
| F174 | `#meta-call` | „Day 1 Win Rate" (`mc.day1WinRate`, `mc.day1WinRateSub`) | Berechnung | Erwartet: `expWin / rounds`. Gegen die Kette nachrechnen. | Daten | offen |
| F175 | `#meta-call` | „Ø Wins"/„Ø Losses"/„Ø Ties" (`mc.avgWins`, `mc.avgLosses`, `mc.avgTies`) | Berechnung | Erwartet: die drei Werte summieren sich exakt auf die Rundenzahl (`js/app-meta-call.js:8740–8747`). | Daten | offen |
| F176 | `#meta-call` | „Punkteverteilung nach {r} Runden" (`mc.histTitle`) | Kachel | Balken summieren. Erwartet: Summe = 1 (bzw. 100 %); der Schwellenbalken ist als `above-threshold` markiert (`js/app-meta-call.js:10203`). | Daten | offen |
| F177 | `#meta-call` | „≥{n} = {ziel}" (`mc.histZielLabel`, `mc.thresholdTag`) | Kachel | Erwartet: Schwelle = `day2Points`, und der ausgewiesene Prozentwert = `day2Points / (rounds·3)` (`js/app-meta-call.js:10211`). | Daten | offen |
| F178 | `#meta-call` | „Zusammensetzung des Metas" (`mc.panelField`) — Spalten „Deck"/„Prognose %"/„Meine Schätzung"/„Final %"/„Spieler"/„Ø Begegnungen" (`mc.headerDeck`, `.headerOnline`, `.headerPersonal`, `.headerFinal`, `.headerPlayers`, `.headerAvgEnc`) | Tabellenspalte | Erwartet: die Tabelle zeigt höchstens 25 Decks (`TOP_N = 25`, `js/app-meta-call.js:1041`), der Rest fällt in „Sonstige" (`mc.junkDecks`). Summe der „Final %" + Sonstige = 100. | Daten | offen |
| F179 | `#meta-call` | „Prognose %" Tooltip (`mc.headerOnlineTooltip`) | Berechnung | Der Tooltip sagt ausdrücklich: **nicht** der rohe Online-Share. Gegenprobe: der rohe Wert muss in der Detailzeile stehen (`mc.intelOnlineShareFenster` / `mc.intelOnlineShareKumulativ`). | Daten | offen |
| F180 | `#meta-call` | „Meine Schätzung" (`mc.headerPersonal`, `mc.headerPersonalTooltip`, `MetaCall._onPersonalShare`) | Filter | Für ein Deck 20 % eintragen. Erwartet: dieses Deck steht mit 20 % in „Final %", die Differenz geht an „Sonstige" (`mc.personalShareExpl`) — **nicht** an die übrigen Decks. | Daten | offen |
| F181 | `#meta-call` | „Ø Begegnungen" (`mc.headerAvgEnc`, `mc.headerAvgEncTooltip`) | Berechnung | Erwartet: `Runden · Anteil`. Farbschwellen prüfen: grün ≤0,8, gelb ≤1,2, rot >1,2. | Daten | offen |
| F182 | `#meta-call` | „🔗 Familie zusammenfassen" / „📊 Varianten einzeln" (`mc.groupByPokemon`, `mc.flatView`, `MetaCall._toggleGroupField`) | Reiter | Umschalten. Erwartet: die Summe der Anteile ändert sich **nicht**; nur die Zeilenzahl. | Daten | offen |
| F183 | `#meta-call` | „Alle ausklappen"/„Alle einklappen" (`mc.expandAll`, `mc.collapseAll`, `MetaCall._toggleAllDetails`) | Knopf | Erwartet: alle Detailzeilen auf/zu. | QA | offen |
| F184 | `#meta-call` | Detailzeile „Online-Anteil ({tage} Tage)" (`mc.intelOnlineShareFenster`) | Berechnung | Gegen `data/limitless_online_fenster.csv` prüfen: Kopfzeile nennt „Fenster 2026-08-21 bis 2026-09-04 (14 Tage) · 10042 Decks im Fenster · 38398 kumulativ". Erwartet: die Beschriftung nennt 14 Tage, und `share_fenster` stimmt. | Daten | offen |
| F185 | `#meta-call` | Detailzeile „kumulativ {wert} %" (`mc.intelOnlineShareKumulativ`) | Berechnung | Gegen `share_kumulativ` in derselben Datei. Erwartet: beide Zahlen unterscheiden sich — sonst greift das Fenster nicht. | Daten | offen |
| F186 | `#meta-call` | „Trend ({tage} Tage)" / „Trend (7 Tage)" (`mc.intelTrendFenster`, `mc.intelTrend7d`) | Berechnung | Gegen `trend_fenster` bzw. `share_change` in `limitless_online_decks_comparison.csv`. **Prüfen, ob Fenster- und Kumulativwert gemischt werden** — genau davor warnt `js/app-meta-call.js:130–158`. | Daten | offen |
| F187 | `#meta-call` | „Top-8-Quote (Online-Turniere)" (`mc.intelTop8Conv`, `mc.badgeTop8Conv`) | Berechnung | Gegen `data/online_tournament_top8_decks.csv` (121 Zeilen, `top8_conv_rate`). Erwartet: „vs. Schnitt" (`mc.intelTop8AvgSuffix`) nennt die 25-%-Basis. | Daten | offen |
| F188 | `#meta-call` | „Letzter Major" (`mc.intelLastMajor`), „Day 1"/„Day 2"/„Conv." (`mc.intelMajorDay1`, `.intelMajorDay2`, `.intelMajorConv`) | Berechnung | Gegen `data/labs_tournament_decks.csv` (`day1_players`, `day2_players`, `day1_to_day2_conv`). | Daten | offen |
| F189 | `#meta-call` | „Day-2-Major-Conversion" (`mc.d2ConvLabel`, `mc.d2ConvTooltip`) | Berechnung | Erwartet: recency-gewichtet über die vorliegenden Majors. Wert und Gewichtungsfenster gegen `_labsDay2ConvByDeck` prüfen. | Daten | offen |
| F190 | `#meta-call` | „Ø Day-2-Win Rate (vorliegende Majors)" (`mc.d2WrLabel`, `mc.d2WrTooltip`, `mc.d2WrSample` = „n = {n} Major(s)") | Berechnung | Erwartet: nur Zeilen mit `day2_players ≥ 5` fließen ein (`js/app-meta-call.js:7063`). Der Multiplikator ist bei 50 % neutral, ±10 pp linear, gekappt auf [0,4; 1,6] (`js/app-meta-call.js:8938–8946`), und bei n = 1 Major nur halb so stark. | Daten | offen |
| F191 | `#meta-call` | „Empfohlene Decks für dieses Meta" (`mc.panelRecommendations`) — Spalten „Deck"/„Day-2"/„Erw. Siege"/„Ø Win Rate" (`mc.recDeck`, `mc.recDay2`, `mc.recExpWins`, `mc.recAvgWr`) | Tabellenspalte | Erwartet: absteigend nach Day-2-Wahrscheinlichkeit; Kandidatenkreis = Top 25 der Prognoseliste + eigenes Deck + eigene Decks (`js/app-meta-call.js:8763–8800`). | Spieler | offen |
| F192 | `#meta-call` | „unter 20 %" (`mc.recBelowThreshold`, `mc.recBelowThresholdTip`) | Tabellenspalte | Erwartet: die Liste zeigt immer zehn Zeilen; alles unter 20 % ist als solches gekennzeichnet. | QA | offen |
| F193 | `#meta-call` | „Counter-Pick" (`mc.recCounterPickLabel`, `mc.recCounterPickTooltip`) | Tabellenspalte | Erwartet: Kennzeichen nur bei niedrigem Feldanteil mit starken Matchups. | Spieler | offen |
| F194 | `#meta-call` | „Klicken um die Begründung zu sehen" (`mc.recReasonHint`, `MetaCall._toggleRecReason`) | Klickpfad | Aufklappen. Erwartet: „Erwartete Siege {wins} / {rounds} Runden → {day2} % Chance …" (`mc.reasonBreakdown`) plus Top-Matchups (`mc.reasonTopMatchups`); ohne Daten `mc.reasonNone`. | Spieler | offen |
| F195 | `#meta-call` | „Im Deck-Analyse-Tab öffnen" (`mc.reasonOpenAnalysis`, `MetaCall._jumpToDeckAnalysis`) | Klickpfad | Klicken. Erwartet: `#current-analysis` mit vorbelegtem Deck. | QA | offen |
| F196 | `#meta-call` | „Geheimtipps – könnten überraschen" (`mc.tipsTitle`, `mc.tipsHint`) | Kachel | Erwartet: nur Decks mit Online-Share < 3 % und mindestens einem starken Signal; jede Zeile trägt einen der Begründungstexte `mc.tipReason*`. | Spieler | offen |
| F197 | `#meta-call` | „Win Rates anpassen ▼" (`mc.adjustWinRates`, `MetaCall._toggleOverrides`) — Spalten „Gegner"/„WR (gemischt)"/„Manuelle WR"/„Indikator" (`mc.colOpponent`, `mc.colWrBlended`, `mc.colManualWr`, `mc.colIndicator`) | Tabellenspalte | Für einen Gegner 80 % von Hand setzen. Erwartet: „von Hand gesetzt" (`mc.wrManuell`), Day-2-Chance steigt, `mc.overrideHint` erklärt den Vorrang. | Daten | offen |
| F198 | `#meta-call` | „keine Partien erfasst" (`mc.wrOhneMessung`) | Tabellenspalte | Gegner ohne Online-Zeile suchen. Erwartet: Kennzeichen statt einer erfundenen Zahl. Der Quelltext nennt 33,5 % des erwarteten Gegnerfelds ohne Online-Quote (`js/app-meta-call.js:8247–8252`). | Daten | offen |
| F199 | `#meta-call` | Nennerhinweis an der WR (`mc.wrNennerTitel`) | Tabellenspalte | Erwartet: Tooltip nennt Online-Partien **plus** eingemischte Major-Partien (`js/app-meta-call.js:8375–8378`). | Daten | offen |
| F200 | `#meta-call` | „Eigene Decks" (`mc.customDecksTitle`, `mc.customDecksHint`, `MetaCall._addCustomDeck`) | Klickpfad | Deck mit Namen und Anteil hinzufügen. Erwartet: erscheint im Feld, wird in `calcRecommendations` mit ausgewertet. Obergrenze prüfen (`mc.customDecksMaxed`). | Spieler | offen |
| F201 | `#meta-call` | „Entfernen" (`mc.remove`, `MetaCall._removeCustomDeck`) | Knopf | Erwartet: Deck weg, Anteile normalisieren sich neu. | QA | offen |
| F202 | `#meta-call` | „Others-Spieler"/„Others-Win% (vs Others)" (`mc.labelJunkPlayers`, `mc.labelJunkWinRate`, `mc.junkExplanation`) | Filter | Others-Anteil auf 30 % stellen. Erwartet: Day-2-Chance ändert sich; `getBaseMatchup(x, '_junk')` benutzt genau diese Quote (`js/app-meta-call.js:8188–8191`). | Daten | offen |
| F203 | `#meta-call` | „Datenquellen" (`mc.panelDataSources`, `mc.dataSourcesHint`) — City-League-Schalter | Filter | Beide Schalter einzeln und zusammen. Erwartet: die Prognoseformel wechselt den Zweig (`js/app-meta-call.js:4188–4260`); ohne Schalter gilt die Grundformel `0,40·labs·t8 + 0,20·brought + 0,15·ladder + 0,15·postMajor + 0,10·weekly`. | Daten | offen |
| F204 | `#meta-call` | „Datenfenster ab:" (`mc.dateWindowLabel`, `mc.dateWindowAuto`, `mc.dateWindowActive`, `mc.dateWindowNone`) | Filter | Auto-Fenster (28 Tage) gegen ein selbst gesetztes Datum. Erwartet: Zahl der einfließenden Major-Zeilen sinkt, `mc.predStatusFilterDropped` nennt die Zahl. | Daten | offen |
| F205 | `#meta-call` | Statusstreifen „Modus A · nur Online-Turniere" / „Modus B · {n} Major-Turnier-Zeilen gewichtet" (`mc.predStatusModeA`, `mc.predStatusModeB`) | Kachel | Erwartet: Modus B nur, wenn Major-Zeilen für das laufende Format vorliegen. **Gegenmessung:** `meta = TEF-PBL` hat in `data/labs_tournament_decks.csv` 44 Zeilen und in `data/labs_tournament_matchups.csv` 1.776 Zeilen — Modus B ist heute also erreichbar. | Daten | offen |
| F206 | `#meta-call` | „Aktuelles Format: {set} ({name})" (`mc.predStatusFormatActive`, `mc.predStatusFormatPending`) | Kachel | Gegen `data/format_window.json`: `current_set = PBL`, `set_release_date = 2026-07-17`, `in_person_legal_date = 2026-07-31`, `lag_days = 14`. Erwartet: heute (2026-09-06) ist das Format bereits vor Ort legal, also `…FormatActive`. | Daten | offen |
| F207 | `#meta-call` | Banner „Jüngstes Turnier: {date}" / „… — vor {days} Tagen" (`mc.bannerDataDate`, `mc.bannerDataStale`, `mc.bannerDataHelp`) | Kachel | Gegen das Maximum von `tournament_date` in `data/labs_tournament_decks.csv` — gemessen **2026-08-28**. Erwartet: 9 Tage Abstand zum Prüftag. | Daten | offen |
| F208 | `#meta-call` | Banner „Nur Online-Daten — {new} wurde noch auf keinem Turnier vor Ort gespielt" (`mc.bannerLagWindow`) | Kachel | Erwartet: **nicht** sichtbar, da für PBL Major-Zeilen vorliegen. Erscheint er trotzdem, ist das ein Befund. | Daten | offen |
| F209 | `#meta-call` | „Geschlossenes Meta — Fun-Event-Modus" (`mc.frozenBannerTitle`, `mc.frozenBannerHint`) | Kachel | Quelle auf „Vergangenes Meta" stellen. Erwartet: Banner erscheint, Live-Predictor aus. | QA | offen |
| F210 | `#meta-call` | „Finaler Field-Share" (`mc.frozenShareTitle`, `mc.frozenShareBadge`) — Spalten „Deck"/„Spieler"/„Share %" | Tabellenspalte | Erwartet: `mc.frozenShareTotals` nennt Archetypen, Day-1-Spieler und Turnierzahl. Gegen `data/labs_tournament_decks.csv` je Meta nachzählen. | Daten | offen |
| F211 | `#meta-call` | „Fun-Event-Empfehlungen" (`mc.frozenRecPanelTitle`) — Spalten „Deck"/„Spieler"/„Siege je Match"/„Day-2-Conv"/„Score" (`mc.frozenColPlayers`, `mc.frozenColWinPct`, `mc.frozenColDay2Conv`, `mc.frozenColScore`) | Tabellenspalte | **Zentrale Prüfung:** die Spalte heißt „Siege je Match" und muss `S/(S+N+U)` rechnen (`js/app-meta-call.js:1608`, Hinweis über `_frozenWrHinweis` → `WinRateKonvention.hinweis('mitUnentschieden')`). Score = `Siege je Match × (1 + Day-2-Conversion)` (`mc.frozenColScoreHint`). Eine Zeile von Hand nachrechnen. | Daten | offen |
| F212 | `#meta-call` | „{n} Major-Turniere ausgewertet, Top {archetypes} Archetypen (min. 30 Spieler)" (`mc.frozenRecTournHint`) | Berechnung | Gegen `data/labs_tournament_decks.csv` je Meta zählen. Erwartet: die genannte Turnierzahl stimmt (insgesamt 71 Turniere über 14 Meta-Werte, davon einer leer). | Daten | offen |
| F213 | `#meta-call` | „Keine Labs-Daten für dieses Format verfügbar …" (`mc.frozenRecEmpty`) | Kachel | Ein Meta ohne Zeilen wählen. Erwartet: Text statt leerer Tabelle. | QA | offen |
| F214 | `#meta-call` | „Gespeicherte Meta Calls" (`mc.scenarios`, `mc.scenariosExplainer`, `MetaCall._saveScenario`) | Klickpfad | Szenario speichern, Seite neu laden, Szenario laden. Erwartet: Einstellungen und Prognose exakt wiederhergestellt. | QA | offen |
| F215 | `#meta-call` | „Aktualisieren" / „Szenario löschen" (`mc.scenarioUpdate`, `mc.scenarioDelete`, `mc.scenarioDeleteConfirm`) | Knopf | Erwartet: Rückfrage vor dem Löschen. | QA | offen |
| F216 | `#meta-call` | Szenario-Fehlerfälle (`mc.scenarioSaveError`, `mc.scenarioStorageCorrupted`, `mc.scenarioStorageEmpty`, `mc.scenarioNameTooLong`) | QA | Privaten Modus verwenden bzw. Namen > 60 Zeichen. Erwartet: benannte Meldung statt stillem Fehlschlag. | QA | offen |
| F217 | `#meta-call` | „Bild generieren" (`mc.generateImage`, `mc.generateImageHint`, `mc.generateImageEmpty`, `mc.generateImageMissing`) | Knopf | Ohne Prognose klicken → `mc.generateImageEmpty`. Mit Prognose → Bild mit Top 10. | QA | offen |
| F218 | `#meta-call` | „Teilen" (`mc.share`, `mc.shareDay2`, `mc.shareField`, `mc.shareFieldAndRecs`) | Knopf | Alle drei Varianten. Erwartet: Vorschau (`mc.sharePreviewTitle`), Herunterladen (`mc.download`) funktioniert. | QA | offen |
| F219 | `#meta-call` | „Journal-Einfluss aktiv:" (`mc.journalInfluence`, `mc.journalMatchups`, `mc.journalWeightHint`, `mc.badgeJournal`) | Berechnung | Mit gefülltem Battle Journal. Erwartet: Gewichtung „Meta = 30 · Journal = Spielanzahl"; ohne Journal darf der Block nicht erscheinen. | Spieler | offen |
| F220 | `#meta-call` | „🧱 Journal-Bricks" / „Inkl. Bricks" / „Exkl. Bricks" (`mc.journalBricks`, `mc.inclBricks`, `mc.exclBricks`, `MetaCall._onBrickFilter`) | Filter | Umschalten. Erwartet: die persönliche WR ändert sich, die Meta-Basis nicht. | Spieler | offen |
| F221 | `#meta-call` | „Testing-Group-Share" / „Mein Matchup-Win (Testing Group)" (`mc.intelTgShare`, `mc.intelTgWr`, `mc.badgeTg`, `mc.badgeTgShare`) | Berechnung | Mit geladener Testing Group. Erwartet: Modus A + TG nutzt den Zweig `0,40·TG + 0,20·ladder + 0,20·brought + 0,10·top8 + 0,10·trend` (`js/app-meta-call.js:4232–4241`). | Daten | offen |
| F222 | `#meta-call` | „Limitless Swiss-Calculator" (`mc.swissCalcLink`) + „Swiss-Hinweis" (`mc.swissNote`) | Klickpfad | Link öffnen. Erwartet: neuer Tab; der Hinweis erklärt, warum die Kette ab Runde 4–5 optimistisch ist. **Das ist die eingestandene Grenze der Modellierung — muss sichtbar sein.** | Spieler | offen |
| F223 | `#meta-call` | Deep-Links `#meta-call`, `#metacall` | Deep-Link | Beide aufrufen. Erwartet: beide landen auf dem eigenständigen Tab, **nicht** im Profil (der Doppeleintrag war der Fehler vom 18.08.2026, `js/inline-init.js:401–412`). | QA | offen |
| F224 | `#meta-call` | Diagnosemarken (`MetaCall.setDiagnostics(true)`) | QA | In der Konsole einschalten. Erwartet: zusätzliche Marken im Vorhersagestreifen; Standard ist aus (`js/app-meta-call.js:172–175`). | QA | offen |
| F224a | `#meta-call` | „WR (gemischt)" gegen die Heatmap derselben Paarung | Berechnung | Dieselbe Paarung in `#meta-call` und in der Heatmap auf der Startseite aufrufen. **Erwartet ein Unterschied — und das ist der Befund:** die Heatmap zeigt die CSV-Spalte `win_rate` = `S/(S+N)`, der Meta Call rechnet aus `record` `S/(S+N+U)` (`js/app-meta-call.js:7382–7387`). Gemessen weichen **523 von 1.702 Zeilen** ab, Maximum 26,67 pp (Steven's Metagross vs Cynthia's Garchomp, 2-1-2: 40,00 gegen 66,67). Beide Werte notieren. | Daten | offen |
| F224b | `#meta-call` | Ungeglättete Extremwerte in der Kette | Berechnung | Ein Deck mit einer 3-0-Paarung wählen (z. B. Blaziken Zoroark vs Raging Bolt Ogerpon, `3 - 0 - 0`) und die Begegnungsliste öffnen. **Erwartet laut Messung: 100,0 % ohne Glättung** — `_matchupMap` (`js/app-meta-call.js:7371–7405`) ruft `DsGlaettung` nicht auf, und `_clip(0,05; 0,95)` greift nur, wenn Predictor 5.3 eine Korrektur hat (`:8427`). Gemessen: **22 Paarungen bei 100 %, 59 bei 0 %, 81 außerhalb [5 %; 95 %]**. Prüfen, ob mindestens die Partienzahl daneben steht. | Daten | offen |

---

## 8. `#cards`

Gerüst `index.html:2074–2157`, Inhalt `js/app-cards-db.js` (4.909 Zeilen).

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F225 | `#cards` | „Kartendatenbank" (`cards.heading`) | Kachel | Route aufrufen. | QA | offen |
| F226 | `#cards` | „Daten:"-Chip (`data-quelle="all_cards_database.csv"`) | Kachel | **Befund prüfen:** der Chip nennt `all_cards_database.csv` (mtime 2026-08-25), die Ansicht lädt aber die Chunks aus `data/cards_manifest.json` (erzeugt 2026-09-06, 20.878 Karten in drei Dateien). Erwartet: Chip und tatsächlich geladene Daten haben dasselbe Datum. | Daten | offen |
| F227 | `#cards` | „Karten werden geladen…" (`cards.loading`) | Kachel | Erwartet: Ladezustand endet; danach steht die Trefferzahl in `#cardResultsInfo`. Erwartet: **20.878** Karten insgesamt (`cards_manifest.json` → `totalCards`), aufgeteilt in standard 5.110 / extended 3.946 / legacy 11.822. | Daten | offen |
| F228 | `#cards` | Suchfeld `#cardSearch` (`cards.searchLabel`, Platzhalter „z.B. Glurak, Pikachu…") | Sucheingabe | „Glurak" eintippen (deutscher Name). Erwartet: Treffer > 0 — der Platzhalter verspricht deutsche Namen. Trefferzahl vorher/nachher notieren. | Daten | offen |
| F229 | `#cards` | Autovervollständigung `#cardSearchAutocomplete` | Sucheingabe | Drei Buchstaben tippen. Erwartet: Vorschlagsliste, Pfeiltasten + Enter wählen aus. | QA | offen |
| F230 | `#cards` | Filter „Meta/Format" `#filter-meta-format` | Filter | Auf „Standard" stellen. Erwartet: Trefferzahl fällt auf ≈ 5.110. | Daten | offen |
| F231 | `#cards` | Filter „Set" `#filter-set` | Filter | Ein Set wählen. Erwartet: alle Treffer tragen dieses `set_code`. | Daten | offen |
| F232 | `#cards` | Filter „Seltenheit" `#filter-rarity` | Filter | Eine Seltenheit wählen. Erwartet: Trefferzahl sinkt, alle Treffer tragen den Wert. | Daten | offen |
| F233 | `#cards` | Filter „Kategorie" `#filter-category` | Filter | Pokémon / Trainer / Energie einzeln. Erwartet: Summe = Trefferzahl ohne Filter. | Daten | offen |
| F234 | `#cards` | Filter „Elementtyp" `#filter-element-type` | Filter | Erwartet: nur bei Kategorie Pokémon wirksam. | QA | offen |
| F235 | `#cards` | Filter „Haupt-Pokémon" `#filter-main-pokemon` | Filter | Erwartet: Trefferzahl sinkt. | Daten | offen |
| F236 | `#cards` | Filter „Archetyp" `#filter-archetype` (`cards.searchArchetype`) | Filter | Einen der 62 Archetypen aus `data/current_meta_card_data.csv` wählen. Erwartet: nur Karten, die dort für diesen Archetyp stehen. | Daten | offen |
| F237 | `#cards` | Filter „Deck-Abdeckung" `#filter-deck-coverage` | Filter | Erwartet: sinkende Trefferzahl mit steigender Schwelle. | Daten | offen |
| F238 | `#cards` | „Filter zurücksetzen" (`cards.resetFilters`, `resetCardFilters`) | Knopf | Nach mehreren Filtern klicken. Erwartet: Trefferzahl exakt wieder auf 20.878. | QA | offen |
| F239 | `#cards` | „Filter ausblenden" (`cards.hideFilters`, `toggleCardsFilterPanel`) | Knopf | Erwartet: Panel klappt zu, `aria-expanded` folgt, Beschriftung wechselt. | QA | offen |
| F240 | `#cards` | Sortierung `#cardSortOrder`: „Nach Set (Standard)" (`cards.sortBySet`) | Sortierung | Erwartet: Gruppierung nach Set, innerhalb aufsteigende Nummer. | QA | offen |
| F241 | `#cards` | „Wie Deckübersicht" (`cards.sortLikeDeck`) | Sortierung | Erwartet: dieselbe Reihenfolge wie im Deckbau-Block. | Spieler | offen |
| F242 | `#cards` | „Nach Abdeckung" (`cards.sortByCoverage`) | Sortierung | Erwartet: monoton fallend. | Daten | offen |
| F243 | `#cards` | „Nach Pokédex-Nr." (`sort.pokedex`) | Sortierung | Erwartet: monoton steigend; Trainer/Energie ans Ende. | QA | offen |
| F244 | `#cards` | „Standard-Druck" / „Alle Drucke" (`cards.standardPrint`, `cards.allPrints`, `setPrintView`) | Reiter | Umschalten. Erwartet: „Alle Drucke" liefert mehr Zeilen bei gleicher Zahl verschiedener Karten. | Daten | offen |
| F245 | `#cards` | Preisangabe je Karte | Berechnung | Stichprobe gegen `data/price_data.csv` (20.419 Zeilen, Verknüpfung über `(set, number)`). Erwartet: bei `mapping_status = unmapped` (gemessen 3.033 Zeilen) steht **kein** Preis oder eine Kennzeichnung, keine stille Null. | Daten | offen |
| F246 | `#cards` | Hilfe-Knopf | Knopf | `openTabHelp('cards')`. | QA | offen |

---

## 9. `#proxy`

Gerüst `index.html:2158–2221`.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F247 | `#proxy` | „Proxy-Drucker" (`tab.proxyPrinter`) | Kachel | Route aufrufen. | QA | offen |
| F248 | `#proxy` | „Warteschlange" leer (`emptyState.proxyQueue`, `emptyState.proxyQueueText`, `emptyState.proxyQueueBtn`) | Kachel | Frisch öffnen. Erwartet: benannter Leerzustand mit Handlungsknopf. | QA | offen |
| F249 | `#proxy` | „Einzelne Karte hinzufügen" (`section.addSingleCard`) — `#proxyManualName` / `#proxyManualSet` / `#proxyManualNumber` / `#proxyManualCount` | Sucheingabe | Name, Set, Nummer, Anzahl 2 eintragen, „Karte hinzufügen" (`proxy.addCardBtn`, `addManualProxyCard`). Erwartet: Zähler „Kopien" (`misc.copies`) +2, „einzigartig" (`misc.unique`) +1. | QA | offen |
| F250 | `#proxy` | Ungültige Kartennummer | QA | Set „ZZZ", Nummer „999". Erwartet: benannte Meldung oder Platzhalterbild, kein stiller Eintrag ohne Bild. | QA | offen |
| F251 | `#proxy` | „Deckliste importieren" (`section.importDecklist`, `proxy.decklistPlaceholder`, `importDecklistToProxy`) | Klickpfad | 60-Karten-Liste einfügen. Erwartet: Kopienzähler = 60. | QA | offen |
| F252 | `#proxy` | „Deckliste zur Warteschlange" (`proxy.addDecklistBtn`) | Knopf | Erwartet: wie F251. | QA | offen |
| F253 | `#proxy` | „Aktuelles Meta Deck hinzufügen" (`proxy.addCMDeck`, `addCurrentDeckToProxy`) | Klickpfad | Vorher auf `#current-analysis` ein Deck bauen. Erwartet: 60 Karten landen hier. | QA | offen |
| F254 | `#proxy` | „City League Deck hinzufügen" (`proxy.addCLDeck`) | Klickpfad | Wie F253 von `#city-league-analysis`. | QA | offen |
| F255 | `#proxy` | „Vergangenes Meta Deck hinzufügen" (`proxy.addPMDeck`) | Klickpfad | Wie F253 von `#past-meta`. | QA | offen |
| F256 | `#proxy` | „Aus Binder laden" (`proxy.loadBinder`, `cbLoadBinderIntoProxy`, `cb.loadUnprintedTitle`) | Klickpfad | Erwartet: nur noch nicht gedruckte Karten. | Spieler | offen |
| F257 | `#proxy` | „Warteschlange leeren" (`proxy.clearQueue`, `clearProxyQueue`) | Knopf | Erwartet: Zähler auf 0, Leerzustand zurück. | QA | offen |
| F258 | `#proxy` | „Warteschlange drucken" (`proxy.printQueue`, `printProxyQueue`) | Knopf | Erwartet: Druckansicht, 9 Karten je Seite, Seitenzahl = ceil(Kopien/9). | Spieler | offen |
| F259 | `#proxy` | „← Startseite" | Knopf | → `#current-meta`. | QA | offen |
| F260 | `#proxy` | Hilfe-Knopf | Knopf | `openTabHelp('proxy')`. | QA | offen |

---

## 10. `#tutorial`

Gerüst `index.html:2222–2249`, Nachladen durch `js/ds-tutorial.js`.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F261 | `#tutorial` | „So funktioniert diese Website" (`tutorial.heading`, `tutorial.subtitle`) | Kachel | Route aufrufen. | QA | offen |
| F262 | `#tutorial` | „Anleitung wird geladen …" (`tutorial.loading`) | Kachel | Erwartet: `tutorial/tutorial.de.html` wird nachgeladen, der Ladehinweis verschwindet, `data-state` wechselt von `idle`. | QA | offen |
| F263 | `#tutorial` | Sprachwechsel bei offenem Tab | Klickpfad | Auf EN umschalten. Erwartet: `tutorial/tutorial.en.html` wird nachgeladen, nicht nur der Rahmen übersetzt. | QA | offen |
| F264 | `#tutorial` | `<noscript>`-Rückfall | QA | JavaScript ausschalten. Erwartet: die beiden direkten Links „Anleitung (deutsch)" / „Guide (english)" sind da und funktionieren. | QA | offen |
| F265 | `#tutorial` | Anleitung gegen die Oberfläche | Spieler | Stichprobe: jeder in der Anleitung genannte Knopf muss auf der Seite existieren und so heißen. Besonders: nennt die Anleitung noch den internen Playtester (seit dem Umzug auf TCG Showdown veraltet)? | Spieler | offen |
| F266 | `#tutorial` | Hilfe-Knopf | Knopf | `openTabHelp('tutorial')`. | QA | offen |

---

## 11. `#quellen`

Gerüst `index.html:2260–2270`, Inhalt `js/app-quellen.js`.
**Befund vorab:** dieser Bereich benutzt **kein `data-i18n` und kein `t()`** — weder die Überschrift `<h2 id="quellenTitel">Quellen & Methodik</h2>` (`index.html:2266`) noch der Zurück-Knopf (`index.html:2263`). Der Sprachwechsel läuft über ein eigenes Wörterbuch im Modul (`js/app-quellen.js:41`, `INHALT.de` / `INHALT.en`). `grep` findet 0 `t()`-Aufrufe in `js/app-quellen.js`.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F267 | `#quellen` | „Quellen & Methodik" | Kachel | Route aufrufen. **Kein `data-i18n`** — auf EN umschalten und prüfen, ob die Überschrift mitwechselt (`js/app-quellen.js` schreibt `#quellenTitel` selbst) oder deutsch stehen bleibt. | QA | offen |
| F268 | `#quellen` | „← Startseite" (`#quellenZurueck`) | Knopf | **Kein `data-i18n`.** Auf EN umschalten. Erwartet laut `INHALT.en.zurueck`: „← Home". Bleibt „← Startseite" stehen, ist das ein Befund. | QA | offen |
| F269 | `#quellen` | Abschnitt „Woher die Zahlen kommen" (`id: 'quellen'`, standardmäßig offen) | Kachel | Erwartet: sechs Quellenzeilen — Global, Japan, Past, Preise, Kartenbilder, Pokémon Champions (`js/app-quellen.js:47–70`). | Spieler | offen |
| F270 | `#quellen` | Quellenzeile „Preise" | Kachel | Text prüfen: „Verknüpft wird über Set und Kartennummer oder die Cardmarket-Produkt-ID, nie über den Namen". Gegenprobe an `data/price_data.csv` — Schlüssel `(set, number)`, gemessen **20.419 eindeutige Paare bei 20.419 Zeilen**, also tatsächlich eindeutig. | Daten | offen |
| F271 | `#quellen` | Abschnitt „Worauf die Zahlen beruhen" (`id: 'umfang'`) | Kachel | **Direkt öffnen, ohne vorher auf der Meta-Ansicht gewesen zu sein.** Erwartet: der Leertext „Der Umfang steht erst zur Verfügung, wenn die Meta-Ansicht in dieser Sitzung einmal geladen wurde." (`js/app-quellen.js:92–93`). Dann Meta-Ansicht besuchen und zurückkehren: Erwartet zwei Nenner. | Daten | offen |
| F272 | `#quellen` | Abschnitt „Was die Begriffe heißen" (`id: 'begriffe'`) | Kachel | Erwartet: die Definitionsliste — Anteil, Gewichteter Antritt, Top-8-Quote, „…-mal so oft wie der Schnitt". | Spieler | offen |
| F273 | `#quellen` | Abschnitt „Wie zuverlässig das ist" (`id: 'zuverlaessig'`) | Kachel | Erwartet: aufklappbar. | QA | offen |
| F274 | `#quellen` | Abschnitt „Was getrennt bleibt" (`id: 'trennung'`) | Kachel | Erwartet: Japan / Global / Past werden nie gemischt. **Gegenprobe:** stimmt das in `#meta-call`, wenn beide City-League-Schalter an sind (F203)? Dort fließt Japan in eine globale Prognose ein. | Spieler | offen |
| F275 | `#quellen` | Abschnitt „Wie aktuell das ist" (`id: 'stand'`) | Kachel | Erwartet: jede Ansicht trägt einen eigenen Stand. Stichprobe über alle 15 Routen: welche Route hat keinen Stand-Chip? | Daten | offen |
| F276 | `#quellen` | Abschnitt „Rechtliches" (`id: 'rechtliches'`) | Kachel | Erwartet: vorhanden und aufklappbar. | QA | offen |
| F277 | `#quellen` | Deep-Links `#quellen-begriffe`, `#quellen-quellen`, `#quellen-zuverlaessig`, `#quellen-trennung`, `#quellen-stand`, `#quellen-rechtliches` | Deep-Link | Alle sechs aufrufen. Erwartet: der jeweilige Abschnitt ist aufgeklappt (`js/inline-init.js:576–588`). | QA | offen |
| F278 | `#quellen` | Deep-Link `#quellen-gibtsnicht` | Deep-Link | Erwartet: Seite öffnet, kein Abschnitt wird aufgeklappt, kein Scrollen ins Leere. | QA | offen |
| F279 | `#quellen` | Kein Hilfe-Knopf | QA | **Befund prüfen:** diese Route hat als einzige Datenroute keinen `openTabHelp`-Knopf. Beabsichtigt oder Lücke? | QA | offen |

---

## 12. `#admin`

Gerüst `index.html:2276–2290`, Inhalt `js/app-admin.js`, Daten `data/datenluecken.json`.
**Befund vorab:** wie `#quellen` **ohne `data-i18n`** — `<h2 id="adminTitel">Datenlücken</h2>` und `#adminZurueck` sind hart verdrahtet; das Wörterbuch liegt in `js/app-admin.js:76–120` (`T.de` / `T.en`). Die Route steht in **keinem Menü** und ist nur über `#admin` bzw. `#datenluecken` erreichbar (`js/inline-init.js:433–435`).

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F280 | `#admin` | „Datenlücken" | Kachel | `#admin` aufrufen. Erwartet: Seite zeichnet ohne Anmeldung. | QA | offen |
| F281 | `#admin` | Deep-Link `#datenluecken` | Deep-Link | Erwartet: dieselbe Ansicht. | QA | offen |
| F282 | `#admin` | Einleitung (`T.de.lead`) | Kachel | Erwartet: Text sagt ausdrücklich „Diese Seite ändert keine Daten". | QA | offen |
| F283 | `#admin` | Hinweis „Nicht zugangsgeschützt …" (`T.de.offenHinweis`) | Kachel | Erwartet: sichtbar. Die Route ist ohne Schutz erreichbar, und die Seite muss das sagen. | QA | offen |
| F284 | `#admin` | Leerzustand „Keine offene Lücke." (`T.de.keine`, `T.de.keineText`) | Kachel | **Erwartet heute genau dieser Zustand:** `data/datenluecken.json` trägt `_meta.anzahl = 0` und eine leere `luecken`-Liste (gemessen). | Daten | offen |
| F285 | `#admin` | Filterreihe „Alle" + Klassen (`T.de.alle`, `klassen.*`) | Filter | Erwartet: bei 0 Lücken keine Filterreihe, sondern der Leerzustand. Sobald Lücken vorliegen: vier Klassen — „Mega-Fähigkeit ohne Beleg", „Kein Nutzungsdatensatz", „Zwei deutsche Namen", „Bereich fehlt ganz". | Daten | offen |
| F286 | `#admin` | „Quelle ansehen ↗" (`T.de.btnQuelle`) | Knopf | Nur mit Daten prüfbar. Erwartet: neuer Tab. | QA | offen |
| F287 | `#admin` | „Bestätigen & senden ↗" (`T.de.btnSenden`) | Klickpfad | Erwartet: vorbefülltes GitHub-Issue mit Titel `[Datenlücke] …` (`js/app-admin.js:183`), **kein** direkter Schreibvorgang. | QA | offen |
| F288 | `#admin` | „Alle %n Vorschläge auf einmal bestätigen ↗" (`T.de.btnAlle`, `T.de.btnAlleTeil`) | Knopf | Erwartet: Sammel-Issue; Zähler `%n` / `%g` müssen stimmen. | QA | offen |
| F289 | `#admin` | „Inventar erzeugt" (`T.de.stand`) | Kachel | Erwartet: `2026-08-31 13:00:53 UTC` (aus `data/datenluecken.json` → `_meta.erzeugt`). **Befund:** das ist 6 Tage alt; `_job_heartbeats.json` weist für andere Läufe den 2026-09-06 aus. | Daten | offen |
| F290 | `#admin` | Fehlerfall (`T.de.fehler`, `T.de.fehlerText`) | QA | Datei umbenennen und Route öffnen. Erwartet: „data/datenluecken.json fehlt oder ist unlesbar. Erzeugen mit: python3 scripts/datenluecken.py". | QA | offen |
| F291 | `#admin` | „← Startseite" (`#adminZurueck`) | Knopf | **Kein `data-i18n`.** Auf EN umschalten, Beschriftung prüfen. | QA | offen |

---

## 13. `#side-quest`

Gerüst `index.html:2293–2320`, Inhalt `js/app-side-quest*.js` (8 Module).
**Befund vorab:** die sieben Reiter tragen **kein `data-i18n`** — „Teams", „Usage", „Matchups", „Pokémon", „Team-Builder", „Status", „Look up" stehen fest im HTML (`index.html:2304–2310`), gemischt englisch/deutsch.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F292 | `#side-quest` | „Side Quest · Pokémon Champions" (`sideQuest.title`, `sideQuest.subtitle`) | Kachel | Route aufrufen. | QA | offen |
| F293 | `#side-quest` | Deep-Links `#sidequest`, `#champions` | Deep-Link | Beide aufrufen. Erwartet: gleiche Ansicht (`js/inline-init.js:427–429`). | QA | offen |
| F294 | `#side-quest` | Statuszeile `#sideQuestStatus` (`sideQuest.loading`, `sideQuest.lastUpdated` = „Stand:") | Kachel | Erwartet: „Stand: 2026-09-06" — aus `data/champions_replica_teams.json` → `_meta.last_updated` (gemessen). | Daten | offen |
| F295 | `#side-quest` | Reiter „Teams" | Reiter | Erwartet: **112 Teams** (`_meta.team_count = 112`, `teams`-Liste hat 112 Einträge, gemessen). **Kein `data-i18n`.** | Daten | offen |
| F296 | `#side-quest` | Replica-Code antippen | Klickpfad | Erwartet: Code in der Zwischenablage, sichtbare Rückmeldung. | QA | offen |
| F297 | `#side-quest` | Reiter „Usage" | Reiter | Erwartet: **238 Pokémon** (`data/champions_usage.json` → `_meta.count = 238`, gemessen), Quelle championsbattledata.com, Stand `2026-09-06T05:11:30+00:00`. **Kein `data-i18n`.** | Daten | offen |
| F298 | `#side-quest` | Usage: Format-Umschalter doubles/singles | Filter | Beide Formate (`_meta.formats`). Erwartet: Liste wechselt, Zeilenzahl unterscheidet sich. | Daten | offen |
| F299 | `#side-quest` | Reiter „Matchups" | Reiter | Erwartet: Matrix aus `js/app-side-quest-matchups.js`. **Kein `data-i18n`.** | Spieler | offen |
| F300 | `#side-quest` | Reiter „Pokémon" (Pokédex) | Reiter | Erwartet: Suche, deutsche Namen aus `data/champions_names_de.json`. **Kein `data-i18n`.** | QA | offen |
| F301 | `#side-quest` | Pokédex-Zeile „Meist genutzt" | Berechnung | Erwartet: die Zeile kommt aus `champions_usage.json`, nicht mehr aus der älteren VGCPastes-Stichprobe (so sagt es `_meta.note`). Stichprobe nachrechnen. | Daten | offen |
| F302 | `#side-quest` | Reiter „Team-Builder" | Reiter | Erwartet: Team zusammenstellen, Typabdeckung gegen `data/champions_type_chart.json`. **Kein `data-i18n`.** | Spieler | offen |
| F303 | `#side-quest` | Reiter „Status" (Statuszustände) | Reiter | Erwartet: Liste aus `data/champions_statuszustaende.json`. **Kein `data-i18n`.** | QA | offen |
| F304 | `#side-quest` | Reiter „Look up" (Resources) | Reiter | Erwartet: Nachschlagewerk aus `data/champions_resources.json`. **Kein `data-i18n`; „Look up" ist englisch auf einer deutschen Seite.** | QA | offen |
| F305 | `#side-quest` | Reiterwechsel und `hidden` | QA | Durch alle sieben Reiter. Erwartet: genau ein Host sichtbar, `aria-selected` folgt, `role="tab"`-Tastaturbedienung (Pfeiltasten) funktioniert. | QA | offen |
| F306 | `#side-quest` | Regulationswechsel M-B / M-A | Filter | `_meta.regulations = ['M-B','M-A']`, `current_regulation = 'M-B'`. Erwartet: Umschalter vorhanden; Teamzahl ändert sich. | Daten | offen |
| F307 | `#side-quest` | „← Startseite" | Knopf | → `#current-meta`. | QA | offen |
| F308 | `#side-quest` | Kein Hilfe-Knopf | QA | Prüfen: diese Route hat keinen `openTabHelp`-Knopf. Beabsichtigt? | QA | offen |

---

## 14. `#calculator`

Gerüst `index.html:2323–2379`, Rechnung `js/app-calculator.js` (233 Zeilen).
**Befund vorab:** `js/app-calculator.js` enthält **0 `t()`-Aufrufe** und arbeitet mit einer eigenen Sprachweiche; die Ergebnistexte kommen also nicht aus `js/i18n.js`. Der Rahmen (14 Schlüssel `calc.*`) schon.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F309 | `#calculator` | „TCG-Wahrscheinlichkeitsrechner" (`calc.heading`, `calc.subtitle`) | Kachel | Route aufrufen. | QA | offen |
| F310 | `#calculator` | Deep-Links `#probability`, `#wahrscheinlichkeit` | Deep-Link | Beide aufrufen. Erwartet: gleiche Ansicht (`js/inline-init.js:407–409`). | QA | offen |
| F311 | `#calculator` | „Karten im Deck" `#calc-deck-size` (`calc.deckSize`) | Filter | Standard prüfen (erwartet 60). Auf 40 setzen. Erwartet: alle drei Ergebnisse ändern sich. | Daten | offen |
| F312 | `#calculator` | „Kopien im Deck" `#calc-copies` (`calc.copies`) | Filter | Auf 4 setzen. | Daten | offen |
| F313 | `#calculator` | „Gezogene Karten (z.B. 7 für die Starthand)" `#calc-drawn` (`calc.drawn`) | Filter | Auf 7 setzen. | Daten | offen |
| F314 | `#calculator` | „Bereits auf der Hand" `#calc-in-hand` (`calc.inHand`) | Filter | Auf 0 und auf 1 setzen. Erwartet: Prize- und Topdeck-Werte ändern sich, der Ziehen-Wert nicht. | Daten | offen |
| F315 | `#calculator` | „Ziehen (mindestens 1)" (`calc.drawLabel`) | Berechnung | **Referenzrechnung:** Deck 60, Kopien 4, gezogen 7 → hypergeometrisch `1 − C(56,7)/C(60,7) = 39,93 %`. Erwartet: die Seite zeigt ≈ 39,9 %. | Daten | offen |
| F316 | `#calculator` | „In den Prizes" (`calc.prizeLabel`, `calc.prizeNote` = „(mindestens 1, nach der Starthand)") | Berechnung | Deck 60, Kopien 4, gezogen 7, Hand 0 → Wahrscheinlichkeit, dass mindestens eine der 4 Kopien unter den 6 Prizes liegt. Von Hand nachrechnen und vergleichen. | Daten | offen |
| F317 | `#calculator` | „Topdeck-Chance" (`calc.topdeckLabel`, `calc.topdeckNote` = „(nächste gezogene Karte)") | Berechnung | Erwartet: `verbleibende Kopien / verbleibende Karten`. Bei Deck 60, Kopien 4, gezogen 7, Hand 0 → 4/53 ≈ 7,5 % (bzw. 4/47, je nach Prize-Annahme) — welche Annahme gilt, muss aus dem Text hervorgehen. | Daten | offen |
| F318 | `#calculator` | Randfälle | QA | Kopien > Deckgröße; gezogen > Deckgröße; alle Felder auf 0; negative Zahl. Erwartet: benannte Meldung oder Deckelung, **kein** `NaN` und kein `Infinity` im Ergebnis. | QA | offen |
| F319 | `#calculator` | Sprachwechsel | QA | Auf EN umschalten. Erwartet: auch die Ergebniszeilen wechseln (siehe Befund oben: `app-calculator.js` benutzt kein `t()`). | QA | offen |
| F320 | `#calculator` | „← Startseite" / Hilfe-Knopf | Knopf | Beide. | QA | offen |

---

## 15. `#profile`

Gerüst `index.html:2380–3972` — 305 `data-i18n`, 142 Knöpfe, 21 Auswahlfelder, 33 Eingabefelder, 11 Unterreiter.

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F321 | `#profile` | „Benutzerprofil" (`profile.heading`) | Kachel | Route abgemeldet aufrufen. Erwartet: „Anmelden, um alle Funktionen freizuschalten" (`profile.signInPrompt`) statt leerer Seite. | QA | offen |
| F322 | `#profile` | „Anmelden / Registrieren" (`profile.signInBtn`, `showAuthModal`) | Klickpfad | Dialog öffnen. Erwartet: E-Mail (`auth.email`), Passwort (`auth.password`), „Mit Google anmelden" (`auth.googleSignIn`), „Passwort vergessen?" (`auth.forgotPassword`). | QA | offen |
| F323 | `#profile` | Registrieren (`auth.createAccount`, `auth.confirmPassword`, `auth.minChars`) | Klickpfad | Zu kurzes Passwort. Erwartet: Meldung mit Mindestlänge. Nicht übereinstimmende Passwörter → eigene Meldung. | QA | offen |
| F324 | `#profile` | „Abmelden" (`signOut`) | Knopf | Erwartet: lokale Daten bleiben, Cloud-Daten verschwinden. | QA | offen |
| F325 | `#profile` | Unterreiter „Meine Sammlung" (`profile.myCollection`) | Reiter | Erwartet: Standard-Unterreiter beim Öffnen (`profile-collection` trägt `active`, `index.html:2537`). | QA | offen |
| F326 | `#profile` | Sammlung: `#collection-search`, `#collection-sort`, `#collection-filter` (`profile.filterAll`, `profile.filterPokemon*`, `profile.filterSupporter`, `profile.filterItem`, `profile.filterTool`, `profile.filterBasicEnergy`, `profile.filterSpecialEnergy`, `profile.allSets`) | Filter | Jeden Typfilter. Erwartet: Summe der Einzelzahlen = Gesamtzahl bei „Filter: Alle Karten". | Daten | offen |
| F327 | `#profile` | „Karten im Besitz" / „Sammlungswert" (`profile.cardsOwned`, `profile.collectionValue`) | Berechnung | Erwartet: Wert = Σ (Anzahl × `eur_price` aus `data/price_data.csv`). Karten mit `mapping_status = unmapped` (3.033 von 20.419) dürfen den Wert nicht stillschweigend mit 0 senken — prüfen, ob sie ausgewiesen werden. | Daten | offen |
| F328 | `#profile` | „Sammlung leeren" (`profile.clearCollection`, `clearCollection`) | Knopf | Erwartet: Rückfrage. | QA | offen |
| F329 | `#profile` | „📋 Liste einfügen" (`profile.botImport`, `profile.botImportHint`, `wishlistBotImportOpen`) | Klickpfad | Telegram-Liste einfügen. Erwartet: Karten landen in der Sammlung; nicht zuordenbare Zeilen werden benannt. | QA | offen |
| F330 | `#profile` | „Dex Import" (`profile.dexImport`, `profile.dexImportHint`, `dexImportOpenFilePicker`, `#dexImportFileInput`) | Klickpfad | CSV-Export laden. Erwartet: Trefferbericht (übernommen / nicht zuordenbar). | QA | offen |
| F331 | `#profile` | Unterreiter „Gespeicherte Decks" (`profile.savedDecks`, `profile.decksNote`) + `#decks-search` | Reiter | Erwartet: gespeicherte Decks, Suche filtert. Leerzustand `emptyState.savedDecks`. | QA | offen |
| F332 | `#profile` | „Neuer Ordner" (`profile.newFolder`, `createDeckFolder`) | Knopf | Erwartet: Ordner anlegen, Deck hineinziehen. | QA | offen |
| F333 | `#profile` | „Nur IRL Gebaute" (`profile.filterBuilt`, `toggleBuiltFilter`) | Filter | Erwartet: Zeilenzahl sinkt auf die als gebaut markierten Decks. | QA | offen |
| F334 | `#profile` | Unterreiter „Wunschliste" (`profile.wishlist`) + `#wishlist-search`, `#wishlist-set-filter` | Reiter | Erwartet: Filter wirken; Leerzustand `emptyState.wishlist`. | QA | offen |
| F335 | `#profile` | „Für Cardmarket kopieren" (`copyWishlistForCardmarket`, `cmw.*`) | Klickpfad | Erwartet: Dialog „Wunschliste für Cardmarket" mit Einfügetext (`cmw.copyPaste`) und Link „Wants öffnen" (`cmw.openWants`). | Spieler | offen |
| F336 | `#profile` | „Als Bild exportieren" (`exportWishlistAsImage`) | Knopf | Erwartet: Bild mit allen Karten. | QA | offen |
| F337 | `#profile` | Unterreiter „Trade List" (`profile.tradelist`) + `#tradelist-search`, `#tradelist-set-filter`, `copyTradelistToClipboard`, `exportTradelistAsImage`, `clearTradelist` | Reiter | Wie F334–F336. | QA | offen |
| F338 | `#profile` | Unterreiter „Meta Binder" (`profile.metaBinder`, `mb.generate`, `mb.addWishlist`, `mb.sendProxy`, `mb.proxyNew`) | Reiter | „Generieren" drücken. Erwartet: Binder aus den aktuellen Meta-Karten; Leerzustand `emptyState.metaBinder`. | Spieler | offen |
| F339 | `#profile` | Meta Binder „Weggefallene Karten" (`closeMetaBinderDroppedModal`) | Klickpfad | Nach einem Neuaufbau. Erwartet: Dialog listet die Karten, die aus dem Meta gefallen sind. | Spieler | offen |
| F340 | `#profile` | Unterreiter „Custom Binder" (`profile.customBinder`, `cb.subtitle`) | Reiter | Erwartet: Leerzustand `emptyState.customBinder`. | QA | offen |
| F341 | `#profile` | Custom Binder Schwellen „Alle"/„Core"/„Tech" (`cb.thresholdAll`, `cb.thresholdCore`, `cb.thresholdTech`, `cbSetThreshold`) | Filter | Alle drei. Erwartet: Kartenzahl fällt monoton von „Alle" über „Core" zu „Tech" (oder die Reihenfolge ist dokumentiert). | Daten | offen |
| F342 | `#profile` | Custom Binder Modus „Sammlung"/„Druck" (`cb.modeCollection`, `cb.modePrint`, `cbSetMode`) | Reiter | Erwartet: „Druck" zeigt nur ungedruckte Karten. | Spieler | offen |
| F343 | `#profile` | Custom Binder Archetypauswahl (`#cbArchetypeSearch`, `cbToggleArchetypeDropdown`, `cb.topMeta` / `cbAddTopMetaArchetypes`) | Sucheingabe | „Top-Meta hinzufügen" drücken. Erwartet: die Top-Archetypen der aktuellen Tierliste landen in der Auswahl. | Spieler | offen |
| F344 | `#profile` | Custom Binder „Binder speichern" / „Als neu speichern" (`cb.saveBinder`, `cb.saveAsNew`, `cbSpeichereBinder`) | Knopf | Erwartet: Binder überlebt einen Neuladen. | QA | offen |
| F345 | `#profile` | Unterreiter „Offline Battle Journal" (`bj.title`, `bj.profileTitle`, `bj.profileSubtitle`) | Reiter | Erwartet: Liste der Einträge. | QA | offen |
| F346 | `#profile` | Journal-Eintrag anlegen (`openBattleJournalSheet`, `bj.tournamentName`, `bj.tournamentType`, `bj.ownDeck`, `bj.opponentDeck`, `bj.result`, `bj.turnOrder`, `bj.bestOf`, `bj.brick`, `bj.mulligan`, `bj.saveBtn`) | Klickpfad | Vollständigen Eintrag speichern. Erwartet: erscheint in der Liste und im Meta-Call-Einfluss (F219). | Spieler | offen |
| F347 | `#profile` | Journal offline | QA | Netz trennen, Eintrag speichern, Netz zurück. Erwartet: „Ausstehende Einträge" (`bj.pendingEntries`, `bj.pendingSync`), danach „Jetzt synchronisieren" (`bj.syncNow`, `flushBattleJournalOutbox`) räumt die Warteschlange. | QA | offen |
| F348 | `#profile` | Journal-Filter `#journalFilterMeta`, `#journalFilterType`, `#journalFilterTournament`, `#journalFilterResult` (`bj.allMetas`, `bj.allTypes`, `bj.allTournaments`, `bj.allResults`) | Filter | Jeden Filter. Erwartet: Zeilenzahl sinkt entsprechend, „Alle…" stellt sie wieder her. | QA | offen |
| F349 | `#profile` | Journal „Alle kopieren" / „Journal leeren" (`bj.copyAll`, `bj.clearJournal`, `copyAllJournalEntries`, `clearAllJournalEntries`) | Knopf | Erwartet: Rückfrage vor dem Leeren. | QA | offen |
| F350 | `#profile` | „Matchup-Analyse" (`matchupAnalysis.title`, `.subtitle`, `toggleMatchupStats`) | Kachel | Erwartet: „Beste"/„Schlechteste"/„Alle" (`matchupAnalysis.bestTitle`, `.worstTitle`, `.allTitle`) aus den eigenen Journal-Einträgen. | Spieler | offen |
| F351 | `#profile` | Matchup-Analyse Brick-Filter (`matchupAnalysis.brickIncl`, `.brickExcl`, `.brickOnly`, `#maFilterBrick`) | Filter | Alle drei. Erwartet: „Nur Bricks" zeigt eine Teilmenge von „Inkl. Bricks". | Spieler | offen |
| F352 | `#profile` | Unterreiter „Decklisten vergleichen" (`profile.compareDecklists`, `compare.option1`, `compare.option2`, `compare.pasteDesc`, `compare.selectDesc`) | Reiter | Zwei Listen einfügen, „Vergleichen" (`compare.compareBtn`). Erwartet: Diff mit +/− je Karte. | Spieler | offen |
| F353 | `#profile` | „Gebaute Decks vergleichen" (`profile.compareBuilt`, `compareActiveDecks`) | Knopf | Erwartet: die beiden zuletzt gebauten Decks werden verglichen. | Spieler | offen |
| F354 | `#profile` | Unterreiter „Deck Builder" (`profile.deckBuilder`) | Reiter | Erwartet: eigenständiger Builder (`js/app-profile-deck-builder.js`). | Spieler | offen |
| F355 | `#profile` | Unterreiter „Testing Groups" (`#profile-testinggroups`) | Reiter | Erwartet: Gruppen anlegen/beitreten; Deep-Link `#tg-join=<Code>` (`js/app-testing-groups.js:1745`) funktioniert. | QA | offen |
| F356 | `#profile` | Unterreiter „Einstellungen" (`profile.settings`) — Anzeigename (`profile.displayName`, `#settings-display-name`, `saveDisplayName`) | Klickpfad | Namen speichern, neu laden. Erwartet: bleibt. | QA | offen |
| F357 | `#profile` | „Telegram-Preisalarme" (`profile.priceAlerts.title`, `.toggle`, `.chatIdLabel`, `.chatIdHelp`, `.thresholdLabel`, `.thresholdHelp`, `savePriceAlerts`) | Klickpfad | Einschalten, Chat-ID und Schwelle setzen, speichern. Erwartet: Bestätigung; ohne Chat-ID eine benannte Meldung. | QA | offen |
| F358 | `#profile` | „Ziehsimulator" (`draw.title`, `draw.newHand`, `draw.drawCard`, `draw.remaining`, `drawNewHand`, `drawExtraCard`) | Klickpfad | Erwartet: 7 Karten, „Karte ziehen" senkt „Verbleibend" um 1. | Spieler | offen |
| F359 | `#profile` | „Kombinations-Rechner" (`draw.comboTitle`, `draw.comboDesc`, `#comboTarget1`…`#comboTarget4`, `runComboCalculation`, `clearComboTargets`) | Berechnung | Zwei Zielkarten setzen. Erwartet: Wahrscheinlichkeit, beide in der Starthand zu haben — gegen eine Handrechnung halten. | Daten | offen |
| F360 | `#profile` | Deep-Links `#collection`, `#wishlist`, `#tradelist`, `#metabinder`, `#custombinder`, `#testinggroups`, `#journal` | Deep-Link | Alle sieben. Erwartet: `#profile` **plus** der passende Unterreiter (`PROFILE_SUBTAB_FOR_HASH`, `js/inline-init.js:456–482`). | QA | offen |
| F361 | `#profile` | Deep-Link `#wishlist?focusCard=<SET>|<Nr>` | Deep-Link | Aufrufen. Erwartet: die Zeile wird angesprungen und 3 s bernsteinfarben umrandet (`js/inline-init.js:594–640`); nach 50 Versuchen (~5 s) gibt der Versuch still auf — prüfen, ob das bei kaltem Start reicht. | QA | offen |
| F362 | `#profile` | „Cloud-Sync erzwingen" (`forceCloudSync`) | Knopf | Erwartet: Rückmeldung über Erfolg oder Fehlschlag. | QA | offen |
| F363 | `#profile` | Alle Dialoge schließen | QA | Jeden der 20 `close*`-Aufrufe (`closeAuthModal`, `closeDeckCompare`, `closeDrawSimulator`, `closeEditEntryModal`, `closeEditTournamentModal`, `closeFullscreenCard`, `closeHelpModal`, `closeImageView`, `closeMatchupAnalysisModal`, `closeMetaBinderDroppedModal`, `closeRaritySwitcher`, `closeShareImageModal`, `closeSingleCard`, `closeTradelistGridModal`, `closeWishlistGridModal`, `closeCardmarketWishlistModal`, `closeAntiTechModal`, `closeBattleJournalSheet`, `closeDeckGridPreview`, `closeThreeWayCompare`) einmal per Knopf und einmal per `Esc`. Erwartet: beides schließt, Fokus kehrt zurück, Seite scrollt nicht an den Anfang. | QA | offen |

---

## 16. Routenübergreifend

| Nr | Ansicht/Route | Element | Art | Was genau geprüft wird | Team | Status |
|---|---|---|---|---|---|---|
| F364 | alle | Hauptmenü (`toggleMainMenu`, `#mainMenuTrigger`) | Klickpfad | Öffnen, jeden Menüpunkt einmal. Erwartet: aktive Ansicht wird im Menü markiert (`data-tab-id`), Adresszeile folgt, `aria-expanded` stimmt. | QA | offen |
| F365 | alle | Menüpunkte: „Kartendatenbank", „Deck Builder", „Werkzeuge" (Untermenü: „Proxy-Drucker", „Playtester (TCG Showdown ↗)", „Rechner"), „Meta Call", „Mein Profil", „Side Quest: Pokémon Champions Replica", „Anleitung", „Quellen & Methodik" | Reiter | Jeden gegen die Route prüfen, auf die er führt. | QA | offen |
| F366 | alle | Sprachumschalter `#langToggleBtn` (`header.switchLanguageTitle`) | Knopf | Auf jeder der 15 Routen einmal umschalten. Erwartet: **kein** deutscher Resttext im englischen Modus. Bekannte Kandidaten: `#quellen`, `#admin`, die sieben Reiter in `#side-quest`, die vier `<th>` in `#past-meta`. | QA | offen |
| F367 | alle | Voreingestellte Sprache | QA | Browser auf `en-US` stellen, ohne gespeicherte Wahl laden. Erwartet: Englisch. Browser auf `fr` → Erwartet: Deutsch (`i18nPreferredLang`, `js/i18n.js:22–33`). | QA | offen |
| F368 | alle | Themenumschalter `#themeToggleBtn` (`header.theme`) | Knopf | Umschalten, Seite neu laden. Erwartet: Wahl bleibt, `aria-pressed` stimmt. | QA | offen |
| F369 | alle | Journal-Schnellzugriff `#battleJournalFab` (`bj.openShort`) | Knopf | Von jeder Route. Erwartet: Blatt öffnet, Zähler `#battleJournalFabBadge` zeigt die ausstehenden Einträge. | QA | offen |
| F370 | alle | „Zum Inhalt springen" (`index.html:455`, Text englisch: „Skip to content") | Klickpfad | Erste Tabulatortaste nach dem Laden. Erwartet: Sprungmarke sichtbar und funktionsfähig. **Befund: kein `data-i18n`, fest englisch.** | QA | offen |
| F371 | alle | Unbekannter Hash | Deep-Link | `#gibtsnicht` aufrufen. Erwartet: `applyHash` steigt still aus (`js/inline-init.js:492`) und die zuletzt aktive Ansicht bleibt stehen — **keine** leere Seite. | QA | offen |
| F372 | alle | Hash auf eine Ansicht ohne DOM-Element | Deep-Link | Hash mit einem Alias auf eine stillgelegte Kennung testen. Erwartet: Konsolenwarnung `[deep-link] no tab element for …` und keine Routenänderung (`js/inline-init.js:508–511`). | QA | offen |
| F373 | alle | Doppelte Schlüssel in `HASH_ALIASES` | QA | `tests/unit/test-tieflinks.js` laufen lassen. Erwartet: grün — genau dieser Test verhindert die Wiederkehr des `#meta-call`-Fehlers vom 18.08.2026. | QA | offen |
| F374 | alle | Datenstand-Chips (`js/ds-datenstand.js`, `.js-data-freshness`) | Kachel | Auf jeder Route mit Chip: Datum gegen die mtime der genannten Datei halten. Erwartet: kein Chip bleibt auf „…" stehen. | Daten | offen |
| F375 | alle | Offline-Betrieb (`service-worker.js`, `js/offline-prefetch.js`) | QA | Seite laden, Netz trennen, jede Route aufrufen. Erwartet: gecachte Ansichten öffnen, nicht gecachte zeigen einen benannten Offline-Hinweis. | QA | offen |
| F376 | alle | Fehlerprotokoll (`js/error-tracking.js`) | QA | Konsole während des gesamten Durchlaufs mitschreiben. Erwartet: **null** unbehandelte Ausnahmen; jede gemeldete Zeile mit Route und Auslöser festhalten. | QA | offen |

---

**Erfasst: 378 Zeilen (F001–F376 plus F224a, F224b), alle auf `offen`.**

### Zeilen je Route

| Route | Zeilen |
|---|---|
| Startseite (ohne Hash) / `#current-meta` | 26 (F001–F026) |
| `#meta-analysis-hub` | 11 (F027–F037) |
| `#city-league` | 13 (F038–F050) |
| `#city-league-analysis` | 41 (F051–F091) |
| `#current-analysis` | 49 (F092–F140) |
| `#past-meta` | 19 (F141–F159) |
| `#meta-call` | 67 (F160–F224b) |
| `#cards` | 22 (F225–F246) |
| `#proxy` | 14 (F247–F260) |
| `#tutorial` | 6 (F261–F266) |
| `#quellen` | 13 (F267–F279) |
| `#admin` | 12 (F280–F291) |
| `#side-quest` | 17 (F292–F308) |
| `#calculator` | 12 (F309–F320) |
| `#profile` | 43 (F321–F363) |
| routenübergreifend | 13 (F364–F376) |
| **gesamt** | **378** |

Nach Team: **QA 190 · Daten 141 · Spieler 47** (an der fertigen Datei ausgezählt).
