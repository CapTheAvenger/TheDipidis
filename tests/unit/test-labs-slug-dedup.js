/**
 * Regression test for the labs-slug-dedup guard in app-meta-call.js.
 *
 * 2026-06-12 AUDIT_DATA_PIPELINE.md F-D07: 4 archetype names in
 * labs_tournament_decks.csv carry two slug variants per tournament —
 * Okidogi (ex/twm), Alakazam (ex/meg), Tyranitar (ex/jtg),
 * Toxtricity Box (pfl/box). Without a dedup guard, the Meta Call
 * labs aggregator sums BOTH rows' share / day1 / day2 / top8_conv
 * into one `normalize(deck_name)` bucket → that archetype's labs
 * share appears doubled per major.
 *
 * The guard in app-meta-call.js (search for `_winnerByTournamentName`)
 * picks the slug with the higher `share_pct` as the canonical row for
 * (tournament_id, normalize(deck_name)); ties resolve to first
 * occurrence for stable ordering. This test replays the dedup
 * algorithm against the 4 known cases to lock the contract.
 *
 * NOTE: this test exercises the algorithm directly. The
 * test-cross-surface-consistency.py + downstream Meta Call e2e
 * specs cover the integration; this is the unit-level pin.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Repro of the helper used inside app-meta-call.js. Keep this in sync.
function normalize(s) {
    return String(s || '').trim().toLowerCase();
}
function parseEU(s) {
    if (s == null) return 0;
    const n = parseFloat(String(s).trim().replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
}

function pickWinnersPerTournamentName(labsRows, isMetaBucketLabel = () => false) {
    const winners = new Map(); // "tid|nameLower" -> { idx, share }
    labsRows.forEach((r, i) => {
        if (!r.deck_name) return;
        if (isMetaBucketLabel(r.deck_name)) return;
        const tid = (r.tournament_id || '').trim();
        if (!tid) return;
        const key = tid + '|' + normalize(r.deck_name);
        const myShare = parseEU(r.share_pct || '0');
        const prev = winners.get(key);
        if (!prev || myShare > prev.share) {
            winners.set(key, { idx: i, share: myShare });
        }
    });
    return winners;
}

function applyDedup(labsRows, isMetaBucketLabel = () => false) {
    const winners = pickWinnersPerTournamentName(labsRows, isMetaBucketLabel);
    return labsRows.filter((r, i) => {
        if (!r.deck_name) return false;
        if (isMetaBucketLabel(r.deck_name)) return false;
        const tid = (r.tournament_id || '').trim();
        if (!tid) return true;
        const w = winners.get(tid + '|' + normalize(r.deck_name));
        return !w || w.idx === i;
    });
}

describe('labs slug dedup — F-D07', () => {
    it('keeps the slug variant with the higher share_pct per (tid, name)', () => {
        const rows = [
            { tournament_id: '0005', deck_name: 'Okidogi', deck_slug: 'okidogi-ex',  share_pct: '0.1' },
            { tournament_id: '0005', deck_name: 'Okidogi', deck_slug: 'okidogi-twm', share_pct: '0.3' },
        ];
        const kept = applyDedup(rows);
        assert.equal(kept.length, 1, 'exactly one row survives');
        assert.equal(kept[0].deck_slug, 'okidogi-twm', 'higher-share slug wins');
    });

    it('preserves both slugs when they belong to different tournaments', () => {
        const rows = [
            { tournament_id: '0005', deck_name: 'Okidogi', deck_slug: 'okidogi-ex',  share_pct: '0.1' },
            { tournament_id: '0006', deck_name: 'Okidogi', deck_slug: 'okidogi-twm', share_pct: '0.1' },
        ];
        const kept = applyDedup(rows);
        assert.equal(kept.length, 2);
        const tids = kept.map(r => r.tournament_id).sort();
        assert.deepEqual(tids, ['0005', '0006']);
    });

    it('resolves equal-share ties to the first-occurring row (stable)', () => {
        const rows = [
            { tournament_id: '0005', deck_name: 'Alakazam', deck_slug: 'alakazam-ex',  share_pct: '0.07' },
            { tournament_id: '0005', deck_name: 'Alakazam', deck_slug: 'alakazam-meg', share_pct: '0.07' },
        ];
        const kept = applyDedup(rows);
        assert.equal(kept.length, 1);
        assert.equal(kept[0].deck_slug, 'alakazam-ex', 'first row wins on tie');
    });

    it('does not collapse archetypes with distinct deck_names', () => {
        const rows = [
            { tournament_id: '0005', deck_name: 'Dragapult',         deck_slug: 'dragapult-ex',      share_pct: '15.0' },
            { tournament_id: '0005', deck_name: 'Dragapult Dusknoir', deck_slug: 'dragapult-dusknoir', share_pct: '8.0' },
        ];
        const kept = applyDedup(rows);
        assert.equal(kept.length, 2, 'distinct names are independent buckets');
    });

    it('handles all 4 known F-D07 archetype-name collisions', () => {
        const cases = [
            ['Okidogi',        'okidogi-ex',        'okidogi-twm'],
            ['Alakazam',       'alakazam-ex',       'alakazam-meg'],
            ['Tyranitar',      'tyranitar-ex',      'tyranitar-jtg'],
            ['Toxtricity Box', 'toxtricity-pfl',    'toxtricity-box'],
        ];
        cases.forEach(([name, slugA, slugB]) => {
            const rows = [
                { tournament_id: '0099', deck_name: name, deck_slug: slugA, share_pct: '0.1' },
                { tournament_id: '0099', deck_name: name, deck_slug: slugB, share_pct: '0.5' },
            ];
            const kept = applyDedup(rows);
            assert.equal(kept.length, 1, `${name}: only one row survives`);
            assert.equal(kept[0].deck_slug, slugB, `${name}: higher-share slug (${slugB}) wins`);
        });
    });

    it('case-insensitivity: name dedup keys ignore casing', () => {
        const rows = [
            { tournament_id: '0005', deck_name: 'Okidogi', share_pct: '0.1' },
            { tournament_id: '0005', deck_name: 'OKIDOGI', share_pct: '0.4' },
        ];
        const kept = applyDedup(rows);
        assert.equal(kept.length, 1);
        assert.equal(kept[0].deck_name, 'OKIDOGI', 'higher-share row wins regardless of casing');
    });

    it('skips rows that are meta-bucket labels (defensive parallel guard)', () => {
        const isBucket = (n) => String(n).trim().toLowerCase() === 'other';
        const rows = [
            { tournament_id: '0005', deck_name: 'Other',  share_pct: '22.3' },
            { tournament_id: '0005', deck_name: 'Okidogi', share_pct: '0.1' },
        ];
        const kept = applyDedup(rows, isBucket);
        assert.equal(kept.length, 1);
        assert.equal(kept[0].deck_name, 'Okidogi', 'bucket label dropped, real deck kept');
    });

    it('skips rows without a tournament_id (defensive)', () => {
        const rows = [
            { tournament_id: '',     deck_name: 'Okidogi', share_pct: '0.1' },
            { tournament_id: '0005', deck_name: 'Okidogi', share_pct: '0.3' },
        ];
        const kept = applyDedup(rows);
        // First row has no tid → keeps it (no dedup possible).
        // Second row gets through as the (tid, name) winner.
        assert.equal(kept.length, 2);
    });
});
