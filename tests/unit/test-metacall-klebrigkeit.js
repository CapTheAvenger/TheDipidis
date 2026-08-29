/**
 * Predictor 5.8 — der Klebrigkeits-Daempfer und seine Fenstertiefe.
 *
 * Vorgeschichte: der Daempfer hatte am 29.08.2026 im ganzen Repo KEINE
 * einzige echte Zusage. Die einzige Stelle, die ihn erwaehnte, war ein
 * Positionstest auf eine Kommentarzeile — der bleibt gruen, wenn der
 * Block nie feuert, und auch, wenn man ihn leerraeumt.
 *
 * Der geplante Eingriff war urspruenglich eine Alterssperre analog zum
 * Boden. Die Gegenpruefung hat ihn gekippt, und zwar in beide
 * Richtungen:
 *
 *   * Gegen mich: eine Alterssperre haette den schlimmsten Zustand zum
 *     Normalzustand gemacht — sie geht genau dann auf, wenn das neue
 *     Fenster ein bis zwei Turniere hat.
 *   * Gegen die Gegenpruefung: sie empfahl, 5.8 ganz abzuschalten, weil
 *     Klebrigkeit angeblich nicht mit dem Ergebnis zusammenhaengt
 *     (r = +0,16, p = 0,53). Nachgerechnet stimmt das nicht. In genau
 *     dem Bereich, in dem der Daempfer arbeitet (brought >= 100), gilt
 *     ueber den Uebergang TEF-POR -> TEF-CRI:
 *         r = +0,568,  p = 0,045,  n = 13
 *     und zwar in der Richtung, die der Daempfer annimmt: wenig
 *     klebrige Decks verlieren Anteil. Unterhalb der Schwelle
 *     verschwindet er (r = +0,049, p = 0,75, n = 45) — die Schwelle
 *     100 sitzt also richtig.
 *
 *     RICHTIGSTELLUNG durch die Nachpruefung: hier stand "unterhalb
 *     der Schwelle r = +0,12". Das war die Zahl ueber ALLE 58 Decks,
 *     nicht die unterhalb. Die richtige Zahl stuetzt das Argument
 *     staerker, aber falsch etikettiert ist falsch etikettiert.
 *
 *     Ebenfalls aus der Nachpruefung, und wichtiger: p = 0,043 ist
 *     NICHT belastbar. Laesst man je ein Deck weg, verlieren 8 von 13
 *     Auslassungen die Signifikanz (ohne Dragapult r = +0,40, p = 0,20).
 *     Die Schwelle 100 wurde ausserdem nachtraeglich gewaehlt. Der
 *     Befund traegt als "Vorzeichen und Groessenordnung stimmen" —
 *     nicht als Beweis. Deshalb wird der Daempfer hier abgesichert,
 *     nicht gefeiert.
 *
 * Bleibt der eine, gemessene Fehler: bei zu wenigen Turnieren im
 * Fenster ist sticky_pct nicht niedrig, sondern unbestimmt.
 *
 * Geprueft wird die Quelle selbst.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

function konstante(name) {
    const m = MC.match(new RegExp('const ' + name + '\\s*=\\s*([0-9.]+)'));
    assert.ok(m, `${name} steht nicht mehr in js/app-meta-call.js`);
    return Number(m[1]);
}

describe('Predictor 5.8 — die Fenstertiefe entscheidet', () => {
    it('unter drei Turnieren daempft nichts', () => {
        assert.ok(konstante('PREDICTOR_5_8_MIN_TURNIERE') >= 3,
            'Bei einem Turnier ist sticky_pct fuer JEDES Deck exakt 0 — ein '
            + 'zweites Mitbringen ist dort nicht moeglich. Gemessen: Dragapult '
            + 'kaeme mit brought=105 und sticky=0,00 % auf x0,70.');
    });

    it('die Fenstertiefe wird aus den verwertbaren Zeilen gezaehlt, nicht aus der Datei', () => {
        // Turnier 0070 traegt 512 Zeilen, alle ohne deck_archetype. Es
        // faellt in der Schleife heraus und darf nicht mitzaehlen —
        // sonst meldet das Fenster eine Tiefe, die es nicht hat.
        const i = MC.indexOf('const turniereImFenster = new Set()');
        assert.notEqual(i, -1, 'die Fenstertiefe wird nicht mehr gezaehlt');
        const block = MC.slice(i, i + 1400);
        const zaehl = block.indexOf('turniereImFenster.add(tid)');
        const wache = block.indexOf('if (!player || !arch || !tid) return;');
        assert.ok(wache > -1 && zaehl > wache,
            'gezaehlt wird VOR der Wache — dann zaehlen Turniere ohne '
            + 'Archetyp als Fenstertiefe mit, obwohl sie nichts beitragen');
    });

    it('der Daempfer haengt wirklich an der Fenstertiefe', () => {
        assert.match(MC, /_stickinessTragfaehig = _stickinessTurniere >= PREDICTOR_5_8_MIN_TURNIERE;/);
        const i = MC.indexOf('let stickinessDamped = false;');
        assert.notEqual(i, -1);
        const block = MC.slice(i, i + 500);
        assert.match(block, /if \(!_stickinessTragfaehig\) return;/,
            'der Daempfer laeuft wieder ohne Ruecksicht auf die Fenstertiefe');
    });

    it('die 5.9-Sperre faellt mit dem Daempfer', () => {
        // Sonst blockierte eine Kennzahl, die selbst nicht feuern darf,
        // weiter den Migrationsboost — also das einzige frische Signal.
        const i = MC.indexOf('const stickEntry = _stickinessByDeck[k];\n        if (');
        assert.notEqual(i, -1, 'die 5.9-Sperre ist nicht mehr auffindbar');
        assert.match(MC.slice(i, i + 400), /if \(_stickinessTragfaehig && stickEntry/,
            'die Sperre haengt nicht an derselben Bedingung wie der Daempfer');
    });

    it('der Zustand wird gemeldet statt still zu sein', () => {
        const i = MC.indexOf('if (!_stickinessTragfaehig) {');
        assert.notEqual(i, -1, 'der Nichtlauf wird nirgends gemeldet');
        assert.match(MC.slice(i, i + 700), /console\.log\(/);
    });

    it('ein unbrauchbarer Formatfilter wird gemeldet, nicht stillschweigend umgangen', () => {
        // Hausregel: report, don't silently repair. Die Spalte `meta`
        // ist in allen 5619 Zeilen leer, der Filter greift also nie und
        // die Klebrigkeit wird ueber drei Formate gerechnet.
        assert.match(MC, /if \(meta\) zeilenMitMeta \+= 1;/,
            'es wird nicht mehr gezaehlt, ob ueberhaupt ein meta ankommt');
        const i = MC.indexOf('if (!zeilenMitMeta) {');
        assert.notEqual(i, -1, 'der leere Formatfilter wird nicht gemeldet');
        assert.match(MC.slice(i, i + 600), /console\.log\(/);
    });
});

describe('Predictor 5.8 — die Schwellen, die die Messung stuetzt', () => {
    it('die Spielerschwelle bleibt bei 100', () => {
        // Nicht gesetzt, sondern gemessen: unterhalb dieser Schwelle
        // verschwindet der Zusammenhang zwischen Klebrigkeit und
        // Anteilsaenderung (r = +0,049, p = 0,75, n = 45), oberhalb
        // ist er da (r = +0,568, p = 0,043, n = 13). Zur Belastbarkeit
        // siehe den Kopf dieser Datei.
        assert.equal(konstante('PREDICTOR_5_8_MIN_BROUGHT'), 100);
    });

    it('die beiden Daempfungsstufen senken, aber loeschen nicht', () => {
        const stark = konstante('PREDICTOR_5_8_STRONG_DAMP');
        const mild  = konstante('PREDICTOR_5_8_MILD_DAMP');
        assert.ok(stark > 0 && stark < mild, 'stark muss staerker senken als mild');
        assert.ok(mild < 1, 'die milde Stufe muss ueberhaupt senken');
        assert.ok(stark >= 0.5, 'eine Halbierung waere keine Daempfung mehr, sondern eine Loeschung');
        assert.ok(konstante('PREDICTOR_5_8_VERY_LOW_STICK') < konstante('PREDICTOR_5_8_LOW_STICK'),
            'die Schwellen stehen in der falschen Reihenfolge');
    });
});

describe('Der Datums-Chip rechnet mit derselben Grenze wie das Lag-Fenster', () => {
    it('keine zweite, fest verdrahtete Zahl im Renderer', () => {
        // Bis zum 29.08.2026 stand hier `ageDays > 35`, direkt ueber
        // einem Titel, der aus lag_days + Karenz kommt. Heute gleich,
        // weil lag_days = 14 — aber lag_days steht in
        // data/format_window.json. Bei der naechsten Rotation waeren
        // Farbe und Erklaerung des Chips auseinandergelaufen.
        const i = MC.indexOf('const isStale =');
        assert.notEqual(i, -1, 'die Veraltungs-Entscheidung ist verschwunden');
        const zeile = MC.slice(i, MC.indexOf('\n', i));
        assert.ok(!/>\s*\d+\s*;/.test(zeile),
            'der Chip entscheidet wieder an einer fest verdrahteten Zahl: ' + zeile.trim());
        assert.match(zeile, /LAG_KARENZ_TAGE/,
            'der Chip benutzt nicht dieselbe Karenz wie das Lag-Fenster');
    });

    it('die Karenz steht auf Modulebene, sonst wirft der Renderer', () => {
        // Sie stand bis zum 29.08.2026 lokal in loadData(). Der
        // Chip-Renderer laeuft in einem anderen Gueltigkeitsbereich —
        // node --check haette das nicht bemerkt, der Browser schon.
        const i = MC.indexOf('const LAG_KARENZ_TAGE = 21;');
        assert.notEqual(i, -1, 'LAG_KARENZ_TAGE ist verschwunden');
        const einrueckung = MC.slice(MC.lastIndexOf('\n', i) + 1, i).length;
        assert.equal(einrueckung, 2,
            `LAG_KARENZ_TAGE steht mit ${einrueckung} Leerzeichen eingerueckt — `
            + 'auf Modulebene sind es 2. Tiefer heisst: in einer Funktion, '
            + 'und dann sieht der Renderer sie nicht.');
    });

    it('die Fenstertiefe wird NACH der Wache gezaehlt', () => {
        const wache = MC.indexOf('if (!player || !arch || !tid) return;');
        const zaehl = MC.indexOf('turniereImFenster.add(tid);');
        assert.ok(wache > -1 && zaehl > -1, 'Wache oder Zaehlung verschwunden');
        assert.ok(zaehl > wache,
            'Turniere ohne Archetyp wuerden die Fenstertiefe aufblaehen — '
            + 'Turnier 0070 traegt 512 solche Zeilen');
    });
});
