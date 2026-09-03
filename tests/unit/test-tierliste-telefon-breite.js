'use strict';
/*
 * DIE ARCHETYP-KARTE MUSS IN IHRE SPALTE PASSEN
 * =============================================
 *
 * ANLASS (03.09.2026, mit Bild vom iPhone 17 Pro Max)
 * ---------------------------------------------------
 * Betreiber: "Auf dem iPhone 17 Pro Max sieht man nicht alle Infos in der
 * Tier List auf einen Blick."
 *
 * Gemessen mit Playwright auf 440 x 956, deutsche Oberflaeche, dunkler
 * Modus, alle Abschnitte aufgeklappt. Zwei Ursachen, keine davon die,
 * nach der es aussah:
 *
 * (1) DIE KARTE WAR BREITER ALS IHRE SPALTE UND WURDE ABGESCHNITTEN.
 *     `.arc-inline-list` ist ein Raster; unter 860 px eine Spalte. Eine
 *     Rasterzelle steht ohne Zutun auf `min-width: auto` und schrumpft
 *     nicht unter ihren Mindestinhalt. Der Mindestinhalt der Karte ist
 *     die Matchup-Tabelle mit `min-width: 433px`. Die Spalte war aber
 *     412 px breit: die Karte wurde 435 px breit, ragte nach rechts
 *     hinaus, und `.ds-sec { overflow-x: hidden }` schnitt sie dort ab.
 *     OHNE Rollbalken — das Abgeschnittene war nicht erreichbar.
 *     `min-width: 0` auf die Rasterzelle behebt das.
 *
 * (2) DER TELEFONBLOCK NAHM DEN MAJOR-SPALTEN IHRE BREITE WIEDER WEG.
 *     In `@media (max-width: 620px)` stand `th:nth-child(n+3) { width:
 *     36px }` ohne obere Grenze. Diese Regel steht spaeter in der Datei
 *     als die Grundbreiten und hat dieselbe Spezifitaet — sie gewann.
 *     Die Summe fiel auf 372 px, `min-width: 433px` zog die Tabelle
 *     wieder auseinander, und alle acht Spalten wuchsen anteilig auf
 *     42 px. "MAJOR-WR" braucht 46, "MAJOR-MATCHES" 57; beide standen
 *     ueber ihrer Zelle, und die letzte Spalte lag ausserhalb.
 *
 * GEMESSEN, NICHT GESCHAETZT
 * --------------------------
 *   vorher   Karte 435 px in einer 412-px-Spalte, Rollweg der Tabelle
 *            19 px, zwei Kopfzellen ueber ihrer Spalte.
 *   nachher  Karte 412 px, Rollweg 0, keine Kopfzelle und keine
 *            Wertzelle mehr ueber ihrer Spalte, Deckname weiter in
 *            hoechstens drei Zeilen. Dieselbe Messung bei 320, 390,
 *            440 und 619 px Fensterbreite.
 *
 * WAS HIER GEPRUEFT WIRD
 * ----------------------
 * Die drei Zeilen, an denen es haengt — die Rasterzelle, die Grenze der
 * Sammelregel, und dass der Telefonplan in die Karte passt. Der
 * Browser-Beweis steckt in den Zahlen oben; hier steht, was ihn haelt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const wurzel = path.join(__dirname, '..', '..');
const roh = fs.readFileSync(path.join(wurzel, 'css', 'styles.css'), 'utf8');
// Kommentare zuerst weg — in diesem Projekt haben schon mehrere
// Zusicherungen ihre eigene Begruendung als Treffer gezaehlt.
const css = roh.replace(/\/\*[\s\S]*?\*\//g, ' ');
// Der Abschnitt selbst wohnt in einer anderen Datei.
const bausteine = fs.readFileSync(path.join(wurzel, 'css', 'components.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Der Telefonblock als Text. Klammern zaehlen, nicht raten: der Block
   enthaelt keine verschachtelten Regeln, aber ein `@media` weiter unten
   wuerde ein naives /\{[^}]*\}/ sofort verwirren. */
function block(quelle, kopf) {
    const i = quelle.indexOf(kopf);
    if (i < 0) return null;
    let tiefe = 0, j = quelle.indexOf('{', i);
    for (let k = j; k < quelle.length; k++) {
        if (quelle[k] === '{') tiefe++;
        else if (quelle[k] === '}') { tiefe--; if (tiefe === 0) return quelle.slice(j + 1, k); }
    }
    return null;
}

const TELEFON = block(css, '@media (max-width: 620px)');

/* Aus den Regeln eines Abschnitts die Breite je Spalte 1..8 ableiten.
   Die Datei schreibt vier Formen: (1), (n+3), (n+3):nth-child(-n+6) und
   Aufzaehlungen mehrerer Selektoren vor einer Klammer. Spaeter gewinnt,
   wie im Blatt selbst. */
function spaltenbreiten(abschnitt) {
    const breite = {};
    const regeln = abschnitt.split('}');
    for (const stueck of regeln) {
        const auf = stueck.indexOf('{');
        if (auf < 0) continue;
        const selektor = stueck.slice(0, auf);
        const rumpf = stueck.slice(auf + 1);
        if (!/\.arc-mu-table/.test(selektor)) continue;
        if (!/#currentMetaContent/.test(selektor)) continue;
        const w = /(?:^|[;{\s])width:\s*(\d+)px/.exec(rumpf);
        if (!w) continue;
        for (const m of selektor.matchAll(/nth-child\(([^)]*)\)(?::nth-child\((-n\+\d+)\))?/g)) {
            const von = m[1].trim(), bis = (m[2] || '').trim();
            let a, b;
            if (/^\d+$/.test(von)) { a = b = Number(von); }
            else if (/^n\+(\d+)$/.test(von)) { a = Number(RegExp.$1); b = 8; }
            else continue;
            if (/^-n\+(\d+)$/.test(bis)) b = Number(RegExp.$1);
            for (let s = a; s <= b && s <= 8; s++) breite[s] = Number(w[1]);
        }
    }
    return breite;
}

// Gemessen: auf einem 440-px-Telefon ist die Karte 412 px breit.
const KARTE_412 = 412;

describe('Die Karte darf nicht breiter werden als ihre Spalte', () => {

    it('die Rasterzelle steht auf min-width: 0', () => {
        const regel = /\.arc-inline-list\s*>\s*\*\s*\{([^}]*)\}/.exec(css);
        assert.ok(regel,
            '`.arc-inline-list > *` ist weg. Ohne diese Regel steht die '
            + 'Rasterzelle auf `min-width: auto`, die Karte waechst auf '
            + 'die 433 px ihrer Tabelle, und `.ds-sec { overflow-x: '
            + 'hidden }` schneidet den Ueberhang ab — ohne Rollbalken');
        assert.match(regel[1], /min-width:\s*0/,
            'die Regel steht noch da, aber ohne `min-width: 0` — dann '
            + 'tut sie nichts gegen den Zuschnitt');
    });

    it('der Abschnitt darueber schneidet wirklich ab', () => {
        // Die Begruendung der Regel oben haengt daran. Stuende .ds-sec
        // auf sichtbar, waere der Ueberhang nur haesslich statt
        // unerreichbar — und die Zusicherung erzaehlte eine falsche
        // Geschichte.
        assert.match(bausteine, /\.ds-sec\s*\{[^}]*overflow(?:-x)?:\s*hidden/,
            '.ds-sec (css/components.css) schneidet nicht mehr ab — dann stimmt die '
            + 'Begruendung von `.arc-inline-list > * { min-width: 0 }` '
            + 'nicht mehr, und sie gehoert neu geschrieben');
    });
});

describe('Der Spaltenplan des Telefons', () => {

    it('der Telefonblock existiert ueberhaupt', () => {
        assert.ok(TELEFON && TELEFON.length > 100,
            '@media (max-width: 620px) ist weg oder leer — dann gilt auf '
            + 'dem Telefon der Schreibtischplan mit 433 px');
    });

    it('die Sammelregel ab Spalte 3 hat eine obere Grenze', () => {
        const offen = /\.arc-mu-table (?:th|td):nth-child\(n\+3\)\s*(?!:nth-child)[,{]/
            .test(TELEFON.replace(/\s+/g, ' '));
        assert.ok(!offen,
            'im Telefonblock steht wieder `nth-child(n+3)` ohne '
            + '`:nth-child(-n+6)`. Diese Regel steht spaeter in der Datei '
            + 'als die Grundbreiten und hat dieselbe Spezifitaet — sie '
            + 'nimmt den Major-Spalten ihre 58 und 66 px wieder weg, und '
            + 'ihre Ueberschriften laufen ueber (gemessen: 46 bzw. 57 px '
            + 'Text in einer 42 px breiten Zelle)');
    });

    it('alle acht Spalten bekommen im Telefonblock eine Breite', () => {
        const b = spaltenbreiten(TELEFON);
        const fehlend = [1, 2, 3, 4, 5, 6, 7, 8].filter(s => !b[s]);
        assert.deepStrictEqual(fehlend, [],
            `im Telefonblock fehlen Breiten fuer Spalte ${fehlend.join(', ')} — `
            + 'die Tabelle steht auf `table-layout: fixed` und verteilt den '
            + 'Rest dann selbst; genau so bekam die Deckspalte einmal 25 px');
    });

    it('die acht Breiten summieren sich auf hoechstens die Kartenbreite', () => {
        const b = spaltenbreiten(TELEFON);
        const summe = [1, 2, 3, 4, 5, 6, 7, 8].reduce((a, s) => a + (b[s] || 0), 0);
        assert.ok(summe <= KARTE_412,
            `die Telefonspalten summieren sich auf ${summe} px, die Karte `
            + `ist auf einem 440-px-Telefon aber nur ${KARTE_412} px breit `
            + `(gemessen 03.09.2026). Der Rest rollt seitlich weg — genau `
            + `der gemeldete Befund. Einzelbreiten: `
            + [1, 2, 3, 4, 5, 6, 7, 8].map(s => `${s}=${b[s]}`).join(' '));
    });

    it('die Major-Spalten bleiben breiter als die Zaehlspalten', () => {
        const b = spaltenbreiten(TELEFON);
        assert.ok(b[7] > b[6] && b[8] > b[7],
            `Spalte 7 (${b[7]}) und 8 (${b[8]}) sind nicht mehr breiter als `
            + `die Zaehlspalte (${b[6]}). Ihre Ueberschriften sind die `
            + 'laengsten der Tabelle — "MAJOR-MATCHES" braucht 57 px, "T" '
            + 'braucht 7');
    });

    it('der Telefonblock laesst die Mindestbreite der Tabelle los', () => {
        // Sonst zieht `min-width: 433px` die Tabelle wieder ueber die
        // Karte hinaus, egal wie schmal die Spalten gesetzt sind.
        assert.match(TELEFON,
            /\.arc-card \.mobile-table-scroll \.arc-mu-table\s*\{[^}]*min-width:\s*0/,
            'im Telefonblock steht kein `min-width: 0` fuer die Tabelle — '
            + 'oder es steht mit zu schwachem Selektor da. Die Grundregel '
            + 'ist `#currentMetaContent .arc-card .mobile-table-scroll '
            + '.arc-mu-table` (1,2,1); ein Selektor ohne `.arc-card` '
            + 'liegt bei (1,1,1) und verliert stillschweigend');
    });

    it('die Grundregel mit den 433 px steht weiterhin da', () => {
        // Gegenprobe zur Absicht: die Mindestbreite wird auf dem Telefon
        // losgelassen, nicht abgeschafft. Auf dem Schreibtisch haelt sie
        // die Deckspalte davon ab, auf 25 px zusammenzufallen.
        assert.match(css, /\.mobile-table-scroll \.arc-mu-table[^{]*\{[^}]*min-width:\s*433px/,
            'die Mindestbreite der Tabelle ist ganz verschwunden — auf '
            + 'dem Schreibtisch draengt der Browser die Deckspalte dann '
            + 'wieder zusammen');
    });
});
