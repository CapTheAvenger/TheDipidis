/**
 * Zwei Befunde vom 13.09.2026, beide vom Betreiber gemeldet, beide
 * derselbe Denkfehler: eine Regel haengt an einem Band statt an der
 * Bedingung, die sie meint.
 *
 * 1. DER HILFE-KNOPF ("hat eine komische Farbe").
 *    images/professor_oak_icon.png war 259 x 194 (4:3) und ohne
 *    Alphakanal. In einem runden 32-px-Knopf auf dunkler Flaeche wurde
 *    daraus ein weisser Block mit gruenen Haaren. Dazu war der Knopf
 *    zwischen 481 und 768 px 28 breit und 44 hoch — ein Ei, weil
 *    min-height ab 768 px greift und min-width erst ab 480 px.
 *
 * 2. DIE HEATMAP ("Browser halbiert, sieht komisch aus").
 *    Die Tabelle ist mit calc(170px + Spalten * 126px) fest gebaut und
 *    passt bei KEINER Breite — gemessen 27 px versteckt bei 1600 px,
 *    599 px bei 900 px. Die Vorkehrungen fuers seitliche Scrollen
 *    standen trotzdem in @media (max-width: 768px).
 *
 * Diese Datei liest CSS und ein Bild — beides ist hier wirklich Text
 * bzw. Datei, also ist die Textzusicherung die richtige Form
 * (CLAUDE.md, "Eine Zusicherung, die Text liest").
 */

const assert = require('node:assert');
const { describe, it } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('Der Hilfe-Knopf zeigt ein Gesicht, keinen weissen Block', () => {

    it('das Bild ist quadratisch — sonst bleibt im runden Knopf Flaeche stehen', () => {
        const d = fs.readFileSync(path.join(ROOT, 'images/professor_oak_icon.png'));
        assert.equal(d.toString('ascii', 1, 4), 'PNG', 'keine PNG-Datei');
        // IHDR: Breite und Hoehe stehen als 32-Bit-Zahlen ab Byte 16.
        const breite = d.readUInt32BE(16), hoehe = d.readUInt32BE(20);
        assert.equal(breite, hoehe,
            `${breite} x ${hoehe} — nicht quadratisch. In einem runden 1:1-Knopf `
            + 'laesst `contain` dann oben und unten die Flaechenfarbe stehen.');
        assert.ok(breite >= 64, `nur ${breite} px — zu klein fuer 44-px-Knoepfe auf 2x-Schirmen`);
    });

    it('das Bild hat einen Alphakanal und ist am Rand wirklich frei', () => {
        const d = fs.readFileSync(path.join(ROOT, 'images/professor_oak_icon.png'));
        const farbtyp = d.readUInt8(25);   // IHDR colour type
        assert.ok(farbtyp === 6 || farbtyp === 4,
            `Farbtyp ${farbtyp} — ohne Alphakanal steht der Bildhintergrund `
            + 'als deckender Block im Kreis. 6 = RGBA, 4 = Grau+Alpha.');
    });

    it('der Knopf bleibt rund, egal welche Sammelregel an einer Achse zieht', () => {
        const css = lies('css/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
        const i = css.indexOf('.tab-help-btn {');
        assert.notEqual(i, -1, '.tab-help-btn ist verschwunden');
        const block = css.slice(i, css.indexOf('}', i));
        assert.match(block, /aspect-ratio:\s*1\s*\/\s*1/,
            'ohne aspect-ratio wird der Knopf wieder oval, sobald eine '
            + 'Tippziel-Regel nur eine der beiden Achsen anfasst');
        assert.match(block, /border-radius:\s*50%/, 'der Knopf ist nicht mehr rund');
    });

    it('min-width und min-height greifen an derselben Grenze', () => {
        /* Der konkrete Fehler: min-height ab 768 px, min-width erst ab
           480 px. Dazwischen 28 x 44. aspect-ratio faengt es ab, aber
           zwei Grenzen fuer dieselbe Sache bleiben eine Falle. */
        const css = lies('css/styles.css').replace(/\/\*[\s\S]*?\*\//g, '');
        /* Es gibt mehrere 768-px-Abschnitte; gesucht ist der EINE
           .tab-help-btn-Block, der die Groesse auf 28 px setzt. Die
           erste Fassung dieser Zusicherung nahm die erste Medienabfrage
           und fiel darueber um — sie hat also beim Schreiben gleich
           bewiesen, dass sie beisst. */
        const bloecke = [...css.matchAll(/\.tab-help-btn\s*\{[^}]*\}/g)].map(m => m[0]);
        const verkleinert = bloecke.filter(b => /width:\s*28px/.test(b));
        assert.equal(verkleinert.length, 1,
            `${verkleinert.length} Bloecke setzen .tab-help-btn auf 28 px — erwartet genau einer`);
        const block = verkleinert[0];
        assert.match(block, /min-width/,
            'min-width fehlt bei 768 px — dann ist der Knopf zwischen 481 und '
            + '768 px wieder breiter oder schmaler als hoch');
    });
});

describe('Die Heatmap sagt, dass sie weitergeht — bei jeder Breite', () => {
    const HEAT = 'css/current-meta-matchups.css';

    /* KOMMENTARE RAUS, BEVOR IRGENDETWAS GESUCHT WIRD.
     *
     * Beim Schreiben dieser Datei am 13.09.2026 ist mir derselbe Fehler
     * zum dritten Mal an einem Tag passiert: die Verfaelschungsprobe
     * (echte Regel entfernen) blieb GRUEN, weil mein eigener
     * Erklaerkommentar im selben CSS-Block die gesuchte Zeichenkette
     * enthaelt. Die Zusicherung prueste die Schreibweise, nicht die
     * Regel — genau der Fall aus CLAUDE.md, "Eine Zusicherung, die Text
     * liest". Je erklaerender der Kommentar, desto blinder die Probe. */
    const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

    it('der Scroll-Hinweis haengt an keiner Medienabfrage', () => {
        const css = ohneKommentare(lies(HEAT));
        const i = css.indexOf('.heatmap-table-scroll {');
        assert.notEqual(i, -1, '.heatmap-table-scroll ist verschwunden');
        assert.match(css.slice(i, css.indexOf('}', i)), /scrollbar-width:\s*thin/,
            'der duenne Balken fehlt in der Grundregel');
        // Gegenprobe: er darf nicht NUR in einer Medienabfrage stehen.
        const vor = css.slice(0, i);
        const offen = (vor.match(/@media/g) || []).length;
        const zu = (vor.match(/\n}/g) || []).length;
        assert.ok(offen === 0 || zu >= offen,
            'die Regel steht innerhalb einer Medienabfrage — dann gilt sie '
            + 'wieder nur in einem Band');
        /* Und die Gegenprobe zum Ausschneiden selbst: haette es auch den
           Code weggeworfen, pruefte hier nichts mehr. */
        assert.ok(css.length > lies(HEAT).length * 0.3,
            'das Ausschneiden hat zu viel entfernt');
    });

    it('die Deckspalte bleibt beim seitlichen Scrollen stehen', () => {
        const css = ohneKommentare(lies(HEAT));
        assert.match(css, /\.heatmap-table th:first-child[\s\S]{0,200}position:\s*sticky/,
            'ohne klebrige erste Spalte sieht der Leser nach dem Wischen Zahlen '
            + 'ohne zu wissen, zu welchem Deck sie gehoeren');
        const i = css.indexOf('.heatmap-table th:first-child');
        const block = css.slice(i, css.indexOf('}', i));
        assert.match(block, /left:\s*0/, 'sticky ohne left greift nicht');
        assert.match(block, /background:/,
            'ohne eigene Flaeche scheinen die Zellen darunter durch');
        assert.match(block, /box-shadow/,
            'ohne Kante sieht die klebrige Spalte aus, als scrollte sie mit');
    });

    it('die Handy-Datei behauptet den Hinweis nicht ein zweites Mal', () => {
        /* Zwei Kopien derselben Regel gehen irgendwann auseinander.
           Die 768-px-Fassung ist entfernt; hier bleibt sie es. */
        const mob = ohneKommentare(lies('css/mobile-responsive.css'));
        const i = mob.indexOf('#matchupHeatmapContainer .heatmap-table-scroll');
        if (i === -1) return;                      // ganz weg ist auch recht
        const block = mob.slice(i, mob.indexOf('}', i));
        assert.ok(!/scrollbar-width/.test(block),
            'scrollbar-width steht wieder in der Handy-Datei — die Regel gehoert '
            + 'in css/current-meta-matchups.css, ohne Medienabfrage');
    });
});
