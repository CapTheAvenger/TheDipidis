/**
 * Die Deckempfehlung auf der Startseite.
 *
 * Diese Tests gibt es, weil beim Review dieses Moduls drei Fehler gefunden
 * wurden, die keine einzige der 149 bestehenden Testdateien haette fangen
 * koennen — und alle drei waeren gruen durchgelaufen:
 *
 *   1. Das Modul benutzte CSS-Klassen, die es nicht gab. Der wichtigste
 *      Hinweis der Karte — dass ein Fuenftel des Online-Feldes unbekannt ist
 *      — waere in 11 px Grau gerendert worden, leiser als alles andere.
 *      Kein Test prueft, ob eine aus JS erzeugte Klasse in CSS existiert.
 *   2. pz() gab bei fehlenden Zahlen null zurueck, und die Aufrufer haben
 *      das direkt in den HTML-Text gehaengt: "null %" als Day-2-Quote.
 *   3. Die Karte zeigte die Trefferquote der Betriebsart A neben einer
 *      Empfehlung, die in Betriebsart B entstanden war.
 *
 * Geprueft wird darum die erzeugte Ausgabe, nicht der Quelltext: baue() wird
 * in einem vm-Kontext wirklich ausgefuehrt und das Ergebnis untersucht.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(ROOT, 'js', 'app-deckempfehlung.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readdirSync(path.join(ROOT, 'css'))
    .filter(f => f.endsWith('.css'))
    .map(f => fs.readFileSync(path.join(ROOT, 'css', f), 'utf8'))
    .join('\n');

/** Das Modul laden und window.Deckempfehlung herausholen. */
function laden() {
    const zuhoerer = [];
    const kontext = {
        window: {}, console,
        document: {
            readyState: 'complete',
            getElementById: () => null,
            addEventListener: (n, f) => zuhoerer.push(n),
        },
        fetch: () => Promise.reject(new Error('im Test nicht erreichbar')),
    };
    kontext.globalThis = kontext;
    vm.createContext(kontext);
    new vm.Script(QUELLE).runInContext(kontext);
    return { modul: kontext.window.Deckempfehlung, zuhoerer };
}

const DATEN = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'deckempfehlung.json'), 'utf8'));

describe('Deckempfehlung: das Modul laedt und liefert eine Karte', () => {
    it('exportiert genau eine globale Schnittstelle', () => {
        const { modul } = laden();
        assert.ok(modul, 'window.Deckempfehlung fehlt');
        for (const f of ['init', 'zeichne', '_baue']) {
            assert.equal(typeof modul[f], 'function', `${f} fehlt`);
        }
    });

    it('rendert die echten Daten aus data/deckempfehlung.json', () => {
        const { modul } = laden();
        const html = modul._baue(DATEN);
        assert.ok(html.includes(DATEN.empfehlung.deck),
            'der Name des empfohlenen Decks steht nicht in der Karte');
    });
});

describe('Deckempfehlung: keine erfundenen und keine kaputten Zahlen', () => {
    it('bei fehlenden Zahlen steht "unbekannt", nicht "null" oder "undefined"', () => {
        const { modul } = laden();
        const kaputt = {
            format: 'TEF-PBL', betriebsart: 'B', erzeugt: '2026-08-23 00:00:00+00:00',
            anker: [], ankerspieler_gesamt: null,
            empfehlung: { deck: 'Dragapult', ankerspieler: null, day2_geschrumpft: null },
            vertrauen: {}, rangliste: [],
        };
        const html = modul._baue(kaputt);
        assert.ok(!/\bnull\b/.test(html), 'die Ausgabe enthaelt "null":\n' + html);
        assert.ok(!/\bundefined\b/.test(html), 'die Ausgabe enthaelt "undefined":\n' + html);
        assert.ok(/unbekannt/.test(html), 'fehlende Zahlen werden nicht als unbekannt gemeldet');
    });

    it('ohne Daten bricht nichts, es kommt eine ehrliche Karte', () => {
        const { modul } = laden();
        for (const leer of [null, undefined, {}, { empfehlung: null }]) {
            const html = modul._baue(leer);
            assert.ok(html.includes('ds-panel'), 'kein Ersatzinhalt');
            assert.ok(!/\bundefined\b|\bnull\b/.test(html), 'Platzhalter statt Text');
        }
    });

    it('Deckname und Turniernamen werden maskiert', () => {
        const { modul } = laden();
        const html = modul._baue(Object.assign({}, DATEN, {
            empfehlung: Object.assign({}, DATEN.empfehlung, { deck: '<img src=x onerror=1>' }),
        }));
        assert.ok(!html.includes('<img src=x'), 'ungefiltertes Markup aus den Daten');
    });
});

describe('Deckempfehlung: sie zeigt die Zahl ihrer eigenen Betriebsart', () => {
    it('die grosse Quote stammt aus vertrauen, nicht aus der Deckzeile', () => {
        const { modul } = laden();
        const html = modul._baue(Object.assign({}, DATEN, {
            vertrauen: Object.assign({}, DATEN.vertrauen, { empfehlung_mittel: 11.1 }),
            empfehlung: Object.assign({}, DATEN.empfehlung, { day2_geschrumpft: 99.9 }),
        }));
        const i = html.indexOf('11,1 %');
        const j = html.indexOf('99,9 %');
        assert.ok(i >= 0, 'die gemessene Trefferquote fehlt in der Karte');
        assert.ok(j >= 0, 'die Deckquote fehlt in der Karte');
        assert.ok(i < j, 'die Deckquote steht vor der gemessenen Trefferquote — '
            + 'dann liest sie sich als Erwartung, und genau das war der Fehler');
    });

    it('die Datei traegt beide Betriebsarten getrennt', () => {
        assert.ok(DATEN.vertrauen_je_betriebsart, 'vertrauen_je_betriebsart fehlt');
        const je = DATEN.vertrauen_je_betriebsart;
        assert.ok(je.A && je.B, 'beide Betriebsarten muessen gemessen sein');
        assert.notEqual(je.A.turniere, je.B.turniere,
            'beide Betriebsarten haben gleich viele Faelle — sie teilen sich vermutlich welche');
        assert.deepEqual(DATEN.vertrauen, je[DATEN.betriebsart],
            'die angezeigte Trefferquote gehoert nicht zur gelaufenen Betriebsart');
    });
});

describe('Deckempfehlung: die Verdrahtung haelt', () => {
    it('index.html hat den Host und das Skript', () => {
        assert.ok(HTML.includes('id="deckempfehlungHost"'), '#deckempfehlungHost fehlt');
        assert.match(HTML, /<script src="js\/app-deckempfehlung\.js\?v=\d{12}" defer><\/script>/,
            'das Skript fehlt, hat kein ?v= oder kein defer');
    });

    it('der Host steht vor der beschreibenden Uebersicht, nicht danach', () => {
        const host = HTML.indexOf('id="deckempfehlungHost"');
        const antwort = HTML.indexOf('id="metaAnswerTop"');
        assert.ok(host >= 0 && antwort >= 0);
        assert.ok(host < antwort,
            'erst die Entscheidung, dann die Belege — der Host gehoert vor #metaAnswerTop');
    });

    it('der Host liegt nicht im Meta Call', () => {
        // MetaCall.renderAll() ueberschreibt #metaCallHost bei jeder Interaktion.
        const mc = HTML.indexOf('id="metaCallHost"');
        const host = HTML.indexOf('id="deckempfehlungHost"');
        assert.ok(host < mc || mc < 0,
            'der Host darf nicht im Meta Call stehen — MetaCall wischt ihn weg');
    });

    it('app-core.js zeichnet die Karte beim Wechsel auf die Startseite', () => {
        const core = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');
        const i = core.indexOf("case 'current-meta':");
        assert.ok(i > 0, "case 'current-meta' nicht gefunden");
        const block = core.slice(i, i + 600);
        assert.match(block, /window\.Deckempfehlung.*\.init\(\)/s,
            'die Karte wird beim Tabwechsel nicht nachgezogen');
    });
});

describe('Deckempfehlung: jede benutzte CSS-Klasse gibt es auch', () => {
    it('keine erfundenen Klassen', () => {
        const genutzt = new Set();
        for (const m of QUELLE.matchAll(/class="([^"{}]+)"/g)) {
            for (const k of m[1].trim().split(/\s+/)) if (k) genutzt.add(k);
        }
        assert.ok(genutzt.size >= 5, 'zu wenige Klassen gefunden — der Scanner greift nicht');
        const fehlend = [...genutzt].filter(k => !new RegExp('\\.' + k + '(?![\\w-])').test(CSS));
        assert.deepEqual(fehlend, [],
            'Diese Klassen erzeugt das Modul, aber kein Stylesheet definiert sie:\n  '
            + fehlend.join('\n  ')
            + '\nUngestylt heisst hier: der Hinweis, der am lautesten sein muss, wird der leiseste.');
    });

    it('der Vorbehalt hat eigene Flaeche und ist nicht nur eine Notiz', () => {
        const { modul } = laden();
        const html = modul._baue(DATEN);
        if (!DATEN.online_abdeckung || DATEN.online_abdeckung.anteil_unbekannt < 10) return;
        assert.ok(html.includes('de-vorbehalt'), 'der Vorbehalt fehlt');
        assert.ok(/\.de-vorbehalt[^{]*\{[^}]*background:\s*var\(--vorbehalt-bg\)/s.test(CSS),
            'der Vorbehalt hat keinen eigenen Hintergrund und geht damit unter');
    });
});
