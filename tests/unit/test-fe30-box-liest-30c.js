/**
 * FE-30 (03.10.2026, Tiefenanalyse F-01): Die Archetyp-Box las das aktuelle
 * Set "30C" nicht — das Setmuster verlangte einen Buchstaben am Anfang.
 * Aus einer 60er-Liste der Seite kamen 23 Karten / 53 Stueck an; "4 Poké Pad
 * 30C 126" und "3 Ultra Ball 30C 128" landeten als „unlesbar". Auch die
 * eigene Kopier-Ausgabe der Box ("1 Alolan Exeggutor 30C 2") war nicht
 * wieder einlesbar. Die Funktion wird AUSGEFUEHRT.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../js/archetyp-box.js');

describe('FE-30: Setkuerzel mit fuehrender Ziffer', () => {
  it('liest 30C in PTCGL- und Limitless-Schreibweise', () => {
    const r = L.deckzeilenLesen('4 Poké Pad 30C 126\n3 Ultra Ball (30C 128)\n1 Alolan Exeggutor 30C 2');
    assert.deepEqual(r.zeilen.map((z) => [z.n, z.name, z.set, z.number]),
      [[4, 'Poké Pad', '30C', '126'], [3, 'Ultra Ball', '30C', '128'], [1, 'Alolan Exeggutor', '30C', '2']]);
    assert.deepEqual(r.unlesbar, []);
  });
  it('eine reine Zahl gilt nie als Set', () => {
    const r = L.deckzeilenLesen('4 Pokégear 30 186\n2 Karte 5');
    assert.equal(r.zeilen.length, 0);
    assert.equal(r.unlesbar.length, 2);
  });
  it('bisherige Schreibweisen bleiben gleich', () => {
    const r = L.deckzeilenLesen('3 Mow Rotom (DRI 9)\n2x Rotom ex PFL 29\n4 Basic Lightning Energy MEE 012\n1 Iono SVP 124');
    assert.deepEqual(r.zeilen.map((z) => [z.set, z.number]), [['DRI', '9'], ['PFL', '29'], ['MEE', '012'], ['SVP', '124']]);
  });
});
