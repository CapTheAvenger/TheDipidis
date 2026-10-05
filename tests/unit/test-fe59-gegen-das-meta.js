/**
 * FE-59 (N3-03, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: „Gegen das Meta →“ an jeder Tier-Karte setzte still und dauerhaft
 * „Mein Deck“ im Meta Call (oeffneMitDeck -> _wunschEinloesen -> _onMyDeck
 * -> _meinDeckMerken). Wer nur schauen wollte, verlor sein gemerktes Deck.
 *
 * ZUSICHERUNG: _onMyDeck wird AUSGEFUEHRT — mit {vorschau:true} wird nichts
 * gemerkt, ohne wird gemerkt; _wunschEinloesen ruft mit {vorschau:true}.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib-dom-sandkasten.js');

const ohne = (q) => q.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n').map(z => z.replace(/(^|[^:'"])\/\/.*$/, '$1')).join('\n');

function umgebung() {
    const gemerkt = [];
    const ctx = L.baue('js/app-meta-call.js', ['function _onMyDeck(val, opts)'], {
        _settings: {}, _meinDeckMerken: (v) => gemerkt.push(v), _winRateOverrides: {},
        _ladeJournal() {}, renderAll() {}, requestAnimationFrame: (f) => f(), window: { scrollY: 0, scrollTo() {} },
    });
    return { ctx, gemerkt };
}

describe('FE-59: „Gegen das Meta“ ueberschreibt Mein Deck nicht', () => {
    it('Vorschau merkt nichts', () => {
        const u = umgebung();
        u.ctx._onMyDeck('Dragapult', { vorschau: true });
        assert.deepEqual(u.gemerkt, []);
        assert.equal(u.ctx._settings.myDeck, 'Dragapult');
    });
    it('echte Wahl merkt', () => {
        const u = umgebung();
        u.ctx._onMyDeck('Mega Excadrill');
        assert.deepEqual(u.gemerkt, ['Mega Excadrill']);
    });
    it('_wunschEinloesen waehlt als Vorschau', () => {
        const rumpf = ohne(L.ausschnitt(L.lies('js', 'app-meta-call.js'), 'function _wunschEinloesen(versuch)'));
        assert.match(rumpf, /_onMyDeck\(treffer\.name,\s*\{\s*vorschau:\s*true\s*\}\)/);
    });
});
