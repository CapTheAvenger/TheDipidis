'use strict';
/*
 * Sechs Rechenfehler im Prognosemotor, gefunden von der
 * Agenten-Durchsicht am 29.08.2026, jeder vor der Reparatur selbst
 * im Quelltext nachgeprueft.
 *
 * Alle sechs haben dieselbe Bauart: sie sind unsichtbar. Keiner wirft
 * einen Fehler, keiner faerbt einen Test rot, keiner zeigt dem Nutzer
 * etwas Auffaelliges. Sie verschieben nur Zahlen — und eine Prognose
 * hat keine sichtbare richtige Antwort, an der die Verschiebung
 * auffiele. Deshalb stehen sie hier namentlich.
 *
 * WICHTIG zur Aussagekraft: keine dieser Zusicherungen fuehrt
 * app-meta-call.js aus (es ist eine Browser-IIFE mit fetch und DOM,
 * es gibt keinen Harness). Sie sichern die GESTALT des Quelltextes.
 * Das ist weniger, als es klingt — aber es ist genau das, was diese
 * sechs Fehler zurueckgebracht haette, denn jeder war eine einzelne
 * falsche Zeile. Die numerischen Nachstellungen unten rechnen die
 * betroffenen Formeln nach, nicht den Motor.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const MC_ROH = fs.readFileSync(
    path.join(__dirname, '..', '..', 'js', 'app-meta-call.js'), 'utf8');

/* NACHGESCHAERFT am 29.08.2026. Die erste Fassung dieser Datei war
 * wertlos: eine Nachpruefung holte JEDEN der sechs Fehler zurueck,
 * ohne dass eine der 13 Zusagen rot wurde. Drei Loecher:
 *
 *   1. Alle Zusagen lasen den ROHTEXT. Ein `//` vor der reparierten
 *      Zeile aendert am Regex nichts — und "beim Suchen kurz
 *      auskommentiert und vergessen" ist der wahrscheinlichste
 *      Rueckfall ueberhaupt. Deshalb wird hier jetzt der Quelltext
 *      OHNE Kommentare geprueft.
 *   2. Die S8-Zusage liess sich mit Mathematik aushebeln:
 *      min(A,B)*w ist bitgleich mit min(A*w, B*w). Wer wrFactor in
 *      BEIDE Argumente zieht, stellt die alte Bauart her und erfuellt
 *      trotzdem "wrFactor steht innerhalb". Jetzt wird das erste
 *      Argument von Math.min als BLANKE Konstante verlangt.
 *   3. Zwei Zusagen waren auf `d.` verankert. `x.ladderShare = wert`
 *      und ein Tippfehler im Feldnamen kamen glatt durch.
 *
 * Jede Zusage unten ist gegen die Mutation geprueft, die sie
 * ausgehebelt hat. */
const MC = MC_ROH
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');

describe('S4 — fieldSuppressionPp summierte sich ueber Laeufe', () => {
    it('wird vor dem Modus-Tor zurueckgesetzt', () => {
        const i = MC.indexOf('function _computeFieldSuppression()');
        assert.notEqual(i, -1);
        const kopf = MC.slice(i, i + 1400);
        const iReset = kopf.indexOf('d.fieldSuppressionPp = 0');
        const iTor = kopf.indexOf("_metaCallMode !== 'counter'");
        assert.notEqual(iReset, -1, 'kein Zuruecksetzen mehr vorhanden');
        assert.notEqual(iTor, -1);
        assert.ok(iReset < iTor,
            'das Zuruecksetzen steht HINTER dem Modus-Tor — im Standardmodus ' +
            'bricht die Funktion vorher ab und der alte Wert bleibt stehen');
        // Nicht nur vor DIESEM Tor: vor jedem fruehen Ausstieg. Sonst
        // genuegt ein zweites `if (...) return;` davor, um das Leck
        // wieder zu oeffnen (z.B. fuer den Aktuell/Vergangen-Schalter).
        const davor = kopf.slice(0, iReset);
        const frueheReturns = (davor.match(/\breturn\s*;/g) || []).length;
        assert.equal(frueheReturns, 1,
            `${frueheReturns} fruehe return vor dem Zuruecksetzen statt 1 — ` +
            `ein Ausstieg davor laesst den alten Wert wieder stehen`);
    });

    it('der Boden steigt weiterhin bei gesetzter Unterdrueckung aus', () => {
        // Die Wache selbst ist richtig — nur der Wert war schmutzig.
        assert.match(MC, /\(d\.fieldSuppressionPp \|\| 0\) > 0/,
            'die Wache im Online-Boden ist verschwunden');
    });

    it('nachgerechnet: ohne Zuruecksetzen waechst der Wert je Lauf', () => {
        let feld = 0;
        const einLauf = () => { feld = (feld || 0) + 1.5; };   // alte Bauart
        einLauf(); einLauf(); einLauf();
        assert.equal(feld, 4.5, 'so summierte es sich auf');
        let feld2 = 0;
        const neuerLauf = () => { feld2 = 0; feld2 = (feld2 || 0) + 1.5; };
        neuerLauf(); neuerLauf(); neuerLauf();
        assert.equal(feld2, 1.5, 'mit Zuruecksetzen bleibt es beim Wert eines Laufs');
    });
});

describe('S6 — 4.7 las seine eigene Vorprognose', () => {
    it('liest ladderShare, nicht onlineShare', () => {
        const i = MC.indexOf('const currentOnlineShare =');
        assert.notEqual(i, -1);
        const zeile = MC.slice(i, MC.indexOf('\n', i));
        assert.match(zeile, /d\.ladderShare/,
            'liest wieder d.onlineShare — das wird am Ende des Laufs mit der ' +
            'Prognose ueberschrieben, beim zweiten Lauf prueft 4.7 gegen sich selbst');
        assert.ok(!/d\.onlineShare/.test(zeile));
    });

    it('die Prognose schreibt nicht in ladderShare zurueck', () => {
        // Erster Versuch dieser Zusage verbot JEDE Zuweisung — und
        // schlug sofort an: der Datumsfilter (Z. ~11770/11784) rechnet
        // ladderShare aus den datierten Buendeln neu und stellt ihn
        // beim Loeschen des Filters wieder her. Das ist gewollt und
        // macht den Ersatz sogar besser, weil 4.7 damit den Filter
        // mitbekommt.
        //
        // Das echte Risiko ist ein anderes: schriebe irgendwo die
        // PROGNOSE nach ladderShare zurueck, waere der Ersatz genauso
        // kaputt wie d.onlineShare vorher.
        // Auch die Zeile DAVOR mitlesen — ein Zwischenwert
        // (`const wert = x.predictedShare; x.ladderShare = wert;`)
        // versteckt die Rueckkopplung sonst vor dem Regex.
        const schlecht = [];
        for (const m of MC.matchAll(/[A-Za-z_$][\w$]*\.ladderShare\s*=[^=][^;\n]*/g)) {
            const umfeld = MC.slice(Math.max(0, m.index - 160), m.index + m[0].length);
            if (/predictedShare|\.onlineShare/.test(umfeld)) schlecht.push(m[0].trim());
        }
        assert.deepEqual(schlecht, [],
            'die Prognose fliesst nach ladderShare zurueck: ' + schlecht.join(' | '));
    });

    it('die erlaubten Zuweisungen sind genau die des Datumsfilters', () => {
        // NICHT auf `d.` verankern: `x.ladderShare = wert` kam sonst
        // glatt durch, und mit `const wert = x.predictedShare || 0;`
        // eine Zeile davor auch an der Zusage darueber vorbei.
        const alle = (MC.match(/[A-Za-z_$][\w$]*\.ladderShare\s*=[^=][^;\n]*/g) || []);
        assert.equal(alle.length, 2,
            `${alle.length} Zuweisungen statt 2 — es ist eine dazugekommen, ` +
            `die diese Zusage nicht kennt: ${alle.join(' | ')}`);
        assert.ok(alle.some(z => /totalBuckets/.test(z)), 'Neuberechnung fehlt');
        assert.ok(alle.some(z => /orig/.test(z)), 'Wiederherstellung fehlt');
    });
});

describe('S7 — d.broughtShare gab es nie', () => {
    it('der Deckel liest aus _tournamentStats', () => {
        const i = MC.indexOf('const presenceCap = Math.max(ladderShare, broughtShare)');
        assert.notEqual(i, -1, 'der Praesenz-Deckel ist verschwunden');
        const umfeld = MC.slice(i - 700, i);
        assert.match(umfeld, /_tournamentStats\s*&&\s*_tournamentStats\[k\]/,
            'broughtShare kommt nicht aus _tournamentStats');
        // Ein Tippfehler im Feldnamen stellt broughtShare = 0 exakt
        // wieder her, ohne dass die Zusage oben etwas merkt. Also
        // gegen den Namen pruefen, den _tournamentStats WIRKLICH
        // schreibt (Z. ~5223: broughtShare: (brought / broughtSum)…).
        const feldImBau = /broughtShare\s*:/.test(MC);
        assert.ok(feldImBau, '_tournamentStats schreibt broughtShare nicht mehr');
        assert.match(umfeld, /_bStats\.broughtShare/,
            'der gelesene Feldname passt nicht zu dem, den _tournamentStats schreibt');
        assert.ok(!/const broughtShare = d\.broughtShare/.test(umfeld),
            'liest wieder d.broughtShare — dieses Feld existiert am Deck-Objekt nicht');
    });

    it('die Deck-Objekte fuehren das Feld tatsaechlich nicht', () => {
        // _shareList.map baut name/onlineShare/ladderShare/trend/onlineWinPct.
        const i = MC.indexOf('_shareList = shareRows');
        assert.notEqual(i, -1);
        const bau = MC.slice(i, i + 900);
        assert.ok(!/broughtShare\s*:/.test(bau),
            'jetzt gibt es broughtShare doch am Deck — dann waere der Umweg unnoetig');
    });
});

describe('S8 — 5.9 kappte vor dem WR-Faktor', () => {
    it('beide Zweige kappen zuletzt', () => {
        for (const konst of ['PREDICTOR_5_9_NEW_BOOST_PP_MAX',
                             'PREDICTOR_5_9_RISING_BOOST_PP_MAX']) {
            const i = MC.indexOf('Math.min(' + konst);
            assert.notEqual(i, -1, konst + ' nicht gefunden');
            const ausdruck = MC.slice(i, MC.indexOf(';', i));
            // Das erste Argument muss die BLANKE Konstante sein.
            // Sonst laesst sich min(A,B)*w als min(A*w, B*w)
            // schreiben — bitgleich mit der alten Bauart.
            assert.match(ausdruck, new RegExp('Math\\.min\\(\\s*' + konst + '\\s*,'),
                konst + ': das erste Argument von Math.min ist nicht mehr die ' +
                'blanke Obergrenze — min(A,B)*w laesst sich als min(A*w,B*w) tarnen');
            assert.match(ausdruck, /wrFactor\)/,
                konst + ': wrFactor steht wieder ausserhalb der Kappung');
            assert.ok(!/\)\s*\*\s*wrFactor\s*$/.test(ausdruck.trim()),
                konst + ': multipliziert nach der Kappung');
        }
    });

    it('nachgerechnet: aussen kappen hebt die Grenze um den Faktor', () => {
        const MAX = 2.0, basis = 20, faktor = 0.30, wr = 1.5;
        const alt = Math.min(MAX, basis * faktor) * wr;      // 2.0 * 1.5
        const neu = Math.min(MAX, basis * faktor * wr);      // min(2.0, 9.0)
        assert.equal(alt, 3.0, 'die alte Bauart erlaubte 3.0 pp statt 2.0');
        assert.equal(neu, 2.0, 'die neue haelt die benannte Obergrenze');
    });
});

describe('S9 — Division durch Null wurde NaN', () => {
    it('6.1 hat eine Wache auf currentTotal', () => {
        const i = MC.indexOf('const scale = entry.floorTotal / entry.slot.currentTotal');
        assert.notEqual(i, -1, 'der Live-Boden ist verschwunden');
        const davor = MC.slice(Math.max(0, i - 2500), i);
        assert.match(davor, /if \(!\(slot\.currentTotal > 0\)\) return;/,
            'ohne Wache wird scale zu Infinity und before * scale zu NaN');
    });

    it('6.0 hat dieselbe Wache', () => {
        const i = MC.indexOf('const memberScale  = target / currentTotal');
        assert.notEqual(i, -1, 'der Tier-1-Boden ist verschwunden');
        const davor = MC.slice(Math.max(0, i - 900), i);
        assert.match(davor, /if \(!\(currentTotal > 0\)\) return;/,
            'dieselbe Luecke wie in 6.1, nur eine Stufe hoeher');
    });

    it('nachgerechnet: 0 mal Unendlich ergibt NaN, nicht 0', () => {
        const vorher = 0, skala = 5 / 0;
        assert.equal(skala, Infinity);
        assert.ok(Number.isNaN(vorher * skala),
            'genau dieser Wert landete auf d.predictedShare und d.onlineShare');
    });
});

// _loadDataImpl enthaelt MEHRERE `return true;` (fruehe Ausstiege).
// Der erste Versuch dieser Zusage schnitt den Rumpf am ersten davon
// ab und sah die Matchup-Schritte gar nicht — sie schlug an, ohne
// dass etwas kaputt war. Deshalb hier bis zur naechsten
// Funktionsdeklaration schneiden.
function ladeRumpf() {
    const i = MC.indexOf('async function _loadDataImpl');
    assert.notEqual(i, -1, '_loadDataImpl ist verschwunden');
    // Beide Formen suchen: die naechste Deklaration ist hier
    // `async function _onToggleSource`, nicht `function`. Der erste
    // Versuch suchte nur `\n  function ` und lief deshalb ueber das
    // Funktionsende hinaus in _onToggleSource — dort steht auch ein
    // _runPredictor(), und die Zusage war damit blind fuer das
    // Entfernen des zweiten Laufs.
    const kandidaten = ['\n  function ', '\n  async function ']
        .map(m => MC.indexOf(m, i + 10))
        .filter(x => x !== -1);
    const ende = kandidaten.length ? Math.min(...kandidaten) : MC.length;
    return MC.slice(i, ende);
}

describe('Der erste Bildschirm rechnet mit vollstaendigem Zustand', () => {
    it('_loadDataImpl laesst den Motor NACH den Matchups noch einmal laufen', () => {
        // BEFUND: der erste Lauf stand vor _matchupMap und
        // _onlineWinsByDeck. 4.0a und 4.5 liefen damit leer, und der
        // erste Bildschirm zeigte andere Zahlen als jeder spaetere
        // Lauf — 27 von 131 Decks ueber 0,1 pp, groesste Abweichung
        // 1,31 pp. Der Nutzer sah eine Zahl, die beim ersten
        // beliebigen Klick ohne erkennbaren Grund sprang.
        const rumpf = ladeRumpf();

        const iMatchup = rumpf.indexOf('_matchupMap = {}');
        const iOnline  = rumpf.lastIndexOf('_onlineWinsByDeck = {}');
        assert.ok(iMatchup > 0 && iOnline > 0, 'die Ladeschritte sind verschoben');

        const laeufe = [...rumpf.matchAll(/_runPredictor\(\);/g)].map(m => m.index);
        assert.ok(laeufe.length >= 2,
            `nur ${laeufe.length} _runPredictor() in _loadDataImpl — der zweite ` +
            `Lauf fehlt, der erste Bildschirm rechnet wieder ohne Matchups`);
        assert.ok(laeufe[laeufe.length - 1] > Math.max(iMatchup, iOnline),
            'der letzte Lauf steht immer noch VOR den Matchups/Online-Siegern');
    });

    it('der fruehe Lauf bleibt erhalten', () => {
        // Er wird gebraucht: das Banner haengt daran. Der zweite Lauf
        // korrigiert ihn, er ersetzt ihn nicht.
        const rumpf = ladeRumpf();
        const iMatchup = rumpf.indexOf('_matchupMap = {}');
        const laeufe = [...rumpf.matchAll(/_runPredictor\(\);/g)].map(m => m.index);
        assert.ok(laeufe.some(x => x < iMatchup),
            'der fruehe Lauf ist weg — das Banner bekommt keine Daten mehr');
    });
});
