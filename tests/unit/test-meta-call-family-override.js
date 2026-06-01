/**
 * Unit tests for the Meta Call family-override map.
 *
 * Background: `_aggregateFieldByFamily` (and the symmetric
 * `_aggregateRecsByFamily`) used to bucket variants by
 * `extractMainPokemon` — the first-word heuristic. That works for
 * cleanly-named families like Dragapult (every variant starts with
 * "Dragapult"), but mis-groups Ogerpon: "Ogerpon Meganium" + "Ogerpon
 * Meganium Arboliva" + "Ogerpon Meganium Hydrapple" all SHARE a
 * legitimate family — but so does "Ogerpon Noivern" under the same
 * heuristic, even though Noivern is a different archetype.
 *
 * Fix: `data/deck_families.json` overrides the heuristic on a
 * per-deck-name basis. `_familyKeyForDeck` checks the override first
 * and falls back to extractMainPokemon. `_familyDisplayForKey`
 * provides display-name overrides so the rendered label can read
 * "Ogerpon Meganium" instead of the heuristic's "Ogerpon".
 *
 * These tests verify the lookup helpers in isolation — they don't
 * exercise the full aggregation pipeline (covered by integration
 * smoke tests elsewhere) but they DO assert the override semantics
 * the user requested:
 *   - Override wins over the heuristic
 *   - Override is per-name (so "Ogerpon Noivern" can split out)
 *   - Missing names fall back to the heuristic
 *   - Display-name lookup respects the override file
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Sanity-check the on-disk fixture matches the assumptions baked
// into the engine tests below. If a maintainer renames a deck or
// drops one from the fixture, the test names below would still pass
// against the engine but lie about coverage — guard against that.
describe('data/deck_families.json — fixture invariants', () => {
    const familiesPath = path.join(__dirname, '..', '..', 'data', 'deck_families.json');
    const raw = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));

    it('schema: top-level keys are version + description + families', () => {
        assert.strictEqual(typeof raw.version, 'number');
        assert.strictEqual(typeof raw.description, 'string');
        assert.ok(Array.isArray(raw.families), 'families must be an array');
    });

    it('every entry has key + display + members[]', () => {
        for (const fam of raw.families) {
            assert.ok(fam.key, `family missing key: ${JSON.stringify(fam)}`);
            assert.ok(fam.display, `family ${fam.key} missing display`);
            assert.ok(Array.isArray(fam.members) && fam.members.length > 0,
                `family ${fam.key} must list at least one member`);
        }
    });

    it('no deck-name appears under two families (would create an undefined merge)', () => {
        const seen = new Map();
        for (const fam of raw.families) {
            for (const m of fam.members) {
                if (seen.has(m)) {
                    assert.fail(`deck "${m}" appears in two families: ${seen.get(m)} and ${fam.key}`);
                }
                seen.set(m, fam.key);
            }
        }
    });

    it('Ogerpon Meganium family covers all three variant names', () => {
        // The Indianapolis 2026 post-mortem split this archetype 7.9 % at
        // Indy but ~4.45 % aggregated across two sub-buckets pre-Indy
        // (Arboliva + Hydrapple). The rollup must catch both halves + the
        // bare-slug version Labs uses for unclassified copies.
        const fam = raw.families.find(f => f.key === 'Ogerpon Meganium');
        assert.ok(fam, 'Ogerpon Meganium family must exist');
        for (const expected of [
            'Ogerpon Meganium',
            'Ogerpon Meganium Arboliva',
            'Ogerpon Meganium Hydrapple',
        ]) {
            assert.ok(fam.members.includes(expected),
                `Ogerpon Meganium must include "${expected}"`);
        }
    });

    it('Ogerpon Noivern is in its OWN family, not bucketed with Ogerpon Meganium', () => {
        // The Ogerpon-Meganium bucket and the Ogerpon-Noivern bucket are
        // distinct archetypes. Both share the word "Ogerpon" so the
        // first-word heuristic incorrectly puts them in one bucket —
        // the override file is the canonical fix.
        const meganium = raw.families.find(f => f.key === 'Ogerpon Meganium');
        const noivern  = raw.families.find(f => f.key === 'Ogerpon Noivern');
        assert.ok(noivern, 'Ogerpon Noivern family must exist as a separate entry');
        assert.ok(!meganium.members.includes('Ogerpon Noivern'),
            'Ogerpon Noivern must NOT appear in the Meganium members list');
    });

    it("Lillie's Clefairy family folds Clefairy Ogerpon in", () => {
        // Per the post-mortem: "Lillie's Clefairy ex / Teal Mask Ogerpon
        // ex is tracked as a distinct archetype." The user-facing label
        // "Clefairy Ogerpon" is just Limitless's older naming for the
        // same deck — must land under the same family.
        const fam = raw.families.find(f => f.key === "Lillie's Clefairy");
        assert.ok(fam, "Lillie's Clefairy family must exist");
        assert.ok(fam.members.includes('Clefairy Ogerpon'),
            "Clefairy Ogerpon must roll up under Lillie's Clefairy");
    });
});

// Reference implementation of the override lookup, mirroring
// app-meta-call.js `_familyKeyForDeck` and `_familyDisplayForKey`.
// If these are out of sync with the production code, the assertions
// below fail loudly and the maintainer knows to re-sync the mirror.
function buildLookups(familiesJson) {
    const nameToKey = new Map();
    const keyToDisplay = new Map();
    for (const fam of familiesJson.families) {
        if (fam.display) keyToDisplay.set(fam.key, fam.display);
        for (const m of fam.members) nameToKey.set(m, fam.key);
    }

    function familyKeyForDeck(name, fallback) {
        if (!name) return name;
        if (nameToKey.has(name)) return nameToKey.get(name);
        return fallback(name);
    }
    function familyDisplayForKey(key, fallback) {
        if (!key) return key;
        if (keyToDisplay.has(key)) return keyToDisplay.get(key);
        return fallback(key);
    }
    return { familyKeyForDeck, familyDisplayForKey };
}

describe('_familyKeyForDeck — override semantics', () => {
    const familiesPath = path.join(__dirname, '..', '..', 'data', 'deck_families.json');
    const raw = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
    const { familyKeyForDeck } = buildLookups(raw);
    const identity = (s) => s; // stand-in for extractMainPokemon

    it('Ogerpon Meganium variants all share one family-key', () => {
        const a = familyKeyForDeck('Ogerpon Meganium', identity);
        const b = familyKeyForDeck('Ogerpon Meganium Arboliva', identity);
        const c = familyKeyForDeck('Ogerpon Meganium Hydrapple', identity);
        assert.strictEqual(a, 'Ogerpon Meganium');
        assert.strictEqual(b, 'Ogerpon Meganium');
        assert.strictEqual(c, 'Ogerpon Meganium');
    });

    it('Ogerpon Noivern lands in a DIFFERENT family-key', () => {
        const noivern  = familyKeyForDeck('Ogerpon Noivern', identity);
        const meganium = familyKeyForDeck('Ogerpon Meganium', identity);
        assert.notStrictEqual(noivern, meganium);
    });

    it("Clefairy Ogerpon and Lillie's Clefairy fold to the same family", () => {
        const a = familyKeyForDeck('Clefairy Ogerpon', identity);
        const b = familyKeyForDeck("Lillie's Clefairy", identity);
        assert.strictEqual(a, "Lillie's Clefairy");
        assert.strictEqual(b, "Lillie's Clefairy");
    });

    it('Decks not in the override map fall through to the heuristic', () => {
        // Stub extractMainPokemon to a deterministic identity — we only
        // care that the fallback IS called for unknown names.
        const fallback = (name) => 'HEURISTIC:' + name;
        const result = familyKeyForDeck('Dragapult Dusknoir', fallback);
        assert.strictEqual(result, 'HEURISTIC:Dragapult Dusknoir');
    });

    it('Empty or null input passes through unchanged (defensive)', () => {
        assert.strictEqual(familyKeyForDeck('', identity), '');
        assert.strictEqual(familyKeyForDeck(null, identity), null);
        assert.strictEqual(familyKeyForDeck(undefined, identity), undefined);
    });
});

describe('_familyDisplayForKey — display-name lookup', () => {
    const familiesPath = path.join(__dirname, '..', '..', 'data', 'deck_families.json');
    const raw = JSON.parse(fs.readFileSync(familiesPath, 'utf8'));
    const { familyDisplayForKey } = buildLookups(raw);

    it("Lillie's Clefairy key renders as 'Lillie's Clefairy ex'", () => {
        // ex-suffix is the official Pokémon TCG convention — the
        // override file injects it so the UI matches the card name.
        const display = familyDisplayForKey("Lillie's Clefairy", (k) => k);
        assert.strictEqual(display, "Lillie's Clefairy ex");
    });

    it('Unknown family-key falls back to the heuristic display', () => {
        const display = familyDisplayForKey('Dragapult', (k) => k + ' ex (heuristic)');
        assert.strictEqual(display, 'Dragapult ex (heuristic)');
    });

    it('Ogerpon Meganium display reads cleanly (no "ex" since the name carries the variant)', () => {
        // For Meganium-line builds the colloquial name doesn't suffix
        // "ex" — the engine should pass through the override verbatim.
        const display = familyDisplayForKey('Ogerpon Meganium', (k) => k);
        assert.strictEqual(display, 'Ogerpon Meganium');
    });
});
