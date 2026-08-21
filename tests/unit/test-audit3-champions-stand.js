/**
 * Audit 3 — Punkt C: Die Nutzungszahlen tragen ihren Stand.
 *
 * Befund (21.08.2026): champions_usage.json stand seit dem 17.07.2026
 * unveraendert — championsbattledata.com drosselt den Bulk-Scrape aus CI-IPs —
 * und die Datei trug kein Datumsfeld. Die Ansicht zeigte trotzdem
 * "Saison: Current", also 35 Tage alte Zahlen als aktuell beschriftet.
 *
 * Belegt am selben Tag: der Lauf "Auto: champions-usage refresh — 05:14 UTC"
 * fasste data/champions_usage.json gar nicht an (nur champions_pokedex.json).
 *
 * Fix: scrape_champions_usage.py schreibt bei jedem ERFOLGREICHEN Lauf ein
 * _meta.scraped_at; die Ansicht zeigt es, solange es da ist, und bleibt sonst
 * ehrlich bei "Stand unbekannt".
 *
 * Der Test fuehrt die ECHTE quellHinweis()-Funktion aus der Quelle mit
 * Attrappen aus. Gegengeprueft: ohne den scraped_at-Zweig faellt er.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const USAGE = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-usage.js'), 'utf8');
const SCRAPER = fs.readFileSync(path.join(ROOT, 'scripts', 'scrape_champions_usage.py'), 'utf8');

function cutBalanced(src, sig) {
  const a = src.indexOf(sig);
  assert.ok(a > -1, sig + ' nicht gefunden');
  const open = src.indexOf('{', a);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(a, i + 1); }
  }
  throw new Error('Ende ' + sig + ' nicht gefunden');
}

// Die echten Sprachtabellen aus der Quelle ziehen, damit der Test die
// tatsaechlich ausgelieferten Texte misst und nicht nachgebaute.
function baueHinweis(lang, meta, jetzt) {
  const block = cutBalanced(USAGE, 'function quellHinweis(')
    + '\n; return quellHinweis;';
  const de = {
    sourceNote: 'Quelle: championsbattledata.com · Stand unbekannt',
    sourceStand: (d) => `Quelle: championsbattledata.com · Stand ${d}`,
    sourceAlt: (t) => `seit ${t} Tagen unveraendert`,
  };
  const en = {
    sourceNote: 'Source: championsbattledata.com · date unknown',
    sourceStand: (d) => `Source: championsbattledata.com · as of ${d}`,
    sourceAlt: (t) => `unchanged for ${t} days`,
  };
  const echtesDateNow = Date.now;
  Date.now = () => jetzt;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('_usageMeta', 'L', 'getLang', block)(
      meta, () => (lang === 'de' ? de : en), () => lang);
    return fn();
  } finally {
    Date.now = echtesDateNow;
  }
}

const JETZT = Date.parse('2026-08-21T12:00:00Z');

describe('Audit 3 — Champions-Nutzung weist ihren Stand aus', () => {

  it('ohne scraped_at bleibt es bei "Stand unbekannt" — keine erfundene Frische', () => {
    // Das ist der Zustand des Altbestands, bis der naechste Lauf glueckt.
    assert.match(baueHinweis('de', {}, JETZT), /Stand unbekannt/);
    assert.match(baueHinweis('en', {}, JETZT), /date unknown/);
  });

  it('mit scraped_at steht das Datum da', () => {
    const h = baueHinweis('de', { scraped_at: '2026-08-21T05:10:00+00:00' }, JETZT);
    assert.match(h, /Stand 21\.8\.2026/);
    assert.ok(!/unbekannt/.test(h), 'trotz Datum steht noch "unbekannt" da: ' + h);
  });

  it('ab einer Woche ohne frischen Scrape steht das Alter dabei', () => {
    // Genau der Fall vom 21.08.2026: letzter echter Scrape 17.07., also 35 Tage.
    const h = baueHinweis('de', { scraped_at: '2026-07-17T05:10:00+00:00' }, JETZT);
    assert.match(h, /35 Tagen unveraendert/,
      'das Alter muss sichtbar sein, sonst liest sich ein altes Datum wie ein frisches: ' + h);
  });

  it('ein unlesbares Datum wird nicht zu einer Behauptung', () => {
    assert.match(baueHinweis('de', { scraped_at: 'irgendwann' }, JETZT), /Stand unbekannt/);
  });

  it('der Scraper schreibt scraped_at nur in den Erfolgsfall', () => {
    // Es steht im _meta-Block, der erst NACH dem Regressionsschutz
    // ("keeping committed JSON", return 1) aufgebaut wird — ein gedrosselter
    // Lauf darf keinen frischen Stand hinterlassen.
    const iGuard = SCRAPER.indexOf('keeping committed JSON');
    const iStamp = SCRAPER.indexOf('"scraped_at"');
    assert.ok(iGuard > -1 && iStamp > -1, 'Guard oder Zeitstempel nicht gefunden');
    assert.ok(iStamp > iGuard,
      'scraped_at wird geschrieben, bevor der Regressionsschutz greift — '
      + 'dann sieht auch ein abgebrochener Lauf frisch aus');
  });
});
