/**
 * UI-81 (03.10.2026, Tiefenanalyse F-10, von D bestaetigt): Die Deck-Analyse
 * schrieb den Archetyp nie in die Adresse. Nach einem Wechsel von
 * „Mega Excadrill" auf „Dragapult" stand weiter deck=Mega Excadrill in der
 * URL — Neuladen und Teilen zeigten das falsche Deck. Die Funktion wird aus
 * dem Quelltext geschnitten und AUSGEFUEHRT (Kommentare entfernt); gelesen
 * wird, dass loadCurrentMetaDeckData sie als Erstes aufruft.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-current-meta-analysis.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function fn() {
  const a = Q.indexOf('function _deckInAdresse(');
  assert.ok(a > -1, '_deckInAdresse fehlt');
  const b = Q.indexOf('\n        }', a);
  // eslint-disable-next-line no-new-func
  return Function('window', Q.slice(a, b + 10) + '\nreturn _deckInAdresse;')({});
}
const stub = (hash) => {
  const loc = { hash };
  const hist = { state: null, calls: [], replaceState(s, t, u) { this.calls.push(u); loc.hash = u; } };
  return { loc, hist };
};

describe('UI-81: die Adresse nennt das gewaehlte Deck', () => {
  const f = fn();
  it('Deckwechsel ersetzt das alte Deck in der Adresse', () => {
    const { loc, hist } = stub('#current-analysis?deck=Mega%20Excadrill');
    f('Dragapult', loc, hist);
    assert.equal(loc.hash, '#current-analysis?deck=Dragapult');
    assert.equal(hist.calls.length, 1);
    assert.equal(new URLSearchParams(loc.hash.split('?')[1]).get('deck'), 'Dragapult');
  });
  it('Namen mit Apostroph und Leerzeichen kommen unveraendert zurueck', () => {
    const { loc, hist } = stub('#current-analysis');
    f("N's Zoroark", loc, hist);
    assert.equal(new URLSearchParams(loc.hash.split('?')[1]).get('deck'), "N's Zoroark");
  });
  it('leere Auswahl entfernt den Parameter', () => {
    const { loc, hist } = stub('#current-analysis?deck=Dragapult');
    f('', loc, hist);
    assert.equal(loc.hash, '#current-analysis');
  });
  it('auf anderen Reitern wird nichts geschrieben', () => {
    const { loc, hist } = stub('#meta-call');
    assert.equal(f('Dragapult', loc, hist), null);
    assert.equal(hist.calls.length, 0);
  });
  it('loadCurrentMetaDeckData ruft es als Erstes auf', () => {
    const a = Q.indexOf('async function loadCurrentMetaDeckData(archetype) {');
    assert.ok(a > -1);
    assert.match(Q.slice(a, a + 120), /\{\s*_deckInAdresse\(archetype\);/);
  });
});
