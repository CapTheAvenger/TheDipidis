/**
 * Speichern der Bildkarte — der Weg in die Fotomediathek.
 *
 * Gemeldet am 28.08.2026 mit Bildschirmfoto vom iPhone: "wenn ich auf
 * Speichern druecke, dann wird's nicht immer in der Foto Mediathek
 * gespeichert."
 *
 * Der Grund liegt nicht am Bild, sondern am Weg: <a download> mit einer
 * Blob-Adresse landet auf iOS bestenfalls in "Dateien" — nie in Fotos.
 * Der einzige Weg vom Web in die Fotomediathek ist das Teilen-Blatt des
 * Systems (navigator.share mit einer Datei, dort "Bild sichern").
 *
 * Zwei Zusagen haelt diese Datei fest:
 *
 *  1. Auf iPhone/iPad geht das Bild ins Teilen-Blatt, auf dem Rechner in
 *     den Download. Ein Teilen-Blatt am Schreibtisch waere ein Umweg.
 *  2. Der Blob wird beim OEFFNEN gebaut, nicht erst beim Klick.
 *     navigator.share darf nur aus einer Nutzergeste laufen; wer erst im
 *     Klick mit dem asynchronen canvas.toBlob anfaengt, ruft share() nach
 *     dem Ende der Geste auf, und Safari lehnt mit NotAllowedError ab.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js', 'ds-bildvorschau.js'), 'utf8');

function schneide(kopf, bis) {
    const a = SRC.indexOf(kopf);
    assert.ok(a > -1, `Kopf nicht gefunden: ${kopf}`);
    const b = SRC.indexOf(bis, a);
    assert.ok(b > a, `Ende nicht gefunden: ${bis}`);
    return SRC.slice(a, b);
}

const TEIL = schneide('function istApfelTouch()', '    /**\n     * @param {HTMLCanvasElement}');

function bau(welt) {
    const spuren = { geteilt: [], geladen: [] };
    const attrappen = {
        navigator: welt.navigator,
        File: welt.File !== undefined ? welt.File
            : function File(teile, name, opt) { this.name = name; this.type = (opt || {}).type; },
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
        document: {
            createElement: () => ({
                click() { spuren.geladen.push(this.download); },
                set href(v) {}, get href() { return ''; },
                download: '',
            }),
            body: { appendChild: () => {}, removeChild: () => {} },
        },
        setTimeout: () => {},
    };
    attrappen.navigator.share = function (daten) {
        spuren.geteilt.push(daten);
        return welt.shareErgebnis || Promise.resolve();
    };
    const fabrik = new Function(...Object.keys(attrappen),
        TEIL + '\nreturn { speichern: speichern, istApfelTouch: istApfelTouch };');
    return { fn: fabrik(...Object.values(attrappen)), spuren };
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const IPAD   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const MAC    = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120';

const blob = { type: 'image/png' };

describe('Speichern der Bildkarte', () => {
    it('erkennt das iPhone', () => {
        const w = bau({ navigator: { userAgent: IPHONE, maxTouchPoints: 5, canShare: () => true } });
        assert.equal(w.fn.istApfelTouch(), true);
    });

    it('erkennt das iPad, das sich als Macintosh meldet', () => {
        // Seit iPadOS 13 steht "Macintosh" im User-Agent; die
        // Beruehrungspunkte sind das einzige verbliebene Merkmal.
        const w = bau({ navigator: { userAgent: IPAD, maxTouchPoints: 5, canShare: () => true } });
        assert.equal(w.fn.istApfelTouch(), true);
    });

    it('haelt den Rechner nicht faelschlich fuer ein iPad', () => {
        const w = bau({ navigator: { userAgent: MAC, maxTouchPoints: 0, canShare: () => true } });
        assert.equal(w.fn.istApfelTouch(), false);
    });

    it('gibt das Bild auf dem iPhone ins Teilen-Blatt', async () => {
        const w = bau({ navigator: { userAgent: IPHONE, maxTouchPoints: 5, canShare: () => true } });
        const erledigt = await w.fn.speichern(blob, 'staples.png');
        assert.equal(w.spuren.geteilt.length, 1, 'nicht geteilt');
        assert.equal(w.spuren.geladen.length, 0, 'trotzdem heruntergeladen');
        assert.equal(w.spuren.geteilt[0].files[0].name, 'staples.png');
        assert.equal(erledigt, true);
    });

    it('laedt auf dem Rechner herunter, statt ein Teilen-Blatt zu oeffnen', async () => {
        const w = bau({ navigator: { userAgent: MAC, maxTouchPoints: 0, canShare: () => true } });
        await w.fn.speichern(blob, 'staples.png');
        assert.equal(w.spuren.geteilt.length, 0, 'am Schreibtisch ein Teilen-Blatt geoeffnet');
        assert.deepEqual(w.spuren.geladen, ['staples.png']);
    });

    it('faellt auf den Download zurueck, wenn das Geraet keine Dateien teilen kann', async () => {
        const w = bau({ navigator: { userAgent: IPHONE, maxTouchPoints: 5, canShare: () => false } });
        await w.fn.speichern(blob, 'staples.png');
        assert.equal(w.spuren.geteilt.length, 0);
        assert.deepEqual(w.spuren.geladen, ['staples.png']);
    });

    it('laesst das Fenster offen, wenn das Teilen-Blatt abgebrochen wird', async () => {
        const abbruch = Object.assign(new Error('abgebrochen'), { name: 'AbortError' });
        const w = bau({
            navigator: { userAgent: IPHONE, maxTouchPoints: 5, canShare: () => true },
            shareErgebnis: Promise.reject(abbruch),
        });
        const erledigt = await w.fn.speichern(blob, 'staples.png');
        assert.equal(erledigt, false, 'das Fenster wuerde nach einem Abbruch zugehen');
        assert.equal(w.spuren.geladen.length, 0, 'nach dem Abbruch trotzdem heruntergeladen');
    });

    it('faellt auf den Download zurueck, wenn das Teilen anders scheitert', async () => {
        const w = bau({
            navigator: { userAgent: IPHONE, maxTouchPoints: 5, canShare: () => true },
            shareErgebnis: Promise.reject(new Error('kaputt')),
        });
        const erledigt = await w.fn.speichern(blob, 'staples.png');
        assert.deepEqual(w.spuren.geladen, ['staples.png']);
        assert.equal(erledigt, true);
    });
});

describe('der Blob liegt vor dem Klick bereit', () => {
    it('wird beim Oeffnen gebaut, nicht erst im Klick', () => {
        // Sonst laeuft navigator.share ausserhalb der Nutzergeste.
        // Genau gemessen zwischen dem Einhaengen des Fensters und der
        // Hilfsfunktion mitBlob: dort muss die Umwandlung schon laufen.
        // Nur "irgendwo vor dem Promise" wuerde auch das toBlob INNERHALB
        // von mitBlob mitzaehlen — und das laeuft erst im Klick.
        const a = SRC.indexOf('document.body.appendChild(modal);');
        const b = SRC.indexOf('function mitBlob(', a);
        assert.ok(a > -1 && b > a, 'mitBlob steht nicht nach dem Einhaengen');
        assert.match(SRC.slice(a, b), /canvas\.toBlob\(/,
            'der Blob wird nicht schon beim Oeffnen gebaut');
    });

    it('der Speichern-Knopf greift auf den fertigen Blob zu', () => {
        const a = SRC.indexOf("'.ds-bildvorschau-btn-download'");
        const b = SRC.indexOf('var teilen =', a);
        assert.ok(a > -1 && b > a);
        const block = SRC.slice(a, b);
        assert.match(block, /mitBlob\(/, 'der Knopf baut den Blob selbst');
        assert.ok(!/canvas\.toBlob\(/.test(block),
            'im Klick wird noch einmal asynchron umgewandelt');
    });
});
