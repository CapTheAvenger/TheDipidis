/**
 * Unit tests for the Current Meta tier-list composite score.
 *
 * Background — bug raised by the user on 2026-06-14:
 *   Mega Greninja (6 % share, 44 % WR) ended up in Tier 1 of
 *   "Current Meta · Global". Pre-fix `renderCurrentMetaTierList`
 *   sorted decks by share alone, so popularity-with-a-losing-WR
 *   still ranked above stronger but less-played decks.
 *
 *   User constraints on the fix:
 *     1. Labs tournament data must dominate the score when present.
 *     2. Pure winrate is also wrong (a deck with 5 games at 100 %
 *        WR shouldn't sit at the top either).
 *     3. Otherwise: sensible mix of share + winrate.
 *
 * The fix lives in js/app-tier-meta.js → computeTierScore().
 * These tests mirror that pure function in isolation so changes
 * to the weights / shrinkage / labs branch are observable and
 * regression-safe.
 *
 * Keep MUST stay in lockstep with js/app-tier-meta.js — search
 * "computeTierScore" there.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Production mirror — keep in lockstep with app-tier-meta.js ──

function computeTierScore(deck, labsByName) {
    const share = Math.max(0, Number(deck.share) || 0);
    const rawWR = Math.max(0, Number(deck.winrate) || 0);
    const games = Math.max(0, Number(deck.new_count) || 0);

    const PRIOR_GAMES = 50;
    const wins = games * (rawWR / 100);
    const adjWR = games > 0
        ? (wins + PRIOR_GAMES * 0.5) / (games + PRIOR_GAMES) * 100
        : 50;

    const shareComp = Math.min(share, 15) * 0.6;
    const wrComp = Math.max(0, Math.min(adjWR - 50, 10)) * 0.8;

    let labsComp = 0;
    let labsHit = false;
    if (labsByName && deck.archetype) {
        const ent = labsByName[deck.archetype]
                 || labsByName[String(deck.archetype).trim()];
        if (ent && ent.games >= 15) {
            labsHit = true;
            const labsWRComp = Math.max(0, Math.min((ent.winPct || 0) - 50, 12)) * 1.5;
            const day2Comp = Math.max(0, Math.min(ent.day2Conv || 0, 0.4)) * 8;
            labsComp = labsWRComp + day2Comp;
        }
    }
    return {
        score: shareComp + wrComp + labsComp,
        adjWR, labsHit, shareComp, wrComp, labsComp,
    };
}

function aggregateLabsRowsByDeck(rows) {
    const byName = new Map();
    for (const r of (rows || [])) {
        const name = String(r.deck_name || '').trim();
        if (!name) continue;
        const wins = parseFloat(r.wins || 0) || 0;
        const losses = parseFloat(r.losses || 0) || 0;
        const ties = parseFloat(r.ties || 0) || 0;
        const players = parseInt(r.player_count || 0, 10) || 0;
        const day1 = parseInt(r.day1_players || 0, 10) || 0;
        const day2 = parseInt(r.day2_players || 0, 10) || 0;
        const tid = String(r.tournament_id || '').trim();
        if (!byName.has(name)) {
            byName.set(name, { wins:0, losses:0, ties:0, players:0,
                               day1:0, day2:0, tournaments: new Set() });
        }
        const e = byName.get(name);
        e.wins += wins; e.losses += losses; e.ties += ties;
        e.players += players; e.day1 += day1; e.day2 += day2;
        if (tid) e.tournaments.add(tid);
    }
    const out = {};
    for (const [name, e] of byName) {
        const games = e.wins + e.losses + e.ties;
        const winPct = games > 0 ? (e.wins + 0.5 * e.ties) / games * 100 : 0;
        const day2Conv = e.day1 > 0 ? e.day2 / e.day1 : 0;
        out[name] = { games, winPct, day2Conv,
                      players: e.players, tournaments: e.tournaments.size };
    }
    return out;
}

// ── User-flagged regression: Mega Greninja must NOT outrank Dragapult ──

describe('computeTierScore — user-reported Tier 1 regression', () => {
    // Numbers come from the 2026-06-14 screenshot the user posted.
    const dragapult = { archetype: 'Dragapult', share: 9, winrate: 53, new_count: 1271 };
    const megaGreninja = { archetype: 'Mega Greninja', share: 6, winrate: 44, new_count: 376 };
    const slowking = { archetype: 'Slowking', share: 5, winrate: 51, new_count: 314 };
    const beedrill = { archetype: 'Beedrill', share: 4, winrate: 48, new_count: 251 };

    it('Dragapult (9% / 53% WR) beats Mega Greninja (6% / 44% WR)', () => {
        const dScore = computeTierScore(dragapult, null).score;
        const mScore = computeTierScore(megaGreninja, null).score;
        assert.ok(dScore > mScore,
            `expected Dragapult ${dScore.toFixed(2)} > MGreninja ${mScore.toFixed(2)}`);
    });

    it('Slowking (5% / 51% WR) outranks Mega Greninja (6% / 44% WR)', () => {
        // Direct contradiction with share-only sort. This is the
        // visible difference the user wants on the tier list.
        const sScore = computeTierScore(slowking, null).score;
        const mScore = computeTierScore(megaGreninja, null).score;
        assert.ok(sScore > mScore,
            `expected Slowking ${sScore.toFixed(2)} > MGreninja ${mScore.toFixed(2)}`);
    });

    it('Mega Greninja adjusted WR stays under the Tier 1 floor (49 %)', () => {
        // Without this, even the new sort would still let Mega Greninja
        // qualify for Tier 1 — the floor is the second half of the fix.
        const { adjWR } = computeTierScore(megaGreninja, null);
        assert.ok(adjWR < 49,
            `expected adjWR < 49, got ${adjWR.toFixed(2)}`);
    });

    it('Dragapult adjusted WR clears the floor', () => {
        const { adjWR } = computeTierScore(dragapult, null);
        assert.ok(adjWR >= 49, `expected adjWR ≥ 49, got ${adjWR.toFixed(2)}`);
    });

    it('Mega Greninja adjWR ≈ raw 44 % (large sample, prior barely shifts it)', () => {
        // 376-game prior at 30 games barely moves the number.
        const { adjWR } = computeTierScore(megaGreninja, null);
        assert.ok(Math.abs(adjWR - 44) < 1.5,
            `expected adjWR near 44, got ${adjWR.toFixed(2)}`);
    });

    it('beedrill stays out of Tier 1 quality range (48 % WR)', () => {
        const { adjWR } = computeTierScore(beedrill, null);
        assert.ok(adjWR < 49, `expected adjWR < 49, got ${adjWR.toFixed(2)}`);
    });
});

// ── Small-sample protection (5 games / 100 % WR) ──

describe('computeTierScore — Bayesian shrinkage on tiny samples', () => {
    it('5 games at 100 % WR shrinks to ~54.5 %, NOT 100 %', () => {
        // User: "ein Deck was nur 5x zu nem Turnier geht und alle
        // gewinnt hätte ne winrate von 100 aber deswegen ist es ja
        // kein Tier 1 Deck". Prior is 50 games at 50 % WR —
        // (5 + 25) / (5 + 50) ≈ 54.5 %.
        const tiny = { archetype: 'X', share: 0.3, winrate: 100, new_count: 5 };
        const { adjWR } = computeTierScore(tiny, null);
        assert.ok(adjWR > 53 && adjWR < 56,
            `expected ~54.5 %, got ${adjWR.toFixed(2)}`);
    });

    it('0 games defaults to 50 % adjusted WR', () => {
        const empty = { archetype: 'X', share: 0, winrate: 0, new_count: 0 };
        assert.strictEqual(computeTierScore(empty, null).adjWR, 50);
    });

    it('1000 games at 60 % WR barely budges from raw (~59.5 %)', () => {
        const big = { archetype: 'X', share: 5, winrate: 60, new_count: 1000 };
        const { adjWR } = computeTierScore(big, null);
        assert.ok(adjWR > 59 && adjWR < 60.5,
            `expected ~59.5, got ${adjWR.toFixed(2)}`);
    });

    it('tiny-sample 100 % WR deck score < established 7 %-share / 52 %-WR deck', () => {
        // 0.3 % share is too small to overcome a real Tier-1 candidate
        // even with the shrunk WR bonus.
        const tiny = { archetype: 'X', share: 0.3, winrate: 100, new_count: 5 };
        const big = { archetype: 'Y', share: 7, winrate: 52, new_count: 800 };
        assert.ok(computeTierScore(big, null).score > computeTierScore(tiny, null).score);
    });
});

// ── Labs branch: tournament data dominates online play data ──

describe('computeTierScore — labs branch (highest impact when present)', () => {
    const labsHero = {
        'HeroDeck': { games: 100, winPct: 60, day2Conv: 0.35, players: 80, tournaments: 4 },
    };
    const labsWeak = {
        'WeakDeck': { games: 100, winPct: 42, day2Conv: 0.05, players: 80, tournaments: 4 },
    };

    it('labs hit lifts a low-share / decent-WR deck above a high-share / weak-WR one', () => {
        // Without labs: HighShare wins by 2.4 (share component).
        // With labs:    HeroDeck's +10 WR over 50 * 1.5 = 15 lifts it.
        const heroDeck = { archetype: 'HeroDeck', share: 3, winrate: 51, new_count: 200 };
        const highShare = { archetype: 'PopularLoser', share: 6, winrate: 47, new_count: 400 };
        const heroScore = computeTierScore(heroDeck, labsHero).score;
        const popScore = computeTierScore(highShare, labsHero).score;
        assert.ok(heroScore > popScore,
            `labs-validated hero ${heroScore.toFixed(2)} should beat popular loser ${popScore.toFixed(2)}`);
    });

    it('labs entry below 15 games is ignored (sample-size gate)', () => {
        const sparseLabs = {
            'SparseDeck': { games: 8, winPct: 100, day2Conv: 1, players: 8, tournaments: 1 },
        };
        const deck = { archetype: 'SparseDeck', share: 1, winrate: 50, new_count: 50 };
        const out = computeTierScore(deck, sparseLabs);
        assert.strictEqual(out.labsHit, false);
        assert.strictEqual(out.labsComp, 0);
    });

    it('labs winrate above 50 actively contributes (sign check)', () => {
        const deck = { archetype: 'HeroDeck', share: 3, winrate: 50, new_count: 200 };
        const withLabs = computeTierScore(deck, labsHero);
        const without = computeTierScore(deck, null);
        assert.ok(withLabs.score > without.score,
            `expected labs-WR to add to score, got with=${withLabs.score} without=${without.score}`);
    });

    it('labs WR < 50 does NOT subtract — floor keeps things stable', () => {
        // Negative WR contribution would risk pulling decks with
        // a single bad tournament below decks with no labs data
        // at all — that's the wrong direction. Cap at 0.
        const deck = { archetype: 'WeakDeck', share: 3, winrate: 51, new_count: 200 };
        const out = computeTierScore(deck, labsWeak);
        assert.strictEqual(out.labsHit, true);
        // labsComp = 0 (WR < 50) + day2Comp (0.05 * 8 = 0.4)
        assert.ok(out.labsComp >= 0 && out.labsComp < 1,
            `expected near-0 labs contribution, got ${out.labsComp.toFixed(2)}`);
    });

    it('day-2 conversion bonus is bounded (≤ 0.4 cap)', () => {
        const extremeLabs = {
            'X': { games: 100, winPct: 50, day2Conv: 5.0, players: 80, tournaments: 4 },
        };
        const deck = { archetype: 'X', share: 0, winrate: 50, new_count: 0 };
        const out = computeTierScore(deck, extremeLabs);
        // day2Comp capped at 0.4 * 8 = 3.2
        assert.ok(out.labsComp <= 3.2 + 0.001,
            `day2Conv cap violated: ${out.labsComp.toFixed(2)}`);
    });

    it('labs WR contribution capped at +12 pp (no infinite WR exploits)', () => {
        const monsterLabs = {
            'X': { games: 100, winPct: 100, day2Conv: 0, players: 80, tournaments: 4 },
        };
        const deck = { archetype: 'X', share: 0, winrate: 50, new_count: 0 };
        const out = computeTierScore(deck, monsterLabs);
        // labsWRComp capped at 12 * 1.5 = 18
        assert.ok(out.labsComp <= 18 + 0.001,
            `labs WR cap violated: ${out.labsComp.toFixed(2)}`);
    });
});

// ── Bounds & edge cases ──

describe('computeTierScore — bounds & robustness', () => {
    it('negative share is clamped to 0', () => {
        const out = computeTierScore({ archetype: 'X', share: -5, winrate: 60, new_count: 100 }, null);
        assert.strictEqual(out.shareComp, 0);
    });

    it('share > 15 caps at 15 (staples stay staples)', () => {
        const a = computeTierScore({ archetype: 'X', share: 15, winrate: 50, new_count: 1000 }, null);
        const b = computeTierScore({ archetype: 'X', share: 30, winrate: 50, new_count: 1000 }, null);
        assert.strictEqual(a.shareComp, b.shareComp);
    });

    it('wrComp capped at +10 pp regardless of how absurd the raw WR climbs', () => {
        // 100 % WR pushes adjWR well above 60 even after shrinkage — the
        // hard cap protects the score from a single deck saturating the
        // ranking via WR alone.
        const wild = computeTierScore({ archetype: 'X', share: 0, winrate: 100, new_count: 10000 }, null);
        const ceiling = computeTierScore({ archetype: 'X', share: 0, winrate: 200, new_count: 10000 }, null);
        const expected = 10 * 0.8;
        assert.strictEqual(wild.wrComp, expected);
        assert.strictEqual(ceiling.wrComp, expected);
    });

    it('returns the component breakdown for UI surfacing', () => {
        const out = computeTierScore({ archetype: 'X', share: 5, winrate: 55, new_count: 200 }, null);
        assert.ok(typeof out.shareComp === 'number');
        assert.ok(typeof out.wrComp === 'number');
        assert.ok(typeof out.labsComp === 'number');
        assert.ok(typeof out.score === 'number');
        assert.ok(typeof out.adjWR === 'number');
        assert.strictEqual(typeof out.labsHit, 'boolean');
    });

    it('null deck.archetype falls back gracefully when labs map exists', () => {
        const labs = { 'HeroDeck': { games: 100, winPct: 60, day2Conv: 0.3, players: 80, tournaments: 4 } };
        const out = computeTierScore({ archetype: null, share: 3, winrate: 51, new_count: 100 }, labs);
        assert.strictEqual(out.labsHit, false);
    });

    it('empty labs map behaves like no labs map', () => {
        const a = computeTierScore({ archetype: 'X', share: 5, winrate: 55, new_count: 200 }, null);
        const b = computeTierScore({ archetype: 'X', share: 5, winrate: 55, new_count: 200 }, {});
        assert.strictEqual(a.score, b.score);
    });
});

// ── aggregateLabsRowsByDeck round-trip ──

describe('aggregateLabsRowsByDeck — labs CSV aggregation', () => {
    it('sums wins/losses/ties across tournaments for the same deck', () => {
        const rows = [
            { tournament_id: 'T1', deck_name: 'Dragapult', wins: '50', losses: '30', ties: '10', player_count: '20', day1_players: '20', day2_players: '5' },
            { tournament_id: 'T2', deck_name: 'Dragapult', wins: '40', losses: '20', ties: '5',  player_count: '15', day1_players: '15', day2_players: '4' },
        ];
        const out = aggregateLabsRowsByDeck(rows);
        const d = out['Dragapult'];
        assert.strictEqual(d.players, 35);
        // games = wins + losses + ties = (50+30+10) + (40+20+5) = 90 + 65 = 155
        assert.strictEqual(d.games, 155);
        // winPct = (50+40 + 0.5*(10+5)) / 155 = (90 + 7.5) / 155 ≈ 62.90
        assert.ok(Math.abs(d.winPct - 62.9) < 0.1, `got ${d.winPct}`);
        // day2Conv = (5+4) / (20+15) = 9/35 ≈ 0.257
        assert.ok(Math.abs(d.day2Conv - 0.257) < 0.01);
        assert.strictEqual(d.tournaments, 2);
    });

    it('ties count half (matches Limitless win_pct convention)', () => {
        const rows = [
            { tournament_id: 'T1', deck_name: 'X', wins: '0', losses: '0', ties: '10', day1_players: '5', day2_players: '0' },
        ];
        const out = aggregateLabsRowsByDeck(rows);
        // 0 wins + 5 (half of 10 ties) / 10 games = 50 %
        assert.strictEqual(out['X'].winPct, 50);
    });

    it('zero games → winPct 0 (no NaN escape)', () => {
        const rows = [
            { tournament_id: 'T1', deck_name: 'X', wins: '0', losses: '0', ties: '0', day1_players: '0', day2_players: '0' },
        ];
        const out = aggregateLabsRowsByDeck(rows);
        assert.strictEqual(out['X'].winPct, 0);
        assert.strictEqual(out['X'].day2Conv, 0);
    });

    it('blank/missing deck_name rows are skipped', () => {
        const rows = [
            { tournament_id: 'T1', deck_name: '',     wins: '50' },
            { tournament_id: 'T1', deck_name: '   ',  wins: '50' },
            { tournament_id: 'T1', deck_name: 'OK',   wins: '5', losses: '5', ties: '0' },
        ];
        const out = aggregateLabsRowsByDeck(rows);
        assert.deepStrictEqual(Object.keys(out), ['OK']);
    });

    it('empty / null input returns {}', () => {
        assert.deepStrictEqual(aggregateLabsRowsByDeck([]), {});
        assert.deepStrictEqual(aggregateLabsRowsByDeck(null), {});
    });
});
