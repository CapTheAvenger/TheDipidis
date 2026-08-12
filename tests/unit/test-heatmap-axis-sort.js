/**
 * Matchup-heatmap axis order.
 *
 * The sort was dead: it read window.currentMetaArchetypes /
 * metaArchetypes / currentMetaData, none of which is assigned anywhere
 * in the project, and its fallback counted opp.matches / total /
 * totalMatches while buildMatchupRegistryFromCsv writes total_games.
 * Both comparators returned 0 for every pair, so the axis just kept
 * whatever order the CSV arrived in.
 *
 * Nothing looked wrong, because the scraper happens to emit rank order —
 * the sort silently depended on its input already being sorted. That is
 * exactly why this test feeds it DELIBERATELY unsorted data: against the
 * old code it fails, against the fixed code it passes.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-current-meta.js'), 'utf8');

// Rebuild the comparator exactly as the source defines it.
function buildSorter(shareMap) {
    const countGamesSrc = SRC.match(/const countGames = \(row\) => \{[\s\S]*?\n                \};/);
    assert.ok(countGamesSrc, 'countGames helper not found — did the fix get reverted?');
    const sortSrc = SRC.match(/deckNames\.sort\(\(a, b\) => \{[\s\S]*?\n                \}\);/);
    assert.ok(sortSrc, 'axis sort not found');
    // eslint-disable-next-line no-new-func
    return new Function('deckNames', 'matchupData', 'metaDeckShareMap', `
        ${countGamesSrc[0].replace(/^\s+/gm, '')}
        ${sortSrc[0].replace(/^\s+/gm, '')}
        return deckNames;`);
}

const reg = {
    Alpha:   { X: { total_games: 10 } },
    Beta:    { X: { total_games: 500 }, Y: { total_games: 400 } },
    Gamma:   { X: { total_games: 50 } },
};

describe('axis order', () => {
    const sorter = buildSorter();

    it('falls back to total games when no share is known', () => {
        // Deliberately unsorted input. The old code returned it unchanged.
        const out = sorter(['Alpha', 'Gamma', 'Beta'], reg, new Map());
        assert.equal(out.join(' > '), 'Beta > Gamma > Alpha');
    });

    it('reads total_games, the key the registry actually writes', () => {
        // The old fallback looked for opp.matches / total / totalMatches.
        // With only those present it must still not crash, and with
        // total_games present it must use it.
        const legacy = { A: { X: { matches: 900 } }, B: { X: { total_games: 5 } } };
        assert.equal(sorter(['B', 'A'], legacy, new Map()).join(' > '), 'A > B');
        assert.match(SRC, /opp\.total_games \?\? opp\.matches/,
            'the legacy key names should stay as a fallback, not replace total_games');
    });

    it('meta share wins over game count when it is known', () => {
        const shares = new Map([['Alpha', 9.9], ['Beta', 1.0], ['Gamma', 5.0]]);
        const out = sorter(['Beta', 'Alpha', 'Gamma'], reg, shares);
        assert.equal(out.join(' > '), 'Alpha > Gamma > Beta');
    });

    it('a deck with no matchup row sinks rather than throwing', () => {
        const out = sorter(['Ghost', 'Beta'], reg, new Map());
        assert.equal(out.join(' > '), 'Beta > Ghost');
    });

    it('is stable enough to be deterministic for equal input', () => {
        const flat = { A: { X: { total_games: 10 } }, B: { X: { total_games: 10 } } };
        assert.equal(sorter(['A', 'B'], flat, new Map()).join(' > '),
                     sorter(['A', 'B'], flat, new Map()).join(' > '));
    });
});

describe('the dead globals are gone from the logic', () => {
    it('the share map no longer parseFloats a comma value', () => {
        assert.doesNotMatch(SRC, /parseFloat\(d\.share \|\| d\.percentage_in_archetype/,
            'share is parsed with parseFloat again — comma values would truncate');
        assert.match(SRC, /parseLocaleNumber\(d\.share \|\| d\.percentage_in_archetype/);
    });

    it('the reason the bug was invisible is written down', () => {
        // Without this note the next reader re-derives the whole thing.
        assert.match(SRC, /assigned NOWHERE|scraper happens to emit rank order/);
    });
});
