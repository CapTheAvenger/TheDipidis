/**
 * Unit tests for utility functions from app-utils.js that were not covered
 * by the initial P0-P3 test rounds. Covers: safeParseFloat, hasMojibake,
 * escapeHtmlAttr, escapeJsStr, getDisplayCardName, getCanonicalDeckKey,
 * getSafeCardIdentityName, isRadiantPokemon, isPrismStarCard,
 * getDeckCopiesForCardName, getTotalAceSpecCopiesInDeck, getTotalRadiantCopiesInDeck,
 * getLegalMaxCopies, getOpeningHandProbability, getRarityAbbreviation,
 * buildCityLeaguePlacementStatsMap, enrichCityLeagueDataWithPlacementStats
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { loadAppUtils } = require('./test-helpers');

const fns = loadAppUtils();

// ── safeParseFloat ──────────────────────────────────────────────────────────
describe('safeParseFloat — basic parsing', () => {
    it('parses integer', () => {
        assert.equal(fns.safeParseFloat(42), 42);
    });
    it('parses float', () => {
        assert.equal(fns.safeParseFloat(3.14), 3.14);
    });
    it('parses string float', () => {
        assert.equal(fns.safeParseFloat('2.5'), 2.5);
    });
    it('parses European comma decimal', () => {
        assert.equal(fns.safeParseFloat('2,5'), 2.5);
    });
    it('returns fallback for NaN string', () => {
        assert.equal(fns.safeParseFloat('abc', 99), 99);
    });
    it('returns fallback for null', () => {
        assert.equal(fns.safeParseFloat(null, 7), 7);
    });
    it('returns fallback for undefined', () => {
        assert.equal(fns.safeParseFloat(undefined, 5), 5);
    });
    it('returns 0 as default fallback', () => {
        assert.equal(fns.safeParseFloat('xyz'), 0);
    });
    it('handles Infinity → returns fallback', () => {
        assert.equal(fns.safeParseFloat(Infinity, 0), 0);
    });
    it('handles -Infinity → returns fallback', () => {
        assert.equal(fns.safeParseFloat(-Infinity, 0), 0);
    });
    it('handles empty string → returns fallback', () => {
        assert.equal(fns.safeParseFloat('', 1), 1);
    });
});

// ── hasMojibake ─────────────────────────────────────────────────────────────
describe('hasMojibake — detection', () => {
    it('detects Ã (common mojibake marker)', () => {
        assert.equal(fns.hasMojibake('PokÃ©mon'), true);
    });
    it('detects Â (stray byte)', () => {
        assert.equal(fns.hasMojibake('Â test'), true);
    });
    it('detects â (smart quote mojibake)', () => {
        assert.equal(fns.hasMojibake('â€™'), true);
    });
    it('returns false for clean ASCII', () => {
        assert.equal(fns.hasMojibake('Charizard ex'), false);
    });
    it('returns false for clean Unicode (é, ü)', () => {
        assert.equal(fns.hasMojibake('Pokémon'), false);
    });
    it('handles null', () => {
        assert.equal(fns.hasMojibake(null), false);
    });
    it('handles undefined', () => {
        assert.equal(fns.hasMojibake(undefined), false);
    });
    it('handles empty string', () => {
        assert.equal(fns.hasMojibake(''), false);
    });
});

// ── escapeHtmlAttr ──────────────────────────────────────────────────────────
describe('escapeHtmlAttr — XSS prevention', () => {
    it('escapes ampersand', () => {
        assert.equal(fns.escapeHtmlAttr('A & B'), 'A &amp; B');
    });
    it('escapes less-than', () => {
        assert.equal(fns.escapeHtmlAttr('<script>'), '&lt;script&gt;');
    });
    it('escapes double quote', () => {
        assert.equal(fns.escapeHtmlAttr('"hello"'), '&quot;hello&quot;');
    });
    it('escapes single quote', () => {
        assert.equal(fns.escapeHtmlAttr("it's"), 'it&#39;s');
    });
    it('passes clean text through', () => {
        assert.equal(fns.escapeHtmlAttr('Charizard ex'), 'Charizard ex');
    });
    it('handles null → empty string', () => {
        assert.equal(fns.escapeHtmlAttr(null), '');
    });
    it('handles undefined → empty string', () => {
        assert.equal(fns.escapeHtmlAttr(undefined), '');
    });
    it('escapes all dangerous chars in one string', () => {
        assert.equal(fns.escapeHtmlAttr('<img onerror="alert(\'xss\')">'),
            '&lt;img onerror=&quot;alert(&#39;xss&#39;)&quot;&gt;');
    });
});

// ── escapeJsStr ─────────────────────────────────────────────────────────────
describe('escapeJsStr — JS string escaping', () => {
    it('escapes backslash', () => {
        assert.equal(fns.escapeJsStr('a\\b'), 'a\\\\b');
    });
    it('escapes single quote', () => {
        assert.equal(fns.escapeJsStr("it's"), "it\\'s");
    });
    it('escapes double quote', () => {
        assert.equal(fns.escapeJsStr('say "hi"'), 'say \\"hi\\"');
    });
    it('escapes newline', () => {
        assert.equal(fns.escapeJsStr('line1\nline2'), 'line1\\nline2');
    });
    it('escapes carriage return', () => {
        assert.equal(fns.escapeJsStr('a\rb'), 'a\\rb');
    });
    it('handles null → empty string', () => {
        assert.equal(fns.escapeJsStr(null), '');
    });
    it('passes clean text through', () => {
        assert.equal(fns.escapeJsStr('Pikachu'), 'Pikachu');
    });
});

// ── getDisplayCardName ──────────────────────────────────────────────────────
describe('getDisplayCardName — name resolution', () => {
    it('returns repaired name for mojibake input', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => ({ name_en: 'Pokémon Catcher' }),
        });
        assert.equal(fn.getDisplayCardName('PokÃ©mon Catcher'), 'Pokémon Catcher');
    });
    it('returns clean name as-is when no mojibake', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        assert.equal(fn.getDisplayCardName('Charizard ex'), 'Charizard ex');
    });
    it('returns "Unknown Card" for null/empty', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        assert.equal(fn.getDisplayCardName(null), 'Unknown Card');
    });
    it('prefers canonical name when input has mojibake', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => ({ name_en: 'Nézha' }),
        });
        assert.equal(fn.getDisplayCardName('NÃ©zha', 'ABC', '123'), 'Nézha');
    });
});

// ── getCanonicalDeckKey ─────────────────────────────────────────────────────
describe('getCanonicalDeckKey — key generation', () => {
    it('creates "Name (SET NUM)" format when set+number provided', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const key = fn.getCanonicalDeckKey('Pikachu', 'SVI', '025');
        assert.equal(key, 'Pikachu (SVI 025)');
    });
    it('returns just the name when no set/number', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const key = fn.getCanonicalDeckKey('Boss\'s Orders', '', '');
        assert.equal(key, "Boss's Orders");
    });
    it('handles null set and number', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const key = fn.getCanonicalDeckKey('Nest Ball', null, null);
        assert.equal(key, 'Nest Ball');
    });
    it('uppercases set code', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const key = fn.getCanonicalDeckKey('Arven', 'svi', '166');
        assert.equal(key, 'Arven (SVI 166)');
    });
    it('handles null card name', () => {
        const fn = loadAppUtils({
            getCanonicalCardRecord: () => null,
        });
        const key = fn.getCanonicalDeckKey(null, 'SVI', '1');
        assert.equal(key, 'Unknown Card (SVI 1)');
    });
});

// ── getSafeCardIdentityName ─────────────────────────────────────────────────
describe('getSafeCardIdentityName — identity extraction', () => {
    it('strips "(SVI 123)" suffix', () => {
        assert.equal(fns.getSafeCardIdentityName('Pikachu (SVI 123)'), 'Pikachu');
    });
    it('strips trailing "SVI 123"', () => {
        assert.equal(fns.getSafeCardIdentityName('Pikachu SVI 123'), 'Pikachu');
    });
    it('preserves "ex" suffix', () => {
        assert.equal(fns.getSafeCardIdentityName('Charizard ex (MEG 006)'), 'Charizard ex');
    });
    it('preserves "VMAX" suffix', () => {
        assert.equal(fns.getSafeCardIdentityName('Eternatus VMAX'), 'Eternatus VMAX');
    });
    it('returns empty for null', () => {
        assert.equal(fns.getSafeCardIdentityName(null), '');
    });
    it('returns empty for empty string', () => {
        assert.equal(fns.getSafeCardIdentityName(''), '');
    });
    it('handles name with no set info', () => {
        assert.equal(fns.getSafeCardIdentityName('Rare Candy'), 'Rare Candy');
    });
});

// ── isRadiantPokemon ────────────────────────────────────────────────────────
describe('isRadiantPokemon — classifier', () => {
    it('recognizes "Radiant Charizard"', () => {
        assert.equal(fns.isRadiantPokemon('Radiant Charizard'), true);
    });
    it('recognizes case-insensitive "radiant greninja"', () => {
        assert.equal(fns.isRadiantPokemon('radiant greninja'), true);
    });
    it('rejects non-radiant Pokemon', () => {
        assert.equal(fns.isRadiantPokemon('Charizard ex'), false);
    });
    it('rejects "Radiance" (partial match)', () => {
        assert.equal(fns.isRadiantPokemon('Radiance'), false);
    });
    it('handles null', () => {
        assert.equal(fns.isRadiantPokemon(null), false);
    });
    it('handles empty string', () => {
        assert.equal(fns.isRadiantPokemon(''), false);
    });
});

// ── isPrismStarCard ─────────────────────────────────────────────────────────
describe('isPrismStarCard — classifier', () => {
    it('recognizes ◇ symbol', () => {
        assert.equal(fns.isPrismStarCard('Ditto ◇'), true);
    });
    it('recognizes "Prism Star" text', () => {
        assert.equal(fns.isPrismStarCard('Ditto Prism Star'), true);
    });
    it('recognizes case-insensitive "prism star"', () => {
        assert.equal(fns.isPrismStarCard('Cyrus PRISM STAR'), true);
    });
    it('rejects normal cards', () => {
        assert.equal(fns.isPrismStarCard('Charizard ex'), false);
    });
    it('handles null', () => {
        assert.equal(fns.isPrismStarCard(null), false);
    });
});

// ── getDeckCopiesForCardName ────────────────────────────────────────────────
describe('getDeckCopiesForCardName — deck counting', () => {
    it('counts copies by card name ignoring set info', () => {
        const deck = {
            'Pikachu (SVI 025)': 3,
            'Pikachu (MEW 025)': 1,
            'Charizard ex (MEG 006)': 2,
        };
        assert.equal(fns.getDeckCopiesForCardName(deck, 'Pikachu'), 4);
    });
    it('counts exact match', () => {
        const deck = { 'Boss\'s Orders': 3 };
        assert.equal(fns.getDeckCopiesForCardName(deck, 'Boss\'s Orders'), 3);
    });
    it('returns 0 for card not in deck', () => {
        const deck = { 'Pikachu (SVI 025)': 2 };
        assert.equal(fns.getDeckCopiesForCardName(deck, 'Charizard'), 0);
    });
    it('returns 0 for null deck', () => {
        assert.equal(fns.getDeckCopiesForCardName(null, 'Pikachu'), 0);
    });
    it('returns 0 for empty card name', () => {
        const deck = { 'Pikachu (SVI 025)': 2 };
        assert.equal(fns.getDeckCopiesForCardName(deck, ''), 0);
    });
    it('returns 0 for null card name', () => {
        assert.equal(fns.getDeckCopiesForCardName({}, null), 0);
    });
});

// ── getTotalAceSpecCopiesInDeck ─────────────────────────────────────────────
describe('getTotalAceSpecCopiesInDeck — ace spec counting', () => {
    it('counts ace spec cards in deck', () => {
        const deck = {
            'Prime Catcher (SVI 100)': 1,
            'Pikachu (SVI 025)': 3,
        };
        assert.equal(fns.getTotalAceSpecCopiesInDeck(deck), 1);
    });
    it('returns 0 when no ace specs', () => {
        const deck = { 'Pikachu (SVI 025)': 3 };
        assert.equal(fns.getTotalAceSpecCopiesInDeck(deck), 0);
    });
    it('returns 0 for null deck', () => {
        assert.equal(fns.getTotalAceSpecCopiesInDeck(null), 0);
    });
    it('returns 0 for empty deck', () => {
        assert.equal(fns.getTotalAceSpecCopiesInDeck({}), 0);
    });
});

// ── getTotalRadiantCopiesInDeck ─────────────────────────────────────────────
describe('getTotalRadiantCopiesInDeck — radiant counting', () => {
    it('counts radiant cards', () => {
        const deck = {
            'Radiant Charizard (PGO 011)': 1,
            'Pikachu (SVI 025)': 3,
        };
        assert.equal(fns.getTotalRadiantCopiesInDeck(deck), 1);
    });
    it('returns 0 when no radiant', () => {
        const deck = { 'Pikachu': 4 };
        assert.equal(fns.getTotalRadiantCopiesInDeck(deck), 0);
    });
    it('returns 0 for null', () => {
        assert.equal(fns.getTotalRadiantCopiesInDeck(null), 0);
    });
});

// ── getLegalMaxCopies ───────────────────────────────────────────────────────
describe('getLegalMaxCopies — deck rules', () => {
    it('returns 4 for normal Pokemon', () => {
        assert.equal(fns.getLegalMaxCopies('Pikachu'), 4);
    });
    it('returns 59 for basic energy', () => {
        assert.equal(fns.getLegalMaxCopies('Fire Energy', { card_name: 'Fire Energy', name: 'Fire Energy' }), 59);
    });
    it('returns 1 for Ace Spec card', () => {
        assert.equal(fns.getLegalMaxCopies('Prime Catcher'), 1);
    });
    it('returns 1 for Radiant Pokemon', () => {
        assert.equal(fns.getLegalMaxCopies('Radiant Charizard'), 1);
    });
    it('returns 1 for Prism Star card', () => {
        assert.equal(fns.getLegalMaxCopies('Ditto ◇'), 1);
    });
    it('returns 4 for empty string', () => {
        assert.equal(fns.getLegalMaxCopies(''), 4);
    });
    it('returns 4 for null (with empty fallback)', () => {
        assert.equal(fns.getLegalMaxCopies(null), 4);
    });
});

// ── getOpeningHandProbability ────────────────────────────────────────────────
describe('getOpeningHandProbability — math', () => {
    it('returns 0 for 0 copies', () => {
        assert.equal(fns.getOpeningHandProbability(0, 60), 0);
    });
    it('returns 0 for negative copies', () => {
        assert.equal(fns.getOpeningHandProbability(-1, 60), 0);
    });
    it('returns 0 for deck size < 7', () => {
        assert.equal(fns.getOpeningHandProbability(1, 6), 0);
    });
    it('returns ~40.2% for 4 copies in 60-card deck', () => {
        const prob = parseFloat(fns.getOpeningHandProbability(4, 60));
        assert.ok(prob > 39 && prob < 42, `Expected ~40.2%, got ${prob}%`);
    });
    it('returns ~11.7% for 1 copy in 60-card deck', () => {
        const prob = parseFloat(fns.getOpeningHandProbability(1, 60));
        assert.ok(prob > 10 && prob < 13, `Expected ~11.7%, got ${prob}%`);
    });
    it('returns 100.0% for 60 copies in 60-card deck', () => {
        const prob = parseFloat(fns.getOpeningHandProbability(60, 60));
        assert.equal(prob, 100.0);
    });
    it('uses default deck size of 60', () => {
        const prob = parseFloat(fns.getOpeningHandProbability(4));
        assert.ok(prob > 39 && prob < 42);
    });
});

// ── getRarityAbbreviation ───────────────────────────────────────────────────
describe('getRarityAbbreviation — mapping', () => {
    it('Common → C', () => assert.equal(fns.getRarityAbbreviation('Common'), 'C'));
    it('Uncommon → U', () => assert.equal(fns.getRarityAbbreviation('Uncommon'), 'U'));
    it('Rare → R', () => assert.equal(fns.getRarityAbbreviation('Rare'), 'R'));
    it('Holo Rare → R', () => assert.equal(fns.getRarityAbbreviation('Holo Rare'), 'R'));
    it('Ultra Rare → UR', () => assert.equal(fns.getRarityAbbreviation('Ultra Rare'), 'UR'));
    it('Special Art Rare → SAR', () => assert.equal(fns.getRarityAbbreviation('Special Art Rare'), 'SAR'));
    it('Secret Rare → SR', () => assert.equal(fns.getRarityAbbreviation('Secret Rare'), 'SR'));
    it('Promo → P', () => assert.equal(fns.getRarityAbbreviation('Promo'), 'P'));
    it('null → C (default)', () => assert.equal(fns.getRarityAbbreviation(null), 'C'));
    it('unknown → R (fallback)', () => assert.equal(fns.getRarityAbbreviation('Mystery Rarity'), 'R'));
});

// ── buildCityLeaguePlacementStatsMap ────────────────────────────────────────
describe('buildCityLeaguePlacementStatsMap — stats aggregation', () => {
    it('aggregates placement stats per archetype', () => {
        const data = [
            { archetype: 'Charizard', placement: '1' },
            { archetype: 'Charizard', placement: '3' },
            { archetype: 'Lugia', placement: '2' },
        ];
        const map = fns.buildCityLeaguePlacementStatsMap(data);
        const charizard = map.get('Charizard');
        assert.equal(charizard.placementSum, 4);
        assert.equal(charizard.placementCount, 2);
        const lugia = map.get('Lugia');
        assert.equal(lugia.placementSum, 2);
        assert.equal(lugia.placementCount, 1);
    });
    it('skips entries with 0 or invalid placement', () => {
        const data = [
            { archetype: 'Charizard', placement: '0' },
            { archetype: 'Charizard', placement: 'abc' },
            { archetype: 'Charizard', placement: '5' },
        ];
        const map = fns.buildCityLeaguePlacementStatsMap(data);
        const stats = map.get('Charizard');
        assert.equal(stats.placementSum, 5);
        assert.equal(stats.placementCount, 1);
    });
    it('returns empty map for null input', () => {
        const map = fns.buildCityLeaguePlacementStatsMap(null);
        assert.equal(map.size, 0);
    });
    it('returns empty map for empty array', () => {
        const map = fns.buildCityLeaguePlacementStatsMap([]);
        assert.equal(map.size, 0);
    });
    it('skips rows with empty archetype', () => {
        const data = [{ archetype: '', placement: '1' }];
        const map = fns.buildCityLeaguePlacementStatsMap(data);
        assert.equal(map.size, 0);
    });
});

// ── enrichCityLeagueDataWithPlacementStats ──────────────────────────────────
describe('enrichCityLeagueDataWithPlacementStats — enrichment', () => {
    it('adds average_placement to rows', () => {
        const statsMap = new Map();
        statsMap.set('Charizard', { placementSum: 6, placementCount: 3 });
        const data = [{ archetype: 'Charizard', card_name: 'Charizard ex' }];
        const result = fns.enrichCityLeagueDataWithPlacementStats(data, statsMap);
        assert.equal(result[0].average_placement, '2,00');
    });
    it('preserves existing average_placement', () => {
        const statsMap = new Map();
        statsMap.set('Charizard', { placementSum: 6, placementCount: 3 });
        const data = [{ archetype: 'Charizard', average_placement: '1,50' }];
        const result = fns.enrichCityLeagueDataWithPlacementStats(data, statsMap);
        assert.equal(result[0].average_placement, '1,50');
    });
    it('returns empty array for null input', () => {
        const result = fns.enrichCityLeagueDataWithPlacementStats(null, new Map());
        assert.equal(Array.isArray(result), true);
        assert.equal(result.length, 0);
    });
    it('passes through rows without matching archetype', () => {
        const data = [{ archetype: 'Lugia', card_name: 'Lugia V' }];
        const result = fns.enrichCityLeagueDataWithPlacementStats(data, new Map());
        assert.equal(result[0].card_name, 'Lugia V');
    });
});
