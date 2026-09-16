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
    'test-city-league-chipquelle.js':    'Frischechip und angezeigte Datei der City League: liest data/data_stand.json und das Verzeichnis data/, aber keine einzige Zahl aus einer Datendatei. Vier Sorten Zusicherung, alle strukturell. (1) BESTAND: jeder Dateiname in CHIP_PAARE muss als Datei existieren — die Zuordnung steht ausgeschrieben statt als Namensregel, und das ist genau die Zusicherung, die das rechtfertigt. (2) DECKUNG: die Ausgangsangabe data-quelle in index.html muss in CHIP_PAARE vorkommen, sonst greift die Umschaltung ins Leere. (3) VORHANDENSEIN eines Inhaltsdatums fuer die beiden _past-Dateien in data_stand.json — WELCHES Datum dort steht, ist der Pruefung egal, es muss nur eins geben; ohne das zeigte der Chip das Schreibdatum einer Datei, deren Inhalt Wochen aelter ist. (4) Dass die vier leeren Dateien weiterhin als leer gefuehrt sind, mit ausdruecklicher Ansage im Fehlertext, dass ein Wegfall auch heissen kann: sie haben Daten bekommen, dann gehoert die Zusicherung ueberdacht statt repariert. KEINE Ungleichung an Live-Daten: die einzige Mengenzusicherung ist eine GLEICHHEIT (CHIP_PAARE fuehrt genau vier Namen) und laeuft gegen den Quelltext, nicht gegen data/. Anlass war ein Live-Befund vom 10.09.2026: der Reiter zeigte 26 Listen, der Chip daneben "keine Daten".',
    'test-b1-listen-vorwert.js':         'Einheit des Bayes-Vorwerts (B1): liest limitless_online_decks.csv und limitless_online_decks_comparison.csv, aber NUR als Schema (welche Spalten es gibt) und als GLEICHUNG zwischen beiden Exporten (new_count == count). Welche Zahlen dort diese Woche stehen, ist der Pruefung egal. Die eine Ungleichung (Summe Partien > Summe Listen) ist eine Eigenschaft der beiden Einheiten, kein Wochenwert: sie faellt erst, wenn jedes Deck hoechstens eine Partie je Liste spielt.',
    'test-champions-base-stats.js':      'Schema der Statuswerte, keine Zahlenbaender',
    'test-champions-damage.js':          'Rechenwege am Schadensmodell; Baender sind physikalisch (Chance zwischen 0 und 1)',
    'test-attacken-merkmale.js':         'Die Attacken-Merkmale aus data/champions_move_flags.json und die elf Faehigkeiten, die daran haengen (16.09.2026). Sie liest ZWEI Dateien aus data/ und behauptet an keiner Stelle einen Wochenwert: geprueft wird die GLEICHUNG zwischen Datei und Wirklichkeit (wer keinen Eintrag hat, steht in _meta.ohne_eintrag — und umgekehrt), und dass die Merkmalsdatei keine Attacke ergaenzt, die der Bestand nicht fuehrt. Wie viele Faustattacken es diese Woche gibt, ist jeder Zusicherung egal. Das VERHALTEN der elf Faehigkeiten wird an der echten Rechnung ausgefuehrt, nicht im Quelltext gesucht. ZWEI Ungleichungen sieht der Zaehler unten, und dafuer wurde die OBERGRENZE von 114 auf 116 gesetzt: es sind VORPRUEFUNGEN GEGEN EIN LEERES BESTEHEN. Sie fragen, ob ueberhaupt eine Attacke ein Rueckstoss- bzw. Zusatzeffekt-Merkmal traegt. Liefe der Parser eines Tages leer, waeren Achtlos und Rabauke stillschweigend wirkungslos und JEDE andere Zusicherung dieser Datei bliebe trotzdem gruen. Es sind keine festen Zahlen — nur \'groesser als null\'.',
    'test-champions-schaden-ketten.js':  'Die vier Modifikatorketten des Schadensrechners (Umbau 16.09.2026 nach dem NCP-Rechner). Aus data/ kommt NUR champions_type_chart.json — die Typentafel ist Regelwissen und aendert sich nicht mit einem Scraperlauf. Alle Bauten sind GESETZT (feste Werte im Kopf der Datei), damit die Zusicherungen die Rechnung pruefen und nicht den naechtlichen Lauf. Kein Wochenwert wird behauptet.',
    'test-champions-matchups.js':        'Struktur der Matchup-Datei, Rechnung an gesetzten Werten',
    'test-rechner-reiter.js':            'Der Schadensrechner als EIGENER Reiter (16.09.2026, Anlass: „der Damage Culc ist ja immer noch kein eigenes Feature"). Sie liest data/, um ein echtes Paar zu bilden — WELCHES, ist jeder Zusicherung egal: es wird zur Laufzeit gesucht, bis beide Seiten wirklich Schaden machen. Keine einzige Zahl aus den Daten steht in einer Zusicherung. Geprueft werden drei Sorten Sache. (1) EIGENSCHAFTEN DER RECHNUNG: Hilfreiche Hand hebt, Helfer senkt, die Hand des Verteidigers und der Helfer des Angreifers aendern NICHTS (das ist die Seitenprobe), der Helfer wirkt auch im Volltreffer, ein Schirm nicht — alles Richtungen, keine Betraege, jeweils mit Rueckprobe auf den Grundwert. (2) GLEICHUNGEN GEGEN SICH SELBST: der Satz im Kopfband traegt genau die Spanne, den Anteil und das K.O.-Urteil, die dieselbe Rechnung liefert; die gewaehlte Attacke und die gewaehlte Richtung landen im Kopfband. (3) ZWEI FEHLER, DIE BEIM BAUEN LIVE GEMESSEN WURDEN und deshalb festgehalten sind: die gemeinsamen Zuhoerer in wire() duerfen nicht blind render() rufen (sonst bleibt die Zahl im Rechner-Reiter stehen, waehrend der Zustand darunter schon der neue ist), und die Ansichtsfahne muss den Zeichenvorgang ueberleben (sonst bearbeitet der Set-Editor des Rechners das Set des Matchup-Paares). EINE UNGLEICHUNG, eine Vorpruefung gegen ein leeres Bestehen: die Vergleichsliste haelt hoechstens zwoelf Staende — geprueft mit zwanzig nachweislich VERSCHIEDENEN Eintraegen, weil sonst schon die Doppelsperre greift und der Deckel ungeprueft bliebe. Dafuer wurde die OBERGRENZE von 126 auf 127 gesetzt.',
    'test-rechner-kampflage.js':         'Die Kampflage im Schadensrechner (16.09.2026, Anlass: „der Damage Culc ist ja immer noch nicht fertig und als Feature verfuegbar"). Sie liest data/, um echte Paare zu bilden — WELCHE, ist jeder Zusicherung egal: das Paar wird zur Laufzeit gesucht, bis eines wirklich Schaden macht. Geprueft werden ausschliesslich RICHTUNGEN, nie Betraege: Sonne hebt Feuer und Regen senkt es (am selben Paar gemessen), ein Volltreffer liegt ueber dem normalen Treffer, +2 Stufen ueber dem Grundwert und -2 darunter, ein Schirm auf der VERTEIDIGERSEITE senkt und auf der Angreiferseite nicht, Verbrennung senkt physischen Schaden und laesst speziellen unberuehrt. Jede Richtung hat ihre Rueckprobe: der zurueckgesetzte Zustand muss wieder GENAU den Grundwert ergeben — ohne die waere „Feld wirkt" von „Feld wirkt und bleibt haengen" nicht zu unterscheiden. Keine einzige Zahl aus den Daten steht in einer Zusicherung, und der Rest prueft gezeichnetes HTML (Feldleiste im Einzel- UND im Team-Rechner, Lage im Set-Editor) statt Quelltext. NULL Ungleichungen an Live-Daten.',
    'test-schwaechen-ausgleich.js':      '„Gleicht Schwaechen aus" im Team-Builder (16.09.2026, Anlass: „sollte nicht noch dazu kommen vorschlag nach Pokemon die die Schwaechen ausgleichen"). Sie liest fuenf Dateien aus data/ und behauptet an keiner Stelle einen Wochenwert. Die tragende Zusicherung ist eine GLEICHUNG GEGEN DIE EIGENE RECHNUNG, in BEIDE Richtungen: fuer jeden Ausgleicher und jede Bedrohung wird schlaegt() noch einmal ausgefuehrt und mit der ausgegebenen Liste verglichen — nichts Falsches darf drinstehen, nichts Richtiges fehlen. Dazu Eigenschaften, die unabhaengig von der Rangliste dieser Woche gelten: „A schlaegt B" und „B schlaegt A" nie zugleich, die Auswahl bedroht sich nicht selbst, die Kappe haelt, das Gewicht IST wen × verbreitung, und Kader + Luecke ergeben zusammen die Zahl der Arten in der Nutzungsdatei (die Luecke wird benannt, nicht verschwiegen — Gegenprobe: keine benannte Art steht im Pokedex). NEUN UNGLEICHUNGEN, alle Vorpruefungen gegen ein leeres Bestehen: mehr als 200 Arten im Kader, mehr als 500 gepruefte Paare, mindestens eine Bedrohung und ein Ausgleicher fuer Rillaboom, mindestens zwei Bedrohungen fuer die Sortierprobe, ein bis zwei Typen je Eintrag, hoechstens vier Attacken, KP groesser null. Ohne sie koennte die jeweilige Zusicherung leer bestehen — genau der Fehler, den dieser Wachhund verhindern soll. Dafuer wurde die OBERGRENZE von 116 auf 125 gesetzt.',
    'test-hub-gezaehlte-antritte.js':    'Gezaehlte Antritte: ruft answerModel() und answerHtml() mit den echten Zeilen auf und rechnet jede angezeigte Zahl gegen die CSV nach — Anteil, Quote, Feldschnitt und Nenner muessen aus denselben zwei Zahlen folgen, die daneben stehen. Das sind GLEICHUNGEN gegen die Datei, keine Behauptungen ueber Wochenwerte: welche Zahlen dort stehen, ist der Pruefung egal, sie muessen nur zueinander passen. Dazu Eigenschaften der Spalten (ganze Zahlen, keine Top 8 ueber den Antritten), das Alles-oder-nichts-Tor gegen kaputte Werte und seit dem 02.09.2026 die Probe, dass das Vielfache im Satz und auf jeder Kachel aus den beiden Zahlen folgt, die daneben stehen.',
    'test-stufen-im-text.js':            'Stufen im Attackentext: liest alle Attacken aus champions_resources.json und die Stufentabelle aus champions_statuszustaende.json. Geprueft werden EIGENSCHAFTEN, keine Wochenwerte: dass keine Marke auf Genauigkeit, Fluchtwert oder Volltreffer sitzt (die folgen laut den Daten selbst einer anderen Tabelle), dass jede Stufe eine der sechs bekannten ist, dass benannte Attacken ihre Marke tragen, und dass Tabelle und Formel uebereinstimmen. Attackenbeschreibungen sind gepflegter Text, keine Wochenzahlen.',
    'test-vier-ansichten-eine-quote.js': 'Vier Ansichten, eine Quote: liest online_tournament_top8_decks.csv, um die vier Rechenwege GEGENEINANDER zu pruefen — nicht gegen Wochenwerte. Die fuenf Ungleichungen sind Eigenschaften der Datei, keine Behauptungen ueber diese Woche: dass sie ueberhaupt Zeilen hat (>20), und dass sich gewichtete und gezaehlte Spalte bei genug Zeilen unterscheiden (>5) — ohne diesen Unterschied wuerde der Vergleich stillschweigend nichts pruefen, was genau der Fehler war, den die Abnahme am 02.09.2026 gefunden hat. Welche Zahlen dort stehen, ist der Pruefung egal; alle Vergleiche sind Gleichungen zwischen zwei Rechenwegen auf denselben Zeilen.',
    'test-team-rechner.js':              'Team-Rechner: liest data/, um echte Paare zu bilden — welche, ist der Pruefung egal. Verglichen wird die Matrixzelle mit bestMove() auf denselben Daten (Gleichheit zweier Rechenwege), der Spiegelkampf (gilt fuer jedes Pokemon) und die Namensaufloesung ueber den Slug (eine Eigenschaft der Zuordnung). Die EINE Ungleichung ist eine Eigenschaft der Urteilsregel, kein Wochenwert: unter 5 % der farbigen Zellen duerfen sich auf einen K.O. unter 50 % Chance stuetzen. Vor der Korrektur am 02.09.2026 waren es 30 %; die Schranke haelt, solange die Regel ueber den Durchschnittswurf wertet, und faellt, wenn jemand sie auf ko.hits zurueckdreht.',
    'test-meta-prognose.js':            'Meta-Prognose: liest meta_prognose.json und data_stand.json und rendert ueber die echten Modulfunktionen. Geprueft werden EIGENSCHAFTEN, keine Wochenwerte: dass jede Zeile einen Namen traegt (statt ihn aus der Kennung raten zu muessen), dass die Bandbreite ihre eigene Prognose umschliesst, dass das Modell seine Guete ausweist, dass die Oberflaeche den Vorbehalt "Erwartung, keine Messung" nennt, und dass der Balken relativ zum groessten Wert der Liste skaliert. Welche Decks diese Woche vorn stehen, ist jeder Zusicherung egal. VIER UNGLEICHUNGEN, alle Vorpruefungen gegen ein leeres Bestehen: mehr als 50 Zeilen, mindestens 3 Anker, ein gerendertes HTML laenger als 100 Zeichen, und dass beide Wirte in index.html ueberhaupt vorkommen.',
    'test-namensbruecke-decklisten.js': 'Namensbruecke Decklisten->labs: liest labs_tournament_decks.csv, tournament_decklists_per_player.csv und archetype_aliases.json. Geprueft werden EIGENSCHAFTEN der Zuordnung, keine Wochenwerte: dass jedes Brueckenziel in labs existiert, dass jedes Paar einen Beleg mit Zahl traegt, und dass der Direkttreffer immer vor der Bruecke gewinnt. Die drei genannten Pilotenzahlen (114/74/12) sind KEINE Wochenwerte, sondern abgeschlossene Turnierergebnisse von 0069 und 0071 — die aendern sich nicht mehr. VIER UNGLEICHUNGEN, alle Vorpruefungen gegen ein leeres Bestehen: mindestens zwei Brueckenpaare, ein Beleg laenger als 40 Zeichen, und dass es Hydrapple in TEF-CRI ueberhaupt noch gibt.',
    'test-nachschlagen-anzeige.js':      'Anzeige im Nachschlagen-Reiter: liest champions_resources.json und rendert JEDE Attacke durch den echten moveStatsHtml(), statt den Quelltext zu greppen. Geprueft werden EIGENSCHAFTEN der Anzeige, keine Wochenwerte: dass in keiner Statzeile ein roher JS-Wert steht (true/false/null/NaN), dass jeder in den Daten vorkommende Typ eine deutsche Entsprechung hat, und dass die Typfarbe weiter am englischen Namen haengt. ZWEI UNGLEICHUNGEN, beide Vorpruefungen gegen ein leeres Bestehen: es gibt ueberhaupt eine Attacke mit accuracy===true (sonst prueft der halbe Block nichts) und mindestens 17 verschiedene Typen. Welche Attacken das diese Woche sind, ist jeder Zusicherung egal.',
    'test-variable-staerke.js':          'Attacken mit situationsabhaengiger Staerke: liest champions_resources.json und prueft die REGEL, nicht Wochenwerte. Die Listen benannter Attacken (Zornesfaust, Kraftvorrat, Fassade / Donnerblitz, Nahkampf, Erdbeben) sind Eigenschaften des englischen Effekttextes, der gepflegter Text ist und keine Wochenzahl. VIER UNGLEICHUNGEN, alle Vorpruefungen gegen ein leeres Bestehen: mindestens 200 Schadensattacken ueberhaupt, mindestens 10 als variabel erkannt, und der Index der Staerke im Quelltext > 0. Ohne die erste beiden koennte die Regel zu "immer falsch" verkommen und die Datei bliebe gruen — genau der Fehler, den dieser Wachhund verhindern soll. Die dritte liest gar keine Daten, sondern den eigenen Quelltext. Die Schranke nach oben (hoechstens ein Viertel aller Schadensattacken) faengt den umgekehrten Fall "immer wahr"; sie zaehlt der Zaehler nicht mit, weil rechts kein Literal steht.',
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
    'test-abnahme-2026-09-05.js':        'Abnahme vom 05.09.2026 (neun Pruefagenten auf der Live-Seite). STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber einen Parameter reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen wird genau EINE Datei aus data/, champions_usage.json, und zwar fuer EIGENSCHAFTEN der Namensumrechnung: fuer einen Namen aus der Rangliste muss ein Schluessel herauskommen, den die Datei wirklich fuehrt (Ninetales-Alola -> alolan-ninetales und sechs weitere). Welche Pokemon diese Woche in der Datei stehen, ist der Pruefung egal — sie prueft die Zuordnung, nicht den Bestand. Alles andere in der Datei sind Zusicherungen an den QUELLTEXT (js/, css/, backend/), keine Zahlen aus data/.',
    'test-labs-trennzeichen.js':         'Trennzeichen und Wirkung des Labs-Gewichts. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad erst in eine Konstante legt und danach liest — dieselbe Luecke, die weiter unten als "ein Viertel dessen, was er zu bewachen behauptet" beschrieben ist. Ihre Zusicherungen sind Eigenschaften des Motors, keine Wochenwerte: dass die Labs-Daten viele Bewertungen bewegen und mindestens eine um einen ganzen Punkt. Die frueher hier stehende Behauptung "ein Deck kommt NEU in Tier 1" war ein Wochenwert und hat am 04.09.2026 den Deploy angehalten; an ihrer Stelle steht jetzt eine Probe an gesetzten Werten, die das Gewicht exakt nachrechnet.',
    'test-side-quest-play.js':           'Rechenwege am Nutzungsmodell, Toleranzen auf selbst gesetzten Anteilen',
    'test-side-quest-usage.js':          'Struktur der Nutzungsdatei plus weite Untergrenzen (mindestens 10 Teams)',
    'test-top100-weg.js':                'prueft, dass eine entfernte Ansicht nicht zurueckkommt',
    'test-post-quellen.js':              'ZWEITE ABNAHME 04.09.2026, zwei Runden: 28 Ungleichungen. Runde eins liess elf von 22 Mutationen gruen passieren (alle sechs Sortierungen, eine Glaettung die Rohwerte durchliess); Runde zwei fand, dass die Reparaturen NEUE Loecher gerissen hatten (leere Tafel bei durchgehendem Gleichstand, Fusszeile 58 von 48 Zeichen bei einem Regional, fehlender Wurf ohne Spalte tournament_id). Im Wiederholungslauf sind alle 25 Mutationen rot. Die Datenquellen des Post-Baukastens. Ein Mutationslauf hatte elf von 22 Aenderungen am Produktivcode gruen passieren lassen, darunter ALLE SECHS vertauschten Sortierungen und eine Glaettung, die in Wahrheit Rohwerte durchliess (3-0 stand als "100 %" im Bild). Die neuen Zusicherungen schliessen das; im Wiederholungslauf werden 14 von 14 Mutationen rot. Die Datenquellen des Post-Baukastens. Liest data/, behauptet aber keine Wochenwerte: geprueft werden EIGENSCHAFTEN DES LESERS (BOM weg, CR weg, Komma in Anfuehrungszeichen trennt keine Spalte, Dezimalkomma wird gelesen), GLEICHUNGEN gegen die Datei (der ausgegebene Anteil ist der aus der Spalte share_numeric, der Nenner ist limitless_meta_stats.players) und VERTRAEGE DES BILDES (kein Wert ueber zehn Zeichen, keine Fusszeile ueber 48, kein Nenner ueber zwei Zeilen — das sind Feldbreiten der Vorlage, keine Feldwerte des Metas). Welche Decks diese Woche oben stehen, ist jeder Zusicherung egal. Die Vorpruefungen ("die Datei hat heute mindestens eine Zeile mit share=0", "mindestens 20 Zeilen mit Anfuehrungszeichen", "win_pct und Siegquote unterscheiden sich um mehr als einen Punkt") sind absichtlich da: ohne sie koennte die jeweilige Zusicherung leer bestehen und gruen melden, obwohl sie nichts mehr liest.',
    'test-qr-svg.js':                    'Der eigene QR-Erzeuger. Liest data/pocket_tierlist.json ausschliesslich als VORRAT ECHTER ZEICHENKETTEN — 33 Base64-Codes von je 88 Zeichen. Geprueft wird, was daraus wird: Version und Modulzahl je Fehlerkorrekturstufe (Eigenschaften der Kodierung, nicht der Decks), Suchmuster, Taktspur, Ausrichtungsmuster, Formatinformation gegen die Tabelle der Norm, und dass der Datenstrom aus dem Raster wieder herauskommt. Welche Decks diese Woche in der Datei stehen und welche Stufe sie tragen, ist jeder Zusicherung egal; die Vorpruefung verlangt nur mindestens 30 Codes, damit die Schleifen nicht leer bestehen. Ersetzt Game8s Bild durch unser eigenes, deshalb kommen die echten Codes zum Einsatz und keine erfundenen: der Python-Test test_pocket_tierlist.py hatte genau diesen Fehler und pruefte drei ausgedachte Zeichenketten.',
    'test-pocket-code-kopieren.js':     'Der Kopierknopf im Pocket-Vollbild, ausgefuehrt statt gegriffen. Liest data/pocket_tierlist.json als EINGABE fuer den echten Renderer und benutzt daraus nur die Deck-CODES — Base64-Zeichenketten, die der Knopf unveraendert weiterreichen muss. Behauptet keinen Wochenwert: jeder Sollwert kommt aus derselben Datei (der Knopf des geoeffneten Decks traegt DESSEN code, writeText bekommt DENSELBEN code, das Hilfsfeld des Rueckfalls traegt DENSELBEN code). Welche Decks diese Woche in der Liste stehen und wie sie eingestuft sind, ist jeder Zusicherung egal; geprueft werden drei Ausfallwege, die man nur ausgefuehrt sieht — fehlendes navigator.clipboard (unsicherer Kontext), ein writeText, das ABLEHNT oder WIRFT, und die Rueckmeldung, die kommen UND wieder gehen muss. Die Indexprobe laeuft ueber [0, 1, decks.length - 1], also ueber Positionen, nicht ueber Namen. Ungleichungen gegen feste Zahlen enthaelt die Datei keine.',
    'test-pocket-verhalten.js':          'Der Pocket-Reiter, ausgefuehrt statt gegriffen. Liest data/pocket_tierlist.json als EINGABE fuer den echten Renderer und prueft, was dabei herauskommt — aber keine Wochenwerte: dass jedes Deck der Datei auch eine Zeile bekommt (Gleichung gegen die Datei, nicht gegen eine erwartete Zahl), dass jede in der Datei vorkommende Stufe ihren Abschnitt mit der aus derselben Datei gezaehlten Groesse bekommt, dass die drei Filter genau die Mengen ergeben, die sich aus quelle_liste ableiten, und dass Deck-Namen maskiert werden. Welche Decks diese Woche in der Datei stehen und wie sie eingestuft sind, ist jeder Zusicherung egal — die Sollwerte werden aus derselben Datei gerechnet. Die Vorpruefung im Filterblock verlangt nur, dass sich die drei Mengen ueberhaupt unterscheiden, sonst koennte der Test leer bestehen. Diese Datei existiert, weil die Abnahme am 07.09.2026 vier Mutationen gefunden hat, die ein reiner Quelltext-Grep nicht sieht.',
    'test-kacheln-zeitraum-und-typfilter.js': 'Befund A-F4.7 (07.09.2026): das Datenfenster "Daten ab" wirkt auf die Archetyp-Kacheln nicht. Der gewaehlte Weg war, den Zeitraum an die Kacheln zu schreiben — und die Begruendung dafuer ist eine EIGENSCHAFT DER DATEIEN, keine Wochenzahl: data/limitless_online_decks.csv fuehrt ueberhaupt keine Datumsspalte, data/online_tournament_top8_decks.csv genau eine (last_seen_date) neben aufsummierten Antritten. Gelesen wird deshalb nur die KOPFZEILE beider Dateien, keine einzige Zahl. Kommt dort ein Datum je Zeile dazu, faellt dieser Test — und dann MUSS der Satz an der Kachel weg und das Fenster wirken. Genau dafuer steht er hier. Alles andere in der Datei laeuft auf gesetzten Zeilen (Dragapult mit 300 Listen, 100-90-10) und auf Quelltext-Ausschnitten aus js/; Ungleichungen an Live-Daten hat sie keine. ERGAENZT am 07.09.2026 (Befund B1): sie liest zusaetzlich data/tournament_cards_manifest.json und data/format_window.json — wieder als STRUKTUR, nicht als Wochenwert. Geprueft wird, dass der Pfad, den die Oberflaeche nennt, im Arbeitsbaum EXISTIERT; welcher Formatchunk das diese Woche ist, ist jeder Zusicherung egal. Der Sollwert wird mit der echten waehleAktuellenChunk() aus js/app-core.js aus denselben zwei Dateien gerechnet. Faellt dieser Test, zeigt ein sichtbarer Dateiname ins Leere — genau der Fehler, den er faengt.',
    'test-win-rate-konventionen-belegt.js': 'Datei -> Formel -> nachgerechnet. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Sie liest drei Dateien aus data/ und prueft an jeder eine GLEICHUNG: die Spalte der Datei gegen die Formel, die js/win-rate-konvention.js fuer diese Quelle auffuehrt. Welche Quoten dort diese Woche stehen, ist jeder Zusicherung egal — sie muessen nur zu ihrer eigenen Bilanz passen. Die Zeilenzahlen tragen ein Band von 25 % mit Begruendung (ZEILEN_BAND): es faengt eine leergelaufene oder verdoppelte Datei und laesst den Wochenlauf durch. Die Gegenprobe "die beiden anderen Formeln treffen diese Spalte nicht" hat ihr eigenes, weiteres Band (KOINZIDENZ_BAND, 10 %), weil auf kleinen Bilanzen zwei Konventionen rechnerisch zusammenfallen; bei einem echten Konventionswechsel waeren es ueber 90 %.',
    'test-praesenz-unentschieden-belegt.js': 'Die im Code als gemessen ausgewiesenen Feldquoten gegen ihre Dateien. STEHT HIER FREIWILLIG (dieselbe Luecke). Der Sollwert kommt aus BELEGTE_FELDQUOTEN in js/app-meta-call.js, der Istwert aus der Datei — geprueft wird nicht "die Quote ist 11,05 %", sondern "Code und Datei sagen dasselbe". Beide bewegen sich gemeinsam; die Toleranz steht in der Konstanten selbst und ist dort begruendet. Diese Datei existiert, weil genau diese Kommentarzahlen am 07.09.2026 ueberholt waren (6.121 statt 6.192 Partien) und niemand es bemerkt hat.',
    'test-p53-konvention.js':            'Predictor 5.3, ausgefuehrt statt gegriffen. STEHT HIER FREIWILLIG (dieselbe Luecke). Liest data/, behauptet aber keine Wochenwerte: geprueft werden EIGENSCHAFTEN DER RECHNUNG (beide Seiten der Differenz in derselben Konvention, die Subtraktion laeuft wirklich ueber WinRateKonvention.differenz(), ohne Bilanz kommt kein Schub, der Schub verschiebt die S/(S+N)-Quote um genau (adjA-adjB) und ueberlebt die Praesenzumstellung unveraendert) und VERGLEICHE ZWEIER RECHENWEGE auf denselben Zeilen (alt gegen neu). Die Schranken sind benannte Konstanten mit Begruendung: MINDEST_KANDIDATEN und MINDEST_FELD sind Vorpruefungen gegen ein leeres Bestehen, MINDEST_WIRKUNG_PP sagt, dass die Umstellung ueberhaupt etwas bewegt, ALT_MINDESTFEHLER_PP haelt das gesetzte Gegenbeispiel aussagekraeftig. Die Frankfurt-Rekonstruktion ist als Rekonstruktion gekennzeichnet — sie baut die Kette und die Online-Matrix nach, nicht den Prognosekern.',
    'test-tag2-grundgesamtheit.js':      'Die Grundgesamtheit des Deckbauers ist der Tag-2-Cut. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine D()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Sie liest vier Dateien aus data/ und prueft an jeder GLEICHUNGEN ZWISCHEN DATEIEN, keine Wochenwerte: die Zahl der Listen in tournament_decklists_per_player.csv ist die Zahl der day2=1-Zeilen mit Platz in player_continuity.csv ist die Summe der Spalte day2_players in labs_tournament_decks.csv (und noch einmal in der Formatdatei TEF-PBL). Welche Turniere und welche Zahlen das diese Woche sind, ist jeder Zusicherung egal. Die EINE bewusste Ausnahme ist BELEGTE_FELDER aus js/deck-builder-consistency.js: der Sollwert kommt aus dem Code, der Istwert aus der Datei, und die harte Gleichheit ist genau der Zweck — sie SOLL rot werden, wenn Kommentar und Datei auseinanderlaufen. Das ist am 06.09.2026 passiert (der Wochenlauf zog Worlds von 774 auf 797, der Kommentar blieb stehen und niemand hat es bemerkt). Der Ausweg ist eingebaut und billig: ein Turnier, das aus dem Bestand faellt, wird uebersprungen, ein neues Turnier ist kein Fehler, und die Reparatur bei echtem Auseinanderlaufen ist eine Zahl im Kommentar. Alles, was Text prueft, laeuft auf GESETZTEN dataQuality-Objekten und ruft die echten Funktionen aus, statt den Quelltext zu greppen — ein Grep haette nicht bemerkt, dass die Online-Kachel faelschlich Tag 2 sagt. ELF UNGLEICHUNGEN, die der Zaehler unten NICHT sieht: acht Vorpruefungen gegen ein leeres Bestehen (mindestens ein Turnier, mindestens drei Archetypen, mindestens eine Zeile mit total_players, genau zwei Textvorlagen fuer die Mehrheitsdiagnose) und drei Schnittwaechter auf Quelltext, die gar keine Daten lesen. Die OBERGRENZE wird dafuer bewusst NICHT erhoeht: der Zaehler zaehlt diese Datei nicht mit, und zehn Einheiten Luft draufzulegen wuerde den Dateien, die er WIRKLICH sieht, unverdienten Spielraum schenken. Wird die Luecke in liestLiveDaten() geschlossen, sind es elf hier.',
    'test-anteile-und-konventionen-07-09.js': 'Befunde B1, B2, B4, B5 und B6 vom 07.09.2026, ausgefuehrt statt gegriffen. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Sie liest vier Dateien aus data/ (online_tournament_top8_decks.csv, limitless_online_decks.csv, limitless_online_decks_matchups.csv, data_stand.json) und behauptet an keiner Stelle einen Wochenwert: alle Sollwerte werden aus denselben Dateien gerechnet. Drei Sorten Zusicherung. (1) GLEICHUNGEN GEGEN DIE DATEI: der Anteil der Startseite ist total_brought / Summe total_brought; der aus den Anteilen eingegrenzte Limitless-Nenner gibt die Spalte share_numeric jeder Zeile wieder her (Toleranz 0,005 — die halbe Einheit der letzten angezeigten Stelle, also Rundung, kein Feld); der Top-20-Schnitt der Kachel ist der partiengewichtete Rohschnitt derselben Zeilen. (2) EIGENSCHAFTEN DER KONVENTIONEN: fuer Zeilen, die GENAU EINE der drei Formeln aus js/win-rate-konvention.js treffen, muss der erzeugte Text den Kurznamen eben dieser Konvention vor sein Gleichheitszeichen setzen. Welche Quoten dort stehen, ist der Pruefung egal — sie muessen nur zu ihrer eigenen Bilanz passen. (3) VORPRUEFUNGEN GEGEN EIN LEERES BESTEHEN: es gibt ueberhaupt eine eindeutige Zeile, der eingegrenzte Nenner ist nicht die Summe der gelisteten Listen, mindestens ein Deck steht auf zwei verschiedenen Anteilen, beide Sprachen tragen fuer cl.usageShare verschiedene Werte, und die erste Zeile der Datei hat ueberhaupt Top-20-Paarungen. Ohne sie koennte die jeweilige Zusicherung leer bestehen — genau der Fehler, den dieser Wachhund verhindern soll. Der Zaehler unten sieht die Datei NICHT; sie enthaelt EINE echte Ungleichung an Live-Daten (erg.partien > 0, eine Vorpruefung), und die OBERGRENZE wird dafuer bewusst nicht erhoeht — sie gilt den Dateien, die der Zaehler wirklich liest.',
    'test-r4-leerzustand-echte-daten.js': 'Befunde B2 und B4 vom 07.09.2026 (zweite Runde), Reiter "City League". Liest data/city_league_archetypes_past_comparison.csv und data/city_league_archetypes_past.csv und behauptet keinen einzigen Wochenwert: JEDER Sollwert wird aus derselben Datei gezaehlt, gegen die geprueft wird. Drei Sorten Zusicherung. (1) ZWEI RECHENWEGE AUF DENSELBEN ZEILEN: der Filter der Oberflaeche (increased) gegen die Zaehlung im Test (status !== \'NEU\' UND count_change > 0) — geprueft wird die Gleichung haeufiger == mitZuwachs - zuwachsUndNeu, nicht die Zahl 0. (2) GLEICHUNGEN GEGEN DEN TEXT: die Zahlen, die der Leerzustand ausschreibt ("11 von 11 Zeilen haben count_change > 0"), muessen die aus der Datei gezaehlten sein — genau das war am 07.09.2026 falsch, der Quelltext behauptete das Gegenteil der Datei. (3) VOLLSTAENDIGKEIT: jede der drei Rubriken ist entweder Tabelle ODER im Leerzustand benannt; die genannte Quelldatei existiert im Arbeitsbaum; Karte und Leerzustand nennen dasselbe Zeitfenster. Faengt eine echte City-League-Saison wieder an, bleiben alle Zusicherungen gruen — dann stehen die Tabellen da und der Leerzustand faellt weg. Ungleichungen an Live-Daten enthaelt die Datei keine; die drei Vorpruefungen gegen ein leeres Bestehen sind notEqual(..., 0).',
    'test-r5-duenne-basis.js':           'Befunde B2 und B3 der Nachpruefung vom 07.09.2026. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen werden ZWEI Dateien aus data/: tournament_decklists_per_player.csv (Felder deck_archetype, tournament_date, tournament_id, player_name, place) und format_window.json (in_person_legal_date). Behauptet wird kein einziger Wochenwert — jeder Sollwert wird aus DERSELBEN Datei gerechnet und gegen MostConsistencyBuilder.bestandsLageAus gestellt: Listenzahl, Listen im Fenster, Archetypen, Zahl der Archetypen unter MIN_WEIGHTED_LISTS und deren Aufteilung. Welche Decks diese Woche wie viele Listen haben, ist jeder Zusicherung egal; sie muessen nur zu sich selbst passen. Genau deshalb gibt es die Datei: der Kommentar im Deckbauer sagte "elf mit EINER Liste, vier mit zweien", gezaehlt waren es zehn und fuenf — eine einmal gemessene und danach stehen gebliebene Zahl. Sie steht jetzt nicht mehr im Text, sondern wird zur Laufzeit gezaehlt. ZWEI VORPRUEFUNGEN gegen ein leeres Bestehen (die Datei liefert ueberhaupt Listen; das Formatfenster aendert die Zahl der Listen ueberhaupt) sind bewusst als Gleichung bzw. Ungleichheit formuliert, nicht als Band. EINE Ungleichung enthaelt die Datei ("der uebrige Hinweis ist laenger als 50 Zeichen"), und die laeuft auf einem SELBST GESETZTEN Befund, nicht auf Livedaten. Der Zaehler unten sieht die Datei nicht; die Obergrenze bleibt deshalb, wo sie ist.',
    'test-r1-nenner-hochgerechnet.js':   'Befund B1 der Nachpruefung (07.09.2026): der Nenner der Anteilskachel ist HOCHGERECHNET, stand aber wie eine gezaehlte Zahl da. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Vier der sechs Zusicherungen laufen auf einem GESETZTEN Feld (N = 10.000, zehn Zeilen, Rest unter "Other"), bei dem jede erwartete Zahl von Hand nachrechenbar ist. Die beiden Proben an data/limitless_online_decks.csv behaupten keinen Wochenwert, sondern GLEICHUNGEN gegen die Datei: die Summe der Spalte count, die Summe der Spalte share_numeric und die Spanne, die die Anteilsspalte fuer den Nenner zulaesst (count/((share±0,005)/100), geschnitten ueber die Zeilen, die den gefundenen Nenner zulassen), werden im Test NEU gerechnet und muessen dieselben Zahlen ergeben, die im sichtbaren Text stehen. Welche Decks dort diese Woche stehen und wie gross das Feld ist, ist jeder Zusicherung egal. Die eine Vorpruefung ("die Datei gibt heute ueberhaupt einen Nenner her") steht gegen ein leeres Bestehen und ist KEINE Ungleichung gegen eine feste Zahl — der Zaehler unten waechst durch diese Datei nicht.',
    'test-r1-glaettung-ursache.js':      'Befund B3 der Nachpruefung (07.09.2026): die Fussnote der Kachel "Matchup vs Top 20" schob die ganze Abweichung zur Matchup-Tabelle auf die Glaettung, obwohl bei den Decks mit vielen Partien die fehlende Partiengewichtung der groessere Beitrag ist. STEHT HIER FREIWILLIG (dieselbe lies()-Luecke). Vier der fuenf Zusicherungen laufen auf GESETZTEN Paarungen — einmal dick und ungleich gross (Gewichtung ueberwiegt), einmal duenn und gleich gross (Glaettung ueberwiegt) — und pruefen, dass der Text den jeweils groesseren Beitrag benennt. Die fuenfte liest data/limitless_online_decks_matchups.csv und data/limitless_online_decks.csv, behauptet aber keinen Wochenwert: sie rechnet beide Beitraege fuer die ersten acht Decks der Datei NEU (Glaettung noch einmal aus js/matchup-glaettung.js abgeleitet, K aus dem Modul gelesen) und verlangt nur, dass der Text genau den Beitrag benennt, der wirklich der groessere ist. Dreht sich das Verhaeltnis mit den Daten, dreht sich der Sollwert mit. Ungleichungen gegen feste Zahlen hat die Datei keine.',
    'test-w1-konvention-passt.js': 'Der angezeigte Name gegen die gerechnete Konvention (Arbeitspaket W1, 08.09.2026). STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen werden drei Dateien aus data/ (limitless_online_decks.csv, limitless_online_decks_matchups.csv, limitless_online_decks_comparison.csv), und zwar AUSSCHLIESSLICH, um die Prozentspalte gegen die Bilanz DERSELBEN Zeilen zu rechnen: welche der drei Konventionen aus js/win-rate-konvention.js trifft sie? Das ist eine Gleichung gegen die Datei, kein Wochenwert — welche Quoten dort stehen, ist jeder Zusicherung egal, sie muessen nur zu ihrer eigenen Bilanz passen. Der so GEMESSENE Wert ist der Sollwert fuer die Beschriftung; verschiebt der Wochenlauf die Zahlen, verschiebt sich der Sollwert mit. ZWEI Vorpruefungen gegen ein leeres Bestehen, beide bewusst: notEqual(proben.length, 0) und der MINDESTVORSPRUNG von 25 % der Zeilen, mit dem der Sieger vorn liegen muss. Der Vorsprung ist keine abgelesene Wochenzahl, sondern eine Eigenschaft der Formeln: auf Zeilen ohne Unentschieden fallen mitUnentschieden und ohneUnentschieden zusammen, deshalb erreicht auch die richtige Konvention nie 100 %; gemessen liegt der Vorsprung heute bei ueber 50 Prozentpunkten. Faellt er unter die Schranke, hat die Quelle ihre Konvention gewechselt — und dann MUSS der Test rot werden, denn dann stimmt jede Beschriftung nicht mehr. Die eine Ungleichung, die der Zaehler unten nicht sieht, ist genau diese Schranke; die Obergrenze wird dafuer nicht erhoeht.',
    'test-w2-quellen-konventionen.js':   'Befund W2 (08.09.2026): die beiden Matchup-Quellen rechnen verschieden, und die Oberflaeche beschriftet sie deshalb verschieden. Liest data/limitless_online_decks_matchups.csv, data/labs_tournament_matchups_TEF-PBL.csv und data/limitless_online_decks.csv — und behauptet an keiner Stelle einen Wochenwert: jede Zusicherung ist eine GLEICHUNG zwischen der Prozentspalte einer Zeile und der Bilanz DERSELBEN Zeile, mit den Formeln aus js/win-rate-konvention.js. Welche Decks dort stehen und welche Quoten sie haben, ist der Pruefung egal. Die Gegenproben sind bewusst als UNGLEICHHEIT formuliert ("die anderen beiden Formeln treffen nicht ebenfalls jede Zeile", "die Unentschieden-Anteile der beiden Felder sind nicht dieselben") und nicht als Band: eine Bandgrenze waere eine abgelesene Zahl. Sie stehen gegen ein leeres Bestehen — ohne sie waere die Hauptzusicherung erfuellt, sobald die Datei nur noch Bilanzen ohne Unentschieden enthaelt, und die Spalte waere gar nicht mehr eindeutig zuzuordnen. Ungleichungen gegen eine feste Zahl an Live-Daten enthaelt die Datei keine; die Obergrenze unten bleibt deshalb, wo sie ist.',
    'test-w4-quoten-namen.js':           'Der angezeigte Name gegen die gerechnete Konvention (Arbeitspaket W4, 08.09.2026: Kampftagebuch, Anti-Tech, Podiumskachel, Glossar). STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen werden vier Dateien aus data/ (limitless_online_decks_matchups.csv, limitless_online_decks.csv, labs_tournament_decks.csv, limitless_online_decks_comparison.csv), und zwar AUSSCHLIESSLICH, um die Prozentspalte gegen die Bilanz DERSELBEN Zeilen zu rechnen: welche der drei Konventionen aus js/win-rate-konvention.js trifft sie? Das ist eine Gleichung gegen die Datei, kein Wochenwert — welche Quoten dort stehen, ist jeder Zusicherung egal, sie muessen nur zu ihrer eigenen Bilanz passen. Der so GEMESSENE Wert ist der Sollwert fuer die Beschriftung, die anschliessend an den AUFRUFSTELLEN ausgefuehrt wird; verschiebt der Wochenlauf die Zahlen, verschiebt sich der Sollwert mit. Das Kampftagebuch kommt ohne data/ aus: es rechnet ueber vom Nutzer eingetragene Partien, seine Konvention wird deshalb am Quelltext abgelesen (gespeicherte Nutzerdaten werden nicht angefasst). VIER Ungleichungen, die der Zaehler unten NICHT sieht, alle Vorpruefungen gegen ein leeres Bestehen bzw. Eigenschaften der Formeln: dass jede Datei ueberhaupt mehr als 50 auswertbare Zeilen liefert, und dass die beiden NICHT gewaehlten Konventionen unter 90 % der Zeilen treffen. Die 90 % sind keine abgelesene Wochenzahl, sondern eine Eigenschaft der Formeln — auf Zeilen ohne Unentschieden fallen alle drei zusammen, ein Sieger ohne Abstand waere keine Zuordnung. Faellt der Abstand, hat die Quelle ihre Konvention gewechselt, und dann MUSS der Test rot werden, denn dann stimmt jede Beschriftung nicht mehr. Die Obergrenze unten wird dafuer bewusst nicht erhoeht.',
    'test-pocket-kartenzuordnung.js':    'Befund 10.09.2026: gibt es eine belastbare Zuordnung von Pocket-Kennung auf Kartenname? Gemessenes Ergebnis: es gibt gar keine Pocket-ID (Felder "id", "card_id", "pk_id", "pocket_id" kommen in data/pocket_tierlist.json je 0-mal vor); die Zuordnung laeuft ueber (set, nummer). Gelesen wird ausschliesslich diese eine Datei, und zwar auf INNERE STIMMIGKEIT: dass jeder der 435 Karteneintraege Name, Set und Nummer traegt, dass keiner der 172 verschiedenen (set, nummer) zwei Namen traegt, und dass Set und Nummer ihre Form behalten (20 regulaere Sets A1..B4a plus die Promo-Sets P-A und P-B). KEINE Zahl aus der Datei wird behauptet: wie viele Decks, welche Stufen, welche Karten — alles egal, sie muessen nur zueinander passen. Kein Wochenwert und keine einzige Ungleichung gegen eine feste Zahl; die Obergrenze unten bleibt, wo sie ist. Was die Datei NICHT prueft, steht in ihrem Kopf: ob (set, nummer) auf die Karte zeigt, die Game8 meint — dafuer braeuchte es einen Abruf bei game8.co, und den hat der Sandkasten nicht.',
    'test-shiny-quelle-und-stand.js':    'Befund 10.09.2026: "Kein veroeffentlichtes Shiny" stand in der Champions-Pokedex-Kachel ohne Datum da, obwohl data/pokemon_go_shiny.json in _meta.stand eines fuehrt und in _meta.lesart_kein_treffer selbst "zum Stand der Quelle" schreibt. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen wird data/pokemon_go_shiny.json, aber KEINE ihrer Zahlen wird behauptet: geprueft wird, dass _meta die Herkunft vollstaendig fuehrt (Adresse, Name, Stand als Datum, Lesart der Verneinung, Zahl der uebersprungenen Ankuendigungen) und dass js/app-side-quest-pokedex.js Quelle UND Stand auf den Schirm schreibt. Wie viele Grundformen ein Shiny haben, ist jeder Zusicherung egal. ZWEI Ungleichungen, die der Zaehler unten nicht sieht, beide harmlos: angekuendigt_uebersprungen >= 0 und eine Formpruefung. Die einzige Zusicherung, die ein Datenlauf umwerfen kann, ist die Gleichheit der Quelladresse — und wenn die sich aendert, MUSS der Test rot werden, denn dann gilt der im Kopf der Datei gemessene Umfang nicht mehr. Die Obergrenze unten wird nicht erhoeht.',
    'test-regelbasis-interaktionen.js':  'Befund 10.09.2026: data/card_capability_interactions.json steht seit dem 15.05.2026 auf Version 0.1, und bis dahin hat KEIN Test die Datei je gelesen. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil der Pfad ueber eine Konstante laeuft. Gelesen werden data/card_capability_interactions.json und data/card_capability_patterns.json — beide sind HANDGEPFLEGTE Regeldateien, keine Scraper-Ausgabe: sie aendern sich, wenn jemand eine Regel schreibt, nicht mit dem Wochenlauf. Geprueft wird innere Stimmigkeit (jede Marke einer Paarung kommt in der Musterdatei vor, keine doppelten Paarungen, Angreifer- und Verteidigerseite nicht vertauscht, alle Felder da, nur Platzhalter, die js/card-capability-engine.js auch ersetzt, deutsch und englisch mit denselben Platzhaltern). DREI Ungleichungen, die der Zaehler unten nicht sieht: interactions.length > 0, matchup_value als endliche Zahl, und die Zahl der Fliesstext-Stellen, die "fuenf Paarungen" behaupten (>= 5, gemessen waren es 10). Die Zahl der Paarungen selbst wird NICHT festgenagelt — weicht sie vom Grundstand 5 ab, meldet der Test das mit der Liste der Saetze, die dann nachgezogen werden muessen, und jemand setzt den Grundstand bewusst neu. Die Obergrenze unten wird nicht erhoeht.',
    'test-alt-vorschlag-schwelle.js':    'Befund 10.09.2026: ALT_SUGGESTION_MIN_GAP = 50 in js/deck-builder-consistency.js berief sich auf einen "Turin sweep", den es im Repo nicht gibt — die Zahl ist gegriffen. STEHT HIER FREIWILLIG UND IST DER HEIKELSTE EINTRAG DIESES REGISTERS: die Datei liest data/tournament_decklists_per_player.csv, baut damit alle 58 baubaren Archetypen durch und misst, was die Schwelle tut. Das sind LEBENDE Daten, die jeder Scraperlauf verschiebt. Deshalb behauptet keine Zusicherung einen Wert, sondern nur VORHANDENSEIN mit weitem Band: dass das Tor ueberhaupt erreicht wird (gemessen 37 Kandidaten), dass es etwas durchlaesst (10) und dass es etwas unterdrueckt (27). Faellt eine der drei auf null, ist die Schwelle entweder tot oder ein Totalfilter — beides gehoert angeschaut, und dann MUSS der Test rot werden. Die vierte, urspruenglich als ">= 2 Plaetze Abstand zur Kante" geschriebene Zusicherung wurde bewusst auf "> 0" geweitet: ein enges Band waere genau die Bauart, an der der Deploy schon zweimal haengengeblieben ist. Verlangt wird jetzt nur noch, dass die 50 nicht EXAKT auf einem gemessenen Abstand sitzt (Sicherheitsabstand am 10.09.2026: 8 nach unten, 14 nach oben). Die Richtungspruefungen des Tors laufen datenfrei an einem von Hand gerechneten Listensatz und lesen die Schwelle aus dem Modul, statt sie abzuschreiben. SIEBEN Ungleichungen, die der Zaehler unten nicht sieht, alle von dieser Bauart; die Obergrenze wird dafuer nicht erhoeht.',
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
/* 09.09.2026: 98 -> 101. Dazugekommen ist test-variable-staerke.js mit
   drei Ungleichungen. Alle drei sind Vorpruefungen gegen ein leeres
   Bestehen, keine abgelesenen Wochenwerte: "es gibt ueberhaupt
   Schadensattacken" (>200 von 299), "die Regel greift ueberhaupt"
   (>=10 von 23) und ein Index im eigenen Quelltext. Die beiden
   Datenschranken haben rund das Zehnfache Luft nach unten und stimmen
   auch in vier Wochen noch — die Zahl der Attacken in Champions
   aendert sich um Einzelstuecke, nicht um Zehnerpotenzen. */
/* 09.09.2026, zweiter Schritt: 101 -> 103. test-nachschlagen-anzeige.js
   bringt zwei weitere Vorpruefungen gegen ein leeres Bestehen mit (es
   gibt ueberhaupt eine Attacke mit accuracy===true; es gibt mindestens
   17 Typen). Beide sind Eigenschaften des Datensatzes, keine
   Wochenwerte. */
/* 09.09.2026, dritter Schritt: 103 -> 107. test-namensbruecke-decklisten.js
   bringt vier Vorpruefungen gegen ein leeres Bestehen mit. Sie haengen an
   abgeschlossenen Turnieren (0069, 0071) und an der Groesse der
   Brueckendatei, nicht an Wochenwerten. */
/* 09.09.2026, vierter Schritt: 107 -> 108. test-stufen-im-text.js hat
   eine Vorpruefung dazubekommen: „mindestens 5 Attacken mit Stufenmarke
   im englischen Text". Sie ist noetig geworden, weil die Luecke, an der
   der Test frueher haftete (Attacken ohne deutschen Text), seit der
   op.gg-Zweitquelle geschlossen ist — die Regel wird jetzt an gesetzten
   Eintraegen geprueft, und die Vorpruefung stellt sicher, dass es
   ueberhaupt welche gibt. Kein Wochenwert: die Zahl der Attacken mit
   Stufenangabe im englischen Text liegt bei ueber hundert. */
/* 10.09.2026: 108 -> 112. test-meta-prognose.js bringt vier
   Vorpruefungen gegen ein leeres Bestehen mit (Zeilenzahl, Ankerzahl,
   Laenge des gerenderten HTML, Reihenfolge der beiden Wirte in
   index.html). Keine Wochenwerte: die Prognose fuehrt
   ueber hundert Archetypen, das Modell sechs Anker. */
/* 15.09.2026: 112 -> 113. test-champions-matchups.js bekommt eine
   Vorpruefung gegen leeres Bestehen: „mindestens 3 Geschlechtsformen im
   Kader". Sie gehoert zur Trennung von maennlich und weiblich
   (Betreiberauftrag, "bei Salmagnis müssen wir einen unterschied
   zwischen männlich und weiblich machen") — ohne sie waere die
   Zusicherung darunter gruen, sobald GAR KEINE Geschlechtsform mehr im
   Kader steht, also genau im Fehlerfall.
   Kein Wochenwert: die drei (Salmagnis, Servol, Psiaugon je weiblich)
   haengen an Smogon-Basiswerten und eigenen Nutzungszeilen, nicht an der
   Rangliste dieser Woche. Faellt eine davon weg, SOLL der Test
   umfallen. */
/* 16.09.2026: 114 -> 116. Die zwei neuen sind die Vorpruefungen in
   test-attacken-merkmale.js ("traegt ueberhaupt eine Attacke ein
   Rueckstoss-Merkmal?"). Sie stehen gegen ein LEERES BESTEHEN, nicht
   gegen eine feste Zahl: ohne sie koennte der Parser leer laufen und
   alle anderen Zusicherungen derselben Datei blieben gruen. */
/* 16.09.2026: 116 -> 125. Die neun neuen stehen alle in
   test-schwaechen-ausgleich.js und sind VORPRUEFUNGEN GEGEN EIN LEERES
   BESTEHEN, keine Wochenwerte: „mehr als 200 Arten im Kader", „mehr als
   500 gepruefte Paare", „mindestens eine Bedrohung und ein Ausgleicher".
   Die tragenden Zusicherungen der Datei sind Gleichungen gegen die
   eigene Rechnung — die Ungleichungen sorgen nur dafuer, dass ueberhaupt
   etwas zu vergleichen da ist. Liefe die Nutzungsdatei oder der Pokedex
   leer, blieben sonst alle Gleichungen gruen, weil sie ueber leere
   Listen laufen. */
/* 16.09.2026: 125 -> 126. Die eine neue steht in
   test-rechner-kampflage.js und ist die GEGENPROBE zur Regel „was
   nachweislich wirkt, steht nicht im 'nicht gerechnet'": der Abschnitt
   nach „Nicht gerechnet:" muss laenger als 15 Zeichen sein. Ohne sie
   koennte man den Vorbehalt leerraeumen und die Regel darueber bestuende
   still. Kein Wochenwert — sie misst einen Oberflaechentext, keine
   Daten; der Zaehler sieht sie nur, weil die Datei nebenbei data/
   liest. */
/* 16.09.2026: 126 -> 127. Die eine neue steht in
   test-rechner-reiter.js und ist der Deckel der Vergleichsliste
   („hoechstens zwoelf gemerkte Staende"). Kein Wochenwert: die Zahl
   kommt aus dem Code, nicht aus den Daten; der Zaehler sieht sie nur,
   weil die Datei nebenbei data/ liest, um ein echtes Paar zu bilden. */
const OBERGRENZE = 127;

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
