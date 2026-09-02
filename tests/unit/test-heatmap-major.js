'use strict';
/*
 * Jede Heatmap-Zelle traegt online UND Major — und die Tabelle passt sich an.
 *
 * ANLASS (02.09.2026)
 * -------------------
 * Betreiber: "vll sollten wir auch in der Heatmap in jedem Feld online Win
 * Rate / Major Win Rate zeigen so hat man immer und ueberall den Vergleich".
 *
 * ABDECKUNG, bevor gebaut wurde: 90 von 90 Zellen des Top-10-Gitters haben
 * einen Major-Wert (TEF-PBL, Worlds San Francisco), 56 davon mit mindestens
 * 10 Partien. Das traegt.
 *
 * ZWEI SKALEN, und sie lassen sich hier NICHT vereinen. Die Online-Zelle
 * rechnet S/(S+N). Die Labs-Datei liefert je Paarung nur `vs_count` und
 * `vs_win_pct`, und `vs_win_pct` sind MATCHPUNKTE (3S+U)/3n — ohne die
 * Unentschieden je Paarung nicht umrechenbar, und die Quelle
 * veroeffentlicht sie nicht (labs_tournament_scraper.py:1785 liest die zwei
 * Zellen, die dastehen).
 *
 * Gemessen ueber die 90 Paarungen: Median -2,0 pp. Der reine Skaleneffekt
 * bei ausgeglichener Bilanz und 11 % Unentschieden betraegt -1,8 pp. Der
 * Median ist also fast VOLLSTAENDIG Zaehlweise. Deshalb steht es im
 * Hinweis: wer es weiss, kann vergleichen; wer es nicht weiss, liest einen
 * Einbruch, den es nicht gibt.
 *
 * DIE BREITE. Aus derselben Runde stammt der schwerste Handy-Befund:
 * css/current-meta-matchups.css nagelte die Tabelle in VIER Medienabfragen
 * auf `width: 920px !important`. Live bei 390 px nachgestellt — wer auf
 * zwei Decks filterte, bekam trotzdem 920 px: erste Spalte 550,
 * Datenspalte 370, die Antwortzelle begann bei x = 579 in einem 332 px
 * breiten Fenster. Sichtbar waren fuenf Decknamen und KEINE Zahl.
 *
 * Nach der Korrektur, gemessen:
 *
 *     390 px, Top 10      Tabelle 950 px · Fenster 332 · Ueberhang 618
 *     390 px, 1 Spalte    Tabelle 248 px · Fenster 332 · Ueberhang   0
 *    1280 px, Top 10      Tabelle 1212 px · Ueberhang 0
 *
 * Der Ueberhang bei zehn Spalten ist gewollt — dafuer gibt es jetzt einen
 * Verlauf an der Kante, der sagt, dass es weitergeht.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');

const js = lies(path.join('js', 'app-current-meta.js'));
const jsK = ohneKomm(js);
const cssRoh = lies(path.join('css', 'current-meta-matchups.css'));
const css = ohneKomm(cssRoh);

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
function csv(rel, sep) {
    const L = lies(rel).replace(/^﻿/, '').trim().split('\n');
    const h = teile(L[0], sep).map(x => x.trim());
    return L.slice(1).map(l => { const c = teile(l, sep); const o = {};
        h.forEach((k, i) => { o[k] = (c[i] || '').trim(); }); return o; });
}

describe('Die Praesenzdaten werden geladen', () => {

    it('mit Komma geparst, nicht mit Semikolon', () => {
        const i = jsK.indexOf('function ladeMajorMatchups');
        assert.ok(i > 0, 'ladeMajorMatchups ist verschwunden');
        const rumpf = jsK.slice(i, jsK.indexOf('\n        }', i));
        assert.ok(/delimiter:\s*','/.test(rumpf),
            "die Labs-Datei wird nicht mehr mit ',' geparst — mit dem "
            + "hauseigenen ';' zerfaellt sie zu Zeilen mit einem Feld und "
            + 'alles faellt still auf "kein Major" zurueck');
    });

    it('erst das Verzeichnis fragen', () => {
        const i = jsK.indexOf('function ladeMajorMatchups');
        const rumpf = jsK.slice(i, jsK.indexOf('\n        }', i));
        const iV = rumpf.indexOf('labs_tournament_matchups_verzeichnis.json');
        const iC = rumpf.indexOf('labs_tournament_matchups_${key}.csv');
        assert.ok(iV > 0 && iC > iV,
            'der Auszug wird geholt, bevor das Verzeichnis gefragt wurde — '
            + 'dann steht fuer jedes Format ohne Praesenzturnier eine 404 in '
            + 'der Konsole, die keine ist');
    });

    it('nur die Gesamtsicht, nicht Tag 1 und Tag 2 zusaetzlich', () => {
        assert.ok(/day_filter[^\n]*!==\s*'overall'/.test(jsK),
            'der Tagesfilter wird nicht mehr geprueft — dann zaehlt dieselbe '
            + 'Partie mehrfach (die Datei fuehrt overall, day1 und day2)');
    });

    it('das Laden blockiert das Zeichnen nicht', () => {
        // Das Zeichnen haengt an jedem Tastendruck im Suchfeld. Ein await
        // mittendrin wuerde die Reihenfolge zweier schneller Eingaben
        // vertauschen.
        assert.ok(!/async function renderMatchupHeatmap/.test(jsK),
            'renderMatchupHeatmap ist asynchron geworden — es haengt an jedem '
            + 'Tastendruck im Suchfeld, dann vertauschen sich zwei schnelle '
            + 'Eingaben');
        assert.ok(/_majorLaeuft/.test(jsK),
            'die Marke fuer "laedt gerade" ist weg');
    });

    it('die Marke ist nicht das Register selbst', () => {
        // Ein leeres Objekt als "laedt gerade" waere truthy — dann gaebe
        // ladeMajorMatchups() sofort auf, ohne je etwas zu holen. Genau
        // dieser Fehler stand im ersten Anlauf da.
        assert.ok(!/_majorMatchupRegistry\s*=\s*\{\};\s*\/\/\s*verhindert/.test(js),
            'das Register wird wieder als Lademarke missbraucht — {} ist '
            + 'truthy, und ladeMajorMatchups() gibt dann sofort auf');
        assert.ok(/let _majorLaeuft = false/.test(jsK),
            'die eigene Lademarke fehlt');
    });
});

describe('Die Zelle zeigt beide Zahlen mit ihrer Herkunft', () => {

    it('beide Quellen sind ausgeschrieben, nicht abgekuerzt', () => {
        // ANLASS (02.09.2026): die erste Fassung schrieb "M 49,4 % · 52".
        // Der Betreiber: "mit M kann man erstmal nichts anfangen, man sollte
        // da schon Major ausschreiben". Ein Kuerzel darf hier nicht
        // zurueckkommen.
        assert.ok(/'heatmap\.onlineLabel'/.test(jsK) && /'heatmap\.majorLabel'/.test(jsK),
            'die Quellenbeschriftung der Zelle fehlt — dann stehen zwei '
            + 'Zahlen nebeneinander und nichts sagt, welche welche ist');
        const i18n = lies(path.join('js', 'i18n.js'));
        const major = [...i18n.matchAll(/'heatmap\.majorLabel':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(major.length, 2,
            `heatmap.majorLabel steht ${major.length}× in i18n.js, erwartet 2`);
        for (const w of major) {
            assert.strictEqual(w, 'Major',
                `die Quelle heisst "${w}" statt "Major" — genau die Abkuerzung, `
                + 'die gemeldet wurde');
        }
    });

    it('die beiden Win Rates stehen nebeneinander, nicht untereinander', () => {
        // Das ist der ganze Zweck: "so sieht man schnell den Unterschied
        // zwischen online und Major Ergebnissen". Untereinander ist der
        // Vergleich ein Sprung, nebeneinander ein Blick. Getragen wird das
        // vom Raster — drei Spalten, Kennzahl links, dann die beiden Quellen.
        const css = lies(path.join('css', 'styles.css'));
        const i = css.indexOf('.heatmap-zelle {');
        assert.ok(i > 0, '.heatmap-zelle fehlt im Stylesheet');
        const rumpf = css.slice(i, css.indexOf('}', i));
        assert.ok(/display:\s*grid/.test(rumpf),
            '.heatmap-zelle ist kein Raster mehr — dann fallen die Felder '
            + 'untereinander und der Vergleich nebeneinander ist weg');
        const spalten = /grid-template-columns:\s*([^;]+);/.exec(rumpf);
        assert.ok(spalten, 'die Spalten des Zellenrasters sind nicht gesetzt');
        assert.strictEqual(spalten[1].trim().split(/\s+/).length, 3,
            `das Zellenraster hat ${spalten[1].trim().split(/\s+/).length} Spalten `
            + '(erwartet 3: Kennzahl, online, Major) — mit zwei Spalten steht '
            + 'die Major-Zahl wieder unter der Online-Zahl');
    });

    it('beide Kennzahlen sind beschriftet', () => {
        assert.ok(/'heatmap\.wrLabel'/.test(jsK),
            'die Zeilenbeschriftung "Win Rate" fehlt');
        assert.ok(/'heatmap\.gamesShort'/.test(jsK),
            'die Zeilenbeschriftung fuer die Matches fehlt — eine nackte Zahl '
            + 'in der Zelle war schon einmal der Befund ("n ist gleich sagt '
            + 'nichts aus")');
        // Und sie heisst ueberall gleich: "Matches", nicht "Partien".
        const i18n = lies(path.join('js', 'i18n.js'));
        const gs = [...i18n.matchAll(/'heatmap\.gamesShort':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(gs.length, 2,
            `heatmap.gamesShort steht ${gs.length}× in i18n.js, erwartet 2`);
        for (const w of gs) {
            assert.strictEqual(w, 'Matches',
                `die Matchzahl heisst hier "${w}" — der Betreiber wollte `
                + '"Matches wie ueberall woanders auch"');
        }
    });

    it('die Matchzahl beider Quellen steht in der Zelle', () => {
        const i = jsK.indexOf('const zellenHtml');
        assert.ok(i > 0, 'die Zelle wird nicht mehr aus zellenHtml gebaut');
        const rumpf = jsK.slice(i, jsK.indexOf('const majorTip', i));
        assert.ok(/\$\{totalGames\}/.test(rumpf),
            'die Online-Matchzahl fehlt in der Zelle');
        const nFelder = [...rumpf.matchAll(
            /heatmap-zelle-n[^"]*">\$\{([\s\S]*?)\}<\/span>/g)].map(m => m[1]);
        assert.strictEqual(nFelder.length, 2,
            `die Zelle zeichnet ${nFelder.length} Matchzahl-Felder, erwartet 2 `
            + '(online und Major)');
        assert.ok(/\btotalGames\b/.test(nFelder[0]),
            'das erste Matchzahl-Feld traegt nicht die Online-Matchzahl');
        assert.ok(/^\s*mj\s*\?/.test(nFelder[1]) && /mj\.anzahl/.test(nFelder[1]),
            'das zweite Matchzahl-Feld haengt nicht an "es gibt einen '
            + 'Major-Wert" oder traegt dessen Matchzahl nicht — von 90 Zellen '
            + 'haben nur 56 mindestens 10 Matches, ohne die Zahl sieht man '
            + 'das nicht');
        const wrFelder = [...rumpf.matchAll(
            /heatmap-zelle-wr[^"]*">\$\{([\s\S]*?)\}<\/span>/g)].map(m => m[1]);
        assert.strictEqual(wrFelder.length, 2,
            `die Zelle zeichnet ${wrFelder.length} Win-Rate-Felder, erwartet 2`);
        assert.ok(/mj\s*\?/.test(wrFelder[1]) && /mj\.punkte/.test(wrFelder[1]),
            'das Major-Win-Rate-Feld haengt nicht am Major-Wert');
        assert.ok(/heatmap\.majorLabel/.test(rumpf) && /heatmap\.onlineLabel/.test(rumpf),
            'die Quellen sind in der gebauten Zelle nicht beschriftet');
    });

    it('duenne Paarungen werden markiert', () => {
        assert.ok(/majorDuenn = !!\(mj && mj\.anzahl < 10\)/.test(jsK),
            'die Markierung fuer duenne Paarungen ist weg');
        // Sie muss auch ANKOMMEN: die Klasse haengt an majorDuenn, nicht
        // an einer Konstanten.
        assert.ok(/const dk = majorDuenn \? ' heatmap-zelle-duenn' : ''/.test(jsK),
            'die Markierung haengt nicht mehr an majorDuenn');
        const css = lies(path.join('css', 'styles.css'));
        assert.ok(/\.heatmap-zelle-duenn\s*\{[^}]*font-style:\s*italic/.test(css),
            'die Markierung fehlt im Stylesheet oder ist keine Kursivstellung '
            + 'mehr — Blaesse ist hier verboten, sie kostete schon einmal den '
            + 'Kontrast (3,42:1)');
    });

    it('der Hinweis nennt die Zaehlweise', () => {
        // DAS ist die Zusage, an der alles haengt: zwei Skalen nebeneinander
        // ohne Erklaerung ist genau der Fehler, den diese Seite seit Wochen
        // abarbeitet.
        // BEIDE Sprachen pruefen. Die erste Fassung dieser Zusage nahm den
        // ersten Treffer — das ist der englische Eintrag — und suchte darin
        // nach "Matchpunkte".
        const i18n = lies(path.join('js', 'i18n.js'));
        const eintraege = [...i18n.matchAll(/'heatmap\.majorTip':\s*'([^']*)'/g)].map(m => m[1]);
        assert.strictEqual(eintraege.length, 2,
            `der Hinweis zur Major-Zahl steht ${eintraege.length}× in i18n.js, `
            + 'erwartet 2 (deutsch und englisch)');
        const [en, de2] = eintraege[0].includes('Matchpunkte')
            ? [eintraege[1], eintraege[0]] : eintraege;
        assert.ok(/Matchpunkte/.test(de2) && /match points/i.test(en),
            'der Hinweis sagt nicht mehr in beiden Sprachen, dass die '
            + 'Major-Zahl Matchpunkte rechnet — dann stehen zwei Skalen '
            + 'nebeneinander und laden zum Vergleichen ein, der so nicht stimmt');
        for (const s of [de2, en]) {
            assert.ok(/2 (Punkte|points)/.test(s),
                'der Hinweis beziffert den systematischen Abstand nicht mehr '
                + '(gemessen Median -2,0 pp, davon -1,8 reine Zaehlweise): ' + s.slice(0, 80));
        }
    });
});

describe('Die Zahlen hinter der Anzeige', () => {

    const norm = (s) => String(s || '').toLowerCase().replace(/[’‘‛'`´\s-]/g, '');
    const mj = csv(path.join('data', 'labs_tournament_matchups_TEF-PBL.csv'), ',')
        .filter(r => r.day_filter === 'overall');
    const decks = csv(path.join('data', 'limitless_online_decks.csv'), ';')
        .map(r => r.deck_name).slice(0, 10);

    it('das Top-10-Gitter ist wirklich abgedeckt', () => {
        const M = {};
        for (const r of mj) {
            const a = norm(r.my_deck_name), b = norm(r.opponent_deck_name);
            (M[a] = M[a] || {})[b] = parseInt(r.vs_count || '0', 10) || 0;
        }
        let zellen = 0, mit = 0;
        for (const a of decks) for (const b of decks) {
            if (norm(a) === norm(b)) continue;
            zellen++;
            if ((M[norm(a)] || {})[norm(b)]) mit++;
        }
        assert.ok(zellen >= 80, `nur ${zellen} Zellen im Top-10-Gitter`);
        assert.ok(mit / zellen > 0.8,
            `nur ${mit} von ${zellen} Zellen haben einen Major-Wert — unter `
            + '80 % waere die zweite Zeile mehr Luecke als Aussage, und die '
            + 'Anzeige gehoert neu bewertet');
    });

    it('vs_win_pct sind wirklich Matchpunkte', () => {
        // Wenn die Quelle das aendert, ist der Hinweis falsch — und ein
        // falscher Hinweis ist schlimmer als keiner.
        const decks2 = csv(path.join('data', 'labs_tournament_decks_TEF-PBL.csv'), ',');
        let treffer = 0, geprueft = 0;
        for (const d of decks2) {
            const w = zahl(d.wins), l = zahl(d.losses), t2 = zahl(d.ties);
            const g = w + l + t2;
            if (g < 50) continue;
            geprueft++;
            const mp = ((3 * w + t2) / (3 * g)) * 100;
            if (Math.abs(mp - zahl(d.win_pct)) < 0.05) treffer++;
        }
        assert.ok(geprueft >= 5, 'zu wenige Zeilen fuer die Pruefung');
        assert.strictEqual(treffer, geprueft,
            `nur ${treffer} von ${geprueft} Zeilen passen zur Matchpunkt-Formel — `
            + 'die Quelle hat ihre Konvention geaendert, der Hinweis an der '
            + 'Heatmap-Zelle stimmt dann nicht mehr');
    });
});

describe('Die Tabellenbreite folgt der Spaltenzahl', () => {

    it('keine feste Pixelbreite mehr', () => {
        assert.ok(!/width:\s*920px/.test(css),
            'die Tabelle steht wieder auf 920 px fest. Live bei 390 px '
            + 'gemessen: gefiltert auf zwei Decks begann die Antwortzelle bei '
            + 'x = 579 in einem 332 px breiten Fenster — fuenf Decknamen '
            + 'sichtbar, keine Zahl');
    });

    it('sie rechnet aus der Spaltenzahl', () => {
        const treffer = (css.match(/--heatmap-cols/g) || []).length;
        assert.ok(treffer >= 4,
            `--heatmap-cols steht nur ${treffer}× im Stylesheet — es gab vier `
            + 'Medienabfragen mit der festen Breite, jede braucht den Ersatz');
        assert.ok(/calc\(170px \+ var\(--heatmap-cols/.test(css),
            'die Breite rechnet nicht mehr aus erster Spalte plus Datenspalten');
    });

    it('die Spaltenzahl wird beim Zeichnen gesetzt', () => {
        assert.ok(/--heatmap-cols: \$\{xDecks\.length\}/.test(js),
            'die Spaltenzahl kommt nicht mehr aus dem Zeichnen — dann greift '
            + 'im Stylesheet immer der Vorgabewert 10');
    });

    it('es gibt einen Hinweis, dass die Tabelle weitergeht', () => {
        // Bei zehn Spalten ragt sie am Handy 618 px ueber das Fenster
        // hinaus. Auf Beruehrungsgeraeten blendet das System die Leiste
        // aus, solange nicht gescrollt wird.
        const i = css.indexOf('.heatmap-table-scroll');
        const rumpf = css.slice(i, i + 900);
        // BEIDE Verlaeufe muessen mitscrollen — es gibt einen links und einen
        // rechts. Die erste Fassung verlangte nur einen und blieb gruen, als
        // der linke auf `scroll` gesetzt wurde.
        const lokal = (rumpf.match(/no-repeat local/g) || []).length;
        assert.strictEqual(lokal, 2,
            `nur ${lokal} der beiden Kanten-Verlaeufe scrollen mit — sie muessen `
            + '`local` sein, sonst stehen sie auch am Ende der Tabelle noch da '
            + 'und behaupten, es ginge weiter');
    });
});
