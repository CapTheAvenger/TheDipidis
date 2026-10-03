/**
 * Rutsch O (03.10.2026) — eigene Archetyp-Box und Deckliste einfuegen.
 * Hausi: "legt man die Box an mit Namen, da kann ich Decklisten einfuegen,
 * und es wird immer abgeglichen was schon drin ist und nur das ergaenzt was
 * noch fehlt." Die Logik wird AUSGEFUEHRT; die Verdrahtung wird gelesen.
 *
 * Zusagen:
 *  1. Die Liste wird gelesen (mehrere Schreibweisen); Ueberschriften zaehlen
 *     nicht; alles andere ohne Set + Nummer landet sichtbar in `unlesbar`.
 *  2. Nur Fehlendes kommt dazu. Zweites Einfuegen derselben Liste aendert
 *     nichts; ein anderer Druck derselben Karte gilt als schon drin.
 *  3. Zugeordnet wird nie ueber den Namen — zwei Karten gleichen Namens mit
 *     anderem Set/Nummer und ohne gemeinsamen Druck bleiben zwei Karten.
 *  4. Anzahl: hoechste Anzahl ueber alle Listen, nie abgezogen; Karten aus
 *     Turnierdaten behalten ihre Datenzahl.
 *  5. Eigene Boxen werden vom Aktualisieren nicht angefasst.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../../js/archetyp-box.js');
const QUELLE = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'archetyp-box.js'), 'utf8');
const lies = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

const karte = (set, number, name, refs) => ({ id: L.kartenId(set, number), name, set, number, bild: '', typ: 'Pokemon',
  element: '', anzahl: 1, maxAnzahl: 0, anteil: null, refs: refs || [] });
const leer = () => L.neueEigeneBox('Rotom', '2026-10-03');

describe('Rutsch O: Liste lesen', () => {
  it('Limitless-, PTCGL- und x-Schreibweise', () => {
    const r = L.deckzeilenLesen('3 Mow Rotom (DRI 9)\n2x Rotom ex PFL 29\n4 Basic Lightning Energy MEE 012\r\n1 Night Stretcher (SFA 61)');
    assert.deepEqual(r.zeilen.map((z) => [z.n, z.set, z.number]),
      [[3, 'DRI', '9'], [2, 'PFL', '29'], [4, 'MEE', '012'], [1, 'SFA', '61']]);
    assert.equal(r.zeilen[0].name, 'Mow Rotom');
    assert.deepEqual(r.unlesbar, []);
  });
  it('Ueberschriften und Leerzeilen zaehlen nicht, unlesbare Zeilen werden genannt', () => {
    const r = L.deckzeilenLesen('Pokémon: 8\n\n3 Mow Rotom (DRI 9)\nTrainer: 30\nTotal Cards: 60\nirgendwas ohne Zahl\n2 Karte ohne Nummer');
    assert.equal(r.zeilen.length, 1);
    assert.deepEqual(r.unlesbar, ['irgendwas ohne Zahl', '2 Karte ohne Nummer']);
  });
});

describe('Rutsch O: nur Fehlendes ergaenzen', () => {
  const liste = [{ eintrag: karte('DRI', '9', 'Mow Rotom'), n: 3 }, { eintrag: karte('PFL', '29', 'Rotom ex', ['PFL-111']), n: 2 }];
  it('erstes Einfuegen legt beide Karten an, mit Soll-Anzahl und Marke', () => {
    const e = L.listeEinlegen(leer(), liste, '2026-10-03');
    assert.equal(e.hinzu.length, 2);
    assert.deepEqual(e.box.karten.map((k) => [k.id, k.gefordert, k.status, k.aus]), [['DRI-9', 3, 'fehlt', 'liste'], ['PFL-29', 2, 'fehlt', 'liste']]);
  });
  it('zweites Einfuegen derselben Liste aendert nichts', () => {
    const a = L.listeEinlegen(leer(), liste, '2026-10-03');
    const b = L.listeEinlegen(a.box, liste, '2026-10-04');
    assert.equal(b.hinzu.length, 0);
    assert.equal(b.schon.length, 2);
    assert.equal(b.box.karten.length, 2);
    assert.deepEqual(b.box.karten.map((k) => k.gefordert), [3, 2]);
  });
  it('anderer Druck derselben Karte gilt als schon drin', () => {
    const a = L.listeEinlegen(leer(), liste, '2026-10-03');
    const b = L.listeEinlegen(a.box, [{ eintrag: karte('PFL', '111', 'Rotom ex', ['PFL-29']), n: 2 }], '2026-10-04');
    assert.equal(b.hinzu.length, 0);
    assert.equal(b.box.karten.length, 2);
  });
  it('gleicher Name, anderer Set/Nummer ohne gemeinsamen Druck: zwei Karten (nie ueber den Namen)', () => {
    const a = L.listeEinlegen(leer(), [{ eintrag: karte('AAA', '1', 'Gleicher Name'), n: 1 }], '2026-10-03');
    const b = L.listeEinlegen(a.box, [{ eintrag: karte('BBB', '2', 'Gleicher Name'), n: 1 }], '2026-10-03');
    assert.equal(b.box.karten.length, 2);
  });
  it('eine zweite Liste ergaenzt nur die fehlende Karte und hebt die Anzahl an, ohne je zu senken', () => {
    const a = L.listeEinlegen(leer(), liste, '2026-10-03');
    const b = L.listeEinlegen(a.box, [{ eintrag: karte('DRI', '9', 'Mow Rotom'), n: 4 }, { eintrag: karte('PFL', '29', 'Rotom ex'), n: 1 },
      { eintrag: karte('SVI', '181', 'Nest Ball'), n: 4 }], '2026-10-04');
    assert.deepEqual(b.hinzu.map((k) => k.id), ['SVI-181']);
    assert.deepEqual(b.erhoeht.map((e) => [e.karte.id, e.von, e.auf]), [['DRI-9', 3, 4]]);
    assert.deepEqual(b.box.karten.map((k) => [k.id, k.gefordert]), [['DRI-9', 4], ['PFL-29', 2], ['SVI-181', 4]]);
  });
  it('dieselbe Karte zweimal in einer Liste (auch zwei Drucke) zaehlt zusammen', () => {
    const e = L.listeEinlegen(leer(), [{ eintrag: karte('PFL', '29', 'Rotom ex', ['PFL-111']), n: 1 },
      { eintrag: karte('PFL', '111', 'Rotom ex', ['PFL-29']), n: 1 }], '2026-10-03');
    assert.equal(e.box.karten.length, 1);
    assert.equal(e.box.karten[0].gefordert, 2);
  });
  it('Karte aus Turnierdaten behaelt ihre Datenzahl, eigene Eintraege (drin) bleiben', () => {
    const b0 = L.neueBox({ name: 'X', archetyp: 'X' }, [{ id: 'DRI-9', name: 'Mow Rotom', set: 'DRI', number: '9', maxAnzahl: 2, anteil: 50, typ: 'Pokemon', refs: [] }], '2026-10-03');
    b0.karten[0].drucke = [{ id: 'DRI-9', set: 'DRI', number: '9', n: 2 }];
    const e = L.listeEinlegen(b0, [{ eintrag: karte('DRI', '9', 'Mow Rotom'), n: 4 }], '2026-10-04');
    assert.equal(e.box.karten[0].gefordert, 2);
    assert.equal(e.schon.length, 1);
    assert.equal(L.drin(e.box.karten[0]), 2);
  });
  it('die Eingabebox wird nicht veraendert', () => {
    const b = leer();
    L.listeEinlegen(b, liste, '2026-10-03');
    assert.equal(b.karten.length, 0);
  });
  it('Namens-Gegenprobe: enthaltene Namen vertragen sich, fremde nicht', () => {
    assert.ok(L.namenVertragen('Basic Lightning Energy', 'Lightning Energy'));
    assert.ok(!L.namenVertragen('Arven', 'Nest Ball'));
  });
});

describe('Rutsch O: Verdrahtung', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('eigene Boxen sind eigen und ohne Archetyp', () => {
    const b = leer();
    assert.equal(L.istEigen(b), true);
    assert.equal(b.archetyp, '');
    assert.equal(L.istEigen({ archetyp: 'X' }), false);
  });
  it('Aktualisieren und Abgleich lassen eigene Boxen aus', () => {
    assert.match(QUELLE, /boxen\.slice\(\)\)\s*\.filter\(function \(b\) \{ return !istEigen\(b\); \}\);[^\n]*\n\s*if \(!liste\.length\) return;/);
    assert.match(code, /async function abgleichSpeichern\(box\) \{\s*if \(istEigen\(box\)\) return null;/);
  });
  it('Zuordnung der Liste laeuft ueber Set und Nummer (getCanonicalCardRecord), nicht ueber den Namen', () => {
    const f = code.split('async function listeEinfuegen()')[1].split('\n    }\n')[0];
    assert.match(f, /getCanonicalCardRecord\(z\.set, z\.number\)/);
    assert.ok(!/find\([^)]*\.name/.test(f));
  });
  it('Texte stehen in beiden Sprachen', () => {
    const I = lies('js/i18n.js');
    for (const k of ['abx.eigenKnopf', 'abx.eigenAnlegen', 'abx.listeKnopf', 'abx.listeErgebnis', 'abx.listeUnlesbar', 'abx.listeUnbekannt', 'abx.metaEigen', 'abx.markeListe']) {
      assert.equal(I.split("'" + k + "':").length - 1, 2, k);
    }
  });
  it('"Eigene Box anlegen" steht oben, vor der Kartenliste (Hausi 03.10.: sonst nicht zu finden)', () => {
    const z = code.split('wurzel.innerHTML = kopf + hinweis')[1].split(';')[0];
    assert.ok(z.indexOf('eigeneBoxBlock()') >= 0 && z.indexOf('eigeneBoxBlock()') < z.indexOf('hauptteil'), z);
    assert.ok(z.indexOf('eigeneBoxBlock()') < z.indexOf('filterLeiste'));
  });
  it('Oeffentliche Funktionen sind ausgeliefert', () => {
    assert.match(QUELLE, /eigeneAnlegen: eigeneAnlegen,\s*listeEinfuegen: listeEinfuegen/);
  });
});

describe('Eigene Box anlegen sieht aus wie ein Knopf (Hausi, 03.10.2026)', () => {
  const fs = require('fs');
  const path = require('path');
  const QUELLE2 = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'archetyp-box.js'), 'utf8');
  const CSS = fs.readFileSync(path.join(__dirname, '..', '..', 'css', 'archetyp-box.css'), 'utf8');
  it('summary traegt btn btn-primary', () => {
    assert.match(QUELLE2, /<details class="abx-eigen"><summary class="btn btn-primary abx-eigen-knopf">/);
  });
  it('auch das Einfuegefeld (Deckliste einfuegen) ist ein Knopf und das Feld gross genug', () => {
    assert.match(QUELLE2, /<details class="abx-liste"[^>]*><summary class="btn btn-primary abx-eigen-knopf">/);
    assert.match(CSS, /\.abx-liste textarea \{[^}]*min-height: 16em[^}]*font-size: 16px/);
  });
  it('CSS blendet den Pfeil aus und setzt ein Plus davor', () => {
    assert.match(CSS, /summary\.abx-eigen-knopf \{[^}]*list-style: none/);
    assert.match(CSS, /abx-eigen-knopf::before \{ content: '\+'/);
  });
});

describe('Rutsch P: Box-Ansicht (Hausi, 03.10.2026)', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const mk = (id, set, number, name, gef) => ({ id, set, number, name, gefordert: gef });

  it('Kopieren: eine Zeile je Karte, Anzahl = hoechstens gespielt (mind. 1), Format "n Name SET Nr"', () => {
    const z = L.deckzeilenAus([mk('a', 'DRI', '9', 'Mow Rotom', 3), mk('b', 'PFL', '29', 'Rotom ex', 0), mk('c', 'OBF', '186', 'Arven', 4)]);
    assert.deepEqual(z, ['3 Mow Rotom DRI 9', '1 Rotom ex PFL 29', '4 Arven OBF 186']);
  });
  it('Kopieren: dieselbe Karte nur einmal (ueber die ID, nicht den Namen)', () => {
    const z = L.deckzeilenAus([mk('a', 'DRI', '9', 'Mow Rotom', 3), mk('a', 'DRI', '9', 'Mow Rotom', 2), mk('x', 'TWM', '1', 'Mow Rotom', 1)]);
    assert.equal(z.length, 2);
  });
  it('Kopieren: das Ergebnis liest der Deckbuilder-Parser (count, Name, Set, Nummer)', () => {
    const re = /^\s*(\d+)\s+(.+?)\s+([A-Z][A-Z0-9]+)\s+([A-Za-z0-9]+)\s*$/;
    L.deckzeilenAus([mk('a', 'DRI', '9', 'Mow Rotom', 3), mk('c', 'MEE', '4', 'Basic Lightning Energy', 4)]).forEach((zeile) => assert.match(zeile, re));
  });
  it('Kopierknopf haengt an der gefilterten Ansicht und ist verdrahtet', () => {
    assert.match(code, /sichtbareKarten = eintraege\.map\(/);
    assert.match(code, /onclick="ArchetypBox\.kopieren\(\)"/);
    assert.match(code, /kopieren: kopieren,/);
    assert.match(code, /navigator\.clipboard\.writeText\(text\)/);
  });
  it('Eigene Box hat Stufe "eigen" (Balken), auch ohne Formatdaten', () => {
    const b = L.neueEigeneBox('Rotom', '2026-10-03');
    assert.equal(L.boxStufe(b, null), 'eigen');
    assert.equal(L.boxStufe(b, { aktuell: 'X' }), 'eigen');
    assert.equal(L.chipReihe([b], null, null)[0].stufe, 'eigen');
    assert.match(code, /\['gespielt', 'legal', 'raus', 'eigen'\]/);
  });
  it('Keine Namensliste mehr ueber der Kartenansicht', () => {
    assert.ok(!/boxen\.map\(nameVon\)\.join\(', '\)/.test(code), 'Namensliste "Alle Boxen" ist zurueck');
    assert.ok(!/liste: alt\.map\(nameVon\)/.test(code), 'Namensliste "noch nicht abgeglichen" ist zurueck');
  });
  it('Standard-Marke steht an der Einzel- und an der Zusammen-Kachel', () => {
    assert.equal((code.match(/\+ legalMarke\(k\)/g) || []).length, 2);
    assert.match(code, /abx-legal-standard/);
    assert.match(code, /abx-legal-expanded/);
  });
});

describe('Rutsch Q: Umfang der Auswahl mit Kopien (Hausi, 03.10.2026)', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // Hausis eigene Rotom-Auswahl (Standard-legal) vom 03.10.2026: 36 verschiedene Karten, 81 Stueck.
  const LISTE = ['1 Budew PRE 4', '3 Mow Rotom DRI 9', '1 Heat Rotom DRI 43', '1 Psyduck MEP 7', '1 Wash Rotom DRI 61', '1 Rotom DRI 77',
    '2 Rotom ex PFL 29', '1 Flutter Mane PRE 43', "1 Lillie's Clefairy ex JTG 56", '4 Rotom ASC 92', '1 Fezandipiti ex SFA 38',
    '1 Tatsugiri TWM 131', "2 Boss's Orders MEG 114", '2 Carmine PRE 103', "4 Lillie's Determination MEG 119",
    "3 Team Rocket's Petrel ASC 207", '4 Buddy-Buddy Poffin TEF 144', '2 Night Stretcher SFA 61', '3 Poké Pad ASC 198',
    '4 Ultra Ball ASC 213', '3 Wondrous Patch PFL 94', '4 Air Balloon BLK 79', '4 Brave Bangle WHT 80', '4 Counter Gain SSP 169',
    "1 Lillie's Pearl JTG 151", '1 Powerglass SFA 63', '1 Rescue Board TEF 159', '1 Sacred Charm PFL 93', '2 Battle Cage PFL 85',
    "1 Team Rocket's Watchtower ASC 210", '1 Treasure Tracker PRE 131', '1 Fire Energy MEE 2', '3 Grass Energy SVE 1',
    '4 Lightning Energy MEE 4', '7 Psychic Energy SVE 5', '1 Water Energy MEE 3'];
  const karten = LISTE.map((z, i) => {
    const m = z.match(/^(\d+) (.+) ([A-Z0-9]+) (\w+)$/);
    return { id: 'k' + i, name: m[2], set: m[3], number: m[4], gefordert: Number(m[1]) };
  });
  it('Umfang: 36 verschiedene Karten, 81 Stueck mit Kopien', () => {
    assert.deepEqual(L.auswahlUmfang(karten), { karten: 36, stueck: 81 });
  });
  it('Umfang zaehlt wie das Kopieren (gleiche Karte nur einmal, Menge mind. 1)', () => {
    const u = L.auswahlUmfang([karten[1], karten[1], { id: 'z', name: 'X', set: 'TWM', number: '1', gefordert: 0 }]);
    assert.deepEqual(u, { karten: 2, stueck: 4 });
    assert.deepEqual(L.auswahlUmfang([]), { karten: 0, stueck: 0 });
  });
  it('Die Zeile steht ueber der Kartenliste und nutzt die sichtbare Auswahl', () => {
    assert.match(code, /auswahlUmfang\(sichtbareKarten\)/);
    assert.match(code, /filterLeiste\(kontext, ohneFormate, gewaehlt, mitBoxName\) \+ umfangZeile \+ hauptteil/);
  });
});
