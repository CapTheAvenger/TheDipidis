/**
 * Quick E2E smoke test for Playtester hand buttons.
 * Run: node tests/e2e-playtester-smoke.js
 */
const { chromium } = require('playwright-core');
const path = require('path');

const BASE = 'http://127.0.0.1:8000';
let passed = 0, failed = 0;

function log(name, ok, detail) {
    const tag = ok ? 'PASS' : 'FAIL';
    console.log(`  [${tag}] ${name}${detail ? ' — ' + detail : ''}`);
    ok ? passed++ : failed++;
}

(async () => {
    // Find Chrome
    const fs = require('fs');
    const chromePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
    const launchOpts = fs.existsSync(chromePath) ? { executablePath: chromePath, headless: true } : { headless: true };

    const browser = await chromium.launch(launchOpts);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('\n=== Playtester E2E Smoke Tests ===\n');

    // Load page with domcontentloaded (faster than load)
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(1000);

    // Navigate to playtester tab
    const menuTrigger = page.locator('#mainMenuTrigger');
    if (await menuTrigger.isVisible()) await menuTrigger.click();
    await page.locator('[data-tab-id="sandbox"]').click({ timeout: 5000 });
    // Trigger deferred script loading
    await page.evaluate(() => {
        if (typeof window.ensurePlaytesterScriptsLoaded === 'function') {
            return window.ensurePlaytesterScriptsLoaded();
        }
    }).catch(() => {});
    // Wait for deferred playtester scripts to load
    await page.waitForFunction(() => typeof window.ptRenderHand === 'function', { timeout: 20000 }).catch(() => {
        console.log('  [WARN] ptRenderHand not loaded after 20s, scripts may not have loaded');
    });
    await page.waitForTimeout(1000);

    // Check sandbox tab visibility
    const sandboxVisible = await page.evaluate(() => {
        const tab = document.getElementById('sandbox');
        return tab ? (tab.style.display !== 'none' && !tab.hidden) : false;
    });
    console.log('  [INFO] Sandbox tab visible:', sandboxVisible);

    // TEST 1: Legend hidden
    const legendVisible = await page.locator('.pt-legend-box').isVisible().catch(() => false);
    log('Legend box is hidden', !legendVisible);

    // TEST 2: Board buttons - check DOM existence (they may be hidden until game start)
    const btnsInDom = await page.locator('#pt-side-buttons-left').count();
    log('Board buttons container in DOM', btnsInDom > 0);

    // TEST 3: Board action buttons (injected by playtester-patch.js as #pt-action-group-v3)
    const patchBtns = await page.evaluate(() => {
        const group = document.getElementById('pt-action-group-v3');
        return group ? group.querySelectorAll('button').length : 0;
    });
    log('Board action buttons injected by patch', patchBtns >= 3, `${patchBtns} buttons found`);

    // TEST 4: Hand P1/P2 count labels (use DOM query, not locator — element may be hidden pre-game)
    const handLabels = await page.evaluate(() => {
        const p1 = document.getElementById('ptHandCount');
        const p2 = document.getElementById('ptOppHandCount');
        return { p1: !!p1, p2: !!p2 };
    });
    log('Hand P1 count label exists', handLabels.p1);
    log('Hand P2 count label exists', handLabels.p2);

    // TEST 5: Playtester functions loaded
    const fnCheck = await page.evaluate(() => {
        const fns = ['ptPlayFromHand', 'ptRenderHand', 'ptSelectHandCard', 'ptViewCard', 'ptDiscardFromHand'];
        return fns.map(f => ({ name: f, exists: typeof window[f] === 'function' }));
    });
    for (const f of fnCheck) {
        log(`Function ${f.name}() loaded`, f.exists);
    }

    // TEST 6: CSS z-index — check stylesheet rules directly (isolated elements don't compute z-index correctly)
    const zResult = await page.evaluate(() => {
        // Search all stylesheets for the relevant rules
        let btnZ = null, cardZ = null;
        for (const sheet of document.styleSheets) {
            try {
                for (const rule of sheet.cssRules || []) {
                    if (rule.selectorText && rule.selectorText.includes('.pt-hand-play-btn') && rule.style.zIndex) {
                        btnZ = parseInt(rule.style.zIndex);
                    }
                    if (rule.selectorText && rule.selectorText === '.pt-hand-card' && rule.style.zIndex) {
                        cardZ = parseInt(rule.style.zIndex);
                    }
                }
            } catch(e) { /* cross-origin stylesheet */ }
        }
        return { btnZ, cardZ };
    });
    const zOk = zResult.btnZ !== null && zResult.cardZ !== null && zResult.btnZ > zResult.cardZ;
    log(`CSS z-index: button(${zResult.btnZ}) > card(${zResult.cardZ})`, zOk);

    // TEST 7: pointer:coarse should be FALSE on desktop headless
    const isCoarse = await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    log('Desktop pointer is NOT coarse', !isCoarse, isCoarse ? 'coarse=true (mobile context menu would fire)' : '');

    // TEST 8+9: Play button & Discard button simulation
    // Start a real game by calling openPlaytester with a minimal deck
    const btnTest = await page.evaluate(() => {
        try {
            // Mock card database so cardType gets resolved
            window.cardsBySetNumberMap = {
                'SVI-189': { name: "Professor's Research", image_url: '', type: 'Supporter' },
                'SVE-2':   { name: "Basic Fire Energy",    image_url: '', type: 'Energy' }
            };

            // Use a deck heavy on Supporters so at least one appears in the 7-card hand
            window.cityLeagueDeck = {
                "Professor's Research (SVI 189)": 30,
                "Basic Fire Energy (SVE 2)": 30
            };

            // Mock the modal display
            const modal = document.getElementById('playtesterModal');
            if (modal) modal.style.display = 'flex';

            // Call openPlaytester
            if (typeof window.openPlaytester === 'function') {
                window.openPlaytester('cityLeague');
            } else {
                return { error: 'openPlaytester not found' };
            }

            // Wait for state to be initialized — at this point ptNewGame has been called
            // Now manually put a trainer card in hand
            const state = /* can't access ptState directly */ null;

            // Instead, test via DOM: after game start, the hand zone should have cards
            const handZone = document.getElementById('ptHandZone');
            const handCards = handZone ? handZone.querySelectorAll('.pt-hand-wrapper') : [];

            const results = {
                gameStarted: handCards.length > 0,
                handCardCount: handCards.length,
            };

            // Find play button (may or may not exist depending on hand cards)
            const playBtn = handZone ? handZone.querySelector('.pt-hand-play-btn') : null;
            const discBtn = handZone ? handZone.querySelector('.pt-hand-disc-btn') : null;
            results.playBtnExists = !!playBtn;
            results.discBtnExists = !!discBtn;

            // If play button exists, click it and check if viewer opens
            if (playBtn) {
                const viewer = document.getElementById('ptCardViewer');
                playBtn.click();
                // Small delay not possible in sync evaluate, check immediately
                const viewerAfter = document.getElementById('ptCardViewer');
                results.viewerHiddenAfterPlay = !viewerAfter || viewerAfter.style.display === 'none' || viewerAfter.style.display === '';
                const newHandCards = handZone.querySelectorAll('.pt-hand-wrapper');
                results.handAfterPlay = newHandCards.length;
                results.playWorked = newHandCards.length < handCards.length;
            }

            // Test discard
            const discBtn2 = handZone ? handZone.querySelector('.pt-hand-disc-btn') : null;
            if (discBtn2) {
                const countBefore = handZone.querySelectorAll('.pt-hand-wrapper').length;
                discBtn2.click();
                const countAfter = handZone.querySelectorAll('.pt-hand-wrapper').length;
                results.discWorked = countAfter < countBefore;
                const viewer = document.getElementById('ptCardViewer');
                results.viewerHiddenAfterDiscard = !viewer || viewer.style.display === 'none' || viewer.style.display === '';
            }

            return results;
        } catch (e) {
            return { error: e.message, stack: e.stack.split('\n').slice(0, 3).join(' | ') };
        }
    });

    if (btnTest.error) {
        log('Play/Discard simulation', false, btnTest.error);
        if (btnTest.stack) console.log('    Stack:', btnTest.stack);
    } else {
        log('Game started successfully', btnTest.gameStarted, `${btnTest.handCardCount} cards in hand`);
        if (btnTest.playBtnExists) {
            log('Play button exists on trainer card', true);
            log('Card viewer stays hidden after play click', btnTest.viewerHiddenAfterPlay);
            log('Play button removes card from hand', btnTest.playWorked,
                `hand: ${btnTest.handCardCount} → ${btnTest.handAfterPlay}`);
        } else {
            console.log('  [INFO] No trainer card in initial hand — play button not rendered (expected occasionally)');
        }
        if (btnTest.discBtnExists) {
            log('Discard button exists', true);
            if (btnTest.discWorked !== undefined) {
                log('Discard removes card from hand', btnTest.discWorked);
                log('Card viewer stays hidden after discard', btnTest.viewerHiddenAfterDiscard);
            }
        }
    }

    await browser.close();

    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
})().catch(e => {
    console.error('FATAL:', e.message);
    process.exit(2);
});
