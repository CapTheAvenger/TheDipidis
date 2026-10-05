'use strict';
/**
 * Rutsch E (01.10.2026) — Meta Call nach Hausis Rueckmeldung:
 *   FE-23  „Deine Win-Rate" ist ein Eingabefeld; die getippte Zahl kommt als
 *          genau diese Zahl wieder heraus (Rundreise durch getMatchup).
 *   UI-58  die Decksuche findet auch Decks, die IM Feld stehen.
 *   UI-56  (seit UI-59: Zahnrad) Punkt, sobald eine Einstellung vom Standard abweicht.
 *   DA-30  Kopf und Zeilen sind eine Tabelle (CSS gegen die globale
 *          `table { display: block }`-Regel).
 * Die Funktionen werden aus der Quelle geschnitten und AUSGEFUEHRT.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { baue, lies } = require('./lib-dom-sandkasten.js');

const MC = 'js/app-meta-call.js';
const QUELLE = lies('js', 'app-meta-call.js');
const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const konst = (name) => {
    const m = new RegExp('const ' + name + ' = ([^;]+);').exec(QUELLE);
    assert.ok(m, name + ' fehlt');
    return m[1];
};

function wrUmfeld(overrides) {
    const ctx = {
        normalize, esc, escJs: esc,
        _winRateOverrides: overrides || {},
        _settings: { myDeck: 'Mein Deck' },
        _findByNormalized: (o, n) => { for (const k of Object.keys(o)) if (normalize(k) === normalize(n)) return o[k]; return undefined; },
        _mcPct: (v, d) => v.toFixed(d) + ' %', zahlLokal: (n) => String(n),
        _mctQuotenName: () => 'Win-Rate', _mctWrKopf: () => 'Deine Win-Rate',
        _junkWinRatePct: () => 50,
        getBaseMatchup: () => { throw new Error('Messung darf bei einem Handwert nicht gelesen werden'); },
    };
    const k = new Function('const WR_HAND_UNENTSCHIEDEN = ' + konst('WR_HAND_UNENTSCHIEDEN')
        + '; const WR_EINGABE_MAX = ' + konst('WR_EINGABE_MAX') + '; return [WR_HAND_UNENTSCHIEDEN, WR_EINGABE_MAX];')();
    ctx.WR_HAND_UNENTSCHIEDEN = k[0];
    ctx.WR_EINGABE_MAX = k[1];
    ctx._onWrOverride = (deck, val) => {
        const num = parseFloat(val);
        if (val === '' || isNaN(num)) delete ctx._winRateOverrides[deck];
        else ctx._winRateOverrides[deck] = Math.max(0, Math.min(100, num));
    };
    return ctx;
}
function wrBauen(overrides) {
    const ctx = baue(MC, ['function _wrHandWert(', 'function _mctZelleWr(', 'function _onWrZelle('], wrUmfeld(overrides));
    return ctx;
}
/* getMatchup bis zum Handwert, wie in der Quelle ausgefuehrt. */
function matchupAusQuelle(overrides) {
    const ctx = wrUmfeld(overrides);
    const b = baue(MC, ['function getMatchup('], ctx);
    return b.getMatchup;
}

describe('FE-23: „Deine Win-Rate" ist ein Eingabefeld', () => {
    it('die getippte Zahl kommt als dieselbe Zahl wieder heraus', () => {
        for (const x of [30, 55, 62.5, 0, 90]) {
            const ctx = wrBauen({});
            ctx._onWrZelle('Gegner', String(x));
            const m = matchupAusQuelle(ctx._winRateOverrides)('Mein Deck', 'Gegner');
            // DA-47 (05.10.2026): gezeigt wird S/(S+N), nicht pWin.
            const q = m.pWin / (m.pWin + m.pLoss) * 100;
            assert.ok(Math.abs(q - x) < 1e-6, `${x} getippt, ${q} gezeigt`);
        }
    });
    it('deckelt zu hohe Eingaben und leeren gibt den Messwert zurueck', () => {
        const ctx = wrBauen({});
        ctx._onWrZelle('Gegner', '100');
        const m = matchupAusQuelle(ctx._winRateOverrides)('Mein Deck', 'Gegner');
        assert.ok(m.pWin / (m.pWin + m.pLoss) * 100 <= ctx.WR_EINGABE_MAX + 1e-9);
        ctx._onWrZelle('Gegner', '');
        assert.equal(Object.keys(ctx._winRateOverrides).length, 0);
    });
    it('die Zelle ist ein Feld, traegt „von Hand" nur bei eigenem Wert', () => {
        const ohne = wrBauen({}), mit = wrBauen({ Gegner: 55 });
        const z = { wr: 54.3, wrOhneU: 55, wrPartien: 12, spiegel: false };
        const L = (de) => de;
        const a = ohne._mctZelleWr(z, L, 'Gegner'), b = mit._mctZelleWr(z, L, 'Gegner');
        assert.match(a, /<input[^>]*data-feld="wr"[^>]*data-deck="Gegner"/);
        assert.doesNotMatch(a, /von Hand/);
        assert.match(b, /von Hand/);
        assert.match(a, /value="55"/); // DA-47: die Zelle zeigt S/(S+N)
    });
    it('Spiegel und fehlendes Deck bekommen kein Feld; ohne Messung ein leeres', () => {
        const c = wrBauen({}), L = (de) => de;
        assert.doesNotMatch(c._mctZelleWr({ wr: null, spiegel: true }, L, 'X'), /<input/);
        const leer = c._mctZelleWr({ wr: null, wrOhneU: null, spiegel: false, wrPartien: 0 }, L, 'X');
        assert.match(leer, /<input[^>]*value=""/);
        c._settings.myDeck = '';
        assert.doesNotMatch(c._mctZelleWr({ wr: 50 }, L, 'X'), /<input/);
    });
});

describe('UI-58: die Decksuche findet Decks im Feld', () => {
    function tbody(suche) {
        const field = ['Mega Excadrill', 'Dragapult', 'Slowking'].map((n) => ({ name: n }));
        const ctx = baue(MC, ['function _mctTbody('], {
            normalize, esc, L: (de) => de,
            _feldSuche: suche, _feldAlle: false, _mctSortierung: { spalte: 'deck', ab: false },
            _mctZeileFeld: (d) => ({ html: `<tr data-n="${d.name}"></tr>`, z: {} }),
            _mctSortWert: (e) => e.deck.name.toLowerCase(),
            _feldSortiert: () => [],
            _mctZeileAussen: () => '',
        });
        return ctx._mctTbody(field, (de) => de);
    }
    it('ohne Suche stehen alle Zeilen da', () => {
        assert.equal((tbody('').match(/<tr data-n/g) || []).length, 3);
    });
    it('„excadrill" zeigt genau die Zeile im Feld (Gross-/Kleinschreibung egal)', () => {
        const h = tbody('excadrill');
        assert.match(h, /Mega Excadrill/);
        assert.doesNotMatch(h, /Dragapult|Slowking/);
    });
    it('ein Name ohne Treffer zeigt keine Zeile', () => {
        assert.equal((tbody('zzz').match(/<tr data-n/g) || []).length, 0);
    });
});

describe('UI-56 (abgeloest durch UI-59): das Zahnrad traegt einen Punkt, wenn etwas vom Standard abweicht', () => {
    function umfeld(o) {
        return baue(MC, ['function _optionenAbweichend('], Object.assign({
            _metaCallMode: 'standard', _useClCurrent: false, _useClPast: false, window: {},
        }, o || {}));
    }
    it('Standard: kein Punkt', () => assert.equal(umfeld()._optionenAbweichend(), false));
    it('Counter-Modus, eigenes Datum, City League: Punkt', () => {
        assert.equal(umfeld({ _metaCallMode: 'counter' })._optionenAbweichend(), true);
        assert.equal(umfeld({ window: { currentMetaDateFrom: '2026-09-20' } })._optionenAbweichend(), true);
        assert.equal(umfeld({ _useClCurrent: true })._optionenAbweichend(), true);
        assert.equal(umfeld({ _useClPast: true })._optionenAbweichend(), true);
    });
});

describe('DA-30: Kopf und Zeilen sind EINE Tabelle', () => {
    const css = lies('css', 'meta-call.css');
    it('die Regeln gegen die globale display:block-Regel stehen am Desktop', () => {
        const m = /@media \(min-width: 701px\) \{([\s\S]*?)\n\}/.exec(css.slice(css.indexOf('DA-30 (01.10.2026)')));
        assert.ok(m, 'Block fehlt');
        assert.match(m[1], /#meta-call \.mc-mct-table \{ display: table;/);
        assert.match(m[1], /thead \{ display: table-header-group;/);
        assert.match(m[1], /tbody \{ display: table-row-group;/);
    });
    it('auf dem Telefon bleibt die Kartenansicht (Kopf aus)', () => {
        assert.match(css, /@media \(max-width: 700px\) \{\s*\.mc-mct-table thead \{ display: none; \}/);
    });
});
