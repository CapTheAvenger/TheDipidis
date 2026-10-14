/**
 * UI-74 (03.10.2026) hatte „Als mein Deck speichern" direkt unter die
 * Archetyp-Auswahl gesetzt (baute die typische Liste, oeffnete den
 * Speichern-Dialog). UI-141 (Hausi 15.10.2026, iPhone-Screenshot, Knopf rot
 * umkreist): „Was soll der Knopf da? … Das kann weg." — Festlegung A.
 *
 * Geblieben ist aus UI-74 nur „+ Neues Deck" in Meine Decks (UI-97: startet
 * leer). Diese Datei haelt beides: der Knopf und seine Funktion sind weg,
 * „+ Neues Deck" steht noch.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = path.join(__dirname, '..', '..');
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
    .replace(/<!--[\s\S]*?-->/g, '');
const DB = ohneKommentare(fs.readFileSync(path.join(W, 'js', 'app-deck-builder.js'), 'utf8'));
const HTML = ohneKommentare(fs.readFileSync(path.join(W, 'index.html'), 'utf8'));
const I18N = ohneKommentare(fs.readFileSync(path.join(W, 'js', 'i18n.js'), 'utf8'));

describe('UI-141: „Als mein Deck speichern" ist weg (Festlegung A)', () => {
  it('kein Knopf unter der Archetyp-Auswahl, keine Funktion, keine Woerterbuchzeile', () => {
    assert.doesNotMatch(HTML, /deckUebernehmen\(/, 'der Knopf steht noch in index.html');
    assert.doesNotMatch(HTML, /id="btn-deck-uebernehmen"/);
    assert.doesNotMatch(DB, /function deckUebernehmen\(/, 'die Funktion steht noch in app-deck-builder.js');
    assert.doesNotMatch(DB, /window\.deckUebernehmen\s*=/);
    assert.doesNotMatch(I18N, /'deck\.uebernehmen(Erst)?'/);
  });
  it('„+ Neues Deck" in Meine Decks bleibt (UI-97: startet leer)', () => {
    assert.match(HTML, /onclick="[^"]*(ProfileDeckBuilder\.neuesDeck\(\)|switchProfileTab\('deckbuilder'\))[^"]*"[^>]*data-i18n="profile\.newDeck"/);
  });
  it('Verfaelschungsprobe: ein wieder eingebauter Knopf faellt auf', () => {
    const kaputt = HTML.replace('id="currentMetaDeckSelect"',
      'id="currentMetaDeckSelect"></select><button onclick="deckUebernehmen(\'currentMeta\')">x</button><select');
    assert.notEqual(kaputt, HTML);
    assert.throws(() => assert.doesNotMatch(kaputt, /deckUebernehmen\(/));
  });
});
