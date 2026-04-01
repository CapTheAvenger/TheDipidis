const { test, expect } = require('@playwright/test');

test.describe('Proxy Queue Reload Reset', () => {
    test('imports decklist into proxy queue and clears queue after full reload', async ({ page }) => {
        await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });

        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });
        await page.evaluate(() => window.switchTab('proxy'));
        await page.waitForSelector('#proxy.tab-content.active', { timeout: 20000 });

        const decklistInput = page.locator('#proxyDecklistInput');
        await expect(decklistInput).toBeVisible({ timeout: 20000 });

        await decklistInput.fill('2 Buddy-Buddy Poffin SVI 186');
        await page.click('#proxyImportDecklistBtn');

        const queueCards = page.locator('#proxyQueueList .proxy-queue-card');
        await expect(queueCards.first()).toBeVisible({ timeout: 30000 });
        await expect(queueCards).toHaveCount(1);

        await expect(page.locator('#proxyCopiesCount')).toHaveText('2', { timeout: 10000 });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });
        await page.evaluate(() => window.switchTab('proxy'));
        await page.waitForSelector('#proxy.tab-content.active', { timeout: 20000 });

        await expect(page.locator('#proxyQueueList .proxy-queue-empty')).toBeVisible({ timeout: 20000 });
        await expect(page.locator('#proxyQueueList .proxy-queue-card')).toHaveCount(0);
        await expect(page.locator('#proxyCopiesCount')).toHaveText('0', { timeout: 10000 });
        await expect(page.locator('#proxyUniqueCount')).toHaveText('0', { timeout: 10000 });
    });
});
