/**
 * Der Ziehsimulator: Marken, die entfernt werden koennen.
 *
 * js/draw-simulator.js:190 rief beim Klick auf eine Kombo-Marke
 * _toggleComboTarget(name) auf. Diese Funktion gab es in der Datei
 * nie - und weil sie in keiner anderen Datei steht, war jeder Klick
 * ein ReferenceError in der Konsole und sonst nichts. Der Titel der
 * Marke versprach dabei "zum Entfernen klicken".
 *
 * Nachgestellt im Browser, vorher/nachher:
 *   vorher   2 Marken, Klick -> ReferenceError, weiterhin 2 Marken
 *   nachher  2 Marken, Klick -> 1 Marke, Auswahlfeld geleert
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'draw-simulator.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'ui-components.css'), 'utf8');

const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const CODE = stripJs(SRC);

describe('Kombo-Marken — jeder aufgerufene Name existiert', () => {
    it('_toggleComboTarget wird nirgends mehr aufgerufen', () => {
        assert.ok(!/_toggleComboTarget/.test(CODE), 'die Funktion gab es nie');
    });

    it('_removeComboTarget ist definiert und wird benutzt', () => {
        assert.match(CODE, /function _removeComboTarget\s*\(/);
        assert.match(CODE, /_removeComboTarget\s*\(\s*name\s*\)/);
    });

    it('jede im Modul gerufene _-Funktion ist im Modul auch definiert', () => {
        // Der eigentliche Fehler in allgemeiner Form. Die Datei ist ein
        // klassisches Skript ohne Modulgrenzen; ein Tippfehler im
        // Funktionsnamen faellt sonst erst beim Klick auf.
        const defined = new Set([...CODE.matchAll(/function\s+(_[\w$]+)\s*\(/g)].map(m => m[1]));
        const called = new Set([...CODE.matchAll(/(?<![\w$.])(_[\w$]+)\s*\(/g)].map(m => m[1]));
        const missing = [...called].filter(n => !defined.has(n) && !/^_+$/.test(n));
        assert.deepStrictEqual(missing, [], 'gerufen, aber nicht definiert: ' + missing.join(', '));
    });
});

describe('Kombo-Marken — Entfernen heisst wirklich entfernen', () => {
    const fn = /function _removeComboTarget\(name\) \{([\s\S]*?)\n\}/.exec(CODE);

    it('die Funktion nimmt den Namen aus der Liste', () => {
        assert.ok(fn, '_removeComboTarget nicht gefunden');
        assert.match(fn[1], /_comboTargets\s*=\s*_comboTargets\.filter/);
    });

    it('und leert das Auswahlfeld, das ihn gesetzt hat', () => {
        // Ohne das holt der naechste onComboDropdownChange() den
        // gerade entfernten Namen sofort zurueck.
        assert.match(fn[1], /comboTarget\$\{i\}/);
        assert.match(fn[1], /select\.value\s*=\s*''/);
    });

    it('und zeichnet die Marken neu', () => {
        assert.match(fn[1], /_renderComboTargets\(\)/);
    });
});

describe('Kombo-Marken — anklickbar heisst bedienbar', () => {
    it('die Marke ist ein button, kein span', () => {
        const render = /function _renderComboTargets\(\)[\s\S]*?\n\}/.exec(CODE)[0];
        assert.match(render, /createElement\('button'\)/);
        assert.match(render, /badge\.type\s*=\s*'button'/);
    });

    it('sie traegt eine Beschriftung fuer Screenreader', () => {
        const render = /function _renderComboTargets\(\)[\s\S]*?\n\}/.exec(CODE)[0];
        assert.match(render, /setAttribute\('aria-label'/);
    });

    it('ihr Aussehen steht im Stylesheet, nicht in einer Zeichenkette', () => {
        const render = /function _renderComboTargets\(\)[\s\S]*?\n\}/.exec(CODE)[0];
        assert.ok(!/style\.cssText/.test(render), 'Stil-Zeichenkette im Skript');
        assert.match(render, /className\s*=\s*'draw-sim-combo-badge'/);
        assert.match(CSS, /\.draw-sim-combo-badge\s*\{/);
    });

    it('sie hat einen sichtbaren Fokusrahmen und eine tippbare Hoehe', () => {
        const rule = /\.draw-sim-combo-badge\s*\{([^}]*)\}/.exec(CSS)[1];
        assert.match(rule, /min-height:\s*(\d+)px/);
        assert.ok(Number(/min-height:\s*(\d+)px/.exec(rule)[1]) >= 24);
        assert.match(CSS, /\.draw-sim-combo-badge:focus-visible\s*\{[^}]*outline/);
    });
});
