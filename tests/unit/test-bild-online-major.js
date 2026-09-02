'use strict';
/*
 * Das geteilte Bild traegt dieselben Zahlen wie die Karte.
 *
 * ANLASS (02.09.2026)
 * -------------------
 * Betreiber: "im generiertem Bild fehlen die Daten voellig."
 *
 * Zu Recht. Die Karte trug seit dem 01.09. vier Kacheln mit online UND
 * Major; das Bild daneben zeigte weiter nur die drei alten Zahlen. Und das
 * Bild ist die Fassung, die die Seite VERLAESST — wer es teilte, teilte den
 * halben Befund.
 *
 * Beim Nachziehen kamen zwei aeltere Funde aus der Pruefrunde mit, weil sie
 * in derselben Datei sitzen:
 *
 * 1  DAS BILD ZEIGTE DIE ZAHL, DIE DIE KARTE AUFGEGEBEN HAT.
 *    Gross stand "-48,9 %" unter "Top-8 gegen Erwartung" — genau die
 *    Darstellung, die die Karte am 01.09. abgeloest hat, weil sie gemeldet
 *    wurde ("den Bereich verstehe ich noch nicht so ganz"). Es war kein
 *    Prozentsatz einer Quote, sondern der Vergleich zweier Quoten, und er
 *    stand mit Prozentzeichen neben zwei echten Prozentwerten. Wer ihn als
 *    "erreicht in 49 % der Faelle die Top 8" las, lag um den Faktor
 *    sechzehn daneben (echt: 3,00 %).
 *
 * 2  "META GESAMT 7.178" WAR EIN FALSCHER NENNER.
 *    `totalBrought` ist die Summe von `total_brought_weighted` — der Nenner
 *    der TOP-8-QUOTE, also nur die Antritte auf Turnieren mit gewertetem
 *    Schnitt. Neben einem Anteil von 7,55 % und unter der Zeile "Meta
 *    gesamt" gelesen ist das der Nenner dieses Anteils, und der ist 37.749.
 *    Faktor fuenf.
 *
 * Das Bild wurde nach jedem Schritt wirklich gezeichnet und angesehen,
 * nicht nur der Code gelesen — DC.STATS musste von 128 auf 150 wachsen,
 * sonst waere die dritte Zeile (Praesenz) auf y = 200 in den Koerper
 * gelaufen, der bei 192 anfaengt.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const wurzel = path.join(__dirname, '..', '..');
const lies = (p) => fs.readFileSync(path.join(wurzel, p), 'utf8');
const ohneKomm = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, '');

const bild = lies(path.join('js', 'ds-share.js'));
const bildK = ohneKomm(bild);
const karte = ohneKomm(lies(path.join('js', 'app-archetype-card.js')));

describe('Die Praesenzzahlen erreichen das Bild', () => {

    it('die Karte gibt sie weiter', () => {
        for (const feld of ['majorShare', 'majorWinRate', 'majorPartien',
                            'majorAntritte', 'majorRemis', 'majorDay2']) {
            assert.ok(new RegExp(feld + ':').test(karte),
                `${feld} fehlt in factsFor() — dann kommt es nie im Bild an`);
        }
    });

    it('das Bild zeichnet sie', () => {
        // Auf die AUSGABE pruefen, nicht auf das Vorkommen des Feldes: die
        // erste Fassung blieb gruen, als die Bedingung auf `false` gesetzt
        // wurde — `spec.majorShare` stand ja weiter im isFinite() daneben.
        for (const [wachter, wo] of [
            ['hatMajorShare\n                ? \'Major \'', 'Anteil'],
            ['hatMajorWr\n                ? \'Major \'', 'Win Rate'],
        ]) {
            assert.ok(bildK.indexOf(wachter.replace(/\\n/g, '\n')) > 0,
                `die Major-Zeile der Spalte ${wo} haengt an einer anderen `
                + 'Bedingung als "es gibt einen Wert" — ein vorgeschaltetes '
                + 'false schaltet sie ab, ohne dass am Code etwas fehlt');
        }
        assert.ok(/isFinite\(spec\.majorDay2\)\s*\n\s*\? 'Day 2 \(Major\) '/.test(bildK),
            'die Day-2-Zeile wird im Bild nicht mehr gezeichnet');
    });

    it('die Remisquote steht mit auf dem Bild', () => {
        // Ohne sie liest sich "48,7 online gegen 44,1 Major" als Einbruch.
        // Am Major enden rund 11 % der Partien unentschieden, online 1,3 %.
        // Beide Stellen: die Pruefung UND die Ausgabe. Die erste Fassung
        // verlangte nur eine und blieb gruen, als die andere umbenannt wurde.
        const treffer = (bildK.match(/spec\.majorRemis/g) || []).length;
        assert.strictEqual(treffer, 2,
            `spec.majorRemis steht ${treffer}× im Bild, erwartet 2 (Pruefung `
            + 'und Ausgabe). Ohne die Remisquote liest sich "48,7 online gegen '
            + '44,1 Major" als Einbruch — am Major enden rund 11 % der Partien '
            + 'unentschieden, online 1,3 %');
        assert.ok(/unentsch\./.test(bild),
            'die Remisquote traegt keine Beschriftung mehr');
    });

    it('fehlende Praesenzdaten stehen als fehlend da, nicht als Null', () => {
        const treffer = (bildK.match(/Major: keine Daten/g) || []).length;
        assert.ok(treffer >= 2,
            `"Major: keine Daten" steht nur ${treffer}× im Bild — erwartet `
            + 'mindestens zwei (Anteil und Win Rate). Ohne den Text stuende '
            + 'dort nichts, und "war nicht dabei" saehe aus wie ein Fehler');
    });
});

describe('Der Statistikblock hat Platz fuer die dritte Zeile', () => {

    it('DC.STATS ist hoch genug', () => {
        const m = bildK.match(/HEAD:\s*(\d+),\s*STATS:\s*(\d+)/);
        assert.ok(m, 'die Masse des Statistikblocks sind verschwunden');
        const head = Number(m[1]), stats = Number(m[2]);
        // Die dritte Notiz sitzt auf HEAD + 136.
        const dritte = bildK.match(/DC\.HEAD \+ (\d+)\);\s*\}\s*\}/);
        const y = dritte ? Number(dritte[1]) : 136;
        assert.ok(head + stats >= head + y + 6,
            `der Block endet auf y = ${head + stats}, die dritte Zeile sitzt auf `
            + `${head + y} — sie laeuft in den Koerper darunter`);
    });

    it('die dritte Zeile wird nur gezeichnet, wenn es etwas zu sagen gibt', () => {
        assert.ok(/if \(note3\)/.test(bildK),
            'die dritte Zeile wird immer gezeichnet — dann kostet sie auch '
            + 'Hoehe, wenn nichts drinsteht');
    });
});

describe('Das Bild zeigt dieselbe Groesse wie die Karte', () => {

    it('die dritte Spalte zeigt die Quote, nicht den Vergleichswert', () => {
        assert.ok(!/signed\(spec\.perfPct, 1\) \+ ' %'/.test(bildK),
            'das Bild zeigt wieder gross den Vergleich zweier Quoten '
            + '("-48,9 %") statt der Quote selbst ("3,00 %"). Genau diese '
            + 'Darstellung hat die Karte am 01.09. abgeloest, weil sie '
            + 'gemeldet wurde — und das Bild ist die Fassung, die die Seite '
            + 'verlaesst');
        assert.ok(/num\(convQuote, 2\) \+ ' %'/.test(bildK),
            'die rohe Top-8-Quote steht nicht mehr gross im Bild');
    });

    it('der Feldschnitt steht daneben, roh wie die Quote', () => {
        // Zwei Zahlen, die sich nicht ineinander umrechnen lassen, sind
        // schlimmer als eine — dieselbe Begruendung wie auf der Karte.
        assert.ok(/convFeld/.test(bildK),
            'der Feldschnitt fehlt neben der Quote');
        assert.ok(/Schnitt aller Decks/.test(bild),
            'die Beschriftung des Feldschnitts weicht von der Karte ab');
    });

    it('die Beschriftungen nennen die Herkunft', () => {
        for (const s of ['Anteil am Meta · online', 'Top-8-Quote · online']) {
            assert.ok(bild.indexOf(s) > 0,
                `die Beschriftung "${s}" fehlt — dann steht im Bild eine Zahl `
                + 'ohne ihre Herkunft neben einer, die eine hat');
        }
    });
});

describe('Der Nenner in der Seitenspalte ist richtig benannt', () => {

    it('7.178 heisst nicht mehr "Meta gesamt"', () => {
        const i = bildK.indexOf('spec.totalBrought');
        assert.ok(i > 0, 'die Zeile ist verschwunden');
        const rumpf = bildK.slice(Math.max(0, i - 300), i + 200);
        assert.ok(!/Meta gesamt|Meta total/.test(rumpf),
            'die Summe der gewichteten Antritte heisst wieder "Meta gesamt". '
            + 'Sie ist der Nenner der TOP-8-QUOTE (7.178), nicht der des '
            + 'Anteils (37.749) — Faktor fuenf, und sie steht direkt neben '
            + 'einem Anteil');
        assert.ok(/Top-8-Schnitt|cut events/.test(rumpf),
            'die Zeile sagt nicht mehr, was sie zaehlt');
    });

    it('die Zahl selbst stimmt noch mit der Quelle ueberein', () => {
        // Wenn die Datei ihre Spalte aendert, ist die neue Beschriftung
        // genauso falsch wie die alte.
        const L = lies(path.join('data', 'online_tournament_top8_decks.csv'))
            .replace(/^﻿/, '').trim().split('\n');
        const kopf = L[0].split(';').map(s => s.trim());
        const iB = kopf.indexOf('total_brought_weighted');
        assert.ok(iB >= 0,
            'die Spalte total_brought_weighted gibt es nicht mehr — die '
            + 'Beschriftung "Antritte mit Top-8-Schnitt" gehoert dann neu bewertet');
        let summe = 0;
        for (const z of L.slice(1)) {
            const v = parseFloat((z.split(';')[iB] || '0').replace(',', '.'));
            if (Number.isFinite(v)) summe += v;
        }
        assert.ok(summe > 1000 && summe < 30000,
            `die Summe liegt bei ${Math.round(summe)} — ausserhalb des `
            + 'Bereichs, in dem sie als "Antritte auf Turnieren mit Schnitt" '
            + 'plausibel ist');
    });
});
