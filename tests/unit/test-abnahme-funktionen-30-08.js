'use strict';
/*
 * Zwei Knoepfe, die nichts taten — und drei Zahlen, die falsch standen.
 *
 * BEFUND 1 — "Bild generieren" war tot.
 *
 * js/app-meta-call.js rief in generateTournamentImage() die Funktion
 * `getPredictedField()` frei auf. Die gab es aber nur als EIGENSCHAFT
 * des Objekts, das das Modul zurueckgibt, nicht im Modul selbst. Auf
 * jeden Klick:
 *
 *     ReferenceError: getPredictedField is not defined
 *         at Object.generateTournamentImage (app-meta-call.js:11012)
 *
 * Es lag nicht an fehlenden Daten: window.DsShare.shareMetaCallPost war
 * da, und MetaCall.getPredictedField() lieferte im selben Moment 131
 * Eintraege. Es fehlte ein Wort.
 *
 * BEFUND 2 — der Archetyp "N's" liess sich nicht anklicken.
 *
 * js/app-city-league.js baute den Aufrufer mit
 *
 *     encodeURIComponent(JSON.stringify(d.variants || []))
 *
 * und setzte ihn in einen einfach-gequoteten JS-String.
 * encodeURIComponent kodiert den Apostroph NICHT. Ergebnis:
 *
 *     analyzeCombinedArchetype('n\'s', '%5B%22N's%20Zoroark%22%5D')
 *         -> SyntaxError: missing ) after argument list
 *
 * Gemessen ueber `new Function(code)` an allen Aufrufern der Tabelle:
 * 34 von 35 gueltig, einer kaputt — auf dem Schreibtisch UND bei
 * 390 px. js/app-tier-meta.js:879 macht es an derselben Stelle richtig
 * (escapeJsStr um encodeURIComponent); hier fehlte der zweite Schritt.
 *
 * BEFUND 3 — drei Kleinigkeiten aus derselben Runde:
 *   .mc-predictor-banner-stale stand im Dunkelmodus bei 4,07:1
 *     (--tint-bad-ink, um 15 % weggeblendet). Ohne die Deckkraft: 5,77:1.
 *   a.qu-verweis mass 130,7 x 19 px auf 390 px. Jetzt 45 px.
 *   chart.metaShareTitle stand in der DEUTSCHEN Fassung als
 *     "Meta Share Chart – Top Archetypen" da. "Share" bleibt (so redet
 *     die Szene, 14 weitere Stellen sagen es auch), "Chart" nicht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = q => q.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

describe('Bild generieren ruft eine Funktion, die es gibt', () => {
    const MC = ohneKomm(lies('js/app-meta-call.js'));

    it('die Rechnung steht einmal im Modul', () => {
        assert.ok(/function _prognostiziertesFeld\s*\(/.test(MC),
            '_prognostiziertesFeld() fehlt — dann ist die Rechnung wieder doppelt oder weg');
    });

    it('generateTournamentImage ruft sie auf, nicht die Objekteigenschaft', () => {
        const i = MC.indexOf('function generateTournamentImage');
        assert.notStrictEqual(i, -1);
        const koerper = MC.slice(i, MC.indexOf('\n  }', i));
        assert.ok(/_prognostiziertesFeld\(\)/.test(koerper),
            'generateTournamentImage benutzt _prognostiziertesFeld() nicht');
        assert.ok(!/[^.\w]getPredictedField\s*\(/.test(koerper),
            'der freie Aufruf von getPredictedField() ist wieder da — das ist ' +
            'genau der ReferenceError, um den es hier geht');
    });

    it('die Aussenschnittstelle reicht dieselbe Rechnung durch', () => {
        assert.ok(/getPredictedField:\s*_prognostiziertesFeld\s*,/.test(MC),
            'getPredictedField hat wieder eine eigene Kopie der Rechnung — ' +
            'dann koennen Knopf und Schnittstelle auseinander laufen');
    });

    it('nirgends im Modul steht ein freier Aufruf von getPredictedField', () => {
        const treffer = (MC.match(/[^.\w]getPredictedField\s*\(/g) || []);
        assert.deepStrictEqual(treffer, [],
            'freier Aufruf gefunden: ' + treffer.join(', '));
    });
});

describe('Archetypen mit Apostroph bleiben anklickbar', () => {
    const CL = ohneKomm(lies('js/app-city-league.js'));

    it('beide Tabellenzeilen entschaerfen den Wert fuer JS', () => {
        const treffer = CL.match(/const variantsJson = [\s\S]{0,140}?;/g) || [];
        assert.strictEqual(treffer.length, 2,
            'erwartet zwei Stellen, gefunden ' + treffer.length);
        for (const t of treffer) {
            assert.ok(/escapeJsStr\(/.test(t),
                'eine Stelle setzt encodeURIComponent ohne escapeJsStr in einen ' +
                'JS-String: ' + t.replace(/\s+/g, ' '));
        }
    });

    it('encodeURIComponent allein reicht nachweislich nicht', () => {
        // Die Gegenprobe, die den Befund ueberhaupt erst sichtbar gemacht
        // hat — hier als ausfuehrbarer Beleg, nicht als Behauptung.
        const escapeJsStr = v => String(v || '')
            .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
            .replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        const varianten = ["N's Zoroark", 'Dragapult'];
        const roh = encodeURIComponent(JSON.stringify(varianten));
        assert.ok(roh.includes("'"), 'encodeURIComponent kodiert den Apostroph ' +
            'inzwischen doch — dann ist dieser Test veraltet');

        const bauen = wert => "f('n\\'s', '" + wert + "')";
        assert.throws(() => new Function('f', bauen(roh)), SyntaxError,
            'ohne escapeJsStr muesste der Aufrufer zerbrechen');
        assert.doesNotThrow(() => new Function('f', bauen(escapeJsStr(roh))));

        // Und der Wert kommt heil an, nicht nur syntaktisch gueltig.
        let empfangen = null;
        new Function('f', bauen(escapeJsStr(roh)))(
            (a, b) => { empfangen = [a, JSON.parse(decodeURIComponent(b))]; });
        assert.deepStrictEqual(empfangen, ["n's", varianten]);
    });
});

describe('Die drei Kleinigkeiten aus derselben Runde', () => {
    it('der Alters-Hinweis wird nicht mehr weggeblendet', () => {
        const MC = ohneKomm(lies('js/app-meta-call.js'));
        const i = MC.indexOf('mc-predictor-banner-stale');
        assert.notStrictEqual(i, -1, 'der Hinweis ist weg');
        const zeile = MC.slice(MC.lastIndexOf('\n', i), MC.indexOf('\n', i));
        assert.ok(!/opacity\s*:\s*0\.85/.test(zeile),
            'opacity 0.85 ist wieder da — das waren 4,07:1 im Dunkelmodus');
        assert.ok(/color:\$\{color\}/.test(zeile), 'die Farbe kommt nicht mehr aus color');
    });

    it('der Verweis auf Quellen & Methodik ist tippbar', () => {
        const Q = ohneKomm(lies('css/quellen.css'));
        assert.ok(/@media \(pointer: coarse\)/.test(Q),
            'quellen.css kennt keine Regel fuer Tippgeraete');
        for (const pseudo of ['', ':link', ':visited', ':active']) {
            assert.ok(Q.includes('html a.qu-verweis' + pseudo),
                'a.qu-verweis' + pseudo + ' wird nicht gefasst');
        }
        assert.ok(/padding-block:\s*13px/.test(Q),
            'die Hoehe kommt nicht aus 13 px Innenabstand (13 + 19 + 13 = 45)');
    });

    it('die deutsche Ueberschrift des Meta-Diagramms ist deutsch', () => {
        const I = lies('js/i18n.js');
        const alle = [...I.matchAll(/'chart\.metaShareTitle':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(alle.length, 2, 'erwartet je einen Eintrag pro Sprache');
        const [en, de] = alle;
        assert.ok(/Archetypes/.test(en), 'der englische Eintrag steht nicht mehr vorn');
        assert.ok(!/Chart/.test(de),
            'die deutsche Ueberschrift traegt wieder "Chart": ' + de);
        assert.ok(/Share/.test(de),
            '"Share" ist das Szenewort und soll bleiben — 14 weitere Stellen sagen es auch');
    });
});
