/**
 * Der Rateweg fuer Archetyp-Icons.
 *
 * ArchetypeIcons hat zwei Wege: die kuratierte data/archetype_icons.json
 * und — wenn ein Name dort fehlt — geratene Slugs aus den Namenswoertern.
 * Der Rateweg trifft jeden neuen Archetypnamen, bis ihn jemand eintraegt,
 * also die Mehrheit der japanischen City-League-Kombinationen.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * Am 31.08.2026 wurden zehn kaputte Slugs in der kuratierten Datei
 * korrigiert. Die Gegenmessung LIVE, direkt nach dem Deploy, brachte
 * charizard-x-mega sofort zurueck — von Namen, die gar nicht in der
 * Datei stehen ("Mega Charizard-X Zoroark", "Mega Charizard-X
 * Oricorio"). Der Rateweg trug denselben Dreher wie die Daten.
 *
 * Ein Icon, das nicht laedt, versteckt sich per <img onerror> lautlos.
 * Darum steht hier das Verhalten fest, und zwar ausgefuehrt: die
 * Funktion wird aufgerufen und ihr Ergebnis gelesen, nicht ihr
 * Quelltext durchsucht.
 *
 * Jede erwartete Adresse unten wurde am 31.08.2026 im Browser gegen
 * r2.limitlesstcg.net geprueft — geladen heisst vorhanden.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'archetype-icons.js'), 'utf8');

function chunk(re, was) {
    const m = SRC.match(re);
    if (!m) throw new Error('nicht gefunden: ' + was);
    return m[0];
}

const raten = new Function(
    chunk(/  const _NOISE_TOKENS = new Set\(\[[\s\S]*?\]\);\n/, '_NOISE_TOKENS')
    + chunk(/  const _FORM_PREFIX_SUFFIX = \{[\s\S]*?\n  \};\n/, '_FORM_PREFIX_SUFFIX')
    + chunk(/  const _MIN_SLUG_LAENGE = \d+;\n/, '_MIN_SLUG_LAENGE')
    + chunk(/  function _formSlug\(art, suffix\) \{[\s\S]*?\n  \}\n/, '_formSlug')
    + chunk(/  function _sanitizeWord\(w\) \{[\s\S]*?\n  \}\n/, '_sanitizeWord')
    + chunk(/  function _speculativeSlugs\(name\) \{[\s\S]*?\n  \}\n/, '_speculativeSlugs')
    + 'return _speculativeSlugs;')();

describe('die Variante steht hinter dem Formzusatz', () => {
    // DER Fehler, der zweimal auftrat: einmal in den Daten, einmal hier.
    const faelle = [
        ['Mega Charizard-X Zoroark', ['charizard-mega-x', 'zoroark']],
        ['Mega Charizard-X Oricorio', ['charizard-mega-x', 'oricorio']],
        ['Mega Charizard-Y Delphox', ['charizard-mega-y', 'delphox']],
        ['Mega Mewtwo-X', ['mewtwo-mega-x']],
        ['Mega Mewtwo-Y', ['mewtwo-mega-y']],
    ];
    for (const [name, erwartet] of faelle) {
        it(`${name} -> ${erwartet.join(', ')}`, () => {
            assert.deepEqual(raten(name), erwartet);
        });
    }

    it('kein geratener Slug hat die Variante vor dem Formzusatz', () => {
        const namen = ['Mega Charizard-X Zoroark', 'Mega Charizard-Y Delphox',
                       'Mega Mewtwo-X Dusknoir', 'Zoroark Mega Charizard-X'];
        const schlecht = namen.flatMap(raten).filter(s => /-[xy]-(mega|alola|galar|hisui|paldea)$/.test(s));
        assert.deepEqual(schlecht, []);
    });
});

describe('Formzusaetze aus zwei Woertern', () => {
    it('Teal Mask Ogerpon ist die Grundform, nicht zwei Slugs', () => {
        // Vorher: ["teal","mask"] — zwei Adressen, die es beide nicht
        // gibt, und Ogerpon selbst kam gar nicht vor.
        assert.deepEqual(raten('Teal Mask Ogerpon'), ['ogerpon']);
    });

    it('die anderen drei Masken tragen ihren Zusatz', () => {
        assert.deepEqual(raten('Wellspring Ogerpon'), ['ogerpon-wellspring']);
        assert.deepEqual(raten('Hearthflame Ogerpon'), ['ogerpon-hearthflame']);
        assert.deepEqual(raten('Cornerstone Ogerpon'), ['ogerpon-cornerstone']);
    });

    it('ein leerer Formzusatz wird nicht mit "kein Formwort" verwechselt', () => {
        // '' ist falsy. Ein Wahrheitstest statt !== undefined wuerde
        // Teal Mask wieder in zwei Woerter zerfallen lassen.
        assert.deepEqual(raten('Teal Mask Ogerpon Dusknoir'), ['ogerpon', 'dusknoir']);
    });
});

describe('Woerter, die nie eine Art sind', () => {
    it('ein einzelner Buchstabe wird kein Slug', () => {
        // "N's Zoroark" ergab den Slug 'n'. Das kuerzeste Pokemon der
        // Reihe hat drei Buchstaben.
        assert.deepEqual(raten("N's Zoroark"), ['zoroark']);
        assert.deepEqual(raten('N Zoroark'), ['zoroark']);
    });

    it('lange Namen bleiben unangetastet', () => {
        assert.deepEqual(raten('Dragapult Dusknoir'), ['dragapult', 'dusknoir']);
        assert.deepEqual(raten('Mew Muk'), ['mew', 'muk'], 'drei Buchstaben sind gueltig');
    });
});

describe('die bekannten Formen bleiben richtig', () => {
    const faelle = [
        ['Mega Venusaur', ['venusaur-mega']],
        ['Mega Greninja Drakloak', ['greninja-mega', 'drakloak']],
        ['Alolan Exeggutor', ['exeggutor-alola']],
        ['Paldean Tauros', ['tauros-paldea']],
        ['Bloodmoon Ursaluna', ['ursaluna-bloodmoon']],
        ['Galarian Zapdos', ['zapdos-galar']],
        ['Hisuian Zoroark', ['zoroark-hisui']],
    ];
    for (const [name, erwartet] of faelle) {
        it(`${name} -> ${erwartet.join(', ')}`, () => {
            assert.deepEqual(raten(name), erwartet);
        });
    }

    it('hoechstens zwei Slugs, sonst sprengt die Zeile', () => {
        for (const n of ['Dragapult Dusknoir Munkidori Budew',
                         'Mega Charizard-X Mega Charizard-Y Zoroark']) {
            assert.ok(raten(n).length <= 2, n + ' -> ' + raten(n).join(','));
        }
    });

    it('bleibt bei Unsinn stumm statt zu raten', () => {
        for (const n of ['', null, undefined, '   ', 'ex', 'the of and']) {
            assert.deepEqual(raten(n), [], JSON.stringify(n));
        }
    });

    it('erzeugt nie eine Adresse mit Leerzeichen oder Apostroph', () => {
        const namen = ["N's Zoroark", 'Mega Charizard-X Zoroark', 'Teal Mask Ogerpon',
                       "Rocket's Mewtwo", 'Iron Valiant Dudunsparce', 'Mega Venusaur'];
        const schlecht = namen.flatMap(raten).filter(s => !/^[a-z0-9-]+$/.test(s));
        assert.deepEqual(schlecht, [], 'so eine Adresse kann nie laden');
    });
});

/* ═══════════════════════════════════════════════════════════════════
 * slugIconHtml bekommt nicht immer einen Slug
 *
 * BEFUND (31.08.2026, live in der City-League-Tabelle, NACH zwei schon
 * ausgelieferten Korrekturen): vier Icons luden weiter nicht —
 * n's.png, mega%20venusaur.png, festival.png, mega%20greninja.png.
 *
 * Sie kamen nicht ueber getIconUrls (das war laengst sauber), sondern
 * ueber slugIconHtml. Der Aufrufer reicht dort `d.main` durch, und das
 * ist ein Archetyp-NAME, kein Slug. Die Funktion hat ihn schlicht
 * kleingeschrieben und angehaengt — Leerzeichen und Apostroph
 * inklusive.
 *
 * Der Fund kam erst zustande, weil ich nach dem Deploy die GEMELDETE
 * ANSICHT aufgemacht habe statt nur meiner eigenen Rechnung zu
 * glauben. Die Rechnung sagte "null kaputt" und hatte recht — fuer den
 * Weg, den sie prueft.
 * ═══════════════════════════════════════════════════════════════════ */
describe('slugIconHtml erkennt einen Namen als Namen', () => {
    function helfer(archetypen) {
        const daten = {
            _meta: { urlPrefix: 'R2/', urlSuffix: '.png' },
            archetypes: archetypen || {},
        };
        const idx = new Map();
        const norm = (n) => (n || '').toLowerCase()
            .replace(/[\s\-'‘’‛`´ʼ]/g, '');
        for (const k of Object.keys(daten.archetypes)) idx.set(norm(k), daten.archetypes[k]);
        return new Function('_data', '_normalizedIndex', 'normalize',
            chunk(/  const _NOISE_TOKENS = new Set\(\[[\s\S]*?\]\);\n/, '_NOISE_TOKENS')
            + chunk(/  const _FORM_PREFIX_SUFFIX = \{[\s\S]*?\n  \};\n/, '_FORM_PREFIX_SUFFIX')
            + chunk(/  const _MIN_SLUG_LAENGE = \d+;\n/, '_MIN_SLUG_LAENGE')
            + chunk(/  function _formSlug\(art, suffix\) \{[\s\S]*?\n  \}\n/, '_formSlug')
            + chunk(/  function _sanitizeWord\(w\) \{[\s\S]*?\n  \}\n/, '_sanitizeWord')
            + chunk(/  function _speculativeSlugs\(name\) \{[\s\S]*?\n  \}\n/, '_speculativeSlugs')
            + chunk(/  function _escAttr\([\s\S]*?\n  \}\n/, '_escAttr')
            + chunk(/  function getIconUrls\(archetypeName\) \{[\s\S]*?\n  \}\n/, 'getIconUrls')
            + chunk(/  function getIconHtml\(archetypeName, opts\) \{[\s\S]*?\n  \}\n/, 'getIconHtml')
            + chunk(/  const _IST_SLUG = [^\n]*\n/, '_IST_SLUG')
            + chunk(/  function slugIconHtml\(slug, opts\) \{[\s\S]*?\n  \}\n/, 'slugIconHtml')
            + 'return slugIconHtml;')(daten, idx, norm);
    }

    const quellen = (html) => [...html.matchAll(/src="([^"]*)"/g)].map(m => m[1]);

    it('baut aus einem Namen keine Adresse mit Leerzeichen', () => {
        const f = helfer();
        assert.deepEqual(quellen(f('Mega Venusaur')), ['R2/venusaur-mega.png']);
        assert.deepEqual(quellen(f('Mega Greninja')), ['R2/greninja-mega.png']);
    });

    it('baut aus einem Namen keine Adresse mit Apostroph', () => {
        const f = helfer();
        // "N's" ist keine Art — lieber gar kein Bild als n's.png.
        assert.equal(f("N's"), '');
        assert.deepEqual(quellen(f("N's Zoroark")), ['R2/zoroark.png']);
    });

    it('nimmt einen echten Slug weiterhin unveraendert', () => {
        const f = helfer();
        assert.deepEqual(quellen(f('dragapult')), ['R2/dragapult.png']);
        assert.deepEqual(quellen(f('charizard-mega-x')), ['R2/charizard-mega-x.png']);
        assert.deepEqual(quellen(f('Dragapult')), ['R2/dragapult.png'], 'Grossschreibung ist ok');
    });

    it('ein Slug wird als Slug benutzt, nicht als Name nachgeschlagen', () => {
        // Ohne diese Unterscheidung faellt es nicht auf, wenn ALLES
        // durch die Namensaufloesung laeuft: fuer die meisten Woerter
        // kommt dabei zufaellig dasselbe heraus. Hier nicht — die
        // Tabelle fuehrt 'dragapult' als Archetyp-NAMEN mit einem
        // anderen Bild.
        const f = helfer({ dragapult: ['pikachu'], 'Mega Venusaur': ['snorlax'] });
        assert.deepEqual(quellen(f('dragapult')), ['R2/dragapult.png'],
            'der Slug wurde als Archetypname nachgeschlagen');
        // Gegenprobe mit einem NAMENSFOERMIGEN Schluessel: der muss
        // sehr wohl ueber die Tabelle laufen.
        assert.deepEqual(quellen(f('Mega Venusaur')), ['R2/snorlax.png'],
            'ein Name muss ueber die Tabelle laufen');
    });

    it('nimmt einen kuratierten Namen ueber die Tabelle', () => {
        const f = helfer({ 'Festival Lead': ['pikachu', 'raichu'] });
        assert.deepEqual(quellen(f('Festival Lead')), ['R2/pikachu.png', 'R2/raichu.png']);
    });

    it('erzeugt NIE eine Adresse mit Leerzeichen, Apostroph oder Prozentzeichen', () => {
        const f = helfer();
        const eingaben = ["N's", 'Mega Venusaur', 'Festival', 'Mega Greninja',
                          "Rocket's Mewtwo", 'Mega Charizard-X', 'Teal Mask Ogerpon',
                          'dragapult', '  ', '', null, undefined];
        const schlecht = eingaben.flatMap(e => quellen(f(e)))
            .filter(u => /[\s'%]/.test(u.replace(/^R2\//, '')));
        assert.deepEqual(schlecht, []);
    });

    it('bleibt bei leerer Eingabe stumm', () => {
        const f = helfer();
        for (const e of ['', '   ', null, undefined, 0]) assert.equal(f(e), '');
    });
});
