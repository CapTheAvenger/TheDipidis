'use strict';
/*
 * FE-19 (30.09.2026): Familien nach der Hauptkarte, nicht nach dem
 * Namensanfang. Die Funktionen werden aus js/app-past-meta.js geschnitten
 * und AUSGEFUEHRT — eine Textprobe waere gruen, waehrend die Regel kaputt
 * ist. Die Beispiele sind die Faelle aus der Messung
 * (scripts/messe_familien_hauptkarte.py, 30.09.2026): Banette ohne reinen
 * "Banette"-Archetyp, Gardevoir Mewtwo auf einer anderen Gardevoir-Karte,
 * Palkia auf "Origin Forme Palkia VSTAR", zwei Ogerpon-Familien.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PM = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'app-past-meta.js'), 'utf8');

function schneide(quelle, name) {
    const kopf = new RegExp('\\n {8}function ' + name + '\\(');
    const m = kopf.exec(quelle);
    assert.ok(m, name + ' fehlt in app-past-meta.js');
    const ende = quelle.indexOf('\n        }\n', m.index + 1);
    assert.ok(ende > m.index, name + ': Ende nicht gefunden');
    return quelle.slice(m.index, ende + 10);
}

function regel(quelle) {
    const kopfZeilen = quelle.match(/ {8}const HAUPTKARTE_ZUSATZ = [^\n]*\n {8}const HAUPTKARTE_POKEMON = [^\n]*\n/);
    assert.ok(kopfZeilen, 'die Konstanten der Hauptkartenregel fehlen');
    const code = kopfZeilen[0]
        + ['hauptkarteGrundname', 'hauptkarteTreffer', 'hauptkarteVon', 'familienNachHauptkarte']
            .map((n) => schneide(quelle, n)).join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(code + '\nreturn { hauptkarteGrundname, hauptkarteTreffer, hauptkarteVon, familienNachHauptkarte };')();
}

// Eine Karte, wie sie in deck.cards steht (Felder aus den Rotationen-CSV).
const karte = (name, set, nr, typ, listen) => ({ card_name: name, set_code: set, set_number: nr,
    type: typ || 'Basic', deck_inclusion_count: listen == null ? 10 : listen });
const eintrag = (archetype, karten) => ({ archetype, tournaments: [{ deck_name: archetype, cards: karten }] });

// Drucke derselben Karte, wie getInternationalPrintsForCard sie liefert.
const DRUCKE = {
    'SVI-88': ['SVI-88', 'SVI-229'], 'SVI-229': ['SVI-88', 'SVI-229'],
    'PAF-217': ['PAF-217', 'SVI-86'], 'SVI-86': ['PAF-217', 'SVI-86'],
};
const druckeVon = (set, nr) => DRUCKE[set + '-' + nr] || [set + '-' + nr];

const BESTAND = [
    eintrag('Banette Dusknoir', [karte('Banette ex', 'SVI', '88', 'Stage 1', 30), karte('Dusknoir', 'PRE', '37', 'Stage 2')]),
    eintrag('Banette Gardevoir', [karte('Banette ex', 'SVI', '229', 'Stage 1', 12), karte('Gardevoir ex', 'SVI', '86', 'Stage 2')]),
    eintrag('Gardevoir', [karte('Gardevoir ex', 'PAF', '217', 'Stage 2', 40)]),
    eintrag('Gardevoir Jellicent', [karte('Gardevoir ex', 'SVI', '86', 'Stage 2', 20), karte('Jellicent ex', 'TWM', '45', 'Stage 1')]),
    eintrag('Gardevoir Mewtwo', [karte('Gardevoir', 'ASR', 'TG5', 'Stage 2', 15), karte('Mewtwo V', 'CRZ', 'GG44')]),
    eintrag('Mega Gardevoir', [karte('Mega Gardevoir ex', 'ASC', '89', 'Stage 2', 25), karte('Gardevoir ex', 'SVI', '86', 'Stage 2', 5)]),
    eintrag('Palkia', [karte('Origin Forme Palkia VSTAR', 'ASR', '40', 'VSTAR', 0), karte('Origin Forme Palkia V', 'ASR', '39', 'Basic', 30)]),
    eintrag('Palkia Noctowl', [karte('Origin Forme Palkia V', 'ASR', '39', 'Basic', 12), karte('Noctowl', 'SCR', '115', 'Stage 1')]),
    eintrag('Ogerpon Box', [karte('Teal Mask Ogerpon ex', 'TWM', '25', 'Basic', 30)]),
    eintrag('Ogerpon Meganium', [karte('Teal Mask Ogerpon ex', 'TWM', '25', 'Basic', 30), karte('Meganium', 'SCR', '10', 'Stage 2')]),
    eintrag('Ogerpon Mimikyu', [karte('Cornerstone Mask Ogerpon ex', 'TWM', '112', 'Basic', 30)]),
    eintrag('Ogerpon Noivern', [karte('Cornerstone Mask Ogerpon ex', 'TWM', '112', 'Basic', 20)]),
    eintrag('Ancient Box', [karte('Roaring Moon', 'PAR', '124'), karte('Flutter Mane', 'TEF', '78')]),
];

describe('FE-19: die Hauptkarte bestimmt die Familie', () => {
    const R = regel(PM);
    const fam = R.familienNachHauptkarte(BESTAND, druckeVon);

    it('Banette bildet eine Familie, obwohl es kein reines "Banette" gibt', () => {
        assert.strictEqual(fam.get('Banette Dusknoir'), 'Banette');
        assert.strictEqual(fam.get('Banette Gardevoir'), 'Banette');
    });

    it('verbunden wird ueber die Drucke derselben Karte (SVI 88 und SVI 229)', () => {
        const h1 = R.hauptkarteVon('Banette Dusknoir', BESTAND[0].tournaments, druckeVon);
        const h2 = R.hauptkarteVon('Banette Gardevoir', BESTAND[1].tournaments, druckeVon);
        assert.deepStrictEqual([h1.id, h2.id], ['SVI-88', 'SVI-229']);
        assert.ok(h1.ids.includes('SVI-229') && h2.ids.includes('SVI-88'));
    });

    it('gleicher Name, andere Karte: Gardevoir Mewtwo gehoert nicht zu den Gardevoir-ex-Decks', () => {
        assert.strictEqual(fam.get('Gardevoir'), 'Gardevoir');
        assert.strictEqual(fam.get('Gardevoir Jellicent'), 'Gardevoir');
        assert.strictEqual(fam.get('Gardevoir Mewtwo'), undefined);
    });

    it('Mega Gardevoir baut sich um Mega Gardevoir ex, nicht um Gardevoir ex', () => {
        const h = R.hauptkarteVon('Mega Gardevoir', BESTAND[5].tournaments, druckeVon);
        assert.strictEqual(h.id, 'ASC-89');
        assert.strictEqual(fam.get('Mega Gardevoir'), undefined);
    });

    it('ein Formname davor zaehlt: "Origin Forme Palkia" traegt Palkia', () => {
        assert.strictEqual(fam.get('Palkia'), 'Palkia');
        assert.strictEqual(fam.get('Palkia Noctowl'), 'Palkia');
    });

    it('zwei Familien mit gleichem Namen heissen nach ihrer vollen Karte', () => {
        assert.strictEqual(fam.get('Ogerpon Box'), 'Teal Mask Ogerpon');
        assert.strictEqual(fam.get('Ogerpon Meganium'), 'Teal Mask Ogerpon');
        assert.strictEqual(fam.get('Ogerpon Mimikyu'), 'Cornerstone Mask Ogerpon');
    });

    it('ohne Hauptkarte wird keine Familie geraten', () => {
        assert.strictEqual(R.hauptkarteVon('Ancient Box', BESTAND[12].tournaments, druckeVon), null);
        assert.strictEqual(fam.get('Ancient Box'), undefined);
    });

    it('jeder Archetyp hat hoechstens eine Familie, und jede Familie mindestens zwei', () => {
        const groesse = new Map();
        fam.forEach((f) => groesse.set(f, (groesse.get(f) || 0) + 1));
        groesse.forEach((n, f) => assert.ok(n >= 2, f + ' hat nur ' + n + ' Mitglied'));
    });
});

describe('FE-19: Verfaelschungsproben', () => {
    const lauf = (quelle) => regel(quelle).familienNachHauptkarte(BESTAND, druckeVon);
    const ersetze = (alt, neu) => {
        assert.ok(PM.includes(alt), 'Probestelle fehlt: ' + alt);
        return PM.replace(alt, neu);
    };

    it('nur der ganze Kartenname statt auch seines hinteren Teils', () => {
        const M = lauf(ersetze('for (let i = 0; i < woerter.length; i++) {', 'for (let i = 0; i < 1; i++) {'));
        assert.strictEqual(M.get('Palkia'), undefined, 'die Probe beisst nicht');
    });

    it('ohne die Drucke derselben Karte', () => {
        const M = lauf(ersetze('(druckeVon ? (druckeVon(best.e.set, best.e.nr) || []) : [])', '[]'));
        assert.strictEqual(M.get('Banette Dusknoir'), undefined, 'die Probe beisst nicht');
    });

    it('ueber den Namen verbunden statt ueber die Karte', () => {
        const M = lauf(ersetze('h.ids.forEach(function (id) {', '[h.teil].forEach(function (id) {'));
        assert.strictEqual(M.get('Gardevoir Mewtwo'), 'Gardevoir', 'die Probe beisst nicht');
    });

    it('gleichnamige Familien ohne Umbenennung', () => {
        const M = lauf(ersetze('if (gleicherName.get(f.name) > 1) f.name = f.grund;', ''));
        assert.notStrictEqual(M.get('Ogerpon Box'), 'Teal Mask Ogerpon', 'die Probe beisst nicht');
    });
});
