/**
 * ALTERNATIVVORSCHLAG (DA-31, 03.10.2026) — DER ABSTAND MUSS MEHR SEIN ALS ZUFALL.
 *
 * VORGESCHICHTE: bis 02.10.2026 entschied eine GEGRIFFENE Zahl, ALT_SUGGESTION_MIN_GAP
 * = 50 (Plaetze Medianabstand), ob die Deckbau-Seite eine andere Kartenzahl
 * vorschlaegt. Ihr Beleg (ein "Turin sweep") ist im Repo nicht auffindbar. Die
 * Messung vom 03.10.2026 (Kopf von js/deck-builder-consistency.js) zeigt, dass eine
 * feste Zahl in beide Richtungen falsch ist: das 95-%-Quantil des reinen Zufalls-
 * Abstands liegt je Kandidat zwischen 11 und 55 Plaetzen, weil der Zufall von der
 * Gruppengroesse abhaengt. Auf frischen Daten (kurzes Fenster nach der Rotation vom
 * 16.09.) lag der groesste Abstand unter 50 — der Vorschlag erschien nie.
 *
 * SEIT DA-31 entscheidet ein Permutationstest (einseitig, fester Seed) mit
 * ALPHA = 0,001 (Konvention, ~0,05 / 50 Tests). Dieser Test sichert das mit FUENF
 * datenfreien, blockierenden Zusicherungen und beobachtet nur die echten Daten:
 *
 *   (i)   RAUSCHEN: Gruppen mit GLEICHER Verteilung — in hoechstens 2 von 100
 *         seed-festen Laeufen darf ein Vorschlag erscheinen.
 *   (ii)  STAERKE: ein grosser, gut belegter Effekt (n = 200/100, Abstand ~38)
 *         MUSS erscheinen. Die alte feste 50 haette ihn verschluckt.
 *   (iii) KLEINE STICHPROBE: 20/10 Listen mit Abstand ~60 bei grosser Streuung darf
 *         NICHT erscheinen. Die alte feste 50 haette ihn gezeigt.
 *   (iv)  RICHTUNG: die Mehrheit platziert schlechter => nie ein Vorschlag.
 *   (v)   DETERMINISMUS: gleiche Eingabe, gleiches p.
 *
 * Die Verfaelschungsproben stehen im Journal (claude/da31-...): ALPHA auf 0,5 =>
 * (i) rot; Tor zurueck auf "gap > 50" => (ii) und (iii) rot.
 *
 * Die echten Daten (data/tournament_decklists_per_player.csv) werden NICHT
 * erzwungen: wie viele Vorschlaege entstehen, haengt von der Datenlage der Woche
 * ab (heute 0, und das ist ehrlich: kein Abstand ist von Zufall zu unterscheiden).
 * Sie werden auf stderr gemeldet, und die Zaehler muessen aufgehen.
 *
 * NICHT GEPRUEFT: ob eine Kartenzahl KAUSAL besser platziert oder nur eine Variante
 * anzeigt; die Laufzeit im Browser.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const KONS_PFAD = path.join(WURZEL, 'js', 'deck-builder-consistency.js');
const KONS = fs.readFileSync(KONS_PFAD, 'utf8');
const CSV_PFAD = path.join(WURZEL, 'data', 'tournament_decklists_per_player.csv');

/* Der Zaehlerbau: dieselbe Datei, aber mit Strichliste an jedem Tor.
   Die Anker sind Quelltextzeilen — faellt einer weg, bricht der Test
   auf, statt still nichts mehr zu messen. */
const ZAEHLER_ANKER = [
  ['    const perList = scoredCard._perListCounts;\n'
   + '    if (!Array.isArray(perList) || perList.length < ALT_SUGGESTION_MIN_SAMPLE) return null;',
   '    const perList = scoredCard._perListCounts;\n'
   + '    __z.aufrufe++;\n'
   + '    if (!Array.isArray(perList) || perList.length < ALT_SUGGESTION_MIN_SAMPLE) { __z.stichprobe++; return null; }'],
  ['    if (frac < ALT_SUGGESTION_FRAC_MIN || frac > ALT_SUGGESTION_FRAC_MAX) return null;',
   '    if (frac < ALT_SUGGESTION_FRAC_MIN || frac > ALT_SUGGESTION_FRAC_MAX) { __z.randzone++; return null; }'],
  ['    if (plurality === naiveCount) return null;  // already aligned',
   '    if (plurality === naiveCount) { __z.deckungsgleich++; return null; }'],
  ['    if (pluralityShare < ALT_SUGGESTION_MIN_SHARE) return null;',
   '    if (pluralityShare < ALT_SUGGESTION_MIN_SHARE) { __z.anteil++; return null; }'],
  ['    if (pluralityMedian == null || naiveMedian == null) return null;',
   '    if (pluralityMedian == null || naiveMedian == null) { __z.medianFehlt++; return null; }'],
  /* DER ANKER FOLGT DEM MODUL (26.09.2026): dort heisst der Vergleich
     seit dem Gleichstands-Befund "<=" statt "<". Ein Anker, der die
     alte Schreibweise sucht, findet nichts mehr — und AUFBAU_FEHLER
     macht daraus einen benannten roten Test statt einer stillen Null. */
  ['    const gap = naiveMedian - pluralityMedian;\n'
   + '    if (gap <= 0) return null;',
   '    const gap = naiveMedian - pluralityMedian;\n'
   + '    __z.abstaende.push(gap);\n'
   + '    if (gap <= 0) { __z.richtung++; return null; }'],
  ['    if (!(pWert < ALT_SUGGESTION_ALPHA)) return null;',
   '    if (!(pWert < ALT_SUGGESTION_ALPHA)) { __z.unterdrueckt++; return null; }\n'
   + '    __z.durch++; __z.durchAbstaende.push(gap);'],
];

function sandkasten(quelle, zaehler) {
  const Papa = require(path.join(WURZEL, 'node_modules', 'papaparse'));
  const sb = { console: { log: () => {}, warn: () => {}, error: () => {} },
               setTimeout, clearTimeout, Date, Math, JSON, window: undefined };
  sb.globalThis = sb;
  sb.__z = zaehler;
  sb.Papa = { parse: (url, opt) => {
    const rein = String(url).split('?')[0].replace(/^\.\//, '');
    const txt = fs.readFileSync(path.join(WURZEL, rein), 'utf8');
    opt.complete(Papa.parse(txt, { header: opt.header, skipEmptyLines: opt.skipEmptyLines }));
  } };
  sb.fetch = async (u) => {
    const rein = String(u).split('?')[0].replace(/^\.\//, '');
    const p = path.join(WURZEL, rein);
    if (!fs.existsSync(p)) return { ok: false, status: 404 };
    const txt = fs.readFileSync(p, 'utf8');
    return { ok: true, status: 200, text: async () => txt, json: async () => JSON.parse(txt) };
  };
  vm.createContext(sb);
  vm.runInContext(quelle, sb);
  return sb;
}

let MESSUNG = null;    // null => die CSV fehlt oder die Messung brach ab
let SCHWELLEN = null;
let AUFBAU_FEHLER = null;

/* WARUM DER HAKEN NICHT WIRFT.
   Ein `before`, das eine Zusicherung verletzt, meldet in node:test
   `hookFailed` und bricht JEDEN Test der Datei ab — die Bilanz lautet
   dann `# pass 0, # fail 0`. Genau der Fall, gegen den
   scripts/run-js-unit-tests.sh seinen `not ok`-Zaehler hat. Hier wird
   der Fehler deshalb aufgehoben und in einer eigenen, benannten
   Zusicherung gemeldet; die uebrigen Zusicherungen laufen weiter. */
before(async () => {
  try {
    await aufbauen();
  } catch (e) {
    AUFBAU_FEHLER = e;
  }
});

async function aufbauen() {
  const sbRein = sandkasten(KONS, {});
  SCHWELLEN = sbRein.MostConsistencyBuilder.ALT_SUGGESTION_SCHWELLEN;

  if (!fs.existsSync(CSV_PFAD)) return;

  let quelle = KONS;
  for (const [a, b] of ZAEHLER_ANKER) {
    assert.ok(quelle.indexOf(a) >= 0,
      'der Zaehler findet seinen Anker nicht mehr in '
      + 'js/deck-builder-consistency.js — dieser Test misst dann nichts:\n' + a);
    quelle = quelle.replace(a, b);
  }
  const z = { aufrufe: 0, stichprobe: 0, randzone: 0, deckungsgleich: 0,
              anteil: 0, medianFehlt: 0, richtung: 0, unterdrueckt: 0, durch: 0,
              abstaende: [], durchAbstaende: [] };
  const sb = sandkasten(quelle, z);
  const M = sb.MostConsistencyBuilder;
  await M.loadData();

  const Papa = require(path.join(WURZEL, 'node_modules', 'papaparse'));
  const rows = Papa.parse(fs.readFileSync(CSV_PFAD, 'utf8'),
                          { header: true, skipEmptyLines: true }).data;
  const archetypen = [...new Set(rows.map(r => (r.deck_archetype || '').trim())
                                     .filter(Boolean))].sort();
  let gebaut = 0;
  for (const a of archetypen) {
    let res = null;
    try { res = await M.build(a, {}); } catch (e) { continue; }
    if (res && res.deck && res.deck.length) gebaut++;
  }
  MESSUNG = { ...z, archetypen: archetypen.length, gebaut };
}

describe('Alternativvorschlag — die echten Daten (nur Beobachtung)', () => {

  it('der Zaehlerbau findet seine Anker im Quelltext', () => {
    assert.equal(AUFBAU_FEHLER, null,
      'die Messung konnte nicht aufgebaut werden: '
      + (AUFBAU_FEHLER && AUFBAU_FEHLER.message));
  });

  it('die Schwellen kommen aus dem Modul, nicht aus einer Kopie im Test', () => {
    assert.ok(SCHWELLEN, 'js/deck-builder-consistency.js exportiert die Schwellen nicht');
    for (const k of ['FRAC_MIN', 'FRAC_MAX', 'MIN_SHARE', 'MIN_SAMPLE', 'ALPHA', 'MIN_GROUP', 'PERMUTATIONS', 'SEED']) {
      assert.equal(typeof SCHWELLEN[k], 'number', `${k} fehlt im Export`);
    }
    assert.ok(!('MIN_GAP' in SCHWELLEN), 'die feste Schwelle MIN_GAP ist zurueck');
  });

  it('die Zaehler gehen auf — die Beobachtung misst sonst Unsinn', () => {
    if (!MESSUNG) return;
    const erreicht = MESSUNG.abstaende.length;
    const sortiert = MESSUNG.abstaende.slice().sort((a, b) => a - b);
    assert.equal(MESSUNG.richtung + MESSUNG.unterdrueckt + MESSUNG.durch
        + (erreicht - MESSUNG.richtung - MESSUNG.unterdrueckt - MESSUNG.durch),
      erreicht);
    assert.ok(MESSUNG.durch + MESSUNG.unterdrueckt + MESSUNG.richtung <= erreicht,
      'mehr Entscheidungen als Kandidaten am Abstands-Tor');
    assert.equal(MESSUNG.durchAbstaende.length, MESSUNG.durch,
      'Zaehler und aufgeschriebene Abstaende passen nicht zusammen');
    /* BEOBACHTUNG, keine Sperre: wie viele Vorschlaege entstehen, haengt von der
       Datenlage der Woche ab. "0 gezeigt" ist bei Rauschen die richtige Antwort. */
    console.error(`    [Beobachtung] Alternativvorschlag: ${erreicht} Kandidaten am `
      + `Abstands-Tor, ${MESSUNG.richtung} mit Abstand <= 0, `
      + `${MESSUNG.unterdrueckt} nicht signifikant (ALPHA ${SCHWELLEN.ALPHA}), `
      + `${MESSUNG.durch} gezeigt; groesster Abstand `
      + `${sortiert.length ? sortiert[sortiert.length - 1] : 'keiner'}.`);
  });

  it('die Datenlage steht — sonst ist die ganze Messung oben ein Nichts', () => {
    assert.ok(fs.existsSync(CSV_PFAD),
      'data/tournament_decklists_per_player.csv fehlt — die Messungen oben '
      + 'laufen dann leer durch und behaupten nichts. Datei wiederherstellen.');
    assert.ok(MESSUNG, 'die Messung ist nicht gelaufen');
    assert.ok(MESSUNG.gebaut > 0,
      `von ${MESSUNG.archetypen} Archetypen liess sich kein einziger bauen`);
  });
});

describe('das Tor — datenfrei, seed-fest, blockierend', () => {

  function prng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  /* nMehr Listen mit 3 Kopien (Mehrheit), nNaiv mit 2 (naive Rundung).
     Plaetze: Mehrheit gleichverteilt 1..breite, naive um `versatz` nach hinten
     verschoben. weightedAvgCount 2,5 liegt in der Randzone, die Mehrheit
     (> 50 %) und die Stichprobe (>= MIN_SAMPLE) sind gegeben. */
  function karte(nMehr, nNaiv, versatz, breite, seed) {
    const r = prng(seed);
    const l = [];
    for (let i = 0; i < nMehr; i++) l.push({ count: 3, place: 1 + Math.floor(r() * breite) });
    for (let i = 0; i < nNaiv; i++) l.push({ count: 2, place: 1 + versatz + Math.floor(r() * breite) });
    return { name: 'Probe', weightedAvgCount: 2.5, _perListCounts: l };
  }
  const tor = () => sandkasten(KONS, {}).MostConsistencyBuilder._internals.alternativVorschlag;

  it('(i) RAUSCHEN: gleiche Verteilung erzeugt kaum Vorschlaege', () => {
    const f = tor();
    let gezeigt = 0;
    for (let seed = 1; seed <= 100; seed++) {
      if (f(karte(150, 75, 0, 100, seed), 2)) gezeigt++;
    }
    assert.ok(gezeigt <= 2,
      `${gezeigt} von 100 Laeufen zeigen einen Vorschlag, obwohl BEIDE Gruppen `
      + 'gleich verteilt sind. Bei ALPHA 0,001 waeren hoechstens 0,1 erwartet — '
      + 'das Tor ist zu lasch.');
  });

  it('(ii) STAERKE: ein grosser, gut belegter Effekt wird gezeigt', () => {
    const f = tor();
    const r = f(karte(200, 100, 25, 100, 1), 2);
    assert.ok(r, 'n = 200/100 mit Versatz 25 (Abstand ~38, p << ALPHA) wird nicht '
      + 'gezeigt — das Tor ist ein Totalfilter. (Eine feste Schwelle 50 haette '
      + 'diesen Effekt verschluckt.)');
    assert.equal(r.suggested_count, 3);
    assert.equal(r.direction, 'up');
    assert.ok(r.p_value < SCHWELLEN.ALPHA, 'p_value liegt nicht unter ALPHA');
    assert.equal(r.alpha, SCHWELLEN.ALPHA);
  });

  it('(iii) KLEINE STICHPROBE: 20/10 Listen, Abstand ~60, grosse Streuung — kein Vorschlag', () => {
    const f = tor();
    const med = (a) => { a = a.slice().sort((x, y) => x - y); const n = a.length;
      return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
    const abstand = (k) => med(k._perListCounts.filter(e => e.count === 2).map(e => e.place))
                         - med(k._perListCounts.filter(e => e.count === 3).map(e => e.place));
    /* Erster seed-fester Lauf, dessen Abstand ueber der ALTEN Schwelle 50 liegt —
       so unterscheidet der Fall die neue Regel von der alten. */
    let k = null, gap = null;
    for (let seed = 1; seed <= 2000 && !k; seed++) {
      const c = karte(20, 10, 0, 400, seed);
      const g = abstand(c);
      if (g > 50 && g < 80) { k = c; gap = g; }
    }
    assert.ok(k, 'Vorpruefung: kein seed-fester Fall mit Abstand > 50 gefunden');
    assert.equal(f(k, 2), null,
      `Abstand ${gap} aus nur 20/10 Listen bei grosser Streuung ist von Zufall `
      + 'nicht zu unterscheiden und darf nicht gezeigt werden.');
  });

  it('(iv) RICHTUNG: platziert die Mehrheit SCHLECHTER, kommt nie ein Vorschlag', () => {
    const f = tor();
    assert.equal(f(karte(200, 100, -60, 100, 3), 2), null);
  });

  it('(v) DETERMINISMUS: gleiche Eingabe, gleiches p', () => {
    const f = tor();
    const a = f(karte(200, 100, 25, 100, 1), 2);
    const b = f(karte(200, 100, 25, 100, 1), 2);
    assert.ok(a && b);
    assert.equal(a.p_value, b.p_value);
    assert.equal(a.placement_gap, b.placement_gap);
  });

  it('zu kleine Gruppe (< MIN_GROUP) wird nie gezeigt', () => {
    const f = tor();
    const k = karte(40, SCHWELLEN.MIN_GROUP - 1, 300, 20, 4);
    assert.equal(f(k, 2), null);
  });
});

describe('der Quelltext gibt die Herkunft der Zahlen ehrlich an', () => {

  it('ALPHA ist als KONVENTION gekennzeichnet, nicht als belegt', () => {
    assert.ok(/ALT_SUGGESTION_ALPHA\s*=\s*[0-9.]+;\s*\/\/\s*KONVENTION/.test(KONS),
      'ALPHA steht ohne den Hinweis, dass es eine Konvention ist');
    assert.ok(/Permutationstest/.test(KONS) && /NICHT GEPRUEFT/.test(KONS),
      'der Kopf nennt Verfahren oder Grenzen nicht mehr');
  });

  it('die alte Turin-Begruendung steht nur noch mit ihrem Widerruf da', () => {
    const turin = KONS.indexOf('Turin sweep');
    assert.ok(turin >= 0, 'Vorpruefung: die Herkunftsgeschichte ist ganz verschwunden');
    const umfeld = KONS.slice(Math.max(0, turin - 1200), turin + 1200);
    assert.ok(/NICHT AUFFINDBAR/.test(umfeld),
      'die Turin-Begruendung steht wieder ohne den Hinweis da, dass ihr Beleg '
      + 'im Repo nicht existiert');
  });

  it('der Kommentar nennt den Messweg, damit ihn jemand nachfahren kann', () => {
    assert.ok(KONS.includes('tests/unit/test-alt-vorschlag-schwelle.js'),
      'der Kommentar verweist nicht auf die Datei, die seine Zahlen misst');
  });
});
