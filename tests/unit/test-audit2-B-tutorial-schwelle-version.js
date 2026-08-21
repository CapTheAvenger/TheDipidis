/**
 * Audit 2, Gruppe B — F17: Tutorial (tutorial.de.html).
 * (A) Die harte Aussage, eine Matchup-Zeile brauche ≥ 30 Spiele, DAMIT SIE
 *     ANGEZEIGT WIRD, widerspricht dem Code — die echten Simulator-Floors sind
 *     MAJOR_MATCHUP_MIN_GAMES=10, DAY1/DAY2=5, PAST=3 (app-meta-call.js:71-84).
 *     Reformuliert auf die echten Floors + Vertrauens-Heuristik.
 * (C) Version 'v47 · Juni 2026' und der Changelog (Predictor 5.6/5.7) hinkten
 *     hinter Code (Predictor bis 6.1) und Datum her. Aktualisiert.
 *
 * Warum Textassertion statt Verhaltenstest: es geht um statischen
 * Dokumentationstext ohne eigene Funktion. Die Floor-Zahlen werden aber gegen
 * die ECHTEN Konstanten in app-meta-call.js verankert (aus der Quelle gelesen),
 * damit der Test faellt, sollten sich Floors und Anleitung wieder auseinander
 * bewegen — und die alte 30-Schwellen-Behauptung wird explizit ausgeschlossen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const HTML = fs.readFileSync(path.join(ROOT, 'tutorial', 'tutorial.de.html'), 'utf8');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

function konst(name) {
  const m = MC.match(new RegExp('const ' + name + '\\s*=\\s*(\\d+)'));
  assert.ok(m, name + ' nicht in app-meta-call.js gefunden');
  return Number(m[1]);
}

describe('F17(A) — keine 30-Spiele-Anzeigeschwelle mehr', () => {
  it('die alte harte Behauptung "braucht ≥ 30 Spiele, damit eine Zeile angezeigt wird" ist weg', () => {
    assert.ok(!/braucht[^.]*≥\s*30\s*Spiele[^.]*angezeigt wird/.test(HTML),
      'harte 30-Spiele-Anzeigeschwelle steht noch im Tutorial');
  });

  it('die Anleitung nennt stattdessen die ECHTEN Floors aus dem Code (10 / 5 / 3)', () => {
    const major = konst('MAJOR_MATCHUP_MIN_GAMES');       // 10
    const day1 = konst('MAJOR_MATCHUP_MIN_GAMES_DAY1');   // 5
    const past = konst('MAJOR_MATCHUP_MIN_GAMES_PAST');   // 3
    // Der reformulierte Pro-Tipp-Absatz muss die echten Floors tragen.
    const tipp = HTML.match(/Eine Matchup-Zeile erscheint[\s\S]{0,400}?Cooking/);
    assert.ok(tipp, 'reformulierter Pro-Tipp-Absatz nicht gefunden');
    const txt = tipp[0];
    assert.ok(txt.includes('≥ ' + major) || txt.includes('≥ ' + major + ' '), 'Major-Floor ' + major + ' fehlt');
    assert.ok(txt.includes('≥ ' + day1), 'Day-1/2-Floor ' + day1 + ' fehlt');
    assert.ok(txt.includes('≥ ' + past), 'Past-Floor ' + past + ' fehlt');
  });
});

describe('F17(C) — Version, Datum und Predictor-Stand aktualisiert', () => {
  it('Hero-Version ist nicht mehr v47/Juni 2026', () => {
    const hero = HTML.match(/tutorial-hero-eyebrow">([^<]+)</);
    assert.ok(hero, 'Hero-Version nicht gefunden');
    assert.ok(!/v47/.test(hero[1]), 'Version steht noch auf v47: ' + hero[1]);
    assert.ok(!/Juni 2026/.test(hero[1]), 'Datum steht noch auf Juni 2026: ' + hero[1]);
    assert.match(hero[1], /v4[89]|v5\d/, 'Version nicht hochgezaehlt: ' + hero[1]);
  });

  it('Changelog nennt den aktuellen Predictor-Stand (bis 6.1), nicht nur 5.6/5.7', () => {
    const block = HTML.match(/Meta Call Predictor[^<]*<\/strong>[\s\S]{0,600}/);
    assert.ok(block, 'Predictor-Changelog-Zeile nicht gefunden');
    assert.match(block[0], /6\.1/, 'Predictor-Stand nennt 6.1 nicht');
    // Der Code hat tatsaechlich eine 6.1-Stufe (Live-Share Floor).
    assert.match(MC, /Predictor 6\.1/, 'Code hat keine 6.1-Stufe (Annahme falsch)');
  });
});
