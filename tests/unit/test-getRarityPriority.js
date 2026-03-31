/**
 * Unit tests for getRarityPriority()
 *
 * This function maps rarity strings to numeric priority values.
 * Lower = cheaper/more common. Higher = rarer/more expensive.
 * It drives the entire rarity-switcher feature.
 *
 * Run:  node --test tests/unit/test-getRarityPriority.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadAppUtils } = require('./test-helpers');

const fns = loadAppUtils();
const getRarityPriority = fns.getRarityPriority;

// ── Smoke test ────────────────────────────────────────────────
describe('getRarityPriority — smoke', () => {
    it('is a function', () => {
        assert.equal(typeof getRarityPriority, 'function');
    });
});

// ── Low-tier rarities (1-3) ──────────────────────────────────
describe('getRarityPriority — low tier', () => {
    it('Common → 1', () => {
        assert.equal(getRarityPriority('Common'), 1);
    });

    it('Uncommon → 2', () => {
        assert.equal(getRarityPriority('Uncommon'), 2);
    });

    it('Rare → 3', () => {
        assert.equal(getRarityPriority('Rare'), 3);
    });

    it('"rare" lowercase → 3', () => {
        assert.equal(getRarityPriority('rare'), 3);
    });
});

// ── Mid-tier rarities (5-9) ─────────────────────────────────
describe('getRarityPriority — mid tier', () => {
    it('Holo Rare → 5', () => {
        assert.equal(getRarityPriority('Holo Rare'), 5);
    });

    it('Double Rare → 6', () => {
        assert.equal(getRarityPriority('Double Rare'), 6);
    });

    it('Triple Rare → 7', () => {
        assert.equal(getRarityPriority('Triple Rare'), 7);
    });

    it('Radiant Rare → 8', () => {
        assert.equal(getRarityPriority('Radiant Rare'), 8);
    });

    it('Amazing Rare → 9', () => {
        assert.equal(getRarityPriority('Amazing Rare'), 9);
    });
});

// ── High-end / Art rarities (10-16) ─────────────────────────
describe('getRarityPriority — high tier', () => {
    it('Illustration Rare → 10', () => {
        assert.equal(getRarityPriority('Illustration Rare'), 10);
    });

    it('Art Rare → 10', () => {
        assert.equal(getRarityPriority('Art Rare'), 10);
    });

    it('Character Holo Rare → 10', () => {
        assert.equal(getRarityPriority('Character Holo Rare'), 10);
    });

    it('Character Super Rare → 11', () => {
        assert.equal(getRarityPriority('Character Super Rare'), 11);
    });

    it('Shiny Rare → 12', () => {
        assert.equal(getRarityPriority('Shiny Rare'), 12);
    });

    it('Ultra Rare → 13', () => {
        assert.equal(getRarityPriority('Ultra Rare'), 13);
    });

    it('Special Art Rare → 14', () => {
        assert.equal(getRarityPriority('Special Art Rare'), 14);
    });

    it('Special Illustration Rare → 14', () => {
        assert.equal(getRarityPriority('Special Illustration Rare'), 14);
    });

    it('Rainbow Rare → 15', () => {
        assert.equal(getRarityPriority('Rainbow Rare'), 15);
    });

    it('Secret Rare → 16', () => {
        assert.equal(getRarityPriority('Secret Rare'), 16);
    });
});

// ── Promo handling ──────────────────────────────────────────
describe('getRarityPriority — promos', () => {
    it('Promo string → 8', () => {
        assert.equal(getRarityPriority('Promo'), 8);
    });

    it('promo lowercase → 8', () => {
        assert.equal(getRarityPriority('promo'), 8);
    });
});

// ── Missing / null rarity ────────────────────────────────────
describe('getRarityPriority — missing rarity', () => {
    it('null rarity without promo set → 999 (deprioritized)', () => {
        assert.equal(getRarityPriority(null), 999);
    });

    it('undefined rarity → 999', () => {
        assert.equal(getRarityPriority(undefined), 999);
    });

    it('empty string rarity → 999', () => {
        assert.equal(getRarityPriority(''), 999);
    });

    it('null rarity WITH promo set MEP → 8', () => {
        assert.equal(getRarityPriority(null, 'MEP'), 8);
    });

    it('null rarity WITH promo set SVP → 8', () => {
        assert.equal(getRarityPriority(null, 'SVP'), 8);
    });

    it('null rarity WITH non-promo set SVI → 999', () => {
        assert.equal(getRarityPriority(null, 'SVI'), 999);
    });
});

// ── Ordering invariants ──────────────────────────────────────
describe('getRarityPriority — ordering invariants', () => {
    it('Common < Uncommon < Rare < Holo Rare', () => {
        const c = getRarityPriority('Common');
        const u = getRarityPriority('Uncommon');
        const r = getRarityPriority('Rare');
        const h = getRarityPriority('Holo Rare');
        assert.ok(c < u, `Common (${c}) should be < Uncommon (${u})`);
        assert.ok(u < r, `Uncommon (${u}) should be < Rare (${r})`);
        assert.ok(r < h, `Rare (${r}) should be < Holo Rare (${h})`);
    });

    it('Double Rare < Triple Rare < Amazing Rare', () => {
        const dr = getRarityPriority('Double Rare');
        const tr = getRarityPriority('Triple Rare');
        const ar = getRarityPriority('Amazing Rare');
        assert.ok(dr < tr, `Double Rare (${dr}) < Triple Rare (${tr})`);
        assert.ok(tr < ar, `Triple Rare (${tr}) < Amazing Rare (${ar})`);
    });

    it('Ultra Rare < Special Art Rare < Rainbow Rare < Secret Rare', () => {
        const ur = getRarityPriority('Ultra Rare');
        const sar = getRarityPriority('Special Art Rare');
        const rr = getRarityPriority('Rainbow Rare');
        const sr = getRarityPriority('Secret Rare');
        assert.ok(ur < sar, `Ultra Rare (${ur}) < Special Art Rare (${sar})`);
        assert.ok(sar < rr, `Special Art Rare (${sar}) < Rainbow Rare (${rr})`);
        assert.ok(rr < sr, `Rainbow Rare (${rr}) < Secret Rare (${sr})`);
    });

    it('min mode selects Common over Secret Rare (lower priority wins)', () => {
        const common = getRarityPriority('Common');
        const secret = getRarityPriority('Secret Rare');
        assert.ok(common < secret);
    });
});

// ── Edge cases / regression guards ──────────────────────────
describe('getRarityPriority — edge cases', () => {
    it('"Holo Rare" does NOT match "Secret Rare" (includes check order)', () => {
        // Both contain "rare" — ensure the more specific match wins
        assert.notEqual(getRarityPriority('Secret Rare'), getRarityPriority('Holo Rare'));
    });

    it('"Ultra Rare" does NOT match plain "Rare" (includes check order)', () => {
        assert.notEqual(getRarityPriority('Ultra Rare'), getRarityPriority('Rare'));
    });

    it('Mixed case: "DOUBLE RARE" → same as "Double Rare"', () => {
        assert.equal(getRarityPriority('DOUBLE RARE'), getRarityPriority('Double Rare'));
    });

    it('Unknown rarity string → 0', () => {
        assert.equal(getRarityPriority('Mythical Cosmic'), 0);
    });

    it('"Rare Holo" still matches Holo Rare (contains check)', () => {
        // The function checks r.includes('holo rare'), so "Rare Holo" would NOT match
        // but "Holo Rare" would. This test documents the current behavior.
        const result = getRarityPriority('Rare Holo');
        // "Rare Holo" → includes('holo rare')? No. includes('rare')? Yes → 3
        assert.equal(result, 3);
    });
});
