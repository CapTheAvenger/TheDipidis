/**
 * UI-75 (03.10.2026, Tiefenanalyse N-06): Die beiden Dialoge beim Speichern
 * eines Decks waren fest englisch — „Save Deck", „Enter a name for your
 * deck:", „Save Deck Folder", Vorgabe „My Deck" — auf einer deutschen Seite.
 * Ausgefuehrt: die Texte stehen in beiden Sprachen; gelesen: der Aufrufer
 * holt sie ueber fcText und traegt keinen englischen Festtext mehr.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(W, p), 'utf8');

function texte() {
  const q = lies('js/i18n.js');
  const a = q.indexOf('const translations = {');
  const b = q.indexOf('\n};', a);
  const ctx = vm.createContext({});
  vm.runInContext(q.slice(a, b + 3) + '\nthis.T = translations;', ctx);
  return ctx.T;
}

describe('UI-75: Deck-Speichern auf Deutsch', () => {
  const T = texte();
  const KEYS = ['deck.saveTitle', 'deck.saveMessage', 'deck.saveDefaultName', 'deck.saveFolderTitle'];
  it('alle Texte in de und en, de nicht englisch', () => {
    for (const k of KEYS) {
      assert.ok(T.de[k] && T.en[k], `${k} fehlt`);
      assert.notEqual(T.de[k], T.en[k], `${k}: de = en`);
    }
  });
  it('der Speichern-Weg nutzt die Schluessel, kein englischer Festtext', () => {
    const q = lies('js/firebase-collection.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const a = q.indexOf('const deckName = await showInputModal(');
    assert.ok(a > -1);
    const block = q.slice(a, q.indexOf('if (selectedFolder === null)', a));
    for (const k of KEYS) assert.ok(block.includes(`fcText('${k}'`), `${k} wird nicht benutzt`);
    assert.doesNotMatch(block, /title:\s*'Save Deck/);
    assert.doesNotMatch(block, /message:\s*'Enter a name/);
  });
});
