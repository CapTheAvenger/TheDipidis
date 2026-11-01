/**
 * UI-154 (Hausi, 01.11.2026): Japan-Seite, unten „Meistgespielte Karten – nur in Japan“.
 * Die Rechenfunktionen werden AUSGEFUEHRT (vm) an Daten, die der Test selbst setzt — keine Live-Daten
 * (Wachhund test-testdaten-wachhund.js). Ob die Live-Daten die _JP_-Regel noch tragen, ist eine
 * Beobachtung fuer den Data Guardian, kein Unit-Test.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKommentare = (t) => t.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

const JS = lies('js/app-city-league.js');
const CSS = lies('css/deck-analyse.css');

function schneide(quelle, name) {
    const t = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(t, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', t.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(t.index, i + 1);
    }
    throw new Error('Klammer nicht geschlossen: ' + name);
}
function laden(quelle) {
    const ctx = vm.createContext({ Object, Math, String, Number, isFinite, parseFloat, Array,
        escapeHtml: (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') });
    vm.runInContext(['cityLeagueJpDruck', '_clZahl', 'cityLeagueJpKartenBerechnen', 'cityLeagueJpListeText', 'cityLeagueJpKartenHtml']
        .map((n) => schneide(quelle, n)).join('\n'), ctx);
    return ctx;
}
const JP = 'https://x/tpc/M6/M6_62_R_JP_LG.png', EN = 'https://x/tpci/TWM/TWM_1_R_EN_LG.png';
const z = (o) => Object.assign({ tournament_id: '1', archetype: 'A', total_decks_in_archetype: '4', deck_inclusion_count: '2',
    max_count: '3', card_name: 'Talonflame ex', set_code: 'M6', set_number: '62', image_url: JP, type: 'Stage 2' }, o);

describe('UI-154 Rechnung', () => {
    const c = laden(JS);
    const zeilen = [
        z({}), z({ archetype: 'B', total_decks_in_archetype: '6', deck_inclusion_count: '5', max_count: '4' }),
        z({ card_name: 'Switch', set_code: 'TWM', set_number: '1', image_url: EN, archetype: 'B' }),
        z({ card_name: 'Giratina', set_number: '31', image_url: JP.replace('62', '31'), deck_inclusion_count: '1', max_count: '1' })
    ];
    const e = c.cityLeagueJpKartenBerechnen(zeilen);
    it('nur japanische Drucke; Listen je (Turnier, Archetyp) einmal gezaehlt', () => {
        assert.equal(e.karten.length, 2);
        assert.equal(e.listenGesamt, 10); // A: 4, B: 6
    });
    it('Reihenfolge nach Listen, Kopien = Hoechstwert, Anteil = Listen / alle Listen', () => {
        assert.equal(e.karten[0].name, 'Talonflame ex');
        assert.equal(e.karten[0].listen, 7);
        assert.equal(e.karten[0].maxKopien, 4);
        assert.ok(Math.abs(e.karten[0].anteil - 70) < 1e-9);
        assert.equal(e.karten[0].archetypen, 2);
    });
    it('verbunden wird ueber (Set, Nummer), nicht ueber den Namen', () => {
        const zwei = c.cityLeagueJpKartenBerechnen([z({}), z({ set_number: '63' })]);
        assert.equal(zwei.karten.length, 2);
    });
    it('Textliste: eine Zeile je Karte mit Set und Nummer', () => {
        const t = c.cityLeagueJpListeText(e.karten);
        assert.equal(t.split('\n')[0], '4× Talonflame ex (M6 62)');
        assert.equal(t.split('\n').length, 2);
    });
    it('Karte in einer Liste steht nicht als 0,0 % da', () => {
        const eins = c.cityLeagueJpKartenBerechnen([z({ deck_inclusion_count: '1', total_decks_in_archetype: '4000' })]);
        const h = c.cityLeagueJpKartenHtml(eins, true);
        assert.ok(h.includes('&lt;0,1 %') || h.includes('<0,1 %'), h);
        assert.ok(!h.includes('0,0 %'));
    });
    it('leere Daten: ehrlicher Leerzustand statt leerer Flaeche', () => {
        const h = c.cityLeagueJpKartenHtml(c.cityLeagueJpKartenBerechnen([z({ image_url: EN })]), true);
        assert.ok(h.includes('jp-karten-leer'));
    });
});

describe('UI-154 Verdrahtung', () => {
    it('Platz unten auf der Seite und Aufruf nach dem Zeichnen', () => {
        const j = ohneKommentare(JS);
        assert.ok(/<div id="cityLeagueJpKarten" class="jp-karten"><\/div>\s*<div class="city-league-info-generated-block">/.test(j));
        assert.ok(/content\.innerHTML = html;\s*if \(typeof cityLeagueJpKartenZeichnen === 'function'\) cityLeagueJpKartenZeichnen\(\);/.test(j));
    });
    it('Knopf nicht vollbreit, mindestens 44 px; Handy drei Spalten', () => {
        const css = ohneKommentare(CSS);
        assert.ok(/\.jp-karten-kopieren\s*\{[^}]*width:\s*auto\s*!important/.test(css));
        assert.ok(/\.jp-karten-kopieren\s*\{[^}]*min-height:\s*44px/.test(css));
        assert.ok(/max-width:\s*480px\)\s*\{[^}]*\.jp-karten-grid\s*\{[^}]*repeat\(3,\s*1fr\)/.test(css));
    });
    it('Wortlaut: „Print“, nicht „Druck“ (Lexikon)', () => {
        const j = ohneKommentare(schneide(JS, 'cityLeagueJpKartenHtml'));
        assert.ok(!/Druck/.test(j));
    });
    it('Verfaelschungsprobe: ohne die _JP_-Regel zaehlt eine internationale Karte mit', () => {
        const kaputt = JS.replace("/_JP_/.test(", "/./.test(");
        assert.notEqual(kaputt, JS);
        const c = laden(kaputt);
        const e = c.cityLeagueJpKartenBerechnen([z({ card_name: 'Switch', set_code: 'TWM', set_number: '1', image_url: EN })]);
        assert.equal(e.karten.length, 1, 'Probe muss die Regel brechen');
        const ok = laden(JS).cityLeagueJpKartenBerechnen([z({ card_name: 'Switch', set_code: 'TWM', set_number: '1', image_url: EN })]);
        assert.equal(ok.karten.length, 0);
    });
});
