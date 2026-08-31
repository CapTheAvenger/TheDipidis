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
const USAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'champions_usage.json'), 'utf8'));

function chunk(re, what) {
    const m = SRC.match(re);
    if (!m) throw new Error('could not extract ' + what);
    return m[0];
}

const slug = new Function(
    chunk(/    const _REGION_SUFFIX = \{[\s\S]*?\n    \};\n/, '_REGION_SUFFIX') +
    chunk(/    const _SPRITE_SONDERFALL = \{[\s\S]*?\n    \};\n/, '_SPRITE_SONDERFALL') +
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
        ['Paldean Tauros (Combat Breed)', 'tauros-paldea'],
        ['Paldean Tauros (Blaze Breed)', 'tauros-paldea-blaze'],
        ['Paldean Tauros (Aqua Breed)', 'tauros-paldea-aqua'],
        // Ohne Klammern — so stehen die Namen in champions_usage.json und
        // so kommen sie aus der Teamkameraden- und der Matchup-Ansicht
        // (app-side-quest-usage.js:243, app-side-quest-matchups.js:465).
        // "Paldean Tauros Aqua Breed" liegt heute schon so in den Daten.
        ['Paldean Tauros Combat Breed', 'tauros-paldea'],
        ['Paldean Tauros Blaze Breed', 'tauros-paldea-blaze'],
        ['Paldean Tauros Aqua Breed', 'tauros-paldea-aqua'],
        ['Dragapult', 'dragapult'],
    ];
    for (const [name, want] of cases) {
        it(`${name} -> ${want}`, () => assert.equal(slug(name), want));
    }

    it('never throws on empty or odd input', () => {
        for (const bad of ['', null, undefined, '   ', 'Mega', 'Paldean', 'Alolan', '(  )']) {
            assert.doesNotThrow(() => slug(bad));
        }
        assert.equal(slug(''), '');
        // Ein nackter Regionalzusatz ist kein Name — "undefined-paldea"
        // waere eine Adresse, die es nie geben kann.
        assert.equal(slug('Paldean'), '');
        assert.equal(slug('Alolan'), '');
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

    it('jeder Teamkameraden-Name aus den Nutzungsdaten ergibt einen Slug', () => {
        // Diese Namen erreichen dieselbe Funktion wie die Pokedex-Namen,
        // stehen aber OHNE Klammern in den Daten. Ein Sonderfall, der nur
        // auf die Klammer-Schreibweise passt, laesst sie still ins Leere
        // laufen — das Bild versteckt sich dann kommentarlos.
        const namen = new Set();
        for (const rec of Object.values(USAGE.pokemon || {})) {
            for (const fmt of ['doubles', 'singles']) {
                for (const t of ((rec[fmt] || {}).teammate || [])) {
                    if (t && t.name) namen.add(t.name);
                }
            }
        }
        // Kein Zahlenband gegen die Daten dieser Woche — nur die
        // Zusicherung, dass die Datei ueberhaupt noch Teamkameraden
        // fuehrt. Sonst liefe die Schleife leer und der Test waere
        // gruen, ohne etwas geprueft zu haben.
        assert.notDeepEqual([...namen], [],
            'kein einziger Datensatz hat Teamkameraden — champions_usage.json '
            + 'hat seine Form geaendert');
        const leer = [...namen].filter((n) => !slug(n));
        assert.deepEqual(leer, [], 'diese Namen ergeben keinen Slug');
        const kaputt = [...namen].map((n) => slug(n)).filter((s) => !/^[a-z0-9-]+$/.test(s)
            || s.includes('undefined') || s.startsWith('-') || s.endsWith('-'));
        assert.deepEqual(kaputt, [], 'diese Slugs koennen nicht aufloesen');
    });

    it('beide Schreibweisen derselben Form ergeben denselben Slug', () => {
        for (const [mit, ohne] of [
            ['Paldean Tauros (Combat Breed)', 'Paldean Tauros Combat Breed'],
            ['Paldean Tauros (Blaze Breed)', 'Paldean Tauros Blaze Breed'],
            ['Paldean Tauros (Aqua Breed)', 'Paldean Tauros Aqua Breed'],
        ]) {
            assert.equal(slug(mit), slug(ohne),
                `${mit} und ${ohne} zeigen auf verschiedene Bilder`);
        }
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
            chunk(/    const _SPRITE_SONDERFALL = \{[\s\S]*?\n    \};\n/, '_SPRITE_SONDERFALL') +
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
            chunk(/    const _SPRITE_SONDERFALL = \{[\s\S]*?\n    \};\n/, '_SPRITE_SONDERFALL') +
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
