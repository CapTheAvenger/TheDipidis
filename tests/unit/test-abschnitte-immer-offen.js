/**
 * UI-12 / UI-13 (Rutsch 5, 27.09.2026) — die Meta-Ansicht klappt nichts mehr.
 *
 * Hausi im Video-Review: „Alle Abschnitte sollen offen bleiben (keine
 * ‚Zuruecksetzen: 5 von 5 Abschnitten'-Einklapp-Mechanik)", die
 * Beschriftung „Datenraum" soll weg („man muss ja nicht alles noch mal
 * extra benennen") und das Format-Schild in Global ist doppelt zur
 * Ueberschrift darueber.
 *
 * Diese Zusicherungen FUEHREN den Code AUS (js/ds-sections.js ganz,
 * aus js/ds-filter.js die Zeile) — eine Textsuche wuerde einen
 * zurueckgekehrten Klapp-Zweig nicht sehen, wenn nur ein Name stimmt.
 *
 * Ersetzt tests/unit/test-abschnitte-klickbar.js und
 * tests/unit/test-geister-abschnitte.js: beide sicherten den Klappzustand
 * und seinen Speicher ab, die es nicht mehr gibt.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { dokument, lies, ausschnitt, BeobachterKlasse } = require('./lib-dom-sandkasten.js');

const SEKTIONEN = lies('js', 'ds-sections.js');
const FILTER = lies('js', 'ds-filter.js');

/* Ein Host mit den Bloecken, die sektionieren() einsammelt, und ein
   Speicher, in dem der ALTE Klappzustand steht: nur 'top' offen. So
   sah er bei jedem Besucher aus, der vorher etwas zugeklappt hatte. */
function metaAnsicht() {
    const dok = dokument();
    const ctx = {
        console, document: dok, setTimeout, clearTimeout,
        MutationObserver: BeobachterKlasse(),
        localStorage: { getItem: () => JSON.stringify(['top']), setItem() {} },
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.getLang = () => 'de';
    ctx.addEventListener = () => {};
    vm.createContext(ctx);
    const host = dok.neu('div', 'currentMetaContent');
    dok.neu('section', null, host).className = 'tier-hero-section';
    dok.neu('div', 'matchupHeatmapContainer', host);
    const tiers = dok.neu('div', null, host);
    dok.neu('div', 'cm-tier-1', tiers);
    dok.neu('div', null, host).className = 'cm-rangliste-block';
    dok.neu('div', null, host).className = 'top-cards-container';
    vm.runInContext(SEKTIONEN, ctx, { filename: 'js/ds-sections.js' });
    return { dok, ctx, host };
}

describe('UI-13 — jeder Abschnitt ist offen, immer', () => {
    it('alle fuenf Abschnitte stehen offen da, auch mit altem Speicher', () => {
        const { host } = metaAnsicht();
        const secs = host.querySelectorAll('.ds-sec');
        assert.equal(secs.length, 5, 'erwartet fuenf Abschnitte');
        const zu = secs.filter(s => !s.classList.contains('is-open')).map(s => s.getAttribute('data-sec'));
        assert.deepEqual(zu, [], 'zugeklappt: ' + zu.join(', '));
    });

    it('die Kopfzeile ist eine Ueberschrift, kein Knopf', () => {
        const { host } = metaAnsicht();
        host.querySelectorAll('.ds-sec-hd').forEach(hd => {
            assert.equal(hd.tagName.toUpperCase(), 'H2');
            assert.equal(hd.getAttribute('aria-expanded'), null, 'eine Ueberschrift klappt nichts');
        });
    });

    it('kein Pfeil, keine Zuruecksetzen-Zeile', () => {
        const { dok, host } = metaAnsicht();
        assert.equal(host.querySelectorAll('.ds-sec-arrow').length, 0);
        assert.equal(dok.getElementById('dsSecReset'), null);
    });

    it('am Host haengt kein Klick-Hoerer mehr, der etwas klappen koennte', () => {
        const { host } = metaAnsicht();
        assert.equal((host._hoerer.click || []).length, 0);
    });

    it('die Matchup-Ueberschrift heisst „Matchup Heatmap" (UI-14)', () => {
        const { host } = metaAnsicht();
        const t = host.querySelector('.ds-sec[data-sec="heatmap"] .ds-sec-t');
        assert.equal(t.textContent, 'Matchup Heatmap');
    });
});

/* Aus ds-filter.js nur die Zeile — der Rest braucht die ganze Seite. */
function filterZeile(raumKey, mitSelect) {
    const dok = dokument();
    const ctx = { console, document: dok, Event: function (t) { this.type = t; } };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    ctx.getLang = () => 'de';
    vm.createContext(ctx);
    if (mitSelect) {
        const sel = dok.neu('select', mitSelect);
        ['A', 'B'].forEach(t => {
            const o = dok.neu('option', null, sel);
            o.value = t.toLowerCase();
            o.textContent = t;
        });
        sel.value = 'a';
    }
    const code = [
        /var RAEUME = \[[\s\S]*?\n    \];/.exec(FILTER)[0],
        ausschnitt(FILTER, 'function de('),
        ausschnitt(FILTER, 'function formate('),
        ausschnitt(FILTER, 'function baueZeile('),
        'globalThis.RAEUME = RAEUME; globalThis.baueZeile = baueZeile;',
    ].join('\n');
    vm.runInContext(code, ctx, { filename: 'js/ds-filter.js (Ausschnitt)' });
    const raum = ctx.RAEUME.find(r => r.key === raumKey);
    return ctx.baueZeile(raum);
}

function texte(k, raus) {
    raus = raus || [];
    if (k.textContent && !k.children.length) raus.push(k.textContent);
    k.children.forEach(c => texte(c, raus));
    return raus;
}

describe('UI-12 / UI-13 — die Filterzeile ohne doppelte Beschriftung', () => {
    it('„Datenraum" steht nicht mehr sichtbar da — nur noch als Name fuer Bildschirmleser', () => {
        const zeile = filterZeile('gl');
        assert.ok(!texte(zeile).includes('Datenraum'), 'sichtbar: ' + texte(zeile).join(' | '));
        const seg = zeile.querySelector('.ds-filter-seg');
        assert.equal(seg.getAttribute('aria-label'), 'Datenraum');
    });

    it('Global: kein Format-Schild und keine zweite Gruppe', () => {
        const zeile = filterZeile('gl');
        assert.equal(zeile.querySelectorAll('.ds-filter-fixed').length, 0);
        assert.equal(zeile.querySelectorAll('.ds-filter-group').length, 1);
        assert.equal(zeile.querySelectorAll('.ds-filter-lab').length, 0);
    });

    it('Rotationen fuehrt seine Formatwahl in der Steuerung, nicht in der Zeile (UI-33)', () => {
        /* Bis 27.09.2026 stand hier: „behaelt seine echte Formatwahl samt
           Beschriftung" in der Zeile. Seit UI-33 steht das Format bei
           Turnier-Filter und Archetyp — die Zeile traegt nur die Raumwahl.
           Die Sichtbarkeit des Originals prueft test-ds-filter-formate.js. */
        const zeile = filterZeile('past', 'pastMetaFormatFilter');
        assert.equal(zeile.querySelectorAll('.ds-filter-group').length, 1);
        assert.equal(zeile.querySelectorAll('.ds-filter-lab').length, 0);
    });
});

/* Die uebrigen Punkte aus Rutsch 5 sind Text und Regeln — geprueft wird
   deshalb der Text, aber OHNE Kommentare (die erklaeren den alten Stand
   woertlich und machten die Probe sonst blind). */
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');

describe('Rutsch 5 — was sonst noch wegfiel', () => {
    const KARTE = ohneKommentare(lies('js', 'app-archetype-card.js'));
    const TIER = ohneKommentare(lies('js', 'app-tier-meta.js'));
    const I18N = lies('js', 'i18n.js');
    const CSS = ohneKommentare(lies('css', 'components.css'));
    const CL = ohneKommentare(lies('css', 'city-league.css'));

    it('das Ausschneiden laesst genug stehen', () => {
        assert.ok(TIER.length > lies('js', 'app-tier-meta.js').length * 0.3);
    });

    it('UI-19: ein Knopf „Top {n} Matchups anzeigen", der zwanzig zeigt', () => {
        assert.match(KARTE, /const MU_VORSCHAU = 20;/);
        assert.match(I18N, /'arc\.matchupsToggle':\s*'Top \{n\} Matchups anzeigen'/);
        assert.match(I18N, /'arc\.matchupsToggle':\s*'Show top \{n\} matchups'/);
    });

    it('UI-23: kein Verweis „Nenner und Rechenweg" mehr im Meta-Performance-Block', () => {
        assert.ok(!/Nenner und Rechenweg/.test(TIER));
    });

    it('UI-22: der Rogue-Block ist offen, kein <details> mit Zaehler', () => {
        assert.match(TIER, /id="cm-\$\{tierKey\}">\s*<h3>/);
        assert.ok(!/id="cm-\$\{tierKey\}">\s*<details>/.test(TIER));
    });

    it('UI-27: kein Fragezeichen hinter einem Fachbegriff', () => {
        assert.ok(!/\.ds-term::after/.test(CSS));
    });

    it('UI-13: kein Graben ueber dem ersten Abschnitt', () => {
        assert.match(CL, /\.current-meta-content\s*\{[^}]*padding-top:\s*0;/);
        assert.match(CL, /\.tier-hero-section > \.tier-hero-grid:first-child\s*\{\s*margin-top:\s*0;/);
    });
});
