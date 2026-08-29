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
