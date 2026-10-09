/**
 * Rutsch B (09.10.2026) — FE-64 und UI-134.
 *
 * FE-64 (Hausi 08./09.10.): in der Spielbox den gewuenschten Druck einer
 * Karte merken, OHNE dass sie als vorhanden zaehlt. Die Logik wird
 * ausgefuehrt (js/archetyp-box.js exportiert sie fuer Node).
 *
 * UI-134 (Hausi 09.10., Festlegung B geaendert): am Desktop stehen die
 * sechs Kurzwahl-Knoepfe direkt neben „The Dipidis“ statt rechts ueber der
 * Bluetenschicht; am Handy (bis 640 px) bleibt alles wie bisher.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const L = require('../../js/archetyp-box.js');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const QUELLE = ohneKommentare(fs.readFileSync(path.join(ROOT, 'js', 'archetyp-box.js'), 'utf8'));
const CSS = ohneKommentare(fs.readFileSync(path.join(ROOT, 'css', 'cards-header.css'), 'utf8'));

const kk = (set, nr, n) => ({ id: set + '-' + nr, name: 'Alolan Exeggutor', set, number: nr, gefordert: n, typ: 'Pokemon', refs: [] });
const ak = (liste) => liste.map((k) => ({ id: k.id, k: k, max: k.gefordert, boxen: 1 }));
const ART = { id: '30C-129', set: '30C', number: '129', bild: 'https://x/30C_129.png' };

describe('FE-64: Artwork festlegen zaehlt nicht als vorhanden', () => {
    const box = () => L.spielboxAbgleichen(ak([kk('30C', '2', 1)]), null, null, '2026-10-09').box;

    it('Artwork setzen: Status bleibt "fehlt", nichts liegt in der Box', () => {
        const b = L.artworkSetzen(box(), '30C-2', ART);
        const k = b.karten[0];
        assert.equal(k.status, 'fehlt');
        assert.equal(L.drin(k), 0);
        assert.deepEqual(JSON.parse(JSON.stringify(k.artwork)), ART);
    });

    it('zusammen mit den Mengen aus dem Dialog: Mengen unveraendert, Artwork dazu', () => {
        let b = L.druckeSetzen(box(), '30C-2', [{ id: '30C-2', set: '30C', number: '2', n: 1 }]);
        b = L.artworkSetzen(b, '30C-2', ART);
        assert.equal(L.drin(b.karten[0]), 1);
        assert.equal(b.karten[0].artwork.id, '30C-129');
    });

    it('zuruecknehmen entfernt das Feld ganz', () => {
        let b = L.artworkSetzen(box(), '30C-2', ART);
        b = L.artworkSetzen(b, '30C-2', null);
        assert.equal('artwork' in b.karten[0], false);
    });

    it('der automatische Abgleich der Spielbox verliert das Artwork nicht', () => {
        const erst = L.artworkSetzen(box(), '30C-2', ART);
        const r = L.spielboxAbgleichen(ak([kk('30C', '2', 2)]), erst, null, '2026-10-10');
        assert.equal(r.box.karten[0].artwork.id, '30C-129');
        // Auch beim Uebernehmen aus der alten Box „Spielbox Standard“ (vorlage)
        const neu = L.spielboxAbgleichen(ak([kk('30C', '2', 1)]), null, erst, '2026-10-10');
        assert.equal(neu.box.karten[0].artwork.id, '30C-129');
        assert.equal(neu.box.karten[0].status, 'fehlt');
    });

    it('Verdrahtung: „Übernehmen“ schreibt Mengen UND Artwork, die Kachel zeigt das Bild des Wunschdrucks', () => {
        assert.match(QUELLE, /artworkSetzen\(druckeSetzen\(b, z\.id, z\.liste\), z\.id, art\)/);
        assert.match(QUELLE, /ArchetypBox\._artwork\(/);
        assert.match(QUELLE, /const bildUrl = \(art && art\.bild\) \|\| k\.bild;/);
        assert.match(QUELLE, /abx\.artworkZeile/);
    });
});

describe('UI-134: Kurzwahl direkt neben „The Dipidis“ (Desktop)', () => {
    it('ab 641 px beginnt die Kopfzeile links, statt die Knoepfe nach rechts zu schieben', () => {
        const m = CSS.match(/@media \(min-width: 641px\) \{([\s\S]*?)\n\}/g) || [];
        const block = m.find((b) => /header-flex-row/.test(b)) || '';
        assert.match(block, /#main-content > \.cards-header \.header-flex-row \{[^}]*justify-content:\s*flex-start/,
            'die Kurzwahl stuende wieder rechts ueber der Bluetenschicht');
    });
    it('die Regel steht NACH der alten space-between-Regel (sonst gewinnt die alte)', () => {
        const alt = CSS.indexOf('justify-content: space-between;\n    flex-wrap: wrap;');
        const neu = CSS.indexOf('justify-content: flex-start');
        assert.ok(alt > 0 && neu > alt, 'Reihenfolge im Stylesheet stimmt nicht');
    });
    it('am Handy bleibt die Kurzwahl in der zweiten Zeile ueber die ganze Breite', () => {
        assert.match(CSS, /@media \(max-width: 640px\)[\s\S]*?\.header-flex-user \{\s*width: 100%;\s*justify-content: space-between;/);
    });
});
