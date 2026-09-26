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

/* Der ENGE Blick: der Lesevorgang steht ausgeschrieben im Test.
   Bis zum 22.09.2026 war das der einzige. */
const liestLiveDatenDirekt = (t) =>
    /readFileSync\([^)]*(path\.join\([^)]*['"]data['"]|['"]data\/|ROOT[^)]*data)/.test(t) ||
    /join\(ROOT,\s*['"]data['"]/.test(t);

/* DER BLINDE FLECK, gemessen am 22.09.2026.

   Der enge Blick findet 43 Dateien. Wirklich aus data/ lesen 91. Die
   uebrigen 48 tun es ueber einen Helfer —

       const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
       ...
       const RES = JSON.parse(lies('data/champions_resources.json'));

   — und `path.join(ROOT, p)` enthaelt das Wort 'data' nicht. Deshalb
   war tests/unit/test-rechenfehler.js fuer diesen Wachhund unsichtbar,
   und deshalb konnte dort `assert.equal(n, 34)` stehen und am 09. und
   am 13.09.2026 zweimal von Hand hochgesetzt werden, nachdem die
   Deploy-Kette gestanden hatte. Der Wachhund war die ganze Zeit gruen.

   Ein Wachhund, der die Haelfte des Hofes nicht sieht, meldet Ruhe.

   Der WEITE Blick nimmt jede Zeichenkette, die auf eine Datei unter
   data/ zeigt. Er traegt die beiden Sperrklinken unten — und seit dem
   Nachmittag des 22.09.2026 auch die Registerpflicht: die 37 fehlenden
   Eintraege sind geschrieben, jede Datei gelesen, jede Zusicherung
   gegen Live-Daten eingeordnet und am echten Bestand nachgemessen. Der
   enge Blick bleibt nur noch als Begriff stehen, weil die Notiz oben
   sonst nicht mehr zu verstehen waere. */
const liestLiveDaten = (t) =>
    liestLiveDatenDirekt(t)
    || /['"`]data\/[A-Za-z0-9_.\/-]+['"`]/.test(t);

// assert.ok(... irgendwas < 5 ...) — eine Ungleichung gegen eine feste Zahl.
const UNGLEICHUNG = /assert\.ok\([^;]*[<>]=?\s*-?\d/;

/* GLEICHHEIT gegen eine feste Zahl — die zweite Haelfte derselben
   Bauart, und bis zum 22.09.2026 sah dieser Wachhund sie gar nicht.
   Er zaehlte nur Ungleichungen.

   Was er dadurch durchgelassen hat, steht in
   tests/unit/test-rechenfehler.js:

       assert.equal(n, 34);   // Flaechenattacken

   Diese Zeile ist am 09.09.2026 von 32 auf 33 und am 13.09.2026 von 33
   auf 34 gesetzt worden, beide Male von Hand, beide Male NACHDEM die
   Deploy-Kette stand. Zweimal derselbe Vorgang, und der Wachhund, der
   genau dafuer gebaut wurde, hat geschwiegen — weil `==` kein `<` ist.

   Zweistellig und groesser: unter zehn ist fast immer eine Sorte
   (zwei Spalten, drei Reiter), kein abgelesener Bestand. Dieselbe
   Schwelle benutzt die Python-Seite (AB_HIER_BESTAND). */
const GLEICHHEIT = /assert\.(equal|strictEqual|deepEqual|deepStrictEqual)\([^;]*,\s*-?\d{2,}\s*[,)]/;

function dateienMitDatenzugriff() {
    return fs.readdirSync(UNIT)
        .filter(f => f.startsWith('test-') && f.endsWith('.js'))
        .filter(f => liestLiveDaten(fs.readFileSync(path.join(UNIT, f), 'utf8')));
}

/* Nur die Dateien, die der enge Blick sieht. Seit dem 22.09.2026 haengt
   die Registerpflicht nicht mehr hier, sondern am weiten Blick; die
   Funktion bleibt, weil die Notiz oben den Unterschied beschreibt und
   eine Pruefung ohne ihren Gegenbegriff schwer zu lesen ist. */
function dateienMitDirektemDatenzugriff() {
    return fs.readdirSync(UNIT)
        .filter(f => f.startsWith('test-') && f.endsWith('.js'))
        .filter(f => liestLiveDatenDirekt(fs.readFileSync(path.join(UNIT, f), 'utf8')));
}

function zeilenMit(datei, muster) {
    return fs.readFileSync(path.join(UNIT, datei), 'utf8').split('\n')
        .filter(z => {
            const s = z.trim();
            if (s.startsWith('//') || s.startsWith('*')) return false;
            return muster.test(z);
        }).length;
}

function ungleichungen(datei) { return zeilenMit(datei, UNGLEICHUNG); }
function gleichheiten(datei) { return zeilenMit(datei, GLEICHHEIT); }

/**
 * Das Register. Jede Testdatei, die eine Datei aus data/ liest, steht hier
 * mit einem Satz dazu, WARUM das in Ordnung ist. Eine neue Datei ohne
 * Eintrag laesst diesen Test fallen — genau das ist der Zweck.
 */
const REGISTER = {
    'test-post-kaskade.js':              'Der Gang durch die Post-Filter (26.09.2026, Befund des Betreibers: „Wenn ich bei Posts auf Decklist bin, zeigt er mir bei Fill from die gleichen Optionen an wie ueberall auch. Das ergibt ja keinen Sinn."). Sie liest aus data/, weil der Gang durch den Baum auch die dreizehn alten Quellen erreicht und jede davon ihre echte Datei laedt — geprueft wird an ihnen aber NICHTS aus den Daten: dass ein Blatt entweder ein Bild mit Titel und Fusszeile liefert oder einen verstaendlichen Befund, dass keine Fusszeile 48 Zeichen und kein Wert 12 Zeichen ueberschreitet (beides Klippen von malListe, keine Wochenwerte), und dass kein Waehler leer angeboten wird. Welche Turniere und welche Zahlen diese Woche in den Dateien stehen, ist jeder Zusicherung egal. Die ZAHLEN der abgeleiteten Listendatei prueft tests/python/test_post_decklisten.py gegen die echten 45 MB; hier steht dafuer bewusst ein kleiner Ausschnitt im Testcode, weil eine Zusicherung ueber die MECHANIK nicht davon abhaengen darf, welches Turnier zuletzt lief. SIEBEN UNGLEICHUNGEN sieht der Zaehler, alle Vorpruefungen gegen ein leeres Bestehen: dass der Gang ueberhaupt mehr als zwanzig Blaetter findet (sonst bestuende die Schleife darueber leer), dass „decks" ueber mindestens drei Stufen fuehrt, dass jede Stufe Optionen hat, und die zwei Klippen von malListe. Dafuer wurde die OBERGRENZE von 396 auf 403 gesetzt, am selben Tag auf 406 und nach der Abnahme durch den Pruefagenten auf 409 (der Nenner einer Platzierung war die Zahl der eingereichten Listen statt der Teilnehmerzahl, die Fusszeile lief bei vierstelligen Feldern ueber, der Spaltenkopf verschwieg die Zahl der nicht gezeigten Karten): die Live-Abnahme brachte drei weitere Ungleichungen, weil der Kicker gemessene 40 Zeichen fasst (gesperrt 652 px bei 15 px; 42 Zeichen messen 685, und malKopf schneidet bei 660). Gefunden wurde das im Bild - dort stand die Zeile abgeschnitten, und beim Major fiel das Datum weg. Die eine Gleichheit gegen eine feste Zahl (KICKER_MAX === 40) ist dieselbe Messung und keine Zahl aus den Daten.',
    'test-druckauswahl-und-deck-offen.js': 'Welcher Druck im Rarity Switcher zur Auswahl steht, und dass das bearbeitete Deck in „Meine Decks" aufgeklappt bleibt (25.09.2026, zwei Befunde des Betreibers). Aus data/ liest sie NUR die Karten-Chunks, und nur um zu belegen, dass es die Drucke gibt, um die es geht: jede SVE-Metall-Energie der Datenbank muss waehlbar sein — WELCHE Nummern das sind und was in ihrer Rarity-Spalte steht, ist jeder Zusicherung egal. Kein Wochenwert wird behauptet; die Auswahlregel selbst wird AUSGEFUEHRT (druckIstWaehlbar in einem vm-Kontext), nicht im Quelltext gesucht. ZWEI Ungleichungen, beide Vorpruefungen gegen ein leeres Bestehen und beide gegen EINS: dass ueberhaupt eine SVE-Metall-Energie in der Datenbank steht, und dass das Kommentar-Ausschneiden nicht zu viel entfernt hat. Dafuer wurde die OBERGRENZE von 394 auf 396 gesetzt.',
    'test-city-league-chipquelle.js':    'Frischechip und angezeigte Datei der City League: liest data/data_stand.json und das Verzeichnis data/, aber keine einzige Zahl aus einer Datendatei. Vier Sorten Zusicherung, alle strukturell. (1) BESTAND: jeder Dateiname in CHIP_PAARE muss als Datei existieren — die Zuordnung steht ausgeschrieben statt als Namensregel, und das ist genau die Zusicherung, die das rechtfertigt. (2) DECKUNG: die Ausgangsangabe data-quelle in index.html muss in CHIP_PAARE vorkommen, sonst greift die Umschaltung ins Leere. (3) VORHANDENSEIN eines Inhaltsdatums fuer die beiden _past-Dateien in data_stand.json — WELCHES Datum dort steht, ist der Pruefung egal, es muss nur eins geben; ohne das zeigte der Chip das Schreibdatum einer Datei, deren Inhalt Wochen aelter ist. (4) Dass die vier leeren Dateien weiterhin als leer gefuehrt sind, mit ausdruecklicher Ansage im Fehlertext, dass ein Wegfall auch heissen kann: sie haben Daten bekommen, dann gehoert die Zusicherung ueberdacht statt repariert. KEINE Ungleichung an Live-Daten: die einzige Mengenzusicherung ist eine GLEICHHEIT (CHIP_PAARE fuehrt genau vier Namen) und laeuft gegen den Quelltext, nicht gegen data/. Anlass war ein Live-Befund vom 10.09.2026: der Reiter zeigte 26 Listen, der Chip daneben "keine Daten".',
    'test-b1-listen-vorwert.js':         'Einheit des Bayes-Vorwerts (B1): liest limitless_online_decks.csv und limitless_online_decks_comparison.csv, aber NUR als Schema (welche Spalten es gibt) und als GLEICHUNG zwischen beiden Exporten (new_count == count). Welche Zahlen dort diese Woche stehen, ist der Pruefung egal. Die eine Ungleichung (Summe Partien > Summe Listen) ist eine Eigenschaft der beiden Einheiten, kein Wochenwert: sie faellt erst, wenn jedes Deck hoechstens eine Partie je Liste spielt.',
    'test-champions-base-stats.js':      'Schema der Statuswerte, keine Zahlenbaender',
    'test-champions-damage.js':          'Rechenwege am Schadensmodell; Baender sind physikalisch (Chance zwischen 0 und 1)',
    'test-attacken-merkmale.js':         'Die Attacken-Merkmale aus data/champions_move_flags.json und die elf Faehigkeiten, die daran haengen (16.09.2026). Sie liest ZWEI Dateien aus data/ und behauptet an keiner Stelle einen Wochenwert: geprueft wird die GLEICHUNG zwischen Datei und Wirklichkeit (wer keinen Eintrag hat, steht in _meta.ohne_eintrag — und umgekehrt), und dass die Merkmalsdatei keine Attacke ergaenzt, die der Bestand nicht fuehrt. Wie viele Faustattacken es diese Woche gibt, ist jeder Zusicherung egal. Das VERHALTEN der elf Faehigkeiten wird an der echten Rechnung ausgefuehrt, nicht im Quelltext gesucht. ZWEI Ungleichungen sieht der Zaehler unten, und dafuer wurde die OBERGRENZE von 114 auf 116 gesetzt: es sind VORPRUEFUNGEN GEGEN EIN LEERES BESTEHEN. Sie fragen, ob ueberhaupt eine Attacke ein Rueckstoss- bzw. Zusatzeffekt-Merkmal traegt. Liefe der Parser eines Tages leer, waeren Achtlos und Rabauke stillschweigend wirkungslos und JEDE andere Zusicherung dieser Datei bliebe trotzdem gruen. Es sind keine festen Zahlen — nur \'groesser als null\'.',
    'test-champions-schaden-ketten.js':  'Die vier Modifikatorketten des Schadensrechners (Umbau 16.09.2026 nach dem NCP-Rechner). Aus data/ kommt NUR champions_type_chart.json — die Typentafel ist Regelwissen und aendert sich nicht mit einem Scraperlauf. Alle Bauten sind GESETZT (feste Werte im Kopf der Datei), damit die Zusicherungen die Rechnung pruefen und nicht den naechtlichen Lauf. Kein Wochenwert wird behauptet.',
    'test-champions-matchups.js':        'Struktur der Matchup-Datei, Rechnung an gesetzten Werten',
    'test-rechner-reiter.js':            'Der Schadensrechner als EIGENER Reiter (16.09.2026, Anlass: „der Damage Culc ist ja immer noch kein eigenes Feature"). Sie liest data/, um ein echtes Paar zu bilden — WELCHES, ist jeder Zusicherung egal: es wird zur Laufzeit gesucht, bis beide Seiten wirklich Schaden machen. Keine einzige Zahl aus den Daten steht in einer Zusicherung. Geprueft werden drei Sorten Sache. (1) EIGENSCHAFTEN DER RECHNUNG: Hilfreiche Hand hebt, Helfer senkt, die Hand des Verteidigers und der Helfer des Angreifers aendern NICHTS (das ist die Seitenprobe), der Helfer wirkt auch im Volltreffer, ein Schirm nicht — alles Richtungen, keine Betraege, jeweils mit Rueckprobe auf den Grundwert. (2) GLEICHUNGEN GEGEN SICH SELBST: der Satz im Kopfband traegt genau die Spanne, den Anteil und das K.O.-Urteil, die dieselbe Rechnung liefert; die gewaehlte Attacke und die gewaehlte Richtung landen im Kopfband. (3) ZWEI FEHLER, DIE BEIM BAUEN LIVE GEMESSEN WURDEN und deshalb festgehalten sind: die gemeinsamen Zuhoerer in wire() duerfen nicht blind render() rufen (sonst bleibt die Zahl im Rechner-Reiter stehen, waehrend der Zustand darunter schon der neue ist), und die Ansichtsfahne muss den Zeichenvorgang ueberleben (sonst bearbeitet der Set-Editor des Rechners das Set des Matchup-Paares). EINE UNGLEICHUNG, eine Vorpruefung gegen ein leeres Bestehen: die Vergleichsliste haelt hoechstens zwoelf Staende — geprueft mit zwanzig nachweislich VERSCHIEDENEN Eintraegen, weil sonst schon die Doppelsperre greift und der Deckel ungeprueft bliebe. Dafuer wurde die OBERGRENZE von 126 auf 127 gesetzt.',
    'test-rechner-kampflage.js':         'Die Kampflage im Schadensrechner (16.09.2026, Anlass: „der Damage Culc ist ja immer noch nicht fertig und als Feature verfuegbar"). Sie liest data/, um echte Paare zu bilden — WELCHE, ist jeder Zusicherung egal: das Paar wird zur Laufzeit gesucht, bis eines wirklich Schaden macht. Geprueft werden ausschliesslich RICHTUNGEN, nie Betraege: Sonne hebt Feuer und Regen senkt es (am selben Paar gemessen), ein Volltreffer liegt ueber dem normalen Treffer, +2 Stufen ueber dem Grundwert und -2 darunter, ein Schirm auf der VERTEIDIGERSEITE senkt und auf der Angreiferseite nicht, Verbrennung senkt physischen Schaden und laesst speziellen unberuehrt. Jede Richtung hat ihre Rueckprobe: der zurueckgesetzte Zustand muss wieder GENAU den Grundwert ergeben — ohne die waere „Feld wirkt" von „Feld wirkt und bleibt haengen" nicht zu unterscheiden. Keine einzige Zahl aus den Daten steht in einer Zusicherung, und der Rest prueft gezeichnetes HTML (Feldleiste im Einzel- UND im Team-Rechner, Lage im Set-Editor) statt Quelltext. NULL Ungleichungen an Live-Daten.',
    'test-rechner-kader.js':             'Die Kaderleiste im Rechner (16.09.2026, Anlass: \u201ekoennen wir hier noch irgendwie mein Team 1:1 wie ich es spiele reinladen und beim Gegner per pick 6 schnell auswahl die 6 moeglichen Pokemon mit dem Set wie es am meisten gespielt wird\u201c). Sie liest sieben Dateien aus data/ und behauptet an keiner Stelle einen Wochenwert \u2014 welches Pokemon diese Woche oben steht, kommt IMMER aus der Datei selbst. Drei Sorten Zusicherung. (1) GLEICHUNGEN GEGEN DIE NUTZUNGSDATEI: metaTop(6) ist genau buildRoster().filter(hat Satz).slice(0,6) \u2014 derselbe Weg, den die Oberflaeche geht, noch einmal gerechnet; und die Reihenfolge ist wirklich absteigend nach der gemessenen Nutzung, geprueft Paar fuer Paar. Kein Name und keine Zahl steht im Testcode. (2) EIGENSCHAFTEN, die unabhaengig vom Bestand dieser Woche gelten: ein uebernommener Satz landet unter dem Schluessel, den setFor() liest \u2014 sonst rechnet der Reiter weiter mit dem Durchschnittssatz und sieht dabei genauso aus; geprueft ueber die WERTE, indem derselbe Satz zweimal uebernommen wird, einmal mit null und einmal mit 32 Angriffspunkten. Die Kampflage bleibt dabei neutral (ein Team sagt nichts ueber den Kampfstand), die Punkte werden geklammert wie im Builder, ein Eintrag ohne Nutzungsdaten bleibt SICHTBAR und nennt den Grund statt still zu verschwinden, und der Reiter eroeffnet nicht mit dem Spiegelmatch \u2014 bleibt aber beim Spiegel, wenn die Nutzungsdatei nur eine Art hergibt (geprueft mit einer auf einen Eintrag gekuerzten Kopie der Datei, nicht mit einem gesetzten Zustand). (3) ZWEI BLINDHEITEN, DIE BEIM SCHREIBEN GEMESSEN WURDEN und deshalb im Muster stehen: die Suche nach wireKader(host) trifft auch die DEFINITION, also wird nur im Renderer geschnitten; und indexOf gibt fuer einen FEHLENDEN Kader -1 zurueck, was kleiner ist als alles \u2014 die Reihenfolgeprobe verlangt deshalb erst das Dasein. DREI UNGLEICHUNGEN an Live-Daten, alle VORPRUEFUNGEN GEGEN EIN LEERES BESTEHEN: das oberste Pokemon hat ueberhaupt eine gemessene Nutzung (sonst waere die Sortierprobe ueber lauter Nullen gruen), jedes der sechs hat Attacken im Satz, und der Angriffswert MIT Punkten ist groesser als ohne (sonst haette die Uebernahme nichts bewirkt und niemand haette es gesehen \u2014 genau so ist diese Zusicherung beim Schreiben zuerst durchgefallen). Dafuer wurde die OBERGRENZE von 127 auf 130 gesetzt.',
    'test-rechner-items-und-initiative.js': 'Gegenstands-Bilder, Initiative am Sprite und zweisprachige Namen bei Formen (16.09.2026, drei Punkte des Betreibers). Sie liest acht Dateien aus data/ und behauptet an keiner Stelle einen Wochenwert \u2014 jeder Gegenstand, jedes Pokemon und jeder Name wird zur LAUFZEIT aus der Datei gesucht, nie im Testcode genannt. Vier Sorten Zusicherung. (1) GLEICHUNGEN GEGEN DIE EIGENE RECHNUNG: die Zahl unter jedem Sprite ist genau initiative(satz, statsOf(...)) \u2014 dieselbe Funktion, die auch die Zeile im Kopfband fuellt, noch einmal gerechnet; und Rueckenwind verdoppelt sie. Ohne die zweite Haelfte koennte dort eine beliebige Zahl stehen, die zufaellig einmal passt. (2) GLEICHUNGEN GEGEN DAS DATEISYSTEM: jeder Dateiname, den die Gegenstandsliste ausgibt, muss unter images/champions-items/ wirklich liegen \u2014 ein Manifesteintrag ohne Datei ist genau das kaputte Bild, das der Betreiber dann sieht. (3) EIGENSCHAFTEN, die unabhaengig vom Bestand dieser Woche gelten: wo PokeAPI kein Bild fuehrt (Champions-eigene Mega-Steine), steht KEIN fremdes Bild als Platzhalter, sondern ein leeres Feld mit derselben Breite; eine zugeklappte Liste steht nicht im HTML; ohne Satz steht KEINE Initiative da (eine 0 waere eine Behauptung); und fuer einen unbekannten Namen wird kein deutscher erfunden. (4) DER GEMELDETE FALL SELBST, ohne ihn einzutippen: gesucht wird zur Laufzeit eine Form, die im Pokedex einen deutschen Namen hat und in champions_names_de.json fehlt \u2014 genau die stand vorher englisch da (\u201eMega Golisopod\u201c). ZWEI Ungleichungen sieht der Zaehler, beide VORPRUEFUNGEN GEGEN EIN LEERES BESTEHEN und beide gegen die Zahl der GEPRUEFTEN FAELLE, nicht gegen einen Datenwert: dass die Gegenstandsliste ueberhaupt ein Bild ausgibt (sonst pruefte die Schleife darunter ueber eine leere Liste), und dass mindestens zehn Sprites mit ihrer Initiative verglichen wurden (sonst bestuende die Gleichung, weil gar nichts verglichen wurde). Die OBERGRENZE bleibt bei 140 — gemessen steht der Zaehler danach bei 139.',
    'test-rechner-schnellleiste.js':     'Die Schnellleiste, der Paste-Import und das Auswahlfenster des Rechners (16.09.2026, sieben Punkte des Betreibers in einer Nachricht). Sie liest sieben Dateien aus data/ und behauptet an keiner Stelle einen Wochenwert \u2014 jedes Pokemon, jede Attacke und jeder Wert wird zur Laufzeit aus der Datei gesucht, nie im Testcode genannt. Vier Sorten Zusicherung. (1) EIGENSCHAFTEN DER RECHNUNG: Rueckenwind verdoppelt die Initiative, laesst aber den Wert des Pokemon UND jeden Schaden unveraendert (drei Richtungen, keine Betraege); die Kampflage steht im Rechner nur EINMAL (oben), in der Matchup-Ansicht weiterhin im Editor. (2) GLEICHUNGEN GEGEN DIE EIGENE RECHNUNG: moveTable bleibt nach Schaden sortiert (daran haengt bestMove), und die Satzstelle jeder Zeile zeigt wirklich auf dieselbe Attacke im Satz \u2014 geprueft Zeile fuer Zeile; die gezeichneten Zeilen stehen dann aufsteigend nach dieser Stelle. Das Paar dafuer wird zur Laufzeit gesucht, bis sich die beiden Reihenfolgen WIRKLICH unterscheiden \u2014 sonst bestuende die Zusicherung leer. (3) EIGENSCHAFTEN DES PASTE-LESERS, an einem aus der Datei gebauten Export: der Satz landet dort, wo gerechnet wird (geprueft ueber den Angriffswert, nicht ueber das Formular), die Punkte werden geklammert, mehr als sechs werden gekappt, ein Paste ohne EINE bekannte Art wird abgelehnt und benannt, ein Paste mit teils unbekannten Arten bleibt stehen und schreibt sie an. Der Leser selbst ist der ECHTE aus app-side-quest.js, im selben vm-Kontext geladen \u2014 ein nachgebauter waere die Quelle dafuer, dass ein Paste an der einen Stelle geht und an der anderen nicht. (4) TEXT, DER WIRKLICH TEXT IST: die CSS-Regeln der neuen Merkmale, der Ausgang showView auf den Rechner-Reiter im Builder-Weg, und dass Kopfband und Editor die weggeraeumten Teile nicht mehr fuehren. ZWEI UNGLEICHUNGEN an Live-Daten, beide VORPRUEFUNGEN GEGEN EIN LEERES BESTEHEN: das Auswahlfenster hat ohne Suche mehr als 50 Kandidaten (sonst waere die Suchprobe ueber einer fast leeren Liste gruen), und die Gegnerleiste traegt mindestens zwoelf Knoepfe mit ihrer Seite (sonst hiesse \u201ekeiner traegt die falsche Seite\u201c nur, dass es keine Knoepfe gibt). Dazu drei weitere aus der Live-Abnahme desselben Tages: der Paste des Betreibers brachte \u201eArcanine-Hisui\u201c mit, und die Nutzungsdatei fuehrt die Art als hisuian-arcanine \u2014 Showdown haengt die Form hinten an, die Datei setzt sie als Adjektiv davor. Geprueft wird das jetzt an JEDER Form mit Bindestrich, die die echte Datei fuehrt (mindestens zehn, sonst faellt die Probe durch), und der Showdown-Name wird dafuer aus dem Slug ZURUECKGEBAUT statt im Testcode aufgelistet. Die Regel \u201eeindeutig oder gar nicht\u201c ist mit den echten Daten NICHT ausloesbar (kein mehrdeutiger Fall in der ganzen Datei, gemessen) und steht deshalb auf einer gesetzten Nutzungsdatei mit zwei passenden Slugs \u2014 samt Gegenprobe, dass dieselbe Probe mit nur einem Slug wieder trifft. Und zuletzt der Suchfilter der Pokemon-Auswahl (\u201edas Feld sollte ein Suchfilter sein, damit ich nach raichu suchen kann\u201c): das <select> fand nur am WORTANFANG, also nie \u201eMega Raichu X\u201c. Geprueft wird das ohne jeden Namen im Testcode \u2014 gesucht wird zur Laufzeit ein Wortteil aus den echten Daten, der bei mindestens zwei Eintraegen NICHT am Anfang steht, und dann verlangt, dass alle davon gefunden werden UND mindestens einer den Teil in der Mitte traegt. Ohne die zweite Haelfte pruefte die Zusicherung nur, was ein Auswahlfeld auch koennte. Dazu: die Typsuche liefert ausschliesslich Pokemon dieses Typs, ein leeres Feld zeigt alles, und der Deckel von 40 Zeilen schreibt an, wie viele fehlen. Dafuer wurde die OBERGRENZE von 130 auf 140 gesetzt \u2014 eine Einheit geht an die Gegenprobe zum Ausschnitt in test-side-quest-aktivierung.js, die am selben Tag dazukam.',
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
    'test-abnahme-2026-09-05.js':        'Abnahme vom 05.09.2026 (neun Pruefagenten auf der Live-Seite). STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber einen Parameter reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen werden ZWEI Dateien aus data/: champions_usage.json und champions_pokedex.json. BERICHTIGT AM 23.09.2026 — DER EINTRAG HIER WAR FALSCH, UND DAS HAT MAIN ROT GEMACHT. Er behauptete: \"Welche Pokemon diese Woche in der Datei stehen, ist der Pruefung egal — sie prueft die Zuordnung, nicht den Bestand.\" Das stimmte nicht. Im Testcode standen sieben SCHLUESSEL der Quelle ausgeschrieben (alolan-ninetales und sechs weitere), und als championsbattledata am 23.09.2026 um 05:10 UTC die Schreibweise drehte (ninetales-alola, tauros-paldea-aqua, maushold-four), stand keiner davon mehr in der Datei — Deploy 3025, 3026 und 3027 rot, ohne dass jemand etwas geaendert hatte. Es war schon das zweite Mal: am 08.09.2026 hatte dieselbe Zusicherung aus demselben Grund angehalten, und die damalige Reparatur hat die auswendig gelernten Namen stehen gelassen. SO STEHT ES JETZT, und das ist nachpruefbar statt behauptet: die Erwartung kommt aus der DATEI SELBST. Fuer jeden Schluessel mit Bindestrich wird der Anzeigename in BEIDEN Schreibweisen zurueckgebaut, und die Umrechnung muss genau diesen Schluessel wiederfinden; dazu die Gegenrichtung, dass kein mehrteiliger Kadername auf die Grundform durchfaellt. Kein Pokemonname steht mehr als Erwartung im Code. Die zweite Zusicherung (\"beide Schreibweisen der Quelle werden erreicht\") liest gar keine Daten — sie fragt die Kandidatenliste, und die kommt allein aus dem Namen. Die BEIDEN Untergrenzen (mindestens 15 Schluessel mit Bindestrich, mindestens 50 mehrteilige Kadernamen) sind Vorpruefungen gegen ein leeres Bestehen und der Grund, warum die OBERGRENZE am 23.09.2026 von 390 auf 392 ging. Alles andere in der Datei sind Zusicherungen an den QUELLTEXT (js/, css/, backend/), keine Zahlen aus data/.',
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
    'test-praesenz-unentschieden-belegt.js': 'Die Quellenangabe zur Unentschieden-Quote gegen ihre Dateien. STEHT HIER FREIWILLIG (dieselbe Luecke). Geprueft wird KEIN Wochenwert, sondern zweierlei: das Verhaeltnis Praesenz zu Online (mindestens Faktor 3 — eine Eigenschaft der Spielformen, nicht der Woche) und dass die Partienzahl nicht unter den datierten Stand faellt (verloren ist ein Fehler, Zuwachs nicht). Die Datei existiert, weil die Kommentarzahlen am 07.09.2026 ueberholt waren; ihre erste Fassung nagelte dafuer einen Sollwert fest und hat am 22.09.2026 den Deploy angehalten, ohne dass etwas kaputt war.',
    'test-p53-konvention.js':            'Predictor 5.3, ausgefuehrt statt gegriffen. STEHT HIER FREIWILLIG (dieselbe Luecke). Liest data/, behauptet aber keine Wochenwerte: geprueft werden EIGENSCHAFTEN DER RECHNUNG (beide Seiten der Differenz in derselben Konvention, die Subtraktion laeuft wirklich ueber WinRateKonvention.differenz(), ohne Bilanz kommt kein Schub, der Schub verschiebt die S/(S+N)-Quote um genau (adjA-adjB) und ueberlebt die Praesenzumstellung unveraendert) und VERGLEICHE ZWEIER RECHENWEGE auf denselben Zeilen (alt gegen neu). Die Schranken sind benannte Konstanten mit Begruendung: MINDEST_KANDIDATEN und MINDEST_FELD sind Vorpruefungen gegen ein leeres Bestehen, MINDEST_WIRKUNG_PP sagt, dass die Umstellung ueberhaupt etwas bewegt, ALT_MINDESTFEHLER_PP haelt das gesetzte Gegenbeispiel aussagekraeftig. Die Frankfurt-Rekonstruktion ist als Rekonstruktion gekennzeichnet — sie baut die Kette und die Online-Matrix nach, nicht den Prognosekern.',
    'test-tag2-grundgesamtheit.js':      'Die Grundgesamtheit des Deckbauers ist der Tag-2-Cut. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine D()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Sie liest vier Dateien aus data/ und prueft an jeder GLEICHUNGEN ZWISCHEN DATEIEN, keine Wochenwerte: die Zahl der Listen in tournament_decklists_per_player.csv ist die Zahl der day2=1-Zeilen mit Platz in player_continuity.csv ist die Summe der Spalte day2_players in labs_tournament_decks.csv (und noch einmal in der Formatdatei TEF-PBL). Welche Turniere und welche Zahlen das diese Woche sind, ist jeder Zusicherung egal. Die EINE bewusste Ausnahme ist BELEGTE_FELDER aus js/deck-builder-consistency.js: der Sollwert kommt aus dem Code, der Istwert aus der Datei, und die harte Gleichheit ist genau der Zweck — sie SOLL rot werden, wenn Kommentar und Datei auseinanderlaufen. Das ist am 06.09.2026 passiert (der Wochenlauf zog Worlds von 774 auf 797, der Kommentar blieb stehen und niemand hat es bemerkt). Der Ausweg ist eingebaut und billig: ein Turnier, das aus dem Bestand faellt, wird uebersprungen, ein neues Turnier ist kein Fehler, und die Reparatur bei echtem Auseinanderlaufen ist eine Zahl im Kommentar. Alles, was Text prueft, laeuft auf GESETZTEN dataQuality-Objekten und ruft die echten Funktionen aus, statt den Quelltext zu greppen — ein Grep haette nicht bemerkt, dass die Online-Kachel faelschlich Tag 2 sagt. ELF UNGLEICHUNGEN, die der Zaehler unten NICHT sieht: acht Vorpruefungen gegen ein leeres Bestehen (mindestens ein Turnier, mindestens drei Archetypen, mindestens eine Zeile mit total_players, genau zwei Textvorlagen fuer die Mehrheitsdiagnose) und drei Schnittwaechter auf Quelltext, die gar keine Daten lesen. Die OBERGRENZE wird dafuer bewusst NICHT erhoeht: der Zaehler zaehlt diese Datei nicht mit, und zehn Einheiten Luft draufzulegen wuerde den Dateien, die er WIRKLICH sieht, unverdienten Spielraum schenken. Wird die Luecke in liestLiveDaten() geschlossen, sind es elf hier.',
    'test-anteile-und-konventionen-07-09.js': 'Befunde B1, B2, B4, B5 und B6 vom 07.09.2026, ausgefuehrt statt gegriffen. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Sie liest vier Dateien aus data/ (online_tournament_top8_decks.csv, limitless_online_decks.csv, limitless_online_decks_matchups.csv, data_stand.json) und behauptet an keiner Stelle einen Wochenwert: alle Sollwerte werden aus denselben Dateien gerechnet. Drei Sorten Zusicherung. (1) GLEICHUNGEN GEGEN DIE DATEI: der Anteil der Startseite ist total_brought / Summe total_brought; der aus den Anteilen eingegrenzte Limitless-Nenner gibt die Spalte share_numeric jeder Zeile wieder her (Toleranz 0,005 — die halbe Einheit der letzten angezeigten Stelle, also Rundung, kein Feld); der Top-20-Schnitt der Kachel ist der partiengewichtete Rohschnitt derselben Zeilen. (2) EIGENSCHAFTEN DER KONVENTIONEN: fuer Zeilen, die GENAU EINE der drei Formeln aus js/win-rate-konvention.js treffen, muss der erzeugte Text den Kurznamen eben dieser Konvention vor sein Gleichheitszeichen setzen. Welche Quoten dort stehen, ist der Pruefung egal — sie muessen nur zu ihrer eigenen Bilanz passen. (3) VORPRUEFUNGEN GEGEN EIN LEERES BESTEHEN: es gibt ueberhaupt eine eindeutige Zeile, der eingegrenzte Nenner ist nicht die Summe der gelisteten Listen, mindestens ein Deck steht auf zwei verschiedenen Anteilen, beide Sprachen tragen fuer cl.usageShare verschiedene Werte, und die erste Zeile der Datei hat ueberhaupt Top-20-Paarungen. Ohne sie koennte die jeweilige Zusicherung leer bestehen — genau der Fehler, den dieser Wachhund verhindern soll. Der Zaehler unten sieht die Datei NICHT; sie enthaelt EINE echte Ungleichung an Live-Daten (erg.partien > 0, eine Vorpruefung), und die OBERGRENZE wird dafuer bewusst nicht erhoeht — sie gilt den Dateien, die der Zaehler wirklich liest.',
    'test-r4-leerzustand-echte-daten.js': 'Befunde B2 und B4 vom 07.09.2026 (zweite Runde), Reiter "City League". Liest data/city_league_archetypes_past_comparison.csv und data/city_league_archetypes_past.csv und behauptet keinen einzigen Wochenwert: JEDER Sollwert wird aus derselben Datei gezaehlt, gegen die geprueft wird. Drei Sorten Zusicherung. (1) ZWEI RECHENWEGE AUF DENSELBEN ZEILEN: der Filter der Oberflaeche (increased) gegen die Zaehlung im Test (status !== \'NEU\' UND count_change > 0) — geprueft wird die Gleichung haeufiger == mitZuwachs - zuwachsUndNeu, nicht die Zahl 0. (2) GLEICHUNGEN GEGEN DEN TEXT: die Zahlen, die der Leerzustand ausschreibt ("11 von 11 Zeilen haben count_change > 0"), muessen die aus der Datei gezaehlten sein — genau das war am 07.09.2026 falsch, der Quelltext behauptete das Gegenteil der Datei. (3) VOLLSTAENDIGKEIT: jede der drei Rubriken ist entweder Tabelle ODER im Leerzustand benannt; die genannte Quelldatei existiert im Arbeitsbaum; Karte und Leerzustand nennen dasselbe Zeitfenster. Faengt eine echte City-League-Saison wieder an, bleiben alle Zusicherungen gruen — dann stehen die Tabellen da und der Leerzustand faellt weg. Ungleichungen an Live-Daten enthaelt die Datei keine; die drei Vorpruefungen gegen ein leeres Bestehen sind notEqual(..., 0).',
    'test-r5-duenne-basis.js':           'Befunde B2 und B3 der Nachpruefung vom 07.09.2026. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen werden ZWEI Dateien aus data/: tournament_decklists_per_player.csv (Felder deck_archetype, tournament_date, tournament_id, player_name, place) und format_window.json (in_person_legal_date). Behauptet wird kein einziger Wochenwert — jeder Sollwert wird aus DERSELBEN Datei gerechnet und gegen MostConsistencyBuilder.bestandsLageAus gestellt: Listenzahl, Listen im Fenster, Archetypen, Zahl der Archetypen unter MIN_WEIGHTED_LISTS und deren Aufteilung. Welche Decks diese Woche wie viele Listen haben, ist jeder Zusicherung egal; sie muessen nur zu sich selbst passen. Genau deshalb gibt es die Datei: der Kommentar im Deckbauer sagte "elf mit EINER Liste, vier mit zweien", gezaehlt waren es zehn und fuenf — eine einmal gemessene und danach stehen gebliebene Zahl. Sie steht jetzt nicht mehr im Text, sondern wird zur Laufzeit gezaehlt. ZWEI VORPRUEFUNGEN gegen ein leeres Bestehen (die Datei liefert ueberhaupt Listen; das Formatfenster aendert die Zahl der Listen ueberhaupt) sind bewusst als Gleichung bzw. Ungleichheit formuliert, nicht als Band. EINE Ungleichung enthaelt die Datei ("der uebrige Hinweis ist laenger als 50 Zeichen"), und die laeuft auf einem SELBST GESETZTEN Befund, nicht auf Livedaten. Der Zaehler unten sieht die Datei nicht; die Obergrenze bleibt deshalb, wo sie ist.',
    'test-r1-nenner-hochgerechnet.js':   'Befund B1 der Nachpruefung (07.09.2026): der Nenner der Anteilskachel ist HOCHGERECHNET, stand aber wie eine gezaehlte Zahl da. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Sechs der acht Zusicherungen laufen auf einem GESETZTEN Feld, bei dem jede erwartete Zahl von Hand nachrechenbar ist. Die beiden Proben an data/limitless_online_decks.csv behaupten keinen Wochenwert, sondern GLEICHUNGEN gegen die Datei: die Summe der Spalte count, die Summe der Spalte share_numeric und die Spanne, die die Anteilsspalte fuer den Nenner zulaesst (count/((share±0,005)/100), geschnitten ueber die Zeilen, die den gefundenen Nenner zulassen), werden im Test NEU gerechnet und muessen dieselben Zahlen ergeben, die im sichtbaren Text stehen. Welche Decks dort diese Woche stehen und wie gross das Feld ist, ist jeder Zusicherung egal. BERICHTIGT AM 24.09.2026 — ZWEI ANGABEN HIER WAREN FALSCH. (1) „Vier der sechs Zusicherungen“: es sind acht, und die Datei ist seit dem 07.09.2026 zweimal gewachsen. (2) „Der Zaehler unten waechst durch diese Datei nicht“: er sah schon damals VIER Gleichheiten aus dieser Datei — der Zaehler benutzt den WEITEN Blick ueber 91 Dateien, nicht den engen Blick, an dem dieses Register haengt. Die Angabe war also von Anfang an eine Behauptung ueber einen anderen Mechanismus. Heute sieht er EINE Ungleichung und SECHS Gleichheiten; beide Obergrenzen sind am 24.09.2026 um genau diesen gemessenen Zuwachs gestiegen (393 auf 394, 162 auf 164) und tragen ihre Begruendung an der Konstante. ANLASS WAR WOCHENLAUF #148: nach der Formatrotation auf TEF-30C am 16.09.2026 ist das Onlinefeld klein, und die Suche nach der exakten Other-Zahl lief auf zwei Lagen auf, die es mit den grossen Zahlen des alten Fensters nie gab. Erstens faellt „rund 1.700“ mit „= 1.700“ zusammen, sobald Other ein glattes Hundert ist. Zweitens ist die Spanne des Nenners rund n × 0,005 / Anteil breit, schrumpft also MIT dem Feld — unter etwa 600 Listen ist die exakte Zahl ihre eigene Grenze („= 33, je nach Nenner 33 bis 33“). Beide Lagen stehen jetzt als eigene Probe an GESETZTEN Zahlen da, damit sie nicht wieder von der Woche abhaengen; das sind die zwei neuen Gleichheiten. Die neue Ungleichung ist treffer >= 1, eine Vorpruefung gegen ein leeres Bestehen.',
    'test-r1-glaettung-ursache.js':      'Befund B3 der Nachpruefung (07.09.2026): die Fussnote der Kachel "Matchup vs Top 20" schob die ganze Abweichung zur Matchup-Tabelle auf die Glaettung, obwohl bei den Decks mit vielen Partien die fehlende Partiengewichtung der groessere Beitrag ist. STEHT HIER FREIWILLIG (dieselbe lies()-Luecke). Vier der fuenf Zusicherungen laufen auf GESETZTEN Paarungen — einmal dick und ungleich gross (Gewichtung ueberwiegt), einmal duenn und gleich gross (Glaettung ueberwiegt) — und pruefen, dass der Text den jeweils groesseren Beitrag benennt. Die fuenfte liest data/limitless_online_decks_matchups.csv und data/limitless_online_decks.csv, behauptet aber keinen Wochenwert: sie rechnet beide Beitraege fuer die ersten acht Decks der Datei NEU (Glaettung noch einmal aus js/matchup-glaettung.js abgeleitet, K aus dem Modul gelesen) und verlangt nur, dass der Text genau den Beitrag benennt, der wirklich der groessere ist. Dreht sich das Verhaeltnis mit den Daten, dreht sich der Sollwert mit. Ungleichungen gegen feste Zahlen hat die Datei keine.',
    'test-w1-konvention-passt.js': 'Der angezeigte Name gegen die gerechnete Konvention (Arbeitspaket W1, 08.09.2026). STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen werden drei Dateien aus data/ (limitless_online_decks.csv, limitless_online_decks_matchups.csv, limitless_online_decks_comparison.csv), und zwar AUSSCHLIESSLICH, um die Prozentspalte gegen die Bilanz DERSELBEN Zeilen zu rechnen: welche der drei Konventionen aus js/win-rate-konvention.js trifft sie? Das ist eine Gleichung gegen die Datei, kein Wochenwert — welche Quoten dort stehen, ist jeder Zusicherung egal, sie muessen nur zu ihrer eigenen Bilanz passen. Der so GEMESSENE Wert ist der Sollwert fuer die Beschriftung; verschiebt der Wochenlauf die Zahlen, verschiebt sich der Sollwert mit. ZWEI Vorpruefungen gegen ein leeres Bestehen, beide bewusst: notEqual(proben.length, 0) und der MINDESTVORSPRUNG von 25 % der Zeilen, mit dem der Sieger vorn liegen muss. Der Vorsprung ist keine abgelesene Wochenzahl, sondern eine Eigenschaft der Formeln: auf Zeilen ohne Unentschieden fallen mitUnentschieden und ohneUnentschieden zusammen, deshalb erreicht auch die richtige Konvention nie 100 %; gemessen liegt der Vorsprung heute bei ueber 50 Prozentpunkten. Faellt er unter die Schranke, hat die Quelle ihre Konvention gewechselt — und dann MUSS der Test rot werden, denn dann stimmt jede Beschriftung nicht mehr. Die eine Ungleichung, die der Zaehler unten nicht sieht, ist genau diese Schranke; die Obergrenze wird dafuer nicht erhoeht.',
    'test-w2-quellen-konventionen.js':   'Befund W2 (08.09.2026): die beiden Matchup-Quellen rechnen verschieden, und die Oberflaeche beschriftet sie deshalb verschieden. Liest data/limitless_online_decks_matchups.csv, data/labs_tournament_matchups_TEF-PBL.csv und data/limitless_online_decks.csv — und behauptet an keiner Stelle einen Wochenwert: jede Zusicherung ist eine GLEICHUNG zwischen der Prozentspalte einer Zeile und der Bilanz DERSELBEN Zeile, mit den Formeln aus js/win-rate-konvention.js. Welche Decks dort stehen und welche Quoten sie haben, ist der Pruefung egal. Die Gegenproben sind bewusst als UNGLEICHHEIT formuliert ("die anderen beiden Formeln treffen nicht ebenfalls jede Zeile", "die Unentschieden-Anteile der beiden Felder sind nicht dieselben") und nicht als Band: eine Bandgrenze waere eine abgelesene Zahl. Sie stehen gegen ein leeres Bestehen — ohne sie waere die Hauptzusicherung erfuellt, sobald die Datei nur noch Bilanzen ohne Unentschieden enthaelt, und die Spalte waere gar nicht mehr eindeutig zuzuordnen. Ungleichungen gegen eine feste Zahl an Live-Daten enthaelt die Datei keine; die Obergrenze unten bleibt deshalb, wo sie ist.',
    'test-w4-quoten-namen.js':           'Der angezeigte Name gegen die gerechnete Konvention (Arbeitspaket W4, 08.09.2026: Kampftagebuch, Anti-Tech, Podiumskachel, Glossar). STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen werden vier Dateien aus data/ (limitless_online_decks_matchups.csv, limitless_online_decks.csv, labs_tournament_decks.csv, limitless_online_decks_comparison.csv), und zwar AUSSCHLIESSLICH, um die Prozentspalte gegen die Bilanz DERSELBEN Zeilen zu rechnen: welche der drei Konventionen aus js/win-rate-konvention.js trifft sie? Das ist eine Gleichung gegen die Datei, kein Wochenwert — welche Quoten dort stehen, ist jeder Zusicherung egal, sie muessen nur zu ihrer eigenen Bilanz passen. Der so GEMESSENE Wert ist der Sollwert fuer die Beschriftung, die anschliessend an den AUFRUFSTELLEN ausgefuehrt wird; verschiebt der Wochenlauf die Zahlen, verschiebt sich der Sollwert mit. Das Kampftagebuch kommt ohne data/ aus: es rechnet ueber vom Nutzer eingetragene Partien, seine Konvention wird deshalb am Quelltext abgelesen (gespeicherte Nutzerdaten werden nicht angefasst). VIER Ungleichungen, die der Zaehler unten NICHT sieht, alle Vorpruefungen gegen ein leeres Bestehen bzw. Eigenschaften der Formeln: dass jede Datei ueberhaupt mehr als 50 auswertbare Zeilen liefert, und dass die beiden NICHT gewaehlten Konventionen unter 90 % der Zeilen treffen. Die 90 % sind keine abgelesene Wochenzahl, sondern eine Eigenschaft der Formeln — auf Zeilen ohne Unentschieden fallen alle drei zusammen, ein Sieger ohne Abstand waere keine Zuordnung. Faellt der Abstand, hat die Quelle ihre Konvention gewechselt, und dann MUSS der Test rot werden, denn dann stimmt jede Beschriftung nicht mehr. Die Obergrenze unten wird dafuer bewusst nicht erhoeht.',
    'test-pocket-kartenzuordnung.js':    'Befund 10.09.2026: gibt es eine belastbare Zuordnung von Pocket-Kennung auf Kartenname? Gemessenes Ergebnis: es gibt gar keine Pocket-ID (Felder "id", "card_id", "pk_id", "pocket_id" kommen in data/pocket_tierlist.json je 0-mal vor); die Zuordnung laeuft ueber (set, nummer). Gelesen wird ausschliesslich diese eine Datei, und zwar auf INNERE STIMMIGKEIT: dass jeder der 435 Karteneintraege Name, Set und Nummer traegt, dass keiner der 172 verschiedenen (set, nummer) zwei Namen traegt, und dass Set und Nummer ihre Form behalten (20 regulaere Sets A1..B4a plus die Promo-Sets P-A und P-B). KEINE Zahl aus der Datei wird behauptet: wie viele Decks, welche Stufen, welche Karten — alles egal, sie muessen nur zueinander passen. Kein Wochenwert und keine einzige Ungleichung gegen eine feste Zahl; die Obergrenze unten bleibt, wo sie ist. Was die Datei NICHT prueft, steht in ihrem Kopf: ob (set, nummer) auf die Karte zeigt, die Game8 meint — dafuer braeuchte es einen Abruf bei game8.co, und den hat der Sandkasten nicht.',
    'test-shiny-quelle-und-stand.js':    'Befund 10.09.2026: "Kein veroeffentlichtes Shiny" stand in der Champions-Pokedex-Kachel ohne Datum da, obwohl data/pokemon_go_shiny.json in _meta.stand eines fuehrt und in _meta.lesart_kein_treffer selbst "zum Stand der Quelle" schreibt. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil sie den Pfad ueber eine lies()-Hilfe reicht — dieselbe Luecke wie bei test-labs-trennzeichen.js. Gelesen wird data/pokemon_go_shiny.json, aber KEINE ihrer Zahlen wird behauptet: geprueft wird, dass _meta die Herkunft vollstaendig fuehrt (Adresse, Name, Stand als Datum, Lesart der Verneinung, Zahl der uebersprungenen Ankuendigungen) und dass js/app-side-quest-pokedex.js Quelle UND Stand auf den Schirm schreibt. Wie viele Grundformen ein Shiny haben, ist jeder Zusicherung egal. ZWEI Ungleichungen, die der Zaehler unten nicht sieht, beide harmlos: angekuendigt_uebersprungen >= 0 und eine Formpruefung. Die einzige Zusicherung, die ein Datenlauf umwerfen kann, ist die Gleichheit der Quelladresse — und wenn die sich aendert, MUSS der Test rot werden, denn dann gilt der im Kopf der Datei gemessene Umfang nicht mehr. Die Obergrenze unten wird nicht erhoeht.',
    'test-regelbasis-interaktionen.js':  'Befund 10.09.2026: data/card_capability_interactions.json steht seit dem 15.05.2026 auf Version 0.1, und bis dahin hat KEIN Test die Datei je gelesen. STEHT HIER FREIWILLIG: liestLiveDaten() findet die Datei nicht, weil der Pfad ueber eine Konstante laeuft. Gelesen werden data/card_capability_interactions.json und data/card_capability_patterns.json — beide sind HANDGEPFLEGTE Regeldateien, keine Scraper-Ausgabe: sie aendern sich, wenn jemand eine Regel schreibt, nicht mit dem Wochenlauf. Geprueft wird innere Stimmigkeit (jede Marke einer Paarung kommt in der Musterdatei vor, keine doppelten Paarungen, Angreifer- und Verteidigerseite nicht vertauscht, alle Felder da, nur Platzhalter, die js/card-capability-engine.js auch ersetzt, deutsch und englisch mit denselben Platzhaltern). DREI Ungleichungen, die der Zaehler unten nicht sieht: interactions.length > 0, matchup_value als endliche Zahl, und die Zahl der Fliesstext-Stellen, die "fuenf Paarungen" behaupten (>= 5, gemessen waren es 10). Die Zahl der Paarungen selbst wird NICHT festgenagelt — weicht sie vom Grundstand 5 ab, meldet der Test das mit der Liste der Saetze, die dann nachgezogen werden muessen, und jemand setzt den Grundstand bewusst neu. Die Obergrenze unten wird nicht erhoeht.',
    'test-alt-vorschlag-schwelle.js':    'Befund 10.09.2026: ALT_SUGGESTION_MIN_GAP = 50 in js/deck-builder-consistency.js berief sich auf einen "Turin sweep", den es im Repo nicht gibt — die Zahl ist gegriffen. STEHT HIER FREIWILLIG UND IST DER HEIKELSTE EINTRAG DIESES REGISTERS: die Datei liest data/tournament_decklists_per_player.csv, baut damit alle 58 baubaren Archetypen durch und misst, was die Schwelle tut. Das sind LEBENDE Daten, die jeder Scraperlauf verschiebt. Deshalb behauptet keine Zusicherung einen Wert, sondern nur VORHANDENSEIN mit weitem Band: dass das Tor ueberhaupt erreicht wird (gemessen 37 Kandidaten), dass es etwas durchlaesst (10) und dass es etwas unterdrueckt (27). Faellt eine der drei auf null, ist die Schwelle entweder tot oder ein Totalfilter — beides gehoert angeschaut, und dann MUSS der Test rot werden. Die vierte, urspruenglich als ">= 2 Plaetze Abstand zur Kante" geschriebene Zusicherung wurde bewusst auf "> 0" geweitet: ein enges Band waere genau die Bauart, an der der Deploy schon zweimal haengengeblieben ist. Verlangt wird jetzt nur noch, dass die 50 nicht EXAKT auf einem gemessenen Abstand sitzt (Sicherheitsabstand am 10.09.2026: 8 nach unten, 14 nach oben). Die Richtungspruefungen des Tors laufen datenfrei an einem von Hand gerechneten Listensatz und lesen die Schwelle aus dem Modul, statt sie abzuschreiben. SIEBEN Ungleichungen, die der Zaehler unten nicht sieht, alle von dieser Bauart; die Obergrenze wird dafuer nicht erhoeht.',
    'test-testdaten-wachhund.js':        'dieser Wachhund selbst',

// ── NACHGETRAGEN AM 22.09.2026: die 37 Dateien des weiten Blicks ────
//
// Bis heute sah der Wachhund 43 von 91 Dateien, die wirklich aus data/
// lesen (siehe die Notiz am weiten Blick oben). Diese 37 waren nie im
// Register, weil sie ueber einen Helfer lesen. Jede ist gelesen, jede
// Zusicherung gegen Live-Daten eingeordnet und am echten Bestand
// nachgemessen worden; 25 Zusicherungen falscher Form sind dabei am
// selben Tag umgeformt worden und in den Eintraegen benannt.
//
// Drei der 37 lesen ueberhaupt keine Datei aus data/ — der weite Blick
// sieht bei ihnen eine Zeichenkette, die an eine Attrappe oder in einen
// Sandkasten gereicht wird. Sie stehen mit dieser Begruendung hier,
// statt den Blick wieder enger zu machen.
    'test-abnahme-2026-08-30.js': 'Abnahme vom 30.08.2026, die fuenf Befundgruppen A bis E — fast durchweg Quelltext. Gelesen wird genau EINE Datei aus data/, all_cards_database.csv, und davon nur die KOPFZEILE: Befund D haengt daran, dass es die Spalte pokedex_number nicht gibt (gemessen 22.09.2026: 14 Spalten, keine davon). Das ist Schema, kein Wochenwert — keine Datenzeile wird gelesen, keine Zahl abgelesen, und Zuwachs kann die Zusicherung nicht brechen. Sie ist negativ formuliert: taucht die Spalte doch auf, wird der Test rot, und die Datei will das ausdruecklich so. Ausloesen kann das nur eine Aenderung am Scraper, nicht der taegliche Lauf.',
    'test-abnahme-agentenrunde-30-08.js': 'Sechs Pruefrunden vom 30.08.2026 (getPredictedField, Kontraste, Uebersetzungen), ganz ueberwiegend Quelltext. Aus data/ kommt data_stand.json, und zwar als SCHEMA: jede nachgetragene Quelle hat einen Stand, und der Frischechip zeigt auf die Datei, die der Reiter wirklich laedt. Die Probe auf die leer-Liste stand bis zum 22.09.2026 als vier abgeschriebene City-League-Dateinamen da, die leer SEIN mussten — die vier Scraper laufen aber weiter im Wochenlauf im Anhaengemodus, und eine einzige Datenzeile haette den Deploy an einer guten Nachricht angehalten. Jetzt wird die Deckungsgleichheit geprueft: was der Bauer als leer meldet, ist leer.',
    'test-aufraeumbrille-02-09.js': 'Die Aufraeumbrille auf den uebrigen zwoelf Reitern (02.09.2026, 34 Befunde zweier Pruefagenten) — fast alles CSS und Quelltext. Gelesen wird EINE Datei aus data/, city_league_analysis_past.csv, und keine Zahl daraus steht in einer Zusicherung: die Marke wird fuer JEDE Zeile durch das echte _markeZahl() gerechnet und gegen eine EIGENSCHAFT geprueft — wo jede enthaltende Liste dieselbe Kopienzahl hat, muss die Marke genau diese zeigen. Die einzige Ungleichung (mehr als 50 Zeilen, gemessen 315) ist eine Vorpruefung, damit der Vergleich nicht ins Leere laeuft.',
    'test-builder-freie-auswahl.js': 'Die freie Auswahl im Team-Builder (gemeldet 25.08.2026, "ich tippe Ra fuer Raichu"). Liest champions_usage.json. Drei der vier Zusicherungen sind nach dem Vorfall vom 26.08.2026 auf ANTEILE und Untergrenzen umgestellt (gemessen 22.09.2026: 264 Slugs, 96,6 % unerreichbar gegen geforderte 80, 255 gegen geforderte 50). Die vierte stand bis zum 22.09.2026 als deepEqual auf "jede Partner-Liste hat exakt acht Eintraege" — die Acht ist aber kein Versprechen der Quelle, sondern unser eigener Deckel KEEP.teammate in scripts/scrape_champions_usage.py, und held_item fuehrt mit demselben Deckel heute schon eine Liste mit sechs. Jetzt steht dort die Obergrenze, die der Deckel wirklich zusagt.',
    'test-champions-names.js': 'Die Bruecke zwischen den drei Champions-Namensraeumen. Liest pokemon_battle_data.json und champions_usage.json; die Wochenzusicherung ist hier schon einmal ausgezogen: sie hing an "353", liess am 26.08.2026 die Auslieferung stehen und lebt seither in scripts/data_guardian.py. Was blieb, ist die REGEL an festen Beispielen — Mega als Suffix, Regionalpraefix nach hinten, Zierform faellt zurueck, Kampfform nicht, ohne Treffer null statt geraten. Die vier festen Basiswerte sind Regelwissen aus pokemon_battle_data.json, die kein Ablauf schreibt. Die uebrigen Baender sind weit (1480 Spezies gegen geforderte 500).',
    'test-champions-raster.js': 'Das Pokedex-Raster, der Shiny-Stern und die Herkunftsangaben (bestellt 09.09.2026). Liest vier Dateien aus data/ — pokemon_go_liste.json, champions_editionen.json, champions_pokedex.json, champions_replica_teams.json —, zwei davon schreibt der taegliche Lauf neu. Die _meta-Pruefungen und drei Existenzproben halten; zwei Zusicherungen sind am 22.09.2026 umgeformt worden, beide hatten null Toleranz: die Liste der Teamnamen ohne Pokedex-Eintrag war zwischen dem 11. und 15.09.2026 SECHSMAL von Hand nachgezogen worden und traegt jetzt einen Anteil, und die Forderung "jede Art hat eine Editionsliste" war strenger als ihr eigener Erzeuger, der bis zu zehn Prozent zulaesst — bei 23 Stunden Abstand zwischen dem Pokedex-Lauf um 05:12 und dem Editionslauf um 04:05.',
    'test-deckgroesse-kachel.js': '"Karten im Deck (verschiedene / Oe-Liste)" — die Kachel summierte max_count und beschriftete es als Gesamt. Fuenf der sechs Rechenproben laufen auf GESETZTEN Karten; die sechste rechnet gegen data/current_meta_card_data.csv, behauptet aber keinen Wochenwert, sondern eine SPIELREGEL: jeder Archetyp muss eine legale Deckgroesse ergeben (60 plus/minus 1, groesste gemessene Abweichung am 22.09.2026: 0,05). Die Gegenprobe gegen die alte max_count-Rechnung ist ein Anteil, kein Sollwert, und die Vorpruefungen sind weit (3307 Zeilen gegen geforderte 500).',
    'test-deckgroesse-verteilung.js': 'Die Kopienverteilung nach groessten Resten ("Deckliste kopieren" ergab keine 60 Karten, 30.08.2026). Dreizehn Rechenproben laufen auf GESETZTEN Karten; am echten Bestand data/current_meta_card_data.csv stehen nur EIGENSCHAFTEN — jede Gruppe ergibt 60, keine Nicht-Energie mehr als vier Kopien (gemessen 94 Paare aus Archetyp und Meta, null Verstoesse). Der Gruppierungsschluessel traegt seit dem 01.09.2026 das Meta mit, weil ein Praesenzturnier sonst 119,94 statt 60,00 ergibt. Die knappste Stelle ist die Gegenprobe "einzeln Runden trifft die 60 nur selten": 35 von 94 gegen die Haelfte, gut ein Viertel Luft — ein Anteil, kein Sollwert, aber die engste Zusicherung der Datei.',
    'test-gegenstand-ohne-namen.js': 'Ein Pseudoname ist keine Angabe (13.09.2026: die Quelle liefert "Unknown Item 542"). Erkennung und Gegenprobe laufen auf GESETZTEN Zeichenketten, die fuenf Anzeigeflaechen auf dem Quelltext. Der einzige Datenzugriff geht auf champions_available_items.json und ist eine Breitenprobe der IDENTITAET: jeder Name der Referenzliste muss die Regel unveraendert verlassen — eine Gleichung gegen die Datei, keine Wochenzahl. Die einzige Ungleichung ist eine weite Vorpruefung (gemessen 200 Eintraege gegen geforderte 50).',
    'test-item-nutzung.js': 'Item-Nenner, effektiv-gegen-Typ und Shiny-in-GO (09.09.2026). Liest champions_resources.json, champions_usage.json, champions_pokedex.json und pokemon_go_shiny.json: geprueft werden Schema der _meta-Felder, Existenz (die Quelle schreibt damage_class weiterhin gross), eine weite Untergrenze von ueber 100 Statusattacken (gemessen 179) und die Eigenschaft, dass JEDER der 264 Nutzungs-Slugs einen eindeutigen Anzeigenamen ergibt. Die Obergrenze auf genutzte Attacken ohne Typeintrag stand bis zum 22.09.2026 als feste 20 da und ist jetzt ein Anteil — ein Set, das Attacken zuerst in die Nutzungsdatei bekommt, laesst diese Menge mit dem Kader wachsen.',
    'test-major-leerstand.js': 'Warum die Major-Liste leer ist (21.08.2026). Liest format_window.json und tournament_cards_manifest.json und nimmt daraus KEINE Zahl: die drei Helfer laufen gegen gestellte Daten, und an den echten Dateien steht nur eine GLEICHUNG der beiden gegeneinander — gibt es keinen Chunk fuers laufende Format, darf auch kein Turnier ein max_date nach in_person_legal_date tragen. Sie schaltet sich selbst ab, sobald der erste Chunk des Formats da ist. Stand 22.09.2026: current_set 30C, kein passender Chunk, juengstes max_date 2026-09-19 gegen eine Grenze am 2026-09-25.',
    'test-mega-nutzungsdaten.js': 'Mega-Formen erben die Zahlen der Grundform, und die fehlenden Mega-Faehigkeiten werden benannt (29.08. bis 13.09.2026). Liest fuenf Dateien aus data/ und prueft ueberwiegend Gleichungen der Dateien gegeneinander (gemeldete Luecke gegen gerechnete, Ausnahmeliste gegen gemessenen Stand in beide Richtungen, jeder geerbte Anteil gegen den Stein der Grundform) sowie die Richtung neu-ist-erlaubt-verloren-nicht. Die beiden Obergrenzen auf "neu ohne Nutzungsdaten" und "ohne Beleg" standen bis zum 22.09.2026 als feste 5 da und sind jetzt Anteile am Mega-Bestand — genau diese Bauart hat am 12. und 13.09.2026 zusammen einen Vormittag und vier Stunden Deploy gekostet, und ein Set hebt den Bestand im Dutzend (75 auf 78 mit 30C).',
    'test-meta-call-family-override.js': 'Die Familienzuordnung des Meta Calls. Liest data/deck_families.json — eine von Hand gepflegte Ueberschreibungsliste, keine Wochenzahlen; kein Skript schreibt sie. Geprueft werden Schema, dass kein Deckname unter zwei Familien steht, und dass die vier begruendeten Faelle drin sind; die Lookup-Helfer laufen danach gegen dieselbe Datei mit gestellten Attrappen. Keine Ungleichung an Live-Daten.',
    'test-meta-call-format.js': 'Lag-Fenster, Blendschluessel, Junk-Win-Rate und day2-Auffuellung des Meta Calls (20.08.2026). Fast alles laeuft an gestellten Werten: die Bloecke werden aus js/app-meta-call.js geschnitten und mit einer festgestellten Uhr ausgefuehrt. Aus data/ kommen nur zwei Gegenproben, beide ohne Wochenwert: labs_tournament_matchups.csv wird auf STRUKTUR geprueft (die Spalte meta ist da, nicht leer, jeder Wert ein Paarschluessel mit Bindestrich — 13 Werte ueber 51.611 Zeilen), und limitless_online_decks.csv liefert die echte Junk-WR gegen ein ausdruecklich weites Band von 50 bis 60 mit Begruendung im Kommentar; gemessen am 22.09.2026: 54,2.',
    'test-meta-stats-alter.js': 'Eine Herkunftsangabe darf nicht aelter sein als die Zahl, die sie belegt (20.08.2026). Liest aus data/ nur limitless_meta_stats.json, und zwar bewusst ohne feste Werte — der Vorgaenger pinnte 199 / 14.026 / 31.411, und die Datei wird dienstags und freitags neu geschrieben. Geprueft werden Schema und zwei ORDNUNGEN der Erhebung: mehr Spieler als Turniere, mehr Partien als Spieler. Stand 22.09.2026: 758 / 54.473 / 122.248.',
    'test-metacall-befunde-fix6-07-09.js': 'Die fuenf Befunde der Abnahme vom 07.09.2026 plus drei ueberlebende Mutationen. STEHT HIER, obwohl sie keinen einzigen Datenwert liest: gelesen wird js/app-meta-call.js, aus data/ wird nur die EXISTENZ der 20 Pfade geprueft, die im Quelltext stehen (fs.existsSync, am 22.09.2026 alle vorhanden) — das war Befund B1, ein Dateiname im Code, der ins Leere zeigte. Der weite Blick sieht die Datei nur wegen einer Zeichenkette, die an eine Attrappe gereicht wird.',
    'test-mindeststichprobe.js': 'Keine Mindeststichprobe, und Rangplatz wird als Bewertung gelesen (20.08.2026). Liest city_league_archetypes_comparison_M3.csv und labs_tournament_decks.csv. Am 22.09.2026 sind FUENF Zusicherungen umgeformt worden: die festen Zaehlerstaende 304 und 128 wurden zu einem Umfangsriegel und einem Anteil (gemessen 304 Zeilen, 42,1 % Ein-Listen-Archetypen); die Behauptung "das beste Tier-2-Deck steht besser als das beste Tier-1-Deck" hing an 0,33 Plaetzen und wird jetzt nur noch gemeldet, waehrend die Spreizung der gelisteten 20 die Aussage allein traegt (1,72 gegen erlaubte 4); und "die drei nach Platzierung besten Rogue-Decks bestehen aus genau einer Liste" ist ein Anteil ueber die Spitze geworden — der vierte stand schon auf zwei.',
    'test-namensbruecke.js': 'Zwei Namen, ein Deck (20.08.2026). Liest archetype_aliases.json, limitless_online_decks.csv, online_tournament_top8_decks.csv und city_league_archetypes_comparison_M3.csv. Am 22.09.2026 sind drei Zusicherungen umgeformt worden: die festen Zahlen 304 / 266 / 38 wurden zu Umfangsriegel und Anteil (gemessen 12,5 % gegen eine Grenze von 25); die Forderung "jedes Brueckenziel steht im Ladder-Export" liess ausser Acht, dass auch der Ladder-Export ein rollendes Fenster ist (Raging Bolt sass auf Rang 132 von 139 mit zwei Partien) und verlangt jetzt Ziel ODER bezifferten Beleg; und die Gleichheit auf unausgewiesene Turniernamen ist ein Anteil geworden, weil die Aliasdatei gepflegt ist, der Turnier-Export aber nicht.',
    'test-online-feldgroesse.js': 'Die Feldgroesse der Online-Zeilen im Deckbauer (10.09.2026). Liest tournament_decklists_per_player.csv und online_api_tournaments.csv, behauptet aber keinen Wochenwert: geprueft werden die Spaltennamen beider Dateien und ein ANTEIL gegen einen datierten Grundstand — wie viele Online-Listen ohne Feldgroesse dastehen. Die Obergrenze 0,40 liegt rund 17 Prozentpunkte ueber dem Grundstand vom 10.09.2026 (23,1 %) und ist am 22.09.2026 mit 0 von 4.462 Listen voll ausgeschoepft; die Luecke hat sich mit der Spalte spielerzahl von selbst geschlossen.',
    'test-online-fenster-verdrahtung.js': 'Das 14-Tage-Fenster im Meta Call (05.09.2026). Der grosse Teil prueft datenfrei js/app-meta-call.js, js/i18n.js und den Wochenlauf. Aus data/ kommen limitless_online_fenster.csv und limitless_online_decks_comparison.csv. Diese Datei hat den Deploy laut ihrem eigenen Kommentar dreimal angehalten, weil hier ZAHLEN standen; am 22.09.2026 sind auch die NAMEN gefallen: die fuenf im Kommentar genannten Decks muessen nicht mehr alle da sein (beide Dateien sind rollende Fenster), und das Beispiel fuer "im Fenster deutlich unter dem kumulativen Anteil" sucht sich der Test jetzt selbst, statt Toucannon zu nennen.',
    'test-online-major-merge.js': 'Online + Major additiv zusammenfuehren (01.09.2026, "Deckliste kopieren ergab keine 60 Karten"). Liest current_meta_card_data.csv, format_window.json, die Turnierdatei des laufenden oder zuletzt abgeschlossenen Formats und all_cards_database.csv. Die tragende Zusicherung ist eine EIGENSCHAFT DER RECHNUNG: je Archetyp muessen nach dem Merge 60 Karten herauskommen. Die Probe auf stripExSuffix verlangte bis zum 22.09.2026, dass eine von Hand gepflegte Liste von 33 Kuerzeln JEDES der 154 Kuerzel im Bestand abschneidet — 30C stand seit dem 16.09. im Bestand und nicht in der Liste, die Sperre war scharf und nur noch nicht ausgeloest. Jetzt wird geprueft, dass das LAUFENDE Set und das laufende japanische Set abgeschnitten werden; alles Weitere wird gemeldet.',
    'test-pm-matchup-formatweit.js': 'F14 — die Matchup-Matrix im Reiter Vergangenes Meta bleibt formatweit (21.08.2026). Liest labs_tournament_matchups_TEF-CRI.csv fuer den Datenbefund, dass Labs keine Zahlen je Einzelturnier fuehrt; alles andere prueft js/app-past-meta.js, i18n und CSS an gesetzten Zeilen. Bis zum 22.09.2026 stand dort "alle Zeilen nennen GENAU EINE Turnierliste" — die Form, die das ausschliesst, gibt es im Bestand bereits: der Nachbarchunk TEF-POR fuehrt zwei Listen, weil er waehrend des Formats mehrfach gewachsen ist. Geprueft wird jetzt die Eigenschaft selbst: fast jede Zeile nennt MEHRERE Turniere.',
    'test-pokedex-grundformen-und-filter.js': 'Ohne Grundform keine Mega-Form, und der Shiny-Filter mit drei Zustaenden (15.09.2026). Liest champions_pokedex.json, champions_roster_extra.json, champions_usage.json und pokemon_battle_data.json; der ganze Filterteil prueft datenfrei Quelltext und CSS. Die tragenden Zusicherungen sind GLEICHUNGEN ZWISCHEN DEN DATEIEN und halten jeden Zuwachs aus (keine verwaiste Mega-Form bei 343 Eintraegen, jede Ableitung mit eigener Nutzungszeile, die _meta-Bilanz gegen ihre eigene Liste). Am 22.09.2026 sind drei festgenagelte Namen und Kanten gefallen — Dragalge/Tandrak steht jetzt unter Vorbehalt, "mindestens EINE Geschlechtsform" hatte bei gemessenen genau einer keine Luft nach unten, und Oinkologne-F ist durch die Regel ersetzt, die es ausschloss: keine Geschlechtsform ohne eigene Nutzungszeile.',
    'test-preis-vertrauen.js': 'Vertrauenszeichen und Produktzuordnung der Preise (20.08.2026, umgeformt am 22.09.2026). Liest cardmarket_id_mapping.csv, price_data.csv und den veroeffentlichten Vertrag data/_consumers.md. Statt "50 bis 200 kollidierende Produktnummern" steht eine UNTERGRENZE (heute 94) fuer die Richtung "loesen sie sich auf, gehoert die Sonderbehandlung geprueft" und eine Obergrenze als ANTEIL (unter 20 % aller Produktnummern, heute 0,54 %). Dazu eine Regel ohne Zahl — keine Nummer darf auf beiden kollidierenden Zeilen live-verified tragen, heute 0 — und eine weite Untergrenze auf Preiszeilen ohne Zuordnung (heute 3.034). Die Datei waechst mit dem Kartenbestand, keine der vier Zusicherungen waechst mit.',
    'test-rechenfehler.js': 'Die echten Rechenfehler der Nebenrechner (20.08.2026, umgeformt am 22.09.2026). Aus data/ kommt NUR champions_resources.json; K.O.-Chance, Binomialverteilung, Mulligan-Regel und Eingabeklemme laufen auf gesetzten Werten gegen unabhaengige Referenzrechnungen. Die Ausnahmeliste ["Matcha Gotcha"] ist durch eine Regel an ihrer Bedingung ersetzt (Abweichung vom Zielfeld nur, wenn die deutsche Beschreibung sie ausspricht), und aus dem zweimal von Hand hochgesetzten == 34 ist die Selbstpruefung _meta.counts.spread gegen die gezaehlten Eintraege geworden. Am selben Tag sind ausserdem die Untergrenze von der Kante genommen und die namentlich gepinnten Attacken unter Vorbehalt gestellt worden — Overdrive und Make It Rain werden aus champions_usage.json nachgetragen und haengen damit am woechentlich rotierenden Kader, genau dem, der am 13.09.2026 die Kette angehalten hat.',
    'test-schluessel-und-schreibweg.js': 'Schluessel treffen nicht, und der Schreibweg prueft nicht, was er schreibt (20.08.2026). Liest tournament_cards_data_overview.csv nur auf die Kopfzeile, tournament_cards_data_cards_TEF-CRI.csv auf Parsebarkeit, tournament_decklists_per_player.csv je Herkunft — Papierzeilen MUESSEN eine Labs-Kennung tragen, Online-Zeilen duerfen keine haben, heute 13.499 zu 114.499 und beide Richtungen sauber — und labs_tournament_id_overrides.json als gepflegte Namensliste. Bis zum 22.09.2026 war EIN Turnier namentlich festgenagelt (NAIC 2026 unter Limitless 518); die Datei ist ein rollendes Fenster, und jetzt wird jede hinterlegte Uebersetzung geprueft, aber nur fuer die Turniere, die heute wirklich darin stehen.',
    'test-schlussabnahme-30-08.js': 'Schlussabnahme vom 30.08.2026 (sechs Befunde, fuenf davon echt). Aus data/ wird eine einzige Zeile gelesen: die KOPFZEILE von limitless_online_decks.csv, damit die Zusicherungen zur Dezimaltrennung nicht in der Luft haengen. Kein Wochenwert, keine Ungleichung gegen die Daten; alles Uebrige prueft Quelltext, i18n-Tabelle, index.html, CSS und selbst gerechnete Kontrastwerte gegen die WCAG-Formel.',
    'test-scraper-selbstkontrolle.js': 'Selbstkontrolle des Champions-Scrapers (Gruppe 3 der Pruefrunde vom 20.08.2026). Sie OEFFNET data/champions_usage.json und parst sie, aber keine einzige Zusicherung fasst den Inhalt an — der pruefende Block ist am 25.08.2026 nach scripts/scrape_champions_usage.py und scripts/data_guardian.py gewandert, nachdem er drei Deploys angehalten hatte. Was bleibt, sind Textzusicherungen an scripts/ und js/: dass die Pruefung definiert UND verdrahtet ist, dass sie keinen Ersatzwert raet, und dass die Spread-Zahlen 66/32 an allen vier Stellen dieselben sind.',
    'test-set-editor-infos.js': 'Die Infozeilen des Set-Editors (15.09.2026, drei Bildschirmfotos des Betreibers). Liest champions_usage.json und champions_resources.json und behauptet an keiner Stelle einen Wochenwert: geprueft werden eine GLEICHUNG DATEI GEGEN TABELLE (jede Wesensbezeichnung der Nutzungsdaten muss in WERT_SCHLUESSEL stehen, sonst stuende sie unuebersetzt im Editor), die VOLLSTAENDIGKEIT der Felder, die die Zeile anzeigt (heute 0 Luecken bei 513 Attacken), und ein ANTEIL statt einer Zahl (unter 15 % der Pokemon ohne Verteilung im Doppelkampf-Block; heute 0 von 264). Die zwei Ungleichungen sind weite Untergrenzen.',
    'test-shiny-eine-art-ein-stern.js': 'Eine Art, ein Stern (15.09.2026). Liest champions_pokedex.json, um das Schluesselverhalten an ECHTEN Eintraegen auszufuehren statt an erfundenen; geprueft werden Regeln (Mega faellt mit der Grundform zusammen, Regional- und Geschlechtsform nicht) und eine Gleichung gegen die Datei selbst. Die Zahl der Paldea-Tauros war bis zum 22.09.2026 als strictEqual gegen 3 festgenagelt und ist jetzt eine Vorpruefung plus die eigentliche Aussage: so viele verschiedene Schluessel wie Formen.',
    'test-sprachbefunde-2026-08-30.js': 'Dreizehn Sprachbefunde vom 30.08.2026. Liest zwei Dateien aus data/, beide NUR auf Struktur: dass champions_replica_teams.json in _meta ueberhaupt noch einen Untertitel fuehrt (der deutsche Rueckfall liegt seit dem 30.08.2026 bewusst im Code, weil der Scraper ein subtitle_de am selben Tag wortlos wieder entfernt hatte), und dass die Kopfzeile von all_cards_database.csv weiter name_en und set fuehrt. Keine Zahl, keine Ungleichung, kein Wochenwert.',
    'test-tech-beleg-kennzeichnung.js': 'FEHLALARM des weiten Blicks: die Datei liest KEINE Datei aus data/. Alle data/-Zeichenketten sind entweder Quelltext, der in einen vm- oder Function-Sandkasten gereicht wird, oder Pfade, auf die eine Attrappe von fetch() antwortet — mit KARTEN_CSV, MATCHUP_CSV und REGELN, die der Test selbst setzt. Geoeffnet werden nur js/app-anti-tech.js, js/app-deck-builder.js und js/tech-ideen.js; auch die 358 Partien stammen aus dem gesetzten Matchup-CSV.',
    'test-tech-beleg-lab-und-interaktionen.js': 'FEHLALARM des weiten Blicks, dieselbe Bauart: liest nur js/app-tech-lab.js, js/app-current-meta-analysis.js und js/i18n.js. Die Zeichenkette data/card_capability_interactions.json ist Quelltext, der ins Sandkasten-Modul gereicht wird, und einmal der erwartete Aufrufparameter einer Attrappe; die Datei wird nie geoeffnet.',
    'test-ui-tippziele-kontrast.js': 'Drei UI-Befunde vom 30.08.2026 (Kontrast, Tippziele, Proxy-Kopf). Aus data/ kommt genau eine Datei, all_cards_merged.csv, und zwar fuer eine reine EXISTENZPRUEFUNG: der Druck, den der Beispieltext im Proxy-Drucker nennt (heute Buddy-Buddy Poffin TEF 144, einer von sieben Drucken dieser Karte), muss es in den Kartendaten wirklich geben. Keine Zahl und keine Ungleichung: die Kartendatenbank waechst nur, ein einmal gedruckter Druck verschwindet nicht.',
    'test-vergleich-leerzustand.js': 'FEHLALARM des weiten Blicks: data/QUELLE-147.csv ist ein KENNWERT, kein Pfad — er wird in das Aufrufobjekt gereicht, um zu zeigen, dass die Quelldatei durchgereicht und nicht an der Aufrufstelle gebildet wird. Geoeffnet werden js/app-city-league.js und css/ui-components.css. Alle Zahlen des Leerzustands sind gesetzte Testvorgaben oder Kennwerte, keine gemessenen Wochenwerte.',
    'test-win-rate-konvention.js': 'Eine Bilanz, vier Win Rates (20.08.2026). Liest labs_tournament_decks.csv, limitless_online_decks_matchups.csv und limitless_online_decks.csv und prueft an jeder eine GLEICHUNG: die Prozentspalte der Datei gegen die Formel, die js/win-rate-konvention.js fuer diese Quelle auffuehrt. Die Untergrenzen sind Vorpruefungen gegen ein leeres Bestehen und haben Luft. Die Ausnahmeliste Wailord ist am 22.09.2026 aus der Gleichheit genommen worden und traegt jetzt einen ANTEIL (hoechstens 3 %, gemessen 0,7 %); die Gegenrichtung — ein eingetragener Ausreisser, der sich wieder an die Konvention haelt — meldet seither, statt anzuhalten, denn eine veraltete Notiz deckt hier nichts zu.',
    'test-zweisprachige-namen-und-schliessen.js': 'Zweisprachige Namen und das weggerollte X (15.09.2026). Liest champions_usage.json, champions_names_de.json, champions_ability_overrides.json und champions_namen_entschieden.json und behauptet keinen Wochenwert, sondern eine VOLLSTAENDIGKEIT ZWISCHEN DATEIEN: jeder benutzte Faehigkeits- und Attackenname hat einen deutschen (heute 202 und 423, null Luecken). Diese Zusicherung faellt, wenn die Quelle einen neuen Namen bringt — und das soll sie, denn dann steht er auf der deutschen Seite englisch da. Die Obergrenze auf Eintraege ohne Quelle stand bis zum 22.09.2026 als feste 3 da, mit einer Begruendung, die die Datei nicht mehr traf (es ist EIN Eintrag, und ein Notizfeld gibt es dort gar nicht); sie ist jetzt ein Anteil.',
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
/* 22.09.2026: 140 -> 141. Die neuen stehen in
   test-tag2-grundgesamtheit.js und ersetzen dort ZWEI Gleichungen
   („labs day2_players summiert genau die Zahl der Listen").

   Warum das hier ausdruecklich in die andere Richtung geht als der
   Text darueber: die Gleichung WAR der Wochenwert. Sie hielt fuer
   0069, 0070 und 0071 aufs Spiel genau und fiel am 22.09.2026 fuer das
   Regional Baltimore um — 558 gegen 559. Nachgemessen ist das kein
   Datenverlust: data/player_continuity.csv fuehrt 559 Spieler mit
   day2=1, die Plaetze laufen lueckenlos 1..559, und die Differenz
   steckt in der Archetypenzuordnung (labs fuehrt einen Sammeleintrag
   „Other", und die beiden Dateien schneiden die Archetypen
   verschieden).

   An ihre Stelle treten zwei Aussagen, die auch in vier Wochen noch
   stimmen: die Archetypensumme darf die Zahl der Listen NICHT
   uebersteigen (das waeren Geisterspieler), und sie darf hoechstens
   ein Prozent darunter liegen. Beides ist eine Eigenschaft der
   Zuordnung, kein abgelesener Stand. */
/* 22.09.2026: von 141 auf 379 — und das ist KEINE Lockerung.

   Bis heute zaehlte diese Sperrklinke nur die 43 Dateien, die der enge
   Blick sah. Seit heute sind es alle 91, die wirklich aus data/ lesen
   (siehe die Notiz am weiten Blick oben). Dieselbe Regel, dreifacher
   Hof. Die 141 waren nie die Zahl der Ungleichungen im Projekt — sie
   waren die Zahl in der Haelfte, die man sah.

   Nach unten darf sie jederzeit, nach oben nur mit Begruendung.

   22.09.2026, nachmittags: von 379 auf 388, und die Begruendung ist
   genau der Vorgang, fuer den die Sperrklinke eine verlangt. An diesem
   Nachmittag sind 25 Zusicherungen falscher Form umgeformt worden, und
   eine umgeformte Gleichheit wird in aller Regel eine Ungleichung:
   "genau 34" wird "mindestens 25", "genau drei Namen" wird "hoechstens
   ein Anteil". Neun davon zaehlen hier neu mit.

   Nachtrag desselben Tages, nach der Abnahme: von 388 auf 390. Ein
   Pruefagent hat sieben Auflagen erhoben, und zwei der Reparaturen
   dafuer sind wieder Ungleichungen — eine Laengenprobe auf die
   Kuerzelliste und eine Obergrenze auf verwaiste Teamnamen. Auch das
   ist die Richtung, in die die Sperrklinke zeigen soll.

   Der Zaehler der GLEICHHEITEN steht dabei unveraendert bei 162 —
   nachgemessen, nicht geschaetzt. Das ueberrascht nur auf den ersten
   Blick: die meisten umgeformten Gleichheiten standen als
   `deepEqual(x, [])` da, und eine leere Liste traegt keine zweistellige
   Zahl, die der Gleichheitszaehler sehen koennte. Die Sperrklinke misst
   Bauart, nicht Wirkung — dass die Gleichheit weg ist, steht in den
   Zusicherungen selbst und in den Eintraegen des Registers.

   23.09.2026: von 390 auf 392. Zwei Vorpruefungen GEGEN EIN LEERES
   BESTEHEN in test-abnahme-2026-09-05.js. Die dortige Zusicherung
   „wo der Nutzungsstand den Schluessel fuehrt, wird er auch genommen"
   hat an diesem Morgen den Deploy angehalten, weil sie die
   SCHREIBWEISE der Quelle auswendig kannte (`alolan-ninetales`) und
   championsbattledata sie um 05:10 UTC gedreht hat
   (`ninetales-alola`). Die Erwartung kommt jetzt aus der Datei selbst
   — und eine Erwartung aus der Datei braucht zwei Untergrenzen, sonst
   prueft sie eines Tages eine leere Menge und meldet gruen:
   „mindestens 15 Schluessel mit Bindestrich" und „mindestens 50
   mehrteilige Kadernamen". Beide sind `>=`, beide ueberleben Zuwachs,
   keine nennt einen Wochenwert. */
/* 23.09.2026, zweiter Nachtrag: von 392 auf 393. Am 16.09.2026 ist das
   Standardformat auf 30C rotiert; der Online-Scraper haengt
   `?set=<current_set>` an jede Anfrage und zaehlt seither von vorn.
   Dreizehn Zusicherungen in acht Dateien nagelten Bestandsgroessen des
   alten Fensters fest („ein Verlust ist hier immer ein Fehler",
   „mindestens 1.287 Zeilen", „es gibt eine Zeile mit share=0") und
   hielten den Wochenlauf #147 an, ohne dass etwas kaputt war.

   Die Umformung tauscht diese Sollwerte gegen ANTEILE und gegen den
   Vergleich mit dem laufenden Fenster (tests/formatfenster.js). Dabei
   fallen Gleichheiten und Obergrenzen weg und Ungleichungen kommen
   hinzu — netto eine. Das ist die Richtung, in die die Sperrklinke
   zeigen soll.

   393 auf 394 am 24.09.2026, Anlass Wochenlauf #148: die eine neue
   Ungleichung ist `treffer >= 1` in test-r1-nenner-hochgerechnet.js —
   die Vorpruefung, dass die geprueite Zahl ueberhaupt im Hinweis steht.
   Ohne sie bestuende die Zusicherung darunter leer, sobald der Hinweis
   die Zahl gar nicht mehr nennt. Sie vergleicht mit EINS, nicht mit
   einem Wochenwert, und stimmt deshalb auch in vier Wochen noch.

   394 auf 396 am 25.09.2026, Anlass: der Betreiber fand im Druckschalter
   von „Meine Decks" keine einzige SVE-Metall-Energie. Die beiden neuen
   Ungleichungen stehen in test-druckauswahl-und-deck-offen.js und
   vergleichen mit EINS, nicht mit einem Wochenwert: dass die
   Kartendatenbank ueberhaupt eine SVE-Metall-Energie fuehrt (sonst
   pruefte die Schleife darunter ueber eine leere Liste) und dass das
   Kommentar-Ausschneiden nicht zu viel entfernt hat. Verschwaende die
   Datenbank die SVE-Energien eines Tages, ist das ein Datenbefund und
   soll rot sein. */
/* 393 + 1 + 2 wie gehabt, + 10 fuer test-post-kaskade.js (26.09.2026,
 * die Post-Kaskade — siehe ihren Eintrag im REGISTER). Die letzten drei
 * kamen aus der Live-Abnahme desselben Tages dazu: der Kicker fasst
 * gemessene 40 Zeichen, und im Bild stand "... LAST 7 DAYS - O.".
 * Die letzten drei aus der Abnahme durch den Pruefagenten: der Nenner
 * einer Platzierung war die Zahl der eingereichten Listen statt der
 * Teilnehmerzahl (Baltimore 559 statt 3.119), die Fusszeile lief bei
 * vierstelligen Feldern ueber, und der Spaltenkopf verschwieg, wie
 * viele Karten nicht im Bild stehen. */
/* +2 am 26.09.2026 fuer test-post-quellen.js: der Deckel der Ranglisten
 * ging von acht auf zehn („Top 10 ist irgendwie runder als Top 8"), und
 * die zwei neuen Ungleichungen sind LESBARKEITSSCHWELLEN der
 * Zeichenflaeche, keine Wochenwerte — der kleinste gezeichnete Deckname
 * muss 38 px messen, die Tafelzeile mindestens 58 px hoch sein. Beide
 * koennen durch keinen Datenlauf brechen, wohl aber durch eine
 * Aenderung an malRangliste/malTafel — und genau dann SOLLEN sie rot
 * werden. */
const OBERGRENZE = 393 + 1 + 2 + 13 + 2;

/* Die zweite Sperrklinke, eingezogen am 22.09.2026: so viele
   Gleichheiten gegen eine zweistellige Zahl stehen heute in Dateien,
   die aus data/ lesen. Die Zahl ist KEIN Gutachten — die meisten davon
   stehen an Werten, die der Test selbst setzt (Schadenswuerfe,
   QR-Kantenlaengen), und die sind voellig in Ordnung. Sie zaehlt ueber
   alle 91 Dateien, die aus data/ lesen, nicht nur ueber die 43 des
   engen Blicks. Sie ist eine
   Sperrklinke: sie darf nur fallen. Wer eine neue Gleichheit gegen
   eine feste Zahl in eine Datei mit Datenzugriff schreibt, faellt hier
   um und muss begruenden, warum die Zahl auch in vier Wochen noch
   stimmt. Genau das hat bei `assert.equal(n, 34)` zweimal gefehlt.

   162 auf 164 am 24.09.2026, Anlass Wochenlauf #148: zwei Gleichheiten
   in test-r1-nenner-hochgerechnet.js, beide an einem Feld, das der Test
   SELBST setzt (`api.setData(...)` mit festen Anteilen). Sie halten die
   zwei Lagen fest, in denen der Lauf #148 aufgelaufen ist — Other auf
   einem glatten Hundert und Other als eigene Spannengrenze. Aus data/
   kommt dabei keine Zahl; die Werte sind von Hand nachrechenbar und
   aendern sich nie. Genau deshalb stehen sie gesetzt da und nicht an
   den Daten der Woche. */
/* +1 am 26.09.2026: test-post-kaskade.js vergleicht KICKER_MAX mit 40.
 * Das ist keine Zahl aus den Daten, sondern eine GEMESSENE Eigenschaft
 * der Zeichenflaeche — 40 Zeichen messen gesperrt 652 px, 42 messen 685,
 * und `malKopf` schneidet bei 660. Sie kann durch keinen Datenlauf
 * brechen, wohl aber durch eine Aenderung an malKopf — und genau dann
 * SOLL sie rot werden. */
/* +1 am 26.09.2026: test-post-quellen.js vergleicht MAX mit 10. Die
 * Zahl ist eine BESTELLUNG des Betreibers, kein Datenwert — und genau
 * deshalb muss sie festgenagelt sein: alle anderen Zusicherungen lesen
 * den Deckel aus dem Modul und merken nicht, wenn er zurueckfaellt
 * (beim Verfaelschen gemessen). */
const OBERGRENZE_GLEICHHEIT = 162 + 2 + 1 + 1;

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

    it('die Zahl der Gleichheiten an Live-Daten steigt nicht', () => {
        const dateien = dateienMitDatenzugriff();
        const proDatei = dateien.map(f => [f, gleichheiten(f)]).filter(([, n]) => n > 0);
        const jetzt = proDatei.reduce((s, [, n]) => s + n, 0);
        assert.ok(jetzt <= OBERGRENZE_GLEICHHEIT,
            `Gleichheiten gegen feste Zahlen in Dateien mit Datenzugriff: ${jetzt} `
            + `(erlaubt: ${OBERGRENZE_GLEICHHEIT})\n`
            + proDatei.sort((a, b) => b[1] - a[1]).map(([f, n]) => `  ${String(n).padStart(3)}  ${f}`).join('\n')
            + '\n\nEine Gleichheit gegen eine abgelesene Zahl ist die Bauart, die am '
            + '09. und am 13.09.2026 die Deploy-Kette angehalten hat (assert.equal(n, 34) '
            + 'auf champions_resources.json, zweimal von Hand hochgesetzt). Wenn die '
            + 'Zahl aus dem Test selbst kommt und nicht aus data/, ist sie in Ordnung — '
            + 'dann die Obergrenze hier hochsetzen und dazuschreiben, woher sie kommt.');
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
