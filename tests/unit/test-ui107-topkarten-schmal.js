/**
 * UI-107 (M3-08, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND (390 px): Top-Karten-Kachel 83 px, zwei 44-px-Ziele = 88 px; ★ ragte
 * 9 px hinaus und ueberdeckte ♡ der Nachbarkachel um 4 px.
 *
 * ZUSICHERUNG: Unter 480 px stehen drei Kacheln je Zeile, und diese Regel
 * ist spezifischer als jede andere grid-template-columns-Regel fuer das
 * Raster im ganzen CSS (Spezifitaet gerechnet). Live-Beleg im Rutsch-Bericht.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib-dom-sandkasten.js');

const spez = (s) => (s.match(/#[\w-]+/g) || []).length * 100 + (s.match(/\.[\w-]+/g) || []).length;
const regeln = fs.readdirSync(path.join(L.WURZEL, 'css')).filter(f => f.endsWith('.css')).flatMap(f => {
    const q = L.lies('css', f).replace(/\/\*[\s\S]*?\*\//g, ' ');
    return [...q.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({ f, sel: m[1].trim(), rumpf: m[2] }));
});

describe('UI-107: Top-Karten passen bei 390 px', () => {
    it('drei Spalten unter 480 px, staerkste Regel', () => {
        const meine = regeln.filter(r => r.f === 'components.css' && /top-cards-container \.top-cards-grid/.test(r.sel) && /repeat\(3,\s*1fr\)/.test(r.rumpf));
        assert.equal(meine.length, 1);
        const s = spez(meine[0].sel.split(',')[0]);
        const andere = regeln.filter(r => r !== meine[0] && /grid-template-columns/.test(r.rumpf))
            .flatMap(r => r.sel.split(',').map(x => x.trim())).filter(x => /\.top-cards-grid$/.test(x));
        for (const x of andere) assert.ok(spez(x) < s, x + ' schlaegt die Drei-Spalten-Regel');
    });
});
