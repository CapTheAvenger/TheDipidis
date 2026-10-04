/**
 * F2-02 (04.10.2026, Nachpruefung der Tiefenanalyse): nach einem Besuch der
 * Kartendatenbank stand in der Deck-Analyse „{QUOTE} — LIMITLESS ONLINE
 * TURNIERE". js/app-cards-db.js ruft updateTranslationsInDOM() ohne
 * 'languageChanged' auf; die Module fuellten {quote} nur nach dem Ereignis.
 *
 * AUSGEFUEHRT: die echte updateTranslationsInDOM laeuft auf einem DOM-Stub;
 * die Fuellfunktionen der Module sind am Fenster angemeldet.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ohne = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const I18N = ohne(fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'i18n.js'), 'utf8'));

function element(key) {
  return {
    key, children: [], childNodes: [], innerHTML: '', textContent: '',
    getAttribute: (a) => (a === 'data-i18n' ? key : null),
    hasAttribute: () => false,
  };
}

function lauf(mitFuellern) {
  const a = I18N.indexOf('function updateTranslationsInDOM(');
  const b = I18N.indexOf('\n}\n', a);
  assert.ok(a > -1 && b > a, 'updateTranslationsInDOM fehlt');
  const els = [element('stats.totalWinrate'), element('antiTech.legendWr')];
  const document = {
    querySelectorAll: (sel) => (sel === '[data-i18n]' ? els : []),
    getElementById: () => null,
    documentElement: { style: { setProperty() {} } },
  };
  const window = {};
  const fuellen = () => els.forEach((el) => { el.innerHTML = el.innerHTML.replace(/\{quote\}/g, 'Siegquote'); });
  if (mitFuellern) { window.cmaQuotenNamenImDom = fuellen; window.antiTechQuotenNamenImDom = fuellen; }
  const t = (k) => (k === 'stats.totalWinrate' ? '{quote} — Limitless Online Turniere' : k === 'antiTech.legendWr' ? 'WR = deine {quote}' : k);
  // eslint-disable-next-line no-new-func
  Function('document', 'window', 't', 'Node', 'currentLang', I18N.slice(a, b + 2) + '\nupdateTranslationsInDOM();')(document, window, t, { TEXT_NODE: 3 }, 'de');
  return els;
}

describe('F2-02: kein roher {quote}-Platzhalter nach updateTranslationsInDOM', () => {
  it('die Fuellfunktionen der Module laufen am Ende mit', () => {
    const els = lauf(true);
    els.forEach((el) => assert.ok(!/\{quote\}/i.test(el.innerHTML), 'Platzhalter sichtbar: ' + el.innerHTML));
    assert.equal(els[0].innerHTML, 'Siegquote — Limitless Online Turniere');
  });
  it('ohne angemeldete Module laeuft die Funktion fehlerfrei durch', () => {
    assert.doesNotThrow(() => lauf(false));
  });
});
