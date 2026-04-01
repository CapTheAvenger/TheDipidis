const { test, expect } = require('@playwright/test');

test.describe('Cards Image Keyboard Accessibility', () => {
    test('opens fullscreen image modal via Enter and Space on card image', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });

        await page.evaluate(() => window.switchTab('cards'));
        await page.waitForSelector('#cards.tab-content.active', { timeout: 20000 });

        const imageButton = page.locator('#cards .card-database-image-wrap img[role="button"]').first();
        await expect(imageButton).toBeVisible({ timeout: 30000 });

        const modal = page.locator('#fullscreenCardModal');

        await imageButton.focus();
        await page.keyboard.press('Enter');
        await expect(modal).toHaveClass(/active/, { timeout: 10000 });

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/, { timeout: 10000 });

        await imageButton.focus();
        await page.keyboard.press(' ');
        await expect(modal).toHaveClass(/active/, { timeout: 10000 });

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/, { timeout: 10000 });
    });
});
