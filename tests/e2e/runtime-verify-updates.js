const fs = require('fs');
const { chromium } = require('playwright');

const BASE_URL = 'http://127.0.0.1:8000/index.html';
const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LOG_FILE = 'runtime-verify-results.txt';

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function waitForAppReady(page) {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 45000 });
}

async function goToTab(page, tabId) {
    await page.evaluate((id) => window.switchTab(id), tabId);
    await page.waitForSelector(`#${tabId}.tab-content.active`, { timeout: 30000 });
}

async function waitForSelectorWithHeartbeat(page, selector, timeoutMs, onTick) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const exists = await page.evaluate((sel) => !!document.querySelector(sel), selector);
        if (exists) return true;
        if (typeof onTick === 'function') {
            onTick(Math.floor((Date.now() - started) / 1000));
        }
        await page.waitForTimeout(2000);
    }
    return false;
}

(async () => {
    fs.writeFileSync(LOG_FILE, '', 'utf8');
    const launchOptions = { headless: true };
    if (fs.existsSync(CHROME_PATH)) {
        launchOptions.executablePath = CHROME_PATH;
    }

    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

    const checks = [];

    function record(name, passed, details = '') {
        checks.push({ name, passed, details });
        const status = passed ? 'PASS' : 'FAIL';
        const line = `[${status}] ${name}${details ? ` :: ${details}` : ''}`;
        console.log(line);
        fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
    }

    try {
        await waitForAppReady(page);

        // 1) Reload reset behavior
        await page.evaluate(() => {
            localStorage.setItem('autosave_deck', 'x');
            localStorage.setItem('cityLeagueDeck', 'x');
            localStorage.setItem('currentMetaDeck', 'x');
            localStorage.setItem('pastMetaDeck', 'x');
            localStorage.setItem('cityLeagueFormat', 'X1');
            localStorage.setItem('averageDisplayMode', 'sum');
        });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForFunction(() => typeof window.switchTab === 'function', null, { timeout: 45000 });

        const resetState = await page.evaluate(() => ({
            autosaveDeck: localStorage.getItem('autosave_deck'),
            cityLeagueDeck: localStorage.getItem('cityLeagueDeck'),
            currentMetaDeck: localStorage.getItem('currentMetaDeck'),
            pastMetaDeck: localStorage.getItem('pastMetaDeck'),
            cityLeagueFormat: localStorage.getItem('cityLeagueFormat'),
            averageDisplayMode: localStorage.getItem('averageDisplayMode'),
            currentCityLeagueFormat: window.currentCityLeagueFormat,
            formatSelect: document.getElementById('cityLeagueFormatSelect')?.value || null,
            formatAnalysisSelect: document.getElementById('cityLeagueFormatSelectAnalysis')?.value || null
        }));

        const resetPassed =
            resetState.autosaveDeck === null &&
            resetState.cityLeagueDeck === null &&
            resetState.currentMetaDeck === null &&
            resetState.pastMetaDeck === null &&
            resetState.cityLeagueFormat === null &&
            resetState.averageDisplayMode === null &&
            resetState.currentCityLeagueFormat === 'M4' &&
            resetState.formatSelect === 'M4' &&
            (resetState.formatAnalysisSelect === null || resetState.formatAnalysisSelect === 'M4');

        record('Reload reset + M4 defaults', resetPassed, JSON.stringify(resetState));

        // 2) Card DB checks
        await goToTab(page, 'cards');
        await page.evaluate(async () => {
            if (typeof loadCards === 'function') {
                window.cardsLoaded = false;
                await loadCards();
            }
        });
        const cardsLoaded = await waitForSelectorWithHeartbeat(page, '.card-database-item', 90000, (seconds) => {
            const line = `[INFO] Waiting for Card DB grid (${seconds}s)`;
            console.log(line);
            fs.appendFileSync(LOG_FILE, `${line}\n`, 'utf8');
        });
        if (!cardsLoaded) {
            const cardDiagnostics = await page.evaluate(() => ({
                cardsLoadedFlag: !!window.cardsLoaded,
                allCardsDataLength: Array.isArray(window.allCardsData) ? window.allCardsData.length : -1,
                allCardsDatabaseLength: Array.isArray(window.allCardsDatabase) ? window.allCardsDatabase.length : -1,
                englishSetCodesSize: window.englishSetCodes && typeof window.englishSetCodes.size === 'number' ? window.englishSetCodes.size : -1,
                cardsContentError: document.querySelector('#cards-content .error')?.textContent?.trim() || ''
            }));
            record('Card DB top actions + Limitless label', false, `Card DB grid did not render a .card-database-item within 90s :: ${JSON.stringify(cardDiagnostics)}`);
        } else {
            const cardDbState = await page.evaluate(() => {
                const card = document.querySelector('.card-database-grid .card-database-item');
                const topActions = card?.querySelectorAll('.card-database-top-actions button') || [];
                const minusBtn = card?.querySelector('.card-database-top-actions button:nth-child(2)');
                const limitlessBtn = card?.querySelector('.card-database-limitless-btn');
                return {
                    topActionCount: topActions.length,
                    minusHasBtnRed: minusBtn?.classList.contains('btn-red') || false,
                    minusLabel: (minusBtn?.textContent || '').trim(),
                    limitlessLabel: (limitlessBtn?.textContent || '').trim()
                };
            });

            const cardDbPassed =
                cardDbState.topActionCount === 3 &&
                cardDbState.minusHasBtnRed === true &&
                cardDbState.minusLabel === '-' &&
                cardDbState.limitlessLabel === 'Limitless';

            record('Card DB top actions + Limitless label', cardDbPassed, JSON.stringify(cardDbState));
        }

        // 3) Meta Binder dropped modal
        await page.evaluate(() => {
            window._metaBinderDroppedCards = [
                { name: 'Test Card', set: 'SV1', number: '001' }
            ];
            window.openMetaBinderDroppedModal?.();
        });

        const droppedOpen = await page.evaluate(() => {
            const modal = document.getElementById('metaBinderDroppedModal');
            const count = document.getElementById('metaBinderDroppedCount')?.textContent?.trim() || '';
            const listItems = document.querySelectorAll('#metaBinderDroppedList .battle-journal-pending-item').length;
            return {
                modalHiddenClass: modal?.classList.contains('display-none') || false,
                count,
                listItems
            };
        });

        await page.evaluate(() => window.closeMetaBinderDroppedModal?.());

        const droppedPassed = droppedOpen.modalHiddenClass === false && droppedOpen.listItems > 0;
        record('Meta Binder dropped modal opens with content', droppedPassed, JSON.stringify(droppedOpen));

        // 4) Battle Journal redesign + BO3 details
        const journalState = await page.evaluate(() => {
            const ownInput = document.getElementById('battleJournalOwnDeckValue');
            const oppInput = document.getElementById('battleJournalOpponentValue');
            const ownList = document.getElementById('battleJournalOwnDeckList');
            const oppList = document.getElementById('battleJournalOpponentList');
            const bo3Details = document.getElementById('battleJournalBo3Details');
            const bo3Rows = document.querySelectorAll('#battleJournalBo3Details .battle-journal-bo3-row').length;

            window.setBattleJournalChoice?.('bestOf', 'bo3');
            const bo3Visible = bo3Details ? !bo3Details.classList.contains('d-none') : false;

            return {
                ownInputTag: ownInput?.tagName || null,
                oppInputTag: oppInput?.tagName || null,
                ownInputList: ownInput?.getAttribute('list') || null,
                oppInputList: oppInput?.getAttribute('list') || null,
                ownListTag: ownList?.tagName || null,
                oppListTag: oppList?.tagName || null,
                bo3Rows,
                bo3Visible
            };
        });

        const journalPassed =
            journalState.ownInputTag === 'INPUT' &&
            journalState.oppInputTag === 'INPUT' &&
            journalState.ownInputList === 'battleJournalOwnDeckList' &&
            journalState.oppInputList === 'battleJournalOpponentList' &&
            journalState.ownListTag === 'DATALIST' &&
            journalState.oppListTag === 'DATALIST' &&
            journalState.bo3Rows === 3 &&
            journalState.bo3Visible === true;

        record('Battle Journal datalists + BO3 details', journalPassed, JSON.stringify(journalState));

        // 5) Tooltip removal checks
        const tooltipState = await page.evaluate(() => {
            const tooltipScripts = Array.from(document.scripts)
                .map((s) => s.getAttribute('src') || '')
                .filter((src) => /archetype-tooltip|hover-tooltip/i.test(src));

            const tooltipUi = Array.from(document.querySelectorAll('[id*="tooltip"], [class*="tooltip"]'))
                .map((el) => `${el.id} ${el.className}`.trim())
                .filter((name) => /admin|beginner|meta|profile/i.test(name.toLowerCase()));

            return {
                tooltipScripts,
                tooltipUiCount: tooltipUi.length,
                tooltipUiSample: tooltipUi.slice(0, 5)
            };
        });

        const tooltipPassed = tooltipState.tooltipScripts.length === 0 && tooltipState.tooltipUiCount === 0;
        record('Tooltip scripts/UI removed', tooltipPassed, JSON.stringify(tooltipState));

    } catch (error) {
        record('Runtime verification execution', false, error.message);
    } finally {
        await browser.close();
    }

    const failed = checks.filter((c) => !c.passed);
    console.log('\n===== SUMMARY =====');
    console.log(`Total checks: ${checks.length}`);
    console.log(`Passed: ${checks.length - failed.length}`);
    console.log(`Failed: ${failed.length}`);
    fs.appendFileSync(LOG_FILE, '\n===== SUMMARY =====\n', 'utf8');
    fs.appendFileSync(LOG_FILE, `Total checks: ${checks.length}\n`, 'utf8');
    fs.appendFileSync(LOG_FILE, `Passed: ${checks.length - failed.length}\n`, 'utf8');
    fs.appendFileSync(LOG_FILE, `Failed: ${failed.length}\n`, 'utf8');

    if (failed.length > 0) {
        process.exitCode = 1;
    }
})();
