/**
 * Die Leisten des Deckbaus — ein Maßstab, eine Fläche
 * ==================================================
 *
 * GEMELDET am 15.09.2026: "in mein Deck passt das verhaeltnis der
 * Buttons zum Rest nicht". Verkleinert wurde daraufhin NUR die
 * Kopfzeile von „Dein Deck".
 *
 * GEMELDET am 16.09.2026, mit Bild: "das Verhaeltnis der Buttons und so
 * im Deck Builder ist immer noch nicht schoen formatiert".
 *
 * NACHGEMESSEN (Playwright, echtes Markup aus index.html, alle 40
 * Stylesheets, 1440 px, Dunkelmodus):
 *
 *     Werkzeugleiste oben   38,1 px hoch / 14 px Schrift
 *     Zahlenchips daneben   26–28 px     / 14 px
 *     Kopfzeile „Dein Deck" 31,5 px      / 12,5 px
 *
 * Drei Maßstaebe, keine 100 px auseinander — der zweite Befund war die
 * Folge des ersten Eingriffs.
 *
 * Und die Flaeche: `.deck-builder` und `.action-bar` zeichneten feste
 * helle Verlaeufe (#fafbff/#f0f4ff bzw. #f8faff/#f0f4ff) auf einer
 * Seite, deren body im Dunkelmodus rgb(11,16,32) ist. Das war der
 * weisse Balken im Bild.
 *
 * Nach der Umstellung gemessen: alle Knoepfe BEIDER Reihen 30,9 px,
 * die Chips 31 px, durchgehend 13 px; Flaechen aus Marken.
 *
 * VERFAELSCHUNGSPROBE (16.09.2026, einzeln ausgefuehrt):
 *   --ui-btn-font-size in .current-meta-mydeck-btns wieder eingefuegt
 *      -> "ein Maßstab" faellt um
 *   .deck-builder background auf den alten Verlauf zurueckgesetzt
 *      -> "keine feste helle Flaeche" faellt um
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

/* Kommentare heraus, BEVOR nach Zeichenketten gesucht wird — sonst
   findet die Suche die eigene Erklaerung und die Probe wird blind
   (CLAUDE.md, „Dein eigener Kommentar macht die Probe blind"). */
function ohneKommentare(s) {
    const heraus = s.replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(heraus.length > s.length * 0.3,
        'das Ausschneiden hat zu viel entfernt — die Zusicherungen wuerden nichts mehr pruefen');
    return heraus;
}

const POKEBALL = ohneKommentare(lies('css/pokeball-menu.css'));
const CITY = ohneKommentare(lies('css/city-league.css'));
const STYLES = ohneKommentare(lies('css/styles.css'));

/** Den Rumpf einer Regel herausholen. */
function regel(css, selektor) {
    const i = css.indexOf(selektor);
    assert.ok(i > -1, 'Regel nicht gefunden: ' + selektor);
    const a = css.indexOf('{', i);
    const b = css.indexOf('}', a);
    assert.ok(a > -1 && b > a, 'Regelrumpf nicht lesbar: ' + selektor);
    return css.slice(a + 1, b);
}

describe('Ein Maßstab fuer beide Reihen', () => {
    it('die Schriftgroesse der Knoepfe steht an genau EINER Stelle', () => {
        /* Zwei Stellen waren der Fehler: die Kopfzeile bekam am
           15.09.2026 eigene, kleinere Marken, die Leiste darueber
           behielt die globalen. */
        const alle = (POKEBALL + CITY).match(/--ui-btn-font-size\s*:/g) || [];
        assert.equal(alle.length, 1,
            'Der Maßstab der Deckbau-Knoepfe darf nur an einer Stelle gesetzt '
            + 'werden. Gefunden: ' + alle.length);
    });

    it('beide Reihen teilen sich denselben Satz Marken', () => {
        const rumpf = regel(POKEBALL,
            '.deck-builder-toolbar,\n.current-meta-mydeck-btns');
        ['--ui-btn-pad-y', '--ui-btn-pad-x', '--ui-btn-font-size', '--ui-btn-radius']
            .forEach(m => assert.ok(rumpf.indexOf(m) !== -1, m + ' fehlt im gemeinsamen Satz'));
    });

    it('die Hauptaktion faellt nicht aus dem Maßstab', () => {
        /* Gruen genuegt. Eine Reihe, in der ein Knopf groesser ist als
           seine Nachbarn, liest sich als Fehler. */
        const rumpf = regel(CITY, '.current-meta-mydeck-btns .btn-modern.success');
        assert.ok(rumpf.indexOf('--ui-btn-') === -1,
            'Die Hauptaktion setzt eigene Groessenmarken: ' + rumpf.trim());
        assert.ok(rumpf.indexOf('var(--color-success)') !== -1,
            'sie muss sich ueber die Farbe abheben');
    });

    it('die Zahlenchips stehen auf demselben Maßstab wie die Knoepfe', () => {
        const rumpf = regel(CITY, '.toolbar-metric {');
        assert.ok(/font-size:\s*13px/.test(rumpf),
            'Chip-Schrift weicht vom Knopfmaßstab ab: ' + rumpf.trim());
        assert.ok(/min-height:\s*31px/.test(rumpf),
            'ohne feste Hoehe kommt sie aus dem Inhalt — der mittlere Chip war 2 px niedriger');
    });
});

describe('Die Flaechen folgen dem Thema', () => {
    const HELLE_VERLAEUFE = /#f[0-9a-f]{5}|#e[cdef][0-9a-f]{3}/i;

    [['.deck-builder {', () => STYLES],
     ['.action-bar {', () => POKEBALL],
     ['.deck-builder-toolbar {', () => POKEBALL],
     ['.deck-builder-testdraw-btn {', () => POKEBALL]].forEach(([sel, quelle]) => {
        it(sel + ' zeichnet keine feste helle Flaeche', () => {
            /* Eine feste helle Flaeche unter drehender Schrift ist immer
               ein Fehler — dieselbe Regel, die .toolbar-metric am
               02.09.2026 gelernt hat. */
            const rumpf = regel(quelle(), sel);
            const zeilen = rumpf.split('\n')
                .filter(z => /background|border-color|border:/.test(z));
            zeilen.forEach(z => assert.ok(!HELLE_VERLAEUFE.test(z),
                sel + ' traegt eine feste helle Farbe: ' + z.trim()));
        });
    });

    it('der Trenner der Leiste kommt aus den Marken', () => {
        const zeile = POKEBALL.split('\n').filter(z => z.indexOf('.action-divider {') !== -1)[0];
        assert.ok(zeile, '.action-divider nicht gefunden');
        assert.ok(zeile.indexOf('var(--line-strong)') !== -1,
            'der Trenner war fest #d0d5e0 — im Dunkelmodus ein heller Strich: ' + zeile.trim());
    });
});
