/**
 * FE-50 (F2-03): Der PTCGL-Import nimmt den Namen aus (Set, Nummer), nie aus
 * der Zeile; „Pokémon (19)" ist eine Kopfzeile; mehr als 4 Kopien (ausser
 * Basis-Energie) und eine Summe ungleich 60 werden gemeldet.
 * ptcglZeilenLesen wird AUSGEFUEHRT (Kommentare entfernt).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q0 = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-features.js'), 'utf8');
const ohne = (q) => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function laden(q) {
  q = ohne(q);
  const a = q.indexOf('function ptcglZeilenLesen(');
  const b = q.indexOf('window.ptcglZeilenLesen = ptcglZeilenLesen;', a);
  return Function(q.slice(a, b) + '\nreturn ptcglZeilenLesen;')();
}
const DB = {
  ASC_160: { name: 'Dragapult ex', type: 'Stage 2' },
  SVE_2: { name: 'Fire Energy', type: 'Basic Energy' },
  SVI_196: { name: 'Ultra Ball', type: 'Item' },
};
const LISTE = 'Pokémon (19)\n1 Pikachu ASC 160\nTrainer (5)\n5 Ultra Ball SVI 196\nEnergy (8)\n8 Fire Energy SVE 2';

describe('FE-50: Import nach Set + Nummer', () => {
  const r = laden(Q0)(LISTE, DB);
  it('Name aus der Datenbank, Umbenennung wird genannt', () => {
    assert.equal(r.deck['Dragapult ex (ASC 160)'], 1);
    assert.ok(!Object.keys(r.deck).some(k => /Pikachu/.test(k)));
    assert.deepEqual(r.umbenannt, ['Pikachu → Dragapult ex (ASC 160)']);
  });
  it('„Pokémon (19)" ist Kopfzeile, nicht „nicht erkannt"', () => {
    assert.deepEqual(r.nichtErkannt, []);
  });
  it('5× Ultra Ball wird gemeldet, 8× Basis-Energie nicht', () => {
    assert.deepEqual(r.ueberVier, ['5× Ultra Ball (SVI 196)']);
  });
  it('Summe wird mitgegeben (14 statt 60)', () => {
    assert.equal(r.summe, 14);
  });
  it('Anzeige nutzt die Hinweise', () => {
    const a = Q0.indexOf('async function importFromPTCGL(');
    const teil = ohne(Q0.slice(a, Q0.indexOf('function ptcglZeilenLesen(', a)));
    assert.match(teil, /gelesen\.summe !== 60/);
    assert.match(teil, /deck\.importUeberVier/);
  });
  it('VERFAELSCHUNG: Name wieder aus der Zeile — Pikachu stuende im Deck', () => {
    const kaputt = Q0.replace("const name = (dbKarte.name || '').trim() || cardName;", 'const name = cardName;');
    assert.notEqual(kaputt, Q0);
    const k = laden(kaputt)(LISTE, DB);
    assert.throws(() => assert.equal(k.deck['Dragapult ex (ASC 160)'], 1));
  });
});
