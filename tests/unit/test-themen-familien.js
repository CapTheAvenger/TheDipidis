'use strict';
/*
 * FE-20, FE-21, FE-22, DA-29 (01.10.2026): Themen-Familien per benannter
 * Liste (Mew, Future, Hop's) und Listen ohne Archetyp-Namen ("Decklist").
 * Die Funktionen werden aus js/app-past-meta.js geschnitten und AUSGEFUEHRT.
 * Verfaelschungsprobe unten: schneidet man die Hand-Liste heraus, fallen
 * die Familien weg; nimmt man "Decklist" aus der Ausschlussliste, steht es
 * wieder da.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PM = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-past-meta.js'), 'utf8');

function schneide(quelle, name) {
    const m = new RegExp('\\n {8}function ' + name + '\\(').exec(quelle);
    assert.ok(m, name + ' fehlt');
    const ende = quelle.indexOf('\n        }\n', m.index + 1);
    assert.ok(ende > m.index, name + ': Ende nicht gefunden');
    return quelle.slice(m.index, ende + 10);
}

function laden(quelle) {
    const hand = quelle.match(/ {8}const THEMEN_FAMILIEN = \{[\s\S]*?\n {8}\};\n/);
    const zusatz = quelle.match(/ {8}const HAUPTKARTE_ZUSATZ = [^\n]*\n {8}const HAUPTKARTE_POKEMON = [^\n]*\n/);
    const ohne = quelle.match(/ {8}const PM_OHNE_ARCHETYPNAMEN = [^\n]*\n/);
    assert.ok(zusatz && ohne, 'Konstanten fehlen');
    const code = (hand ? hand[0] : 'const THEMEN_FAMILIEN = {};\n') + zusatz[0] + ohne[0]
        + ['hauptkarteGrundname', 'hauptkarteTreffer', 'hauptkarteVon', 'familienNachHauptkarte', '_pmOhneArchetypName']
            .map((n) => schneide(quelle, n)).join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(code + '\nreturn { familienNachHauptkarte, _pmOhneArchetypName };')();
}

const eintrag = (a, karten) => ({ archetype: a, tournaments: [{ deck_name: a, cards: karten || [] }] });
const karte = (name, set, nr, typ) => ({ card_name: name, set_code: set, set_number: nr, type: typ || 'Basic', deck_inclusion_count: 10 });
const druckeVon = (s, n) => [s + '-' + n];

const BESTAND = [
    eintrag('Fusion Mew', [karte('Mew ex', 'MEW', '151')]),
    eintrag('Mew Genesect', [karte('Genesect V', 'FST', '185')]),
    eintrag('Future Box', [karte('Iron Hands ex', 'PAR', '70')]),
    eintrag('Future Iron Hands', [karte('Iron Hands ex', 'PAR', '70')]),
    eintrag('Future Thorns', [karte('Iron Thorns ex', 'TWM', '77')]),
    eintrag("Hop's Trevenant", [karte("Hop's Phantump", 'JTG', '3')]),
    eintrag("Hop's Zacian", [karte("Hop's Zacian ex", 'JTG', '111')]),
    eintrag('Mew Box', [karte('Mew ex', 'MEW', '151')]),
    eintrag('Lost Box Charizard', [karte('Charizard ex', 'OBF', '125', 'Stage 2')]),
    eintrag('Lost Box Paradox', [karte('Roaring Moon ex', 'PAR', '124')]),
    eintrag('Lost Zone Box', [karte('Comfey', 'LOR', '79')]),
    eintrag('Mega Lucario', [karte('Mega Lucario ex', 'MEG', '77', 'Stage 1')]),
    eintrag('Lucario Hariyama', [karte('Lucario', 'BRS', '78', 'Stage 1')]),
    eintrag('Festival Lead', [karte('Thwackey', 'TWM', '15')]),
    eintrag('Seaking Festival Lead', [karte('Seaking', 'TWM', '57')]),
    eintrag("Rocket's Honchkrow", [karte("Team Rocket's Murkrow", 'DRI', '117')]),
    eintrag("Rocket's Mewtwo", [karte("Team Rocket's Mewtwo ex", 'DRI', '81')]),
    eintrag("Rocket's Spidops", [karte("Team Rocket's Spidops", 'DRI', '19')]),
    eintrag('Roaring Moon', [karte('Roaring Moon ex', 'PAR', '124')]),
    eintrag('Roaring Moon Dudunsparce', [karte('Roaring Moon ex', 'PAR', '124'), karte('Dudunsparce', 'TWM', '128', 'Stage 1')]),
    eintrag('Roaring Moon LZ Box', [karte('Roaring Moon ex', 'PAR', '124')]),
    eintrag('Dragapult', [karte('Dragapult ex', 'TWM', '130', 'Stage 2')]),
];

describe('Themen-Familien (FE-20/21/22)', () => {
    const { familienNachHauptkarte } = laden(PM);

    it('Mew, Future und Hop\'s werden je eine Familie mit eigenem Namen', () => {
        const f = familienNachHauptkarte(BESTAND, druckeVon);
        assert.strictEqual(f.get('Fusion Mew'), 'Mew');
        assert.strictEqual(f.get('Mew Genesect'), 'Mew');
        ['Future Box', 'Future Iron Hands', 'Future Thorns'].forEach((a) => assert.strictEqual(f.get(a), 'Future', a));
        assert.strictEqual(f.get("Hop's Trevenant"), "Hop's");
        assert.strictEqual(f.get("Hop's Zacian"), "Hop's");
    });

    it('Lost Box und Lucario (Nachtrag 01.10.)', () => {
        const f = familienNachHauptkarte(BESTAND, druckeVon);
        ['Lost Box Charizard', 'Lost Box Paradox', 'Lost Zone Box'].forEach((a) => assert.strictEqual(f.get(a), 'Lost Box', a));
        assert.strictEqual(f.get('Mega Lucario'), 'Lucario');
        assert.strictEqual(f.get('Lucario Hariyama'), 'Lucario');
    });

    it('Roaring Moon LZ Box gehoert zur Lost Box, nicht zu Roaring Moon (Hausi 01.10.)', () => {
        const f = familienNachHauptkarte(BESTAND, druckeVon);
        assert.strictEqual(f.get('Roaring Moon LZ Box'), 'Lost Box');
        assert.strictEqual(f.get('Roaring Moon'), 'Roaring Moon');
        assert.strictEqual(f.get('Roaring Moon Dudunsparce'), 'Roaring Moon');
        assert.strictEqual(f.get('Lost Zone Box'), 'Lost Box');
    });

    it('VERFAELSCHUNG: ohne den Ausschluss zieht die geteilte Hauptkarte alles in eine Familie', () => {
        const kaputt = PM.replace('if (nurHand.has(e.archetype)) return;', '');
        assert.notStrictEqual(kaputt, PM, 'die Mutation hat nichts geaendert');
        const f = laden(kaputt).familienNachHauptkarte(BESTAND, druckeVon);
        assert.notStrictEqual(f.get('Roaring Moon'), 'Roaring Moon');
    });

    it('Festival Lead und Rocket\'s (Nachtrag 01.10.)', () => {
        const f = familienNachHauptkarte(BESTAND, druckeVon);
        assert.strictEqual(f.get('Festival Lead'), 'Festival Lead');
        assert.strictEqual(f.get('Seaking Festival Lead'), 'Festival Lead');
        ["Rocket's Honchkrow", "Rocket's Mewtwo", "Rocket's Spidops"].forEach((a) => assert.strictEqual(f.get(a), "Rocket's", a));
    });

    it('Decks ausserhalb der Liste bleiben einzeln', () => {
        const f = familienNachHauptkarte(BESTAND, druckeVon);
        assert.strictEqual(f.has('Dragapult'), false);
    });

    it('eine Familie braucht mindestens zwei Mitglieder nach dem Filter', () => {
        const nur = BESTAND.filter((e) => e.archetype !== 'Mew Genesect' && e.archetype !== 'Future Box' && e.archetype !== 'Future Thorns');
        const f = familienNachHauptkarte(nur, druckeVon);
        assert.strictEqual(f.has('Fusion Mew'), false);
        assert.strictEqual(f.has('Future Iron Hands'), false);
    });

    it('Mitglieder ohne Hauptkarte werden trotzdem verbunden', () => {
        const ohneKarten = ['Future Box', 'Future Thorns'].map((a) => eintrag(a, []));
        const f = familienNachHauptkarte(ohneKarten, druckeVon);
        assert.strictEqual(f.get('Future Box'), 'Future');
        assert.strictEqual(f.get('Future Thorns'), 'Future');
    });

    it('VERFAELSCHUNG: ohne die Hand-Liste gibt es keine Mew-/Future-/Hop\'s-Familie', () => {
        const kaputt = PM.replace(/ {8}const THEMEN_FAMILIEN = \{[\s\S]*?\n {8}\};\n/, '        const THEMEN_FAMILIEN = {};\n');
        assert.notStrictEqual(kaputt, PM, 'die Mutation hat nichts geaendert');
        const f = laden(kaputt).familienNachHauptkarte(BESTAND, druckeVon);
        assert.strictEqual(f.get('Mew Genesect'), undefined);
        assert.strictEqual(f.get("Hop's Zacian"), undefined);
    });
});

describe('Listen ohne Archetyp-Namen (DA-29)', () => {
    const { _pmOhneArchetypName } = laden(PM);

    it('"Decklist" gilt als ohne Namen, echte Archetypen nicht', () => {
        assert.strictEqual(_pmOhneArchetypName('Decklist'), true);
        assert.strictEqual(_pmOhneArchetypName(' decklist '), true);
        assert.strictEqual(_pmOhneArchetypName('Decklist Dragapult'), false);
        assert.strictEqual(_pmOhneArchetypName('Dragapult'), false);
    });

    it('processRow nutzt die Pruefung', () => {
        assert.ok(/deckArchetype === 'Unknown Deck' \|\| _pmOhneArchetypName\(deckArchetype\)\) return;/.test(PM));
    });

    it('VERFAELSCHUNG: ohne "Decklist" in der Liste gilt es wieder als Archetyp', () => {
        const kaputt = PM.replace("const PM_OHNE_ARCHETYPNAMEN = ['Decklist'];", 'const PM_OHNE_ARCHETYPNAMEN = [];');
        assert.notStrictEqual(kaputt, PM);
        assert.strictEqual(laden(kaputt)._pmOhneArchetypName('Decklist'), false);
    });
});
