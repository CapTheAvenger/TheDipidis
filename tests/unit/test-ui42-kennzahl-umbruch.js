/**
 * UI-42 (28.09.2026, Hausi, Video-Review 09:00–10:00 + Screenshot): auf den
 * Kacheln des gebauten Decks wurde die Kennzahl-Zeile („100,0% | Ø 1,02x“)
 * bei schmalerem Fenster abgeschnitten.
 *
 * Gemessen mit scripts/messe_deckkachel_abgeschnitten.py (lokal, Stand
 * 202609280908, Deck-Analyse Global): bei 1280 und 1920 px 26 von 26
 * Kacheln abgeschnitten (92–96 px Platz, 105 px Text); 390–1024 px 0.
 * Nach dem Umbau 320–1920 px: 0 von 26; Past Meta 0 von 27.
 *
 * Die Bedingung ist „passt nicht nebeneinander“ — dann bricht der Ø-Teil
 * als Ganzes in die zweite Zeile. Geprueft wird die Regel im Stilblatt
 * (ohne Kommentare) und dass der Zeichner zwei Teile liefert; die
 * Layoutmessung selbst braucht einen Browser und steht im Messwerkzeug.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function regeln(css, selektor) {
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(css))) {
        const sels = m[1].split(',').map(x => x.trim());
        if (sels.includes(selektor)) out.push(m[2]);
    }
    return out.join(';');
}

describe('UI-42 — die Kennzahl-Zeile bricht um statt abgeschnitten zu werden', () => {
    const CSS = ohneKommentare(R('css/styles.css'));

    it('das Band in der Knopfsaeule darf umbrechen und schneidet nicht ab', () => {
        const r = regeln(CSS, '.deck-card-actions > .deck-card-overlay');
        assert.match(r, /flex-wrap:\s*wrap/, 'kein Umbruch erlaubt');
        assert.match(r, /white-space:\s*normal/, 'white-space bleibt nowrap');
        assert.match(r, /overflow:\s*visible/, 'der Ueberstand wird weiter abgeschnitten');
        assert.doesNotMatch(r, /text-overflow:\s*ellipsis/);
    });

    it('jeder Teil bleibt beisammen', () => {
        assert.match(regeln(CSS, '.deck-card-overlay-teil'), /white-space:\s*nowrap/);
    });

    it('der Zeichner liefert Anteil und Ø als zwei Teile', () => {
        const JS = R('js/app-deck-builder.js');
        const a = JS.indexOf('const kennzahlTeile =');
        assert.ok(a > 0, 'kennzahlTeile fehlt');
        const zeile = JS.slice(a, JS.indexOf(';', a));
        assert.equal((zeile.match(/class="deck-card-overlay-teil"/g) || []).length, 2, zeile);
        assert.doesNotMatch(zeile, /\|\s*Ø/, 'wieder eine einzige Zeile mit „|“');
    });

    it('das Messwerkzeug liegt im Repo', () => {
        assert.ok(fs.existsSync(path.join(ROOT, 'scripts/messe_deckkachel_abgeschnitten.py')));
    });
});
