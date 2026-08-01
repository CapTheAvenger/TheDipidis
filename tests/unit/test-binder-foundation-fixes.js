/**
 * Stage-0 foundation fixes for the binder feature (pre-print-status):
 *
 * 1. ACE-SPEC detection was dead: the CSV's is_ace_spec column is "No" on
 *    every row, no rarity contains "ace", there is no group column — so
 *    isAceSpecRow() returned false for all 3502 rows and every ACE SPEC
 *    under the 70% threshold silently vanished from binders (10 prints
 *    missing with all archetypes selected). Now: canonical name list
 *    (window.isAceSpec) guarded by rarity (verified 0 false positives
 *    across the 20k card DB).
 *
 * 2. computeDelta() saved its snapshot unconditionally to the SHARED
 *    users/{uid}.metaBinderSnapshot — every Custom Binder generation
 *    destroyed the Meta Binder's "what's new" baseline and vice versa.
 *    Now pure; callers persist explicitly.
 *
 * 3. The dropped-cards diff split family-signature IDs on '|' and rendered
 *    garbage ("intl:SSP-32 / PRE-40"). Now diffs against the stored card
 *    OBJECTS.
 *
 * 4. printProxyQueue waited for every <img> onload/onerror with no
 *    timeout — one stalled CDN connection (throttling: neither event
 *    fires) meant the print dialog never opened. Now: watchdog + fire-once.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MB = fs.readFileSync(path.join(ROOT, 'js', 'meta-binder.js'), 'utf8');
const CB = fs.readFileSync(path.join(ROOT, 'js', 'custom-binder.js'), 'utf8');
const CORE = fs.readFileSync(path.join(ROOT, 'js', 'app-core.js'), 'utf8');

function extractAceFn() {
    const m = MB.match(/function isAceSpecRow\(row\)[\s\S]*?\n        \}\n/);
    if (!m) throw new Error('could not extract isAceSpecRow');
    return (windowStub) => {
        const ns = {};
        new Function('window', 'exports', m[0] + 'exports.fn = isAceSpecRow;')(windowStub, ns);
        return ns.fn;
    };
}
const makeAce = extractAceFn();

describe('ACE-SPEC detection (binder)', () => {
    const aceList = new Set(['master ball', 'prime catcher', 'brilliant blender']);
    const win = { isAceSpec: (n) => aceList.has(String(n).toLowerCase().trim()) };

    it('recognizes an ACE SPEC from the name list although every CSV column is dead', () => {
        const fn = makeAce(win);
        assert.equal(fn({ card_name: 'Brilliant Blender', rarity: 'Ultra Rare', is_ace_spec: 'No' }), true,
            'the reported bug: ACE under 70% usage was invisible because only dead columns were checked');
    });

    it('the rarity guard kills the known name collisions', () => {
        const fn = makeAce(win);
        // Master Ball DS 99 is Uncommon (not ACE) — same name as the TEF ACE.
        assert.equal(fn({ card_name: 'Master Ball', rarity: 'Uncommon', is_ace_spec: 'No' }), false);
        assert.equal(fn({ card_name: 'Master Ball', rarity: 'Ultra Rare', is_ace_spec: 'No' }), true);
    });

    it('non-ACE names stay non-ACE', () => {
        const fn = makeAce(win);
        assert.equal(fn({ card_name: 'Ultra Ball', rarity: 'Ultra Rare', is_ace_spec: 'No' }), false);
    });

    it('falls back to the legacy column checks while the async list is not loaded', () => {
        const fn = makeAce({});
        assert.equal(fn({ card_name: 'Whatever', rarity: 'Special', is_ace_spec: 'Yes' }), true);
        assert.equal(fn({ card_name: 'Whatever', rarity: 'Special', is_ace_spec: 'No' }), false);
    });

    it('a throwing isAceSpec degrades to the fallback instead of breaking the build', () => {
        const fn = makeAce({ isAceSpec: () => { throw new Error('boom'); } });
        assert.equal(fn({ card_name: 'Master Ball', rarity: 'Ultra Rare', is_ace_spec: 'Yes' }), true);
        assert.equal(fn({ card_name: 'Master Ball', rarity: 'Ultra Rare', is_ace_spec: 'No' }), false);
    });
});

describe('computeDelta persistence split', () => {
    it('computeDelta no longer writes the snapshot itself', () => {
        const body = MB.match(/async function computeDelta\(binderMap, options\)[\s\S]*?\n    \}\n/);
        assert.ok(body, 'computeDelta(binderMap, options) signature missing');
        assert.ok(!body[0].includes('saveBinderSnapshot'),
            'computeDelta writes again — the Custom Binder will clobber the Meta Binder baseline');
    });

    it('the Meta Binder build persists explicitly and reuses its session baseline', () => {
        assert.ok(/_mbSessionBaseline = await loadPreviousBinderIds\(\)/.test(MB));
        assert.ok(/computeDelta\(binderMap, \{ previous: _mbSessionBaseline \}\)/.test(MB));
        assert.ok(/await saveBinderSnapshot\(new Set\(binderMap\.keys\(\)\), delta\.cards\)/.test(MB));
    });

    it('the Custom Binder passes its own baseline and never touches the meta cache key', () => {
        assert.ok(!/localStorage\.(getItem|setItem|removeItem)\('metaBinderCacheV1'\)/.test(CB),
            'the dead metaBinderCacheV1 key-swap is back — it protected nothing');
        assert.ok(/shared\.computeDelta\(binderMap, \{ previous \}\)/.test(CB));
        assert.ok(/CB_CACHE_KEY_V2/.test(CB), 'CB baseline (ids+cards) storage missing');
    });

    it('loadPreviousBinderIds returns the stored card objects for the dropped-diff', () => {
        assert.ok(/const cards = Array\.isArray\(data\.metaBinderCards\) \? data\.metaBinderCards : \[\]/.test(MB));
        assert.ok(/return \{ ids: new Set\(arr\), cards, date: ts, hasProfile: true \}/.test(MB));
    });
});

describe('dropped-cards diff', () => {
    it('builds dropped entries from saved card objects, not from splitting the id', () => {
        assert.ok(!/const \[name, set, number\] = oldId\.split\('\|'\)/.test(MB),
            'the id-split is back — family signatures cannot be split into name/set/number');
        assert.ok(/prevById\.get\(oldId\)/.test(MB));
        // Legacy snapshots without objects: show the raw id honestly.
        assert.ok(/String\(oldId\)\.replace\(\/\^intl:\/, ''\)/.test(MB));
    });
});

describe('proxy print watchdog', () => {
    it('print fires exactly once, and a stalled image cannot block it forever', () => {
        const body = CORE.match(/function printProxyQueue\(\)[\s\S]*?\n        \}\n/);
        assert.ok(body, 'printProxyQueue missing');
        const src = body[0];
        assert.ok(/let printFired = false/.test(src), 'fire-once guard missing');
        assert.ok(/setTimeout\(\(\) => firePrint\(/.test(src), 'watchdog timeout missing');
        // Every print goes through the guard: no bare popup.print() outside firePrint.
        const bare = src.split('function firePrint')[1] || '';
        const outside = src.replace(/function firePrint\(reason\)[\s\S]*?\n            \}/, '');
        assert.ok(!/popup\.print\(\)/.test(outside),
            'a popup.print() bypasses the fire-once guard');
        assert.ok(bare.includes('popup.print()'), 'firePrint no longer prints');
    });
});
