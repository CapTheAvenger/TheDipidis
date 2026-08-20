/**
 * Zwei Zaehlungen, die wie ein Widerspruch aussahen — und vier Abschnitte,
 * die dieselbe Frage beantworteten.
 *
 * Gemeldet am 19.08.2026:
 *
 *   "Du hast hier Mega Excadrill 7,8 % Anteil mit 673 Antritten. Unten in der
 *    Liste steht aber ein Deckcount von 2121 und eine Winrate von 49 %.
 *    Irgendwie gehen da die Daten auseinander."
 *
 * Sie gehen nicht auseinander. Es sind zwei Groessen, die in zwei getrennten
 * Tabellen standen und sich deshalb widersprachen:
 *
 *   data/online_tournament_top8_decks.csv
 *       672,5 gewichtete TURNIER-Antritte, 31 davon Top 8
 *       Summe: 8.574
 *   data/limitless_online_decks.csv
 *       2.121 DECKLISTEN auf der Online-Ladder, 49,46 % Win Rate
 *       Summe: 26.319
 *
 * Der Anteil ist in beiden fast gleich — 7,8 gegen 7,75 %. Dasselbe Feld,
 * anders gezaehlt. 113 der 131 Decks stehen in beiden Dateien.
 *
 * Jetzt eine Tabelle mit beiden nebeneinander und je einer eigenen Spalte:
 *
 *   #  Deck            Listen  Anteil  Win Rate  Antritte  Top 8  Quote  ggue. Ø
 *   1  Mega Excadrill   2.121   7,8 %    49,5 %       673     31   4,6 %  0,8-mal
 *
 * Damit fielen zwei Abschnitte weg:
 *   "Vollstaendige Tabelle" — zeigte genau die Ladder-Spalten
 *   "Ueberblick"            — drei lila Kacheln auf Englisch; die einzige
 *                             Angabe daraus, die sonst nirgends stand
 *                             (199 Turniere, 14.026 Spieler, 31.411 Partien),
 *                             steht jetzt in der Kachel "Gemeldete Listen"
 *
 * Neun Abschnitte am Morgen, sechs am Abend. Gemessen bei 1440 px, alle
 * Abschnitte offen: 138 Zeilen in der Rangliste, davon 25 sichtbar.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripJs = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const stripCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

const TIER = stripJs(read('js/app-tier-meta.js'));
const CARDS = stripJs(read('js/app-meta-cards.js'));
const SEC = stripJs(read('js/ds-sections.js'));
const SORT = stripJs(read('js/rangliste-sortieren.js'));
const CSS = stripCss(read('css/styles.css'));
const HEAT = stripJs(read('js/app-current-meta.js'));

describe('Meta-Performance — beide Zaehlungen in einer Tabelle', () => {
    it('Listen und Antritte haben getrennte Spalten', () => {
        // Genau die gemeldete Verwechslung: 2.121 und 673 sind beide richtig
        // und meinen Verschiedenes.
        for (const k of ['listen', 'anteil', 'wr', 'antritte', 'cuts', 'quote', 'faktor']) {
            assert.match(TIER, new RegExp("k: '" + k + "'"), 'Spalte fehlt: ' + k);
        }
        assert.match(TIER, /de: 'Listen'/);
        assert.match(TIER, /de: 'Antritte'/);
        assert.match(TIER, /de: 'Win Rate'/);
    });

    it('jede der beiden Spalten sagt, woher sie kommt', () => {
        assert.match(TIER, /Decklisten auf der Online-Ladder/);
        assert.match(TIER, /gewichtete Turnier-Antritte/);
    });

    it('die Tabelle nimmt Decks aus BEIDEN Quellen', () => {
        assert.match(TIER, /const alleNamen = new Set\(\[/);
        assert.match(TIER, /ladderVon/);
        assert.match(TIER, /turnierVon/);
    });

    it('und schreibt einen Strich, wo eine Quelle nichts hat', () => {
        // 7 Decks stehen nur in der Turnierdatei, 18 nur auf der Ladder. Eine
        // erfundene Null waere schlimmer als ein Strich.
        assert.match(TIER, /r\.listen\s+== null \? '–'/);
        assert.match(TIER, /r\.antritte == null \? '–'/);
    });

    it('duenn heisst: zu wenige TURNIER-Antritte', () => {
        // Die Ladder-Spalten sind davon unberuehrt, die stehen auf 2.121.
        assert.match(TIER, /duenn: !\(antritte >= CONV_THIN_N\)/);
    });
});

describe('Meta-Performance — was dafuer wegfiel', () => {
    it('die vier Scraper-Bloecke werden nicht mehr eingesetzt', () => {
        assert.match(CARDS, /Rank Climbers\|Rank Fallers\|Full Comparison Table/);
        assert.match(CARDS, /querySelectorAll\('div\.stats-grid'\)\.forEach\(g => g\.remove\(\)\)/);
    });

    it('und es gibt sie nicht mehr als Abschnitte', () => {
        assert.ok(!/id: 'overview'/.test(SEC));
        assert.ok(!/id: 'full'/.test(SEC));
        const ids = [...SEC.matchAll(/id: '([a-z]+)'/g)].map(m => m[1]);
        assert.deepEqual(ids, ['top', 'heatmap', 'cards', 'ev', 'tiers', 'rang', 'movers'],
            'Abschnitte: ' + ids.join(', '));
    });

    it('die eine Angabe aus dem Ueberblick ist oben angekommen', () => {
        assert.match(TIER, /limitless_meta_stats\.json/);
        assert.match(TIER, /metaStats\.turniere/);
        assert.match(TIER, /metaStats\.spieler/);
        assert.match(TIER, /metaStats\.partien/);
    });

    it('der Rest der Liste steht hinter einem Knopf', () => {
        // "Vollstaendige Tabelle" hiess so, weil sie JEDEN Archetyp zeigte.
        // Das bleibt moeglich, kostet aber nicht 138 Zeilen als Grundzustand.
        assert.match(TIER, /const SICHTBAR = 25;/);
        assert.match(TIER, /cm-rang-mehr-btn/);
        assert.match(SORT, /function mehrOderWeniger/);
    });

    it('nach dem Sortieren sind wieder die ERSTEN 25 sichtbar', () => {
        // Sonst sortiert man nach Win Rate und sieht trotzdem die
        // meistgespielten Decks.
        assert.match(SORT, /Sichtbarkeit haengt an der POSITION|allesOffen/);
        assert.match(SORT, /tr\.classList\.toggle\('cm-rang-mehr', n >= grenze\)/);
    });
});

describe('Verstaendliche Beschriftung', () => {
    it('"n=" steht nicht mehr in der Heatmap', () => {
        assert.ok(!/>n=\$\{/.test(HEAT), '"n=" ist zurueck');
        assert.match(HEAT, /heatmap\.gamesShort/);
    });

    it('die Heatmap-Zahl wird ueber formatPercent geschrieben', () => {
        // "52.5%" mit Punkt stand mitten in einer deutschen Seite.
        assert.ok(!/\$\{winRate\.toFixed\(1\)\}%/.test(HEAT));
        assert.match(HEAT, /window\.formatPercent\(winRate\)/);
    });

    it('die Szene-Begriffe stehen da, wo die Szene sie benutzt', () => {
        assert.match(TIER, /'Top 8 Archetypes'/);
        assert.match(TIER, /'Meta-Performance'/);
        assert.match(SEC, /'Meta-Performance'/);
        assert.ok(!/Wer wird gespielt, wer kommt durch/.test(TIER));
    });

    it('das Vielfache wird erklaert, nicht nur hingeschrieben', () => {
        assert.match(TIER, /1,6-mal heißt: erreicht die Top 8 anderthalbmal so oft/);
    });
});

describe('Platz auf dem Schreibtisch', () => {
    it('die Tier-Karten stehen nebeneinander, nicht untereinander', () => {
        const m = CSS.match(/\.arc-inline-list \{([^}]*)\}/);
        assert.ok(m, '.arc-inline-list fehlt');
        assert.match(m[1], /display:\s*grid/);
        assert.match(m[1], /repeat\(auto-fill, minmax\(400px, 1fr\)\)/);
    });

    it('auf dem Telefon aber wieder einspaltig', () => {
        assert.match(CSS, /@media \(max-width: 860px\)[\s\S]{0,120}\.arc-inline-list \{ grid-template-columns: 1fr; \}/);
    });
});

describe('Auf- und Absteiger — nie gruen gegen rot', () => {
    // Die Hausregel steht seit Phase 0 in css/tokens.css: divergierende
    // Skalen sind blau/rot, weil gruen/rot der haeufigste Fall von
    // Farbfehlsichtigkeit ist. Die Delta-Spalte der Auf- und Absteiger
    // war bis zum 20.08.2026 die letzte Stelle, die sie nicht befolgte.
    const CSS = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');

    it('die Delta-Spalte faerbt die Zelle, nicht den Text', () => {
        assert.match(TIER, /ds-tint-pos/);
        assert.match(TIER, /ds-tint-neg/);
        assert.doesNotMatch(TIER, /tier-mover-up|tier-mover-down/);
    });

    it('und das alte Gruen ist weg', () => {
        // Ohne Kommentare: die Begruendung im Kommentar NENNT das alte
        // Gruen, und das soll sie auch.
        const ohne = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
        const block = ohne.slice(ohne.indexOf('.tier-mover-delta'),
                                 ohne.indexOf('.tier-mover-delta') + 300);
        assert.doesNotMatch(block, /#16a34a/i);
        assert.match(block, /color: var\(--ink\)/);
    });

    it('das Vorzeichen steht neben der Zahl, die Farbe traegt nie allein', () => {
        assert.match(TIER, /formatPercentSigned/);
    });
});
