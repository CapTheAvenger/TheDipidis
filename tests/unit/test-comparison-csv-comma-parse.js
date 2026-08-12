/**
 * Decimal commas in the `;`-delimited comparison CSVs.
 *
 * `parseFloat("53,97")` returns 53 — it stops at the comma. Every win
 * rate in the "Top 3 by Win Rate" stat card therefore collapsed to a
 * whole number, and the podium was decided by CSV row order among the
 * ties. Verified against the live data: 53,49 beat 53,97 and 53,78
 * purely because its row came first.
 *
 * The project already has one canonical parser (parseLocaleNumber in
 * js/app-utils.js). These tests pin that the two readers that were
 * still on parseFloat use it, and that the ordering it produces is the
 * one the numbers actually imply.
 *
 * Audited alongside and deliberately NOT changed (source verified to
 * emit dots, so a change would be noise):
 *   app-meta-cards.js:546      parseFloat on a .toFixed(1) number
 *   app-current-meta.js:272    registry stores "54.24%" (already parsed)
 *   app-city-league.js:426-427 field already .replace(',', '.')-ed
 *   app-city-league.js:867/916/950  reads .toFixed(2) output
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CARDS = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-cards.js'), 'utf8');
const CITY = fs.readFileSync(path.join(ROOT, 'js', 'app-city-league.js'), 'utf8');
const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// Pull the real parser out of app-utils.js rather than re-implementing it.
const parseLocaleNumber = new Function(
    UTILS.match(/function parseLocaleNumber\(input, fallback = 0\) \{[\s\S]*?\n\}/)[0] +
    '\nreturn parseLocaleNumber;')();

function readCsv(file) {
    const text = fs.readFileSync(path.join(ROOT, 'data', file), 'utf8')
        .replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter(Boolean);
    const head = lines[0].split(';');
    return lines.slice(1).map(l => {
        const cells = l.split(';');
        return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
    });
}

describe('parseLocaleNumber handles the comparison CSV format', () => {
    it('keeps the decimals parseFloat drops', () => {
        assert.equal(parseFloat('53,97'), 53, 'premise of the bug changed');
        assert.equal(parseLocaleNumber('53,97', 0), 53.97);
        assert.equal(parseLocaleNumber('9,07', 0), 9.07);
        assert.equal(parseLocaleNumber('', 0), 0);
        assert.equal(parseLocaleNumber(undefined, 0), 0);
        assert.equal(parseLocaleNumber('8.46', 0), 8.46, 'dot input must still work');
    });
});

describe('Top 3 by Win Rate reads the real numbers', () => {
    const rows = readCsv('limitless_online_decks_comparison.csv');

    it('the CSV really carries decimal commas', () => {
        const withComma = rows.filter(r => (r.new_winrate || '').includes(','));
        assert.ok(withComma.length > 0,
            'no comma decimals left — this test no longer guards anything');
    });

    it('truncating changes the podium on the current data', () => {
        const max = Math.max(...rows.map(r => parseInt(r.new_count || '0', 10)));
        const field = rows.filter(r => parseInt(r.new_count || '0', 10) >= max * 0.1);
        const top = arr => arr.slice(0, 3).map(r => r.deck_name);
        // Stable sort, exactly like the app's .sort((a,b) => b.winRate - a.winRate)
        const broken = top([...field].sort((a, b) =>
            parseFloat(b.new_winrate || '0') - parseFloat(a.new_winrate || '0')));
        const fixed = top([...field].sort((a, b) =>
            parseLocaleNumber(b.new_winrate, 0) - parseLocaleNumber(a.new_winrate, 0)));
        assert.notDeepEqual(broken, fixed,
            'the bug would be invisible on this data — check the fixture');
        // The correct podium must be genuinely ordered by value.
        const vals = fixed.map(n =>
            parseLocaleNumber(field.find(r => r.deck_name === n).new_winrate, 0));
        assert.deepEqual(vals, [...vals].sort((a, b) => b - a));
    });

    it('the source no longer parseFloats new_winrate', () => {
        assert.doesNotMatch(CARDS, /parseFloat\(\s*row\.new_winrate/);
        assert.match(CARDS, /winRate:\s*parseLocaleNumber\(row\.new_winrate/);
    });
});

describe('City League past-comparison share/placement', () => {
    it('the scraper emits commas for these fields', () => {
        const m3 = readCsv('city_league_archetypes_comparison_M3.csv');
        assert.ok(m3.length > 0);
        assert.ok(m3.some(r => (r.new_meta_share || '').includes(',')),
            'new_meta_share no longer uses commas — re-check the fix');
        assert.ok(m3.some(r => (r.new_avg_placement || '').includes(',')));
    });

    it('loadM3ComparisonData uses the locale parser', () => {
        assert.doesNotMatch(CITY, /parseFloat\(deck\.new_meta_share/);
        assert.doesNotMatch(CITY, /parseFloat\(deck\.new_avg_placement/);
        assert.match(CITY, /share:\s*parseLocaleNumber\(deck\.new_meta_share/);
        assert.match(CITY, /avgPlacement:\s*parseLocaleNumber\(deck\.new_avg_placement/);
    });
});

describe('the parser is loaded before its callers', () => {
    it('app-utils.js comes first in index.html', () => {
        const at = f => HTML.indexOf(`js/${f}?`);
        assert.ok(at('app-utils.js') >= 0);
        for (const f of ['app-meta-cards.js', 'app-city-league.js']) {
            assert.ok(at('app-utils.js') < at(f), `${f} loads before app-utils.js`);
        }
    });

    it('is exported on window', () => {
        assert.match(UTILS, /window\.parseLocaleNumber\s*=\s*parseLocaleNumber/);
    });
});
