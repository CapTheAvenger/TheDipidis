/**
 * Swap-candidate bench under the generated deck ("Tausch-Kandidaten").
 *
 * Review decisions under test (R1-R3, 2026-08-02):
 * - Y.2 build() exposes scoredCards WITHOUT the _lists/_perListCounts
 *   back-references (20.5 MB vs 33 KB serialization mine).
 * - _getCardDb falls back to allCardsDatabase and never caches an empty
 *   map (type enrichment was 0/266 without it — the builder lives on
 *   tabs where allCardsData does not exist).
 * - Y.2 bench maps best_variant.set_code/set_number (NOT set/number).
 * - Legacy bench sits in its OWN try/catch AFTER apply+save (the
 *   function-wide catch precedes apply — an earlier throw would leave
 *   the deck cleared), and diffs via consistencyDeck card REFERENCES
 *   (cardsToAdd holds spread copies).
 * - Pack counts: ceil(avg) clamped 1..4, ACE SPEC always 1.
 * - Category top-up: a Stadium/Supporter/Tool alternative present among
 *   the candidates must appear in the top slice.
 * - v1 is read-only: no per-card add-to-deck (setRarityPreference is a
 *   global write); package actions only.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const DB = fs.readFileSync(path.join(ROOT, 'js', 'app-deck-builder.js'), 'utf8');
const Y2 = fs.readFileSync(path.join(ROOT, 'js', 'deck-builder-consistency.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

function extract(name) {
    const re = new RegExp('        (?:function ' + name + '\\([^)]*\\)|const ' + name + ' = [^\\n]*=>) \\{[\\s\\S]*?\\n        \\}\\n');
    const m = DB.match(re);
    if (!m) throw new Error('could not extract ' + name);
    return m[0];
}

describe('Y.2 exposes the bench data safely', () => {
    it('build() returns scoredCards stripped of the list back-references', () => {
        assert.ok(/scoredCards:\s+scoredCardsOut/.test(Y2), 'scoredCards missing from return');
        assert.ok(/const \{ _lists, _perListCounts, \.\.\.rest \} = c;/.test(Y2),
            'the 20MB _lists back-references are back in the report path');
    });

    it('_getCardDb falls back to allCardsDatabase and never caches an empty map', () => {
        assert.ok(/global\.allCardsData \|\| global\.allCardsDatabase \|\| global\.allCardsByKey/.test(Y2),
            'without the fallback, type enrichment resolves nothing outside the Cards tab');
        assert.ok(/if \(db\.size > 0\) _cardDbCache = db;/.test(Y2),
            'caching an empty map pins the miss for the whole session');
    });

    it('Y.2 bench maps best_variant.set_code/set_number', () => {
        assert.ok(/c\.best_variant && c\.best_variant\.set_code/.test(DB) &&
                  /c\.best_variant && c\.best_variant\.set_number/.test(DB),
            'best_variant carries set_code/set_number — set/number yields undefined keys');
    });
});

describe('legacy bench safety', () => {
    it('sits in its own try/catch after apply+save and diffs via references', () => {
        const m = DB.match(/Swap-candidate bench — OWN try\/catch[\s\S]{0,2200}/);
        assert.ok(m, 'legacy bench block missing');
        assert.ok(m[0].includes('new Set(consistencyDeck.map(e => e && e.card)'),
            'diff must use consistencyDeck card references — cardsToAdd holds spread copies');
        assert.ok(m[0].includes("catch (benchErr)"), 'own catch missing');
        // must come after the save calls
        const saveIdx = DB.indexOf('savePastMetaDeck();\n                }');
        const benchIdx = DB.indexOf('Swap-candidate bench — OWN try/catch');
        assert.ok(benchIdx > saveIdx && saveIdx !== -1,
            'bench must run after apply+save — earlier throws leave the deck cleared');
    });

    it('legacy ACE detection uses the canonical window.isAceSpec, not the drifted local list', () => {
        const m = DB.match(/Swap-candidate bench — OWN try\/catch[\s\S]{0,2200}/);
        assert.ok(m[0].includes('window.isAceSpec'),
            'the hardcoded 30-name list has drifted from ace_specs.json (12 missing)');
    });
});

describe('pack counts and top-up', () => {
    function load(name) {
        const ns = {};
        new Function('exports', 'DECK_BENCH_SHOW', 'DECK_BENCH_MAX',
            extract(name) + `exports.fn = ${name};`)(ns, 15, 25);
        return ns.fn;
    }

    it('packCount = ceil(avg) clamped 1..4; ACE SPEC always 1', () => {
        const fn = load('_benchPackCount');
        assert.equal(fn({ avgCount: 3.1 }), 4, 'pack enough copies: ceil');
        assert.equal(fn({ avgCount: 2.0 }), 2);
        assert.equal(fn({ avgCount: 0 }), 1);
        assert.equal(fn({ avgCount: 9 }), 4, 'legal max');
        assert.equal(fn({ avgCount: 3.5, isAceSpec: true }), 1);
    });

    it('category top-up pulls a Stadium alternative into the top slice', () => {
        const fn = load('_benchTopUp');
        const rows = [];
        for (let i = 0; i < 15; i++) rows.push({ name: `T${i}`, type: 'Item', usagePct: 90 - i });
        rows.push({ name: 'Some Stadium', type: 'Stadium', usagePct: 40 });
        const top = fn(rows).slice(0, 15);
        assert.ok(top.some(r => r.type === 'Stadium'),
            '15 same-type fillers with the only Stadium alternative hidden below the fold');
    });

    it('no top-up invented when no such category exists', () => {
        const fn = load('_benchTopUp');
        const rows = [];
        for (let i = 0; i < 20; i++) rows.push({ name: `P${i}`, type: 'Basic', usagePct: 90 - i });
        const out = fn(rows);
        assert.equal(out.filter(r => (r.type || '').includes('Stadium')).length, 0);
    });
});

describe('read-only surface + wiring', () => {
    it('bench rows carry NO per-card add-to-deck handler', () => {
        const m = DB.match(/const rowHtml = \(r\) => \{[\s\S]*?\n            \};/);
        assert.ok(m, 'rowHtml missing');
        assert.ok(!/addCardToDeck|setRarityPreference/.test(m[0]),
            'per-card add writes global print preferences and leaves the deck at 61/60 — v2 only, with a swap dialog');
    });

    it('containers exist in all three sources, outside the wiped deck grid', () => {
        for (const source of ['cityLeague', 'currentMeta', 'pastMeta']) {
            assert.ok(HTML.includes(`id="${source}BenchSection"`), `${source}BenchSection missing`);
        }
        // must not be nested inside the grid that renderMyDeckGrid wipes
        const gridBlock = HTML.slice(HTML.indexOf('id="cityLeagueMyDeckGrid"'),
                                     HTML.indexOf('id="cityLeagueBenchSection"'));
        assert.ok((gridBlock.match(/<div/g) || []).length <= (gridBlock.match(/<\/div>/g) || []).length,
            'bench container appears to be nested inside the deck grid (would be wiped on every render)');
    });

    it('proxy action uses the suppress-toast batch pattern and reports copies', () => {
        const m = DB.match(/function deckBenchToProxy\(source\)[\s\S]*?\n        \}\n/);
        assert.ok(m[0].includes('addCardToProxy(r.name, r.set, r.number, r.packCount, true)'));
        assert.ok(m[0].includes('renderProxyQueue'));
    });

    it('all bench i18n keys exist in BOTH language blocks', () => {
        for (const key of ['bench.title', 'bench.hint', 'bench.toProxy', 'bench.copy',
            'bench.proxyDone', 'bench.showMore', 'bench.moreCopies', 'bench.aceSwap',
            'bench.copiesTotal']) {
            const hits = I18N.split(`'${key}'`).length - 1;
            assert.ok(hits >= 2, `i18n key ${key} present ${hits}x — needs en AND de`);
        }
    });

    it('both build paths call _finalizeDeckBench', () => {
        const calls = DB.match(/_finalizeDeckBench\(source,/g) || [];
        assert.ok(calls.length >= 2, `expected Y.2 + legacy call sites, found ${calls.length}`);
    });
});
