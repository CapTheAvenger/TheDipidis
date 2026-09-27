/**
 * UI-29 (27.09.2026): keine doppelten Raender in den Abschnitten.
 *
 * Gemessen mit scripts/messe_leerraum.py (Aktuelles Meta, 390 px):
 * vorher 16 Luecken ab 32 px, zusammen 881 px; nachher 10, zusammen
 * 407 px. Die Luecken kamen aus Raendern, die innerhalb einer Karte ein
 * zweites Mal Abstand gaben. Diese Zusicherung haelt die Regeln fest —
 * es sind CSS-Regeln, also Text; Kommentare werden vorher ausgeschnitten.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const rumpf = (css, sel) => {
    const i = css.indexOf(sel + ' {');
    return i < 0 ? null : css.slice(i, css.indexOf('}', i));
};
const C = ohneKommentare(R('css/components.css'));

test('das Ausschneiden laesst die Regeln stehen', () => {
    const roh = R('css/components.css');
    assert.ok(C.length > roh.length * 0.3);
});

test('die Kopfzeile eines Abschnitts traegt keinen Ueberschriften-Rand', () => {
    assert.match(rumpf(C, '.ds-sec-kopf > .ds-sec-hd') || '', /margin:\s*0;/);
});

test('was zuerst oder zuletzt im Rumpf steht, bringt keinen Aussenrand mit', () => {
    assert.match(C, /\.ds-sec-body > :first-child\s*\{\s*margin-top:\s*0;/);
    assert.match(C, /\.ds-sec-body > :last-child,\s*\n\.ds-sec-body > :last-child > :last-child\s*\{\s*margin-bottom:\s*0;/);
    assert.match(rumpf(C, '.ds-sec-body .tier-section:last-child') || '', /margin-bottom:\s*0/);
});

test('die Heatmap haelt ihren Rand nicht mit !important fest', () => {
    const u = ohneKommentare(R('css/ui-components.css'));
    const r = rumpf(u, '.heatmap-container') || '';
    assert.ok(r, '.heatmap-container nicht gefunden');
    assert.doesNotMatch(r, /margin:[^;]*!important/);
    assert.doesNotMatch(r, /padding:[^;]*!important/);
});

test('die Tier-Huelle traegt ihren Abstand nicht mehr inline', () => {
    for (const f of ['js/app-tier-meta.js', 'js/app-current-meta-analysis.js']) {
        assert.doesNotMatch(ohneKommentare(R(f)), /<div style="margin-bottom: 30px;">/, f);
    }
});
