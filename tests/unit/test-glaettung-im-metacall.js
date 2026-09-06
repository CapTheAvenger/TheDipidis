/**
 * EIN 3-0 KAM ALS 100 % IN DIE TAG-2-KETTE.
 *
 * BEFUND (06.09.2026, gemessen an data/limitless_online_decks_matchups.csv,
 * 1.702 Zeilen). Die Online-Matchupkarte des Meta Call war die einzige,
 * die nie geglättet wurde.
 *
 *     22 Paarungen erreichten calcDay2 mit pWin = 100 %
 *     59 Paarungen mit pWin = 0 %
 *     alle auf 3 bis 13 Partien
 *
 * Beispiele aus den Daten:
 *     Blaziken Zoroark  vs Raging Bolt Ogerpon   3-0-0
 *     Mega Abomasnow    vs Basic Box             0-5-0
 *
 * In einer Kette über acht Runden heißt 100 %: dieses Match ist
 * gewonnen, bevor es gespielt wurde.
 *
 * Das Mittel dagegen liegt seit dem 19.08.2026 im Haus.
 * js/matchup-glaettung.js nennt in seinem Kopf wörtlich dieselben Fälle
 * — "Sylveon vs Mega Excadrill 0-4 -> 0,0 %" — und die Heatmap wie auch
 * die Major-Karte (_collapseAgg) benutzen es. Der Meta Call nicht.
 *
 * ZWEITER BEFUND AN DERSELBEN STELLE. pWin = S/(S+N+U) ist für die
 * KETTE richtig; drei Ausgänge müssen sich zu eins addieren. Nur wurde
 * derselbe Wert auch als "WR" angezeigt, wo das Haus S/(S+N) rechnet:
 *
 *     523 von 1.702 Zeilen (30,7 %) wichen ab
 *     Median 0,93 pp, Maximum 26,67 pp
 *     Steven's Metagross vs Cynthia's Garchomp, 2-1-2:
 *         angezeigt 40,0 %  —  Hauskonvention 66,7 %
 *
 * Beide Fehler löst derselbe Schritt: die geglättete Quote S/(S+N) ist
 * die belastbare Größe, sie wird angezeigt, und die
 * Kettenwahrscheinlichkeiten werden aus ihr abgeleitet.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const MC = lies('js', 'app-meta-call.js');
const GL = lies('js', 'matchup-glaettung.js');

/** Den Anzeigehelfer aus dem Quelltext greifen und laufen lassen. */
function ladeAnzeigeQuote() {
    const anfang = MC.indexOf('function _anzeigeQuote(m) {');
    assert.ok(anfang >= 0, '_anzeigeQuote wurde nicht gefunden');
    const ende = MC.indexOf('\n  }', anfang);
    return new Function(MC.slice(anfang, ende + 4) + ' return _anzeigeQuote;')();
}

/** Die echte Glättung, damit hier nichts nachgebaut wird. */
function ladeGlaettung() {
    const sandbox = { window: {} };
    new Function('window', GL).call(sandbox, sandbox.window);
    return sandbox.window.DsGlaettung;
}

/** Der Zweig, der die Karte baut — mit echter Glättung ausgeführt. */
function ladeKartenbau() {
    const anfang = MC.indexOf('        let pWin, pTie, pLoss, quote, roh;');
    assert.ok(anfang >= 0, 'der Kartenbau wurde nicht gefunden');
    const ende = MC.indexOf('        /* DER NENNER WIRD MITGEFUEHRT', anfang);
    assert.ok(ende > anfang, 'das Ende des Zweigs wurde nicht gefunden');
    const stueck = MC.slice(anfang, ende);
    const G = ladeGlaettung();
    return (record, winRate) => {
        const f = new Function('r', 'window', 'parseEU',
            stueck + ' return { pWin, pTie, pLoss, quote, roh };');
        return f({ record, win_rate: winRate }, { DsGlaettung: G },
                 (v) => parseFloat(String(v).replace(',', '.')));
    };
}

describe('Die Online-Matchupkarte wird geglättet', () => {

    it('ein 3-0 ist keine 100-Prozent-Paarung mehr', () => {
        const bau = ladeKartenbau();
        const m = bau('3 - 0 - 0');
        assert.ok(m.pWin < 0.7, `pWin ${m.pWin} — ein 3-0 wirkt wieder wie Gewissheit`);
        assert.ok(Math.abs(m.quote - 56.52) < 0.1,
            `quote ${m.quote} statt 56,5 % (Beta-Binomial mit k=20)`);
        assert.strictEqual(m.roh, 100, 'der Rohwert muss erhalten bleiben');
    });

    it('ein 0-5 ist keine 0-Prozent-Paarung mehr', () => {
        const bau = ladeKartenbau();
        const m = bau('0 - 5 - 0');
        assert.ok(m.pWin > 0.3, `pWin ${m.pWin} — ein 0-5 wirkt wieder wie ein sicherer Verlust`);
        assert.ok(Math.abs(m.quote - 40.0) < 0.1, `quote ${m.quote} statt 40,0 %`);
        assert.strictEqual(m.roh, 0);
    });

    it('eine belastbare Paarung bleibt praktisch unangetastet', () => {
        /* Der Sinn der Glättung: sie fasst an, was zu dünn ist, und
           lässt den Rest in Ruhe. */
        const bau = ladeKartenbau();
        const m = bau('60 - 40 - 0');
        assert.ok(Math.abs(m.roh - 60) < 0.01);
        assert.ok(Math.abs(m.quote - 58.33) < 0.1, `quote ${m.quote} statt 58,3 %`);
        assert.ok(Math.abs(m.quote - m.roh) < 2, 'eine 100-Partien-Paarung darf sich kaum bewegen');
    });

    it('die drei Wahrscheinlichkeiten summieren sich auf eins', () => {
        const bau = ladeKartenbau();
        for (const rec of ['3 - 0 - 0', '0 - 5 - 0', '60 - 40 - 0', '2 - 1 - 2', '0 - 0 - 4']) {
            const m = bau(rec);
            const s = m.pWin + m.pTie + m.pLoss;
            assert.ok(Math.abs(s - 1) < 1e-9, `Summe ${s} bei ${rec}`);
            assert.ok(m.pWin >= 0 && m.pLoss >= 0 && m.pTie >= 0, `negativ bei ${rec}`);
        }
    });

    it('der Unentschieden-Anteil der Quelle bleibt erhalten', () => {
        const bau = ladeKartenbau();
        const m = bau('2 - 1 - 2');
        assert.ok(Math.abs(m.pTie - 2 / 5) < 1e-9, `pTie ${m.pTie} statt 0,4`);
    });

    it('ohne Bilanz greift der Rückfall auf win_rate', () => {
        const bau = ladeKartenbau();
        const m = bau('', '63,5');
        assert.ok(Math.abs(m.quote - 63.5) < 0.01, `quote ${m.quote}`);
        assert.ok(Math.abs(m.pWin + m.pTie + m.pLoss - 1) < 1e-9);
    });
});

describe('Angezeigt wird die Hauskonvention S/(S+N)', () => {

    it('der Fall aus dem Befund rechnet sich richtig', () => {
        /* Steven's Metagross vs Cynthia's Garchomp, 2-1-2. */
        const q = ladeAnzeigeQuote();
        const m = { pWin: 2 / 5, pTie: 2 / 5, pLoss: 1 / 5 };
        assert.ok(Math.abs(q(m) - 66.67) < 0.01,
            `${q(m)} statt 66,67 — das ist genau die 26,67-pp-Abweichung`);
    });

    it('eine Paarung ohne pLoss wird nicht zu 100 %', () => {
        /* Der Fehler, den die erste Fassung des Helfers hatte: bei
           { pWin: 0.65 } teilte er durch pWin allein. */
        const q = ladeAnzeigeQuote();
        assert.ok(Math.abs(q({ pWin: 0.65 }) - 65) < 0.01, `${q({ pWin: 0.65 })} statt 65`);
    });

    it('kein Eintrag und kein pWin geben 50, nicht NaN', () => {
        const q = ladeAnzeigeQuote();
        assert.strictEqual(q(null), 50);
        assert.strictEqual(q({}), 50);
        assert.strictEqual(q({ pWin: 0, pLoss: 0 }), 50);
    });

    it('die Umstellung auf die Präsenz-Unentschieden-Quote ändert die Anzeige nicht', () => {
        /* Genau deshalb wird aus pWin und pLoss zurückgerechnet statt
           durchgereicht: das Verhältnis überlebt jeden Zwischenschritt. */
        const q = ladeAnzeigeQuote();
        const vorher = { pWin: 0.47, pTie: 0.02, pLoss: 0.51 };
        const rest = 1 - 0.1095;
        const sn = vorher.pWin + vorher.pLoss;
        const nachher = { pWin: (vorher.pWin / sn) * rest, pTie: 0.1095,
                          pLoss: rest - (vorher.pWin / sn) * rest };
        assert.ok(Math.abs(q(vorher) - q(nachher)) < 1e-9,
            `${q(vorher)} != ${q(nachher)}`);
    });

    it('alle vier Anzeigestellen gehen durch den Helfer', () => {
        const treffer = (MC.match(/_anzeigeQuote\(/g) || []).length;
        assert.ok(treffer >= 5,
            `nur ${treffer} Aufrufe — erwartet der Helfer selbst plus vier Anzeigestellen`);
        assert.ok(!/Math\.round\(m\.pWin \* 100\)/.test(MC),
            'eine Anzeigestelle rechnet noch direkt mit pWin');
    });

    it('der Befund steht mit seinen Zahlen im Quelltext', () => {
        for (const zahl of ['26,67', '523', '1.702', '3-0']) {
            assert.ok(MC.includes(zahl), `die Zahl ${zahl} fehlt in der Begründung`);
        }
    });
});
