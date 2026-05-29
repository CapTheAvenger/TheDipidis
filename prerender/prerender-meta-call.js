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
const OUT_RELATIVE = 'data/meta-call-snapshot.png';
const PAGE_TIMEOUT_MS = 60_000;

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

async function renderMetaCall(baseUrl) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
        ],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 1800, deviceScaleFactor: 1 });

        // Same bypass + interception trick we'd use at runtime, kept
        // here even though localhost is comfy: no SW reload, no
        // 4 363 image-prefetch requests, no font fetches.
        try { await page.setBypassServiceWorker(true); } catch (_) {}
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            if (type === 'image' || type === 'media' || type === 'font') {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Defuse the in-page version check before any app script runs.
        //
        // index.html ships an inline IIFE that fetches version.json,
        // compares against window.APP_VERSION, and on mismatch sets
        // `window.location.href = pathname + '?_v=' + new_version`.
        // That navigation tears down our execution context mid-preload
        // ("Execution context was destroyed, most likely because of a
        // navigation" in CI / runtime). The IIFE itself has an escape
        // hatch: if `sessionStorage['__tcg_version_refresh']` is set
        // it skips. We plant that key before any page script runs.
        //
        // Belt-and-braces: also no-op the three Location methods so
        // anything else that tries to navigate via reload / assign /
        // replace fails silently. Direct assignment to
        // `window.location.href` is harder to block — the version
        // check uses exactly that — but with the sessionStorage gate
        // closed the check never reaches that line.
        await page.evaluateOnNewDocument(() => {
            try { sessionStorage.setItem('__tcg_version_refresh', '1'); } catch (_) {}
            const noop = () => {};
            try {
                Location.prototype.reload = noop;
                Location.prototype.assign = noop;
                Location.prototype.replace = noop;
            } catch (_) {}
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
        // default.
        page.on('console', async (msg) => {
            const type = msg.type();
            if (type !== 'error' && type !== 'warning') return;
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
                console.log(`[page.${type}] ${parts.join(' ')}`);
            } catch {
                console.log(`[page.${type}] ${msg.text()}`);
            }
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

        console.log('Rendering canvas…');
        await page.evaluate(() => {
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
    } finally {
        await browser.close();
    }
}

async function main() {
    if (!fs.existsSync(SITE_DIR)) {
        throw new Error(`Site directory not found: ${SITE_DIR}`);
    }

    const server = await startStaticServer();
    console.log(`Serving ${SITE_DIR} at http://localhost:${PORT}`);

    try {
        const png = await renderMetaCall(`http://localhost:${PORT}/`);
        const outPath = path.join(SITE_DIR, OUT_RELATIVE);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        fs.writeFileSync(outPath, png);
        console.log(`✓ Wrote ${outPath} (${(png.length / 1024).toFixed(1)} KB)`);
    } finally {
        await new Promise((r) => server.close(r));
    }
}

main().catch((err) => {
    console.error('Pre-render failed:', err);
    process.exit(1);
});
