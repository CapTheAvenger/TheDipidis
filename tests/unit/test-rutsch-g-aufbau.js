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
/* UI-62 (02.10.2026): zwei Schritte statt vier; Ergebnis, Day-2 und Bilanz
   stehen als Kacheln direkt unter der Deck-Wahl, die Tabelle „Alle Paarungen",
   das Histogramm und die Begegnungsliste sind entfernt. */
function reihenfolge(rumpf) {
    const marken = ['_mcSchritt(1,', '_renderCombinedConfigPanel(', 'renderSettingsPanel(', 'renderMyDeckPanel()',
        'renderDeckGegenMetaPanel(field)', '_mcSchritt(2,', 'renderFieldPanel(field)',
        'renderRecommendationsPanel(field)', 'renderBildZeile()'];
    return marken.map(m => rumpf.indexOf(m));
}

describe('UI-60/62: Reihenfolge', () => {
    it('Turnier -> Deck -> Ergebnis-Kacheln -> Meta-Tabelle -> Empfehlungen -> Bild', () => {
        const p = reihenfolge(renderAllRumpf(QUELLE));
        assert.ok(p.every(i => i > 0), 'jede Marke steht in renderAll: ' + p);
        for (let i = 1; i < p.length; i++) assert.ok(p[i - 1] < p[i], 'Marke ' + i + ' folgt auf ' + (i - 1) + ': ' + p);
    });
    it('VERFAELSCHUNG: steht die Deck-Wahl wieder unter der Tabelle, schlaegt die Pruefung an', () => {
        const kaputt = QUELLE.replace('${_inFrozenPastMode() ? \'\' : renderMyDeckPanel()}\n', '')
            .replace('${_inFrozenPastMode() ? \'\' : renderFieldPanel(field)}',
                '${_inFrozenPastMode() ? \'\' : renderFieldPanel(field)}\n  ${_inFrozenPastMode() ? \'\' : renderMyDeckPanel()}');
        const p = reihenfolge(renderAllRumpf(kaputt));
        const ok = p.every(i => i > 0) && p.every((x, i) => i === 0 || p[i - 1] < x);
        assert.equal(ok, false);
    });
    it('die entfernten Bloecke sind weg: Ergebnis-Karte, Histogramm, Begegnungsliste, Einzeltabelle', () => {
        for (const weg of ['function renderResultsPanel(', 'function renderUebersichtPanel(', 'mc-histogram-wrap',
            'mc-encounter-row', 'Alle Paarungen einzeln']) {
            assert.ok(!QUELLE.includes(weg), weg + ' ist wieder da');
        }
    });
    it('refreshResults zeichnet die Kacheln mit (sonst stehen sie auf dem Feld von vorhin)', () => {
        const a = QUELLE.indexOf('function refreshResults()');
        const b = QUELLE.indexOf('// ── Share Images', a);
        assert.match(QUELLE.slice(a, b), /renderDeckGegenMetaPanel\(field\)/);
    });
    it('im eingefrorenen Vergangenheits-Meta bleibt der Block aus', () => {
        const ctx = baue(MC, ['function renderDeckGegenMetaPanel('], {
            _inFrozenPastMode: () => true, _settings: {}, esc, t: (k) => k });
        assert.equal(ctx.renderDeckGegenMetaPanel([]), '');
    });
    it('die Schritt-Titel stimmen mit der Zahl der Schritte ueberein (kein verschobener Index)', () => {
        const ctx = baue(MC, ['function _mcSchritte('], { _mcIstDeutsch: () => true });
        const titel = ctx._mcSchritte().map(x => x.t);
        assert.equal(JSON.stringify(titel), JSON.stringify(['Turnier und Deck', 'Das Meta und deine Chancen']));
        const rumpf = renderAllRumpf(QUELLE);
        const benutzt = [...rumpf.matchAll(/_SCHRITTE\[(\d+)\]/g)].map(m => Number(m[1]));
        assert.ok(benutzt.length && benutzt.every(i => i < titel.length), 'Index hinter dem Ende: ' + benutzt);
    });
    it('VERFAELSCHUNG: ein dritter Index waere hinter dem Ende', () => {
        const kaputt = renderAllRumpf(QUELLE).replace('_SCHRITTE[1]', '_SCHRITTE[2]');
        const benutzt = [...kaputt.matchAll(/_SCHRITTE\[(\d+)\]/g)].map(m => Number(m[1]));
        assert.ok(!benutzt.every(i => i < 2));
    });
});

// FE-33 (03.10.2026): das Panel rechnet die Siege ueber _erwarteteSiege.
const ABHAENGIG = ['function _erwarteteSiege(', 'function renderDeckGegenMetaPanel('];
function uebersicht(o) {
    return baue(MC, ABHAENGIG, Object.assign({
        _inFrozenPastMode: () => false, _evL: (d) => d, _evQuotenName: () => 'Siegquote',
        _mcNum: (n, k) => n.toFixed(k).replace('.', ','), _mcPz: () => ' %',
        _predictTitleKey: () => 'mc.day2Chance', esc, t: (k) => k, zahlLokal: (n) => String(n),
        _settings: { myDeck: 'Dragapult', day2Points: 18, rounds: 9 },
        _evRechne: () => ({ ev: 53.4, unten: 49, oben: 58, sd: 2, partien: 400, abdeckung: 80, gegner: 12,
            eigene: 0, ohneBand: 0, zeilen: [] }),
        calcDay2: () => ({ day2Prob: 0.41, expWin: 5.1, expLoss: 3.4, expTie: 0.5 }),
        _evUmfang: 'alle', _evEinzel: '', _evKandidaten: () => [], normalize: (x) => x, EV_TOP_N: 8,
        _evVorbereitungHtml: () => '', _mcIconHtml: () => '', _evUmfangZeile: () => '',
        _evAbgrenzungDe: () => '', _evAbgrenzungEn: () => '',
        _day2RechnungsZeile: () => 'RECHNUNG', _day2RahmenZeile: () => 'RAHMEN',
        _unentschiedenQuote: () => ({ gemessen: false, quote: 0.02 }),
    }, o || {}));
}
describe('UI-60/62: Ergebnis-Kacheln', () => {
    it('ohne Deck: eine Aufforderung, keine Zahl', () => {
        const h = uebersicht({ _settings: { myDeck: '' } }).renderDeckGegenMetaPanel([]);
        assert.match(h, /mc-uebersicht-leer/);
        assert.ok(!/mc-ev-wert/.test(h));
    });
    it('mit Deck: Quote, Day-2 (gefaerbt) und Bilanz in der Reihenfolge W–L–T', () => {
        const h = uebersicht().renderDeckGegenMetaPanel([]);
        assert.match(h, /53,4/);
        assert.match(h, /41,0/);
        assert.match(h, /pct-mid/);
        assert.match(h, /ab 18 Punkten nach 9 Runden/);
        const bil = h.match(/mc-ev-bilanz">([\s\S]*?)<\/span>\s*<span class="mc-ev-kontext"/)[1]
            .replace(/<[^>]+>/g, '');
        assert.equal(bil, '5,1–3,4–0,5', 'W–L–T, nicht W–T–L');
    });
    it('VERFAELSCHUNG: aendert sich die Rechnung, aendert sich die Zahl; vertauschte Bilanz faellt auf', () => {
        const h = uebersicht({ calcDay2: () => ({ day2Prob: 0.7, expWin: 7, expLoss: 1, expTie: 1 }) })
            .renderDeckGegenMetaPanel([]);
        assert.match(h, /70,0/);
        assert.ok(!/41,0/.test(h));
        // Vertauschte Bilanz im Quelltext muss auffallen:
        const reihe = /mc-ev-bilanz">[\s\S]*?expWin[\s\S]*?expLoss[\s\S]*?expTie/;
        assert.ok(reihe.test(QUELLE));
        const kaputt = QUELLE.replace('${_mcNum(d2.expLoss, 1)}</span>–<span style="color:#f39c12">${_mcNum(d2.expTie, 1)}',
            '${_mcNum(d2.expTie, 1)}</span>–<span style="color:#f39c12">${_mcNum(d2.expLoss, 1)}');
        assert.notEqual(kaputt, QUELLE, 'die Mutation hat nichts geaendert');
        assert.ok(/mc-ev-bilanz[\s\S]*?d2\.expTie[\s\S]*?d2\.expLoss/.test(kaputt));
    });
    it('keine Erklaersaetze mehr: Lead und Einzeltabelle sind weg, der Rechenweg ist zugeklappt', () => {
        const h = uebersicht().renderDeckGegenMetaPanel([]);
        assert.ok(!/mc-ev-lead/.test(h));
        assert.ok(!/mc-ev-tabelle/.test(h));
        assert.match(h, /<details class="mc-klappe">[\s\S]*Rechenweg/);
        assert.ok(!/<details class="mc-klappe" open/.test(h));
    });
    it('ohne gemessene Paarung: Aussage statt erfundener Quote', () => {
        const h = uebersicht({ _evRechne: () => null }).renderDeckGegenMetaPanel([]);
        assert.match(h, /keine? gemessene Paarung|gemessene Paarung vor/);
        assert.ok(!/mc-ev-wert/.test(h));
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
        const h = einstellungen('cup').renderSettingsPanel(true);
        assert.ok(!/mc-tt-hint/.test(h), 'kein mc-tt-hint-Absatz');
        assert.match(h, /mc-typ-info[^>]*title="desc\.cup/);
        assert.match(h, /mc-einzeilig/);
        assert.ok(!/mc-bild-hinweis/.test(h));
    });
    it('alle Felder bleiben: Spieler, Runden, Punkte, Name, Top-Cut beim Cup, Bild-Knoepfe', () => {
        const h = einstellungen('cup').renderSettingsPanel(false);
        for (const id of ['mc-players', 'mc-rounds', 'mc-day2pts', 'mc-turniername', 'mc-topcut', 'mc-grenzen-hinweis'])
            assert.ok(h.includes('id="' + id + '"'), id);
        assert.ok(!/generateTournamentImage|postSeiteOeffnen/.test(h), 'Bild-Knoepfe stehen jetzt unten');
        assert.ok(!/mc-tt-tab/.test(h), 'die Pillen stehen in der Leiste, nicht hier');
        assert.equal((einstellungen('cup').renderSettingsPanel(true).match(/class="mc-tt-tab(?: mc-tt-tab-active)?"/g) || []).length, 3);
    });
    it('Turnierart-Pillen stehen in der Leiste, Bild-Knoepfe ganz unten', () => {
        const leiste = QUELLE.slice(QUELLE.indexOf('function _renderCombinedConfigPanel('));
        assert.match(leiste.slice(0, 900), /\$\{_renderTurnierartPillen\(\)\}/);
        const rumpf = renderAllRumpf(QUELLE);
        assert.ok(rumpf.indexOf('renderRecommendationsPanel(field)') < rumpf.indexOf('renderBildZeile()'));
    });
    it('Swiss-Rechner nur bei lokalen Turnieren', () => {
        const bild = (typ) => baue(MC, ['function renderBildZeile('], {
            _settings: { tournamentType: typ }, MAJOR_TYPES: ['regional'], esc, t: (k) => k });
        assert.match(bild('challenge').renderBildZeile(), /swisscalc/);
        assert.ok(!/swisscalc/.test(bild('regional').renderBildZeile()));
        assert.match(bild('cup').renderBildZeile(), /generateTournamentImage/);
        assert.match(bild('cup').renderBildZeile(), /postSeiteOeffnen/);
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
