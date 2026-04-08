/**
 * Mobile UX Audit – vollständiger E2E-Test für alle Tabs auf iPhone 12 Viewport.
 *
 * Prüft: Navigation, Filter-Richtung, Button-Erreichbarkeit, Overflow,
 *        Dropdowns, Modals, Touch-Bereiche, Lesbarkeit, Scroll-Verhalten.
 *
 * Aufruf:  node tests/mobile_ux_audit.js
 * Voraussetzung: HTTP-Server auf http://127.0.0.1:8000
 */

const { chromium } = require('playwright');
const fs   = require('fs');
const path = require('path');

// ── Config ─────────────────────────────────────────────────────────────
const BASE        = 'http://127.0.0.1:8000/index.html';
const VIEWPORT    = { width: 390, height: 844 };           // iPhone 12
const SCREENSHOT  = path.join(__dirname, '..', 'test-artifacts', 'mobile-ux-audit');
const REPORT_PATH = path.join(__dirname, '..', 'mobile-ux-audit-report.json');
const TIMEOUT     = 8000;
const DATA_WAIT   = 4000;   // time for CSVs/JSON to load

// ── Helpers ────────────────────────────────────────────────────────────
const findings = [];
let   page, browser, screenshotIdx = 0;

function log(severity, tab, msg, extra) {
  const entry = { severity, tab, msg, ...(extra || {}) };
  findings.push(entry);
  const icon = severity === 'CRITICAL' ? '🔴' : severity === 'WARN' ? '🟡' : '🟢';
  console.log(`${icon} [${tab}] ${msg}`);
}

async function snap(name) {
  screenshotIdx++;
  const fname = `${String(screenshotIdx).padStart(3, '0')}-${name}.png`;
  await page.screenshot({ path: path.join(SCREENSHOT, fname), fullPage: false });
  return fname;
}

async function snapFull(name) {
  screenshotIdx++;
  const fname = `${String(screenshotIdx).padStart(3, '0')}-${name}-full.png`;
  await page.screenshot({ path: path.join(SCREENSHOT, fname), fullPage: true });
  return fname;
}

/** Navigate to a tab via the pokeball menu */
async function goTab(tabId) {
  // Open menu
  const menuBtn = page.locator('#mainMenuTrigger');
  await menuBtn.click();
  await page.waitForTimeout(400);

  // Expand "Meta & Tier Lists" if needed
  const metaGroup = page.locator('.menu-group-toggle:has-text("Meta")');
  if (await metaGroup.count() > 0) {
    const submenu = page.locator('.menu-submenu').first();
    const isOpen = await submenu.evaluate(el => el.classList.contains('open'));
    if (!isOpen && ['city-league','city-league-analysis','current-meta','current-analysis','past-meta'].includes(tabId)) {
      await metaGroup.click();
      await page.waitForTimeout(300);
    }
  }

  // Click menu item
  const sel = `[data-tab="${tabId}"], .menu-btn-${tabId}, [onclick*="'${tabId}'"], [onclick*="\\"${tabId}\\""]`;
  const item = page.locator(`#mainMenuDropdown ${sel}`).first();
  if (await item.count() === 0) {
    // Fallback: try by text content 
    const allItems = page.locator('#mainMenuDropdown .menu-item, #mainMenuDropdown .menu-subitem');
    const count = await allItems.count();
    for (let i = 0; i < count; i++) {
      const onclick = await allItems.nth(i).getAttribute('onclick') || '';
      if (onclick.includes(tabId)) {
        await allItems.nth(i).click();
        await page.waitForTimeout(600);
        return;
      }
    }
    log('WARN', tabId, `Could not find menu item for tab ${tabId}`);
    return;
  }
  await item.click();
  await page.waitForTimeout(600);
}

/** Check if an element overflows the viewport horizontally */
async function checkHorizontalOverflow(selector, label, tab) {
  const els = page.locator(selector);
  const count = await els.count();
  for (let i = 0; i < count; i++) {
    const box = await els.nth(i).boundingBox();
    if (!box) continue;
    if (box.x + box.width > VIEWPORT.width + 2) {
      log('CRITICAL', tab, `${label} overflows viewport (right edge at ${Math.round(box.x + box.width)}px, viewport=${VIEWPORT.width}px)`);
    }
  }
}

/** Check touch target sizes (min 44×44 per WCAG) */
async function checkTouchTargets(selector, label, tab) {
  const els = page.locator(selector);
  const count = await els.count();
  let tooSmall = 0;
  for (let i = 0; i < count; i++) {
    const visible = await els.nth(i).isVisible().catch(() => false);
    if (!visible) continue;
    const box = await els.nth(i).boundingBox();
    if (!box) continue;
    if (box.width < 38 || box.height < 38) {
      tooSmall++;
    }
  }
  if (tooSmall > 0) {
    log('WARN', tab, `${tooSmall}× ${label} touch targets < 38px (WCAG recommends 44px)`);
  }
}

/** Check if a dropdown/select opens upward when near bottom of viewport */
async function checkDropdownDirection(selectSelector, tab, label) {
  const sel = page.locator(selectSelector);
  if (await sel.count() === 0) return;
  const visible = await sel.isVisible().catch(() => false);
  if (!visible) return;

  // Scroll so the select is near bottom of viewport
  await sel.scrollIntoViewIfNeeded();
  const box = await sel.boundingBox();
  if (!box) return;

  // Check if it's a searchable-select
  const parent = page.locator(`${selectSelector}`).locator('..').locator('.searchable-select-dropdown');
  if (await parent.count() > 0) {
    // Click to open
    await sel.click();
    await page.waitForTimeout(500);
    const dd = page.locator('.searchable-select-dropdown.open').first();
    if (await dd.count() > 0) {
      const ddBox = await dd.boundingBox();
      if (ddBox && ddBox.y < box.y) {
        log('WARN', tab, `${label}: searchable dropdown opens UPWARD (top: ${Math.round(ddBox.y)}px, trigger: ${Math.round(box.y)}px) — may be hard to use on mobile`);
        await snap(`${tab}-dropup-${label.replace(/\s/g, '-')}`);
      }
      // Close it
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
  }
}

/** Check all visible text for readability (font-size >= 12px) */
async function checkFontSizes(tab) {
  const tooSmall = await page.evaluate(() => {
    const results = [];
    // Card-grid elements are intentionally compact on small screens
    const GRID_EXEMPT = /card-database-(name|meta|set|type|price|rarity|proxy|limitless|coverage|secondary|button)|card-badge/;
    const walker = document.createTreeWalker(document.querySelector('.tab-content.active') || document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const cls = typeof node.className === 'string' ? node.className : '';
      if (GRID_EXEMPT.test(cls)) continue;
      // Also skip if closest ancestor is a card-grid item
      if (node.closest && node.closest('.card-database-item')) continue;
      const fs = parseFloat(style.fontSize);
      if (fs > 0 && fs < 12 && node.textContent.trim().length > 0 && node.children.length === 0) {
        results.push({ tag: node.tagName, class: cls.substring(0, 50), fontSize: fs, text: node.textContent.trim().substring(0, 40) });
      }
    }
    return results.slice(0, 10);
  });
  if (tooSmall.length > 0) {
    log('WARN', tab, `${tooSmall.length} elements with font-size < 12px`, { examples: tooSmall.slice(0, 3) });
  }
}

/** Check for horizontal scroll on the page */
async function checkPageOverflow(tab) {
  const overflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });
  if (overflow) {
    log('CRITICAL', tab, 'Page has horizontal scroll — content overflows viewport');
    await snap(`${tab}-horizontal-overflow`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//   TAB-SPECIFIC TESTS
// ═══════════════════════════════════════════════════════════════════════

async function auditLanding() {
  const tab = 'landing';
  console.log('\n━━━ LANDING / NAVIGATION ━━━');

  // Check landing state
  await snap('landing-initial');
  await checkPageOverflow(tab);

  // Test pokeball menu
  await page.click('#mainMenuTrigger');
  await page.waitForTimeout(500);
  const menuVisible = await page.locator('#mainMenuDropdown.show').count();
  if (menuVisible === 0) {
    log('CRITICAL', tab, 'Pokeball menu did not open');
  } else {
    log('OK', tab, 'Pokeball menu opens correctly');
    await snap('menu-open');

    // Check menu doesn't overflow
    const menuBox = await page.locator('#mainMenuDropdown').boundingBox();
    if (menuBox && menuBox.x + menuBox.width > VIEWPORT.width) {
      log('CRITICAL', tab, `Menu overflows viewport (width: ${Math.round(menuBox.width)}px)`);
    }

    // Check all menu items are tappable
    await checkTouchTargets('#mainMenuDropdown .menu-item, #mainMenuDropdown .menu-subitem', 'Menu items', tab);

    // Test submenu expansion
    const metaGroup = page.locator('.menu-group-toggle').first();
    if (await metaGroup.count() > 0) {
      await metaGroup.click();
      await page.waitForTimeout(300);
      await snap('menu-submenu-expanded');
      log('OK', tab, 'Meta submenu expands correctly');
    }
  }

  // Close menu by clicking outside
  await page.click('body', { position: { x: 350, y: 400 } });
  await page.waitForTimeout(300);

  // Language toggle
  const langBtn = page.locator('#langToggleBtn');
  if (await langBtn.isVisible()) {
    const langBox = await langBtn.boundingBox();
    if (langBox && (langBox.width < 38 || langBox.height < 38)) {
      log('WARN', tab, `Language toggle too small: ${Math.round(langBox.width)}×${Math.round(langBox.height)}px`);
    }
  }
}

async function auditCityLeague() {
  const tab = 'city-league';
  console.log('\n━━━ CITY LEAGUE META ━━━');
  await goTab('city-league');
  await page.waitForTimeout(DATA_WAIT);
  await snap('city-league-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Format selector
  const formatSel = page.locator('#cityLeagueFormatSelect');
  if (await formatSel.isVisible()) {
    await checkTouchTargets('#cityLeagueFormatSelect', 'Format select', tab);
    log('OK', tab, 'Format selector visible');
  }

  // Help button
  const helpBtn = page.locator('#city-league .tab-help-btn');
  if (await helpBtn.count() > 0 && await helpBtn.first().isVisible()) {
    const hBox = await helpBtn.first().boundingBox();
    if (hBox && (hBox.width < 38 || hBox.height < 38)) {
      log('WARN', tab, `Help button too small: ${Math.round(hBox.width)}×${Math.round(hBox.height)}px`);
    }
  }

  // Check tier sections rendered
  const tierDecks = page.locator('#city-league .tier-deck-grid .deck-banner-card, #city-league .top-archetypes-hero');
  const deckCount = await tierDecks.count();
  if (deckCount === 0) {
    log('WARN', tab, 'No tier sections / deck banners rendered (data may not be loaded)');
  } else {
    log('OK', tab, `${deckCount} deck elements rendered in tier sections`);
  }

  // Check banner cards overflow
  await checkHorizontalOverflow('#city-league .deck-banner-card', 'Deck banner card', tab);
  await snapFull('city-league-full');
}

async function auditCityLeagueAnalysis() {
  const tab = 'city-league-analysis';
  console.log('\n━━━ CITY LEAGUE DECK ANALYSIS ━━━');
  await goTab('city-league-analysis');
  await page.waitForTimeout(DATA_WAIT);
  await snap('cl-analysis-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Date inputs
  const dateFrom = page.locator('#cityLeagueDateFrom');
  const dateTo = page.locator('#cityLeagueDateTo');
  if (await dateFrom.isVisible()) {
    const dBox = await dateFrom.boundingBox();
    log('OK', tab, `Date From input visible (${Math.round(dBox?.width || 0)}×${Math.round(dBox?.height || 0)}px)`);
  }

  // Deck select dropdown  
  const deckSel = page.locator('#cityLeagueDeckSelect');
  if (await deckSel.isVisible()) {
    const options = await deckSel.locator('option').count();
    if (options <= 1) {
      log('WARN', tab, 'Deck select has no archetypes loaded');
    } else {
      log('OK', tab, `Deck select has ${options - 1} archetypes`);
      // Select first real archetype
      const firstVal = await deckSel.locator('option').nth(1).getAttribute('value');
      if (firstVal) {
        await deckSel.selectOption(firstVal);
        await page.waitForTimeout(2000);
        await snap('cl-analysis-deck-selected');
      }
    }
  }

  // Card type filter buttons — check they wrap properly
  const typeButtons = page.locator('#city-league-analysis [id^="overviewType"]');
  const typeBtnCount = await typeButtons.count();
  if (typeBtnCount > 0) {
    await checkTouchTargets('#city-league-analysis [id^="overviewType"]', 'Card type filter buttons', tab);
    await checkHorizontalOverflow('#city-league-analysis .city-league-cards-controls', 'Card controls section', tab);

    // Check if buttons are accessible (not cut off)
    const lastBtn = typeButtons.last();
    const lBox = await lastBtn.boundingBox();
    if (lBox && lBox.x + lBox.width > VIEWPORT.width) {
      log('CRITICAL', tab, 'Card type buttons overflow viewport — last button not reachable');
      await snap('cl-type-buttons-overflow');
    }
  }

  // Rarity toggles
  await checkTouchTargets('#city-league-analysis .btn-toggle-group button', 'Rarity toggles', tab);

  // Search input
  const searchInput = page.locator('#cityLeagueOverviewSearch');
  if (await searchInput.isVisible()) {
    const sBox = await searchInput.boundingBox();
    if (sBox && sBox.width < 150) {
      log('WARN', tab, `Search input too narrow: ${Math.round(sBox.width)}px`);
    }
  }

  // Copy / Grid toggle buttons
  await checkTouchTargets('#city-league-analysis .deck-action-btn, #city-league-analysis button.btn', 'Action buttons', tab);

  // Scroll to deck builder section
  const deckBuilder = page.locator('#city-league-analysis .deck-builder-section, #city-league-analysis #cityLeagueMyDeckGrid').first();
  if (await deckBuilder.count() > 0) {
    try {
      const dbVisible = await deckBuilder.isVisible().catch(() => false);
      if (dbVisible) {
        await deckBuilder.scrollIntoViewIfNeeded({ timeout: 3000 });
        await page.waitForTimeout(500);
        await snap('cl-analysis-deck-builder');
        await checkTouchTargets('#city-league-analysis .deck-builder-section button', 'Deck builder buttons', tab);
      }
    } catch(e) { log('WARN', tab, `Deck builder section not scrollable: ${e.message.substring(0,60)}`); }
  }

  // Meta Card Analysis section
  const metaLoadBtn = page.locator('#city-league-analysis button:has-text("Meta Card"), #city-league-analysis button:has-text("Load Meta")');
  if (await metaLoadBtn.count() > 0) {
    try {
      const mlVisible = await metaLoadBtn.first().isVisible().catch(() => false);
      if (mlVisible) {
        await metaLoadBtn.first().scrollIntoViewIfNeeded({ timeout: 3000 });
        await snap('cl-meta-card-section');
      }
    } catch(e) { /* section may be hidden */ }
  }

  await snapFull('cl-analysis-full');
}

async function auditCurrentMeta() {
  const tab = 'current-meta';
  console.log('\n━━━ CURRENT META (GLOBAL) ━━━');
  await goTab('current-meta');
  await page.waitForTimeout(DATA_WAIT);
  await snap('current-meta-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Hero section
  const hero = page.locator('#currentMetaTierSections .top-archetypes-hero, #currentMetaTierSections .hero-archetype-card');
  const heroCount = await hero.count();
  if (heroCount === 0) {
    log('WARN', tab, 'No hero archetype cards rendered');
  } else {
    log('OK', tab, `${heroCount} hero archetype cards rendered`);
    await checkHorizontalOverflow('.hero-archetype-card', 'Hero card', tab);
  }

  // Tier banners
  const tierBanners = page.locator('#currentMetaTierSections .deck-banner-card');
  const bannerCount = await tierBanners.count();
  log(bannerCount > 0 ? 'OK' : 'WARN', tab, `${bannerCount} tier deck banners`);
  await checkHorizontalOverflow('#currentMetaTierSections .deck-banner-card', 'Tier banner', tab);

  await snapFull('current-meta-full');
}

async function auditCurrentAnalysis() {
  const tab = 'current-analysis';
  console.log('\n━━━ CURRENT META DECK ANALYSIS ━━━');
  await goTab('current-analysis');
  await page.waitForTimeout(DATA_WAIT);
  await snap('current-analysis-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Format filter buttons
  const formatBtns = page.locator('.current-meta-format-btns button');
  const fmtCount = await formatBtns.count();
  if (fmtCount > 0) {
    await checkTouchTargets('.current-meta-format-btns button', 'Format filter buttons', tab);
    // Check wrapping
    const firstBox = await formatBtns.first().boundingBox();
    const lastBox = await formatBtns.last().boundingBox();
    if (firstBox && lastBox && lastBox.x + lastBox.width > VIEWPORT.width) {
      log('CRITICAL', tab, 'Format filter buttons overflow viewport');
      await snap('cm-format-btns-overflow');
    }
    // Check if they stack vertically on mobile or stay inline
    if (firstBox && lastBox && firstBox.y === lastBox.y && fmtCount >= 3) {
      log('WARN', tab, `All ${fmtCount} format buttons on one line — may be too crowded on mobile`);
    }
  }

  // Deck select
  const deckSel = page.locator('#currentMetaDeckSelect');
  if (await deckSel.isVisible()) {
    const options = await deckSel.locator('option').count();
    if (options > 1) {
      log('OK', tab, `Deck select has ${options - 1} archetypes`);
      await deckSel.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
      await snap('cm-analysis-deck-selected');

      // Check card overview card type buttons
      await checkTouchTargets('#current-analysis [id^="currentMetaOverviewType"]', 'Card type buttons', tab);
      await checkHorizontalOverflow('#current-analysis .city-league-cards-controls', 'Card controls', tab);
    }
  }

  // Matchups section
  const matchupTitle = page.locator('#currentMetaMatchupsTitle');
  if (await matchupTitle.count() > 0) {
    const mtVisible = await matchupTitle.isVisible().catch(() => false);
    if (mtVisible) {
      try { await matchupTitle.scrollIntoViewIfNeeded({ timeout: 3000 }); } catch(e) {}
      await page.waitForTimeout(500);
      await snap('cm-matchups-section');
      
      // Opponent search
      const oppSearch = page.locator('#currentMetaOpponentSearch');
      if (await oppSearch.isVisible()) {
        await oppSearch.click();
        await oppSearch.fill('Pika');
        await page.waitForTimeout(500);
        const dropdown = page.locator('#currentMetaOpponentDropdown');
        const ddVisible = await dropdown.isVisible().catch(() => false);
        if (ddVisible) {
          const ddBox = await dropdown.boundingBox();
          const inputBox = await oppSearch.boundingBox();
          if (ddBox && inputBox && ddBox.y < inputBox.y) {
            log('WARN', tab, 'Opponent dropdown opens UPWARD — difficult on mobile');
            await snap('cm-opponent-dropup');
          } else {
            log('OK', tab, 'Opponent dropdown opens downward');
          }
          await snap('cm-opponent-dropdown');
        }
        await oppSearch.fill('');
      }
    }
  }

  // Deck builder buttons
  try {
    await checkTouchTargets('#current-analysis .deck-builder-section button, #current-analysis .deck-controls button', 'Deck builder buttons', tab);
  } catch(e) {}

  await snapFull('current-analysis-full');
}

async function auditPastMeta() {
  const tab = 'past-meta';
  console.log('\n━━━ PAST META ━━━');
  await goTab('past-meta');
  await page.waitForTimeout(DATA_WAIT + 2000); // extra time for chunk loading
  await snap('past-meta-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Format and Tournament filters
  const formatFilter = page.locator('#pastMetaFormatFilter');
  const tournFilter = page.locator('#pastMetaTournamentFilter');

  if (await formatFilter.isVisible()) {
    const opts = await formatFilter.locator('option').count();
    log(opts > 1 ? 'OK' : 'WARN', tab, `Format filter has ${opts} options`);
    
    // Select a format
    if (opts > 1) {
      await formatFilter.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
      await snap('past-meta-format-selected');
    }
  }

  if (await tournFilter.isVisible()) {
    const opts = await tournFilter.locator('option').count();
    log(opts > 1 ? 'OK' : 'WARN', tab, `Tournament filter has ${opts} options`);
  }

  // Deck select  
  const deckSel = page.locator('#pastMetaDeckSelect');
  if (await deckSel.isVisible()) {
    const opts = await deckSel.locator('option').count();
    if (opts > 1) {
      log('OK', tab, `Deck select has ${opts - 1} archetypes`);
      await deckSel.selectOption({ index: 1 });
      await page.waitForTimeout(2000);
      await snap('past-meta-deck-selected');
    }
  }

  // Card type buttons
  await checkTouchTargets('#past-meta [id^="pastMetaOverviewType"]', 'Card type buttons', tab);

  await snapFull('past-meta-full');
}

async function auditCardsDatabase() {
  const tab = 'cards';
  console.log('\n━━━ CARD DATABASE ━━━');
  await goTab('cards');
  await page.waitForTimeout(DATA_WAIT);
  await snap('cards-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Search input
  const searchInput = page.locator('#cardSearch');
  if (await searchInput.isVisible()) {
    const sBox = await searchInput.boundingBox();
    log('OK', tab, `Search input visible (${Math.round(sBox?.width || 0)}px wide)`);

    // Test autocomplete
    await searchInput.click();
    await searchInput.fill('Pikachu');
    await page.waitForTimeout(800);
    const autocomplete = page.locator('#cardSearchAutocomplete');
    if (await autocomplete.isVisible()) {
      const acBox = await autocomplete.boundingBox();
      if (acBox && acBox.x + acBox.width > VIEWPORT.width) {
        log('WARN', tab, 'Autocomplete dropdown overflows viewport');
      }
      await snap('cards-autocomplete');
    }
    await searchInput.fill('');
  }

  // Filter panel toggle
  const filterToggle = page.locator('#cardsFiltersToggle, .cards-filters-toggle');
  if (await filterToggle.count() > 0 && await filterToggle.first().isVisible()) {
    await filterToggle.first().click();
    await page.waitForTimeout(500);
    await snap('cards-filters-panel-open');

    // Check all filter selects
    const filterSelectIds = ['filter-meta-format', 'filter-set', 'filter-rarity', 'filter-category', 'filter-main-pokemon', 'filter-archetype', 'filter-deck-coverage'];
    for (const fId of filterSelectIds) {
      const filterEl = page.locator(`#${fId}`);
      if (await filterEl.count() > 0 && await filterEl.isVisible()) {
        const fBox = await filterEl.boundingBox();
        if (fBox && fBox.width < 100) {
          log('WARN', tab, `Filter #${fId} too narrow: ${Math.round(fBox.width)}px`);
        }
      }
    }

    // Check filter grid overflow
    await checkHorizontalOverflow('.cards-filter-grid', 'Filter grid', tab);

    // Close filters
    await filterToggle.first().click();
    await page.waitForTimeout(300);
  } else {
    log('WARN', tab, 'Filter panel toggle not visible on mobile');
  }

  // Standard/All Prints toggle
  const stdBtn = page.locator('#btnStandardPrint');
  const allBtn = page.locator('#btnAllPrints');
  if (await stdBtn.count() > 0 && await stdBtn.isVisible()) {
    await checkTouchTargets('#btnStandardPrint, #btnAllPrints', 'Print view toggle', tab);
  }

  // Sort select
  const sortSel = page.locator('#cardSortOrder');
  if (await sortSel.count() > 0 && await sortSel.isVisible()) {
    log('OK', tab, 'Sort select visible');
  }

  // Card grid - check number of columns
  const cardGrid = page.locator('#cardsContent');
  if (await cardGrid.count() > 0) {
    const gridCols = await cardGrid.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.gridTemplateColumns;
    });
    log('OK', tab, `Card grid columns: ${gridCols}`);
  }

  await snapFull('cards-full');
}

async function auditCalculator() {
  const tab = 'calculator';
  console.log('\n━━━ PROBABILITY CALCULATOR ━━━');
  await goTab('calculator');
  await page.waitForTimeout(1000);
  await snap('calculator-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Number inputs
  const inputs = ['#calc-deck-size', '#calc-copies', '#calc-drawn', '#calc-in-hand'];
  for (const id of inputs) {
    const inp = page.locator(id);
    if (await inp.count() > 0 && await inp.isVisible()) {
      const box = await inp.boundingBox();
      if (box && box.width < 60) {
        log('WARN', tab, `${id} input too narrow: ${Math.round(box.width)}px`);
      }
    }
  }

  // Fill in values and check results
  await page.fill('#calc-deck-size', '60');
  await page.fill('#calc-copies', '4');
  await page.fill('#calc-drawn', '7');
  await page.fill('#calc-in-hand', '1');
  await page.waitForTimeout(500);

  const drawResult = page.locator('#res-draw');
  if (await drawResult.count() > 0) {
    const text = await drawResult.textContent();
    if (text && text.includes('%')) {
      log('OK', tab, `Calculation works: draw chance = ${text}`);
    }
  }
  await snap('calculator-results');
}

async function auditProxy() {
  const tab = 'proxy';
  console.log('\n━━━ PROXY PRINTER ━━━');
  await goTab('proxy');
  await page.waitForTimeout(1000);
  await snap('proxy-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Textarea
  const textarea = page.locator('#proxyDecklistInput');
  if (await textarea.isVisible()) {
    const tBox = await textarea.boundingBox();
    if (tBox && tBox.width < VIEWPORT.width * 0.85) {
      log('WARN', tab, `Decklist textarea too narrow: ${Math.round(tBox.width)}px (viewport: ${VIEWPORT.width}px)`);
    }
    log('OK', tab, 'Decklist textarea visible');
  }

  // Manual card inputs
  const manualName = page.locator('#proxyManualName');
  if (await manualName.isVisible()) {
    const mBox = await manualName.boundingBox();
    log('OK', tab, `Manual card name input: ${Math.round(mBox?.width || 0)}px wide`);
  }

  // Action buttons
  await checkTouchTargets('#proxy button', 'Proxy action buttons', tab);

  await snapFull('proxy-full');
}

async function auditSandbox() {
  const tab = 'sandbox';
  console.log('\n━━━ PLAYTESTER ━━━');
  await goTab('sandbox');
  await page.waitForTimeout(1000);
  await snap('sandbox-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Import textareas
  const p1Import = page.locator('#sandboxImportP1');
  const p2Import = page.locator('#sandboxImportP2');
  if (await p1Import.isVisible()) {
    const box = await p1Import.boundingBox();
    if (box && box.width < VIEWPORT.width * 0.85) {
      log('WARN', tab, `P1 import textarea too narrow: ${Math.round(box.width)}px`);
    }
  }

  // Action buttons
  await checkTouchTargets('#sandbox button', 'Playtester buttons', tab);

  await snapFull('sandbox-full');
}

async function auditProfile() {
  const tab = 'profile';
  console.log('\n━━━ PROFILE / MY DECKS ━━━');
  await goTab('profile');
  await page.waitForTimeout(1000);
  await snap('profile-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Profile sub-tabs
  const subTabs = page.locator('#profile .profile-tab-btn, #profile [onclick*="switchProfileTab"]');
  const subCount = await subTabs.count();
  if (subCount > 0) {
    await checkTouchTargets('#profile .profile-tab-btn, #profile [onclick*="switchProfileTab"]', 'Profile sub-tabs', tab);

    // Check overflow / horizontal scroll of sub-tab bar
    await checkHorizontalOverflow('#profile .profile-tabs, #profile .profile-tab-container', 'Profile tab bar', tab);

    // Check if sub-tabs are readable
    for (let i = 0; i < subCount; i++) {
      const visible = await subTabs.nth(i).isVisible().catch(() => false);
      if (visible) {
        const box = await subTabs.nth(i).boundingBox();
        const text = await subTabs.nth(i).textContent();
        if (box && box.width < 55) {
          log('WARN', tab, `Sub-tab "${text?.trim()}" too narrow: ${Math.round(box.width)}px`);
        }
      }
    }

    // Test each sub-tab
    const subTabNames = ['collection', 'decks', 'wishlist', 'metabinder', 'custombinder', 'journal', 'settings'];
    for (const st of subTabNames) {
      const btn = page.locator(`#profile [onclick*="'${st}'"], #profile [onclick*="\\"${st}\\""]`).first();
      if (await btn.count() > 0 && await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(500);
        await snap(`profile-${st}`);
        await checkPageOverflow(`profile-${st}`);
      }
    }
  }
}

async function auditTutorial() {
  const tab = 'tutorial';
  console.log('\n━━━ HOW TO USE ━━━');
  await goTab('tutorial');
  await page.waitForTimeout(1000);
  await snap('tutorial-loaded');
  await checkPageOverflow(tab);
  await checkFontSizes(tab);

  // Check expandable sections (or static tutorial sections)
  const expandBtns = page.locator('#tutorial .howto-toggle, #tutorial details summary, #tutorial .accordion-header, #tutorial .tutorial-section');
  const expandCount = await expandBtns.count();
  log(expandCount > 0 ? 'OK' : 'WARN', tab, `${expandCount} expandable sections found`);

  await snapFull('tutorial-full');
}

// ═══════════════════════════════════════════════════════════════════════
//   CROSS-TAB CHECKS
// ═══════════════════════════════════════════════════════════════════════

async function auditSearchableSelects() {
  const tab = 'global-dropdowns';
  console.log('\n━━━ SEARCHABLE SELECT DROPDOWNS (Global) ━━━');

  // Go to a tab that has searchable selects — city-league-analysis
  await goTab('city-league-analysis');
  await page.waitForTimeout(DATA_WAIT);

  // Find all searchable select displays
  const displays = page.locator('.searchable-select-display:visible');
  const count = await displays.count();
  log('OK', tab, `${count} visible searchable-select elements found`);

  for (let i = 0; i < count; i++) {
    const disp = displays.nth(i);
    const box = await disp.boundingBox();
    if (!box) continue;

    // Click to open
    await disp.click();
    await page.waitForTimeout(600);

    const openDD = page.locator('.searchable-select-dropdown.open');
    if (await openDD.count() > 0) {
      const ddBox = await openDD.first().boundingBox();
      if (ddBox) {
        const opensUp = ddBox.y + ddBox.height <= box.y + 5;
        const label = await disp.textContent() || `select-${i}`;
        if (opensUp) {
          log('CRITICAL', tab, `Searchable select "${label.trim().substring(0, 40)}" opens UPWARD on mobile — blocks content above and is hard to scroll`);
          await snap(`searchable-select-dropup-${i}`);
        } else {
          log('OK', tab, `Searchable select "${label.trim().substring(0, 40)}" opens downward`);
        }

        // Check dropdown width vs viewport
        if (ddBox.x + ddBox.width > VIEWPORT.width + 2) {
          log('WARN', tab, `Dropdown overflows right edge by ${Math.round(ddBox.x + ddBox.width - VIEWPORT.width)}px`);
        }

        // Check if search input is accessible
        const searchInput = openDD.first().locator('.searchable-select-search');
        if (await searchInput.count() > 0) {
          const sBox = await searchInput.boundingBox();
          if (sBox && sBox.y < 0) {
            log('CRITICAL', tab, 'Dropdown search input is above viewport — can\'t reach it');
          }
        }
      }
    }

    // Close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
}

async function auditBattleJournalFab() {
  const tab = 'battle-journal-fab';
  console.log('\n━━━ BATTLE JOURNAL FAB ━━━');

  const fab = page.locator('#battleJournalFab');
  if (await fab.count() > 0 && await fab.isVisible()) {
    const fBox = await fab.boundingBox();
    if (fBox) {
      // Check it doesn't overlap important content
      if (fBox.x + fBox.width > VIEWPORT.width) {
        log('WARN', tab, 'Battle Journal FAB overflows viewport');
      }
      if (fBox.width < 44 || fBox.height < 44) {
        log('WARN', tab, `FAB too small: ${Math.round(fBox.width)}×${Math.round(fBox.height)}px`);
      }
      log('OK', tab, `FAB position: (${Math.round(fBox.x)}, ${Math.round(fBox.y)}) ${Math.round(fBox.width)}×${Math.round(fBox.height)}px`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
//   MAIN
// ═══════════════════════════════════════════════════════════════════════

(async () => {
  // Prepare screenshot dir
  if (!fs.existsSync(SCREENSHOT)) fs.mkdirSync(SCREENSHOT, { recursive: true });

  // Launch
  browser = await chromium.launch({
    headless: true,
    executablePath: fs.existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
      ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
      : undefined,
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
  });

  page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  MOBILE UX AUDIT — iPhone 12 (390×844)');
  console.log(`${'═'.repeat(60)}\n`);

  try {
    await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000); // let scripts initialize

    // Run all audits sequentially
    await auditLanding();
    await auditCityLeague();
    await auditCityLeagueAnalysis();
    await auditCurrentMeta();
    await auditCurrentAnalysis();
    await auditPastMeta();
    await auditCardsDatabase();
    await auditCalculator();
    await auditProxy();
    await auditSandbox();
    await auditProfile();
    await auditTutorial();

    // Cross-tab checks
    await auditSearchableSelects();
    await auditBattleJournalFab();

  } catch (err) {
    log('CRITICAL', 'runner', `Unexpected error: ${err.message}`);
    console.error(err);
  }

  await browser.close();

  // ── Report ──────────────────────────────────────────────────────────
  const critical = findings.filter(f => f.severity === 'CRITICAL');
  const warnings = findings.filter(f => f.severity === 'WARN');
  const ok       = findings.filter(f => f.severity === 'OK');

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  AUDIT SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  🔴 CRITICAL:  ${critical.length}`);
  console.log(`  🟡 WARNINGS:  ${warnings.length}`);
  console.log(`  🟢 OK:        ${ok.length}`);
  console.log(`  📸 Screenshots: ${screenshotIdx} (in test-artifacts/mobile-ux-audit/)`);
  console.log(`${'═'.repeat(60)}\n`);

  if (critical.length > 0) {
    console.log('🔴 CRITICAL ISSUES:');
    critical.forEach(f => console.log(`   [${f.tab}] ${f.msg}`));
    console.log();
  }
  if (warnings.length > 0) {
    console.log('🟡 WARNINGS:');
    warnings.forEach(f => console.log(`   [${f.tab}] ${f.msg}`));
    console.log();
  }

  // Save JSON report
  const report = {
    timestamp: new Date().toISOString(),
    viewport: VIEWPORT,
    summary: { critical: critical.length, warnings: warnings.length, ok: ok.length, screenshots: screenshotIdx },
    findings,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`📄 Full report: mobile-ux-audit-report.json`);
})();
