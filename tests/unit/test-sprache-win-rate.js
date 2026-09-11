/**
 * Ein Begriff, eine Schreibweise: "Win Rate".
 *
 * Am 19.08.2026 gemeldet: "gerade in so Gaming Communities gibt's ja nun
 * mal viele englische Wörter, und die englischen Wörter, die halt benutzt
 * werden wie Meta oder Top acht Decks oder so, sollten wir halt schon
 * benutzen." Am 20.08. dann ausdruecklich: "Ja auf jeden Fall win rate."
 *
 * Vorher standen auf der Seite gleichzeitig:
 *   Siegquote     Archetyp-Karte, Heatmap-Hinweis, Bildkarte, Matchups
 *   Winrate       Meta Call, Battle Journal, Testing Groups
 *   Win Rate      die neue Meta-Performance-Tabelle
 *   Siegesrate    die Kachel auf der Einstiegsseite
 *
 * Vier Woerter fuer eine Zahl. Diese Zusagen halten fest, dass es eines
 * bleibt — und zwar in der Schreibweise mit Leerzeichen, wie sie in der
 * Szene gesprochen wird.
 *
 * NACHTRAG 08.09.2026 — DIE ZUSAGE GILT WEITER, ABER NICHT MEHR FUER
 * ALLES. Der Betreiber hat nachgeschaerft: „Win-Raten ueberall in der
 * Limitless-Bezeichnung ‚Win %‘ — keine eigenen Begriffe." „Win Rate"
 * ist damit selbst ein Hausname geworden; die Namen kommen jetzt aus
 * js/win-rate-konvention.js, und welcher es ist, entscheidet die Datei,
 * aus der die Zahl kommt (drei Konventionen, drei Namen). In den fuenf
 * Dateien des Arbeitspakets W1 — app-current-meta-analysis.js,
 * app-current-meta.js, app-archetype-card.js, app-tier-meta.js,
 * meta-analysis-hub.js — bewacht das jetzt
 * tests/unit/test-w1-hausnamen.js (kein Hausname mehr) und
 * tests/unit/test-w1-konvention-passt.js (der Name passt zur
 * gerechneten Formel). Was HIER bleibt, ist die Zusage fuer die
 * uebrigen Ansichten (ds-share.js, ds-ev-rechner.js, ds-sections.js)
 * und die Regel, dass „Siegquote"/„Siegesrate"/„Winrate" nirgends als
 * eigene Schreibweise auftauchen.
 *
 * Nicht geprueft wird der Programmtext: `winrate` als Feldname,
 * `win_rate_numeric` als CSV-Spalte und `matchup.winRate` als
 * Uebersetzungsschluessel bleiben, wie sie sind. Ein Schluessel ist kein
 * Wort, das jemand liest — und data/_consumers.md nennt die CSV-Spalten
 * ausdruecklich eine veroeffentlichte Schnittstelle.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const I18N = read('js/i18n.js');
const HTML = read('index.html');

/* Der deutsche Block der Uebersetzungen. Der englische darf "win rate"
   klein schreiben, wo er einen Satz bildet. */
const iDe = I18N.indexOf('\n  de: {');
const DE  = I18N.slice(iDe);

/* Nur die Werte, nicht die Schluessel: 'matchup.winRate' ist ein
   Schluessel und bleibt. */
const WERTE = [...DE.matchAll(/'[^']*':\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)]
    .map(m => m[1] !== undefined ? m[1] : m[2]);

const JS_ANZEIGE = [
    'js/app-archetype-card.js',
    'js/ds-share.js',
    'js/app-tier-meta.js',
    'js/ds-sections.js',
].map(p => ({ p, src: read(p) }));

describe('Win Rate — ein Begriff, eine Schreibweise', () => {
    it('"Siegquote" steht nirgends mehr ALLEIN in einer Anzeige', () => {
        /* NACHTRAG 08.09.2026 — DIESE ZUSAGE MUSSTE GESCHAERFT WERDEN,
           WEIL SIE SONST DER NEUEREN WIDERSPRAECHE.

           Am 19.08. war „Siegquote" eines von vier Woertern fuer
           dieselbe Zahl und flog deshalb raus. Seit dem 05.09. sind
           „Siegquote inkl. Unentschieden" und „Siegquote ohne
           Unentschieden" aber die AMTLICHEN Namen zweier der drei
           Konventionen in js/win-rate-konvention.js — angeordnet in
           derselben Anweisung, die „Win %" den Matchpunkten vorbehaelt.
           Ein pauschales Verbot des Wortes wuerde jetzt genau die
           Benennung verbieten, die der Betreiber verlangt hat.

           Verboten bleibt also das BLOSSE „Siegquote" ohne Zusatz — das
           war der Hausname, der nicht sagt, was im Nenner steht — sowie
           „Siegesrate" und „Siegrate", fuer die es keine Konvention
           gibt. Erlaubt sind allein die beiden vollen Namen. */
        const BLOSS = /Siegquote(?!\s+(?:inkl\.|ohne)\s+Unentschieden)|Siegesrate|Siegrate/;

        const treffer = WERTE.filter(v => BLOSS.test(v));
        assert.deepEqual(treffer, [], 'in i18n.js: ' + treffer.join(' | '));
        for (const { p, src } of JS_ANZEIGE) {
            const zeilen = src.split('\n')
                .map((z, i) => ({ nr: i + 1, z }))
                .filter(o => BLOSS.test(o.z));
            assert.deepEqual(zeilen.map(o => `${o.nr}: ${o.z.trim()}`), [],
                p + ': blosses "Siegquote" ohne Zusatz');
        }
        assert.ok(!BLOSS.test(HTML), 'blosses "Siegquote" in index.html');

        /* Gegenprobe: das Muster darf die erlaubten Namen NICHT fangen,
           sonst waere die Ausnahme nur zufaellig grün. */
        assert.ok(!BLOSS.test('Siegquote inkl. Unentschieden'));
        assert.ok(!BLOSS.test('Siegquote ohne Unentschieden'));
        assert.ok(BLOSS.test('Siegquote'), 'das Muster faengt den Hausnamen nicht mehr');
        assert.ok(BLOSS.test('Siegesrate'));
    });

    it('auch nicht als "Winrate" in einem Wort', () => {
        // 'Gesamte Win Rate — Limitless Online Turniere' enthaelt den
        // Schluesselnamen nicht; geprueft werden nur Werte.
        const treffer = WERTE.filter(v => /\bWinrate/.test(v));
        assert.deepEqual(treffer, [], 'in i18n.js: ' + treffer.join(' | '));
    });

    it('der Begriff steht als "Win Rate", nicht als "Win-Rate"', () => {
        // Bindestrich nur, wo Deutsch ihn erzwingt: in einem
        // zusammengesetzten Wort ("Day-2-Win-Rate", "Win-Rate-Statistik").
        const falsch = WERTE.filter(v => /(^|[\s(„"])Win-Rate([\s.,;:)"]|$)/.test(v));
        assert.deepEqual(falsch, [], 'freistehend mit Bindestrich: ' + falsch.join(' | '));
    });

    it('die drei Ansichten, die dieselbe Zahl zeigen, nennen sie gleich', () => {
        // Archetyp-Karte, Bildkarte und Meta-Performance-Tabelle. Genau
        // hier fiel es dem Nutzer auf: die Tabelle sagte Win Rate, die
        // Karte daneben Siegquote.
        /* 08.09.2026: die Kachel traegt keinen festen Namen mehr, sondern
           den der Konvention, die sie wirklich rechnet — S/(S+N+U) aus
           data/limitless_online_decks.csv. Geholt wird er zur Laufzeit. */
        assert.match(read('js/app-archetype-card.js'),
            /mitQuote\(L\('arc\.wrLabel', '\{quote\}'\), 'mitUnentschieden'\)/,
            'die Quoten-Kachel holt ihren Namen nicht mehr aus '
            + 'js/win-rate-konvention.js');
        /* NACHTRAG 02.09.2026 — die Regel ist jetzt schaerfer, nicht loser.

           In der Matchup-Tabelle heisst die Spalte "WR". Das ist erlaubt,
           WEIL direkt darunter eine Legende steht, die sie aufloest. Der
           Anlass war Platz: ausgeschrieben brauchten die acht Spalten
           mehr, als die Karte hat, und der Betreiber schlug es selbst vor
           ("vll sollten wir hier eine legende machen … oder Matches = M
           weil sonst sind die Zellen zu breit").

           Ein Kuerzel ohne Legende faellt damit weiterhin durch — genau
           das war der Befund zu "M 49,4 % · 52" am selben Tag. */
        const legende = /'arc\.muLegende'/.test(read('js/app-archetype-card.js'))
            || /arc\.muLegende/.test(I18N);
        assert.ok(legende,
            'die Legende unter der Matchup-Tabelle ist weg. Dann stehen dort '
            + 'nur noch Kuerzel (WR, M, Major-WR), die nichts aufloest');
        /* "Major-P" stand hier bis zum 03.09.2026 und wurde nach
           "Matchpunkte" aufgeloest. Die Spalte rechnet seit dem die
           gewoehnliche Win Rate und heisst "Major-WR"; aufzuloesen ist
           jetzt, WORAUF sie sich bezieht (Praesenzturniere) und WIE sie
           rechnet (entschiedene Partien). */
        /* „WR" loest die Legende seit dem 08.09.2026 nach {quote} auf —
           dem Platzhalter, den js/app-archetype-card.js zur Laufzeit mit
           dem Namen der Konvention fuellt. Ein fester Name stuende dort
           wieder fuer eine von dreien. */
        for (const [kuerzel, wort] of [['WR', '{quote}'], ['M', 'Matches'],
                                        ['Major-WR', 'Präsenzturnieren'],
                                        ['Major-Matches', 'Partien']]) {
            const zeilen = [...I18N.matchAll(/'arc\.muLegende':\s*'([^']*)'/g)]
                .map(m => m[1]);
            assert.ok(zeilen.length >= 1, 'arc.muLegende fehlt in i18n.js');
            const de_zeile = zeilen.find(z => /Siege/.test(z)) || zeilen[0];
            assert.ok(de_zeile.includes(kuerzel) && de_zeile.includes(wort),
                `die Legende loest "${kuerzel}" nicht mehr nach "${wort}" auf`);
        }
        /* NACHTRAG 08.09.2026 — die Bildkarte holt ihren Namen jetzt
           ebenfalls aus dem Konventionsmodul. Ein Bild hat keine
           Sprechblase: was auf der Leinwand steht, ist alles, was der
           Leser bekommt. Deshalb steht dort der ganze Name (Deck-Zahl:
           win_rate_numeric aus data/limitless_online_decks.csv =
           S/(S+N+U)) bzw. der der Matchup-Tabelle (win_rate aus
           data/limitless_online_decks_matchups.csv = S/(S+N)) und
           zusaetzlich die Formel — nicht mehr das Wort "Win Rate". */
        const SHARE = read('js/ds-share.js');
        assert.match(SHARE, /var SHARE_KONVENTION = 'mitUnentschieden';/,
            'js/ds-share.js legt seine Konvention nicht mehr fest');
        assert.match(SHARE, /quotenName\(\)/,
            'die Deck-Kachel im Bild holt ihren Namen nicht aus dem Modul');
        assert.match(SHARE, /quotenName\('ohneUnentschieden'\)/,
            'der Kopf der Matchup-Spalte im Bild holt seinen Namen nicht aus dem Modul');
        /* app-tier-meta.js zeigt dieselbe Zahl (new_winrate aus
           data/limitless_online_decks_comparison.csv, ebenfalls S/(S+N+U))
           und muss sie deshalb ebenso benennen — aus demselben Modul. */
        assert.match(read('js/app-tier-meta.js'),
            /tierQuotenName\('mitUnentschieden'\)/,
            'die Meta-Performance holt ihren Namen nicht mehr aus '
            + 'js/win-rate-konvention.js');
        /* NACHTRAG 08.09.2026 — auch der EV-Rechner. Er rechnet ueber
           quote() in js/matchup-glaettung.js, also (S + k/2)/(S + N + k):
           Unentschieden stehen NICHT im Nenner. Das ist
           `ohneUnentschieden`, nicht die Groesse, die Limitless
           "Win %" nennt. Bewacht wird das ausfuehrlich in
           tests/unit/test-w3-ev-und-abschnitt.js — hier steht nur, dass
           der Hausname weg ist und der Name aus dem Modul kommt.

           NACHTRAG 11.09.2026: js/ds-ev-rechner.js ist entfallen. Die
           Rechnung liegt im Meta Call (renderDeckGegenMetaPanel), und
           der Name kommt dort aus _evQuotenName(). */
        const MCALL = read('js/app-meta-call.js');
        assert.match(MCALL, /function _evQuotenName\(\)[\s\S]{0,400}kurz\('ohneUnentschieden'\)/,
            'der EV-Block im Meta Call holt seinen Namen nicht mehr aus dem Modul');
        assert.ok(!/_evL\('Erwartete Win Rate'/.test(MCALL),
            'der Hausname "Erwartete Win Rate" steht wieder im EV-Block');
        assert.ok(!/_evL\('Deine Win Rate'/.test(MCALL),
            'der Hausname "Deine Win Rate" steht wieder im EV-Block');
    });

    it('die Uebersetzungsschluessel bleiben unangetastet', () => {
        // Ein Schluessel ist kein Wort, das jemand liest. Wer sie
        // mitumbenennt, bricht jede Stelle, die sie aufruft.
        assert.match(I18N, /'arc\.wrLabel'/);
        assert.match(I18N, /'ma\.winRate'/);
        assert.match(I18N, /'stats\.totalWinrate'/);
        assert.match(I18N, /'matchup\.winRate'/);
    });

    it('jeder deutsche Wert hat sein englisches Gegenstueck', () => {
        for (const k of ['arc.wrLabel', 'arc.colWinRate', 'ma.winRate', 'matchup.winRate']) {
            const n = (I18N.match(new RegExp("'" + k.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.equal(n, 2, k + ' steht ' + n + '-mal, erwartet 2 (en + de)');
        }
    });
});
