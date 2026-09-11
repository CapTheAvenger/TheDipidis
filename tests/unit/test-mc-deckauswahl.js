'use strict';
/**
 * WELCHE DECKS IM FELD STEHEN — und was das Abwaehlen wirklich tut.
 *
 * BESTELLT (Betreiber, 11.09.2026, §3 und §6 mit der Metagross-EV-Seite
 * als Vorlage): die Deck-Auswahl soll visuell und einzeln waehlbar sein,
 * und „wenn die Nutzerwerte zusammen nicht 100 % ergeben, soll das
 * System klar darauf reagieren … Nicht stillschweigend falsche Werte
 * weiterrechnen."
 *
 * DREI DINGE, DIE MAN NICHT SIEHT
 * -------------------------------
 * 1. Ein abgewaehltes Deck verschwindet nicht, es wandert in den
 *    Restposten. Dessen Quote ist eine Sammelgroesse. Rechnet sie
 *    weiter gegen die alte Menge (die hinteren 91 statt der
 *    tatsaechlichen 108), steht in der Kachel eine plausible Zahl ueber
 *    einen Topf, den es so nicht gibt.
 * 2. Ueberbuchte Anteile. Wer zwei Decks auf je 60 % setzt, hatte bis
 *    heute ein Feld, das sich auf 120 % summiert — mit
 *    Begegnungserwartungen ueber eins und einer Spielerzahl ueber der
 *    Teilnehmerzahl.
 * 3. Der Unterschied zwischen „noch nichts gewaehlt" (Voreinstellung)
 *    und „ausdruecklich nichts gewaehlt" (leere Auswahl). Wer beides
 *    gleich behandelt, laedt ein gespeichertes Szenario falsch zurueck.
 *
 * Alle drei werden hier AUSGEFUEHRT geprueft, nicht gegriffen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { baue } = require('./lib-dom-sandkasten.js');

const WURZEL = path.join(__dirname, '..', '..');
const MC = 'js/app-meta-call.js';
const SRC = fs.readFileSync(path.join(WURZEL, MC), 'utf8');

/* Ein kleines Feld mit von Hand nachrechenbaren Anteilen. `onlineShare`
   traegt nach dem Praediktorlauf die PROGNOSE, `ladderShare` den
   gemessenen Anteil — die beiden liegen absichtlich auseinander. */
/* Zwoelf Decks, Summe 100. Zwoelf und nicht acht, weil die Sammelquote
   erst ab fuenf Decks im Restposten ueberhaupt gerechnet wird
   (`rest.length >= 5`) — darunter faellt sie auf die Voreinstellung
   zurueck, und der Test haette gemessen, dass zwei Rueckfallwerte gleich
   sind. */
function shareList() {
    return [
        { name: 'A', onlineShare: 25,  ladderShare: 21, onlineWinPct: 55 },
        { name: 'B', onlineShare: 20,  ladderShare: 23, onlineWinPct: 52 },
        { name: 'C', onlineShare: 15,  ladderShare: 14, onlineWinPct: 50 },
        { name: 'D', onlineShare: 10,  ladderShare: 11, onlineWinPct: 48 },
        { name: 'E', onlineShare:  8,  ladderShare:  9, onlineWinPct: 45 },
        { name: 'F', onlineShare:  6,  ladderShare:  6, onlineWinPct: 40 },
        { name: 'G', onlineShare:  5,  ladderShare:  5, onlineWinPct: 38 },
        { name: 'H', onlineShare:  4,  ladderShare:  4, onlineWinPct: 35 },
        { name: 'I', onlineShare:  3,  ladderShare:  3, onlineWinPct: 34 },
        { name: 'J', onlineShare:  2,  ladderShare:  2, onlineWinPct: 33 },
        { name: 'K', onlineShare:  1.2, ladderShare: 1, onlineWinPct: 32 },
        { name: 'L', onlineShare:  0.8, ladderShare: 1, onlineWinPct: 31 },
    ];
}

/** Die Gegenquote eines Restpostens, aus der Vorlage nachgerechnet. */
function sammelquote(namen) {
    const drin = shareList().filter(d => namen.includes(d.name));
    const gewicht = drin.reduce((s, d) => s + d.onlineShare, 0);
    const mittel = drin.reduce((s, d) => s + d.onlineShare * d.onlineWinPct, 0) / gewicht;
    return Math.min(70, Math.max(30, 100 - mittel));
}

function umgebung(opt) {
    const o = opt || {};
    const ctx = baue(MC, [
        'function _feldSortiert()',
        'function _feldTeilung(sortiert)',
        'function _feldAuswahlSchluessel()',
        'function buildField()',
        'function _junkWinRatePct()',
        'function _feldSummeHtml()',
    ], {
        window: {},
        TOP_N: o.topN === undefined ? 4 : o.topN,
        _shareList: o.shareList || shareList(),
        _personalShares: o.personalShares || {},
        _customDecks: o.customDecks || [],
        _feldAuswahl: o.feldAuswahl === undefined ? null : o.feldAuswahl,
        _feldBilanz: null,
        _junkWrCacheQuelle: null,
        _junkWrCacheWert: null,
        _junkWrCacheSchluessel: null,
        _junkDeckZahl: 0,
        _settings: {
            totalPlayers: 1000, junkPct: 0, junkWinRate: 55,
            rounds: 8, myDeck: '',
        },
        _mcIstDeutsch: () => true,
        _mcNum: (n, dp) => Number(n).toFixed(dp).replace('.', ','),
        _mcPz: () => ' %',
        esc: (s) => String(s),
    });
    return ctx;
}

/** Namen und Endanteile eines Feldes, bequem zum Vergleichen. */
function anteile(field) {
    const out = {};
    field.forEach(d => { out[d.name] = Math.round(d.finalShare * 1000) / 1000; });
    return out;
}

describe('Deck-Auswahl — die Voreinstellung bleibt, was sie war', () => {

    it('ohne Auswahl stehen die groessten TOP_N einzeln im Feld', () => {
        /* Der wichtigste Fall ueberhaupt: jeder Nutzer startet hier, und
           an diesem Zustand darf sich durch die neue Auswahl NICHTS
           geaendert haben. */
        const ctx = umgebung();
        const f = ctx.buildField();
        /* join statt deepEqual: die Felder entstehen im vm-Kontext und
           haben einen anderen Array-Prototyp, an dem die strikte
           Tiefenpruefung haengenbleibt. */
        assert.equal(f.filter(d => d.name !== '_junk').map(d => d.name).join(','), 'A,B,C,D');
        const junk = f.find(d => d.name === '_junk');
        assert.ok(junk, 'der Restposten fehlt');
        assert.ok(Math.abs(junk.finalShare - 30) < 1e-9,
            'E bis L sind 30 % — der Restposten steht auf ' + junk.finalShare);
    });

    it('null und eine leere Auswahl sind NICHT dasselbe', () => {
        /* „Noch nichts gewaehlt" gegen „ausdruecklich nichts gewaehlt".
           Wer beides gleich behandelt, laedt ein gespeichertes Szenario
           als die Voreinstellung zurueck und wundert sich. */
        const vor  = umgebung({ feldAuswahl: null }).buildField();
        const leer = umgebung({ feldAuswahl: new Set() }).buildField();
        assert.equal(vor.filter(d => d.name !== '_junk').length, 4);
        assert.equal(leer.filter(d => d.name !== '_junk').length, 0);
        assert.ok(Math.abs(leer.find(d => d.name === '_junk').finalShare - 100) < 1e-9,
            'bei leerer Auswahl muss das ganze Feld im Restposten sitzen');
    });

    it('ein abgewaehltes Deck verschwindet nicht, es faellt in den Restposten', () => {
        const ctx = umgebung({ feldAuswahl: new Set(['A', 'C']) });
        const f = ctx.buildField();
        assert.equal(f.filter(d => d.name !== '_junk').map(d => d.name).join(','), 'A,C');
        // alles ausser A (25) und C (15) = 60
        assert.ok(Math.abs(f.find(d => d.name === '_junk').finalShare - 60) < 1e-9);
        // Und die Summe bleibt 100.
        assert.ok(Math.abs(f.reduce((s, d) => s + d.finalShare, 0) - 100) < 1e-9);
    });

    it('die Reihenfolge bleibt die des prognostizierten Anteils', () => {
        /* Die Kacheln zeigen den GEMESSENEN Anteil, die Rangfolge folgt
           aber der Prognose — sonst haette die Auswahl eine andere
           Ordnung als die Tabelle darunter. B ist gemessen groesser als
           A (28 gegen 25), prognostiziert kleiner (25 gegen 30). */
        const ctx = umgebung();
        assert.equal(ctx._feldSortiert().map(d => d.name).join(','), 'A,B,C,D,E,F,G,H,I,J,K,L');
    });
});

describe('Deck-Auswahl — die Sammelquote beschreibt den Topf, der da ist', () => {

    it('rechnet gegen die WIRKLICH abgewaehlten Decks, nicht gegen slice(TOP_N)', () => {
        /* DER KERN. Zwei Auswahlen mit derselben GROESSE, aber anderem
           Inhalt muessen verschiedene Sammelquoten ergeben — sonst
           haengt die Zahl an einer Menge, die mit der Auswahl nichts zu
           tun hat.

           Restposten ist die Gegenquote: 100 − gewichtetes Mittel der
           onlineWinPct des Rests. */
        const mitA  = umgebung({ feldAuswahl: new Set(['B', 'C', 'D', 'E']) });
        const ohneA = umgebung({ feldAuswahl: new Set(['A', 'B', 'C', 'D']) });
        const q1 = mitA._junkWinRatePct();
        const q2 = ohneA._junkWinRatePct();
        assert.notEqual(q1, q2,
            'beide Auswahlen liefern dieselbe Sammelquote (' + q1 + ') — dann haengt sie '
            + 'nicht an der Auswahl, sondern weiter an den hinteren TOP_N');

        // Gegengerechnet aus der Vorlage, nicht abgeschrieben.
        const sollMitA  = sammelquote(['A', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
        const sollOhneA = sammelquote(['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']);
        assert.ok(Math.abs(q1 - sollMitA) < 1e-9,
            'Sammelquote mit A im Restposten ist ' + q1 + ', erwartet ' + sollMitA);
        assert.ok(Math.abs(q2 - sollOhneA) < 1e-9,
            'Sammelquote ohne A ist ' + q2 + ', erwartet ' + sollOhneA);
    });

    it('der Zwischenspeicher haelt die alte Zahl nicht ueber eine Umwahl hinweg fest', () => {
        /* Der Speicher haengt an der Identitaet von _shareList — die
           aendert sich bei einer Umwahl nicht. Ohne den Auswahlteil im
           Schluessel bliebe die Quote des alten Topfes stehen. */
        const ctx = umgebung({ feldAuswahl: new Set(['A', 'B', 'C', 'D']) });
        const vorher = ctx._junkWinRatePct();
        ctx._feldAuswahl = new Set(['B', 'C', 'D', 'E']);
        const nachher = ctx._junkWinRatePct();
        assert.notEqual(vorher, nachher, 'die Quote klebt am Zwischenspeicher');
    });
});

describe('Deck-Auswahl — die Summe des Feldes', () => {

    it('meldet, woraus sich die 100 % zusammensetzen', () => {
        const ctx = umgebung({ personalShares: { A: 40 } });
        ctx.buildField();
        const b = ctx._feldBilanz;
        assert.equal(b.genannt, 4);
        assert.equal(b.eigenZahl, 1);
        assert.ok(Math.abs(b.summeEigen - 40) < 1e-9);
        assert.ok(Math.abs(b.summeEigen + b.summeModell + b.summeCustom + b.junk - 100) < 1e-9,
            'die gemeldeten Teile ergeben nicht 100');
        const html = ctx._feldSummeHtml();
        assert.match(html, /Summe 100,0 %/);
        assert.match(html, /deine Schätzungen 40,0 %/);
    });

    it('ueberbuchte Anteile werden proportional auf 100 % gebracht — und gesagt', () => {
        /* §6. Zwei Decks auf je 60 % ergeben 120 %. Die Verhaeltnisse
           des Nutzers bleiben (beide gleich gross), die Einheit wird
           richtig gestellt, und beide Zahlen stehen in der Meldung. */
        const ctx = umgebung({ personalShares: { A: 60, B: 60 } });
        const f = ctx.buildField();
        const summe = f.reduce((s, d) => s + d.finalShare, 0);
        assert.ok(Math.abs(summe - 100) < 1e-6,
            'das Feld summiert sich auf ' + summe.toFixed(2) + ' statt auf 100');
        const a = anteile(f);
        assert.ok(Math.abs(a.A - 50) < 1e-6 && Math.abs(a.B - 50) < 1e-6,
            'aus 60/60 wurde ' + a.A + '/' + a.B + ' — das Verhaeltnis ist nicht erhalten');
        assert.ok(Math.abs(ctx._feldBilanz.eingetragen - 120) < 1e-9,
            'die eingetragene Summe wird nicht gemeldet');

        const html = ctx._feldSummeHtml();
        assert.match(html, /120,0 %/, 'die Meldung nennt die eingetragene Summe nicht');
        assert.match(html, /proportional/, 'die Meldung sagt nicht, was passiert ist');
        assert.match(html, /is-gekuerzt/, 'die Meldung ist nicht als Warnung ausgezeichnet');
    });

    it('die Spielerzahl bleibt bei ueberbuchten Anteilen unter der Teilnehmerzahl', () => {
        /* Die sichtbare Folge der Normierung — und der Beleg, dass sie
           nicht nur eine Beschriftung ist. Gemessen vor der Aenderung:
           1.200 Spieler bei 1.000 Teilnehmern. */
        const ctx = umgebung({ personalShares: { A: 60, B: 60 } });
        const gesamt = ctx.buildField().reduce((s, d) => s + (d.count || 0), 0);
        assert.ok(gesamt <= 1000 + 3,
            'die Tabelle zaehlt ' + gesamt + ' Spieler bei 1.000 Teilnehmern');
    });

    it('kein Anteil faellt unter null', () => {
        /* BEFUND 11.09.2026: der Boden-Block lief auch bei Schieber 0,
           weil `0 > -90,4` wahr ist — und kuerzte OHNE Untergrenze. In
           der Summenzeile stand „Prognose −20,0 %", in der Tabelle
           negative Endanteile. */
        const ctx = umgebung({ personalShares: { A: 60, B: 60 } });
        ctx.buildField().forEach(d => {
            assert.ok(d.finalShare >= -1e-9,
                d.name + ' steht auf ' + d.finalShare.toFixed(3) + ' %');
        });
        assert.ok(ctx._feldBilanz.summeModell >= -1e-9,
            'die gemeldete Prognosesumme ist negativ: ' + ctx._feldBilanz.summeModell);
    });

    it('eine einzelne Schaetzung unter dem Restposten kuerzt niemanden', () => {
        // A von 25 auf 35: die 10 Punkte kommen aus dem Restposten (30).
        const ctx = umgebung({ personalShares: { A: 35 } });
        const a = anteile(ctx.buildField());
        assert.ok(Math.abs(a.A - 35) < 1e-9);
        assert.ok(Math.abs(a.B - 20) < 1e-9, 'B wurde angefasst, obwohl nichts zu kuerzen war');
        assert.ok(Math.abs(a._junk - 20) < 1e-9, 'der Restposten steht auf ' + a._junk);
        assert.equal(ctx._feldBilanz.gekuerztUm, 0);
        assert.equal(ctx._feldBilanz.normiertVon, 0);
        assert.doesNotMatch(ctx._feldSummeHtml(), /is-gekuerzt/);
    });
});

describe('Deck-Auswahl — der Einbau', () => {

    it('steht als eigener Block vor der Feldtabelle', () => {
        const i = SRC.indexOf('function renderAll()');
        const j = SRC.indexOf('function _inFrozenPastMode()', i);
        const rumpf = SRC.slice(i, j);
        assert.ok(rumpf.includes('renderDeckAuswahlPanel()'), 'renderAll ruft die Auswahl nicht auf');
        assert.ok(rumpf.indexOf('renderDeckAuswahlPanel()') < rumpf.indexOf('renderFieldPanel(field)'),
            'die Auswahl steht hinter der Tabelle, die sie bestimmt');
    });

    it('die Kacheln zeigen den gemessenen Anteil, nicht die Prognose', () => {
        /* `onlineShare` traegt nach dem Praediktorlauf die Modellausgabe
           — genau die Verwechslung, die der Spalte „Prognose %" am
           18.08.2026 ihren Namen gekostet hat. */
        const i = SRC.indexOf('function renderDeckAuswahlPanel()');
        const j = SRC.indexOf('\n  function _feldSummeHtml()', i);
        const rumpf = SRC.slice(i, j);
        assert.match(rumpf, /ladderShare/, 'die Kachel liest den gemessenen Anteil nicht');
        assert.match(rumpf, /class="mc-feld-zahlen">\$\{esc\(L\('gemessen /,
            'die Zahl auf der Kachel ist nicht als gemessen ausgewiesen');
    });

    it('die Auswahl wird gemerkt und faehrt im Szenario mit', () => {
        assert.match(SRC, /const FELD_AUSWAHL_KEY = 'metacall_feldauswahl_v1'/);
        const i = SRC.indexOf('function _snapshotState()');
        const j = SRC.indexOf('function _applyState(state)', i);
        assert.match(SRC.slice(i, j), /feldAuswahl\s*:\s*_feldAuswahl \? \[\.\.\._feldAuswahl\] : null/,
            'das Szenario merkt sich die Auswahl nicht — oder kann null nicht von leer unterscheiden');
    });

    it('buildField und die Sammelquote fragen DIESELBE Stelle', () => {
        /* Zwei Kopien derselben Entscheidung laufen frueher oder spaeter
           auseinander, und dann beschreibt die eine Zahl einen anderen
           Topf als die andere. */
        const bf = SRC.slice(SRC.indexOf('function buildField()'),
                             SRC.indexOf('// Group field entries by main pokemon'));
        /* Ohne Kommentare: der Kopf von _junkWinRatePct erklaert, dass
           dort frueher `slice(TOP_N)` stand — die Erklaerung darf die
           Pruefung nicht ausloesen, die sie beschreibt. */
        const ohneKommentar = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '')
                                      .replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
        const jw = ohneKommentar(SRC.slice(SRC.indexOf('function _junkWinRatePct()'),
                                           SRC.indexOf('window._mcJunkWinRatePct')));
        assert.match(bf, /_feldTeilung\(/, 'buildField teilt das Feld selbst auf');
        assert.match(jw, /_feldTeilung\(/, 'die Sammelquote teilt das Feld selbst auf');
        assert.doesNotMatch(jw, /slice\(TOP_N\)/,
            'die Sammelquote rechnet wieder gegen die hinteren TOP_N');
    });
});
