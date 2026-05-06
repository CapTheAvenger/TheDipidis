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
});
