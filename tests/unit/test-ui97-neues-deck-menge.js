/**
 * UI-97 (Abfragerunde 06.10.2026, „Beides bauen"): „+ Neues Deck“ startet
 * leer — der Entwurf bleibt geparkt und kommt mit einem Klick zurueck —,
 * und jede Trefferkarte hat eine Mengenwahl 1–4. Ausgefuehrt im Modul mit
 * einem echten Schluessel-Wert-Speicher.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-profile-deck-builder.js'), 'utf-8');
const HTML = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf-8').replace(/<!--[\s\S]*?-->/g, '');

function laden(src) {
  const speicher = {};
  const prev = { window: global.window, document: global.document, localStorage: global.localStorage, fetch: global.fetch };
  global.window = {};
  global.document = { addEventListener: () => {}, getElementById: () => null, querySelectorAll: () => [], dispatchEvent: () => {} };
  global.localStorage = { getItem: (k) => (k in speicher ? speicher[k] : null), setItem: (k, v) => { speicher[k] = String(v); }, removeItem: (k) => { delete speicher[k]; } };
  global.fetch = async () => ({ ok: false });
  let P;
  try { vm.runInThisContext(src); P = global.window.ProfileDeckBuilder; } finally {
    global.fetch = prev.fetch; // window bleibt: das Modul liest es beim Aufruf
  }
  return { P, speicher };
}
const dreepy = { name_en: 'Dreepy', set: 'TWM', number: '128', type: 'Basic', energy_type: 'Dragon' };
const boss = { name_en: "Boss's Orders", set: 'MEG', number: '114', type: 'Supporter' };

describe('UI-97: Neues Deck leer, Entwurf bleibt', () => {
  it('neuesDeck parkt den Entwurf und startet leer; Entwurf kommt zurueck', () => {
    const { P, speicher } = laden(SRC);
    P.addCopies(dreepy, 4);
    P.neuesDeck();
    assert.equal(P.countCards(P.getDeck()), 0, 'neues Deck ist leer');
    const geparkt = JSON.parse(speicher['dipidis.profileDeckBuilder.entwurf.v1']);
    assert.equal(P.countCards(geparkt), 4, 'Entwurf ist gespeichert');
    P.setCount(boss, 2);
    assert.equal(P.entwurfOeffnen(), true);
    assert.equal(P.countCards(P.getDeck()), 4, 'Entwurf wieder offen');
    assert.equal(P.countCards(JSON.parse(speicher['dipidis.profileDeckBuilder.entwurf.v1'])), 2,
      'das zwischendurch gebaute Deck ist seinerseits geparkt, nichts geht verloren');
  });
  it('leeres Deck: neuesDeck parkt nichts', () => {
    const { P, speicher } = laden(SRC);
    P.neuesDeck();
    assert.equal(speicher['dipidis.profileDeckBuilder.entwurf.v1'], undefined);
  });
  it('Knopf „+ Neues Deck“ ruft neuesDeck', () => {
    assert.match(HTML, /id="btn-neues-deck"/);
    assert.match(HTML, /ProfileDeckBuilder\.neuesDeck\(\)[^>]*id="btn-neues-deck"/);
  });
  it('VERFAELSCHUNG: ohne Parken waere der Entwurf weg', () => {
    const kaputt = SRC.replace("try { localStorage.setItem(ENTWURF_KEY, JSON.stringify(deck)); }", 'try { }');
    assert.notEqual(kaputt, SRC);
    const { P, speicher } = laden(kaputt);
    P.addCopies(dreepy, 4); P.neuesDeck();
    assert.throws(() => assert.ok(speicher['dipidis.profileDeckBuilder.entwurf.v1']));
  });
});

describe('UI-97: Mengenwahl 1–4', () => {
  it('setzt die Anzahl direkt, nach oben und unten', () => {
    const { P } = laden(SRC);
    assert.equal(P.setCount(boss, 3), 3);
    assert.equal(P.countOf(boss), 3);
    assert.equal(P.setCount(boss, 1), 1);
    assert.equal(P.countOf(boss), 1);
    assert.equal(P.setCount(boss, 9), 4, 'nie ueber 4');
  });
  it('VERFAELSCHUNG: ohne Obergrenze waeren 9 Kopien moeglich', () => {
    const kaputt = SRC.replace('Math.min(MAX_PER_CARD, Math.floor(Number(n) || 0))', 'Math.floor(Number(n) || 0)');
    assert.notEqual(kaputt, SRC);
    const { P } = laden(kaputt);
    assert.throws(() => assert.equal(P.setCount(boss, 9), 4));
  });
});
