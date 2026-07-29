/**
 * Format gate for the consistency builder's Major anchor
 * (js/app-deck-builder.js, _filterMajorRowsToCurrentFormat).
 *
 * The builder's structural Major mechanisms — absent-from-Major hard cap,
 * 4-of skeleton lock, conditional-avg locks, co-occurrence — document the
 * intent "stays dormant during the first ~2 weeks after a set rotation (no
 * current-format Major chunk yet)". The assumption was false: the chunk
 * loader serves the newest chunk THAT EXISTS, which after a rotation is the
 * previous format's.
 *
 * Reported case (Alakazam Dudunsparce, TEF-PBL week 2): anchored on NAIC
 * (TEF-CRI), the builder hard-capped the Toucannon line (80% of current
 * online decks — PBL cards that could not exist at NAIC) and skeleton-locked
 * Nighttime Mine x4 (71.7% at NAIC, 35% now) over Battle Cage (30.4% at
 * NAIC, 80% now). The generated deck was the old format's list.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'app-deck-builder.js'), 'utf8');

function load() {
    const parse = SRC.match(/function _parseMajorRowDate\(raw\)[\s\S]*?\n        \}\n/);
    const gate = SRC.match(/function _filterMajorRowsToCurrentFormat\(rows, fw\)[\s\S]*?\n        \}\n/);
    if (!parse || !gate) throw new Error('could not extract the gate helpers');
    const ns = {};
    new Function('exports', parse[0] + gate[0] +
        'exports.gate=_filterMajorRowsToCurrentFormat;')(ns);
    return ns.gate;
}
const gate = load();

const FW_PBL = { in_person_legal_date: '2026-07-31' };
const naicRow = { tournament_date: '10th June 2026', card_name: 'Nighttime Mine' };

describe('consistency major format gate', () => {
    it('drops the reported case: NAIC rows before PBL in-person legality', () => {
        const r = gate([naicRow, { tournament_date: '6th June 2026' }], FW_PBL);
        assert.equal(r.rows.length, 0, 'previous-format Major rows must not anchor the build');
        assert.equal(r.dropped, 2);
    });

    it('keeps current-format Major rows the moment they exist', () => {
        const r = gate([
            naicRow,
            { tournament_date: '2nd August 2026', card_name: 'Battle Cage' },
        ], FW_PBL);
        assert.equal(r.rows.length, 1);
        assert.equal(r.rows[0].card_name, 'Battle Cage');
        assert.equal(r.dropped, 1);
    });

    it('handles ISO dates as well as English ordinals', () => {
        const r = gate([{ tournament_date: '2026-08-15' }], FW_PBL);
        assert.equal(r.rows.length, 1);
    });

    it('keeps everything when format_window is unavailable — a network hiccup must not change builds', () => {
        assert.equal(gate([naicRow], null).rows.length, 1);
        assert.equal(gate([naicRow], {}).rows.length, 1);
        assert.equal(gate([naicRow], { in_person_legal_date: 'kaputt' }).rows.length, 1);
    });

    it('keeps undated rows — dropping data we cannot date would be a silent repair', () => {
        const r = gate([{ tournament_date: '' }, { card_name: 'x' }], FW_PBL);
        assert.equal(r.rows.length, 2);
        assert.equal(r.dropped, 0);
    });

    it('is wired into every read of the major rows inside the builder', () => {
        // The gate is only real if no read site bypasses it. Count raw reads:
        // exactly the two lazy-load/assignment sites and the comment may
        // reference it; every CONSUMING read must go through _gateMajorRows.
        assert.ok(SRC.includes('const _gateMajorRows = (rows) =>'),
            'the gate wrapper definition is gone');
        const consuming = SRC.match(/_gateMajorRows\(/g) || [];
        assert.ok(consuming.length >= 4,
            `expected the 4 read sites, found ${consuming.length} calls`);
        assert.ok(!/const majorRows = window\.currentMetaTournamentCardsData \|\| \[\]/.test(SRC),
            'the recency-aggregation read bypasses the gate again');
        assert.ok(!/let tournamentRows = window\.currentMetaTournamentCardsData \|\| \[\]/.test(SRC),
            'the anchor read bypasses the gate again');
        assert.ok(!/const _majorRowsForCond = window\.currentMetaTournamentCardsData;/.test(SRC),
            'the skeleton/cond-avg read bypasses the gate again');
        assert.ok(!/for \(const r of window\.currentMetaTournamentCardsData\)/.test(SRC),
            'the co-occurrence read bypasses the gate again');
    });

    it('the hard cap and skeleton lock sit downstream of the gate', () => {
        // With the gate returning [], hasLatestMajorAnchor stays false and
        // _skeletonSet stays empty, so neither mechanism can fire — assert
        // the structures still exist as expected by that reasoning.
        assert.ok(SRC.includes('if (card._latestMajorAbsent) {'),
            'the hard cap moved — re-verify the gate covers it');
        assert.ok(SRC.includes('_skeletonSet = _hasMajorForCond'),
            'the skeleton wiring moved — re-verify the gate covers it');
    });
});
