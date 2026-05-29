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

export async function captureMetaCallImage({ viewport, timeoutMs = 60000 } = {}) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setViewport({
            width: viewport?.width ?? 1440,
            height: viewport?.height ?? 1800,
            deviceScaleFactor: viewport?.deviceScaleFactor ?? 1,
        });

        await page.goto(APP_URL, {
            waitUntil: 'networkidle2',
            timeout: timeoutMs,
        });

        // Wait until the Meta Call module exports show up. Both are
        // assigned in the IIFE return at the bottom of app-meta-call.js
        // so seeing them means the module finished evaluating.
        await page.waitForFunction(
            () =>
                window.MetaCall &&
                typeof window.MetaCall.preload === 'function' &&
                typeof window.MetaCall.exportFieldAndRecsShareImage === 'function',
            { timeout: timeoutMs },
        );

        // Preload the scraper data the canvas renderer needs.
        await page.evaluate(async () => {
            await window.MetaCall.preload();
        });

        // Trigger the share modal. The function paints the canvas
        // synchronously, then calls _showSharePreview which mounts
        // `#mc-share-preview-modal .mc-share-preview-img` with the
        // PNG data URL as its src.
        await page.evaluate(() => {
            window.MetaCall.exportFieldAndRecsShareImage();
        });

        await page.waitForSelector(
            '#mc-share-preview-modal .mc-share-preview-img',
            { timeout: 15000 },
        );

        const dataUrl = await page.$eval(
            '#mc-share-preview-modal .mc-share-preview-img',
            (img) => img.src,
        );

        if (!dataUrl?.startsWith('data:image/png;base64,')) {
            throw new Error(`unexpected share image src: ${String(dataUrl).slice(0, 60)}…`);
        }
        const base64 = dataUrl.slice('data:image/png;base64,'.length);
        return Buffer.from(base64, 'base64');
    } finally {
        // Always close the page so the browser doesn't accumulate
        // tabs across requests.
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
