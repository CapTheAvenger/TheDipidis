/**
 * Die Attacken-Merkmale — und die elf Fähigkeiten, die daran hingen
 * =================================================================
 *
 * BEFUND 16.09.2026: der Schadensrechner konnte elf gemessene
 * Fähigkeiten nicht rechnen, alle aus demselben Grund — die
 * Attackendaten führten Typ, Stärke, Klasse, Genauigkeit, AP, Vorrang
 * und Ziel, aber **kein einziges Merkmal**. Ohne „ist eine
 * Faustattacke" kein Eisenfaust, ohne „macht Kontakt" kein
 * Krallenwucht.
 *
 * Der Rechner hat das ausgewiesen statt geraten. Der Betreiber am
 * selben Tag: *„genau geraten wird nicht, aber dann müssen wir die
 * Daten dringend belegen."*
 *
 * BELEGT seit scripts/build_champions_move_flags.py, Quelle ist die
 * Attackendatei des Kampfsimulators von Pokémon Showdown (MIT).
 * Gemessen beim ersten Lauf: **513 von 513** Champions-Attacken
 * gefunden, **keine** ohne Eintrag.
 *
 * Geprüft wird hier ZWEIERLEI:
 *   1. die Datei — Vollständigkeit, und die Lückenliste in BEIDE
 *      Richtungen (CLAUDE.md: „eine Karenz gehört an einen Beleg").
 *   2. das Verhalten — jede der elf Fähigkeiten wird an der echten
 *      Rechnung AUSGEFÜHRT, nicht im Quelltext gesucht.
 *
 * VERFÄLSCHUNGSPROBE (16.09.2026, jede einzeln):
 *   Eisenfaust-Zweig entfernt       -> „Eisenfaust verstärkt" fällt um
 *   Kugelsicher-Zweig entfernt      -> „Kugelsicher fängt ab" fällt um
 *   hatMerkmal gibt immer true      -> „greift nur beim Merkmal" fällt um
 *   Flauschigkeit-Zeile entfernt    -> „Flauschigkeit halbiert" fällt um
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => JSON.parse(fs.readFileSync(path.join(WURZEL, p), 'utf8'));

const kasten = { window: {}, console };
vm.createContext(kasten);
vm.runInContext(fs.readFileSync(path.join(WURZEL, 'js', 'champions-damage.js'), 'utf8'), kasten);
const CD = kasten.window.ChampionsDamage;

const MERKMALE = lies('data/champions_move_flags.json');
const RES = lies('data/champions_resources.json').entries;
const CHAMP_ATTACKEN = RES.filter(e => e.cat === 'move').map(e => e.en);

describe('Die Merkmalsdatei', () => {
    it('deckt jede Attacke ab, die der Bestand führt', () => {
        const fehlend = CHAMP_ATTACKEN.filter(n => !MERKMALE.attacken[n]);
        assert.deepEqual(fehlend, MERKMALE._meta.ohne_eintrag,
            'Die Lückenliste stimmt nicht mit der Wirklichkeit überein. '
            + `Wirklich ohne Eintrag: ${fehlend.length}, `
            + `in _meta.ohne_eintrag: ${MERKMALE._meta.ohne_eintrag.length}`);
    });

    it('die Lückenliste wird in BEIDE Richtungen gelesen', () => {
        /* Wächst sie, kennt Showdown eine Champions-Attacke nicht —
           dann ist der Name anders geschrieben oder die Attacke neu.
           Schrumpft sie, gehört die Zeile weg. Ein Friedhof entsteht
           genau dann, wenn niemand die zweite Richtung prüft. */
        MERKMALE._meta.ohne_eintrag.forEach(n => {
            assert.ok(CHAMP_ATTACKEN.indexOf(n) !== -1,
                `"${n}" steht in der Lückenliste, aber gar nicht mehr im Bestand — Zeile weg.`);
            assert.ok(!MERKMALE.attacken[n],
                `"${n}" steht in der Lückenliste UND hat einen Eintrag — die Liste ist ein Friedhof.`);
        });
        assert.ok(MERKMALE._meta.ohne_eintrag_stand,
            'Eine geduldete Lücke wird benannt UND datiert.');
    });

    it('sie ergänzt keine Attacke, die der Bestand nicht führt', () => {
        const fremd = Object.keys(MERKMALE.attacken).filter(n => CHAMP_ATTACKEN.indexOf(n) === -1);
        assert.deepEqual(fremd, [],
            'Diese Attacken stehen in der Merkmalsdatei, aber nicht im Bestand: ' + fremd.join(', '));
    });

    it('jedes Merkmal kommt überhaupt vor — sonst ist die Spalte tot', () => {
        /* Ohne diese Zeile könnte der Parser stillschweigend nur noch
           „contact" liefern und alles andere leer lassen; jede Regel,
           die daran hängt, wäre dann tot und niemand merkte es. */
        ['punch', 'bite', 'slicing', 'sound', 'pulse', 'bullet', 'contact'].forEach(f => {
            const n = Object.values(MERKMALE.attacken).filter(m => (m.flags || []).indexOf(f) !== -1).length;
            assert.ok(n > 0, `kein einziger Eintrag trägt "${f}"`);
        });
        const rueck = Object.values(MERKMALE.attacken).filter(m => m.recoil).length;
        const zusatz = Object.values(MERKMALE.attacken).filter(m => m.zusatzeffekt).length;
        assert.ok(rueck > 0, 'keine Attacke mit Rückstoß');
        assert.ok(zusatz > 0, 'keine Attacke mit Zusatzeffekt');
    });

    it('nennt Quelle, Lizenz und Erzeuger', () => {
        assert.ok(/pokemon-showdown/.test(MERKMALE._meta.quelle));
        assert.ok(/MIT/.test(MERKMALE._meta.lizenz));
        assert.ok(/build_champions_move_flags\.py/.test(MERKMALE._meta.erzeuger));
    });
});

// ── Das Verhalten ───────────────────────────────────────────────────

const A = { atk: 200, spa: 180 };
const V = { def: 120, spd: 130, hp: 190 };

function attacke(name) {
    const e = RES.filter(x => x.cat === 'move' && x.en === name)[0];
    assert.ok(e, 'Attacke nicht im Bestand: ' + name);
    const m = MERKMALE.attacken[name] || {};
    return Object.assign({}, e, {
        flags: m.flags || [], recoil: !!m.recoil, zusatzeffekt: !!m.zusatzeffekt,
    });
}

function rechne(name, seite, ability) {
    const grund = {
        move: attacke(name), attackerStats: A, defenderStats: V,
        attackerTypes: [], effectiveness: 1,
    };
    const zusatz = seite === 'def' ? { defender: { ability } } : { attacker: { ability } };
    return { ohne: CD.damageRange(grund), mit: CD.damageRange(Object.assign({}, grund, zusatz)) };
}

describe('Die elf Fähigkeiten rechnen jetzt', () => {
    [
        ['Iron Fist', 'Bullet Punch', 'att'],
        ['Strong Jaw', 'Crunch', 'att'],
        ['Sharpness', 'Night Slash', 'att'],
        ['Reckless', 'Flare Blitz', 'att'],
        ['Sheer Force', 'Iron Head', 'att'],
        ['Tough Claws', 'Iron Head', 'att'],
        ['Punk Rock', 'Boomburst', 'att'],
        ['Mega Launcher', 'Dark Pulse', 'att'],
    ].forEach(([ab, mv, seite]) => {
        it(`${ab} verstärkt ${mv}`, () => {
            const { ohne, mit } = rechne(mv, seite, ab);
            assert.ok(mit.max > ohne.max, `${ab} bewirkt nichts (${ohne.max} -> ${mit.max})`);
            assert.ok(mit.angewendet.indexOf(ab) !== -1, `${ab} steht nicht im Ergebnis`);
            assert.equal(mit.unbelegt.indexOf(ab), -1, `${ab} gilt weiter als unbelegt`);
        });
    });

    it('Flauschigkeit halbiert einen Kontakttreffer', () => {
        const { ohne, mit } = rechne('Iron Head', 'def', 'Fluffy');
        assert.ok(mit.max < ohne.max);
        assert.ok(mit.angewendet.indexOf('Fluffy') !== -1);
    });

    it('Rabauke halbiert einen Schalltreffer auf der Abwehrseite', () => {
        const { ohne, mit } = rechne('Boomburst', 'def', 'Punk Rock');
        assert.ok(mit.max < ohne.max);
    });

    [['Bulletproof', 'Shadow Ball'], ['Soundproof', 'Boomburst']].forEach(([ab, mv]) => {
        it(`${ab} fängt ${mv} ganz ab — und nennt den Grund`, () => {
            const { mit } = rechne(mv, 'def', ab);
            assert.ok(mit.immune, `${ab} fängt nicht ab`);
            assert.equal(mit.immunGrund, ab);
        });
    });
});

describe('Sie greifen NUR beim passenden Merkmal', () => {
    it('Eisenfaust lässt eine Attacke ohne Faust-Merkmal in Ruhe', () => {
        /* Eisenschädel macht Kontakt, ist aber keine Faustattacke —
           genau die Unterscheidung, für die es die Merkmale gibt. */
        assert.equal(CD.hatMerkmal(attacke('Iron Head'), 'punch'), false,
            'Vorbedingung: Eisenschädel darf kein Faust-Merkmal tragen');
        const { ohne, mit } = rechne('Iron Head', 'att', 'Iron Fist');
        assert.equal(mit.max, ohne.max, 'Eisenfaust verstärkt eine Nicht-Faustattacke');
    });

    it('Kugelsicher fängt eine Attacke ohne Ball-Merkmal nicht ab', () => {
        assert.equal(CD.hatMerkmal(attacke('Iron Head'), 'bullet'), false);
        const { mit } = rechne('Iron Head', 'def', 'Bulletproof');
        assert.ok(!mit.immune, 'Kugelsicher fängt etwas ab, das kein Ball ist');
    });

    it('ohne Merkmalsdatei greift keine der Regeln — statt zu raten', () => {
        /* Der Rückfall, wenn data/champions_move_flags.json fehlt: die
           Attacke kommt ohne `flags` an, und dann darf NICHTS
           verstärkt werden. */
        const nackt = { type: 'Steel', power: 80, damage_class: 'Physical' };
        const grund = { move: nackt, attackerStats: A, defenderStats: V,
            attackerTypes: [], effectiveness: 1 };
        const ohne = CD.damageRange(grund);
        ['Iron Fist', 'Tough Claws', 'Strong Jaw', 'Sharpness', 'Mega Launcher'].forEach(ab => {
            const mit = CD.damageRange(Object.assign({}, grund, { attacker: { ability: ab } }));
            assert.equal(mit.max, ohne.max, `${ab} verstärkt ohne Merkmalsdaten`);
        });
    });
});

describe('Was jetzt noch unbelegt ist', () => {
    it('ist genau eine Fähigkeit — und aus einem anderen Grund', () => {
        /* Stahlgeist wirkt vom PARTNER aus. Das ist keine Datenlücke,
           sondern eine Grenze dieses Rechners, und sie steht in der
           Liste, damit sie nicht für eine gehalten wird. */
        assert.deepEqual(Object.keys(CD.NICHT_BELEGT), ['Steely Spirit']);
        assert.ok(/Partner/.test(CD.NICHT_BELEGT['Steely Spirit']),
            'Der Grund muss sagen, dass es am Rechner liegt und nicht an den Daten.');
    });
});
