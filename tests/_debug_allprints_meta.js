const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--disable-gpu', '--no-sandbox'] });
  const page = await browser.newPage();
  try {
  await page.goto('http://127.0.0.1:8000/index.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => switchTab('cards'));
  await page.waitForFunction(() => window.cardsLoaded === true, { timeout: 30000 });
  await page.waitForFunction(() => window.metaCardsMap && window.metaCardsMap.size > 0 && document.querySelector('#metaFormatOptions input[value^="meta:"]'), { timeout: 20000 });
  await page.waitForTimeout(500);
  
  const total = await page.evaluate(() => window.filteredCardsData.length);
  console.log('Total (Standard):', total);
  
  // Select TEF-POR + filter
  await page.evaluate(() => { document.querySelector('#metaFormatOptions input[value="meta:TEF-POR"]').checked = true; filterAndRenderCards(); });
  await page.waitForTimeout(1500);
  const tefStandard = await page.evaluate(() => window.filteredCardsData.length);
  console.log('TEF-POR (Standard):', tefStandard);
  
  // All Prints
  await page.evaluate(() => { document.getElementById('btnAllPrints').click(); });
  await page.waitForTimeout(1500);
  const tefAllPrints = await page.evaluate(() => window.filteredCardsData.length);
  const setDistribution = await page.evaluate(() => {
    const setCounts = {};
    window.filteredCardsData.forEach(c => { setCounts[c.set] = (setCounts[c.set]||0) + 1; });
    return Object.entries(setCounts).sort((a,b) => b[1]-a[1]).slice(0, 20);
  });
  console.log('TEF-POR (All Prints):', tefAllPrints);
  console.log('Set distribution (top 20):', setDistribution.map(e => e[0]+':'+e[1]).join(', '));
  
  // Pokedex sort
  await page.evaluate(() => { const s = document.getElementById('cardSortOrder'); s.value='pokedex'; s.dispatchEvent(new Event('change',{bubbles:true})); });
  await page.waitForTimeout(1500);
  const tefAllPokedex = await page.evaluate(() => window.filteredCardsData.length);
  const uiText = await page.evaluate(() => document.getElementById('cardResultsInfo').textContent);
  console.log('TEF-POR (All Prints + Pokedex):', tefAllPokedex, '| UI says:', uiText);
  
  // Radio state
  const state = await page.evaluate(() => ({
    totalRadio: document.querySelector('#metaFormatOptions input[value="total"]').checked,
    tefCb: document.querySelector('#metaFormatOptions input[value="meta:TEF-POR"]').checked,
    showOnePrint: typeof showOnlyOnePrint !== 'undefined' ? showOnlyOnePrint : 'undef'
  }));
  console.log('State:', JSON.stringify(state));
  
  // Compare: uncheck TEF-POR to see total All Prints
  await page.evaluate(() => { document.querySelector('#metaFormatOptions input[value="meta:TEF-POR"]').checked = false; filterAndRenderCards(); });
  await page.waitForTimeout(1500);
  const totalAllPrints = await page.evaluate(() => window.filteredCardsData.length);
  console.log('Total (All Prints, no meta):', totalAllPrints);
  
  console.log('\n--- SUMMARY ---');
  console.log('Total Standard:', total);
  console.log('TEF-POR Standard:', tefStandard);
  console.log('TEF-POR All Prints:', tefAllPrints);
  console.log('TEF-POR All Prints + Pokedex:', tefAllPokedex);
  console.log('Total All Prints:', totalAllPrints);
  console.log('BUG? TEF-POR All Prints === Total All Prints:', tefAllPrints === totalAllPrints);
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e.message); process.exit(1); });

