/**
 * TECH-IDEEN — Karten außerhalb des Archetyps, die laut Kartentext helfen könnten
 *
 * ANLASS (05.09.2026). Der Betreiber zu den Tech-Vorschlägen:
 *
 *     "naja wenn es nichts gibt dann gibt es nichts aber vorschlagen
 *      kann man ja trotzdem Karten weil vll kommt man ja so auf Ideen
 *      für eine Deck Anpassung"   —   "Auch formatweit vorschlagen"
 *
 * Die Zusagen hier halten das fest, was an diesem Baustein GEFÄHRLICH
 * wäre, wenn es verrutscht:
 *
 *  1. Die Trennung Beleg/Idee. Der Block darüber im Warum-Dialog zeigt
 *     Karten mit Anteil und Platzierung — gemessen. Dieser hier zeigt
 *     Karten ohne beides. Stünde an einem Vorschlag eine Zahl, wäre die
 *     Trennung weg.
 *  2. Der Namensschluss. current_meta_card_data.csv schreibt
 *     "Toucannon Pbl", die Matchup-Datei "Toucannon". Ein Vergleich auf
 *     Gleichheit verliert die Hälfte der Gegner STILL.
 *  3. Die Reihenfolge Prüfen-dann-Kappen. Die erste Fassung nahm die
 *     drei schlechtesten Matchups und suchte nur dort — für Mega
 *     Excadrill lag der einzige Gegner mit einem Ansatzpunkt auf Platz
 *     sechs, und das Ergebnis war leer.
 *  4. Die Ehrlichkeit über die Regelbasis. Fünf Paarungen vom
 *     15.05.2026 sind keine Formatabdeckung. Wer das nicht hinschreibt,
 *     lässt ein leeres Ergebnis wie "es gibt nichts" aussehen.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');

const QUELLE = lies('js', 'tech-ideen.js');
const BAUER  = lies('js', 'app-deck-builder.js');
const I18N   = lies('js', 'i18n.js');
const ENGINE = lies('js', 'card-capability-engine.js');
const CSS    = lies('css', 'ui-components.css');

describe('Tech-Ideen — Idee, nicht Beleg', () => {

    it('der Baustein ist geladen und hängt an der Seite', () => {
        assert.match(lies('index.html'), /js\/tech-ideen\.js/,
            'tech-ideen.js wird nicht eingebunden — dann läuft der Block nie');
        assert.match(QUELLE, /window\.TechIdeen\s*=/,
            'der Baustein stellt sich nicht bereit');
    });

    it('an einem Vorschlag steht KEIN Anteil und KEINE Siegquote', () => {
        /* Das ist die Trennung Beleg/Idee, und sie ist der ganze Punkt.
           Eine Zahl an der Karte würde genau die Belegkraft vortäuschen,
           die fehlt — es gibt für diese Karten keinen Anteil, weil sie
           im Archetyp niemand spielt. */
        const block = /aus\.push\(\{([\s\S]*?)\}\);/.exec(QUELLE);
        assert.ok(block, 'der Vorschlag wird nicht mehr zusammengebaut');
        assert.ok(!/share|anteil|quote|winrate|platz/i.test(block[1]),
            `am Vorschlag hängt eine Belegzahl: ${block[1].replace(/\s+/g, ' ').slice(0, 200)}`);
        /* Die Sicherheit DARF dastehen: sie ist eine Aussage über die
           Ableitung, nicht über die Karte. */
        assert.match(block[1], /sicherheit/,
            'die Sicherheit der Ableitung fehlt — dann steht die Idee ohne Vorbehalt da');
    });

    it('die Kartenart steht dabei', () => {
        /* BEFUND beim ersten echten Lauf: gegen Toucannon kamen
           "Crustle", "Dudunsparce ex" und "Iron Crown ex" — alles
           Angreifer. Einem Mega-Excadrill-Spieler "spiel Crustle" zu
           sagen heißt "spiel ein anderes Deck". Verschwiegen wird es
           nicht, aber der Leser muss es einordnen können. */
        assert.match(QUELLE, /art:\s*rec \? \(rec\.card_type/,
            'die Kartenart wandert nicht mit');
        assert.match(QUELLE, /energie:\s*rec \? \(rec\.energy_type/,
            'der Energietyp wandert nicht mit');
        /* Seit dem Gruppieren gleicher Gründe (06.09.2026) steht in
           einer Zeile mehr als eine Karte — die Art muss trotzdem an
           JEDER hängen, sonst weiß der Leser bei der zweiten nicht
           mehr, ob da ein Angreifer steht. */
        assert.match(BAUER, /const art = _ideenArt\(v\);/,
            'Kartenart und Energie werden nicht mehr zusammengesetzt');
        assert.match(BAUER, /zeile\.textContent = v\.karte \+ \(art \? '  \(' \+ art \+ '\)' : ''\);/,
            'die Kartenart wird nicht angezeigt');
    });

    it('die Archetypnamen werden über die gepflegte Brücke verbunden', () => {
        /* NIEMALS auf Gleichheit vergleichen: current_meta_card_data.csv
           schreibt "Toucannon Pbl", die Matchup-Datei "Toucannon".
           `normalizeArchetypeForMatch` ist die Brücke, die die Seite für
           genau diesen Zweck schon führt. */
        assert.match(QUELLE, /window\.normalizeArchetypeForMatch/,
            'die Namensbrücke wird nicht benutzt — die Hälfte der Gegner fällt still weg');
        assert.match(QUELLE, /function _normArch/,
            'es gibt keine Stelle, an der normalisiert wird');
        /* Der ANZEIGENAME muss der aus der Matchup-Datei bleiben — der
           Nutzer kennt "Toucannon", nicht "toucannon pbl". */
        assert.match(QUELLE, /gegner: g,\s*\n\s*gegnerKey: _normArch\(g\)/,
            'Anzeigename und Vergleichsschlüssel sind nicht getrennt');
    });

    it('erst prüfen, dann kappen', () => {
        /* Die erste Fassung nahm `slice(0, 3)` VOR der Prüfung. Für Mega
           Excadrill sind die drei schlechtesten Matchups Alakazam
           Dudunsparce (24,97 %), Rocket's Honchkrow (34,15 %) und Mega
           Lucario (35 %) — keiner davon führt eine Karte, gegen die die
           Regelbasis etwas kennt. Der einzige mit Ansatzpunkt ist
           Toucannon auf Platz SECHS. Die Kappung ließ also nicht die
           schwächsten Vorschläge weg, sondern die einzigen. */
        const fn = /function _schlechteGegner\(([\s\S]*?)\n\}/.exec(QUELLE);
        assert.ok(fn, '_schlechteGegner fehlt');
        assert.ok(!/slice\(/.test(fn[1]),
            '_schlechteGegner kappt wieder vor der Prüfung');
        assert.match(QUELLE, /_hatAnsatzpunkt\(daten, g\.gegnerKey\)[\s\S]{0,80}\.slice\(0, MAX_GEGNER\)/,
            'die Kappung steht nicht hinter der Ansatzpunkt-Prüfung');
    });

    it('nur Gegner mit einem echten Ansatzpunkt kosten einen Lauf', () => {
        assert.match(QUELLE, /function _hatAnsatzpunkt/,
            'jeder Gegner löst einen vollen Lauf über den Formatpool aus');
        assert.match(QUELLE, /_ansatz\.set\(gegnerKey, ja\)/,
            'die Antwort wird nicht behalten — dann läuft sie je Aufruf neu');
    });

    it('die Schwellen sind benannte Entscheidungen, keine Streuzahlen', () => {
        for (const k of ['SCHLECHT_AB', 'MIN_PARTIEN', 'PRO_GEGNER', 'MAX_GEGNER']) {
            assert.ok(new RegExp('var ' + k + '\\s*=\\s*\\d').test(QUELLE),
                `${k} ist keine benannte Konstante`);
        }
        /* MIN_PARTIEN darf nicht unter die Schwelle fallen, ab der die
           Heatmap eine Quote kursiv setzt — an dieser hier hängt eine
           EMPFEHLUNG und nicht nur eine Anzeige. */
        const n = Number(/var MIN_PARTIEN\s*=\s*(\d+)/.exec(QUELLE)[1]);
        assert.ok(n >= 30, `MIN_PARTIEN steht bei ${n} — darunter ist die Quote Zufall`);
    });

    it('ein Gegner ohne Vorschlag fällt aus der Liste', () => {
        /* Genau der Fehler, der am 05.09.2026 in den erkannten
           Tech-Interaktionen gefunden wurde: 16 von 19 Gegnern mit
           leerer Liste und einem Minus, das niemand erklären konnte. */
        assert.match(QUELLE, /gegner: reihe\.filter\(function \(g\) \{ return g\.vorschlaege\.length > 0/,
            'Gegner ohne Vorschlag bleiben in der Liste stehen');
    });

    it('die Oberfläche nennt die Regelbasis mit Zahl und Datum', () => {
        /* Fünf Paarungen vom 15.05.2026 sind keine Formatabdeckung. Wer
           das verschweigt, lässt "nichts gefunden" wie "es gibt nichts"
           aussehen. */
        assert.match(QUELLE, /function datenstand/, 'der Datenstand wird nicht herausgegeben');
        for (const key of ['buildInfo.techIdeenFuss', 'buildInfo.techIdeenLeer']) {
            const n = (I18N.match(new RegExp("'" + key.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${key} fehlt in einer der beiden Sprachen`);
        }
        assert.ok(/techIdeenFuss[\s\S]{0,200}\{n\}[\s\S]{0,200}\{datum\}/.test(I18N),
            'die Fußzeile nennt nicht Zahl UND Datum der Regelbasis');
        assert.match(BAUER, /techIdeenFuss[\s\S]{0,300}stand\.interaktionen/,
            'die Zahl der Regeln wird nicht eingesetzt');
    });

    it('der Block heißt im Titel "Idee" und im Einleitungssatz "kein Beleg"', () => {
        const de = /'buildInfo\.techIdeenTitel':\s*'([^']*)'/g;
        const treffer = [...I18N.matchAll(de)].map(m => m[1]);
        assert.strictEqual(treffer.length, 2, 'der Titel fehlt in einer Sprache');
        assert.ok(treffer.some(x => /Idee, kein Beleg/.test(x)),
            `der deutsche Titel sagt nicht, dass es eine Idee ist: ${treffer.join(' | ')}`);
        assert.ok(treffer.some(x => /an idea, not evidence/i.test(x)),
            `der englische Titel sagt nicht, dass es eine Idee ist: ${treffer.join(' | ')}`);
    });

    it('der Kandidatenkreis ist das laufende Format, nicht die Kartenhistorie', () => {
        /* pokemon_card_effects.json führt 20.419 Karten. Die meisten
           sind im Format nicht legal, und ein Vorschlag, den man nicht
           spielen darf, ist schlechter als keiner. */
        assert.match(QUELLE, /current_meta_card_data\.csv/,
            'der Kandidatenkreis kommt nicht aus dem laufenden Format');
        assert.ok(!/_text\('data\/pokemon_card_effects\.json'\)/.test(QUELLE),
            'die volle Kartenhistorie wird als Kandidatenkreis gelesen');
    });

    it('Karten aus dem eigenen Archetyp und dem eigenen Deck fallen weg', () => {
        assert.match(QUELLE, /var istDrin = function/,
            'es gibt keine Ausschlussprüfung');
        assert.match(QUELLE, /opts\.eigeneKarten \|\| \[\]/,
            'die Karten des eigenen Decks werden nicht ausgeschlossen');
    });

    it('der Kartenschlüssel wandert durch die Engine mit', () => {
        /* Ohne ihn müsste der Aufrufer über den NAMEN nachschlagen, und
           Namen sind in diesem Format nicht eindeutig — CLAUDE.md:
           PBL führt vier Produkte "Mega Darkrai ex". */
        assert.match(ENGINE, /attackerKey:\s*um\.cardKey/,
            'die Engine gibt den Kartenschlüssel nicht heraus');
    });

    it('das Datum steht in der Sprache des Lesers', () => {
        /* "Abgeleitet aus 5 Regeln vom 2026-05-15" liest sich in einem
           deutschen Satz wie ein durchgereichter Datenbankwert, weil es
           einer ist. Gefunden beim Ansehen des gerenderten Blocks. */
        assert.match(BAUER, /function _ideenDatum/,
            'das ISO-Datum wird roh in den deutschen Satz gesetzt');
        assert.match(BAUER, /\$\{m\[3\]\}\.\$\{m\[2\]\}\.\$\{m\[1\]\}/,
            'die deutsche Schreibweise fehlt');
    });

    it('ein Fehler beim Laden macht den Dialog nicht kaputt', () => {
        assert.match(QUELLE, /\.catch\(function \(e\) \{[\s\S]{0,200}gegner: \[\]/,
            'ein Ausfall der Datenquellen wirft statt leer zurückzugeben');
        assert.match(BAUER, /catch \(e\) \{[\s\S]{0,120}TechIdeen/,
            'der Aufruf im Dialog ist nicht abgesichert');
    });

    it('derselbe Grund steht einmal da, nicht dreimal', () => {
        /* GEFUNDEN BEIM HINSEHEN am 06.09.2026, nicht von einer
           Zusicherung: gegen Toucannon standen drei Zeilen, und alle
           drei sagten dasselbe — nur mit einem anderen Kartennamen
           davor. Drei Träger derselben Regel. Richtig, aber es liest
           sich wie Füllmaterial.

           Diese Zusicherung GREIFT den Gruppierer aus dem Quelltext und
           lässt ihn wirklich laufen, statt nach Stichworten zu suchen. */
        const quelle = BAUER.slice(
            BAUER.indexOf('const grosz = (x)'),
            BAUER.indexOf('gruppen.forEach(gr => {'));
        assert.ok(quelle.length > 200, 'der Gruppierer wurde nicht gefunden');

        const gruppiere = new Function('vorschlaege', quelle
            .replace('g.vorschlaege.forEach', 'vorschlaege.forEach')
            + '\n return gruppen;');

        /* Der Fall, der den Befund ausgelöst hat. */
        const drei = gruppiere([
            { karte: 'Crustle', sicherheit: 'high', art: 'Stage 1', energie: 'Grass',
              satz: 'Crustle ignoriert Pikachu exs Resolute Heart — effekt-immuner Schaden.' },
            { karte: 'Dudunsparce ex', sicherheit: 'high', art: 'Stage 1', energie: 'Colorless',
              satz: 'Dudunsparce ex ignoriert Pikachu exs Resolute Heart — effekt-immuner Schaden.' },
            { karte: 'Iron Crown ex', sicherheit: 'high', art: 'Basic', energie: 'Psychic',
              satz: 'Iron Crown ex ignoriert Pikachu exs Resolute Heart — effekt-immuner Schaden.' }
        ]);
        assert.strictEqual(drei.length, 1,
            `${drei.length} Gründe für drei Träger derselben Regel — der Grund wird wiederholt`);
        assert.strictEqual(drei[0].karten.length, 3, 'nicht alle drei Träger stehen in der Gruppe');
        assert.ok(!/^Crustle/.test(drei[0].grund),
            'der Kartenname steht noch vor dem Grund und macht ihn kartenspezifisch');
        assert.match(drei[0].grund, /^Ignoriert Pikachu exs Resolute Heart/,
            'der Grund wurde beim Kürzen beschädigt');

        /* Verschiedene Gründe bleiben getrennt — sonst wäre die
           Zusammenfassung eine Unterschlagung. */
        const zwei = gruppiere([
            { karte: 'A', sicherheit: 'high', satz: 'A ignoriert X.' },
            { karte: 'B', sicherheit: 'high', satz: 'B sperrt Y.' }
        ]);
        assert.strictEqual(zwei.length, 2, 'zwei verschiedene Gründe wurden zusammengeworfen');

        /* Gleicher Satz, andere Sicherheit: getrennt, weil die
           Sicherheit mit angezeigt wird. */
        const sicher = gruppiere([
            { karte: 'A', sicherheit: 'high', satz: 'A ignoriert X.' },
            { karte: 'B', sicherheit: 'low', satz: 'B ignoriert X.' }
        ]);
        assert.strictEqual(sicher.length, 2,
            'unterschiedliche Sicherheit wurde unter einer Angabe zusammengefasst');

        /* Beginnt der Satz NICHT mit dem Kartennamen, wird nicht
           gekürzt und nicht gruppiert — lieber eine Wiederholung als
           ein verstümmelter Satz. */
        const roh = gruppiere([
            { karte: 'A', sicherheit: 'high', satz: 'Gegen X hilft A.' },
            { karte: 'B', sicherheit: 'high', satz: 'Gegen X hilft B.' }
        ]);
        assert.strictEqual(roh.length, 2, 'ein Satz ohne führenden Kartennamen wurde gruppiert');
        assert.strictEqual(roh[0].grund, 'Gegen X hilft A.', 'der Satz wurde trotzdem gekürzt');
    });

    it('Kartenart und Energie stehen in der Sprache des Lesers', () => {
        /* GEFUNDEN BEIM HINSEHEN am 06.09.2026: "Crustle (Evolves from
           Dwebble · Grass)" mitten in einem durchgehend deutschen
           Absatz. Derselbe Fehler wie am 30.08.2026 im Kartenfilter,
           wo die Energietypen als einzige Liste englisch blieben.

           Die Zusicherung GREIFT den Uebersetzer aus dem Quelltext und
           laesst ihn laufen — mit einem Wortschatz, der die echten
           Schluessel benutzt. */
        const quelle = BAUER.slice(BAUER.indexOf('function _ideenArt(v) {'));
        const ende = quelle.indexOf('\n        }\n');
        assert.ok(ende > 100, 'die Funktion _ideenArt wurde nicht gefunden');
        const koerper = quelle.slice(quelle.indexOf('{') + 1, ende);

        const wortschatz = {
            'buildInfo.techIdeenBasis': 'Basis',
            'buildInfo.techIdeenBasisEnergie': 'Basis-Energie',
            'buildInfo.techIdeenEntwickelt': 'Entwickelt sich aus {name}',
            'cards.energyGrass': 'Pflanze',
            'cards.energyColorless': 'Farblos',
            'cards.energyPsychic': 'Psycho'
        };
        const art = new Function('v', 't', 'getLang',
            koerper.replace(/\bt\(/g, '__t(').replace('__t(', 't(')
                   .replace(/__t\(/g, 't('));
        const t = (k) => (k in wortschatz ? wortschatz[k] : k);
        const de = () => 'de';

        assert.strictEqual(art({ karte: 'Crustle', art: 'Evolves from Dwebble', energie: 'Grass' }, t, de),
            'Entwickelt sich aus Dwebble · Pflanze',
            'die Entwicklungsangabe bleibt englisch');
        assert.strictEqual(art({ karte: 'Iron Crown ex', art: 'Basic', energie: 'Psychic' }, t, de),
            'Basis · Psycho', '"Basic" wird nicht uebersetzt');
        assert.strictEqual(art({ karte: 'X', art: '', energie: 'Colorless' }, t, de),
            'Farblos', 'ohne Kartenart bleibt der Energietyp nicht allein stehen');
        assert.strictEqual(art({ karte: 'X', art: '', energie: '' }, t, de), '',
            'ohne Angaben entsteht ein leerer Klammerausdruck');

        /* Ein unbekannter Wert wird durchgereicht, nicht erfunden. */
        assert.strictEqual(art({ karte: 'X', art: 'Fossil', energie: 'Nonesuch' }, t, de),
            'Fossil · Nonesuch',
            'ein unbekannter Wert wird veraendert statt unveraendert stehenzubleiben');

        /* Und die drei neuen Schluessel muessen in BEIDEN Sprachen
           stehen — ein fehlender Schluessel faellt sonst still auf den
           Schluesselnamen zurueck. */
        for (const key of ['buildInfo.techIdeenBasis', 'buildInfo.techIdeenBasisEnergie',
                           'buildInfo.techIdeenEntwickelt']) {
            const n = (I18N.match(new RegExp("'" + key.replace(/\./g, '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${key} fehlt in einer der beiden Sprachen`);
        }
        assert.match(I18N, /'buildInfo\.techIdeenEntwickelt':\s*'Entwickelt sich aus \{name\}'/,
            'die deutsche Entwicklungsangabe fehlt');
    });

    it('mehrere Träger stehen untereinander, nicht in einer Zeile', () => {
        /* Nebeneinander mit Trennpunkt brach die Zeile mitten in einer
           Klammer um — "Evolves from Dunsparce ·" / "Colorless)". */
        assert.match(BAUER, /zeile\.className = 'build-info-ideen-karte'/,
            'die Träger bekommen keine eigene Zeile');
        assert.ok(!/\.join\('   ·   '\)/.test(BAUER),
            'die Träger werden weiterhin in eine Zeile geschrieben');
        assert.match(CSS, /\.build-info-ideen-karte \+ \.build-info-ideen-karte/,
            'die gestapelten Träger haben keinen Abstand');
    });
});
