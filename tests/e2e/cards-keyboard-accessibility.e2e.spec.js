const { test, expect } = require('@playwright/test');

test.describe('Cards Keyboard Accessibility', () => {
    test('supports keyboard autocomplete navigation and keyboard rarity modal open', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });

        await page.evaluate(() => window.switchTab('cards'));
        await page.waitForSelector('#cards.tab-content.active', { timeout: 20000 });

        const searchInput = page.locator('#cardSearch');
        await expect(searchInput).toBeVisible({ timeout: 20000 });

        await searchInput.fill('char');

        const autocompleteFirst = page.locator('#cardSearchAutocomplete .cards-autocomplete-item').first();
        await expect(autocompleteFirst).toBeVisible({ timeout: 30000 });

        await searchInput.press('ArrowDown');

        await expect.poll(async () => {
            return page.evaluate(() => {
                const active = document.activeElement;
                return active ? active.classList.contains('cards-autocomplete-item') : false;
            });
        }, { timeout: 10000 }).toBe(true);

        await page.keyboard.press('Enter');

        const dropdown = page.locator('#cardSearchAutocomplete');
        await expect(dropdown).toHaveClass(/d-none/, { timeout: 10000 });

        const rarityButton = page.locator('#cards .card-database-rarity-btn').first();
        await expect(rarityButton).toBeVisible({ timeout: 30000 });

        await rarityButton.focus();
        await page.keyboard.press('Enter');

        const modal = page.locator('#raritySwitcherModal');
        await expect(modal).toHaveClass(/show/, { timeout: 10000 });

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/show/, { timeout: 10000 });
    });
});
