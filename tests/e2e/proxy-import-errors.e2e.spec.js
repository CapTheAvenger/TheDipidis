const { test, expect } = require('@playwright/test');

test.describe('Proxy Import Error Handling', () => {
    test('keeps queue empty for empty and invalid decklist input', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });
        await page.evaluate(() => window.switchTab('proxy'));
        await page.waitForSelector('#proxy.tab-content.active', { timeout: 20000 });

        const importBtn = page.locator('#proxyImportDecklistBtn');
        const input = page.locator('#proxyDecklistInput');

        await expect(importBtn).toBeVisible({ timeout: 20000 });
        await expect(input).toBeVisible({ timeout: 20000 });

        // Case 1: empty input
        await input.fill('');
        await importBtn.click();

        await expect(page.locator('#proxyQueueList .proxy-queue-empty')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#proxyQueueList .proxy-queue-card')).toHaveCount(0);
        await expect(page.locator('#proxyCopiesCount')).toHaveText('0');
        await expect(page.locator('#proxyUniqueCount')).toHaveText('0');
        await expect(importBtn).toBeEnabled();

        // Case 2: invalid decklist text that should not parse into entries
        await input.fill('this is not a valid decklist line');
        await importBtn.click();

        await expect(page.locator('#proxyQueueList .proxy-queue-empty')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('#proxyQueueList .proxy-queue-card')).toHaveCount(0);
        await expect(page.locator('#proxyCopiesCount')).toHaveText('0');
        await expect(page.locator('#proxyUniqueCount')).toHaveText('0');
        await expect(importBtn).toBeEnabled();
    });
});
