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
/* SPRACHE ALS SCHALTER, NICHT ALS ZWEITE DATEI.
 *
 * Der Betreiber am 05.09.2026: "thedipidis posts kann doch ruhig auf
 * englisch sein, weil Instagram auf englisch machen macht schon mehr
 * sinn". Die Vorlagen sind damit englisch — und eine englische Vorlage
 * mit einer deutschen Aufnahme darin waere genau der Bruch, den die
 * erste Fassung dieses Skripts fuer die andere Richtung vermieden hat.
 *
 *     node prerender/screenshot-posts.js        -> images/posts/en/
 *     node prerender/screenshot-posts.js de     -> images/posts/de/
 *
 * Die deutschen Aufnahmen bleiben, weil die Anleitung sie benutzt. */
const SPRACHE = (process.argv[2] || 'en').toLowerCase() === 'de' ? 'de' : 'en';
const OUT_DIR = path.join(REPO_ROOT, 'images', 'posts', SPRACHE);
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
/* JEDE AUFNAHME SAGT, WOHIN SIE GEHT UND WAS VORHER AUF DEM SCHIRM
 * STEHEN MUSS. Ohne `drive` schiesst das Skript eine halb geladene
 * Ansicht — die Seite holt ihre Zahlen nach.
 *
 * NACHGESCHAERFT (05.09.2026). Betreiber zur ersten Fassung: "guck mal
 * das die Screenshots dann auch gut sind, weil das Beispiel ist jetzt
 * schon nicht so cool". Er hatte recht, und der Grund war messbar: in
 * der Aufnahme `meta-uebersicht.png` standen ueber den ersten Deckdaten
 * 380 der 956 Bildpunkte Kopfzeile, Werkzeugleiste, Datumsfilter und
 * Formatwahl — 40 % des Bildes zeigten die Huelle statt den Inhalt.
 *
 * Zwei Griffe beheben das, und beide stehen jetzt in `vorbereiten`:
 *
 *   (a) Die klebende Kopfleiste und die Werkzeugreihe werden fuer die
 *       Aufnahme ausgeblendet. Sie wandern beim Scrollen mit und
 *       fressen sonst oben immer denselben Streifen.
 *   (b) Es wird auf das ELEMENT gescrollt, um das es geht, statt auf
 *       eine Pixelzahl. Eine Pixelzahl stimmt genau so lange, bis
 *       jemand eine Zeile ueber der Ansicht einfuegt.
 *
 * Was NICHT ausgeblendet wird: alles, was die Zahl erklaert — Nenner,
 * Datenstand, Formatangabe. Ein Post ohne die bleibt unbelegt. */
/* NACHGEMESSEN, statt geraten (05.09.2026): auf dieser Seite ist genau
 * EIN Element fest verankert — `nav.ds-tabbar` am unteren Rand, 45 px
 * hoch. Die Kopfzeile scrollt normal mit. Die erste Fassung dieser
 * Liste blendete sieben erfundene Klassennamen aus und traf keinen
 * davon; das Bild sah danach genauso aus wie vorher.
 *
 * Die Fussleiste BLEIBT stehen. Sie kostet 45 von 956 Punkten und sagt
 * dem Betrachter auf einen Blick, dass er eine App sieht und keine
 * Tabelle. Weg muss stattdessen die Kopfzeile — und die geht weg, indem
 * man an ihr vorbeiscrollt, nicht indem man sie versteckt. */
const VERSTECKEN = `
  html, body { scroll-behavior: auto !important; }
  #cookie-banner, .cookie-banner, .install-hint { display: none !important; }
`;

async function vorbereiten(page, wartems) {
    await page.waitForTimeout(wartems);
    await page.addStyleTag({ content: VERSTECKEN });
    await putzen(page);
    await page.waitForTimeout(400);
}

/* KAPUTTE BILDER UND TEILEN-KNOEPFE RAUS.
 *
 * BEFUND (05.09.2026, an der ersten englischen Aufnahmeserie): in
 * `meta-performance.png` standen neben jedem Deckname zwei graugruene
 * Platzhalter — die Archetyp-Sprites laden von limitlesstcg, und aus
 * dieser Umgebung ist der Host nicht erreichbar. Ein Post mit drei
 * kaputten Bildsymbolen sieht nach einer kaputten Seite aus, obwohl die
 * Seite in Ordnung ist.
 *
 * Weggelassen wird nur, was NICHT geladen hat (naturalWidth === 0) —
 * ein pauschales Ausblenden aller Sprites haette auch die Aufnahmen
 * beschnitten, die auf einer Maschine mit Netz entstehen.
 *
 * Dazu die "Bild"-Knoepfe: sie teilen die Kachel als Bild und sind auf
 * einem Bild, das selbst geteilt wird, sinnlose Huelle. */
/* SIND DIE ARCHETYP-SPRITES ERREICHBAR?
 *
 * Sie liegen auf r2.limitlesstcg.net. Aus einer Umgebung ohne Netz
 * zeichnet der Browser fuer jedes einen Platzhalter, und ein Post mit
 * zwanzig grauen Bildsymbolen sieht nach einer kaputten Seite aus.
 *
 * Einzeln nach dem Laden auszublenden reicht NICHT: Heatmap und
 * Feldtabelle zeichnen ihre Zeilen beim Scrollen nach, und die naechste
 * Fuhre Platzhalter steht schon wieder im Bild. Eine CSS-Regel gilt
 * dagegen auch fuer alles, was danach entsteht.
 *
 * Die Regel wird nur gesetzt, wenn eine Probe wirklich scheitert — auf
 * einer Maschine MIT Netz bleiben die Sprites drin, wo sie hingehoeren. */
async function spritesErreichbar(page) {
    return page.evaluate(() => new Promise((ok) => {
        const i = new Image();
        i.onload = () => ok(true);
        i.onerror = () => ok(false);
        i.src = 'https://r2.limitlesstcg.net/pokemon/gen9/dragapult.png?p=' + Date.now();
        setTimeout(() => ok(false), 6000);
    }));
}

async function putzen(page) {
    await page.evaluate(() => {
        let weg = 0;
        for (const img of document.images) {
            if (img.complete && img.naturalWidth === 0) { img.style.display = 'none'; weg++; }
        }
        for (const b of document.querySelectorAll('button, a')) {
            const t = (b.textContent || '').trim();
            /* Der Knopf traegt ein Symbol vor dem Wort ("▨ Image"), also
               nicht auf Gleichheit pruefen. */
            if (/^\W*\s*(Bild|Image|Teilen|Share)\s*$/i.test(t)) b.style.display = 'none';
        }
        return weg;
    });
}

/* Auf ein Element scrollen, das man am Text erkennt — nicht auf eine
 * Pixelzahl. Liefert true, wenn es gefunden wurde, damit der Aufrufer
 * einen fehlenden Anker nicht fuer eine gelungene Aufnahme haelt. */
/* AUF DEN INHALT WARTEN, NICHT AUF DIE UHR.
 *
 * BEFUND (05.09.2026): `meta-call.png` bestand zu 100 % aus
 * Einstellungsfeldern — gespeicherte Szenarien, Datenfenster,
 * Quellwahl, Turniereinstellungen — und zeigte kein einziges
 * prognostiziertes Deck. Ursache war eine feste Wartezeit von 11
 * Sekunden; der Praediktor liest neun Quellen und braucht laenger.
 * Eine Aufnahme, die nur die Huelle zeigt, ist als Post schlimmer als
 * gar keine, weil sie behauptet, das sei die Ansicht.
 *
 * Liefert false, wenn nichts kam — der Aufrufer soll das melden
 * duerfen, statt eine leere Ansicht abzulichten. */
async function warteAuf(page, waehler, msMax) {
    try {
        await page.waitForSelector(waehler, { timeout: msMax || 45000, state: 'attached' });
        return true;
    } catch (_) { return false; }
}

async function zeige(page, waehler, textTeil) {
    const ok = await page.evaluate(([w, t]) => {
        const kandidaten = [...document.querySelectorAll(w)];
        const el = t
            ? kandidaten.find((e) => (e.textContent || '').includes(t))
            : kandidaten.find((e) => e.offsetParent);
        if (!el) return false;
        el.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -12);
        return true;
    }, [waehler, textTeil || null]);
    await page.waitForTimeout(700);
    return ok;
}

const AUFNAHMEN = [
    {
        // Die meistgespielten Decks, ohne die Huelle darueber.
        datei: 'meta-uebersicht.png', hash: 'current-meta',
        drive: async (page) => {
            await vorbereiten(page, 9000);
            /* Auf die Deckliste, nicht auf den Seitenanfang. Ueber ihr
               stehen Kopfzeile, Werkzeugreihe, Datenraum und Format —
               zusammen 40 % des Bildes, alles Huelle. */
            /* Den Matchup-Abschnitt darunter zuklappen. Offen stehen
               dort ein Erklaertext und zwei leere Suchfelder — im Post
               die untere Bildhaelfte voller Leere. */
            await page.evaluate(() => {
                for (const b of document.querySelectorAll('button.ds-sec-hd')) {
                    if (/matchup/i.test(b.textContent || '')
                        && b.getAttribute('aria-expanded') === 'true') b.click();
                }
            });
            await page.waitForTimeout(900);
            if (!await zeige(page, 'h2, h3, .ds-sec-hd', 'most played'))
                await zeige(page, '.deck-tile, .arc-card--inline');
        },
    },
    {
        // Anteil, Win Rate, Antritte, Top 8 — je Deck eine Zeile.
        datei: 'meta-performance.png', hash: 'current-meta',
        drive: async (page) => {
            await vorbereiten(page, 9000);
            await page.evaluate(() => {
                for (const b of document.querySelectorAll('button.ds-sec-hd'))
                    if (b.getAttribute('aria-expanded') === 'false') b.click();
            });
            await page.waitForTimeout(1800);
            await zeige(page, '.arc-card--inline');
        },
    },
    {
        // Das prognostizierte Feld. Die Kachelzeile mit dem
        // 14-Tage-Fenster steht hier drin und ist der Grund, warum
        // diese Aufnahme im September neu gemacht wurde.
        datei: 'meta-call.png', hash: 'meta-call',
        drive: async (page) => {
            if (!await warteAuf(page, '#meta-call table.metacall-table', 60000))
                throw new Error('Meta Call hat keine Feldtabelle gerendert — '
                    + 'eine Aufnahme davon zeigte nur Einstellungsfelder');
            await vorbereiten(page, 2500);
            await putzen(page);
            /* NACHGEMESSEN, nicht geraten: die Feldtabelle beginnt bei
               y = 1593 von 9286 — darueber stehen sechs
               Einstellungsbloecke (gespeicherte Szenarien, Datenfenster,
               Quelle, Modus, Datenquellen, Turniereinstellungen). Die
               erste Fassung schoss den Seitenanfang und zeigte
               ausschliesslich diese Bloecke.
               Die `.mc-intel-tile`-Kacheln taugen als Anker NICHT: sie
               stehen in zugeklappten Deckzeilen und sind unsichtbar. */
            if (!await zeige(page, '#meta-call table.metacall-table'))
                throw new Error('Feldtabelle gefunden, aber nicht sichtbar');
        },
    },
    {
        // Die Matchup-Heatmap — das Bild, das am schnellsten erklaert,
        // was die Seite kann, weil es ohne Text auskommt.
        datei: 'heatmap.png', hash: 'current-meta',
        drive: async (page) => {
            await vorbereiten(page, 9000);
            await page.evaluate(() => {
                for (const b of document.querySelectorAll('button.ds-sec-hd'))
                    if (b.getAttribute('aria-expanded') === 'false') b.click();
            });
            await page.waitForTimeout(2000);
            await zeige(page, 'table, .heatmap, .matchup-grid');
        },
    },
    {
        datei: 'champions.png', hash: 'champions',
        drive: async (page) => {
            await vorbereiten(page, 6000);
            await page.evaluate(() => {
                const t = [...document.querySelectorAll('button.side-quest-subtab')]
                    .find((b) => /Teams/i.test(b.textContent));
                if (t) t.click();
            });
            await page.waitForTimeout(3000);
            await page.evaluate(() => window.scrollTo(0, 160));
            await page.waitForTimeout(500);
        },
    },
    {
        datei: 'kartendatenbank.png', hash: 'cards',
        drive: async (page) => {
            await vorbereiten(page, 9000);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(500);
        },
    },
];

let SPRITES_OK = null;   /* einmal gemessen, fuer alle Aufnahmen */

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
            // Sprache aus dem Schalter, immer dunkel — so sehen die Posts
            // aus, und so sieht die Seite aus, wenn jemand ueber
            // Instagram kommt.
            await ctx.addInitScript((LANG) => {
                try {
                    localStorage.setItem('app_lang', LANG);
                    localStorage.setItem('theme', 'dark');
                } catch (_) { /* privater Modus: dann eben Vorgabe */ }
                /* KAPUTTE BILDER SOFORT AUSBLENDEN, NICHT NACHTRAEGLICH.
                 *
                 * Die Archetyp-Sprites laden von limitlesstcg; aus
                 * dieser Umgebung ist der Host nicht erreichbar. Ein
                 * Aufraeumen NACH dem Scrollen erwischt sie trotzdem
                 * nicht alle — die Heatmap zeichnet ihre Zeilen nach,
                 * und die naechste Fuhre Platzhalter steht schon wieder
                 * im Bild. Ein Fehler-Horcher in der Erfassungsphase
                 * greift dagegen bei jedem einzelnen, egal wann es
                 * entsteht. Auf einer Maschine MIT Netz passiert hier
                 * nichts, weil dann kein Fehler fliegt. */
                document.addEventListener('error', function (e) {
                    var t = e.target;
                    if (t && t.tagName === 'IMG') t.style.display = 'none';
                }, true);
            }, SPRACHE);
            const page = await ctx.newPage();
            await page.goto(`http://127.0.0.1:${PORT}/#${a.hash}`,
                { waitUntil: 'domcontentloaded', timeout: 60000 });
            if (SPRITES_OK === null) {
                SPRITES_OK = await spritesErreichbar(page);
                console.log(SPRITES_OK
                    ? '  Archetyp-Sprites erreichbar — sie bleiben im Bild.'
                    : '  Archetyp-Sprites NICHT erreichbar — sie werden ausgeblendet, '
                      + 'statt als Platzhalter im Post zu stehen.');
            }
            if (!SPRITES_OK) {
                await page.addStyleTag({ content:
                    'img[src*="limitlesstcg.net"], img[src*="r2.limitless"] '
                    + '{ display: none !important; }' });
            }
            await a.drive(page);
            /* NOCH EINMAL AUFRAEUMEN, DIREKT VOR DEM AUSLOESEN.
               `putzen` in `vorbereiten` laeuft zu frueh: Bilder, die
               beim Scrollen nachgeladen werden, scheitern erst danach.
               Gemessen an meta-call.png — dort standen nach dem Scrollen
               wieder vier kaputte Sprites im Bild. */
            await putzen(page);
            await page.waitForTimeout(250);
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
    console.log(`${gemacht} von ${AUFNAHMEN.length} Aufnahmen in images/posts/${SPRACHE}/`);
    process.exit(gemacht === AUFNAHMEN.length ? 0 : 1);
})();
