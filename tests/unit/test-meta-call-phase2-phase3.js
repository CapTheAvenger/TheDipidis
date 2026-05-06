/**
 * Unit tests for the Predictor 5.0 Phase 2 + 3 helpers in
 * app-meta-call.js:
 *
 *   Phase 2 — counter-deck adjacency / HP threshold annotations:
 *     - _classifyHpTier: maps a numeric HP into one of
 *       fragile / standard / tanky / wall using the thresholds
 *       from the user's strategic analysis (280 / 320 / 340).
 *     - _resolveMainPokemonHp: given a card-effects byName map +
 *       an archetype's main-Pokémon name, returns the highest-HP
 *       printing whose card name matches as a prefix.
 *     - _topMatchupsForDeck: returns top-3 best/worst matchups
 *       from _matchupMap, share-weighted, share ≥ 0.5 % filtered.
 *
 *   Phase 3 — doctrine-quality score:
 *     - _computeArchetypeDoctrine: classifies typical archetype
 *       builds by 4 pillars (draw / search / gust / energy) and
 *       returns 0-100 score + missing pillar list.
 *
 * The user-flagged motivation for Phase 2 / 3 is the LA-Regionals
 * strategic analysis: HP thresholds (320 = survives common 2-shot,
 * 340 = wall) and the doctrine pillars (a coherent meta deck
 * covers draw + search + gust + energy) shape what the Predictor's
 * top picks really mean. Without these annotations the Day-2 list
 * can't tell the user *why* a deck is well-positioned.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function extractTopLevel(src, fnName) {
    const re = new RegExp(`function\\s+${fnName}\\s*\\(`);
    const m = re.exec(src);
    if (!m) throw new Error(`Function not found: ${fnName}`);
    const start = m.index;
    const openIdx = src.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = openIdx; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        if (depth === 0) { end = i + 1; break; }
    }
    return src.slice(start, end);
}

function load() {
    const src = fs.readFileSync(
        path.resolve(__dirname, '../../js/app-meta-call.js'),
        'utf-8'
    );

    // Pull the module-scope HP threshold constants and the doctrine
    // whitelists — the helpers reference them.
    const constMatches = [
        /const\s+_HP_TIER_FRAGILE\s*=\s*\d+\s*;/.exec(src)[0],
        /const\s+_HP_TIER_TANKY\s*=\s*\d+\s*;/.exec(src)[0],
        /const\s+_HP_TIER_WALL\s*=\s*\d+\s*;/.exec(src)[0],
    ];

    const drawSet = /const\s+_DOCTRINE_DRAW_SUPPORTERS_LOWER\s*=\s*new\s+Set\(\[[\s\S]*?\]\);/.exec(src);
    const searchSet = /const\s+_DOCTRINE_SEARCH_ITEMS_LOWER\s*=\s*new\s+Set\(\[[\s\S]*?\]\);/.exec(src);
    const gustSet = /const\s+_DOCTRINE_GUST_CARDS_LOWER\s*=\s*new\s+Set\(\[[\s\S]*?\]\);/.exec(src);
    if (!drawSet || !searchSet || !gustSet) {
        throw new Error('Could not locate doctrine pillar whitelists');
    }

    // Minimal `normalize` shim — the doctrine builder calls it for
    // archetype-name keys. The production version lowercases and
    // collapses whitespace; for tests we just match that behaviour.
    const normalizeShim = `function normalize(s) {
        return String(s || '').toLowerCase().trim().replace(/\\s+/g, ' ');
    }`;

    const snippet = [
        normalizeShim,
        ...constMatches,
        drawSet[0],
        searchSet[0],
        gustSet[0],
        extractTopLevel(src, '_classifyHpTier'),
        extractTopLevel(src, '_resolveMainPokemonHp'),
        extractTopLevel(src, '_topMatchupsForDeck'),
        extractTopLevel(src, '_computeArchetypeDoctrine'),
    ].join('\n\n');

    const sandbox = { console, Math, Number, Object, String, Array, Map, Set, RegExp };
    vm.createContext(sandbox);
    vm.runInContext(snippet, sandbox);
    return {
        classifyHpTier:        sandbox._classifyHpTier,
        resolveMainPokemonHp:  sandbox._resolveMainPokemonHp,
        topMatchupsForDeck:    sandbox._topMatchupsForDeck,
        computeDoctrine:       sandbox._computeArchetypeDoctrine,
    };
}

const FNS = load();

describe('_classifyHpTier — HP threshold classification', () => {
    it('returns "wall" at and above 340 HP (Mega Lucario tier)', () => {
        assert.equal(FNS.classifyHpTier(340), 'wall');
        assert.equal(FNS.classifyHpTier(400), 'wall');
    });

    it('returns "tanky" between 320 and 339 (Dragapult tier)', () => {
        assert.equal(FNS.classifyHpTier(320), 'tanky');
        assert.equal(FNS.classifyHpTier(330), 'tanky');
        assert.equal(FNS.classifyHpTier(339), 'tanky');
    });

    it('returns "standard" between 280 and 319 (EX baseline)', () => {
        assert.equal(FNS.classifyHpTier(280), 'standard');
        assert.equal(FNS.classifyHpTier(300), 'standard');
        assert.equal(FNS.classifyHpTier(319), 'standard');
    });

    it('returns "fragile" below 280 (one-shot territory)', () => {
        assert.equal(FNS.classifyHpTier(270), 'fragile');
        assert.equal(FNS.classifyHpTier(120), 'fragile');
        assert.equal(FNS.classifyHpTier(50),  'fragile');
    });

    it('returns null for invalid input', () => {
        assert.equal(FNS.classifyHpTier(0), null);
        assert.equal(FNS.classifyHpTier(-50), null);
        assert.equal(FNS.classifyHpTier(NaN), null);
        assert.equal(FNS.classifyHpTier(undefined), null);
    });
});

describe('_resolveMainPokemonHp', () => {
    function makeIndex(entries) {
        // entries: [{ name, hp }, ...] → Map(lowerName → entry)
        const m = new Map();
        for (const e of entries) m.set(e.name.toLowerCase(), e);
        return m;
    }

    it('finds the highest-HP printing whose name starts with the main', () => {
        const byName = makeIndex([
            { name: 'Dragapult ex',    hp: '320' },
            { name: 'Dragapult',       hp: '120' },
            { name: 'Dreepy',          hp: '50'  },
            { name: 'Drakloak',        hp: '90'  },
        ]);
        const r = FNS.resolveMainPokemonHp(byName, 'Dragapult');
        assert.equal(r.mainPokemon, 'Dragapult ex');
        assert.equal(r.hp, 320);
        assert.equal(r.tier, 'tanky');
    });

    it('handles trainer-form prefixes ("N\'s Zoroark")', () => {
        const byName = makeIndex([
            { name: "N's Zoroark ex", hp: '280' },
            { name: "N's Zorua",      hp: '70'  },
            { name: 'Zoroark',        hp: '130' }, // legacy non-N's print, must NOT match
        ]);
        const r = FNS.resolveMainPokemonHp(byName, "N's Zoroark");
        assert.equal(r.mainPokemon, "N's Zoroark ex");
        assert.equal(r.hp, 280);
        assert.equal(r.tier, 'standard');
    });

    it('handles Mega prefix ("Mega Lucario")', () => {
        const byName = makeIndex([
            { name: 'Mega Lucario ex', hp: '340' },
            { name: 'Lucario ex',      hp: '280' },
            { name: 'Lucario',         hp: '120' },
        ]);
        const r = FNS.resolveMainPokemonHp(byName, 'Mega Lucario');
        assert.equal(r.hp, 340);
        assert.equal(r.tier, 'wall');
    });

    it('does not false-match a partial-substring word boundary', () => {
        // "Dragapult" must NOT match "Dragapult Dusknoir Spirits" if
        // someone ever named a card that way; only true name-prefix
        // matches count. (Defensive — current data is clean, but the
        // helper's name-prefix rule is the right invariant.)
        const byName = makeIndex([
            { name: 'Dragapulttress ex', hp: '999' }, // hypothetical bad match
            { name: 'Dragapult ex',      hp: '320' },
        ]);
        const r = FNS.resolveMainPokemonHp(byName, 'Dragapult');
        assert.equal(r.hp, 320, 'must not pick Dragapulttress');
    });

    it('returns null when no card matches', () => {
        const byName = makeIndex([{ name: 'Pikachu', hp: '60' }]);
        assert.equal(FNS.resolveMainPokemonHp(byName, 'Charizard'), null);
    });

    it('returns null on invalid input', () => {
        assert.equal(FNS.resolveMainPokemonHp(null, 'X'), null);
        assert.equal(FNS.resolveMainPokemonHp(new Map(), null), null);
        assert.equal(FNS.resolveMainPokemonHp(new Map(), ''), null);
    });
});

describe('_topMatchupsForDeck', () => {
    const matchupMap = {
        'dragapult': {
            'lucario hariyama':   { pWin: 0.65 }, // good
            'n\'s zoroark':       { pWin: 0.30 }, // bad
            'rocket\'s mewtwo':   { pWin: 0.55 }, // good
            'starmie froslass':   { pWin: 0.45 }, // bad
            'tiny share niche':   { pWin: 0.95 }, // share too small to count
        },
    };
    const field = [
        { name: 'Dragapult',          predictedShare: 30 },
        { name: 'Lucario Hariyama',   predictedShare: 12 },
        { name: "N's Zoroark",        predictedShare: 10 },
        { name: "Rocket's Mewtwo",    predictedShare: 8  },
        { name: 'Starmie Froslass',   predictedShare: 5  },
        { name: 'Tiny Share Niche',   predictedShare: 0.2 }, // < 0.5 %, excluded
    ];

    it('returns top-3 best matchups, sorted by WR then share', () => {
        const r = FNS.topMatchupsForDeck(matchupMap, 'dragapult', field, 'best');
        assert.equal(r.length, 2);
        assert.equal(r[0].opponent, 'Lucario Hariyama');
        assert.equal(r[0].wr, 65);
        assert.equal(r[1].opponent, "Rocket's Mewtwo");
        assert.equal(r[1].wr, 55);
    });

    it('returns top-3 worst matchups, sorted ascending by WR', () => {
        const r = FNS.topMatchupsForDeck(matchupMap, 'dragapult', field, 'worst');
        assert.equal(r.length, 2);
        assert.equal(r[0].opponent, "N's Zoroark");
        assert.equal(r[0].wr, 30);
        assert.equal(r[1].opponent, 'Starmie Froslass');
        assert.equal(r[1].wr, 45);
    });

    it('filters out shares below 0.5 % (niche-pick noise floor)', () => {
        const r = FNS.topMatchupsForDeck(matchupMap, 'dragapult', field, 'best');
        const nicheIncluded = r.some(m => m.opponent === 'Tiny Share Niche');
        assert.equal(nicheIncluded, false);
    });

    it('skips self-matchup', () => {
        const map = { 'dragapult': { 'dragapult': { pWin: 0.50 } } };
        const f = [{ name: 'Dragapult', predictedShare: 30 }];
        // Cross-realm: vm-sandbox Array isn't reference-equal to the
        // test realm's []; assert on length instead.
        assert.equal(FNS.topMatchupsForDeck(map, 'dragapult', f, 'best').length, 0);
        assert.equal(FNS.topMatchupsForDeck(map, 'dragapult', f, 'worst').length, 0);
    });

    it('returns empty array when matchup data is missing', () => {
        assert.equal(FNS.topMatchupsForDeck(null, 'x', field, 'best').length, 0);
        assert.equal(FNS.topMatchupsForDeck({}, 'x', field, 'best').length, 0);
        assert.equal(FNS.topMatchupsForDeck(matchupMap, 'unknown-key', field, 'best').length, 0);
    });

    it('skips _junk pseudo-deck', () => {
        const map = {
            'dragapult': {
                '_junk': { pWin: 0.99 }, // junk WRs are placeholders, not real matchups
            },
        };
        const f = [{ name: '_junk', predictedShare: 30 }];
        assert.equal(FNS.topMatchupsForDeck(map, 'dragapult', f, 'best').length, 0);
    });
});

describe('_computeArchetypeDoctrine — pillar coverage scoring', () => {
    function row(tid, archetype, cardName, type) {
        return {
            tournament_id: tid,
            archetype,
            card_name: cardName,
            type,
        };
    }

    it('scores 100 when an archetype covers all 4 pillars across builds', () => {
        // Two tournament samples for "Dragapult". Each carries the
        // full pillar set: draw + search + gust + energy.
        const rows = [
            // Tournament 1
            row('t1', 'Dragapult', 'Iono',                     'Supporter'),
            row('t1', 'Dragapult', 'Ultra Ball',               'Item'),
            row('t1', 'Dragapult', "Boss's Orders",            'Supporter'),
            row('t1', 'Dragapult', 'Psychic Energy',           'Basic Energy'),
            // Tournament 2
            row('t2', 'Dragapult', 'Iono',                     'Supporter'),
            row('t2', 'Dragapult', 'Buddy-Buddy Poffin',       'Item'),
            row('t2', 'Dragapult', "Boss's Orders",            'Supporter'),
            row('t2', 'Dragapult', 'Psychic Energy',           'Basic Energy'),
        ];
        const out = FNS.computeDoctrine(rows);
        const r = out['dragapult'];
        assert.ok(r, 'dragapult should be present in doctrine map');
        assert.equal(r.score, 100);
        assert.equal(r.pillars.draw,   true);
        assert.equal(r.pillars.search, true);
        assert.equal(r.pillars.gust,   true);
        assert.equal(r.pillars.energy, true);
        assert.equal(r.missing.length, 0);
    });

    it('scores 75 with one missing pillar (no gust)', () => {
        const rows = [
            row('t1', 'NoGustDeck', 'Iono',         'Supporter'),
            row('t1', 'NoGustDeck', 'Ultra Ball',   'Item'),
            row('t1', 'NoGustDeck', 'Basic Energy', 'Basic Energy'),
            row('t2', 'NoGustDeck', 'Iono',         'Supporter'),
            row('t2', 'NoGustDeck', 'Ultra Ball',   'Item'),
            row('t2', 'NoGustDeck', 'Basic Energy', 'Basic Energy'),
        ];
        const out = FNS.computeDoctrine(rows);
        const r = out['nogustdeck'];
        assert.equal(r.score, 75);
        assert.equal(r.pillars.gust, false);
        assert.equal(r.missing.length, 1);
        assert.equal(r.missing[0], 'gust');
    });

    it('skips archetypes with < 2 tournament samples (single-sample noise)', () => {
        const rows = [
            row('t1', 'OneShotDeck', 'Iono',       'Supporter'),
            row('t1', 'OneShotDeck', 'Ultra Ball', 'Item'),
        ];
        const out = FNS.computeDoctrine(rows);
        assert.equal(out['oneshotdeck'], undefined);
    });

    it('requires ≥ 50 % of builds to carry a pillar card before counting it', () => {
        // 4 builds. Iono only in 1 (25 %) — draw pillar should be MISSING.
        // Ultra Ball in all 4 (100 %) — search pillar PRESENT.
        const rows = [
            row('t1', 'Spotty', 'Iono',         'Supporter'),
            row('t1', 'Spotty', 'Ultra Ball',   'Item'),
            row('t1', 'Spotty', 'Basic Energy', 'Basic Energy'),
            row('t2', 'Spotty', 'Ultra Ball',   'Item'),
            row('t2', 'Spotty', 'Basic Energy', 'Basic Energy'),
            row('t3', 'Spotty', 'Ultra Ball',   'Item'),
            row('t3', 'Spotty', 'Basic Energy', 'Basic Energy'),
            row('t4', 'Spotty', 'Ultra Ball',   'Item'),
            row('t4', 'Spotty', 'Basic Energy', 'Basic Energy'),
        ];
        const out = FNS.computeDoctrine(rows);
        const r = out['spotty'];
        assert.equal(r.pillars.draw,   false, 'Iono only in 25% of builds → not a pillar');
        assert.equal(r.pillars.search, true);
        assert.equal(r.pillars.energy, true);
        assert.equal(r.pillars.gust,   false);
        assert.equal(r.score, 50); // 2 of 4 pillars
    });

    it('returns empty object when rows is empty/null', () => {
        assert.equal(Object.keys(FNS.computeDoctrine([])).length,   0);
        assert.equal(Object.keys(FNS.computeDoctrine(null)).length, 0);
    });

    it('recognises Special Energy as the energy pillar', () => {
        const rows = [
            row('t1', 'SpecialEnergyDeck', 'Iono',                'Supporter'),
            row('t1', 'SpecialEnergyDeck', 'Ultra Ball',          'Item'),
            row('t1', 'SpecialEnergyDeck', "Boss's Orders",       'Supporter'),
            row('t1', 'SpecialEnergyDeck', 'Neo Upper Energy',    'Special Energy'),
            row('t2', 'SpecialEnergyDeck', 'Iono',                'Supporter'),
            row('t2', 'SpecialEnergyDeck', 'Ultra Ball',          'Item'),
            row('t2', 'SpecialEnergyDeck', "Boss's Orders",       'Supporter'),
            row('t2', 'SpecialEnergyDeck', 'Neo Upper Energy',    'Special Energy'),
        ];
        const out = FNS.computeDoctrine(rows);
        const r = out['specialenergydeck'];
        assert.equal(r.pillars.energy, true);
        assert.equal(r.score, 100);
    });
});

describe('regression — the user-flagged Phase 2/3 motivation', () => {
    it('exposes HP tier so a Day-2 deck is annotated with its survivability', () => {
        // The strategic analysis hinges on whether a top deck's main
        // attacker can survive a common 2-shot. If the predictor says
        // "Mega Lucario is hot", users want to know it's a 340-HP wall.
        const byName = new Map([
            ['mega lucario ex', { name: 'Mega Lucario ex', hp: '340' }],
            ['lucario',         { name: 'Lucario',         hp: '120' }],
        ]);
        const r = FNS.resolveMainPokemonHp(byName, 'Mega Lucario');
        assert.equal(r.tier, 'wall', 'Mega Lucario must be a wall, not standard');
    });

    it('flags a deck with NO draw engine as missing the draw pillar', () => {
        // Hypothetical archetype that runs only Pokégear-style search
        // but no real draw supporter. Doctrine should highlight this
        // as a coherence weakness — the deck is structurally
        // brick-prone.
        const rows = [
            { tournament_id: 't1', archetype: 'BrickDeck', card_name: 'ultra ball',         type: 'Item' },
            { tournament_id: 't1', archetype: 'BrickDeck', card_name: "boss's orders",      type: 'Supporter' },
            { tournament_id: 't1', archetype: 'BrickDeck', card_name: 'basic energy',       type: 'Basic Energy' },
            { tournament_id: 't2', archetype: 'BrickDeck', card_name: 'ultra ball',         type: 'Item' },
            { tournament_id: 't2', archetype: 'BrickDeck', card_name: "boss's orders",      type: 'Supporter' },
            { tournament_id: 't2', archetype: 'BrickDeck', card_name: 'basic energy',       type: 'Basic Energy' },
        ];
        const out = FNS.computeDoctrine(rows);
        const r = out['brickdeck'];
        assert.equal(r.pillars.draw, false, 'no draw supporter → draw pillar missing');
        assert.ok(r.missing.includes('draw'), 'missing list should contain "draw"');
        assert.equal(r.score, 75, '3 of 4 pillars covered → 75/100');
    });
});
