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
    'js/ds-ev-rechner.js',
    'js/ds-sections.js',
].map(p => ({ p, src: read(p) }));

describe('Win Rate — ein Begriff, eine Schreibweise', () => {
    it('"Siegquote" steht nirgends mehr in einer Anzeige', () => {
        const treffer = WERTE.filter(v => /Siegquote|Siegesrate|Siegrate/.test(v));
        assert.deepEqual(treffer, [], 'in i18n.js: ' + treffer.join(' | '));
        for (const { p, src } of JS_ANZEIGE) {
            assert.doesNotMatch(src, /Siegquote|Siegesrate/, p);
        }
        assert.doesNotMatch(HTML, /Siegquote|Siegesrate/);
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
        assert.match(read('js/app-archetype-card.js'), /L\('arc\.wrLabel', 'Win Rate'\)/);
        assert.match(read('js/app-archetype-card.js'), /L\('arc\.colWinRate', 'Win Rate'\)/);
        assert.match(read('js/ds-share.js'), /'Win Rate'/);
        assert.match(read('js/app-tier-meta.js'), /Win Rate/);
        assert.match(read('js/ds-ev-rechner.js'), /Erwartete Win Rate/);
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
