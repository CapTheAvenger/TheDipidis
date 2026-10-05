/*
 * 390-px-Messung thedipidis.app (UI/UX-Überprüfung v2, Agent 5, 05.10.2026)
 * ------------------------------------------------------------------------
 * Verfahren (wiederholbar, ohne Mobilgerät):
 *  1. Eigener Tab auf https://thedipidis.app/ (angemeldet). Fenster egal.
 *  2. Im Tab einen gleich-herkünftigen iframe 390 x 844 einsetzen. ACHTUNG: f.src='/#…'
 *     geht NICHT — die CSP der Seite (meta, frame-src ohne 'self') blockiert den Rahmen,
 *     contentDocument ist dann null. Stattdessen leeren iframe anlegen und index.html
 *     hineinschreiben (document.open übernimmt die URL des Eltern-Tabs, Hash-Routing geht):
 *       let html = await fetch('/', {cache:'no-store'}).then(r=>r.text());
 *       html = html.replace(/<head([^>]*)>/i, '<head$1><base href="https://thedipidis.app/">');
 *       const f=document.createElement('iframe'); f.id='m390';
 *       f.style.cssText='position:fixed;top:0;left:0;width:390px;height:844px;z-index:2147483647;background:#fff;border:0';
 *       document.body.appendChild(f);
 *       const d=f.contentDocument; d.open(); d.write(html); d.close();
 *       // nach ~25 s: Bildlaufleiste ausblenden (Handy hat Überlagerungs-Leisten),
 *       // sonst ist clientWidth 382 statt 390:
 *       const st=d.createElement('style'); st.textContent='html{scrollbar-width:none}'; d.head.appendChild(st);
 *     Prüfen: f.contentWindow.innerWidth === 390, documentElement.clientWidth === 390,
 *     firebase.auth().currentUser gesetzt (gleiche Herkunft → angemeldet).
 *     Kein Service Worker im Rahmen (lädt frisch aus dem Netz).
 *  3. Diesen Dateiinhalt im iframe ausführen — eval ist per CSP verboten ('unsafe-eval'
 *     fehlt), 'unsafe-inline' geht: Inhalt als String code, dann
 *       const s=d.createElement('script'); s.textContent=code; d.body.appendChild(s);
 *     Danach steht f.contentWindow.__m390 bereit.
 *  4. Je Ansicht (Vordergrund-Tab):  await f.contentWindow.__m390.ansicht('meta-call')
 *                  await f.contentWindow.__m390.ansicht('profile','decks')
 *     Hintergrund-Tab (Zeitgeber gedrosselt): erst f.contentWindow.switchTabAndUpdateMenu('meta-call')
 *     bzw. switchProfileTab('decks'), einige Sekunden warten, dann im nächsten Aufruf
 *     await f.contentWindow.__m390.hier('meta-call')
 *     Deck-Analyse: vorher Deck wählen — s=d.getElementById('currentMetaDeckSelect'); s.value='Dragapult';
 *       syncSearchableSelectDisplay(s); loadCurrentMetaDeckData('Dragapult')  (im iframe-Fenster)
 *     Vergangene Formate: pastMetaDeckSelect auf 'Mega Excadrill' + change-Ereignis (Format TEF-30C ist Vorgabe).
 *     oder alles:  await f.contentWindow.__m390.alle()   (lange; besser einzeln, ≤ 40 s je Aufruf)
 *  Nur lesen. Einzige Nebenwirkung: Reiterwechsel und Scrollen im iframe.
 *
 * Kennzahlen je Ansicht:
 *   breite         innerWidth (muss 390 sein)
 *   quer           documentElement.scrollWidth > clientWidth
 *   querVerursacher  oberste sichtbare Elemente mit rechter Kante > clientWidth+1,
 *                    die nicht in einem Vorfahren mit overflow-x ≠ visible liegen
 *   ziele / unter44 / unter24  sichtbare Bedienelemente (Breite ODER Höhe < Grenze);
 *                    Checkbox/Radio in <label> zählt mit der Labelfläche
 *   eng24          Ziele < 24 px, deren 24-px-Kreis um die Mitte ein anderes Ziel trifft
 *                  (WCAG 2.5.8 Abstandsausnahme verfehlt)
 *   abgeschnitten  Textelemente mit scrollWidth > clientWidth+1 und overflow ≠ visible
 *                  (mitEllipse / ohneEllipse)
 *   verdeckt       Ziele im sichtbaren Band (zwischen fester Kopf- und Fußleiste), deren
 *                  Mittelpunkt per elementFromPoint ein fremdes Element trifft; Ansicht wird
 *                  dafür in Bildschirmschritten durchgescrollt (max. 25 Schritte)
 *   textUeberlapp  Paare von Textblättern, deren Rechtecke sich um > 4 px² schneiden
 *   schriftUnter11 Textblätter mit font-size < 11 px (Größen + Beispiele)
 *   kontrastUnter  Texte unter 4,5:1 (unter 3:1 bei ≥ 24 px bzw. ≥ 18,66 px fett),
 *                  Hintergrund = Alpha-Mischung der Vorfahren, Verläufe/Bilder ausgenommen
 *   kopf           Höhe Kopf (header/.app-header) und Anteil an innerHeight; feste Leisten unten
 */
(() => {
  const W = window, D = document;
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const sel = (e) => {
    if (!e || !e.tagName) return '?';
    let s = e.tagName.toLowerCase();
    if (e.id) s += '#' + e.id;
    const c = (typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
    if (c.length) s += '.' + c.join('.');
    return s;
  };
  const csCache = new Map();
  const cs = (e) => { let s = csCache.get(e); if (!s) { s = getComputedStyle(e); csCache.set(e, s); } return s; };
  // Rechteck nur der eigenen Textknoten (eine th mit Breite 0, deren Text überläuft, zählt so mit)
  const textRect = (e) => { const rg = D.createRange(); let L = 1e9, T = 1e9, R = -1e9, B = -1e9; for (const n of e.childNodes) { if (n.nodeType !== 3 || !n.textContent.trim()) continue; rg.selectNodeContents(n); const q = rg.getBoundingClientRect(); if (q.width < 0.5 || q.height < 0.5) continue; L = Math.min(L, q.left); T = Math.min(T, q.top); R = Math.max(R, q.right); B = Math.max(B, q.bottom); } return R < L ? null : { left: L, top: T, right: R, bottom: B, width: R - L, height: B - T }; };
  const sichtbar = (e, rr) => {
    if (!e || !e.getBoundingClientRect) return false;
    const r = rr || e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    // geschlossene <details> (::details-content hat content-visibility:hidden) und Deckkraft 0
    if (e.checkVisibility && !e.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return false;
    for (let n = e; n && n !== D.documentElement; n = n.parentElement) {
      const s = cs(n);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false;
      // von einem Vorfahren mit overflow ≠ visible vollständig weggeschnitten
      if (n !== e && (s.overflowX !== 'visible' || s.overflowY !== 'visible')) { const q = n.getBoundingClientRect(); if (r.right <= q.left + 1 || r.left >= q.right - 1 || r.bottom <= q.top + 1 || r.top >= q.bottom - 1) return false; }
    }
    return true;
  };
  const txt = (e) => (e.innerText || e.textContent || '').trim().replace(/\s+/g, ' ');
  const eigenText = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim();
  const ZIEL = 'button, a[href], [role="button"], [onclick], select, input:not([type="hidden"]), textarea, summary, [tabindex]:not([tabindex="-1"])';

  function ziele(wurzel) {
    const roh = [...wurzel.querySelectorAll(ZIEL)].filter(sichtbar);
    // verschachtelte Ziele: nur das innerste zählen (Knöpfe in anklickbaren Deckzeilen/Kacheln)
    const menge = new Set(roh);
    const hatInneres = new Set(); for (const e of roh) for (let p = e.parentElement; p; p = p.parentElement) if (menge.has(p)) hatInneres.add(p);
    return roh.filter((e) => !hatInneres.has(e));
  }
  function rechteck(e) {
    if ((e.type === 'checkbox' || e.type === 'radio') && e.closest('label')) return e.closest('label').getBoundingClientRect();
    if (e.labels && e.labels.length && (e.type === 'checkbox' || e.type === 'radio')) return e.labels[0].getBoundingClientRect();
    return e.getBoundingClientRect();
  }

  function ueberlauf(wurzel) {
    const cw = D.documentElement.clientWidth;
    const treffer = [];
    for (const e of wurzel.querySelectorAll('*')) {
      const r = e.getBoundingClientRect();
      if (r.right <= cw + 1 || r.width < 1 || r.height < 1) continue;
      let geklemmt = false;
      for (let p = e.parentElement; p && p !== D.body; p = p.parentElement) {
        const ox = cs(p).overflowX;
        if (ox !== 'visible') { geklemmt = true; break; }
      }
      if (geklemmt) continue;
      if (cs(e).position === 'fixed' && r.left >= cw) continue;
      if (!sichtbar(e)) continue;
      treffer.push(e);
    }
    const menge = new Set(treffer);
    const oben = treffer.filter((e) => !menge.has(e.parentElement));
    return oben.slice(0, 8).map((e) => { const r = e.getBoundingClientRect(); return sel(e) + ' w' + Math.round(r.width) + ' rechts' + Math.round(r.right); });
  }

  function lum(rgb) { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); }
  function farbe(s) { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  function hintergrund(e) {
    const schicht = [];
    for (let n = e; n; n = n.parentElement) {
      const s = cs(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null; // Verlauf/Bild: nicht gerechnet
      const c = farbe(s.backgroundColor);
      if (c && c[3] > 0) { schicht.push(c); if (c[3] >= 1) break; }
    }
    let b = [255, 255, 255];
    for (let i = schicht.length - 1; i >= 0; i--) { const c = schicht[i]; b = [0, 1, 2].map((k) => c[k] * c[3] + b[k] * (1 - c[3])); }
    return b;
  }

  async function verdeckt(alleZiele) {
    const H = W.innerHeight, cw = D.documentElement.clientWidth;
    // feste Leisten oben/unten bestimmen
    let oben = 0, unten = H;
    for (const e of D.querySelectorAll('body *')) {
      const s = cs(e); if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      if (!sichtbar(e)) continue; const r = e.getBoundingClientRect();
      if (r.width < cw * 0.6) continue;
      if (r.top <= 2 && r.bottom < H / 3) oben = Math.max(oben, r.bottom);
      if (r.bottom >= H - 2 && r.top > H * 2 / 3) unten = Math.min(unten, r.top);
    }
    const start = W.scrollY, gesehen = new Set(), funde = [];
    const max = D.documentElement.scrollHeight;
    let schritte = 0;
    for (let y = 0; y < max && schritte < 25; y += Math.max(200, unten - oben - 40), schritte++) {
      W.scrollTo({ top: y, behavior: 'instant' }); // html hat scroll-behavior:smooth; ohne Warten (Hintergrund-Tab drosselt Zeitgeber)
      for (const e of alleZiele) {
        if (gesehen.has(e)) continue;
        const r = e.getBoundingClientRect();
        const mx = r.left + r.width / 2, my = r.top + r.height / 2;
        if (my < oben + 2 || my > unten - 2 || mx < 0 || mx > cw) continue;
        // Mitte in einem eigenen Scrollbereich weggescrollt (z. B. Ergebnisliste im Deckbau): später/nie prüfen
        let weg = false;
        for (let p = e.parentElement; p && p !== D.body; p = p.parentElement) { const s = cs(p); if (s.overflowX !== 'visible' || s.overflowY !== 'visible') { const q = p.getBoundingClientRect(); if (mx < q.left || mx > q.right || my < q.top || my > q.bottom) { weg = true; break; } } }
        if (weg) continue;
        gesehen.add(e);
        const t = D.elementFromPoint(mx, my);
        if (!t || e.contains(t) || t.contains(e)) continue;
        const lbl = e.closest('label'); if (lbl && lbl.contains(t)) continue;
        if (e.labels && [...e.labels].some((l) => l.contains(t))) continue;
        funde.push(sel(e) + ' „' + txt(e).slice(0, 20) + '“ unter ' + sel(t));
      }
    }
    W.scrollTo({ top: start, behavior: 'instant' });
    return { oben: Math.round(oben), unten: Math.round(unten), geprueft: gesehen.size, funde };
  }

  async function messe(wurzel, name, mitScroll = true) {
    csCache.clear();
    // content-visibility:auto überspringt Layout außerhalb des Bildschirms (Kartenraster) —
    // für die Messung ausschalten, danach wieder entfernen.
    const cvStil = D.createElement('style'); cvStil.textContent = '*{content-visibility:visible !important}'; D.head.appendChild(cvStil);
    try {
    const cw = D.documentElement.clientWidth;
    const z = ziele(wurzel);
    const rz = z.map((e) => ({ e, r: rechteck(e) }));
    const u44 = rz.filter(({ r }) => r.width < 43.5 || r.height < 43.5);
    const u24 = rz.filter(({ r }) => r.width < 23.5 || r.height < 23.5);
    let eng = 0; const engBsp = [];
    for (const a of u24) {
      const ax = a.r.left + a.r.width / 2, ay = a.r.top + a.r.height / 2;
      for (const b of rz) {
        if (b === a) continue;
        const nx = Math.max(b.r.left, Math.min(ax, b.r.right)), ny = Math.max(b.r.top, Math.min(ay, b.r.bottom));
        if (Math.hypot(nx - ax, ny - ay) < 12) { eng++; if (engBsp.length < 4) engBsp.push(sel(a.e) + '↔' + sel(b.e)); break; }
      }
    }
    const bsp = (arr) => arr.slice(0, 5).map(({ e, r }) => sel(e) + ' „' + (txt(e) || e.getAttribute('aria-label') || e.title || '').slice(0, 18) + '“ ' + Math.round(r.width) + '×' + Math.round(r.height));

    const blaetter = [...wurzel.querySelectorAll('*')].filter((e) => { if (!eigenText(e)) return false; const tr = textRect(e); return tr && sichtbar(e, tr); }).slice(0, 8000);
    // abgeschnitten
    const ab = { mitEllipse: 0, ohneEllipse: 0, bsp: [] };
    for (const e of wurzel.querySelectorAll('*')) {
      if (e.scrollWidth <= e.clientWidth + 1 || e.clientWidth === 0) continue;
      const s = cs(e); if (s.overflowX === 'visible' || s.overflowX === 'auto' || s.overflowX === 'scroll') continue;
      if (!txt(e) || !sichtbar(e)) continue;
      // ohne eigenen Text nur zählen, wenn ein Text-Nachfahre über den Rand ragt (Zierbilder ausgenommen)
      if (!eigenText(e)) { const er = e.getBoundingClientRect(); const raus = [...e.querySelectorAll('*')].some((k) => eigenText(k) && (() => { const kr = k.getBoundingClientRect(); return kr.width > 0 && (kr.right > er.right + 1 || kr.left < er.left - 1); })()); if (!raus) continue; }
      if (s.textOverflow === 'ellipsis') ab.mitEllipse++; else { ab.ohneEllipse++; }
      if (ab.bsp.length < 5) ab.bsp.push(sel(e) + (s.textOverflow === 'ellipsis' ? ' …' : ' ✂') + ' „' + txt(e).slice(0, 24) + '“ ' + e.clientWidth + '/' + e.scrollWidth);
    }
    // Text-Überlappung
    const rb = blaetter.map((e) => ({ e, r: textRect(e) })).filter(({ r }) => r.right > 0 && r.left < cw);
    rb.sort((a, b) => a.r.top - b.r.top);
    let tu = 0; const tuBsp = [];
    for (let i = 0; i < rb.length; i++) {
      const a = rb[i];
      for (let j = i + 1; j < rb.length && rb[j].r.top < a.r.bottom; j++) {
        const b = rb[j];
        if (a.e.contains(b.e) || b.e.contains(a.e)) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 2 && h > 2 && w * h > 4) {
          // Zeilenkästen der Textknoten prüfen (inline über zwei Zeilen)
          const zr = (x) => { const rg = D.createRange(); const out = []; for (const n of x.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { rg.selectNodeContents(n); out.push(...rg.getClientRects()); } return out; };
          const la = zr(a.e), lb = zr(b.e);
          const echt = la.some((x) => lb.some((y) => Math.min(x.right, y.right) - Math.max(x.left, y.left) > 2 && Math.min(x.bottom, y.bottom) - Math.max(x.top, y.top) > 2));
          if (echt) { tu++; if (tuBsp.length < 4) tuBsp.push(sel(a.e) + ' „' + eigenText(a.e).slice(0, 14) + '“ × ' + sel(b.e) + ' „' + eigenText(b.e).slice(0, 14) + '“'); }
        }
      }
    }
    // Schrift < 11 und Kontrast
    const klein = {}; let kleinN = 0; const kleinBsp = [];
    let kontrastN = 0, kontrastGeprueft = 0; const kontrastBsp = [];
    for (const e of blaetter) {
      const s = cs(e); const fs = parseFloat(s.fontSize);
      if (fs < 11) { kleinN++; klein[fs.toFixed(2)] = (klein[fs.toFixed(2)] || 0) + 1; if (kleinBsp.length < 5) kleinBsp.push(sel(e) + ' ' + fs.toFixed(1) + 'px „' + eigenText(e).slice(0, 16) + '“'); }
      if (/^[\p{Extended_Pictographic}\s️]+$/u.test(eigenText(e))) continue;
      const c = farbe(s.color); const b = hintergrund(e); if (!c || !b) continue;
      const fg = [0, 1, 2].map((k) => c[k] * c[3] + b[k] * (1 - c[3]));
      const L1 = lum(fg), L2 = lum(b); const k = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const gross = fs >= 24 || (fs >= 18.66 && +s.fontWeight >= 700);
      kontrastGeprueft++;
      if (k < (gross ? 3 : 4.5)) { kontrastN++; if (kontrastBsp.length < 4) kontrastBsp.push(sel(e) + ' ' + k.toFixed(2) + ':1 „' + eigenText(e).slice(0, 14) + '“'); }
    }
    // Kopf
    const kopfEl = D.querySelector('header, .app-header, .site-header');
    const kr = kopfEl && sichtbar(kopfEl) ? kopfEl.getBoundingClientRect() : null;
    const v = mitScroll ? await verdeckt(z) : null;
    return {
      ansicht: name, breite: W.innerWidth, hoehe: Math.round(wurzel.getBoundingClientRect().height),
      quer: D.documentElement.scrollWidth > D.documentElement.clientWidth, scrollWidth: D.documentElement.scrollWidth,
      querVerursacher: ueberlauf(wurzel),
      ziele: z.length, unter44: u44.length, unter44Bsp: bsp(u44), unter24: u24.length, unter24Bsp: bsp(u24), eng24: eng, eng24Bsp: engBsp,
      abgeschnitten: ab, textUeberlapp: tu, textUeberlappBsp: tuBsp,
      verdeckt: v ? v.funde.length : 'nicht gemessen', verdecktBsp: v ? v.funde.slice(0, 5) : [], band: v ? [v.oben, v.unten, v.geprueft] : null,
      schriftUnter11: kleinN, schriftGroessen: klein, schriftBsp: kleinBsp,
      kontrastUnter: kontrastN, kontrastGeprueft, kontrastBsp,
      kopf: kr ? { sel: sel(kopfEl), hoehe: Math.round(kr.height), anteil: Math.round(kr.height / W.innerHeight * 100) + '%' } : null,
    };
    } finally { cvStil.remove(); }
  }

  async function ansicht(tab, unter) {
    W.scrollTo({ top: 0, behavior: 'instant' });
    const offen = location.hash.replace(/^#/, '').split('?')[0] === tab;
    if (!offen && typeof W.switchTabAndUpdateMenu === 'function') { W.switchTabAndUpdateMenu(tab); await warte(3000); }
    if (unter && typeof W.switchProfileTab === 'function') { W.switchProfileTab(unter); await warte(2500); }
    W.scrollTo({ top: 0, behavior: 'instant' }); await warte(200);
    const wurzel = (unter && (D.getElementById('profile-' + unter))) || D.getElementById(tab) || D.body;
    return messe(wurzel, tab + (unter ? '/' + unter : ''));
  }
  // Ohne Zeitgeber: misst die gerade offene Ansicht (im Hintergrund-Tab sind setTimeout-Wartezeiten
  // bis zu 1 min gedrosselt — dort erst wechseln, im NÄCHSTEN Aufruf hier() messen).
  async function hier(name) {
    const aktiv = D.querySelector('.tab-content.active');
    const pa = D.querySelector('.profile-tab-content.active');
    const wurzel = (aktiv && aktiv.id === 'profile' && pa) ? pa : (aktiv || D.body);
    return messe(wurzel, name || (wurzel.id || 'body'));
  }
  const HAUPT = ['current-meta', 'current-analysis', 'meta-call', 'city-league', 'past-meta', 'cards', 'proxy', 'calculator', 'side-quest', 'pocket', 'tutorial', 'quellen'];
  const PROFIL = ['collection', 'wishlist', 'tradelist', 'metabinder', 'custombinder', 'archetypbox', 'decks', 'deckcompare', 'deckbuilder', 'journal', 'testinggroups', 'masterclass', 'settings'];
  async function alle() { const aus = []; for (const t of HAUPT) aus.push(await ansicht(t)); for (const p of PROFIL) aus.push(await ansicht('profile', p)); return aus; }
  // Kurzzeile für die Tabelle
  const zeile = (m) => [m.ansicht, m.quer ? 'ja (' + m.querVerursacher.length + ')' : 'nein', m.unter44 + '/' + m.ziele, m.unter24, m.abgeschnitten.mitEllipse + '…/' + m.abgeschnitten.ohneEllipse + '✂', m.verdeckt + ' / Text ' + m.textUeberlapp, m.schriftUnter11, m.kopf ? m.kopf.hoehe + ' (' + m.kopf.anteil + ')' : '–'].join(' | ');
  W.__m390 = { ansicht, hier, messe, alle, zeile, HAUPT, PROFIL };
  return 'bereit ' + W.innerWidth;
})();
