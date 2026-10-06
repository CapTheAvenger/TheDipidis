/**
 * UI-117 (05.10.2026): Klarheit — Texte sagen, was passiert.
 * N3-07 „67 / 60“, N3-08 Ziel-Pille nennt den verglichenen Preis, N3-18 „offen“,
 * T3-17 Proxy-Liste, T3-10 Vergleich deutsch, T3-18 Starthand, T3-20 Export-Toasts,
 * Masterclass-Platzhalter weg, Speicher-Toast nennt den Fundort.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lies = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ohne = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const ZUSAGEN = [
  ['js/i18n.js', /'pm\.cardsInDeck':\s+'Verschiedene Karten gespielt \/ Karten je Liste'/],
  ['js/i18n.js', /'cl\.total':\s+'je Liste'/],
  ['js/i18n.js', /'preis\.zielPill':\s+'🎯 ab \{cm\} unter deinem Ziel'/],
  ['js/i18n.js', /'abx\.chipOffenAlle': '\{offen\} Stück noch nicht drin'/],
  ['js/i18n.js', /'abx\.proxysDrucken': 'In die Proxy-Liste \(\{n\}\)'/],
  ['js/i18n.js', /'notif\.deckSavedNamed':\s+'Deck „\{name\}“ gespeichert — du findest es unter Meine Decks\.'/],
  ['js/firebase-collection.js', /t\('preis\.zielPill'\)\.replace\('\{cm\}'/],
  ['js/firebase-collection.js', /'Deck vergleichen' : 'Compare deck'/],
  ['js/draw-simulator.js', /'Chance in der Starthand \(7 Karten\)'/],
  ['js/app-features.js', /`PTCGL-Liste kopiert \(\$\{total\} Karten\)\.`/],
];

function pruefe(lesen) {
  const fehlt = [];
  for (const [f, re] of ZUSAGEN) if (!re.test(lesen(f))) fehlt.push(f + ' ' + re);
  if (/mcl-platz/.test(ohne(lesen('js/ds-masterclass.js')))) fehlt.push('Masterclass-Platzhalter');
  return fehlt;
}

describe('UI-117: Klarheit', () => {
  it('alle Texte stehen', () => { assert.deepEqual(pruefe(lies), []); });
  it('Verfaelschungsprobe: alter Text faellt auf', () => {
    const kaputt = (f) => f === 'js/i18n.js' ? lies(f).replace("'je Liste'", "'Gesamt'") : lies(f);
    assert.equal(pruefe(kaputt).length, 1);
  });
});
