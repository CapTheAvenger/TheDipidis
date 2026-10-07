'use strict';
/* V2-13 (Hausi 07.10.2026): Heatmap-Klick und Farbquelle, „Was fehlt“ in Quellen &
   Methodik, Kartendatenbank (neueste Sets zuerst, Preis, „Gespielt in“), Ueberschriften.
   Die Funktionen werden aus dem Quelltext geschnitten (Kommentare vorher entfernt)
   und ausgefuehrt. */
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
    throw new Error('Block offen: ' + kopf);
}
const META = ohneKommentare(lies('js/app-current-meta.js'));
const KARTEN = ohneKommentare(lies('js/app-cards-db.js'));

describe('Heatmap: Farbe nach online oder Major', () => {
    const ctx = { window: { CONV_MIN_N: 20 } };
    vm.runInNewContext(block(META, 'function heatmapFarbWert(') + ';this.f=heatmapFarbWert;', ctx);
    const f = ctx.f;
    it('online: der Online-Wert', () => {
        assert.equal(f('online', 61.2, { wr: 40, anzahl: 50 }), 61.2);
    });
    it('Major: der Major-Wert, wenn genug Matches', () => {
        assert.equal(f('major', 61.2, { wr: 40, anzahl: 50 }), 40);
    });
    it('Major unter der Stichprobengrenze oder ohne Bilanz: keine Farbe', () => {
        assert.equal(f('major', 61.2, { wr: 40, anzahl: 19 }), null);
        assert.equal(f('major', 61.2, { wr: null, anzahl: 50 }), null);
        assert.equal(f('major', 61.2, undefined), null);
    });
    it('die Zellfarbe haengt am gewaehlten Wert, nicht am Online-Wert', () => {
        assert.match(META, /const fw = heatmapFarbWert\(farbQuelle, winRate, mjF\);/);
        assert.match(META, /\} else if \(fw >= 55\.0\) \{/);
        assert.match(META, /\} else if \(fw <= 45\.0\) \{/);
        assert.ok(!/if \(winRate >= 55\.0\)/.test(META), 'die alte Bedingung am Online-Wert ist zurueck');
    });
    it('Umschalter mit aria-pressed, ein Knopf je Quelle', () => {
        assert.match(META, /setzeHeatmapFarbe\('online'\)/);
        assert.match(META, /setzeHeatmapFarbe\('major'\)/);
        assert.equal((META.match(/heatmap-farbe-btn" aria-pressed=/g) || []).length, 2);
    });
});

describe('Heatmap: Zeile und Zelle fuehren in die Deck-Analyse', () => {
    it('Zelle ruft navigateToCurrentMetaWithDeck mit dem Zeilendeck', () => {
        assert.match(META, /onclick="navigateToCurrentMetaWithDeck\('\$\{safeRow\}'\)">\$\{zellenHtml\}<\/td>/);
        assert.ok(!/showToast\('\$\{safeRow\} vs/.test(META), 'die Zelle zeigt wieder nur eine Meldung');
    });
    it('Zeilenkopf ist ein Knopf mit demselben Ziel', () => {
        assert.match(META, /<th class="heatmap-th-row"[^>]*><button type="button" class="heatmap-zeile-link" onclick="navigateToCurrentMetaWithDeck\('\$\{safeRowLink\}'\)"/);
    });
    it('das Ziel existiert', () => {
        assert.match(lies('js/app-core.js'), /function navigateToCurrentMetaWithDeck\(archetypeName\)/);
    });
});

describe('Quellen & Methodik: „Was fehlt“ aus den Verzeichnissen', () => {
    const QU = lies('js/app-quellen.js');
    const ctx = {};
    vm.runInNewContext(block(ohneKommentare(QU), 'function abdeckungZeilen(') + ';this.z=abdeckungZeilen;', ctx);
    const j = (p) => JSON.parse(lies(p));
    const zeilen = ctx.z(j('data/tournament_cards_manifest.json'),
        j('data/labs_tournament_decks_verzeichnis.json'),
        j('data/labs_matchups_je_turnier_verzeichnis.json'));
    it('jedes Format aus dem Manifest steht drin, je Spalte gegen das Verzeichnis', () => {
        const m = j('data/tournament_cards_manifest.json').meta_keys;
        const maj = new Set(j('data/labs_tournament_decks_verzeichnis.json').meta_keys);
        const mu = new Set(j('data/labs_matchups_je_turnier_verzeichnis.json').meta_keys);
        assert.equal(zeilen.length, m.length);
        for (const z of zeilen) {
            assert.equal(z.major, maj.has(z.format), z.format);
            assert.equal(z.matchups, mu.has(z.format), z.format);
        }
    });
    it('mindestens ein Format ohne Major-Daten wird als Luecke gezeigt', () => {
        assert.ok(zeilen.some((z) => !z.major), 'keine Luecke — dann waere der Abschnitt leer');
    });
    it('Abschnitt in beiden Sprachen, Kennung luecken', () => {
        assert.equal((QU.match(/id: 'luecken', auf: false, abdeckung: true/g) || []).length, 2);
    });
});

describe('Kartendatenbank', () => {
    it('Sets neueste zuerst nach der Set-Ordnung, unbekannte behalten ihren Platz', () => {
        const ctx = {};
        vm.runInNewContext(block(KARTEN, 'function kartenSetsNeuesteZuerst(') + ';this.f=kartenSetsNeuesteZuerst;', ctx);
        assert.deepEqual(Array.from(ctx.f(['SVI', 'PBL', 'X', '30C'], { SVI: 1, PBL: 9, '30C': 10 })),
            ['30C', 'PBL', 'SVI', 'X']);
    });
    it('Sortieren nach Preis: teuerste zuerst, ohne Preis ans Ende', () => {
        const ctx = { parseLocaleNumber: (s, d) => { const n = parseFloat(String(s).replace(',', '.')); return isNaN(n) ? d : n; } };
        const zweig = block(KARTEN, "} else if (sortOrder === 'price') {").replace(/^\} else if \(sortOrder === 'price'\) /, '');
        vm.runInNewContext('this.sortiere = function (cards) ' + zweig + ';', ctx);
        const k = [{ name: 'A', eur_price: '' }, { name: 'B', eur_price: '1,50' }, { name: 'C', eur_price: '12,00' }, { name: 'D', eur_price: '0' }];
        ctx.sortiere(k);
        assert.deepEqual(k.map((c) => c.name), ['C', 'B', 'A', 'D']);
    });
    it('„Gespielt in“: meiste Decks zuerst, dann Anteil', () => {
        const ctx = {};
        vm.runInNewContext(block(KARTEN, 'function kartenGespieltInListe(') + ';this.f=kartenGespieltInListe;', ctx);
        // Map aus dem Kontext — instanceof prueft gegen das Map desselben Realms
        const m = vm.runInContext("new Map([['Gardevoir', { decks: 5, groesse: 10 }], ['Zoroark', { decks: 9, groesse: 10 }], ['Klein', { decks: 3, groesse: 3 }], ['Leer', { decks: 0, groesse: 0 }]])", ctx);
        const l = ctx.f(m);
        assert.deepEqual(Array.from(l, (e) => e.archetyp), ['Zoroark', 'Gardevoir', 'Klein']);
        assert.ok(l[0].prozent > l[1].prozent);
    });
    it('Auswahl kennt Preis und Meta-Anteil', () => {
        const html = lies('index.html');
        assert.match(html, /<option value="price"/);
        assert.match(lies('js/i18n.js'), /'cards\.sortByCoverage':\s*'Nach Meta-Anteil'/);
    });
});

describe('Ueberschriften: genau eine Ebene 1 je Ansicht', () => {
    it('der Seitenkopf ist keine h1 mehr', () => {
        assert.ok(!/<h1[^>]*class="header-title"/.test(lies('index.html')));
    });
    it('Quellen & Methodik traegt aria-level 1', () => {
        assert.match(lies('index.html'), /<h2 id="quellenTitel" role="heading" aria-level="1">/);
    });
});

describe('Erhebung ohne Doppelung (UI-100 N2-08)', () => {
    it('„City League / City League“ wird einmal genannt, verschiedene Teile bleiben', () => {
        const ctx = {};
        vm.runInNewContext(block(KARTEN, 'function erhebungAnzeige(') + ';this.f=erhebungAnzeige;', ctx);
        assert.equal(ctx.f('City League / City League'), 'City League');
        assert.equal(ctx.f('Tournament / TEF-PBL'), 'Tournament / TEF-PBL');
        assert.equal(ctx.f(undefined), '');
    });
});
