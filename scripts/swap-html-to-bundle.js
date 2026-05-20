#!/usr/bin/env node
/**
 * swap-html-to-bundle.js — Wave-1 Layer-1.4 HTML cut-over.
 *
 * Source tree keeps the 34 defer-loaded <script> tags (so local
 * `python -m http.server` keeps working without a build step). At
 * CI/deploy time this script swaps them out for ONE <script> tag
 * pointing at _dist/app.bundle.js (which the deploy step has copied
 * to _site/js/app.bundle.js).
 *
 * It also rewrites _site/service-worker.js SHELL_ASSETS:
 *   - removes the 34 individual ./js/<file>.js entries
 *   - inserts ./js/app.bundle.js once at the same position
 *   - leaves ./js/inline-init.js, ./js/combo-worker.js, and the CSS
 *     entries untouched (those run outside the bundle).
 *
 * Idempotent: running twice produces the same output, because the
 * second pass finds no <script> tags for the bundled files.
 *
 * Usage:
 *   node scripts/swap-html-to-bundle.js _site
 *
 * Designed to fail loudly if the source files diverge from the
 * expected pattern — better to break the build than ship a broken
 * mixed-mode index.html.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BUNDLE_ORDER = [
    'dom-helpers.js',
    'app-utils.js',
    'i18n.js',
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
    // archetype-icons.js: removed in L2.11 — now an ES module.
    'app-meta-call.js',
    'meta-analysis-hub.js',
    'app-testing-groups.js',
    // battle-journal.js, meta-binder.js, custom-binder.js: removed in L2.7
    //   — lazy-loaded on first invocation.
    // draw-simulator.js: removed in L2.5 — lazy-loaded by js/lazy-loader.js.
    // app-calculator.js removed in L2.4 — now an ES module bundled separately.
    'lazy-loader.js',
];

function die(msg) {
    console.error(`✗ swap-html-to-bundle: ${msg}`);
    process.exit(1);
}

function swapHtml(siteDir) {
    const htmlPath = path.join(siteDir, 'index.html');
    if (!fs.existsSync(htmlPath)) die(`not found: ${htmlPath}`);

    let html = fs.readFileSync(htmlPath, 'utf8');

    // L2.3: rewrite the modules-bundle path from `_dist/app.modules.bundle.js`
    // (source-tree / dev) to `js/app.modules.bundle.js` (production layout
    // after deploy copies the file into _site/js/).
    const modulesRx = /(<script\s+src=")_dist\/(app\.modules\.bundle\.js)([^"]*"\s+defer><\/script>)/g;
    if (modulesRx.test(html)) {
        modulesRx.lastIndex = 0;
        html = html.replace(modulesRx, '$1js/$2$3');
        console.log('✓ index.html: rewrote modules bundle path → js/app.modules.bundle.js');
    } else {
        console.warn('  (no _dist/app.modules.bundle.js tag found in index.html — skipping rewrite)');
    }

    // CRITICAL: insert the bundle tag at the position of the LAST removed
    // file, not the first. Reason: the bundle includes firebase-config.js,
    // which reads window.FIREBASE_CREDS — but firebase-credentials.js is
    // CI-injected as a separate <script> tag that lives BETWEEN the bundled
    // files in the original load order (between i18n.js and firebase-config.js).
    // If the bundle were placed at the FIRST removed position (app-utils.js),
    // it would execute before firebase-credentials.js → undefined CREDS →
    // app crashes.
    //
    // Same applies to the CDN scripts (Chart.js, PapaParse, localforage)
    // that sit between bundled files in the original order — they need to
    // be loaded before the bundle's card-data-cache.js etc. runs.
    //
    // By inserting at the LAST removed position, we ensure every individual
    // script (firebase-credentials, the 3 CDN libs) has already run when
    // the bundle starts.
    //
    // Idempotent: running twice produces the same output because the second
    // pass finds no <script> tags for the bundled files.
    let removed = 0;
    let leadingIndent = '    ';

    BUNDLE_ORDER.forEach((file, idx) => {
        const isLast = idx === BUNDLE_ORDER.length - 1;
        const escFile = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(
            `([ \\t]*)<script\\s+src="js/${escFile}(?:\\?v=[^"]*)?"\\s+defer></script>\\r?\\n`,
            'g'
        );
        const m = rx.exec(html);
        if (!m) {
            die(`expected <script src="js/${file}..." defer></script> in index.html — pattern not found. Refusing to swap to avoid shipping a half-converted page.`);
        }
        leadingIndent = m[1] || leadingIndent;

        if (isLast) {
            // Last file's tag becomes the bundle tag — guarantees the bundle
            // sits AFTER every other defer-script in the document, including
            // firebase-credentials.js and the CDN libs that bundled code
            // depends on.
            const bundleTag = `${leadingIndent}<script src="js/app.bundle.js?v=20260101" defer></script>\n`;
            html = html.replace(rx, bundleTag);
        } else {
            // Reset regex so .replace runs from offset 0
            const removeRx = new RegExp(
                `([ \\t]*)<script\\s+src="js/${escFile}(?:\\?v=[^"]*)?"\\s+defer></script>\\r?\\n`,
                'g'
            );
            html = html.replace(removeRx, '');
        }
        removed += 1;
    });

    fs.writeFileSync(htmlPath, html, 'utf8');
    console.log(`✓ index.html: ${removed - 1} per-file <script> tags removed, last one replaced by bundle <script>`);
}

function swapServiceWorker(siteDir) {
    const swPath = path.join(siteDir, 'service-worker.js');
    if (!fs.existsSync(swPath)) {
        console.log('  (no service-worker.js in site dir — skipping SW shell-list swap)');
        return;
    }

    let sw = fs.readFileSync(swPath, 'utf8');

    // Same idea: locate each './js/<file>.js' line in SHELL_ASSETS, drop it,
    // remember the first removal index, insert one './js/app.bundle.js' there.
    let firstIndex = -1;
    let removed = 0;

    BUNDLE_ORDER.forEach((file) => {
        const escFile = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match the line "  './js/<file>.js'," with optional trailing whitespace
        // + newline. Comma is required (the file is inside an array literal).
        const rx = new RegExp(`[ \\t]*'\\./js/${escFile}',\\r?\\n`, 'g');
        const m = rx.exec(sw);
        if (!m) {
            console.warn(`  (SW shell-list: no entry for js/${file} — already cleaned up or never listed)`);
            return;
        }
        if (firstIndex < 0) firstIndex = m.index;
        sw = sw.replace(rx, '');
        removed += 1;
    });

    if (firstIndex >= 0) {
        // Two bundle entries: modules bundle first (so the SW pre-caches it
        // before the legacy concat), then the legacy bundle.
        const bundleLines =
            `  './js/app.modules.bundle.js',\n` +
            `  './js/app.bundle.js',\n`;
        sw = sw.slice(0, firstIndex) + bundleLines + sw.slice(firstIndex);
    }

    fs.writeFileSync(swPath, sw, 'utf8');
    console.log(`✓ service-worker.js: removed ${removed} per-file SHELL_ASSETS entries, inserted 2 bundle entries (modules + legacy)`);
}

function main() {
    const siteDir = process.argv[2];
    if (!siteDir) die('usage: swap-html-to-bundle.js <_site_dir>');
    if (!fs.existsSync(siteDir)) die(`directory not found: ${siteDir}`);

    swapHtml(siteDir);
    swapServiceWorker(siteDir);
    console.log(`✓ Swap complete in ${siteDir}/`);
}

main();
