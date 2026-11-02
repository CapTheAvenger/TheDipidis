/* UI-159 (Hausi, 02.11.2026): Legendary-Stadien bestehen aus zwei Haelften gleichen Namens; von jeder Seite
   hoechstens 2 im Deck. Die Daten fuehren die Namens-Gesamtmenge (4) bei EINER Nummer. Die Funktionen werden
   AUSGEFUEHRT (vm) mit selbst gesetzten Zeilen (Wachhund test-testdaten-wachhund.js). */
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
const elemente = /var CITY_LEAGUE_JP_ELEMENTE = [^;]*;/.exec(JS)[0];
const ctx = vm.createContext({ window: {}, Object, Math, String, Number, isFinite, parseFloat, parseInt, Array });
vm.runInContext(elemente + '\n' + ['cityLeagueJpDruck', 'cityLeagueJpMaxProNummer', '_clZahl', 'cityLeagueJpDex', 'cityLeagueJpElement',
    'cityLeagueJpKategorie', 'cityLeagueJpSortieren', 'cityLeagueJpKartenBerechnen', 'cityLeagueJpListeText'].map((n) => schneide(JS, n)).join('\n'), ctx);
const JP = (n) => 'https://x/tpc/M6/M6_' + n + '_R_JP_LG.png';
const z = (o) => Object.assign({ tournament_id: '1', archetype: 'A', total_decks_in_archetype: '10', deck_inclusion_count: '5',
    max_count: '4', card_name: 'Legendary Lava Cave', set_code: 'M6', set_number: '75', image_url: JP(75), type: 'Stadium' }, o);

describe('UI-159 Legendary-Stadien: je Seite hoechstens 2', () => {
    it('4 nach Namen bei Nummer 75 oder 76 = 2 je Seite', () => {
        const erg = ctx.cityLeagueJpKartenBerechnen([z({}), z({ set_number: '76', image_url: JP(76), archetype: 'B' })]);
        assert.equal(erg.karten.length, 2);
        erg.karten.forEach((k) => assert.equal(k.maxKopien, 2, k.set_number));
    });
    it('die Kopierliste nennt 2× je Nummer, nicht 4×', () => {
        const erg = ctx.cityLeagueJpKartenBerechnen([z({}), z({ set_number: '76', image_url: JP(76), archetype: 'B' })]);
        const text = ctx.cityLeagueJpListeText(erg.karten);
        assert.match(text, /2× Legendary Lava Cave \(M6 75\)/);
        assert.match(text, /2× Legendary Lava Cave \(M6 76\)/);
        assert.doesNotMatch(text, /4×/);
    });
    it('andere Karten behalten ihre Menge (4× Stadion ohne „Legendary“, 4× Pokémon)', () => {
        assert.equal(ctx.cityLeagueJpMaxProNummer('Gym', 'Stadium', 4), 4);
        assert.equal(ctx.cityLeagueJpMaxProNummer('Talonflame ex', 'Stage 2', 4), 4);
        assert.equal(ctx.cityLeagueJpMaxProNummer('Legendary Lava Cave', 'Stadium', 2), 1);
    });
    it('Pokémon, die „Legendary“ im Namen tragen, werden nicht gedeckelt', () => {
        assert.equal(ctx.cityLeagueJpMaxProNummer('Legendary Pokemon X', 'Basic', 4), 4);
    });
});
