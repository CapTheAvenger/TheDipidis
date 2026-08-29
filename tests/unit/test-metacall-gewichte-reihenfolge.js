/**
 * Die Grundformel und die Reihenfolge der Stufen.
 *
 * Beides war am 29.08.2026 vollstaendig ungedeckt. Durch Mutation
 * nachgewiesen — jede dieser Sabotagen liess 2318 Zusagen gruen:
 *   * Mode-A-Gewichte 0.30/0.50 -> 0.60/0.20
 *   * Mode-B-Gewichte 0.40/0.20 -> 0.05/0.55
 *   * _computeOnlinePresenceFloor vor _computeFieldSuppression gezogen
 *   * Suppression und Adoption-Boost vertauscht
 *   * Decline-Damper vor den Boden gesetzt
 *   * Normierung auf 137 statt 100
 * Die Kommentare betonen an vier Stellen, dass genau die Reihenfolge
 * das Ergebnis traegt — abgesichert war sie nirgends. Und weil am
 * Ende immer auf 100 % normiert wird, produziert JEDE Vertauschung
 * eine formal einwandfreie, plausibel aussehende Anteilsliste. Ein
 * Fehler faellt hier nicht auf, er sieht nur anders aus.
 *
 * Diese Datei prueft nicht, ob die Zahlen die richtigen sind — das
 * entscheidet der Rueckwaertstest. Sie prueft, dass sie sich nicht
 * unbemerkt aendern, und dass Kommentar und Formel dasselbe sagen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

describe('Grundformel Modus A — die Gewichte', () => {
    const formel = (() => {
        const m = MC.match(/predicted = 0\.\d+ \* ladderPctDamped[\s\S]{0,220}?weeklySignal;/);
        assert.ok(m, 'die Mode-A-Formel ist nicht mehr auffindbar');
        return m[0];
    })();

    it('steht auf 0,30 Leiter / 0,10 mitgebracht / 0,50 Top-8 / 0,10 Wochentrend', () => {
        const zahlen = (formel.match(/0\.\d+ \*/g) || []).map(x => Number(x.slice(0, -2)));
        assert.deepEqual(zahlen, [0.30, 0.10, 0.50, 0.10],
            'die Gewichte haben sich geaendert. Das ist erlaubt — aber nicht '
            + 'nebenbei: der Rueckwaertstest (scripts/predictor_backtest.py) '
            + 'muss die Aenderung tragen, und der Uebersichtskommentar muss mit.');
    });

    it('die vier Gewichte summieren sich auf 1', () => {
        const zahlen = (formel.match(/0\.\d+ \*/g) || []).map(x => Number(x.slice(0, -2)));
        const summe = zahlen.reduce((s, x) => s + x, 0);
        assert.ok(Math.abs(summe - 1) < 1e-9,
            `die Gewichte summieren auf ${summe}. Unter 1 senkt die Formel jede `
            + 'Prognose, ueber 1 hebt sie jede — die Normierung danach verdeckt '
            + 'beides, weil sie ohnehin auf 100 % zieht.');
    });

    it('der Uebersichtskommentar nennt dieselben Gewichte wie die Formel', () => {
        // Genau hier war der Fehler: der Kommentar sagte
        // 0.40/0.30/0.20/0.10 und stand 2300 Zeilen von der Formel
        // entfernt. Wer die Uebersicht las statt der Formel, las das
        // Falsche — und die Uebersicht ist die Stelle, die man liest.
        const i = MC.indexOf('// Mode A baseline (no labs, no TG, no CL):');
        assert.notEqual(i, -1, 'der Uebersichtskommentar fehlt');
        const block = MC.slice(i, i + 260);
        const genannt = (block.match(/0\.\d+ ×/g) || []).map(x => Number(x.slice(0, -2)));
        assert.deepEqual(genannt, [0.30, 0.10, 0.50, 0.10],
            'Kommentar und Formel sind wieder auseinandergelaufen');
    });
});

describe('Die Reihenfolge der Nachlaufstufen', () => {
    // Position statt Zeilennummer: Zeilennummern verschieben sich bei
    // jeder Aenderung, die Reihenfolge nicht.
    const pos = (nadel) => {
        const i = MC.indexOf(nadel);
        assert.notEqual(i, -1, `nicht mehr auffindbar: ${nadel}`);
        return i;
    };

    it('Unterdrueckung laeuft vor dem Gegen-Adoptions-Boost', () => {
        assert.ok(pos('_computeFieldSuppression();') < pos('_computeCounterAdoptionBoost();'),
            'der Boost wuerde auf einen noch nicht unterdrueckten Wert rechnen');
    });

    it('der Online-Presence-Boden laeuft zuletzt, nach allen Daempfern', () => {
        // Sein ganzer Zweck: ein Deck auffangen, das die Daempfer zu
        // hart getroffen haben. Laeuft er vorher, faengt er nichts.
        const boden = pos('_computeOnlinePresenceFloor();');
        assert.ok(boden > pos('_computeFieldSuppression();'));
        assert.ok(boden > pos('_computeCounterAdoptionBoost();'));
        assert.ok(boden > pos('_computeAntiLeaderTechBoost();'));
    });

    it('normiert wird NACH allen Stufen, nicht zwischen ihnen', () => {
        const norm = pos('const predictedSum = _shareList.reduce');
        assert.ok(norm > pos('_computeOnlinePresenceFloor();'),
            'wird zwischendurch normiert, rechnen die folgenden Stufen auf '
            + 'einer anderen Skala als die davor');
    });

    it('der Familien-Deckel greift NACH der Normierung', () => {
        // Ein Deckel auf einen unnormierten Wert deckelt nichts
        // Bestimmtes — 28 % wovon?
        assert.ok(pos('Predictor 5.5.5 — Family-Aggregate Cap (post-renorm)')
                > pos('const predictedSum = _shareList.reduce'));
    });

    it('5.8 und 5.9 laufen als Letztes, nach dem Deckel', () => {
        const deckel = pos('Predictor 5.5.5 — Family-Aggregate Cap (post-renorm)');
        assert.ok(pos('Predictor 5.9 — Format-Migration-Boost (post-everything)') > deckel);
        assert.ok(pos('Predictor 5.8 — Player-Stickiness-Damper (post-everything)') > deckel);
    });

    it('auf 100 wird normiert, nicht auf irgendetwas', () => {
        const i = pos('const predictedSum = _shareList.reduce');
        assert.match(MC.slice(i, i + 300), /predictedShareRaw \/ predictedSum\) \* 100/,
            'die Normierung zieht nicht mehr auf 100 %');
    });
});

describe('Boden vor Daempfer, nicht umgekehrt', () => {
    it('der Decline-Damper laeuft NACH dem Boden', () => {
        // Der Kommentar im Code haelt ausdruecklich fest, dass die
        // Produktion frueher davor daempfte und der Boden das sofort
        // wieder aufhob. Ein Zurueckdrehen faellt sonst niemandem auf.
        const block = MC.slice(MC.indexOf('const lastMetaEntry = _lastMetaLabsByDeck[k];'));
        const boden = block.indexOf('predicted = floorPct;');
        const damp  = block.indexOf('predicted *= PREDICTOR_5_6_DECLINE_DAMPER;');
        assert.ok(boden > -1 && damp > -1, 'Boden oder Daempfer nicht auffindbar');
        assert.ok(boden < damp, 'der Daempfer laeuft wieder vor dem Boden und wird von ihm aufgehoben');
    });
});
