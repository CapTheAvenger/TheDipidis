'use strict';
/*
 * Zwei Funktionen, die etwas anderes taten als draufstand.
 *
 * BEFUND 1 — "Deck kopieren" lieferte kein Deck.
 *
 * Ohne selbstgebautes Deck nahmen die Kopierfunktionen `max_count` —
 * die HOECHSTE Kopienzahl ueber ALLE ausgewerteten Listen. Gemessen:
 *
 *   Deck-Analyse (Global), Dragapult:  Anzeige "52 Karten / 60 Gesamt",
 *                                      Zwischenablage 109
 *   Deck-Analyse (Japan):              Anzeige "33 Karten / 60 Gesamt",
 *                                      Zwischenablage 74
 *   Vergangenes Meta:                  60  (macht es seit 29.08. richtig)
 *
 * Die Ausgabe traegt PTCGL-Abschnittskoepfe ("Pokémon: 39") und den
 * Hinweis "Deck copied to clipboard!" — sie sieht aus wie eine
 * Deckliste. Sie war keine, sondern ein Kartenpool. Wer sie in PTCGL
 * einfuegt, bekommt eine Fehlermeldung, und der Fehler steht nicht bei
 * ihm.
 *
 * Vergangenes Meta hatte denselben Fehler und hat ihn am 29.08. geloest
 * (getPastMetaRepresentativeCardCopies, mit ausfuehrlicher Begruendung
 * im Quelltext). Die beiden Geschwister ziehen jetzt nach: der
 * Mittelwert ist die repraesentative Kopienzahl, `max_count` nur dort,
 * wo es keinen Mittelwert gibt.
 *
 * BEFUND 2 — der "Raster"-Umschalter schaltete nicht um.
 *
 * Beide Zweige riefen nur `classList.add('d-none')` — es wurde etwas
 * versteckt und nie etwas eingeblendet. Drei Klicks nacheinander
 * gemessen: das Gitter blieb durchgehend 2404 px sichtbar, die Tabelle
 * durchgehend leer, und nur die Beschriftung kippte einmal um und nie
 * zurueck. Derselbe Knopf in drei Ansichten, zwei Verhalten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const GLOBAL = ohneKomm(lies('js/app-current-meta-analysis.js'));
const JAPAN  = ohneKomm(lies('js/app-city-league.js'));
const PAST   = ohneKomm(lies('js/app-past-meta.js'));

/** Der Zweig einer Kopierfunktion, der OHNE gebautes Deck laeuft. */
function ohneDeckZweig(quelle, fnName) {
    const i = quelle.indexOf('function ' + fnName);
    assert.notEqual(i, -1, fnName + ' ist verschwunden');
    const rumpf = quelle.slice(i, i + 9000);
    // Bis zum Sortieren schneiden — danach beginnt die Ausgabe.
    const ende = rumpf.indexOf('const sortedCards');
    assert.ok(ende > 0, fnName + ': das Sortieren ist verschwunden');
    const oben = rumpf.slice(0, ende);
    // Der Zweig ohne gebautes Deck ist der LETZTE else-Block davor. Der
    // erste Versuch suchte vor dem ERSTEN deckCards.push — und das ist
    // der Zweig MIT Deck, also stand der gesuchte else danach.
    const k = oben.lastIndexOf('} else {');
    assert.ok(k > 0, fnName + ': kein else-Zweig mehr');
    return oben.slice(k);
}

describe('Die kopierte Liste ist eine Deckliste, kein Kartenpool', () => {
    const FAELLE = [
        ['Deck-Analyse (Global)', GLOBAL, 'copyCurrentMetaDeckOverview'],
        ['Deck-Analyse (Japan)',  JAPAN,  'copyDeckOverview'],
    ];

    for (const [was, quelle, fn] of FAELLE) {
        it(`${was}: nimmt den Mittelwert, nicht das Maximum`, () => {
            const zweig = ohneDeckZweig(quelle, fn);
            assert.match(zweig, /average_count_overall/,
                `${was} liest wieder nur max_count. Das ist die hoechste ` +
                `Kopienzahl ueber ALLE Listen — aufsummiert ergibt das kein ` +
                `60-Karten-Deck (gemessen 109 bzw. 74).`);
            assert.match(zweig, /einzelneListe/,
                `${was}: der Sonderfall "Auswahl aus einer einzigen Liste" ` +
                `fehlt. Dort GIBT es keinen Mittelwert, und max_count ist ` +
                `die richtige Antwort.`);
        });

        it(`${was}: kein Boden von einer Kopie in der Liste`, () => {
            // Der Boden gehoert auf das Kaertchen im Gitter, damit eine
            // Karte aus 0,3 % der Listen dort nicht als "0" steht. In
            // einer Deckliste waeren es erfundene Karten — Vergangenes
            // Meta hat das am 29.08. ausdruecklich so entschieden.
            const zweig = ohneDeckZweig(quelle, fn);
            assert.ok(!/Math\.max\(\s*1\s*,/.test(zweig),
                `${was}: ein Math.max(1, …) im Kopierzweig erfindet Karten`);
        });
    }

    it('Vergangenes Meta bleibt das Vorbild', () => {
        // Wenn dort die Herleitung verschwindet, ist die Begruendung der
        // beiden Reparaturen oben hinfaellig.
        assert.match(PAST, /function getPastMetaRepresentativeCardCopies/,
            'die Vorlage ist weg');
        assert.match(PAST, /function getPastMetaSummaryTotalCount/,
            'die Summenfunktion ist weg — dann meldet die Kachel wieder 124 ' +
            'Karten fuer ein 60-Karten-Deck');
    });

    it('nachgerechnet: das Maximum summiert sich nicht auf 60', () => {
        // Nachstellung mit den gemessenen Groessenordnungen: 89
        // verschiedene Karten, davon 65 mit einem Mittelwert unter 0,5.
        const karten = [];
        for (let i = 0; i < 65; i++) karten.push({ avg: 0.3, max: 1 });
        for (let i = 0; i < 20; i++) karten.push({ avg: 1.6, max: 3 });
        for (let i = 0; i < 4;  i++) karten.push({ avg: 3.9, max: 4 });
        const ueberMax = karten.reduce((s, k) => s + k.max, 0);
        const ueberAvg = karten.reduce((s, k) => s + Math.round(k.avg), 0);
        assert.ok(ueberMax > 100,
            `ueber max_count summiert: ${ueberMax} Karten fuer ein 60er-Deck`);
        assert.ok(ueberAvg <= 76 && ueberAvg >= 20,
            `ueber den Mittelwert: ${ueberAvg} — in der Groessenordnung eines Decks`);
    });
});

describe('Der Raster-Umschalter blendet auch wieder ein', () => {
    // Zwei zulaessige Bauarten, beide im Haus vorhanden:
    //   (a) Klassen umschalten  — Global und Japan: je zweimal
    //       add('d-none') und zweimal remove('d-none').
    //   (b) Zustand umkehren    — Vergangenes Meta: ein boolescher Wert
    //       wird gekippt und die Ansicht neu gezeichnet.
    // Der Fehler war in beiden Bauarten derselbe: nur die eine
    // Richtung. Deshalb prueft die Zusage nicht die Schreibweise,
    // sondern dass BEIDE Richtungen vorkommen.
    const FAELLE = [
        ['Deck-Analyse (Global)', GLOBAL, 'toggleCurrentMetaDeckGridView'],
        ['Deck-Analyse (Japan)',  JAPAN,  'toggleDeckGridView'],
        ['Vergangenes Meta',      PAST,   'togglePastMetaDeckGridView'],
    ];

    for (const [was, quelle, fn] of FAELLE) {
        it(`${was}: beide Richtungen`, () => {
            const i = quelle.indexOf('function ' + fn);
            assert.notEqual(i, -1, `${fn} ist verschwunden`);
            const rumpf = quelle.slice(i, i + 2500);

            const versteckt = (rumpf.match(/classList\.add\('d-none'\)/g) || []).length;
            const gezeigt   = (rumpf.match(/classList\.remove\('d-none'/g) || []).length;
            const kippt     = /(\w+)\s*=\s*!\1/.test(rumpf);
            const zeichnet  = /render[A-Za-z]*Cards\(\)/.test(rumpf);

            const bauartA = versteckt >= 2 && gezeigt >= 2;
            const bauartB = kippt && zeichnet;

            assert.ok(bauartA || bauartB,
                `${was}: weder Klassen-Umschaltung (${versteckt}x add / ` +
                `${gezeigt}x remove, noetig je 2) noch Zustandsumkehr ` +
                `(kippt=${kippt}, zeichnet=${zeichnet}). Mit nur einer ` +
                `Richtung wird versteckt und nie etwas gezeigt — genau der ` +
                `Fehler, bei dem drei Klicks hintereinander nichts bewirkt haben.`);

            if (bauartA) {
                assert.equal(versteckt, gezeigt,
                    `${was}: ${versteckt}x versteckt gegen ${gezeigt}x gezeigt — ` +
                    `eine Richtung fehlt`);
            }
        });

        it(`${was}: die Beschriftung kippt mit`, () => {
            const i = quelle.indexOf('function ' + fn);
            const rumpf = quelle.slice(i, i + 2500);
            assert.match(rumpf, /btn\.gridView/,
                `${was}: die Beschriftung "Rasteransicht" fehlt`);
            assert.match(rumpf, /btn\.listView/,
                `${was}: die Beschriftung "Listenansicht" fehlt — dann bleibt ` +
                `sie nach dem ersten Klick stehen, wie vor der Reparatur`);
        });
    }
});
