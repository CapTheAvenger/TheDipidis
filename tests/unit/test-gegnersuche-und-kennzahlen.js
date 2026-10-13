/**
 * Die Gegnersuche der Deck-Analyse (Global) — AUSGEFUEHRT, nicht gegriffen.
 *
 * WARUM ES DIESE DATEI GIBT
 * -------------------------
 * Live gemessen am 07.09.2026 (Befunde A-F4.25 / A-F4.26): das Auswahlfeld
 * "Gegner-Matchup" blieb leer, und das Detail darunter erschien nie —
 * nicht einmal der "keine Daten"-Zweig. Zwei unabhaengige Ursachen:
 *
 *   1. js/app-current-meta-analysis.js las `window['matchupData_' + Deck]`.
 *      Diese Globals schreibt seit dem Umbau in js/app-meta-cards.js
 *      niemand mehr; die Daten liegen in `window._matchupRegistry`.
 *   2. #currentMetaMatchupDetails traegt `display: none` auf der
 *      GRUNDKLASSE (css/city-league.css:1219). Die Anzeigefunktion entfernte
 *      nur `d-none` — eine Klasse, die dort nie stand.
 *
 * Ein `assert.match` auf den Quelltext haette beides nicht gesehen: der
 * Text "matchupData_" stand da und sah richtig aus, und `remove('d-none')`
 * sieht wie eine Anzeige aus. Also wird der Code hier AUSGEFUEHRT.
 *
 * KEIN jsdom
 * ----------
 * Der Testschritt in .github/workflows/deploy-pages.yml installiert nur
 * papaparse. Der Ersatz unten ist absichtlich winzig — er kann genau das,
 * was die vier gepruefen Funktionen anfassen. Vorbild:
 * tests/unit/test-pocket-verhalten.js und
 * tests/unit/lib-tieflink-sandkasten.js.
 *
 * KEINE LIVEDATEN. Alle Eingaben setzt der Test selbst; die Sollwerte
 * folgen aus denselben gesetzten Zahlen. Deshalb steht diese Datei nicht
 * im Register von tests/unit/test-testdaten-wachhund.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'app-current-meta-analysis.js'), 'utf8');
const CSS_CL = fs.readFileSync(path.join(WURZEL, 'css', 'city-league.css'), 'utf8');

/** Quelltext ohne Kommentare — sonst faengt eine Zusicherung den Satz,
 *  der die Zusicherung begruendet. */
const CODE = QUELLE
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map(z => z.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');

/** Quelltext einer benannten Funktion per Klammerzaehlung herausschneiden. */
function ausschnitt(marke) {
    const start = QUELLE.indexOf(marke);
    assert.notEqual(start, -1, 'nicht gefunden in js/app-current-meta-analysis.js: ' + marke);
    let tiefe = 0;
    for (let j = QUELLE.indexOf('{', start); j < QUELLE.length; j++) {
        if (QUELLE[j] === '{') tiefe++;
        else if (QUELLE[j] === '}') {
            tiefe--;
            if (tiefe === 0) return QUELLE.slice(start, j + 1);
        }
    }
    assert.fail(marke + ': die Klammern gehen nicht auf');
}

// ── Der kleinste DOM, der traegt ─────────────────────────────────────

function element(id, klassen) {
    const k = new Set(klassen || []);
    return {
        id,
        value: '',
        innerHTML: '',
        textContent: '',
        style: {},
        classList: {
            add: (...c) => c.forEach(x => k.add(x)),
            remove: (...c) => c.forEach(x => k.delete(x)),
            contains: (c) => k.has(c),
        },
        _klassen: k,
    };
}

/**
 * Ist dieses Element fuer einen Besucher sichtbar?
 *
 * Zwei Regeln, beide aus dem echten Stylesheet gelesen, nicht abgeschrieben:
 *   - `.d-none { display: none !important; }` (css/ui-components.css)
 *   - `.current-meta-matchup-details { display: none; }` (css/city-league.css)
 * Der Inline-Stil schlaegt die zweite, aber nicht die erste.
 */
function sichtbar(el) {
    if (el._klassen.has('d-none')) return false;
    const inline = el.style.display;
    if (inline === 'none') return false;
    if (el.id === 'currentMetaMatchupDetails') {
        // Grundklasse versteckt; nur ein Inline-Stil holt es zurueck.
        return inline === 'block' || inline === 'flex' || inline === 'grid';
    }
    return true;
}

function sandkasten(opt) {
    opt = opt || {};
    const knoten = {
        currentMetaOpponentDropdown: element('currentMetaOpponentDropdown'),
        currentMetaMatchupDetails: element('currentMetaMatchupDetails',
            ['current-meta-matchup-details']),
        currentMetaOpponentSearch: element('currentMetaOpponentSearch'),
        currentMetaOpponentSelected: element('currentMetaOpponentSelected'),
    };
    const dok = { getElementById: (id) => knoten[id] || null };
    const fenster = {
        document: dok,
        _matchupRegistry: opt.registry || undefined,
        currentMetaMatchupData: opt.rohzeilen || undefined,
    };
    fenster.window = fenster;

    const kontext = {
        window: fenster,
        document: dok,
        console: { warn() {}, error() {}, log() {} },
        getLang: () => opt.sprache || 'de',
        t: (k) => k,
        stripExSuffix: (n) => String(n).replace(/\s+ex$/i, '').trim(),
        parseLocaleNumber: (v, f) => {
            const z = parseFloat(String(v == null ? '' : v).replace('%', '').replace(',', '.'));
            return Number.isFinite(z) ? z : (f === undefined ? 0 : f);
        },
        escapeHtml: (s) => String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        escapeJsStr: (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"),
        /* Wie js/app-utils.js: deutsche Schreibweise mit Komma. Sie ist
           der Grund, warum es _cmWinProzentText() gibt (Befund B3). */
        zahlLokal: (n, k) => {
            if (n == null || n === '') return '';
            const z = Number(n);
            if (!Number.isFinite(z)) return String(n);
            const txt = k == null ? String(z) : z.toFixed(k);
            return (opt.sprache === 'en') ? txt : txt.replace('.', ',');
        },
    };
    vm.createContext(kontext);
    vm.runInContext(
        /* Seit dem 08.09.2026 holt selectCurrentMetaOpponent() den Namen
           der Konvention zur Laufzeit aus js/win-rate-konvention.js. Die
           drei Helfer kommen aus DERSELBEN Datei — als Attrappe pruefte
           der Test einen Text, den die Seite so nie zeigt. */
        ausschnitt('function cmaQuotenFormel(id)') + '\n' +
        ausschnitt('function cmaQuotenName(id)') + '\n' +
        ausschnitt('function cmaMitQuote(text, id)') + '\n' +
        ausschnitt('function cmaQuotenHinweis(id)') + '\n' +
        ausschnitt('function _cmRegistrySchluessel(reg, name)') + '\n' +
        ausschnitt('function _cmWinProzentText(zahl, roh)') + '\n' +
        ausschnitt('function _cmGegnerLeerText(archetype, quelle)') + '\n' +
        ausschnitt('function currentMetaGegnerliste(archetype)') + '\n' +
        ausschnitt('function fuelleCurrentMetaGegnerauswahl(archetype)') + '\n' +
        ausschnitt('function selectCurrentMetaOpponent(optionEl, opponent)') + '\n',
        kontext, { filename: 'gegnersuche.js' });
    return { kontext, knoten, fenster };
}

/* Eine Registry, wie js/app-meta-cards.js sie aus
   data/limitless_online_decks_matchups.csv baut. Die Zahlen sind GESETZT,
   nicht abgelesen — die Sollwerte unten folgen aus genau diesen. */
const REGISTRY = {
    'Mega Excadrill': {
        'Dragapult': {
            opponent_deck: 'Dragapult', win_rate: '47,05%', win_rate_numeric: 47.05,
            record: '120 - 135 - 3', total_games: 258,
        },
        'Toucannon': {
            opponent_deck: 'Toucannon', win_rate: '61,00%', win_rate_numeric: 61,
            record: '61 - 39 - 0', total_games: 100,
        },
    },
    'Ceruledge': {
        'Dragapult': {
            opponent_deck: 'Dragapult', win_rate: '30,00%', win_rate_numeric: 30,
            record: '3 - 7 - 0', total_games: 10,
        },
    },
};

describe('A-F4.25 — die Gegnerliste kommt aus der Registry', () => {

    it('window.matchupData_* wird nirgends mehr gelesen', () => {
        /* Faengt einen Rueckfall auf die toten Globals. Sie werden im
           ganzen js/-Verzeichnis von KEINER Zeile mehr geschrieben — ein
           Leser davon liefert garantiert undefined. */
        assert.doesNotMatch(CODE, /window\[\s*['"]matchupData_/,
            'js/app-current-meta-analysis.js liest wieder window.matchupData_<Deck> — '
            + 'diese Globals setzt seit dem Umbau in js/app-meta-cards.js niemand mehr');
        assert.doesNotMatch(CODE, /['"]matchupData_['"]\s*\+/,
            'ein Variablenname wird wieder aus "matchupData_" zusammengesetzt');
    });

    it('fuellt das Auswahlfeld aus window._matchupRegistry', () => {
        const s = sandkasten({ registry: REGISTRY });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Mega Excadrill');
        assert.equal(erg.quelle, 'registry');
        // .join() statt deepEqual: die Liste stammt aus dem vm-Kontext,
        // ihr Array-Prototyp ist ein anderer und deepStrictEqual fiele
        // darueber, nicht ueber den Inhalt.
        assert.equal(erg.liste.map(m => m.opponent).join('|'), 'Dragapult|Toucannon',
            'beide Gegner der Registry, alphabetisch');
        const html = s.knoten.currentMetaOpponentDropdown.innerHTML;
        assert.equal((html.match(/class="opponent-option"/g) || []).length, 2);
        assert.match(html, /data-value="Dragapult"/);
        assert.match(html, /data-value="Toucannon"/);
    });

    it('findet den Archetyp auch mit angehaengtem "Ex"', () => {
        // Limitless fuehrt "Ceruledge", das Auswahlfeld kennt "Ceruledge Ex".
        const s = sandkasten({ registry: REGISTRY });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Ceruledge Ex');
        assert.equal(erg.liste.length, 1);
        assert.equal(erg.liste[0].opponent, 'Dragapult');
    });

    it('faellt ohne Registry auf dieselbe CSV zurueck, nicht auf nichts', () => {
        /* window.currentMetaMatchupData sind die Rohzeilen derselben
           Datei, geladen von loadCurrentMetaAnalysis(). Kein dritter
           Zahlenweg — dieselben Zahlen, andere Form. */
        const s = sandkasten({
            rohzeilen: [
                { deck_name: 'Mega Excadrill', opponent: 'Toucannon', win_rate: '61,00', record: '61 - 39 - 0', total_games: '100' },
                { deck_name: 'Mega Excadrill', opponent: 'Dragapult', win_rate: '47,05', record: '120 - 135 - 3', total_games: '258' },
                { deck_name: 'Anderes Deck',   opponent: 'Toucannon', win_rate: '10,00', record: '1 - 9 - 0', total_games: '10' },
            ],
        });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Mega Excadrill');
        assert.equal(erg.quelle, 'csv');
        assert.equal(erg.liste.map(m => m.opponent).join('|'), 'Dragapult|Toucannon');
        // Die Zahl kommt unveraendert aus der Zeile; die ANZEIGEFORM
        // baut seit Befund B3 _cmWinProzentText() aus win_rate_numeric —
        // beide Wege schreiben sie deshalb gleich (deutsch: Komma,
        // schmales Leerzeichen vor dem Prozentzeichen).
        assert.equal(erg.liste[0].win_rate_numeric, 47.05);
        assert.equal(erg.liste[0].win_rate, '47,05 %');
        assert.equal(erg.liste[0].total_games, 258);
        assert.equal(erg.liste[0].record, '120 - 135 - 3');
    });

    it('die Registry gewinnt, wenn beide da sind', () => {
        const s = sandkasten({
            registry: REGISTRY,
            rohzeilen: [{ deck_name: 'Mega Excadrill', opponent: 'Nur in der CSV', win_rate: '50', record: '1 - 1 - 0', total_games: '2' }],
        });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Mega Excadrill');
        assert.equal(erg.quelle, 'registry');
        assert.ok(!erg.liste.some(m => m.opponent === 'Nur in der CSV'));
    });
});

describe('A-F4.26 — nichts faellt still aus', () => {

    it('fehlt der Archetyp, steht das mit Namen und Datei da', () => {
        /* 36 von 136 Decks in data/limitless_online_decks.csv haben keine
           einzige Zeile in der Matchup-Datei. Ein leeres Feld sieht aus
           wie ein Ladefehler. */
        /* MIT Rohzeilen: nur dann ist "das Deck kommt in der Datei nicht
           vor" ueberhaupt belegt. Ohne sie ist der ehrliche Zustand
           'nicht-geladen' — siehe Befund B2 weiter unten. */
        const s = sandkasten({
            registry: REGISTRY,
            rohzeilen: [
                { deck_name: 'Mega Excadrill', opponent: 'Toucannon', win_rate: '61,00', record: '61 - 39 - 0', total_games: '100' },
            ],
        });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Feraligatr');
        assert.equal(erg.liste.length, 0);
        assert.equal(erg.quelle, 'keine');
        const html = s.knoten.currentMetaOpponentDropdown.innerHTML;
        assert.match(html, /Feraligatr/, 'der Deckname fehlt in der Meldung');
        assert.match(html, /limitless_online_decks_matchups\.csv/,
            'die Meldung nennt die Datei nicht, in der nachgesehen wurde');
        assert.match(html, /kein Ladefehler/,
            'die Meldung sagt nicht, dass es KEIN Fehler ist');
    });

    it('die Meldung ist wirklich sichtbar, nicht nur im DOM', () => {
        const s = sandkasten({ registry: REGISTRY });
        s.kontext.fuelleCurrentMetaGegnerauswahl('Feraligatr');
        const det = s.knoten.currentMetaMatchupDetails;
        assert.match(det.innerHTML, /Feraligatr/);
        assert.ok(sichtbar(det),
            '#currentMetaMatchupDetails traegt display:none aus der Grundklasse — '
            + 'ohne Inline-Stil bleibt die Meldung unsichtbar');
    });

    it('das Matchup-Detail erscheint nach einer Auswahl', () => {
        /* DIE MUTATION, DIE HIER ROT WIRD: `detailsEl.style.display`
           wieder entfernen. classList.remove('d-none') allein reicht
           nicht — die Klasse stand dort nie. */
        const s = sandkasten({ registry: REGISTRY });
        s.kontext.fuelleCurrentMetaGegnerauswahl('Mega Excadrill');
        const det = s.knoten.currentMetaMatchupDetails;
        assert.ok(!sichtbar(det), 'vor der Auswahl darf noch nichts dastehen');
        s.kontext.selectCurrentMetaOpponent(null, 'Dragapult');
        assert.ok(sichtbar(det), 'nach der Auswahl bleibt das Detail unsichtbar');
        assert.match(det.innerHTML, /47,05 %/, 'die Win % der Matchup fehlt');
        assert.match(det.innerHTML, /120 - 135 - 3/, 'die Bilanz fehlt');
        assert.match(det.innerHTML, /258/, 'die Partienzahl fehlt');
    });

    it('css/city-league.css versteckt den Behaelter wirklich — die Annahme oben ist gemessen', () => {
        /* Ohne diese Zusicherung koennte die Regel eines Tages
           verschwinden und der Test oben pruefte etwas Erfundenes. */
        const regel = CSS_CL.match(/\.current-meta-matchup-details\s*\{[^}]*\}/);
        assert.ok(regel, '.current-meta-matchup-details gibt es nicht mehr in css/city-league.css');
        assert.match(regel[0], /display:\s*none/,
            'die Grundklasse versteckt nicht mehr — dann darf der Inline-Stil weg');
    });

    it('das Detail traegt Nenner und Quelle', () => {
        // Befund H6: eine Quote ohne Grundgesamtheit.
        const s = sandkasten({ registry: REGISTRY });
        s.kontext.fuelleCurrentMetaGegnerauswahl('Mega Excadrill');
        s.kontext.selectCurrentMetaOpponent(null, 'Dragapult');
        const html = s.knoten.currentMetaMatchupDetails.innerHTML;
        assert.match(html, /limitless_online_decks_matchups\.csv/, 'Quelldatei fehlt');
        assert.match(html, /Win %/, 'die Limitless-Bezeichnung "Win %" fehlt');
        assert.match(html, /258 Matches/, 'der Nenner fehlt');
    });

    it('ein Deckwechsel laesst kein fremdes Detail stehen', () => {
        const s = sandkasten({ registry: REGISTRY });
        s.kontext.fuelleCurrentMetaGegnerauswahl('Mega Excadrill');
        s.kontext.selectCurrentMetaOpponent(null, 'Toucannon');
        assert.match(s.knoten.currentMetaMatchupDetails.innerHTML, /Toucannon|61,00 %/);
        s.kontext.fuelleCurrentMetaGegnerauswahl('Ceruledge');
        assert.ok(!sichtbar(s.knoten.currentMetaMatchupDetails),
            'das Detail des vorigen Decks steht noch da');
        assert.equal(s.knoten.currentMetaOpponentSearch.value, '',
            'das Suchfeld traegt noch den alten Gegner');
    });

    it('unbekannter Gegner: es steht etwas da, nicht nichts', () => {
        const s = sandkasten({ registry: REGISTRY });
        s.kontext.fuelleCurrentMetaGegnerauswahl('Mega Excadrill');
        s.kontext.selectCurrentMetaOpponent(null, 'Gibt es nicht');
        const det = s.knoten.currentMetaMatchupDetails;
        assert.ok(sichtbar(det));
        assert.match(det.innerHTML, /cm\.noMatchupData/);
    });

    it('Deck- und Gegnernamen werden maskiert', () => {
        const s = sandkasten({
            registry: { 'X': { '<img src=x onerror=alert(1)>': { win_rate: '50%', win_rate_numeric: 50, record: '1 - 1 - 0', total_games: 2 } } },
        });
        s.kontext.fuelleCurrentMetaGegnerauswahl('X');
        const html = s.knoten.currentMetaOpponentDropdown.innerHTML;
        assert.ok(html.indexOf('<img') === -1, 'der Gegnername kommt unmaskiert in den Baum');
        assert.match(html, /&lt;img/);
    });

    it('die Auswahl wird auf jedem Weg gefuellt, nicht erst hinter zwei return', () => {
        /* Der Aufruf stand frueher am ENDE von renderCurrentMetaMatchups,
           hinter dem CSV-Ersatzweg und hinter dem Kein-Daten-Zweig. Fuer
           jedes Deck, das nicht in der vorgeladenen Scraper-HTML steht,
           wurde er nie erreicht. */
        const rumpf = ausschnitt('function renderCurrentMetaMatchups(archetype)');
        const posAufruf = rumpf.indexOf('fuelleCurrentMetaGegnerauswahl(');
        assert.ok(posAufruf >= 0, 'die Gegnerauswahl wird gar nicht mehr gefuellt');
        const posErstesReturn = rumpf.indexOf('return;');
        assert.ok(posErstesReturn === -1 || posAufruf < posErstesReturn,
            'der Aufruf steht wieder hinter einem vorzeitigen return');
    });

    it('ein Deck ohne Matchups versteckt den Abschnitt nicht mehr stumm', () => {
        const rumpf = ausschnitt('function renderCurrentMetaMatchups(archetype)');
        const zweig = rumpf.slice(rumpf.indexOf('Keine Matchup-Daten fuer'));
        const bisReturn = zweig.slice(0, zweig.indexOf('return;'));
        assert.doesNotMatch(bisReturn, /matchupsSection\.classList\.add\('d-none'\)/,
            'der Abschnitt wird wieder stumm versteckt');
        assert.match(bisReturn, /matchupsSection\.classList\.remove\('d-none'\)/);
        assert.match(bisReturn, /limitless_online_decks_matchups\.csv/,
            'die Ueberschrift nennt die Datei nicht, in der nachgesehen wurde');
    });
});

// ── Abnahme 07.09.2026: B2, B3 und die Mutationen M5/M7 ─────────────

describe('B2 — ein Ladefehler wird nicht als Befund über die Datei ausgegeben', () => {

    /* DER BEFUND. currentMetaGegnerliste() gab fuer JEDEN leeren Ausgang
       'keine' zurueck, und darunter stand: "Für 'Dragapult' stehen in
       data/limitless_online_decks_matchups.csv keine Gegner-Paarungen."
       Ausgefuehrt ohne Registry UND ohne window.currentMetaMatchupData
       war das eine nachweislich falsche Aussage — die Datei fuehrt fuer
       Dragapult 20 Paarungen. */

    it('nichts geladen: der Zustand heisst "nicht-geladen" und sagt genau das', () => {
        const s = sandkasten({});   // keine Registry, keine Rohzeilen
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Dragapult');
        assert.equal(erg.quelle, 'nicht-geladen');
        const html = s.knoten.currentMetaOpponentDropdown.innerHTML;
        assert.match(html, /noch nicht geladen/,
            'der Ladezustand wird nicht als solcher benannt');
        assert.match(html, /Dragapult/, 'der Deckname fehlt');
        assert.doesNotMatch(html, /keine Gegner-Matchups/,
            'es steht wieder eine Aussage über die Datei da, wo nur ein Ladezustand belegt ist');
        assert.doesNotMatch(html, /kein Ladefehler/,
            'ausgerechnet beim Ladefehler steht "es ist kein Ladefehler"');
    });

    it('geladen, aber leer: auch das ist nicht "das Deck kommt nicht vor"', () => {
        const s = sandkasten({ rohzeilen: [] });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Dragapult');
        assert.equal(erg.quelle, 'leer-geladen');
        const html = s.knoten.currentMetaOpponentDropdown.innerHTML;
        assert.match(html, /keine einzige Zeile/,
            'eine leere Datei wird als "Deck nicht enthalten" ausgegeben');
    });

    it('geladen und das Deck fehlt wirklich: dann darf der alte Satz stehen', () => {
        const s = sandkasten({
            rohzeilen: [
                { deck_name: 'Mega Excadrill', opponent: 'Toucannon', win_rate: '61,00', record: '61 - 39 - 0', total_games: '100' },
            ],
        });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Dragapult');
        assert.equal(erg.quelle, 'keine');
        const html = s.knoten.currentMetaOpponentDropdown.innerHTML;
        assert.match(html, /keine Gegner-Matchups/);
        assert.match(html, /kein Ladefehler/);
    });

    it('die vier Zustände sind wirklich vier verschiedene Sätze', () => {
        const de = ['registry', 'csv', 'keine', 'leer-geladen', 'nicht-geladen'];
        const s = sandkasten({});
        const texte = de.map(q => s.kontext._cmGegnerLeerText('Dragapult', q));
        // 'registry' und 'csv' fallen in den Standardfall — leer werden sie nie.
        const leerFaelle = texte.slice(2);
        assert.equal(new Set(leerFaelle).size, 3,
            'zwei der drei leeren Zustände bekommen denselben Satz');
    });
});

describe('B3 — die Win % einer Matchup hat EINE Schreibweise', () => {

    /* DER BEFUND. Registry-Weg: "68.73%" (Punkt, aus wrNum.toFixed(2)
       in js/app-meta-cards.js). CSV-Rueckfall: "68,73%" (Komma, aus der
       Datei). Beide landeten unveraendert in derselben Zelle. */

    it('beide Wege schreiben dieselbe Zahl gleich', () => {
        const reg = sandkasten({
            registry: { 'Dragapult': { 'Toucannon': {
                opponent_deck: 'Toucannon', win_rate: '68.73%', win_rate_numeric: 68.73,
                record: '189 - 86 - 5', total_games: 280 } } },
        });
        const csv = sandkasten({
            rohzeilen: [{ deck_name: 'Dragapult', opponent: 'Toucannon',
                win_rate: '68,73', record: '189 - 86 - 5', total_games: '280' }],
        });
        const a = reg.kontext.fuelleCurrentMetaGegnerauswahl('Dragapult');
        const b = csv.kontext.fuelleCurrentMetaGegnerauswahl('Dragapult');
        assert.equal(a.quelle, 'registry');
        assert.equal(b.quelle, 'csv');
        assert.equal(a.liste[0].win_rate, b.liste[0].win_rate,
            'derselbe Wert steht auf zwei Wegen verschieden da');
        assert.equal(a.liste[0].win_rate, '68,73 %',
            'im deutschen Text steht ein Dezimalpunkt');
        assert.doesNotMatch(a.liste[0].win_rate, /\./,
            'der Punkt aus dem Registry-Weg ist zurück');
    });

    it('englisch bleibt beim Punkt', () => {
        const s = sandkasten({
            sprache: 'en',
            rohzeilen: [{ deck_name: 'Dragapult', opponent: 'Toucannon',
                win_rate: '68,73', record: '189 - 86 - 5', total_games: '280' }],
        });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Dragapult');
        assert.equal(erg.liste[0].win_rate, '68.73%');
    });

    it('ohne brauchbare Zahl wird nichts erfunden', () => {
        const s = sandkasten({});
        assert.equal(s.kontext._cmWinProzentText(NaN, 'k. A.'), 'k. A.');
        assert.equal(s.kontext._cmWinProzentText(null, ''), '');
    });
});

describe('M5/M7 — Groß-/Kleinschreibung und das "ex" am Namen, auf BEIDEN Wegen', () => {

    /* Die Tierliste schreibt Decknamen klein, das Auswahlfeld führt
       "Ceruledge Ex", Limitless führt "Ceruledge". Bis zur Abnahme am
       07.09.2026 war keiner der beiden Fälle ausgeführt geprüft — die
       Mutationen M5 (Toleranz raus) und M7 (Ex-Suffix nur in der
       Registry) überlebten deshalb. */

    const REG_EX = { 'Ceruledge': { 'Dragapult': {
        opponent_deck: 'Dragapult', win_rate: '30.00%', win_rate_numeric: 30,
        record: '3 - 7 - 0', total_games: 10 } } };
    const CSV_EX = [{ deck_name: 'Ceruledge', opponent: 'Dragapult',
        win_rate: '30,00', record: '3 - 7 - 0', total_games: '10' }];

    it('Registry-Weg: klein geschrieben findet dasselbe Deck', () => {
        const s = sandkasten({ registry: REG_EX });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('ceruledge');
        assert.equal(erg.quelle, 'registry');
        assert.equal(erg.liste.length, 1);
    });

    it('CSV-Weg: klein geschrieben findet dasselbe Deck', () => {
        const s = sandkasten({ rohzeilen: CSV_EX });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('CERULEDGE');
        assert.equal(erg.quelle, 'csv');
        assert.equal(erg.liste.length, 1);
    });

    it('Registry-Weg: "Ceruledge Ex" findet "Ceruledge"', () => {
        const s = sandkasten({ registry: REG_EX });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Ceruledge Ex');
        assert.equal(erg.quelle, 'registry');
        assert.equal(erg.liste.length, 1);
    });

    it('CSV-Weg: "Ceruledge Ex" findet ebenfalls "Ceruledge"', () => {
        const s = sandkasten({ rohzeilen: CSV_EX });
        const erg = s.kontext.fuelleCurrentMetaGegnerauswahl('Ceruledge Ex');
        assert.equal(erg.quelle, 'csv',
            'der Ex-Rückfall greift nur in der Registry — genau Mutation M7');
        assert.equal(erg.liste.length, 1);
        assert.equal(erg.liste[0].opponent, 'Dragapult');
    });

    it('ein wirklich fremder Name findet auch nichts', () => {
        /* Ohne diese Gegenprobe wäre eine Suche, die ALLES findet, grün. */
        const s = sandkasten({ rohzeilen: CSV_EX });
        assert.equal(s.kontext.fuelleCurrentMetaGegnerauswahl('Toucannon').liste.length, 0);
    });
});
