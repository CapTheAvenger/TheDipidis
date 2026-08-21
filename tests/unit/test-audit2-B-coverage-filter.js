/**
 * Audit 2, Gruppe B — F07: populateDeckCoverageFilter() bot die Schwellen
 * '>= 90%' und '100%' an. Das globale Deck-Coverage-Maximum liegt aber
 * strukturell bei ~84,86 % (Boss's Orders, 1244/1466 Decks, live gemessen
 * 21.08.2026) — beide Optionen trafen NIE (0 Karten). Sie sind entfernt.
 *
 * Test: die ECHTE Funktion aus app-cards-db.js wird herausgeschnitten und mit
 * einem DOM-Stub ausgefuehrt; aus dem gerenderten HTML werden die
 * radio-Werte gelesen. Kommt eine Schwelle >= 90 zurueck, ist die Behebung weg.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-cards-db.js'), 'utf8');

function cutFn(name) {
  const from = 'function ' + name + '(';
  const a = SRC.indexOf(from);
  assert.ok(a > -1, name + ' nicht gefunden');
  // Bis zur Zeile "        }" auf Funktions-Einrueckung schneiden.
  const end = SRC.indexOf('\n        }\n', a);
  assert.ok(end > a, 'Funktionsende ' + name + ' nicht gefunden');
  return SRC.slice(a, end + '\n        }'.length + 1);
}

function runFilter() {
  const container = { innerHTML: '' };
  const document = { getElementById: (id) => (id === 'deckCoverageFilterOptions' ? container : null) };
  const src = cutFn('populateDeckCoverageFilter');
  // eslint-disable-next-line no-new-func
  const make = new Function('document', 'filterAndRenderCards', src + '\nreturn populateDeckCoverageFilter;');
  const fn = make(document, () => {});
  fn();
  return container.innerHTML;
}

describe('F07 — Coverage-Filter bietet keine unerreichbaren Schwellen', () => {
  it('keine radio-Option mit Wert >= 90', () => {
    const html = runFilter();
    const values = [...html.matchAll(/value="(\d+)"/g)].map(m => Number(m[1]));
    assert.ok(values.length > 0, 'gar keine Optionen gerendert');
    const zuHoch = values.filter(v => v >= 90);
    assert.deepEqual(zuHoch, [], 'unerreichbare Schwelle(n) noch da: ' + zuHoch.join(', '));
  });

  it('die erreichbaren Schwellen 50 und 70 bleiben erhalten', () => {
    const html = runFilter();
    const values = [...html.matchAll(/value="(\d+)"/g)].map(m => Number(m[1]));
    assert.ok(values.includes(50) && values.includes(70), 'erreichbare Schwellen fehlen: ' + values.join(', '));
  });

  it('kein "100%"- oder ">= 90%"-Label mehr im Markup', () => {
    const html = runFilter();
    assert.ok(!html.includes('100%'), '100%-Label noch da');
    assert.ok(!html.includes('90%'), '90%-Label noch da');
  });
});
