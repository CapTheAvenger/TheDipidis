const { chromium } = require('playwright');
(async () => {
    const b = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const p = await b.newPage();
    await p.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => switchTab('cards'));
    await p.waitForTimeout(3000);
    await p.waitForFunction(() => window.cardsLoaded === true, { timeout: 30000 });
    await p.waitForFunction(() => window.metaCardsMap && window.metaCardsMap.size > 0, { timeout: 20000 });

    // Use evaluate to set filter state and trigger re-filter
    await p.evaluate(() => {
        // Select TEF-POR meta checkbox
        const cb = document.querySelector('#metaFormatOptions input[value="meta:TEF-POR"]');
        if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await p.waitForTimeout(2000);
    
    await p.evaluate(() => {
        // Enable All Prints via setPrintView
        setPrintView(false);
    });
    await p.waitForTimeout(3000);

    // Check toggle state and total cards
    const state = await p.evaluate(() => {
        const ap = document.querySelector('#toggleAllPrints');
        return {
            allPrintsChecked: ap ? ap.checked : null,
            totalFiltered: (window.filteredCardsData || []).length,
            totalAll: (window.allCardsData || []).length,
        };
    });
    console.log('State:', JSON.stringify(state));

    // Check which Pikachu ex appear
    const cards = await p.evaluate(() => {
        const a = window.filteredCardsData || [];
        return a.filter(c => c.name && c.name.toLowerCase().includes('pikachu ex'))
                .map(c => c.set + ' ' + c.number + ' ' + c.name);
    });
    console.log('Pikachu ex in TEF-POR + All Prints:', JSON.stringify(cards, null, 2));

    // Verify: ASC 276 and PRE 28 should NOT be present
    const hasASC276 = cards.some(c => c.startsWith('ASC 276'));
    const hasPRE28 = cards.some(c => c.startsWith('PRE 28'));
    const hasSSP57 = cards.some(c => c.startsWith('SSP 57'));
    console.log('ASC 276 present (should be false):', hasASC276);
    console.log('PRE 28 present (should be false):', hasPRE28);
    console.log('SSP 57 present (should be true):', hasSSP57);

    if (hasASC276 || hasPRE28) {
        console.log('FAIL: False positive Pikachu ex still present!');
        process.exitCode = 1;
    } else if (!hasSSP57) {
        console.log('FAIL: SSP 57 Pikachu ex missing from meta results!');
        process.exitCode = 1;
    } else {
        console.log('PASS: Only correct Pikachu ex prints shown');
    }

    await b.close();
})();
