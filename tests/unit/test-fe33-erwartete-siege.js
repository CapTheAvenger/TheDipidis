/**
 * FE-33 (03.10.2026, Tiefenanalyse F-07/D-05): Meta Call zeigte „Erwartete
 * Siege 4,2" neben der Bilanz 3,6–3,2–1,2 (Dragapult, Regional, 8 Runden).
 * Die Quote r.ev ist S/(S+N); mal Runden genommen zaehlte jedes
 * Unentschieden (14,4 %) als halber Sieg. Richtig: 8 × (1 − 0,1445) × 0,529
 * = 3,6. Die Rechenfunktion wird aus dem Quelltext geschnitten und
 * AUSGEFUEHRT (Kommentare vorher entfernt); dazu wird gelesen, dass das
 * Panel sie mit der Unentschieden-Quote der Bilanz aufruft.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QUELLE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function funktion() {
  const a = QUELLE.indexOf('function _erwarteteSiege(');
  assert.ok(a > -1, '_erwarteteSiege fehlt');
  const b = QUELLE.indexOf('\n  }', a);
  // eslint-disable-next-line no-new-func
  return Function(QUELLE.slice(a, b + 4) + '\nreturn _erwarteteSiege;')();
}

describe('FE-33: Erwartete Siege beachten Unentschieden', () => {
  const f = funktion();
  it('Dragapult-Beispiel aus der Messung: 3,6 statt 4,2', () => {
    assert.equal(Math.round(f(52.9, 8, 0.1445) * 10) / 10, 3.6);
  });
  it('ohne Unentschieden unveraendert', () => {
    assert.equal(f(50, 10, 0), 5);
  });
  it('Quote ausserhalb 0..1 wird begrenzt', () => {
    assert.equal(f(50, 10, 2), 0);
    assert.equal(f(50, 10, NaN), 5);
  });
  it('das Panel rechnet Siege und Band mit der Unentschieden-Quote der Bilanz', () => {
    const p = QUELLE.slice(QUELLE.indexOf('function renderDeckGegenMetaPanel('));
    const panel = p.slice(0, p.indexOf('\n  function ', 10));
    for (const v of ['r.ev', 'r.unten', 'r.oben']) {
      assert.ok(new RegExp('_erwarteteSiege\\(' + v.replace('.', '\\.') + ',\\s*runden,\\s*_uq\\.quote\\)').test(panel),
        `${v} wird nicht ueber _erwarteteSiege mit _uq.quote gerechnet`);
    }
    assert.ok(panel.indexOf('const _uq') < panel.indexOf('_erwarteteSiege(r.ev'), '_uq wird erst nach der Siegrechnung gesetzt');
  });
});
