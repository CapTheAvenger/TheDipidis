'use strict';
/**
 * DEIN DECK GEGEN DAS ERWARTETE META — die Rechnung, ausgefuehrt.
 *
 * BESTELLT (Betreiber, 11.09.2026, mit der Metagross-EV-Seite als
 * Vorlage): „für das dein Deck gegen das Meta Feature kannst du noch
 * mal ein umfassendes Rework machen … Jetzt verstehe ich auch was das
 * Feature soll, aber von unserer Seite war mir das nicht klar."
 *
 * WORAUF DIESE DATEI ZIELT
 * ------------------------
 * Der Block rechnete bisher in js/ds-ev-rechner.js gegen das GEMESSENE
 * Online-Feld. Im Meta Call rechnet er gegen das ERWARTETE — die Spalte
 * „Final %", also Prognose oder, wo der Nutzer eine eigene Schaetzung
 * eingetragen hat, dessen Schaetzung. Das ist der ganze Unterschied,
 * und er ist genau die Art Aenderung, die man nicht sieht: beide Zahlen
 * sind Prozentwerte in derselben Groessenordnung, und eine Rechnung,
 * die versehentlich weiter den gemessenen Anteil nimmt, sieht richtig
 * aus.
 *
 * Deshalb pruefen die Faelle unten nicht „kommt eine Zahl heraus",
 * sondern an jeder Stelle, ob es die richtige EINGABE war — mit
 * Feldern, in denen sich gemessener und erwarteter Anteil deutlich
 * unterscheiden, sodass eine Verwechslung ein anderes Ergebnis
 * liefert.
 *
 * Kein jsdom, kein Zugriff auf data/: jede Eingabe steht im Test.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { baue, lies } = require('./lib-dom-sandkasten.js');

const WURZEL = path.join(__dirname, '..', '..');
const MC = 'js/app-meta-call.js';
const SRC = fs.readFileSync(path.join(WURZEL, 'js', 'app-meta-call.js'), 'utf8');

/* Die echte Glaettung, nicht eine zweite Kopie ihrer Formel. Faellt
   js/matchup-glaettung.js, faellt auch dieser Test — und das ist
   richtig so: das Band haengt an ihrer Varianz. */
function glaettung() {
    const src = fs.readFileSync(path.join(WURZEL, 'js', 'matchup-glaettung.js'), 'utf8');
    const win = {};
    return new Function('window', src + '\nreturn window.DsGlaettung;')(win);
}
const G = glaettung();

/**
 * Ein Sandkasten mit den echten Funktionen des Moduls.
 *
 * @param feld      Ergebnis von buildField(), wie es der Block bekommt
 * @param quoten    { gegnername: {pWin, pTie, pLoss, partien, ...} }
 *                  — das, was getMatchup zurueckgeben soll
 * @param wahl      { umfang, einzel }
 */
function umgebung(feld, quoten, wahl) {
    const w = wahl || {};
    const ctx = baue(MC, [
        'function _evKandidaten(field)',
        'function _evRechne(field)',
        'function _anzeigeQuote(m)',
    ], {
        window: { DsGlaettung: G },
        _settings: { myDeck: 'Mein Deck', rounds: 8 },
        getMatchup: (mein, gegner) => quoten[gegner]
            || { pWin: 0.5, pTie: 0.02, pLoss: 0.48, partien: 0, ohneMessung: true },
        normalize: (s) => String(s || '').toLowerCase().trim(),
        _evUmfang: w.umfang || 'alle',
        _evEinzel: w.einzel || '',
        EV_TOP_N: 8,
        EV_BAND_Z: 1.96,
    });
    return ctx;
}

/** Eine Paarung aus einer echten Bilanz — pWin traegt die Unentschieden. */
function paarung(siege, niederlagen, unentschieden) {
    const n = siege + niederlagen + (unentschieden || 0);
    return {
        pWin: siege / n,
        pTie: (unentschieden || 0) / n,
        pLoss: niederlagen / n,
        partien: n,
    };
}

/* Ein Feld, in dem gemessener und erwarteter Anteil AUSEINANDERLIEGEN.
   Genau das ist der Zweck: wer versehentlich den gemessenen Anteil
   gewichtet, bekommt eine andere Zahl und faellt auf. */
function feld() {
    return [
        // Name        Prognose  Schaetzung  Final   gemessen(ladder)
        { name: 'Alpha',   onlineShare: 10, personalShare: 40, finalShare: 40, count: 400 },
        { name: 'Beta',    onlineShare: 30, finalShare: 30, count: 300 },
        { name: 'Gamma',   onlineShare: 20, finalShare: 20, count: 200 },
        { name: '_junk',   onlineShare: 10, finalShare: 10, count: 100 },
    ];
}

function quotenNormal() {
    return {
        Alpha: paarung(70, 30, 0),        // 70 %
        Beta:  paarung(40, 60, 0),        // 40 %
        Gamma: paarung(50, 50, 0),        // 50 %
        /* „Sonstige" bekommt hier ABSICHTLICH eine gemessen aussehende
           Quote. getMatchup liefert fuer den Restposten eine Zahl
           (_junkWinRatePct), keinen Platzhalter — wer nur den
           ohneMessung-Filter prueft, bemerkt es nicht, wenn der
           _junk-Filter verschwindet. Mit 90 % faellt der EV um rund 4
           Punkte, sobald der Eimer mitgerechnet wird. */
        _junk: paarung(90, 10, 0),        // 90 %
    };
}

describe('EV gegen das erwartete Meta — gewichtet wird „Final %"', () => {

    it('nimmt die erwarteten Anteile, nicht die prognostizierten', () => {
        /* DER KERN. Alpha steht auf Prognose 10 %, der Nutzer erwartet
           aber 40 %. Beide Wege liefern eine plausible Zahl:

             mit finalShare (richtig):  (40·70 + 30·40 + 20·50) / 90 = 55,6 %
             mit onlineShare (falsch):  (10·70 + 30·40 + 20·50) / 60 = 48,3 %

           Sieben Punkte Unterschied, beide im gueltigen Bereich, keine
           davon sieht nach Fehler aus. Ohne diesen Fall bliebe die
           Verwechslung unbemerkt. */
        const ctx = umgebung(feld(), quotenNormal());
        const r = ctx._evRechne(feld());
        assert.ok(r, 'es kommt gar kein Ergebnis heraus');
        assert.ok(Math.abs(r.ev - 55.5556) < 0.01,
            'der EV ist ' + r.ev.toFixed(4) + ' — bei 48,33 wird mit der Prognose '
            + 'statt mit der Erwartung des Nutzers gewichtet');
    });

    it('die Gewichte summieren sich auf eins', () => {
        const ctx = umgebung(feld(), quotenNormal());
        const r = ctx._evRechne(feld());
        const summe = r.zeilen.reduce((s, z) => s + z.gewicht, 0);
        assert.ok(Math.abs(summe - 1) < 1e-9, 'Summe der Gewichte: ' + summe);
    });

    it('markiert die Zeilen, deren Anteil vom Nutzer kommt', () => {
        /* §17 der Bestellung: beobachtet und erwartet duerfen nicht
           unklar vermischt werden. Der Anteil ist die eine Haelfte
           davon (die Quote die andere, siehe unten). */
        const ctx = umgebung(feld(), quotenNormal());
        const r = ctx._evRechne(feld());
        const alpha = r.zeilen.find(z => z.name === 'Alpha');
        const beta  = r.zeilen.find(z => z.name === 'Beta');
        assert.equal(alpha.anteilEigen, true, 'Alpha traegt eine eigene Schaetzung');
        assert.equal(beta.anteilEigen, false, 'Beta traegt keine');
    });
});

describe('EV gegen das erwartete Meta — was NICHT mitgerechnet wird', () => {

    it('„Sonstige" bleibt draussen und faellt in die Abdeckung', () => {
        /* Der Restposten ist kein Gegner, sondern ein Eimer; seine
           Quote waere eine Modellannahme. Sie mit 10 % Gewicht in eine
           Zahl zu rechnen, die nach Messung aussieht, ist genau der
           Fehler, den die Abdeckung verhindern soll. */
        const ctx = umgebung(feld(), quotenNormal());
        const r = ctx._evRechne(feld());
        assert.ok(!r.zeilen.some(z => z.name === '_junk'),
            '„Sonstige" steht in der Rechnung');
        // 40 + 30 + 20 von 100 → 90 %
        assert.ok(Math.abs(r.abdeckung - 90) < 0.01,
            'Abdeckung ist ' + r.abdeckung.toFixed(2) + ' statt 90');
    });

    it('fuellt eine Paarung ohne Messung nicht mit 50 % auf', () => {
        /* Der Sandkasten liefert fuer unbekannte Gegner absichtlich
           `ohneMessung: true` bei pWin 0,5 — dieselbe Antwort, die
           getMatchup gibt. Wer den Platzhalter mitrechnet, bekommt eine
           Zahl, die zur Mitte gezogen ist, und nennt das Praezision. */
        const q = quotenNormal();
        delete q.Gamma;
        const ctx = umgebung(feld(), q);
        const r = ctx._evRechne(feld());
        assert.ok(!r.zeilen.some(z => z.name === 'Gamma'),
            'eine Paarung ohne Messung steht in der Rechnung');
        // Nur Alpha (40) und Beta (30): (40·70 + 30·40) / 70 = 57,14 %
        assert.ok(Math.abs(r.ev - 57.1429) < 0.01, 'EV ist ' + r.ev.toFixed(4));
        assert.ok(Math.abs(r.abdeckung - 70) < 0.01,
            'die Abdeckung meldet die Luecke nicht: ' + r.abdeckung.toFixed(2));
    });

    it('gibt null zurueck statt NaN, wenn nichts zu rechnen ist', () => {
        const ctx = umgebung(feld(), {});
        assert.equal(ctx._evRechne(feld()), null);
    });
});

describe('EV gegen das erwartete Meta — das Band', () => {

    it('traegt die Beta-Varianz jeder Paarung mit ihrem Gewicht im Quadrat', () => {
        /* Nachgerechnet gegen js/matchup-glaettung.js, nicht gegen eine
           zweite Kopie der Formel. */
        const ctx = umgebung(feld(), quotenNormal());
        const r = ctx._evRechne(feld());
        let soll = 0;
        r.zeilen.forEach(z => {
            const q = z.quote / 100;
            soll += z.gewicht * z.gewicht * G.varianz(q * z.partien, (1 - q) * z.partien);
        });
        assert.ok(Math.abs(r.sd - Math.sqrt(soll) * 100) < 1e-9,
            'SD ist ' + r.sd + ', erwartet ' + (Math.sqrt(soll) * 100));
        assert.ok(r.unten <= r.ev && r.ev <= r.oben, 'das Band schliesst den EV nicht ein');
        assert.ok(r.unten >= 0 && r.oben <= 100, 'das Band verlaesst 0..100');
    });

    it('eine duenne Paarung macht das Band breiter, nicht die Zahl lauter', () => {
        const dick = umgebung(feld(), {
            Alpha: paarung(700, 300, 0), Beta: paarung(400, 600, 0), Gamma: paarung(500, 500, 0),
        })._evRechne(feld());
        const duenn = umgebung(feld(), {
            Alpha: paarung(7, 3, 0), Beta: paarung(4, 6, 0), Gamma: paarung(5, 5, 0),
        })._evRechne(feld());
        assert.ok(duenn.sd > dick.sd * 3,
            'die duenne Rechnung hat kein merklich breiteres Band: '
            + duenn.sd.toFixed(3) + ' gegen ' + dick.sd.toFixed(3));
    });

    it('eine von Hand gesetzte Quote traegt KEINE Unsicherheit bei — und das steht da', () => {
        /* Fuer eine Behauptung gibt es keine Stichprobe. Sie mit der
           maximalen Beta-Varianz einzusetzen waere erfunden, sie
           stillschweigend wie eine Messung zu behandeln ebenso. Also:
           kein Beitrag zum Band, und das Gewicht, das dadurch ohne
           Band bleibt, wird gemeldet. */
        const q = quotenNormal();
        q.Alpha = { pWin: 0.784, pTie: 0.02, pLoss: 0.196, handEingestellt: true };
        const ctx = umgebung(feld(), q);
        const r = ctx._evRechne(feld());
        const alpha = r.zeilen.find(z => z.name === 'Alpha');
        assert.equal(alpha.hand, true);
        assert.equal(alpha.varianz, null, 'die eigene Zahl traegt eine Varianz bei');
        // Alpha haelt 40 von 90 Punkten Gewicht → 44,4 %
        assert.ok(Math.abs(r.ohneBand - 44.4444) < 0.01,
            'das Gewicht ohne Band wird als ' + r.ohneBand.toFixed(2) + ' gemeldet');
        assert.equal(r.eigene, 1, 'die Zahl der eigenen Quoten wird nicht gezaehlt');
        // Und die Partien der eigenen Zeile zaehlen nicht als gezaehlte Matches.
        assert.equal(r.partien, 100 + 100, 'gezaehlte Matches: ' + r.partien);
    });

    it('was der Nutzer eintippt, kommt unveraendert wieder heraus', () => {
        /* Befund 11.09.2026: die eingetippte Zahl landete als pWin, die
           Anzeige rechnete S/(S+N) — aus 80 wurde 81,6. In einer Zeile,
           die „deine Zahl" danebenschreibt, ist das eine fremde Zahl mit
           dem Etikett des Nutzers. getMatchup setzt die Eingabe jetzt
           als S/(S+N) ein; hier wird geprueft, dass die Kette bis zur
           gerechneten Quote nichts daran aendert. */
        const q = quotenNormal();
        const rest = 1 - 0.02;
        q.Alpha = { pWin: 0.80 * rest, pTie: 0.02, pLoss: rest - 0.80 * rest,
                    handEingestellt: true };
        const r = umgebung(feld(), q)._evRechne(feld());
        const alpha = r.zeilen.find(z => z.name === 'Alpha');
        assert.ok(Math.abs(alpha.quote - 80) < 0.01,
            'aus den eingetippten 80 wurde ' + alpha.quote.toFixed(2));
    });
});

describe('EV gegen das erwartete Meta — der Ausschnitt', () => {

    it('„die 8 groessten" nimmt die groessten ERWARTETEN Anteile', () => {
        const gross = [];
        const q = {};
        for (let i = 1; i <= 12; i++) {
            gross.push({ name: 'D' + i, onlineShare: i, finalShare: 13 - i, count: 10 });
            q['D' + i] = paarung(50 + i, 50 - i, 0);
        }
        const ctx = umgebung(gross, q, { umfang: 'top8' });
        const r = ctx._evRechne(gross);
        assert.equal(r.gegner, 8);
        /* Nach finalShare absteigend: D1 (12) … D8 (5). Nach
           onlineShare waeren es D12 … D5 — dieselbe Zahl Zeilen, ein
           anderes Feld. */
        assert.deepEqual(r.zeilen.map(z => z.name).sort(),
            ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8']);
        const summe = r.zeilen.reduce((s, z) => s + z.gewicht, 0);
        assert.ok(Math.abs(summe - 1) < 1e-9, 'die acht sind nicht untereinander normiert');
    });

    it('„nur ein Deck" laesst genau diese eine Paarung stehen', () => {
        const ctx = umgebung(feld(), quotenNormal(), { umfang: 'einzel', einzel: 'Beta' });
        const r = ctx._evRechne(feld());
        assert.equal(r.gegner, 1);
        assert.equal(r.zeilen[0].name, 'Beta');
        assert.ok(Math.abs(r.ev - 40) < 0.01,
            'der EV einer einzelnen Paarung ist nicht ihre Quote: ' + r.ev.toFixed(2));
        assert.ok(Math.abs(r.zeilen[0].gewicht - 1) < 1e-9);
    });

    it('ohne gueltige Wahl faellt „nur ein Deck" auf den groessten Gegner', () => {
        const ctx = umgebung(feld(), quotenNormal(), { umfang: 'einzel', einzel: '' });
        const r = ctx._evRechne(feld());
        assert.equal(r.zeilen[0].name, 'Alpha', 'Alpha ist mit 40 % der groesste Gegner');
    });

    it('der Ausschnitt aendert die Gewichte, nie die Quoten', () => {
        const ganz = umgebung(feld(), quotenNormal())._evRechne(feld());
        const acht = umgebung(feld(), quotenNormal(), { umfang: 'top8' })._evRechne(feld());
        ganz.zeilen.forEach(z => {
            const andere = acht.zeilen.find(x => x.name === z.name);
            if (!andere) return;
            assert.equal(andere.quote, z.quote, 'die Quote von ' + z.name + ' haengt am Ausschnitt');
        });
    });
});

describe('EV gegen das erwartete Meta — der Einbau', () => {

    it('der Block haengt im Meta Call und nicht mehr im Reiter „Aktuelles Meta"', () => {
        assert.match(SRC, /renderDeckGegenMetaPanel\(field\)/,
            'renderAll ruft den Block nicht auf');
        assert.match(SRC, /class="metacall-panel mc-ev-panel"/,
            'der Block traegt seine Kennung nicht mehr');
    });

    it('er wird bei jeder Feldaenderung neu gezeichnet', () => {
        /* Aendert sich oben eine erwartete Anteilszahl, aendert sich
           hier das Gewicht jeder Paarung. Stuende der Block nicht in
           refreshResults, zeigte er das Feld von vorhin — direkt neben
           einer Day-2-Zahl, die schon das neue kennt. */
        const i = SRC.indexOf('function refreshResults()');
        const j = SRC.indexOf('\n  function ', i + 10);
        assert.ok(i > -1 && j > i);
        assert.match(SRC.slice(i, j), /renderDeckGegenMetaPanel\(field\)/,
            'refreshResults zieht den Block nicht mit');
    });

    it('der Ausschnitt wird gemerkt, aber nicht im Turnier-Speicher', () => {
        /* Eigener Schluessel: die Turniereinstellungen werden je
           Turniertyp gefuehrt und ueber Szenarien geteilt. Der
           Ausschnitt gehoert zu keinem von beidem. */
        assert.match(SRC, /const EV_UMFANG_KEY = 'metacall_ev_umfang_v1'/);
    });

    it('die vier Schritte des Ablaufs stehen zwischen den Kacheln', () => {
        /* Der eigentliche Befund vom 11.09.2026 war kein Rechenfehler,
           sondern acht gleich aussehende Kacheln ohne Reihenfolge. */
        const i = SRC.indexOf('function renderAll()');
        const j = SRC.indexOf('function _inFrozenPastMode()', i);
        const rumpf = SRC.slice(i, j);
        for (const n of [1, 2, 3, 4]) {
            assert.ok(rumpf.includes('_mcSchritt(' + n + ','),
                'Schritt ' + n + ' fehlt in renderAll');
        }
        assert.ok(rumpf.indexOf('_mcSchritt(1,') < rumpf.indexOf('_mcSchritt(2,')
               && rumpf.indexOf('_mcSchritt(2,') < rumpf.indexOf('_mcSchritt(3,')
               && rumpf.indexOf('_mcSchritt(3,') < rumpf.indexOf('_mcSchritt(4,'),
            'die Schritte stehen nicht in ihrer Reihenfolge');
    });

    it('der gemessene Anteil steht in der Feldtabelle, nicht nur in der Detailzeile', () => {
        /* §5 und §12 der Bestellung: „AKTUELL BEOBACHTET" und
           „ERWARTET" muessen nebeneinander lesbar sein. */
        assert.match(SRC, /class="mc-share-gemessen"/,
            'der gemessene Online-Anteil steht nicht in der Zeile');
        assert.match(SRC, /_sl\.ladderShare/,
            'er wird nicht aus _shareList geholt — dann ist es wieder die Modellausgabe');
    });

    it('die gezaehlten Partien werden nach Online und Praesenz getrennt', () => {
        /* §4. Die beiden Zahlen werden NICHT addiert: auf Papier enden
           rund 11 % der Partien unentschieden, online rund 1,3 %. */
        assert.match(SRC, /labsRowsByDeck\[k\]\.partien\s*\+=/,
            'die Praesenzpartien werden nicht mehr gezaehlt');
        assert.ok(!/_pOnline\s*\+\s*_pPapier/.test(SRC),
            'die beiden Zahlen werden addiert — das waere eine dritte, nie gemessene Groesse');
    });
});
