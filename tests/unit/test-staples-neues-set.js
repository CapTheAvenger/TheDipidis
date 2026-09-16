/**
 * „Neues Set" — der Filter, der seit seinem Bau leer war
 * =====================================================
 *
 * GEMELDET am 16.09.2026, nachdem ich dem Betreiber eine Rotation als
 * Ursache verkauft hatte, die es nicht gab: "welche Rotation? das neue
 * Set kommt erst heute!"
 *
 * Er hatte recht. `current_set` steht seit dem 17.07.2026 auf PBL.
 * Die wirkliche Ursache, gemessen an data/current_meta_card_data.csv
 * am 16.09.2026 (61 Archetypen, 518 Namen):
 *
 *     Gwynn      24,6 %   15 von 61 Archetypen   <- die staerkste PBL-Karte
 *     Dark Bell  19,7 %   12 von 61
 *     Drilbur     8,2 %    5 von 61
 *
 * Fuer die 25-%-Schwelle der Kartenarten braeuchte Gwynn 16 Archetypen.
 * Es fehlte EINER — und deshalb war die Liste „Neues Set" leer, seit sie
 * am 11.09.2026 gebaut wurde. Kein Fehler in den Daten, sondern eine
 * Schwelle, die die falsche Frage beantwortet.
 *
 * DIE ZWEITE ANWEISUNG desselben Tages: "Nur die meiste genutzten
 * Karten aus dem neuen Set muessen halt sofort in dem Fall von PBL auf
 * 30C umspringen aber halt auch erst ab 1 Tag nach Release."
 *
 * Geprueft wird hier die AUSWAHLREGEL, ausgefuehrt — nicht ihre
 * Schreibweise. Der Block wird woertlich aus js/app-tier-meta.js
 * geschnitten und in einem vm-Kontext aufgerufen; eine Nachbildung
 * bliebe gruen, waehrend die Seite etwas anderes tut.
 *
 * VERFAELSCHUNGSPROBE (16.09.2026, jede einzeln ausgefuehrt):
 *   `tag > erschienen`      -> `>=`   : Fall "Erscheinungstag" faellt um
 *   `>= STAPLES_NEUES_SET_MIN_ARCHETYPEN` -> `>= 1` : Fall "ein Archetyp" faellt um
 *   `kartenSets(c).indexOf` -> `String(c.set_code||'')...===` : Fall "Nachdruck" faellt um
 *   `neuesSetCode()`        -> `fw.current_set`  : Fall "springt um" faellt um
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'app-tier-meta.js'), 'utf8');

function schneide(start, ende) {
    const a = QUELLE.indexOf(start);
    assert.ok(a > -1, 'Anker nicht gefunden: ' + start);
    const b = QUELLE.indexOf(ende, a);
    assert.ok(b > a, 'Endanker nicht gefunden: ' + ende);
    return QUELLE.slice(a, b);
}

const REGELN = schneide('const STAPLES_ART_SCHWELLE', 'function staplesAnzahl()');

/** Die Regeln mit einem gesetzten Formatfenster laden. */
function lade(formatFenster) {
    const kasten = {
        Number, String, Object, Array, Math, Date,
        localStorage: null,
        window: { _formatWindow: formatFenster || null }
    };
    vm.createContext(kasten);
    vm.runInContext(REGELN + `
        this._waehle = staplesNachArt;
        this._setCode = neuesSetCode;
        this._min = STAPLES_NEUES_SET_MIN_ARCHETYPEN;
        this._schwelle = STAPLES_ART_SCHWELLE;
        this._max = STAPLES_ART_MAX;`, kasten);
    return kasten;
}

/** Eine Karte, wie sie aus der Zusammenfassung nach Namen herauskommt. */
function karte(name, sets, archetypen, anteil) {
    return {
        name: name,
        type: 'Item',
        set_code: sets[0],
        set_codes: sets,
        deck_inclusion_count: archetypen,
        global_share: anteil
    };
}

const FENSTER = {
    current_set: 'PBL',
    neuestes_set: '30C',
    neuestes_set_release_date: '2026-09-16',
    neues_set_filter_ab: '2026-09-17'
};

/* Dasselbe Fenster, aber mit einem Erscheinungsdatum, das SICHER
   vorbei ist. staplesNachArt() fragt neuesSetCode() ohne Datum — es
   nimmt also den echten heutigen Tag, und das soll es auch: die
   Auswahlregel bekommt keine Testklappe eingebaut. Wer die Karenz
   selbst pruefen will, ruft neuesSetCode(tag) direkt auf (oben). */
const FENSTER_AKTIV = {
    current_set: 'PBL',
    neuestes_set: '30C',
    neuestes_set_release_date: '2026-01-01',
    neues_set_filter_ab: '2026-01-02'
};

describe('Welches Set „Neues Set" meint', () => {
    it('am Erscheinungstag steht noch das vorherige Set da', () => {
        /* Woertliche Anweisung: "aber halt auch erst ab 1 Tag nach
           Release". Am 16.09. selbst also PBL, nicht 30C. */
        const R = lade(FENSTER);
        assert.equal(R._setCode('2026-09-16'), 'PBL');
        assert.equal(R._setCode('2026-09-15'), 'PBL');
    });

    it('einen Tag nach dem Erscheinen springt es um', () => {
        const R = lade(FENSTER);
        assert.equal(R._setCode('2026-09-17'), '30C');
        assert.equal(R._setCode('2026-11-02'), '30C');
    });

    it('das ERSCHIENENE Set zaehlt, nicht das laufende Format', () => {
        /* Der Ankerriegel in backend/core/update_sets.py haelt
           current_set auf PBL, solange keine Turnierliste 30C belegt —
           richtig fuer das Format, falsch fuer die Frage "was ist neu".
           Faende der Filter hier PBL, waere er wieder das, was er vorher
           war: eine zweite Ansicht des laufenden Formats. */
        const R = lade(FENSTER);
        assert.notEqual(R._setCode('2026-09-17'), FENSTER.current_set);
    });

    it('ohne die neuen Felder bleibt es beim laufenden Set', () => {
        /* Ein altes format_window.json darf den Filter nicht abwerfen. */
        const R = lade({ current_set: 'PBL' });
        assert.equal(R._setCode('2026-09-17'), 'PBL');
    });

    it('ohne Formatfenster trifft nichts zu — und es fliegt nicht', () => {
        const R = lade(null);
        assert.equal(R._setCode('2026-09-17'), '');
        assert.deepEqual(R._waehle([karte('X', ['30C'], 9, 90)], 'neuesSet').length, 0);
    });
});

describe('Die Schwelle fuer „Neues Set" ist eine andere', () => {
    it('die 25 % der Kartenarten gelten hier NICHT', () => {
        /* Genau der Fund vom 16.09.2026: die staerkste PBL-Karte lag bei
           24,6 %. Unter der alten Regel war die ganze Liste leer. */
        const R = lade(FENSTER_AKTIV);
        const daten = [karte('Gwynn', ['30C'], 15, 24.6)];
        assert.ok(R._schwelle > 24.6, 'Vorbedingung: 24,6 % liegt unter der Artenschwelle');
        assert.deepEqual(R._waehle(daten, 'neuesSet').map(c => c.name), ['Gwynn']);
    });

    it('eine Karte in genau einem Archetyp ist die Techkarte eines Decks', () => {
        const R = lade(FENSTER_AKTIV);
        const daten = [
            karte('nur ein Deck', ['30C'], 1, 1.6),
            karte('zwei Decks',   ['30C'], 2, 3.3)
        ];
        assert.deepEqual(R._waehle(daten, 'neuesSet').map(c => c.name), ['zwei Decks']);
        assert.equal(R._min, 2, 'Die Regel meint "mehr als ein Deck" — nicht eine runde Zahl');
    });

    it('hoechstens zehn, und die meistgespielten zuerst', () => {
        const R = lade(FENSTER_AKTIV);
        const daten = [];
        for (let i = 0; i < 25; i++) daten.push(karte('K' + i, ['30C'], 25 - i, 40 - i));
        const treffer = R._waehle(daten, 'neuesSet');
        assert.equal(treffer.length, R._max);
        assert.equal(treffer[0].name, 'K0');
    });
});

describe('Welche Karten als Karten des neuen Sets gelten', () => {
    it('ein Nachdruck im neuen Set zaehlt dazu — auch wenn die erste Zeile ein anderes Set nennt', () => {
        /* GEMESSEN am 16.09.2026: 37 Namen tragen PBL in der ERSTEN
           gelesenen Zeile, 39 in irgendeiner. Chi-Yu (MEG/PBL/TWM) und
           Slowpoke fielen allein wegen der Zeilenfolge heraus — und die
           Zeilenfolge ist keine Entscheidung. */
        const R = lade(FENSTER_AKTIV);
        const daten = [karte('Chi-Yu', ['MEG', '30C', 'TWM'], 15, 24.6)];
        assert.deepEqual(R._waehle(daten, 'neuesSet').map(c => c.name), ['Chi-Yu']);
    });

    it('eine Karte ohne Druck im neuen Set bleibt draussen', () => {
        const R = lade(FENSTER_AKTIV);
        const daten = [karte('Boss’s Orders', ['PBL', 'TWM'], 40, 65.6)];
        assert.deepEqual(R._waehle(daten, 'neuesSet'), []);
    });

    it('fehlt set_codes ganz, zaehlt weiter set_code', () => {
        /* Aeltere Zwischenstaende und die Bildkarte reichen Objekte
           ohne das neue Feld herein. */
        const R = lade(FENSTER_AKTIV);
        const c = { name: 'Alt', type: 'Item', set_code: '30C',
                    deck_inclusion_count: 5, global_share: 8.2 };
        assert.deepEqual(R._waehle([c], 'neuesSet').map(x => x.name), ['Alt']);
    });
});
