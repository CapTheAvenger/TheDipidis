/**
 * Eine Bilanz, vier Win Rates — Gruppe 4 der Pruefrunde vom 20.08.2026.
 *
 * Mega Excadrill zeigte an einem Nachmittag 49,5 % / 49.46 % / 47,99 % /
 * 48,2 %, und keine der vier Zahlen sagte, wie sie Unentschieden
 * behandelt. Drei der Konventionen sind echt und gehoeren zu ihren
 * Quellen; eine war erfunden.
 *
 * Diese Datei prueft beides gegen die Rohdaten: dass die drei Formeln
 * wirklich die Konventionen ihrer Quellen sind, und dass die erfundene
 * vierte nirgends mehr gerechnet wird.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function ladeModul(sprache) {
    const quelle = lies('js/win-rate-konvention.js');
    const w = { getLang: () => sprache || 'de' };
    // eslint-disable-next-line no-new-func
    new Function('window', quelle)(w);
    return w.WinRateKonvention;
}

// Kleiner RFC4180-Leser: labs_tournament_decks.csv fuehrt Turniernamen
// mit Komma darin ("Regional Championship Mérida"), ein naives split(',')
// verschiebt dort die ganze Zeile.
function zerlege(zeile, trenner) {
    const felder = []; let feld = '', drin = false;
    for (let i = 0; i < zeile.length; i++) {
        const c = zeile[i];
        if (drin) {
            if (c === '"') {
                if (zeile[i + 1] === '"') { feld += '"'; i++; } else drin = false;
            } else feld += c;
        } else if (c === '"') drin = true;
        else if (c === trenner) { felder.push(feld); feld = ''; }
        else feld += c;
    }
    felder.push(feld);
    return felder;
}
function csv(pfad, trenner) {
    const zeilen = lies(pfad).replace(/^﻿/, '').trim().split(/\r?\n/);
    const kopf = zerlege(zeilen[0], trenner).map(k => k.trim());
    return zeilen.slice(1).map(z => {
        const f = zerlege(z, trenner);
        const o = {};
        kopf.forEach((k, i) => { o[k] = (f[i] || '').trim(); });
        return o;
    });
}
const zahl = (v) => parseFloat(String(v == null ? '' : v).replace(',', '.'));

describe('Die drei Konventionen sind die ihrer Quellen', () => {
    const W = ladeModul('de');

    it('Matchpunkte = die Konvention von labs_tournament_decks.csv', () => {
        const rows = csv('data/labs_tournament_decks.csv', ',');
        let maxMatch = 0, maxErfunden = 0, n = 0;
        for (const r of rows) {
            const s = zahl(r.wins), l = zahl(r.losses), u = zahl(r.ties);
            const quelle = zahl(r.win_pct);
            const p = s + l + u;
            if (!isFinite(quelle) || !(p > 0)) continue;
            n++;
            maxMatch = Math.max(maxMatch,
                Math.abs(W.KONVENTIONEN.matchpunkte.rechne(s, l, u) - quelle));
            maxErfunden = Math.max(maxErfunden,
                Math.abs(((s + 0.5 * u) / p) * 100 - quelle));
        }
        assert.ok(n > 4000, 'zu wenige Zeilen geprueft: ' + n);
        assert.ok(maxMatch < 0.01, 'Matchpunkte weichen ab: ' + maxMatch);
        // Und die erfundene Formel weicht messbar ab — darum ging es.
        assert.ok(maxErfunden > 5, 'die erfundene Formel passt ploetzlich: ' + maxErfunden);
    });

    it('Ohne Unentschieden = die Konvention der Matchup-Datei', () => {
        const rows = csv('data/limitless_online_decks_matchups.csv', ';');
        let max = 0, n = 0, mitU = 0;
        for (const r of rows) {
            const m = String(r.record || '').split('-').map(x => parseInt(x.trim(), 10));
            const quelle = zahl(r.win_rate);
            if (!isFinite(quelle) || !isFinite(m[0]) || !isFinite(m[1])) continue;
            n++;
            if (m[2] > 0) mitU++;
            max = Math.max(max,
                Math.abs(W.KONVENTIONEN.ohneUnentschieden.rechne(m[0], m[1]) - quelle));
        }
        assert.ok(n > 1000, 'zu wenige Zeilen: ' + n);
        assert.ok(mitU > 300, 'ohne Unentschieden waere der Test wertlos: ' + mitU);
        assert.ok(max < 0.02, 'Abweichung: ' + max);
    });

    it('Mit Unentschieden = die Konvention der Ladder-Datei', () => {
        const rows = csv('data/limitless_online_decks.csv', ';');
        let max = 0, n = 0;
        for (const r of rows) {
            const s = zahl(r.wins), l = zahl(r.losses), u = zahl(r.ties);
            const quelle = zahl(r.win_rate_numeric);
            if (!isFinite(quelle) || !(s + l + u > 0)) continue;
            n++;
            max = Math.max(max,
                Math.abs(W.KONVENTIONEN.mitUnentschieden.rechne(s, l, u) - quelle));
        }
        assert.ok(n > 100, 'zu wenige Zeilen: ' + n);
        assert.ok(max < 0.2, 'Abweichung: ' + max);
    });

    it('und die drei liefern für dieselbe Bilanz drei Zahlen', () => {
        // Dragapult, TEF-CRI: 4475 / 3323 / 1411 — das ist der Fall aus der
        // Pruefung, an dem die Ansicht 56,3 % zeigte und ihre eigene
        // Matchup-Datei acht Zeilen tiefer 53,7.
        const m = W.KONVENTIONEN.matchpunkte.rechne(4475, 3323, 1411);
        const mit = W.KONVENTIONEN.mitUnentschieden.rechne(4475, 3323, 1411);
        const ohne = W.KONVENTIONEN.ohneUnentschieden.rechne(4475, 3323);
        assert.ok(Math.abs(m - 53.70) < 0.01, 'Matchpunkte: ' + m);
        assert.ok(Math.abs(mit - 48.59) < 0.01, 'mit U: ' + mit);
        assert.ok(Math.abs(ohne - 57.39) < 0.01, 'ohne U: ' + ohne);
        // Die erfundene vierte lag genau dazwischen und gehoerte zu keiner Quelle.
        assert.ok(Math.abs((4475 + 0.5 * 1411) / 9209 * 100 - 56.25) < 0.01);
    });
});

describe('Jede Konvention kann sich benennen', () => {
    it('deutsch und englisch, mit Formel', () => {
        const de = ladeModul('de'), en = ladeModul('en');
        for (const id of ['matchpunkte', 'mitUnentschieden', 'ohneUnentschieden']) {
            assert.ok(de.kurz(id).length > 3, id);
            assert.ok(en.kurz(id).length > 3, id);
            /* "Win %" ist in beiden Sprachen dasselbe Wort — und das ist kein
               vergessener Uebersetzungsstring, sondern der Punkt: der Name ist
               am 05.09.2026 woertlich von Limitless uebernommen worden, damit
               niemand zwei Namen fuer dieselbe Spalte lernen muss. Die
               Uebersetzung steckt im langen Hinweis, der unten geprueft wird.
               Fuer die beiden anderen Konventionen gilt die Regel weiter. */
            if (id !== 'matchpunkte') {
                assert.notEqual(de.kurz(id), en.kurz(id), id + ' ist in beiden Sprachen gleich');
            } else {
                assert.equal(de.kurz(id), 'Win %', 'der Kurzname folgt nicht mehr Limitless');
                assert.equal(en.kurz(id), 'Win %', 'der Kurzname folgt nicht mehr Limitless');
                assert.notEqual(de.hinweis(id), en.hinweis(id),
                    'der lange Hinweis ist unuebersetzt — dann ist der Name '
                    + 'zwar von der Quelle, die Erklaerung aber nur einsprachig');
            }
            assert.ok(de.hinweis(id).includes(de.KONVENTIONEN[id].formel));
            assert.ok(en.hinweis(id).includes(en.KONVENTIONEN[id].formel));
            assert.ok(de.kurzHinweis(id).length < 70, 'zu lang für eine Kachel: ' + de.kurzHinweis(id));
        }
    });

    it('die Bilanz nennt die Unentschieden', () => {
        const W = ladeModul('de');
        assert.equal(W.bilanz(322, 217, 8), '322S · 217N · 8U');
        assert.equal(W.bilanz(3, 1), '3S · 1N');
    });

    it('die erfundene vierte Konvention steht nicht im Modul', () => {
        const quelle = lies('js/win-rate-konvention.js');
        // Sie darf im Kommentar vorkommen — als Warnung —, aber nicht als
        // rechnende Konvention.
        assert.ok(!/rechne:[\s\S]{0,200}0\.5\s*\*/.test(quelle));
        assert.equal(Object.keys(W_IDS()).length, 3);
        function W_IDS() { return ladeModul('de').KONVENTIONEN; }
    });
});

describe('Die Anzeigen nennen ihre Konvention', () => {
    it('Past Meta rechnet Matchpunkte, nicht mehr die erfundene Formel', () => {
        const PAST = lies('js/app-past-meta.js');
        assert.match(PAST, /KONVENTIONEN\.matchpunkte\.rechne\(wins, losses, ties\)/);
        assert.doesNotMatch(PAST, /\(wins \+ 0\.5 \* ties\) \/ games/);
        assert.match(PAST, /winPctHinweis = WK \? WK\.hinweis\('matchpunkte'\)/);
    });

    it('die Matchup-Spalte heisst nicht mehr "Sieg %", sondern wie bei Limitless', () => {
        /* 05.09.2026: aus "Matchpunkte %" wurde "Win %" — der Name, unter dem
           dieselbe Spalte bei Limitless steht. Die Rechnung dahinter ist
           unveraendert (3S+U)/3n; geaendert hat sich nur das Wort, und zwar
           in beiden Sprachen gleich. */
        const I18N = lies('js/i18n.js');
        assert.doesNotMatch(I18N, /'pm\.matchupColWinPct':\s+'Matchpunkte %'/);
        assert.doesNotMatch(I18N, /'pm\.matchupColWinPct':\s+'Match points %'/);
        assert.strictEqual(
            [...I18N.matchAll(/'pm\.matchupColWinPct':\s+'Win %'/g)].length, 2,
            'die Spalte heisst nicht in beiden Sprachen "Win %"');
        assert.strictEqual(
            [...I18N.matchAll(/'pm\.perfStatWinPct':\s+'Win %/g)].length, 2,
            'die kumulierte Statistik traegt noch den alten Namen');
        assert.match(lies('js/app-past-meta.js'), /wrTitel = wkMatch \? wkMatch\.hinweis\('matchpunkte'\)/);
    });

    it('das Wort "Matchpunkte" steht in keinem angezeigten Text mehr', () => {
        /* ANGEORDNET AM 05.09.2026: "lass uns einfach ueberall die Bezeichnung
           von limitless dafuer uebernehmen Win % ... matchpunkte klingt
           naemlich doof, etwas mit win ist schon besser".

           Geprueft wird, was der Leser sieht: die Textbausteine in i18n.js und
           die Namen/Hinweise des Konventionsmoduls. Im Quelltext DARF das Wort
           weiter stehen — ueber 30 Kommentare erklaeren damit die Rechnung,
           und der interne Bezeichner heisst weiter 'matchpunkte'. */
        const I18N = lies('js/i18n.js');
        const texte = [...I18N.matchAll(/^\s*'[\w.]+':\s*'([^']*)',?\s*$/gm)]
            .map((m) => m[1]);
        assert.ok(texte.length > 500, 'die Textbausteine wurden nicht gefunden: ' + texte.length);
        const treffer = texte.filter((t) => /Matchpunkt|match points/i.test(t));
        assert.deepStrictEqual(treffer, [],
            'diese angezeigten Texte tragen noch den alten Namen: ' + treffer.join(' | '));

        for (const sprache of ['de', 'en']) {
            const W = ladeModul(sprache);
            assert.doesNotMatch(W.kurz('matchpunkte'), /Matchpunkt|match points/i, sprache);
            assert.doesNotMatch(W.hinweis('matchpunkte'), /Matchpunkt|match points/i, sprache);
            assert.doesNotMatch(W.kurzHinweis('matchpunkte'), /Matchpunkt|match points/i, sprache);
        }

        /* Und die Zahl selbst bleibt, was sie war — der Name ist geaendert,
           nicht die Rechnung. 6-2-1 = 19/27 = 70,37 %. */
        const W = ladeModul('de');
        assert.ok(Math.abs(W.KONVENTIONEN.matchpunkte.rechne(6, 2, 1) - 70.37) < 0.01);
    });

    it('die Archetyp-Karte zeigt die Unentschieden', () => {
        const CARD = lies('js/app-archetype-card.js');
        assert.match(CARD, /ties: Number\.isFinite\(parts\[2\]\)/);
        assert.match(CARD, /class="arc-mu-u"/);
        assert.match(CARD, /hinweis\('ohneUnentschieden'\)/);
    });

    it('die Tier-Karte nennt ihre', () => {
        assert.match(lies('js/app-tier-meta.js'), /kurzHinweis\('mitUnentschieden'\)/);
    });
});
