const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const BROWSER_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const APP_URL = 'http://127.0.0.1:8765/';
const ART = '/home/user/TheDipidis/docs/audit/meta-call/artifacts';
function log(...a){const l=`[${new Date().toISOString()}] ${a.join(' ')}`;console.log(l);fs.appendFileSync(path.join(ART,'phase1-tef.log'),l+'\n');}
const CDN_MAP=[{re:/papaparse.*\.min\.js/i,file:'/home/user/TheDipidis/node_modules/papaparse/papaparse.min.js',mime:'application/javascript'}];
const STUB_MAP=[
  {re:/fonts\.googleapis\.com\/css/,mime:'text/css',body:''},
  {re:/fonts\.gstatic\.com\//,mime:'font/woff2',body:''},
  {re:/firebasejs\//,mime:'application/javascript',body:'window.firebase={initializeApp(){},auth(){return{onAuthStateChanged(){},getRedirectResult(){return Promise.resolve(null)}}},firestore(){return{}}};'},
  {re:/chart\.umd\.min\.js/,mime:'application/javascript',body:'window.Chart=function(){return{destroy(){}}};window.Chart.register=()=>{};'},
  {re:/localforage/,mime:'application/javascript',body:'window.localforage={getItem:async()=>null,setItem:async()=>null,removeItem:async()=>null,createInstance(){return this}};'},
  {re:/mobile-drag-drop/,mime:'application/javascript',body:''},
];
(async()=>{
  try{fs.unlinkSync(path.join(ART,'phase1-tef.log'));}catch(_){}
  const browser=await chromium.launch({executablePath:BROWSER_PATH,headless:true});
  const ctx=await browser.newContext({viewport:{width:1440,height:900}});
  await ctx.route('**/*',async(route,req)=>{
    const url=req.url();
    const m=CDN_MAP.find(x=>x.re.test(url));
    if(m){try{return route.fulfill({status:200,contentType:m.mime,body:fs.readFileSync(m.file)});}catch(_){}}
    const s=STUB_MAP.find(x=>x.re.test(url));
    if(s)return route.fulfill({status:200,contentType:s.mime,body:s.body});
    const isLocal=url.startsWith('http://127.0.0.1:8765/')||url.startsWith('data:')||url.startsWith('blob:');
    if(!isLocal)return route.abort();
    return route.continue();
  });
  const page=await ctx.newPage();
  page.on('console',m=>{const t=m.text();if(/error|warn|dragapult|tef-por|frozen|predictor|family/i.test(t))log('[P]',m.type(),t.slice(0,500));});
  page.on('pageerror',e=>log('[ERR]',e.message));
  log('Loading');
  await page.goto(APP_URL,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>typeof MetaCall==='object'&&MetaCall&&MetaCall.init,{timeout:30000});
  await page.waitForTimeout(5000);
  await page.evaluate(()=>{if(typeof switchTabAndUpdateMenu==='function')switchTabAndUpdateMenu('profile');});
  await page.waitForTimeout(800);
  await page.evaluate(()=>{if(typeof switchProfileTab==='function')switchProfileTab('metacall');});
  await page.waitForTimeout(3000);
  log('Call past TEF-POR');
  await page.evaluate(async()=>{if(window.MetaCall&&MetaCall._setMetaSource)await MetaCall._setMetaSource('past','TEF-POR');});
  await page.waitForTimeout(8000);

  const result=await page.evaluate(()=>{
    const out={};
    out.headers=Array.from(document.querySelectorAll('.mc-rec-table thead th')).map(h=>h.textContent.replace(/\s+/g,' ').trim());
    out.fheaders=Array.from(document.querySelectorAll('.mc-rec-table-frozen thead th')).map(h=>h.textContent.replace(/\s+/g,' ').trim());
    out.frozen_present=out.fheaders.length>0;
    const rows=Array.from(document.querySelectorAll('.mc-rec-row'));
    out.rec_rows_count=rows.length;
    out.first_rows=rows.slice(0,10).map(r=>Array.from(r.children).map(td=>td.textContent.replace(/\s+/g,' ').trim()));
    out.dragapult=rows.filter(r=>{const c=Array.from(r.children).map(td=>td.textContent.replace(/\s+/g,' ').trim());return c.some(cc=>/dragapult/i.test(cc));}).map(r=>({cells:Array.from(r.children).map(td=>td.textContent.replace(/\s+/g,' ').trim()),html:r.outerHTML}));
    // Look at field panel (mc-field-row, mc-deck-row, etc)
    const fieldSelectors=['.mc-field-row','.mc-deck-row','.mc-group-row','tr[class*=field]','tr[class*=deck-row]','.mc-row','.mc-field-deck-row'];
    out.fieldPanelInspection=fieldSelectors.map(sel=>({sel,count:document.querySelectorAll(sel).length}));
    // dump first dragapult info
    const allRows=Array.from(document.querySelectorAll('tr'));
    out.dragapult_anywhere=allRows.filter(r=>/dragapult/i.test(r.textContent)).slice(0,10).map(r=>({text:r.textContent.replace(/\s+/g,' ').trim().slice(0,300),classes:r.className}));
    // banner / panel title
    const banner=document.querySelector('.mc-rec-panel .metacall-panel-title, [class*=frozen-banner]');
    out.banner=banner?banner.textContent.replace(/\s+/g,' ').trim().slice(0,300):null;
    // Try to enable group-by-pokemon mode
    out.group_state_before=window.MetaCall&&window.MetaCall.__getGroupState?MetaCall.__getGroupState():null;
    return out;
  });
  fs.writeFileSync(path.join(ART,'tef-result.json'),JSON.stringify(result,null,2));
  log('headers:',JSON.stringify(result.headers));
  log('frozen_present:',result.frozen_present,'fheaders:',JSON.stringify(result.fheaders));
  log('rec_rows_count:',result.rec_rows_count);
  log('first 3 rows:',JSON.stringify(result.first_rows.slice(0,3)));
  log('dragapult rec rows:');
  result.dragapult.forEach((r,i)=>log(' ',i,JSON.stringify(r.cells)));
  log('field panel inspection:',JSON.stringify(result.fieldPanelInspection));
  log('dragapult_anywhere first 3:');
  result.dragapult_anywhere.slice(0,3).forEach((r,i)=>log(' ',i,r.classes,'|',r.text.slice(0,200)));

  // Now toggle group-by-pokemon
  log('Toggle group-by-pokemon');
  await page.evaluate(()=>{
    // Click any element with onclick referencing _toggleGroup or _toggleGroupField
    const btn=Array.from(document.querySelectorAll('[onclick]')).find(el=>/_toggleGroup\b/.test(el.getAttribute('onclick'))||/groupby/i.test(el.textContent));
    if(btn)btn.click();
  });
  await page.waitForTimeout(3000);
  const grouped=await page.evaluate(()=>{
    const out={};
    const rows=Array.from(document.querySelectorAll('tr'));
    out.dragapult_grouped=rows.filter(r=>/dragapult/i.test(r.textContent)).slice(0,10).map(r=>({text:r.textContent.replace(/\s+/g,' ').trim().slice(0,400),classes:r.className,html:r.outerHTML.slice(0,1500)}));
    return out;
  });
  fs.writeFileSync(path.join(ART,'tef-grouped.json'),JSON.stringify(grouped,null,2));
  log('grouped dragapult rows:',grouped.dragapult_grouped.length);
  grouped.dragapult_grouped.slice(0,5).forEach((r,i)=>log(' ',i,r.classes,'|',r.text.slice(0,250)));

  await browser.close();
  log('Done');
})().catch(e=>{log('FATAL',e.stack||e.message);process.exit(1);});
