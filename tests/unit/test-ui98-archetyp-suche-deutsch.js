'use strict';
/*
 * UI-98 (N2-07): die Archetyp-Suche findet deutsche Namen („glurak"), die
 * Gruppen heissen deutsch. archetypDeAlias wird AUSGEFUEHRT — mit der
 * Auszug der Artenliste aus data/champions_names_de.json.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const W = path.join(__dirname, '..', '..');
const CL = fs.readFileSync(path.join(W, 'js', 'app-city-league.js'), 'utf8');
const CMA = fs.readFileSync(path.join(W, 'js', 'app-current-meta-analysis.js'), 'utf8').replace(/\/\/.*$/gm, '');
/* Ein Auszug der Artenliste (data/champions_names_de.json, Abschnitt pokemon),
   klein geschrieben wie im Modul — fest im Test, damit er keine Daten liest. */
const ARTEN = { charizard: 'Glurak', pidgeot: 'Tauboss', 'raging bolt': 'Furienblitz', ogerpon: 'Ogerpon', excadrill: 'Stalobor', raging: 'XX' };

function laden(src) {
    const a = src.indexOf('function archetypDeAlias(');
    const b = src.indexOf('function archetypTrifft(', a);
    return Function(src.slice(a, b) + '\nreturn archetypDeAlias;')();
}

describe('UI-98: Archetyp-Suche mit deutschen Namen', () => {
    const f = laden(CL);
    it('Charizard ex → glurak, zweiwortige Arten zuerst', () => {
        assert.match(f('Charizard Pidgeot', ARTEN), /glurak/);
        assert.match(f('Raging Bolt Ogerpon', ARTEN), new RegExp(ARTEN['raging bolt'].toLowerCase()));
        assert.match(f('Mega Excadrill', ARTEN), new RegExp(ARTEN['excadrill'].toLowerCase()));
    });
    it('die Suche nutzt den Alias in beiden Listenarten', () => {
        assert.equal((CL.match(/_trifft\((o|child)\.textContent, q\)/g) || []).length, 2);
    });
    it('Gruppennamen kommen aus dem Woerterbuch', () => {
        assert.doesNotMatch(CMA, /label = 'Top 10 Meta Decks';|label = 'All Other Decks';/);
    });
    it('VERFAELSCHUNG: nur Einwort-Suche verpasst Raging Bolt', () => {
        const kaputt = CL.replace('for (let n = 3; n >= 1; n--) {', 'for (let n = 1; n >= 1; n--) {');
        assert.notEqual(kaputt, CL);
        assert.doesNotMatch(laden(kaputt)('Raging Bolt', ARTEN), new RegExp(ARTEN['raging bolt'].toLowerCase()));
    });
});
