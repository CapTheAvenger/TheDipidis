/* UI-158 (Hausi, 02.11.2026): „Meistgespielte Karten – nur in Japan“ in der Reihenfolge einer Deckliste:
   Pokémon (nach Element Gras, Feuer, Wasser, Elektro, Psycho, Kampf, Finsternis, Metall, Drache, Farblos),
   dann Supporter, Item, Tool, Stadion, Spezial-Energie, Basis-Energie. Die Funktionen werden AUSGEFUEHRT (vm),
   mit Daten, die der Test selbst setzt (Wachhund test-testdaten-wachhund.js). */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JS = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-city-league.js'), 'utf8');

function schneide(q, name) {
    const t = new RegExp(`function\\s+${name}\\s*\\(`).exec(q);
    assert.ok(t, 'Funktion fehlt: ' + name);
    let tiefe = 0;
    for (let i = q.indexOf('{', t.index); i < q.length; i++) {
        if (q[i] === '{') tiefe++;
        else if (q[i] === '}' && --tiefe === 0) return q.slice(t.index, i + 1);
    }
    throw new Error('Klammer offen: ' + name);
}
const elemente = /var CITY_LEAGUE_JP_ELEMENTE = [^;]*;/.exec(JS);
assert.ok(elemente, 'Elementliste fehlt');
function laden(win) {
    const ctx = vm.createContext({ window: win, Object, Math, String, Array, parseInt, JSON });
    vm.runInContext(elemente[0] + '\n' + ['cityLeagueJpDex', 'cityLeagueJpElement', 'cityLeagueJpKategorie', 'cityLeagueJpSortieren']
        .map((n) => schneide(JS, n)).join('\n'), ctx);
    return ctx;
}
// Dex-Nummern und Typen sind ERFUNDEN, nur fuer diesen Test.
const win = {
    pokedexNumbers: { gras1: 10, gras2: 11, feuer: 20, wasser: 30, farblos: 40, kampf: 50 },
    pokemonTypeMap: { 10: 'Grass', 11: 'Grass', 20: 'Fire', 30: 'Water', 40: 'Colorless', 50: 'Fighting' }
};
const k = (name, type, listen) => ({ name, type, listen, archetypen: 1 });
const namen = (l) => l.map((x) => x.name).join(',');

describe('UI-158 Reihenfolge der Japan-Karten', () => {
    const ctx = laden(win);
    const eingabe = () => [
        k('Stadion A', 'Stadium', 900), k('Farblos', 'Basic', 50), k('Energie', 'Special Energy', 5),
        k('Supporter A', 'Supporter', 10), k('Feuer', 'Basic', 99), k('Gras2', 'Stage 1', 1),
        k('Tool A', 'Tool', 20), k('Item A', 'Item', 30), k('Gras1', 'Basic', 1),
        k('Kampf', 'Basic', 77), k('Wasser', 'Basic', 60)
    ];
    it('Kategorien: Pokémon, Supporter, Item, Tool, Stadion, Spezial-Energie', () => {
        const r = ctx.cityLeagueJpSortieren(eingabe());
        assert.deepEqual(r.slice(-5).map((x) => x.name).join(','), 'Supporter A,Item A,Tool A,Stadion A,Energie');
    });
    it('Pokémon nach Element, nicht nach Beliebtheit', () => {
        const r = ctx.cityLeagueJpSortieren(eingabe());
        assert.equal(namen(r.slice(0, 6)), 'Gras1,Gras2,Feuer,Wasser,Kampf,Farblos');
    });
    it('Entwicklungslinie: gleiche Nummernreihe, Basis vor Phase 1', () => {
        const l = [k('Gras2', 'Stage 1', 999), k('Gras1', 'Basic', 1)];
        assert.equal(namen(ctx.cityLeagueJpSortieren(l)), 'Gras1,Gras2');
    });
    it('unbekanntes Element steht am Ende der Pokémon, vor den Supportern', () => {
        const l = [k('Supporter A', 'Supporter', 1), k('Unbekannt', 'Basic', 9999), k('Farblos', 'Basic', 1)];
        assert.equal(namen(ctx.cityLeagueJpSortieren(l)), 'Farblos,Unbekannt,Supporter A');
    });
    it('Nicht-Pokémon: meistgespielt zuerst', () => {
        const l = [k('S1', 'Supporter', 5), k('S2', 'Supporter', 50)];
        assert.equal(namen(ctx.cityLeagueJpSortieren(l)), 'S2,S1');
    });
    it('ohne geladene Tabellen faellt die Sortierung nicht um', () => {
        const c2 = laden({});
        const r = c2.cityLeagueJpSortieren([k('Supporter A', 'Supporter', 1), k('Karte', 'Basic', 5)]);
        assert.equal(namen(r), 'Karte,Supporter A');
    });
    it('Rang bleibt der Platz nach Beliebtheit und wird eingetragen, bevor umsortiert wird', () => {
        const rumpf = schneide(JS, 'cityLeagueJpKartenBerechnen').replace(/\/\*[\s\S]*?\*\//g, '');
        assert.ok(rumpf.indexOf('k.rang = i + 1') !== -1 && rumpf.indexOf('k.rang = i + 1') < rumpf.indexOf('cityLeagueJpSortieren(liste)'),
            'rang vor dem Sortieren setzen');
    });
});
