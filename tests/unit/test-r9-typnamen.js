/**
 * Entscheidung Hausi (04.10.2026, Tiefenanalyse UI-76/UI-88): die Typnamen
 * folgen der Szenesprache — „Supporter / Item / Tool", wie im Profil-Builder.
 * Vorher sagten die Staples-Kacheln der Tier-Liste „Unterstützer / Items /
 * Ausrüstung"; auf der Seite standen beide Fassungen.
 *
 * AUSGEFUEHRT: STAPLES_ARTEN aus js/app-tier-meta.js wird ausgewertet und mit
 * den Filternamen des Profil-Builders verglichen. Dazu: kein deutscher
 * Typname mehr in einem Oberflaechentext unter js/ (Kommentare entfernt).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = path.join(__dirname, '..', '..');
const ohne = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const TIER = ohne(fs.readFileSync(path.join(W, 'js', 'app-tier-meta.js'), 'utf8'));
const PDB = ohne(fs.readFileSync(path.join(W, 'js', 'app-profile-deck-builder.js'), 'utf8'));

function arten() {
  const a = TIER.indexOf('const STAPLES_ARTEN = [');
  const b = TIER.indexOf('\n        ];', a);
  assert.ok(a > -1 && b > a, 'STAPLES_ARTEN nicht gefunden');
  // eslint-disable-next-line no-new-func
  return new Function(TIER.slice(a, b + 10) + '\nreturn STAPLES_ARTEN;')();
}

describe('Typnamen wie die Szene: Supporter / Item / Tool', () => {
  it('Staples-Kacheln: deutsche Namen = Profil-Builder', () => {
    const de = Object.fromEntries(arten().map((x) => [x.id, x.de]));
    const builder = PDB.slice(PDB.indexOf('de: {'), PDB.indexOf('en: {'));
    const f = (k) => (new RegExp(k + ":\\s*'([^']+)'").exec(builder) || [])[1];
    assert.equal(de.supporter, 'Supporter');
    assert.equal(de.item, 'Item');
    assert.equal(de.tool, 'Tool');
    assert.equal(de.supporter, f('filterTypeSup'));
    assert.equal(de.item, f('filterTypeItm'));
    assert.equal(de.tool, f('filterTypeTool'));
  });
  it('kein „Unterstützer" oder „Ausrüstung" mehr in Oberflaechentexten unter js/', () => {
    const treffer = [];
    for (const d of fs.readdirSync(path.join(W, 'js'))) {
      if (!d.endsWith('.js')) continue;
      const s = ohne(fs.readFileSync(path.join(W, 'js', d), 'utf8'));
      if (/Unterstützer|Ausrüstung/.test(s)) treffer.push(d);
    }
    assert.deepEqual(treffer, []);
  });
});
