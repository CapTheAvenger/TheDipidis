'use strict';
/* V2-14 (Hausi 07.10.2026: „bitte bringe alle offenen Themen zu Ende“):
   Politur aus UI-92/UI-100/N-23/F2-xx/D2-xx. Funktionen werden aus dem
   Quelltext geschnitten (Kommentare entfernt) und ausgefuehrt. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const W = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(W, p), 'utf8');
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function block(src, kopf) {
    const i = src.indexOf(kopf); assert.ok(i >= 0, 'nicht gefunden: ' + kopf);
    let t = 0;
    for (let k = src.indexOf('{', i); k < src.length; k++) {
        if (src[k] === '{') t++; else if (src[k] === '}' && --t === 0) return src.slice(i, k + 1);
    }
    throw new Error('offen: ' + kopf);
}
const lauf = (code, name, ctx = {}) => { vm.runInNewContext(code + ';this.f=' + name + ';', ctx); return ctx.f; };

describe('N2-11: eine Zahl neben dem Namen ist die Kartennummer', () => {
    const f = lauf(block(ohneKommentare(lies('js/app-cards-db.js')), 'function kartenSucheTokenPasst('), 'kartenSucheTokenPasst');
    const hay = (name, set, nr, dex) => [name, set, nr, dex, `${set} ${nr}`, `${set}${nr}`].join(' ').toLowerCase();
    it('„25“ trifft Pikachu 25, nicht Pikachu 125 und nicht über die Pokédex-Nummer', () => {
        assert.equal(f('25', hay('pikachu', 'svp', '25', '25'), '25', '25'), true);
        assert.equal(f('25', hay('pikachu', 'svp', '125', '25'), '125', '25'), false);
        assert.equal(f('25', hay('pikachu', 'mew', '173', '25'), '173', '25'), false);
        assert.equal(f('025', hay('x', 'mew', '25', ''), '25', ''), true);
    });
    it('Wörter wie bisher', () => {
        assert.equal(f('pika', hay('pikachu', 'svp', '25', '25'), '25', '25'), true);
        assert.equal(f('por', hay('lapras ex', 'por', '22', ''), '22', ''), true);
    });
    it('die Mehrwortsuche nutzt die Regel', () => {
        assert.match(ohneKommentare(lies('js/app-cards-db.js')), /matchesSearch = searchTokens\.every\(t => kartenSucheTokenPasst\(t, haystack, cardNum, dexNum\)\);/);
    });
});

describe('F-25: Masterclass nennt Pokémon „Englisch (Deutsch)“', () => {
    const SRC = ohneKommentare(lies('js/ds-masterclass.js'));
    const ctx = {};
    vm.runInNewContext(block(SRC, 'function namenImText(') + ';' + block(SRC, 'function namenMuster(') + ';this.t=namenImText;this.m=namenMuster;', ctx);
    const deZuEn = { Katapuldra: 'Dragapult', Stalobor: 'Excadrill' };
    it('erstes Vorkommen mit Klammer, danach englisch, Zusammensetzung ohne Klammer', () => {
        const gesehen = new Set();
        const m = ctx.m(deZuEn);
        assert.equal(ctx.t('Katapuldra greift an, Katapuldra fällt.', deZuEn, m, gesehen), 'Dragapult (Katapuldra) greift an, Dragapult fällt.');
        assert.equal(ctx.t('Das Stalobor-Deck und Stalobor.', deZuEn, ctx.m(deZuEn), gesehen), 'Das Excadrill-Deck und Excadrill (Stalobor).');
    });
    it('Teilwörter bleiben stehen', () => {
        assert.equal(ctx.t('Katapuldras', deZuEn, ctx.m(deZuEn), new Set()), 'Katapuldras');
    });
    it('der Binder zeigt den englischen Namen zuerst', () => {
        assert.match(SRC, /var name = k\.name \|\| k\.name_de;/);
        assert.match(SRC, /namenAngleichen\(buehne, erg\[1\]\);/);
    });
});

describe('N2-15: Champions-Datum lesbar', () => {
    const f = lauf(block(ohneKommentare(lies('js/app-side-quest.js')), 'function sqDatumLesbar('), 'sqDatumLesbar', { getLang: () => 'de' });
    it('ISO wird TT.MM.JJJJ', () => {
        assert.equal(f('2026-10-03'), '03.10.2026');
        assert.equal(f('2026-10-03T04:00:00Z'), '03.10.2026');
        assert.equal(f('irgendwas'), 'irgendwas');
    });
});

describe('F2-10: „−“ bei der letzten Kopie bietet Rückgängig an', () => {
    const SRC = ohneKommentare(lies('js/firebase-collection.js'));
    it('der Löschzweig ruft deckRueckgaengigAnbieten mit der alten Anzahl', () => {
        const b = block(SRC, 'async function myDeckChangeCardCount(');
        const zweig = b.slice(b.indexOf('if (newCount <= 0)'), b.indexOf('} else if (newCount > 4'));
        assert.match(zweig, /deckRueckgaengigAnbieten\(/);
        assert.match(zweig, /myDeckChangeCardCount\(deckIndex, deckKey, currentCount\)/);
    });
});

describe('N-25 / N2-10 / N2-17', () => {
    const FC = ohneKommentare(lies('js/firebase-collection.js'));
    it('Wunschliste hat einen Knopf „Entfernen ✕“', () => {
        assert.match(FC, /onclick="wunschlisteKarteEntfernen\('\$\{safeCardIdJs\}', '\$\{escapeHtml\(safeNameJs\)\}'\)">\$\{getLang\(\)==='de' \? 'Entfernen ✕'/);
    });
    it('der Profil-Builder speichert ohne zweite Meldung', () => {
        assert.match(ohneKommentare(lies('js/app-profile-deck-builder.js')), /window\.saveDeck\(nutzlast, \{ stumm: true \}\);/);
        assert.match(block(FC, 'function saveDeck('), /if \(!stumm\) showNotification\(isNew/);
    });
    it('im Profilkopf steht nur noch ein Sync-Knopf', () => {
        const html = lies('index.html');
        const kopf = html.slice(html.indexOf('id="cloud-sync-status"'), html.indexOf('Tabs for Profile sections'));
        assert.equal((kopf.match(/flushBattleJournalOutbox\(\)/g) || []).length, 0);
        assert.match(ohneKommentare(lies('js/firebase-globals.js')), /window\.flushBattleJournalOutbox\(\)/);
    });
});

describe('F-23 / D2-10 / D2-12 / N-22', () => {
    it('Japan-Kachel nennt den Anteil', () => {
        assert.match(lies('js/app-tier-meta.js'), /\(item\.totalCount \/ clGesamtListen \* 100\)\.toFixed\(1\)/);
    });
    it('Hub-Kachel heißt „Höchste Top-8-Quote“', () => {
        assert.match(lies('js/meta-analysis-hub.js'), /role = de \? 'Höchste Top-8-Quote'/);
    });
    it('Suche ohne Treffer gibt einen Tipp', () => {
        assert.match(lies('js/i18n.js'), /'cdb\.suchTipp':\s*'Englischen oder deutschen Namen probieren, ohne Setkürzel\.'/);
    });
    it('„Was fehlt“-Tabelle bleibt am Handy bei 14 px', () => {
        assert.match(lies('css/knopfsystem.css'), /#quellen \.qu-abd th, #quellen \.qu-abd td \{ font-size: 14px; \}/);
    });
});
