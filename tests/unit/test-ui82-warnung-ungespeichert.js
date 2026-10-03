/**
 * UI-82 (03.10.2026, Tiefenanalyse N-12): Neuladen verwarf das gebaute Deck
 * ohne Warnung. Ausgefuehrt: _ungespeicherteDecks nennt genau die Quellen
 * mit Karten, deren Stand nicht so gespeichert wurde; der beforeunload-
 * Zuhoerer haelt an, solange eine da ist. Gelesen: das Speichern setzt den
 * Vergleichsstand.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = path.join(__dirname, '..', '..');
const ohne = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DB = ohne(fs.readFileSync(path.join(W, 'js', 'app-deck-builder.js'), 'utf8'));

function laden(w) {
  const a = DB.indexOf('function _ungespeicherteDecks(');
  const b = DB.indexOf('\n}\n', DB.indexOf("addEventListener('beforeunload'", a));
  assert.ok(a > -1 && b > a, 'Block fehlt');
  // eslint-disable-next-line no-new-func
  return Function('window', DB.slice(a, b + 2) + '\nreturn _ungespeicherteDecks;')(w);
}
function fenster() {
  const w = { cityLeagueDeck: {}, currentMetaDeck: {}, pastMetaDeck: {}, h: [] };
  w.addEventListener = (typ, f) => w.h.push([typ, f]);
  return w;
}
const ereignis = () => ({ abgebrochen: false, returnValue: undefined, preventDefault() { this.abgebrochen = true; } });

describe('UI-82: Warnung vor ungespeichertem Deck', () => {
  it('leeres Deck: keine Warnung', () => {
    const w = fenster(); const f = laden(w);
    assert.deepEqual(f(w), []);
    const e = ereignis(); w.h.find((x) => x[0] === 'beforeunload')[1](e);
    assert.equal(e.abgebrochen, false);
  });
  it('gebautes, nicht gespeichertes Deck: Warnung', () => {
    const w = fenster(); const f = laden(w);
    w.currentMetaDeck = { 'Dreepy (TWM 128)': 4 };
    assert.deepEqual(f(w), ['currentMeta']);
    const e = ereignis(); w.h.find((x) => x[0] === 'beforeunload')[1](e);
    assert.equal(e.abgebrochen, true);
  });
  it('genau so gespeichert: keine Warnung — danach geaendert: wieder Warnung', () => {
    const w = fenster(); const f = laden(w);
    w.currentMetaDeck = { 'Dreepy (TWM 128)': 4 };
    w.__deckZuletztGespeichert = { currentMeta: JSON.stringify(w.currentMetaDeck) };
    assert.deepEqual(f(w), []);
    w.currentMetaDeck['Dreepy (TWM 128)'] = 3;
    assert.deepEqual(f(w), ['currentMeta']);
  });
  it('das Speichern setzt den Vergleichsstand', () => {
    const q = ohne(fs.readFileSync(path.join(W, 'js', 'firebase-collection.js'), 'utf8'));
    assert.match(q, /window\.__deckZuletztGespeichert\[source\]\s*=\s*JSON\.stringify\(deck\)/);
  });
});
