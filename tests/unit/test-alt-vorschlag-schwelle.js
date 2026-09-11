/**
 * ALT_SUGGESTION_MIN_GAP = 50 — WAS DIE ZAHL TUT, UND WORAUF SIE BERUHT.
 *
 * DER BEFUND (10.09.2026)
 * -----------------------
 * Im Kopf von js/deck-builder-consistency.js stand als Begruendung fuer
 * die vier Schwellen des Alternativvorschlags:
 *
 *     "the Turin sweep showed a 50/50 win-rate for naive vs plurality
 *      with looser settings, but the tighter combo only fires on cases
 *      where plurality genuinely correlated with better placements
 *      (3 / 4 wins on Turin data)."
 *
 * Gesucht wurde nach diesem Sweep in allen .md, .json und .py des Repos
 * (Suchbegriffe "Turin", "alt_suggestion", "ALT_SUGGESTION",
 * "Pruefstand"/"Prüfstand"): KEIN Datensatz, KEIN Protokoll, KEINE
 * Auswertung. Der einzige Treffer zur Sache ist AUDIT_DATA_PIPELINE.md,
 * Befund F-D09 — und der sagt, dass die CSV damals nur EIN Turnier trug
 * ("distinct tournaments: 1", Turin). Heute sind es vier.
 *
 * Die 50 ist damit GEGRIFFEN, nicht belegt. Sie wird nicht geraten
 * korrigiert: eine andere Zahl waere genauso unbelegt und saehe
 * genauso richtig aus.
 *
 * WAS DIESER TEST DESHALB TUT — UND WAS NICHT
 * -------------------------------------------
 * Er nagelt die 50 NICHT fest. Er misst, WELCHE ROLLE sie an den
 * heutigen Daten spielt, und schlaegt an, wenn sich diese Rolle
 * VERAENDERT (CLAUDE.md: "Detect change against a baseline"). Drei
 * Aussagen, alle an data/tournament_decklists_per_player.csv gemessen:
 *
 *   1. Das Tor wird ueberhaupt erreicht. Sperrte eine der vier
 *      vorgelagerten Regeln alles ab, waere die 50 tote Regel und die
 *      Begruendung im Quelltext unpruefbar.
 *   2. Das Tor traegt in BEIDE Richtungen — es unterdrueckt etwas UND
 *      laesst etwas durch. Faellt eine der beiden Seiten auf null, ist
 *      die Zahl entweder wirkungslos oder ein Totalfilter, und beides
 *      muss jemand sehen.
 *   3. Die Zahl sitzt nicht auf einer Kante. Laege ein gemessener
 *      Abstand direkt neben der 50, entschiede eine gegriffene Zahl
 *      ueber einen einzelnen Vorschlag. Heute ist der naechste Abstand
 *      darunter 42, der naechste darueber 64 — jede Schwelle zwischen
 *      43 und 64 ergibt dasselbe Ergebnis.
 *
 * Dazu eine vierte, datenfreie Zusicherung: dass das Tor an einem von
 * Hand gerechneten Fall in der richtigen RICHTUNG wirkt — knapp
 * darunter still, knapp darueber laut. Sie liest die Schwelle aus dem
 * Modul, statt sie abzuschreiben, und bleibt deshalb gueltig, wenn
 * jemand die 50 begruendet aendert.
 *
 * NICHT GEPRUEFT: ob die 50 die RICHTIGE Zahl ist. Das waere eine
 * Aussage darueber, ob die Mehrheit der Tag-2-Listen tatsaechlich besser
 * platziert — sie braeuchte Turniere, die es noch nicht gibt, und einen
 * Abruf, den dieser Sandkasten nicht hat.
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
  ['    const gap = naiveMedian - pluralityMedian;\n'
   + '    if (gap < ALT_SUGGESTION_MIN_GAP) return null;',
   '    const gap = naiveMedian - pluralityMedian;\n'
   + '    __z.abstaende.push(gap);\n'
   + '    if (gap < ALT_SUGGESTION_MIN_GAP) { __z.unterdrueckt++; return null; }\n'
   + '    __z.durch++;'],
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
              anteil: 0, medianFehlt: 0, unterdrueckt: 0, durch: 0, abstaende: [] };
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

describe('ALT_SUGGESTION_MIN_GAP — die Rolle der Zahl an den echten Daten', () => {

  it('der Zaehlerbau findet seine Anker im Quelltext', () => {
    /* Steht hier als EIGENE Zusicherung, damit ein verrutschter Anker
       einen benannten roten Test ergibt statt einer stillen Null. */
    assert.equal(AUFBAU_FEHLER, null,
      'die Messung konnte nicht aufgebaut werden: '
      + (AUFBAU_FEHLER && AUFBAU_FEHLER.message));
  });

  it('die Schwellen kommen aus dem Modul, nicht aus einer Kopie im Test', () => {
    assert.ok(SCHWELLEN, 'js/deck-builder-consistency.js exportiert die Schwellen nicht');
    for (const k of ['FRAC_MIN', 'FRAC_MAX', 'MIN_SHARE', 'MIN_SAMPLE', 'MIN_GAP']) {
      assert.equal(typeof SCHWELLEN[k], 'number', `${k} fehlt im Export`);
    }
  });

  it('das Tor wird ueberhaupt erreicht — sonst ist die Zahl tote Regel', () => {
    if (!MESSUNG) return; // ohne CSV nichts zu messen, siehe eigene Zusicherung unten
    const erreicht = MESSUNG.abstaende.length;
    assert.ok(erreicht > 0,
      'kein einziger Kandidat erreicht ALT_SUGGESTION_MIN_GAP. Eine der vier '
      + 'vorgelagerten Regeln sperrt alles ab, und die 50 entscheidet nichts:\n'
      + `  Aufrufe ${MESSUNG.aufrufe}, raus an Stichprobe ${MESSUNG.stichprobe}, `
      + `an der Randzone ${MESSUNG.randzone}, deckungsgleich ${MESSUNG.deckungsgleich}, `
      + `am Anteil ${MESSUNG.anteil}, Median fehlt ${MESSUNG.medianFehlt}`);
  });

  it('das Tor traegt in beide Richtungen — es unterdrueckt UND laesst durch', () => {
    if (!MESSUNG) return;
    const erreicht = MESSUNG.abstaende.length;
    assert.ok(MESSUNG.durch > 0,
      `ALT_SUGGESTION_MIN_GAP = ${SCHWELLEN.MIN_GAP} unterdrueckt inzwischen ALLE `
      + `${erreicht} Kandidaten — der Alternativvorschlag erscheint nirgends mehr. `
      + 'Entweder haben sich die Daten verschoben oder die Zahl passt nicht mehr; '
      + 'beides gehoert angeschaut, nicht stillschweigend hingenommen.\n'
      + `  gemessene Abstaende: ${JSON.stringify(MESSUNG.abstaende.slice().sort((a, b) => a - b))}`);
    assert.ok(MESSUNG.unterdrueckt > 0,
      `ALT_SUGGESTION_MIN_GAP = ${SCHWELLEN.MIN_GAP} unterdrueckt nichts mehr — `
      + 'dann ist die Zahl wirkungslos und die Begruendung im Quelltext hinfaellig.');
  });

  it('die Zahl sitzt nicht auf einer Kante', () => {
    if (!MESSUNG) return;
    /* Laege ein gemessener Abstand unmittelbar neben der Schwelle,
       entschiede eine GEGRIFFENE Zahl ueber einen einzelnen Vorschlag.
       Gemessen 11.09.2026: naechster Abstand darunter 26, darueber
       113,5 — jede Schwelle zwischen 27 und 113 ergibt dasselbe
       Ergebnis. */
    const g = SCHWELLEN.MIN_GAP;
    const darunter = MESSUNG.abstaende.filter(x => x < g);
    const darueber = MESSUNG.abstaende.filter(x => x >= g);
    const naechsteDarunter = darunter.length ? Math.max(...darunter) : null;
    const naechsteDarueber = darueber.length ? Math.min(...darueber) : null;
    const abstandZurKante = Math.min(
      naechsteDarunter == null ? Infinity : g - naechsteDarunter,
      naechsteDarueber == null ? Infinity : naechsteDarueber - g);
    /* BEWUSST NUR "> 0", NICHT "> 2".
       Ein enges Band waere hier ein abgelesener Wochenwert und wuerde
       den Deploy anhalten, sobald der naechste Scraperlauf die Mediane
       verschiebt — die Bauart, an der dieses Projekt schon zweimal
       haengengeblieben ist (siehe tests/unit/test-testdaten-wachhund.js).
       Verlangt wird deshalb nur, dass die Schwelle nicht EXAKT auf einem
       gemessenen Abstand sitzt. Tritt das ein, entscheidet eine Zahl
       ohne Beleg einen einzelnen Fall per Gleichstand — dann MUSS der
       Test rot werden, denn dann ist die fehlende Begruendung nicht mehr
       folgenlos. Gemessener Sicherheitsabstand am 11.09.2026: 24
       Plaetze nach unten (26), 63,5 nach oben (113,5). */
    assert.ok(abstandZurKante > 0,
      `ALT_SUGGESTION_MIN_GAP = ${g} liegt jetzt GENAU auf einem gemessenen `
      + 'Abstand. Damit entscheidet eine Zahl ohne Beleg einen einzelnen Vorschlag '
      + 'per Gleichstand — das ist die Lage, in der die Zahl begruendet werden '
      + 'muss statt weiterbenutzt.\n'
      + `  naechster Abstand darunter: ${naechsteDarunter}, darueber: ${naechsteDarueber}`);
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

describe('das Tor wirkt in der richtigen Richtung — von Hand gerechnet', () => {

  /* Datenfrei und deterministisch: zwei Listensaetze, deren Median-
     abstand die Schwelle knapp verfehlt bzw. knapp ueberspringt. Die
     Schwelle wird AUS DEM MODUL gelesen — der Fall bleibt damit gueltig,
     wenn jemand die 50 begruendet aendert. */
  function fall(abstand) {
    const g = SCHWELLEN.MIN_GAP;
    /* Zwei Drittel der Listen spielen 3 Kopien (die Mehrheit, 67 % >
       50 %), ein Drittel spielt 2 (die naive Rundung). Mediane so
       gelegt, dass naiveMedian - pluralityMedian genau `abstand` ergibt.
       Beide Mediane sind konstant, der Fall bleibt also exakt.

       DIE ANZAHL KOMMT AUS DEM MODUL, nicht aus einer festen Sechs.
       Bis zum 11.09.2026 standen hier sechs Listen fest im Test — bei
       ALT_SUGGESTION_MIN_SAMPLE = 5 ging das auf. Mit der Anhebung auf
       30 fiel der Fall still an der Stichprobenregel durch und der Test
       meldete "kein Vorschlag", obwohl das Tor selbst in Ordnung war.
       Eine abgeschriebene Zahl im Test misst dann etwas anderes als das
       Modul tut. */
    const n = Math.max(6, SCHWELLEN.MIN_SAMPLE);
    const nMehrheit = Math.ceil(n * 2 / 3);
    const perListCounts = [];
    for (let i = 0; i < nMehrheit; i++) perListCounts.push({ count: 3, place: 10 });
    for (let i = nMehrheit; i < n; i++) perListCounts.push({ count: 2, place: 10 + abstand });
    return { g, karte: { name: 'Probe', weightedAvgCount: 2.5, _perListCounts: perListCounts } };
  }

  it('knapp UNTER der Schwelle bleibt es still', () => {
    const sb = sandkasten(KONS, {});
    const f = fall(SCHWELLEN.MIN_GAP - 1);
    const r = sb.MostConsistencyBuilder._internals.alternativVorschlag(f.karte, 2);
    assert.equal(r, null,
      `Abstand ${f.g - 1} liegt unter der Schwelle ${f.g}, es kam trotzdem ein `
      + `Vorschlag: ${JSON.stringify(r)}`);
  });

  it('genau AUF der Schwelle wird es laut', () => {
    const sb = sandkasten(KONS, {});
    const f = fall(SCHWELLEN.MIN_GAP);
    const r = sb.MostConsistencyBuilder._internals.alternativVorschlag(f.karte, 2);
    assert.ok(r, `Abstand ${f.g} erreicht die Schwelle ${f.g}, es kam kein Vorschlag`);
    assert.equal(r.naive_count, 2);
    assert.equal(r.suggested_count, 3);
    assert.equal(r.placement_gap, f.g);
    assert.equal(r.direction, 'up');
  });

  it('ein NEGATIVER Abstand (Mehrheit platziert schlechter) bleibt immer still', () => {
    /* Die Richtung ist die eigentliche Aussage des Tors: es soll nur
       melden, wenn die Mehrheit BESSER steht. Ohne diese Zusicherung
       waere ein Vorzeichendreher unsichtbar. */
    const sb = sandkasten(KONS, {});
    const f = fall(-(SCHWELLEN.MIN_GAP + 100));
    const r = sb.MostConsistencyBuilder._internals.alternativVorschlag(f.karte, 2);
    assert.equal(r, null,
      'die Mehrheit platziert 150 Plaetze SCHLECHTER und wird trotzdem vorgeschlagen');
  });
});

describe('der Quelltext gibt die Herkunft der Zahl ehrlich an', () => {

  it('die 50 ist als gegriffen gekennzeichnet, nicht als belegt', () => {
    /* Der alte Kommentar berief sich auf einen "Turin sweep", den es im
       Repo nicht gibt. Wer den Beleg nachtraegt, darf diese Zusicherung
       aendern — wer den Hinweis nur loescht, faellt hier auf. */
    assert.ok(/GEGRIFFEN/.test(KONS),
      'der Quelltext kennzeichnet ALT_SUGGESTION_MIN_GAP nicht mehr als gegriffen');
    /* Die Turin-Begruendung DARF im Quelltext stehen bleiben — sie ist
       die Geschichte der Zahl. Sie darf nur nicht als Beleg dastehen.
       Geprueft wird deshalb nicht ihre Abwesenheit, sondern dass der
       Widerruf unmittelbar dabeisteht. */
    /* Auf "Turin sweep" verankert, nicht auf "Turin": das Turnier
       Turin steht in dieser Datei an sechs weiteren, harmlosen
       Stellen (Feldgroessen, Turnier-Kennungen). */
    const turin = KONS.indexOf('Turin sweep');
    assert.ok(turin >= 0, 'Vorpruefung: die Herkunftsgeschichte ist ganz verschwunden');
    const umfeld = KONS.slice(Math.max(0, turin - 1200), turin + 1200);
    assert.ok(/NICHT AUFFINDBAR/.test(umfeld),
      'die Turin-Begruendung steht wieder ohne den Hinweis da, dass ihr Beleg '
      + 'im Repo nicht existiert');
  });

  it('der Kommentar nennt den Messweg, damit ihn jemand nachfahren kann', () => {
    assert.ok(KONS.includes('tests/unit/test-alt-vorschlag-schwelle.js'),
      'der Kommentar verweist nicht auf die Datei, die seine Zahlen misst — '
      + 'dann ist die Messung beim naechsten Leser wieder verloren');
  });
});
