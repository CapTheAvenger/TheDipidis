/**
 * Eine Datumsgrenze, ein "Meta Live", eine ehrliche Beschriftung.
 *
 * Drei Befunde vom 21.08.2026, alle aus derselben Ecke:
 *
 * 1. Es gab zwei Datumsgrenzen. filterTournamentRowsByMetaDate im
 *    Aktuellen Meta warf Zeilen OHNE lesbares Datum weg,
 *    window._filterMajorRowsToCurrentFormat im Deckbauer behaelt sie
 *    ausdruecklich ("dropping data we cannot date would be a silent
 *    repair"). Zwei Antworten auf dieselbe Frage, je nachdem welche
 *    Ansicht fragt.
 *
 * 2. Eine Zuweisung lief ganz ohne Grenze: beim Filter "Alle" wurden
 *    die Turnierzeilen ungefiltert uebernommen. "Alle" konnte damit
 *    Turniere von vor dem Formatstart einrechnen, "Nur Major" nicht.
 *
 * 3. Der Vergleich row.meta === 'Meta Live' liess die Zeilen fallen,
 *    die bei gesetztem Datenfenster als 'Meta Live (Dated)' entstehen.
 *    Der Filter "live" war dann leer und die Oberflaeche schrieb
 *    "No data found" — obwohl Daten da waren.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const CM = lies('js/app-current-meta-analysis.js');
const DB = lies('js/app-deck-builder.js');
const I18N = lies('js/i18n.js');

function extrahiere(quelle, von, bis, was) {
    const a = quelle.indexOf(von);
    assert.ok(a >= 0, `Anker fehlt (${was}): ${von}`);
    const b = quelle.indexOf(bis, a);
    assert.ok(b > a, `Endanker fehlt (${was}): ${bis}`);
    return quelle.slice(a, b + bis.length);
}

/** Beide Filter aus dem Quelltext holen und miteinander messen. */
function ladeFilter() {
    const gemeinsam = extrahiere(
        DB,
        'function _filterMajorRowsToCurrentFormat(rows, fw) {',
        '\n        }',
        'gemeinsamer Filter');
    const metaFilter = extrahiere(
        CM,
        'function filterTournamentRowsByMetaDate(rows) {',
        '\n        }',
        'Metaansicht-Filter');

    const raum = new Function(`
        const devLog = () => {};
        function _parseAnyTournamentDate(text) {
            if (!text) return null;
            const d = new Date(String(text) + ' UTC');
            return isNaN(d.getTime()) ? null : d;
        }
        function parseEnglishTournamentDate(text) { return _parseAnyTournamentDate(text); }
        ${gemeinsam}
        const window = { _filterMajorRowsToCurrentFormat };
        let currentMetaTournamentStartDate = null;
        ${metaFilter}
        return {
            gemeinsam: _filterMajorRowsToCurrentFormat,
            setzeStart: (d) => { currentMetaTournamentStartDate = d; },
            metaFilter: filterTournamentRowsByMetaDate,
        };
    `)();
    return raum;
}

const ZEILEN = [
    { tournament_date: '2026-06-10', card_name: 'vor dem Start' },
    { tournament_date: '2026-08-09', card_name: 'im Fenster' },
    { tournament_date: '', card_name: 'ohne Datum' },
];

describe('Beide Grenzen antworten gleich', () => {
    const { gemeinsam, setzeStart, metaFilter } = ladeFilter();
    const start = new Date(Date.UTC(2026, 6, 31));   // 31.07.2026

    it('schneidet Turniere vor dem Formatstart weg', () => {
        setzeStart(start);
        const namen = metaFilter(ZEILEN).map(z => z.card_name);
        assert.ok(!namen.includes('vor dem Start'));
        assert.ok(namen.includes('im Fenster'));
    });

    it('behaelt Zeilen ohne lesbares Datum', () => {
        setzeStart(start);
        const namen = metaFilter(ZEILEN).map(z => z.card_name);
        assert.ok(namen.includes('ohne Datum'),
            'undatierte Zeilen wegzuwerfen waere eine stille Reparatur — '
            + 'der Deckbauer behaelt sie, diese Ansicht muss es auch');
    });

    it('liefert dasselbe wie der Deckbauer-Filter', () => {
        setzeStart(start);
        const hier = metaFilter(ZEILEN).map(z => z.card_name);
        const dort = gemeinsam(ZEILEN, { in_person_legal_date: '2026-07-31' })
            .rows.map(z => z.card_name);
        assert.deepEqual(hier, dort);
    });

    it('laesst ohne Startdatum alles durch', () => {
        setzeStart(null);
        assert.equal(metaFilter(ZEILEN).length, 3);
    });
});

describe('Keine ungefilterte Zuweisung mehr', () => {
    it('jede Zuweisung an currentMetaTournamentCardsData geht durch den Filter', () => {
        const zeilen = CM.split('\n');
        const treffer = zeilen
            .map((z, i) => ({ z: z.trim(), i: i + 1 }))
            .filter(x => /^window\.currentMetaTournamentCardsData\s*=/.test(x.z));
        assert.ok(treffer.length >= 3, `nur ${treffer.length} Zuweisungen gefunden`);
        for (const t of treffer) {
            const kontext = zeilen.slice(t.i - 1, t.i + 1).join(' ');
            assert.match(kontext, /filterTournamentRowsByMetaDate/,
                `Zeile ${t.i} weist ungefiltert zu: ${t.z}`);
        }
    });
});

describe('"Meta Live (Dated)" zaehlt als live', () => {
    it('kein strikter Vergleich auf Meta Live mehr', () => {
        const zeilen = CM.split('\n').filter(z => !z.trim().startsWith('//'));
        const strikt = zeilen.filter(z => /meta\s*===\s*'Meta Live'/.test(z));
        assert.deepEqual(strikt, [],
            'ein strikter Vergleich laesst die Zeilen fallen, die bei '
            + 'gesetztem Datenfenster als "Meta Live (Dated)" entstehen');
    });

    it('die erzeugende Stelle schreibt weiterhin Meta Live (Dated)', () => {
        assert.match(CM, /meta:\s*'Meta Live \(Dated\)'/,
            'wenn dieser Wert wegfaellt, gehoert der Filter oben angepasst');
    });
});

describe('"Alle" sagt, wenn es dasselbe zeigt wie "Nur Limitless"', () => {
    it('es gibt einen Hinweistext in beiden Sprachen', () => {
        const treffer = I18N.match(/'currentMeta\.alleWieLive':/g) || [];
        assert.equal(treffer.length, 2, 'Hinweis fehlt in einer der Sprachen');
        assert.match(I18N, /alleWieLive[^\n]*\{format\}/,
            'der Hinweis nennt das Format nicht');
    });

    it('der Filter "all" prueft den Major-Leerstand', () => {
        const block = extrahiere(
            CM,
            'async function setCurrentMetaFormatFilter(format) {',
            'Respect value already set by populateCurrentMetaDeckSelect',
            'Formatfilter');
        assert.match(block, /format === 'all'/);
        assert.match(block, /kein-major-im-format/);
        // Seit dem Sprachdurchgang vom 30.08.2026 merkt sich der Filter nur
        // noch den Formatschluessel; den Satz baut
        // updateCurrentMetaFilterStatusLabel(). Grund: sonst koennte der
        // languageChanged-Listener den Vorbehalt beim Nachziehen der
        // Statuszeile nicht mitnehmen und wuerde ihn wegschreiben.
        assert.match(block, /_cmAlleWieLiveFormat/,
            'der Filter merkt sich den Vorbehalt nicht mehr');
        assert.match(block, /updateCurrentMetaFilterStatusLabel\(format\)/,
            'der Filter laesst die Statuszeile nicht neu schreiben');
    });

    it('die Statuszeile formuliert den Hinweis in der aktiven Sprache', () => {
        const fn = extrahiere(
            CM,
            'function updateCurrentMetaFilterStatusLabel(format) {',
            'async function setCurrentMetaFormatFilter(format) {',
            'Statuszeile');
        assert.match(fn, /alleWieLive/,
            'der Hinweistext wird nicht mehr aus i18n geholt');
        assert.match(fn, /_cmAlleWieLiveFormat/,
            'der gemerkte Vorbehalt wird nicht ausgewertet');
        assert.match(fn, /cm-filter-status-vorbehalt/,
            'die Auszeichnung des Vorbehalts fehlt');
    });
});
