'use strict';
/* FE-47 (Rotations-Check je Deck, Marke H rotiert im April) und DA-50 (eine
   Grenze fuer kleine Stichproben: 20 Matches) — Entscheidungen Hausi 06.10.2026. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

describe('FE-47 Rotations-Check je Deck', () => {
    const src = R('js/firebase-collection.js');
    const block = src.match(/const DS_ROTIERT_MARKE = '([A-Z])';[\s\S]*?\nfunction dsRotationsZeile/);
    it('Marke H, Zaehlung ueber (Set, Nummer) — ausgefuehrt', () => {
        assert.ok(block, 'Zaehler fehlt');
        assert.strictEqual(block[1], 'H');
        const code = block[0].replace(/\nfunction dsRotationsZeile$/, '')
            + '\nreturn { dsMarkenIndexBauen, dsRotiertZaehlen };';
        const f = new Function(code)();
        const ix = f.dsMarkenIndexBauen({ marks: { H: { TWM: '128-130', PAL: '1' }, I: { MEG: '131' }, G: { PAL: '185' } } });
        const deck = { 'Dreepy (TWM 128)': 4, 'Drakloak (TWM 129)': 4, 'Ultra Ball (MEG 131)': 4,
                       'Iono (PAL 185)': 2, 'Dreepy': 3, 'Leer (TWM 130)': 0 };
        assert.strictEqual(f.dsRotiertZaehlen(deck, ix), 8);
        assert.strictEqual(f.dsRotiertZaehlen({ 'X (pal 001)': 2 }, ix), 0, 'Kleinschreibung im Set zaehlt nicht');
        assert.strictEqual(f.dsRotiertZaehlen({ 'X (PAL 001)': 2 }, ix), 2, 'fuehrende Nullen');
        assert.strictEqual(f.dsRotiertZaehlen(deck, null), 0);
    });
    it('steht in der Deckzeile unter Archetyp und Kartenzahl', () => {
        const i = src.indexOf('${dsRotationsZeile(deck.cards)}');
        assert.ok(i > 0);
        assert.ok(src.lastIndexOf('deck-name-col', i) > src.lastIndexOf('deck-action-buttons', i));
    });
});

describe('DA-50 eine Grenze: 20 Matches', () => {
    it('CONV_MIN_N ist 20', () => {
        assert.match(R('js/app-utils.js'), /const CONV_MIN_N = 20;/);
    });
    it('Heatmap-Major grau unter der Grenze', () => {
        assert.match(R('js/app-current-meta.js'), /mj\.anzahl < \(\(typeof window\.CONV_MIN_N === 'number'\) \? window\.CONV_MIN_N : 20\)/);
        assert.match(R('css/styles.css').replace(/\/\*[\s\S]*?\*\//g, ''), /\.heatmap-zelle-duenn \{ font-style: italic; color: var\(--ink-3\); \}/);
    });
});

describe('V2-10 Deck-Analyse vor der Wahl', () => {
    it('der leere Steuerblock hat keine Flaeche', () => {
        const css = R('css/city-league.css').replace(/\/\*[\s\S]*?\*\//g, '');
        assert.match(css, /#current-analysis:not\(\[data-cm-gewaehlt\]\) \.controls:not\(\.cm-deckwahl\) \{ padding: 0; border: 0; background: none; \}/);
    });
});
