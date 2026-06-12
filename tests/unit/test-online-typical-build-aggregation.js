/**
 * Regression test for findBestOnlineBuild's tournament-disambiguation guard.
 *
 * 2026-06-12 bug report: "Latest Online · Typical Build" on the Deck
 * Analysis (Global) tab showed Mega Greninja with "1 Decks · 120 cards"
 * and per-card totals above the legal 4-copy limit (Froakie 8,
 * Lillie's Determination 8). Root cause: when two different online
 * tournaments shared a tournament_date for the same archetype (e.g.
 * 2026-06-09: Sunny's Weekly #260 + Card Temple Weekly Battles #62
 * both ran Mega Greninja), the function filtered by date only and
 * summed the card counts across BOTH tournaments while keeping just
 * the FIRST tournament's name + deck count.
 *
 * Fix: after picking the latest date, pick a single tournament to
 * represent "Latest Online · Typical Build" — strongest sample first
 * (largest total_decks_in_archetype), tiebreak total_players, final
 * deterministic tiebreak on tournament_id.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Helper: build a CSV row object as produced by PapaParse with
// `header: true`. Mirrors the column names used at runtime.
function row(o) {
    return Object.assign({
        tournament_id: '',
        tournament_name: '',
        meta: 'Online Dated',
        tournament_date: '',
        archetype: '',
        card_name: '',
        card_identifier: '',
        total_count: '0',
        max_count: '0',
        deck_inclusion_count: '0',
        average_count: '0,0',
        total_decks_in_archetype: '0',
        percentage_in_archetype: '0',
        set_code: '',
        set_name: '',
        set_number: '',
        rarity: '',
        type: '',
        image_url: '',
        is_ace_spec: '',
        total_players: '0',
    }, o);
}

function loadInternals(rows) {
    const quickrefSrc = fs.readFileSync(
        path.join(__dirname, '..', '..', 'js', 'current-meta-quickref.js'),
        'utf8'
    );
    const stubGlobal = {
        cardsBySetNumberMap: null,
        parseLocaleNumber: (v, fallback) => {
            if (v == null) return fallback;
            const s = String(v).trim().replace(',', '.');
            const n = parseFloat(s);
            return Number.isFinite(n) ? n : fallback;
        },
        console,
    };
    // Stub Papa.parse(url, {complete:...}) — the loader's download:true
    // path calls Papa.parse with a URL string and waits on `complete`.
    const Papa = {
        parse(_url, opts) {
            // Defer once so the loader can register and the await chain
            // resolves like the real download mode would.
            setImmediate(() => opts.complete({ data: rows.slice() }));
        },
    };
    const sandbox = {
        window: stubGlobal,
        globalThis: stubGlobal,
        console,
        parseLocaleNumber: stubGlobal.parseLocaleNumber,
        Papa,
        Promise,
        setTimeout,
        clearTimeout,
        setImmediate,
        Date,
    };
    vm.createContext(sandbox);
    vm.runInContext(quickrefSrc, sandbox, { filename: 'current-meta-quickref.js' });
    return stubGlobal._currentMetaQuickRefInternals;
}

describe('findBestOnlineBuild — tournament disambiguation', () => {
    it('picks a single tournament when two share latestDate, no double-counting', async () => {
        const rows = [
            // Tournament A — Sunny's Weekly #260 — 1 deck, 168 players
            row({ tournament_id: 'A', tournament_name: "Sunny's Weekly #260", tournament_date: '2026-06-09',
                archetype: 'Mega Greninja', card_name: 'Froakie', card_identifier: 'CRI 20',
                average_count: '4,0', total_decks_in_archetype: '1', set_code: 'CRI', set_number: '20',
                type: 'Basic', total_players: '168' }),
            row({ tournament_id: 'A', tournament_name: "Sunny's Weekly #260", tournament_date: '2026-06-09',
                archetype: 'Mega Greninja', card_name: "Lillie's Determination", card_identifier: 'MEG 119',
                average_count: '4,0', total_decks_in_archetype: '1', set_code: 'MEG', set_number: '119',
                type: 'Supporter', total_players: '168' }),
            // Tournament B — Card Temple #62 — 1 deck, 200 players
            row({ tournament_id: 'B', tournament_name: 'Card Temple Weekly Battles #62', tournament_date: '2026-06-09',
                archetype: 'Mega Greninja', card_name: 'Froakie', card_identifier: 'CRI 20',
                average_count: '4,0', total_decks_in_archetype: '1', set_code: 'CRI', set_number: '20',
                type: 'Basic', total_players: '200' }),
            row({ tournament_id: 'B', tournament_name: 'Card Temple Weekly Battles #62', tournament_date: '2026-06-09',
                archetype: 'Mega Greninja', card_name: "Lillie's Determination", card_identifier: 'MEG 119',
                average_count: '4,0', total_decks_in_archetype: '1', set_code: 'MEG', set_number: '119',
                type: 'Supporter', total_players: '200' }),
            row({ tournament_id: 'B', tournament_name: 'Card Temple Weekly Battles #62', tournament_date: '2026-06-09',
                archetype: 'Mega Greninja', card_name: 'Dudunsparce', card_identifier: 'POR 132',
                average_count: '2,0', total_decks_in_archetype: '1', set_code: 'POR', set_number: '132',
                type: 'Stage 1', total_players: '200' }),
        ];
        const internals = loadInternals(rows);
        const result = await internals.findBestOnlineBuild('Mega Greninja');
        assert.ok(result, 'should return a build');
        // Total players is the tiebreaker (both have 1 deck in archetype),
        // so B (200 players) wins over A (168).
        assert.equal(result.tournament_id, 'B', 'larger-tournament tiebreak wins');
        assert.equal(result.total_decks_in_archetype, 1);
        // Per-card counts must come from a SINGLE tournament — no 4+4=8.
        const froakie = result.cards.find(c => c.name === 'Froakie');
        assert.ok(froakie, 'Froakie present');
        assert.equal(froakie.count, 4, 'Froakie count must be 4 (one tournament), not 8 (summed)');
        const lillie = result.cards.find(c => c.name === "Lillie's Determination");
        assert.equal(lillie.count, 4, "Lillie's Determination must be 4, not 8");
        // Cards exclusive to B should be present.
        assert.ok(result.cards.find(c => c.name === 'Dudunsparce'), 'B-only card present');
    });

    it('prefers the tournament with the larger total_decks_in_archetype', async () => {
        const rows = [
            // A — 1 deck, 500 players (high player count but small archetype sample)
            row({ tournament_id: 'A', tournament_name: 'Big Open', tournament_date: '2026-06-09',
                archetype: 'Dragapult', card_name: 'Dreepy', card_identifier: 'TWM 128',
                average_count: '4,0', total_decks_in_archetype: '1', total_players: '500' }),
            // B — 8 decks, 60 players (smaller turnout but more reps of the archetype)
            row({ tournament_id: 'B', tournament_name: 'Archetype Showcase', tournament_date: '2026-06-09',
                archetype: 'Dragapult', card_name: 'Dreepy', card_identifier: 'TWM 128',
                average_count: '3,5', total_decks_in_archetype: '8', total_players: '60' }),
        ];
        const internals = loadInternals(rows);
        const result = await internals.findBestOnlineBuild('Dragapult');
        assert.equal(result.tournament_id, 'B', 'higher deck-sample wins over higher player count');
        assert.equal(result.total_decks_in_archetype, 8);
    });

    it('uses tournament_id as deterministic tiebreak when all else is equal', async () => {
        const rows = [
            row({ tournament_id: 'zzz', tournament_name: 'Z', tournament_date: '2026-06-09',
                archetype: 'X', card_name: 'Card', card_identifier: 'X 1',
                average_count: '1,0', total_decks_in_archetype: '1', total_players: '1' }),
            row({ tournament_id: 'aaa', tournament_name: 'A', tournament_date: '2026-06-09',
                archetype: 'X', card_name: 'Card', card_identifier: 'X 1',
                average_count: '1,0', total_decks_in_archetype: '1', total_players: '1' }),
        ];
        const internals = loadInternals(rows);
        const result = await internals.findBestOnlineBuild('X');
        assert.equal(result.tournament_id, 'aaa', 'lexicographically smaller tid wins');
    });

    it('single-tournament case still returns a valid build', async () => {
        const rows = [
            row({ tournament_id: 'A', tournament_name: 'Solo', tournament_date: '2026-06-09',
                archetype: 'Y', card_name: 'Pikachu ex', card_identifier: 'SVI 1',
                average_count: '2,0', total_decks_in_archetype: '3', total_players: '100' }),
            row({ tournament_id: 'A', tournament_name: 'Solo', tournament_date: '2026-06-09',
                archetype: 'Y', card_name: 'Pichu', card_identifier: 'SVI 2',
                average_count: '2,0', total_decks_in_archetype: '3', total_players: '100' }),
        ];
        const internals = loadInternals(rows);
        const result = await internals.findBestOnlineBuild('Y');
        assert.equal(result.tournament_id, 'A');
        assert.equal(result.cards.length, 2);
    });

    it('returns null when no rows match the archetype', async () => {
        const rows = [
            row({ tournament_id: 'A', tournament_date: '2026-06-09', archetype: 'X', card_name: 'C',
                  average_count: '1,0', total_decks_in_archetype: '1' }),
        ];
        const internals = loadInternals(rows);
        const result = await internals.findBestOnlineBuild('NotPresent');
        assert.equal(result, null);
    });

    it('only iterates the latest date when an older date exists for the same archetype', async () => {
        const rows = [
            // Older date — must be ignored entirely
            row({ tournament_id: 'OLD', tournament_date: '2026-06-01', archetype: 'X', card_name: 'Junk',
                average_count: '4,0', total_decks_in_archetype: '10', total_players: '999' }),
            // Latest date
            row({ tournament_id: 'NEW', tournament_date: '2026-06-09', archetype: 'X', card_name: 'Fresh',
                average_count: '2,0', total_decks_in_archetype: '1', total_players: '50' }),
        ];
        const internals = loadInternals(rows);
        const result = await internals.findBestOnlineBuild('X');
        assert.equal(result.tournament_id, 'NEW');
        assert.equal(result.cards.length, 1);
        assert.equal(result.cards[0].name, 'Fresh');
    });
});
