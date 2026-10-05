'use strict';
/*
 * DA-47 + FE-61 (Rutsch V2-2, 05.10.2026)
 *
 * DA-47 „Rechnung angleichen" (Hausi 05.10.2026): das Battle Journal
 * rechnete S/(S+N+U), die ganze Seite S/(S+N). Jetzt rechnet es an EINER
 * Stelle — bjQuote — S/(S+N). Ohne Sieg und Niederlage gibt es keine Quote.
 *
 * FE-61 (T3-08/T3-09): Folgerunde mit Deck und Rundennummer vorbelegt,
 * kein „vs Opponent" bei No-Show, eine Zaehlweise (siehe
 * test-battle-journal-noshow.js).
 *
 * Alle Pruefungen FUEHREN die Funktionen aus der Datei aus (Kommentare
 * vorher entfernt). Nutzerdaten werden nicht gelesen.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { baue, lies, ausschnitt } = require('./lib-dom-sandkasten.js');

const QUELLE = lies('js', 'battle-journal.js');

function quote(src) {
    const ctx = vm.createContext({});
    vm.runInContext(ausschnitt(src, 'function bjQuote(') + ';' + ausschnitt(src, 'function bjQuoteText(')
        + ';globalThis.q=bjQuote;globalThis.qt=bjQuoteText;', ctx);
    return ctx;
}

describe('DA-47: Journal-Quote S/(S+N)', () => {
    const c = quote(QUELLE);
    it('6 Siege, 2 Niederlagen, 4 Unentschieden = 75 %, nicht 50 %', () => {
        assert.equal(c.q(6, 2), 75);
    });
    it('nur Unentschieden: keine Quote (null / Strich), nicht 0 %', () => {
        assert.equal(c.q(0, 0), null);
        assert.equal(c.qt(0, 0), '—');
        assert.equal(c.qt(1, 3), '25%');
    });
    it('getBattleJournalWinRates: Unentschieden zaehlen in total, nicht in die Quote; No-Show gar nicht', () => {
        const e = (r) => ({ ownDeck: 'Mega Excadrill', opponentArchetype: 'Gholdengo', result: r });
        const f = baue('js/battle-journal.js', ['function getBattleJournalWinRates(', 'function bjQuote(', 'function istNoShow('], {
            journalHistoryCache: [e('win'), e('win'), e('win'), e('loss'), e('tie'), e('tie'), e('noshow')],
            NO_SHOW: 'noshow',
        }).getBattleJournalWinRates;
        const r = f('Mega Excadrill', 1).Gholdengo;
        assert.equal(r.total, 6);
        assert.equal(r.ties, 2);
        assert.equal(r.winRate, 75);
    });
    it('die Konvention heisst ohneUnentschieden', () => {
        assert.match(QUELLE, /const BJ_KONVENTION = 'ohneUnentschieden';/);
    });
    it('VERFAELSCHUNG: mit Unentschieden im Nenner faellt es auf', () => {
        const kaputt = QUELLE.replace('return (s + n) > 0 ? Math.round((s / (s + n)) * 100) : null;',
            'return (s + n) > 0 ? Math.round((s / (s + n + 2)) * 100) : null;');
        assert.notEqual(kaputt, QUELLE);
        assert.notEqual(quote(kaputt).q(6, 2), 75);
    });
});

describe('FE-61: Folgerunde', () => {
    const eintraege = [
        { tournamentName: 'City League Hamburg', meta: 'TEF-POR', ownDeck: 'Dragapult', createdAtMs: 1 },
        { tournamentName: 'City League Hamburg', meta: 'TEF-POR', ownDeck: 'Mega Excadrill', createdAtMs: 3 },
        { tournamentName: 'City League Hamburg', meta: 'TEF-POR', ownDeck: 'Dragapult', createdAtMs: 2 },
        { tournamentName: 'Anderes Turnier', meta: 'TEF-POR', ownDeck: 'Gholdengo', createdAtMs: 9 },
        { tournamentName: 'City League Hamburg', meta: 'SVI-ASC', ownDeck: 'Gholdengo', createdAtMs: 10 },
    ];
    const fr = (src) => baue(src, ['function _folgerunde('], {})._folgerunde;
    it('Deck aus dem NEUESTEN Eintrag desselben Turniers, Runde = Eintraege + 1', () => {
        const r = fr('js/battle-journal.js')(eintraege, 'City League Hamburg', 'TEF-POR');
        assert.equal(r.deck, 'Mega Excadrill');
        assert.equal(r.runde, 4);
    });
    it('ohne Eintraege: Runde 1, kein Deck', () => {
        const r = fr('js/battle-journal.js')(eintraege, 'Neu', 'TEF-POR');
        assert.equal(r.runde, 1);
        assert.equal(r.deck, '');
    });
    it('„+ Match" ruft sie auf und setzt das Deck', () => {
        const teil = ausschnitt(QUELLE, 'function continueJournalTournament(');
        assert.match(teil, /_folgerunde\(journalHistoryCache, name, meta\)/);
        assert.match(teil, /els\.ownDeckValue\.value = fr\.deck/);
    });
    it('kein englisches „Opponent" als Ersatzname mehr', () => {
        assert.ok(!/opponentArchetype \|\| 'Opponent'/.test(QUELLE));
        const i18n = lies('js', 'i18n.js');
        assert.ok((i18n.match(/'bj\.keinGegner':/g) || []).length === 2);
        assert.ok((i18n.match(/'bj\.rundeN':/g) || []).length === 2);
    });
    it('VERFAELSCHUNG: ohne Formatvergleich zaehlte das SVI-ASC-Turnier mit', () => {
        const kaputt = QUELLE.replace("&& (!meta || (e.meta || '') === meta);", ';');
        assert.notEqual(kaputt, QUELLE);
        const ctx = vm.createContext({});
        vm.runInContext(ausschnitt(kaputt, 'function _folgerunde(') + ';globalThis.f=_folgerunde;', ctx);
        assert.notEqual(ctx.f(eintraege, 'City League Hamburg', 'TEF-POR').runde, 4);
    });
});
