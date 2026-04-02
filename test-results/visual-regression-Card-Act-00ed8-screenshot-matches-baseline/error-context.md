# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-regression.spec.js >> Card Action Buttons >> card action buttons screenshot matches baseline
- Location: tests\e2e\visual-regression.spec.js:72:5

# Error details

```
Error: page.waitForSelector: Test ended.
Call log:
  - waiting for locator('.card-action-buttons') to be visible

```

# Test source

```ts
  1   | /**
  2   |  * Visual Regression Tests — Hausi's Pokemon TCG Analysis
  3   |  *
  4   |  * Uses Playwright's toHaveScreenshot() to pixel-diff key UI components.
  5   |  *
  6   |  * FIRST RUN: Screenshots don't exist yet → run with --update-snapshots to generate baselines:
  7   |  *   npx playwright test tests/e2e/visual-regression.spec.js --update-snapshots
  8   |  *
  9   |  * SUBSEQUENT RUNS: Compares against the saved baselines in __snapshots__/.
  10  |  * Baselines are committed to git so CI catches regressions automatically.
  11  |  *
  12  |  * If a change is intentional (e.g. a UI redesign), regenerate baselines:
  13  |  *   npx playwright test tests/e2e/visual-regression.spec.js --update-snapshots
  14  |  */
  15  | 
  16  | const { test, expect } = require('@playwright/test');
  17  | 
  18  | const BASE_URL = 'http://127.0.0.1:8000/index.html';
  19  | 
  20  | /** Wait for the app to fully bootstrap (switchTab available + first tab data rendered). */
  21  | async function waitForAppReady(page) {
  22  |     await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20_000 });
  23  | }
  24  | 
  25  | /** Navigate to a named tab and wait until it is active. */
  26  | async function goToTab(page, tabId) {
  27  |     await page.evaluate((id) => window.switchTab(id), tabId);
  28  |     await page.waitForSelector(`#${tabId}.tab-content.active`, { timeout: 20_000 });
  29  | }
  30  | 
  31  | // ---------------------------------------------------------------------------
  32  | // Card Action Buttons — equal-width layout (regression for 1fr/1fr/2fr bug)
  33  | // Tests that both button rows inside a meta card tile are the same width.
  34  | // ---------------------------------------------------------------------------
  35  | test.describe('Card Action Buttons', () => {
  36  |     test.beforeEach(async ({ page }) => {
  37  |         await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  38  |         await waitForAppReady(page);
  39  |         await goToTab(page, 'city-league-analysis');
  40  |         // Wait for meta card grid to render at least one card with action buttons.
> 41  |         await page.waitForSelector('.card-action-buttons', { timeout: 30_000 });
      |                    ^ Error: page.waitForSelector: Test ended.
  42  |     });
  43  | 
  44  |     test('card action buttons are equal width in both rows', async ({ page }) => {
  45  |         const section = page.locator('#city-league-analysis.tab-content.active');
  46  |         const firstCard = section.locator('.card-action-buttons').first();
  47  | 
  48  |         // Row 1: -, ★, + (always 3 buttons)
  49  |         const row1Widths = await firstCard.locator('.card-action-row:not(.card-action-row-wide) button')
  50  |             .evaluateAll((btns) => btns.map((b) => Math.round(b.getBoundingClientRect().width)));
  51  | 
  52  |         // Row 2: L, P, price (L may be <span> if no set info — filter to buttons only)
  53  |         const row2Widths = await firstCard.locator('.card-action-row-wide button')
  54  |             .evaluateAll((btns) => btns.map((b) => Math.round(b.getBoundingClientRect().width)));
  55  | 
  56  |         expect(row1Widths.length).toBeGreaterThanOrEqual(2);
  57  |         expect(row2Widths.length).toBeGreaterThanOrEqual(2);
  58  | 
  59  |         // Within row 1: all buttons equal width (±2px tolerance for sub-pixel rounding).
  60  |         const [r1first, ...r1rest] = row1Widths;
  61  |         for (const w of r1rest) {
  62  |             expect(Math.abs(w - r1first)).toBeLessThanOrEqual(2);
  63  |         }
  64  | 
  65  |         // Within row 2: all buttons equal — main regression check (was 1fr 1fr 2fr / 28px 28px 1fr).
  66  |         const [r2first, ...r2rest] = row2Widths;
  67  |         for (const w of r2rest) {
  68  |             expect(Math.abs(w - r2first)).toBeLessThanOrEqual(2);
  69  |         }
  70  |     });
  71  | 
  72  |     test('card action buttons screenshot matches baseline', async ({ page }) => {
  73  |         const section = page.locator('#city-league-analysis.tab-content.active');
  74  |         const firstCard = section.locator('.card-action-buttons').first();
  75  |         await expect(firstCard).toHaveScreenshot('card-action-buttons.png');
  76  |     });
  77  | });
  78  | 
  79  | // ---------------------------------------------------------------------------
  80  | // Navigation — pokeball menu and cards sub-navigation
  81  | // ---------------------------------------------------------------------------
  82  | test.describe('Navigation', () => {
  83  |     test('pokeball menu dropdown screenshot matches baseline', async ({ page }) => {
  84  |         await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  85  |         await waitForAppReady(page);
  86  | 
  87  |         // Open the pokeball nav dropdown.
  88  |         await page.locator('#mainMenuTrigger').click();
  89  |         const dropdown = page.locator('#mainMenuDropdown');
  90  |         await expect(dropdown).toBeVisible({ timeout: 5_000 });
  91  |         await expect(dropdown).toHaveScreenshot('pokeball-nav-dropdown.png');
  92  |     });
  93  | 
  94  | });
  95  | 
  96  | // ---------------------------------------------------------------------------
  97  | // City League Tab — hero section + archetype table
  98  | // ---------------------------------------------------------------------------
  99  | test.describe('City League Tab', () => {
  100 |     test.beforeEach(async ({ page }) => {
  101 |         await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
  102 |         await waitForAppReady(page);
  103 |         await goToTab(page, 'city-league');
  104 |     });
  105 | 
  106 |     test('hero archetype grid screenshot matches baseline', async ({ page }) => {
  107 |         const heroGrid = page.locator('.tier-hero-grid').first();
  108 |         await expect(heroGrid).toBeVisible({ timeout: 30_000 });
  109 | 
  110 |         const box = await heroGrid.boundingBox();
  111 |         expect(box).not.toBeNull();
  112 | 
  113 |         // Use a fixed-height clip to avoid cross-platform locator screenshot rounding (139/141/142px).
  114 |         const clip = {
  115 |             x: Math.max(0, Math.round(box.x)),
  116 |             y: Math.max(0, Math.round(box.y)),
  117 |             width: Math.round(box.width),
  118 |             height: 141,
  119 |         };
  120 | 
  121 |         // Hero text can still reflow slightly across OS/font stacks.
  122 |         await expect(page).toHaveScreenshot('city-league-hero-grid.png', {
  123 |             clip,
  124 |             maxDiffPixelRatio: 0.04,
  125 |         });
  126 |     });
  127 | 
  128 |     test('archetype table screenshot matches baseline', async ({ page }) => {
  129 |         const table = page.locator('#city-league table').first();
  130 |         await expect(table).toBeVisible({ timeout: 30_000 });
  131 |         await table.scrollIntoViewIfNeeded();
  132 | 
  133 |         const box = await table.boundingBox();
  134 |         expect(box).not.toBeNull();
  135 | 
  136 |         // Use a fixed-height clip to avoid cross-platform row-height drift (e.g. 154px vs 158px).
  137 |         const clip = {
  138 |             x: Math.max(0, Math.round(box.x)),
  139 |             y: Math.max(0, Math.round(box.y)),
  140 |             width: Math.round(box.width),
  141 |             height: 158,
```