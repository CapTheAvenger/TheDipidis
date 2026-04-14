/* ================================================================
   PLAYTESTER MEGA-PATCH v5.2d - Mobile-First, Clean Layout
   Changes from v5.1:
   - Fixed: DeckSearch modal no longer forced open
   - Left sidebar (Deck-Controls + Legend) hidden
   - Right Deck Panel (ptZoomPanel) hidden
   - Top control bar minimised
   - Action buttons (Attack/EndTurn/OppView) in bottom bar
   - Bench horizontal, hand card compact, deck browser grid
   - Area Zero bench toggle (5 <-> 8 slots)
   - v5.2: startMyDecksPlaytest correctly loads Firebase decks
           and starts game via ptNewGame + ptOpenStartPhase
   - v5.2b: handle null ptState.p1/p2 (uninitialised game state)
   ================================================================ */

(function(){
'use strict';

// ============================================================
// PART 1: CSS INJECTION
// ============================================================
function injectStyles(){
  var id='pt-megapatch-v5-styles';
  if(document.getElementById(id))return;
  var s=document.createElement('style');
  s.id=id;
  s.textContent=`
/* === HIDE SIDEBARS & RIGHT PANEL === */
#pt-deck-controls,
.pt-deck-controls,
#pt-legend,
.pt-legend,
[id*="legend"],
.pt-sidebar-left,
#ptSidebarLeft,
.sandbox-left-panel,
#ptDeckControls { display:none!important; }

#ptZoomPanel,
.ptZoomPanel,
[id*="ZoomPanel"],
.pt-right-panel,
.sandbox-right-panel { display:none!important; }

/* === COMPACT TOP BAR === */
.sandbox-controls,
#ptControlBar,
.pt-control-bar {
  padding:2px 6px!important;
  min-height:unset!important;
}
.sandbox-controls button,
#ptControlBar button {
  padding:2px 6px!important;
  font-size:11px!important;
}

/* === DECK BROWSER: COMPACT GRID === */
#ptDeckSearchModal .pt-card-grid,
#ptDeckSearchModal .card-grid {
  display:grid!important;
  grid-template-columns:repeat(auto-fill,minmax(80px,1fr))!important;
  gap:4px!important;
}
#ptDeckSearchModal .pt-card-item img,
#ptDeckSearchModal .card-item img {
  width:80px!important;
  height:auto!important;
}

/* === AREA ZERO CONTROL === */
#ptAreaZeroControl {
  display:flex;
  gap:4px;
  align-items:center;
  justify-content:center;
  margin-top:8px;
  flex-wrap:wrap;
}
.pt-bench-toggle {
  background:#1a1a2e;
  color:#f5c842;
  border:1px solid #f5c842;
  border-radius:6px;
  padding:4px 10px;
  font-size:12px;
  font-weight:700;
  cursor:pointer;
}
.pt-bench-toggle.s8 { background:#27ae60; color:white; border-color:#27ae60; }

/* === HAND CARDS: COMPACT === */
.pt-hand-zone .pt-card,
.pt-hand-zone img {
  width:60px!important;
  height:auto!important;
}

/* === BENCH: HORIZONTAL UNDER ACTIVE === */
#p1-bench, #p2-bench,
.pt-bench-zone {
  flex-direction:row!important;
  flex-wrap:wrap!important;
}

/* === ACTION GROUP BUTTONS === */
#pt-action-group-v3 {
  display:inline-flex!important;
  gap:4px!important;
  align-items:center!important;
}
#pt-action-group-v3 button {
  padding:4px 8px!important;
  font-size:12px!important;
  border-radius:6px!important;
  font-weight:700!important;
  border:none!important;
  cursor:pointer!important;
  color:white!important;
}

/* === MY DECKS MODAL === */
#myDecksPlaytestModal {
  position:fixed;
  top:0;left:0;right:0;bottom:0;
  background:rgba(0,0,0,0.75);
  z-index:20000;
  align-items:center;
  justify-content:center;
}
`;
  document.head.appendChild(s);
}

// ============================================================
// PART 2: HIDE RIGHT PANEL at runtime
// ============================================================
function hideZoomPanel(){
  var zp=document.getElementById('ptZoomPanel');
  if(zp)zp.setAttribute('style','display:none!important');
  var rp=document.querySelector('.pt-right-panel');
  if(rp)rp.setAttribute('style','display:none!important');
}

// ============================================================
// PART 3: DECK SELECTOR from main menu
// ============================================================
window.openMyDecksPlaytest=function(){
  if(typeof firebase==='undefined'||!firebase.auth||!firebase.auth().currentUser){
    alert('Please log in to use your decks.');return;
  }
  var modal=document.getElementById('myDecksPlaytestModal');
  if(!modal){
    modal=document.createElement('div');
    modal.id='myDecksPlaytestModal';
    modal.style.cssText='z-index:20000;display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);align-items:center;justify-content:center;';
    modal.innerHTML=
      '<div class="rarity-switcher-modal-content" style="max-width:500px;background:#f8f9fa">'+
      '<span class="rarity-switcher-close" onclick="closeMyDecksPlaytest()" aria-label="Close">&#10005;</span>'+
      '<h2 style="margin-top:0;color:#27ae60;border-bottom:2px solid #e1e8ed;padding-bottom:10px">&#127918; Playtest &#127952; My Decks</h2>'+
      '<p style="color:#555;margin-bottom:20px">Choose a deck for each player, then start the match!</p>'+
      '<div style="margin-bottom:16px"><label for="ptmp-p1" style="display:block;font-weight:700;margin-bottom:6px;color:#3b4cca">Player 1 &#128309;</label>'+
      '<select id="ptmp-p1" style="width:100%;padding:10px 12px;border:2px solid #3b4cca;border-radius:8px;font-size:14px;background:#fff;cursor:pointer"></select></div>'+
      '<div style="margin-bottom:24px"><label for="ptmp-p2" style="display:block;font-weight:700;margin-bottom:6px;color:#e3350d">Player 2 &#128308;</label>'+
      '<select id="ptmp-p2" style="width:100%;padding:10px 12px;border:2px solid #e3350d;border-radius:8px;font-size:14px;background:#fff;cursor:pointer"></select></div>'+
      '<div style="display:flex;gap:12px">'+
      '<button onclick="closeMyDecksPlaytest()" style="flex:1;padding:12px;background:#e1e8ed;color:#2c3e50;font-weight:700;border:2px solid #ccd6dd;border-radius:8px;cursor:pointer;font-size:14px">Cancel</button>'+
      '<button onclick="startMyDecksPlaytest()" style="flex:2;padding:12px;background:linear-gradient(135deg,#27ae60 0,#1e8449 100%);color:#fff;font-weight:700;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 4px 10px rgba(39,174,96,.3)">&#9654;&#65039; Start Playtest</button>'+
      '</div></div>';
    document.body.appendChild(modal);
  } else {
    // Existing modal might have old HTML - replace inner content to ensure correct IDs
    if(!document.getElementById('ptmp-p1')){
      modal.innerHTML=
        '<div class="rarity-switcher-modal-content" style="max-width:500px;background:#f8f9fa">'+
        '<span class="rarity-switcher-close" onclick="closeMyDecksPlaytest()" aria-label="Close">&#10005;</span>'+
        '<h2 style="margin-top:0;color:#27ae60;border-bottom:2px solid #e1e8ed;padding-bottom:10px">&#127918; Playtest &#127952; My Decks</h2>'+
        '<p style="color:#555;margin-bottom:20px">Choose a deck for each player, then start the match!</p>'+
        '<div style="margin-bottom:16px"><label for="ptmp-p1" style="display:block;font-weight:700;margin-bottom:6px;color:#3b4cca">Player 1 &#128309;</label>'+
        '<select id="ptmp-p1" style="width:100%;padding:10px 12px;border:2px solid #3b4cca;border-radius:8px;font-size:14px;background:#fff;cursor:pointer"></select></div>'+
        '<div style="margin-bottom:24px"><label for="ptmp-p2" style="display:block;font-weight:700;margin-bottom:6px;color:#e3350d">Player 2 &#128308;</label>'+
        '<select id="ptmp-p2" style="width:100%;padding:10px 12px;border:2px solid #e3350d;border-radius:8px;font-size:14px;background:#fff;cursor:pointer"></select></div>'+
        '<div style="display:flex;gap:12px">'+
        '<button onclick="closeMyDecksPlaytest()" style="flex:1;padding:12px;background:#e1e8ed;color:#2c3e50;font-weight:700;border:2px solid #ccd6dd;border-radius:8px;cursor:pointer;font-size:14px">Cancel</button>'+
        '<button onclick="startMyDecksPlaytest()" style="flex:2;padding:12px;background:linear-gradient(135deg,#27ae60 0,#1e8449 100%);color:#fff;font-weight:700;border:none;border-radius:8px;cursor:pointer;font-size:14px;box-shadow:0 4px 10px rgba(39,174,96,.3)">&#9654;&#65039; Start Playtest</button>'+
        '</div></div>';
    }
  }
  modal.style.display='flex';
  var uid=firebase.auth().currentUser.uid;
  firebase.firestore().collection('users').doc(uid).collection('decks').get().then(function(snap){
    var p1=document.getElementById('ptmp-p1'),p2=document.getElementById('ptmp-p2');
    if(!p1||!p2)return;
    p1.innerHTML='';p2.innerHTML='';
    snap.forEach(function(doc){
      var o1=document.createElement('option'),o2=document.createElement('option');
      o1.value=doc.id;o1.textContent=doc.data().name||doc.id;
      o2.value=doc.id;o2.textContent=doc.data().name||doc.id;
      p1.appendChild(o1);p2.appendChild(o2);
    });
  }).catch(function(e){console.error('Deck load:',e);});
};

window.closeMyDecksPlaytest=function(){
  var m=document.getElementById('myDecksPlaytestModal');
  if(m)m.style.display='none';
};

function buildDeck(data){
  var cards=[];
  if(!data||!data.cards)return cards;
  data.cards.forEach(function(c){cards.push(c);});
  return cards;
}

function expandDeckCards(cards,prefix){
  var out=[];
  cards.forEach(function(card){
    var cnt=parseInt(card.count)||1;
    for(var i=0;i<cnt;i++){
      var copy={};
      Object.keys(card).forEach(function(k){copy[k]=card[k];});
      copy.ptId=prefix+'_'+Math.random().toString(36).substr(2,9);
      out.push(copy);
    }
  });
  return out;
}

window.startMyDecksPlaytest=function(){
  var p1sel=document.getElementById('ptmp-p1'),p2sel=document.getElementById('ptmp-p2');
  if(!p1sel||!p2sel){alert('Deck selector not found. Please reopen the deck chooser.');return;}
  var uid=firebase.auth().currentUser.uid;
  var col=firebase.firestore().collection('users').doc(uid).collection('decks');
  Promise.all([col.doc(p1sel.value).get(),col.doc(p2sel.value).get()]).then(function(r){
    var d1=r[0].data(),d2=r[1].data();
    if(!d1||!d2){alert('Could not load decks. Please try again.');return;}
    var c1=d1.cards||{},c2=d2.cards||{};
    var lines1=[],lines2=[];
    Object.keys(c1).forEach(function(k){
      var m=k.match(/^(.+)\s+\(([A-Z0-9]+)\s+(\d+[A-Z]*)\)$/);
      if(m)lines1.push(c1[k]+' '+m[1]+' '+m[2]+' '+m[3]);
    });
    Object.keys(c2).forEach(function(k){
      var m=k.match(/^(.+)\s+\(([A-Z0-9]+)\s+(\d+[A-Z]*)\)$/);
      if(m)lines2.push(c2[k]+' '+m[1]+' '+m[2]+' '+m[3]);
    });
    var code1=lines1.join('\n'),code2=lines2.join('\n');
    window.closeMyDecksPlaytest();
    if(typeof parseSandboxDeckToExactPrints==='function'){
      parseSandboxDeckToExactPrints(code1,'p1');
      parseSandboxDeckToExactPrints(code2,'p2');
      setTimeout(function(){
        if(typeof startStandalonePlaytester==='function')startStandalonePlaytester();
        setTimeout(applyBoardUI,800);
      },500);
    }
  }).catch(function(e){console.error('Start:',e);alert('Error loading decks: '+e.message);});
};

// ============================================================
// PART 4: ACTION BUTTONS IN BOTTOM BAR
// ============================================================
function injectActionButtons(){
  if(document.getElementById('pt-action-group-v3'))return;
  var bar=document.querySelector('.pt-controls')||document.querySelector('.sandbox-controls');
  if(!bar)return;
  var g=document.createElement('span');
  g.id='pt-action-group-v3';
  var defs=[
    {t:'\u2694\uFE0F Angriff',fn:'ptOpenAttackView()',bg:'#c0392b'},
    {t:'\u23ED\uFE0F Ende',fn:'ptPassTurn()',bg:'#27ae60'},
    {t:'\uD83D\uDC41\uFE0F Gegner',fn:'ptOpenOpponentPanel()',bg:'#7d3c98'},
    {t:'\u2261 Aktionen',fn:'if(typeof ptShowDirectActionModal!=="undefined")ptShowDirectActionModal()',bg:'#1a5276'}
  ];
  defs.forEach(function(def){
    var b=document.createElement('button');
    b.textContent=def.t;
    b.setAttribute('onclick',def.fn);
    b.style.cssText='background:'+def.bg+';color:white;padding:4px 8px;font-size:12px;border-radius:6px;font-weight:700;border:none;cursor:pointer;margin-right:2px;';
    g.appendChild(b);
  });
  var mulliBtn=bar.querySelector('[onclick*="ptMulligan"]');
  if(mulliBtn)mulliBtn.after(g);else bar.prepend(g);
}

// ============================================================
// PART 5: AREA ZERO BENCH TOGGLE
// ============================================================
window.ptToggleBenchSize=function(player){
  var btn=document.getElementById('ptBenchToggle-'+player);
  if(!btn)return;
  var is8=btn.classList.contains('s8');
  btn.classList.toggle('s8',!is8);
  btn.classList.toggle('s5',is8);
  btn.textContent=player.toUpperCase()+': '+(is8?'5':'8')+' Slots';
  ['5','6','7'].forEach(function(i){
    var el=document.getElementById(player+'-bench-slot-'+i);
    if(el)el.style.setProperty('display',is8?'none':'block','important');
  });
};

function injectAreaZeroControl(){
  if(document.getElementById('ptAreaZeroControl'))return;
  var cb=document.querySelector('.pt-controls')||document.querySelector('.sandbox-controls');
  if(!cb)return;
  var d=document.createElement('div');
  d.id='ptAreaZeroControl';
  d.innerHTML=
    '<span style="color:#f5c842;font-size:11px;font-weight:700;margin-right:4px;">AREA ZERO:</span>'+
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

var _origRender=window.ptRenderAll;
if(typeof _origRender==='function'){
  window.ptRenderAll=function(){
    _origRender.apply(this,arguments);
    setTimeout(function(){hideZoomPanel();injectActionButtons();},50);
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
