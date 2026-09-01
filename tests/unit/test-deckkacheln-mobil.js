'use strict';
/*
 * Die Kartenkacheln im Deckbau, am Handy.
 *
 * ANLASS (01.09.2026)
 * -------------------
 * Der Betreiber schickte einen Screenshot: "die Formatierung mobil ab der
 * wishlist Button zum Beispiel sieht ja schlimm aus". Nachgemessen bei
 * 390 px waren es drei Brueche, alle mit derselben Handschrift — eine
 * Regel, die eine feste Zahl festschreibt, wo eine mitwachsende hingehoert.
 *
 * 1  DAS WUNSCHLISTEN-HERZ WAR 22 x 44 STATT 22 x 22
 *
 *    css/tippziele.css zieht unter `pointer: coarse` jeden Knopf auf
 *    `min-height: 44px !important`. Das ist fuer Knoepfe richtig, die
 *    NEBEN etwas stehen. Das Herz liegt IM Kartenbild. Gemessen: 74 von
 *    74 Herzen 22 x 44, das Herz belegte 45 % der Bildhoehe und verdeckte
 *    die Prozentzeile um 22,4 px.
 *
 *    Fuenf Regeln setzen dort `height: 22px !important`
 *    (ui-components.css:1780, mobile-responsive.css:1434/2073/2082,
 *    index.html:346) — `min-height` schlaegt `height`, also half keine.
 *    Das Herz gehoert in die Ausnahmeliste, und die Trefferflaeche waechst
 *    unsichtbar per ::after, wie bei .card-proxy-btn.
 *
 *    ACHTUNG bei der Nachahmung: .card-proxy-btn bekommt dabei
 *    `position: relative`, weil er statisch steht. Das Herz steht schon
 *    absolut. Als hier versehentlich `relative` stand, rutschten alle 74
 *    Herzen auf x = -3 (hingen aus der Kachel), y von 22 auf 229,4, und
 *    jede Kachel wurde 22 px hoeher — Seitenverhaeltnis 1,648 statt
 *    1,400, das Kartenbild also gestreckt. Deshalb pruefen wir das mit.
 *
 * 2  DAS GITTER WAR AUF 4 x 69 PX FESTGENAGELT
 *
 *    Gemessen bei 320, 390, 430 UND 767 px: immer 4 x 69. Bei 767 px
 *    blieben 60 % der Breite leer. Und 69 px reichen fuer den Inhalt der
 *    Kachel nicht — daher Bruch 3. Vier fruehere Regeln wollten das schon
 *    flexibel und verloren gegen das `!important`.
 *    Jetzt: 320 -> 2 x 102 · 390 -> 3 x 88,7 · 430 -> 3 x 102 ·
 *    767 -> 6 x 100,5. Desktop (1280 px) bitgenau unveraendert.
 *
 * 3  DIE PROZENTZEILE WURDE AUF BEIDEN SEITEN ABGESCHNITTEN
 *
 *    `display: flex` + `justify-content: center` zentriert den Inhalt auch
 *    dann, wenn er breiter ist als der Container — dann ragt er VORNE UND
 *    HINTEN heraus, und `overflow: hidden` schneidet symmetrisch. Das
 *    `text-overflow: ellipsis` daneben war wirkungslos: es wirkt auf einen
 *    Block, nicht auf ein Flex-Kind. Gemessen 63,0 gegen 80,0, je 8,5 px
 *    weg: aus "100,0 % | Ø 1,20x" wurde "0,0% | Ø 1,2". Auf allen 29
 *    Kacheln — und niemand konnte sehen, dass etwas fehlt.
 *
 * Diese Tests lesen die Quelle. Die Zahlen oben stammen aus Playwright
 * gegen einen lokalen Server; im Dauerlauf hier nachzumessen hiesse, einen
 * Browser zu starten, um eine CSS-Zeile zu pruefen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');

const tippziele = lies(path.join('css', 'tippziele.css'));
const styles = lies(path.join('css', 'styles.css'));

/** Der Rumpf einer Regel, am Selektor gefunden — OHNE Kommentare.
 *
 * Die Kommentare muessen raus, sonst prueft der Test die Begruendung
 * statt die Regel: in diesem Stylesheet steht neben jeder Korrektur, was
 * vorher dastand, und "hier stand `display: flex`" liest sich fuer eine
 * Suche wie ein `display: flex`. Beim ersten Anlauf ist genau das
 * passiert — der Test meldete die eigene Erklaerung als Rueckfall. */
function ohneKommentar(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, ' ');
}
function regel(text, selektor, ab) {
    const i = text.indexOf(selektor, ab || 0);
    if (i < 0) return null;
    const auf = text.indexOf('{', i);
    const zu = text.indexOf('}', auf);
    return (auf > 0 && zu > auf) ? ohneKommentar(text.slice(auf + 1, zu)) : null;
}

describe('Das Wunschlisten-Herz bleibt so gross wie das Kartenbild es erlaubt', () => {

    it('steht in der Ausnahmeliste der 44-px-Regel', () => {
        const i = tippziele.indexOf('min-height: 44px !important');
        assert.ok(i > 0, 'die Mindesthoehen-Regel ist verschwunden');
        const selektoren = ohneKommentar(tippziele.slice(Math.max(0, i - 700), i));
        assert.ok(/:not\(\.wishlist-heart-badge\)/.test(selektoren),
            'das Herz haengt wieder an der 44-px-Regel — es liegt IM Kartenbild '
            + 'und belegte so 45 % der Bildhoehe (gemessen an 74 Herzen)');
    });

    it('bekommt die Trefferflaeche trotzdem, unsichtbar', () => {
        // Kleiner darstellen und die Flaeche einfach weglassen waere
        // schlechter als vorher: dann ist das Ziel 22 x 22.
        const r = regel(tippziele, '.wishlist-heart-badge::after');
        assert.ok(r, 'die unsichtbare Trefferflaeche des Herzens fehlt');
        assert.ok(/width:\s*34px/.test(r) && /height:\s*34px/.test(r),
            'die Trefferflaeche ist nicht mehr 34 x 34 — gemessen traf sie '
            + 'bei ±16 px und nicht mehr bei ±18');
        assert.ok(/position:\s*absolute/.test(r) && /translate\(-50%,\s*-50%\)/.test(r),
            'die Flaeche ist nicht mehr um das Herz zentriert — beim '
            + 'Nachbarknopf lag sie deshalb einmal 42 px daneben');
    });

    it('bekommt KEINE eigene position — es steht schon absolut', () => {
        // Der eine Fehler, der beim Umsetzen wirklich passiert ist.
        const bis = tippziele.indexOf('.wishlist-heart-badge::after');
        const block = ohneKommentar(tippziele.slice(Math.max(0, bis - 1400), bis));
        assert.ok(!/\.wishlist-heart-badge\s*\{[^}]*position\s*:/.test(block),
            'hier steht wieder eine `position` auf dem Herz selbst. '
            + 'css/ui-components.css:1779 setzt bereits `absolute`, und diese '
            + 'Datei laedt spaeter — mit `relative` rutschten alle 74 Herzen '
            + 'auf x = -3 und jede Kachel wurde 22 px hoeher (H/B 1,648 statt 1,400)');
    });
});

describe('Das Deckbau-Gitter waechst mit der Breite', () => {

    const gitterRumpf = (() => {
        const i = styles.indexOf('#cityLeagueMyDeckGrid,\n            #currentMetaMyDeckGrid');
        assert.ok(i > 0, 'das Deckbau-Gitter ist verschwunden');
        const auf = styles.indexOf('{', i);
        return ohneKommentar(styles.slice(auf, styles.indexOf('}', auf)));
    })();

    it('hat keine feste Spaltenzahl mehr', () => {
        assert.ok(!/repeat\(\s*\d+\s*,/.test(gitterRumpf),
            'das Gitter steht wieder auf einer festen Spaltenzahl — gemessen '
            + 'blieb es dadurch bei 320, 390, 430 UND 767 px immer 4 x 69 px, '
            + 'bei 767 px waren 60 % der Breite leer');
        assert.ok(/auto-fill|auto-fit/.test(gitterRumpf),
            'das Gitter fuellt die Breite nicht mehr auf');
    });

    it('die Kacheln sind nicht auf eine Pixelbreite festgenagelt', () => {
        const r = regel(styles, '#cityLeagueMyDeckGrid .deck-card,');
        assert.ok(r, 'die Kachel-Regel ist verschwunden');
        assert.ok(!/(min-|max-)?width:\s*69px/.test(r),
            'die Kachel steht wieder auf 69 px — dort passt die Prozentzeile '
            + 'nicht hinein (sie braucht 80 px) und wird beschnitten');
    });

    it('das Kartenbild fuellt die Kachel, statt daneben klein zu bleiben', () => {
        const r = regel(styles, '#cityLeagueMyDeckGrid .deck-card img,');
        assert.ok(r, 'die Bild-Regel ist verschwunden');
        assert.ok(!/width:\s*69px/.test(r) && !/height:\s*97px/.test(r),
            'das Bild ist wieder auf 69 x 97 festgenagelt — die Kachel waechst '
            + 'dann und das Bild bleibt klein');
    });
});

describe('Die Prozentzeile der Kachel wird hinten gekuerzt, nicht beidseitig', () => {

    const overlay = regel(styles, '#cityLeagueMyDeckGrid .deck-card-overlay,');

    it('ist kein zentrierender Flex-Container mehr', () => {
        assert.ok(overlay, 'die Prozentzeile ist verschwunden');
        assert.ok(!/display:\s*flex/.test(overlay),
            'die Zeile ist wieder ein Flex-Container. Mit '
            + '`justify-content: center` ragt zu breiter Inhalt VORNE UND HINTEN '
            + 'heraus und `overflow: hidden` schneidet symmetrisch ab — '
            + 'gemessen 63,0 gegen 80,0, je 8,5 px weg, aus '
            + '"100,0 % | Ø 1,20x" wurde "0,0% | Ø 1,2"');
    });

    it('die Ellipse kann greifen', () => {
        // text-overflow wirkt auf einen Block, nicht auf ein Flex-Kind.
        assert.ok(/text-overflow:\s*ellipsis/.test(overlay),
            'ohne Ellipse bricht die Zeile wieder stumm ab');
        assert.ok(/display:\s*block/.test(overlay),
            'ohne Block-Darstellung ist die Ellipse wirkungslos');
        assert.ok(/text-align:\s*center/.test(overlay),
            'die Zeile ist nicht mehr zentriert — das war die einzige '
            + 'Eigenschaft, fuer die der Flex-Container ueberhaupt da war');
    });
});
