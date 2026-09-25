/**
 * Ein Sandkasten fuer den City-League-Reiter aus js/app-city-league.js.
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Die Befunde B4 (worauf die Ansicht beruht) und B5 (drei gerechnete,
 * aber nie gezeigte Rubriken) sind Aussagen darueber, was am Ende
 * WIRKLICH auf der Seite steht. Ein Quelltext-Grep sieht die
 * Zeichenketten und beantwortet die Frage nicht: gezeigt wird nur, was
 * eine Bedingung passieren laesst. Also wird renderCityLeagueTable()
 * aus der Datei geschnitten und ausgefuehrt.
 *
 * KEIN jsdom (der Testschritt in deploy-pages.yml installiert nur
 * papaparse), KEINE Live-Daten: die Zeilen setzt der Test.
 *
 * Die Datei heisst bewusst NICHT test-*.js — scripts/run-js-unit-tests.sh
 * fuehrt nur `tests/unit/test-*.js` aus.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'app-city-league.js'), 'utf8');

/** Eine Funktionsdeklaration per Namen herausschneiden. */
function funktion(name) {
    const re = new RegExp(`(^|\\n)\\s*function\\s+${name}\\s*\\(`);
    const m = re.exec(QUELLE);
    if (!m) throw new Error('Funktion nicht gefunden: ' + name);
    const start = QUELLE.indexOf('function', m.index);
    let tiefe = 0;
    for (let i = QUELLE.indexOf('{', start); i < QUELLE.length; i++) {
        if (QUELLE[i] === '{') tiefe++;
        else if (QUELLE[i] === '}') { tiefe--; if (tiefe === 0) return QUELLE.slice(start, i + 1); }
    }
    throw new Error(name + ': die Klammern gehen nicht auf');
}

/** Eine einzelne `const`/`let`-Zeile per Namen herausschneiden. */
function zeile(name) {
    const re = new RegExp(`(^|\\n)\\s*(const|let)\\s+${name}\\s*=[^\\n]*`);
    const m = re.exec(QUELLE);
    if (!m) throw new Error('Deklaration nicht gefunden: ' + name);
    return m[0].trim();
}

const GESCHNITTEN = [
    'CL_MINDEST_ANTEIL_GROESSTER', '_cityLeagueSortCache', '_cityLeagueSortDataRef'
];
const FUNKTIONEN = [
    '_komma', '_kommaText', '_rang',
    'cityLeagueTurnierHerkunft', 'cityLeagueHerkunftSatz',
    'cityLeagueRubrikNamen', 'cityLeagueVergleichLeerHinweis',
    /* Die Siegerliste der japanischen Majors (25.09.2026) haengt
       renderCityLeagueTable() in dieselbe Ausgabe — ohne sie hier
       laeuft der Sandkasten in ein ReferenceError. */
    'cityLeagueSiegerListe', 'cityLeagueSiegerHtml',
    'getCityLeagueSortedSections', 'renderCityLeagueTable'
];

/**
 * Den Reiter einmal rendern.
 *
 * @param {Object} o
 * @param {Array<Object>} o.vergleich  Zeilen der Vergleichsdatei
 * @param {Array<Object>} o.archetypen Zeilen der Archetyp-Datei
 * @param {number} o.turniere
 * @param {string} o.zeitraum
 * @param {string} o.sprache 'de' | 'en'
 * @returns {{html:string, kasten:Object}}
 */
function rendern(o) {
    const sprache = o.sprache || 'de';
    const inhalt = {
        _innerHTML: '',
        set innerHTML(v) { this._innerHTML = String(v); },
        get innerHTML() { return this._innerHTML; }
    };

    const fenster = {
        cityLeagueArchetypesData: o.archetypen || [],
        currentCityLeagueFormat: 'past'
    };
    const kasten = {
        Math, Number, String, Object, Array, Map, Set, JSON, Date, RegExp,
        parseInt, parseFloat, isNaN, isFinite,
        console: { warn() {}, info() {}, log() {} },
        window: fenster,
        document: {
            getElementById: (id) => (id === 'cityLeagueContent' ? inhalt : null)
        },
        cityLeagueData: o.vergleich || [],
        getLang: () => sprache,
        t: (k) => k,
        escapeHtml: (x) => String(x == null ? '' : x)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;'),
        // escapeHtmlAttr ist im Haus derselbe Aufruf wie escapeHtml
        // (js/app-utils.js:359 setzt window.escapeHtml = escapeHtmlAttr).
        // Seit dem 07.09.2026 steckt jede escapeJsStr in einem
        // HTML-Attribut zusaetzlich darin — der HTML-Zerteiler laeuft vor
        // dem JS-Zerteiler. Ohne die Attrappe wirft der Sandkasten
        // ReferenceError.
        escapeHtmlAttr: (x) => String(x == null ? '' : x)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        escapeJsStr: (x) => String(x == null ? '' : x).replace(/'/g, "\\'"),
        parseLocaleNumber: (v, s) => {
            const n = parseFloat(String(v).replace(',', '.'));
            return Number.isFinite(n) ? n : (s === undefined ? 0 : s);
        },
        // Alles, was nach dem Zusammenbau des HTML kommt, interessiert hier
        // nicht — es haengt am fertigen Baum, nicht an der Zeichenkette.
        groupByMainPokemon: () => [],
        renderFullComparisonTable: () => {},
        renderCombinedTable: () => {},
        ensureCityLeagueSearchFilterBinding: () => {},
        renderMetaChart: () => {},
        enrichCityLeagueDataWithPlacementStats: (x) => x
    };
    kasten.window.parseLocaleNumber = kasten.parseLocaleNumber;
    vm.createContext(kasten);

    const code = GESCHNITTEN.map(zeile).join('\n') + '\n'
        + FUNKTIONEN.map(funktion).join('\n') + '\n'
        + FUNKTIONEN.map(n => `globalThis.${n} = ${n};`).join('\n');
    vm.runInContext(code, kasten, { filename: 'js/app-city-league.js' });

    kasten.renderCityLeagueTable(
        o.turniere === undefined ? 1 : o.turniere,
        o.zeitraum === undefined ? '' : o.zeitraum,
        o.herkunft === undefined ? null : o.herkunft
    );
    return { html: inhalt.innerHTML, kasten };
}

/** Nur die reinen Funktionen, ohne zu rendern. */
function nurFunktionen(sprache) {
    const { kasten } = rendern({ vergleich: [], archetypen: [], sprache: sprache || 'de' });
    return kasten;
}

/** Die Ueberschriften <h2 class="city-league-info-table-title"> aus dem HTML. */
function ueberschriften(html) {
    return [...String(html).matchAll(
        /<h2 class="city-league-info-table-title">([\s\S]*?)<\/h2>/g)].map(m => m[1].trim());
}

/** Die Archetyp-Namen aus den Zeilen einer Tabelle mit dieser Ueberschrift. */
function zeilenUnter(html, titel) {
    const s = String(html);
    const ab = s.indexOf('>' + titel + '</h2>');
    if (ab < 0) return null;
    const ende = s.indexOf('</table>', ab);
    const block = s.slice(ab, ende < 0 ? s.length : ende);
    return [...block.matchAll(/class="archetype-jump-link">([\s\S]*?)<\/a>/g)]
        .map(m => m[1].replace(/<[^>]*>/g, '').trim());
}

module.exports = { WURZEL, QUELLE, funktion, zeile, rendern, nurFunktionen,
                   ueberschriften, zeilenUnter };
