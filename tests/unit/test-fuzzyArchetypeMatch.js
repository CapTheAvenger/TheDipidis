/**
 * Tests for normalizeArchetypeForMatch() and buildFuzzyArchetypeMap()
 * from app-meta-cards.js.
 *
 * These functions resolve naming differences between
 * limitless_online_decks_comparison.csv (deck_name) and
 * current_meta_card_data.csv (archetype).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ------------------------------------------------------------------
// Load the two pure functions from app-meta-cards.js in a VM sandbox
// ------------------------------------------------------------------
function loadMetaCardFunctions() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-meta-cards.js'),
        'utf-8'
    );

    const sandbox = {
        window: {},
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            addEventListener: () => {},
        },
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        console,
        setTimeout, clearTimeout,
        Map, Set, Array, Object, String, Number, JSON, Math,
        parseInt, parseFloat, isNaN,
        // stubs for globals referenced at load time
        devLog: () => {},
        setGridLoadingSkeleton: () => {},
        clearGridLoadingSkeleton: () => {},
        getEmptyStateHtml: () => '',
        getCardTypeCategory: () => '',
        isBasicEnergyCardEntry: () => false,
        fixCardNameEncoding: (s) => s,
        healCurrentMetaCardRows: () => {},
        loadCurrentMetaRowsWithFallback: async () => [],
        parseCSV: () => [],
        loadCSV: async () => [],
        deriveCityLeagueComparisonData: () => [],
        getPreferredVersionForCard: () => null,
        getUnifiedCardImage: () => null,
        globalRarityPreference: 'min',
        BASE_PATH: '',
        fetch: async () => ({ ok: false }),
        metaCardData: { cityLeague: [], currentMeta: [] },
        normalizeArchetypeForMatch: null,
        buildFuzzyArchetypeMap: null,
    };

    for (const key of Object.keys(sandbox)) {
        if (!(key in sandbox.window)) sandbox.window[key] = sandbox[key];
    }

    const ctx = vm.createContext(sandbox);
    vm.runInContext(src, ctx, { filename: 'app-meta-cards.js' });

    return {
        normalizeArchetypeForMatch: sandbox.normalizeArchetypeForMatch || sandbox.window.normalizeArchetypeForMatch,
        buildFuzzyArchetypeMap: sandbox.buildFuzzyArchetypeMap || sandbox.window.buildFuzzyArchetypeMap,
    };
}

const { normalizeArchetypeForMatch, buildFuzzyArchetypeMap } = loadMetaCardFunctions();

// ============================================================
// normalizeArchetypeForMatch
// ============================================================
describe('normalizeArchetypeForMatch', () => {
    it('lowercases input', () => {
        assert.equal(normalizeArchetypeForMatch('Lucario Hariyama'), 'lucario hariyama');
    });

    it('strips apostrophes and possessives', () => {
        assert.equal(normalizeArchetypeForMatch("Rocket's Mewtwo"), 'rockets mewtwo');
        assert.equal(normalizeArchetypeForMatch("N's Zoroark"), 'ns zoroark');
        assert.equal(normalizeArchetypeForMatch("Cynthia's Garchomp"), 'cynthias garchomp');
    });

    it('strips standalone "ex" word', () => {
        assert.equal(normalizeArchetypeForMatch('Dragapult Ex'), 'dragapult');
        assert.equal(normalizeArchetypeForMatch('Rocket Mewtwo Ex'), 'rocket mewtwo');
    });

    it('does NOT strip "ex" inside a word', () => {
        // "Exeggutor" contains "ex" but it should not be stripped
        const result = normalizeArchetypeForMatch('Alolan Exeggutor');
        assert.ok(result.includes('eggutor'), `Expected "eggutor" in "${result}"`);
    });

    it('strips known set-code suffixes', () => {
        assert.equal(normalizeArchetypeForMatch('Slowking Scr'), 'slowking');
        assert.equal(normalizeArchetypeForMatch('Blaziken Ex Jtg'), 'blaziken');
        assert.equal(normalizeArchetypeForMatch('Feraligatr Tef'), 'feraligatr');
        assert.equal(normalizeArchetypeForMatch('Okidogi Twm'), 'okidogi');
    });

    it('collapses whitespace', () => {
        assert.equal(normalizeArchetypeForMatch('  Rocket   Mewtwo  Ex  '), 'rocket mewtwo');
    });

    it('returns empty string for falsy input', () => {
        assert.equal(normalizeArchetypeForMatch(null), '');
        assert.equal(normalizeArchetypeForMatch(undefined), '');
        assert.equal(normalizeArchetypeForMatch(''), '');
    });
});

// ============================================================
// buildFuzzyArchetypeMap
// ============================================================
describe('buildFuzzyArchetypeMap', () => {
    // Helper: build top10 set and array from simple name→count pairs
    function makeTop10(entries) {
        const arr = entries.map(([name, count]) => ({ name, deckCount: count }));
        const nameSet = new Set(arr.map(a => a.name.toLowerCase()));
        return { set: nameSet, arr };
    }

    it('returns exact matches when names are identical', () => {
        const { set, arr } = makeTop10([['Lucario Hariyama', 170]]);
        const result = buildFuzzyArchetypeMap(set, arr, ['Lucario Hariyama']);
        assert.equal(result.get('lucario hariyama'), 'lucario hariyama');
    });

    it('matches apostrophe variants (Rocket\'s Mewtwo → Rocket Mewtwo Ex)', () => {
        const { set, arr } = makeTop10([["Rocket's Mewtwo", 78]]);
        const result = buildFuzzyArchetypeMap(set, arr, ['Rocket Mewtwo Ex']);
        assert.equal(result.get('rocket mewtwo ex'), "rocket's mewtwo");
    });

    it('matches apostrophe variants (Cynthia\'s Garchomp → Cynthia Garchomp Ex)', () => {
        const { set, arr } = makeTop10([["Cynthia's Garchomp", 65]]);
        const result = buildFuzzyArchetypeMap(set, arr, ['Cynthia Garchomp Ex']);
        assert.equal(result.get('cynthia garchomp ex'), "cynthia's garchomp");
    });

    it('matches set-code suffix variants (Slowking → Slowking Scr)', () => {
        const { set, arr } = makeTop10([['Slowking', 54]]);
        const result = buildFuzzyArchetypeMap(set, arr, ['Slowking Scr']);
        assert.equal(result.get('slowking scr'), 'slowking');
    });

    it('matches short comp name to longer analysis name (Dragapult → Dragapult Ex)', () => {
        const { set, arr } = makeTop10([['Dragapult', 118]]);
        const result = buildFuzzyArchetypeMap(set, arr, ['Dragapult Ex']);
        assert.equal(result.get('dragapult ex'), 'dragapult');
    });

    it('matches Rocket\'s Honchkrow → Rockets Honchkrow', () => {
        const { set, arr } = makeTop10([["Rocket's Honchkrow", 59]]);
        const result = buildFuzzyArchetypeMap(set, arr, ['Rockets Honchkrow']);
        assert.equal(result.get('rockets honchkrow'), "rocket's honchkrow");
    });

    it('does not create a match for completely unrelated names', () => {
        const { set, arr } = makeTop10([['Lucario Hariyama', 170]]);
        const result = buildFuzzyArchetypeMap(set, arr, ['Zoroark']);
        assert.equal(result.has('zoroark'), false);
    });

    it('handles realistic Top 10 with mixed exact and fuzzy matches', () => {
        const { set, arr } = makeTop10([
            ['Lucario Hariyama', 170],
            ['Dragapult Dusknoir', 130],
            ['Dragapult', 118],
            ["N's Zoroark", 102],
            ['Alakazam Dudunsparce', 94],
            ["Rocket's Mewtwo", 78],
            ["Cynthia's Garchomp", 65],
            ["Rocket's Honchkrow", 59],
            ['Raging Bolt Ogerpon', 57],
            ['Slowking', 54],
        ]);
        const analysisNames = [
            'Lucario Hariyama',       // exact
            'Dragapult Dusknoir',     // exact
            'Dragapult Ex',           // fuzzy → Dragapult
            'Zoroark',                // fuzzy → N's Zoroark (word overlap)
            'Alakazam Dudunsparce',   // exact
            'Rocket Mewtwo Ex',       // fuzzy → Rocket's Mewtwo
            'Cynthia Garchomp Ex',    // fuzzy → Cynthia's Garchomp
            'Rockets Honchkrow',      // fuzzy → Rocket's Honchkrow
            'Raging Bolt Ogerpon',    // exact
            'Slowking Scr',           // fuzzy → Slowking
        ];
        const result = buildFuzzyArchetypeMap(set, arr, analysisNames);

        // All 10 analysis names should resolve
        assert.equal(result.size, 10, `Expected 10 mappings, got ${result.size}: ${JSON.stringify([...result.entries()])}`);

        // Exact matches
        assert.equal(result.get('lucario hariyama'), 'lucario hariyama');
        assert.equal(result.get('dragapult dusknoir'), 'dragapult dusknoir');
        assert.equal(result.get('alakazam dudunsparce'), 'alakazam dudunsparce');
        assert.equal(result.get('raging bolt ogerpon'), 'raging bolt ogerpon');

        // Fuzzy matches
        assert.equal(result.get('dragapult ex'), 'dragapult');
        assert.equal(result.get('rocket mewtwo ex'), "rocket's mewtwo");
        assert.equal(result.get('cynthia garchomp ex'), "cynthia's garchomp");
        assert.equal(result.get('rockets honchkrow'), "rocket's honchkrow");
        assert.equal(result.get('slowking scr'), 'slowking');
    });

    it('returns empty map when no analysis names provided', () => {
        const { set, arr } = makeTop10([['Lucario Hariyama', 170]]);
        const result = buildFuzzyArchetypeMap(set, arr, []);
        assert.equal(result.size, 0);
    });

    it('returns empty map when no top10 names provided', () => {
        const result = buildFuzzyArchetypeMap(new Set(), [], ['Lucario Hariyama']);
        assert.equal(result.size, 0);
    });
});
