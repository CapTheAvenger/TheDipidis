# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: city-league-exact-navigation.e2e.spec.js >> City League Exact Navigation >> clicking an archetype table link selects the exact archetype in analysis
- Location: tests\e2e\city-league-exact-navigation.e2e.spec.js:51:5

# Error details

```
Error: page.waitForFunction: Test ended.
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | async function openCityLeagueMeta(page) {
  4  |     await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });
  5  |     await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 20000 });
  6  |     await page.evaluate(() => window.switchTab('city-league'));
  7  |     await page.waitForSelector('#city-league.tab-content.active', { timeout: 20000 });
> 8  |     await page.waitForFunction(() => {
     |                ^ Error: page.waitForFunction: Test ended.
  9  |         const hasBanner = document.querySelectorAll('#cityLeagueContent .deck-banner-card').length > 0;
  10 |         const hasTableLink = document.querySelectorAll('#cityLeagueContent .archetype-jump-link').length > 0;
  11 |         return !!window.cityLeagueLoaded && (hasBanner || hasTableLink);
  12 |     }, null, { timeout: 30000 });
  13 | }
  14 | 
  15 | async function expectExactCityLeagueSelection(page, expectedArchetype) {
  16 |     await page.waitForSelector('#city-league-analysis.tab-content.active', { timeout: 20000 });
  17 | 
  18 |     await page.waitForFunction((archetype) => {
  19 |         const select = document.getElementById('cityLeagueDeckSelect');
  20 |         const input = document.getElementById('cityLeagueDeckCombobox');
  21 |         const decksUsed = document.getElementById('cityLeagueStatDecksUsed');
  22 | 
  23 |         return !!select
  24 |             && select.value === archetype
  25 |             && !!input
  26 |             && input.value.trim() === archetype
  27 |             && !!decksUsed
  28 |             && decksUsed.textContent.trim() !== ''
  29 |             && decksUsed.textContent.trim() !== '-';
  30 |     }, expectedArchetype, { timeout: 30000 });
  31 | 
  32 |     await expect(page.locator('#cityLeagueDeckSelect')).toHaveValue(expectedArchetype);
  33 |     await expect(page.locator('#cityLeagueDeckCombobox')).toHaveValue(expectedArchetype);
  34 |     await expect(page.locator('#cityLeagueStatDecksUsed')).not.toHaveText('-');
  35 |     await expect(page.locator('#cityLeagueStatAvgPlacement')).not.toHaveText('-');
  36 | }
  37 | 
  38 | test.describe('City League Exact Navigation', () => {
  39 |     test('clicking a deck banner selects the exact archetype in analysis', async ({ page }) => {
  40 |         await openCityLeagueMeta(page);
  41 | 
  42 |         const banner = page.locator('.deck-banner-card').first();
  43 |         await expect(banner).toBeVisible({ timeout: 30000 });
  44 | 
  45 |         const expectedArchetype = (await banner.locator('.deck-banner-name').textContent()).trim();
  46 |         await banner.click();
  47 | 
  48 |         await expectExactCityLeagueSelection(page, expectedArchetype);
  49 |     });
  50 | 
  51 |     test('clicking an archetype table link selects the exact archetype in analysis', async ({ page }) => {
  52 |         await openCityLeagueMeta(page);
  53 | 
  54 |         const archetypeLink = page.locator('#cityLeagueContent .archetype-jump-link').first();
  55 |         await expect(archetypeLink).toBeVisible({ timeout: 30000 });
  56 | 
  57 |         const expectedArchetype = (await archetypeLink.textContent()).trim();
  58 |         await archetypeLink.click();
  59 | 
  60 |         await expectExactCityLeagueSelection(page, expectedArchetype);
  61 |     });
  62 | });
```