#!/usr/bin/env node
/**
 * build-bundle.js — Wave-1 Layer-1 foundation bundler.
 *
 * Goal: combine the ~40 defer-loaded `js/*.js` scripts into one
 * concatenated bundle, in their current load-order, preserving the
 * legacy "top-level function = global window function" semantics
 * that 600+ cross-file callers rely on.
 *
 * Why concat instead of esbuild --bundle?
 * --------------------------------------
 * The current codebase declares helpers as top-level `function foo()`
 * across files; other files call `foo()` directly because both scripts
 * execute in the page's global scope when loaded as separate <script>
 * tags. esbuild --bundle wraps everything in a module IIFE, which
 * scopes those declarations away from the global object and breaks
 * every cross-file call (30+ helpers like escapeHtml, switchTab,
 * patchUserDecksLocal, t(), …). Concat keeps them global.
 *
 * Wave-1 Layer-2 (real ES modules) is when esbuild --bundle starts
 * mattering — by then each file will have explicit imports/exports.
 *
 * What stays separate (NOT bundled here)
 * --------------------------------------
 *   - CDN scripts: Firebase compat, Chart.js, PapaParse, localforage,
 *     mobile-drag-drop — always loaded from their CDNs (incl. SRI).
 *   - js/firebase-credentials.js — written by CI at build time from a
 *     repo secret; can't be bundled in source-tree builds.
 *   - js/combo-worker.js — runs in a Web Worker, separate context.
 *   - js/pokemon-loading-screen.js, csv-cache-interceptor.js,
 *     error-tracking.js — non-defer scripts that need to run during
 *     HTML parsing for the loader animation + fetch-interception to
 *     fire before any later code.
 *   - js/inline-init.js — runs before Firebase + before everything
 *     else; window.APP_VERSION + version-check live here.
 *
 * Output
 * ------
 *   _dist/app.bundle.js       — concatenated source (LF-normalized)
 *   _dist/app.bundle.js.map   — source map mapping bundle lines back
 *                                to original files, so DevTools and
 *                                Sentry both stay useful.
 *
 * The bundle is NOT yet referenced from index.html — that swap is the
 * Layer-1 HTML cut-over step. For now this script just produces the
 * artefact so CI can ship it as a debug artifact + we can locally
 * verify it parses + has the right shape.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const REPO_ROOT = path.resolve(__dirname, '..');
const JS_DIR = path.join(REPO_ROOT, 'js');
const OUT_DIR = path.join(REPO_ROOT, '_dist');
const OUT_FILE = path.join(OUT_DIR, 'app.bundle.js');
const OUT_MAP = path.join(OUT_DIR, 'app.bundle.js.map');

// ----------------------------------------------------------------------------
// Load order — must match index.html exactly. Any future change to the
// <script> tags in index.html requires the same change here.
// ----------------------------------------------------------------------------
//
// (CDN scripts and the four "stays separate" scripts above are intentionally
// absent. Order within the bundle preserves dependency order: utils → i18n →
// firebase glue → data-cache helpers → core → feature modules → late helpers.)
const BUNDLE_ORDER = [
    // dom-helpers.js first — exposes window.dom early so subsequent files
    // can pick it up without explicit ordering. Stateless module.
    'dom-helpers.js',
    'app-utils.js',
    'i18n.js',
    // firebase-credentials.js is CI-injected; bundle assumes the var
    // window.FIREBASE_CREDS already exists when this code runs.
    'firebase-config.js',
    'firebase-globals.js',
    'firebase-auth.js',
    'auth-ui-helpers.js',
    'firebase-collection.js',
    'tcg-showdown-link.js',
    'card-data-cache.js',
    'deck-analysis-shared.js',
    'app-core.js',
    'app-price.js',
    'app-tier-meta.js',
    'app-city-league.js',
    'app-deck-builder.js',
    'card-capability-engine.js',
    'app-tech-lab.js',
    'app-anti-tech.js',
    'app-meta-cards.js',
    'app-current-meta.js',
    'app-past-meta.js',
    'app-cards-db.js',
    'app-init.js',
    'app-current-meta-analysis.js',
    'app-features.js',
    'archetype-icons.js',
    'app-meta-call.js',
    'meta-analysis-hub.js',
    'app-testing-groups.js',
    // battle-journal.js: removed from main bundle in L2.7 — now lazy-loaded.
    // meta-binder.js + custom-binder.js: removed from main bundle in L2.7 —
    // now lazy-loaded as a coupled pair (they share window._mbShared).
    // draw-simulator.js: removed from main bundle in L2.5 — now lazy-loaded
    // on first 'Test Draw' click via js/lazy-loader.js (~68 KB defer).
    // combo-worker.js: skipped — runs as Web Worker, separate context.
    // app-calculator.js: removed in L2.4 — now an ES module under
    // js/modules/app-calculator.js, bundled by scripts/build-modules.js.

    // lazy-loader.js MUST be last: it registers stubs on window that
    // depend on the rest of the bundle (e.g. showToast for error UI).
    'lazy-loader.js',
];

// ----------------------------------------------------------------------------

function readFileOrDie(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`✗ Failed to read ${filePath}: ${err.message}`);
        process.exit(1);
    }
}

function buildSourceMap(parts) {
    // Minimal source map: each input file gets one source entry; mappings
    // are line-based — column accuracy isn't needed because we don't do any
    // per-token transforms. DevTools + Sentry both accept "VLQ AAAA"
    // entries which map "first column of bundle line N → source N, line N,
    // column 0". This is enough to make Sentry stack frames readable.
    const sources = [];
    const sourcesContent = [];
    const mappingsLines = [];

    // VLQ alphabet for base64
    const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    function vlqEncode(num) {
        let vlq = num < 0 ? ((-num) << 1) | 1 : num << 1;
        let out = '';
        do {
            let digit = vlq & 31;
            vlq >>>= 5;
            if (vlq > 0) digit |= 32;
            out += BASE64[digit];
        } while (vlq > 0);
        return out;
    }

    let prevSourceIdx = 0;
    let prevSourceLine = 0;

    parts.forEach((part, sourceIdx) => {
        sources.push(part.relativePath);
        sourcesContent.push(part.source);
        const lines = part.source.split('\n');
        const numLines = lines.length;

        for (let lineInSource = 0; lineInSource < numLines; lineInSource++) {
            // "AAAA"-style segment per bundle-line:
            //   column 0 (in bundle line)
            //   sourceIdx delta
            //   sourceLine delta
            //   sourceColumn 0
            const segment =
                vlqEncode(0) +                            // bundle col
                vlqEncode(sourceIdx - prevSourceIdx) +    // source idx delta
                vlqEncode(lineInSource - prevSourceLine) +// source line delta
                vlqEncode(0);                             // source col 0
            mappingsLines.push(segment);
            prevSourceIdx = sourceIdx;
            prevSourceLine = lineInSource;
        }
        // Header line of the next file's banner contributes one more bundle
        // line with no mapping (semicolon = empty mapping for that line).
        mappingsLines.push('');
    });

    return JSON.stringify({
        version: 3,
        file: path.basename(OUT_FILE),
        sources,
        sourcesContent,
        names: [],
        mappings: mappingsLines.join(';'),
    });
}

function main() {
    const t0 = performance.now();

    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const parts = [];
    let totalInputBytes = 0;

    for (const relName of BUNDLE_ORDER) {
        const abs = path.join(JS_DIR, relName);
        if (!fs.existsSync(abs)) {
            console.error(`✗ Missing source file: ${abs}`);
            process.exit(1);
        }
        const source = readFileOrDie(abs);
        totalInputBytes += Buffer.byteLength(source, 'utf8');
        parts.push({
            relativePath: `../js/${relName}`, // relative to _dist/
            source,
        });
    }

    // Join with explicit file banners so a developer browsing the bundle
    // can find the source location quickly without consulting the map.
    const banner = (relName) => `\n/* === ${relName} === */\n`;
    const bundleBody = parts
        .map((p, i) => banner(BUNDLE_ORDER[i]) + p.source)
        .join('');
    const sourceMapUrlComment = `\n//# sourceMappingURL=${path.basename(OUT_MAP)}\n`;
    const finalBundle = bundleBody + sourceMapUrlComment;

    fs.writeFileSync(OUT_FILE, finalBundle, 'utf8');

    // Source-map generation — we use the unbanner'd parts so line numbers
    // map correctly back to the un-prefixed source.
    const sourceMap = buildSourceMap(parts);
    fs.writeFileSync(OUT_MAP, sourceMap, 'utf8');

    const t1 = performance.now();
    const outBytes = fs.statSync(OUT_FILE).size;
    const mapBytes = fs.statSync(OUT_MAP).size;

    console.log(`✓ Bundled ${BUNDLE_ORDER.length} files in ${(t1 - t0).toFixed(0)} ms`);
    console.log(`  Input total : ${(totalInputBytes / 1024).toFixed(1)} KB`);
    console.log(`  Output      : ${(outBytes / 1024).toFixed(1)} KB  → ${path.relative(REPO_ROOT, OUT_FILE)}`);
    console.log(`  Source map  : ${(mapBytes / 1024).toFixed(1)} KB  → ${path.relative(REPO_ROOT, OUT_MAP)}`);
}

main();
