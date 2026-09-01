/**
 * Audit 2, Gruppe B — F20: Das Anzeige-Label 'EVs:' auf den Team-Karten und im
 * Claude-Prompt meint die Champions-Statuswertpunkte (0–32, Budget 66) — dieselbe
 * Groesse, die der Matchups-Subtab korrekt 'Statuswertpunkte' nennt
 * (app-side-quest-matchups.js:80). Fix: die ANZEIGE-Labels vereinheitlicht auf
 * 'Statuswertpunkte:'. Die Showdown-Round-Trip-Zeilen (Export/Import/Placeholder)
 * BLEIBEN 'EVs:' — sonst bricht der Paste-Round-Trip. (Nachtrag 01.09.2026:
 * das Etikett ist auch in Showdowns Champions-Formaten 'EVs:', die Zahl
 * dahinter aber der Statuspunkt — deshalb wird nichts mehr umgerechnet.)
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

// buildEvsLine lebt in der IIFE von app-side-quest.js. Statt die Zeile zu
// schneiden (das ging nur, solange sie eine einzige war), wird die Funktion
// im Ganzen geschnitten und in einer Sandbox mit dem echten ChampionsSet
// ausgefuehrt — die Umrechnung wird also wirklich gefahren, nicht behauptet.
function ladeBuildEvsLine() {
  const vm = require('node:vm');
  const start = SRC.indexOf('function buildEvsLine(');
  assert.ok(start > -1, 'buildEvsLine nicht gefunden');
  const ende = SRC.indexOf('\n    }', start);
  const quelle = SRC.slice(start, ende + 6);
  const sandbox = { window: {}, module: {}, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'champions-set.js'), 'utf8'), sandbox);
  vm.runInContext(quelle + '\nglobalThis.__fn = buildEvsLine;', sandbox);
  return sandbox.__fn;
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
    // Das Etikett bleibt "EVs:" — so schreibt Showdown es selbst
    // (sim/teams.ts, exportSet), so liest sein Importer es, so liest
    // Limitless es, und so findet unsere Import-Regex den Wert wieder.
    // Die Zahl dahinter ist in einem Champions-Format der Statuspunkt.
    const fn = ladeBuildEvsLine();
    const roh = fn({ evs: '2 HP / 32 Atk / 32 Spe' });
    assert.match(roh, /^EVs: /, 'Export-Format nicht mehr "EVs:": ' + roh);
    // Dieselbe Regex, die der Import benutzt: /^EVs:\s*(.+)$/i
    const importRe = /^EVs:\s*(.+)$/i;
    const parsed = roh.match(importRe);
    assert.ok(parsed, 'Export-Zeile nicht von der Import-Regex parsebar — Round-Trip gebrochen');
    assert.equal(parsed[1].trim(), '2 HP / 32 Atk / 32 Spe');
  });

  it('beide Ziele bekommen die rohen Punkte', () => {
    /* DIESE ZUSICHERUNG STAND VOM 26.08. BIS ZUM 01.09.2026 AUF DEM KOPF.
       Sie verlangte, dass der Showdown-Zweig mal 8 rechnet — die Annahme
       war, Showdown lese Champions-Baue als gewoehnliche EVs.

       Der Betreiber hat das bezweifelt und hatte recht. Showdown hat
       eigene Champions-Formate, die selbst in Statuspunkten rechnen:
       sim/dex-formats.ts setzt evLimit = 66 fuer mod 'champions*',
       sim/team-validator.ts lehnt jeden Wert ueber 32 mit "has more than
       32 Stat Points" ab. Der umgerechnete Bau wurde dort also nicht
       falsch verstanden, sondern zurueckgewiesen.

       Der Schalter ist weg; buildEvsLine nimmt nur noch den Bau. Ein
       zweites Argument darf keine Wirkung mehr haben — sonst ist die
       Umrechnung durch die Hintertuer zurueck. */
    const fn = ladeBuildEvsLine();
    assert.equal(fn({ evs: '2 HP / 32 Atk / 32 Spe' }), 'EVs: 2 HP / 32 Atk / 32 Spe');
    assert.equal(fn({ evs: '2 HP / 32 Atk / 32 Spe' }, true), 'EVs: 2 HP / 32 Atk / 32 Spe',
      'ein zweites Argument schaltet wieder eine Umrechnung ein');
    assert.equal(fn({ evs: '' }), '', 'ohne Verteilung darf keine Zeile entstehen');
    // Und keine Zahl darf ueber Showdowns Deckel von 32 liegen.
    for (const m of fn({ evs: '2 HP / 32 Atk / 32 Spe' }).matchAll(/(\d+) /g)) {
      assert.ok(Number(m[1]) <= 32, `${m[1]} liegt ueber Showdowns Deckel von 32 Statuspunkten`);
    }
  });

  it('die Import-Regex im Code ist unveraendert "EVs:"', () => {
    // Beleg, dass der Round-Trip-Anker im Quelltext steht (Z.1118).
    assert.match(SRC, /match\(\/\^EVs:\\s\*\(\.\+\)\$\/i\)/, 'Import-Anker "^EVs:" fehlt');
  });
});
