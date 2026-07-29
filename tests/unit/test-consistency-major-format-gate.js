/**
 * Format gate for the consistency builder after a set rotation.
 *
 * Two build paths could anchor on previous-format Major data:
 *
 *  1. The legacy stages' Major mechanisms (absent-from-Major hard cap,
 *     4-of skeleton lock, conditional-avg locks, co-occurrence) reading
 *     window.currentMetaTournamentCardsData — gated by
 *     _filterMajorRowsToCurrentFormat in js/app-deck-builder.js.
 *  2. The primary Phase Y.2 path (js/deck-builder-consistency.js), whose
 *     per-decklist CSV is 100% previous-format until the first
 *     current-format Major is scraped — gated by opts.minDate in build().
 *
 * Reported case (Alakazam Dudunsparce, TEF-PBL week 2): the build was the
 * OLD format's list — Toucannon line (80% of current online decks, PBL
 * cards that could not exist at NAIC) refused, Nighttime Mine x4 (71.7%
 * at NAIC, 35% now) forced over Battle Cage (30.4% at NAIC, 80% now).
 *
 * TZ note: this suite pins TZ=Europe/Berlin because the first legality
 * day is compared in UTC — a local-midnight parser would silently drop a
 * Major held exactly ON the legality date for every UTC+x visitor.
 */

process.env.TZ = 'Europe/Berlin';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-deck-builder.js'), 'utf8');
const CITY = fs.readFileSync(path.join(ROOT, 'js', 'app-city-league.js'), 'utf8');

function extract(src, name, indent) {
    const re = new RegExp(
        'function ' + name + '\\([^)]*\\)[\\s\\S]*?\\n' + indent + '\\}\\n');
    const m = src.match(re);
    if (!m) throw new Error('could not extract ' + name);
    return m[0];
}

function load() {
    // The gate's parser chain in the browser is:
    //   _filterMajorRowsToCurrentFormat → _parseAnyTournamentDate →
    //   parseJapaneseDate (a real global from app-city-league.js).
    // Run the REAL functions, not stand-ins, so a drift in any of them
    // fails here first.
    const code = extract(CITY, 'parseJapaneseDate', '        ')
        + extract(SRC, '_parseAnyTournamentDate', '        ')
        + extract(SRC, '_filterMajorRowsToCurrentFormat', '        ')
        + 'exports.gate = _filterMajorRowsToCurrentFormat;';
    const ns = {};
    new Function('exports', code)(ns);
    return ns.gate;
}
const gate = load();

const FW_PBL = { in_person_legal_date: '2026-07-31' };
const naicRow = { tournament_date: '10th June 2026', card_name: 'Nighttime Mine' };

describe('legacy-stage major format gate', () => {
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

    it('keeps a Major held exactly ON the first legal day (UTC boundary, TZ=Europe/Berlin)', () => {
        // ICs/Regionals are dated by their Friday start = the legality
        // date itself. A local-midnight parse ('2026-07-30T22:00Z' in
        // Berlin) would gate that event forever.
        const r = gate([{ tournament_date: '31st July 2026' }], FW_PBL);
        assert.equal(r.rows.length, 1, 'the first current-format Major must un-gate, not be dropped');
        assert.equal(r.dropped, 0);
    });

    it('handles ISO and German dot dates as well as English ordinals', () => {
        const r = gate([
            { tournament_date: '2026-08-15' },
            { tournament_date: '15.08.2026' },
        ], FW_PBL);
        assert.equal(r.rows.length, 2);
        // German dot-format must not be read as MM.DD (Feb 5 vs May 2).
        const r2 = gate([{ tournament_date: '02.05.2026' }], FW_PBL);
        assert.equal(r2.rows.length, 0, '02.05.2026 is May 2nd — previous format');
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

    it('a failed format_window fetch is not cached for the session', () => {
        // Fail-open on the FIRST build is deliberate; fail-open forever
        // is not. The loader must reset its promise cache on failure.
        assert.ok(/catch\(\(\) => \{ _builderFwPromise = null; return null; \}\)/.test(SRC),
            'app-deck-builder.js caches a failed format_window fetch forever');
        const QUICKREF = fs.readFileSync(
            path.join(ROOT, 'js', 'current-meta-quickref.js'), 'utf8');
        assert.ok(/catch\(\(\) => \{ _fwPromise = null; return null; \}\)/.test(QUICKREF),
            'current-meta-quickref.js caches a failed format_window fetch forever');
    });

    it('is wired into every read of the major rows inside the builder', () => {
        assert.ok(SRC.includes('const _gateMajorRows = (rows) =>'),
            'the gate wrapper definition is gone');
        // Assert each of the four gated read sites individually — a
        // bare count would pass if one site was un-gated and a call
        // added elsewhere.
        for (const line of [
            'const majorRows = _gateMajorRows(window.currentMetaTournamentCardsData);',
            'let tournamentRows = _gateMajorRows(window.currentMetaTournamentCardsData);',
            "const _coocMajorRows = _gateMajorRows(typeof window !== 'undefined' ? window.currentMetaTournamentCardsData : []);",
            'const _majorRowsForCond = _gateMajorRows(window.currentMetaTournamentCardsData);',
        ]) {
            assert.ok(SRC.includes(line), 'gated read site missing/bypassed: ' + line);
        }
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
        assert.ok(SRC.includes('if (card._latestMajorAbsent) {'),
            'the hard cap moved — re-verify the gate covers it');
        assert.ok(SRC.includes('_skeletonSet = _hasMajorForCond'),
            'the skeleton wiring moved — re-verify the gate covers it');
    });

    it('Phase Y.2 receives the format gate as opts.minDate', () => {
        // Y.2 runs BEFORE the legacy stages and returns on success — an
        // un-gated Y.2 rebuilds the previous format's deck from the
        // per-decklist CSV and the legacy gate never runs.
        assert.ok(/result = await builder\.build\(archetype, \{\s*minDate:/.test(SRC),
            '_runMostConsistencyBuilderPath no longer passes minDate to build()');
    });
});

// ── Phase Y.2 (MostConsistencyBuilder) — functional, real module ──────
// The module is loaded whole (IIFE against globalThis) with PapaParse
// stubbed to serve fixture rows, so build() runs its real phases.

function makeRows() {
    // 3 previous-format lists (NAIC-style, 2026-06-10) + 3 current-format
    // lists (2026-08-02) + 1 undated list, each with enough cards that
    // scoring has something to chew on.
    const rows = [];
    const addList = (tid, date, player, cards) => {
        for (const [name, count] of cards) {
            rows.push({
                tournament_id: tid, limitless_tournament_id: tid,
                tournament_name: 'T' + tid, tournament_date: date,
                meta: date && date < '2026-07-31' ? 'TEF-CRI' : 'TEF-PBL',
                place: '1', player_name: player, deck_archetype: 'Testachu',
                deck_slug: 'testachu', wins: '5', losses: '1', ties: '0',
                card_name: name, card_identifier: name, set_code: 'PBL',
                set_number: '1', count: String(count), type: 'Trainer',
                is_ace_spec: '', scraped_at: '',
            });
        }
    };
    const oldCards = [['Nighttime Mine', 4], ['Dedenne', 2], ['Psyduck', 1],
        ['Iono', 4], ['Arven', 3], ['Ultra Ball', 4]];
    const newCards = [['Battle Cage', 3], ['Toucannon', 2], ['Trumbeak', 2],
        ['Pikipek', 2], ['Iono', 4], ['Ultra Ball', 4]];
    addList('t1', '2026-06-10', 'Old One', oldCards);
    addList('t2', '2026-06-10', 'Old Two', oldCards);
    addList('t3', '2026-06-10', 'Old Three', oldCards);
    addList('t4', '2026-08-02', 'New One', newCards);
    addList('t5', '2026-08-02', 'New Two', newCards);
    addList('t6', '2026-08-02', 'New Three', newCards);
    addList('t7', '', 'Undated', newCards);
    return rows;
}

function loadY2(rows) {
    // Fresh module instance per call: evaluate the IIFE against a
    // sandbox `globalThis` substitute.
    const src = fs.readFileSync(
        path.join(ROOT, 'js', 'deck-builder-consistency.js'), 'utf8');
    const sandbox = {
        isAceSpec: () => false,   // skips the ace_specs.json fetch path
        Papa: {
            parse(url, opts) {
                const data = String(url).includes('tournament_decklists_per_player')
                    ? rows : [];
                setImmediate(() => opts.complete({ data }));
            },
        },
    };
    // Neutralize the file's own `(typeof window !== 'undefined' ? window
    // : globalThis)` tail by providing a `window` in scope.
    new Function('window', 'globalThis', 'Papa', 'document', 'fetch',
        src)(sandbox, sandbox, sandbox.Papa, undefined, undefined);
    if (!sandbox.MostConsistencyBuilder) {
        throw new Error('module did not register MostConsistencyBuilder');
    }
    return sandbox.MostConsistencyBuilder;
}

describe('phase Y.2 per-decklist format gate', () => {
    it('declines when every list predates the format window (the reported state)', async () => {
        const rows = makeRows().filter(r => r.tournament_date === '2026-06-10');
        const b = loadY2(rows);
        const res = await b.build('Testachu', { minDate: '2026-07-31' });
        assert.equal(res.dataQuality.sufficient, false,
            'previous-format lists must not satisfy the builder');
        assert.match(res.dataQuality.warning, /predate/);
        assert.equal(res.deck.length, 0);
        assert.ok(res.trace.some(t => t.decision === 'previous_format_lists_dropped'
            && t.dropped === 3 && t.kept === 0));
    });

    it('builds from current-format lists only when both exist', async () => {
        const b = loadY2(makeRows().filter(r => r.tournament_date));
        const res = await b.build('Testachu', { minDate: '2026-07-31' });
        assert.equal(res.dataQuality.sufficient, true);
        assert.equal(res.dataQuality.n_lists, 3, 'exactly the 3 current-format lists');
        const names = res.deck.map(e => (e.card && e.card.name) || '');
        assert.ok(names.includes('Battle Cage'), 'current-format staple missing');
        assert.ok(!names.includes('Nighttime Mine'),
            'previous-format-only card leaked into the build');
        assert.ok(res.trace.some(t => t.decision === 'previous_format_lists_dropped'
            && t.dropped === 3 && t.kept === 3));
    });

    it('keeps undated lists — cannot-date is not previous-format', async () => {
        const b = loadY2(makeRows());
        const res = await b.build('Testachu', { minDate: '2026-07-31' });
        assert.equal(res.dataQuality.n_lists, 4, '3 current + 1 undated');
    });

    it('no minDate → unchanged behavior (all lists build)', async () => {
        const b = loadY2(makeRows());
        const res = await b.build('Testachu', {});
        assert.equal(res.dataQuality.n_lists, 7);
        assert.ok(!res.trace.some(t => t.decision === 'previous_format_lists_dropped'));
    });

    it('a malformed minDate gates nothing', async () => {
        const b = loadY2(makeRows());
        const res = await b.build('Testachu', { minDate: 'kaputt' });
        assert.equal(res.dataQuality.n_lists, 7);
    });
});
