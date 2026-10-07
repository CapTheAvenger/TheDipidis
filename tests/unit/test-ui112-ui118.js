'use strict';
/* UI-112 Etappe 3 (Raumwahl auch ueber der Deck-Analyse, ein Menuepunkt
   Deck-Analyse) und UI-118 Stufe 1 (Knopfsystem) — Hausi 06.10.2026,
   Rutsch V2-11. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const L = require('./lib-dom-sandkasten.js');

function analyse(tabId, kopfPfad) {
    const dok = L.dokument();
    const reiter = dok.neu('div', tabId);
    reiter.className = 'tab-content active fs-scale';
    let eltern = reiter;
    if (tabId === 'city-league-analysis') { eltern = dok.neu('div', 'tab-decks', reiter); }
    else { eltern = dok.neu('div', null, reiter); eltern.className = 'container'; }
    const kopf = dok.neu('div', null, eltern);
    kopf.className = 'header';
    // Die Japan-Meta-Seite liegt mit ihrer Formatwahl im selben Dokument.
    const q = dok.neu('select', 'cityLeagueFormatSelect', dok.neu('div', 'city-league'));
    ['current', 'past'].forEach(w => { const o = dok.createElement('option'); o.value = w; o.textContent = w; q.appendChild(o); });
    const ziele = [];
    const fenster = { document: dok, getLang: () => 'de', addEventListener() {},
        switchTab() {}, switchTabAndUpdateMenu(t) { ziele.push(t); } };
    fenster.window = fenster;
    const ctx = { window: fenster, document: dok, console: { warn() {}, log() {} },
        setTimeout: () => 0, clearTimeout() {}, MutationObserver: L.BeobachterKlasse(),
        Event: function (a) { return { type: a }; } };
    vm.createContext(ctx);
    vm.runInContext(L.lies('js', 'ds-filter.js'), ctx, { filename: 'ds-filter.js' });
    return { kopf, ziele, zeile: () => kopf.parentElement.querySelector(':scope > .ds-filter') };
}

describe('UI-112 Etappe 3: Raumwahl ueber der Deck-Analyse (ausgefuehrt)', () => {
    for (const [tab, an] of [['current-analysis', 'gl'], ['city-league-analysis', 'jp']]) {
        it(tab + ': drei Raeume, ' + an + ' aktiv, Klick fuehrt in die Deck-Analyse', () => {
            const u = analyse(tab);
            const z = u.zeile();
            assert.ok(z, 'keine Raumwahl ueber der Deck-Analyse');
            const kn = z.querySelectorAll('.ds-filter-btn');
            assert.deepEqual(kn.map(b => b.getAttribute('data-space')), ['jp', 'gl', 'past']);
            assert.deepEqual(kn.filter(b => b.classList.contains('is-on')).map(b => b.getAttribute('data-space')), [an]);
            assert.equal(z.querySelectorAll('.ds-filter-group').length, 1, 'keine zweite Formatwahl');
            kn.forEach(b => b.click());
            const soll = { jp: 'city-league-analysis', gl: 'current-analysis', past: 'past-meta' };
            assert.deepEqual(u.ziele, ['jp', 'gl', 'past'].filter(k => k !== an).map(k => soll[k]));
        });
    }
});

describe('UI-112 Etappe 3: ein Menuepunkt Deck-Analyse', () => {
    const html = L.lies('index.html');
    it('kein eigener Punkt fuer die Japan-Analyse, Punkt ohne Format', () => {
        assert.doesNotMatch(html, /id="menu-btn-city-league-analysis"/);
        assert.match(L.lies('js', 'i18n.js'), /'menu\.currentMetaAnalysis':'Deck-Analyse',/);
        assert.doesNotMatch(L.lies('js', 'ds-nav.js'), /'menu-btn-current-analysis', de \?/);
    });
    it('die Japan-Analyse markiert diesen Punkt (ausgefuehrt)', () => {
        const src = L.lies('js', 'inline-init.js');
        const m = src.match(/const MENUEPUNKT_ALIAS = [^\n]*\nfunction menuepunktFuerReiter\(tabId\) \{[\s\S]*?\n\}/);
        assert.ok(m);
        const ctx = { document: { getElementById: id => (id === 'menu-btn-current-analysis' ? { id } : null) },
            REITER_OHNE_MENUEPUNKT: [], console: { warn() {} } };
        vm.runInNewContext(m[0] + '; ergebnis = menuepunktFuerReiter("city-league-analysis");', ctx);
        assert.equal(ctx.ergebnis && ctx.ergebnis.id, 'menu-btn-current-analysis');
    });
});

describe('UI-118 Stufe 1: Knopfsystem', () => {
    const css = L.lies('css', 'knopfsystem.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const html = L.lies('index.html');
    it('laedt als letzte Stilvorlage und steht im Service Worker', () => {
        const links = [...html.matchAll(/<link rel="stylesheet" href="css\/([a-z0-9-]+)\.css/g)].map(m => m[1]);
        assert.equal(links[links.length - 1], 'knopfsystem');
        assert.match(L.lies('service-worker.js'), /'\.\/css\/knopfsystem\.css'/);
    });
    it('Sekundaer faerbt keine farbigen Varianten um und hat nur eine Klasse Gewicht', () => {
        assert.match(css, /\.btn-modern:where\(:not\(\.btn-primary, \.primary, \.success, \.tertiary-danger\)\) \{/);
        assert.doesNotMatch(css, /\.btn-modern:not\(/);
    });
    it('Radius 10 px, Hoehe 36 px, Tier-Kopf 17 px', () => {
        assert.match(css, /--knopf-h: 36px; --knopf-r: 10px;/);
        assert.match(css, /\.deck-tier-title \{ font-size: 17px; \}/);
    });
});
