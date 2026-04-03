/**
 * test-helpers.js — Test utility exports
 * 
 * Exports test-friendly wrappers that extract and run functions from
 * production code in isolated VM sandboxes.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Extract a function definition from source code by name.
 * Handles block-scoped functions with proper brace matching.
 */
function extractFunction(src, fnName) {
    const fnPattern = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = fnPattern.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);

    const start = m.index;
    const openIdx = src.indexOf('{', start);
    if (openIdx < 0) throw new Error(`Missing opening brace for: ${fnName}`);

    let depth = 0;
    let end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        if (depth === 0) {
            end = i + 1;
            break;
        }
    }
    if (end < 0) throw new Error(`Missing closing brace for: ${fnName}`);
    return src.slice(start, end);
}

/**
 * Load app-utils.js functions in an isolated VM context.
 * 
 * Supports two patterns:
 *   - loadAppUtils() - Returns all available functions
 *   - loadAppUtils(overrides) - Custom environment with function overrides
 * 
 * Currently exports:
 *   - sanitizeDeckDependencies
 *   - normalizeCardName
 *   - fixMojibake
 *   - getLegacyCardNameAlias
 *   - calculateCombinedVariantStats
 *   - getPreferredVersionForCard
 *   - normalizeDeckEntries
 */
function loadAppUtils(overrides = {}) {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-utils.js'),
        'utf-8'
    );

    // Extract LEGACY_CARD_NAME_ALIASES constant
    const aliasMatch = src.match(/const LEGACY_CARD_NAME_ALIASES = Object\.freeze\(\{[\s\S]*?\}\);/m);
    if (!aliasMatch) throw new Error('Could not extract LEGACY_CARD_NAME_ALIASES from app-utils.js');

    // Always extract all functions
    const snippet = [
        aliasMatch[0],
        extractFunction(src, 'fixMojibake'),
        extractFunction(src, 'getLegacyCardNameAlias'),
        extractFunction(src, 'normalizeCardName'),
        extractFunction(src, 'getStrictBaseCardName'),
        extractFunction(src, 'sanitizeDeckDependencies'),
        extractFunction(src, 'normalizeDeckEntries'),
        extractFunction(src, 'getRarityPriority'),
        extractFunction(src, 'getLegalMaxCopies'),
        extractFunction(src, 'calculateCombinedVariantStats'),
        extractFunction(src, 'getPreferredVersionForCard'),
    ].join('\n\n');

    const sandbox = {
        console,
        String,
        Number,
        Object,
        Array,
        Map,
        Set,
        Math,
        JSON,
        parseInt,
        parseFloat,
        isNaN,
        window: {
            englishSetCodes: new Set(),
            cityLeagueDeck: {},
            cityLeagueDeckOrder: [],
            currentMetaDeck: {},
            currentMetaDeckOrder: [],
            pastMetaDeck: {},
            pastMetaDeckOrder: [],
            ...overrides.window,
        },
        preferredVersionCache: new Map(),
        debugVersionSelectionLog: () => {},
        devLog: () => {},
        // Default helper functions that may be overridden
        normalizeSetCode: (s) => s ? String(s).toUpperCase().trim() : '',
        normalizeCardNumber: (n) => n ? String(n).trim() : '',
        getGlobalRarityPreference: () => 'min',
        getRarityPreference: () => null,
        getEnglishCardVersions: () => [],
        getInternationalPrintsForCard: () => [],
        getIndexedCardBySetNumber: () => null,
        getCanonicalCardRecord: () => null,
        getDisplayCardName: (name) => String(name || ''),
        isAceSpec: () => false,
        isBasicEnergyCardEntry: (card) => {
            const name = String((card && (card.card_name || card.name)) || '').toLowerCase().trim();
            const basicNames = ['grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy'];
            return basicNames.includes(name);
        },
        isBasicEnergy: (name) => {
            const basicNames = ['grass energy', 'fire energy', 'water energy', 'lightning energy',
                'psychic energy', 'fighting energy', 'darkness energy', 'metal energy'];
            return basicNames.includes(String(name || '').toLowerCase().trim());
        },
        isPrismStarCard: (name) => String(name || '').toLowerCase().includes('prism star'),
        isRadiantPokemon: (card) => {
            const name = String((card && (card.card_name || card.name)) || card || '').toLowerCase().trim();
            return name.startsWith('radiant ');
        },
        getTotalAceSpecCopiesInDeck: () => 0,
        getTotalRadiantCopiesInDeck: () => 0,
        getCanonicalDeckKey: (name, set, number) => {
            const n = String(name || '').trim();
            const s = String(set || '').trim().toUpperCase();
            const num = String(number || '').trim();
            return (s && num) ? `${n} (${s} ${num})` : n;
        },
        cardsBySetNumberMap: {},
        cardsByNameMap: {},
        setOrderMap: {},
    };

    // Merge overrides into sandbox (function and value overrides)
    Object.assign(sandbox, overrides);

    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippet, ctx, { filename: 'app-utils-extract.js' });

    const result = {
        fixMojibake: sandbox.fixMojibake,
        getLegacyCardNameAlias: sandbox.getLegacyCardNameAlias,
        normalizeCardName: sandbox.normalizeCardName,
        getStrictBaseCardName: sandbox.getStrictBaseCardName,
        sanitizeDeckDependencies: sandbox.sanitizeDeckDependencies,
        normalizeDeckEntries: sandbox.normalizeDeckEntries,
        getRarityPriority: sandbox.getRarityPriority,
        getLegalMaxCopies: sandbox.getLegalMaxCopies,
        calculateCombinedVariantStats: sandbox.calculateCombinedVariantStats,
        getPreferredVersionForCard: sandbox.getPreferredVersionForCard,
        _sandbox: sandbox,  // Expose sandbox for test modifications
    };
    
    return result;
}

module.exports = { loadAppUtils };
