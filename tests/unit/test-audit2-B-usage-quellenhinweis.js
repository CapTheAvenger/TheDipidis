/**
 * Audit 2, Gruppe B — F03: Die Nutzungszahlen (champions_usage.json) stehen seit
 * 2026-07-17 still, wurden aber als 'Saison: Current' ohne Frische-/Quellhinweis
 * gezeigt. champions_usage.json hat KEIN Datumsfeld, 'Current' suggeriert also
 * unbelegbare Frische. Fix (nur Frontend): Saison-/Nutzungsanzeige traegt jetzt
 * einen Quell-/Stand-Hinweis (Quelle championsbattledata.com · Stand unbekannt).
 *
 * Audit 3 hat nachgezogen: sobald champions_usage.json ein _meta.scraped_at
 * traegt, zeigt die Zeile das echte Datum. Dieser Test beschreibt weiterhin den
 * Zustand OHNE Datum — dann muss es ehrlich bei "Stand unbekannt" bleiben.
 *
 * Test: a) das ECHTE usageSeasonLbl (Pokédex-Overlay) wird ausgefuehrt und muss
 * Quelle + Stand-unbekannt tragen; b) die ECHTE render()-Kopfzeile des
 * Nutzung-Reiters wird mit einem DOM-Stub ausgefuehrt und muss den Quellhinweis
 * enthalten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const POKEDEX = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-pokedex.js'), 'utf8');
const USAGE = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-usage.js'), 'utf8');

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

// Beide usageSeasonLbl-Arrowfunktionen (de + en) aus dem Pokédex ziehen.
function seasonLbls() {
  const re = /usageSeasonLbl:\s*(\(s\) => `[^`]*`)/g;
  const out = [];
  let m;
  while ((m = re.exec(POKEDEX))) {
    // eslint-disable-next-line no-new-func
    out.push(new Function('return ' + m[1] + ';')());
  }
  assert.equal(out.length, 2, 'erwartete 2 usageSeasonLbl (de+en), fand ' + out.length);
  return out;
}

describe('F03 (Pokédex) — Saison-Label traegt Quelle + Stand-unbekannt', () => {
  it('de: nicht mehr nur "Saison: Current", sondern mit Quelle und Stand unbekannt', () => {
    const [de] = seasonLbls();
    const out = de('Current');
    assert.ok(out.includes('championsbattledata.com'), 'Quelle fehlt: ' + out);
    assert.match(out, /Stand unbekannt/, 'Stand-unbekannt-Hinweis fehlt: ' + out);
    assert.notEqual(out, 'Saison: Current', 'Label suggeriert weiter implizit Frische');
  });

  it('en: mit Quelle und "date unknown"', () => {
    const en = seasonLbls()[1];
    const out = en('Current');
    assert.ok(out.includes('championsbattledata.com'), 'Quelle fehlt: ' + out);
    assert.match(out, /date unknown/, 'date-unknown-Hinweis fehlt: ' + out);
  });
});

// Den echten sourceNote-Text aus usage.js (de) ziehen.
function realSourceNote() {
  const m = USAGE.match(/sourceNote:\s*'([^']*championsbattledata[^']*)'/);
  assert.ok(m, 'sourceNote (de) nicht gefunden');
  return m[1];
}

describe('F03 (Nutzung-Reiter) — render() traegt den Quellhinweis in der Kopfzeile', () => {
  it('die gerenderte Kopfzeile enthaelt Quelle + Stand-unbekannt', () => {
    const renderSrc = cutBalanced(USAGE, 'function render(');
    let captured = '';
    const host = { get hidden() { return false; }, set innerHTML(v) { captured = v; } };
    const scope = {
      document: { getElementById: () => host },
      _teams: [{ name: 'A' }, { name: 'B' }],
      _format: 'doubles',
      esc: (s) => String(s),
      L: () => ({
        brand: 'Nutzung', pokemonCount: 'Pokémon', doubles: 'Doppel', singles: 'Einzel',
        sourceNote: realSourceNote(),
      }),
      filterHtml: () => '', listHtml: () => '', detailHtml: () => '', wire: () => {},
      // Seit Audit 3 baut render() die Zeile ueber quellHinweis(), damit ein
      // vorhandenes _meta.scraped_at als echtes Datum erscheint. Ohne Datum —
      // und genau das ist der Zustand, den dieser Test beschreibt — faellt die
      // Funktion auf sourceNote zurueck. Hier die ECHTE Funktion aus der
      // Quelle einsetzen statt eine Attrappe, sonst prueft der Test seinen
      // eigenen Nachbau.
      quellHinweis: (function () {
        const src = cutBalanced(USAGE, 'function quellHinweis(') + '\n; return quellHinweis;';
        // eslint-disable-next-line no-new-func
        return new Function('_usageMeta', 'L', 'getLang', src)(
          {}, () => ({ sourceNote: realSourceNote() }), () => 'de');
      }()),
    };
    const names = Object.keys(scope);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...names, renderSrc + '\nreturn render();');
    fn(...names.map(k => scope[k]));
    assert.ok(captured.includes('championsbattledata.com'),
      'Kopfzeile nennt die Quelle nicht: ' + captured.slice(0, 400));
    assert.match(captured, /Stand unbekannt/, 'Kopfzeile ohne Stand-unbekannt-Hinweis');
  });
});
