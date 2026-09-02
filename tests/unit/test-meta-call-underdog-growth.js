/**
 * Unit tests for two new Meta Call predictors:
 *
 *   Predictor 4.6 — Underdog-Champion-Boost
 *     Adds an additive PP bonus to a deck's predicted share when it
 *     recently WON a major regional at <4 % usage in a 500+ player
 *     event. Boost decays linearly between FULL_DECAY_DAYS (full)
 *     and ZERO_DECAY_DAYS (zero). Strength scales with how far below
 *     the underdog ceiling the deck sat at the time of the win.
 *
 *     Empirical anchor: Campinas 2026-05-17 → Ogerpon Meganium won
 *     at ~2.6 % usage → at Indianapolis (~2 weeks later) the same
 *     deck hit 7.9 % Day 1. The boost is sized so a fresh max-
 *     strength signal contributes ~2.5 pp toward that jump.
 *
 *   Predictor 5.4 — Day-2 share-growth (Δ-share)
 *     Adds an additive PP bonus when a deck's average Day 1→Day 2
 *     ABSOLUTE share growth crosses MIN_GROWTH_PP. Distinct from
 *     the day1_to_day2_conv ratio: a deck at flat 5 % share has
 *     100 % conversion but zero growth.
 *
 *     Empirical anchor: Lillie's Clefairy Ogerpon at Indianapolis
 *     2026 — Day 1 3.8 % → Day 2 5.3 % = +1.5 pp growth, a stronger
 *     forward signal than the matching conversion ratio.
 *
 * Both predictors are evaluated inline in the main share pipeline
 * (Stage 5.x of app-meta-call.js — see "Predictor 4.6" / "Predictor
 * 5.4" comment anchors). Because they aren't extractable top-level
 * functions, these tests reimplement the formulas and verify the
 * numbers against fixtures shaped like the production code.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Gleichlauf mit der Quelle ───────────────────────────────────
// BEFUND (02.09.2026): der Kopfkommentar dieser Datei sagt seit jeher
// "keep in lockstep" — durchgesetzt hat den Gleichlauf nichts. Eine
// Mutationspruefung setzte die Konstante im Motor auf null; die Kopie
// hier blieb stehen, die Formel unten rechnete weiter mit der Kopie,
// und die Suite blieb gruen. Die Spiegel bleiben (sie machen die
// Rechnung unten lesbar), aber sie werden jetzt gegen die Quelle
// geprueft. Was gerechnet wird, prueft zusaetzlich
// tests/unit/test-motor-stufen-wirksamkeit.js am echten Quellblock.
const fs = require('fs');
const path = require('path');
const SRC_MC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');

function quellZahl(name) {
    const m = SRC_MC.match(new RegExp('\\bconst\\s+' + name + '\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*;'));
    assert.ok(m, name + ' steht nicht mehr als numerische Konstante in '
        + 'js/app-meta-call.js — umbenannt oder in einen Ausdruck verwandelt. '
        + 'Beides macht den Gleichlauf blind, deshalb bricht er hier ab.');
    return Number(m[1]);
}

function pruefeGleichlauf(spiegel, praefix, ausnahmen) {
    for (const [kurz, wert] of Object.entries(spiegel)) {
        const quellName = (ausnahmen && ausnahmen[kurz]) || (praefix + kurz);
        assert.strictEqual(wert, quellZahl(quellName),
            `${quellName}: die Quelle sagt ${quellZahl(quellName)}, die Kopie in `
            + `dieser Datei sagt ${wert}. Solange sie auseinanderlaufen, prueft `
            + 'diese Datei ihre eigene Kopie und nicht den Motor.');
    }
}

// ── Predictor 4.6 — reference formula ───────────────────────────
// Kept in sync with the constants declared near the top of
// app-meta-call.js (search "PREDICTOR_4_6_"). If the production
// constants move, update these mirrors and re-run.
const P46 = {
    MAX_SHARE_PCT:     4.0,
    MIN_PLAYERS:       500,
    FULL_DECAY_DAYS:   14,
    ZERO_DECAY_DAYS:   28,
    BOOST_PP_MAX:      2.5,
};

function underdogBoostPP({ ageDays, shareAtWin }) {
    let freshness = 0;
    if (ageDays <= P46.FULL_DECAY_DAYS) {
        freshness = 1.0;
    } else if (ageDays < P46.ZERO_DECAY_DAYS) {
        freshness = 1.0 - (ageDays - P46.FULL_DECAY_DAYS) /
                    (P46.ZERO_DECAY_DAYS - P46.FULL_DECAY_DAYS);
    }
    const underdogStrength = Math.max(0, (P46.MAX_SHARE_PCT - shareAtWin) / P46.MAX_SHARE_PCT);
    return P46.BOOST_PP_MAX * freshness * underdogStrength;
}

// ── Predictor 5.4 — reference formula ───────────────────────────
// Constants lowered 2026-06 after the Indianapolis calibration showed
// 0.6/1.5 was over-boosting online-hype decks (Festival Lead, Slowking)
// that didn't translate in-person. Per-pp 0.6 → 0.4, cap 1.5 → 1.0.
const P54 = {
    MIN_GROWTH_PP:   0.5,
    BOOST_PER_PP:    0.4,
    BOOST_PP_MAX:    1.0,
};

function growthBoostPP(avgGrowthPP) {
    if (avgGrowthPP < P54.MIN_GROWTH_PP) return 0;
    return Math.min(P54.BOOST_PP_MAX, avgGrowthPP * P54.BOOST_PER_PP);
}

// ── Predictor 4.6 tests ─────────────────────────────────────────

describe('Predictor 4.6 — Underdog-Champion-Boost', () => {
    it('Campinas-shaped fresh win (Ogerpon Meganium, 2.6 % share, 3 days ago) lands max-ish boost', () => {
        // Strongest realistic case: low share, very fresh — should hit
        // ~85 % of the 2.5 pp cap (because 2.6/4.0 underdog strength = 0.35,
        // and freshness is 1.0). Math: 2.5 × 1.0 × 0.35 = 0.875 pp.
        const boost = underdogBoostPP({ ageDays: 3, shareAtWin: 2.6 });
        assert.ok(boost > 0.80 && boost < 0.95,
            `expected ~0.875 pp, got ${boost.toFixed(3)}`);
    });

    it('Win at exact MAX_SHARE_PCT ceiling contributes zero (boundary)', () => {
        // shareAtWin = 4.0 → underdogStrength = 0 → bonus = 0.
        // Keeps the predictor from quietly boosting borderline cases
        // that are basically tier-1 already.
        assert.strictEqual(
            underdogBoostPP({ ageDays: 0, shareAtWin: 4.0 }),
            0
        );
    });

    it('Win at 0.5 % share gives near-max strength (87.5 %) — strongest underdog', () => {
        // shareAtWin = 0.5 → underdogStrength = 0.875.
        // freshness = 1.0 → boost = 2.5 × 1.0 × 0.875 = 2.1875.
        const boost = underdogBoostPP({ ageDays: 0, shareAtWin: 0.5 });
        assert.ok(boost > 2.15 && boost < 2.22,
            `expected ~2.1875, got ${boost.toFixed(3)}`);
    });

    it('Full freshness window: ageDays = 14 still pays full freshness', () => {
        // Decay starts AFTER day 14. Day 14 itself must still be 1.0.
        const fresh = underdogBoostPP({ ageDays: 14, shareAtWin: 2.0 });
        const sameDay = underdogBoostPP({ ageDays: 0, shareAtWin: 2.0 });
        assert.strictEqual(fresh, sameDay);
    });

    it('Mid-decay window: ageDays = 21 halves the freshness', () => {
        // (21 - 14) / (28 - 14) = 0.5 → freshness = 0.5.
        const half = underdogBoostPP({ ageDays: 21, shareAtWin: 2.0 });
        const full = underdogBoostPP({ ageDays: 14, shareAtWin: 2.0 });
        assert.ok(Math.abs(half - full * 0.5) < 1e-9);
    });

    it('Past ZERO_DECAY_DAYS the boost is exactly zero', () => {
        assert.strictEqual(underdogBoostPP({ ageDays: 28, shareAtWin: 1.0 }), 0);
        assert.strictEqual(underdogBoostPP({ ageDays: 60, shareAtWin: 0.5 }), 0);
    });

    it('Boost can never exceed BOOST_PP_MAX even in the most extreme case', () => {
        // shareAtWin = 0 → underdogStrength = 1.0, freshness 1.0,
        // bonus = 2.5 × 1.0 × 1.0 = 2.5 == cap. Floating-point safe.
        const boost = underdogBoostPP({ ageDays: 0, shareAtWin: 0 });
        assert.ok(boost <= P46.BOOST_PP_MAX + 1e-9);
        assert.ok(boost >= P46.BOOST_PP_MAX - 1e-9);
    });

    it('Boost decays monotonically with age (older = smaller)', () => {
        const share = 2.5;
        const ages = [0, 7, 14, 17, 21, 25, 27, 28, 30];
        const boosts = ages.map(a => underdogBoostPP({ ageDays: a, shareAtWin: share }));
        for (let i = 1; i < boosts.length; i++) {
            assert.ok(boosts[i] <= boosts[i - 1] + 1e-9,
                `not monotonic: age ${ages[i - 1]} → ${boosts[i - 1]}, age ${ages[i]} → ${boosts[i]}`);
        }
    });

    it('Boost decreases monotonically with share at win (more usage = weaker signal)', () => {
        const ageDays = 7;
        const shares = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
        const boosts = shares.map(s => underdogBoostPP({ ageDays, shareAtWin: s }));
        for (let i = 1; i < boosts.length; i++) {
            assert.ok(boosts[i] <= boosts[i - 1] + 1e-9,
                `not monotonic: share ${shares[i - 1]} → ${boosts[i - 1]}, share ${shares[i]} → ${boosts[i]}`);
        }
    });
});

// ── Predictor 5.4 tests ─────────────────────────────────────────

describe('Predictor 5.4 — Day-2 share-growth boost', () => {
    it('Lillie\'s Clefairy-shaped +1.5 pp growth gives 0.6 pp boost (post-2026-06 tuning)', () => {
        // 1.5 × 0.6 = 0.9 pp. Below the 1.5 pp cap.
        const boost = growthBoostPP(1.5);
        // 2026-06 update: 1.5 × 0.4 = 0.6 (was 0.9 under the old 0.6 multiplier).
        assert.ok(Math.abs(boost - 0.6) < 1e-9, `expected 0.6, got ${boost}`);
    });

    it('Sub-threshold growth (+0.3 pp) contributes zero', () => {
        // Below MIN_GROWTH_PP = 0.5 → ignored as noise.
        assert.strictEqual(growthBoostPP(0.3), 0);
        assert.strictEqual(growthBoostPP(0.499), 0);
    });

    it('Growth at threshold contributes full 0.5 × 0.4 = 0.2 pp', () => {
        const boost = growthBoostPP(P54.MIN_GROWTH_PP);
        // 2026-06 update: 0.5 × 0.4 = 0.2 (was 0.3 under the old 0.6 multiplier).
        assert.ok(Math.abs(boost - 0.2) < 1e-9, `expected 0.2, got ${boost}`);
    });

    it('Extreme growth (+5 pp) saturates at BOOST_PP_MAX', () => {
        // 5 × 0.6 = 3.0, but cap = 1.5. Prevents a single fluky major
        // (e.g. a small online event where one deck jumps +6 pp) from
        // dominating the prediction.
        assert.strictEqual(growthBoostPP(5.0), P54.BOOST_PP_MAX);
        assert.strictEqual(growthBoostPP(100), P54.BOOST_PP_MAX);
    });

    it('Negative growth (deck SHED share in cut) contributes zero', () => {
        // A deck whose share dropped Day 1 → Day 2 underperformed —
        // never boost it. Formula handles this via the MIN_GROWTH_PP
        // gate, but verify explicitly.
        assert.strictEqual(growthBoostPP(-1.0), 0);
        assert.strictEqual(growthBoostPP(-3.5), 0);
    });

    it('Boost is monotonically non-decreasing in growth (until cap)', () => {
        const growths = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0, 10.0];
        const boosts = growths.map(growthBoostPP);
        for (let i = 1; i < boosts.length; i++) {
            assert.ok(boosts[i] >= boosts[i - 1] - 1e-9,
                `not monotonic: growth ${growths[i - 1]} → ${boosts[i - 1]}, growth ${growths[i]} → ${boosts[i]}`);
        }
    });
});

// ── Constants sanity ────────────────────────────────────────────

describe('Predictor 4.6 / 5.4 — constants stay realistic', () => {
    it('4.6 underdog ceiling matches the documented strategy', () => {
        // "Under 4 % usage" is the cutoff used in the Campinas
        // post-mortem. If the production constant moves, this test
        // forces an update so the test mirror stays in sync.
        assert.strictEqual(P46.MAX_SHARE_PCT, 4.0);
    });

    it('4.6 decay window is two weeks → four weeks', () => {
        // Tournaments usually go ~2-week intervals (regional → next
        // regional) so full freshness for 14 days is the right scope.
        assert.strictEqual(P46.FULL_DECAY_DAYS, 14);
        assert.strictEqual(P46.ZERO_DECAY_DAYS, 28);
    });

    it('5.4 cap is well below 4.6 cap — growth alone can\'t outweigh a champion title', () => {
        // The hierarchy matters: a fresh underdog title is a stronger
        // signal than a +N pp Δ. Keep cap-ordering invariant.
        assert.ok(P54.BOOST_PP_MAX < P46.BOOST_PP_MAX);
    });
});

describe('Predictor 4.6 / 5.4 — Gleichlauf: die Kopien oben sind die Quelle', () => {
    it('jede gespiegelte 4.6-Konstante deckt sich mit js/app-meta-call.js', () => {
        pruefeGleichlauf(P46, 'PREDICTOR_4_6_');
    });

    it('jede gespiegelte 5.4-Konstante deckt sich mit js/app-meta-call.js', () => {
        // Diese drei standen bis zum 02.09.2026 nirgends gegen die Quelle.
        // PREDICTOR_5_4_BOOST_PER_PP liess sich auf 0.0 setzen, ohne dass
        // eine einzige Zusicherung rot wurde — die Formel oben rechnete
        // mit der Kopie 0.4 weiter.
        pruefeGleichlauf(P54, 'PREDICTOR_5_4_');
    });

    it('der Wachstums-Schub ist nicht auf null gestellt', () => {
        // BELEG (tests/unit/test-stufen-inventur.js): "Am 01.09. hob er
        // 12 von 43 Decks an, bis +3,33 pp." Die Stufe ist wirksam und
        // meldet sich nur leise — beim Auszaehlen der toten Stufen stand
        // sie deshalb faelschlich auf der Liste der stummen.
        const proPP = quellZahl('PREDICTOR_5_4_BOOST_PER_PP');
        assert.ok(proPP > 0,
            `PREDICTOR_5_4_BOOST_PER_PP steht auf ${proPP} — die Stufe rechnet `
            + 'weiter und liefert fuer jedes Deck 0,00 pp');
        assert.ok(proPP <= 0.6,
            `PREDICTOR_5_4_BOOST_PER_PP steht auf ${proPP} — 0,6 injizierte in der `
            + 'Indy-Kalibrierung +1,2 pp in Online-Hype-Decks (Festival Lead, '
            + 'Slowking), die in Person nicht erschienen');
        assert.ok(growthBoostPP(1.5) > 0,
            'die Lillie-Clefairy-Form (+1,5 pp) bringt keinen Schub mehr');
    });

    it('der Underdog-Champion-Schub ist nicht auf null gestellt', () => {
        // Campinas 2026-05-17: Ogerpon Meganium gewann bei ~2,6 % Anteil,
        // zwei Wochen spaeter stand es in Indianapolis bei 7,9 % an Tag 1.
        const deckel = quellZahl('PREDICTOR_4_6_BOOST_PP_MAX');
        assert.ok(deckel > 0,
            `PREDICTOR_4_6_BOOST_PP_MAX steht auf ${deckel} — der Sprung von 2,6 % `
            + 'auf 7,9 % wird von keiner Stufe mehr vorweggenommen');
        assert.ok(underdogBoostPP({ ageDays: 3, shareAtWin: 2.6 }) > 0,
            'ein frischer Underdog-Titel bringt keinen Schub mehr');
    });
});
