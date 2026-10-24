/**
 * UI-149 (Hausi, 24.10.2026): das "Mehr"-Menue in Meine Decks war beim letzten Deck der Liste abgeschnitten
 * ("verschwindet im Ende der Seite"). Zwei Ursachen, am iPhone-Bild und im Browser nachgestellt:
 *  1. main.tabs-container hat am Telefon overflow:hidden !important (mobile-responsive.css) und schneidet
 *     alles ab, was ueber seine Unterkante ragt.
 *  2. Die feste Tableiste (.ds-tabbar) deckt die unteren Menuepunkte zu; die Platzpruefung kannte sie nicht.
 * Hier: die Regel gegen die Spezifitaet geprueft UND dsDeckMehrToggle AUSGEFUEHRT (vm), nicht nur gelesen.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const wurzel = path.join(__dirname, '..', '..');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const CSS = fs.readFileSync(path.join(wurzel, 'css', 'styles.css'), 'utf8');
const MOBIL = fs.readFileSync(path.join(wurzel, 'css', 'mobile-responsive.css'), 'utf8');
const JS = fs.readFileSync(path.join(wurzel, 'js', 'firebase-collection.js'), 'utf8');

function funktion(quelle) {
  const a = quelle.indexOf('function dsDeckMehrToggle');
  const b = quelle.indexOf('window.dsDeckMehrToggle');
  assert.ok(a > 0 && b > a, 'dsDeckMehrToggle nicht gefunden');
  return quelle.slice(a, b);
}

/* Laeuft die echte Funktion gegen eine kleine Attrappe. Masse in px, Fenster 844 hoch. */
function lauf(quelle, { oben, hoehe, leisteTop, stand, maximal, imBody }) {
  const klassen = new Set();
  const bewegt = [];
  const menue = { getBoundingClientRect: () => ({ bottom: oben + 30 + hoehe, height: hoehe, top: oben + 30 }) };
  const el = {
    open: true,
    closest: () => ({ style: {} }),
    classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) },
    querySelector: () => menue,
    getBoundingClientRect: () => ({ top: oben }),
  };
  const body = {
    clientHeight: 844, scrollHeight: imBody ? 844 + maximal : 844, scrollTop: stand,
    getBoundingClientRect: () => ({ top: 0 }),
    scrollBy: (x, dy) => bewegt.push(dy),
  };
  const leiste = { getBoundingClientRect: () => ({ top: leisteTop }) };
  const ctx = {
    window: { innerHeight: 844, scrollY: stand, scrollBy: (x, dy) => bewegt.push(dy) },
    document: {
      body, documentElement: { scrollHeight: 844 + maximal },
      querySelector: (s) => (s === '.ds-tabbar' ? leiste : null),
      querySelectorAll: () => ({ forEach: () => {} }),
    },
    getComputedStyle: (e) => (e === leiste ? { position: 'fixed' } : { overflowY: imBody ? 'auto' : 'visible' }),
  };
  vm.createContext(ctx);
  vm.runInContext(quelle + '\nthis.f = dsDeckMehrToggle;', ctx);
  ctx.f(el);
  return { oben: klassen.has('deck-mehr--oben'), bewegt };
}

describe('UI-149 Mehr-Menue am Listenende', () => {
  it('Regel: der Container schneidet nicht, solange ein Menue offen ist, und schlaegt die !important-Regel', () => {
    const c = ohneKommentare(CSS);
    const m = c.match(/\.tabs-container:has\(details\.deck-mehr\[open\]\)\s*\{([^}]*)\}/);
    assert.ok(m, 'Regel fehlt');
    assert.match(m[1], /overflow:\s*visible\s*!important/);
    // Gegner: .tabs-container { overflow: hidden !important } (0,1,0); unsere Regel (0,3,0)+(0,0,1) via :has(Argument)
    assert.match(ohneKommentare(MOBIL), /\.tabs-container\s*\{[^}]*overflow:\s*hidden\s*!important/);
  });

  it('Verhalten: Platz oben -> nach oben klappen, Seite bleibt', () => {
    const r = lauf(funktion(JS), { oben: 600, hoehe: 426, leisteTop: 777, stand: 500, maximal: 2000, imBody: false });
    assert.equal(r.oben, true);
    assert.deepEqual(r.bewegt, []);
  });

  it('Verhalten: kein Platz oben, Seite laesst sich nach unten schieben -> schieben, unten bleiben', () => {
    const r = lauf(funktion(JS), { oben: 400, hoehe: 426, leisteTop: 777, stand: 100, maximal: 2000, imBody: false });
    assert.equal(r.oben, false);
    assert.equal(r.bewegt.length, 1);
    assert.ok(r.bewegt[0] > 0);
  });

  it('Verhalten: Ende der Liste (Hausis Fall) -> nach oben klappen und die Seite nach oben schieben', () => {
    const r = lauf(funktion(JS), { oben: 370, hoehe: 426, leisteTop: 777, stand: 1887, maximal: 1887, imBody: false });
    assert.equal(r.oben, true);
    assert.equal(r.bewegt.length, 1);
    assert.ok(r.bewegt[0] < 0);
  });

  it('Verhalten: die Tableiste zaehlt als Grenze (Menue endet bei 822, Leiste ab 777)', () => {
    // Fenster 844 reicht, die Leiste nicht: ohne die Leiste als Grenze passiert gar nichts
    const mit = lauf(funktion(JS), { oben: 600, hoehe: 192, leisteTop: 777, stand: 0, maximal: 1000, imBody: false });
    assert.equal(mit.oben, true, 'mit Leiste muss es nach oben klappen');
  });

  it('Verhalten: passt es, bleibt alles wie es ist', () => {
    const r = lauf(funktion(JS), { oben: 100, hoehe: 300, leisteTop: 777, stand: 0, maximal: 1000, imBody: false });
    assert.equal(r.oben, false);
    assert.deepEqual(r.bewegt, []);
  });

  it('Verfaelschungsprobe: ohne Leisten-Grenze, ohne Schieben und ohne Regel faellt es auf', () => {
    const q = funktion(JS);
    assert.ok(q.length > ohneKommentare(q).length * 0.5, 'Kommentar-Ausschneiden ok');
    const ohneLeiste = q.replace("document.querySelector('.ds-tabbar')", 'null');
    const a = lauf(ohneLeiste, { oben: 600, hoehe: 192, leisteTop: 777, stand: 0, maximal: 1000, imBody: false });
    assert.equal(a.oben, false, 'ohne Leiste klappt es nicht mehr nach oben');
    const ohneSchieben = q.replace(/schiebe\(-hoch\)/, 'void 0');
    const b = lauf(ohneSchieben, { oben: 370, hoehe: 426, leisteTop: 777, stand: 1887, maximal: 1887, imBody: false });
    assert.deepEqual(b.bewegt, [], 'ohne Schieben bleibt das Menue am Listenende verdeckt');
    const kaputtCss = CSS.replace('.tabs-container:has(details.deck-mehr[open]) {', '.tabs-container-x:has(details.deck-mehr[open]) {');
    assert.ok(!/\.tabs-container:has\(details\.deck-mehr\[open\]\)/.test(ohneKommentare(kaputtCss)));
  });
});
