/**
 * UI-4, Etappe 3: alle 16 Ansichten tragen die Schriftskala.
 *
 * Gemessen am 26.09.2026 mit scripts/messe_schrift_kontrast.py bei 390 px,
 * vorher (Boden) und nachher (--mit-klasse fs-scale). Ohne Tokenwert fielen
 * genau die unten genannten Klassen unter 11 px (kleinster Wert 8,2 px am
 * Preis-Vorbehalt der Kartendatenbank). Mit den Regeln aus
 * css/mobile-responsive.css liegt keine der 13 neuen Ansichten unter 11 px
 * ausser 19 Knoten in den Tutorial-Abbildungen (10,6–10,9 px, em-Ketten in
 * gezeichneten Bildern einer Oberflaeche).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MOBILE = fs.readFileSync(path.join(ROOT, 'css', 'mobile-responsive.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');

describe('UI-4: Schriftskala in jeder Ansicht', () => {
    it('jede Ansicht traegt fs-scale', () => {
        const ansichten = [...INDEX.matchAll(/<div id="([a-z0-9-]+)" class="tab-content([^"]*)"/g)];
        assert.equal(ansichten.length, 16, `erwartet 16 Ansichten, gefunden ${ansichten.length}`);
        const ohne = ansichten.filter(m => !/\bfs-scale\b/.test(m[2])).map(m => m[1]);
        assert.deepEqual(ohne, [], 'ohne Skala greift dort weiter der 12-px-Boden');
    });

    it('die Klassen, die ohne Boden unter 11 px fielen, haben einen Tokenwert', () => {
        for (const sel of ['#meta-call.fs-scale .mp-name', '#meta-call.fs-scale .mc-rec-name-text',
                           '#cards.fs-scale .price-unverified-badge', '#cards.fs-scale .card-database-coverage-quelle',
                           '#tutorial.fs-scale .mockup-pill', '#side-quest.fs-scale .side-quest-reg-badge',
                           '.tab-content.fs-scale .data-freshness-chip',
                           '#city-league.fs-scale .city-league-sieger-tabelle th']) {
            const i = MOBILE.indexOf(sel);
            assert.ok(i > -1, 'fehlt: ' + sel);
            const block = MOBILE.slice(i, MOBILE.indexOf('}', i));
            assert.match(block, /font-size:\s*var\(--fs-xs\)/, 'kein Tokenwert fuer ' + sel);
        }
    });

    it('die Herkunftszeile der Kartendatenbank traegt ihre Groesse nicht mehr im style-Attribut', () => {
        const js = fs.readFileSync(path.join(ROOT, 'js', 'app-cards-db.js'), 'utf8');
        assert.doesNotMatch(js, /card-database-coverage-quelle"\s+style="[^"]*font-size/,
            'mit Inline-Groesse kommt keine Regel der Skala an ihr vorbei (9,3 px bei 390 px)');
    });

    it('Siegertabelle: die erste Kopfzelle bekommt die dunkle Flaeche ihrer Kopfzeile', () => {
        const i = MOBILE.indexOf('#city-league .city-league-sieger-tabelle thead th:first-child');
        assert.ok(i > -1, 'die Regel fehlt — "Date" stand weiss auf #f8f9fa (1,05:1)');
        assert.match(MOBILE.slice(i, MOBILE.indexOf('}', i)), /background-color:\s*#1a1a2e/);
    });
});
