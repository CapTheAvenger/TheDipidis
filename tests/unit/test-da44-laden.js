'use strict';
/* DA-44 (07.10.2026): Deck-Analyse lud dieselben Dateien mehrfach (labs 6x,
   current_meta 4x) und der Meta-Call-Vorrat (~35 MB) lief 1,5 s nach dem Start
   gegen die offene Seite. Gemessen bei 20 Mbit/s: Deckliste nach 19,8 s, danach 12,1 s. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = p => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

function auszug(src, kopf) {
    const i = src.indexOf(kopf);
    assert.ok(i >= 0, kopf + ' fehlt');
    let tiefe = 0, j = src.indexOf('{', i);
    for (let k = j; k < src.length; k++) {
        if (src[k] === '{') tiefe++;
        else if (src[k] === '}') { tiefe--; if (tiefe === 0) return src.slice(i, k + 1); }
    }
    throw new Error('Ende nicht gefunden');
}

describe('DA-44 eine Datei, ein Abruf', () => {
    const core = R('js/app-core.js');
    it('gleiche Datei (auch mit ?t=) wird innerhalb von 60 s nur einmal geholt (ausgefuehrt)', async () => {
        const code = 'const _csvTextGeteilt = new Map(); const CSV_TEXT_TEILEN_MS = 60000;\n'
            + auszug(core, 'function _csvTextHolen(url, timeoutMs)') + '\nthis.holen = _csvTextHolen;';
        const abrufe = [];
        const ctx = {
            Map, Date, Error, AbortController,
            setTimeout: () => 0, clearTimeout() {},
            fetch: (u) => { abrufe.push(u); return Promise.resolve({ ok: true, text: () => Promise.resolve('a;b\n1;2') }); },
        };
        vm.runInNewContext(code, ctx);
        const a = await ctx.holen('quelle/x.csv', 1000);
        const b = await ctx.holen('quelle/x.csv?t=123', 1000);
        await ctx.holen('quelle/y.csv', 1000);
        assert.equal(a, b);
        assert.deepEqual(abrufe, ['quelle/x.csv', 'quelle/y.csv']);
    });
    it('fetchAndParseCSV parst den geteilten Text, nicht per Papa-Download', () => {
        const f = auszug(core, 'async function fetchAndParseCSV(url, delimiter');
        assert.match(f, /_csvTextHolen\(url, TIMEOUT_MS\)\.then\(function \(text\) \{ Papa\.parse\(text,/);
        assert.doesNotMatch(f, /download:\s*true/);
    });
    it('Slug-Zuordnung wird einmal geladen', () => {
        assert.match(core, /if \(!_slugZuNameVersprechen\) \{\s*_slugZuNameVersprechen = _slugZuArchetypNameLaden\(options\)/);
    });
});

describe('DA-44 Meta-Call-Vorrat nicht gegen die offene Seite', () => {
    const init = R('js/app-init.js');
    const fn = auszug(init, 'function metaCallVorratPlanen()');
    function lauf(tab, verbindung) {
        const zeiten = [], los = [];
        const ctx = {
            window: { MetaCall: { preload: () => los.push(1) } },
            document: { querySelector: () => ({ id: tab }) },
            navigator: { connection: verbindung },
            setTimeout: (f, ms) => { zeiten.push(ms); f(); },
        };
        ctx.window.requestIdleCallback = (f) => f();
        vm.runInNewContext(fn + '\nmetaCallVorratPlanen();', ctx);
        return { zeiten, los: los.length };
    }
    it('auf dem Meta Call sofort, sonst fruehestens nach 12 s (ausgefuehrt)', () => {
        assert.deepEqual(lauf('meta-call', null), { zeiten: [], los: 1 });
        assert.deepEqual(lauf('current-analysis', { effectiveType: '4g' }), { zeiten: [12000], los: 1 });
    });
    it('Datensparmodus und langsame Verbindung: kein Vorrat', () => {
        assert.equal(lauf('current-meta', { saveData: true }).los, 0);
        assert.equal(lauf('current-meta', { effectiveType: '3g' }).los, 0);
    });
    it('kein fester 1,5-s-Start mehr', () => {
        assert.doesNotMatch(init.replace(/\/\*[\s\S]*?\*\//g, ''), /setTimeout\(\(\) => \{ window\.MetaCall\?\.preload\?\.\(\); \}, 1500\)/);
    });
});
