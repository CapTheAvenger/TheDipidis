/**
 * Battle Journal, Gegnerauswahl: Tippen ist nicht Wischen.
 *
 * Gemeldet am 24.08.2026: "Im Journal Scrollen geht nicht. Sobald ich
 * scrollen will wird direkt ein Deck ausgewählt."
 *
 * Ursache war eine Zeile im Markup:
 *
 *     ontouchstart="event.preventDefault(); bjSelectAutocomplete(...)"
 *
 * Zwei Fehler in einer Zeile. Erstens ist touchstart die ERSTE Berührung
 * — auch die eines Wischens. Wer die Liste hinunterziehen wollte, hatte
 * sofort ein Deck im Feld. Zweitens unterbindet das preventDefault das
 * Scrollen der Liste selbst: es gab gar keinen Weg zum fünften Eintrag,
 * obwohl die Liste zwölf Vorschläge zeigt und nur 240 px hoch ist.
 *
 * Die Regel jetzt: touchstart merkt sich nur die Stelle, touchmove
 * verwirft die Berührung, sobald der Finger mehr als 10 px wandert, und
 * erst touchend wählt aus.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const JOURNAL = fs.readFileSync(path.join(ROOT, 'js', 'battle-journal.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');

/** Kommentare raus, bevor eine Zusicherung nach Code sucht — sonst
 *  stolpert dieser Test über die Erklärung des alten Fehlers, die den
 *  alten Fehler zitiert. */
const ohneKommentar = src => String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"'`\\])\/\/.*$/gm, '$1');

const CODE = ohneKommentar(JOURNAL);

describe('Gegnerauswahl: die Berührung wählt nicht mehr sofort aus', () => {
    it('kein Auswählen mehr auf touchstart', () => {
        assert.ok(!/ontouchstart\s*=/.test(CODE),
            'im Markup steht wieder ein ontouchstart-Handler');
        const bereich = CODE.slice(CODE.indexOf("addEventListener('touchstart'"),
                                   CODE.indexOf("addEventListener('touchmove'"));
        assert.ok(!/bjSelectAutocomplete|_bjWaehleAusItem/.test(bereich),
            'touchstart wählt wieder aus');
    });

    it('touchstart und touchmove hören passiv zu — sonst blockieren sie das Scrollen', () => {
        // Genau das war der zweite Teil des Fehlers: ein nicht-passiver
        // Zuhörer mit preventDefault hält die Liste fest.
        const passiv = [...CODE.matchAll(
            /addEventListener\('(touchstart|touchmove|touchcancel)',[\s\S]*?\{ passive: (true|false) \}/g)];
        assert.ok(passiv.length >= 3, 'nicht alle drei Berührungs-Zuhörer sind eingetragen');
        passiv.forEach(m => assert.equal(m[2], 'true',
            `${m[1]} hört nicht passiv zu und kann das Scrollen blockieren`));
    });

    it('touchend darf NICHT passiv sein — dort wird der Klick unterdrückt', () => {
        assert.match(CODE, /addEventListener\('touchend',[\s\S]*?\{ passive: false \}/,
            'touchend ist passiv und kann den nachgereichten Klick nicht unterdrücken');
    });

    it('ein wanderndes Finger verwirft die Berührung', () => {
        const m = CODE.match(/addEventListener\('touchmove'[\s\S]*?\}, \{ passive: true \}\);/);
        assert.ok(m, 'es gibt keinen touchmove-Zuhörer');
        assert.match(m[0], /_bjTippStart = null;/,
            'beim Wischen wird die gemerkte Berührung nicht verworfen');
        assert.match(m[0], /BJ_TIPP_WEG/, 'es gibt keine Schwelle für die Bewegung');
    });

    it('die Schwelle ist klein genug, um ein Wischen zu erkennen', () => {
        const m = CODE.match(/BJ_TIPP_WEG\s*=\s*(\d+)/);
        assert.ok(m, 'BJ_TIPP_WEG fehlt');
        const px = Number(m[1]);
        // Über 16 px hinaus ist es kein Wackeln des Daumens mehr, sondern
        // eine Wischbewegung, die trotzdem noch auswählen würde.
        assert.ok(px >= 6 && px <= 16, `Schwelle ${px} px liegt ausserhalb von 6…16`);
    });

    it('ausgewählt wird nur, wenn der Finger auf demselben Eintrag loslässt', () => {
        const m = CODE.match(/addEventListener\('touchend'[\s\S]*?\}, \{ passive: false \}\);/);
        assert.match(m[0], /_bjItemAus\(ev\) !== start\.item/,
            'ein Loslassen auf einem anderen Eintrag wählt trotzdem aus');
        assert.match(m[0], /ev\.preventDefault\(\)/,
            'ohne preventDefault folgt ein Klick und wählt ein zweites Mal aus');
    });

    it('langes Halten wählt nicht aus', () => {
        assert.match(CODE, /Date\.now\(\) - start\.zeit > BJ_TIPP_ZEIT/,
            'ein langes Halten (Text markieren) wählt weiterhin aus');
    });
});

describe('Gegnerauswahl: am Rechner bleibt es beim Klick', () => {
    it('mousedown hält nur den Fokus, es wählt nicht aus', () => {
        const m = CODE.match(/addEventListener\('mousedown',[\s\S]*?\}\);/);
        assert.ok(m, 'der mousedown-Zuhörer fehlt');
        assert.match(m[0], /ev\.preventDefault\(\)/,
            'ohne preventDefault verliert das Eingabefeld den Fokus und die Liste verschwindet');
        assert.ok(!/bjSelectAutocomplete|_bjWaehleAusItem/.test(m[0]),
            'mousedown wählt aus — dann ist es am Rechner derselbe Fehler wie am Telefon');
    });

    it('der Klick wählt aus', () => {
        const m = CODE.match(/addEventListener\('click',[\s\S]*?_bjWaehleAusItem\(item\);[\s\S]*?\}\);/);
        assert.ok(m, 'kein Klick-Zuhörer, der auswählt');
    });
});

describe('Gegnerauswahl: Feld und Name reisen als Daten mit', () => {
    it('die Einträge tragen Datenattribute statt Handler', () => {
        assert.match(CODE, /data-bj-field="\$\{escapeHtmlAttr\(field\)\}"/);
        assert.match(CODE, /data-bj-name="\$\{escapeHtmlAttr\(name\)\}"/);
    });

    it('Anführungszeichen im Decknamen brechen nichts mehr', () => {
        // Vorher lief der Name durch escapeJsSingleQuoted in einen
        // Inline-Handler. Ein Datenattribut braucht nur HTML-Maskierung.
        const block = CODE.slice(CODE.indexOf('dropdown.innerHTML = matches.map'),
                                 CODE.indexOf('dropdown.classList.remove'));
        assert.ok(!/escapeJsSingleQuoted/.test(block),
            'der Name wird wieder in einen Inline-Handler geschrieben');
    });
});

describe('Gegnerauswahl: die Liste ist überhaupt scrollbar', () => {
    it('sie hat eine Höhengrenze und scrollt darin', () => {
        const m = CSS.match(/\.bj-autocomplete \{([^}]*)\}/);
        assert.ok(m, 'die Regel .bj-autocomplete fehlt');
        assert.match(m[1], /max-height:\s*\d+px/, 'ohne Höhengrenze gibt es nichts zu scrollen');
        assert.match(m[1], /overflow-y:\s*auto/, 'die Liste scrollt nicht');
    });
});
