/**
 * Unit tests for js/app-profile-deck-builder.js — the pure helpers
 * that decide what shows in the search results, how the deck-list
 * paste parser interprets a Showdown/Limitless block, and the
 * mulligan probability math the bottom panel surfaces.
 *
 * The module is an IIFE that attaches its public surface to
 * window.ProfileDeckBuilder; the tests load it into a vm sandbox
 * with a minimal browser shim so we can call those helpers without
 * a real DOM.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Load the module into a sandbox with a tiny browser-API shim. We
// only need the bits the IIFE touches at load time — addEventListener
// on document, getLang on window, and stubs for localStorage / fetch
// so the module-side reads/writes don't blow up.
// Load the module into a sandbox that shares the test realm's
// globals (Set, Object, …) via runInThisContext rather than
// createContext. Reason: the helpers receive Sets / plain objects
// constructed in this test file; running them in a *separate* vm
// realm makes Set.prototype.has reject host-realm Sets (the
// 'incompatible receiver' branch in V8). Sharing the realm is the
// idiom the other test files in tests/unit/ use too.
function loadModule() {
    const src = fs.readFileSync(
        path.join(__dirname, '..', '..', 'js', 'app-profile-deck-builder.js'),
        'utf-8',
    );
    // Stub the browser globals the IIFE touches; restore on the way out.
    const prev = {
        window: global.window, document: global.document,
        localStorage: global.localStorage, fetch: global.fetch,
    };
    global.window = global.window || {};
    global.document = {
        addEventListener: () => {},
        getElementById: () => null,
        querySelectorAll: () => [],
    };
    global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    global.fetch = async () => ({ ok: false });
    try {
        vm.runInThisContext(src);
    } finally {
        // Don't restore window — the IIFE has already attached its
        // public surface to it and the rest of the tests need access.
        // Restore the others to avoid leaking the stubs.
        global.document = prev.document;
        global.localStorage = prev.localStorage;
        global.fetch = prev.fetch;
    }
    return global.window.ProfileDeckBuilder;
}

const PDB = loadModule();

// ── Fixture cards covering each kind we care about ─────────────────

const charizard = {
    name_en: 'Charizard ex', name_de: 'Glurak ex', set: 'OBF', number: '125',
    type: 'Stage 2', energy_type: 'Fire', card_text: 'Ability Burning Darkness …',
};
const weedle = {
    name_en: 'Weedle', name_de: 'Hornliu', set: 'CRI', number: '1',
    type: 'Basic', energy_type: 'Grass', card_text: 'G Surprise Attack 30',
};
const iono = {
    name_en: 'Iono', name_de: 'Ortega', set: 'PAL', number: '185',
    type: 'Supporter', energy_type: '', card_text: 'Each player shuffles their hand …',
};
const basicFire = {
    name_en: 'Basic Fire Energy', name_de: 'Basis Feuer-Energie', set: 'SVE', number: '2',
    type: 'Basic Energy', energy_type: 'Fire', card_text: '',
};
const specialEnergy = {
    name_en: 'Jet Energy', name_de: 'Jet-Energie', set: 'PAL', number: '190',
    type: 'Special Energy', energy_type: 'Colorless', card_text: 'Switch with another Pokémon …',
};
const jpCard = {
    name_en: 'Eevee', name_de: '', set: 'M4', number: '54',
    type: 'Basic', energy_type: 'Colorless', card_text: '', is_japanese: true,
};


describe('ProfileDeckBuilder — card classification', () => {
    it('classifies a Basic Pokémon', () => {
        assert.equal(PDB.isPokemon(weedle), true);
        assert.equal(PDB.isBasicPokemon(weedle), true);
        assert.equal(PDB.isTrainer(weedle), false);
        assert.equal(PDB.isEnergy(weedle), false);
    });

    it('classifies a Stage 2 Pokémon (not Basic)', () => {
        assert.equal(PDB.isPokemon(charizard), true);
        assert.equal(PDB.isBasicPokemon(charizard), false);
    });

    it('classifies a Supporter as Trainer', () => {
        assert.equal(PDB.isTrainer(iono), true);
        assert.equal(PDB.isPokemon(iono), false);
        assert.equal(PDB.isEnergy(iono), false);
    });

    it('classifies basic + special energy', () => {
        assert.equal(PDB.isEnergy(basicFire), true);
        assert.equal(PDB.isBasicEnergy(basicFire), true);
        assert.equal(PDB.isEnergy(specialEnergy), true);
        assert.equal(PDB.isBasicEnergy(specialEnergy), false);
    });
});


describe('ProfileDeckBuilder — search matching', () => {
    it('matches the English name as substring', () => {
        assert.equal(PDB.matchesSearch(charizard, 'chari'), true);
    });

    it('matches the German name', () => {
        assert.equal(PDB.matchesSearch(charizard, 'glurak'), true);
        assert.equal(PDB.matchesSearch(weedle, 'hornliu'), true);
    });

    it('matches set code', () => {
        assert.equal(PDB.matchesSearch(charizard, 'OBF'), true);
        assert.equal(PDB.matchesSearch(charizard, 'obf'), true);
    });

    it('matches "SET-NUMBER" and "SET NUMBER"', () => {
        assert.equal(PDB.matchesSearch(charizard, 'OBF-125'), true);
        assert.equal(PDB.matchesSearch(charizard, 'OBF 125'), true);
        assert.equal(PDB.matchesSearch(charizard, 'OBF125'), true);
    });

    it('matches card text (ability search)', () => {
        assert.equal(PDB.matchesSearch(charizard, 'Burning Darkness'), true);
        assert.equal(PDB.matchesSearch(charizard, 'burning darkness'), true);
    });

    it('returns true on empty term (no filter)', () => {
        assert.equal(PDB.matchesSearch(weedle, ''), true);
        assert.equal(PDB.matchesSearch(weedle, '   '), true);
    });

    it('rejects mismatches', () => {
        assert.equal(PDB.matchesSearch(weedle, 'charizard'), false);
        assert.equal(PDB.matchesSearch(iono, 'shuffle '), true);   // card text hit
        assert.equal(PDB.matchesSearch(iono, 'totally absent string'), false);
    });
});


describe('ProfileDeckBuilder — passesFilters', () => {
    const empty = { meta: 'all', type: new Set(), set: new Set(), energy: new Set(), rarity: new Set(), jpInclude: false };

    it('passes everything when no filter is set', () => {
        assert.equal(PDB.passesFilters(charizard, empty), true);
        assert.equal(PDB.passesFilters(iono, empty), true);
        assert.equal(PDB.passesFilters(basicFire, empty), true);
    });

    it('respects the type filter', () => {
        const f = { ...empty, type: new Set(['pokemon']) };
        assert.equal(PDB.passesFilters(charizard, f), true);
        assert.equal(PDB.passesFilters(iono, f), false);
        assert.equal(PDB.passesFilters(basicFire, f), false);
    });

    it('hides JP cards by default and includes them with jpInclude', () => {
        // Default: JP hidden, intl shown
        assert.equal(PDB.passesFilters(jpCard, empty), false,
            'JP card should be hidden when jpInclude is off');
        assert.equal(PDB.passesFilters(charizard, empty), true);
        // Toggle on: BOTH shown side by side (the "TEF-CRI + JP" case)
        const f = { ...empty, jpInclude: true };
        assert.equal(PDB.passesFilters(jpCard, f), true);
        assert.equal(PDB.passesFilters(charizard, f), true);
    });

    it('classifies trainer subtypes', () => {
        // Iono = Supporter
        assert.equal(PDB.trainerSubtype(iono), 'supporter');
        // Build small fixtures for the other subtypes
        const itemCard = { type: 'Item', name_en: 'Ultra Ball' };
        const toolCard = { type: 'Tool', name_en: 'Forest Seal Stone' };
        const stadiumCard = { type: 'Stadium', name_en: 'Town Store' };
        const pokemonToolCard = { type: 'Pokémon Tool', name_en: 'Defiance Vest' };
        assert.equal(PDB.trainerSubtype(itemCard), 'item');
        assert.equal(PDB.trainerSubtype(toolCard), 'tool');
        assert.equal(PDB.trainerSubtype(stadiumCard), 'stadium');
        assert.equal(PDB.trainerSubtype(pokemonToolCard), 'tool');
        // Non-trainers return null
        assert.equal(PDB.trainerSubtype(charizard), null);
        assert.equal(PDB.trainerSubtype(basicFire), null);
    });

    it('type filter routes Trainer subtypes correctly', () => {
        const itemCard = { type: 'Item', name_en: 'Ultra Ball' };
        const fSupporter = { ...empty, type: new Set(['supporter']) };
        const fItem = { ...empty, type: new Set(['item']) };
        // Iono (Supporter) matches only the supporter chip
        assert.equal(PDB.passesFilters(iono, fSupporter), true);
        assert.equal(PDB.passesFilters(iono, fItem), false);
        // Ultra Ball (Item) matches only the item chip
        assert.equal(PDB.passesFilters(itemCard, fItem), true);
        assert.equal(PDB.passesFilters(itemCard, fSupporter), false);
    });

    it('meta filter restricts intl cards to the chunk; JP cards bypass it', () => {
        const setsByEra = {
            standard: new Set(['CRI', 'OBF', 'PAL']),
            extended: new Set(['PAR', 'SVI']),
            legacy:   new Set(['BS', 'JU']),
        };
        const legacyCharizard = { ...charizard, set: 'BS' };  // intl, legacy
        const stdIono = { ...iono, set: 'PAL' };               // intl, standard
        // Standard filter: only standard intl passes; legacy intl drops.
        const fStd = { ...empty, meta: 'standard' };
        assert.equal(PDB.passesFilters(stdIono, fStd, setsByEra), true);
        assert.equal(PDB.passesFilters(legacyCharizard, fStd, setsByEra), false);
        // JP cards always bypass the meta gate (they have JP sets that
        // wouldn't be in any intl chunk).
        const fStdJp = { ...empty, meta: 'standard', jpInclude: true };
        assert.equal(PDB.passesFilters(jpCard, fStdJp, setsByEra), true);
        // Extended filter: standard OR extended sets pass.
        const fExt = { ...empty, meta: 'extended' };
        const extIono = { ...iono, set: 'PAR' };
        assert.equal(PDB.passesFilters(stdIono, fExt, setsByEra), true);
        assert.equal(PDB.passesFilters(extIono, fExt, setsByEra), true);
        assert.equal(PDB.passesFilters(legacyCharizard, fExt, setsByEra), false);
    });

    it('"TEF-CRI + JP" combined scenario returns both sides', () => {
        // The exact example the user named. Meta=standard + jpInclude=on
        // must produce intl-current-meta AND every JP card together.
        const setsByEra = { standard: new Set(['CRI']), extended: new Set(), legacy: new Set() };
        const f = { ...empty, meta: 'standard', jpInclude: true };
        const intlCurrent = { ...weedle, set: 'CRI' };
        const intlOld     = { ...charizard, set: 'BS' };
        assert.equal(PDB.passesFilters(intlCurrent, f, setsByEra), true);
        assert.equal(PDB.passesFilters(intlOld, f, setsByEra), false);
        assert.equal(PDB.passesFilters(jpCard, f, setsByEra), true);
    });

    it('respects the set filter', () => {
        const f = { ...empty, set: new Set(['OBF']) };
        assert.equal(PDB.passesFilters(charizard, f), true);
        assert.equal(PDB.passesFilters(weedle, f), false);
    });

    it('respects the energy-type filter', () => {
        const f = { ...empty, energy: new Set(['Fire']) };
        assert.equal(PDB.passesFilters(charizard, f), true);
        assert.equal(PDB.passesFilters(weedle, f), false);
    });
});


describe('ProfileDeckBuilder — deck-list paste parser', () => {
    it('parses a clean 4-card Showdown block', () => {
        const text = `Pokémon: 7
4 Charizard ex OBF 125
3 Charmander DRM 4

Trainer: 33
4 Iono PAL 185

Energy: 10
8 Basic Fire Energy SVE 2`;
        const out = PDB.parseDeckList(text);
        assert.equal(out.entries.length, 4);
        assert.deepEqual(out.entries[0], { count: 4, name: 'Charizard ex', set: 'OBF', number: '125' });
        assert.deepEqual(out.entries[3], { count: 8, name: 'Basic Fire Energy', set: 'SVE', number: '2' });
        assert.equal(out.unknownLines.length, 0);
    });

    it('ignores section headers and blank lines', () => {
        const out = PDB.parseDeckList(`Pokémon: 6\n\nTotal Cards: 60\n\n`);
        assert.equal(out.entries.length, 0);
        assert.equal(out.unknownLines.length, 0);
    });

    it('falls back to name-only when set/number missing', () => {
        const out = PDB.parseDeckList(`4 Charizard ex\n3 Iono`);
        assert.equal(out.entries.length, 2);
        assert.equal(out.entries[0].set, '');
        assert.equal(out.entries[0].name, 'Charizard ex');
        assert.equal(out.entries[0].count, 4);
    });

    it('records lines that don\'t parse at all', () => {
        const out = PDB.parseDeckList(`weird non-quantity line`);
        assert.equal(out.entries.length, 0);
        assert.equal(out.unknownLines.length, 1);
    });
});


describe('ProfileDeckBuilder — mulligan probability', () => {
    it('computes the user\'s reference scenario (13 basics / 60 deck)', () => {
        // Spec: "Basic in hand: 83.7%, Mulligan: 16.3% (13 Basics / 60 cards)"
        const p = PDB.mulliganProbability(13, 60, 7);
        assert.ok(Math.abs(p.basicInHand - 0.8369) < 0.005,
            `basicInHand should be ~0.837, got ${p.basicInHand}`);
        assert.ok(Math.abs(p.mulligan - 0.1631) < 0.005,
            `mulligan should be ~0.163, got ${p.mulligan}`);
        // The two MUST sum to exactly 1.
        assert.ok(Math.abs((p.basicInHand + p.mulligan) - 1) < 1e-9);
    });

    it('1 basic in a 60-card deck → ~11.7% basic-in-hand', () => {
        const p = PDB.mulliganProbability(1, 60, 7);
        assert.ok(Math.abs(p.basicInHand - 7 / 60) < 1e-9);
    });

    it('all basics → no mulligan possible', () => {
        const p = PDB.mulliganProbability(60, 60, 7);
        assert.equal(p.basicInHand, 1);
        assert.equal(p.mulligan, 0);
    });

    it('zero basics → always mulligan', () => {
        const p = PDB.mulliganProbability(0, 60, 7);
        assert.equal(p.basicInHand, 0);
        assert.equal(p.mulligan, 1);
    });

    it('handles a non-60 deck size monotonically', () => {
        // As basics rise, basic-in-hand should never drop.
        let prev = 0;
        for (let k = 1; k <= 10; k++) {
            const p = PDB.mulliganProbability(k, 40, 7);
            assert.ok(p.basicInHand >= prev,
                `not monotonic at k=${k}: ${p.basicInHand} < ${prev}`);
            prev = p.basicInHand;
        }
    });
});


describe('ProfileDeckBuilder — deck counters', () => {
    it('counts total cards and basic Pokémon', () => {
        const deck = { cards: [
            { ...weedle, count: 4 },
            { ...charizard, count: 2 },
            { ...basicFire, count: 8 },
        ] };
        assert.equal(PDB.countCards(deck), 14);
        assert.equal(PDB.countBasics(deck), 4);  // only Weedle is a Basic Pokémon
    });

    it('handles empty deck cleanly', () => {
        assert.equal(PDB.countCards({ cards: [] }), 0);
        assert.equal(PDB.countBasics({ cards: [] }), 0);
    });
});


describe('ProfileDeckBuilder — card key', () => {
    it('combines set + number for de-duplication', () => {
        assert.equal(PDB.cardKey(charizard), 'OBF-125');
    });

    it('uppercases mixed-case input', () => {
        assert.equal(PDB.cardKey({ set: 'obf', number: '125' }), 'OBF-125');
    });
});


describe('ProfileDeckBuilder — JP name cross-linking', () => {
    const intl = [
        { name_en: 'Manectric ex', name_de: 'Voltenso-ex', set: 'DRI', number: '76' },
        { name_en: 'Mega Manectric ex', name_de: 'Mega-Voltenso-ex', set: 'MEG', number: '50' },
        { name_en: 'Pikachu', name_de: 'Pikachu', set: 'CRI', number: '50' },
        // A print that lost its German localisation — must not clobber
        // the good one above.
        { name_en: 'Manectric ex', name_de: '', set: 'SMP', number: '130' },
    ];

    it('builds an EN→DE map keyed on lowercased English name', () => {
        const map = PDB.buildIntlNameMap(intl);
        assert.equal(map.get('manectric ex').name_de, 'Voltenso-ex');
        assert.equal(map.get('mega manectric ex').name_de, 'Mega-Voltenso-ex');
    });

    it('keeps the first non-empty German name (no clobber by a later blank print)', () => {
        const map = PDB.buildIntlNameMap(intl);
        // The SMP print has empty name_de but must not erase DRI's.
        assert.equal(map.get('manectric ex').name_de, 'Voltenso-ex');
    });

    it('copies German names onto JP cards so a German search matches', () => {
        const map = PDB.buildIntlNameMap(intl);
        const jp = [
            { name_en: 'Manectric ex', name_de: '', set: 'M5', number: '23', is_japanese: true },
            { name_en: 'Mega Manectric ex', name_de: '', set: 'M5', number: '90', is_japanese: true },
        ];
        PDB.enrichJpNames(jp, map);
        assert.equal(jp[0].name_de, 'Voltenso-ex');
        assert.equal(jp[1].name_de, 'Mega-Voltenso-ex');
        // And now the German term finds the JP card.
        assert.equal(PDB.matchesSearch(jp[0], 'voltenso'), true);
        assert.equal(PDB.matchesSearch(jp[0], 'Voltenso-ex'), true);
    });

    it('leaves JP cards with no intl match untouched', () => {
        const map = PDB.buildIntlNameMap(intl);
        const jp = [{ name_en: 'SomeJpOnlyMon', name_de: '', set: 'M5', number: '5', is_japanese: true }];
        PDB.enrichJpNames(jp, map);
        assert.equal(jp[0].name_de, '');
        // Still findable by its English name.
        assert.equal(PDB.matchesSearch(jp[0], 'somejponlymon'), true);
    });

    it('does not overwrite a JP card that already has a German name', () => {
        const map = PDB.buildIntlNameMap(intl);
        const jp = [{ name_en: 'Manectric ex', name_de: 'AlreadySet', set: 'M5', number: '23', is_japanese: true }];
        PDB.enrichJpNames(jp, map);
        assert.equal(jp[0].name_de, 'AlreadySet');
    });
});


describe('ProfileDeckBuilder — pokemonproxies JP image URL substitution', () => {
    // The site moved off the predictable folder/prefix scheme to a
    // Vite content-hashed /assets/... layout, so the URL is now a
    // pure lookup against data/pokemonproxies_url_map.json — populated
    // by scripts/scrape_pokemonproxies_urls.py. applyJpProxyUrl takes
    // the map as a second argument here so the test doesn't depend on
    // a successful network fetch.

    it('returns the mapped URL when the key is present', () => {
        const proxy = 'https://www.pokemonproxies.com/assets/5a-023-Manectric-UWQu1Mvp.png';
        const map = { M5_23: proxy };
        const card = {
            name_en: 'Manectric', set: 'M5', number: '23',
            image_url: 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_23_R_JP_LG.png',
        };
        assert.equal(PDB.applyJpProxyUrl(card, map), proxy);
    });

    it('falls back to the raw JP scan when the key is missing', () => {
        const orig = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_1_R_JP_LG.png';
        const card = { name_en: 'Tropius', set: 'M5', number: '1', image_url: orig };
        assert.equal(PDB.applyJpProxyUrl(card, { M5_23: 'whatever' }), orig);
    });

    it('falls back when the map argument is null/empty', () => {
        // Both: no second arg (no module-level map cached either —
        // tests don't await loadPokemonproxiesMap), and explicit {}.
        const orig = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_23_R_JP_LG.png';
        const card = { name_en: 'Manectric', set: 'M5', number: '23', image_url: orig };
        assert.equal(PDB.applyJpProxyUrl(card), orig);
        assert.equal(PDB.applyJpProxyUrl(card, {}), orig);
        assert.equal(PDB.applyJpProxyUrl(card, null), orig);
    });

    it('leaves non-JP image URLs untouched even when a key collides', () => {
        // International (EN) URL does NOT contain _JP_LG.png so the
        // helper must not transform it — even if some malicious map
        // had an entry that "matches" the set+number.
        const enUrl = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpci/CRI/CRI_001_R_EN_LG.png';
        const card = { name_en: 'Weedle', set: 'CRI', number: '1', image_url: enUrl };
        assert.equal(PDB.applyJpProxyUrl(card, { CRI_1: 'https://attacker.example/x.png' }), enUrl);
    });

    it('handles malformed input gracefully (no number, no set)', () => {
        // Garbage card data → return the original URL, never throw.
        const orig = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_X_R_JP_LG.png';
        assert.equal(
            PDB.applyJpProxyUrl({ name_en: '', set: 'M5', number: 'X', image_url: orig }, {}),
            orig,
        );
        assert.equal(
            PDB.applyJpProxyUrl({ name_en: '', set: '', number: '23', image_url: orig }, {}),
            orig,
        );
    });

    it('normalizes the set code to upper-case before lookup', () => {
        // Defensive: a stray lowercase set code (m5 vs M5) must still
        // hit the upper-case key the map uses.
        const proxy = 'https://www.pokemonproxies.com/assets/5a-023-Manectric-UWQu1Mvp.png';
        const card = { name_en: 'Manectric', set: 'm5', number: '23',
                       image_url: 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_23_R_JP_LG.png' };
        assert.equal(PDB.applyJpProxyUrl(card, { M5_23: proxy }), proxy);
    });

    it('strips leading zeros from the card number for the key', () => {
        // The JP CSV writes "1" while some other sources write "001".
        // Both must match the same M5_1 key.
        const proxy = 'https://www.pokemonproxies.com/assets/5a-001-Tropius-AB12cd34.png';
        const map = { M5_1: proxy };
        const url = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M5/M5_1_R_JP_LG.png';
        assert.equal(PDB.applyJpProxyUrl({ set: 'M5', number: '1',   image_url: url }, map), proxy);
        assert.equal(PDB.applyJpProxyUrl({ set: 'M5', number: '001', image_url: url }, map), proxy);
    });
});


describe('ProfileDeckBuilder — JP chunk + CSV dedup (mergeCardSources)', () => {
    // Once prepare_card_data.py started emitting JP-only cards into
    // cards_chunk_standard.json (2026-06-14 weekly run), we suddenly
    // had two sources for the same M5 print: one from
    // window.allCardsDatabase and one from japanese_cards_database.csv.
    // mergeCardSources collapses the duplicates and keeps the richer
    // record per field.

    it('keeps the only copy when sources do not overlap', () => {
        const a = [{ set: 'CRI', number: '1', name_en: 'Weedle' }];
        const b = [{ set: 'M5',  number: '1', name_en: 'Tropius', is_japanese: true }];
        const merged = PDB.mergeCardSources(a, b);
        assert.equal(merged.length, 2);
    });

    it('dedupes by set+number and keeps the German name from either side', () => {
        // Primary (chunk) lacks name_de; secondary (CSV after enrich
        // pass) has it.
        const chunk = [{ set: 'M5', number: '23', name_en: 'Manectric', name_de: '',
                         image_url: 'https://limitlesstcg.../M5_23_R_JP_LG.png',
                         is_japanese: true }];
        const csv = [{ set: 'M5', number: '23', name_en: 'Manectric', name_de: 'Voltenso-ex',
                       image_url: 'https://limitlesstcg.../M5_23_R_JP_LG.png',
                       is_japanese: true }];
        const merged = PDB.mergeCardSources(chunk, csv);
        assert.equal(merged.length, 1);
        assert.equal(merged[0].name_de, 'Voltenso-ex');
    });

    it('prefers the pokemonproxies URL when either side has one', () => {
        // Chunk row carries raw Limitless URL; CSV row was already
        // run through applyJpProxyUrl and carries the proxy. The
        // merge must surface the proxy.
        const proxy = 'https://pokemonproxies.com/images/cards/sets/Chaos_Rising/4a-001-Weedle.png';
        const raw = 'https://limitlesstcg.nyc3.cdn.digitaloceanspaces.com/tpc/M4/M4_1_R_JP_LG.png';
        const chunk = [{ set: 'M4', number: '1', name_en: 'Weedle', image_url: raw }];
        const csv   = [{ set: 'M4', number: '1', name_en: 'Weedle', image_url: proxy, is_japanese: true }];
        assert.equal(PDB.mergeCardSources(chunk, csv)[0].image_url, proxy);
        // And the inverse — proxy on the primary, raw on the secondary
        // — still keeps the proxy.
        assert.equal(PDB.mergeCardSources(
            [{ set: 'M4', number: '1', image_url: proxy }],
            [{ set: 'M4', number: '1', image_url: raw }],
        )[0].image_url, proxy);
    });

    it('propagates is_japanese when EITHER source carries it', () => {
        // The chunk may forget the flag (jp_only field, picked up
        // upstream); the CSV always sets it. After merge the print
        // must be JP-tagged so the meta filter routes it correctly.
        const merged = PDB.mergeCardSources(
            [{ set: 'M5', number: '1', is_japanese: false }],
            [{ set: 'M5', number: '1', is_japanese: true }],
        );
        assert.equal(merged[0].is_japanese, true);
    });
});


describe('ProfileDeckBuilder — newest-set-first sort', () => {
    // Mirrors the production sort in js/app-profile-deck-builder.js
    // (search 'setOrder'). Keeps the assertion focused on the
    // newest-first ordering the user asked for ('CRI is newer than
    // ASC, must show first') rather than reimplementing the whole
    // exact-match + tiebreak ladder.

    function sortByReleaseDesc(cards, orderMap) {
        const setOrder = (code) => (code && (orderMap[code] || orderMap[(code || '').toLowerCase()])) || 0;
        return cards.slice().sort((a, b) => {
            const delta = setOrder(b.set) - setOrder(a.set);
            if (delta !== 0) return delta;
            return (a.set || '').localeCompare(b.set || '');
        });
    }

    it('CRI (154) sorts before ASC (150) which sorts before TEF (148)', () => {
        // Reproduces the exact ordering complaint from the user: with
        // alphabetical sort ASC showed first, but CRI is the newer set
        // and should land on top.
        const orderMap = { CRI: 154, ASC: 150, TEF: 148, BLK: 145 };
        const cards = [
            { set: 'ASC', number: '1' },
            { set: 'CRI', number: '1' },
            { set: 'BLK', number: '1' },
            { set: 'TEF', number: '1' },
        ];
        const order = sortByReleaseDesc(cards, orderMap).map(c => c.set);
        assert.deepEqual(order, ['CRI', 'ASC', 'TEF', 'BLK']);
    });

    it('unknown sets (orderMap miss) sort to the bottom', () => {
        // JP sets / freshly-added codes that aren't in sets.json yet
        // shouldn't bubble up above legitimate Standard sets.
        const orderMap = { CRI: 154, OBF: 130 };
        const cards = [
            { set: 'NEWBIE_JP', number: '1' },
            { set: 'OBF', number: '1' },
            { set: 'CRI', number: '1' },
        ];
        const order = sortByReleaseDesc(cards, orderMap).map(c => c.set);
        assert.deepEqual(order, ['CRI', 'OBF', 'NEWBIE_JP']);
    });

    it('falls back to alphabetical within equal release order', () => {
        const orderMap = { A: 100, B: 100 };
        const cards = [{ set: 'B', number: '1' }, { set: 'A', number: '1' }];
        assert.deepEqual(sortByReleaseDesc(cards, orderMap).map(c => c.set), ['A', 'B']);
    });
});
