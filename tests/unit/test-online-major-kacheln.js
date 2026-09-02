'use strict';
/*
 * Anteil und Win Rate tragen zwei Zahlen: online und Major.
 *
 * ANLASS (01.09.2026)
 * -------------------
 * Auftrag des Betreibers: "In der tierlist bei global sollte wir Share:
 * online x Major y ttl z % und das gleiche fuer winrate und top 8 / day 2
 * Quote. So sieht man schnell den Unterschied zwischen online und Major
 * Ergebnissen."
 *
 * Und der Unterschied ist gross. Gemessen gegen Worlds San Francisco
 * (774 Spieler, 44 Archetypen):
 *
 *     Deck                  Anteil online   Anteil Major
 *     Dragapult                    7,3 %        22,2 %
 *     Dragapult Dusknoir           5,5 %        10,5 %
 *     Mega Excadrill               7,5 %         4,1 %
 *     Dhelmise                     4,0 %         1,0 %
 *
 * DREI ZUSAGEN, DIE HIER HAENGEN
 *
 * 1  BEIDE WIN RATES SIND SIEGE / ALLE PARTIEN.
 *    Entscheidung des Betreibers. Die Labs-Datei fuehrt daneben `win_pct`
 *    als MATCHPUNKTE ((3S+U)/3n) — wer die liest, stellt eine Siegquote
 *    neben eine Punktequote. Gemessen liegen die beiden bei Dragapult
 *    4,0 pp auseinander (42,4 gegen 46,4).
 *
 * 2  DIE KOMMA-FALLE.
 *    Die Labs-Auszuege trennen an ',', die eigenen Exporte an ';'. Mit
 *    ';' geparst wird die Datei zu Zeilen mit EINEM Feld, `deck_name` ist
 *    undefined, und alles faellt still auf "kein Major" zurueck. Genau so
 *    hat die Tier-Liste am selben Tag Worlds nicht gesehen (PR #602).
 *
 * 3  KEINE 0,0 % FUER FEHLENDE DATEN.
 *    "War nicht dabei" und "hat nichts erreicht" sind verschiedene
 *    Aussagen. Fehlt die Major-Seite, steht dort ein Strich.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const quelle = fs.readFileSync(path.join(wurzel, 'js', 'app-archetype-card.js'), 'utf8');
const ohneKomm = quelle
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '');

const zahl = (s) => parseFloat(String(s || '').replace(',', '.')) || 0;

/* Zaehlt Anfuehrungszeichen — genau wie der Teiler im Quelltext.
   Ein naiver split() haette hier gegen dieselben verschobenen Spalten
   geprueft, die er beweisen soll, und waere gruen geblieben. */
function teile(zeile, trenn) {
    const raus = []; let feld = '', inAnf = false;
    for (let i = 0; i < zeile.length; i++) {
        const c = zeile[i];
        if (c === '"') {
            if (inAnf && zeile[i + 1] === '"') { feld += '"'; i++; continue; }
            inAnf = !inAnf; continue;
        }
        if (c === trenn && !inAnf) { raus.push(feld); feld = ''; continue; }
        feld += c;
    }
    raus.push(feld);
    return raus;
}

function csv(pfad, sep) {
    const zeilen = fs.readFileSync(pfad, 'utf8').replace(/^﻿/, '').trim().split('\n');
    const kopf = teile(zeilen[0], sep).map(s => s.trim());
    return zeilen.slice(1).map(z => {
        const c = teile(z, sep);
        const o = {};
        kopf.forEach((k, i) => { o[k] = (c[i] || '').trim(); });
        return o;
    });
}

const LABS = path.join(wurzel, 'data', 'labs_tournament_decks_TEF-PBL.csv');
const ONLINE = path.join(wurzel, 'data', 'limitless_online_decks.csv');

describe('Die Quelle wird richtig gelesen', () => {

    it('der Labs-Auszug wird mit Komma geparst', () => {
        const i = ohneKomm.indexOf('labs_tournament_decks_${key}.csv');
        assert.ok(i > 0, 'der Major-Auszug wird nicht mehr geladen');
        const rumpf = ohneKomm.slice(i, i + 900);
        assert.ok(/parseCsv\([^)]*,\s*','\s*\)/.test(rumpf),
            "der Major-Auszug wird ohne ',' geparst — mit dem hauseigenen "
            + "';' wird die Datei zu Zeilen mit einem Feld, deck_name ist "
            + 'undefined und die ganze Major-Spalte faellt still auf leer');
    });

    it('erst das Verzeichnis fragen, dann die Datei holen', () => {
        // Sonst steht bei jedem Seitenaufruf eines frischen Formats eine
        // 404 in der Konsole, die keine ist.
        //
        // NICHT auf den blossen Dateinamen pruefen: der steht in der
        // Konstante ganz oben und bleibt auch dann stehen, wenn niemand
        // sie mehr benutzt. Gemessen — die erste Fassung dieses Tests
        // ueberlebte genau diese Mutation.
        const i = ohneKomm.indexOf('function _majorLaden');
        assert.ok(i > 0, '_majorLaden ist verschwunden');
        const rumpf = ohneKomm.slice(i, ohneKomm.indexOf('function load()', i));
        assert.ok(/fetch\(\s*base\s*\+\s*MAJOR_VERZ_URL/.test(rumpf),
            'das Verzeichnis wird nicht mehr abgefragt — dann steht bei jedem '
            + 'Seitenaufruf eines Formats ohne Präsenzturnier eine 404 in der Konsole');
        const iVerz = rumpf.indexOf('MAJOR_VERZ_URL');
        const iCsv = rumpf.indexOf('labs_tournament_decks_${key}.csv');
        assert.ok(iVerz > 0 && iCsv > iVerz,
            'der Auszug wird geholt, bevor das Verzeichnis gefragt wurde');
        assert.ok(/meta_keys/.test(rumpf),
            'die Antwort des Verzeichnisses wird nicht ausgewertet');
    });

    it('die Major-Win-Rate wird gerechnet, nicht aus win_pct gelesen', () => {
        assert.ok(!/r\.win_pct/.test(ohneKomm),
            'die Spalte `win_pct` der Labs-Datei wird gelesen — sie fuehrt '
            + 'MATCHPUNKTE (3S+U)/3n, waehrend die Online-Seite Siege durch '
            + 'Partien rechnet. Bei Dragapult sind das 4,0 pp Unterschied, '
            + 'und die Kachel stellte zwei Skalen nebeneinander');
        assert.ok(/siege\s*\/\s*e\.partien|e\.siege\s*\/\s*e\.partien/.test(ohneKomm),
            'die Win Rate wird nicht mehr als Siege durch alle Partien gerechnet');
    });
});

describe('Der CSV-Teiler zaehlt Anfuehrungszeichen', () => {

    /* GEFUNDEN 01.09.2026, und zwar durch Glueck.
     *
     * Die Labs-Auszuege fuehren eine Spalte `pokemon` mit einer Liste
     * darin:
     *
     *     …,Dragapult Dusknoir,dragapult-dusknoir,"dragapult, dusknoir",81,…
     *
     * 28 der 44 Zeilen tragen so ein Feld. Mit `split(',')` zerfaellt es
     * in zwei, und ab dort ist jede folgende Spalte um eins verschoben.
     * Aufgefallen ist es nur, weil die Day-2-Quote des Feldes dadurch auf
     * 404,5 % kam — eine Quote ueber 100 sieht man. Die 27 Decks darunter
     * waeren still falsch gewesen: `player_count` las 'dusknoir"',
     * `day1_players` las 0.
     *
     * Deshalb steht das hier als eigene Zusage und nicht nur als Zahl
     * weiter unten: der naechste, der den Teiler anfasst, soll den Grund
     * lesen und nicht auf dasselbe Glueck angewiesen sein. */

    it('die Datei enthaelt wirklich Felder mit Komma in Anfuehrungszeichen', () => {
        const roh = fs.readFileSync(LABS, 'utf8');
        const mitAnf = roh.split('\n').filter(z => /"[^"]*,[^"]*"/.test(z)).length;
        assert.ok(mitAnf >= 10,
            `nur ${mitAnf} Zeilen mit eingebettetem Komma — wenn die Quelle das `
            + 'nicht mehr tut, ist diese Pruefung hinfaellig, aber der Teiler '
            + 'darf trotzdem nicht zurueckgebaut werden');
    });

    it('der Teiler im Quelltext ueberspringt Trenner in Anfuehrungszeichen', () => {
        const i = ohneKomm.indexOf('function teile(');
        assert.ok(i > 0,
            'der zeichenweise Teiler ist weg — mit blossem split() verschiebt '
            + 'sich ab dem ersten Feld mit eingebettetem Komma jede Spalte um '
            + 'eins (gemessen: Day-2-Quote des Feldes 404,5 % statt 18,2 %)');
        const rumpf = ohneKomm.slice(i, i + 800);
        assert.ok(/inAnf\s*=\s*!inAnf/.test(rumpf),
            'der Teiler zaehlt die Anfuehrungszeichen nicht mehr');
        assert.ok(/c === trenn && !inAnf/.test(rumpf),
            'der Teiler trennt auch innerhalb von Anfuehrungszeichen');
    });

    it('parseCsv wird ueber den Teiler gefuehrt, nicht ueber split', () => {
        const i = ohneKomm.indexOf('function parseCsv(');
        const rumpf = ohneKomm.slice(i, i + 600);
        assert.ok(!/\.split\(trenn\)/.test(rumpf),
            'parseCsv teilt wieder mit split(trenn) — dann ist der zeichenweise '
            + 'Teiler daneben Zierde');
        assert.ok(/teile\(/.test(rumpf), 'parseCsv benutzt den Teiler nicht');
    });

    it('die Feld-Day-2-Quote bleibt eine Quote', () => {
        // Der Wert, an dem der Fehler aufgefallen ist. Ueber 100 ist keine
        // Quote, sondern ein Hinweis, dass Spalten verrutscht sind.
        let d1 = 0, d2 = 0;
        for (const r of csv(LABS, ',')) {
            d1 += zahl(r.day1_players); d2 += zahl(r.day2_players);
        }
        const quote = d1 > 0 ? (d2 / d1) * 100 : 0;
        assert.ok(quote > 5 && quote < 60,
            `Feld-Day-2-Quote ${quote.toFixed(1)} % — ausserhalb jedes plausiblen `
            + 'Bereichs. Bei 404,5 % waren die Spalten um eins verschoben');
    });
});

describe('Was die beiden Spalten an den echten Daten zeigen', () => {

    // Der Nachbau hier ist bewusst klein: er prueft die DATEN, nicht die
    // Anzeige. Dass die Anzeige diese Zahlen nimmt, halten die Zusagen
    // oben ueber die Quelle.
    const major = {};
    for (const r of csv(LABS, ',')) {
        const k = String(r.deck_name || '').trim();
        if (!k) continue;
        const s = zahl(r.wins), n = zahl(r.losses), u = zahl(r.ties);
        const e = major[k] || (major[k] = { share: 0, siege: 0, partien: 0, u: 0, d1: 0, d2: 0 });
        e.share += zahl(r.share_pct); e.siege += s; e.partien += s + n + u; e.u += u;
        e.d1 += zahl(r.day1_players); e.d2 += zahl(r.day2_players);
    }
    const online = {};
    for (const r of csv(ONLINE, ';')) {
        const k = String(r.deck_name || '').trim();
        if (!k) continue;
        online[k] = { share: zahl(r.share_numeric), siege: zahl(r.wins),
                      partien: zahl(r.wins) + zahl(r.losses) + zahl(r.ties) };
    }

    it('die Namen der beiden Quellen treffen sich', () => {
        // Ohne das steht ueberall "kein Major", und niemand merkt es.
        const treffer = Object.keys(major).filter(k => online[k]);
        assert.ok(treffer.length >= 25,
            `nur ${treffer.length} von ${Object.keys(major).length} Major-Decks `
            + 'finden ihre Online-Zeile — die Schluessel sind auseinandergelaufen');
    });

    it('der Anteil unterscheidet sich stark genug, dass die Spalte sich lohnt', () => {
        const paare = Object.keys(major).filter(k => online[k] && online[k].share > 1)
            .map(k => Math.abs(major[k].share - online[k].share));
        const gross = paare.filter(x => x >= 2).length;
        assert.ok(gross >= 5,
            `nur ${gross} Decks weichen um mindestens 2 pp ab — dann traegt die `
            + 'Major-Spalte keine Aussage und die Kachel waere Dekoration');
    });

    it('Dragapult ist der Fall, wegen dem es die Spalte gibt', () => {
        // Wenn diese Zusage faellt, hat sich die Datenlage geaendert und
        // die ganze Anzeige gehoert neu bewertet — nicht der Test angepasst.
        const o = online['Dragapult'], m = major['Dragapult'];
        assert.ok(o && m, 'Dragapult fehlt in einer der beiden Quellen');
        assert.ok(m.share > o.share * 2,
            `Dragapult bringt am Major nicht mehr das Mehrfache seines `
            + `Online-Anteils (online ${o.share.toFixed(1)} %, Major ${m.share.toFixed(1)} %)`);
    });

    it('die Remisquote am Major ist um ein Vielfaches hoeher als online', () => {
        // Das ist der Satz, der im Hinweis stehen MUSS. Ohne ihn liest
        // sich die niedrigere Major-Win-Rate als Leistungseinbruch.
        let u = 0, g = 0;
        for (const k of Object.keys(major)) { u += major[k].u; g += major[k].partien; }
        const quote = g > 0 ? (u / g) * 100 : 0;
        assert.ok(quote > 5,
            `Remisquote am Major nur ${quote.toFixed(2)} % — dann ist der `
            + 'Hinweis an der Win-Rate-Kachel irrefuehrend geworden');
        // Auf die STELLE pruefen, nicht auf die Datei: das Wort steht auch
        // in den Kommentaren, und die erste Fassung dieses Tests blieb
        // deshalb gruen, als der Hinweis selbst umgeschrieben wurde.
        const i = ohneKomm.indexOf("arc.wrTipMajor");
        assert.ok(i > 0, 'der Major-Teil des Win-Rate-Hinweises ist verschwunden');
        const hinweis = ohneKomm.slice(i, i + 700);
        assert.ok(/unentschieden/.test(hinweis) && /\{u\}/.test(hinweis),
            'der Hinweis nennt die Remisquote nicht mehr — '
            + `am Major enden ${quote.toFixed(1)} % der Partien unentschieden, online 1,3 %, `
            + 'und das kostet die Major-Spalte rund fuenf Punkte ohne jede '
            + 'Leistungsaenderung. Ohne den Satz liest sich die Kachel als Einbruch');
        assert.ok(/remisQuote/.test(ohneKomm),
            'die Remisquote wird gar nicht mehr gerechnet');
    });
});

describe('Die Kachel haengt nicht an der Bildschirmbreite', () => {

    /* KORREKTUR 02.09.2026 — die erste Fassung schob die Zahlen
     * uebereinander: "7,5 %4,1 %" stand als ein Klumpen da.
     *
     * Zwei Fehler, derselbe Denkfehler: Bildschirmbreite mit KARTENbreite
     * verwechselt.
     *   - `@media (min-width: 720px)` fragt den Bildschirm. Die Karte ist
     *     aber auch am Schreibtisch nur rund 380 px breit. Dort griff also
     *     die Vierer-Reihe: 95 px je Kachel, zwei Haelften a 40 px, und
     *     "22,2 %" braucht 50.
     *   - `clamp(0.92rem, 3.4vw, 1.18rem)` rechnet 3,4 % der BILDSCHIRM-
     *     breite: auf 1280 px sind das 43 px, also der obere Anschlag —
     *     die groesste Schrift genau dort, wo am wenigsten Platz war.
     *
     * Nachgemessen an geklonten Kacheln in Kaesten bekannter Breite:
     * 320/380/420 px -> 2 je Reihe, ab 620 px -> 4 in einer, keine
     * Ueberlappung, keine leere Spur. */

    const cssRoh = fs.readFileSync(path.join(wurzel, 'css', 'styles.css'), 'utf8');
    // Kommentare zuerst weg: im Block steht die alte Fassung als
    // Begruendung drin, und eine Suche wuerde sie als Rueckfall lesen.
    const css = cssRoh.replace(/\/\*[\s\S]*?\*\//g, ' ');

    /* GENAU den Regelrumpf schneiden, nicht ein Fenster von n Zeichen.
     * Die erste Fassung dieses Tests nahm 2600 Zeichen ab dem Selektor —
     * nach dem Entfernen der Kommentare reichte das in NACHBARREGELN
     * hinein, und zwei Mutationen blieben deshalb gruen: ein `flex-wrap`
     * aus einer fremden Regel erfuellte die Zusage stellvertretend. */
    function rumpf(selektor) {
        const re = new RegExp('(^|[},\\s])' + selektor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{');
        const m = re.exec(css);
        assert.ok(m, 'die Regel ' + selektor + ' fehlt im Stylesheet');
        const auf = css.indexOf('{', m.index);
        const zu = css.indexOf('}', auf);
        assert.ok(zu > auf, 'die Regel ' + selektor + ' ist nicht geschlossen');
        return css.slice(auf + 1, zu);
    }
    const ohneCssKomm = css.slice(css.indexOf('.arc-tiles--vier'),
                                 css.indexOf('.arc-tiles--vier') + 1600);

    it('keine Bildschirm-Medienabfrage steuert die Kachelreihe', () => {
        // Im GANZEN Stylesheet suchen, nicht nur im Rumpf: die Medienabfrage
        // steht ja gerade AUSSERHALB der Regel. Die erste Fassung dieses
        // Tests suchte im Block ab dem Selektor und uebersah sie deshalb.
        for (const m of css.matchAll(/@media[^{]*\{/g)) {
            const auf = css.indexOf('{', m.index);
            // grob bis zur schliessenden Klammer der Medienabfrage
            let tiefe = 0, j = auf;
            for (; j < css.length; j++) {
                if (css[j] === '{') tiefe++;
                else if (css[j] === '}') { tiefe--; if (tiefe === 0) break; }
            }
            const inhalt = css.slice(m.index, j + 1);
            if (!/min-width|max-width/.test(m[0])) continue;
            assert.ok(!/arc-tiles--vier|arc-halbe|arc-halb\b/.test(inhalt),
                'die Kachelreihe haengt wieder an einer Bildschirmbreite '
                + `(${m[0].trim()}). Die Karte ist auch am Schreibtisch nur `
                + '~380 px breit — dort griff die Vierer-Reihe, jede Haelfte '
                + 'bekam 40 px, und "22,2 %" braucht 50: die Zahlen schoben '
                + 'sich uebereinander');
        }
    });

    it('die Schriftgroesse der Zahlen haengt nicht an vw', () => {
        const regel = rumpf('.arc-halb .arc-tile-value');
        assert.ok(!/vw/.test(regel),
            'die Zahlengroesse rechnet wieder mit vw — das ist die BILDSCHIRM-'
            + 'breite, nicht die der Kachel, und wird am Schreibtisch am groessten, '
            + 'wo am wenigsten Platz ist');
        assert.ok(/font-size:\s*[\d.]+rem/.test(regel),
            'die Zahlengroesse ist nicht mehr fest gesetzt');
    });

    it('die Reihe legt keine leeren Plaetze an', () => {
        // `repeat(auto-fit, minmax(150px, 1fr))` erzeugte bei 900 px eine
        // fuenfte Spur fuer vier Kacheln.
        const reihe = rumpf('.arc-tiles--vier');
        assert.ok(!/grid-template-columns:\s*repeat\(auto-f/.test(reihe),
            'auto-fit ist zurueck — bei breiter Karte legt es eine Spur mehr an, '
            + 'als es Kacheln gibt (gemessen 5 Spuren fuer 4 Kacheln bei 900 px)');
        assert.ok(/display:\s*flex/.test(reihe) && /flex-wrap:\s*wrap/.test(reihe),
            'die Reihe bricht nicht mehr per flex-wrap um');
    });

    it('die Ueberschrift steht oben und haelt ihre Hoehe', () => {
        // Sonst stehen die Zahlen der geteilten und der einfachen Kacheln
        // auf verschiedenen Hoehen: "Day-2-Quote (Major)" bricht um,
        // "Anteil" nicht.
        const kopf = rumpf('.arc-tiles--vier .arc-tile-label');
        assert.ok(/order:\s*-1/.test(kopf),
            'die Ueberschrift steht nicht mehr oben');
        assert.ok(/min-height:\s*[\d.]+em/.test(kopf),
            'die Ueberschrift hat keine Mindesthoehe mehr — dann stehen die '
            + 'Zahlen der vier Kacheln auf verschiedenen Zeilen');
    });

    it('Herkunft und Zahl stehen in einer Zeile, die Zeilen untereinander', () => {
        const regel = rumpf('.arc-halbe');
        assert.ok(/grid-template-columns:\s*1fr/.test(regel),
            'die beiden Herkuenfte stehen wieder nebeneinander — nebeneinander '
            + 'passen sie in die echte Kartenbreite nicht');
        const zeile = rumpf('.arc-halb');
        assert.ok(/justify-content:\s*space-between/.test(zeile),
            'Herkunft und Zahl stehen nicht mehr an den beiden Enden ihrer Zeile');
    });

    it('das Markup setzt die Herkunft VOR die Zahl', () => {
        const i = ohneKomm.indexOf('const halb = (wert, quelle, schwach');
        assert.ok(i > 0, 'der Halb-Baustein ist verschwunden');
        const rumpf = ohneKomm.slice(i, i + 420);
        assert.ok(rumpf.indexOf('arc-halb-quelle') < rumpf.indexOf('arc-tile-value'),
            'die Zahl steht wieder vor ihrer Herkunft — in einer Zeile gelesen '
            + 'gehoert erst hin, WORAUS die Zahl kommt');
    });
});

describe('Fehlende Major-Daten werden als fehlend gezeigt', () => {

    it('es gibt einen Leer-Text, keine Null', () => {
        // Der Schluessel steht an mehreren Stellen; die erste Fassung
        // dieses Tests ueberlebte deshalb, dass eine davon umbenannt wurde.
        // Geprueft wird die Variable, die BEIDE geteilten Kacheln fuettert.
        assert.ok(/const majorLeer\s*=\s*L\('arc\.keinMajor'/.test(ohneKomm),
            'der Text fuer "kein Major" haengt nicht mehr an majorLeer — dann '
            + 'steht dort 0,0 %, und "war nicht dabei" liest sich als '
            + '"hat nichts erreicht"');
        for (const stelle of ["tileGeteilt('rep'", "tileGeteilt('wr'"]) {
            const i = ohneKomm.indexOf(stelle);
            assert.ok(i > 0, stelle + ' fehlt');
            assert.ok(/majorLeer/.test(ohneKomm.slice(i, i + 900)),
                stelle + ' zeigt keinen Leer-Text mehr, wenn die Major-Seite fehlt');
        }
    });

    /* DIESE ZUSAGE WURDE AM 02.09.2026 UMGEDREHT.
     *
     * Sie verlangte vorher eine Mindest-Stichprobe, unter der die
     * Major-Win-Rate GAR NICHT erschien (`MIN_MAJOR_PARTIEN = 40`). Der
     * Betreiber hat gemeldet, was das anrichtet: "es gibt Major Daten
     * warum werden sie nicht genutzt?" — Lucario Hariyama 14-15-2 und
     * Rocket's Mewtwo 8-8-2 standen auf "zu wenige".
     *
     * Nachgemessen war die Schwelle willkuerlich. Sie verbarg 27 von 44
     * Decks, und sie trennte nichts:
     *
     *     Grimmsnarl Froslass  45 Partien · ±15 pp  ANGEZEIGT
     *     Alakazam Dusknoir    39 Partien · ±16 pp  verborgen
     *
     * Die Begruendung, die im Code stand, trug nicht einmal: sie nannte
     * Grimmsnarl als das, was die Schwelle verhindere — und Grimmsnarl
     * lag darueber.
     *
     * Die neue Zusage: die Zahl wird GEZEIGT, und daneben steht, wie
     * sicher sie ist. */
    it('die Major-Win-Rate wird gezeigt, sobald es Partien gibt', () => {
        assert.ok(!/MIN_MAJOR_PARTIEN/.test(ohneKomm),
            'die harte Mindest-Stichprobe ist zurueck — sie verbarg 27 von 44 '
            + 'Decks und trennte dabei nichts (45 Partien angezeigt, 39 verborgen, '
            + 'bei praktisch gleicher Unsicherheit)');
        assert.ok(/wrMajor = \(m && m\.winRate != null && m\.partien > 0\)/.test(ohneKomm),
            'die Major-Win-Rate haengt wieder an einer anderen Bedingung als '
            + '"es gibt ueberhaupt Partien"');
    });

    it('die Partienzahl steht auf der Kachel, nicht nur im Hinweis', () => {
        // Ein Hinweis erscheint erst beim Verweilen — auf dem Telefon also nie.
        // Die Partienzahl ist aber genau die Zahl, an der man entscheidet, ob
        // man der Quote glaubt.
        assert.ok(/arc\.quelleMajorN/.test(quelle),
            'die Partienzahl ist von der Major-Zeile verschwunden');
        assert.ok(/\{n\} Partien/.test(quelle),
            'die Beschriftung nennt die Partienzahl nicht mehr');
    });

    it('eine duenne Stichprobe wird markiert statt verschwiegen', () => {
        assert.ok(/MAJOR_DUENN_PARTIEN\s*=\s*\d+/.test(ohneKomm),
            'die Markierung fuer duenne Stichproben ist weg');
        const m = ohneKomm.match(/MAJOR_DUENN_PARTIEN\s*=\s*(\d+)/);
        assert.ok(Number(m[1]) >= 50,
            `die Schwelle liegt bei ${m[1]} Partien — bei so wenigen ist das `
            + '95-%-Intervall breiter als ±14 Punkte und die Daempfung sagt nichts mehr');
        assert.ok(/arc-halb--duenn/.test(quelle),
            'die gedaempfte Darstellung wird nicht mehr gesetzt');
        const css = fs.readFileSync(path.join(wurzel, 'css', 'styles.css'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ');
        // Auf die ZAHL pruefen, nicht auf das blosse Vorkommen der Klasse:
        // die erste Fassung dieser Zusage blieb gruen, als die Regel fuer den
        // Wert umbenannt wurde und nur die fuer die Beschriftung stehenblieb.
        assert.ok(/\.arc-halb--duenn\s+\.arc-tile-value\s*\{[^}]*opacity/.test(css),
            'die duenne ZAHL wird nicht mehr gedaempft dargestellt — dann sieht '
            + 'eine Quote aus 18 Partien aus wie eine aus 1.277');
    });

    it('das Vertrauensintervall steht im Hinweis', () => {
        assert.ok(/wrKi/.test(ohneKomm), 'das Intervall wird nicht mehr gerechnet');
        assert.ok(/1\.96|196 \* Math\.sqrt/.test(ohneKomm),
            'das Intervall wird nicht mehr aus der Normalverteilung gerechnet');
        assert.ok(/±\{k\} Punkte/.test(quelle),
            'der Hinweis nennt das Intervall nicht mehr — dann steht dort eine '
            + 'Zahl ohne jede Angabe, wie sicher sie ist');
    });

    it('der Anteil wird auch ohne Mindestzahl gezeigt', () => {
        // Er ruht auf Antritten, nicht auf Partien: "1 von 774" ist eine
        // belastbare Aussage, 24,4 % aus 45 Partien nicht.
        const i = ohneKomm.indexOf("tileGeteilt('rep'");
        assert.ok(i > 0, 'die Anteils-Kachel ist nicht mehr geteilt');
        const rumpf = ohneKomm.slice(i, i + 400);
        assert.ok(!/MIN_MAJOR_PARTIEN/.test(rumpf),
            'der Anteil haengt jetzt auch an der Partien-Mindestzahl — '
            + 'er ruht aber auf Antritten und ist auch bei einem Antritt richtig');
    });
});

describe('Top-8 und Day 2 bleiben getrennt', () => {

    it('die Top-8-Quote ist als online beschriftet', () => {
        assert.ok(/Top-8-Quote \(online\)/.test(quelle),
            'die Top-8-Quote sagt nicht mehr, dass sie aus Online-Turnieren stammt');
    });

    it('die Day-2-Quote ist als Major beschriftet und hat keine Online-Seite', () => {
        assert.ok(/Day-2-Quote \(Major\)/.test(quelle),
            'die Day-2-Kachel fehlt oder sagt ihre Herkunft nicht');
        // `indexOf("tile('day2'")` findet AUCH `tileGeteilt('day2'` —
        // die erste Fassung dieses Tests ueberlebte deshalb die Mutation.
        // Also auf die Wortgrenze pruefen.
        assert.ok(/(^|[^A-Za-z])tile\('day2'/.test(ohneKomm),
            'die Day-2-Kachel wird nicht mehr als einfache Kachel gezeichnet');
        assert.ok(!/tileGeteilt\('day2'/.test(ohneKomm),
            'Day 2 ist geteilt gezeichnet — online gibt es keinen zweiten Tag, '
            + 'die linke Haelfte waere immer leer und sagte "kein Wert", wo '
            + 'in Wahrheit "diese Groesse existiert dort nicht" gilt');
    });

    it('es gibt keine Major-Top-8-Quote', () => {
        // Ein Major vergibt acht Cut-Plaetze: 22 von 27 Decks stehen dort
        // auf null. Eine solche Spalte saehe aus wie ein Befund.
        let nullen = 0, gesamt = 0;
        for (const r of csv(LABS, ',')) {
            if (!String(r.deck_name || '').trim()) continue;
            gesamt += 1;
            if (zahl(r.top8_count) === 0) nullen += 1;
        }
        assert.ok(nullen / gesamt > 0.7,
            'weniger als 70 % der Major-Decks stehen bei Top 8 auf null — '
            + 'dann liesse sich die Spalte neu bewerten');
        const i = ohneKomm.indexOf("tileGeteilt('conv'");
        assert.strictEqual(i, -1,
            'die Top-8-Kachel ist geteilt — die Major-Haelfte waere bei '
            + `${nullen} von ${gesamt} Decks 0,0 %`);
    });
});
