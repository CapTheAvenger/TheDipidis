'use strict';
/*
 * UI-110 (IA Etappe 1, 05.10.2026, Hausi: Vorschlag A in Etappen)
 *
 * 05.10.2026 abends: den „Mein Deck“-Knopf im Kopf (js/mein-deck.js) hat
 * Hausi wieder entfernt („Weg damit“) — er steht in claude/festlegungen.md,
 * Teil A, und test-festlegungen-weg.js sichert das. Hier bleibt die
 * Untertab-Adresse.
 *
 * „Mein Deck" gab es nur im Meta Call. Jetzt ein Ort (js/mein-deck.js),
 * derselbe Schluessel `metacall_mydeck_v1` (bestehende Wahl bleibt), ein
 * Ereignis fuer alle Abnehmer. Ausgefuehrt wird die echte Datei in einer
 * Sandkiste; Profil-Untertabs schreiben ihre Adresse.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { lies, ausschnitt } = require('./lib-dom-sandkasten.js');

describe('UI-110: Profil-Untertabs schreiben ihre Adresse', () => {
    it('switchProfileTab ruft die Untertab-Schreibfunktion', () => {
        const FC = lies('js', 'firebase-collection.js');
        assert.match(ausschnitt(FC, 'function switchProfileTab('), /window\.__dsSchreibeProfilHash\(tabName\)/);
    });
    it('und fuehrt sie aus: #decks statt #profile', () => {
        const FC = lies('js', 'firebase-collection.js');
        const geschrieben = [];
        const leer = { classList: { add() {}, remove() {} }, style: {} };
        const ctx = vm.createContext({
            document: { querySelectorAll: () => [], getElementById: () => leer, querySelector: () => null },
            window: { __dsSchreibeProfilHash: (t) => geschrieben.push(t), matchMedia: () => ({ matches: false }) },
        });
        vm.runInContext(ausschnitt(FC, 'function switchProfileTab(') + ';globalThis.f=switchProfileTab;', ctx);
        ctx.f('decks');
        assert.deepEqual(geschrieben, ['decks']);
    });
});
