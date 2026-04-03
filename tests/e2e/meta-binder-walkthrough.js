const { chromium } = require('playwright');
const fs = require('fs');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function run() {
    const launchOptions = { headless: true };
    if (fs.existsSync(CHROME_PATH)) {
        launchOptions.executablePath = CHROME_PATH;
    }

    const browser = await chromium.launch(launchOptions);
    const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });

    await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
        () => typeof window.switchTabAndUpdateMenu === 'function' && typeof window.switchProfileTab === 'function',
        null,
        { timeout: 30000 }
    );

    await page.evaluate(() => {
        window.switchTabAndUpdateMenu('profile');
        window.switchProfileTab('metabinder');
    });

    await page.waitForSelector('#profile-metabinder', { timeout: 30000 });
    await page.click('#profile-metabinder button[onclick="buildMetaBinder()"]');

    await page.waitForFunction(
        () => Array.isArray(window._metaBinderDelta?.cards) && window._metaBinderDelta.cards.length > 0,
        null,
        { timeout: 120000 }
    );

    const info = await page.evaluate(() => {
        const gridCards = Array.from(document.querySelectorAll('#metaBinderGrid .meta-binder-card'));
        const first = gridCards.slice(0, 18).map((el) => ({
            name: el.dataset.name || '',
            type: el.dataset.type || '',
            dex: Number(el.dataset.pokedex || Number.MAX_SAFE_INTEGER),
            setOrder: Number(el.dataset.setOrder || 0),
            numberSort: Number(el.dataset.numberSort || Number.MAX_SAFE_INTEGER)
        }));

        const pokemon = first.filter((c) => String(c.type).startsWith('Pokemon-'));
        const typeSeq = pokemon.map((c) => String(c.type).replace('Pokemon-', ''));

        const typeOrder = {
            Grass: 1,
            Fire: 2,
            Water: 3,
            Lightning: 4,
            Psychic: 5,
            Fighting: 6,
            Darkness: 7,
            Metal: 8,
            Dragon: 9,
            Colorless: 10
        };

        let nonDecreasingTypeOrder = true;
        for (let i = 1; i < pokemon.length; i++) {
            const prev = typeOrder[String(pokemon[i - 1].type).replace('Pokemon-', '')] || 99;
            const cur = typeOrder[String(pokemon[i].type).replace('Pokemon-', '')] || 99;
            if (cur < prev) {
                nonDecreasingTypeOrder = false;
                break;
            }
        }

        const nonDecreasingDexWithinType = (() => {
            const byType = new Map();
            for (const c of pokemon) {
                const t = String(c.type);
                if (!byType.has(t)) byType.set(t, []);
                byType.get(t).push(c.dex);
            }
            for (const arr of byType.values()) {
                for (let i = 1; i < arr.length; i++) {
                    if (arr[i] < arr[i - 1]) return false;
                }
            }
            return true;
        })();

        const droppedStatBtn = document.querySelector('.meta-binder-stat-clickable');
        const modalEl = document.getElementById('metaBinderDroppedModal');

        const droppedBefore = modalEl ? modalEl.classList.contains('display-none') : null;
        if (droppedStatBtn) droppedStatBtn.click();
        const droppedAfterOpen = modalEl ? !modalEl.classList.contains('display-none') : null;
        const droppedCount = Number(document.getElementById('metaBinderDroppedCount')?.textContent || '0');

        if (typeof window.closeMetaBinderDroppedModal === 'function') {
            window.closeMetaBinderDroppedModal();
        }
        const droppedAfterClose = modalEl ? modalEl.classList.contains('display-none') : null;

        return {
            totalCards: gridCards.length,
            first,
            pokemonPreviewCount: pokemon.length,
            typeSeq,
            nonDecreasingTypeOrder,
            nonDecreasingDexWithinType,
            droppedModal: {
                droppedBefore,
                droppedAfterOpen,
                droppedAfterClose,
                droppedCount
            }
        };
    });

    console.log(JSON.stringify(info, null, 2));
    await browser.close();
}

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
