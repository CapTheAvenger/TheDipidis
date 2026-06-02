/**
 * Tutorial screenshot generator.
 *
 * Produces the 6 PNGs the How-To-Use section embeds at
 * /images/tutorials/01-meta-hub.png … 06-telegram-bot.png. Until
 * this script is run those slots 404 and the tutorial shows the
 * placeholder gradient — which is what triggered "fix the tutorial
 * screenshots" in the marketing-readiness pass.
 *
 * Output dimensions: 720×1280 portrait. The CSS for the tutorial
 * card uses `aspect-ratio: 9 / 16` + `object-fit: cover` so portrait
 * is the natural fit. Higher DPI (2×) for crispness on retina
 * displays without ballooning the file size.
 *
 * Usage (one-shot, locally):
 *   1. Serve the repo root: `python3 -m http.server 8000`
 *   2. Run: `node prerender/screenshot-tutorial.js`
 *
 * Or via CI (workflow_dispatch trigger): see
 * .github/workflows/tutorial-screenshots.yml.
 *
 * Each capture function drives the page into the correct state,
 * waits for the data to render, then takes the shot. If you change
 * the UI of one of the captured views, re-run this script and
 * commit the new PNG.
 *
 * For #6 (Telegram bot) we render a self-contained HTML mock
 * because we can't drive an actual Telegram client. The mock lives
 * in `prerender/telegram-mock.html` and reproduces the chat layout
 * the user actually sees when they tap the bot.
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(REPO_ROOT, 'images', 'tutorials');
const PORT = parseInt(process.env.TUTORIAL_SCREENSHOT_PORT || '8765', 10);

// Portrait phone-style — matches the README's stated tutorial dims
// and the CSS aspect-ratio: 9 / 16.
const VIEWPORT = { width: 720, height: 1280 };
const DPR = 2;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.csv':  'text/csv; charset=utf-8',
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
        const filePath = path.join(REPO_ROOT, urlPath);
        if (!filePath.startsWith(REPO_ROOT)) {
            res.writeHead(403).end();
            return;
        }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
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

async function openPage(browser, urlPath) {
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DPR,
        locale: 'en-US',
        // Service workers in headless mode cache the previous version
        // and then trigger skipWaiting() → reload() mid-render, which
        // destroys the JS execution context exactly when we're trying
        // to drive the page (capture02MetaCall reproducibly fails on
        // it). Turning the SW off entirely for the screenshot run
        // skips the cache + reload dance.
        serviceWorkers: 'block',
    });
    // Pin language + clear any persistent state from prior shots before
    // the page loads. localStorage edits inside addInitScript fire at
    // each new document, so the language is locked from the first
    // synchronous tick.
    await context.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('app_lang', 'en');
        } catch (_) { /* ignore */ }
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        const type = msg.type();
        if (type === 'error') console.error(`[page] ${msg.text()}`);
    });
    // Defensive: if anything causes a navigation during a shoot, the
    // next evaluate() throws "Execution context destroyed". Catch and
    // log so the failure mode is visible instead of cascading.
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) {
            // Don't spam — only log the post-initial-load navigations.
            const url = frame.url();
            if (url && !url.endsWith(urlPath)) {
                console.warn(`[page] mid-shot navigation: ${url}`);
            }
        }
    });
    await page.goto(`http://127.0.0.1:${PORT}${urlPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 60_000,
    });
    await page.waitForFunction(
        () => typeof window.switchTab === 'function',
        null,
        { timeout: 30_000 },
    );
    // Wait for network to quiesce so the boot-time CSV fetches finish
    // before we start driving tabs. Tolerate up to 8 s of idle wait.
    try {
        await page.waitForLoadState('networkidle', { timeout: 8_000 });
    } catch (_) { /* tolerate — some background prefetches never idle */ }
    await page.addStyleTag({
        content: `
            *, *::before, *::after {
                animation: none !important;
                transition: none !important;
            }
            html { scroll-behavior: auto !important; }
        `,
    });
    return { page, context };
}

async function shoot(page, outFile, options = {}) {
    const fullPath = path.join(OUTPUT_DIR, outFile);
    await page.screenshot({
        path: fullPath,
        fullPage: options.fullPage === true,
        clip: options.clip,
        type: 'png',
    });
    const size = fs.statSync(fullPath).size;
    console.log(`  ✓ ${outFile} (${(size / 1024).toFixed(0)} KB)`);
}

// ── Per-shot drivers ────────────────────────────────────────────

async function capture01MetaHub(browser) {
    console.log('[01] Meta Hub');
    const { page, context } = await openPage(browser, '/index.html');
    await page.evaluate(() => window.switchTab && window.switchTab('current-meta-hub'));
    // Hub tiles + card legend below — let the tile data render.
    await page.waitForTimeout(2000);
    await shoot(page, '01-meta-hub.png');
    await context.close();
}

async function capture02MetaCall(browser) {
    console.log('[02] Meta Call');
    const { page, context } = await openPage(browser, '/index.html');
    // Meta Call lives under the Profile tab as a sub-tab — drive the
    // tab switches via the helper functions the rest of the app uses.
    await page.evaluate(async () => {
        if (typeof window.switchTab === 'function') window.switchTab('profile');
        if (typeof window.switchProfileTab === 'function') {
            window.switchProfileTab('metacall');
        }
        // Force Meta Call to load even if the toggle missed.
        if (window.MetaCall && typeof window.MetaCall.init === 'function') {
            try { await window.MetaCall.init(); } catch (_) { /* tolerate */ }
        }
    });
    // Wait for VISIBLE Meta Call content (the header h2 only renders
    // once init() has produced the dashboard markup).
    await page.waitForFunction(() => {
        const wrap = document.querySelector('.metacall-wrap');
        if (!wrap) return false;
        const rect = wrap.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
    }, { timeout: 30_000 });
    await page.waitForTimeout(3000);
    await shoot(page, '02-meta-call.png');
    await context.close();
}

async function capture03DeckBuilder(browser) {
    console.log('[03] Deck Builder (Current Meta Deck Analysis)');
    const { page, context } = await openPage(browser, '/index.html');
    await page.evaluate(() => window.switchTab && window.switchTab('current-meta-analysis'));
    // Wait for analysis data to load + a deck card to render.
    await page.waitForTimeout(3500);
    await shoot(page, '03-deck-builder.png');
    await context.close();
}

async function capture04CookingMode(browser) {
    console.log('[04] Cooking Mode');
    const { page, context } = await openPage(browser, '/index.html');
    await page.evaluate(() => window.switchTab && window.switchTab('current-meta-analysis'));
    await page.waitForTimeout(2500);
    // Toggle Cooking Mode if a button is present. Falls back to
    // the regular Deck Analysis view if Cooking Mode UI is hidden
    // behind a flag.
    await page.evaluate(() => {
        const btn = document.querySelector('[data-action="toggle-cooking"], .cooking-mode-toggle, #cookingModeToggle');
        if (btn) btn.click();
    });
    await page.waitForTimeout(1500);
    await shoot(page, '04-cooking-mode.png');
    await context.close();
}

async function capture05CardOverview(browser) {
    console.log('[05] Card Database');
    const { page, context } = await openPage(browser, '/index.html');
    await page.evaluate(() => window.switchTab && window.switchTab('cards'));
    // Wait for card grid to populate.
    await page.waitForSelector('.cards-grid, .card-database-grid, .card-result', {
        timeout: 30_000,
    }).catch(() => { /* tolerate selector miss — shoot whatever rendered */ });
    await page.waitForTimeout(2500);
    await shoot(page, '05-card-overview.png');
    await context.close();
}

async function capture06TelegramBot(browser) {
    console.log('[06] Telegram bot (mock chat)');
    const context = await browser.newContext({
        viewport: VIEWPORT,
        deviceScaleFactor: DPR,
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/prerender/telegram-mock.html`, {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
    });
    await page.waitForTimeout(800);
    await shoot(page, '06-telegram-bot.png');
    await context.close();
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    console.log(`[boot] starting static server on :${PORT}`);
    const server = await startStaticServer();
    let exitCode = 0;
    try {
        // Allow overriding the executable path so the script works in
        // sandboxed CI environments where the playwright-managed
        // browser cache version mismatches the host's installed
        // Chromium. Set CHROMIUM_PATH or fall back to system browsers.
        const exec = process.env.CHROMIUM_PATH
            || (fs.existsSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
                ? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
                : (fs.existsSync('/usr/bin/google-chrome-stable')
                    ? '/usr/bin/google-chrome-stable'
                    : null));
        const browser = await chromium.launch({
            headless: true,
            executablePath: exec || undefined,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        });
        try {
            // Pick subset via env. Default: all 6.
            const which = (process.env.SHOTS || 'all').split(',').map(s => s.trim());
            const all = which.includes('all');
            if (all || which.includes('01')) await capture01MetaHub(browser);
            if (all || which.includes('02')) await capture02MetaCall(browser);
            if (all || which.includes('03')) await capture03DeckBuilder(browser);
            if (all || which.includes('04')) await capture04CookingMode(browser);
            if (all || which.includes('05')) await capture05CardOverview(browser);
            if (all || which.includes('06')) await capture06TelegramBot(browser);
        } finally {
            await browser.close();
        }
    } catch (err) {
        console.error('[fatal]', err);
        exitCode = 1;
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
    console.log(`[done] exit ${exitCode}`);
    process.exit(exitCode);
}

main();
