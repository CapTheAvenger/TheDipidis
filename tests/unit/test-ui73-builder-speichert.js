/**
 * UI-73 (03.10.2026, Tiefenanalyse N-02; Entscheidung Hausi: Speichern-Knopf
 * rein): Der Profil-„Deck Builder" speicherte nur im Browser — kein Weg nach
 * „Meine Decks". Jetzt gibt es „In Meine Decks speichern". Ausgefuehrt im
 * Modul: der Knopf-Weg legt ein NEUES Deck an (saveDeck ohne id), fragt den
 * Namen, tut nichts bei leerem Deck, Abbruch oder ohne Anmeldung.
 * Gelesen: der Knopf steht im Deck-Bereich und ruft speichernInsKonto.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-profile-deck-builder.js'), 'utf-8');

function laden() {
  const prev = { window: global.window, document: global.document, localStorage: global.localStorage, fetch: global.fetch };
  global.window = {};
  global.document = { addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [] };
  global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  global.fetch = async () => ({ ok: false });
  try { vm.runInThisContext(SRC); } finally {
    const P = global.window.ProfileDeckBuilder;
    Object.assign(global, { fetch: prev.fetch });
    global.__pdbFenster = global.window; global.window = prev.window;
    return P;
  }
}
const dreepy = { name_en: 'Dreepy', set: 'TWM', number: '128', type: 'Basic', energy_type: 'Dragon' };

describe('UI-73: Profil-Builder speichert in Meine Decks', () => {
  it('angemeldet: fragt den Namen und legt ein neues Deck an', async () => {
    const P = laden(); const w = global.__pdbFenster;
    const gespeichert = [];
    w.saveDeck = (d) => gespeichert.push(d);
    w.auth = { currentUser: { uid: 'x' } };
    w.showInputModal = async (o) => { assert.match(o.message, /Name|name/); return 'ZZ Probe'; };
    P.addCopies(dreepy, 4);
    const prevW = global.window; global.window = w;
    try {
      const r = await P.speichernInsKonto();
      assert.equal(r.ok, true);
    } finally { global.window = prevW; }
    assert.equal(gespeichert.length, 1);
    assert.equal(gespeichert[0].id, undefined, 'ein bestehendes Deck darf nie ueberschrieben werden');
    assert.equal(gespeichert[0].name, 'ZZ Probe');
    assert.deepEqual(gespeichert[0].cards, { 'Dreepy (TWM 128)': 4 });
  });
  it('ohne Anmeldung, leer oder abgebrochen: kein Speichern', async () => {
    const P = laden(); const w = global.__pdbFenster;
    let n = 0; w.saveDeck = () => { n++; };
    const prevW = global.window; global.window = w;
    try {
      assert.equal((await P.speichernInsKonto()).grund, 'leer');
      P.addCopies(dreepy, 2);
      assert.equal((await P.speichernInsKonto()).grund, 'kein-konto');
      w.auth = { currentUser: { uid: 'x' } };
      w.showInputModal = async () => null;
      assert.equal((await P.speichernInsKonto()).grund, 'abgebrochen');
    } finally { global.window = prevW; }
    assert.equal(n, 0);
  });
  it('der Knopf steht im Deck-Bereich und ist verdrahtet', () => {
    assert.match(SRC, /id="pdb-save-account"/);
    assert.match(SRC, /getElementById\('pdb-save-account'\)\.addEventListener\('click',[\s\S]{0,80}speichernInsKonto\(\)/);
  });
});
