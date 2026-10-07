'use strict';
/* V2-8 (Hausi 06.10.2026 abends, nach Vergleichsseite freigegeben):
   Bluetenschicht, untere Leiste, leerer Ausweis, Menuenamen nach Format,
   Deckwahl oben in der Deck-Analyse, ovale Formatknoepfe. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ohneKommentare = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

describe('V2-8 Vergleichsrutsch', () => {
    const html = ohneKommentare(R('index.html'));
    const nav = ohneKommentare(R('css/ds-nav.css'));
    it('leerer Datenraum-Ausweis ist unsichtbar', () => {
        assert.match(nav, /\.ds-space:empty\s*\{\s*display:\s*none;?\s*\}/);
    });
    it('untere Leiste: Symbole oben ausgerichtet', () => {
        const blk = nav.slice(nav.indexOf('.ds-tabbar-btn {'));
        assert.match(blk.slice(0, blk.indexOf('}')), /justify-content:\s*flex-start/);
    });
    it('Menue: „Deck Builder“ in beiden Sprachen', () => {
        const i18n = R('js/i18n.js');
        const treffer = i18n.match(/'menu\.deckBuilder':\s*'([^']*)'/g) || [];
        assert.ok(treffer.length >= 2);
        treffer.forEach(t => assert.match(t, /'Deck Builder'/));
    });
    it('Deck-Analyse: Deckwahl steht vor Ansichtswahl und Filtern', () => {
        const ca = html.slice(html.indexOf('id="current-analysis"'));
        const wahl = ca.indexOf('id="currentMetaDeckSelect"');
        assert.ok(wahl > 0);
        assert.ok(wahl < ca.indexOf('cm-view-mode-toggle'), 'Deckwahl unter der Ansichtswahl');
        assert.ok(wahl < ca.indexOf('current-meta-format-group'), 'Deckwahl unter den Filtern');
        assert.ok(ca.lastIndexOf('cm-deckwahl', wahl) > 0, 'Deckwahl ohne eigenen Block');
    });
    it('Menuepunkte und Raumknopf tragen das Format (ausgefuehrt)', () => {
        // ds-nav.js in einer Mini-Umgebung ausfuehren und formatMarke() aufrufen.
        const labels = {};
        const el = id => ({ querySelector: () => null, set textContent(v) { labels[id] = v; }, get textContent() { return labels[id]; } });
        const doc = {
            readyState: 'loading', addEventListener() {}, getElementById: id => el(id),
            querySelector: () => null, querySelectorAll: () => [],
        };
        const win = { _formatWindow: { current_set: '30C', oldest_legal_set: 'TEF' }, getLang: () => 'de', addEventListener() {} };
        const code = R('js/ds-nav.js');
        new Function('window', 'document', code)(win, doc);
        assert.strictEqual(typeof win.dsFormatMarke, 'function');
        win.dsFormatMarke();
        assert.strictEqual(labels['menu-btn-current-meta'], 'TEF–30C Meta-Analyse');
        // UI-112 Etappe 3: ein Menuepunkt fuer alle Raeume, ohne Format.
        assert.strictEqual(labels['menu-btn-current-analysis'], undefined);
        assert.strictEqual(win.DsNav.formatLabel('gl'), 'TEF–30C');
        assert.match(R('js/i18n.js'), /'dsFormatMarke'\]\.forEach/);
    });
});
