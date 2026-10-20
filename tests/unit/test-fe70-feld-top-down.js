'use strict';
/**
 * FE-70 — DIE ZUSAMMENSETZUNG DES METAS FOLGT DER PROGNOSE, VON OBEN NACH UNTEN.
 *
 * BEFUND (Abgleich Meta Call gegen Nizza, 20./21.10.2026): das Bild vom
 * 16.10. zeigte 30 Decks, aber nicht die 30 groessten der Prognose. Es
 * fehlten Ogerpon Meganium Arboliva (Rang 24), Mew Box (Rang 26, zugleich
 * Empfehlung #5) und Mega Starmie (Rang 27); dafuer stand Kangaskhan
 * Bouffalant (Rang 48) drin. Ursache: `metacall_feldauswahl_v1` speicherte
 * eine NAMENSLISTE, und die fror das Feld ein, waehrend sich die Prognose
 * bewegte.
 *
 * ENTSCHIEDEN (Hausi, 21.10.2026): „bei der Zusammensetzung des Metas
 * soll es top-down nach prognostiziertem Share sein". Gemerkt wird nur
 * noch die ANZAHL. Alles hier wird AUSGEFUEHRT, nicht gegriffen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { baue } = require('./lib-dom-sandkasten.js');

const MC = 'js/app-meta-call.js';

function shareList() {
    // Absichtlich NICHT nach Anteil sortiert — die Sortierung ist Teil der Pruefung.
    return [
        { name: 'Klein',  onlineShare: 1 },
        { name: 'Gross',  onlineShare: 40 },
        { name: 'Mittel', onlineShare: 20 },
        { name: 'Neu',    onlineShare: 25 },
        { name: 'Rand',   onlineShare: 4 },
        { name: 'Alt',    onlineShare: 10 },
    ];
}

function umgebung(o) {
    return baue(MC, [
        'function _feldAnzahlAusSpeicher(roh)',
        'function _feldSortiert()',
        'function _feldTeilung(sortiert)',
        'function _feldAuswahlSchluessel()',
    ], {
        TOP_N: 3,
        _shareList: shareList(),
        _prognoseAktiv: false,
        _prognoseRest: 0,
        _feldAuswahl: null,
        _feldAnzahl: o && o.anzahl !== undefined ? o.anzahl : null,
        _personalShares: (o && o.eigen) || {},
    });
}

const namen = (liste) => Array.from(liste, d => d.name);   // Array der Testwelt, nicht des vm

describe('FE-70: Feld von oben nach unten nach prognostiziertem Anteil', () => {
    it('ein alter Speicherstand mit Namen zaehlt nur noch als Anzahl', () => {
        const ctx = umgebung();
        // Der Stand vom 16.10.: eine Namensliste, darunter ein Deck vom Rand.
        assert.equal(ctx._feldAnzahlAusSpeicher({ decks: ['Alt', 'Klein', 'Rand'] }), 3);
        assert.equal(ctx._feldAnzahlAusSpeicher({ anzahl: 30 }), 30);
        assert.equal(ctx._feldAnzahlAusSpeicher({ anzahl: 0 }), 0,
            '„Keine" darf nicht zur Voreinstellung werden');
        assert.equal(ctx._feldAnzahlAusSpeicher(null), null);
        assert.equal(ctx._feldAnzahlAusSpeicher({}), null);
    });

    it('die genannten Decks sind die n groessten, absteigend', () => {
        const ctx = umgebung({ anzahl: 3 });
        const t = ctx._feldTeilung();
        assert.deepEqual(namen(t.genannt), ['Gross', 'Neu', 'Mittel']);
        assert.deepEqual(namen(t.rest), ['Alt', 'Rand', 'Klein']);
    });

    it('ohne gemerkte Anzahl gilt die Voreinstellung TOP_N', () => {
        const t = umgebung({ anzahl: null })._feldTeilung();
        assert.deepEqual(namen(t.genannt), ['Gross', 'Neu', 'Mittel']);
    });

    it('steigt ein Deck in der Prognose, steht es im Feld — ohne Zutun', () => {
        /* Genau der Nizza-Fall: Mew Box stieg, die gemerkte Liste wusste es nicht. */
        const ctx = umgebung({ anzahl: 3 });
        ctx._shareList = ctx._shareList.map(d => d.name === 'Rand' ? { ...d, onlineShare: 30 } : d);
        assert.ok(namen(ctx._feldTeilung().genannt).includes('Rand'),
            'das gestiegene Deck fehlt im Feld');
    });

    it('ein Deck mit eigener Schaetzung bleibt einzeln, auch unterhalb von n', () => {
        const t = umgebung({ anzahl: 2, eigen: { Klein: 5 } })._feldTeilung();
        assert.deepEqual(namen(t.genannt), ['Gross', 'Neu', 'Klein']);
    });

    it('„Keine" heisst keine, nicht Voreinstellung', () => {
        assert.deepEqual(namen(umgebung({ anzahl: 0 })._feldTeilung().genannt), []);
    });

    it('gespeichert wird die Anzahl, nie eine Namensliste', () => {
        const speicher = {};
        const ctx = baue(MC, ['function _feldAuswahlMerken()'], {
            FELD_AUSWAHL_KEY: 'metacall_feldauswahl_v1',
            _feldAuswahl: new Set(['Gross', 'Klein']),
            _feldAnzahl: null,
            localStorage: {
                setItem: (k, v) => { speicher[k] = v; },
                removeItem: (k) => { delete speicher[k]; },
            },
        });
        ctx._feldAuswahlMerken();
        const roh = JSON.parse(speicher.metacall_feldauswahl_v1);
        assert.equal(roh.anzahl, 2);
        assert.equal(roh.decks, undefined, 'die Namensliste friert das Feld wieder ein');
    });

    it('die Kennung fuer den Zwischenspeicher aendert sich mit der Anzahl', () => {
        assert.notEqual(umgebung({ anzahl: 3 })._feldAuswahlSchluessel(),
                        umgebung({ anzahl: 4 })._feldAuswahlSchluessel());
    });
});

describe('Die Quellenzeile nennt den gemessenen Fehler der Prediction', () => {
    function zeile(verfahren) {
        const ctx = baue(MC, ['function _mctQuelleZeile(L)'], {
            _prognoseAktiv: true,
            _prognoseDatei: {
                meta: { online_von: '2026-10-02', online_bis: '2026-10-16', online_listen: 6833, fenster: 'TEF-30C' },
                modell: { anker: 12, mae_mittel: 0.46 },
                verfahren,
            },
            zahlLokal: (n) => String(n),
            _mcNum: (n, dp) => n.toFixed(dp).replace('.', ','),
            esc: (s) => s,
        });
        return ctx._mctQuelleZeile((d) => d);
    }
    it('mit Rueckblick: Turniere und Fehler aus der Datei', () => {
        const z = zeile({ rueckblick: { turniere: 15, decks: 25, mae: 0.9076 } });
        assert.match(z, /an 15 Majors/);
        assert.match(z, /25 größten Decks liegen im Mittel 0,9 Prozentpunkte/);
        assert.doesNotMatch(z, /0,5 Prozentpunkte/, 'der alte Online-Abstand steht wieder als Fehler da');
    });
    it('ohne Rueckblick bleibt die alte Zeile', () => {
        assert.match(zeile(null), /an 12 Regionals geprüft/);
    });
});

describe('Szenarien und Haken (Pruefagent 21.10.2026)', () => {
    function stand(o) {
        return baue(MC, [
            'function _feldAnzahlAusSpeicher(roh)',
            'function _feldAuswahlMerken()',
            'function _applyState(state, exakt)',
        ], {
            FELD_AUSWAHL_KEY: 'metacall_feldauswahl_v1',
            localStorage: { setItem() {}, removeItem() {} },
            _settings: {}, _personalShares: {}, _winRateOverrides: {}, _customDecks: [],
            _groupByMain: false, _feldAuswahl: null, _feldAnzahl: null,
            _ladeJournal() {},
        });
    }
    it('ein gespeichertes Szenario laedt nur die Anzahl', () => {
        const ctx = stand();
        ctx._applyState({ feldAuswahl: ['Alt', 'Rand', 'Klein'], feldAnzahl: 3 });
        assert.equal(ctx._feldAuswahl, null);
        assert.equal(ctx._feldAnzahl, 3);
    });
    it('der eigene Stand dieser Sitzung kommt exakt zurueck', () => {
        const ctx = stand();
        ctx._applyState({ feldAuswahl: ['Alt', 'Rand'], feldAnzahl: 2 }, true);
        assert.deepEqual(Array.from(ctx._feldAuswahl).sort(), ['Alt', 'Rand']);
    });
    it('der erste Haken-Klick behaelt ein Deck mit eigener Schaetzung', () => {
        const ctx = baue(MC, [
            'function _feldSortiert()', 'function _feldTeilung(sortiert)',
            'function _feldAuswahlMerken()', 'function _toggleFeldDeck(name)',
        ], {
            TOP_N: 2, _shareList: shareList(), _prognoseAktiv: false, _prognoseRest: 0,
            _feldAuswahl: null, _feldAnzahl: 2, _personalShares: { Klein: 5 },
            FELD_AUSWAHL_KEY: 'k', localStorage: { setItem() {}, removeItem() {} },
            _feldNeu() {},
        });
        ctx._toggleFeldDeck('Gross');
        assert.deepEqual(Array.from(ctx._feldAuswahl).sort(), ['Klein', 'Neu']);
    });
});
