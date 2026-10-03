/**
 * DA-32 (03.10.2026, Tiefenanalyse D-01/D-14): current_meta_card_data.csv
 * nannte Archetypen teils nach dem Slug ("Basic Box M", "Mew Ex 30C"); die
 * Deck-Analyse fand Basic Box (Tier 1) deshalb nicht. Beim Laden werden die
 * Namen jetzt ueber den Slug an labs_tournament_decks.csv angeglichen.
 * Ausgefuehrt (Kommentare entfernt): Umbenennen NUR bei Slug-Treffer, nie
 * ueber Aehnlichkeit; gelesen: der Lader wendet es an.
 * Messwerkzeug fuer die echten Daten: scripts/messe_archetyp_namen_slug.js
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Q = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-core.js'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function laden() {
  const a = Q.indexOf('function slugAusArchetypName(');
  const b = Q.indexOf('window.slugAusArchetypName', a);
  assert.ok(a > -1 && b > a, 'Funktionen fehlen in js/app-core.js');
  // eslint-disable-next-line no-new-func
  return Function(Q.slice(a, b) + '\nreturn { slugAusArchetypName, archetypNamenNachSlug };')();
}
const MAP = { 'basic-box-m': 'Basic Box', 'mew-ex-30c': 'Mew Box', 'cynthias-garchomp': "Cynthia's Garchomp", 'greninja': 'Greninja' };

describe('DA-32: Archetypnamen ueber den Slug', () => {
  const { slugAusArchetypName, archetypNamenNachSlug } = laden();
  it('Slug aus dem Rohnamen ist die Umkehrung von slug_to_archetype', () => {
    assert.equal(slugAusArchetypName('Basic Box M'), 'basic-box-m');
    assert.equal(slugAusArchetypName("Cynthia's Garchomp"), 'cynthias-garchomp');
  });
  it('benennt nur bei Slug-Treffer um', () => {
    const rows = [{ archetype: 'Basic Box M' }, { archetype: 'Mew Ex 30C' }, { archetype: 'Mega Greninja' }, { archetype: 'Seaking' }, { archetype: 'Greninja Box' }];
    const r = archetypNamenNachSlug(rows, MAP);
    assert.deepEqual(rows.map((x) => x.archetype), ['Basic Box', 'Mew Box', 'Mega Greninja', 'Seaking', 'Greninja Box']);
    assert.deepEqual(r.umbenannt, { 'Basic Box M': 'Basic Box', 'Mew Ex 30C': 'Mew Box' });
  });
  it('ohne Zuordnung bleibt alles, wie es ist', () => {
    const rows = [{ archetype: 'Basic Box M' }];
    archetypNamenNachSlug(rows, null);
    assert.equal(rows[0].archetype, 'Basic Box M');
  });
  it('der Lader von current_meta_card_data.csv wendet es an', () => {
    const a = Q.indexOf('async function loadCurrentMetaRowsWithFallback(');
    const teil = Q.slice(a, Q.indexOf('tournament_cards_data_cards.csv', a));
    assert.match(teil, /archetypNamenNachSlug\(primary,\s*await _slugZuArchetypName\(/);
  });
});
