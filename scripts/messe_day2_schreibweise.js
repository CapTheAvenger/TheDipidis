#!/usr/bin/env node
/**
 * UI-34 (27.09.2026): Messwerkzeug fuer die Schreibweise „Day 2".
 *
 * Hausi: „Tag 2"/„Day two" benutzt niemand — der gaengige Begriff ist
 * „Day 2" (und entsprechend „Day 1"). Das Werkzeug sucht in allem, was
 * der Leser sieht (Zeichenketten in js/, index.html, Tutorial,
 * Masterclass), nach den alten Schreibweisen. Kommentare werden vorher
 * ausgeschnitten — Zeilennummern bleiben dabei erhalten.
 *
 * Aufruf:  node scripts/messe_day2_schreibweise.js   (Ausgabe: Treffer, Exit 1 bei Treffern)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ALT = /\b(Tag[ -]?[12]\b|TAG[ -][12]\b|Tag[ -]zwei|zweite[nr]? Tag\b|Day[ -]?two\b|DAY TWO|day[ -][12](?![-\w])|second day\b)/;

const leer = (m) => m.replace(/[^\n]/g, ' ');
function ohneKommentareJs(s) {
    return s
        .replace(/\/\*[\s\S]*?\*\//g, leer)
        .replace(/(^|[^:\\'"`])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));
}
function ohneKommentareHtml(s) {
    return s.replace(/<!--[\s\S]*?-->/g, leer);
}

function dateien() {
    const liste = [];
    const add = (dir, re) => {
        const abs = path.join(ROOT, dir);
        if (!fs.existsSync(abs)) return;
        for (const f of fs.readdirSync(abs)) if (re.test(f)) liste.push(path.join(dir, f));
    };
    add('js', /\.js$/);
    add('tutorial', /\.html$/);
    add('masterclass', /\.html$/);
    liste.push('index.html');
    return liste;
}

function messe(text, istJs) {
    const ohne = istJs ? ohneKommentareJs(text) : ohneKommentareHtml(text);
    const treffer = [];
    ohne.split('\n').forEach((z, i) => {
        const m = z.match(ALT);
        if (m) treffer.push({ zeile: i + 1, fund: m[0] });
    });
    return { treffer, ohne };
}

function messeAlles() {
    const alle = [];
    for (const rel of dateien()) {
        const text = fs.readFileSync(path.join(ROOT, rel), 'utf8');
        for (const t of messe(text, rel.endsWith('.js')).treffer) alle.push(Object.assign({ datei: rel }, t));
    }
    return alle;
}

module.exports = { messe, messeAlles, ohneKommentareJs, ALT };

if (require.main === module) {
    const alle = messeAlles();
    for (const t of alle) console.log(`${t.datei}:${t.zeile}: ${t.fund}`);
    console.log(`${alle.length} Stelle(n) mit alter Schreibweise`);
    process.exit(alle.length ? 1 : 0);
}
