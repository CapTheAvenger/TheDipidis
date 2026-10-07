// WZ-31 (Hausi 07.10.2026: „erst als Warnung“): 390-px-Pruefung im Deploy.
//
// Laedt die gebaute Seite (_site) bei 390 x 844 und misst je Ansicht:
//   quer     documentElement.scrollWidth > clientWidth (Festlegung A: am Handy
//            nirgends seitlich scrollen) und die verursachenden Elemente
//   klein    sichtbare Texte unter 11 px (Schriftboden der Seite)
// Ergebnis als ::warning:: und in der Schrittzusammenfassung. Rueckgabe IMMER 0:
// eine Warnung haelt den Deploy nicht an. Wird sie zur Sperre, ist das eine
// neue Entscheidung von Hausi.
//
// Textueberlappung (dritter Wunsch aus M3 Premium 1) misst dieses Skript NICHT —
// das braucht eine eigene Regel, sonst meldet es jede absichtlich ueberlagerte
// Plakette.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ANSICHTEN = ['current-meta', 'current-analysis', 'city-league', 'past-meta',
    'meta-call', 'cards', 'quellen', 'side-quest', 'profile'];
export const SCHRIFTBODEN = 11;

/** Messung einer Ansicht -> Warnzeilen (rein, ohne Browser; getestet). */
export function befunde(ansicht, m) {
    const zeilen = [];
    if (!m) return [`${ansicht}: nicht gemessen`];
    if (m.breite !== 390) zeilen.push(`${ansicht}: Breite ${m.breite} statt 390 — Messung unsicher`);
    if (m.quer) zeilen.push(`${ansicht}: seitlicher Bildlauf (${m.scrollBreite} > 390) — ${m.querVerursacher.slice(0, 3).join(', ')}`);
    if (m.klein.length) zeilen.push(`${ansicht}: ${m.klein.length} Text(e) unter ${SCHRIFTBODEN} px — ${m.klein.slice(0, 3).join(', ')}`);
    return zeilen;
}

/** Laeuft im Browser. Muss ohne Abhaengigkeiten auskommen. */
export function messeImBrowser(boden) {
    const de = document.documentElement;
    const breite = window.innerWidth;
    const sichtbar = (el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const s = getComputedStyle(el);
        return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
    };
    const name = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
        + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '');
    const quer = de.scrollWidth > de.clientWidth + 1;
    const querVerursacher = [];
    if (quer) {
        for (const el of document.querySelectorAll('body *')) {
            if (!sichtbar(el)) continue;
            const r = el.getBoundingClientRect();
            if (r.right > de.clientWidth + 1 && (!el.parentElement
                || el.parentElement.getBoundingClientRect().right <= de.clientWidth + 1)) {
                querVerursacher.push(name(el));
                if (querVerursacher.length >= 5) break;
            }
        }
    }
    const klein = [];
    const gang = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (gang.nextNode()) {
        const t = gang.currentNode;
        if (!t.textContent.trim()) continue;
        const el = t.parentElement;
        if (!el || !sichtbar(el)) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < boden - 0.05) klein.push(name(el) + ' ' + px.toFixed(1) + ' px');
        if (klein.length >= 50) break;
    }
    return { breite, quer, scrollBreite: de.scrollWidth, querVerursacher, klein };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };

function server(dir, port) {
    const s = http.createServer((req, res) => {
        let p = decodeURIComponent((req.url || '/').split('?')[0]);
        if (p.endsWith('/')) p += 'index.html';
        const f = path.join(dir, p);
        if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
            res.writeHead(404).end(); return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
        fs.createReadStream(f).pipe(res);
    });
    return new Promise((ok) => s.listen(port, '127.0.0.1', () => ok(s)));
}

async function main() {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.argv[2] || '../_site');
    const port = parseInt(process.env.PRUEF_390_PORT || '5545', 10);
    const zusammenfassung = process.env.GITHUB_STEP_SUMMARY;
    const alle = [];
    let srv, browser;
    try {
        const { default: puppeteer } = await import('puppeteer');
        srv = await server(dir, port);
        browser = await puppeteer.launch({ headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });
        const page = await browser.newPage();
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        await page.setRequestInterception(true);
        page.on('request', (r) => (/^http:\/\/127\.0\.0\.1/.test(r.url()) || r.url().startsWith('data:'))
            ? r.continue() : r.abort());
        await page.evaluateOnNewDocument(() => { try { localStorage.setItem('app_lang', 'de'); } catch (e) { /* egal */ } });
        for (const a of ANSICHTEN) {
            let m = null;
            try {
                await page.goto(`http://127.0.0.1:${port}/index.html#${a}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
                await new Promise((r) => setTimeout(r, 8000));
                m = await page.evaluate(messeImBrowser, SCHRIFTBODEN);
            } catch (e) {
                console.log(`${a}: Messung fehlgeschlagen (${e && e.message})`);
            }
            const z = befunde(a, m);
            alle.push(...z);
            console.log(`${a}: ${z.length ? z.join(' | ') : 'ok'}`);
        }
    } catch (e) {
        alle.push(`390-px-Pruefung nicht gelaufen: ${e && e.message}`);
    } finally {
        if (browser) await browser.close().catch(() => {});
        if (srv) srv.close();
    }
    for (const z of alle) console.log(`::warning::390 px ${z}`);
    if (zusammenfassung) {
        fs.appendFileSync(zusammenfassung, `\n## 390-px-Pruefung (Warnung, haelt nichts an)\n\n`
            + (alle.length ? alle.map((z) => `- ${z}`).join('\n') : `Alle ${ANSICHTEN.length} Ansichten ohne Befund.`) + '\n');
    }
    return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().then(() => process.exit(0), () => process.exit(0));
}
