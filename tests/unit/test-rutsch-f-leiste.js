'use strict';
/**
 * Rutsch F (01.10.2026) — Meta Call nach Hausis Rueckmeldung (UI-59):
 *   - das Meta heisst beim Namen (TEF–30C), eine Wahl gibt es NUR im Uebergang
 *     (Online spielt schon das neue Set, die Majors laufen noch im vorigen
 *     Format: heute < in_person_legal_date) — dann mit genau einem Gegenstueck,
 *     dem vorigen Format aus previous_format_key;
 *   - Datenfenster, Modus und Datenquellen stehen hinter einem Zahnrad, das
 *     standardmaessig zu ist;
 *   - der Rundenhinweis ist ein kleines ⓘ statt eines Absatzes.
 * Die Funktionen werden aus der Quelle geschnitten und AUSGEFUEHRT.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { baue, lies } = require('./lib-dom-sandkasten.js');

const MC = 'js/app-meta-call.js';
const QUELLE = lies('js', 'app-meta-call.js');
const CSS = lies('css', 'meta-call.css');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const heute = new Date().toISOString().slice(0, 10);
const tage = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const FENSTER = (legal) => ({
    oldest_legal_set: 'TEF', current_set: '30C', previous_format_key: 'TEF-PBL',
    in_person_legal_date: legal,
});
const KATALOG = [{ key: 'TEF-PBL' }, { key: 'TEF-POR' }];

function panel(o) {
    const ctx = baue(MC, ['function _metaUebergang(', 'function renderMetaSourcePanel('], Object.assign({
        _formatWindow: FENSTER(tage(5)), _pastMetaAvailableFormats: KATALOG,
        _metaSource: 'current', _pastMetaFormatKey: null,
        _mcIstDeutsch: () => true, esc, t: (k) => k,
    }, o || {}));
    return ctx;
}

describe('UI-59: Wahl nur im Uebergang', () => {
    it('im Uebergang: neues Meta und GENAU ein Gegenstueck, beide beim Namen', () => {
        const html = panel().renderMetaSourcePanel();
        assert.match(html, /TEF–30C · neu online/);
        assert.match(html, /TEF–PBL · Majors noch aktiv/);
        assert.equal((html.match(/<button/g) || []).length, 2);
        assert.ok(!/TEF–POR/.test(html), 'weitere Vergangenheits-Formate gehoeren nicht in die Leiste');
        assert.match(html, /_setMetaSource\('past', 'TEF-PBL'\)/);
    });
    it('ausserhalb des Uebergangs: nur der Name, keine Knoepfe', () => {
        const html = panel({ _formatWindow: FENSTER(tage(-5)) }).renderMetaSourcePanel();
        assert.match(html, /mc-meta-name">TEF–30C</);
        assert.equal((html.match(/<button/g) || []).length, 0);
    });
    it('der Tag der Legalitaet selbst ist schon kein Uebergang mehr', () => {
        const html = panel({ _formatWindow: FENSTER(heute) }).renderMetaSourcePanel();
        assert.equal((html.match(/<button/g) || []).length, 0);
    });
    it('fehlt das vorige Format im Katalog, gibt es nichts zu waehlen', () => {
        const html = panel({ _pastMetaAvailableFormats: [{ key: 'TEF-POR' }] }).renderMetaSourcePanel();
        assert.equal((html.match(/<button/g) || []).length, 0);
    });
    it('wer schon im Vergangenheits-Blick steht, behaelt den Weg zurueck (M1)', () => {
        const html = panel({ _formatWindow: FENSTER(tage(-5)), _metaSource: 'past', _pastMetaFormatKey: 'TEF-PBL' })
            .renderMetaSourcePanel();
        assert.equal((html.match(/<button/g) || []).length, 2);
        assert.match(html, /_setMetaSource\('current'\)/);
        assert.match(html, /TEF–PBL · vorheriges Meta/);
    });
    it('ohne Formatfenster bleibt die Leiste leer statt "undefined" zu zeigen', () => {
        assert.equal(panel({ _formatWindow: null }).renderMetaSourcePanel(), '');
    });
    it('englisch', () => {
        const html = panel({ _mcIstDeutsch: () => false }).renderMetaSourcePanel();
        assert.match(html, /new online/);
        assert.match(html, /majors still on/);
    });
});

describe('UI-59: Zahnrad', () => {
    function leiste(o) {
        return baue(MC, ['function _optionenAbweichend(', 'function _renderCombinedConfigPanel('], Object.assign({
            _metaCallMode: 'standard', _useClCurrent: false, _useClPast: false, window: {},
            _optionenOffen: false, esc, _mcIstDeutsch: () => true,
            renderMetaSourcePanel: () => '<i id="QUELLE"></i>',
            renderMetaCallModePanel: () => '<i id="MODUS"></i>',
            renderSourcesPanel: () => '<i id="DATEN"></i>',
        }, o || {}));
    }
    it('Standard: zu, ohne Punkt; Datenfenster, Modus und Quellen liegen im Zahnrad-Fenster', () => {
        const html = leiste()._renderCombinedConfigPanel('<i id="DATUM"></i>');
        assert.ok(!/mc-optionen-wrap offen/.test(html));
        assert.ok(!/hat-punkt/.test(html));
        const fenster = html.slice(html.indexOf('class="mc-optionen"'));
        for (const id of ['DATUM', 'MODUS', 'DATEN']) assert.ok(fenster.includes('id="' + id + '"'), id + ' liegt nicht im Zahnrad-Fenster');
        assert.ok(html.indexOf('id="QUELLE"') < html.indexOf('mc-optionen-wrap'), 'die Quelle steht links, vor dem Zahnrad');
    });
    it('abweichende Einstellung: das Zahnrad traegt den Punkt', () => {
        assert.match(leiste({ _metaCallMode: 'counter' })._renderCombinedConfigPanel(''), /hat-punkt/);
    });
    it('offen gemerkt: das Fenster bleibt beim Neuzeichnen offen', () => {
        assert.match(leiste({ _optionenOffen: true })._renderCombinedConfigPanel(''), /mc-optionen-wrap offen/);
    });
    it('CSS: zu ist display:none, offen display:flex, das Zahnrad steht rechts', () => {
        assert.match(CSS, /\.mc-optionen \{\s*display: none;/);
        assert.match(CSS, /\.mc-optionen-wrap\.offen \.mc-optionen \{ display: flex; \}/);
        assert.match(CSS, /\.mc-optionen-wrap \{[^}]*margin-left: auto/);
    });
    it('der alte Haken ist weg: kein Erweitert-Schalter, kein Speicherschluessel', () => {
        for (const alt of ['mc-erweitert', 'mc-schlicht', '_setErweitert', '_istErweitert', 'metacall_erweitert_v1']) {
            assert.ok(!QUELLE.includes(alt), alt + ' steht noch im Code');
        }
    });
    it('Rundenhinweis: ein kleines ⓘ mit dem Satz im Titel, kein Absatz mehr', () => {
        const fn = baue(MC, ['function _rundenHerkunftHinweis('], {
            MAJOR_TYPES: ['regional'], MAJOR_DAY2_POINTS: { 8: 16, 9: 19 },
            _settings: { rounds: 8 }, _mcIstDeutsch: () => true, esc,
        })._rundenHerkunftHinweis;
        const html = fn('regional');
        assert.match(html, /^<span class="mc-runden-info"/);
        assert.match(html, /title="Runden sind hier eine Eingabe/);
        assert.ok(!/<p /.test(html));
    });
});
