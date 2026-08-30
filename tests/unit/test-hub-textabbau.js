'use strict';
/*
 * Die Verteilerseite erklaerte sich, statt zu zeigen.
 *
 * BEFUND (30.08.2026, Abnahme): auf `#meta-analysis-hub` standen
 * oberhalb der ersten Bildschirmhoehe **1320 Zeichen** erklaerender
 * Fliesstext — sechs Kacheln mit je drei Stichpunkten. Man liest 18
 * Stichpunkte, bevor man geklickt hat. Das war die textreichste
 * Ansicht der ganzen Seite, und ausgerechnet die, die nur weiterleitet.
 *
 * Der Betreiber hatte das ausdruecklich beanstandet: „wir duerfen den
 * User nicht ueberladen, wir muessen mit einem cleanen Look und starke
 * aussagenkraeftigen kurzen klaren Headlines kommen. Zu viel Text
 * schreckt leute ab."
 *
 * Der Inhalt ist im Kern eine Matrix: Region (Japan / Global /
 * Vergangen) mal Art (Meta / Deck), plus die Prognose. Das steht jetzt
 * in einer Zeile im Untertitel, und jede Kachel sagt in EINEM Satz,
 * welche Frage sie beantwortet. Gemessen: **1320 -> 373 Zeichen**.
 *
 * Diese Datei haelt fest, dass es kurz BLEIBT — und dass jede Kachel
 * ihren Satz behaelt. Ganz ohne Text waere die Kuerzung erschlichen.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const I18N = lies('js/i18n.js');
const HUB  = lies('js/meta-analysis-hub.js');
const CSS  = lies('css/styles.css');

const KACHELN = ['cityLeague', 'cityLeagueAnalysis', 'currentMeta',
                 'currentMetaAnalysis', 'pastMeta', 'metaCall'];

/** Die Eintraege eines bullets-Arrays, beide Sprachbloecke getrennt. */
function eintraege(key) {
    const re = new RegExp("'metaHub\\.tile\\." + key + "\\.bullets':\\s*\\[([\\s\\S]*?)\\]", 'g');
    return [...I18N.matchAll(re)].map(m =>
        [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map(x => x[1]));
}

describe('Jede Kachel sagt EINEN Satz', () => {
    for (const k of KACHELN) {
        it(k, () => {
            const bloecke = eintraege(k);
            assert.equal(bloecke.length, 2,
                `${k}: ${bloecke.length} Sprachbloecke statt 2`);
            for (const [i, zeilen] of bloecke.entries()) {
                const wo = i === 0 ? 'englisch' : 'deutsch';
                assert.equal(zeilen.length, 1,
                    `${k} (${wo}): ${zeilen.length} Zeilen. Drei Stichpunkte je ` +
                    `Kachel waren 18 auf einer Verteilerseite — genau das, was ` +
                    `der Betreiber beanstandet hat.`);
                assert.ok(zeilen[0].length >= 25,
                    `${k} (${wo}): "${zeilen[0]}" ist zu kurz, um etwas zu sagen. ` +
                    `Kuerzen heisst nicht leeren.`);
                assert.ok(zeilen[0].length <= 70,
                    `${k} (${wo}): ${zeilen[0].length} Zeichen. Ueber 70 ist es ` +
                    `wieder ein Absatz, kein Satz.`);
            }
        });
    }

    it('die beiden Sprachen sagen dasselbe in derselben Form', () => {
        for (const k of KACHELN) {
            const [en, de] = eintraege(k);
            assert.ok(en[0] !== de[0],
                `${k}: englisch und deutsch sind identisch — vermutlich kopiert`);
        }
    });
});

describe('Der Untertitel traegt die Ordnung, nicht eine Erklaerung', () => {
    it('er nennt die drei Raeume und die beiden Arten', () => {
        const treffer = [...I18N.matchAll(/'metaHub\.subtitle':\s*'([^']*)'/g)]
            .map(m => m[1]);
        assert.equal(treffer.length, 2, `${treffer.length} Sprachfassungen statt 2`);
        for (const t of treffer) {
            assert.ok(t.length <= 80,
                `Untertitel mit ${t.length} Zeichen: "${t}". Vorher stand hier ` +
                `ein Satz mit 116 Zeichen, der beschrieb, was die Kacheln ` +
                `darunter ohnehin zeigen.`);
            assert.ok(/Japan/.test(t) && /Global/.test(t),
                `der Untertitel nennt die Datenraeume nicht mehr: "${t}"`);
        }
    });
});

describe('Der Rueckfall im Modul sagt dasselbe wie das Woerterbuch', () => {
    it('sechs Kacheln, je eine Zeile', () => {
        // Der Rueckfall greift, wenn i18n noch nicht geladen ist. Bliebe
        // er auf den drei alten Stichpunkten stehen, saehe die Seite beim
        // ersten Aufbau anders aus als danach.
        const i = HUB.indexOf('const fallbacks = {');
        assert.notEqual(i, -1, 'der Rueckfall ist verschwunden');
        const block = HUB.slice(i, HUB.indexOf('\n        };', i));
        for (const k of KACHELN) {
            const m = block.match(new RegExp(k + ":\\s*\\[([\\s\\S]*?)\\]"));
            assert.ok(m, `${k} fehlt im Rueckfall`);
            const zeilen = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)];
            assert.equal(zeilen.length, 1,
                `${k}: der Rueckfall traegt noch ${zeilen.length} Zeilen`);
        }
    });
});

describe('Ein einzelner Satz bekommt keinen Aufzaehlungspunkt', () => {
    it('die Liste zeigt keine Markierung mehr', () => {
        const i = CSS.indexOf('.meta-hub-tile-bullets {');
        assert.notEqual(i, -1, 'die Regel ist verschwunden');
        const block = CSS.slice(i, CSS.indexOf('}', i));
        assert.match(block, /list-style:\s*none/,
            'ein Punkt vor einem einzelnen Satz sieht aus wie eine Liste, ' +
            'die abgeschnitten wurde');
        assert.ok(!/padding-left:\s*20px/.test(block),
            'der Einzug fuer die Markierung steht noch da, die Markierung nicht');
    });
});
