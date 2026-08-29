/**
 * calcDay2 — die Markow-Kette hinter der Day-2-Wahrscheinlichkeit.
 *
 * Am 29.08.2026 durch Mutation nachgewiesen: diese Kette hatte NULL
 * Zusagen. Ein Sieg gab statt 3 nur 2 Punkte — 2318 Zusagen blieben
 * gruen. Das ist die Stelle, an der ein stiller Rechenfehler am
 * laengsten unbemerkt bliebe: die Ausgabe ist eine Wahrscheinlichkeit
 * zwischen 0 und 1, jeder Fehler sieht plausibel aus, und die
 * Empfehlungsreihenfolge kommt inzwischen aus _day2Schrumpfung — ein
 * Fehler hier veraendert also nicht einmal mehr die Liste, an der er
 * auffallen wuerde.
 *
 * Geprueft wird die echte Funktion aus js/app-meta-call.js.
 * Die Erwartungswerte sind von Hand gerechnet, nicht aus dem Lauf
 * uebernommen — sonst wuerde die Zusage nur bestaetigen, was der Code
 * ohnehin tut.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

function schneideFunktion(quelle, name) {
    const start = quelle.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, `${name} ist nicht mehr auffindbar`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    assert.fail(`${name} hat keine schliessende Klammer`);
}

// Die echte Kette, mit gesetzter Umgebung ausgefuehrt.
function kette({ rounds, day2Points, myDeck = 'A', matchup }) {
    const quelle = [
        `const _settings = ${JSON.stringify({ rounds, day2Points, myDeck })};`,
        'const normalize = (s) => String(s).trim().toLowerCase();',
        `const _m = ${matchup};`,
        'const getBaseMatchup = _m; const getMatchup = _m;',
        schneideFunktion(MC, 'calcDay2'),
        'return calcDay2;',
    ].join('\n');
    return new Function(quelle)();
}

// Ein Feld aus einem einzigen Gegner: dann ist die Kette exakt eine
// Binomialverteilung und von Hand nachrechenbar.
const EIN_GEGNER = [{ name: 'B', finalShare: 100 }];

describe('calcDay2 — Punktvergabe', () => {
    it('ein Sieg gibt 3 Punkte, ein Unentschieden 1, eine Niederlage 0', () => {
        // Reiner Siegfall: 3 Runden, immer gewinnen -> 9 Punkte.
        const f = kette({ rounds: 3, day2Points: 9,
            matchup: '() => ({ pWin: 1, pTie: 0, pLoss: 0 })' });
        const r = f(EIN_GEGNER, 'A');
        assert.ok(Math.abs(r.day2Prob - 1) < 1e-9, 'drei Siege muessen 9 Punkte ergeben');
        assert.ok(Math.abs(r.dp[9] - 1) < 1e-9, 'die Masse muss auf Punkt 9 liegen');

        // Reines Unentschieden: 3 Runden -> genau 3 Punkte, nicht mehr.
        const g = kette({ rounds: 3, day2Points: 4,
            matchup: '() => ({ pWin: 0, pTie: 1, pLoss: 0 })' });
        const rg = g(EIN_GEGNER, 'A');
        assert.ok(rg.day2Prob < 1e-9, 'drei Unentschieden duerfen 4 Punkte nicht erreichen');
        assert.ok(Math.abs(rg.dp[3] - 1) < 1e-9, 'die Masse muss auf Punkt 3 liegen');

        // Reine Niederlage: 0 Punkte.
        const h = kette({ rounds: 3, day2Points: 1,
            matchup: '() => ({ pWin: 0, pTie: 0, pLoss: 1 })' });
        assert.ok(h(EIN_GEGNER, 'A').day2Prob < 1e-9, 'drei Niederlagen geben 0 Punkte');
    });

    it('die Verteilung ueber die Punkte stimmt gegen die Handrechnung', () => {
        // 3 Runden, p(Sieg) = 0,5, p(Niederlage) = 0,5, kein Unentschieden.
        // Punkte = 3 * Siege. P(genau k Siege) = C(3,k) * 0,5^3.
        const f = kette({ rounds: 3, day2Points: 6,
            matchup: '() => ({ pWin: 0.5, pTie: 0, pLoss: 0.5 })' });
        const r = f(EIN_GEGNER, 'A');
        assert.ok(Math.abs(r.dp[9] - 0.125) < 1e-9, 'P(3 Siege) = 1/8');
        assert.ok(Math.abs(r.dp[6] - 0.375) < 1e-9, 'P(2 Siege) = 3/8');
        assert.ok(Math.abs(r.dp[3] - 0.375) < 1e-9, 'P(1 Sieg) = 3/8');
        assert.ok(Math.abs(r.dp[0] - 0.125) < 1e-9, 'P(0 Siege) = 1/8');
        // Day 2 ab 6 Punkten = mindestens 2 Siege = 1/8 + 3/8.
        assert.ok(Math.abs(r.day2Prob - 0.5) < 1e-9, 'P(>= 6 Punkte) = 1/2');
    });

    it('die Verteilung ist eine Verteilung — sie summiert auf 1', () => {
        const f = kette({ rounds: 5, day2Points: 12,
            matchup: '() => ({ pWin: 0.4, pTie: 0.2, pLoss: 0.4 })' });
        const r = f(EIN_GEGNER, 'A');
        const summe = Array.from(r.dp).reduce((s, x) => s + x, 0);
        assert.ok(Math.abs(summe - 1) < 1e-9, `Summe war ${summe}`);
    });
});

describe('calcDay2 — Erwartungswerte', () => {
    it('Siege, Unentschieden und Niederlagen summieren sich auf die Rundenzahl', () => {
        const f = kette({ rounds: 7, day2Points: 15,
            matchup: '() => ({ pWin: 0.45, pTie: 0.1, pLoss: 0.45 })' });
        const r = f(EIN_GEGNER, 'A');
        assert.ok(Math.abs((r.expWin + r.expTie + r.expLoss) - 7) < 1e-9,
            'jede Runde muss genau einen Ausgang haben');
        assert.ok(Math.abs(r.expWin - 7 * 0.45) < 1e-9);
        assert.ok(Math.abs(r.expTie - 7 * 0.10) < 1e-9);
    });

    it('das Feld wird nach Anteil gewichtet, nicht gleichverteilt', () => {
        // 90 % ein sicherer Sieg, 10 % eine sichere Niederlage.
        // Erwartete Siege bei 10 Runden: 9, nicht 5.
        const feld = [{ name: 'B', finalShare: 90 }, { name: 'C', finalShare: 10 }];
        const f = kette({ rounds: 10, day2Points: 30,
            matchup: '(mein, gegner) => gegner === "B" '
                   + '? ({ pWin: 1, pTie: 0, pLoss: 0 }) : ({ pWin: 0, pTie: 0, pLoss: 1 })' });
        const r = f(feld, 'A');
        assert.ok(Math.abs(r.expWin - 9) < 1e-9, `expWin war ${r.expWin}, erwartet 9`);
    });
});

describe('calcDay2 — das eigene Deck im Feld', () => {
    it('das Spiegelmatch wird als 45/10/45 gerechnet, nicht ueber die Matchup-Karte', () => {
        // Die Karte gibt hier einen sicheren Sieg. Steht das eigene
        // Deck im Feld, darf sie fuer diese Paarung NICHT gelten —
        // sonst gewinnt ein Deck gegen sich selbst.
        const feld = [{ name: 'A', finalShare: 100 }];
        const f = kette({ rounds: 4, day2Points: 12, myDeck: 'A',
            matchup: '() => ({ pWin: 1, pTie: 0, pLoss: 0 })' });
        const r = f(feld, 'A');
        assert.ok(Math.abs(r.expWin - 4 * 0.45) < 1e-9,
            `Spiegel muss 0,45 geben, expWin war ${r.expWin}`);
    });

    it('auch die Kette selbst erkennt den Spiegel, nicht nur der Erwartungswert', () => {
        // Die Spiegelpruefung steht ZWEIMAL im Code: einmal in der
        // Markow-Kette, einmal in der Erwartungswert-Schleife. Eine
        // Zusage auf expWin deckt die Kette nicht ab — gemessen: die
        // Sabotage der Kettenzeile blieb gruen, solange nur expWin
        // geprueft wurde.
        const feld = [{ name: 'A', finalShare: 100 }];
        const f = kette({ rounds: 4, day2Points: 12, myDeck: 'A',
            matchup: '() => ({ pWin: 1, pTie: 0, pLoss: 0 })' });
        // Alle 4 Runden gewinnen: ohne Spiegel 1,0 — mit Spiegel 0,45^4.
        assert.ok(Math.abs(f(feld, 'A').day2Prob - Math.pow(0.45, 4)) < 1e-9,
            'die Kette rechnet das Spiegelmatch ueber die Matchup-Karte');
    });

    it('der Vergleich laeuft ueber normalize, nicht ueber Gleichheit der Rohnamen', () => {
        // Hausregel: nie ueber rohe Namen verknuepfen. " A " und "A"
        // sind dasselbe Deck — in beiden Schleifen.
        const feld = [{ name: '  A  ', finalShare: 100 }];
        const f = kette({ rounds: 4, day2Points: 12, myDeck: 'A',
            matchup: '() => ({ pWin: 1, pTie: 0, pLoss: 0 })' });
        const r = f(feld, 'A');
        assert.ok(Math.abs(r.expWin - 4 * 0.45) < 1e-9,
            'der Spiegel wurde im Erwartungswert ueber den Rohnamen verfehlt');
        assert.ok(Math.abs(r.day2Prob - Math.pow(0.45, 4)) < 1e-9,
            'der Spiegel wurde in der Kette ueber den Rohnamen verfehlt');
    });
});
