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
const UTILS = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-utils.js'), 'utf8');
const elemente = /var CITY_LEAGUE_JP_ELEMENTE = [^;]*;/.exec(JS)[0];
const ctx = vm.createContext({ window: {}, Object, Math, String, Number, isFinite, parseFloat, parseInt, Array });
const nummern = /const LEGENDARY_STADIEN_NUMMERN = [^;]*;/.exec(UTILS)[0].replace('const ', 'var ');
vm.runInContext(nummern + '\n' + ['istLegendaryStadion', 'legendaryFaktor'].map((n) => schneide(UTILS, n)).join('\n'), ctx);
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
    it('erkannt wird am Set-Code, nicht am Namen: gleicher Name bei anderer Nummer bleibt bei 4', () => {
        assert.equal(ctx.cityLeagueJpMaxProNummer('M6', '75', 4), 2);
        assert.equal(ctx.cityLeagueJpMaxProNummer('M6', '076', 4), 2);
        assert.equal(ctx.cityLeagueJpMaxProNummer('M6', '70', 4), 4);
        assert.equal(ctx.cityLeagueJpMaxProNummer('M5', '75', 4), 4);
        const erg = ctx.cityLeagueJpKartenBerechnen([z({ card_name: 'Anderer Name', set_number: '76', image_url: JP(76) })]);
        assert.equal(erg.karten[0].maxKopien, 2);
    });
    it('fuehren die Daten schon je Nummer (max 2), bleibt es bei 2', () => {
        assert.equal(ctx.cityLeagueJpMaxProNummer('M6', '75', 2), 2);
        assert.equal(ctx.legendaryFaktor('M6', '75', 2), 1);
        assert.equal(ctx.legendaryFaktor('M6', '75', 4), 0.5);
    });
    it('Pokémon mit „Legendary“ im Namen werden nicht gedeckelt', () => {
        assert.equal(ctx.cityLeagueJpMaxProNummer('M5', '12', 4), 4);
    });
    it('die Nummernliste stimmt mit der Kartendatenbank: alle sechs sind Stadien namens „Legendary …“, paarweise gleicher Name', () => {
        const csv = fs.readFileSync(path.join(__dirname, '..', '..', 'data', 'japanese_cards_database.csv'), 'utf8').split(/\r?\n/);
        const kopf = csv[0].split(',');
        const i = (n) => kopf.indexOf(n);
        const zeilen = csv.slice(1).map((l) => l.split(','));
        const liste = /M6: \[([^\]]*)\]/.exec(UTILS)[1].match(/\d+/g);
        assert.ok(liste && liste.length);
        const namen = {};
        liste.forEach((nr) => {
            const r = zeilen.find((x) => x[i('set')] === 'M6' && x[i('number')] === nr);
            assert.ok(r, 'M6 ' + nr + ' fehlt in der Kartendatenbank');
            assert.match(r[i('name')], /^Legendary /);
            assert.match(r[i('type')], /Stadium/);
            namen[nr] = r[i('name')];
        });
        for (let k = 0; k < liste.length; k += 2) assert.equal(namen[liste[k]], namen[liste[k + 1]], 'Paar ' + liste[k]);
    });
    it('die Deck-Uebersicht (Abzeichen und Ø) nutzt den Faktor — Text, weil die Funktion zu gross zum Ausfuehren ist', () => {
        const q = JS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
        assert.ok(q.length > JS.length * 0.3);
        assert.match(q, /legendaryFaktor\(setCode, setNumber, rawMaxCount\)/);
        assert.match(q, /Math\.ceil\(rawMaxCount \* legendaryFaktor1\)/);
        assert.equal((q.match(/avgCount(?:Overall|InUsed)Raw \* legendaryFaktor1/g) || []).length, 2);
        assert.match(q, /\* legendaryFaktor0/);
    });
});
