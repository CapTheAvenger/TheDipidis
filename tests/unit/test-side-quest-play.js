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

// ── Production mirrors ─────────────────────────────────────────────

const LEVEL = 50;
const MAX_IV = 31;
const MAX_EV_MAINLINE = 252;
const CHAMPIONS_EV_SCALE = 8;

function speedStat(base, mainlineEV, natureMod) {
    const ev = Math.min(MAX_EV_MAINLINE, Math.max(0, mainlineEV));
    const inner = Math.floor(((2 * base + MAX_IV + Math.floor(ev / 4)) * LEVEL) / 100 + 5);
    return Math.floor(inner * natureMod);
}
function baseSpeedAt50(base) { return speedStat(base, 0, 1.0); }
function maxSpeedAt50(base)  { return speedStat(base, MAX_EV_MAINLINE, 1.1); }
function actualSpeedAt50(base, championsEV, natureMod) {
    return speedStat(base, championsEV * CHAMPIONS_EV_SCALE, natureMod);
}

const NATURE_SPEED = {
    Hasty: 1.1, Jolly: 1.1, Naive: 1.1, Timid: 1.1,
    Brave: 0.9, Quiet: 0.9, Relaxed: 0.9, Sassy: 0.9,
};
function natureSpeedMod(name) {
    return NATURE_SPEED[String(name || '').trim()] || 1.0;
}

const TYPE_CHART = {
    Normal:   { Rock: 0.5, Ghost: 0,   Steel: 0.5 },
    Fire:     { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 2, Bug: 2, Rock: 0.5, Dragon: 0.5, Steel: 2 },
    Water:    { Fire: 2, Water: 0.5, Grass: 0.5, Ground: 2, Rock: 2, Dragon: 0.5 },
    Electric: { Water: 2, Electric: 0.5, Grass: 0.5, Ground: 0, Flying: 2, Dragon: 0.5 },
    Grass:    { Fire: 0.5, Water: 2, Grass: 0.5, Poison: 0.5, Ground: 2, Flying: 0.5, Bug: 0.5, Rock: 2, Dragon: 0.5, Steel: 0.5 },
    Ice:      { Fire: 0.5, Water: 0.5, Grass: 2, Ice: 0.5, Ground: 2, Flying: 2, Dragon: 2, Steel: 0.5 },
    Fighting: { Normal: 2, Ice: 2, Poison: 0.5, Flying: 0.5, Psychic: 0.5, Bug: 0.5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: 0.5 },
    Poison:   { Grass: 2, Poison: 0.5, Ground: 0.5, Rock: 0.5, Ghost: 0.5, Steel: 0, Fairy: 2 },
    Ground:   { Fire: 2, Electric: 2, Grass: 0.5, Poison: 2, Flying: 0, Bug: 0.5, Rock: 2, Steel: 2 },
    Flying:   { Electric: 0.5, Grass: 2, Fighting: 2, Bug: 2, Rock: 0.5, Steel: 0.5 },
    Psychic:  { Fighting: 2, Poison: 2, Psychic: 0.5, Dark: 0, Steel: 0.5 },
    Bug:      { Fire: 0.5, Grass: 2, Fighting: 0.5, Poison: 0.5, Flying: 0.5, Psychic: 2, Ghost: 0.5, Dark: 2, Steel: 0.5, Fairy: 0.5 },
    Rock:     { Fire: 2, Ice: 2, Fighting: 0.5, Ground: 0.5, Flying: 2, Bug: 2, Steel: 0.5 },
    Ghost:    { Normal: 0, Psychic: 2, Ghost: 2, Dark: 2 },
    Dragon:   { Dragon: 2, Steel: 0.5, Fairy: 0 },
    Dark:     { Fighting: 0.5, Psychic: 2, Ghost: 2, Dark: 0.5, Fairy: 0.5 },
    Steel:    { Fire: 0.5, Water: 0.5, Electric: 0.5, Ice: 2, Rock: 2, Steel: 0.5, Fairy: 2 },
    Fairy:    { Fighting: 2, Poison: 0.5, Bug: 0.5, Dragon: 2, Dark: 2, Steel: 0.5 },
};
const ALL_TYPES = Object.keys(TYPE_CHART);

function defensiveWeaknesses(defenderTypes) {
    if (!defenderTypes || defenderTypes.length === 0) return [];
    const results = [];
    for (const atk of ALL_TYPES) {
        let mult = 1;
        for (const def of defenderTypes) {
            const row = TYPE_CHART[atk];
            if (!row) continue;
            const v = row[def];
            if (v !== undefined) mult *= v;
        }
        if (mult > 1) results.push({ type: atk, mult });
    }
    results.sort((a, b) => (b.mult - a.mult) || a.type.localeCompare(b.type));
    return results;
}

function parseEVs(str) {
    const out = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    if (!str) return out;
    const key = { HP:'hp', Atk:'atk', Def:'def', SpA:'spa', SpD:'spd', Spe:'spe' };
    String(str).split('/').forEach(seg => {
        const m = String(seg).trim().match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
        if (!m) return;
        const k = key[m[2].replace(/^./, c => c.toUpperCase()).replace(/^Sp([adAD])$/, (_, x) => 'Sp' + x.toUpperCase())]
               || key[m[2]];
        if (k) out[k] = parseInt(m[1], 10);
    });
    return out;
}

// Mirror of aggregateLegalPool + the picker sort+filter rule.
// User-flagged 2026-06-14: the opponent picker dumped the full
// 1480-entry Showdown pokedex on a 2-second-decision UI — Absol,
// Abra, Arceus-Dark were the first three. Restrict to species in
// the current top-team data and sort by usage DESC so the
// most-likely matches surface first.

function aggregateLegalPool(teams) {
    const pool = new Set();
    const counts = new Map();
    for (const t of (teams || [])) {
        for (const p of (t.pokemon || [])) {
            const name = p && p.name;
            if (!name) continue;
            pool.add(name);
            counts.set(name, (counts.get(name) || 0) + 1);
        }
    }
    return { pool, counts };
}

// Replays the production picker sort+filter without DOM. Inputs
// match what app-side-quest-play.js' pickerSortedNames() sees.
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

function nextEmptyOppIndex(opponent) {
    if (!Array.isArray(opponent)) return -1;
    for (let i = 0; i < opponent.length; i++) {
        if (!opponent[i]) return i;
    }
    return -1;
}

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

function buildTypicalSpeeds(teams, lookupSpec) {
    const grouped = new Map();
    for (const t of (teams || [])) {
        for (const p of (t.pokemon || [])) {
            const name = p && p.name;
            if (!name) continue;
            if (!grouped.has(name)) grouped.set(name, []);
            grouped.get(name).push({ ev: parseEVs(p.evs).spe, nature: p.nature || '' });
        }
    }
    const out = {};
    for (const [name, instances] of grouped) {
        const spec = lookupSpec(name);
        if (!spec || !spec.baseStats) continue;
        const baseSpe = spec.baseStats.spe;
        const counts = new Map();
        for (const inst of instances) {
            const key = inst.ev + '|' + inst.nature;
            counts.set(key, (counts.get(key) || 0) + 1);
        }
        let bestKey = null, bestCount = 0, bestSpeed = -1;
        for (const [k, v] of counts) {
            const [evStr, nat] = k.split('|');
            const spd = actualSpeedAt50(baseSpe, parseInt(evStr, 10), natureSpeedMod(nat));
            if (v > bestCount || (v === bestCount && spd > bestSpeed)) {
                bestCount = v; bestKey = k; bestSpeed = spd;
            }
        }
        if (!bestKey) continue;
        const [evStr, nature] = bestKey.split('|');
        out[name] = {
            typicalSpeed: bestSpeed,
            evMode: parseInt(evStr, 10),
            natureMode: nature,
            sampleSize: instances.length,
            modeShare: bestCount / instances.length,
        };
    }
    return out;
}

function buildSpeedLadder(team, opponent, lookupSpec, typicalMap) {
    const rows = [];
    for (const p of (team && team.pokemon) || []) {
        const spec = lookupSpec(p.name);
        if (!spec || !spec.baseStats) continue;
        const baseSpe = spec.baseStats.spe;
        const evs = parseEVs(p.evs);
        const actual = actualSpeedAt50(baseSpe, evs.spe, natureSpeedMod(p.nature));
        rows.push({ side: 'Y', name: p.name, speed: actual, tailwind: actual * 2, source: 'actual' });
    }
    for (const o of (opponent || [])) {
        if (!o || !o.name) continue;
        const spec = lookupSpec(o.name);
        if (!spec || !spec.baseStats) continue;
        const baseSpe = spec.baseStats.spe;
        const typ = typicalMap && typicalMap[o.name];
        if (typ && typ.typicalSpeed > 0) {
            rows.push({ side: 'O', name: o.name, speed: typ.typicalSpeed, tailwind: typ.typicalSpeed * 2, source: 'typical' });
        } else {
            const base = baseSpeedAt50(baseSpe);
            rows.push({ side: 'O', name: o.name, speed: base, tailwind: base * 2, source: 'base' });
        }
    }
    rows.sort((a, b) => {
        if (b.speed !== a.speed) return b.speed - a.speed;
        if (a.side !== b.side) return a.side === 'Y' ? -1 : 1;
        return a.name.localeCompare(b.name);
    });
    return rows;
}

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
