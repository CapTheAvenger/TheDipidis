/**
 * Die Heatmap war schief. Nicht ein bisschen — 280 px.
 *
 * GEMESSEN am 19.08.2026 auf der Live-Seite, 1908 px breit,
 * Version 202608182246-dc427b5:
 *
 *   Kopfzeile, erste Spalte "Dein Deck"    511 px
 *   Koerper,   erste Spalte "Mega Excad."  231 px
 *   groesster Spaltenversatz               280 px
 *   Zellen                                 11 gegen 11 (also kein colspan)
 *
 * Die Ursache steht in css/styles.css ab Zeile 820 und ist ein
 * Scroll-Kniff aus der Zeit vor overflow-Wrappern:
 *
 *     table            { display: block; overflow-x: auto; }
 *     table thead,
 *     table tbody      { display: table; width: 100%; table-layout: fixed; }
 *
 * Damit ist die <table> keine Tabellenbox mehr. thead und tbody werden zu
 * ZWEI voneinander unabhaengigen Tabellen und loesen ihre Spaltenbreiten
 * getrennt auf. Das <colgroup> haengt an der Blockbox und wirkt auf keine
 * von beiden. Die Spalten koennen unter diesen Regeln gar nicht fluchten.
 *
 * Von 19 sichtbaren Tabellen der Meta-Ansicht war genau eine betroffen:
 * .arc-mu-table nimmt sich seit jeher aus (css/styles.css:10303,
 * display: table-header-group), .ds-table hat gleich breite Spalten und
 * faellt darum nicht auf. Deshalb wird hier nicht die Pauschalregel
 * angefasst, sondern die Heatmap ausgenommen — genau wie es
 * css/mobile-responsive.css:2529 unter 768 px schon tat. Auf dem Laptop
 * hatte diese Ausnahme nie gegriffen.
 *
 * Nach dem Fix, lokal nachgemessen:
 *
 *   Desktop 1440   Versatz 0    erste Spalte 224 / 224   kein Scrollbalken
 *   Mobil    390   Versatz 0    erste Spalte 119 / 119   Scrollbalken da
 *
 * Zweiter Fund derselben Runde: der Knopf "Alle Decks zeigen" trug
 * class="action-btn". Diese Klasse kam im ganzen Projekt genau einmal vor
 * und war nur in einer @media (max-width: ...)-Abfrage gestylt. Auf dem
 * Laptop griff keine Regel: 108x18 px, border 1.11px outset black, eckig.
 * Browser-Standard. Jetzt .ds-btn aus dem Designsystem: 124x40 px, Pille,
 * --brand auf --surface-1.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const MATCHUPS = stripCss(read('css/current-meta-matchups.css'));
const COMPONENTS = stripCss(read('css/components.css'));
const UIC = stripCss(read('css/ui-components.css'));
const TOKENS = stripCss(read('css/tokens.css'));
const META_JS = stripJs(read('js/app-current-meta.js'));

describe('Heatmap — Kopf und Koerper sind eine Tabelle', () => {
    it('die Tabelle ist wieder eine Tabelle, nicht ein Block', () => {
        const m = MATCHUPS.match(/#matchupHeatmapContainer\s+\.heatmap-table\s*\{([^}]*)\}/);
        assert.ok(m, 'Regel #matchupHeatmapContainer .heatmap-table fehlt');
        assert.match(m[1], /display:\s*table\s*;/,
            'ohne display: table erbt sie das display: block aus styles.css:820');
    });

    it('thead, tbody und tr bekommen ihre Tabellenrollen zurueck', () => {
        for (const [teil, rolle] of [
            ['thead', 'table-header-group'],
            ['tbody', 'table-row-group'],
            ['tr', 'table-row'],
        ]) {
            const re = new RegExp(
                '#matchupHeatmapContainer\\s+\\.heatmap-table\\s+' + teil + '\\s*\\{[^}]*display:\\s*' + rolle);
            assert.match(MATCHUPS, re,
                teil + ' braucht display: ' + rolle + ', sonst bleibt es eine eigene Tabelle');
        }
    });

    it('die Ausnahme haengt an keiner Breite', () => {
        // Der Block muss ausserhalb jeder @media-Abfrage stehen. Sonst ist
        // er wieder das, was er unter 768 px schon war: eine halbe Loesung.
        const i = MATCHUPS.indexOf('#matchupHeatmapContainer .heatmap-table {');
        assert.ok(i > -1);
        const davor = MATCHUPS.slice(0, i);
        const auf = (davor.match(/@media[^{]*\{/g) || []).length;
        // Klammern zaehlen: steht der Block in einer Abfrage, ist eine offen.
        let tiefe = 0;
        for (const ch of davor) {
            if (ch === '{') tiefe++;
            else if (ch === '}') tiefe--;
        }
        assert.equal(tiefe, 0,
            'die Regel steht verschachtelt (' + auf + ' @media davor), sie muss auf oberster Ebene stehen');
    });

    it('das seitliche Scrollen bleibt am Wrapper, nicht an der Tabelle', () => {
        // display: block wegzunehmen ist nur deshalb gefahrlos.
        assert.match(MATCHUPS,
            /#matchupHeatmapContainer\s+\.heatmap-table-scroll\s*\{[^}]*overflow-x:\s*auto/,
            '.heatmap-table-scroll muss overflow-x: auto tragen');
    });
});

describe('Heatmap — der Knopf', () => {
    it('benutzt das Designsystem, nicht die Waisenklasse action-btn', () => {
        assert.match(META_JS, /class="ds-btn"[^>]*heatmapExpanded/,
            'der Umschalter braucht .ds-btn');
        assert.ok(!/class="action-btn"/.test(META_JS),
            'action-btn war nirgends ausserhalb einer Media-Query gestylt');
    });

    it('.ds-btn ist definiert und benutzt nur vorhandene Tokens', () => {
        const m = COMPONENTS.match(/\.ds-btn\s*\{([^}]*)\}/);
        assert.ok(m, '.ds-btn fehlt in css/components.css');
        const regel = m[1];
        for (const feld of ['min-height', 'border-radius', 'background', 'color', 'cursor']) {
            assert.ok(regel.includes(feld + ':'), '.ds-btn ohne ' + feld);
        }
        for (const tok of regel.match(/var\((--[a-z0-9-]+)\)/g) || []) {
            const name = tok.slice(4, -1);
            assert.ok(TOKENS.includes(name + ':'), 'Token ' + name + ' gibt es nicht in tokens.css');
        }
    });

    it('.ds-btn kommt ohne Ausrufezeichen aus', () => {
        const m = COMPONENTS.match(/\.ds-btn[^{]*\{([^}]*)\}/g) || [];
        for (const block of m) {
            assert.ok(!block.includes('!important;'),
                'ein neuer Knopf braucht kein !important: ' + block.slice(0, 60));
        }
    });

    it('die tote Mobil-Regel fuer action-btn ist weg', () => {
        assert.ok(!/\.heatmap-btn-row\s+\.action-btn/.test(UIC),
            'die Regel zeigte auf eine Klasse, die es nicht mehr gibt');
    });
});
