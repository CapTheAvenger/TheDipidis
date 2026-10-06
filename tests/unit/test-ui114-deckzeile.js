/**
 * UI-114 (Hausi, 05.10.2026): Deckzeile in "Meine Decks" — sichtbar nur
 * Decklist · Bild · Proxy, alles andere unter "⋯ Mehr"; Post und Post-Seite
 * nur fuer das Betreiber-Konto. Festlegung B in claude/festlegungen.md.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const QUELLE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'firebase-collection.js'), 'utf8');
const ohneKommentare = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function zeile(code) {
  const a = code.indexOf('<div class="deck-action-buttons"');
  const b = code.indexOf('-arrow"', a);
  assert.ok(a > 0 && b > a, 'Deckzeile nicht gefunden');
  return code.slice(a, b);
}
function pruefe(code) {
  const z = zeile(ohneKommentare(code));
  const m = z.indexOf('<details class="deck-mehr"');
  assert.ok(m > 0, 'kein "⋯ Mehr"');
  const vorne = z.slice(0, m);
  const sichtbar = [...vorne.matchAll(/event\.stopPropagation\(\); (\w+)\(/g)].map((x) => x[1]);
  assert.deepEqual(sichtbar, ['copyDeckAndOpenLimitless', 'exportSavedDeckAsImage', 'printSavedDeckProxies']);
  const menue = z.slice(m);
  for (const f of ['toggleDeckActive', 'copyMyDeck', 'copyDeckAndOpenShowdown', 'printSavedDeckMissingProxies',
    'openCompareSavedDeck', 'moveDeckToFolder', 'renameDeck', 'duplicateDeck', 'deleteDeck', 'postSavedDeck(', 'postSavedDeckAufPostSeite']) {
    assert.ok(menue.includes(f), f + ' fehlt im Menue');
  }
  const b = menue.indexOf('${dsIstBetreiber() ? `');
  const e = menue.indexOf("` : ''}", b);
  assert.ok(b > 0 && e > b, 'Post nicht hinter dsIstBetreiber()');
  const post = menue.slice(b, e);
  assert.ok(post.includes('postSavedDeck(') && post.includes('postSavedDeckAufPostSeite('));
  const rest = menue.slice(0, b) + menue.slice(e);
  assert.ok(!/postSavedDeck/.test(rest), 'Post ausserhalb der Betreiber-Pruefung');
}

describe('UI-114: Deckzeile Meine Decks', () => {
  it('drei Knoepfe sichtbar, Rest im Menue, Post nur fuer den Betreiber', () => { pruefe(QUELLE); });
  it('dsIstBetreiber: nur die Betreiber-Uid', () => {
    const a = QUELLE.indexOf("const DS_BETREIBER_UID");
    const b = QUELLE.indexOf('window.dsIstBetreiber');
    const ctx = { window: {} };
    vm.runInNewContext(QUELLE.slice(a, b) + '; this.f = dsIstBetreiber; this.uid = DS_BETREIBER_UID;', ctx);
    ctx.window.auth = { currentUser: { uid: ctx.uid } };
    assert.equal(ctx.f(), true);
    ctx.window.auth = { currentUser: { uid: 'jemand' } };
    assert.equal(ctx.f(), false);
    ctx.window.auth = { currentUser: null };
    assert.equal(ctx.f(), false);
  });
  it('Verfaelschungsprobe: ein vierter sichtbarer Knopf faellt auf', () => {
    const kaputt = QUELLE.replace('<details class="deck-mehr"',
      '<button onclick="event.stopPropagation(); renameDeck(1)">x</button>\n<details class="deck-mehr"');
    assert.notEqual(kaputt, QUELLE);
    assert.throws(() => pruefe(kaputt));
  });
  it('Verfaelschungsprobe: Post ohne Betreiber-Pruefung faellt auf', () => {
    const kaputt = QUELLE.replace('${dsIstBetreiber() ? `', '${true ? `');
    assert.notEqual(kaputt, QUELLE);
    assert.throws(() => pruefe(kaputt));
  });
  it('Menue klappt nach oben auf, wenn unten der Platz fehlt (live 06.10.)', () => {
    const a = QUELLE.indexOf('function dsDeckMehrToggle(');
    const b = QUELLE.indexOf('window.dsDeckMehrToggle');
    const lauf = (unten, oben, quelle, koerper) => {
      const q = quelle || QUELLE;
      const klassen = new Set();
      const menue = { getBoundingClientRect: () => ({ bottom: unten, height: 430 }) };
      const el = { open: true, classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) },
        closest: () => null, querySelector: () => menue, getBoundingClientRect: () => ({ top: oben }) };
      const ctx = { window: { innerHeight: koerper ? 1588 : 988 }, document: { querySelectorAll: () => [],
        body: koerper ? { clientHeight: 1268, getBoundingClientRect: () => ({ top: 0 }) } : null },
        getComputedStyle: () => ({ overflowY: 'auto' }), el };
      vm.runInNewContext(q.slice(q.indexOf('function dsDeckMehrToggle('), q.indexOf('window.dsDeckMehrToggle')) + '; dsDeckMehrToggle(el);', ctx);
      return klassen.has('deck-mehr--oben');
    };
    assert.ok(a > 0 && b > a);
    assert.equal(lauf(1270, 809), true);
    assert.equal(lauf(600, 150), false);
    assert.equal(lauf(1270, 200), false);
    const kaputt = QUELLE.replace("el.classList.add('deck-mehr--oben')", 'void 0');
    assert.notEqual(kaputt, QUELLE);
    assert.equal(lauf(1270, 809, kaputt), false);
    // live 06.10.: Fenster 1588 hoch, gescrollt wird im BODY (1268) — Grenze ist der BODY
    assert.equal(lauf(1456, 995, null, true), true);
    const ohneBody = QUELLE.replace('grenze = Math.min(grenze, sc.getBoundingClientRect().top + sc.clientHeight);', 'void 0;');
    assert.notEqual(ohneBody, QUELLE);
    assert.equal(lauf(1456, 995, ohneBody, true), false);
  });
});
