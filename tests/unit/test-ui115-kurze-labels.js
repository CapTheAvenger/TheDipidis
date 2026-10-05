/**
 * UI-115 (Hausi, 05.10.2026: "kein ⓘ, nur Unsichtbares"): Vorlese-Texte kurz.
 * Gemessen live 05.10.: 50 aria-label > 200 Zeichen auf "Aktuelles Meta" (bis 759).
 * Die Funktion wird AUSGEFUEHRT; die Verdrahtung wird gelesen (Kommentare raus).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const lies = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const UTILS = lies('js/app-utils.js');
const ohne = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function laden(quelle) {
  const a = quelle.indexOf('function dsKurzLabel(');
  const b = quelle.indexOf('if (typeof window', a);
  const ctx = {};
  vm.runInNewContext(quelle.slice(a, b) + '; this.f = dsKurzLabel;', ctx);
  return ctx.f;
}
const LANG = 'Anteil am Online-Meta: der Bruch 1.249 / 12.260. Gezählt ist davon nur der Zähler (Spalte count in data/limitless_online_decks.csv). Der Nenner steht in KEINER Spalte — er ist aus den Anteilen derselben Datei hochgerechnet und daher nur ungefähr, weil Limitless den Rest als Other führt.';

describe('UI-115: kurze Vorlese-Texte', () => {
  const f = laden(UTILS);
  it('erster Satz, nie ueber 142 Zeichen', () => {
    const k = f(LANG);
    assert.ok(k.length <= 142, k.length + ': ' + k);
    assert.ok(k.startsWith('Anteil am Online-Meta: der Bruch 1.249 / 12.260.'));
  });
  it('kurzer Text bleibt unveraendert', () => {
    assert.equal(f('Siege geteilt durch entschiedene Matches.'), 'Siege geteilt durch entschiedene Matches.');
    assert.equal(f(''), '');
  });
  it('ohne Satzende: an Wortgrenze gekuerzt mit …', () => {
    const k = f('wort '.repeat(80));
    assert.ok(k.length <= 142 && k.endsWith(' …'));
  });
  it('Verdrahtung: Kacheln und Begriffe nutzen die Kurzfassung', () => {
    const karte = ohne(lies('js/app-archetype-card.js'));
    assert.equal((karte.match(/window\.dsKurzLabel\(|: String\)\((titleAttr|tip)\)/g) || []).length >= 2, true);
    assert.doesNotMatch(karte, /aria-label="[^`]*\$\{esc\((titleAttr|tip)\)\}/);
    assert.match(ohne(UTILS), /aria-label="\$\{esc\(label\)\}: \$\{esc\(dsKurzLabel\(explanation\)\)\}"/);
  });
  it('Verfaelschungsprobe: ohne Kuerzen faellt die Laengen-Zusage', () => {
    const kaputt = UTILS.replace('if (k.length > grenze) {', 'if (false) {');
    assert.notEqual(kaputt, UTILS);
    assert.throws(() => assert.ok(laden(kaputt)('wort '.repeat(80)).length <= 142));
  });
});
