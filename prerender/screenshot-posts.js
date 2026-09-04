#!/usr/bin/env node
/*
 * AUFNAHMEN FÜR DIE POST-VORLAGEN — Telefonformat, deutsch
 * ========================================================
 *
 * WARUM EIGENES SKRIPT UND NICHT screenshot-tutorial.js
 * -----------------------------------------------------
 * Das Anleitungsskript schießt in 1280 × 720 (Schreibtisch), weil die
 * Anleitung im Fließtext gelesen wird und dort die volle Breite Sinn
 * ergibt. Ein Instagram-Post ist 1080 × 1350 hoch — eine 16:9-Aufnahme
 * darin ist 968 px breit, und der Text darauf steht bei 2560 px
 * Aufnahmebreite auf gut ein Drittel geschrumpft. Gemessen am
 * 04.09.2026 an der ersten Fassung der Vorlage: lesbar war die Form der
 * Ansicht, nicht ihr Inhalt.
 *
 * Im Telefonformat passt die Aufnahme dagegen HOCH ins Bild, und die
 * Schrift steht fast in Originalgröße. Deshalb 440 × 956 — das Maß, in
 * dem am 03.09.2026 auch die Tier-Liste vermessen wurde (iPhone 17 Pro
 * Max), damit die Aufnahmen dieselbe Ansicht zeigen wie die, die auf
 * einem echten Telefon steht.
 *
 * Die beiden Skripte teilen sich bewusst keinen Code: das andere ist an
 * fünf Testdateien verdrahtet (siehe CLAUDE.md), und ein gemeinsamer
 * Rumpf für zwei verschiedene Zwecke hätte beide unsicherer gemacht.
 *
 * AUFRUF
 * ------
 *     node prerender/screenshot-posts.js
 *
 * Legt die Bilder unter images/posts/de/ ab. Der eingebaute Server
 * liefert das Repo selbst aus — es braucht keine laufende Seite.
 */

// prerender/package.json setzt "type": "module" — deshalb import,
// nicht require. Das Anleitungsskript daneben tut dasselbe.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'images', 'posts', 'de');
const PORT = 8931;
const DPR = 2;

// Das Maß eines echten Telefons, nicht ein rundes Wunschmaß.
const VIEWPORT = { width: 440, height: 956 };

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.webp': 'image/webp', '.svg': 'image/svg+xml', '.csv': 'text/csv; charset=utf-8',
    '.woff2': 'font/woff2', '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
};

function startStaticServer() {
    const server = http.createServer((req, res) => {
        let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
        if (urlPath.endsWith('/')) urlPath += 'index.html';
        const filePath = path.join(REPO_ROOT, urlPath);
        if (!filePath.startsWith(REPO_ROOT)) { res.writeHead(403).end(); return; }
        if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
            res.writeHead(404).end(); return;
        }
        const stat = fs.statSync(filePath);
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream',
            'Content-Length': stat.size,
        });
        fs.createReadStream(filePath).pipe(res);
    });
    return new Promise((ok) => server.listen(PORT, () => ok(server)));
}

/* Jede Aufnahme sagt, wohin sie geht und was vorher auf dem Schirm
 * stehen muss. Ohne `drive` schießt das Skript eine halb geladene
 * Ansicht — die Seite holt ihre Zahlen nach. */
const AUFNAHMEN = [
    {
        // Die Meta-Performance-Tabelle: Listen, Anteil, Win Rate,
        // Turnier-Antritte, Top 8 — je Deck eine Zeile.
        // Der Dateiname sagt, was drauf ist. Die erste Fassung hiess
        // "tierliste.png" und zeigte diese Tabelle; ein falsch benannter
        // Screenshot ist schlimmer als ein fehlender, weil er beim
        // Aussuchen der Vorlage nicht noch einmal angesehen wird.
        datei: 'meta-performance.png', hash: 'current-meta',
        drive: async (page) => {
            await page.waitForTimeout(9000);
            await page.evaluate(() => {
                for (const b of document.querySelectorAll('button.ds-sec-hd'))
                    if (b.getAttribute('aria-expanded') === 'false') b.click();
            });
            await page.waitForTimeout(1800);
            await page.evaluate(() => {
                const k = document.querySelector('.arc-card--inline');
                if (k) k.scrollIntoView({ block: 'start' });
                window.scrollBy(0, -60);
            });
            await page.waitForTimeout(700);
        },
    },
    {
        // Der Kopf des aktuellen Metas: Datenraum, Format, Stichprobe
        // und die meistgespielten Decks. Hiess in der ersten Fassung
        // "heatmap.png" — die Heatmap sitzt weiter unten, und der
        // Selektor traf sie auf dem Telefon nicht.
        datei: 'meta-uebersicht.png', hash: 'current-meta',
        drive: async (page) => {
            await page.waitForTimeout(9000);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(900);
        },
    },
    {
        datei: 'meta-call.png', hash: 'meta-call',
        drive: async (page) => { await page.waitForTimeout(9000); },
    },
    {
        datei: 'champions.png', hash: 'champions',
        drive: async (page) => {
            await page.waitForTimeout(6000);
            await page.evaluate(() => {
                const t = [...document.querySelectorAll('button.side-quest-subtab')]
                    .find(b => /Teams/i.test(b.textContent));
                if (t) t.click();
            });
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo(0, 220));
        },
    },
    {
        datei: 'kartendatenbank.png', hash: 'cards',
        drive: async (page) => { await page.waitForTimeout(8000); },
    },
];

(async () => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const server = await startStaticServer();
    // PLAYWRIGHT_BROWSERS_PATH zeigt in dieser Umgebung auf einen
    // vorinstallierten Chromium; findet Playwright ihn nicht selbst,
    // sagt es der Pfad. `npx playwright install` ist hier gesperrt.
    const browser = await chromium.launch({
        args: ['--no-sandbox'],
        ...(process.env.CHROMIUM_PFAD ? { executablePath: process.env.CHROMIUM_PFAD } : {}),
    });
    let gemacht = 0;
    try {
        for (const a of AUFNAHMEN) {
            const ctx = await browser.newContext({
                viewport: VIEWPORT, deviceScaleFactor: DPR,
                isMobile: true, hasTouch: true, serviceWorkers: 'block',
            });
            // Deutsch und dunkel — so sehen die Posts aus, und so sieht
            // die Seite aus, wenn jemand über Instagram kommt.
            await ctx.addInitScript(() => {
                try {
                    localStorage.setItem('app_lang', 'de');
                    localStorage.setItem('theme', 'dark');
                } catch (_) { /* privater Modus: dann eben Vorgabe */ }
            });
            const page = await ctx.newPage();
            await page.goto(`http://127.0.0.1:${PORT}/#${a.hash}`,
                { waitUntil: 'domcontentloaded', timeout: 60000 });
            await a.drive(page);
            const ziel = path.join(OUT_DIR, a.datei);
            await page.screenshot({ path: ziel });
            const kb = Math.round(fs.statSync(ziel).size / 1024);
            console.log(`  ${a.datei.padEnd(22)} ${VIEWPORT.width}x${VIEWPORT.height}@${DPR}x  ${kb} KB`);
            gemacht++;
            await ctx.close();
        }
    } finally {
        await browser.close();
        server.close();
    }
    console.log(`${gemacht} von ${AUFNAHMEN.length} Aufnahmen in images/posts/de/`);
    process.exit(gemacht === AUFNAHMEN.length ? 0 : 1);
})();
