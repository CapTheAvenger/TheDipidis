/**
 * Das Platzierungsgewicht war bei grossen Turnieren wirkungslos.
 *
 * BEFUND 05.09.2026. Die absoluten Baender (Top 4 / 8 / 16 / 32 / Rest)
 * stammen aus einer Zeit, in der "Turnier" ein Regional mit ~120
 * Spielern hiess. Alle drei Turniere im Bestand veroeffentlichen aber
 * nur rund 18-19 % ihres Feldes, und das reicht weit ueber Platz 32
 * hinaus:
 *
 *     Turnier         Feld   Listen  Plaetze   davon auf Gewicht 0,1
 *     Worlds 2026      774      143    1-143    111  (78 %)
 *     NAIC 2026      3.743      675    1-675    643  (95 %)
 *     Turin          2.032      383    1-383    351  (92 %)
 *
 * Rund neun von zehn veroeffentlichten Listen trugen dasselbe Gewicht.
 * Fuer Mega Excadrill lagen ALLE acht Listen (Plaetze 37-122) im selben
 * Band — `weightedShare` war exakt n/8, und die Spec-Regel "Erfolg
 * zaehlt mehr" trug null bei. Daraus entstanden die Gleichstaende, bei
 * denen am Ende die Zeilenreihenfolge der CSV entschied.
 *
 * DIE REGEL: gewicht = max(absolut(platz), perzentil(platz/feld)).
 * Als MAXIMUM, nie als Ersatz — sonst waere Platz 4 von 60 (6,7 %) auf
 * 0,6 abgewertet worden, ein Turniersieg zaehlte weniger als vorher.
 *
 * Gegengeprueft von einem Pruefagenten am 05.09.2026; drei Befunde
 * daraus stehen unten als eigene Zusicherungen (fehlender Platz,
 * Feldgroessen-Quelle, keine Abwertung).
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(
    path.join(WURZEL, 'js', 'deck-builder-consistency.js'), 'utf-8');

/** Die echte Funktion aus der Datei schneiden und ausfuehren. */
function ladeGewicht() {
    const a = QUELLE.indexOf('const PLACEMENT_WEIGHT_BANDS');
    const b = QUELLE.indexOf('function _sizeWeight');
    assert.ok(a > -1 && b > a, 'Schnitt fuer _placementWeight nicht gefunden');
    return new Function(QUELLE.slice(a, b) + '\nreturn _placementWeight;')();
}

/** Das alte Verhalten, zum Vergleich. */
function altesBand(place) {
    const p = Number(place) || 999;
    for (const [m, w] of [[4, 1.0], [8, 0.7], [16, 0.5], [32, 0.3]]) {
        if (p <= m) return w;
    }
    return 0.1;
}

describe('Feldrelatives Platzgewicht', () => {
    it('wertet ein gutes Ergebnis bei grossem Feld auf', () => {
        const w = ladeGewicht();
        // Platz 37 von 774 = obere 4,8 % -> Perzentilband 0,6.
        assert.strictEqual(w(37, 774), 0.6,
            'Platz 37 bei Worlds zaehlt weiter wie Mittelfeld — genau der '
            + 'Zustand, in dem alle acht Mega-Excadrill-Listen dasselbe '
            + 'Gewicht trugen');
        assert.strictEqual(altesBand(37), 0.1, 'Vergleichswert stimmt nicht mehr');
    });

    it('wertet NIE ab — das Maximum ist der ganze Punkt', () => {
        /* Waere die Perzentilskala ein ERSATZ statt eines Maximums, wuerde
           Platz 4 von 60 (6,7 %) auf 0,6 fallen: ein Turniersieg zaehlte
           weniger als vorher. Erschoepfend geprueft ueber ein weites
           Feld — eine einzige Abwertung waere ein Fehler. */
        const w = ladeGewicht();
        let verletzt = 0, gestiegen = 0;
        for (let f = 1; f <= 20000; f = Math.ceil(f * 1.3)) {
            for (let p = 1; p <= 2000; p += 1) {
                const neu = w(p, f), alt = altesBand(p);
                if (neu < alt - 1e-9) verletzt += 1;
                if (neu > alt + 1e-9) gestiegen += 1;
            }
        }
        assert.strictEqual(verletzt, 0,
            `${verletzt} Platzierungen werden schlechter gewichtet als vorher`);
        assert.ok(gestiegen > 1000,
            `nur ${gestiegen} Steigerungen — die Aenderung wirkt kaum`);
        assert.strictEqual(w(4, 60), 1.0, 'ein Sieg bei einem kleinen Turnier verliert an Gewicht');
        assert.strictEqual(w(8, 60), 0.7, 'Top 8 bei einem kleinen Turnier verliert an Gewicht');
    });

    it('rät nicht, wenn der Platz fehlt', () => {
        /* GEFUNDEN VOM PRUEFAGENTEN, bevor das live ging: `Number(place)
           || 999` macht aus einem fehlenden Platz eine 999. Bei einem Feld
           ueber 3.995 ist 999/Feld <= 0,25 — eine FEHLENDE Platzierung
           waere damit auf 0,2 aufgewertet worden. Live trat das nicht auf
           (groesstes Feld 3.743), es waere beim naechsten Feld ueber 4.000
           gekippt. */
        const w = ladeGewicht();
        for (const leer of [undefined, null, '', NaN, 0]) {
            assert.strictEqual(w(leer, 5000), 0.1,
                `ein fehlender Platz (${String(leer)}) wird bei grossem Feld `
                + 'aufgewertet — das ist eine geratene Zahl, keine gemessene');
        }
        // Ein ECHTER Platz 999 darf dagegen sehr wohl profitieren.
        assert.strictEqual(w(999, 5000), 0.2,
            'ein tatsaechlicher Platz 999 von 5.000 ist das obere Fuenftel '
            + 'und muss zaehlen');
        // Und ein unmoeglicher Platz zaehlt nicht als Sieg.
        assert.strictEqual(w(-5, 774), 0.1,
            'ein negativer Platz landet im Top-4-Band — das war schon vor '
            + 'der Aenderung falsch');
    });

    it('rät nicht, wenn die Feldgröße fehlt', () => {
        const w = ladeGewicht();
        assert.strictEqual(w(37, 0), altesBand(37),
            'ohne Feldgroesse muss das absolute Band gelten');
        assert.strictEqual(w(37, undefined), altesBand(37));
        assert.strictEqual(w(37, -100), altesBand(37));
        assert.strictEqual(w(37, 1), altesBand(37),
            'Feld 1 bei Platz 37 ergibt Quantil 37 — das Perzentilband darf '
            + 'da nichts beitragen');
    });

    it('das Listengewicht reicht die Feldgröße durch', () => {
        assert.match(QUELLE, /const feld = tournamentSizes\.get\(list\.tournament_id\) \|\| 0;/,
            'die Feldgroesse wird nicht mehr einmal geholt');
        assert.match(QUELLE, /_placementWeight\(list\.place, feld\)/,
            'das Platzgewicht bekommt die Feldgroesse nicht — dann ist die '
            + 'ganze Aenderung wirkungslos');
    });

    it('der Befund und der Preis stehen als Begründung im Quelltext', () => {
        assert.match(QUELLE, /Worlds 2026\s+774\s+143/,
            'die gemessene Tabelle fehlt oder traegt andere Zahlen');
        assert.match(QUELLE, /labs_tournament_decks\.csv `total_players`/,
            'es steht nicht dabei, WELCHE Feldgroesse gemeint ist — die '
            + 'Spalte `players` in der Overview zaehlt anders');
        assert.match(QUELLE, /VERSCHLECHTERT\s*\n?\s*\*?\s*bei zwei/,
            'der Kommentar behauptet einen einseitigen Gewinn. Vier von 43 '
            + 'Archetypen bekommen einen NEUEN Gleichstand, und das gehoert '
            + 'dazugeschrieben');
        assert.match(QUELLE, /verliert Dynamik/,
            'der Preis der Aenderung (geringere Spreizung der Listengewichte) '
            + 'ist nicht festgehalten');
    });
});
