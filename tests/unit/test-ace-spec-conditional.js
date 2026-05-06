/**
 * Unit tests for _aceSpecConditionalAvgs in app-deck-builder.js.
 *
 * The helper buckets the dated CSV by (tournament_id, archetype) — each
 * bucket is one deck — and computes per-card "avg copies when used"
 * conditional on a chosen ACE-SPEC. Use case: Cynthia's Garchomp ex
 * with Neo Upper Energy runs ~4 Basic Fighting (Neo Upper substitutes
 * one energy per attack); the same archetype with Unfair Stamp instead
 * runs ~5 Basic Fighting (no substitution). Global avgs blur the two,
 * the conditional avg captures the deck-shape signal.
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
    // _aceSpecConditionalAvgs references _recencyWeight when called with
    // a todayMs argument — extract that too so the recency-weighted
    // path is exercised end-to-end in tests.
    const snippet = [
        extractTopLevel(src, '_recencyWeight'),
        extractTopLevel(src, '_aceSpecConditionalAvgs'),
    ].join('\n\n');
    const sandbox = { console, Math, Number, String, Array, Map, Object, Date };
    vm.createContext(sandbox);
    vm.runInContext(snippet, sandbox);
    return sandbox._aceSpecConditionalAvgs;
}

const aceSpecConditionalAvgs = load();

// Helper: build a row matching the dated-CSV shape the helper expects.
function row(tid, archetype, card_name, average_count) {
    return {
        tournament_id: tid,
        archetype,
        card_name,
        average_count: String(average_count).replace('.', ','),
    };
}

describe('_aceSpecConditionalAvgs', () => {
    it('returns empty when no rows match the archetype', () => {
        const rows = [
            row('t1', 'Dragapult Ex', 'Dreepy', 4),
            row('t1', 'Dragapult Ex', 'Neo Upper Energy', 1),
        ];
        const result = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'neo upper energy', null);
        assert.equal(result.bucketCount, 0);
        assert.equal(result.conditionalAvgs.size, 0);
    });

    it('returns empty when the ACE-SPEC is not present in any bucket', () => {
        const rows = [
            row('t1', "Cynthia's Garchomp", 'Fighting Energy', 4),
            row('t1', "Cynthia's Garchomp", 'Unfair Stamp', 1),
        ];
        const result = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'neo upper energy', null);
        assert.equal(result.bucketCount, 0);
    });

    it('computes per-card conditional avg averaged across matching buckets', () => {
        // Two Cynthia decks at different tournaments, both ran Neo Upper.
        // Fighting Energy: 4 in deck A, 4 in deck B → conditional 4.0.
        // Rocky Fighting: 3 in A, 3 in B → conditional 3.0.
        const rows = [
            row('t1', "Cynthia's Garchomp", 'Fighting Energy', 4),
            row('t1', "Cynthia's Garchomp", 'Rocky Fighting Energy', 3),
            row('t1', "Cynthia's Garchomp", 'Neo Upper Energy', 1),
            row('t2', "Cynthia's Garchomp", 'Fighting Energy', 4),
            row('t2', "Cynthia's Garchomp", 'Rocky Fighting Energy', 3),
            row('t2', "Cynthia's Garchomp", 'Neo Upper Energy', 1),
        ];
        const result = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'neo upper energy', null);
        assert.equal(result.bucketCount, 2);
        const fighting = result.conditionalAvgs.get('fighting energy');
        const rocky = result.conditionalAvgs.get('rocky fighting energy');
        assert.equal(fighting.avg, 4.0);
        assert.equal(fighting.presence, 2);
        assert.equal(rocky.avg, 3.0);
        assert.equal(rocky.presence, 2);
    });

    it('ignores buckets that ran a different ACE-SPEC entirely', () => {
        // Bucket t1 runs Neo Upper at 4 Fighting. Bucket t2 runs Unfair
        // Stamp at 5 Fighting. Conditional on Neo Upper should ONLY see
        // bucket t1.
        const rows = [
            row('t1', "Cynthia's Garchomp", 'Fighting Energy', 4),
            row('t1', "Cynthia's Garchomp", 'Neo Upper Energy', 1),
            row('t2', "Cynthia's Garchomp", 'Fighting Energy', 5),
            row('t2', "Cynthia's Garchomp", 'Unfair Stamp', 1),
        ];
        const neo = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'neo upper energy', null);
        assert.equal(neo.bucketCount, 1);
        assert.equal(neo.conditionalAvgs.get('fighting energy').avg, 4.0);

        const stamp = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'unfair stamp', null);
        assert.equal(stamp.bucketCount, 1);
        assert.equal(stamp.conditionalAvgs.get('fighting energy').avg, 5.0);
    });

    it('uses presence (not bucket count) as the divisor for "avg when used"', () => {
        // Card is in 2 of 3 matching buckets at avg 4 each. Conditional
        // avg should be 4.0 (sum 8 / presence 2), not 8/3 ≈ 2.67. The
        // semantics are "given this card is in the deck, how many
        // copies?", not "across all matching decks how many copies".
        const rows = [
            row('t1', 'X', 'Card A', 4),
            row('t1', 'X', 'Neo Upper Energy', 1),
            row('t2', 'X', 'Card A', 4),
            row('t2', 'X', 'Neo Upper Energy', 1),
            row('t3', 'X', 'Neo Upper Energy', 1),
            // t3 doesn't have Card A
        ];
        const result = aceSpecConditionalAvgs(rows, 'X', 'neo upper energy', null);
        assert.equal(result.bucketCount, 3);
        const cardA = result.conditionalAvgs.get('card a');
        assert.equal(cardA.avg, 4.0);
        assert.equal(cardA.presence, 2);
    });

    it('reproduces the Cynthia Neo Upper / Unfair Stamp split from production data', () => {
        // Synthetic but data-shape-faithful: 7 Neo Upper buckets at 4F/3R
        // and 12 Unfair Stamp buckets at 5F/3R reproduce the production
        // dated-CSV split (the user verified this empirically: Neo Upper
        // builds avg 4.07 Fighting, Unfair Stamp avg 4.83 Fighting).
        const rows = [];
        for (let i = 0; i < 7; i++) {
            rows.push(row(`neo${i}`, "Cynthia's Garchomp", 'Fighting Energy', 4));
            rows.push(row(`neo${i}`, "Cynthia's Garchomp", 'Rocky Fighting Energy', 3));
            rows.push(row(`neo${i}`, "Cynthia's Garchomp", 'Neo Upper Energy', 1));
        }
        for (let i = 0; i < 12; i++) {
            rows.push(row(`stamp${i}`, "Cynthia's Garchomp", 'Fighting Energy', 5));
            rows.push(row(`stamp${i}`, "Cynthia's Garchomp", 'Rocky Fighting Energy', 3));
            rows.push(row(`stamp${i}`, "Cynthia's Garchomp", 'Unfair Stamp', 1));
        }

        const neo = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'neo upper energy', null);
        const stamp = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'unfair stamp', null);

        assert.equal(neo.bucketCount, 7);
        assert.equal(stamp.bucketCount, 12);
        assert.equal(neo.conditionalAvgs.get('fighting energy').avg, 4.0);
        assert.equal(stamp.conditionalAvgs.get('fighting energy').avg, 5.0);
        // The Stage-1 floor allocation uses Math.floor(avg) — these two
        // splits produce 4 vs 5 Fighting Energy in the resulting build,
        // exactly the meta-aware behaviour the user requested.
        assert.equal(Math.floor(neo.conditionalAvgs.get('fighting energy').avg), 4);
        assert.equal(Math.floor(stamp.conditionalAvgs.get('fighting energy').avg), 5);
    });

    it('honours the archetype field normalizer (Major source price-tag suffix)', () => {
        // Major source rows arrive with "Cynthia's Garchomp27.91$22.10€"
        // — the conditional helper should accept a normalizer that
        // strips the suffix.
        const stripPrice = (s) => String(s || '').replace(/[\d.,$€¥£]+/g, '').trim();
        const rows = [
            row('t1', "Cynthia's Garchomp27.91$22.10€", 'Fighting Energy', 5),
            row('t1', "Cynthia's Garchomp27.91$22.10€", 'Unfair Stamp', 1),
        ];
        const result = aceSpecConditionalAvgs(rows, "Cynthia's Garchomp", 'unfair stamp', stripPrice);
        assert.equal(result.bucketCount, 1);
        assert.equal(result.conditionalAvgs.get('fighting energy').avg, 5.0);
    });

    it('recency-weights matching buckets when todayMs is supplied', () => {
        // 3 Unfair Stamp Cynthia decks: an old one (Rocky=2, age 35d),
        // a mid one (Rocky=3, age 18d), and a recent one (Rocky=4, age
        // 2d). Without recency: avg = (2+3+4)/3 = 3.0. With recency:
        // weights ~0.05, 0.53, 1.0 → weighted avg shifts toward 4.
        const today = new Date('2026-05-06').getTime();
        const old = new Date('2026-04-01').toISOString().slice(0, 10);   // 35d
        const mid = new Date('2026-04-18').toISOString().slice(0, 10);   // 18d
        const recent = new Date('2026-05-04').toISOString().slice(0, 10); // 2d
        const rows = [
            { tournament_id: 't_old', tournament_date: old, archetype: 'X', card_name: 'Rocky Energy', average_count: '2' },
            { tournament_id: 't_old', tournament_date: old, archetype: 'X', card_name: 'Unfair Stamp', average_count: '1' },
            { tournament_id: 't_mid', tournament_date: mid, archetype: 'X', card_name: 'Rocky Energy', average_count: '3' },
            { tournament_id: 't_mid', tournament_date: mid, archetype: 'X', card_name: 'Unfair Stamp', average_count: '1' },
            { tournament_id: 't_new', tournament_date: recent, archetype: 'X', card_name: 'Rocky Energy', average_count: '4' },
            { tournament_id: 't_new', tournament_date: recent, archetype: 'X', card_name: 'Unfair Stamp', average_count: '1' },
        ];

        const unweighted = aceSpecConditionalAvgs(rows, 'X', 'unfair stamp', null);
        const weighted = aceSpecConditionalAvgs(rows, 'X', 'unfair stamp', null, today);

        // Unweighted = (2+3+4)/3 = 3.00
        assert.equal(unweighted.conditionalAvgs.get('rocky energy').avg, 3.0);

        // Weighted should be > 3.5 (recent weight 1.0 dominates).
        const weightedAvg = weighted.conditionalAvgs.get('rocky energy').avg;
        assert.ok(weightedAvg > 3.4 && weightedAvg < 4.0,
            `recency-weighted avg should be ~3.5+, got ${weightedAvg.toFixed(3)}`);
    });

    it('skips rows with non-numeric or zero average_count gracefully', () => {
        const rows = [
            row('t1', 'X', 'Fighting Energy', 4),
            row('t1', 'X', 'Neo Upper Energy', 1),
            { tournament_id: 't1', archetype: 'X', card_name: 'Garbage', average_count: 'invalid' },
            { tournament_id: 't1', archetype: 'X', card_name: 'Zero', average_count: '0' },
        ];
        const result = aceSpecConditionalAvgs(rows, 'X', 'neo upper energy', null);
        assert.equal(result.bucketCount, 1);
        assert.equal(result.conditionalAvgs.has('garbage'), false);
        assert.equal(result.conditionalAvgs.has('zero'), false);
        assert.equal(result.conditionalAvgs.get('fighting energy').avg, 4.0);
    });
});
