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

/* NACHGESCHAERFT am 30.08.2026 — und diesmal war es noetig.
 *
 * Eine Durchsicht hat ACHT Mutationen eingebaut, jede den
 * urspruenglichen Fehler wiederherstellend, und ALLE ACHT kamen gruen
 * durch. Jede einzelne Zusicherung dieser Datei war aushebelbar. Die
 * Ursache ist immer dieselbe: sie lasen TEXT, und Text laesst sich
 * umschreiben, ohne das Verhalten zu aendern.
 *
 * Die acht Umgehungen, namentlich, damit niemand sie zweimal findet:
 *
 *   S4-a  `if (_metaCallMode === 'counter') d.fieldSuppressionPp = 0;`
 *         Der gesuchte Text steht vor dem Tor — er feuert nur nie.
 *   S4-b  ein zusaetzlicher Ausstieg als `return undefined;`.
 *         Der Zaehler suchte `\breturn\s*;` und sah ihn nicht.
 *   S6-a  Deklarationszeile unveraendert, beide VERWENDUNGEN auf
 *         `d.onlineShare` gedreht. Geprueft wurde nur die Deklaration.
 *   S6-b  `x['ladderShare'] = ...` in Klammerschreibweise. Beide
 *         Regexe kannten nur die Punktschreibweise. (80 von 131 Decks
 *         aendern sich messbar, Dragapult +2,11 pp.)
 *   S7-a  `_bStats.broughtSharePct` — enthaelt `_bStats.broughtShare`
 *         als Teilzeichenkette, liefert aber immer undefined.
 *   S8-a  `Math.min(CONST, base) * (wrFactor)` — die Klammer laesst den
 *         Ausdruck auf `)` enden, und die Endpruefung greift nicht.
 *   S9-a  beide Wachen in `if (false) { ... }` gehuellt. Der Text steht
 *         noch da, erreichbar ist er nicht.
 *   L-a   `if (_shareList && _shareList.length > 1e9) _runPredictor();`
 *         Der Aufruf steht an der richtigen Stelle und laeuft nie.
 *
 * Die Antwort darauf ist nicht ein besserer Regex, sondern eine andere
 * Frage. Statt "steht dieser Text da" fragen die Zusagen jetzt:
 *   - Steht die Anweisung in einem Zweig? (`bedingungenUm`)
 *   - Ist der Zweig ueberhaupt erreichbar? (`entferneToteZweige`)
 *   - Steht der Feldname als GANZES Wort da? (Wortgrenzen)
 *   - Sagt die Klammerschreibweise dasselbe? (`vereinheitlicheZugriff`)
 * Und wo es geht, wird nachgerechnet statt gelesen.
 *
 * Alle acht Umgehungen sind gegen diese Fassung erneut eingebaut
 * worden und fallen jetzt durch.
 */

/** Kommentare raus. `//` vor einer reparierten Zeile ist der
 *  wahrscheinlichste Rueckfall ueberhaupt. */
function ohneKommentare(q) {
    return q.replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** `x['feld']` und `x["feld"]` werden zu `x.feld`.
 *  Ohne das ist jede Zusage ueber einen Feldnamen mit einer anderen
 *  Schreibweise zu umgehen — S6-b hat genau das getan. */
function vereinheitlicheZugriff(q) {
    return q.replace(/\[\s*(['"])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2');
}

/** Zweige, die nie laufen, samt Inhalt entfernen.
 *  `if (false) { <die reparierte Zeile> }` erfuellt sonst jede
 *  Textpruefung, ohne dass die Zeile je ausgefuehrt wird (S9-a). */
function entferneToteZweige(q) {
    const TOT = /if\s*\(\s*(?:false|0|null|undefined|!\s*1|!\s*true)\s*\)\s*\{/g;
    let out = q, m;
    let sicherung = 0;
    while ((m = TOT.exec(out)) && sicherung++ < 200) {
        const auf = m.index + m[0].length - 1;
        let tiefe = 0, i = auf;
        for (; i < out.length; i++) {
            if (out[i] === '{') tiefe++;
            else if (out[i] === '}') { tiefe--; if (tiefe === 0) break; }
        }
        out = out.slice(0, m.index) + out.slice(i + 1);
        TOT.lastIndex = 0;
    }
    return out;
}

/** Die Bedingungen, unter denen die Anweisung an `pos` steht.
 *
 *  Faehrt die oeffnenden Bloecke von `pos` rueckwaerts ab und
 *  sammelt den Kopf jedes umschliessenden `if (...)`. Damit laesst
 *  sich pruefen, ob eine Zeile UNBEDINGT laeuft — S4-a und L-a haben
 *  sich beide hinter einem Zweig versteckt, der nie zutrifft.
 *
 *  Bewusst grob: Funktionsrumpf, Schleifenrumpf und Zweig sehen hier
 *  gleich aus. Das genuegt, weil die Frage lautet "steht ein `if`
 *  dazwischen", nicht "welcher Art ist der Block".
 */
function bedingungenUm(q, pos) {
    const raus = [];
    // Zuerst: ein `if (...)` OHNE geschweifte Klammern, direkt vor der
    // Anweisung auf derselben Zeile. Umgehung L-a schrieb genau das —
    //   if (_shareList && _shareList.length > 1e9) _runPredictor();
    // — und weil dort kein Block aufgeht, war der Zweig fuer die
    // Klammersuche unten unsichtbar.
    const zeilStart = q.lastIndexOf('\n', pos) + 1;
    const vorne = q.slice(zeilStart, pos);
    const mKurz = vorne.match(/\bif\s*\(([\s\S]*)\)\s*$/);
    if (mKurz) raus.push(mKurz[1].trim());
    let tiefe = 0;
    for (let i = pos; i >= 0; i--) {
        const c = q[i];
        if (c === '}') tiefe++;
        else if (c === '{') {
            if (tiefe > 0) { tiefe--; continue; }
            // Ein Block hat sich geoeffnet: was steht in der Zeile davor?
            const zeilenAnfang = q.lastIndexOf('\n', i) + 1;
            const kopf = q.slice(zeilenAnfang, i).trim();
            const mIf = kopf.match(/\bif\s*\(([\s\S]*)\)\s*$/);
            if (mIf) raus.push(mIf[1].trim());
            // NICHT auf den Zeilenanfang springen. Der erste Versuch tat
            // das — und uebersah damit jeden Zweig, der auf DERSELBEN
            // Zeile steht wie ein anderer Blockoeffner. Genau so kam
            // Umgehung S4-a durch:
            //   if (_metaCallMode === 'counter') { _shareList.forEach(d => {
            // Rueckwaerts trifft man zuerst die geschweifte Klammer der
            // Pfeilfunktion; deren Zeilenanfang endet auf `=> ` und
            // passt nicht auf das if-Muster. Wer dann zum Zeilenanfang
            // springt, sieht das `if` davor nie.
        }
    }
    return raus;
}

/** Alle fruehen Ausstiege — jede Form, nicht nur `return;`.
 *  S4-b kam mit `return undefined;` durch. */
function ausstiege(q) {
    return (q.match(/\breturn\s*(?:;|undefined\s*;|void\s+0\s*;|null\s*;)/g) || []).length;
}

const MC = entferneToteZweige(vereinheitlicheZugriff(ohneKommentare(MC_ROH)));
/** Wie MC, aber MIT toten Zweigen — fuer Zusagen, die pruefen wollen,
 *  dass jemand einen Zweig totgelegt hat. */
const MC_MIT_TOTEN = vereinheitlicheZugriff(ohneKommentare(MC_ROH));

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
        // Jede Form eines fruehen Ausstiegs, nicht nur `return;`.
        // `return undefined;` kam vorher glatt durch (Umgehung S4-b).
        const frueheReturns = ausstiege(davor);
        assert.equal(frueheReturns, 1,
            `${frueheReturns} fruehe return vor dem Zuruecksetzen statt 1 — ` +
            `ein Ausstieg davor laesst den alten Wert wieder stehen`);

        // Und: das Zuruecksetzen darf in KEINEM Zweig stehen. Genau so
        // hat sich Umgehung S4-a versteckt — der Text stand vor dem Tor,
        // aber in `if (_metaCallMode === 'counter') { ... }`, und im
        // Standardmodus lief er nie.
        const bed = bedingungenUm(kopf, iReset);
        assert.deepEqual(bed, [],
            'das Zuruecksetzen steht in einem Zweig (' + bed.join(' / ') + ') — ' +
            'dann laeuft es nicht in jedem Modus, und der Wert summiert sich ' +
            'wieder ueber die Laeufe');

        // Der Zweig darf auch nicht anderswo totgelegt worden sein.
        const iRoh = MC_MIT_TOTEN.indexOf('d.fieldSuppressionPp = 0');
        assert.notEqual(iRoh, -1,
            'das Zuruecksetzen ist nur noch in einem toten Zweig vorhanden');
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

        // Die Deklaration allein genuegt nicht. Umgehung S6-a hat sie
        // stehen lassen und stattdessen BEIDE Verwendungsstellen auf
        // d.onlineShare gedreht — messbar 80 von 131 Decks, Dragapult
        // +2,11 pp, und diese Zusage blieb gruen.
        //
        // Der ganze 4.7-Block darf deshalb kein d.onlineShare LESEN.
        // Schreiben ist erlaubt: der Motor spiegelt die Prognose am Ende
        // bewusst dorthin.
        const iBlock = MC.indexOf('function _computeRecencyMomentum');
        const block = iBlock !== -1
            ? MC.slice(iBlock, MC.indexOf('\n  function ', iBlock + 10))
            : MC.slice(Math.max(0, i - 1500), i + 2500);
        const lesend = [...block.matchAll(/[A-Za-z_$][\w$]*\.onlineShare(?!\s*=[^=])/g)]
            .map(m => block.slice(Math.max(0, m.index - 40), m.index + 20).trim());
        assert.deepEqual(lesend, [],
            '4.7 liest wieder onlineShare: ' + lesend.join(' | '));
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

    it('ladderShare wird ueberhaupt nicht mehr zugewiesen', () => {
        // NICHT auf `d.` verankern: `x.ladderShare = wert` kam sonst
        // glatt durch, und mit `const wert = x.predictedShare || 0;`
        // eine Zeile davor auch an der Zusage darueber vorbei.
        // MC ist bereits vereinheitlicht: x['ladderShare'] steht hier
        // als x.ladderShare. Ohne das kam Umgehung S6-b durch — sie
        // schrieb die Prognose in Klammerschreibweise zurueck, und
        // beide Regexe kannten nur den Punkt.
        //
        // Bis zum 01.09.2026 standen hier ZWEI erlaubte Zuweisungen:
        // die Neuberechnung aus den datierten Buendeln und ihre
        // Wiederherstellung. Beide sind weg — die Umschreibung der
        // Ladder aus dem datierten Strom kostete gemessen 0,73 pp MAE
        // ueber sieben Ziele (siehe tests/unit/test-datenfenster-und-
        // damper.js). Damit wird die Zusage strenger statt schwaecher:
        // gibt es GAR KEINE Zuweisung, kann es auch keinen Weg geben,
        // auf dem die Prognose nach ladderShare zurueckfliesst.
        const alle = (MC.match(/[A-Za-z_$][\w$]*\.ladderShare\s*=[^=][^;\n]*/g) || []);
        assert.deepEqual(alle, [],
            `${alle.length} Zuweisung(en) an ladderShare — der Wert kommt aus ` +
            `der Ladder-CSV und wird nirgends sonst gesetzt: ${alle.join(' | ')}`);
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
        // WORTGRENZE. Umgehung S7-a schrieb `_bStats.broughtSharePct`
        // — enthaelt `_bStats.broughtShare` als Teilzeichenkette,
        // liefert aber immer undefined und stellt damit genau den alten
        // Fehler wieder her (Deckel greift nie).
        assert.match(umfeld, /_bStats\.broughtShare\b(?!\w)/,
            'der gelesene Feldname passt nicht zu dem, den _tournamentStats ' +
            'schreibt — ein angehaengtes Wort genuegt, damit der Deckel ' +
            'wieder auf undefined laeuft');
        const gelesen = (umfeld.match(/_bStats\.(\w+)/g) || []);
        assert.ok(gelesen.every(g => g === '_bStats.broughtShare'),
            'aus _tournamentStats wird ein anderes Feld gelesen: ' + gelesen.join(', '));
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
            // Umgehung S8-a: `Math.min(CONST, base) * (wrFactor)`.
            // Die Klammer laesst den Ausdruck auf `)` enden, `wrFactor)`
            // trifft, und die Endpruefung greift nicht. Also erst
            // ueberfluessige Klammern und Leerraum entfernen, DANN
            // pruefen — und zusaetzlich verlangen, dass die Klammer von
            // Math.min ueberhaupt erst NACH wrFactor schliesst.
            const flach = ausdruck.replace(/\s+/g, '')
                                  .replace(/\((\w+)\)/g, '$1');
            assert.match(flach, /wrFactor\)/,
                konst + ': wrFactor steht wieder ausserhalb der Kappung');
            assert.ok(!/\)\*wrFactor/.test(flach),
                konst + ': multipliziert nach der Kappung');
            // Die schliessende Klammer von Math.min muss hinter
            // wrFactor liegen — sonst ist wrFactor nicht drin.
            const iMin = flach.indexOf('Math.min(');
            let tiefe = 0, iZu = -1;
            for (let k = iMin + 8; k < flach.length; k++) {
                if (flach[k] === '(') tiefe++;
                else if (flach[k] === ')') { tiefe--; if (tiefe === 0) { iZu = k; break; } }
            }
            assert.ok(iZu > flach.indexOf('wrFactor') && flach.indexOf('wrFactor') > iMin,
                konst + ': wrFactor liegt nicht innerhalb der Math.min-Klammer');
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
        // MC hat tote Zweige bereits entfernt. Umgehung S9-a hat die
        // Wache in `if (false) { ... }` gehuellt: der Text stand noch da,
        // erreichbar war er nicht.
        assert.match(davor, /if \(!\(slot\.currentTotal > 0\)\) return;/,
            'ohne Wache wird scale zu Infinity und before * scale zu NaN');
        assert.deepEqual(
            bedingungenUm(davor, davor.indexOf('if (!(slot.currentTotal > 0)) return;'))
                .filter(b => !/currentTotal/.test(b) && !/forEach|map|=>/.test(b)),
            [],
            'die Wache steht in einem zusaetzlichen Zweig und laeuft nicht immer');
    });

    it('6.0 hat dieselbe Wache', () => {
        const i = MC.indexOf('const memberScale  = target / currentTotal');
        assert.notEqual(i, -1, 'der Tier-1-Boden ist verschwunden');
        const davor = MC.slice(Math.max(0, i - 900), i);
        assert.match(davor, /if \(!\(currentTotal > 0\)\) return;/,
            'dieselbe Luecke wie in 6.1, nur eine Stufe hoeher');
        assert.deepEqual(
            bedingungenUm(davor, davor.indexOf('if (!(currentTotal > 0)) return;'))
                .filter(b => !/currentTotal/.test(b) && !/forEach|map|=>/.test(b)),
            [],
            'die Wache steht in einem zusaetzlichen Zweig und laeuft nicht immer');
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

        // Und er muss UNBEDINGT laufen. Umgehung L-a schrieb
        // `if (_shareList && _shareList.length > 1e9) _runPredictor();`
        // — an der richtigen Stelle, mit der richtigen Zeichenkette,
        // und niemals ausgefuehrt.
        const letzte = laeufe[laeufe.length - 1];
        const bed = bedingungenUm(rumpf, letzte)
            .filter(b => !/forEach|map|=>|try|catch/.test(b));
        assert.deepEqual(bed, [],
            'der zweite Lauf steht in einem Zweig (' + bed.join(' / ') + ') — ' +
            'dann rechnet der erste Bildschirm wieder ohne Matchups, und die ' +
            'Zahl springt beim ersten beliebigen Klick');
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

/* ═══════════════════════════════════════════════════════════════════
 * Vier weitere Befunde der Durchsicht vom 30.08.2026.
 * ═══════════════════════════════════════════════════════════════════ */

describe('S3 — der Familien-Deckel rechnete mit eingefrorenen Summen', () => {
    it('die Summe wird beim Deckeln neu aus den Mitgliedern gebildet', () => {
        const i = MC.indexOf('const familyAgg = {}');
        assert.notEqual(i, -1, 'der Familien-Deckel ist verschwunden');
        const block = MC.slice(i, i + 2600);
        const iSchleife = block.indexOf('Object.keys(familyAgg).forEach');
        assert.notEqual(iSchleife, -1);
        const rumpf = block.slice(iSchleife);
        assert.match(rumpf, /f\.total\s*=\s*f\.members\.reduce/,
            'f.total wird wieder aus dem einmal gebauten Aggregat gelesen. ' +
            'Sobald die erste Familie gedeckelt ist, skaliert der Block jeden ' +
            'anderen Eintrag — die zweite Familie rechnet danach mit Zahlen, ' +
            'die es nicht mehr gibt.');
        // Und zwar VOR der Deckelfrage, nicht danach.
        const iNeu = rumpf.indexOf('f.total = f.members.reduce');
        const iFrage = rumpf.indexOf('f.total <= effectiveCap');
        assert.ok(iNeu > -1 && iFrage > iNeu,
            'die Neuberechnung steht hinter der Deckelfrage — dann entscheidet ' +
            'weiter der eingefrorene Wert, ob ueberhaupt gedeckelt wird');
        assert.deepEqual(
            bedingungenUm(rumpf, iNeu).filter(b => !/forEach|map|=>/.test(b)),
            [],
            'die Neuberechnung steht in einem Zweig und laeuft nicht immer');
    });

    it('nachgerechnet: eingefroren verfehlt der Deckel sein Ziel', () => {
        // Zwei Familien ueber dem Deckel, echte Groessenordnung.
        const decke = 2.0;
        const start = { A: 6.96, B: 2.31, rest: 90.73 };

        // ALT: beide Familien rechnen mit den Startwerten.
        let a = start.A, b = start.B, rest = start.rest;
        for (const fam of ['A', 'B']) {
            const total = start[fam];                 // eingefroren
            if (total <= decke) continue;
            const scale = decke / total;
            const others = 100 - total;               // ebenfalls eingefroren
            const oScale = (others + (total - decke)) / others;
            if (fam === 'A') { a *= scale; b *= oScale; rest *= oScale; }
            else             { b *= scale; a *= oScale; rest *= oScale; }
        }
        assert.ok(Math.abs(b - decke) > 1e-6,
            `Familie B landet bei ${b.toFixed(6)} statt auf dem Deckel ${decke}`);
        assert.ok(Math.abs((a + b + rest) - 100) > 1e-6,
            `die Summe steht bei ${(a + b + rest).toFixed(6)} — sie muesste ` +
            `abweichen, sonst zeigt diese Nachstellung den Fehler nicht`);

        // NEU: jede Familie rechnet mit dem Stand, den sie vorfindet.
        let a2 = start.A, b2 = start.B, rest2 = start.rest;
        for (const fam of ['A', 'B']) {
            const total = fam === 'A' ? a2 : b2;      // laufend
            if (total <= decke) continue;
            const scale = decke / total;
            const others = 100 - total;
            const oScale = (others + (total - decke)) / others;
            if (fam === 'A') { a2 *= scale; b2 *= oScale; rest2 *= oScale; }
            else             { b2 *= scale; a2 *= oScale; rest2 *= oScale; }
        }
        assert.ok(Math.abs(b2 - decke) < 1e-9,
            `Familie B landet bei ${b2.toFixed(6)} statt genau auf ${decke}`);
        assert.ok(Math.abs((a2 + b2 + rest2) - 100) < 1e-9,
            `die Summe steht bei ${(a2 + b2 + rest2).toFixed(6)} statt 100`);
    });
});

describe('S11 — zwei Schemata fuer denselben Familienschluessel', () => {
    it('jede Familienbildung fragt dieselbe Stelle', () => {
        // extractMainPokemon bleibt fuer den echten Pokemon-Namen
        // (_loadArchetypeHpMap holt damit HP aus den Kartendaten — ein
        // Override-Schluessel griffe dort ins Leere). Ueberall sonst,
        // wo Decks zu Familien zusammengefasst werden, muss
        // _familyKeyForDeck gefragt werden, sonst landen dieselben
        // Decks je nach Weg in verschiedenen Familien.
        // Fuer jede Fundstelle die umschliessende Funktion bestimmen.
        const ERLAUBT = new Set([
            '_loadArchetypeHpMap',      // braucht den echten Pokemon-Namen
            '_familyKeyForDeck',        // die Stelle selbst
            'extractMainPokemon',       // die Definition
        ]);
        const treffer = [];
        for (const m of MC.matchAll(/extractMainPokemon\(/g)) {
            // Die Definitionszeile selbst ist keine Fundstelle.
            if (/function\s+$/.test(MC.slice(Math.max(0, m.index - 12), m.index))) continue;
            const davor = MC.slice(0, m.index);
            const mFn = [...davor.matchAll(/(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g)];
            const inFn = mFn.length ? mFn[mFn.length - 1][1] : '(unbekannt)';
            if (ERLAUBT.has(inFn)) continue;
            const zeile = MC.slice(Math.max(0, m.index - 70), m.index + 30)
                .split('\n').pop().trim();
            treffer.push(`${inFn}: ${zeile}`);
        }
        assert.deepEqual(treffer, [],
            'diese Stellen bilden wieder Familien mit der Erst-Wort-Heuristik ' +
            'statt mit der Override-Karte:\n  ' + treffer.join('\n  '));
    });

    it('die Override-Karte wird ueberhaupt noch gelesen', () => {
        assert.match(MC, /_deckFamilyOverrideByName/,
            'data/deck_families.json wird nicht mehr ausgewertet — dann ist ' +
            '_familyKeyForDeck nur noch ein teurer Alias');
        assert.match(MC, /function _familyKeyForDeck/);
    });

    it('der 6.0-Boden sucht im selben Eimer, in dem er markiert hat', () => {
        // Der eigentliche Schaden war die Kreuzung: der Boden suchte in
        // einem Erst-Wort-Eimer nach einem Mitglied, dessen Eignung ueber
        // die Override-Karte bestimmt wurde.
        const i = MC.indexOf('_tier1Eligible && m._tier1Diag');
        assert.notEqual(i, -1, 'die Tier-1-Ausnahme ist verschwunden');
        const davor = MC.slice(Math.max(0, i - 1800), i);
        assert.match(davor, /_familyKeyForDeck\(d\.name\)/,
            'der Eimer, in dem gesucht wird, entsteht wieder mit ' +
            'extractMainPokemon — dann hebt der Boden die falsche Deckmenge');
    });
});

describe('N3 — 5.7 addierte Prozentpunkte in Roheinheiten', () => {
    it('der Zuschlag wird umgerechnet wie bei den Nachbarn', () => {
        const i = MC.indexOf('d.antiLeaderBoostPp = boost;');
        assert.notEqual(i, -1, 'der Anti-Leader-Zuschlag ist verschwunden');
        const davor = MC.slice(Math.max(0, i - 400), i);
        assert.match(davor, /\(\s*boost\s*\/\s*100\s*\)\s*\*\s*totalRaw/,
            'der pp-Wert wird wieder ungerechnet auf predictedShareRaw addiert. ' +
            'Die Summe der Rohwerte ist nicht 100 (gemessen 113,3 bzw. 103,5), ' +
            'also bedeutet die Konstante PREDICTOR_57_BOOST_PP_MAX dann nicht, ' +
            'was sie sagt.');
        assert.ok(!/predictedShareRaw\s*=\s*\(d\.predictedShareRaw \|\| 0\) \+ boost;/
                  .test(MC),
            'die ungerechnete Addition steht wieder da');
    });

    it('die Nachbarstufen rechnen weiterhin um', () => {
        // Wenn eine von ihnen die Umrechnung verliert, ist der Vergleich,
        // auf dem diese Reparatur beruht, hinfaellig.
        assert.match(MC, /\(\s*suppressPp\s*\/\s*100\s*\)\s*\*\s*grandTotal/,
            '4.6 rechnet nicht mehr um');
        assert.match(MC, /\(\s*floorPct\s*\/\s*100\s*\)\s*\*\s*totalRaw/,
            '5.5 rechnet nicht mehr um');
    });

    it('nachgerechnet: bei Summe 113 wird aus 1,50 pp real 1,32 pp', () => {
        const summeRoh = 113.31, zugesagt = 1.50;
        const ohneUmrechnung = (zugesagt / summeRoh) * 100;
        assert.ok(Math.abs(ohneUmrechnung - 1.32) < 0.01,
            `ohne Umrechnung kommen ${ohneUmrechnung.toFixed(2)} pp an`);
        const mitUmrechnung = ((zugesagt / 100) * summeRoh / summeRoh) * 100;
        assert.ok(Math.abs(mitUmrechnung - zugesagt) < 1e-9,
            'mit Umrechnung kommt genau der zugesagte Wert an');
    });
});

describe('S12 — der Modus-B-Kommentar beschrieb eine andere Rechnung', () => {
    it('die alte Gewichtsformel steht nicht mehr als Beschreibung da', () => {
        // Gemessen in einer echten Modus-B-Lage: alle 88 Decks nehmen den
        // Prognosekern, die beschriebene Formel lief fuer 0 Decks. Ein
        // Kommentar, der eine andere Rechnung beschreibt als die daneben,
        // ist schlimmer als keiner — er wird geglaubt.
        const i = MC_ROH.indexOf('Mode B (labs majors present)');
        assert.notEqual(i, -1, 'der Abschnitt ist ganz verschwunden');
        const block = MC_ROH.slice(i, i + 1800);
        assert.match(block, /LAEUFT NICHT MEHR|laeuft nicht mehr/,
            'der Kommentar behauptet wieder, die Gewichtsformel sei der ' +
            'Hauptweg — sie ist der Ausnahmefall');
        assert.match(block, /_kernWert|Prognosekern/,
            'der Kommentar nennt den Weg nicht, der tatsaechlich laeuft');
    });

    it('die tote Ladder-Summe ist weg', () => {
        // `const totalLadder = ... d.onlineShare` wurde gebaut und nie
        // gelesen. Stehen lassen waere die naechste Falle: onlineShare
        // wird am Ende des Laufs mit der Prognose ueberschrieben, die
        // Summe haette also je nach Aufrufzeitpunkt zwei Bedeutungen.
        const schlecht = [...MC.matchAll(
            /const\s+totalLadder\s*=[^;\n]*\.onlineShare[^;\n]*/g)].map(m => m[0].trim());
        assert.deepEqual(schlecht, [],
            'eine Ladder-Summe wird wieder aus onlineShare gebaut: ' +
            schlecht.join(' | '));
        // Die echten Ladder-Summen lesen ladderShare — es muss sie noch geben.
        assert.ok((MC.match(/totalLadder\s*[+]?=[^;\n]*ladderShare/g) || []).length >= 3,
            'die Ladder-Summen lesen nicht mehr ladderShare');
    });
});
