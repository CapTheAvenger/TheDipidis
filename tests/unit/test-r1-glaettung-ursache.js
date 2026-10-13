'use strict';
/**
 * BEFUND B3 DER NACHPRUEFUNG (07.09.2026): DIE FUSSNOTE NANNTE DIE
 * KLEINERE URSACHE.
 *
 * Die Kachel "Matchup vs Top 20" zeigt einen PARTIENGEWICHTETEN Schnitt
 * ueber die ROHE Spalte win_rate. Die Matchup-Tabelle darueber zeigt
 * dieselben Paarungen GEGLAETTET, jede Zelle gleich gross. Wer die
 * Zellen im Kopf mittelt, kommt deshalb aus ZWEI Gruenden nicht auf die
 * Zahl der Kachel:
 *
 *   1. geglaettet statt roh (Beta-Binomial, K aus js/matchup-glaettung.js)
 *   2. ungewichtet statt partiengewichtet
 *
 * Die Fussnote nannte nur den ersten. Nachgerechnet an
 * data/limitless_online_decks_matchups.csv ist bei den Decks mit vielen
 * Partien der ZWEITE der groessere (Ränge 1–20: Median |Glaettung| 0,15
 * gegen |Gewichtung| 0,92 Punkte), bei duennen Decks dreht es sich um.
 * Weil es sich dreht, darf die Fussnote nichts pauschal behaupten: sie
 * muss beide Beitraege ausrechnen und den groesseren benennen.
 *
 * DIE BEIDEN KERNPROBEN LAUFEN AUF GESETZTEN PAARUNGEN, bei denen von
 * Hand feststeht, welche Ursache ueberwiegt — einmal so, einmal so. Die
 * dritte Probe liest data/, behauptet aber keinen Wochenwert: sie
 * rechnet den Sollwert aus derselben Datei und verlangt nur, dass der
 * Text den Beitrag benennt, der wirklich der groessere ist.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

const CM = lies('js/app-current-meta-analysis.js');
const GLAETT = lies('js/matchup-glaettung.js');
const KONV = lies('js/win-rate-konvention.js');

function cmStueck(marke) {
    const start = CM.indexOf(marke);
    assert.notEqual(start, -1, 'nicht gefunden in js/app-current-meta-analysis.js: ' + marke);
    let tiefe = 0;
    for (let j = CM.indexOf('{', start); j < CM.length; j++) {
        if (CM[j] === '{') tiefe++;
        else if (CM[j] === '}') { tiefe--; if (tiefe === 0) return CM.slice(start, j + 1); }
    }
    assert.fail(marke + ': die Klammern gehen nicht auf');
    return '';
}

const PARSE_ZAHL = 'function parseLocaleNumber(v, f){ const n = Number(String(v==null?"":v)'
    + '.replace("%","").replace(",",".")); return Number.isFinite(n) ? n : (f===undefined?0:f); }';

function sandkasten() {
    const dok = {
        readyState: 'complete', addEventListener() {}, removeEventListener() {},
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
        body: { classList: { add() {}, remove() {} } },
    };
    const k = {
        console, document: dok, getLang: () => 'de', t: (x) => x,
        zahlLokal: (n, stellen) => {
            if (n == null || n === '') return '';
            const z = Number(n);
            if (!Number.isFinite(z)) return String(n);
            return stellen == null ? z.toLocaleString('de-DE')
                : z.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
        },
    };
    k.window = k;
    vm.createContext(k);
    vm.runInContext(PARSE_ZAHL, k);
    vm.runInContext(KONV, k);
    vm.runInContext(GLAETT, k);
    vm.runInContext(cmStueck('function _cmTop20Schnitt(deckStats, matchupData, cleanArch, matchKey)'), k);
    vm.runInContext(cmStueck('function _cmMatchupFussnote(s)'), k);
    k.matchKey = (x) => String(x || '').toLowerCase();
    return k;
}

/** Die Glaettung noch einmal, damit der Sollwert nicht vom Prueflig kommt. */
const K = Number(/var K = (\d+);/.exec(GLAETT)[1]);
function geglaettet(record) {
    const t = String(record).split(/\s*-\s*/).map(x => parseInt(x, 10) || 0);
    return ((t[0] + K / 2) / (t[0] + t[1] + K)) * 100;
}

/** Kachelwert, gewichtet-geglaettet und Zellenmittel — unabhaengig gerechnet. */
function sollWerte(zeilen) {
    let partien = 0, siege = 0, siegeG = 0, summe = 0;
    zeilen.forEach(z => {
        const g = Number(z.total_games);
        partien += g;
        siege += g * Number(String(z.win_rate).replace(',', '.')) / 100;
        siegeG += g * geglaettet(z.record) / 100;
        summe += geglaettet(z.record);
    });
    const wert = siege / partien * 100;
    const gewGeglaettet = siegeG / partien * 100;
    const zellenMittel = summe / zeilen.length;
    return { wert, gewGeglaettet, zellenMittel,
        dGlaettung: gewGeglaettet - wert, dGewichtung: zellenMittel - gewGeglaettet };
}

const zwei = (x) => Math.abs(x).toLocaleString('de-DE',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vorzeichen = (x) => (x >= 0 ? '+' : '−') + zwei(x);

function fussnote(k, stats, zeilen, deck) {
    k.STATS = stats; k.MU = zeilen; k.DECK = deck;
    const erg = vm.runInContext('_cmTop20Schnitt(STATS, MU, DECK, matchKey)', k);
    k.ERG = erg;
    return { erg, text: vm.runInContext('_cmMatchupFussnote(ERG)', k) };
}

/* ══════════════════════════════════════════════════════════════════ */

describe('B3 — die Fussnote nennt die groessere Ursache, nicht die kleinere', () => {

    const STATS = [
        { rank: '1', deck_name: 'Alpha' },
        { rank: '2', deck_name: 'Beta' },
        { rank: '3', deck_name: 'Gamma' },
    ];

    /* DICKE, UNGLEICH GROSSE PAARUNGEN. Bei 1.000 gegen 100 Partien
       bewegt der Prior (K = 20) fast nichts, die Gewichtung dagegen
       alles: 60 % auf 1.000 Partien gegen 30 % auf 100. */
    const DICK = [
        { deck_name: 'Gamma', opponent: 'Alpha', win_rate: '60,00', record: '600 - 400 - 0', total_games: '1000' },
        { deck_name: 'Gamma', opponent: 'Beta', win_rate: '30,00', record: '30 - 70 - 0', total_games: '100' },
    ];

    /* DUENNE, GLEICH GROSSE PAARUNGEN. 3-0 und 0-4: die Gewichtung kann
       kaum etwas bewegen (3 gegen 4 Partien), der Prior sehr viel. */
    const DUENN = [
        { deck_name: 'Gamma', opponent: 'Alpha', win_rate: '100,00', record: '3 - 0 - 0', total_games: '3' },
        { deck_name: 'Gamma', opponent: 'Beta', win_rate: '0,00', record: '0 - 4 - 0', total_games: '4' },
    ];

    it('gesetzte dicke Paarungen: die GEWICHTUNG ist die groessere Ursache', () => {
        const soll = sollWerte(DICK);
        assert.ok(Math.abs(soll.dGewichtung) > Math.abs(soll.dGlaettung),
            'die gesetzten Zeilen zeigen den Fall gar nicht — dann prueft das hier nichts');

        const k = sandkasten();
        const { erg, text } = fussnote(k, STATS, DICK, 'gamma');
        assert.equal(erg.paarungen, 2);
        assert.equal(Math.round(erg.wert * 1e6), Math.round(soll.wert * 1e6));
        assert.equal(Math.round(erg.geglaettetGewichtet * 1e6), Math.round(soll.gewGeglaettet * 1e6));
        assert.equal(Math.round(erg.zellenMittel * 1e6), Math.round(soll.zellenMittel * 1e6));

        assert.ok(text.includes(`ein einfaches Mittel über jene Zellen ergibt `
            + `${zwei(soll.zellenMittel)} % statt ${zwei(soll.wert)} %`),
            'die Fussnote stellt die beiden Zahlen nicht gegenueber:\n' + text);
        assert.ok(text.includes(`Davon ${vorzeichen(soll.dGlaettung)} Punkte durch die Glättung `
            + `und ${vorzeichen(soll.dGewichtung)} Punkte`),
            'die Fussnote zerlegt die Abweichung nicht in ihre beiden Ursachen:\n' + text);
        assert.ok(/von der GEWICHTUNG, nicht von der Glättung/.test(text),
            'die Fussnote benennt die kleinere Ursache — genau Befund B3:\n' + text);
        assert.ok(!/GLÄTTUNG: bei so dünnen/.test(text));
        assert.ok(text.includes('100 bis 1.000 Matches groß'),
            'die Spannweite der Paarungsgroessen fehlt — sie ist die Begruendung:\n' + text);
    });

    it('gesetzte duenne Paarungen: dann ist es die GLAETTUNG', () => {
        const soll = sollWerte(DUENN);
        assert.ok(Math.abs(soll.dGlaettung) > Math.abs(soll.dGewichtung),
            'die gesetzten Zeilen zeigen den Fall gar nicht — dann prueft das hier nichts');

        const k = sandkasten();
        const { text } = fussnote(k, STATS, DUENN, 'gamma');
        assert.ok(/von der GLÄTTUNG: bei so dünnen/.test(text),
            'bei duennen Paarungen wird die Glaettung nicht mehr als Ursache genannt:\n' + text);
        assert.ok(!/von der GEWICHTUNG, nicht von der Glättung/.test(text));
        assert.ok(text.includes(`Davon ${vorzeichen(soll.dGlaettung)} Punkte durch die Glättung `
            + `und ${vorzeichen(soll.dGewichtung)} Punkte`),
            'die beiden Beitraege stehen nicht da:\n' + text);
    });

    it('die beiden Beitraege addieren sich auf die genannte Abweichung', () => {
        for (const zeilen of [DICK, DUENN]) {
            const soll = sollWerte(zeilen);
            assert.equal(Math.round((soll.dGlaettung + soll.dGewichtung) * 1e9),
                Math.round((soll.zellenMittel - soll.wert) * 1e9),
                'die Zerlegung laesst einen Rest — dann erklaert die Fussnote nicht die '
                + 'ganze Abweichung');
        }
    });

    it('die alte, pauschale Fassung ist weg', () => {
        const k = sandkasten();
        const { text } = fussnote(k, STATS, DICK, 'gamma');
        assert.ok(!/ein Mittel über jene Zellen ergibt deshalb nicht diese Zahl/.test(text),
            'die Fussnote schiebt den Unterschied wieder pauschal auf die Glaettung');
        assert.ok(/ROH \(Spalte win_rate\) und PARTIENGEWICHTET/.test(text),
            'dass dieser Schnitt partiengewichtet ist, steht nicht da — genau die Haelfte, '
            + 'die fehlte:\n' + text);
    });

    it('an den echten Daten: benannt wird der Beitrag, der wirklich groesser ist', () => {
        const zeilen = (rel) => {
            const z = lies(rel).replace(/^﻿/, '').trim().split(/\r?\n/);
            const kopf = z[0].split(';').map(x => x.trim());
            return z.slice(1).map(l => {
                const t = l.split(';'); const o = {};
                kopf.forEach((s, i) => { o[s] = (t[i] || '').trim(); });
                return o;
            });
        };
        const decks = zeilen('data/limitless_online_decks.csv');
        const mus = zeilen('data/limitless_online_decks_matchups.csv');
        const top20 = new Set(decks.filter(d => parseInt(d.rank, 10) <= 20)
            .map(d => d.deck_name.toLowerCase()));

        const k = sandkasten();
        let geprueft = 0;
        for (const d of decks.slice(0, 8)) {
            const eigene = mus.filter(m => m.deck_name.toLowerCase() === d.deck_name.toLowerCase()
                && top20.has(String(m.opponent).toLowerCase()));
            if (eigene.length < 2) continue;
            const soll = sollWerte(eigene);
            const { text } = fussnote(k, decks, mus, d.deck_name.toLowerCase());
            const gewichtungGroesser = Math.abs(soll.dGewichtung) > Math.abs(soll.dGlaettung);
            assert.ok(text.includes(`Davon ${vorzeichen(soll.dGlaettung)} Punkte durch die Glättung `
                + `und ${vorzeichen(soll.dGewichtung)} Punkte`),
                `${d.deck_name}: die Beitraege im Text folgen nicht aus der Datei:\n` + text);
            assert.equal(/von der GEWICHTUNG, nicht von der Glättung/.test(text), gewichtungGroesser,
                `${d.deck_name}: die Fussnote benennt nicht den groesseren der beiden Beitraege`);
            assert.equal(/von der GLÄTTUNG: bei so dünnen/.test(text), !gewichtungGroesser,
                `${d.deck_name}: die Fussnote benennt nicht den groesseren der beiden Beitraege`);
            geprueft++;
        }
        assert.notEqual(geprueft, 0,
            'kein Deck mit Top-20-Paarungen in der Datei — dann prueft das hier nichts');
    });
});
