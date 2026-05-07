/**
 * Unit tests for _computeCardCoOccurrence + _resolveCardSynergyMissing
 * in app-deck-builder.js.
 *
 * The user-flagged regression: Mega Starmie build picked Neo Upper
 * Energy + 3 Dreepy + 3 Drakloak + 2 Munkidori but no Dragapult ex.
 * In the archetype's tournament data Neo Upper / Dreepy / Drakloak
 * / Munkidori all co-occur with Dragapult ex ≈ 100 %; without the
 * partner the sub-line is structurally dead.
 *
 * The two helpers cover the data-driven half of the fix:
 *
 *   - _computeCardCoOccurrence: finds card pairs where P(B in deck | A
 *     in deck) ≥ minProb (default 0.90), with sample-size guards
 *     (per-card presence ≥ 5 decks, archetype ≥ 10 decks total).
 *
 *   - _resolveCardSynergyMissing: post-allocation pass that demotes
 *     non-CORE non-ACE-SPEC cards whose synergy partners are absent
 *     from the built deck, with the same demote-and-reroute pattern
 *     as _resolveCardDependencies.
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
        extractTopLevel(src, '_computeCardCoOccurrence'),
        extractTopLevel(src, '_resolveCardSynergyMissing'),
    ].join('\n\n');
    const sandbox = { console, Math, Number, String, Array, Object, Map, Set };
    vm.createContext(sandbox);
    vm.runInContext(snippet, sandbox);
    return {
        compute: sandbox._computeCardCoOccurrence,
        resolve: sandbox._resolveCardSynergyMissing,
    };
}

const FNS = load();

describe('_computeCardCoOccurrence', () => {
    function makeRows(decks) {
        // decks: [[cardA, cardB, ...], ...] → flat row list
        const rows = [];
        decks.forEach((cards, i) => {
            cards.forEach(card => {
                rows.push({
                    tournament_id: `tid${i}`,
                    archetype: 'Mega Starmie',
                    card_name: card,
                });
            });
        });
        return rows;
    }

    it('detects ≥ 90 % co-occurrence as a synergy partner', () => {
        // 12 decks, all run both Neo Upper Energy and Dragapult ex.
        const decks = [];
        for (let i = 0; i < 12; i++) {
            decks.push(['Neo Upper Energy', 'Dragapult ex']);
        }
        const rows = makeRows(decks);
        const m = FNS.compute(rows, 'Mega Starmie');
        const synergy = m.get('neo upper energy');
        assert.ok(synergy, 'Neo Upper Energy should have synergy data');
        assert.equal(synergy.partners.length, 1);
        assert.equal(synergy.partners[0].card, 'dragapult ex');
        assert.equal(synergy.partners[0].prob, 1.0);
        assert.equal(synergy.partners[0].sample, 12);
    });

    it('skips pairs below the minProb threshold', () => {
        // Neo Upper appears in 12 decks; Dragapult ex in only 5 of them.
        // P = 5/12 ≈ 0.42, well below 0.90.
        const decks = [];
        for (let i = 0; i < 12; i++) {
            decks.push(i < 5 ? ['Neo Upper Energy', 'Dragapult ex'] : ['Neo Upper Energy']);
        }
        const rows = makeRows(decks);
        const m = FNS.compute(rows, 'Mega Starmie');
        const synergy = m.get('neo upper energy');
        // partners[] should be empty (no high-coupling partner) or the
        // map should have no entry at all for this card.
        if (synergy) {
            assert.equal(synergy.partners.length, 0);
        }
    });

    it('respects the per-card minSample guard (≥ 5 decks)', () => {
        // 12 decks total. Neo Upper appears in only 3 — below default
        // minSample of 5. Even with 100 % conditional co-occurrence
        // we should not derive a synergy.
        const decks = [];
        for (let i = 0; i < 12; i++) {
            decks.push(i < 3
                ? ['Neo Upper Energy', 'Dragapult ex']
                : ['Filler']);
        }
        const rows = makeRows(decks);
        const m = FNS.compute(rows, 'Mega Starmie');
        assert.equal(m.has('neo upper energy'), false, 'should skip — only 3 sample decks');
    });

    it('respects the archetype minDecks guard (≥ 10 decks total)', () => {
        // Only 8 decks — below the archetype noise floor.
        const decks = [];
        for (let i = 0; i < 8; i++) {
            decks.push(['Neo Upper Energy', 'Dragapult ex']);
        }
        const rows = makeRows(decks);
        const m = FNS.compute(rows, 'Mega Starmie');
        assert.equal(m.size, 0, 'archetype too small — entire map empty');
    });

    it('filters by archetype', () => {
        // Mix of two archetypes — only "Mega Starmie" should be aggregated.
        const rows = [];
        for (let i = 0; i < 12; i++) {
            rows.push({ tournament_id: `tA${i}`, archetype: 'Mega Starmie',
                card_name: 'Neo Upper Energy' });
            rows.push({ tournament_id: `tA${i}`, archetype: 'Mega Starmie',
                card_name: 'Dragapult ex' });
            rows.push({ tournament_id: `tB${i}`, archetype: 'Other Deck',
                card_name: 'Neo Upper Energy' });
            // Other Deck does NOT include Dragapult ex.
        }
        const m = FNS.compute(rows, 'Mega Starmie');
        const synergy = m.get('neo upper energy');
        assert.ok(synergy);
        assert.equal(synergy.partners[0].card, 'dragapult ex');
    });

    it('returns empty map on empty / null input', () => {
        assert.equal(FNS.compute([],   'Mega Starmie').size, 0);
        assert.equal(FNS.compute(null, 'Mega Starmie').size, 0);
    });

    it('aggregates cross-archetype when archetypeKey is null (meta-wide synergies)', () => {
        // 12 decks across THREE different archetypes, all carrying
        // Neo Upper Energy + Dragapult ex. Per-archetype slices have
        // ≤ 6 decks each (below minDecks=10) — only meta-wide
        // aggregation surfaces the synergy.
        const rows = [];
        const archetypes = ['Dragapult Pure', 'Dragapult Dusknoir', 'Dragapult Charizard', 'Mega Starmie'];
        for (let i = 0; i < 12; i++) {
            const a = archetypes[i % archetypes.length];
            rows.push({ tournament_id: `t${i}`, archetype: a, card_name: 'Neo Upper Energy' });
            rows.push({ tournament_id: `t${i}`, archetype: a, card_name: 'Dragapult ex' });
        }
        // Per-archetype: each only has 3 decks → empty
        const perArch = FNS.compute(rows, 'Dragapult Pure');
        assert.equal(perArch.size, 0, 'per-archetype slice below noise floor');
        // Cross-archetype: 12 buckets total → above floor
        const crossArch = FNS.compute(rows, null);
        const synergy = crossArch.get('neo upper energy');
        assert.ok(synergy, 'cross-archetype must surface Neo Upper synergy');
        const dragPartner = synergy.partners.find(p => p.card === 'dragapult ex');
        assert.ok(dragPartner, 'Dragapult ex must be a partner');
        assert.equal(dragPartner.prob, 1.0);
    });

    it('flags Pokémon-ex / VMAX / VSTAR partners as anchors', () => {
        const rows = [];
        for (let i = 0; i < 12; i++) {
            const t = `t${i}`;
            rows.push({ tournament_id: t, archetype: 'X', card_name: 'Neo Upper Energy' });
            rows.push({ tournament_id: t, archetype: 'X', card_name: 'Dragapult ex' });   // anchor
            rows.push({ tournament_id: t, archetype: 'X', card_name: 'Charizard VMAX' });  // anchor
            rows.push({ tournament_id: t, archetype: 'X', card_name: 'Iono' });            // not anchor
            rows.push({ tournament_id: t, archetype: 'X', card_name: 'Dreepy' });          // not anchor (not ex)
        }
        const m = FNS.compute(rows, null);
        const synergy = m.get('neo upper energy');
        assert.ok(synergy);
        const flagBy = (cardName) => synergy.partners.find(p => p.card === cardName);
        assert.equal(flagBy('dragapult ex').isAnchor,    true);
        assert.equal(flagBy('charizard vmax').isAnchor,  true);
        assert.equal(flagBy('iono').isAnchor,            false);
        assert.equal(flagBy('dreepy').isAnchor,          false);
    });

    it('detects multi-partner clusters', () => {
        // 12 decks where 4 cards always appear together (Dragapult ex,
        // Dreepy, Drakloak, Munkidori). Each should list the other 3
        // as partners.
        const cluster = ['Dragapult ex', 'Dreepy', 'Drakloak', 'Munkidori'];
        const decks = [];
        for (let i = 0; i < 12; i++) decks.push(cluster.slice());
        const rows = makeRows(decks);
        const m = FNS.compute(rows, 'Mega Starmie');
        for (const c of cluster) {
            const s = m.get(c.toLowerCase());
            assert.ok(s, `${c} should have synergy data`);
            assert.equal(s.partners.length, 3,
                `${c} should list 3 partners (the other cluster members)`);
            for (const p of s.partners) {
                assert.equal(p.prob, 1.0);
            }
        }
    });
});

describe('_resolveCardSynergyMissing', () => {
    function entry(name, count, opts = {}) {
        return {
            card: {
                card_name: name,
                _cardFunctionTier: opts.tier || 'MID',
                _lrmRemainder: Number.isFinite(opts.remainder) ? opts.remainder : 0,
                consistencyScore: Number.isFinite(opts.score) ? opts.score : 60,
                _isAceSpec: opts.isAceSpec || false,
            },
            count,
        };
    }

    const helpers = {
        getLegalMax: () => 4,
        isBasicEnergy: () => false,
        log: () => {},
    };

    function makeMap(synergyTable) {
        // synergyTable: { cardLower: [partnerLower, ...] }
        const m = new Map();
        for (const [k, partners] of Object.entries(synergyTable)) {
            m.set(k, {
                presence: 12,
                partners: partners.map(p => ({ card: p, prob: 1.0, sample: 12 })),
            });
        }
        return m;
    }

    it('demotes a card whose synergy partner is absent', () => {
        // Dreepy needs Dragapult ex; deck has Dreepy but no Dragapult.
        const deck = [
            entry('Dreepy', 3, { tier: 'MID', score: 60 }),
            entry('Some Filler', 3, { tier: 'CORE', remainder: 0.85, score: 100 }),
        ];
        const map = makeMap({ 'dreepy': ['dragapult ex'] });
        const r = FNS.resolve(deck, map, helpers);
        assert.equal(r.resolved, 1);
        assert.equal(deck.find(e => e.card.card_name === 'Dreepy').count, 2);
        assert.equal(deck.find(e => e.card.card_name === 'Some Filler').count, 4);
    });

    it('keeps a card when ANY partner is present', () => {
        // Dreepy needs Dragapult ex OR Drakloak. Deck has Drakloak.
        const deck = [
            entry('Dreepy',   3, { tier: 'MID', score: 60 }),
            entry('Drakloak', 3, { tier: 'MID', score: 60 }),
            entry('Filler',   4, { tier: 'CORE', remainder: 0.50, score: 100 }),
        ];
        const map = makeMap({ 'dreepy': ['dragapult ex', 'drakloak'] });
        const r = FNS.resolve(deck, map, helpers);
        assert.equal(r.resolved, 0);
        assert.equal(deck.find(e => e.card.card_name === 'Dreepy').count, 3);
    });

    it('protects ACE-SPEC cards from synergy demotion', () => {
        const deck = [
            entry('Neo Upper Energy', 1, { isAceSpec: true, score: 50 }),
            entry('Filler', 4, { tier: 'CORE', remainder: 0.50, score: 100 }),
        ];
        const map = makeMap({ 'neo upper energy': ['dragapult ex'] });
        const r = FNS.resolve(deck, map, helpers);
        assert.equal(r.resolved, 0,
            'ACE-SPEC pre-filter handles this case at pick-time, not via demotion');
        assert.equal(deck.find(e => e.card.card_name === 'Neo Upper Energy').count, 1);
    });

    it('protects high-score cards (CORE-tier) from synergy demotion', () => {
        const deck = [
            entry('Identity Card', 4, { tier: 'CORE', score: 100 }),
            entry('Filler',         4, { tier: 'CORE', remainder: 0.50, score: 90  }),
        ];
        const map = makeMap({ 'identity card': ['missing partner'] });
        const r = FNS.resolve(deck, map, helpers);
        assert.equal(r.resolved, 0);
        assert.equal(deck.find(e => e.card.card_name === 'Identity Card').count, 4);
    });

    it('handles cards without synergy data as no-op', () => {
        const deck = [
            entry('A', 4, { tier: 'CORE', score: 60 }),
            entry('B', 4, { tier: 'CORE', score: 60 }),
        ];
        const map = makeMap({});
        assert.equal(FNS.resolve(deck, map, helpers).resolved, 0);
    });

    it('does not pick another stranded card as the bump target', () => {
        // Two stranded cards both miss their (different) partners. The
        // freed slot must NOT go to the OTHER stranded card.
        const deck = [
            entry('Dreepy',   3, { tier: 'MID', remainder: 0.30, score: 60 }),
            entry('Drakloak', 3, { tier: 'MID', remainder: 0.95, score: 60 }),
            entry('Plain Pokemon', 1, { tier: 'CORE', remainder: 0.40, score: 100 }),
        ];
        const map = makeMap({
            'dreepy':   ['dragapult ex'],
            'drakloak': ['dragapult ex'],
        });
        FNS.resolve(deck, map, helpers);
        const plain = deck.find(e => e.card.card_name === 'Plain Pokemon');
        assert.equal(plain.count >= 2, true,
            'Plain Pokemon is the only valid bump target for the freed slots');
    });
});

describe('regression — the user-flagged Mega Starmie / Neo Upper case', () => {
    function row(tid, card) {
        return { tournament_id: tid, archetype: 'Mega Starmie', card_name: card };
    }

    it('detects the Neo Upper Energy → Dragapult ex tight pairing', () => {
        // The user's invariant: Neo Upper Energy never appears without
        // Dragapult ex. The co-occurrence detector must surface that
        // pairing as a synergy. The ACE-SPEC pre-filter in the live
        // builder (autoCompleteConsistency, near line ~5848) consumes
        // this map to skip Neo Upper as an ACE-SPEC candidate when
        // Dragapult ex isn't likely to make the cut.
        const rows = [];
        // 12 decks with both Neo Upper and Dragapult ex.
        for (let i = 0; i < 12; i++) {
            rows.push(row(`drag${i}`, 'Neo Upper Energy'));
            rows.push(row(`drag${i}`, 'Dragapult ex'));
            rows.push(row(`drag${i}`, 'Mega Starmie ex'));
        }
        const m = FNS.compute(rows, 'Mega Starmie');
        const synergy = m.get('neo upper energy');
        assert.ok(synergy, 'Neo Upper Energy must have synergy data');
        const hasDragapult = synergy.partners.some(p => p.card === 'dragapult ex');
        assert.equal(hasDragapult, true,
            'Neo Upper → Dragapult ex synergy must be detected');
    });

    it('demotes a tight pairing card (≤ 3 partners) when its only partner is missing', () => {
        // Hypothetical: a card with exactly one tight partner that's
        // missing. This mirrors the "Genesect SFA → Pokémon Tool" case
        // (already covered by _resolveCardDependencies) but via the
        // data-driven co-occurrence path.
        const deck = [
            { card: { card_name: 'Tight Partner Card', consistencyScore: 60, _cardFunctionTier: 'MID' }, count: 2 },
            { card: { card_name: 'Filler',             consistencyScore: 100, _cardFunctionTier: 'CORE',
                _lrmRemainder: 0.95 }, count: 3 },
        ];
        const map = new Map();
        map.set('tight partner card', {
            presence: 12,
            partners: [{ card: 'missing keystone', prob: 1.0, sample: 12 }],
        });
        const r = FNS.resolve(deck, map, { getLegalMax: () => 4, isBasicEnergy: () => false, log: () => {} });
        assert.equal(r.resolved, 1);
        assert.equal(deck.find(e => e.card.card_name === 'Tight Partner Card').count, 1);
    });

    it('does NOT demote in broad clusters (> 3 partners) — those need keystone-aware logic', () => {
        // Multi-card cluster: Dreepy with 4 partners, all of which are
        // present except Dragapult ex. The simple "any partner present"
        // rule would mark Dreepy satisfied (Drakloak / Munkidori in
        // deck), masking the missing Dragapult ex. This pass
        // intentionally skips clusters > 3 to avoid that false negative;
        // the ACE-SPEC pre-filter is the right place to handle keystone
        // missing for now.
        const deck = [
            { card: { card_name: 'Dreepy',     consistencyScore: 60,  _cardFunctionTier: 'MID' },  count: 3 },
            { card: { card_name: 'Drakloak',   consistencyScore: 60,  _cardFunctionTier: 'MID' },  count: 3 },
            { card: { card_name: 'Munkidori',  consistencyScore: 60,  _cardFunctionTier: 'MID' },  count: 2 },
            { card: { card_name: 'Mega Starmie ex', consistencyScore: 100, _cardFunctionTier: 'CORE' }, count: 2 },
        ];
        const map = new Map();
        map.set('dreepy', {
            presence: 12,
            partners: [
                { card: 'drakloak',        prob: 1.0, sample: 12 },
                { card: 'munkidori',       prob: 1.0, sample: 12 },
                { card: 'mega starmie ex', prob: 1.0, sample: 12 },
                { card: 'dragapult ex',    prob: 1.0, sample: 12 }, // missing
            ],
        });
        const r = FNS.resolve(deck, map, { getLegalMax: () => 4, isBasicEnergy: () => false, log: () => {} });
        assert.equal(r.resolved, 0,
            'broad clusters left to keystone-aware logic / ACE-SPEC pre-filter');
    });
});
