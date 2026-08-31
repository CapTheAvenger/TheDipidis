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
