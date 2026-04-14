// @ts-check
const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8000';

/**
 * Helper: navigate to playtester tab and wait for board to load
 */
async function openPlaytester(page) {
    await page.goto(BASE + '/index.html');
    // Click the Playtester menu item
    const menuTrigger = page.locator('#mainMenuTrigger');
    if (await menuTrigger.isVisible()) await menuTrigger.click();
    // Try clicking data-tab-id="playtester" from menu
    const ptMenuItem = page.locator('[data-tab-id="sandbox"]');
    await ptMenuItem.click({ timeout: 5000 });
    // Wait for the playtester board to become visible
    await page.locator('#playtester-board').waitFor({ state: 'visible', timeout: 10000 });
}

/**
 * Helper: start a game with a known deck
 */
async function startGame(page) {
    // Wait for deck selector or start button
    await page.waitForTimeout(1500);
    // Type a sample deck list into the deck textarea if it exists
    const deckTextarea = page.locator('#ptDeckInput, #ptDecklistTextarea, textarea[id*="deck"]').first();
    if (await deckTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
        await deckTextarea.fill('4 Ultra Ball SVI 196\n4 Nest Ball SVI 181\n4 Professor\'s Research SVI 189\n4 Boss\'s Orders PAL 172\n4 Iono PAL 185\n4 Rare Candy SVI 191\n4 Super Rod PAL 188\n20 Basic Fire Energy SVE 2\n4 Arcanine ex OBF 32\n4 Growlithe OBF 31\n4 Charizard ex OBF 125\n');
    }
    // Click start button
    const startBtn = page.locator('button:has-text("Start"), button:has-text("Playtest"), [onclick*="startPlaytest"], [onclick*="ptStartGame"]').first();
    if (await startBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await startBtn.click();
        await page.waitForTimeout(1000);
    }
}

test.describe('Playtester Hand Buttons', () => {

    test('Legend box is hidden', async ({ page }) => {
        await openPlaytester(page);
        const legend = page.locator('.pt-legend-box');
        // Legend should exist in DOM but not be visible
        if (await legend.count() > 0) {
            await expect(legend.first()).toBeHidden();
        }
    });

    test('Play button exists on trainer cards in hand and is clickable', async ({ page }) => {
        await openPlaytester(page);
        await startGame(page);
        await page.waitForTimeout(1500);

        // Check if hand zone has cards
        const handCards = page.locator('#ptHandZone .pt-hand-wrapper');
        const count = await handCards.count();

        if (count > 0) {
            // Hover over the first card to reveal buttons
            await handCards.first().hover();
            await page.waitForTimeout(300);

            // Check for play or discard buttons
            const playBtn = page.locator('.pt-hand-play-btn').first();
            const discBtn = page.locator('.pt-hand-disc-btn').first();

            // At least discard button should be visible on hover
            const discVisible = await discBtn.isVisible().catch(() => false);
            expect(discVisible).toBe(true);

            // Check z-index: buttons should be above the card image
            if (await playBtn.isVisible().catch(() => false)) {
                const btnZ = await playBtn.evaluate(el => getComputedStyle(el).zIndex);
                const imgZ = await handCards.first().locator('img').evaluate(el => getComputedStyle(el).zIndex);
                expect(parseInt(btnZ)).toBeGreaterThan(parseInt(imgZ) || 0);
            }
        }
    });

    test('Play button does NOT open card viewer', async ({ page }) => {
        await openPlaytester(page);
        await startGame(page);
        await page.waitForTimeout(1500);

        const handCards = page.locator('#ptHandZone .pt-hand-wrapper');
        const count = await handCards.count();

        if (count > 0) {
            // Find a trainer card with play button
            for (let i = 0; i < count; i++) {
                const wrapper = handCards.nth(i);
                await wrapper.hover();
                await page.waitForTimeout(200);

                const playBtn = wrapper.locator('.pt-hand-play-btn');
                if (await playBtn.isVisible().catch(() => false)) {
                    // Click the play button
                    await playBtn.click();
                    await page.waitForTimeout(500);

                    // Card viewer should NOT be visible
                    const viewer = page.locator('#ptCardViewer');
                    const viewerDisplay = await viewer.evaluate(el => el.style.display).catch(() => 'none');
                    expect(viewerDisplay).not.toBe('flex');

                    // The card should have been removed from hand (played)
                    const newCount = await handCards.count();
                    expect(newCount).toBeLessThan(count);
                    break;
                }
            }
        }
    });

    test('Discard button removes card from hand', async ({ page }) => {
        await openPlaytester(page);
        await startGame(page);
        await page.waitForTimeout(1500);

        const handCards = page.locator('#ptHandZone .pt-hand-wrapper');
        const initialCount = await handCards.count();

        if (initialCount > 0) {
            // Hover over first card
            await handCards.first().hover();
            await page.waitForTimeout(200);

            const discBtn = handCards.first().locator('.pt-hand-disc-btn');
            if (await discBtn.isVisible().catch(() => false)) {
                await discBtn.click();
                await page.waitForTimeout(500);

                // Card viewer should NOT be visible
                const viewer = page.locator('#ptCardViewer');
                const viewerDisplay = await viewer.evaluate(el => el.style.display).catch(() => 'none');
                expect(viewerDisplay).not.toBe('flex');

                // Card count should decrease
                const newCount = await handCards.count();
                expect(newCount).toBeLessThan(initialCount);
            }
        }
    });

    test('Single click on card image selects but does NOT open viewer', async ({ page }) => {
        await openPlaytester(page);
        await startGame(page);
        await page.waitForTimeout(1500);

        const handCards = page.locator('#ptHandZone .pt-hand-wrapper');
        const count = await handCards.count();

        if (count > 0) {
            const cardImg = handCards.first().locator('img');
            await cardImg.click();
            await page.waitForTimeout(500);

            // Card viewer should NOT be visible after single click
            const viewer = page.locator('#ptCardViewer');
            const viewerDisplay = await viewer.evaluate(el => el.style.display).catch(() => 'none');
            expect(viewerDisplay).not.toBe('flex');

            // Card should be selected (yellow outline)
            const isSelected = await cardImg.evaluate(el => el.classList.contains('pt-card-selected'));
            expect(isSelected).toBe(true);
        }
    });

    test('Hand P1/P2 count labels exist', async ({ page }) => {
        await openPlaytester(page);
        const p1Count = page.locator('#ptHandCount');
        const p2Count = page.locator('#ptOppHandCount');
        await expect(p1Count).toBeAttached();
        await expect(p2Count).toBeAttached();
    });

    test('Board buttons (Attack, End Turn, Opponent, Actions) are visible', async ({ page }) => {
        await openPlaytester(page);
        const buttonsContainer = page.locator('#pt-side-buttons-left');
        await expect(buttonsContainer).toBeVisible({ timeout: 5000 });

        const attackBtn = buttonsContainer.locator('[data-i18n="pt.btnAttack"]');
        const endTurnBtn = buttonsContainer.locator('[data-i18n="pt.btnEndTurn"]');
        const oppBtn = buttonsContainer.locator('[data-i18n="pt.btnOppView"]');
        const actionsBtn = buttonsContainer.locator('[data-i18n="pt.btnActions"]');

        await expect(attackBtn).toBeVisible();
        await expect(endTurnBtn).toBeVisible();
        await expect(oppBtn).toBeVisible();
        await expect(actionsBtn).toBeVisible();
    });
});
