/**
 * FE-42 (03.10.2026, Tiefenanalyse F-05/F-06): „Meine Decks › PTCGL" schrieb
 * Zeilen- statt Kartenzahlen, Basis-Energien unter Trainer, kein „Total
 * Cards", und suchte Karten ueber den Namen. meinDeckAlsPtcgl wird
 * AUSGEFUEHRT (Kommentare entfernt): Summen = Karten, Art nur ueber
 * (Set, Nummer), beide Knoepfe nutzen sie.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'firebase-collection.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function laden() {
  const a = Q.indexOf('function meinDeckAlsPtcgl(');
  const b = Q.indexOf('if (typeof window !== \'undefined\') window.meinDeckAlsPtcgl', a);
  assert.ok(a > -1 && b > a);
  // Zur Laufzeit gilt die Fassung aus js/app-deck-builder.js (live gemessen).
  const DBQ = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-deck-builder.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const g = DBQ.indexOf('function getCardTypeCategory(');
  const ge = DBQ.indexOf('\n        }\n', g);
  assert.ok(g > -1 && ge > g);
  // eslint-disable-next-line no-new-func
  return Function(DBQ.slice(g, ge + 10) + Q.slice(a, b) + '\nreturn meinDeckAlsPtcgl;')();
}
const DB = [
  { name: 'Dreepy', set: 'TWM', number: '128', type: 'PBasic' },
  { name: 'Ultra Ball', set: 'SVI', number: '196', type: 'Item' },
  { name: 'Fire Energy', set: 'SVE', number: '2', type: 'Energy' },
  { name: 'Dreepy', set: 'XXX', number: '1', type: 'Supporter' },
];

describe('FE-42: ein PTCGL-Export mit richtigen Summen', () => {
  const f = laden();
  const deck = { cards: { 'Dreepy (TWM 128)': 4, 'Ultra Ball (SVI 196)': 4, 'Basic {R} Energy (SVE 2)': 3, 'Unbekannt': 1 } };
  const text = f(deck, DB);
  it('Kopfzahlen sind Karten, nicht Zeilen; Total Cards stimmt', () => {
    assert.match(text, /^Pokémon: 4\n4 Dreepy TWM 128/m);
    assert.match(text, /^Trainer: 5\n/m);
    assert.match(text, /^Energy: 3\n3 Basic \{R\} Energy SVE 2/m);
    assert.match(text, /Total Cards: 12$/);
  });
  it('die Kartenart kommt ueber Set und Nummer, nicht ueber den Namen', () => {
    // „Dreepy" heisst in der Datenbank auch eine Unterstuetzerkarte (XXX 1) —
    // trotzdem bleibt TWM 128 Pokémon; die Energie trotz anderem Namen Energie.
    assert.ok(!/Trainer:[\s\S]*Dreepy/.test(text.split('Energy:')[0].split('Trainer:')[1] || ''));
  });
  it('beide Kopier-Knoepfe nutzen dieselbe Funktion, keine Namenssuche mehr', () => {
    for (const fn of ['function copyMyDeck(', 'function copyDeckAndOpenLimitless(']) {
      const a = Q.indexOf(fn); const teil = Q.slice(a, Q.indexOf('\n}\n', a));
      assert.match(teil, /meinDeckAlsPtcgl\(deck, window\.allCardsDatabase\)/);
      assert.doesNotMatch(teil, /find\(c => c\.name === cardName\)/);
    }
  });
});
