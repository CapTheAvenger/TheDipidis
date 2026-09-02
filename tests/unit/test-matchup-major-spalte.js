'use strict';
/*
 * Die aufgeklappte Matchup-Tabelle traegt online UND Major.
 *
 * ANLASS (02.09.2026)
 * -------------------
 * Betreiber: "ausgeklappt auf VS Deck Ebene sehe ich nicht das Online und
 * Major jeweils angezeigt wird."
 *
 * ZWEI SPALTEN MIT ZWEI NAMEN, WEIL ES ZWEI GROESSEN SIND.
 *
 * Links steht S/(S+N) — Siege durch entschiedene Partien, geglaettet.
 * Rechts stehen MATCHPUNKTE (3S+U)/3n. Das ist keine Nachlaessigkeit,
 * sondern die Grenze der Quelle: `labs_tournament_matchups_*.csv` fuehrt je
 * Paarung nur `vs_count` und `vs_win_pct` und KEINE Bilanz. Ohne die
 * Unentschieden je Paarung laesst sich das nicht auf die Online-Skala
 * bringen, und labs veroeffentlicht sie nicht — der Scraper liest die zwei
 * Zellen, die dastehen (labs_tournament_scraper.py:1785).
 *
 * Zwei Spalten mit demselben Namen und zwei Rechnungen waeren genau der
 * Fehler, den diese Seite seit Wochen abarbeitet. Zwei VERSCHIEDENE Namen
 * fuer zwei verschiedene Groessen sind in Ordnung — solange der Kopf sagt,
 * was jede ist. Der gemessene Abstand steht im Hinweis jeder Zelle:
 * Median -2,0 pp, davon -1,8 pp reine Zaehlweise (11 % Unentschieden am
 * Major gegen 1,3 % online).
 *
 * ABDECKUNG, gemessen an Mega Excadrill: 15 von 20 Paarungen haben einen
 * Major-Wert, 7 davon unter 10 Partien. Grimmsnarl Froslass steht mit
 * 100,0 % auf ZWEI Partien da — deshalb die Markierung, und deshalb steht
 * die Partienzahl in einer eigenen Spalte daneben statt nur im Hinweis.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const karte = lies(path.join('js', 'app-archetype-card.js'));
const karteK = ohneKomm(karte);
const meta = ohneKomm(lies(path.join('js', 'app-current-meta.js')));

describe('Die Datei wird nur einmal gelesen', () => {

    it('die Karte holt die Praesenz-Matchups vom Heatmap-Modul', () => {
        // Zwei Parser fuer eine Datei sind zwei Zahlen fuer eine Sache,
        // sobald einer angefasst wird — dieselbe Begruendung, aus der
        // getArchetypeShares() existiert.
        assert.ok(/window\.ladeMajorMatchups = ladeMajorMatchups/.test(meta),
            'js/app-current-meta.js reicht den Lader nicht mehr nach aussen');
        assert.ok(/window\.ladeMajorMatchups\(\)/.test(karteK),
            'die Karte parst die Labs-Matchups wieder selbst — dann gibt es '
            + 'zwei Parser fuer eine Datei');
    });

    it('ein fehlender Verweis laesst die Spalte leer, nicht die Karte kaputt', () => {
        assert.ok(/typeof window\.ladeMajorMatchups === 'function'/.test(karteK),
            'die Karte prueft nicht mehr, ob es den Lader gibt');
        // Auf den AUFRUF pruefen, nicht auf ein Fenster darum: _majorLaden
        // daneben hat sein eigenes catch, und die erste Fassung dieser
        // Zusage nahm das stellvertretend an.
        assert.ok(/window\.ladeMajorMatchups\(\)\s*\.catch\(/.test(karteK),
            'der Aufruf von ladeMajorMatchups() hat kein eigenes Fangnetz mehr — '
            + 'ein Fehler beim Laden reisst dann die ganze Karte mit. Die Spalte '
            + 'ist Zusatz, nie Voraussetzung');
    });
});

describe('Die beiden Spalten heissen verschieden', () => {

    it('die Praesenzspalte heisst nicht "Win Rate"', () => {
        /* Links steht S/(S+N), rechts stehen MATCHPUNKTE (3S+U)/3n. Zwei
           Spalten mit demselben Namen und zwei Rechnungen waeren genau der
           Fehler, den diese Seite seit Wochen abarbeitet.

           Seit dem 02.09.2026 heisst die Spalte kurz "Major-P" — die
           Kopfzeile hat in einer 411 px breiten Karte keinen Platz fuer
           mehr. Aufgeloest wird das Kuerzel in der Legende direkt unter
           der Tabelle; ein Kuerzel ohne Legende bleibt verboten. */
        const I18N = lies(path.join('js', 'i18n.js'));
        const werte = [...I18N.matchAll(/'arc\.colMajor':\s*'([^']*)'/g)].map(m => m[1]);
        assert.ok(werte.length >= 1, 'arc.colMajor fehlt in i18n.js');
        for (const w of werte) {
            assert.ok(!/win\s*rate/i.test(w),
                `die Praesenzspalte heisst "${w}" — dieselbe Ueberschrift `
                + 'wie die Siegquote links, obwohl es Matchpunkte sind');
        }
        const leg = [...I18N.matchAll(/'arc\.muLegende':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(leg.length, 2,
            `arc.muLegende steht ${leg.length}× in i18n.js, erwartet 2`);
        const deL = leg.find(z => /Matchpunkte/.test(z));
        assert.ok(deL, 'die deutsche Legende nennt die Matchpunkte nicht mehr');
        assert.ok(/Major-P/.test(deL),
            'die Legende loest "Major-P" nicht mehr auf');
    });

    it('der Spaltenkopf erklaert die Rechnung', () => {
        const i18n = lies(path.join('js', 'i18n.js'));
        const eintraege = [...i18n.matchAll(/'arc\.colMajorTip':\s*'([^']*)'/g)].map(x => x[1]);
        assert.strictEqual(eintraege.length, 2, 'der Hinweis fehlt in einer Sprache');
        for (const s of eintraege) {
            assert.ok(/Matchpunkte|match points/i.test(s),
                'der Kopf sagt nicht mehr, dass die Spalte Matchpunkte rechnet');
            assert.ok(/Bilanz|record/i.test(s),
                'der Kopf sagt nicht mehr, WARUM sie es tut (die Quelle liefert '
                + 'je Paarung keine Bilanz) — ohne den Grund liest es sich wie '
                + 'eine Nachlaessigkeit');
        }
    });

    it('jede Zelle nennt den Abstand zur Spalte links', () => {
        const i18n = lies(path.join('js', 'i18n.js'));
        const eintraege = [...i18n.matchAll(/'arc\.muMajorTip':\s*'([^']*)'/g)].map(x => x[1]);
        assert.strictEqual(eintraege.length, 2, 'der Zellen-Hinweis fehlt in einer Sprache');
        for (const s of eintraege) {
            assert.ok(/2 (Punkte|points)/.test(s),
                'der Hinweis beziffert den systematischen Abstand nicht mehr '
                + '(gemessen Median -2,0 pp, davon -1,8 reine Zaehlweise)');
        }
    });
});

describe('Die Partienzahl steht daneben', () => {

    it('sie hat eine eigene Spalte', () => {
        assert.ok(/arc-mu-major-n/.test(karteK),
            'die Spalte mit den Praesenzpartien ist weg — Grimmsnarl Froslass '
            + 'steht mit 100,0 % auf ZWEI Partien da, und ohne die Zahl '
            + 'daneben sieht das aus wie ein Ergebnis');
        assert.ok(/m\.majorAnzahl == null \? '–' : m\.majorAnzahl/.test(karteK),
            'die Partienzahl wird nicht mehr ausgegeben');
    });

    it('duenne Paarungen werden markiert', () => {
        assert.ok(/m\.majorAnzahl != null && m\.majorAnzahl < 10/.test(karteK),
            'die Markierung fuer duenne Paarungen ist weg');
        const css = ohneKomm(lies(path.join('css', 'styles.css')));
        assert.ok(/\.arc-mu-major-duenn\s*\{[^}]*font-style/.test(css),
            'die Markierung fehlt im Stylesheet');
    });

    it('fehlende Paarungen zeigen einen Strich, keine Null', () => {
        assert.ok(/m\.majorPunkte == null \? '–'/.test(karteK),
            'eine fehlende Praesenzpaarung wird nicht mehr als fehlend gezeigt — '
            + 'eine 0 liest sich als "nie gewonnen"');
        assert.ok(/arc\.muMajorFehlt/.test(karte),
            'der Hinweis fuer fehlende Paarungen ist weg');
    });
});

describe('Die Zahlen hinter der Spalte', () => {

    const zahl = (s) => parseFloat(String(s || '').replace(',', '.')) || 0;
    function teile(z, sep) {
        const r = []; let f = '', q = false;
        for (let i = 0; i < z.length; i++) {
            const c = z[i];
            if (c === '"') { if (q && z[i + 1] === '"') { f += '"'; i++; continue; } q = !q; continue; }
            if (c === sep && !q) { r.push(f); f = ''; continue; }
            f += c;
        }
        r.push(f); return r;
    }
    const L = lies(path.join('data', 'labs_tournament_matchups_TEF-PBL.csv'))
        .replace(/^﻿/, '').trim().split('\n');
    const kopf = teile(L[0], ',').map(s => s.trim());
    const rows = L.slice(1).map(l => { const c = teile(l, ','); const o = {};
        kopf.forEach((k, i) => { o[k] = (c[i] || '').trim(); }); return o; })
        .filter(r => r.day_filter === 'overall');

    it('die Quelle fuehrt je Paarung wirklich keine Bilanz', () => {
        // Wenn sie es doch tut, ist die ganze Begruendung hinfaellig — dann
        // gehoert die Spalte auf die Online-Skala gebracht statt erklaert.
        for (const feld of ['vs_wins', 'vs_losses', 'vs_ties', 'vs_record']) {
            assert.ok(kopf.indexOf(feld) === -1,
                `die Datei fuehrt jetzt "${feld}" — dann laesst sich die `
                + 'Praesenzspalte auf S/(S+N) umrechnen, und die zweite Spalte '
                + 'mit eigenem Namen ist nicht mehr noetig');
        }
        assert.ok(kopf.indexOf('vs_count') >= 0 && kopf.indexOf('vs_win_pct') >= 0,
            'vs_count oder vs_win_pct fehlen — die Spalte hat keine Quelle mehr');
    });

    it('genug Paarungen tragen einen Wert', () => {
        const mega = rows.filter(r => r.my_deck_name === 'Mega Excadrill');
        assert.ok(mega.length >= 10,
            `nur ${mega.length} Praesenzpaarungen fuer Mega Excadrill — unter 10 `
            + 'waere die Spalte mehr Strich als Zahl');
    });

    it('duenne Paarungen sind die Mehrheit, nicht die Ausnahme', () => {
        // Das ist der Grund fuer die Partienzahl-Spalte: wer sie nicht sieht,
        // liest 100,0 % aus zwei Partien wie 100,0 % aus zweihundert.
        const mit = rows.filter(r => (parseInt(r.vs_count || '0', 10) || 0) > 0);
        const duenn = mit.filter(r => (parseInt(r.vs_count, 10) || 0) < 10);
        assert.ok(duenn.length / mit.length > 0.3,
            `nur ${duenn.length} von ${mit.length} Paarungen liegen unter 10 `
            + 'Partien — wenn das dauerhaft so bleibt, koennte die Markierung '
            + 'strenger werden');
    });

    it('vs_win_pct sind Matchpunkte, nicht S/(S+N)', () => {
        // Dieselbe Zusage wie an der Heatmap. Wenn die Quelle die Konvention
        // wechselt, sind BEIDE Hinweise falsch.
        const decks = lies(path.join('data', 'labs_tournament_decks_TEF-PBL.csv'))
            .replace(/^﻿/, '').trim().split('\n');
        const dk = teile(decks[0], ',').map(s => s.trim());
        let treffer = 0, geprueft = 0;
        for (const z of decks.slice(1)) {
            const c = teile(z, ','); const o = {};
            dk.forEach((k, i) => { o[k] = (c[i] || '').trim(); });
            const w = zahl(o.wins), l = zahl(o.losses), t2 = zahl(o.ties), g = w + l + t2;
            if (g < 50) continue;
            geprueft++;
            if (Math.abs(((3 * w + t2) / (3 * g)) * 100 - zahl(o.win_pct)) < 0.05) treffer++;
        }
        assert.ok(geprueft >= 5, 'zu wenige Zeilen fuer die Pruefung');
        assert.strictEqual(treffer, geprueft,
            `nur ${treffer} von ${geprueft} Zeilen passen zur Matchpunkt-Formel — `
            + 'die Quelle hat ihre Konvention geaendert, und der Spaltenkopf '
            + 'stimmt dann nicht mehr');
    });
});

describe('Die acht Spalten passen, oder die Tabelle scrollt', () => {
    /* Kommentare zuerst weg. Die erste Fassung dieser Zusagen suchte im
       rohen Text — und fand "overflow-wrap: anywhere" in der Begruendung,
       die genau erklaert, warum es NICHT dastehen darf. Derselbe Fehler
       ist in diesem Projekt schon mehrfach passiert. */
    const css = fs.readFileSync(path.join(wurzel, 'css', 'styles.css'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ');

    it('die 42-px-Regel gilt nicht mehr fuer die Major-Spalten', () => {
        /* ANLASS (02.09.2026, mit Bild): die beiden letzten Ueberschriften
           klebten ineinander ("MAJOR-#PUNKTE"). Die Regel `nth-child(n+4)`
           gab jeder Spalte ab der vierten 42 px — gedacht fuer W, L und T
           mit ihren ein- bis dreistelligen Zahlen. Die beiden
           Major-Spalten aus PR #611 erbten das stillschweigend, und
           "Major-Punkte" braucht einlagig 96 px. */
        assert.ok(!/arc-mu-table th:nth-child\(n\+4\)/.test(css),
            'die Sammelregel ab Spalte 4 ist zurueck — dann erben die '
            + 'Major-Spalten wieder die 42 px fuer einstellige Zahlen');
        assert.match(css, /arc-mu-table th:nth-child\(7\)/,
            'die Major-Punkte-Spalte hat keine eigene Breite mehr');
        assert.match(css, /arc-mu-table th:nth-child\(8\)/,
            'die Major-Matches-Spalte hat keine eigene Breite mehr');
    });

    it('die Ueberschriften duerfen umbrechen — aber nicht im Wort', () => {
        const i = css.indexOf('.arc-mu-table thead th');
        assert.ok(i > 0, 'die Umbruchregel fuer die Kopfzeile fehlt');
        const rumpf = css.slice(i, css.indexOf('}', i));
        assert.match(rumpf, /white-space:\s*normal/,
            'die Kopfzellen stehen wieder auf nowrap — dann laeuft '
            + '"Major-Punkte" ueber statt umzubrechen');
        assert.ok(!/overflow-wrap:\s*anywhere/.test(rumpf),
            'overflow-wrap: anywhere ist zurueck — das bricht MITTEN im '
            + 'Wort ("Maj/or/punk/te") und ist schlimmer als der Ueberlauf');
        // Und sie muss die nowrap-Regel ueberhaupt schlagen koennen.
        assert.ok(/#(currentMetaContent|archetypeCardOverlay) \.arc-mu-table thead th/.test(css),
            'die Umbruchregel ist nicht mehr auf denselben Behaelter '
            + 'bezogen wie die nowrap-Regel und verliert damit gegen sie');
    });

    it('passt die Tabelle nicht, scrollt sie — statt zu ueberlappen', () => {
        assert.match(css, /\.arc-card \.mobile-table-scroll \{[^}]*overflow-x:\s*auto/,
            'der Behaelter steht wieder auf visible. Acht Spalten passen '
            + 'in eine 411 px breite Karte nicht: allein "Matches" braucht '
            + '66 px und kommt zweimal vor (online und Major)');
        const mb = /\.mobile-table-scroll \.arc-mu-table[^{]*\{[^}]*min-width:\s*(\d+)px/.exec(css);
        assert.ok(mb,
            'die Mindestbreite der Tabelle fehlt. Sie steht auf '
            + '`table-layout: fixed`, dort werden min-width-Angaben auf '
            + 'ZELLEN ignoriert — ohne sie draengt der Browser die '
            + 'Deckspalte auf 25 px zusammen');
        // Sie muss zur Summe der acht Spaltenbreiten passen, sonst
        // schrumpft der Browser wieder irgendeine davon zusammen.
        const breiten = [...css.matchAll(
            /#currentMetaContent \.arc-mu-table th:nth-child\((\d+)\)[\s\S]{0,400}?\{\s*(?:[^}]*?)width:\s*(\d+)px/g)]
            .map(m => Number(m[2]));
        const summe = breiten.reduce((a, b) => a + b, 0);
        assert.ok(Number(mb[1]) >= summe,
            `die Mindestbreite steht auf ${mb[1]} px, die gesetzten `
            + `Spaltenbreiten summieren sich aber auf ${summe} px`);
    });
});
