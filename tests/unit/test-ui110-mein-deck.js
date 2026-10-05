'use strict';
/*
 * UI-110 (IA Etappe 1, 05.10.2026, Hausi: Vorschlag A in Etappen)
 *
 * „Mein Deck" gab es nur im Meta Call. Jetzt ein Ort (js/mein-deck.js),
 * derselbe Schluessel `metacall_mydeck_v1` (bestehende Wahl bleibt), ein
 * Ereignis fuer alle Abnehmer. Ausgefuehrt wird die echte Datei in einer
 * Sandkiste; Profil-Untertabs schreiben ihre Adresse.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { lies, ausschnitt } = require('./lib-dom-sandkasten.js');

const QUELLE = lies('js', 'mein-deck.js');

function sandkiste(quelle, gespeichert) {
    const speicher = Object.assign({}, gespeichert || {});
    const ereignisse = [];
    const hoerer = {};
    const doc = {
        readyState: 'complete',
        getElementById: () => null,
        addEventListener: (t, f) => { (hoerer[t] = hoerer[t] || []).push(f); },
        removeEventListener() {},
        dispatchEvent: (e) => { ereignisse.push(e); (hoerer[e.type] || []).forEach(f => f(e)); return true; },
    };
    const ctx = vm.createContext({
        document: doc,
        localStorage: {
            getItem: (k) => (k in speicher ? speicher[k] : null),
            setItem: (k, v) => { speicher[k] = String(v); },
            removeItem: (k) => { delete speicher[k]; },
        },
        CustomEvent: function (type, init) { this.type = type; this.detail = init && init.detail; },
        window: { addEventListener() {} },
        setTimeout: (f) => f(),
    });
    ctx.window = ctx;
    ctx.addEventListener = () => {};
    vm.runInContext(quelle, ctx);
    return { M: ctx.MeinDeck, speicher, ereignisse };
}

describe('UI-110: MeinDeck — ein Ort fuer die Wahl', () => {
    it('liest die bestehende Wahl aus metacall_mydeck_v1 (nichts wird umgeschrieben)', () => {
        const { M } = sandkiste(QUELLE, { metacall_mydeck_v1: 'Mega Excadrill' });
        assert.equal(M.KEY, 'metacall_mydeck_v1');
        assert.equal(M.lesen(), 'Mega Excadrill');
    });
    it('setzen merkt und meldet meindeck:geaendert mit Quelle; leer vergisst', () => {
        const { M, speicher, ereignisse } = sandkiste(QUELLE, {});
        M.setzen('Dragapult', 'kopf');
        assert.equal(speicher.metacall_mydeck_v1, 'Dragapult');
        assert.equal(ereignisse.at(-1).type, 'meindeck:geaendert');
        assert.deepEqual(JSON.parse(JSON.stringify(ereignisse.at(-1).detail)), { name: 'Dragapult', quelle: 'kopf' });
        M.setzen('', 'kopf');
        assert.ok(!('metacall_mydeck_v1' in speicher));
    });
    it('gleiche Wahl meldet nichts doppelt', () => {
        const { M, ereignisse } = sandkiste(QUELLE, { metacall_mydeck_v1: 'Dragapult' });
        M.setzen('Dragapult', 'kopf');
        assert.equal(ereignisse.length, 0);
    });
    it('Suche: Treffer am Anfang zuerst, dann im Namen', () => {
        const { M } = sandkiste(QUELLE, {});
        const r = M._treffer(['Mega Excadrill', 'Excadrill ex', 'Dragapult'], 'exca');
        assert.deepEqual(Array.from(r), ['Excadrill ex', 'Mega Excadrill']);
    });
    it('VERFAELSCHUNG: ohne Ereignis erfaehrt der Meta Call nichts', () => {
        const kaputt = QUELLE.replace("document.dispatchEvent(new CustomEvent('meindeck:geaendert'", "void (0 && document.dispatchEvent(new CustomEvent('meindeck:geaendert'")
            .replace("detail: { name: n, quelle: quelle || '' } }));", "detail: { name: n, quelle: quelle || '' } })));");
        assert.notEqual(kaputt, QUELLE);
        const { M, ereignisse } = sandkiste(kaputt, {});
        M.setzen('Dragapult', 'kopf');
        assert.equal(ereignisse.length, 0);
    });
});

describe('UI-110: die Abnehmer', () => {
    it('der Meta Call merkt ueber MeinDeck und folgt der Kopf-Wahl', () => {
        const MC = lies('js', 'app-meta-call.js');
        assert.match(ausschnitt(MC, 'function _meinDeckMerken('), /window\.MeinDeck\.setzen\(val, 'metacall'\)/);
        assert.match(MC, /document\.addEventListener\('meindeck:geaendert'/);
    });
    it('das Journal belegt das eigene Deck mit Mein Deck vor', () => {
        const BJ = lies('js', 'battle-journal.js');
        assert.match(ausschnitt(BJ, 'function openBattleJournalSheet('), /window\.MeinDeck\.lesen\(\)/);
    });
    it('die Deck-Analyse waehlt es einmal je Seitenaufruf vor', () => {
        const CMA = lies('js', 'app-current-meta-analysis.js');
        assert.match(CMA, /!window\.__dsMeinDeckVorgewaehlt/);
        assert.match(CMA, /window\.__dsMeinDeckVorgewaehlt = true;/);
    });
    it('Kopf-Knopf, Skript und Service-Worker-Liste', () => {
        const html = lies('index.html');
        assert.match(html, /id="meinDeckKnopf"[^>]*onclick="MeinDeck\.oeffnen\(\)"/);
        assert.match(html, /<script src="js\/mein-deck\.js\?v=\d+" defer><\/script>/);
        assert.match(lies('service-worker.js'), /'\.\/js\/mein-deck\.js'/);
    });
});

describe('UI-110: Profil-Untertabs schreiben ihre Adresse', () => {
    it('switchProfileTab ruft die Untertab-Schreibfunktion', () => {
        const FC = lies('js', 'firebase-collection.js');
        assert.match(ausschnitt(FC, 'function switchProfileTab('), /window\.__dsSchreibeProfilHash\(tabName\)/);
    });
    it('und fuehrt sie aus: #decks statt #profile', () => {
        const FC = lies('js', 'firebase-collection.js');
        const geschrieben = [];
        const leer = { classList: { add() {}, remove() {} }, style: {} };
        const ctx = vm.createContext({
            document: { querySelectorAll: () => [], getElementById: () => leer, querySelector: () => null },
            window: { __dsSchreibeProfilHash: (t) => geschrieben.push(t), matchMedia: () => ({ matches: false }) },
        });
        vm.runInContext(ausschnitt(FC, 'function switchProfileTab(') + ';globalThis.f=switchProfileTab;', ctx);
        ctx.f('decks');
        assert.deepEqual(geschrieben, ['decks']);
    });
});
