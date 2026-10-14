/**
 * UI-140 (14.10.2026, Hausi am iPhone, installierte App, Dunkelmodus):
 * „man kann gar keine Zahlen lesen und die Seite nicht mehr verlassen“.
 *
 * GEMESSEN VOR DER AENDERUNG (Playwright, 390 px und 1280 px, beide Modi):
 *   - Zeilenfarben fest auf drei hellen Hex-Werten, Schrift kippte mit dem
 *     Modus: Kontrast der Zahlen im Dunkeln 1,02–1,08:1; Null-Zellen 1,36:1
 *     in BEIDEN Modi.
 *   - Dialog mittig mit max-height 96vh: in der App (viewport-fit=cover)
 *     lag der Kopf samt x unter der Statusleiste.
 *   - `table thead, table tbody { display: table }` (css/styles.css) machte
 *     Kopf und Rumpf zu zwei Tabellen: th 150 px, td darunter 94 px, der
 *     Name „Team Rocket's Watchtower“ lief in die Zahlen (nowrap aus der
 *     Pauschalregel `.tab-content table`).
 *   - Die Abschnittszeile klebte mit festen 38 px unter einem 54 px hohen
 *     Kopf — beim Scrollen 16 px verdeckt.
 *
 * ZUSICHERUNG: (1) der Block in css/city-league.css traegt keinen
 * Hex-/rgb-Farbwert mehr, nur Tokens; (2) der Ausstieg aus den
 * Pauschalregeln steht mit ID-Spezifitaet da (display:table, Kopf- und
 * Rumpfgruppe, white-space normal); (3) der Dialog ist oben verankert, misst
 * sich am dvh und den Safe-Areas; (4) Escape schliesst — die Funktion wird
 * AUSGEFUEHRT, nicht nur gesucht; (5) die Kopfhoehe wird gemessen und als
 * --three-way-head-h gesetzt, die Abschnittszeile liest sie.
 * Jede Textregel hat ihre Verfaelschungsprobe unten.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const CSS_ROH = lies('css/city-league.css');
const CSS = ohneKommentare(CSS_ROH);
assert.ok(CSS.length > CSS_ROH.length * 0.3, 'das Ausschneiden hat zu viel entfernt (CSS)');

/* Der Block: von der ersten #threeWayCompareModal-Regel bis zur naechsten
   fremden Regel nach dem Handy-Block. */
function dreiwegeBlock(css) {
    const von = css.indexOf('#threeWayCompareModal {');
    assert.ok(von >= 0, 'Block nicht gefunden');
    const bis = css.indexOf('.date-range-container.is-ein-tag', von);
    assert.ok(bis > von, 'Blockende nicht gefunden');
    return css.slice(von, bis);
}
const BLOCK = dreiwegeBlock(CSS);

/* Die Regel zu GENAU diesem Selektor — am Zeilenanfang, sonst traefe
   `.three-way-compare-table th.x` auch die ID-Regel, die ihn enthaelt. */
function regel(css, selektor) {
    const re = new RegExp('(^|\\n)' + selektor.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&') + ' \\{');
    const m = re.exec(css);
    if (!m) return null;
    const i = m.index + m[1].length;
    return css.slice(i, css.indexOf('}', i));
}

/* Die fuenf Textregeln als Funktionen, damit die Verfaelschungsprobe sie
   gegen einen verfaelschten Text halten kann. */
const pruefungen = {
    nurTokens: (block) => !/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(block.replace(/rgba\(0,\s*0,\s*0,\s*0\.\d+\)/g, '')),
    ausstiegTabelle: (block) => {
        const r = regel(block, '#threeWayCompareModal table.three-way-compare-table');
        return !!r && /display:\s*table;/.test(r) && /white-space:\s*normal;/.test(r);
    },
    kopfUndRumpf: (block) =>
        /#threeWayCompareModal table\.three-way-compare-table thead \{[^}]*display:\s*table-header-group/.test(block)
        && /#threeWayCompareModal table\.three-way-compare-table tbody \{[^}]*display:\s*table-row-group/.test(block),
    obenVerankert: (block) => {
        const m = regel(block, '#threeWayCompareModal');
        const d = regel(block, '.three-way-compare-dialog');
        return !!m && !!d && /align-items:\s*flex-start/.test(m)
            && /env\(safe-area-inset-top/.test(m)
            && /100dvh/.test(d) && /env\(safe-area-inset-top/.test(d) && !/96vh/.test(d);
    },
    abschnittLiestKopfhoehe: (block) => {
        const r = regel(block, '.three-way-compare-table th.three-way-section-th');
        return !!r && /top:\s*var\(--three-way-head-h/.test(r);
    },
};

describe('UI-140: der 3-Wege-Vergleich ist in beiden Modi lesbar', () => {
    for (const [name, f] of Object.entries(pruefungen)) {
        it(`css: ${name}`, () => assert.ok(f(BLOCK), name));
    }

    it('Verfaelschungsprobe: jede Textregel beisst', () => {
        const kaputt = {
            nurTokens: BLOCK.replace('var(--tint-ok)', '#dcfce7'),
            ausstiegTabelle: BLOCK.replace(/(#threeWayCompareModal table\.three-way-compare-table \{[^}]*)white-space:\s*normal;/, '$1'),
            kopfUndRumpf: BLOCK.replace('display: table-header-group', 'display: table'),
            obenVerankert: BLOCK.replace('align-items: flex-start', 'align-items: center'),
            abschnittLiestKopfhoehe: BLOCK.replace('top: var(--three-way-head-h, 54px)', 'top: 38px'),
        };
        for (const [name, text] of Object.entries(kaputt)) {
            assert.notEqual(text, BLOCK, `Verfaelschung von ${name} hat nichts geaendert`);
            assert.ok(!pruefungen[name](text), `${name} bleibt auf dem verfaelschten Text gruen`);
        }
        // und ein Kommentar, der die Regel nur erwaehnt, zaehlt nicht
        const nurKommentar = BLOCK.replace('align-items: flex-start;', '/* align-items: flex-start; */');
        assert.ok(!pruefungen.obenVerankert(ohneKommentare(nurKommentar)));
    });
});

/* ── Verhalten: Escape und die gemessene Kopfhoehe ─────────────────────── */
function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(treffer.index, i + 1); }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}

function knoten(extra = {}) {
    const k = {
        style: { setProperty(n, v) { k.style[n] = v; } }, className: '', _hidden: false,
        classList: { add(c) { k.className += ' ' + c; }, remove(c) { k.className = k.className.replace(c, ''); } },
        focus() { k.fokussiert = true; },
        ...extra,
    };
    return k;
}

function baueSandkasten() {
    const quelle = lies('js/current-meta-quickref.js');
    const schliessen = schneideFunktion(quelle, 'closeThreeWayCompare');
    const escape = schneideFunktion(quelle, '_threeWayEscape');
    // nur das Ende von openThreeWayCompare: ab „const body = document.getElementById('threeWayCompareBody')“
    const oeffnen = schneideFunktion(quelle, 'openThreeWayCompare');
    const schwanz = oeffnen.slice(oeffnen.indexOf("const body = document.getElementById('threeWayCompareBody')"));
    assert.ok(schwanz.length > 100, 'Ende von openThreeWayCompare nicht gefunden');

    const hoerer = {};
    const tabelle = knoten({ tHead: { offsetHeight: 54 } });
    const close = knoten();
    const body = knoten();
    const modal = knoten({
        querySelector: (sel) => sel === '.three-way-compare-close' ? close : sel === '.three-way-compare-table' ? tabelle : null,
    });
    const sandbox = {
        window: { HintergrundSperre: { gesperrt: [], sperren(k) { this.gesperrt.push(k); }, freigeben(k) { this.gesperrt = this.gesperrt.filter(x => x !== k); } } },
        document: {
            getElementById: (id) => ({ threeWayCompareBody: body, threeWayCompareModal: modal })[id] || null,
            addEventListener: (typ, f, capture) => { hoerer[typ] = { f, capture }; },
            removeEventListener: (typ) => { delete hoerer[typ]; },
        },
        console: { log() {}, warn() {}, error() {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(`${escape}\n${schliessen}\nfunction zeigeEnde(html) {\n${schwanz}\nthis.zeigeEnde = zeigeEnde; this.closeThreeWayCompare = closeThreeWayCompare;`, sandbox);
    return { sandbox, hoerer, tabelle, close, modal, body };
}

describe('UI-140: Verhalten, ausgefuehrt', () => {
    it('Escape schliesst den Dialog und raeumt den Hoerer weg', () => {
        const { sandbox, hoerer, modal, close } = baueSandkasten();
        sandbox.zeigeEnde('<table></table>');
        assert.equal(modal.style.display, 'flex');
        assert.ok(hoerer.keydown && hoerer.keydown.capture === true, 'kein keydown-Hoerer im Capture');
        assert.ok(close.fokussiert, 'der x-Knopf bekommt den Fokus');
        assert.deepEqual(sandbox.window.HintergrundSperre.gesperrt, ['dreiervergleich']);
        let verhindert = false;
        hoerer.keydown.f({ key: 'Escape', preventDefault: () => { verhindert = true; } });
        assert.equal(modal.style.display, 'none');
        assert.ok(verhindert);
        assert.ok(!hoerer.keydown, 'der Hoerer bleibt nach dem Schliessen haengen');
        assert.deepEqual(sandbox.window.HintergrundSperre.gesperrt, []);
    });

    it('eine andere Taste schliesst nicht', () => {
        const { sandbox, hoerer, modal } = baueSandkasten();
        sandbox.zeigeEnde('<table></table>');
        hoerer.keydown.f({ key: 'Enter', preventDefault() {} });
        assert.equal(modal.style.display, 'flex');
    });

    it('die gemessene Kopfhoehe landet als --three-way-head-h an der Tabelle', () => {
        const { sandbox, tabelle } = baueSandkasten();
        sandbox.zeigeEnde('<table></table>');
        assert.equal(tabelle.style['--three-way-head-h'], '54px');
    });

    it('Verfaelschungsprobe: ohne removeEventListener bliebe der Hoerer', () => {
        // schneideFunktion liefert echten Code; wird die Zeile entfernt, muss die
        // erste Probe oben scheitern — hier am Text nachgewiesen, dass sie da ist.
        const schliessen = ohneKommentare(schneideFunktion(lies('js/current-meta-quickref.js'), 'closeThreeWayCompare'));
        assert.match(schliessen, /removeEventListener\('keydown', _threeWayEscape, true\)/);
    });
});
