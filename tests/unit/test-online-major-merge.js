'use strict';
/*
 * "Deckliste kopieren" ergab wieder keine 60 Karten — diesmal aus einem
 * anderen Grund als am 30.08.
 *
 * BEFUND (01.09.2026)
 * -------------------
 * mergeOnlineMajorAdditive() zaehlt Online + Major additiv:
 *
 *     average_count_overall = (online_tc + major_tc) / (onlineTotal + majorTotal)
 *
 * Die Zaehlung von onlineTotal filtert auf 'Meta Live'. Die Gruppierung
 * der Karten daneben tat es NICHT. Beim Filter 'all' enthaelt onlineRows
 * aber auch die 'Meta Play!'-Zeilen derselben Datei, und die zaehlen ueber
 * eine andere Deckbasis. Ihr total_count landete per max() im Zaehler,
 * waehrend der Nenner die Meta-Live-Deckzahl blieb.
 *
 * Gemessen an data/current_meta_card_data.csv, Stand 01.09.2026:
 *
 *     Dragapult             60,00 Karten je Deck  ->  139,55
 *     Alakazam Dudunsparce  60,00                 ->   67,80
 *     Slowking              60,00                 ->   61,85
 *     Mega Excadrill        60,00                 ->   61,30
 *
 * Sichtbar wurde es erst an diesem Tag, weil der planmaessige Datenlauf
 * zum ersten Mal 'Meta Play!'-Zeilen fuer dieses Format schrieb. Die
 * Folge stand nicht als Warnung auf dem Schirm: verteileKopienAufDeck-
 * groesse() sieht eine Rohsumme weit ausserhalb seiner Toleranz, gibt
 * basis:'ungerundet' zurueck, und die Kopierstelle faellt still auf
 * einzelnes Runden zurueck. In der Zwischenablage steht dann irgendeine
 * Zahl — nur keine 60.
 *
 * Was diese Tests halten:
 *   1. 'Meta Play!'-Zeilen kommen im Zaehler der Online-Seite nicht vor.
 *   2. Die Summe je Deck bleibt 60, auch wenn beide Quellen gemischt
 *      hereinkommen.
 *   3. Am ECHTEN Datenbestand: fuer jeden Archetyp liegt die gemischte
 *      Rohsumme so nah an 60, dass die Verteilung greift — also genau
 *      die Bedingung, an der die Kopierfunktion haengt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');

// ── Die Funktion aus der Datei holen ────────────────────────────────
// app-current-meta-analysis.js im Ganzen braucht ein Fenster mit DOM;
// hier wird nur der Abschnitt von stripExSuffix bis zum Ende von
// mergeOnlineMajorAdditive geladen. Die Umgebung wird gestellt.
function ladeMerge() {
    const quelle = lies('js/app-current-meta-analysis.js');
    const von = quelle.indexOf('        function stripExSuffix(name) {');
    assert.ok(von > 0, 'stripExSuffix nicht gefunden');
    const marke = 'return merged;\n        }';
    const bis = quelle.indexOf(marke, von);
    assert.ok(bis > von, 'Ende von mergeOnlineMajorAdditive nicht gefunden');
    const abschnitt = quelle.slice(von, bis + marke.length);
    assert.ok(/function mergeOnlineMajorAdditive/.test(abschnitt),
        'der ausgeschnittene Abschnitt enthaelt die Funktion nicht');
    const bauen = new Function(
        'parseLocaleNumber', 'devLog', 'filterTournamentRowsByMetaDate',
        abschnitt + '\nreturn mergeOnlineMajorAdditive;');
    return bauen(
        (w, s) => {
            const n = parseFloat(String(w == null ? '' : w).replace(',', '.'));
            return isFinite(n) ? n : (s || 0);
        },
        () => {},
        (r) => r
    );
}

const merge = ladeMerge();

const zahl = (w) => {
    const n = parseFloat(String(w == null ? '' : w).replace(',', '.'));
    return isFinite(n) ? n : 0;
};
const summeJeDeck = (reihen) =>
    reihen.reduce((s, r) => s + zahl(r.average_count_overall), 0);

// Online-Zeile: eine Karte, ihr Gesamtvorkommen ueber `decks` Decks.
const OL = (name, tc, decks, meta) => ({
    archetype: 'Testdeck', card_name: name, total_count: String(tc),
    deck_count: String(Math.min(decks, tc)), deck_inclusion_count: String(Math.min(decks, tc)),
    max_count: '4', total_decks_in_archetype: String(decks),
    // Wie in der echten CSV: die Zeile traegt den fertigen Schnitt mit.
    // Ohne ihn koennte der Durchreichepfad unten gar nicht geprueft werden.
    average_count_overall: (tc / decks).toFixed(2).replace('.', ','),
    average_count: (tc / Math.min(decks, tc)).toFixed(2).replace('.', ','),
    meta: meta || 'Meta Live', set_code: 'TST', set_number: '1', type: 'Item',
});
// Turnierzeile (Major-Seite).
const TR = (name, tc, decks) => ({
    tournament_id: '900', tournament_name: 'Test Cup', archetype: 'Testdeck',
    card_name: name, total_count: String(tc), deck_inclusion_count: String(Math.min(decks, tc)),
    max_count: '4', total_decks_in_archetype: String(decks),
    set_code: 'TST', set_number: '1', type: 'Item',
});

// Ein Deck aus vier Karten zu je 15 Kopien pro Deck — Summe 60.
function online(decks, meta) {
    return ['Alpha', 'Beta', 'Gamma', 'Delta'].map(n => OL(n, 15 * decks, decks, meta));
}
function major(decks) {
    return ['Alpha', 'Beta', 'Gamma', 'Delta'].map(n => TR(n, 15 * decks, decks));
}

describe('mergeOnlineMajorAdditive — Meta Play! gehoert nicht in den Zaehler', () => {

    it('haelt 60 Karten je Deck, wenn nur Meta Live hereinkommt', () => {
        const raus = merge(online(20), major(10), 'Testdeck');
        assert.strictEqual(Math.round(summeJeDeck(raus)), 60);
    });

    it('haelt 60 auch dann, wenn Meta-Play!-Zeilen mitkommen', () => {
        // Genau die Lage vom 01.09.2026: dieselbe Datei liefert beide
        // Quellen, die Play!-Zeilen zaehlen ueber eine andere Deckbasis.
        //
        // Die Play!-Seite steht hier bewusst auf MEHR Decks als die
        // Live-Seite (30 gegen 20). Andersherum haette die max()-Bildung
        // im Zaehler den Fehler zufaellig verdeckt: der Live-Wert ist dann
        // ohnehin der groessere, und der Test bliebe gruen, ohne etwas zu
        // beweisen. Nachgemessen — mit 8 statt 30 schlaegt er nicht an.
        const gemischt = online(20).concat(online(30, 'Meta Play!'));
        const raus = merge(gemischt, major(10), 'Testdeck');
        const summe = summeJeDeck(raus);
        assert.ok(Math.abs(summe - 60) < 0.5,
            `Summe je Deck ist ${summe.toFixed(2)} statt 60 — die Play!-Zeilen `
            + 'landen im Zaehler, obwohl der Nenner sie nicht kennt');
    });

    it('nimmt die Deckbasis der Play!-Zeilen auch nicht in den Nenner', () => {
        const nurLive = merge(online(20), major(10), 'Testdeck');
        const gemischt = merge(online(20).concat(online(30, 'Meta Play!')),
            major(10), 'Testdeck');
        assert.strictEqual(
            String(gemischt[0].total_decks_in_archetype),
            String(nurLive[0].total_decks_in_archetype),
            'die Play!-Decks veraendern die Gesamtzahl der Decks');
    });

    it('gibt ohne Major-Seite nur die Online-Zeilen heraus, nicht die Mischung', () => {
        // BEFUND (01.09.2026): faellt die Zusammenfuehrung weg — kein
        // Turnier im Fenster, Archetyp dort nicht vertreten — lief die
        // gemischte Eingabe unveraendert weiter. Summe je Deck: 120 statt
        // 60, an sechs Archetypen gemessen (Dhelmise Pbl, Toucannon Pbl,
        // Basic Box M, Mega Lucario, Mega Absol Box, "Other").
        const gemischt = online(20).concat(online(30, 'Meta Play!'));
        const raus = merge(gemischt, [], 'Testdeck');
        assert.ok(raus.every(r => String(r.meta || '').startsWith('Meta Live')),
            'die Play!-Zeilen laufen ungerechnet weiter: '
            + [...new Set(raus.map(r => r.meta))].join(', '));
        const summe = summeJeDeck(raus);
        assert.ok(Math.abs(summe - 60) < 0.5, `Summe je Deck ${summe.toFixed(2)} statt 60`);
    });

    it('laesst eine reine Play!-Auswahl unveraendert durch', () => {
        // Ohne eine einzige Meta-Live-Zeile gibt es keine Online-Seite,
        // aus der additiv gerechnet werden koennte: onlineTotal bleibt 0
        // und die Funktion gibt die Eingabe unveraendert zurueck, statt
        // die Zeilen still gegen die Major-Seite auszutauschen.
        const nurPlay = online(8, 'Meta Play!');
        const raus = merge(nurPlay, major(10), 'Testdeck');
        assert.strictEqual(raus.length, nurPlay.length);
        assert.strictEqual(raus[0], nurPlay[0]);
    });
});

// ── Am echten Bestand ───────────────────────────────────────────────

function liesCsv(rel) {
    const text = lies(rel).replace(/^﻿/, '');
    const zeilen = text.split(/\r?\n/).filter(z => z.trim());
    const kopf = zeilen[0].split(';');
    return zeilen.slice(1).map(z => {
        const f = z.split(';');
        const o = {};
        kopf.forEach((k, i) => { o[k] = f[i]; });
        return o;
    });
}

describe('mergeOnlineMajorAdditive am echten Datenbestand', () => {
    const kartenDatei = 'data/current_meta_card_data.csv';
    const alle = liesCsv(kartenDatei);
    // Das laufende Format, so wie die Seite es bestimmt — nicht die
    // alphabetisch letzte Datei. Mit dem falschen Format faende der Merge
    // keine Turnierzeilen, gaebe die Eingabe unveraendert zurueck, und der
    // Test unten wuerde nur noch die Rohdaten summieren statt die Funktion.
    const fenster = JSON.parse(lies('data/format_window.json'));
    const formatKey = `${fenster.oldest_legal_set}-${fenster.current_set}`;
    const turnierDatei = `tournament_cards_data_cards_${formatKey}.csv`;
    assert.ok(fs.existsSync(path.join(wurzel, 'data', turnierDatei)),
        `${turnierDatei} fehlt — das laufende Format hat keine Turnierdaten`);
    const turnier = liesCsv('data/' + turnierDatei);

    it('der Bestand traegt beide Quellen — sonst prueft der Rest nichts', () => {
        const live = alle.filter(r => String(r.meta || '').startsWith('Meta Live')).length;
        const play = alle.filter(r => r.meta === 'Meta Play!').length;
        assert.ok(live > 100, `nur ${live} Meta-Live-Zeilen`);
        assert.ok(play > 0,
            'keine Meta-Play!-Zeilen im Bestand — genau diese Zeilen loesten '
            + 'den Befund aus, ohne sie greift der Test unten ins Leere');
    });

    it('jeder Archetyp bleibt nah genug an 60, dass die Verteilung greift', () => {
        // 0,5 ist die Toleranz von verteileKopienAufDeckgroesse(). Reisst
        // ein Archetyp sie, faellt die Kopierstelle still auf einzelnes
        // Runden zurueck — und genau das ist der Fehler, den der Nutzer sieht.
        const TOLERANZ = 0.5;
        const archetypen = [...new Set(alle
            .filter(r => String(r.meta || '').startsWith('Meta Live'))
            .map(r => r.archetype))].filter(Boolean);
        assert.ok(archetypen.length > 20, 'zu wenige Archetypen — Test greift ins Leere');

        const schlecht = [];
        let gemischt = 0;
        archetypen.forEach(a => {
            const reihen = alle.filter(r => r.archetype === a);
            const raus = merge(reihen, turnier, a);
            if (!Array.isArray(raus) || raus.length === 0) return;
            // Der Merge gibt die Eingabe unveraendert zurueck, wenn es keine
            // Major-Seite gibt. Dann steht die Mischung aus beiden Quellen
            // noch drin und die Summe ist zwangslaeufig zu hoch — das ist ein
            // eigener Befund und gehoert in den Test darunter, nicht hierher.
            if (!raus.every(r => r.meta === 'Meta Online+Major')) return;
            gemischt += 1;
            const summe = summeJeDeck(raus);
            if (Math.abs(summe - 60) > TOLERANZ) schlecht.push(`${a}: ${summe.toFixed(2)}`);
        });
        assert.ok(gemischt >= 5,
            `nur ${gemischt} Archetypen wurden wirklich zusammengefuehrt — Test greift ins Leere`);
        assert.deepStrictEqual(schlecht, [],
            'diese Archetypen ergeben keine 60 Karten:\n  ' + schlecht.join('\n  '));
    });
});


// ── Die Set-Kuerzel, die abgeschnitten werden ───────────────────────

describe('stripExSuffix deckt die Set-Kuerzel im echten Bestand ab', () => {
    /* BEFUND (01.09.2026): die Liste in stripExSuffix() ist von Hand
       gepflegt und hatte PBL nicht — also ausgerechnet das laufende Set.
       Folge: "Dhelmise Pbl" wurde links nicht abgeschnitten, rechts schon,
       der Vergleich griff nie, und die Major-Seite fiel still weg.

       Eine Liste, die bei jeder Rotation von Hand nachgezogen werden muss,
       zieht ihren Fehler leise ein. Dieser Test holt die Kuerzel aus den
       Daten und schlaegt an, bevor jemand es merkt. */
    const stripExSuffix = (function () {
        const quelle = lies('js/app-current-meta-analysis.js');
        const von = quelle.indexOf('        function stripExSuffix(name) {');
        const bis = quelle.indexOf('\n        }', von);
        return new Function(quelle.slice(von, bis + 10) + '\nreturn stripExSuffix;')();
    })();

    const setCodes = (function () {
        const text = lies('data/all_cards_database.csv').replace(/^﻿/, '');
        const zeilen = text.split(/\r?\n/);
        const kopf = zeilen[0].split(',');
        const i = kopf.indexOf('set');
        assert.ok(i >= 0, 'Spalte "set" fehlt in data/all_cards_database.csv');
        const raus = new Set();
        zeilen.slice(1).forEach(z => {
            const c = (z.split(',')[i] || '').trim().toLowerCase();
            if (c) raus.add(c);
        });
        return raus;
    })();

    it('kennt genug Sets, um ueberhaupt etwas zu pruefen', () => {
        assert.ok(setCodes.size > 50, `nur ${setCodes.size} Set-Kuerzel gefunden`);
    });

    it('schneidet jedes Kuerzel ab, das im Bestand als Endung vorkommt', () => {
        const archetypen = [...new Set(
            liesCsv('data/current_meta_card_data.csv').map(r => r.archetype))]
            .filter(Boolean);
        const betroffen = archetypen.filter(a => {
            const teile = String(a).trim().split(/\s+/);
            return teile.length > 1 && setCodes.has(teile[teile.length - 1].toLowerCase());
        });
        assert.ok(betroffen.length > 0,
            'kein Archetypname traegt ein Set-Kuerzel — der Test greift ins Leere');
        const offen = betroffen.filter(a => stripExSuffix(a) === a);
        assert.deepStrictEqual(offen, [],
            'diese Set-Kuerzel fehlen in stripExSuffix() — nach jeder Rotation '
            + 'nachtragen:\n  ' + offen.join('\n  '));
    });

    it('haelt beide Listen im Gleichschritt', () => {
        // Dieselbe Aufzaehlung steht ein zweites Mal in app-meta-cards.js.
        // Laufen sie auseinander, schneidet die eine Ansicht ab, was die
        // andere stehen laesst — und die Namen passen nicht mehr zusammen.
        const holen = (datei) => {
            const m = lies(datei).match(/\(\?:|\((asc\|[a-z0-9|]+)\)/);
            const roh = lies(datei).match(/asc\|[a-z0-9|]+/);
            assert.ok(roh, `keine Set-Kuerzel-Liste in ${datei}`);
            return roh[0].split('|').sort().join('|');
        };
        assert.strictEqual(
            holen('js/app-current-meta-analysis.js'),
            holen('js/app-meta-cards.js'),
            'die Set-Kuerzel-Listen in app-current-meta-analysis.js und '
            + 'app-meta-cards.js sind auseinandergelaufen');
    });
});
