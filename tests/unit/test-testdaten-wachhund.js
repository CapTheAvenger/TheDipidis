/**
 * Wachhund gegen die teuerste Testsorte dieses Projekts:
 * ein Unit-Test, der eine Eigenschaft der LIVE-Daten behauptet.
 *
 * WARUM ES DIESE DATEI GIBT
 *
 * `deploy-pages.yml` bricht bei jedem roten Unit-Test ab. Ein Test, der
 * behauptet "der roh beste Wert kommt von einer winzigen Stichprobe" oder
 * "in den Top 10 steht ein duennes Deck", sagt nichts ueber den Code — er
 * sagt, wie das Feld in DIESER Woche aussieht. Der naechste Datenlauf macht
 * ihn rot, und die Auslieferung steht, ohne dass irgendwo ein Defekt ist.
 *
 * Das ist viermal passiert, immer in derselben Datei:
 *
 *   18.08.2026  test-conversion-performance.js  21 Stunden Deploy blockiert
 *   28.08.2026  dieselbe Datei, die uebrig gebliebene Vorbedingung
 *               (`byRaw[0].brought < 20`)       13 Stunden blockiert
 *
 * Jedes Mal wurde die rote Zeile entfernt und die naechste stehen gelassen.
 * Dieser Wachhund macht daraus eine bewusste Entscheidung: wer einen Test
 * an die Live-Daten haengt, muss ihn hier eintragen und begruenden.
 *
 * DIE REGEL
 *
 *   Eigenschaften des CODES gehoeren an Daten, die der Test selbst setzt.
 *   Beobachtungen ueber die AKTUELLEN Daten gehoeren in den Data Guardian
 *   (scripts/data_guardian.py) — der meldet WARN und stoppt nichts.
 *
 * Zulaessig an Live-Daten sind: Struktur (Spalten da, Schema stimmt),
 * Parsebarkeit, und WEITE Baender mit Begruendung ("darf sich bewegen,
 * nur nicht davonlaufen"). Nicht zulaessig ist eine enge Zahl, die aus
 * dem Feld dieser Woche abgelesen wurde.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const UNIT = path.join(__dirname);

const liestLiveDaten = (t) =>
    /readFileSync\([^)]*(path\.join\([^)]*['"]data['"]|['"]data\/|ROOT[^)]*data)/.test(t) ||
    /join\(ROOT,\s*['"]data['"]/.test(t);

// assert.ok(... irgendwas < 5 ...) — eine Ungleichung gegen eine feste Zahl.
const UNGLEICHUNG = /assert\.ok\([^;]*[<>]=?\s*-?\d/;

function dateienMitDatenzugriff() {
    return fs.readdirSync(UNIT)
        .filter(f => f.startsWith('test-') && f.endsWith('.js'))
        .filter(f => liestLiveDaten(fs.readFileSync(path.join(UNIT, f), 'utf8')));
}

function ungleichungen(datei) {
    return fs.readFileSync(path.join(UNIT, datei), 'utf8').split('\n')
        .filter(z => {
            const s = z.trim();
            if (s.startsWith('//') || s.startsWith('*')) return false;
            return UNGLEICHUNG.test(z);
        }).length;
}

/**
 * Das Register. Jede Testdatei, die eine Datei aus data/ liest, steht hier
 * mit einem Satz dazu, WARUM das in Ordnung ist. Eine neue Datei ohne
 * Eintrag laesst diesen Test fallen — genau das ist der Zweck.
 */
const REGISTER = {
    'test-champions-base-stats.js':      'Schema der Statuswerte, keine Zahlenbaender',
    'test-champions-damage.js':          'Rechenwege am Schadensmodell; Baender sind physikalisch (Chance zwischen 0 und 1)',
    'test-champions-matchups.js':        'Struktur der Matchup-Datei, Rechnung an gesetzten Werten',
    'test-team-rechner.js':              'Team-Rechner: liest data/, um echte Paare zu bilden — welche, ist der Pruefung egal. Verglichen wird die Matrixzelle mit bestMove() auf denselben Daten (Gleichheit zweier Rechenwege), der Spiegelkampf (gilt fuer jedes Pokemon) und die Namensaufloesung ueber den Slug (eine Eigenschaft der Zuordnung). Die EINE Ungleichung ist eine Eigenschaft der Urteilsregel, kein Wochenwert: unter 5 % der farbigen Zellen duerfen sich auf einen K.O. unter 50 % Chance stuetzen. Vor der Korrektur am 02.09.2026 waren es 30 %; die Schranke haelt, solange die Regel ueber den Durchschnittswurf wertet, und faellt, wenn jemand sie auf ko.hits zurueckdreht.',
    'test-champions-speed-tiers.js':     'Sortierlogik an gesetzten Werten; die letzte Zusicherung an der Datenlage ist am 31.08.2026 entfallen',
    'test-champions-sprites.js':         'nur Existenz von Sprite-Eintraegen, keine Ungleichung',
    'test-comparison-csv-comma-parse.js':'Parsebarkeit des Komma-Formats, Struktur',
    'test-conversion-performance.js':    'Feldquote als weites Band; die Wochenbehauptungen sind am 28.08. entfernt worden',
    'test-datenlage-comparison-html.js': 'Dateigroesse als Obergrenze — eine Zusicherung ueber den Erzeuger, nicht ueber das Feld',
    'test-datenstand.js':                'Schema von data_stand.json und Einbindung in den Wochenlauf',
    'test-deckempfehlung-anzeige.js':    'Anzeigelogik an gesetzten Werten, Datei nur auf Schema geprueft',
    'test-design-depth.js':              'liest data/ nur fuer Pfadaufloesung, prueft CSS',
    'test-kartenart-und-drucke.js':      'Kartentypen und Drucke: Struktur; ein weites Band auf Ultra-Ball-Drucke',
    'test-metacall-boden-verhalten.js': 'rechnet Boden- und Klebrigkeits-Aggregation gegen data/, behauptet aber KEINE Wochenwerte: geprueft werden Eigenschaften der Rechnung (bei einem Turnier ist jede Klebrigkeit null), Richtungen (die Huerde kappt keine Spitze) und Konsistenz zwischen Kommentar und Zahl. Genau diese Datei existiert, weil eine reine Quelltext-Zusage eine falsche Begruendung nicht bemerken konnte',
    'test-metacall-namensbruecke.js': 'liest data/archetype_aliases.json — eine gepflegte Namensliste, keine Wochenzahlen; sie aendert sich nur, wenn jemand ein Paar von Hand eintraegt',
    'test-nenner-und-rundung.js':        'Rundungsvertrag; Abweichungen sind Toleranzen der Rechnung, keine Feldwerte',
    'test-side-quest-play.js':           'Rechenwege am Nutzungsmodell, Toleranzen auf selbst gesetzten Anteilen',
    'test-side-quest-usage.js':          'Struktur der Nutzungsdatei plus weite Untergrenzen (mindestens 10 Teams)',
    'test-top100-weg.js':                'prueft, dass eine entfernte Ansicht nicht zurueckkommt',
    'test-testdaten-wachhund.js':        'dieser Wachhund selbst',
};

// Stand 02.09.2026: 61, um EINE Ungleichung im Team-Rechner (vorher 60,
// Stand 31.08.2026 nach dem Aufraeumen in test-champions-speed-tiers.js).
//
// Die eine: hoechstens 5 % der farbigen Matrixzellen duerfen ihr Urteil
// auf einen K.O. stuetzen, den die Zelle selbst als unter 50 %
// wahrscheinlich ausweist. Das ist keine Zahl aus dieser Woche, sondern
// eine Eigenschaft der Urteilsregel: sie wertet ueber den
// Durchschnittswurf, und der ist von der Datenlage unabhaengig. Vor der
// Korrektur am 02.09.2026 waren es 30 % der Zellen, in 5,4 % sagte die
// Farbe das Gegenteil des wahrscheinlichen Ausgangs. Faellt die Schranke,
// hat jemand die Regel auf ko.hits zurueckgedreht — genau der Fehler,
// den die Abnahme gefunden hat.
//
// Diese Zahl darf nicht steigen. Wer eine Ungleichung an Live-Daten
// hinzufuegt, muss hier bewusst hochzaehlen und im Register begruenden.
const OBERGRENZE = 61;

describe('kein Unit-Test behauptet etwas ueber die Daten dieser Woche', () => {

    it('jede Datei mit Datenzugriff steht im Register', () => {
        const unbekannt = dateienMitDatenzugriff().filter(f => !(f in REGISTER));
        assert.deepEqual(unbekannt, [],
            'Diese Testdateien lesen aus data/, stehen aber nicht im Register:\n' +
            unbekannt.map(f => '  ' + f).join('\n') +
            '\n\nEintragen und in einem Satz begruenden, warum die Zusicherungen ' +
            'naechste Woche noch gelten. Faustregel: Struktur und weite Baender ja, ' +
            'abgelesene Wochenwerte nein — die gehoeren in scripts/data_guardian.py.');
    });

    it('das Register enthaelt keine Datei, die es nicht mehr gibt', () => {
        const da = new Set(fs.readdirSync(UNIT));
        const tot = Object.keys(REGISTER).filter(f => !da.has(f));
        assert.deepEqual(tot, [], 'Register zeigt auf geloeschte Dateien');
    });

    it('die Zahl der Ungleichungen an Live-Daten steigt nicht', () => {
        const dateien = dateienMitDatenzugriff();
        const proDatei = dateien.map(f => [f, ungleichungen(f)]).filter(([, n]) => n > 0);
        const jetzt = proDatei.reduce((s, [, n]) => s + n, 0);
        assert.ok(jetzt <= OBERGRENZE,
            `Ungleichungen an Live-Daten: ${jetzt} (erlaubt: ${OBERGRENZE})\n` +
            proDatei.sort((a, b) => b[1] - a[1]).map(([f, n]) => `  ${String(n).padStart(3)}  ${f}`).join('\n') +
            '\n\nEine neue Ungleichung gegen eine feste Zahl auf Live-Daten ist die ' +
            'Bauart, die den Deploy schon zweimal angehalten hat. Wenn sie wirklich ' +
            'noetig ist: Obergrenze hier hochsetzen und dazuschreiben, warum die ' +
            'Zahl auch in vier Wochen noch stimmt.');
    });

    /* Die frueher hier beobachtete Vorbedingung in
     * test-champions-speed-tiers.js ("fixture changed — no entry lacks
     * doubles data") ist am 31.08.2026 eingetreten und bereinigt worden:
     * seit Tauros (Paldea) in seine drei Varianten aufgeteilt wurde, hat
     * jeder Pokedex-Eintrag einen Doppelkampf-Datensatz. Genau der Fall,
     * den der Kommentar vorhergesagt hat — "kein Defekt, das waere eine
     * Verbesserung der Daten". Die Zusicherung prueft dort jetzt das
     * Verhalten an gesetzten Werten statt an der Datenlage, die
     * Beobachtung ist damit erledigt und die Obergrenze um eins
     * gesenkt. */
});
