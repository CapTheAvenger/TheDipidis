// Local E2E config for Playwright.
// Uses system Chrome to avoid launch issues with bundled browser binaries.

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
    testDir: 'tests/e2e',
    timeout: 60_000,
    expect: {
        timeout: 15_000,
        // Pixel comparison threshold: 0.2 = allow up to 20% per-pixel color difference
        // before failing. Keeps tests stable across minor font rendering differences.
        toHaveScreenshot: {
            threshold: 0.2,
            maxDiffPixelRatio: 0.02, // fail if >2% of pixels differ
        },
    },
    use: {
        headless: true,
        // Fixed viewport ensures screenshots are reproducible across machines.
        viewport: { width: 1280, height: 800 },
        launchOptions: {
            executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        },
    },
    // Snapshot baselines live next to tests, committed to git.
    snapshotPathTemplate: '{testDir}/{testFileDir}/__snapshots__/{testFilename}/{arg}{ext}',
};
