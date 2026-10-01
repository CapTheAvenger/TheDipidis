'use strict';
/* Befund 01.10.2026 (Deploy #3278): Chrome startete auf dem Runner nicht
   innerhalb von 30 s, der Pre-render-Schritt brach ab, der Deploy hing.
   chromeStarten() versucht es dreimal. Die Funktion wird aus der Datei
   geschnitten und ausgefuehrt. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const quelle = fs.readFileSync(path.join(__dirname, '..', '..', 'prerender', 'prerender-meta-call.js'), 'utf8');
const ohneKommentar = quelle.replace(/\/\/[^\n]*/g, '');
const m = ohneKommentar.match(/async function chromeStarten\([\s\S]*?\n}\n/);

test('chromeStarten steht in der Datei', () => { assert.ok(m, 'chromeStarten fehlt'); });

function bauen() {
  return new Function('puppeteer', 'console', m[0] + '\nreturn chromeStarten;')({ launch: () => { throw new Error('nicht benutzt'); } }, { warn() {} });
}

test('ein einzelner Fehlstart bricht nicht ab', async () => {
  let n = 0;
  const f = bauen();
  const r = await f(async () => { n++; if (n < 3) throw new Error('Timed out'); return 'browser'; }, 0);
  assert.strictEqual(r, 'browser');
  assert.strictEqual(n, 3);
});

test('drei Fehlstarts sind ein Fehler, nicht Erfolg', async () => {
  let n = 0;
  const f = bauen();
  await assert.rejects(f(async () => { n++; throw new Error('Timed out'); }, 0), /Timed out/);
  assert.strictEqual(n, 3);
});

test('renderMetaCall startet Chrome ueber chromeStarten', () => {
  assert.ok(/async function renderMetaCall[\s\S]{0,200}await chromeStarten\(\)/.test(ohneKommentar));
  assert.ok(!/const browser = await puppeteer\.launch/.test(ohneKommentar));
});
