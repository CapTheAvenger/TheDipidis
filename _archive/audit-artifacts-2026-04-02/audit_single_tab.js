// Usage: node audit_single_tab.js <tabName>
const { chromium } = require('playwright');
const tab = process.argv[2];
if (!tab) { console.error('Usage: node audit_single_tab.js <tabName>'); process.exit(1); }

(async () => {
  const browser = await chromium.launch({ channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.goto('http://localhost:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  await page.evaluate((tabId) => {
    const selected = document.getElementById(tabId);
    if (selected) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      selected.classList.add('active');
    }
    try {
      switch(tabId) {
        case 'city-league': if (typeof loadCityLeagueData==='function') loadCityLeagueData(); break;
        case 'city-league-analysis': if (typeof loadCityLeagueAnalysis==='function') loadCityLeagueAnalysis(); break;
        case 'current-meta': if (typeof loadCurrentMeta==='function') loadCurrentMeta(); break;
        case 'current-analysis': if (typeof loadCurrentAnalysis==='function') loadCurrentAnalysis(); break;
        case 'past-meta': if (typeof loadPastMeta==='function') loadPastMeta(); break;
        case 'cards': if (typeof loadCards==='function') loadCards(); break;
        case 'proxy': if (typeof renderProxyQueue==='function') renderProxyQueue(); break;
      }
    } catch(e) {}
  }, tab);

  await page.waitForTimeout(5000);
  await page.screenshot({ path: `images/audit-${tab}.png`, fullPage: true });
  console.log(`Saved: audit-${tab}.png`);

  const tables = page.locator(`#${tab} table`);
  const count = await tables.count();
  console.log(`${count} table(s)`);
  let vis = 0;
  for (let i = 0; i < Math.min(count, 30) && vis < 4; i++) {
    try {
      const t = tables.nth(i);
      if (await t.isVisible({ timeout: 500 })) {
        await t.scrollIntoViewIfNeeded({ timeout: 2000 });
        await page.waitForTimeout(200);
        await t.screenshot({ path: `images/audit-${tab}-table-${vis}.png` });
        console.log(`Table ${vis} saved`);
        vis++;
      }
    } catch(e) {}
  }

  await browser.close();
  console.log('Done');
})();
