/**
 * Eine Klasse fuer "unsichtbar".
 *
 * Ausgangslage am 2026-08-18: das Projekt hatte zwei Namen fuer
 * dieselbe Sache — .d-none (193 Verwendungen) und .display-none (96).
 * Neunzehn CSS-Regeln erklaerten beide, acht davon Wort fuer Wort
 * identisch in einer einzigen Datei.
 *
 * Der Preis stand in js/app-current-meta-analysis.js: das Matchup-Feld
 * trug .display-none aus dem Markup, der Renderer nahm nur .d-none
 * weg. Der zweite Renderpfad wurde spaeter repariert, indem er beide
 * Namen entfernt — der erste blieb als Falle liegen. Genau so entsteht
 * ein Element, das befuellt ist und trotzdem niemand sieht.
 *
 * Diese Tests halten den aufgeraeumten Zustand fest:
 *   - nur noch .d-none, nirgends mehr .display-none
 *   - genau eine unbeschraenkte Regel, die sie erklaert
 *   - diese Regel steht hinter allen Layout-Utilities derselben
 *     Gewichtsklasse, damit Verstecken gewinnt
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS_DIR = path.join(ROOT, 'css');
const JS_DIR = path.join(ROOT, 'js');

function stripCssComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
function stripJsComments(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const cssFiles = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));
const jsFiles = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js'));
const HTML = stripJsComments(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));

describe('eine Versteck-Klasse — .display-none ist abgeschafft', () => {
    it('index.html benutzt sie nirgends mehr', () => {
        const hits = (HTML.match(/\bdisplay-none\b/g) || []).length;
        assert.strictEqual(hits, 0, 'index.html traegt noch display-none');
    });

    it('kein Skript in js/ fasst sie noch an', () => {
        const bad = [];
        for (const f of jsFiles) {
            const src = stripJsComments(fs.readFileSync(path.join(JS_DIR, f), 'utf8'));
            if (/\bdisplay-none\b/.test(src)) bad.push(f);
        }
        assert.deepStrictEqual(bad, []);
    });

    it('keine CSS-Datei erklaert sie noch', () => {
        const bad = [];
        for (const f of cssFiles) {
            const src = stripCssComments(fs.readFileSync(path.join(CSS_DIR, f), 'utf8'));
            if (/\.display-none\b/.test(src)) bad.push(f);
        }
        assert.deepStrictEqual(bad, []);
    });
});

describe('eine Versteck-Klasse — genau eine Regel erklaert .d-none', () => {
    // Eine Regel heisst hier: Selektor ist genau ".d-none", ohne
    // Einschraenkung auf ein Element. Verbund-Selektoren wie
    // ".action-bar .d-none + .action-divider" machen etwas anderes und
    // zaehlen nicht mit.
    function blanketRules() {
        const out = [];
        for (const f of cssFiles) {
            const src = stripCssComments(fs.readFileSync(path.join(CSS_DIR, f), 'utf8'));
            const re = /(^|[}\s])\.d-none\s*\{([^}]*)\}/g;
            let m;
            while ((m = re.exec(src)) !== null) {
                out.push({ file: f, index: m.index, body: m[2].trim() });
            }
        }
        return out;
    }

    it('genau eine unbeschraenkte .d-none-Regel im ganzen Projekt', () => {
        const rules = blanketRules();
        assert.strictEqual(
            rules.length, 1,
            'gefunden: ' + rules.map(r => r.file).join(', ')
        );
    });

    it('sie versteckt, und zwar mit !important', () => {
        const [rule] = blanketRules();
        assert.match(rule.body, /display:\s*none\s*!important/);
    });

    it('keine Datei wiederholt sie eingegrenzt (.foo.d-none { display: none })', () => {
        const bad = [];
        for (const f of cssFiles) {
            const src = stripCssComments(fs.readFileSync(path.join(CSS_DIR, f), 'utf8'));
            const re = /([#.][\w-]+)\.d-none\s*\{([^}]*)\}/g;
            let m;
            while ((m = re.exec(src)) !== null) {
                if (/display\s*:\s*none/.test(m[2])) bad.push(`${f}: ${m[1]}.d-none`);
            }
        }
        assert.deepStrictEqual(bad, [], 'die eine Regel deckt das schon ab');
    });
});

describe('eine Versteck-Klasse — Verstecken schlaegt Layout', () => {
    // .d-none hat Gewicht (0,1,0) und !important. Jede Layout-Utility
    // derselben Klasse mit display + !important — .flex,
    // .display-block, .flex-between, die Grid-Klassen — gewinnt gegen
    // sie, wenn sie SPAETER in der Datei steht. Ein Element mit
    // class="d-none flex" waere dann sichtbar. Deshalb muss die
    // Versteck-Regel hinter allen anderen stehen.
    it('die .d-none-Regel steht hinter jeder display-!important-Utility ihrer Gewichtsklasse', () => {
        const file = path.join(CSS_DIR, 'ui-components.css');
        const src = stripCssComments(fs.readFileSync(file, 'utf8'));
        const hidePos = src.search(/(^|[}\s])\.d-none\s*\{/);
        assert.ok(hidePos > -1, '.d-none nicht in ui-components.css gefunden');

        const later = [];
        const re = /(^|[}\s])(\.[\w-]+)\s*\{([^}]*)\}/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            if (m[2] === '.d-none') continue;
            if (!/display\s*:[^;]*!important/.test(m[3])) continue;
            if (m.index > hidePos) later.push(m[2]);
        }
        assert.deepStrictEqual(
            later, [],
            'diese Utilities stehen hinter .d-none und wuerden es ueberstimmen: ' + later.join(', ')
        );
    });
});

describe('eine Versteck-Klasse — kein Renderpfad vergisst das Aufdecken', () => {
    // Der urspruengliche Fehler in Textform: ein add() mit einem Namen,
    // ein remove() mit einem anderen. Mit nur noch einem Namen kann das
    // nicht mehr passieren — dieser Test haelt fest, dass es dabei
    // bleibt, auch wenn jemand spaeter eine zweite Klasse einfuehrt.
    it('kein Skript versteckt mit einer Klasse, die es nie wieder entfernt', () => {
        const hideNames = new Set();
        const showNames = new Set();
        for (const f of jsFiles) {
            const src = stripJsComments(fs.readFileSync(path.join(JS_DIR, f), 'utf8'));
            for (const m of src.matchAll(/classList\.add\(\s*'([\w-]*none[\w-]*)'/g)) hideNames.add(m[1]);
            for (const m of src.matchAll(/classList\.remove\(\s*'([\w-]*none[\w-]*)'/g)) showNames.add(m[1]);
        }
        const orphan = [...hideNames].filter(n => !showNames.has(n));
        assert.deepStrictEqual(orphan, [], 'wird gesetzt, aber nie entfernt: ' + orphan.join(', '));
    });

    it('jede Versteck-Klasse aus index.html wird von js/ auch wieder entfernt', () => {
        const inHtml = new Set();
        for (const m of HTML.matchAll(/class="([^"]*)"/g)) {
            for (const c of m[1].split(/\s+/)) if (/^d-none$/.test(c)) inHtml.add(c);
        }
        const removedByJs = new Set();
        for (const f of jsFiles) {
            const src = stripJsComments(fs.readFileSync(path.join(JS_DIR, f), 'utf8'));
            for (const m of src.matchAll(/classList\.remove\(\s*'([\w-]+)'/g)) removedByJs.add(m[1]);
        }
        const stuck = [...inHtml].filter(c => !removedByJs.has(c));
        assert.deepStrictEqual(stuck, [], 'im Markup versteckt, von keinem Skript aufgedeckt: ' + stuck.join(', '));
    });
});
