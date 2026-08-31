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

    it('a miss falls back to the base form instead of vanishing', () => {
        // BEFUND 31.08.2026, alle 290 Eintraege im Browser geprueft: fuer
        // 9 Mega-Formen liefert Limitless nichts — Glimmora, Scovillain,
        // Raichu X, Raichu Y, Staraptor, Golurk, Crabominable, Meowstic,
        // Chimecho. Sieben andere Schreibweisen und fuenf andere
        // Verzeichnisse ebenfalls geprueft: es gibt sie dort nicht.
        // Vorher versteckte sich der Fehlschlag lautlos und hinterliess
        // eine Luecke, die aussah wie ein Fehler.
        assert.match(SRC, /onerror="window\.championsSprite && window\.championsSprite\.ersatz\(this\)"/);
        assert.match(SRC, /data-grundform="\$\{basis\}"/);
        assert.match(SRC, /r2\.limitlesstcg\.net\/pokemon\/gen9\//);
    });

    it('der Ersatz sagt, dass er ein Ersatz ist', () => {
        // Ein unbeschriftetes Raichu neben "Raichu (Mega Y)" waere eine
        // Behauptung ueber das Aussehen der Mega-Form.
        const f = chunk(/    function spriteErsatz\(img\) \{[\s\S]*?\n    \}\n/, 'spriteErsatz');
        assert.match(f, /classList\.add\('sqp-sprite--grundform'\)/);
        assert.match(f, /img\.title = t\(\)\.spriteGrundform/);
        assert.match(f, /img\.alt = t\(\)\.spriteGrundform/,
            'auch fuer eine Sprachausgabe muss der Ersatz erkennbar sein');
    });

    it('der Ersatz versucht es genau einmal', () => {
        const f = chunk(/    function spriteErsatz\(img\) \{[\s\S]*?\n    \}\n/, 'spriteErsatz');
        // Lesen UND Setzen. Nur die Abfrage stehen zu lassen genuegt
        // nicht: der Merker wird nie wahr, der Ersatz laeuft in eine
        // Schleife, und ein blosses /dataset\.ersetzt/ merkt davon nichts.
        assert.match(f, /if \(!img \|\| img\.dataset\.ersetzt\)/,
            'die Abfrage des Merkers fehlt');
        assert.match(f, /img\.dataset\.ersetzt = '1'/,
            'ohne Setzen laeuft ein fehlschlagender Ersatz in eine Schleife');
        assert.match(f, /visibility = 'hidden'/,
            'scheitert auch der Ersatz, bleibt nur noch verstecken');
    });

    it('die Grundform wird aus dem Namen abgeleitet, nicht aus einer Liste', () => {
        // Eine feste Liste veraltet still, sobald Limitless eines der
        // neun nachtraegt.
        const g = new Function(
            chunk(/    const _REGION_SUFFIX = \{[\s\S]*?\n    \};\n/, '_REGION_SUFFIX') +
            chunk(/    function spriteSlug\(en\) \{[\s\S]*?\n    \}\n/, 'spriteSlug') +
            chunk(/    function grundformSlug\(en\) \{[\s\S]*?\n    \}\n/, 'grundformSlug') +
            'return grundformSlug;')();
        assert.equal(g('Mega Raichu Y'), 'raichu');
        assert.equal(g('Mega Raichu X'), 'raichu');
        assert.equal(g('Mega Metagross'), 'metagross');
        assert.equal(g('Mega Charizard Y'), 'charizard');
        assert.equal(g('Mega Chimecho'), 'chimecho');
        assert.equal(g('Raichu'), '', 'keine Mega-Form, kein Rueckfall');
        assert.equal(g('Alolan Raichu'), '', 'Regionalform ist keine Mega-Form');
    });

    it('jede Mega-Form im Pokédex hat eine ableitbare Grundform', () => {
        const g = new Function(
            chunk(/    const _REGION_SUFFIX = \{[\s\S]*?\n    \};\n/, '_REGION_SUFFIX') +
            chunk(/    function spriteSlug\(en\) \{[\s\S]*?\n    \}\n/, 'spriteSlug') +
            chunk(/    function grundformSlug\(en\) \{[\s\S]*?\n    \}\n/, 'grundformSlug') +
            'return grundformSlug;')();
        const ohne = DEX.entries.filter(e => e.form === 'Mega' && !g(e.en)).map(e => e.en);
        assert.deepEqual(ohne, [], 'ohne Grundform gibt es keinen Rueckfall');
    });

    it('die Legende erklärt den gestrichelten Rahmen — in beiden Sprachen', () => {
        const treffer = [...SRC.matchAll(/legendSprite:/g)];
        assert.equal(treffer.length, 2, `${treffer.length} statt 2 Sprachfassungen`);
        assert.match(SRC, /legendSprite: 'Ein gestrichelt umrandetes Bild/);
        assert.match(SRC, /legendSprite: 'A dashed border/);
    });
});
