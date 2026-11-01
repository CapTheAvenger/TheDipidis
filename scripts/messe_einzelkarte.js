/* UI-157: misst die Einzelkarten-Ansicht (#singleCardModal) bei Handybreiten.
   Aufruf: PW_CHROMIUM=... node scripts/messe_einzelkarte.js [port]
   Ausgabe je Breite eine Zeile: Kopf der Karte sichtbar? Ende der Liste erreichbar? */
const { chromium } = require('playwright');
const port = process.argv[2] || '8765';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
  for (const [w, h] of [[320, 568], [375, 667], [390, 844], [430, 932]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
    await p.route('**/*', r => new RegExp('localhost:' + port).test(r.request().url()) ? r.continue() : r.abort());
    await p.goto('http://localhost:' + port + '/#cards', { waitUntil: 'load' });
    await p.waitForTimeout(5000);
    const r = await p.evaluate(async () => {
      const img = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="734" height="1024"><rect width="734" height="1024" fill="#7a5"/></svg>');
      showSingleCard(img, 'Testkarte', { name: 'Testkarte', image_url: img, set_code: 'PRE', set_number: '44' });
      for (let i = 0; i < 30; i++) { const im = document.querySelector('#singleCardModal .single-card-modal-content img'); if (im && im.complete && im.naturalWidth > 0) break; await new Promise(r => setTimeout(r, 100)); }
      await new Promise(r => setTimeout(r, 500));
      const m = document.getElementById('singleCardModal');
      const c = m.querySelector('.single-card-modal-content');
      // „Gespielt in“ nachbilden: 12 Zeilen wie im Screenshot (nur Messzweck)
      const li = Array.from({ length: 20 }, (_, i) => '<li><span>Deck ' + i + '</span><span>100 %</span></li>').join('');
      const kgi = document.createElement('div'); kgi.className = 'karten-gespielt-in';
      kgi.innerHTML = '<div class="kgi-titel">Gespielt in</div><ul>' + li + '</ul>';
      (c.parentElement === m ? c : c).appendChild(kgi);
      await new Promise(r => setTimeout(r, 200));
      const kopf = c.querySelector('img').getBoundingClientRect().top;
      const sc = m.scrollHeight > m.clientHeight + 1;
      m.scrollTop = m.scrollHeight;
      await new Promise(r => setTimeout(r, 200));
      const ende = kgi.getBoundingClientRect().bottom;
      return { kopfOben: Math.round(kopf), scrollbar: sc, listeEndeUnten: Math.round(ende), fenster: innerHeight, scrollTopMax: m.scrollTop };
    });
    const ok = r.kopfOben >= 0 && r.listeEndeUnten <= r.fenster;
    console.log(w + 'x' + h, JSON.stringify(r), ok ? 'OK' : 'FEHLER');
    await p.close();
  }
  await b.close();
})();
