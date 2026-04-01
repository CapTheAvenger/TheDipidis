const { test, expect } = require('@playwright/test');

test.describe('City League Language Switch', () => {
    test('updates City League labels and persists German language', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => typeof window.switchTab === 'function' && typeof window.switchLanguage === 'function', null, { timeout: 20000 });

        await page.evaluate(() => {
            window.switchLanguage('en');
            window.switchTab('city-league');
        });

        await page.waitForSelector('#city-league.tab-content.active', { timeout: 20000 });

        const heroTitle = page.locator('.tier-hero-header h2').first();
        await expect(heroTitle).toContainText('Top Archetypes', { timeout: 30000 });

        const avgHeaderEn = page.locator('#cityLeagueFullTable .city-league-info-table-header').filter({ hasText: 'Average Placement' }).first();
        await expect(avgHeaderEn).toBeVisible({ timeout: 30000 });

        await page.click('#langToggleBtn');

        await expect(heroTitle).toContainText('Top Archetypen', { timeout: 30000 });

        const avgHeaderDe = page.locator('#cityLeagueFullTable .city-league-info-table-header').filter({ hasText: 'Durchschnittliche Platzierung' }).first();
        await expect(avgHeaderDe).toBeVisible({ timeout: 30000 });

        const storedLang = await page.evaluate(() => localStorage.getItem('app_lang'));
        expect(storedLang).toBe('de');
    });
});
