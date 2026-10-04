'use strict';
/**
 * Rutsch H (02.10.2026) — Meta Call straffen, Journal-Abgleich, kein Auto-Neustart.
 *   UI-62: Schritt-Titel passen zu den Schritten; Turniername startet leer;
 *          „Win Rates anpassen" weg; „Journal" statt „Journal-Bricks";
 *          Bilanz in der Reihenfolge W-L-T (S-N-U).
 *   UI-63: Journal-Partien mit Zusatz („Mega Excadrill Frankfurt") zaehlen fuer
 *          das Archetyp-Deck, ohne andere Archetypen einzusammeln.
 *   UI-64: kein automatisches Neuladen der Seite bei neuem Service Worker.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { baue, lies } = require('./lib-dom-sandkasten.js');

const QUELLE = lies('js', 'app-meta-call.js');
const INDEX = lies('index.html');
const I18N = lies('js', 'i18n.js');

function journal(eintraege) {
    return baue('js/battle-journal.js', ['function getBattleJournalWinRates('], {
        journalHistoryCache: eintraege, istNoShow: () => false,
    }).getBattleJournalWinRates;
}
const e = (ownDeck, opp, result) => ({ ownDeck, opponentArchetype: opp, result });
const BEKANNT = ['Mega Excadrill', 'Dragapult', 'Dragapult Dusknoir', 'Gholdengo'];

describe('UI-63: Journal-Abgleich mit Namenszusatz', () => {
    it('„Mega Excadrill Frankfurt" zaehlt fuer „Mega Excadrill"', () => {
        const f = journal([e('Mega Excadrill Frankfurt', 'Gholdengo', 'win'), e('Mega Excadrill', 'Gholdengo', 'loss')]);
        const r = f('Mega Excadrill', 1, { bekannteDecks: BEKANNT });
        assert.equal(r.Gholdengo.total, 2);
    });
    it('ohne Liste bekannter Decks bleibt es bei der strengen Gleichheit', () => {
        const f = journal([e('Mega Excadrill Frankfurt', 'Gholdengo', 'win')]);
        assert.equal(Object.keys(f('Mega Excadrill', 1)).length, 0);
    });
    it('ein laengerer bekannter Archetyp wird NICHT eingesammelt', () => {
        const f = journal([e('Dragapult Dusknoir', 'Gholdengo', 'win'), e('Dragapult', 'Gholdengo', 'loss')]);
        const r = f('Dragapult', 1, { bekannteDecks: BEKANNT });
        assert.equal(r.Gholdengo.total, 1);
        assert.equal(r.Gholdengo.losses, 1);
    });
    it('der Name steht am Wortanfang — ein Teilwort zaehlt nicht', () => {
        const f = journal([e('Dragapultx Test', 'Gholdengo', 'win')]);
        assert.equal(Object.keys(f('Dragapult', 1, { bekannteDecks: BEKANNT })).length, 0);
    });
    it('VERFAELSCHUNG: ohne die Wortgrenzen-Pruefung wuerde Dragapult Dusknoir mitzaehlen', () => {
        const q = lies('js', 'battle-journal.js');
        const kaputt = q.replace('if (kw.length > ownWorte.length && _beginntMit(ew, kw)) return false;', '');
        assert.notEqual(kaputt, q);
        const ctx = require('node:vm').createContext({ journalHistoryCache: [e('Dragapult Dusknoir', 'X', 'win')], istNoShow: () => false });
        const a = kaputt.indexOf('function getBattleJournalWinRates(');
        const b = kaputt.indexOf('window.getBattleJournalWinRates', a);
        require('node:vm').runInContext(kaputt.slice(a, b) + ';globalThis.f=getBattleJournalWinRates;', ctx);
        assert.equal(ctx.f('Dragapult', 1, { bekannteDecks: BEKANNT }).X.total, 1, 'ohne Pruefung zaehlt sie mit');
    });
    it('Meta Call reicht die bekannten Decks durch', () => {
        /* FE-20: ein Lader, ein Optionenblock — beide Stellen laufen darueber. */
        const aufrufe = QUELLE.match(/window\.getBattleJournalWinRates\(deck, 1, _journalOptionen\(\)\)/g) || [];
        assert.equal(aufrufe.length, 1);
        assert.match(QUELLE, /function _journalOptionen\(\)[\s\S]{0,200}bekannteDecks: _bekannteDeckNamen\(\)/);
        // FE-44 (03.10.2026): dritter Aufrufer — der Start mit gemerktem „Mein Deck".
        assert.equal((QUELLE.match(/_ladeJournal\(/g) || []).length, 4, 'Definition + drei Aufrufer');
    });
});

describe('UI-62: Aufbau und Texte', () => {
    it('ein frischer Meta Call setzt keinen gemerkten Turniernamen ein', () => {
        assert.ok(!/getItem\(TOURNAMENT_NAME_KEY\)/.test(QUELLE), 'der Name wird wieder aus dem Browser geholt');
        assert.ok(!/setItem\(TOURNAMENT_NAME_KEY/.test(QUELLE), 'der Name wird wieder im Browser gemerkt');
        assert.match(QUELLE, /removeItem\(TOURNAMENT_NAME_KEY\)/);
    });
    it('„Win Rates anpassen" ist aus der Deck-Wahl entfernt', () => {
        const a = QUELLE.indexOf('function renderMyDeckPanel()');
        const rumpf = QUELLE.slice(a, QUELLE.indexOf('\n  }\n', a));
        assert.ok(!rumpf.includes('mc-override-toggle'));
        assert.ok(!rumpf.includes('mc.adjustWinRates'));
        assert.ok(!rumpf.includes('mc-swiss-note'));
    });
    it('„Journal" statt „Journal-Bricks"', () => {
        const vorkommen = [...I18N.matchAll(/'mc\.journalBricks':\s*'([^']*)'/g)].map(m => m[1]);
        assert.equal(vorkommen.length, 2);
        assert.ok(vorkommen.every(v => v === 'Journal'), vorkommen.join('|'));
    });
    it('Bilanz heisst ueberall W–L–T (auch deutsch) und die Zelle schreibt Wins–Losses–Ties', () => {
        assert.match(QUELLE, /L\('Bilanz W–L–T', 'Record W–L–T'\)/);
        for (const alt of ['S–N–U', 'S–U–N', 'Bilanz S–']) {
            assert.ok(!QUELLE.includes(alt), alt + ' ist zurueck — die Reihenfolge heisst immer W–L–T');
            for (const d of ['app-archetype-card.js', 'app-current-meta-analysis.js'])
                assert.ok(!lies('js', d).includes(alt), alt + ' in ' + d);
        }
        assert.match(QUELLE, /_mcNum\(z\.w, 1\)\}–\$\{\s*_mcNum\(z\.n, 1\)\}–\$\{_mcNum\(z\.u, 1\)\}/);
        const bild = QUELLE.indexOf("{ label: t('mc.avgWins')");
        const s = QUELLE.slice(bild, bild + 400);
        assert.ok(s.indexOf('avgWins') < s.indexOf('avgLosses') && s.indexOf('avgLosses') < s.indexOf('avgTies'));
    });
    it('VERFAELSCHUNG: S–U–N in der Zelle faellt auf', () => {
        const kaputt = QUELLE.replace('_mcNum(z.n, 1)}–${_mcNum(z.u, 1)}', '_mcNum(z.u, 1)}–${_mcNum(z.n, 1)}');
        assert.notEqual(kaputt, QUELLE, 'die Mutation hat nichts geaendert');
        assert.ok(!/_mcNum\(z\.w, 1\)\}–\$\{\s*_mcNum\(z\.n, 1\)\}–\$\{_mcNum\(z\.u, 1\)\}/.test(kaputt));
    });
    it('UI-65: die Abdeckungs-Kachel ist entfernt (Hausi: unverstaendlich)', () => {
        assert.ok(!QUELLE.includes("_evL('Abdeckung', 'Coverage')"));
    });
    it('UI-65: keine Erklaerabsaetze mehr unter der Tabelle und unter „Darauf vorbereiten"', () => {
        assert.ok(!QUELLE.includes('mc-mct-lead'), 'der Absatz ueber der Meta-Tabelle ist zurueck');
        const a = QUELLE.indexOf('function _evVorbereitungHtml(');
        const rumpf = QUELLE.slice(a, QUELLE.indexOf('\n  }\n', a));
        assert.ok(!rumpf.includes('class="mc-ev-fuss"'), 'der Klammer-Satz steht wieder als Absatz da');
        assert.ok((rumpf.match(/title="\$\{hinweis\}"/g) || []).length === 2, 'der Hinweis haengt nicht an beiden Zeilen');
    });
    it('keine Schritt-Erklaersaetze mehr', () => {
        assert.ok(!QUELLE.includes('mc-schritt-satz'));
        assert.ok(!QUELLE.includes('_mcSchrittTurnier'));
    });
});

describe('UI-64: kein automatischer Neustart', () => {
    it('index.html laedt die Seite nie von selbst neu', () => {
        const a = INDEX.indexOf("if ('serviceWorker' in navigator)");
        const b = INDEX.indexOf('function showUpdateToast', a);
        const block = INDEX.slice(a, b);
        assert.ok(!/location\.reload\(/.test(block), 'location.reload im Service-Worker-Block');
        assert.ok(!/controllerchange/.test(block), 'controllerchange loest wieder Neuladen aus');
    });
    it('VERFAELSCHUNG: ein reload im Block wird erkannt', () => {
        const kaputt = INDEX.replace("navigator.serviceWorker.addEventListener('message'", "window.location.reload(); navigator.serviceWorker.addEventListener('message'");
        const a = kaputt.indexOf("if ('serviceWorker' in navigator)");
        assert.ok(/location\.reload\(/.test(kaputt.slice(a, kaputt.indexOf('function showUpdateToast', a))));
    });
    it('der Hinweis sagt, wann die neue Version gilt', () => {
        assert.match(INDEX, /Neue Version bereit — gilt beim nächsten Neuladen/);
    });
});
