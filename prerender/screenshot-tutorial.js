/**
 * Tutorial screenshot generator — multi-shot per feature.
 *
 * Produces the PNGs the How-To-Use feature banners embed at
 * /images/tutorials/<feature>/<n>-<state>.png. Each feature gets
 * 2-4 shots showing different states of the same feature so the
 * marketing banner can illustrate what the feature actually does
 * (not just an empty filter view).
 *
 * Output structure:
 *   images/tutorials/
 *     01-meta-hub.png                 (legacy single-shot — kept)
 *     02-meta-call.png                (legacy)
 *     03-deck-builder.png             (legacy)
 *     04-cooking-mode.png             (legacy)
 *     05-card-overview.png            (legacy)
 *     06-telegram-bot.png             (legacy)
 *     meta-call/
 *       1-field.png                   (Field Composition with data)
 *       2-overrides.png               (My-Estimate column populated)
 *       3-day2.png                    (Day-2 chance + WR result)
 *     deck-builder/
 *       1-overview.png                (Card Overview list)
 *       2-built.png                   (Generated 60-card deck)
 *     cooking-mode/
 *       1-pins.png                    (Pin / exclude badges visible)
 *       2-tech-slots.png              (Tech-Slots row populated)
 *     tech-lab/
 *       1-target.png                  (Target search + picker)
 *       2-beats.png                   (Beats / beaten-by lists)
 *     card-database/
 *       1-grid.png                    (Card grid)
 *       2-filter.png                  (Filter sidebar with selections)
 *     past-meta/
 *       1-field.png                   (Past Meta TEF-POR field)
 *       2-stack.png                   (Tournament stack with 🏆 winner)
 *     battle-journal/
 *       1-quicklog.png                (Quick-log entry form)
 *       2-history.png                 (History list)
 *     meta-binder/
 *       1-binder.png                  (Generated binder grid)
 *     custom-binder/
 *       1-picker.png                  (Archetype picker)
 *     testing-groups/
 *       1-dashboard.png               (Group dashboard)
 *     telegram-bot/
 *       1-metacall.png                (Telegram mock — /metacall reply)
 *       2-deck.png                    (/deck reply)
 *
 * Auth-dependent features (Battle Journal, Custom Binder, Testing
 * Groups, Meta Binder ownership) currently show empty states in CI
 * because Firebase auth doesn't carry. Those are flagged
 * `requiresAuth: true` in the SHOT_CONFIG so the design pass knows
 * which banners need real screenshots later.
 *
 * Usage:
 *   node prerender/screenshot-tutorial.js           # all shots
 *   SHOTS=meta-call,past-meta node prerender/...    # only those features
 *
 * Or via CI: .github/workflows/tutorial-screenshots.yml
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

// Portrait phone-style for the existing legacy 01-06.png slots; the
// per-feature banner shots use a wider landscape ratio (1280×720)
// because the bullet-list-beside-image layout reads better with a
// 16:9 image.
const VIEWPORT_PORTRAIT  = { width: 720,  height: 1280 };
const VIEWPORT_LANDSCAPE = { width: 1280, height: 720  };
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

async function newContextFor(browser, { viewport }) {
    return await browser.newContext({
        viewport,
        deviceScaleFactor: DPR,
        locale: 'en-US',
        serviceWorkers: 'block',
    });
}

async function openPage(context, urlPath) {
    await context.addInitScript(() => {
        try {
            localStorage.clear();
            localStorage.setItem('app_lang', 'en');
        } catch (_) { /* ignore */ }
    });
    const page = await context.newPage();
    page.on('console', (msg) => {
        if (msg.type() === 'error') console.error(`[page] ${msg.text()}`);
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
    try {
        await page.waitForLoadState('networkidle', { timeout: 8_000 });
    } catch (_) { /* tolerate */ }
    await page.addStyleTag({
        content: `
            *, *::before, *::after {
                animation: none !important;
                transition: none !important;
            }
            html { scroll-behavior: auto !important; }
        `,
    });
    return page;
}

async function navigateViaHash(page, hash, settleSelector) {
    await page.evaluate((h) => {
        window.location.hash = '#' + h;
    }, hash);
    if (settleSelector) {
        try {
            await page.waitForFunction(
                (sel) => {
                    const el = document.querySelector(sel);
                    if (!el) return false;
                    const r = el.getBoundingClientRect();
                    return r.width > 50 && r.height > 50;
                },
                settleSelector,
                { timeout: 15_000 },
            );
        } catch (_) {
            console.warn(`  ! ${settleSelector} didn't settle — shooting anyway`);
        }
    }
    await page.waitForTimeout(2500);
}

async function shoot(page, outFile, options = {}) {
    const fullPath = path.join(OUTPUT_DIR, outFile);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({
        path: fullPath,
        fullPage: options.fullPage === true,
        clip: options.clip,
        type: 'png',
    });
    const size = fs.statSync(fullPath).size;
    console.log(`    ✓ ${outFile} (${(size / 1024).toFixed(0)} KB)`);
}

// ── Shot config ────────────────────────────────────────────────
//
// Each feature is a key with an array of shots. Each shot has:
//   - name: filename inside the feature dir
//   - hash: routing token from inline-init.js HASH_ALIASES (or null
//           for telegram-mock which has its own URL)
//   - settle: optional selector to wait on before shooting
//   - drive: optional async (page) => {…} that runs after settle to
//            put the page into the right state (click a button, fill
//            an input, scroll to a section)
//   - viewport: 'landscape' (default) or 'portrait'
//   - requiresAuth: true if this shot's full value needs a logged-in
//            user; recorded for the design pass but doesn't skip
//            the shot
//
// Selectors below were derived by reading the source — not guessing.
// If you change a feature's DOM structure, update the matching
// selector here or this script will fall back to empty-state shots.
const SHOT_CONFIG = {
    'meta-call': [
        {
            name: '1-field.png',
            hash: 'metacall',
            settle: '.metacall-wrap',
            drive: async (page) => {
                // Scroll to Field Composition section if not already in view.
                await page.evaluate(() => {
                    const el = document.querySelector('.mc-field-panel');
                    if (el) el.scrollIntoView({ block: 'start' });
                });
            },
        },
        {
            name: '2-recs.png',
            hash: 'metacall',
            settle: '.metacall-wrap',
            drive: async (page) => {
                await page.evaluate(() => {
                    const recs = document.querySelector('.mc-rec-panel, .mc-recommended');
                    if (recs) recs.scrollIntoView({ block: 'start' });
                });
                await page.waitForTimeout(500);
            },
        },
    ],
    'deck-builder': [
        {
            name: '1-overview.png',
            hash: 'current-analysis',
            settle: '.deck-builder, .current-analysis-deck',
            drive: async (page) => {
                await page.evaluate(() => window.scrollTo(0, 0));
            },
        },
    ],
    'cooking-mode': [
        {
            name: '1-pins.png',
            hash: 'current-analysis',
            settle: '.deck-builder, .current-analysis-deck',
            drive: async (page) => {
                await page.evaluate(() => {
                    if (typeof window.setCurrentMetaViewMode === 'function') {
                        window.setCurrentMetaViewMode('deepDive');
                    }
                });
                await page.waitForTimeout(1500);
                // Scroll to where the pin/exclude badges live.
                await page.evaluate(() => {
                    const el = document.querySelector('.deck-card-pin-badge, .cm-deep-dive-only');
                    if (el) el.scrollIntoView({ block: 'center' });
                });
                await page.waitForTimeout(300);
            },
        },
        {
            name: '2-tech-slots.png',
            hash: 'current-analysis',
            settle: '.deck-builder, .current-analysis-deck',
            drive: async (page) => {
                await page.evaluate(() => {
                    if (typeof window.setCurrentMetaViewMode === 'function') {
                        window.setCurrentMetaViewMode('deepDive');
                    }
                });
                await page.waitForTimeout(1500);
                await page.evaluate(() => {
                    const el = document.querySelector('.tech-slots-row');
                    if (el) el.scrollIntoView({ block: 'center' });
                });
                await page.waitForTimeout(300);
            },
        },
    ],
    'tech-lab': [
        {
            name: '1-section.png',
            hash: 'current-analysis',
            settle: '.deck-builder, .current-analysis-deck',
            drive: async (page) => {
                await page.evaluate(() => {
                    if (typeof window.setCurrentMetaViewMode === 'function') {
                        window.setCurrentMetaViewMode('deepDive');
                    }
                });
                await page.waitForTimeout(1500);
                await page.evaluate(() => {
                    const el = document.querySelector('#techLabSection, .tech-lab-section');
                    if (el) el.scrollIntoView({ block: 'start' });
                });
                await page.waitForTimeout(500);
            },
        },
    ],
    'card-database': [
        {
            name: '1-grid.png',
            hash: 'cards',
            settle: '.cards-grid, .card-database-grid, .card-result',
            drive: async (page) => {
                await page.evaluate(() => window.scrollTo(0, 0));
            },
        },
    ],
    'past-meta': [
        {
            name: '1-field.png',
            hash: 'past-meta',
            settle: '.past-meta-results, .past-meta-deck-overview, .pm-field-panel',
            drive: async (page) => {
                await page.evaluate(() => window.scrollTo(0, 0));
            },
        },
    ],
    'meta-hub': [
        {
            name: '1-tiles.png',
            hash: 'current-meta',
            settle: '.meta-hub-tiles, .meta-tile, .meta-hub-legend',
            drive: async (page) => {
                await page.evaluate(() => window.scrollTo(0, 0));
            },
        },
        {
            name: '2-legend.png',
            hash: 'current-meta',
            settle: '.meta-hub-legend',
            drive: async (page) => {
                await page.evaluate(() => {
                    const el = document.querySelector('.meta-hub-legend');
                    if (el) el.scrollIntoView({ block: 'start' });
                });
                await page.waitForTimeout(500);
            },
        },
    ],
    'battle-journal': [
        {
            name: '1-tab.png',
            hash: 'journal',
            settle: '.battle-journal-profile-card, #profile-journal, .bj-wrap',
            requiresAuth: true,
            drive: async (page) => {
                await page.evaluate(() => window.scrollTo(0, 0));
            },
        },
    ],
    'meta-binder': [
        {
            name: '1-tab.png',
            hash: 'profile',
            settle: '#profile-metabinder, .meta-binder-header',
            requiresAuth: true,
            drive: async (page) => {
                await page.evaluate(() => {
                    if (typeof window.switchProfileTab === 'function') {
                        window.switchProfileTab('metabinder');
                    }
                });
                await page.waitForTimeout(2000);
            },
        },
    ],
    'custom-binder': [
        {
            name: '1-picker.png',
            hash: 'profile',
            settle: '#profile-custombinder, .meta-binder-header',
            requiresAuth: true,
            drive: async (page) => {
                await page.evaluate(() => {
                    if (typeof window.switchProfileTab === 'function') {
                        window.switchProfileTab('custombinder');
                    }
                });
                await page.waitForTimeout(2000);
            },
        },
    ],
    'testing-groups': [
        {
            name: '1-dashboard.png',
            hash: 'profile',
            settle: '.tg-wrap, .tg-header, #profile-testinggroups',
            requiresAuth: true,
            drive: async (page) => {
                await page.evaluate(() => {
                    if (typeof window.switchProfileTab === 'function') {
                        window.switchProfileTab('testinggroups');
                    }
                });
                await page.waitForTimeout(2000);
            },
        },
    ],
    'telegram-bot': [
        {
            name: '1-metacall.png',
            url: '/prerender/telegram-mock.html',
            viewport: 'portrait',
        },
    ],
};

// ── Legacy single-shot capture functions (01-06 in flat structure) ─

async function captureLegacy(browser) {
    console.log('[legacy] 01-06');
    // Share one context for the 5 site shots so we re-use the
    // same page-load state.
    const context = await newContextFor(browser, { viewport: VIEWPORT_PORTRAIT });
    try {
        const page = await openPage(context, '/index.html');

        await navigateViaHash(page, 'current-meta', '.meta-hub-tiles, .meta-tile, .meta-hub-legend');
        await shoot(page, '01-meta-hub.png');

        await navigateViaHash(page, 'metacall', '.metacall-wrap');
        await shoot(page, '02-meta-call.png');

        await navigateViaHash(page, 'current-analysis', '.deck-builder, .current-analysis-deck');
        await shoot(page, '03-deck-builder.png');

        await page.evaluate(() => {
            if (typeof window.setCurrentMetaViewMode === 'function') {
                window.setCurrentMetaViewMode('deepDive');
            }
        });
        await page.waitForTimeout(2000);
        await shoot(page, '04-cooking-mode.png');

        await navigateViaHash(page, 'cards', '.cards-grid, .card-database-grid, .card-result');
        await shoot(page, '05-card-overview.png');
    } finally {
        await context.close();
    }
    // Telegram mock — own context with same portrait viewport.
    const tgCtx = await newContextFor(browser, { viewport: VIEWPORT_PORTRAIT });
    try {
        const page = await tgCtx.newPage();
        await page.goto(`http://127.0.0.1:${PORT}/prerender/telegram-mock.html`, {
            waitUntil: 'domcontentloaded',
            timeout: 30_000,
        });
        await page.waitForTimeout(800);
        await shoot(page, '06-telegram-bot.png');
    } finally {
        await tgCtx.close();
    }
}

// ── Per-feature multi-shot capture ──────────────────────────────

async function captureFeature(browser, feature, shots) {
    console.log(`[${feature}] ${shots.length} shot(s)`);
    for (const spec of shots) {
        const viewport = spec.viewport === 'portrait' ? VIEWPORT_PORTRAIT : VIEWPORT_LANDSCAPE;
        const context = await newContextFor(browser, { viewport });
        try {
            const urlPath = spec.url || '/index.html';
            const page = await openPage(context, urlPath);
            if (spec.hash) {
                await navigateViaHash(page, spec.hash, spec.settle);
            } else if (spec.settle) {
                try {
                    await page.waitForSelector(spec.settle, { timeout: 10_000 });
                } catch (_) { /* tolerate */ }
            }
            if (typeof spec.drive === 'function') {
                try {
                    await spec.drive(page);
                } catch (e) {
                    console.warn(`  ! drive() threw for ${feature}/${spec.name}: ${e.message}`);
                }
            }
            await shoot(page, `${feature}/${spec.name}`);
        } catch (e) {
            console.error(`  ✗ ${feature}/${spec.name} failed: ${e.message}`);
        } finally {
            await context.close();
        }
    }
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
        // Prefer the playwright-bundled browser; fall back to host's.
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
            const which = (process.env.SHOTS || 'all').split(',').map(s => s.trim());
            const all = which.includes('all');

            // Legacy 01-06 single-shots — keep stable for any existing
            // tutorial pages that still embed them.
            if (all || which.includes('legacy')) {
                await captureLegacy(browser);
            }

            // Per-feature multi-shot.
            for (const [feature, shots] of Object.entries(SHOT_CONFIG)) {
                if (all || which.includes(feature)) {
                    await captureFeature(browser, feature, shots);
                }
            }
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
