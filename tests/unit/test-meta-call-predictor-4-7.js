/**
 * Unit tests for Predictor 4.7 — Online-Tournament-Win Signal.
 *
 * Companion to Predictor 4.6 (Underdog-Champion-Boost, regional
 * wins). Inputs come from data/online_tournament_winners.csv via the
 * extended online_tournament_scraper.py. Conditions to fire:
 *   • The deck's online share is < PREDICTOR_4_7_MAX_SHARE_PCT
 *     (else it's already established — no underdog signal)
 *   • The win came from a tournament with ≥ PREDICTOR_4_7_MIN_PLAYERS
 *     entries (else it's a Discord-tier event, too noisy)
 *   • The win is within PREDICTOR_4_7_ZERO_DECAY_DAYS of today
 *     (freshness ramp: full for FULL_DECAY_DAYS, linear to 0 at zero)
 *   • The win's format matches the active in-person rotation (the
 *     loader handles this; the boost function below assumes the win
 *     is already format-matched)
 *
 * Boost formula:
 *   bonus = BOOST_PP_MAX × freshness × underrated × size_mult × 0.5
 *
 * Empirical anchor: Indianapolis post-mortem cited Ogerpon Meganium
 * Hydrapple online wins at 341, 194, and 70 players (only the first
 * two clear the 150-player floor). The boost from a 341-player win
 * with 1.85 % online share, 8 days old, would be ~0.31 pp — a small
 * but non-zero nudge stacking on top of the +0.87 pp Predictor 4.6
 * brought from Campinas. Combined they get Hydrapple very close to
 * its actual Indianapolis 6.45 %.
 *
 * The mirrors below stay in lockstep with the production constants
 * in js/app-meta-call.js (search "PREDICTOR_4_7_"). Constants-sanity
 * tests at the end of the file lock the relationships between
 * Predictor 4.6 and 4.7 (4.7 is a SMALLER signal — cap < 4.6's cap).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const P47 = {
    MAX_SHARE_PCT:      5.0,
    MIN_PLAYERS:        150,
    FULL_DECAY_DAYS:    7,
    ZERO_DECAY_DAYS:    21,
    BOOST_PP_MAX:       1.0,
};
const P46 = {
    BOOST_PP_MAX:       2.5,
};

function p47Boost({ onlineShare, players, ageDays }) {
    if (onlineShare >= P47.MAX_SHARE_PCT) return 0;
    if (players < P47.MIN_PLAYERS)        return 0;
    let freshness = 0;
    if (ageDays <= P47.FULL_DECAY_DAYS) {
        freshness = 1.0;
    } else if (ageDays < P47.ZERO_DECAY_DAYS) {
        freshness = 1.0 - (ageDays - P47.FULL_DECAY_DAYS) /
                     (P47.ZERO_DECAY_DAYS - P47.FULL_DECAY_DAYS);
    }
    const underrated = Math.max(0, (P47.MAX_SHARE_PCT - onlineShare) / P47.MAX_SHARE_PCT);
    const sizeMult = Math.min(2.0, Math.sqrt(players / P47.MIN_PLAYERS));
    return P47.BOOST_PP_MAX * freshness * underrated * sizeMult * 0.5;
}

// ── Trigger conditions ──────────────────────────────────────────

describe('Predictor 4.7 — eligibility gates', () => {
    it('Online share at or above the cutoff produces no boost', () => {
        // 5.5 % > 5.0 % cutoff → deck is no longer "underrated".
        assert.strictEqual(p47Boost({ onlineShare: 5.5, players: 300, ageDays: 3 }), 0);
        // Boundary: exactly at the cutoff → still no boost.
        assert.strictEqual(p47Boost({ onlineShare: P47.MAX_SHARE_PCT, players: 300, ageDays: 3 }), 0);
    });

    it('Tournaments below the player-size floor produce no boost', () => {
        // 70-player event (the third Hydrapple win in the post-mortem)
        // is below the 150 floor — too noisy to count.
        assert.strictEqual(p47Boost({ onlineShare: 2.0, players: 70, ageDays: 3 }), 0);
        // Boundary: exactly at the floor → fires.
        assert.ok(p47Boost({ onlineShare: 2.0, players: P47.MIN_PLAYERS, ageDays: 0 }) > 0);
    });

    it('Stale wins (older than ZERO_DECAY_DAYS) produce no boost', () => {
        assert.strictEqual(p47Boost({ onlineShare: 2.0, players: 200, ageDays: 22 }), 0);
        assert.strictEqual(p47Boost({ onlineShare: 2.0, players: 200, ageDays: 60 }), 0);
    });
});

// ── Numeric anchors ────────────────────────────────────────────

describe('Predictor 4.7 — numeric anchors against real wins', () => {
    it('Hydrapple 341-player win, 8 days ago, online 1.85 %', () => {
        // The Championships-of-Doom-VIII case from the Indy post-mortem.
        //   freshness  = 1.0 - (8 - 7) / (21 - 7)   = 0.929
        //   underrated = (5.0 - 1.85) / 5.0          = 0.63
        //   sizeMult   = min(2.0, sqrt(341/150))     = sqrt(2.273) = 1.508
        //   bonus      = 1.0 × 0.929 × 0.63 × 1.508 × 0.5
        //              = 0.4413
        const boost = p47Boost({ onlineShare: 1.85, players: 341, ageDays: 8 });
        assert.ok(Math.abs(boost - 0.441) < 0.01,
            `expected ~0.44 pp, got ${boost.toFixed(3)}`);
    });

    it('150-player event, fresh, very-underrated → ~0.5 pp', () => {
        // Minimum-size event, today's win, deck at 0 % online.
        //   sizeMult   = sqrt(150/150) = 1.0
        //   underrated = 1.0
        //   freshness  = 1.0
        //   bonus      = 1.0 × 1.0 × 1.0 × 1.0 × 0.5 = 0.5 pp
        const boost = p47Boost({ onlineShare: 0, players: 150, ageDays: 0 });
        assert.ok(Math.abs(boost - 0.5) < 1e-9);
    });

    it('Large-event size multiplier caps at 2.0× → max effective boost = 1.0 pp', () => {
        // 600-player event = sqrt(4) = 2.0× exactly. Above that, still 2.0×.
        const small  = p47Boost({ onlineShare: 0, players: 600, ageDays: 0 });
        const huge   = p47Boost({ onlineShare: 0, players: 6000, ageDays: 0 });
        assert.ok(Math.abs(small - 1.0) < 1e-9);
        assert.strictEqual(small, huge);
    });

    it('Hard cap at BOOST_PP_MAX = 1.0 pp under any single-source extreme', () => {
        // All multipliers maxed → bonus = 1.0 × 1.0 × 1.0 × 2.0 × 0.5 = 1.0 pp.
        const boost = p47Boost({ onlineShare: 0, players: 1000, ageDays: 0 });
        assert.ok(boost <= P47.BOOST_PP_MAX + 1e-9);
    });
});

// ── Decay math ──────────────────────────────────────────────────

describe('Predictor 4.7 — freshness decay curve', () => {
    it('Day 0..7 → full freshness 1.0 (no decay)', () => {
        const a = p47Boost({ onlineShare: 2.0, players: 200, ageDays: 0 });
        const b = p47Boost({ onlineShare: 2.0, players: 200, ageDays: 5 });
        const c = p47Boost({ onlineShare: 2.0, players: 200, ageDays: 7 });
        assert.ok(Math.abs(a - b) < 1e-9);
        assert.ok(Math.abs(b - c) < 1e-9);
    });

    it('Day 14 → freshness halved (7 days into the 14-day decay)', () => {
        const day14 = p47Boost({ onlineShare: 2.0, players: 200, ageDays: 14 });
        const day7  = p47Boost({ onlineShare: 2.0, players: 200, ageDays: 7  });
        assert.ok(Math.abs(day14 - day7 * 0.5) < 1e-9);
    });

    it('Strictly monotonic decay in [7, 21] days', () => {
        const ages = [7, 9, 12, 14, 18, 20, 21];
        let prev = Infinity;
        for (const a of ages) {
            const b = p47Boost({ onlineShare: 2.0, players: 200, ageDays: a });
            assert.ok(b <= prev + 1e-9, `boost should decay monotonically; age=${a} broke order`);
            prev = b;
        }
    });
});

// ── Inter-predictor invariants ────────────────────────────────

describe('Predictor 4.7 stays SMALLER than 4.6 (online wins < regional wins)', () => {
    it('Maximum possible 4.7 boost is at most 40 % of maximum 4.6 boost', () => {
        // The post-mortem's framing: online wins are a leading
        // indicator but a regional win is "the strongest single
        // predictor". The cap ratio bakes that hierarchy in.
        assert.ok(P47.BOOST_PP_MAX <= 0.4 * P46.BOOST_PP_MAX + 1e-9,
            `P4.7 cap ${P47.BOOST_PP_MAX} too large vs P4.6 cap ${P46.BOOST_PP_MAX}`);
    });

    it('Freshness window is TIGHTER than 4.6 (online events more frequent)', () => {
        // Online tournaments happen weekly+; a 14-day "full strength"
        // window from 4.6 would over-count online wins. 7/21 reflects
        // the higher cadence.
        const P46_FULL_DECAY_DAYS = 14;
        const P46_ZERO_DECAY_DAYS = 28;
        assert.ok(P47.FULL_DECAY_DAYS < P46_FULL_DECAY_DAYS);
        assert.ok(P47.ZERO_DECAY_DAYS < P46_ZERO_DECAY_DAYS);
    });

    it('Underdog ceiling is WIDER than 4.6 (more decks count as online-underrated)', () => {
        // 5.0 % vs 4.6 %'s 4.0 % — an extra 1 pp of online share
        // catches mid-tier decks that have a meaningful online
        // presence but no in-person breakthrough yet.
        const P46_MAX_SHARE_PCT = 4.0;
        assert.ok(P47.MAX_SHARE_PCT > P46_MAX_SHARE_PCT);
    });
});
