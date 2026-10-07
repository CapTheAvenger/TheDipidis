'use strict';
/* V2-17 (07.10.2026, Hausi): Reste der Tiefenanalyse.
   UI-133 „Bild“-Knopf der Tier-Karten 32 px hoch (F-28),
   UI-94 Knöpfe im Kartendetail mit Titel (F-18 d),
   DA-40 „(M3: 12,0)“ → „(vorher 12,0)“ mit Titel in Japan,
   DA-51 „Sonstige“ unter der Meta-Performance. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const lies = f => fs.readFileSync(path.join(__dirname, '..', '..', f), 'utf8');
const ohneKomm = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('V2-17 — UI-133 Bild-Knopf', () => {
    it('.arc-share ist mindestens 32 px hoch', () => {
        const css = ohneKomm(lies('css/ds-share.css'));
        const regel = css.match(/\.arc-share\s*\{([^}]*)\}/)[1];
        const h = parseFloat((regel.match(/min-height:\s*([\d.]+)px/) || [])[1]);
        assert.ok(h >= 32, 'min-height ' + h);
    });
});

describe('V2-17 — UI-94 Kartendetail-Knöpfe mit Titel', () => {
    const quelle = lies('js/app-deck-builder.js');
    const fn = quelle.match(/window\.scAktionenBenennen = function \(panel\) \{[\s\S]*?\n\};/)[0];
    const fake = (labels) => {
        const btns = labels.map(l => {
            const attr = {};
            return {
                attr,
                setAttribute: (k, v) => { attr[k] = v; },
                querySelector: () => (l == null ? null : { textContent: ' ' + l + ' ' }),
            };
        });
        return { btns, panel: { querySelectorAll: () => btns } };
    };
    const ausfuehren = () => { const window = {}; new Function('window', fn)(window); return window.scAktionenBenennen; };
    it('jeder Knopf mit Beschriftung bekommt title und aria-label', () => {
        const benennen = ausfuehren();
        const { btns, panel } = fake(['Wunschliste', 'Sammlung', 'Druck wechseln', null]);
        assert.strictEqual(benennen(panel), 3);
        assert.strictEqual(btns[0].attr.title, 'Wunschliste');
        assert.strictEqual(btns[2].attr['aria-label'], 'Druck wechseln');
        assert.strictEqual(btns[3].attr.title, undefined);
    });
    it('das Kartendetail ruft es nach dem Zeichnen und nach dem Wunschlisten-Wechsel', () => {
        const s = ohneKomm(quelle);
        assert.match(s, /panel\.innerHTML = btns;\s*if \(typeof window\.scAktionenBenennen === 'function'\) window\.scAktionenBenennen\(panel\);/);
        assert.match(s, /if\(window\.scAktionenBenennen\)window\.scAktionenBenennen\(p\);/);
    });
});

describe('V2-17 — DA-40 Japan-Vergleich benannt', () => {
    const s = ohneKomm(lies('js/app-tier-meta.js'));
    it('kein „(M3:“ mehr auf der Seite', () => {
        assert.doesNotMatch(s, /\(M3: /);
    });
    it('vorher mit Titel an Platzierung und Share', () => {
        assert.match(s, /'vorher' : 'prev\.'/);
        assert.strictEqual((s.match(/title="\$\{_vorTitel\}">\(\$\{_vorLbl\} \$\{_komma/g) || []).length, 2);
    });
});

describe('V2-17 — DA-51 Sonstige unter der Meta-Performance', () => {
    const s = ohneKomm(lies('js/app-tier-meta.js'));
    it('der Rest wird aus feldGroesseAusAnteilen gerechnet und unter der Tabelle gezeigt', () => {
        assert.match(s, /const sonstigeHtml = \(_feldN > _gelistetN\)/);
        assert.match(s, /'Sonstige: ' \+ fmtPct\(\(_feldN - _gelistetN\) \/ _feldN \* 100\)/);
        assert.match(s, /\$\{sonstigeHtml\}\s*\$\{offenHtml\}/);
    });
});
