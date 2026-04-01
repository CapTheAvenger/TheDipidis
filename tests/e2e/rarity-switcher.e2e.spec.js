const { test, expect } = require('@playwright/test');

test.describe('Rarity Switcher E2E', () => {
    test('opens modal from Cards tab rarity button and shows options', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });

        // App bootstraps async; wait until the tab API is available.
        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });

        // Switch explicitly to Cards tab to use the DB rarity trigger.
        await page.evaluate(() => window.switchTab('cards'));
        await page.waitForSelector('#cards.tab-content.active', { timeout: 20000 });

        // Wait for at least one rarity button rendered from card database.
        const rarityButton = page.locator('.card-database-rarity-btn').first();
        await expect(rarityButton).toBeVisible({ timeout: 30000 });

        await rarityButton.click();

        const modal = page.locator('#raritySwitcherModal');
        await expect(modal).toHaveClass(/show/, { timeout: 10000 });

        // Ensure modal has populated rarity options.
        const options = page.locator('#rarityOptionsList .rarity-option-card');
        await expect(options.first()).toBeVisible({ timeout: 10000 });
        const count = await options.count();
        expect(count).toBeGreaterThan(0);

        // Close via Escape to verify close path still works.
        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/show/, { timeout: 10000 });
    });
});
