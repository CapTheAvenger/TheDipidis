/**
 * Rutsch 10 (27.09.2026): Kartenuebersicht und gebautes Deck.
 *
 *   FE-9  Pokemon-Familien stehen nach ihrem hoechsten Anteil, nicht nach Element.
 *   FE-7  Rotationen bei Multi-Format: Turnier-Performance und beste Liste aus.
 *   UI-38 Die Prozentzeile der Deck-Kachel liegt IM Aktionsblock, nicht darueber.
 *   UI-37 Alle Plaketten auf dem Kartenbild: eine Form, eine Groesse.
 *   UI-36 Das Preisschild ist so breit wie sein Betrag.
 *
 * FE-9 und FE-7 sind Verhalten und werden AUSGEFUEHRT. UI-36/37/38 sind
 * Regeln und Markup — die werden als Text geprueft, mit herausgeschnittenen
 * Kommentaren (CLAUDE.md: „Dein eigener Kommentar macht die Probe blind").
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(treffer.index, i + 1); }
    }
    throw new Error('Klammer nicht geschlossen: ' + name);
}

// ── FE-9 ────────────────────────────────────────────────────────────
function sortiere(karten) {
    const sb = {
        window: {
            pokedexNumbers: { abra: 63, kadabra: 64, alakazam: 65, psyduck: 54, golduck: 55 },
            // Die Familie kommt aus den Kartentexten („Evolves from …"), wie auf der Seite.
            _cardEffectsIndex: { byName: new Map([
                ['kadabra', { card_type: 'Evolves from Abra' }],
                ['alakazam', { card_type: 'Evolves from Kadabra' }],
                ['golduck', { card_type: 'Evolves from Psyduck' }]]) }
        },
        console,
        // Die Kartendaten tragen den Typ als Element + Stufe („PBasic", „WStage 1").
        getCardTypeCategory: (t) => (/^[A-Z](Basic|Stage)/.test(t) ? 'Pokemon' : 'Trainer'),
        parseLocaleNumber: (v, d) => { const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? d : n; }
    };
    vm.createContext(sb);
    vm.runInContext(schneideFunktion(R('js/app-deck-builder.js'), 'sortCardsByType') + ';this.s = sortCardsByType;', sb);
    return Array.from(sb.s(karten), (k) => k.card_name);
}
const poke = (n, p, e, st = 'Basic') => ({ card_name: n, type: e + st, percentage_in_archetype: String(p) });

test('FE-9: die Familie mit dem hoechsten Anteil steht vorn, auch gegen die Element-Reihenfolge', () => {
    // Wasser steht in der Element-Reihenfolge vor Psycho. Ohne FE-9 kaeme
    // Psyduck zuerst — die Alakazam-Linie traegt das Deck aber mit 95 %.
    const r = sortiere([poke('Psyduck', 40, 'W'), poke('Golduck', 30, 'W', 'Stage 1'),
        poke('Abra', 95, 'P'), poke('Kadabra', 90, 'P', 'Stage 1'), poke('Alakazam', 90, 'P', 'Stage 2')]);
    assert.deepEqual(r, ['Abra', 'Kadabra', 'Alakazam', 'Psyduck', 'Golduck']);
});

test('FE-9: innerhalb der Familie bleibt die Entwicklungsreihenfolge, auch wenn die Stufe 2 mehr Anteil hat', () => {
    const r = sortiere([poke('Alakazam', 99, 'P', 'Stage 2'), poke('Kadabra', 50, 'P', 'Stage 1'), poke('Abra', 60, 'P')]);
    assert.deepEqual(r, ['Abra', 'Kadabra', 'Alakazam']);
});

// ── FE-7 ────────────────────────────────────────────────────────────
function pastMeta() {
    const knoten = () => { const k = new Set(['d-none']);
        return { innerHTML: 'alt', classList: { add: (c) => k.add(c), remove: (c) => k.delete(c), contains: (c) => k.has(c) } }; };
    const dom = { pastMetaPerformanceSection: knoten(), pastMetaPerformanceCards: knoten(), pastMetaMatchupBlock: knoten(),
        pastMetaMostSuccessfulSection: knoten(), pastMetaMostSuccessfulBody: knoten() };
    dom.pastMetaPerformanceSection.classList.remove('d-none');
    dom.pastMetaMostSuccessfulSection.classList.remove('d-none');
    const quelle = R('js/app-past-meta.js');
    const sb = { window: {}, document: { getElementById: (i) => dom[i] || null }, t: (k) => k, console,
        _pmLoadLabsCsv: async () => [], _pastMetaLabsDecksCache: {} };
    vm.createContext(sb);
    vm.runInContext(['pastMetaEinFormat', 'renderPastMetaPerformance', 'renderPastMetaMostSuccessfulList']
        .map((n) => schneideFunktion(quelle, n)).join('\n')
        + ';this.f = {pastMetaEinFormat, renderPastMetaPerformance, renderPastMetaMostSuccessfulList};', sb);
    return { f: sb.f, dom, sb };
}

test('FE-7: pastMetaEinFormat erkennt Multi-Format und „nichts gewaehlt"', () => {
    const { f } = pastMeta();
    assert.equal(f.pastMetaEinFormat('all'), false);
    assert.equal(f.pastMetaEinFormat(''), false);
    assert.equal(f.pastMetaEinFormat('TEF-PBL'), true);
});

test('FE-7: bei Multi-Format sind Turnier-Performance und beste Liste beide aus', async () => {
    const { f, dom, sb } = pastMeta();
    await f.renderPastMetaPerformance('Gardevoir ex', 'all', 'all');
    await f.renderPastMetaMostSuccessfulList('Gardevoir ex', 'all', 'all');
    assert.ok(dom.pastMetaPerformanceSection.classList.contains('d-none'), 'Turnier-Performance steht bei Multi-Format');
    assert.ok(dom.pastMetaMostSuccessfulSection.classList.contains('d-none'), 'die beste Liste steht bei Multi-Format');
    assert.equal(dom.pastMetaMatchupBlock.innerHTML, '', 'bei Multi-Format steht noch ein Hinweistext im Abschnitt');
    assert.ok(!sb.window.pastMetaMostSuccessfulList);
});

test('FE-7 Gegenprobe: bei einem Format geht die Turnier-Performance auf', async () => {
    const { f, dom } = pastMeta();
    dom.pastMetaPerformanceSection.classList.add('d-none');
    await f.renderPastMetaPerformance('Gardevoir ex', 'TEF-PBL', 'all');
    assert.ok(!dom.pastMetaPerformanceSection.classList.contains('d-none'));
});

// ── UI-38 ───────────────────────────────────────────────────────────
test('UI-38: die Prozentzeile ist das erste Kind des Aktionsblocks', () => {
    const js = ohneKommentare(R('js/app-deck-builder.js'));
    assert.match(js, /<div class="deck-card-actions">\s*<div class="deck-card-overlay">/,
        'die Prozentzeile liegt wieder ausserhalb des Aktionsblocks — ab 1024 px ueberlappt sie die Knopfzeile (gemessen 27 von 27 Kacheln)');
    const css = ohneKommentare(R('css/styles.css'));
    assert.match(css, /\.deck-card-actions\s*>\s*\.deck-card-overlay\s*\{[^}]*position:\s*static/,
        'die Prozentzeile ist im Aktionsblock wieder absolut positioniert');
});

// ── UI-37 ───────────────────────────────────────────────────────────
const FAMILIE = ['.city-league-card-badge', '.wishlist-heart-badge', '.city-league-other-print-sparkle',
    '.card-max-count', '.my-deck-card-count'];

test('UI-37: eine Regel gibt allen Plaketten dieselbe Groesse und dieselbe runde Form', () => {
    const roh = R('css/mobile-responsive.css');
    const css = ohneKommentare(roh);
    assert.ok(css.length > roh.length * 0.3, 'das Ausschneiden hat zu viel entfernt');
    const regeln = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)]
        .filter((m) => /width:\s*var\(--plakette\)/.test(m[2]));
    const regel = regeln.find((m) => FAMILIE.every((s) => m[1].includes(s)));
    assert.ok(regel, 'keine gemeinsame Plaketten-Regel mit allen fuenf Arten');
    assert.match(regel[2], /height:\s*var\(--plakette\)/);
    assert.match(regel[2], /border-radius:\s*50%/);
    assert.match(regel[2], /clip-path:\s*none/);
    // Keine Stildatei, die NACH der Familie laedt, fasst eine Plakette an.
    const html = R('index.html');
    const links = [...html.matchAll(/<link[^>]+href="(css\/[^"?]+)/g)].map((m) => m[1]);
    const ab = links.indexOf('css/mobile-responsive.css');
    assert.ok(ab >= 0, 'mobile-responsive.css wird nicht mehr geladen');
    for (const spaeter of links.slice(ab + 1)) {
        const t = ohneKommentare(R(spaeter));
        assert.ok(!FAMILIE.some((k) => t.includes(k)), `${spaeter} laedt nach der Familie und fasst eine Plakette an`);
    }
});

test('UI-37: keine Plakette ist mehr ein Sechseck oder eckig', () => {
    const share = ohneKommentare(R('css/ds-share.css'));
    const max = /\.city-league-card-badge-max\s*\{([^}]*)\}/.exec(share);
    assert.ok(max, 'die Regel fuer die Feld-Anzahl fehlt');
    assert.doesNotMatch(max[1], /clip-path|border-radius/, 'die Feld-Anzahl bekommt wieder eine eigene Form');
    const deck = /\.city-league-card-badge-deck\s*\{([^}]*)\}/.exec(share);
    assert.ok(deck);
    assert.doesNotMatch(deck[1], /border-radius/, 'die Deck-Anzahl bekommt wieder eine eigene Form');
});

test('UI-37: keine aeltere Regel schlaegt die Familie bei Groesse oder Lage', () => {
    // Zwei Wege, auf denen eine alte Regel die Familie trotz spaeterer
    // Ladereihenfolge schlaegt: eine ID im Selektor, oder !important.
    // So blieb card-max-count in Mein-Deck bei 16 px, und das Herz lag
    // per Inline-Regel in index.html (top: 22px !important) auf der
    // Deck-Anzahl.
    const html = R('index.html');
    const quellen = [
        ['index.html', [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n')],
        ...fs.readdirSync(path.join(__dirname, '..', '..', 'css')).filter((f) => f.endsWith('.css'))
            .map((f) => ['css/' + f, R('css/' + f)])
    ];
    // `:not(.plakette)` nimmt die Plakette gerade AUS — das zaehlt nicht als Treffer.
    const trifft = (sel) => ((sel) => FAMILIE.some((k) => new RegExp(k.replace(/\./g, '\\.') + '(?![\\w-])(?!::)').test(sel)))(sel.replace(/:not\([^)]*\)/g, ''));
    const funde = [];
    for (const [name, text] of quellen) {
        for (const m of ohneKommentare(text).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
            const sel = m[1].trim();
            if (!trifft(sel)) continue;
            for (const d of m[2].split(';')) {
                const [eig, ...wert] = d.split(':');
                const e = (eig || '').trim();
                if (!/^(width|height|top|right|min-height|min-width)$/.test(e)) continue;
                if (/!important/.test(wert.join(':')) || /#/.test(sel)) funde.push(`${name}: ${sel.slice(0, 70)} { ${d.trim()} }`);
            }
        }
    }
    assert.deepEqual(funde, [], 'aeltere Regeln setzen Plakettengroesse oder -lage an der Familie vorbei');
});

test('UI-37: die 44-px-Regel fuer Deck-Knoepfe nimmt das Herz aus', () => {
    // Sonst ist das Herz auf dem Handy ein 22 x 44 px grosses Oval — die
    // Regel nennt das Herz nicht, darum faengt die Probe darueber sie nicht.
    const css = ohneKommentare(R('css/styles.css'));
    const regeln = [...css.matchAll(/([^{}]+)\{([^{}]*min-height:\s*44px[^{}]*)\}/g)]
        .map((m) => m[1].trim()).filter((sel) => /(^|,)\s*\.deck-card button/.test(sel));
    assert.ok(regeln.length, 'die Regel fuer die Deck-Knoepfe ist verschwunden');
    for (const sel of regeln) assert.match(sel, /\.deck-card button:not\(\.wishlist-heart-badge\)/, sel);
});

// ── UI-36 ───────────────────────────────────────────────────────────
test('UI-36: das Preisschild waechst nicht in die Zeile', () => {
    for (const datei of ['css/ui-components.css', 'css/mobile-responsive.css']) {
        const css = ohneKommentare(R(datei));
        const regeln = [...css.matchAll(/\.city-league-card-action-row\s*>\s*\.city-league-card-market-btn\s*\{([^}]*)\}/g)];
        assert.ok(regeln.length, `${datei}: Regel fuer das Preisschild fehlt`);
        for (const r of regeln) {
            assert.match(r[1], /flex:\s*0\s+0\s+auto/, `${datei}: das Preisschild fuellt wieder die Zeile`);
            assert.doesNotMatch(r[1], /overflow:\s*hidden/, `${datei}: das Preisschild darf den Betrag wieder abschneiden`);
        }
    }
});
