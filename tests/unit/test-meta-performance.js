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
        assert.match(TIER, /de: 'Win Rate'/);
        /* "Antritte" heisst seit dem 01.09.2026 "Turnier-Antritte".
           Gemeldet: "was sind denn bitte 618,5 Antritte? Was ist das
           fuer eine Kennzahl?" Der Fehler war nicht die halbe Zahl,
           sondern dass die Ueberschrift nicht sagte, dass hier eine
           ANDERE Grundgesamtheit gezaehlt wird als in der Spalte
           "Listen" daneben. Jetzt steht die Herkunft in der
           Ueberschrift. */
        /* NACHTRAG 02.09.2026 — dieselbe Frage kam wieder:
           "wie kann es hier ,5 Antritte geben? entweder man hat
           teilgenommen oder nicht aber halb teilnehmen geht nicht."

           Beim ersten Mal wurde die UEBERSCHRIFT umbenannt. Die Zahl
           blieb halb, also kam die Frage zurueck — zu Recht. Diesmal
           traegt die Spalte die gezaehlten Starts; die Gewichtung
           bleibt dort, wo sie hingehoert, in der Quote. */
        assert.match(TIER, /'Turnier-Antritte'/,
            'die Herkunft ist wieder aus der Ueberschrift verschwunden');
        assert.match(TIER, /t\.broughtAnzeige/,
            'die Spalte zeigt wieder die gewichtete Summe statt der '
            + 'gezaehlten Starts — die halbe Antrittszahl ist zurueck');
    });

    it('jede der beiden Spalten sagt, woher sie kommt', () => {
        assert.match(TIER, /Decklisten auf der Online-Ladder/);
        // Der Hinweis behauptete bis zum 02.09.2026, nach TURNIERGROESSE
        // zu gewichten. Gewichtet wird nach Aktualitaet — siehe
        // backend/scrapers/online_tournament_scraper.py:361.
        assert.ok(!/nach Turniergröße gewichtet/.test(TIER),
            'die falsche Begruendung ist zurueck');
        // Die Gewichtung erklaert sich jetzt dort, wo sie noch wirkt: an
        // der QUOTE. Auf der Antritte-Spalte hat sie nichts mehr zu suchen.
        assert.match(TIER, /Nach Aktualität gewichtet: Turniere der letzten sieben Tage zählen voll/,
            'die Quote sagt nicht mehr, dass und wie sie gewichtet ist');
        // Und die Top-8-Spalte sagt, worauf sie sich bezieht — sie hiess
        // "davon Top 8" und wurde als "davon von den Listen links"
        // gelesen: "Heisst es jetzt, dass nur 21 Listen von 2715 Listen
        // Top 8 gekommen sind? Aber das kann ja nicht sein."
        assert.match(TIER, /bezogen auf die Turnier-Antritte links, nicht auf die Listen/);
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
        /* NACHTRAG 02.09.2026 — das Feld heisst jetzt antritteGew.
           Die Schwelle stand bis dahin auf derselben Variablen wie die
           ANZEIGE. Als die Anzeige auf null ging (weil eine halbe Zahl
           keine Antrittszahl ist), galt `null >= 50` fuer jedes Deck als
           unerfuellt — 137 von 137 Zeilen wurden blass gezeichnet.
           Gemessen nach der Trennung: 106 von 137. Was die Zeile blass
           macht, ist weiter die TURNIER-Zaehlung, nur eben die
           gewichtete, die immer da ist. */
        assert.match(TIER, /duenn: !\(antritteGew >= CONV_THIN_N\)/);
        assert.ok(!/duenn: !\(antritte >= CONV_THIN_N\)/.test(TIER),
            'die Schwelle haengt wieder am Anzeigewert — dann ist jede '
            + 'Zeile blass, sobald die gezaehlte Zahl fehlt');
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
        // 'movers' fiel am 01.09.2026 weg — siehe docs/geparkte-features.md.
        assert.deepEqual(ids, ['top', 'heatmap', 'cards', 'ev', 'tiers', 'rang'],
            'Abschnitte: ' + ids.join(', '));
    });

    it('die eine Angabe aus dem Ueberblick ist nicht verloren gegangen', () => {
        // Sie stand ab dem 20.08.2026 in der Kachel "Gemeldete Listen"
        // und seit dem 01.09.2026 unter Quellen & Methodik — gerechnet
        // wird sie unveraendert hier.
        assert.match(TIER, /limitless_meta_stats\.json/);
        assert.match(TIER, /metaStats\.turniere/);
        assert.match(TIER, /metaStats\.spieler/);
        assert.match(TIER, /metaStats\.partien/);
        assert.match(TIER, /window\.DsDatenumfang\.setzen/);
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
        // 'Top 8 Archetypes' stand in der Kachelreihe, die es seit dem
        // 01.09.2026 nicht mehr gibt. Der Begriff ist mit der Zahl nach
        // Quellen & Methodik gezogen — gemeldet war er ausdruecklich:
        // "man wuerde hier von Top 8 Archetypes sprechen … die
        // englischen Woerter, die in der Community benutzt werden,
        // sollten wir schon benutzen."
        assert.match(read('js/ds-datenumfang.js'), /Top 8 Archetypes/);
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

describe('Auf- und Absteiger — entfernt, nicht vergessen', () => {
    /* Hier standen drei Pruefungen an der Delta-Spalte: getoente Zelle
       statt farbigem Text, kein Gruen mehr, Vorzeichen neben der Zahl.
       Der ganze Block ist am 01.09.2026 gegangen. Gemeldet: "ganz unten
       auf der Seite haben wir noch den Auf- und Absteiger. Ich glaube,
       das ist mittlerweile auch eine Sache, die wir wegnehmen koennen."

       Was bleibt, ist die Hausregel, aus der die drei Pruefungen kamen:
       divergierende Skalen sind blau/rot, nie gruen/rot. Sie gilt
       weiter fuer den Balken in der Rangliste — er ist die letzte
       divergierende Darstellung dieser Ansicht. */

    it('der Block wird nicht mehr erzeugt', () => {
        assert.ok(!/tier-movers-row/.test(TIER), 'die Movers sind zurueck');
        assert.ok(!/Performance Improvers/.test(TIER));
        assert.ok(!/tier-mover-delta/.test(TIER));
    });

    it('und die Regel, wegen der es ihn gab, gilt weiter', () => {
        // Der divergierende Balken der Rangliste ist die letzte Stelle,
        // an der eine Skala eine Richtung hat.
        assert.match(TIER, /ds-bar-track is-diverging/);
        const TOK = read('css/tokens.css');
        const hex = /--dv-pos:\s*#([0-9a-fA-F]{6})/.exec(TOK);
        assert.ok(hex, '--dv-pos ist keine Hex-Farbe');
        const [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16));
        assert.ok(b > g && b > r, `--dv-pos #${hex[1]} ist wieder gruen (r${r} g${g} b${b})`);
    });

    it('der Eintrag in den geparkten Features steht', () => {
        const parken = read('docs/geparkte-features.md');
        assert.match(parken, /Auf- und Absteiger/);
        assert.match(parken, /Was anders sein müsste/);
    });
});
