/**
 * UI-146 (Hausi, 24.10.2026): das offene "Mehr"-Menue in Meine Decks wurde von
 * der eigenen Zeile abgeschnitten und lag unter den Folgezeilen. Ursache:
 * overflow:hidden an .saved-deck-item (inline UND mobile-responsive.css mit
 * !important). Die Regel hebt das nur fuer die Zeile mit offenem Menue auf.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wurzel = path.join(__dirname, '..', '..');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const CSS = fs.readFileSync(path.join(wurzel, 'css', 'styles.css'), 'utf8');

function regel(css) {
  const c = ohneKommentare(css);
  const m = c.match(/\.saved-deck-item:has\(details\.deck-mehr\[open\]\)\s*\{([^}]*)\}/);
  return m ? m[1] : null;
}

describe('UI-146 Mehr-Menue ueber den Folgezeilen', () => {
  it('die Zeile mit offenem Menue ist ueberlaufend und liegt oben', () => {
    const r = regel(CSS);
    assert.ok(r, 'Regel fehlt');
    assert.match(r, /overflow:\s*visible\s*!important/);
    assert.match(r, /position:\s*relative/);
    const z = Number((r.match(/z-index:\s*(\d+)/) || [])[1]);
    assert.ok(z > 50, 'z-index muss ueber dem Menue (50) liegen');
  });
  it('sie schlaegt die overflow-Regel der Mobil-Datei in der Spezifitaet', () => {
    // .saved-deck-item (0,1,0) mit !important gegen :has() (0,3,1): gleiche Wichtigkeit, hoehere Spezifitaet gewinnt
    const mobil = ohneKommentare(fs.readFileSync(path.join(wurzel, 'css', 'mobile-responsive.css'), 'utf8'));
    assert.match(mobil, /\.saved-deck-item\s*\{[^}]*overflow:\s*hidden\s*!important/);
  });
  it('Verfaelschungsprobe: ohne !important oder ohne die Regel faellt es auf', () => {
    const sel = '.saved-deck-item:has(details.deck-mehr[open])';
    const i = CSS.lastIndexOf(sel);
    assert.ok(i > 0);
    const kaputt = CSS.slice(0, i) + CSS.slice(i).replace('overflow: visible !important;', 'overflow: visible;');
    assert.notEqual(kaputt, CSS);
    assert.equal(regel(kaputt).includes('!important'), false);
    assert.equal(regel(CSS.slice(0, i) + CSS.slice(i).replace(sel, '.x')), null);
  });
});
