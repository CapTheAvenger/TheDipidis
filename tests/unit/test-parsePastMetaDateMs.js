/**
 * Unit tests for parsePastMetaDateMs (P2 #12)
 *
 * This function parses date strings from tournament data into Unix
 * milliseconds. It handles multiple formats, ordinal suffixes (1st, 2nd,
 * 3rd, 4th…) and locale quirks. Bad dates silently return 0 — which
 * causes tournaments to sort incorrectly / vanish from the Past Meta
 * timeline.
 *
 * Run:  node --test tests/unit/test-parsePastMetaDateMs.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Load parsePastMetaDateMs from app-past-meta.js ──
function loadPastMetaFns() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-past-meta.js'),
        'utf-8'
    );

    const window = {
        setOrderMap: {},
        englishSetCodes: new Set(),
    };

    const sandbox = {
        window,
        document: {
            getElementById: () => null,
            querySelector: () => null,
            querySelectorAll: () => [],
            createElement: () => ({
                innerHTML: '', className: '', id: '', style: {},
                appendChild() {}, addEventListener() {},
                querySelectorAll: () => [],
            }),
            addEventListener: () => {},
        },
        localStorage: {
            _store: {},
            getItem(k) { return this._store[k] ?? null; },
            setItem(k, v) { this._store[k] = String(v); },
            removeItem(k) { delete this._store[k]; },
        },
        console,
        setTimeout: (fn) => fn(),
        clearTimeout: () => {},
        Map, Set, Array, Object, String, Number, JSON, Math, RegExp, Date, Error,
        parseInt, parseFloat, isNaN, isFinite,
        decodeURIComponent, encodeURIComponent, escape, eval,
        Intl: globalThis.Intl,
        // Stubs for cross-file references
        devLog: () => {},
        showToast: () => {},
        showNotification: () => {},
        showLoadingIndicator: () => {},
        hideLoadingIndicator: () => {},
        t: (key) => key,
        escapeHtml: (s) => String(s),
        escapeHtmlAttr: (s) => String(s),
        debounce: (fn) => fn,
        fixMojibake: (s) => String(s || ''),
        normalizeCardName: (s) => String(s || '').toLowerCase().trim(),
        normalizeSetCode: (s) => s ? String(s).toUpperCase().trim() : '',
        normalizeCardNumber: (n) => n ? String(n).trim() : '',
        getCanonicalDeckKey: (name, set, num) => {
            const n = String(name || '').trim();
            const s = String(set || '').toUpperCase().trim();
            const num2 = String(num || '').trim();
            return s && num2 ? `${n} (${s} ${num2})` : n;
        },
        getPreferredVersionForCard: () => null,
        getIndexedCardBySetNumber: () => null,
        getEnglishCardVersions: () => [],
        getCanonicalCardRecord: () => null,
        getDisplayCardName: (n) => String(n || ''),
        getStrictBaseCardName: (n) => String(n || ''),
        getLegalMaxCopies: () => 4,
        calculateCombinedVariantStats: () => ({
            combinedShare: 0, combinedAvgWhenUsed: 0, recommendedCount: 2, baseName: '', legalMax: 4,
        }),
        getRarityPriority: () => 0,
        getRarityPreference: () => null,
        getGlobalRarityPreference: () => 'min',
        globalRarityPreference: 'min',
        isAceSpec: () => false,
        isBasicEnergyCardEntry: () => false,
        isBasicEnergy: () => false,
        isBasicEnergyName: () => false,
        isRadiantPokemon: () => false,
        parseCSV: () => [],
        parseCSVRow: () => [],
        mapSetCodeToMetaFormat: (c) => c,
        loadCSV: async () => [],
        internationalPrintsCache: new Map(),
        preferredVersionCache: new Map(),
        pastMetaFilteredCards: [],
        addCardToDeckBatch: () => true,
        updateDeckDisplay: () => {},
        savePastMetaDeck: () => {},
        scheduleDeckDisplayUpdate: () => {},
        scheduleDeckDependentRefresh: () => {},
        clearDeck: () => {},
        getDeckTotalCards: () => 0,
        sanitizeDeckDependencies: (c) => c,
        getOpeningHandProbability: () => 0,
        renderOverviewCards: () => {},
        applyCityLeagueFilter: () => {},
        filterCurrentMetaCards: () => {},
        renderPastMetaCards: () => {},
        renderMetaCards: () => {},
        setRarityPreference: () => {},
        buildInlineCardPlaceholder: () => '',
        getCardImageSource: () => '',
        formatAverageValueForUi: () => '',
        hasMojibake: () => false,
        sortDeckByCategory: () => [],
        getCardCategoryForSort: () => 'other',
        fetch: async () => ({ ok: false, text: async () => '' }),
        requestAnimationFrame: (fn) => fn(),
        cancelAnimationFrame: () => {},
        // Number constructor
        Number,
    };

    for (const key of Object.keys(sandbox)) {
        if (!(key in window)) window[key] = sandbox[key];
    }

    const ctx = vm.createContext(sandbox);

    try {
        vm.runInContext(src, ctx, { filename: 'app-past-meta.js' });
    } catch (_) {
        // Top-level code may fail in test env — OK as long as functions are defined
    }

    const exported = {};
    const fnNames = [
        'parsePastMetaDateMs', 'getPastMetaSortScore',
        'getPastMetaDeckTournamentKey', 'getPastMetaRepresentativeCardCopies',
        'derivePastMetaLabelFromSetCode',
    ];
    for (const fn of fnNames) {
        if (typeof sandbox[fn] === 'function') exported[fn] = sandbox[fn];
        else if (typeof sandbox.window[fn] === 'function') exported[fn] = sandbox.window[fn];
    }
    exported._sandbox = sandbox;
    return exported;
}

// ═══════════════════════════════════════════════════════════
// parsePastMetaDateMs
// ═══════════════════════════════════════════════════════════

describe('parsePastMetaDateMs — standard ISO formats', () => {
    const fns = loadPastMetaFns();
    const parse = fns.parsePastMetaDateMs;

    it('parses ISO date string "2025-03-15"', () => {
        const result = parse('2025-03-15');
        assert.ok(result > 0, 'should return positive ms');
        const d = new Date(result);
        assert.equal(d.getFullYear(), 2025);
        assert.equal(d.getMonth(), 2); // March = 2
        assert.equal(d.getDate(), 15);
    });

    it('parses ISO datetime "2025-06-01T12:00:00Z"', () => {
        const result = parse('2025-06-01T12:00:00Z');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getUTCFullYear(), 2025);
        assert.equal(d.getUTCMonth(), 5);
    });

    it('parses "March 15, 2025"', () => {
        const result = parse('March 15, 2025');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getFullYear(), 2025);
        assert.equal(d.getMonth(), 2);
    });

    it('parses "15 March 2025"', () => {
        const result = parse('15 March 2025');
        assert.ok(result > 0);
    });
});

describe('parsePastMetaDateMs — ordinal suffixes', () => {
    const fns = loadPastMetaFns();
    const parse = fns.parsePastMetaDateMs;

    it('parses "March 1st, 2025"', () => {
        const result = parse('March 1st, 2025');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getDate(), 1);
    });

    it('parses "February 2nd, 2025"', () => {
        const result = parse('February 2nd, 2025');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getDate(), 2);
    });

    it('parses "June 3rd, 2025"', () => {
        const result = parse('June 3rd, 2025');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getDate(), 3);
    });

    it('parses "April 4th, 2025"', () => {
        const result = parse('April 4th, 2025');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getDate(), 4);
    });

    it('parses "December 21st, 2024"', () => {
        const result = parse('December 21st, 2024');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getFullYear(), 2024);
        assert.equal(d.getDate(), 21);
    });

    it('parses "November 23rd, 2025"', () => {
        const result = parse('November 23rd, 2025');
        assert.ok(result > 0);
        const d = new Date(result);
        assert.equal(d.getDate(), 23);
    });
});

describe('parsePastMetaDateMs — edge cases', () => {
    const fns = loadPastMetaFns();
    const parse = fns.parsePastMetaDateMs;

    it('returns 0 for null', () => {
        assert.equal(parse(null), 0);
    });

    it('returns 0 for undefined', () => {
        assert.equal(parse(undefined), 0);
    });

    it('returns 0 for empty string', () => {
        assert.equal(parse(''), 0);
    });

    it('returns 0 for whitespace-only', () => {
        assert.equal(parse('   '), 0);
    });

    it('returns 0 for nonsense', () => {
        assert.equal(parse('not-a-date'), 0);
    });

    it('returns 0 for random garbage', () => {
        assert.equal(parse('xyz123!@#'), 0);
    });

    it('handles number input (epoch ms)', () => {
        // Date constructor accepts number strings that look like epoch-ish values
        const result = parse('1700000000000');
        // Even if this parses as a valid date, it should not crash
        assert.equal(typeof result, 'number');
    });

    it('trims whitespace from valid date', () => {
        const result = parse('  2025-01-15  ');
        assert.ok(result > 0);
    });
});

// ═══════════════════════════════════════════════════════════
// getPastMetaSortScore
// ═══════════════════════════════════════════════════════════

describe('getPastMetaSortScore — basic ordering', () => {
    const fns = loadPastMetaFns();
    const sort = fns.getPastMetaSortScore;

    it('returns 0 for empty meta name', () => {
        assert.equal(sort('', {}, new Map()), 0);
    });

    it('returns 0 for null meta name', () => {
        assert.equal(sort(null, {}, new Map()), 0);
    });

    it('ranks later sets higher', () => {
        const setOrderMap = { SVI: 1, PAL: 2, OBF: 3, MEW: 4, PAR: 5 };
        const dateMap = new Map();

        const scoreA = sort('SVI-PAL', setOrderMap, dateMap);
        const scoreB = sort('SVI-PAR', setOrderMap, dateMap);
        assert.ok(scoreB > scoreA, 'SVI-PAR should rank higher than SVI-PAL');
    });

    it('falls back to dateMs when sets unknown', () => {
        const dateMap = new Map([
            ['Unknown Format A', 1000000000000],
            ['Unknown Format B', 2000000000000],
        ]);

        const scoreA = sort('Unknown Format A', {}, dateMap);
        const scoreB = sort('Unknown Format B', {}, dateMap);
        assert.ok(scoreB > scoreA);
    });
});

// ═══════════════════════════════════════════════════════════
// getPastMetaDeckTournamentKey
// ═══════════════════════════════════════════════════════════

describe('getPastMetaDeckTournamentKey — key generation', () => {
    const fns = loadPastMetaFns();
    const getKey = fns.getPastMetaDeckTournamentKey;

    it('uses tournament_id when available', () => {
        const key = getKey({ tournament_id: 'T123', tournament_name: 'Cup', tournament_date: '2025-01-01', format: 'standard' });
        assert.equal(key, 'id:T123');
    });

    it('falls back to name+date+format without id', () => {
        const key = getKey({ tournament_name: 'City Cup', tournament_date: '2025-01-01', format: 'standard' });
        assert.equal(key, 'standard|||2025-01-01|||City Cup');
    });

    it('falls back to format+date without name', () => {
        const key = getKey({ tournament_date: '2025-01-01', format: 'standard' });
        assert.equal(key, 'standard|||2025-01-01');
    });

    it('returns format when only format present', () => {
        const key = getKey({ format: 'standard' });
        assert.equal(key, 'standard');
    });

    it('returns "unknown" for empty deck object', () => {
        const key = getKey({});
        assert.equal(key, 'unknown');
    });
});
