/**
 * "EIGENE DECKS" ZEIGT VORSCHLAEGE — AUCH AUF DEM IPHONE (UI-67, 02.10.2026)
 *
 * DER BEFUND: Das Namensfeld unter "Eigene Decks" hing wie "Mein Deck" an
 * einem <datalist>; Safari auf iOS zeigt davon keine Liste unter dem Feld.
 * DIE REPARATUR: dieselbe eigene Vorschlagsliste wie bei "Mein Deck".
 *
 * UI-71 (03.10.2026): das Panel heisst "Weitere Decks im erwarteten Meta" und
 * bietet NUR Decks an, die oben nicht schon einzeln im Meta stehen und in keiner
 * anderen Zeile eingetragen sind.
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
  return new Function('document', '_customVorschlaege', '_onCustomDeckName', 'esc', 'setTimeout', '_versteckeCustomVorschlaege', '_vorschlaegeEinpassen', body)(
    doc, vorschlaege, (i, n) => gewaehlt.push([i, n]), (s) => String(s), (f) => f(), () => {}, () => {});
}

function feld() {
  const attr = {};
  return { value: '', setAttribute: (k, v) => { attr[k] = v; }, attr };
}

describe('Panel "Weitere Decks im erwarteten Meta"', () => {
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
    for (const n of ['_zeigeCustomVorschlaege', '_versteckeCustomVorschlaege', '_waehleCustomAus', '_customTaste', '_customVorschlaege']) {
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

describe('Vorschlaege: nur Decks, die NICHT schon im Meta stehen (UI-71)', () => {
  /* Die echte Funktion, mit gesetzter Meta-Teilung. */
  function vorschlaege(rest, customDecks, val, idx) {
    const body = ['_trefferListe', '_customVorschlaege'].map(funktion).join('\n')
      + '\nreturn _customVorschlaege;';
    const normalize = (n) => (n || '').toLowerCase().replace(/[\s\-\u0027\u2018\u2019\u201B\u0060\u00B4\u02BC]/g, '');
    return new Function('_feldTeilung', '_feldSortiert', '_customDecks', 'normalize', body)(
      () => ({ genannt: [], rest: rest.map(name => ({ name })) }), () => [], customDecks, normalize)(val, idx);
  }
  it('bietet nur den Restposten an, nie ein Deck aus der Meta-Liste', () => {
    // "Dragapult" steht in `genannt` (oben im Meta) und erscheint deshalb nicht in rest.
    const r = vorschlaege(['Slowking', 'Basic Box'], [{ name: '' }], '', 0);
    assert.deepEqual(r, ['Slowking', 'Basic Box']);
  });
  it('bietet kein Deck an, das in einer ANDEREN Zeile schon steht (auch bei anderer Schreibweise)', () => {
    const r = vorschlaege(['N\u2019s Zoroark', 'Slowking'], [{ name: '' }, { name: "N's Zoroark" }], '', 0);
    assert.deepEqual(r, ['Slowking']);
  });
  it('die eigene Zeile sperrt sich nicht selbst', () => {
    const r = vorschlaege(['Slowking'], [{ name: 'Slowking' }], 'slow', 0);
    assert.deepEqual(r, ['Slowking']);
  });
  it('gekuerzt wird NACH dem Filtern', () => {
    const rest = Array.from({ length: 30 }, (_, i) => 'Deck ' + i);
    const r = vorschlaege(rest, [{ name: '' }, { name: 'Deck 0' }, { name: 'Deck 1' }], '', 0);
    assert.equal(r.length, 12);
    assert.ok(!r.includes('Deck 0') && !r.includes('Deck 1'));
  });
  it('leerer Restposten ("Alle" im Meta) ergibt keine Vorschlaege', () => {
    assert.deepEqual(vorschlaege([], [{ name: '' }], 'x', 0), []);
  });
  it('Quelle ist die Meta-Teilung, nicht die ganze Deckliste', () => {
    const f = funktion('_customVorschlaege');
    assert.ok(/_feldTeilung\(/.test(f) && /\.rest\b/.test(f), 'die Meta-Teilung ist nicht mehr die Quelle');
    assert.ok(!/_shareList/.test(f), 'die ganze Deckliste ist zurueck als Quelle');
  });
});

describe('Einpassen ueber der Tastatur (UI-71)', () => {
  it('die Liste wird nach dem Zeichnen eingepasst', () => {
    assert.ok(/_vorschlaegeEinpassen\(ul, inp\)/.test(funktion('_zeigeCustomVorschlaege')));
  });
  it('rechnet mit visualViewport und Tab-Leiste und begrenzt die Hoehe', () => {
    const f = funktion('_vorschlaegeEinpassen');
    const ul = { style: {}, getBoundingClientRect: () => ({ top: 236, height: 260 }) };
    const inp = { getBoundingClientRect: () => ({ top: 200 }) };
    let gescrollt = 0;
    const win = { innerHeight: 844, visualViewport: { offsetTop: 0, height: 420 }, scrollBy: (x, y) => { gescrollt = y; } };
    const doc = { getElementById: () => ({ offsetHeight: 71, getBoundingClientRect: () => ({ top: 349 }) }) };
    new Function('window', 'document', 'ul', 'inp', f + '\n_vorschlaegeEinpassen(ul, inp);')(win, doc, ul, inp);
    // Unterkante = min(420, 349) - 8 = 341; Oberkante der Liste 236 => Hoehe 105 -> mind. 132
    assert.equal(ul.style.maxHeight, '132px');
    assert.ok(gescrollt > 0, 'die Seite wurde nicht gescrollt, obwohl die Liste unter der Leiste endet');
  });
});
