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
