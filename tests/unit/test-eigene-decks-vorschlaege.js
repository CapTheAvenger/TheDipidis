/**
 * "EIGENE DECKS" ZEIGT VORSCHLAEGE — AUCH AUF DEM IPHONE (UI-67, 02.10.2026)
 *
 * DER BEFUND: Das Namensfeld unter "Eigene Decks" hing wie "Mein Deck" an
 * einem <datalist>; Safari auf iOS zeigt davon keine Liste unter dem Feld.
 * DIE REPARATUR: dieselbe eigene Vorschlagsliste wie bei "Mein Deck".
 *
 * Dieser Test FUEHRT die Funktionen aus (Kommentare vorher herausgeschnitten).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QUELLE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');
const SRC = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function funktion(name) {
  const a = SRC.indexOf('function ' + name + '(');
  assert.ok(a >= 0, name + ' fehlt im Quelltext');
  let i = SRC.indexOf('{', a), tiefe = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') tiefe++;
    else if (SRC[i] === '}' && --tiefe === 0) break;
  }
  return SRC.slice(a, i + 1);
}

function umgebung(elemente, vorschlaege, gewaehlt) {
  const doc = { getElementById: (id) => elemente[id] || null };
  const body = ['_zeigeCustomVorschlaege', '_waehleCustomAus', '_customTaste']
    .map(funktion).join('\n') + '\nreturn { zeige: _zeigeCustomVorschlaege, waehle: _waehleCustomAus, taste: _customTaste };';
  return new Function('document', '_myDeckVorschlaege', '_onCustomDeckName', 'esc', 'setTimeout', '_versteckeCustomVorschlaege', body)(
    doc, vorschlaege, (i, n) => gewaehlt.push([i, n]), (s) => String(s), (f) => f(), () => {});
}

function feld() {
  const attr = {};
  return { value: '', setAttribute: (k, v) => { attr[k] = v; }, attr };
}

describe('Panel "Eigene Decks"', () => {
  const panel = funktion('renderCustomDecksPanel');
  it('keine datalist mehr', () => {
    assert.ok(!/<datalist/.test(panel), 'datalist ist zurueck');
    assert.ok(!/\blist="/.test(panel));
  });
  it('Liste und Ereignisse sind verdrahtet', () => {
    assert.ok(/id="mc-custom-vorschlaege-\$\{idx\}"[^>]*role="listbox"/.test(panel));
    assert.ok(/oninput="[^"]*_zeigeCustomVorschlaege\(\$\{idx\}, this\.value\)/.test(panel));
    assert.ok(/onkeydown="MetaCall\._customTaste/.test(panel));
  });
  it('Funktionen stehen im Export', () => {
    for (const n of ['_zeigeCustomVorschlaege', '_versteckeCustomVorschlaege', '_waehleCustomAus', '_customTaste']) {
      assert.ok(new RegExp('\\n\\s+' + n + ',').test(QUELLE), n + ' fehlt im Export');
    }
  });
});

describe('Verhalten', () => {
  it('Tippen zeigt die Liste mit allen Treffern', () => {
    const ul = { hidden: true, innerHTML: '' }, inp = feld();
    const u = umgebung({ 'mc-custom-vorschlaege-2': ul, 'mc-custom-name-2': inp }, () => ['Mega Excadrill', 'Excavator'], []);
    u.zeige(2, 'exca');
    assert.equal(ul.hidden, false);
    assert.equal((ul.innerHTML.match(/<li /g) || []).length, 2);
    assert.equal(inp.attr['aria-expanded'], 'true');
  });
  it('kein Treffer oder exakter Einzeltreffer versteckt die Liste', () => {
    const ul = { hidden: false, innerHTML: '' }, inp = feld();
    const u = umgebung({ 'mc-custom-vorschlaege-0': ul, 'mc-custom-name-0': inp }, (v) => v === 'x' ? [] : ['Dragapult'], []);
    u.zeige(0, 'x');
    assert.equal(ul.hidden, true);
    ul.hidden = false;
    u.zeige(0, 'dragapult');
    assert.equal(ul.hidden, true);
  });
  it('Antippen setzt Feld und meldet den Namen an die richtige Zeile', () => {
    const ul = { hidden: false }, inp = feld(), gewaehlt = [];
    const u = umgebung({ 'mc-custom-vorschlaege-3': ul, 'mc-custom-name-3': inp }, () => [], gewaehlt);
    u.waehle(3, { dataset: { name: 'Mega Lucario' } });
    assert.equal(inp.value, 'Mega Lucario');
    assert.equal(ul.hidden, true);
    assert.deepEqual(gewaehlt, [[3, 'Mega Lucario']]);
  });
  it('Enter waehlt den ersten Vorschlag', () => {
    const erster = { dataset: { name: 'Erster' } };
    const ul = { hidden: false, querySelector: () => erster }, inp = feld(), gewaehlt = [];
    const u = umgebung({ 'mc-custom-vorschlaege-1': ul, 'mc-custom-name-1': inp }, () => [], gewaehlt);
    let verhindert = false;
    u.taste(1, { key: 'Enter', preventDefault: () => { verhindert = true; } });
    assert.ok(verhindert);
    assert.deepEqual(gewaehlt, [[1, 'Erster']]);
  });
});
