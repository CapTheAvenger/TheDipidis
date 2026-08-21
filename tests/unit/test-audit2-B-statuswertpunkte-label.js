/**
 * Audit 2, Gruppe B — F20: Das Anzeige-Label 'EVs:' auf den Team-Karten und im
 * Claude-Prompt meint die Champions-Statuswertpunkte (0–32, Budget 66) — dieselbe
 * Groesse, die der Matchups-Subtab korrekt 'Statuswertpunkte' nennt
 * (app-side-quest-matchups.js:80). Fix: die ANZEIGE-Labels vereinheitlicht auf
 * 'Statuswertpunkte:'. Die Showdown-Round-Trip-Zeilen (Export/Import/Placeholder)
 * BLEIBEN 'EVs:' — sonst bricht der Paste-Round-Trip.
 *
 * Test: die betroffenen Ausdruecke werden aus app-side-quest.js geschnitten und
 * ausgefuehrt. Anzeige -> 'Statuswertpunkte:' ohne 'EVs:'; Export -> weiterhin
 * 'EVs:' und von der Import-Regex parsebar (Round-Trip bewiesen).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest.js'), 'utf8');

function cutLine(fragment) {
  // Ganze Quellzeile mit dem Fragment holen.
  const lines = SRC.split('\n');
  const hit = lines.find(l => l.includes(fragment));
  assert.ok(hit, 'Zeile mit "' + fragment + '" nicht gefunden');
  return hit.trim();
}

describe('F20 — Anzeige-Label ist "Statuswertpunkte:", Export bleibt "EVs:"', () => {
  it('Karten-Anzeige (renderPokemon): Label "Statuswertpunkte:", kein "EVs:"', () => {
    const line = cutLine('class="side-quest-evs-label"');
    // eslint-disable-next-line no-new-func
    const fn = new Function('p', 'escapeHtml', line + '\nreturn evs;');
    const out = fn({ evs: '2 HP / 32 Atk / 32 Spe' }, (s) => String(s));
    assert.ok(out.includes('Statuswertpunkte:'), 'Anzeige-Label nicht umgestellt: ' + out);
    assert.ok(!/EVs:/.test(out), 'Anzeige nennt noch "EVs:": ' + out);
  });

  it('Claude-Prompt-Metazeile: de "Statuswertpunkte:", en "Stat points:", nie "EVs:"', () => {
    const line = cutLine("(de ? 'Statuswertpunkte: '");
    function run(de) {
      const meta = [];
      // eslint-disable-next-line no-new-func
      const fn = new Function('meta', 'de', 'p', line);
      fn(meta, de, { evs: '32 Spe' });
      return meta[0];
    }
    assert.match(run(true), /^Statuswertpunkte: /, 'de-Prompt-Label falsch: ' + run(true));
    assert.match(run(false), /^Stat points: /, 'en-Prompt-Label falsch: ' + run(false));
    assert.ok(!/EVs:/.test(run(true)) && !/EVs:/.test(run(false)), 'Prompt nennt noch "EVs:"');
  });

  it('Showdown-Export bleibt "EVs:" und ist von der Import-Regex parsebar (Round-Trip)', () => {
    const line = cutLine('lines.push(`EVs:');
    const lines = [];
    // eslint-disable-next-line no-new-func
    const fn = new Function('lines', 'm', line);
    fn(lines, { evs: '2 HP / 32 Atk / 32 Spe' });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /^EVs: /, 'Export-Format nicht mehr "EVs:": ' + lines[0]);
    // Dieselbe Regex, die der Import benutzt (Z.1118): /^EVs:\s*(.+)$/i
    const importRe = /^EVs:\s*(.+)$/i;
    const parsed = lines[0].match(importRe);
    assert.ok(parsed, 'Export-Zeile nicht von der Import-Regex parsebar — Round-Trip gebrochen');
    assert.equal(parsed[1].trim(), '2 HP / 32 Atk / 32 Spe');
  });

  it('die Import-Regex im Code ist unveraendert "EVs:"', () => {
    // Beleg, dass der Round-Trip-Anker im Quelltext steht (Z.1118).
    assert.match(SRC, /match\(\/\^EVs:\\s\*\(\.\+\)\$\/i\)/, 'Import-Anker "^EVs:" fehlt');
  });
});
