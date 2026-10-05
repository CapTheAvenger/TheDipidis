/**
 * UI-102 (M3-01, G3-04, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: Die Zeilen unter den Kartenbildern der Deck-Analyse standen bei
 * 390 px in 1,86-3,96 px, am Desktop in 7,84 px (em-Kaskade). Gemessen mit
 * scripts/messe_390.js: 429 Texte < 11 px in der Deck-Analyse.
 *
 * ZUSICHERUNG: Fuer alle drei Analyse-Ansichten gibt es EINE Regel je
 * Zeile mit fester Token-Groesse (--fs-sm/--fs-xs, keine em/%/calc), sie
 * steht als LETZTE Schriftregel dieser Klassen in der zuletzt geladenen
 * Stilblatt-Datei, und ihre Spezifitaet liegt ueber jeder anderen
 * font-size-Regel derselben Klasse im ganzen CSS. Live-Beleg: Bericht
 * claude/rutsch-v2-1-kaputtes-2026-10-05.md.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('./lib-dom-sandkasten.js');

const KLASSEN = ['city-league-card-title-mobile', 'city-league-card-set-mobile', 'city-league-card-stats-mobile',
    'city-league-card-avg-mobile', 'city-league-card-deck-stats-mobile'];

function regeln(css) {
    const ohne = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const aus = [];
    const re = /([^{}]+)\{([^{}]*)\}/g; let m;
    while ((m = re.exec(ohne))) aus.push({ sel: m[1].trim(), rumpf: m[2] });
    return aus;
}
function spezifitaet(sel) {
    const ids = (sel.match(/#[\w-]+/g) || []).length;
    const kl = (sel.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
    return ids * 100 + kl;
}

const ALLE = fs.readdirSync(path.join(L.WURZEL, 'css')).filter(f => f.endsWith('.css'))
    .flatMap(f => regeln(L.lies('css', f)).map(r => Object.assign(r, { datei: f })));

describe('UI-102: Kartenzeilen der Analyse-Ansichten haben feste Groessen', () => {
    for (const ansicht of ['#city-league-analysis', '#current-analysis', '#past-meta']) {
        for (const kl of KLASSEN) {
            it(ansicht + ' .' + kl, () => {
                const treffer = ALLE.filter(r => r.datei === 'mobile-responsive.css' && /font-size/.test(r.rumpf))
                    .flatMap(r => r.sel.split(',').map(s => ({ s: s.trim(), r })))
                    .filter(x => x.s.startsWith(ansicht + ' ') && x.s.includes('.' + kl) && x.s.includes('.city-league-card-info-bottom'));
                assert.ok(treffer.length, 'keine feste Regel fuer ' + ansicht + ' .' + kl);
                const wert = treffer[treffer.length - 1].r.rumpf.match(/font-size\s*:\s*([^;]+)/)[1].trim();
                assert.match(wert, /^var\(--fs-(xs|sm)\)$/, 'Wert ' + wert);
                const meine = Math.min(...treffer.map(x => spezifitaet(x.s)));
                const eigene = new Set(treffer.map(x => x.s));
                const andere = ALLE.filter(r => /font-size/.test(r.rumpf))
                    .flatMap(r => r.sel.split(',').map(s => s.trim()))
                    .filter(s => s.includes('.' + kl) && !eigene.has(s))
                    // nur Regeln, die in dieser Ansicht greifen koennen
                    .filter(s => !/^#/.test(s) || s.startsWith(ansicht));
                for (const s of andere) assert.ok(spezifitaet(s) < meine, s + ' (' + spezifitaet(s) + ') schlaegt die feste Regel (' + meine + ')');
                const wichtig = ALLE.filter(r => /font-size\s*:[^;]*!important/.test(r.rumpf) && r.sel.includes('.' + kl));
                assert.deepEqual(wichtig.map(r => r.sel), [], 'Vorrangmarke auf der Schriftgroesse');
            });
        }
    }
});
