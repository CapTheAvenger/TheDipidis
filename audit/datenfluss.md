# Datenfluss — je angezeigter Kennzahl der ganze Weg

**Stand der Erhebung:** 2026-09-06
**Regel dieser Datei:** jede Zahl mit `Datei:Zeile` belegt. Alle Stichprobengrößen sind **an den echten Dateien in `data/` mit `python3`/`csv` gemessen**, nicht aus Kommentaren abgeschrieben. Wo Kommentar und Messung auseinandergehen, steht das als **BEFUND** dabei und noch einmal gesammelt am Ende.

---

## 0. Die Zulieferer im Überblick

| Datei | Zeilen (gemessen) | Trenner | Scraper | Dateistand (mtime) | Jüngste Zeile |
|---|---|---|---|---|---|
| `data/limitless_online_decks.csv` | 135 | `;` | `backend/scrapers/limitless_online_scraper.py` (`:116` → `play.limitlesstcg.com/decks`) | 2026-09-04 07:17 | keine Datumsspalte — **UNKLAR** |
| `data/limitless_online_decks_matchups.csv` | 1.702 | `;` | derselbe (`:330`, `/decks/<deck>/matchups/`) | 2026-09-04 07:17 | keine Datumsspalte — **UNKLAR** |
| `data/limitless_online_decks_comparison.csv` | 135 | `;` | derselbe | 2026-09-04 07:17 | — |
| `data/limitless_online_fenster.csv` | 135 | `;` | `scripts/build_online_fenster.py` | 2026-09-05 21:58 | Fenster 2026-08-21 … 2026-09-04 (Kopfzeile) |
| `data/labs_tournament_decks.csv` | 4.711 | `,` | `backend/scrapers/labs_tournament_scraper.py` (`:56` → `labs.limitlesstcg.com`) | 2026-09-04 07:17 | `tournament_date` = 2026-08-28 |
| `data/labs_tournament_matchups.csv` | 47.896 | `,` | derselbe | 2026-09-04 07:17 | `scraped_at` = 2026-09-04T06:32:35Z |
| `data/tournament_decklists_per_player.csv` | 30.459 | `,` | `backend/scrapers/per_decklist_scraper.py` (`:99` → `limitlesstcg.com`) | 2026-09-06 07:05 | `tournament_date` = 2026-08-28 |
| `data/current_meta_card_data.csv` | 4.402 | `;` | `backend/scrapers/current_meta_analysis_scraper.py` | 2026-09-04 07:17 | keine Datumsspalte — **UNKLAR** |
| `data/online_best_decklists.json` | 44 Archetypen | JSON | derselbe (`:797`) | 2026-09-04 07:17 | `tournament_date` = 2026-09-04 |
| `data/online_tournament_top8_decks.csv` | 121 | `,` | `backend/scrapers/online_tournament_scraper.py` | 2026-09-04 07:17 | `last_seen_date` = 2026-09-04 |
| `data/online_tournament_winners.csv` | 98 | `,` | derselbe | 2026-09-04 07:17 | `tournament_date` = 2026-09-04 |
| `data/price_data.csv` | 20.419 | `,` | `backend/scrapers/cardmarket_price_merger.py` | 2026-09-06 09:06 | `last_updated` = 2026-09-06T08:10:23 |
| `data/city_league_analysis_M3.csv` | 133.437 | `;` | `backend/scrapers/city_league_past_analysis_scraper.py` | 2026-09-01 09:57 | `tournament_date` als Fließtext („9th February 2026") — **UNKLAR**, nicht sortierbar |
| `data/city_league_analysis.csv` | **0** | `;` | `backend/scrapers/city_league_analysis_scraper.py` | 2026-08-17 | leer (nur Kopfzeile) |
| `data/card_capability_interactions.json` | **5 Paarungen**, `version 0.1`, `generated_at 2026-05-15` | JSON | von Hand gepflegt | 2026-08-17 | 2026-05-15 |
| `data/format_window.json` | — | JSON | wöchentlich abgeleitet | 2026-08-17 | `current_set = PBL`, `in_person_legal_date = 2026-07-31` |
| `data/ace_specs.json` | 39 Namen | JSON | `limitlesstcg.com/cards?q=is:ace` | 2026-09-01 | `timestamp` = 2026-02-18 |

---

## 1. Win % — alle Konventionen des Hauses

### 1.1 Die Vereinbarung

`js/win-rate-konvention.js` führt **drei** Konventionen (`:69–129`) und nennt eine vierte ausdrücklich als erfunden (`:34–38`).

| Bezeichner | Formel | Anzeigename (de) | Definiert in |
|---|---|---|---|
| `matchpunkte` | `(3S + U) / (3 · Partien)` | **„Win %"** | `js/win-rate-konvention.js:70–101`, Name `:88` |
| `mitUnentschieden` | `S / (S + N + U)` | **„Siege je Match"** | `js/win-rate-konvention.js:102–115`, Name `:105` |
| `ohneUnentschieden` | `S / (S + N)` | **„Siege je entschiedenem Match"** | `js/win-rate-konvention.js:116–128`, Name `:119` |
| *(verworfen)* | `(S + 0,5·U) / Partien` | — | `js/win-rate-konvention.js:34–38` |

Der Name „Win %" für `matchpunkte` wurde am 05.09.2026 von Limitless übernommen (`js/win-rate-konvention.js:73–87`).

### 1.2 Beleg der drei Konventionen an den echten Dateien

| Konvention | Datei | Messung heute |
|---|---|---|
| `matchpunkte` | `data/labs_tournament_decks.csv`, Spalte `win_pct` | **4.711 Zeilen** geprüft: maximale Abweichung **0,005 pp**, Mittel 0,0023 pp. Zum Vergleich `S/(S+N+U)`: maximale Abweichung **25,0 pp**. → Die Spalte **sind** Matchpunkte. |
| `mitUnentschieden` | `data/limitless_online_decks.csv`, Spalte `win_rate_numeric` | **135 Zeilen** geprüft: **134** stimmen auf < 0,05 pp mit `S/(S+N+U)` überein, **1 weicht ab**. |
| `ohneUnentschieden` | `data/limitless_online_decks_matchups.csv`, Spalte `win_rate` | **1.702 Zeilen** geprüft: **0 Abweichungen** von `S/(S+N)`. |

### 1.3 Welche Konvention wo auf dem Schirm steht

| Anzeigestelle | Route | Gerechnet in | Konvention | Nennt sie sich selbst? |
|---|---|---|---|---|
| Win Rate auf der Deck-Kachel der Tierliste | Startseite / `#current-meta` | `js/app-tier-meta.js:2380` (`sc.adjWR`), Hinweis `:2395–2399` | `mitUnentschieden`, zusätzlich **geglättet** mit `PRIOR_GAMES = 50` (`js/app-tier-meta.js:71–76`) | Ja — `WinRateKonvention.kurzHinweis('mitUnentschieden')` im `title` |
| Heatmap-Zelle, Zeile „online" | Startseite | `js/app-current-meta.js:120`, `:546` (über `DsGlaettung`) | `ohneUnentschieden`, **geglättet** k = 20 | Ja — `heatmap.majorTip` nennt „Siege ÷ entschiedene Partien" |
| Matchup-Tabelle der Archetyp-Karte | Startseite | `js/app-archetype-card.js:979–981` | `ohneUnentschieden` | Ja — `WinRateKonvention.hinweis('ohneUnentschieden')` im `th title` |
| „Gesamte Win Rate — Limitless Online Turniere" | `#current-analysis` | `stats.totalWinrate`, Wert aus `win_rate_numeric` | `mitUnentschieden` | **Nein** — die Beschriftung heißt nur „Win Rate" |
| Spalte „Win Rate" in „Beste/Schlechteste Matchups" | `#current-analysis` (`index.html:1254`, `:1271`) | Wert aus `limitless_online_decks_matchups.csv` | `ohneUnentschieden` | **Nein** — `matchup.winRate` = „Win Rate", ohne Konventionsangabe |
| Kachel „Aktuelles Major · Beste Platzierung" | `#current-analysis` | `js/current-meta-quickref.js:591–600` | `matchpunkte` | Ja — `hinweis('matchpunkte')` im `title` |
| Kachel „Aktuelles Online · Typischer Build" | `#current-analysis` | `js/current-meta-quickref.js:634–643` | `matchpunkte` (seit 05.09.2026) | Ja |
| „Turnier-Performance" | `#past-meta` | `js/app-past-meta.js:1900–1903` | `matchpunkte` | Ja |
| Matchup-Tabelle | `#past-meta` | `js/app-past-meta.js:2069–2070` | `matchpunkte` | Ja |
| „Erfolgreichste Decklist" | `#past-meta` | `js/app-past-meta.js:2282–2291` | `matchpunkte` | Ja |
| Spalte „Siege je Match" der Fun-Event-Tabelle | `#meta-call` (Vergangenes Meta) | `js/app-meta-call.js:1608` (`agg.wins / games`), Hinweis `js/app-meta-call.js:10832–10834` | `mitUnentschieden` | Ja — `_frozenWrHinweis()` |
| „WR (gemischt)" im Meta Call | `#meta-call` | `js/app-meta-call.js:8187–8400` (`getBaseMatchup`) | Mischung: online `ohneUnentschieden` (geglättet) + Major `ohneUnentschieden` bzw. `matchpunkte` | Teilweise — `mc.wrNennerTitel` nennt den Nenner, nicht die Konvention |
| Teilen-Bild | überall | `js/ds-share.js:410–412` | `mitUnentschieden` | Ja |

### 1.4 BEFUNDE zur Win-Rate-Konvention

**B1 — „Win Rate" bezeichnet auf ein und derselben Ansicht zwei verschiedene Konventionen.**
Auf `#current-analysis` heißt `stats.totalWinrate` „Gesamte Win Rate — Limitless Online Turniere" (`S/(S+N+U)`) und die Matchup-Spalte `matchup.winRate` heißt „Win Rate" (`S/(S+N)`). Beide ohne Konventionsangabe im sichtbaren Text. Das ist genau der Zustand, den `js/win-rate-konvention.js:9–12` beschreibt.

**B2 — „Win %" heißt im Haus jetzt zweierlei.**
`js/win-rate-konvention.js:88` legt „Win %" als Anzeigenamen für **Matchpunkte** fest. Der Kommentarblock `js/app-meta-call.js:1600–1605` schreibt dagegen: *„Die Spalte darüber heißt wörtlich ‚Win %'. Auf dieser Seite ist Win % seit jeher S/(S+N+U)"*. Zwei Festlegungen desselben Wortes auf zwei verschiedene Formeln, beide aktuell im Quelltext.

**B3 — die vierte, verworfene Formel liegt noch in einer ausgelieferten Datendatei.**
`backend/scrapers/current_meta_analysis_scraper.py:748–756` behauptet seit 05.09.2026, `_win_pct` rechne Matchpunkte. **Gemessen an `data/online_best_decklists.json`:** von 44 Einträgen haben 11 Unentschieden, und in **allen 11** ist `win_pct` exakt `(S + 0,5·U) / Partien`, nicht Matchpunkte:

| Archetyp | Bilanz | `win_pct` in der Datei | Matchpunkte | `(S+0,5U)/G` |
|---|---|---|---|---|
| Dragapult Blaziken | 13-0-1 | 96,4 | 95,24 | **96,43** |
| Dhelmise Pbl | 9-1-1 | 86,4 | 84,85 | **86,36** |
| Rocket's Honchkrow | 8-1-1 | 85,0 | 83,33 | **85,00** |
| Mega Lucario | 9-2-1 | 79,2 | 77,78 | **79,17** |
| Lucario Hariyama | 8-2-1 | 77,3 | 75,76 | **77,27** |
| Other | 7-3-1 | 68,2 | 66,67 | **68,18** |

Die Datei ist vom 2026-09-04, die Korrektur vom 2026-09-05 — der Scraper ist seither nicht wieder gelaufen. **Auf dem Bildschirm richtet das die Oberfläche:** `js/current-meta-quickref.js:378–386` zerlegt `score` selbst und rechnet in `:634–643` Matchpunkte neu. Wer aber die Datei direkt liest (Bot, Test, zweiter Verbraucher), bekommt die verworfene Zahl.

**B4 — die verworfene Formel entscheidet weiterhin über Reihenfolgen.**
`js/app-past-meta.js:2160` (`_pmListWinRate`) und `js/current-meta-quickref.js:75–79` (`_winRate`) rechnen beide `(S + 0,5·U) / Partien`. Angezeigt wird sie nicht mehr, aber `js/app-past-meta.js:2267` sortiert damit die Kandidaten für „Erfolgreichste Decklist". Die dann gezeigte Zahl ist Matchpunkte — Reihenfolge und Zahl stammen also aus zwei Formeln.

---

## 2. Meta-Anteil / Share — drei Größen, die nicht dasselbe messen

### 2.1 Online-Anteil (kumulativ)

```
Quelle    play.limitlesstcg.com/decks
Scraper   backend/scrapers/limitless_online_scraper.py:116
Datei     data/limitless_online_decks.csv  (Spalte share_numeric)
          data/limitless_online_decks_comparison.csv  (Spalte new_share)
Anzeige   js/app-tier-meta.js:1251  (share)  → Deck-Kachel der Tierliste
          js/app-meta-call.js  d.ladderShareKumulativ / _kumulativAnteil():161-164
```
**Formel:** `Anteil = gemeldete Listen dieses Decks / gemeldete Listen aller Decks · 100`, kumuliert seit Formatbeginn.
**Stichprobe (gemessen):** 135 Deckzeilen, **38.398 gemeldete Decks**, 174.954 Partien (87.029 S / 85.677 N / 2.248 U).
**Stand:** Dateistand 2026-09-04; die Datei trägt keine eigene Datumsspalte — **UNKLAR**, welchem Turniertag der Bestand entspricht.
**BEFUND B5:** die Summe aller `share_numeric` ist **96,42 %**, nicht 100 %. Die fehlenden 3,58 pp sind die nicht klassifizierten Decks. Wer die Anteile als Feldzusammensetzung liest, rechnet mit einem zu kleinen Nenner.

### 2.2 Online-Anteil (14-Tage-Fenster)

```
Quelle    zwei kumulative Tagesstände aus data/online_share_history/ (67 Dateien)
Skript    scripts/build_online_fenster.py
Datei     data/limitless_online_fenster.csv  (count_fenster, share_fenster, trend_fenster)
Anzeige   mc.intelOnlineShareFenster  „Online-Anteil ({tage} Tage)"
          mc.intelOnlineShareKumulativ „kumulativ {wert} %"
Wächter   js/app-meta-call.js:120-133 (FENSTER_MAX_ALTER_TAGE 10, FENSTER_MIN_DECKUNG 0,8,
          FENSTER_MIN_DECKS 1500, FENSTER_MAX_TAGE 21, FENSTER_MIN_TAGE 3)
```
**Formel:** `count_fenster = Kumulativstand(heute) − Kumulativstand(vor 14 Tagen)`; `share_fenster = count_fenster / Σ count_fenster · 100`. Die Kopfzeile der Datei sagt ausdrücklich: „Differenz zweier gemessener Kumulativstände, keine Schätzung".
**Stichprobe (gemessen):** 135 Zeilen, **10.042 Decks im Fenster** (2026-08-21 bis 2026-09-04), gegen 38.398 kumulativ.
**Stand:** 2026-09-04 (Fensterende), Datei vom 2026-09-05.
**Warum das getrennt bleiben muss:** `js/app-meta-call.js:130–158` belegt mit zwei Beispielen (Alakazam Dudunsparce 6,28 → 9,83; Festival Lead 5,82 → 2,94), dass ein Vergleich Fensterwert gegen Kumulativstand den Nennersprung statt der Bewegung misst.

### 2.3 Vorhergesagter Anteil („Prognose %")

```
Eingänge  ladderPctDamped   (2.1/2.2, gedämpft mit der eigenen Top-8-Quote)
          broughtPct        data/online_tournament_top8_decks.csv (121 Zeilen)
          labsPct           data/labs_tournament_decks.csv, familienbereinigt
          postMajorSignal   Bewegung nach dem letzten Major
          weeklySignal      share_change aus …_comparison.csv
          clCurPct/clPastPct  City League, nur bei eingeschaltetem Schalter
Rechnung  js/app-meta-call.js:4150-4270
Anzeige   Spalte „Prognose %" (mc.headerOnline), Tooltip mc.headerOnlineTooltip
```

**Grundformel Modus B, ohne City-League-Schalter** (`js/app-meta-call.js:4223–4229`):
```
predicted = 0,40 · labsPct · labsT8Boost
          + 0,20 · broughtPct
          + 0,15 · ladderPctDamped
          + 0,15 · postMajorSignal
          + 0,10 · weeklySignal
          + metaDynBoostPp
```
**Grundformel Modus A** (kein Major im Format, `js/app-meta-call.js:4262ff`) und die vier City-League-Varianten stehen in denselben Zeilen; die Gewichte sinken für `labs` auf 0,32–0,35, sobald City League zugeschaltet ist (`:4188–4222`).

**Dämpfung** (`js/app-meta-call.js:4124–4131`): `ladderDamp = clip(top8Conv / meanConv, lo, hi)`, in Modus B `[0,75; 1,25]`, in Modus A `[0,90; 1,10]`.

**Danach greifen noch** (jeweils additiv in Prozentpunkten, dann Renormierung auf 100):
* Predictor 4.6 — Underdog-Champion-Bonus, gedeckelt auf `max(ladderShare, broughtShare)` (`js/app-meta-call.js:4543–4564`);
* Predictor 4.7 — Online-Turniersieg-Bonus (`:4569–4610`);
* Predictor 5.6 — Varianten-Umverteilung innerhalb einer Familie (`:3131–3211`);
* eine Untergrenze je Deck (`:3083–3086`).

**`metaDynBoostPp` ist heute abgeschaltet** (`js/app-meta-call.js:4102`, `META_DYN_AKTIV = false`); der Kommentar `:4086–4101` belegt den gelieferten Beitrag mit **0,00 pp** bei 134 Ladder-Decks.

**Stichprobe:** 135 Decks aus dem Online-Bestand, davon werden 25 gezeigt (`TOP_N = 25`, `js/app-meta-call.js:1041`), der Rest fällt in „Sonstige".
**Stand:** 2026-09-04 (jüngster Datenstand aller Eingänge).

**Unterschied zu 2.1 in einem Satz:** der Online-Anteil misst, was **gespielt wurde**; der vorhergesagte Anteil schätzt, was beim **nächsten Präsenzturnier** gespielt wird — und lässt dafür Turnierergebnisse schwerer wiegen als Online-Listen.

### 2.4 Major-Anteil („Finaler Field-Share", `share_pct`)

```
Quelle    labs.limitlesstcg.com
Scraper   backend/scrapers/labs_tournament_scraper.py:56
Datei     data/labs_tournament_decks.csv  (Spalten share_pct, day1_share_pct, day2_share_pct)
Rechnung  js/app-meta-call.js:1544-1580 (Aggregation je Deck über alle Turniere eines Metas)
Anzeige   mc.frozenShareTitle „Finaler Field-Share", Spalte mc.frozenShareColShare
```
**Formel:** `share_pct = Spieler dieses Decks / Day-1-Spieler des Turniers · 100`, über alle Turniere eines Metas aufsummiert.
**Stichprobe (gemessen):** 4.711 Zeilen über **71 Turniere** und 14 Meta-Werte (einer davon leer). Für das laufende Format `TEF-PBL` sind es **44 Zeilen**.
**Stand:** jüngstes `tournament_date` = **2026-08-28** (Worlds 2026).

**Unterschied zu 2.1/2.3:** der Major-Anteil ist ein **rückblickend gemessener** Anteil an Präsenzfeldern, nicht der Online-Anteil und keine Prognose. Er ist der einzige der drei, der ohne Modell auskommt.

### 2.5 „Final %" im Meta Call

`finalShare` = die eigene Schätzung, wenn eine gesetzt ist, sonst der vorhergesagte Anteil. Die Differenz wird **bei „Sonstige" verrechnet**, nicht auf die übrigen Decks verteilt (`mc.personalShareExpl`, `mc.headerFinalTooltip`). Das ist die Zahl, mit der `calcDay2` rechnet (`js/app-meta-call.js:8714`, `deck.finalShare / 100`).

---

## 3. Max Consistency

```
Quelle    limitlesstcg.com — Decklisten je Spieler
Scraper   backend/scrapers/per_decklist_scraper.py:99, Ausgabe :102
Datei     data/tournament_decklists_per_player.csv
Feldgröße data/labs_tournament_decks.csv (total_players)
          Brücke data/tournament_cards_data_overview.csv (tournament_id → labs_tournament_id)
ACE SPEC  data/ace_specs.json
Rechnung  js/deck-builder-consistency.js  (build(), :1342-1450)
Anzeige   „Max Consistency" (cl.genConsistency) auf #current-analysis, #past-meta,
          #city-league-analysis; Erklärung „Warum?" (btn.buildInfo)
```

### 3.1 Welche Turniere einfließen

Der Bestand kennt **genau drei Turniere** (gemessen):

| Turnier | `tournament_id` | Datum | Zeilen | Listen | Feldgröße |
|---|---|---|---|---|---|
| Special Event Turin | `0069` (limitless `540`) | 2026-06-06 | 9.800 | 383 | 2.032 |
| NAIC 2026, New Orleans | leer (limitless `518`) | 2026-06-10 | 16.960 | 675 | 3.743 (über die Brücke → labs `0070`) |
| World Championships 2026 | leer (limitless `515`) | 2026-08-28 | 3.699 | 143 | 774 (über die Brücke → labs `0071`) |

**Insgesamt 30.459 Zeilen, 1.201 Listen, 52 Archetypen** (gemessen). Die Brücke aus `tournament_cards_data_overview.csv` liefert für alle drei eine Feldgröße; das in `js/deck-builder-consistency.js:337–348` beschriebene Problem („`518` steht in keiner Labs-Datei", `_sizeWeight(0)` vergibt still 0,5) ist damit **behoben** — nachgemessen: 540→2032, 518→3743, 515→774.

### 3.2 Der Formattor — welche Listen übrig bleiben

`build(archetype, opts)` verwirft alle Listen vor `opts.minDate` (`js/deck-builder-consistency.js:1357–1387`). Listen mit fehlendem oder nicht-ISO-Datum werden **behalten**, nicht verworfen (`:1362`, ausdrücklich: „dropping rows we cannot date would be a silent repair").

Mit `minDate = in_person_legal_date = 2026-07-31` (`data/format_window.json`) bleiben **gemessen**:
* **143 Listen** — alle aus **einem** Turnier (World Championships 2026, 2026-08-28);
* **27 Archetypen**, davon **12 mit ≥ 3 Listen** (unter 3 verweigert der Bau, `MIN_WEIGHTED_LISTS = 3`, `:159`);
* die zehn größten: Dragapult 22, Ogerpon Box 18, Alakazam Dudunsparce 14, N's Zoroark 12, Dragapult Blaziken 11, Slowking 11, Dragapult Dusknoir 8, Crustle 8, Mega Excadrill 8, Festival Lead 5.

Ohne Formattor: 1.201 Listen, 52 Archetypen, 32 davon mit ≥ 3 Listen.

### 3.3 Gewichtung je Liste

`Listengewicht = Platzierungsgewicht × Turniergrößengewicht` (`js/deck-builder-consistency.js:246–252`).

**Platzierungsgewicht** (`:215–235`) ist das **Maximum** aus zwei Skalen:

*absolut* (`PLACEMENT_WEIGHT_BANDS`, `:62–68`):

| Platz | Gewicht |
|---|---|
| ≤ 4 | **1,0** (Top-4 voll) |
| ≤ 8 | 0,7 |
| ≤ 16 | 0,5 |
| ≤ 32 | **0,3** (Day-2-Cut eines typischen Regionals) |
| darüber | **0,1** (Day-1-Boden) |

*feldrelativ* (`PLACEMENT_PERCENTILE_BANDS`, `:135–142`), Quantil `q = Platz / Feldgröße`:

| q ≤ | Gewicht |
|---|---|
| 0,01 | 1,0 |
| 0,02 | 0,8 |
| 0,05 | 0,6 |
| 0,10 | 0,4 |
| 0,25 | 0,2 |
| darüber | 0,1 |

```
gewicht = max( absolut(Platz), perzentil(Platz / Feldgröße) )
```
Bei unbekannter Feldgröße (0) **oder** ungültigem Platz gilt nur die absolute Skala (`:227–228`).

Damit ist die Aussage im Oberflächentext `deck.algoHintBody` — *„Top-4 voll gewichtet, Day-2 ≈ 30 %, Day-1 ≈ 10 %"* — nur die **absolute** Hälfte. Belegt im Quelltext: `js/deck-builder-consistency.js:62–68` für die drei genannten Zahlen (1,0 / 0,3 / 0,1), `:135–142` für die feldrelative Ergänzung.

**Turniergrößengewicht** (`:237–241`): `min(1,0; ln(Spieler) / ln(2000))`, Boden 0,5 bei unbekannter Größe (`SIZE_WEIGHT_FLOOR`, `:148`).
Für die drei Turniere ergibt das: Turin `ln(2032)/ln(2000) = 1,00`, NAIC `1,00` (gekappt), Worlds `ln(774)/ln(2000) = 0,875`.

### 3.4 Kartenbewertung

`_computeCardScores` (`js/deck-builder-consistency.js:536–673`), je Karte:

```
weightedShare    = Σ Gewicht der Listen, die die Karte spielen  /  Σ Gewicht aller Listen
weightedAvgCount = Σ (Gewicht × Kopien)  /  Σ Gewicht der Listen, die sie spielen
topCutFreq       = Gewicht der Top-8-Listen mit der Karte  /  Gewicht aller Top-8-Listen
```
Vor der Aggregation wird **je Liste** über den normalisierten Kartennamen zusammengefasst (`:562–589`) — sonst würde eine über zwei Drucke gesplittete Energie die Liste doppelt zählen und `weightedShare` über 100 % treiben.

### 3.5 ACE SPEC

`_pickAceSpec` (`js/deck-builder-consistency.js:689–753`):
1. Kandidaten = alle Karten mit `is_ace_spec` und `weightedShare > 0`, absteigend nach `weightedShare`.
2. Kein Kandidat → Deck ohne ACE SPEC, mit Protokolleintrag (`:696–700`).
3. Genau einer → dieser.
4. `Abstand = Führender − Zweiter`. Ist `Abstand ≥ ACE_SPEC_TIEBREAK_WINDOW` → Führender (`:716`).
5. Sonst: aus den ersten vier nach `topCutFreq` entscheiden (`:743–744`).

`ACE_SPEC_TIEBREAK_WINDOW = 0,10` (`:155`).
Die Erkennung läuft über **`data/ace_specs.json`** (39 Namen, `timestamp 2026-02-18`), geladen in `_loadAceSpecNames` (`:280–303`); die CSV-Spalte gilt als Vorrang, wenn sie gefüllt ist (`:418–421`).

**BEFUND B6 — der Spielraum steht dreimal verschieden im Quelltext.**
`js/deck-builder-consistency.js:8–11` sagt *„within ±5 pp (the 45-55 % range the maintainer named)"*, `:154` sagt *„Δ ≤ 10 pp"*, und der Wert ist `0.10` = 10 pp. Der Protokolltext `:739` schreibt korrekt „10 pp". Die Spezifikation oben in derselben Datei widerspricht dem Code.

**BEFUND B7 — der Kommentar zur CSV-Spalte `is_ace_spec` ist überholt.**
`js/deck-builder-consistency.js:199–210` schreibt: *„30.08.2026 nachgemessen … 26.760 Zeilen: 1.058 Yes, 25.691 No, 11 leer"*, und `:271–275` sagt sogar, die Spalte sei *„empty for every row"*. **Gemessen heute an derselben Datei: 30.459 Zeilen — 1.201 „Yes", 29.247 „No", 11 leer.** Beide Kommentare beschreiben einen anderen Bestand. Die Zeile `:270–275` („empty for every row") ist damit doppelt falsch.

### 3.6 Core, Tech, 60 Karten

**Core** (`_buildCore`, `js/deck-builder-consistency.js:822–908`):
* Schwellen der Reihe nach `0,90 → 0,85 → 0,80` (`CORE_THRESHOLDS`, `:151`); die erste, bei der **mindestens 12** verschiedene Karten übrig bleiben (`CORE_MIN_DISTINCT_CARDS`, `:152`), gewinnt.
* Bleibt auch bei 0,80 weniger übrig, wird mit 0,80 gebaut und im Protokoll gewarnt (`:833–846`).
* Kopien = `round(weightedAvgCount)`, mindestens 1, gedeckelt auf 4 — Basis-Energien auf 59 (`:861–866`).

**Tech-Pakete** (`_detectTechPackages`, `:918ff`): zwei Karten gelten als Paket, wenn sie in ≥ **70 %** der Listen gemeinsam vorkommen, in denen eine von beiden steht (`TECH_PACKAGE_COOCCURRENCE = 0,70`, `:157`). Pakete werden gemeinsam genommen oder gemeinsam verworfen.

**Auffüllen:** `slotsRemaining = 60 − (ACE SPEC + Core)`; ist er > 0, füllt `_selectTechCards` (`:1021ff`) auf.

**Kürzen** (`_trimToSixty`, `:1226–1258`): solange über 60, wird der Karte mit dem **kleinsten `weightedShare`** eine Kopie genommen. Der ACE-SPEC-Platz ist geschützt (`:1233`). Auf 0 gefallene Einträge werden entfernt.

### 3.7 `consistency_score`

**In `js/deck-builder-consistency.js` gibt es kein Feld dieses Namens.** Er entsteht erst im Aufrufer, und zwar an drei Stellen mit **zwei verschiedenen Rechnungen**:

| Ort | Rechnung |
|---|---|
| `js/app-deck-builder.js:7610` | `Math.round(share · 100)` — aus `share_percent` (0…1) |
| `js/app-deck-builder.js:7685` | `Math.round(c.weightedShare · 100)` — direkt aus 3.4 |
| `js/app-deck-builder.js:9463`, `:10631` | `Math.round(c.consistencyScore)` — ein anderswo berechneter Wert |

Angezeigt wird er als `score {n}` (`js/app-deck-builder.js:3516`, `:3963`) und ist erster Sortierschlüssel der Tauschbank (`:3911`).
**UNKLAR:** woher `c.consistencyScore` in `:9463` / `:10631` stammt, ist aus diesen Zeilen allein nicht zu belegen; die Definition liegt außerhalb der hier gelesenen Stellen.

### 3.8 Stichprobengröße und Stand

* **Grundgesamtheit:** 30.459 Zeilen / 1.201 Listen / 3 Turniere / 52 Archetypen.
* **Wirksam im laufenden Format (minDate 2026-07-31):** 143 Listen / 1 Turnier / 27 Archetypen / 12 baubar.
* **Stand:** jüngste Zeile 2026-08-28 (Worlds 2026); Datei zuletzt geschrieben 2026-09-06 07:05.

**BEFUND B8 — die Spalte `type` ist nicht mehr leer.**
`js/deck-builder-consistency.js:1466–1470` schreibt: *„`l.cards[].type` kommt aus der Spalte `type` … und die ist in ALLEN 30.459 Zeilen leer (gemessen)"*. **Gemessen heute: 0 von 30.459 Zeilen sind leer** — die Spalte ist vollständig gefüllt. Die daran hängende Diagnose (`kategorien = {"Pokemon":{…,"gebaut":60}}`, `_unbestimmt`) und der Rückfall in `_kategorieDeckung` (`:1524–1533`) beruhen auf einem Bestand, den es nicht mehr gibt.

---

## 4. Tech-Cut-Logik

### 4.1 Tech-Ideen (`js/tech-ideen.js`)

```
Quellen   data/current_meta_card_data.csv          (Kandidatenkreis)
          data/limitless_online_decks_matchups.csv (welche Matchups schlecht sind)
          data/card_capability_patterns.json       (Kartentext → Fähigkeitsmarke)
          data/card_capability_interactions.json   (Regelbasis)
          pokemon_card_effects.json                (Kartentexte, über _loadCardEffectsIndex)
Rechnung  js/tech-ideen.js:245-460
Anzeige   Warum-Dialog des Deckbaus, Block „IDEE"
```

**Schwellen** (jede eine bewusste Entscheidung, `js/tech-ideen.js:71–148`):

| Konstante | Wert | Zeile | Begründung im Quelltext |
|---|---|---|---|
| `PRO_GEGNER` | 3 | `:71` | „Mehr als drei liest niemand" |
| `SCHLECHT_AB` | **47,0 %** | `:76` | nicht 50 %: „bei 48-49 % entscheidet die Spielstärke, nicht die Kartenwahl" |
| `MIN_PARTIEN` | **30** | `:82` | dreifache Heatmap-Schwelle (dort 10), „weil hier eine EMPFEHLUNG daran hängt" |
| `MAX_GEGNER` | 3 | `:148` | „Drei Überschriften mit je drei Karten sind neun Zeilen" |

**Auswahl der schlechten Gegner** (`_schlechteGegner`, `:245–255`):
```
quote < 47,0  UND  partien >= 30  UND  Gegner hat Karten im Kartenbestand
→ aufsteigend nach quote sortiert, OHNE Kappung
```
Erst danach wird gefiltert, ob der Gegner überhaupt eine Karte trägt, an der eine Regel greifen könnte (`_hatAnsatzpunkt`, `:151–169`), und **dann** auf `MAX_GEGNER` gekappt (`:349`). Die Reihenfolge „erst prüfen, dann kappen" ist ausdrücklich begründet (`:341–366`): die frühere Fassung kappte zuerst und ließ dadurch den einzigen Gegner mit einem Ansatzpunkt (Toucannon, Platz 6) ungeprüft.

**Regelbasis** (`data/card_capability_interactions.json`, gemessen):
* `version` = **0.1**
* `generated_at` = **2026-05-15**
* `interactions` = **5 Paarungen**, davon 3 mit `result: attacker_wins` und `attacker: attack.ignores_effects`, eine `defender_wins`, eine `neutral`.
* `matchup_value` reicht von −3 bis +10 Prozentpunkten.

Nur `result === 'attacker_wins'` erzeugt eine Verteidiger-Marke (`js/tech-ideen.js:223–226`); es bleiben also **3 wirksame Regeln**.

**Kandidatenkreis:** `data/current_meta_card_data.csv` — 4.402 Zeilen, **517 verschiedene Kartennamen**, 570 verschiedene `(set, number)`-Paare, 62 Archetypen (gemessen). Der Kommentar `js/tech-ideen.js:60–61` nennt „517 Stück" — **das stimmt** (Kartennamen, nicht Zeilen).

**Was bei leerem Ergebnis passiert** (`js/tech-ideen.js:352–357`, `:427–443`):
* Gegner ohne Ansatzpunkt **oder** ohne Treffer fallen aus `gegner` heraus und landen vollständig in `ohneIdee` — mit Name, Quote und Partienzahl.
* Bei komplett leerem Ergebnis kommt `{stand, gegner: [], ohneIdee: [alle schlechten Matchups]}` zurück.
* `stand` trägt Version, Datum und Zahl der Paarungen, damit die Oberfläche die Abdeckung hinschreiben kann (`datenstand()`, `:463–477`).
* Bei einem Fehler in der Kette: `console.warn('[TechIdeen] nicht gerechnet:', …)` und dasselbe leere Ergebnis (`:457–460`).

Der Quelltext dokumentiert den Anlass für `ohneIdee` als Befund vom 06.09.2026 (`:262–284`): für Mega Excadrill zeigte der Baustein einen Gegner (Toucannon, 2,55 % des Feldes) und verschwieg drei, an denen das Deck wirklich scheitert — Alakazam Dudunsparce 25,6 % / 743 Partien, Slowking 37,3 % / 811, Dragapult Blaziken 38,7 % / 833, zusammen 17,1 % des Feldes. Alle drei erfüllen beide Schwellen; sie fielen nur heraus, weil die Regelbasis nichts zu ihnen kennt.

### 4.2 Anti-Tech (`js/app-anti-tech.js`)

```
Quellen   window.currentMetaMatchupData  (aus data/limitless_online_decks_matchups.csv)
          data/active_threats.json
          MetaCall.getPredictedField()   (Schnellauswahl)
Anzeige   „Build vs …" (antiTech.buildVsBtn), zweistufiger Dialog
```

**Schwellen:**

| Konstante | Wert | Zeile |
|---|---|---|
| `QUICK_PICK_LIMIT` | 12 | `js/app-anti-tech.js:41` |
| `TECH_SLOTS_HARD_CAP` | 10 | `:42` |
| WR-Farbklassen | ≥60 stark positiv · ≥53 positiv · ≥47 neutral · ≥40 negativ · sonst stark negativ | `:83–90` |

`SCHLECHT_AB`, `MIN_PARTIEN`, `MAX_GEGNER` und `PRO_GEGNER` gibt es in `js/app-anti-tech.js` **nicht** — die vier Schwellen leben ausschließlich in `js/tech-ideen.js`. Beide Module benutzen aber dieselbe Grenze 47 %: einmal als Trennlinie „schlecht" (`tech-ideen.js:76`), einmal als untere Kante der neutralen Farbe (`app-anti-tech.js:87`).

**Abschluss:** die gewählten Karten werden nach `techSlots[source]` geschrieben (Zwangsliste, die der Consistency-Bau respektiert) und danach läuft `autoCompleteConsistency` auf derselben Quelle (`js/app-anti-tech.js:10–15`).

**BEFUND B9 — der Nullwert-Kommentar zählt einen alten Bestand.**
`js/app-anti-tech.js:114–120` schreibt: *„51 von 1491 Zeilen in limitless_online_decks_matchups.csv haben win_rate = 0, verteilt auf 32 Decks"*. **Gemessen heute: 1.702 Zeilen, davon 59 mit `win_rate = 0`, verteilt auf 32 Decks.** Die Deckzahl stimmt, die beiden anderen Zahlen nicht.

### 4.3 Stichprobengröße und Stand

* Matchup-Grundlage: **1.702 Paarungen** über **100 Decks**, zusammen **129.931 gezählte Partien** (jede Paarung steht in beiden Richtungen → ≈ 64.966 verschiedene Partien). Median 19 Partien je Paarung; 856 Paarungen (50 %) unter 20, 563 (33 %) unter 10.
* Abdeckung: 100 Decks → 9.900 mögliche geordnete Paare, belegt sind 1.702 = **17,2 %**.
* Regelbasis: 5 Paarungen, davon 3 wirksam, vom 2026-05-15.
* Stand: Matchup-Datei 2026-09-04.

---

## 5. Tag-2-Wahrscheinlichkeit (`calcDay2`)

```
Rechnung  js/app-meta-call.js:8685-8748
Eingänge  field (Deckliste mit finalShare), getMatchup / getBaseMatchup,
          _settings.rounds, _settings.day2Points, _unentschiedenQuote()
Anzeige   mc.day2Chance „Day-2-Chance", mc.histTitle „Punkteverteilung nach {r} Runden"
```

### 5.1 Punktvergabe

Turnierpunkte, nicht Siege: **Sieg 3 · Unentschieden 1 · Niederlage 0** (`js/app-meta-call.js:8727–8729`). Der Zustandsraum ist `0 … rounds·3` (`maxPts`, `:8710`).

### 5.2 Die Markow-Kette

```javascript
dp = Float64Array(maxPts+1);  dp[0] = 1.0
für jede Runde r:
    newDp = Float64Array(maxPts+1)
    für jeden Punktestand pts mit dp[pts] >= 1e-14:
        für jedes Deck im Feld:
            share = deck.finalShare / 100          // < 1e-9 wird übersprungen
            m = Paarung(myDeck, deck)              // Spiegel: pWin .45 / pTie .10 / pLoss .45
            newDp[pts+3] += dp[pts] · share · m.pWin
            newDp[pts+1] += dp[pts] · share · m.pTie
            newDp[pts  ] += dp[pts] · share · m.pLoss
    dp = newDp

day2Prob = Σ dp[pt] für pt = day2Points … maxPts
```
(`js/app-meta-call.js:8711–8737`)

**Die Kette nimmt an, dass der Gegner in jeder Runde neu aus dem Feld gezogen wird** — Swiss-Pairing gibt es im Modell nicht. Genau das steht als Warnung in der Oberfläche (`mc.swissNote`: „Ab Runde 4–5 trifft Swiss-Pairing Spieler mit ähnlichem Ergebnis").

**Erwartete Bilanz** (`:8740–8747`): `expWin = Σ rounds · share · pWin`, entsprechend `expTie` und `expLoss`. Die drei summieren sich auf `rounds`.

**Voreinstellungen je Turniertyp** (`js/app-meta-call.js:999–1003`):

| Typ | Spieler | Runden | Zielpunkte | Top Cut |
|---|---|---|---|---|
| Worlds | 800 | 8 | 16 | — |
| Regional/SPE | 2.000 | 8 | 16 | — |
| International | 3.000 | 8 | 16 | — |
| Lokale Challenge | 24 | 5 | 13 | 0 |
| Lokaler Cup | 32 | 5 | 12 | 8 |

### 5.3 Woher `pWin` / `pTie` / `pLoss` je Paarung kommen

`getBaseMatchup(deckA, deckB)` (`js/app-meta-call.js:8187–8420`), von unten nach oben:

**(a) Sonderfall „Sonstige":** `pWin = eingestellte Others-Quote`, `pTie = 0,02` (`:8188–8191`).

**(b) Vergangenes Meta** (`_metaSource === 'past'`, `:8206–8230`): **ausschließlich** `_majorMatchupMap[<Format>]`, Mindestzahl `MAJOR_MATCHUP_MIN_GAMES_PAST = 3` (`:108`). Kein Treffer → ehrliches `{0,50 / 0,02 / 0,48}`. Die Online-Matrix wird bewusst **nicht** eingemischt (`:8194–8205`).

**(c) Laufendes Meta — Grundwert aus der Online-Matrix** (`:8272–8276`):
```
hit = _matchupMap[a][b]
sonst rev = _matchupMap[b][a], gespiegelt (pWin↔pLoss)
sonst { pWin: 0,50, pTie: 0,02, pLoss: 0,48, partien: 0, ohneMessung: true }
```
Die Marke `ohneMessung` ist der Befund vom 05.09.2026 (`:8232–8252`): Predictor 5.3 schob seine Korrektur vorher auch auf diesen Platzhalter, wodurch Zahlen wie „Seaking Festival Lead WR 7 %" entstanden, obwohl **keine einzige Partie** vorliegt. Gemessener Umfang: **33,5 % des erwarteten Gegnerfelds hat online keine Quote.**

**(d) Drei-Quellen-Mischung** (`:8341–8390`), wenn für das laufende Format Major-Daten vorliegen:

| Quelle | Gewicht | Mindestpartien | Zeile |
|---|---|---|---|
| Day-2 | **0,45** | 5 | `:81`, `:97` |
| Day-1 | **0,35** | 5 | `:82`, `:96` |
| Online | **0,20** | — | `:83` |
| *Overall (Rückfall, wenn weder Day-1 noch Day-2 qualifiziert)* | **0,80** = 0,35 + 0,45 | 10 | `:89`, `:95` |

Fehlende Quellen werden **anteilig umverteilt**, nicht ersetzt: `blendedWin = Σ win · (weight / Σ weight)` (`:8378–8383`), danach `clip(0,05; 0,95)`.
Der `pTie` der Mischung ist der Online-`pTie`, ersatzweise `MAJOR_MATCHUP_TIE_RATE = 0,02` (`:8396`).
Der ausgewiesene Nenner ist Online-Partien **plus** die eingeflossenen Major-Partien (`:8399`).

**Spiegelung** (`_lookupPair`, `:8309–8340`): fehlt `A→B`, wird `B→A` verwendet — aber **nur**, wenn die Gegenrichtung eine Bilanz trägt. Reine Matchpunkte werden nicht gespiegelt (`:8320`), weil `wp(A,B) + wp(B,A) = 100 − 100·U/(3n)` und die Spiegelung dort im Mittel um 3,54 pp, maximal 10,26 pp überschätzt. Mit `S/(S+N)` summieren sich beide Richtungen exakt auf 100.

**(e) Predictor 5.3** schiebt zum Schluss `(adjA − adjB)/2` auf `pWin` — außer bei ungemessenen Paaren (`:8232–8252`, angewandt ab `:8402`).

### 5.4 Glättung (`js/matchup-glaettung.js`)

**Formel** (`:82–88`):
```
alpha = Siege + k/2
beta  = Niederlagen + k/2
Quote = alpha / (alpha + beta) · 100          mit k = K = 20  (js/matchup-glaettung.js:56)
```
Bei `Siege + Niederlagen = 0` kommt **50** heraus (`:86`).
Wirkung laut Quelltext (`:35–38`): 3-0 → 56,5 %, 0-4 → 41,7 %, 60-40 auf 100 Partien → 58,3 % (statt 60,0).

`k = 20` ist bewusst dieselbe Größenordnung wie `THIN_GAMES` in `js/app-archetype-card.js` (`js/matchup-glaettung.js:52–55`).

**Wo die Glättung greift:**

| Ort | Zeile |
|---|---|
| Archetyp-Karte | `js/app-archetype-card.js:393` |
| Heatmap (Startseite) | `js/app-current-meta.js:120`, `:546` |
| Meta-Karten | `js/app-meta-cards.js:1354` |
| **Major-Matrix des Meta Calls** | `js/app-meta-call.js:7661–7666` |
| EV-Rechner | `js/ds-ev-rechner.js:147` |
| Beitragsquellen | `js/ds-post-quellen.js:485` |

Im Meta Call wird sie bei der Aggregation der Major-Paarungen angewandt (`_collapseAgg`, `js/app-meta-call.js:7644–7695`): liegt eine Bilanz vor, `winPct = DsGlaettung.quote(S, N)` mit Konvention `ohneUnentschieden`; liegt keine vor, `winPct = punkteSumme / games` mit Konvention `matchpunkte` und der Marke `nurPunkte: true`.

**Die Online-Matrix des Meta Calls wird NICHT geglättet.** `_matchupMap` entsteht in `js/app-meta-call.js:7371–7405` unmittelbar aus der CSV, ohne einen Aufruf von `DsGlaettung`. Siehe Befunde B20 und B21.

`varianz()` (`:95–102`) wird berechnet, aber nirgends angezeigt (`:90–94`).

### 5.4b Wie `_matchupMap` wirklich gebaut wird (`js/app-meta-call.js:7371–7405`)

```javascript
if (r.record enthält '-') {
    W, L, T aus record
    tot   = W + L + T
    pWin  = W / tot          // <-- S/(S+N+U), Konvention mitUnentschieden
    pTie  = T / tot
    pLoss = L / tot
} else {
    pWin  = win_rate / 100   // <-- S/(S+N), Konvention ohneUnentschieden
    pTie  = 0,02
    pLoss = 1 − pWin − pTie
}
partien = total_games, ersatzweise Summe aus record
```

**BEFUND B20 — die Matrix rechnet eine andere Konvention als die Spalte in derselben Datei.**
`data/limitless_online_decks_matchups.csv` trägt in `win_rate` `S/(S+N)` (nachgemessen: 0 Abweichungen in 1.702 Zeilen). Der Meta Call rechnet aus `record` dagegen `W/(W+L+T)` = `S/(S+N+U)`. **Gemessen: 523 von 1.702 Zeilen (30,7 %) weichen voneinander ab**, Median der Abweichung 0,93 pp, Maximum **26,67 pp**:

| Deck | Gegner | Bilanz | `W/(W+L+T)` | Spalte `win_rate` | Partien |
|---|---|---|---|---|---|
| Steven's Metagross | Cynthia's Garchomp | 2-1-2 | **40,00** | 66,67 | 5 |
| Dragapult Froslass | N's Zoroark | 3-2-2 | **42,86** | 60,00 | 7 |
| Dragapult | Alakazam Dudunsparce | 566-335-21 | **61,39** | 62,82 | 922 |
| Dragapult | Festival Lead | 488-321-14 | **59,30** | 60,32 | 823 |

Die Abweichung ist systematisch nach unten (Unentschieden im Nenner) und trifft auch die großen Stichproben. Die Heatmap zeigt für dasselbe Paar die CSV-Spalte, der Meta Call rechnet mit dem anderen Wert. Zusätzlich mischt der Rückfallzweig beide Konventionen in **einer** Karte: Zeilen ohne `record` bekämen `win_rate` direkt — heute greift der Zweig nicht (alle 1.702 Zeilen tragen einen `record`), aber die Karte trüge dann zwei Formeln.

**BEFUND B21 — die Glättung, die genau dafür gebaut wurde, greift auf diesem Pfad nicht.**
`js/matchup-glaettung.js:13–19` nennt als Anlass wörtlich zwei Zellen, die roh „100,0 %" und „0,0 %" zeigten. Im Meta Call gehen genau solche Werte **ungeglättet** in die Markow-Kette:

* **22 Paarungen** kommen als `pWin = 100 %` heraus, **59** als `pWin = 0 %` (gemessen; z. B. Blaziken Zoroark vs Raging Bolt Ogerpon 3-0-0, Mega Abomasnow vs Basic Box 0-5-0).
* Insgesamt **81 Paarungen** liegen bei ≥ 95 % oder ≤ 5 %.
* Der Deckel `_clip(…, 0,05, 0,95)` greift nur in zwei Zweigen: in der Major-Mischung (`js/app-meta-call.js:8384`) und in Predictor 5.3 — und Predictor 5.3 steigt vorher aus, wenn beide Korrekturen 0 sind (`:8427`: `if (adjA === 0 && adjB === 0) return base;`). Ein reines Online-Paar ohne Korrektur erreicht `calcDay2` also unverändert mit `pWin = 1,0`.

Die Major-Seite wird dagegen sehr wohl geglättet (`js/app-meta-call.js:7657–7666`). Damit stehen in derselben Rechnung eine geglättete und eine ungeglättete Quelle nebeneinander — und die ungeglättete trägt 20 % Gewicht, bei Paaren ohne Major-Daten 100 %.

### 5.5 Die Unentschieden-Quote

`_unentschiedenQuote()` (`js/app-meta-call.js:8646–8672`) und `_mitPraesenzUnentschieden()` (`:8674–8683`).

Der Meta Call rechnet immer ein **Präsenzturnier** — alle fünf Turniertypen sind Präsenzveranstaltungen. Deshalb wird jede Paarung vor dem Eintritt in die Kette auf die gemessene Präsenzquote umgestellt (`:8697–8709`):
```
pTie  = clip(Präsenzquote, 0, 0,5)
Rest  = 1 − pTie
pWin  = pWin_roh / (pWin_roh + pLoss_roh) · Rest      // Verhältnis S:N bleibt
pLoss = Rest − pWin
```
**Nur wenn wirklich gemessen** (`uq.gemessen`); sonst gehen die Paarungen unverändert durch (`:8707–8709`), und der Rückfall `MAJOR_MATCHUP_TIE_RATE = 0,02` steht mit dem Text `mc.day2UnentschiedenLeer` daneben.

**Messung (nachgeprüft):** in `data/labs_tournament_matchups.csv` trägt **nur `meta = TEF-PBL`** überhaupt eine Bilanz — 1.776 Zeilen, 5.451 S / 5.451 N / 1.340 U = 12.242 gezählte Partien. Weil jede Paarung von beiden Seiten steht, sind das **6.121 Partien** und eine Unentschieden-Quote von **10,946 %**. Der Quelltext nennt „10,95 %" und „6.121 Partien" (`js/app-meta-call.js:8625–8626`) — **stimmt exakt**.
Alle zwölf anderen Metas haben in dieser Datei 0 Partien in den Bilanzspalten.

**Zum Vergleich online** (gemessen an `data/limitless_online_decks.csv`): 2.248 U auf 174.954 Partien = **1,285 %**. Der Quelltext nennt 1,28 % (`:8623`) — **stimmt**.

**Wirkung**, im Quelltext nachgerechnet (`:8629–8634`): Day-2-Chance 12,9 % → 14,0 %, also **rund +1,1 pp**. Ausdrücklich festgehalten: die Lücke zur bei Worlds **gemessenen** Konversion von 25,0 % bleibt damit offen und ist ein eigener Befund.

Warum eine einzige Feldquote und nicht eine je Paarung: online liegt der Schnitt bei 1,28 %, die meisten Paarungen haben null Unentschieden; diese Nullen mit Faktor neun hochzuskalieren wäre „Rauschen mit Vorzeichen" (`:8635–8641`).

**Spiegel-Matchup:** fest `{pWin 0,45 / pTie 0,10 / pLoss 0,45}` (`:8724`), ebenfalls auf die Präsenzquote umgestellt.

### 5.6 Stichprobengröße und Stand

* Online-Matrix: 1.702 Paarungen / 100 Decks / ≈ 64.966 Partien, Stand 2026-09-04.
* Major-Matrix: 47.896 Zeilen über 13 Metas; mit Bilanz nur TEF-PBL (1.776 Zeilen, 6.121 Partien), Stand `scraped_at` 2026-09-04.
* Day-Split: `day_filter` = overall 39.098 · day1 6.769 · **day2 2.029** (gemessen). Die Day-2-Schicht ist mit 4,2 % der Zeilen die dünnste — und trägt mit 0,45 das größte Gewicht.
* Feld: bis zu 25 Decks + „Sonstige".

---

## 6. Matchup-Quoten / Heatmap — Online gegen Major

### 6.1 Zwei Matrizen

| | Online | Major |
|---|---|---|
| Quelle | `play.limitlesstcg.com/decks/<deck>/matchups/` | `labs.limitlesstcg.com` |
| Scraper | `backend/scrapers/limitless_online_scraper.py:330` | `backend/scrapers/labs_tournament_scraper.py:56` |
| Datei | `data/limitless_online_decks_matchups.csv` | `data/labs_tournament_matchups.csv` |
| Zeilen (gemessen) | **1.702** | **47.896** |
| Konvention der Spalte `win_rate` | `S/(S+N)` — 0 Abweichungen in 1.702 Zeilen | — |
| Konvention, mit der der Meta Call rechnet | **`S/(S+N+U)`** aus `record` (`js/app-meta-call.js:7382–7387`) — siehe B20 | `S/(S+N)` bei vorhandener Bilanz, sonst `matchpunkte` (`js/app-meta-call.js:7653–7672`) |
| Glättung | **keine** (B21) | `DsGlaettung.quote`, k = 20 (`js/app-meta-call.js:7661–7666`) |
| Unentschieden-Quote | 1,285 % | 10,946 % (nur TEF-PBL messbar) |
| Deckzahl | 100 | 13 Metas, je eigene Deckliste |

### 6.2 Mischverhältnis

Nur im Meta Call (`getBaseMatchup`, `js/app-meta-call.js:8341–8390`):
```
Day-2  0,45   (mind.  5 Partien)
Day-1  0,35   (mind.  5 Partien)
Online 0,20
```
Fehlt eine der beiden Major-Schichten, wird ihr Gewicht anteilig auf die übrigen verteilt. Fehlen **beide**, springt `Overall` mit **0,80** ein (mind. 10 Partien), Online bleibt bei 0,20 — die relative Aufteilung Major-zu-Online (80:20) hält also in beiden Pfaden.
Liegt für dieses Paar **gar keine** Major-Zeile vor, bleibt es beim reinen Online-Wert.

**Auf der Heatmap gibt es keine Mischung.** Jede Zelle trägt **beide Quellen untereinander** — eine Zeile online, eine Zeile Major, jede mit ihrer eigenen Win Rate und Partienzahl (`heatmap.desc`, `heatmap.legendeOnline`, `heatmap.legendeMajor`). Fehlt die Major-Seite, steht `heatmap.majorFehlt` („keine Major-Matches für diese Paarung"). Das ist die Umsetzung der Hausregel „was getrennt bleibt" aus `#quellen`.

### 6.3 Formatschlüssel

Die Major-Matrix ist nach `meta` geschlüsselt, und diese Spalte enthält nur Paarschlüssel wie `TEF-CRI` oder `SVI-MEG`, nie ein bloßes `PBL` (`js/app-meta-call.js:8276–8292`). Der Schlüssel für das laufende Format wird deshalb so gesucht (`:8295–8308`): erst `_activeMetaKeyVoll`, wenn dessen letztes Segment `current_set` ist; sonst irgendein Schlüssel, dessen letztes Segment `current_set` ist; sonst `current_set` selbst.
**Mit `current_set = PBL` findet der Rückfall `TEF-PBL`** — und dieses Meta trägt gemessen 1.776 Matchup-Zeilen. Der Blend kann heute also greifen. Der Kommentar `:8286–8294` („Heute fällt das nicht auf, weil ohnehin keine Major-Matchups für das laufende Format vorliegen") beschreibt einen überholten Zustand — siehe Befund B12.

### 6.4 Glättung

Siehe 5.4. `k = 20`, Prior 50 %, Beta-Binomial. Der Rohwert bleibt im Tooltip erhalten (`heatmap.raw` = „roh", `js/matchup-glaettung.js:40–41`).

### 6.5 Stichprobengröße und Stand

* Online: 1.702 Paarungen, 100 Decks, 9.900 mögliche geordnete Paare → **17,2 % abgedeckt**. Median 19 Partien; 856 unter 20, 563 unter 10.
* Major: 47.896 Zeilen, davon mit auswertbarer Bilanz 1.776 (TEF-PBL). Day-2-Schicht: 2.029 Zeilen.
* Stand beider Matrizen: 2026-09-04.

**BEFUND B10 — die Kennzahlen im Kopf von `js/matchup-glaettung.js` sind überholt.**

| Größe | Kommentar `:4–11` (19.08.2026) | Messung heute |
|---|---|---|
| Paarungen mit Daten | 1.546 | **1.702** |
| Decks | 100 | 100 ✓ |
| Abdeckung | 16 % | **17,2 %** |
| Median Partien je Paarung | 16 | **19** |
| unter 20 Partien | 858 (55 %) | **856 (50 %)** |
| unter 10 Partien | 564 (36 %) | **563 (33 %)** |

Dasselbe gilt für `js/win-rate-konvention.js:31–32` („in 0 von 1.546 Zeilen weicht deren win_rate ab") — die Aussage stimmt weiterhin, die Zeilenzahl ist **1.702**.

---

## 7. Day-2-Konversion und D2-WR im Meta Call

### 7.1 Day-2-Konversion (`day2Conv`)

```
Quelle    labs.limitlesstcg.com
Datei     data/labs_tournament_decks.csv  (day1_players, day2_players, day1_to_day2_conv)
Rechnung  js/app-meta-call.js:1614   const day2Conv = agg.day1 > 0 ? agg.day2 / agg.day1 : 0
Anzeige   mc.d2ConvLabel „Day-2-Major-Conversion", mc.histD2Conv „D2-Conv.",
          Spalte mc.frozenColDay2Conv „Day-2-Conv"
```
**Formel:** `Day-2-Konversion = Day-2-Spieler / Day-1-Spieler`, je Deck über alle Turniere eines Metas aufsummiert (`js/app-meta-call.js:1544–1580`).

**Recency-gewichtet** für den Prognoseeinsatz: `_labsDay2ConvByDeck[k]` mit `_rankWeightedConv(q)` (`js/app-meta-call.js:3767–3770`), Feldmittel `_meanDay2Conv`. Angezeigt als `d.day2ConvAvg` bzw. `d.day2ConvFieldMean` (`:4001–4002`), beide auf eine Nachkommastelle gerundet.

**Wo sie in die Empfehlung eingeht:** 70/30-Mischung — `blendedDay2 = 0,7 · simulierte Day-2-Chance + 0,3 · empirische Konversion` (`js/app-meta-call.js:8968–8979`). Begründung im Quelltext: bei LA waren die simulierten Top-5 alle Nischenpicks, die ihre Vorhersage um ~7 pp verfehlten, während Dragapult-Family mit der tatsächlich besten Konversion (26,4 %) gar nicht in der Liste stand.

**Gewichtung nach Majors, nicht nach Gewichtsmasse** (`:8981–8993`): `q.n` ist die Summe der Recency-Gewichte, kein Zähler. Der frühere Test las sie als Turnierzahl — 24 Decks mit zwei Majors kamen so auf `n = 1,0` und bekamen 15 % statt 30 % Gewicht, 12 Decks mit einem Major auf `n = 0,5` und fielen an `>= 1` ganz heraus.

**Warnung zum Nenner** (`js/app-past-meta.js:1904–1916`): in `labs_tournament_decks.csv` tragen 74 Zeilen eine Konversion von genau 100 % — 65 davon auf **einem** Spieler, acht auf zweien, eine auf vieren. Eine Quote braucht einen sichtbaren Nenner. (Der Kommentar nennt „74 von 4.667 Zeilen"; die Datei hat heute **4.711** Zeilen — siehe B11.)

**Stichprobe:** 4.711 Deckzeilen über 71 Turniere; für das laufende Format `TEF-PBL` 44 Zeilen.
**Stand:** jüngstes Turnier 2026-08-28.

**Offene Lücke, im Quelltext ausdrücklich stehengelassen** (`js/app-meta-call.js:8633–8636`): die Kette liefert nach der Unentschieden-Korrektur 14,0 %, bei Worlds gemessen wurden **25,0 %**. Diese Differenz wird nicht weggerechnet.

### 7.2 Day-2-Win-Rate (D2-WR)

```
Datei     data/labs_tournament_decks.csv  (day2_wins, day2_losses, day2_ties, day2_players)
Aufbau    js/app-meta-call.js:7052-7085
Aggregat  js/app-meta-call.js:8917-8921   return q.sum / q.n     // 0..100
Anzeige   mc.d2WrLabel „Ø Day-2-Win Rate (vorliegende Majors)",
          mc.d2WrSample „n = {n} Major(s)", mc.histD2Wr „D2-WR"
```
**Definition:** der Anteil der **Partien**, die ein Deck gewinnt, **nachdem** es den Cut erreicht hat (`mc.d2WrTooltip`: „Siege je gespielter Partie", recency-gewichtet).
**Aufnahmebedingung:** `day2Wr != null && day2Wr > 0 && day2Players >= 5` (`js/app-meta-call.js:7063`).

**Multiplikator** (`_d2WrMultiplier`, `js/app-meta-call.js:8938–8946`):
```
roh = 1,0 + (d2WrPct − 50) / 10
bei majors <= 1:  roh = 1,0 + (roh − 1,0) · 0,5      // halber Ausschlag bei einer Beobachtung
Ergebnis = clip(roh, 0,4, 1,6)
```
Wertetabelle aus dem Quelltext (`:8928–8933`): 35 % → 0,40 · 45 % → 0,50 · **50 % → 1,00** · 55 % → 1,50 · ≥65 % → 1,60 (gekappt).
Validierung im Quelltext (`:8934–8937`): Festival Lead 47,5 % → ×0,75; Basic Box 55,5 % → ×1,55.

**Zahl der Majors** (`_d2WrMajors`, `js/app-meta-call.js:8949–8953`): die Zahl **verschiedener** Turnier-Kennungen (bzw. Daten) in den Stichproben — nicht die Gewichtsmasse.

**Stichprobe:** nur Zeilen mit `day2_players >= 5`. Über die ganze Datei stehen 4.711 Zeilen zur Verfügung; wie viele davon die Schwelle je Deck erfüllen, hängt vom gewählten Meta ab — für eine feste Zahl müsste die Auswahl je Deck ausgezählt werden. **UNKLAR** als Gesamtzahl.
**Stand:** 2026-08-28.

---

## 8. Kartenpreise

```
Quelle    Cardmarket — täglicher Price Guide (data/price_guide_6.json, Spiel-ID 6 = Pokémon)
          Rückfall: der zuvor von Limitless gescrapte Wert
Scraper   backend/scrapers/cardmarket_price_merger.py:5-17
Mapping   backend/scrapers/cardmarket_id_mapper.py → data/cardmarket_id_mapping.csv
Datei     data/price_data.csv
Zuordnung Schlüssel (set, number) — plus die Cardmarket-Produkt-ID, wo vorhanden
Anzeige   Kartenzeile in #cards, #current-analysis, #city-league-analysis, #past-meta
          (legend.lpPrice, tip.estimatedPrice); Sammlungswert in #profile
          (profile.collectionValue); Preisalarme über scripts/send_price_alerts.py:300
```

**Formel:** `eur_price` ist der **Trend**-Preis von Cardmarket, `eur_low` der Tiefstpreis; die Merge-Regel steht in `backend/scrapers/cardmarket_price_merger.py:6–7` — liegt ein Mapping vor **und** hat der Price Guide einen Eintrag, gewinnt Cardmarket; sonst bleibt die bestehende Zeile stehen.

**Zuordnung ausdrücklich nicht über den Namen.** Die Hausregel steht in `js/app-quellen.js:61–64`: *„Verknüpft wird über Set und Kartennummer oder die Cardmarket-Produkt-ID, nie über den Namen — Namen sind innerhalb eines Sets nicht eindeutig."* **Gegengemessen:** `data/price_data.csv` hat 20.419 Zeilen und **20.419 verschiedene `(set, number)`-Paare** — der Schlüssel ist tatsächlich eindeutig.

**Stichprobengröße (gemessen an `data/price_data.csv`):**

| | Zeilen |
|---|---|
| **gesamt** | **20.419** |
| mit `eur_price` | 20.387 (32 ohne) |
| `price_status = ok` | 16.140 |
| `price_status = stale` | 3.026 |
| `price_status = unverified_mapping` | 1.159 |
| `price_status = trend_below_low` | 61 |
| `price_status = no_trend` | 26 |
| `price_status = no_data` | 7 |
| `mapping_status = ok` | 16.009 |
| `mapping_status = unmapped` | **3.033** |
| `mapping_status = unverified` | 1.187 |
| `mapping_status = collision` | **190** |

**Stand:** jüngstes `last_updated` = **2026-09-06T08:10:23**, ältestes 2026-03-16T06:01:22 — die Spanne von rund einem halben Jahr ist genau das, was `price_status = stale` (3.026 Zeilen) markiert. 3.002 verschiedene Zeitstempel.

**Was zu prüfen bleibt:** ob die 3.033 nicht zugeordneten und die 190 kollidierenden Karten in der Oberfläche als solche kenntlich sind oder stillschweigend mit dem Rückfallwert erscheinen — insbesondere im Sammlungswert (`profile.collectionValue`), wo sie den Gesamtwert lautlos senken oder verfälschen würden. Siehe Testmatrix F245 und F327.

---

## 9. Sammlung der Widersprüche (Kommentar sagt X, Messung sagt Y)

| Nr | Ort | Kommentar behauptet | Messung heute |
|---|---|---|---|
| **B3** | `backend/scrapers/current_meta_analysis_scraper.py:748–756` | `_win_pct` rechnet seit 05.09.2026 Matchpunkte | `data/online_best_decklists.json` trägt in **allen 11** Einträgen mit Unentschieden `(S+0,5·U)/Partien` — die verworfene vierte Konvention |
| **B6** | `js/deck-builder-consistency.js:8–11` gegen `:154–155` | ACE-SPEC-Spielraum „±5 pp (45–55 %)" | Konstante ist `0.10` = **10 pp**; `:154` und `:739` sagen ebenfalls 10 |
| **B7** | `js/deck-builder-consistency.js:199–210` und `:271–275` | `is_ace_spec`: 26.760 Zeilen (1.058 Yes / 25.691 No / 11 leer); an anderer Stelle „empty for every row" | **30.459 Zeilen: 1.201 Yes / 29.247 No / 11 leer** |
| **B8** | `js/deck-builder-consistency.js:1466–1470` | Spalte `type` „in ALLEN 30.459 Zeilen leer" | **0 von 30.459 Zeilen leer** — die Spalte ist vollständig gefüllt |
| **B9** | `js/app-anti-tech.js:114–120` | „51 von 1491 Zeilen … win_rate = 0, verteilt auf 32 Decks" | **59 von 1.702 Zeilen**, verteilt auf **32 Decks** (nur die Deckzahl stimmt) |
| **B10** | `js/matchup-glaettung.js:4–11` | 1.546 Paarungen, 16 % Abdeckung, Median 16, 858 unter 20, 564 unter 10 | **1.702 Paarungen, 17,2 %, Median 19, 856 unter 20, 563 unter 10** |
| **B11** | `js/win-rate-konvention.js:20–21`, `js/app-past-meta.js:1906` | „4.667 Zeilen von labs_tournament_decks.csv" | **4.711 Zeilen** (die Aussage über die maximale Abweichung von 0,005 pp gilt weiterhin — nachgemessen) |
| **B11b** | `js/win-rate-konvention.js:31–32` | „0 von 1.546 Zeilen" in der Online-Matchup-Datei | **0 von 1.702 Zeilen** — Aussage hält, Zeilenzahl überholt |
| **B12** | `js/app-meta-call.js:8286–8294` | „Heute fällt das nicht auf, weil ohnehin keine Major-Matchups für das laufende Format vorliegen" | `meta = TEF-PBL` hat **1.776 Matchup-Zeilen** und **44 Deckzeilen**; über den Rückfall (letztes Segment = `current_set` = PBL) findet der Blend sie. Der beschriebene Zustand ist eingetreten |
| **B13** | `js/app-tier-meta.js:45` gegen `:71` | „prior: 30 games at 50 % WR" | `PRIOR_GAMES = 50`; `:49` und der Tooltip nennen ebenfalls 50 |
| **B14** | `js/app-tier-meta.js:69–74` | die Glättung heißt „Bayesian shrinkage … 5-game-100 %-WR fluke" | Der Nenner ist `deck.new_count` — die Zahl **gemeldeter Decklisten**, nicht Partien. Gemessen: 38.398 Listen gegen 174.954 Partien, also ≈ 4,6 Partien je Liste. Ein 50er-Prior auf Listen wirkt rund **viereinhalbmal stärker** als derselbe Prior auf Partien |
| **B5** | Feldzusammensetzung | Anteile als Feldzusammensetzung lesbar | Σ `share_numeric` = **96,42 %**, nicht 100 % |
| **B15** | `js/deck-builder-consistency.js:337–348` | NAIC (limitless `518`) „steht in keiner Labs-Datei", `_sizeWeight(0)` vergibt still 0,5 | Die Brücke greift: 540→`0069` (2.032), **518→`0070` (3.743)**, 515→`0071` (774). Der beschriebene Fehler ist behoben, der Kommentar liest sich noch als offener Zustand |

| **B20** | `js/app-meta-call.js:7382–7387` | die Online-Matchup-Quote der Seite ist `S/(S+N)` (so rechnet die CSV, nachgewiesen in `js/win-rate-konvention.js:29–32`) | Der Meta Call rechnet aus `record` **`S/(S+N+U)`**. **523 von 1.702 Zeilen (30,7 %) weichen ab**, Median 0,93 pp, Maximum **26,67 pp** (Steven's Metagross vs Cynthia's Garchomp, 2-1-2: 40,00 statt 66,67) |
| **B21** | `js/matchup-glaettung.js:13–19` gegen `js/app-meta-call.js:7371–7405` | „Der Rohwert geht nicht verloren — er steht weiter im Tooltip"; die Glättung fasse an, „was zu dünn ist" | Auf dem Meta-Call-Pfad wird **gar nicht** geglättet: **22 Paarungen** erreichen `calcDay2` mit `pWin = 100 %`, **59** mit `0 %`, 81 insgesamt außerhalb [5 %; 95 %]. Der Deckel `_clip(0,05; 0,95)` greift nur, wenn Predictor 5.3 eine Korrektur hat — sonst `return base` (`:8427`) |

Zusätzlich als **Befund ohne Kommentarwiderspruch**:

* **B1 / B2** — „Win Rate" bzw. „Win %" bezeichnen an verschiedenen Stellen verschiedene Konventionen (siehe 1.4).
* **B4** — die verworfene vierte Formel bestimmt weiterhin Sortierreihenfolgen (`js/app-past-meta.js:2160`/`:2267`, `js/current-meta-quickref.js:75–79`).
* **B16** — `data/city_league_analysis.csv`, `city_league_archetypes.csv`, `…_deck_stats.csv` und `…_comparison.csv` enthalten **null Datenzeilen**. Die Route `#city-league` zeigt dafür den Saison-Pause-Kasten; geprüft werden muss, ob **jede** abhängige Stelle das ebenfalls tut.
* **B17** — `data/datenluecken.json` ist vom **2026-08-31**, während `data/_job_heartbeats.json` für sieben andere Läufe den 2026-09-06 ausweist. Die Admin-Seite meldet „Keine offene Lücke" auf Basis eines sechs Tage alten Inventars.
* **B18** — `data/ace_specs.json` trägt `timestamp 2026-02-18` und 39 Namen. Seither sind mindestens zwei Sets erschienen (`format_window.json`: PBL vom 2026-07-17). Ob neue ACE SPECs fehlen, ist an dieser Datei allein **UNKLAR**.
* **B19** — `data/format_window.json` hat mtime **2026-08-17**, das `_note` beschreibt aber eine „zweimal je Wochenlauf" abgeleitete Datei. Der Inhalt (`current_set = PBL`, `set_release_date = 2026-07-17`) ist plausibel; dass die Datei seit drei Wochen nicht geschrieben wurde, ist es nicht.
