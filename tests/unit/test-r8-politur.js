/**
 * Rutsch R8 (04.10.2026, Nachpruefung der Tiefenanalyse), Politur:
 * - D2-11: Datenstand-Titel „vor 1 Tagen" (1,8 Tage abgerundet) und
 *   „Aenderung" ohne Umlaut. AUSGEFUEHRT: tageText aus js/ds-datenstand.js.
 * - N2-09: Profil-Builder hiess „Deck Builder", Menue und Reiter „Deck bauen".
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = path.join(__dirname, '..', '..');
const ohne = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const DS = ohne(fs.readFileSync(path.join(W, 'js', 'ds-datenstand.js'), 'utf8'));
const PDB = ohne(fs.readFileSync(path.join(W, 'js', 'app-profile-deck-builder.js'), 'utf8'));

function tageText(sprache) {
  const a = DS.indexOf('function tageText(');
  const b = DS.indexOf('\n    }\n', a);
  assert.ok(a > -1 && b > a, 'tageText fehlt');
  // eslint-disable-next-line no-new-func
  return Function('de', DS.slice(a, b + 6) + '\nreturn tageText;')(() => sprache === 'de');
}

describe('D2-11: Alter des Datenstands im Titel', () => {
  it('deutsch: gerundet, Einzahl richtig', () => {
    const f = tageText('de');
    assert.equal(f(0.2), 'heute');
    assert.equal(f(1.2), 'vor 1 Tag');
    assert.equal(f(1.8), 'vor 2 Tagen');
    assert.equal(f(5), 'vor 5 Tagen');
  });
  it('englisch', () => {
    const f = tageText('en');
    assert.equal(f(1), '1 day ago');
    assert.equal(f(3.4), '3 days ago');
  });
  it('kein „Aenderung" und kein „Tagen" mehr fest im Titel', () => {
    assert.ok(!/Letzte Aenderung/.test(DS));
    assert.ok(!/Math\.floor\(tage\) \+ ' Tagen/.test(DS));
  });
});

describe('N2-09: Profil-Builder heisst wie Menue und Reiter', () => {
  it('deutsche Ueberschrift „Deck bauen", englische „Build a deck"', () => {
    const de = PDB.slice(PDB.indexOf('de: {'), PDB.indexOf('en: {'));
    assert.match(de, /heading:\s*'Deck bauen'/);
    assert.match(PDB.slice(PDB.indexOf('en: {')), /heading:\s*'Build a deck'/);
  });
});
