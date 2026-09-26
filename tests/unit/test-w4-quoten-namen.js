/**
 * W4 — DER ANGEZEIGTE NAME PASST ZUR GERECHNETEN KONVENTION.
 *
 * Der Suchlauf in tests/unit/test-w4-hausnamen.js sagt nur, dass KEIN
 * Hausname mehr dasteht. Er sagt nicht, dass der Name, der jetzt
 * dasteht, der RICHTIGE ist. Genau das ist hier die Frage, und sie ist
 * die teurere: „Win %" ist bei Limitless der Name der Matchpunkte
 * (3S+U)/(3·Partien). Eine S/(S+N+U)- oder S/(S+N)-Zahl so zu nennen
 * waere derselbe Fehler wie vorher, nur in die andere Richtung — und
 * der teurere, weil er der Quelle einen Namen unterschiebt, den sie
 * fuer etwas anderes benutzt.
 *
 * GEPRUEFT WIRD AN DEN AUFRUFSTELLEN, NICHT AN DEN HILFSFUNKTIONEN.
 * Ein Test, der nur `quotenName()` aufruft, bleibt gruen, wenn jemand
 * eine einzelne Beschriftung zurueckdreht — die Hilfsfunktion ist ja
 * noch da. Deshalb wird hier fuer jede Stelle der WIRKLICHE Ausdruck
 * aus der Datei gelesen und ausgefuehrt, mit den Hilfsfunktionen
 * derselben Datei und dem echten js/win-rate-konvention.js. Wer eine
 * Beschriftung zurueckdreht oder ihre Konvention vertauscht, faellt
 * hier durch.
 *
 * KEIN jsdom (der Testschritt in .github/workflows/deploy-pages.yml
 * installiert nur papaparse). Ausgefuehrt wird nur der Ausdruck selbst
 * in einem node:vm-Kontext, nicht das ganze Modul.
 *
 * ZUGRIFF AUF data/: eingetragen in
 * tests/unit/test-testdaten-wachhund.js. Geprueft werden GLEICHUNGEN
 * zwischen Bilanz und Prozentspalte ueber ALLE Zeilen, keine
 * Wochenwerte — welche Zahlen dort stehen, ist der Pruefung egal.
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

/* ── das Konventionsmodul, echt geladen ─────────────────────────── */

function konventionModul(sprache) {
    const fenster = { getLang: () => sprache };
    const kontext = vm.createContext({ window: fenster, console });
    kontext.window.window = fenster;
    vm.runInContext(lies('js/win-rate-konvention.js'), kontext);
    return fenster.WinRateKonvention;
}

/* ── die drei Konventionen als Rechnung ─────────────────────────── */

const RECHNE = {
    matchpunkte:       (s, n, u) => ((3 * s + u) / (3 * (s + n + u))) * 100,
    mitUnentschieden:  (s, n, u) => (s / (s + n + u)) * 100,
    ohneUnentschieden: (s, n)    => (s / (s + n)) * 100,
};

/* ── CSV, so weit wie noetig ────────────────────────────────────── */

function csv(datei, trenner) {
    const text = lies(datei).replace(/^﻿/, '');
    const zeilen = text.split(/\r?\n/).filter(z => z.trim() !== '');
    const kopf = zeilen[0].split(trenner).map(h => h.trim().replace(/^﻿/, ''));
    return zeilen.slice(1).map(z => {
        const felder = [];
        let feld = '', inAnf = false;
        for (const c of z) {
            if (c === '"') { inAnf = !inAnf; continue; }
            if (c === trenner && !inAnf) { felder.push(feld); feld = ''; continue; }
            feld += c;
        }
        felder.push(feld);
        const o = {};
        kopf.forEach((h, i) => { o[h] = (felder[i] || '').trim(); });
        return o;
    });
}

const zahl = (s) => parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));

/**
 * Welche der drei Konventionen die Prozentspalte einer Datei trifft —
 * ueber ALLE Zeilen, nicht an einem Einzelfall.
 *
 * @returns {{sieger:string, treffer:object, zeilen:number}}
 */
function gemesseneKonvention(datei, trenner, spalte, bilanzAus, toleranz) {
    const zeilen = csv(datei, trenner);
    const abw = { matchpunkte: [], mitUnentschieden: [], ohneUnentschieden: [] };
    let gezaehlt = 0;
    for (const r of zeilen) {
        const b = bilanzAus(r);
        if (!b) continue;
        const soll = zahl(r[spalte]);
        if (!isFinite(soll)) continue;
        gezaehlt++;
        for (const k of Object.keys(abw)) {
            const v = RECHNE[k](b[0], b[1], b[2]);
            abw[k].push(isFinite(v) ? Math.abs(v - soll) : Infinity);
        }
    }
    assert.ok(gezaehlt > 50, datei + ': nur ' + gezaehlt + ' auswertbare Zeilen');
    const treffer = {};
    for (const k of Object.keys(abw)) {
        treffer[k] = abw[k].filter(x => x <= toleranz).length;
    }
    const sieger = Object.keys(treffer).sort((a, b) => treffer[b] - treffer[a])[0];
    return { sieger, treffer, zeilen: gezaehlt };
}

const bilanzSpalten = (r) => {
    const s = parseInt(r.wins, 10), n = parseInt(r.losses, 10), u = parseInt(r.ties, 10);
    return [s, n, u].every(Number.isFinite) ? [s, n, u] : null;
};
const bilanzRecord = (r) => {
    const m = /^\s*(\d+)\s*-\s*(\d+)\s*-\s*(\d+)\s*$/.exec(r.record || '');
    return m ? [+m[1], +m[2], +m[3]] : null;
};

/* ── Hilfsfunktionen AUS DER DATEI holen und ausfuehren ─────────── */

/** Rumpf einer `function name(...) { … }` mit Klammerzaehlung. */
function funktionsQuelle(quelle, name) {
    const start = quelle.indexOf('function ' + name + '(');
    assert.ok(start >= 0, 'Funktion ' + name + ' gibt es nicht mehr');
    let i = quelle.indexOf('{', start), tiefe = 0;
    assert.ok(i > 0, 'Funktion ' + name + ' hat keinen Rumpf');
    for (; i < quelle.length; i++) {
        if (quelle[i] === '{') tiefe++;
        else if (quelle[i] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(start, i + 1); }
    }
    assert.fail('Funktion ' + name + ' ist nicht geschlossen');
}

/** Wert einer `const NAME = '…';`-Zeile aus der Datei. */
function konstante(quelle, name) {
    const m = new RegExp('(?:const|var|let)\\s+' + name + "\\s*=\\s*'([^']+)'").exec(quelle);
    assert.ok(m, 'die Konstante ' + name + ' gibt es nicht mehr');
    return m[1];
}

/** Wert eines i18n-Schluessels, je Sprache (1. Treffer = en, 2. = de). */
function i18nWert(schluessel, sprache) {
    const treffer = [...lies('js/i18n.js').matchAll(new RegExp(
        "'" + schluessel.replace(/\./g, '\\.') + "':\\s*'((?:[^'\\\\]|\\\\.)*)'", 'g'))];
    assert.equal(treffer.length, 2,
        schluessel + ' steht ' + treffer.length + '-mal in js/i18n.js, erwartet 2');
    return treffer[sprache === 'de' ? 1 : 0][1];
}

/**
 * Fuehrt einen Ausdruck AUS DER AUFRUFSTELLE aus.
 *
 * @param {string}   datei       Quelldatei, aus der die Helfer kommen
 * @param {string[]} helfer      Namen der Hilfsfunktionen, die der Ausdruck braucht
 * @param {string[]} konstanten  Namen der Konventionskonstanten
 * @param {string}   ausdruck    der Ausdruck, WOERTLICH aus der Datei gelesen
 * @param {object}   zusatz      weitere Bindungen (z. B. der i18n-Wert)
 * @param {string}   sprache     'de' | 'en'
 */
function fuehreAus(datei, helfer, konstanten, ausdruck, zusatz, sprache) {
    const quelle = lies(datei);
    const fenster = { getLang: () => sprache };
    const kontext = vm.createContext(Object.assign({ window: fenster, console }, zusatz || {}));
    kontext.window.window = fenster;
    vm.runInContext(lies('js/win-rate-konvention.js'), kontext);
    for (const k of konstanten) {
        vm.runInContext('var ' + k + ' = ' + JSON.stringify(konstante(quelle, k)) + ';', kontext);
    }
    for (const h of helfer) vm.runInContext(funktionsQuelle(quelle, h), kontext);
    return vm.runInContext('(' + ausdruck + ')', kontext);
}

/** Der Ausdruck muss WOERTLICH in der Datei stehen — sonst prueft der Test eine Erfindung. */
function ausDatei(datei, ausdruck) {
    assert.ok(lies(datei).includes(ausdruck),
        'dieser Ausdruck steht nicht (mehr) in ' + datei + ':\n  ' + ausdruck
        + '\n  Der Test prueft sonst etwas, das es nicht gibt.');
    return ausdruck;
}

/* ══════════════════════════════════════════════════════════════════ */

describe('W4 — die gerechnete Konvention, an den echten Dateien gemessen', () => {

    it('data/limitless_online_decks_matchups.csv rechnet S/(S+N)', () => {
        const g = gemesseneKonvention('data/limitless_online_decks_matchups.csv', ';',
            'win_rate', bilanzRecord, 0.01);
        assert.equal(g.sieger, 'ohneUnentschieden',
            'die Spalte win_rate trifft nicht mehr S/(S+N): ' + JSON.stringify(g.treffer));
        assert.equal(g.treffer.ohneUnentschieden, g.zeilen,
            'nicht mehr alle Zeilen treffen S/(S+N)');
        // …und die beiden anderen liegen deutlich daneben, sonst waere die
        // Zuordnung eine Muenzwurfentscheidung.
        assert.ok(g.treffer.mitUnentschieden < g.zeilen * 0.9);
        assert.ok(g.treffer.matchpunkte < g.zeilen * 0.9);
    });

    it('data/limitless_online_decks.csv rechnet S/(S+N+U)', () => {
        const g = gemesseneKonvention('data/limitless_online_decks.csv', ';',
            'win_rate_numeric', bilanzSpalten, 0.01);
        assert.equal(g.sieger, 'mitUnentschieden',
            'die Spalte win_rate_numeric trifft nicht mehr S/(S+N+U): '
            + JSON.stringify(g.treffer));
        // Eine Zeile (Wailord) ist ein Datenfehler der Quelle und trifft KEINE
        // der drei — siehe js/win-rate-konvention.js.
        assert.ok(g.treffer.mitUnentschieden >= g.zeilen - 1);
        assert.ok(g.treffer.ohneUnentschieden < g.zeilen * 0.9);
        assert.ok(g.treffer.matchpunkte < g.zeilen * 0.9);
    });

    it('data/labs_tournament_decks.csv rechnet die Matchpunkte — nur DIESE heisst „Win %"', () => {
        const g = gemesseneKonvention('data/labs_tournament_decks.csv', ',',
            'win_pct', bilanzSpalten, 0.01);
        assert.equal(g.sieger, 'matchpunkte',
            'die Spalte win_pct trifft nicht mehr (3S+U)/(3n): ' + JSON.stringify(g.treffer));
        for (const sprache of ['de', 'en']) {
            assert.equal(konventionModul(sprache).kurz('matchpunkte'), 'Win %',
                '„Win %" gehoert nicht mehr den Matchpunkten — dann steht dieser '
                + 'Test auf einer anderen Zusage als der Rest des Hauses');
        }
    });

    it('data/limitless_online_decks_comparison.csv uebernimmt win_rate_numeric unveraendert', () => {
        /* Die Podiumskachel in js/app-meta-cards.js sortiert nach
           new_winrate DIESER Datei. Die Spalte hat keine eigene Bilanz —
           gemessen wird deshalb gegen die Bilanz der Deckdatei, ueber den
           Decknamen verbunden. */
        const decks = {};
        for (const r of csv('data/limitless_online_decks.csv', ';')) decks[r.deck_name] = r;
        const abw = { matchpunkte: [], mitUnentschieden: [], ohneUnentschieden: [] };
        let n = 0;
        for (const c of csv('data/limitless_online_decks_comparison.csv', ';')) {
            const d = decks[c.deck_name];
            if (!d) continue;
            const b = bilanzSpalten(d);
            const soll = zahl(c.new_winrate);
            if (!b || !isFinite(soll)) continue;
            n++;
            for (const k of Object.keys(abw)) abw[k].push(Math.abs(RECHNE[k](b[0], b[1], b[2]) - soll));
        }
        assert.ok(n > 50, 'nur ' + n + ' verbundene Zeilen');
        const treffer = {};
        for (const k of Object.keys(abw)) treffer[k] = abw[k].filter(x => x <= 0.01).length;
        assert.ok(treffer.mitUnentschieden >= n - 1,
            'new_winrate trifft nicht mehr S/(S+N+U): ' + JSON.stringify(treffer));
        assert.ok(treffer.ohneUnentschieden < n * 0.9);
        assert.ok(treffer.matchpunkte < n * 0.9);
    });

    it('das Kampftagebuch fuehrt Unentschieden im Nenner (aus dem Code, nicht aus Daten)', () => {
        /* HIER STEHT KEINE FREMDE DATEI DAHINTER: js/battle-journal.js
           rechnet ueber die vom Nutzer selbst eingetragenen Partien. Die
           Konvention ist deshalb im Code abzulesen — an allen vier
           Zaehlstellen ist der Nenner die Zahl ALLER Eintraege.
           GESPEICHERTE NUTZERDATEN WERDEN NICHT ANGEFASST; gelesen wird
           nur der Quelltext. */
        const bj = lies('js/battle-journal.js');
        for (const stelle of [
            "const total = filtered.length;",
            "const total = entries.length;",
            "const tot = entries.length;",
            "opp[o].total++;",
        ]) {
            assert.ok(bj.includes(stelle),
                'die Zaehlstelle „' + stelle + '" gibt es nicht mehr — die '
                + 'Konvention des Kampftagebuchs muss neu abgelesen werden');
        }
        // Der Beweis, dass Ties in `filtered`/`entries` DRIN sind: sie werden
        // aus derselben Menge gezaehlt.
        // 26.09.2026: gezaehlt wird aus `gespielt` statt aus `filtered`.
        // Der No-Show ist kein gespieltes Match und faellt vorher heraus —
        // die Unentschieden bleiben drin, und genau das ist hier die
        // Zusage: Zaehler und Nenner kommen aus DERSELBEN Menge.
        assert.match(bj, /const totalT = gespielt\.filter\(e => e\.result === 'tie'\)\.length;/);
        assert.match(bj, /const winRateLabel = gespielt\.length > 0/,
            'Nenner und Unentschieden muessen aus derselben Menge kommen');
        assert.match(bj, /const ties = entries\.filter\(e => e\.result === 'tie'\)\.length;/);
        // Und nirgends wird der Nenner um die Unentschieden gekuerzt.
        assert.ok(!/\.length\s*-\s*(totalT|ties|t)\b/.test(bj),
            'irgendwo werden die Unentschieden aus dem Nenner genommen — dann '
            + 'ist die Konvention S/(S+N) und die Beschriftung falsch');
        // Die Konstante sagt dasselbe.
        assert.equal(konstante(bj, 'BJ_KONVENTION'), 'mitUnentschieden');
    });
});

describe('W4 — der angezeigte Name, an den AUFRUFSTELLEN ausgefuehrt', () => {

    /* Jede Stelle: Datei, Ausdruck WOERTLICH aus der Datei, die
       Konvention, die dort gerechnet wird, und woher die belegt ist. */
    const STELLEN = [
        {
            name: 'Kampftagebuch — Kachel „Verlauf"',
            datei: 'js/battle-journal.js',
            helfer: ['bjQuotenName', 'bjQuotenFormel', 'bjMitQuote'],
            konstanten: ['BJ_KONVENTION'],
            ausdruck: "bjMitQuote(battleJournalText('bj.histWinRate', '{quote}'), BJ_KONVENTION)",
            schluessel: 'bj.histWinRate',
            konvention: 'mitUnentschieden',
            schreibt: ["<span>${escapeHtml(bjMitQuote(battleJournalText('bj.histWinRate', '{quote}'), BJ_KONVENTION))}</span>"],
        },
        {
            name: 'Kampftagebuch — Kachel der Matchup-Auswertung',
            datei: 'js/battle-journal.js',
            helfer: ['bjQuotenName', 'bjQuotenFormel', 'bjMitQuote'],
            konstanten: ['BJ_KONVENTION'],
            ausdruck: "bjMitQuote(battleJournalText('ma.winRate', '{quote}'), BJ_KONVENTION)",
            schluessel: 'ma.winRate',
            konvention: 'mitUnentschieden',
            schreibt: ["<span>${escapeHtml(bjMitQuote(battleJournalText('ma.winRate', '{quote}'), BJ_KONVENTION))}</span>"],
        },
        {
            name: 'Anti-Tech — Sprechblase der Gegner-Pille',
            datei: 'js/app-anti-tech.js',
            helfer: ['_quotenName', '_quotenFormel', '_mitQuote'],
            konstanten: ['ANTI_TECH_KONVENTION'],
            ausdruck: "_mitQuote(_t('antiTech.wrTooltip', '{quote} ({formel}) against this deck — red means tech priority'), ANTI_TECH_KONVENTION)",
            schluessel: 'antiTech.wrTooltip',
            konvention: 'ohneUnentschieden',
            binder: '_t',
        },
        {
            name: 'Anti-Tech — Legende ueber den Pillen',
            datei: 'js/app-anti-tech.js',
            helfer: ['_quotenName', '_quotenFormel', '_mitQuote'],
            konstanten: ['ANTI_TECH_KONVENTION'],
            ausdruck: "_mitQuote(\n                (roh && roh !== 'antiTech.legendWr') ? roh : '{quote} ({formel})',\n                ANTI_TECH_KONVENTION)",
            schluessel: 'antiTech.legendWr',
            konvention: 'ohneUnentschieden',
            binder: 'roh',
        },
        {
            name: 'Laufendes Meta — Podiumskachel „Top 3"',
            datei: 'js/app-meta-cards.js',
            helfer: ['_mcKartenQuotenFormel', '_mcKartenQuotenName'],
            konstanten: ['_MC_KARTEN_KONVENTION'],
            ausdruck: '_mcKartenQuotenName(_MC_KARTEN_KONVENTION)',
            konvention: 'mitUnentschieden',
            /* WO DAS ERGEBNIS WIRKLICH HINGESCHRIEBEN WIRD. Ohne diesen
               Anker bleibt der Test gruen, wenn jemand nur die
               innerHTML-Zeile auf „Top 3 by Win Rate" zurueckdreht und
               die Hilfszuweisung stehen laesst — dann rechnet die Datei
               den Namen aus und benutzt ihn nicht. Genau das ist bei der
               Mutationsprobe am 08.09.2026 durchgerutscht. */
            schreibt: ['const _qName = _mcKartenQuotenName(_MC_KARTEN_KONVENTION);',
                       'Top 3 \u2013 ${escapeHtml(_qName)}:</strong>'],
        },
        {
            name: 'Quellen & Methodik — Glossareintrag',
            datei: 'js/app-quellen.js',
            helfer: ['quotenFormel', 'quotenName', 'mitQuote'],
            konstanten: ['QU_GLOSSAR_KONVENTION'],
            ausdruck: 'mitQuote(z[0], QU_GLOSSAR_KONVENTION)',
            schluessel: null,
            konvention: 'mitUnentschieden',
            binder: 'z',
            schreibt: ["esc(mitQuote(z[0], QU_GLOSSAR_KONVENTION))"],
        },
    ];

    it('es sind genug Stellen, um etwas zu heissen', () => {
        assert.ok(STELLEN.length >= 3,
            'unter drei Stellen prueft dieser Test nichts Belastbares mehr');
    });

    for (const stelle of STELLEN) {
        it(stelle.name + ' traegt den Namen seiner Konvention (beide Sprachen)', () => {
            ausDatei(stelle.datei, stelle.ausdruck);
            for (const anker of (stelle.schreibt || [])) ausDatei(stelle.datei, anker);
            for (const sprache of ['de', 'en']) {
                const K = konventionModul(sprache);
                const soll  = K.kurz(stelle.konvention);
                const falsch = K.kurz('matchpunkte');            // „Win %"
                const andere = Object.keys(RECHNE)
                    .filter(k => k !== stelle.konvention)
                    .map(k => K.kurz(k));

                const zusatz = {};
                if (stelle.binder === '_t') {
                    zusatz._t = (k, f) => (stelle.schluessel ? i18nWert(k, sprache) : f);
                } else if (stelle.binder === 'roh') {
                    zusatz.roh = i18nWert(stelle.schluessel, sprache);
                } else if (stelle.binder === 'z') {
                    // Der Glossareintrag, WOERTLICH aus der Datei.
                    const q = lies(stelle.datei);
                    /* BEIDE SPRACHFASSUNGEN. Der Eintrag steht zweimal in
                       INHALT (de und en); wird nur eine zurueckgedreht,
                       traegt die andere Sprache wieder einen Hausnamen —
                       und der Test bliebe gruen, wenn er nur zaehlte, ob
                       es den Platzhalter ueberhaupt noch gibt. */
                    const anzahl = q.split("['{quote} ({formel})',").length - 1;
                    assert.equal(anzahl, 2,
                        'der Glossareintrag traegt den Platzhalter ' + anzahl
                        + '-mal, erwartet 2 (de + en)');
                    zusatz.z = ['{quote} ({formel})'];
                }
                if (stelle.schluessel && stelle.binder !== 'roh' && stelle.binder !== 'z') {
                    zusatz.battleJournalText = (k) => i18nWert(k, sprache);
                }

                const ergebnis = String(fuehreAus(stelle.datei, stelle.helfer,
                    stelle.konstanten, stelle.ausdruck, zusatz, sprache));

                assert.ok(ergebnis.includes(soll),
                    stelle.name + ' (' + sprache + ') zeigt nicht „' + soll
                    + '", sondern: ' + ergebnis);
                assert.ok(!ergebnis.includes('{quote}') && !ergebnis.includes('{formel}'),
                    stelle.name + ' (' + sprache + ') gibt den Platzhalter '
                    + 'ungefuellt aus: ' + ergebnis);
                /* DIE PROBE, UM DIE ES GEHT. Traegt eine S/(S+N+U)- oder
                   S/(S+N)-Zahl „Win %", ist das derselbe Fehler wie ein
                   Hausname — nur mit dem Namen der Quelle. */
                if (stelle.konvention !== 'matchpunkte') {
                    assert.ok(!ergebnis.includes(falsch),
                        stelle.name + ' (' + sprache + ') traegt „' + falsch
                        + '", rechnet aber ' + stelle.konvention + ': ' + ergebnis);
                }
                for (const a of andere) {
                    if (a === soll || soll.includes(a) || a.includes(soll)) continue;
                    assert.ok(!ergebnis.includes(a),
                        stelle.name + ' (' + sprache + ') traegt den Namen einer '
                        + 'anderen Konvention: ' + ergebnis);
                }
            }
        });
    }

    it('jede Kurzform traegt ihren Hinweis mit vollem Namen UND Formel', () => {
        /* „WR" ist zulaessig — aber nur, wenn voller Name und Formel als
           title bzw. data-hinweis danebenhaengen. Ohne den Hinweis waere
           es wieder ein Hausname. Geprueft an der Aufrufstelle: die Zeile,
           die das Kuerzel schreibt, und die Zeilen unmittelbar danach
           muessen den Hinweis setzen. */
        const mc = lies('js/app-meta-cards.js');
        const i = mc.indexOf("ths[1].textContent = 'WR';");
        assert.ok(i > 0, 'die Kurzform in der Matchup-Kopfzelle gibt es nicht mehr');
        const danach = mc.slice(i, i + 400);
        assert.match(danach, /setAttribute\('title',\s*\n?\s*_mcKartenQuotenHinweis\('ohneUnentschieden'\)\)/,
            'die Kopfzelle „WR" bekommt keinen title mit Namen und Formel mehr');
        assert.match(danach, /data-quote-konvention/,
            'die Kopfzelle „WR" sagt nicht mehr, welche Konvention sie meint');

        // Und der Hinweis selbst enthaelt wirklich Name UND Formel.
        for (const sprache of ['de', 'en']) {
            const K = konventionModul(sprache);
            const hinweis = String(fuehreAus('js/app-meta-cards.js',
                ['_mcKartenQuotenFormel', '_mcKartenQuotenName', '_mcKartenQuotenHinweis'],
                ['_MC_KARTEN_KONVENTION'],
                "_mcKartenQuotenHinweis('ohneUnentschieden')", {}, sprache));
            assert.ok(hinweis.includes(K.kurz('ohneUnentschieden')),
                'der Hinweis nennt den vollen Namen nicht: ' + hinweis);
            assert.ok(hinweis.includes(K.hol('ohneUnentschieden').formel),
                'der Hinweis nennt die Formel nicht: ' + hinweis);
            assert.ok(!hinweis.includes(K.kurz('matchpunkte')),
                'der Hinweis nennt „Win %" fuer eine S/(S+N)-Zahl: ' + hinweis);
        }
    });

    it('die Leinwand des Kampftagebuchs traegt Name UND Formel — dort gibt es keine Sprechblase', () => {
        const bj = lies('js/battle-journal.js');
        ausDatei('js/battle-journal.js',
            '${winRate} % ${bjQuotenName(BJ_KONVENTION)}');
        ausDatei('js/battle-journal.js',
            'ctx.fillText(bjQuotenFormel(BJ_KONVENTION), 16, 96);');
        // Der Kopf muss hoch genug sein, sonst liegt die Formel unter der
        // ersten Partienzeile.
        const h = /const HEADER_H = (\d+);/.exec(bj);
        assert.ok(h && Number(h[1]) >= 112,
            'der Kopf der Leinwand ist wieder zu niedrig fuer die Formelzeile');
        for (const sprache of ['de', 'en']) {
            const K = konventionModul(sprache);
            const name = String(fuehreAus('js/battle-journal.js',
                ['bjQuotenName', 'bjQuotenFormel'], ['BJ_KONVENTION'],
                'bjQuotenName(BJ_KONVENTION)', {}, sprache));
            const formel = String(fuehreAus('js/battle-journal.js',
                ['bjQuotenName', 'bjQuotenFormel'], ['BJ_KONVENTION'],
                'bjQuotenFormel(BJ_KONVENTION)', {}, sprache));
            assert.equal(name, K.kurz('mitUnentschieden'));
            assert.equal(formel, K.hol('mitUnentschieden').formel);
            assert.notEqual(name, 'Win %',
                'die Leinwand nennt eine S/(S+N+U)-Zahl „Win %"');
        }
    });

    it('kein Name steht abgeschrieben in einer dieser Dateien', () => {
        /* Der Name muss ZUR LAUFZEIT aus js/win-rate-konvention.js
           kommen. Steht er abgeschrieben im Quelltext, laeuft er beim
           naechsten Umbenennen des Moduls auseinander — genau der
           Fehler, gegen den das Modul geschrieben wurde. */
        const K = konventionModul('de');
        const namen = ['mitUnentschieden', 'ohneUnentschieden'].map(k => K.kurz(k));
        const offen = [];
        for (const datei of ['js/app-anti-tech.js', 'js/app-meta-cards.js',
                             'js/app-quellen.js', 'js/battle-journal.js']) {
            const q = lies(datei)
                .replace(/\/\*[\s\S]*?\*\//g, ' ')
                .split('\n').map(z => (/^\s*\/\//.test(z) ? '' : z)).join('\n');
            for (const n of namen) {
                if (q.includes(n)) offen.push(datei + ' → „' + n + '"');
            }
        }
        assert.deepEqual(offen, [],
            'ein Konventionsname steht abgeschrieben im Quelltext statt aus dem '
            + 'Modul geholt zu werden:\n  ' + offen.join('\n  '));
    });
});
