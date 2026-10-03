/**
 * FE-41 (03.10.2026, Tiefenanalyse F-03): Der PTCGL-Import uebernahm die
 * erfundene Karte „Fakemon XYZ 999" still (zaehlte mit, unsichtbar im
 * Raster, ging in den Export) und meldete nicht erkannte Zeilen nur als
 * Zahl. ptcglZeilenLesen wird AUSGEFUEHRT (Kommentare entfernt).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-features.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function laden() {
  const a = Q.indexOf('function ptcglZeilenLesen(');
  const b = Q.indexOf('window.ptcglZeilenLesen = ptcglZeilenLesen;', a);
  assert.ok(a > -1 && b > a);
  // eslint-disable-next-line no-new-func
  return Function(Q.slice(a, b) + '\nreturn ptcglZeilenLesen;')();
}
const DB = { TWM_128: {}, SVI_196: {}, '30C_126': {} };

describe('FE-41: Import nennt, was nicht uebernommen wurde', () => {
  const f = laden();
  const r = f('Pokémon: 5\n4 Dreepy TWM 128\n1 Fakemon XYZ 999\n\nTrainer: 8\n4 Ultra Ball SVI 196\n3 Ultra Ball\n4 Poké Pad 30C 126\nTotal Cards: 13', DB);
  it('unbekannte Karte kommt NICHT ins Deck, sondern in die Liste', () => {
    assert.deepEqual(r.nichtGefunden, ['1 Fakemon XYZ 999']);
    assert.ok(!Object.keys(r.deck).some((k) => /Fakemon/.test(k)));
  });
  it('nicht lesbare Zeile wird woertlich genannt', () => {
    assert.deepEqual(r.nichtErkannt, ['3 Ultra Ball']);
  });
  it('gueltige Zeilen inkl. 30C kommen an, Kopfzeilen zaehlen nicht', () => {
    assert.deepEqual(r.deck, { 'Dreepy (TWM 128)': 4, 'Ultra Ball (SVI 196)': 4, 'Poké Pad (30C 126)': 4 });
    assert.equal(r.zeilen, 3);
  });
  it('der Import nutzt die Funktion und zeigt einen Bericht', () => {
    const a = Q.indexOf('async function importFromPTCGL(');
    const teil = Q.slice(a, Q.indexOf('function ptcglZeilenLesen(', a));
    assert.match(teil, /ptcglZeilenLesen\(ptcglText, cardsBySetNumber\)/);
    assert.match(teil, /deck\.importBerichtTitel/);
    assert.doesNotMatch(teil, /adding anyway/);
  });
});
