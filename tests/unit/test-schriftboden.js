/**
 * Keine Schriftgröße unter 10 px — mit zwei benannten Ausnahmen.
 *
 * GEMESSEN am 22.08.2026 an der laufenden Anwendung, vorher:
 *   Desktop  Karten        524 von 863 Textknoten unter 11 px, kleinster  8,00 px
 *   Desktop  Aktuelles Meta 171 von 398                       kleinster  7,49 px
 *   Mobil    Karten          61 von 119                       kleinster  7,00 px
 *
 * 7 px ist keine kleine Schrift, das ist keine Schrift. Der mobile
 * 12-px-Boden in mobile-responsive.css deckte das nicht ab, weil er nur
 * für Mobil gilt und weil `em`-Werte sich unter ihm hindurch
 * multiplizieren.
 *
 * Nachher: mobil nichts mehr unter 10,8 px, Desktop nichts mehr unter
 * 10 px ausser den zwei Ausnahmen unten. 150 Deklarationen wurden auf
 * var(--fs-xs) gehoben, ohne dass die Zahl der !important-Regeln stieg.
 *
 * Die Grenze liegt bewusst bei 10 und nicht bei 11 px: 10 px ist der
 * --lbl-Token des Designsystems für Großbuchstaben-Label, eine
 * getroffene Entscheidung. Alles darunter war keine.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const CSS_DIR = path.join(ROOT, 'css');

/**
 * Zwei Klassen bleiben klein, und zwar begründet: die Kacheln im
 * Top-Cards-Gitter sind auf 390 px rund 55 px breit und laufen schon
 * bei 8 px über (gemessen mit unveränderter CSS: Inhalt 61 px). Bei
 * 11 px bräuchte derselbe Text rund 84 px — die Anhebung macht den
 * vorhandenen Überlauf sichtbar, statt etwas zu verbessern. Das ist ein
 * Layoutproblem der Kachel, kein Schriftproblem.
 *
 * Wer das Gitter umbaut, nimmt diese Einträge hier heraus.
 */
const AUSNAHMEN = [
    { datei: 'current-meta-matchups.css', klasse: 'top-card-share', wert: '0.78em' },
    { datei: 'current-meta-matchups.css', klasse: 'top-card-decks', wert: '0.72em' },
];

function ohneKommentare(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function kleineWerte(datei) {
    const text = ohneKommentare(fs.readFileSync(path.join(CSS_DIR, datei), 'utf8'));
    const treffer = [];
    const re = /font-size:\s*([\d.]+)(px|rem)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const px = m[2] === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
        if (px < 10) {
            const zeile = text.slice(0, m.index).split('\n').length;
            treffer.push({ zeile, px: Math.round(px * 100) / 100, roh: m[0] });
        }
    }
    return treffer;
}

const DATEIEN = fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css'));

describe('Schriftboden: nichts unter 10 px', () => {
    for (const datei of DATEIEN) {
        it(`${datei} hat keine feste Größe unter 10 px`, () => {
            const treffer = kleineWerte(datei);
            assert.deepEqual(treffer, [],
                `${datei}: ${treffer.length} Deklaration(en) unter 10 px — `
                + treffer.map(t => `Zeile ${t.zeile}: ${t.roh} (${t.px}px)`).join('; '));
        });
    }
});

describe('Die Ausnahmen sind benannt, nicht vergessen', () => {
    for (const a of AUSNAHMEN) {
        it(`${a.klasse} steht weiterhin auf ${a.wert} — mit Begründung`, () => {
            const roh = fs.readFileSync(path.join(CSS_DIR, a.datei), 'utf8');
            const stelle = roh.indexOf(`.${a.klasse} {`);
            assert.ok(stelle > 0, `.${a.klasse} nicht gefunden in ${a.datei}`);
            const block = roh.slice(stelle, roh.indexOf('}', stelle));
            assert.ok(block.includes(a.wert),
                `.${a.klasse} steht nicht mehr auf ${a.wert} — wenn das Gitter `
                + 'umgebaut wurde, gehört der Eintrag aus AUSNAHMEN heraus');
            // Der Kommentar davor muss den Grund tragen, sonst ist es
            // in einem halben Jahr wieder nur eine kleine Zahl.
            const davor = roh.slice(Math.max(0, stelle - 1400), stelle + block.length);
            assert.match(davor, /ueberlauf|Ueberlauf|laeuft.*ueber/i,
                `die Ausnahme für .${a.klasse} trägt keine Begründung im Kommentar`);
        });
    }
});

describe('Der Token, auf den gehoben wurde, existiert', () => {
    it('--fs-xs ist definiert und mindestens 11 px', () => {
        const tokens = fs.readFileSync(path.join(CSS_DIR, 'tokens.css'), 'utf8');
        const m = tokens.match(/--fs-xs:\s*(\d+)px/);
        assert.ok(m, '--fs-xs fehlt in tokens.css');
        assert.ok(parseInt(m[1], 10) >= 11,
            `--fs-xs steht auf ${m[1]}px — der Boden wäre dann keiner`);
    });
});
