/**
 * Sprite slugs for the Champions Pokédex.
 *
 * Limitless hosts sprites as "<species>-<form>" — Dragonite-Mega,
 * Charizard-Mega-Y, Floette-Mega — verified against the names the
 * replica-team view already renders successfully. Our Pokédex writes the
 * form FIRST ("Mega Dragonite", "Hisuian Goodra"), so every name has to
 * be turned around, and getting that wrong shows nothing at all: a miss
 * hides itself via onerror rather than announcing a broken image.
 *
 * The sandbox cannot reach r2.limitlesstcg.net (the proxy blocks it), so
 * these assert the derivation, not that the files exist. The URLs are
 * the ones three shipped views already use.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'app-side-quest-pokedex.js'), 'utf8');
const DEX = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_pokedex.json'), 'utf8'));

function chunk(re, what) {
    const m = SRC.match(re);
    if (!m) throw new Error('could not extract ' + what);
    return m[0];
}

const slug = new Function(
    chunk(/    const _REGION_SUFFIX = \{[\s\S]*?\n    \};\n/, '_REGION_SUFFIX') +
    chunk(/    function spriteSlug\(en\) \{[\s\S]*?\n    \}\n/, 'spriteSlug') +
    'return spriteSlug;')();

describe('form comes last, as Limitless expects', () => {
    const cases = [
        ['Mega Dragonite', 'dragonite-mega'],
        ['Mega Charizard Y', 'charizard-mega-y'],
        ['Mega Raichu X', 'raichu-mega-x'],
        ['Hisuian Goodra', 'goodra-hisui'],
        ['Alolan Ninetales', 'ninetales-alola'],
        ['Galarian Slowking', 'slowking-galar'],
        ['Paldean Tauros', 'tauros-paldea'],
        ['Dragapult', 'dragapult'],
    ];
    for (const [name, want] of cases) {
        it(`${name} -> ${want}`, () => assert.equal(slug(name), want));
    }

    it('never throws on empty or odd input', () => {
        for (const bad of ['', null, undefined, '   ', 'Mega']) {
            assert.doesNotThrow(() => slug(bad));
        }
        assert.equal(slug(''), '');
    });
});

describe('against the real Pokédex', () => {
    it('every entry produces a slug', () => {
        const empty = DEX.entries.filter(e => !slug(e.en));
        assert.deepEqual(empty.map(e => e.en), []);
    });

    it('no slug keeps the form in front', () => {
        // "mega-dragonite" would 404 silently and show nothing.
        const wrong = DEX.entries
            .map(e => slug(e.en))
            .filter(s => /^(mega|hisuian|alolan|galarian|paldean)-/.test(s));
        assert.deepEqual(wrong, []);
    });

    it('slugs are URL-safe', () => {
        const bad = DEX.entries.map(e => slug(e.en)).filter(s => !/^[a-z0-9-]+$/.test(s));
        assert.deepEqual(bad, [], 'a slug with spaces or punctuation cannot resolve');
    });

    it('the markup hides a miss instead of showing a broken image', () => {
        assert.match(SRC, /onerror="this\.style\.visibility='hidden'"/);
        assert.match(SRC, /r2\.limitlesstcg\.net\/pokemon\/gen9\//);
    });
});
