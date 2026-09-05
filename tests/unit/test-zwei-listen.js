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
    const m = /const siegVerteilung = \(quoteVon\) => \{([\s\S]*?)\n {12}\};/.exec(QUELLE);
    assert.ok(m, 'siegVerteilung ist nicht mehr auffindbar');
    const rumpf = m[1];
    const RUNDEN = Number(/const RUNDEN = (\d+)/.exec(QUELLE)[1]);
    const K = Number(/SIEGE_FUER_TAG2 = (\d+)/.exec(QUELLE)[1]);
    return (paired, quoteVon) => {
        const totalShare = paired.reduce((s, o) => s + o.fieldShare, 0);
        const fn = new Function('paired', 'totalShare', 'RUNDEN', 'SIEGE_FUER_TAG2', 'quoteVon',
            'const siegVerteilung = (q) => {' + rumpf + '}; return siegVerteilung(quoteVon);');
        return fn(paired, totalShare, RUNDEN, K, quoteVon);
    };
}

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

    it('die Faltung stimmt gegen ein unabhängig gerechnetes Binomial', () => {
        const f = faltung();
        const ist = f(FELD, (o) => o.wr);
        const T = FELD.reduce((s, o) => s + o.fieldShare, 0);
        const schnitt = FELD.reduce((s, o) => s + o.wr * o.fieldShare, 0) / T / 100;
        const binom = (k, n, p) => {
            let lp = 0;
            for (let i = 1; i <= k; i++) lp += Math.log(n - k + i) - Math.log(i);
            return Math.exp(lp + k * Math.log(p) + (n - k) * Math.log1p(-p));
        };
        let soll = 0;
        for (let k = 6; k <= 9; k++) soll += binom(k, 9, schnitt);
        soll *= 100;
        assert.ok(Math.abs(ist - soll) < 0.01,
            `Faltung ${ist.toFixed(3)} % gegen Binomial ${soll.toFixed(3)} %`);
    });

    it('die Randfälle stimmen', () => {
        const f = faltung();
        assert.ok(Math.abs(f([{ fieldShare: 1, wr: 100 }], (o) => o.wr) - 100) < 1e-6,
            'bei 100 % Siegquote sind neun Siege nicht sicher');
        assert.ok(f([{ fieldShare: 1, wr: 0 }], (o) => o.wr) < 1e-9,
            'bei 0 % Siegquote kommen trotzdem sechs Siege heraus');
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
        assert.ok(/Unentschieden zählen hier nicht als Sieg/.test(I18N),
            'der deutsche Vorbehalt zu Unentschieden fehlt');
        assert.ok(/Ties are not counted as wins/.test(I18N),
            'der englische Vorbehalt zu Unentschieden fehlt');
        /* Das Etikett muss die Rundenzahl UND die Schwelle nennen —
           "P(≥6 Siege)" allein ist ohne Nenner. */
        assert.ok(/uvTag2Label[\s\S]{0,80}\{k\}[\s\S]{0,40}\{n\}/.test(I18N),
            'das Etikett nennt nicht Schwelle und Rundenzahl');
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
});
