/**
 * UI-155 (Hausi, 01.11.2026): die Schliessen-Knoepfe der beiden Karten-Grossansichten duerfen
 * nicht unter der iPhone-Statusleiste liegen. Text-Zusicherung ist hier richtig: der Wert der Regel
 * IST die Aussage (env() laesst sich in Node nicht auswerten).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lies = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ohneKommentare = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function regel(css, wahl) {
    const i = css.indexOf(wahl);
    assert.notEqual(i, -1, 'Regel fehlt: ' + wahl);
    return css.slice(css.indexOf('{', i), css.indexOf('}', i));
}
describe('UI-155 Schliessen-Knopf unter der Statusleiste', () => {
    const css = ohneKommentare(lies('css/close-buttons.css'));
    assert.ok(css.length > lies('css/close-buttons.css').length * 0.3, 'das Ausschneiden hat zu viel entfernt');
    const r = regel(css, '#singleCardModal .single-card-close,\n#fullscreenCardModal .fullscreen-close');
    it('oben und rechts mit dem sicheren Bereich', () => {
        assert.match(r, /top:\s*calc\(env\(safe-area-inset-top,\s*0px\)\s*\+\s*12px\)/);
        assert.match(r, /right:\s*calc\(env\(safe-area-inset-right,\s*0px\)\s*\+\s*12px\)/);
    });
    it('Verfaelschungsprobe: ohne env() faellt die Zusicherung', () => {
        const kaputt = r.replace(/env\(safe-area-inset-top,\s*0px\)\s*\+\s*/, '');
        assert.notEqual(kaputt, r);
        assert.doesNotMatch(kaputt, /top:\s*calc\(env\(safe-area-inset-top/);
    });
    it('beide Knoepfe existieren im Markup mit dieser Klasse', () => {
        const h = lies('index.html');
        assert.ok(/id="singleCardModal"[\s\S]*?class="single-card-close"/.test(h));
        assert.ok(/id="fullscreenCardModal"[\s\S]*?class="fullscreen-close"/.test(h));
    });
});
