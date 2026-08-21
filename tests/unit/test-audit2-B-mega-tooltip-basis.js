/**
 * Audit 2, Gruppe B — F18: Der Mega-Initiative-Tooltip (megaTitle) beschriftete
 * einen Wert mit "Basis" bzw. "base", uebergab dort aber den EV-/wesen-inklusiven
 * AKTUELLEN Speed (actualSpeedAt50 / r.speed), nicht den Basiswert. Fix: das Wort
 * "Basis"/"base" durch "aktuell, vor Mega" / "current, pre-Mega" ersetzen; die
 * Argumente/Rechnung bleiben.
 *
 * Test: die ECHTEN megaTitle-Templates werden aus app-side-quest-play.js
 * geschnitten und ausgefuehrt; die Ausgabe fuer diesen Wert darf das Wort
 * "Basis" (de) bzw. das Label "base " (en) nicht mehr tragen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-play.js'), 'utf8');

// Beide megaTitle-Arrowfunktionen (de + en) aus der Quelle ziehen.
function megaTitleFns() {
  const re = /megaTitle:\s*(\(base, mega\) => `[^`]*`)/g;
  const fns = [];
  let m;
  while ((m = re.exec(SRC))) {
    // eslint-disable-next-line no-new-func
    fns.push(new Function('return ' + m[1] + ';')());
  }
  assert.equal(fns.length, 2, 'erwartete 2 megaTitle-Templates (de+en), fand ' + fns.length);
  return fns;
}

describe('F18 — Mega-Tooltip beschriftet den Aktuellwert nicht mehr als "Basis"', () => {
  it('de: Ausgabe enthaelt nicht mehr das Wort "Basis" und weist den Wert als "aktuell, vor Mega" aus', () => {
    const [de] = megaTitleFns();
    // base-Argument = der uebergebene AKTUELLE Speed (EV/Wesen inklusive), z.B. 142.
    const out = de(142, 168);
    assert.ok(!/Basis/.test(out), 'Tooltip nennt den Aktuellwert noch "Basis": ' + out);
    assert.match(out, /aktuell, vor Mega 142/, 'Aktuellwert nicht als "aktuell, vor Mega" ausgewiesen: ' + out);
    assert.ok(out.includes('168'), 'Mega-Wert fehlt');
  });

  it('en: Ausgabe traegt kein "base "-Label mehr, sondern "current, pre-Mega"', () => {
    const en = megaTitleFns()[1];
    const out = en(142, 168);
    assert.ok(!/\bbase \d/.test(out), 'Tooltip nennt den Aktuellwert noch "base": ' + out);
    assert.match(out, /current, pre-Mega 142/, 'Aktuellwert nicht als "current, pre-Mega" ausgewiesen: ' + out);
  });
});
