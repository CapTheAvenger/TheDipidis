'use strict';
/*
 * DER KOPF EINER KOPIERTEN DECKLISTE IST FORMAT, NICHT SPRACHE
 * ============================================================
 *
 * BEFUND (03.09.2026). Drei Stellen im Projekt legen eine Deckliste in
 * die Zwischenablage, und sie taten drei verschiedene Dinge:
 *
 *   js/app-features.js              "Pokémon:" / "Trainer:" / "Energy:",
 *                                   fest, mit dem Kommentar "Build PTCGL
 *                                   format" — richtig.
 *   js/app-current-meta-analysis.js dieselben drei, fest — richtig, sah
 *                                   aber wie eine vergessene Uebersetzung
 *                                   aus.
 *   js/app-city-league.js           t('cl.pokemon') / t('cl.trainer') /
 *                                   t('cl.energy') — auf der deutschen
 *                                   Oberflaeche also "Energie: 11".
 *
 * Die dritte Fassung sah nach der ordentlichen aus und war die falsche.
 * Die Meldung unter dem Knopf sagt "vor dem Import nachsehen"; ein
 * Import mit deutschem Kopf schlaegt fehl.
 *
 * AN DER QUELLE NACHGESEHEN, NICHT GERATEN
 * ----------------------------------------
 * limitlesstcg.com, Deckliste 22076, Knopf "Copy to Clipboard":
 *
 *   englische Ansicht -> "Pokémon: 15 / Trainer: 34 / Energy: 11"
 *   deutsche Ansicht  -> "Pokémon: 15 / Trainer: 34 / Energy: 11"
 *
 * Derselbe Kopf, obwohl die Kartennamen der Seite umgestellt waren. Der
 * Kopf gehoert zum Austauschformat und wird nicht lokalisiert.
 *
 * WAS HIER GEPRUEFT WIRD
 * ----------------------
 * Dass keine der Kopierstellen ihren Kopf durch die Sprachfunktion
 * schickt, und dass alle drei denselben Wortlaut schreiben. Die
 * i18n-Schluessel cl.pokemon / cl.trainer / cl.energy bleiben in
 * i18n.js stehen — Schluessel werden in diesem Projekt nicht entfernt,
 * und tests/e2e_i18n_language_purity.py fuehrt sie als erlaubte
 * englische Brocken.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (...teile) => fs.readFileSync(path.join(wurzel, ...teile), 'utf8');

// Die drei Stellen, die eine importierbare Liste bauen.
const KOPIERSTELLEN = [
    ['js/app-features.js',              'copyDeckToPTCGL / PTCGL-Ausgabe'],
    ['js/app-current-meta-analysis.js', 'copyCurrentMetaDeckOverview'],
    ['js/app-city-league.js',           'copyDeckOverview'],
];

// Der Kopf, den Limitless liefert. Genau diese drei Zeichenketten.
const KOPF = ['Pokémon:', 'Trainer:', 'Energy:'];

function ohneKommentare(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('Der Kopf einer kopierten Deckliste', () => {

    for (const [datei, was] of KOPIERSTELLEN) {
        it(`${was}: schreibt den englischen Kopf`, () => {
            const quelle = ohneKommentare(lies(datei));
            for (const kopf of KOPF) {
                assert.ok(quelle.includes(`'${kopf}'`) || quelle.includes(`\`${kopf}`)
                          || quelle.includes(`"${kopf}"`) || quelle.includes(`${kopf} $`),
                    `${datei} schreibt "${kopf}" nirgends — der Kopf einer `
                    + 'kopierten Liste ist Format, nicht Sprache');
            }
        });

        it(`${was}: schickt den Kopf nicht durch die Sprachfunktion`, () => {
            // Das ist die Zusicherung, die den Befund festhaelt. Ein Test,
            // der nur nach "Energy:" sucht, bliebe gruen, wenn jemand
            // DANEBEN wieder t('cl.energy') einbaut.
            const quelle = ohneKommentare(lies(datei));
            const treffer = quelle.match(/t\(\s*['"](?:cl|deck)\.(?:pokemon|trainer|energy)['"]\s*\)/g);
            assert.strictEqual(treffer, null,
                `${datei} uebersetzt den Kopf wieder: ${treffer && treffer.join(', ')} — `
                + 'auf Deutsch steht dann "Energie: 11" in der Zwischenablage, '
                + 'und der Import schlaegt fehl');
        });
    }

    it('alle drei Stellen schreiben denselben Wortlaut', () => {
        // Drei Formate fuer denselben Knopf sind zwei zu viel.
        for (const kopf of KOPF) {
            const treffer = KOPIERSTELLEN.filter(([datei]) =>
                ohneKommentare(lies(datei)).includes(kopf));
            assert.strictEqual(treffer.length, KOPIERSTELLEN.length,
                `"${kopf}" fehlt in: ` + KOPIERSTELLEN
                    .filter(([d]) => !ohneKommentare(lies(d)).includes(kopf))
                    .map(([d]) => d).join(', '));
        }
    });

    it('die i18n-Schluessel bleiben stehen', () => {
        // Sie werden nicht mehr fuer den Kopf benutzt, aber
        // tests/e2e_i18n_language_purity.py fuehrt sie namentlich, und
        // Schluessel werden in diesem Projekt nicht entfernt.
        const i18n = lies('js/i18n.js');
        for (const schluessel of ['cl.pokemon', 'cl.trainer', 'cl.energy']) {
            assert.ok(i18n.includes(`'${schluessel}'`),
                `${schluessel} wurde entfernt — Schluessel bleiben stehen, `
                + 'nur ihre Werte aendern sich');
        }
    });

    it('der deutsche Wert von cl.energy ist weiterhin "Energie:"', () => {
        // Gegenprobe zur Absicht: der Schluessel ist nicht heimlich auf
        // Englisch umgebogen worden, um den Test oben zu beruhigen. Er
        // wird schlicht nicht mehr fuer das Austauschformat benutzt.
        const i18n = lies('js/i18n.js');
        const stellen = [...i18n.matchAll(/'cl\.energy':\s*'([^']+)'/g)].map(m => m[1]);
        assert.ok(stellen.includes('Energie:'),
            'der deutsche Wert von cl.energy ist verschwunden — gefunden: '
            + JSON.stringify(stellen));
        assert.ok(stellen.includes('Energy:'),
            'der englische Wert von cl.energy ist verschwunden');
    });
});
