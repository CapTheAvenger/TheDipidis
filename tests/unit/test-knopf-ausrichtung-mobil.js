/**
 * Zwei Regeln, die auf dem Telefon etwas versteckt haben — 11.09.2026.
 *
 * BEFUND 1: jede Abschnittsüberschrift stand auf dem Telefon mittig
 * ----------------------------------------------------------------
 * css/styles.css trug in `@media (max-width: 768px)` eine Sammelregel
 * für Tippziele:
 *
 *     button, .btn, .nav-btn, .action-btn {
 *         min-height: 44px;
 *         display: inline-flex;
 *         align-items: center;
 *         justify-content: center;   <-- das hier
 *     }
 *
 * `justify-content` trifft jeden Knopf, der seine Ausrichtung nicht
 * selbst erklärt — auch `.ds-sec-hd`, den Klapp-Knopf jeder
 * Abschnittsüberschrift. Der setzt `display: flex` und
 * `text-align: left`, aber kein `justify-content`; die Sammelregel war
 * damit die einzige Stimme und zentrierte ihn.
 *
 * Nachgemessen in Chromium auf 390 px (Startseite, 16 Reiter, 1.768
 * Knöpfe): die Überschrift „Die meistgespielten Archetypen" begann bei
 * x = 59 statt bei x = 0, „Tier-Liste" bei x = 116. Nach dem Streichen
 * der drei Zeilen: x = 0 bzw. x = -4 (das Dreieck ragt um seine
 * optische Korrektur hinaus). Betroffen waren außerdem
 * `.meta-hub-tile` (Titel mittig über linksbündiger Unterzeile) und
 * `.side-quest-filter-trigger`.
 *
 * Die drei Zeilen waren auch nicht nötig: ein <button> zentriert seinen
 * Inhalt von sich aus — waagerecht über `text-align: center` aus dem
 * Browser-Stylesheet, senkrecht über seine eigene Inhaltsbox. Gemessen
 * über dieselben 1.768 Knöpfe: 598 blieben Pixel für Pixel gleich, bei
 * den übrigen änderte sich nur der errechnete Wert von `display` und
 * `justify-content`, nicht die Lage ihres Inhalts. Kein einziger Knopf
 * verlor ein `gap` (geprüft: 0 Knöpfe mit `column-gap > 0` ohne
 * Flex-/Grid-Anzeige).
 *
 * BEFUND 2: drei der sechs Kartenarten waren auf dem Telefon nicht
 * erreichbar
 * ---------------------------------------------------------------
 * `.top-cards-arten` (die Artenzeile über den Top-Meta-Karten, seit
 * 10.09.2026) war als wischbare Zeile gedacht und trug dafür
 * `overflow-x: auto`. `.btn-toggle-group` trägt in
 * css/pokeball-menu.css `overflow: hidden`. Beide Selektoren zählten
 * EINE Klasse, und pokeball-menu.css wird nach styles.css geladen
 * (index.html) — also gewann `hidden`.
 *
 * Nachgemessen auf 390 px: `overflowX === "hidden"`, scrollWidth 634
 * bei clientWidth 344. Sichtbar waren „Alle", „Pokémon",
 * „Unterstützer", „Items"; „Ausrüstung", „Stadion" und
 * „Spezial-Energie" standen hinter der Kante und ließen sich nicht
 * hervorholen. Mit `.btn-toggle-group.top-cards-arten` (zwei Klassen)
 * steht dort `auto`, und der letzte Knopf erscheint nach 290 px
 * Wischweg vollständig.
 *
 * Beide Regeln stehen hier fest, weil beide Fehler unsichtbar waren:
 * nichts war kaputt, nur mittig bzw. abgeschnitten.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const STYLES = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const POKEBALL = fs.readFileSync(path.join(ROOT, 'css', 'pokeball-menu.css'), 'utf8');
const INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

/** Der Rumpf der Regel, die mit `selektor {` beginnt.
 *
 * Gesucht wird am ZEILENANFANG. Ohne den Anker fand `.ds-sec-hd` den
 * Nachbarn `.ds-sec-kopf > .ds-sec-hd` — eine andere Regel mit einem
 * anderen Rumpf, und der Test misst dann still das Falsche. */
function rumpf(css, selektor) {
    const anker = new RegExp('^[ \\t]*' + selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{', 'm');
    const m = anker.exec(css);
    assert.ok(m, 'Regelblock nicht am Zeilenanfang gefunden: ' + selektor);
    const auf = m.index + m[0].length;
    return css.slice(auf, css.indexOf('}', auf));
}

describe('Die Tippziel-Sammelregel richtet keinen Knopf mehr aus', () => {
    const SAMMEL = 'button, .btn, .nav-btn, .action-btn';

    it('es gibt sie genau einmal', () => {
        const treffer = STYLES.split(SAMMEL + ' {').length - 1;
        assert.equal(treffer, 1, 'die Sammelregel steht nicht genau einmal in styles.css');
    });

    it('sie setzt die Höhe', () => {
        assert.match(rumpf(STYLES, SAMMEL), /min-height:\s*44px/);
    });

    it('sie setzt weder justify-content noch display noch align-items', () => {
        const r = rumpf(STYLES, SAMMEL);
        for (const eigenschaft of ['justify-content', 'display', 'align-items']) {
            assert.ok(
                !new RegExp(eigenschaft + '\\s*:').test(r),
                'die Sammelregel setzt wieder ' + eigenschaft + ' — damit zentriert sie '
                + 'jeden Knopf, der seine Ausrichtung nicht selbst erklärt (.ds-sec-hd, '
                + '.meta-hub-tile, .side-quest-filter-trigger)'
            );
        }
    });

    it('.ds-sec-hd erklärt seine Ausrichtung weiterhin selbst', () => {
        const c = fs.readFileSync(path.join(ROOT, 'css', 'components.css'), 'utf8');
        assert.match(rumpf(c, '.ds-sec-hd'), /text-align:\s*left/);
        assert.match(rumpf(c, '.ds-sec-hd'), /display:\s*flex/);
    });
});

describe('Die Artenzeile bleibt wischbar', () => {
    it('.btn-toggle-group trägt weiterhin overflow: hidden', () => {
        // Kein Vorwurf an die Regel — sie hält die abgerundete Gruppe
        // zusammen. Der Test hält nur fest, dass es der Gegenspieler ist.
        assert.match(rumpf(POKEBALL, '.btn-toggle-group'), /overflow:\s*hidden/);
    });

    it('pokeball-menu.css wird nach styles.css geladen', () => {
        const a = INDEX.indexOf('css/styles.css');
        const b = INDEX.indexOf('css/pokeball-menu.css');
        assert.ok(a > -1 && b > -1, 'eine der beiden CSS-Dateien wird gar nicht geladen');
        assert.ok(b > a, 'die Ladereihenfolge hat sich gedreht — dann gewinnt bei gleicher '
            + 'Stärke wieder die andere Regel, und dieser Test misst das Falsche');
    });

    it('die Artenzeile nennt zwei Klassen und schlägt damit die eine', () => {
        assert.ok(
            STYLES.includes('.btn-toggle-group.top-cards-arten {'),
            'die Artenzeile steht wieder mit nur einer Klasse — dann gewinnt '
            + '.btn-toggle-group { overflow: hidden } und drei der sechs Kartenarten '
            + 'sind auf dem Telefon nicht mehr erreichbar'
        );
        const r = rumpf(STYLES, '.btn-toggle-group.top-cards-arten');
        assert.match(r, /overflow-x:\s*auto/);
        assert.match(r, /overflow-y:\s*hidden/);
    });
});
