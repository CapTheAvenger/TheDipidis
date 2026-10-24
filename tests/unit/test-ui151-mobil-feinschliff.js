/**
 * UI-151 (24.10.2026): Feinschliff aus der Seitenpruefung am Handy (scripts/messe_seiten_mobil.js, 320-430 px).
 * Textregeln gegen die CSS-Dateien (Kommentare herausgeschnitten); die Masse selbst misst das Skript.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const lies = (d) => fs.readFileSync(path.join(__dirname, '..', '..', 'css', d), 'utf8');
const NAV = lies('ds-nav.css'), MOB = lies('mobile-responsive.css'), MC = lies('meta-call.css');

function pruefe(nav, mob, mc) {
  const n = ohneKommentare(nav), m = ohneKommentare(mob), c = ohneKommentare(mc);
  assert.ok(n.length > nav.length * 0.3 && m.length > mob.length * 0.3, 'Ausschneiden hat zu viel entfernt');
  const tab = n.match(/\.ds-tabbar-btn \{ font-size: (\d+)px; letter-spacing: ([\d.]+)em;/);
  assert.ok(tab, 'Tableiste: Schrift/Laufweite fehlt');
  assert.ok(+tab[1] >= 10, 'Schriftboden 10 px');
  assert.ok(+tab[2] <= 0.05, 'Laufweite eng');
  assert.match(m, /#past-meta \.control-row \{ width: 100%/);
  assert.match(m, /@media \(max-width: 340px\) \{\s*#city-league\.fs-scale \.city-league-info-table-header \{[^}]*white-space: normal !important/);
  assert.match(c, /\.mc-rec-name-text \{[^}]*overflow-wrap: anywhere/);
}

describe('UI-151 Handy-Feinschliff', () => {
  it('Regeln stehen', () => pruefe(NAV, MOB, MC));
  it('Verfaelschungsprobe: jede entfernte Regel faellt auf', () => {
    assert.throws(() => pruefe(NAV.replace('letter-spacing: .04em', 'letter-spacing: .09em'), MOB, MC));
    assert.throws(() => pruefe(NAV, MOB.replace('#past-meta .control-row { width: 100%', '#past-meta .control-row { x: 1'), MC));
    assert.throws(() => pruefe(NAV, MOB.replace('white-space: normal !important; overflow-wrap', 'overflow-wrap'), MC));
    assert.throws(() => pruefe(NAV, MOB, MC.replace('overflow-wrap: anywhere; /* UI-151', '/* UI-151')));
  });
});
