'use strict';
/*
 * Die aufgeklappte Matchup-Tabelle traegt online UND Major.
 *
 * ANLASS (02.09.2026)
 * -------------------
 * Betreiber: "ausgeklappt auf VS Deck Ebene sehe ich nicht das Online und
 * Major jeweils angezeigt wird."
 *
 * ZWEI SPALTEN, EINE RECHNUNG — SEIT DEM 03.09.2026.
 *
 * Bis dahin hiess die rechte Spalte "Major-P" und zeigte MATCHPUNKTE
 * (3S+U)/(3M), waehrend links S/(S+N) stand. Das war keine
 * Nachlaessigkeit, sondern die Grenze der Quelle:
 * `labs_tournament_matchups_*.csv` fuehrte je Paarung nur `vs_count` und
 * `vs_win_pct` und KEINE Bilanz. Ohne die Unentschieden je Paarung liess
 * sich das nicht auf die Online-Skala bringen.
 *
 * Der Betreiber wollte einen Namen ("das sollten wir auch WR nennen,
 * damit wir hier ueberall Gleiches benutzen"). Der Weg dorthin war nicht,
 * die Beschriftung zu aendern, sondern die Zahl: seit PR #639 scrapt
 * labs_tournament_scraper.py die Bilanz je Paarung mit (vs_wins /
 * vs_losses / vs_ties). Die Spalte rechnet jetzt S/(S+N) mit demselben
 * 20-Partien-Prior wie links und heisst deshalb "Major-WR".
 *
 * DIE ZUSICHERUNG DREHT SICH DAMIT UM. Vorher stand hier: "die Quelle
 * fuehrt je Paarung wirklich keine Bilanz" — mit dem Hinweis, dass die
 * ganze Begruendung hinfaellig ist, sobald sie es doch tut. Genau das ist
 * eingetreten. Jetzt steht hier: die Bilanz IST da, und sie passt zur
 * Partienzahl daneben.
 *
 * `vs_win_pct` bleibt in der Datei und bleibt geprueft (Matchpunkte) —
 * nicht, weil es angezeigt wird, sondern weil ein stiller Griff danach
 * wieder zwei Rechnungen unter einem Namen erzeugen wuerde.
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

describe('Beide Spalten heissen WR, weil beide WR rechnen', () => {

    it('die Praesenzspalte heisst Major-WR', () => {
        /* Bis zum 02.09.2026 hiess sie "Major-P", und diese Zusicherung
           verbot ihr den Namen "Win Rate" — zu Recht, solange sie
           Matchpunkte zeigte. Seit die Bilanz je Paarung mitgescrapt wird,
           rechnet sie S/(S+N) wie die Spalte links, und der gleiche Name
           ist nicht mehr irrefuehrend, sondern die Zusage.

           Die Zusicherung bleibt scharf: sie verlangt WR im Namen UND
           weiter unten, dass die Zelle wirklich aus der Bilanz rechnet.
           Nur eines von beidem waere der alte Fehler mit vertauschten
           Vorzeichen. */
        const I18N = lies(path.join('js', 'i18n.js'));
        const werte = [...I18N.matchAll(/'arc\.colMajor':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(werte.length, 2, 'arc.colMajor fehlt in einer Sprache');
        for (const w of werte) {
            assert.ok(/WR/.test(w),
                `die Praesenzspalte heisst "${w}" — sie rechnet dieselbe `
                + 'Win Rate wie links und soll auch so heissen');
            assert.ok(/Major/i.test(w),
                `"${w}" sagt nicht mehr, dass es die Praesenzturniere sind`);
        }
    });

    it('die Partienspalte ist ausgeschrieben, nicht abgekuerzt', () => {
        /* Betreiber: "ausschreiben immer besser als Abkuerzungen. Aber da,
           wo wir Abkuerzungen nutzen, ... WR ist ja 'n Standard fuer
           Winrate, also Major WR kann man schon machen, aber MajorM
           koennte schon wie Major Matches oder Major Games heissen."

           WR bleibt also erlaubt, "Major-M" nicht. */
        const I18N = lies(path.join('js', 'i18n.js'));
        const werte = [...I18N.matchAll(/'arc\.colMajorNKurz':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(werte.length, 2, 'arc.colMajorNKurz fehlt in einer Sprache');
        for (const w of werte) {
            assert.ok(/match/i.test(w),
                `"${w}" schreibt die Matches nicht aus — "Major-M" war genau `
                + 'die Abkuerzung, die der Betreiber beanstandet hat');
            assert.ok(w.length > 8,
                `"${w}" ist wieder auf ein Kuerzel geschrumpft`);
        }
    });

    it('die Legende loest beide Spalten auf', () => {
        const I18N = lies(path.join('js', 'i18n.js'));
        const leg = [...I18N.matchAll(/'arc\.muLegende':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(leg.length, 2,
            `arc.muLegende steht ${leg.length}x in i18n.js, erwartet 2`);
        for (const z of leg) {
            assert.ok(/Major-WR/.test(z),
                'die Legende loest "Major-WR" nicht auf');
            assert.ok(/Major[- ][Mm]atches/.test(z),
                'die Legende loest die Partienspalte nicht auf');
        }
        const deL = leg.find(z => /Siege/.test(z));
        assert.ok(deL, 'keine deutsche Legende gefunden');
        assert.ok(/entschiedene Partien/.test(deL),
            'die deutsche Legende sagt nicht mehr, WAS die Win Rate rechnet — '
            + 'ohne das steht "WR" fuer eine von drei Konventionen im Haus');
    });

    it('der Spaltenkopf nennt die Rechnung und die Unentschieden', () => {
        const i18n = lies(path.join('js', 'i18n.js'));
        const eintraege = [...i18n.matchAll(/'arc\.colMajorTip':\s*'([^']*)'/g)].map(x => x[1]);
        assert.strictEqual(eintraege.length, 2, 'der Hinweis fehlt in einer Sprache');
        for (const s2 of eintraege) {
            assert.ok(!/Matchpunkte|match points/i.test(s2),
                'der Kopf behauptet weiter Matchpunkte — die Spalte rechnet '
                + 'seit dem 03.09.2026 S/(S+N)');
            assert.ok(/entschiedene|decided/i.test(s2),
                'der Kopf sagt nicht, dass die Unentschieden aussen vor bleiben — '
                + 'das ist der ganze Unterschied zwischen zwei der drei '
                + 'Hauskonventionen');
            assert.ok(/links|left/i.test(s2),
                'der Kopf stellt den Bezug zur Spalte links nicht mehr her');
        }
    });

    it('jede Zelle zeigt die Bilanz, aus der die Quote kommt', () => {
        const i18n = lies(path.join('js', 'i18n.js'));
        const eintraege = [...i18n.matchAll(/'arc\.muMajorTip':\s*'([^']*)'/g)].map(x => x[1]);
        assert.strictEqual(eintraege.length, 2, 'der Zellen-Hinweis fehlt in einer Sprache');
        for (const s2 of eintraege) {
            assert.ok(/\{b\}/.test(s2),
                'der Hinweis zeigt die Bilanz nicht mehr — sie ist der Beleg '
                + 'dafuer, dass die Zahl daneben eine Win Rate ist');
            assert.ok(/\{r\}/.test(s2),
                'der Rohwert fehlt im Hinweis — geglaettet ohne roh ist eine '
                + 'Zahl ohne Herkunft');
            assert.ok(!/2 (Punkte|points)/.test(s2),
                'der Hinweis beziffert weiter einen systematischen Abstand — '
                + 'den gab es, solange rechts Matchpunkte standen');
        }
    });

    it('eine Paarung ohne entschiedene Partie sagt genau das', () => {
        /* LIVE GEFUNDEN AM 03.09.2026, nach dem Merge von PR #640.
           25 der 769 Paarungen stehen auf 0-0-1: eine einzige Partie, die
           unentschieden endete. In der Spalte steht dort zu Recht ein
           Strich — S/(S+N) ist auf null entschiedenen Partien nicht
           definiert. Der Hinweis daneben behauptete aber "ohne Bilanz in
           der Quelle", und das war falsch: die Bilanz ist da, sie hat nur
           keinen Nenner.

           Zwei verschiedene Gruende fuer denselben Strich brauchen zwei
           verschiedene Saetze, sonst schickt der eine den Leser auf die
           Suche nach einem Datenfehler, den es nicht gibt. */
        const i18n = lies(path.join('js', 'i18n.js'));
        const e = [...i18n.matchAll(/'arc\.muMajorNurRemis':\s*'([^']*)'/g)].map(x => x[1]);
        assert.strictEqual(e.length, 2, 'der Hinweis fehlt in einer Sprache');
        for (const s2 of e) {
            assert.ok(/unentschieden|drawn/i.test(s2),
                'der Hinweis nennt den Grund nicht: ' + s2.slice(0, 70));
            assert.ok(/\{b\}/.test(s2),
                'der Hinweis zeigt die Bilanz nicht, die den Grund belegt');
        }
        const h = [...i18n.matchAll(/'heatmap\.majorNurRemis':\s*'([^']*)'/g)];
        assert.strictEqual(h.length, 2, 'der Heatmap-Hinweis fehlt in einer Sprache');

        /* Die Oberflaeche muss die beiden Faelle ueberhaupt unterscheiden
           koennen — sonst haengt der richtige Satz an nichts.

           GENAU HINSEHEN, WO. Die erste Fassung suchte "bilanzDa"
           irgendwo im Modul und blieb gruen, als das Feld aus dem
           Register verschwand: der Lesezugriff `mj.bilanzDa` stand ja
           noch da. Gesucht wird deshalb die ZUWEISUNG im Rumpf von
           ladeMajorMatchups, und in der Karte die VERZWEIGUNG, die den
           Satz auswaehlt. Gefunden durch die Mutationsprobe. */
        const meta = ohneKomm(lies(path.join('js', 'app-current-meta.js')));
        const a = meta.indexOf('async function ladeMajorMatchups');
        const rumpf = meta.slice(a, meta.indexOf('window._majorMatchupRegistry = reg;', a));
        assert.ok(/bilanzDa\s*:/.test(rumpf),
            'das Register schreibt bilanzDa nicht mehr — dann unterscheidet '
            + 'niemand "keine Bilanz" von "keine entschiedene Partie"');
        assert.ok(/m\.majorBilanzDa\s*$|m\.majorBilanzDa\s*\n?\s*\?/m.test(karteK)
            || /\(m\.majorBilanzDa/.test(karteK),
            'die Karte verzweigt nicht mehr an majorBilanzDa');
        const i = karteK.indexOf('arc.muMajorNurRemis');
        assert.ok(i > 0, 'der Satz fuer "alle unentschieden" wird nicht mehr benutzt');
        assert.ok(karteK.slice(Math.max(0, i - 400), i).indexOf('majorBilanzDa') >= 0,
            'der Satz fuer "alle unentschieden" haengt nicht mehr an der '
            + 'Unterscheidung — dann steht er auch dort, wo die Bilanz fehlt');
    });

    it('ohne Bilanz steht ein Strich, keine geschaetzte Zahl', () => {
        /* Zeilen aus einem Lauf vor PR #639 tragen vs_count, aber keine
           Bilanz. Aus vs_win_pct eine Win Rate zurueckzurechnen ginge nur
           mit einer Annahme ueber die Unentschieden — also gar nicht. */
        assert.ok(/arc\.muMajorOhneBilanz/.test(karte),
            'der Hinweis fuer Zeilen ohne Bilanz fehlt');
        const i18n = lies(path.join('js', 'i18n.js'));
        const e = [...i18n.matchAll(/'arc\.muMajorOhneBilanz':\s*'([^']*)'/g)].map(x => x[1]);
        assert.strictEqual(e.length, 2, 'der Hinweis fehlt in einer Sprache');
        assert.ok(/m\.majorWr == null \? '–'/.test(karteK),
            'eine Paarung ohne Bilanz zeigt keinen Strich mehr');
    });
});

describe('Die Zahl kommt aus der Bilanz, nicht aus vs_win_pct', () => {

    it('das Register liest die drei Bilanzspalten', () => {
        const meta = ohneKomm(lies(path.join('js', 'app-current-meta.js')));
        for (const feld of ['vs_wins', 'vs_losses', 'vs_ties']) {
            assert.ok(meta.indexOf(feld) >= 0,
                `${feld} wird nicht mehr gelesen — dann kann die Spalte keine `
                + 'Win Rate sein, egal wie sie heisst');
        }
    });

    it('die Quote entsteht mit derselben Glaettung wie links', () => {
        /* NUR IM REGISTER SUCHEN, nicht in der ganzen Datei. Die erste
           Fassung dieser Zusicherung suchte "DsGlaettung" im gesamten
           Modul — und blieb gruen, als die Glaettung aus der Major-Quote
           entfernt wurde, weil die Online-Zahl sie an anderer Stelle
           weiter benutzt. Gefunden durch die Mutationsprobe, nicht durch
           Nachdenken. */
        const meta = ohneKomm(lies(path.join('js', 'app-current-meta.js')));
        const a = meta.indexOf('async function ladeMajorMatchups');
        assert.ok(a > 0, 'ladeMajorMatchups ist weg');
        const rumpf = meta.slice(a, meta.indexOf('window._majorMatchupRegistry = reg;', a));
        assert.ok(rumpf.length > 200, 'der Rumpf von ladeMajorMatchups ist leer');
        assert.ok(/DsGlaettung/.test(rumpf),
            'die Major-Quote wird nicht mehr geglaettet — dann steht ein 2-0 '
            + 'als 100 % neben einer geglaetteten Online-Zahl, und der '
            + 'Vergleich nebeneinander ist genau der Zweck der Zelle');
        assert.ok(/niederlagen/.test(rumpf) && /siege/.test(rumpf),
            'Siege und Niederlagen kommen im Register nicht mehr vor');
    });

    it('die Karte zeigt majorWr, nicht die Matchpunkte', () => {
        assert.ok(/m\.majorWr/.test(karteK),
            'die Zelle liest majorWr nicht mehr');
        assert.ok(!/majorPunkte/.test(karteK),
            'majorPunkte ist zurueck in der Ausgabe — das sind Matchpunkte '
            + 'unter der Ueberschrift "Major-WR"');
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
        assert.ok(/m\.majorWr == null \? '–'/.test(karteK),
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

    it('die Quelle fuehrt je Paarung eine Bilanz', () => {
        /* DIESE ZUSICHERUNG STAND BIS ZUM 03.09.2026 ANDERSHERUM da: sie
           verlangte, dass die Datei KEINE Bilanz fuehrt, mit dem Hinweis
           "wenn sie es doch tut, ist die ganze Begruendung hinfaellig".
           Genau das ist eingetreten — der Scraper holt die Bilanz jetzt
           ab. Faellt sie wieder weg, faellt die Win-Rate-Spalte mit ihr,
           und dieser Test sagt es sofort. */
        for (const feld of ['vs_wins', 'vs_losses', 'vs_ties']) {
            assert.ok(kopf.indexOf(feld) >= 0,
                `die Datei fuehrt "${feld}" nicht mehr — ohne die Bilanz ist `
                + '"Major-WR" eine Ueberschrift ohne Zahl dahinter');
        }
        assert.ok(kopf.indexOf('vs_count') >= 0 && kopf.indexOf('vs_win_pct') >= 0,
            'vs_count oder vs_win_pct fehlen');
    });

    it('die Bilanz addiert sich zur Partienzahl daneben', () => {
        /* Drei Zahlen in einer Zeile, die sich nicht addieren, waren in
           limitless_online_decks_matchups.csv in 423 von 1.546 Zeilen der
           Fall. Hier muessen sie es tun, sonst rechnet der Nenner der
           Win Rate ueber einer anderen Grundgesamtheit als die Zahl, die
           in der Spalte daneben steht. */
        const mit = rows.filter(r => String(r.vs_wins || '').trim() !== '');
        assert.ok(mit.length >= 20,
            `nur ${mit.length} Paarungen tragen eine Bilanz — zu wenig fuer `
            + 'eine Spalte, die eine Win Rate verspricht');
        const spiegel = (r) => r.my_deck_name === r.opponent_deck_name;
        const schief = mit.filter((r) => {
            if (spiegel(r)) return false;
            const w = parseInt(r.vs_wins, 10) || 0;
            const l = parseInt(r.vs_losses, 10) || 0;
            const t2 = parseInt(r.vs_ties, 10) || 0;
            return (w + l + t2) !== (parseInt(r.vs_count, 10) || 0);
        });
        assert.strictEqual(schief.length, 0,
            `${schief.length} von ${mit.length} Paarungen haben eine Bilanz, die `
            + 'nicht zu vs_count passt, z. B. '
            + (schief[0] ? `${schief[0].my_deck_name} vs ${schief[0].opponent_deck_name}: `
                + `${schief[0].vs_wins}-${schief[0].vs_losses}-${schief[0].vs_ties} `
                + `bei vs_count=${schief[0].vs_count}` : ''));
    });

    it('im Spiegel zaehlt die Quelle beide Sitze — genau doppelt', () => {
        /* GEFUNDEN AM 03.09.2026 durch die Zusicherung darueber: 15 von 769
           Paarungen addierten sich nicht zu vs_count. Alle 15 waren Spiegel
           (Dragapult gegen Dragapult), und alle 15 lagen exakt beim Faktor
           2,0 — Dragapult 124-124-24 auf 136 Partien.

           Das ist kein Fehler, sondern die Natur der Sache: in einer
           Spiegelpartie sitzt dasselbe Deck auf beiden Seiten, also wird
           jede Partie einmal als Sieg UND einmal als Niederlage gebucht.
           Die Win Rate ist damit per Konstruktion 50 %, und das ist die
           richtige Antwort.

           Die Zusicherung haelt den Faktor fest. Waere er nicht mehr genau
           2, waere die Symmetrie gebrochen — dann zaehlt die Quelle
           Spiegel anders, und 50 % waere dort eine Behauptung statt einer
           Tautologie. */
        const sp = rows.filter(r => r.my_deck_name === r.opponent_deck_name
            && String(r.vs_wins || '').trim() !== '');
        assert.ok(sp.length >= 5, `nur ${sp.length} Spiegelpaarungen gefunden`);
        for (const r of sp) {
            const w = parseInt(r.vs_wins, 10) || 0;
            const l = parseInt(r.vs_losses, 10) || 0;
            const t2 = parseInt(r.vs_ties, 10) || 0;
            const c = parseInt(r.vs_count, 10) || 0;
            assert.strictEqual(w, l,
                `${r.my_deck_name} im Spiegel: ${w} Siege gegen ${l} Niederlagen — `
                + 'im Spiegel muessen sie gleich sein, sonst schlaegt ein Deck sich selbst');
            assert.strictEqual(w + l + t2, 2 * c,
                `${r.my_deck_name} im Spiegel: ${w}-${l}-${t2} bei vs_count=${c} — `
                + 'erwartet wird der Faktor 2 (beide Sitze gebucht)');
        }
    });

    it('die Bilanz erklaert vs_win_pct — sonst gehoert sie nicht zusammen', () => {
        /* Die schaerfste Probe: aus der gescrapten Bilanz muss sich die
           Prozentzahl derselben Zeile nachrechnen lassen. Trifft sie nicht,
           stammen Bilanz und Prozentwert aus verschiedenen Zeilen der
           Quelltabelle — und dann ist die Win Rate daneben falsch, ohne
           dass man es ihr ansieht. */
        const mit = rows.filter(r => String(r.vs_wins || '').trim() !== ''
            && (parseInt(r.vs_count, 10) || 0) > 0);
        assert.ok(mit.length >= 20, 'zu wenige Zeilen mit Bilanz fuer die Pruefung');
        // Spiegel duerfen mit: die Prozentzahl rechnet dort ueber DIE
        // GEDOPPELTE Bilanz und kommt genau deshalb auf 50 %.
        const daneben = mit.filter((r) => {
            const w = parseInt(r.vs_wins, 10) || 0;
            const l = parseInt(r.vs_losses, 10) || 0;
            const t2 = parseInt(r.vs_ties, 10) || 0;
            const g = w + l + t2;
            if (!g) return true;
            return Math.abs(((3 * w + t2) / (3 * g)) * 100 - zahl(r.vs_win_pct)) > 0.02;
        });
        assert.strictEqual(daneben.length, 0,
            `${daneben.length} von ${mit.length} Paarungen: die Bilanz ergibt nicht `
            + 'die Prozentzahl derselben Zeile'
            + (daneben[0] ? `, z. B. ${daneben[0].my_deck_name} vs `
                + `${daneben[0].opponent_deck_name}: ${daneben[0].vs_wins}-`
                + `${daneben[0].vs_losses}-${daneben[0].vs_ties} gegen `
                + `${daneben[0].vs_win_pct} %` : ''));
    });

    it('den Fall "alle unentschieden" gibt es wirklich', () => {
        /* Die Vorkehrung dafuer (arc.muMajorNurRemis) ist oben zugesichert.
           Hier steht, dass sie nicht fuer einen erfundenen Fall gebaut
           wurde: am 03.09.2026 waren es 25 von 769 Paarungen, jede mit
           genau einer Partie, und die endete unentschieden. */
        const nurRemis = rows.filter((r) => {
            const w = parseInt(r.vs_wins, 10) || 0;
            const l = parseInt(r.vs_losses, 10) || 0;
            return String(r.vs_wins || '').trim() !== '' && (w + l) === 0
                && (parseInt(r.vs_count, 10) || 0) > 0;
        });
        assert.ok(nurRemis.length > 0,
            'keine Paarung ohne entschiedene Partie mehr in der Datei — die '
            + 'Vorkehrung waere dann tot; sie kostet nichts und bleibt richtig, '
            + 'aber diese Zusicherung belegt nichts mehr');
        for (const r of nurRemis) {
            assert.strictEqual(parseInt(r.vs_ties, 10) || 0,
                (parseInt(r.vs_count, 10) || 0) * (r.my_deck_name === r.opponent_deck_name ? 2 : 1),
                `${r.my_deck_name} vs ${r.opponent_deck_name}: ohne Siege und `
                + 'Niederlagen muessen alle Partien Unentschieden sein');
        }
    });

    it('beide Richtungen einer Paarung ergaenzen sich zu 100 Prozent', () => {
        /* GEFUNDEN AM 03.09.2026 beim Ansehen der Heatmap: Dragapult gegen
           Mega Excadrill steht auf 51,6 %, Mega Excadrill gegen Dragapult
           auf 48,4 %. Das ist kein Zufall, sondern eine Eigenschaft der
           Glaettung: (S+k/2)/(S+N+k) + (N+k/2)/(S+N+k) = 1, weil der
           Nenner in beiden Richtungen derselbe ist.

           Damit ist das hier die schaerfste Probe, die diese Datei
           zulaesst: die Bilanz der einen Richtung muss die gespiegelte
           Bilanz der anderen sein. Waere auch nur eine Zeile beim Scrapen
           der falschen Paarung zugeordnet worden, faellt es hier auf —
           an einer Summe, die nicht 100 ergibt. Ohne die Bilanz war diese
           Probe nicht moeglich; mit den Matchpunkten summiert sie sich
           NICHT auf 100 (Unentschieden zaehlen beiden Seiten nur einen
           Punkt), was die alte Spalte auch nicht pruefbar machte. */
        const nach = {};
        for (const r of rows) {
            if (String(r.vs_wins || '').trim() === '') continue;
            (nach[r.my_deck_name] = nach[r.my_deck_name] || {})[r.opponent_deck_name] = r;
        }
        let geprueft = 0;
        const schief = [];
        for (const a of Object.keys(nach)) {
            for (const b of Object.keys(nach[a])) {
                if (a === b) continue;
                const hin = nach[a][b];
                const zurueck = (nach[b] || {})[a];
                if (!zurueck) continue;
                geprueft++;
                const w1 = parseInt(hin.vs_wins, 10) || 0;
                const l1 = parseInt(hin.vs_losses, 10) || 0;
                const t1 = parseInt(hin.vs_ties, 10) || 0;
                const w2 = parseInt(zurueck.vs_wins, 10) || 0;
                const l2 = parseInt(zurueck.vs_losses, 10) || 0;
                const t2b = parseInt(zurueck.vs_ties, 10) || 0;
                if (w1 !== l2 || l1 !== w2 || t1 !== t2b) {
                    schief.push(`${a} vs ${b}: ${w1}-${l1}-${t1} gegen `
                        + `${b} vs ${a}: ${w2}-${l2}-${t2b}`);
                }
            }
        }
        assert.ok(geprueft >= 50,
            `nur ${geprueft} Paarungen liegen in beiden Richtungen vor`);
        assert.strictEqual(schief.length, 0,
            `${schief.length} von ${geprueft} Paarungen sind nicht spiegelbildlich, `
            + `z. B. ${schief[0] || ''} — dann ist mindestens eine Bilanz der `
            + 'falschen Paarung zugeordnet');
    });

    it('Win Rate und Matchpunkte sind wirklich zwei Zahlen', () => {
        /* Waeren sie dasselbe, waere die ganze Umstellung folgenlos — und
           der alte Zustand (Matchpunkte unter dem Namen WR) waere nie ein
           Fehler gewesen. Er war einer: bei 11 % Unentschieden am Major
           liegen die beiden Zahlen systematisch auseinander. */
        const mit = rows.filter(r => String(r.vs_wins || '').trim() !== ''
            && (parseInt(r.vs_count, 10) || 0) >= 10);
        assert.ok(mit.length >= 10, 'zu wenige belastbare Paarungen fuer die Probe');
        const abstaende = mit.map((r) => {
            const w = parseInt(r.vs_wins, 10) || 0;
            const l = parseInt(r.vs_losses, 10) || 0;
            const wr = (w + l) > 0 ? (w / (w + l)) * 100 : NaN;
            return Math.abs(wr - zahl(r.vs_win_pct));
        }).filter(Number.isFinite).sort((a, b) => a - b);
        const median = abstaende[Math.floor(abstaende.length / 2)];
        assert.ok(median > 0.5,
            `die Bilanz-Win-Rate weicht im Median nur ${median.toFixed(2)} Punkte `
            + 'von vs_win_pct ab — dann fuehrt die Quelle doch S/(S+N), und die '
            + 'Kommentare im Haus, die vs_win_pct Matchpunkte nennen, sind falsch');
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
           "Major-Matches" braucht einlagig 96 px. */
        assert.ok(!/arc-mu-table th:nth-child\(n\+4\)/.test(css),
            'die Sammelregel ab Spalte 4 ist zurueck — dann erben die '
            + 'Major-Spalten wieder die 42 px fuer einstellige Zahlen');
        assert.match(css, /arc-mu-table th:nth-child\(7\)/,
            'die Major-WR-Spalte hat keine eigene Breite mehr');
        assert.match(css, /arc-mu-table th:nth-child\(8\)/,
            'die Major-Matches-Spalte hat keine eigene Breite mehr');
    });

    it('die Ueberschriften duerfen umbrechen — aber nicht im Wort', () => {
        const i = css.indexOf('.arc-mu-table thead th');
        assert.ok(i > 0, 'die Umbruchregel fuer die Kopfzeile fehlt');
        const rumpf = css.slice(i, css.indexOf('}', i));
        assert.match(rumpf, /white-space:\s*normal/,
            'die Kopfzellen stehen wieder auf nowrap — dann laeuft '
            + '"Major-Matches" ueber statt umzubrechen');
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
        // NUR DIE GRUNDREGELN. Seit dem 03.09.2026 steht im
        // Telefonblock (@media max-width: 620px) ein zweiter,
        // schmalerer Spaltenplan — der summiert sich bewusst auf
        // WENIGER als diese Mindestbreite und laesst sie dort los.
        // Ohne diese Trennung zaehlte die Zusicherung beide Plaene
        // zusammen und verlangte eine Mindestbreite von 833 px.
        // Was der Telefonplan halten muss, prueft
        // tests/unit/test-tierliste-telefon-breite.js.
        const grund = css.slice(0, css.indexOf('@media (max-width: 620px)'));
        const breiten = [...grund.matchAll(
            /#currentMetaContent \.arc-mu-table th:nth-child\((\d+)\)[\s\S]{0,400}?\{\s*(?:[^}]*?)width:\s*(\d+)px/g)]
            .map(m => Number(m[2]));
        // Die Suche findet fuenf Regeln, nicht acht: Spalte 3 kommt aus
        // einer Sammelregel (`nth-child(n+3)...`), und 4, 5 und 6 teilen
        // sich eine. Der Wert der Zusicherung liegt im Vergleich unten;
        // diese Zeile faengt nur den Fall ab, dass der Ausdruck gar
        // nichts mehr findet und die Summe stillschweigend 0 wird.
        assert.ok(breiten.length >= 5,
            `im Grundteil stehen nur ${breiten.length} Spaltenbreiten — `
            + 'entweder sind die Regeln hinter den Telefonblock gerutscht, '
            + 'oder ihre Schreibweise passt nicht mehr zum Ausdruck');
        const summe = breiten.reduce((a, b) => a + b, 0);
        assert.ok(Number(mb[1]) >= summe,
            `die Mindestbreite steht auf ${mb[1]} px, die gesetzten `
            + `Spaltenbreiten summieren sich aber auf ${summe} px`);
    });
});
