/**
 * UI-152 (Hausi, 24.10.2026): Deckzeile in "Meine Decks" — alle Aktionen direkt sichtbar, KEIN "Mehr"-Menue
 * (es verschwand am Handy hinter Zeilen, Tableiste und aufgeklapptem Deck). Post/Post-Seite nur fuer das
 * Betreiber-Konto. Loest UI-114 ab (Festlegung B angepasst). Die Masse misst scripts/messe_deckzeile_direkt.js.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const wurzel = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(wurzel, 'js', 'firebase-collection.js'), 'utf8');
const CSS = fs.readFileSync(path.join(wurzel, 'css', 'styles.css'), 'utf8');
const ohneKommentare = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function zeile(code) {
  const a = code.indexOf('<div class="deck-action-buttons"');
  const b = code.indexOf('-arrow"', a);
  assert.ok(a > 0 && b > a, 'Deckzeile nicht gefunden');
  return code.slice(a, b);
}
function pruefe(code, css) {
  const z = zeile(ohneKommentare(code));
  assert.ok(!/<details|deck-mehr|role="menu/.test(z), 'es gibt wieder ein Mehr-Menue');
  const alle = [...z.matchAll(/event\.stopPropagation\(\); (\w+)\(/g)].map((x) => x[1]);
  for (const f of ['copyDeckAndOpenLimitless', 'exportSavedDeckAsImage', 'printSavedDeckProxies', 'toggleDeckActive', 'copyMyDeck',
    'copyDeckAndOpenShowdown', 'printSavedDeckMissingProxies', 'openCompareSavedDeck', 'moveDeckToFolder', 'renameDeck', 'duplicateDeck',
    'deleteDeck', 'postSavedDeck', 'postSavedDeckAufPostSeite']) assert.ok(alle.includes(f), f + ' fehlt in der Deckzeile');
  const b = z.indexOf('${dsIstBetreiber() ? `'), e = z.indexOf("` : ''}", b);
  assert.ok(b > 0 && e > b, 'Post nicht hinter dsIstBetreiber()');
  assert.ok(/postSavedDeck\(/.test(z.slice(b, e)) && /postSavedDeckAufPostSeite\(/.test(z.slice(b, e)));
  assert.ok(!/postSavedDeck/.test(z.slice(0, b) + z.slice(e)), 'Post ausserhalb der Betreiber-Pruefung');
  const c = ohneKommentare(css);
  assert.ok(c.length > css.length * 0.3, 'Ausschneiden hat zu viel entfernt');
  assert.match(c, /\.deck-aktionen-rest \{ display: contents; \}/);
  assert.match(c, /#decks-grid \.saved-deck-item \.deck-action-buttons \{\s*display: grid !important;\s*grid-template-columns: repeat\(4/);
  assert.match(c, /#decks-grid \.saved-deck-item \.deck-action-buttons \.deck-action-btn \{[^}]*height: 38px/);
  assert.match(c, /\.deck-header-row \.deck-action-buttons \{ flex: 1 1 100%/);
}

describe('UI-152: Deckzeile Meine Decks, alles direkt', () => {
  it('alle Knoepfe direkt, Post nur fuer den Betreiber, Raster am Telefon', () => { pruefe(QUELLE, CSS); });
  it('dsIstBetreiber: nur die Betreiber-Uid', () => {
    const a = QUELLE.indexOf('const DS_BETREIBER_UID');
    const b = QUELLE.indexOf('window.dsIstBetreiber');
    const ctx = { window: {} };
    vm.runInNewContext(QUELLE.slice(a, b) + '; this.f = dsIstBetreiber; this.uid = DS_BETREIBER_UID;', ctx);
    ctx.window.auth = { currentUser: { uid: ctx.uid } };
    assert.equal(ctx.f(), true);
    ctx.window.auth = { currentUser: { uid: 'jemand' } };
    assert.equal(ctx.f(), false);
  });
  it('Verfaelschungsprobe: Menue zurueck, fehlender Knopf, Raster weg faellt auf', () => {
    assert.throws(() => pruefe(QUELLE.replace('<div class="deck-aktionen-rest"', '<details class="deck-mehr"'), CSS));
    assert.throws(() => pruefe(QUELLE.replace('duplicateDeck(${deckIndex})', 'x(${deckIndex})'), CSS));
    assert.throws(() => pruefe(QUELLE, CSS.replace('.deck-action-buttons {\n    display: grid !important;', '.deck-action-buttons {\n    display: flex !important;')));
    assert.throws(() => pruefe(QUELLE, CSS.replace('min-height: 0 !important;\n    height: 38px;', 'min-height: 0 !important;\n    height: 44px;')));
  });
});
