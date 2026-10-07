'use strict';
/* FE-44 (Hausi 07.10.2026): Meta-Call-Szenarien auch im Konto, Abgleich je Name,
   Loeschmarken wie FE-18. Fuehrt die echten Funktionen gegen ein Firestore-Double aus. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');
const KONTO = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'metacall-konto.js'), 'utf8');

function block(kopf) {
    const i = SRC.indexOf(kopf); assert.ok(i >= 0, kopf);
    let t = 0;
    for (let k = SRC.indexOf('{', i); k < SRC.length; k++) {
        if (SRC[k] === '{') t++; else if (SRC[k] === '}' && --t === 0) return SRC.slice(i, k + 1);
    }
}
function umgebung(lokal, server, angemeldet = true) {
    const speicher = new Map();
    speicher.set('metacall_scenarios_v1', JSON.stringify(lokal.szen || {}));
    if (lokal.geloescht) speicher.set('metacall_scenarios_geloescht_v1', JSON.stringify(lokal.geloescht));
    const konto = { daten: server ? JSON.parse(JSON.stringify(server)) : null, geschrieben: 0 };
    const ref = {
        get: async () => ({ exists: !!konto.daten, data: () => konto.daten }),
        set: async (d) => { konto.daten = JSON.parse(JSON.stringify(d)); konto.geschrieben++; },
    };
    const ctx = {
        localStorage: { getItem: k => (speicher.has(k) ? speicher.get(k) : null), setItem: (k, v) => speicher.set(k, String(v)) },
        window: { auth: { currentUser: angemeldet ? { uid: 'zz-test' } : null },
                  db: { collection: () => ({ doc: () => ({ collection: () => ({ doc: () => ref }) }) }) } },
        console: { warn() {} },
        document: { dispatchEvent() {} }, CustomEvent: function () {},
        setInterval: () => 0, clearInterval() {}, setTimeout: () => 0, clearTimeout() {},
    };
    ctx.window.document = ctx.document;
    vm.runInNewContext(KONTO, ctx);
    ctx.abgleichen = ctx.window.MetaCallKonto.abgleichen;
    ctx.laden = () => JSON.parse(speicher.get('metacall_scenarios_v1') || '{}');
    return { ctx, konto, speicher };
}
const sz = (t, x) => ({ savedAt: t, personalShares: { Dragapult: x } });

describe('FE-44 Szenarien im Konto (ausgefuehrt)', () => {
    it('Browser und Konto werden vereint, je Name gilt der neuere Stand', async () => {
        const u = umgebung({ szen: { A: sz('2026-10-01', 1), B: sz('2026-10-05', 2) } },
            { szenarien: [{ name: 'B', daten: JSON.stringify(sz('2026-10-03', 9)) }, { name: 'C', daten: JSON.stringify(sz('2026-10-02', 3)) }], geloescht: {} });
        assert.equal(await u.ctx.abgleichen(), true);
        const lokal = u.ctx.laden();
        assert.deepEqual(Object.keys(lokal).sort(), ['A', 'B', 'C']);
        assert.equal(lokal.B.personalShares.Dragapult, 2);
        assert.equal(lokal.C.personalShares.Dragapult, 3);
        const v = umgebung({ szen: { B: sz('2026-10-01', 2) } }, { szenarien: [{ name: 'B', daten: JSON.stringify(sz('2026-10-04', 9)) }] });
        await v.ctx.abgleichen();
        assert.equal(v.ctx.laden().B.personalShares.Dragapult, 9, 'neuerer Stand aus dem Konto gewinnt');
        assert.deepEqual(u.konto.daten.szenarien.map(e => e.name).sort(), ['A', 'B', 'C']);
    });
    it('geloescht bleibt geloescht, auch wenn ein anderes Geraet es noch hat', async () => {
        const u = umgebung({ szen: {}, geloescht: { A: '2026-10-06' } },
            { szenarien: [{ name: 'A', daten: JSON.stringify(sz('2026-10-01', 1)) }], geloescht: {} });
        await u.ctx.abgleichen();
        assert.deepEqual(Object.keys(u.ctx.laden()), []);
        assert.deepEqual(u.konto.daten.szenarien, []);
        assert.equal(u.konto.daten.geloescht.A, '2026-10-06');
    });
    it('nach dem Loeschen neu gespeichert: bleibt', async () => {
        const u = umgebung({ szen: { A: sz('2026-10-07', 5) }, geloescht: { A: '2026-10-06' } }, null);
        await u.ctx.abgleichen();
        assert.equal(u.ctx.laden().A.personalShares.Dragapult, 5);
    });
    it('abgemeldet: nichts wird geschrieben', async () => {
        const u = umgebung({ szen: { A: sz('2026-10-01', 1) } }, null, false);
        assert.equal(await u.ctx.abgleichen(), false);
        assert.equal(u.konto.geschrieben, 0);
    });
    it('Speichern stoesst den Abgleich an, Loeschen setzt die Marke', () => {
        assert.match(SRC, /if \(verify === payload\) _szenAbgleichPlanen\(\);/);
        assert.match(SRC, /window\.MetaCallKonto\.planen\(\)/);
        assert.match(block('async function _deleteScenario()'), /_szenMerkeGeloescht\(name\);\s*_writeScenarios\(existing\);/);
    });
});
