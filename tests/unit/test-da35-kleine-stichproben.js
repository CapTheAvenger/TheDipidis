/**
 * DA-35 (03.10.2026, Tiefenanalyse D-08/D-09):
 *  - Hub: „ist gerade das staerkste Deck" stuetzte sich auf 22 von 179
 *    Antritten; der Satz nennt jetzt die hoechste Top-8-Quote und unter
 *    300 Antritten die Unsicherheit.
 *  - Rogue: Major-Quote aus 4–7 Spielern ohne Hinweis; unter 10 Spielern
 *    steht die Bilanz S–N–U.
 * Gelesen (Kommentare entfernt); der Hub-Satz wird ausserdem in
 * test-hub-gezaehlte-antritte.js ausgefuehrt.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ohne = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const lies = (p) => ohne(fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8'));

describe('DA-35: kleine Stichproben werden benannt', () => {
  it('Hub sagt nicht mehr „das staerkste Deck" und nennt die Unsicherheit', () => {
    const q = lies('js/meta-analysis-hub.js');
    assert.doesNotMatch(q, /ist gerade das stärkste Deck/);
    assert.match(q, /const UNSICHER_UNTER = 300;/);
    assert.match(q, /die Reihenfolge an der Spitze ist unsicher/);
  });
  it('Rogue-Major unter 10 Spielern: Bilanz statt Prozent', () => {
    const q = lies('js/app-tier-meta.js');
    assert.match(q, /const RUTSCH_MIN_SPIELER = 10;/);
    assert.match(q, /_duennMajor\s*\?\s*`\$\{ent\.wins\}–\$\{ent\.losses\}–\$\{ent\.ties\}/);
  });
});
