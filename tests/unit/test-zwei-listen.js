/**
 * ZWEI LISTEN NEBENEINANDER — P(≥6 Siege) statt gewichteter Win Rate
 *
 * ANLASS (05.09.2026). Der Betreiber auf die Frage nach der
 * Eingriffstiefe: "Zwei Listen nebeneinander" — Max Consistency gegen
 * die getechte Variante, "beide Kennzahlen darunter", Hauptzahl
 * P(≥6 Siege), erwartete Siege als Stützzeile.
 *
 * Die beiden Spalten gab es schon: Vanilla gegen "Your Build". Was
 * fehlte, war die Zahl, an der man die Entscheidung trifft.
 * "+6,2 Punkte gewichtete Win Rate" beantwortet nicht die Frage, die am
 * Turniertag zählt.
 *
 * Was hier bewacht wird:
 *
 *  1. Die RECHNUNG. Sie ist unabhängig nachgeprüft — gegen 400.000
 *     Monte-Carlo-Läufe und gegen ein Binomial. Die Zusagen unten
 *     rechnen sie erneut, statt der Datei zu glauben.
 *  2. Die BEGRÜNDUNG. Im Kommentar stand zuerst, die Faltung sei einem
 *     Binomial überlegen, weil sie die Streuung nicht wegmittle. Das
 *     ist falsch — bei unabhängiger Ziehung je Runde kommt dieselbe
 *     Zahl heraus. Eine falsche Begründung im Kommentar ist schlimmer
 *     als keine: sie hält den nächsten Leser vom Nachsehen ab. Dieselbe
 *     Lehre steht schon bei poissonP in app-meta-call.js.
 *  3. Der VORBEHALT. Unentschieden zählen nicht als Sieg. Ohne diesen
 *     Satz liest sich die Zahl wie das Punktemodell des Meta Calls, und
 *     das ist sie nicht.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { describe, it } = require('node:test');

const WURZEL = path.join(__dirname, '..', '..');
const lies = (...p) => fs.readFileSync(path.join(WURZEL, ...p), 'utf8');
const QUELLE = lies('js', 'app-current-meta-analysis.js');
const I18N   = lies('js', 'i18n.js');
const CSS    = lies('css', 'current-meta-matchups.css');

/* Die Faltung aus der Quelle herausschneiden und wirklich ausführen —
   nicht ihren Text prüfen. Ein Test, der nur nach Zeichenketten sucht,
   hätte den Vorzeichenfehler nicht gefunden, um den es hier geht. */
function faltung() {
    const m = /const punktVerteilung = \(quoteVon\) => \{([\s\S]*?)\n {12}\};/.exec(QUELLE);
    assert.ok(m, 'punktVerteilung ist nicht mehr auffindbar');
    const rumpf = m[1];
    const RUNDEN = Number(/const RUNDEN = (\d+)/.exec(QUELLE)[1]);
    const K = Number(/PUNKTE_FUER_TAG2 = (\d+)/.exec(QUELLE)[1]);
    return (paired, quoteVon, pU = 0) => {
        const totalShare = paired.reduce((s, o) => s + o.fieldShare, 0);
        const fn = new Function('paired', 'totalShare', 'RUNDEN', 'PUNKTE_FUER_TAG2',
                                'pUnentschieden', 'quoteVon',
            'const punktVerteilung = (q) => {' + rumpf + '}; return punktVerteilung(quoteVon);');
        return fn(paired, totalShare, RUNDEN, K, pU, quoteVon);
    };
}

/* Rundenzahl und Punktschwelle, wie sie im Quelltext stehen. */
const RUNDEN_IST = Number(/const RUNDEN = (\d+)/.exec(QUELLE)[1]);
const PUNKTE_IST = Number(/PUNKTE_FUER_TAG2 = (\d+)/.exec(QUELLE)[1]);

const FELD = [
    { fieldShare: 14, wr: 42, userWr: 48 },
    { fieldShare: 9,  wr: 61, userWr: 61 },
    { fieldShare: 8,  wr: 38, userWr: 38 },
    { fieldShare: 7,  wr: 55, userWr: 55 },
    { fieldShare: 6,  wr: 47, userWr: 47 },
    { fieldShare: 5,  wr: 70, userWr: 70 },
    { fieldShare: 51, wr: 50, userWr: 50 },
];

describe('Zwei Listen nebeneinander', () => {

    it('die Punktfaltung stimmt gegen eine unabhängig gerechnete Trinomialsumme', () => {
        /* Unabhängig nachgebaut: über alle (Siege, Unentschieden), die
           in RUNDEN Runden möglich sind, mit der Multinomialformel —
           kein Nachbau der Faltung, sondern eine andere Rechenart für
           dasselbe Ergebnis. */
        const f = faltung();
        const T = FELD.reduce((s, o) => s + o.fieldShare, 0);
        const schnitt = FELD.reduce((s, o) => s + o.wr * o.fieldShare, 0) / T / 100;

        const fak = (n) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
        for (const pU of [0, 0.009, 0.11, 0.153]) {
            const ist = f(FELD, (o) => o.wr, pU);
            const pS = (1 - pU) * schnitt, pN = (1 - pU) * (1 - schnitt);
            let soll = 0;
            for (let sg = 0; sg <= RUNDEN_IST; sg++) {
                for (let u = 0; u + sg <= RUNDEN_IST; u++) {
                    if (3 * sg + u < PUNKTE_IST) continue;
                    const n = RUNDEN_IST - sg - u;
                    soll += fak(RUNDEN_IST) / (fak(sg) * fak(u) * fak(n))
                          * Math.pow(pS, sg) * Math.pow(pU, u) * Math.pow(pN, n);
                }
            }
            soll *= 100;
            assert.ok(Math.abs(ist - soll) < 0.01,
                `bei U=${(pU*100).toFixed(1)} %: Faltung ${ist.toFixed(3)} % gegen Trinomial ${soll.toFixed(3)} %`);
        }
    });

    it('die Punktzählung ist die vorsichtigere — gemessen, nicht behauptet', () => {
        /* GENAU DIESER SATZ stand hier vorher als Kommentar über der
           SIEGZÄHLUNG und war die Umkehrung der Wahrheit. Deshalb wird
           er jetzt gerechnet: bei jeder realistischen Unentschieden-
           quote muss "≥19 Punkte" unter "≥6 Siege" liegen. */
        const f = faltung();
        const T = FELD.reduce((s, o) => s + o.fieldShare, 0);
        const schnitt = FELD.reduce((s, o) => s + o.wr * o.fieldShare, 0) / T / 100;
        const binom = (k, n, p) => {
            let lp = 0;
            for (let i = 1; i <= k; i++) lp += Math.log(n - k + i) - Math.log(i);
            return Math.exp(lp + k * Math.log(p) + (n - k) * Math.log1p(-p));
        };
        let pSiege = 0;
        for (let k = 6; k <= RUNDEN_IST; k++) pSiege += binom(k, RUNDEN_IST, schnitt);
        pSiege *= 100;

        for (const pU of [0, 0.009, 0.05, 0.11, 0.153]) {
            const pPunkte = f(FELD, (o) => o.wr, pU);
            assert.ok(pPunkte < pSiege,
                `bei U=${(pU*100).toFixed(1)} % liegt die Punktzählung mit ${pPunkte.toFixed(2)} % ` +
                `ÜBER der Siegzählung (${pSiege.toFixed(2)} %) — dann ist sie nicht die vorsichtigere`);
        }

        /* Und die Behauptung, die den Fehler ausgelöst hat, direkt
           nachgerechnet: 5-2-2 hat 17 Punkte, nicht 19. */
        assert.strictEqual(3 * 5 + 2, 17, 'die Punkteregel ist nicht mehr Sieg 3 / Unentschieden 1');
        assert.strictEqual(3 * 6 + 1, 19, '6-2-1 ergibt keine 19 Punkte mehr');
    });

    it('die Punktschwelle stimmt mit der des Meta Calls überein', () => {
        /* MAJOR_DAY2_POINTS lebt als Modulkonstante in app-meta-call.js
           und lässt sich nicht importieren. Diese Zusicherung ist der
           Ersatz: driftet eine der beiden Fassungen, fällt sie auf. */
        const mc = lies('js', 'app-meta-call.js');
        const m = /const MAJOR_DAY2_POINTS = \{([^}]*)\}/.exec(mc);
        assert.ok(m, 'MAJOR_DAY2_POINTS ist in app-meta-call.js nicht mehr auffindbar');
        const tabelle = {};
        m[1].split(',').forEach(t => {
            const kv = /(\d+)\s*:\s*(\d+)/.exec(t);
            if (kv) tabelle[+kv[1]] = +kv[2];
        });
        assert.strictEqual(tabelle[RUNDEN_IST], PUNKTE_IST,
            `dieser Block rechnet mit ${PUNKTE_IST} Punkten aus ${RUNDEN_IST} Runden, ` +
            `Meta Call mit ${tabelle[RUNDEN_IST]}`);
    });

    it('die Randfälle stimmen', () => {
        const f = faltung();
        assert.ok(Math.abs(f([{ fieldShare: 1, wr: 100 }], (o) => o.wr) - 100) < 1e-6,
            'bei 100 % Siegquote ist die volle Punktzahl nicht sicher');
        assert.ok(f([{ fieldShare: 1, wr: 0 }], (o) => o.wr) < 1e-9,
            'bei 0 % Siegquote kommen trotzdem 19 Punkte heraus');
        /* Nur Unentschieden: neun Runden mal ein Punkt sind neun —
           das reicht für 19 nie, egal wie gut die Quote wäre. */
        assert.ok(f([{ fieldShare: 1, wr: 100 }], (o) => o.wr, 1) < 1e-9,
            'aus lauter Unentschieden entstehen 19 Punkte');
        /* Quoten ausserhalb 0..100 duerfen die Rechnung nicht sprengen —
           `userWr` wird oben mit einem Bonus verrechnet und ist deshalb
           nicht garantiert im Band. */
        const k = f([{ fieldShare: 1, wr: 140 }], (o) => o.wr);
        assert.ok(Math.abs(k - 100) < 1e-6, `140 % Quote ergibt ${k} statt 100`);
        const n = f([{ fieldShare: 1, wr: -20 }], (o) => o.wr);
        assert.ok(n < 1e-9, `-20 % Quote ergibt ${n} statt 0`);
    });

    it('eine bessere Liste bekommt eine höhere Wahrscheinlichkeit', () => {
        const f = faltung();
        const vanilla = f(FELD, (o) => o.wr);
        const user    = f(FELD, (o) => o.userWr);
        assert.ok(user > vanilla,
            `die getechte Liste steht bei ${user.toFixed(2)} %, die Vanilla bei ${vanilla.toFixed(2)} %`);
        /* Und der Unterschied ist gross genug, um ihn ueberhaupt
           anzuzeigen — sonst waere die ganze Spalte Zierde. Sechs
           Punkte Win Rate im groessten Matchup bewegen die Zahl. */
        assert.ok(user - vanilla > 0.5,
            `nur ${(user - vanilla).toFixed(2)} pp Unterschied bei +6 pts im 14-%-Matchup`);
    });

    it('der Kommentar behauptet keine Überlegenheit über das Binomial', () => {
        /* Genau das stand dort zuerst, und es war nachweislich falsch.
           Dieselbe Lehre wie bei poissonP: eine falsche Begründung ist
           schlimmer als gar keine, weil sie den nächsten Leser vom
           Nachsehen abhält. */
        const block = QUELLE.slice(
            QUELLE.indexOf('ZWEI LISTEN NEBENEINANDER'),
            QUELLE.indexOf('const RUNDEN = 9'));
        /* Der Kommentar ZITIERT den widerlegten Satz absichtlich, um zu
           sagen, dass er falsch war — geprüft wird deshalb, dass er
           nicht mehr als Begründung DASTEHT, sondern als Korrektur. */
        const ohneZeilenumbruch = block.replace(/\s*\n\s*\*\s*/g, ' ');
        assert.ok(/HIER STAND EIN FALSCHER SATZ/.test(ohneZeilenumbruch),
            'die Korrektur fehlt — dann steht die widerlegte Begründung wieder unmarkiert da');
        assert.ok(/Das stimmt nicht/.test(ohneZeilenumbruch),
            'der Kommentar sagt nicht, dass die alte Begründung falsch war');
        assert.ok(/dieselbe Zahl|Monte-Carlo/.test(block),
            'der Kommentar sagt nicht, dass Faltung und Binomial dasselbe liefern');
    });

    it('der Vorbehalt steht in der Oberfläche, nicht nur im Kommentar', () => {
        for (const key of ['matchup.uvTag2Label', 'matchup.uvTag2Siege',
                           'matchup.uvTag2Titel', 'matchup.uvTag2Fuss']) {
            const n = (I18N.match(new RegExp("'" + key.replace('.', '\\.') + "'", 'g')) || []).length;
            assert.strictEqual(n, 2, `${key} fehlt in einer der beiden Sprachen`);
        }
        /* Der Fußtext muss die GEMESSENE Unentschiedenquote nennen —
           sie ist die größte Stellschraube der Rechnung, weil ein
           Unentschieden einen Punkt bringt. Ein fester Text ohne
           Platzhalter hieße: die Zahl steht nirgends. */
        assert.ok(/uvTag2Fuss[\s\S]{0,300}\{u\}/.test(I18N),
            'der Fußtext nennt die gemessene Unentschiedenquote nicht');
        assert.match(QUELLE, /uvTag2Fuss'\)\.replace\('\{u\}'/,
            'der Platzhalter im Fußtext wird nicht gefüllt');
        assert.ok(/Auf Präsenzturnieren wird viel öfter unentschieden gespielt/.test(I18N),
            'der deutsche Hinweis auf die höhere Präsenzquote fehlt');
        assert.ok(/Live events tie far more often/.test(I18N),
            'der englische Hinweis auf die höhere Präsenzquote fehlt');

        /* UND DER ALTE, FALSCHE SATZ DARF NICHT ZURÜCKKOMMEN.
           Er stand wörtlich auf der Seite und behauptete, 5-2-2 habe
           19 Punkte (es sind 17) und die Siegzählung sei die
           vorsichtigere (sie war um Faktor 2,6 großzügiger). */
        assert.ok(!/5-2-2 sind beide 19 Punkte/.test(I18N),
            'der widerlegte Satz über 5-2-2 steht wieder in der Oberfläche');
        assert.ok(!/5-2-2 are both 19 points/.test(I18N),
            'der widerlegte Satz über 5-2-2 steht wieder in der englischen Oberfläche');

        /* Das Etikett muss die Rundenzahl UND die Schwelle nennen —
           eine Wahrscheinlichkeit ohne ihren Nenner ist Hausregel. */
        assert.ok(/uvTag2Label[\s\S]{0,80}\{n\}[\s\S]{0,40}\{k\}/.test(I18N),
            'das Etikett nennt nicht Rundenzahl und Schwelle');
    });

    it('beide Listen und ihr Unterschied stehen nebeneinander', () => {
        assert.match(QUELLE, /uv-tag2-block/, 'der Block fehlt');
        const block = QUELLE.slice(QUELLE.indexOf('uv-tag2-block'),
                                   QUELLE.indexOf('uv-tag2-fuss'));
        const spalten = (block.match(/uv-tag2-spalte/g) || []).length;
        assert.strictEqual(spalten, 3,
            `${spalten} Spalten statt drei (Vanilla, deine Liste, Unterschied)`);
        assert.match(block, /pVanilla/, 'die Vanilla-Wahrscheinlichkeit fehlt');
        assert.match(block, /pUser/, 'die Wahrscheinlichkeit der eigenen Liste fehlt');
        assert.match(block, /pDelta/, 'der Unterschied fehlt');
        /* Die Stuetzzeile — erwartete Siege — muss unter JEDER Spalte
           stehen, sonst ist sie eine Zierde an einer Stelle. */
        assert.strictEqual((block.match(/uvTag2Siege/g) || []).length, 3,
            'die erwarteten Siege stehen nicht unter allen drei Spalten');
    });

    it('die Zahlen fluchten untereinander', () => {
        /* Drei Prozentwerte, die gegeneinander tanzen, machen genau den
           Vergleich schwer, um den es geht. */
        assert.match(CSS, /\.uv-tag2-wert[\s\S]{0,200}tabular-nums/,
            'die Werte stehen nicht in Tabellenziffern');
        assert.match(CSS, /\.uv-tag2-stuetze[\s\S]{0,160}tabular-nums/,
            'die Stützzeile steht nicht in Tabellenziffern');
    });

    it('die drei Spalten lassen sich nachrechnen', () => {
        /* GEFUNDEN BEIM HINSEHEN, nicht von einer Zusicherung: live
           stand da Vanilla 19,1 %, Dein Build 21,5 %, Delta +2,5 pp.
           19,1 + 2,5 ist 21,6. Zwei getrennte Rundungen — die Spalten
           runden je fuer sich, das Delta rundete die ungerundete
           Differenz. Beide Zahlen fuer sich richtig, nebeneinander
           unbrauchbar.

           Die Zusicherung rechnet das nach, statt den Quelltext
           abzugrasen: sie baut die Rundung nach und prueft, dass die
           angezeigte Differenz die Differenz der angezeigten Werte
           IST — an genau den Werten, die den Fehler ausgeloest haben,
           und an einer Reihe zufaelliger Paare. */
        const auf1 = (v) => Math.round(v * 10) / 10;
        const zeig = (v) => v.toFixed(1);

        const paare = [[19.06, 21.54], [46.54, 48.04], [50.0, 50.0],
                       [12.349, 12.351], [33.35, 30.05], [7.04, 6.96]];
        for (let i = 0; i < 300; i++) {
            paare.push([Math.random() * 100, Math.random() * 100]);
        }

        for (const [a, b] of paare) {
            const gezeigtA = zeig(auf1(a));
            const gezeigtB = zeig(auf1(b));
            const gezeigtD = zeig(auf1(b) - auf1(a));
            const nachgerechnet = zeig(parseFloat(gezeigtB) - parseFloat(gezeigtA));
            assert.strictEqual(gezeigtD, nachgerechnet,
                `${gezeigtB} - ${gezeigtA} liest sich als ${nachgerechnet}, ` +
                `angezeigt wird aber ${gezeigtD}`);
        }

        /* Und der Quelltext muss diese Rundung auch wirklich benutzen —
           fuer BEIDE Zeilen des Blocks und fuer die Kopfzeile darueber. */
        assert.match(QUELLE, /const auf1 = \(v\) => Math\.round\(v \* 10\) \/ 10;/,
            'die Rundung auf die angezeigte Stelle fehlt');
        assert.match(QUELLE, /const delta\s*=\s*auf1\(userWr\) - auf1\(vanillaWr\)/,
            'die Kopfzeile bildet die Differenz weiterhin ungerundet');
        assert.match(QUELLE, /const pDelta\s*=\s*auf1\(pUser\) - auf1\(pVanilla\)/,
            'die Prozentspalte bildet die Differenz weiterhin ungerundet');
        assert.match(QUELLE, /const sDelta\s*=\s*auf1\(sUser\) - auf1\(sVanilla\)/,
            'die erwarteten Siege bilden die Differenz weiterhin ungerundet');
        assert.ok(!/signed\(sUser - sVanilla\)/.test(QUELLE),
            'die alte ungerundete Differenz steht noch in der Ausgabe');
    });

    it('beide Richtungen der Matchup-Datei werden gelesen', () => {
        /* BEFUND (Agententeam B, 06.09.2026, nachgemessen an den echten
           Daten). Dieser Block las nur Zeilen mit unserem Deck in der
           Spalte `deck_name`. Die Datei führt ein Paar aber nicht immer
           beidseitig: für Mega Excadrill standen 20 Gegner vorwärts
           (74,16 % des Feldes) und 78 nur rückwärts (25,42 %). Der
           Nenner wurde über den Rest normiert — die Zahl sah vollständig
           aus. Weggeworfen wurden dabei die SCHLECHTESTEN Matchups:
           Ethan's Typhlosion 19,0 % auf 100 Partien, Ceruledge 22,5 %
           auf 80.

           Die Zusicherung greift die Einlesestelle aus dem Quelltext und
           lässt sie laufen, statt nach Stichworten zu suchen. */
        const anfang = QUELLE.indexOf('const _bilanzAus = (txt) =>');
        /* Ab `anfang` gesucht — dieselbe Zeile steht weiter oben in
           einem anderen Block, und von dort aus wäre der Ausschnitt
           leer. */
        const ende   = QUELLE.indexOf("if (Object.keys(wrByOpp).length === 0)", anfang);
        assert.ok(anfang >= 0 && ende > anfang, 'die Einlesestelle wurde nicht gefunden');
        const stueck = QUELLE.slice(anfang, ende);

        const lies_ = new Function('rows', 'target', 'stripped', 'parseWr',
            stueck + ' return wrByOpp;');
        const parseWr = (x) => parseFloat(String(x).replace('%', '').replace(',', '.'));

        const rows = [
            // vorwärts: wir gegen A
            { deck_name: 'Mega Excadrill', opponent: 'Deck A', win_rate: '60.0%', record: '6 - 4 - 0' },
            // nur rückwärts: B gegen uns — muss gespiegelt ankommen
            { deck_name: 'Deck B', opponent: 'Mega Excadrill', win_rate: '81.0%', record: '81 - 19 - 5' },
            // fremdes Paar, geht uns nichts an
            { deck_name: 'Deck C', opponent: 'Deck D', win_rate: '50.0%', record: '5 - 5 - 0' },
        ];
        const w = lies_(rows, 'mega excadrill', 'mega excadrill', parseWr);

        assert.ok(w['deck a'], 'die Vorwärtszeile fehlt');
        assert.ok(w['deck b'], 'die Rückwärtszeile wird weiterhin weggeworfen');
        assert.ok(!w['deck c'] && !w['deck d'], 'ein fremdes Paar wurde eingelesen');

        assert.strictEqual(w['deck a'].wr, 60, 'die Vorwärtsquote wurde verändert');
        assert.strictEqual(w['deck b'].wr, 19, 'die Rückwärtsquote wurde nicht gespiegelt (81 → 19)');

        /* Die Bilanz muss mitgespiegelt werden: aus ihren Siegen werden
           unsere Niederlagen. Unentschieden bleiben Unentschieden —
           daran hängt die gemessene Unentschiedenquote. */
        assert.deepStrictEqual(w['deck b'].bilanz, { s: 19, n: 81, u: 5 },
            'die Bilanz wurde nicht oder falsch gespiegelt');
        assert.deepStrictEqual(w['deck a'].bilanz, { s: 6, n: 4, u: 0 },
            'die Vorwärtsbilanz wurde verändert');

        /* Steht ein Paar in BEIDEN Richtungen, gewinnt die
           Vorwärtszeile — egal in welcher Reihenfolge die Datei sie
           bringt. An den echten Daten sind beide deckungsgleich (größte
           Abweichung 0,000 pp über 20 Gegner), aber die Regel muss
           trotzdem eindeutig sein. */
        for (const reihenfolge of [[0, 1], [1, 0]]) {
            const beide = [
                { deck_name: 'Mega Excadrill', opponent: 'Deck E', win_rate: '40.0%', record: '4 - 6 - 0' },
                { deck_name: 'Deck E', opponent: 'Mega Excadrill', win_rate: '60.0%', record: '6 - 4 - 0' },
            ];
            const w2 = lies_(reihenfolge.map(i => beide[i]), 'mega excadrill', 'mega excadrill', parseWr);
            assert.strictEqual(w2['deck e'].richtung, 'vor',
                `bei Reihenfolge ${reihenfolge} gewinnt nicht die Vorwärtszeile`);
            assert.strictEqual(w2['deck e'].wr, 40, 'die Vorwärtsquote wurde überschrieben');
        }
    });

    it('die Unentschiedenquote wird gemessen und nicht geraten', () => {
        /* Sie ist die größte Stellschraube: ein Unentschieden bringt
           einen Punkt, und die Chance auf Tag 2 hängt an Punkten. Eine
           feste Zahl im Quelltext wäre hier der größte Fehler. */
        const anfang = QUELLE.indexOf('let uGew = 0, uNenner = 0;');
        const ende   = QUELLE.indexOf('const punktVerteilung');
        assert.ok(anfang >= 0 && ende > anfang, 'die Messstelle wurde nicht gefunden');
        const stueck = QUELLE.slice(anfang, ende);
        const messen = new Function('paired', 'totalShare',
            stueck + ' return pUnentschieden;');

        /* Nach Feldanteil gewichtet, nicht als roher Durchschnitt. */
        const feld = [
            { fieldShare: 90, bilanz: { s: 50, n: 50, u: 0 } },   // 0 %, 90 % des Feldes
            { fieldShare: 10, bilanz: { s: 45, n: 45, u: 10 } },  // 10 %, 10 % des Feldes
        ];
        const ist = messen(feld, 100);
        assert.ok(Math.abs(ist - 0.01) < 1e-9,
            `gewichtet müssten 1,0 % herauskommen, es sind ${(ist * 100).toFixed(3)} %`);

        /* Gegner ohne Bilanz dürfen den Nenner nicht verwässern —
           sonst zöge jede fehlende Bilanz die Quote gegen null. */
        const mitLuecke = [
            { fieldShare: 50, bilanz: { s: 45, n: 45, u: 10 } },
            { fieldShare: 50, bilanz: null },
        ];
        assert.ok(Math.abs(messen(mitLuecke, 100) - 0.10) < 1e-9,
            'ein Gegner ohne Bilanz zieht die gemessene Quote nach unten');

        /* Ganz ohne Bilanzen: null, nicht NaN. */
        assert.strictEqual(messen([{ fieldShare: 1, bilanz: null }], 1), 0,
            'ohne jede Bilanz entsteht keine 0, sondern etwas anderes');
    });
});
