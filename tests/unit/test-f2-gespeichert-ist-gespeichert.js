/**
 * F2-01 / F2-04 (04.10.2026, Nachpruefung der Tiefenanalyse):
 * - F2-01: „Als mein Deck speichern" legte das Baukasten-Objekt selbst in
 *   Meine Decks ab (userDecks[i].cards === window.currentMetaDeck). Jede
 *   spaetere Aenderung im Baukasten aenderte still das gespeicherte Deck.
 * - F2-04: danach blieb die Warnung beim Verlassen an, obwohl der Baukasten
 *   genau einem gespeicherten Deck entsprach.
 *
 * AUSGEFUEHRT: saveCurrentDeckToProfile laeuft mit Attrappen fuer Firebase
 * und Dialoge; _ungespeicherteDecks laeuft auf demselben Fenster.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = path.join(__dirname, '..', '..');
const ohne = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const FC = ohne(fs.readFileSync(path.join(W, 'js', 'firebase-collection.js'), 'utf8'));
const DB = ohne(fs.readFileSync(path.join(W, 'js', 'app-deck-builder.js'), 'utf8'));

function block(src, start, ende) {
  const a = src.indexOf(start);
  const b = src.indexOf(ende, a);
  assert.ok(a > -1 && b > a, 'Block fehlt: ' + start);
  return src.slice(a, b + ende.length);
}

function aufbau() {
  const geschrieben = [];
  const w = {
    currentMetaDeck: { 'Dreepy (TWM 128)': 4, 'Ultra Ball (SVI 196)': 4 },
    currentMetaArchetype: 'Dragapult ex',
    userDecks: [],
    addEventListener() {},
  };
  const umgebung = {
    window: w,
    auth: { currentUser: { uid: 'ZZ-TEST' } },
    db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: (id) => (id ? { set: (p) => { geschrieben.push(JSON.parse(JSON.stringify(p))); return Promise.resolve(); } } : { id: 'neu1' }) }) }) }) },
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'ts' } } },
    showNotification() {}, showAuthModal() {}, updateDecksUI() {}, _writeDeckBackup() {},
    fcText: (k, d) => d, t: (k) => k, confirm: () => true,
    showInputModal: async () => 'ZZ-TEST Deck',
    chooseDeckFolderWithCreate: async () => '',
  };
  const namen = Object.keys(umgebung);
  // eslint-disable-next-line no-new-func
  const speichern = Function(...namen, block(FC, 'async function saveCurrentDeckToProfile(', '\n}\n') + '\nreturn saveCurrentDeckToProfile;')(...namen.map((n) => umgebung[n]));
  // eslint-disable-next-line no-new-func
  const ungespeichert = Function('window', block(DB, 'function _deckFingerabdruck(', 'window._ungespeicherteDecks = _ungespeicherteDecks;') + '\nreturn _ungespeicherteDecks;')(w);
  return { w, speichern, ungespeichert, geschrieben };
}

describe('F2-01: gespeichert ist gespeichert', () => {
  it('Aenderungen im Baukasten nach dem Speichern aendern das gespeicherte Deck nicht', async () => {
    const s = aufbau();
    await s.speichern('currentMeta');
    assert.equal(s.w.userDecks.length, 1);
    assert.notEqual(s.w.userDecks[0].cards, s.w.currentMetaDeck, 'gespeichertes Deck teilt das Objekt mit dem Baukasten');
    s.w.currentMetaDeck['Meowth ex (POR 59)'] = 1;
    s.w.currentMetaDeck['Dreepy (TWM 128)'] = 3;
    assert.deepEqual(s.w.userDecks[0].cards, { 'Dreepy (TWM 128)': 4, 'Ultra Ball (SVI 196)': 4 });
    assert.deepEqual(s.geschrieben[0].cards, { 'Dreepy (TWM 128)': 4, 'Ultra Ball (SVI 196)': 4 });
  });
  it('Aenderungen in Meine Decks aendern den Baukasten nicht', async () => {
    const s = aufbau();
    await s.speichern('currentMeta');
    delete s.w.userDecks[0].cards['Ultra Ball (SVI 196)'];
    assert.equal(s.w.currentMetaDeck['Ultra Ball (SVI 196)'], 4);
  });
});

describe('F2-04: nach dem Speichern keine Warnung beim Verlassen', () => {
  it('direkt nach dem Speichern: keine Warnung', async () => {
    const s = aufbau();
    assert.deepEqual(s.ungespeichert(s.w), ['currentMeta']);
    await s.speichern('currentMeta');
    assert.deepEqual(s.ungespeichert(s.w), []);
  });
  it('gleiche Karten in anderer Reihenfolge: keine Warnung', async () => {
    const s = aufbau();
    await s.speichern('currentMeta');
    s.w.currentMetaDeck = { 'Ultra Ball (SVI 196)': 4, 'Dreepy (TWM 128)': 4, 'Leer (X 1)': 0 };
    assert.deepEqual(s.ungespeichert(s.w), []);
  });
  it('Baukasten entspricht einem Deck in Meine Decks: keine Warnung — danach geaendert: Warnung', () => {
    const s = aufbau();
    s.w.userDecks = [{ cards: { 'Ultra Ball (SVI 196)': 4, 'Dreepy (TWM 128)': 4 } }];
    assert.deepEqual(s.ungespeichert(s.w), []);
    s.w.currentMetaDeck['Dreepy (TWM 128)'] = 3;
    assert.deepEqual(s.ungespeichert(s.w), ['currentMeta']);
  });
});
