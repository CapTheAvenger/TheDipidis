/**
 * UI-34 (27.09.2026): ueberall „Day 2", nie „Tag 2"/„Day two".
 *
 * Gemessen vor dem Umbau (Stand main cca2230): 56 Stellen in sichtbaren
 * Zeichenketten. Die Zusicherung fuehrt das Messwerkzeug aus
 * (scripts/messe_day2_schreibweise.js) — sie prueft also dieselbe Zahl,
 * die der naechste Rutsch misst.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const W = require('../../scripts/messe_day2_schreibweise.js');

test('keine sichtbare Zeichenkette sagt „Tag 2" oder „Day two"', () => {
    const alle = W.messeAlles();
    assert.deepEqual(alle.map(t => `${t.datei}:${t.zeile} ${t.fund}`), []);
});

test('das Werkzeug erkennt die alten Schreibweisen (Gegenprobe)', () => {
    for (const alt of ["'Tag 2'", "'Tag-2-Listen'", "'day-2 list'", "'Day two'", "'Tag-1-Antritte'", "'made day 2.'", "'no second day'"]) {
        assert.equal(W.messe('var x = ' + alt + ';', true).treffer.length, 1, alt);
    }
    for (const neu of ["'Day 2'", "'Day-2-Listen'", "'Day 2 list'", "'Tagebuch 2'", "'day-2-quote'"]) {
        assert.equal(W.messe('var x = ' + neu + ';', true).treffer.length, 0, neu);
    }
});

test('Kommentare zaehlen nicht, und das Ausschneiden laesst Code stehen', () => {
    assert.equal(W.messe('/* Tag 2 */ var a = 1; // Tag 2', true).treffer.length, 0);
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'i18n.js'), 'utf8');
    assert.ok(W.ohneKommentareJs(src).replace(/\s+/g, '').length > src.replace(/\s+/g, '').length * 0.3,
        'das Ausschneiden hat zu viel entfernt');
});
