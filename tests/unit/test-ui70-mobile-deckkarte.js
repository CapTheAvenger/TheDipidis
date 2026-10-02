/**
 * UI-70 — DIE DECKKARTE AUF DEM HANDY (03.10.2026).
 *
 * BEFUND (Playwright, 390x844, erste 10 Zeilen): die Deckzelle behielt auf dem
 * Handy `width: 24%` aus der Desktop-Regel (77 px, davon 40 px Innenabstand), der
 * Name bekam 39-96 px und brach in 7 von 10 Zeilen um, der „Details"-Knopf lief
 * ueber den Namen, es gab zwei „Details"-Knoepfe, und vier von sieben Kachel-
 * Beschriftungen wurden abgeschnitten. Nach der Aenderung: 0 von 10 Namen
 * brechen um (360 px: 1 von 10), kein Ueberlappen, 0 von 7 abgeschnitten;
 * Desktop 701/1280 px pixelgleich zur Basis.
 *
 * WAS DIESER TEST PRUEFT — UND WAS NICHT: er liest den Quelltext von
 * css/meta-call.css und verlangt, dass die fuenf Regeln im Block
 * `@media (max-width: 700px)` stehen. Das Layout selbst (Ueberlappung, Umbruch)
 * laesst sich in node nicht messen; es wurde mit Playwright gemessen und muss
 * bei Aenderungen dort neu gemessen werden. NICHT GEPRUEFT: echtes iPhone.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'meta-call.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** Der Inhalt aller `@media (max-width: 700px) { ... }`-Bloecke (Klammern gezaehlt). */
function bloecke700(css) {
  const raus = [];
  let i = css.indexOf('@media (max-width: 700px)');
  while (i >= 0) {
    let j = css.indexOf('{', i), tiefe = 0, k = j;
    for (; k < css.length; k++) {
      if (css[k] === '{') tiefe++;
      else if (css[k] === '}' && --tiefe === 0) break;
    }
    raus.push(css.slice(j + 1, k));
    i = css.indexOf('@media (max-width: 700px)', k);
  }
  return raus.join('\n');
}
const M = bloecke700(CSS);
/** Alle Regelkoerper, deren Selektor GENAU `sel` lautet (am Ende des Kopfes). */
const regeln = (sel) => {
  const raus = [];
  let i = M.indexOf(sel);
  while (i >= 0) {
    const b = M.indexOf('{', i), kopf = M.slice(M.lastIndexOf('}', i) + 1, b).replace(/\s+/g, ' ').trim();
    if (kopf === sel || kopf.endsWith(', ' + sel)) {
      raus.push(M.slice(b + 1, M.indexOf('}', b)));
    }
    i = M.indexOf(sel, i + 1);
  }
  return raus.join('\n');
};
const regel = (sel) => regeln(sel) || null;

describe('UI-70 — Deckkarte mobil', () => {
  it('die Deckzelle erbt die Desktop-Breite nicht mehr', () => {
    const r = regel('.mc-mct-table tr.mc-mct-zeile td.mc-mct-deck');
    assert.ok(r && /width:\s*auto/.test(r), 'td.mc-mct-deck behaelt width: 24% auf dem Handy');
  });
  it('„Details" sitzt in der Ecke und liegt nicht ueber dem Namen', () => {
    const r = regel('#meta-call .mc-mct-deckzeile .mc-row-toggle');
    assert.ok(r && /position:\s*absolute/.test(r) && /min-height:\s*44px/.test(r),
      'der Details-Knopf ist nicht mehr abseits des Namens verankert (oder unter 44 px)');
  });
  it('der zweite „Details"-Knopf entfaellt, die Kacheln bleiben sichtbar', () => {
    const r = regel('.mc-mct-table tr.mc-mct-detail .mc-mobile-detail-toggle');
    assert.ok(r && /display:\s*none/.test(r));
    const k = regel('.mc-mct-table tr.mc-mct-detail .mc-deck-intel-wrap .mc-deck-intel');
    assert.ok(k && /display:\s*flex/.test(k), 'die Kacheln waeren nach dem Aufklappen unsichtbar');
  });
  it('Kachel-Beschriftungen brechen um statt abzuschneiden', () => {
    const r = regel('.mc-mct-table .mc-intel-tile-extra');
    assert.ok(r && /white-space:\s*normal/.test(r) && /overflow:\s*visible/.test(r));
  });
});
