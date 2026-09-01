'use strict';
/*
 * Eine Win Rate, eine Formel — jetzt auch dort, wo es niemand nachgesehen hat.
 *
 * ANLASS (01.09.2026)
 * -------------------
 * Der Betreiber schickte den Beleg aus der Quelle selbst: Limitless zeigt fuer
 * Mega Excadrill die Bilanz 6.430-6.666-110 und daneben 48,69 %.
 *
 *     6.430 + 6.666 + 110 = 13.206
 *     6.430 / 13.206      = 48,69 %
 *
 * Unentschieden stehen im NENNER, nicht als halber Sieg im Zaehler. Genau so
 * rechnet limitless_online_decks.csv (unser Wert 48,71 % auf einem Scrape mit
 * 2.849 statt 2.866 Listen), und genau so beschreibt es
 * js/win-rate-konvention.js als `mitUnentschieden`.
 *
 * Zwei Stellen taten es trotzdem anders, beide mit der VIERTEN, erfundenen
 * Konvention (S + 0,5·U) / Partien — derselben, die win-rate-konvention.js am
 * 20.08.2026 entfernt und ausdruecklich nicht mehr auffuehrt ("wer sie
 * braucht, soll erklaeren, warum"):
 *
 *   1  DAS GLOSSAR. js/app-quellen.js definierte Win Rate als "Gewonnene
 *      Spiele geteilt durch gespielte Spiele, Unentschieden halb gezaehlt."
 *      Die Stelle, die den bekanntesten Widerspruch der Seite aufloesen soll,
 *      beschrieb ihn selbst — mit einer Formel, die keine einzige angezeigte
 *      Zahl benutzt. Abweichung von der angezeigten Quote: Median 0,49 pp,
 *      maximal 8,33 pp.
 *
 *   2  DIE FUN-EVENT-EMPFEHLUNGEN. js/app-meta-call.js rechnete die Spalte,
 *      die woertlich "Win %" heisst, ebenfalls so — mit dem Kommentar, das sei
 *      deckungsgleich mit `win_pct` der Labs-Datei. Nachgemessen ueber 1.897
 *      Zeilen mit mindestens 50 Partien:
 *
 *          (3S+U)/3G  — Matchpunkte      Ø 0,002 pp von win_pct
 *          (S+0,5U)/G — was dastand      Ø 2,519 pp, max 5,446 pp
 *
 *      `win_pct` SIND Matchpunkte. Der Kommentar war falsch, und die Formel
 *      war weder das eine noch das andere.
 *
 *      Wirkung: alle 14 Epochen sortieren sich um, groesster Sprung 18 Plaetze.
 *      Die alte Formel belohnte Unentschieden — Dhelmise (14,5 % U) stand ueber
 *      Mega Excadrill (7,9 % U), nach der Korrektur ist es umgekehrt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');

const zahl = (s) => parseFloat(String(s || '').replace(',', '.')) || 0;

function teile(z, sep) {
    const r = []; let f = '', q = false;
    for (let i = 0; i < z.length; i++) {
        const c = z[i];
        if (c === '"') { if (q && z[i + 1] === '"') { f += '"'; i++; continue; } q = !q; continue; }
        if (c === sep && !q) { r.push(f); f = ''; continue; }
        f += c;
    }
    r.push(f);
    return r;
}
function csv(rel, sep) {
    const L = lies(rel).replace(/^﻿/, '').trim().split('\n');
    const h = teile(L[0], sep).map(x => x.trim());
    return L.slice(1).map(l => {
        const c = teile(l, sep); const o = {};
        h.forEach((k, i) => { o[k] = (c[i] || '').trim(); });
        return o;
    });
}

describe('Die Quelle rechnet Siege durch alle Partien', () => {

    it('unsere gespeicherte Quote ist S/(S+N+U), nicht die halbe-Punkte-Formel', () => {
        // Der Beleg des Betreibers, an unseren eigenen Zahlen nachgerechnet.
        const zeilen = csv(path.join('data', 'limitless_online_decks.csv'), ';')
            .filter(r => zahl(r.wins) + zahl(r.losses) + zahl(r.ties) >= 500);
        assert.ok(zeilen.length >= 20, 'zu wenige Zeilen fuer die Pruefung');

        let sMit = 0, sHalb = 0;
        for (const r of zeilen) {
            const w = zahl(r.wins), n = zahl(r.losses), u = zahl(r.ties), g = w + n + u;
            const gezeigt = zahl(r.win_rate_numeric);
            sMit += Math.abs((w / g) * 100 - gezeigt);
            sHalb += Math.abs(((w + 0.5 * u) / g) * 100 - gezeigt);
        }
        const mit = sMit / zeilen.length, halb = sHalb / zeilen.length;
        assert.ok(mit < 0.05,
            `S/(S+N+U) weicht um ${mit.toFixed(3)} pp von der gespeicherten Quote ab — `
            + 'dann hat die Quelle ihre Konvention gewechselt und die ganze Anzeige '
            + 'gehoert neu bewertet');
        assert.ok(halb > mit * 10,
            'die halbe-Punkte-Formel trifft die gespeicherte Quote inzwischen '
            + 'genauso gut — dann sagt dieser Test nichts mehr aus');
    });

    it('die Labs-Spalte win_pct sind Matchpunkte, keine Siegquote', () => {
        // Wer sie ungeprueft neben eine Siegquote stellt, vergleicht Skalen.
        const zeilen = csv(path.join('data', 'labs_tournament_decks.csv'), ',')
            .filter(r => zahl(r.wins) + zahl(r.losses) + zahl(r.ties) >= 50);
        assert.ok(zeilen.length >= 500, 'zu wenige Labs-Zeilen fuer die Pruefung');

        let sMp = 0, sHalb = 0;
        for (const r of zeilen) {
            const w = zahl(r.wins), n = zahl(r.losses), u = zahl(r.ties), g = w + n + u;
            const datei = zahl(r.win_pct);
            sMp += Math.abs(((3 * w + u) / (3 * g)) * 100 - datei);
            sHalb += Math.abs(((w + 0.5 * u) / g) * 100 - datei);
        }
        const mp = sMp / zeilen.length, halb = sHalb / zeilen.length;
        assert.ok(mp < 0.05,
            `Matchpunkte weichen um ${mp.toFixed(3)} pp von win_pct ab — die Quelle `
            + 'hat ihre Konvention gewechselt');
        assert.ok(halb > 1.0,
            `die halbe-Punkte-Formel liegt nur ${halb.toFixed(3)} pp von win_pct `
            + 'entfernt — dann war der alte Kommentar doch nicht so falsch, und '
            + 'die Begruendung der Korrektur gehoert nachgezogen');
    });
});

describe('Die vierte Konvention steht nirgends mehr in einer Anzeige', () => {

    it('das Glossar erklaert Win Rate richtig', () => {
        const q = lies(path.join('js', 'app-quellen.js'));
        assert.ok(!/Unentschieden\s+halb\s+gez(ä|ae)hlt/.test(ohneKomm(q)),
            'das Glossar definiert Win Rate wieder als "Unentschieden halb '
            + 'gezaehlt" — das ist die vierte, erfundene Konvention, die '
            + 'js/win-rate-konvention.js ausdruecklich nicht auffuehrt. Die '
            + 'Stelle, die den Widerspruch aufloesen soll, beschriebe ihn selbst');
        const i = q.indexOf("['Win Rate',");
        assert.ok(i > 0, 'der Glossareintrag zu Win Rate ist verschwunden');
        const eintrag = q.slice(i, i + 700);
        assert.ok(/Nenner/.test(eintrag),
            'der Eintrag sagt nicht, dass Unentschieden im Nenner stehen');
    });

    it('die Fun-Event-Spalte rechnet keine halben Siege', () => {
        const mc = ohneKomm(lies(path.join('js', 'app-meta-call.js')));
        assert.ok(!/agg\.wins\s*\+\s*0\.5\s*\*\s*agg\.ties/.test(mc),
            'die Spalte "Win %" der Fun-Event-Empfehlungen rechnet wieder '
            + '(S + 0,5·U) / Partien. Gemessen liegt das Ø 2,52 pp neben der '
            + 'Datei-Spalte, die es angeblich nachbildet, und es belohnt '
            + 'Unentschieden: alle 14 Epochen sortieren sich um, groesster '
            + 'Sprung 18 Plaetze');
        assert.ok(/const winPct = games > 0 \? agg\.wins \/ games \* 100 : 0;/.test(mc),
            'die Spalte rechnet nicht mehr Siege durch alle Partien');
    });

    it('kein Anzeigepfad im Frontend rechnet halbe Siege', () => {
        // Breit gesucht, damit die naechste Stelle nicht wieder jahrelang
        // unbemerkt bleibt. win-rate-konvention.js darf die Formel nennen —
        // dort steht sie als Warnung, nicht als Rechnung.
        const dateien = fs.readdirSync(path.join(wurzel, 'js'))
            .filter(n => n.endsWith('.js') && n !== 'win-rate-konvention.js');
        const treffer = [];
        for (const name of dateien) {
            const txt = ohneKomm(lies(path.join('js', name)));
            if (/0\.5\s*\*\s*\w*[Tt]ies|[Tt]ies\s*\*\s*0\.5|0\.5\s*\*\s*\w*\.u\b/.test(txt)) {
                treffer.push(name);
            }
        }
        assert.deepStrictEqual(treffer, [],
            'diese Dateien zaehlen ein Unentschieden wieder als halben Sieg: '
            + treffer.join(', '));
    });
});
