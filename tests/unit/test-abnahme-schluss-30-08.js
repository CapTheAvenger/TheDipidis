'use strict';
/*
 * Vier Zahlen, die sich selbst widersprachen — und eine Adresszeile,
 * die stillstand.
 *
 * BEFUND F2/F3 — der Zurueck-Knopf verliess die Seite.
 *
 * Gemessen ueber sechs Ansichtswechsel: `history.length` konstant 2,
 * `location.hash` konstant leer. Die Tieflinks (#meta-call, #cards …)
 * funktionierten beim Aufruf, wurden aber nie GESCHRIEBEN. Wer eine
 * Ansicht teilen wollte, teilte die Startseite; wer zurueck wollte,
 * landete auf der vorherigen Website.
 *
 * BEFUND B3 — "20,0 %" mit dem Abzeichen "unter 20 %" daneben.
 *
 * Die Anzeige rundet auf eine Nachkommastelle, die Einordnung rechnete
 * mit dem rohen Wert. Beides fuer sich richtig, zusammen ein sichtbarer
 * Widerspruch, den kein Leser aufloesen kann.
 *
 * BEFUND B4 — "72 von 708 Antritten kamen in die Top 8, das sind 10,1 %".
 *
 * 72/708 sind 10,17 %, gerundet 10,2. Die 10,1 stammte aus der
 * CSV-Spalte top8_conv_rate (ungewichtet), waehrend "72 von 708" die
 * gewichteten Zahlen sind. Zwei Rechenwege in einem Satz.
 *
 * BEFUND — "14,83", "14,2", "12,0" und "14,00" auf einem Bildschirm.
 *
 * Dieselbe Groesse (Ø-Platzierung) in zwei Genauigkeiten, je nachdem
 * wie die Vergleichsdaten ihre Nachkommastellen mitbrachten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ── Ø-Platzierung: eine Genauigkeit ─────────────────────────────── */
describe('Ø-Platzierung steht ueberall mit zwei Nachkommastellen', () => {
    const CL = lies('js/app-city-league.js');

    const bau = () => {
        const teile = ['_komma', '_kommaText', '_rang'].map(n => {
            const m = CL.match(new RegExp('function ' + n + '\\(wert\\) \\{[\\s\\S]*?\\n        \\}|function ' + n + '\\(zahl, stellen\\) \\{[\\s\\S]*?\\n        \\}'));
            assert.ok(m, n + '() nicht mehr im Quelltext gefunden');
            return m[0];
        });
        return new Function('getLang', teile.join('\n') + '\nreturn { _komma, _kommaText, _rang };')(() => 'de');
    };

    it('rundet Zeichenketten aus den Vergleichsdaten auf zwei Stellen', () => {
        const { _rang } = bau();
        assert.equal(_rang('14.2'), '14,20');
        assert.equal(_rang('12.0'), '12,00');
        assert.equal(_rang('14.83'), '14,83');
        assert.equal(_rang('3'), '3,00');
    });

    it('laesst durch, was keine Zahl ist', () => {
        const { _rang } = bau();
        assert.equal(_rang('-'), '-');
        assert.equal(_rang(''), '');
        assert.equal(_rang(null), '');
    });

    it('kein Rangfeld liest mehr roh aus _kommaText', () => {
        assert.ok(!/_kommaText\(d\.new_avg_placement\)/.test(ohneKomm(CL)),
            'ein Rangfeld formatiert wieder ohne feste Genauigkeit');
    });
});

/* ── Erfundene Veraenderungen ohne Vorzeitraum ───────────────────── */
describe('Ohne Vorzeitraum steht keine Veraenderung in Klammern', () => {
    const CL = ohneKomm(lies('js/app-city-league.js'));

    it('jede der vier Tabellen kennt _ohneBasis', () => {
        // Der Fehler, der diesen Test noetig macht: die Konstante war in
        // EINER der vier forEach-Schleifen definiert und in allen vier
        // benutzt — ReferenceError, und die ganze Ansicht fiel in den
        // catch-Zweig ("Keine City-League-Daten").
        const bloecke = CL.split('data.forEach(d => {').slice(1);
        const mitKlammer = bloecke.filter(b => b.includes('_ohneBasis ?'));
        assert.equal(mitKlammer.length, 4, 'es sind nicht mehr genau vier Tabellenschleifen');
        for (const b of mitKlammer) {
            const kopf = b.slice(0, b.indexOf('tableHTML +='));
            assert.ok(/const _ohneBasis = /.test(kopf),
                'eine Tabellenschleife benutzt _ohneBasis, ohne es selbst zu definieren '
                + '— genau der ReferenceError, der die ganze Ansicht in den catch-Zweig warf');
        }
    });

    it('keine Klammer wird ohne die Bedingung gebaut', () => {
        // Nur die beiden Vergleichstabellen; die Auf-/Absteigerlisten
        // daruber werden ohne Vorzeitraum komplett unterdrueckt.
        const offen = CL.match(/\$\{d\.new_count\} <span class="city-league-info-table-count-change-(mobile|desktop)/g) || [];
        assert.equal(offen.length, 0, 'eine Anzahl-Klammer haengt wieder ungeprueft im Markup');
    });
});

/* ── Day-2-Schwelle: Anzeige und Einordnung auf derselben Zahl ───── */
describe('Day-2-Schwelle greift auf der angezeigten Zahl', () => {
    const MC = lies('js/app-meta-call.js');

    const bau = () => {
        const a = MC.match(/const _day2Angezeigt = \(p\) => [^\n]+/);
        const b = MC.match(/const _ueberDay2Schwelle = \(e\) => [^\n]+/);
        assert.ok(a && b, 'die beiden Helfer stehen nicht mehr im Quelltext');
        return new Function('DAY2_THRESHOLD',
            a[0] + '\n' + b[0] + '\nreturn { _day2Angezeigt, _ueberDay2Schwelle };')(0.20);
    };

    it('0,19951 wird als 20,0 angezeigt und gilt damit als ueber der Schwelle', () => {
        const { _day2Angezeigt, _ueberDay2Schwelle } = bau();
        assert.equal(_day2Angezeigt(0.19951), 20);
        assert.equal((0.19951 * 100).toFixed(1), '20.0');   // was der Nutzer liest
        assert.equal(_ueberDay2Schwelle({ day2Prob: 0.19951 }), true);
    });

    it('19,9 bleibt darunter', () => {
        const { _day2Angezeigt, _ueberDay2Schwelle } = bau();
        assert.equal(_day2Angezeigt(0.1994), 19.9);
        assert.equal(_ueberDay2Schwelle({ day2Prob: 0.1994 }), false);
    });

    it('genau 0,20 zaehlt', () => {
        const { _ueberDay2Schwelle } = bau();
        assert.equal(_ueberDay2Schwelle({ day2Prob: 0.20 }), true);
    });

    it('nirgends wird mehr roh gegen DAY2_THRESHOLD verglichen', () => {
        const roh = ohneKomm(MC).match(/day2Prob >= DAY2_THRESHOLD/g) || [];
        assert.equal(roh.length, 0, 'die Einordnung rechnet wieder mit dem ungerundeten Wert');
    });
});

/* ── Hub-Satz: die Quote kommt aus den Zahlen daneben ────────────── */

/* Das ECHTE Tor aus app-utils.js, nicht eine Attrappe. Es entscheidet,
   ob die Anzeige die gezaehlten oder die gewichteten Spalten nimmt —
   mit einer Attrappe liefe der Test genau am Verzweigungspunkt vorbei.
   Dieselbe Technik wie bei parseLocaleNumber daneben. */
function echtesTor(pLN) {
    const stueck = lies('js/app-utils.js').match(/function gezaehlteZeilen\(rows\) \{[\s\S]*?\n\}/)[0];
    return new Function('parseLocaleNumber', stueck + '\nreturn gezaehlteZeilen;')(pLN);
}

describe('Der Hub-Satz ist nachrechenbar', () => {
    const HUB = lies('js/meta-analysis-hub.js');
    // app-utils.js laesst sich nicht require-n (es greift beim Laden auf
    // window und localStorage zu). Die eine Funktion wird deshalb aus dem
    // Quelltext herausgeloest — dieselbe Technik wie in
    // tests/unit/test-design-depth.js.
    const parseLocaleNumber = new Function(
        lies('js/app-utils.js').match(/function parseLocaleNumber\(input, fallback = 0\) \{[\s\S]*?\n\}/)[0] +
        '\nreturn parseLocaleNumber;')();

    const modell = (rows, conv) => new Function('window',
        HUB.match(/function answerModel\(rows\) \{[\s\S]*?\n    \}/)[0] +
        '\nreturn answerModel;')({ parseLocaleNumber, gezaehlteZeilen: echtesTor(parseLocaleNumber), computeConversionPerformance: () => conv })(rows);

    it('72 von 708 ergeben 10,2 % — nicht 10,1 %', () => {
        const conv = {
            expected: 0.065,
            decks: [{ name: 'A', perfPct: 40, brought: 708, top8: 72, thin: false }],
        };
        const rows = [
            // top8_conv_rate traegt bewusst die ABWEICHENDE, ungewichtete
            // Quote — genau die Zahl, die frueher im Satz stand.
            { deck_name: 'A', total_brought_weighted: '708', top8_conv_rate: '0.101' },
            { deck_name: 'B', total_brought_weighted: '400', top8_conv_rate: '0.05' },
        ];
        const out = modell(rows, conv);
        assert.equal(out.headline.name, 'A');
        assert.equal(out.headlineConvPct.toFixed(1), '10.2');
        // Kachel und Satz muessen dieselbe Zahl tragen.
        assert.equal(out.top[0].convPct.toFixed(1), '10.2');
    });

    it('halbe gewichtete Antritte werden nicht zu ganzen gerundet', () => {
        // In der Datei steht "708.0;71.5". Gedruckt stand "72 von 708",
        // daneben 10,1 % — und 72/708 sind 10,2. Die Prozentangabe war
        // richtig, die Zaehlung daneben nicht.
        const zahl = new Function('loc',
            HUB.match(/const zahl = \(v\) => \{[\s\S]*?\n        \};/)[0] + '\nreturn zahl;')('de-DE');
        assert.equal(zahl(71.5), '71,5');
        assert.equal(zahl(708), '708');
        assert.equal(zahl(708.0), '708');
        assert.equal(zahl(1234), '1.234');
    });

    it('ohne Ueberschriften-Deck bleibt die Quote 0 statt undefiniert', () => {
        const conv = { expected: 0.065, decks: [{ name: 'A', perfPct: 40, brought: 20, top8: 2, thin: true }] };
        const rows = [{ deck_name: 'A', total_brought_weighted: '20', top8_conv_rate: '0.10' }];
        const out = modell(rows, conv);
        assert.equal(out.headline, null);
        assert.equal(out.headlineConvPct, 0);
    });
});

/* ── Adresszeile und Verlauf ─────────────────────────────────────── */
describe('Jeder Ansichtswechsel steht in der Adresszeile', () => {
    const INIT = lies('js/inline-init.js');
    const nackt = ohneKomm(INIT);

    it('switchTabAndUpdateMenu schreibt den Hash', () => {
        assert.ok(/window\.__dsSchreibeTabHash\(tabId\)/.test(nackt),
            'der Ansichtswechsel schreibt die Adresszeile nicht mehr');
    });

    it('geschrieben wird mit pushState, nicht ueber location.hash', () => {
        // location.hash = … loeste hashchange aus und damit applyHash,
        // das seinerseits switchTabAndUpdateMenu ruft: eine Schleife.
        assert.ok(/history\.pushState\(\{ tab: h \}/.test(nackt));
        assert.ok(!/location\.hash\s*=(?!=)/.test(nackt), 'wieder ueber location.hash geschrieben');
    });

    it('nur kanonische Kennungen werden geschrieben', () => {
        const f = new Function('HASH_ALIASES',
            nackt.match(/function kanonischerHash\(tabId\) \{[\s\S]*?\n    \}/)[0] +
            '\nreturn kanonischerHash;')({
                'meta-call': 'meta-call',
                'hub': 'meta-analysis-hub',
                'meta-analysis-hub': 'meta-analysis-hub',
            });
        assert.equal(f('meta-call'), 'meta-call');
        assert.equal(f('meta-analysis-hub'), 'meta-analysis-hub');
        // 'hub' zeigt auf eine ANDERE Kennung — es ist eine Kurzform und
        // darf nicht als zweite URL derselben Ansicht entstehen.
        assert.equal(f('hub'), null);
        assert.equal(f('gibtsnicht'), null);
        assert.equal(f(''), null);
    });

    it('zurueck und vorwaerts aendern die Ansicht mit', () => {
        assert.ok(/addEventListener\('popstate'/.test(nackt),
            'ohne popstate steht nach einem Zurueck die alte URL ueber der neuen Ansicht');
    });

    it('applyHash schreibt waehrend des Routens nicht zurueck', () => {
        assert.ok(/if \(routetGerade\) return;/.test(nackt));
        assert.ok(/routetGerade = true;[\s\S]{0,120}finally \{ routetGerade = false; \}/.test(nackt));
    });

    it('der erste Ladevorgang ruft den Lader der Startansicht weiter auf', () => {
        // Seit die Anwendung den Hash selbst stempelt, ist "es gibt einen
        // Hash" kein Beleg mehr fuer einen Tieflink. Vorher haette der
        // Stempel den Lader der Startansicht abgewuergt: leere Kacheln.
        assert.ok(/if \(window\.__dsTieflinkGeroutet\) return;/.test(nackt));
        const fn = nackt.match(/function triggerInitialTabLoad\(\) \{[\s\S]*?\n    \}/)[0];
        assert.ok(!/window\.location\.hash/.test(fn),
            'die alte Pruefung ist zurueck — die Startansicht laedt dann nie');
    });
});

/* ── Matchup-Kasten: Sprache und Dunkelmodus ─────────────────────── */
describe('Der Matchup-Kasten spricht Deutsch und ueberlebt den Dunkelmodus', () => {
    const CMA = ohneKomm(lies('js/app-current-meta-analysis.js'));
    const I18N = lies('js/i18n.js');

    it('keine festen englischen Beschriftungen mehr', () => {
        for (const wort of ['>Win Rate:<', '>Record:<', '>Total Games:<']) {
            assert.ok(!CMA.includes(wort), 'feste Beschriftung wieder da: ' + wort);
        }
    });

    it('keine Festfarben im Kasten', () => {
        const block = CMA.match(/detailsEl\.innerHTML = `[\s\S]*?`;/);
        assert.ok(block, 'der Kasten wurde umgebaut — Test anpassen');
        assert.ok(!/#2c3e50|#333\b/.test(block[0]), 'wieder eine Festfarbe im Kasten');
    });

    it('die neuen Schluessel gibt es in beiden Sprachen', () => {
        for (const k of ['matchup.totalGames', 'matchup.vsTitle']) {
            const n = (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.equal(n, 2, k + ' fehlt in einer der beiden Sprachen');
        }
    });
});
