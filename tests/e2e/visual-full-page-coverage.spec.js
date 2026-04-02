const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:8000/index.html';

async function waitForAppReady(page) {
    await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 60_000 });
}

async function goToTab(page, tabId) {
    await page.evaluate((id) => window.switchTab(id), tabId);
    await page.waitForSelector(`#${tabId}.tab-content.active`, { timeout: 90_000 });

    await page.waitForTimeout(800);
}

async function expectActiveTabSnapshot(page, tabId, fileName) {
    const tab = page.locator(`#${tabId}.tab-content.active`).first();
    await expect(tab).toBeVisible({ timeout: 60_000 });

    const box = await tab.boundingBox();
    expect(box).not.toBeNull();

    const clip = {
        x: Math.max(0, Math.round(box.x)),
        y: Math.max(0, Math.round(box.y)),
        width: Math.max(1, Math.round(box.width)),
        height: 620,
    };

    await expect(page).toHaveScreenshot(fileName, {
        clip,
        maxDiffPixelRatio: 0.04,
    });
}

const TAB_CASES = [
    { id: 'city-league', fileName: 'full-tab-city-league.png' },
    { id: 'city-league-analysis', fileName: 'full-tab-city-league-analysis.png' },
    { id: 'current-meta', fileName: 'full-tab-current-meta.png' },
    { id: 'current-analysis', fileName: 'full-tab-current-analysis.png' },
    { id: 'past-meta', fileName: 'full-tab-past-meta.png' },
    { id: 'cards', fileName: 'full-tab-cards.png' },
    { id: 'proxy', fileName: 'full-tab-proxy.png' },
    { id: 'sandbox', fileName: 'full-tab-sandbox.png' },
    { id: 'tutorial', fileName: 'full-tab-tutorial.png' },
    { id: 'calculator', fileName: 'full-tab-calculator.png' },
    { id: 'profile', fileName: 'full-tab-profile.png' },
];

test.describe('Full Page Visual Coverage', () => {
    test.describe.configure({ timeout: 180_000 });

    for (const tabCase of TAB_CASES) {
        test(`tab snapshot: ${tabCase.id}`, async ({ page }) => {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await waitForAppReady(page);
            await goToTab(page, tabCase.id);
            await expectActiveTabSnapshot(page, tabCase.id, tabCase.fileName);
        });
    }

    const PROFILE_SUBTABS = [
        { key: 'collection', selector: '#profile-collection', fileName: 'full-profile-collection.png' },
        { key: 'decks', selector: '#profile-decks', fileName: 'full-profile-decks.png' },
        { key: 'wishlist', selector: '#profile-wishlist', fileName: 'full-profile-wishlist.png' },
        { key: 'metabinder', selector: '#profile-metabinder', fileName: 'full-profile-metabinder.png' },
        { key: 'settings', selector: '#profile-settings', fileName: 'full-profile-settings.png' },
    ];

    for (const subtab of PROFILE_SUBTABS) {
        test(`profile subtab snapshot: ${subtab.key}`, async ({ page }) => {
            await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
            await waitForAppReady(page);
            await goToTab(page, 'profile');

            const authGateVisible = await page.locator('#profile-auth').first().isVisible().catch(() => false);
            test.skip(authGateVisible, 'Profile subtabs require authenticated profile view.');

            await page.evaluate((tabKey) => {
                if (typeof window.switchProfileTab === 'function') {
                    window.switchProfileTab(tabKey);
                }
            }, subtab.key);

            const activeSubtab = page.locator(`${subtab.selector}.profile-tab-content`).first();
            await expect(activeSubtab).toBeVisible({ timeout: 60_000 });
            await page.waitForTimeout(500);

            const box = await activeSubtab.boundingBox();
            expect(box).not.toBeNull();

            const clip = {
                x: Math.max(0, Math.round(box.x)),
                y: Math.max(0, Math.round(box.y)),
                width: Math.max(1, Math.round(box.width)),
                height: 620,
            };

            await expect(page).toHaveScreenshot(subtab.fileName, {
                clip,
                maxDiffPixelRatio: 0.04,
            });
        });
    }
});
