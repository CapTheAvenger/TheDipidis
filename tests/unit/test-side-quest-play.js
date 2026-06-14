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
