# UMBAU-HANDBUCH — thedipidis.app

Alles, was Claude Code für den Umbau braucht. Entstanden aus einem Audit mit 21 Agenten
(17.08.2026): Repo-Karte, Funktionsinventar über 383 Einträge, drei Spieler-Personas mit
echten Aufgaben, drei Datenanalysten mit gegenseitiger Widerlegungs-Gegenprüfung, dazu
Live-Messungen mit Playwright in beiden Viewports.

**Reihenfolge:** erst `00-MERGE.md`, dann dieses Handbuch. Teil D ist der Arbeitsauftrag.

---

# A · Das Projekt

`thedipidis.app` — deutschsprachige Pokémon-TCG-Analyse-SPA. Vanilla JS, GitHub Pages,
deployt aus `main`, dazu ein Telegram-Bot auf Render. Rund 81.600 Zeilen JS in 60 Dateien,
39.000 Zeilen CSS in 31 Dateien, ein `index.html` von 845 KB, 338 Funktionen, 12 Top-Tabs.

**Keine Meta-Infoseite, sondern eine Turniervorbereitungs-Werkbank.** Sie beantwortet vier
Fragen in Reihe:

1. *Was ist gerade stark?* → Hub, Current Meta, City League, Past Meta
2. *Wie sieht die Liste dazu aus?* → drei Deck-Analysen, Deck Builder, Konsistenz-Engine
3. *Was steht am Samstag im Feld?* → Meta Call, Battle Journal, Testing Groups
4. *Was muss ich davon besitzen, drucken, kaufen?* → Sammlung, Wunschliste, Binder, Proxy

Die tragende Architekturachse ist die strikte Trennung **dreier Datenräume**:

| Raum | Was | Rotation |
|---|---|---|
| 🇯🇵 **Japan** | wöchentliche City-League-Cardshop-Turniere | eigene, aktuell M6, rund zwei Monate voraus — der Frühindikator |
| 🌐 **Global** | Limitless Online + internationale Majors | TEF–PBL, in Person legal seit 31.07. |
| 📦 **Past** | abgeschlossene Formatfenster mit voller Turnierstatistik | eingefroren |

`data/format_window.json` ist die einzige Wahrheit über die Rotation.

---

# B · Regeln, die nicht verhandelbar sind

**Lies `CLAUDE.md` im Repo-Root.** Jede Regel dort existiert, weil ihr Bruch Zeit gekostet hat.

1. **Die drei Datenräume werden nie in einer Zahl gemischt.** Zusammenlegen darf man
   ausschließlich die *Präsentation*. Ein Umschalter wählt genau *einen* Raum.
2. **Nie über Kartennamen joinen.** Namen sind innerhalb eines Sets nicht eindeutig — PBL hat
   vier Produkte namens *Mega Darkrai ex* zu 1,03 € / 9,69 € / 184,03 € / 331,99 €. Nur
   `(set, number)` oder `cardmarket_product_id`.
3. **Melden, nicht stillschweigend reparieren.** Ein gemeldetes Loch ist heilbar, eine
   geratene Korrektur sieht richtig aus und ist falsch.
4. **Absolute Qualitätsschwellen erzeugen hier Rauschen.** „Unter 90 % gemappt" markiert 62
   von 153 Sets, fast alle legitim unmappbar. Gegen eine Baseline prüfen, nicht gegen eine
   Konstante.
5. **`data/_consumers.md` ist eine publizierte Schnittstelle.** Spalte hinzufügen ist
   unkritisch, umbenennen oder entfernen bricht fremde Projekte.
6. **Ein Commit pro Deploy, dann warten.** Pages-Deploys sind serialisiert; schnelle
   Folge-Pushes canceln einander.
7. **`./bump-version.sh` nach jeder Änderung an `js/`, `css/`, `index.html`** — beim Arbeiten
   von Hand. In *Patches* dagegen bewusst weglassen (siehe `00-MERGE.md`).
8. **Die `!important`-Regel:** Jede in einem Abschnitt angefasste CSS-Datei verlässt ihn mit
   *weniger* `!important` als vorher. Der Zähler in `tests/unit/test-design-tokens.js` darf
   nie steigen. Stand nach Etappe 2: **3402**
   (`grep -ro '!important;' css/*.css | wc -l`).
9. **Ø-Kopienzahl pro Karte ist Kernsignal** und darf nicht verschwinden. Die
   Karten-Schnellzugriffe (+/−/★/Preis) sind bewusste Abkürzungen und bleiben sichtbar.
10. Die Sandbox erreicht `cardmarket.com`, `play.pokemon.com` und `thedipidis.app` nicht.
    Live prüfen heißt: in CI per `workflow_dispatch` laufen lassen und das Job-Log lesen.

**Vor jedem Abschnitt `/feature-review`, vor jeder Datenpipeline-Änderung `/data-review`.**

**Ein Feature-Branch pro Abschnitt, ein PR, ein Deploy.** Nicht bündeln.

## Testen

```bash
bash scripts/run-js-unit-tests.sh          # 1010 passed, 0 failed
python3 -m pytest tests/python -q          # 373 passed, 5 skipped
git checkout -- data/card_text_resolution.csv    # pytest verändert sie, siehe unten
```

**Offener Befund:** `pytest` schreibt über `scripts/resolve_by_card_text.py` in die getrackte
Datei `data/card_text_resolution.csv` (886 Zeilen Diff). `weekly-full-update.yml` committet mit
`git add -A` — der Diff kann also unbemerkt mitwandern. Erste Aufgabe in Teil D.

## Lokal prüfen, was man gebaut hat

Die Seite ist statisch und läuft aus dem Repo-Ordner:

```bash
python3 -m http.server 8899
# dann Playwright gegen http://127.0.0.1:8899/index.html,
# Viewports 1440x900 und 390x844
```

Externe Bilder (Cardmarket, Limitless R2) laden dort nicht — das ist ein Sandbox-Artefakt,
kein Fehler. Firebase ebenfalls nicht; eingeloggte Bereiche muss man im Code lesen.

---

# C · Der Befund in einem Satz

> **Die Datenbasis ist gut, die Rechenwege sind überwiegend korrekt und wurden unabhängig
> reproduziert. Was fehlte, ist die Angabe, worauf eine Zahl sich bezieht — dort, wo die
> Zahl steht.**

60 Daten-Befunde, davon **58 nach adversarieller Gegenprüfung bestätigt**, 14 hochgestuft,
2 widerlegt. Fast jeder schwere Befund war ein Etikett-Problem über einem richtigen Wert.

## Was nachweislich stimmt — nicht „reparieren"

Unabhängig reproduziert, teils zweimal:

* Konversionsraten in `online_tournament_top8_decks.csv`: **122/122 Zeilen exakt**
* Matchup-Matrix intern sauber: 400 symmetrische Paare, alle summieren **exakt auf 100,00**;
  W+L+T = total_games in **1491/1491**
* `online_share_history/`: 56 Einträge, 56 Dateien, keine Drift
* Feld-Durchschnitt nirgends hartkodiert: 495,5/7456 = 6,64565 %
* **Die Markov-Kette in `calcDay2` ist mathematisch korrekt** — eigene Reimplementation:
  P = 0,265629 → 26,6 %, die Seite zeigt 26,6 %, Wahrscheinlichkeitsmasse 1,000009
* Der Past-Meta-Zweig isoliert das eingefrorene Format vorbildlich
* Die Preis-Strecke hält die Namensregel durchgehend ein
* Empirical-Bayes-Schrumpfung mit K = 50 sauber parametrisiert und begründet

## Was die Personas gekostet hat

**Lena (8 Wochen Spielerfahrung)** wollte wissen, was ein Deck kostet. Aufgegeben nach 6 Klicks
und ~8.000 px. Die Seite zeigt 42 Einzelpreise, keine Summe. Die Summe existiert — 2.800 px
tiefer, in einer dunklen Werkzeugleiste, **erst nach Druck auf „Max. Konsistenz"**, und lautet
dann `€ 33.81 €` mit doppeltem Euro-Zeichen. Vorher steht dort dauerhaft `0.00€`.

**Marco (3 Jahre, will Day 2)** wollte sein schlechtestes Matchup verbessern. „Show matchups
(20)" zeigt **8** Zeilen, absteigend nach Siegquote — sein echter Problemgegner Mega Excadrill
mit **39,1 % aus 492 Spielen** steht erst hinter einem zweiten Knopf. „Build vs Specific Decks"
liefert für die zwei meistgespielten Decks **null Vorschläge**. Und er kann seine eigene Liste
gar nicht eingeben: der Deck Builder hat **keinen Import**, weshalb der 3-Wege-Vergleich die
generierte Liste mit sich selbst vergleicht.

**Kenji (Profi, Datenanalyst)** hat das mitgelieferte Backtest-Harness ausgeführt:
`scripts/predictor_backtest.py` liefert **MAE-top10 baseline 2,19 pp gegen „full" 2,20 pp** —
die gesamte ~20-stufige Korrekturkaskade verbessert **nichts**. Schlimmster Einzelfehler:
Indianapolis, Dragapult 11,40 % prognostiziert gegen 19,75 % tatsächlich. Und er hat gemessen,
dass der Offline-Prefetcher **285 MB plus rund 2,1 GB Kartenbilder ungefragt bei jedem Aufruf**
zieht, ohne Opt-in — auf Venue-WLAN am Turniertag.

**Notenspiegel** (1 sehr gut … 6 unbrauchbar), je Lena / Marco / Kenji:

| Bereich | | | |
|---|:--:|:--:|:--:|
| Dashboard / Startseite | 3 | 4 | 3 |
| City League Japan | 5 | 5 | 5 |
| Global Meta + Deck-Analyse | 4 | 4 | 3 |
| Past Meta | 5 | 3 | **2** |
| Meta Call | 5 | 3 | 4 |
| Card Database | 3 | 4 | 3 |
| My Profile | 4 | 4 | 4 |
| Deck Builder | 4 | 5 | 3 |
| Side Quest Champions | 5 | 5 | 5 |
| Rest (Navigation, Tutorial, Fußzeile) | 4 | 4 | 4 |

**Past Meta ist die beste Ansicht der Seite** — weil dort *jede* Quote ihren Nenner hat.
Das ist die Blaupause für alles andere, nicht der Umbaukandidat.

---

# D · Was bereits erledigt ist (die sieben Commits)

## Etappe 0 — die Pipeline meldet die Wahrheit

**1 · Guardian.** `scripts/data_guardian.py` meldete Datenfrische als `WARN`, aber
`.github/workflows/data-guardian.yml:55` zählt nur `::error::` und schließt bei `crit=0` das
Issue mit „All clear". Der Lauf vom 17.08.: 3 WARN, 0 CRITICAL → „All clear", während zwei
Dateien seit über einem Monat unverändert waren.

Freshness wird jetzt ernst genommen — **aber nur dort, wo ein unverändertes File wirklich
einen toten Job beweist.** Die alte Tabelle behandelte sechs sehr verschiedene Dateien gleich;
ein pauschales CRITICAL hätte am 18.08. **drei Fehlalarme** erzeugt. Deshalb zwei Klassen:

* `REFRESH_DRIVEN` — die Quelle liefert bei jedem Lauf neue Werte, der Job committet sie jedes
  Mal. Bleibt die Datei stehen, ist der Job gestorben → **CRITICAL**. Die Schwelle folgt der
  Kadenz des Jobs, **der committet**, nicht dessen, der herunterlädt: `price_guide_6.json`
  wird täglich geladen, aber nur von `weekly-full-update` (Di+Fr) committet — die alte
  3-Tage-Schwelle hätte jeden Montag und Dienstag strukturell garantiert falsch gefeuert.
* `CONTENT_DRIVEN` — der Build ist absichtlich inkrementell (`CLAUDE.md`: „never re-fetch data
  you already have"; `build_prizepack_official_images.py:356` wiederholt es). Diese Dateien
  bleiben wochenlang byte-identisch, **während ihr Job grün läuft**. Alter beweist nichts →
  **WARN** nach 60 Tagen, mit dem ausdrücklichen Hinweis, erst den Workflow-Lauf zu prüfen.

Sauber unterscheiden ließe sich das nur mit einem **Heartbeat**: jeder Job schreibt bei Erfolg
einen Zeitstempel, unabhängig vom Inhalt. Als `TODO(heartbeat)` im Code vermerkt — bewusst
nicht in diesem Paket, es fasst sechs Workflows an. **Das ist die erste Aufgabe in Teil G,
wenn jemand die Job-Überwachung wirklich dichtmachen will.**

Neu außerdem `check_emptiness`: eine header-only CSV ist die Signatur eines Scrapers, der
lief, nichts fand und das leere Ergebnis trotzdem schrieb. `check_shrink` konnte das nie sehen
(nur `CONSUMERS`, nur prozentual). Change-basiert nach der Modulregel: der *Übergang* nach
header-only ist CRITICAL, ebenso eine Datei, die nach 21 Tagen nicht zurückkam. Baselines ohne
das neue Feld laufen nur die Staleness-Hälfte, damit der erste Lauf keine sieben falschen
Übergangs-Alarme wirft.

**2 · Stiller Job-Tod.** `champions-usage-refresh.yml` machte bei Scraper-Fehler
`git checkout --` auf die Datei, druckte `::warning::` und beendete mit 0 — 31 grüne Läufe,
Datei seit 17.07. unverändert. Der Rollback bleibt (eine dünne Scrape darf einen guten
Snapshot nicht überschreiben), der grüne Haken geht. Der Fehler wird als Step-Output
aufgehoben und von einem Gate-Step am Ende geworfen, damit der Pokédex-Build davor noch
durchläuft.

**3 · Deploy-Race.** Vier Datenjobs pushten nach `main` (was `deploy-pages` triggert) *und*
riefen zusätzlich `gh workflow run deploy-pages.yml`. Beide Läufe landeten in
`concurrency: pages, cancel-in-progress: true` — einer wurde gekillt, und
`gh run list --limit 1` konnte den Verlierer erwischen. Der explizite Dispatch ist weg.
`daily-price-refresh` behält seine Wartelogik (sie verhindert, dass Telegram Preise meldet,
bevor der Origin sie ausliefert — Bug von 2026-06), **findet** den Lauf jetzt aber über die
gepushte SHA, statt einen zweiten zu erzeugen.

**4 · Versionsstempel.** Fünf Datenjobs riefen `bump-version.sh` und committeten
`index.html`, `service-worker.js`, `version.json`. `deploy-pages.yml:201-228` überschreibt
beim Deploy alles im `_site/` — der committete Stempel erreicht nie einen Nutzer. Er erzeugte
~147 Commits pro Monat auf die 845-KB-Datei und einen neuen `CACHE_NAME` mehrmals täglich,
was den `activate`-Handler jedes Mal alle Client-Caches wegwerfen ließ. `bump-version.sh`
bleibt für Handarbeit.

**5 · `shared_decks`.** `js/app-features.js:1065` schreibt und `:1119` liest
`shared_decks/{id}` für die `?sharedDeck=`-Kurzlinks — die Collection fehlte in
`firestore.rules` komplett, beide Aufrufe liefen gegen Default-Deny. Jetzt: `read` offen (der
Link *ist* die Berechtigung, der Empfänger ist meist ausgeloggt, der Inhalt eine öffentliche
Deckliste), `create` offen aber begrenzt (exakter Schlüsselsatz, `deck` als Map mit höchstens
120 Einträgen), `update`/`delete` verboten. `FIRESTORE_RULES.md` trägt eine eingebettete Kopie
und wurde mit angepasst.

## Etappe 1 — Navigation und Datenraum

**6 · Hauptnavigation.** `index.html` definierte fünf Navigationsknöpfe,
`css/pokeball-menu.css:169` schaltete sie mit `display: none !important` global ab — auf
Desktop **und** Mobil. Übrig blieb der Pokéball ohne Label und ohne Menü-Symbol; im
Personatest hat ihn niemand ohne Vorwissen als Navigation erkannt. Die Startseite verlinkte
6 von 12 Bereichen.

Neu: `css/ds-nav.css` und `js/ds-nav.js` mit sechs Zielen — **Start · Meta · Decks · Turnier ·
Karten**, dazu **Champions** abgesetzt, weil Pokémon Champions ein anderes Spiel ist und das
nirgends stand. Auf Mobil eine Leiste am unteren Rand mit fünf Zielen.

Kein neuer Router: jedes Ziel ruft `switchTabAndUpdateMenu` mit einem vorhandenen Tab.
`switchTab` wird **umschlossen** statt verändert — `app-core.js` bleibt unangetastet und
`ds-nav.js` ist ohne Rückbau entfernbar. Der Pokéball bleibt und führt weiter alle 30 Einträge.

**Der Datenraum-Ausweis** unter der Navigation nennt Region, Format, Quelle, Stichprobe und
Stand — **pro Datenraum statt global**. Er löst die vier unbeschrifteten Feldgrößen auf
current-meta (22.699 / 23.613 / 7.456 / 14.026) und den globalen Scraper-Stempel „17.8.2026",
der über der seit dem 31.07. leeren JP-Ansicht stand.

> **Wichtiges Detail:** Die Fakten werden nach **Datenraum** geschlüsselt, nicht nach Tab.
> Die City-League-Daten sind beim Seitenstart fertig, während noch der Hub aktiv ist — nach
> `current` geschlüsselt landeten sie unter `meta-analysis-hub` und waren nie zu sehen.
> Ansichten melden ihre Basis so:
> ```js
> window.DsNav.setSpaceFacts({ sample: '7.456 gewichtete Antritte · 22.699 Decks' }, 'gl');
> ```
> Fehlt eine Angabe, bleibt sie weg — eine erfundene Zahl wäre schlimmer.

**Saisonpause ist kein Fehler mehr.** Die vier `class="error"`-Ausgaben in
`app-city-league.js` sind ein Leerzustand mit Erklärung und einem Knopf ins globale Meta.
Alle drei Personas hatten den roten Kasten als „die Seite ist kaputt" gelesen.

**Der rote Verlaufsbanner auf City League ist weg.** Der Fix für `.header` existierte seit dem
14.08. — er kam nie an, weil die Ansicht `.city-league-header` benutzt. Jetzt dieselbe
schlanke Zeile mit 2-px-Signaturstrich; der Format-Wähler saß absolut im Banner und wurde
rechts abgeschnitten, jetzt steht er in der Zeile.

**Mobile Kopfzeile** ohne abgeschnittene Labels („My De…", „Datab…") — die Symbole tragen,
die Texte stehen im bereits gesetzten `title`/`aria`.

## Etappe 2 — die Zahlen

**7 · Eine Herleitung je Größe.**

*Hub-Antwortblock:* Die Top-8-Quote wird **einmal** hergeleitet (`model.headlineConvPct`) und
an Satz und Kachel gereicht. Vorher rechnete der Satz `best.top8/best.brought` neu, während
die Kachel die vorgerundete CSV-Spalte `top8_conv_rate` las — derselbe Wert **11,8525 %**
wurde zu **11,9** und **11,8**, drei Zeilen auseinander. Kein Datenfehler: zwei Rechenwege,
die verschieden runden. Der Satz vergleicht jetzt roh mit roh (+78 %) und nennt die Glättung
daneben (+72 %); vorher stand die rohe Quote neben der geglätteten Abweichung, beide für sich
richtig, zusammen nicht nachrechenbar. Kacheln tragen `n` und einen Rang — zwei Kacheln mit
derselben Beschriftung „Meistgespielt" lasen sich wie ein Fehler statt wie Platz 1 und 2.

*Ranglisten:* Beide Tabellen in current-meta bekommen eine `n`-Spalte, Zeilen unter
`CONV_THIN_N` sind ausgegraut. Sie werden als Rangliste gelesen; Platz 1 war zeitweise ein
Deck mit 8 gewichteten Cuts und einem 95-%-Wilson-Intervall von **7,9 % bis 27,1 %**.

*Matchups:* `Number.isFinite` statt `> 0` an vier Stellen. Der Filter sollte fehlende Werte
ausschließen, traf aber echte Nullen: **51 von 1491 Zeilen**, darunter Iron Thorns gegen Mega
Excadrill mit **0 aus 12**. „Worst Matchups" konnte das schlechteste Matchup strukturell nicht
zeigen, und der anteilsgewichtete Schnitt lag zu hoch. Past Meta bekommt eine
Mindeststichprobe (20 Partien) — es war die einzige Matchup-Ansicht ohne: „1 Game, 100,0 %"
stand gleichrangig neben 544 Partien.

*Siegquoten-Konvention:* `aggregateLabsRowsByDeck` rechnete `(W+0,5T)/G`, während die
Quelldatei `labs_tournament_decks.csv` ihre Spalte `win_pct` als `(3W+T)/3N` führt — die
Pokémon-Swiss-Punkte, also das, was über die Platzierung entscheidet. Die App machte aus
korrekten Rohdaten eine weitere Zahl: Median 2,38 pp, maximal 12,5 pp daneben, gemessen über
alle 4.667 Zeilen. Sie liefert jetzt **beides benannt** — `matchPointPct` in der Konvention
der Quelle, `winPct` in der der Ladder. Damit vergleicht die Tier-1-Schwelle `T1_MIN_WR`
endlich gleiche Skalen; vorher war die Hürde auf der Labs-Seite rund 2,4 pp weicher, und
welcher Pfad griff, hing allein davon ab, ob eine Labs-Datei existierte.

*Meta Call:* Der Status-Banner war ausgerechnet in **Mode A** unterdrückt — also genau dann,
wenn die Prognose auf reiner Online-Ladder beruht. Am 17.08. war PBL seit 17 Tagen legal, die
neueste Labs-Zeile vom 10.06. aus dem Vorformat, 4520 von 4667 Zeilen verworfen; die UI zeigte
„Source: Current Meta · PBL" über einer vollen Feldtabelle. Die Texte für Mode A existierten
bereits und sind ehrlich („Modus A · nur Online-Ladder", „4520 von 4667 Major-Turnier-Zeilen
ausgeschlossen") — sie wurden nur nie gezeigt.

---

# E · Das Design-System

`css/tokens.css` (41 Variablen, inklusive fertigem Dunkelmodus) und `css/components.css`
(`.ds-stat`, `.ds-bar`, `.ds-table`, `.ds-chip`, `.ds-panel`) **existieren und sind gut**.
Seit Etappe 1 kommen `.ds-nav`, `.ds-space` und `.ds-empty` aus `css/ds-nav.css` dazu.

Sie werden in **wenigen von sechzehn Ansichten** benutzt. Das ist die eigentliche Arbeit.

Gemessen: **3402 `!important`** · **767 Hex-Farben** · **230 font-size-Werte** · **76
border-radius-Werte** · **436 box-shadow**. `tokens.css` deckt 41 von 171 benutzten Variablen
ab; die übrigen 130 kommen aus neun weiteren Definitionsorten. **Elf von 31 CSS-Dateien
benutzen gar keine Tokens:** `anti-tech`, `archetype-icons`, `cards-filter-section`,
`cards-tabs`, `city-league-display-toggles`, `dashboard-theme`, `de-overview-tabs`,
`tech-lab`, `tech-slots`, `ux-step2`, `wishlist-bot-import`.

## Die Farbregel

**Nie grün↔rot.** Die divergierende Skala ist **blau↔rot mit grauem Nullpunkt**
(`--dv-pos` / `--dv-neg` / `--dv-zero`). Rot-Grün ist die häufigste Farbsehschwäche;
`tokens.css` nennt poke_hive dort ausdrücklich als Vorbild mit genau dieser Schwäche, die
bewusst nicht mitkopiert wird. Die Farbe sitzt im Balken oder als getönter Zellhintergrund —
Text trägt immer eine Textfarbe, damit der Kontrast nie geprüft werden muss.

Datenraum-Signalfarben: Japan **Koralle** `--space-jp` (nicht Rot — Rot heißt Fehler),
Global `--brand`, Past `--ink-3`.

## Fehlende Bausteine

Alle im Prototyp `prototyp-informationsarchitektur.html` bereits umgesetzt:

| Baustein | Zweck |
|---|---|
| `.ds-answer` | Antwortblock: Überschrift, ein Satz Klartext, Kacheln, Fußnote |
| `.ds-toc` | klebende Sprungnavigation für lange Ansichten |
| `.ds-mm` | Matchup-Zeile: Gegner, Feldanteil, Siegquote getönt, **n immer sichtbar** |
| `.ds-honesty` | Einschränkungs-Hinweis (Modellgrenzen, kurze Zeitfenster) — `--gold`, nie rot |
| `.ds-truncated` | das „+3 unter 1 %"-Etikett an jeder gekürzten Liste |

`.ds-truncated` ist von Silph Scope: neben jeder Abschnittsüberschrift steht, wie viele
Einträge der Block *weglässt*. Die billigste Ehrlichkeits-Anzeige, die es gibt, und sie fehlt
auf der ganzen Seite. Dringendster Ort: „Show matchups (20)", das acht Zeilen zeigt.

## Referenzen und was von ihnen übernommen wird

**Silph Scope** (`silph-scope.com/usage`) — dreispaltiges Master-Detail, Filterschiene mit
Kardinalität an jeder Facette (Type 18 · Item 141 · Move 357), eine Zeilenform für alles
(Label · Balken · rechtsbündiger Prozentwert in Tabellenziffern), Datenfenster dauerhaft in
der Kopfzeile, Delta-Badges in der Rangliste, ein Akzent-Farbverlauf und sonst nichts.

**Trainer Hill** (`trainerhill.com/meta`) — optisch schwach, methodisch stark. Vier Dinge:
die Siegquoten-Konvention ist ein **Bedienelement** mit der als Bruch gesetzten Formel
(`Count Ties as 1/3 Win: % = (W + T/3)/(W+L+T)`) · jede Matrixzelle trägt Quote **und**
Bilanz (`49.2 %` über `103-103-10`) · zwei Ranglisten nebeneinander („Overall" und „Top 8")
statt drei untereinander mit drei verschiedenen Siegern · PNG- und CSV-Export am Block.
Auch Trainer Hill benutzt rot↔blau, nicht rot↔grün.

**poke_hive** — die Vorlage für die Share-Karten (Teil F).

---

# F · Die neue Informationsarchitektur

Heute: 12 Top-Tabs, 30 Menüpunkte hinter einem unbeschrifteten Pokéball. Der Schnitt folgt den
vier Fragen aus Teil A:

| Punkt | Beantwortet | Fasst zusammen |
|---|---|---|
| **Start** | Was ist gerade stark? | Antwortblock + Einstiege nach Absicht |
| **Meta** | Wie sieht das Feld aus? | current-meta, city-league, past-meta — **eine Ansicht, ein Datenraum-Umschalter** |
| **Decks** | Wie sieht die Liste aus? | die drei Deck-Analysen + Deck Builder + Meine Decks |
| **Turnier** | Was steht Samstag im Feld? | Meta Call, Battle Journal, Testing Groups |
| **Karten** | Was muss ich besitzen? | Kartendatenbank, Sammlung, Wunsch-/Tauschliste, Binder, Proxy, Rechner |
| **Champions** | *(anderes Spiel)* | Side Quest — sichtbar abgesetzt |

Ebene 1 steht (Commit 6). Was noch fehlt, ist das Zusammenlegen darunter — Teil G.

**Zwei Prototypen liegen bei**, beide mit echten Daten und ausschließlich aus `tokens.css`
gebaut, also direkt übertragbar:

* `prototyp-informationsarchitektur.html` — die neue IA, Desktop/Mobil/Dunkelmodus umschaltbar
* `prototyp-sharekarten.html` — die drei Share-Bausteine aus Teil G

## Die Regel, die jede Zahl bekommt

> **Keine Quote ohne Nenner. Keine Rangliste ohne n. Kein Trend ohne Zeitraum.**
> Unter n = 20 wird nicht angezeigt. Unter n = 50 wird geglättet, ausgegraut, ohne Farbe.

Past Meta macht es vor. Technisch ist das *eine* Formatierungsfunktion und *eine*
Tabellenkomponente — nicht 60 Einzelfixes.

---

# G · Arbeitsauftrag

## G0 · Vorarbeit

`scripts/resolve_by_card_text.py` darf im Testlauf keine getrackte Datei mehr schreiben.
Entweder aus dem von `pytest` erreichten Pfad nehmen oder das Ziel über eine
Umgebungsvariable auf einen Temp-Pfad legen.

## G1 · Share-Bausteine

Der Auftraggeber hat drei Vorlagen benannt: die Deck-Analysekarten von **@poke_hive**, dessen
**Decklisten-Darstellung**, und ein **Ergebnisbild** wie die LigaHouzze-Turniergrafiken
(ohne Foto). Wörtlich: *„wir machen hier eine Seite für Pokémon competitive Play, die Leute
wollen angeben mit ihren Ergebnissen."*

**Der Entwurf existiert als lauffähiger Prototyp** (`prototyp-sharekarten.html`). Maße, Farben
und Textbausteine von dort übernehmen — sie sind abgestimmt.

### `.ds-share-card` — Deck-Analyse als Bild, 1200×675

Neue Dateien `css/ds-share.css`, `js/ds-share.js`. Aufruf aus der Deck-Analyse.

Aufbau: Kopf (Logo · Deckname mittig groß · Archetyp-Icons + Format-Chip) → drei Kennzahlen
(Feldanteil · Siegquote · Top-8 gegen das Feld, Farbkante oben, beim Feldanteil neutral, weil
er keine Leistung misst) → links Schlüsselkarte + Datenraum-Block, rechts Matchup-Tabelle →
Fuß mit Sortierhinweis und Datenstand.

Icons über `data/archetype_icons.json` → `https://r2.limitlesstcg.net/pokemon/gen9/{slug}.png`,
mit `onerror`-Fallback auf ein Kürzel-Chip — das beschreibt `archetype_icons.json` selbst als
erwartetes Verhalten.

**Drei Abweichungen von poke_hive, alle bewusst — nicht „korrigieren":**

| poke_hive | hier | warum |
|---|---|---|
| Heatmap grün↔rot | **blau↔rot** | siehe Farbregel in Teil E |
| nur Siegquote | Siegquote **+ Formel** `W/(W+L+T)` **+ Bilanz** | von Trainer Hill; auf einem Bild, das durch Discord wandert, kann niemand nachfragen |
| Matchups nach Quote sortiert | **nach Partienzahl sortiert**, Spalten `Partien` und `W–L` | sonst stehen die eigenen Problem-Matchups unten — genau daran ist Marco gescheitert |

Dazu: unter 20 Partien ausgegraut und **ohne** Farbe; Spiegel-Matchup neutral (50 % ist keine
Information); Kontextzeile nennt Zähler und Nenner (`68/570 = 11,8 % · Feld 6,65 % ·
geglättet`), damit die Prozentangabe nachrechenbar ist.

### `.ds-decklist` — Kartengitter mit Plakette

**Der Painter existiert schon.** `_buildDeckCanvas` (`js/app-deck-builder.js:2575`) zeichnet
genau diese Ansicht — Kartengitter mit roten Anzahl-Plaketten — inklusive CORS-sicherem
Bildladen über `images.weserv.nl` (`:2658-2682`) und einem Export-Ende mit
`navigator.share()` und Download-Fallback (`exportDeckAsImage`, `:2867`).

Zu tun: ein **Anteilsband** über jeder Karte (wie viele der ausgewerteten Listen sie spielen)
und die **Ø-Kopienzahl** ergänzen · unter 60 % Inklusionsquote gedämpft (Tech-Entscheidung,
keine Kernkarte) · den Einstieg sichtbar machen, `exportGridModalAsImage` (`:3064`) wird heute
von nichts aufgerufen.

### `.ds-result-card` — Turnierergebnis, 1080×1080

Quelle ist das Battle Journal. Inhalt: Platzierung, Deckname, Turnier mit Runden- und
Spielerzahl, Bilanz, die gespielte Liste als Gitter, der Rundenverlauf als Chips
(Runde · Gegner-Archetyp · W/L, blau/rot eingefasst).

**Der wichtigste Teil steht in der Fußzeile:** die vorab prognostizierte Day-2-Chance neben
dem tatsächlichen Ergebnis. Das kann kein anderes Tool posten, weil kein anderes vorher eine
Zahl genannt hat. Aus dem Meta-Call-Szenario (`localStorage 'metacall_scenarios_v1'`) holen,
wenn eines zum Turnier existiert — sonst die Zeile weglassen statt sie zu erfinden.

**Kein Foto.** Ausdrücklicher Wunsch.

### Export

Die vorhandene Pipeline nutzen, keine zweite bauen. PNG über `canvas.toBlob`, auf Mobil
`navigator.share()` mit `File`, sonst Download. Alle externen Bilder über den weserv-Proxy,
sonst taintet die Canvas und `toBlob` scheitert still.

**Abnahme:** Aus der Deck-Analyse heraus entsteht mit einem Klick ein PNG, das ohne
Nachbearbeitung auf X und Instagram funktioniert und in dem jede Quote ihren Nenner trägt.

## G2 · Design-System ausrollen

Reihenfolge: **Meta → Decks → Karten → Turnier → Profil. Eine Ansicht pro PR.** Jede verlässt
den Abschnitt mit weniger `!important` als vorher. Spitzenreiter, wenn ihre Ansicht dran ist:
`ui-components.css` (1.104) und `mobile-responsive.css` (622 = 26,5 % seiner Zeilen).

### Die großen Einzelposten

1. **`#tutorial` aus `index.html` auslagern.** 542.520 Zeichen = **57–64 % des Dokuments**,
   beide Sprachfassungen immer im DOM, 11.686 Wörter, 61.367 px auf Mobil = 73 Bildschirme.
   Nachladen statt inline, Anker je Abschnitt, jeder Tab-Hilfe-Knopf verlinkt dorthin.
   Redaktionell veraltet: ein abgeschalteter Playtester auf 32 Zeilen dokumentiert,
   „v46, Mai 2026" und „V47 · Juni 2026" widersprechen sich im selben Bildausschnitt.
2. **Karten-Legende A–K vom Hub wegnehmen** — 734 px, **45 % der Hub-Höhe**, erklärt
   Bedienelemente, die es auf dem Hub nicht gibt, und die Buchstaben werden auf der Mock-Karte
   nie gerendert. Inhaltlich ist sie gut: sie gehört in die Kartendatenbank, wo die Knöpfe
   tatsächlich stehen.
3. **Matchup-Heatmap auf Mobil.** `css/mobile-responsive.css:623-627` setzt
   `display:none !important`, gemessen 0 px, ersatzlos, ohne Hinweis. Das ist die Ansicht, die
   man zwischen zwei Runden auf dem Telefon aufmacht. Eine Zeilenansicht „dein Deck →
   Gegnerliste" aus denselben Daten reicht; die Filterfelder dafür sind bereits gebaut.
4. **Meta Call aus `#profile-content` herauslösen.**
   `grep -E 'currentUser|getCurrentUser|window\.auth' js/app-meta-call.js` → **0 Treffer** in
   10.827 Zeilen; Szenarien liegen in `localStorage`. Das größte Modul der Seite ist ausgeloggt
   unsichtbar, nur wegen des Containers. Login nur für die zwei Bausteine, die ihn brauchen
   (Journal-Bayes-Blend `:6382`, Testing-Group-Laden `:10029`). Danach zeigt `js/ds-nav.js`
   unter „Turnier" direkt darauf; der Sonderfall in `groupForTab()` kann weg.
5. **Umgekehrt:** die Kartendatenbank rendert ausgeloggt **216 Sammlungs-Bedienelemente**,
   die nichts tun. Ausblenden oder mit Schloss beschriften.

### Die Zusammenlegungen

1. **Eine Deck-Analyse-Shell** mit Datenraum-Umschalter statt drei kopierter Ansichten
   (`app-city-league.js:3114`, `app-current-meta-analysis.js:3024`, `app-past-meta.js:939`).
   Der Rechenkern ist **bereits geteilt** (`aggregateCardStatsByDate` nutzen alle drei) — die
   Trennung leistet schon heute nicht der Renderer, sondern der `source`-Parameter.
   Strukturdiff CL↔CM nach Normalisierung: nur 221 von ~350 Zeilen weichen ab, fast nur
   Feature-Zusätze. Past Meta gewinnt dadurch sofort Usage Share, Ø-Werte, Preis,
   Wishlist-Badge und Rarity-Switcher.
   **Zusammengelegt wird ausschließlich die Präsentation** — Regel 1 aus Teil B.
2. **Eine Matchup-Komponente** mit drei Ansichten (roh nach Stichprobe / feldgewichtet /
   best-worst) und Mindest-Sample-Schwelle. Der aus Scraper-HTML injizierte Block „Matchup
   Analysis — Top 100" entfällt ersatzlos: **5.248 px = 31 % der Tabhöhe**, 100 tote
   Suchfelder, 3.137 Dropdown-Optionen, deren Handler `_sanitizeScraperHtml` ohnehin entfernt.
3. **Ein Builder-Template** statt drei handkopierter HTML-Blöcke; der Profil-Builder wird der
   vierte Modus „Frei". Löst nebenbei die tote „Tech vs Normal"-Sektion in City League, die
   dort strukturell nie befüllt werden kann.
4. **Meta Binder + Custom Binder → ein Tab.** Der Custom Binder ist bereits das Superset.
   Vorsicht: beide haben sich schon einmal `users/{uid}.metaBinderSnapshot` gegenseitig
   überschrieben (`js/meta-binder.js:820-834`).
5. **Eine Vergleichs-Komponente** (heute hat die dünne Variante einen eigenen Untertab, die
   mächtige versteckt sich drei Klicks tief) · **Calculator → Modus im Starthand-Simulator** ·
   **Side Quest 7 → 5 Untertabs** mit einer Typentabelle.

### Defekte, die dabei mitgenommen werden

| Was | Wo |
|---|---|
| Geist → Unlicht steht auf `2` statt `0.5`; der Unit-Test kopiert dieselbe falsche Tabelle und kann es nie finden | `js/app-side-quest-play.js:441`, `tests/unit/test-side-quest-play.js:48-66` |
| Best/Worst-Matchups für **0 von 60** Archetypen sichtbar — Markup trägt `display-none`, Renderer entfernt nur `d-none` | `index.html:1296` |
| Proxy-Warteschlange überlebt kein Reload (`saveProxyQueue()` ist ein leerer Rumpf); Druck 60×85 mm statt 63×88 mm | `js/app-core.js:719-721`, `:1185-1187` |
| Leerzustände von Wishlist/Trade List fallen aus — `getEmptyStateHtml` zweimal global definiert | `js/app-utils.js:1487` |
| Fußzeile weiß auf hellgrau (Kontrast ~1,1:1), enthält nur ein Datum — kein Impressum, kein Kontakt, keine Quelle | `css/styles.css:942` |
| `_toggleComboTarget` wird aufgerufen, existiert nirgends im Repo | `js/draw-simulator.js:190` |
| Offline-Prefetcher zieht ungefragt 285 MB + ~2,1 GB Bilder, ohne Opt-in | `js/offline-prefetch.js` |
| Standardsprache ist Englisch auf einer deutschsprachigen Seite; der Umschalter zeigt die *aktuelle* statt der Zielsprache | `js/i18n.js:6` |
| Sprachwechsel wirft eine Exception und bricht den restlichen `languageChanged`-Handler ab | `js/app-city-league.js:4164` ruft `populateCityLeagueDeckSelect()` ohne Argumente, Signatur `:1258` erwartet zwei |
| Schließen-Knopf im Hilfe-Modal überlagert den Titel und rendert weißen Text auf Weiß | `css/close-buttons.css:150` überschreibt `position:absolute` mit `relative` |
| Konsistenz-Engine lehnt jeden Archetyp ab („data-too-thin"), weil die Decklisten am 06.06. enden, das Formatfenster aber am 31.07. beginnt — faktisch läuft immer der Legacy-Pfad | `js/app-deck-builder.js:7486-7528` |
| 77 Archetyp-Signaturkollisionen (`setdefault` = first-seen wins) — „Hydrapple Ogerpon" zeigt zwei verschiedene Decks in einer Kachel | `backend/core/archetype_matcher.py:99` |
| Deckpreis: 42 Einzelpreise, keine Summe; sie erscheint erst nach „Max. Konsistenz" als `€ 33.81 €` | Deck-Analyse |
| Kein Decklisten-Import im Deck Builder → der 3-Wege-Vergleich vergleicht die generierte Liste mit sich selbst. `parseExternalDeckListToMap` existiert bereits | `js/firebase-collection.js:4285` |
| Trenddaten ohne Basisdatum — der Vergleichszeitraum schwankt zwischen 1 und 4 Tagen | `data/limitless_online_decks_comparison.csv` hat keine Datumsspalte |

---

# H · Was auf keinen Fall angefasst wird

Die Personas haben das benannt — es ist die Stärke der Seite:

* **Past Meta in seiner jetzigen Strenge.** Der Profi gab ihm eine 2 und nannte es „besser als
  alles, was ich sonst benutze". Maßstab, nicht Umbaukandidat.
* **„Your Build vs Vanilla (Meta-Call-gewichtet)"** — „der einzige echte Grund, diese Seite
  statt Limitless zu benutzen".
* **Das Battle Journal** — „das beste Stück der ganzen Seite".
* **Die Ø-Begegnungszahl pro Runde in Meta Call** — „kein anderes Tool sagt mir, du wirst
  diesem Deck an dem Tag wahrscheinlich gar nicht begegnen".
* **Die Empirical-Bayes-Schrumpfung mit K = 50** samt ihrer begründenden Kommentare
  (`js/app-utils.js:1391-1445`).
* **Der Antwortblock auf der Startseite und seine Glossar-Zeile** — „genau diese eine Zeile
  müsste es fünfzig Mal geben".
* **Deutsche Kartennamen in der Suche**, deutsche Zahlenformate, Ø-Kopienzahl pro Karte,
  Karten-Schnellzugriffe.
* **Das Backtest-Harness.** Dass sein Ergebnis vernichtend ist, macht das Harness nicht
  schlecht — kein Konkurrenztool veröffentlicht so etwas.

---

# I · Eine offene Frage, die kein Umbau ist

Die ~20-stufige Predictor-Kaskade in `js/app-meta-call.js` verbessert laut dem mitgelieferten
Walk-Forward-Backtest **nichts** gegenüber dem einfachen Baseline-Blend:
`scripts/predictor_backtest.py` liefert MAE-top10 **2,20 gegen 2,19**; in Turin ist die Kaskade
sogar schlechter (0,98 gegen 0,88); schlimmster Einzelfehler Indianapolis, Dragapult 11,40 %
prognostiziert gegen 19,75 % tatsächlich — 8,35 pp auf dem meistgespielten Deck.

**Nicht stillschweigend Stufen abschalten.** Ein Issue anlegen, das Harness in einen
wöchentlichen Workflow hängen und das Ergebnis auf einer Methodikseite veröffentlichen.
Solange das offen ist, zeigt die UI **eine** Nachkommastelle und `±2,2 pp` daneben — nicht
zwei Nachkommastellen ohne Intervall.

Ebenfalls offen und ähnlich gelagert: `PHASE_B_BLEND_MAJOR` ist `0.20`, Code-Kommentar und
Parameterkatalog sagen `0.70`. Klären, welches gilt, und beide angleichen.
