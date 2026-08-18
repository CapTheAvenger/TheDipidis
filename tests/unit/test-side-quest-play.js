/**
 * Unit tests for the Side Quest "Play this team" pure helpers.
 *
 * Background — user-flagged 2026-06-14: during the 90-second team-
 * selection phase of a Pokémon Champions match, the decisive info
 * is the Speed ranking + type weaknesses of your six pokémon. The
 * Play panel renders that. These tests anchor:
 *
 *   - The Gen-9 Speed formula at Level 50
 *   - The Pokémon Champions 32-EV → mainline 252-EV scaling
 *   - Nature speed modifiers
 *   - The defensive type-effectiveness chart (gen 6+)
 *   - The "8 HP / 32 Spe"-style EV string parser
 *
 * Constants mirror js/app-side-quest-play.js — keep in lockstep.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Das Modul selbst, nicht eine Abschrift davon ──────────────────
// Bis zum 2026-08-18 stand in dieser Datei eine handgetippte Kopie
// jeder Funktion aus js/app-side-quest-play.js — samt der kompletten
// Typentabelle. Die Tests bewiesen damit, dass die Kopie sich verhaelt
// wie die Kopie. Als in der Tabelle drei Felder falsch waren, standen
// dieselben drei falschen Felder auch hier, und kein Test konnte das
// je finden.
//
// Jetzt wird die echte Datei geladen. Sie legt ihre reinen Helfer
// ohnehin schon auf window.sideQuestPlay ab; hier bekommt sie ein
// window/document-Attrappenpaar, weil sie im Browser laeuft.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC_PATH = path.join(ROOT, 'js', 'app-side-quest-play.js');
const SRC = fs.readFileSync(SRC_PATH, 'utf8');

// Geladen wird mit new Function statt mit vm: dann entstehen Arrays und
// Objekte in derselben Realm wie der Test, und deepStrictEqual
// vergleicht Inhalte statt Prototypen. window/document/fetch sind
// Parameter und verdecken damit die echten Globals im Modulcode.
function loadModule() {
    const noop = () => {};
    const el = () => ({
        style: {}, dataset: {}, innerHTML: '', textContent: '', value: '',
        classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        appendChild: noop, removeChild: noop, remove: noop, focus: noop,
        addEventListener: noop, removeEventListener: noop,
        setAttribute: noop, removeAttribute: noop, getAttribute: () => null,
        querySelector: () => null, querySelectorAll: () => [],
    });
    const win = {};
    const doc = {
        addEventListener: noop, removeEventListener: noop,
        getElementById: () => null, querySelector: () => null,
        querySelectorAll: () => [], createElement: el, body: el(),
        documentElement: el(),
    };
    // Kein Netz im Unit-Test. Wollte das Modul beim Laden etwas holen,
    // fiele es hier sofort auf — genau das soll es.
    const noFetch = () => Promise.reject(new Error('kein Netz im Unit-Test'));
    // eslint-disable-next-line no-new-func
    const factory = new Function('window', 'document', 'fetch', SRC);
    factory(win, doc, noFetch);
    return win;
}

const P = loadModule().sideQuestPlay;

const speedStat                     = P.speedStat;
const baseSpeedAt50                 = P.baseSpeedAt50;
const maxSpeedAt50                  = P.maxSpeedAt50;
const actualSpeedAt50               = P.actualSpeedAt50;
const natureSpeedMod                = P.natureSpeedMod;
const defensiveWeaknesses           = P.defensiveWeaknesses;
const parseEVs                      = P.parseEVs;
const aggregateLegalPool            = P.aggregateLegalPool;
const aggregateLegalPoolFromSamples = P.aggregateLegalPoolFromSamples;
const nextEmptyOppIndex             = P.nextEmptyOppIndex;
const buildTypicalSpeeds            = P.buildTypicalSpeeds;
const buildTypicalSpeedsFromSamples = P.buildTypicalSpeedsFromSamples;
const buildSpeedLadder              = P.buildSpeedLadder;
const speciesMatchesFilter          = P.speciesMatchesFilter;
const baseEnglish                   = P.baseEnglish;

// Die Typentabelle ist modulintern und wird nicht exportiert. Fuer den
// Abgleich gegen data/champions_type_chart.json wird sie aus dem
// Quelltext gelesen — nicht abgeschrieben.
function readTypeChartFromSource() {
    const m = SRC.match(/const TYPE_CHART = (\{[\s\S]*?\n {4}\});/);
    if (!m) throw new Error('TYPE_CHART nicht im Quelltext gefunden');
    // eslint-disable-next-line no-new-func
    return new Function('return ' + m[1])();
}
const TYPE_CHART = readTypeChartFromSource();
const ALL_TYPES = Object.keys(TYPE_CHART);

// Nicht exportiert: pickerSortedNames haengt im Panel am DOM-Rendering.
// Diese Nachbildung ist der letzte verbliebene Nachbau in dieser Datei
// und als solcher hier benannt.

function pickerSortedNames(opts) {
    const dex = opts.dex || {};
    const legalPool = opts.legalPool || new Set();
    const counts = opts.counts || new Map();
    const showAll = !!opts.showAll;
    const allDex = Object.keys(dex);
    const usingFull = showAll || !legalPool || legalPool.size === 0;
    const pool = usingFull ? allDex : allDex.filter(n => legalPool.has(n));
    pool.sort((a, b) => {
        const ua = counts.get(a) || 0;
        const ub = counts.get(b) || 0;
        if (ua !== ub) return ub - ua;
        return a.localeCompare(b);
    });
    return { names: pool, usingFull, dexSize: allDex.length };
}

// ── Speed formula anchors against well-known L50 numbers ──────────

describe('Speed formula — Gen 9 at Level 50', () => {
    // Garchomp base 102, max Speed (Jolly +nature, 31 IV, 252 EV) = 169.
    // This is the most-cited Speed benchmark in VGC literature, so any
    // formula drift trips it immediately.
    it('Garchomp Jolly max Speed = 169 (well-known VGC anchor)', () => {
        assert.strictEqual(maxSpeedAt50(102), 169);
    });

    // Dragapult base 142, Timid max = 213 (one of the fastest unboosted
    // VGC mons outside of Choice Scarf).
    it('Dragapult Timid max Speed = 213', () => {
        assert.strictEqual(maxSpeedAt50(142), 213);
    });

    // Talonflame base 126, Timid max = 195.
    it('Talonflame Timid max Speed = 195', () => {
        assert.strictEqual(maxSpeedAt50(126), 195);
    });

    // No investment, neutral nature. Garchomp uninvested = 122 — the
    // value you'd see on a freshly caught Garchomp at L50.
    it('Garchomp uninvested neutral = 122', () => {
        assert.strictEqual(baseSpeedAt50(102), 122);
    });

    // Slow tanks: Kingambit base 50, max Speed = 112 (Jolly +252)
    it('Kingambit Jolly max = 112', () => {
        assert.strictEqual(maxSpeedAt50(50), 112);
    });

    it('speedStat handles negative EV input by clamping to 0', () => {
        assert.strictEqual(speedStat(100, -50, 1.0), speedStat(100, 0, 1.0));
    });

    it('speedStat caps EV at 252', () => {
        // 256 = 32 (Champions) * 8 should clamp to 252 max.
        assert.strictEqual(speedStat(100, 256, 1.0), speedStat(100, 252, 1.0));
    });
});

// ── Champions 32-EV scale → mainline 252-EV mapping ───────────────

describe('Pokémon Champions EV scaling (×8)', () => {
    it('full Champions Speed investment (32 EVs, Jolly) matches max', () => {
        // Garchomp w/ 32 Champions Speed EVs at Jolly should match
        // mainline 252 Jolly = 169. That's the whole point of the scale.
        assert.strictEqual(actualSpeedAt50(102, 32, 1.1), 169);
    });

    it('zero EVs, neutral nature = base L50 stat', () => {
        assert.strictEqual(actualSpeedAt50(102, 0, 1.0), 122);
    });

    it('zero EVs, +nature still applies the 10 % bump', () => {
        // 122 * 1.1 = 134.2 → floor → 134.
        assert.strictEqual(actualSpeedAt50(102, 0, 1.1), 134);
    });

    it('half investment (16 EVs ≈ 128 mainline) is monotonically between base and max', () => {
        const lo = actualSpeedAt50(102, 0, 1.1);
        const mid = actualSpeedAt50(102, 16, 1.1);
        const hi = actualSpeedAt50(102, 32, 1.1);
        assert.ok(lo < mid && mid < hi,
            `expected monotone, got ${lo} < ${mid} < ${hi}`);
    });
});

// ── Nature lookup ─────────────────────────────────────────────────

describe('natureSpeedMod', () => {
    it('+Speed natures return 1.1', () => {
        ['Hasty', 'Jolly', 'Naive', 'Timid'].forEach(n => {
            assert.strictEqual(natureSpeedMod(n), 1.1, `${n} should be +Spe`);
        });
    });
    it('-Speed natures return 0.9', () => {
        ['Brave', 'Quiet', 'Relaxed', 'Sassy'].forEach(n => {
            assert.strictEqual(natureSpeedMod(n), 0.9, `${n} should be -Spe`);
        });
    });
    it('neutral / unknown natures return 1.0', () => {
        ['Adamant', 'Modest', 'Bold', 'Calm', 'Hardy', '', null, undefined, 'Garbage'].forEach(n => {
            assert.strictEqual(natureSpeedMod(n), 1.0, `${n} should be neutral`);
        });
    });
});

// ── Defensive type effectiveness ──────────────────────────────────

describe('defensiveWeaknesses — gen 6+ type chart', () => {
    it('Fire/Flying (Talonflame/Charizard) → Electric ×2, Rock ×4, Water ×2', () => {
        const w = defensiveWeaknesses(['Fire', 'Flying']);
        const byType = Object.fromEntries(w.map(x => [x.type, x.mult]));
        assert.strictEqual(byType.Rock, 4, 'Stealth Rock fear is real');
        assert.strictEqual(byType.Electric, 2);
        assert.strictEqual(byType.Water, 2);
        assert.ok(!('Grass' in byType), 'Fire resists Grass');
    });

    it('Dragon/Ground (Garchomp) → Ice ×4, Dragon ×2, Fairy ×2', () => {
        const w = defensiveWeaknesses(['Dragon', 'Ground']);
        const byType = Object.fromEntries(w.map(x => [x.type, x.mult]));
        assert.strictEqual(byType.Ice, 4);
        assert.strictEqual(byType.Dragon, 2);
        assert.strictEqual(byType.Fairy, 2);
        // Garchomp is immune to Electric (Ground), not weak — should not appear.
        assert.ok(!('Electric' in byType));
    });

    it('Steel/Fairy (Magearna/Ninetales-Alola style) → Fire ×2, Ground ×2', () => {
        // Ninetales-Alola is Ice/Fairy, not Steel/Fairy — but the
        // dual-type math is what matters. Use Steel/Fairy here for the
        // ×2/×0 cancellation check (Dragon hits Fairy ×0).
        const w = defensiveWeaknesses(['Steel', 'Fairy']);
        const byType = Object.fromEntries(w.map(x => [x.type, x.mult]));
        assert.strictEqual(byType.Fire, 2);
        assert.strictEqual(byType.Ground, 2);
        assert.ok(!('Dragon' in byType), 'Fairy immunity to Dragon must hold');
    });

    it('Normal/Ghost is impossible — but Ghost-mono → 2 weaknesses', () => {
        const w = defensiveWeaknesses(['Ghost']);
        const byType = Object.fromEntries(w.map(x => [x.type, x.mult]));
        assert.strictEqual(byType.Ghost, 2);
        assert.strictEqual(byType.Dark, 2);
    });

    it('returns 4× weaknesses BEFORE 2× weaknesses (sort key)', () => {
        const w = defensiveWeaknesses(['Grass', 'Psychic']);  // ≈ Exeggutor
        // Should include Bug ×4 (Grass takes Bug ×2 * Psychic takes Bug ×2).
        assert.strictEqual(w[0].type, 'Bug');
        assert.strictEqual(w[0].mult, 4);
    });

    it('empty / null input returns []', () => {
        assert.deepStrictEqual(defensiveWeaknesses([]), []);
        assert.deepStrictEqual(defensiveWeaknesses(null), []);
    });

    it('no weakness reported for ×1 matchups', () => {
        const w = defensiveWeaknesses(['Normal']);  // Snorlax-shape — only Fighting hurts.
        const byType = Object.fromEntries(w.map(x => [x.type, x.mult]));
        assert.strictEqual(byType.Fighting, 2);
        assert.ok(!('Normal' in byType), 'Normal vs Normal is ×1 → not in weakness list');
    });
});

// ── EV string parser ──────────────────────────────────────────────

describe('parseEVs', () => {
    it('parses the canonical pokepaste shape', () => {
        const ev = parseEVs('8 HP / 1 Def / 25 SpA / 32 Spe');
        assert.deepStrictEqual(ev, { hp: 8, atk: 0, def: 1, spa: 25, spd: 0, spe: 32 });
    });

    it('handles full 6-stat spread', () => {
        const ev = parseEVs('1 HP / 2 Atk / 3 Def / 4 SpA / 5 SpD / 6 Spe');
        assert.deepStrictEqual(ev, { hp: 1, atk: 2, def: 3, spa: 4, spd: 5, spe: 6 });
    });

    it('tolerates extra whitespace around the separator', () => {
        const ev = parseEVs('32 HP  /  32 Atk  /  32 Spe');
        assert.strictEqual(ev.hp, 32);
        assert.strictEqual(ev.atk, 32);
        assert.strictEqual(ev.spe, 32);
    });

    it('blank / missing returns all-zero', () => {
        assert.deepStrictEqual(parseEVs(''),  { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
        assert.deepStrictEqual(parseEVs(null), { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
    });

    it('garbage segments are silently dropped, valid ones kept', () => {
        const ev = parseEVs('not an ev / 32 Spe / also garbage');
        assert.strictEqual(ev.spe, 32);
        assert.strictEqual(ev.hp, 0);
    });
});

// ── Real-team smoke: Talonflame the user's screenshot ─────────────

describe('integration: Talonflame example from user screenshot', () => {
    // EVs "2 HP / 32 Atk / 32 Spe", Jolly, base Spe = 126.
    it('Talonflame with 32 Champions Spe + Jolly hits the mainline 252 Jolly max (195)', () => {
        const ev = parseEVs('2 HP / 32 Atk / 32 Spe');
        const mod = natureSpeedMod('Jolly');
        assert.strictEqual(actualSpeedAt50(126, ev.spe, mod), 195);
    });

    it('Talonflame with Tailwind doubles the actual Speed (390)', () => {
        const ev = parseEVs('2 HP / 32 Atk / 32 Spe');
        const actual = actualSpeedAt50(126, ev.spe, natureSpeedMod('Jolly'));
        assert.strictEqual(actual * 2, 390);
    });

    it('Talonflame is weak to Electric/Water/Rock (Stealth Rock = ×4)', () => {
        const w = defensiveWeaknesses(['Fire', 'Flying']);
        const byType = Object.fromEntries(w.map(x => [x.type, x.mult]));
        assert.strictEqual(byType.Rock, 4);
        assert.strictEqual(byType.Electric, 2);
        assert.strictEqual(byType.Water, 2);
    });
});

// ── Picker pool / usage sort (user-flagged restriction) ────────────

describe('aggregateLegalPool — derive format pool from top teams', () => {
    it('collects every species across teams and counts occurrences', () => {
        const teams = [
            { pokemon: [ { name: 'Garchomp' }, { name: 'Kingambit' }, { name: 'Talonflame' } ] },
            { pokemon: [ { name: 'Garchomp' }, { name: 'Whimsicott' } ] },
            { pokemon: [ { name: 'Kingambit' }, { name: 'Garchomp' } ] },
        ];
        const { pool, counts } = aggregateLegalPool(teams);
        assert.strictEqual(pool.size, 4);
        assert.ok(pool.has('Garchomp'));
        assert.ok(pool.has('Talonflame'));
        assert.strictEqual(counts.get('Garchomp'), 3);
        assert.strictEqual(counts.get('Kingambit'), 2);
        assert.strictEqual(counts.get('Talonflame'), 1);
        assert.strictEqual(counts.get('Whimsicott'), 1);
    });

    it('ignores blank / missing names', () => {
        const teams = [
            { pokemon: [ { name: 'Garchomp' }, { name: '' }, { name: null }, {} ] },
        ];
        const { pool } = aggregateLegalPool(teams);
        assert.strictEqual(pool.size, 1);
    });

    it('empty / null teams return empty pool', () => {
        assert.strictEqual(aggregateLegalPool([]).pool.size, 0);
        assert.strictEqual(aggregateLegalPool(null).pool.size, 0);
    });
});

describe('pickerSortedNames — format-pool filter + usage sort', () => {
    // Simulate a dex with 5 species, 3 of which are "legal".
    const dex = {
        'Abomasnow': true, 'Abra': true,            // not in pool — should be hidden
        'Garchomp': true, 'Kingambit': true, 'Talonflame': true,
    };
    const legalPool = new Set(['Garchomp', 'Kingambit', 'Talonflame']);
    const counts = new Map([['Garchomp', 12], ['Kingambit', 5], ['Talonflame', 1]]);

    it('defaults to legal-pool only (hides non-pool species)', () => {
        const { names, usingFull } = pickerSortedNames({ dex, legalPool, counts });
        assert.strictEqual(usingFull, false);
        assert.deepStrictEqual(names, ['Garchomp', 'Kingambit', 'Talonflame']);
        assert.ok(!names.includes('Abra'));
        assert.ok(!names.includes('Abomasnow'));
    });

    it('sorts by usage DESC — most-played first', () => {
        const { names } = pickerSortedNames({ dex, legalPool, counts });
        assert.strictEqual(names[0], 'Garchomp');   // 12×
        assert.strictEqual(names[1], 'Kingambit');  // 5×
        assert.strictEqual(names[2], 'Talonflame'); // 1×
    });

    it('alphabetical tiebreak when usage counts match', () => {
        const tied = new Map([['Garchomp', 3], ['Kingambit', 3], ['Talonflame', 3]]);
        const { names } = pickerSortedNames({ dex, legalPool, counts: tied });
        assert.deepStrictEqual(names, ['Garchomp', 'Kingambit', 'Talonflame']);
    });

    it('showAll toggle widens to the full pokedex (and resorts)', () => {
        const { names, usingFull } = pickerSortedNames({ dex, legalPool, counts, showAll: true });
        assert.strictEqual(usingFull, true);
        // Garchomp (12×) leads; the two unused mons (Abomasnow / Abra)
        // sort alphabetically among the 0-count tail.
        assert.strictEqual(names[0], 'Garchomp');
        assert.strictEqual(names[1], 'Kingambit');
        assert.strictEqual(names[2], 'Talonflame');
        assert.deepStrictEqual(names.slice(3), ['Abomasnow', 'Abra']);
    });

    it('empty legal pool falls back to the full dex (graceful when load failed)', () => {
        const { names, usingFull } = pickerSortedNames({ dex, legalPool: new Set(), counts: new Map() });
        assert.strictEqual(usingFull, true);
        // Everything alphabetical because all usage counts are 0.
        assert.deepStrictEqual(names, ['Abomasnow', 'Abra', 'Garchomp', 'Kingambit', 'Talonflame']);
    });

    it('dexSize reports the full dex size regardless of filter mode', () => {
        assert.strictEqual(pickerSortedNames({ dex, legalPool, counts }).dexSize, 5);
        assert.strictEqual(pickerSortedNames({ dex, legalPool, counts, showAll: true }).dexSize, 5);
    });

    it('species in legalPool that are NOT in the dex are silently dropped', () => {
        const phantomPool = new Set(['Garchomp', 'GhostMon-NotInDex']);
        const { names } = pickerSortedNames({ dex, legalPool: phantomPool, counts });
        assert.deepStrictEqual(names, ['Garchomp']);
    });
});

// ── nextEmptyOppIndex + fill-mode loop (rapid-pick) ──────────────
// User-flagged 2026-06-15: per-slot tapping wastes the time you don't
// have during the 90-second team-selection window. The "Quick-pick
// all 6" button keeps the picker open and lands each tap in the
// next empty slot. Auto-close fires when 6/6 are filled.

// nextEmptyOppIndex kommt aus dem Modul (siehe Kopf der Datei).

describe('nextEmptyOppIndex — fill-mode next-slot resolver', () => {
    it('returns 0 for a fresh team', () => {
        assert.strictEqual(nextEmptyOppIndex([null, null, null, null, null, null]), 0);
    });

    it('skips already-filled slots and picks the first empty one', () => {
        assert.strictEqual(
            nextEmptyOppIndex([{name:'A'}, {name:'B'}, null, null, null, null]),
            2,
        );
    });

    it('returns -1 when all 6 are filled (signal: auto-close picker)', () => {
        const full = [{name:'A'},{name:'B'},{name:'C'},{name:'D'},{name:'E'},{name:'F'}];
        assert.strictEqual(nextEmptyOppIndex(full), -1);
    });

    it('handles holes in the middle by picking the lowest empty index', () => {
        // Slot 3 cleared by user mid-flow → next pick fills it before
        // moving on, not slot 5.
        assert.strictEqual(
            nextEmptyOppIndex([{name:'A'}, {name:'B'}, null, {name:'D'}, null, null]),
            2,
        );
    });

    it('non-array / null input returns -1 (caller treats as "no slot")', () => {
        assert.strictEqual(nextEmptyOppIndex(null), -1);
        assert.strictEqual(nextEmptyOppIndex(undefined), -1);
        assert.strictEqual(nextEmptyOppIndex({}), -1);
    });
});

describe('fill-mode loop — sequential picks land in order', () => {
    // Replays what happens inside the production overlay's pick handler
    // without DOM: each picked mon lands at nextEmptyOppIndex, picker
    // stays open until that returns -1.
    function runFillSequence(picks) {
        const opp = [null, null, null, null, null, null];
        let closed = false;
        for (const mon of picks) {
            if (closed) break;
            const idx = nextEmptyOppIndex(opp);
            if (idx === -1) { closed = true; break; }
            opp[idx] = mon;
            if (nextEmptyOppIndex(opp) === -1) closed = true;
        }
        return { opp, closed };
    }

    it('lands 6 picks in order 0..5 and triggers auto-close', () => {
        const { opp, closed } = runFillSequence([
            {name:'Garchomp'}, {name:'Kingambit'}, {name:'Talonflame'},
            {name:'Charizard'}, {name:'Whimsicott'}, {name:'Incineroar'},
        ]);
        assert.deepStrictEqual(opp.map(m => m.name),
            ['Garchomp', 'Kingambit', 'Talonflame', 'Charizard', 'Whimsicott', 'Incineroar']);
        assert.strictEqual(closed, true);
    });

    it('stays open at 3/6 (no auto-close until the team is full)', () => {
        const { opp, closed } = runFillSequence([
            {name:'A'}, {name:'B'}, {name:'C'},
        ]);
        assert.strictEqual(closed, false);
        assert.strictEqual(opp.filter(Boolean).length, 3);
        assert.strictEqual(nextEmptyOppIndex(opp), 3);
    });

    it('ignores extra picks beyond the 6th (no overflow into nowhere)', () => {
        const { opp, closed } = runFillSequence(
            'ABCDEFGH'.split('').map(n => ({ name: n })),
        );
        assert.strictEqual(opp.length, 6);
        assert.strictEqual(closed, true);
        assert.deepStrictEqual(opp.map(m => m.name).join(''), 'ABCDEF');
    });
});

// ── buildTypicalSpeeds + buildSpeedLadder (mode + ladder sort) ────
// User-flagged 2026-06-15: opponent slots showed base–max range
// (122–169 for Garchomp) but the actually useful number is the
// most-played spread's resulting Speed (typically 169 — every top
// Garchomp runs 32 Spe Jolly). The ladder sorts both teams by
// effective Speed so the at-a-glance "who's faster" answer is
// always one screen.

// buildTypicalSpeeds und buildSpeedLadder kommen aus dem Modul.

const GARCHOMP_SPEC = { baseStats: { spe: 102 }, types: ['Dragon', 'Ground'] };
const TALONFLAME_SPEC = { baseStats: { spe: 126 }, types: ['Fire', 'Flying'] };
const KINGAMBIT_SPEC = { baseStats: { spe: 50 }, types: ['Dark', 'Steel'] };

describe('buildTypicalSpeeds — mode-spread per species', () => {
    it('picks the most-frequent (Spe EV, nature) combo', () => {
        const teams = [
            { pokemon: [{ name: 'Garchomp', evs: '32 Atk / 32 Spe', nature: 'Jolly' }] },
            { pokemon: [{ name: 'Garchomp', evs: '32 Atk / 32 Spe', nature: 'Jolly' }] },
            { pokemon: [{ name: 'Garchomp', evs: '32 Atk',          nature: 'Adamant' }] },
        ];
        const lookupSpec = (n) => n === 'Garchomp' ? GARCHOMP_SPEC : null;
        const out = buildTypicalSpeeds(teams, lookupSpec);
        assert.strictEqual(out.Garchomp.evMode, 32);
        assert.strictEqual(out.Garchomp.natureMode, 'Jolly');
        assert.strictEqual(out.Garchomp.typicalSpeed, 169);
        assert.strictEqual(out.Garchomp.sampleSize, 3);
        // Mode share = 2/3 → 0.66
        assert.ok(Math.abs(out.Garchomp.modeShare - (2/3)) < 0.01);
    });

    it('ties broken by highest resulting Speed (speed-creep wins)', () => {
        const teams = [
            { pokemon: [{ name: 'Garchomp', evs: '32 Spe',  nature: 'Jolly'   }] },  // 169
            { pokemon: [{ name: 'Garchomp', evs: '24 Spe',  nature: 'Adamant' }] },  // lower
        ];
        const out = buildTypicalSpeeds(teams, () => GARCHOMP_SPEC);
        // Both unique → tie at count=1 → faster spread wins.
        assert.strictEqual(out.Garchomp.typicalSpeed, 169);
        assert.strictEqual(out.Garchomp.natureMode, 'Jolly');
    });

    it('single instance: typical = that single Speed', () => {
        const teams = [
            { pokemon: [{ name: 'Kingambit', evs: '32 HP / 32 Atk / 1 Spe', nature: 'Adamant' }] },
        ];
        const out = buildTypicalSpeeds(teams, () => KINGAMBIT_SPEC);
        // 1 Champions Spe EV = 8 mainline = floor(8/4) = 2 bonus. Almost uninvested.
        const baseSpe = 50;
        const expected = Math.floor((Math.floor((2 * baseSpe + 31 + 2) * 50 / 100 + 5)) * 1.0);
        assert.strictEqual(out.Kingambit.typicalSpeed, expected);
        assert.strictEqual(out.Kingambit.sampleSize, 1);
    });

    it('skips species not in the dex', () => {
        const teams = [{ pokemon: [{ name: 'GhostMon', evs: '32 Spe', nature: 'Jolly' }] }];
        const out = buildTypicalSpeeds(teams, () => null);
        assert.strictEqual(Object.keys(out).length, 0);
    });
});

describe('buildSpeedLadder — both teams ranked DESC by effective Speed', () => {
    const lookupSpec = (n) => ({
        Garchomp:   GARCHOMP_SPEC,
        Talonflame: TALONFLAME_SPEC,
        Kingambit:  KINGAMBIT_SPEC,
    })[n] || null;

    it('your-team mons use actual Speed; sorted DESC', () => {
        const team = { pokemon: [
            { name: 'Garchomp',   evs: '32 Spe', nature: 'Jolly' },   // 169
            { name: 'Kingambit',  evs: '1 Spe',  nature: 'Adamant' }, // ~67
            { name: 'Talonflame', evs: '32 Spe', nature: 'Jolly' },   // 195 (Jolly base 126)
        ]};
        const rows = buildSpeedLadder(team, [], lookupSpec, null);
        assert.deepStrictEqual(rows.map(r => r.name), ['Talonflame', 'Garchomp', 'Kingambit']);
        assert.ok(rows.every(r => r.side === 'Y'));
    });

    it('opponent uses typical when available, base as fallback', () => {
        const team = { pokemon: [] };
        const opp = [{ name: 'Garchomp' }, { name: 'Kingambit' }];
        const typ = { Garchomp: { typicalSpeed: 169, evMode: 32, natureMode: 'Jolly', sampleSize: 5 } };
        const rows = buildSpeedLadder(team, opp, lookupSpec, typ);
        const garchompRow = rows.find(r => r.name === 'Garchomp');
        const kingambitRow = rows.find(r => r.name === 'Kingambit');
        assert.strictEqual(garchompRow.source, 'typical');
        assert.strictEqual(garchompRow.speed, 169);
        assert.strictEqual(kingambitRow.source, 'base');
        // Base Kingambit at L50 with 0 EVs neutral: 2*50+31 = 131; *50/100=65; +5=70.
        assert.strictEqual(kingambitRow.speed, 70);
    });

    it('combined ladder interleaves yours and opponent by Speed', () => {
        const team = { pokemon: [
            { name: 'Talonflame', evs: '32 Spe', nature: 'Jolly' },   // Y, 195
            { name: 'Kingambit',  evs: '0 Spe',  nature: 'Adamant' }, // Y, slow
        ]};
        const opp = [{ name: 'Garchomp' }, { name: 'Talonflame' }];
        const typ = {
            Garchomp:   { typicalSpeed: 169, evMode: 32, natureMode: 'Jolly', sampleSize: 5 },
            Talonflame: { typicalSpeed: 195, evMode: 32, natureMode: 'Jolly', sampleSize: 3 },
        };
        const rows = buildSpeedLadder(team, opp, lookupSpec, typ);
        // Talonflame(Y) and Talonflame(O) tie at 195 — yours wins tiebreak.
        assert.strictEqual(rows[0].name, 'Talonflame');
        assert.strictEqual(rows[0].side, 'Y');
        assert.strictEqual(rows[1].name, 'Talonflame');
        assert.strictEqual(rows[1].side, 'O');
        // Then Garchomp(O) at 169.
        assert.strictEqual(rows[2].name, 'Garchomp');
        assert.strictEqual(rows[2].side, 'O');
        // Slowest is your Kingambit.
        assert.strictEqual(rows[rows.length - 1].name, 'Kingambit');
    });

    it('empty teams returns empty ladder (no crash)', () => {
        assert.deepStrictEqual(buildSpeedLadder({ pokemon: [] }, [], lookupSpec, null), []);
        assert.deepStrictEqual(buildSpeedLadder(null, null, lookupSpec, null), []);
    });

    it('opponent slots with null entries (unfilled) are skipped', () => {
        const team = { pokemon: [] };
        const opp = [null, { name: 'Garchomp' }, null];
        const typ = { Garchomp: { typicalSpeed: 169, evMode: 32, natureMode: 'Jolly', sampleSize: 5 } };
        const rows = buildSpeedLadder(team, opp, lookupSpec, typ);
        assert.strictEqual(rows.length, 1);
        assert.strictEqual(rows[0].name, 'Garchomp');
    });

    it('tailwind = 2 × effective Speed (every row)', () => {
        const team = { pokemon: [{ name: 'Talonflame', evs: '32 Spe', nature: 'Jolly' }] };
        const rows = buildSpeedLadder(team, [], lookupSpec, null);
        assert.strictEqual(rows[0].speed * 2, rows[0].tailwind);
    });
});

// ── Ladder range column (added 2026-06-15 per user ask) ───────────
// Every row carries base–max alongside the actual/typical speed so
// the user sees the floor and ceiling at a glance, not just the
// most-likely value.

describe('buildSpeedLadder — base–max range column', () => {
    const lookupSpec = (n) => ({
        Garchomp:   GARCHOMP_SPEC,    // base 102 → range 122–169
        Talonflame: TALONFLAME_SPEC,  // base 126 → range 146–195
        Kingambit:  KINGAMBIT_SPEC,   // base  50 → range  70–112
    })[n] || null;

    it('your-team row carries rangeMin and rangeMax for the species', () => {
        const team = { pokemon: [{ name: 'Garchomp', evs: '32 Spe', nature: 'Jolly' }] };
        const rows = buildSpeedLadder(team, [], lookupSpec, null);
        assert.strictEqual(rows[0].rangeMin, 122);
        assert.strictEqual(rows[0].rangeMax, 169);
    });

    it('opponent typical row carries rangeMin and rangeMax', () => {
        const typ = { Garchomp: { typicalSpeed: 169, evMode: 32, natureMode: 'Jolly', sampleSize: 5 } };
        const rows = buildSpeedLadder({ pokemon: [] }, [{ name: 'Garchomp' }], lookupSpec, typ);
        assert.strictEqual(rows[0].rangeMin, 122);
        assert.strictEqual(rows[0].rangeMax, 169);
        // Typical speed should equal the species max in this case.
        assert.strictEqual(rows[0].speed, 169);
    });

    it('opponent base-fallback row still carries the full range', () => {
        // Talonflame not in typical map → falls back to base, but
        // the user still sees 146–195 as the possible range.
        const rows = buildSpeedLadder({ pokemon: [] }, [{ name: 'Talonflame' }], lookupSpec, {});
        assert.strictEqual(rows[0].source, 'base');
        assert.strictEqual(rows[0].rangeMin, 146);
        assert.strictEqual(rows[0].rangeMax, 195);
        // Speed itself sits at rangeMin in fallback mode.
        assert.strictEqual(rows[0].speed, 146);
    });

    it('ladder rows preserve range across the DESC sort', () => {
        const team = { pokemon: [{ name: 'Kingambit', evs: '0 Spe', nature: 'Adamant' }] };
        const opp = [{ name: 'Talonflame' }];
        const typ = { Talonflame: { typicalSpeed: 195, evMode: 32, natureMode: 'Jolly', sampleSize: 3 } };
        const rows = buildSpeedLadder(team, opp, lookupSpec, typ);
        // Talonflame leads at 195 with its own range.
        assert.strictEqual(rows[0].name, 'Talonflame');
        assert.strictEqual(rows[0].rangeMin, 146);
        assert.strictEqual(rows[0].rangeMax, 195);
        // Kingambit at the bottom keeps its 70-112 range.
        assert.strictEqual(rows[1].name, 'Kingambit');
        assert.strictEqual(rows[1].rangeMin, 70);
        assert.strictEqual(rows[1].rangeMax, 112);
    });
});

// ── buildTypicalSpeedsFromSamples (new corpus shape) ──────────────
// User-flagged 2026-06-15: top-20 teams was too narrow per species.
// The scraper now writes a 14-day samples corpus (~500-600 rows
// across ~40 species). Same mode logic, but the input is a flat
// list of {species, evs, nature} rather than nested team records.

// buildTypicalSpeedsFromSamples kommt aus dem Modul.

describe('buildTypicalSpeedsFromSamples — corpus-driven mode', () => {
    const lookupSpec = (n) => ({
        Garchomp: GARCHOMP_SPEC, Talonflame: TALONFLAME_SPEC, Kingambit: KINGAMBIT_SPEC,
    })[n] || null;

    it('picks the mode spread out of a flat samples list', () => {
        const samples = [
            { species: 'Garchomp', evs: '32 Spe', nature: 'Jolly' },
            { species: 'Garchomp', evs: '32 Spe', nature: 'Jolly' },
            { species: 'Garchomp', evs: '32 Spe', nature: 'Jolly' },
            { species: 'Garchomp', evs: '24 Spe', nature: 'Adamant' },
            { species: 'Garchomp', evs: '24 Spe', nature: 'Adamant' },
            // sample noise across other species shouldn't bleed in
            { species: 'Talonflame', evs: '32 Spe', nature: 'Jolly' },
        ];
        const out = buildTypicalSpeedsFromSamples(samples, lookupSpec);
        assert.strictEqual(out.Garchomp.evMode, 32);
        assert.strictEqual(out.Garchomp.natureMode, 'Jolly');
        assert.strictEqual(out.Garchomp.typicalSpeed, 169);
        assert.strictEqual(out.Garchomp.sampleSize, 5);
        // Mode share = 3/5 → 0.6
        assert.ok(Math.abs(out.Garchomp.modeShare - 0.6) < 0.01);
        // Talonflame computed independently
        assert.strictEqual(out.Talonflame.typicalSpeed, 195);
    });

    it('larger sample size sharpens the modeShare confidence', () => {
        // 10 samples, 7 of them the same spread → modeShare 0.7
        const samples = [];
        for (let i = 0; i < 7; i++) samples.push({ species: 'Garchomp', evs: '32 Spe', nature: 'Jolly' });
        for (let i = 0; i < 3; i++) samples.push({ species: 'Garchomp', evs: '20 Spe', nature: 'Adamant' });
        const out = buildTypicalSpeedsFromSamples(samples, lookupSpec);
        assert.strictEqual(out.Garchomp.sampleSize, 10);
        assert.ok(Math.abs(out.Garchomp.modeShare - 0.7) < 0.01);
        // Mode is still 32 Spe Jolly
        assert.strictEqual(out.Garchomp.typicalSpeed, 169);
    });

    it('empty / null samples returns {}', () => {
        assert.deepStrictEqual(buildTypicalSpeedsFromSamples([], lookupSpec), {});
        assert.deepStrictEqual(buildTypicalSpeedsFromSamples(null, lookupSpec), {});
    });

    it('species not in dex are skipped', () => {
        const samples = [{ species: 'GhostMon', evs: '32 Spe', nature: 'Jolly' }];
        const out = buildTypicalSpeedsFromSamples(samples, () => null);
        assert.strictEqual(Object.keys(out).length, 0);
    });

    it('per-sample nature missing → treated as neutral (no crash)', () => {
        const samples = [
            { species: 'Garchomp', evs: '32 Spe', nature: '' },
            { species: 'Garchomp', evs: '32 Spe' },  // no nature key at all
        ];
        const out = buildTypicalSpeedsFromSamples(samples, lookupSpec);
        // Both samples collapse to one mode (32 Spe, neutral).
        assert.strictEqual(out.Garchomp.sampleSize, 2);
        assert.strictEqual(out.Garchomp.natureMode, '');
    });
});

// ── DE-name + type filter (user-asked 2026-06-15) ─────────────────
// "Pokémon Suche … nach deutschem Namen … nach Typen suchen, weil
// wenn ich Eis tippe, dann werden alle Eis-Mons aufgelistet."

// baseEnglish und speciesMatchesFilter kommen aus dem Modul; die
// deutschen Typnamen liegen dort neben der Funktion, die sie nutzt.

describe('speciesMatchesFilter — German name + type search', () => {
    const dex = {
        'Garchomp':         { types: ['Dragon', 'Ground'] },
        'Garchomp-Mega':    { types: ['Dragon', 'Ground'] },
        'Ninetales':        { types: ['Fire'] },
        'Ninetales-Alola':  { types: ['Ice', 'Fairy'] },
        'Talonflame':       { types: ['Fire', 'Flying'] },
        'Vanilluxe':        { types: ['Ice'] },
        'Beartic':          { types: ['Ice'] },
        'Kingambit':        { types: ['Dark', 'Steel'] },
    };
    const namesDe = {
        Garchomp:   'Knakrack',
        Ninetales:  'Vulnona',
        Talonflame: 'Fiaro',
        Vanilluxe:  'Vaniluxe',
        Beartic:    'Polar',
        Kingambit:  'Gladimperio',
    };

    it('English Showdown name still matches (existing behaviour)', () => {
        assert.ok(speciesMatchesFilter('Garchomp', 'garch', dex, namesDe));
        assert.ok(!speciesMatchesFilter('Garchomp', 'zzz', dex, namesDe));
    });

    it('German base-species name finds the EN entry', () => {
        // "knakrack" → Garchomp AND Garchomp-Mega (same base species)
        assert.ok(speciesMatchesFilter('Garchomp',      'knakrack', dex, namesDe));
        assert.ok(speciesMatchesFilter('Garchomp-Mega', 'knakrack', dex, namesDe));
        assert.ok(!speciesMatchesFilter('Kingambit',    'knakrack', dex, namesDe));
    });

    it('Partial DE name still matches (substring rule)', () => {
        // User types "vul" → Vulnona base → matches Ninetales + Alola form
        assert.ok(speciesMatchesFilter('Ninetales',       'vul', dex, namesDe));
        assert.ok(speciesMatchesFilter('Ninetales-Alola', 'vul', dex, namesDe));
    });

    it('German type "Eis" surfaces every Ice-type Pokémon', () => {
        // The headline user example. "Eis" must hit Ice-type even when
        // the Showdown name has no "eis" substring.
        assert.ok(speciesMatchesFilter('Vanilluxe',       'eis', dex, namesDe));
        assert.ok(speciesMatchesFilter('Beartic',         'eis', dex, namesDe));
        assert.ok(speciesMatchesFilter('Ninetales-Alola', 'eis', dex, namesDe));
        // Garchomp is Dragon/Ground — must NOT match Eis
        assert.ok(!speciesMatchesFilter('Garchomp', 'eis', dex, namesDe));
    });

    it('English type "ice" matches the same set', () => {
        assert.ok(speciesMatchesFilter('Vanilluxe',       'ice', dex, namesDe));
        assert.ok(speciesMatchesFilter('Beartic',         'ice', dex, namesDe));
        assert.ok(speciesMatchesFilter('Ninetales-Alola', 'ice', dex, namesDe));
    });

    it('Type "Drache" finds Dragon-types', () => {
        assert.ok(speciesMatchesFilter('Garchomp',      'drache', dex, namesDe));
        assert.ok(speciesMatchesFilter('Garchomp-Mega', 'drache', dex, namesDe));
        assert.ok(!speciesMatchesFilter('Talonflame',   'drache', dex, namesDe));
    });

    it('Type "Stahl" finds Steel-types', () => {
        assert.ok(speciesMatchesFilter('Kingambit', 'stahl', dex, namesDe));
    });

    it('Type "Feuer" finds Fire-types including the base Ninetales (Kanto)', () => {
        assert.ok(speciesMatchesFilter('Ninetales',  'feuer', dex, namesDe));
        assert.ok(speciesMatchesFilter('Talonflame', 'feuer', dex, namesDe));
        // Ninetales-Alola is Ice/Fairy now — must NOT match Feuer
        assert.ok(!speciesMatchesFilter('Ninetales-Alola', 'feuer', dex, namesDe));
    });

    it('Empty filter matches everything', () => {
        assert.ok(speciesMatchesFilter('Garchomp', '', dex, namesDe));
        assert.ok(speciesMatchesFilter('Anything', null, dex, namesDe));
    });

    it('Works without the namesDe map (graceful fallback)', () => {
        // Before names_de.json finishes loading, filter still works on
        // English + type (English) — no crash, just narrower hits.
        assert.ok(speciesMatchesFilter('Garchomp', 'garch', dex, null));
        assert.ok(speciesMatchesFilter('Beartic',  'ice',   dex, null));
        assert.ok(!speciesMatchesFilter('Garchomp', 'knakrack', dex, null));
    });

    it('baseEnglish strips form suffixes for the DE lookup', () => {
        assert.strictEqual(baseEnglish('Garchomp-Mega'), 'Garchomp');
        assert.strictEqual(baseEnglish('Ninetales-Alola'), 'Ninetales');
        assert.strictEqual(baseEnglish('Charizard-Mega-Y'), 'Charizard');
        assert.strictEqual(baseEnglish('Garchomp'), 'Garchomp');
    });
});

// ── aggregateLegalPoolFromSamples (broader picker pool) ───────────
// Same shape as the top-20 aggregator, but reads from the corpus's
// flat sample list. User-asked 2026-06-15: picker pool / count
// ranking should reflect the 14-day window, not just the top 20.

// aggregateLegalPoolFromSamples kommt aus dem Modul.

describe('aggregateLegalPoolFromSamples — corpus-driven pool', () => {
    it('builds pool + counts from the flat samples shape', () => {
        const samples = [
            { species: 'Garchomp', evs: '32 Spe', nature: 'Jolly' },
            { species: 'Garchomp', evs: '24 Spe', nature: 'Adamant' },
            { species: 'Garchomp', evs: '32 Spe', nature: 'Jolly' },
            { species: 'Kingambit', evs: '0 Spe', nature: 'Adamant' },
            { species: 'Talonflame', evs: '32 Spe', nature: 'Jolly' },
        ];
        const { pool, counts } = aggregateLegalPoolFromSamples(samples);
        assert.strictEqual(pool.size, 3);
        assert.strictEqual(counts.get('Garchomp'), 3);
        assert.strictEqual(counts.get('Kingambit'), 1);
        assert.strictEqual(counts.get('Talonflame'), 1);
    });

    it('counts mirror what the picker uses for "× N played" badges', () => {
        // The badge shown in the picker reads straight from
        // _usageCount.get(name). 14-day corpus typically pushes
        // top picks into the 30-70 range vs the 5-15 of top-20.
        const samples = [];
        for (let i = 0; i < 50; i++) samples.push({ species: 'Garchomp' });
        for (let i = 0; i < 30; i++) samples.push({ species: 'Talonflame' });
        for (let i = 0; i < 5; i++) samples.push({ species: 'Mega-Latios' });
        const { counts } = aggregateLegalPoolFromSamples(samples);
        assert.strictEqual(counts.get('Garchomp'), 50);
        assert.strictEqual(counts.get('Talonflame'), 30);
        assert.strictEqual(counts.get('Mega-Latios'), 5);
    });

    it('blank species + null inputs handled gracefully', () => {
        const { pool: p1 } = aggregateLegalPoolFromSamples([
            { species: '' }, { species: null }, { species: 'Garchomp' },
        ]);
        assert.strictEqual(p1.size, 1);
        assert.strictEqual(aggregateLegalPoolFromSamples([]).pool.size, 0);
        assert.strictEqual(aggregateLegalPoolFromSamples(null).pool.size, 0);
    });
});

// ── Regression: "eis" must NOT pull Ghost-types via "Geist" ────────
// First headless run showed the substring rule on types matched
// "Geist" → every Ghost-type Pokémon. Type rule is now prefix-only.

describe('speciesMatchesFilter — type prefix vs substring', () => {
    const dex = {
        'Beartic':   { types: ['Ice'] },
        'Gengar':    { types: ['Ghost', 'Poison'] },
        'Aegislash': { types: ['Steel', 'Ghost'] },
        'Garchomp':  { types: ['Dragon', 'Ground'] },
        'Drampa':    { types: ['Normal', 'Dragon'] },
    };

    it('"eis" matches Eis-type only, not Geist-type (regression)', () => {
        assert.ok(speciesMatchesFilter('Beartic',   'eis', dex, {}));
        assert.ok(!speciesMatchesFilter('Gengar',   'eis', dex, {}));
        assert.ok(!speciesMatchesFilter('Aegislash', 'eis', dex, {}));
    });

    it('"geist" still pulls Ghost (Geist startsWith geist)', () => {
        assert.ok(speciesMatchesFilter('Gengar',    'geist', dex, {}));
        assert.ok(speciesMatchesFilter('Aegislash', 'geist', dex, {}));
        assert.ok(!speciesMatchesFilter('Beartic',  'geist', dex, {}));
    });

    it('"drac" pulls Drache (DE startsWith) but not Dragon (different prefix)', () => {
        assert.ok(speciesMatchesFilter('Garchomp', 'drac', dex, {}));
        assert.ok(speciesMatchesFilter('Drampa',   'drac', dex, {}));
    });

    it('"drag" pulls Dragon (EN startsWith)', () => {
        assert.ok(speciesMatchesFilter('Garchomp', 'drag', dex, {}));
        assert.ok(speciesMatchesFilter('Drampa',   'drag', dex, {}));
    });

    it('partial type prefix still narrows correctly', () => {
        // "ele" → Elektro (DE), but also "Electric" — both startsWith
        // "ele". An Ice-type must not match.
        const dexExt = {
            'Pikachu': { types: ['Electric'] },
            'Vanilluxe': { types: ['Ice'] },
        };
        assert.ok(speciesMatchesFilter('Pikachu',   'ele', dexExt, {}));
        assert.ok(!speciesMatchesFilter('Vanilluxe', 'ele', dexExt, {}));
    });
});

// ── Die Typentabelle gegen zwei unabhängige Instanzen ──────────────
// Gefunden am 2026-08-18: die Tabelle in js/app-side-quest-play.js und
// die in data/champions_type_chart.json widersprachen sich in drei
// Feldern, und der Unit-Test enthielt eine dritte Kopie derselben
// falschen Zahlen. Drei Abschriften, kein Abgleich.
//
// Der Quelltext bleibt eine Kopie — bewusst: das Panel wird am
// Turniertisch gebraucht, eine fehlgeschlagene Anfrage darf keine
// leere Schwächenliste ergeben. Kopie ist aber nur dann harmlos, wenn
// jemand sie vergleicht. Das passiert hier, gegen zwei Instanzen:
//
//   1. data/champions_type_chart.json — dieselbe Tabelle, die
//      Schadensrechner und Matchup-Ansicht laden. Weichen die beiden
//      ab, zeigen zwei Panels derselben Seite verschiedene Zahlen.
//   2. Eine von Hand getippte VERTEIDIGUNGS-Tabelle: pro Typ, was ihm
//      wehtut. Das ist die Transponierte der Angriffstabelle, also
//      eine wirklich andere Schreibweise — ein verrutschtes Feld kann
//      nicht in beiden gleich falsch stehen.

const CHART_JSON = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'data', 'champions_type_chart.json'), 'utf8')
).chart;

// Verteidigersicht, Gen 6+. Alles, was hier nicht steht, ist ×1.
const DEFENSIVE_CANON = {
    Normal:   { weak: ['Fighting'], resist: [], immune: ['Ghost'] },
    Fire:     { weak: ['Water', 'Ground', 'Rock'], resist: ['Fire', 'Grass', 'Ice', 'Bug', 'Steel', 'Fairy'], immune: [] },
    Water:    { weak: ['Electric', 'Grass'], resist: ['Fire', 'Water', 'Ice', 'Steel'], immune: [] },
    Electric: { weak: ['Ground'], resist: ['Electric', 'Flying', 'Steel'], immune: [] },
    Grass:    { weak: ['Fire', 'Ice', 'Poison', 'Flying', 'Bug'], resist: ['Water', 'Electric', 'Grass', 'Ground'], immune: [] },
    Ice:      { weak: ['Fire', 'Fighting', 'Rock', 'Steel'], resist: ['Ice'], immune: [] },
    Fighting: { weak: ['Flying', 'Psychic', 'Fairy'], resist: ['Bug', 'Rock', 'Dark'], immune: [] },
    Poison:   { weak: ['Ground', 'Psychic'], resist: ['Grass', 'Fighting', 'Poison', 'Bug', 'Fairy'], immune: [] },
    Ground:   { weak: ['Water', 'Grass', 'Ice'], resist: ['Poison', 'Rock'], immune: ['Electric'] },
    Flying:   { weak: ['Electric', 'Ice', 'Rock'], resist: ['Grass', 'Fighting', 'Bug'], immune: ['Ground'] },
    Psychic:  { weak: ['Bug', 'Ghost', 'Dark'], resist: ['Fighting', 'Psychic'], immune: [] },
    Bug:      { weak: ['Fire', 'Flying', 'Rock'], resist: ['Grass', 'Fighting', 'Ground'], immune: [] },
    Rock:     { weak: ['Water', 'Grass', 'Fighting', 'Ground', 'Steel'], resist: ['Normal', 'Fire', 'Poison', 'Flying'], immune: [] },
    Ghost:    { weak: ['Ghost', 'Dark'], resist: ['Poison', 'Bug'], immune: ['Normal', 'Fighting'] },
    Dragon:   { weak: ['Ice', 'Dragon', 'Fairy'], resist: ['Fire', 'Water', 'Electric', 'Grass'], immune: [] },
    Dark:     { weak: ['Fighting', 'Bug', 'Fairy'], resist: ['Ghost', 'Dark'], immune: ['Psychic'] },
    Steel:    { weak: ['Fire', 'Fighting', 'Ground'], resist: ['Normal', 'Grass', 'Ice', 'Flying', 'Psychic', 'Bug', 'Rock', 'Dragon', 'Steel', 'Fairy'], immune: ['Poison'] },
    Fairy:    { weak: ['Poison', 'Steel'], resist: ['Fighting', 'Bug', 'Dark'], immune: ['Dragon'] },
};

// Transponiert die Verteidigungssicht in eine Angriffstabelle.
function transposeCanon() {
    const out = {};
    Object.keys(DEFENSIVE_CANON).forEach(d => { out[d] = out[d] || {}; });
    Object.entries(DEFENSIVE_CANON).forEach(([def, row]) => {
        row.weak.forEach(atk   => { out[atk][def] = 2; });
        row.resist.forEach(atk => { out[atk][def] = 0.5; });
        row.immune.forEach(atk => { out[atk][def] = 0; });
    });
    return out;
}

function cell(chart, atk, def) {
    const v = (chart[atk] || {})[def];
    return v === undefined ? 1 : v;
}

describe('Typentabelle — eine Wahrheit, drei Prüfungen', () => {
    const CANON = transposeCanon();

    it('Verteidigungssicht deckt alle 18 Typen ab', () => {
        assert.strictEqual(Object.keys(DEFENSIVE_CANON).length, 18);
        assert.deepStrictEqual(Object.keys(DEFENSIVE_CANON).sort(), ALL_TYPES.slice().sort());
    });

    it('data/champions_type_chart.json entspricht der Verteidigungssicht (18×18)', () => {
        const wrong = [];
        for (const atk of ALL_TYPES) {
            for (const def of ALL_TYPES) {
                const a = cell(CHART_JSON, atk, def);
                const b = cell(CANON, atk, def);
                if (a !== b) wrong.push(`${atk}->${def}: json=${a} kanon=${b}`);
            }
        }
        assert.deepStrictEqual(wrong, [], 'JSON weicht vom Kanon ab:\n' + wrong.join('\n'));
    });

    it('TYPE_CHART in app-side-quest-play.js entspricht der JSON-Datei (18×18)', () => {
        const wrong = [];
        for (const atk of ALL_TYPES) {
            for (const def of ALL_TYPES) {
                const a = cell(TYPE_CHART, atk, def);
                const b = cell(CHART_JSON, atk, def);
                if (a !== b) wrong.push(`${atk}->${def}: js=${a} json=${b}`);
            }
        }
        assert.deepStrictEqual(wrong, [], 'JS-Tabelle weicht von der JSON-Datei ab:\n' + wrong.join('\n'));
    });

    it('beide Tabellen nennen dieselben 18 Typen', () => {
        assert.deepStrictEqual(ALL_TYPES.slice().sort(), Object.keys(CHART_JSON).sort());
        assert.deepStrictEqual(
            ALL_TYPES.slice().sort(),
            JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_type_chart.json'), 'utf8'))
                ._meta.types.slice().sort()
        );
    });

    it('nur erlaubte Multiplikatoren (0, 0.5, 2) stehen in der Tabelle', () => {
        const bad = [];
        for (const atk of ALL_TYPES) {
            for (const [def, v] of Object.entries(TYPE_CHART[atk] || {})) {
                if (v !== 0 && v !== 0.5 && v !== 2) bad.push(`${atk}->${def}=${v}`);
            }
        }
        assert.deepStrictEqual(bad, []);
    });

    it('die deutschen Typnamen decken exakt die Typen der Tabelle ab', () => {
        // Der Quelltextkommentar behauptet das ("Keys müssen TYPE_CHART
        // exakt entsprechen"). Behauptungen im Kommentar sind keine.
        const m = SRC.match(/const TYPE_NAMES_DE = (\{[\s\S]*?\n {4}\});/);
        assert.ok(m, 'TYPE_NAMES_DE nicht gefunden');
        // eslint-disable-next-line no-new-func
        const namesDe = new Function('return ' + m[1])();
        assert.deepStrictEqual(Object.keys(namesDe).sort(), ALL_TYPES.slice().sort());
    });
});

// ── Die drei gefundenen Felder als benannte Regressionen ───────────
describe('Regression 2026-08-18 — drei falsche Felder der Typentabelle', () => {
    it('Unlicht ist gegen Geist resistent, nicht schwach (war ×2, ist ×0.5)', () => {
        assert.strictEqual(cell(TYPE_CHART, 'Ghost', 'Dark'), 0.5);
        // Sichtbare Folge: ein reines Unlicht-Pokémon stand mit
        // "Ghost ×2" in der Schwächenliste, Geist/Unlicht sogar mit ×4.
        const dark = defensiveWeaknesses(['Dark']).map(w => w.type);
        assert.ok(!dark.includes('Ghost'), 'Unlicht darf nicht als geist-schwach gelten');
        assert.deepStrictEqual(dark, ['Bug', 'Fairy', 'Fighting']);
        assert.deepStrictEqual(defensiveWeaknesses(['Ghost', 'Dark']), [{ type: 'Fairy', mult: 2 }]);
    });

    it('Fee gegen Käfer ist neutral, nicht halbiert (Zeile war von Käfer abgeschrieben)', () => {
        assert.strictEqual(cell(TYPE_CHART, 'Fairy', 'Bug'), 1);
        // Käfer/Flug (Vespiquen, Ninjask) war dadurch nicht als
        // fee-schwach ausgewiesen: 0.5 × 2 = 1 statt 1 × 2 = 2.
        const bugFly = defensiveWeaknesses(['Bug', 'Flying']).map(w => w.type);
        assert.ok(bugFly.includes('Rock'));
        assert.ok(bugFly.includes('Fire'));
    });

    it('Feuer ist gegen Fee resistent — die Zeile fehlte ganz', () => {
        assert.strictEqual(cell(TYPE_CHART, 'Fairy', 'Fire'), 0.5);
        const fire = defensiveWeaknesses(['Fire']).map(w => w.type);
        assert.ok(!fire.includes('Fairy'));
        assert.deepStrictEqual(fire, ['Ground', 'Rock', 'Water']);
    });
});
