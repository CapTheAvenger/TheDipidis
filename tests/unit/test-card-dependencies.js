/**
 * Unit tests for _detectCardDependencies + _resolveCardDependencies
 * in app-deck-builder.js.
 *
 * The user-flagged regression: Alakazam Dudunsparce build included
 * Genesect SFA (ability "ACE Nullifier" only fires WITH a Pokémon
 * Tool attached) but no Tools in the trainer line. Slot was
 * structurally dead. The dependency detector + resolution pass
 * catches that pattern.
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
        extractTopLevel(src, '_detectCardDependencies'),
        extractTopLevel(src, '_resolveCardDependencies'),
    ].join('\n\n');
    const sandbox = { console, Math, Number, String, Array, Object, RegExp, Set };
    vm.createContext(sandbox);
    vm.runInContext(snippet, sandbox);
    return {
        detect: sandbox._detectCardDependencies,
        resolve: sandbox._resolveCardDependencies,
    };
}

const FNS = load();

describe('_detectCardDependencies', () => {
    it("detects Genesect SFA's needs-tool dependency from ability text", () => {
        // Verbatim production ability text from data/pokemon_card_effects.json
        // (SFA|40, ability "ACE Nullifier"):
        const effects = {
            abilities: [
                {
                    name: 'ACE Nullifier',
                    text: "If this Pokémon has a Pokémon Tool attached, your opponent can't play any ACE SPEC cards from their hand.",
                },
            ],
        };
        const deps = FNS.detect({ card_name: 'Genesect' }, effects);
        assert.ok(deps.has('needs-tool'), 'Genesect should have needs-tool dependency');
    });

    it('detects needs-tool from "while" wording variants', () => {
        const effects = {
            abilities: [
                { name: 'X', text: 'While a Pokémon Tool is attached to this Pokémon, …' },
            ],
        };
        const deps = FNS.detect({}, effects);
        assert.ok(deps.has('needs-tool'));
    });

    it('does NOT trigger needs-tool on cards that DISCARD a tool (different wording)', () => {
        // Cards that say "Discard a Tool from your opponent's Pokémon"
        // shouldn't be tagged as needs-tool — they DESTROY tools, they
        // don't depend on having one.
        const effects = {
            rules: ["Discard a Pokémon Tool from this Pokémon. If you do, draw 2 cards."],
        };
        const deps = FNS.detect({}, effects);
        assert.equal(deps.has('needs-tool'), false);
    });

    it('returns empty Set for Pokémon with no relevant abilities', () => {
        const effects = {
            abilities: [],
            attacks: [{ name: 'Quick Attack', cost: ['Colorless'], damage: '20', text: '' }],
        };
        const deps = FNS.detect({}, effects);
        assert.equal(deps.size, 0);
    });

    it('returns empty Set when effects is null/undefined', () => {
        assert.equal(FNS.detect({}, null).size, 0);
        assert.equal(FNS.detect({}, undefined).size, 0);
        assert.equal(FNS.detect({}, {}).size, 0);
    });
});

describe('_resolveCardDependencies', () => {
    function entry(name, type, count, opts = {}) {
        return {
            card: {
                card_name: name,
                type,
                _cardFunctionTier: opts.tier || 'MID',
                _lrmRemainder: Number.isFinite(opts.remainder) ? opts.remainder : 0,
                consistencyScore: Number.isFinite(opts.score) ? opts.score : 60,
                _isAceSpec: opts.isAceSpec || false,
                _dependencies: opts.dependencies ? new Set(opts.dependencies) : new Set(),
            },
            count,
        };
    }

    const helpers = {
        getLegalMax: () => 4,
        isBasicEnergy: (card) => /basic energy/i.test(String((card && card.type) || '')),
        log: () => {},
    };

    it("demotes Genesect when no Tool is in the deck", () => {
        const deck = [
            entry('Genesect', 'Basic', 1, { tier: 'MID', dependencies: ['needs-tool'], score: 50 }),
            entry('Some Other CORE', 'Item', 3, { tier: 'CORE', remainder: 0.80, score: 100 }),
        ];
        const result = FNS.resolve(deck, helpers);
        assert.equal(result.resolved, 1);
        assert.equal(deck.length, 1, 'Genesect demoted to 0 → removed');
        assert.equal(deck[0].card.card_name, 'Some Other CORE');
        assert.equal(deck[0].count, 4, 'CORE bumped to fill the freed slot');
    });

    it('keeps Genesect when a Tool IS present in the deck', () => {
        const deck = [
            entry('Genesect', 'Basic', 1, { tier: 'MID', dependencies: ['needs-tool'], score: 50 }),
            entry("Hero's Cape", 'Tool', 1, { tier: 'TECH', score: 60 }),
            entry('Some CORE', 'Item', 3, { tier: 'CORE', remainder: 0.80, score: 100 }),
        ];
        const result = FNS.resolve(deck, helpers);
        assert.equal(result.resolved, 0, 'Tool present → Genesect kept');
        assert.equal(deck.find(e => e.card.card_name === 'Genesect').count, 1);
    });

    it('protects ACE-SPEC cards from dependency demotion', () => {
        // Hypothetical: an ACE-SPEC with needs-tool that the deck
        // doesn't have. Even so, the ACE-SPEC must not be demoted —
        // it's the deck's defining single-of choice.
        const deck = [
            entry('Hypothetical ACE-SPEC', 'Item', 1, { isAceSpec: true, dependencies: ['needs-tool'], score: 50 }),
            entry('Some CORE', 'Item', 3, { tier: 'CORE', remainder: 0.80, score: 100 }),
        ];
        const result = FNS.resolve(deck, helpers);
        assert.equal(result.resolved, 0);
        assert.equal(deck.find(e => e.card.card_name === 'Hypothetical ACE-SPEC').count, 1);
    });

    it('protects Stage-1 (score ≥ 75) cards from dependency demotion', () => {
        // A core identity card with an unmet dependency stays in the
        // deck — it might be the deck's win condition. The user can
        // manually add the prerequisite.
        const deck = [
            entry('Identity Card', 'Basic', 4, { tier: 'CORE', dependencies: ['needs-tool'], score: 100 }),
            entry('Filler', 'Item', 3, { tier: 'CORE', remainder: 0.50, score: 90 }),
        ];
        const result = FNS.resolve(deck, helpers);
        assert.equal(result.resolved, 0);
        assert.equal(deck.find(e => e.card.card_name === 'Identity Card').count, 4);
    });

    it('handles cards with no dependencies as no-op', () => {
        const deck = [
            entry('A', 'Item', 4, { tier: 'CORE' }),
            entry('B', 'Item', 4, { tier: 'CORE' }),
        ];
        const result = FNS.resolve(deck, helpers);
        assert.equal(result.resolved, 0);
    });

    it('reroute prefers CORE over MID over TECH for the freed slot', () => {
        const deck = [
            entry('Genesect', 'Basic', 1, { tier: 'MID', dependencies: ['needs-tool'], score: 50 }),
            entry('Tech Card', 'Supporter', 1, { tier: 'TECH', remainder: 0.90, score: 50 }),
            entry('Mid Card', 'Item', 2, { tier: 'MID', remainder: 0.85, score: 60 }),
            entry('Core Card', 'Item', 3, { tier: 'CORE', remainder: 0.50, score: 100 }),
        ];
        FNS.resolve(deck, helpers);
        // CORE should win the slot even with lower remainder, by tier.
        assert.equal(deck.find(e => e.card.card_name === 'Core Card').count, 4);
        assert.equal(deck.find(e => e.card.card_name === 'Mid Card').count, 2);
        assert.equal(deck.find(e => e.card.card_name === 'Tech Card').count, 1);
    });

    it('does not pick another stranded card as the bump target', () => {
        // Two stranded cards (both needs-tool, no Tool in deck). If we
        // demote the first one, the freed slot must NOT go to the
        // other stranded card.
        const deck = [
            entry('Genesect 1', 'Basic', 1, { tier: 'MID', dependencies: ['needs-tool'], remainder: 0.30, score: 50 }),
            entry('Genesect 2', 'Basic', 1, { tier: 'MID', dependencies: ['needs-tool'], remainder: 0.95, score: 50 }),
            entry('Plain Pokemon', 'Basic', 1, { tier: 'MID', remainder: 0.40, score: 60 }),
        ];
        FNS.resolve(deck, helpers);
        // Both stranded → both demoted. Plain Pokemon is the only valid bump target.
        assert.equal(deck.find(e => e.card.card_name === 'Plain Pokemon').count > 1, true);
    });
});
