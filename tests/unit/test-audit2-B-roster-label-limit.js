/**
 * Audit 2, Gruppe B — F19: rosterHtml() rendert nur rows.slice(0, 200), das
 * Label nannte aber die volle gefilterte Zeilenzahl (live 287). Bei >200
 * Zeilen log das Label "287", waehrend nur 200 gerendert wurden. Fix: das
 * Render-Limit bleibt, aber das Label signalisiert die verborgene Menge
 * ("zeige 200 von N — per Suche verfeinern").
 *
 * Test: die ECHTE rosterHtml (plus sectionLabel + der echte showingOf-Text)
 * werden aus der Quelle geschnitten und mit einem Roster > 200 ausgefuehrt;
 * geprueft wird, dass a) nur 200 Zeilen im Markup stehen und b) das Label die
 * verborgene Menge nennt (200 UND N).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-matchups.js'), 'utf8');

function cutFn(sig) {
  const a = SRC.indexOf(sig);
  assert.ok(a > -1, sig + ' nicht gefunden');
  // Balancierte Klammern ab der ersten '{' nach der Signatur.
  const open = SRC.indexOf('{', a);
  let depth = 0;
  for (let i = open; i < SRC.length; i++) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') { depth--; if (depth === 0) return SRC.slice(a, i + 1); }
  }
  throw new Error('Funktionsende ' + sig + ' nicht gefunden');
}

// Den echten de-showingOf-Text aus der Quelle ziehen.
function realShowingOf() {
  const m = SRC.match(/showingOf:\s*(\(shown, total\) => `[^`]*`)/);
  assert.ok(m, 'showingOf-Label nicht gefunden');
  // eslint-disable-next-line no-new-func
  return new Function('return ' + m[1] + ';')();
}

function run(rosterLen) {
  const rosterFn = cutFn('function rosterHtml(');
  const sectionLabelFn = cutFn('function sectionLabel(');
  const _roster = Array.from({ length: rosterLen }, (_, i) => ({ name: 'Mon' + i, count: 0 }));
  const scope = {
    _q: '',
    _roster,
    _me: null,
    esc: (s) => String(s),
    localName: (n) => n,
    L: () => ({ mine: 'Dein Pokémon', search: 'Suchen', noHit: 'Kein Treffer.', showingOf: realShowingOf() }),
  };
  const names = Object.keys(scope);
  const body = sectionLabelFn + '\n' + rosterFn + '\nreturn rosterHtml();';
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, body);
  return fn(...names.map(k => scope[k]));
}

function labelNote(html) {
  const m = html.match(/<h4 class="sq-lbl">[^<]*<em>([^<]*)<\/em>/);
  return m ? m[1] : null;
}

describe('F19 — Roster-Label signalisiert die verborgene Menge bei N>200', () => {
  it('bei 287 Zeilen: nur 200 gerendert, Label nennt 200 und 287', () => {
    const html = run(287);
    const gerendert = (html.match(/class="sq-row/g) || []).length;
    assert.equal(gerendert, 200, 'nicht genau 200 Zeilen gerendert: ' + gerendert);
    const note = labelNote(html);
    assert.ok(note, 'kein Label-Note gefunden');
    assert.ok(note.includes('200'), 'Label nennt die gezeigte Menge (200) nicht: ' + note);
    assert.ok(note.includes('287'), 'Label nennt die Gesamtmenge (287) nicht: ' + note);
    assert.notEqual(note.trim(), '287', 'Label nennt weiterhin nur die volle Zeilenzahl');
  });

  it('bei <=200 Zeilen: Label bleibt die schlichte Zeilenzahl', () => {
    const html = run(37);
    assert.equal(labelNote(html), '37');
  });
});
