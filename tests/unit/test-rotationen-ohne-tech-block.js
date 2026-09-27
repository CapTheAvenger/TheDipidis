/**
 * FE-10 (27.09.2026, Hausi): in Rotationen ist der Tech-Karten-Block weg.
 *
 * Zwei Seiten derselben Zusage:
 *   1. Das Markup fuehrt fuer Rotationen (pastMeta) keinen Block mehr.
 *   2. Gespeicherte Tech-Karten aus der Zeit davor werden NICHT wieder
 *      eingelesen — sonst zwaenge der naechste Generate Karten ins Deck,
 *      die niemand sieht. Das wird AUSGEFUEHRT, nicht im Text gesucht.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(treffer.index, i + 1); }
    }
    throw new Error('Klammer nicht geschlossen: ' + name);
}

test('das Markup fuehrt in Rotationen keinen Tech-Karten-Block', () => {
    const html = R('index.html').replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(html, /class="tech-slots-row"[^>]*data-source="pastMeta"/);
    assert.doesNotMatch(html, /id="pastMetaTechSlots(Grid|Count)"/);
    assert.doesNotMatch(html, /openAntiTechModal\('pastMeta'\)/);
    // Gegenprobe: im Deck-Reiter (currentMeta) bleibt er.
    assert.match(html, /class="tech-slots-row[^"]*"[^>]*data-source="currentMeta"/);
});

test('gespeicherte Tech-Karten werden beim Laden nicht wieder eingesetzt', () => {
    const koerper = schneideFunktion(R('js/app-current-meta.js'), 'loadPastMetaDeck');
    const gesetzt = [];
    const fenster = {
        techSlotsFromArray: (q, arr) => gesetzt.push([q, arr]),
        pinnedCardsFromArray() {}, excludedCardsFromArray() {},
    };
    const ctx = {
        window: fenster, devLog() {}, console,
        localStorage: { getItem: () => JSON.stringify({ deck: { 'Iono PAL 185': 4 }, order: [], techSlots: ['Lost Vacuum'] }) },
    };
    vm.createContext(ctx);
    const erg = vm.runInContext('(' + koerper + ')()', ctx);
    assert.equal(erg, true, 'das Deck wurde gar nicht geladen — die Probe waere blind');
    assert.equal(JSON.stringify(fenster.pastMetaDeck), JSON.stringify({ 'Iono PAL 185': 4 }));
    assert.equal(gesetzt.length, 0, 'gespeicherte Tech-Karten wurden wieder eingesetzt');
});
