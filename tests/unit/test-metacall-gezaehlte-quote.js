/**
 * Drei Ansichten, eine Quote.
 *
 * BEFUND (02.09.2026, live im Dunkelmodus gesehen): in der Intel-Kachel
 * des Meta Calls stand fuer Dragapult "Top-8-Quote (Online-Turniere)
 * 10,5 %". Im Eingangsblock der Startseite und in der
 * Meta-Performance-Tabelle stand seit PR #625 fuer dasselbe Deck
 * 10,2 %.
 *
 * Es ist derselbe Fehler wie am Vortag, nur eine Ansicht weiter: die
 * Kachel las top8_conv_rate aus der CSV — eine nach AKTUALITAET
 * gewichtete Groesse (Turniere bis 7 Tage zaehlen 1,0, aeltere 0,5) —,
 * waehrend die beiden anderen Ansichten top8_count / total_brought aus
 * gezaehlten Antritten rechnen. Der Betreiber hatte genau diesen Fall
 * am 02.09.2026 schon einmal gemeldet: "zwei Ansichten, dieselbe Zahl,
 * zwei Regeln".
 *
 * Was diese Datei festhaelt:
 *
 *   1. Die Kachel rechnet aus denselben zwei gezaehlten Spalten wie
 *      die beiden anderen Ansichten.
 *   2. Der Vergleichsschnitt daneben ("1,2x ueber dem Schnitt") kommt
 *      aus DERSELBEN Sorte Zahl wie der Hauptwert darueber.
 *   3. Das Tor ist ein Alles-oder-nichts-Tor je ZEILE, nicht in der
 *      Summe — halb gezaehlt und halb gewichtet waere schlimmer als
 *      beides einzeln.
 *   4. Der PROGNOSEMOTOR bleibt auf der gewichteten Groesse. Er ist
 *      darauf abgestimmt (convFactor, die Deckel bei 0,5 und 2,0), und
 *      eine Anzeige geradezuziehen ist kein Grund, eine Vorhersage zu
 *      verschieben. Diese Zusicherung schuetzt vor dem naheliegenden
 *      naechsten Schritt, der eine stille Motoraenderung waere.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const MC = fs.readFileSync(path.join(ROOT, 'js', 'app-meta-call.js'), 'utf8');

const ohneKommentar = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function schneideFunktion(quelle, name) {
    let start = quelle.indexOf('function ' + name + '(');
    assert.notEqual(start, -1, `${name} ist nicht mehr auffindbar`);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    assert.fail(`${name} hat keine schliessende Klammer`);
}

/* Die echte Funktion, mit gesetztem Schalter ausgefuehrt. */
function quoteMit(gezaehlt) {
    const quelle = [
        'let _gezaehlteQuote = ' + JSON.stringify(gezaehlt) + ';',
        schneideFunktion(MC, '_quoteFuerAnzeige'),
        'return _quoteFuerAnzeige;',
    ].join('\n');
    return new Function(quelle)();
}

describe('die Kachel rechnet aus gezaehlten Antritten', () => {
    it('nimmt top8_count / total_brought, wenn die Spalten taugen', () => {
        const q = quoteMit(true);
        assert.equal(q({ broughtRoh: 1000, top8Roh: 102, top8Conv: 0.105 }), 0.102);
        assert.equal(q({ broughtRoh: 50, top8Roh: 5, top8Conv: 0.2 }), 0.1);
    });

    it('faellt auf die gewichtete Spalte zurueck, wenn das Tor zu ist', () => {
        const q = quoteMit(false);
        assert.equal(q({ broughtRoh: 1000, top8Roh: 102, top8Conv: 0.105 }), 0.105);
    });

    it('faellt auch je Deck zurueck, wenn dessen Antritte fehlen', () => {
        const q = quoteMit(true);
        assert.equal(q({ broughtRoh: 0, top8Roh: 0, top8Conv: 0.077 }), 0.077);
        assert.equal(q(null), 0);
    });

    it('teilt nie durch null', () => {
        const q = quoteMit(true);
        [null, undefined, 0, -1].forEach(b => {
            const wert = q({ broughtRoh: b, top8Roh: 5, top8Conv: 0.04 });
            assert.ok(Number.isFinite(wert), `broughtRoh=${b} ergibt ${wert}`);
        });
    });
});

describe('die Kachel und ihr Vergleichswert kommen aus derselben Quelle', () => {
    const badge = schneideFunktion(MC, '_renderDeckBadge');
    const nackt = ohneKommentar(badge);

    it('der Hauptwert ist die Anzeigequote, nicht die gewichtete Spalte', () => {
        assert.match(nackt, /const\s+top8Conv\s*=\s*_quoteFuerAnzeige\(stats\)/,
            'die Kachel liest wieder direkt stats.top8Conv');
        assert.doesNotMatch(nackt, /const\s+top8Conv\s*=\s*stats\s*\?\s*stats\.top8Conv/);
    });

    it('der Feldschnitt daneben rechnet mit derselben Groesse', () => {
        const zeile = nackt.slice(nackt.indexOf('meanConv'), nackt.indexOf('convFactor'));
        assert.match(zeile, /_quoteFuerAnzeige\(s\)/,
            'meanConv mittelt eine andere Groesse als der Hauptwert darueber');
        assert.doesNotMatch(zeile, /s\.top8Conv/);
    });
});

describe('das Tor ist ein Alles-oder-nichts-Tor je Zeile', () => {
    /* Es steht seit dem 02.09.2026 in app-utils.js — eine Regel fuer
       alle vier Ansichten. Dass sie dort auch WIRKT, prueft
       test-vier-ansichten-eine-quote.js am Ergebnis; hier steht ihre
       Form. */
    const UTILS = fs.readFileSync(path.join(ROOT, 'js', 'app-utils.js'), 'utf8');
    const nackt = ohneKommentar(UTILS);
    const tor = nackt.slice(nackt.indexOf('function gezaehlteZeilen'),
                            nackt.indexOf('function computeConversionPerformance'));

    it('prueft jede Zeile, nicht die Summe', () => {
        assert.match(tor, /rows\.length\s*>\s*0\s*&&\s*rows\.every\(brauchbar\)/,
            'aus every() ist some() oder eine Summenpruefung geworden');
    });

    it('verlangt ganze Zahlen, Antritte ueber null und Cuts nicht ueber den Antritten', () => {
        assert.match(tor, /ganzeZahl\(r\.total_brought\)/);
        assert.match(tor, /ganzeZahl\(r\.top8_count\)/);
        assert.match(tor, /num\(r\.total_brought\)\s*>\s*0/);
        assert.match(tor, /num\(r\.top8_count\)\s*<=\s*num\(r\.total_brought\)/);
    });

    it('die Ganzzahlpruefung laesst keine Kommazahl durch', () => {
        const g = new Function('return ' + tor.match(/const ganzeZahl = \([\s\S]*?;/)[0]
            .replace(/^const ganzeZahl =\s*/, '').replace(/;$/, ''))();
        assert.equal(g('640'), true);
        assert.equal(g('640,5'), false);
        assert.equal(g('640.5'), false);
        assert.equal(g(''), false);
        assert.equal(g(null), false);
        assert.equal(g('-3'), false);
    });

    it('legt die gezaehlten Spalten auf die Namen, die der Kern liest', () => {
        assert.match(tor, /total_brought_weighted:\s*r\.total_brought/);
        assert.match(tor, /top8_count_weighted:\s*r\.top8_count/);
    });
});

describe('auch der Rueckfall rechnet, statt abzulesen', () => {
    /* top8_conv_rate ist auf vier Stellen gerundet und weicht bei 53
       der 121 Zeilen von der Division ab. Winzig — aber es waere
       wieder eine zweite Regel fuer dieselbe Zahl. */
    it('bei zugefallenem Tor kommt die Quote aus den gewichteten Zaehlungen', () => {
        const q = quoteMit(false);
        assert.equal(q({ broughtGew: 679, top8Count: 71, top8Conv: 0.1046 }), 71 / 679);
    });

    it('die fertige Spalte ist nur noch die letzte Reserve', () => {
        const q = quoteMit(false);
        assert.equal(q({ broughtGew: 0, top8Count: 0, top8Conv: 0.1046 }), 0.1046);
    });
});

describe('der Prognosemotor bleibt auf der gewichteten Groesse', () => {
    const nackt = ohneKommentar(MC);

    it('die Familienschleife rechnet weiter mit stats.top8Conv', () => {
        assert.match(nackt, /const\s+top8Conv\s*=\s*stats\s*\?\s*stats\.top8Conv\s*:\s*0;/,
            'der Motor liest jetzt die Anzeigequote — das verschiebt Vorhersagen');
    });

    it('die Anzeigequote taucht in keiner Zeile auf, die predictedShare setzt', () => {
        nackt.split('\n').forEach((z, i) => {
            if (z.includes('_quoteFuerAnzeige')) {
                assert.doesNotMatch(z, /predictedShare|predictedShareRaw|labs_t8_boost/,
                    `Zeile ${i + 1} mischt Anzeige und Motor: ${z.trim()}`);
            }
        });
    });
});
