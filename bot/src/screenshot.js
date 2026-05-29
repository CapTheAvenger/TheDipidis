/**
 * Puppeteer screenshot pipeline.
 *
 * Keeps a single Chromium browser instance warm across requests so
 * each Telegram tap only pays the page-open + data-load cost
 * (~3-8 s), not the full Chromium boot (~5-10 s on Render Free).
 * Idle pages are closed; the browser itself stays open until the
 * dyno cycles.
 *
 * Strategy for the Meta Call view:
 *   The app already ships a public API that renders the dashboard
 *   to a canvas — `window.MetaCall.exportFieldAndRecsShareImage()`.
 *   It paints the same image the user sees when they tap the
 *   share button. We:
 *     1. Open https://thedipidis.app/.
 *     2. Wait for window.MetaCall to be ready.
 *     3. await MetaCall.preload()  — loads the scraper data files.
 *     4. Call exportFieldAndRecsShareImage() — pops the share
 *        preview modal with the rendered PNG as the body img.
 *     5. Read the data:image/png;base64,… URL off that img and
 *        convert to a Buffer for Telegram.
 *
 * This dodges Profile-tab auth gating entirely (the canvas
 * function is independent of the visible UI) and matches the
 * app's "pixel-perfect" output by definition — it IS the app's
 * output.
 */

import puppeteer from 'puppeteer';

const APP_URL = process.env.APP_URL || 'https://thedipidis.app/';

const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',           // /dev/shm is 64 MB on Render
    '--disable-gpu',
    '--disable-extensions',
    '--no-first-run',
];

let _browserPromise = null;

function getBrowser() {
    if (!_browserPromise) {
        _browserPromise = puppeteer.launch({
            headless: true,
            args: LAUNCH_ARGS,
        }).catch((err) => {
            // Reset so the next caller retries instead of inheriting a
            // dead Promise.
            _browserPromise = null;
            throw err;
        });
    }
    return _browserPromise;
}

export async function captureMetaCallImage({ viewport, timeoutMs = 90000 } = {}) {
    const log = (msg, extra) =>
        console.info(`[screenshot] ${msg}`, extra !== undefined ? extra : '');
    const t0 = Date.now();

    log('launching browser');
    const browser = await getBrowser();
    log('browser ready', `(+${Date.now() - t0}ms)`);

    const page = await browser.newPage();
    try {
        await page.setViewport({
            width: viewport?.width ?? 1440,
            height: viewport?.height ?? 1800,
            deviceScaleFactor: viewport?.deviceScaleFactor ?? 1,
        });

        // Forward page console + errors to our logs so we can see what
        // the app says about its own state during the render. We
        // serialize each arg via JSHandle.jsonValue() to avoid the
        // unhelpful `JSHandle@error` placeholder that page.console
        // returns by default when an Error object is logged.
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
                log(`page.${type}: ${parts.join(' ')}`);
            } catch {
                log(`page.${type}: ${msg.text()}`);
            }
        });
        page.on('pageerror', (err) => log('page.uncaught', err.message));

        // `networkidle2` waits for ≤2 active connections for 500 ms.
        // thedipidis.app's offline-prefetcher keeps a constant trickle
        // of image fetches in flight (4363 card art URLs!), so the
        // page essentially never reaches network-idle. `domcontentloaded`
        // returns as soon as the HTML is parsed; we then wait for the
        // MetaCall module explicitly.
        log('navigating', APP_URL);
        await page.goto(APP_URL, {
            waitUntil: 'domcontentloaded',
            timeout: timeoutMs,
        });
        log('navigation done', `(+${Date.now() - t0}ms)`);

        // Block the app's auto-reload paths BEFORE we start evaluating
        // heavy stuff. The PWA registers a Service Worker that posts
        // {type:'SW_UPDATED'} on activation; the page listener calls
        // window.location.reload() when it receives that message,
        // which kills our Puppeteer execution context mid-eval
        // ("ProtocolError: Execution context was destroyed").
        // We can't easily prevent the SW from registering, but we can
        // override every reload path the app uses. controllerchange
        // listener also calls reload — same override covers it.
        await page.evaluate(() => {
            const noopReload = () => {
                /* swallowed — bot doesn't want a page reload */
            };
            try {
                window.location.reload = noopReload;
            } catch (_) {}
            try {
                Object.defineProperty(window.location, 'reload', {
                    value: noopReload,
                    writable: false,
                    configurable: true,
                });
            } catch (_) {}
        });
        log('reload guard installed');

        log('waiting for window.MetaCall');
        await page.waitForFunction(
            () =>
                window.MetaCall &&
                typeof window.MetaCall.preload === 'function' &&
                typeof window.MetaCall.exportFieldAndRecsShareImage === 'function',
            { timeout: timeoutMs },
        );
        log('MetaCall module ready', `(+${Date.now() - t0}ms)`);

        log('calling MetaCall.preload()');
        await page.evaluate(async () => {
            await window.MetaCall.preload();
        });
        log('preload done', `(+${Date.now() - t0}ms)`);

        log('triggering exportFieldAndRecsShareImage');
        await page.evaluate(() => {
            window.MetaCall.exportFieldAndRecsShareImage();
        });

        log('waiting for share preview img');
        await page.waitForSelector(
            '#mc-share-preview-modal .mc-share-preview-img',
            { timeout: 30000 },
        );

        const dataUrl = await page.$eval(
            '#mc-share-preview-modal .mc-share-preview-img',
            (img) => img.src,
        );

        if (!dataUrl?.startsWith('data:image/png;base64,')) {
            throw new Error(`unexpected share image src: ${String(dataUrl).slice(0, 60)}…`);
        }
        const base64 = dataUrl.slice('data:image/png;base64,'.length);
        log('rendered', `${(base64.length * 0.75 / 1024).toFixed(0)} KB (+${Date.now() - t0}ms total)`);
        return Buffer.from(base64, 'base64');
    } finally {
        await page.close().catch(() => {});
    }
}

export async function shutdown() {
    if (_browserPromise) {
        try {
            const browser = await _browserPromise;
            await browser.close();
        } catch { /* already dead */ }
        _browserPromise = null;
    }
}
