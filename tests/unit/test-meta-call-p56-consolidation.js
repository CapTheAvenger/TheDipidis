/**
 * Predictor 5.6 — Format-Leader Within-Family Consolidation
 *
 * Backstory: at Indianapolis 2026-05-29 the Dragapult family went from
 *   29.34 % share (TEF-POR labs avg) → 32.12 % share (Indy actual),
 * and within the family, pure Dragapult went from 35.4 % within-family
 * → 61.5 % within-family. Sub-variants (Dudunsparce, Blaziken) lost
 * share to the lead variant. The Meta Call past-predictor under-
 * predicted pure Dragapult at Indy by 9.45 pp because no stage
 * captured the within-family consolidation pattern.
 *
 * Fix: when a family has ≥ 3 variants AND family aggregate share
 * exceeds FAMILY_DOMINANCE_THRESHOLD, take CONSOLIDATION_RATE of
 * the sub-variant pool and redirect it to the lead variant.
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

const P56 = {
    FAMILY_DOMINANCE_THRESHOLD: 20.0,
    MIN_VARIANTS:               3,
    CONSOLIDATION_RATE:         0.40,
    FAMILY_GROWTH_BOOST_PP:     5.0,
};

// Mirror of js/app-meta-call.js _computeFormatLeaderConsolidation,
// pure-fn form for testing.
function p56Apply(shares) {
    // shares: { family: [{deck, share}], ... }
    const out = {};
    let total = 0;
    for (const fam of Object.values(shares)) {
        for (const v of fam) {
            out[v.deck] = v.share;
            total += v.share;
        }
    }
    if (total <= 0) return out;
    for (const [family, variants] of Object.entries(shares)) {
        if (variants.length < P56.MIN_VARIANTS) continue;
        const famTotal = variants.reduce((s, v) => s + v.share, 0);
        const famPct = (famTotal / total) * 100;
        if (famPct < P56.FAMILY_DOMINANCE_THRESHOLD) continue;
        const sorted = variants.slice().sort((a, b) => b.share - a.share);
        const leader = sorted[0];
        const subs = sorted.slice(1);
        const subTotal = subs.reduce((s, v) => s + v.share, 0);
        if (subTotal <= 0) continue;
        const redistribute = subTotal * P56.CONSOLIDATION_RATE;
        out[leader.deck] += redistribute + P56.FAMILY_GROWTH_BOOST_PP;
        for (const sv of subs) {
            out[sv.deck] -= (sv.share / subTotal) * redistribute;
        }
    }
    return out;
}

describe('P5.6 — Indianapolis anchor: Dragapult family consolidation', () => {
    it('Dragapult family redistributes ~40 % of sub-variant share to pure Dragapult + 5 pp family growth', () => {
        const shares = {
            Dragapult: [
                { deck: 'Dragapult',             share: 10.4 },
                { deck: 'Dragapult Dusknoir',    share: 7.5 },
                { deck: 'Dragapult Blaziken',    share: 6.2 },
                { deck: 'Dragapult Dudunsparce', share: 5.4 },
                { deck: 'Dragapult Froslass',    share: 0.1 },
            ],
            // Padding so the field totals ~100; isn't part of the family.
            Padding: [{ deck: 'PaddingDeck', share: 70.4 }],
        };
        const out = p56Apply(shares);
        // Sub-variant pool = 19.2; redistribute 40 % = 7.68 pp internal +
        // 5 pp absolute family growth → 10.4 + 7.68 + 5 = 23.08
        assert.ok(out.Dragapult > 22.5 && out.Dragapult < 23.6,
            `Dragapult should land ~23 % after consolidation + family growth; got ${out.Dragapult.toFixed(2)}`);
        // Sub-variants shrink proportionally to the INTERNAL
        // redistribution (the +5 pp comes from renorm absorption,
        // not from sub-variants).
        assert.ok(out['Dragapult Dudunsparce'] < 5.4 && out['Dragapult Dudunsparce'] > 3.0,
            `Dudunsparce should shrink ~40 %; got ${out['Dragapult Dudunsparce'].toFixed(2)}`);
        // Family total grows by +5 pp (the absolute family growth term).
        const famTotal = ['Dragapult', 'Dragapult Dusknoir', 'Dragapult Blaziken', 'Dragapult Dudunsparce', 'Dragapult Froslass']
            .reduce((s, k) => s + out[k], 0);
        assert.ok(Math.abs(famTotal - 34.6) < 0.001,
            `Family total = labs + 5 pp family growth: ${famTotal.toFixed(2)}`);
    });

    it('Single-variant family (Raging Bolt Ogerpon) is untouched', () => {
        const shares = {
            'Raging Bolt': [{ deck: 'Raging Bolt Ogerpon', share: 6.1 }],
            Padding: [{ deck: 'PaddingDeck', share: 93.9 }],
        };
        const out = p56Apply(shares);
        assert.strictEqual(out['Raging Bolt Ogerpon'], 6.1);
    });

    it('Below-threshold family (Starmie 4.4 % field) is untouched', () => {
        const shares = {
            Starmie: [
                { deck: 'Starmie Froslass',  share: 2.7 },
                { deck: 'Starmie Dusknoir',  share: 1.7 },
            ],
            Padding: [{ deck: 'PaddingDeck', share: 95.6 }],
        };
        const out = p56Apply(shares);
        assert.strictEqual(out['Starmie Froslass'], 2.7);
        assert.strictEqual(out['Starmie Dusknoir'], 1.7);
    });

    it('Family with only 2 variants does not consolidate (below MIN_VARIANTS)', () => {
        const shares = {
            'Ogerpon Meganium': [
                { deck: 'Ogerpon Meganium Hydrapple', share: 12.0 },
                { deck: 'Ogerpon Meganium Arboliva',  share: 11.0 },
            ],
            Padding: [{ deck: 'PaddingDeck', share: 77.0 }],
        };
        const out = p56Apply(shares);
        assert.strictEqual(out['Ogerpon Meganium Hydrapple'], 12.0);
        assert.strictEqual(out['Ogerpon Meganium Arboliva'], 11.0);
    });
});

describe('P5.6 — Gleichlauf: die Kopie oben ist die Quelle', () => {
    it('jede gespiegelte Konstante deckt sich mit js/app-meta-call.js', () => {
        pruefeGleichlauf(P56, 'PREDICTOR_56_');
    });

    it('die Stufe ist nicht auf null gestellt', () => {
        // ANLASS: Indianapolis 2026-05-29 — pures Dragapult ging von
        // 35,4 % auf 61,5 % Familienanteil, der Motor unterschaetzte es
        // um 9,45 pp. Bei CONSOLIDATION_RATE 0 wird nichts mehr zur
        // Leitvariante verschoben. Heimtueckisch: die Leitvariante
        // waechst trotzdem, weil FAMILY_GROWTH_BOOST_PP unabhaengig
        // davon addiert wird — die Stufe SIEHT aktiv aus.
        const rate = quellZahl('PREDICTOR_56_CONSOLIDATION_RATE');
        assert.ok(rate > 0,
            `PREDICTOR_56_CONSOLIDATION_RATE steht auf ${rate} — die Konsolidierung `
            + 'verteilt nichts mehr um, die 9,45 pp Unterschaetzung sind zurueck');
        assert.ok(rate <= 0.5,
            `PREDICTOR_56_CONSOLIDATION_RATE steht auf ${rate} — 0,60 kam dem `
            + 'Leiter naeher, zerdrueckte aber Dusknoir (real 6,29 % in Indy)');
        // Und der Beleg, dass die Kopie oben wirklich umverteilt:
        const out = p56Apply({
            Dragapult: [
                { deck: 'Dragapult',          share: 10.4 },
                { deck: 'Dragapult Dusknoir', share: 7.5 },
                { deck: 'Dragapult Blaziken', share: 6.2 },
            ],
            Padding: [{ deck: 'PaddingDeck', share: 75.9 }],
        });
        assert.ok(out['Dragapult Dusknoir'] < 7.5,
            'keine Untervariante gibt mehr ab — die Umverteilung ist tot');
    });
});
