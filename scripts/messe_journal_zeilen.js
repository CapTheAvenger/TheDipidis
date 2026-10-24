/*
 * Battle-Journal-Match-Zeilen am Telefon messen (UI-150, 24.10.2026) — echtes Markup aus renderJournalHistory,
 * 390 px (oder `breite`), MIT Touch. Prueft je Zeile: ragt ein Knopf ueber den Rand der Zeile, ragt Beschriftung
 * ueber den Rand ihres Knopfes, ueberlappen sich Knoepfe, Mindesthoehe der Knoepfe, Querscroll.
 * Aufruf (Server: python3 -m http.server 8765):
 *   node scripts/messe_journal_zeilen.js [hell|dunkel] [de|en] [breite] [bild.png] [touch|maus]
 */
'use strict';
const { chromium } = require('playwright');
const [schema = 'dunkel', sprache = 'de', breite = '390', out = '', zeiger = 'touch'] = process.argv.slice(2);
const BASIS = process.env.BASIS || 'http://127.0.0.1:8765';
(async () => {
    const b = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
    const touch = zeiger === 'touch';
    const ctx = await b.newContext({ viewport: { width: +breite, height: 844 }, deviceScaleFactor: 2,
        colorScheme: schema === 'hell' ? 'light' : 'dark', isMobile: touch, hasTouch: touch, locale: sprache === 'de' ? 'de-DE' : 'en-GB', serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.abort());
    if (touch) {
        const cdp = await ctx.newCDPSession(p);
        await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }, { name: 'hover', value: 'none' }] });
    }
    await p.goto(`${BASIS}/index.html`, { waitUntil: 'domcontentloaded' });
    await p.evaluate((s) => { try { localStorage.setItem('language', s); localStorage.setItem('lang', s); } catch (e) {} }, sprache);
    await p.waitForTimeout(2500);
    const r = await p.evaluate(async () => {
        const l = document.getElementById('dipidis-loader'); if (l) l.remove();
        const liste = document.getElementById('journalHistoryList');
        document.documentElement.classList.remove('is-signed-out');
        document.querySelectorAll('.d-none').forEach((x) => x.classList.remove('d-none'));
        for (let e = liste; e && e !== document.body; e = e.parentElement) {
            e.style.setProperty('display', 'block', 'important'); e.classList.add('active'); e.hidden = false;
        }
        document.querySelectorAll('.tab-content').forEach((t) => { if (!t.contains(liste)) t.classList.remove('active'); });
        const jetzt = Date.now(), m = (i, o) => Object.assign({ id: 'T' + i, ownDeck: 'Sharpedo Toxtricity GttG 1026', opponentArchetype: 'Dragapult', result: 'win', turnOrder: 'first',
            bestOf: 'bo1', createdAtMs: jetzt - i * 36e5, tournamentName: 'TESTTURNIER GttG Potsdam', meta: 'TEF-30C', brick: false, mulligan: false, notes: '' }, o);
        window._bjSetCache([
            m(1), m(2, { opponentArchetype: 'Dhelmise', result: 'win' }), m(3, { result: 'loss', brick: true, turnOrder: 'second' }),
            m(4, { result: 'tie', bestOf: 'bo3', bo3Games: [{ turnOrder: 'first', result: 'win' }, { turnOrder: 'second', result: 'loss', brick: true }, { turnOrder: 'first', result: 'tie', notes: 'lange Notiz zum dritten Spiel mit etwas mehr Text' }] }),
            m(5, { result: 'win', noShow: true, opponentArchetype: '', notes: 'Gegner nicht erschienen, Notiz in einer etwas längeren Zeile damit sie umbricht' }),
            m(6, { ownDeck: 'Mega Excadrill Frankfurt Sep 26 mit sehr langem Namen', opponentArchetype: 'Ogerpon Meganium Arboliva Teal Mask', mulligan: true, tournamentName: 'TESTTURNIER Frankfurt Side Events' }),
        ]);
        window.renderJournalHistory();
        await new Promise((x) => setTimeout(x, 600));
        const zeilen = [...document.querySelectorAll('.bj-history-item')];
        zeilen[0].scrollIntoView({ block: 'start' });
        const bx = (e) => e.getBoundingClientRect();
        const probleme = [];
        zeilen.forEach((z, i) => {
            const zr = bx(z), kn = [...z.querySelectorAll('.bj-history-actions button, .bj-history-actions .battle-journal-result-pill')];
            kn.forEach((k) => {
                const q = bx(k), n = (k.className.split(' ')[0] || k.tagName) + ' ' + (k.textContent || '').trim().slice(0, 10);
                if (q.right > zr.right + 0.5 || q.left < zr.left - 0.5) probleme.push(`zeile ${i}: ${n} ragt aus der Zeile (${Math.round(q.left)}..${Math.round(q.right)} gegen ${Math.round(zr.left)}..${Math.round(zr.right)})`);
                if (k.scrollWidth > k.clientWidth + 1) probleme.push(`zeile ${i}: Beschriftung "${n}" ragt aus dem Knopf (${k.scrollWidth}>${k.clientWidth})`);
                if (q.height < 28 && !/pill/.test(n)) probleme.push(`zeile ${i}: ${n} nur ${Math.round(q.height)} px hoch`);
            });
            for (let a = 0; a < kn.length; a++) for (let c = a + 1; c < kn.length; c++) {
                const A = bx(kn[a]), B = bx(kn[c]);
                if (A.left < B.right - 0.5 && B.left < A.right - 0.5 && A.top < B.bottom - 0.5 && B.top < A.bottom - 0.5) probleme.push(`zeile ${i}: Knoepfe ${a}/${c} ueberlappen`);
            }
            const hauptR = bx(z.querySelector('.bj-history-item-main')), akt = bx(z.querySelector('.bj-history-actions'));
            if (akt.left < hauptR.right - 0.5 && akt.top < hauptR.bottom - 0.5 && hauptR.top < akt.bottom - 0.5) probleme.push(`zeile ${i}: Knoepfe liegen ueber dem Text`);
        });
        const h = zeilen.map((z) => Math.round(bx(z).height));
        const kn0 = [...zeilen[0].querySelectorAll('.bj-history-actions > *')].map((k) => `${(k.textContent || '').trim().slice(0, 9)} ${Math.round(bx(k).width)}x${Math.round(bx(k).height)}`);
        return { coarse: matchMedia('(pointer: coarse)').matches, lang: document.documentElement.lang, zeilen: zeilen.length, hoehen: h, knoepfeZeile0: kn0,
            quer: document.documentElement.scrollWidth - innerWidth, probleme };
    });
    console.log(JSON.stringify(r));
    if (out) { const e = await p.$('.bj-history-item'); const par = await e.evaluateHandle((x) => x.parentElement); await par.asElement().screenshot({ path: out }); }
    await b.close();
})();
