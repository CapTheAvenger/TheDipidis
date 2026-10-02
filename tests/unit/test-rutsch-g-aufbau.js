'use strict';
/**
 * Rutsch G (02.10.2026) — Meta Call:
 *   UI-60: "Dein Deck" steht beim Turnier OBEN, darunter eine kleine
 *          Ergebnis-Uebersicht, die refreshResults() mitzeichnet; die
 *          Meta-Tabelle kommt danach (vorher: Tabelle -> Deck -> Ergebnis, die
 *          Spalte "Deine Win-Rate" war ohne Deck leer).
 *   UI-61: Turniereinstellungen kompakt, Typ-Pillen oval.
 * Die Render-Funktionen werden aus der Quelle geschnitten und AUSGEFUEHRT.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { baue, lies } = require('./lib-dom-sandkasten.js');

const MC = 'js/app-meta-call.js';
const QUELLE = lies('js', 'app-meta-call.js');
const CSS = lies('css', 'meta-call.css');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function renderAllRumpf(src) {
    const a = src.indexOf('function renderAll()');
    const b = src.indexOf('function _inFrozenPastMode()', a);
    return src.slice(a, b);
}
function reihenfolge(rumpf) {
    const marken = ['_renderCombinedConfigPanel(', 'renderSettingsPanel()', 'renderMyDeckPanel()',
        'renderUebersichtPanel(field)', 'renderFieldPanel(field)', 'renderDeckGegenMetaPanel(field)',
        'renderResultsPanel(field)'];
    return marken.map(m => rumpf.indexOf(m));
}

describe('UI-60: Reihenfolge', () => {
    it('Turnier -> Deck -> Uebersicht -> Meta-Tabelle -> Detail', () => {
        const p = reihenfolge(renderAllRumpf(QUELLE));
        assert.ok(p.every(i => i > 0), 'jede Marke steht in renderAll: ' + p);
        for (let i = 1; i < p.length; i++) assert.ok(p[i - 1] < p[i], 'Marke ' + i + ' folgt auf ' + (i - 1) + ': ' + p);
    });
    it('VERFAELSCHUNG: steht die Deck-Wahl wieder unter der Tabelle, schlaegt die Pruefung an', () => {
        const kaputt = QUELLE.replace('${_inFrozenPastMode() ? \'\' : renderMyDeckPanel()}\n', '')
            .replace('${_inFrozenPastMode() ? \'\' : renderResultsPanel(field)}',
                '${_inFrozenPastMode() ? \'\' : renderMyDeckPanel()}\n  ${_inFrozenPastMode() ? \'\' : renderResultsPanel(field)}');
        const p = reihenfolge(renderAllRumpf(kaputt));
        const ok = p.every(i => i > 0) && p.every((x, i) => i === 0 || p[i - 1] < x);
        assert.equal(ok, false);
    });
    it('refreshResults zeichnet die Uebersicht mit (sonst steht sie auf dem Feld von vorhin)', () => {
        const a = QUELLE.indexOf('function refreshResults()');
        const b = QUELLE.indexOf('// ── Share Images', a);
        assert.match(QUELLE.slice(a, b), /renderUebersichtPanel\(field\)/);
    });
    it('im eingefrorenen Vergangenheits-Meta bleibt die Uebersicht aus', () => {
        const ctx = baue(MC, ['function renderUebersichtPanel('], {
            _inFrozenPastMode: () => true, _settings: {}, esc, t: (k) => k });
        assert.equal(ctx.renderUebersichtPanel([]), '');
    });
});

function uebersicht(o) {
    return baue(MC, ['function renderUebersichtPanel('], Object.assign({
        _inFrozenPastMode: () => false, _evL: (d) => d, _evQuotenName: () => 'Siegquote',
        _mcNum: (n, k) => n.toFixed(k).replace('.', ','), _mcPz: () => ' %',
        _predictTitleKey: () => 'mc.day2Chance', esc, t: (k) => k,
        _settings: { myDeck: 'Dragapult', day2Points: 18, rounds: 9 },
        _evRechne: () => ({ ev: 53.4 }),
        calcDay2: () => ({ day2Prob: 0.41 }),
    }, o || {}));
}
describe('UI-60: Uebersicht', () => {
    it('ohne Deck: eine Aufforderung, keine Zahl', () => {
        const h = uebersicht({ _settings: { myDeck: '' } }).renderUebersichtPanel([]);
        assert.match(h, /mc-uebersicht-leer/);
        assert.ok(!/mc-uebersicht-wert/.test(h));
    });
    it('mit Deck: Quote und Day-2-Chance kommen aus _evRechne / calcDay2', () => {
        const h = uebersicht().renderUebersichtPanel([]);
        assert.match(h, /53,4/);
        assert.match(h, /41,0/);
        assert.match(h, /pct-mid/);
        assert.match(h, /ab 18 Punkten nach 9 Runden/);
    });
    it('VERFAELSCHUNG: aendert sich die Rechnung, aendert sich die Zahl', () => {
        const h = uebersicht({ _evRechne: () => ({ ev: 61.2 }), calcDay2: () => ({ day2Prob: 0.7 }) })
            .renderUebersichtPanel([]);
        assert.match(h, /61,2/);
        assert.match(h, /70,0/);
        assert.ok(!/53,4/.test(h));
    });
    it('ohne gemessene Paarung: Gedankenstrich statt erfundener Quote', () => {
        const h = uebersicht({ _evRechne: () => null }).renderUebersichtPanel([]);
        assert.match(h, /—/);
        assert.match(h, /keine gemessene Paarung/);
    });
});

function einstellungen(typ) {
    return baue(MC, ['function renderSettingsPanel('], {
        _settings: { tournamentType: typ, totalPlayers: 200, rounds: 9, day2Points: 19, topCutSize: 8, tournamentName: '' },
        TOURNAMENT_TYPES: ['regional', 'challenge', 'cup'], MAJOR_TYPES: ['regional'],
        _typeLabelI18nKey: (k) => 'lbl.' + k, _typeDescI18nKey: (k) => 'desc.' + k,
        _rundenHerkunftHinweis: () => '', _playersInputTouched: false, esc, t: (k) => k,
        MetaCall: {}, _mcIstDeutsch: () => true,
    });
}
describe('UI-61: kompakte Turniereinstellungen', () => {
    it('keine Absatz-Hinweise mehr; Beschreibung liegt hinter dem ⓘ', () => {
        const h = einstellungen('cup').renderSettingsPanel();
        assert.ok(!/mc-tt-hint/.test(h), 'kein mc-tt-hint-Absatz');
        assert.match(h, /mc-typ-info[^>]*title="desc\.cup/);
        assert.match(h, /mc-einzeilig/);
        assert.ok(!/mc-bild-hinweis/.test(h));
    });
    it('alle Felder bleiben: Spieler, Runden, Punkte, Name, Top-Cut beim Cup, Bild-Knoepfe', () => {
        const h = einstellungen('cup').renderSettingsPanel();
        for (const id of ['mc-players', 'mc-rounds', 'mc-day2pts', 'mc-turniername', 'mc-topcut', 'mc-grenzen-hinweis'])
            assert.ok(h.includes('id="' + id + '"'), id);
        assert.match(h, /generateTournamentImage/);
        assert.match(h, /postSeiteOeffnen/);
        assert.equal((h.match(/class="mc-tt-tab(?: mc-tt-tab-active)?"/g) || []).length, 3);
    });
    it('Swiss-Rechner nur bei lokalen Turnieren', () => {
        assert.match(einstellungen('challenge').renderSettingsPanel(), /swisscalc/);
        assert.ok(!/swisscalc/.test(einstellungen('regional').renderSettingsPanel()));
    });
    it('Pillen sind oval (999px) und die Regel gilt fuer .mc-tt-tab', () => {
        const m = CSS.match(/\.mc-tt-tab\s*\{[^}]*\}/g) || [];
        assert.ok(m.some(r => /border-radius:\s*999px/.test(r)), 'eine .mc-tt-tab-Regel mit 999px');
    });
    it('VERFAELSCHUNG: ohne die 999px-Regel faellt die Pruefung durch', () => {
        const css = CSS.replace(/(\.mc-tt-tab\s*\{[^}]*?)border-radius:\s*999px;/, '$1');
        const m = css.match(/\.mc-tt-tab\s*\{[^}]*\}/g) || [];
        assert.ok(!m.some(r => /border-radius:\s*999px/.test(r)));
    });
});
