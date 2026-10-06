'use strict';
/*
 * Festlegungen von Hausi, Teil A — was weg ist (claude/festlegungen.md).
 * Hausi 05.10.2026: „Können wir bitte die Sachen, die ich schon mal klar
 * gesagt habe, dass ich die nicht mehr haben will, nicht auf einmal wieder
 * auftauchen lassen?“ Jede Zeile hier ist eine solche Entscheidung. Kommt
 * eine davon zurueck, wird der Lauf rot. Gesucht wird im Code OHNE
 * Kommentare (Begruendungen duerfen die Namen weiter nennen).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lies, WURZEL } = require('./lib-dom-sandkasten.js');

const ohneKommentare = (q) => q
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const JS = fs.readdirSync(path.join(WURZEL, 'js')).filter(f => f.endsWith('.js'))
    .map(f => ({ f: 'js/' + f, q: ohneKommentare(lies('js', f)) }));
const HTML = ohneKommentare(lies('index.html'));

const VERBOTEN = [
    { was: '„Neu hier?“-Band (05.10.)', html: /id="neuHierBand"/, js: /neuHierBand|NeuHier\./ },
    { was: 'Kopf-„?“-Knopf (05.10.)', html: /id="hilfeKnopf"/, js: /hilfeKnopf/ },
    { was: '„Top-Archetypen nach Share“ auf der Meta-Seite (05.10.)', js: /renderMetaChart\(\s*'currentMeta'/ },
    { was: '„Top Archetype Share“ in Japan (UI-45)', js: /renderMetaChart\(\s*'cityLeague'/ },
    { was: '„Mein Deck“-Knopf im Kopf (05.10.)', html: /id="meinDeckKnopf"|js\/mein-deck\.js/, js: /window\.MeinDeck|meindeck:geaendert/ },
    { was: 'zweiter Menue-Oeffner „☰ Menü“ neben dem Pokeball (06.10.)', html: /class="menu-label-btn"|data-i18n="menu\.labelBtn"/, js: /menu-label-btn|'menu\.labelBtn'/ },
    { was: 'Untertitel „Dein Portal …“ im Kopf (06.10.)', html: /class="header-subtitle"/ },
];

describe('Festlegungen A: Entferntes bleibt weg', () => {
    for (const v of VERBOTEN) {
        it(v.was, () => {
            if (v.html) assert.doesNotMatch(HTML, v.html, v.was + ' steht wieder in index.html');
            if (v.js) {
                const treffer = JS.filter(d => v.js.test(d.q)).map(d => d.f);
                assert.deepEqual(treffer, [], v.was + ' ist wieder im Code: ' + treffer.join(', '));
            }
        });
    }
    it('VERFAELSCHUNG: ein zurueckgeholter Aufruf faellt auf', () => {
        const q = ohneKommentare("x; setTimeout(() => renderMetaChart('currentMeta', d, g), 400);");
        assert.match(q, VERBOTEN[2].js);
    });
    it('die Festlegungen sind in CLAUDE.md verankert', () => {
        assert.match(lies('CLAUDE.md'), /claude\/festlegungen\.md/);
    });
});
