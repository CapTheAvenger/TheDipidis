/**
 * UI-166 (Hausi 25.11.2026): Wunschlisten-Kachel unter dem Bild aufgeraeumt und
 * „Majors: meist N× · max M×“ je Karte (data/major_kartenmengen.json).
 * Die Zeile wird AUSGEFUEHRT (vm), nicht als Text gesucht.
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const FC = fs.readFileSync(path.join(ROOT, 'js', 'firebase-collection.js'), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
assert.ok(ohneKommentare(FC).length > FC.length * 0.3, 'das Ausschneiden hat zu viel entfernt');

function schneide(quelle, name) {
    const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(m, `Funktion nicht gefunden: ${name}`);
    let tiefe = 0;
    for (let i = quelle.indexOf('{', m.index); i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(m.index, i + 1);
    }
    throw new Error('Klammer offen: ' + name);
}

function zeile(daten, set, nummer, gewuenscht, lang = 'de') {
    const ctx = { window: { majorKartenmengen: daten }, getLang: () => lang, escapeHtml: s => String(s) };
    vm.createContext(ctx);
    vm.runInContext(schneide(FC, 'wunschMajorZeile') + '\nthis.f = wunschMajorZeile;', ctx);
    return ctx.f(set, nummer, gewuenscht);
}
const DATEN = { karten: { 'POR-106': { decks: 79, meist: 1, max: 1 }, 'MEP-78': { decks: 51, meist: 2, max: 4 } } };

describe('Majors: meist · max', () => {
    it('zeigt meist und max der Karte, Print fuer Print', () => {
        const z = zeile(DATEN, 'MEP', '78', 2);
        assert.match(z, /meist <b>2×<\/b> · max <b>4×<\/b>/);
        assert.match(z, /In 51 Major-Listen/);
        assert.ok(!/zu-viel/.test(z));
    });
    it('markiert, wenn mehr auf der Wunschliste steht als je gespielt', () => {
        const z = zeile(DATEN, 'POR', '106', 2);
        assert.match(z, /class="wunsch-major zu-viel"/);
        assert.match(z, /auf der Wunschliste stehen 2×/);
        assert.ok(!/zu-viel/.test(zeile(DATEN, 'POR', '106', 1)));
    });
    it('nicht gespielt heisst es auch so — und ohne Daten steht nichts', () => {
        assert.match(zeile(DATEN, 'ZZZ', '1', 1), /nicht gespielt/);
        assert.strictEqual(zeile(null, 'POR', '106', 1), '');
    });
});

describe('Kachel', () => {
    const code = ohneKommentare(FC);
    const kachel = code.slice(code.indexOf('<div class="wunsch-info">'), code.indexOf('<div class="wunsch-knoepfe">') + 2000);
    it('die Major-Zeile steht in der Kachel, mit der gewuenschten Anzahl', () => {
        assert.match(kachel, /\$\{wunschMajorZeile\(cardSet, cardNumber, wantedCount\)\}/);
    });
    it('eine Knopfreihe: Prints, Sammlung, Entfernen', () => {
        const reihe = kachel.slice(kachel.indexOf('wunsch-knoepfe'));
        assert.match(reihe, /openRaritySwitcherFromDB\([\s\S]*?'wunschliste'\)/);
        assert.match(reihe, /addOwnedFromWishlist\(/);
        assert.match(reihe, /wunschlisteKarteEntfernen\(/);
    });
    it('die Daten werden geladen, wenn die Wunschliste zeichnet', () => {
        const f = ohneKommentare(schneide(FC, 'updateWishlistUI'));
        assert.match(f, /majorKartenmengenLaden\(\)/);
        assert.match(ohneKommentare(schneide(FC, 'majorKartenmengenLaden')), /fetch\('data\/major_kartenmengen\.json'/);
    });
});
