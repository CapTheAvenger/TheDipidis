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
    assert.match(CSS, /\.abx-liste textarea \{[^}]*min-height: 16em[^}]*font-size: 1[6-9]px/);  // ab 16 px kein Zoom am iPhone; Stufe 2 (07.10.2026) zieht 16 auf 17
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
    assert.match(code, /: eintraege\.map\(function \(e\) \{ return e\.k; \}\)/);
    assert.match(code, /onclick="ArchetypBox\.kopieren\(\)"/);
    assert.match(code, /kopieren: kopieren,/);
    assert.match(code, /navigator\.clipboard\.writeText\(text\)/);
  });
  it('Eigene Box hat Stufe "eigen" (Balken), auch ohne Formatdaten', () => {
    const b = L.neueEigeneBox('Rotom', '2026-10-03');
    assert.equal(L.boxStufe(b, null), 'eigen');
    assert.equal(L.boxStufe(b, { aktuell: 'X' }), 'eigen');
    assert.equal(L.chipReihe([b], null, null)[0].stufe, 'eigen');
    assert.match(code, /\['gespielt', 'legal', 'raus', 'eigen', 'sonst'\]/);
  });
  it('Keine Namensliste mehr ueber der Kartenansicht', () => {
    assert.ok(!/boxen\.map\(nameVon\)\.join\(', '\)/.test(code), 'Namensliste "Alle Boxen" ist zurueck');
    assert.ok(!/liste: alt\.map\(nameVon\)/.test(code), 'Namensliste "noch nicht abgeglichen" ist zurueck');
  });
  it('Standard-Marke steht an der Einzel- und an der Zusammen-Kachel', () => {
    assert.equal((code.match(/\+ legalMarke\(k\)/g) || []).length, 3); // Einzel-, Zusammen- und Alle-Karten-Kachel
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
    return { id: 'k' + i, name: m[2], set: m[3], number: m[4], gefordert: Number(m[1]), typ: / Energy$/.test(m[2]) ? 'Energy' : 'Pokemon' };
  });
  it('Umfang: 36 verschiedene Karten, 65 Stueck mit Kopien (81 minus 16 Basis-Energien)', () => {
    assert.deepEqual(L.auswahlUmfang(karten), { karten: 36, stueck: 65 });
  });
  it('Umfang zaehlt wie das Kopieren (gleiche Karte nur einmal, Menge mind. 1)', () => {
    const u = L.auswahlUmfang([karten[1], karten[1], { id: 'z', name: 'X', set: 'TWM', number: '1', gefordert: 0 }]);
    assert.deepEqual(u, { karten: 2, stueck: 4 });
    assert.deepEqual(L.auswahlUmfang([]), { karten: 0, stueck: 0 });
  });
  it('Die Zeile steht ueber der Kartenliste und nutzt die sichtbare Auswahl', () => {
    assert.match(code, /auswahlUmfang\(sichtbareKarten\)/);
    assert.match(code, /filterLeiste\(kontext, ohneFormate, gewaehlt, mitBoxName && !alleKarten\) \+ umfangZeile\)? \+ hauptteil/);
  });
});

describe('Rutsch R: Umfang ueber mehrere Boxen und ohne Basis-Energien (Hausi, 03.10.2026)', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const K = (id, n, extra) => Object.assign({ id: id, name: 'Karte ' + id, set: 'TWM', number: id, gefordert: n, typ: 'Item' }, extra || {});
  it('dieselbe Karte in zwei Boxen: die groesste Anzahl gilt, nicht die der ersten', () => {
    const u = L.auswahlUmfang([K('1', 1), K('1', 4), K('1', 2)]);
    assert.deepEqual(u, { karten: 1, stueck: 4 });
    assert.deepEqual(L.deckzeilenAus([K('1', 1), K('1', 4)]), ['4 Karte 1 TWM 1']);
  });
  it('Basis-Energien stehen in der Kopie, zaehlen aber nicht zum Stueck-Umfang', () => {
    const e = K('e', 12, { name: 'Fire Energy', typ: 'Energy' });
    const sp = K('s', 3, { name: 'Enriching Energy', typ: 'Energy' });
    assert.deepEqual(L.deckzeilenAus([e, sp]), ['12 Fire Energy TWM e', '3 Enriching Energy TWM s']);
    assert.deepEqual(L.auswahlUmfang([e, sp, K('1', 2)]), { karten: 3, stueck: 5 });
    assert.equal(L.istBasisEnergie(sp), false);
    assert.equal(L.istBasisEnergie(K('x', 1, { name: 'Fire Energy', typ: 'Item' })), false);
  });
  it('Der Kopierknopf zeigt die Zahl der Zeilen, nicht die der Eintraege', () => {
    assert.match(code, /tx\('abx\.kopieren', \{ n: deckzeilenAus\(sichtbareKarten\)\.length \}/);
    assert.doesNotMatch(code, /abx\.kopieren', \{ n: sichtbareKarten\.length/);
  });
});

describe('Rutsch S: Alle-Karten-Box und aufklappbare Boxliste (Hausi, 03.10.2026)', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const kk = (set, nr, n, extra) => Object.assign({ id: set + '-' + nr, name: 'Karte ' + nr, set: set, number: nr, gefordert: n, typ: 'Item' }, extra || {});
  const E = (box, k) => ({ box: { id: box }, k: k });
  it('groesste Anzahl ueber alle Boxen, nie die der ersten', () => {
    const g = L.groessteAnzahl([E('a', kk('TWM', '1', 1)), E('b', kk('TWM', '1', 3)), E('c', kk('TWM', '1', 2))]);
    assert.equal(g.length, 1);
    assert.equal(g[0].k.gefordert, 3);
    assert.equal(g[0].boxen, 3);
  });
  it('mehr als 4 wird auf 4 gedeckelt, Basis-Energien nicht', () => {
    const g = L.groessteAnzahl([E('a', kk('SVE', '1', 12, { name: 'Fire Energy', typ: 'Energy' })), E('a', kk('TWM', '2', 9))]);
    assert.equal(g[0].k.gefordert, 12);
    assert.equal(g[1].k.gefordert, 4);
    assert.equal(g[1].max, 9);
    assert.equal(L.KOPIEN_MAX, 4);
  });
  it('verbunden wird ueber (Set, Nummer), nie ueber den Namen', () => {
    const a = kk('TWM', '1', 2, { name: 'Gleicher Name' });
    const b = kk('SFA', '9', 3, { name: 'Gleicher Name' });
    assert.equal(L.groessteAnzahl([E('a', a), E('b', b)]).length, 2);
  });
  it('Umfang der Alle-Karten-Box: Stueck ohne Basis-Energien', () => {
    const g = L.groessteAnzahl([E('a', kk('TWM', '1', 1)), E('b', kk('TWM', '1', 4)), E('a', kk('SVE', '2', 15, { name: 'Water Energy', typ: 'Energy' }))]);
    assert.deepEqual(L.auswahlUmfang(g.map((x) => x.k)), { karten: 2, stueck: 4 });
    assert.equal(L.ALLE_KARTEN, '__alle_karten__');
  });
  it('Die Ansicht rechnet die Kopie und die Zahlen aus der Alle-Karten-Box', () => {
    assert.match(code, /const sbAnsicht = aktiveId === ALLE_KARTEN && boxen\.length > 1;/);
    assert.match(code, /const alleKarten = sbAnsicht && !spielboxJetzt;/);
    assert.match(code, /sichtbareKarten = groesste \? groesste\.map\(function \(g\) \{ return g\.k; \}\)/);
    assert.match(code, /alleKartenChip = chip\(ALLE_KARTEN/);
  });
  it('Die Boxliste: zwei feste Chips, die Boxen je Stufe in aufklappbaren Gruppen', () => {
    assert.match(code, /<div class="abx-leiste-fest">/);
    assert.match(code, /'<details class="abx-gruppe abx-stufe-' \+ g/);
    assert.match(code, /offeneGruppen\.has\(g\)/);
    assert.match(code, /function gruppeKlappen\(g, details\)/);
    assert.match(code, /gruppeKlappen: gruppeKlappen/);
    // eine Variante bleibt in der Gruppe ihrer Familienbox
    assert.match(code, /if \(r\.rang !== 'mitglied'\) aktuelleStufe = r\.stufe \|\| 'sonst'/);
  });
});

describe('Rutsch T: Alle Standard-Karten, ein Energie-Druck, ACE-SPEC-Stadien (Hausi, 04.10.2026)', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const kk = (set, nr, n, extra) => Object.assign({ id: set + '-' + nr, name: 'Karte ' + nr, set: set, number: nr, gefordert: n, typ: 'Item' }, extra || {});
  const E = (box, k) => ({ box: box, k: k });
  const gespielt = { id: 'g', karten: [kk('TWM', '1', 2, { formate: { 'TEF-30C': 40 } })] };
  const legalBox = { id: 'l', archetyp: 'Zacian', karten: [kk('TWM', '2', 2, { typ: 'Pokemon', name: 'Zacian ex', anteil: 90, formate: { 'TEF-30C': 0 } })] };
  const rausBox = { id: 'r', archetyp: 'Charizard', karten: [kk('OBF', '3', 2, { typ: 'Pokemon', name: 'Charizard ex', anteil: 90, formate: { 'TEF-30C': 0 } }), kk('TWM', '9', 2)] };
  const eigen = L.neueEigeneBox('Meine', '2026-10-04'); eigen.id = 'e';
  const kontext = (nichtLegal) => ({
    aktuell: 'TEF-30C', legalBekannt: true,
    legal: (k) => (nichtLegal || []).indexOf(k.id) >= 0 ? false : (k.id === 'XXX-0' ? null : true)
  });
  it('nur Boxen, die im Standard gespielt werden oder legal sind, dazu eigene Boxen', () => {
    const k = kontext(['OBF-3']);
    const alle = [E(gespielt, gespielt.karten[0]), E(legalBox, legalBox.karten[0]), E(rausBox, rausBox.karten[0]), E(rausBox, rausBox.karten[1]), E(eigen, kk('SFA', '4', 1))];
    const r = L.standardEintraege(alle, k);
    assert.deepEqual(r.eintraege.map((e) => e.k.id), ['TWM-1', 'TWM-2', 'SFA-4']);
    assert.equal(r.boxen, 3);
  });
  it('innerhalb einer Standard-Box faellt eine rotierte Karte heraus, eine mit unbekannter Legalitaet auch', () => {
    const k = kontext(['SVI-9']);
    const box = { id: 'g2', karten: [kk('TWM', '1', 2, { formate: { 'TEF-30C': 40 } }), kk('SVI', '9', 2), kk('XXX', '0', 2)] };
    const r = L.standardEintraege(box.karten.map((x) => E(box, x)), k);
    assert.deepEqual(r.eintraege.map((e) => e.k.id), ['TWM-1']);
  });
  it('ohne Formatdaten bleibt die Liste leer statt zu raten', () => {
    assert.equal(L.standardEintraege([E(eigen, kk('SFA', '4', 1))], { aktuell: 'TEF-30C', legalBekannt: false, legal: () => true }).eintraege.length, 0);
    assert.equal(L.standardEintraege([E(eigen, kk('SFA', '4', 1))], null).eintraege.length, 0);
  });
  it('Basis-Energie: je Typ EIN Druck (SVE), egal welche Drucke in den Boxen liegen', () => {
    const w = (set, nr, n) => kk(set, nr, n, { name: 'Water Energy', typ: 'Energy' });
    const g = L.groessteAnzahl([E({ id: 'a' }, w('MEE', '11', 2)), E({ id: 'b' }, w('SVE', '19', 9)), E({ id: 'c' }, w('MEE', '3', 1)),
      E({ id: 'd' }, kk('SVE', '18', 4, { name: 'Fire Energy', typ: 'Energy' })), E({ id: 'e' }, kk('TEF', '161', 3, { name: 'Mist Energy', typ: 'Energy' }))]);
    assert.deepEqual(g.map((x) => x.id), ['SVE-19', 'SVE-18', 'TEF-161']);
    assert.equal(g[0].k.gefordert, 9);
    assert.equal(g[0].boxen, 3);
    assert.equal(L.basisEnergieNummer(kk('X', '1', 1, { name: 'Fairy Energy', typ: 'Energy' })), null);
    assert.equal(L.basisEnergieNummer(kk('X', '1', 1, { name: 'Mist Energy', typ: 'Energy' })), null);
    assert.equal(L.BASIS_ENERGIE_SVE.metal, '24');
  });
  it('der Einheitsdruck ersetzt die Karte (Bild, Set, Nummer), die Anzahl bleibt die groesste', () => {
    const w = kk('MEE', '11', 6, { name: 'Water Energy', typ: 'Energy', bild: 'mee.png' });
    const g = L.groessteAnzahl([E({ id: 'a' }, w)], (k, nr) => ({ id: 'SVE-' + nr, name: 'Water Energy', set: 'SVE', number: nr, bild: 'sve.png', typ: 'Energy' }));
    assert.equal(g[0].k.set + ' ' + g[0].k.number + ' ' + g[0].k.bild, 'SVE 19 sve.png');
    assert.equal(g[0].k.gefordert, 6);
  });
  it('ACE-SPEC-Stadien stehen bei den ACE SPECs, gewoehnliche Stadien nicht, gespeichert wird nichts', () => {
    const ace = (k) => k.name === 'Grand Tree';
    const grand = kk('SCR', '136', 1, { name: 'Grand Tree', typ: 'Stadium' });
    const gewoehnlich = kk('TWM', '5', 1, { name: 'Artazon', typ: 'Stadium' });
    assert.equal(L.artVon(grand, ace), 'Ace Spec');
    assert.equal(L.artVon(gewoehnlich, ace), 'Stadium');
    assert.equal(L.artVon(kk('X', '1', 1, { typ: 'Item' }), ace), 'Item');
    assert.equal(grand.typ, 'Stadium');
  });
  it('Sortierung und Filter rufen artVon, nicht k.typ', () => {
    assert.doesNotMatch(code, /typRang\(a\.k\.typ\)/);
    assert.match(code, /artVon\(k\) !== f\.art/);
    assert.match(code, /groessteAnzahl\(eintraege, einheitsEnergie\)/);
    assert.match(code, /standardEintraege\(eintraege, kontext\)/);
  });
  it('Sortierung nach Art: das ACE-SPEC-Stadion rueckt zu den ACE SPECs (ausgefuehrt)', () => {
    global.window = { isAceSpec: (n) => n === 'Grand Tree' };
    try {
      const mk = (id, name, typ) => E({ id: 'b', name: 'b' }, kk('SCR', id, 1, { name: name, typ: typ, id: 'SCR-' + id }));
      const rein = [mk('1', 'Zebra Energy', 'Energy'), mk('2', 'Grand Tree', 'Stadium'), mk('3', 'Artazon', 'Stadium'), mk('4', 'Secret Box', 'Ace Spec')];
      const namen = L.sortieren(rein, 'art', true).map((e) => e.k.name);
      assert.deepEqual(namen, ['Artazon', 'Grand Tree', 'Secret Box', 'Zebra Energy']);
      assert.equal(L.filterPasst(rein[1].k, { art: 'Ace Spec' }, ''), true);
      assert.equal(L.filterPasst(rein[1].k, { art: 'Stadium' }, ''), false);
    } finally { delete global.window; }
  });
});

describe('Rutsch U: Spielbox, Regulation Mark, Preise in der Druckwahl (Hausi, 04.10.2026)', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const kk = (set, nr, n, extra) => Object.assign({ id: set + '-' + nr, name: 'Karte ' + nr, set: set, number: nr, gefordert: n, typ: 'Item', refs: [] }, extra || {});
  const idx = L.markenIndex({ marks: { H: { TEF: '1-5,9' }, I: { DRI: '10' }, G: { PAL: '7' } } });

  it('Regulation Mark: nur ueber (Set, Nummer), Nullen vorn egal, unbekannt = leer', () => {
    assert.deepEqual(L.markenVonKarte(kk('TEF', '3', 1), idx), ['H']);
    assert.deepEqual(L.markenVonKarte(kk('TEF', '003', 1), idx), ['H']);
    assert.deepEqual(L.markenVonKarte(kk('TEF', '9', 1), idx), ['H']);
    assert.deepEqual(L.markenVonKarte(kk('TEF', '6', 1), idx), []);
    assert.deepEqual(L.markenVonKarte(kk('XYZ', '1', 1), idx), []);
    assert.deepEqual(L.markenVonKarte(kk('TEF', '3', 1), null), []);
  });
  it('Liegt ein getauschter Druck in der Box, zaehlt dessen Marke, nicht die der Hauptkarte', () => {
    const k = kk('TEF', '3', 1, { drucke: [{ id: 'DRI-10', set: 'DRI', number: '10', n: 1 }, { id: 'TEF-3', set: 'TEF', number: '3', n: 0 }] });
    assert.deepEqual(L.markenVonKarte(k, idx), ['I']);
  });
  it('Filter nach Marke: H zeigt nur H, "keine" nur Karten ohne bekannte Marke', () => {
    const m = (k) => L.markenVonKarte(k, idx);
    assert.equal(L.filterPasst(kk('TEF', '3', 1), { marke: 'H' }, '', m), true);
    assert.equal(L.filterPasst(kk('DRI', '10', 1), { marke: 'H' }, '', m), false);
    assert.equal(L.filterPasst(kk('XYZ', '1', 1), { marke: 'keine' }, '', m), true);
    assert.equal(L.filterPasst(kk('TEF', '3', 1), { marke: 'keine' }, '', m), false);
    assert.equal(L.filterPasst(kk('TEF', '3', 1), { marke: 'alle' }, '', m), true);
    assert.equal(L.filterPasst(kk('TEF', '3', 1), { marke: 'H' }, ''), false);
  });
  it('Preis: Trend ist die Hauptzahl, "ab" nur wenn darunter, nichts geschaetzt', () => {
    assert.deepEqual(L.preisVon({ eur_price: '12,50€', eur_low: '8,00€', price_last_updated: '2026-10-03T08:11:22' }), { trend: 12.5, ab: 8, stand: '2026-10-03' });
    assert.equal(L.preisVon({ eur_price: '1,00€', eur_low: '3,00€' }).ab, null);
    assert.equal(L.preisVon({ eur_price: '', eur_low: '0,40€' }).trend, 0.4);
    assert.equal(L.preisVon({ eur_price: '1.234,50 €' }).trend, 1234.5);
    assert.equal(L.preisVon({ eur_price: 'N/A', eur_low: '' }), null);
    assert.equal(L.preisVon({ eur_price: '0,00€' }), null);
    assert.equal(L.preisVon(null), null);
  });
  const ak = (liste) => liste.map((k) => ({ id: k.id, k: k, max: k.gefordert, boxen: 1 }));
  it('Spielbox anlegen: eigene Box mit Kennzeichen, alle Karten mit ihrer Anzahl, Status fehlt', () => {
    const r = L.spielboxBefuellen(ak([kk('TEF', '3', 4), kk('DRI', '10', 2, { name: 'Dwebble' })]), null, '2026-10-04');
    assert.equal(r.box.eigen, true);
    assert.equal(r.box.spielbox, true);
    assert.equal(r.hinzu.length, 2);
    assert.deepEqual(r.box.karten.map((k) => [k.id, k.gefordert, k.status]), [['TEF-3', 4, 'fehlt'], ['DRI-10', 2, 'fehlt']]);
    assert.equal(L.istSpielbox(r.box), true);
    assert.equal(L.istSpielbox({ eigen: true }), false);
  });
  it('Spielbox ergaenzen: legt nur Fehlendes an; Druck-Tausch, Original-Status und Anzahl bleiben', () => {
    const erst = L.spielboxBefuellen(ak([kk('TEF', '3', 4)]), null, '2026-10-04').box;
    erst.karten[0].status = 'original';
    erst.karten[0].gefordert = 2;
    erst.karten[0].drucke = [{ id: 'MEP-3', set: 'MEP', number: '3', n: 1 }];
    const r = L.spielboxBefuellen(ak([kk('TEF', '3', 4), kk('TEF', '4', 3), kk('SFA', '9', 1, { refs: ['TEF-3'] })]), erst, '2026-10-05');
    assert.deepEqual(r.hinzu.map((k) => k.id), ['TEF-4']);
    assert.equal(r.schon, 2);
    assert.equal(r.box.karten[0].status, 'original');
    assert.equal(r.box.karten[0].gefordert, 2);
    assert.equal(r.box.karten[0].drucke[0].id, 'MEP-3');
    assert.equal(r.box.karten.length, 2);
  });
  it('Spielbox ergaenzen entfernt nichts: eine von Hand gelegte Karte ausserhalb der Standard-Liste bleibt', () => {
    const erst = L.spielboxBefuellen(ak([kk('TEF', '3', 4), kk('OBF', '1', 2)]), null, '2026-10-04').box;
    const r = L.spielboxBefuellen(ak([kk('TEF', '3', 4)]), erst, '2026-10-05');
    assert.deepEqual(r.box.karten.map((k) => k.id), ['TEF-3', 'OBF-1']);
    assert.equal(r.hinzu.length, 0);
  });
  it('Zu gross fuer ein Konto-Dokument: nichts aendern, melden', () => {
    const viele = [];
    for (let i = 0; i < 4000; i++) viele.push(kk('TEF', String(i + 1), 1, { name: 'x'.repeat(200), bild: 'https://b/' + 'y'.repeat(100) }));
    const r = L.spielboxBefuellen(ak(viele), null, '2026-10-04');
    assert.equal(r.zuGross, true);
    assert.equal(r.hinzu.length, 0);
    assert.equal(r.box.karten.length, 0);
  });
  it('Die Spielbox ist nie Quelle der Standard-Karten (sonst doppelte Drucke)', () => {
    const sb = Object.assign(L.neueEigeneBox('Spielbox', '2026-10-04'), { spielbox: true, id: 's' });
    const eig = Object.assign(L.neueEigeneBox('Meine', '2026-10-04'), { id: 'e' });
    const kontext = { aktuell: 'TEF-30C', legalBekannt: true, legal: () => true };
    const r = L.standardEintraege([{ box: sb, k: kk('MEP', '3', 1) }, { box: eig, k: kk('TEF', '3', 1) }], kontext);
    assert.deepEqual(r.eintraege.map((e) => e.k.id), ['TEF-3']);
  });
  it('Verdrahtung: Filter geben die Marke mit, die Druckwahl zeigt den Preis, die Aktion schreibt ueber schreiben()', () => {
    assert.match(code, /filterPasst\(e\.k, ansicht, e\.element, markenVonEintrag\)/);
    assert.match(code, /filterPasst\(k, ansicht, elementVon\(k\), markenVonEintrag\)/);
    assert.match(code, /preisVon\(rec\)/);
    // FE-63 (05.10.2026): kein Anlegen-Knopf mehr — die Ansicht IST die Spielbox und schreibt selbst.
    assert.doesNotMatch(code, /spielboxEinspielen/);
    assert.match(code, /if \(erg\.geaendert\) schreiben\(erg\.box\);/);
    assert.match(code, /knopf\('marke', 'alle'/);
  });
});

describe('FE-63: "Alle Standard-Karten" ist die Spielbox (Hausi, 05.10.2026)', () => {
  const code = QUELLE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const kk = (set, nr, n, extra) => Object.assign({ id: set + '-' + nr, name: 'Karte ' + nr, set: set, number: nr, gefordert: n, typ: 'Item', refs: [] }, extra || {});
  const ak = (liste) => liste.map((k) => ({ id: k.id, k: k, max: k.gefordert, boxen: 1 }));

  it('Erstes Oeffnen: Spielbox mit fester Id, alle Karten "fehlt", Anzahl = groesste gespielte', () => {
    const r = L.spielboxAbgleichen(ak([kk('TEF', '3', 4), kk('DRI', '10', 2)]), null, null, '2026-10-05');
    assert.equal(r.box.id, L.SPIELBOX_AUTO_ID);
    assert.equal(L.istAutoSpielbox(r.box), true);
    assert.equal(r.geaendert, true);
    assert.deepEqual(r.box.karten.map((k) => [k.id, k.gefordert, k.status]), [['TEF-3', 4, 'fehlt'], ['DRI-10', 2, 'fehlt']]);
  });
  it('Aktualisiert sich selbst: neue Karte dazu, rotierte raus, Anzahl folgt, Haken bleiben', () => {
    const erst = L.spielboxAbgleichen(ak([kk('TEF', '3', 4), kk('OBF', '1', 2)]), null, null, '2026-10-05').box;
    erst.karten[0].status = 'original';
    erst.karten[0].drucke = [{ id: 'MEP-3', set: 'MEP', number: '3', n: 2 }];
    const r = L.spielboxAbgleichen(ak([kk('TEF', '3', 3), kk('SFA', '9', 1)]), erst, null, '2026-10-06');
    assert.deepEqual(r.box.karten.map((k) => k.id), ['TEF-3', 'SFA-9']);
    assert.deepEqual(r.hinzu.map((k) => k.id), ['SFA-9']);
    assert.deepEqual(r.raus.map((k) => k.id), ['OBF-1']);
    assert.equal(r.box.karten[0].status, 'original');
    assert.equal(r.box.karten[0].gefordert, 3);
    assert.equal(r.box.karten[0].drucke[0].id, 'MEP-3');
  });
  it('Nichts geaendert -> geaendert=false (kein Schreiben bei jedem Oeffnen)', () => {
    const erst = L.spielboxAbgleichen(ak([kk('TEF', '3', 4)]), null, null, '2026-10-05').box;
    const r = L.spielboxAbgleichen(ak([kk('TEF', '3', 4)]), erst, null, '2026-10-06');
    assert.equal(r.geaendert, false);
  });
  it('Von Hand entfernte Karte kommt nicht still zurueck', () => {
    const erst = L.spielboxAbgleichen(ak([kk('TEF', '3', 4), kk('TEF', '4', 1)]), null, null, '2026-10-05').box;
    const ohne = L.entfernen(erst, 'TEF-4', '2026-10-05');
    const r = L.spielboxAbgleichen(ak([kk('TEF', '3', 4), kk('TEF', '4', 1)]), ohne, null, '2026-10-06');
    assert.deepEqual(r.box.karten.map((k) => k.id), ['TEF-3']);
  });
  it('Alte Spielbox (FE-54): Haken werden einmal uebernommen, die alte Box bleibt unveraendert', () => {
    const alt = L.spielboxBefuellen(ak([kk('TEF', '3', 4)]), null, '2026-10-04').box;
    alt.karten[0].status = 'proxy';
    alt.karten[0].drucke = [{ id: 'TEF-3', set: 'TEF', number: '3', n: 4 }];
    const vorher = JSON.stringify(alt);
    const r = L.spielboxAbgleichen(ak([kk('TEF', '3', 4), kk('DRI', '10', 2)]), null, alt, '2026-10-05');
    assert.equal(r.box.karten[0].status, 'proxy');
    assert.equal(r.box.karten[0].drucke[0].n, 4);
    assert.equal(r.box.karten[1].status, 'fehlt');
    assert.equal(JSON.stringify(alt), vorher);
    assert.notEqual(r.box.karten[0].drucke, alt.karten[0].drucke);
  });
  it('Zuordnung nie ueber den Namen: gleicher Name, anderes Set = zwei Karten', () => {
    const r = L.spielboxAbgleichen(ak([kk('TEF', '3', 1, { name: 'X' }), kk('DRI', '3', 1, { name: 'X' })]), null, null, '2026-10-05');
    assert.equal(r.box.karten.length, 2);
  });
  it('Zu gross: nichts schreiben', () => {
    const viele = [];
    for (let i = 0; i < 4000; i++) viele.push(kk('TEF', String(i + 1), 1, { name: 'x'.repeat(200), bild: 'https://b/' + 'y'.repeat(100) }));
    const r = L.spielboxAbgleichen(ak(viele), null, null, '2026-10-05');
    assert.equal(r.zuGross, true);
    assert.equal(r.geaendert, false);
  });
  it('Verdrahtung: Spielbox nie in der Boxliste, Chip heisst "Spielbox", kein Loeschen/Liste/Suche dort', () => {
    assert.match(code, /boxen = boxen\.filter\(function \(b\) \{ return !istAutoSpielbox\(b\); \}\);/);
    assert.match(code, /tx\('abx\.spielboxChip', null, 'Spielbox'\)/);
    assert.match(code, /eine && !spielboxJetzt \? '<button type="button" class="btn btn-outline" onclick="ArchetypBox\.loeschen/);
    assert.match(code, /const suche = eine && !spielboxJetzt/);
    assert.match(code, /const liste = eine && !spielboxJetzt \? listeBlock\(eine\) : '';/);
  });
  it('Verfaelschungsprobe: ohne Entfernen rotierter Karten faellt die Zusage', () => {
    const vm = require('node:vm');
    const kaputt = QUELLE.replace("const raus = basis.karten.filter(function (k) { return karten.indexOf(k) < 0; });",
      "const raus = []; karten.push.apply(karten, basis.karten.filter(function (k) { return karten.indexOf(k) < 0; }));");
    assert.notEqual(kaputt, QUELLE);
    const m = { exports: {} };
    vm.runInNewContext(kaputt, { module: m, exports: m.exports, console });
    const K = m.exports;
    const erst = K.spielboxAbgleichen(ak([kk('TEF', '3', 4), kk('OBF', '1', 2)]), null, null, '2026-10-05').box;
    const r = K.spielboxAbgleichen(ak([kk('TEF', '3', 4)]), erst, null, '2026-10-06');
    assert.notDeepEqual(r.box.karten.map((k) => k.id), ['TEF-3']);
  });
});
