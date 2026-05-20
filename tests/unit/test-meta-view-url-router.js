/**
 * Unit tests for js/modules/meta-view/url-router.js.
 *
 * Verifies parseHash + buildHash round-trip across all the URL
 * shapes the segmented-control + drilldown can produce.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

global.window = global.window || /** @type {any} */ ({
    location: { href: 'http://localhost/', hash: '' },
    localStorage: {
        _store: {},
        getItem(k) { return this._store[k] ?? null; },
        setItem(k, v) { this._store[k] = String(v); },
        removeItem(k) { delete this._store[k]; },
    },
});

describe('parseHash', () => {
    it('returns null for unrelated hashes', async () => {
        const { parseHash } = await import('../../js/modules/meta-view/url-router.js');
        assert.equal(parseHash(''), null);
        assert.equal(parseHash('#cards'), null);
        assert.equal(parseHash('#profile'), null);
    });

    it('returns empty descriptor for bare #meta', async () => {
        const { parseHash } = await import('../../js/modules/meta-view/url-router.js');
        assert.deepEqual(parseHash('#meta'), { format: null, deck: null });
        assert.deepEqual(parseHash('#meta?'), { format: null, deck: null });
    });

    it('parses ?format=', async () => {
        const { parseHash } = await import('../../js/modules/meta-view/url-router.js');
        assert.deepEqual(parseHash('#meta?format=current'),     { format: 'current', deck: null });
        assert.deepEqual(parseHash('#meta?format=city-league'), { format: 'city-league', deck: null });
        assert.deepEqual(parseHash('#meta?format=past'),        { format: 'past', deck: null });
    });

    it('rejects unknown format values', async () => {
        const { parseHash } = await import('../../js/modules/meta-view/url-router.js');
        assert.deepEqual(parseHash('#meta?format=alpha-centauri'), { format: null, deck: null });
    });

    it('parses ?deck= with URL-decoded archetype', async () => {
        const { parseHash } = await import('../../js/modules/meta-view/url-router.js');
        assert.deepEqual(
            parseHash('#meta?format=current&deck=Charizard%20ex'),
            { format: 'current', deck: 'Charizard ex' }
        );
        assert.deepEqual(
            parseHash("#meta?deck=N%27s%20Zoroark"),
            { format: null, deck: "N's Zoroark" }
        );
    });
});

describe('buildHash', () => {
    it('default state returns bare #meta', async () => {
        const { buildHash } = await import('../../js/modules/meta-view/url-router.js');
        const s = { activeFormat: 'current', view: 'list', selectedDeck: null };
        assert.equal(buildHash(s), '#meta');
    });

    it('non-default format ends up in the query', async () => {
        const { buildHash } = await import('../../js/modules/meta-view/url-router.js');
        const s = { activeFormat: 'city-league', view: 'list', selectedDeck: null };
        assert.equal(buildHash(s), '#meta?format=city-league');
    });

    it('detail view + selected deck includes &deck=', async () => {
        const { buildHash } = await import('../../js/modules/meta-view/url-router.js');
        const s = {
            activeFormat: 'current',
            view: 'detail',
            selectedDeck: { archetype: "N's Zoroark", format: 'current' },
        };
        const got = buildHash(s);
        // URLSearchParams encodes apostrophe as %27 and space as +
        assert.ok(got.startsWith('#meta?'));
        assert.ok(got.includes('deck='));
    });

    it('list view drops deck param even when selectedDeck is non-null', async () => {
        const { buildHash } = await import('../../js/modules/meta-view/url-router.js');
        const s = {
            activeFormat: 'past',
            view: 'list',
            selectedDeck: { archetype: 'Pikachu', format: 'past' },
        };
        const got = buildHash(s);
        assert.equal(got, '#meta?format=past'); // no deck=
    });
});

describe('parseHash + buildHash round-trip', () => {
    it('preserves common state shapes', async () => {
        const { parseHash, buildHash } = await import('../../js/modules/meta-view/url-router.js');
        const cases = [
            { activeFormat: 'current', view: 'list', selectedDeck: null },
            { activeFormat: 'past', view: 'list', selectedDeck: null },
            { activeFormat: 'city-league', view: 'detail',
              selectedDeck: { archetype: 'Charizard ex', format: 'city-league' } },
        ];
        for (const state of cases) {
            const hash = buildHash(state);
            const parsed = parseHash(hash);
            assert.ok(parsed, 'hash should be parseable: ' + hash);
            // format=current is dropped in the URL but parse returns null
            // for the missing param — that's an asymmetry by design.
            const expectedFormat = state.activeFormat === 'current' ? null : state.activeFormat;
            assert.equal(parsed.format, expectedFormat);
            const expectedDeck = state.view === 'detail' ? state.selectedDeck.archetype : null;
            assert.equal(parsed.deck, expectedDeck);
        }
    });
});
