/**
 * Audit 2, Gruppe A — F06: Heatmap-Zell-Tooltip zeigte "375W - 338L
 * (720 Spiele)", aber 375+338=713. Die 7 Unentschieden fehlten unbenannt.
 * Gemessen 21.08.2026: in 423 von 1546 Zellen (27 %) ist W+L != total_games.
 *
 * Der Tooltip-Template-Ausdruck wird wörtlich aus der Quelle geschnitten und
 * mit W=375, L=338, U=7, total_games=720 ausgeführt. Die genannten Zahlen
 * müssen sich sichtbar auf total_games summieren.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-current-meta.js'), 'utf8');

const line = SRC.match(/const tooltip = `[^`]*`;/);
assert.ok(line, 'Tooltip-Template-Zeile nicht gefunden');

const t = (k) => ({ 'heatmap.games': 'Spiele', 'heatmap.raw': 'roh' }[k] || k);
const bauTooltip = new Function(
    'parsedWins', 'parsedLosses', 'parsedDraws', 'totalGames', 'winRateRoh', 't',
    line[0] + '\nreturn tooltip;'
);

describe('F06 — Unentschieden stehen im Heatmap-Tooltip', () => {
    it('375W - 338L - 7U summieren sich sichtbar auf 720', () => {
        const out = bauTooltip(375, 338, 7, 720, 52.6, t);
        // Alle drei Ergebnisarten benannt.
        assert.match(out, /375W/);
        assert.match(out, /338L/);
        assert.match(out, /7U/, 'die 7 Unentschieden fehlen im Tooltip');
        assert.match(out, /720/);

        // Die genannten W/L/U müssen exakt total_games ergeben — sonst geht
        // die Bilanz für den Leser nicht auf.
        const m = out.match(/(\d+)W\D+(\d+)L\D+(\d+)U/);
        assert.ok(m, 'W/L/U nicht im erwarteten Format');
        const [w, l, u] = [Number(m[1]), Number(m[2]), Number(m[3])];
        assert.equal(w + l + u, 720, 'W+L+U ergibt nicht die angezeigten Spiele');
    });

    it('auch bei 0 Unentschieden geht die Summe auf', () => {
        const out = bauTooltip(3, 0, 0, 3, 100, t);
        const m = out.match(/(\d+)W\D+(\d+)L\D+(\d+)U/);
        assert.ok(m);
        assert.equal(Number(m[1]) + Number(m[2]) + Number(m[3]), 3);
    });
});
