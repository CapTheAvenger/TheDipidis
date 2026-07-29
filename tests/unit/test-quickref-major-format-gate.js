/**
 * Format gate for "Latest Major · Best Placement" (js/current-meta-quickref.js).
 *
 * A week into the TEF-PBL window the panel still presented NAIC 2026
 * (2026-06-10, previous format) as the latest major, unlabelled. The latest
 * major on record and the latest major OF THE CURRENT FORMAT are different
 * questions once a rotation happens and no new major has been played yet.
 *
 * The gate is driven entirely by data/format_window.json's
 * in_person_legal_date — no set codes in code — so it survives every future
 * rotation untouched.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'current-meta-quickref.js'), 'utf8');

function load() {
    const m = SRC.match(/function _isPreviousFormatMajor\(tournamentDate, fw\)[\s\S]*?\n  \}\n/);
    if (!m) throw new Error('could not extract _isPreviousFormatMajor');
    const ns = {};
    new Function('exports', m[0] + 'exports.fn=_isPreviousFormatMajor;')(ns);
    return ns.fn;
}
const isPrev = load();

describe('quickref major format gate', () => {
    const fw = { in_person_legal_date: '2026-07-31' };

    it('flags the reported case: NAIC 2026 before PBL in-person legality', () => {
        assert.equal(isPrev('2026-06-10', fw), true);
    });

    it('passes a major played on or after the first legal day', () => {
        assert.equal(isPrev('2026-07-31', fw), false);
        assert.equal(isPrev('2026-08-15', fw), false);
    });

    it('defaults to "current" when dates are missing — hiding real data on a config hiccup is the worse error', () => {
        assert.equal(isPrev('', fw), false);
        assert.equal(isPrev('2026-06-10', null), false);
        assert.equal(isPrev('2026-06-10', {}), false);
    });

    it('is wired into findBestMajorList and its renderer', () => {
        assert.ok(SRC.includes('_isPreviousFormatMajor(best.tournament_date, fw)'),
            'findBestMajorList no longer gates its result');
        assert.ok(SRC.includes('previousFormat: true'),
            'the previous-format marker is gone');
        assert.ok(SRC.includes('majorRes.value.previousFormat'),
            'the renderer no longer handles the marker');
        // The 3-way compare must not silently consume old-format data.
        const idx = SRC.indexOf('majorRes.value.previousFormat');
        const nullAssign = SRC.indexOf('global.currentMetaBestMajor = null', idx);
        const grid = SRC.indexOf('_renderCardGrid(majorRes.value.cards)', idx);
        assert.ok(nullAssign !== -1 && (grid === -1 || nullAssign < grid),
            'a previous-format major must null currentMetaBestMajor, not render as current');
    });
});
