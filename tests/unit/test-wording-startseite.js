/**
 * Das Wording der Startseite — angestrichen am 31.08.2026.
 *
 * Der Betreiber hat dreizehn Stellen markiert: Überschriften, die komisch
 * klangen, und Erklärsätze, die zwischen den Zahlen standen statt unter
 * Quellen & Methodik. Diese Datei hält fest, was daraus geworden ist —
 * und vor allem, dass beim Kürzen keine Zahl verlorengegangen ist.
 *
 * Die Regel dahinter: eine Quote ohne ihren Nenner ist eine Behauptung.
 * Texte dürfen umziehen, Zahlen nicht verschwinden.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
// Kommentare raus: die Begruendungen im Quelltext ZITIEREN die alten
// Formulierungen als das, was sie nicht mehr sein sollen. Ohne diesen
// Schritt findet der Test seine eigene Erklaerung.
const ohneKommentar = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[\t ]*\/\/.*$/gm, '');
const lies = (...p) => ohneKommentar(fs.readFileSync(path.join(ROOT, ...p), 'utf8'));
const EMPF = lies('js', 'app-deckempfehlung.js');
const HUB = lies('js', 'meta-analysis-hub.js');
const FILTER = lies('js', 'ds-filter.js');
const QUELLEN = lies('js', 'app-quellen.js');

describe('Die alten Formulierungen kommen nicht zurück', () => {
    const abgeloest = [
        [EMPF, 'Was du mitnehmen solltest', 'las sich wie eine Packliste'],
        [EMPF, 'so oft reicht es für Day 2', 'zu lang für eine Kachelbeschriftung'],
        [EMPF, 'Day-2-Quote des Decks bisher', 'zu lang für eine Kachelbeschriftung'],
        [EMPF, 'beliebiges Deck ', '„beliebig“ klingt nach Zufall, gemeint ist der Schnitt'],
        [EMPF, 'Auch damit reicht es in ', 'doppelte Verneinung'],
        [EMPF, '% des Felds ist neu', 'Numerusfehler'],
        [EMPF, '— ausgewertet: ', 'Gedankenstrich plus Doppelpunkt in einem Satz'],
        [HUB, 'Was ist gerade stark?', 'als Frage formuliert, obwohl die Antwort darunter steht'],
        [HUB, 'ist gerade das erfolgreichste Deck', 'vier Teilsätze im ersten Satz der Seite'],
        [FILTER, 'hier gibt es nur das laufende Format', 'klang wie eine Entschuldigung'],
        // Und die zweite Fassung desselben Satzes, am 01.09.2026:
        // "Okay, den Zusatz kannst du aber rauslassen. Lieber dieses
        // TEF-bis-PBL-Feld optisch den anderen anpassen." Eine Anzeige,
        // die "TEF-PBL" sagt, braucht keine Bildunterschrift.
        [FILTER, 'Global läuft immer im aktuellen Format.', 'erklärte das Feld daneben, das für sich spricht'],
    ];
    for (const [quelle, text, warum] of abgeloest) {
        it(`„${text}“ steht nicht mehr da (${warum})`, () => {
            assert.ok(!quelle.includes(text), `„${text}“ ist wieder da`);
        });
    }
});

describe('Die neuen Formulierungen stehen in beiden Sprachen', () => {
    const paare = [
        [EMPF, "'Unser Pick fürs Turnier'", "'Our pick for the event'"],
        [EMPF, "'schafft Day 2'", "'makes Day 2'"],
        [EMPF, "'Day-2-Rate bisher'", "'Day 2 rate so far'"],
        [EMPF, "'Schnitt aller Decks '", "'average across all decks '"],
        // 05.09.2026: der Satz nannte eine SPIELER-Quote als
        // TURNIER-Anteil ("in 75 % der Turniere ist nach Day 1
        // Schluss"). `empfehlung_mittel` ist der Anteil der Spieler
        // dieses Decks, die Day 2 erreichen; die Datei sagt daneben
        // `day2_ueberhaupt_erreicht: 43` von `turniere: 44` — in 2,3 %
        // der Turniere war Schluss, nicht in 75 %. Faktor 33.
        [EMPF, "'Und trotzdem: von je vier Spielern dieses Decks scheitern rund '", "'And still: about '"],
        [EMPF, "' % der Antritte, gemittelt über '", "' % of entries, averaged over '"],
        [EMPF, "' % vom Feld sind neu.</strong> '", null],
        [HUB, "'Was gerade läuft'", "'What is running right now'"],
    ];
    for (const [quelle, de, en] of paare) {
        it(`${de.slice(0, 34)} …`, () => {
            assert.ok(quelle.includes(de), `deutsch fehlt: ${de}`);
            if (en) assert.ok(quelle.includes(en), `englisch fehlt: ${en}`);
        });
    }

    it('der Vorbehalt spricht in beiden Sprachen vom Pick, nicht von der Empfehlung', () => {
        // Sonst heißt dasselbe Ding auf einer Seite zweimal anders.
        assert.match(EMPF, /% vom Feld sind neu/);
        assert.match(EMPF, /The pick is untested against those decks/);
        assert.ok(!/The recommendation is untested/.test(EMPF));
    });
});

describe('Beim Kürzen ist keine Zahl verschwunden', () => {
    it('der Hub-Satz nennt Quote, Vergleichswert und Vielfaches — zweisprachig', () => {
        const satz = /function answerSentence\(model\) \{[\s\S]*?\n    \}/.exec(HUB)[0];
        // ${q} statt ${quote} seit dem 02.09.2026: die Quote traegt einen
        // Titel, der die Gewichtung erklaert. Der Satz nennt sie weiter
        // in beiden Sprachfassungen.
        for (const [ph, name] of [[/\$\{q\}/g, 'Quote'], [/\$\{schnitt\}/g, 'Vergleichswert'],
                                  [/\$\{fak\}/g, 'Vielfaches']]) {
            assert.equal((satz.match(ph) || []).length, 2, `${name} fehlt in einer Sprachfassung`);
        }
    });

    /* Der Ausschnitt geht bis zur naechsten Funktion, nicht bis zur
       ersten Zeile, die mit vier Leerzeichen und } beginnt: answerNenner
       hat seit dem 02.09.2026 zwei Zweige, und die alte Fassung schnitt
       mitten im ersten ab. */
    const nenner = () => HUB.slice(
        HUB.indexOf('function answerNenner(model) {'),
        HUB.indexOf('function answerHtml(model) {'));

    it('der Nenner nennt Gesamtstichprobe und die absoluten Top-8-Zahlen', () => {
        const n = nenner();
        assert.ok(n.length > 200, 'answerNenner nicht gefunden');
        // Der gezaehlte Zweig — der Normalfall seit dem Wochenlauf.
        assert.match(n, /\$\{gesamt\} Antritten · /);
        assert.match(n, /\$\{gesamt\} entries · /);
        // Seit dem 02.09.2026 rechnet der ganze Block gezaehlt; `best`
        // traegt deshalb selbst die gezaehlten Zahlen, und ein zweites
        // Feld dafuer gibt es nicht mehr.
        assert.match(n, /zahl\(best\.top8\)/);
        assert.match(n, /zahl\(best\.brought\)/);
        // Und der Rueckfall, falls die gezaehlten Spalten fehlen.
        assert.match(n, /\$\{gesamt\} gewichteten Antritten/);
        assert.match(n, /\$\{gesamt\} weighted entries/);
        assert.equal((n.match(/\$\{mit\(best\.top8\)\}/g) || []).length, 2);
        assert.equal((n.match(/\$\{mit\(best\.brought\)\}/g) || []).length, 2);
    });

    it('halbe Antritte erklären sich weiterhin an Ort und Stelle', () => {
        /* "71,5 Antritte" liest sich sonst wie ein Fehler.

           KORREKTUR 02.09.2026: hier stand "nach Turniergröße gewichtet".
           Das war falsch — gewichtet wird nach AKTUALITAET (Turniere der
           letzten sieben Tage 1,0, aeltere 0,5, siehe
           backend/scrapers/online_tournament_scraper.py:361). Die
           Zusicherung hat die falsche Erklaerung festgehalten, statt sie
           zu finden.

           Der Zweig greift ausserdem nur noch, wenn die Datei die
           gezaehlten Spalten NICHT fuehrt; im Normalfall stehen dort
           ganze Zahlen und gar kein Hinweis. */
        const n = nenner();
        assert.match(n, /nach Aktualität gewichtet/);
        assert.match(n, /weighted by recency/);
        assert.ok(!/nach Turniergröße gewichtet/.test(n),
            'die falsche Begruendung ist zurueck');
        assert.match(n, /class="mah-gewichtet"/);
    });

    it('die Belegzeile nennt weiterhin Turniere, Spieler und die Mindestzahl', () => {
        assert.match(EMPF, /Basis: '/);
        assert.match(EMPF, /min\. ' \+ gz\(grenze\)/);
        assert.match(EMPF, /' Spieler'/);
    });

    it('die Kachel nennt weiterhin den Vergleichswert', () => {
        // Ohne "Schnitt aller Decks 14,5 %" ist "21,6 %" nicht einzuordnen.
        assert.match(EMPF, /Schnitt aller Decks ' : 'average across all decks '\) \+ pz\(v\.feld_mittel\)/);
    });
});

describe('Was von der Startseite wegging, steht unter Quellen & Methodik', () => {
    const begriffe = [
        ['Unser Pick', 'Our pick'],
        ['„schafft Day 2“', '“makes Day 2”'],
        ['„Day-2-Rate bisher“', '“Day 2 rate so far”'],
        ['„min. 30 pro Deck“', '“min. 30 per deck”'],
        ['„% vom Feld sind neu“', '“% of the field is new”'],
    ];
    for (const [de, en] of begriffe) {
        it(`${de} ist erklärt — deutsch und englisch`, () => {
            // Als vollstaendiger Listeneintrag pruefen, nicht als
            // Teilstring: "Unser Pick" steckt auch in "Unser Pickk",
            // und genau diese Mutation ist beim Nachschaerfen dieser
            // Datei durchgerutscht.
            assert.ok(QUELLEN.includes(`['${de}',`), `deutsch fehlt: ${de}`);
            assert.ok(QUELLEN.includes(`['${en}',`), `englisch fehlt: ${en}`);
        });
    }

    it('jeder Begriff hat auch eine Erklärung, nicht nur einen Kopf', () => {
        for (const [de] of begriffe) {
            const i = QUELLEN.indexOf(`['${de}',`);
            assert.ok(i > -1, de);
            const rest = QUELLEN.slice(i, i + 600);
            const text = /\['[^']*',\s*\n?\s*'([^']{25,})/.exec(rest);
            assert.ok(text, `${de}: kein Erklärtext dahinter`);
        }
    });

    it('die Startseite verweist weiterhin dorthin', () => {
        assert.match(HUB, /href="#quellen"/);
        assert.match(EMPF, /href="#quellen"/);
    });
});
