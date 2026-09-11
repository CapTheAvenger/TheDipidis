'use strict';
/**
 * BEFUND B1 DER NACHPRUEFUNG (07.09.2026): EINE SCHAETZUNG SAH AUS WIE
 * EINE ZAEHLUNG.
 *
 * Auf der Anteilskachel der Archetyp-Karte stand "3.138 / 41.200", beide
 * Zahlen in derselben Schreibweise. 3.138 ist gezaehlt (Spalte count in
 * data/limitless_online_decks.csv). 41.200 ist es nicht: die Datei fuehrt
 * ueberhaupt keine Feldgroesse, der Wert wird aus der Anteilsspalte
 * hochgerechnet und ist nur die Mitte eines Bereichs, den diese Spalte
 * zulaesst. Daneben stand "1.506 Other" — 41.200 minus 39.694, also die
 * Differenz zweier Zahlen, von denen eine geschaetzt ist.
 *
 * Diese Datei prueft, dass beides jetzt als das dasteht, was es ist:
 *   * die Kachel schreibt "≈" vor den Nenner,
 *   * der Hinweis nennt den Rechenweg, die Spanne und "rund 1.500",
 *   * und die exakte Other-Zahl steht nur noch MIT ihrem Rechenweg da.
 *
 * KEIN WOCHENWERT WIRD BEHAUPTET. Die Kernprobe laeuft auf einem
 * GESETZTEN Feld (N = 10.000, zehn Zeilen, Rest unter "Other"), bei dem
 * jede erwartete Zahl von Hand nachrechenbar ist. Die Proben an den
 * echten Daten rechnen ihre Sollwerte aus derselben Datei, die der Code
 * liest — welche Decks dort diese Woche stehen, ist ihnen egal.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (rel) => fs.readFileSync(path.join(WURZEL, rel), 'utf8');

const UTILS = lies('js/app-utils.js');
const KARTE = lies('js/app-archetype-card.js');
const KONV = lies('js/win-rate-konvention.js');

/** Eine benannte Funktion aus einer Datei herausschneiden. */
function stueck(quelle, marke) {
    const start = quelle.indexOf(marke);
    assert.notEqual(start, -1, 'nicht gefunden: ' + marke);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', start); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, j + 1); }
    }
    assert.fail(marke + ': die Klammern gehen nicht auf');
    return '';
}

const PARSE_ZAHL = 'function parseLocaleNumber(v, f){ const n = Number(String(v==null?"":v)'
    + '.replace("%","").replace(",",".")); return Number.isFinite(n) ? n : (f===undefined?0:f); }';

function grunddom() {
    return {
        addEventListener() {}, removeEventListener() {},
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, addEventListener() {} }),
        readyState: 'complete',
        body: { classList: { add() {}, remove() {} }, appendChild() {} },
    };
}

/** js/app-archetype-card.js ausfuehren, mit dem ECHTEN feldGroesseAusAnteilen. */
function ladeKarte(sprache) {
    const sb = {
        console, document: grunddom(), getLang: () => (sprache || 'de'), t: (k) => k,
        fetch: () => Promise.resolve({ ok: false, text: () => Promise.resolve('') }),
        BASE_PATH: 'data/',
    };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(PARSE_ZAHL, sb);
    vm.runInContext(stueck(UTILS, 'function feldGroesseAusAnteilen(zeilen)'), sb);
    vm.runInContext('window.feldGroesseAusAnteilen = feldGroesseAusAnteilen;', sb);
    vm.runInContext(KONV, sb);
    vm.runInContext(KARTE, sb);
    assert.ok(sb._archetypeCardInternals, 'die Karte gibt ihre Innereien nicht nach aussen');
    return sb;
}

/** Dieselbe Schreibweise, die die Kachel benutzt (fmtGanz). */
const gross = (n) => Math.round(Number(n)).toLocaleString('de-DE');

/** Der Hinweistext einer Kachel, aus data-hinweis herausgeholt. */
function hinweis(html) {
    const m = /data-hinweis="([^"]*)"/.exec(html);
    assert.ok(m, 'die Kachel traegt keinen Hinweis');
    return m[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

/** Die Stueckzahl rechts auf der Anteilskachel. */
function anzahlZelle(html) {
    const m = /arc-halb-anzahl">([^<]*)</.exec(html);
    assert.ok(m, 'die Kachel hat kein Feld fuer die Stueckzahl');
    return m[1].trim();
}

/* ── Die Datei, gegen die gerechnet wird ────────────────────────────── */

function csv(rel) {
    const zeilen = lies(rel).replace(/^﻿/, '').trim().split(/\r?\n/);
    const kopf = zeilen[0].split(';').map(x => x.trim());
    return zeilen.slice(1).map(z => {
        const t = z.split(';'); const o = {};
        kopf.forEach((k, i) => { o[k] = (t[i] || '').trim(); });
        return o;
    });
}
const zahl = (v) => {
    const n = Number(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
};
const DECKS = csv('data/limitless_online_decks.csv');

/**
 * Der Sollwert der Spanne, im Test noch einmal gerechnet: die
 * Anteilsspalte steht auf zwei Nachkommastellen, jede Zeile laesst
 * deshalb ein Intervall fuer den Nenner zu. Geschnitten wird ueber die
 * Zeilen, die den gefundenen Nenner ueberhaupt zulassen.
 */
function spanneSoll(zeilen, n) {
    let von = 0, bis = Infinity;
    for (const z of zeilen) {
        if (!(z.anzahl > 0) || !(z.anteil > 0.005)) continue;
        const u = z.anzahl / ((z.anteil + 0.005) / 100);
        const o = z.anzahl / ((z.anteil - 0.005) / 100);
        if (!(u <= n && n <= o)) continue;
        if (u > von) von = u;
        if (o < bis) bis = o;
    }
    return { von, bis };
}

function alsDecks(zeilen) {
    const d = {};
    zeilen.forEach((z, i) => {
        d[z.name || ('Deck ' + i)] = { share: z.anteil, count: z.anzahl, winRate: 50, partien: 100 };
    });
    return d;
}

/* ══════════════════════════════════════════════════════════════════ */

describe('B1 — der Nenner der Anteilskachel steht als HOCHGERECHNET da', () => {

    /* Ein Feld, das niemand scrapt: 10.000 Listen, zehn benannte Decks
       mit zusammen 8.300 Listen (83,00 %), der Rest unter "Other". Jede
       erwartete Zahl unten ist von Hand nachrechenbar. */
    const GESETZT = [
        { name: 'Alpha',  anzahl: 2000, anteil: 20.00 },
        { name: 'Beta',   anzahl: 1500, anteil: 15.00 },
        { name: 'Gamma',  anzahl: 1200, anteil: 12.00 },
        { name: 'Delta',  anzahl:  900, anteil:  9.00 },
        { name: 'Epsilon', anzahl: 700, anteil:  7.00 },
        { name: 'Zeta',   anzahl:  600, anteil:  6.00 },
        { name: 'Eta',    anzahl:  500, anteil:  5.00 },
        { name: 'Theta',  anzahl:  400, anteil:  4.00 },
        { name: 'Iota',   anzahl:  300, anteil:  3.00 },
        { name: 'Kappa',  anzahl:  200, anteil:  2.00 },
    ];

    it('an gesetzten Zahlen: Nenner, Other und die Spanne beider', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        api.setData(alsDecks(GESETZT), null);
        const feld = api.onlineFeld();

        assert.equal(feld.gelistet, 8300, 'die Summe der gelisteten Listen stimmt nicht');
        assert.equal(feld.listen, 10000, 'der hochgerechnete Nenner stimmt nicht');
        assert.equal(feld.other, 1700, 'Other ist nicht Nenner minus gelistete Listen');
        assert.equal(Math.round(feld.anteilSumme * 100) / 100, 83,
            'die Anteilssumme wird nicht mitgefuehrt — dann kann der Hinweis sie nicht nennen');

        const soll = spanneSoll(GESETZT, 10000);
        assert.ok(feld.spanne, 'der Nenner kommt ohne Spanne — dann steht er wieder wie gezaehlt da');
        assert.equal(Math.round(feld.spanne.von * 100) / 100, Math.round(soll.von * 100) / 100);
        assert.equal(Math.round(feld.spanne.bis * 100) / 100, Math.round(soll.bis * 100) / 100);
        // Die engste Zeile ist Alpha (2.000 auf 20,00 %): 9.997,5 bis 10.002,5.
        assert.equal(Math.round(feld.spanne.von * 10) / 10, 9997.5);
        assert.equal(Math.round(feld.spanne.bis * 10) / 10, 10002.5);
        assert.equal(Math.round(feld.otherSpanne.von * 10) / 10, 1697.5);
        assert.equal(Math.round(feld.otherSpanne.bis * 10) / 10, 1702.5);
    });

    /* ── DER NENNER STEHT SEIT DEM 11.09.2026 NICHT MEHR AUF DER KACHEL
       Gemeldet: „Einmal hier die Werte, die bei Share stehen, hast Du ja
       online acht Komma eins Prozent. Da neben stehen dann irgendwelche
       Zahlen, die koennen weg … irgendwie stehen da bei online zwei
       verschiedene Zahlen. Also da auf jeden Fall nur eine Zahl
       schreiben."

       Geblieben ist die GEZAEHLTE: die Listen dieses Decks. Der
       hochgerechnete Nenner war ohnehin der fragwuerdigere der beiden —
       er steht unveraendert im Hinweis, samt Rechenweg, Spanne und
       „HOCHGERECHNET". Die Zusicherung dreht sich damit um: auf der
       Kachel darf er NICHT mehr stehen, im Hinweis muss er.

       Der Grund, warum das keine Verschlechterung ist: eine Zahl, der
       man ihre Herkunft nur im Hinweis ansieht, stand vorne wie eine
       gezaehlte. Jetzt steht vorne nur Gezaehltes. */
    it('auf der Kachel steht NUR die gezaehlte Zahl', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        api.setData(alsDecks(GESETZT), null);
        const html = api.tilesHtml('Alpha', 'embed');
        assert.equal(anzahlZelle(html), '2.000',
            'auf der Kachel stehen wieder zwei Zahlen');
        assert.ok(!/≈/.test(anzahlZelle(html)),
            'der hochgerechnete Nenner ist auf die Kachel zurueckgekehrt');
    });

    it('an gesetzten Zahlen: der Hinweis nennt Rechenweg, Spanne und "rund"', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        api.setData(alsDecks(GESETZT), null);
        const txt = hinweis(api.tilesHtml('Alpha', 'embed'));

        assert.ok(/HOCHGERECHNET/.test(txt),
            'der Hinweis sagt nicht, dass der Nenner hochgerechnet ist:\n' + txt);
        assert.ok(txt.includes('≈ 10.000 Listen'),
            'der Nenner steht im Hinweis ohne "≈":\n' + txt);
        assert.ok(txt.includes('(eingegrenzt auf 9.998 bis 10.003)'),
            'die Spanne des Nenners fehlt:\n' + txt);
        assert.ok(txt.includes('rund 1.700 Listen'),
            '"Other" steht nicht als gerundete Groesse da:\n' + txt);
        assert.ok(txt.includes('10.000 − 8.300 = 1.700'),
            'der Rechenweg fuer "Other" fehlt:\n' + txt);
        assert.ok(txt.includes('je nach Nenner 1.698 bis 1.703'),
            'die Spanne von "Other" fehlt:\n' + txt);
        assert.ok(txt.includes('83,00 % der Anteile'),
            'die Anteilssumme, aus der hochgerechnet wird, fehlt:\n' + txt);
    });

    it('die alte, scheingenaue Fassung ist weg', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        api.setData(alsDecks(GESETZT), null);
        const txt = hinweis(api.tilesHtml('Alpha', 'embed'));
        assert.ok(!/sie ist aus den Anteilen der Datei eingegrenzt \(/.test(txt),
            'der alte Satz ohne Kennzeichnung steht wieder da');
        assert.ok(!/1\.700 führt Limitless als/.test(txt),
            '"Other" wird wieder als gezaehlte Groesse geschrieben');
    });

    it('an den echten Daten: jede Zahl des Hinweises folgt aus der Datei', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        const decks = {};
        const zeilen = [];
        for (const r of DECKS) {
            decks[r.deck_name] = {
                share: zahl(r.share_numeric), winRate: zahl(r.win_rate_numeric),
                count: zahl(r.count), partien: zahl(r.wins) + zahl(r.losses) + zahl(r.ties),
            };
            zeilen.push({ anteil: zahl(r.share_numeric), anzahl: zahl(r.count) });
        }
        api.setData(decks, null);
        const feld = api.onlineFeld();
        assert.ok(feld.listen,
            'die Datei gibt heute keinen Nenner her — dann prueft diese Zusicherung nichts');

        // Sollwerte NEU aus der Datei, nicht abgeschrieben.
        const gelistet = DECKS.reduce((s, r) => s + zahl(r.count), 0);
        const anteilSumme = DECKS.reduce((s, r) => s + (zahl(r.count) > 0 ? zahl(r.share_numeric) : 0), 0);
        const soll = spanneSoll(zeilen, feld.listen);
        assert.equal(feld.gelistet, gelistet);
        assert.equal(Math.round(feld.anteilSumme * 1e6), Math.round(anteilSumme * 1e6));
        assert.equal(gross(feld.spanne.von), gross(soll.von));
        assert.equal(gross(feld.spanne.bis), gross(soll.bis));

        const erste = DECKS[0];
        const html = api.tilesHtml(erste.deck_name, 'embed');
        assert.equal(anzahlZelle(html), gross(zahl(erste.count)),
            'die Kachel schreibt wieder mehr als die eine gezaehlte Zahl');

        const txt = hinweis(html);
        assert.ok(txt.includes(`≈ ${gross(feld.listen)} Listen (eingegrenzt auf `
            + `${gross(soll.von)} bis ${gross(soll.bis)})`),
            'Nenner und Spanne stehen nicht so da, wie sie aus der Datei folgen:\n' + txt);
        assert.ok(txt.includes(`${gross(feld.listen)} − ${gross(gelistet)} = `
            + `${gross(feld.listen - gelistet)}`),
            'der Rechenweg fuer "Other" folgt nicht aus der Datei:\n' + txt);
        assert.ok(txt.includes('rund ' + gross(Math.round((feld.listen - gelistet) / 100) * 100)),
            '"Other" steht nicht gerundet da:\n' + txt);
    });

    it('an den echten Daten: die exakte Other-Zahl steht nur MIT Rechenweg da', () => {
        const sb = ladeKarte('de');
        const api = sb._archetypeCardInternals;
        const decks = {};
        for (const r of DECKS) {
            decks[r.deck_name] = { share: zahl(r.share_numeric), count: zahl(r.count),
                winRate: zahl(r.win_rate_numeric), partien: 0 };
        }
        api.setData(decks, null);
        const feld = api.onlineFeld();
        assert.ok(feld.other, 'ohne Other-Zahl prueft diese Zusicherung nichts');
        const txt = hinweis(api.tilesHtml(DECKS[0].deck_name, 'embed'));
        const marke = gross(feld.other);
        let ab = 0, treffer = 0;
        for (;;) {
            const i = txt.indexOf(marke, ab);
            if (i < 0) break;
            treffer++;
            assert.equal(txt.slice(Math.max(0, i - 2), i), '= ',
                `"${marke}" steht ohne seinen Rechenweg im Text — genau die `
                + `Scheingenauigkeit aus Befund B1:\n` + txt);
            ab = i + marke.length;
        }
        assert.equal(treffer, 1, 'die Other-Zahl steht nicht genau einmal da');
    });
});
