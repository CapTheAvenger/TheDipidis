/**
 * Test helpers — provides a minimal browser-like sandbox so that the pure
 * functions from app-utils.js can be extracted and tested in Node.js without
 * a full browser environment.
 *
 * Usage:
 *   const { loadAppUtils } = require('./test-helpers');
 *   const fns = loadAppUtils();
 *   fns.getRarityPriority('Common');
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Build a minimal window/document sandbox and evaluate app-utils.js inside it.
 * Returns an object with all the exported utility functions.
 *
 * @param {object} [overrides] – extra globals to inject (e.g. window.setOrderMap)
 */
function loadAppUtils(overrides = {}) {
    let utilsSrc = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-utils.js'),
        'utf-8'
    );

    // Strip the self-executing IIFE at the top that uses eval() to expose
    // functions to window — it fails in Node's VM because the functions
    // aren't yet defined at that point.  We re-expose them manually below.
    utilsSrc = utilsSrc.replace(
        /^\/\/\s*---\s*Bulk expose.*?\n\(function\(\)\s*\{[\s\S]*?\}\)\(\);/m,
        '// [test-helpers] bulk-expose IIFE stripped'
    );

    // Minimal stubs for browser APIs the file references at load time
    const window = {
        escapeHtml: null,
        escapeHtmlAttr: null,
        setOrderMap: {},
        englishSetCodes: new Set(),
        cardsBySetNumberMap: {},
        ...overrides,
    };

    // Minimal localStorage stub
    const localStorage = {
        _store: {},
        getItem(k) { return this._store[k] ?? null; },
        setItem(k, v) { this._store[k] = String(v); },
        removeItem(k) { delete this._store[k]; },
    };

    // Minimal document stub (enough for ensureAverageDisplayToggleUi to not crash)
    const document = {
        getElementById() { return null; },
        querySelector() { return null; },
        createElement() { return { innerHTML: '', className: '', id: '', appendChild() {} }; },
    };

    // Globals the utils file reads but that live in other JS files.
    // We provide safe no-op / empty defaults so the file loads cleanly.
    const sandbox = {
        window,
        document,
        localStorage,
        console,
        setTimeout,
        clearTimeout,
        Map,
        Set,
        Array,
        Object,
        String,
        Number,
        JSON,
        Math,
        parseInt,
        parseFloat,
        isNaN,
        decodeURIComponent,
        escape,
        eval,
        // globals defined elsewhere that app-utils.js references
        internationalPrintsCache: new Map(),
        preferredVersionCache: new Map(),
        cardsBySetNumberMap: overrides.cardsBySetNumberMap || {},
        cardsByNameMap: overrides.cardsByNameMap || {},
        cardIndexBySetNumber: overrides.cardIndexBySetNumber || {},
        aceSpecsList: overrides.aceSpecsList || [
            'prime catcher', 'hero\'s cape', 'maximum belt', 'master ball',
            'grand tree', 'neo upper energy', 'survival brace',
            'secret box', 'unfair stamp', 'legacy energy',
            'deluxe bomb', 'reboot pod', 'enriching energy',
            'gorgeous cape', 'awakening drum', 'brilliant blender',
        ],
        normalizeSetCode: overrides.normalizeSetCode || ((s) => s ? String(s).toUpperCase().trim() : ''),
        normalizeCardNumber: overrides.normalizeCardNumber || ((n) => n ? String(n).trim() : ''),
        getIndexedCardBySetNumber: overrides.getIndexedCardBySetNumber || (() => null),
        getEnglishCardVersions: overrides.getEnglishCardVersions || (() => []),
        getCanonicalCardRecord: overrides.getCanonicalCardRecord || (() => null),
        debugVersionSelectionLog: overrides.debugVersionSelectionLog || (() => {}),
        devLog: overrides.devLog || (() => {}),
        getRarityPreference: overrides.getRarityPreference || (() => null),
        getGlobalRarityPreference: overrides.getGlobalRarityPreference || (() => 'min'),
        isAceSpec: overrides.isAceSpec || ((name) => {
            const n = String(name?.card_name || name?.name || name || '').toLowerCase().trim();
            return (sandbox.aceSpecsList || []).includes(n);
        }),
        isBasicEnergyCardEntry: overrides.isBasicEnergyCardEntry || ((cardLike) => {
            if (!cardLike) return false;
            const basicNames = [
                'grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy',
            ];
            const name = String(cardLike.card_name || cardLike.name || '').toLowerCase().trim();
            return basicNames.includes(name);
        }),
        // buildCardsByNameMap etc. are not called at load time — stub
        buildCardsByNameMap: () => ({}),
        buildCardIndexBySetNumber: () => ({}),
        buildCardsBySetNumberMap: () => ({}),
        // Stubs for functions referenced in DOM-manipulating branches
        applyCityLeagueFilter: () => {},
        filterCurrentMetaCards: () => {},
        renderPastMetaCards: () => {},
        renderMetaCards: () => {},
        pastMetaFilteredCards: [],
        metaCardData: { cityLeague: [], currentMeta: [] },
        showToast: () => {},
    };

    // Make every sandbox key also accessible as a property of sandbox.window
    for (const key of Object.keys(sandbox)) {
        if (!(key in sandbox.window)) sandbox.window[key] = sandbox[key];
    }

    const ctx = vm.createContext(sandbox);
    vm.runInContext(utilsSrc, ctx, { filename: 'app-utils.js' });

    // Collect all functions that were exposed on window
    const exported = {};
    for (const key of Object.keys(sandbox.window)) {
        if (typeof sandbox.window[key] === 'function') {
            exported[key] = sandbox.window[key];
        }
    }

    // Also pick up functions defined at top-level scope that utils.forEach exposes
    const topLevelFns = [
        'getRarityPriority', 'getPreferredVersionForCard', 'calculateCombinedVariantStats',
        'getStrictBaseCardName', 'getLegalMaxCopies', 'normalizeCardName', 'fixMojibake',
        'isBasicEnergy', 'isRadiantPokemon', 'isPrismStarCard', 'safeParseFloat',
        'debounce', 'showLoadingIndicator', 'hideLoadingIndicator',
        'getOpeningHandProbability', 'sanitizeDeckDependencies',
        'normalizeDeckEntries', 'formatAverageValueForUi',
        'hasMojibake', 'escapeHtmlAttr', 'escapeJsStr', 'getDisplayCardName',
        'getCanonicalDeckKey', 'getSafeCardIdentityName', 'getDeckCopiesForCardName',
        'getTotalAceSpecCopiesInDeck', 'getTotalRadiantCopiesInDeck',
        'getRarityAbbreviation', 'getNameWarningHtml', 'getAverageValueSuffix',
        'buildCityLeaguePlacementStatsMap', 'enrichCityLeagueDataWithPlacementStats',
        'getInternationalPrintsForCard', 'getOtherInternationalPrintOwnedCount',
    ];
    for (const fn of topLevelFns) {
        if (!exported[fn] && typeof sandbox[fn] === 'function') {
            exported[fn] = sandbox[fn];
        }
        if (!exported[fn] && typeof sandbox.window[fn] === 'function') {
            exported[fn] = sandbox.window[fn];
        }
    }

    // Expose the sandbox so tests can manipulate globals (caches, maps, etc.)
    exported._sandbox = sandbox;

    return exported;
}

module.exports = { loadAppUtils };
