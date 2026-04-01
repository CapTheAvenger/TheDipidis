const { test, expect } = require('@playwright/test');

test.describe('City League Hero Combined Navigation', () => {
    test('clicking Top Archetype hero selects GROUP combined value in analysis tab', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });

        // Ensure we are on City League meta tab where hero cards are rendered.
        await page.evaluate(() => window.switchTab('city-league'));
        await page.waitForSelector('#city-league.tab-content.active', { timeout: 20000 });

        // Wait for hero cards and click first one.
        const firstHero = page.locator('.tier-hero-grid .tier-hero-card').first();
        await expect(firstHero).toBeVisible({ timeout: 30000 });
        await firstHero.click();

        // Should navigate to analysis tab.
        await page.waitForSelector('#city-league-analysis.tab-content.active', { timeout: 20000 });

        // Combined selection can be deferred until analysis data/options are ready.
        await page.waitForFunction(() => {
            const select = document.getElementById('cityLeagueDeckSelect');
            return !!select && String(select.value || '').startsWith('GROUP:');
        }, null, { timeout: 30000 });

        const selectedValue = await page.locator('#cityLeagueDeckSelect').inputValue();
        expect(selectedValue.startsWith('GROUP:')).toBeTruthy();
    });
});
