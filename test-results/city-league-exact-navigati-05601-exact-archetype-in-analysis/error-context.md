# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: city-league-exact-navigation.e2e.spec.js >> City League Exact Navigation >> clicking a deck banner selects the exact archetype in analysis
- Location: tests\e2e\city-league-exact-navigation.e2e.spec.js:39:5

# Error details

```
TimeoutError: page.waitForFunction: Timeout 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e3]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - generic "Open navigation menu" [ref=e8] [cursor=pointer]
        - generic [ref=e12]:
          - heading "🎴 Pokémon TCG Hub 🇯🇵 City League Meta" [level=1] [ref=e13]:
            - generic [ref=e14]: 🎴 Pokémon TCG Hub
            - generic [ref=e15]: 🇯🇵 City League Meta
          - paragraph [ref=e16]: Your Portal for Meta Analysis & Deck Building
      - generic [ref=e17]:
        - button "🇬🇧 EN" [ref=e18] [cursor=pointer]
        - button "Open battle journal" [ref=e19]: bj.openShort
        - button "Sign In Sign In" [ref=e21] [cursor=pointer]:
          - img "Sign In" [ref=e22]
          - generic [ref=e23]: Sign In
    - generic [ref=e27]:
      - generic [ref=e28]:
        - heading "🇯🇵 City League Development Help" [level=2] [ref=e29]:
          - text: 🇯🇵 City League Development
          - button "Help" [ref=e30] [cursor=pointer]
        - combobox [ref=e32]:
          - option "Current Meta" [selected]
          - option "Past Meta"
      - generic [ref=e34]: Error loading City League Meta data
      - group [ref=e36]:
        - generic "📊 Meta Share Chart – Top Archetypes ▼ Toggle" [ref=e37] [cursor=pointer]:
          - text: 📊 Meta Share Chart – Top Archetypes
          - generic [ref=e38]: ▼ Toggle
    - paragraph [ref=e45]: "📅 Last Update: 3.4.2026"
  - generic [ref=e46]:
    - generic [ref=e47]:
      - generic [ref=e48]: Card Zoom & Search
      - button [ref=e49] [cursor=pointer]
    - textbox "Search card name…" [ref=e51]
  - generic [ref=e54]:
    - generic [ref=e55]: Card
    - button "Close" [ref=e56] [cursor=pointer]: ×
  - dialog [ref=e58]:
    - generic [ref=e59]:
      - generic [ref=e60]:
        - heading [level=2] [ref=e61]: bj.title
        - paragraph [ref=e62]: bj.subtitle
      - generic [ref=e63]:
        - button [ref=e64]: bj.themeDark
        - button [ref=e65]: ×
    - generic [ref=e66]: bj.statusReady 0 pending
    - generic [ref=e67]:
      - generic [ref=e68]:
        - text: bj.ownDeck
        - combobox [ref=e69]
      - generic [ref=e70]:
        - text: bj.opponentDeck
        - combobox [ref=e71]
      - generic [ref=e72]:
        - generic [ref=e73]:
          - text: bj.bestOf
          - generic [ref=e74]:
            - button [ref=e75]: bj.bo1
            - button [ref=e76]: bj.bo3
        - generic [ref=e77]:
          - text: bj.turnOrder
          - generic [ref=e78]:
            - button [ref=e79]: bj.first
            - button [ref=e80]: bj.second
        - generic [ref=e81]:
          - text: bj.result
          - generic [ref=e82]:
            - button [ref=e83]: bj.win
            - button [ref=e84]: bj.loss
            - button [ref=e85]: bj.tie
      - generic [ref=e86]:
        - button [ref=e87]: bj.clearDraft
        - button [ref=e88]: bj.saveBtn
    - generic [ref=e90]: bj.savedShort
    - generic [ref=e92]:
      - strong [ref=e93]: bj.pendingEntries
      - button [ref=e94]: bj.syncNow
  - dialog "Starting hand simulator" [ref=e95]:
    - generic [ref=e96]:
      - button "×" [ref=e97]
      - heading "🎲 Starting Hand Simulator" [level=2] [ref=e98]
      - generic [ref=e99]:
        - button "🔄 New Hand" [ref=e100] [cursor=pointer]
        - button "➕ Draw Card" [ref=e101] [cursor=pointer]
        - generic [ref=e102]:
          - text: "Deck:"
          - strong [ref=e103]: "0"
          - text: remaining
      - generic [ref=e105]:
        - heading "🎯 Combo Probability" [level=3] [ref=e106]
        - paragraph [ref=e107]: Select up to 4 cards — Calculated via Monte Carlo simulation (10,000 iterations)
        - generic [ref=e108]:
          - combobox "Combo target 1" [ref=e109]
          - combobox "Combo target 2" [ref=e110]
          - combobox "Combo target 3" [ref=e111]
          - combobox "Combo target 4" [ref=e112]
        - generic [ref=e113]:
          - button "📊 Calculate Chance" [ref=e114] [cursor=pointer]
          - button "🗑️ Clear Selection" [ref=e115] [cursor=pointer]
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
     |                ^ TimeoutError: page.waitForFunction: Timeout 30000ms exceeded.
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