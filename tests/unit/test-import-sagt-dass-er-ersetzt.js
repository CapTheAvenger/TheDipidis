/**
 * UI-7: ein Knopf, der das Deck ersetzt, sagt es — nicht nur im title.
 *
 * Befund (PR #450 nannte ihn, 26.09.2026 behoben): in den drei Deckbauern
 * (City League, Current Meta, Past Meta) stand das PTCGL-Paar im HTML als
 * "PTCGL" / "PTCGL"; unterschieden hat nur das title-Attribut, und das gibt
 * es auf dem Telefon nicht. Der Import ERSETZT das Deck ohne Rueckfrage.
 *
 * Geprueft am Verhalten: importFromPTCGL wird aus der Datei geschnitten und
 * mit einem Deck von 60 Karten ausgefuehrt; der Dialog muss die 60 nennen.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const R = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function schneide(quelle, kopf) {
    const start = quelle.indexOf(kopf);
    assert.ok(start >= 0, `${kopf} nicht gefunden`);
    let tiefe = 0;
    for (let i = quelle.indexOf('{', start); i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}' && --tiefe === 0) return quelle.slice(start, i + 1);
    }
    throw new Error('Klammern gehen nicht auf');
}

function woerterbuch(sprache) {
    const i18n = R('js/i18n.js');
    const ctx = { window: {}, document: { documentElement: {}, addEventListener() {}, querySelectorAll: () => [] }, localStorage: { getItem: () => sprache, setItem() {} }, navigator: { language: sprache } };
    vm.runInNewContext(i18n + '\n;this.__t = t; this.__tr = translations;', ctx);
    return (k, v) => {
        let s = ctx.__tr[sprache][k];
        if (s === undefined) return k;
        return v ? s.replace(/\{(\w+)\}/g, (g, n) => (n in v ? String(v[n]) : g)) : s;
    };
}

async function dialogFuer(deck, sprache) {
    const fn = schneide(R('js/app-features.js'), 'async function importFromPTCGL(source)');
    let gesehen = null;
    const ctx = {
        window: { cityLeagueDeck: deck, allCardsDatabase: [] },
        t: woerterbuch(sprache),
        showInputModal: async (o) => { gesehen = o; return null; },
        console,
    };
    vm.runInNewContext(fn + '\nthis.lauf = importFromPTCGL;', ctx);
    await ctx.lauf('cityLeague');
    return gesehen;
}

describe('UI-7: der Import sagt, dass er ersetzt', () => {
    it('mit vollem Deck nennt der Dialog die Karten, die verloren gehen (DE und EN)', async () => {
        const deck = { 'Dreepy (TWM 128)': 4, 'Rest (X 1)': 56 };
        const de = await dialogFuer(deck, 'de');
        assert.match(de.message, /ersetzt das aktuelle Deck \(60 Karten\)/, de.message);
        assert.doesNotMatch(de.title, /Import PTCGL Deck/, 'Titel steht noch englisch im deutschen Dialog');
        const en = await dialogFuer(deck, 'en');
        assert.match(en.message, /replaces the current deck \(60 cards\)/, en.message);
    });

    it('mit leerem Deck gibt es nichts zu warnen', async () => {
        const de = await dialogFuer({}, 'de');
        assert.doesNotMatch(de.message, /ersetzt/);
    });

    it('im HTML unterscheiden sich die Paare im Text, nicht nur im title', () => {
        const html = R('index.html');
        const paare = [...html.matchAll(/importFromPTCGL\('(\w+)'\)[^>]*>([^<]*)<\/button>\s*<button[^>]*exportToPTCGL\('\1'\)[^>]*>([^<]*)<\/button>/g)];
        assert.equal(paare.length, 3, `erwartet drei Deckbauer, gefunden ${paare.length}`);
        for (const [, wo, imp, exp] of paare) {
            assert.notEqual(imp.trim(), exp.trim(), `${wo}: beide Knoepfe heissen "${imp.trim()}"`);
        }
    });
});
