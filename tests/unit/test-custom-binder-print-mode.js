/**
 * Custom Binder "Druckliste" mode (proxy print status) — MVP.
 *
 * Decisions under test (from the 4-round feature review + user answers):
 * - printed is GLOBAL per card (the proxy physically exists in the box),
 *   family-aware (any print of the card counts), stored as an ARRAY
 *   (dotted card names + Firestore field paths) in a users/{uid}/binders
 *   subcollection doc — never on the shared root doc.
 * - threshold is a parameter now (0 / 30 / 70), ACE SPECs bypass it as a
 *   FLOOR (a top-3 cap would have removed 10 cards incl. 100%-usage ones).
 * - basic energies are hidden by default in print mode (nobody proxies
 *   them) but reachable via the explicit type filter.
 * - bulk mark runs on the PRE-expansion filtered list (the All-Prints
 *   expansion invents per-print ids that are not binder entries).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CB = fs.readFileSync(path.join(ROOT, 'js', 'custom-binder.js'), 'utf8');
const MB = fs.readFileSync(path.join(ROOT, 'js', 'meta-binder.js'), 'utf8');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const I18N = fs.readFileSync(path.join(ROOT, 'js', 'i18n.js'), 'utf8');

function extract(name) {
    const re = new RegExp('    function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n    \\}\\n');
    const m = CB.match(re);
    if (!m) throw new Error('could not extract ' + name);
    return m[0];
}

// Shared stub matching the real _mbShared contract for these helpers.
const sharedStub = {
    parseIntlPrintRef: (ref) => {
        const i = String(ref).indexOf('-');
        return i < 0 ? { set: '', number: '' }
            : { set: ref.slice(0, i), number: ref.slice(i + 1) };
    },
    buildCardId: (name, set, number) => `${String(name).toLowerCase()}|${set}|${number}`,
    getMetaBinderTypeMeta: (card) => ({ type: card.type || '', supertype: '', isAceSpec: !!card.isAceSpec }),
};

function makePrintedApi(printedIds) {
    const src = extract('cbPrintedIdsForCard') + extract('cbIsPrinted');
    const ns = {};
    new Function('mb', '_cbPrintedSet', 'exports',
        src + 'exports.isPrinted = cbIsPrinted; exports.idsFor = cbPrintedIdsForCard;')(
        () => sharedStub, new Set(printedIds), ns);
    return ns;
}

describe('print status is family-aware and global per card', () => {
    const card = {
        cardId: 'munkidori|TWM|95', name: 'Munkidori',
        familyRefs: ['TWM-95', 'PRE-44'],
    };

    it('exact print marked → printed', () => {
        assert.equal(makePrintedApi(['munkidori|TWM|95']).isPrinted(card), true);
    });

    it('another print of the same card marked → still printed (same paper in the box)', () => {
        assert.equal(makePrintedApi(['munkidori|PRE|44']).isPrinted(card), true);
    });

    it('unmarked card → not printed', () => {
        assert.equal(makePrintedApi(['other|X|1']).isPrinted(card), false);
    });

    it('toggle-off removes the whole family, not just the shown print', () => {
        assert.ok(/cbPrintedIdsForCard\(card\)\.forEach\(id => _cbPrintedSet\.delete\(id\)\)/.test(CB),
            'un-marking must clear all family ids or the card stays printed via a sibling print');
    });
});

describe('print-mode filtering', () => {
    function runFilter({ mode, filter, delta, typeFilterValue }) {
        const src = extract('cbPrintedIdsForCard') + extract('cbIsPrinted') + extract('cbComputeFilteredCards');
        const documentStub = {
            getElementById: (id) => (id === 'cbFilterType' && typeFilterValue ? { value: typeFilterValue } : null),
        };
        const windowStub = { _cbDelta: delta };
        const ns = {};
        new Function('mb', '_cbPrintedSet', 'cbMode', 'cbFilter', 'document', 'window', 'exports',
            src + 'exports.run = cbComputeFilteredCards;')(
            () => sharedStub, new Set(['battle cage|PBL|85']), mode, filter, documentStub, windowStub, ns);
        return ns.run();
    }

    const delta = { cards: [
        { cardId: 'battle cage|PBL|85', name: 'Battle Cage', type: 'Stadium', familyRefs: [] },
        { cardId: 'toucannon|PBL|120', name: 'Toucannon', type: 'Pokemon-Colorless', familyRefs: [] },
        { cardId: 'psychic energy|SVE|13', name: 'Psychic Energy', type: 'Basic Energy', familyRefs: [] },
    ] };

    it('basic energies are hidden by default in print mode', () => {
        const names = runFilter({ mode: 'print', filter: 'all', delta }).map(c => c.name);
        assert.ok(!names.includes('Psychic Energy'), 'nobody proxies basic energy — default noise');
        assert.deepEqual(names, ['Battle Cage', 'Toucannon']);
    });

    it('the explicit type filter still shows basic energies', () => {
        const names = runFilter({ mode: 'print', filter: 'all', delta, typeFilterValue: 'Basic Energy' }).map(c => c.name);
        assert.deepEqual(names, ['Psychic Energy']);
    });

    it('collection mode is unchanged — energies stay visible', () => {
        const names = runFilter({ mode: 'collection', filter: 'all', delta }).map(c => c.name);
        assert.ok(names.includes('Psychic Energy'));
    });

    it('toprint / printed chips split on the print status', () => {
        assert.deepEqual(runFilter({ mode: 'print', filter: 'printed', delta }).map(c => c.name), ['Battle Cage']);
        assert.deepEqual(runFilter({ mode: 'print', filter: 'toprint', delta }).map(c => c.name), ['Toucannon']);
    });
});

describe('persistence shape', () => {
    it('printed status lives in a binders subcollection doc as an ARRAY via set()', () => {
        assert.ok(/collection\('binders'\)[\s\S]{0,80}doc\('printedProxies'\)[\s\S]{0,120}\.set\(\{ entries: Array\.from\(_cbPrintedSet\)/.test(CB),
            'printed status must be entries-array + set() on users/{uid}/binders/printedProxies — ' +
            'never a map field (dotted card names become field paths) and never the shared root doc');
        assert.ok(!/binders'\)[\s\S]{0,200}\.update\(/.test(CB),
            'update() with card-derived keys is the documented dotted-name hazard');
    });

    it('guest mirror uses localStorage under printedProxiesV1', () => {
        assert.ok(/printedProxiesV1/.test(CB));
    });

    it('a remote doc is authoritative — no blind merge with the local mirror', () => {
        assert.ok(/doc\.exists/.test(CB) && /entries === null/.test(CB),
            'merging mirror into remote would resurrect un-marked cards from stale devices');
    });

    it('an account switch drops the cached set and blocks cross-account writes', () => {
        // Sign out as A, sign in as B: A's memoised set must neither display
        // for B nor be written into B's Firestore doc.
        assert.ok(/_cbPrintedSet && _cbPrintedOwner !== uid/.test(CB),
            'load path no longer invalidates the cache on account change');
        assert.ok(/if \(uid !== _cbPrintedOwner\) \{[\s\S]{0,400}?return;/.test(CB),
            'persist path no longer refuses writes for a changed account');
    });

    it('a failed remote READ blocks the Firestore write (mirror must not clobber the server)', () => {
        assert.ok(/_cbPrintedRemoteOk = true/.test(CB) && /if \(!_cbPrintedRemoteOk\)/.test(CB),
            'a read error would silently promote the (possibly empty) local mirror ' +
            'and the next toggle full-doc-set()s it over good server data');
        assert.ok(/printedSyncOffline/.test(CB), 'the degraded state must be surfaced, not silent');
    });

    it('the debounced write flushes on pagehide/visibility-hidden', () => {
        assert.ok(/pagehide/.test(CB) && /visibilitychange/.test(CB) && /cbFlushPrintedSet/.test(CB),
            'closing the tab inside the debounce window silently reverts the last marks');
    });

    it('a rejected load does not poison the session (finally resets the promise)', () => {
        assert.ok(/\.finally\(\(\) => \{ _cbPrintedLoadPromise = null; \}\)/.test(CB));
    });
});

describe('threshold + ACE floor', () => {
    it('collectBinderCards takes options.thresholdPercent (default 70, clamped)', () => {
        assert.ok(/function collectBinderCards\(targetArchetypes, options\)/.test(MB));
        assert.ok(/options\.thresholdPercent/.test(MB));
        assert.ok(/Math\.max\(0, Math\.min\(100, _optThreshold\)\)/.test(MB));
    });

    it('the Custom Binder passes the user-selected threshold', () => {
        assert.ok(/collectBinderCards\(sourceTargets, \{ thresholdPercent: cbThreshold \}\)/.test(CB));
    });

    it('ACE SPECs still bypass the threshold entirely (floor, not a top-3 cap)', () => {
        assert.ok(/if \(!isAceSpec && usagePercent < thresholdPercent\) return;/.test(MB),
            'the ACE bypass moved — a cap here is a data-loss regression (13 → 3 prints)');
    });
});

describe('review-fix wiring', () => {
    it('"Ungedruckte → Druckliste" awaits the printed set (no queue flood mid-load)', () => {
        const m = CB.match(/async function cbSendUnprintedToProxy\(\)[\s\S]{0,400}/);
        assert.ok(m && m[0].includes('await cbLoadPrintedSet()'),
            'without the await, every card counts as unprinted during the Firestore round-trip');
    });

    it('the V2 baseline stores threshold + familyRefs and rejects cross-threshold diffs', () => {
        assert.ok(/threshold: cbThreshold/.test(CB), 'cache no longer records its threshold');
        assert.ok(/cachedV2\.threshold === undefined \|\| cachedV2\.threshold === cbThreshold/.test(CB),
            'a 70%-baseline diffed against an all-cards binder flags hundreds of false "new" cards');
        assert.ok(/familyRefs: Array\.isArray\(c\.familyRefs\) \? c\.familyRefs : \[\]/.test(CB),
            'without familyRefs the proxy-tab entry answers "printed?" differently from the grid');
    });

    it('toggling and bulk-marking also refresh the chip counts', () => {
        assert.ok(/function cbUpdatePrintChipCounts\(\)/.test(CB));
        const toggles = CB.match(/cbUpdatePrintChipCounts\(\);/g) || [];
        assert.ok(toggles.length >= 2, 'chip counts must update on single toggle AND bulk mark');
    });

    it('cbSetFilter leaves buttons without data-filter alone (Standard/All Prints)', () => {
        const m = CB.match(/function cbSetFilter\(filter\)[\s\S]*?\n    \}\n/);
        assert.ok(m && m[0].includes('if (!btn.dataset.filter) return;'));
    });

    it('changing the threshold with a binder on screen regenerates it', () => {
        const m = CB.match(/function cbSetThreshold\(value\)[\s\S]*?\n    \}\n/);
        assert.ok(m && m[0].includes('buildCustomBinder()'),
            'a segment that changes nothing until the next Generate press reads as broken');
    });

    it('one dropped-modal renderer: CB delegates to the Meta Binder modal with an override', () => {
        assert.ok(/function openMetaBinderDroppedModal\(cardsOverride\)/.test(MB));
        const m = CB.match(/function cbOpenDroppedModal\(\)[\s\S]*?\n    \}\n/);
        assert.ok(m && m[0].includes('window.openMetaBinderDroppedModal(') && m[0].length < 400,
            'cbOpenDroppedModal grew its own copy of the renderer again — two copies will drift');
    });
});

describe('bulk actions & wiring', () => {
    it('bulk mark uses the PRE-expansion filtered list', () => {
        const m = CB.match(/function cbMarkFilteredPrinted\(\)[\s\S]*?\n    \}\n/);
        assert.ok(m && m[0].includes('cbComputeFilteredCards()'),
            'bulk mark over the expanded per-print list writes ids that are not binder entries');
    });

    it('ownership refresh cannot repaint the print-mode grid in the wrong axis', () => {
        const m = CB.match(/function refreshCustomBinderOwnership\(\)[\s\S]{0,400}/);
        assert.ok(m && m[0].includes("if (cbMode === 'print') return;"));
    });

    it('index.html carries the mode segment, threshold segment and new actions', () => {
        for (const needle of ['cbModeSegment', 'cbThresholdSegment', 'cbSendUnprinted',
            'cbBulkMarkPrinted', 'cbTopMetaBtn', 'proxyLoadBinderBtn']) {
            assert.ok(HTML.includes(needle), `index.html missing ${needle}`);
        }
    });

    it('every new i18n key exists in BOTH language blocks', () => {
        const keys = ['cb.modeCollection', 'cb.modePrint', 'cb.thresholdAll', 'cb.thresholdTech',
            'cb.thresholdCore', 'cb.filterToPrint', 'cb.filterPrinted', 'cb.filterDropped',
            'cb.printedBadge', 'cb.toPrintBadge', 'cb.sendUnprinted', 'cb.bulkMark',
            'cb.allPrinted', 'cb.noBinderSaved', 'cb.binderProxyLoaded', 'proxy.loadBinder'];
        for (const key of keys) {
            const hits = I18N.split(`'${key}'`).length - 1;
            assert.ok(hits >= 2, `i18n key ${key} present ${hits}x — needs en AND de`);
        }
    });
});
