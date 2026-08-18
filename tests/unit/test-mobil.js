/**
 * Block 6 — was auf dem Telefon passiert.
 *
 * Drei Befunde, die alle dieselbe Form haben: eine Entscheidung, die
 * einmal getroffen wurde, hat sich als Regel festgesetzt, und alles
 * danach war Schadensbegrenzung.
 *
 *   1. Drei feste Spalten fuer das Kartengitter. Daraus folgten 94 px
 *      Kachelbreite und daraus 7-px-Schrift.
 *   2. `display: none` fuer die Matchup-Heatmap, begruendet mit "table
 *      not usable on small screens" — bei einer Tabelle, die seit jeher
 *      in einem Scrollcontainer sitzt.
 *   3. Die Karten-Legende auf dem Hub, wo keines der erklaerten
 *      Elemente vorkommt. Gemessen: 764 px von 1.691 px Hub-Hoehe auf
 *      dem Schreibtisch, 1.640 von 3.499 auf dem Telefon.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const MOB = strip(R('css/mobile-responsive.css'));
const STYLES = strip(R('css/styles.css'));
const UI = strip(R('css/ui-components.css'));
const HTML = R('index.html');
const META = R('js/app-current-meta.js');
const CORE = R('js/app-core.js');
const I18N = R('js/i18n.js');

describe('Mobil: die Kachelbreite steht an einer Stelle', () => {
    it('das Gitter der Deck-Analyse bekommt keine feste Spaltenzahl mehr', () => {
        // `.card-grid` traegt im ganzen Repo an zwei Stellen das
        // Kartengitter der Deck-Analyse (zusammen mit
        // .deck-grid-skeleton-grid). Eine feste Anzahl ignoriert die
        // Geraetebreite; eine Mindestbreite nicht.
        const fixed = [...MOB.matchAll(/([^{}]*\.card-grid[^{}]*)\{([^}]*repeat\(\d+, 1fr\)[^}]*)\}/g)]
            .map(m => m[1].replace(/\s+/g, ' ').trim().slice(0, 70));
        assert.deepEqual(fixed, [],
            'Diese Regeln zwingen .card-grid wieder auf eine feste Spaltenzahl:\n  '
            + fixed.join('\n  '));
    });

    it('es gibt genau eine Regel fuer die Kachelbreite', () => {
        const rules = [...MOB.matchAll(/[^{}]*deck-grid-skeleton-grid[^{}]*\{[^}]*grid-template-columns[^}]*\}/g)];
        assert.equal(rules.length, 1,
            `Erwartet eine Regel, gefunden ${rules.length}.`);
        assert.match(rules[0][0], /minmax\(150px/,
            '150 px ist die Breite, ab der die Knopfzeile ohne Umbruch auskommt.');
    });

    it('die fuenf card-grid-Boeden in styles.css sind nicht mehr !important', () => {
        // Ohne diese Streichung braeuchte die eine Regel oben selbst ein
        // !important, um sie zu schlagen — und dann waeren es wieder zwei
        // Regeln, die sich streiten.
        // Nur die Regeln, die .card-grid direkt meinen. Ein Selektor, der
        // ihn unter einem anderen Behaelter einschraenkt (etwa
        // `[class*="most-used-cards"] .card-grid`), betrifft ein anderes
        // Gitter und darf bleiben.
        const bad = [...STYLES.matchAll(/([^{}]*\.card-grid[^{}]*)\{([^}]*grid-template-columns[^;]*!important[^}]*)\}/g)]
            .map(m => m[1].replace(/\s+/g, ' ').trim())
            .filter(sel => sel.split(',').some(part => /^\s*\.card-grid\s*$/.test(part)))
            .map(sel => sel.slice(0, 60));
        assert.deepEqual(bad, [], 'Wieder !important auf einem .card-grid-Boden:\n  ' + bad.join('\n  '));
    });
});

describe('Mobil: die Matchup-Heatmap ist sichtbar', () => {
    it('kein display:none mehr', () => {
        assert.ok(!/\.heatmap-container\s*\{[^}]*display:\s*none/.test(MOB),
            'Die Heatmap ist auf dem Telefon wieder ausgeblendet. Das ist die Ansicht, '
            + 'die man zwischen zwei Runden aufmacht.');
    });

    it('die erste Spalte klebt beim Seitwaertsscrollen', () => {
        assert.match(MOB, /#matchupHeatmapContainer \.heatmap-th-row \{[^}]*position: sticky/,
            'Ohne sie weiss man nach zwei Wischern nicht mehr, welche Zeile man liest.');
    });

    it('die Skala ist blau gegen rot, nicht gruen gegen rot', () => {
        assert.ok(!/rgba\(76, 175, 80/.test(META), 'Das Gruen (#4caf50) ist zurueck.');
        assert.ok(!/rgba\(244, 67, 54/.test(META), 'Das Rot (#f44336) ist zurueck.');
        assert.match(META, /rgba\(42, 120, 214/, '--dv-pos fehlt in der Heatmap.');
        assert.match(META, /rgba\(227, 73, 72/, '--dv-neg fehlt in der Heatmap.');
    });

    it('die Zellschrift traegt eine Textfarbe, keine Aussagefarbe', () => {
        // Vorher: gruen / rot / grau je Zelle, dreimal mit !important in
        // ui-components.css, und ab 65 % bzw. 35 % auf Weiss umgeschaltet.
        assert.ok(!/\.heatmap-td-fav \{\s*color: #27ae60/.test(UI));
        assert.match(UI, /\.heatmap-td-fav,\n\.heatmap-td-unfav \{\s*color: var\(--heatmap-color, var\(--ink\)\)/);
    });

    it('die Legende benennt keine Farbwoerter mehr', () => {
        // "Green" / "Gray" / "Red" als Text beschrieb eine Skala, die es
        // nicht mehr gibt — und half niemandem, der sie nicht sieht.
        assert.ok(!/>Green<|>Gray<|>Red</.test(META));
        assert.match(META, /heatmap-key heatmap-key-fav/);
    });
});

describe('Mobil: die Karten-Legende liegt bei den Karten', () => {
    it('sie steht nicht mehr im Hub', () => {
        const hubStart = HTML.indexOf('id="meta-analysis-hub"');
        const hubEnd = HTML.indexOf('id="city-league"');
        const hub = HTML.slice(hubStart, hubEnd);
        assert.ok(!/class="meta-hub-legend"/.test(hub),
            'Die Legende ist zurueck auf dem Hub — 45 % seiner Hoehe fuer Bedienelemente, '
            + 'die es dort nicht gibt.');
    });

    it('sie steht in der Deck-Analyse, eingeklappt', () => {
        // Der Tab-Container, nicht der Menueeintrag: beide Namen kommen
        // weiter oben schon in der Navigation vor.
        const a = HTML.indexOf('<div id="current-analysis" class="tab-content');
        const b = HTML.indexOf('<div id="past-meta" class="tab-content');
        assert.ok(a > 0 && b > a, 'Die Tab-Container wurden nicht gefunden.');
        const view = HTML.slice(a, b);
        assert.match(view, /<details class="ds-legend">/);
        assert.match(view, /class="meta-hub-legend"/);
        assert.match(view, /data-i18n="legend\.summary"/);
    });

    it('der Hilfetext des Hubs wirbt nicht mehr damit', () => {
        assert.ok(!/Card Legend:<\/strong> Below the tile grid/.test(CORE));
        assert.ok(!/Karten-Legende:<\/strong> Unter den Kacheln/.test(CORE));
    });

    it('der neue Textschluessel steht in beiden Sprachen', () => {
        const n = (I18N.match(/'legend\.summary'/g) || []).length;
        assert.equal(n, 2, `legend.summary steht ${n}x in i18n.js, erwartet 2.`);
    });
});
