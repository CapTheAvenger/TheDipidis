/**
 * UI-41 (28.09.2026, Hausi, Video-Review): „die Daten, wenn wir sie auf der
 * Seite haben, reicht das völlig aus" — der CSV-Export aus UI-8 (7) kommt
 * seitenweit wieder raus.
 *
 * Gemessen vor dem Ausbau (live, Stand 202609280908): 28 CSV-Knöpfe im
 * Dokument, sichtbar 23 auf Aktuelles Meta, 3 im Meta Call, 2 in Japan.
 *
 * Was hier gilt: keine Seite lädt ein Skript, das eine Tabelle als
 * CSV-Datei zum Speichern anbietet. Geprüft an allen Skripten, die
 * index.html wirklich einbindet — ohne Kommentare, sonst hält die
 * Erklärung eines Ausbaus die Probe grün.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');

const INDEX = R('index.html');
const SKRIPTE = [...INDEX.matchAll(/<script src="(js\/[^"?]+)(?:\?[^"]*)?"/g)].map(m => m[1])
    .filter(d => !d.startsWith('js/vendor/'))    // Fremdcode, minifiziert
    .filter(d => fs.existsSync(path.join(ROOT, d)));   // firebase-credentials.js entsteht erst im Bau

describe('UI-41 — kein CSV-Export mehr', () => {
    it('index.html bindet Skripte ein (sonst waere die Probe leer)', () => {
        assert.ok(SKRIPTE.length > 40, `nur ${SKRIPTE.length} Skripte gefunden`);
    });

    it('kein eingebundenes Skript baut eine CSV-Datei zum Herunterladen', () => {
        const treffer = [];
        let summeRoh = 0, summeCode = 0;
        for (const datei of SKRIPTE) {
            const roh = R(datei);
            const code = ohneKommentare(roh);
            summeRoh += roh.length; summeCode += code.length;
            if (/text\/csv;charset/.test(code) || /ds-csv-knopf/.test(code) || /\bDsCsv\b/.test(code)) {
                treffer.push(datei);
            }
        }
        assert.ok(summeCode > summeRoh * 0.3, 'das Ausschneiden hat zu viel entfernt');
        assert.deepEqual(treffer, [], 'CSV-Export steckt noch in: ' + treffer.join(', '));
    });

    it('das Modul ist weg — aus der Seite, dem Service Worker und dem Stil', () => {
        assert.equal(fs.existsSync(path.join(ROOT, 'js/ds-csv.js')), false);
        assert.doesNotMatch(INDEX, /ds-csv/);
        assert.doesNotMatch(R('service-worker.js'), /ds-csv/);
        assert.doesNotMatch(ohneKommentare(R('css/components.css')), /\.ds-csv-/);
    });
});
