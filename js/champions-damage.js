// champions-damage.js — the numbers behind the Champions matchup view
// and damage calculator.
//
// Deliberately DOM-free and shared by both surfaces: two implementations
// of a damage range is how one page ends up telling you 2HKO and the
// other OHKO for the same pair.
//
// Nothing here is scraped. Base powers, PP and damage classes come from
// data/champions_resources.json (494 moves), base stats from
// champions_pokedex.json, spreads and natures from champions_usage.json,
// and the type chart is public rules knowledge in
// data/champions_type_chart.json.
//
// The stat model was checked against a published Silph Scope set before
// any of this was written — Kingambit, Adamant, 32 HP / 32 Atk / 1 SpD /
// 1 Spe gives 207 / 205 / 140 / 72 / 106 / 71, all six exact. Iron Head
// into Sneasler gives 117–138, which is what they show too. Those are
// fixtures now; if the model drifts, they break.
(function (global) {
    'use strict';

    const LEVEL = 50;

    // Damage rolls: 16 evenly spaced multipliers from 0.85 to 1.00. A
    // range without them is not a range, and "OHKO" without knowing which
    // rolls reach it is a guess.
    const ROLLS = Array.from({ length: 16 }, (_, i) => (85 + i) / 100);

    const NATURES = {
        Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'],
        Bold: ['def', 'atk'], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'],
        Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'],
        Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Rash: ['spa', 'spd'],
        Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'],
        Hardy: null, Docile: null, Serious: null, Bashful: null, Quirky: null,
    };

    // Lv. 50, IV fixed at 31 — the Champions model.
    //   non-HP  int(((2*base + 31) * 50 / 100 + 5 + SP) * nature)
    //   HP      (2*base + 31) * 50 / 100 + 50 + 10 + SP
    // Identical to computeFinal in app-side-quest-pokedex.js, which
    // writes the same thing as base + 20 / base + 75; kept in this form
    // because it is the form the game documents.
    function statAt50(base, sp, natureMult) {
        const core = Math.floor(((2 * Number(base || 0) + 31) * LEVEL) / 100) + 5 + Number(sp || 0);
        return Math.floor(core * (natureMult == null ? 1 : natureMult));
    }

    function hpAt50(base, sp) {
        return Math.floor(((2 * Number(base || 0) + 31) * LEVEL) / 100) + 50 + 10 + Number(sp || 0);
    }

    function natureMult(nature, stat) {
        const fx = NATURES[nature];
        if (!fx) return 1;
        if (fx[0] === stat) return 1.1;
        if (fx[1] === stat) return 0.9;
        return 1;
    }

    // { hp, atk, def, spa, spd, spe } for a build.
    // `base` is the Pokédex entry ({hp:{base}, …} or a flat map).
    function buildStats(base, spread, nature) {
        const b = (k) => {
            const v = base && base[k];
            return (v && typeof v === 'object') ? v.base : v;
        };
        const sp = spread || {};
        const out = { hp: hpAt50(b('hp'), sp.hp) };
        ['atk', 'def', 'spa', 'spd', 'spe'].forEach(k => {
            out[k] = statAt50(b(k), sp[k], natureMult(nature, k));
        });
        return out;
    }

    // ── type effectiveness ──────────────────────────────────────────

    function makeChart(json) {
        const table = (json && json.chart) || {};
        return function effectiveness(moveType, defenderTypes) {
            if (!moveType) return 1;
            const row = table[moveType];
            if (!row) return 1;
            return (defenderTypes || []).filter(Boolean).reduce((m, t) => {
                const v = row[t];
                return m * (v === undefined ? 1 : v);
            }, 1);
        };
    }

    // ── damage ──────────────────────────────────────────────────────

    // Every modifier is opt-in and listed, so an unexplained number
    // cannot appear. Anything that cannot be backed is left out rather
    // than guessed — a wrong number is worse than a missing one.
    const ITEM_MULT = { 'Life Orb': 1.3, 'Expert Belt': 1.2 };

    function itemMultiplier(item, eff) {
        if (!item) return 1;
        if (ITEM_MULT[item]) return item === 'Expert Belt' ? (eff > 1 ? 1.2 : 1) : ITEM_MULT[item];
        return 1;
    }

    /**
     * damageRange(opts) -> {
     *   rolls[16], min, max, minPct, maxPct, effectiveness, stab,
     *   ko: { hits, chance }   // chance ∈ 0..1 for the named hit count
     * }
     * Returns null when the move cannot deal damage (status, no power).
     */
    function damageRange(opts) {
        const move = opts.move || {};
        const power = Number(move.power) || 0;
        const cls = move.damage_class || move.category;
        if (!power || cls === 'Status') return null;

        const physical = cls !== 'Special';
        const atk = physical ? opts.attackerStats.atk : opts.attackerStats.spa;
        const def = physical ? opts.defenderStats.def : opts.defenderStats.spd;
        const hp = opts.defenderStats.hp;
        if (!atk || !def || !hp) return null;

        const eff = opts.effectiveness == null ? 1 : opts.effectiveness;
        if (eff === 0) {
            return { rolls: new Array(16).fill(0), min: 0, max: 0, minPct: 0, maxPct: 0,
                     effectiveness: 0, stab: 1, ko: null, immune: true };
        }
        const stab = (opts.attackerTypes || []).indexOf(move.type) !== -1 ? 1.5 : 1;
        const extra = (opts.weather || 1) * itemMultiplier(opts.item, eff)
            * (opts.spread ? 0.75 : 1) * (opts.extraMultiplier || 1);

        const base = Math.floor(Math.floor(
            Math.floor((2 * LEVEL) / 5 + 2) * power * atk / def) / 50) + 2;

        const rolls = ROLLS.map(r =>
            Math.max(1, Math.floor(Math.floor(Math.floor(base * r) * stab) * eff * extra)));
        const min = rolls[0], max = rolls[rolls.length - 1];
        const round1 = (v) => Math.round(v * 1000) / 10;   // 74.52 -> 74.5
        return {
            rolls, min, max,
            minPct: round1(min / hp), maxPct: round1(max / hp),
            effectiveness: eff, stab,
            ko: koChance(rolls, hp),
        };
    }

    // How many hits koChance() looks ahead. Beyond this the answer stops
    // being useful — nothing in this format survives nine hits of a move
    // that can damage it at all — and the return says so explicitly
    // instead of pretending to a number.
    const KO_MAX_HITS = 9;

    /**
     * The honest KO statement. "OHKO" is only true when the LOWEST roll
     * kills; when only some rolls do, the share of rolls that get there
     * is the answer, and hiding it would overstate the result.
     *
     * ── Two things were wrong here until 20.08.2026 ──
     *
     * 1. `rolls.filter(r => r * hits >= hp)` asked "does ONE roll,
     *    multiplied by the hit count, kill?". That is not n hits — it is
     *    the same hit happening n times. Real damage over n hits is the
     *    SUM OF n INDEPENDENT DRAWS from the 16 rolls, and that sum is
     *    far more concentrated than one roll scaled up.
     *
     *    The hit COUNT came out right either way (min·n and max·n bound
     *    the sum correctly). The CHANCE did not. Swept over 2.556
     *    base-damage / HP combinations: the reported chance was off by
     *    more than half a point in 53,3 % of them, by up to 43,8
     *    percentage points. Base damage 13 into 45 HP read "4HKO 50 %";
     *    the true figure is 93,8 %. The old form could also only ever
     *    print sixteenths — 50 %, 56 %, 62 % — because it counted
     *    single rolls no matter how many hits it was talking about.
     *
     * 2. The loop stopped at four hits and then returned
     *    `{ hits: 5, chance: 0 }`. "5+HKO 0 %" says "five hits will not
     *    kill it", which is the opposite of the truth whenever five hits
     *    do. In a 21.336-combination sweep, 332 rows said 0 % where the
     *    LOWEST roll five times over already kills — a guaranteed 5HKO
     *    printed as impossible.
     *
     * The distribution is now built exactly, by convolution, one hit at a
     * time, and the loop stops at the first hit count that can kill at
     * all. No sampling: with 16 integer rolls the support stays small
     * (a few dozen sums), so the exact answer is also the cheap one.
     *
     * Returns { hits, chance } — or { hits: null, chance: 0 } when even
     * KO_MAX_HITS hits of the highest roll cannot get there.
     */
    function koChance(rolls, hp) {
        if (!hp) return null;
        if (!rolls || !rolls.length) return null;

        // Verteilung der Summe nach n Treffern, als Map Summe -> Wahrscheinlichkeit.
        // Startpunkt ist "null Treffer, Schaden 0 mit Sicherheit".
        let verteilung = new Map([[0, 1]]);
        const p = 1 / rolls.length;

        for (let hits = 1; hits <= KO_MAX_HITS; hits++) {
            const naechste = new Map();
            for (const [summe, wk] of verteilung) {
                for (let i = 0; i < rolls.length; i++) {
                    const s = summe + rolls[i];
                    naechste.set(s, (naechste.get(s) || 0) + wk * p);
                }
            }
            verteilung = naechste;

            let chance = 0;
            for (const [summe, wk] of verteilung) {
                if (summe >= hp) chance += wk;
            }
            if (chance > 0) {
                // Gleitkomma: 0,9999999999 ist eine Garantie, kein 99,99 %.
                if (chance > 1 - 1e-9) return { hits, chance: 1 };
                return { hits, chance };
            }

            // Wenn selbst der hoechste Wurf n-mal nicht reicht, brauchen
            // wir die kleinen Summen nicht weiterzutragen — alles unter
            // (hp - (KO_MAX_HITS - hits) * maxWurf) kann nie ankommen.
            // Ohne das waechst die Map bei sehr grossen Trefferzahlen
            // unnoetig.
            const maxWurf = rolls[rolls.length - 1];
            const untergrenze = hp - (KO_MAX_HITS - hits) * maxWurf;
            if (untergrenze > 0) {
                for (const summe of verteilung.keys()) {
                    if (summe < untergrenze) verteilung.delete(summe);
                }
                if (!verteilung.size) break;
            }
        }
        return { hits: null, chance: 0 };
    }

    // Ties count as "not faster" — going first on a speed tie is a coin
    // flip, and calling it faster would be wrong half the time.
    function speedComparison(mine, theirs) {
        if (mine === theirs) return { faster: false, tie: true, mine, theirs };
        return { faster: mine > theirs, tie: false, mine, theirs };
    }

    global.ChampionsDamage = {
        LEVEL, ROLLS, NATURES, KO_MAX_HITS,
        statAt50, hpAt50, natureMult, buildStats,
        makeChart, damageRange, koChance, speedComparison,
    };
})(typeof window !== 'undefined' ? window : globalThis);
