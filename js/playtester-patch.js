/* ============================================================
   PLAYTESTER MEGA-PATCH v5.0 - Mobile-First, Clean Layout
   Changes:
   - Single clean IIFE (removed duplicate)
   - Fixed: DeckSearch modal no longer forced open
   - Left sidebar (Deck-Controls + Legend) hidden
   - Right Deck Panel (ptZoomPanel) hidden
   - Top control bar minimised
   - Action buttons (Attack/EndTurn/OppView) in bottom bar
   - Bench horizontal, hand card compact, deck browser grid
   - Area Zero bench toggle (5 <-> 8 slots)
   ============================================================ */

(function(){
'use strict';

// ============================================================
// PART 1: CSS INJECTION
// ============================================================
function injectStyles(){
  var id='pt-megapatch-v5-styles';
  if(document.getElementById(id))return;
  var css=`
/* HIDE LEFT SIDEBAR */
.pt-deck-controls,.pt-legend-box{display:none!important}

/* HIDE RIGHT PANEL */
#ptZoomPanel{display:none!important}

/* TOP BAR - COMPACT */
.pt-controls{
  height:40px!important;
  min-height:40px!important;
  overflow-x:auto!important;
  overflow-y:hidden!important;
  scrollbar-width:none!important;
  flex-wrap:nowrap!important;
  padding:0 4px!important;
}
.pt-controls::-webkit-scrollbar{display:none!important}
.pt-ctrl-btn{
  min-width:34px!important;
  height:36px!important;
  padding:2px 4px!important;
}
.ctrl-label{font-size:8.5px!important}

/* DECK BROWSER: compact grid - only when visible */
#ptDeckSearchGrid{
  display:grid!important;
  grid-template-columns:repeat(auto-fill,minmax(90px,1fr))!important;
  gap:6px!important;
  padding:10px!important;
  overflow-y:auto!important;
  max-height:70vh!important;
}
#ptDeckSearchGrid>div{width:auto!important;height:auto!important}
#ptDeckSearchGrid img.pt-field-card{
  width:90px!important;
  height:126px!important;
  object-fit:cover!important;
  border-radius:6px!important;
  display:block!important;
}
#ptDeckSearchGrid>div>div.pos-abs{font-size:10px!important;padding:2px 4px!important}

/* DISCARD GRID */
#ptDiscardGrid{
  display:grid!important;
  grid-template-columns:repeat(auto-fill,minmax(80px,1fr))!important;
  gap:5px!important;
  padding:8px!important;
}
#ptDiscardGrid img{width:80px!important;height:112px!important;border-radius:5px!important}

/* HAND CARDS */
.pt-hand-card{
  width:clamp(38px,4.2vw,52px)!important;
  height:clamp(53px,5.9vw,73px)!important;
  border-radius:4px!important;
  transition:transform 0.15s!important;
}
.pt-hand-card:hover{transform:translateY(-14px) scale(1.1)!important;z-index:100!important}

/* BOTTOM ACTION BAR */
#ptHandActionBar{overflow-x:auto!important;scrollbar-width:none!important;flex-wrap:nowrap!important}
#ptHandActionBar::-webkit-scrollbar{display:none!important}
#pt-action-group-v3 button{
  padding:5px 9px!important;border-radius:7px!important;font-size:11.5px!important;
  font-weight:600!important;border:none!important;cursor:pointer!important;white-space:nowrap!important;
}
#pt-action-group-v3 button:hover{opacity:0.82!important;transform:translateY(-1px)!important}

/* BENCH HORIZONTAL */
#p1-area .pt-bench-zone,#p2-area .pt-bench-zone{
  display:flex!important;flex-direction:row!important;gap:4px!important;
  align-items:flex-start!important;flex-wrap:nowrap!important;overflow-x:auto!important;
}

/* EXTRA BENCH SLOTS hidden by default */
[id^="ptBench5"],[id^="ptBench6"],[id^="ptBench7"]{display:none!important}

/* AREA ZERO */
#ptAreaZeroControl{display:flex!important;align-items:center!important;gap:8px!important;font-size:11px!important;font-weight:600!important;color:#ffd700!important}
.pt-bench-toggle{font-size:11px!important;padding:3px 8px!important;border-radius:12px!important;border:1px solid #ffd700!important;background:rgba(255,215,0,0.15)!important;color:#ffd700!important;cursor:pointer!important}
.pt-bench-toggle.s8{background:rgba(255,215,0,0.3)!important;color:#fff!important}

/* CARD HOVER */
.pt-dropzone img:hover{transform:scale(1.08)!important;transition:transform 0.15s!important;z-index:100!important;position:relative!important}

/* MOBILE */
@media(max-width:768px){
  .pt-ctrl-btn{min-width:30px!important;height:32px!important}
  .ctrl-label{font-size:7.5px!important}
  .pt-hand-card{width:38px!important;height:53px!important}
  #ptDeckSearchGrid{grid-template-columns:repeat(auto-fill,minmax(70px,1fr))!important}
  #ptDeckSearchGrid img.pt-field-card{width:70px!important;height:98px!important}
  #ptAreaZeroControl{font-size:10px!important}
  #pt-action-group-v3 button{font-size:11px!important;padding:5px 8px!important}
}
@media(max-width:480px){
  .pt-hand-card{width:36px!important;height:50px!important}
  #ptDeckSearchGrid{grid-template-columns:repeat(auto-fill,minmax(60px,1fr))!important}
  #ptDeckSearchGrid img.pt-field-card{width:60px!important;height:84px!important}
}
`;
  var s=document.createElement('style');
  s.id=id;s.textContent=css;
  document.head.appendChild(s);
}

// ============================================================
// PART 2: HIDE RIGHT PANEL at runtime
// ============================================================
function hideZoomPanel(){
  var zp=document.getElementById('ptZoomPanel');
  if(zp)zp.setAttribute('style','display:none!important');
}

// ============================================================
// PART 3: DECK SELECTOR from main menu
// ============================================================
window.openMyDecksPlaytest=function(){
  if(typeof firebase==='undefined'||!firebase.auth||!firebase.auth().currentUser){
    alert('Please log in to use your decks.');return;
  }
  var uid=firebase.auth().currentUser.uid;
  var modal=document.getElementById('ptmp');
  if(!modal){
    modal=document.createElement('div');
    modal.id='ptmp';
    modal.style.cssText='position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(modal);
  }
  modal.innerHTML='<div style="background:#1a1a2e;border-radius:12px;padding:24px;max-width:500px;width:90%;color:white;">'+
    '<h2 style="margin:0 0 16px;color:#ffd700;">Playtest My Decks</h2>'+
    '<p style="margin:0 0 12px;color:#aaa;font-size:14px;">Choose a deck for each player, then start the match!</p>'+
    '<div style="margin-bottom:12px;"><label style="color:#4a9eff;font-weight:600;">Player 1</label>'+
    '<select id="ptmp-p1" style="width:100%;margin-top:6px;padding:8px;border-radius:6px;background:#0f3460;color:white;border:1px solid #4a9eff;"></select></div>'+
    '<div style="margin-bottom:20px;"><label style="color:#ff6b6b;font-weight:600;">Player 2</label>'+
    '<select id="ptmp-p2" style="width:100%;margin-top:6px;padding:8px;border-radius:6px;background:#3d0000;color:white;border:1px solid #ff6b6b;"></select></div>'+
    '<div style="display:flex;gap:10px;justify-content:flex-end;">'+
    '<button onclick="window.closeMyDecksPlaytest()" style="padding:8px 16px;border-radius:6px;border:1px solid #666;background:transparent;color:#aaa;cursor:pointer;">Cancel</button>'+
    '<button onclick="window.startMyDecksPlaytest()" style="padding:8px 20px;border-radius:6px;border:none;background:#27ae60;color:white;font-weight:600;cursor:pointer;">Start Playtest</button>'+
    '</div></div>';
  modal.style.display='flex';
  firebase.firestore().collection('users').doc(uid).collection('decks').get().then(function(snap){
    var p1=document.getElementById('ptmp-p1'),p2=document.getElementById('ptmp-p2');
    if(!p1||!p2)return;
    var opts='';
    snap.forEach(function(d){opts+='<option value="'+d.id+'">'+d.data().name+'</option>';});
    p1.innerHTML=opts;p2.innerHTML=opts;
    if(snap.size>1)p2.options[1].selected=true;
  }).catch(function(e){console.error('Deck load:',e);});
};

window.closeMyDecksPlaytest=function(){
  var m=document.getElementById('ptmp');
  if(m)m.style.display='none';
};

function buildDeck(deck){
  var cards=[];
  var data=deck.data();
  if(!data||!data.cards)return cards;
  data.cards.forEach(function(c){for(var i=0;i<(c.count||1);i++)cards.push(c);});
  return cards;
}

window.startMyDecksPlaytest=function(){
  var p1sel=document.getElementById('ptmp-p1'),p2sel=document.getElementById('ptmp-p2');
  if(!p1sel||!p2sel)return;
  var uid=firebase.auth().currentUser.uid;
  var col=firebase.firestore().collection('users').doc(uid).collection('decks');
  Promise.all([col.doc(p1sel.value).get(),col.doc(p2sel.value).get()]).then(function(r){
    var d1=buildDeck(r[0]),d2=buildDeck(r[1]);
    if(!d1||!d2)return;
    if(typeof ptInitGame==='function')ptInitGame(d1,d2);
    else if(typeof window.ptLoadDecksAndStart==='function')window.ptLoadDecksAndStart(d1,d2);
    window.closeMyDecksPlaytest();
    setTimeout(applyBoardUI,500);
  }).catch(function(e){console.error('Start:',e);});
};

// ============================================================
// PART 4: ACTION BUTTONS IN BOTTOM BAR
// ============================================================
function injectActionButtons(){
  if(document.getElementById('pt-action-group-v3'))return;
  var bar=document.getElementById('ptHandActionBar');
  if(!bar)return;
  var g=document.createElement('div');
  g.id='pt-action-group-v3';
  g.style.cssText='display:flex;gap:5px;align-items:center;flex-shrink:0;margin:0 4px;';
  var defs=[
    {t:'⚔️ Angriff',fn:'ptOpenAttackView()',bg:'#c0392b',c:'white'},
    {t:'⏭️ Ende',fn:'ptPassTurn()',bg:'#27ae60',c:'white'},
    {t:'👁️ Gegner',fn:'ptOpenOpponentPanel()',bg:'#7d3c98',c:'white'},
    {t:'≡ Aktionen',fn:'if(typeof ptShowDirectActionModal!=="undefined")ptShowDirectActionModal()',bg:'#1a5276',c:'white'}
  ];
  defs.forEach(function(def){
    var b=document.createElement('button');
    b.textContent=def.t;
    b.setAttribute('onclick',def.fn);
    b.style.cssText='background:'+def.bg+';color:'+def.c+';';
    g.appendChild(b);
  });
  var mulliBtn=bar.querySelector('button');
  if(mulliBtn)mulliBtn.after(g);else bar.prepend(g);
}

// ============================================================
// PART 5: AREA ZERO BENCH TOGGLE
// ============================================================
window.ptToggleBenchSize=function(player){
  var btn=document.getElementById('ptBenchToggle-'+player);
  if(!btn)return;
  var is8=btn.classList.contains('s8');
  btn.textContent=player.toUpperCase()+(is8?': 5 Slots':': 8 Slots');
  btn.classList.toggle('s8',!is8);
  btn.classList.toggle('s5',is8);
  ['5','6','7'].forEach(function(i){
    var el=document.getElementById('ptBench'+i+'-'+player);
    if(el)el.style.setProperty('display',is8?'none':'block','important');
  });
};

function injectAreaZeroControl(){
  if(document.getElementById('ptAreaZeroControl'))return;
  var cb=document.querySelector('.pt-controls');
  if(!cb)return;
  var d=document.createElement('div');
  d.id='ptAreaZeroControl';
  d.style.cssText='margin-left:auto;padding-right:8px;display:flex;align-items:center;gap:6px;';
  d.innerHTML='<span style="color:#ffd700;font-size:10px;">AREA ZERO:</span>'+
    '<button id="ptBenchToggle-p1" class="pt-bench-toggle s5" onclick="ptToggleBenchSize(\x27p1\x27)">P1: 5 Slots</button>'+
    '<button id="ptBenchToggle-p2" class="pt-bench-toggle s5" onclick="ptToggleBenchSize(\x27p2\x27)">P2: 5 Slots</button>';
  cb.appendChild(d);
}

// ============================================================
// PART 6: APPLY ALL & HOOK INTO GAME
// ============================================================
function applyBoardUI(){
  injectStyles();
  hideZoomPanel();
  injectAreaZeroControl();
  setTimeout(injectActionButtons,400);
}

// Hook ptRenderAll
var _origRender=window.ptRenderAll;
if(typeof _origRender==='function'){
  window.ptRenderAll=function(){
    _origRender.apply(this,arguments);
    setTimeout(function(){hideZoomPanel();injectActionButtons();},50);
  };
}

// Hook ptStartGame
var _origStart=window.ptStartGame;
if(typeof _origStart==='function'){
  window.ptStartGame=function(){
    _origStart.apply(this,arguments);
    setTimeout(applyBoardUI,600);
  };
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',applyBoardUI);
}else{
  applyBoardUI();
}

window.addEventListener('hashchange',function(){
  if(location.hash.includes('playtester'))setTimeout(applyBoardUI,800);
});

})();
