'use strict';
/* UI-120 (Handy/Barrierefreiheit, gemessen mit scripts/messe_ui120.js bei 390 px)
   und UI-95 (Referenz-Listen kopieren), Rutsch V2-9, 06.10.2026. */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = p => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');
const ohne = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

describe('UI-120 Bewegung reduzieren', () => {
    const src = R('js/app-utils.js');
    const m = src.match(/function scrollVerhalten\(\) \{[\s\S]*?\n\}/);
    it('Helfer liefert auto bei reduzierter Bewegung (ausgefuehrt)', () => {
        assert.ok(m, 'scrollVerhalten fehlt');
        for (const [reduce, soll] of [[true, 'auto'], [false, 'smooth']]) {
            const ctx = { window: { matchMedia: () => ({ matches: reduce }) } };
            vm.runInNewContext(m[0] + '; ergebnis = scrollVerhalten();', ctx);
            assert.strictEqual(ctx.ergebnis, soll);
        }
    });
    it('kein festes behavior: smooth mehr in js/', () => {
        const treffer = fs.readdirSync(path.join(__dirname, '..', '..', 'js')).filter(f => f.endsWith('.js'))
            .filter(f => /behavior:\s*'smooth'\s*[,}]/.test(ohne(R('js/' + f)).replace(/\/\/.*$/gm, '')));
        assert.deepStrictEqual(treffer, []);
    });
});

describe('UI-120 Kartenbild per Tastatur', () => {
    for (const f of ['js/app-city-league.js', 'js/app-current-meta-analysis.js', 'js/app-past-meta.js']) {
        it(f, () => {
            const imgs = R(f).match(/<img [^>]*class="city-league-card-image"[^>]*onclick=[^>]*>/g) || [];
            assert.ok(imgs.length > 0);
            imgs.forEach(t => {
                assert.match(t, /tabindex="0"/);
                assert.match(t, /onkeydown=/);
            });
        });
    }
});

describe('UI-120 Handy-Reste', () => {
    it('Fokusring 2 px ueberall', () => {
        assert.match(ohne(R('css/components.css')), /:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible \{\s*outline: 2px solid/);
    });
    it('Schrift 11 px und Ziele 24 px im Handy-Block', () => {
        const css = ohne(R('css/mobile-responsive.css'));
        assert.match(css, /#meta-call \.mc-rec-table \.mc-rec-chevron,[\s\S]*?font-size: 11px/);
        assert.match(css, /#meta-call \.mc-mct-haken \{ width: 24px; height: 24px; \}/);
        assert.match(css, /#city-league \.trend-icon,/);
    });
    it('Champions: Platz fuer das Kopiersymbol', () => {
        const css = ohne(R('css/side-quest.css'));
        const blk = css.slice(css.indexOf('.side-quest-copy-btn {'));
        assert.match(blk.slice(0, blk.indexOf('}')), /padding-right: 1\.9rem/);
    });
    it('Deck bauen: kein Scrollbereich im Scrollbereich am Handy', () => {
        assert.match(ohne(R('css/profile-deck-builder.css')), /@media \(max-width: 640px\) \{\s*\.pdb-results-grid \{ max-height: none; overflow-y: visible; \}/);
    });
});

describe('UI-95 Referenz-Listen kopieren', () => {
    const src = R('js/current-meta-quickref.js');
    const g = { document: undefined, getLang: () => 'de' };
    g.window = g;
    vm.runInNewContext(src, { window: g, globalThis: g, document: undefined, console });
    const I = g._currentMetaQuickRefInternals;
    it('PTCGL-Text mit Kartenzahlen je Abschnitt (ausgefuehrt)', () => {
        const txt = I._refAlsPtcgl([
            { name: 'Dreepy', set_code: 'twm', set_number: '128', count: 4, type: 'Pokemon' },
            { name: 'Ultra Ball', set_code: 'SVI', set_number: '196', count: 3, type: 'Item' },
            { name: 'Iono', set_code: 'PAL', set_number: '185', count: 2, type: 'Supporter' },
            { name: 'Basic Psychic Energy', set_code: 'SVE', set_number: '5', count: 5, type: 'Basic Energy' },
        ]);
        assert.match(txt, /^Pokémon: 4\n4 Dreepy TWM 128\n\nTrainer: 5\n/);
        assert.match(txt, /\n\nEnergy: 5\n5 Basic Psychic Energy SVE 5\n\nTotal Cards: 14$/);
    });
    it('Knopf unter beiden Listen, Kopf ohne feste helle Flaeche', () => {
        assert.strictEqual((src.match(/_kopierKnopf\('(major|online)'\)/g) || []).length, 2);
        assert.doesNotMatch(src, /#eff6ff 0%, #dbeafe/);
    });
});
