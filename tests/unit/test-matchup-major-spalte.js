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

/* ── Die Praesenzzelle AUSGEFUEHRT ───────────────────────────────────
 *
 * Bis zum 07.09.2026 waren die Zusicherungen dieser Datei Regex auf den
 * Quelltext. Die Abnahme hat gezeigt, was das nicht faengt: eine
 * Zusicherung auf die Zeichenfolge einer Verzweigung bleibt gruen,
 * solange die Zeichen irgendwo stehen, und faellt, sobald jemand
 * dieselbe Entscheidung sauber in eine Funktion zieht. Beides ist das
 * Gegenteil von dem, was sie pruefen soll. Also wird die Entscheidung
 * jetzt aufgerufen. */
function schneideAus(quelle, kopf) {
    const i = quelle.indexOf(kopf);
    assert.notStrictEqual(i, -1, 'nicht gefunden: ' + kopf);
    let tiefe = 0;
    for (let j = quelle.indexOf('{', i); j < quelle.length; j++) {
        if (quelle[j] === '{') tiefe++;
        else if (quelle[j] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(i, j + 1); }
    }
    throw new Error('Klammern gehen nicht auf: ' + kopf);
}

const PZ = new Function('MIN_PRAESENZ_PARTIEN', [
    'const esc = (x) => String(x == null ? "" : x)',
    '    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");',
    'const L = (k, d) => d;',
    'const fmt = (n, dp) => Number(n).toFixed(dp == null ? 1 : dp).replace(".", ",");',
    'const window = { WinRateKonvention: null };',
    // Seit dem 08.09.2026 holen praesenzZelle() und die Kopfzeile den
    // Namen der Konvention zur Laufzeit (mitQuote / quotenHinweis).
    // Ohne Modul faellt der Name auf die Formel zurueck — so gebaut.
    schneideAus(karte, 'function quotenFormel(id)'),
    schneideAus(karte, 'function quotenName(id)'),
    schneideAus(karte, 'function mitQuote(text, id)'),
    schneideAus(karte, 'function quotenHinweis(id)'),
    schneideAus(karte, 'function praesenzBilanz(m)'),
    schneideAus(karte, 'function praesenzZelle(m, de)'),
    schneideAus(karte, 'function praesenzZellen(m, de)'),
    'return { praesenzZelle, praesenzZellen };',
].join('\n'))(30);

/** Eine Paarungszeile, wie matchupsFor() sie liefert. */
const paarung = (extra) => Object.assign({
    opponent: 'Dragapult', majorWr: null, majorWrRoh: null, majorBilanzDa: false,
    majorSiege: null, majorNiederlagen: null, majorUnentschieden: null, majorAnzahl: null,
}, extra);
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
        /* SEIT DEM 08.09.2026 STEHT DIE RECHNUNG ALS PLATZHALTER DA.
           Vorher las die Legende "WR = Win Rate (Siege ÷ entschiedene
           Partien)" — ein Hausname plus eine ausgeschriebene Formel.
           „Win Rate" ist als Bezeichnung gestrichen (Anordnung des
           Betreibers), und die Formel darf nicht ein zweites Mal
           abgeschrieben werden: beides kommt jetzt zur Laufzeit aus
           js/win-rate-konvention.js. Die Zusage ist damit SCHAERFER —
           gefordert ist nicht mehr irgendein Wortlaut, sondern dass
           Name UND Formel wirklich aus dem Modul kommen. */
        for (const z of leg) {
            assert.ok(/\{quote\}/.test(z),
                'die Legende holt den Namen der Konvention nicht mehr aus '
                + 'js/win-rate-konvention.js — dann steht dort wieder ein Hausname');
            assert.ok(/\{formel\}/.test(z),
                'die Legende sagt nicht mehr, WAS die Quote rechnet — ohne die '
                + 'Formel steht "WR" fuer eine von drei Konventionen im Haus');
        }
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
        /* AUSGEFUEHRT. Dieselbe Zeile, einmal mit und einmal ohne
           Bilanz — sie muessen zwei verschiedene Saetze bekommen.
           40 Partien, damit die Mindeststichprobe nicht dazwischenfunkt. */
        const remis = PZ.praesenzZelle(paarung({
            majorAnzahl: 40, majorBilanzDa: true, majorWr: null,
            majorSiege: 0, majorNiederlagen: 0, majorUnentschieden: 40,
        }), true);
        assert.strictEqual(remis.art, 'nur-remis');
        assert.ok(/unentschieden/i.test(remis.titel),
            'der Satz nennt den Grund nicht: ' + remis.titel.slice(0, 80));
        assert.strictEqual(remis.inhalt, '–');

        const ohne = PZ.praesenzZelle(paarung({
            majorAnzahl: 40, majorBilanzDa: false, majorWr: null,
        }), true);
        assert.strictEqual(ohne.art, 'ohne-bilanz');
        assert.notStrictEqual(ohne.titel, remis.titel,
            'beide Gruende bekommen denselben Satz — dann schickt der eine '
            + 'den Leser auf die Suche nach einem Datenfehler, den es nicht gibt');
        assert.ok(/ohne Bilanz/i.test(ohne.titel), ohne.titel.slice(0, 80));
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
        const z = PZ.praesenzZelle(paarung({ majorAnzahl: 40, majorBilanzDa: false }), true);
        assert.strictEqual(z.inhalt, '–',
            'eine Paarung ohne Bilanz zeigt keinen Strich mehr');
        assert.ok(!/\d/.test(z.inhalt), 'in der Zelle steht eine geschaetzte Zahl');
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
        const mit = PZ.praesenzZellen(paarung({
            majorAnzahl: 52, majorBilanzDa: true, majorWr: 45.5, majorWrRoh: 45.5,
            majorSiege: 21, majorNiederlagen: 23, majorUnentschieden: 8,
        }), true);
        assert.ok(/>52</.test(mit), 'die Partienzahl wird nicht mehr ausgegeben');
        const ohnePaarung = PZ.praesenzZellen(paarung({}), true);
        assert.ok(/arc-mu-major-n[^>]*>–</.test(ohnePaarung),
            'eine fehlende Praesenzpaarung wird nicht mehr als fehlend gezeigt — '
            + 'eine 0 liest sich als "nie gewonnen"');
        assert.ok(!/>0</.test(ohnePaarung), 'aus "keine Paarung" ist eine 0 geworden');
    });

    it('duenne Paarungen werden markiert', () => {
        /* Die Schwelle heisst seit dem 07.09.2026 MIN_PRAESENZ_PARTIEN
           und ist von 10 auf 30 gestiegen — dieselbe Zahl, ab der
           ueberhaupt ein Prozentwert erscheint. Geprueft wird die
           Wirkung, nicht die Schreibweise. */
        const duenn = PZ.praesenzZellen(paarung({
            majorAnzahl: 9, majorBilanzDa: true, majorWr: 88.9, majorWrRoh: 88.9,
            majorSiege: 8, majorNiederlagen: 1, majorUnentschieden: 0,
        }), true);
        assert.ok(/arc-mu-major-duenn/.test(duenn),
            'die Markierung fuer duenne Paarungen ist weg');
        const dick = PZ.praesenzZellen(paarung({
            majorAnzahl: 52, majorBilanzDa: true, majorWr: 45.5, majorWrRoh: 45.5,
            majorSiege: 21, majorNiederlagen: 23, majorUnentschieden: 8,
        }), true);
        assert.ok(!/arc-mu-major-duenn/.test(dick),
            'eine belastbare Paarung wird faelschlich als duenn markiert');
        const css = ohneKomm(lies(path.join('css', 'styles.css')));
        assert.ok(/\.arc-mu-major-duenn\s*\{[^}]*font-style/.test(css),
            'die Markierung fehlt im Stylesheet');
    });

    it('fehlende Paarungen zeigen einen Strich, keine Null', () => {
        const z = PZ.praesenzZelle(paarung({}), true);
        assert.strictEqual(z.art, 'fehlt');
        assert.strictEqual(z.inhalt, '–',
            'eine fehlende Praesenzpaarung wird nicht mehr als fehlend gezeigt — '
            + 'eine 0 liest sich als "nie gewonnen"');
        assert.ok(/Keine Präsenzpartien/.test(z.titel),
            'der Hinweis fuer fehlende Paarungen ist weg');
        assert.ok(/arc\.muMajorFehlt/.test(karte),
            'der i18n-Schluessel fuer fehlende Paarungen ist weg');
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

// ── Mindeststichprobe für eine Präsenz-Paarung (07.09.2026) ─────────

describe('Unter der Mindeststichprobe steht die Bilanz, kein Prozentwert', () => {

    /* DER ANLASS, gemessen an data/labs_tournament_matchups_TEF-PBL.csv
       (day_filter = overall): Mega Excadrill führt 27 Gegner, GENAU EINER
       erreicht 30 Partien (Dragapult, 52). "vs Crustle 88,89 %" stand auf
       9 Partien, "vs Grimmsnarl Froslass 100 %" auf 2.

       Die Schwelle ist abgelesen, nicht gewählt: bei n Partien verschiebt
       eine einzige Partie die Quote um 100/n Punkte — 3,3 bei 30, 11,1
       bei 9, ganze 50 bei 2. Die Zahlen unten sind GESETZT; keine davon
       ist ein Wochenwert. */

    it('die Schwelle steht als eine Konstante im Modul', () => {
        assert.ok(/const MIN_PRAESENZ_PARTIEN = 30;/.test(karteK),
            'die Mindeststichprobe steht nicht mehr in EINER Konstante — '
            + 'dann laufen Zelle, Hinweis und Fußzeile auseinander');
    });

    it('9 Partien: Bilanz und Fallzahl, kein Prozentwert', () => {
        const m = paarung({
            majorAnzahl: 9, majorBilanzDa: true, majorWr: 82.4, majorWrRoh: 88.9,
            majorSiege: 8, majorNiederlagen: 1, majorUnentschieden: 0,
        });
        const z = PZ.praesenzZelle(m, true);
        assert.strictEqual(z.art, 'unter-schwelle');
        assert.strictEqual(z.inhalt, '8–1–0', 'die Rohbilanz steht nicht in der Zelle');
        assert.ok(!/%/.test(z.inhalt), 'unter der Schwelle steht wieder ein Prozentwert');
        assert.ok(!/82|88/.test(z.inhalt), 'die Quote steht doch in der Zelle');
        // Die Fallzahl steht in der Nachbarspalte.
        assert.ok(/>9</.test(PZ.praesenzZellen(m, true)), 'die Fallzahl fehlt daneben');
        // Und der Hinweis nennt Schwelle und Grund.
        assert.ok(/30/.test(z.titel), 'die Schwelle wird im Hinweis nicht genannt');
        assert.ok(/11,1 Punkte/.test(z.titel),
            'der Hinweis rechnet nicht vor, was eine einzelne Partie ausmacht');
    });

    it('2 Partien: dasselbe, und ganz sicher keine 100 %', () => {
        const z = PZ.praesenzZelle(paarung({
            majorAnzahl: 2, majorBilanzDa: true, majorWr: 65, majorWrRoh: 100,
            majorSiege: 2, majorNiederlagen: 0, majorUnentschieden: 0,
        }), true);
        assert.strictEqual(z.art, 'unter-schwelle');
        assert.strictEqual(z.inhalt, '2–0–0');
        assert.ok(!/100/.test(z.inhalt));
        assert.ok(/50,0 Punkte/.test(z.titel));
    });

    it('genau 30 Partien: ab hier steht die Quote', () => {
        /* Die Grenze selbst — sonst könnte sie um eins verrutschen,
           ohne dass etwas rot wird. */
        const z = PZ.praesenzZelle(paarung({
            majorAnzahl: 30, majorBilanzDa: true, majorWr: 55.5, majorWrRoh: 56.7,
            majorSiege: 17, majorNiederlagen: 13, majorUnentschieden: 0,
        }), true);
        assert.strictEqual(z.art, 'quote');
        assert.strictEqual(z.inhalt, '55,5 %');
        const knapp = PZ.praesenzZelle(paarung({
            majorAnzahl: 29, majorBilanzDa: true, majorWr: 55.5, majorWrRoh: 56.7,
            majorSiege: 16, majorNiederlagen: 13, majorUnentschieden: 0,
        }), true);
        assert.strictEqual(knapp.art, 'unter-schwelle',
            'die Schwelle greift eine Partie zu spät');
    });

    it('52 Partien (Dragapult): die Quote, wie bisher', () => {
        const z = PZ.praesenzZelle(paarung({
            majorAnzahl: 52, majorBilanzDa: true, majorWr: 47.2, majorWrRoh: 47.7,
            majorSiege: 21, majorNiederlagen: 23, majorUnentschieden: 8,
        }), true);
        assert.strictEqual(z.art, 'quote');
        assert.strictEqual(z.inhalt, '47,2 %');
        assert.ok(/21–23–8/.test(z.titel), 'die Bilanz fehlt im Hinweis');
    });

    it('die doppelt verbuchte Spiegelpartie wird benannt, nicht verschwiegen', () => {
        /* Gemessen: in 15 Zeilen der Datei (alle Spiegelpaarungen) ist
           vs_count ≠ Siege + Niederlagen + Unentschieden, weil jede
           Spiegelpartie für beide Seiten verbucht ist — Basic Box gegen
           sich selbst: 24 Partien, Bilanz 24-24-0. */
        const z = PZ.praesenzZelle(paarung({
            opponent: 'Basic Box', majorAnzahl: 24, majorBilanzDa: true,
            majorWr: 50, majorWrRoh: 50,
            majorSiege: 24, majorNiederlagen: 24, majorUnentschieden: 0,
        }), true);
        assert.ok(/48 Einzelergebnisse auf 24 Partien/.test(z.titel),
            'dass Bilanzsumme und Partienzahl auseinandergehen, steht nirgends');
        const sauber = PZ.praesenzZelle(paarung({
            majorAnzahl: 52, majorBilanzDa: true, majorWr: 47.2, majorWrRoh: 47.7,
            majorSiege: 21, majorNiederlagen: 23, majorUnentschieden: 8,
        }), true);
        assert.ok(!/Einzelergebnisse/.test(sauber.titel),
            'der Hinweis erscheint auch dort, wo die Zahlen zusammenpassen');
    });

    it('unter der Schwelle wird die Zelle auch als solche markiert', () => {
        const html = PZ.praesenzZellen(paarung({
            majorAnzahl: 9, majorBilanzDa: true, majorWr: 82.4, majorWrRoh: 88.9,
            majorSiege: 8, majorNiederlagen: 1, majorUnentschieden: 0,
        }), true);
        assert.ok(/arc-mu-major-bilanz/.test(html),
            'die Zelle mit der Rohbilanz trägt keine eigene Klasse');
        assert.ok(/arc-mu-n-low/.test(html), 'die Fallzahl wird nicht gedämpft');
    });

    it('englisch sagt dasselbe', () => {
        const z = PZ.praesenzZelle(paarung({
            majorAnzahl: 9, majorBilanzDa: true, majorWr: 82.4, majorWrRoh: 88.9,
            majorSiege: 8, majorNiederlagen: 1, majorUnentschieden: 0,
        }), false);
        assert.strictEqual(z.inhalt, '8–1–0');
        assert.ok(/Record 8–1–0/.test(z.titel));
        assert.ok(/Below 30 games/.test(z.titel));
    });
});

describe('Die Schwelle steht sichtbar unter der Tabelle', () => {

    /* Ohne diesen Satz müsste ein Leser raten, warum in einer Zeile
       "8–1–0" und in der nächsten "47,2 %" steht. Geprüft wird die
       gerenderte Tabelle, nicht der Quelltext. */
    function tabelle(zeilen) {
        const quelle = [
            'const isDe = () => true;',
            'const esc = (s) => String(s == null ? "" : s)',
            '    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")',
            '    .replace(/"/g, "&quot;").replace(/\'/g, "&#39;");',
            'const L = (k, d) => d;',
            'const fmt = (n, dp) => Number(n).toFixed(dp == null ? 1 : dp).replace(".", ",");',
            'const THIN_GAMES = 20;',
            'const MIN_PRAESENZ_PARTIEN = 30;',
            'const window = { WinRateKonvention: null };',
            'const shadeFor = () => "";',
            'const barFor = () => ({ pct: 0, cls: "" });',
            'const matchupsFor = () => ZEILEN;',
            // dieselben vier Helfer wie oben, aus DERSELBEN Datei
            schneideAus(karte, 'function quotenFormel(id)'),
            schneideAus(karte, 'function quotenName(id)'),
            schneideAus(karte, 'function mitQuote(text, id)'),
            schneideAus(karte, 'function quotenHinweis(id)'),
            schneideAus(karte, 'function praesenzBilanz(m)'),
            schneideAus(karte, 'function praesenzZelle(m, de)'),
            schneideAus(karte, 'function praesenzZellen(m, de)'),
            /* Seit dem 11.09.2026 steht die Kuerzel-Legende in einer
               eigenen Funktion: in der Tier-Liste wandert sie hinter den
               Info-Knopf des Abschnitts, im Ueberlagerungsfenster bleibt
               sie unter der Tabelle. matchupTableHtml ruft sie auf. */
            schneideAus(karte, 'function legendeText(hatMajor)'),
            schneideAus(karte, 'function legendeHtml(hatMajor, variante)'),
            schneideAus(karte, 'function matchupTableHtml(name, opts)'),
            'return matchupTableHtml;',
        ].join('\n');
        return new Function('ZEILEN', quelle)(zeilen)('Mega Excadrill', {});
    }
    const zeile = (extra) => Object.assign({
        opponent: 'X', winRate: 52, winRateRoh: 52, games: 40,
        wins: 20, losses: 18, ties: 2, thin: false,
        majorWr: null, majorWrRoh: null, majorBilanzDa: false,
        majorSiege: null, majorNiederlagen: null, majorUnentschieden: null,
        majorAnzahl: null,
    }, extra);

    const DUENN = zeile({
        opponent: 'Crustle', majorAnzahl: 9, majorBilanzDa: true,
        majorWr: 82.4, majorWrRoh: 88.9,
        majorSiege: 8, majorNiederlagen: 1, majorUnentschieden: 0,
    });
    const DICK = zeile({
        opponent: 'Dragapult', majorAnzahl: 52, majorBilanzDa: true,
        majorWr: 47.2, majorWrRoh: 47.7,
        majorSiege: 21, majorNiederlagen: 23, majorUnentschieden: 8,
    });

    it('liegt eine Zeile darunter, steht der Satz mit Schwelle und Anzahl da', () => {
        const html = tabelle([DICK, DUENN]);
        assert.ok(/arc-mu-note-praesenz/.test(html), 'die Zeile fehlt ganz');
        assert.ok(/ab 30 Präsenzpartien/.test(html), 'die Schwelle wird nicht genannt');
        assert.ok(/3,3 Punkte/.test(html),
            'die Begründung der Schwelle steht nicht daneben');
        assert.ok(/1 von 2 Zeilen/.test(html),
            'wie viele Zeilen betroffen sind, steht nicht da');
        // Und beides steht wirklich in der Tabelle.
        assert.ok(/8–1–0/.test(html), 'die Rohbilanz der dünnen Zeile fehlt');
        assert.ok(/47,2 %/.test(html), 'die Quote der belastbaren Zeile fehlt');
    });

    it('liegt keine Zeile darunter, bleibt der Satz weg', () => {
        const html = tabelle([DICK]);
        assert.ok(!/arc-mu-note-praesenz/.test(html),
            'der Satz erscheint auch dort, wo er nichts erklärt');
    });

    it('ohne Präsenzspalten gibt es auch keinen Satz dazu', () => {
        const html = tabelle([zeile({}), zeile({ opponent: 'Y' })]);
        assert.ok(!/arc-mu-note-praesenz/.test(html));
        assert.ok(!/arc-mu-major/.test(html), 'die leeren Präsenzspalten sind zurück');
    });
});
