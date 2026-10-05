/**
 * FE-58 (T3-01, UI/UX-Ueberpruefung v2, 05.10.2026)
 *
 * BEFUND: „Max Consistency“ (autoCompleteConsistency) und „Generieren“
 * (autoComplete) setzten `rarityPreferences = {}` und speicherten das.
 * rarityPreferences ist EIN Speicher (localStorage) fuer ALLE Decks und
 * Quellen. Gemessen am 04.10.: 25 -> 22 Eintraege, 19 Vorlieben anderer
 * Decks still verloren.
 *
 * ZUSICHERUNG: Generieren leert nur die Vorlieben der Karten des
 * gewaehlten Archetyps. Die Hilfsfunktion wird AUSGEFUEHRT; dazu wird
 * geprueft, dass beide Generier-Funktionen sie aufrufen und den Speicher
 * nicht mehr ersetzen (Kommentare vorher entfernt).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const L = require('./lib-dom-sandkasten.js');

function ohneKommentare(text) {
    return String(text)
        .replace(/\/\*[\s\S]*?\*\//g, ' ')
        .split('\n').map(z => z.replace(/(^|[^:'"])\/\/.*$/, '$1')).join('\n');
}

const QUELLE = L.lies('js', 'app-deck-builder.js');

function umgebung(vorlieben) {
    const prot = { gespeichert: 0 };
    const ctx = L.baue('js/app-deck-builder.js', [
        'function _deckLeerenBasisname(deckSchluessel)',
        'function _seltenheitFuerGenerierenLeeren(cards)',
    ], {
        rarityPreferences: vorlieben,
        saveRarityPreferences: () => { prot.gespeichert++; },
    });
    return { ctx, prot };
}

describe('FE-58: Generieren leert nur die Vorlieben des eigenen Archetyps', () => {
    it('fremde Vorlieben bleiben, eigene Karten werden geleert', () => {
        const v = {
            'Dragapult ex': { set: 'ASC', number: '160' },
            'Poké Pad': { set: '30C', number: '126' },
            'Ultra Ball': { set: 'SVI', number: '196' },
            'Excadrill ex': { set: 'MEG', number: '1' },
        };
        const { ctx, prot } = umgebung(v);
        const weg = ctx._seltenheitFuerGenerierenLeeren([
            { card_name: 'Excadrill ex' }, { card_name: 'Ultra Ball' }, { card_name: 'Arven' },
        ]);
        assert.deepEqual(JSON.parse(JSON.stringify(weg)).sort(), ['Excadrill ex', 'Ultra Ball']);
        assert.deepEqual(Object.keys(v).sort(), ['Dragapult ex', 'Poké Pad']);
        assert.equal(prot.gespeichert, 1);
    });

    it('ohne Karten wird nichts geleert und nichts gespeichert', () => {
        const v = { 'Dragapult ex': { set: 'ASC', number: '160' } };
        const { ctx, prot } = umgebung(v);
        ctx._seltenheitFuerGenerierenLeeren(null);
        ctx._seltenheitFuerGenerierenLeeren([]);
        assert.deepEqual(Object.keys(v), ['Dragapult ex']);
        assert.equal(prot.gespeichert, 0);
    });

    it('beide Generier-Wege ersetzen den Speicher nicht mehr und rufen die Hilfe auf', () => {
        for (const kopf of ['function autoComplete(source, rarityMode)', 'function autoCompleteConsistency(']) {
            const rumpf = ohneKommentare(L.ausschnitt(QUELLE, kopf));
            assert.ok(!/rarityPreferences\s*=\s*\{\s*\}/.test(rumpf), kopf + ' leert den ganzen Speicher');
            assert.ok(/_seltenheitFuerGenerierenLeeren\(\s*cards\s*\)/.test(rumpf), kopf + ' ruft die Hilfe nicht');
        }
    });
});
