// Local E2E config for Playwright.
// Uses system Chrome to avoid launch issues with bundled browser binaries.

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
    testDir: 'tests/e2e',
    timeout: 60_000,
    expect: {
        timeout: 15_000,
    },
    use: {
        headless: true,
        launchOptions: {
            executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
        },
    },
};
