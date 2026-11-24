/**
 * UI-165 (Hausi, 24.11.2026): Sammlung je Fassung in der Kartendatenbank.
 *
 * Bestellt nach der Vergleichsseite „Vergleich UI-165 Sammlung“:
 *   - Bestand Normal UND Reverse Holo auf der Kachel, ein Paar − +,
 *     ein Umschalter Normal | ✦ Reverse bestimmt, welche Zahl − + aendert;
 *   - Besitzfilter Alle · Im Besitz · Fehlt · Wunschliste · Tauschliste;
 *   - ♡ und ⇄ unter die Karte, das alte Bestandsabzeichen weg;
 *   - Set und Stufe in einer Zeile (Stufe abgekuerzt);
 *   - im Rarity Switcher je Print „♡ Wunschliste“, auch aus der Wunschliste;
 *   - das Herz der Top-Karten folgt dem angezeigten Print.
 *
 * Die REGELN werden ausgefuehrt (vm), nicht als Text gesucht. Text wird nur
 * dort geprueft, wo es Text ist (Markup, ein Aufruf) — und dann ohne
 * Kommentare (CLAUDE.md, „Dein eigener Kommentar macht die Probe blind“).
 */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ohneKommentare = (s) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function schneideFunktion(quelle, name) {
    const treffer = new RegExp(`function\\s+${name}\\s*\\(`).exec(quelle);
    assert.ok(treffer, `Funktion nicht gefunden: ${name}`);
    const auf = quelle.indexOf('{', treffer.index);
    let tiefe = 0;
    for (let i = auf; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') {
            tiefe--;
            if (tiefe === 0) return quelle.slice(treffer.index, i + 1);
        }
    }
    throw new Error(`Klammer nicht geschlossen: ${name}`);
}
function schneideKonstante(quelle, name) {
    const a = quelle.indexOf(`const ${name} = `);
    assert.ok(a !== -1, `Konstante nicht gefunden: ${name}`);
    const b = quelle.indexOf('};', a);
    return quelle.slice(a, b + 2);
}

const DB = lies('js/app-cards-db.js');
const DB_CODE = ohneKommentare(DB);
assert.ok(DB_CODE.length > DB.length * 0.3, 'das Ausschneiden hat zu viel entfernt');

function regeln() {
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext([
        schneideFunktion(DB, 'reversePreisZahl'),
        schneideFunktion(DB, 'kartenHatReverse'),
        schneideFunktion(DB, 'sammlungKartenId'),
        schneideFunktion(DB, 'besitzFilterPasst'),
        schneideKonstante(DB, 'TYP_KURZ'),
        schneideFunktion(DB, 'typKurz'),
        'this.r = { reversePreisZahl, kartenHatReverse, besitzFilterPasst, typKurz };'
    ].join('\n'), ctx);
    return ctx.r;
}

const MIT = { name: 'Musharna', set: 'BLK', number: '36', eur_price_reverse: '0,08€' };
const OHNE = { name: 'Mega Sharpedo ex', set: 'PFL', number: '61' };
const NULL = { name: 'X', set: 'S', number: '1', eur_price_reverse: '0,00€' };
const listen = (o = {}) => ({
    normal: new Map(o.normal || []), reverse: new Map(o.reverse || []),
    wunsch: new Set(o.wunsch || []), tausch: new Set(o.tausch || [])
});

describe('Reverse Holo: ob es sie gibt, sagt der Datensatz', () => {
    it('ein Reverse-Preis ueber null heisst: es gibt eine Reverse', () => {
        const r = regeln();
        assert.strictEqual(r.kartenHatReverse(MIT), true);
        assert.strictEqual(r.reversePreisZahl(MIT), 0.08);
    });
    it('fehlt das Feld oder steht 0, gibt es keine Reverse', () => {
        const r = regeln();
        assert.strictEqual(r.kartenHatReverse(OHNE), false);
        assert.strictEqual(r.kartenHatReverse(NULL), false);
    });
});

describe('Besitzfilter zaehlt nach der Ansicht', () => {
    const id = 'Musharna|BLK|36';
    it('Alle laesst alles durch', () => {
        const r = regeln();
        assert.strictEqual(r.besitzFilterPasst(OHNE, 'alle', 'reverse', listen()), true);
    });
    it('Normal: Im Besitz / Fehlt lesen den Normal-Zaehler', () => {
        const r = regeln();
        const l = listen({ normal: [[id, 2]] });
        assert.strictEqual(r.besitzFilterPasst(MIT, 'besitz', 'normal', l), true);
        assert.strictEqual(r.besitzFilterPasst(MIT, 'fehlt', 'normal', l), false);
        assert.strictEqual(r.besitzFilterPasst(OHNE, 'fehlt', 'normal', l), true);
    });
    it('Reverse: der Reverse-Zaehler entscheidet, nicht der Normal-Zaehler', () => {
        const r = regeln();
        const l = listen({ normal: [[id, 2]] });
        assert.strictEqual(r.besitzFilterPasst(MIT, 'besitz', 'reverse', l), false);
        assert.strictEqual(r.besitzFilterPasst(MIT, 'fehlt', 'reverse', l), true);
        const l2 = listen({ reverse: [[id, 1]] });
        assert.strictEqual(r.besitzFilterPasst(MIT, 'besitz', 'reverse', l2), true);
        assert.strictEqual(r.besitzFilterPasst(MIT, 'besitz', 'normal', l2), false);
    });
    it('Reverse: eine Karte ohne Reverse „fehlt“ nicht', () => {
        const r = regeln();
        assert.strictEqual(r.besitzFilterPasst(OHNE, 'fehlt', 'reverse', listen()), false);
    });
    it('Wunschliste und Tauschliste lesen ihre Liste, Print fuer Print', () => {
        const r = regeln();
        const l = listen({ wunsch: [id], tausch: ['Mega Sharpedo ex|PFL|61'] });
        assert.strictEqual(r.besitzFilterPasst(MIT, 'wunsch', 'normal', l), true);
        assert.strictEqual(r.besitzFilterPasst(OHNE, 'wunsch', 'normal', l), false);
        assert.strictEqual(r.besitzFilterPasst(OHNE, 'tausch', 'reverse', l), true);
        assert.strictEqual(r.besitzFilterPasst({ ...OHNE, number: '113' }, 'tausch', 'normal', l), false);
    });
});

describe('Set und Stufe in einer Zeile', () => {
    it('Basic, Stage 1 und Stage 2 werden abgekuerzt, Unbekanntes bleibt', () => {
        const r = regeln();
        assert.strictEqual(r.typKurz('Basic'), 'B');
        assert.strictEqual(r.typKurz('Stage 1'), 'S1');
        assert.strictEqual(r.typKurz('Stage 2'), 'S2');
        assert.strictEqual(r.typKurz('Item'), 'Item');
        assert.strictEqual(r.typKurz('VSTAR'), 'VSTAR');
    });
    it('der volle Name steht im title der Stufe', () => {
        assert.match(DB_CODE, /<span class="card-database-type" title="\$\{displayType\}">\$\{escapeHtml\(typKurz\(card\.type/);
    });
});

describe('Kachel: Bestand oben, Listen unten', () => {
    it('das alte runde Bestandsabzeichen steht nicht mehr in der Kachel', () => {
        const kachel = ohneKommentare(schneideFunktion(DB, 'createCardDatabaseItem'));
        assert.ok(!/card-database-owned-badge"/.test(kachel), 'owned-badge noch in createCardDatabaseItem');
        assert.ok(!/card-database-alt-owned-badge"/.test(kachel), 'alt-owned-badge noch in createCardDatabaseItem');
        assert.match(kachel, /bestandPilleHtml\(card, cardId/);
    });
    it('oben nur − und +, ♡ und ⇄ in der Listenzeile', () => {
        const kachel = ohneKommentare(schneideFunktion(DB, 'createCardDatabaseItem'));
        const oben = kachel.slice(kachel.indexOf('card-database-top-actions'), kachel.indexOf('card-database-info'));
        assert.match(oben, /sammlungMinusAusDb/);
        assert.match(oben, /sammlungPlusAusDb/);
        assert.ok(!/toggleWishlistFromCardDbButton|toggleTradelistFromCardDbButton/.test(oben), '♡/⇄ noch oben auf dem Bild');
        const unten = kachel.slice(kachel.indexOf('card-database-listen-row'));
        assert.match(unten, /toggleWishlistFromCardDbButton/);
        assert.match(unten, /toggleTradelistFromCardDbButton/);
    });
    it('− + folgen der Ansicht (ausgefuehrt)', () => {
        const aufrufe = [];
        const ctx = {
            sammlungAnsicht: 'normal',
            addToCollection: id => aufrufe.push(['add', id]),
            removeFromCollection: id => aufrufe.push(['rm', id]),
            addReverseToCollection: id => aufrufe.push(['addR', id]),
            removeReverseFromCollection: id => aufrufe.push(['rmR', id])
        };
        vm.createContext(ctx);
        vm.runInContext(schneideFunktion(DB, 'sammlungPlusAusDb') + '\n' + schneideFunktion(DB, 'sammlungMinusAusDb')
            + '\nthis.plus = sammlungPlusAusDb; this.minus = sammlungMinusAusDb;', ctx);
        const knopf = { getAttribute: () => 'Musharna|BLK|36' };
        ctx.plus(knopf); ctx.minus(knopf);
        ctx.sammlungAnsicht = 'reverse';
        vm.runInContext('sammlungAnsicht = "reverse";', ctx);
        ctx.plus(knopf); ctx.minus(knopf);
        assert.deepStrictEqual(aufrufe.map(a => a[0]), ['add', 'rm', 'addR', 'rmR']);
    });
});

describe('Rarity Switcher: weitere Prints auf die Wunschliste', () => {
    it('jeder Print bekommt einen eigenen ♡-Knopf mit seiner Kennung', () => {
        const oeffnen = ohneKommentare(schneideFunktion(DB, 'openRaritySwitcher'));
        assert.match(oeffnen, /raritySwitcherWunschKnopf\(_rsCollId\)/);
        assert.match(oeffnen, /const _rsCollId = `\$\{actualCardName\}\|\$\{version\.set\}\|\$\{version\.number\}`/);
    });
    it('der Knopf schaltet genau diesen Print (ausgefuehrt)', async () => {
        const wunsch = new Set(['Emcee\'s Hype|DLR|92']);
        const ctx = {
            window: { userWishlist: wunsch },
            t: k => k,
            toggleWishlist: async id => { if (wunsch.has(id)) wunsch.delete(id); else wunsch.add(id); }
        };
        vm.createContext(ctx);
        vm.runInContext('async ' + schneideFunktion(DB, 'raritySwitcherWunsch') + '\nthis.f = raritySwitcherWunsch;', ctx);
        const klassen = new Set();
        const btn = {
            getAttribute: () => 'Emcee\'s Hype|DLR|128',
            setAttribute() {}, classList: { toggle: (k, an) => { if (an) klassen.add(k); else klassen.delete(k); } },
            textContent: ''
        };
        await ctx.f(btn);
        assert.ok(wunsch.has('Emcee\'s Hype|DLR|128'), 'Full Art nicht auf der Wunschliste');
        assert.ok(wunsch.has('Emcee\'s Hype|DLR|92'), 'der bestehende Print ist verschwunden');
        assert.strictEqual(btn.textContent, 'rarity.wunschDrauf');
    });
    it('aus der Wunschliste geoeffnet: kein „Diesen Print zeigen“', () => {
        const oeffnen = ohneKommentare(schneideFunktion(DB, 'openRaritySwitcher'));
        assert.match(oeffnen, /const ohneZeigen = anzeigeZiel === 'wunschliste';/);
        assert.match(oeffnen, /nurAnzeige \? \(ohneZeigen \? '' :/);
        const wl = ohneKommentare(lies('js/firebase-collection.js'));
        assert.match(wl, /openRaritySwitcherFromDB\('\$\{safeNameJs\}'[\s\S]{0,200}?'wunschliste'\)/);
    });
});

describe('Top-Karten: das Herz gehoert dem angezeigten Print', () => {
    it('nach einem Druckwechsel traegt das Herz die neue Kennung (ausgefuehrt)', () => {
        const TIER = lies('js/app-tier-meta.js');
        const herz = { attrs: { 'data-wunsch-id': 'Emcee\'s Hype|DLR|92' }, setAttribute(k, v) { this.attrs[k] = v; } };
        const img = { getAttribute: () => 'alt.png', setAttribute() {} };
        const el = { dataset: {}, querySelector: s => s === '.top-card-img' ? img : (s === '.top-card-herz' ? herz : null) };
        let abgeglichen = 0;
        const ctx = {
            document: { querySelectorAll: () => [el] },
            staplesListe: () => [{ name: 'Emcee\'s Hype', set: 'DLR', number: '128', url: 'neu.png' }],
            staplesHerzenAbgleichen: () => { abgeglichen++; }
        };
        vm.createContext(ctx);
        vm.runInContext(schneideFunktion(TIER, 'zeichneStaplesBilderNeu') + '\nzeichneStaplesBilderNeu();', ctx);
        assert.strictEqual(herz.attrs['data-wunsch-id'], 'Emcee\'s Hype|DLR|128');
        assert.strictEqual(abgeglichen, 1);
    });
    it('der Klick liest die Kennung aus dem Attribut, nicht aus einem festen String', () => {
        const TIER = ohneKommentare(lies('js/app-tier-meta.js'));
        assert.match(TIER, /onclick="addToWishlist\(this\.getAttribute\('data-wunsch-id'\)\)"/);
    });
});

describe('Konto: Reverse ist ein eigener Zaehler', () => {
    const FC = ohneKommentare(lies('js/firebase-collection.js'));
    const FG = ohneKommentare(lies('js/firebase-globals.js'));
    it('geschrieben wird collectionReverseCounts, per FieldPath', () => {
        const add = schneideFunktion(FC, 'addReverseToCollection');
        assert.match(add, /countFieldRef\('collectionReverseCounts', cardId\)/);
        assert.match(add, /vorher >= 4/);
    });
    it('geladen, beim Abmelden geleert und beim Zuruecksetzen mitgeleert', () => {
        assert.match(FG, /window\.userCollectionReverseCounts = new Map\(Object\.entries\(flattenCountsObject\(data\.collectionReverseCounts \|\| \{\}\)\)\)/);
        assert.match(FG, /userCollectionReverseCounts: \(\) => new Map\(\)/);
        assert.match(FC, /collectionReverseCounts: \{\}/);
    });
});
