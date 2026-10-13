# Wording-Lexikon — thedipidis.app

Stand: 13.10.2026. Entscheidungen von Hausi (Chat 13.10.2026, 17:39) auf die
13 Fragen aus `claude/wording-lexikon.md` (Projektwissen); die Inventur davor
steht dort mit Zählungen.

**Ein Begriff, eine Schreibweise — im Sprachgebrauch der Pokémon-TCG-Szene.**
Was die Szene englisch sagt, bleibt englisch, auch auf der deutschen Seite
(Meta, Share, Win/Loss/Tie, Matchup, Day 2, Top Cut, Tier, Print, Prediction).
Bedienelemente bleiben deutsch (Speichern, Löschen, Bearbeiten). Die Grundregel
stammt vom 28.08. und 03.10.2026 (`tests/unit/test-szenesprache.js`,
`test-ui116-mischsprache.js`, `test-w5-hausname-meta.js`); dieses Dokument
bündelt sie und wird von `tests/unit/test-wording-lexikon.js` gegen das deutsche
Wörterbuch (`js/i18n.js`), das Tutorial (`tutorial/tutorial.de.html`) und die
sichtbaren deutschen Texte in `js/` gehalten.

**Quellen für die Szenesprache:** Limitless Labs (Metagame · Roster · Standings ·
Pairings · Deck · Share · Record · Win % · Day 1 · Day 2 · Conversion % · Masters),
limitlesstcg.com, RK9/Play! Pokémon (Swiss, Day 2, Top 8). Die offiziellen
deutschen Namen (Regionalmeisterschaft, Internationalmeisterschaft,
Weltmeisterschaft, Liga-Cup, Liga-Herausforderung, Meisterklasse, Schweizer
System) benutzt die Szene nicht; sie stehen höchstens als Erklärung im Glossar.

## 1 · Spieler und Listen

| so | nicht so | Bedeutung |
|---|---|---|
| **Spieler** | Piloten, Teilnehmer | Mensch, der ein Deck bei einem Turnier spielt |
| **Spieler in Day 1 / in Day 2**, **Spielerzahl** | Feldgröße, Spielerfeld | Zahl der Spieler, die Day 1 bzw. Day 2 gespielt haben |
| **Liste / Listen** | Antritt, Antritte | ein Deck bei einem Turnier — die Zeile in der Quelle (Frage 1) |
| Nutzer | — | Kontoinhaber auf der Seite |

## 2 · Meta

| so | nicht so | Bedeutung |
|---|---|---|
| **Meta** | Feld, Spielerfeld, Turnierfeld, Metagame | die Gesamtheit der gespielten Decks (online oder bei einem Turnier) |
| **Meta-Schnitt** | Feldschnitt | der Durchschnitt über das ganze Meta |
| **Share** (Meta-Share, Online-Share, Major-Share) | Anteil, Feldanteil | Anteil eines Decks an allen Listen (Frage 2); „Anteil“ nur in Erklärsätzen über andere Brüche |
| **Major** | Präsenzturnier, In-Person, Papier | Turnier vor Ort ab Regional-Größe (Regional, International, Worlds, Special Event) |
| **vor Ort** | Präsenz, Papier, In-Person, IRL | im Satz: gespielt an einem Tisch, nicht online (Frage 3) |
| **Online** | — | Limitless-Online-Turniere |

## 3 · Turnierarten (Frage 4) und Altersklasse (Frage 5)

| so | nicht so |
|---|---|
| **Regional** (Plural Regionals) | Regionalmeisterschaft |
| **International** (Plural Internationals) | IC, Internationalmeisterschaft |
| **Worlds** | Weltmeisterschaft |
| **Special Event** | SPE, Spezialmeisterschaft |
| **League Cup**, **League Challenge** | Lokaler Cup, Lokale Challenge, Liga-Cup |
| **City League** | — |
| **Masters** | Meisterklasse — die Seite zeigt die Masters-Division; sie muss es nicht sagen |

Ausnahme: gespeicherte Werte im Battle Journal (`Regional/SPE`) bleiben als
Datenwert bestehen; nur die Beschriftung sagt „Regional / Special Event“.

## 4 · Turnierverlauf

| so | nicht so | Bedeutung |
|---|---|---|
| **Day 1**, **Day 2** | Tag 1/Tag 2, Phase 1/2 | die zwei Turniertage |
| **Day-2-Conversion** | Day-2-Quote, Konversion | gemessen: Spieler in Day 2 ÷ Spieler in Day 1 (Frage 6) |
| **Day-2-Chance** | — | die **Prediction** dieser Quote im Meta Call, vor dem Turnier |
| **Swiss** | Schweizer System | das Rundensystem von Day 1 |
| **Match**, **Game**, **Runde** | Partie, Partien | Match = ein Spiel-Paar (BO1/BO3), Game = ein Spiel darin |
| **Top Cut** (zwei Wörter; im Kompositum Top-Cut-Datei) | Top-Cut, Cut, Finalrunde | die K.-o.-Runde nach Day 2 (Frage 7) |
| **Top 8** | — | die Plätze |
| **Top-8-Conversion** | Top-8-Quote, Top-8-Schnitt, Cut-Quote | Anteil der Listen eines Decks, die Top 8 erreichten (Frage 7, konsistent zu Day-2-Conversion) |
| **Matchpunkte** | Punkte | 3 je Win, 1 je Tie, 0 je Loss |
| **Standings**, **Pairings** | — | Labs: Tabelle · Tischzuordnung je Runde; „Paarung“ nie für Deck gegen Deck |

## 5 · Ergebnisse und Quoten

| so | nicht so | Bedeutung |
|---|---|---|
| **Win / Loss / Tie** — immer, auch im Satz | Sieg, Niederlage, Unentschieden, S–N–U | Ausgang eines Matches (Frage 9) |
| **Bilanz (W-L-T)** | Record, S–N–U, W–L–T mit Gedankenstrich | Wins-Losses-Ties |
| **Win Rate** = W / (W + L) | Winrate, Siegquote, Siegrate, Gewinnrate | so rechnet der Meta Call |
| **WR\*** = W / (W + L + T), Langname **Win Rate inkl. Ties** | Siegquote inkl. Unentschieden | Tier-Karten, Battle Journal, Pocket (Frage 10) |
| **Win %** = (3W + T) / (3 · Matches) | — | Matchpunkte-Quote, so rechnet Limitless Labs; nur für Labs-Zahlen |
| **Matchup** (MU) | Paarung, Begegnung | Deck gegen Deck (Frage 8) |
| **Heatmap** | Matrix | die Matchup-Tabelle als Farbfläche |

## 6 · Decks und Karten

| so | nicht so | Bedeutung |
|---|---|---|
| **Archetyp** | Archetype | Deck-Familie mit demselben Kern |
| **Variante** | — | Spielart eines Archetyps — nie für einen Kartendruck |
| **Print** | Druck, Version, Variante (für Karten) | ein konkreter Druck einer Karte (Set + Nummer) (Frage 11); „drucken“, „Proxy-Druck“, „Druckliste“ meinen das Drucken auf Papier und bleiben |
| **Deckliste** | Decklist | die 60 Karten eines Spielers |
| **Tech**, **Counter** | Konter | Karte gegen ein Matchup · das Deck, das ein anderes schlägt |
| **Tier 1/2/3**, **Rogue** | Stufe | Einteilung nach Share und Erfolg |
| **Staples** | Standardkarten | Karten, die fast jede Liste spielt |
| **Set**, **Set-Code** | Edition, Erweiterung | z. B. 30C, MEE |
| **Format**, **Rotation**, **Standard**, **Expanded** | — | — |

## 7 · Seiteneigene Namen (Frage 12, 13)

**Meta Call** (nicht Meta-Call) · **Prediction** (nicht Prognose, Vorhersage,
Predictor) · Deck-Analyse · Archetyp-Box · Spielbox · Masterclass · Side Quest ·
Champions · Pocket · Battle Journal · Binder / Meta-Binder · **Testing Groups**
(nicht Testgruppen).

## Sperrliste (maschinenlesbar)

Jede Zeile: `regex | ersatz | wo`, getrennt durch „ | “ mit Leerzeichen (ein `|` ohne Leerzeichen gehört zum Regex). `wo` ist `de` (deutsches Wörterbuch und
Tutorial) oder `alle` (dazu alle sichtbaren String-Literale unter `js/`;
Protokollzeilen `console.*`/`devLog` und Literale, die mit `[` beginnen,
zählen nicht). Die Zeilen liest `tests/unit/test-wording-lexikon.js`.

```sperrliste
\bPiloten?\b | Spieler | alle
\bTeilnehmerzahl\b | Spielerzahl | alle
\bAntritt(e|en|s)?\b | Liste/Listen | alle
\bPr(ä|ae)senz[\wäöü-]* | Major / vor Ort | alle
\bIn-Person\b | vor Ort | alle
\bPapier\b | vor Ort | alle
\bFeldgr(ö|oe)(ß|ss)e\b | Spielerzahl | alle
\bSpielerfeld(er)?\b | Meta | alle
\bFeldschnitt\b | Meta-Schnitt | alle
\b(Feld|Online-Feld|Turnierfeld|Spielerfeld)anteil[\wäöü]* | Share | alle
\bSpielern? im Feld\b | Spieler im Turnier | alle
\b(ganzen|des|dem) Feld(es)?\b | Meta | alle
\bLokale[rn]? (Cup|Challenge)\b | League Cup / League Challenge | alle
\bRegional / IC\b | Regional / International | alle
\bDay-2-(Quote|Rate)\b | Day-2-Conversion | alle
\bTop[- ]8-(Quote|Schnitt|Rate)n?\b | Top-8-Conversion | alle
\bCut-Quote\b | Top-8-Conversion | alle
\bPaarung(en)?\b | Matchup(s) | alle
\bBegegnung(en)?\b | Matchup(s) | alle
\bSieg(e|es|en)?\b | Win(s) | alle
\bNiederlage(n)?\b | Loss(es) | alle
\bUnentschieden\b | Tie(s) | alle
\bSieg(quote|rate|esrate)n?\b | Win Rate | alle
\bGewinnrate\b | Win Rate | alle
\bWinrate\b | Win Rate | alle
\bPartien?\b | Match(es) | alle
\bunentschieden gespielt\b | Tie(s) gespielt | alle
S ?/ ?\(S ?\+ ?N | W / (W + L | alle
\(S–N–U\) | (W-L-T) | alle
\bPrognosen?\b | Prediction | alle
\bprognostiziert\w* | der Prediction | alle
\bVorhersagen?\b | Prediction | alle
\bvorhergesagt\w* | der Prediction | alle
\bPredictor-\w+ | Prediction- | de
\bTestgruppen?\b | Testing Group(s) | alle
\bKonter\b | Counter | alle
\bArchetype\b | Archetyp | de
\bDecklist\b | Deckliste | de
(?<!Proxy-)\bDruck(e|s)?\b | Print(s) | alle
\bEdition\b | Set | de
```

## Was NICHT gesperrt ist (bewusst)

„Anteil“ allein (Erklärsätze über andere Brüche), „Grundgesamtheit“ (Statistik,
kein TCG-Begriff), „Variante“ (Deck), „Feld“ als Eingabefeld oder
Champions-Feld, „Drucken/Drucker/Druckliste“ (Papier), englische
Wörterbucheinträge, Kommentare im Code, Datenwerte wie `Regional/SPE`.
Die Nebenbereiche (Champions, Pocket, Side Quest: `js/app-side-quest-*`,
`js/champions-*`, `js/ds-pocket.js`, `js/pocket-*`) prüft die Kern-Zusicherung
nicht — sie haben eigene Begriffe (Champions-„Feld“, Stufe S/A).

**Entschieden, obwohl es auffallen könnte:** „Ø Matchups“ im Meta Call ist die
erwartete Zahl der Aufeinandertreffen mit einem Deck über die Runden (englisch
„Encounters“) — Hausi 13.10.: Matchup überall, „Begegnung“ nicht.
