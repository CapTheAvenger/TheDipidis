'use strict';
/*
 * Rutsch C (01.10.2026): DA-17, UI-49, UI-40.
 *
 *  - UI-49: die Tageszahl im Etikett "Auto: seit {date} ({days} Tage)" kommt
 *    aus dem Datum (heute minus Grenze) — _autoFensterTage wird AUSGEFUEHRT.
 *  - DA-17: der Lag-Fenster-Waechter leert die Labs-Aggregate des Vorformats,
 *    NICHT die Online-Turnierdaten (_tournamentStats, _gezaehlteQuote).
 *    Quelltext ohne Kommentare, der Block des Waechters.
 *  - UI-40: datenZeile() in js/ds-sections.js nennt Online- und Major-Format
 *    einmal in der Ueberschrift — ausgefuehrt mit gesetzten Formaten.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (...t) => fs.readFileSync(path.join(ROOT, ...t), 'utf8');
const MC = lies('js', 'app-meta-call.js');
const DS = lies('js', 'ds-sections.js');
const I18N = lies('js', 'i18n.js');

function ohneKommentare(q) {
    return q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
}

function funktion(quelle, kopf) {
    const i = quelle.indexOf(kopf);
    assert.ok(i >= 0, kopf + ' fehlt');
    let tiefe = 0, j = quelle.indexOf('{', i);
    const start = i;
    for (; j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) break; }
    }
    return quelle.slice(start, j + 1);
}

describe('UI-49: die Tageszahl im Datenfenster-Etikett', () => {
    const lade = (heute) => {
        const ctx = { _todayISO: () => heute };
        vm.createContext(ctx);
        vm.runInContext(funktion(MC, 'function _autoFensterTage(') + '\nthis.f = _autoFensterTage;', ctx);
        return ctx.f;
    };
    it('zaehlt heute minus Grenze', () => {
        assert.strictEqual(lade('2026-10-01')('2026-09-16'), 15);
        assert.strictEqual(lade('2026-10-01')('2026-10-01'), 0);
        assert.strictEqual(lade('2026-03-01')('2026-02-01'), 28, 'Februar 2026 hat 28 Tage');
    });
    it('erfindet bei einer unbrauchbaren Grenze nichts', () => {
        assert.strictEqual(lade('2026-10-01')(''), 0);
        assert.strictEqual(lade('2026-10-01')('demnaechst'), 0);
        assert.strictEqual(lade('2026-10-01')('2026-12-01'), 0, 'eine Grenze in der Zukunft ist keine negative Zahl');
    });
    it('beide Sprachen tragen {days} und sagen nicht mehr schlicht "letzte 28 Tage"', () => {
        const zeilen = I18N.split('\n').filter((z) => z.includes("'mc.dateWindowAuto'"));
        assert.strictEqual(zeilen.length, 2);
        zeilen.forEach((z) => {
            assert.match(z, /\{days\}/);
            assert.match(z, /\{date\}/);
            assert.doesNotMatch(z, /letzte 28 Tage|last 28 days/);
        });
    });
});

describe('DA-17: der Lag-Fenster-Waechter laesst die Online-Turnierdaten stehen', () => {
    const code = ohneKommentare(MC);
    const a = code.indexOf('if (_currentMetaLagWindow) {');
    assert.ok(a > 0, 'der Waechter ist nicht mehr auffindbar');
    const block = code.slice(a, code.indexOf('console.info(', a));
    it('leert die Labs-Aggregate des Vorformats (Vorpruefung gegen ein leeres Bestehen)', () => {
        assert.match(block, /_labsConvByDeck = \{\}/);
        assert.match(block, /_labsMajorRows = 0/);
    });
    it('leert _tournamentStats nicht', () => {
        assert.doesNotMatch(block, /_tournamentStats\s*=/);
    });
    it('setzt _gezaehlteQuote nicht zurueck', () => {
        assert.doesNotMatch(block, /_gezaehlteQuote\s*=/);
    });
});

describe('UI-40: Online- und Major-Format einmal in der Ueberschrift', () => {
    const lade = (jetzt, major) => {
        const ctx = {};
        ctx.window = ctx;
        if (jetzt !== null) ctx.getCurrentMetaFormat = () => jetzt;
        if (major !== null) ctx.getMajorDatenFormat = () => major;
        vm.createContext(ctx);
        vm.runInContext([funktion(DS, 'function datenZeile('), funktion(DS, 'function fuelleDaten(')].join('\n')
            + '\nthis.f = fuelleDaten;', ctx);
        return ctx.f;
    };
    it('nennt beide Formate', () => {
        assert.strictEqual(lade('TEF-30C', 'TEF-PBL')('{daten}'), 'Online: TEF–30C · Major: TEF–PBL');
    });
    it('haengt hinter einen Text, ohne einen Rest-Punkt zu hinterlassen', () => {
        assert.strictEqual(lade('TEF-30C', 'TEF-PBL')('alle Archetypen · {daten}'), 'alle Archetypen · Online: TEF–30C · Major: TEF–PBL');
        assert.strictEqual(lade(null, null)('alle Archetypen · {daten}'), 'alle Archetypen');
    });
    it('behauptet nichts, was unbekannt ist', () => {
        assert.strictEqual(lade('TEF-30C', '')('{daten}'), 'Online: TEF–30C');
        assert.strictEqual(lade('', 'TEF-PBL')('{daten}'), 'Major: TEF–PBL');
        assert.strictEqual(lade(null, null)('{daten}'), '');
    });
    it('Heatmap und Tier-Liste tragen den Platzhalter, der Major-Schluessel wird gemeldet', () => {
        const abschnitte = DS.slice(DS.indexOf('var SECTIONS = ['), DS.indexOf('\n    ];', DS.indexOf('var SECTIONS = [')));
        const heat = /id: 'heatmap'[\s\S]*?id: 'tiers'/.exec(abschnitte)[0];
        assert.match(heat, /\{daten\}/);
        assert.match(/id: 'tiers'[\s\S]*?id: 'rang'/.exec(abschnitte)[0], /\{daten\}/);
        assert.match(lies('js', 'app-archetype-card.js'), /dispatchEvent\(new Event\('majorFormatGeladen'\)\)/);
        assert.match(DS, /addEventListener\('majorFormatGeladen', neuBeschriften\)/);
    });
});

describe('Alle Boxen: Kartenplaetze und verschiedene Karten (01.10.2026)', () => {
    const QUELLE = lies('js', 'archetyp-box.js');
    const L = (() => { const c = { module: { exports: {} }, console }; vm.runInNewContext(QUELLE, c); return c.module.exports; })();
    const k = (id, set, nr) => ({ id, set, number: nr, name: id, typ: 'Pokemon' });
    it('zaehlt (Set, Nummer) einmal, auch wenn die Karte in mehreren Boxen liegt', () => {
        const a = { karten: [k('A', 'ASC', '16'), k('B', 'TEF', '1')] };
        const b = { karten: [k('A', 'ASC', '16'), k('C', 'PAL', '5')] };
        assert.strictEqual(L.verschiedeneKarten([a, b]), 3, '4 Plaetze, 3 verschiedene');
        assert.strictEqual(L.verschiedeneKarten([]), 0);
    });
    it('verbindet nie ueber den Namen: gleicher Name, anderer Druck = zwei Karten', () => {
        const a = { karten: [k('Budew', 'ASC', '16'), k('Budew', 'PRE', '4')] };
        assert.strictEqual(L.verschiedeneKarten([a]), 2);
    });
    it('der Chip "Alle Boxen" nennt beide Zahlen', () => {
        assert.match(QUELLE, /alle\.verschieden = verschiedeneKarten\(boxen\)/);
        assert.match(QUELLE, /u\.verschieden != null\s*\?\s*tx\('abx\.chipUmfangAlle'/);
        assert.strictEqual(I18N.split("'abx.chipUmfangAlle':").length - 1, 2);
        assert.strictEqual(I18N.split("'abx.chipOffenAlle':").length - 1, 2);
    });
});
