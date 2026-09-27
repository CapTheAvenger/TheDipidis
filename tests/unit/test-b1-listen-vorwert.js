/**
 * BEFUND B1 (07.09.2026, Reiter "Laufendes Meta", Tier-Liste):
 *
 *   computeTierScore() nannte seinen Eingang `games`, glaettete gegen
 *   `PRIOR_GAMES: 50` und liess den Satz ueber der Liste sagen
 *   "geglaettet gegen einen Vorwert von 50 Matches bei 50 %".
 *   Hineingereicht wird aber `new_count` aus
 *   data/limitless_online_decks_comparison.csv — die Zahl der LISTEN.
 *
 *   Groessenordnung, an der Quelle gemessen: Dragapult steht dort mit
 *   3.138 Listen; dieselbe Woche hat in data/limitless_online_decks.csv
 *   7943 + 6642 + 276 = 14.861 Matches. Der Vorwert wog also rund
 *   4,7-mal schwerer, als sein Name behauptete.
 *
 * WAS DIESER TEST PRUEFT — und was er ausdruecklich NICHT tut:
 *
 *   Er prueft die EINHEIT, nicht die Zahl. Die 50 bleibt die 50; an
 *   keiner Tier-Einordnung aendert sich etwas. Geprueft wird, dass
 *   (a) die Glaettung wirklich gegen deck.new_count wiegt,
 *   (b) new_count in den Daten die Listenzahl ist und nicht die
 *       Partienzahl — beide Dateien werden dafuer gelesen,
 *   (c) der Satz auf der Seite dieselbe Einheit nennt.
 *
 *   Ohne die Umbenennung faellt (c); ohne die Umstellung der Konstante
 *   faellt (a).
 *
 * Live-Daten: nur SCHEMA (welche Spalten es gibt) und eine GLEICHUNG
 * zwischen zwei Exportdateien. Welche Zahlen dort diese Woche stehen,
 * ist der Pruefung egal — siehe tests/unit/test-testdaten-wachhund.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { QUELLE, WURZEL, funktion, schnitt } = require('./lib-tier-sandkasten.js');

// ── Die echte Rechnung, ausgefuehrt ─────────────────────────────────
const RECHNUNG = (() => {
    const kasten = { Math, Number, String, Object, Array, JSON };
    vm.createContext(kasten);
    vm.runInContext(
        schnitt('const TIER_SCORE = Object.freeze({', 'const TIER_SCORE = Object.freeze({')
        + '\n' + funktion('computeTierScore')
        + '\n;globalThis.TIER_SCORE = TIER_SCORE;', kasten);
    return kasten;
})();
const wert = (deck) => RECHNUNG.computeTierScore(deck, null);

// ── Der Satz ueber der Liste, mit der echten Umgebung gebaut ────────
const AUFRUF_MARKE = 'const cmGrundlage = cmTierGrundlageZeile({';

function konstante(re, was) {
    const m = re.exec(QUELLE);
    assert.ok(m, 'im Quelltext nicht gefunden: ' + was);
    return Number(m[1]);
}

function satz(sprache) {
    const ab = QUELLE.indexOf(AUFRUF_MARKE);
    assert.notEqual(ab, -1, 'die Aufrufstelle steht nicht mehr in der Datei');
    const auf = QUELLE.indexOf('{', ab + AUFRUF_MARKE.length - 1);
    const zu = QUELLE.indexOf('});', auf);
    const umgebung = {
        Math, Object, Number, String,
        TIER_SCORE: RECHNUNG.TIER_SCORE,
        T1_MAX: konstante(/const T1_MAX\s*=\s*([\d.]+);/, 'T1_MAX'),
        T2_MAX: konstante(/const T2_MAX\s*=\s*([\d.]+);/, 'T2_MAX'),
        T3_MAX: konstante(/const T3_MAX\s*=\s*([\d.]+);/, 'T3_MAX'),
        T1_MIN_SHARE: konstante(/const T1_MIN_SHARE\s*=\s*([\d.]+);/, 'T1_MIN_SHARE'),
        T1_MIN_WR: konstante(/const T1_MIN_WR\s*=\s*([\d.]+);/, 'T1_MIN_WR'),
        MINDEST_ANTEIL_GROESSTER:
            konstante(/const MINDEST_ANTEIL_GROESSTER\s*=\s*([\d.]+);/, 'MINDEST_ANTEIL_GROESSTER'),
        minCountThreshold: 313.8, _maxCount: 3138,
        labsByName: { irgendein: {} }
    };
    vm.createContext(umgebung);
    const g = vm.runInContext('(' + QUELLE.slice(auf, zu + 1) + ')', umgebung);

    /* SEIT DEM 10.09.2026 GIBT DIE FUNKTION DEN SATZ NICHT ZURUECK.
       Er stand als neun Zeilen Fliesstext in der Tier-Liste und ist
       hinter den Info-Knopf der Ueberschrift gewandert — sie MELDET ihn
       jetzt an window.DsAbschnittInfo. Die Zusicherung unten prueft
       weiterhin denselben Satz aus denselben Konstanten; nur die
       Abholstelle ist eine andere. */
    let gemeldet = '';
    const kasten = {
        Math, Number, String, Object, Array, JSON,
        getLang: () => sprache, escapeHtml: (x) => String(x),
        window: { DsAbschnittInfo: { melde: (id, inh) => {
            gemeldet = String((inh && inh.html) || '');
        } } }
    };
    vm.createContext(kasten);
    vm.runInContext(funktion('cmTierGrundlageZeile'), kasten);
    kasten.cmTierGrundlageZeile(g);
    assert.ok(gemeldet,
        'cmTierGrundlageZeile hat nichts gemeldet — dann steht der Satz '
        + 'nirgends mehr, und diese Pruefung liefe gegen einen leeren String.');
    return gemeldet.replace(/^<p>/, '').replace(/<\/p>$/, '');
}

// ── Die zwei Exportdateien, nur Schema und Gleichung ────────────────
function csv(datei) {
    const zeilen = fs.readFileSync(path.join(WURZEL, 'data', datei), 'utf8')
        .replace(/^﻿/, '').trim().split('\n');
    const kopf = zeilen[0].split(';').map(s => s.trim());
    return {
        spalten: kopf,
        zeilen: zeilen.slice(1).map(z => {
            const t = z.split(';');
            const o = {};
            kopf.forEach((h, i) => { o[h] = t[i]; });
            return o;
        })
    };
}

describe('B1 — der Vorwert der Tier-Glaettung zaehlt Listen, nicht Partien', () => {

    it('die Glaettung wiegt gegen deck.new_count, und der Vorwert steht in derselben Einheit', () => {
        // Vorwert aus dem VERHALTEN zurueckrechnen:
        // adjWR = (n*r/100 + P*0,5) / (n + P) * 100  ->  P = n(r-a)/(a-50)
        const n = 400, r = 100;
        const a = wert({ share: 0, winrate: r, new_count: n }).adjWR;
        const gemessen = n * (r - a) / (a - 50);

        // Gleitkomma: die Ruecklosung landet auf 50,000000000000014.
        assert.equal(Math.round(gemessen), RECHNUNG.TIER_SCORE.PRIOR_LISTEN,
            'der wirksame Vorwert ist nicht die genannte Konstante: ' + gemessen);

        // Und er wiegt gegen new_count: genau so viele Listen wie der
        // Vorwert gross ist, ziehen 100 % exakt auf die Haelfte nach 50.
        const gleichauf = wert({ share: 0, winrate: 100, new_count: RECHNUNG.TIER_SCORE.PRIOR_LISTEN }).adjWR;
        assert.equal(gleichauf, 75,
            'bei new_count = Vorwert muessen Daten und Vorwert gleich schwer wiegen');

        // Der alte Name darf nicht zurueckkommen — er hat die Einheit
        // falsch benannt, und genau das war der Befund.
        assert.equal('PRIOR_GAMES' in RECHNUNG.TIER_SCORE, false,
            'PRIOR_GAMES ist zurueck; die Groesse, gegen die geglaettet wird, sind Listen');
    });

    it('new_count IST die Listenzahl: die Vergleichsdatei kennt gar keine Partien', () => {
        const vergleich = csv('limitless_online_decks_comparison.csv');
        const ladder = csv('limitless_online_decks.csv');

        assert.ok(vergleich.spalten.includes('new_count'),
            'Spalte new_count fehlt: ' + vergleich.spalten.join(','));
        ['wins', 'losses', 'ties', 'games', 'matches'].forEach(sp => {
            assert.equal(vergleich.spalten.includes(sp), false,
                'die Vergleichsdatei fuehrt plötzlich eine Partienspalte: ' + sp);
        });
        ['count', 'wins', 'losses', 'ties'].forEach(sp => {
            assert.ok(ladder.spalten.includes(sp),
                'limitless_online_decks.csv fuehrt ' + sp + ' nicht mehr');
        });

        // Gleichung zwischen zwei Exporten derselben Woche: new_count ist
        // dieselbe Groesse wie `count`, und `count` steht dort NEBEN den
        // Partienspalten. Welche Zahlen das sind, ist hier egal.
        const nachName = new Map(ladder.zeilen.map(z => [z.deck_name, z]));
        const abweichend = vergleich.zeilen
            .filter(z => nachName.has(z.deck_name))
            .filter(z => nachName.get(z.deck_name).count !== z.new_count)
            .map(z => z.deck_name + ': ' + nachName.get(z.deck_name).count + ' vs ' + z.new_count);
        assert.deepEqual(abweichend, [],
            'new_count und count laufen auseinander — dann ist unklar, was geglaettet wird');

        // Und die beiden Einheiten sind eben NICHT dasselbe.
        const summe = (f) => ladder.zeilen.reduce((s, z) => s + f(z), 0);
        const listen = summe(z => parseInt(z.count || 0, 10) || 0);
        const partien = summe(z => (parseInt(z.wins || 0, 10) || 0)
            + (parseInt(z.losses || 0, 10) || 0) + (parseInt(z.ties || 0, 10) || 0));
        assert.ok(partien > listen,
            'Listen ' + listen + ', Partien ' + partien
            + ' — ohne Unterschied waere die Umbenennung gegenstandslos');
    });

    it('der Satz ueber der Liste nennt dieselbe Einheit wie die Rechnung', () => {
        const vorwert = RECHNUNG.TIER_SCORE.PRIOR_LISTEN;
        const de = satz('de');
        const en = satz('en');

        assert.ok(de.includes('Vorwert von ' + vorwert + ' Listen bei 50 %'),
            'der deutsche Satz nennt den Vorwert nicht in Listen:\n' + de);
        assert.ok(en.includes('prior of ' + vorwert + ' lists at 50 %'),
            'der englische Satz nennt den Vorwert nicht in Listen:\n' + en);
        assert.equal(de.includes(vorwert + ' Partien bei'), false,
            '"Partien" steht wieder am Vorwert:\n' + de);

        // Die Labs-Schwelle zaehlt dagegen WIRKLICH Partien
        // (labsByName[].games aus der Turnierdatei) — die Umbenennung
        // darf sie nicht mitgerissen haben.
        assert.ok(de.includes('ab ' + RECHNUNG.TIER_SCORE.LABS_MIN_PARTIEN + ' Matches je Deck'),
            'die Labs-Schwelle zaehlt Matches (UI-18: Matches statt Partien) und muss so heissen:\n' + de);
    });
});
