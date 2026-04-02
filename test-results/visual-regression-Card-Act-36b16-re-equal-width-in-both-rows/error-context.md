# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-regression.spec.js >> Card Action Buttons >> card action buttons are equal width in both rows
- Location: tests\e2e\visual-regression.spec.js:44:5

# Error details

```
TimeoutError: page.waitForSelector: Timeout 30000ms exceeded.
Call log:
  - waiting for locator('.card-action-buttons') to be visible

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
          - heading "Pokémon TCG Hub City League Meta" [level=1] [ref=e13]:
            - generic [ref=e14]: Pokémon TCG Hub
            - generic [ref=e15]: City League Meta
          - paragraph [ref=e16]: Your Portal for Meta Analysis & Deck Building
      - generic [ref=e17]:
        - button "EN" [ref=e18] [cursor=pointer]
        - button "Open battle journal" [ref=e19] [cursor=pointer]:
          - generic [ref=e20]: Journal
        - button "Sign In Sign In" [ref=e22] [cursor=pointer]:
          - img "Sign In" [ref=e23]
          - generic [ref=e24]: Sign In
    - generic [ref=e28]:
      - heading "City League Deck Analysis Help" [level=2] [ref=e30]:
        - text: City League Deck Analysis
        - button "Help" [ref=e31] [cursor=pointer]
      - generic [ref=e32]:
        - generic [ref=e33]:
          - generic [ref=e34]: "From:"
          - textbox "From:" [ref=e35]
        - generic [ref=e36]:
          - generic [ref=e37]: "To:"
          - textbox "To:" [ref=e38]
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e41]: Select Deck Archetype
          - textbox "Search deck by name" [ref=e43] [cursor=pointer]:
            - /placeholder: Enter deck name...
        - generic [ref=e44]:
          - generic [ref=e45]: Card Share Filter
          - combobox "Card Share Filter" [ref=e46] [cursor=pointer]:
            - option "All Cards" [selected]
            - option "Cards in >90% of Decks (Core)"
            - option "Cards in >70% of Decks"
            - option "Cards in >50% of Decks"
      - generic [ref=e48]:
        - generic [ref=e49]:
          - heading "Card Overview" [level=2] [ref=e50]
          - generic [ref=e51]: 0 Cards/ 0 Total
        - generic [ref=e52]:
          - textbox "Search cards" [ref=e53]:
            - /placeholder: Search name (EN/DE), set+number, or Pokédex...
          - generic [ref=e54]:
            - button "All" [ref=e55] [cursor=pointer]
            - button "Pokémon" [ref=e56] [cursor=pointer]
            - button "Supporter" [ref=e57] [cursor=pointer]
            - button "Item" [ref=e58] [cursor=pointer]
            - button "Tool" [ref=e59] [cursor=pointer]
            - button "Stadium" [ref=e60] [cursor=pointer]
            - button "Energy" [ref=e61] [cursor=pointer]
            - button "Special Energy" [ref=e62] [cursor=pointer]
            - button "Ace Spec" [ref=e63] [cursor=pointer]
          - generic [ref=e64]:
            - button "Low Rarity" [ref=e65] [cursor=pointer]
            - button "Max Rarity" [ref=e66] [cursor=pointer]
            - button "All Prints" [ref=e67] [cursor=pointer]
          - button "Copy" [ref=e69] [cursor=pointer]
          - button "Grid" [ref=e70] [cursor=pointer]
      - generic [ref=e71]:
        - heading "Deck Builder" [level=2] [ref=e72]
        - generic [ref=e73]:
          - generic [ref=e74]:
            - generic [ref=e75]: "Generate:"
            - button "Consistency" [ref=e76] [cursor=pointer]
            - button "Low" [ref=e77] [cursor=pointer]
            - button "Max" [ref=e78] [cursor=pointer]
          - generic [ref=e80]:
            - button "Test Draw" [ref=e81] [cursor=pointer]
            - button "Playtest" [ref=e82] [cursor=pointer]
            - button "Clear" [ref=e83] [cursor=pointer]
        - generic [ref=e84]:
          - generic [ref=e85]:
            - generic [ref=e86]: "Deck:"
            - generic [ref=e87]: 0 / 60 Cards
          - generic [ref=e88]:
            - generic [ref=e89]: "Unique:"
            - generic [ref=e90]: (0 Unique)
          - generic [ref=e91]:
            - generic [ref=e92]: Estimated Price
            - generic [ref=e93]: 0.00 €
        - generic [ref=e94]:
          - generic [ref=e95]:
            - heading "Your Deck" [level=3] [ref=e96]
            - generic [ref=e97]:
              - button "Save" [ref=e98] [cursor=pointer]
              - button "Compare" [ref=e99] [cursor=pointer]
              - button "Copy" [ref=e100] [cursor=pointer]
              - button "Deck → Proxy" [ref=e101] [cursor=pointer]
              - button "Share" [ref=e102] [cursor=pointer]
              - button "PTCGL" [ref=e103] [cursor=pointer]
              - button "PTCGL" [ref=e104] [cursor=pointer]
              - button "Grid" [ref=e105] [cursor=pointer]
          - textbox "Search cards" [ref=e106]:
            - /placeholder: Search name (EN/DE), set+number, or Pokédex...
          - status [ref=e108]:
            - img [ref=e110]
            - heading "Your deck is empty" [level=4] [ref=e112]
            - paragraph [ref=e113]: Create a deck using the buttons above or add cards manually…
            - generic [ref=e114]:
              - button "Generate Deck" [ref=e115] [cursor=pointer]
              - button "Open Test Draw" [ref=e116] [cursor=pointer]
        - generic [ref=e117]:
          - heading "Add Card" [level=3] [ref=e118]
          - textbox "Search cards" [ref=e119]:
            - /placeholder: Search name (EN/DE), set+number, or Pokédex...
        - generic [ref=e121]:
          - generic [ref=e122]:
            - heading "Meta Card Analysis (Top 10 Archetypes)" [level=3] [ref=e123]
            - generic [ref=e124]: 0 Cards
          - generic [ref=e125]:
            - generic [ref=e126]:
              - button "All" [ref=e127] [cursor=pointer]
              - button ">90%" [ref=e128] [cursor=pointer]
              - button ">70%" [ref=e129] [cursor=pointer]
              - button ">50%" [ref=e130] [cursor=pointer]
            - generic [ref=e131]:
              - button "All" [ref=e132] [cursor=pointer]
              - button "Trainer" [ref=e133] [cursor=pointer]
              - button "Pokémon" [ref=e134] [cursor=pointer]
              - button "Energy" [ref=e135] [cursor=pointer]
            - generic [ref=e136]:
              - button "Sort by Type" [ref=e137] [cursor=pointer]
              - button "Sort by Share%" [ref=e138] [cursor=pointer]
              - button "Sort by Average Count" [ref=e139] [cursor=pointer]
          - textbox "Search cards" [ref=e140]:
            - /placeholder: Search name (EN/DE), set+number, or Pokédex...
          - status [ref=e142]:
            - img [ref=e144]
            - heading "Meta analysis not loaded yet" [level=4] [ref=e147]
            - paragraph [ref=e148]: Click "Load Meta Analysis" to see cards from Top 10 Archetypes...
            - button "Load Meta Analysis" [ref=e150] [cursor=pointer]
          - button "Load Meta Analysis" [ref=e152] [cursor=pointer]
    - paragraph [ref=e154]: "Last Update: 2.4.2026"
  - text: × × × ×
  - generic [ref=e155]:
    - generic [ref=e156]:
      - generic [ref=e157]: Card Zoom & Search
      - button [ref=e158] [cursor=pointer]
    - textbox "Search card name…" [ref=e160]
  - text: × ×
  - generic [ref=e163]:
    - generic [ref=e164]: Card
    - button "Close" [ref=e165] [cursor=pointer]: ×
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
      |                    ^ TimeoutError: page.waitForSelector: Timeout 30000ms exceeded.
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