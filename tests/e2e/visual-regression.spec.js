/**
 * Visual Regression Tests — Hausi's Pokemon TCG Analysis
 *
 * Uses Playwright's toHaveScreenshot() to pixel-diff key UI components.
 *
 * FIRST RUN: Screenshots don't exist yet → run with --update-snapshots to generate baselines:
 *   npx playwright test tests/e2e/visual-regression.spec.js --update-snapshots
 *
 * SUBSEQUENT RUNS: Compares against the saved baselines in __snapshots__/.
 * Baselines are committed to git so CI catches regressions automatically.
 *
 * If a change is intentional (e.g. a UI redesign), regenerate baselines:
 *   npx playwright test tests/e2e/visual-regression.spec.js --update-snapshots
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://127.0.0.1:8000/index.html';

/** Wait for the app to fully bootstrap (switchTab available + first tab data rendered). */
async function waitForAppReady(page) {
    await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20_000 });
}

/** Navigate to a named tab and wait until it is active. */
async function goToTab(page, tabId) {
    await page.evaluate((id) => window.switchTab(id), tabId);
    await page.waitForSelector(`#${tabId}.tab-content.active`, { timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Card Action Buttons — equal-width layout (regression for 1fr/1fr/2fr bug)
// Tests that both button rows inside a meta card tile are the same width.
// ---------------------------------------------------------------------------
test.describe('Card Action Buttons', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        await goToTab(page, 'city-league-analysis');
        // Wait for meta card grid to render at least one card with action buttons.
        await page.waitForSelector('.card-action-buttons', { timeout: 30_000 });
    });

    test('card action buttons are equal width in both rows', async ({ page }) => {
        const section = page.locator('#city-league-analysis.tab-content.active');
        const firstCard = section.locator('.card-action-buttons').first();

        // Row 1: -, ★, + (always 3 buttons)
        const row1Widths = await firstCard.locator('.card-action-row:not(.card-action-row-wide) button')
            .evaluateAll((btns) => btns.map((b) => Math.round(b.getBoundingClientRect().width)));

        // Row 2: L, P, price (L may be <span> if no set info — filter to buttons only)
        const row2Widths = await firstCard.locator('.card-action-row-wide button')
            .evaluateAll((btns) => btns.map((b) => Math.round(b.getBoundingClientRect().width)));

        expect(row1Widths.length).toBeGreaterThanOrEqual(2);
        expect(row2Widths.length).toBeGreaterThanOrEqual(2);

        // Within row 1: all buttons equal width (±2px tolerance for sub-pixel rounding).
        const [r1first, ...r1rest] = row1Widths;
        for (const w of r1rest) {
            expect(Math.abs(w - r1first)).toBeLessThanOrEqual(2);
        }

        // Within row 2: all buttons equal — main regression check (was 1fr 1fr 2fr / 28px 28px 1fr).
        const [r2first, ...r2rest] = row2Widths;
        for (const w of r2rest) {
            expect(Math.abs(w - r2first)).toBeLessThanOrEqual(2);
        }
    });

    test('card action buttons screenshot matches baseline', async ({ page }) => {
        const section = page.locator('#city-league-analysis.tab-content.active');
        const firstCard = section.locator('.card-action-buttons').first();
        await expect(firstCard).toHaveScreenshot('card-action-buttons.png');
    });
});

// ---------------------------------------------------------------------------
// Navigation — pokeball menu and cards sub-navigation
// ---------------------------------------------------------------------------
test.describe('Navigation', () => {
    test('pokeball menu dropdown screenshot matches baseline', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);

        // Open the pokeball nav dropdown.
        await page.locator('#mainMenuTrigger').click();
        const dropdown = page.locator('#mainMenuDropdown');
        await expect(dropdown).toBeVisible({ timeout: 5_000 });
        await expect(dropdown).toHaveScreenshot('pokeball-nav-dropdown.png');
    });

});

// ---------------------------------------------------------------------------
// City League Tab — hero section + archetype table
// ---------------------------------------------------------------------------
test.describe('City League Tab', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        await goToTab(page, 'city-league');
    });

    test('hero archetype grid screenshot matches baseline', async ({ page }) => {
        const heroGrid = page.locator('.tier-hero-grid').first();
        await expect(heroGrid).toBeVisible({ timeout: 30_000 });

        const box = await heroGrid.boundingBox();
        expect(box).not.toBeNull();

        // Use a fixed-height clip to avoid cross-platform locator screenshot rounding (139/141/142px).
        const clip = {
            x: Math.max(0, Math.round(box.x)),
            y: Math.max(0, Math.round(box.y)),
            width: Math.round(box.width),
            height: 141,
        };

        // Hero text can still reflow slightly across OS/font stacks.
        await expect(page).toHaveScreenshot('city-league-hero-grid.png', {
            clip,
            maxDiffPixelRatio: 0.04,
        });
    });

    test('archetype table screenshot matches baseline', async ({ page }) => {
        const table = page.locator('#city-league table').first();
        await expect(table).toBeVisible({ timeout: 30_000 });
        await table.scrollIntoViewIfNeeded();
        await expect(table).toHaveScreenshot('city-league-archetype-table.png', {
            maxDiffPixelRatio: 0.03,
        });
    });
});

// ---------------------------------------------------------------------------
// Current Meta Tab — matchup tables (formerly had 1fr 1fr 2fr button bug)
// ---------------------------------------------------------------------------
test.describe.fixme('Current Meta Tab', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);
        await goToTab(page, 'current-meta');
        await page.waitForSelector('#current-meta.tab-content.active', { timeout: 30_000 });

        // Wait for deck selector bootstrap, then force-select first real deck option.
        await page.waitForSelector('#currentMetaDeckSelect', { state: 'attached', timeout: 60_000 });
        await page.waitForFunction(() => {
            const select = document.getElementById('currentMetaDeckSelect');
            if (!select) return false;
            return Array.from(select.options).some((option) => option.value && option.value.trim().length > 0);
        }, null, { timeout: 60_000 });

        await page.evaluate(() => {
            const select = document.getElementById('currentMetaDeckSelect');
            if (!select) return;

            const realOptions = Array.from(select.options).filter((option) => option.value && option.value.trim().length > 0);
            if (realOptions.length === 0) return;

            if (!select.value || !select.value.trim()) {
                select.value = realOptions[0].value;
            }

            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await page.waitForFunction(() => {
            const section = document.getElementById('currentMetaMatchupsSection');
            if (!section || section.classList.contains('d-none')) return false;

            const style = window.getComputedStyle(section);
            if (style.display === 'none' || style.visibility === 'hidden') return false;

            const bestRows = section.querySelectorAll('#currentMetaBestMatchups tr').length;
            const worstRows = section.querySelectorAll('#currentMetaWorstMatchups tr').length;
            return bestRows > 0 && worstRows > 0;
        }, null, { timeout: 60_000 });
    });

    test('best matchups table screenshot matches baseline', async ({ page }) => {
        const wrapper = page.locator('#currentMetaMatchupsSection .mobile-table-scroll[aria-label="Best matchups table scroll area"]').first();
        await expect(wrapper).toBeVisible({ timeout: 30_000 });
        await expect(wrapper).toHaveScreenshot('current-meta-best-matchups.png');
    });

    test('worst matchups table screenshot matches baseline', async ({ page }) => {
        const wrapper = page.locator('#currentMetaMatchupsSection .mobile-table-scroll[aria-label="Worst matchups table scroll area"]').first();
        await expect(wrapper).toBeVisible({ timeout: 30_000 });
        await expect(wrapper).toHaveScreenshot('current-meta-worst-matchups.png');
    });
});

// ---------------------------------------------------------------------------
// Rarity Switcher Modal — visual consistency check
// ---------------------------------------------------------------------------
test.describe('Rarity Switcher Modal', () => {
    test('rarity switcher modal screenshot matches baseline', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);

        await goToTab(page, 'cards');
        await page.waitForSelector('.card-database-rarity-btn', { timeout: 30_000 });

        const rarityButton = page.locator('.card-database-rarity-btn').first();
        await rarityButton.click();

        const modal = page.locator('#raritySwitcherModal');
        await expect(modal).toHaveClass(/show/, { timeout: 10_000 });
        await page.waitForSelector('#rarityOptionsList .rarity-option-card', { timeout: 10_000 });

        await expect(modal).toHaveScreenshot('rarity-switcher-modal.png');

        await page.keyboard.press('Escape');
    });
});

// ---------------------------------------------------------------------------
// Cards Database Tab — card grid layout
// ---------------------------------------------------------------------------
test.describe('Cards Database Tab', () => {
    test('cards database grid screenshot matches baseline', async ({ page }) => {
        await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
        await waitForAppReady(page);

        await goToTab(page, 'cards');
        // Wait for at least one card to render.
        await page.waitForSelector('.card-database-item', { timeout: 30_000 });

        const grid = page.locator('.card-database-grid').first();
        await expect(grid).toHaveScreenshot('cards-database-grid.png');
    });
});
