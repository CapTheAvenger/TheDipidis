/**
 * UI-1: keine Variable ohne Definition.
 *
 * Gemessen am 26.09.2026: 25 CSS-Variablen wurden benutzt, aber nirgends
 * definiert — `--ink-soft` 19-mal in side-quest.css, `--mc-accent` 13-mal
 * in meta-call.css, `--accent-soft`, `--danger-*`, `--warning-*`,
 * `--primary-blue`, `--surface` und weitere. Jede davon griff still auf
 * ihren Ersatzwert zurueck, und der war fast immer ein HELLER Ton: im
 * dunklen Modus stand dann z. B. #6b21a8 mit 2,03:1 auf --surface-1 —
 * derselbe Kontrastbefund wie im Battle Journal (PR #840), nur woanders.
 *
 * Geprueft wird die Menge: jede benutzte Variable muss irgendwo definiert
 * sein — in einer CSS-Datei, in index.html, in einem Skript (auch per
 * setProperty) oder in einer Seite, die sie selbst setzt (das Tutorial
 * setzt `--bg` am Element).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function dateien(dir, endung) {
    const voll = path.join(ROOT, dir);
    if (!fs.existsSync(voll)) return [];
    const raus = [];
    for (const e of fs.readdirSync(voll, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) raus.push(...dateien(p, endung));
        else if (e.name.endsWith(endung)) raus.push(p);
    }
    return raus;
}

const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

const BENUTZER = [...dateien('css', '.css'), ...dateien('js', '.js'), 'index.html'];
const DEFINIERER = [...BENUTZER, ...dateien('tutorial', '.html'),
    ...dateien('masterclass', '.html')];

function definiert() {
    const menge = new Set();
    for (const f of DEFINIERER) {
        const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
        for (const m of s.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) menge.add(m[1]);
        for (const m of s.matchAll(/setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g)) menge.add(m[1]);
    }
    return menge;
}

function benutzt() {
    const wo = new Map();
    for (const f of BENUTZER) {
        const roh = fs.readFileSync(path.join(ROOT, f), 'utf8');
        const s = f.endsWith('.css') ? roh.replace(/\/\*[\s\S]*?\*\//g, '') : ohneKommentare(roh);
        for (const m of s.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
            if (!wo.has(m[1])) wo.set(m[1], new Set());
            wo.get(m[1]).add(f);
        }
    }
    return wo;
}

describe('UI-1: jede benutzte CSS-Variable ist definiert', () => {
    it('keine erfundenen Tokens', () => {
        const def = definiert();
        const offen = [...benutzt()].filter(([name]) => !def.has(name))
            .map(([name, orte]) => `${name} (${[...orte].join(', ')})`);
        assert.deepEqual(offen, [],
            'benutzt, aber nirgends definiert — faellt still auf den Ersatzwert '
            + 'zurueck, im dunklen Modus meist ein heller Ton:\n  ' + offen.join('\n  '));
    });

    it('die Messung sieht ueberhaupt etwas', () => {
        // Gegenprobe zur Probe: ohne Treffer waere die Menge oben leer und
        // die Zusicherung gruen, ohne etwas geprueft zu haben.
        assert.ok(benutzt().size > 200, `nur ${benutzt().size} Variablen gefunden`);
        assert.ok(definiert().has('--ink-3'));
    });

    it('der Meta-Call-Akzent traegt einen eigenen dunklen Wert', () => {
        const t = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
        const dunkel = t.slice(t.indexOf(':root[data-theme="dark"]'));
        const wert = (block, name) => (block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`)) || [])[1];
        const hell = t.slice(0, t.indexOf(':root[data-theme="dark"]'));
        assert.ok(wert(hell, '--mc-accent') && wert(dunkel, '--mc-accent'));
        assert.notEqual(wert(hell, '--mc-accent'), wert(dunkel, '--mc-accent'),
            '--mc-accent ist in beiden Modi gleich — im dunklen Modus 2,03:1');
    });
});
