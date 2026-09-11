/*
 * MostConsistencyBuilder — rebuild of the "Most Consistency" deck-builder
 * routine on top of the per-decklist data foundation
 * (data/tournament_decklists_per_player.csv).
 *
 * What the user asked for, mapped to the implementation phases below:
 *
 *   Spec rule 1 — ACE-SPEC pick at split:
 *     Highest weighted share wins. If two leaders are within ±5 pp
 *     (the 45-55 % range the maintainer named), tiebreak by top-cut
 *     frequency. Phase 1 below.
 *
 *   Spec rule 2 — every list matters but success weights more:
 *     Phase 0 builds a per-(tournament × player) weight from placement
 *     × tournament size. Every consumer downstream uses these weights.
 *
 *   Spec rule 3 — placement weight is step-function B:
 *     Top-4 = 1.0, Top-8 = 0.7, Top-16 = 0.5, Top-32 = 0.3,
 *     uebriger Top Cut = 0.1. _placementWeight() below.
 *     ACHTUNG: fuer die PAPIERZEILEN (quelle='papier') IST die
 *     Grundgesamtheit der Top Cut — limitlesstcg.com veroeffentlicht
 *     Decklisten erst ab Tag 2, und die CSV fuehrt je Turnier genau
 *     diese Spieler (nachgezaehlt bei PLACEMENT_WEIGHT_BANDS). Das
 *     letzte Band heisst deshalb NICHT "Day-1-only"; eine
 *     Day-1-only-Liste gibt es dort nicht.
 *
 *     SEIT DEM 10.09.2026 GILT DAS NICHT MEHR FUER DIE GANZE DATEI.
 *     Der Wochenlauf #135 hat erstmals Online-Zeilen (quelle='online',
 *     play.limitlesstcg.com) in dieselbe CSV geschrieben — dort ist
 *     JEDE Liste des Feldes veroeffentlicht, nicht nur der Cut.
 *     Gemessen: 14 Turniere, 1.319 Listen, Plaetze 1 bis zur vollen
 *     Feldgroesse (z. B. 128 von 128 bei REFINE Autumn Series).
 *     Fuer diese Zeilen traegt NICHT das absolute Band, sondern das
 *     Quantilsband (PLACEMENT_PERCENTILE_BANDS) — genau dafuer wurde
 *     es am 05.09.2026 gebaut: Platz 100 von 104 ergibt q = 0,96 und
 *     damit 0,1, waehrend Platz 3 von 3.743 auf 1,0 kommt. Das
 *     funktioniert aber nur mit einer BEKANNTEN Feldgroesse; Zeilen
 *     ohne sie werden in _loadAll gezaehlt und weggelassen.
 *
 *   Spec rule 4 — tournament size weight = log(players)/log(2000):
 *     Capped at 1.0 for ≥ 2000-player events. _sizeWeight() below.
 *
 *   Spec rule 5 — Core threshold: 90 %, dynamically relax toward 80 %
 *     when too few cards land. Phase 2 below.
 *
 *   Spec rule 6 — avgCountWhenUsed = weighted mean:
 *     Σ(weight × count_in_list) / Σ(weight where list ran the card).
 *     _computeCardScores() below.
 *
 *   Spec rule 7 — Core fully built first, then Tech fills remaining
 *     slots. Phases 2 → 3 → 4 below.
 *
 *   Spec rule 8 — Tech packages via co-occurrence:
 *     If two cards co-occur in ≥ 70 % of lists where either appears,
 *     treat them as a package; select / drop together. Phase 3 below.
 *
 *   Spec rule 9 — > 60 cards: drop lowest weighted share first.
 *     Phase 5 below.
 *
 *   Spec rule 10 — only real data, no estimates / extrapolations.
 *     Phase 6 surfaces a confidence indicator; refuses to build when
 *     the archetype has < 3 weighted decklists.
 *
 * The module exposes a single `build()` entry point that returns
 *   { deck, trace, dataQuality }.
 * Caller (app-deck-builder.js → autoCompleteConsistency) applies the
 * deck to the live UI.
 *
 * Architecture: pure functions feed into pure functions. Each phase
 * pushes a structured event to `trace` so the console / UI / future
 * "why this card?" view can explain every decision. No global state
 * other than the lazy-loaded CSV index.
 */
(function (global) {
  'use strict';

  // ── Tuning constants ──────────────────────────────────────────────
  const DATA_URL = 'data/tournament_decklists_per_player.csv';

  /* DIE GRUNDGESAMTHEIT IST DER TOP CUT, NICHT DAS FELD (07.09.2026).
     Nachgezaehlt in data/tournament_decklists_per_player.csv gegen
     data/player_continuity.csv: die Datei fuehrt je Turnier GENAU die
     Spieler mit day2=1, lueckenlos von Platz 1 bis zum letzten.

         Turnier        Feld   day2=1   Listen in der CSV   Plaetze
         0071 Worlds     797      143                 143     1-143
         0070 NAIC     3.743      675                 675     1-675
         0069 Turin    2.032      383                 383     1-383

     Der Grund ist nicht der Scraper, sondern limitlesstcg.com: dort
     stehen Decklisten erst ab Tag 2. Jede Zeile unten gewichtet also
     INNERHALB DES TOP CUT. Die Beschriftung "Day-1-only floor" stand
     hier bis zum 07.09.2026 am letzten Band und war falsch: eine
     Day-1-only-Liste gibt es im Bestand ueberhaupt nicht — Platz 122
     bei Worlds ist ein Tag-2-Spieler im unteren Drittel des Cuts, kein
     Spieler, der Tag 1 ausgeschieden ist. */
  // Spec rule 3: step-function placement weight.
  const PLACEMENT_WEIGHT_BANDS = [
    { maxPlace:   4, weight: 1.0 },
    { maxPlace:   8, weight: 0.7 },
    { maxPlace:  16, weight: 0.5 },
    { maxPlace:  32, weight: 0.3 },  // oberes Ende des Top Cut
    { maxPlace: Infinity, weight: 0.1 },  // uebriger Top Cut (NICHT Tag 1)
  ];

  /* DIE ABSOLUTEN BAENDER WAREN BEI GROSSEN TURNIEREN WIRKUNGSLOS
     (05.09.2026).

     Gemessen an data/tournament_decklists_per_player.csv: alle drei
     Turniere im Bestand veroeffentlichen rund 18-19 % ihres Feldes.

         Turnier          Feld    Listen   Plaetze   davon auf 0,1
         Worlds 2026       797       143     1-143    111  (78 %)
         NAIC 2026       3.743       675     1-675    643  (95 %)
         Turin           2.032       383     1-383    351  (92 %)

     (Feldgroessen aus labs_tournament_decks.csv `total_players` — das
     ist die Quelle, aus der _loadTournamentSizes liest. Die Spalte
     `players` in tournament_cards_data_overview.csv zaehlt anders und
     ist hier NICHT gemeint.)

     DIE 797 STAND HIER BIS ZUM 07.09.2026 ALS 774. Das war kein
     Rechenfehler, sondern ein ueberholter Wert: am 05.09.2026, als
     dieser Block geschrieben wurde, fuehrten labs_tournaments.json UND
     labs_tournament_decks.csv fuer 0071 wirklich total_players = 774
     (nachgesehen mit `git show 1cf2abb6:data/labs_tournaments.json`).
     Der Wochenlauf "Auto: weekly full update" vom 06.09.2026 15:42 UTC
     (afec9825) hat das Feld auf 797 nachgezogen; drei Dateien sagen
     seither uebereinstimmend 797 (labs_tournaments.json,
     labs_tournament_decks.csv, und player_continuity.csv fuehrt genau
     797 Zeilen fuer 0071). Der Kommentar hat die Aenderung nicht
     mitbekommen — deshalb steht die Zahl jetzt zusaetzlich als
     BELEGTE_FELDER unten im Code und wird von
     tests/unit/test-tag2-grundgesamtheit.js gegen die Datei geprueft.

     Wirkung des Unterschieds, nachgemessen: 3 der 143 Worlds-Plaetze
     bekommen mit 797 ein anderes Gewicht als mit 774 (Platz 39:
     0,4 -> 0,6; Plaetze 78 und 79: 0,2 -> 0,4). Platz 39 ist eine der
     acht Mega-Excadrill-Listen.

     Ueber 32 hinaus vergibt die Tabelle oben nur noch den Notwert 0,1 —
     also trugen rund neun von zehn veroeffentlichten Listen dasselbe
     Gewicht. Fuer Mega Excadrill bei Worlds lagen ALLE acht Listen
     (Plaetze 37-122) im selben Band; `weightedShare` war damit exakt
     n/8, und die Regel "Erfolg zaehlt mehr" trug null bei. Genau
     daraus entstanden die Gleichstaende, bei denen am Ende die
     Zeilenreihenfolge der CSV entschied.

     Der Fehler ist die absolute Skala: Platz 37 von 797 ist das obere
     4,6 % eines Weltmeisterschaftsfeldes, Platz 37 von 120 ist Mittelfeld
     eines Regionals. Beides als "ausserhalb der Top 32" zu behandeln
     wirft die Information weg, um die es geht.

     Deshalb zusaetzlich eine feldrelative Skala — und zwar als
     MAXIMUM beider, nie als Ersatz:

         gewicht = max(absolut(platz), perzentil(platz / feldgroesse))

     Das ist bewusst monoton: ein Gewicht kann dadurch nur STEIGEN, nie
     fallen. Ein Sieg bei einem kleinen Turnier behaelt seine 1,0 ueber
     das absolute Band; ein Platz 37 bei Worlds steigt von 0,1 auf 0,6.
     Der Perzentilwert misst dabei den Platz am GANZEN Feld (797), die
     Gewichtung selbst laeuft aber nur ueber den Top Cut (143 Listen) —
     beides gilt gleichzeitig und darf nicht verwechselt werden.
     Waere es ein Ersatz, wuerde Platz 4 von 60 (= 6,7 %) auf 0,6
     abgewertet — ein Turniersieg zaehlte weniger als vorher, und das
     will niemand.

     Ist die Feldgroesse unbekannt (0) ODER der Platz ungueltig, bleibt
     es beim absoluten Band — dann ist der Perzentilwert nicht definiert
     und darf nicht geraten werden. Der Platz ist dabei der subtilere
     Fall: `Number(place) || 999` macht aus einem fehlenden Platz eine
     999, und 999 geteilt durch ein Feld ueber 3.995 ergibt ein Quantil
     unter 0,25 — eine FEHLENDE Platzierung wuerde bei sehr grossen
     Turnieren also auf 0,2 aufgewertet. Live tritt das nicht auf (das
     groesste Feld im Bestand hat 3.743 Spieler, und alle 1.201 Plaetze
     sind gueltig), aber es kippt beim naechsten Feld ueber 4.000.

     WAS DIE AENDERUNG WIRKLICH BEWIRKT, gegengeprueft auf dem Live-Pfad
     (mit Formattor minDate = in_person_legal_date), 12 Archetypen mit
     Ergebnis: Gleichstaende 7 -> 3. Verbessert bei fuenf, VERSCHLECHTERT
     bei zwei (Dragapult Dusknoir und N's Zoroark bekommen je einen neuen
     Gleichstand), neun von zwoelf Decks aendern ihre Kartenliste. Im
     vorigen Format ueber 31 Archetypen: 11 -> 3, verschlechtert bei zwei.
     Die Richtung stimmt in beiden Formaten, die Wirkung ist aber nicht
     einseitig — wer hier "beseitigt Gleichstaende" liest, liest zu viel.

     Der Preis, ebenfalls gemessen: die Spreizung der Listengewichte
     sinkt (Crustle 8,0 -> 5,7, Dragapult 11,4 -> 5,7). Die Gewichtung
     gewinnt Aufloesung und verliert Dynamik — sie haengt dafuer an mehr
     Listen (effektive Stichprobe nach Kish, Mittel ueber 29 Archetypen:
     75,3 % -> 78,1 %). */
  const PLACEMENT_PERCENTILE_BANDS = [
    { maxQuantil: 0.01, weight: 1.0 },   // oberstes Prozent
    { maxQuantil: 0.02, weight: 0.8 },
    { maxQuantil: 0.05, weight: 0.6 },
    { maxQuantil: 0.10, weight: 0.4 },
    { maxQuantil: 0.25, weight: 0.2 },
    { maxQuantil: Infinity, weight: 0.1 },
  ];

  /* DIE ZAHLEN, AUF DIE SICH DIE KOMMENTARE OBEN BERUFEN.
     Sie stehen hier als Code und nicht nur als Prosa, damit
     tests/unit/test-tag2-grundgesamtheit.js sie gegen
     data/labs_tournament_decks.csv und data/player_continuity.csv
     nachrechnen kann. Laufen Kommentar und Datei auseinander — wie am
     06.09.2026, als der Wochenlauf Worlds von 774 auf 797 zog —, wird
     dieser Test rot, und der Kommentar wird nachgezogen. Das ist der
     ganze Zweck; eine Zahl in einem Kommentar altert sonst still.

     `feld`   = total_players aus labs_tournament_decks.csv
     `listen` = Zeilen mit day2=1 in player_continuity.csv
                = Zahl der Listen in tournament_decklists_per_player.csv */
  const BELEGTE_FELDER = {
    '0071': { name: 'Worlds 2026',  feld:  797, listen: 143 },
    '0070': { name: 'NAIC 2026',    feld: 3743, listen: 675 },
    '0069': { name: 'Turin',        feld: 2032, listen: 383 },
  };

  // Spec rule 4: log(players)/log(2000), capped at 1.0.
  const SIZE_WEIGHT_REFERENCE = 2000;  // IC-scale tournaments hit 1.0
  const SIZE_WEIGHT_FLOOR     = 0.5;   // tournaments without size info
                                       // get half-credit, not zero —
                                       // we know they happened.

  // Spec rule 5: Core threshold, with dynamic relaxation.
  const CORE_THRESHOLDS = [0.90, 0.85, 0.80];  // tried in order
  const CORE_MIN_DISTINCT_CARDS = 12;  // below this, relax threshold

  // Spec rule 1: ACE-SPEC tiebreak window (Δ ≤ 5 pp = "very close").
  //
  // Stand 08.09.2026 auf 0.05 gezogen. Der Kopf dieser Datei nennt seit
  // jeher "±5 pp (the 45-55 % range the maintainer named)", die Konstante
  // stand auf 0.10 — doppelt so breit wie die Ansage. Damit haette der
  // Tiebreak in Faellen gegriffen, in denen der Betreiber einen klaren
  // Fuehrenden erwartet (55 % gegen 46 %).
  //
  // Gemessen ueber alle 33 Archetypen mit Ace Spec: der KLEINSTE Abstand
  // zwischen Platz 1 und Platz 2 ist 16,0 pp (Mega Lucario). Weder 5 noch
  // 10 pp greifen heute irgendwo — die Aenderung ist verhaltensneutral und
  // stellt nur die Ansage wieder her.
  const ACE_SPEC_TIEBREAK_WINDOW = 0.05;

  // Spec rule 8: co-occurrence threshold for Tech packages.
  const TECH_PACKAGE_COOCCURRENCE = 0.70;

  // Spec rule 10: data-quality gates.
  // Untergrenze der STICHPROBE, nicht des Feldes: unter drei Listen
  // gibt es nichts zu mitteln. Die Zahl haengt nicht an der
  // Feldgroesse und aendert sich deshalb nicht dadurch, dass die
  // Grundgesamtheit der Tag-2-Cut ist (siehe PLACEMENT_WEIGHT_BANDS).
  const MIN_WEIGHTED_LISTS = 3;  // < 3 → refuse to build, transparent.

  // ── Phase 4.5: alternative-count suggestion (2nd Prüfstand) ─────
  //
  // When the naive Math.round of weightedAvgCount lands close to a
  // round-boundary, the plurality among the analysed lists + that
  // plurality group's median placement form a "what would change if we
  // trusted the list consensus instead?" diagnostic. Emitted into the
  // trace so the Why? modal can surface it without overriding the live
  // build. Der Konsens ist der des TAG-2-CUT, nicht der des Feldes —
  // die Quelle kennt keine Liste ausserhalb des Cuts.
  //
  // HERKUNFT DER VIER ZAHLEN — NACHGEPRUEFT 10.09.2026.
  //
  // Hier stand: "the Turin sweep showed a 50/50 win-rate for naive vs
  // plurality with looser settings, but the tighter combo only fires on
  // cases where plurality genuinely correlated with better placements
  // (3 / 4 wins on Turin data)."
  //
  // DIESER BELEG IST IM REPO NICHT AUFFINDBAR. Gesucht wurde am
  // 10.09.2026 nach "Turin sweep", "alt_suggestion", "ALT_SUGGESTION"
  // und "Pruefstand" in allen .md, .json und .py — kein Datensatz, kein
  // Protokoll, keine Auswertung. Und die Datenlage, auf die er sich
  // beruft, gibt es nicht mehr: data/tournament_decklists_per_player.csv
  // trug damals NUR Turin (AUDIT_DATA_PIPELINE.md, Befund F-D09:
  // "distinct tournaments: 1"), heute 2.514 Listen aus vier Turnieren.
  //
  // Die 50 gilt deshalb bis auf Weiteres als GEGRIFFEN, nicht als
  // belegt. Sie wird NICHT geraten korrigiert — eine erfundene bessere
  // Zahl saehe genauso aus und waere genauso unbelegt.
  //
  // WAS SIE HEUTE TATSAECHLICH TUT (gemessen 10.09.2026 an allen
  // 89 Archetypen der CSV, 58 davon baubar; Messweg und Zahlen in
  // tests/unit/test-alt-vorschlag-schwelle.js):
  //
  //   1.384 Aufrufe von _computeAlternativeSuggestion
  //     -   288 raus an ALT_SUGGESTION_MIN_SAMPLE (< 5 Listen)
  //     -   908 raus an der Randzone FRAC_MIN/FRAC_MAX
  //     -   143 raus, weil Mehrheit == naive Rundung
  //     -     7 raus an ALT_SUGGESTION_MIN_SHARE (< 50 %)
  //     -     1 raus, weil ein Median fehlt
  //     =    37 erreichen ALT_SUGGESTION_MIN_GAP
  //          davon 27 unterdrueckt, 10 gezeigt (in 7 Archetypen)
  //
  //   Die 50 ist also NICHT verhaltensneutral: sie unterdrueckt
  //   11 der 21 Vorschlaege, die die anderen Regeln durchlassen
  //   (bei MIN_GAP = 0 waeren es 21 in 14 Archetypen).
  //
  //   Sie sass am 10.09.2026 auch nicht auf einer Kante: der naechste
  //   gemessene Abstand darunter war 42, der naechste darueber 64.
  //
  // WAS SICH AM 11.09.2026 GEAENDERT HAT
  // ------------------------------------
  // Der Wochenlauf brachte neue Turnierlisten, und damit rutschte ein
  // Kandidat auf GENAU 50 (Kangaskhan Bouffalant -> Mega Kangaskhan ex,
  // 16 Listen). Eine unbelegte Zahl entschied damit einen einzelnen
  // Vorschlag per Gleichstand — der Fall, fuer den
  // tests/unit/test-alt-vorschlag-schwelle.js gebaut wurde.
  //
  // Die Antwort ist NICHT, die 50 zu verschieben. Beim Nachmessen aller
  // 41 Kandidaten faellt etwas anderes auf: die meisten beruhen auf
  // einer Handvoll Listen. Der groesste gemessene Abstand ueberhaupt
  // (275,5 Plaetze, Steven's Metagross ex) stammt aus NEUN Listen,
  // davon sechs mit der Mehrheitszahl — ein Median aus sechs
  // Platzierungen. Solche Zahlen sind Einzelergebnisse, keine Tendenz,
  // und die Schwelle, an der sie gemessen werden, ist dann gleichgueltig.
  //
  // ALT_SUGGESTION_MIN_SAMPLE steigt deshalb von 5 auf 30. Gemessen an
  // data/tournament_decklists_per_player.csv (Stand 11.09.2026, Lauf
  // 06:52 UTC) bleiben von 41 Kandidaten 9 uebrig:
  //
  //     durchgelassen (Abstand >= 50):
  //       Dragapult  -> Crispin              560 Listen, Abstand 114,5
  //       Slowking   -> Mega Kangaskhan ex   139 Listen, Abstand 113,5
  //     unterdrueckt: 7 weitere, Abstaende 26 / 24 / 20 / 5 / -12 /
  //                   -35,5 / -75,5
  //
  // Das Tor traegt damit weiter in beide Richtungen, und die 50 sitzt
  // wieder frei: naechster Abstand darunter 26, darueber 113,5.
  // Weggefallen sind acht Vorschlaege aus 6 bis 16 Listen — darunter
  // der Gleichstandsfall, der diesen Absatz ausgeloest hat.
  //
  // Auch die 30 ist GEWAEHLT, nicht hergeleitet. Der Unterschied zur
  // 50 ist, dass ihre Wirkung gemessen und hier benannt ist, und dass
  // sie in die vorsichtige Richtung wirkt: sie nimmt Vorschlaege weg,
  // sie erfindet keine.
  //
  // Der Vorschlag aendert den Bau NICHT; er steht als Zeile im
  // Warum-Dialog. Das ist der Grund, warum eine gegriffene Zahl hier
  // ueberhaupt stehen bleiben darf.
  const ALT_SUGGESTION_FRAC_MIN     = 0.30;
  const ALT_SUGGESTION_FRAC_MAX     = 0.70;
  const ALT_SUGGESTION_MIN_SHARE    = 0.50;
  const ALT_SUGGESTION_MIN_SAMPLE   = 30;  // GEWAEHLT, Wirkung gemessen — siehe oben.
  const ALT_SUGGESTION_MIN_GAP      = 50;  // GEGRIFFEN, siehe oben.

  // Hard rules from the game:
  const DECK_SIZE = 60;
  const BASIC_ENERGY_NAMES = new Set([
    'grass energy', 'fire energy', 'water energy', 'lightning energy',
    'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
    'fairy energy', 'dragon energy',  // legacy types, harmless
  ]);

  // ── Lazy data + index state ───────────────────────────────────────
  let _allRows         = null;  // raw parsed CSV rows
  let _byArchetype     = null;  // Map(archetype → rows[])
  let _byList          = null;  // Map(listKey → { meta, cards[] }) per
                                 // (tournament_id, player_name, place)
  let _tournamentSizes = null;  // Map(tournament_id → total_players)
  let _archetypPiloten = null;  // Map("tid|archetyp" → player_count)
  let _archetypBruecke = null;  // Map(Decklisten-Name → labs-Name)
                                 // aus labs_tournament_decks.csv. Das ist
                                 // die Zahl der SPIELER dieses Archetyps im
                                 // ganzen Feld — nicht die Zahl der Listen.
                                 // Fuer Mega Excadrill bei Worlds: 32
                                 // Piloten, 8 veroeffentlichte Tag-2-Listen.
  let _aceSpecNames    = null;  // Set of normalized ACE-SPEC card names
                                 // sourced from data/ace_specs.json.
                                 // 30.08.2026 nachgemessen: die Spalte
                                 // is_ace_spec in
                                 // tournament_decklists_per_player.csv ist
                                 // NICHT mehr leer (26.760 Zeilen: 1.058
                                 // Yes, 25.691 No, 11 leer). Sie kommt aber
                                 // aus derselben Liste, die hier gelesen
                                 // wird — der Namensweg bleibt also die
                                 // Quelle, nicht der Rueckfall.
  let _loadPromise     = null;
  // Was der Filter oben weggelassen hat — als Zahl abrufbar, damit
  // ein Test das gegen einen Grundstand halten kann statt gegen
  // eine absolute Schwelle (CLAUDE.md: Veraenderung messen).
  let _ausgelasseneOnlineZeilen   = 0;
  let _ausgelasseneOnlineTurniere = [];

  function _norm(s) {
    return String(s || '').trim().toLowerCase();
  }

  function _placementWeight(place, feldgroesse) {
    // Ist der Platz gueltig, oder ist er nur der 999-Ersatzwert?
    const roh = Number(place);
    const platzBekannt = Number.isFinite(roh) && roh >= 1;
    const p = platzBekannt ? roh : 999;
    let absolut = PLACEMENT_WEIGHT_BANDS[PLACEMENT_WEIGHT_BANDS.length - 1].weight;
    for (const band of PLACEMENT_WEIGHT_BANDS) {
      if (p <= band.maxPlace) { absolut = band.weight; break; }
    }
    const feld = Number(feldgroesse) || 0;
    // Unbekannte Feldgroesse UND unbekannter Platz fallen beide auf das
    // absolute Band zurueck: ein Quantil aus einem geratenen Zaehler
    // waere eine erfundene Zahl, keine gemessene.
    if (feld <= 0 || !platzBekannt) return absolut;
    const q = p / feld;
    let relativ = PLACEMENT_PERCENTILE_BANDS[PLACEMENT_PERCENTILE_BANDS.length - 1].weight;
    for (const band of PLACEMENT_PERCENTILE_BANDS) {
      if (q <= band.maxQuantil) { relativ = band.weight; break; }
    }
    return Math.max(absolut, relativ);
  }

  function _sizeWeight(players) {
    const n = Number(players) || 0;
    if (n <= 1) return SIZE_WEIGHT_FLOOR;
    return Math.min(1.0, Math.log(n) / Math.log(SIZE_WEIGHT_REFERENCE));
  }

  // Build a per-list weight = placement × tournament size. Used for
  // every weighted aggregation downstream so rule 2 (success matters
  // more) is enforced uniformly.
  function _listWeight(list, tournamentSizes) {
    const feld = tournamentSizes.get(list.tournament_id) || 0;
    const pl = _placementWeight(list.place, feld);
    const sz = _sizeWeight(feld);
    return pl * sz;
  }

  // ── Data loading ──────────────────────────────────────────────────
  async function _loadCsv(url) {
    return new Promise((resolve, reject) => {
      if (typeof Papa === 'undefined' || !Papa.parse) {
        reject(new Error('PapaParse not loaded'));
        return;
      }
      Papa.parse(url + '?t=' + Date.now(), {
        download:       true,
        header:         true,
        skipEmptyLines: true,
        complete:       (res) => resolve(res.data || []),
        error:          reject,
      });
    });
  }

  // ACE-SPEC names come from data/ace_specs.json (the canonical list
  // the rest of the app already consumes via window.isAceSpec in
  // app-core.js). The per-decklist CSV's is_ace_spec column is empty
  // for every row because the limitless decklist HTML doesn't tag
  // specs — so without this lookup Phase 1 would never find an
  // ACE-SPEC and every built deck would ship without one.
  //
  // We prefer the app-core's already-loaded list (avoids a duplicate
  // network fetch when the app is hot) and fall back to a direct
  // fetch when this module loads before app-init.js has populated it.
  async function _loadAceSpecNames() {
    const set = new Set();
    try {
      if (typeof global.isAceSpec === 'function') {
        // app-core.js owns the canonical loader; if it has finished,
        // its `isAceSpec` returns true for the right names. We still
        // need a name list (not a probe function) because the spec
        // pool we iterate in Phase 1 must be filterable up-front, so
        // also fetch our own copy regardless — but cheaply, in
        // parallel with the per-decklist CSV.
      }
      const res = await fetch('data/ace_specs.json?t=' + Date.now());
      if (res && res.ok) {
        const data = await res.json();
        for (const name of (data.ace_specs || [])) {
          const n = _norm(name);
          if (n) set.add(n);
        }
      }
    } catch (e) {
      console.warn('[MostConsistencyBuilder] could not load ace_specs.json:', e);
    }
    return set;
  }

  // Single source of truth for "is this card name an ACE-SPEC?".
  // Falls through to app-core's window.isAceSpec when our own Set is
  // unavailable (e.g., fetch raced past first build call).
  function _aceSpecByName(name) {
    const n = _norm(name);
    if (!n) return false;
    if (_aceSpecNames && _aceSpecNames.has(n)) return true;
    if (typeof global.isAceSpec === 'function') {
      try { return !!global.isAceSpec(name); } catch (_) { return false; }
    }
    return false;
  }

  // Tournament total_players come from labs_tournament_decks*.csv —
  // the labs scraper writes total_players per (tournament × deck) row;
  // dedupe by tournament_id and take the max.
  async function _loadTournamentSizes() {
    const sizes = new Map();
    /* Die zweite Zahl aus derselben Datei: wie viele Spieler des FELDES
       diesen Archetyp gespielt haben (`player_count`). Ohne sie liest
       sich "8 Listen ausgewertet" wie "8 Leute spielten das Deck" —
       bei Mega Excadrill waren es 32 Piloten, von denen 8 den Tag-2-Cut
       erreicht und damit eine veroeffentlichte Liste haben.
       Verknuepft wird ueber labs `deck_name` gegen `deck_archetype` der
       Listen-CSV; die Spalte `deck_slug` dort fuehrt eine Zahlenkennung
       und taugt dafuer nicht. Findet sich kein Paar, bleibt die Zahl
       LEER — geraten wird nichts. */
    const piloten = new Map();

    /* NAMENSBRUECKE (09.09.2026).
       Die Decklisten-Datei und labs fuehren zwei Vokabulare fuer
       dasselbe Deck. Gemessen ueber alle 1.201 Listen: 1.159 fanden ihr
       labs-Gegenstueck, 42 nicht — an genau drei Paaren:
           tid 0069  'Hydrapple'   23 Listen  -> 'Ogerpon Meganium Hydrapple'
           tid 0071  'Ogerpon Box' 18 Listen  -> 'Basic Box'
           tid 0071  'Hydrapple'    1 Liste   -> 'Ogerpon Meganium Hydrapple'
       Die Folge war keine falsche Zahl, sondern eine fehlende: die
       Kachel schrieb "18 Tag-2-Listen" statt "18 von 74 Piloten".
       Die Zuordnung steht belegt in data/archetype_aliases.json und
       wird NUR benutzt, wenn der Name selbst nichts trifft — in TEF-CRI
       gibt es 'Hydrapple' in beiden Dateien und meint dort dasselbe. */
    const bruecke = new Map();
    try {
      const al = await fetch('data/archetype_aliases.json?t=' + Date.now())
                       .then(r => r.json());
      for (const [von, eintrag] of Object.entries(al.decklisten_zu_labs || {})) {
        if (von.startsWith('_') || !eintrag || !eintrag.labs) continue;
        bruecke.set(_norm(von), _norm(eintrag.labs));
      }
    } catch (e) { /* ohne Bruecke bleibt es beim alten Verhalten */ }

    try {
      const rows = await _loadCsv('data/labs_tournament_decks.csv');
      for (const r of rows) {
        const tid = String(r.tournament_id || '').trim();
        const total = parseInt(r.total_players || '0', 10) || 0;
        const name = _norm(r.deck_name);
        const pc = parseInt(r.player_count || '0', 10) || 0;
        if (tid && name && pc > 0) {
          const k = tid + '|' + name;
          if (!piloten.has(k) || piloten.get(k) < pc) piloten.set(k, pc);
        }
        if (!tid || total <= 0) continue;
        if (!sizes.has(tid) || sizes.get(tid) < total) {
          sizes.set(tid, total);
        }
      }
      // Dieselbe Groesse noch einmal unter der Limitless-Kennung ablegen.
      //
      // data/tournament_decklists_per_player.csv fuehrt zwei Turniere:
      // Turin (tournament_id '0069') und NAIC 2026, dessen tournament_id
      // LEER ist — der Lauf vom 16.06.2026 lief, bevor der Override
      // 518 -> 0070 griff. _byList faellt deshalb auf
      // limitless_tournament_id '518' zurueck, und '518' steht in keiner
      // Labs-Datei. _sizeWeight(0) vergab still den Notwert 0,5.
      //
      // Gemessen: NAIC (3.743 Spieler, 675 Listen) trug 44,1 % der
      // Gewichtsmasse statt 61,2 % — 17,1 Prozentpunkte. Sichtbar wurde
      // das als bis zu 3,2 pp auf Karten-Inklusionsanteilen und als 23
      // von 935 Karten, die anders ueber die Core-Schwelle fielen.
      //
      // Die Bruecke steht in tournament_cards_data_overview.csv
      // (tournament_id -> labs_tournament_id) und ist genau dafuer da.
      try {
        const ueber = await _loadCsv('data/tournament_cards_data_overview.csv');
        for (const r of ueber) {
          const limitless = String(r.tournament_id || '').trim();
          const labs = String(r.labs_tournament_id || '').trim();
          if (!limitless || !labs) continue;
          // Dieselbe Bruecke fuer die Pilotenzahlen — sonst kennt der
          // Bau bei NAIC (limitless '518') die Feldgroesse, aber nicht
          // den Nenner daneben.
          for (const [k, v] of piloten) {
            const [t, a] = k.split('|');
            if (t !== labs) continue;
            const nk = limitless + '|' + a;
            if (!piloten.has(nk)) piloten.set(nk, v);
          }
          if (sizes.has(limitless)) continue;
          if (sizes.has(labs)) sizes.set(limitless, sizes.get(labs));
        }
      } catch (e) {
        console.warn('[MostConsistencyBuilder] keine Turnier-Bruecke:', e);
      }

      // ── Die Feldgroessen der ONLINE-Turniere ────────────────────
      //
      // WARUM DAS SEIT DEM 10.09.2026 HIER STEHT: der Wochenlauf
      // #135 hat zum ersten Mal Online-Zeilen in DIESELBE CSV
      // geschrieben (backend/scrapers/limitless_online_decklist_
      // scraper.py, quelle='online'). Die haben keine Labs-Nummer —
      // `sizes` kannte sie also nicht, `_sizeWeight(0)` vergab still
      // den Notwert 0,5.
      //
      // GEMESSEN an data/tournament_decklists_per_player.csv,
      // Stand c86c3494: 64.368 Zeilen, davon 33.909 online
      // (14 Turniere, 32-166 Listen je Turnier). Als Listen: 1.319
      // online gegen 1.201 Papier — und die Online-Listen trugen zum
      // Notwert 24,6 % der gesamten Gewichtsmasse.
      //
      // Die Zahl gibt es gemessen an zwei Stellen:
      //   1. Spalte `spielerzahl` der Zeile selbst. Der Online-
      //      Scraper liest sie aus `data-players` der Turnierliste.
      //   2. data/online_api_tournaments.csv, Spalte `players`
      //      (Semikolon-getrennt), ueber `tournament_id`.
      // Punkt 1 ist der Normalweg; Punkt 2 faengt den Bestand ab,
      // der vor dem 10.09.2026 ohne die Spalte geschrieben wurde.
      try {
        const onl = await _loadCsv('data/online_api_tournaments.csv');
        for (const r of onl) {
          const tid = String(r.tournament_id || '').trim();
          const n   = parseInt(String(r.players || '').trim(), 10);
          if (!tid || !Number.isFinite(n) || n <= 0) continue;
          if (!sizes.has(tid) || sizes.get(tid) < n) sizes.set(tid, n);
        }
      } catch (e) {
        console.warn('[MostConsistencyBuilder] keine Online-Feldgroessen:', e);
      }
    } catch (e) {
      console.warn('[MostConsistencyBuilder] could not load labs sizes:', e);
    }
    return { sizes, piloten, bruecke };
  }

  async function _loadAll() {
    if (_allRows) return;
    if (_loadPromise) return _loadPromise;
    _loadPromise = (async () => {
      const [rows, labsGroessen, aceSpecs] = await Promise.all([
        _loadCsv(DATA_URL),
        _loadTournamentSizes(),
        _loadAceSpecNames(),
      ]);
      _allRows         = rows;
      _tournamentSizes = (labsGroessen && labsGroessen.sizes) || new Map();
      _archetypPiloten = (labsGroessen && labsGroessen.piloten) || new Map();
      _archetypBruecke = (labsGroessen && labsGroessen.bruecke) || new Map();
      _aceSpecNames    = aceSpecs;

      _byArchetype = new Map();
      _byList      = new Map();
      /* Online-Zeilen OHNE bekannte Feldgroesse werden gezaehlt und
         weggelassen — nicht zum Notwert 0,5 mitgewogen.
         Begruendung im Block bei den Online-Feldgroessen oben:
         `_sizeWeight(0)` ist keine gemessene Zahl, und 0,5 stellt ein
         Wochenturnier mit 39 Leuten neben ein Regional mit 2.143. Eine
         weggelassene Liste ist nachweisbar weg; eine falsch gewichtete
         faellt niemandem auf. Sobald der naechste Lauf die Spalte
         `spielerzahl` fuellt, kommen sie von selbst zurueck. */
      let _ohneFeld = 0;
      const _ohneFeldTurniere = new Set();
      for (const r of rows) {
        const arch = (r.deck_archetype || '').trim();
        if (!arch) continue;
        const tid  = (r.tournament_id || r.limitless_tournament_id || '').trim();
        const ply  = (r.player_name || '').trim();
        const place = parseInt(r.place || '999', 10) || 999;
        if ((r.quelle || '').trim() === 'online') {
          // Erst die Zahl aus der Zeile selbst, dann die aus
          // data/online_api_tournaments.csv. Beide sind gemessen.
          const ausZeile = parseInt(String(r.spielerzahl || '').trim(), 10);
          const feld = (Number.isFinite(ausZeile) && ausZeile > 0)
            ? ausZeile
            : (_tournamentSizes.get(tid) || 0);
          if (feld <= 0) {
            _ohneFeld++;
            _ohneFeldTurniere.add(tid);
            continue;
          }
          if (!_tournamentSizes.has(tid)) _tournamentSizes.set(tid, feld);
        }
        const listKey = `${tid}|${ply}|${place}`;
        if (!_byList.has(listKey)) {
          const listObj = {
            tournament_id:    tid,
            tournament_name:  r.tournament_name || '',
            tournament_date:  r.tournament_date || '',
            meta:             r.meta || '',
            place,
            player_name:      ply,
            deck_archetype:   arch,
            deck_slug:        r.deck_slug || '',
            // Woher die Liste stammt. Ohne dieses Feld koennte dq
            // nicht sagen, ob "Tag 2" fuer den Satz darunter noch
            // stimmt — Online-Turniere veroeffentlichen JEDE Liste.
            quelle:           (r.quelle || '').trim(),
            wins:             parseInt(r.wins  || '0', 10) || 0,
            losses:           parseInt(r.losses || '0', 10) || 0,
            ties:             parseInt(r.ties  || '0', 10) || 0,
            cards:            [],
          };
          _byList.set(listKey, listObj);
          if (!_byArchetype.has(arch)) _byArchetype.set(arch, []);
          _byArchetype.get(arch).push(listObj);
        }
        const cnt = parseInt(r.count || '0', 10) || 0;
        if (cnt <= 0) continue;
        const cardName = r.card_name || '';
        // CSV flag OR canonical ace_specs.json name match. The CSV
        // column is empty for every current row; the name lookup is
        // what actually populates is_ace_spec in practice. We keep
        // the CSV check as a future-proof: if a later scraper run
        // backfills the column, the flag wins immediately.
        const csvFlag = (r.is_ace_spec || '').toLowerCase() === 'yes';
        _byList.get(listKey).cards.push({
          name:          cardName,
          set_code:      r.set_code  || '',
          set_number:    r.set_number || '',
          count:         cnt,
          is_ace_spec:   csvFlag || _aceSpecByName(cardName),
          type:          r.type || '',
        });
      }
      if (_ohneFeld > 0) {
        console.warn('[MostConsistencyBuilder] ' + _ohneFeld
          + ' Online-Zeile(n) aus ' + _ohneFeldTurniere.size
          + ' Turnier(en) ohne bekannte Feldgroesse weggelassen — '
          + 'weder Spalte `spielerzahl` noch '
          + 'data/online_api_tournaments.csv fuehren eine Spielerzahl. '
          + 'Kennungen: ' + Array.from(_ohneFeldTurniere).join(', '));
      }
      _ausgelasseneOnlineZeilen  = _ohneFeld;
      _ausgelasseneOnlineTurniere = Array.from(_ohneFeldTurniere);
      _loadPromise = null;
    })();
    return _loadPromise;
  }

  function isAvailable() {
    return _allRows !== null && _byArchetype !== null;
  }

  function listsForArchetype(archetype) {
    if (!_byArchetype) return [];
    const target = _norm(archetype);
    // Exact match first; fall through to normalized scan so curly /
    // straight quote drift doesn't break the join.
    if (_byArchetype.has(archetype)) return _byArchetype.get(archetype);
    for (const [k, v] of _byArchetype.entries()) {
      if (_norm(k) === target) return v;
    }
    return [];
  }

  // ── Card-DB enrichment (type + ACE-SPEC flag) ─────────────────────
  // The CSV's type column is populated for ~30 % of rows depending on
  // which limitless decklist page format we hit, and is_ace_spec is
  // empty in 100 % of rows. Fill the gaps via two sources, in order
  // of trust:
  //   1. Canonical ACE-SPEC name list (data/ace_specs.json) — always
  //      authoritative for is_ace_spec, since the upstream HTML never
  //      tags specs explicitly.
  //   2. Frontend card_db (window.allCardsData) — fills `type` and
  //      is_ace_spec when the name lookup missed.
  function _enrichCard(card, cardDb) {
    // 1) Name-based ACE-SPEC tag. Overwrites whatever the CSV
    //    parser put in, because we trust ace_specs.json over the
    //    blank CSV column.
    if (!card.is_ace_spec && _aceSpecByName(card.name)) {
      card.is_ace_spec = true;
    }
    if (card.type && card.is_ace_spec !== undefined) return card;
    if (!cardDb || !card.set_code || !card.set_number) return card;
    const key = `${card.set_code}-${card.set_number}`;
    const meta = cardDb.get(key) || cardDb.get(key.toLowerCase());
    if (!meta) return card;
    if (!card.type)         card.type = meta.type || '';
    if (!card.is_ace_spec)  card.is_ace_spec = !!meta.is_ace_spec;
    return card;
  }

  // Lazy index from window.allCardsData (loaded by app-cards-db.js).
  // Falls back to an empty Map; missing enrichment downgrades to
  // name-based heuristics (basic-energy name list, ACE-SPEC name
  // hardcodes via the existing ace_specs.json that the predictor
  // already consumes — but we don't reach for that here, we just
  // tolerate the blank).
  let _cardDbCache = null;
  function _getCardDb() {
    if (_cardDbCache && _cardDbCache.size > 0) return _cardDbCache;
    const db = new Map();
    // window.allCardsData only exists once the Cards tab ran loadCards();
    // the deck builder lives on other tabs, so without the fallback to the
    // eagerly-loaded allCardsDatabase the enrichment silently resolved
    // NOTHING (measured: type filled on 0/266 deck cards without it,
    // 266/266 with it). Never cache an empty map — the first call happens
    // before the chunks finish loading and would pin the miss forever.
    const src = global.allCardsData || global.allCardsDatabase || global.allCardsByKey;
    if (Array.isArray(src)) {
      for (const c of src) {
        const set = c.set_code || c.set || '';
        const num = c.set_number || c.number || '';
        if (!set || !num) continue;
        db.set(`${set}-${num}`, {
          type:        c.type || c.card_type || '',
          is_ace_spec: !!c.is_ace_spec,
        });
      }
    }
    if (db.size > 0) _cardDbCache = db;
    return db;
  }

  function _isBasicEnergy(card) {
    const n = _norm(card.name);
    if (BASIC_ENERGY_NAMES.has(n)) return true;
    const t = _norm(card.type);
    return t === 'basic energy' || t === 'basis-energie';
  }

  function _isEnergy(card) {
    if (_isBasicEnergy(card)) return true;
    const t = _norm(card.type);
    if (t.includes('energy')) return true;
    // Name fallback — special energies usually have "energy" in name
    return _norm(card.name).endsWith(' energy');
  }

  function _isAceSpec(card) {
    if (card && card.is_ace_spec) return true;
    return _aceSpecByName(card && card.name);
  }

  // ── Phase 0: weighted card scoring ────────────────────────────────
  //
  // For every distinct card across the archetype's lists, compute:
  //   weightedShare    = Σ(weight where list ran the card) / Σ(weight)
  //   weightedAvgCount = Σ(weight × count) / Σ(weight where list ran it)
  //   topCutFreq       = #lists with place ≤ 8 that ran the card /
  //                       #lists with place ≤ 8 total
  //                       ACHTUNG: das ist die Top-8-Quote INNERHALB des
  //                       Tag-2-Cut, nicht "wie oft die Karte den Cut
  //                       erreicht hat" — jede Liste hier hat den Cut
  //                       erreicht, sonst waere sie nicht in der Datei.
  //   listsWithCard    = decklist references (used for co-occurrence)
  //
  // Spec rule 6 uses these as the canonical card-level signal that
  // every downstream phase consumes.
  function _computeCardScores(lists, tournamentSizes, cardDb) {
    // Per-list weight
    const listW = new Map();
    let totalW = 0;
    const topCutLists = new Set();
    for (const l of lists) {
      const w = _listWeight(l, tournamentSizes);
      listW.set(l, w);
      totalW += w;
      if (l.place <= 8) topCutLists.add(l);
    }
    let topCutWeight = 0;
    for (const l of topCutLists) topCutWeight += listW.get(l);

    // Aggregate per card (keyed by lowercase name; we keep the
    // best-data variant — first occurrence with set info — for
    // downstream rendering).
    //
    // CRITICAL: a single list may carry the SAME card name across
    // multiple rows because limitless splits printings (e.g. 4×
    // Psychic Energy SET A + 4× Psychic Energy SET B becomes two
    // rows). Without per-list dedup, the naive `for (cRaw of l.cards)`
    // loop double-counts the list — `shareNumerator` would be 2×w
    // (inflating weightedShare beyond 100 %) and `weightedAvgCount`
    // would underestimate by the split factor. We sum counts per
    // normalized name PER LIST first, then feed one consolidated
    // entry per (list, card-name) into the cross-list aggregation.
    const cardAgg = new Map();
    for (const l of lists) {
      const w = listW.get(l);
      // Per-list rollup: name → { totalCount, best_variant }
      const perListByName = new Map();
      for (const cRaw of l.cards) {
        const c = _enrichCard({ ...cRaw }, cardDb);
        const key = _norm(c.name);
        if (!key) continue;
        if (!perListByName.has(key)) {
          perListByName.set(key, {
            name:        c.name,
            best_variant: c,
            totalCount:  0,
            is_ace_spec: c.is_ace_spec,
            is_energy:   _isEnergy(c),
            is_basic_energy: _isBasicEnergy(c),
            type:        c.type,
          });
        }
        const e = perListByName.get(key);
        e.totalCount += c.count;
        // Prefer the printing variant that carries set info — keeps
        // downstream rendering able to pick the right card art.
        if (!e.best_variant.set_code && c.set_code) {
          e.best_variant = c;
        }
        if (c.is_ace_spec)      e.is_ace_spec = true;
        if (_isEnergy(c))       e.is_energy = true;
        if (_isBasicEnergy(c))  e.is_basic_energy = true;
        if (!e.type && c.type)  e.type = c.type;
      }
      // Cross-list aggregation — one entry per (list, card-name).
      for (const [key, e] of perListByName.entries()) {
        if (!cardAgg.has(key)) {
          cardAgg.set(key, {
            name:           e.name,
            best_variant:   e.best_variant,
            weightedShare:  0,
            shareNumerator: 0,
            weightedCount:  0,
            countNumerator: 0,
            topCutCount:    0,
            topCutWeight:   0,
            n_lists_with:   0,
            lists:          [],
            // perListCounts: one entry per list that ran the card,
            // {place, count}. Powers the Phase 4.5 "alternative count
            // suggestion" diagnostic — we need both the placement and
            // the actual copies played to compute plurality + median
            // placement gap. Cheap to track (one push per (card, list)
            // tuple) and easy to drop later if the diagnostic moves.
            perListCounts:  [],
            is_ace_spec:    e.is_ace_spec,
            is_energy:      e.is_energy,
            is_basic_energy: e.is_basic_energy,
            type:           e.type,
          });
        }
        const a = cardAgg.get(key);
        if (!a.best_variant.set_code && e.best_variant.set_code) {
          a.best_variant = e.best_variant;
        }
        if (e.is_ace_spec)     a.is_ace_spec = true;
        if (e.is_energy)       a.is_energy = true;
        if (e.is_basic_energy) a.is_basic_energy = true;
        if (!a.type && e.type) a.type = e.type;
        a.shareNumerator += w;
        a.countNumerator += w * e.totalCount;
        a.n_lists_with   += 1;
        a.lists.push(l);
        a.perListCounts.push({ place: l.place, count: e.totalCount });
        if (l.place <= 8) {
          a.topCutCount  += 1;
          a.topCutWeight += w;
        }
      }
    }

    // Normalize → final per-card record
    const out = [];
    for (const [key, a] of cardAgg.entries()) {
      const weightedShare = totalW > 0 ? a.shareNumerator / totalW : 0;
      const weightedAvgCount = a.shareNumerator > 0
        ? a.countNumerator / a.shareNumerator
        : 0;
      const topCutFreq = topCutWeight > 0
        ? a.topCutWeight / topCutWeight
        : 0;
      out.push({
        key,
        name:               a.name,
        best_variant:       a.best_variant,
        weightedShare,
        weightedAvgCount,
        topCutFreq,
        n_lists_with:       a.n_lists_with,
        n_lists_total:      lists.length,
        topCutCount:        a.topCutCount,
        is_ace_spec:        a.is_ace_spec,
        is_energy:          a.is_energy,
        is_basic_energy:    a.is_basic_energy,
        type:               a.type,
        // Keep the list references for co-occurrence in Phase 3
        _lists:             a.lists,
        // Per-list (place, count) — consumed by
        // _computeAlternativeSuggestion() in Phase 4.5 below.
        _perListCounts:     a.perListCounts,
      });
    }
    return {
      cards:        out,
      listW,
      totalW,
      topCutWeight,
      topCutLists,
      lists,
    };
  }

  // ── Phase 1: ACE-SPEC selection ───────────────────────────────────
  //
  // Spec rule 1: highest weighted share wins. When the leader and
  // runner-up are within ACE_SPEC_TIEBREAK_WINDOW (5 pp), pick by
  // top-cut frequency instead — that's the maintainer's "very close
  // split" tiebreak.
  function _pickAceSpec(scoredCards, trace) {
    const aces = scoredCards
      .filter(c => c.is_ace_spec && c.weightedShare > 0)
      .sort((a, b) => b.weightedShare - a.weightedShare);

    if (aces.length === 0) {
      trace.push({
        phase: 1, decision: 'no_ace_spec_found',
        detail: 'No card in the analyzed lists is flagged as ACE-SPEC. '
              + 'Deck will ship without one (legal — ACE-SPEC is 0-1).',
      });
      return null;
    }

    const leader = aces[0];
    if (aces.length === 1) {
      trace.push({
        phase: 1, decision: 'single_ace_spec_candidate',
        chosen: leader.name,
        weightedShare: leader.weightedShare,
        topCutFreq: leader.topCutFreq,
        candidates: [{
          name: leader.name,
          weightedShare: leader.weightedShare,
          topCutFreq: leader.topCutFreq,
        }],
      });
      return leader;
    }

    const runner = aces[1];
    const gap = leader.weightedShare - runner.weightedShare;
    if (gap >= ACE_SPEC_TIEBREAK_WINDOW) {
      trace.push({
        phase: 1, decision: 'ace_spec_clear_leader',
        chosen: leader.name,
        runnerUp: runner.name,
        weightedShare: leader.weightedShare,
        runnerUpShare: runner.weightedShare,
        gap,
        // Der Normalfall (22 von 33 Archetypen) — und bis zum 08.09.2026
        // der einzige Zweig OHNE candidates. Der Aufrufer baut daraus
        // cands = [{ name: chosen }], also eine Tabelle mit genau einer
        // Zeile: "Warum diese Ace Spec?" beantwortet mit dem Gewinner und
        // sonst nichts, obwohl der Motor die Alternativen kennt. Live
        // nachgesehen am 08.09. bei Mega Excadrill: nur Hero's Cape stand
        // da, ohne die geschlagene Alternative.
        candidates: aces.slice(0, 4).map(a => ({
          name: a.name,
          weightedShare: a.weightedShare,
          topCutFreq: a.topCutFreq,
        })),
      });
      return leader;
    }

    // Tiebreak by top-cut frequency.
    //
    // Der Topf sind die Karten IM FENSTER, nicht die ersten vier. Vorher
    // stand hier aces.slice(0, 4): das Fenster wurde nur zwischen Platz 1
    // und Platz 2 geprueft, der Tiebreak lief dann ueber die Top 4
    // unabhaengig vom Abstand. Ist der Vorsprung auf Platz 2 knapp, konnte
    // Platz 4 gewinnen, auch 40 pp zurueck — er brauchte nur die hoechste
    // topCutFreq. Schlafender Fehler, gefunden 08.09.2026; live nicht
    // ausgeloest, weil der kleinste Abstand im Bestand 16,0 pp betraegt.
    const imFenster = aces.filter(
      a => leader.weightedShare - a.weightedShare < ACE_SPEC_TIEBREAK_WINDOW
    ).slice(0, 4);
    const byTopCut = imFenster.slice().sort((a, b) => b.topCutFreq - a.topCutFreq);
    const winner = byTopCut[0];

    // Wenn KEINE Liste des Archetyps einen Platz <= 8 hat, ist topCutFreq
    // fuer jede Karte 0. Der sort ist dann ein No-op und es entscheidet die
    // Anteilsreihenfolge — der Trace behauptete trotzdem, die Top-Cut-Quote
    // habe entschieden. Das ist genau der stille Muenzwurf, den
    // tech_gleichstand an anderer Stelle bewusst offenlegt. Gemessen:
    // 22 der 33 Archetypen haben keinen einzigen Platz <= 8.
    const ohneTopCut = imFenster.every(a => !a.topCutFreq);
    trace.push({
      phase: 1,
      decision: ohneTopCut
        ? 'ace_spec_tiebreak_ohne_top_cut'
        : 'ace_spec_tiebreak_by_top_cut_freq',
      chosen: winner.name,
      candidates: imFenster.map(a => ({
        name: a.name,
        weightedShare: a.weightedShare,
        topCutFreq: a.topCutFreq,
      })),
      detail: ohneTopCut
        ? `Leaders within ${(ACE_SPEC_TIEBREAK_WINDOW*100).toFixed(0)} pp, but no list of this archetype placed in the top 8 — top-cut frequency is 0 for every candidate, so the share order decided.`
        : `Leaders within ${(ACE_SPEC_TIEBREAK_WINDOW*100).toFixed(0)} pp; tiebreak by top-cut frequency.`,
    });
    return winner;
  }

  // ── Alternative-count suggestion (2nd Prüfstand) ─────────────────
  //
  // For a card whose naive Math.round(weightedAvgCount) lands in the
  // borderline zone, compute the plurality ACROSS THE ANALYSED LISTS +
  // that group's median placement. If the plurality is
  // well-represented (≥50 % of lists running the card) AND places
  // clearly better than the naive group (≥50-place median delta),
  // emit a suggestion. Caller attaches it to the deck entry; the live
  // build does NOT change.
  //
  // ES IST KEINE "FIELD PLURALITY" (korrigiert 07.09.2026). Sie hiess
  // hier und in drei detail-Texten so, gerechnet wird sie aber ueber
  // `_perListCounts` — also ueber die veroeffentlichten Listen, und die
  // sind ausschliesslich Tag-2-Listen. Bei Mega Excadrill waere "die
  // Mehrheit des Feldes" eine Aussage ueber 32 Piloten, gerechnet aus
  // 8 Listen. Auch die Plaetze im Medianabstand sind Plaetze im
  // Gesamtfeld, verglichen werden aber nur Listen aus dem Cut.
  //
  // Returns null when no suggestion fires.
  function _computeAlternativeSuggestion(scoredCard, naiveCount) {
    const perList = scoredCard._perListCounts;
    if (!Array.isArray(perList) || perList.length < ALT_SUGGESTION_MIN_SAMPLE) return null;

    const raw = scoredCard.weightedAvgCount || 0;
    const frac = raw - Math.floor(raw);
    if (frac < ALT_SUGGESTION_FRAC_MIN || frac > ALT_SUGGESTION_FRAC_MAX) return null;

    // Plurality (most common copy count among lists running the card)
    const histogram = new Map();
    for (const entry of perList) {
      const c = entry.count || 0;
      histogram.set(c, (histogram.get(c) || 0) + 1);
    }
    let plurality = naiveCount;
    let pluralityHits = 0;
    for (const [cnt, hits] of histogram) {
      if (hits > pluralityHits || (hits === pluralityHits && cnt > plurality)) {
        plurality = cnt;
        pluralityHits = hits;
      }
    }
    if (plurality === naiveCount) return null;  // already aligned
    const pluralityShare = pluralityHits / perList.length;
    if (pluralityShare < ALT_SUGGESTION_MIN_SHARE) return null;

    // Median placement of the plurality group vs the naive group
    const placesIn = (cnt) => perList
      .filter(e => e.count === cnt)
      .map(e => Number(e.place) || 9999)
      .sort((a, b) => a - b);
    const median = (arr) => arr.length === 0 ? null
      : arr.length % 2 === 1
        ? arr[(arr.length - 1) / 2]
        : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2;

    const pluralityPlaces = placesIn(plurality);
    const naivePlaces     = placesIn(naiveCount);
    const pluralityMedian = median(pluralityPlaces);
    const naiveMedian     = median(naivePlaces);
    if (pluralityMedian == null || naiveMedian == null) return null;

    // Only flag when plurality places MEANINGFULLY better than naive.
    // Direction matches the user's intuition: higher copies should
    // correlate with lower median place (smaller place = better).
    const gap = naiveMedian - pluralityMedian;
    if (gap < ALT_SUGGESTION_MIN_GAP) return null;

    return {
      naive_count:        naiveCount,
      suggested_count:    plurality,
      plurality_share:    pluralityShare,
      plurality_n:        pluralityHits,
      naive_n:            naivePlaces.length,
      plurality_median:   pluralityMedian,
      naive_median:       naiveMedian,
      placement_gap:      gap,
      weighted_avg:       raw,
      direction:          plurality > naiveCount ? 'up' : 'down',
    };
  }

  // ── Phase 2: Core construction ────────────────────────────────────
  //
  // Spec rule 5: start with 90 % threshold; relax to 85 % / 80 % when
  // fewer than CORE_MIN_DISTINCT_CARDS land. Spec rule 6 says count =
  // round(weightedAvgCount). Spec rule 7 — Core slots are claimed
  // before Tech selection.
  function _buildCore(scoredCards, aceSpecCard, trace) {
    let usedThreshold = null;
    let pool          = [];
    for (const thr of CORE_THRESHOLDS) {
      pool = scoredCards.filter(c =>
        c.weightedShare >= thr && !c.is_ace_spec
      );
      if (pool.length >= CORE_MIN_DISTINCT_CARDS) {
        usedThreshold = thr;
        break;
      }
    }
    if (usedThreshold === null) {
      // Even at 80 %, < min. Take what we have at 80 %.
      usedThreshold = CORE_THRESHOLDS[CORE_THRESHOLDS.length - 1];
      pool = scoredCards.filter(c =>
        c.weightedShare >= usedThreshold && !c.is_ace_spec
      );
      trace.push({
        phase: 2, decision: 'core_threshold_relaxed_to_floor',
        threshold: usedThreshold,
        n_core_cards: pool.length,
        detail: `Even at ${(usedThreshold*100).toFixed(0)} % share, only `
              + `${pool.length} cards qualify (< ${CORE_MIN_DISTINCT_CARDS} min). `
              + `Building with what we have; deck will surface a data-quality `
              + `warning downstream.`,
      });
    } else {
      trace.push({
        phase: 2, decision: 'core_threshold_chosen',
        threshold: usedThreshold,
        n_core_cards: pool.length,
      });
    }

    // Each core card → round(weightedAvgCount) copies, clamped to game-
    // legal max (basic energies are exempt; ACE-SPEC max 1 — but ACE
    // is Phase 1, not here).
    const core = pool.map(c => {
      const raw = c.weightedAvgCount;
      let copies = Math.round(raw);
      if (copies < 1) copies = 1;
      const legalMax = c.is_basic_energy ? 59 : 4;
      if (copies > legalMax) copies = legalMax;
      // 2nd Prüfstand — non-blocking suggestion if the plurality of
      // the analysed Tag-2 lists (NICHT des Feldes)
      // places clearly better than the naive group. See
      // _computeAlternativeSuggestion() for thresholds.
      const altSuggestion = _computeAlternativeSuggestion(c, copies);
      if (altSuggestion) {
        trace.push({
          phase: 4.5,
          decision: 'alternative_count_suggestion',
          card: c.name,
          slotType: c.is_energy ? 'energy' : 'core',
          ...altSuggestion,
          detail: `Day-2 list plurality (${altSuggestion.plurality_n}/${altSuggestion.plurality_n + altSuggestion.naive_n} lists) `
                + `plays ${altSuggestion.suggested_count} and places ${altSuggestion.placement_gap.toFixed(0)} `
                + `places better (median P.${altSuggestion.plurality_median.toFixed(0)} vs P.${altSuggestion.naive_median.toFixed(0)}). `
                + `Builder kept ${copies}; consider ${altSuggestion.suggested_count}.`,
        });
      }
      return {
        card:      c,
        count:     copies,
        slotType:  c.is_energy ? 'energy' : 'core',
        _rawAvg:   raw,
        _altSuggestion: altSuggestion || null,
      };
    });

    // Spec rule 5 — give the user enough trace to see what each Core
    // slot cost. Sort by weighted share descending so the log reads
    // top-down by "obviousness".
    core.sort((a, b) => b.card.weightedShare - a.card.weightedShare);
    trace.push({
      phase: 2, decision: 'core_built',
      threshold: usedThreshold,
      slots: core.map(e => ({
        name: e.card.name,
        count: e.count,
        share: e.card.weightedShare,
        avg: e.card._rawAvg,
      })),
      totalCoreCards: core.reduce((s, e) => s + e.count, 0),
    });
    return { core, usedThreshold };
  }

  // ── Phase 3: Tech-package detection (co-occurrence) ───────────────
  //
  // Spec rule 8. For each non-core, non-ACE candidate, compute its
  // package membership: cards X and Y are in the same package when
  // they co-occur in ≥ 70 % of lists where either appears.
  //
  // Output: Map(card_key → packageId), Map(packageId → cardKeys).
  // Packages are connected components in the co-occurrence graph.
  function _detectTechPackages(scoredCards, coreKeys, aceKey, trace) {
    const candidates = scoredCards.filter(c =>
      !coreKeys.has(c.key) && c.key !== aceKey && c.weightedShare > 0
    );
    // We only consider pairs of candidates that ACTUALLY appear with
    // each other in ≥ 1 list — sparse, fast.
    const idxByCard = new Map();
    candidates.forEach((c, i) => idxByCard.set(c.key, i));

    // Build list → set(candidate cards in that list) for fast intersect
    const cardsInList = new Map();
    for (const c of candidates) {
      for (const l of c._lists) {
        if (!cardsInList.has(l)) cardsInList.set(l, new Set());
        cardsInList.get(l).add(c.key);
      }
    }

    // Pair-count: how many lists contain BOTH X and Y
    const pairCount = new Map();
    for (const set of cardsInList.values()) {
      const arr = Array.from(set);
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const k = arr[i] < arr[j] ? `${arr[i]}|${arr[j]}` : `${arr[j]}|${arr[i]}`;
          pairCount.set(k, (pairCount.get(k) || 0) + 1);
        }
      }
    }

    // Per-card list count
    const listCount = new Map();
    for (const c of candidates) listCount.set(c.key, c.n_lists_with);

    // Build union-find: cards X, Y are linked when
    //   #(X ∧ Y) / max(#X, #Y) ≥ TECH_PACKAGE_COOCCURRENCE
    const parent = new Map();
    function find(k) {
      let r = k;
      while (parent.get(r) !== r) r = parent.get(r);
      let cur = k;
      while (parent.get(cur) !== r) {
        const next = parent.get(cur);
        parent.set(cur, r);
        cur = next;
      }
      return r;
    }
    function unite(a, b) {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(ra, rb);
    }
    for (const c of candidates) parent.set(c.key, c.key);

    for (const [pair, both] of pairCount.entries()) {
      const [a, b] = pair.split('|');
      const maxOne = Math.max(listCount.get(a) || 0, listCount.get(b) || 0);
      if (maxOne <= 0) continue;
      if (both / maxOne >= TECH_PACKAGE_COOCCURRENCE) {
        unite(a, b);
      }
    }

    // Materialize packages (only those with >1 member are "real")
    const packageOf = new Map();
    const members = new Map();
    for (const c of candidates) {
      const root = find(c.key);
      packageOf.set(c.key, root);
      if (!members.has(root)) members.set(root, []);
      members.get(root).push(c.key);
    }
    const packages = [];
    for (const [root, mem] of members.entries()) {
      if (mem.length > 1) {
        packages.push({ id: root, members: mem });
      }
    }

    if (packages.length > 0) {
      trace.push({
        phase: 3, decision: 'tech_packages_detected',
        n_packages: packages.length,
        packages: packages.map(p => ({
          id: p.id,
          cards: p.members,
        })),
        threshold: TECH_PACKAGE_COOCCURRENCE,
      });
    } else {
      trace.push({
        phase: 3, decision: 'no_tech_packages',
        detail: `No card pair co-occurred in ≥ ${(TECH_PACKAGE_COOCCURRENCE*100).toFixed(0)} % of their lists.`,
      });
    }
    return { packageOf, packages };
  }

  // ── Phase 4: Tech-card selection ──────────────────────────────────
  //
  // Spec rule 7: fill remaining slots with the highest-weighted tech
  // candidates. Spec rule 8: when a candidate belongs to a package,
  // the whole package goes in together (or stays out together).
  function _selectTechCards(scoredCards, coreKeys, aceKey, packageOf,
                            packages, slotsRemaining, trace) {
    const candidates = scoredCards
      .filter(c =>
        !coreKeys.has(c.key) && c.key !== aceKey && c.weightedShare > 0
      )
      .sort((a, b) => b.weightedShare - a.weightedShare);

    // Group candidates by package; ungrouped cards form singleton
    // pseudo-packages so the ranking logic is uniform.
    const groups = new Map();
    for (const c of candidates) {
      const gid = packageOf.get(c.key) || c.key;
      if (!groups.has(gid)) groups.set(gid, []);
      groups.get(gid).push(c);
    }

    // Group-level score = max(card.weightedShare) within the group —
    // the strongest signal in the package pulls the whole package up.
    //
    /* BEI GLEICHSTAND ENTSCHIED BIS ZUM 05.09.2026 DIE ZEILENNUMMER.
       `Array.prototype.sort` ist stabil, also gewann bei identischem
       `score` schlicht, wer in der CSV weiter oben stand. Live gemessen
       an Mega Excadrill: `switch` (0,75) nahm 10 der 13 Tech-Slots,
       `ultra ball` (0,625) die restlichen 3 — und Brock's Scouting
       (0,625) und Shaymin (0,625) kamen nie an die Reihe. Brock's
       Scouting steht in 5 der 8 Worlds-Listen mit im Schnitt 2,8
       Kopien; es fiel also kein Randslot heraus, sondern ein Sucher,
       den die Mehrheit der Day-2-Piloten dreifach spielt.

       WAS HIER BEWUSST NICHT PASSIERT: die Reihenfolge bei Gleichstand
       umzudrehen. Ausprobiert am 05.09.2026 mit der Regel "bei gleichem
       Anteil zaehlen mehr Kopien" — dann kommt Brock's Scouting mit 3
       hinein, und dafuer fallen Ultra Ball (2) UND Fezandipiti ex (1)
       heraus. Fezandipiti ex ist ein BASIS-Pokemon; es wegzulassen hebt
       die Mulligan-Quote, und die zu senken ist der ganze Zweck dieses
       Bauers. Vier Karten mit identischem Anteil bewerben sich hier um
       drei Slots — welche davon gehen soll, ist eine Deckbau-Frage und
       keine Sortierfrage. Ein Werkzeug, das sie still fuer den Spieler
       beantwortet, hat schon einmal Brock's Scouting verschluckt.

       Also: die Reihenfolge bleibt, wie sie ist, aber sie ist jetzt
       AUSDRUECKLICH das erste Auftreten und nicht mehr ein Nebeneffekt
       der Sortierstabilitaet — und der Gleichstand selbst wird
       protokolliert (siehe `tech_gleichstand` weiter unten). Der Spieler
       sieht damit, dass hier eine Muenze geworfen wurde, und kann selbst
       tauschen. */
    const groupRanking = Array.from(groups.entries())
      .map(([gid, cards]) => ({
        gid,
        cards,
        score: Math.max(...cards.map(c => c.weightedShare)),
        // Der Tiebreak-Wert der Gruppe: die meisten Kopien, die eine
        // ihrer Karten in den AUSGEWERTETEN LISTEN hat — und das sind
        // ausschliesslich Tag-2-Listen. "im Feld" hiess dieses Feld bis
        // zum 07.09.2026 und war falsch: weightedAvgCount ist ein
        // gewichtetes Mittel ueber den Top Cut, nicht ueber das Feld.
        kopienInDenListen: Math.max(...cards.map(c => c.weightedAvgCount || 0)),
        totalCount: cards.reduce(
          (s, c) => s + Math.max(1, Math.round(c.weightedAvgCount)),
          0
        ),
      }))
      .map((g, i) => ({ ...g, _idx: i }))
      .sort((a, b) => (b.score - a.score) || (a._idx - b._idx));

    const tech = [];
    const tracePicks = [];
    let used = 0;
    // Helper: build a tech entry + emit the alternative-count
    // diagnostic if the plurality of the analysed Tag-2 lists (NICHT
    // des Feldes) places clearly better.
    const _emitTech = (c, placed, packageId) => {
      const altSuggestion = _computeAlternativeSuggestion(c, placed);
      if (altSuggestion) {
        trace.push({
          phase: 4.5,
          decision: 'alternative_count_suggestion',
          card: c.name,
          slotType: 'tech',
          ...altSuggestion,
          detail: `Day-2 list plurality (${altSuggestion.plurality_n}/${altSuggestion.plurality_n + altSuggestion.naive_n} lists) `
                + `plays ${altSuggestion.suggested_count} and places ${altSuggestion.placement_gap.toFixed(0)} `
                + `places better (median P.${altSuggestion.plurality_median.toFixed(0)} vs P.${altSuggestion.naive_median.toFixed(0)}). `
                + `Builder kept ${placed}; consider ${altSuggestion.suggested_count}.`,
        });
      }
      tech.push({
        card: c,
        count: placed,
        slotType: 'tech',
        packageId,
        _rawAvg: c.weightedAvgCount,
        _altSuggestion: altSuggestion || null,
      });
      tracePicks.push({ name: c.name, count: placed, share: c.weightedShare, package: packageId || c.key });
    };

    /* WAS NICHT HINEINPASST, VERSCHWAND BISHER SPURLOS.
       Der `break` unten verliess die Schleife, sobald die Slots voll
       waren — ohne Spur. Im Bericht stand danach, was gewaehlt wurde,
       aber nie, was knapp daneben lag. Genau das ist die Frage, die ein
       Spieler stellt, wenn er die Liste mit echten Decklisten
       vergleicht: "warum fehlt Brock's Scouting?"

       CLAUDE.md sagt dazu: melden, nicht stillschweigend reparieren. Der
       Bauer entscheidet weiterhin selbst — aber er sagt jetzt, wen er
       nicht mehr unterbringen konnte und wie knapp es war. */
    const nichtPlatziert = [];
    for (const g of groupRanking) {
      if (used >= slotsRemaining) {
        for (const c of g.cards) {
          nichtPlatziert.push({
            name: c.name,
            share: c.weightedShare,
            wunschAnzahl: Math.max(1, Math.round(c.weightedAvgCount)),
            grund: 'keine Slots mehr frei',
          });
        }
        continue;
      }
      // Will this whole group fit?
      if (used + g.totalCount > slotsRemaining) {
        // Try a single-card pick from the group if possible
        for (const c of g.cards) {
          const cnt = Math.max(1, Math.round(c.weightedAvgCount));
          if (used + cnt > slotsRemaining) {
            nichtPlatziert.push({
              name: c.name,
              share: c.weightedShare,
              wunschAnzahl: cnt,
              grund: `braucht ${cnt}, frei sind noch ${slotsRemaining - used}`,
            });
            continue;
          }
          const placed = Math.min(cnt, c.is_basic_energy ? 59 : 4);
          _emitTech(c, placed, g.gid !== c.key ? g.gid : null);
          // Gebucht wird, was gesetzt wurde — nicht, was gewuenscht war.
          // Vorher stand hier `used += cnt` (ungedeckelt), waehrend der
          // Normalzweig unten `used += placed` bucht. Sobald
          // round(weightedAvgCount) > 4 fuer eine Nicht-Basis-Energie gilt,
          // buchte dieser Zweig mehr als er setzte und das Deck blieb unter
          // 60 Karten. Heute nicht ausloesbar (im Bestand hat keine Karte
          // ausser Basis-Energien mehr als 4 Kopien), aber die beiden
          // Zweige duerfen nicht verschieden rechnen. Gefunden 08.09.2026.
          used += placed;
        }
        continue;
      }
      for (const c of g.cards) {
        const cnt = Math.max(1, Math.round(c.weightedAvgCount));
        const placed = Math.min(cnt, c.is_basic_energy ? 59 : 4);
        _emitTech(c, placed, g.cards.length > 1 ? g.gid : null);
        used += placed;
      }
    }

    trace.push({
      phase: 4, decision: 'tech_filled',
      slotsRemaining,
      cardsPlaced: tech.length,
      cardsCountSum: tech.reduce((s, e) => s + e.count, 0),
      picks: tracePicks,
    });
    /* Wer hat gegen wen eine Muenze verloren? Ein Gleichstand ist nur
       dann eine Information, wenn er BEIDE Seiten nennt: die Karte, die
       hineinkam, und die, die bei identischem Anteil draussen blieb. */
    const nichtGesetzt = new Set(nichtPlatziert.map(k => k.name));
    const gleichstaende = [];
    for (const g of groupRanking) {
      const gleich = groupRanking.filter(x => x.gid !== g.gid && x.score === g.score);
      if (gleich.length === 0) continue;
      const drin  = g.cards.filter(c => !nichtGesetzt.has(c.name)).map(c => c.name);
      const raus  = gleich.flatMap(x => x.cards)
                          .filter(c => nichtGesetzt.has(c.name)).map(c => c.name);
      if (drin.length > 0 && raus.length > 0) {
        gleichstaende.push({ share: g.score, drin, raus });
      }
    }
    if (gleichstaende.length > 0) {
      trace.push({
        phase: 4, decision: 'tech_gleichstand',
        faelle: gleichstaende,
        detail: 'Bei identischem Anteil entscheidet die Reihenfolge des '
              + 'ersten Auftretens — das ist eine Setzung, keine Wertung. '
              + 'Wer hier draussen steht, ist nicht schlechter belegt als '
              + 'der, der drin steht. Genau diese Karten sind es wert, von '
              + 'Hand gegeneinander abzuwaegen.',
      });
    }
    if (nichtPlatziert.length > 0) {
      // Absteigend nach Anteil: was am naechsten dran war, zuerst.
      nichtPlatziert.sort((a, b) => (b.share - a.share)
                                 || (b.wunschAnzahl - a.wunschAnzahl));
      trace.push({
        phase: 4, decision: 'tech_nicht_platziert',
        slotsRemaining,
        anzahl: nichtPlatziert.length,
        karten: nichtPlatziert,
        detail: 'Diese Karten standen im Kandidatenfeld, haben aber nicht '
              + 'mehr in die Tech-Slots gepasst. Die erste davon ist die '
              + 'knappste Entscheidung des ganzen Baus — wer die Liste mit '
              + 'echten Decklisten vergleicht, findet genau hier die '
              + 'Abweichung.',
      });
    }
    return tech;
  }

  // ── Phase 5: trim to 60 if over ───────────────────────────────────
  //
  // Spec rule 9: remove cards with lowest weighted share first.
  // Protect the ACE-SPEC slot — it's a unique slot, and removing it
  // doesn't reclaim 1 copy of anything else useful. Energy gets the
  // same protection only when it's a basic energy (basic energies
  // are exempt from the 4-copy limit so dropping them creates a
  // structural deficit the deckbuilder shouldn't introduce).
  function _trimToSixty(deck, trace) {
    const total = () => deck.reduce((s, e) => s + e.count, 0);
    let cur = total();
    const removed = [];
    while (cur > DECK_SIZE) {
      // Sort by ascending weighted share among removable slots
      const removable = deck
        .map((e, i) => ({ e, i }))
        .filter(({ e }) => e.slotType !== 'ace_spec' && e.count > 0)
        .sort((a, b) => a.e.card.weightedShare - b.e.card.weightedShare);
      if (removable.length === 0) break;
      const target = removable[0];
      target.e.count -= 1;
      removed.push({ name: target.e.card.name, share: target.e.card.weightedShare });
      if (target.e.count === 0) {
        // Mark for compact later
      }
      cur--;
    }
    // Compact zero-count entries
    for (let i = deck.length - 1; i >= 0; i--) {
      if (deck[i].count <= 0) deck.splice(i, 1);
    }
    if (removed.length > 0) {
      trace.push({
        phase: 5, decision: 'trimmed_to_60',
        removed,
      });
    } else {
      trace.push({ phase: 5, decision: 'no_trim_needed', total: cur });
    }
    return deck;
  }

  // ── Phase 6: data-quality validation ──────────────────────────────
  function _assessDataQuality(lists, scoredCards, totalW, trace) {
    /* WORAUF DER BAU WIRKLICH STEHT (05.09.2026).
       "8 decklists analyzed" ist keine Angabe, sondern eine halbe.
       Live gemessen fuer Mega Excadrill: die 8 Listen sind ALLE aus
       EINEM Turnier (Worlds 2026, 28.08., Plaetze 37-122). Das stand
       nirgends — die Zeile trug einen gruenen Haken und `level: info`.
       Die Herkunft ist in `lists` vorhanden und wird deshalb
       mitgegeben: Zahl der Turniere, ihre Namen, das juengste Datum
       und die Spanne der Platzierungen. Der Aufrufer kann daraus
       einen ehrlichen Satz bauen. */
    const _turnierNamen = [];
    const _turnierIds = new Set();
    let _juengstes = '';
    let _platzMin = null, _platzMax = null;
    for (const l of lists) {
      const tid = String(l.tournament_id || '').trim();
      if (tid && !_turnierIds.has(tid)) {
        _turnierIds.add(tid);
        const nm = String(l.tournament_name || '').trim();
        if (nm) _turnierNamen.push(nm);
      }
      const d = String(l.tournament_date || '').trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && d > _juengstes) _juengstes = d;
      const p = Number(l.place);
      if (Number.isFinite(p) && p > 0) {
        if (_platzMin == null || p < _platzMin) _platzMin = p;
        if (_platzMax == null || p > _platzMax) _platzMax = p;
      }
    }
    /* DER NENNER, DER BISHER FEHLTE (07.09.2026).
       "8 Listen ausgewertet" laesst offen, WOVON acht. Die CSV fuehrt
       nur Tag-2-Listen (siehe PLACEMENT_WEIGHT_BANDS), also sind acht
       Listen bei Mega Excadrill acht von 32 Piloten in einem Feld von
       797 — nicht acht Leute, die das Deck gespielt haben.

       Beide Zusatzzahlen stehen in labs_tournament_decks.csv und werden
       von dort geholt, nicht abgeschrieben: `player_count` je
       (Turnier x Archetyp) und `total_players` je Turnier. Fehlt eine
       davon fuer auch nur EIN beteiligtes Turnier, bleibt sie null —
       eine halb summierte Feldgroesse waere eine erfundene Zahl. */
    const _arch = _norm((lists[0] && lists[0].deck_archetype) || '');
    let _piloten = 0, _feld = 0;
    const _online = lists.filter(l => (l.quelle || '') === 'online').length;
    let _pilotenVollstaendig = !!_arch, _feldVollstaendig = _turnierIds.size > 0;
    for (const tid of _turnierIds) {
      const pc = _archetypPiloten ? _archetypPiloten.get(tid + '|' + _arch) : undefined;
      if (Number.isFinite(pc) && pc > 0) _piloten += pc; else _pilotenVollstaendig = false;
      const tp = _tournamentSizes ? _tournamentSizes.get(tid) : undefined;
      if (Number.isFinite(tp) && tp > 0) _feld += tp; else _feldVollstaendig = false;
    }
    const dq = {
      n_lists:               lists.length,
      total_weight:          totalW,
      n_distinct_cards:      scoredCards.length,
      sufficient:            lists.length >= MIN_WEIGHTED_LISTS,
      warning:               '',
      n_turniere:            _turnierIds.size,
      turniere:              _turnierNamen.slice(0, 5),
      juengstes_turnier:     _juengstes,
      platz_von:             _platzMin,
      platz_bis:             _platzMax,
      /* Ob die Grundgesamtheit noch der Tag-2-Cut IST — gemessen,
         nicht behauptet.
         Bis zum 10.09.2026 stand hier fest `true`. Das war richtig,
         solange nur der Papier-Scraper in die CSV schrieb. Seit
         Wochenlauf #135 stehen dort auch Online-Listen, und dort ist
         JEDE Liste des Feldes veroeffentlicht. Ein Bau, der beide
         mischt, darf sich nicht "Tag 2" nennen. */
      nur_tag2:              _online === 0,
      n_online:              _online,
      n_piloten:             _pilotenVollstaendig ? _piloten : null,
      feldgroesse:           _feldVollstaendig ? _feld : null,
    };
    if (!dq.sufficient) {
      /* Die Schwelle ist eine STICHPROBENUNTERGRENZE, keine Aussage
         ueber das Feld: unter drei Listen gibt es nichts zu mitteln.
         Sie bleibt bei 3 — dass die Grundgesamtheit der Tag-2-Cut ist,
         aendert daran nichts, weil sie nicht am Feld haengt. Was sich
         aendert, ist die Beschriftung: "3 decklists" waren immer schon
         3 TAG-2-Listen. Ob 3 der richtige Wert ist, ist NICHT GEPRUEFT
         — hier wurde nur die Beschreibung richtiggestellt. */
      dq.warning = `Only ${lists.length} day-2 decklist(s) for this archetype — `
                 + `below ${MIN_WEIGHTED_LISTS} the algorithm can't produce a `
                 + `representative build. Note that limitless publishes lists `
                 + `from day 2 onward, so this is the top cut, not the field. `
                 + `Try widening the tournament filter.`;
      trace.push({
        phase: 6, decision: 'data_too_thin',
        n_lists: lists.length,
        threshold: MIN_WEIGHTED_LISTS,
      });
    } else {
      trace.push({
        phase: 6, decision: 'data_ok',
        n_lists: lists.length,
        total_weight: Number(totalW.toFixed(3)),
        n_distinct_cards: scoredCards.length,
      });
    }
    return dq;
  }

  // ── Public entry ──────────────────────────────────────────────────
  /**
   * @param {string} archetype  The deck_archetype label (must match
   *   the per-decklist CSV's deck_archetype column).
   * @param {Object} opts
   *   opts.minDate — ISO "YYYY-MM-DD": drop decklists dated before it
   *   (format gate: after a set rotation the CSV is 100% previous-format
   *   until the first current-format Major is scraped, and building from
   *   it would reproduce the OLD format's deck). Lists whose
   *   tournament_date is missing or not ISO are KEPT — dropping rows we
   *   cannot date would be a silent repair.
   * @returns {Object}
   *   {
   *     deck: [{ card, count, slotType, packageId? }],
   *     trace: [{ phase, decision, ... }],
   *     dataQuality: { n_lists, ... },
   *     archetype, totalWeight,
   *   }
   *   Returns null when data isn't loaded or archetype has zero lists.
   */
  async function build(archetype, opts) {
    opts = opts || {};
    await _loadAll();

    const trace = [];
    let lists = listsForArchetype(archetype);
    if (!lists.length) {
      return {
        deck: [], trace: [{ phase: 0, decision: 'no_lists_for_archetype',
                            archetype }], dataQuality: { n_lists: 0, sufficient: false,
                            warning: `No per-decklist data for "${archetype}".` },
        archetype,
      };
    }

    // Format gate (opts.minDate, ISO). The CSV's tournament_date is ISO;
    // anything that isn't parseable as ISO is kept rather than guessed at.
    const minDate = /^\d{4}-\d{2}-\d{2}$/.test(String(opts.minDate || ''))
      ? String(opts.minDate) : null;
    if (minDate) {
      const before = lists.length;
      lists = lists.filter(l => {
        const d = String(l.tournament_date || '').trim().slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
        return d >= minDate;
      });
      if (lists.length !== before) {
        trace.push({
          phase: 0, decision: 'previous_format_lists_dropped',
          dropped: before - lists.length, kept: lists.length,
          min_date: minDate,
        });
      }
      if (!lists.length) {
        return {
          deck: [], trace,
          dataQuality: {
            n_lists: 0, sufficient: false,
            warning: `All ${before} decklist(s) for "${archetype}" predate `
                   + `the current format window (first legal in-person day `
                   + `${minDate}) — previous-format lists must not shape a `
                   + `current-format build.`,
          },
          archetype,
        };
      }
    }

    const cardDb = _getCardDb();
    const scored = _computeCardScores(lists, _tournamentSizes, cardDb);
    const dq = _assessDataQuality(lists, scored.cards, scored.totalW, trace);
    if (!dq.sufficient) {
      return { deck: [], trace, dataQuality: dq, archetype };
    }

    // Phase 1: ACE-SPEC pick
    const aceSpec = _pickAceSpec(scored.cards, trace);
    const aceKey = aceSpec ? aceSpec.key : null;

    // Phase 2: Core
    const { core, usedThreshold } = _buildCore(scored.cards, aceSpec, trace);
    const coreKeys = new Set(core.map(e => e.card.key));

    // Assemble the in-progress deck (ACE-SPEC + Core)
    let deck = [];
    if (aceSpec) {
      deck.push({
        card: aceSpec, count: 1, slotType: 'ace_spec',
        _rawAvg: 1,
      });
    }
    deck.push(...core);
    const sumSoFar = deck.reduce((s, e) => s + e.count, 0);

    // Phase 3 + 4: Tech packages + Tech selection
    const { packageOf, packages } =
      _detectTechPackages(scored.cards, coreKeys, aceKey, trace);
    const slotsRemaining = DECK_SIZE - sumSoFar;
    if (slotsRemaining > 0) {
      const tech = _selectTechCards(
        scored.cards, coreKeys, aceKey, packageOf, packages,
        slotsRemaining, trace
      );
      deck.push(...tech);
    } else {
      trace.push({
        phase: 4, decision: 'no_tech_slots',
        detail: `Core + ACE-SPEC already at ${sumSoFar} cards.`,
      });
    }

    // Phase 5: trim if over 60
    deck = _trimToSixty(deck, trace);

    // scoredCards: the FULL per-card scoring, so the caller can show what
    // the build almost took (swap-candidate bench). Stripped of _lists /
    // _perListCounts: those are back-references into every parsed list —
    // measured 20.5 MB JSON for one archetype vs 33 KB without (620x).
    const scoredCardsOut = scored.cards.map(c => {
      const { _lists, _perListCounts, ...rest } = c;
      return rest;
    });

    return {
      deck,
      trace,
      dataQuality: dq,
      archetype,
      totalWeight:   scored.totalW,
      coreThreshold: usedThreshold,
      scoredCards:   scoredCardsOut,
      kategorien:    _kategorieDeckung(lists, deck),
    };
  }

  /* Wie viele der Praesenzlisten spielen ueberhaupt eine Karte dieser
   * Kategorie — und wie viele hat der Bau daraus genommen?
   *
   * ANLASS (01.09.2026). Der Betreiber sah im Aggregat "18 von 28 Decks
   * spielen ein Stadion" und im Bau kein einziges. Beides stimmte: der
   * Bau rechnet nur mit den Praesenzlisten (Worlds, n = 8, dort 3 von 8),
   * das Aggregat zaehlt Online mit. Zwei Grundgesamtheiten auf einem
   * Bildschirm, ohne dass eine von beiden sagt, welche sie ist.
   *
   * WARUM DER BAU TROTZDEM SO BLEIBT. Zwei Messrunden:
   *   - Sechs Kategorie-Regeln durchgerechnet, keine schlaegt den
   *     heutigen Bau (56,92 von 60 gegen beste Variante 56,50).
   *   - Die Gewichtung Praesenz-gegen-Online durchgefahren (k = 0 bis
   *     unendlich): die Kurve ist flach, bester Wert 54,47 gegen 54,16,
   *     95-%-Intervall [-0,02; +0,67] — enthaelt die Null.
   *   Und bei KEINEM k landet ein Stadion im Bau, auch nicht bei reinem
   *   Online: 15 Listen spielen eines, aber vier verschiedene, der
   *   Erwartungswert bleibt bei 0,8 Karten. Es ist kein
   *   Gewichtungsproblem.
   *
   * Also nicht der Bau aendert sich, sondern was danebensteht. Diese
   * Zahlen sind die Praesenzseite — exakt, weil hier echte Listen
   * vorliegen und Kookkurrenz messbar ist. Die Online-Seite kommt aus
   * dem Aggregat und wird im Aufrufer erganzt; sie ist eine Naeherung
   * (Summe der Einzelkarten-Anteile), und das muss dort dranstehen. */
  function _kategorieDeckung(lists, deck) {
    /* ZWEI FEHLER, DIE SICH GEGENSEITIG VERSTECKT HABEN
       (05.09.2026, nachgestellt mit dem echten Modul unter node).

       1. `kat(e)` bekam einen DECK-EINTRAG `{card, count, slotType}`.
          `e.type` gibt es dort nicht — `kat` las `''` und gab
          'Pokemon' zurueck. Richtig ist `kat(e.card)`.
       2. Auch die Listenseite war blind: `l.cards[].type` kommt aus der
          Spalte `type` von data/tournament_decklists_per_player.csv,
          und die ist in ALLEN 30.459 Zeilen leer (gemessen; auch in
          allen 163 Mega-Excadrill-Zeilen). `_enrichCard` laeuft nur
          auf einer Kopie in `_computeCardScores`, nicht auf `l.cards`.

       Ergebnis am laufenden Modul, Archetyp Mega Excadrill:
       `kategorien = {"Pokemon":{"listenMit":8,"listen":8,"gebaut":60}}`
       — ein einziger Eintrag, alle 60 Karten als Pokemon.

       Damit feuerte die Zeile in js/app-deck-builder.js:7060, die genau
       deswegen gebaut wurde ("18 von 28 Decks spielen ein Stadion, der
       Bau spielt keins"), NIE: pMajor war immer 100 %, pOnline durch
       `Math.min(roh, onlineListen)` ebenfalls, `|0| < 15` -> continue.
       Die Frage des Betreibers vom 01.09. ist bis heute unbeantwortet —
       und sie ist bei Mega Excadrill akut: der Bau hat kein Stadion,
       das Online-Feld spielt zu rund 30 % Gravity Mountain.

       Jetzt werden BEIDE Seiten angereichert, und wenn die
       Anreicherung nichts findet, wird das gemeldet statt behauptet
       (`unbestimmt: true`) — eine Kategorie-Deckung ohne Typen ist
       keine Aussage. */
    const cardDb = _getCardDb();
    const typVon = (c) => {
      if (!c) return '';
      if (c.type) return String(c.type);
      if (!cardDb || !c.set_code || !c.set_number) return '';
      const key = `${c.set_code}-${c.set_number}`;
      const meta = cardDb.get(key) || cardDb.get(String(key).toLowerCase());
      return meta && meta.type ? String(meta.type) : '';
    };
    const kat = (c) => {
      const typ = typVon(c);
      if (!typ) return 'Pokemon';
      const k = typ.toLowerCase();
      if (k.indexOf('special energy') !== -1) return 'Special Energy';
      if (k.indexOf('energy') !== -1) return 'Basic Energy';
      if (/^[GRWLPFDMNC]/.test(typ)) return 'Pokemon';
      if (typ === 'Supporter') return 'Supporter';
      if (typ === 'Item') return 'Item';
      if (typ === 'Tool') return 'Tool';
      if (typ === 'Stadium') return 'Stadium';
      return 'Pokemon';
    };
    const raus = {};
    const n = (lists || []).length;
    for (const l of (lists || [])) {
      const gesehen = new Set();
      for (const c of (l.cards || [])) gesehen.add(kat(c));
      for (const k of gesehen) {
        raus[k] = raus[k] || { listenMit: 0, listen: n, gebaut: 0 };
        raus[k].listenMit += 1;
      }
    }
    for (const e of (deck || [])) {
      const k = kat(e && e.card ? e.card : e);
      raus[k] = raus[k] || { listenMit: 0, listen: n, gebaut: 0 };
      raus[k].gebaut += (e.count || 0);
    }
    for (const k of Object.keys(raus)) raus[k].listen = n;
    /* Der ehrliche Rueckfall: bleibt am Ende genau eine Kategorie
       uebrig und ist das ausgerechnet 'Pokemon', dann hat die
       Typaufloesung nichts geliefert. Ein Deck aus 60 Pokemon gibt es
       nicht — das ist kein Befund, sondern eine fehlende Angabe. */
    const schluessel = Object.keys(raus);
    if (schluessel.length <= 1 && (schluessel.length === 0 || schluessel[0] === 'Pokemon')) {
      raus._unbestimmt = true;
    }
    return raus;
  }

  /* EINE FORMULIERUNG FUER ALLE ANZEIGEN (07.09.2026).
     Die Listenzahl stand an vier Stellen im Deckbauer und ueberall
     nackt da ("8 Listen ausgewertet"). Sie hier EINMAL zu bauen ist
     nicht Kosmetik: solange jede Stelle ihren eigenen Satz baut, kann
     eine davon den Tag-2-Hinweis wieder verlieren, ohne dass es
     auffaellt. Vorbild ist die Kachel in js/app-past-meta.js:1160-1184
     ("Tag-2-Decklisten" plus Erklaerung im title).

     Regel fuer die Zusatzzahlen: sie kommen aus dq und NUR aus dq. Ist
     dq.n_piloten oder dq.feldgroesse null, faellt der jeweilige
     Halbsatz ersatzlos weg — die Listenzahl mit dem Wort Tag 2 steht
     dann allein, geraten wird keine Feldgroesse. */
  function _istDeutsch(lang) {
    if (lang === 'de') return true;
    if (lang === 'en') return false;
    try {
      if (typeof global.getLang === 'function') return global.getLang() === 'de';
    } catch (_) { /* egal */ }
    return true;
  }

  /**
   * Der Satz, der an der Zahl steht.
   * @param {Object} dq  dataQuality aus build()
   * @param {string} [lang]  'de' | 'en'; sonst getLang()
   * @returns {string} z. B. "8 Tag-2-Listen von 32 Piloten (Feld 797)"
   */
  function datenbasisSatz(dq, lang) {
    const d = dq || {};
    const n = Number(d.n_lists || 0);
    const de = _istDeutsch(lang);
    const zahl = (x) => de ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(x);
    /* "Tag-2-Listen" nur, solange es wirklich nur Tag-2-Listen sind.
       Mischt der Bau Online-Listen dazu (dq.nur_tag2 === false), waere
       das Wort falsch — dann steht die nackte Listenzahl und der
       Online-Anteil daneben. */
    const online = Number(d.n_online || 0);
    const gemischt = d.nur_tag2 === false || online > 0;
    const kopf = gemischt
      ? (de
        ? `${zahl(n)} ${n === 1 ? 'Liste' : 'Listen'}`
          + (online > 0 ? ` (davon ${zahl(online)} online)` : '')
        : `${zahl(n)} ${n === 1 ? 'list' : 'lists'}`
          + (online > 0 ? ` (${zahl(online)} online)` : ''))
      : (de
        ? `${zahl(n)} Tag-2-${n === 1 ? 'Liste' : 'Listen'}`
        : `${zahl(n)} day-2 ${n === 1 ? 'list' : 'lists'}`);
    const piloten = Number.isFinite(d.n_piloten) && d.n_piloten > 0 ? d.n_piloten : null;
    const feld    = Number.isFinite(d.feldgroesse) && d.feldgroesse > 0 ? d.feldgroesse : null;
    let satz = kopf;
    if (piloten !== null) {
      satz += de ? ` von ${zahl(piloten)} Piloten` : ` from ${zahl(piloten)} pilots`;
    }
    if (feld !== null) {
      satz += de ? ` (Feld ${zahl(feld)})` : ` (field ${zahl(feld)})`;
    }
    return satz;
  }

  /** Die Erklaerung fuer den title-Text daneben. */
  function datenbasisHinweis(dq, lang) {
    const d = dq || {};
    const de = _istDeutsch(lang);
    const piloten = Number.isFinite(d.n_piloten) && d.n_piloten > 0 ? d.n_piloten : null;
    const feld    = Number.isFinite(d.feldgroesse) && d.feldgroesse > 0 ? d.feldgroesse : null;
    // Dieselbe Tausenderschreibung wie im Satz daneben — sonst steht in
    // der Kachel "6.572" und im Tooltip "6572".
    const zahl = (x) => de ? String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : String(x);
    const nL = zahl(Number(d.n_lists || 0));
    const online = Number(d.n_online || 0);
    if (de) {
      let t = online > 0
        ? `Gemischte Grundlage: ${zahl(online)} der ${nL} Listen kommen aus `
          + 'Online-Turnieren, wo JEDE Liste des Feldes veroeffentlicht wird. '
          + 'Der Rest kommt von limitlesstcg.com, das Decklisten erst ab '
          + 'Tag 2 zeigt'
        : 'Limitless veroeffentlicht Decklisten erst ab Tag 2. Der Bau steht '
          + 'deshalb auf dem Top Cut, nicht auf dem ganzen Feld';
      if (piloten !== null) {
        t += ` — ${zahl(piloten)} Spieler haben diesen Archetyp gespielt, `
           + `veroeffentlicht sind ${nL} ihrer Listen`;
      }
      if (feld !== null) t += `, bei ${zahl(feld)} Spielern im Feld`;
      return t + '.';
    }
    let t = online > 0
      ? `Mixed basis: ${online} of ${nL} lists come from online tournaments, `
        + 'where every list in the field is published. The rest come from '
        + 'limitlesstcg.com, which shows decklists from day 2 onward'
      : 'Limitless publishes decklists from day 2 onward, so this build rests '
        + 'on the top cut, not the whole field';
    if (piloten !== null) {
      t += ` — ${piloten} players ran this archetype, `
         + `${nL} of their lists are published`;
    }
    if (feld !== null) t += `, out of ${feld} players in the field`;
    return t + '.';
  }

  /**
   * Feldgroesse und Pilotenzahl fuer EIN Turnier x Archetyp — fuer
   * Anzeigen, die keine dataQuality haben (Schnellreferenz-Kachel).
   * Gibt null zurueck, wo die Datei nichts hergibt.
   */
  function turnierFeld(tournamentId, archetyp) {
    const tid = String(tournamentId || '').trim();
    const a = _norm(archetyp);
    const tp = _tournamentSizes ? _tournamentSizes.get(tid) : undefined;
    let pc = (_archetypPiloten && a) ? _archetypPiloten.get(tid + '|' + a) : undefined;
    if (pc === undefined && _archetypBruecke && a && _archetypBruecke.has(a)) {
      // Erst der eigene Name, dann die Bruecke. Nie umgekehrt.
      pc = _archetypPiloten.get(tid + '|' + _archetypBruecke.get(a));
    }
    return {
      feldgroesse: Number.isFinite(tp) && tp > 0 ? tp : null,
      n_piloten:   Number.isFinite(pc) && pc > 0 ? pc : null,
    };
  }

  /* ── WIE DUENN DER BESTAND WIRKLICH IST — GERECHNET, NICHT NOTIERT ──
   *
   * BEFUND (07.09.2026, Nachpruefung): im Kommentar an der Ablehnung in
   * js/app-deck-builder.js stand "elf mit EINER Liste, vier mit zweien".
   * Nachgezaehlt an data/tournament_decklists_per_player.csv sind es
   * ZEHN und FUENF. Die Zahl war nicht falsch gerechnet, sie war
   * abgeschrieben und danach stehen geblieben — der Wochenlauf schiebt
   * die Verteilung, der Satz nicht.
   *
   * Deshalb steht sie hier als Rechnung. Gezaehlt werden LISTEN
   * (Schluessel tournament_id|player_name|place, siehe _loadAll), nach
   * `deck_archetype` gruppiert; das Formatfenster ist dieselbe Grenze,
   * die build() ueber opts.minDate anlegt, und dieselbe Regel: eine
   * Liste ohne ISO-Datum bleibt drin, statt geraten zu werden.
   *
   * `bestandsLageAus` ist absichtlich rein — sie bekommt die Listen
   * gereicht und liest nichts. `bestandsLage` ist der Anschluss an den
   * geladenen Bestand; ohne geladene Daten gibt sie null zurueck,
   * statt eine 0 zu erfinden.
   */
  function bestandsLageAus(listen, minDate) {
    if (!Array.isArray(listen)) return null;
    const grenze = /^\d{4}-\d{2}-\d{2}$/.test(String(minDate || ''))
      ? String(minDate) : null;
    const imFenster = listen.filter((l) => {
      if (!grenze) return true;
      const d = String((l && l.tournament_date) || '').trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
      return d >= grenze;
    });
    const proArchetyp = new Map();
    for (const l of imFenster) {
      const a = String((l && l.deck_archetype) || '').trim();
      if (!a) continue;
      proArchetyp.set(a, (proArchetyp.get(a) || 0) + 1);
    }
    const verteilung = {};
    let unterSchwelle = 0;
    for (const n of proArchetyp.values()) {
      if (n >= MIN_WEIGHTED_LISTS) continue;
      unterSchwelle += 1;
      verteilung[n] = (verteilung[n] || 0) + 1;
    }
    return {
      quelle:            DATA_URL,
      felder:            ['deck_archetype', 'tournament_date'],
      min_date:          grenze,
      schwelle:          MIN_WEIGHTED_LISTS,
      listen_gesamt:     listen.length,
      listen_im_fenster: imFenster.length,
      archetypen:        proArchetyp.size,
      unter_schwelle:    unterSchwelle,
      erreichen:         proArchetyp.size - unterSchwelle,
      verteilung,
    };
  }

  /** Dasselbe fuer den geladenen Bestand. Ohne Daten: null. */
  function bestandsLage(minDate) {
    if (!_byList) return null;
    return bestandsLageAus([..._byList.values()], minDate);
  }

  global.MostConsistencyBuilder = {
    build,
    loadData:           _loadAll,
    isAvailable,
    listsForArchetype,
    datenbasisSatz,
    datenbasisHinweis,
    turnierFeld,
    bestandsLage,
    bestandsLageAus,
    BELEGTE_FELDER,
    /* Die Stichprobenuntergrenze gehoert nach draussen (Befund B5,
       07.09.2026). Faellt ein Archetyp darunter, baut der Aufrufer ueber
       den Alt-Pfad weiter — und muss hinschreiben koennen, WORUNTER er
       gefallen ist. Ohne diesen Export haette er die 3 abschreiben
       muessen, und dann gaebe es die Zahl zweimal. */
    MIN_WEIGHTED_LISTS,
    /* Die vier Schwellen des Alternativvorschlags. Exportiert am
       10.09.2026, damit tests/unit/test-alt-vorschlag-schwelle.js sie
       messen kann, ohne sie abzuschreiben — eine abgeschriebene
       Schwelle prueft nur die Kopie. */
    ALT_SUGGESTION_SCHWELLEN: {
      FRAC_MIN:   ALT_SUGGESTION_FRAC_MIN,
      FRAC_MAX:   ALT_SUGGESTION_FRAC_MAX,
      MIN_SHARE:  ALT_SUGGESTION_MIN_SHARE,
      MIN_SAMPLE: ALT_SUGGESTION_MIN_SAMPLE,
      MIN_GAP:    ALT_SUGGESTION_MIN_GAP,
    },
    // Exposed for unit tests / future "explain why" UIs:
    _internals: {
      placementWeight:  _placementWeight,
      sizeWeight:       _sizeWeight,
      ausgelasseneOnlineZeilen:   () => _ausgelasseneOnlineZeilen,
      ausgelasseneOnlineTurniere: () => _ausgelasseneOnlineTurniere.slice(),
      isBasicEnergy:    _isBasicEnergy,
      isEnergy:         _isEnergy,
      isAceSpec:        _isAceSpec,
      alternativVorschlag: _computeAlternativeSuggestion,
    },
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { _loadAll().catch(()=>{}); });
    } else {
      setTimeout(() => _loadAll().catch(()=>{}), 100);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
