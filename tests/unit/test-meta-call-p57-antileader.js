/**
 * Predictor 5.7 — Anti-Leader Tech-Boost
 *
 * Backstory: at Indianapolis 2026-05-29, the anti-Dragapult tech wave
 * (Hydrapple, Mega Lucario, Basic Box) was systematically under-
 * predicted by 1.5–3.5 pp because the online-ladder share didn't
 * reflect the community's anticipation of Dragapult consolidation.
 *
 * Fix: when ANY family's predictedShareRaw exceeds the leader-
 * dominance threshold (25 %), look up the labs WR of every low-share
 * non-family deck against the leader's lead variant. Decks with
 * WR ≥ 55 % AND field share ≤ 5 % get an additive boost scaled by
 * wrEdge × BOOST_SCALE, capped at BOOST_PP_MAX.
 *
 * Constants mirror js/app-meta-call.js — keep in lockstep.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ── Gleichlauf mit der Quelle ───────────────────────────────────
// BEFUND (02.09.2026): der Kopfkommentar dieser Datei sagt seit jeher
// "keep in lockstep" — durchgesetzt hat den Gleichlauf nichts. Eine
// Mutationspruefung setzte die Konstante im Motor auf null; die Kopie
// hier blieb stehen, die Formel unten rechnete weiter mit der Kopie,
// und die Suite blieb gruen. Die Spiegel bleiben (sie machen die
// Rechnung unten lesbar), aber sie werden jetzt gegen die Quelle
// geprueft. Was gerechnet wird, prueft zusaetzlich
// tests/unit/test-motor-stufen-wirksamkeit.js am echten Quellblock.
const fs = require('fs');
const path = require('path');
const SRC_MC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');

function quellZahl(name) {
    const m = SRC_MC.match(new RegExp('\\bconst\\s+' + name + '\\s*=\\s*(-?\\d+(?:\\.\\d+)?)\\s*;'));
    assert.ok(m, name + ' steht nicht mehr als numerische Konstante in '
        + 'js/app-meta-call.js — umbenannt oder in einen Ausdruck verwandelt. '
        + 'Beides macht den Gleichlauf blind, deshalb bricht er hier ab.');
    return Number(m[1]);
}

function pruefeGleichlauf(spiegel, praefix, ausnahmen) {
    for (const [kurz, wert] of Object.entries(spiegel)) {
        const quellName = (ausnahmen && ausnahmen[kurz]) || (praefix + kurz);
        assert.strictEqual(wert, quellZahl(quellName),
            `${quellName}: die Quelle sagt ${quellZahl(quellName)}, die Kopie in `
            + `dieser Datei sagt ${wert}. Solange sie auseinanderlaufen, prueft `
            + 'diese Datei ihre eigene Kopie und nicht den Motor.');
    }
}

const P57 = {
    LEADER_DOMINANCE_THRESHOLD: 25.0,
    COUNTER_WR_THRESHOLD:       0.55,
    COUNTER_MAX_FIELD_SHARE:    5.0,
    BOOST_SCALE:                8.0,
    BOOST_PP_MAX:               1.5,
};

function p57BoostFor({ wr, fieldShare }) {
    if (fieldShare > P57.COUNTER_MAX_FIELD_SHARE) return 0;
    if (wr < P57.COUNTER_WR_THRESHOLD) return 0;
    const wrEdge = wr - 0.50;
    const boost = Math.min(P57.BOOST_PP_MAX, wrEdge * P57.BOOST_SCALE);
    if (boost <= 0.05) return 0;
    return boost;
}

describe('P5.7 — Anti-Leader Tech-Boost magnitudes', () => {
    it('Mega Lucario shape (55 % vs Dragapult, 0.9 % field) gets ~0.4 pp', () => {
        const b = p57BoostFor({ wr: 0.55, fieldShare: 0.9 });
        assert.ok(Math.abs(b - 0.40) < 0.001, `expected ~0.40 pp, got ${b.toFixed(3)}`);
    });

    it('Hydrapple shape (58 % vs Dragapult-family-leader, 3 % field) gets ~0.64 pp', () => {
        const b = p57BoostFor({ wr: 0.58, fieldShare: 3.0 });
        assert.ok(Math.abs(b - 0.64) < 0.001, `expected ~0.64 pp, got ${b.toFixed(3)}`);
    });

    it('Hits the 1.5 pp cap at extreme WR edge (wrEdge ≥ 0.1875)', () => {
        const b = p57BoostFor({ wr: 0.70, fieldShare: 1.0 });
        assert.strictEqual(b, 1.5);
    });

    it('Below 55 % WR — no boost (Counter-Pick gates on wins-vs-leader)', () => {
        // Hydrapple in TEF-POR labs is 44.9 % vs straight Dragapult —
        // doesn't get the anti-leader boost when leader is pure Dragapult.
        assert.strictEqual(p57BoostFor({ wr: 0.449, fieldShare: 3.0 }), 0);
        assert.strictEqual(p57BoostFor({ wr: 0.54,  fieldShare: 2.0 }), 0);
    });

    it('High field share decks are gated out (already-popular pole position decks)', () => {
        // Raging Bolt Ogerpon (6 % field, 55 % vs Dragapult): would
        // otherwise qualify, but is already big in the field — boost
        // is reserved for genuine surprise picks.
        assert.strictEqual(p57BoostFor({ wr: 0.60, fieldShare: 6.0 }), 0);
    });

    it('Marginal WR (55.5 %) at low field passes the floor', () => {
        const b = p57BoostFor({ wr: 0.555, fieldShare: 1.0 });
        assert.ok(b > 0.05 && b < 0.5);
    });
});

describe('P5.7 — Dominant family detection', () => {
    function findLeaderFamily(families) {
        let leader = null;
        let max = 0;
        let total = 0;
        Object.values(families).forEach(arr => arr.forEach(d => total += d.share));
        if (total <= 0) return null;
        Object.entries(families).forEach(([fam, arr]) => {
            const sum = arr.reduce((s, v) => s + v.share, 0);
            const pct = (sum / total) * 100;
            if (pct >= P57.LEADER_DOMINANCE_THRESHOLD && pct > max) {
                max = pct;
                leader = fam;
            }
        });
        return leader;
    }

    it('TEF-POR Dragapult family at 29 % triggers as leader', () => {
        const families = {
            Dragapult: [
                { share: 10.4 }, { share: 7.5 }, { share: 6.2 }, { share: 5.4 },
            ],
            // Realistic spread of competing families, none dominant:
            'Raging Bolt':       [{ share: 6.1 }],
            "Rocket's Mewtwo":   [{ share: 5.7 }],
            "N's Zoroark":       [{ share: 5.6 }],
            'Alakazam':          [{ share: 4.7 }],
            "Cynthia's Garchomp":[{ share: 4.6 }],
            'Lopunny':           [{ share: 4.1 }],
            'Lucario':           [{ share: 3.9 }],
            'Festival Lead':     [{ share: 4.3 }],
            'Ogerpon Meganium':  [{ share: 3.1 }, { share: 2.6 }],
            'Other':             [{ share: 25.8 }],
        };
        assert.strictEqual(findLeaderFamily(families), 'Dragapult');
    });

    it('No family at 25 % means no leader → boost stage is no-op', () => {
        const families = {
            FamA: [{ share: 10.0 }, { share: 10.0 }],
            FamB: [{ share: 8.0 }, { share: 12.0 }],
            FamC: [{ share: 5.0 }, { share: 5.0 }, { share: 10.0 }],
            FamD: [{ share: 8.0 }, { share: 7.0 }, { share: 5.0 }],
            FamE: [{ share: 20.0 }],
        };
        // Total = 100; max family = 20 % (FamE). Threshold is 25 %.
        assert.strictEqual(findLeaderFamily(families), null);
    });
});

describe('P5.7 — Gleichlauf: die Kopie oben ist die Quelle', () => {
    it('jede gespiegelte Konstante deckt sich mit js/app-meta-call.js', () => {
        pruefeGleichlauf(P57, 'PREDICTOR_57_');
    });

    it('die Stufe ist nicht auf null gestellt', () => {
        // ANLASS: Indianapolis 2026-05-29 — die Anti-Dragapult-Techwelle
        // (Hydrapple, Mega Lucario, Basic Box) wurde um 1,5-3,5 pp
        // unterschaetzt. Steht BOOST_PP_MAX auf 0, kappt Math.min jeden
        // Schub auf 0 und das folgende `if (boost <= 0.05) return;` wirft
        // ihn weg: die Stufe laeuft weiter und liefert nichts.
        const deckel = quellZahl('PREDICTOR_57_BOOST_PP_MAX');
        assert.ok(deckel > 0,
            `PREDICTOR_57_BOOST_PP_MAX steht auf ${deckel} — der Anti-Leader-Schub `
            + 'ist abgeschaltet, die Unterschaetzung von 1,5-3,5 pp ist zurueck');
        assert.ok(quellZahl('PREDICTOR_57_BOOST_SCALE') > 0,
            'ohne Steigung ist jeder Winrate-Vorsprung wertlos');
        // Und der Beleg dafuer, dass die Kopie oben wirklich rechnet:
        assert.ok(p57BoostFor({ wr: 0.60, fieldShare: 0.9 }) > 0.05,
            'ein Konter mit 60 % gegen den Leiter bekommt nichts mehr');
    });
});
