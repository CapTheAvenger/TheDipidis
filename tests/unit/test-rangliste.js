/**
 * Drei Auswertungen fuer dieselbe Frage werden eine.
 *
 * Bis zum 19.08.2026 standen in der Meta-Ansicht untereinander:
 *
 *   "Wie oft gespielt"        Rang, Deck, Anteil,      n
 *   "Wie oft Top-8 erreicht"  Rang, Deck, Top-8-Quote, n
 *   "Top 8 gegen Erwartung"   Rang, Deck, Top-8-Quote, vs. Feld
 *
 * Dieselben Decks, dieselben Spalten in anderer Reihenfolge, ueber drei
 * Bildschirmhoehen. Beanstandet mit: "wir brauchen jetzt nicht drei
 * verschiedene Felder fuer das Gleiche — mach lieber eine draus, und dann
 * so, dass man sortieren kann."
 *
 * Dazu kam ein echter Fehler. Die Spalte n der mittleren Tabelle zeigte
 * d.brought, also ALLE Antritte des Decks. Neben einer Top-8-Quote gelesen
 * sah das aus, als haetten 772 Decks die Top 8 erreicht. Gemeint waren 78.
 * Auch das war gemeldet: "da muesste man halt die Menge sehen, die Top 8
 * erreicht hat, und nicht noch mal die Gesamtmenge."
 *
 * Jetzt eine Tabelle mit beiden Zahlen als eigenen Spalten:
 *
 *   #  Deck        Anteil  Antritte  Top-8-Quote  davon Top 8  ggue. Schnitt
 *   1  Dragapult    9,0 %       772       10,1 %           78       1,6-mal
 *
 * Im Browser nachgemessen, Desktop 1440 und Mobil 390, 51 Zeilen:
 * Sortieren nach "davon Top 8" gibt 78, 50, 41, 33 mit neu durchgezaehlten
 * Raengen 1-4 und aria-sort="descending"; noch ein Klick dreht auf
 * aufsteigend. Keine Seitenfehler.
 *
 * Der divergierende Balken aus dem alten "Top 8 vs. Erwartung"-Block ist
 * mitgewandert — er war das Beste daran.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const TIER = stripJs(read('js/app-tier-meta.js'));
const SORT_SRC = read('js/rangliste-sortieren.js');
const SORT = stripJs(SORT_SRC);
const CSS = stripJs(read('css/components.css'));
const SEC = stripJs(read('js/ds-sections.js'));
const HTML = read('index.html');
const SW = read('service-worker.js');

// Das Sortiermodul im selben Realm laden.
const win = {};
const doc = { addEventListener() {} };
new Function('window', 'document', SORT_SRC)(win, doc);
const R = win.DsRangliste;

describe('Rangliste — eine statt drei', () => {
    it('die zwei alten Nachbartabellen sind weg', () => {
        assert.ok(!/cm-vs-top8-row/.test(TIER), '"Wie oft gespielt" steht wieder daneben');
        assert.ok(!/cm-vs-top8-block--wide/.test(TIER), '"Top 8 vs. Erwartung" ist wieder ein eigener Block');
        assert.ok(!/renderConversionBlock/.test(TIER), 'die tote Funktion ist zurueck');
    });

    it('und aus zwei Abschnitten ist einer geworden', () => {
        assert.ok(!/id: 'played'/.test(SEC));
        assert.ok(!/id: 'expect'/.test(SEC));
        assert.match(SEC, /id: 'rang'/);
        assert.match(SEC, /cm-rangliste-block/);
    });

    it('beide Zahlen haben eine eigene Spalte', () => {
        // Genau der gemeldete Fehler: 772 Antritte neben einer Top-8-Quote
        // sah aus wie 772 Top-8-Plaetze.
        assert.match(TIER, /k: 'antritte'/, 'die Antritte fehlen als Spalte');
        assert.match(TIER, /k: 'cuts'/, 'die absolute Zahl der Top-8-Plaetze fehlt als Spalte');
        /* "davon Top 8" hiess die Spalte bis zum 01.09.2026. Das "davon"
           bezog sich auf die Antritte links — gelesen wurde es als
           "davon von den Listen": "Heisst es jetzt, dass nur 21 Listen
           von 2715 Listen Top 8 gekommen sind? Aber das kann ja nicht
           sein." Der Bezug steht jetzt nicht mehr im Wort, sondern in
           der Erklaerung an der Spalte, wo er vollstaendig hinpasst. */
        assert.match(TIER, /k: 'cuts',[\s\S]{0,60}de: 'Top 8'/);
        assert.match(TIER, /bezogen auf die Turnier-Antritte links, nicht auf die Listen/);
    });

    it('die Kopfzellen sagen, dass man sie antippen kann', () => {
        assert.match(TIER, /data-rang-spalte=/);
        assert.match(TIER, /role="button"/);
        assert.match(TIER, /tabindex="0"/);
        assert.match(TIER, /aria-sort=/);
    });

    it('der divergierende Balken ist mitgewandert', () => {
        assert.match(TIER, /ds-bar-track is-diverging/);
        assert.match(CSS, /\.cm-rangliste \.ds-bar-track/, 'der Balken hat in der Tabelle kein CSS');
    });
});

describe('Rangliste — das Sortieren', () => {
    it('haengt am Document, nicht an der Tabelle', () => {
        // Dieselbe Lehre wie bei den Abschnittskoepfen am selben Tag:
        // app-tier-meta.js und app-meta-cards.js setzen innerHTML neu und
        // nehmen dabei jeden Handler mit, der weiter unten haengt.
        assert.match(SORT, /document\.addEventListener\(\s*'click'/);
        assert.ok(!/table\.addEventListener/.test(SORT),
            'ein Handler an der Tabelle ueberlebt das naechste innerHTML nicht');
    });

    it('ist auch mit der Tastatur bedienbar', () => {
        assert.match(SORT, /document\.addEventListener\(\s*'keydown'/);
        assert.match(SORT, /'Enter'/);
    });

    it('liest deutsche Zahlen richtig', () => {
        assert.equal(R.zahl('1.234,5 %'), 1234.5);
        assert.equal(R.zahl('0,8-mal'), 0.8);
        assert.equal(R.zahl('10.1%'), 10.1);
        assert.equal(R.zahl('78'), 78);
    });

    it('und gibt bei allem anderen null zurueck, nie NaN', () => {
        for (const s of ['–', '-', '', null, undefined, 'Dragapult', '   ']) {
            assert.equal(R.zahl(s), null, 'nicht null bei ' + JSON.stringify(s));
        }
    });

    it('zaehlt die Rangspalte neu durch', () => {
        // Sonst liest die sortierte Tabelle sich wie eine kaputte Rangliste
        // (3, 17, 5, ...).
        assert.match(SORT, /rang\.textContent = String\(n \+ 1\)/);
    });

    it('haelt Leerwerte immer am Ende, in beide Richtungen', () => {
        assert.match(SORT, /if \(na === null\) \{\s*return 1;/);
        assert.match(SORT, /if \(nb === null\) \{\s*return -1;/);
    });
});

describe('Rangliste — eingebunden', () => {
    it('das Modul wird geladen und offline mitgenommen', () => {
        assert.match(HTML, /js\/rangliste-sortieren\.js/);
        assert.match(SW, /rangliste-sortieren\.js/);
    });

    it('die Kopfzelle ist als anklickbar gestaltet, ohne Ausrufezeichen', () => {
        const m = CSS.match(/\.cm-rang-th\s*\{([^}]*)\}/);
        assert.ok(m, '.cm-rang-th fehlt');
        assert.match(m[1], /cursor:\s*pointer/);
        assert.ok(!m[1].includes('!important;'));
        assert.match(CSS, /\.cm-rang-th:focus-visible/, 'ohne Fokusring ist sie mit der Tastatur unsichtbar');
    });
});
