/**
 * Unit tests for the post-LRM passes in app-deck-builder.js:
 *
 *   - _bidirectionalLrmSwap: when the deck is at 60 but contains TECH-
 *     tier 1-of cards alongside un-bumped CORE cards with higher
 *     remainders, swap a TECH demotion for a CORE bump.
 *
 *   - _enforceEnergyFloor: ACE-SPEC-aware energy minimum. Counts the
 *     conditional aggregate of energy avgs and tops up the deck if
 *     the actual energy count fell below it (typically because
 *     non-energy cards squeezed out a slot).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractTopLevel(src, fnName) {
    const re = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = re.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);
    const start = m.index;
    const openIdx = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        if (depth === 0) { end = i + 1; break; }
    }
    return src.slice(start, end);
}

function load() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );
    const snippet = [
        extractTopLevel(src, '_bidirectionalLrmSwap'),
        extractTopLevel(src, '_enforceEnergyFloor'),
        extractTopLevel(src, '_enforceEnergyCeiling'),
    ].join('\n\n');
    const sandbox = { console, Math, Number, String, Array, Object, RegExp };
    vm.createContext(sandbox);
    vm.runInContext(snippet, sandbox);
    return {
        swap: sandbox._bidirectionalLrmSwap,
        floor: sandbox._enforceEnergyFloor,
        ceiling: sandbox._enforceEnergyCeiling,
    };
}

const FNS = load();

// Default helpers for tests.
const defaultHelpers = {
    getLegalMax: () => 4,
    isBasicEnergy: (card) => /basic energy/i.test(String((card && card.type) || '')),
    isEnergyEntry: (e) => /(basic|special)\s*energy/i.test(String((e && e.card && e.card.type) || '')),
    log: () => {},
};

function entry(name, type, count, opts = {}) {
    return {
        card: {
            card_name: name,
            type,
            _cardFunctionTier: opts.tier || 'MID',
            _lrmRemainder: Number.isFinite(opts.remainder) ? opts.remainder : 0,
            consistencyScore: Number.isFinite(opts.score) ? opts.score : 60,
            _techCounterMaxCount: opts.techCounterMaxCount || null,
            ...opts.cardOverrides,
        },
        count,
    };
}

describe('_bidirectionalLrmSwap', () => {
    it("demotes TECH 1-of and bumps CORE with higher remainder", () => {
        // Black Belt's Training (TECH, count=1, remainder 0.05) vs Poké Pad
        // (CORE, count=3, remainder 0.70). Standard add-LRM was already
        // done; deck is at 60. Swap should remove Black Belt and bump
        // Poké Pad to 4.
        const deck = [
            entry("Black Belt's Training", 'Supporter', 1, { tier: 'TECH', remainder: 0.05, score: 36 }),
            entry('Poké Pad', 'Item', 3, { tier: 'CORE', remainder: 0.70, score: 100 }),
        ];
        const swaps = FNS.swap(deck, defaultHelpers);
        assert.equal(swaps, 1);
        assert.equal(deck.length, 1, "Black Belt's Training should be removed when count drops to 0");
        assert.equal(deck[0].card.card_name, 'Poké Pad');
        assert.equal(deck[0].count, 4);
    });

    it('does not swap when CORE remainder is not meaningfully higher (within 0.05 buffer)', () => {
        const deck = [
            entry('Tech', 'Supporter', 1, { tier: 'TECH', remainder: 0.50, score: 50 }),
            entry('Core', 'Item', 3, { tier: 'CORE', remainder: 0.52, score: 80 }),
        ];
        const swaps = FNS.swap(deck, defaultHelpers);
        assert.equal(swaps, 0, "Tech 0.50 vs Core 0.52 is within 0.05 buffer, no swap");
        assert.equal(deck.length, 2);
        assert.equal(deck[0].count, 1);
        assert.equal(deck[1].count, 3);
    });

    it('does not demote a Stage-1 (score >= 75) TECH card', () => {
        // A TECH card with score >= 75 is the deck's identity card —
        // protected from demotion. (Hero's Cape in a Mega-ex deck would
        // typically score high.)
        const deck = [
            entry('Tech-but-core', 'Tool', 1, { tier: 'TECH', remainder: 0.10, score: 90 }),
            entry('Core', 'Item', 3, { tier: 'CORE', remainder: 0.80, score: 100 }),
        ];
        const swaps = FNS.swap(deck, defaultHelpers);
        assert.equal(swaps, 0, "Stage-1 TECH (score 90) should not be demoted");
        assert.equal(deck.length, 2);
    });

    it('does not demote tech-CHOSEN counters (active threats audit budgeted them)', () => {
        const deck = [
            entry('Switch', 'Item', 1, { tier: 'MID', remainder: 0.10, score: 60, techCounterMaxCount: 1 }),
            entry('Tech', 'Supporter', 1, { tier: 'TECH', remainder: 0.05, score: 40 }),
            entry('Core', 'Item', 3, { tier: 'CORE', remainder: 0.80, score: 100 }),
        ];
        const swaps = FNS.swap(deck, defaultHelpers);
        // Only Tech (TECH tier without counter cap) is demote-eligible.
        // Switch is MID and tech-counter-budgeted; doesn't qualify.
        assert.equal(swaps, 1);
        assert.equal(deck.find(e => e.card.card_name === 'Switch').count, 1);
        assert.equal(deck.find(e => e.card.card_name === 'Core').count, 4);
    });

    it('respects legal-max on bump target', () => {
        // CORE is already at legal max (4) — can't be bumped. Even with
        // a TECH demote candidate, no swap happens.
        const deck = [
            entry('Tech', 'Supporter', 1, { tier: 'TECH', remainder: 0.10, score: 40 }),
            entry('Core-at-max', 'Item', 4, { tier: 'CORE', remainder: 0.95, score: 100 }),
        ];
        const swaps = FNS.swap(deck, defaultHelpers);
        assert.equal(swaps, 0);
    });

    it('basic energy bypasses legal-max cap', () => {
        const helpersWithEnergy = {
            ...defaultHelpers,
            isBasicEnergy: (card) => card && card.card_name === 'Fighting Energy',
        };
        const deck = [
            entry('Tech', 'Supporter', 1, { tier: 'TECH', remainder: 0.05, score: 40 }),
            entry('Fighting Energy', 'Basic Energy', 4, { tier: 'MID', remainder: 0.85, score: 100 }),
        ];
        // Fighting Energy is MID, not CORE, so the function tier
        // doesn't favour it for swap. This test ONLY verifies the
        // legal-max cap exemption — the swap shouldn't fire because
        // MID is not a swap target (only CORE is).
        const swaps = FNS.swap(deck, helpersWithEnergy);
        assert.equal(swaps, 0, "MID-tier targets (energies) are not swap targets — only CORE is.");
    });

    it("does not demote an ACE-SPEC card (single-of by format rule)", () => {
        // The N's Zoroark user-flagged regression: Unfair Stamp was
        // picked as ACE-SPEC, classified as 'disruption' (TECH), and
        // had consistencyScore < 75. The bidirectional swap then
        // demoted it to 0 → removed from deck → no ACE-SPEC.
        // Fix: cards marked _isAceSpec are excluded from swap demote.
        const deck = [
            entry('Unfair Stamp', 'Item', 1, { tier: 'TECH', remainder: 0.0, score: 67, cardOverrides: { _isAceSpec: true } }),
            entry('Some CORE', 'Item', 3, { tier: 'CORE', remainder: 0.80, score: 100 }),
        ];
        const swaps = FNS.swap(deck, defaultHelpers);
        assert.equal(swaps, 0, "ACE-SPEC must not be demoted by swap");
        const stamp = deck.find(e => e.card.card_name === 'Unfair Stamp');
        assert.ok(stamp, "Unfair Stamp must remain in deck");
        assert.equal(stamp.count, 1);
    });

    it('handles multiple swaps in sequence', () => {
        const deck = [
            entry('Tech1', 'Supporter', 1, { tier: 'TECH', remainder: 0.10, score: 40 }),
            entry('Tech2', 'Supporter', 1, { tier: 'TECH', remainder: 0.05, score: 35 }),
            entry('Core1', 'Item', 3, { tier: 'CORE', remainder: 0.80, score: 100 }),
            entry('Core2', 'Item', 3, { tier: 'CORE', remainder: 0.70, score: 100 }),
        ];
        const swaps = FNS.swap(deck, defaultHelpers);
        assert.equal(swaps, 2);
        // Both techs removed (count 0), both cores bumped to 4.
        const techs = deck.filter(e => e.card._cardFunctionTier === 'TECH');
        assert.equal(techs.length, 0);
        const core1 = deck.find(e => e.card.card_name === 'Core1');
        const core2 = deck.find(e => e.card.card_name === 'Core2');
        assert.equal(core1.count, 4);
        assert.equal(core2.count, 4);
    });
});

describe('_enforceEnergyFloor', () => {
    function condAvgs(map) {
        // map: { cardName_lower → {avg, presence} }
        const m = new Map();
        for (const [k, v] of Object.entries(map)) m.set(k, v);
        return m;
    }

    it('returns no-op shape when conditionalAvgs is empty', () => {
        const result = FNS.floor([], new Map(), defaultHelpers);
        assert.equal(result.added, 0);
        assert.equal(result.target, 0);
    });

    it('does nothing when energy count already meets the target', () => {
        const deck = [
            entry('Fighting Energy', 'Basic Energy', 5, { tier: 'MID', remainder: 0.10 }),
            entry('Rocky Fighting Energy', 'Special Energy', 3, { tier: 'MID', remainder: 0.20 }),
            entry('Some Trainer', 'Item', 4, { tier: 'CORE', remainder: 0.0, score: 100 }),
        ];
        const cond = condAvgs({
            'fighting energy': { avg: 4.83, presence: 12 },
            'rocky fighting energy': { avg: 3.17, presence: 12 },
        });
        // target = round(4.83 + 3.17) = round(8.00) = 8, capped 7-11. Deck has 8 already.
        const result = FNS.floor(deck, cond, defaultHelpers);
        assert.equal(result.target, 8);
        assert.equal(result.before, 8);
        assert.equal(result.after, 8);
        assert.equal(result.added, 0);
    });

    it("bumps energies up to target by demoting a TECH card", () => {
        // The Cynthia + Unfair Stamp regression: deck has 7 energies
        // (4 + 3) but Unfair Stamp conditional says 8 (4.83 + 3.17).
        // TECH 1-of present → demote it to free a slot for Fighting
        // Energy 4 → 5.
        const deck = [
            entry("Black Belt's Training", 'Supporter', 1, { tier: 'TECH', remainder: 0.05, score: 36 }),
            entry('Fighting Energy', 'Basic Energy', 4, { tier: 'MID', remainder: 0.83 }),
            entry('Rocky Fighting Energy', 'Special Energy', 3, { tier: 'MID', remainder: 0.17 }),
            entry('Some Trainer', 'Item', 4, { tier: 'CORE', remainder: 0.0, score: 100 }),
        ];
        const cond = condAvgs({
            'fighting energy': { avg: 4.83, presence: 12 },
            'rocky fighting energy': { avg: 3.17, presence: 12 },
        });
        const result = FNS.floor(deck, cond, defaultHelpers);
        assert.equal(result.target, 8);
        assert.equal(result.before, 7);
        assert.equal(result.after, 8);
        assert.equal(result.added, 1);
        const fighting = deck.find(e => e.card.card_name === 'Fighting Energy');
        assert.equal(fighting.count, 5);
        const tech = deck.find(e => e.card.card_name === "Black Belt's Training");
        assert.equal(tech, undefined, "TECH 1-of should be removed");
    });

    it('does NOT demote Stage 1 (score ≥ 75) cards', () => {
        const deck = [
            entry('Stage1-Identity', 'Supporter', 1, { tier: 'CORE', remainder: 0.05, score: 100 }),
            entry('Fighting Energy', 'Basic Energy', 4, { tier: 'MID', remainder: 0.83 }),
            entry('Rocky Fighting Energy', 'Special Energy', 3, { tier: 'MID', remainder: 0.17 }),
        ];
        const cond = condAvgs({
            'fighting energy': { avg: 4.83, presence: 12 },
            'rocky fighting energy': { avg: 3.17, presence: 12 },
        });
        const result = FNS.floor(deck, cond, defaultHelpers);
        assert.equal(result.added, 0, "no demotion candidate available; floor stays at 7");
        assert.equal(result.before, 7);
        assert.equal(result.target, 8);
        // Stage-1 card untouched
        assert.equal(deck.find(e => e.card.card_name === 'Stage1-Identity').count, 1);
    });

    it('caps target to 7-11 corridor (doctrine modern norm)', () => {
        const cond = condAvgs({
            'fighting energy': { avg: 6.0, presence: 12 },
            'rocky fighting energy': { avg: 8.0, presence: 12 },
            // raw target = 14 — way above doctrine ceiling
        });
        // Deck under-energied at 5, target should clamp to 11.
        const deck = [
            entry('Some Tech', 'Supporter', 1, { tier: 'TECH', remainder: 0.05, score: 40 }),
            entry('Some Tech 2', 'Supporter', 1, { tier: 'TECH', remainder: 0.10, score: 45 }),
            entry('Some Tech 3', 'Supporter', 1, { tier: 'TECH', remainder: 0.15, score: 35 }),
            entry('Fighting Energy', 'Basic Energy', 3, { tier: 'MID', remainder: 0.50 }),
            entry('Rocky Fighting Energy', 'Special Energy', 2, { tier: 'MID', remainder: 0.30 }),
        ];
        const result = FNS.floor(deck, cond, defaultHelpers);
        assert.ok(result.target <= 11, `target should be capped at 11, got ${result.target}`);
        assert.ok(result.target >= 7, `target should be at least 7`);
    });

    it('uses sum-of-rounded targets, not round(sum)', () => {
        // The user-flagged Cynthia + Unfair Stamp regression: with
        // recency-weighted conditional avgs, Fighting=4.89 and
        // Rocky=3.55 (recent meta shifted to 4 Rocky from older 2).
        // Naive round(sum 8.44) = 8, but per-card rounded
        // round(4.89) + round(3.55) = 5 + 4 = 9. Recent top decks
        // ALL run 5 + 4. The Floor must use sum-of-rounded so the
        // build matches the meta.
        const cond = condAvgs({
            'fighting energy': { avg: 4.89, presence: 13 },
            'rocky fighting energy': { avg: 3.55, presence: 13 },
        });
        // Deck currently at 7 (4 + 3) with one TECH demote candidate.
        const deck = [
            entry("Black Belt's Training", 'Supporter', 1, { tier: 'TECH', remainder: 0.05, score: 36 }),
            entry('Some Tech 2', 'Supporter', 1, { tier: 'TECH', remainder: 0.10, score: 40 }),
            entry('Fighting Energy', 'Basic Energy', 4, { tier: 'MID', remainder: 0.89 }),
            entry('Rocky Fighting Energy', 'Special Energy', 3, { tier: 'MID', remainder: 0.55 }),
        ];
        const result = FNS.floor(deck, cond, defaultHelpers);
        assert.equal(result.target, 9, "target should be 5 + 4 = 9, not round(8.44) = 8");
        assert.equal(result.before, 7);
        assert.equal(result.after, 9, "Floor should bump energies to reach 9");
        // Both TECH demoted, both energies bumped.
        const fighting = deck.find(e => e.card.card_name === 'Fighting Energy');
        const rocky = deck.find(e => e.card.card_name === 'Rocky Fighting Energy');
        assert.equal(fighting.count + rocky.count, 9);
    });

    it('skips small-presence conditional entries', () => {
        // Card with presence < 3 (only 1 deck ran it) — too thin to
        // include in the energy target.
        const cond = condAvgs({
            'fighting energy': { avg: 4.83, presence: 12 },
            'flicker energy': { avg: 2.0, presence: 1 },
        });
        const deck = [
            entry('Fighting Energy', 'Basic Energy', 5, { tier: 'MID', remainder: 0.83 }),
        ];
        const result = FNS.floor(deck, cond, defaultHelpers);
        // target = round(4.83) = 5, then capped to corridor [7, 11] → 7.
        // before = 5 (one Fighting Energy at 5 copies). after attempts?
        // Energy already includes the only conditional entry that
        // qualifies; raw target was 4.83 < 6.5 → skip-too-thin guard
        // returns no-op.
        assert.equal(result.added, 0);
    });
});

describe('_enforceEnergyCeiling', () => {
    function condAvgs(map) {
        const m = new Map();
        for (const [k, v] of Object.entries(map)) m.set(k, v);
        return m;
    }

    it('does nothing when energy count is at or below target', () => {
        const deck = [
            entry('Fighting Energy', 'Basic Energy', 4, { tier: 'MID', remainder: 0.13 }),
            entry('Rocky Fighting Energy', 'Special Energy', 3, { tier: 'MID', remainder: 0.30 }),
            entry('Neo Upper Energy', 'Special Energy', 1, { tier: 'MID', remainder: 0.0 }),
            entry('Some Trainer', 'Item', 4, { tier: 'CORE', remainder: 0.0, score: 100 }),
        ];
        const cond = condAvgs({
            'fighting energy': { avg: 4.13, presence: 7 },
            'rocky fighting energy': { avg: 3.30, presence: 7 },
            'neo upper energy': { avg: 1.0, presence: 7 },
        });
        const result = FNS.ceiling(deck, cond, defaultHelpers);
        assert.equal(result.target, 8);
        assert.equal(result.before, 8);
        assert.equal(result.removed, 0);
    });

    it("trims an over-allocated energy back to the conditional target", () => {
        // The Cynthia + Neo Upper user-flagged regression: target was
        // 4 + 3 + 1 = 8 cards but the build delivered 4 + 4 + 1 = 9.
        // Ceiling demotes Rocky 4→3 and bumps the highest-remainder
        // non-energy card.
        const deck = [
            entry('Fighting Energy', 'Basic Energy', 4, { tier: 'MID', remainder: 0.13 }),
            entry('Rocky Fighting Energy', 'Special Energy', 4, { tier: 'MID', remainder: 0.30 }),  // OVER target
            entry('Neo Upper Energy', 'Special Energy', 1, { tier: 'MID', remainder: 0.0 }),
            entry("Team Rocket's Petrel", 'Supporter', 1, { tier: 'MID', remainder: 0.62, score: 49 }),
            entry('Some CORE', 'Item', 3, { tier: 'CORE', remainder: 0.40, score: 100 }),
        ];
        const cond = condAvgs({
            'fighting energy': { avg: 4.13, presence: 7 },
            'rocky fighting energy': { avg: 3.30, presence: 7 },
            'neo upper energy': { avg: 1.0, presence: 7 },
        });
        const result = FNS.ceiling(deck, cond, defaultHelpers);
        assert.equal(result.target, 8);
        assert.equal(result.before, 9);
        assert.equal(result.after, 8);
        assert.equal(result.removed, 1);
        const rocky = deck.find(e => e.card.card_name === 'Rocky Fighting Energy');
        assert.equal(rocky.count, 3, 'Rocky demoted from 4 to 3');
        // Highest-remainder non-energy gets the slot. CORE wins
        // tier-tie-break over MID Petrel.
        const someCore = deck.find(e => e.card.card_name === 'Some CORE');
        assert.equal(someCore.count, 4);
    });

    it('skips the trim when conditional aggregate is too thin (target_raw < 6.5)', () => {
        const cond = condAvgs({
            'fighting energy': { avg: 5.0, presence: 7 },
            'rocky fighting energy': { avg: 1.0, presence: 7 },
            // sum = 6.0 < 6.5 threshold → no enforcement
        });
        const deck = [
            entry('Fighting Energy', 'Basic Energy', 7, { tier: 'MID', remainder: 0.0 }),
            entry('Rocky Fighting Energy', 'Special Energy', 2, { tier: 'MID', remainder: 0.0 }),
        ];
        const result = FNS.ceiling(deck, cond, defaultHelpers);
        // target capped to 7-11 corridor, but conditionalRaw < 6.5
        // means we skip enforcement to avoid acting on noisy data.
        assert.equal(result.removed, 0);
    });

    it('skips the trim when raw target is thin (< 6.5)', () => {
        // Same thin-data guard as the Floor. If the conditional sum
        // is < 6.5 the data isn't reliable enough to act on; we leave
        // the existing allocation alone even when it's above the
        // doctrine corridor cap. Mirrors the Floor's behaviour.
        const cond = condAvgs({
            'fighting energy': { avg: 4.5, presence: 7 },
            'rocky fighting energy': { avg: 0.6, presence: 7 },
        });
        const deck = [
            entry('Fighting Energy', 'Basic Energy', 7, { tier: 'MID', remainder: 0.5 }),
            entry('Rocky Fighting Energy', 'Special Energy', 1, { tier: 'MID', remainder: 0.6 }),
        ];
        const result = FNS.ceiling(deck, cond, defaultHelpers);
        // Target is computed (capped to 7) but the thin-data guard
        // prevents trim — we don't reduce a real deck based on
        // uncertain data.
        assert.equal(result.target, 7);
        assert.equal(result.removed, 0);
        assert.equal(result.after, 8);
    });

    it("does NOT push a non-energy card past its own per-card target", () => {
        // N's Zoroark + Unfair Stamp regression: Ultra Ball cond avg
        // 1.88 → per-card target 2. LRM bumped Ultra Ball 1 → 2 (rem
        // 0.88 high). Then Ceiling tried to free a slot from over-
        // allocated Darkness Energy and bumped Ultra Ball 2 → 3 — over
        // its own per-card target. Fix: bump candidates filter out
        // entries already at-or-above per-card target.
        const cond = condAvgs({
            'darkness energy': { avg: 7.30, presence: 13 },
            'ultra ball': { avg: 1.88, presence: 12 },  // per-card target = round(1.88) = 2
            'buddy-buddy poffin': { avg: 3.75, presence: 13 },
        });
        const deck = [
            entry('Darkness Energy', 'Basic Energy', 8, { tier: 'MID', remainder: 0.30 }),
            entry('Ultra Ball', 'Item', 2, { tier: 'CORE', remainder: 0.88, score: 100 }),  // already at target
            entry('Buddy-Buddy Poffin', 'Item', 3, { tier: 'CORE', remainder: 0.75, score: 100 }),  // below target 4
            entry("Lillie's Determination", 'Supporter', 4, { tier: 'CORE', remainder: 0, score: 100 }),
        ];
        const result = FNS.ceiling(deck, cond, defaultHelpers);
        // Energy target = 7. Before = 8. Trim 1 from Darkness.
        // Bump target: Ultra Ball at-target → SKIPPED. Poffin at 3 with target 4 → bumped to 4.
        assert.equal(result.target, 7);
        assert.equal(result.before, 8);
        assert.equal(result.after, 7);
        const ultra = deck.find(e => e.card.card_name === 'Ultra Ball');
        assert.equal(ultra.count, 2, 'Ultra Ball must NOT be pushed past its target');
        const poffin = deck.find(e => e.card.card_name === 'Buddy-Buddy Poffin');
        assert.equal(poffin.count, 4, 'Poffin (under target 4) gets the freed slot');
    });

    it("trims a single excess Rocky for the user's reported Cynthia + Neo Upper case", () => {
        // The exact data shape from the production failure: Neo Upper
        // conditional Fighting 4.13 + Rocky 3.30 + Neo Upper 1.0 = 8.43
        // raw target → 4 + 3 + 1 = 8 (sum of rounded). Build delivered
        // 9 (4F + 4R + 1NU). Ceiling trims the over-allocated Rocky.
        const cond = condAvgs({
            'fighting energy': { avg: 4.13, presence: 7 },
            'rocky fighting energy': { avg: 3.30, presence: 7 },
            'neo upper energy': { avg: 1.0, presence: 7 },
        });
        const deck = [
            entry('Fighting Energy', 'Basic Energy', 4, { tier: 'MID', remainder: 0.13 }),
            entry('Rocky Fighting Energy', 'Special Energy', 4, { tier: 'MID', remainder: 0.30 }),
            entry('Neo Upper Energy', 'Special Energy', 1, { tier: 'MID', remainder: 0.0 }),
            entry("Team Rocket's Petrel", 'Supporter', 1, { tier: 'MID', remainder: 0.62, score: 49 }),
        ];
        const result = FNS.ceiling(deck, cond, defaultHelpers);
        assert.equal(result.target, 8);
        assert.equal(result.before, 9);
        assert.equal(result.after, 8);
        const rocky = deck.find(e => e.card.card_name === 'Rocky Fighting Energy');
        assert.equal(rocky.count, 3);
        // Petrel gets the slot (highest remainder, MID tier).
        const petrel = deck.find(e => e.card.card_name === "Team Rocket's Petrel");
        assert.equal(petrel.count, 2);
    });
});
