/* Battle-Journal-Blatt (Hausi, 05.11.2026): `border-radius: 999px` machte das Blatt am PC zur Ellipse. Jede Regel,
   die `.battle-journal-sheet` allein als Selektor hat, darf nur einen kleinen Radius tragen. Die Regeln werden aus
   dem CSS geschnitten (Kommentare vorher entfernt) und der Radius AUSGEWERTET. */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const roh = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'styles.css'), 'utf8');
const css = roh.replace(/\/\*[\s\S]*?\*\//g, '');
function blattRadien(text) {
    const r = [];
    const re = /(^|[}\s])\.battle-journal-sheet\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(text))) {
        const d = /border-radius:\s*([^;!]+)/.exec(m[2]);
        if (d) (d[1].match(/\d+(?:\.\d+)?px/g) || []).forEach(z => r.push(parseFloat(z)));
    }
    return r;
}
describe('Battle-Journal-Blatt: Radius', () => {
    it('Ausschneiden hat nicht alles entfernt', () => assert.ok(css.length > roh.length * 0.3));
    it('jede Blatt-Regel hat einen Radius unter 40px', () => {
        const r = blattRadien(css);
        assert.ok(r.length >= 3, 'weniger als drei Radien gefunden: ' + r.length);
        assert.ok(r.every(z => z <= 40), 'zu grosser Radius: ' + r.join(','));
    });
    it('die Pruefung beisst: 999px wird erkannt', () => {
        const r = blattRadien('.battle-journal-sheet { border-radius: 999px 999px 0 0; }');
        assert.ok(!r.every(z => z <= 40));
    });
});
