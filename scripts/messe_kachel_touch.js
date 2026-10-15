/*
 * Kartenkacheln am Telefon messen — MIT Touch und MIT Kartenbild (UI-142, 15.10.2026)
 * ----------------------------------------------------------------------------
 * Warum es dieses Werkzeug gibt: UI-141 ging mit „Daten auf der Karte" live, und
 * auf Hausis iPhone verdeckten Band und Knoepfe die ganze Karte. Die Messung
 * vorher hatte zwei blinde Flecken, beide hier geschlossen:
 *
 *  1. Der Kopflos-Browser laedt keine Kartenbilder (CDN nicht erreichbar) —
 *     die Kachel fiel auf die Hoehe der Knoepfe zusammen, das Verhaeltnis
 *     Bild/Ueberlagerung war nie zu sehen. Hier werden ALLE Bildanfragen
 *     ausserhalb des eigenen Servers mit einem 245x342-Platzhalter beantwortet
 *     (das Seitenverhaeltnis einer Pokémon-Karte); der Service Worker ist
 *     abgeschaltet, sonst laeuft die Anfrage an ihm vorbei.
 *  2. `pointer: coarse` wurde nicht emuliert — die 44-px-Regeln aus
 *     css/tippziele.css (`button:not(…) { min-height: 44px !important }`) und
 *     css/styles.css (`@media (hover: none) and (pointer: coarse)`) griffen
 *     nie. Hier per CDP `Emulation.setEmulatedMedia` (pointer: coarse,
 *     hover: none), nachgeprueft ueber matchMedia in der Seite.
 *
 * Aufruf (lokaler Server: python3 -m http.server 8765):
 *   node scripts/messe_kachel_touch.js [hell|dunkel] [touch|maus] [bild.png] [Deck] [cm|cl]
 * Ausgabe: JSON mit Medienabfragen, Spalten, Kachel-/Bild-/Band-/Knopfmassen
 * und „verdeckt" (Anteil der Infoleiste am Bild) — plus ein Ausschnitt-Bild.
 *
 * GEMESSEN 15.10.2026 (390 px, dunkel, touch, Dragapult):
 *   vorher  Knoepfe 44 px, Band 33 px (zweizeilig), Infoleiste 135 px = 101 % des Bildes
 *   nachher Knoepfe 18 px, Band 17 px,              Infoleiste  57 px =  43 % des Bildes
 *   „Dein Deck" (Referenz, gleiche Seite): Knoepfe 15 px, Band 13 px, 47 von 124 px = 38 %
 */
'use strict';
const { chromium } = require('playwright');

const [schema = 'dunkel', zeiger = 'touch', out = '', deck = 'Dragapult', raum = 'cm'] = process.argv.slice(2);
const R = raum === 'cl'
    ? { tab: 'city-league-analysis', select: 'cityLeagueDeckSelect', grid: 'cityLeagueDeckGrid' }
    : { tab: 'current-analysis', select: 'currentMetaDeckSelect', grid: 'currentMetaDeckGrid' };
const BASIS = process.env.BASIS || 'http://127.0.0.1:8765';

(async () => {
    // Ohne passenden Browser zur Repo-Version: PW_CHROMIUM=/opt/pw-browsers/chromium
    // (oder ein anderer Chromium-Pfad) zeigt auf einen vorhandenen.
    const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    // Platzhalter-Karte 245x342 aus einem Canvas, damit kein Binaerbild im Repo liegt.
    const mal = await b.newPage();
    const dataUrl = await mal.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 245; c.height = 342;
        const g = c.getContext('2d');
        g.fillStyle = '#d6c478'; g.fillRect(0, 0, 245, 342);
        g.strokeStyle = '#5a4614'; g.lineWidth = 4; g.strokeRect(8, 8, 229, 326);
        g.fillStyle = '#78aadc'; g.fillRect(20, 40, 205, 150);
        g.strokeStyle = '#645a3c'; g.lineWidth = 2;
        for (let y = 200; y < 330; y += 14) { g.beginPath(); g.moveTo(20, y); g.lineTo(225, y); g.stroke(); }
        g.fillStyle = '#281e0a'; g.font = '12px sans-serif'; g.fillText('KARTE 245x342', 24, 28);
        return c.toDataURL('image/png');
    });
    await mal.close();
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');

    const touch = zeiger === 'touch';
    const ctx = await b.newContext({
        viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
        colorScheme: schema === 'hell' ? 'light' : 'dark',
        isMobile: touch, hasTouch: touch, locale: 'de-DE', serviceWorkers: 'block',
    });
    const p = await ctx.newPage();
    let platzhalter = 0;
    await p.route(/\.(jpg|jpeg|png|webp)(\?.*)?$/i, (route) => {
        if (route.request().url().startsWith(BASIS)) return route.continue();
        platzhalter++;
        return route.fulfill({ status: 200, contentType: 'image/png', body: png });
    });
    if (touch) {
        const cdp = await ctx.newCDPSession(p);
        await cdp.send('Emulation.setEmulatedMedia', {
            features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }],
        });
    }
    await p.goto(`${BASIS}/index.html#${R.tab}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(2500);
    await p.evaluate(async ([deckName, raumInfo]) => {
        const l = document.getElementById('dipidis-loader'); if (l) l.remove();
        document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
        document.getElementById(raumInfo.tab).classList.add('active');
        const s = document.getElementById(raumInfo.select);
        for (let i = 0; i < 40 && s.options.length < 2; i++) await new Promise((r) => setTimeout(r, 250));
        s.value = deckName; s.dispatchEvent(new Event('change', { bubbles: true }));
    }, [deck, R]);
    await p.waitForTimeout(5000);
    // Die Kartenbilder sind `loading="lazy"`: erst ins Bild rollen, dann warten,
    // bis das erste geladen ist — sonst misst man das CSS, nicht die Karte.
    await p.evaluate(async (raumInfo) => {
        const grid = document.querySelector(`#${raumInfo.grid} .deck-grid-skeleton-grid`);
        if (!grid) return;
        grid.scrollIntoView();
        const img = grid.querySelector('img');
        for (let i = 0; i < 40 && !(img && img.complete && img.naturalWidth > 0); i++) {
            await new Promise((r) => setTimeout(r, 250));
        }
    }, R);

    const r = await p.evaluate((raumInfo) => {
        const mq = (q) => matchMedia(q).matches;
        const grid = document.querySelector(`#${raumInfo.grid} .deck-grid-skeleton-grid`);
        if (!grid) return { fehler: 'kein Gitter — Deckname falsch oder noch nicht geladen' };
        const k = grid.querySelector('.city-league-card-item');
        const img = k.querySelector('img');
        const box = (el) => { const b2 = el.getBoundingClientRect(); return { w: +b2.width.toFixed(1), h: +b2.height.toFixed(1) }; };
        const info = k.querySelector('.city-league-card-info-bottom');
        const band = k.querySelector('.city-league-card-info-text');
        const btns = [...k.querySelectorAll('.city-league-card-action-btn')].filter((x) => x.offsetParent !== null);
        return {
            medien: { coarse: mq('(pointer: coarse)'), hoverNone: mq('(hover: none)'), breit768: mq('(max-width: 768px)') },
            spalten: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
            kachel: box(k),
            bild: { ...box(img), natural: `${img.naturalWidth}x${img.naturalHeight}` },
            info: box(info), band: { ...box(band), text: band.textContent.replace(/\s+/g, ' ').trim() },
            knoepfe: btns.map((x) => ({ t: x.textContent.trim(), ...box(x) })),
            verdeckt: `${Math.round(info.getBoundingClientRect().height / img.getBoundingClientRect().height * 100)} % des Bildes`,
            gridTop: Math.round(grid.getBoundingClientRect().top + window.scrollY),
        };
    }, R);
    r.platzhalterBilder = platzhalter;
    if (r.bild && r.bild.natural === '0x0') r.warnung = 'Kartenbild NICHT geladen — Bildmasse kommen nur aus dem CSS';
    console.log(JSON.stringify(r, null, 1));
    if (out && r.gridTop) {
        await p.screenshot({ path: out, fullPage: true, clip: { x: 0, y: Math.max(0, r.gridTop - 40), width: 390, height: 520 } });
        console.log('Bild:', out);
    }
    await b.close();
})();
