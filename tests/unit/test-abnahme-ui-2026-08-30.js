'use strict';
/*
 * Was die Abnahme vom 30.08.2026 im Bereich UI gefunden hat.
 *
 * BEFUND 1 — FESTE FARBEN, DIE DEN MODUS NICHT MITMACHEN.
 *
 * Drei Stellen trugen einen Farbwert direkt im Stylesheet statt eines
 * Tokens. Ein fester Wert ist in genau einem der beiden Modi richtig:
 *
 *   .past-meta-stat-card / .current-meta-stat-card
 *      Verlauf #f8faff -> #eef2ff, also fast weiss. Blieb im
 *      DUNKELmodus weiss, waehrend die Beschriftung darauf (--ink-3)
 *      mit dem Modus auf hellgrau kippte. Gemessen: #b9c1e0 auf
 *      #f4f7ff = 1,67:1 ("GESAMTE WIN RATE", "Matchup gegen Top 20"),
 *      1,70:1 im Vergangenen Meta. Noetig sind 4,5:1.
 *
 *   .meta-card-skeleton-title
 *      color: #f4f7fb, also fast weiss — im HELLmodus unsichtbar.
 *      Gemessen stand "Situativ" als leere Zeile da.
 *
 *   .deck-visual h3
 *      color: #333. Diese Regel (0,1,1) gewinnt gegen
 *      .meta-card-skeleton-title (0,1,0) und hat die Reparatur dort
 *      ausgehebelt: im Dunkeln 1,51:1 fuer "Kernkarten" und
 *      "Optionen", waehrend "Situativ" daneben (ein <summary><span>,
 *      von dieser Regel nicht erfasst) hell blieb. Eine Ueberschrift,
 *      drei Zeilen, zwei verschiedene Farben.
 *
 * BEFUND 2 — TIPPZIELE, DIE KEIN ELEMENT-SELEKTOR FASST.
 *
 * Die zentrale Regel in css/tippziele.css fasst button, select, input
 * und [role=button]. Die wichtigsten verbliebenen Ziele sind keines
 * davon — es sind div und a mit Klick-Behandlung:
 *
 *   .searchable-select-display  38 px — die DECK-AUSWAHL aller drei
 *                               Analysen, das wichtigste Bedienelement
 *   .archetype-jump-link        19 px, 25x auf city-league
 *   .city-league-info-table-*   31,5-33,5 px, 19x
 *   .heatmap-td                 40 px, 36x
 *   .tier-search-clear          27,4 x 24 px
 *   .card-database-price-btn    20 px, 8x, ohne ::after-Flaeche
 *   .card-database-rarity-btn   20 px, 8x, ebenso
 *
 * Zwei Fallen dabei, beide gemessen und beide hier festgehalten:
 *   (a) `min-height` hat auf `display: table-cell` KEINE Wirkung.
 *       .heatmap-td blieb bei 40 px, obwohl 44 px berechnet wurden.
 *   (b) Gleiches Gewicht entscheidet die Ladereihenfolge. Die eigene
 *       Regel trug `!important` und verlor trotzdem, weil
 *       mobile-responsive.css spaeter laedt und dieselbe Spezifitaet
 *       hat. Deshalb steht jetzt `html` davor.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '');

const CITY  = ohneKomm(lies('css/city-league.css'));
const STYL  = ohneKomm(lies('css/styles.css'));
const TIPP  = ohneKomm(lies('css/tippziele.css'));

/** Der Block einer Regel, Kommentare bereits entfernt. */
function block(css, selektor) {
    const i = css.indexOf(selektor);
    assert.notEqual(i, -1, `Regel ${selektor} ist verschwunden`);
    const auf = css.indexOf('{', i);
    const zu = css.indexOf('}', auf);
    assert.ok(auf > -1 && zu > auf, `Regel ${selektor} ist nicht lesbar`);
    return css.slice(auf, zu);
}

describe('Keine feste Farbe, wo der Modus kippen muss', () => {
    it('die Statistikkacheln nehmen Tokens', () => {
        for (const sel of ['.past-meta-stat-card', '.current-meta-stat-card']) {
            const b = block(CITY, sel);
            assert.ok(!/#f8faff|#eef2ff/.test(b),
                `${sel} traegt wieder den festen hellen Verlauf. Im ` +
                `Dunkelmodus bleibt die Kachel dann weiss, waehrend die ` +
                `Beschriftung darauf mitkippt — gemessen 1,67:1.`);
            assert.match(b, /var\(--surface-1\)[\s\S]*var\(--surface-2\)/,
                `${sel} nimmt keine Flaechen-Tokens mehr`);
        }
    });

    it('die Abschnittsueberschrift nimmt --ink', () => {
        assert.match(block(STYL, '.meta-card-skeleton-title'), /color:\s*var\(--ink\)/,
            'die Ueberschrift traegt wieder eine feste Farbe — in einem der ' +
            'beiden Modi ist sie damit unlesbar');
    });

    it('und die Regel, die sie ueberstimmt, auch', () => {
        // Das war der eigentliche Fehler: die Reparatur an
        // .meta-card-skeleton-title allein blieb wirkungslos, weil
        // .deck-visual h3 (0,1,1) gewinnt.
        assert.match(block(STYL, '.deck-visual h3'), /color:\s*var\(--ink\)/,
            '.deck-visual h3 setzt wieder eine feste Farbe und hebelt die ' +
            'Reparatur an .meta-card-skeleton-title aus');
    });

    it('kein fast-weisser Festwert mehr in diesen Regeln', () => {
        // Gegenprobe gegen die Bauart, nicht gegen die drei Namen:
        // jeder Hexwert ueber #e0e0e0 ist im Hellmodus unsichtbar und
        // im Dunkelmodus als Flaeche falsch.
        const verdaechtig = [];
        for (const [name, css] of [['city-league.css', CITY], ['styles.css', STYL]]) {
            for (const m of css.matchAll(/\.(meta-card-skeleton-title|deck-visual h3|(?:past|current)-meta-stat-(?:card|label))[^{]*\{([^}]*)\}/g)) {
                for (const f of (m[2].match(/#[0-9a-fA-F]{6}/g) || [])) {
                    const hell = parseInt(f.slice(1, 3), 16) > 0xe0
                              && parseInt(f.slice(3, 5), 16) > 0xe0
                              && parseInt(f.slice(5, 7), 16) > 0xe0;
                    if (hell) verdaechtig.push(`${name}: ${m[1]} ${f}`);
                }
            }
        }
        assert.deepEqual(verdaechtig, [], `fast-weisse Festwerte: ${verdaechtig}`);
    });
});

describe('Auch die Ziele, die kein Element-Selektor fasst', () => {
    const NAMEN = [
        'searchable-select-display',   // die Deck-Auswahl
        'archetype-jump-link',
        'city-league-info-table-cell',
        'heatmap-td',
        'tier-search-clear',
        'card-database-price-btn',
        'card-database-rarity-btn',
    ];

    it('jede der sieben Klassen steht in der Regel', () => {
        // WORTGRENZE. `.heatmap-td-weg` enthaelt `.heatmap-td` als
        // Teilzeichenkette — eine Umbenennung kam damit glatt durch.
        const fehlen = NAMEN.filter(n =>
            !new RegExp('\\.' + n + '(?![\\w-])').test(TIPP));
        assert.deepEqual(fehlen, [],
            `diese Ziele fallen wieder durch: ${fehlen}. Es sind div- und ` +
            `a-Elemente mit Klick-Behandlung — kein Element-Selektor fasst sie.`);
    });

    it('Tabellenzellen bekommen height, nicht min-height', () => {
        // min-height hat auf display: table-cell laut Spezifikation
        // keine Wirkung. .heatmap-td blieb deshalb bei 40 px, obwohl
        // 44 px berechnet wurden.
        const i = TIPP.indexOf('.heatmap-td');
        assert.notEqual(i, -1);
        const b = TIPP.slice(TIPP.indexOf('{', i), TIPP.indexOf('}', i));
        assert.match(b, /(?:^|[;{\s])height:\s*44px/,
            'die Zellen bekommen wieder nur min-height — das wirkt auf ' +
            'table-cell nicht, die Zelle bleibt bei 40 px');
    });

    it('die eigenen Regeln gewinnen unabhaengig von der Ladereihenfolge', () => {
        // Gleiches Gewicht entscheidet die Reihenfolge, und
        // mobile-responsive.css laedt spaeter. Ohne das fuehrende `html`
        // blieb die Deck-Auswahl trotz !important bei 38 px.
        for (const n of ['searchable-select-display', 'heatmap-td', 'tier-search-clear']) {
            assert.ok(TIPP.includes('html .' + n),
                `.${n} steht ohne \`html\` davor — dann entscheidet die ` +
                `Ladereihenfolge, und mobile-responsive.css gewinnt`);
        }
    });

    it('die Knoepfe auf dem Kartenbild bekommen eine zentrierte Flaeche', () => {
        // Erste Fassung: `width: 100%` — dadurch nicht zentriert,
        // sondern um die halbe Knopfbreite nach rechts geschoben
        // (gemessen 42 px Versatz). Die Flaeche lag neben dem Knopf.
        const treffer = [...TIPP.matchAll(/::after\s*\{([^}]*)\}/g)].map(m => m[1]);
        assert.ok(treffer.length >= 2, `nur ${treffer.length} Trefferflaechen`);
        const schief = treffer.filter(b => /width:\s*100%/.test(b));
        assert.deepEqual(schief, [],
            'eine Trefferflaeche nimmt wieder width: 100% — dann verschiebt ' +
            'translate(-50%) sie neben den Knopf statt um ihn herum');
        for (const b of treffer) {
            assert.match(b, /transform:\s*translate\(-50%,\s*-50%\)/,
                'eine Trefferflaeche wird nicht zentriert');
        }
    });

    it('nichts davon gilt auf der Maus', () => {
        // 44 px wuerden dichte Werkzeugleisten am Schreibtisch
        // unnoetig aufblasen. Jede dieser Regeln steht in einer
        // pointer-coarse-Abfrage.
        const bloecke = TIPP.split('@media (pointer: coarse)');
        assert.ok(bloecke.length >= 3, `nur ${bloecke.length - 1} coarse-Bloecke`);
        // Ausserhalb jeder Abfrage darf keine Mindesthoehe stehen.
        const vorDerErsten = bloecke[0];
        assert.ok(!/min-height|height:\s*44px/.test(vorDerErsten),
            'eine Groessenregel steht ausserhalb der pointer-coarse-Abfrage');
    });
});
