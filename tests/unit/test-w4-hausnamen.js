/**
 * W4 — DIE LETZTEN HAUSNAMEN AUS DIESEM ARBEITSPAKET.
 *
 * ANORDNUNG DES BETREIBERS (05.09.2026, wiederholt am 08.09.2026):
 * „Win-Raten ueberall in der Limitless-Bezeichnung ‚Win %‘ — keine
 * eigenen Begriffe."
 *
 * SIE IST KEIN PAUSCHALES UMBENENNEN. js/win-rate-konvention.js haelt
 * den Namen „Win %" der Konvention MATCHPUNKTE (3S+U)/(3·Partien) vor —
 * so nennt Limitless genau diese Spalte. Eine Zahl, die S/(S+N+U) oder
 * S/(S+N) rechnet, „Win %" zu nennen, waere derselbe Fehler in die
 * andere Richtung. OB der angezeigte Name zur gerechneten Konvention
 * passt, prueft tests/unit/test-w4-quoten-namen.js an den echten
 * Dateien und an den Aufrufstellen.
 *
 * HIER geht es nur um das eine: dass in der Oberflaeche dieser Dateien
 * ueberhaupt kein selbst erfundener Name mehr steht.
 *
 * WAS NICHT GEPRUEFT WIRD, UND WARUM
 *
 *   PROGRAMMTEXT. `winRate`, `majorWinRate`, `WinRateKonvention`,
 *   `win_rate_numeric`, `_wrClass` — Bezeichner sind keine Woerter, die
 *   jemand liest. Sie werden von `ohneBezeichner()` entfernt, BEVOR
 *   gesucht wird. Die BARE Form („Win Rate", „WR" allein) bleibt dabei
 *   ausdruecklich stehen — sonst ist der Suchlauf wertlos. Genau daran
 *   ist der erste Anlauf dieses Musters gescheitert (siehe die Notiz in
 *   tests/unit/test-w3-ev-und-abschnitt.js); die Probe weiter unten
 *   haelt das fest.
 *
 *   KOMMENTARE. Ein Kommentar erklaert, was frueher dastand und warum es
 *   weg ist — diese Dateien leben davon. Block- und Zeilenkommentare
 *   werden vor der Suche entfernt.
 *
 * DIE POSITIVLISTE. Jede Zeile braucht eine Begruendung, und eine TOTE
 * Zeile (deren Text es nicht mehr gibt) laesst diesen Test ebenfalls
 * fallen. Sonst waechst eine Liste heran, die niemand mehr raeumt.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

/** Die Dateien dieses Arbeitspakets. */
const DATEIEN = [
    'js/app-anti-tech.js',
    'js/app-meta-cards.js',
    'js/app-quellen.js',
    'js/battle-journal.js',
];

/**
 * Verbotene Hausnamen. „Win %" steht bewusst NICHT darin: es ist der
 * Name, den Limitless den Matchpunkten gibt, und damit erlaubt — aber
 * nur fuer sie. Dass ihn hier keine S/(S+N+U)- oder S/(S+N)-Zahl
 * traegt, ist Sache von test-w4-quoten-namen.js.
 */
const VERBOTEN = [
    { muster: /win[\s‐-―-]rate/i, was: '„Win Rate" / „win rate" / „Win-Rate"' },
    { muster: /\bWinrate\b/i,     was: '„Winrate" in einem Wort' },
    { muster: /Siegesrate/i,      was: '„Siegesrate"' },
    { muster: /Siegrate/i,        was: '„Siegrate"' },
    { muster: /Gewinnrate/i,      was: '„Gewinnrate"' },
    { muster: /\bWR\b/,           was: 'das nackte Kuerzel „WR"' },
];

/**
 * Begruendete Ausnahmen. `text` muss als Teilzeichenkette in einer
 * beanstandeten Zeile stehen.
 */
const POSITIVLISTE = [
    {
        datei: 'js/app-meta-cards.js',
        text: "ths[1].textContent = 'WR';",
        grund: 'Zulaessige KURZFORM: die Zeile darunter haengt title und '
             + 'data-quote-konvention an dieselbe Zelle, mit vollem Namen UND '
             + 'Formel aus js/win-rate-konvention.js. Ohne diesen Hinweis '
             + 'waere "WR" ein Hausname — dass er wirklich drankommt, prueft '
             + 'test-w4-quoten-namen.js an der Aufrufstelle.',
    },
    {
        datei: 'js/app-meta-cards.js',
        text: "h.includes('win rate')",
        grund: 'SUCHMUSTER gegen die gelieferten Kopftexte der Vergleichs'
             + 'tabelle. Es ordnet der Spalte nur ihre CSS-Klasse zu und '
             + 'schreibt nichts in die Oberflaeche.',
    },
    {
        datei: 'js/app-meta-cards.js',
        text: "strong.textContent.includes('Win Rate')",
        grund: 'SUCHMUSTER, keine Beschriftung. Der Absatz, den diese Kachel '
             + 'befuellt, kommt aus data/limitless_online_decks_comparison.html '
             + '(Zeile 143: "Top 3 by Win Rate (>=10% of #1 games)") — einer '
             + 'Datei ausserhalb dieses Arbeitspakets. Wird der Vergleich '
             + 'umgeschrieben, findet die Kachel ihren eigenen Absatz nicht '
             + 'mehr und bleibt leer. GESCHRIEBEN wird daneben der Name der '
             + 'Konvention; das prueft test-w4-quoten-namen.js.',
    },
];

/** Block- und Zeilenkommentare weg, Zeilennummern erhalten. */
function ohneKommentare(quelltext) {
    const ohneBlock = quelltext.replace(/\/\*[\s\S]*?\*\//g,
        (m) => m.replace(/[^\n]/g, ' '));
    return ohneBlock.split('\n')
        .map((z) => (/^\s*\/\//.test(z) ? '' : z))
        .join('\n');
}

/**
 * Bezeichner raus, bare Form drin.
 *
 * Ein BEZEICHNER ist ein zusammenhaengender Wortlauf, der den Begriff
 * enthaelt und LAENGER ist als er selbst: `WinRateKonvention`,
 * `majorWinRate`, `win_rate_numeric`, `_wrClass`, `wrByOpp`. Das ist
 * Programmtext und steht auf keinem Bildschirm.
 *
 * Genau die bare Form bleibt stehen — „Win Rate" mit Trennzeichen und
 * „WR" allein —, denn das ist die Beschriftung, um die es geht. Ein
 * Filter, der auch sie schluckt, macht den Test wertlos.
 */
function ohneBezeichner(quelle) {
    return quelle.replace(/[A-Za-z0-9_$]+/g, function (wort) {
        if (!/(WinRate|Winrate|winRate|winrate|win_rate|Wr|wr|WR)/.test(wort)) return wort;
        const bar = /^(WR|Wr|wr)$/.test(wort);
        return bar ? wort : ' ';
    });
}

function befunde(datei) {
    const zeilen = ohneBezeichner(ohneKommentare(lies(datei))).split('\n');
    const raus = [];
    zeilen.forEach((zeile, i) => {
        for (const v of VERBOTEN) {
            if (v.muster.test(zeile)) {
                raus.push({ datei, nr: i + 1, zeile: zeile.trim(), was: v.was });
                break;
            }
        }
    });
    return raus;
}

describe('W4 — kein Hausname mehr fuer eine Quote', () => {

    it('der Filter laesst die BARE Form stehen (sonst besteht der Test leer)', () => {
        /* DIE TEUERSTE ART, GRUEN ZU SEIN. Faengt `ohneBezeichner` auch
           „Win Rate" und „WR" selbst weg, findet der Suchlauf nie wieder
           etwas — und niemand merkt es. Zweimal passiert. */
        assert.match(ohneBezeichner('title="Your current Win Rate here"'), /Win Rate/);
        assert.match(ohneBezeichner('<span>WR</span>'), /\bWR\b/);
        assert.match(ohneBezeichner('Siegrate des Decks'), /Siegrate/);
        // …und er raeumt Programmtext wirklich weg.
        for (const bezeichner of ['window.WinRateKonvention', 'const winRate = 0',
                                  'r.win_rate_numeric', '_wrClass(wr)',
                                  'const majorWinRate = 1', 'wrByOpp.get(x)']) {
            const rest = ohneBezeichner(bezeichner);
            assert.ok(!VERBOTEN.some(v => v.muster.test(rest)),
                'Bezeichner faelschlich beanstandet: ' + bezeichner + ' → ' + rest);
        }
    });

    it('das Suchmuster faengt einen Hausnamen ueberhaupt', () => {
        assert.ok(VERBOTEN.some(v => v.muster.test('Gesamte Win Rate — Limitless')));
        assert.ok(VERBOTEN.some(v => v.muster.test('deine Siegrate')));
        assert.ok(VERBOTEN.some(v => v.muster.test('<span>WR</span>')));
        // „Win %" ist KEIN Hausname — es ist der Name der Quelle.
        assert.ok(!VERBOTEN.some(v => v.muster.test('Win % (kumuliert)')),
            '„Win %" wird beanstandet — dann ist der Name der Matchpunkte verboten');
    });

    it('keine Datei zeigt einen Hausnamen ausserhalb der Positivliste', () => {
        const offen = [];
        for (const datei of DATEIEN) {
            for (const b of befunde(datei)) {
                const erlaubt = POSITIVLISTE.some(
                    p => p.datei === datei && b.zeile.includes(p.text));
                if (!erlaubt) offen.push(`${b.datei}:${b.nr} ${b.was} → ${b.zeile}`);
            }
        }
        assert.deepEqual(offen, [],
            'Hausname in der Oberflaeche:\n  ' + offen.join('\n  '));
    });

    it('jede Zeile der Positivliste ist begruendet und lebt noch', () => {
        for (const p of POSITIVLISTE) {
            assert.ok(p.grund && p.grund.length >= 40,
                'ohne Begruendung: ' + p.datei + ' / ' + p.text);
            const passend = befunde(p.datei).filter(b => b.zeile.includes(p.text));
            assert.ok(passend.length >= 1,
                'tote Positivlisten-Zeile (nichts beanstandet diesen Text mehr): '
                + p.datei + ' / ' + p.text);
        }
    });

    it('die geaenderte Zeile im Meta Call traegt keinen Hausnamen mehr', () => {
        /* Nur DIESE eine Zeile gehoert zu diesem Paket — der Rest von
           js/app-meta-call.js ist anderswo geprueft. Sie ist der
           console.log des Predictors 6.2 und zeigt _lastMetaAvgWinRate,
           gebildet aus _labsDeckWr(r, '') = S/(S+N+U). */
        const mc = lies('js/app-meta-call.js');
        const zeile = mc.split('\n').find(z => z.includes('_lastMetaAvgWinRate.toFixed(2)'));
        assert.ok(zeile, 'die Predictor-6.2-Zeile gibt es nicht mehr');
        assert.ok(!/win[\s-]rate/i.test(ohneBezeichner(zeile)),
            'die Predictor-6.2-Zeile traegt wieder einen Hausnamen: ' + zeile.trim());
        assert.match(zeile, /WinRateKonvention\.kurz\('mitUnentschieden'\)/,
            'der Name wird nicht mehr zur Laufzeit aus dem Modul geholt');
        assert.match(zeile, /W \/ \(W \+ L \+ T\)/,
            'ohne das Modul faellt die Zeile nicht mehr auf die Formel zurueck');
    });

    it('die Uebersetzungswerte dieses Pakets tragen keinen Hausnamen', () => {
        /* Nur die Schluessel dieses Pakets. js/i18n.js enthaelt weitere
           Hausnamen (mc.*), die an ihrer Anzeigestelle in
           js/app-meta-call.js zur Laufzeit ersetzt werden — sie sind
           dort Eingabe eines Suchmusters (_WR_HAUSNAME) und gehoeren
           einem anderen Paket. */
        const SCHLUESSEL = ['bj.histWinRate', 'ma.winRate',
                            'antiTech.wrTooltip', 'antiTech.legendWr',
                            'heatmap.majorOhneBilanz'];
        const I18N = lies('js/i18n.js');
        const offen = [];
        for (const k of SCHLUESSEL) {
            const treffer = [...I18N.matchAll(new RegExp(
                "'" + k.replace(/\./g, '\\.') + "':\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g'))];
            assert.equal(treffer.length, 2,
                k + ' steht ' + treffer.length + '-mal in js/i18n.js, erwartet 2 (en + de)');
            for (const m of treffer) {
                // Die Kurzform „WR" darf im Wert stehen: sie traegt an der
                // Anzeigestelle einen title mit vollem Namen UND Formel.
                const wert = m[1].replace(/\bWR(-Pille| pill)?\b/g, ' ');
                for (const v of VERBOTEN) {
                    if (v.muster.test(wert)) offen.push(k + ': ' + m[1] + '  (' + v.was + ')');
                }
            }
        }
        assert.deepEqual(offen, [],
            'Hausname in einem Uebersetzungswert dieses Pakets:\n  ' + offen.join('\n  '));
    });
});
