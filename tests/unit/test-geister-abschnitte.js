/**
 * Gespeicherte Abschnitte, die es nicht mehr gibt.
 *
 * BEFUND (04.09.2026, live auf der Startseite, nach dem Deploy
 * angesehen — genau dafuer gibt es die Regel "nach jedem Deploy die
 * geaenderte Stelle im Browser ANSEHEN"):
 *
 *     Ansicht zuruecksetzen    7 von 6 Abschnitten offen
 *
 * Sieben von sechs. Der Abschnitt "Auf- und Absteiger" ist am
 * 01.09.2026 aus SECTIONS verschwunden; seine ID stand aber weiter im
 * localStorage jedes Besuchers, der die Seite vorher benutzt hatte.
 * Gezaehlt wurde die GESPEICHERTE Liste, verglichen wurde gegen die
 * AKTUELLE.
 *
 * Zwei sichtbare Folgen:
 *
 *   1. die unsinnige Zahl,
 *   2. ein "Ansicht zuruecksetzen", das nie wieder verschwindet — denn
 *      `gleich` in zeichneReset() vergleicht Laenge und Inhalt gegen
 *      standard(), und mit einer Geister-ID kann das nie zutreffen.
 *
 * Kein Test hat das bemerkt, weil alle mit einem frischen, leeren
 * Speicher rechnen. Der echte Besucher hat keinen frischen Speicher.
 *
 * Die Reparatur gehoert ans LESEN, nicht ans Schreiben: die alten
 * Eintraege liegen bereits in fremden Browsern, und die erreicht man
 * nur beim naechsten Laden.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..', '..');
const QUELLE = fs.readFileSync(path.join(WURZEL, 'js', 'ds-sections.js'), 'utf8');

/** Ein Stueck aus der Quelle holen, statt es nachzubauen. */
function ausQuelle(name) {
    const i = QUELLE.indexOf('function ' + name + '(');
    assert.ok(i > 0, name + '() steht nicht mehr in js/ds-sections.js');
    let tiefe = 0, j = QUELLE.indexOf('{', i);
    for (; j < QUELLE.length; j++) {
        if (QUELLE[j] === '{') tiefe++;
        else if (QUELLE[j] === '}') { tiefe--; if (tiefe === 0) break; }
    }
    return QUELLE.slice(i, j + 1);
}

/** Die echten IDs aus der echten SECTIONS-Liste. */
function abschnittsIds() {
    const i = QUELLE.indexOf('var SECTIONS = [');
    assert.ok(i > 0, 'SECTIONS steht nicht mehr in js/ds-sections.js');
    const bis = QUELLE.indexOf('];', i);
    return [...QUELLE.slice(i, bis).matchAll(/\{\s*id:\s*'([^']+)'/g)].map(m => m[1]);
}

/** nurBekannte() mit einer gesetzten Abschnittsliste laufen lassen. */
function filter(ids) {
    const fn = new Function('SECTIONS',
        ausQuelle('nurBekannte') + '\nreturn nurBekannte;')(
        abschnittsIds().map(id => ({ id })));
    return fn(ids);
}

describe('Ein geloeschter Abschnitt spukt nicht im Speicher weiter', () => {

    it('die Quelle kennt sechs Abschnitte, nicht mehr und nicht weniger', () => {
        // Die Zahl selbst ist nicht der Punkt — dass sie ENDLICH ist und
        // aus der Quelle kommt, ist der Punkt. Sonst prueft alles
        // darunter gegen eine leere Liste und ist wertlos.
        const ids = abschnittsIds();
        assert.ok(ids.length >= 4,
            `nur ${ids.length} Abschnitte gefunden — dann liest dieser Test die `
            + 'SECTIONS-Liste nicht mehr richtig');
        assert.equal(new Set(ids).size, ids.length, 'doppelte Abschnitts-ID');
    });

    it('eine ID, die es nicht mehr gibt, faellt raus', () => {
        const ids = abschnittsIds();
        const gespeichert = ids.slice(0, 3).concat(['auf-ab']);
        const raus = filter(gespeichert);
        assert.ok(!raus.includes('auf-ab'),
            'die Geister-ID "auf-ab" ueberlebt den Filter — genau sie hat am '
            + '04.09.2026 "7 von 6 Abschnitten offen" erzeugt');
        assert.deepEqual(raus, ids.slice(0, 3),
            'der Filter wirft mehr weg als die unbekannte ID');
    });

    it('nie mehr offene Abschnitte als es Abschnitte gibt', () => {
        // Die Zusage in der Sprache des Nutzers: die Zahl links kann die
        // Zahl rechts nicht uebersteigen. Egal, was im Speicher steht.
        const ids = abschnittsIds();
        const muell = ids.concat(['auf-ab', 'alt1', 'alt2', 'nochwas']);
        assert.ok(filter(muell).length <= ids.length,
            `${filter(muell).length} von ${ids.length} — genau der Satz, der live stand`);
    });

    it('ein sauberer Speicher bleibt unangetastet', () => {
        const ids = abschnittsIds();
        assert.deepEqual(filter(ids), ids);
        assert.deepEqual(filter([]), []);
    });

    it('gemerkt() benutzt den Filter wirklich', () => {
        // Ohne diese Zusicherung kann nurBekannte() unbenutzt danebenstehen
        // und alles oben bleibt gruen.
        const g = ausQuelle('gemerkt');
        assert.match(g, /nurBekannte\(/,
            'gemerkt() gibt die gespeicherte Liste ungefiltert zurueck — dann '
            + 'nuetzt der Filter niemandem');
        assert.doesNotMatch(g, /return v;/,
            'gemerkt() hat noch einen Pfad, der die rohe Liste zurueckgibt');
    });
});
