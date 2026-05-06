/**
 * Unit tests for the smooth time-decay scoring helpers in app-deck-builder.js.
 *
 * Covered:
 *   - _recencyWeight: piecewise-linear decay function
 *       0–7d   = 1.0,  7–21d → 0.4,  21–42d → 0.1,  >42d = 0.05
 *   - _parseAnyTournamentDate: tri-format date parser (ISO, English ordinal,
 *     German numeric)
 *   - _aggregateWeightedSource: per-card weighted-numerator + shared
 *     denominator over a synthetic tournament set with mixed ages
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractFunction(src, fnName) {
    const fnPattern = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = fnPattern.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);
    const start = m.index;
    const openIdx = src.indexOf('{', start);
    if (openIdx < 0) throw new Error(`Missing opening brace for: ${fnName}`);
    let depth = 0;
    let end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth += 1;
        else if (src[i] === '}') depth -= 1;
        if (depth === 0) { end = i + 1; break; }
    }
    if (end < 0) throw new Error(`Missing closing brace for: ${fnName}`);
    return src.slice(start, end);
}

function loadDecayHelpers() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-deck-builder.js'),
        'utf-8'
    );
    const snippet = [
        extractFunction(src, '_recencyWeight'),
        extractFunction(src, '_parseAnyTournamentDate'),
        extractFunction(src, '_aggregateWeightedSource'),
    ].join('\n\n');

    const sandbox = {
        console,
        Map,
        Set,
        Number,
        String,
        Array,
        Object,
        Math,
        Date,
        parseInt,
        parseFloat,
        isNaN,
        // parseJapaneseDate stub — mirrors the production parser in
        // js/app-city-league.js (handles ISO, German dd.mm.yyyy, and
        // English/German "25th April 2026" with month-name lookup).
        parseJapaneseDate: (str) => {
            if (!str) return '';
            const raw = String(str).trim();
            if (!raw) return '';
            const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (iso) return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
            const dot = raw.match(/^(\d{1,2})[.](\d{1,2})[.](\d{2,4})$/);
            if (dot) {
                const day = dot[1].padStart(2, '0');
                const month = dot[2].padStart(2, '0');
                const year = dot[3].length === 2 ? `20${dot[3]}` : dot[3];
                return `${year}-${month}-${day}`;
            }
            const cleaned = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1');
            const parts = cleaned.split(/[.\s]+/).filter(Boolean);
            if (parts.length < 3) return '';
            const day = parts[0].padStart(2, '0');
            const monthStr = parts[1].toLowerCase();
            const yearRaw = parts[2];
            const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
            const monthMap = {
                jan: '01', january: '01', januar: '01',
                feb: '02', february: '02', februar: '02',
                mar: '03', march: '03', maerz: '03', 'märz': '03',
                apr: '04', april: '04',
                may: '05', mai: '05',
                jun: '06', june: '06', juni: '06',
                jul: '07', july: '07', juli: '07',
                aug: '08', august: '08',
                sep: '09', sept: '09', september: '09',
                oct: '10', october: '10', oktober: '10',
                nov: '11', november: '11',
                dec: '12', december: '12', dezember: '12',
            };
            const month = monthMap[monthStr];
            if (!month) return '';
            return `${year}-${month}-${day}`;
        },
        // _aggregateWeightedSource consults window.normalizeArchetypeForMatch
        // and falls back to a lower-case-trim if it isn't present.
        window: {},
    };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(snippet, ctx, { filename: 'recency-decay-extract.js' });
    return {
        _recencyWeight: sandbox._recencyWeight,
        _parseAnyTournamentDate: sandbox._parseAnyTournamentDate,
        _aggregateWeightedSource: sandbox._aggregateWeightedSource,
        _sandbox: sandbox,
    };
}

const FNS = loadDecayHelpers();

describe('_recencyWeight', () => {
    it('returns 1.0 for tournaments inside the 7-day full-weight window', () => {
        assert.equal(FNS._recencyWeight(0), 1.0);
        assert.equal(FNS._recencyWeight(3), 1.0);
        assert.equal(FNS._recencyWeight(7), 1.0);
    });

    it('linearly decays 1.0 → 0.4 across days 7–21', () => {
        // Midpoint of the [7,21] segment is day 14 → expect 0.7
        assert.ok(Math.abs(FNS._recencyWeight(14) - 0.7) < 1e-9,
            `expected ≈0.7 at d=14, got ${FNS._recencyWeight(14)}`);
        // End of the segment hits the next anchor exactly
        assert.ok(Math.abs(FNS._recencyWeight(21) - 0.4) < 1e-9,
            `expected ≈0.4 at d=21, got ${FNS._recencyWeight(21)}`);
    });

    it('linearly decays 0.4 → 0.1 across days 21–42', () => {
        // Quarter-way through the segment: day 26.25 → 0.4 - 0.075 ≈ 0.325
        assert.ok(Math.abs(FNS._recencyWeight(26.25) - 0.325) < 1e-9,
            `expected ≈0.325 at d=26.25, got ${FNS._recencyWeight(26.25)}`);
        assert.ok(Math.abs(FNS._recencyWeight(42) - 0.1) < 1e-9,
            `expected ≈0.1 at d=42, got ${FNS._recencyWeight(42)}`);
    });

    it('drops to 0.05 residue beyond day 42', () => {
        assert.equal(FNS._recencyWeight(43), 0.05);
        assert.equal(FNS._recencyWeight(180), 0.05);
        assert.equal(FNS._recencyWeight(9999), 0.05);
    });

    it('handles invalid input without NaN', () => {
        assert.equal(FNS._recencyWeight(NaN), 1.0);
        assert.equal(FNS._recencyWeight(null), 1.0);
        assert.equal(FNS._recencyWeight(undefined), 1.0);
        assert.equal(FNS._recencyWeight(-5), 1.0);
    });

    it('weight is monotonically non-increasing as age grows', () => {
        let prev = Infinity;
        for (let d = 0; d <= 60; d += 0.5) {
            const w = FNS._recencyWeight(d);
            assert.ok(w <= prev + 1e-9, `weight increased at d=${d}: ${prev} → ${w}`);
            prev = w;
        }
    });
});

describe('_parseAnyTournamentDate', () => {
    it('parses ISO YYYY-MM-DD', () => {
        const d = FNS._parseAnyTournamentDate('2026-04-25');
        assert.ok(d instanceof Date);
        assert.equal(d.toISOString().slice(0, 10), '2026-04-25');
    });

    it('parses English ordinal "25th April 2026"', () => {
        const d = FNS._parseAnyTournamentDate('25th April 2026');
        assert.ok(d instanceof Date);
        assert.equal(d.toISOString().slice(0, 10), '2026-04-25');
    });

    it('parses German numeric "02.05.2026"', () => {
        const d = FNS._parseAnyTournamentDate('02.05.2026');
        assert.ok(d instanceof Date);
        assert.equal(d.toISOString().slice(0, 10), '2026-05-02');
    });

    it('returns null for empty / garbage input', () => {
        assert.equal(FNS._parseAnyTournamentDate(''), null);
        assert.equal(FNS._parseAnyTournamentDate(null), null);
        assert.equal(FNS._parseAnyTournamentDate('not a date'), null);
    });
});

describe('_aggregateWeightedSource', () => {
    // Reference time: 2026-05-06. Build synthetic rows with three
    // tournaments at controlled ages.
    const TODAY = new Date('2026-05-06T00:00:00Z').getTime();

    function makeRows() {
        return [
            // T1: 2026-05-04 → 2 days old (full weight)
            { tournament_id: 'T1', tournament_date: '2026-05-04', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Boss\'s Orders',  deck_inclusion_count: 4, total_decks_in_archetype: 4 },
            { tournament_id: 'T1', tournament_date: '2026-05-04', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Neo Upper Energy', deck_inclusion_count: 4, total_decks_in_archetype: 4 },
            { tournament_id: 'T1', tournament_date: '2026-05-04', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Switch',            deck_inclusion_count: 1, total_decks_in_archetype: 4 },

            // T2: 2026-04-22 → 14 days old (mid-decay, w ≈ 0.7)
            { tournament_id: 'T2', tournament_date: '2026-04-22', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Boss\'s Orders',  deck_inclusion_count: 5, total_decks_in_archetype: 5 },
            { tournament_id: 'T2', tournament_date: '2026-04-22', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Switch',            deck_inclusion_count: 4, total_decks_in_archetype: 5 },
            { tournament_id: 'T2', tournament_date: '2026-04-22', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Unfair Stamp',     deck_inclusion_count: 5, total_decks_in_archetype: 5 },

            // T3: 2026-04-06 → 30 days old (w ≈ 0.275)
            { tournament_id: 'T3', tournament_date: '2026-04-06', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Boss\'s Orders',  deck_inclusion_count: 6, total_decks_in_archetype: 6 },
            { tournament_id: 'T3', tournament_date: '2026-04-06', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Switch',            deck_inclusion_count: 6, total_decks_in_archetype: 6 },
            { tournament_id: 'T3', tournament_date: '2026-04-06', archetype: 'Cynthia Garchomp Ex',
              card_name: 'Unfair Stamp',     deck_inclusion_count: 6, total_decks_in_archetype: 6 },

            // Other archetype — must be ignored
            { tournament_id: 'T1', tournament_date: '2026-05-04', archetype: 'Joltik Box',
              card_name: 'Joltik',             deck_inclusion_count: 4, total_decks_in_archetype: 4 },
        ];
    }

    it('returns null for an unknown archetype', () => {
        const result = FNS._aggregateWeightedSource(makeRows(), 'Wugtrio Box', 1.0, TODAY, null);
        assert.equal(result, null);
    });

    it('returns null for empty input', () => {
        assert.equal(FNS._aggregateWeightedSource([], 'X', 1.0, TODAY, null), null);
        assert.equal(FNS._aggregateWeightedSource(null, 'X', 1.0, TODAY, null), null);
    });

    it('aggregates exactly one entry per tournament for the denominator', () => {
        const result = FNS._aggregateWeightedSource(makeRows(), 'Cynthia Garchomp Ex', 1.0, TODAY, null);
        assert.ok(result, 'expected a result object');
        assert.equal(result.tournamentCount, 3, 'three distinct tournaments');
    });

    it('weights an "always-played" card (Boss\'s Orders) at exactly 100% of the denominator', () => {
        // Boss's Orders is in every deck of every tournament — its weighted
        // numerator should equal the weighted denominator (within fp noise).
        const result = FNS._aggregateWeightedSource(makeRows(), 'Cynthia Garchomp Ex', 1.0, TODAY, null);
        const num = result.weightedNumerators.get('boss\'s orders');
        assert.ok(Math.abs(num - result.weightedDenominator) < 1e-9,
            `expected num=${result.weightedDenominator}, got ${num}`);
    });

    it('demotes a card only played in older tournaments (Unfair Stamp)', () => {
        // Unfair Stamp shows in T2 (14d, w=0.7) and T3 (30d, w=0.275) only.
        // Its weighted-share should be lower than its raw share would suggest.
        const result = FNS._aggregateWeightedSource(makeRows(), 'Cynthia Garchomp Ex', 1.0, TODAY, null);
        const stampNum = result.weightedNumerators.get('unfair stamp');
        const stampShare = (stampNum / result.weightedDenominator) * 100;

        // Raw share = (5+6) / (4+5+6) = 73.3%.  Weighted share:
        //   T2: 5×5×0.7 = 17.5 ; T3: 6×6×0.275 = 9.9 → num = 27.4 (no, we
        //   recompute; numerator uses inclusion×weight, denominator uses
        //   archetype_total×weight)
        // Actually: numerator = Σ inclusion × weight (per tournament card appears in)
        //   = 0×4×1.0 (T1, absent — not summed) + 5×0.7 (T2) + 6×0.275 (T3) = 5.15
        // Denominator = Σ archetype_total × weight (across ALL tournaments)
        //   = 4×1.0 + 5×0.7 + 6×0.275 = 9.15
        // Weighted share ≈ 56.3 % — well below the raw 73.3 %.
        assert.ok(stampShare < 60, `weighted share for Unfair Stamp should drop, got ${stampShare}%`);
        assert.ok(stampShare > 50, `but not below ~50% — sanity, got ${stampShare}%`);
    });

    it('promotes a card only played in the most recent tournament (Neo Upper Energy)', () => {
        // Neo Upper Energy is in T1 only (2d, w=1.0) — fresh signal.
        const result = FNS._aggregateWeightedSource(makeRows(), 'Cynthia Garchomp Ex', 1.0, TODAY, null);
        const neoNum = result.weightedNumerators.get('neo upper energy');
        const neoShare = (neoNum / result.weightedDenominator) * 100;
        // Raw share = 4 / (4+5+6) = 26.7 %.  Weighted ≈ 4×1.0 / 9.15 = 43.7 %.
        assert.ok(neoShare > 40, `weighted share for Neo Upper Energy should rise, got ${neoShare}%`);
    });

    it('respects the source_weight multiplier (Major×1.5 vs Online×1.0)', () => {
        const onlineRes = FNS._aggregateWeightedSource(makeRows(), 'Cynthia Garchomp Ex', 1.0, TODAY, null);
        const majorRes  = FNS._aggregateWeightedSource(makeRows(), 'Cynthia Garchomp Ex', 1.5, TODAY, null);
        // Both should yield the same shares (linear scaling cancels in the
        // share ratio), but absolute denominators should differ by 1.5×.
        assert.ok(Math.abs(majorRes.weightedDenominator - onlineRes.weightedDenominator * 1.5) < 1e-9,
            `expected 1.5× denominator, got online=${onlineRes.weightedDenominator}, major=${majorRes.weightedDenominator}`);
    });

    it('honors archetypeFieldNormalizer (Major price-tag stripping)', () => {
        // Mimic Major-source archetype field with price-tag suffix.
        const tagged = makeRows().map(r => ({ ...r, archetype: r.archetype + '27.91$22.10€' }));
        const stripPrice = (s) => String(s || '').replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '').trim();
        const result = FNS._aggregateWeightedSource(tagged, 'Cynthia Garchomp Ex', 1.0, TODAY, stripPrice);
        assert.ok(result, 'expected the price-tag stripper to expose the archetype');
        assert.equal(result.tournamentCount, 3);
    });

    it('reports deckCount in aggregate mode (Σ archetype_total)', () => {
        const result = FNS._aggregateWeightedSource(makeRows(), 'Cynthia Garchomp Ex', 1.0, TODAY, null);
        // T1 archetype_total=4, T2=5, T3=6 → 15 decks
        assert.equal(result.deckCount, 15);
    });
});

describe('_aggregateWeightedSource — snapshot mode (Major source)', () => {
    // Major source schema: each row's `archetype` field carries a price-tag
    // suffix that uniquely identifies a deck-snapshot. total_decks_in_archetype
    // is always 1 (per-snapshot value), so plain aggregate-mode collapses
    // every snapshot of the same tournament into one bucket and clamps
    // every card's inclusion to 1, falsely yielding 100 % share for every
    // card that ever appeared. This was the dec-2026 regression.
    const TODAY = new Date('2026-05-06T00:00:00Z').getTime();
    const stripPrice = (s) => String(s || '').replace(/\d+(?:[.,]\d+)?\$\d+(?:[.,]\d+)?€.*$/u, '').trim();

    function majorRows() {
        // Tournament 463 — 3 distinct Cynthia decks (3 price-tags), 2026-04-04 (32d ago)
        // Tournament 539 — 5 distinct Cynthia decks (5 price-tags), 2026-04-25 (11d ago)
        const rows = [];
        const make = (tid, date, priceTag, cardName, hasIt) => ({
            tournament_id: tid, tournament_date: date,
            archetype: 'Cynthia\'s Garchomp' + priceTag,
            card_name: cardName,
            deck_inclusion_count: hasIt ? 1 : 0,
            total_decks_in_archetype: 1,
        });
        // Boss's Orders — in every deck (8 of 8)
        // Switch          — in 5 of 8 decks (in 463: 1/3, in 539: 4/5)
        // Buzwole         — in 1 of 8 decks (only 1 of the 463 lists)
        const tag463 = ['28.26$20.49€', '28.34$19.38€', '34.38$19.01€'];
        const tag539 = ['27.91$22.10€', '29.19$20.92€', '32.68$23.86€', '32.69$23.92€', '33.27$24.75€'];
        tag463.forEach((tag, i) => {
            rows.push(make('463', '4th April 2026', tag, 'Boss\'s Orders', true));
            rows.push(make('463', '4th April 2026', tag, 'Switch',          i === 0));
            rows.push(make('463', '4th April 2026', tag, 'Buzwole',         i === 0));
        });
        tag539.forEach((tag, i) => {
            rows.push(make('539', '25th April 2026', tag, 'Boss\'s Orders', true));
            rows.push(make('539', '25th April 2026', tag, 'Switch',          i < 4));
        });
        // Other archetype — must be ignored by the matcher
        rows.push(make('463', '4th April 2026', 'Joltik Box15.99$11.20€', 'Joltik', true));
        return rows;
    }

    it('counts distinct (tid, archRaw) pairs as decks (NOT total_decks_in_archetype)', () => {
        const result = FNS._aggregateWeightedSource(
            majorRows(), 'Cynthia\'s Garchomp', 1.0, TODAY, stripPrice, 'snapshot'
        );
        assert.ok(result, 'expected snapshot-mode result');
        assert.equal(result.tournamentCount, 2, '2 distinct tournament_ids');
        assert.equal(result.deckCount, 8, '3 + 5 = 8 distinct deck-snapshots');
    });

    it('weights an always-played card at 100 %', () => {
        const result = FNS._aggregateWeightedSource(
            majorRows(), 'Cynthia\'s Garchomp', 1.0, TODAY, stripPrice, 'snapshot'
        );
        const num = result.weightedNumerators.get('boss\'s orders');
        const share = (num / result.weightedDenominator) * 100;
        assert.ok(Math.abs(share - 100) < 1e-6, `expected ≈100 %, got ${share}`);
    });

    it('correctly attributes mid-prevalence to a 5-of-8 card (Switch)', () => {
        const result = FNS._aggregateWeightedSource(
            majorRows(), 'Cynthia\'s Garchomp', 1.0, TODAY, stripPrice, 'snapshot'
        );
        const switchNum = result.weightedNumerators.get('switch');
        const switchShare = (switchNum / result.weightedDenominator) * 100;
        // Without recency: 5/8 = 62.5 %.  T539 (11d, w=0.7714) has 4/5 hit;
        // T463 (32d, w=0.2429) has 1/3.  Weighted ≈ 71-78 %.
        assert.ok(switchShare > 50 && switchShare < 90,
            `expected mid-range (raw=62.5 %), got ${switchShare} %`);
    });

    it('correctly attributes low-prevalence to a 1-of-8 card (Buzwole) — NOT 100 %', () => {
        // This is the regression case: aggregate-mode with snapshot-style
        // input falsely promoted Buzwole to 100 %.  Snapshot-mode must give
        // a low single-digit share since Buzwole only appeared in 1 of 8
        // decks total (and that 1 was 32 days old, decay weight 0.2429).
        const result = FNS._aggregateWeightedSource(
            majorRows(), 'Cynthia\'s Garchomp', 1.0, TODAY, stripPrice, 'snapshot'
        );
        const buzNum = result.weightedNumerators.get('buzwole');
        const buzShare = (buzNum / result.weightedDenominator) * 100;
        // Raw = 1/8 = 12.5 %, but the only inclusion is at T463 (decay 0.243).
        // Numerator = 0.243; denominator = 3·0.243 + 5·0.771 ≈ 4.583.
        // → buzShare ≈ 5.3 % — well below Stage-2 threshold (25).
        assert.ok(buzShare < 15, `expected ≪ Stage-2 threshold, got ${buzShare}%`);
    });

    it('does NOT inflate to 100 % for niche cards (regression guard)', () => {
        const result = FNS._aggregateWeightedSource(
            majorRows(), 'Cynthia\'s Garchomp', 1.0, TODAY, stripPrice, 'snapshot'
        );
        const buzShare = (result.weightedNumerators.get('buzwole') / result.weightedDenominator) * 100;
        const switchShare = (result.weightedNumerators.get('switch') / result.weightedDenominator) * 100;
        assert.ok(Math.abs(buzShare - switchShare) > 30,
            `niche card and mid-prevalence card must produce different shares ` +
            `(snapshot bug would equate them at 100 %); buzwole=${buzShare}, switch=${switchShare}`);
    });

    it('returns null when no rows match the archetype', () => {
        const result = FNS._aggregateWeightedSource(
            majorRows(), 'Wugtrio Box', 1.0, TODAY, stripPrice, 'snapshot'
        );
        assert.equal(result, null);
    });
});
