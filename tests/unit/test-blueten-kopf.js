/**
 * Die Kirschblüten im Kopfbereich.
 *
 * Der Betreiber am 27.08.2026: "wär's denn cool, wenn wir die Blüten
 * auch auf der Webseite zeigen", und am 28.08.: "da können wir erstmal
 * anfangen mit den Blüten nur oben, wobei ich es vielleicht punktuell
 * ganz cool finden würde, wenn hier und da über die Seite auch mal ein
 * paar auftauchen."
 *
 * Es sind dieselben Blüten wie im Logo und auf den Instagram-Posten —
 * wer über Instagram kommt, soll dieselbe Seite wiedererkennen.
 *
 * Zwei Dinge hält diese Datei fest:
 *
 *  1. Die Blüten liegen HINTER dem Inhalt und nehmen keine Klicks an.
 *     Eine Zierschicht, die über einer Zahl oder einem Knopf liegt,
 *     ist kein Zierrat mehr, sondern ein Fehler.
 *  2. Jede Datei, auf die verwiesen wird, liegt auch im Repository.
 *     Ein fehlendes Bild fällt im Kopfbereich sonst niemandem auf —
 *     es ist ja nur Zierrat, und genau deshalb schaut keiner hin.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT   = path.join(__dirname, '..', '..');
const HEADER = fs.readFileSync(path.join(ROOT, 'css', 'cards-header.css'), 'utf8');

/** Der ::after-Block der Kopfleiste, ohne die Medienabfrage darunter. */
function bluetenBlock(quelle) {
    // Mit der oeffnenden Klammer suchen: der Name steht auch in einem
    // Kommentar darueber ("siehe .cards-header::after"), und ohne die
    // Klammer beginnt der Schnitt mitten im Kommentar.
    const start = quelle.indexOf('.cards-header::after {');
    assert.notEqual(start, -1, 'die Blütenschicht ist nicht mehr da');
    return quelle.slice(start, quelle.indexOf('}', start) + 1);
}

const BLOCK = bluetenBlock(HEADER);

describe('Blüten im Kopf: sie liegen hinter dem Inhalt', () => {
    it('die Schicht nimmt keine Klicks an', () => {
        assert.match(BLOCK, /pointer-events:\s*none/);
    });

    it('sie liegt auf z-index 0, der Inhalt darüber auf 1', () => {
        assert.match(BLOCK, /z-index:\s*0/);
        assert.match(HEADER, /\.cards-header > \* \{[^}]*z-index:\s*1/);
        assert.match(HEADER, /\.cards-header > \* \{[^}]*position:\s*relative/);
    });

    it('die Kopfleiste traegt die Schicht, schneidet sie aber NICHT ab', () => {
        /* DIESE ZUSAGE STAND BIS ZUM 02.09.2026 AUF DEM KOPF.
         *
         * Sie forderte `overflow: hidden` auf `.cards-header` — genau das,
         * was am 29.08. das Pokeball-Menue unbrauchbar gemacht hatte: der
         * Kopf ist 97 px hoch, das Menue haengt als absolut positioniertes
         * Kind darin, ist 689 px hoch und beginnt bei y=102. **674 seiner
         * 689 Pixel wurden weggeschnitten.** Der Klick oeffnete das Menue
         * korrekt, sichtbar blieb ein 15-Pixel-Streifen; fuer den Nutzer
         * sah es aus, als passiere nichts. Auf dem Telefon ist der
         * Pokeball der einzige Weg zu fuenf Bereichen.
         *
         * Gruen war die Zusage nur durch einen Zufall: der Ausschnitt
         * endete am ersten `}` nach `.cards-header {`, das liegt aber
         * INNERHALB des Kommentars, und dort steht die Zeichenfolge
         * "overflow: hidden" — im Satz "KEIN overflow: hidden". Der Test
         * las seine eigene Begruendung als Erfuellung.
         *
         * Deshalb wird jetzt (a) am Kommentar vorbei geschnitten und
         * (b) das Gegenteil zugesichert. */
        const nurCode = HEADER.replace(/\/\*[\s\S]*?\*\//g, ' ');
        const i = nurCode.indexOf('.cards-header {');
        assert.ok(i >= 0, '.cards-header ist verschwunden');
        const kopf = nurCode.slice(i, nurCode.indexOf('}', i));
        assert.match(kopf, /position:\s*relative/,
            'ohne position: relative haengt die Bluetenschicht nicht mehr '
            + 'am Kopf');
        assert.ok(!/overflow:\s*hidden/.test(kopf),
            'overflow: hidden ist auf .cards-header zurueck — das schneidet '
            + 'das Pokeball-Menue auf 15 von 689 Pixeln zusammen und macht '
            + 'auf dem Telefon fuenf Bereiche unerreichbar');
        assert.match(kopf, /overflow:\s*visible/,
            'die Freigabe steht nicht mehr ausdruecklich da — ohne sie erbt '
            + 'der Kopf womoeglich wieder einen Beschnitt');

        // Beschnitten wird die Zierschicht, und zwar von sich selbst.
        const j = nurCode.indexOf('.cards-header::after');
        assert.ok(j >= 0, '.cards-header::after ist verschwunden');
        const schicht = nurCode.slice(j, nurCode.indexOf('}', j));
        assert.match(schicht, /overflow:\s*hidden/,
            'die Bluetenschicht beschneidet sich nicht mehr selbst — dann '
            + 'laeuft sie ueber die runden Ecken des Kopfes');
        assert.match(schicht, /border-radius:\s*inherit/,
            'ohne border-radius: inherit passt der Beschnitt nicht zu den '
            + 'Ecken des Kopfes');
    });

    it('sie ist durchscheinend, nicht deckend', () => {
        const m = BLOCK.match(/opacity:\s*([\d.]+)/);
        assert.ok(m, 'keine Deckung gesetzt');
        const deckung = Number(m[1]);
        assert.ok(deckung > 0 && deckung < 1,
            `Deckung ${deckung} — bei 1 steht die Zierschicht in Konkurrenz zur Überschrift`);
    });
});

describe('Blüten im Kopf: jede Datei gibt es wirklich', () => {
    const pfade = [...HEADER.matchAll(/url\('\.\.\/(images\/marke\/[a-z0-9_-]+\.webp)'\)/g)]
        .map(m => m[1]);

    it('es werden ueberhaupt Blueten eingebunden', () => {
        assert.ok(pfade.length >= 2, `nur ${pfade.length} Blütenbilder eingebunden`);
    });

    it('jede eingebundene Datei liegt im Repository', () => {
        const fehlen = [...new Set(pfade)].filter(p => !fs.existsSync(path.join(ROOT, p)));
        assert.deepEqual(fehlen, [], 'diese Bilder werden eingebunden, gibt es aber nicht');
    });

    it('sie sind klein genug, um im Kopf nichts aufzuhalten', () => {
        [...new Set(pfade)].forEach(p => {
            const kb = fs.statSync(path.join(ROOT, p)).size / 1024;
            assert.ok(kb < 40, `${p} ist ${kb.toFixed(0)} kB — zu schwer für Zierrat`);
        });
    });
});

describe('Blüten im Kopf: auf dem Telefon weniger', () => {
    it('es gibt eine eigene, sparsamere Lage unter 768px', () => {
        // Die zweite Nennung von .cards-header::after steht in der
        // Medienabfrage. Von dort bis zu ihrer schliessenden Klammer.
        const erste  = HEADER.indexOf('.cards-header::after {');
        const zweite = HEADER.indexOf('.cards-header::after {', erste + 10);
        assert.notEqual(zweite, -1, 'es gibt keine zweite Lage fuer das Telefon');
        const mq = HEADER.lastIndexOf('@media', zweite);
        assert.notEqual(mq, -1, 'die zweite Lage steht in keiner Medienabfrage');
        assert.match(HEADER.slice(mq, zweite), /max-width:\s*768px/);
        const block = HEADER.slice(zweite, HEADER.indexOf('}', HEADER.indexOf('background-size', zweite)) + 1);
        assert.match(block, /\.cards-header::after/);
        const desktop = (BLOCK.match(/images\/marke\//g) || []).length;
        const mobil   = (block.match(/images\/marke\//g) || []).length;
        assert.ok(mobil < desktop,
            `auf dem Telefon liegen ${mobil} Blüten, auf dem Schreibtisch ${desktop} — ` +
            'der gestapelte Kopf verträgt nicht dieselbe Menge');
    });
});
