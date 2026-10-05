/**
 * UI-83 (03.10.2026, Tiefenanalyse N-21/F-26): „Dieses Deck löschen?" und
 * „Diesen Match-Eintrag löschen?" nannten nicht, WAS geloescht wird — bei
 * 14 Knoepfen je Deckzeile die einzige Bremse vor einem Fehlklick. Die
 * Box-Loeschung nannte ihren Namen schon. Ausgefuehrt: die Texte in beiden
 * Sprachen tragen {name}; gelesen: beide Aufrufer ersetzen {name}.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const W = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(W, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function texte() {
  const q = lies('js/i18n.js');
  const a = q.indexOf('const translations = {');
  assert.ok(a > -1, 'const translations fehlt in js/i18n.js');
  // Nur die Tabelle ausfuehren: bis zur ersten Zeile, die mit "};" schliesst.
  const b = q.indexOf('\n};', a);
  const ctx = vm.createContext({});
  vm.runInContext(q.slice(a, b + 3) + '\nthis.T = translations;', ctx);
  assert.ok(ctx.T && ctx.T.de && ctx.T.en, 'Uebersetzungstabelle nicht gefunden');
  return ctx.T;
}

describe('UI-83: Loeschen nennt, was geloescht wird', () => {
  const T = texte();
  for (const k of ['deck.deleteConfirm', 'bj.deleteEntryConfirm']) {
    it(`${k} traegt {name} (de und en)`, () => {
      assert.match(T.de[k], /\{name\}/);
      assert.match(T.en[k], /\{name\}/);
    });
  }
  it('Deck-Loeschen setzt den Decknamen ein', () => {
    const q = ohneKommentare(lies('js/firebase-collection.js'));
    // UI-104 (05.10.2026): die Frage laeuft ueber den App-Dialog; der Name bleibt drin.
    assert.match(q, /const _frage = t\('deck\.deleteConfirm'\)\.replace\('\{name\}',\s*_deckName\);/);
    assert.match(q, /zeigeBestaetigung\(\{ text: _frage, gefaehrlich: true \}\)/);
  });
  it('Journal-Loeschen setzt den Eintrag ein', () => {
    const q = ohneKommentare(lies('js/battle-journal.js'));
    assert.match(q, /bj\.deleteEntryConfirm'[^)]*\)\.replace\('\{name\}',\s*_eintragName\)/);
  });
});
