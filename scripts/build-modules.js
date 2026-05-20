#!/usr/bin/env node
/**
 * build-modules.js — Wave-1 Layer-2.3 esbuild hybrid bundler.
 *
 * Companion to scripts/build-bundle.js (which concatenates the legacy
 * top-level-globals scripts). This script handles the OTHER half of the
 * hybrid architecture: files that opt into real `import` / `export`
 * syntax, living under `js/modules/`.
 *
 * Output
 * ------
 *   _dist/app.modules.bundle.js       — esbuild output, IIFE-wrapped
 *   _dist/app.modules.bundle.js.map   — source map
 *
 * Load order at runtime
 * ---------------------
 *   1. `_dist/app.modules.bundle.js` (this file's output) — assigns all
 *      ES-module exports onto `window` for legacy interop.
 *   2. `_dist/app.bundle.js`         — legacy concat, can read those
 *      globals as if they'd always been there.
 *
 * Why a separate bundle (not one esbuild for everything)?
 * -------------------------------------------------------
 *   esbuild --bundle wraps modules in IIFEs, which scopes their top-level
 *   declarations away from `window`. The bulk of the codebase still relies
 *   on top-level `function foo()` being globally callable — converting all
 *   of that to real `export` (and updating every caller) is multi-month
 *   work. The hybrid model lets us migrate file-by-file: as a file becomes
 *   ready, it moves to `js/modules/` and gets re-exported here. Until
 *   then, the legacy concat keeps shipping.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { performance } = require('perf_hooks');

const REPO_ROOT = path.resolve(__dirname, '..');
const ENTRY = path.join(REPO_ROOT, 'js', 'modules', 'index.js');
const OUT_DIR = path.join(REPO_ROOT, '_dist');
const OUT_FILE = path.join(OUT_DIR, 'app.modules.bundle.js');

async function main() {
    if (!fs.existsSync(ENTRY)) {
        console.log(
            `(no modules entrypoint at ${path.relative(REPO_ROOT, ENTRY)} — skipping)`
        );
        return;
    }
    if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

    const t0 = performance.now();

    await esbuild.build({
        entryPoints: [ENTRY],
        bundle: true,
        format: 'iife',
        globalName: 'AppModules',
        target: ['es2020'],
        platform: 'browser',
        sourcemap: true,
        outfile: OUT_FILE,
        legalComments: 'none',
        // Footer: copy every export onto window for legacy-global interop.
        // `globalName:'AppModules'` makes esbuild assign the IIFE's return
        // value to `var AppModules`, which in a classic <script> tag is
        // implicitly `window.AppModules`. The footer then mirrors each
        // export name as a direct `window.<name>`, so legacy callers can
        // write `foo()` rather than `AppModules.foo()`.
        footer: {
            js:
                'if (typeof AppModules !== "undefined" && AppModules) {' +
                '  for (var __k in AppModules) {' +
                '    if (Object.prototype.hasOwnProperty.call(AppModules, __k)) {' +
                '      try { window[__k] = AppModules[__k]; } catch (_) {}' +
                '    }' +
                '  }' +
                '}',
        },
        logLevel: 'warning',
    });

    const t1 = performance.now();
    const outBytes = fs.statSync(OUT_FILE).size;
    const mapBytes = fs.existsSync(OUT_FILE + '.map')
        ? fs.statSync(OUT_FILE + '.map').size
        : 0;

    console.log(
        `✓ Built modules bundle in ${(t1 - t0).toFixed(0)} ms`
    );
    console.log(
        `  Output      : ${(outBytes / 1024).toFixed(1)} KB  → ${path.relative(REPO_ROOT, OUT_FILE)}`
    );
    if (mapBytes) {
        console.log(
            `  Source map  : ${(mapBytes / 1024).toFixed(1)} KB  → ${path.relative(REPO_ROOT, OUT_FILE)}.map`
        );
    }
}

main().catch((err) => {
    console.error(`✗ build-modules failed: ${err.message}`);
    process.exit(1);
});
