const { test, expect } = require('@playwright/test');

async function openCityLeagueMeta(page) {
    await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });
    await page.evaluate(() => window.switchTab('city-league'));
    await page.waitForSelector('#city-league.tab-content.active', { timeout: 20000 });
    await page.waitForFunction(() => {
        const hasBanner = document.querySelectorAll('#cityLeagueContent .deck-banner-card').length > 0;
        const hasTableLink = document.querySelectorAll('#cityLeagueContent .archetype-jump-link').length > 0;
        return !!window.cityLeagueLoaded && (hasBanner || hasTableLink);
    }, null, { timeout: 30000 });
}

async function expectExactCityLeagueSelection(page, expectedArchetype) {
    await page.waitForSelector('#city-league-analysis.tab-content.active', { timeout: 20000 });

    await page.waitForFunction((archetype) => {
        const select = document.getElementById('cityLeagueDeckSelect');
        const input = document.getElementById('cityLeagueDeckCombobox');
        const decksUsed = document.getElementById('cityLeagueStatDecksUsed');

        return !!select
            && select.value === archetype
            && !!input
            && input.value.trim() === archetype
            && !!decksUsed
            && decksUsed.textContent.trim() !== ''
            && decksUsed.textContent.trim() !== '-';
    }, expectedArchetype, { timeout: 30000 });

    await expect(page.locator('#cityLeagueDeckSelect')).toHaveValue(expectedArchetype);
    await expect(page.locator('#cityLeagueDeckCombobox')).toHaveValue(expectedArchetype);
    await expect(page.locator('#cityLeagueStatDecksUsed')).not.toHaveText('-');
    await expect(page.locator('#cityLeagueStatAvgPlacement')).not.toHaveText('-');
}

test.describe('City League Exact Navigation', () => {
    test('clicking a deck banner selects the exact archetype in analysis', async ({ page }) => {
        await openCityLeagueMeta(page);

        const banner = page.locator('.deck-banner-card').first();
        await expect(banner).toBeVisible({ timeout: 30000 });

        const expectedArchetype = (await banner.locator('.deck-banner-name').textContent()).trim();
        await banner.click();

        await expectExactCityLeagueSelection(page, expectedArchetype);
    });

    test('clicking an archetype table link selects the exact archetype in analysis', async ({ page }) => {
        await openCityLeagueMeta(page);

        const archetypeLink = page.locator('#cityLeagueContent .archetype-jump-link').first();
        await expect(archetypeLink).toBeVisible({ timeout: 30000 });

        const expectedArchetype = (await archetypeLink.textContent()).trim();
        await archetypeLink.click();

        await expectExactCityLeagueSelection(page, expectedArchetype);
    });
});