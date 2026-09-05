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
        assert.match(BAUER, /karte\.textContent = v\.karte \+ \(art \? /,
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
});
