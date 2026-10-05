/**
 * UI-106 (M3-03, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND (390 px, scripts/messe_390.js): Spalte „Deck“ der Meta-Call-
 * Empfehlungen 0 px breit, Namen ueber den Day-2-Werten („D&D2“), 8 Text-
 * ueberlappungen. Ursachen: table-layout:fixed mit 40 + 3 x 90 px und eine
 * schmal ausgeblendete Zellenart (.mc-rec-wins / .mc-rec-players), deren
 * Kopfzelle stehen blieb.
 *
 * ZUSICHERUNG: Jede schmal ausgeblendete Zellenart blendet auch ihren Kopf
 * aus (gleiche Klasse am th, aus dem Quelltext der beiden Tabellen gezaehlt:
 * sichtbare Koepfe = sichtbare Zellen), und schmal rechnet die Tabelle mit
 * table-layout:auto. Live-Beleg bei 390 px im Rutsch-Bericht.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib-dom-sandkasten.js');

const js = L.lies('js', 'app-meta-call.js');
const css = L.lies('css', 'meta-call.css').replace(/\/\*[\s\S]*?\*\//g, ' ');
const schmal = css.slice(css.indexOf('@media (max-width: 700px)'));
const versteckt = (schmal.match(/\.mc-rec-wins,\s*\.mc-rec-players\s*\{\s*display:\s*none/) ? ['mc-rec-wins', 'mc-rec-players'] : []);

function zaehle(tabelleAnfang, zeilenMarke) {
    const i = js.indexOf(tabelleAnfang);
    const kopf = js.slice(i, js.indexOf('</tr></thead>', i));
    const th = [...kopf.matchAll(/<th\b([^>]*)>/g)].map(m => m[1]);
    const j = js.indexOf(zeilenMarke);
    const zeile = js.slice(j, js.indexOf('</tr>', j));
    const td = [...zeile.matchAll(/<td\b([^>]*)>/g)].map(m => m[1]);
    const sichtbar = (attrs) => !versteckt.some(k => new RegExp('class="[^"]*\\b' + k + '\\b').test(attrs));
    return { th: th.filter(sichtbar).length, td: td.filter(sichtbar).length, alleTh: th.length, alleTd: td.length };
}

describe('UI-106: Empfehlungstabelle schmal', () => {
    it('ausgeblendete Spalten sind bekannt', () => assert.deepEqual(versteckt, ['mc-rec-wins', 'mc-rec-players']));
    it('schmal: table-layout auto', () => assert.match(schmal, /\.mc-rec-table\s*\{\s*table-layout:\s*auto/));
    it('Empfehlungen: sichtbare Koepfe = sichtbare Zellen', () => {
        const z = zaehle('<table class="mc-rec-table">', '<td class="mc-rec-rank">${i + 1}</td>');
        assert.equal(z.alleTh, 6);
        assert.equal(z.alleTd, 6, 'Zeile: Rang, Name, Day-2, WR, Siege, Pfeil');
        assert.equal(z.th, z.td, 'sichtbare Koepfe ' + z.th + ' gegen sichtbare Zellen ' + z.td);
    });
    it('eingefrorene Tabelle: Spieler-Kopf blendet mit aus', () => {
        assert.match(js, /<th class="mc-rec-players">\$\{t\('mc\.frozenColPlayers'\)\}<\/th>/);
    });
});
