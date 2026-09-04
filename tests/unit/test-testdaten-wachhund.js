/**
 * Wachhund gegen die teuerste Testsorte dieses Projekts:
 * ein Unit-Test, der eine Eigenschaft der LIVE-Daten behauptet.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * `deploy-pages.yml` bricht bei jedem roten Unit-Test ab. Ein Test, der
 * behauptet "der roh beste Wert kommt von einer winzigen Stichprobe" oder
 * "in den Top 10 steht ein duennes Deck", sagt nichts ueber den Code — er
 * sagt, wie das Feld in DIESER Woche aussieht. Der naechste Datenlauf macht
 * ihn rot, und die Auslieferung steht, ohne dass irgendwo ein Defekt ist.
 *
 * Das ist viermal passiert, immer in derselben Datei:
 *
 *   18.08.2026  test-conversion-performance.js  21 Stunden Deploy blockiert
 *   28.08.2026  dieselbe Datei, die uebrig gebliebene Vorbedingung
 *               (`byRaw[0].brought < 20`)       13 Stunden blockiert
 *
 * Jedes Mal wurde die rote Zeile entfernt und die naechste stehen gelassen.
 * Dieser Wachhund macht daraus eine bewusste Entscheidung: wer einen Test
 * an die Live-Daten haengt, muss ihn hier eintragen und begruenden.
 *
 * DIE REGEL
 *
 *   Eigenschaften des CODES gehoeren an Daten, die der Test selbst setzt.
 *   Beobachtungen ueber die AKTUELLEN Daten gehoeren in den Data Guardian
 *   (scripts/data_guardian.py) — der meldet WARN und stoppt nichts.
 *
 * Zulaessig an Live-Daten sind: Struktur (Spalten da, Schema stimmt),
 * Parsebarkeit, und WEITE Baender mit Begruendung ("darf sich bewegen,
 * nur nicht davonlaufen"). Nicht zulaessig ist eine enge Zahl, die aus
 * dem Feld dieser Woche abgelesen wurde.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const UNIT = path.join(__dirname);

const liestLiveDaten = (t) =>
    /readFileSync\([^)]*(path\.join\([^)]*['"]data['"]|['"]data\/|ROOT[^)]*data)/.test(t) ||
    /join\(ROOT,\s*['"]data['"]/.test(t);

// assert.ok(... irgendwas < 5 ...) — eine Ungleichung gegen eine feste Zahl.
const UNGLEICHUNG = /assert\.ok\([^;]*[<>]=?\s*-?\d/;

function dateienMitDatenzugriff() {
    return fs.readdirSync(UNIT)
        .filter(f => f.startsWith('test-') && f.endsWith('.js'))
        .filter(f => liestLiveDaten(fs.readFileSync(path.join(UNIT, f), 'utf8')));
}

function ungleichungen(datei) {
    return fs.readFileSync(path.join(UNIT, datei), 'utf8').split('\n')
        .filter(z => {
            const s = z.trim();
            if (s.startsWith('//') || s.startsWith('*')) return false;
            return UNGLEICHUNG.test(z);
        }).length;
}

/**
 * Das Register. Jede Testdatei, die eine Datei aus data/ liest, steht hier
 * mit einem Satz dazu, WARUM das in Ordnung ist. Eine neue Datei ohne
 * Eintrag laesst diesen Test fallen — genau das ist der Zweck.
 */
const REGISTER = {
    'test-champions-base-stats.js':      'Schema der Statuswerte, keine Zahlenbaender',
    'test-champions-damage.js':          'Rechenwege am Schadensmodell; Baender sind physikalisch (Chance zwischen 0 und 1)',
    'test-champions-matchups.js':        'Struktur der Matchup-Datei, Rechnung an gesetzten Werten',
    'test-hub-gezaehlte-antritte.js':    'Gezaehlte Antritte: ruft answerModel() und answerHtml() mit den echten Zeilen auf und rechnet jede angezeigte Zahl gegen die CSV nach — Anteil, Quote, Feldschnitt und Nenner muessen aus denselben zwei Zahlen folgen, die daneben stehen. Das sind GLEICHUNGEN gegen die Datei, keine Behauptungen ueber Wochenwerte: welche Zahlen dort stehen, ist der Pruefung egal, sie muessen nur zueinander passen. Dazu Eigenschaften der Spalten (ganze Zahlen, keine Top 8 ueber den Antritten), das Alles-oder-nichts-Tor gegen kaputte Werte und seit dem 02.09.2026 die Probe, dass das Vielfache im Satz und auf jeder Kachel aus den beiden Zahlen folgt, die daneben stehen.',
    'test-stufen-im-text.js':            'Stufen im Attackentext: liest die 494 Attacken aus champions_resources.json und die Stufentabelle aus champions_statuszustaende.json. Geprueft werden EIGENSCHAFTEN, keine Wochenwerte: dass keine Marke auf Genauigkeit, Fluchtwert oder Volltreffer sitzt (die folgen laut den Daten selbst einer anderen Tabelle), dass jede Stufe eine der sechs bekannten ist, dass benannte Attacken ihre Marke tragen, und dass Tabelle und Formel uebereinstimmen. Attackenbeschreibungen sind gepflegter Text, keine Wochenzahlen.',
    'test-vier-ansichten-eine-quote.js': 'Vier Ansichten, eine Quote: liest online_tournament_top8_decks.csv, um die vier Rechenwege GEGENEINANDER zu pruefen — nicht gegen Wochenwerte. Die fuenf Ungleichungen sind Eigenschaften der Datei, keine Behauptungen ueber diese Woche: dass sie ueberhaupt Zeilen hat (>20), und dass sich gewichtete und gezaehlte Spalte bei genug Zeilen unterscheiden (>5) — ohne diesen Unterschied wuerde der Vergleich stillschweigend nichts pruefen, was genau der Fehler war, den die Abnahme am 02.09.2026 gefunden hat. Welche Zahlen dort stehen, ist der Pruefung egal; alle Vergleiche sind Gleichungen zwischen zwei Rechenwegen auf denselben Zeilen.',
    'test-team-rechner.js':              'Team-Rechner: liest data/, um echte Paare zu bilden — welche, ist der Pruefung egal. Verglichen wird die Matrixzelle mit bestMove() auf denselben Daten (Gleichheit zweier Rechenwege), der Spiegelkampf (gilt fuer jedes Pokemon) und die Namensaufloesung ueber den Slug (eine Eigenschaft der Zuordnung). Die EINE Ungleichung ist eine Eigenschaft der Urteilsregel, kein Wochenwert: unter 5 % der farbigen Zellen duerfen sich auf einen K.O. unter 50 % Chance stuetzen. Vor der Korrektur am 02.09.2026 waren es 30 %; die Schranke haelt, solange die Regel ueber den Durchschnittswurf wertet, und faellt, wenn jemand sie auf ko.hits zurueckdreht.',
    'test-champions-speed-tiers.js':     'Sortierlogik an gesetzten Werten; die letzte Zusicherung an der Datenlage ist am 31.08.2026 entfallen',
    'test-champions-sprites.js':         'nur Existenz von Sprite-Eintraegen, keine Ungleichung',
    'test-comparison-csv-comma-parse.js':'Parsebarkeit des Komma-Formats, Struktur',
    'test-conversion-performance.js':    'Feldquote als weites Band; die Wochenbehauptungen sind am 28.08. entfernt worden',
    'test-datenlage-comparison-html.js': 'Dateigroesse als Obergrenze — eine Zusicherung ueber den Erzeuger, nicht ueber das Feld',
    'test-datenstand.js':                'Schema von data_stand.json und Einbindung in den Wochenlauf',
    'test-deckempfehlung-anzeige.js':    'Anzeigelogik an gesetzten Werten, Datei nur auf Schema geprueft',
    'test-design-depth.js':              'liest data/ nur fuer Pfadaufloesung, prueft CSS',
    'test-kartenart-und-drucke.js':      'Kartentypen und Drucke: Struktur; ein weites Band auf Ultra-Ball-Drucke',
    'test-metacall-boden-verhalten.js': 'rechnet Boden- und Klebrigkeits-Aggregation gegen data/, behauptet aber KEINE Wochenwerte: geprueft werden Eigenschaften der Rechnung (bei einem Turnier ist jede Klebrigkeit null), Richtungen (die Huerde kappt keine Spitze) und Konsistenz zwischen Kommentar und Zahl. Genau diese Datei existiert, weil eine reine Quelltext-Zusage eine falsche Begruendung nicht bemerken konnte',
    'test-metacall-namensbruecke.js': 'liest data/archetype_aliases.json — eine gepflegte Namensliste, keine Wochenzahlen; sie aendert sich nur, wenn jemand ein Paar von Hand eintraegt',
    'test-nenner-und-rundung.js':        'Rundungsvertrag; Abweichungen sind Toleranzen der Rechnung, keine Feldwerte. Seit dem 04.09.2026 ausserdem eine Probe an einem GESETZTEN Feld: aus einem bekannten N und dessen eigenen gerundeten Anteilen muss wieder N herauskommen. Die fing eine Mutation, an der alle Livedaten-Proben vorbeiliefen.',
    'test-labs-trennzeichen.js':         'Trennzeichen und Wirkung des Labs-Gewichts. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad erst in eine Konstante legt und danach liest — dieselbe Luecke, die weiter unten als "ein Viertel dessen, was er zu bewachen behauptet" beschrieben ist. Ihre Zusicherungen sind Eigenschaften des Motors, keine Wochenwerte: dass die Labs-Daten viele Bewertungen bewegen und mindestens eine um einen ganzen Punkt. Die frueher hier stehende Behauptung "ein Deck kommt NEU in Tier 1" war ein Wochenwert und hat am 04.09.2026 den Deploy angehalten; an ihrer Stelle steht jetzt eine Probe an gesetzten Werten, die das Gewicht exakt nachrechnet.',
    'test-side-quest-play.js':           'Rechenwege am Nutzungsmodell, Toleranzen auf selbst gesetzten Anteilen',
    'test-side-quest-usage.js':          'Struktur der Nutzungsdatei plus weite Untergrenzen (mindestens 10 Teams)',
    'test-top100-weg.js':                'prueft, dass eine entfernte Ansicht nicht zurueckkommt',
    'test-post-quellen.js':              'ZWEITE ABNAHME 04.09.2026, zwei Runden: 28 Ungleichungen. Runde eins liess elf von 22 Mutationen gruen passieren (alle sechs Sortierungen, eine Glaettung die Rohwerte durchliess); Runde zwei fand, dass die Reparaturen NEUE Loecher gerissen hatten (leere Tafel bei durchgehendem Gleichstand, Fusszeile 58 von 48 Zeichen bei einem Regional, fehlender Wurf ohne Spalte tournament_id). Im Wiederholungslauf sind alle 25 Mutationen rot. Die Datenquellen des Post-Baukastens. Ein Mutationslauf hatte elf von 22 Aenderungen am Produktivcode gruen passieren lassen, darunter ALLE SECHS vertauschten Sortierungen und eine Glaettung, die in Wahrheit Rohwerte durchliess (3-0 stand als "100 %" im Bild). Die neuen Zusicherungen schliessen das; im Wiederholungslauf werden 14 von 14 Mutationen rot. Die Datenquellen des Post-Baukastens. Liest data/, behauptet aber keine Wochenwerte: geprueft werden EIGENSCHAFTEN DES LESERS (BOM weg, CR weg, Komma in Anfuehrungszeichen trennt keine Spalte, Dezimalkomma wird gelesen), GLEICHUNGEN gegen die Datei (der ausgegebene Anteil ist der aus der Spalte share_numeric, der Nenner ist limitless_meta_stats.players) und VERTRAEGE DES BILDES (kein Wert ueber zehn Zeichen, keine Fusszeile ueber 48, kein Nenner ueber zwei Zeilen — das sind Feldbreiten der Vorlage, keine Feldwerte des Metas). Welche Decks diese Woche oben stehen, ist jeder Zusicherung egal. Die Vorpruefungen ("die Datei hat heute mindestens eine Zeile mit share=0", "mindestens 20 Zeilen mit Anfuehrungszeichen", "win_pct und Siegquote unterscheiden sich um mehr als einen Punkt") sind absichtlich da: ohne sie koennte die jeweilige Zusicherung leer bestehen und gruen melden, obwohl sie nichts mehr liest.',
    'test-testdaten-wachhund.js':        'dieser Wachhund selbst',
};

// Stand 02.09.2026: 61, um EINE Ungleichung im Team-Rechner (vorher 60,
// Stand 31.08.2026 nach dem Aufraeumen in test-champions-speed-tiers.js).
//
// Die eine: hoechstens 5 % der farbigen Matrixzellen duerfen ihr Urteil
// auf einen K.O. stuetzen, den die Zelle selbst als unter 50 %
// wahrscheinlich ausweist. Das ist keine Zahl aus dieser Woche, sondern
// eine Eigenschaft der Urteilsregel: sie wertet ueber den
// Durchschnittswurf, und der ist von der Datenlage unabhaengig. Vor der
// Korrektur am 02.09.2026 waren es 30 % der Zellen, in 5,4 % sagte die
// Farbe das Gegenteil des wahrscheinlichen Ausgangs. Faellt die Schranke,
// hat jemand die Regel auf ko.hits zurueckgedreht — genau der Fehler,
// den die Abnahme gefunden hat.
//
// Diese Zahl darf nicht steigen. Wer eine Ungleichung an Live-Daten
// hinzufuegt, muss hier bewusst hochzaehlen und im Register begruenden.
// 02.09.2026, zweite Erhoehung des Tages: 61 -> 66, um FUENF
// Ungleichungen in test-vier-ansichten-eine-quote.js.
//
// Sie sind der Grund, warum es diese Datei gibt. Die Abnahme fand zwei
// Aenderungen am Produktivcode, die die gezaehlte Quote vollstaendig
// zurueckdrehen und trotzdem alle damaligen Zusicherungen gruen lassen
// — weil die alte Datei Regex auf den Quelltext war und die Zahlen
// selbst stellte. Ein Vergleich zweier Rechenwege braucht echte Daten,
// und er braucht die Zusicherung, dass die Daten den Unterschied
// UEBERHAUPT zeigen koennten: waeren gewichtete und gezaehlte Spalte
// identisch, liefe der ganze Vergleich leer und meldete gruen.
//
// Keine davon behauptet einen Wochenwert. "Mehr als 20 Decks in der
// Datei" und "mehr als 5 Zeilen, in denen sich die beiden Spalten
// unterscheiden" gelten, solange die Datei ueberhaupt etwas enthaelt
// und die Gewichtung ueberhaupt etwas tut. Faellt eine davon, ist
// nicht die Woche anders — dann prueft der Test nichts mehr, und das
// soll auffallen.
// 66 -> 68 in derselben Runde: test-hub-gezaehlte-antritte.js prueft
// jetzt zusaetzlich, dass das Vielfache im Satz und auf jeder Kachel
// aus den beiden Zahlen folgt, die daneben stehen ("10,2 % gegen
// 6,1 % — rund 1,7-mal"). Der Satz sagte bis zum 02.09.2026 1,6, weil
// er die geglaettete Groesse zeigte, waehrend der Hinweis daneben in
// derselben Zeile "Nachrechenbar" behauptete.
//
// Die beiden neuen Ungleichungen sind Vorpruefungen, keine Wochenwerte:
// "der Feldschnitt ist groesser als null" und "es gibt ueberhaupt eine
// Kachel mit Quote und Vielfachem". Ohne sie liefe die Gleichung
// stillschweigend leer, und der Test meldete gruen, obwohl er nichts
// mehr liest.
// 68 -> 69 am 03.09.2026: eine Vorpruefung in
// test-nenner-und-rundung.js. Sie steht vor der eigentlichen Zusage
// ("fuenf um je eine Liste driftende Zeilen aendern den Nenner nicht")
// und lautet "die Livedaten liefern ueberhaupt einen Nenner". Ohne sie
// waere die Zusage erfuellt, sobald beide Seiten 0 sind — also genau
// dann, wenn der Nenner kaputt ist. Sie behauptet keinen Wochenwert:
// sie faellt nur, wenn die Datei so uneinig ist, dass gar nichts mehr
// belegt werden kann, und dann soll sie fallen.
//
// ANLASS war der rote Deploy desselben Tages: der Wochenlauf lieferte
// Wailord mit 112 Listen bei 0,28 %, unvereinbar mit dem Rest, und der
// harte Schnitt in feldGroesseAusAnteilen gab 0 zurueck. Nicht die
// Woche war anders — die Rechnung vertrug keine unruhige Quelle.
//
// OFFENER BEFUND vom selben Tag, hier notiert statt verschwiegen:
// dieser Wachhund sieht nur 22 von 55 Testdateien, die aus data/ lesen.
// `liestLiveDaten` verlangt readFileSync UND den Pfad in derselben
// Zeile; jede Datei mit einer eigenen `lies()`-Hilfsfunktion — darunter
// test-matchup-major-spalte.js mit 17 Ungleichungen — faellt durch.
// In den unsichtbaren 33 Dateien stehen 212 weitere Ungleichungen an
// Live-Daten. Der Wachhund bewacht also ein Viertel dessen, was er zu
// bewachen behauptet. Wird in einem eigenen Schritt geschlossen; die
// Obergrenze ist danach neu zu setzen.
/* 04.09.2026: 69 -> 70. In test-nenner-und-rundung.js stand eine
 * `strictEqual` gegen die Livedaten — der Nenner musste unter fuenf
 * driftenden Zeilen auf die Einheit genau derselbe bleiben. Der
 * Wochenlauf verschob ihn um 1 auf 39.842, der Test wurde rot, und der
 * Deploy hing: genau die Bauart, die dieser Wachhund verhindern soll,
 * nur dass er sie nicht sieht — er zaehlt Ungleichungen, und eine
 * Gleichheit ist strenger als jede Ungleichung.
 *
 * An ihre Stelle tritt ein Band von 0,02 % mit Begruendung. Gemessen
 * wurden 0,005 %; ein Rueckfall auf 0 oder ein verdoppelter Nenner sind
 * 100 %. Die Zahl haelt also nicht nur vier Wochen, sondern solange der
 * Nenner die Mitte eines Ueberlappungsbereichs ist — die Toleranz folgt
 * aus der Rechnung, nicht aus dem Feld dieser Woche.
 *
 * Netto ist das eine Verbesserung: eine harte Gleichheit weniger, eine
 * begruendete Weite mehr. Die Obergrenze steigt trotzdem um eins, weil
 * der Zaehler nur die eine Richtung kennt. */
/* 04.09.2026, zweite Erhoehung des Tages: 70 -> 81. Elf Ungleichungen
 * in der neuen tests/unit/test-post-quellen.js.
 *
 * WARUM SIE HIER TEURER SIND ALS SONST — UND TROTZDEM RICHTIG.
 * Was diese Datei bewacht, wird zu einem PNG und wandert durch
 * Instagram. Dort gibt es keine Fussnote und keine Korrektur. Ein
 * falscher Nenner auf der Seite ist ein Fehler; auf einem geposteten
 * Bild ist er eine Behauptung. Die Abnahme desselben Tages hat drei
 * Wege gefunden, auf denen genau das passiert waere:
 *
 *   - die Summe der Zeilen (38.398) statt der erfassten Spieler
 *     (39.842) als Nenner: Dragapult haette mit 7,77 % statt 7,49 %
 *     dagestanden;
 *   - die Spalte win_pct (Matchpunkte, 46,41) statt der Siegquote
 *     (42,4) — vier Punkte, zwei Geschichten;
 *   - perfPct aus computeConversionPerformance (+68,0 %) statt der
 *     Top-8-Quote (10,7 %). Faktor sechs, und derselbe Etikettenfehler
 *     steht in js/ds-share.js:520 schon einmal beschrieben.
 *
 * KEINE DER ELF BEHAUPTET EINEN WOCHENWERT. Sie zerfallen in drei
 * Sorten, und alle drei ueberleben den naechsten Wochenlauf:
 *
 *   1. Feldbreiten der Vorlage (5): kein Wert ueber zehn Zeichen, keine
 *      Fusszeile ueber 48, kein Spaltenkopf ueber 23, kein Nenner ueber
 *      zwei Zeilen a 60. Das sind Eigenschaften des Zeichencodes —
 *      `clip(ctx, wert, 220)` bei Mono 34 —, nicht des Feldes. Sie
 *      fallen, wenn ein Rezept zu lang schreibt, und genau dann sollen
 *      sie fallen: sonst schneidet die Vorlage stumm ab.
 *   2. Vorpruefungen (4): "die Datei hat heute mindestens eine
 *      Zombie-Zeile", "mindestens 20 Zeilen mit Anfuehrungszeichen",
 *      "Summe und erfasste Spielerzahl liegen mehr als 100
 *      auseinander", "win_pct und Siegquote unterscheiden sich um mehr
 *      als einen Punkt". Ohne sie koennte die jeweilige Zusicherung
 *      leer bestehen. Dieselbe Bauart wie in
 *      test-vier-ansichten-eine-quote.js, und aus demselben Grund.
 *   3. Eigenschaften einer Quote (2): jeder ausgegebene Wert liegt
 *      zwischen 0 und 100, jede share_pct-Spalte unter 100. Das ist
 *      Arithmetik, kein Feld.
 *
 * Der Zaehler steht damit bei 81. Netto sind vier weitere Zeilen dieser
 * Datei aus der Zaehlung gefallen, weil sie nie Ungleichungen waren,
 * sondern "steht nicht in der Liste" — als `!namen.includes(x)`
 * geschrieben sagen sie dasselbe deutlicher.
 *
 * Der offene Befund vom 03.09.2026 gilt weiter: dieser Wachhund sieht
 * nur ein Viertel dessen, was er zu bewachen behauptet. */
/* 04.09.2026, VIERTE Erhoehung des Tages: 92 -> 98. Sechs weitere
 * Ungleichungen in tests/unit/test-post-quellen.js.
 *
 * ANLASS ist wieder ein Mutationslauf — der zweite, auf den Reparaturen
 * des ersten. Er hat gezeigt, dass meine Reparaturen NEUE Loecher
 * gerissen hatten:
 *
 *   - `ohneGleichstand` gab bei durchgehendem Gleichstand die LEERE
 *     Liste zurueck. `malListe` bricht dann ab, waehrend Titel,
 *     Spaltenkopf und Nenner weiter gemalt werden — genau der Zustand,
 *     gegen den die Leere-Datei-Wuerfe geschrieben sind.
 *   - `kurzTurnier` kannte genau einen Praefix. Mit einem Regional als
 *     Anker lief die Fusszeile auf 58 von 48 Zeichen, und der NENNER
 *     fiel vom Bild.
 *   - der Turnierfilter hatte keinen Wurf fuer die fehlende Spalte
 *     `tournament_id` — ohne sie war die Datei wieder ungefiltert.
 *
 * Die sechs neuen Ungleichungen sind Vorpruefungen und Feldbreiten,
 * derselben Sorte wie die bisherigen:
 *
 *   - "mindestens zehn Turniernamen in data/" und "hoechstens 35 % davon
 *     passen auch gekuerzt nicht" — die zweite ist ein weites Band ueber
 *     eine gepflegte Namensliste, kein Wochenwert; sie faellt, wenn ein
 *     Praefix in TURNIER_KURZ fehlt.
 *   - "mindestens 20 Decks geprueft" (Gleichstand ueber alle Matchups),
 *     "mindestens ein Fall mit doppelten Werten", "Fusszeile hoechstens
 *     48 Zeichen" an zwei Stellen, "Meldung laenger als 30 Zeichen".
 *   - "Feldschnitt zwischen 0 und 100" — Arithmetik.
 *
 * Der offene Befund vom 03.09.2026 gilt weiter: dieser Wachhund sieht
 * nur ein Viertel dessen, was er zu bewachen behauptet.
 *
 * 04.09.2026, dritte Erhoehung des Tages: 81 -> 92. Elf weitere
 * Ungleichungen in tests/unit/test-post-quellen.js.
 *
 * ANLASS ist ein Mutationslauf, kein neues Feature. Ein Pruefagent hat
 * 22 Aenderungen in js/ds-post-quellen.js gesetzt; ELF blieben gruen:
 *
 *   - alle SECHS vertauschten Sortierungen. Es gab bis dahin keine
 *     einzige Sortier-Zusicherung, obwohl sechs Rezepte im Spaltenkopf
 *     eine Rangfolge behaupten.
 *   - die Glaettung liess sich ausbauen: der Aufruf griff ohnehin
 *     daneben (falsche Feldnamen, Rueckgabe ist eine Zahl und kein
 *     Objekt), sodass die ROHWERTE im Bild standen — "100 % · 3" unter
 *     einer Fusszeile mit "geglaettet k=20".
 *   - der Zombie-Filter, der Worlds-Nenner und die Tag-2-Schwelle.
 *
 * Die elf neuen Ungleichungen sind derselben drei Sorten wie die
 * bisherigen — keine behauptet einen Wochenwert:
 *
 *   1. Vorpruefungen (6): "mindestens fuenf duenne Paarungen ueber
 *      95 %", "mindestens drei Karten mit mehreren Drucken",
 *      "mindestens drei Decks unter der Tag-2-Schwelle", "mindestens
 *      ein Team ohne Turnierangabe", "mindestens zwei Zeilen zum
 *      Sortieren", "mindestens drei duenne Zeilen erreichten die
 *      Ausgabe". Ohne sie kann die jeweilige Zusicherung leer bestehen
 *      — genau der Fehler, den dieser Wachhund verhindern soll.
 *   2. Eigenschaften der Glaettung (2): keine ausgegebene Quote
 *      erreicht 100 %, und auf hoechstens sechs Partien bleibt sie
 *      unter 70 %. Beides folgt aus k=20, nicht aus dem Feld dieser
 *      Woche: mit sechs Partien kann eine Glaettung gegen zwanzig
 *      Pseudopartien rechnerisch nicht hoeher kommen.
 *   3. Feldbreiten der Vorlage (3): der Nenner passt in zwei gemalte
 *      Zeilen, die Fusszeile in 48 Zeichen, der Spaltenkopf in 23.
 *      Eigenschaften des Zeichencodes.
 *
 * Der offene Befund vom 03.09.2026 gilt weiter: dieser Wachhund sieht
 * nur ein Viertel dessen, was er zu bewachen behauptet. */
const OBERGRENZE = 98;

describe('kein Unit-Test behauptet etwas ueber die Daten dieser Woche', () => {

    it('jede Datei mit Datenzugriff steht im Register', () => {
        const unbekannt = dateienMitDatenzugriff().filter(f => !(f in REGISTER));
        assert.deepEqual(unbekannt, [],
            'Diese Testdateien lesen aus data/, stehen aber nicht im Register:\n' +
            unbekannt.map(f => '  ' + f).join('\n') +
            '\n\nEintragen und in einem Satz begruenden, warum die Zusicherungen ' +
            'naechste Woche noch gelten. Faustregel: Struktur und weite Baender ja, ' +
            'abgelesene Wochenwerte nein — die gehoeren in scripts/data_guardian.py.');
    });

    it('das Register enthaelt keine Datei, die es nicht mehr gibt', () => {
        const da = new Set(fs.readdirSync(UNIT));
        const tot = Object.keys(REGISTER).filter(f => !da.has(f));
        assert.deepEqual(tot, [], 'Register zeigt auf geloeschte Dateien');
    });

    it('die Zahl der Ungleichungen an Live-Daten steigt nicht', () => {
        const dateien = dateienMitDatenzugriff();
        const proDatei = dateien.map(f => [f, ungleichungen(f)]).filter(([, n]) => n > 0);
        const jetzt = proDatei.reduce((s, [, n]) => s + n, 0);
        assert.ok(jetzt <= OBERGRENZE,
            `Ungleichungen an Live-Daten: ${jetzt} (erlaubt: ${OBERGRENZE})\n` +
            proDatei.sort((a, b) => b[1] - a[1]).map(([f, n]) => `  ${String(n).padStart(3)}  ${f}`).join('\n') +
            '\n\nEine neue Ungleichung gegen eine feste Zahl auf Live-Daten ist die ' +
            'Bauart, die den Deploy schon zweimal angehalten hat. Wenn sie wirklich ' +
            'noetig ist: Obergrenze hier hochsetzen und dazuschreiben, warum die ' +
            'Zahl auch in vier Wochen noch stimmt.');
    });

    /* Die frueher hier beobachtete Vorbedingung in
     * test-champions-speed-tiers.js ("fixture changed — no entry lacks
     * doubles data") ist am 31.08.2026 eingetreten und bereinigt worden:
     * seit Tauros (Paldea) in seine drei Varianten aufgeteilt wurde, hat
     * jeder Pokedex-Eintrag einen Doppelkampf-Datensatz. Genau der Fall,
     * den der Kommentar vorhergesagt hat — "kein Defekt, das waere eine
     * Verbesserung der Daten". Die Zusicherung prueft dort jetzt das
     * Verhalten an gesetzten Werten statt an der Datenlage, die
     * Beobachtung ist damit erledigt und die Obergrenze um eins
     * gesenkt. */
});
