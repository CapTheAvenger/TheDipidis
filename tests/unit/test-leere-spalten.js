/**
 * Eine Spalte ohne Zahlen ist keine Spalte.
 *
 * Der Betreiber am 02.09.2026, vor einer Tabelle mit drei
 * strichgefuellten Spalten: "Wenn die Zahlen da leer sind brauchen wir
 * die Spalten denn ueberhaupt?"
 *
 * Gemessen wurde danach die ganze Seite: von vierzehn Reitern trugen
 * die Matchup-Tabellen der Archetyp-Karte zwei Spalten, in denen JEDE
 * Zelle ein Strich war — Major-WR und Major-Matches, die Praesenzturniere.
 * Fuer die heutige Datenlage gibt es dort keine einzige Paarung.
 *
 * Zwei Spalten Striche kosten waagerechten Platz, lassen die Tabelle
 * unvollstaendig aussehen und sagen nichts, was ein Satz nicht besser
 * sagt. Fehlt die Zahl aber nur in EINZELNEN Zeilen, traegt der Strich
 * eine Aussage ("dieses Paar gab es dort nicht") und die Nachbarzeilen
 * zeigen, wogegen — dann bleiben beide Spalten stehen.
 *
 * Diese Datei prueft beide Faelle am erzeugten HTML, nicht am
 * Wortlaut des Quelltextes: gezaehlt werden Kopfzellen und Datenzellen,
 * und sie muessen zusammenpassen. Eine Spalte auszublenden und die
 * Zelle stehenzulassen ist der naheliegende Fehler, und er verschiebt
 * jede Zahl der Zeile um eine Spalte.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-archetype-card.js'), 'utf8');

/* Das Modul im Sandkasten. Es haengt sich an window; die interne
 * Tabellenfunktion wird ueber _archetypeCardInternals erreicht. */
function lade(matchups) {
    const sandbox = {
        console,
        document: {
            addEventListener() {}, removeEventListener() {},
            getElementById: () => null, querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({ style: {}, classList: { add() {}, remove() {} },
                                    appendChild() {}, setAttribute() {} }),
            body: { appendChild() {}, classList: { add() {}, remove() {} } },
        },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        navigator: { language: 'de' },
        location: { hash: '', href: '', search: '' },
        setTimeout, clearTimeout, setInterval, clearInterval,
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        getLang: () => 'de',
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(SRC, sandbox);
    const intern = sandbox._archetypeCardInternals;
    assert.ok(intern, '_archetypeCardInternals fehlt');
    return { sandbox, intern };
}

/* Die Tabellenfunktion aus dem Quelltext ziehen und mit gesetzten
 * Zeilen ausfuehren. Alles, was sie sonst noch braucht, wird davor
 * gestellt — aber matchupsFor kommt von aussen, damit der Test die
 * Datenlage bestimmt und nicht die Datei. */
function schneide(name) {
    let start = SRC.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, `${name} ist nicht mehr auffindbar`);
    let tiefe = 0;
    for (let j = SRC.indexOf('{', start); j < SRC.length; j++) {
        if (SRC[j] === '{') tiefe++;
        else if (SRC[j] === '}') { tiefe--; if (tiefe === 0) return SRC.slice(start, j + 1); }
    }
    assert.fail(`${name} hat keine schliessende Klammer`);
}

function tabelleMit(zeilen) {
    const quelle = [
        'const isDe = () => true;',
        'const esc = (s) => String(s == null ? "" : s)',
        '    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")',
        '    .replace(/"/g, "&quot;").replace(/\'/g, "&#39;");',
        'const L = (k, d) => d;',
        'const fmt = (n, dp) => Number(n).toFixed(dp == null ? 1 : dp).replace(".", ",");',
        'const THIN_GAMES = 20;',
        'const window = { WinRateKonvention: null };',
        'const shadeFor = () => "";',
        'const barFor = () => ({ pct: 0, cls: "" });',
        'const matchupsFor = () => ZEILEN;',
        schneide('matchupTableHtml'),
        'return matchupTableHtml;',
    ].join('\n');
    return new Function('ZEILEN', quelle)(zeilen);
}

const zeile = (gegner, extra) => Object.assign({
    opponent: gegner, winRate: 52, winRateRoh: 52, games: 40,
    wins: 20, losses: 18, ties: 2, thin: false,
    majorWr: null, majorWrRoh: null, majorSiege: null,
    majorNiederlagen: null, majorUnentschieden: null, majorAnzahl: null,
}, extra || {});

/* HTML-KOMMENTARE ZUERST WEG. Die Kopfzeile traegt eine lange Begruendung
   im Markup, und die nennt die Spaltennamen beim Namen ("Major-Matches
   statt Major-M"). Eine Zusicherung, die im rohen Text sucht, findet sie
   dort und meldet eine Spalte, die gar nicht gerendert wird — genau der
   Fehler, den tests/unit/test-matchup-major-spalte.js schon einmal
   gemacht hat. */
const sichtbar = (html) => String(html).replace(/<!--[\s\S]*?-->/g, ' ');

function spaltenZaehlen(html) {
    const kopf = (html.match(/<th\b/g) || []).length;
    const ersteZeile = html.slice(html.indexOf('<tbody>'), html.indexOf('</tr>', html.indexOf('<tbody>')));
    const zellen = (ersteZeile.match(/<td\b/g) || []).length;
    return { kopf, zellen };
}

describe('die Praesenzspalten verschwinden, wenn sie leer waeren', () => {
    it('ohne eine einzige Praesenzpartie fallen Kopf UND Zellen weg', () => {
        const html = tabelleMit([zeile('A'), zeile('B'), zeile('C')])('X', {});
        assert.doesNotMatch(sichtbar(html), /Major-WR/, 'die Kopfzelle Major-WR steht noch da');
        assert.doesNotMatch(sichtbar(html), /Major-Matches/, 'die Kopfzelle Major-Matches steht noch da');
        assert.doesNotMatch(sichtbar(html), /arc-mu-major/, 'die Datenzellen stehen noch da');
    });

    it('und der Satz darunter sagt, warum', () => {
        const html = tabelleMit([zeile('A'), zeile('B'), zeile('C')])('X', {});
        assert.match(html, /Präsenzturniere sind hier nicht dabei/,
            'die Legende erklaert die fehlende Spalte nicht');
    });

    it('eine einzige Paarung mit Zahlen haelt beide Spalten', () => {
        const html = tabelleMit([
            zeile('A'), zeile('B'),
            zeile('C', { majorWr: 48.5, majorWrRoh: 47.0, majorSiege: 14,
                         majorNiederlagen: 16, majorUnentschieden: 0, majorAnzahl: 30 }),
        ])('X', {});
        assert.match(sichtbar(html), /Major-WR/);
        assert.match(sichtbar(html), /Major-Matches/);
        // Und die Zeilen OHNE Zahlen tragen dort weiter ihren Strich —
        // der sagt dann etwas, weil daneben Zahlen stehen.
        assert.match(html, /arc-mu-major[^>]*>–</);
    });
});

describe('Kopf und Zeile bleiben gleich breit', () => {
    /* Der naheliegende Fehler beim Ausblenden: die Kopfzelle faellt weg,
       die Datenzelle nicht. Dann rutscht jede Zahl der Zeile um eine
       Spalte, und die Tabelle luegt, ohne dass eine einzelne Zahl
       falsch waere. */
    [
        ['ohne Praesenzdaten', [zeile('A'), zeile('B')]],
        ['mit Praesenzdaten', [zeile('A', { majorWr: 50, majorWrRoh: 50, majorSiege: 6, majorNiederlagen: 6, majorUnentschieden: 0, majorAnzahl: 12 }), zeile('B')]],
        ['nur die letzte Zeile hat Daten', [zeile('A'), zeile('B', { majorWr: 44, majorWrRoh: 44, majorSiege: 4, majorNiederlagen: 5, majorUnentschieden: 0, majorAnzahl: 9 })]],
    ].forEach(([name, zeilen]) => {
        it(name, () => {
            const html = tabelleMit(zeilen)('X', {});
            const { kopf, zellen } = spaltenZaehlen(html);
            assert.ok(kopf > 0 && zellen > 0, `${name}: keine Tabelle erzeugt`);
            assert.equal(zellen, kopf,
                `${name}: ${kopf} Kopfzellen, aber ${zellen} Datenzellen — die Zeile ist verschoben`);
        });
    });

    it('die sechs Grundspalten stehen immer', () => {
        const html = tabelleMit([zeile('A'), zeile('B')])('X', {});
        const { kopf } = spaltenZaehlen(html);
        assert.equal(kopf, 6, `ohne Praesenzspalten muessen sechs bleiben, gezaehlt: ${kopf}`);
        const mit = spaltenZaehlen(tabelleMit([zeile('A', { majorWr: 50, majorWrRoh: 50, majorSiege: 6, majorNiederlagen: 6, majorUnentschieden: 0, majorAnzahl: 12 })])('X', {}));
        assert.equal(mit.kopf, 8, `mit Praesenzspalten muessen acht stehen, gezaehlt: ${mit.kopf}`);
    });
});

describe('das Modul laedt ueberhaupt', () => {
    it('haengt seine Schnittstelle an window', () => {
        const { sandbox } = lade();
        ['openArchetypeCard', 'renderArchetypeCardInto', 'getArchetypeMatchups']
            .forEach(k => assert.equal(typeof sandbox[k], 'function', `${k} fehlt`));
    });
});
