/**
 * DA-51 (05.10.2026, ohne Datenstands-Chip — der ist Festlegung A, UI-43):
 *  - D3-12: ein Preiswort — Kartendatenbank "Trend" statt "Ø", Hinweis deutsch.
 *  - D3-13: Formate ohne Major-Daten tragen das an der Auswahl
 *    (Quelle data/labs_tournament_decks_verzeichnis.json, nichts geraten).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lies = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ohne = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function pruefe(cdb, pm) {
  const f = [];
  if (!/card-database-price-value">Trend \$\{/.test(cdb)) f.push('Trend');
  if (/card-database-price-value">Ø /.test(cdb)) f.push('Ø');
  if (/title="View on CardMarket"/.test(cdb)) f.push('englischer Hinweis');
  if (!/labs_tournament_decks_verzeichnis\.json/.test(pm)) f.push('Verzeichnis');
  if (!/if \(mitMajor && !mitMajor\.has\(key\)\)/.test(pm)) f.push('Kennzeichen');
  return f;
}

describe('DA-51: Preiswort und Lücken an der Formatauswahl', () => {
  const cdb = ohne(lies('js/app-cards-db.js'));
  const pm = ohne(lies('js/app-past-meta.js'));
  it('Verdrahtung', () => { assert.deepEqual(pruefe(cdb, pm), []); });
  it('Verfaelschungsprobe', () => {
    assert.ok(pruefe(cdb.replace('price-value">Trend ${price', 'price-value">Ø ${price'), pm).includes('Ø'));
    assert.ok(pruefe(cdb, pm.replace('if (mitMajor && !mitMajor.has(key))', 'if (false)')).includes('Kennzeichen'));
  });
});
