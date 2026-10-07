// UI-120 (06.10.2026): Handy-Messung 390 px gegen einen lokal ausgelieferten Stand.
// Aufruf: node scripts/messe_ui120.js http://127.0.0.1:8104  (Playwright noetig)
// Zaehlt je Ansicht: sichtbare Texte < 11 px (nach Klasse gruppiert), Bedienziele
// < 24 px, Querueberlauf. Ausgabe JSON.
const { chromium } = require('playwright');
const BASIS = process.argv[2] || 'http://127.0.0.1:8104';
const ANSICHTEN = ['current-meta', 'city-league', 'past-meta', 'meta-call', 'cards', 'side-quest', 'current-analysis'];
(async () => {
    const b = await chromium.launch();
    const c = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await c.addInitScript(() => { try { localStorage.setItem('app_lang', 'de'); } catch (e) {} });
    const p = await c.newPage();
    const erg = {};
    for (const a of ANSICHTEN) {
        await p.goto(BASIS + '/index.html#' + a);
        await p.waitForTimeout(9000);
        erg[a] = await p.evaluate(() => {
            const tab = document.querySelector('.tab-content.active') || document.body;
            const klein = {}, ziele = {};
            const sichtbar = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && el.offsetParent !== null; };
            const name = el => el.tagName.toLowerCase() + (el.classList[0] ? '.' + el.classList[0] : '');
            tab.querySelectorAll('*').forEach(el => {
                if (!sichtbar(el)) return;
                const eigenText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
                if (eigenText) {
                    const fs = parseFloat(getComputedStyle(el).fontSize);
                    if (fs < 10.95) { const k = name(el) + ' ' + fs.toFixed(2); klein[k] = (klein[k] || 0) + 1; }
                }
                if (el.matches('button, a[href], input, select, [role=button], [tabindex="0"]')) {
                    const r = el.getBoundingClientRect();
                    if (r.width < 24 || r.height < 24) { const k = name(el); ziele[k] = (ziele[k] || 0) + 1; }
                }
            });
            return { quer: document.documentElement.scrollWidth > innerWidth + 1, klein, ziele };
        });
    }
    console.log(JSON.stringify(erg, null, 1));
    await b.close();
})();
