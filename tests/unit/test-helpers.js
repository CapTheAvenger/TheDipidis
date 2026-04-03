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
 * Currently exports:
 *   - sanitizeDeckDependencies
 *   - normalizeCardName
 *   - fixMojibake
 *   - getLegacyCardNameAlias
 */
function loadAppUtils() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-utils.js'),
        'utf-8'
    );

    // Extract LEGACY_CARD_NAME_ALIASES constant
    const aliasMatch = src.match(/const LEGACY_CARD_NAME_ALIASES = Object\.freeze\(\{[\s\S]*?\}\);/m);
    if (!aliasMatch) throw new Error('Could not extract LEGACY_CARD_NAME_ALIASES from app-utils.js');

    const snippet = [
        aliasMatch[0],
        extractFunction(src, 'fixMojibake'),
        extractFunction(src, 'getLegacyCardNameAlias'),
        extractFunction(src, 'normalizeCardName'),
        extractFunction(src, 'sanitizeDeckDependencies'),
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
    };

    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippet, ctx, { filename: 'app-utils-extract.js' });

    return {
        fixMojibake: sandbox.fixMojibake,
        getLegacyCardNameAlias: sandbox.getLegacyCardNameAlias,
        normalizeCardName: sandbox.normalizeCardName,
        sanitizeDeckDependencies: sandbox.sanitizeDeckDependencies,
    };
}

module.exports = { loadAppUtils };
