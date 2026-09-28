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
const vm = require('vm');
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

describe('UI-44 — fehlende Major-Daten stehen am Knopf "Major-Decks", nicht als Banner unter "Alle"', () => {
    /* Bis 28.09.2026 schrieb die Statuszeile unter "Alle" einen orangen
       Satz ("… gibt es aber noch keine Major-Daten, hier steht also genau
       dasselbe wie unter Limitless Decks"). Hausi (Video-Review 28.09.,
       19:48–20:36): Banner weg, stattdessen "(noch keine im aktuellen
       Format)" unter dem Major-Knopf. Geprueft wird AUSGEFUEHRT: die
       beiden Funktionen laufen in einem vm-Kontext gegen ein Mini-DOM. */
    const I18N_DE = I18N.slice(I18N.lastIndexOf("'currentMeta.majorNochKeine'") - 20000);
    const deText = (k) => {
        const m = I18N_DE.match(new RegExp("'" + k.replace(/\./g, '\\.') + "':\\s*'([^']*)'"));
        return m ? m[1] : k;
    };
    function lauf(keinMajor, format) {
        const code = extrahiere(CM, 'let _cmKeinMajorFormat = null;',
                'async function setCurrentMetaFormatFilter(format) {', 'Hinweis und Statuszeile')
            .replace('async function setCurrentMetaFormatFilter(format) {', '');
        const klassen = new Set();
        const status = { textContent: '', classList: {
            add: (c) => klassen.add(c), remove: (c) => klassen.delete(c) } };
        const hinweis = { textContent: 'alt', hidden: false };
        const ctx = {
            t: deText,
            document: { getElementById: (id) => ({ currentMetaFilterStatus: status,
                currentMetaMajorHinweis: hinweis })[id] || null },
        };
        vm.runInNewContext(code + '\n_cmKeinMajorFormat = ' + JSON.stringify(keinMajor)
            + ';\nupdateCurrentMetaFilterStatusLabel(' + JSON.stringify(format) + ');', ctx);
        return { status, hinweis, klassen };
    }

    it('ohne Major im Format: Zusatz am Knopf, kein Banner unter "Alle"', () => {
        const r = lauf('TEF-30C', 'all');
        assert.equal(r.hinweis.hidden, false);
        assert.equal(r.hinweis.textContent, '(noch keine im aktuellen Format)');
        assert.equal(r.klassen.has('cm-filter-status-vorbehalt'), false, 'der orange Banner ist wieder da');
        assert.doesNotMatch(r.status.textContent, /Major/, `Statuszeile: ${r.status.textContent}`);
    });

    it('der Zusatz gilt bei jedem Filter — er beschreibt die Daten, nicht die Auswahl', () => {
        assert.equal(lauf('TEF-30C', 'live').hinweis.hidden, false);
    });

    it('mit Major im Format: kein Zusatz', () => {
        const r = lauf(null, 'all');
        assert.equal(r.hinweis.hidden, true);
        assert.equal(r.hinweis.textContent, '');
    });

    it('der Filter ermittelt den Leerstand bei jedem Wechsel', () => {
        const block = extrahiere(CM, 'async function setCurrentMetaFormatFilter(format) {',
            'Respect value already set by populateCurrentMetaDeckSelect', 'Formatfilter');
        assert.match(block, /kein-major-im-format/);
        assert.doesNotMatch(block, /if \(format === 'all'\) \{\s*const grund/,
            'der Leerstand wird wieder nur bei "Alle" ermittelt');
    });

    it('der Hinweistext steht in beiden Sprachen, der alte Bannertext in keiner', () => {
        assert.equal((I18N.match(/'currentMeta\.majorNochKeine':/g) || []).length, 2);
        assert.doesNotMatch(I18N, /'currentMeta\.alleWieLive':/);
    });
});
