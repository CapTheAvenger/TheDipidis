/**
 * "MEIN DECK" ZEIGT VORSCHLAEGE — AUCH AUF DEM IPHONE (02.10.2026)
 *
 * DER BEFUND: Hausi tippte im Meta Call "Exca" ins Feld "Mein Deck" und sah
 * keinen Vorschlag (Screenshot, iPhone). Das Feld hing an einem <datalist>;
 * Safari auf iOS zeigt davon nur einen Eintrag in der Tastaturleiste, keine
 * Liste unter dem Feld, und passt nur am Wortanfang.
 *
 * DIE REPARATUR: die Seite zeichnet die Liste selbst. Treffer ueberall im
 * Namen, Treffer am Anfang zuerst, Antippen waehlt.
 *
 * Dieser Test FUEHRT die Funktionen aus (Kommentare werden vorher
 * herausgeschnitten), er liest den Quelltext nicht nur.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QUELLE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');
const OHNE_KOMMENTARE = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function funktion(name) {
  const a = OHNE_KOMMENTARE.indexOf('function ' + name + '(');
  assert.ok(a >= 0, name + ' fehlt im Quelltext');
  let i = OHNE_KOMMENTARE.indexOf('{', a), tiefe = 0;
  for (; i < OHNE_KOMMENTARE.length; i++) {
    if (OHNE_KOMMENTARE[i] === '{') tiefe++;
    else if (OHNE_KOMMENTARE[i] === '}' && --tiefe === 0) break;
  }
  return OHNE_KOMMENTARE.slice(a, i + 1);
}

const FELD = [{ name: 'Dragapult' }, { name: 'Mega Excadrill' }, { name: 'Excadrill Garchomp' },
              { name: 'Mega Lucario' }, { name: '_junk' }, { name: 'Excavator' }];

function vorschlaege(val) {
  return new Function('_shareList', funktion('_trefferListe') + funktion('_myDeckVorschlaege') + '\nreturn _myDeckVorschlaege;')(FELD)(val);
}

describe('Vorschlagsliste fuer "Mein Deck"', () => {
  it('"Exca" findet Mega Excadrill — Treffer mitten im Namen zaehlen', () => {
    const r = vorschlaege('Exca');
    assert.ok(r.includes('Mega Excadrill'), 'Mega Excadrill fehlt: ' + JSON.stringify(r));
  });

  it('Treffer am Anfang stehen vor Treffern in der Mitte', () => {
    const r = vorschlaege('exca');
    assert.deepEqual(r, ['Excadrill Garchomp', 'Excavator', 'Mega Excadrill']);
  });

  it('Gross-/Kleinschreibung ist egal, der Platzhalter _junk erscheint nie', () => {
    assert.deepEqual(vorschlaege('JUNK'), []);
    assert.ok(vorschlaege('').indexOf('_junk') < 0);
  });

  it('ohne Eingabe kommt die Liste des Feldes, ohne Treffer eine leere', () => {
    assert.equal(vorschlaege('').length, 5);
    assert.deepEqual(vorschlaege('zzzz'), []);
  });

  it('die Obergrenze liegt bei 12', () => {
    const viele = Array.from({ length: 40 }, (_, i) => ({ name: 'Deck ' + i }));
    const r = new Function('_shareList', funktion('_trefferListe') + funktion('_myDeckVorschlaege') + '\nreturn _myDeckVorschlaege;')(viele)('deck');
    assert.equal(r.length, 12);
  });
});

describe('das Feld haengt an der eigenen Liste, nicht mehr am <datalist>', () => {
  const panel = funktion('renderMyDeckPanel');

  it('keine datalist am Feld "Mein Deck"', () => {
    assert.ok(!/list="mc-my-deck-options"/.test(panel), 'das Feld haengt wieder am datalist');
    assert.ok(!/<datalist id="mc-my-deck-options"/.test(panel));
  });

  it('die Liste ist da und die Ereignisse sind verdrahtet', () => {
    assert.ok(/id="mc-my-deck-vorschlaege"[^>]*role="listbox"/.test(panel));
    assert.ok(/oninput="[^"]*_zeigeMyDeckVorschlaege\(this\.value\)/.test(panel), 'oninput ruft die Liste nicht');
    assert.ok(/onfocus="[^"]*_zeigeMyDeckVorschlaege/.test(panel), 'onfocus ruft die Liste nicht');
  });

  it('die Funktionen sind an MetaCall ausgefuehrt erreichbar (Inline-Handler)', () => {
    for (const n of ['_zeigeMyDeckVorschlaege', '_versteckeMyDeckVorschlaege', '_waehleMyDeckAus', '_myDeckTaste']) {
      assert.ok(new RegExp('\\n\\s+' + n + ',').test(QUELLE), n + ' steht nicht im Export');
    }
  });

  it('Antippen eines Vorschlags waehlt das Deck', () => {
    const protokoll = { gewaehlt: [] };
    const feld = { value: '' }, liste = { hidden: false };
    const doc = { getElementById: (id) => id === 'mc-my-deck' ? feld : liste };
    const f = new Function('document', '_settings', '_onMyDeck',
      funktion('_waehleMyDeckAus') + '\nreturn _waehleMyDeckAus;')(
      doc, { myDeck: '' }, (n) => protokoll.gewaehlt.push(n));
    f({ dataset: { name: 'Mega Excadrill' } });
    assert.deepEqual(protokoll.gewaehlt, ['Mega Excadrill']);
    assert.equal(feld.value, 'Mega Excadrill');
    assert.equal(liste.hidden, true);
  });
});
