'use strict';
/*
 * Die stille Rueckfallebene: englischer Text fuer deutsche Nutzer.
 *
 * BEFUND (29.08.2026, im angemeldeten Chrome auf thedipidis.app
 * gemessen): battleJournalText(), cbText() und mbText() nehmen einen
 * zweiten Parameter als Vorgabewert — und der ist ueberall ENGLISCH:
 *
 *     battleJournalText('bj.addMatch', 'Add match')
 *
 * Fehlt der Schluessel, faellt die Funktion darauf zurueck. Kein
 * Fehler, keine Meldung, kein roher Schluessel auf dem Bildschirm —
 * der deutsche Nutzer bekommt einfach "Add match", "Delete this match
 * entry?", "Image saved!". Genau deshalb ist es lange niemandem
 * aufgefallen, und genau deshalb sieht es der E2E-Sprachreinheitstest
 * nicht: er oeffnet die betroffenen Dialoge nicht, und selbst dort
 * waere der Text gueltiges Englisch, kein Schluessel.
 *
 * 14 Schluessel fehlten, elf davon im Bearbeiten-Fluss des Battle
 * Journals — ein Weg, den derselbe Nutzer oft laeuft.
 *
 * Diese Datei prueft nicht eine Liste von Namen, sondern das MUSTER:
 * jeder Aufruf mit Vorgabewert muss seinen Eintrag haben. Neue
 * Aufrufe sind damit automatisch abgedeckt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = p => fs.readFileSync(path.join(wurzel, p), 'utf8');
const I18N = lies('js/i18n.js');

// Welche Hilfsfunktion steht in welcher Datei.
const QUELLEN = [
    ['js/battle-journal.js', 'battleJournalText'],
    ['js/custom-binder.js', 'cbText'],
    ['js/meta-binder.js', 'mbText'],
];

function aufrufeMitVorgabe(datei, fn) {
    const s = lies(datei);
    // fn('schluessel', 'englischer Vorgabewert')
    const re = new RegExp(fn + "\\(\\s*'([a-zA-Z0-9_.]+)'\\s*,", 'g');
    const raus = new Set();
    for (const m of s.matchAll(re)) raus.add(m[1]);
    return raus;
}

function anzahlInTabelle(key) {
    return (I18N.match(new RegExp("'" + key.replace(/\./g, '\\.') + "':", 'g')) || []).length;
}

describe('Jeder Aufruf mit englischem Vorgabewert hat seinen Eintrag', () => {
    for (const [datei, fn] of QUELLEN) {
        it(`${fn} in ${path.basename(datei)}`, () => {
            const keys = [...aufrufeMitVorgabe(datei, fn)];
            assert.ok(keys.length >= 5,
                `nur ${keys.length} Aufrufe erkannt — die Erkennung greift nicht mehr, ` +
                `und dann winkt diese Zusage alles durch`);
            const fehlen = keys
                .map(k => [k, anzahlInTabelle(k)])
                .filter(([, n]) => n !== 2)
                .map(([k, n]) => `${k} (${n}x statt 2x)`);
            assert.deepEqual(fehlen, [],
                `ohne Eintrag sieht der deutsche Nutzer den englischen ` +
                `Vorgabewert — ohne jede Fehlermeldung:\n  ` + fehlen.join('\n  '));
        });
    }
});

describe('Die vierzehn Nachzuegler bleiben zweisprachig', () => {
    // Namentlich, damit ein Rueckbau nicht nur "irgendwo" auffaellt.
    const NACHGETRAGEN = [
        'bj.addMatch', 'bj.editEntry', 'bj.deleteEntry', 'bj.imageSaved',
        'bj.editNameRequired', 'bj.editError', 'bj.editSaved',
        'bj.editDeckRequired', 'bj.editEntrySaved', 'bj.deleteEntryConfirm',
        'bj.entryDeleted', 'mb.newThisWeek', 'mb.printsBtnLabel', 'mb.buildError',
    ];

    it('alle vierzehn stehen in beiden Sprachbloecken', () => {
        const fehlen = NACHGETRAGEN.filter(k => anzahlInTabelle(k) !== 2);
        assert.deepEqual(fehlen, [], `fehlen wieder: ${fehlen.join(', ')}`);
    });

    it('der deutsche Wert ist nicht der englische geblieben', () => {
        // Ein kopierter englischer Wert waere derselbe Fehler mit
        // einem Eintrag davor. Diese Schluessel sind alle echte Saetze
        // oder Woerter, die sich uebersetzen lassen — anders als
        // "Standard" oder "Tie", wo Gleichheit gewollt ist.
        const gleich = [];
        for (const k of NACHGETRAGEN) {
            const treffer = [...I18N.matchAll(
                new RegExp("'" + k.replace(/\./g, '\\.') + "':\\s*'([^']*)'", 'g'))]
                .map(m => m[1]);
            if (treffer.length === 2 && treffer[0] === treffer[1]) gleich.push(k);
        }
        assert.deepEqual(gleich, [],
            `deutsch und englisch identisch — vermutlich nur kopiert: ${gleich.join(', ')}`);
    });
});

describe('Das Matchup-Modal ist nicht mehr halbdeutsch verdrahtet', () => {
    const HTML = fs.readFileSync(path.join(wurzel, 'index.html'), 'utf8');

    it('Titel, Beschriftungen, Chip und Brick-Optionen tragen Schluessel', () => {
        // Die Selects wurden von populateMatchupFilters sauber
        // befuellt, die Beschriftungen daneben fasste keine JS-Stelle
        // an: ein englischer Nutzer las "All My Decks" unter
        // "Mein Deck".
        const noetig = ['matchupAnalysis.title', 'matchupAnalysis.subtitle',
            'matchupAnalysis.myDeck', 'matchupAnalysis.meta',
            'matchupAnalysis.tournament', 'matchupAnalysis.bricks',
            'matchupAnalysis.chipAll', 'matchupAnalysis.brickIncl',
            'matchupAnalysis.brickExcl', 'matchupAnalysis.brickOnly'];
        const fehlenImHtml = noetig.filter(k => !HTML.includes(`"${k}"`));
        assert.deepEqual(fehlenImHtml, [], `ohne Schluessel im HTML: ${fehlenImHtml}`);
        const fehlenInTabelle = noetig.filter(k => anzahlInTabelle(k) !== 2);
        assert.deepEqual(fehlenInTabelle, [], `nicht in beiden Bloecken: ${fehlenInTabelle}`);
    });

    it('kein deutsches Attribut ohne Schluessel mehr im Modal', () => {
        const i = HTML.indexOf('class="ma-modal-header"');
        assert.notEqual(i, -1, 'das Modal ist verschwunden');
        const block = HTML.slice(i, i + 4000);
        const roh = [...block.matchAll(/(title|placeholder)="([^"]*[äöüÄÖÜß][^"]*)"/g)]
            .filter(m => !block.slice(Math.max(0, m.index - 300), m.index + 300)
                .includes(`data-i18n-${m[1] === 'title' ? 'title' : 'placeholder'}`))
            .map(m => m[2].slice(0, 40));
        assert.deepEqual(roh, [], `deutsches Attribut ohne Schluessel: ${roh}`);
    });
});

describe('Der Offline-Hinweis kennt beide Sprachen', () => {
    const OFF = fs.readFileSync(path.join(wurzel, 'js', 'offline-prefetch.js'), 'utf8');

    it('es gibt eine Sprachverzweigung', () => {
        // Der ganze Block hatte keine — ein englischer Nutzer bekam
        // auf dem iPhone ein komplett deutsches Banner.
        assert.match(OFF, /app_lang/, 'liest die Sprachmarke nicht');
        assert.match(OFF, /var DE = sprache === 'de'/, 'keine Verzweigung mehr');
    });

    it('jeder der drei Texte hat eine englische Fassung', () => {
        for (const en of ['Offline only works via Safari',
                          'For offline: add to home screen',
                          'Dismiss hint']) {
            assert.ok(OFF.includes(en), `englische Fassung fehlt: ${en}`);
        }
    });

    it('das Modul verlaesst sich nicht auf i18n', () => {
        // offline-prefetch.js laedt vor i18n.js. Ein t()-Aufruf waere
        // hier eine Zeitbombe, kein Fortschritt.
        assert.ok(!/\bt\(['"]/.test(OFF),
            'benutzt t() — das Modul laedt vor i18n.js');
    });
});
