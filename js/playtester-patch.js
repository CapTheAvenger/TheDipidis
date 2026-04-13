/* ============================================================
   PLAYTESTER MEGA-PATCH v4.0 - Mobile-First, Clean Layout
   Changes:
   - Left sidebar (Deck-Controls + Legend) hidden
   - Right Deck Panel (ptZoomPanel with Search/Shuffle/Draw) hidden
   - Top control bar minimised (icons only, scrollable)
   - Action buttons (Attack/EndTurn/OppView) on the field itself (fixed position)
   - Bench horizontal, hand card compact, deck browser grid, Area Zero toggle
   ============================================================ */

(function(){
'use strict';

function injectStyles(){
  const id='pt-megapatch-v4-styles';
  if(document.getElementById(id))return;
  const css=`
/* HIDE LEFT SIDEBAR */
.pt-deck-controls,.pt-legend-box{display:none!important}
/* HIDE RIGHT PANEL */
#ptZoomPanel{display:none!important}
/* TOP BAR COMPACT */
.pt-controls{background:rgba(15,20,45,0.97)!important;border-bottom:2px solid rgba(255,203,5,0.25)!important;min-height:40px!important;padding:2px 6px!important;overflow-x:auto!important;scrollbar-width:none!important;flex-wrap:nowrap!important}
.pt-controls::-webkit-scrollbar{display:none!important}
.pt-ctrl-btn{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;min-width:36px!important;height:36px!important;border-radius:6px!important;transition:background 0.15s!important;cursor:pointer!important;flex-shrink:0!important;padding:2px!important}
.pt-ctrl-btn:hover{background:rgba(255,255,255,0.12)!important}
.ctrl-icon{font-size:15px!important;line-height:1!important}
.ctrl-label{font-size:8px!important;font-weight:600!important;color:rgba(255,255,255,0.7)!important;line-height:1!important}
#ptAreaZeroControl{margin-left:auto!important;display:flex!important;align-items:center!important;gap:6px!important;flex-shrink:0!important}
.pt-bench-toggle{font-size:10px!important;padding:2px 7px!important;border-radius:10px!important;border:1px solid rgba(255,215,0,0.6)!important;background:rgba(255,215,0,0.08)!important;color:#ffd700!important;cursor:pointer!important;font-weight:700!important;white-space:nowrap!important}
.pt-bench-toggle.s8{background:rgba(255,215,0,0.3)!important;color:#fff!important}
#p1-area .pt-bench-zone,#p2-area .pt-bench-zone{display:flex!important;flex-direction:row!important;gap:4px!important;align-items:flex-start!important}
.pt-hand-zone{background:linear-gradient(180deg,rgba(8,12,28,0.97),rgba(4,8,18,0.99))!important;border-top:2px solid rgba(255,203,5,0.2)!important}
.pt-hand-card{width:clamp(38px,4.2vw,54px)!important;height:clamp(53px,5.9vw,76px)!important;border-radius:4px!important;transition:transform 0.15s!important}
.pt-hand-card:hover{transform:translateY(-14px) scale(1.1)!important;z-index:100!important}
.pt-hand-wrapper{margin-right:-14px!important}
#pt-field-actions-v4{position:fixed!important;z-index:1500!important;display:flex!important;flex-direction:column!important;gap:7px!important;pointer-events:all!important}
#pt-field-actions-v4 button{border:none!important;border-radius:22px!important;cursor:pointer!important;font-weight:700!important;font-size:13px!important;padding:9px 20px!important;white-space:nowrap!important;box-shadow:0 3px 14px rgba(0,0,0,0.65)!important;transition:transform 0.12s!important}
#pt-field-actions-v4 button:hover{transform:scale(1.05)!important}
#pt-field-btn-attack{background:linear-gradient(135deg,#e74c3c,#c0392b)!important;color:white!important}
#pt-field-btn-endturn{background:linear-gradient(135deg,#27ae60,#1e8449)!important;color:white!important}
#pt-field-btn-oppview{background:linear-gradient(135deg,#2c3e7a,#1a2560)!important;color:rgba(255,255,255,0.9)!important;font-size:12px!important}
[id^="ptBench5"],[id^="ptBench6"],[id^="ptBench7"]{display:none!important}
#ptDeckSearchGrid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(88px,1fr))!important;gap:6px!important;padding:10px!important;overflow-y:auto!important;align-content:start!important}
#ptDeckSearchGrid>div{width:auto!important;height:auto!important}
#ptDeckSearchGrid img.pt-field-card{width:88px!important;height:123px!important;object-fit:cover!important;border-radius:5px!important;display:block!important}
#ptDiscardGrid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(76px,1fr))!important;gap:5px!important;padding:8px!important}
#ptDiscardGrid img{width:76px!important;height:107px!important;border-radius:4px!important}
#ptHandActionBar{display:flex!important;align-items:center!important;gap:5px!important;padding:4px 8px!important;overflow-x:auto!important;scrollbar-width:none!important;flex-wrap:nowrap!important}
#ptHandActionBar::-webkit-scrollbar{display:none!important}
@media(max-width:768px){.ctrl-label{display:none!important}.pt-ctrl-btn{min-width:30px!important;height:32px!important}.pt-hand-card{width:36px!important;height:50px!important}#ptDeckSearchGrid{grid-template-columns:repeat(auto-fill,minmax(65px,1fr))!important}#ptDeckSearchGrid img.pt-field-card{width:65px!important;height:91px!important}#pt-field-actions-v4 button{font-size:12px!important;padding:7px 14px!important}}
`;
  const s=document.createElement('style');s.id=id;s.textContent=css;document.head.appendChild(s);
}

window.openMyDecksPlaytest=function(){
  let m=document.getElementById('myDecksPlaytestModal');
  if(!m){m=document.createElement('div');m.id='myDecksPlaytestModal';m.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;';m.innerHTML='<div style="background:#1a1a2e;border-radius:16px;padding:24px;width:520px;max-width:95vw;border:2px solid rgba(255,203,5,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.8);"><h2 style="color:#ffd700;margin:0 0 6px;font-size:20px;">\u{1F3AE} Playtest \u2013 Meine Decks</h2><p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 18px;">W\u00e4hle ein Deck f\u00fcr jeden Spieler</p><div style="margin-bottom:14px;"><label style="color:#4fc3f7;font-size:13px;font-weight:700;display:block;margin-bottom:6px;">\u{1F535} Spieler 1</label><select id="myDeckSelectP1" style="width:100%;padding:10px 12px;border-radius:8px;background:#0d1b40;color:white;border:2px solid #4fc3f7;font-size:14px;"></select></div><div style="margin-bottom:20px;"><label style="color:#ef5350;font-size:13px;font-weight:700;display:block;margin-bottom:6px;">\u{1F534} Spieler 2</label><select id="myDeckSelectP2" style="width:100%;padding:10px 12px;border-radius:8px;background:#2d0a0a;color:white;border:2px solid #ef5350;font-size:14px;"></select></div><div style="display:flex;gap:10px;"><button onclick="closeMyDecksPlaytest()" style="flex:1;padding:12px;border-radius:8px;background:rgba(255,255,255,0.08);color:#999;border:1px solid rgba(255,255,255,0.15);font-size:14px;cursor:pointer;">Abbrechen</button><button onclick="startMyDecksPlaytest()" style="flex:2;padding:12px;border-radius:8px;background:linear-gradient(135deg,#27ae60,#219a52);color:white;border:none;font-size:14px;font-weight:700;cursor:pointer;">\u25B6 Playtest starten</button></div></div>';document.body.appendChild(m);}
  const d=window.userDecks||[];['P1','P2'].forEach(function(p,i){const s=document.getElementById('myDeckSelect'+p);if(s){s.innerHTML='';d.forEach(function(dk,j){const o=document.createElement('option');o.value=j;o.textContent=dk.name||('Deck '+(j+1));s.appendChild(o);});if(i===1&&d.length>1)s.selectedIndex=1;}});
  m.style.display='flex';
};
window.closeMyDecksPlaytest=function(){const m=document.getElementById('myDecksPlaytestModal');if(m)m.style.display='none';};
function buildDeck(deck){const cards=[];(deck.cards||[]).forEach(function(c){const cnt=typeof c.count==='number'?c.count:parseInt(c.count)||1;cards.push({id:c.id||c.cardId,name:c.name,image:c.image||c.imageUrl||c.img,count:cnt,set:c.set||c.setCode,number:c.number||c.cardNumber});});return cards;}
window.startMyDecksPlaytest=function(){const d=window.userDecks||[];const i1=parseInt((document.getElementById('myDeckSelectP1')||{}).value||0);const i2=parseInt((document.getElementById('myDeckSelectP2')||{}).value||0);const d1=d[i1],d2=d[i2];if(!d1||!d2)return;window.standaloneDecks=window.standaloneDecks||[{cards:[]},{cards:[]}];window.standaloneDecks[0]={name:d1.name,cards:buildDeck(d1)};window.standaloneDecks[1]={name:d2.name,cards:buildDeck(d2)};window.closeMyDecksPlaytest();if(typeof startStandalonePlaytester==='function')startStandalonePlaytester();};

function positionFieldButtons(){
  const bar=document.getElementById('pt-field-actions-v4');
  if(!bar)return;
  const p1Active=document.getElementById('ptActiveZone-p1');
  if(!p1Active)return;
  const r=p1Active.getBoundingClientRect();
  if(r.width===0)return;
  bar.setAttribute('style','position:fixed!important;left:'+(r.x-185)+'px!important;top:'+(r.y+r.height/2)+'px!important;transform:translate(0,-50%)!important;z-index:1500!important;display:flex!important;flex-direction:column!important;gap:7px!important;pointer-events:all!important;');
}

function injectFieldButtons(){
  if(document.getElementById('pt-field-actions-v4'))return;
  const bar=document.createElement('div');bar.id='pt-field-actions-v4';
  [{id:'pt-field-btn-attack',t:'\u2694\uFE0F Angriff',fn:'ptOpenAttackView()'},{id:'pt-field-btn-endturn',t:'\u23ED\uFE0F Zug beenden',fn:'ptPassTurn()'},{id:'pt-field-btn-oppview',t:'\uD83D\uDC41\uFE0F Gegner',fn:'ptOpenOpponentPanel()'}].forEach(function(def){const b=document.createElement('button');b.id=def.id;b.textContent=def.t;b.onclick=function(){try{eval(def.fn);}catch(e){}};bar.appendChild(b);});
  document.body.appendChild(bar);
  positionFieldButtons();
  window.addEventListener('resize',positionFieldButtons);
  const origRender=window.ptRenderAll;
  if(typeof origRender==='function'){window.ptRenderAll=function(){origRender.apply(this,arguments);setTimeout(positionFieldButtons,50);};}
  const old=document.getElementById('pt-side-buttons-left');
  if(old){old.style.opacity='0';old.style.pointerEvents='none';}
}

window.ptBenchSizes=window.ptBenchSizes||{p1:5,p2:5};
window.ptToggleBenchSize=function(player){const cur=window.ptBenchSizes[player];const n=cur===5?8:5;window.ptBenchSizes[player]=n;const btn=document.getElementById('ptBenchToggle-'+player);if(btn){btn.textContent=(player==='p1'?'P1':'P2')+': '+n+' Slots';btn.className='pt-bench-toggle '+(n===8?'s8':'s5');}['5','6','7'].forEach(function(i){const s=document.getElementById('ptBench'+i+'-'+player);if(s)s.style.display=n===8?'block':'none';});};

function injectAreaZeroControl(){if(document.getElementById('ptAreaZeroControl'))return;const cb=document.querySelector('.pt-controls');if(!cb)return;const d=document.createElement('div');d.id='ptAreaZeroControl';d.style.marginLeft='auto';d.innerHTML='<span style="font-size:11px;color:rgba(255,215,0,0.8);font-weight:600;">\uD83C\uDFDF\uFE0F</span><button id="ptBenchToggle-p1" class="pt-bench-toggle s5" onclick="ptToggleBenchSize(\'p1\')">P1: 5 Slots</button><button id="ptBenchToggle-p2" class="pt-bench-toggle s5" onclick="ptToggleBenchSize(\'p2\')">P2: 5 Slots</button>';cb.appendChild(d);}

function applyBoardUI(){
  injectStyles();
  const zp=document.getElementById('ptZoomPanel');if(zp)zp.style.cssText='display:none!important';
  injectAreaZeroControl();
  setTimeout(injectFieldButtons,400);
}

const _ss=window.startStandalonePlaytester;
if(typeof _ss==='function'){window.startStandalonePlaytester=function(){_ss.apply(this,arguments);setTimeout(applyBoardUI,300);};}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',applyBoardUI);}else{setTimeout(applyBoardUI,500);}

})();/* ============================================================
   PLAYTESTER MEGA-PATCH v3.0 - Mobile-First UX Overhaul
   Fixes: Deck selector, hand size, layout, area zero 5-8 slots,
          control bar clarity, bench horizontal, deck browser compact,
          action buttons in bottom bar, mobile-first design
   ============================================================ */

(function(){
'use strict';

// ============================================================
// PART 1: CSS INJECTION - Complete Styles
// ============================================================
function injectStyles(){
  const id='pt-megapatch-v3-styles';
  if(document.getElementById(id))return;
  const css=`
/* DECK BROWSER: COMPACT CARD GRID */
#ptDeckSearchModal{background:rgba(0,0,0,0.92)!important;display:flex!important;flex-direction:column!important}
#ptDeckSearchGrid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(90px,1fr))!important;gap:6px!important;padding:10px!important;overflow-y:auto!important;flex:1!important;align-content:start!important}
#ptDeckSearchGrid>div{width:auto!important;height:auto!important}
#ptDeckSearchGrid img.pt-field-card{width:90px!important;height:126px!important;object-fit:cover!important;border-radius:6px!important;display:block!important}
#ptDeckSearchGrid>div>div.pos-abs{font-size:10px!important;padding:2px 4px!important}
/* DISCARD MODAL: COMPACT */
#ptDiscardGrid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(80px,1fr))!important;gap:5px!important;padding:8px!important}
#ptDiscardGrid img{width:80px!important;height:112px!important;border-radius:5px!important}
/* HAND ZONE */
.pt-hand-zone{background:linear-gradient(180deg,rgba(10,15,30,0.95) 0%,rgba(5,10,20,0.98) 100%)!important;border-top:2px solid rgba(255,203,5,0.25)!important;min-height:90px!important;max-height:105px!important}
.pt-hand-card{width:clamp(38px,4.2vw,52px)!important;height:clamp(53px,5.9vw,73px)!important;border-radius:4px!important;transition:transform 0.15s!important}
.pt-hand-card:hover{transform:translateY(-14px) scale(1.1)!important;z-index:100!important}
.pt-hand-wrapper{margin-right:-14px!important}
/* BOTTOM ACTION BAR */
#ptHandActionBar{background:rgba(0,0,0,0.4)!important;padding:4px 8px!important;border-radius:8px 8px 0 0!important;display:flex!important;align-items:center!important;gap:4px!important;overflow-x:auto!important;scrollbar-width:none!important}
#ptHandActionBar::-webkit-scrollbar{display:none!important}
#ptHandActionBar input[type="number"],#ptHandActionBar input.pt-bottom-input{width:28px!important;height:22px!important;text-align:center!important;background:rgba(255,255,255,0.1)!important;border:1px solid rgba(255,255,255,0.2)!important;border-radius:4px!important;color:white!important;font-size:12px!important;padding:0!important}
#pt-action-group-v3 button{padding:5px 9px!important;border-radius:7px!important;font-size:11.5px!important;font-weight:600!important;border:none!important;cursor:pointer!important;white-space:nowrap!important;transition:opacity 0.15s,transform 0.1s!important}
#pt-action-group-v3 button:hover{opacity:0.82!important;transform:translateY(-1px)!important}
/* CONTROLS BAR */
.pt-controls{background:linear-gradient(135deg,#1a1a2e,#0f3460)!important;border-bottom:2px solid rgba(255,203,5,0.3)!important}
.pt-ctrl-btn{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:1px!important;min-width:40px!important;cursor:pointer!important;border-radius:6px!important;transition:background 0.15s!important}
.pt-ctrl-btn:hover{background:rgba(255,255,255,0.1)!important}
.ctrl-icon{font-size:16px!important;line-height:1!important}
.ctrl-label{font-size:9px!important;font-weight:600!important;letter-spacing:0.3px!important;color:rgba(255,255,255,0.75)!important}
/* BENCH: HORIZONTAL */
#p1-area .pt-bench-zone,#p2-area .pt-bench-zone{display:flex!important;flex-direction:row!important;gap:4px!important;align-items:flex-start!important}
/* LEGEND */
.pt-legend-box{background:rgba(0,0,0,0.75)!important;border-radius:8px!important;padding:6px 8px!important;font-size:10px!important;max-width:160px!important;border:1px solid rgba(255,255,255,0.1)!important;backdrop-filter:blur(4px)!important}
/* CARD HOVER */
.pt-dropzone img:hover{transform:scale(1.08)!important;transition:transform 0.15s!important;z-index:100!important;position:relative!important}
/* EXTRA BENCH SLOTS */
[id^="ptBench5"],[id^="ptBench6"],[id^="ptBench7"]{display:none!important}
/* AREA ZERO CONTROL */
#ptAreaZeroControl{display:flex!important;align-items:center!important;gap:8px!important;font-size:11px!important;font-weight:600!important;color:#ffd700!important}
.pt-bench-toggle{font-size:11px!important;padding:3px 8px!important;border-radius:12px!important;border:1px solid #ffd700!important;background:rgba(255,215,0,0.1)!important;color:#ffd700!important;cursor:pointer!important;font-weight:700!important}
.pt-bench-toggle.s8{background:rgba(255,215,0,0.3)!important;color:#fff!important}
/* MOBILE */
@media(max-width:768px){
  .pt-controls{overflow-x:auto!important;scrollbar-width:none!important}
  .pt-controls::-webkit-scrollbar{display:none!important}
  .pt-ctrl-btn{min-width:34px!important}
  .ctrl-label{font-size:8px!important}
  .pt-hand-card{width:38px!important;height:53px!important}
  #ptDeckSearchGrid{grid-template-columns:repeat(auto-fill,minmax(70px,1fr))!important}
  #ptDeckSearchGrid img.pt-field-card{width:70px!important;height:98px!important}
  .pt-legend-box{display:none!important}
  #ptAreaZeroControl{font-size:10px!important}
  #pt-action-group-v3 button{font-size:11px!important;padding:5px 8px!important}
}
@media(max-width:480px){
  .ctrl-label{display:none!important}
  .pt-ctrl-btn{min-width:30px!important}
  #pt-action-group-v3 button{font-size:10px!important;padding:4px 7px!important}
}
`;
  const s=document.createElement('style');
  s.id=id;s.textContent=css;
  document.head.appendChild(s);
}

// ============================================================
// PART 2: DECK SELECTOR (Fix #1)
// ============================================================
window.openMyDecksPlaytest=function(){
  let m=document.getElementById('myDecksPlaytestModal');
  if(!m){
    m=document.createElement('div');
    m.id='myDecksPlaytestModal';
    m.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:9000;display:flex;align-items:center;justify-content:center;';
    m.innerHTML='<div style="background:#1a1a2e;border-radius:16px;padding:24px;width:520px;max-width:95vw;border:2px solid rgba(255,203,5,0.3);box-shadow:0 20px 60px rgba(0,0,0,0.8);">'+
    '<h2 style="color:#ffd700;margin:0 0 6px;font-size:20px;">🎮 Playtest – Meine Decks</h2>'+
    '<p style="color:rgba(255,255,255,0.6);font-size:13px;margin:0 0 18px;">Wähle ein Deck für jeden Spieler</p>'+
    '<div style="margin-bottom:14px;"><label style="color:#4fc3f7;font-size:13px;font-weight:700;display:block;margin-bottom:6px;">🔵 Spieler 1</label>'+
    '<select id="myDeckSelectP1" style="width:100%;padding:10px 12px;border-radius:8px;background:#0d1b40;color:white;border:2px solid #4fc3f7;font-size:14px;"></select></div>'+
    '<div style="margin-bottom:20px;"><label style="color:#ef5350;font-size:13px;font-weight:700;display:block;margin-bottom:6px;">🔴 Spieler 2</label>'+
    '<select id="myDeckSelectP2" style="width:100%;padding:10px 12px;border-radius:8px;background:#2d0a0a;color:white;border:2px solid #ef5350;font-size:14px;"></select></div>'+
    '<div style="display:flex;gap:10px;">'+
    '<button onclick="closeMyDecksPlaytest()" style="flex:1;padding:12px;border-radius:8px;background:rgba(255,255,255,0.08);color:#999;border:1px solid rgba(255,255,255,0.15);font-size:14px;cursor:pointer;">Abbrechen</button>'+
    '<button onclick="startMyDecksPlaytest()" style="flex:2;padding:12px;border-radius:8px;background:linear-gradient(135deg,#27ae60,#219a52);color:white;border:none;font-size:14px;font-weight:700;cursor:pointer;">▶ Playtest starten</button>'+
    '</div></div>';
    document.body.appendChild(m);
  }
  const d=window.userDecks||[];
  ['P1','P2'].forEach(function(p,i){
    const s=document.getElementById('myDeckSelect'+p);
    if(s){s.innerHTML='';d.forEach(function(dk,j){const o=document.createElement('option');o.value=j;o.textContent=dk.name||('Deck '+(j+1));s.appendChild(o);});if(i===1&&d.length>1)s.selectedIndex=1;}
  });
  m.style.display='flex';
};

window.closeMyDecksPlaytest=function(){
  const m=document.getElementById('myDecksPlaytestModal');
  if(m)m.style.display='none';
};

function buildDeck(deck){
  const cards=[];
  (deck.cards||[]).forEach(function(c){
    const cnt=typeof c.count==='number'?c.count:parseInt(c.count)||1;
    cards.push({id:c.id||c.cardId,name:c.name,image:c.image||c.imageUrl||c.img,count:cnt,set:c.set||c.setCode,number:c.number||c.cardNumber});
  });
  return cards;
}

window.startMyDecksPlaytest=function(){
  const d=window.userDecks||[];
  const i1=parseInt(document.getElementById('myDeckSelectP1')&&document.getElementById('myDeckSelectP1').value||0);
  const i2=parseInt(document.getElementById('myDeckSelectP2')&&document.getElementById('myDeckSelectP2').value||0);
  const d1=d[i1],d2=d[i2];
  if(!d1||!d2)return;
  window.standaloneDecks=window.standaloneDecks||[{cards:[]},{cards:[]}];
  window.standaloneDecks[0]={name:d1.name,cards:buildDeck(d1)};
  window.standaloneDecks[1]={name:d2.name,cards:buildDeck(d2)};
  window.closeMyDecksPlaytest();
  if(typeof startStandalonePlaytester==='function')startStandalonePlaytester();
};

// ============================================================
// PART 3: ACTION BUTTONS IN BOTTOM BAR
// ============================================================
function injectActionButtons(){
  if(document.getElementById('pt-action-group-v3'))return;
  const bar=document.getElementById('ptHandActionBar');
  if(!bar)return;
  const g=document.createElement('div');
  g.id='pt-action-group-v3';
  g.style.cssText='display:flex;align-items:center;gap:5px;margin-left:6px;padding-left:6px;border-left:1px solid rgba(255,255,255,0.2);flex-shrink:0;';
  const defs=[
    {t:'⚔️ Angriff',fn:'ptOpenAttackView()',bg:'#c0392b',c:'white'},
    {t:'⏭️ Ende',fn:'ptPassTurn()',bg:'#27ae60',c:'white'},
    {t:'👁️ Gegner',fn:'ptOpenOpponentPanel()',bg:'#7d3c98',c:'white'},
    {t:'☰ Aktionen',fn:'typeof ptQuickActionsMenu==="function"&&ptQuickActionsMenu()',bg:'rgba(255,255,255,0.12)',c:'#ddd'}
  ];
  defs.forEach(function(def){
    const b=document.createElement('button');
    b.textContent=def.t;b.style.background=def.bg;b.style.color=def.c;
    b.onclick=function(){try{eval(def.fn);}catch(e){}};
    g.appendChild(b);
  });
  const mulliBtn=Array.from(bar.querySelectorAll('button')).find(function(b){return b.textContent.includes('ullig');});
  if(mulliBtn)mulliBtn.after(g);else bar.prepend(g);
  const old=document.getElementById('pt-side-buttons-left');
  if(old){old.style.opacity='0';old.style.pointerEvents='none';}
}

// ============================================================
// PART 4: AREA ZERO BENCH TOGGLE (Fix #4)
// ============================================================
window.ptBenchSizes=window.ptBenchSizes||{p1:5,p2:5};
window.ptToggleBenchSize=function(player){
  const cur=window.ptBenchSizes[player];
  const n=cur===5?8:5;
  window.ptBenchSizes[player]=n;
  const btn=document.getElementById('ptBenchToggle-'+player);
  if(btn){btn.textContent=(player==='p1'?'P1':'P2')+': '+n+' Slots';btn.className='pt-bench-toggle '+(n===8?'s8':'s5');}
  ['5','6','7'].forEach(function(i){
    const s=document.getElementById('ptBench'+i+'-'+player);
    if(s)s.style.display=n===8?'block':'none';
  });
};

// ============================================================
// PART 5: AREA ZERO CONTROL IN TOP BAR
// ============================================================
function injectAreaZeroControl(){
  if(document.getElementById('ptAreaZeroControl'))return;
  const cb=document.querySelector('.pt-controls');
  if(!cb)return;
  const d=document.createElement('div');
  d.id='ptAreaZeroControl';
  d.style.marginLeft='auto';
  d.innerHTML='<span style="font-size:11px;color:rgba(255,215,0,0.8);font-weight:600;">🏟️ AREA ZERO:</span>'+
    '<button id="ptBenchToggle-p1" class="pt-bench-toggle s5" onclick="ptToggleBenchSize(\'p1\')">P1: 5 Slots</button>'+
    '<button id="ptBenchToggle-p2" class="pt-bench-toggle s5" onclick="ptToggleBenchSize(\'p2\')">P2: 5 Slots</button>';
  cb.appendChild(d);
}

// ============================================================
// PART 6: APPLY ALL & HOOK INTO GAME START
// ============================================================
function applyBoardUI(){
  injectStyles();
  injectAreaZeroControl();
  setTimeout(injectActionButtons,400);
}

const _ss=window.startStandalonePlaytester;
if(typeof _ss==='function'){
  window.startStandalonePlaytester=function(){_ss.apply(this,arguments);setTimeout(applyBoardUI,300);};
}

if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',applyBoardUI);}else{setTimeout(applyBoardUI,500);}

})();
