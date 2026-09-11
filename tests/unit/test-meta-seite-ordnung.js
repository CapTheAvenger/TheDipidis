'use strict';
/**
 * DIE REIHENFOLGE DER META-SEITE — und der Weg von einem Deck zum
 * Meta Call.
 *
 * BESTELLT (Betreiber, 11.09.2026 abends, mit drei Bildschirmfotos):
 *
 *   „Matchup Heatmap einfach als Überschrift und nicht noch mit ner
 *    weiteren Unterüberschrift arbeiten. Überschrift und dann sofort
 *    starten mit der Heatmap. Erklärung und Decks für x oder y Achse
 *    auswählen gerne unter die Heatmap setzen und vll sogar einklappen
 *    damit das durchscrollen der Daten smoother wird."
 *
 *   „Most played cards als letzten Punkt auf die Seite setzen, weil das
 *    ist ja mehr eine Side Info zum Meta als wirklich relevant."
 *
 *   „Der your Deck vs the Meta Bereich ergibt auf der aktuellen Meta
 *    Seite so ja gar kein Sinn mehr —> sinnvoller wäre in der Tier List
 *    je Deck einen Button … und dann springt man zum Meta Call zu dem
 *    Feature und das Deck ist dann schon ausgewählt."
 *
 * Alle vier Punkte sind Anordnungsfragen, und Anordnung ist die Sorte
 * Zusage, die beim naechsten Umbau lautlos verschwindet: es faellt
 * nichts aus, es steht nur wieder woanders. Deshalb stehen sie hier.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { baue } = require('./lib-dom-sandkasten.js');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

const SEKTION = lies('js/ds-sections.js');
const HEATMAP = lies('js/app-current-meta.js');
const KARTE   = lies('js/app-archetype-card.js');
const MC      = 'js/app-meta-call.js';
const MCALL   = lies(MC);
const INDEX   = lies('index.html');
const SW      = lies('service-worker.js');

/** Die Abschnitts-Kennungen in der Reihenfolge, in der sie stehen. */
function abschnitte() {
    const a = SEKTION.indexOf('var SECTIONS = [');
    const b = SEKTION.indexOf('\n    ];', a);
    assert.ok(a > -1 && b > a, 'SECTIONS nicht gefunden');
    return [...SEKTION.slice(a, b).matchAll(/id:\s*'([^']+)'/g)].map(m => m[1]);
}

describe('Meta-Seite: die Reihenfolge der Abschnitte', () => {

    it('„Meistgespielte Karten" steht ganz unten', () => {
        /* Sie stand an dritter Stelle, zwischen Heatmap und Tier-Liste —
           also mitten in dem, was man beim Vorbereiten hintereinander
           liest. Der Betreiber nennt sie „mehr eine Side Info". */
        const ids = abschnitte();
        assert.equal(ids[ids.length - 1], 'cards',
            'Reihenfolge: ' + ids.join(' → '));
    });

    it('die Eingangsantwort und die Matchups bleiben oben', () => {
        const ids = abschnitte();
        assert.equal(ids[0], 'top');
        assert.equal(ids[1], 'heatmap');
    });

    it('der leere Verweis-Abschnitt ist weg', () => {
        /* „Dein Deck gegen das Meta" trug nach dem Umzug der Rechnung
           nur noch einen Verweis. Ein Abschnitt ohne Inhalt, an dem kein
           Deck hing — ersetzt durch den Knopf an jeder Deck-Karte. */
        assert.ok(!abschnitte().includes('ev'),
            'der Abschnitt „ev" steht wieder in der Liste');
        assert.ok(!SEKTION.includes("nimm: ['div.ds-ev-block']"),
            'die Abschnittsliste sammelt weiter den alten Block ein');
    });

    it('js/ds-ev-rechner.js ist nirgends mehr eingebunden', () => {
        /* Eine Datei, die es nicht mehr gibt, im Offline-Vorrat zu
           listen, laesst die Installation des Service Workers scheitern
           — und zwar still: die Seite laeuft weiter, nur ohne
           Offline-Vorrat. */
        assert.ok(!fs.existsSync(path.join(WURZEL, 'js', 'ds-ev-rechner.js')),
            'die Datei ist wieder da');
        assert.ok(!INDEX.includes('ds-ev-rechner'), 'index.html laedt sie noch');
        assert.ok(!SW.includes('ds-ev-rechner'), 'der Offline-Vorrat listet sie noch');
    });
});

describe('Heatmap: Überschrift, dann sofort Daten', () => {

    /* Der Rumpf der Hauptfassung — der Zweig mit der Tabelle. */
    const block = (() => {
        const a = HEATMAP.indexOf('<div id="matchupHeatmapContainer" class="heatmap-container">');
        const b = HEATMAP.indexOf('// Insert or replace heatmap', a);
        assert.ok(a > -1 && b > a, 'der Heatmap-Rumpf steht nicht mehr in js/app-current-meta.js');
        return HEATMAP.slice(a, b);
    })();

    it('keine zweite Überschrift über der Tabelle', () => {
        /* Der Abschnitt heisst bereits „Matchups" (js/ds-sections.js).
           Darunter stand „Matchup Heatmap" — derselbe Gegenstand, zwei
           Zeilen tiefer. */
        assert.ok(!/<h2[^>]*class="heatmap-title"/.test(block),
            'die Unterüberschrift ist wieder da');
    });

    it('die Tabelle steht vor Legende und Achsenwahl', () => {
        const iTabelle = block.indexOf('heatmap-table-scroll');
        const iDetails = block.indexOf('heatmap-details');
        const iAchsen  = block.indexOf('${searchControlsHtml}');
        assert.ok(iTabelle > -1 && iDetails > iTabelle,
            'der eingeklappte Block steht nicht unter der Tabelle');
        assert.ok(iAchsen > iTabelle,
            'die Achsenfelder stehen wieder über der Tabelle');
    });

    it('Legende und Achsenwahl liegen IM eingeklappten Block', () => {
        const a = block.indexOf('<div class="heatmap-details" id="heatmapDetails"');
        const b = block.indexOf('// Insert or replace heatmap');
        assert.ok(a > -1, 'der Block heißt nicht mehr .heatmap-details#heatmapDetails');
        const drin = block.slice(a, b > a ? b : block.length);
        assert.match(drin, /heatmap-key-fav/, 'die Farblegende steht nicht drin');
        assert.match(drin, /\$\{searchControlsHtml\}/, 'die Achsenfelder stehen nicht drin');
    });

    /* ── Der Knopf statt der aufklappbaren Zeile (11.09.2026) ────────
       Gemeldet: „Können wir unter der Heatmap neben Show all Decks ein
       Button mit Info oder Details machen, was dann die Legende und die
       Suche einblendet? Dann sieht der Bereich da drunter nicht so
       abgehackt und lang aus."
       Vorher: eine <details>-Zeile UNTER der Knopfzeile — zwei
       Bedienelemente untereinander, die beide etwas öffneten. */

    it('der Öffner steht als Knopf IN der Zeile neben „Alle Decks zeigen"', () => {
        const a = block.indexOf('<div class="heatmap-btn-row">');
        const b = block.indexOf('</div>', block.indexOf('heatmap-info-btn'));
        assert.ok(a > -1, 'die Knopfzeile fehlt');
        const zeile = block.slice(a, b);
        assert.match(zeile, /heatmap\.showAll/, '„Alle Decks zeigen" steht nicht mehr in der Zeile');
        assert.match(zeile, /class="ds-btn heatmap-info-btn"/, 'der Info-Knopf steht nicht in der Zeile');
        // Nur echtes Markup, nicht das Wort im Kommentar darüber.
        assert.ok(!/<details[ >]|<\/details>/.test(block.replace(/\/\*[\s\S]*?\*\//g, '')),
            'die aufklappbare Zeile ist zurück — dann stehen wieder zwei Öffner untereinander');
    });

    it('der Knopf sagt Screenreadern, was er öffnet und ob es offen ist', () => {
        const i = block.indexOf('heatmap-info-btn');
        const knopf = block.slice(block.lastIndexOf('<button', i), block.indexOf('</button>', i));
        assert.match(knopf, /aria-controls="heatmapDetails"/, 'aria-controls fehlt');
        assert.match(knopf, /aria-expanded="\$\{infoOffen \? 'true' : 'false'\}"/,
            'aria-expanded steht fest statt am Zustand');
        assert.match(knopf, /type="button"/, 'ohne type="button" schickt er ein Formular ab');
    });

    it('er steht offen, sobald eine Achsensuche läuft', () => {
        /* Sonst wäre das Feld, das die Tabelle gerade auf drei Zeilen
           eingekocht hat, unsichtbar — und niemand fände den Weg
           zurück. */
        assert.match(HEATMAP,
            /const infoOffen = !!window\.heatmapInfoOffen \|\| !!\(rawSearchY \|\| rawSearchX\);/,
            'der Block bleibt auch bei aktiver Suche zugeklappt');
    });

    it('die eigene Wahl überlebt das Neuzeichnen', () => {
        /* Die Tabelle wird bei JEDEM Tastendruck neu gebaut. Stünde der
           Zustand nur im DOM, klappte der Block beim nächsten Zeichnen
           wieder zu, obwohl der Nutzer ihn gerade geöffnet hat. */
        assert.match(HEATMAP, /window\.heatmapInfoOffen = !!block\.hidden;/,
            'der Zustand wird nicht am window gemerkt');
        assert.match(HEATMAP, /if \(typeof window\.heatmapInfoOffen === 'undefined'\) \{/,
            'der Startzustand wird nicht gesetzt');
    });

    it('das Umschalten zeichnet NICHT neu', () => {
        /* Ein Neubau würde Scrollstand und Eingabefokus wegwerfen,
           obwohl sich an den Daten nichts ändert. */
        const a = HEATMAP.indexOf('function toggleHeatmapInfo()');
        const b = HEATMAP.indexOf('\n        }', a);
        assert.ok(a > -1, 'toggleHeatmapInfo() fehlt');
        const fn = HEATMAP.slice(a, b);
        assert.ok(!/renderMatchupHeatmap\(\)/.test(fn),
            'der Info-Knopf zeichnet die ganze Heatmap neu');
        assert.match(fn, /block\.hidden = /, 'er schaltet nicht hidden um');
    });

    it('bei laufender Suche lässt er sich nicht zuklappen', () => {
        /* Sonst verschwände genau das Feld, mit dem man die Suche
           wieder aufmacht — und die Tabelle bliebe eingekocht. */
        const a = HEATMAP.indexOf('function toggleHeatmapInfo()');
        const fn = HEATMAP.slice(a, HEATMAP.indexOf('\n        }', a));
        assert.match(fn, /sucheLaeuft && !block\.hidden/,
            'er klappt auch bei laufender Suche zu');
        assert.match(fn, /heatmap\.detailsGesperrt/,
            'er tut es wortlos — der Nutzer klickt dann zweimal und gibt auf');
    });

    it('der Leerfall behält seine Achsenfelder oben', () => {
        /* Dort gibt es keine Tabelle, unter die sie rutschen könnten —
           und sie sind das einzige, womit man eine leere Suche wieder
           aufmacht. */
        const a = HEATMAP.indexOf('class="matchup-heatmap-container heatmap-container-std"');
        const b = HEATMAP.indexOf('heatmap-empty-reason', a);
        assert.ok(a > -1 && b > a);
        assert.match(HEATMAP.slice(a, b), /\$\{searchControlsHtml\}/,
            'im Leerfall fehlen die Achsenfelder — dann führt kein Weg zurück');
        assert.ok(!/<h2[^>]*heatmap-title-std/.test(HEATMAP.slice(a, b)),
            'der Leerfall trägt wieder eine eigene Überschrift');
    });
});

describe('Von der Deck-Karte in den Meta Call', () => {

    it('jede Deck-Karte trägt den Knopf', () => {
        const a = KARTE.indexOf('const metaBtn =');
        assert.ok(a > -1, 'der Knopf fehlt in js/app-archetype-card.js');
        const zeile = KARTE.slice(KARTE.indexOf('const goto = `<div class="arc-actions">'),
                                  KARTE.indexOf('const attrs ='));
        assert.match(zeile, /\$\{metaBtn\}/, 'der Knopf steht nicht in der Aktionszeile');
    });

    it('der Klick erreicht die Karte darunter nicht', () => {
        /* Die ganze Karte ist ein Klickziel („Volle Analyse"). Ohne
           stopPropagation landet man dort statt im Meta Call. */
        const a = KARTE.indexOf("e.target.closest('.arc-meta')");
        const b = KARTE.indexOf("e.target.closest('.arc-mu-more')", a);
        assert.ok(a > -1 && b > a, 'der Knopf wird vor den anderen nicht behandelt');
        const rumpf = KARTE.slice(a, b);
        assert.match(rumpf, /e\.stopPropagation\(\)/);
        assert.match(rumpf, /MetaCall\.oeffneMitDeck/);
    });

    it('ohne das Modul schafft er wenigstens den Reiterwechsel', () => {
        const a = KARTE.indexOf("e.target.closest('.arc-meta')");
        const b = KARTE.indexOf("e.target.closest('.arc-mu-more')", a);
        assert.match(KARTE.slice(a, b), /switchTabAndUpdateMenu\('meta-call'\)/,
            'ein Knopf, der ohne das Modul gar nichts tut, ist schlimmer als einer, '
            + 'der einen Schritt weniger schafft');
    });
});

describe('oeffneMitDeck: der Wunsch überlebt den Ladevorgang', () => {

    function umgebung(opt) {
        const o = opt || {};
        const gerufen = { deck: null, meldung: null, gescrollt: 0, reiter: null };
        const auftraege = [];
        const ctx = baue(MC, [
            'function oeffneMitDeck(name)',
            'function _wunschEinloesen(versuch)',
        ], {
            window: {
                switchTabAndUpdateMenu: (id) => { gerufen.reiter = id; },
                showToast: (m) => { gerufen.meldung = m; },
            },
            document: {
                querySelector: () => ({ scrollIntoView: () => { gerufen.gescrollt++; } }),
            },
            /* Die Warteschlange wird von Hand abgearbeitet: so laesst
               sich pruefen, dass der Wunsch WARTET, statt ins Leere zu
               laufen — mit echten Zeitgebern waere das ein Rennen. */
            setTimeout: (fn) => { auftraege.push(fn); return auftraege.length; },
            _shareList: o.shareList === undefined ? null : o.shareList,
            _wunschDeck: '',
            normalize: (s) => String(s || '').toLowerCase().replace(/[’']/g, "'").trim(),
            _onMyDeck: (n) => { gerufen.deck = n; },
            _mcIstDeutsch: () => true,
            init: () => {},
        });
        ctx.__takt = (n) => {
            for (let i = 0; i < (n || 1); i++) {
                const naechste = auftraege.shift();
                if (!naechste) break;
                naechste();
            }
        };
        ctx.__offen = () => auftraege.length;
        ctx.__gerufen = gerufen;
        return ctx;
    }

    it('wartet, bis die Anteilsliste steht, statt den Namen zu verlieren', () => {
        /* DER KERN. Der Reiter lädt seine Daten erst beim ersten Öffnen.
           Ein _onMyDeck direkt nach dem Reiterwechsel liefe ins Leere. */
        const ctx = umgebung({ shareList: null });
        ctx.oeffneMitDeck('Dragapult');
        assert.equal(ctx.__gerufen.reiter, 'meta-call', 'der Reiter wird nicht gewechselt');
        assert.equal(ctx.__gerufen.deck, null, 'das Deck wird gesetzt, bevor die Liste steht');
        assert.ok(ctx.__offen() > 0, 'der Wunsch wartet nicht, er ist verloren');

        // Daten kommen an, nächster Zug der Warteschlange.
        ctx._shareList = [{ name: 'Dragapult' }, { name: 'Basic Box' }];
        ctx.__takt();
        assert.equal(ctx.__gerufen.deck, 'Dragapult');
    });

    it('findet das Deck auch bei anderem Apostroph', () => {
        const ctx = umgebung({ shareList: [{ name: 'N’s Zoroark' }] });
        ctx.oeffneMitDeck("N's Zoroark");
        assert.equal(ctx.__gerufen.deck, 'N’s Zoroark',
            'die Tier-Liste und die Anteilsdatei schreiben denselben Archetyp '
            + 'gelegentlich mit verschiedenen Apostrophen');
    });

    it('springt zum Ergebnis, nicht an den Reiteranfang', () => {
        const ctx = umgebung({ shareList: [{ name: 'Dragapult' }] });
        ctx.oeffneMitDeck('Dragapult');
        ctx.__takt(3);
        assert.ok(ctx.__gerufen.gescrollt > 0, 'es wird nirgendwohin gesprungen');
    });

    it('sagt es, wenn zu dem Deck keine Anteile vorliegen', () => {
        /* Eine Aussage, keine Panne — und besser als ein leerer Block,
           in dem der Nutzer den Fehler bei sich sucht. */
        const ctx = umgebung({ shareList: [{ name: 'Dragapult' }] });
        ctx.oeffneMitDeck('Gibt Es Nicht');
        assert.equal(ctx.__gerufen.deck, null);
        assert.match(String(ctx.__gerufen.meldung), /keine Anteile/);
    });

    it('gibt nach einer halben Minute auf', () => {
        /* Ein Wunsch, der stundenlang wartet, löst sich irgendwann bei
           einer ganz anderen Handlung ein — dann springt der Reiter
           ohne Anlass auf ein Deck von vorhin. */
        const ctx = umgebung({ shareList: null });
        ctx.oeffneMitDeck('Dragapult');
        for (let i = 0; i < 70; i++) ctx.__takt();
        assert.equal(ctx.__offen(), 0, 'der Wunsch wartet immer noch');
        ctx._shareList = [{ name: 'Dragapult' }];
        ctx.__takt(5);
        assert.equal(ctx.__gerufen.deck, null,
            'der abgelaufene Wunsch löst sich nachträglich doch noch ein');
    });

    it('ein leerer Name tut gar nichts', () => {
        const ctx = umgebung({ shareList: [{ name: 'Dragapult' }] });
        ctx.oeffneMitDeck('');
        assert.equal(ctx.__gerufen.reiter, null);
        assert.equal(ctx.__offen(), 0);
    });

    it('steht als öffentlicher Einstieg zur Verfügung', () => {
        const i = MCALL.lastIndexOf('return {');
        assert.ok(i > -1);
        assert.match(MCALL.slice(i), /\n\s*oeffneMitDeck,/,
            'oeffneMitDeck ist nicht exportiert — der Knopf fände es nicht');
    });
});
