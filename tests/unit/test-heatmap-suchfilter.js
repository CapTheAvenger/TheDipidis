'use strict';
/*
 * Die Achsen-Suchfelder der Matchup-Heatmap.
 *
 * ANLASS (02.09.2026)
 * -------------------
 * Betreiber: "mir ist noch aufgefallen, dass die Y-Achse und x-Achse
 * Suchfilter bei der Heatmap nicht vernuenftig funktionieren."
 *
 * An der laufenden Seite nachgestellt — vier Fehler in einem Block:
 *
 *     Ausgangslage        10 Zeilen · Feld ""
 *     Y = "Dragapult"      5 Zeilen · Feld "dragapult"
 *     Y geleert            5 Zeilen · Feld "dragapult"   <-- steckengeblieben
 *
 * 1  DAS FELD LIESS SICH NICHT LEEREN.
 *    `(input.value || window.heatmapSearchY || '')` — ein leerer Text ist
 *    falsy, also fiel der Ausdruck auf die GESPEICHERTE vorige Suche
 *    zurueck. Wer den Filter loeschte, bekam ihn sofort wieder, und im
 *    Feld stand danach wieder, was er gerade geloescht hatte. Der Filter
 *    war eine Einbahnstrasse: einmal gesetzt, nur noch per Seitenneuladen
 *    los.
 *
 * 2  DER GETIPPTE TEXT WURDE KLEINGESCHRIEBEN.
 *    `.toLowerCase()` lief auf dem Wert, der gleich wieder ins Feld
 *    geschrieben wird. Aus "Dragapult" wurde beim Tippen "dragapult".
 *
 * 3  DER FOKUS GING IM LEERPFAD VERLOREN.
 *    Der ganze Behaelter wird bei jedem Tastendruck per outerHTML
 *    ersetzt; der Hauptpfad setzte den Fokus hinterher zurueck, der
 *    Leerpfad ("Keine Decks gefunden") kehrte vorher zurueck. Also
 *    ausgerechnet nach einem Tippfehler stand man vor einer leeren
 *    Tabelle und musste das Feld neu anklicken, um ihn zu verbessern.
 *
 * 4  ZWEI NORMALISIERER FUER DIESELBE SACHE.
 *    Der Deckname wurde von ' ’ ‛ ` ´ Leerzeichen und Bindestrich
 *    befreit, die Suche nur von ' ’ Leerzeichen und Bindestrich.
 *    "N`s Zoroark" mit Gravis fand deshalb nichts.
 *
 * Nach der Korrektur, dieselbe Strecke gefahren:
 *
 *     Y geleert          -> 10 Zeilen, Feld ""
 *     X = "Slowking"     -> 1 Spalte
 *     X geleert          -> 10 Spalten
 *     Y = "MEGA"         -> Feld bleibt "MEGA", 19 Zeilen
 *     Y = Tippfehler     -> Leermeldung, Fokus bleibt im Feld
 *     Y = "N`s" (Gravis) -> 11 Zeilen statt 0
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const quelle = fs.readFileSync(path.join(wurzel, 'js', 'app-current-meta.js'), 'utf8');
const ohneKomm = quelle
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '');

describe('Der Filter laesst sich wieder loeschen', () => {

    it('ein leeres Feld faellt nicht auf die vorige Suche zurueck', () => {
        // Der Kern des Fehlers: `input.value || gespeichert` behandelt
        // "nichts eingegeben" und "absichtlich geleert" gleich.
        assert.ok(!/\.value\)\s*\|\|\s*window\.heatmapSearch/.test(ohneKomm),
            'die Suche faellt wieder von einem leeren Feld auf den '
            + 'gespeicherten Wert zurueck — dann laesst sich der Filter nicht '
            + 'mehr loeschen, und im Feld steht danach wieder, was gerade '
            + 'geloescht wurde');
    });

    it('es entscheidet, OB das Feld da ist, nicht ob etwas drinsteht', () => {
        for (const achse of ['Y', 'X']) {
            const re = new RegExp('existingSearch' + achse + 'Input\\s*\\n?\\s*\\?');
            assert.ok(re.test(ohneKomm),
                `die ${achse}-Suche prueft nicht mehr auf die Existenz des Feldes`);
        }
    });
});

describe('Das Feld zeigt, was getippt wurde', () => {

    it('der angezeigte Wert wird nicht kleingeschrieben', () => {
        assert.ok(/const anzeigeY = /.test(ohneKomm) && /const anzeigeX = /.test(ohneKomm),
            'die getrennte Anzeige-Groesse ist weg — dann steht im Feld wieder '
            + 'der kleingeschriebene Vergleichswert');
        const i = ohneKomm.indexOf('const anzeigeY = ');
        const zeile = ohneKomm.slice(i, i + 220);
        assert.ok(!/toLowerCase/.test(zeile),
            'der Anzeigewert wird wieder kleingeschrieben — aus "Dragapult" '
            + 'wird beim Tippen "dragapult"');
    });

    it('die Eingabefelder tragen den Anzeigewert, nicht den Suchwert', () => {
        for (const achse of ['Y', 'X']) {
            const re = new RegExp('id="heatmapSearch' + achse + '"[^>]*value="\\$\\{escapeAttr\\(anzeige' + achse + '\\)\\}"');
            assert.ok(re.test(quelle),
                `das ${achse}-Feld zeigt wieder den kleingeschriebenen Suchwert`);
        }
    });

    it('gespeichert wird der getippte Text, nicht der kleingeschriebene', () => {
        // Der gespeicherte Wert fuellt das Feld beim naechsten Zeichnen, wenn
        // es gerade nicht existiert (Reiterwechsel, Sprachwechsel). Steht dort
        // der kleingeschriebene, kommt die Kleinschreibung durch die Hintertuer
        // zurueck.
        for (const achse of ['Y', 'X']) {
            // Bis zum SEMIKOLON fassen, nicht nur das erste Wort: die erste
            // Fassung dieser Zusage blieb gruen, als `anzeigeY.toLowerCase()`
            // dastand — `\\w+` hoert vor dem Punkt auf und las weiter "anzeigeY".
            const re = new RegExp('window\\.heatmapSearch' + achse + '\\s*=\\s*([^;]+);', 'g');
            const treffer = [...ohneKomm.matchAll(re)].map(m => m[1].trim());
            assert.ok(treffer.length > 0, `window.heatmapSearch${achse} wird nicht mehr gesetzt`);
            for (const wert of treffer) {
                assert.strictEqual(wert, 'anzeige' + achse,
                    `window.heatmapSearch${achse} wird auf "${wert}" gesetzt statt auf `
                    + `anzeige${achse} — dann steht beim naechsten Zeichnen der `
                    + 'kleingeschriebene Text im Feld');
            }
        }
    });

    it('verglichen wird trotzdem ohne Ruecksicht auf Gross und Klein', () => {
        assert.ok(/const rawSearchY = anzeigeY\.toLowerCase\(\)/.test(ohneKomm),
            'die Y-Suche vergleicht nicht mehr kleingeschrieben — dann findet '
            + '"dragapult" das Deck "Dragapult" nicht mehr');
        assert.ok(/const rawSearchX = anzeigeX\.toLowerCase\(\)/.test(ohneKomm),
            'dasselbe fuer die X-Suche');
    });
});

describe('Der Fokus bleibt im Feld — auch wenn nichts gefunden wird', () => {

    it('die Wiederherstellung ist eine Funktion, kein Einzelfall', () => {
        assert.ok(/const fokusZurueck = /.test(ohneKomm),
            'die Fokus-Wiederherstellung ist wieder in einen Pfad eingebaut '
            + 'statt fuer beide verfuegbar');
    });

    it('beide Zeichenpfade rufen sie auf', () => {
        const treffer = (ohneKomm.match(/fokusZurueck\(\);/g) || []).length;
        assert.strictEqual(treffer, 2,
            `fokusZurueck() wird ${treffer}× aufgerufen, erwartet 2 — der `
            + 'Hauptpfad UND der Leerpfad. Fehlt der Leerpfad, verliert man den '
            + 'Fokus ausgerechnet nach einem Tippfehler, wo man ihn braucht');
    });

    it('der Leerpfad ruft sie VOR seinem return auf', () => {
        const i = ohneKomm.indexOf('emptyHtml;');
        assert.ok(i > 0, 'der Leerpfad ist verschwunden');
        const rest = ohneKomm.slice(i, i + 700);
        const iF = rest.indexOf('fokusZurueck()');
        const iR = rest.indexOf('return;');
        assert.ok(iF > 0 && iR > iF,
            'im Leerpfad steht der return vor der Fokus-Wiederherstellung — '
            + 'dann laeuft sie nie');
    });
});

describe('Suche und Deckname werden gleich normalisiert', () => {

    it('es gibt genau einen Normalisierer', () => {
        assert.ok(/const APOSTROPHE = /.test(ohneKomm),
            'der gemeinsame Ausdruck ist weg — dann laufen Suche und Deckname '
            + 'wieder auseinander');
        // Der alte, engere Ausdruck darf nicht zurueckkommen.
        assert.ok(!/replace\(\/\['’\\s-\]\/g/.test(ohneKomm),
            'die Suche wird wieder mit einem engeren Ausdruck normalisiert als '
            + 'der Deckname — "N`s Zoroark" mit Gravis findet dann nichts');
    });

    it('er deckt alle Apostroph-Varianten ab, die in Decknamen vorkommen', () => {
        const i = ohneKomm.indexOf('const APOSTROPHE = ');
        const zeile = ohneKomm.slice(i, i + 90);
        for (const [zeichen, name] of [
            ['\\u2019', 'rechtes einfaches Anfuehrungszeichen'],
            ['\\u2018', 'linkes einfaches Anfuehrungszeichen'],
            ['`', 'Gravis'],
            ['´', 'Akut'],
        ]) {
            assert.ok(zeile.indexOf(zeichen) > 0,
                `der Normalisierer kennt ${name} (${zeichen}) nicht mehr`);
        }
    });

    it('beide Seiten benutzen ihn', () => {
        const treffer = (ohneKomm.match(/APOSTROPHE/g) || []).length;
        assert.ok(treffer >= 4,
            `APOSTROPHE steht nur ${treffer}× im Code — erwartet mindestens 4 `
            + '(Definition, zwei Suchwerte, Deckname)');
        const i = ohneKomm.indexOf('const matchesAxisSearch');
        const rumpf = ohneKomm.slice(i, i + 400);
        assert.ok(/replace\(APOSTROPHE/.test(rumpf),
            'der Deckname wird wieder mit einem eigenen Ausdruck normalisiert');
    });
});
