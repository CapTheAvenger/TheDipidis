/**
 * UI-74 (03.10.2026, Tiefenanalyse N-03/F-04): Ein Deck zu speichern kostete
 * 8–9 Klicks; „Speichern" erschien erst nach „Max Consistency" ~6.000 px
 * tiefer. Jetzt: „Als mein Deck speichern" direkt unter der Archetyp-Auswahl
 * und „+ Neues Deck" in Meine Decks (fuehrt zum Profil-Builder, UI-73).
 * deckUebernehmen wird AUSGEFUEHRT (Kommentare entfernt), die Knoepfe gelesen.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = path.join(__dirname, '..', '..');
const DB = fs.readFileSync(path.join(W, 'js', 'app-deck-builder.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const HTML = fs.readFileSync(path.join(W, 'index.html'), 'utf8');

function laden(w) {
  const a = DB.indexOf('async function deckUebernehmen(');
  const b = DB.indexOf('window.deckUebernehmen = deckUebernehmen;', a);
  assert.ok(a > -1 && b > a);
  // eslint-disable-next-line no-new-func
  return Function('window', 'showNotification', 't', DB.slice(a, b) + '\nreturn deckUebernehmen;')(w, () => {}, (k) => k);
}

describe('UI-74: Deck direkt aus der Analyse speichern', () => {
  it('leeres Deck: erst generieren, dann der Speichern-Dialog', async () => {
    const ruf = [];
    const w = { currentMetaArchetype: 'Dragapult', currentMetaDeck: {},
      autoCompleteConsistency: async (s, m) => { ruf.push(['gen', s, m]); w.currentMetaDeck = { 'Dreepy (TWM 128)': 4 }; },
      saveCurrentDeckToProfile: async (s) => { ruf.push(['save', s]); } };
    const r = await laden(w)('currentMeta');
    assert.deepEqual(ruf, [['gen', 'currentMeta', 'min'], ['save', 'currentMeta']]);
    assert.equal(r.generiert, true);
  });
  it('gebautes Deck wird nicht neu generiert', async () => {
    const ruf = [];
    const w = { currentMetaArchetype: 'Dragapult', currentMetaDeck: { 'X (A 1)': 2 },
      autoCompleteConsistency: async () => ruf.push('gen'), saveCurrentDeckToProfile: async () => ruf.push('save') };
    await laden(w)('currentMeta');
    assert.deepEqual(ruf, ['save']);
  });
  it('ohne Archetyp passiert nichts', async () => {
    const ruf = [];
    const w = { currentMetaDeck: {}, autoCompleteConsistency: async () => ruf.push('gen'), saveCurrentDeckToProfile: async () => ruf.push('save') };
    assert.equal((await laden(w)('currentMeta')).grund, 'kein-archetyp');
    assert.deepEqual(ruf, []);
  });
  it('Knoepfe stehen unter der Archetyp-Auswahl und in Meine Decks', () => {
    const sel = HTML.indexOf('id="currentMetaDeckSelect"');
    const knopf = HTML.indexOf("onclick=\"deckUebernehmen('currentMeta')\"");
    assert.ok(knopf > sel && knopf - sel < 600, 'Knopf steht nicht direkt unter der Auswahl');
    assert.match(HTML, /onclick="[^"]*(ProfileDeckBuilder\.neuesDeck\(\)|switchProfileTab\('deckbuilder'\))[^"]*"[^>]*data-i18n="profile\.newDeck"/ /* UI-97 (06.10.2026): startet leer */);
  });
});
