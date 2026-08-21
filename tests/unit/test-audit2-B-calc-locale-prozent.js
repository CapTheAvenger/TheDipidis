/**
 * Audit 2, Gruppe B — F10: Der EV-/Wahrscheinlichkeits-Rechner gab Ergebnisse
 * als roh 'X.YY%' aus (toFixed(2)+'%'), also mit Punkt-Dezimaltrenner in der
 * deutschen UI (live '11.67%'). Fix: locale-abhaengig ueber app-utils.formatPercent
 * (de: Komma + geschuetztes Leerzeichen + %, en: Punkt + %).
 *
 * Test: der ECHTE Helfer _calcPct aus app-calculator.js wird mit dem ECHTEN
 * formatPercent aus app-utils.js ausgefuehrt; de muss Komma, en muss Punkt
 * liefern. Faellt der Code auf rohes toFixed zurueck, kaeme in de ein Punkt
 * heraus -> rot.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CALC = fs.readFileSync(path.join(ROOT, 'js', 'app-calculator.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');

function cut(src, from, to, was) {
  const a = src.indexOf(from);
  const b = a > -1 ? src.indexOf(to, a + from.length) : -1;
  assert.ok(a > -1 && b > a, was + ' nicht gefunden');
  return src.slice(a, b + to.length);
}

// _calcPct + echtes formatPercent laden, getLang injizieren.
function ladePct(lang) {
  const calcPct = cut(CALC, 'function _calcPct(prob) {', '\n    }', '_calcPct');
  const fmt = cut(UTILS, 'function formatPercent(value, digits = 1) {', '\n}', 'formatPercent');
  const body = fmt + '\n' + calcPct + '\nreturn _calcPct;';
  // eslint-disable-next-line no-new-func
  return new Function('getLang', body)(() => lang);
}

describe('F10 — Rechner-Prozent locale-abhaengig', () => {
  it('deutsch: Komma-Dezimaltrenner', () => {
    const pct = ladePct('de');
    const out = pct(11.666);
    assert.match(out, /^11,67/, 'kein Komma in de: ' + JSON.stringify(out));
    assert.ok(!out.includes('11.67'), 'Punkt-Dezimaltrenner in de geblieben: ' + JSON.stringify(out));
    assert.ok(out.includes('%'));
  });

  it('englisch: Punkt-Dezimaltrenner', () => {
    const pct = ladePct('en');
    assert.equal(pct(11.666), '11.67%');
  });

  it('0 % wird als Zahl geschrieben, nicht als Leerstring', () => {
    assert.match(ladePct('de')(0), /^0,00/);
    assert.equal(ladePct('en')(0), '0.00%');
  });
});
