'use strict';
/* WZ-31 (390-px-Pruefung als Warnung) und WZ-37 (Pin auf ubuntu-24.04),
   Hausi 07.10.2026. Die Befundregel wird ausgefuehrt, die Ablaufdateien gelesen
   (Kommentare vorher entfernt). */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const W = path.join(__dirname, '..', '..');
const ohneKommentare = (s) => s.split('\n').map((z) => z.replace(/(^|\s)#.*$/, '')).join('\n');

describe('WZ-37: alle Ablaeufe auf ubuntu-24.04 festgelegt', () => {
    const ordner = path.join(W, '.github', 'workflows');
    const dateien = fs.readdirSync(ordner).filter((f) => /\.ya?ml$/.test(f));
    it('kein Ablauf laeuft auf ubuntu-latest (wechselt am 19.10.2026 auf Ubuntu 26)', () => {
        const latest = dateien.filter((f) => /runs-on:\s*ubuntu-latest/.test(ohneKommentare(fs.readFileSync(path.join(ordner, f), 'utf8'))));
        assert.deepEqual(latest, []);
    });
    it('jeder runs-on nennt eine feste Version', () => {
        for (const f of dateien) {
            for (const m of ohneKommentare(fs.readFileSync(path.join(ordner, f), 'utf8')).matchAll(/runs-on:\s*(\S+)/g)) {
                assert.match(m[1], /^ubuntu-\d\d\.\d\d$/, `${f}: ${m[1]}`);
            }
        }
    });
});

describe('WZ-31: 390-px-Pruefung im Deploy, nur Warnung', () => {
    const DEPLOY = ohneKommentare(fs.readFileSync(path.join(W, '.github', 'workflows', 'deploy-pages.yml'), 'utf8'));
    it('Schritt steht im Deploy, mit continue-on-error', () => {
        const i = DEPLOY.indexOf('node pruefe-390.js ../_site');
        assert.ok(i > 0, 'Schritt fehlt');
        const block = DEPLOY.slice(DEPLOY.lastIndexOf('- name:', i), i);
        assert.match(block, /continue-on-error:\s*true/);
        assert.match(block, /working-directory:\s*prerender/);
    });
    it('Befundregel: seitlicher Bildlauf und kleine Schrift werden gemeldet', async () => {
        const m = await import(path.join(W, 'prerender', 'pruefe-390.js'));
        assert.deepEqual(m.befunde('x', { breite: 390, quer: false, scrollBreite: 390, querVerursacher: [], klein: [] }), []);
        const z = m.befunde('meta', { breite: 390, quer: true, scrollBreite: 420, querVerursacher: ['table.a'], klein: ['span 10.0 px'] });
        assert.equal(z.length, 2);
        assert.match(z[0], /seitlicher Bildlauf \(420 > 390\) — table\.a/);
        assert.match(z[1], /1 Text\(e\) unter 11 px/);
        assert.deepEqual(m.befunde('y', null), ['y: nicht gemessen']);
        assert.equal(m.SCHRIFTBODEN, 11);
    });
});
