/**
 * Prüfrunde vom 18.08.2026 — Teil 1: die Ein-Zeilen-Fehler.
 *
 * Sieben Prüfer (drei Spieler-Personas, zwei Datenanalysten und zwei
 * UX-Leads, jeweils im Kreuzverhör) haben die Seite nach Block 8 neu
 * vermessen. Was mehrere unabhängig voneinander fanden und was mit
 * einer Zeile zu beheben war, steht hier.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const TOKENS = read('css/tokens.css');
const HTML = read('index.html');
const HUB = read('js/meta-analysis-hub.js');
const INIT = read('js/inline-init.js');
const MOBILE = read('css/mobile-responsive.css');
const CARDS = read('css/cards-tabs.css');

// ── Kontrast ───────────────────────────────────────────────────────
function lum(hex) {
    const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function ratio(a, b) {
    const [x, y] = [lum(a), lum(b)];
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function token(name, block) {
    const re = new RegExp(name.replace('--', '--') + ':\\s*(#[0-9a-fA-F]{6})');
    const m = re.exec(block);
    return m ? m[1].toLowerCase() : null;
}

describe('--ink-3 ist lesbar, auf jedem Untergrund, auf dem er steht', () => {
    // Der Token trägt 26 % aller Textstellen der Startseite: Deckname,
    // Kontextzeile, Notiz, dazu 38 Rangzellen in Current Meta. Er stand
    // auf #79839a = 3,80:1 gegen Weiss. Gemessen von zwei UX-Prüfern
    // unabhängig, Wert für Wert deckungsgleich.
    const hell = TOKENS.split(':root[data-theme="dark"]')[0];
    const dunkel = TOKENS.slice(TOKENS.indexOf(':root[data-theme="dark"]'));

    it('schafft 4,5:1 gegen Weiss', () => {
        assert.ok(ratio(token('--ink-3', hell), '#ffffff') >= 4.5);
    });

    it('schafft 4,5:1 gegen --surface-0 und --surface-2', () => {
        // Der schlechteste Untergrund entscheidet, nicht der beste.
        for (const s of ['--surface-0', '--surface-2']) {
            const r = ratio(token('--ink-3', hell), token(s, hell));
            assert.ok(r >= 4.5, `${s}: nur ${r.toFixed(2)}:1`);
        }
    });

    it('auch im Dunkelmodus', () => {
        for (const s of ['--surface-0', '--surface-1']) {
            const r = ratio(token('--ink-3', dunkel), token(s, dunkel));
            assert.ok(r >= 4.5, `dunkel ${s}: nur ${r.toFixed(2)}:1`);
        }
    });

    it('--ink und --ink-2 ebenfalls', () => {
        for (const t of ['--ink', '--ink-2']) {
            assert.ok(ratio(token(t, hell), '#ffffff') >= 4.5, t);
        }
    });
});

// ── Pokéball ───────────────────────────────────────────────────────
describe('der Pokéball ist ein Bedienelement, nicht nur ein Bild', () => {
    // Auf dem Telefon führt er als EINZIGER Weg zu Side Quest,
    // Anleitung, Druckliste, Rechner und Profil — die untere Leiste
    // kennt fünf Ziele, das Menü elf bis vierzehn. Gemessen: 19 Tab-
    // stopps auf der Startseite, der Pokéball in keinem davon.
    const tag = /<div id="mainMenuTrigger"[^>]*>/.exec(HTML);

    it('trägt role und tabindex', () => {
        assert.ok(tag, 'mainMenuTrigger nicht gefunden');
        assert.match(tag[0], /role="button"/);
        assert.match(tag[0], /tabindex="0"/);
    });

    it('reagiert auf Enter UND Leertaste', () => {
        // Eine role="button" ohne Tastaturhandler ist eine Behauptung.
        const code = stripJs(INIT);
        assert.match(code, /mainMenuTrigger[\s\S]{0,400}addEventListener\('keydown'/);
        const h = /addEventListener\('keydown', function \(e\) \{[\s\S]*?\}\)/.exec(code)[0];
        assert.match(h, /'Enter'/);
        assert.match(h, /' '|'Spacebar'/);
        assert.match(h, /preventDefault/, 'sonst scrollt die Leertaste die Seite');
    });

    it('sagt seinen Zustand an', () => {
        const fn = /function toggleMainMenu\(\) \{[\s\S]*?\n\}/.exec(stripJs(INIT))[0];
        assert.match(fn, /aria-expanded/, 'aria-expanded stand fest auf "false"');
    });
});

// ── Meta Call ──────────────────────────────────────────────────────
describe('Meta Call — zwei Reste aus Block 7', () => {
    it('die Startseiten-Kachel führt in den Meta-Call-Tab, nicht ins Profil', () => {
        // Block 7 hat Meta Call aus dem Profil geholt, damit es ohne
        // Anmeldung läuft. Diese Zeile schickte weiter ins Profil:
        // 900 px Anmeldewand statt 5.012 px gefüllter Feldtabelle.
        const zeile = /\{[^{}]*id: 'meta-call'[^{}]*\}/.exec(stripJs(HUB));
        assert.ok(zeile, 'Kacheldefinition nicht gefunden');
        assert.match(zeile[0], /topTab: 'meta-call'/);
        assert.ok(!/profileSubTab/.test(zeile[0]), 'kein Profil-Untertab mehr');
    });

    it('der Menüeintrag hat ein Label wie alle anderen', () => {
        // Ohne .menu-item-label findet app-core.js:1428 nichts, lässt
        // den alten Wert stehen — und Plakette, document.title, damit
        // Lesezeichen und Verlauf zeigen den zuletzt besuchten Bereich.
        const btn = /<button id="menu-btn-meta-call"[\s\S]*?<\/button>/.exec(HTML);
        assert.ok(btn);
        assert.match(btn[0], /<span class="menu-item-label">/);
    });

    it('jeder Menüeintrag mit data-tab-id hat ein Label', () => {
        // Der allgemeine Fall: genau dieser eine fehlte.
        const ohne = [];
        for (const m of HTML.matchAll(/<button[^>]*class="menu-item"[^>]*data-tab-id="([^"]+)"[\s\S]*?<\/button>/g)) {
            if (!m[0].includes('menu-item-label')) ohne.push(m[1]);
        }
        assert.deepStrictEqual(ohne, []);
    });
});

// ── Heatmap ────────────────────────────────────────────────────────
describe('die klebende Spalte der Heatmap klebt wirklich', () => {
    // Block 6 hat sie gebaut, gemessen am 18.08. stand sie nach dem
    // Scrollen bei left = -585 px. Ursache: styles.css macht mit
    // `.tab-content table { display:block; overflow-x:auto }` jede
    // Tabelle zu ihrem eigenen Bezugsrahmen — ein Element kann nicht
    // an einem Rand kleben, der mit ihm mitscrollt.
    it('die Heatmap ist von der Pauschalregel ausgenommen', () => {
        const css = stripCss(MOBILE);
        assert.match(css, /table\.heatmap-table[\s\S]{0,200}display:\s*table/);
        assert.match(css, /table\.heatmap-table[\s\S]{0,200}overflow:\s*visible/);
    });

    it('die Ausnahme deckt beide Pauschalregeln ab', () => {
        const css = stripCss(MOBILE);
        assert.match(css, /\.tab-content table\.heatmap-table/);
        assert.match(css, /#currentMetaContent \.section table\.heatmap-table/);
    });

    it('die Ausnahme braucht kein !important', () => {
        const m = /\.tab-content table\.heatmap-table[\s\S]*?\}/.exec(stripCss(MOBILE))[0];
        assert.ok(!/!important/.test(m), 'ein Selektor mehr schlaegt ein !important');
    });
});

// ── Schriftgrößen ──────────────────────────────────────────────────
describe('keine 6-Pixel-Schrift mehr', () => {
    // 6 px traf genau iPhone 12 bis 15 (390 px) bzw. iPhone SE
    // (<= 360 px); bei 391 px bekam derselbe Chip 7 px. Der
    // Seltenheits-Chip hatte damit zugleich 1,73:1 — der schlechteste
    // Kontrastwert der ganzen Seite.
    //
    // Die Schwelle steht hier bei 7 px und NICHT bei 12 px, obwohl
    // 12 px der selbstgesetzte Boden aus mobile-responsive.css:903
    // ist. Grund: es gibt noch 13 Stellen mit 7 px in vier Dateien.
    // Die zu heben aendert die Breite dichter Kartenkacheln und
    // braucht eine eigene Messreihe — das steht als eigener Schritt
    // aus. Diese Schwelle haelt fest, was erreicht ist, und faellt,
    // sobald jemand wieder darunter geht.
    it('keine CSS-Datei setzt Schrift unter 7 px', () => {
        const bad = [];
        for (const f of fs.readdirSync(path.join(ROOT, 'css')).filter(x => x.endsWith('.css'))) {
            const src = stripCss(read('css/' + f));
            for (const m of src.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
                if (Number(m[1]) < 7) bad.push(`${f}: ${m[1]}px`);
            }
        }
        assert.deepStrictEqual(bad, []);
    });

    it('die Zahl der 7-px-Stellen waechst nicht weiter', () => {
        let n = 0;
        for (const f of fs.readdirSync(path.join(ROOT, 'css')).filter(x => x.endsWith('.css'))) {
            n += (stripCss(read('css/' + f)).match(/font-size:\s*7px/g) || []).length;
        }
        assert.ok(n <= 13, `${n} Stellen mit 7px, erwartet hoechstens 13`);
    });
});
