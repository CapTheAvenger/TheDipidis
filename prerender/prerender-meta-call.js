/**
 * CI-time renderer for the Meta Call dashboard PNG.
 *
 * Runs against the built `_site/` directory just before GitHub
 * Pages deploys it: spins up a tiny static server, loads
 * index.html in headless Chrome, drives MetaCall.preload() +
 * exportFieldAndRecsShareImage(), and writes the resulting PNG
 * back into `_site/data/meta-call-snapshot.png`. GitHub Pages
 * then serves that PNG alongside the rest of the site, and the
 * Telegram bot just fetches it instead of running a browser per
 * request.
 *
 * Why pre-render at all:
 *   • Meta Call data only changes when the scrapers update the
 *     site, which already triggers a deploy. There's nothing
 *     per-user about the dashboard — every viewer sees the same
 *     image until the next scraper run. Re-rendering at request
 *     time is wasteful.
 *   • Render Free has 512 MB. Live Puppeteer + Chromium plus the
 *     full app boot (offline image prefetcher, SW activation,
 *     280 MB of CSV/JSON loads) hits OOM long before the canvas
 *     finishes. We saw "Execution context was destroyed" failures
 *     on every attempt.
 *   • Telegram users tap a button; they expect a sub-second
 *     reply, not 40 s of warm-up. Static fetch from GitHub Pages
 *     is ~1 s.
 *
 * Usage (from the workflow):
 *   node prerender-meta-call.js ../_site
 *
 * On the GitHub Actions runner we set PUPPETEER_SKIP_DOWNLOAD=true
 * and PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable so
 * Puppeteer uses the runner's pre-installed Chrome instead of
 * downloading its own 280 MB copy on every CI run.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SITE_DIR = path.resolve(__dirname, process.argv[2] || '../_site');
const PORT = parseInt(process.env.PRERENDER_PORT || '5544', 10);
const PAGE_TIMEOUT_MS = 60_000;

// Past-meta format key. Derived from tournament_cards_manifest.json
// at build time — the most-recently-closed rotation key (the chunk
// with the newest max_date that ends BEFORE the current set's
// release) is what we want here. Hardcoding broke every rotation
// because nobody remembered to update the constant; the manifest
// already has the answer.
//
// Env var PAST_FORMAT_KEY still takes precedence so the workflow
// can pin a specific past key during testing without editing code.
function derivePastFormatKey() {
    const override = (process.env.PAST_FORMAT_KEY || '').trim();
    if (override) return override;
    const manifestPath = path.join(SITE_DIR, 'data', 'tournament_cards_manifest.json');
    if (!fs.existsSync(manifestPath)) {
        throw new Error(`tournament_cards_manifest.json missing at ${manifestPath} — cannot derive past format key`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const chunks = manifest.chunk_dates || {};
    const fwPath = path.join(SITE_DIR, 'data', 'format_window.json');
    const fw = fs.existsSync(fwPath) ? JSON.parse(fs.readFileSync(fwPath, 'utf-8')) : {};
    const currentSet = String(fw.current_set || '').trim().toUpperCase();
    // Pick the newest rotation key whose NEWEST half isn't the
    // current set — that's the rotation that was active right before
    // the current one. We use the chunk's max_date as the recency
    // signal (not min_date), since rotation boundaries can drift via
    // late tournaments held in the lag window (Melbourne 2026-05-23
    // landed in TEF-POR even though CRI had already released).
    const candidates = [];
    for (const [chunkName, dates] of Object.entries(chunks)) {
        const meta = chunkName.replace('tournament_cards_data_cards_', '').replace('.csv', '');
        if (!meta.includes('-')) continue;
        const [, newestSet] = meta.split('-', 2);
        if (currentSet && newestSet.toUpperCase() === currentSet) continue;
        candidates.push({ meta, max_date: dates.max_date || '' });
    }
    if (candidates.length === 0) {
        throw new Error('no past-rotation candidate in chunk_dates — manifest may be empty or only carry the current rotation');
    }
    candidates.sort((a, b) => (b.max_date || '').localeCompare(a.max_date || ''));
    return candidates[0].meta;
}
const PAST_FORMAT_KEY = derivePastFormatKey();
console.log(`[prerender] PAST_FORMAT_KEY = ${PAST_FORMAT_KEY}`);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv':  'text/csv; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.webmanifest': 'application/manifest+json',
};

function startStaticServer() {
    const server = http.createServer((req, res) => {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const filePath = path.join(SITE_DIR, urlPath);
        // Block parent-directory traversal — important whenever you
        // bolt a static server onto a build process.
        if (!filePath.startsWith(SITE_DIR)) {
            console.warn(`[server] 403 ${urlPath}`);
            res.writeHead(403).end();
            return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            // Surface 404s so a missing data file shows up next to the
            // page errors instead of bottling up in unrelated stack traces.
            console.warn(`[server] 404 ${urlPath}`);
            res.writeHead(404).end();
            return;
        }
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
            'Content-Length': stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
    });
    return new Promise((resolve) => {
        server.listen(PORT, () => resolve(server));
    });
}

async function renderMetaCall(baseUrl, currentFormatKey) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    /** @type {Array<{ kind: 'current'|'past', key: string, png: Buffer }>} */
    const renders = [];

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1800, deviceScaleFactor: 1 });

        // Same bypass + interception trick we'd use at runtime, kept
        // here even though localhost is comfy: no SW reload, no
        // 4 363 image-prefetch requests, no font fetches.
        //
        // Plus we now block the scripts whose side-effects compete with
        // the render and previously seemed to take the renderer down:
        //   • offline-prefetch.js — cache.add()'s the entire 285 MB
        //     data bundle through the Cache API. In a headless tab
        //     with no persistent storage that quickly hits quota and
        //     the renderer process dies, taking the execution
        //     context with it. We don't need offline behaviour for
        //     a one-shot render.
        //   • firebase-*-compat.js — initializes Auth + Firestore and
        //     opens long-poll connections we don't use. Failed
        //     network attempts surface as empty `page.error` blobs.
        //   • error-tracking.js — wires Sentry; pointless overhead
        //     here and a possible source of spurious errors.
        //   • battle-journal.js — also touches Firebase.
        const BLOCKED_SCRIPT_PATTERNS = [
            /\/offline-prefetch(\.[^/]*)?\.js$/,
            /\/firebase-(app|auth|firestore|globals|config|collection|credentials|auth-ui-helpers)(\.[^/]*)?\.js$/,
            /\/auth-ui-helpers(\.[^/]*)?\.js$/,
            /\/error-tracking(\.[^/]*)?\.js$/,
            /\/battle-journal(\.[^/]*)?\.js$/,
        ];
        // Defuse multiple ways the page can navigate / reload before
        // we get a chance to render. Layered so each defense covers a
        // different trigger:
        //
        //   1. Disable the version-check IIFE in index.html by setting
        //      its sessionStorage escape-hatch key.
        //   2. Reject Service-Worker registration so the SW never
        //      installs → never activates → never fires
        //      `controllerchange` → the listener in index.html never
        //      calls window.location.reload(). (We already pass
        //      setBypassServiceWorker(true) but that only stops the
        //      SW from controlling requests; it still installs.)
        //   3. Replace Location.prototype.{reload,assign,replace}
        //      with no-ops in case any other code path calls them
        //      directly.
        //
        // page.setRequestInterception() also aborts post-initial
        // navigation requests as a final net, but those teardown
        // events fire late enough that the context is sometimes
        // already gone — so we want the JS-side defenses to win first.
        await page.evaluateOnNewDocument(() => {
            try { sessionStorage.setItem('__tcg_version_refresh', '1'); } catch (_) {}

            try {
                if (navigator.serviceWorker) {
                    // Reject every register() call. Cast to a Promise
                    // rejection so the calling code's .catch handlers
                    // (if any) see a real failure.
                    Object.defineProperty(navigator.serviceWorker, 'register', {
                        value: () => Promise.reject(new Error('SW registration disabled for prerender')),
                        writable: false,
                        configurable: false,
                    });
                }
            } catch (_) {}

            const blockedReload = () => {
                // Visible in CI logs so we can tell which defense
                // caught a trigger.
                try { console.warn('[prerender] Location.reload/assign/replace blocked'); } catch (_) {}
            };
            try {
                Object.defineProperty(Location.prototype, 'reload', {
                    value: blockedReload,
                    writable: false,
                    configurable: false,
                });
                Object.defineProperty(Location.prototype, 'assign', {
                    value: blockedReload,
                    writable: false,
                    configurable: false,
                });
                Object.defineProperty(Location.prototype, 'replace', {
                    value: blockedReload,
                    writable: false,
                    configurable: false,
                });
            } catch (_) {}
        });

        try { await page.setBypassServiceWorker(true); } catch (_) {}
        // After the initial navigation we abort every further
        // navigation request at the protocol level — that catches
        // window.location.reload(), location.assign(), href
        // assignment, form submits, anchor clicks, and anything else
        // Chrome would otherwise honour. Cleaner than chasing each
        // JS-side trigger one by one.
        let initialNavigationConsumed = false;
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();

            if (type === 'image' || type === 'media' || type === 'font') {
                req.abort();
                return;
            }

            if (req.isNavigationRequest() && req.frame() === page.mainFrame()) {
                if (initialNavigationConsumed) {
                    console.log(`[blocked-nav] ${req.method()} ${req.url()}`);
                    req.abort();
                    return;
                }
                initialNavigationConsumed = true;
            }

            // The SW worker script itself — abort the fetch so even
            // if our register() override is somehow bypassed, the
            // browser has nothing to install.
            if (req.url().endsWith('/service-worker.js')) {
                console.log('[blocked-sw] service-worker.js fetch aborted');
                req.abort();
                return;
            }

            if (type === 'script') {
                const url = req.url();
                if (BLOCKED_SCRIPT_PATTERNS.some((re) => re.test(url))) {
                    console.log(`[blocked-script] ${url.replace(/^https?:\/\/[^/]+/, '')}`);
                    req.abort();
                    return;
                }
            }

            req.continue();
        });

        // Surface navigations so a future regression here doesn't
        // hide behind a misleading "context destroyed".
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) {
                console.log(`[page.navigated] ${frame.url()}`);
            }
        });

        // Surface page errors with their message text instead of
        // the JSHandle@error placeholder Puppeteer hands us by
        // default. Falls back to msg.text() when arg serialization
        // returns empty (e.g. for some resource-load errors that
        // Chrome reports without console-style args).
        page.on('console', async (msg) => {
            const type = msg.type();
            if (type !== 'error' && type !== 'warning') return;
            let serialized = '';
            try {
                const parts = await Promise.all(
                    msg.args().map(async (h) => {
                        try {
                            const v = await h.jsonValue();
                            if (v && typeof v === 'object' && v.message) return v.message;
                            return typeof v === 'string' ? v : JSON.stringify(v);
                        } catch {
                            return h.toString();
                        }
                    }),
                );
                serialized = parts.filter(Boolean).join(' ');
            } catch { /* fall through */ }
            const text = serialized || msg.text() || '<no message>';
            const loc = msg.location ? msg.location() : null;
            const where = loc?.url ? ` (${loc.url.replace(/^https?:\/\/[^/]+/, '')}${loc.lineNumber != null ? `:${loc.lineNumber}` : ''})` : '';
            console.log(`[page.${type}]${where} ${text}`);
        });
        page.on('pageerror', (err) => console.log('[page.uncaught]', err.message));

        console.log(`Navigating to ${baseUrl}`);
        await page.goto(baseUrl, {
            waitUntil: 'domcontentloaded',
            timeout: PAGE_TIMEOUT_MS,
        });

        // Belt-and-braces: even with bypassed SW, neuter the reload
        // listener in case some other path tries to navigate the page.
        await page.evaluate(() => {
            const noop = () => {};
            try { window.location.reload = noop; } catch (_) {}
        });

        console.log('Waiting for window.MetaCall…');
        await page.waitForFunction(
            () =>
                window.MetaCall &&
                typeof window.MetaCall.preload === 'function' &&
                typeof window.MetaCall.exportFieldAndRecsShareImage === 'function',
            { timeout: PAGE_TIMEOUT_MS },
        );

        console.log('Preloading scraper data…');
        await page.evaluate(async () => {
            await window.MetaCall.preload();
        });

        // Helper: trigger MetaCall.exportFieldAndRecsShareImage(),
        // wait for the share-preview modal's <img> to appear, grab
        // the base64 data URL, then remove the modal so the NEXT
        // export call mounts a fresh one (the export function does
        // `old?.remove()` itself — but our waitForSelector keys off
        // the same id, so reusing the modal would short-circuit the
        // wait and return the previous render).
        async function renderCurrentState() {
            await page.evaluate(() => {
                const old = document.getElementById('mc-share-preview-modal');
                if (old) old.remove();
                window.MetaCall.exportFieldAndRecsShareImage();
            });
            await page.waitForSelector(
                '#mc-share-preview-modal .mc-share-preview-img',
                { timeout: 30_000 },
            );
            const dataUrl = await page.$eval(
                '#mc-share-preview-modal .mc-share-preview-img',
                (img) => img.src,
            );
            if (!dataUrl?.startsWith('data:image/png;base64,')) {
                throw new Error(`unexpected share-image src: ${String(dataUrl).slice(0, 80)}…`);
            }
            return Buffer.from(dataUrl.slice('data:image/png;base64,'.length), 'base64');
        }

        console.log('Rendering current meta…');
        renders.push({
            kind: 'current',
            key: currentFormatKey,
            png: await renderCurrentState(),
        });

        // Switch the in-page MetaCall state to past mode for the
        // requested format key, wait for its async load chain to
        // settle, then render again. _setMetaSource is awaitable —
        // it resolves after _shareList + _matchupMap have been
        // populated for the past meta — so the next exportField
        // call paints the right data.
        console.log(`Switching to past meta ${PAST_FORMAT_KEY}…`);
        await page.evaluate(async (key) => {
            await window.MetaCall._setMetaSource('past', key);
        }, PAST_FORMAT_KEY);

        // Verify the matchup map actually has data for this past
        // format. Without this guard a missing/incomplete map silently
        // produced a past PNG where every recommendation showed the
        // 50/50 default — discovered post-deploy, embarrassingly.
        // Refuses to render rather than ship a misleading image.
        const pastMatchupPairs = await page.evaluate(() => {
            return window.MetaCall && window.MetaCall._diag
                ? window.MetaCall._diag.pastMatchupPairs()
                : 0;
        });
        console.log(`Past meta matchup pairs available: ${pastMatchupPairs}`);
        if (pastMatchupPairs === 0) {
            throw new Error(
                `Past meta ${PAST_FORMAT_KEY} has no matchup pairs loaded — `
                + 'the resulting PNG would show identical 50/50 placeholder '
                + 'recommendations. Refusing to render. Check that '
                + 'data/labs_tournament_matchups.csv contains rows for '
                + PAST_FORMAT_KEY + ' and that loadData() completed before '
                + 'the past-source switch.',
            );
        }

        console.log('Rendering past meta…');
        renders.push({
            kind: 'past',
            key: PAST_FORMAT_KEY,
            png: await renderCurrentState(),
        });

        return renders;
    } finally {
        await browser.close();
    }
}

function readCurrentFormatKey() {
    // Derive the current rotation's format key from format_window.json,
    // which the scraper updates on every run. Falls back to a literal
    // if the file is missing or malformed so a broken scraper doesn't
    // take the prerender step down.
    try {
        const raw = fs.readFileSync(path.join(SITE_DIR, 'data', 'format_window.json'), 'utf8');
        const parsed = JSON.parse(raw);
        const oldest = parsed.oldest_legal_set;
        const current = parsed.current_set;
        if (oldest && current) return `${oldest}-${current}`;
    } catch (err) {
        console.warn('[prerender] format_window.json unreadable, defaulting key:', err.message);
    }
    return 'TEF-CRI';
}

async function main() {
    if (!fs.existsSync(SITE_DIR)) {
        throw new Error(`Site directory not found: ${SITE_DIR}`);
    }

    const currentFormatKey = readCurrentFormatKey();
    console.log(`Current rotation key: ${currentFormatKey}`);
    console.log(`Past meta key:        ${PAST_FORMAT_KEY}`);

    const server = await startStaticServer();
    console.log(`Serving ${SITE_DIR} at http://localhost:${PORT}`);

    try {
        const renders = await renderMetaCall(`http://localhost:${PORT}/`, currentFormatKey);
        const dataDir = path.join(SITE_DIR, 'data');
        fs.mkdirSync(dataDir, { recursive: true });

        for (const r of renders) {
            const outPath = path.join(dataDir, `meta-call-snapshot-${r.kind}.png`);
            fs.writeFileSync(outPath, r.png);
            console.log(`✓ ${r.kind.padEnd(7)} ${r.key} → ${path.relative(SITE_DIR, outPath)} (${(r.png.length / 1024).toFixed(1)} KB)`);
        }

        // Bot reads this to know what to put on its inline-keyboard
        // labels without having to fetch + parse format_window.json
        // separately. Updated atomically next to the PNGs so the bot
        // never sees a label that doesn't match the image it's about
        // to fetch.
        const infoPath = path.join(dataDir, 'meta-call-info.json');
        const info = {
            generated_at: new Date().toISOString(),
            current: { kind: 'current', key: currentFormatKey, file: 'meta-call-snapshot-current.png' },
            past:    { kind: 'past',    key: PAST_FORMAT_KEY,  file: 'meta-call-snapshot-past.png' },
        };
        fs.writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n');
        console.log(`✓ wrote ${path.relative(SITE_DIR, infoPath)}`);
    } finally {
        await new Promise((r) => server.close(r));
    }
}

main().catch((err) => {
    console.error('Pre-render failed:', err);
    process.exit(1);
});
