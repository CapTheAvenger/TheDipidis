/**
 * UI-147 (Hausi, 24.10.2026): Kartenkachel in "Meine Decks" am iPhone — alle sieben Knoepfe waren 44 px hoch
 * und deckten 72 % der Karte zu. Ursache: css/tippziele.css `button:not(...) { min-height: 44px !important }`
 * unter `pointer: coarse` (Spezifitaet 0,7,1) schlaegt die Klassenregel `.my-deck-card-btn` (0,1,0).
 * Die Regel mit ID + !important holt die Knoepfe auf die Hoehe der Klasse (18 px, <= 900 px: 15 px) zurueck.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wurzel = path.join(__dirname, '..', '..');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '');
const MOBIL = fs.readFileSync(path.join(wurzel, 'css', 'mobile-responsive.css'), 'utf8');
const TIPP = ohneKommentare(fs.readFileSync(path.join(wurzel, 'css', 'tippziele.css'), 'utf8'));

function block(css, selektor) {
  const c = ohneKommentare(css);
  const m = c.match(new RegExp(selektor.replace(/[.*+?^${}()|[\]\\#]/g, '\\$&') + '\\s*\\{([^}]*)\\}'));
  return m ? m[1] : null;
}
// Spezifitaet (ids, klassen/attribute/pseudo, elemente) eines einfachen Selektors; :not(...) zaehlt mit seinem Inhalt
function spez(sel) {
  const s = sel.replace(/\[[^\]]*\]/g, ' [a]');
  let n = s.replace(/:not\(([^)]*)\)/g, ' $1 ');
  const ids = (n.match(/#[\w-]+/g) || []).length;
  const kl = (n.match(/\.[\w-]+|\[a\]/g) || []).length;
  const el = (n.replace(/[#.][\w-]+|\[a\]/g, ' ').match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
  return [ids, kl, el];
}
const gr = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

describe('UI-147 Meine Decks: Kartenknoepfe bleiben klein unter Touch', () => {
  it('Regel mit ID, min-height 0 und !important ist da', () => {
    const b = block(MOBIL, '#decks-grid .my-deck-card-btn');
    assert.ok(b, 'Regel fehlt');
    assert.match(b, /min-height:\s*0\s*!important/);
  });
  it('sie schlaegt die 44-px-Regel aus tippziele.css in der Spezifitaet (beide !important)', () => {
    const t = TIPP.match(/@media \(pointer: coarse\)\s*\{\s*(button:not[^{]*?),/);
    assert.ok(t, '44-px-Regel nicht gefunden');
    assert.ok(gr(spez('#decks-grid .my-deck-card-btn'), spez(t[1])) > 0);
  });
  it('untere Zeile: der Preis bekommt die breiteste Spalte, Kiste nicht umbrechend', () => {
    const z = block(MOBIL, '#decks-grid .my-deck-card-row--four');
    assert.ok(z && /grid-template-columns:\s*2\.6fr/.test(z));
    assert.match(block(MOBIL, '#decks-grid .my-deck-card-btn--coll') || '', /white-space:\s*nowrap/);
  });
  it('Verfaelschungsproben: ohne ID, ohne !important, ohne Regel faellt es auf', () => {
    const k1 = MOBIL.replace('#decks-grid .my-deck-card-btn {', '.my-deck-card-btn {');
    assert.notEqual(k1, MOBIL);
    assert.equal(block(k1, '#decks-grid .my-deck-card-btn'), null);
    const t = TIPP.match(/@media \(pointer: coarse\)\s*\{\s*(button:not[^{]*?),/)[1];
    assert.ok(gr(spez('.my-deck-card-btn'), spez(t)) < 0, 'ohne ID verliert die Klassenregel');
    const k2 = MOBIL.replace('min-height: 0 !important;', 'min-height: 0;');
    assert.doesNotMatch(block(k2, '#decks-grid .my-deck-card-btn'), /min-height:\s*0\s*!important/);
  });
});
