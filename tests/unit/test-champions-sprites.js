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

/* ═══════════════════════════════════════════════════════════════════
 * Die gespiegelten Bilder
 *
 * Seit dem 31.08.2026 liegen alle 292 Champions-Icons bei uns unter
 * images/champions/. Der Dateiname folgt dem englischen Namen; wer die
 * Regel im Frontend anders schreibt als im Bau-Skript, bekommt 292
 * stille 404 und eine Tabelle voller versteckter Bilder.
 * ═══════════════════════════════════════════════════════════════════ */

const MANIFEST = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'data', 'champions_sprites.json'), 'utf8'));

const lokalName = new Function(
    chunk(/    function lokalName\(en\) \{[\s\S]*?\n    \}\n/, 'lokalName')
    + 'return lokalName;')();

describe('die gespiegelten Bilder', () => {
    it('jeder Pokédex-Eintrag hat eine gespiegelte Datei', () => {
        const ohne = DEX.entries.filter((e) => !MANIFEST.sprites[e.en]).map((e) => e.en);
        assert.deepEqual(ohne, [], 'diese Eintraege haben kein Bild im Manifest');
    });

    it('die Namensregel im Frontend deckt sich mit dem Bau-Skript', () => {
        // Der teuerste Bruch: beide Seiten sehen einzeln richtig aus,
        // aber sie erzeugen verschiedene Dateinamen.
        const schief = [];
        for (const e of DEX.entries) {
            const erwartet = 'images/champions/' + lokalName(e.en) + '.png';
            if (MANIFEST.sprites[e.en].datei !== erwartet) {
                schief.push(`${e.en}: Frontend ${erwartet}, Manifest `
                    + MANIFEST.sprites[e.en].datei);
            }
        }
        assert.deepEqual(schief, []);
    });

    it('die Datei liegt wirklich da, ist ein PNG und 128x128', () => {
        const fehlen = [];
        const falsch = [];
        for (const [en, v] of Object.entries(MANIFEST.sprites)) {
            const p = path.join(ROOT, v.datei);
            if (!fs.existsSync(p)) { fehlen.push(en); continue; }
            const b = fs.readFileSync(p);
            if (b.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
                || b.subarray(12, 16).toString() !== 'IHDR') {
                falsch.push(`${en}: kein PNG`); continue;
            }
            const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
            if (w !== 128 || h !== 128) falsch.push(`${en}: ${w}x${h}`);
        }
        assert.deepEqual(fehlen, [], 'diese Dateien fehlen im Repo');
        assert.deepEqual(falsch, []);
    });

    it('keine zwei Eintraege zeigen dasselbe Bild', () => {
        // Ein vertauschtes Formkuerzel faellt sonst nirgends auf: das
        // Bild laedt, es sieht nur zweimal gleich aus.
        const crypto = require('node:crypto');
        const nach = new Map();
        const doppelt = [];
        for (const [en, v] of Object.entries(MANIFEST.sprites)) {
            const h = crypto.createHash('sha256')
                .update(fs.readFileSync(path.join(ROOT, v.datei))).digest('hex');
            if (nach.has(h)) doppelt.push(`${en} = ${nach.get(h)}`);
            nach.set(h, en);
        }
        assert.deepEqual(doppelt, []);
    });

    it('das Manifest sagt zu jedem Bild, woher es stammt', () => {
        // Wir spiegeln fremde Arbeit; die Herkunft muss nachvollziehbar
        // bleiben, Datei fuer Datei.
        const ohne = Object.entries(MANIFEST.sprites)
            .filter(([, v]) => !/^https:\/\/www\.pokewiki\.de\/images\//.test(v.quelle || ''))
            .map(([en]) => en);
        assert.deepEqual(ohne, []);
        assert.match(MANIFEST._meta.rechte, /§ 51 UrhG/);
        assert.match(MANIFEST._meta.rechte, /Nintendo/);
    });

    it('die erste Stufe ist die eigene Datei, nicht die fremde', () => {
        const f = chunk(/    function spriteImg\(en, cls\) \{[\s\S]*?\n    \}\n/, 'spriteImg');
        assert.match(f, /LOKAL_BASIS/, 'die lokale Basis wird nicht benutzt');
        assert.ok(f.indexOf('LOKAL_BASIS') < f.indexOf('SPRITE_BASIS'),
            'Limitless steht vor der eigenen Datei — dann laedt niemand den Spiegel');
        assert.match(f, /data-stufe/, 'ohne Stufe kann die Kette nicht fortschreiten');
    });

    it('beide Schreibweisen derselben Form ergeben dieselbe Datei', () => {
        // Aus dem Pokédex mit Klammern, aus den Nutzungsdaten ohne.
        for (const [mit, ohne] of [
            ['Paldean Tauros (Combat Breed)', 'Paldean Tauros Combat Breed'],
            ['Paldean Tauros (Aqua Breed)', 'Paldean Tauros Aqua Breed'],
            ['Rotom (Heat)', 'Rotom Heat'],
        ]) {
            assert.equal(lokalName(mit), lokalName(ohne), `${mit} vs ${ohne}`);
        }
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

    /* Die Rueckfallkette wird AUSGEFUEHRT, nicht gelesen.
     *
     * Die alte Fassung prueft Zeichenketten im Quelltext. Sie blieb
     * gruen, solange die richtigen Woerter dastanden — auch wenn die
     * Reihenfolge falsch war oder eine Stufe nie erreicht wurde. Hier
     * laeuft stattdessen ein Attrappen-Bild durch alle Stufen. */
    function ersatzKette(anfang) {
        const ersatz = new Function('SPRITE_BASIS', 't',
            chunk(/    function spriteErsatz\(img\) \{[\s\S]*?\n    \}\n/, 'spriteErsatz')
            + 'return spriteErsatz;')('R2/', () => ({ spriteGrundform: 'Grundform' }));
        const img = {
            dataset: { stufe: anfang.stufe },
            style: {},
            classList: { _k: [], add(c) { this._k.push(c); } },
            _attr: anfang.attr || {},
            getAttribute(n) { return this._attr[n] || ''; },
            src: anfang.src || 'start',
        };
        const verlauf = [];
        for (let i = 0; i < 8; i++) {
            const vorher = img.src;
            ersatz(img);
            if (img.style.visibility === 'hidden') { verlauf.push('versteckt'); break; }
            if (img.src === vorher) { verlauf.push('KEIN FORTSCHRITT'); break; }
            verlauf.push(img.src);
        }
        return { verlauf, img };
    }

    it('faellt von lokal auf Limitless und dann auf die Grundform', () => {
        const { verlauf, img } = ersatzKette({
            stufe: 'lokal',
            attr: { 'data-fremd': 'raichu-mega-y', 'data-grundform': 'raichu' },
        });
        assert.deepEqual(verlauf, ['R2/raichu-mega-y.png', 'R2/raichu.png', 'versteckt']);
        assert.ok(img.classList._k.includes('sqp-sprite--grundform'),
            'der Rueckfall auf die Grundform muss sich zu erkennen geben');
        assert.equal(img.title, 'Grundform');
        assert.equal(img.alt, 'Grundform', 'auch eine Sprachausgabe muss es erfahren');
    });

    it('ueberspringt Limitless, wenn es dort nichts zu holen gibt', () => {
        const { verlauf } = ersatzKette({
            stufe: 'lokal', attr: { 'data-fremd': '', 'data-grundform': 'raichu' },
        });
        assert.deepEqual(verlauf, ['R2/raichu.png', 'versteckt']);
    });

    it('versteckt sich, wenn keine Stufe mehr uebrig ist', () => {
        const { verlauf } = ersatzKette({ stufe: 'lokal', attr: {} });
        assert.deepEqual(verlauf, ['versteckt']);
    });

    it('laeuft nie in eine Schleife', () => {
        // Ohne Stufenmerker probierte ein dauerhaft fehlschlagendes Bild
        // dieselbe Adresse endlos weiter — im Browser bei 292 Bildern
        // gleichzeitig.
        for (const anfang of [
            { stufe: 'lokal', attr: { 'data-fremd': 'x', 'data-grundform': 'y' } },
            { stufe: 'fremd', attr: { 'data-grundform': 'y' } },
            { stufe: 'grund', attr: { 'data-grundform': 'y' } },
            { stufe: undefined, attr: {} },
        ]) {
            const { verlauf } = ersatzKette(anfang);
            assert.ok(!verlauf.includes('KEIN FORTSCHRITT'),
                `Schleife bei ${JSON.stringify(anfang)}: ${verlauf.join(' -> ')}`);
            assert.equal(verlauf[verlauf.length - 1], 'versteckt',
                `die Kette endet nicht: ${verlauf.join(' -> ')}`);
        }
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

    it('die Legende nennt die Quelle und erklärt den Rahmen — in beiden Sprachen', () => {
        const treffer = [...SRC.matchAll(/legendSprite:/g)];
        assert.equal(treffer.length, 2, `${treffer.length} statt 2 Sprachfassungen`);
        // Wir spiegeln fremde Arbeit. Sie zu nennen ist das Mindeste,
        // und es macht fuer Leser nachvollziehbar, woher die Bilder
        // kommen.
        const zeilen = SRC.split('\n').filter((z) => z.includes('legendSprite:'));
        for (const z of zeilen) {
            assert.match(z, /PokeWiki/, `Quelle fehlt in: ${z.trim()}`);
            assert.match(z, /Champions/, `das Spiel fehlt in: ${z.trim()}`);
        }
        // Die alte Fassung behauptete, fuer neun Mega-Formen gebe es
        // kein Bild. Seit dem Spiegel stimmt das nicht mehr.
        assert.ok(!/legendSprite:[^\n]*neun/.test(SRC),
            'die Legende nennt noch die neun fehlenden Mega-Formen');
    });
});
