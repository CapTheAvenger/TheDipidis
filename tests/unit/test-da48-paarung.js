'use strict';
/*
 * DA-48 (Rutsch V2-2, 05.10.2026, Hausi: „Rechnung angleichen"; Befund D3-02)
 *
 * Der Deck-Schub aus Predictor 5.3 ist die Major-Abweichung des GANZEN
 * Decks. Steht die Major-Paarung schon in der Mischung, zaehlte die
 * Schwaeche doppelt (Excadrill–Alakazam Dusknoir: 34,3 % -> 17,1 %).
 * Zusage: eine Paarung mit Major-Quelle bekommt keinen Schub; eine reine
 * Online-Paarung weiter. Ausgefuehrt wird der echte Block aus
 * getBaseMatchup (Kommentare vorher entfernt).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { lies } = require('./lib-dom-sandkasten.js');

const MC = lies('js', 'app-meta-call.js');
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function anwenden(quelle) {
    const rein = ohneKommentare(quelle);
    const a = rein.indexOf('const adjA = _deckWRAdjustment[a] || 0;');
    const endeMarke = 'return { pWin, pTie, pLoss, partien: base.partien || 0, schub };';
    const e = rein.indexOf(endeMarke, a);
    assert.ok(a > 0 && e > a, 'der Anwendungsteil ist nicht mehr auffindbar');
    const block = rein.slice(a, e + endeMarke.length);
    return new Function('a', 'b', 'base', '_deckWRAdjustment',
        'const _clip = (v, lo, hi) => Math.max(lo, Math.min(hi, v));\n' + block);
}

const ADJ = { excadrill: -5.9, alakazam: 12 };
const mitMajor = () => ({ pWin: 0.336, pTie: 0.02, pLoss: 0.644, partien: 67,
    _majorSources: [{ kind: 'overall', games: 15 }, { kind: 'online', games: 52 }] });
const nurOnline = () => ({ pWin: 0.49, pTie: 0.02, pLoss: 0.49, partien: 300 });

describe('DA-48: kein Deck-Schub auf eine Paarung mit Major-Messung', () => {
    const f = anwenden(MC);
    it('mit Major-Quelle bleibt die Paarung, wie sie gemischt wurde', () => {
        const r = f('excadrill', 'alakazam', mitMajor(), ADJ);
        assert.equal(r.pWin, 0.336);
    });
    it('reine Online-Paarung wird weiter verschoben und nennt den Schub', () => {
        const r = f('excadrill', 'alakazam', nurOnline(), ADJ);
        assert.ok(r.pWin < 0.49 - 0.1, 'kein Schub: ' + r.pWin);
        assert.ok(r.schub < -12, 'Schub nicht ausgewiesen: ' + r.schub);
    });
    it('VERFAELSCHUNG: ohne die Sperre schiebt er auch die Major-Paarung', () => {
        const kaputt = MC.replace(".some(x => x.kind !== 'online')) return base;", ".some(x => false)) return base;");
        assert.notEqual(kaputt, MC);
        const r = anwenden(kaputt)('excadrill', 'alakazam', mitMajor(), ADJ);
        assert.notEqual(r.pWin, 0.336);
    });
});
