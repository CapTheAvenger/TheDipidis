'use strict';
/*
 * Dunkelmodus: Textfarben, die nicht mitdrehen, und Flaechen, die
 * hell bleiben.
 *
 * BEFUND (30.08.2026, live gemessen in Chromium, beide Modi)
 * ---------------------------------------------------------
 * 1) `--pokemon-blue` wurde an 30 Stellen benutzt und NIRGENDS
 *    definiert. Jede Stelle lief in den Rueckfall #3B4CCA — einen
 *    festen Hellmodus-Ton, der im Dunkeln stehen blieb.
 *
 * 2) Dazu drei Regeln mit hart notiertem #1e3a8a als Textfarbe auf
 *    --surface-1. Gemessen im Dunkelmodus: **1,71:1**. Betroffen:
 *    .city-league-stat-value, .current-meta-stat-value,
 *    .past-meta-stat-value — die grossen Kennzahlen ueber den
 *    Tabellen, also genau das, was man zuerst liest.
 *
 * 3) `.city-league-cards-count-summary` erbte das feste Blau und trug
 *    zusaetzlich `opacity: 0.72`: **1,93:1**. Deckkraft multipliziert
 *    sich auf jede Farbe darunter — als Gestaltungsmittel gedacht,
 *    als Kontrastbremse gewirkt.
 *
 * 4) Dasselbe bei den ruhenden Typ-Knoepfen (--ink-3 mit opacity 0,7):
 *    **1,39:1**. Nach dem Farbwechsel waren es 1,78:1 — weil die
 *    Leiste darunter `rgba(255,255,255,0.7)` trug und im Dunkelmodus
 *    weiss blieb. Erst beide zusammen ergeben 9,26:1.
 *
 * 5) `.city-league-card-pin-btn`: weisses Zeichen auf einer zu 12 %
 *    weissen Flaeche ueber einer hellen Karte — im HELLMODUS
 *    **1,00:1**, also schlicht unsichtbar. 52 Knoepfe.
 *
 * 6) `.ds-space-sep` faerbte den Trennpunkt mit --line-strong, einem
 *    Rahmen-Token: **1,74:1**.
 *
 * NACH DER AENDERUNG, an denselben Stellen gemessen:
 *
 *     Kennzahlen              1,71 -> 6,76   (hell 9,89)
 *     Anzahl-Zusatz           1,93 -> 9,90   (hell 7,48)
 *     Typ-Knopf ruhend        1,39 -> 9,26   (hell 6,73)
 *     Pin-Knopf hell          1,00 -> 15,67
 *
 * WAS OFFEN BLEIBT — und zwar gemessen, nicht geraten: 249 weitere
 * Regeln in 21 Dateien setzen eine helle Flaeche fest, ausserhalb
 * jedes Dunkelmodus-Blocks. Ueber sechs sichtbare Ansichten gemessen
 * faellt davon nichts durch (1.304 Textelemente, 4 Klassen unter
 * Schwelle, davon zwei ausdruecklich abgeschaltete Bedienelemente).
 * Der Rest steckt in Dialogen, die sich ohne Anmeldung nicht oeffnen
 * lassen. Die Zahl steht unten als Deckel: sie darf nicht wachsen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
// Kommentare erst weg: dieser Test hat sich beim ersten Lauf an einem
// Kommentar aufgehaengt, in dem die alte Farbe zitiert stand. Eine
// Zusicherung, die auf ihre eigene Begruendung anspringt, prueft nichts.
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '');

function hex2rgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}
function lum(c) {
    const f = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}
function kontrast(a, b) {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const tokens = lies('css/tokens.css');
function tokenBlock(anker) {
    const i = tokens.indexOf(anker);
    assert.ok(i > 0, 'Block nicht gefunden: ' + anker);
    return tokens.slice(i, tokens.indexOf('\n}', i));
}
function token(block, name) {
    const m = block.match(new RegExp('--' + name + ':\\s*([^;]+);'));
    return m ? m[1].trim() : null;
}
const HELL = tokenBlock(':root {');
const DUNKEL = tokenBlock(':root[data-theme="dark"] {');

describe('Die Marken-Farbe ist ein Token, kein Rueckfallwert', () => {
    it('--pokemon-blue ist in beiden Modi definiert', () => {
        assert.ok(token(HELL, 'pokemon-blue'), '--pokemon-blue fehlt im Hellmodus');
        assert.ok(token(DUNKEL, 'pokemon-blue'), '--pokemon-blue fehlt im Dunkelmodus');
    });

    it('keine Datenseite faerbt Text mehr mit dem festen #1e3a8a', () => {
        // Ausnahme mit Grund: das Kampftagebuch bringt seinen eigenen
        // Dunkelmodus ueber .battle-journal-sheet.is-dark mit, statt den
        // Tokens zu folgen. Die feste Farbe dort ist eine Hellmodus-Regel,
        // die im Dunkeln ueberschrieben wird — der Test unten belegt das.
        const treffer = [];
        for (const datei of fs.readdirSync(path.join(wurzel, 'css'))) {
            if (!datei.endsWith('.css')) continue;
            ohneKomm(lies('css/' + datei)).split('\n').forEach((z, i) => {
                if (/^\s*color\s*:\s*#1e3a8a\s*;/i.test(z)) treffer.push(datei + ':' + (i + 1));
            });
        }
        const ohneTagebuch = treffer.filter(t => !t.startsWith('styles.css'));
        assert.deepStrictEqual(ohneTagebuch, [],
            'feste Textfarbe #1e3a8a wieder da: ' + ohneTagebuch.join(', '));
    });

    it('die Ausnahme im Kampftagebuch hat wirklich eine Dunkel-Entsprechung', () => {
        const q = ohneKomm(lies('css/styles.css'));
        assert.ok(/\.bj-autocomplete-item:hover,\s*\n\.bj-autocomplete-item:active \{[^}]*#1e3a8a/.test(q),
            'die Ausnahme steht nicht mehr da, wo dieser Test sie vermutet');
        assert.ok(/\.battle-journal-sheet\.is-dark \.bj-autocomplete-item:hover/.test(q),
            'die feste Farbe im Kampftagebuch hat keine Dunkel-Entsprechung mehr — ' +
            'dann ist sie keine Ausnahme, sondern ein Fehler');
    });
});

describe('Die reparierten Stellen tragen drehende Tokens', () => {
    const cl = lies('css/city-league.css');
    const ui = lies('css/ui-components.css');
    const nav = lies('css/ds-nav.css');

    const stellen = [
        ['.city-league-stat-value (grosse Kennzahl)', cl,
         /#city-league-analysis \.city-league-stat-value \{[^}]*color:\s*var\(--brand-ink\)/],
        ['.current-meta-stat-value', cl,
         /#current-analysis \.current-meta-stat-value \{[^}]*color:\s*var\(--brand-ink\)/],
        ['.past-meta-stat-value', cl,
         /#past-meta \.past-meta-stat-value \{[^}]*color:\s*var\(--brand-ink\)/],
        ['.city-league-cards-count', cl,
         /\.city-league-cards-count \{[^}]*color:\s*var\(--brand-ink\)/],
        ['.past-meta-mu-bad', cl,
         /\.past-meta-mu-bad\s*\{\s*color:\s*var\(--tint-bad-ink\)/],
        ['.city-league-card-pin-btn', ui,
         /\.city-league-card-pin-btn \{[^}]*color:\s*var\(--ink\)/],
        ['.ds-space-sep', nav,
         /\.ds-space-sep \{ color: var\(--ink-3\); \}/],
    ];
    for (const [name, quelle, muster] of stellen) {
        it(name + ' faerbt ueber ein Token', () => {
            assert.ok(muster.test(quelle), name + ' faerbt wieder fest');
        });
    }

    it('die Typ-Leisten benutzen keine feste weisse Flaeche mehr', () => {
        for (const name of ['city-league-card-type-filter', 'past-meta-cards-type-filter']) {
            const m = ohneKomm(cl).match(new RegExp('\\.' + name + ' \\{[^}]*\\}'));
            assert.ok(m, name + ' nicht gefunden');
            assert.ok(!/rgba\(255\s*,\s*255\s*,\s*255/.test(m[0]),
                name + ' traegt wieder eine feste weisse Flaeche');
            assert.ok(/background:\s*var\(--surface-2\)/.test(m[0]),
                name + ' hat keine Token-Flaeche');
        }
    });

    it('die ruhenden Typ-Knoepfe bremsen den Kontrast nicht mehr mit Deckkraft', () => {
        for (const name of ['city-league-type-btn', 'past-meta-cards-type-btn']) {
            const m = ohneKomm(cl).match(new RegExp('\\.' + name + ' \\{[^}]*\\}'));
            assert.ok(m, name + ' nicht gefunden');
            assert.ok(!/opacity:\s*0\.7\b/.test(m[0]), name + ' hat wieder opacity 0.7');
            assert.ok(/color:\s*var\(--ink-2\)/.test(m[0]), name + ' faerbt nicht ueber --ink-2');
        }
    });
});

describe('Die Tokens halten, was die Regeln von ihnen erwarten', () => {
    const paare = [
        ['brand-ink', 'surface-1', 4.5],
        ['ink-2', 'surface-1', 4.5],
        ['ink-2', 'surface-2', 4.5],
        ['ink-3', 'surface-1', 4.5],
        ['ink', 'surface-2', 4.5],
        ['tint-ok-ink', 'surface-1', 4.5],
        ['tint-bad-ink', 'surface-1', 4.5],
    ];
    for (const [vg, bg, soll] of paare) {
        for (const [modus, block] of [['hell', HELL], ['dunkel', DUNKEL]]) {
            it(`${vg} auf ${bg} (${modus}) haelt ${soll}:1`, () => {
                const a = token(block, vg), b = token(block, bg);
                assert.ok(a && a.startsWith('#'), `--${vg} (${modus}) ist kein Hexwert: ${a}`);
                assert.ok(b && b.startsWith('#'), `--${bg} (${modus}) ist kein Hexwert: ${b}`);
                const k = kontrast(hex2rgb(a), hex2rgb(b));
                assert.ok(k >= soll, `${vg} auf ${bg} (${modus}) nur ${k.toFixed(2)}:1`);
            });
        }
    }
});

describe('Feste helle Flaechen wachsen nicht weiter', () => {
    // Gemessen am 30.08.2026: vor dieser Aenderung 251 Regeln in 21
    // Dateien, danach 249 — die zwei Typ-Leisten sind raus. Keine der
    // uebrigen faellt in den sechs Ansichten durch, die sich ohne
    // Anmeldung oeffnen lassen (1.304 Textelemente gemessen); sie
    // stecken in Dialogen, die erst nach Anmeldung aufgehen. Der
    // Deckel haelt fest, dass die Zahl nicht wieder waechst.
    const DECKEL = 249;

    function festeHelleFlaechen() {
        const treffer = [];
        for (const datei of fs.readdirSync(path.join(wurzel, 'css'))) {
            if (!datei.endsWith('.css')) continue;
            const zeilen = ohneKomm(lies('css/' + datei)).split('\n');
            let tiefeDunkel = null, klammer = 0;
            zeilen.forEach((z, i) => {
                if (z.includes('data-theme="dark"') || z.includes('prefers-color-scheme: dark')) tiefeDunkel = klammer;
                klammer += (z.split('{').length - 1) - (z.split('}').length - 1);
                if (tiefeDunkel !== null && klammer <= tiefeDunkel) tiefeDunkel = null;
                if (tiefeDunkel !== null) return;
                const m = z.match(/^\s*(?:background|background-color)\s*:\s*(.+?);/);
                if (!m) return;
                const wert = m[1];
                if (/var\(|transparent|none/.test(wert)) return;
                for (const c of wert.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(([^)]*)\)/g)) {
                    let rgb, a = 1;
                    if (c[0].startsWith('#')) {
                        if (c[0].length < 4) continue;
                        rgb = hex2rgb(c[0].slice(0, 7));
                    } else {
                        const t = (c[1].match(/[\d.]+/g) || []).map(Number);
                        if (t.length < 3) continue;
                        rgb = t.slice(0, 3); a = t.length > 3 ? t[3] : 1;
                    }
                    if (a < 0.35) continue;
                    if (lum(rgb) > 0.7) { treffer.push(datei + ':' + (i + 1)); return; }
                }
            });
        }
        return treffer;
    }

    it('bleibt unter dem gemessenen Deckel (251 -> 249)', () => {
        const t = festeHelleFlaechen();
        assert.ok(t.length <= DECKEL,
            `${t.length} feste helle Flaechen (Deckel ${DECKEL}). Neu hinzugekommene ` +
            `drehen im Dunkelmodus nicht mit — Token statt Festwert.`);
    });

    it('der Deckel ist nicht ins Leere gesetzt', () => {
        // Faende der Sucher nichts, waere der Test oben wertlos.
        assert.ok(festeHelleFlaechen().length > 100,
            'der Sucher findet fast nichts mehr — dann ist er kaputt, nicht das CSS sauber');
    });
});

/*
 * Und ein Tippziel, das seine eigene Regel ueberlebt hat.
 *
 * BEFUND (30.08.2026, live gemessen bei 390 px mit hasTouch): der
 * Sprunglink in der Archetyp-Tabelle blieb bei **18 px**, obwohl
 * css/tippziele.css ihm `padding-block: 12px` gab. Die Regel dort war
 * `html .archetype-jump-link` — eine Klasse und ein Element, (0,1,1).
 * css/styles.css:4698 schreibt aber `.archetype-jump-link:link`: eine
 * Klasse UND eine Pseudoklasse, (0,2,0). Das gewinnt, und mit ihm das
 * `padding: 2px 0` von dort.
 *
 * Der Fehler ist derselbe wie bei .searchable-select-display am
 * 29.08. — dort war es die Ladereihenfolge, hier die Pseudoklasse.
 * Beide Male hat eine Regel, die richtig aussah, nichts getan.
 *
 * Nach der Aenderung, an derselben Stelle gemessen: 18 -> 44 px.
 */
describe('Der Sprunglink in der Archetyp-Tabelle', () => {
    const TIPP = ohneKomm(lies('css/tippziele.css'));
    const STYL = ohneKomm(lies('css/styles.css'));

    it('schreibt die Pseudoklassen mit, gegen die es ankommt', () => {
        // Ohne :link/:visited/:active bleibt die Regel bei (0,1,1) und
        // verliert gegen (0,2,0) aus styles.css.
        for (const pseudo of [':link', ':visited', ':active']) {
            assert.ok(TIPP.includes('html a.archetype-jump-link' + pseudo),
                'tippziele.css fasst .archetype-jump-link' + pseudo + ' nicht — ' +
                'dann greift wieder das padding aus styles.css');
        }
    });

    it('die Gegenregel in styles.css steht noch da, wo dieser Test sie vermutet', () => {
        // Verschwindet sie, ist die hoehere Spezifitaet oben unnoetig
        // geworden — und dieser Test soll das melden, nicht verschweigen.
        assert.ok(/\.archetype-jump-link:link/.test(STYL),
            'styles.css schreibt .archetype-jump-link:link nicht mehr');
        const i = STYL.indexOf('.archetype-jump-link:active');
        const block = STYL.slice(STYL.indexOf('{', i), STYL.indexOf('}', i));
        assert.ok(/padding:\s*2px\s+0/.test(block),
            'das padding, gegen das hier angeschrieben wird, ist weg — Regel pruefen');
    });

    it('erzwingt kein display und bricht das Symbol nicht um', () => {
        const i = TIPP.indexOf('html a.archetype-jump-link');
        const block = TIPP.slice(TIPP.indexOf('{', i), TIPP.indexOf('}', i));
        assert.ok(!/display\s*:/.test(block),
            'die Regel setzt wieder display — styles.css braucht dort inline-flex ' +
            'fuer das Symbol neben dem Deckname');
        assert.ok(/padding-block:\s*15px/.test(block),
            'die Hoehe kommt nicht mehr aus 15 px Innenabstand (15 + 14 + 15 = 44)');
    });
});
