/**
 * UI-150 (Hausi, 24.10.2026): Battle Journal, Matchzeile am Handy. Die Textknoepfe Bearbeiten/Loeschen/Kopieren
 * hatten 28 px Breite fuer Woerter von 36-50 px, die Beschriftung lief ineinander, die Textspalte war schmal.
 * Hier: die Regeln im CSS (Kommentare herausgeschnitten); das Mass selbst misst scripts/messe_journal_zeilen.js.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'styles.css'), 'utf8');

function regeln(css) {
  const c = ohneKommentare(css);
  assert.ok(c.length > css.length * 0.3, 'Ausschneiden hat zu viel entfernt');
  const basis = c.match(/\.bj-history-edit-btn,\s*\.bj-history-delete-btn,\s*\.bj-history-copy-btn\s*\{([^}]*)\}/);
  const mobil = c.match(/@media \(max-width: 768px\) \{\s*\.bj-history-item \{[\s\S]*?\.bj-history-item \.bj-history-copy-btn \{[^}]*\}[\s\S]*?\n\}/);
  return { basis: basis && basis[1], mobil: mobil && mobil[0] };
}

describe('UI-150 Journal-Matchzeile', () => {
  it('Textknoepfe haben die Breite des Textes, brechen nicht um', () => {
    const { basis } = regeln(CSS);
    assert.ok(basis, 'Regel fehlt');
    assert.match(basis, /width:\s*auto/);
    assert.match(basis, /white-space:\s*nowrap/);
  });
  it('am Telefon: Match ueber drei Spalten, Knoepfe in eigener Zeile, Pille oben rechts', () => {
    const { mobil } = regeln(CSS);
    assert.ok(mobil, 'Telefonregeln fehlen');
    assert.match(mobil, /\.bj-history-actions\s*\{\s*display:\s*contents/);
    assert.match(mobil, /bj-history-item-main\s*\{[^}]*grid-column:\s*1 \/ 4/);
    assert.match(mobil, /battle-journal-result-pill\s*\{[^}]*grid-column:\s*4/);
    for (const k of ['brick', 'edit', 'delete', 'copy']) assert.match(mobil, new RegExp('bj-history-' + k + '-btn\\s*\\{[^}]*grid-row:\\s*2'));
  });
  it('Verfaelschungsprobe: ohne die Regeln faellt es auf', () => {
    assert.equal(regeln(CSS.replace('white-space: nowrap;\n}\n.bj-history-brick-btn', 'x: y;\n}\n.bj-history-brick-btn')).basis.includes('nowrap'), false);
    assert.equal(regeln(CSS.replace('display: contents;', 'display: flex;')).mobil.includes('display: contents'), false);
  });
});
