/**
 * UI-116 Rest (05.10.2026): englische Vorlese-Texte in Kartendatenbank, Binder,
 * Tech-Lab, Anti-Tech, Testgruppen, Meta Call und Meta-Hub sprechen jetzt die
 * Seitensprache; der Heatmap-Hinweis schreibt "50,9 %" statt "50.9 %".
 * Gelesen wird der Quelltext ohne Kommentare.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const JS = path.join(__dirname, '..', '..', 'js');
const ohne = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FEST_ENGLISCH = /aria-label="(Open \$\{displayName\}|Add \$\{(displayName|safeName)\}|Remove( \$\{| tech card"|")|View \$\{displayName\}|Zoom |Minimum price|Maximum price|Help for Testing Groups|Meta Call mode|Meta &amp; Deck Analysis|Search (main Pokemon|archetype) filter)/;

function pruefe(dateien) {
  const treffer = [];
  for (const [f, t] of dateien) if (FEST_ENGLISCH.test(ohne(t))) treffer.push(f);
  return treffer;
}

describe('UI-116: Mischsprache-Rest', () => {
  const dateien = fs.readdirSync(JS).filter((f) => f.endsWith('.js')).map((f) => [f, fs.readFileSync(path.join(JS, f), 'utf8')]);
  it('kein festes englisches aria-label mehr', () => {
    assert.deepEqual(pruefe(dateien), []);
  });
  it('Heatmap-Hinweis mit Dezimalkomma', () => {
    const t = ohne(fs.readFileSync(path.join(JS, 'app-current-meta.js'), 'utf8'));
    assert.match(t, /winRateRoh\.toLocaleString\(/);
    assert.doesNotMatch(t, /winRateRoh\.toFixed\(1\)\} %/);
    const roh = 50.9;
    assert.equal(roh.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), '50,9');
  });
  it('Verfaelschungsprobe: ein festes englisches Label faellt auf', () => {
    assert.deepEqual(pruefe([['x.js', '`<b aria-label="Remove ${safeName} from collection">`']]), ['x.js']);
  });
});
