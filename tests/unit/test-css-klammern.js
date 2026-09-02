'use strict';
/*
 * Die Klammern der Stylesheets gehen auf.
 *
 * ANLASS (02.09.2026)
 * -------------------
 * Beim Verschieben eines @container-Blocks schnitt ein Skript eine
 * Klammer zu frueh ab. Der Block blieb offen und verschluckte alles, was
 * danach kam — unter anderem die Regeln fuer die Knoepfe unter jeder
 * Tier-Kachel. Auf der Seite standen sie danach unformatiert
 * nebeneinander ("Alle 20|Volle Analyse").
 *
 * Gemerkt hat es KEIN Test: alle lesen die Datei als Text und suchen
 * Zeichenfolgen. Eine Zeichenfolge steht auch dann noch da, wenn sie in
 * einem offenen Block versauert. Aufgefallen ist es erst beim Ansehen
 * der ausgelieferten Seite.
 *
 * Beim Nachzaehlen fiel ausserdem ein alter Rest auf: hinter einem
 * @media-Block standen eine herrenlose Deklaration und eine ueberzaehlige
 * Klammer. Wirkungslos, aber genau die Sorte Muell, aus der spaeter ein
 * verschluckter Block wird.
 *
 * Diese Datei zaehlt die Klammern richtig — an Kommentaren und
 * Zeichenketten vorbei — und haelt fest, dass der @container-Block sich
 * schliesst, bevor die naechste Regel anfaengt.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WURZEL = path.join(__dirname, '..', '..');
const CSS_DIR = path.join(WURZEL, 'css');

/** Klammertiefe zaehlen, ohne auf Kommentare oder Zeichenketten hereinzufallen. */
function pruefeKlammern(text) {
    let i = 0, tiefe = 0;
    const n = text.length;
    const ueberzaehlig = [];
    while (i < n) {
        const c = text[i];
        if (c === '/' && text[i + 1] === '*') {
            const j = text.indexOf('*/', i + 2);
            i = j > 0 ? j + 2 : n;
            continue;
        }
        if (c === '"' || c === "'") {
            const q = c;
            i += 1;
            while (i < n && text[i] !== q) i += (text[i] === '\\' ? 2 : 1);
            i += 1;
            continue;
        }
        if (c === '{') tiefe += 1;
        else if (c === '}') {
            tiefe -= 1;
            if (tiefe < 0) {
                ueberzaehlig.push(text.slice(0, i).split('\n').length);
                tiefe = 0;
            }
        }
        i += 1;
    }
    return { tiefe, ueberzaehlig };
}

const dateien = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css')).sort();

describe('Die Klammern der Stylesheets gehen auf', () => {
    it('es gibt ueberhaupt Stylesheets zu pruefen', () => {
        assert.ok(dateien.length >= 3,
            `nur ${dateien.length} CSS-Dateien gefunden — der Pfad stimmt wohl nicht`);
    });

    for (const datei of dateien) {
        it(`${datei} hat keinen offenen Block`, () => {
            const text = fs.readFileSync(path.join(CSS_DIR, datei), 'utf8');
            const { tiefe, ueberzaehlig } = pruefeKlammern(text);
            assert.strictEqual(tiefe, 0,
                `${datei} endet ${tiefe} Block(s) tief — ein offener Block `
                + 'verschluckt alle folgenden Regeln, und keine Textsuche merkt das');
            assert.deepStrictEqual(ueberzaehlig, [],
                `${datei} hat ueberzaehlige schliessende Klammern in Zeile(n) `
                + `${ueberzaehlig.join(', ')} — dort steht Muell, aus dem spaeter `
                + 'ein verschluckter Block wird');
        });
    }
});

describe('Der @container-Block schliesst sich selbst', () => {
    const stil = fs.readFileSync(path.join(CSS_DIR, 'styles.css'), 'utf8');

    it('er enthaelt genau die Regeln, die er enthalten soll', () => {
        const i = stil.indexOf('@container');
        assert.ok(i > 0, 'die Container-Abfrage fuer das enge Band ist weg');
        // Vom @container an vorwaerts, bis seine Tiefe wieder 0 ist.
        let j = stil.indexOf('{', i), tiefe = 0, ende = -1;
        for (let k = j; k < stil.length; k++) {
            if (stil[k] === '{') tiefe += 1;
            else if (stil[k] === '}') {
                tiefe -= 1;
                if (tiefe === 0) { ende = k; break; }
            }
        }
        assert.ok(ende > 0, 'der @container-Block wird nie geschlossen');
        const rumpf = stil.slice(i, ende + 1);
        assert.ok(rumpf.length < 400,
            `der @container-Block ist ${rumpf.length} Zeichen lang. Er soll zwei `
            + 'Regeln tragen — so lang heisst, er hat den Rest der Datei '
            + 'verschluckt. Genau das ist am 02.09.2026 passiert und hat die '
            + 'Knoepfe unter den Tier-Kacheln unformatiert gelassen.');
        assert.ok(!/\.arc-halb-quelle\s*\{/.test(rumpf),
            'die Regel fuer die Quellenbeschriftung ist IM Container-Block '
            + 'gelandet — dann gilt sie nur noch auf schmalen Kacheln');
    });
});
