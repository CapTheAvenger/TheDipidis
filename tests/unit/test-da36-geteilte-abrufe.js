/**
 * DA-36 (03.10.2026, Tiefenanalyse F-14/D-10): Mehrfachladungen. Live
 * gemessen am 04.10.2026 auf der Startseite: labs_tournament_decks.csv 5x,
 * online_tournament_top8_decks.csv 5x, format_window.json 4x — jedes Modul
 * holt mit eigenem ?t=Date.now(). js/csv-cache-interceptor.js teilt jetzt
 * innerhalb eines Seitenaufrufs eine Antwort je /data/-Datei.
 *
 * AUSGEFUEHRT: das echte Modul laeuft mit einer gezaehlten fetch-Attrappe.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'csv-cache-interceptor.js'), 'utf8');

function laden(antwort) {
    const abrufe = [];
    const ctx = {
        console: { log() {}, warn() {}, error() {}, info() {} },
        Response, Promise, Map, Object, Array, String, performance, setTimeout: () => 0, setInterval: () => 0,
        document: { addEventListener() {}, readyState: 'complete' },
        addEventListener() {},
    };
    ctx.fetch = async (url, init) => {
        abrufe.push([String(url), init || null]);
        const a = antwort ? antwort(String(url)) : { ok: true, text: 'a;b\n1;2' };
        return new Response(a.text, { status: a.ok ? 200 : 404, headers: { 'Content-Type': 'text/csv' } });
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(SRC, ctx, { filename: 'csv-cache-interceptor.js' });
    return { ctx, abrufe };
}

describe('DA-36: dieselbe /data/-Datei wird je Seitenaufruf einmal geholt', () => {
    it('fuenf Abrufe mit verschiedenem ?t= — ein Netzabruf, fuenf volle Antworten', async () => {
        const s = laden();
        const texte = await Promise.all([1, 2, 3, 4, 5].map((i) =>
            s.ctx.window.fetch('./data/labs_tournament_decks.csv?t=' + i).then((r) => r.text())));
        assert.equal(s.abrufe.length, 1);
        assert.deepEqual(texte, Array(5).fill('a;b\n1;2'));
    });

    it('verschiedene Dateien bleiben getrennt', async () => {
        const s = laden((u) => ({ ok: true, text: u.split('?')[0] }));
        const a = await s.ctx.window.fetch('data/format_window.json?t=1').then((r) => r.text());
        const b = await s.ctx.window.fetch('data/sets_x.json?t=2').then((r) => r.text());
        assert.equal(a, 'data/format_window.json');
        assert.equal(b, 'data/sets_x.json');
        assert.equal(s.abrufe.length, 2);
    });

    it('ausgenommen: no-store, POST, version.json, Dateien ausserhalb von data/', async () => {
        const s = laden();
        await s.ctx.window.fetch('data/data_stand.json?t=1', { cache: 'no-store' });
        await s.ctx.window.fetch('data/data_stand.json?t=2', { cache: 'no-store' });
        await s.ctx.window.fetch('data/x.json', { method: 'POST' });
        await s.ctx.window.fetch('data/x.json', { method: 'POST' });
        await s.ctx.window.fetch('/version.json?x=1');
        await s.ctx.window.fetch('/version.json?x=2');
        await s.ctx.window.fetch('tutorial/tutorial.de.html?v=1');
        await s.ctx.window.fetch('tutorial/tutorial.de.html?v=1');
        assert.equal(s.abrufe.length, 8);
    });

    it('ein Fehlschlag wird nicht festgehalten: der naechste Abruf versucht es neu', async () => {
        let n = 0;
        const s = laden(() => (++n === 1 ? { ok: false, text: '' } : { ok: true, text: 'da' }));
        const r1 = await s.ctx.window.fetch('data/a.csv?t=1');
        assert.equal(r1.ok, false);
        const r2 = await s.ctx.window.fetch('data/a.csv?t=2');
        assert.equal(r2.ok, true);
        assert.equal(await r2.text(), 'da');
        assert.equal(s.abrufe.length, 2);
    });
});
