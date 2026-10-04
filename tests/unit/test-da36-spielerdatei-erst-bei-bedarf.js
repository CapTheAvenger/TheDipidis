/**
 * DA-36 (03.10.2026, Tiefenanalyse F-14/D-10): js/deck-builder-consistency.js
 * lud data/tournament_decklists_per_player.csv (61,8 MB, live gemessen am
 * 04.10.2026) beim Seitenstart — auf jeder Seite, auch der Startseite, die
 * sie nicht braucht. Jetzt erst, wenn ein Reiter sie braucht (Deck-Analyse
 * Global/Japan, Vergangene Formate) oder beim ersten Aufruf.
 *
 * AUSGEFUEHRT: das echte Modul laeuft in einer Attrappe; gezaehlt wird,
 * wie oft Papa.parse die Datei anfordert.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'deck-builder-consistency.js'), 'utf8');
const DATEI = 'data/tournament_decklists_per_player.csv';

function laden(aktiverReiter) {
    const abrufe = [];
    const zeitgeber = [];
    const reiter = [];
    const ctx = {
        console: { log() {}, warn() {}, error() {}, info() {} },
        document: {
            readyState: 'complete',
            addEventListener() {},
            querySelector: (sel) => (sel === '.tab-content.active' ? { id: aktiverReiter } : null),
        },
        setTimeout: (fn) => { zeitgeber.push(fn); return 0; },
        Papa: { parse: (url, o) => { abrufe.push(String(url).split('?')[0]); o.complete({ data: [] }); } },
        fetch: async () => ({ ok: false, json: async () => null, text: async () => '' }),
        switchTab: (t) => { reiter.push(t); return true; },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'deck-builder-consistency.js' });
    zeitgeber.splice(0).forEach((fn) => fn());
    const spielerdatei = () => abrufe.filter((u) => u === DATEI).length;
    return { ctx, spielerdatei, reiter };
}

describe('DA-36: die Spielerdatei wird erst geladen, wenn sie gebraucht wird', () => {
    it('Startseite: kein Abruf', () => {
        const s = laden('current-meta');
        assert.equal(s.spielerdatei(), 0, 'die 61,8-MB-Datei wird wieder beim Seitenstart geladen');
    });

    it('Wechsel in die Deck-Analyse: genau ein Abruf, auch beim zweiten Wechsel', () => {
        const s = laden('current-meta');
        s.ctx.switchTab('current-analysis');
        assert.equal(s.spielerdatei(), 1);
        s.ctx.switchTab('meta-call');
        s.ctx.switchTab('current-analysis');
        assert.equal(s.spielerdatei(), 1, 'doppelt geladen');
        assert.deepEqual(s.reiter, ['current-analysis', 'meta-call', 'current-analysis'],
            'der Reiterwechsel selbst muss weiterlaufen');
    });

    it('Direkteinstieg in Vergangene Formate laedt sofort', () => {
        const s = laden('past-meta');
        assert.equal(s.spielerdatei(), 1);
    });

    it('ohne Reiterwechsel laedt der erste Aufruf von loadData()', async () => {
        const s = laden('current-meta');
        await s.ctx.MostConsistencyBuilder.loadData();
        assert.equal(s.spielerdatei(), 1);
    });
});
